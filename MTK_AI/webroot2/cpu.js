// cpu.js - CPU Frequency Control - VISIBILITY FIXED VERSION
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

    console.log('[CPU.js] Script loaded');

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
            }
        });
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
            // ✅ Create valid empty JSON if it doesn't exist or is corrupted
            try {
                const existing = await safeRead(FREQ_CONFIG);
                if (!existing || existing === '{}') {                    await execFn(`su -c '${BUSYBOX} echo "{}" > "${FREQ_CONFIG}"'`, 3000);
                } else {
                    JSON.parse(existing); // Test if valid
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
                id: pid, 
                cpus, 
                curFreq: 0, 
                min,                 max, 
                cpuinfoMin,
                cpuinfoMax,
                step: 1000
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
                } catch (e) {
                    console.warn('[CPU.js] JSON parse error, using defaults');
                }
            }
        } catch (e) { 
            console.warn('[CPU.js] Settings load error:', e); 
        }
    }
    function setupToggleHandler() {
        const item = document.getElementById('cpu-gov-item');
        console.log('[CPU.js] Looking for cpu-gov-item, found:', item);
        
        if (!item) {
            console.error('[CPU.js] ERROR: cpu-gov-item not found!');
            return;
        }
        
        item.style.cursor = 'pointer';
        item.addEventListener('click', (e) => {
            console.log('[CPU.js] Click detected');
            if (e.target.closest('#cpu-gov-modal') || e.target.closest('#cpu-control-panel')) return;
            togglePanel();
        });
        console.log('[CPU.js] Toggle handler setup complete');
    }

    function togglePanel() {
        console.log('[CPU.js] togglePanel called, current visible:', panelVisible);
        panelVisible = !panelVisible;
        if (!panelRendered) { 
            console.log('[CPU.js] Rendering panel for first time');
            renderPanel(); 
            panelRendered = true; 
        }
        const panel = document.getElementById('cpu-control-panel');
        if (panel) {
            panel.style.display = panelVisible ? 'block' : 'none';
            console.log('[CPU.js] Panel display set to:', panel.style.display);
            
            // ✅ SCROLL PANEL INTO VIEW
            if (panelVisible) {
                setTimeout(() => {
                    panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    console.log('[CPU.js] Panel scrolled into view');
                }, 100);
                startFreqUpdates();
            } else {
                stopFreqUpdates();
            }
        } else {
            console.error('[CPU.js] Panel element not found!');
        }
    }

    window.showCPUPanel = function() {
        console.log('[CPU.js] Manual showCPUPanel called');
        if (!panelRendered) {
            renderPanel();            panelRendered = true;
        }
        panelVisible = true;
        const panel = document.getElementById('cpu-control-panel');
        if (panel) {
            panel.style.display = 'block';
            panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
            startFreqUpdates();
        }
    };

    function renderPanel() {
        console.log('[CPU.js] renderPanel called');
        const govItem = document.getElementById('cpu-gov-item');
        if (!govItem) {
            console.error('[CPU.js] Cannot render: cpu-gov-item not found');
            return;
        }

        const panel = document.createElement('div');
        panel.id = 'cpu-control-panel';
        // ✅ ENHANCED VISIBILITY STYLES
        panel.style.cssText = `
            display: block; 
            background: linear-gradient(135deg, #121418, #1a1f3a); 
            border: 2px solid #4a9eff; 
            border-radius: 12px; 
            margin: 16px 0; 
            padding: 20px; 
            box-shadow: 0 8px 32px rgba(74, 158, 255, 0.3); 
            z-index: 9999; 
            position: relative;
            animation: slideDown 0.3s ease-out;
        `;
        
        // Add animation
        const style = document.createElement('style');
        style.textContent = `
            @keyframes slideDown {
                from { opacity: 0; transform: translateY(-20px); }
                to { opacity: 1; transform: translateY(0); }
            }
        `;
        document.head.appendChild(style);

        const header = document.createElement('div');
        header.style.cssText = 'display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; padding-bottom:16px; border-bottom:2px solid #2a3152;';
        header.innerHTML = `
            <div>
                <div style="color:#fff; font-size:18px; font-weight:700;">⚡ CPU Frequency Control</div>                <div style="color:#8b92b4; font-size:12px; margin-top:4px;">Adjust min/max frequency per policy</div>
            </div>
            <div style="background:#0a0c10; padding:8px 16px; border-radius:8px; border:1px solid #4a9eff;">
                <span style="color:#8b92b4; font-size:12px;">Governor: </span>
                <span id="panel-gov-name" style="color:#32D74B; font-weight:700; font-size:14px;">${currentGovernor}</span>
            </div>`;
        panel.appendChild(header);

        // Protection toggle
        const protectionRow = document.createElement('div');
        protectionRow.style.cssText = 'display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; padding:12px 16px; background:#0a0c10; border-radius:10px; border:1px solid #2a3152;';
        
        const protectionLabel = document.createElement('div');
        protectionLabel.innerHTML = `
            <div style="color:#fff; font-size:14px; font-weight:600;">🔒 Lock Frequencies</div>
            <div style="color:#8b92b4; font-size:11px; margin-top:2px;">Prevent system overrides</div>`;
        protectionRow.appendChild(protectionLabel);
        
        const toggleContainer = document.createElement('label');
        toggleContainer.style.cssText = 'position:relative; display:inline-block; width:52px; height:28px; cursor:pointer;';
        
        const toggleInput = document.createElement('input');
        toggleInput.type = 'checkbox';
        toggleInput.id = 'protection-toggle';
        toggleInput.checked = protectionEnabled;
        toggleInput.style.cssText = 'opacity:0; width:0; height:0;';
        
        const toggleSlider = document.createElement('span');
        toggleSlider.id = 'protection-slider';
        toggleSlider.style.cssText = `position:absolute; cursor:pointer; top:0; left:0; right:0; bottom:0; background:${protectionEnabled ? '#32D74B' : '#2a3152'}; border-radius:28px; transition:0.3s;`;
        
        const toggleKnob = document.createElement('span');
        toggleKnob.id = 'protection-knob';
        toggleKnob.style.cssText = `position:absolute; content:""; height:22px; width:22px; left:${protectionEnabled ? '27px' : '3px'}; bottom:3px; background:#fff; border-radius:50%; transition:0.3s; box-shadow:0 2px 4px rgba(0,0,0,0.3);`;
        
        toggleContainer.appendChild(toggleInput);
        toggleContainer.appendChild(toggleSlider);
        toggleContainer.appendChild(toggleKnob);
        protectionRow.appendChild(toggleContainer);
        panel.appendChild(protectionRow);
        
        toggleInput.addEventListener('change', (e) => {
            protectionEnabled = e.target.checked;
            if (protectionEnabled) {
                toggleSlider.style.background = '#32D74B';
                toggleKnob.style.left = '27px';
                if (window.showStatus) window.showStatus('Protection: ENABLED 🔒', '#32D74B');
            } else {
                toggleSlider.style.background = '#2a3152';
                toggleKnob.style.left = '3px';                if (window.showStatus) window.showStatus('Protection: DISABLED ✏️', '#FF9F0A');
            }
        });

        const slidersContainer = document.createElement('div');
        slidersContainer.id = 'freq-sliders-container';
        slidersContainer.style.cssText = 'display:flex; flex-direction:column; gap:20px;';

        policies.forEach(policy => {
            const card = createPolicyCard(policy);
            slidersContainer.appendChild(card);
        });
        panel.appendChild(slidersContainer);
        
        const changeBtn = document.createElement('button');
        changeBtn.textContent = '🔄 Change Governor';
        changeBtn.style.cssText = 'width:100%; margin-top:24px; padding:14px; background:linear-gradient(135deg,#4a9eff,#2a75ff); color:#fff; border:none; border-radius:10px; font-size:15px; font-weight:700; cursor:pointer; transition:all 0.2s;';
        changeBtn.onmouseenter = () => changeBtn.style.transform = 'translateY(-2px)';
        changeBtn.onmouseleave = () => changeBtn.style.transform = 'translateY(0)';
        changeBtn.addEventListener('click', (e) => { e.stopPropagation(); showGovernorSelector(); });
        panel.appendChild(changeBtn);

        govItem.parentNode.insertBefore(panel, govItem.nextSibling);
        console.log('[CPU.js] Panel inserted into DOM');
    }

    function createPolicyCard(policy) {
        const card = document.createElement('div');
        card.style.cssText = 'background:#0a0c10; border:1px solid #2a3152; border-radius:12px; padding:16px;';

        const header = document.createElement('div');
        header.style.cssText = 'display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;';
        header.innerHTML = `
            <div>
                <div style="color:#4a9eff; font-size:16px; font-weight:700;">${policy.id.toUpperCase()}</div>
                <div style="color:#8b92b4; font-size:11px; margin-top:2px;">Cores: ${policy.cpus.join(', ')}</div>
            </div>
            <div style="text-align:right;">
                <div style="color:#32D74B; font-size:15px; font-weight:700; font-family:monospace;" id="cur-freq-${policy.id}">${Math.round(policy.curFreq/1000)} MHz</div>
                <div style="color:#8b92b4; font-size:10px;">Current</div>
            </div>`;
        card.appendChild(header);

        const slidersWrapper = createDualSliders(policy);
        card.appendChild(slidersWrapper);

        const statusRow = document.createElement('div');
        statusRow.id = `status-${policy.id}`;
        statusRow.style.cssText = 'text-align:center; color:#8b92b4; font-size:11px; margin-top:12px; min-height:16px; font-weight:600;';
        statusRow.textContent = protectionEnabled ? '🔒 Will lock after apply' : '✏️ Editable';        card.appendChild(statusRow);

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

        // MIN SLIDER
        const minLabel = document.createElement('div');
        minLabel.style.cssText = 'color:#FF9F0A; font-size:12px; font-weight:600; margin-bottom:8px;';
        minLabel.textContent = '📉 MIN Frequency';
        wrapper.appendChild(minLabel);

        const minSliderContainer = document.createElement('div');
        minSliderContainer.style.cssText = 'position:relative; height:28px; display:flex; align-items:center; margin-bottom:20px;';
        
        const minTrackBg = document.createElement('div');
        minTrackBg.style.cssText = 'position:absolute; width:100%; height:6px; background:#2a3152; border-radius:3px;';
        minSliderContainer.appendChild(minTrackBg);

        const minSlider = document.createElement('input');
        minSlider.type = 'range';
        minSlider.id = `slider-min-${policy.id}`;
        minSlider.min = policy.cpuinfoMin;
        minSlider.max = policy.cpuinfoMax;
        minSlider.step = policy.step;
        minSlider.value = policy.min;
        minSlider.style.cssText = 'position:relative; width:100%; height:6px; -webkit-appearance:none; appearance:none; background:transparent; cursor:pointer; z-index:2;';
        
        const minStyle = document.createElement('style');
        minStyle.textContent = `
            #slider-min-${policy.id}::-webkit-slider-thumb {
                -webkit-appearance: none; width:22px; height:22px; border-radius:50%;
                background:linear-gradient(135deg, #FF9F0A, #FF6B35);
                border:2px solid #0a0c10; cursor:pointer;
                box-shadow:0 2px 8px rgba(255, 159, 10, 0.5);
            }
        `;
        document.head.appendChild(minStyle);

        minSlider.addEventListener('input', () => {
            let val = parseInt(minSlider.value);            if (val > policy.max) { val = policy.max; minSlider.value = val; }
            if (val <= policy.cpuinfoMin + 5000) { val = policy.cpuinfoMin; minSlider.value = val; }
            policy.min = val;
            updateValueDisplay(policy, valueDisplay);
            updateSliderFill(minSlider, policy.cpuinfoMin, policy.cpuinfoMax, val, '#FF9F0A');
            debouncedApply(policy, minSlider, 'min');
        });

        updateSliderFill(minSlider, policy.cpuinfoMin, policy.cpuinfoMax, policy.min, '#FF9F0A');
        minSliderContainer.appendChild(minSlider);
        wrapper.appendChild(minSliderContainer);

        // MAX SLIDER
        const maxLabel = document.createElement('div');
        maxLabel.style.cssText = 'color:#32D74B; font-size:12px; font-weight:600; margin-bottom:8px;';
        maxLabel.textContent = '📈 MAX Frequency';
        wrapper.appendChild(maxLabel);

        const maxSliderContainer = document.createElement('div');
        maxSliderContainer.style.cssText = 'position:relative; height:28px; display:flex; align-items:center; margin-bottom:8px;';
        
        const maxTrackBg = document.createElement('div');
        maxTrackBg.style.cssText = 'position:absolute; width:100%; height:6px; background:#2a3152; border-radius:3px;';
        maxSliderContainer.appendChild(maxTrackBg);

        const maxSlider = document.createElement('input');
        maxSlider.type = 'range';
        maxSlider.id = `slider-max-${policy.id}`;
        maxSlider.min = policy.cpuinfoMin;
        maxSlider.max = policy.cpuinfoMax;
        maxSlider.step = policy.step;
        maxSlider.value = policy.max;
        maxSlider.style.cssText = 'position:relative; width:100%; height:6px; -webkit-appearance:none; appearance:none; background:transparent; cursor:pointer; z-index:2;';
        
        const maxStyle = document.createElement('style');
        maxStyle.textContent = `
            #slider-max-${policy.id}::-webkit-slider-thumb {
                -webkit-appearance: none; width:22px; height:22px; border-radius:50%;
                background:linear-gradient(135deg, #32D74B, #2ecc71);
                border:2px solid #0a0c10; cursor:pointer;
                box-shadow:0 2px 8px rgba(50, 215, 75, 0.5);
            }
        `;
        document.head.appendChild(maxStyle);

        maxSlider.addEventListener('input', () => {
            let val = parseInt(maxSlider.value);
            if (val < policy.min) { val = policy.min; maxSlider.value = val; }
            if (val >= policy.cpuinfoMax - 5000) { val = policy.cpuinfoMax; maxSlider.value = val; }
            policy.max = val;            updateValueDisplay(policy, valueDisplay);
            updateSliderFill(maxSlider, policy.cpuinfoMin, policy.cpuinfoMax, val, '#32D74B');
            debouncedApply(policy, maxSlider, 'max');
        });

        updateSliderFill(maxSlider, policy.cpuinfoMin, policy.cpuinfoMax, policy.max, '#32D74B');
        maxSliderContainer.appendChild(maxSlider);
        wrapper.appendChild(maxSliderContainer);

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
        applyDebounceTimers[policy.id] = setTimeout(() => {
            applyFrequencyLimitsInstant(policy, sliderElement, type);
        }, 150);
    }

    async function applyFrequencyLimitsInstant(policy, sliderElement, changedType) {
        if (sliderElement) sliderElement.style.opacity = '0.7';
        
        let successCount = 0;
        let totalAttempts = 0;

        try {
            const targetMin = Math.max(policy.cpuinfoMin, Math.min(policy.cpuinfoMax, policy.min));
            const targetMax = Math.min(policy.cpuinfoMax, Math.max(policy.cpuinfoMin, policy.max));
            
            const finalMin = Math.min(targetMin, targetMax);
            const finalMax = Math.max(targetMin, targetMax);
            
            policy.min = finalMin;
            policy.max = finalMax;
            if (policy.id.startsWith('policy')) {
                const pBase = `/sys/devices/system/cpu/cpufreq/${policy.id}`;
                
                totalAttempts++;
                await unlockFilePermissions(`${pBase}/scaling_min_freq`);
                if (await writeWithBusybox(`${pBase}/scaling_min_freq`, finalMin)) {
                    successCount++;
                    if (protectionEnabled) await lockFilePermissions(`${pBase}/scaling_min_freq`);
                }
                await new Promise(r => setTimeout(r, 50));
                
                totalAttempts++;
                await unlockFilePermissions(`${pBase}/scaling_max_freq`);
                if (await writeWithBusybox(`${pBase}/scaling_max_freq`, finalMax)) {
                    successCount++;
                    if (protectionEnabled) await lockFilePermissions(`${pBase}/scaling_max_freq`);
                }
            }
            
            for (const cpu of policy.cpus) {
                const basePath = `/sys/devices/system/cpu/cpu${cpu}/cpufreq`;
                
                totalAttempts++;
                await unlockFilePermissions(`${basePath}/scaling_min_freq`);
                if (await writeWithBusybox(`${basePath}/scaling_min_freq`, finalMin)) {
                    successCount++;
                    if (protectionEnabled) await lockFilePermissions(`${basePath}/scaling_min_freq`);
                }
                await new Promise(r => setTimeout(r, 50));
                
                totalAttempts++;
                await unlockFilePermissions(`${basePath}/scaling_max_freq`);
                if (await writeWithBusybox(`${basePath}/scaling_max_freq`, finalMax)) {
                    successCount++;
                    if (protectionEnabled) await lockFilePermissions(`${basePath}/scaling_max_freq`);
                }
            }
            
            const config = {};
            policies.forEach(p => { 
                config[p.id] = { 
                    min: Math.max(p.cpuinfoMin, Math.min(p.cpuinfoMax, p.min)),
                    max: Math.min(p.cpuinfoMax, Math.max(p.cpuinfoMin, p.max))
                }; 
            });
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
                const range = `${Math.round(finalMin/1000)}-${Math.round(finalMax/1000)} MHz`;
                const msg = protectionEnabled ? `${policy.id}: ${range} 🔒` : `${policy.id}: ${range}`;
                window.showStatus(msg, '#32D74B');
            }
            
            if (sliderElement) sliderElement.style.opacity = '1';
            
        } catch (e) {
            console.error('Apply error:', e);
            if (window.showStatus) window.showStatus(`Error: ${policy.id}`, '#FF453A');
            if (sliderElement) sliderElement.style.opacity = '1';
        }
    }

    async function updateCurrentFrequency(policy) {
        if (policy.cpus.length === 0) return;
        const curFreq = await safeRead(`/sys/devices/system/cpu/cpu${policy.cpus[0]}/cpufreq/scaling_cur_freq`);
        policy.curFreq = parseInt(curFreq) || 0;
        const el = document.getElementById(`cur-freq-${policy.id}`);
        if (el) {
            el.textContent = `${Math.round(policy.curFreq/1000)} MHz`;
            if (policy.curFreq <= policy.min + 50000) {
                el.style.color = '#FF9F0A';
            } else if (policy.curFreq >= policy.max - 50000) {
                el.style.color = '#32D74B';
            } else {
                el.style.color = '#fff';
            }
        }
    }

    async function startFreqUpdates() {
        if (freqUpdateInterval) clearInterval(freqUpdateInterval);
        for (const p of policies) await updateCurrentFrequency(p);
        freqUpdateInterval = setInterval(async () => { for (const p of policies) await updateCurrentFrequency(p); }, 1000);    }

    function stopFreqUpdates() {
        if (freqUpdateInterval) { clearInterval(freqUpdateInterval); freqUpdateInterval = null; }
        Object.values(applyDebounceTimers).forEach(t => clearTimeout(t));
        applyDebounceTimers = {};
    }

    async function applyGovernor(gov) {
        gov = gov.toLowerCase().trim();
        if (!availableGovernors.includes(gov)) { alert(`❌ Governor "${gov}" is not supported.\nAvailable: ${availableGovernors.join(', ')}`); return; }
        const modal = document.getElementById('cpu-gov-modal');
        if (!modal) return;
        const titleEl = modal.querySelector('h3');
        const statusEl = modal.querySelector('.apply-status') || (() => {
            const el = document.createElement('div'); el.className = 'apply-status';
            el.style.cssText = 'text-align:center; padding:10px 0; font-size:13px;';
            modal.querySelector('div[style*="grid"]').before(el); return el;
        })();
        titleEl.textContent = 'Applying Governor...';
        statusEl.textContent = `Writing ${gov} to all CPU clusters...`;
        statusEl.style.color = '#FF9F0A';

        try {
            await execFn(`su -c 'chmod 666 "${GOV_CONFIG}" 2>/dev/null'`, 2000);
            await execFn(`su -c '${BUSYBOX} echo "${gov}" > "${GOV_CONFIG}"'`, 3000);
            
            for (const p of policies) {
                if (p.id.startsWith('policy')) {
                    const govPath = `/sys/devices/system/cpu/cpufreq/${p.id}/scaling_governor`;
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
            if (verify?.trim().toLowerCase() !== gov) throw new Error(`Expected: ${gov}, Got: ${verify?.trim() || 'unknown'}`);
            
            currentGovernor = gov;
            const govNameEl = document.getElementById('panel-gov-name');
            if (govNameEl) govNameEl.textContent = currentGovernor;
            if (window.showStatus) window.showStatus(`CPU Governor → ${currentGovernor} ${protectionEnabled ? '🔒' : ''}`, '#32D74B');            titleEl.textContent = '✅ Governor Applied';
            statusEl.textContent = `${currentGovernor} active on all clusters`;
            statusEl.style.color = '#32D74B';
            setTimeout(() => modal.remove(), 1500);
        } catch (e) {
            console.error('Failed to apply governor:', e);
            titleEl.textContent = '❌ Apply Failed';
            statusEl.textContent = e.message || 'Check root permissions';
            statusEl.style.color = '#FF453A';
            setTimeout(() => modal.remove(), 3000);
        }
    }

    function showGovernorSelector() {
        const existing = document.getElementById('cpu-gov-modal');
        if (existing) existing.remove();
        const modal = document.createElement('div');
        modal.id = 'cpu-gov-modal';
        modal.style.cssText = `position: fixed; inset: 0; background: rgba(0,0,0,0.9); z-index: 10000; display: flex; align-items: center; justify-content: center; backdrop-filter: blur(8px);`;
        const box = document.createElement('div');
        box.style.cssText = `background: linear-gradient(135deg, #1a1f3a, #151b2d); border: 2px solid #4a9eff; border-radius: 16px; padding: 24px; width: 90%; max-width: 400px; box-shadow: 0 20px 60px rgba(74, 158, 255, 0.4);`;
        const title = document.createElement('h3');
        title.innerHTML = '<span style="color:#fff;">🔄 Select CPU Governor</span>';
        title.style.cssText = 'margin: 0 0 16px; font-size: 18px; font-weight: 700; text-align: center;';
        const info = document.createElement('div');
        info.style.cssText = 'color: #8b92b4; font-size: 13px; margin-bottom: 20px; text-align: center;';
        info.innerHTML = `Current: <span style="color: #32D74B; font-weight: 700;">${currentGovernor}</span> &nbsp;|&nbsp; Available: ${availableGovernors.length}`;
        const grid = document.createElement('div');
        grid.style.cssText = 'display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; margin-bottom: 20px;';
        availableGovernors.forEach(gov => {
            const btn = document.createElement('button');
            const isCurrent = gov === currentGovernor;
            btn.textContent = gov.charAt(0).toUpperCase() + gov.slice(1);
            btn.style.cssText = `padding: 14px; background: ${isCurrent ? 'linear-gradient(135deg, #32D74B, #2ecc71)' : '#0f1419'}; color: ${isCurrent ? '#fff' : '#e0e0e0'}; border: ${isCurrent ? '2px solid #32D74B' : '1px solid #2a3152'}; border-radius: 10px; font-size: 13px; font-weight: ${isCurrent ? '700' : '600'}; cursor: pointer; transition: all 0.2s; text-transform: capitalize;`;
            btn.onmouseenter = () => { if (!isCurrent) { btn.style.background = '#1a1f3a'; btn.style.borderColor = '#4a9eff'; } };
            btn.onmouseleave = () => { if (!isCurrent) { btn.style.background = '#0f1419'; btn.style.borderColor = '#2a3152'; } };
            btn.onclick = () => applyGovernor(gov);
            grid.appendChild(btn);
        });
        const closeBtn = document.createElement('button');
        closeBtn.textContent = 'Cancel';
        closeBtn.style.cssText = `width: 100%; padding: 12px; background: #2a3152; color: #fff; border: none; border-radius: 10px; font-size: 14px; font-weight: 600; cursor: pointer;`;
        closeBtn.onclick = () => modal.remove();
        box.append(title, info, grid, closeBtn);
        modal.appendChild(box);
        modal.onclick = e => { if (e.target === modal) modal.remove(); };
        document.body.appendChild(modal);
    }

    window.addEventListener('beforeunload', () => stopFreqUpdates());    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
    window.applyCPUGovernor = applyGovernor;
})();