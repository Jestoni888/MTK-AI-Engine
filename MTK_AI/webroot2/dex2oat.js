// dex2oat.js - ART Compiler & JIT Manager for Tools Page
(function() {
    'use strict';

    const CONFIG_FILE = '/sdcard/MTK_AI_Engine/dex2oat.conf';
    const FILTERS = ['speed', 'speed-profile', 'quicken', 'verify', 'interpret-only'];
    let currentFilter = 'speed-profile';
    let jitEnabled = true;
    let bgDexoptEnabled = true;

    // Safe exec wrapper - EXACT COPY from iotweaks.js
    const execFn = window.exec || async function(cmd, timeout = 5000) {
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
        bindClickHandler();
    }

    async function loadConfig() {
        try {
            const raw = await execFn(`cat ${CONFIG_FILE} 2>/dev/null`);
            if (raw && raw.trim()) {
                raw.trim().split('\n').forEach(line => {
                    const [key, val] = line.split('=');
                    if (key === 'filter' && FILTERS.includes(val.trim())) currentFilter = val.trim();
                    if (key === 'jit') jitEnabled = val.trim() === '1';
                    if (key === 'bg_dexopt') bgDexoptEnabled = val.trim() === '1';
                });
            }
        } catch (e) { 
            console.warn('DEX2OAT: Config load failed:', e); 
        }
    }

    function bindClickHandler() {
        const btn = document.getElementById('dex2oat-btn');
        if (!btn) {
            console.warn('DEX2OAT: #dex2oat-btn not found');
            return;
        }
        console.log('DEX2OAT: Button found, attaching click handler');
        btn.addEventListener('click', () => {            console.log('DEX2OAT: Button clicked');
            showDexModal();
        });
    }

    function showDexModal() {
        const existing = document.getElementById('dex-modal');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = 'dex-modal';
        modal.style.cssText = `
            position: fixed; inset: 0; background: rgba(0,0,0,0.85); z-index: 10000;
            display: flex; align-items: center; justify-content: center;
            backdrop-filter: blur(5px);
        `;

        const box = document.createElement('div');
        box.style.cssText = `
            background: linear-gradient(135deg, #1a1f3a, #2d3561);
            border: 2px solid #06b6d4;
            border-radius: 20px;
            padding: 24px; width: 95%; max-width: 450px;
            box-shadow: 0 0 40px rgba(6, 182, 212, 0.2);
        `;

        box.innerHTML = `
            <h3 style="color: #06b6d4; margin: 0 0 5px; font-size: 20px; text-align: center;">🚀 DEX2OAT Compiler</h3>
            <p style="color: #8b92b4; font-size: 12px; text-align: center; margin-bottom: 20px;">Optimize ART compilation & JIT for performance or battery</p>

            <div style="margin-bottom: 18px;">
                <div style="color: #fff; font-size: 13px; font-weight: 600; margin-bottom: 8px;">Compiler Filter</div>
                <select id="dex-filter-select" style="width: 100%; padding: 10px; background: rgba(0,0,0,0.4); color: #fff; border: 1px solid rgba(255,255,255,0.2); border-radius: 10px;">
                    ${FILTERS.map(f => `<option value="${f}" ${f === currentFilter ? 'selected' : ''}>${f.toUpperCase()}</option>`).join('')}
                </select>
                <div style="font-size: 11px; color: #666; margin-top: 4px;">
                    <span id="dex-filter-desc">speed-profile: Balanced performance & storage</span>
                </div>
            </div>

            <div style="display: flex; gap: 10px; margin-bottom: 18px;">
                <div style="flex: 1; background: rgba(0,0,0,0.3); border-radius: 10px; padding: 12px; text-align: center;">
                    <div style="color: #fff; font-size: 12px; font-weight: 600; margin-bottom: 6px;">JIT Compiler</div>
                    <button id="dex-jit-btn" style="width: 100%; padding: 8px; border-radius: 8px; border: none; font-weight: 600; cursor: pointer; background: ${jitEnabled ? '#32D74B' : '#FF453A'}; color: #fff;">
                        ${jitEnabled ? '✅ Enabled' : '❌ Disabled'}
                    </button>
                </div>
                <div style="flex: 1; background: rgba(0,0,0,0.3); border-radius: 10px; padding: 12px; text-align: center;">
                    <div style="color: #fff; font-size: 12px; font-weight: 600; margin-bottom: 6px;">Background Dexopt</div>
                    <button id="dex-bg-btn" style="width: 100%; padding: 8px; border-radius: 8px; border: none; font-weight: 600; cursor: pointer; background: ${bgDexoptEnabled ? '#32D74B' : '#FF453A'}; color: #fff;">                        ${bgDexoptEnabled ? '✅ Enabled' : '❌ Disabled'}
                    </button>
                </div>
            </div>

            <div style="background: rgba(6,182,212,0.1); color: #67e8f9; padding: 10px; border-radius: 8px; font-size: 11px; text-align: center; margin-bottom: 15px;">
                <i class="fas fa-info-circle"></i> Changes apply instantly. Higher filters use more storage but improve app launch speed.
            </div>

            <button id="dex-apply-btn" style="width: 100%; padding: 14px; background: linear-gradient(135deg, #06b6d4, #0891b2); color: #fff; border: none; border-radius: 12px; font-size: 14px; font-weight: 700; cursor: pointer; margin-bottom: 10px;">💾 Apply Compiler Tweaks</button>
            <button id="dex-cancel-btn" style="width: 100%; padding: 12px; background: rgba(255,255,255,0.1); color: #fff; border: none; border-radius: 10px; font-size: 13px; cursor: pointer;">Cancel</button>
        `;

        modal.appendChild(box);
        document.body.appendChild(modal);
        
        modal.onclick = e => { 
            if (e.target === modal) modal.remove(); 
        };

        // Filter description updater
        const filterSelect = document.getElementById('dex-filter-select');
        const filterDesc = document.getElementById('dex-filter-desc');
        if (filterSelect && filterDesc) {
            const descriptions = {
                'speed': 'Maximum performance, highest storage usage',
                'speed-profile': 'Balanced: uses profile data for optimization',
                'quicken': 'Fast compilation, moderate performance',
                'verify': 'Only verifies bytecode, no optimization',
                'interpret-only': 'No compilation, lowest storage, slowest'
            };
            filterSelect.onchange = () => {
                filterDesc.textContent = descriptions[filterSelect.value] || '';
            };
        }

        // JIT toggle
        const jitBtn = document.getElementById('dex-jit-btn');
        if (jitBtn) {
            jitBtn.onclick = () => {
                jitEnabled = !jitEnabled;
                jitBtn.textContent = jitEnabled ? '✅ Enabled' : ' Disabled';
                jitBtn.style.background = jitEnabled ? '#32D74B' : '#FF453A';
            };
        }

        // Background Dexopt toggle
        const bgBtn = document.getElementById('dex-bg-btn');
        if (bgBtn) {
            bgBtn.onclick = () => {                bgDexoptEnabled = !bgDexoptEnabled;
                bgBtn.textContent = bgDexoptEnabled ? '✅ Enabled' : ' Disabled';
                bgBtn.style.background = bgDexoptEnabled ? '#32D74B' : '#FF453A';
            };
        }

        // Apply button
        const applyBtn = document.getElementById('dex-apply-btn');
        if (applyBtn) {
            applyBtn.onclick = async () => {
                currentFilter = filterSelect.value;
                await applyDexTweaks();
            };
        }

        // Cancel button
        const cancelBtn = document.getElementById('dex-cancel-btn');
        if (cancelBtn) {
            cancelBtn.onclick = () => modal.remove();
        }
    }

    async function applyDexTweaks() {
        const applyBtn = document.getElementById('dex-apply-btn');
        const statusEl = document.createElement('div');
        statusEl.id = 'dex-status';
        statusEl.style.cssText = 'text-align: center; font-size: 12px; color: #666; margin-bottom: 15px; min-height: 40px; padding: 8px; background: rgba(0,0,0,0.2); border-radius: 8px;';
        
        // Insert status before apply button
        const box = document.querySelector('#dex-modal > div');
        if (box) box.insertBefore(statusEl, applyBtn);

        applyBtn.disabled = true;
        applyBtn.textContent = '⏳ Applying...';
        statusEl.innerHTML = '<span style="color: #FF9F0A;">🔧 Updating ART properties...</span>';

        try {
            // Apply compiler filter
            await execFn(`su -c "setprop dalvik.vm.dex2oat-filter ${currentFilter}"`);
            await execFn(`su -c "setprop dalvik.vm.image-dex2oat-filter ${currentFilter}"`);
            
            // Apply PM dexopt defaults
            await execFn(`su -c "settings put global pm.dexopt.install ${currentFilter}"`);
            await execFn(`su -c "settings put global pm.dexopt.bg-dexopt ${bgDexoptEnabled ? currentFilter : 'quicken'}"`);
            await execFn(`su -c "settings put global pm.dexopt.shared ${currentFilter}"`);

            // Apply JIT
            await execFn(`su -c "setprop dalvik.vm.usejit ${jitEnabled ? 1 : 0}"`);
            if (jitEnabled) {
                await execFn(`su -c "setprop dalvik.vm.jitinitialsize 6m"`);                await execFn(`su -c "setprop dalvik.vm.jitmaxsize 64m"`);
            } else {
                await execFn(`su -c "setprop dalvik.vm.jitinitialsize 0"`);
                await execFn(`su -c "setprop dalvik.vm.jitmaxsize 0"`);
            }

            // Save config
            const configContent = `filter=${currentFilter}\njit=${jitEnabled ? 1 : 0}\nbg_dexopt=${bgDexoptEnabled ? 1 : 0}`;
            await execFn(`mkdir -p /sdcard/MTK_AI_Engine && echo -n "${configContent}" > ${CONFIG_FILE}`);

            // Show success
            statusEl.innerHTML = `
                <span style="color: #32D74B;">✅ ART properties updated</span><br>
                <small style="color: #8b92b4;">Filter: ${currentFilter} | JIT: ${jitEnabled ? 'ON' : 'OFF'} | BG Dexopt: ${bgDexoptEnabled ? 'ON' : 'OFF'}</small>
            `;
            
            if (window.showStatus) {
                window.showStatus(`✅ DEX2OAT: ${currentFilter} applied`, '#06b6d4');
            }

            setTimeout(() => {
                document.getElementById('dex-modal')?.remove();
            }, 2000);

        } catch (e) {
            console.error('DEX2OAT: Apply failed:', e);
            statusEl.innerHTML = `
                <span style="color: #FF453A;">❌ Error: ${e.message}</span><br>
                <small style="color: #8b92b4;">Check root access</small>
            `;
            applyBtn.disabled = false;
            applyBtn.textContent = '💾 Apply Compiler Tweaks';
        }
    }

    // Initialize - EXACT PATTERN from iotweaks.js
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Expose for debugging
    window.DEX2OATManager = { init, showDexModal, applyDexTweaks };
})();