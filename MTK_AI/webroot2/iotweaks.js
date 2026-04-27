// iotweaks.js - I/O Tweaks Manager for Tools Page
(function() {
    'use strict';

    const CONFIG_FILE = '/sdcard/MTK_AI_Engine/iotweaks.conf';
    let currentReadAhead = 4096;
    let currentScheduler = 'none';
    const SCHEDULERS = ['none', 'mq-deadline', 'bfq', 'kyber'];

    // Safe exec wrapper
    const execFn = window.exec || async function(cmd, timeout = 5000) {
        return new Promise(resolve => {
            const cb = `io_exec_${Date.now()}_${Math.random().toString(36).substring(2)}`;
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
                const lines = raw.trim().split('\n');
                lines.forEach(line => {
                    const [key, val] = line.split('=');
                    if (key === 'read_ahead') {
                        const parsed = parseInt(val);
                        if (!isNaN(parsed)) currentReadAhead = parsed;
                    }
                    if (key === 'scheduler' && val) {
                        currentScheduler = val.trim();
                    }
                });
            }
        } catch (e) { 
            console.warn('I/O Tweaks: Config load failed:', e); 
        }
    }

    function bindClickHandler() {
        const btn = document.getElementById('io-tweaks-btn');
        if (!btn) return;
        btn.addEventListener('click', () => {            console.log('I/O Tweaks: Button clicked');
            showIOModal();
        });
    }

    function showIOModal() {
        const existing = document.getElementById('io-modal');
        if (existing) existing.remove();

        // Inject slider styling
        if (!document.getElementById('io-slider-style')) {
            const style = document.createElement('style');
            style.id = 'io-slider-style';
            style.textContent = `
                input[type=range]::-webkit-slider-thumb {
                    -webkit-appearance: none; width: 20px; height: 20px; 
                    background: #4a9eff; border-radius: 50%; cursor: pointer;
                    border: 2px solid #fff;
                }
            `;
            document.head.appendChild(style);
        }

        const modal = document.createElement('div');
        modal.id = 'io-modal';
        modal.style.cssText = `
            position: fixed; inset: 0; background: rgba(0,0,0,0.85); z-index: 10000;
            display: flex; align-items: center; justify-content: center;
            backdrop-filter: blur(5px);
        `;

        const box = document.createElement('div');
        box.style.cssText = `
            background: linear-gradient(135deg, #1a1f3a, #2d3561);
            border: 2px solid #4a9eff;
            border-radius: 20px;
            padding: 24px; width: 95%; max-width: 450px;
            box-shadow: 0 0 40px rgba(74, 158, 255, 0.2);
        `;

        box.innerHTML = `
            <h3 style="color: #4a9eff; margin: 0 0 5px; font-size: 20px; text-align: center;">💾 I/O Tweaks Manager</h3>
            <p style="color: #8b92b4; font-size: 12px; text-align: center; margin-bottom: 20px;">Optimize storage read-ahead & scheduler</p>

            <div style="margin-bottom: 20px;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                    <span style="color: #fff; font-size: 13px; font-weight: 600;">Read-Ahead KB</span>
                    <span id="io-ra-val" style="color: #4a9eff; font-weight: 600;">${currentReadAhead} KB</span>
                </div>
                <input type="range" id="io-ra-slider" min="128" max="8192" step="128" value="${currentReadAhead}"                    style="width: 100%; height: 6px; background: rgba(255,255,255,0.2); border-radius: 3px; outline: none;">
                <div style="display: flex; justify-content: space-between; font-size: 11px; color: #666; margin-top: 4px;">
                    <span>128 KB</span><span>8192 KB</span>
                </div>
            </div>

            <div style="margin-bottom: 20px;">
                <div style="color: #fff; font-size: 13px; font-weight: 600; margin-bottom: 8px;">I/O Scheduler</div>
                <select id="io-sched-select" style="width: 100%; padding: 10px; background: rgba(0,0,0,0.4); color: #fff; border: 1px solid rgba(255,255,255,0.2); border-radius: 10px;">
                    ${SCHEDULERS.map(s => `<option value="${s}" ${s === currentScheduler ? 'selected' : ''}>${s.toUpperCase()}</option>`).join('')}
                </select>
            </div>

            <div id="io-status" style="text-align: center; font-size: 12px; color: #666; margin-bottom: 15px; min-height: 40px; padding: 8px; background: rgba(0,0,0,0.2); border-radius: 8px;"></div>

            <button id="io-apply-btn" style="width: 100%; padding: 14px; background: linear-gradient(135deg, #4a9eff, #2980b9); color: #fff; border: none; border-radius: 12px; font-size: 14px; font-weight: 700; cursor: pointer; margin-bottom: 10px;">💾 Apply I/O Tweaks</button>
            <button id="io-cancel-btn" style="width: 100%; padding: 12px; background: rgba(255,255,255,0.1); color: #fff; border: none; border-radius: 10px; font-size: 13px; cursor: pointer;">Cancel</button>
        `;

        modal.appendChild(box);
        document.body.appendChild(modal);
        
        modal.onclick = e => { 
            if (e.target === modal) modal.remove(); 
        };

        // Slider update
        const slider = document.getElementById('io-ra-slider');
        const raVal = document.getElementById('io-ra-val');
        if (slider && raVal) {
            slider.oninput = () => {
                currentReadAhead = parseInt(slider.value);
                raVal.textContent = `${currentReadAhead} KB`;
            };
        }

        // Apply button
        const applyBtn = document.getElementById('io-apply-btn');
        if (applyBtn) {
            applyBtn.onclick = async () => {
                const schedSelect = document.getElementById('io-sched-select');
                if (schedSelect) {
                    currentScheduler = schedSelect.value;
                }
                await applyTweaks();
            };
        }

        // Cancel button
        const cancelBtn = document.getElementById('io-cancel-btn');        if (cancelBtn) {
            cancelBtn.onclick = () => modal.remove();
        }
    }

    async function applyTweaks() {
        const statusEl = document.getElementById('io-status');
        const applyBtn = document.getElementById('io-apply-btn');
        
        if (!statusEl || !applyBtn) {
            console.error('I/O Tweaks: Status or Apply button not found');
            return;
        }

        applyBtn.disabled = true;
        applyBtn.textContent = '⏳ Applying...';
        statusEl.innerHTML = '<span style="color: #FF9F0A;">🔍 Detecting block devices...</span>';
        statusEl.style.color = '#FF9F0A';

        try {
            // First, list all block devices
            const lsResult = await execFn('ls /sys/block/ 2>/dev/null');
            const devices = lsResult.trim().split('\n').filter(d => d.trim());
            
            statusEl.innerHTML = `<span style="color: #4a9eff;">📱 Found ${devices.length} devices: ${devices.join(', ')}</span>`;
            
            let successCount = 0;
            let errorMsg = '';
            
            // Apply to each device individually
            for (const dev of devices) {
                try {
                    // Apply read-ahead
                    const raCmd = `echo ${currentReadAhead} > /sys/block/${dev}/queue/read_ahead_kb`;
                    await execFn(`su -c "${raCmd}"`);
                    
                    // Apply scheduler
                    const schedCmd = `echo ${currentScheduler} > /sys/block/${dev}/queue/scheduler`;
                    await execFn(`su -c "${schedCmd}"`);
                    
                    successCount++;
                    console.log(`I/O Tweaks: Applied to ${dev}`);
                } catch (e) {
                    errorMsg += `${dev}: ${e.message}\n`;
                    console.error(`I/O Tweaks: Failed for ${dev}:`, e);
                }
            }
            
            // Save config
            try {                await execFn(`mkdir -p /sdcard/MTK_AI_Engine && echo "read_ahead=${currentReadAhead}\nscheduler=${currentScheduler}" > ${CONFIG_FILE}`);
            } catch (e) {
                console.warn('I/O Tweaks: Failed to save config:', e);
            }

            // Show result
            if (successCount > 0) {
                statusEl.innerHTML = `
                    <span style="color: #32D74B;">✅ Applied to ${successCount}/${devices.length} devices</span><br>
                    <small style="color: #8b92b4;">${currentReadAhead} KB | ${currentScheduler}</small>
                `;
                
                if (window.showStatus) {
                    window.showStatus(`✅ I/O Tweaks: ${successCount} devices updated`, '#4a9eff');
                }
            } else {
                statusEl.innerHTML = `
                    <span style="color: #FF453A;">❌ Failed to apply to any device</span><br>
                    <small style="color: #8b92b4;">Check root permissions</small>
                `;
            }

            setTimeout(() => {
                document.getElementById('io-modal')?.remove();
            }, 2000);

        } catch (e) {
            console.error('I/O Tweaks: Apply failed:', e);
            statusEl.innerHTML = `
                <span style="color: #FF453A;">❌ Error: ${e.message}</span><br>
                <small style="color: #8b92b4;">Check root access</small>
            `;
            applyBtn.disabled = false;
            applyBtn.textContent = '💾 Apply I/O Tweaks';
        }
    }

    // Initialize
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();