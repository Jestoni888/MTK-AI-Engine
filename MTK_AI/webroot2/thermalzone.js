// thermalzone.js - Enhanced Thermal Zone & MTK Proc Thermal Manager
(function() {
    'use strict';

    const CONFIG_FILE = '/sdcard/MTK_AI_Engine/thermal.conf';
    let thermalState = 'enabled'; // 'enabled' or 'disabled'
    let detectedZones = [];
    let detectedProcNodes = [];

    // Safe exec wrapper - standard execution helper
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
        btn.addEventListener('click', () => {
            showThermalModal();
        });
    }

    /* ==========================================================================
       MODAL 1: SYSFS THERMAL ZONES (MODE, POLICY, TRIP POINTS)
       ========================================================================== */
    function showThermalModal() {
        const existing = document.getElementById('thermal-modal');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = 'thermal-modal';
        modal.style.cssText = `
            position: fixed; inset: 0; background: rgba(0,0,0,0.85); z-index: 10000;
            display: flex; align-items: center; justify-content: center;
            backdrop-filter: blur(5px); padding: 10px;
        `;

        const box = document.createElement('div');
        box.style.cssText = `
            background: linear-gradient(135deg, var(--bg-secondary) 0%, var(--bg-card) 100%);
            border: 1px solid var(--border-color);
            border-radius: 20px; padding: 20px; width: 100%; max-width: 500px;
            max-height: 90vh; display: flex; flex-direction: column;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5); overflow: hidden;
        `;

        box.innerHTML = `
            <h3 style="color: #ffffff; margin: 0 0 5px; font-size: 20px; text-align: center;">🔥 Thermal Zone Manager</h3>
            <p style="color: #ffffff; opacity: 0.8; font-size: 12px; text-align: center; margin-bottom: 15px;">Configure mode, policies, and trip point thresholds</p>

            <!-- Global Policy & Global Trip Adjuster -->
            <div style="background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 12px; padding: 12px; margin-bottom: 12px;">
                <div style="font-size: 12px; font-weight: 700; color: var(--accent-orange); margin-bottom: 8px;">⚙️ Global Thermal Controls</div>
                
                <!-- Policy Control -->
                <div style="display: flex; gap: 8px; align-items: center; margin-bottom: 10px;">
                    <select id="global-policy-select" style="flex: 1; padding: 8px; background: var(--bg-card); color: #fff; border: 1px solid var(--border-color); border-radius: 8px; font-size: 11px;">
                        <option value="">Loading policies...</option>
                    </select>
                    <button id="apply-policy-all-btn" style="padding: 8px 12px; background: var(--accent-orange); color: #fff; border: none; border-radius: 8px; font-size: 11px; font-weight: 600; cursor: pointer;">Apply Policy to All</button>
                </div>

                <!-- Global Trip Point Slider -->
                <div style="display: flex; flex-direction: column; gap: 4px;">
                    <div style="display: flex; justify-content: space-between; font-size: 11px; color: #fff;">
                        <span>Global Trip Point Target:</span>
                        <span id="global-trip-val" style="font-weight: 700; color: var(--accent-orange);">95°C</span>
                    </div>
                    <div style="display: flex; gap: 8px; align-items: center;">
                        <input type="range" id="global-trip-slider" min="50" max="200" value="95" style="flex: 1; accent-color: var(--accent-orange);">
                        <button id="apply-trip-all-btn" style="padding: 6px 12px; background: var(--bg-card); border: 1px solid var(--border-color); color: #fff; border-radius: 8px; font-size: 11px; cursor: pointer;">Apply to All</button>
                    </div>
                </div>
            </div>

            <div id="thermal-scan-status" style="text-align: center; font-size: 12px; color: #ffffff; margin-bottom: 10px; padding: 8px; background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 8px;">
                <span style="color: var(--accent-orange);">🔍 Scanning thermal zones...</span>
            </div>

            <!-- Scrollable List of Thermal Zones -->
            <div id="thermal-list" style="display: flex; flex-direction: column; gap: 10px; margin-bottom: 12px; overflow-y: auto; padding-right: 4px; flex: 1;">
                <!-- Zones injected here -->
            </div>

            <!-- Action Buttons -->
            <div style="display: flex; flex-direction: column; gap: 8px;">
                <button id="open-proc-modal-btn" style="width: 100%; padding: 10px; background: var(--bg-secondary); color: #38ef7d; border: 1px solid #38ef7d; border-radius: 10px; font-size: 12px; font-weight: 700; cursor: pointer;">
                    🔍 Detect MediaTek Driver (/proc/driver/thermal)
                </button>

                <button id="thermal-toggle-btn" style="width: 100%; padding: 12px; background: var(--accent-orange); color: #ffffff; border: none; border-radius: 10px; font-size: 13px; font-weight: 700; cursor: pointer;">
                    ${thermalState === 'disabled' ? '✅ Enable All Thermals' : '⚠️ Disable All Thermals'}
                </button>
                <button id="thermal-cancel-btn" style="width: 100%; padding: 10px; background: var(--bg-secondary); color: #ffffff; border: 1px solid var(--border-color); border-radius: 10px; font-size: 12px; cursor: pointer;">Close</button>
            </div>
        `;

        modal.appendChild(box);
        document.body.appendChild(modal);

        modal.onclick = e => { if (e.target === modal) modal.remove(); };

        // Global Slider display update
        const globalSlider = document.getElementById('global-trip-slider');
        const globalVal = document.getElementById('global-trip-val');
        if (globalSlider && globalVal) {
            globalSlider.oninput = () => globalVal.textContent = `${globalSlider.value}°C`;
        }

        // Open 2nd Modal for Proc Driver Detection
        document.getElementById('open-proc-modal-btn').onclick = () => {
            showProcThermalModal();
        };

        // Scan zones after modal renders
        scanZones();

        // Bind Apply Policy to All
        document.getElementById('apply-policy-all-btn').onclick = async () => {
            const selectedPolicy = document.getElementById('global-policy-select').value;
            if (!selectedPolicy) return;
            await applyPolicyToAll(selectedPolicy);
        };

        // Bind Apply Trip to All
        document.getElementById('apply-trip-all-btn').onclick = async () => {
            const targetTemp = parseInt(globalSlider.value);
            await applyTripTempToAll(targetTemp);
        };

        // Toggle all mode button
        document.getElementById('thermal-toggle-btn').onclick = async () => {
            await toggleAllThermals();
        };

        // Close button
        document.getElementById('thermal-cancel-btn').onclick = () => modal.remove();
    }

    async function scanZones() {
        const listEl = document.getElementById('thermal-list');
        const statusEl = document.getElementById('thermal-scan-status');
        const globalPolicySelect = document.getElementById('global-policy-select');
        if (!listEl || !statusEl) return;

        try {
            const pathsRaw = await execFn('ls -d /sys/class/thermal/thermal_zone* 2>/dev/null');
            const paths = pathsRaw.trim().split('\n').filter(p => p.trim());

            if (!paths.length) {
                statusEl.innerHTML = '<span style="color: #ffffff;">No thermal zones found on this device.</span>';
                listEl.style.display = 'none';
                return;
            }

            statusEl.style.display = 'none';
            listEl.style.display = 'flex';
            detectedZones = [];
            const allAvailablePolicies = new Set();

            for (const path of paths) {
                const idMatch = path.match(/thermal_zone(\d+)/);
                if (!idMatch) continue;
                const id = idMatch[1];

                const [typeRaw, modeRaw, tempRaw, policyRaw, availPoliciesRaw, tripsRaw] = await Promise.all([
                    execFn(`cat ${path}/type 2>/dev/null`),
                    execFn(`cat ${path}/mode 2>/dev/null`),
                    execFn(`cat ${path}/temp 2>/dev/null`),
                    execFn(`cat ${path}/policy 2>/dev/null`),
                    execFn(`cat ${path}/available_policies 2>/dev/null`),
                    execFn(`ls ${path}/trip_point_*_temp 2>/dev/null`)
                ]);

                const type = (typeRaw || '').trim() || 'Unknown';
                const mode = (modeRaw || '').trim().toLowerCase() || 'enabled';
                const tempVal = parseInt(tempRaw) || 0;
                const temp = tempVal > 0 ? `${(tempVal / 1000).toFixed(1)}°C` : 'N/A';
                const policy = (policyRaw || '').trim() || 'N/A';
                const availablePolicies = (availPoliciesRaw || '').trim().split(/\s+/).filter(p => p);

                availablePolicies.forEach(p => allAvailablePolicies.add(p));

                // Parse trip points
                const tripFiles = (tripsRaw || '').trim().split('\n').filter(f => f.trim());
                const tripPoints = [];
                for (const tripFile of tripFiles) {
                    const tripName = tripFile.split('/').pop();
                    const tripValRaw = await execFn(`cat ${tripFile} 2>/dev/null`);
                    const tripVal = parseInt(tripValRaw) || 0;
                    tripPoints.push({ file: tripFile, name: tripName, temp: Math.round(tripVal / 1000) });
                }

                detectedZones.push({ id, path, type, mode, temp, policy, availablePolicies, tripPoints });

                const isDisabled = mode === 'disabled';
                const zoneEl = document.createElement('div');
                zoneEl.style.cssText = 'background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 12px; padding: 12px; display: flex; flex-direction: column; gap: 8px;';
                
                let policyOptions = availablePolicies.map(p => `<option value="${p}" ${p === policy ? 'selected' : ''}>${p}</option>`).join('');

                zoneEl.innerHTML = `
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <div>
                            <div style="color: #ffffff; font-size: 13px; font-weight: 600;">Zone ${id} <span style="color: #ffffff; opacity: 0.7; font-weight: 400; font-size: 11px;">(${type})</span></div>
                            <div style="color: #ffffff; font-size: 11px; margin-top: 2px;">Temp: ${temp} • State: <span style="color: ${isDisabled ? 'var(--accent-green)' : 'var(--accent-red)'}">${mode}</span></div>
                        </div>
                        <button class="thermal-zone-toggle" data-id="${id}" data-mode="${mode}" style="background: ${isDisabled ? 'var(--accent-green)' : 'var(--accent-red)'}; color: #ffffff; border: none; padding: 6px 12px; border-radius: 8px; font-size: 11px; font-weight: 600; cursor: pointer;">
                            ${isDisabled ? 'Enable' : 'Disable'}
                        </button>
                    </div>

                    ${availablePolicies.length ? `
                    <div style="display: flex; gap: 8px; align-items: center;">
                        <span style="font-size: 11px; color: #aaa;">Policy:</span>
                        <select class="zone-policy-select" data-path="${path}" style="flex: 1; padding: 4px; background: var(--bg-card); color: #fff; border: 1px solid var(--border-color); border-radius: 6px; font-size: 10px;">
                            ${policyOptions}
                        </select>
                    </div>` : ''}

                    ${tripPoints.length ? `
                    <div style="display: flex; flex-direction: column; gap: 4px; margin-top: 4px; background: var(--bg-card); padding: 8px; border-radius: 8px;">
                        <span style="font-size: 10px; color: var(--accent-orange); font-weight: 600;">Trip Point Adjustment:</span>
                        ${tripPoints.map(tp => `
                            <div style="display: flex; align-items: center; gap: 6px;">
                                <span style="font-size: 10px; color: #ccc; min-width: 70px;">${tp.name.replace('_temp','')}:</span>
                                <input type="range" class="trip-slider" data-file="${tp.file}" min="40" max="200" value="${tp.temp}" style="flex: 1; accent-color: var(--accent-orange);">
                                <span class="trip-val" style="font-size: 10px; color: #fff; min-width: 35px; text-align: right;">${tp.temp}°C</span>
                            </div>
                        `).join('')}
                    </div>` : ''}
                `;
                listEl.appendChild(zoneEl);
            }

            // Populate Global Policy Options
            if (globalPolicySelect) {
                globalPolicySelect.innerHTML = Array.from(allAvailablePolicies).map(p => `<option value="${p}">${p}</option>`).join('');
            }

            // Bind Individual Mode Toggle Buttons
            listEl.querySelectorAll('.thermal-zone-toggle').forEach(btn => {
                btn.onclick = async (e) => {
                    const id = e.currentTarget.dataset.id;
                    const currentMode = e.currentTarget.dataset.mode;
                    const newMode = currentMode === 'disabled' ? 'enabled' : 'disabled';
                    const zone = detectedZones.find(z => z.id === id);
                    if (zone) {
                        await execFn(`su -c "chmod 666 ${zone.path}/mode && echo ${newMode} > ${zone.path}/mode"`);
                        setTimeout(() => showThermalModal(), 300);
                    }
                };
            });

            // Bind Individual Policy Change Selectors
            listEl.querySelectorAll('.zone-policy-select').forEach(sel => {
                sel.onchange = async (e) => {
                    const path = e.target.dataset.path;
                    const newPolicy = e.target.value;
                    await execFn(`su -c "chmod 666 ${path}/policy && echo ${newPolicy} > ${path}/policy"`);
                };
            });

            // Bind Individual Trip Sliders
            listEl.querySelectorAll('.trip-slider').forEach(slider => {
                slider.oninput = (e) => {
                    const valSpan = e.target.parentElement.querySelector('.trip-val');
                    if (valSpan) valSpan.textContent = `${e.target.value}°C`;
                };
                slider.onchange = async (e) => {
                    const file = e.target.dataset.file;
                    const milliDeg = parseInt(e.target.value) * 1000;
                    await execFn(`su -c "chmod 666 ${file} && echo ${milliDeg} > ${file}"`);
                };
            });

        } catch (e) {
            console.error('ThermalZone: Scan failed:', e);
            statusEl.innerHTML = `<span style="color: var(--accent-red);">❌ Scan error: ${e.message}</span>`;
        }
    }

    async function applyPolicyToAll(policy) {
        const statusEl = document.getElementById('thermal-scan-status');
        statusEl.style.display = 'block';
        statusEl.innerHTML = `<span style="color: var(--accent-orange);">🔄 Setting policy ${policy} on all zones...</span>`;
        for (const zone of detectedZones) {
            if (zone.availablePolicies.includes(policy)) {
                await execFn(`su -c "chmod 666 ${zone.path}/policy && echo ${policy} > ${zone.path}/policy"`);
            }
        }
        statusEl.innerHTML = `<span style="color: var(--accent-green);">✅ Applied policy ${policy} to matching zones</span>`;
        setTimeout(() => showThermalModal(), 1000);
    }

    async function applyTripTempToAll(targetTemp) {
        const statusEl = document.getElementById('thermal-scan-status');
        statusEl.style.display = 'block';
        statusEl.innerHTML = `<span style="color: var(--accent-orange);">🔄 Setting all trip points to ${targetTemp}°C...</span>`;
        const milliDeg = targetTemp * 1000;
        for (const zone of detectedZones) {
            for (const tp of zone.tripPoints) {
                await execFn(`su -c "chmod 666 ${tp.file} && echo ${milliDeg} > ${tp.file}"`);
            }
        }
        statusEl.innerHTML = `<span style="color: var(--accent-green);">✅ All trip points set to ${targetTemp}°C</span>`;
        setTimeout(() => showThermalModal(), 1000);
    }

    async function toggleAllThermals() {
        const toggleBtn = document.getElementById('thermal-toggle-btn');
        const statusEl = document.getElementById('thermal-scan-status');        
        if (!toggleBtn || !statusEl) return;

        toggleBtn.disabled = true;
        statusEl.style.display = 'block';
        statusEl.innerHTML = '<span style="color: var(--accent-orange);">🔄 Updating all zones...</span>';

        try {
            const newMode = thermalState === 'disabled' ? 'enabled' : 'disabled';
            for (const zone of detectedZones) {
                await execFn(`su -c "chmod 666 ${zone.path}/mode && echo ${newMode} > ${zone.path}/mode"`);
            }

            thermalState = newMode;
            await execFn(`mkdir -p /sdcard/MTK_AI_Engine && echo "state=${thermalState}" > ${CONFIG_FILE}`);
            statusEl.innerHTML = `<span style="color: var(--accent-green);">✅ All zones ${newMode}</span>`;
            
            if (window.showStatus) {
                window.showStatus(`✅ Thermal zones: ${newMode}`, 'var(--accent-orange)');
            }

            setTimeout(() => {
                document.getElementById('thermal-modal')?.remove();
                showThermalModal();
            }, 1000);

        } catch (e) {
            console.error('ThermalZone: Toggle failed:', e);
            statusEl.innerHTML = `<span style="color: var(--accent-red);">❌ Error: ${e.message}</span>`;
        }
    }

    /* ==========================================================================
       MODAL 2: MEDIATEK PROC THERMAL DRIVER DETECTOR (/proc/driver/thermal)
       ========================================================================== */
    async function showProcThermalModal() {
        const existing = document.getElementById('proc-thermal-modal');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = 'proc-thermal-modal';
        modal.style.cssText = `
            position: fixed; inset: 0; background: rgba(0,0,0,0.85); z-index: 10001;
            display: flex; align-items: center; justify-content: center;
            backdrop-filter: blur(5px); padding: 10px;
        `;

        const box = document.createElement('div');
        box.style.cssText = `
            background: linear-gradient(135deg, var(--bg-secondary) 0%, var(--bg-card) 100%);
            border: 1px solid var(--border-color);
            border-radius: 20px; padding: 20px; width: 100%; max-width: 480px;
            max-height: 85vh; display: flex; flex-direction: column;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5); overflow: hidden;
        `;

        box.innerHTML = `
            <h3 style="color: #ffffff; margin: 0 0 5px; font-size: 18px; text-align: center;">⚡ MediaTek Thermal Detector</h3>
            <p style="color: #ffffff; opacity: 0.8; font-size: 11px; text-align: center; margin-bottom: 15px;">Detecting legacy MediaTek /proc/driver/thermal nodes</p>

            <div id="proc-scan-status" style="text-align: center; font-size: 12px; color: #ffffff; margin-bottom: 10px; padding: 8px; background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 8px;">
                <span style="color: var(--accent-orange);">🔍 Scanning /proc/driver/thermal...</span>
            </div>

            <!-- List of detected Proc Nodes -->
            <div id="proc-node-list" style="display: flex; flex-direction: column; gap: 8px; overflow-y: auto; flex: 1; padding-right: 4px; margin-bottom: 12px;">
                <!-- Proc entries injected here -->
            </div>

            <!-- Interactive Temperature Limit Control Slider -->
            <div style="background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 12px; padding: 12px; margin-bottom: 12px; display: flex; flex-direction: column; gap: 8px;">
                <div style="display: flex; justify-content: space-between; align-items: center; font-size: 11px; color: #fff;">
                    <span>MTK Driver Limit Target:</span>
                    <span id="proc-temp-val" style="font-weight: 700; color: var(--accent-orange); font-size: 13px;">100°C</span>
                </div>
                <input type="range" id="proc-temp-slider" min="50" max="200" value="100" step="1" style="width: 100%; accent-color: var(--accent-orange); cursor: pointer;">
            </div>

            <div style="display: flex; gap: 8px;">
                <button id="override-proc-btn" style="flex: 1; padding: 12px; background: var(--accent-orange); color: #fff; border: none; border-radius: 10px; font-size: 12px; font-weight: 700; cursor: pointer;">
                    🔥 Apply Custom Limit
                </button>
                <button id="close-proc-btn" style="padding: 12px 16px; background: var(--bg-secondary); color: #fff; border: 1px solid var(--border-color); border-radius: 10px; font-size: 12px; cursor: pointer;">Close</button>
            </div>
        `;

        modal.appendChild(box);
        document.body.appendChild(modal);

        modal.onclick = e => { if (e.target === modal) modal.remove(); };

        // Bind Slider live value readout
        const procSlider = box.querySelector('#proc-temp-slider');
        const procValSpan = box.querySelector('#proc-temp-val');
        if (procSlider && procValSpan) {
            procSlider.oninput = () => {
                procValSpan.textContent = `${procSlider.value}°C`;
            };
        }

        document.getElementById('close-proc-btn').onclick = () => modal.remove();
        document.getElementById('override-proc-btn').onclick = async () => {
            const targetDeg = parseInt(procSlider.value) || 100;
            await overrideProcThermals(targetDeg);
        };

        await scanProcNodes();
    }

    async function scanProcNodes() {
        const statusEl = document.getElementById('proc-scan-status');
        const listEl = document.getElementById('proc-node-list');
        if (!statusEl || !listEl) return;

        try {
            const rawNodes = await execFn('ls /proc/driver/thermal/ 2>/dev/null');
            if (!rawNodes || !rawNodes.trim()) {
                statusEl.innerHTML = '<span style="color: #aaa;">/proc/driver/thermal not detected on this device.</span>';
                return;
            }

            const nodes = rawNodes.trim().split('\n').filter(n => n.trim());
            statusEl.innerHTML = `<span style="color: var(--accent-green);">✅ Detected ${nodes.length} MediaTek Thermal Nodes</span>`;

            listEl.innerHTML = '';
            detectedProcNodes = [];

            for (const node of nodes) {
                const nodePath = `/proc/driver/thermal/${node}`;
                const content = await execFn(`cat ${nodePath} 2>/dev/null | head -n 3`);
                
                detectedProcNodes.push({ name: node, path: nodePath, content });

                const card = document.createElement('div');
                card.style.cssText = 'background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 8px; padding: 8px; font-size: 11px;';
                card.innerHTML = `
                    <div style="color: var(--accent-orange); font-weight: 600;">/proc/driver/thermal/${node}</div>
                    <pre style="margin: 4px 0 0; font-size: 9px; color: #ccc; white-space: pre-wrap; font-family: monospace;">${content || '[No readable data]'}</pre>
                `;
                listEl.appendChild(card);
            }

        } catch (e) {
            statusEl.innerHTML = `<span style="color: var(--accent-red);">❌ Proc scan error: ${e.message}</span>`;
        }
    }

    async function overrideProcThermals(targetDeg = 100) {
        const statusEl = document.getElementById('proc-scan-status');
        if (statusEl) {
            statusEl.innerHTML = `<span style="color: var(--accent-orange);">🔥 Applying ${targetDeg}°C limit to MTK drivers...</span>`;
        }

        const targetNodes = ['tzcpu', 'tzpmic', 'tzbattery', 'tzpa', 'tzcharger', 'tzwmt', 'tzbts', 'tzbtsnrpa', 'tzbtspa', 'tzdctm'];
        const noCooler = "0 0 no-cooler 0 0 no-cooler 0 0 no-cooler 0 0 no-cooler 0 0 no-cooler 0 0 no-cooler 0 0 no-cooler 0 0 no-cooler 0 0 no-cooler";
        const milliDeg = targetDeg * 1000;

        for (const node of targetNodes) {
            const p = `/proc/driver/thermal/${node}`;
            await execFn(`su -c "chmod 644 ${p} && echo '1 ${milliDeg} 0 ${node}-sysrst ${noCooler} 1000' > ${p} && chmod 444 ${p}"`);
        }

        // Also disable SSPM throttling if present
        await execFn('su -c "echo 1 > /proc/driver/thermal/sspm_thermal_throttle 2>/dev/null"');

        if (statusEl) {
            statusEl.innerHTML = `<span style="color: var(--accent-green);">✅ MediaTek thermal limits set to ${targetDeg}°C</span>`;
        }
        setTimeout(() => scanProcNodes(), 1000);
    }

    // Initialize module
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    window.ThermalZoneManager = { init, showThermalModal, showProcThermalModal };
})();
