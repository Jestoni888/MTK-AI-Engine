// thermalzone.js - Advanced Thermal Zone & MTK Proc Thermal Manager
(function() {
    'use strict';

    const CONFIG_FILE = '/sdcard/MTK_AI_Engine/thermal.conf';
    let thermalState = 'enabled'; // 'enabled' or 'disabled'
    let detectedZones = [];
    let detectedProcNodes = [];

    // Exact kernel handler label and polling interval mappings matching test.sh
    const MTK_NODE_CONFIG = {
        'tzcpu':     { label: 'mtktscpu-sysrst', interval: 200 },
        'tzpmic':    { label: 'mtktspmic-sysrst', interval: 1000 },
        'tzbattery': { label: 'mtktsbattery-sysrst', interval: 1000 },
        'tzpa':      { label: 'mtk-cl-kshutdown00', interval: 2000 },
        'tzcharger': { label: 'mtktscharger-sysrst', interval: 2000 },
        'tzwmt':     { label: 'mtktswmt-sysrst', interval: 1000 },
        'tzbts':     { label: 'mtktsAP-sysrst', interval: 1000 },
        'tzbtsnrpa': { label: 'mtk-cl-kshutdown01', interval: 1000 },
        'tzbtspa':   { label: 'mtk-cl-kshutdown02', interval: 1000 },
        'tzdctm':    { label: 'mtktsdctm-sysrst', interval: 1000 }
    };

    function getProcNodeSpec(nodeName) {
        const key = nodeName.toLowerCase();
        if (MTK_NODE_CONFIG[key]) {
            return MTK_NODE_CONFIG[key];
        }
        if (key.startsWith('tzimgs')) {
            return { label: `${key}-sysrst`, interval: 1000 };
        }
        return { label: `${nodeName}-sysrst`, interval: 1000 };
    }

    // Safe root exec wrapper
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
       MODAL 1: SYSFS THERMAL ZONES (/sys/class/thermal)
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
            <p style="color: #ffffff; opacity: 0.8; font-size: 12px; text-align: center; margin-bottom: 15px;">Configure modes, policies, and individual trip point temperatures</p>

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

                <!-- Global Trip 0 Slider -->
                <div style="display: flex; flex-direction: column; gap: 4px;">
                    <div style="display: flex; justify-content: space-between; font-size: 11px; color: #fff;">
                        <span>Apply Target Temp to Trip_0 / All Trips:</span>
                        <span id="global-trip-val" style="font-weight: 700; color: var(--accent-orange);">95°C</span>
                    </div>
                    <div style="display: flex; gap: 8px; align-items: center;">
                        <input type="range" id="global-trip-slider" min="30" max="200" value="95" style="flex: 1; accent-color: var(--accent-orange);">
                        <button id="apply-trip-0-btn" style="padding: 6px 10px; background: var(--accent-orange); color: #fff; border: none; border-radius: 8px; font-size: 10px; font-weight: 600; cursor: pointer;">Trip 0 Only</button>
                        <button id="apply-trip-all-btn" style="padding: 6px 10px; background: var(--bg-card); border: 1px solid var(--border-color); color: #fff; border-radius: 8px; font-size: 10px; cursor: pointer;">All Trips</button>
                    </div>
                </div>
            </div>

            <div id="thermal-scan-status" style="text-align: center; font-size: 12px; color: #ffffff; margin-bottom: 10px; padding: 8px; background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 8px;">
                <span style="color: var(--accent-orange);">🔍 Scanning sysfs thermal zones...</span>
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

        const globalSlider = document.getElementById('global-trip-slider');
        const globalVal = document.getElementById('global-trip-val');
        if (globalSlider && globalVal) {
            globalSlider.oninput = () => globalVal.textContent = `${globalSlider.value}°C`;
        }

        document.getElementById('open-proc-modal-btn').onclick = () => showProcThermalModal();
        scanZones();

        document.getElementById('apply-policy-all-btn').onclick = async () => {
            const selectedPolicy = document.getElementById('global-policy-select').value;
            if (!selectedPolicy) return;
            await applyPolicyToAll(selectedPolicy);
        };

        document.getElementById('apply-trip-0-btn').onclick = async () => {
            const targetTemp = parseInt(globalSlider.value);
            await applyTripTempToAll(targetTemp, true);
        };

        document.getElementById('apply-trip-all-btn').onclick = async () => {
            const targetTemp = parseInt(globalSlider.value);
            await applyTripTempToAll(targetTemp, false);
        };

        document.getElementById('thermal-toggle-btn').onclick = async () => {
            await toggleAllThermals();
        };

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

                const tripFiles = (tripsRaw || '').trim().split('\n').filter(f => f.trim());
                const tripPoints = [];
                for (const tripFile of tripFiles) {
                    const tripName = tripFile.split('/').pop().replace('_temp', '');
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
                    <div style="display: flex; flex-direction: column; gap: 6px; margin-top: 4px; background: var(--bg-card); padding: 8px; border-radius: 8px;">
                        <span style="font-size: 10px; color: var(--accent-orange); font-weight: 600;">Trip Point Temperature Sliders:</span>
                        ${tripPoints.map(tp => `
                            <div style="display: flex; align-items: center; gap: 6px;">
                                <span style="font-size: 10px; color: ${tp.name.includes('trip_point_0') ? 'var(--accent-orange)' : '#ccc'}; min-width: 80px; font-weight: ${tp.name.includes('trip_point_0') ? '700' : '400'};">
                                    ${tp.name}:
                                </span>
                                <input type="range" class="trip-slider" data-file="${tp.file}" min="30" max="200" value="${tp.temp}" style="flex: 1; accent-color: var(--accent-orange);">
                                <span class="trip-val" style="font-size: 10px; color: #fff; min-width: 35px; text-align: right;">${tp.temp}°C</span>
                            </div>
                        `).join('')}
                    </div>` : ''}
                `;
                listEl.appendChild(zoneEl);
            }

            if (globalPolicySelect) {
                globalPolicySelect.innerHTML = Array.from(allAvailablePolicies).map(p => `<option value="${p}">${p}</option>`).join('');
            }

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

            listEl.querySelectorAll('.zone-policy-select').forEach(sel => {
                sel.onchange = async (e) => {
                    const path = e.target.dataset.path;
                    const newPolicy = e.target.value;
                    await execFn(`su -c "chmod 666 ${path}/policy && echo ${newPolicy} > ${path}/policy"`);
                };
            });

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

    async function applyTripTempToAll(targetTemp, onlyTripZero = false) {
        const statusEl = document.getElementById('thermal-scan-status');
        statusEl.style.display = 'block';
        statusEl.innerHTML = `<span style="color: var(--accent-orange);">🔄 Setting ${onlyTripZero ? 'trip_0' : 'all'} trip points to ${targetTemp}°C...</span>`;
        const milliDeg = targetTemp * 1000;
        for (const zone of detectedZones) {
            for (const tp of zone.tripPoints) {
                if (!onlyTripZero || tp.name.includes('trip_point_0')) {
                    await execFn(`su -c "chmod 666 ${tp.file} && echo ${milliDeg} > ${tp.file}"`);
                }
            }
        }
        statusEl.innerHTML = `<span style="color: var(--accent-green);">✅ Target ${targetTemp}°C set on ${onlyTripZero ? 'trip_0' : 'all'} trip points</span>`;
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
            <p style="color: #ffffff; opacity: 0.8; font-size: 11px; text-align: center; margin-bottom: 15px;">Detecting and tuning legacy MediaTek /proc/driver/thermal nodes</p>

            <div id="proc-scan-status" style="text-align: center; font-size: 12px; color: #ffffff; margin-bottom: 10px; padding: 8px; background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 8px;">
                <span style="color: var(--accent-orange);">🔍 Scanning /proc/driver/thermal...</span>
            </div>

            <!-- Global Master Slider for all MTK proc thermals -->
            <div style="background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 12px; padding: 10px; margin-bottom: 10px; display: flex; flex-direction: column; gap: 6px;">
                <div style="display: flex; justify-content: space-between; align-items: center; font-size: 11px; color: #fff;">
                    <span style="font-weight: 600; color: var(--accent-orange);">Master Override Limit (All MTK Nodes):</span>
                    <span id="proc-temp-val" style="font-weight: 700; color: var(--accent-orange); font-size: 12px;">125°C</span>
                </div>
                <div style="display: flex; gap: 8px; align-items: center;">
                    <input type="range" id="proc-temp-slider" min="50" max="200" value="125" step="1" style="flex: 1; accent-color: var(--accent-orange); cursor: pointer;">
                    <button id="override-proc-btn" style="padding: 6px 12px; background: var(--accent-orange); color: #fff; border: none; border-radius: 8px; font-size: 10px; font-weight: 700; cursor: pointer;">
                        Apply to All
                    </button>
                </div>
            </div>

            <!-- List of detected Proc Nodes with Individual Sliders -->
            <div id="proc-node-list" style="display: flex; flex-direction: column; gap: 8px; overflow-y: auto; flex: 1; padding-right: 4px; margin-bottom: 12px;">
                <!-- Proc entries injected here -->
            </div>

            <div style="display: flex; justify-flex-end;">
                <button id="close-proc-btn" style="width: 100%; padding: 12px; background: var(--bg-secondary); color: #fff; border: 1px solid var(--border-color); border-radius: 10px; font-size: 12px; cursor: pointer;">Close</button>
            </div>
        `;

        modal.appendChild(box);
        document.body.appendChild(modal);

        modal.onclick = e => { if (e.target === modal) modal.remove(); };

        const procSlider = box.querySelector('#proc-temp-slider');
        const procValSpan = box.querySelector('#proc-temp-val');
        if (procSlider && procValSpan) {
            procSlider.oninput = () => {
                procValSpan.textContent = `${procSlider.value}°C`;
            };
        }

        document.getElementById('close-proc-btn').onclick = () => modal.remove();
        document.getElementById('override-proc-btn').onclick = async () => {
            const targetDeg = parseInt(procSlider.value) || 125;
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
                const isTunable = node.startsWith('tz');

                detectedProcNodes.push({ name: node, path: nodePath, content, isTunable });

                const card = document.createElement('div');
                card.style.cssText = 'background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 10px; padding: 10px; font-size: 11px; display: flex; flex-direction: column; gap: 6px;';
                
                card.innerHTML = `
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <span style="color: var(--accent-orange); font-weight: 600;">/proc/driver/thermal/${node}</span>
                        ${isTunable ? `<span style="color: var(--accent-green); font-size: 9px; border: 1px solid var(--accent-green); padding: 1px 4px; border-radius: 4px;">Tunable Zone</span>` : ''}
                    </div>
                    <pre style="margin: 0; font-size: 9px; color: #ccc; white-space: pre-wrap; font-family: monospace; background: var(--bg-card); padding: 6px; border-radius: 6px; max-height: 50px; overflow: hidden;">${content || '[No readable data]'}</pre>
                    
                    ${isTunable ? `
                    <div style="display: flex; flex-direction: column; gap: 4px; margin-top: 2px;">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <span style="font-size: 10px; color: #aaa;">Individual Limit Temp:</span>
                            <span class="proc-node-val" style="font-size: 10px; font-weight: 700; color: var(--accent-orange);">125°C</span>
                        </div>
                        <div style="display: flex; gap: 8px; align-items: center;">
                            <input type="range" class="proc-node-slider" data-node="${node}" min="50" max="200" value="125" style="flex: 1; accent-color: var(--accent-orange);">
                            <button class="apply-node-btn" data-node="${node}" style="padding: 4px 10px; background: var(--bg-card); border: 1px solid var(--border-color); color: #fff; border-radius: 6px; font-size: 10px; cursor: pointer;">Apply</button>
                        </div>
                    </div>
                    ` : ''}
                `;
                listEl.appendChild(card);
            }

            listEl.querySelectorAll('.proc-node-slider').forEach(slider => {
                slider.oninput = (e) => {
                    const valSpan = e.target.parentElement.parentElement.querySelector('.proc-node-val');
                    if (valSpan) valSpan.textContent = `${e.target.value}°C`;
                };
            });

            listEl.querySelectorAll('.apply-node-btn').forEach(btn => {
                btn.onclick = async (e) => {
                    const nodeName = e.target.dataset.node;
                    const slider = e.target.parentElement.querySelector('.proc-node-slider');
                    const targetDeg = parseInt(slider.value) || 125;
                    await writeSingleProcNode(nodeName, targetDeg);
                };
            });

        } catch (e) {
            statusEl.innerHTML = `<span style="color: var(--accent-red);">❌ Proc scan error: ${e.message}</span>`;
        }
    }

    async function writeSingleProcNode(nodeName, targetDeg) {
        const statusEl = document.getElementById('proc-scan-status');
        if (statusEl) {
            statusEl.innerHTML = `<span style="color: var(--accent-orange);">🔄 Setting ${nodeName} to ${targetDeg}°C...</span>`;
        }
        
        const milliDeg = targetDeg * 1000;
        const p = `/proc/driver/thermal/${nodeName}`;
        const spec = getProcNodeSpec(nodeName);
        const noCooler = "0 0 no-cooler 0 0 no-cooler 0 0 no-cooler 0 0 no-cooler 0 0 no-cooler 0 0 no-cooler 0 0 no-cooler 0 0 no-cooler 0 0 no-cooler";

        await execFn(`su -c "chmod 644 ${p} && echo '1 ${milliDeg} 0 ${spec.label} ${noCooler} ${spec.interval}' > ${p} && chmod 444 ${p}"`);

        if (statusEl) {
            statusEl.innerHTML = `<span style="color: var(--accent-green);">✅ Updated ${nodeName} (${spec.label}) to ${targetDeg}°C</span>`;
        }
        setTimeout(() => scanProcNodes(), 1000);
    }

    async function overrideProcThermals(targetDeg = 125) {
        const statusEl = document.getElementById('proc-scan-status');
        if (statusEl) {
            statusEl.innerHTML = `<span style="color: var(--accent-orange);">🔥 Applying ${targetDeg}°C limit across all MTK nodes...</span>`;
        }

        const milliDeg = targetDeg * 1000;
        const noCooler = "0 0 no-cooler 0 0 no-cooler 0 0 no-cooler 0 0 no-cooler 0 0 no-cooler 0 0 no-cooler 0 0 no-cooler 0 0 no-cooler 0 0 no-cooler";

        const primaryNodes = ['tzcpu', 'tzpmic', 'tzbattery', 'tzpa', 'tzcharger', 'tzwmt', 'tzbts', 'tzbtsnrpa', 'tzbtspa', 'tzdctm'];
        
        for (const node of primaryNodes) {
            const p = `/proc/driver/thermal/${node}`;
            const spec = getProcNodeSpec(node);
            await execFn(`su -c "chmod 644 ${p} 2>/dev/null && echo '1 ${milliDeg} 0 ${spec.label} ${noCooler} ${spec.interval}' > ${p} 2>/dev/null && chmod 444 ${p} 2>/dev/null"`);
        }

        for (let i = 0; i <= 12; i++) {
            const p = `/proc/driver/thermal/tzimgs${i}`;
            await execFn(`su -c "chmod 644 ${p} 2>/dev/null && echo '1 ${milliDeg} 0 tzimgs${i}-sysrst ${noCooler} 1000' > ${p} 2>/dev/null && chmod 444 ${p} 2>/dev/null"`);
        }

        // Disable global polling and SSPM thermal throttling as in test.sh
        await execFn('su -c "echo \\"switch 0\\" > /proc/driver/thermal/tztsAll_enable 2>/dev/null"');
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
