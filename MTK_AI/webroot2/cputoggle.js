// cputoggle.js - CPU Core Toggle with LIVE status
(function() {
    'use strict';

    const CONFIG_FILE = '/sdcard/MTK_AI_Engine/cputoggle.conf';
    let savedCoreStates = {};
    let detectedCores = [];

    // ✅ EXACT COPY from thermalzone.js
    const execFn = window.exec || async function(cmd, timeout = 5000) {
        return new Promise(resolve => {
            const cb = `cpu_exec_${Date.now()}_${Math.random().toString(36).substring(2)}`;
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
                    const [coreId, state] = line.split('=');
                    if (coreId && state) savedCoreStates[coreId.trim()] = state.trim();
                });
            }
        } catch (e) { console.warn('CPUToggle: Config load failed:', e); }
    }

    function bindClickHandler() {
        const btn = document.getElementById('cpu-toggle-btn');
        if (!btn) { console.warn('CPUToggle: #cpu-toggle-btn not found'); return; }
        console.log('CPUToggle: Button found, attaching click handler');
        btn.addEventListener('click', async () => {
            console.log('CPUToggle: Button clicked');
            // ✅ Re-load config before showing modal
            await loadConfig();
            showCPUModal();
        });
    }

    function showCPUModal() {
        const existing = document.getElementById('cpu-modal');        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = 'cpu-modal';
        modal.style.cssText = `
            position: fixed; inset: 0; background: rgba(0,0,0,0.85); z-index: 10000;
            display: flex; align-items: center; justify-content: center;
            backdrop-filter: blur(5px);
        `;

        const box = document.createElement('div');
        box.style.cssText = `
            background: linear-gradient(135deg, #1a1f3a, #2d3561);
            border: 2px solid #a855f7;
            border-radius: 20px;
            padding: 24px; width: 95%; max-width: 450px;
            box-shadow: 0 0 40px rgba(168, 85, 247, 0.2);
        `;

        box.innerHTML = `
            <h3 style="color: #a855f7; margin: 0 0 5px; font-size: 20px; text-align: center;">⚡ CPU Core Toggle</h3>
            <p style="color: #8b92b4; font-size: 12px; text-align: center; margin-bottom: 20px;">Toggle cores online/offline</p>

            <div id="cpu-scan-status" style="text-align: center; font-size: 12px; color: #666; margin-bottom: 15px; min-height: 40px; padding: 8px; background: rgba(0,0,0,0.2); border-radius: 8px;">
                <span style="color: #FF9F0A;">🔍 Reading LIVE CPU status...</span>
            </div>

            <div id="cpu-list" style="display: none; flex-direction: column; gap: 10px; margin-bottom: 15px; max-height: 220px; overflow-y: auto; padding-right: 4px;"></div>

            <div style="background: rgba(168,85,247,0.1); color: #c4b5fd; padding: 10px; border-radius: 8px; font-size: 11px; text-align: center; margin-bottom: 15px;">
                <i class="fas fa-info-circle"></i> CPU0 usually cannot be offlined. Status shows LIVE kernel state.
            </div>

            <button id="cpu-cancel-btn" style="width: 100%; padding: 12px; background: rgba(255,255,255,0.1); color: #fff; border: none; border-radius: 10px; font-size: 13px; cursor: pointer;">Cancel</button>
        `;

        modal.appendChild(box);
        document.body.appendChild(modal);
        
        modal.onclick = e => { if (e.target === modal) modal.remove(); };

        scanCores();

        const cancelBtn = document.getElementById('cpu-cancel-btn');
        if (cancelBtn) {
            cancelBtn.onclick = () => modal.remove();
        }
    }

    async function scanCores() {        const listEl = document.getElementById('cpu-list');
        const statusEl = document.getElementById('cpu-scan-status');
        if (!listEl || !statusEl) return;

        try {
            const cpuPathsRaw = await execFn('ls -d /sys/devices/system/cpu/cpu[0-9]* 2>/dev/null');
            const cpuPaths = cpuPathsRaw.trim().split('\n').filter(p => p.trim());

            if (!cpuPaths.length) {
                statusEl.innerHTML = '<span style="color: #666;">No CPU cores detected. Check root access.</span>';
                listEl.style.display = 'none';
                return;
            }

            statusEl.style.display = 'none';
            listEl.style.display = 'flex';
            detectedCores = [];

            for (const path of cpuPaths) {
                const idMatch = path.match(/cpu(\d+)$/);
                if (!idMatch) continue;
                const id = idMatch[1];
                
                // ✅ ALWAYS read LIVE status from kernel - NEVER use saved state for display
                const onlineRaw = await execFn(`cat ${path}/online 2>/dev/null`);
                const isHotplug = onlineRaw && onlineRaw.trim() !== '' && !onlineRaw.includes('error');
                const liveOnline = isHotplug ? onlineRaw.trim() === '1' : true;
                
                // Read frequency
                const freqRaw = await execFn(`cat ${path}/cpufreq/scaling_cur_freq 2>/dev/null`);
                const freq = freqRaw && freqRaw.trim() ? `${Math.floor(parseInt(freqRaw)/1000)} MHz` : 'N/A';

                // ✅ Store the LIVE state, not saved state
                detectedCores.push({ id, path, liveOnline, isHotplug, freq });

                const canToggle = isHotplug && parseInt(id) > 0;
                
                const coreEl = document.createElement('div');
                coreEl.style.cssText = 'background: rgba(0,0,0,0.3); border-radius: 10px; padding: 12px; display: flex; justify-content: space-between; align-items: center;';
                coreEl.innerHTML = `
                    <div style="flex: 1;">
                        <div style="color: #fff; font-size: 13px; font-weight: 600;">
                            CPU${id}
                            <span style="font-size: 10px; background: ${liveOnline ? 'rgba(50,215,75,0.2)' : 'rgba(255,69,58,0.2)'}; color: ${liveOnline ? '#32D74B' : '#FF453A'}; padding: 2px 6px; border-radius: 4px; margin-left: 6px;">
                                LIVE
                            </span>
                        </div>
                        <div style="color: #666; font-size: 11px; margin-top: 2px;">
                            ${freq} • <span style="color: ${liveOnline ? '#32D74B' : '#FF453A'}">${liveOnline ? 'online' : 'offline'}</span>
                            ${!canToggle ? ' • <span style="color: #888;">locked</span>' : ''}                        </div>
                    </div>
                    <button class="cpu-core-toggle" data-id="${id}" data-live="${liveOnline ? '1' : '0'}" ${!canToggle ? 'disabled' : ''} 
                        style="background: ${liveOnline ? '#FF453A' : '#32D74B'}; color: #fff; border: none; padding: 8px 16px; border-radius: 8px; font-size: 12px; font-weight: 600; cursor: ${canToggle ? 'pointer' : 'not-allowed'}; opacity: ${canToggle ? '1' : '0.5'}; min-width: 70px;">
                        ${liveOnline ? 'Offline' : 'Online'}
                    </button>
                `;
                listEl.appendChild(coreEl);
            }

            // Bind individual toggle buttons
            listEl.querySelectorAll('.cpu-core-toggle').forEach(btn => {
                btn.onclick = async (e) => {
                    const id = e.currentTarget.dataset.id;
                    const currentLive = e.currentTarget.dataset.live === '1';
                    const core = detectedCores.find(c => c.id === id);
                    
                    if (!core || !core.isHotplug || parseInt(id) === 0) return;
                    
                    const newOnline = currentLive ? '0' : '1';
                    
                    e.currentTarget.disabled = true;
                    e.currentTarget.textContent = '⏳';
                    
                    try {
                        await execFn(`su -c "echo ${newOnline} > ${core.path}/online"`);
                        
                        // ✅ Save state for persistence
                        savedCoreStates[id] = newOnline;
                        let cfg = '';
                        for (const [cid, state] of Object.entries(savedCoreStates)) {
                            cfg += `${cid}=${state}\n`;
                        }
                        await execFn(`mkdir -p /sdcard/MTK_AI_Engine && echo "${cfg}" > ${CONFIG_FILE}`);
                        
                        // ✅ Re-read LIVE status after toggle
                        await new Promise(r => setTimeout(r, 300));
                        showCPUModal(); // Re-open modal to show fresh status
                    } catch (err) {
                        console.error(`CPUToggle: Failed CPU${id}:`, err);
                        e.currentTarget.textContent = currentLive ? 'Offline' : 'Online';
                        e.currentTarget.disabled = false;
                    }
                };
            });

        } catch (e) {
            console.error('CPUToggle: Scan failed:', e);
            statusEl.innerHTML = `<span style="color: #FF453A;">❌ Error: ${e.message}</span>`;
        }    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    window.CPUToggleManager = { init, showCPUModal };
})();