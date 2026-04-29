// mtk_ai_engine.js - Main Control Panel (Complete: system.prop toggle + auto service restart)
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
    enable_trim: { on: null, off: null, isDaemon: false, critical: false },
    enable_bypass: { on: null, off: null, isDaemon: false, critical: false },
    enable_cleaner: { on: null, off: null, isDaemon: false, critical: false },
    enable_screen_off_throttle: { on: null, off: null, isDaemon: false, critical: false },
    low_power_mode: { on: null, off: null, isDaemon: false, critical: false },
    enable_notifications: { on: null, off: null, isDaemon: false, critical: false },
    throttle_user_apps_in_gaming: { on: null, off: null, isDaemon: false, critical: false },
    enable_limiter: { on: null, off: null, isDaemon: false, critical: false },
    enable_dnd_during_game: { on: null, off: null, isDaemon: false, critical: false },
    enable_module: { on: null, off: null, isDaemon: false, critical: false },
    fast_mode_switch: { on: null, off: null, isDaemon: false, critical: false },
    enable_cpu: { on: null, off: null, isDaemon: false, critical: false },
    enable_lite_gaming: { on: null, off: null, isDaemon: false, critical: false },
    disable_system_prop: { on: null, off: null, isDaemon: false, critical: false }
};

const toggleConfig = {
    enable_trim: { title: "Enable TRIM", desc: "Optimize storage performance & lifespan", group: "System" },
    enable_bypass: { title: "Charging Bypass", desc: "Bypass battery while plugged in", group: "Gaming" },
    enable_cleaner: { title: "Auto Cleaner", desc: "Periodically clear cache & temp files", group: "System" },
    disable_zram: { title: "Disable ZRAM", desc: "Free up RAM by disabling compressed swap", group: "Memory" },
    enable_performance: { title: "Performance Mode", desc: "Maximize CPU/GPU clocks & scheduler", group: "Performance" },
    enable_screen_off_throttle: { title: "Screen Off Throttle", desc: "Limit performance when display is off", group: "Battery" },
    low_power_mode: { title: "Deep sleep system", desc: "Enable deep sleep power mode during screen-off", group: "Battery" },
    enable_notifications: { title: "Module Notifications", desc: "Manage notification behavior of this module", group: "System" },
    throttle_user_apps_in_gaming: { title: "Throttle Background Apps", desc: "Limit background apps while gaming", group: "Gaming" },
    enable_limiter: { title: "Enable Touch Control", desc: "Master toggle for TOUCH Control & Smart Refresh rate", group: "Touch Control" },
    enable_highframerate: { title: "Unlock High FPS", desc: "Remove system-level FPS caps", group: "Gaming" },
    enable_disable_thermal: { title: "Disable Thermals", desc: "Bypass thermal throttling (⚠️ Risk of overheating)", group: "Thermal" },
    enable_gaming_prop: { title: "Gaming Properties", desc: "Apply gaming-specific system properties", group: "Gaming" },
    enable_dnd_during_game: { title: "DND During Game", desc: "Auto-enable Do Not Disturb while gaming", group: "Gaming" },
    enable_gaming_prop2: { title: "Gaming Props v2", desc: "Advanced gaming property tweaks", group: "Gaming" },
    enable_module: { title: "Module automation", desc: "No need to reboot when new modules installed except system level modules", group: "System" },
    fast_mode_switch: { title: "Fast Mode Switch", desc: "Quickly switch between normal, gaming & screen state profiles", group: "System" },
    enable_cpu: { title: "Auto shutdown CPU 6 & 7", desc: "Auto shutdown cpu 6 & 7 when temp reaches 42°C & auto revert in 39°C", group: "Battery" },    enable_lite_gaming: { title: "Lite Gaming Mode", desc: "Lightweight tweaks for low-end devices", group: "Gaming" },
    disable_system_prop: { title: "Disable System.prop", desc: "Remove system.prop to revert module properties", group: "System", warning: "⚠️ Requires reboot after removal" }
};

