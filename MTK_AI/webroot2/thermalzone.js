// thermalzone.js - Thermal Zone Manager for Tools Page
(function() {
    'use strict';

    const CONFIG_FILE = '/sdcard/MTK_AI_Engine/thermal.conf';
    let thermalState = 'enabled'; // 'enabled' or 'disabled'
    let detectedZones = [];

    // Safe exec wrapper - EXACT COPY from iotweaks.js
    const execFn = window.exec || async function(cmd, timeout = 5000) {
        return new Promise(resolve => {
            const cb = `thermal_exec_${Date.now()}_${Math.random().toString(36).substring(2)}`;
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
                    if (key === 'state' && val) thermalState = val.trim();
                });
            }
        } catch (e) { 
            console.warn('ThermalZone: Config load failed:', e); 
        }
    }

    function bindClickHandler() {
        const btn = document.getElementById('thermal-zone-btn');
        if (!btn) {
            console.warn('ThermalZone: #thermal-zone-btn not found');
            return;
        }
        console.log('ThermalZone: Button found, attaching click handler');
        btn.addEventListener('click', () => {
            console.log('ThermalZone: Button clicked');
            showThermalModal();
        });    }

    function showThermalModal() {
        const existing = document.getElementById('thermal-modal');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = 'thermal-modal';
        modal.style.cssText = `
            position: fixed; inset: 0; background: rgba(0,0,0,0.85); z-index: 10000;
            display: flex; align-items: center; justify-content: center;
            backdrop-filter: blur(5px);
        `;

        const box = document.createElement('div');
        box.style.cssText = `
            background: linear-gradient(135deg, #1a1f3a, #2d3561);
            border: 2px solid #f59e0b;
            border-radius: 20px;
            padding: 24px; width: 95%; max-width: 450px;
            box-shadow: 0 0 40px rgba(245, 158, 11, 0.2);
        `;

        box.innerHTML = `
            <h3 style="color: #f59e0b; margin: 0 0 5px; font-size: 20px; text-align: center;">🔥 Thermal Zone Manager</h3>
            <p style="color: #8b92b4; font-size: 12px; text-align: center; margin-bottom: 20px;">Enable/disable thermal throttling zones</p>

            <div id="thermal-scan-status" style="text-align: center; font-size: 12px; color: #666; margin-bottom: 15px; min-height: 40px; padding: 8px; background: rgba(0,0,0,0.2); border-radius: 8px;">
                <span style="color: #FF9F0A;">🔍 Scanning thermal zones...</span>
            </div>

            <div id="thermal-list" style="display: flex; flex-direction: column; gap: 10px; margin-bottom: 15px; max-height: 200px; overflow-y: auto; padding-right: 4px;">
                <!-- Zones injected here -->
            </div>

            <div style="background: rgba(245,158,11,0.1); color: #f59e0b; padding: 10px; border-radius: 8px; font-size: 11px; text-align: center; margin-bottom: 15px;">
                <i class="fas fa-exclamation-triangle"></i> Disabling thermals may cause overheating. Use at your own risk.
            </div>

            <button id="thermal-toggle-btn" style="width: 100%; padding: 14px; background: linear-gradient(135deg, #f59e0b, #d97706); color: #fff; border: none; border-radius: 12px; font-size: 14px; font-weight: 700; cursor: pointer; margin-bottom: 10px;">
                ${thermalState === 'disabled' ? '✅ Enable All Thermals' : '⚠️ Disable All Thermals'}
            </button>
            <button id="thermal-cancel-btn" style="width: 100%; padding: 12px; background: rgba(255,255,255,0.1); color: #fff; border: none; border-radius: 10px; font-size: 13px; cursor: pointer;">Cancel</button>
        `;

        modal.appendChild(box);
        document.body.appendChild(modal);
        
        modal.onclick = e => { 
            if (e.target === modal) modal.remove();         };

        // Scan zones after modal renders
        scanZones();

        // Toggle button
        const toggleBtn = document.getElementById('thermal-toggle-btn');
        if (toggleBtn) {
            toggleBtn.onclick = async () => {
                await toggleAllThermals();
            };
        }

        // Cancel button
        const cancelBtn = document.getElementById('thermal-cancel-btn');
        if (cancelBtn) {
            cancelBtn.onclick = () => modal.remove();
        }
    }

    async function scanZones() {
        const listEl = document.getElementById('thermal-list');
        const statusEl = document.getElementById('thermal-scan-status');
        if (!listEl || !statusEl) return;

        try {
            const pathsRaw = await execFn('ls -d /sys/class/thermal/thermal_zone* 2>/dev/null');
            const paths = pathsRaw.trim().split('\n').filter(p => p.trim());

            if (!paths.length) {
                statusEl.innerHTML = '<span style="color: #666;">No thermal zones found on this device.</span>';
                listEl.style.display = 'none';
                return;
            }

            statusEl.style.display = 'none';
            listEl.style.display = 'flex';
            detectedZones = [];

            for (const path of paths) {
                const idMatch = path.match(/thermal_zone(\d+)/);
                if (!idMatch) continue;
                const id = idMatch[1];
                
                const [typeRaw, modeRaw, tempRaw] = await Promise.all([
                    execFn(`cat ${path}/type 2>/dev/null`),
                    execFn(`cat ${path}/mode 2>/dev/null`),
                    execFn(`cat ${path}/temp 2>/dev/null`)
                ]);
                const type = (typeRaw || '').trim() || 'Unknown';
                const mode = (modeRaw || '').trim().toLowerCase() || 'enabled';
                const tempVal = parseInt(tempRaw) || 0;
                const temp = tempVal > 0 ? `${(tempVal / 1000).toFixed(1)}°C` : 'N/A';

                detectedZones.push({ id, path, type, mode, temp });

                const isDisabled = mode === 'disabled';
                const zoneEl = document.createElement('div');
                zoneEl.style.cssText = 'background: rgba(0,0,0,0.3); border-radius: 10px; padding: 12px; display: flex; justify-content: space-between; align-items: center;';
                zoneEl.innerHTML = `
                    <div>
                        <div style="color: #fff; font-size: 13px; font-weight: 600;">Zone ${id} <span style="color: #8b92b4; font-weight: 400; font-size: 11px;">(${type})</span></div>
                        <div style="color: #666; font-size: 11px; margin-top: 2px;">Temp: ${temp} • State: <span style="color: ${isDisabled ? '#32D74B' : '#FF453A'}">${mode}</span></div>
                    </div>
                    <button class="thermal-zone-toggle" data-id="${id}" data-mode="${mode}" style="background: ${isDisabled ? '#32D74B' : '#FF453A'}; color: #fff; border: none; padding: 6px 12px; border-radius: 8px; font-size: 11px; font-weight: 600; cursor: pointer;">
                        ${isDisabled ? 'Enable' : 'Disable'}
                    </button>
                `;
                listEl.appendChild(zoneEl);
            }

            // Bind individual toggle buttons
            listEl.querySelectorAll('.thermal-zone-toggle').forEach(btn => {
                btn.onclick = async (e) => {
                    const id = e.currentTarget.dataset.id;
                    const currentMode = e.currentTarget.dataset.mode;
                    const newMode = currentMode === 'disabled' ? 'enabled' : 'disabled';
                    
                    e.currentTarget.disabled = true;
                    e.currentTarget.textContent = '⏳';
                    
                    const zone = detectedZones.find(z => z.id === id);
                    if (zone) {
                        await execFn(`su -c "echo ${newMode} > ${zone.path}/mode"`);
                        // Refresh UI
                        setTimeout(() => showThermalModal(), 300);
                    }
                };
            });

        } catch (e) {
            console.error('ThermalZone: Scan failed:', e);
            statusEl.innerHTML = `<span style="color: #FF453A;">❌ Scan error: ${e.message}</span>`;
        }
    }

    async function toggleAllThermals() {
        const toggleBtn = document.getElementById('thermal-toggle-btn');
        const statusEl = document.getElementById('thermal-scan-status');        
        if (!toggleBtn || !statusEl) return;

        toggleBtn.disabled = true;
        toggleBtn.textContent = '⏳ Applying...';
        statusEl.style.display = 'block';
        statusEl.innerHTML = '<span style="color: #FF9F0A;">🔄 Updating all zones...</span>';

        try {
            const newMode = thermalState === 'disabled' ? 'enabled' : 'disabled';
            
            // Apply to all zones
            for (const zone of detectedZones) {
                await execFn(`su -c "echo ${newMode} > ${zone.path}/mode"`);
            }

            // Update state & save config
            thermalState = newMode;
            await execFn(`mkdir -p /sdcard/MTK_AI_Engine && echo "state=${thermalState}" > ${CONFIG_FILE}`);

            // Show success
            statusEl.innerHTML = `<span style="color: #32D74B;">✅ All zones ${newMode}</span>`;
            
            if (window.showStatus) {
                window.showStatus(`✅ Thermal zones: ${newMode}`, '#f59e0b');
            }

            // Refresh modal after delay
            setTimeout(() => {
                document.getElementById('thermal-modal')?.remove();
                showThermalModal();
            }, 1500);

        } catch (e) {
            console.error('ThermalZone: Toggle failed:', e);
            statusEl.innerHTML = `<span style="color: #FF453A;">❌ Error: ${e.message}</span>`;
            toggleBtn.disabled = false;
            toggleBtn.textContent = thermalState === 'disabled' ? '✅ Enable All Thermals' : '⚠️ Disable All Thermals';
        }
    }

    // Initialize - EXACT PATTERN from iotweaks.js
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Expose for debugging
    window.ThermalZoneManager = { init, showThermalModal, toggleAllThermals };})();