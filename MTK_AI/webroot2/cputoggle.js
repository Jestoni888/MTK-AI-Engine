// cputoggle.js - CPU Core Toggle with LIVE status + chmod fix + Partial UI Update
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
            await loadConfig();
            showCPUModal();
        });
    }

    function showCPUModal() {
        const existing = document.getElementById('cpu-modal');
        if (existing) existing.remove();
        const modal = document.createElement('div');
        modal.id = 'cpu-modal';
        modal.style.cssText = `
            position: fixed; inset: 0; background: rgba(0,0,0,0.85); z-index: 10000;
            display: flex; align-items: center; justify-content: center;
            backdrop-filter: blur(5px);
        `;

        const box = document.createElement('div');
        box.style.cssText = `
            background: linear-gradient(135deg, var(--bg-secondary), var(--bg-card));
            border: 1px solid var(--border-color);
            border-radius: 20px;
            padding: 24px; width: 95%; max-width: 450px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
        `;

        box.innerHTML = `
            <h3 style="color: #fff; margin: 0 0 5px; font-size: 20px; text-align: center;">⚡ CPU Core Toggle</h3>
            <p style="color: #fff; font-size: 12px; text-align: center; margin-bottom: 20px;">Toggle cores online/offline</p>

            <div id="cpu-scan-status" style="text-align: center; font-size: 12px; color: #fff; margin-bottom: 15px; min-height: 40px; padding: 8px; background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 8px;">
                <span style="color: #fff;">🔍 Reading LIVE CPU status...</span>
            </div>

            <div id="cpu-list" style="display: none; flex-direction: column; gap: 10px; margin-bottom: 15px; max-height: 220px; overflow-y: auto; padding-right: 4px;"></div>

            <div style="background: var(--bg-secondary); border: 1px solid var(--border-color); color: #fff; padding: 10px; border-radius: 8px; font-size: 11px; text-align: center; margin-bottom: 15px;">
                <i class="fas fa-info-circle"></i> CPU0 usually cannot be offlined. Status shows LIVE kernel state.
            </div>

            <button id="cpu-cancel-btn" style="width: 100%; padding: 12px; background: var(--bg-secondary); color: #fff; border: 1px solid var(--border-color); border-radius: 10px; font-size: 13px; cursor: pointer;">Cancel</button>
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

    async function scanCores() {
        const listEl = document.getElementById('cpu-list');
        const statusEl = document.getElementById('cpu-scan-status');
        if (!listEl || !statusEl) return;

        try {
            const cpuPathsRaw = await execFn('ls -d /sys/devices/system/cpu/cpu[0-9]* 2>/dev/null');
            const cpuPaths = cpuPathsRaw.trim().split('\n').filter(p => p.trim());

            if (!cpuPaths.length) {
                statusEl.innerHTML = '<span style="color: #fff;">No CPU cores detected. Check root access.</span>';
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
                
                const onlineRaw = await execFn(`cat ${path}/online 2>/dev/null`);
                const isHotplug = onlineRaw && onlineRaw.trim() !== '' && !onlineRaw.includes('error');
                const liveOnline = isHotplug ? onlineRaw.trim() === '1' : true;
                
                const freqRaw = await execFn(`cat ${path}/cpufreq/scaling_cur_freq 2>/dev/null`);
                const freq = freqRaw && freqRaw.trim() ? `${Math.floor(parseInt(freqRaw)/1000)} MHz` : 'N/A';

                detectedCores.push({ id, path, liveOnline, isHotplug, freq });

                const canToggle = isHotplug && parseInt(id) > 0;
                const isOnline = liveOnline;
                
                const statusBg = isOnline ? 'var(--accent-green)' : 'var(--accent-red)';
                const btnBg = isOnline ? 'var(--accent-red)' : 'var(--accent-green)';
                const btnText = isOnline ? 'Offline' : 'Online';

                const coreEl = document.createElement('div');
                coreEl.id = `cpu-core-row-${id}`;
                coreEl.style.cssText = 'background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 10px; padding: 12px; display: flex; justify-content: space-between; align-items: center;';
                
                coreEl.innerHTML = `
                    <div style="flex: 1;">
                        <div style="color: #fff; font-size: 13px; font-weight: 600;">
                            CPU${id}
                            <span id="cpu-badge-${id}" style="font-size: 10px; background: ${statusBg}; color: #fff; padding: 2px 6px; border-radius: 4px; margin-left: 6px;">
                                LIVE
                            </span>
                        </div>
                        <div style="color: #fff; font-size: 11px; margin-top: 2px;">
                            <span id="cpu-freq-${id}">${freq}</span> • <span id="cpu-status-${id}" style="color: #fff">${isOnline ? 'online' : 'offline'}</span>
                            ${!canToggle ? ' • <span style="color: #fff;">locked</span>' : ''}
                        </div>
                    </div>
                    <button id="cpu-btn-${id}" class="cpu-core-toggle" data-id="${id}" data-live="${isOnline ? '1' : '0'}" ${!canToggle ? 'disabled' : ''} 
                        style="background: ${btnBg}; color: #fff; border: none; padding: 8px 16px; border-radius: 8px; font-size: 12px; font-weight: 600; cursor: ${canToggle ? 'pointer' : 'not-allowed'}; opacity: ${canToggle ? '1' : '0.5'}; min-width: 70px;">
                        ${btnText}
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
                    
                    const btnEl = document.getElementById(`cpu-btn-${id}`);
                    const badgeEl = document.getElementById(`cpu-badge-${id}`);
                    const statusTextEl = document.getElementById(`cpu-status-${id}`);
                    const freqEl = document.getElementById(`cpu-freq-${id}`);
                    
                    if (btnEl) {
                        btnEl.disabled = true;
                        btnEl.textContent = '⏳';
                    }
                    
                    try {
                        await execFn(`su -c "chmod 644 ${core.path}/online"`);
                        await execFn(`su -c "echo ${newOnline} > ${core.path}/online"`);
                        
                        savedCoreStates[id] = newOnline;
                        let cfg = '';
                        for (const [cid, state] of Object.entries(savedCoreStates)) {
                            cfg += `${cid}=${state}\n`;
                        }
                        await execFn(`mkdir -p /sdcard/MTK_AI_Engine && echo "${cfg}" > ${CONFIG_FILE}`);
                        
                        await new Promise(r => setTimeout(r, 300));
                        const updatedOnlineRaw = await execFn(`cat ${core.path}/online 2>/dev/null`);
                        const updatedLive = updatedOnlineRaw && updatedOnlineRaw.trim() === '1';
                        
                        const updatedFreqRaw = await execFn(`cat ${core.path}/cpufreq/scaling_cur_freq 2>/dev/null`);
                        const updatedFreq = updatedFreqRaw && updatedFreqRaw.trim() ? `${Math.floor(parseInt(updatedFreqRaw)/1000)} MHz` : 'N/A';

                        core.liveOnline = updatedLive;
                        core.freq = updatedFreq;

                        const isOnline = updatedLive;
                        const statusBg = isOnline ? 'var(--accent-green)' : 'var(--accent-red)';
                        const btnBg = isOnline ? 'var(--accent-red)' : 'var(--accent-green)';
                        const btnText = isOnline ? 'Offline' : 'Online';

                        if (badgeEl) {
                            badgeEl.style.background = statusBg;
                            badgeEl.style.color = '#fff';
                        }
                        if (statusTextEl) {
                            statusTextEl.style.color = '#fff';
                            statusTextEl.textContent = isOnline ? 'online' : 'offline';
                        }
                        if (freqEl) {
                            freqEl.textContent = updatedFreq;
                        }
                        if (btnEl) {
                            btnEl.style.background = btnBg;
                            btnEl.textContent = btnText;
                            btnEl.dataset.live = isOnline ? '1' : '0';
                            btnEl.disabled = false;
                        }

                    } catch (err) {
                        console.error(`CPUToggle: Failed CPU${id}:`, err);
                        if (btnEl) {
                            btnEl.textContent = currentLive ? 'Offline' : 'Online';
                            btnEl.disabled = false;
                        }
                    }
                };
            });

        } catch (e) {
            console.error('CPUToggle: Scan failed:', e);
            statusEl.innerHTML = `<span style="color: #fff;">❌ Error: ${e.message}</span>`;
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    window.CPUToggleManager = { init, showCPUModal };
})();