const execFn = async function(cmd, timeout = 2000) {
    return new Promise(resolve => {
        const cb = `mtk_exec_${Date.now()}_${Math.random().toString(36).slice(2)}`;
        let settled = false;
        const t = setTimeout(() => { 
            if (!settled) { settled = true; delete window[cb]; resolve(''); }
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
            clearTimeout(t);
            delete window[cb];
            resolve('');
        }
    });
};

// ✅ NEW: Auto-restart service on every toggle/slider change
async function restartService() {
    try {
        await execFn('su -c "pkill -9 -f \"/data/adb/modules/MTK_AI\" 2>/dev/null"', 3000);
        await new Promise(r => setTimeout(r, 400));
        const cmd = `su -c 'export PATH="/system/bin:/system/xbin:/sbin:/vendor/bin"; cd /data/adb/modules/MTK_AI; nohup sh /data/adb/modules/MTK_AI/service.sh >/dev/null 2>&1 & disown'`;
        await execFn(cmd, 5000);
        console.log('✅ MTK_AI service restarted');
    } catch (e) {
        console.warn('⚠️ Service restart skipped/failed:', e);
    }}

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
    if (!container) { console.error('❌ Container #mtk-ai-controls not found!'); return false; }

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
                     <label class="switch"><input type="checkbox" id="sw-${item.id}" ${disabledAttr}><span class="slider"></span></label>
                 </div>
             </div>`;
        });
        
        if (groupName === 'System') {
            html += `
             <div class="setting-item">
                 <div class="setting-icon blue"><i class="fas fa-microchip"></i></div>
                 <div class="setting-content">                     <div class="setting-title">CPU Frequency Scaling</div>
                     <div class="setting-description">Overall CPU frequency limit</div>
                     <input type="range" id="cpu-freq-slider" min="30" max="100" value="100" style="width:100%;margin-top:10px;">
                     <div id="cpu-freq-percent" style="color:#3b82f6;font-size:12px;margin-top:4px;">100%</div>
                     <div id="cpu-freq-display" style="margin-top:8px;"></div>
                 </div>
             </div>`;
        }
        html += `</div>`;
    }
    
    html += `
     <div class="settings-group" id="touch-display-section" style="opacity:0.5;pointer-events:none;">
         <h3>Touch & Display <span style="font-size:10px;color:#f59e0b;">(Requires Enable Touch Control)</span></h3>
         <div class="setting-item">
             <div class="setting-icon blue"><i class="fas fa-hand-pointer"></i></div>
             <div class="setting-content">
                 <div class="setting-title">Touch Active Frequency</div>
                 <div class="setting-description">CPU frequency when screen is touched</div>
                 <input type="range" id="touch-active-freq-slider" min="50" max="100" value="100" style="width:100%;margin-top:10px;" oninput="updateTouchActiveFreqDisplay(this.value)">
                 <div id="touch-active-freq-display" style="color:#3b82f6;font-size:12px;margin-top:4px;">100%</div>
             </div>
         </div>
         <div class="setting-item">
             <div class="setting-icon blue"><i class="fas fa-pause"></i></div>
             <div class="setting-content">
                 <div class="setting-title">Manual CPU Frequency %</div>
                 <div class="setting-description">CPU frequency when screen is inactive</div>
                 <input type="range" id="inactive-freq-slider" min="25" max="50" value="30" style="width:100%;margin-top:10px;" oninput="updateInactiveFreqDisplay(this.value)">
                 <div id="inactive-freq-display" style="color:#3b82f6;font-size:12px;margin-top:4px;">30%</div>
             </div>
         </div>
         <div class="setting-item">
             <div class="setting-icon blue"><i class="fas fa-clock"></i></div>
             <div class="setting-content">
                 <div class="setting-title">Touch Timeout</div>
                 <div class="setting-description">Time before CPU frequency drops (ms)</div>
                 <input type="range" id="touch-timeout-slider" min="3" max="10" step="1" value="1" style="width:100%;margin-top:10px;" oninput="updateTouchTimeoutDisplay(this.value)">
                 <div id="touch-timeout-display" style="color:#3b82f6;font-size:12px;margin-top:4px;">3000ms</div>
             </div>
         </div>
     </div>`;
    
    container.innerHTML = html;
    return true;
}

function updateTouchActiveFreqDisplay(val) { const d = document.getElementById('touch-active-freq-display'); if(d) d.textContent = `${val}%`; }
function updateInactiveFreqDisplay(val) { const d = document.getElementById('inactive-freq-display'); if(d) d.textContent = `${val}%`; }
function updateTouchTimeoutDisplay(val) { const d = document.getElementById('touch-timeout-display'); if(d) d.textContent = `${val}ms`; }
async function applyTouchActiveFreq(e) {
    const val = parseInt(e.target.value);
    try {
        await execFn(`echo "${val}" > /sdcard/MTK_AI_Engine/manual_touch_active_freq.txt 2>/dev/null`, 2000);
        showStatus(`✅ Touch active frequency set to ${val}%`);
        await restartService();
    } catch (err) { showStatus('⚠️ Failed to apply setting', true); }
}

async function applyInactiveFreq(e) {
    const val = parseInt(e.target.value);
    try {
        await execFn(`echo "${val}" > /sdcard/MTK_AI_Engine/manual_cpu_freq_pct.txt 2>/dev/null`, 2000);
        showStatus(`✅ Inactive CPU frequency set to ${val}%`);
        await restartService();
    } catch (err) { showStatus('⚠️ Failed to apply setting', true); }
}

async function applyTouchTimeout(e) {
    const val = parseInt(e.target.value);
    try {
        await execFn(`echo "${val}" > /sdcard/MTK_AI_Engine/touch_timeout.txt 2>/dev/null`, 2000);
        showStatus(`✅ Touch timeout set to ${val}ms`);
        await restartService();
    } catch (err) { showStatus('⚠️ Failed to apply setting', true); }
}

async function readActualCPUFreqs() {
    const freqs = {};
    try {
        for (let i = 0; i < 8; i++) {
            const cpuPath = `/sys/devices/system/cpu/cpu${i}/cpufreq`;
            try {
                const freq = await execFn(`cat ${cpuPath}/scaling_cur_freq 2>/dev/null`, 1000);
                const freqVal = parseInt(freq.trim());
                if (isNaN(freqVal)) continue;
                const clusterId = await execFn(`cat /sys/devices/system/cpu/cpu${i}/topology/physical_package_id 2>/dev/null`, 1000);
                freqs[(clusterId.trim() || "0")] = freqVal;
            } catch (e) { continue; }
        }
    } catch (e) { console.warn("Failed to read CPU frequencies: ", e); }
    return freqs;
}

async function displayCPUFreqInfo(percent) {
    const displayEl = document.getElementById('cpu-freq-display');
    const percentEl = document.getElementById('cpu-freq-percent');
    if (percentEl) percentEl.textContent = `${percent}%`;
    const freqs = await readActualCPUFreqs();    let html = '<h4 style="color:#fff;font-size:12px;margin:8px 0 4px;">Actual Frequencies:</h4><ul style="margin:0;padding-left:20px;color:#8b92b4;font-size:11px;">';
    for (const [cluster, freq] of Object.entries(freqs)) html += `<li>Cluster ${cluster}: ${(freq / 1000).toFixed(0)} MHz</li>`;
    if (Object.keys(freqs).length === 0) html += '<li>Unavailable</li>';
    html += '</ul>';
    if (displayEl) displayEl.innerHTML = html;
}

function setTouchSectionEnabled(enabled) {
    const section = document.getElementById('touch-display-section');
    if (section) {
        section.style.opacity = enabled ? '1' : '0.5';
        section.style.pointerEvents = enabled ? 'auto' : 'none';
        section.querySelectorAll('input[type="range"]').forEach(s => s.disabled = !enabled);
    }
}

async function loadCPUFreqScaling() {
    const cpuSlider = document.getElementById('cpu-freq-slider');
    if (!cpuSlider) return;
    try {
        const cpuFreqVal = await execFn(`cat /sdcard/MTK_AI_Engine/cpu_freq_scaling.txt 2>/dev/null`, 1000);
        let cpuFreq = parseInt(cpuFreqVal.trim()) || 100;
        cpuFreq = Math.max(30, Math.min(100, cpuFreq));
        cpuSlider.value = cpuFreq;
        await displayCPUFreqInfo(cpuFreq);
        cpuSlider.addEventListener('input', async () => await displayCPUFreqInfo(parseInt(cpuSlider.value)));
        cpuSlider.addEventListener('change', async () => await applyCPUFrequencyPercent(parseInt(cpuSlider.value)));
    } catch (e) { cpuSlider.value = 100; await displayCPUFreqInfo(100); }
}

async function applyCPUFrequencyPercent(percent) {
    showStatus(`⚡ Applying ${percent}% CPU frequency (based on cpuinfo_max_freq)...`);
    try {
        const cpuPaths = [], maxFreqs = {};
        for (let i = 0; i < 8; i++) {
            const cpuPath = `/sys/devices/system/cpu/cpu${i}`;
            const online = await execFn(`cat ${cpuPath}/online 2>/dev/null`);
            if (online.trim() === '1' || online.trim() === '') {
                const infoMaxPath = `${cpuPath}/cpufreq/cpuinfo_max_freq`;
                const scalingMaxPath = `${cpuPath}/cpufreq/scaling_max_freq`;
                const cpuinfoMax = await execFn(`cat ${infoMaxPath} 2>/dev/null`);
                if (cpuinfoMax && !cpuinfoMax.includes('error')) {
                    cpuPaths.push({ cpu: i, scalingMaxPath });
                    maxFreqs[i] = parseInt(cpuinfoMax.trim());
                }
            }
        }
        if (cpuPaths.length === 0) { showStatus('❌ No CPU frequency paths found', true); return; }
        
        for (const { cpu, scalingMaxPath } of cpuPaths) {            const hardwareMax = maxFreqs[cpu] || 2000000;
            const targetFreq = Math.floor(hardwareMax * (percent / 100));
            await execFn(`su -c "chmod 777 ${scalingMaxPath} 2>/dev/null || true"`, 2000);
            await execFn(`su -c "echo ${targetFreq} > ${scalingMaxPath} 2>/dev/null"`, 2000);
            await execFn(`su -c "chmod 000 ${scalingMaxPath} 2>/dev/null || true"`, 2000);
        }
        const configFile = '/sdcard/MTK_AI_Engine/cpu_freq_scaling.txt';
        await execFn(`su -c "chmod 644 ${configFile} 2>/dev/null || true"`, 1000);
        await execFn(`echo "${percent}" > ${configFile} 2>/dev/null`, 1000);
        await execFn(`su -c "chmod 000 ${configFile} 2>/dev/null || true"`, 1000);
        await displayCPUFreqInfo(percent);
        showStatus(`✅ CPU frequency set to ${percent}% of hardware max`);
        await restartService();
    } catch (err) { showStatus('❌ Failed to apply CPU frequency', true); }
}

async function loadTouchControls() {
    try {
        const touchActiveVal = await execFn(`cat /sdcard/MTK_AI_Engine/manual_touch_active_freq.txt 2>/dev/null`, 1000);
        let touchActive = parseInt(touchActiveVal.trim()) || 100; touchActive = Math.max(50, Math.min(100, touchActive));
        const touchSlider = document.getElementById('touch-active-freq-slider');
        if (touchSlider) { touchSlider.value = touchActive; updateTouchActiveFreqDisplay(touchActive); touchSlider.oninput = function() { updateTouchActiveFreqDisplay(this.value); }; touchSlider.onchange = applyTouchActiveFreq; }
        
        const inactiveVal = await execFn(`cat /sdcard/MTK_AI_Engine/manual_cpu_freq_pct.txt 2>/dev/null`, 1000);
        let inactive = parseInt(inactiveVal.trim()) || 30; inactive = Math.max(25, Math.min(50, inactive));
        const inactiveSlider = document.getElementById('inactive-freq-slider');
        if (inactiveSlider) { inactiveSlider.value = inactive; updateInactiveFreqDisplay(inactive); inactiveSlider.oninput = function() { updateInactiveFreqDisplay(this.value); }; inactiveSlider.onchange = applyInactiveFreq; }
        
        const timeoutVal = await execFn(`cat /sdcard/MTK_AI_Engine/touch_timeout.txt 2>/dev/null`, 1000);
        let timeout = parseInt(timeoutVal.trim()) || 3; timeout = Math.max(3, Math.min(10, timeout));
        const timeoutSlider = document.getElementById('touch-timeout-slider');
        if (timeoutSlider) { timeoutSlider.value = timeout; updateTouchTimeoutDisplay(timeout); timeoutSlider.oninput = function() { updateTouchTimeoutDisplay(this.value); }; timeoutSlider.onchange = applyTouchTimeout; }
    } catch (e) { console.log("No saved touch frequency configs"); }
}

async function loadStateForKey(key) {
    try {
        const stateFile = `${STATE_DIR}/${key}`;
        const exists = await execFn(`test -f ${stateFile} && echo "yes" || echo "no"`, 1000);
        if (exists.trim() === 'yes') { const content = await execFn(`cat ${stateFile} 2>/dev/null`, 1000); return content.trim() === '1'; }
        return false;
    } catch (e) { return false; }
}

async function saveStateForKey(key, value) {
    try {
        const stateFile = `${STATE_DIR}/${key}`;
        if (value === '1') await execFn(`echo "1" > ${stateFile} 2>/dev/null`, 1000);
        else await execFn(`rm -f ${stateFile} 2>/dev/null`, 1000);
    } catch (e) { console.warn(`Save failed for ${key}:`, e); }}

async function loadAllStates() {
    const keys = Object.keys(toggleConfig);
    console.log(`Loading states for ${keys.length} toggles...`);
    let loadedCount = 0, failedCount = 0;
    
    for (const key of keys) {
        if (key === 'disable_system_prop') continue;
        try {
            const isEnabled = await loadStateForKey(key);
            const sw = document.getElementById(`sw-${key}`);
            if (sw) {
                sw.checked = isEnabled;
                if (scriptPaths[key]?.critical && isEnabled) sw.disabled = true;
                if (key === 'enable_limiter') {
                    setTouchSectionEnabled(isEnabled);
                    sw.addEventListener('change', async (e) => { await applyToggle(key, e.target.checked); setTouchSectionEnabled(e.target.checked); });
                } else if (!scriptPaths[key]?.critical) {
                    sw.addEventListener('change', async (e) => await applyToggle(key, e.target.checked));
                } else {
                    sw.addEventListener('click', (e) => { if (!e.target.checked) { e.preventDefault(); e.target.checked = true; showStatus(`⚠️ ${toggleConfig[key].title} cannot be disabled`, true); } });
                }
                loadedCount++;
            }
        } catch (e) { failedCount++; console.warn(`Failed to load ${key}:`, e); }
    }
    console.log(`✅ Loaded ${loadedCount}/${keys.length} states (${failedCount} failed)`);

    // ✅ Handle disable_system_prop: check actual file existence
    try {
        const propExists = await execFn(`su -c "test -f /data/adb/modules/MTK_AI/system.prop && echo yes || echo no"`, 1500);
        const sw = document.getElementById('sw-disable_system_prop');
        if (sw) {
            const isRemoved = propExists.trim() === 'no';
            sw.checked = isRemoved;
            if (isRemoved) { showStatus('ℹ️ system.prop not found. Toggle auto-enabled.'); await saveStateForKey('disable_system_prop', '1'); }
            sw.addEventListener('change', async (e) => await applyToggle('disable_system_prop', e.target.checked));
        }
    } catch (e) { console.warn('Failed to check system.prop status:', e); }

    await loadTouchControls();
    await loadCPUFreqScaling();
}

async function applyToggle(key, isEnabled) {
    const sw = document.getElementById(`sw-${key}`);
    if (sw) sw.disabled = true;
    const config = scriptPaths[key] || { on: null, off: null, isDaemon: false, procName: null, critical: false };
    const title = toggleConfig[key]?.title || key;
    if (!isEnabled && config.critical) {
        showStatus(`⚠️ Cannot disable ${title}`, true);
        if (sw) { sw.checked = true; sw.disabled = false; }
        return;
    }

    // ✅ Custom logic for disable_system_prop
    if (key === 'disable_system_prop') {
        if (isEnabled) {
            showStatus('🗑️ Removing system.prop...');
            try {
                await execFn(`su -c "rm -f /data/adb/modules/MTK_AI/system.prop 2>/dev/null"`, 3000);
                await saveStateForKey(key, '1');
                await restartService();
                showStatus('✅ system.prop removed successfully.');
                setTimeout(() => {
                    alert('⚠️ REBOOT REQUIRED\n\nThe module\'s system.prop has been permanently removed.\nPlease reboot your device for changes to fully take effect.');
                }, 800);
            } catch (e) { showStatus('❌ Failed to remove system.prop', true); }
        } else {
            showStatus('⚠️ Re-enabling requires reinstalling the module or manually restoring the file.');
        }
        if (sw) sw.disabled = false;
        return;
    }

    try {
        if (config.isDaemon && !isEnabled && config.procName) {
            await execFn(`su -c "pkill -15 -f ${config.procName} 2>/dev/null || true"`, 3000);
            await new Promise(r => setTimeout(r, 1500));
        }
        if (isEnabled && config.on) await execFn(`su -c "chmod +x ${config.on} 2>/dev/null; ${config.on} 2>/dev/null || true"`, 3000);
        else if (!isEnabled && config.off) await execFn(`su -c "chmod +x ${config.off} 2>/dev/null; ${config.off} 2>/dev/null || true"`, 3000);
        
        await saveStateForKey(key, isEnabled ? '1' : '0');
        showStatus(`✅ ${title} ${isEnabled ? 'enabled' : 'disabled'}`);
        await restartService(); // ✅ Auto restart on toggle
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
        container.innerHTML = `<div style="text-align:center;padding:40px;color:#ef4444;"><i class="fas fa-exclamation-triangle" style="font-size:48px;margin-bottom:20px;display:block;"></i><div style="font-size:16px;margin-bottom:10px;">${msg}</div><button onclick="location.reload()" style="margin-top:20px;padding:10px 20px;background:#3b82f6;color:#fff;border:none;border-radius:8px;cursor:pointer;">Refresh Page</button></div>`;    }
}

async function init() {
    console.log('🚀 Initializing MTK AI Engine...');
    const container = document.getElementById('mtk-ai-controls');
    if (!container) { console.error('❌ Container not found! Waiting for DOM...'); await new Promise(resolve => setTimeout(resolve, 500)); }
    const rendered = renderControls();
    if (!rendered) { showError('Failed to render controls. Container missing.'); return; }
    setTimeout(() => loadAllStates().catch(err => console.error('State load failed:', err)), 100);
    console.log('✅ MTK AI Engine initialized');
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();

window.MtkAiEngine = { init, applyToggle };
})();
