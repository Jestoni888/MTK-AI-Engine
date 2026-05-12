// fpsgo.js - FPSGO Toggle Manager WITH Systrace Mask & Presets
(function() {
    'use strict';

    const FPSGO_PATHS = [
        '/sys/module/fpsgo/parameters',
        '/sys/kernel/fpsgo/fstb',
        '/sys/kernel/fpsgo/fbt',
        '/sys/kernel/fpsgo/common',
        '/sys/devices/virtual/misc/fpsgo',
        '/sys/class/misc/fpsgo',
        '/sys/module/gpu_fpsgo/parameters',
        '/sys/module/gpu_fpsgo',
        '/sys/kernel/gpu_fpsgo',
        '/sys/devices/platform/soc/mtk_fpsgo',
        '/proc/fpsgo',
        '/dev/fpsgo'
    ];

    // --- Systrace Mask Configuration ---
    const SYSTRACE_FLAGS = [
        { id: 'MANDATORY', bit: 0, value: 1, label: 'Mandatory', desc: 'Core FPSGO tracing (required)', recommended: true },
        { id: 'FBT', bit: 1, value: 2, label: 'FBT', desc: 'Frame Buffer Tracker - composition monitoring', recommended: false },
        { id: 'FSTB', bit: 2, value: 4, label: 'FSTB', desc: 'Frame Scheduler - boost decision tracing', recommended: true },
        { id: 'XGF', bit: 3, value: 8, label: 'XGF', desc: 'GPU/frame timeline debugging', recommended: false },
        { id: 'GBE', bit: 4, value: 16, label: 'GBE', desc: 'Game Boost Engine optimizations', recommended: true },
        { id: 'FBT_CTRL', bit: 5, value: 32, label: 'FBT_CTRL', desc: 'Advanced frame timing control', recommended: false }
    ];

    const FPSGO_PRESETS = {
        minimal: { enable: 1, force: 1, mask: 1, desc: 'MANDATORY only - lowest overhead' },
        balanced: { enable: 1, force: 1, mask: 21, desc: 'MANDATORY+FSTB+GBE - smart gaming' }, // 1+4+16
        aggressive: { enable: 1, force: 1, mask: 63, desc: 'All flags - max debugging' }, // 1+2+4+8+16+32
        esports: { enable: 1, force: 1, mask: 53, desc: 'MANDATORY+FSTB+GBE+FBT_CTRL - low latency' }, // 1+4+16+32
        disabled: { enable: 0, force: 0, mask: 0, desc: 'FPSGO off - raw scheduler' }
    };

    let detectedPaths = [];
    let currentSettings = {};
    let pathStatus = {};
    let foundToggles = [];
    let systraceMaskPath = null;
    let enablePath = null;
    let forcePath = null;
    let state = { preset: 'balanced', customMask: null, enable: 1, force: 1 };

    const execFn = window.exec || async function(cmd, timeout = 5000) {
        return new Promise(resolve => {
            const cb = `fpsgo_exec_${Date.now()}_${Math.random().toString(36).substring(2)}`;
            const t = setTimeout(() => { delete window[cb]; resolve(''); }, timeout);            window[cb] = (_, res) => { clearTimeout(t); delete window[cb]; resolve(res || ''); };
            if (window.ksu) ksu.exec(cmd, `window.${cb}`);
            else { clearTimeout(t); resolve(''); }
        });
    };

    async function init() {
        loadState();
        bindClickHandler();
    }

    function loadState() {
        try {
            const saved = localStorage.getItem('fpsgo_settings');
            if (saved) state = { ...state, ...JSON.parse(saved) };
        } catch (e) {}
    }

    function saveState() {
        localStorage.setItem('fpsgo_settings', JSON.stringify(state));
    }

    function bindClickHandler() {
        const btn = document.getElementById('fpsgo-btn');
        if (!btn) return;
        btn.addEventListener('click', () => showFpsgoModal());
    }

    function showFpsgoModal() {
        const existing = document.getElementById('fpsgo-modal');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = 'fpsgo-modal';
        modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:10000;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(5px);';

        const box = document.createElement('div');
        box.style.cssText = 'background:linear-gradient(135deg,#1a1f3a,#2d3561);border:2px solid #ef4444;border-radius:20px;padding:24px;width:95%;max-width:520px;max-height:90vh;overflow-y:auto;';

        // ⚠️ Bootloop Warning (Same as renderer.js)
        const warning = document.createElement('div');
        warning.style.cssText = 'background:linear-gradient(135deg,rgba(239,68,68,0.15),rgba(220,38,38,0.1));border:1px solid rgba(239,68,68,0.4);border-radius:12px;padding:12px 15px;margin-bottom:15px;cursor:pointer;';
        warning.innerHTML = `
            <div style="display:flex;align-items:center;gap:10px;">
                <div style="width:32px;height:32px;background:rgba(239,68,68,0.2);border-radius:8px;display:flex;align-items:center;justify-content:center;color:#ef4444;flex-shrink:0;">
                    <i class="fas fa-exclamation-triangle"></i>
                </div>
                <div style="flex:1;min-width:0;">
                    <div style="color:#fff;font-weight:600;font-size:13px;">⚠️ Bootloop Warning</div>
                    <div style="color:#fca5a5;font-size:11px;">If stuck on logo, clear dalvik cache in recovery</div>                </div>
                <i class="fas fa-chevron-down" style="color:#888;font-size:12px;"></i>
            </div>
            <div id="warning-details" style="display:none;margin-top:12px;padding-top:12px;border-top:1px solid rgba(239,68,68,0.3);">
                <div style="color:#fca5a5;font-size:11px;line-height:1.6;">
                    <strong>Recovery Steps:</strong><br>
                    1. Power off device completely<br>
                    2. Boot into Recovery (Vol+ + Power)<br>
                    3. Select "Wipe Dalvik/ART Cache"<br>
                    4. Select "Wipe Cache Partition"<br>
                    5. Optional: Wipe Data (loses apps)<br>
                    6. Reboot System<br><br>
                    <i style="color:#fbbf24;">💡 Tip: Backup first! Some FPSGO tweaks may conflict with thermal management.</i>
                </div>
            </div>
        `;
        warning.addEventListener('click', (e) => {
            if (e.target.closest('#warning-details')) return;
            const details = warning.querySelector('#warning-details');
            const icon = warning.querySelector('.fa-chevron-down');
            if (details.style.display === 'none') {
                details.style.display = 'block';
                icon.className = 'fas fa-chevron-up';
            } else {
                details.style.display = 'none';
                icon.className = 'fas fa-chevron-down';
            }
        });

        box.innerHTML = `
            <h3 style="color:#ef4444;margin:0 0 5px;font-size:20px;text-align:center;">🚀 FPSGO Manager</h3>
            <p style="color:#8b92b4;font-size:12px;text-align:center;margin-bottom:15px;">MediaTek Frame Scheduler Tweaks</p>
        `;
        box.appendChild(warning);

        // Preset Selector
        const presetSection = document.createElement('div');
        presetSection.style.cssText = 'margin-bottom:15px;';
        presetSection.innerHTML = `
            <div style="color:#fff;font-weight:500;margin-bottom:8px;font-size:13px;">⚡ Quick Presets</div>
            <div id="preset-list" style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px;"></div>
        `;
        box.appendChild(presetSection);

        // Master Controls
        const masterSection = document.createElement('div');
        masterSection.style.cssText = 'margin-bottom:15px;';
        masterSection.innerHTML = `
            <div style="color:#fff;font-weight:500;margin-bottom:8px;font-size:13px;">🎛️ Master Controls</div>
            <div style="display:flex;gap:8px;">                <label id="master-enable" style="flex:1;display:flex;align-items:center;gap:8px;padding:10px;background:rgba(255,255,255,0.05);border-radius:8px;cursor:pointer;">
                    <input type="checkbox" style="accent-color:#ef4444;">
                    <span style="color:#aaa;font-size:12px;">Enable FPSGO</span>
                </label>
                <label id="master-force" style="flex:1;display:flex;align-items:center;gap:8px;padding:10px;background:rgba(255,255,255,0.05);border-radius:8px;cursor:pointer;">
                    <input type="checkbox" style="accent-color:#ef4444;">
                    <span style="color:#aaa;font-size:12px;">Force Apply</span>
                </label>
            </div>
        `;
        box.appendChild(masterSection);

        // Systrace Mask Section
        const systraceSection = document.createElement('div');
        systraceSection.style.cssText = 'margin-bottom:15px;';
        systraceSection.innerHTML = `
            <div style="color:#fff;font-weight:500;margin-bottom:8px;font-size:13px;">🔍 Systrace Flags <span id="mask-display" style="color:#ef4444;font-size:11px;">(Mask: ?)</span></div>
            <div id="systrace-flags" style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px;"></div>
            <button id="apply-mask-btn" style="width:100%;margin-top:10px;padding:10px;background:linear-gradient(135deg,#ef4444,#f97316);color:#fff;border:none;border-radius:8px;font-weight:600;cursor:pointer;">
                <i class="fas fa-save"></i> Apply Custom Mask
            </button>
        `;
        box.appendChild(systraceSection);

        // Existing Path Display
        box.innerHTML += `<div id="fpsgo-paths-container" style="margin-bottom:15px;"></div>`;

        // Status & List
        box.innerHTML += `
            <div id="fpsgo-scan-status" style="text-align:center;font-size:12px;color:#666;margin-bottom:15px;min-height:40px;padding:8px;background:rgba(0,0,0,0.2);border-radius:8px;">
                <span style="color:#ef4444;">🔍 Checking permissions...</span>
            </div>
            <div id="fpsgo-list" style="display:none;flex-direction:column;gap:10px;margin-bottom:15px;max-height:300px;overflow-y:auto;padding-right:4px;"></div>
            <div style="background:rgba(239,68,68,0.1);color:#fca5a5;padding:10px;border-radius:8px;font-size:11px;text-align:center;margin-bottom:15px;">
                🔒 Grey toggles = Read-only (kernel locked)
            </div>
            <button id="fpsgo-cancel-btn" style="width:100%;padding:12px;background:rgba(255,255,255,0.1);color:#fff;border:none;border-radius:10px;font-size:13px;cursor:pointer;">Close</button>
        `;

        modal.appendChild(box);
        document.body.appendChild(modal);
        modal.onclick = e => { if (e.target === modal) modal.remove(); };
        document.getElementById('fpsgo-cancel-btn').onclick = () => modal.remove();

        // Initialize sections
        renderPresets(document.getElementById('preset-list'));
        renderSystraceFlags(document.getElementById('systrace-flags'));
        setupMasterControls();
        setupMaskApply();
                // Start scanning
        detectAndScan();
    }

    // --- Render Presets ---
    function renderPresets(container) {
        container.innerHTML = '';
        Object.entries(FPSGO_PRESETS).forEach(([id, preset]) => {
            const isSelected = state.preset === id && state.customMask === null;
            const card = document.createElement('div');
            card.style.cssText = `
                padding:10px;border-radius:8px;cursor:pointer;
                background:${isSelected ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.05)'};
                border:${isSelected ? '1px solid #ef4444' : '1px solid transparent'};
                text-align:center;
            `;
            const flagCount = SYSTRACE_FLAGS.filter(f => (preset.mask & f.value) !== 0).length;
            card.innerHTML = `
                <div style="color:#fff;font-weight:500;font-size:12px;">${id.toUpperCase()}</div>
                <div style="color:#888;font-size:10px;">${preset.desc.split('-')[0]} • ${flagCount} flags</div>
            `;
            card.addEventListener('click', async () => {
                state.preset = id;
                state.customMask = null;
                await applyPreset(preset);
                renderPresets(container);
                updateSystraceCheckboxes(preset.mask);
            });
            container.appendChild(card);
        });
    }

    // --- Render Systrace Flags ---
    function renderSystraceFlags(container) {
        container.innerHTML = '';
        const currentMask = state.customMask !== null ? state.customMask : FPSGO_PRESETS[state.preset]?.mask || 1;
        
        SYSTRACE_FLAGS.forEach(flag => {
            const isEnabled = (currentMask & flag.value) !== 0;
            const flagItem = document.createElement('label');
            flagItem.style.cssText = `
                display:flex;align-items:center;gap:8px;padding:10px;
                background:${isEnabled ? 'rgba(239,68,68,0.15)' : 'rgba(255,255,255,0.05)'};
                border:1px solid ${isEnabled ? 'rgba(239,68,68,0.4)' : 'transparent'};
                border-radius:8px;cursor:pointer;
            `;
            flagItem.innerHTML = `
                <input type="checkbox" class="systrace-flag" data-value="${flag.value}" data-id="${flag.id}" ${isEnabled ? 'checked' : ''} style="accent-color:#ef4444;">
                <div>
                    <div style="color:#fff;font-size:12px;font-weight:500;">${flag.label}${flag.recommended ? ' ⭐' : ''}</div>                    <div style="color:#888;font-size:10px;">${flag.desc}</div>
                </div>
            `;
            container.appendChild(flagItem);
        });

        // Update mask display
        document.getElementById('mask-display').textContent = `(Mask: ${currentMask})`;

        // Bind flag change events
        container.querySelectorAll('.systrace-flag').forEach(cb => {
            cb.addEventListener('change', () => {
                let newMask = 0;
                container.querySelectorAll('.systrace-flag:checked').forEach(c => {
                    newMask |= parseInt(c.dataset.value);
                });
                state.customMask = newMask;
                state.preset = 'custom';
                document.getElementById('mask-display').textContent = `(Mask: ${newMask})`;
                renderPresets(document.querySelector('#preset-list'));
            });
        });
    }

    function updateSystraceCheckboxes(mask) {
        const container = document.getElementById('systrace-flags');
        if (!container) return;
        container.querySelectorAll('.systrace-flag').forEach(cb => {
            const value = parseInt(cb.dataset.value);
            cb.checked = (mask & value) !== 0;
        });
        document.getElementById('mask-display').textContent = `(Mask: ${mask})`;
    }

    // --- Master Controls ---
    function setupMasterControls() {
        const enableLabel = document.getElementById('master-enable');
        const forceLabel = document.getElementById('master-force');
        const enableCb = enableLabel?.querySelector('input');
        const forceCb = forceLabel?.querySelector('input');
        
        if (enableCb) {
            enableCb.checked = state.enable === 1;
            enableLabel.onclick = async (e) => {
                if (e.target.tagName === 'INPUT') return;
                enableCb.checked = !enableCb.checked;
                state.enable = enableCb.checked ? 1 : 0;
                if (enablePath) await writeFpsgo(enablePath, state.enable);
                saveState();
            };        }
        
        if (forceCb) {
            forceCb.checked = state.force === 1;
            forceLabel.onclick = async (e) => {
                if (e.target.tagName === 'INPUT') return;
                forceCb.checked = !forceCb.checked;
                state.force = forceCb.checked ? 1 : 0;
                if (forcePath) await writeFpsgo(forcePath, state.force);
                saveState();
            };
        }
    }

    // --- Apply Mask Button ---
    function setupMaskApply() {
        const btn = document.getElementById('apply-mask-btn');
        if (!btn) return;
        btn.addEventListener('click', async () => {
            const originalText = btn.innerHTML;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Applying...';
            btn.disabled = true;
            
            let newMask = 0;
            document.querySelectorAll('.systrace-flag:checked').forEach(cb => {
                newMask |= parseInt(cb.dataset.value);
            });
            
            if (systraceMaskPath) {
                await writeFpsgo(systraceMaskPath, newMask);
            }
            
            state.customMask = newMask;
            state.preset = 'custom';
            saveState();
            
            btn.innerHTML = '<i class="fas fa-check"></i> Applied!';
            setTimeout(() => {
                btn.innerHTML = originalText;
                btn.disabled = false;
                renderPresets(document.querySelector('#preset-list'));
            }, 1500);
        });
    }

    // --- Apply Preset ---
    async function applyPreset(preset) {
        if (enablePath) await writeFpsgo(enablePath, preset.enable);
        if (forcePath) await writeFpsgo(forcePath, preset.force);
        if (systraceMaskPath) await writeFpsgo(systraceMaskPath, preset.mask);        
        state.enable = preset.enable;
        state.force = preset.force;
        state.customMask = null;
        saveState();
        
        // Update UI
        const enableCb = document.getElementById('master-enable')?.querySelector('input');
        const forceCb = document.getElementById('master-force')?.querySelector('input');
        if (enableCb) enableCb.checked = preset.enable === 1;
        if (forceCb) forceCb.checked = preset.force === 1;
        updateSystraceCheckboxes(preset.mask);
        renderPresets(document.querySelector('#preset-list'));
    }

    // --- Read/Write Helpers ---
    async function readFpsgo(path) {
        try {
            const val = await execFn(`cat ${path} 2>/dev/null`);
            return val ? val.trim() : 'unknown';
        } catch (e) { return 'error'; }
    }

    async function writeFpsgo(path, value) {
        try {
            await execFn(`su -c "echo ${value} > ${path}" 2>/dev/null`);
            console.log(`[FPSGO] ${path} = ${value}`);
            return true;
        } catch (e) {
            console.error(`[FPSGO] Failed ${path}:`, e);
            return false;
        }
    }

    // --- Path Detection & Scanning (Original Logic) ---
    async function detectAndScan() {
        const statusEl = document.getElementById('fpsgo-scan-status');
        const pathsContainer = document.getElementById('fpsgo-paths-container');
        const listEl = document.getElementById('fpsgo-list');

        detectedPaths = [];
        pathStatus = {};
        currentSettings = {};
        foundToggles = [];
        systraceMaskPath = null;
        enablePath = null;
        forcePath = null;

        // Detect paths
        for (const path of FPSGO_PATHS) {            try {
                const check = await execFn(`test -d ${path} && echo "exists" || echo "missing"`);
                pathStatus[path] = check.trim() === 'exists';
                if (pathStatus[path]) {
                    detectedPaths.push(path);
                    // Identify special paths
                    if (path.includes('common')) {
                        const files = await execFn(`ls ${path} 2>/dev/null`);
                        if (files.includes('systrace_mask')) systraceMaskPath = `${path}/systrace_mask`;
                        if (files.includes('fpsgo_enable')) enablePath = `${path}/fpsgo_enable`;
                        if (files.includes('force_onoff')) forcePath = `${path}/force_onoff`;
                    }
                }
            } catch (e) { pathStatus[path] = false; }
        }

        displayPaths(pathsContainer);

        if (detectedPaths.length === 0) {
            statusEl.innerHTML = '<span style="color:#666;">❌ No FPSGO paths found</span>';
            listEl.style.display = 'none';
            return;
        }

        statusEl.innerHTML = `<span style="color:#ef4444;">⚡ Scanning ${detectedPaths.length} path(s)...</span>`;
        
        for (const basePath of detectedPaths) {
            await scanPathForToggles(basePath);
        }

        // Load current values for special paths
        if (enablePath) state.enable = parseInt(await readFpsgo(enablePath)) || 1;
        if (forcePath) state.force = parseInt(await readFpsgo(forcePath)) || 1;
        if (systraceMaskPath) {
            const maskVal = parseInt(await readFpsgo(systraceMaskPath)) || 1;
            if (state.customMask === null) updateSystraceCheckboxes(maskVal);
        }

        // Update master controls UI
        setupMasterControls();

        if (foundToggles.length === 0) {
            statusEl.innerHTML = '<span style="color:#666;">⚠️ No parameters found</span>';
            listEl.style.display = 'none';
            return;
        }

        listEl.innerHTML = '';
        let writableCount = 0;
        let readOnlyCount = 0;
        foundToggles.forEach(toggle => {
            const row = createToggleRow(toggle);
            listEl.appendChild(row);
            if (toggle.writable) writableCount++;
            else readOnlyCount++;
        });

        statusEl.innerHTML = `<span style="color:#10b981;">✅ ${writableCount} writable, ${readOnlyCount} read-only</span>`;
        listEl.style.display = 'flex';

        bindToggleEvents(listEl);
    }

    async function scanPathForToggles(basePath) {
        try {
            const isDir = await execFn(`test -d ${basePath} && echo "yes" || echo "no"`);
            if (isDir.trim() === 'yes') {
                const rawList = await execFn(`ls ${basePath} 2>/dev/null`);
                const files = rawList.trim().split('\n').filter(f => f && f.trim());
                for (const file of files) {
                    const paramName = file.trim();
                    if (!paramName || paramName.startsWith('.') || paramName === 'uevent') continue;
                    // Skip special paths we handle separately
                    if (['systrace_mask', 'fpsgo_enable', 'force_onoff'].includes(paramName)) continue;
                    const fullPath = `${basePath}/${paramName}`;
                    await checkIfToggle(paramName, fullPath);
                }
            }
        } catch (e) { console.error(`Failed to scan ${basePath}:`, e); }
    }

    async function checkIfToggle(name, path) {
        try {
            const testRead = await execFn(`test -r ${path} && echo "yes" || echo "no"`);
            if (testRead.trim() !== 'yes') return;
            let val = await execFn(`cat ${path} 2>/dev/null`);
            val = val ? val.trim() : '';
            if (val !== '0' && val !== '1') return;
            const testWrite = await execFn(`test -w ${path} && echo "yes" || echo "no"`);
            const isWritable = testWrite.trim() === 'yes';
            let actuallyWritable = isWritable;
            if (isWritable) {
                const testResult = await execFn(`su -c "chmod 666 ${path} 2>/dev/null; echo ${val} > ${path} 2>&1"`);
                if (testResult.includes('Read-only') || testResult.includes('Permission denied')) {
                    actuallyWritable = false;
                }
            }
            const desc = name.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
            if (!foundToggles.find(t => t.name === name && t.path === path)) {                foundToggles.push({ name, path, value: val, writable: actuallyWritable, desc });
                console.log(`${actuallyWritable ? '✅' : '🔒'} ${name} = ${val}`);
            }
        } catch (e) {}
    }

    function displayPaths(container) {
        if (!container) return;
        let html = '<div style="background:rgba(0,0,0,0.3);border-radius:12px;padding:12px;">';
        html += '<div style="color:#8b92b4;font-size:11px;margin-bottom:8px;text-align:center;">📍 Active Paths</div>';
        detectedPaths.forEach((path, index) => {
            html += `<div style="display:flex;align-items:center;gap:8px;padding:8px;margin-bottom:${index < detectedPaths.length - 1 ? '6px' : '0'};background:rgba(239,68,68,0.1);border:1px solid #ef4444;border-radius:8px;">
                <span style="font-size:14px;">🟢</span>
                <code style="flex:1;color:#fff;font-size:10px;overflow:hidden;text-overflow:ellipsis;">${path}</code>
            </div>`;
        });
        html += '</div>';
        container.innerHTML = html;
    }

    function createToggleRow(toggle) {
        const row = document.createElement('div');
        row.style.cssText = `background:rgba(0,0,0,0.2);border-radius:10px;padding:12px;display:flex;justify-content:space-between;align-items:center;opacity:${toggle.writable ? '1' : '0.5'};`;
        const isChecked = toggle.value === '1';
        row.innerHTML = `
            <div style="flex:1;min-width:0;">
                <div style="color:#fff;font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                    ${toggle.desc} ${!toggle.writable ? '🔒' : ''}
                </div>
                <div style="color:#666;font-size:10px;margin-top:2px;">${toggle.name}</div>
            </div>
            <div style="position:relative;display:inline-block;width:44px;height:24px;margin-left:8px;">
                <input type="checkbox" class="fpsgo-toggle" 
                    data-path="${toggle.path}" 
                    data-param="${toggle.name}" 
                    data-desc="${toggle.desc}"
                    ${isChecked ? 'checked' : ''}
                    ${!toggle.writable ? 'disabled' : ''}
                    style="opacity:0;width:0;height:0;">
                <span style="position:absolute;cursor:${toggle.writable ? 'pointer' : 'not-allowed'};top:0;left:0;right:0;bottom:0;background-color:${isChecked ? '#ef4444' : '#4b5563'};transition:.3s;border-radius:24px;${!toggle.writable ? 'filter:grayscale(100%);' : ''}"
                    ${toggle.writable ? 'onclick="this.previousElementSibling.click()"' : ''}></span>
            </div>
        `;
        return row;
    }

    function bindToggleEvents(container) {
        container.querySelectorAll('.fpsgo-toggle:not(:disabled)').forEach(toggle => {
            toggle.addEventListener('change', async (e) => {
                const targetVal = e.target.checked ? '1' : '0';                const path = e.target.dataset.path;
                const param = e.target.dataset.param;
                const desc = e.target.dataset.desc;
                e.target.disabled = true;
                e.target.style.opacity = '0.5';
                try {
                    await execFn(`su -c "chmod 666 ${path} && echo ${targetVal} > ${path}"`);
                    const verify = await execFn(`cat ${path} 2>/dev/null`);
                    const actualVal = verify ? verify.trim() : '';
                    if (actualVal === targetVal) {
                        const slider = e.target.nextElementSibling;
                        if (slider) {
                            slider.style.backgroundColor = targetVal === '1' ? '#10b981' : '#4b5563';
                            setTimeout(() => { slider.style.backgroundColor = targetVal === '1' ? '#ef4444' : '#4b5563'; }, 300);
                        }
                    } else {
                        e.target.checked = !e.target.checked;
                        alert(`⚠️ Could not apply ${desc}\n\nKernel rejected the change.`);
                    }
                } catch (err) {
                    e.target.checked = !e.target.checked;
                    alert(`Error applying ${desc}`);
                }
                e.target.disabled = false;
                e.target.style.opacity = '1';
            });
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    window.FpsgoManager = { init, showFpsgoModal, applyPreset, FPSGO_PRESETS, SYSTRACE_FLAGS };
})();