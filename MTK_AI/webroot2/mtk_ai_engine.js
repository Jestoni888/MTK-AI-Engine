// mtk_ai_engine.js - Main Control Panel (Fixed Touch Controls)
(function() {
    'use strict';

    const CFG_DIR = '/sdcard/MTK_AI_Engine';
    const MOD_DIR = '/data/adb/modules/MTK_AI';
    const STATE_DIR = CFG_DIR;

    const scriptPaths = {
        enable_disable_thermal: { on: `${MOD_DIR}/MTK_AI/AI_MODE/gaming_mode/disable_thermal`, off: null, isDaemon: false, critical: false },
        enable_performance: { on: `${MOD_DIR}/MTK_AI/AI_MODE/gaming_mode/performance`, off: null, isDaemon: false, critical: false },
        disable_zram: { on: `${MOD_DIR}/MTK_AI/AI_MODE/gaming_mode/disable_zram`, off: null, isDaemon: false, critical: false },
        enable_gaming_prop: { on: `${MOD_DIR}/MTK_AI/AI_MODE/gaming_mode/gaming_prop`, off: null, isDaemon: false, critical: false },
        enable_gaming_prop2: { on: `${MOD_DIR}/MTK_AI/AI_MODE/gaming_mode/gaming_prop_2`, off: `${MOD_DIR}/MTK_AI/AI_MODE/normal_mode/normal_prop`, isDaemon: false, critical: false },
        enable_highframerate: { on: `${MOD_DIR}/MTK_AI/AI_MODE/gaming_mode/unlockfps`, off: null, isDaemon: false, critical: false },
        enable_surfaceflinger: { 
            on: `${MOD_DIR}/MTK_AI/AI_MODE/auto_frequency/surfaceflinger`, 
            off: null, 
            isDaemon: true, 
            procName: "surfaceflinger",
            critical: true
        },
        enable_trim: { on: null, off: null, isDaemon: false, critical: false },
        enable_bypass: { on: null, off: null, isDaemon: false, critical: false },
        enable_cleaner: { on: null, off: null, isDaemon: false, critical: false },
        enable_screen_off_throttle: { on: null, off: null, isDaemon: false, critical: false },
        low_power_mode: { on: null, off: null, isDaemon: false, critical: false },
        enable_notifications: { on: null, off: null, isDaemon: false, critical: false },
        throttle_user_apps_in_gaming: { on: null, off: null, isDaemon: false, critical: false },
        enable_limiter: { on: null, off: null, isDaemon: false, critical: false }, // ✅ Master toggle for Touch & Display
        enable_dnd_during_game: { on: null, off: null, isDaemon: false, critical: false },
        enable_module: { on: null, off: null, isDaemon: false, critical: false },
        fast_mode_switch: { on: null, off: null, isDaemon: false, critical: false },
        enable_cpu: { on: null, off: null, isDaemon: false, critical: false },
        enable_lite_gaming: { on: null, off: null, isDaemon: false, critical: false }
    };

    const toggleConfig = {
        enable_trim: { title: "Enable TRIM", desc: "Optimize storage performance & lifespan", group: "System" },
        enable_bypass: { title: "Charging Bypass", desc: "Bypass battery while plugged in", group: "Gaming" },
        enable_cleaner: { title: "Auto Cleaner", desc: "Periodically clear cache & temp files", group: "System" },
        disable_zram: { title: "Disable ZRAM", desc: "Free up RAM by disabling compressed swap", group: "Memory" },
        enable_performance: { title: "Performance Mode", desc: "Maximize CPU/GPU clocks & scheduler", group: "Performance" },        enable_screen_off_throttle: { title: "Screen Off Throttle", desc: "Limit performance when display is off", group: "Battery" },
        low_power_mode: { title: "Deep sleep system", desc: "Enable deep sleep power mode during screen-off", group: "Battery" },
        enable_notifications: { title: "Module Notifications", desc: "Manage notification behavior of this module", group: "System" },
        throttle_user_apps_in_gaming: { title: "Throttle Background Apps", desc: "Limit background apps while gaming", group: "Gaming" },
        enable_limiter: { title: "Enable Touch Control", desc: "Master toggle for TOUCH Control", group: "Touch Control" }, // ✅ Master toggle
        enable_highframerate: { title: "Unlock High FPS", desc: "Remove system-level FPS caps", group: "Gaming" },
        enable_disable_thermal: { title: "Disable Thermals", desc: "Bypass thermal throttling (⚠️ Risk of overheating)", group: "Thermal" },
        enable_gaming_prop: { title: "Gaming Properties", desc: "Apply gaming-specific system properties", group: "Gaming" },
        enable_dnd_during_game: { title: "DND During Game", desc: "Auto-enable Do Not Disturb while gaming", group: "Gaming" },
        enable_gaming_prop2: { title: "Gaming Props v2", desc: "Advanced gaming property tweaks", group: "Gaming" },
        enable_module: { title: "Module automation", desc: "No need to reboot when new modules installed except system level modules", group: "System" },
        fast_mode_switch: { title: "Fast Mode Switch", desc: "Quickly switch between normal, gaming & screen state profiles", group: "System" },
        enable_cpu: { title: "Auto shutdown CPU 6 & 7", desc: "Auto shutdown cpu 6 & 7 ehen temp reaches 42°C & auto revert in 39°C", group: "Battery" },
        enable_lite_gaming: { title: "Lite Gaming Mode", desc: "Lightweight tweaks for low-end devices", group: "Gaming" },
        enable_surfaceflinger: { title: "SurfaceFlinger Tweak", desc: "Optimize display compositor & vsync", group: "Display", warning: "🔒 Cannot disable (system critical)" }
    };

    const execFn = async function(cmd, timeout = 2000) {
        return new Promise(resolve => {
            const cb = `mtk_exec_${Date.now()}_${Math.random().toString(36).slice(2)}`;
            let settled = false;
            const t = setTimeout(() => { 
                if (!settled) { 
                    settled = true; 
                    delete window[cb]; 
                    resolve(''); 
                }
            }, timeout);
            
            window[cb] = (_, res) => { 
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
                    settled = true;
                    clearTimeout(t);
                    delete window[cb];
                    resolve('');
                }
            } catch (e) {
                settled = true;
                clearTimeout(t);                delete window[cb];
                resolve('');
            }
        });
    };

    function showStatus(msg, isError = false) {
        const el = document.getElementById('mtk-ai-status');
        const txt = document.getElementById('mtk-ai-status-text');
        if (el && txt) {
            el.style.display = 'block';
            txt.textContent = msg;
            txt.style.color = isError ? '#ef4444' : '#10b981';
            setTimeout(() => { el.style.display = 'none'; }, 3000);
        }
    }

    function renderControls() {
        const container = document.getElementById('mtk-ai-controls');
        if (!container) {
            console.error('❌ Container #mtk-ai-controls not found!');
            return false;
        }

        const groups = {};
        Object.keys(toggleConfig).forEach(key => {
            const cfg = toggleConfig[key];
            if (!groups[cfg.group]) groups[cfg.group] = [];
            groups[cfg.group].push({ id: key, ...cfg });
        });

        let html = '';
        for (const [groupName, items] of Object.entries(groups)) {
            html += `<div class="settings-group"><h3>${groupName}</h3>`;
            
            items.forEach(item => {
                const isCritical = scriptPaths[item.id]?.critical || false;
                const warningHtml = item.warning ? `<div style="color:#f59e0b;font-size:10px;margin-top:2px;">${item.warning}</div>` : '';
                const disabledAttr = isCritical ? 'disabled' : '';
                
                html += `
                <div class="setting-item" style="cursor:pointer;opacity:${isCritical ? '0.9' : '1'};">
                    <div class="setting-icon blue"><i class="fas fa-cog"></i></div>
                    <div class="setting-content">
                        <div class="setting-title">${item.title}${isCritical ? ' 🔒' : ''}</div>
                        <div class="setting-description">${item.desc}</div>
                        ${warningHtml}
                    </div>
                    <div class="setting-value">
                        <label class="switch">                            <input type="checkbox" id="sw-${item.id}" ${disabledAttr}>
                            <span class="slider"></span>
                        </label>
                    </div>
                </div>`;
            });
            
            // ✅ Add CPU Frequency Scaling slider to System group
            if (groupName === 'System') {
                html += `
                <div class="setting-item">
                    <div class="setting-icon blue"><i class="fas fa-microchip"></i></div>
                    <div class="setting-content">
                        <div class="setting-title">CPU Frequency Scaling</div>
                        <div class="setting-description">Overall CPU frequency limit</div>
                        <input type="range" id="cpu-freq-slider" min="30" max="100" value="100" 
                            style="width:100%;margin-top:10px;">
                        <div id="cpu-freq-percent" style="color:#3b82f6;font-size:12px;margin-top:4px;">100%</div>
                        <div id="cpu-freq-display" style="margin-top:8px;"></div>
                    </div>
                </div>`;
            }
            
            html += `</div>`;
        }
        
        // ✅ Touch & Display Section (WITHOUT CPU Frequency Scaling)
        html += `
        <div class="settings-group" id="touch-display-section" style="opacity:0.5;pointer-events:none;">
            <h3>Touch & Display <span style="font-size:10px;color:#f59e0b;">(Requires Enable Touch Control)</span></h3>
            
            <div class="setting-item">
                <div class="setting-icon blue"><i class="fas fa-hand-pointer"></i></div>
                <div class="setting-content">
                    <div class="setting-title">Touch Active Frequency</div>
                    <div class="setting-description">CPU frequency when screen is touched</div>
                    <input type="range" id="touch-active-freq-slider" min="50" max="100" value="100" 
                        style="width:100%;margin-top:10px;" oninput="updateTouchActiveFreqDisplay(this.value)">
                    <div id="touch-active-freq-display" style="color:#3b82f6;font-size:12px;margin-top:4px;">100%</div>
                </div>
            </div>
            
            <div class="setting-item">
                <div class="setting-icon blue"><i class="fas fa-pause"></i></div>
                <div class="setting-content">
                    <div class="setting-title">Manual CPU Frequency %</div>
                    <div class="setting-description">CPU frequency when screen is inactive</div>
                    <input type="range" id="inactive-freq-slider" min="25" max="50" value="30" 
                        style="width:100%;margin-top:10px;" oninput="updateInactiveFreqDisplay(this.value)">
                    <div id="inactive-freq-display" style="color:#3b82f6;font-size:12px;margin-top:4px;">30%</div>                </div>
            </div>
            
            <div class="setting-item">
                <div class="setting-icon blue"><i class="fas fa-clock"></i></div>
                <div class="setting-content">
                    <div class="setting-title">Touch Timeout</div>
                    <div class="setting-description">Time before CPU frequency drops (ms)</div>
                    <input type="range" id="touch-timeout-slider" min="3" max="10" step="1" value="1" 
                        style="width:100%;margin-top:10px;" oninput="updateTouchTimeoutDisplay(this.value)">
                    <div id="touch-timeout-display" style="color:#3b82f6;font-size:12px;margin-top:4px;">3000ms</div>
                </div>
            </div>
        </div>`;
        
        container.innerHTML = html;
        console.log('✅ Controls rendered successfully');
        return true;
    }

    // Touch Control Functions
    function updateTouchActiveFreqDisplay(val) {
        const display = document.getElementById('touch-active-freq-display');
        if (display) display.textContent = `${val}%`;
    }

    function updateInactiveFreqDisplay(val) {
        const display = document.getElementById('inactive-freq-display');
        if (display) display.textContent = `${val}%`;
    }

    function updateTouchTimeoutDisplay(val) {
        const display = document.getElementById('touch-timeout-display');
        if (display) display.textContent = `${val}ms`;
    }

    async function applyTouchActiveFreq(e) {
        const val = parseInt(e.target.value);
        try {
            await execFn(`echo "${val}" > /sdcard/MTK_AI_Engine/manual_touch_active_freq.txt 2>/dev/null`, 2000);
            showStatus(`✅ Touch active frequency set to ${val}%`);
        } catch (err) {
            console.error('Failed to apply touch active freq:', err);
            showStatus('⚠️ Failed to apply setting', true);
        }
    }

    async function applyInactiveFreq(e) {
        const val = parseInt(e.target.value);
        try {            await execFn(`echo "${val}" > /sdcard/MTK_AI_Engine/manual_cpu_freq_pct.txt 2>/dev/null`, 2000);
            showStatus(`✅ Inactive CPU frequency set to ${val}%`);
        } catch (err) {
            console.error('Failed to apply inactive freq:', err);
            showStatus('⚠️ Failed to apply setting', true);
        }
    }

    async function applyTouchTimeout(e) {
        const val = parseInt(e.target.value);
        try {
            await execFn(`echo "${val}" > /sdcard/MTK_AI_Engine/touch_timeout.txt 2>/dev/null`, 2000);
            showStatus(`✅ Touch timeout set to ${val}ms`);
        } catch (err) {
            console.error('Failed to apply touch timeout:', err);
            showStatus('⚠️ Failed to apply setting', true);
        }
    }

    async function readActualCPUFreqs() {
        const freqs = {};
        try {
            const clusterCount = 8;
            for (let i = 0; i < clusterCount; i++) {
                const cpuPath = `/sys/devices/system/cpu/cpu${i}/cpufreq`;
                try {
                    const freq = await execFn(`cat ${cpuPath}/scaling_cur_freq 2>/dev/null`, 1000);
                    const freqVal = parseInt(freq.trim());
                    if (isNaN(freqVal)) continue;
                    
                    const clusterId = await execFn(`cat /sys/devices/system/cpu/cpu${i}/topology/physical_package_id 2>/dev/null`, 1000);
                    const clusterKey = (clusterId.trim() || "0");
                    freqs[clusterKey] = freqVal;
                } catch (e) {
                    continue;
                }
            }
        } catch (e) {
            console.warn("Failed to read CPU frequencies:", e);
        }
        return freqs;
    }

    async function displayCPUFreqInfo(percent) {
        const displayEl = document.getElementById('cpu-freq-display');
        const percentEl = document.getElementById('cpu-freq-percent');
        
        if (percentEl) {
            percentEl.textContent = `${percent}%`;
        }        
        const freqs = await readActualCPUFreqs();
        let html = '<h4 style="color:#fff;font-size:12px;margin:8px 0 4px;">Actual Frequencies:</h4><ul style="margin:0;padding-left:20px;color:#8b92b4;font-size:11px;">';
        
        for (const [cluster, freq] of Object.entries(freqs)) {
            html += `<li>Cluster ${cluster}: ${(freq / 1000).toFixed(0)} MHz</li>`;
        }
        
        if (Object.keys(freqs).length === 0) {
            html += '<li>Unavailable</li>';
        }
        
        html += '</ul>';
        
        if (displayEl) {
            displayEl.innerHTML = html;
        }
    }

    function setTouchSectionEnabled(enabled) {
        const section = document.getElementById('touch-display-section');
        if (section) {
            if (enabled) {
                section.style.opacity = '1';
                section.style.pointerEvents = 'auto';
            } else {
                section.style.opacity = '0.5';
                section.style.pointerEvents = 'none';
            }
            const sliders = section.querySelectorAll('input[type="range"]');
            sliders.forEach(slider => {
                slider.disabled = !enabled;
            });
        }
    }

    // ✅ Load CPU Frequency Scaling with sysfs permission management
async function loadCPUFreqScaling() {
    const cpuSlider = document.getElementById('cpu-freq-slider');
    if (!cpuSlider) return;
    
    try {
        // Load saved percentage
        const cpuFreqVal = await execFn(`cat /sdcard/MTK_AI_Engine/cpu_freq_scaling.txt 2>/dev/null`, 1000);
        let cpuFreq = parseInt(cpuFreqVal.trim()) || 100;
        cpuFreq = Math.max(30, Math.min(100, cpuFreq));
        
        cpuSlider.value = cpuFreq;
        await displayCPUFreqInfo(cpuFreq);
        
        // Live preview on slide
        cpuSlider.addEventListener('input', async () => {
            const val = parseInt(cpuSlider.value);
            await displayCPUFreqInfo(val);
        });
        
        // Apply on release
        cpuSlider.addEventListener('change', async () => {
            const percent = parseInt(cpuSlider.value);
            await applyCPUFrequencyPercent(percent);
        });
    } catch (e) {
        cpuSlider.value = 100;
        await displayCPUFreqInfo(100);
    }
}

// ✅ Apply CPU frequency using cpuinfo_max_freq as 100% baseline
// Permission flow: chmod 777 → write scaling_max_freq → chmod 000
async function applyCPUFrequencyPercent(percent) {
    showStatus(`⚡ Applying ${percent}% CPU frequency (based on cpuinfo_max_freq)...`);
    
    try {
        const cpuPaths = [];
        const maxFreqs = {};
        
        // Step 1: Read cpuinfo_max_freq (hardware absolute max) for each online CPU
        for (let i = 0; i < 8; i++) {
            const cpuPath = `/sys/devices/system/cpu/cpu${i}`;
            const online = await execFn(`cat ${cpuPath}/online 2>/dev/null`);
            
            // cpu0 may not have 'online' file or return empty → treat as online
            if (online.trim() === '1' || online.trim() === '') {
                const infoMaxPath = `${cpuPath}/cpufreq/cpuinfo_max_freq`;
                const scalingMaxPath = `${cpuPath}/cpufreq/scaling_max_freq`;
                                // Read hardware max (100% reference) - usually readable without chmod
                const cpuinfoMax = await execFn(`cat ${infoMaxPath} 2>/dev/null`);
                
                if (cpuinfoMax && !cpuinfoMax.includes('error')) {
                    cpuPaths.push({ 
                        cpu: i, 
                        infoMaxPath: infoMaxPath,      // read-only reference
                        scalingMaxPath: scalingMaxPath // writable target
                    });
                    maxFreqs[i] = parseInt(cpuinfoMax.trim());
                }
            }
        }
        
        if (cpuPaths.length === 0) {
            showStatus('❌ No CPU frequency paths found', true);
            return;
        }
        
        // Step 2: Calculate target frequencies based on cpuinfo_max_freq
        const changes = [];
        for (const { cpu, scalingMaxPath } of cpuPaths) {
            const hardwareMax = maxFreqs[cpu] || 2000000; // fallback 2GHz
            const targetFreq = Math.floor(hardwareMax * (percent / 100));
            changes.push({ path: scalingMaxPath, target: targetFreq, cpu: cpu });
        }
        
        // Step 3: Apply changes with permission management on scaling_max_freq
        for (const { path, target, cpu } of changes) {
            try {
                // 🔓 Unlock target file for writing
                await execFn(`su -c "chmod 777 ${path} 2>/dev/null || true"`, 2000);
                
                // ✏️ Write new frequency limit
                await execFn(`su -c "echo ${target} > ${path} 2>/dev/null"`, 2000);
                
                // 🔒 Lock file after write (your preferred 000 pattern)
                await execFn(`su -c "chmod 000 ${path} 2>/dev/null || true"`, 2000);
                
                console.log(`✅ CPU${cpu}: scaling_max_freq → ${target} Hz (${percent}% of ${maxFreqs[cpu]} Hz)`);
            } catch (err) {
                console.warn(`Failed to apply ${path}:`, err);
            }
        }
        
        // Save percentage to config file (with same permission pattern)
        const configFile = '/sdcard/MTK_AI_Engine/cpu_freq_scaling.txt';
        await execFn(`su -c "chmod 644 ${configFile} 2>/dev/null || true"`, 1000);
        await execFn(`echo "${percent}" > ${configFile} 2>/dev/null`, 1000);
        await execFn(`su -c "chmod 000 ${configFile} 2>/dev/null || true"`, 1000);        
        // Update display
        await displayCPUFreqInfo(percent);
        showStatus(`✅ CPU frequency set to ${percent}% of hardware max`);
        
    } catch (err) {
        console.error('Failed to apply CPU frequency:', err);
        showStatus('❌ Failed to apply CPU frequency', true);
    }
}

// ✅ Optional: Enhanced display function showing hardware vs current limit
async function displayCPUFreqInfo(percent) {
    const display = document.getElementById('cpu-freq-display');
    if (!display) return;
    
    try {
        let infoHTML = `<strong>${percent}% CPU Limit</strong><br>`;
        
        for (let i = 0; i < 8; i++) {
            const cpuPath = `/sys/devices/system/cpu/cpu${i}`;
            const online = await execFn(`cat ${cpuPath}/online 2>/dev/null`);
            
            if (online.trim() === '1' || online.trim() === '') {
                const infoMax = await execFn(`cat ${cpuPath}/cpufreq/cpuinfo_max_freq 2>/dev/null`);
                const scalingMax = await execFn(`cat ${cpuPath}/cpufreq/scaling_max_freq 2>/dev/null`);
                const curFreq = await execFn(`cat ${cpuPath}/cpufreq/scaling_cur_freq 2>/dev/null`);
                
                if (infoMax && !infoMax.includes('error')) {
                    const maxMHz = (parseInt(infoMax.trim()) / 1000).toFixed(0);
                    const targetMHz = (parseInt(infoMax.trim()) * percent / 100 / 1000).toFixed(0);
                    const currentMHz = curFreq && !curFreq.includes('error') ? (parseInt(curFreq.trim()) / 1000).toFixed(0) : 'N/A';
                    
                    infoHTML += `CPU${i}: <small>HW Max: ${maxMHz}MHz | Limit: ${targetMHz}MHz | Current: ${currentMHz}MHz</small><br>`;
                }
            }
        }
        display.innerHTML = infoHTML;
    } catch (e) {
        display.innerHTML = `<small>${percent}% applied</small>`;
    }
}

    async function loadTouchControls() {
        try {
            // Load touch active frequency
            const touchActiveVal = await execFn(`cat /sdcard/MTK_AI_Engine/manual_touch_active_freq.txt 2>/dev/null`, 1000);
            let touchActive = parseInt(touchActiveVal.trim()) || 100;
            touchActive = Math.max(50, Math.min(100, touchActive));
            
            const touchSlider = document.getElementById('touch-active-freq-slider');
            if (touchSlider) {
                touchSlider.value = touchActive;
                updateTouchActiveFreqDisplay(touchActive);
                touchSlider.oninput = function() { updateTouchActiveFreqDisplay(this.value); };
                touchSlider.onchange = applyTouchActiveFreq;
            }
            
            // Load inactive frequency from manual_cpu_freq_pct.txt
            const inactiveVal = await execFn(`cat /sdcard/MTK_AI_Engine/manual_cpu_freq_pct.txt 2>/dev/null`, 1000);
            let inactive = parseInt(inactiveVal.trim()) || 30;
            inactive = Math.max(25, Math.min(50, inactive));
            
            const inactiveSlider = document.getElementById('inactive-freq-slider');
            if (inactiveSlider) {
                inactiveSlider.value = inactive;
                updateInactiveFreqDisplay(inactive);
                inactiveSlider.oninput = function() { updateInactiveFreqDisplay(this.value); };
                inactiveSlider.onchange = applyInactiveFreq;
            }
            
            // Load touch timeout from touch_timeout.txt
            const timeoutVal = await execFn(`cat /sdcard/MTK_AI_Engine/touch_timeout.txt 2>/dev/null`, 1000);
            let timeout = parseInt(timeoutVal.trim()) || 3;
            timeout = Math.max(3, Math.min(10, timeout));
            
            const timeoutSlider = document.getElementById('touch-timeout-slider');
            if (timeoutSlider) {                timeoutSlider.value = timeout;
                updateTouchTimeoutDisplay(timeout);
                timeoutSlider.oninput = function() { updateTouchTimeoutDisplay(this.value); };
                timeoutSlider.onchange = applyTouchTimeout;
            }
            
            // ✅ CPU Frequency Scaling is now loaded separately in loadAllStates()
            
        } catch (e) {
            console.log("No saved touch frequency configs");
        }
    }

    async function loadStateForKey(key) {
        try {
            const stateFile = `${STATE_DIR}/${key}`;
            const exists = await execFn(`test -f ${stateFile} && echo "yes" || echo "no"`, 1000);
            if (exists.trim() === 'yes') {
                const content = await execFn(`cat ${stateFile} 2>/dev/null`, 1000);
                return content.trim() === '1';
            }
            return false;
        } catch (e) {
            console.warn(`Failed to load state for ${key}:`, e);
            return false;
        }
    }

    async function saveStateForKey(key, value) {
        try {
            const stateFile = `${STATE_DIR}/${key}`;
            if (value === '1') {
                await execFn(`echo "1" > ${stateFile} 2>/dev/null`, 1000);
            } else {
                await execFn(`rm -f ${stateFile} 2>/dev/null`, 1000);
            }
        } catch (e) { 
            console.warn(`Save failed for ${key}:`, e); 
        }
    }

    async function loadAllStates() {
        const keys = Object.keys(toggleConfig);
        console.log(`Loading states for ${keys.length} toggles...`);
        
        let loadedCount = 0;
        let failedCount = 0;
        
        for (const key of keys) {
            try {                const isEnabled = await loadStateForKey(key);
                
                const sw = document.getElementById(`sw-${key}`);
                if (sw) {
                    sw.checked = isEnabled;
                    if (scriptPaths[key]?.critical && isEnabled) {
                        sw.disabled = true;
                    }
                    
                    // Bind events
                    if (key === 'enable_limiter') {
                        setTouchSectionEnabled(isEnabled);
                        sw.addEventListener('change', async (e) => {
                            await applyToggle(key, e.target.checked);
                            setTouchSectionEnabled(e.target.checked);
                        });
                    } else if (!scriptPaths[key]?.critical) {
                        sw.addEventListener('change', async (e) => {
                            await applyToggle(key, e.target.checked);
                        });
                    } else {
                        sw.addEventListener('click', (e) => {
                            if (!e.target.checked) {
                                e.preventDefault();
                                e.target.checked = true;
                                showStatus(`⚠️ ${toggleConfig[key].title} cannot be disabled`, true);
                            }
                        });
                    }
                    
                    loadedCount++;
                }
            } catch (e) {
                failedCount++;
                console.warn(`Failed to load ${key}:`, e);
            }
        }
        
        console.log(`✅ Loaded ${loadedCount}/${keys.length} states (${failedCount} failed)`);
        
        // Load touch controls (without CPU freq scaling)
        await loadTouchControls();
        
        // ✅ Load CPU Frequency Scaling separately (now in System group)
        await loadCPUFreqScaling();
    }

    async function applyToggle(key, isEnabled) {
        const sw = document.getElementById(`sw-${key}`);
        if (sw) sw.disabled = true;
        const config = scriptPaths[key] || { on: null, off: null, isDaemon: false, procName: null, critical: false };
        const title = toggleConfig[key]?.title || key;

        if (!isEnabled && config.critical) {
            showStatus(`⚠️ Cannot disable ${title}`, true);
            if (sw) {
                sw.checked = true;
                sw.disabled = false;
            }
            return;
        }

        try {
            if (config.isDaemon && !isEnabled && config.procName) {
                await execFn(`su -c "pkill -15 -f ${config.procName} 2>/dev/null || true"`, 3000);
                await new Promise(r => setTimeout(r, 1500));
            }
            
            if (isEnabled && config.on) {
                await execFn(`su -c "chmod +x ${config.on} 2>/dev/null; ${config.on} 2>/dev/null || true"`, 3000);
            } else if (!isEnabled && config.off) {
                await execFn(`su -c "chmod +x ${config.off} 2>/dev/null; ${config.off} 2>/dev/null || true"`, 3000);
            }

            await saveStateForKey(key, isEnabled ? '1' : '0');
            
            showStatus(`✅ ${title} ${isEnabled ? 'enabled' : 'disabled'}`);
        } catch (err) {
            console.error(`Failed ${key}:`, err);
            showStatus(`⚠️ Error applying ${title}`, true);
        } finally {
            if (sw) sw.disabled = false;
        }
    }

    function showError(msg) {
        const container = document.getElementById('mtk-ai-controls');
        if (container) {
            container.innerHTML = `
                <div style="text-align:center;padding:40px;color:#ef4444;">
                    <i class="fas fa-exclamation-triangle" style="font-size:48px;margin-bottom:20px;display:block;"></i>
                    <div style="font-size:16px;margin-bottom:10px;">${msg}</div>
                    <button onclick="location.reload()" style="margin-top:20px;padding:10px 20px;background:#3b82f6;color:#fff;border:none;border-radius:8px;cursor:pointer;">Refresh Page</button>
                </div>
            `;
        }
    }

    async function init() {        console.log('🚀 Initializing MTK AI Engine...');
        
        const container = document.getElementById('mtk-ai-controls');
        if (!container) {
            console.error('❌ Container not found! Waiting for DOM...');
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        
        const rendered = renderControls();
        
        if (!rendered) {
            showError('Failed to render controls. Container missing.');
            return;
        }
        
        setTimeout(() => {
            loadAllStates().catch(err => {
                console.error('State load failed:', err);
            });
        }, 100);
        
        console.log('✅ MTK AI Engine initialized');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    window.MtkAiEngine = { init, applyToggle };
})();