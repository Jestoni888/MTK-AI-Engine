// dex2oat.js - ART Compiler & JIT Manager (Full Performance Edition)
(function() {
    'use strict';

    const CONFIG_FILE = '/sdcard/MTK_AI_Engine/dex2oat.conf';
    
    // Full compiler filter list including aggressive options
    const FILTERS = [
        'speed',           // AOT compile ALL methods - max performance, max storage
        'speed-profile',   // Profile-guided AOT (balanced)
        'quicken',         // Optimize interpreter (Android ≤11)
        'verify',          // Verify only, no compilation
        'interpret-only',  // Pure interpretation, minimal storage
        'space',           // Optimize for storage over speed
        'space-profile',   // Space + profile guidance
        'time',            // Minimize compilation time (legacy)
        'everything'       // Aggressive: compile + inline + resolve all (if supported)
    ];
    
    // Advanced dex2oat flags for full compilation
    const ADVANCED_FLAGS = {
        '--compile-pic': 'Generate position-independent code',
        '--inline-depth=4': 'Maximum inlining depth for aggressive optimization',
        '--max-inline-inline-depth=4': 'Deep inlining for hot methods',
        '--resolve-startup-strings=true': 'Pre-resolve strings in startup methods',
        '--dump-cfg': 'Dump control flow graphs (debug)',
        '--dump-vmap': 'Dump variable mapping (debug)',
        '--generate-mini-debug-info=true': 'Minimal debug info for backtraces'
    };

    // Performance profiles
    const PROFILES = {
        'balanced': {
            name: '⚖️ Balanced (Default)',
            filter: 'speed-profile',
            jit: true,
            bgDexopt: true,
            threads: 4,
            heapXms: '256m',
            heapXmx: '512m',
            flags: []
        },
        'performance': {
            name: '🚀 Performance Mode',
            filter: 'speed',
            jit: true,
            bgDexopt: true,
            threads: 8,
            heapXms: '512m',
            heapXmx: '1024m',            flags: ['--resolve-startup-strings=true', '--generate-mini-debug-info=true']
        },
        'full': {
            name: '🔥 FULL COMPILER (Max Performance)',
            filter: 'everything',
            jit: false, // Disable JIT when using full AOT
            bgDexopt: false, // Manual control only
            threads: 16,
            heapXms: '1024m',
            heapXmx: '2048m',
            flags: Object.keys(ADVANCED_FLAGS).filter(f => 
                !f.includes('dump-') // Exclude debug dumps by default
            )
        },
        'battery': {
            name: '🔋 Battery Saver',
            filter: 'space-profile',
            jit: true,
            bgDexopt: false,
            threads: 2,
            heapXms: '128m',
            heapXmx: '256m',
            flags: []
        }
    };

    // State
    let currentFilter = 'speed-profile';
    let jitEnabled = true;
    let bgDexoptEnabled = true;
    let currentProfile = 'balanced';
    let customThreads = 4;
    let customHeapXms = '256m';
    let customHeapXmx = '512m';
    let selectedFlags = [];

    // Safe exec wrapper
    const execFn = window.exec || async function(cmd, timeout = 8000) {
        return new Promise(resolve => {
            const cb = `dex_exec_${Date.now()}_${Math.random().toString(36).substring(2)}`;
            const t = setTimeout(() => { delete window[cb]; resolve(''); }, timeout);
            window[cb] = (_, res) => { clearTimeout(t); delete window[cb]; resolve(res || ''); };
            if (window.ksu) ksu.exec(cmd, `window.${cb}`);
            else { clearTimeout(t); resolve(''); }
        });
    };

    async function init() {
        await loadConfig();
        bindClickHandler();    }

    async function loadConfig() {
        try {
            const raw = await execFn(`cat ${CONFIG_FILE} 2>/dev/null`);
            if (raw && raw.trim()) {
                raw.trim().split('\n').forEach(line => {
                    const [key, val] = line.split('=');
                    const v = val?.trim();
                    if (key === 'filter' && FILTERS.includes(v)) currentFilter = v;
                    if (key === 'jit') jitEnabled = v === '1';
                    if (key === 'bg_dexopt') bgDexoptEnabled = v === '1';
                    if (key === 'profile' && PROFILES[v]) currentProfile = v;
                    if (key === 'threads') customThreads = parseInt(v) || 4;
                    if (key === 'heap_xms') customHeapXms = v;
                    if (key === 'heap_xmx') customHeapXmx = v;
                    if (key === 'flags' && v) selectedFlags = v.split(',').filter(f => f);
                });
            }
        } catch (e) { console.warn('DEX2OAT: Config load failed:', e); }
    }

    function bindClickHandler() {
        const btn = document.getElementById('dex2oat-btn');
        if (!btn) { console.warn('DEX2OAT: #dex2oat-btn not found'); return; }
        btn.addEventListener('click', () => showDexModal());
    }

    function showDexModal() {
        const existing = document.getElementById('dex-modal');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = 'dex-modal';
        modal.style.cssText = `
            position: fixed; inset: 0; background: rgba(0,0,0,0.9); z-index: 10000;
            display: flex; align-items: center; justify-content: center;
            backdrop-filter: blur(8px); overflow-y: auto; padding: 20px;
        `;

        const box = document.createElement('div');
        box.style.cssText = `
            background: linear-gradient(135deg, #1a1f3a, #2d3561, #1a1f3a);
            border: 2px solid #06b6d4; border-radius: 24px;
            padding: 28px; width: 100%; max-width: 600px;
            box-shadow: 0 0 60px rgba(6, 182, 212, 0.3);
            max-height: 90vh; overflow-y: auto;
        `;

        box.innerHTML = `            <h3 style="color: #06b6d4; margin: 0 0 8px; font-size: 22px; text-align: center; font-weight: 700;">
                ⚡ ART Compiler Pro
            </h3>
            <p style="color: #8b92b4; font-size: 13px; text-align: center; margin-bottom: 24px;">
                Full dex2oat control • Profile-guided optimization • Max performance tuning
            </p>

            <!-- Performance Profile Selector -->
            <div style="margin-bottom: 20px;">
                <div style="color: #fff; font-size: 14px; font-weight: 600; margin-bottom: 10px;">🎯 Performance Profile</div>
                <select id="profile-select" style="width: 100%; padding: 12px; background: rgba(0,0,0,0.4); color: #fff; border: 1px solid #06b6d4; border-radius: 12px; font-size: 14px;">
                    ${Object.entries(PROFILES).map(([k, p]) => 
                        `<option value="${k}" ${k === currentProfile ? 'selected' : ''}>${p.name}</option>`
                    ).join('')}
                </select>
                <div id="profile-desc" style="font-size: 11px; color: #67e8f9; margin-top: 6px; padding: 8px; background: rgba(6,182,212,0.15); border-radius: 8px;">
                    ${PROFILES[currentProfile].name}
                </div>
            </div>

            <!-- Compiler Filter -->
            <div style="margin-bottom: 18px;">
                <div style="color: #fff; font-size: 14px; font-weight: 600; margin-bottom: 8px;">🔧 Compiler Filter</div>
                <select id="dex-filter-select" style="width: 100%; padding: 10px; background: rgba(0,0,0,0.4); color: #fff; border: 1px solid rgba(255,255,255,0.2); border-radius: 10px;">
                    ${FILTERS.map(f => `<option value="${f}" ${f === currentFilter ? 'selected' : ''}>${f.toUpperCase()}</option>`).join('')}
                </select>
                <div id="filter-desc" style="font-size: 11px; color: #666; margin-top: 4px;">
                    ${getFilterDesc(currentFilter)}
                </div>
            </div>

            <!-- Toggles Grid -->
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 18px;">
                <div style="background: rgba(0,0,0,0.3); border-radius: 12px; padding: 14px; text-align: center;">
                    <div style="color: #fff; font-size: 12px; font-weight: 600; margin-bottom: 8px;">JIT Compiler</div>
                    <button id="dex-jit-btn" style="width: 100%; padding: 10px; border-radius: 10px; border: none; font-weight: 600; cursor: pointer; background: ${jitEnabled ? '#32D74B' : '#FF453A'}; color: #fff; transition: all 0.2s;">
                        ${jitEnabled ? '✅ Enabled' : '❌ Disabled'}
                    </button>
                </div>
                <div style="background: rgba(0,0,0,0.3); border-radius: 12px; padding: 14px; text-align: center;">
                    <div style="color: #fff; font-size: 12px; font-weight: 600; margin-bottom: 8px;">Background Dexopt</div>
                    <button id="dex-bg-btn" style="width: 100%; padding: 10px; border-radius: 10px; border: none; font-weight: 600; cursor: pointer; background: ${bgDexoptEnabled ? '#32D74B' : '#FF453A'}; color: #fff; transition: all 0.2s;">
                        ${bgDexoptEnabled ? '✅ Enabled' : '❌ Disabled'}
                    </button>
                </div>
            </div>

            <!-- Advanced Settings (Collapsible) -->
            <details style="margin-bottom: 18px; background: rgba(0,0,0,0.25); border-radius: 12px; padding: 14px;">
                <summary style="color: #06b6d4; font-weight: 600; cursor: pointer; font-size: 13px;">⚙️ Advanced Compiler Options</summary>                <div style="margin-top: 12px; display: grid; gap: 10px;">
                    <div>
                        <label style="color: #fff; font-size: 12px; display: block; margin-bottom: 4px;">Compiler Threads: <span id="threads-val">${customThreads}</span></label>
                        <input type="range" id="threads-slider" min="1" max="16" value="${customThreads}" 
                            style="width: 100%; accent-color: #06b6d4;">
                    </div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                        <div>
                            <label style="color: #fff; font-size: 12px; display: block; margin-bottom: 4px;">Heap Xms</label>
                            <select id="heap-xms" style="width: 100%; padding: 8px; background: rgba(0,0,0,0.4); color: #fff; border: 1px solid rgba(255,255,255,0.2); border-radius: 8px;">
                                ${['128m','256m','512m','1024m','2048m'].map(s => `<option value="${s}" ${s===customHeapXms?'selected':''}>${s}</option>`).join('')}
                            </select>
                        </div>
                        <div>
                            <label style="color: #fff; font-size: 12px; display: block; margin-bottom: 4px;">Heap Xmx</label>
                            <select id="heap-xmx" style="width: 100%; padding: 8px; background: rgba(0,0,0,0.4); color: #fff; border: 1px solid rgba(255,255,255,0.2); border-radius: 8px;">
                                ${['256m','512m','1024m','2048m','4096m'].map(s => `<option value="${s}" ${s===customHeapXmx?'selected':''}>${s}</option>`).join('')}
                            </select>
                        </div>
                    </div>
                    <div>
                        <label style="color: #fff; font-size: 12px; display: block; margin-bottom: 4px;">Advanced Flags</label>
                        <div style="max-height: 120px; overflow-y: auto; background: rgba(0,0,0,0.3); border-radius: 8px; padding: 8px;">
                            ${Object.entries(ADVANCED_FLAGS).map(([flag, desc]) => `
                                <label style="display: flex; align-items: center; gap: 8px; color: #ccc; font-size: 11px; margin: 4px 0;">
                                    <input type="checkbox" data-flag="${flag}" ${selectedFlags.includes(flag)?'checked':''} style="accent-color: #06b6d4;">
                                    <span>${flag}</span>
                                    <span style="color: #666; margin-left: auto;">${desc}</span>
                                </label>
                            `).join('')}
                        </div>
                    </div>
                </div>
            </details>

            <!-- Info Box -->
            <div style="background: rgba(6,182,212,0.12); color: #67e8f9; padding: 12px; border-radius: 10px; font-size: 11px; margin-bottom: 20px; border-left: 3px solid #06b6d4;">
                <strong>💡 Pro Tip:</strong> Use "FULL COMPILER" for gaming/performance. Apply during idle + charging. 
                Full AOT uses more storage but eliminates JIT overhead. WARNING ‼️ Compiling on the spot freezes WebUI, close Root manager then open WebUI again & search in the running process manager "dex" if process shown then compiling is running, wait until it done.
            </div>

            <!-- Apply Buttons -->
            <button id="dex-apply-btn" style="width: 100%; padding: 16px; background: linear-gradient(135deg, #06b6d4, #0891b2); color: #fff; border: none; border-radius: 14px; font-size: 15px; font-weight: 700; cursor: pointer; margin-bottom: 10px; box-shadow: 0 4px 20px rgba(6,182,212,0.4);">
                💾 Apply Full Compiler Configuration
            </button>
            <button id="dex-force-recompile" style="width: 100%; padding: 12px; background: linear-gradient(135deg, #f59e0b, #d97706); color: #fff; border: none; border-radius: 12px; font-size: 13px; font-weight: 600; cursor: pointer; margin-bottom: 10px;">
                ⚡ Force Recompilation Now (pm compile -f)
            </button>
            <button id="dex-cancel-btn" style="width: 100%; padding: 12px; background: rgba(255,255,255,0.1); color: #fff; border: none; border-radius: 10px; font-size: 13px; cursor: pointer;">
                Cancel            </button>
        `;

        modal.appendChild(box);
        document.body.appendChild(modal);
        
        modal.onclick = e => { if (e.target === modal) modal.remove(); };

        // Profile selector handler
        const profileSelect = document.getElementById('profile-select');
        const profileDesc = document.getElementById('profile-desc');
        if (profileSelect) {
            profileSelect.onchange = () => {
                const p = PROFILES[profileSelect.value];
                if (p) {
                    currentProfile = profileSelect.value;
                    currentFilter = p.filter;
                    jitEnabled = p.jit;
                    bgDexoptEnabled = p.bgDexopt;
                    customThreads = p.threads;
                    customHeapXms = p.heapXms;
                    customHeapXmx = p.heapXmx;
                    selectedFlags = [...p.flags];
                    
                    // Update UI
                    document.getElementById('dex-filter-select').value = currentFilter;
                    document.getElementById('filter-desc').textContent = getFilterDesc(currentFilter);
                    document.getElementById('dex-jit-btn').textContent = jitEnabled ? '✅ Enabled' : '❌ Disabled';
                    document.getElementById('dex-jit-btn').style.background = jitEnabled ? '#32D74B' : '#FF453A';
                    document.getElementById('dex-bg-btn').textContent = bgDexoptEnabled ? '✅ Enabled' : '❌ Disabled';
                    document.getElementById('dex-bg-btn').style.background = bgDexoptEnabled ? '#32D74B' : '#FF453A';
                    document.getElementById('threads-slider').value = customThreads;
                    document.getElementById('threads-val').textContent = customThreads;
                    document.getElementById('heap-xms').value = customHeapXms;
                    document.getElementById('heap-xmx').value = customHeapXmx;
                    
                    // Update checkboxes
                    document.querySelectorAll('#dex-modal input[type="checkbox"][data-flag]').forEach(cb => {
                        cb.checked = selectedFlags.includes(cb.dataset.flag);
                    });
                    
                    profileDesc.textContent = p.name;
                    profileDesc.style.color = p.filter === 'everything' ? '#fbbf24' : '#67e8f9';
                }
            };
        }

        // Filter description
        const filterSelect = document.getElementById('dex-filter-select');
        const filterDesc = document.getElementById('filter-desc');        if (filterSelect && filterDesc) {
            filterSelect.onchange = () => {
                currentFilter = filterSelect.value;
                filterDesc.textContent = getFilterDesc(currentFilter);
            };
        }

        // JIT toggle
        const jitBtn = document.getElementById('dex-jit-btn');
        if (jitBtn) {
            jitBtn.onclick = () => {
                jitEnabled = !jitEnabled;
                jitBtn.textContent = jitEnabled ? '✅ Enabled' : '❌ Disabled';
                jitBtn.style.background = jitEnabled ? '#32D74B' : '#FF453A';
            };
        }

        // Background Dexopt toggle
        const bgBtn = document.getElementById('dex-bg-btn');
        if (bgBtn) {
            bgBtn.onclick = () => {
                bgDexoptEnabled = !bgDexoptEnabled;
                bgBtn.textContent = bgDexoptEnabled ? '✅ Enabled' : '❌ Disabled';
                bgBtn.style.background = bgDexoptEnabled ? '#32D74B' : '#FF453A';
            };
        }

        // Threads slider
        const threadsSlider = document.getElementById('threads-slider');
        const threadsVal = document.getElementById('threads-val');
        if (threadsSlider && threadsVal) {
            threadsSlider.oninput = () => { threadsVal.textContent = threadsSlider.value; customThreads = parseInt(threadsSlider.value); };
        }

        // Heap selectors
        const heapXms = document.getElementById('heap-xms');
        const heapXmx = document.getElementById('heap-xmx');
        if (heapXms) heapXms.onchange = () => customHeapXms = heapXms.value;
        if (heapXmx) heapXmx.onchange = () => customHeapXmx = heapXmx.value;

        // Flag checkboxes
        document.querySelectorAll('#dex-modal input[type="checkbox"][data-flag]').forEach(cb => {
            cb.onchange = () => {
                const flag = cb.dataset.flag;
                if (cb.checked) {
                    if (!selectedFlags.includes(flag)) selectedFlags.push(flag);
                } else {
                    selectedFlags = selectedFlags.filter(f => f !== flag);
                }
            };        });

        // Apply button
        const applyBtn = document.getElementById('dex-apply-btn');
        if (applyBtn) {
            applyBtn.onclick = async () => {
                currentFilter = document.getElementById('dex-filter-select').value;
                customHeapXms = document.getElementById('heap-xms').value;
                customHeapXmx = document.getElementById('heap-xmx').value;
                await applyDexTweaks();
            };
        }

        // Force recompile button
        const forceBtn = document.getElementById('dex-force-recompile');
        if (forceBtn) {
            forceBtn.onclick = async () => {
                const statusEl = document.getElementById('dex-status');
                if (statusEl) {
                    statusEl.innerHTML = '<span style="color: #fbbf24;">⚡ Triggering full recompilation...</span>';
                }
                try {
                    // Force recompilation for all user apps with current filter
                    await execFn(`su -c "pm compile -m ${currentFilter} -f -a 2>&1 | tee /sdcard/MTK_AI_Engine/dexopt.log"`);
                    if (window.showStatus) {
                        window.showStatus(`✅ Full recompilation triggered! Check /sdcard/MTK_AI_Engine/dexopt.log`, '#fbbf24');
                    }
                } catch (e) {
                    console.error('Recompile failed:', e);
                }
            };
        }

        // Cancel button
        const cancelBtn = document.getElementById('dex-cancel-btn');
        if (cancelBtn) cancelBtn.onclick = () => modal.remove();
    }

    function getFilterDesc(filter) {
        const desc = {
            'speed': '🔥 AOT compile ALL methods. Max performance, max storage (~2-3x app size).',
            'speed-profile': '⚖️ Profile-guided AOT. Balanced: compiles hot methods from usage profiles. [[26]]',
            'quicken': '⚡ Interpreter optimizations only (Android ≤11). Fast compile, moderate perf.',
            'verify': '✅ Bytecode verification only. No compilation. Minimal storage.',
            'interpret-only': '🐌 Pure interpretation. Slowest but smallest footprint.',
            'space': '💾 Optimize for storage. Slower than speed, smaller than speed-profile.',
            'space-profile': '💾+📊 Space optimization with profile guidance.',
            'time': '⏱️ Minimize compilation time. Legacy option, rarely used.',
            'everything': '🚀 AGGRESSIVE: Full AOT + deep inlining + startup string resolution. Max perf, max storage.'
        };        return desc[filter] || '';
    }

    async function applyDexTweaks() {
        const applyBtn = document.getElementById('dex-apply-btn');
        let statusEl = document.getElementById('dex-status');
        if (!statusEl) {
            statusEl = document.createElement('div');
            statusEl.id = 'dex-status';
            statusEl.style.cssText = 'text-align: center; font-size: 12px; color: #666; margin-bottom: 15px; min-height: 50px; padding: 10px; background: rgba(0,0,0,0.25); border-radius: 10px;';
            const box = document.querySelector('#dex-modal > div');
            if (box) box.insertBefore(statusEl, applyBtn);
        }

        applyBtn.disabled = true;
        applyBtn.textContent = '⏳ Applying Full Configuration...';
        statusEl.innerHTML = '<span style="color: #FF9F0A;">🔧 Updating ART properties & compiler flags...</span>';

        try {
            // === CORE PROPERTIES ===
            await execFn(`su -c "setprop dalvik.vm.dex2oat-filter ${currentFilter}"`);
            await execFn(`su -c "setprop dalvik.vm.image-dex2oat-filter ${currentFilter}"`);
            
            // === PM DEXOPT REASONS (Android 7+) ===
            const dexoptReasons = ['install', 'bg-dexopt', 'boot', 'first-boot', 'inactive', 'cmdline', 'ab-ota'];
            for (const reason of dexoptReasons) {
                const filter = (reason === 'bg-dexopt' && !bgDexoptEnabled) ? 'quicken' : currentFilter;
                await execFn(`su -c "setprop pm.dexopt.${reason} ${filter}"`);
            }
            
            // === JIT CONFIGURATION ===
            await execFn(`su -c "setprop dalvik.vm.usejit ${jitEnabled ? 1 : 0}"`);
            await execFn(`su -c "setprop dalvik.vm.usejitprofiles ${jitEnabled ? 1 : 0}"`); // Android ≤13
            if (jitEnabled) {
                await execFn(`su -c "setprop dalvik.vm.jitinitialsize 8m"`);
                await execFn(`su -c "setprop dalvik.vm.jitmaxsize 128m"`);
                await execFn(`su -c "setprop dalvik.vm.jitthreshold 5000"`); // Lower = faster JIT trigger
                await execFn(`su -c "setprop dalvik.vm.jitprithreadweight 250"`); // Prioritize UI thread
                await execFn(`su -c "setprop dalvik.vm.jittransitionweight 500"`); // Reduce interpreter transitions
            } else {
                await execFn(`su -c "setprop dalvik.vm.jitinitialsize 0"`);
                await execFn(`su -c "setprop dalvik.vm.jitmaxsize 0"`);
            }

            // === THREAD & CPU AFFINITY ===
            await execFn(`su -c "setprop dalvik.vm.dex2oat-threads ${customThreads}"`);
            await execFn(`su -c "setprop dalvik.vm.boot-dex2oat-threads ${customThreads}"`);
            await execFn(`su -c "setprop dalvik.vm.background-dex2oat-threads ${Math.max(2, customThreads - 2)}"`);
            
            // Optional: CPU set (uncomment if you want to pin to performance cores)            // await execFn(`su -c "setprop dalvik.vm.dex2oat-cpu-set 4,5,6,7"`); // Big cores on octa-core

            // === HEAP SIZE FOR COMPILER ===
            await execFn(`su -c "setprop dalvik.vm.dex2oat-Xms ${customHeapXms}"`);
            await execFn(`su -c "setprop dalvik.vm.dex2oat-Xmx ${customHeapXmx}"`);
            await execFn(`su -c "setprop dalvik.vm.image-dex2oat-Xms ${customHeapXms}"`);
            await execFn(`su -c "setprop dalvik.vm.image-dex2oat-Xmx ${customHeapXmx}"`);

            // === ADVANCED DEX2OAT FLAGS ===
            const flagString = selectedFlags.join(' ');
            if (flagString) {
                await execFn(`su -c "setprop dalvik.vm.dex2oat-flags '${flagString}'"`);
            } else {
                await execFn(`su -c "setprop dalvik.vm.dex2oat-flags ''"`);
            }
            
            // === PROFILE & BACKGROUND OPTIMIZATION ===
            await execFn(`su -c "setprop dalvik.vm.ps-min-first-save-ms 30000"`); // Profile after 30s runtime
            await execFn(`su -c "setprop dalvik.vm.ps-min-save-period-ms 60000"`); // Update profile every 60s
            await execFn(`su -c "setprop dalvik.vm.bgdexopt.new-classes-percent 10"`); // Recompile if >10% new classes
            await execFn(`su -c "setprop dalvik.vm.bgdexopt.new-methods-percent 10"`); // Recompile if >10% new methods
            await execFn(`su -c "setprop dalvik.vm.dex2oat-swap true"`); // Allow swap to prevent OOM
            await execFn(`su -c "setprop dalvik.vm.dex2oat-resolve-startup-strings true"`); // Pre-resolve startup strings [[39]]

            // === SAVE CONFIG TO SDCARD (persistent across reboots) ===
            const configContent = [
                `filter=${currentFilter}`,
                `jit=${jitEnabled ? 1 : 0}`,
                `bg_dexopt=${bgDexoptEnabled ? 1 : 0}`,
                `profile=${currentProfile}`,
                `threads=${customThreads}`,
                `heap_xms=${customHeapXms}`,
                `heap_xmx=${customHeapXmx}`,
                `flags=${selectedFlags.join(',')}`
            ].join('\n');
            await execFn(`mkdir -p /sdcard/MTK_AI_Engine && echo -n "${configContent}" > ${CONFIG_FILE}`);
            await execFn(`chmod 644 ${CONFIG_FILE}`);

            // === SUCCESS FEEDBACK ===
            const storageNote = currentFilter === 'speed' || currentFilter === 'everything' 
                ? '<br><small style="color: #fbbf24;">⚠️ Full AOT may use 2-3x app storage</small>' 
                : '';
            
            statusEl.innerHTML = `
                <span style="color: #32D74B; font-weight: 600;">✅ ART Compiler Updated</span><br>
                <small style="color: #8b92b4;">
                    Filter: <strong>${currentFilter}</strong> | 
                    JIT: ${jitEnabled ? 'ON' : 'OFF'} | 
                    Threads: ${customThreads} | 
                    Heap: ${customHeapXms}/${customHeapXmx}                </small>
                ${storageNote}
            `;
            
            if (window.showStatus) {
                const msg = `🚀 ART: ${currentFilter} applied • JIT:${jitEnabled?'ON':'OFF'} • ${customThreads} threads`;
                window.showStatus(msg, currentFilter === 'everything' ? '#fbbf24' : '#06b6d4');
            }

            // Auto-close after success
            setTimeout(() => { document.getElementById('dex-modal')?.remove(); }, 2500);

        } catch (e) {
            console.error('DEX2OAT: Apply failed:', e);
            statusEl.innerHTML = `
                <span style="color: #FF453A; font-weight: 600;">❌ Error</span><br>
                <small style="color: #8b92b4;">${e.message || 'Check root/ksu access'}</small>
            `;
            applyBtn.disabled = false;
            applyBtn.textContent = '💾 Apply Full Compiler Configuration';
        }
    }

    // Initialize
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Expose for debugging/testing
    window.DEX2OATManager = { 
        init, 
        showDexModal, 
        applyDexTweaks,
        PROFILES,
        FILTERS,
        ADVANCED_FLAGS
    };
})();