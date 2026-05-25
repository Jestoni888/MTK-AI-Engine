// cpu.js - CPU Frequency Control - TRUE POPUP MODAL (profile.js pattern)
(function() {
    'use strict';

    const CONFIG_DIR = '/sdcard/MTK_AI_Engine';
    const GOV_CONFIG = `${CONFIG_DIR}/manual_governor.txt`;
    const FREQ_CONFIG = `${CONFIG_DIR}/freq_limits.json`;
    const BUSYBOX = '/data/adb/modules/MTK_AI/busybox';

    let availableGovernors = [];
    let currentGovernor = 'performance';
    let policies = [];
    let coreCount = 8;
    let panelVisible = false;
    let panelRendered = false;
    let freqUpdateInterval = null;
    let applyDebounceTimers = {};
    let protectionEnabled = true;
    let modalElement = null;

    console.log('[CPU.js] Script loaded - True Popup Modal');

    // ✅ execFn (unchanged - your existing implementation)
    const execFn = async function(cmd, timeout = 10000) {
        return new Promise((resolve) => {
            const cb = `cpu_exec_${Date.now()}_${Math.random().toString(36).substring(2)}`;
            let settled = false;
            const t = setTimeout(() => {
                if (!settled) { settled = true; delete window[cb]; resolve('TIMEOUT'); }
            }, timeout);
            
            window[cb] = (code, res) => {
                if (settled) return;
                settled = true;
                clearTimeout(t);
                delete window[cb];
                resolve(res || '');
            };
            
            try {
                if (window.ksu && typeof ksu.exec === 'function') {
                    ksu.exec(cmd, `window.${cb}`);
                } else {
                    settled = true; clearTimeout(t); delete window[cb];
                    resolve('ERROR: No KernelSU');
                }
            } catch (e) {
                settled = true; clearTimeout(t); delete window[cb];
                resolve(`ERROR: ${e.message}`);
            }        });
    };

    async function writeWithBusybox(path, value) {
        try {
            await execFn(`su -c 'chmod 666 "${path}"'`, 2000);
            await new Promise(r => setTimeout(r, 50));
            await execFn(`su -c '${BUSYBOX} echo "${value}" > "${path}"'`, 5000);
            await new Promise(r => setTimeout(r, 50));
            const verify = await execFn(`${BUSYBOX} cat "${path}" 2>/dev/null`, 2000);
            return verify?.trim() === value.toString();
        } catch (e) {
            console.error(`Write failed for ${path}:`, e);
            return false;
        }
    }

    async function lockFilePermissions(path) {
        if (!protectionEnabled) return true;
        try {
            await execFn(`su -c 'chmod 000 "${path}"'`, 2000);
            return true;
        } catch (e) {
            console.warn(`Failed to lock ${path}:`, e);
            return false;
        }
    }

    async function unlockFilePermissions(path) {
        try {
            await execFn(`su -c 'chmod 666 "${path}"'`, 2000);
            return true;
        } catch (e) {
            console.warn(`Failed to unlock ${path}:`, e);
            return false;
        }
    }

    async function safeRead(path) {
        await unlockFilePermissions(path);
        const res = await execFn(`${BUSYBOX} cat "${path}" 2>/dev/null`, 3000);
        return res?.trim() || '';
    }

    async function init() {
        try {
            console.log('[CPU.js] Initializing...');
            await ensureConfigDir();
            try {
                const existing = await safeRead(FREQ_CONFIG);                if (!existing || existing === '{}') {
                    await execFn(`su -c '${BUSYBOX} echo "{}" > "${FREQ_CONFIG}"'`, 3000);
                } else {
                    JSON.parse(existing);
                }
            } catch (e) {
                console.log('[CPU.js] Creating fresh config file');
                await execFn(`su -c '${BUSYBOX} echo "{}" > "${FREQ_CONFIG}"'`, 3000);
            }
            
            await loadSystemData();
            await loadSavedSettings();
            setupToggleHandler();
            console.log('[CPU.js] Initialization complete');
        } catch (e) {
            console.error('[CPU.js] Initialization failed:', e);
        }
    }

    async function ensureConfigDir() {
        await execFn(`su -c 'mkdir -p "${CONFIG_DIR}"'`, 3000);
    }

    async function loadSystemData() {
        const cpuTopo = await execFn(`${BUSYBOX} ls -d /sys/devices/system/cpu/cpu[0-9]* 2>/dev/null | ${BUSYBOX} wc -l`);
        coreCount = parseInt(cpuTopo) || 8;

        const raw = await safeRead('/sys/devices/system/cpu/cpu0/cpufreq/scaling_available_governors');
        availableGovernors = raw?.split(/\s+/).filter(g => g) || ['performance', 'schedutil', 'powersave'];

        const policyList = await execFn(`${BUSYBOX} ls -d /sys/devices/system/cpu/cpufreq/policy* 2>/dev/null`);
        const policyIds = (policyList?.match(/policy\d+/g) || []).sort((a,b) => {
            const na = parseInt(a.replace('policy','')), nb = parseInt(b.replace('policy',''));
            return na - nb;
        });

        for (const pid of policyIds) {
            const basePath = `/sys/devices/system/cpu/cpufreq/${pid}`;
            const cpuinfoMin = parseInt(await safeRead(`${basePath}/cpuinfo_min_freq`)) || 500000;
            const cpuinfoMax = parseInt(await safeRead(`${basePath}/cpuinfo_max_freq`)) || 2000000;
            
            const min = parseInt(await safeRead(`${basePath}/scaling_min_freq`)) || cpuinfoMin;
            const max = parseInt(await safeRead(`${basePath}/scaling_max_freq`)) || cpuinfoMax;
            
            const cpus = (await execFn(`${BUSYBOX} cat ${basePath}/affected_cpus 2>/dev/null`))?.trim().split(/\s+/).map(Number).filter(n => !isNaN(n)) || [];
            
            policies.push({
                id: pid, cpus, curFreq: 0, min, max, cpuinfoMin, cpuinfoMax, step: 1000
            });
        }
        if (policies.length === 0) {
            for (let i = 0; i < coreCount; i++) {
                const basePath = `/sys/devices/system/cpu/cpu${i}/cpufreq`;
                const cpuinfoMin = parseInt(await safeRead(`${basePath}/cpuinfo_min_freq`)) || 500000;
                const cpuinfoMax = parseInt(await safeRead(`${basePath}/cpuinfo_max_freq`)) || 2000000;
                policies.push({
                    id: `cpu${i}`, cpus: [i], curFreq: 0,
                    min: parseInt(await safeRead(`${basePath}/scaling_min_freq`)) || cpuinfoMin,
                    max: parseInt(await safeRead(`${basePath}/scaling_max_freq`)) || cpuinfoMax,
                    cpuinfoMin, cpuinfoMax, step: 1000
                });
            }
        }
        console.log('[CPU.js] Loaded', policies.length, 'policies');
    }

    async function loadSavedSettings() {
        try {
            const savedGov = await safeRead(GOV_CONFIG);
            const liveGov = await safeRead('/sys/devices/system/cpu/cpu0/cpufreq/scaling_governor');
            currentGovernor = (savedGov && availableGovernors.includes(savedGov)) ? savedGov : (liveGov || 'performance');

            const freqJson = await safeRead(FREQ_CONFIG);
            if (freqJson && freqJson !== '{}') {
                try {
                    const saved = JSON.parse(freqJson);
                    for (const p of policies) {
                        if (saved[p.id]) {
                            p.min = Math.max(p.cpuinfoMin, Math.min(p.cpuinfoMax, saved[p.id].min ?? p.cpuinfoMin));
                            p.max = Math.min(p.cpuinfoMax, Math.max(p.cpuinfoMin, saved[p.id].max ?? p.cpuinfoMax));
                            if (p.min > p.max) { p.min = p.max; }
                        }
                    }
                } catch (e) { console.warn('[CPU.js] JSON parse error'); }
            }
        } catch (e) { console.warn('[CPU.js] Settings load error:', e); }
    }

    function setupToggleHandler() {
        const item = document.getElementById('cpu-gov-item');
        if (!item) { console.error('[CPU.js] ERROR: cpu-gov-item not found!'); return; }
        
        item.style.cursor = 'pointer';
        item.addEventListener('click', (e) => {
            if (e.target.closest('#cpu-gov-modal') || e.target.closest('#cpu-control-modal')) return;
            togglePanel();
        });
    }
    // ✅ SIMPLE TOGGLE - profile.js pattern
    function togglePanel() {
        panelVisible = !panelVisible;
        if (panelVisible) {
            if (!panelRendered) { renderModal(); panelRendered = true; }
            openModal();
        } else {
            closeModal();
        }
    }

    // ✅ SIMPLE SHOW - just toggle display:flex
    function openModal() {
        if (!modalElement) return;
        modalElement.style.display = 'flex';
        document.body.style.overflow = 'hidden'; // ← Prevent background scroll
        startFreqUpdates();
        console.log('[CPU.js] Modal opened');
    }

    // ✅ SIMPLE HIDE - just toggle display:none
    function closeModal() {
        if (!modalElement) return;
        modalElement.style.display = 'none';
        document.body.style.overflow = '';
        panelVisible = false;
        stopFreqUpdates();
        console.log('[CPU.js] Modal closed');
    }

    window.showCPUPanel = function() {
        if (!panelRendered) { renderModal(); panelRendered = true; }
        panelVisible = true;
        openModal();
    };
    
    window.closeCPUPanel = closeModal; // Public close API

    // ✅ RENDER MODAL - following profile.js structure exactly
    function renderModal() {
        console.log('[CPU.js] renderModal called');
        
        const existing = document.getElementById('cpu-control-modal');
        if (existing) existing.remove();

        // OVERLAY: fixed, full screen, flex center, backdrop
        modalElement = document.createElement('div');
        modalElement.id = 'cpu-control-modal';
        modalElement.style.cssText = `
            display: none;            position: fixed;
            top: 0; left: 0;
            width: 100%; height: 100%;
            background: rgba(0, 0, 0, 0.85);
            z-index: 10000;
            justify-content: center;
            align-items: center;
            padding: 20px;
            backdrop-filter: blur(10px);
            font-family: system-ui, -apple-system, sans-serif;
        `;
        
        // Click backdrop to close (profile.js pattern)
        modalElement.addEventListener('click', (e) => {
            if (e.target === modalElement) closeModal();
        });

        // MODAL CONTENT: simple, no positioning - overlay handles centering
        const modalContent = document.createElement('div');
        modalContent.style.cssText = `
            background: linear-gradient(135deg, #121418, #1a1f3a);
            border: 2px solid #4a9eff;
            border-radius: 16px;
            width: 100%;
            max-width: 520px;
            max-height: 90vh;
            overflow-y: auto;
            box-shadow: 0 20px 60px rgba(74, 158, 255, 0.4);
            position: relative;
            color: #fff;
        `;

        // HEADER with close button
        const header = document.createElement('div');
        header.style.cssText = 'display:flex; justify-content:space-between; align-items:center; padding:20px 24px; border-bottom:2px solid #2a3152; position: sticky; top: 0; background: linear-gradient(135deg, #121418, #1a1f3a); z-index: 10; border-radius: 16px 16px 0 0;';
        header.innerHTML = `
            <div>
                <div style="color:#fff; font-size:18px; font-weight:700;">⚡ CPU Control</div>
                <div style="color:#8b92b4; font-size:12px; margin-top:2px;">Frequency & Governor</div>
            </div>
            <div style="display:flex; align-items:center; gap:12px;">
                <div style="background:#0a0c10; padding:6px 14px; border-radius:8px; border:1px solid #4a9eff;">
                    <span style="color:#8b92b4; font-size:11px;">Governor: </span>
                    <span id="panel-gov-name" style="color:#32D74B; font-weight:700; font-size:13px;">${currentGovernor}</span>
                </div>
                <button id="modal-close-btn" style="
                    width:32px; height:32px; border-radius:50%; border:none; 
                    background:#2a3152; color:#fff; font-size:20px; cursor:pointer; 
                    display:flex; align-items:center; justify-content:center;
                    transition: background 0.2s; line-height:1;                ">×</button>
            </div>`;
        modalContent.appendChild(header);

        // BODY
        const body = document.createElement('div');
        body.style.cssText = 'padding:20px 24px;';
        
        // Protection toggle
        const protectionRow = document.createElement('div');
        protectionRow.style.cssText = 'display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; padding:12px 16px; background:#0a0c10; border-radius:10px; border:1px solid #2a3152;';
        protectionRow.innerHTML = `
            <div>
                <div style="color:#fff; font-size:14px; font-weight:600;">🔒 Lock Frequencies</div>
                <div style="color:#8b92b4; font-size:11px; margin-top:2px;">Prevent system overrides</div>
            </div>`;
        
        const toggleContainer = document.createElement('label');
        toggleContainer.style.cssText = 'position:relative; display:inline-block; width:52px; height:28px; cursor:pointer;';
        const toggleInput = document.createElement('input');
        toggleInput.type = 'checkbox';
        toggleInput.checked = protectionEnabled;
        toggleInput.style.cssText = 'opacity:0; width:0; height:0;';
        const toggleSlider = document.createElement('span');
        toggleSlider.style.cssText = `position:absolute; cursor:pointer; top:0; left:0; right:0; bottom:0; background:${protectionEnabled ? '#32D74B' : '#2a3152'}; border-radius:28px; transition:0.3s;`;
        const toggleKnob = document.createElement('span');
        toggleKnob.style.cssText = `position:absolute; height:22px; width:22px; left:${protectionEnabled ? '27px' : '3px'}; bottom:3px; background:#fff; border-radius:50%; transition:0.3s; box-shadow:0 2px 4px rgba(0,0,0,0.3);`;
        
        toggleContainer.appendChild(toggleInput);
        toggleContainer.appendChild(toggleSlider);
        toggleContainer.appendChild(toggleKnob);
        protectionRow.appendChild(toggleContainer);
        body.appendChild(protectionRow);
        
        toggleInput.addEventListener('change', (e) => {
            protectionEnabled = e.target.checked;
            toggleSlider.style.background = protectionEnabled ? '#32D74B' : '#2a3152';
            toggleKnob.style.left = protectionEnabled ? '27px' : '3px';
            if (window.showStatus) window.showStatus(protectionEnabled ? 'Protection: ENABLED 🔒' : 'Protection: DISABLED ✏️', protectionEnabled ? '#32D74B' : '#FF9F0A');
            policies.forEach(p => {
                const statusEl = document.getElementById(`status-${p.id}`);
                if (statusEl) statusEl.textContent = protectionEnabled ? '🔒 Will lock after apply' : '✏️ Editable';
            });
        });

        // Policy sliders
        const slidersContainer = document.createElement('div');
        slidersContainer.style.cssText = 'display:flex; flex-direction:column; gap:16px;';
        policies.forEach(policy => slidersContainer.appendChild(createPolicyCard(policy)));
        body.appendChild(slidersContainer);        
        // Governor button
        const changeBtn = document.createElement('button');
        changeBtn.textContent = '🔄 Change Governor';
        changeBtn.style.cssText = 'width:100%; margin-top:24px; padding:14px; background:linear-gradient(135deg,#4a9eff,#2a75ff); color:#fff; border:none; border-radius:10px; font-size:15px; font-weight:700; cursor:pointer;';
        changeBtn.addEventListener('click', (e) => { e.stopPropagation(); showGovernorSelector(); });
        body.appendChild(changeBtn);

        modalContent.appendChild(body);
        modalElement.appendChild(modalContent);
        document.body.appendChild(modalElement);

        // Close button handler
        document.getElementById('modal-close-btn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            closeModal();
        });

        // ESC key support
        document.addEventListener('keydown', function escHandler(e) {
            if (e.key === 'Escape' && modalElement?.style.display === 'flex') {
                closeModal();
                document.removeEventListener('keydown', escHandler);
            }
        });

        console.log('[CPU.js] Modal rendered');
    }

    // ✅ createPolicyCard, createDualSliders, etc. (unchanged from previous version)
    // ... [keep all your existing slider/card creation functions here] ...
    // For brevity, I'm including them below but they're identical to before:

    function createPolicyCard(policy) {
        const card = document.createElement('div');
        card.style.cssText = 'background:#0a0c10; border:1px solid #2a3152; border-radius:12px; padding:16px;';
        card.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                <div>
                    <div style="color:#4a9eff; font-size:16px; font-weight:700;">${policy.id.toUpperCase()}</div>
                    <div style="color:#8b92b4; font-size:11px; margin-top:2px;">Cores: ${policy.cpus.join(', ')}</div>
                </div>
                <div style="text-align:right;">
                    <div style="color:#32D74B; font-size:15px; font-weight:700; font-family:monospace;" id="cur-freq-${policy.id}">${Math.round(policy.curFreq/1000)} MHz</div>
                    <div style="color:#8b92b4; font-size:10px;">Current</div>
                </div>
            </div>`;
        
        card.appendChild(createDualSliders(policy));
                const statusRow = document.createElement('div');
        statusRow.id = `status-${policy.id}`;
        statusRow.style.cssText = 'text-align:center; color:#8b92b4; font-size:11px; margin-top:12px; min-height:16px; font-weight:600;';
        statusRow.textContent = protectionEnabled ? '🔒 Will lock after apply' : '✏️ Editable';
        card.appendChild(statusRow);
        return card;
    }

    function createDualSliders(policy) {
        const wrapper = document.createElement('div');
        wrapper.style.cssText = 'margin:15px 0;';
        
        const valueDisplay = document.createElement('div');
        valueDisplay.id = `val-${policy.id}`;
        valueDisplay.style.cssText = 'text-align:center; color:#fff; font-size:16px; font-weight:700; font-family:monospace; margin-bottom:16px; padding:8px; background:#1a1f3a; border-radius:8px;';
        valueDisplay.textContent = `${Math.round(policy.min/1000)} - ${Math.round(policy.max/1000)} MHz`;
        wrapper.appendChild(valueDisplay);

        // MIN slider
        const minLabel = document.createElement('div');
        minLabel.style.cssText = 'color:#FF9F0A; font-size:12px; font-weight:600; margin-bottom:8px;';
        minLabel.textContent = '📉 MIN Frequency';
        wrapper.appendChild(minLabel);

        const minSlider = document.createElement('input');
        minSlider.type = 'range';
        minSlider.id = `slider-min-${policy.id}`;
        minSlider.min = policy.cpuinfoMin;
        minSlider.max = policy.cpuinfoMax;
        minSlider.step = policy.step;
        minSlider.value = policy.min;
        minSlider.style.cssText = 'width:100%; height:6px; background:linear-gradient(to right, #FF9F0A 50%, #2a3152 50%); border-radius:3px; outline:none; -webkit-appearance:none;';
        
        minSlider.addEventListener('input', () => {
            let val = parseInt(minSlider.value);
            if (val > policy.max) { val = policy.max; minSlider.value = val; }
            if (val <= policy.cpuinfoMin + 5000) { val = policy.cpuinfoMin; minSlider.value = val; }
            policy.min = val;
            updateValueDisplay(policy, valueDisplay);
            updateSliderFill(minSlider, policy.cpuinfoMin, policy.cpuinfoMax, val, '#FF9F0A');
            debouncedApply(policy, minSlider, 'min');
        });
        updateSliderFill(minSlider, policy.cpuinfoMin, policy.cpuinfoMax, policy.min, '#FF9F0A');
        wrapper.appendChild(minSlider);

        // MAX slider
        const maxLabel = document.createElement('div');
        maxLabel.style.cssText = 'color:#32D74B; font-size:12px; font-weight:600; margin-bottom:8px; margin-top:16px;';
        maxLabel.textContent = '📈 MAX Frequency';
        wrapper.appendChild(maxLabel);
        const maxSlider = document.createElement('input');
        maxSlider.type = 'range';
        maxSlider.id = `slider-max-${policy.id}`;
        maxSlider.min = policy.cpuinfoMin;
        maxSlider.max = policy.cpuinfoMax;
        maxSlider.step = policy.step;
        maxSlider.value = policy.max;
        maxSlider.style.cssText = 'width:100%; height:6px; background:linear-gradient(to right, #2a3152 50%, #32D74B 50%); border-radius:3px; outline:none; -webkit-appearance:none;';
        
        maxSlider.addEventListener('input', () => {
            let val = parseInt(maxSlider.value);
            if (val < policy.min) { val = policy.min; maxSlider.value = val; }
            if (val >= policy.cpuinfoMax - 5000) { val = policy.cpuinfoMax; maxSlider.value = val; }
            policy.max = val;
            updateValueDisplay(policy, valueDisplay);
            updateSliderFill(maxSlider, policy.cpuinfoMin, policy.cpuinfoMax, val, '#32D74B');
            debouncedApply(policy, maxSlider, 'max');
        });
        updateSliderFill(maxSlider, policy.cpuinfoMin, policy.cpuinfoMax, policy.max, '#32D74B');
        wrapper.appendChild(maxSlider);

        const infoText = document.createElement('div');
        infoText.style.cssText = 'text-align:center; color:#8b92b4; font-size:11px; margin-top:8px; padding:6px; background:#1a1f3a; border-radius:6px;';
        infoText.innerHTML = `Hardware: <span style="color:#fff; font-weight:600;">${Math.round(policy.cpuinfoMin/1000)}</span> - <span style="color:#fff; font-weight:600;">${Math.round(policy.cpuinfoMax/1000)} MHz</span>`;
        wrapper.appendChild(infoText);

        return wrapper;
    }

    function updateValueDisplay(policy, el) {
        el.textContent = `${Math.round(policy.min/1000)} - ${Math.round(policy.max/1000)} MHz`;
    }

    function updateSliderFill(slider, minBound, maxBound, value, color) {
        const range = maxBound - minBound;
        const pct = ((value - minBound) / range) * 100;
        slider.style.background = `linear-gradient(to right, ${color} ${pct}%, #2a3152 ${pct}%)`;
    }

    function debouncedApply(policy, sliderElement, type) {
        if (applyDebounceTimers[policy.id]) clearTimeout(applyDebounceTimers[policy.id]);
        applyDebounceTimers[policy.id] = setTimeout(() => applyFrequencyLimitsInstant(policy, sliderElement, type), 150);
    }

    async function applyFrequencyLimitsInstant(policy, sliderElement, changedType) {
        if (sliderElement) sliderElement.style.opacity = '0.7';
        let successCount = 0;

        try {            const finalMin = Math.min(policy.min, policy.max);
            const finalMax = Math.max(policy.min, policy.max);
            policy.min = finalMin; policy.max = finalMax;

            if (policy.id.startsWith('policy')) {
                const pBase = `/sys/devices/system/cpu/cpufreq/${policy.id}`;
                await unlockFilePermissions(`${pBase}/scaling_min_freq`);
                if (await writeWithBusybox(`${pBase}/scaling_min_freq`, finalMin)) { successCount++; if (protectionEnabled) await lockFilePermissions(`${pBase}/scaling_min_freq`); }
                await new Promise(r => setTimeout(r, 50));
                await unlockFilePermissions(`${pBase}/scaling_max_freq`);
                if (await writeWithBusybox(`${pBase}/scaling_max_freq`, finalMax)) { successCount++; if (protectionEnabled) await lockFilePermissions(`${pBase}/scaling_max_freq`); }
            }
            
            for (const cpu of policy.cpus) {
                const basePath = `/sys/devices/system/cpu/cpu${cpu}/cpufreq`;
                await unlockFilePermissions(`${basePath}/scaling_min_freq`);
                if (await writeWithBusybox(`${basePath}/scaling_min_freq`, finalMin)) { successCount++; if (protectionEnabled) await lockFilePermissions(`${basePath}/scaling_min_freq`); }
                await new Promise(r => setTimeout(r, 50));
                await unlockFilePermissions(`${basePath}/scaling_max_freq`);
                if (await writeWithBusybox(`${basePath}/scaling_max_freq`, finalMax)) { successCount++; if (protectionEnabled) await lockFilePermissions(`${basePath}/scaling_max_freq`); }
            }

            const config = {};
            policies.forEach(p => config[p.id] = { min: p.min, max: p.max });
            await execFn(`su -c '${BUSYBOX} echo "${JSON.stringify(config)}" > "${FREQ_CONFIG}"'`, 3000);

            await new Promise(r => setTimeout(r, 100));
            await updateCurrentFrequency(policy);
            
            const statusEl = document.getElementById(`status-${policy.id}`);
            if (statusEl) {
                if (protectionEnabled && successCount > 0) {
                    statusEl.textContent = `🔒 Locked: ${Math.round(finalMin/1000)}-${Math.round(finalMax/1000)} MHz`;
                    statusEl.style.color = '#32D74B';
                } else if (successCount > 0) {
                    statusEl.textContent = `✅ Applied: ${Math.round(finalMin/1000)}-${Math.round(finalMax/1000)} MHz`;
                    statusEl.style.color = '#32D74B';
                } else {
                    statusEl.textContent = '❌ Failed';
                    statusEl.style.color = '#FF453A';
                }
            }
            
            if (successCount > 0 && window.showStatus) {
                window.showStatus(`${policy.id}: ${Math.round(finalMin/1000)}-${Math.round(finalMax/1000)} MHz ${protectionEnabled ? '🔒' : ''}`, '#32D74B');
            }
            if (sliderElement) sliderElement.style.opacity = '1';
        } catch (e) {
            console.error('Apply error:', e);
            if (window.showStatus) window.showStatus(`Error: ${policy.id}`, '#FF453A');            if (sliderElement) sliderElement.style.opacity = '1';
        }
    }

    async function updateCurrentFrequency(policy) {
        if (policy.cpus.length === 0) return;
        const curFreq = await safeRead(`/sys/devices/system/cpu/cpu${policy.cpus[0]}/cpufreq/scaling_cur_freq`);
        policy.curFreq = parseInt(curFreq) || 0;
        const el = document.getElementById(`cur-freq-${policy.id}`);
        if (el) {
            el.textContent = `${Math.round(policy.curFreq/1000)} MHz`;
            el.style.color = policy.curFreq <= policy.min + 50000 ? '#FF9F0A' : policy.curFreq >= policy.max - 50000 ? '#32D74B' : '#fff';
        }
    }

    async function startFreqUpdates() {
        if (freqUpdateInterval) clearInterval(freqUpdateInterval);
        for (const p of policies) await updateCurrentFrequency(p);
        freqUpdateInterval = setInterval(async () => { for (const p of policies) await updateCurrentFrequency(p); }, 1000);
    }

    function stopFreqUpdates() {
        if (freqUpdateInterval) { clearInterval(freqUpdateInterval); freqUpdateInterval = null; }
        Object.values(applyDebounceTimers).forEach(t => clearTimeout(t));
        applyDebounceTimers = {};
    }

    // ✅ Governor selector modal (also using profile.js pattern)
    async function applyGovernor(gov) {
        gov = gov.toLowerCase().trim();
        if (!availableGovernors.includes(gov)) { alert(`❌ Governor "${gov}" not supported`); return; }
        
        const modal = document.getElementById('cpu-gov-modal');
        if (!modal) return;
        const titleEl = modal.querySelector('h3');
        const statusEl = modal.querySelector('.apply-status') || (() => {
            const el = document.createElement('div'); el.className = 'apply-status';
            el.style.cssText = 'text-align:center; padding:10px 0; font-size:13px;';
            modal.querySelector('div[style*="grid"]').before(el); return el;
        })();
        
        titleEl.textContent = 'Applying...';
        statusEl.textContent = `Writing ${gov}...`; statusEl.style.color = '#FF9F0A';

        try {
            await execFn(`su -c 'chmod 666 "${GOV_CONFIG}" 2>/dev/null'`, 2000);
            await execFn(`su -c '${BUSYBOX} echo "${gov}" > "${GOV_CONFIG}"'`, 3000);
            
            for (const p of policies) {
                if (p.id.startsWith('policy')) {                    const govPath = `/sys/devices/system/cpu/cpufreq/${p.id}/scaling_governor`;
                    await execFn(`su -c 'chmod 666 "${govPath}" 2>/dev/null'`, 2000);
                    await execFn(`su -c '${BUSYBOX} echo "${gov}" > "${govPath}"'`, 3000);
                    if (protectionEnabled) await execFn(`su -c 'chmod 000 "${govPath}"'`, 2000);
                }
            }
            for (let i = 0; i < coreCount; i++) {
                const govPath = `/sys/devices/system/cpu/cpu${i}/cpufreq/scaling_governor`;
                await execFn(`su -c 'chmod 666 "${govPath}" 2>/dev/null'`, 2000);
                await execFn(`su -c '${BUSYBOX} echo "${gov}" > "${govPath}"'`, 3000);
                if (protectionEnabled) await execFn(`su -c 'chmod 000 "${govPath}"'`, 2000);
            }
            
            await new Promise(r => setTimeout(r, 500));
            const verify = await safeRead('/sys/devices/system/cpu/cpu0/cpufreq/scaling_governor');
            if (verify?.trim().toLowerCase() !== gov) throw new Error(`Verify failed`);
            
            currentGovernor = gov;
            const govNameEl = document.getElementById('panel-gov-name');
            if (govNameEl) govNameEl.textContent = currentGovernor;
            if (window.showStatus) window.showStatus(`Governor → ${currentGovernor} ${protectionEnabled ? '🔒' : ''}`, '#32D74B');
            
            titleEl.textContent = '✅ Applied';
            statusEl.textContent = `${currentGovernor} active`; statusEl.style.color = '#32D74B';
            setTimeout(() => modal.remove(), 1200);
        } catch (e) {
            console.error('Governor apply failed:', e);
            titleEl.textContent = '❌ Failed';
            statusEl.textContent = e.message || 'Check permissions'; statusEl.style.color = '#FF453A';
            setTimeout(() => modal.remove(), 2500);
        }
    }

    function showGovernorSelector() {
        const existing = document.getElementById('cpu-gov-modal');
        if (existing) existing.remove();
        
        const modal = document.createElement('div');
        modal.id = 'cpu-gov-modal';
        modal.style.cssText = `
            position: fixed; inset: 0;
            background: rgba(0,0,0,0.9);
            z-index: 10001;
            display: flex;
            align-items: center;
            justify-content: center;
            backdrop-filter: blur(8px);
        `;
        
        const box = document.createElement('div');        box.style.cssText = `
            background: linear-gradient(135deg, #1a1f3a, #151b2d);
            border: 2px solid #4a9eff;
            border-radius: 16px;
            padding: 24px;
            width: 90%;
            max-width: 400px;
            box-shadow: 0 20px 60px rgba(74, 158, 255, 0.4);
        `;
        
        box.innerHTML = `
            <h3 style="margin:0 0 16px; font-size:18px; font-weight:700; text-align:center; color:#fff;">🔄 Select Governor</h3>
            <div style="color:#8b92b4; font-size:13px; margin-bottom:20px; text-align:center;">
                Current: <span style="color:#32D74B; font-weight:700;">${currentGovernor}</span>
            </div>
            <div id="gov-grid" style="display:grid; grid-template-columns:repeat(2,1fr); gap:10px; margin-bottom:20px;"></div>
            <button id="gov-close" style="width:100%; padding:12px; background:#2a3152; color:#fff; border:none; border-radius:10px; font-size:14px; font-weight:600; cursor:pointer;">Cancel</button>
        `;
        
        const grid = box.querySelector('#gov-grid');
        availableGovernors.forEach(gov => {
            const btn = document.createElement('button');
            const isCurrent = gov === currentGovernor;
            btn.textContent = gov.charAt(0).toUpperCase() + gov.slice(1);
            btn.style.cssText = `
                padding:14px; background:${isCurrent ? 'linear-gradient(135deg,#32D74B,#2ecc71)' : '#0f1419'};
                color:${isCurrent ? '#fff' : '#e0e0e0'}; border:${isCurrent ? '2px solid #32D74B' : '1px solid #2a3152'};
                border-radius:10px; font-size:13px; font-weight:${isCurrent ? '700' : '600'}; cursor:pointer;
            `;
            btn.onclick = () => applyGovernor(gov);
            grid.appendChild(btn);
        });
        
        box.querySelector('#gov-close').onclick = () => modal.remove();
        modal.onclick = e => { if (e.target === modal) modal.remove(); };
        
        modal.appendChild(box);
        document.body.appendChild(modal);
    }

    // Cleanup
    window.addEventListener('beforeunload', () => {
        stopFreqUpdates();
        if (modalElement) modalElement.remove();
    });

    // Init
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
        window.applyCPUGovernor = applyGovernor;
})();