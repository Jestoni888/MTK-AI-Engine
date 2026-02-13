    // --- SAFE EXECUTION ENGINE ---
    function exec(command, timeout = 3000) {
        return new Promise((resolve) => {
            const cb = `exec_cb_${Date.now()}_${Math.random().toString(36).substring(2)}`;
            const timer = setTimeout(() => { delete window[cb]; resolve("TIMEOUT"); }, timeout);
            window[cb] = (errno, stdout) => { clearTimeout(timer); delete window[cb]; resolve(stdout || ""); };
            if (window.ksu) { ksu.exec(command, `window.${cb}`); }
            else { clearTimeout(timer); resolve(""); }
        });
    }

    // --- WATCHDOG: AUTO-REFRESH ON FREEZE ---
    (function() {
        let lastHeartbeat = Date.now();
        setInterval(() => { lastHeartbeat = Date.now(); }, 1000); // Pulse
        setInterval(() => {
            if (Date.now() - lastHeartbeat > 7000) { // If UI stuck for 7s
                if (window.ksu) ksu.exec("pkill -f ", ""); 
                location.reload(); 
            }
        }, 2000);
    })();
    
    const CFG_DIR = "/sdcard/MTK_AI_Engine";
    const MOD_DIR = "/data/adb/modules/MTK_AI";

    const scriptPaths = {
        enable_disable_thermal: { on: `${MOD_DIR}/MTK_AI/AI_MODE/gaming_mode/disable_thermal`, off: null },
        enable_performance: { on: `${MOD_DIR}/MTK_AI/AI_MODE/gaming_mode/performance`, off: null }, 
        disable_zram: { on: `${MOD_DIR}/MTK_AI/AI_MODE/gaming_mode/disable_zram`, off: null },
        enable_gaming_prop: { on: `${MOD_DIR}/MTK_AI/AI_MODE/gaming_mode/gaming_prop`, off: null },
        enable_auto_freq: { on: `${MOD_DIR}/MTK_AI/AI_MODE/auto_frequency/auto_frequency`, off: `${MOD_DIR}/MTK_AI/AI_MODE/auto_frequency/stop_auto_frequency`, isDaemon: true, procName: "auto_frequency" },
        enable_gaming_prop2: { on: `${MOD_DIR}/MTK_AI/AI_MODE/gaming_mode/gaming_prop_2`, off: `${MOD_DIR}/MTK_AI/AI_MODE/normal_mode/normal_prop` },
        enable_highframerate: { on: `${MOD_DIR}/MTK_AI/AI_MODE/gaming_mode/unlockfps`, off: null },
        enable_surfaceflinger: { on: `${MOD_DIR}/MTK_AI/AI_MODE/auto_frequency/surfaceflinger`, off: null, isDaemon: true, procName: "surfaceflinger" }
    };

    const toggles = [
        'enable_trim', 'enable_bypass', 'enable_cleaner', 'enable_auto_freq', 'disable_zram', 'enable_performance',
        'enable_notifications',
        'enable_limiter', 'enable_highframerate',
        'enable_disable_thermal', 'enable_disable_thermal2', 'enable_disable_thermal3', 'enable_gaming_prop', 'enable_gaming_prop2', 'enable_cpu', 
        'enable_lite_gaming',
    ];

    async function init() {
        const status = document.getElementById('debug-msg');
        await exec(`mkdir -p ${CFG_DIR}`);
        await initBaseDensity(); // ← ADD THIS
        
        async function init() {
    const status = document.getElementById('debug-msg');
    await exec(`mkdir -p ${CFG_DIR}`);
    await initBaseDensity();
    await loadSavedGlobalSettings(); // ← ADD THIS LINE
    
    // DEBUG: Verify exec() works
const testWrite = await exec(`mkdir -p /sdcard/MTK_AI_Engine/config && echo "test" > /sdcard/MTK_AI_Engine/config/test_write.txt && cat /sdcard/MTK_AI_Engine/config/test_write.txt`);
console.log("Test write result:", testWrite.trim());

// Load detection state
const hasLogcat = await exec(`[ -f /sdcard/MTK_AI_Engine/config/enable_logcat ] && echo "yes" || echo "no"`);
console.log("Logcat file exists:", hasLogcat.trim());
document.getElementById('detection-status').textContent = (hasLogcat.trim() === 'yes') ? 'Logcat' : 'Dumpsys';
}

// Setup global scaling slider
const globalScaleSlider = document.getElementById('global-scaling-slider');
const globalScaleDisplay = document.getElementById('global-scaling-val');

// Load saved value
loadSavedGlobalScaling();

// Real-time display update
globalScaleSlider.oninput = function() {
    updateGlobalScalingDisplay(this.value);
};

// Apply when released
globalScaleSlider.onchange = applyGlobalScaling;

// In your init() function:
await loadCpuControlSettings();

// Setup event listeners for dynamic sliders
document.addEventListener('DOMContentLoaded', () => {
    // Add event listeners when DOM is ready
    setTimeout(() => {
        const sliders = document.querySelectorAll('[id$="-cpu-share-slider"]');
        sliders.forEach(slider => {
            slider.oninput = () => updateCpuShareDisplay(slider.id);
            slider.onchange = applyCpuControlSettings;
        });
        
        const applyBtn = document.getElementById('apply-cpu-control-btn');
        if (applyBtn) {
            applyBtn.onclick = applyCpuControlSettings;
        }
    }, 1000);
});

// Load CPU shares
    await loadCpuControlSettings();
    
    // Setup buttons
    const cpuApplyBtn = document.getElementById('apply-cpu-control-btn');
    if (cpuApplyBtn) {
        cpuApplyBtn.onclick = applyCpuControlSettings;
    }
    
        // --- SATURATION ---
        const satS = document.getElementById('saturation_slider');
        const satT = document.getElementById('saturation_val');
        const sSaved = await exec(`cat ${CFG_DIR}/saturation_value 2>/dev/null`);
        if (sSaved.trim()) { satS.value = sSaved.trim(); satT.innerText = sSaved.trim(); }
        satS.oninput = async function() {
            satT.innerText = this.value;
            await exec(`service call SurfaceFlinger 1022 f ${this.value}`);
            await exec(`echo ${this.value} > ${CFG_DIR}/saturation_value`);
        };
        
        // Load EEM voltage offset
await loadSavedEemOffset();

// Setup EEM slider
const eemSlider = document.getElementById('eem-offset-slider');
const eemApplyBtn = document.getElementById('apply-eem-btn');

if (eemSlider) {
    // Use the GLOBAL function, not the per-app one
    eemSlider.oninput = function() {
        updateEemOffsetDisplayGlobal(this.value);
    };
    // Also add onchange to apply immediately when dragging stops
    eemSlider.onchange = applyEemVoltageOffset;
}

if (eemApplyBtn) {
    eemApplyBtn.onclick = applyEemVoltageOffset;
}
        
        // Load saved touch frequency settings
try {
    // Touch Active
    const activeRaw = await exec(`cat /sdcard/MTK_AI_Engine/manual_touch_active_freq.txt 2>/dev/null`);
    let activePerc = parseInt(activeRaw.trim()) || 100;
    // Clamp to valid range
    activePerc = Math.max(50, Math.min(100, activePerc));
    document.getElementById('touch-active-freq-slider').value = activePerc;
    updateTouchActiveFreqDisplay(activePerc);
    
    // Inactive CPU
    const inactiveRaw = await exec(`cat /sdcard/MTK_AI_Engine/manual_inactive_freq.txt 2>/dev/null`);
    let inactivePerc = parseInt(inactiveRaw.trim()) || 30;
    // Clamp to valid range (25-50%)
    inactivePerc = Math.max(25, Math.min(50, inactivePerc));
    document.getElementById('inactive-freq-slider').value = inactivePerc;
    updateInactiveFreqDisplay(inactivePerc);
} catch (e) {
    console.log("No saved touch frequency configs");
}

// SETUP EVENT LISTENERS (MUST BE OUTSIDE try/catch!)
const touchActiveSlider = document.getElementById('touch-active-freq-slider');
const inactiveSlider = document.getElementById('inactive-freq-slider');

if (touchActiveSlider) {
    touchActiveSlider.oninput = function() {
        updateTouchActiveFreqDisplay(this.value);
    };
    touchActiveSlider.onchange = applyTouchActiveFreq;
}

if (inactiveSlider) {
    inactiveSlider.oninput = function() {
        updateInactiveFreqDisplay(this.value);
    };
    inactiveSlider.onchange = applyInactiveFreq;
}

// Load CPU frequency setting
try {
    const freqRaw = await exec(`cat /sdcard/MTK_AI_Engine/cpu_freq_scaling.txt 2>/dev/null`);
    let freqPercent = parseInt(freqRaw.trim()) || 100;
    freqPercent = Math.max(30, Math.min(100, freqPercent));
    document.getElementById('cpu-freq-slider').value = freqPercent;
    updateCpuFreqDisplay(freqPercent);
} catch (e) {
    // Default to 100%
    document.getElementById('cpu-freq-slider').value = 100;
    updateCpuFreqDisplay(100);
}

        // --- ANDROID LOW POWER MODE (REPLACES DEEP SLEEP GOVERNOR) ---
const psT = document.getElementById('enable_smart_powersave');
const psF = `${CFG_DIR}/low_power_mode`; // Flag file
const psExec = `${CFG_DIR}/low_power_mode.exec`; // Disabled state

// Helper to check current system low power state
const getLowPowerState = async () => {
    const val = await exec(`settings get global low_power`);
    return val.trim() === '1' ? 'on' : 'off';
};

// Load saved state: prefer flag file, fallback to actual system state
let savedState = await exec(`[ -f "${psF}" ] && echo "on" || echo "off"`);
if (savedState.trim() === "off") {
    savedState = await getLowPowerState();
}
psT.checked = (savedState.trim() === "on");

psT.onchange = async () => {
    const isEnabled = psT.checked;

    // Save persistent state
    if (isEnabled) {
        await exec(`mv "${psExec}" "${psF}" 2>/dev/null || touch "${psF}"`);
    } else {
        await exec(`mv "${psF}" "${psExec}" 2>/dev/null || touch "${psExec}"`);
    }

    // Build full low-power command
    const cmd = `
        # Set core low power flags
        settings put global low_power ${isEnabled ? '1' : '0'}
        settings put global low_power_sticky ${isEnabled ? '1' : '0'}

        # App restriction & standby
        settings put global app_auto_restriction_enabled ${isEnabled ? 'true' : 'false'}
        settings put global forced_app_standby_enabled ${isEnabled ? '1' : '0'}
        settings put global app_standby_enabled 1
        settings put global forced_app_standby_for_small_battery_enabled ${isEnabled ? '1' : '0'}

        # Disable MIUI AI preload (if exists)
        ai=\$(settings get system ai_preload_user_state 2>/dev/null)
        if [ "\$ai" != "null" ]; then
            settings put system ai_preload_user_state 0
        fi

        # Kill debug/perf services
        killall -9 woodpeckerd atfwd perfd magisklogd cnss_diag 2>/dev/null

        # Clear device idle whitelist aggressively
        if command -v dumpsys >/dev/null; then
            for item in \$(dumpsys deviceidle whitelist 2>/dev/null); do
                app=\$(echo "\$item" | cut -f2 -d ',')
                dumpsys deviceidle whitelist -\$app 2>/dev/null
                am set-inactive \$app true 2>/dev/null
                am set-idle \$app true 2>/dev/null
                am make-uid-idle --user current \$app 2>/dev/null
            done

            # Force DeviceIdle into deep sleep steps
            dumpsys deviceidle step 2>/dev/null
            dumpsys deviceidle step 2>/dev/null
            dumpsys deviceidle step 2>/dev/null
            dumpsys deviceidle step 2>/dev/null
        fi

        echo "Low Power Mode ${isEnabled ? 'ENABLED' : 'DISABLED'}"
    `;

    status.innerText = `Applying ${isEnabled ? 'Low Power Mode' : 'Normal Mode'}...`;
    await exec(cmd);
    status.innerText = isEnabled ? "Low Power Mode Active!" : "Back to Normal Mode";
    
    // Optional: force UI refresh
    setTimeout(() => { status.innerText = "System Ready"; }, 2000);
};

        // --- ALL TOGGLES ---
        for (const id of toggles) {
            const el = document.getElementById(id);
            if (!el) continue;
            const sF = `${CFG_DIR}/${id}`;
            const eF = `${CFG_DIR}/${id}.exec`;

            const res = await exec(`[ -f "${sF}" ] && echo "on" || echo "off"`);
            el.checked = (res.trim() === "on");

            el.onchange = async () => {
                const paths = scriptPaths[id];
                if (el.checked) {
                    await exec(`mv "${eF}" "${sF}" 2>/dev/null || touch "${sF}"`);
                    if (paths?.on) {
                        const cmd = paths.isDaemon ? `nohup  ${paths.on} > /dev/null 2>&1 &` : ` ${paths.on}`;
                        await exec(cmd);
                    }
                    status.innerText = "Enabled: " + id;
                } else {
                    await exec(`mv "${sF}" "${eF}" 2>/dev/null || touch "${eF}"`);
                    if (paths?.off) await exec(` ${paths.off}`);
                    if (paths?.isDaemon && paths.procName) await exec(`pkill -f ${paths.procName}`);
                    status.innerText = "Disabled: " + id;
                }
            };
        }
                             
        // --- DISPLAY ANIMATION SPEED CONTROL ---
const animBtn = document.getElementById('apply_anim_btn');
if (animBtn) {
    // Helper to safely get setting or fallback
    const getSetting = async (key, fallback = '1') => {
        const val = await exec(`settings get global ${key}`);
        return val.trim() === 'null' || val.trim() === '' ? fallback : val.trim();
    };

    // Load current values on startup
    const wVal = await getSetting('window_animation_scale', '1');
    const tVal = await getSetting('transition_animation_scale', '1');
    const aVal = await getSetting('animator_duration_scale', '1');
    const rVal = await getSetting('transition_animation_duration_ratio', '1');

    // Set dropdowns to current system values
    document.getElementById('anim_window').value = wVal;
    document.getElementById('anim_transition').value = tVal;
    document.getElementById('anim_animator').value = aVal;
    document.getElementById('anim_duration_ratio').value = rVal;

    // Apply button logic
    animBtn.onclick = async () => {
        const w = document.getElementById('anim_window').value || '1';
        const trans = document.getElementById('anim_transition').value || '1';
        const anim = document.getElementById('anim_animator').value || '1';
        const ratio = document.getElementById('anim_duration_ratio').value || '1';

        status.innerText = "Applying animation settings...";
        animBtn.style.opacity = "0.6";

        // Apply all four settings
        await exec(`settings put global window_animation_scale ${w}`);
        await exec(`settings put global transition_animation_scale ${trans}`);
        await exec(`settings put global animator_duration_scale ${anim}`);
        await exec(`settings put global transition_animation_duration_ratio ${ratio}`);

        // Optional: persist to config (if you want reboot persistence)
        await exec(`
            mkdir -p ${CFG_DIR}/animation
            echo "${w}" > ${CFG_DIR}/animation/window
            echo "${trans}" > ${CFG_DIR}/animation/transition
            echo "${anim}" > ${CFG_DIR}/animation/animator
            echo "${ratio}" > ${CFG_DIR}/animation/ratio
        `);

        animBtn.style.opacity = "1";
        status.innerText = "Animation speed updated!";
        setTimeout(() => { status.innerText = "System Ready"; }, 2000);
    };
}
        
// --- DYNAMIC zRAM & SWAPPINESS CONTROL (20GB MAX) ---
const zSizeS = document.getElementById('zram_size_slider');
const zSizeT = document.getElementById('zram_size_val');
const zSwapI = document.getElementById('zram_swappiness_input');
const zApply = document.getElementById('apply_zram_btn');
const zStats = document.getElementById('zram_stats_text');
const zWarning = document.getElementById('zram_warning') || 
                (() => { 
                    const w = document.createElement('div'); 
                    w.id = 'zram_warning'; 
                    w.style.color = '#ffcc00'; 
                    w.style.fontSize = '0.85em'; 
                    w.style.marginTop = '8px'; 
                    w.style.display = 'none'; 
                    zApply.parentNode.insertBefore(w, zApply.nextSibling); 
                    return w; 
                })();

// Max zRAM size: 20GB (20480 MB)
const MAX_ZRAM_MB = 20480;
let totalPhysicalMB = 4096; // Default fallback

const refreshZramUI = async () => {
    // Get physical RAM size
    const memInfo = await exec("cat /proc/meminfo | grep MemTotal | awk '{print $2}'");
    totalPhysicalMB = Math.floor(parseInt(memInfo) / 1024) || 4096;

    // SET SLIDER MAX TO 20GB (not physical RAM)
    zSizeS.max = MAX_ZRAM_MB;
    zSizeS.min = 256; // Minimum sensible value
    zSizeS.step = totalPhysicalMB > 8192 ? 256 : 128; // Adaptive step

    const zDev = await exec("grep '/zram' /proc/swaps | awk '{print $1}'");
    const devPath = zDev.trim() || "/dev/block/zram0";
    const devName = devPath.split('/').pop();

    const diskSizeRaw = await exec(`cat /sys/block/${devName}/disksize 2>/dev/null`);
    const curSwp = await exec("cat /proc/sys/vm/swappiness");

    if (curSwp) zSwapI.value = curSwp.trim();

    if (diskSizeRaw && diskSizeRaw !== "0") {
        const currentBytes = parseInt(diskSizeRaw);
        const currentMB = Math.floor(currentBytes / 1024 / 1024);
        const currentGB = (currentBytes / 1024 / 1024 / 1024).toFixed(2);
        const physicalGB = (totalPhysicalMB / 1024).toFixed(1);
        
        // Show human-readable size with GB/MB context
        zStats.innerText = `ACTIVE | ${currentGB} GB zRAM / ${physicalGB} GB Physical RAM`;
        zSizeS.value = currentMB;        updateSizeDisplay(currentMB);
    } else {
        // Default to 50% of physical RAM on first load (capped at 8GB)
        const defaultMB = Math.min(Math.floor(totalPhysicalMB * 0.5), 8192);
        zSizeS.value = defaultMB;
        updateSizeDisplay(defaultMB);
    }
    
    // Initial warning check
    checkZramWarning(zSizeS.value);
};

// Unified display handler (FIXED DUPLICATE)
zSizeS.oninput = function() {
    updateSizeDisplay(this.value);
    checkZramWarning(this.value);
};

function updateSizeDisplay(mb) {
    const gb = mb / 1024;
    // Show GB when >= 1GB for cleaner UX
    zSizeT.innerText = gb >= 1 ? `${gb.toFixed(1)} GB` : `${mb} MB`;
}

function checkZramWarning(mb) {
    zWarning.style.display = 'none';
    
    if (mb > totalPhysicalMB) {
        const excess = ((mb - totalPhysicalMB) / 1024).toFixed(1);
        zWarning.style.display = 'block';
        zWarning.innerHTML = `⚠️ zRAM (${mb/1024} GB) exceeds physical RAM (${totalPhysicalMB/1024} GB). May cause thrashing under heavy load.`;
    } else if (mb > totalPhysicalMB * 0.75 && mb > 8192) {
        zWarning.style.display = 'block';
        zWarning.innerHTML = `💡 Large zRAM allocation (${mb/1024} GB). Ensure sufficient free RAM for working set.`;
    }
}

zApply.onclick = async () => {
    const targetMB = parseInt(zSizeS.value);
    const targetSize = targetMB + "M"; // e.g., "20480M"
    const targetSwp = zSwapI.value; 
    const targetAlgo = document.getElementById('zram_algo_select').value;
    
    // Safety confirmation for >16GB
    if (targetMB > 16384 && !confirm(`⚠️ Creating ${targetMB/1024}GB zRAM may cause instability.\n\nPhysical RAM: ${totalPhysicalMB/1024}GB\nContinue?`)) {
        return;
    }
    
    status.innerText = "Applying & Saving...";
    zApply.style.opacity = "0.5";
    // V4 ENGINE + SAVE LOGIC (supports 20GB+)
    await exec(`
        # 1. APPLY SETTINGS (V4 Logic)
        ZDEV=$(grep "/zram" /proc/swaps | awk '{print $1}')
        [ -z "$ZDEV" ] && ZDEV="/dev/block/zram0"
        ZNAME=$(basename "$ZDEV")
        
        # Reset device
        swapoff "$ZDEV" 2>/dev/null
        echo 1 > "/sys/block/$ZNAME/reset"
        
        # Set compression algorithm
        echo "${targetAlgo}" > "/sys/block/$ZNAME/comp_algorithm"
        
        # SET DISKSIZE (supports up to 20GB+)
        echo "${targetSize}" > "/sys/block/$ZNAME/disksize"
        
        # Reinitialize swap
        mkswap "$ZDEV" > /dev/null 2>&1
        swapon -p 100 "$ZDEV" 2>/dev/null || swapon "$ZDEV"
        
        # Set swappiness
        echo ${targetSwp} > /proc/sys/vm/swappiness

        # 2. SAVE FOR REBOOT (Persistence)
        mkdir -p /data/adb/zram_config
        cat > /data/adb/zram_config/settings.conf <<EOF
SIZE=${targetSize}
ALGO=${targetAlgo}
SWAP=${targetSwp}
EOF
    `);

    zApply.style.opacity = "1";
    status.innerText = `Applied ${targetMB/1024}GB zRAM! Saved for reboot.`;
    setTimeout(refreshZramUI, 1000);
};

// Initialize UI
await refreshZramUI();

// --- ADD THIS TO FIX SLIDING ---
zSizeS.oninput = function() {
    zSizeT.innerText = this.value + " MB";
};

            // --- MONITORING LOOP ---
    setInterval(async () => {
        // System Performance Stats
        const rawTemp = await exec("cat /sys/class/power_supply/battery/temp", 1000);
        document.getElementById('mon_temp').innerText = (parseInt(rawTemp) / 10).toFixed(1) + "°C";
        
        const current = await exec("cat /sys/class/power_supply/battery/current_now", 1000);
        document.getElementById('mon_mA').innerText = Math.abs(parseInt(current) / 1000).toFixed(0) + "mA";

        // Live zRAM Update
            const zDev = await exec("grep '/zram' /proc/swaps | awk '{print $1}'", 1000);
            if (zDev.trim()) {
                const devName = zDev.trim().split('/').pop();
                const mmStat = await exec(`cat /sys/block/${devName}/mm_stat`, 1000);
                const dSize = await exec(`cat /sys/block/${devName}/disksize`, 1000);
                
                if (mmStat && mmStat !== "TIMEOUT") {
                    const p = mmStat.trim().split(/\s+/);
                    const used = (parseInt(p[1]) / 1024 / 1024).toFixed(2);
                    const total = (parseInt(dSize) / 1024 / 1024 / 1024).toFixed(2);
                    document.getElementById('zram_stats_text').innerText = `${used} MB used / ${total} GB total`;
                }
            }
        }, 3000);
                
    // GPU Section Initialization
    const gpuContent = document.getElementById('gpu-content');
    if (gpuContent) {
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                    if (gpuContent.classList.contains('expanded')) {
                        loadGpuSettings();
                    }
                }
            });
        });
        observer.observe(gpuContent, { attributes: true });
    }
    
    // GPU Slider Events
    const gpuSlider = document.getElementById('gpu-opp-slider');
    if (gpuSlider) {
        gpuSlider.addEventListener('input', (e) => {
            const sliderPosition = parseInt(e.target.value);
            const oppIndex = 32 - sliderPosition;
            updateGpuDisplay(oppIndex);
        });
    }
    
    const applyBtn = document.getElementById('apply-global-gpu-btn');
    if (applyBtn) {
        applyBtn.addEventListener('click', applyGlobalGpuSettings);
    }
    
    // ─── Per-App Cpusets During Gaming (Package-Only, Non-Freezing) ───
(function() {
    const container = document.getElementById('cpuset-apps-container');
    const loadingEl = document.getElementById('cpuset-loading');
    const statusEl = document.getElementById('cpuset-status');
    
    if (!container || !loadingEl || !statusEl) return;

    let cpusetRules = {};
    let allPackages = [];

    // Safe exec wrapper
    const safeExec = (cmd) => {
        return new Promise(resolve => {
            try {
                if (typeof exec === 'function') {
                    exec(cmd).then(resolve).catch(() => resolve(''));
                } else {
                    resolve('');
                }
            } catch (e) {
                resolve('');
            }
        });
    };

    // Save rules (used by both single and bulk changes)
    function saveCpusetRules() {
        return safeExec(`mkdir -p /sdcard/MTK_AI_Engine`)
            .then(() => {
                const json = JSON.stringify(cpusetRules).replace(/"/g, '\\"');
                return safeExec(`echo "${json}" > /sdcard/MTK_AI_Engine/gaming_cpuset_rules.json`);
            });
    }

    // Load saved rules
    safeExec(`cat /sdcard/MTK_AI_Engine/gaming_cpuset_rules.json 2>/dev/null`)
        .then(json => {
            try { 
                cpusetRules = JSON.parse(json.trim() || '{}'); 
            } catch (e) {
                cpusetRules = {};
            }
        })
        .then(() => safeExec('pm list packages -f'))
        .then(raw => {
            if (!raw || raw.trim() === '') throw new Error('pm returned empty');

            const lines = raw.trim().split('\n');
            for (let line of lines) {                const match = line.match(/=([^=]+)$/);
                if (match) {
                    allPackages.push(match[1]);
                }
            }

            if (allPackages.length === 0) throw new Error('No packages parsed');
            allPackages.sort();

            loadingEl.remove();
            renderInChunks(0);
        })
        .catch(err => {
            console.error('Cpuset init error:', err);
            loadingEl.textContent = '❌ Load failed';
            loadingEl.style.color = '#FF453A';
        });

    // Render in chunks to avoid UI freeze
    function renderInChunks(startIndex) {
        const batchSize = 50;
        const fragment = document.createDocumentFragment();

        const endIndex = Math.min(startIndex + batchSize, allPackages.length);
        for (let i = startIndex; i < endIndex; i++) {
            const pkg = allPackages[i];
            const current = cpusetRules[pkg] || 'none';

            const div = document.createElement('div');
            div.className = 'app-item';
            div.style.cssText = 'padding:14px; border-bottom:1px solid #eee; display:flex; align-items:center; justify-content:space-between;';
            div.innerHTML = `
                <div style="font-family: monospace; font-size:14px; color:#e0e0e0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                    ${pkg}
                </div>
                <select class="cpuset-select" data-pkg="${pkg}" style="font-size:12px; padding:4px 8px;">
                    <option value="none" ${current === 'none' ? 'selected' : ''}>— Disabled —</option>
                    <option value="background" ${current === 'background' ? 'selected' : ''}>Background </option>
                    <option value="system-background" ${current === 'system-background' ? 'selected' : ''}>Sys Background</option>
                    <option value="top-app" ${current === 'top-app' ? 'selected' : ''}>Top App (⚠️0-7 CPU)</option>
                </select>
            `;
            fragment.appendChild(div);
        }

        container.appendChild(fragment);

        // Attach change handler only to newly added selects
        const newSelects = container.querySelectorAll('.cpuset-select');
        for (let i = startIndex; i < endIndex && i < newSelects.length; i++) {            newSelects[i].onchange = function(e) {
                const pkg = e.target.dataset.pkg;
                const val = e.target.value;
                if (val === 'none') {
                    delete cpusetRules[pkg];
                } else {
                    cpusetRules[pkg] = val;
                }
                saveCpusetRules().then(() => {
                    statusEl.textContent = '✅ Updated';
                    setTimeout(() => {
                        if (statusEl.textContent === '✅ Updated') {
                            statusEl.textContent = 'Package-only • Saved to /sdcard';
                        }
                    }, 2000);
                }).catch(() => {
                    statusEl.textContent = '⚠️ Save failed';
                });
            };
        }

        // Continue next chunk?
        if (endIndex < allPackages.length) {
            setTimeout(() => renderInChunks(endIndex), 0);
        } else {
            setupButtons();
        }
    }

    // Non-freezing bulk operations
    function setupButtons() {
        document.getElementById('cpuset-all-bg')?.addEventListener('click', () => {
            const selects = document.querySelectorAll('.cpuset-select');
            statusEl.textContent = `🔄 Applying to ${selects.length} apps...`;
            selects.forEach(sel => {
                const pkg = sel.dataset.pkg;
                cpusetRules[pkg] = 'background';
                sel.value = 'background';
            });
            saveCpusetRules().then(() => {
                statusEl.textContent = '✅ All → Background';
                setTimeout(() => {
                    if (statusEl.textContent === '✅ All → Background') {
                        statusEl.textContent = 'Package-only • Saved to /sdcard';
                    }
                }, 2000);
            }).catch(() => {
                statusEl.textContent = '⚠️ Bulk save failed';
            });
        });
        document.getElementById('cpuset-all-helpers')?.addEventListener('click', () => {
            const selects = document.querySelectorAll('.cpuset-select');
            statusEl.textContent = `🔄 Applying to ${selects.length} apps...`;
            selects.forEach(sel => {
                const pkg = sel.dataset.pkg;
                cpusetRules[pkg] = 'top-app';
                sel.value = 'top-app';
            });
            saveCpusetRules().then(() => {
                statusEl.textContent = '✅ All → Top App';
                setTimeout(() => {
                    if (statusEl.textContent === '✅ All → Top App') {
                        statusEl.textContent = 'Package-only • Saved to /sdcard';
                    }
                }, 2000);
            }).catch(() => {
                statusEl.textContent = '⚠️ Bulk save failed';
            });
        });

        document.getElementById('cpuset-clear')?.addEventListener('click', () => {
            const selects = document.querySelectorAll('.cpuset-select');
            statusEl.textContent = `🧹 Clearing all...`;
            cpusetRules = {};
            selects.forEach(sel => sel.value = 'none');
            saveCpusetRules().then(() => {
                statusEl.textContent = '🧹 All rules cleared';
                setTimeout(() => {
                    if (statusEl.textContent === '🧹 All rules cleared') {
                        statusEl.textContent = 'Package-only • Saved to /sdcard';
                    }
                }, 2000);
            }).catch(() => {
                statusEl.textContent = '⚠️ Clear save failed';
            });
        });
    }
})();

// Initialize whitelist at the end of your init() function
initWhitelist();

// No special initialization needed - buttons work immediately
// The functions are ready to use as soon as the page loads

// Devfreq Governor Section Observer
const devfreqContent = document.getElementById('devfreq-governor-content');
if (devfreqContent) {
    const devfreqObserver = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                if (devfreqContent.classList.contains('expanded')) {
                    loadDevfreqGovernors();
                }
            }
        });
    });
    devfreqObserver.observe(devfreqContent, { attributes: true });
}

// Apply Button Event
const applyDevfreqBtn = document.getElementById('apply-devfreq-btn');
if (applyDevfreqBtn) {
    applyDevfreqBtn.addEventListener('click', applyDevfreqGovernors);
}

// Check MTK services status when page loads
document.addEventListener('DOMContentLoaded', function() {
    setTimeout(() => {
        checkMTKServicesStatus();
    }, 1000);
});

// Start initialization
initializePPMPolicies();

} // End of init function

async function toggleDetect() {
  const s = document.getElementById('detection-status');
  if (!s) return;
  
  console.log("Toggling detection...");
  
  if (s.textContent === 'Logcat') {
    s.textContent = 'Dumpsys';
    const res = await exec(`mkdir -p /sdcard/MTK_AI_Engine/config && touch /sdcard/MTK_AI_Engine/config/enable_dumpsys && rm -f /sdcard/MTK_AI_Engine/config/enable_logcat && ls -la /sdcard/MTK_AI_Engine/config/`);
    console.log("Switch to Dumpsys result:", res);
  } else {
    s.textContent = 'Logcat';
    const res = await exec(`mkdir -p /sdcard/MTK_AI_Engine/config && touch /sdcard/MTK_AI_Engine/config/enable_logcat && rm -f /sdcard/MTK_AI_Engine/config/enable_dumpsys && ls -la /sdcard/MTK_AI_Engine/config/`);
    console.log("Switch to Logcat result:", res);
  }
}

                              // PPM Policy Control - WITH SDCARD SAVE/LOAD
let ppmPolicyStates = {};

// Save current PPM states to SDCard
async function savePPMToSDCard() {
    let config = "# MTK AI Engine - PPM Policy Configuration\n";
    config += "# Auto-saved from current kernel state\n\n";
    
    for (let i = 0; i <= 9; i++) {
        const state = ppmPolicyStates[i] ? 1 : 0;
        // Use same format as your shell script comments
        const policyNames = [
            "PPM_POLICY_PTPOD", "PPM_POLICY_UT", "PPM_POLICY_FORCE_LIMIT",
            "PPM_POLICY_PWR_THRO", "PPM_POLICY_THERMAL", "PPM_POLICY_DLPT",
            "PPM_POLICY_HARD_USER_LIMIT", "PPM_POLICY_USER_LIMIT",
            "PPM_POLICY_LCM_OFF", "PPM_POLICY_SYS_BOOST"
        ];
        config += `policies[${i}]=${state}  # ${policyNames[i]}\n`;
    }
    
    try {
        await exec(`
            su -c 'mkdir -p /sdcard/MTK_AI_Engine && echo "${config}" > /sdcard/MTK_AI_Engine/ppm_config.conf'
        `);
        console.log("PPM settings saved to SDCard");
    } catch (error) {
        console.error("Failed to save PPM to SDCard:", error);
    }
}

// Load PPM settings from SDCard
async function loadPPMFromSDCard() {
    try {
        const result = await exec(`
            su -c 'cat /sdcard/MTK_AI_Engine/ppm_config.conf 2>/dev/null'
        `);
        
        if (result.trim()) {
            const lines = result.split('\n');
            for (const line of lines) {
                const match = line.match(/policies\[(\d+)\]=(\d+)/);
                if (match) {
                    const index = parseInt(match[1]);
                    const state = parseInt(match[2]) === 1;
                    if (index >= 0 && index <= 9) {
                        ppmPolicyStates[index] = state;
                    }
                }
            }
            return true;
        }
    } catch (error) {
        // Config file doesn't exist yet
    }
    return false;
}

// Load current PPM status from kernel
async function loadPPMPolicyStates() {
    try {
        const result = await exec(`
            su -c 'cat /proc/ppm/policy_status 2>/dev/null || echo "NOT_FOUND"'
        `);
        
        if (result.trim() === "NOT_FOUND") {
            updateStatus("⚠️ PPM not available", "#FF9F0A", "PPM subsystem not found");
            return;
        }
        
        // Parse current kernel state
        let detailedStatus = "";
        let thermalDisabled = true;
        let policies = {};
        
        const policyRegex = /\[(\d+)\]\s+PPM_POLICY_([A-Z_]+):\s+(\w+)/g;
        let match;
        
        while ((match = policyRegex.exec(result)) !== null) {
            const index = parseInt(match[1]);
            const state = match[3].toLowerCase() === 'enabled';
            
            if (!isNaN(index) && index >= 0 && index <= 9) {
                policies[index] = state;
                if (index === 4 && state) thermalDisabled = false;
                
                const statusText = state ? "✅ ENABLED" : "❌ DISABLED";
                detailedStatus += `${match[2]}: ${statusText}\n`;
            }
        }
        
        // Update local states with current kernel values
        for (let i = 0; i <= 9; i++) {
            ppmPolicyStates[i] = policies[i] !== undefined ? policies[i] : false;
        }
        
        // Save current kernel state to SDCard
        savePPMToSDCard();
        
        // Update UI
        updatePolicyUI(policies, thermalDisabled);
        document.getElementById('ppm-detailed-status').textContent = detailedStatus.trim();
        
        // Update summary
        const statusElement = document.getElementById('ppm-current-status');
        if (thermalDisabled) {
            statusElement.textContent = "🔥 THERMAL DISABLED";
            statusElement.style.color = "#FF453A";
        } else {
            statusElement.textContent = "✅ THERMAL ACTIVE";
            statusElement.style.color = "#32D74B";
        }
        
    } catch (error) {
        console.error('Load PPM error:', error);
        updateStatus("❌ LOAD FAILED", "#FF453A", "Error loading PPM status");
    }
}

// Toggle PPM policy and save to SDCard
async function togglePPMPolicy(policyIndex, enabled) {
    try {
        const status = enabled ? 1 : 0;
        
        // Apply to kernel (exactly like your shell script)
        await exec(`
            su -c 'echo "${policyIndex} ${status}" > /proc/ppm/policy_status'
        `);
        
        // Update local state
        ppmPolicyStates[policyIndex] = enabled;
        
        // Save to SDCard
        savePPMToSDCard();
        
        // Reload to verify
        setTimeout(() => {
            loadPPMPolicyStates();
        }, 300);
        
    } catch (error) {
        console.error('PPM toggle error:', error);
        alert("Failed to toggle policy");
        setTimeout(() => {
            loadPPMPolicyStates();
        }, 300);
    }
}

// Apply your exact shell script configuration
async function applyShellScriptConfig() {
    try {
        // EXACTLY your shell script logic
        await exec(`
            su -c '
                echo "0 0" > /proc/ppm/policy_status
                echo "1 0" > /proc/ppm/policy_status  
                echo "2 0" > /proc/ppm/policy_status
                echo "3 0" > /proc/ppm/policy_status
                echo "4 0" > /proc/ppm/policy_status
                echo "5 0" > /proc/ppm/policy_status
                echo "6 0" > /proc/ppm/policy_status
                echo "7 0" > /proc/ppm/policy_status
                echo "8 0" > /proc/ppm/policy_status
                echo "9 1" > /proc/ppm/policy_status
            '
        `);
        
        // Update states to match shell script
        for (let i = 0; i <= 8; i++) ppmPolicyStates[i] = false;
        ppmPolicyStates[9] = true;
        
        // Save to SDCard
        savePPMToSDCard();
        
        setTimeout(() => {
            loadPPMPolicyStates();
        }, 500);
        
    } catch (error) {
        console.error('Shell config error:', error);
        alert("Failed to apply shell script config");
    }
}

// Update status elements
function updateStatus(currentStatus, color, detailedStatus) {
    const currentEl = document.getElementById('ppm-current-status');
    const detailedEl = document.getElementById('ppm-detailed-status');
    
    if (currentEl) {
        currentEl.textContent = currentStatus;
        currentEl.style.color = color;
    }
    if (detailedEl) {
        detailedEl.textContent = detailedStatus;
    }
}

// Update UI with policy toggles
function updatePolicyUI(policies, thermalDisabled) {
    const container = document.getElementById('ppm-policies-container');
    if (!container) return;
    
    container.innerHTML = '';
    
    const policyNames = {
        0: "PPM_POLICY_PTPOD", 1: "PPM_POLICY_UT", 2: "PPM_POLICY_FORCE_LIMIT",
        3: "PPM_POLICY_PWR_THRO", 4: "🔥 PPM_POLICY_THERMAL", 5: "PPM_POLICY_DLPT",
        6: "PPM_POLICY_HARD_USER_LIMIT", 7: "PPM_POLICY_USER_LIMIT",
        8: "PPM_POLICY_LCM_OFF", 9: "✅ PPM_POLICY_SYS_BOOST"
    };
    
    for (let i = 0; i <= 9; i++) {
        const state = policies[i] !== undefined ? policies[i] : false;
        const name = policyNames[i] || `PPM_POLICY_${i}`;
        
        const policyItem = document.createElement('div');
        policyItem.className = 'list-item';
        policyItem.id = `ppm-policy-${i}`;
        
        policyItem.innerHTML = `
            <div class="item-content">
                <span class="item-title">${name}</span>
                <span class="item-desc">Policy Index: ${i}</span>
            </div>
            <label class="ios-switch">
                <input type="checkbox" ${state ? 'checked' : ''} onchange="togglePPMPolicy(${i}, this.checked)">
                <span class="slider"></span>
            </label>
        `;
        
        container.appendChild(policyItem);
    }
}

// Initialize
function initializePPMPolicies() {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializePPMPolicies);
        return;
    }
    
    const ppmContent = document.getElementById('ppm-policy-content');
    if (!ppmContent) return;
    
    // Add Apply Config button
    const header = ppmContent.querySelector('.section-header');
    if (header) {
        const applyBtn = document.createElement('div');
        applyBtn.style.cssText = 'margin: 10px 16px; padding: 10px; background: var(--color-red); color: white; border-radius: 8px; text-align: center; font-weight: bold; cursor: pointer; font-size: 14px;';
        applyBtn.textContent = '🔥 Apply Shell Script Config';
        applyBtn.onclick = applyShellScriptConfig;
        header.parentNode.insertBefore(applyBtn, ppmContent.querySelector('.section-content'));
    }
    
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                if (ppmContent.classList.contains('expanded')) {
                    setTimeout(loadPPMPolicyStates, 300);
                }
            }
        });
    });
    
    observer.observe(ppmContent, { attributes: true });
}

initializePPMPolicies();

// Service state tracking
let mtkServicesEnabled = true;

// Toggle MTK AI services (disable/enable)
async function toggleMTKServices() {
    try {
        const servicesStatus = document.getElementById('mon_services');
        const statusDot = document.getElementById('services-status-dot');
        
        if (mtkServicesEnabled) {
            // DISABLE services
            await exec(`
                pkill -f "MTK_AI.*logcat" 2>/dev/null
                pkill -f "touch2" 2>/dev/null  
                pkill -f "dumpsys2" 2>/dev/null  
                pkill -f "script_runner.*global" 2>/dev/null
                pkill -f "service.sh" 2>/dev/null
                killall service.sh logcat global dumpsys2 touch2 2>/dev/null
            `);
            
            mtkServicesEnabled = false;
            
            if (servicesStatus) {
                servicesStatus.textContent = "OFF";
                servicesStatus.style.color = "#FF453A";
            }
            if (statusDot) {
                statusDot.style.background = "#FF453A";
                statusDot.style.display = "block";
            }
            
            updateStatusMsg("⏹️ MTK AI services disabled", "#FF453A");
            
        } else {
            // ENABLE services
            await exec(`
                MODDIR="/data/adb/modules/MTK_AI"
                SERVICE_SCRIPT="$MODDIR/service.sh"
                su -c "sh '$SERVICE_SCRIPT' &" 2>/dev/null
            `);
            
            mtkServicesEnabled = true;
            
            if (servicesStatus) {
                servicesStatus.textContent = "ON";
                servicesStatus.style.color = "#32D74B";
            }
            if (statusDot) {
                statusDot.style.background = "#32D74B";
                statusDot.style.display = "block";
            }
                        updateStatusMsg("▶️ MTK AI services enabled", "#32D74B");
        }
        
        // Hide dot after 2 seconds
        setTimeout(() => {
            if (statusDot) statusDot.style.display = "none";
        }, 2000);
        
    } catch (error) {
        updateStatusMsg("❌ Service toggle failed", "#FF453A");
        console.error('Service toggle error:', error);
    }
}

// Optional: Check current service status on page load
async function checkMTKServicesStatus() {
    try {
        const result = await exec(`
            if pgrep -f "service.sh" > /dev/null 2>&1; then
                echo "running"
            else
                echo "stopped"
            fi
        `);
        
        mtkServicesEnabled = result.trim() === "running";
        
        const servicesStatus = document.getElementById('mon_services');
        const statusDot = document.getElementById('services-status-dot');
        
        if (mtkServicesEnabled) {
            if (servicesStatus) {
                servicesStatus.textContent = "ON";
                servicesStatus.style.color = "#32D74B";
            }
            if (statusDot) {
                statusDot.style.background = "#32D74B";
                statusDot.style.display = "block";
            }
        } else {
            if (servicesStatus) {
                servicesStatus.textContent = "OFF";
                servicesStatus.style.color = "#FF453A";
            }
            if (statusDot) {
                statusDot.style.background = "#FF453A";
                statusDot.style.display = "block";
            }
        }
                // Hide dot after 1 second
        setTimeout(() => {
            if (statusDot) statusDot.style.display = "none";
        }, 1000);
        
    } catch (error) {
        console.error('Failed to check service status:', error);
    }
}

// Devfreq Governor Management
let devfreqDevices = [];
let selectedGovernor = "";
let currentGovernors = new Map();

// Load devfreq devices and governors
async function loadDevfreqGovernors() {
    const container = document.getElementById('devfreq-governor-container');
    if (!container) return;
    
    try {
        container.innerHTML = '<div style="padding:20px; text-align:center;">Loading governors...</div>';
        
        // Find all devfreq devices (GPU, etc.)
        const devfreqPaths = await exec(`
            ls /sys/class/devfreq/ 2>/dev/null | while read dev; do
                if [ -f "/sys/class/devfreq/$dev/governor" ]; then
                    echo "$dev"
                fi
            done
        `);
        
        devfreqDevices = devfreqPaths.trim().split('\n').filter(dev => dev.trim());
        
        if (devfreqDevices.length === 0) {
            // Try common GPU paths as fallback
            const commonPaths = ["soc:qcom,gpu", "mali", "kgsl-3d0", "gpu"];
            let found = false;
            
            for (const dev of commonPaths) {
                try {
                    const result = await exec(`ls /sys/class/devfreq/ 2>/dev/null | grep "${dev}"`);
                    if (result.trim()) {
                        devfreqDevices.push(dev);
                        found = true;
                    }
                } catch (e) {
                    // Continue to next
                }
            }
            
            if (!found) {
                container.innerHTML = '<div style="padding:20px; text-align:center; color: #FF9F0A;">No devfreq devices found<br><small>Common paths: /sys/class/devfreq/</small></div>';
                return;
            }
        }
        
        // Load available governors and current state for each device
        await loadDevfreqDetails();
        updateDevfreqDisplay();        
    } catch (error) {
        console.error('Devfreq error:', error);
        container.innerHTML = '<div style="padding:20px; text-align:center; color: #FF453A;">Failed to load devfreq governors</div>';
    }
}

// Load details for each devfreq device
async function loadDevfreqDetails() {
    currentGovernors.clear();
    
    for (const dev of devfreqDevices) {
        try {
            // Get current governor
            const currentGov = await exec(`cat /sys/class/devfreq/${dev}/governor 2>/dev/null`);
            currentGovernors.set(dev, currentGov.trim());
            
            // Get available governors
            const availableGovs = await exec(`cat /sys/class/devfreq/${dev}/available_governors 2>/dev/null`);
            const governors = availableGovs.trim().split(/\s+/).filter(g => g.trim());
            
            // Store governors with device
            devfreqDevices[devfreqDevices.indexOf(dev)] = {
                name: dev,
                current: currentGov.trim(),
                available: governors
            };
            
        } catch (error) {
            console.error(`Failed to load ${dev}:`, error);
            // Keep as string if loading fails
        }
    }
}

// Update devfreq display
function updateDevfreqDisplay() {
    const container = document.getElementById('devfreq-governor-container');
    if (!container) return;
    
    let html = '';
    
    devfreqDevices.forEach(dev => {
        if (typeof dev === 'object') {
            const current = dev.current || 'unknown';
            const available = dev.available || [];
            
            html += `
                <div class="list-item">
                    <div class="item-content">                        <span class="item-title">${dev.name}</span>
                        <span class="item-desc">Current: ${current}</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <select id="gov-select-${dev.name}" onchange="setSelectedGovernor('${dev.name}', this.value)" style="padding: 4px 8px; border-radius: 6px; border: 1px solid var(--border-color); background: var(--bg-color); color: var(--text-color);">
                            ${available.map(gov => 
                                `<option value="${gov}" ${gov === current ? 'selected' : ''}>${gov}</option>`
                            ).join('')}
                        </select>
                    </div>
                </div>
            `;
        } else {
            // Fallback for string devices
            html += `
                <div class="list-item">
                    <div class="item-content">
                        <span class="item-title">${dev}</span>
                        <span class="item-desc">Click to configure</span>
                    </div>
                    <div onclick="configureDevfreqDevice('${dev}')" style="width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; cursor: pointer; background: var(--color-blue); border-radius: 20px;">
                        <span style="color: white; font-size: 20px;">⚙️</span>
                    </div>
                </div>
            `;
        }
    });
    
    container.innerHTML = html;
}

// Set selected governor for device
function setSelectedGovernor(device, governor) {
    currentGovernors.set(device, governor);
}

// Configure devfreq device (fallback method)
async function configureDevfreqDevice(device) {
    try {
        // Get available governors
        const availableGovs = await exec(`cat /sys/class/devfreq/${device}/available_governors 2>/dev/null`);
        const governors = availableGovs.trim().split(/\s+/).filter(g => g.trim());
        
        if (governors.length === 0) {
            updateStatusMsg('No governors available', "#FF453A");
            return;
        }
        
        // Show selection dialog (simplified - just use first高性能 option)
        const performanceGov = governors.find(g => g.includes('performance')) || governors[0];        
        // Apply immediately
        await applyDevfreqGovernor(device, performanceGov);
        
    } catch (error) {
        updateStatusMsg('Failed to configure device', "#FF453A");
    }
}

// Apply selected governors AND save to sdcard
async function applyDevfreqGovernors() {
    try {
        let appliedCount = 0;
        
        devfreqDevices.forEach(dev => {
            if (typeof dev === 'object') {
                const selectedGov = currentGovernors.get(dev.name);
                if (selectedGov && selectedGov !== dev.current) {
                    applyDevfreqGovernor(dev.name, selectedGov);
                    appliedCount++;
                }
            }
        });
        
        if (appliedCount > 0) {
            updateStatusMsg(`✅ Applied ${appliedCount} governor changes`, "#32D74B");
            // Save settings to sdcard
            saveDevfreqSettings();
        } else {
            updateStatusMsg('ℹ️ No changes to apply', "#636366");
        }
        
    } catch (error) {
        updateStatusMsg('❌ Failed to apply governors', "#FF453A");
    }
}

// Apply governor to specific device
async function applyDevfreqGovernor(device, governor) {
    try {
        await exec(`echo "${governor}" > /sys/class/devfreq/${device}/governor 2>/dev/null`);
        console.log(`Applied ${governor} to ${device}`);
    } catch (error) {
        console.error(`Failed to apply ${governor} to ${device}:`, error);
    }
}

// Save devfreq settings with safe format
async function saveDevfreqSettings() {
    let config = "# MTK AI Engine - Devfreq Configuration\n";
    config += "# Auto-generated by WebUI\n\n";
    
    devfreqDevices.forEach(dev => {
        if (typeof dev === 'object') {
            const selectedGov = currentGovernors.get(dev.name);
            if (selectedGov) {
                // Use simple device=governor format (no variable names)
                config += `"${dev.name}"="${selectedGov}"\n`;
            }
        }
    });
    
    try {
        await exec(`echo '${config}' > /sdcard/MTK_AI_Engine/devfreq_config.conf`);
        updateStatusMsg("✅ Devfreq settings saved!", "#32D74B");
    } catch (error) {
        updateStatusMsg("❌ Failed to save settings", "#FF453A");
    }
}

// Load devfreq settings from sdcard
async function loadDevfreqSettings() {
    try {
        const config = await exec(`cat /sdcard/MTK_AI_Engine/devfreq_config.conf 2>/dev/null`);
        if (config.trim()) {
            // Parse config and apply settings
            const lines = config.split('\n');
            lines.forEach(line => {
                // Skip comments and empty lines
                if (line.startsWith('#') || line.trim() === '') {
                    return;
                }
                
                // Parse "device"="governor" format
                const match = line.match(/"([^"]+)"="([^"]+)"/);
                if (match) {
                    const device = match[1];
                    const governor = match[2];
                    currentGovernors.set(device, governor);
                }
            });
            updateStatusMsg("✅ Devfreq settings loaded from sdcard!", "#32D74B");
        }
    } catch (error) {
        // Config file doesn't exist yet - that's OK
    }
}

// 1-Click Thermal Services Control

// Start ALL thermal services using your exact method
async function startAllThermalServices() {
    try {
        updateThermalStatus("Starting all thermal services...");
        
        // YOUR EXACT START METHOD
        const result = await exec(`
            list_thermal_services() {
                for rc in \$(find /system/etc/init /vendor/etc/init /odm/etc/init -type f 2>/dev/null); do
                    grep -r "^service" "\$rc" 2>/dev/null | awk '{print \$2}'
                done | grep thermal | sort -u
            }
            
            for svc in \$(list_thermal_services); do
                echo "Starting \$svc"
                start "\$svc" >/dev/null 2>&1
            done
            
            echo "✅ All thermal services started"
        `);
        
        updateThermalStatus("✅ All thermal services started!");
        updateStatusMsg("Started all thermal services", "#32D74B");
        
    } catch (error) {
        updateThermalStatus("❌ Failed to start thermal services");
        updateStatusMsg("Start failed", "#FF453A");
        console.error('Start all error:', error);
    }
}

// Stop ALL thermal services using your exact method
async function stopAllThermalServices() {
    try {
        updateThermalStatus("Stopping all thermal services...");
        
        // YOUR EXACT STOP METHOD
        const result = await exec(`
            list_thermal_services() {
                for rc in \$(find /system/etc/init /vendor/etc/init /odm/etc/init -type f 2>/dev/null); do
                    grep -r "^service" "\$rc" 2>/dev/null | awk '{print \$2}'
                done | grep thermal | sort -u
            }
            
            for svc in \$(list_thermal_services); do
                echo "Stopping \$svc"
                start "\$svc" >/dev/null 2>&1
                stop "\$svc" >/dev/null 2>&1
            done
            
            echo "✅ All thermal services stopped"
        `);
        
        updateThermalStatus("✅ All thermal services stopped!");
        updateStatusMsg("Stopped all thermal services", "#FF453A");
        
    } catch (error) {
        updateThermalStatus("❌ Failed to stop thermal services");
        updateStatusMsg("Stop failed", "#FF453A");
        console.error('Stop all error:', error);
    }
}

// Update status display
function updateThermalStatus(message) {
    const statusContainer = document.getElementById('thermal-status-container');
    if (statusContainer) {
        statusContainer.textContent = message;
        // Add color based on message
        if (message.includes("✅")) {
            statusContainer.style.color = "#32D74B";
        } else if (message.includes("❌")) {
            statusContainer.style.color = "#FF453A";
        } else {
            statusContainer.style.color = "#666";
        }
    }
}

// Skip Apps Whitelist Management
const WHITELIST_FILE = "/sdcard/MTK_AI_Engine/whitelist.txt";
const GAMELIST_FILE = "/sdcard/MTK_AI_Engine/game_list.txt";
let skipWhitelist = new Set();
let gameList = new Set();

// Synchronize lists: remove from whitelist if in gamelist, add to whitelist if not in gamelist
async function syncLists() {
    try {
        // Load current lists
        const gameListContent = await exec(`cat ${GAMELIST_FILE} 2>/dev/null`);
        const currentGameList = new Set(gameListContent.trim().split('\n').filter(pkg => pkg.trim()));
        
        const whitelistContent = await exec(`cat ${WHITELIST_FILE} 2>/dev/null`);
        const currentWhitelist = new Set(whitelistContent.trim().split('\n').filter(pkg => pkg.trim()));
        
        // Get all user apps
        const appList = await exec(`pm list packages -3 | cut -d: -f2 | sort`);
        const allUserApps = appList.trim().split('\n').filter(pkg => pkg.trim());
        
        // Find changes needed
        const appsToRemoveFromWhitelist = [];
        const appsToAddToWhitelist = [];
        
        // Check each user app
        allUserApps.forEach(pkg => {
            const inGameList = currentGameList.has(pkg);
            const inWhitelist = currentWhitelist.has(pkg);
            
            if (inGameList && inWhitelist) {
                // Remove from whitelist (shouldn't be in both)
                appsToRemoveFromWhitelist.push(pkg);
            } else if (!inGameList && !inWhitelist) {
                // Add to whitelist (not in gamelist, should be skipped)
                appsToAddToWhitelist.push(pkg);
            }
        });
        
        // Apply changes
        let changesMade = false;
        
        // Remove from whitelist
        if (appsToRemoveFromWhitelist.length > 0) {
            let currentWhitelistContent = whitelistContent.trim();
            appsToRemoveFromWhitelist.forEach(pkg => {
                currentWhitelistContent = currentWhitelistContent.split('\n').filter(line => line.trim() !== pkg).join('\n');
            });
            await exec(`mkdir -p /sdcard/MTK_AI_Engine && echo "${currentWhitelistContent}" > ${WHITELIST_FILE}`);
            appsToRemoveFromWhitelist.forEach(pkg => currentWhitelist.delete(pkg));
            changesMade = true;        }
        
        // Add to whitelist
        if (appsToAddToWhitelist.length > 0) {
            const appsString = appsToAddToWhitelist.join('\n');
            if (appsString.trim()) {
                await exec(`mkdir -p /sdcard/MTK_AI_Engine && echo "${appsString}" >> ${WHITELIST_FILE}`);
                appsToAddToWhitelist.forEach(pkg => currentWhitelist.add(pkg));
                changesMade = true;
            }
        }
        
        // Update global sets
        gameList = currentGameList;
        skipWhitelist = currentWhitelist;
        
        if (changesMade) {
            const totalChanges = appsToRemoveFromWhitelist.length + appsToAddToWhitelist.length;
            updateStatusMsg(`Synced lists: ${totalChanges} changes made`, "#32D74B");
        }
        
        return true;
        
    } catch (error) {
        console.error('List sync error:', error);
        return false;
    }
}

// Load lists and sync (NON-FREEZING)
async function initializeAutoWhitelist() {
    try {
        // Perform bidirectional sync
        await syncLists();
        
        // Update displays
        updateSkipWhitelistDisplay();
        loadUserApps();
        
    } catch (error) {
        console.error('Auto-whitelist error:', error);
        // Load displays anyway
        updateSkipWhitelistDisplay();
        loadUserApps();
    }
}

// Update skip whitelist display
function updateSkipWhitelistDisplay() {
    const container = document.getElementById('skip-whitelist-container');    if (!container) return;
    
    if (skipWhitelist.size === 0) {
        container.innerHTML = '<div style="padding:20px; text-align:center;">No apps in skip list</div>';
        return;
    }
    
    let html = '';
    skipWhitelist.forEach(pkg => {
        html += `
            <div class="list-item">
                <div class="item-content">
                    <span class="item-title">${pkg}</span>
                    <span class="item-desc">Skipped from all modes</span>
                </div>
                <div onclick="removeFromSkipWhitelist('${pkg}')" style="width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; cursor: pointer;">
                    <span style="color: #FF453A; font-size: 20px;">✕</span>
                </div>
            </div>
        `;
    });
    container.innerHTML = html;
}

// Remove app from skip whitelist
async function removeFromSkipWhitelist(pkg) {
    if (!skipWhitelist.has(pkg)) return;
    
    // Remove from file
    await exec(`grep -v "^${pkg}$" ${WHITELIST_FILE} > ${WHITELIST_FILE}.tmp 2>/dev/null && mv ${WHITELIST_FILE}.tmp ${WHITELIST_FILE} || rm -f ${WHITELIST_FILE}.tmp`);
    
    // Update set
    skipWhitelist.delete(pkg);
    
    // Update display
    updateSkipWhitelistDisplay();
    updateStatusMsg(`${pkg} removed from skip list`, "#32D74B");
}

// Load user apps for display
async function loadUserApps() {
    const container = document.getElementById('user-apps-container');
    if (!container) return;
    
    try {
        const appList = await exec(`pm list packages -3 | cut -d: -f2 | sort`);
        const packages = appList.trim().split('\n').filter(pkg => pkg.trim());
        
        let html = '';
        packages.forEach(pkg => {            const isWhitelisted = skipWhitelist.has(pkg);
            const isInGameList = gameList.has(pkg);
            let statusText, statusColor;
            
            if (isInGameList) {
                statusText = '🎮 In Game List';
                statusColor = '#32D74B';
            } else if (isWhitelisted) {
                statusText = '✅ In Skip List';
                statusColor = '#FF9F0A';
            } else {
                statusText = 'Add to Skip List';
                statusColor = '#636366';
            }
            
            html += `
                <div class="list-item" onclick="toggleSkipWhitelist('${pkg}')">
                    <div class="item-content">
                        <span class="item-title">${pkg}</span>
                        <span class="item-desc" style="color: ${statusColor};">${statusText}</span>
                    </div>
                    ${isWhitelisted ? 
                        '<div style="width: 40px; height: 40px; display: flex; align-items: center; justify-content: center;"><span style="color: #FF9F0A; font-size: 20px;">✓</span></div>' : 
                        (isInGameList ? 
                            '<div style="width: 40px; height: 40px; display: flex; align-items: center; justify-content: center;"><span style="color: #32D74B; font-size: 20px;">🎮</span></div>' : 
                            ''
                        )
                    }
                </div>
            `;
        });
        
        container.innerHTML = html;
        
    } catch (error) {
        container.innerHTML = '<div style="padding:20px; text-align:center; color: #FF453A;">Failed to load apps</div>';
        console.error('App list error:', error);
    }
}

// Toggle app in skip whitelist
async function toggleSkipWhitelist(pkg) {
    if (skipWhitelist.has(pkg)) {
        // Remove from whitelist
        await removeFromSkipWhitelist(pkg);
    } else {
        // Add to whitelist (only if not in gamelist)
        if (gameList.has(pkg)) {
            updateStatusMsg(`${pkg} is in gamelist, cannot add to skip list`, "#FF453A");
            return;        }
        
        // Add to whitelist
        skipWhitelist.add(pkg);
        await exec(`mkdir -p /sdcard/MTK_AI_Engine && echo "${pkg}" >> ${WHITELIST_FILE}`);
        updateSkipWhitelistDisplay();
        updateStatusMsg(`${pkg} added to skip list`, "#FF9F0A");
    }
}

// Initialize with collapsible sections
function initWhitelist() {
    // Start auto-whitelist with bidirectional sync immediately
    initializeAutoWhitelist();
    
    // Skip Whitelist Section Observer
    const skipWhitelistContent = document.getElementById('skip-whitelist-content');
    if (skipWhitelistContent) {
        const skipObserver = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                    if (skipWhitelistContent.classList.contains('expanded')) {
                        updateSkipWhitelistDisplay();
                    }
                }
            });
        });
        skipObserver.observe(skipWhitelistContent, { attributes: true });
    }
    
    // User Apps Section Observer
    const userAppsContent = document.getElementById('user-apps-content');
    if (userAppsContent) {
        const appsObserver = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                    if (userAppsContent.classList.contains('expanded')) {
                        loadUserApps();
                    }
                }
            });
        });
        appsObserver.observe(userAppsContent, { attributes: true });
    }
}

// GPU Functions 
let gpuFrequencyMap = null;

async function loadGpuSettings() {
    try {
        await buildGpuFrequencyMap();
        
        let oppIndex = 0;
        let source = 'kernel';

        try {
            // 🔹 PRIORITY 1: Load from your saved config on sdcard
            const savedContent = await exec(`cat /sdcard/MTK_AI_Engine/global_gpu_opp_index.txt 2>/dev/null`);
            if (savedContent.trim() !== '') {
                oppIndex = parseInt(savedContent.trim());
                source = 'sdcard';
            }
        } catch (e) {
            // File not found or unreadable → fall back to kernel
        }

        // 🔹 PRIORITY 2: If no saved config, read current kernel state
        if (source === 'kernel') {
            try {
                const kernelOpp = await exec(`cat /proc/gpufreqv2/fix_target_opp_index 2>/dev/null`);
                oppIndex = parseInt(kernelOpp.trim()) || 0;
            } catch (e) {
                oppIndex = 0; // default
            }
        }

        // Update UI
        const sliderPosition = 32 - oppIndex;
        const slider = document.getElementById('gpu-opp-slider');
        if (slider) {
            slider.value = Math.max(0, Math.min(32, sliderPosition));
            updateGpuDisplay(oppIndex);
            updateFrequencyLabels();
        }

        console.log(`GPU settings loaded from ${source}: OPP index = ${oppIndex}`);
        
    } catch (error) {
        console.error('GPU Load Error:', error);
    }
}

// Build frequency map from your actual gpufreq_status
async function buildGpuFrequencyMap() {
    try {
        const status = await exec(`cat /proc/gpufreqv2/gpufreq_status 2>/dev/null`);
        const lines = status.trim().split('\n');
        const freqMap = {};
        
        for (const line of lines) {
            if (line.includes('[GPU-OPP]')) {
                const indexMatch = line.match(/Index:\s*(\d+)/);
                const freqMatch = line.match(/Freq:\s*(\d+)/);
                
                if (indexMatch && freqMatch) {
                    const oppIndex = parseInt(indexMatch[1]);
                    const freqMhz = Math.round(parseInt(freqMatch[1]) / 1000);
                    freqMap[oppIndex] = freqMhz;
                }
            }
        }
        
        if (Object.keys(freqMap).length > 0) {
            gpuFrequencyMap = freqMap;
        } else {
            throw new Error('No valid frequency data found');
        }
    } catch (e) {
        console.warn('Using your actual GPU frequencies');
        gpuFrequencyMap = {};
        for (let i = 0; i <= 32; i++) {
            const freq = Math.round(836 - ((836 - 350) * i / 32));
            gpuFrequencyMap[i] = freq;
        }
    }
}

// Update frequency labels (Min on left, Max on right)
function updateFrequencyLabels() {
    const labelsDiv = document.getElementById('gpu-frequency-labels');
    if (!labelsDiv || !gpuFrequencyMap) return;
    
    const minFreq = gpuFrequencyMap[32] || 350;
    const maxFreq = gpuFrequencyMap[0] || 836;    
    labelsDiv.innerHTML = `
        <span>${minFreq} MHz</span>
        <span>${maxFreq} MHz</span>
    `;
}

// Show frequency for OPP index
function updateGpuDisplay(oppIndex) {
    const display = document.getElementById('gpu-opp-val');
    if (!display) return;
    
    if (gpuFrequencyMap && gpuFrequencyMap[oppIndex] !== undefined) {
        display.textContent = `${gpuFrequencyMap[oppIndex]} MHz`;
        display.style.color = '#32D74B';
    } else {
        getGpuFrequencyForOpp(oppIndex).then(freqMhz => {
            if (freqMhz !== null) {
                display.textContent = `${freqMhz} MHz`;
                display.style.color = '#32D74B';
                if (!gpuFrequencyMap) gpuFrequencyMap = {};
                gpuFrequencyMap[oppIndex] = freqMhz;
                updateFrequencyLabels();
            } else {
                const fallbackFreq = Math.round(836 - ((836 - 350) * parseInt(oppIndex) / 32));
                display.textContent = `${fallbackFreq} MHz`;
                display.style.color = '#FF9F0A';
            }
        }).catch(() => {
            const fallbackFreq = Math.round(836 - ((836 - 350) * parseInt(oppIndex) / 32));
            display.textContent = `${fallbackFreq} MHz`;
            display.style.color = '#FF9F0A';
        });
    }
}

// Get frequency for OPP index
async function getGpuFrequencyForOpp(oppIndex) {
    try {
        const status = await exec(`cat /proc/gpufreqv2/gpufreq_status 2>/dev/null`);
        const lines = status.trim().split('\n');
        
        for (const line of lines) {
            if (line.includes('[GPU-OPP]') && line.includes(`Index: ${oppIndex}`)) {
                const freqMatch = line.match(/Freq:\s*(\d+)/);
                if (freqMatch) {
                    return Math.round(parseInt(freqMatch[1]) / 1000);
                }
            }
        }    } catch (e) {
        console.error('Failed to get GPU frequency:', e);
    }
    return null;
}

// Apply GPU settings (ALWAYS LOCKED)
async function applyGlobalGpuSettings() {
    const sliderPosition = parseInt(document.getElementById('gpu-opp-slider').value);
    const oppIndex = 32 - sliderPosition;
    
    try {
        await exec(`mkdir -p /sdcard/MTK_AI_Engine`);
        await exec(`echo "${oppIndex}" > /sdcard/MTK_AI_Engine/global_gpu_opp_index.txt`);
        
        // Always apply the selected OPP index (no unlock option)
        await exec(`su -c "echo '${oppIndex}' > /proc/gpufreqv2/fix_target_opp_index"`);
        
        // Show frequency in status
        let freqToShow = oppIndex;
        if (gpuFrequencyMap && gpuFrequencyMap[oppIndex] !== undefined) {
            freqToShow = gpuFrequencyMap[oppIndex];
        } else {
            const actualFreq = await getGpuFrequencyForOpp(oppIndex);
            if (actualFreq !== null) {
                freqToShow = actualFreq;
            } else {
                freqToShow = Math.round(836 - ((836 - 350) * parseInt(oppIndex) / 32));
            }
        }
        updateStatusMsg(`GPU locked to ${freqToShow} MHz`, "#32D74B");
        
    } catch (error) {
        updateStatusMsg('GPU apply failed', "#FF453A");
    }
}

        // Tab Switcher
    function switchTab(tab) {
        const isApps = (tab === 'apps');
        // Hide all original content sections
        document.querySelectorAll('body > .section-header, body > .ios-list').forEach(el => {
            if (el.id !== 'apps-tab' && el.parentElement.id !== 'apps-tab') {
                el.style.display = isApps ? 'none' : 'block';
            }
        });
        document.getElementById('apps-tab').style.display = isApps ? 'block' : 'none';
        if (isApps) loadAppList();
    }

        // --- APP LIST & POPUP LOGIC ---
let currentTargetPkg = ""; 

async function loadAppList() {
    const container = document.getElementById('app-list-container');
    const file = "/sdcard/MTK_AI_Engine/game_list.txt";
    const addedRaw = await exec(`cat ${file} 2>/dev/null || echo ""`);
    const addedList = addedRaw.trim().split('\n').map(p => p.trim());

    const raw = await exec("pm list packages -3 | cut -d: -f2 | sort");
    const pkgs = raw.trim().split('\n').filter(p => p);
    
    // Separate packages into two groups for sorting
    let addedApps = [];
    let otherApps = [];

    pkgs.forEach(pkg => {
        if (addedList.includes(pkg)) {
            addedApps.push(pkg);
        } else {
            otherApps.push(pkg);
        }
    });

    // Combine them: Added games first, then everything else
    const sortedPkgs = [...addedApps, ...otherApps];
    
    let html = '';
    sortedPkgs.forEach(pkg => {
        const isAdded = addedList.includes(pkg);
        const btnColor = isAdded ? 'var(--color-red)' : 'var(--color-blue)';
        const btnText = isAdded ? 'REMOVE' : 'ADD';
        const actionFunc = isAdded ? `removeGame('${pkg}')` : `addGame('${pkg}')`;

        html += `
        <div class="list-item">
            <div class="item-content">
                <div style="display:flex; align-items:center; gap:10px;">
                    <img src="ksu://icon/${pkg}" style="width:35px; height:35px; border-radius:8px;">
                    <div class="item-info">
                        <span class="item-title">${pkg.split('.').pop().toUpperCase()}</span>
                        <span class="item-desc">${pkg}</span>
                    </div>
                </div>
            </div>
            <div style="display:flex; gap:8px;">
                <button onclick="openAppPopup('${pkg}')" style="background:#2c2c2e; color:white; border:none; padding:8px; border-radius:10px;">⚙️</button>
                <button onclick="${actionFunc}" style="background:${btnColor}; color:white; border:none; padding:8px 12px; border-radius:12px; font-weight:bold; font-size:11px; min-width:75px;">${btnText}</button>
            </div>
        </div>`;
    });
    container.innerHTML = html;
}

async function addGame(pkg) {
    await exec(`echo "${pkg}" >> /sdcard/MTK_AI_Engine/game_list.txt`);
    updateStatusMsg("ADDED: " + pkg, "var(--color-green)");
    loadAppList();
}

async function removeGame(pkg) {
    await exec(`sed -i "/^${pkg}$/d" /sdcard/MTK_AI_Engine/game_list.txt`);
    updateStatusMsg("REMOVED: " + pkg, "var(--color-red)");
    loadAppList();
}

async function openAppPopup(pkg) {
    currentTargetPkg = pkg;
    document.getElementById('popup-pkg-display').innerText = pkg;
    document.getElementById('floating-popup').style.display = 'flex';
    document.getElementById('live-renderer-status').innerText = "Status: Ready";
    
    // --- LOAD EEM VOLTAGE OFFSET ---
    const eemSlider = document.getElementById('eem-offset-slider');
    const eemDisplay = document.getElementById('eem-offset-display');
    const eemFile = `/sdcard/MTK_AI_Engine/per_app/${pkg}.eem_offset`;

    try {
        const eemRaw = await exec(`cat ${eemFile} 2>/dev/null`);
        const eemOffset = eemRaw.trim() ? parseInt(eemRaw.trim()) : 0;
        const clampedOffset = Math.max(-20, Math.min(10, eemOffset));
        
        eemSlider.value = clampedOffset;
        if (clampedOffset > 0) {
            eemDisplay.textContent = `+${clampedOffset}`;
        } else {
            eemDisplay.textContent = clampedOffset.toString();
        }
    } catch (e) {
        // Default to 0 if file doesn't exist
        eemSlider.value = 0;
        eemDisplay.textContent = "0";
    }
    
    // --- LOAD RESOLUTION SCALING ---
const scaleSlider = document.getElementById('scaling-slider');
const scaleDisplay = document.getElementById('scaling-val-display');
const scaleFile = `/sdcard/MTK_AI_Engine/per_app/${pkg}.scale`;

try {
    // Get current (live) density for comparison
    const wmOut = await exec('wm density 2>/dev/null');
    const match = wmOut.match(/Override density:\s*(\d+)|^(\d+)$/m);
    const currentDensity = match ? parseInt(match[1] || match[2]) : BASE_DENSITY;
    const livePercent = Math.round((currentDensity / BASE_DENSITY) * 100);

    // Load SAVED value (what user configured for this app)
    const savedRaw = await exec(`cat ${scaleFile} 2>/dev/null`);
    const savedPercent = savedRaw.trim() ? parseInt(savedRaw.trim()) : null;

    // Determine what to SHOW in slider: prefer saved, fallback to live
    const displayValue = (savedPercent !== null)
        ? Math.max(50, Math.min(200, savedPercent))   // clamp saved value
        : Math.max(50, Math.min(200, livePercent));   // fallback to live

    // Update UI
    scaleSlider.value = displayValue;
    updateScalingDisplay(displayValue);

    // Color: green if saved matches live, orange if mismatch, gray if no saved
    if (savedPercent === null) {
        scaleDisplay.style.color = '#636366'; // gray = no saved config
    } else if (savedPercent === livePercent) {
        scaleDisplay.style.color = '#32D74B'; // green = in sync
    } else {
        scaleDisplay.style.color = '#FF9F0A'; // orange = saved ≠ live
    }

} catch (e) {
    console.warn("Failed to load scaling config:", e);
    scaleSlider.value = 100;
    updateScalingDisplay(100);
    scaleDisplay.style.color = '#636366';
}

    // --- LOAD CPU GOVERNOR ---
    const govSelect = document.getElementById('governor-select');
    const govDisplay = document.getElementById('governor-display');

    try {
        const govRaw = await exec('cat /sys/devices/system/cpu/cpu0/cpufreq/scaling_available_governors 2>/dev/null');
        const governors = govRaw.trim() ? govRaw.trim().split(/\s+/).filter(g => g) : [];

        govSelect.innerHTML = '<option value="">— Auto / Default —</option>';
        governors.forEach(gov => {
            const opt = document.createElement('option');
            opt.value = gov;
            opt.textContent = gov.charAt(0).toUpperCase() + gov.slice(1);
            govSelect.appendChild(opt);
        });

        const govFile = `/sdcard/MTK_AI_Engine/per_app/${pkg}.governor`;
        const savedGov = (await exec(`cat ${govFile} 2>/dev/null`)).trim();
        const liveGov = (await exec('cat /sys/devices/system/cpu/cpu0/cpufreq/scaling_governor 2>/dev/null')).trim();

        if (savedGov && governors.includes(savedGov)) {
            govSelect.value = savedGov;
            govDisplay.textContent = savedGov;
            govDisplay.style.color = (savedGov === liveGov) ? '#32D74B' : '#FF9F0A';
        } else {
            govSelect.value = '';
            govDisplay.textContent = liveGov ? `system: ${liveGov}` : 'auto';
            govDisplay.style.color = liveGov ? '#636366' : '#FF9F0A';
        }
    } catch (e) {
        govSelect.innerHTML = '<option>Load failed</option>';
        govDisplay.textContent = 'error';
    }
      
    // --- LOAD SAVED VSYNC VALUE FOR THIS APP ---
    const configDir = "/sdcard/MTK_AI_Engine/vsync_configs";
    const configFile = `${configDir}/${pkg}.vsync`;
    const savedValRaw = await exec(`cat ${configFile} 2>/dev/null || echo "0"`);
    const savedVal = (savedValRaw.trim() || "0").replace(/\D/g, ''); // Keep only digits
    const vsyncSlider = document.getElementById('vsync-slider');
    const numericVal = Math.min(5000000, Math.max(0, parseInt(savedVal) || 0));

    vsyncSlider.value = numericVal;
    updateVsyncDisplay(numericVal); // Trigger display update with correct value
    // --- LOAD REFRESH RATE LOCK FOR THIS APP ---
const refreshSelect = document.getElementById('refresh-mode-select');
const refreshDisplay = document.getElementById('refresh-mode-display');

// Reset dropdown to "Disabled"
refreshSelect.innerHTML = '<option value="">— Disabled —</option>';
refreshDisplay.textContent = 'Off';
refreshDisplay.style.color = '#FF453A';

// 1. Load available modes (populate dropdown)
try {
    const modeList = await exec(' /data/adb/modules/MTK_AI/script_runner/display_mode 2>/dev/null');
    const lines = modeList.trim().split('\n').filter(line => line.includes('|') && line.includes('Hz'));
    
    lines.forEach(line => {
        const [id, spec] = line.split('|', 2);
        if (id !== undefined && spec) {
            const opt = document.createElement('option');
            opt.value = id;
            opt.textContent = spec;
            refreshSelect.appendChild(opt);
        }
    });
} catch (e) {
    console.warn("Failed to load refresh modes:", e);
}

// 2. Load saved mode for this app
const refreshConfigDir = "/sdcard/MTK_AI_Engine/refresh_locks";
const refreshConfigFile = `${refreshConfigDir}/${pkg}.mode`;
const savedMode = await exec(`cat ${refreshConfigFile} 2>/dev/null`);
const modeId = savedMode.trim();

// Set dropdown to saved value (if valid)
if (refreshSelect.querySelector(`option[value="${modeId}"]`)) {
    refreshSelect.value = modeId;
    const selectedOpt = refreshSelect.options[refreshSelect.selectedIndex];
    refreshDisplay.textContent = selectedOpt?.textContent || 'On';
    refreshDisplay.style.color = '#34C759';
} else {
    refreshSelect.value = '';
   }
}

function closeAppPopup() {
    document.getElementById('floating-popup').style.display = 'none';
}

// --- GLOBAL SCALING SLIDER HANDLERS ---
function updateGlobalScalingDisplay(value) {
    document.getElementById('global-scaling-val').textContent = value + '%';
}

async function applyGlobalScaling() {
    const percent = document.getElementById('global-scaling-slider').value;
    
    // Save to SD card
    await exec(`su -c "mkdir -p /sdcard/MTK_AI_Engine && echo '${percent}' > /sdcard/MTK_AI_Engine/manual_scaling.txt"`);
    
    // Apply live
    const density = Math.round(BASE_DENSITY * (percent / 100));
    await exec(`wm density ${density}`);
    
    updateStatusMsg(`Scaling set to ${percent}%`, "#32D74B");
}

// Load saved scaling on startup
async function loadSavedGlobalScaling() {
    try {
        const savedRaw = await exec(`cat /sdcard/MTK_AI_Engine/manual_scaling.txt 2>/dev/null`);
        const percent = parseInt(savedRaw.trim()) || 100;
        
        const slider = document.getElementById('global-scaling-slider');
        const display = document.getElementById('global-scaling-val');
        
        slider.value = Math.max(50, Math.min(200, percent));
        updateGlobalScalingDisplay(slider.value);
    } catch (e) {
        console.log("No saved global scaling");
    }
}

// --- APPLY & SAVE GOVERNOR ---
async function applyGlobalGovernor(gov) {
    // Save to SD card (same style as refresh rate)
    await exec(`su -c "mkdir -p /sdcard/MTK_AI_Engine && echo '${gov}' > /sdcard/MTK_AI_Engine/manual_governor.txt"`);
    
    // Apply live
    await exec(`
        for cpu in /sys/devices/system/cpu/cpu[0-9]*; do
            [ -f "\$cpu/cpufreq/scaling_governor" ] && echo "${gov}" > "\$cpu/cpufreq/scaling_governor"
        done
    `);
    
    updateStatusMsg(`CPU Governor: ${gov}`, "#FF9F0A");
    
    // Highlight active button
    document.querySelectorAll('#dynamic-governor-buttons .refresh-btn').forEach(btn => {
        btn.classList.toggle('active', btn.textContent.toLowerCase() === gov);
    });
}

// --- APPLY & SAVE RENDERER ---
async function applyGlobalRenderer(mode) {
    // Save to SD card (same style as refresh rate)
    await exec(`su -c "mkdir -p /sdcard/MTK_AI_Engine && echo '${mode}' > /sdcard/MTK_AI_Engine/manual_renderer.txt"`);
    
    // Apply live
    await exec(`su -c "setprop debug.hwui.renderer ${mode}"`);
    
    updateStatusMsg(`Renderer: ${mode} — Restart apps`, "#007AFF");
    
    // Highlight active button
    const label = mode === 'skiavk' ? 'Vulkan' : 'OpenGL';
    document.querySelectorAll('#dynamic-renderer-buttons .refresh-btn').forEach(btn => {
        btn.classList.toggle('active', btn.textContent === label);
    });
}

// --- RENDERER ENGINE ---

async function verifyRenderer() {
    const statusText = document.getElementById('live-renderer-status');
    statusText.innerHTML = "🔍 Checking Pipeline...";
    const cmd = `su -c "dumpsys gfxinfo ${currentTargetPkg} | grep -E 'Graphics|Pipeline|Renderer'"`;
    const result = await exec(cmd);
    const out = result.toLowerCase();
    if (out.includes("vulkan") || out.includes("vk")) {
        statusText.innerHTML = "Result: <span style='color:#4cd964; font-weight:bold;'>VULKAN ✅</span>";
    } else if (out.includes("opengl") || out.includes("gl")) {
        statusText.innerHTML = "Result: <span style='color:#ff9500; font-weight:bold;'>OPENGL ⚠️</span>";
    } else {
        statusText.innerHTML = "Result: <span style='color:#ff3b30'>No Data (Open Game)</span>";
    }
}

async function applyHardCoreFix(mode) {
    const statusText = document.getElementById('live-renderer-status');
    statusText.innerHTML = `<span style="color:var(--color-blue)">Restarting App...</span>`;
    // 1. Set Props & Kill App
    await exec(`su -c "setprop debug.hwui.renderer ${mode} && am force-stop ${currentTargetPkg}"`);
    // 2. Clear Shader Caches
    await exec(`su -c "rm -rf /data/data/${currentTargetPkg}/code_cache/com.android.opengl.shaders_cache"`);
    await exec(`su -c "rm -rf /data/data/${currentTargetPkg}/code_cache/com.android.skia.shaders_cache"`);
    statusText.innerHTML = `<span style="color:var(--color-green)">Applied!</span> Open game & Verify.`;
}

async function saveAndApplyRenderer(mode) {
    const configDir = "/sdcard/MTK_AI_Engine/threading_configs";
    const configFile = `${configDir}/${currentTargetPkg}.conf`;
    await exec(`su -c "mkdir -p ${configDir} && echo '${mode}' > ${configFile}"`);
    await applyHardCoreFix(mode); 
}

// Live UI Feedback
function updateVsyncDisplay(val) {
    const num = typeof val === 'string' ? parseInt(val, 10) : val;
    const display = document.getElementById('vsync-val-display');
    if (!display) return;

    if (num === 0) {
        display.innerText = "0ns (Lowest Latency)";
    } else {
        display.innerText = (num / 1000000).toFixed(1) + "ms";
    }
}

async function saveAndApplyVsync() {
    const vsyncVal = document.getElementById('vsync-slider').value;
    const configDir = "/sdcard/MTK_AI_Engine/vsync_configs";
    const configFile = `${configDir}/${currentTargetPkg}.vsync`;
    const statusText = document.getElementById('live-renderer-status');

    statusText.innerHTML = "💾 Saving VSync...";

    // 1. Save to SD Card for your Boot Detector
    const saveCmd = `su -c "mkdir -p ${configDir} && echo '${vsyncVal}' > ${configFile}"`;
    await exec(saveCmd);

    // 2. Apply the "Hardcore 5" Setup immediately
    const applyCmd = `su -c "
        setprop debug.sf.early_phase_offset_ns ${vsyncVal} && 
        setprop debug.sf.early_gl_phase_offset_ns ${vsyncVal} &&
        setprop debug.sf.high_fps_early_phase_offset_ns ${vsyncVal} &&
        setprop debug.sf.high_fps_early_gl_phase_offset_ns ${vsyncVal} &&
        setprop debug.sf.high_fps_late_app_phase_offset_ns ${vsyncVal}
    "`;
    await exec(applyCmd);

    statusText.innerHTML = `<span style="color:#4cd964">Applied 5-Point VSync: ${vsyncVal}ns</span>`;
}

// Load available display modes and populate dropdown
async function loadRefreshModes() {
    const select = document.getElementById('refresh-mode-select');
    select.innerHTML = '<option value="">— Disabled —</option>';

    try {
        // Run your display_modes script
        const modeList = await exec(' /data/adb/modules/MTK_AI/script_runner/display_modes 2>/dev/null');
        const lines = modeList.trim().split('\n').filter(line => line.includes('|') && line.includes('Hz'));

        lines.forEach(line => {
            const [id, spec] = line.split('|', 2);
            if (id !== undefined && spec) {
                const opt = document.createElement('option');
                opt.value = id;
                opt.textContent = spec;
                select.appendChild(opt);
            }
        });
    } catch (e) {
        console.error("Failed to load refresh modes:", e);
    }

    // Load saved mode for current app
    const configDir = "/sdcard/MTK_AI_Engine/refresh_locks";
    const configFile = `${configDir}/${currentTargetPkg}.mode`;
    const savedMode = await exec(`cat ${configFile} 2>/dev/null`);
    select.value = savedMode.trim() || '';
    updateRefreshDisplay();
}

function updateRefreshDisplay() {
    const select = document.getElementById('refresh-mode-select');
    const display = document.getElementById('refresh-mode-display');
    if (!select.value) {
        display.textContent = 'Off';
        display.style.color = '#FF453A';
    } else {
        const opt = Array.from(select.options).find(o => o.value === select.value);
        display.textContent = opt?.textContent || 'On';
        display.style.color = '#34C759';
    }
}

async function applyRefreshLock() {
    const modeId = document.getElementById('refresh-mode-select').value;
    const configDir = "/sdcard/MTK_AI_Engine/refresh_locks";
    const configFile = `${configDir}/${currentTargetPkg}.mode`;
    const statusText = document.getElementById('live-renderer-status');

    statusText.innerHTML = "💾 Saving Refresh Lock...";

    // Save to SD card
    if (modeId) {
        await exec(`su -c "mkdir -p ${configDir} && echo '${modeId}' > ${configFile}"`);
    } else {
        await exec(`su -c "rm -f ${configFile}"`);
    }

    // Optional: Apply immediately (if game is running)
    if (modeId) {
        await exec(`su -c "service call SurfaceFlinger 1035 i32 ${modeId}"`);
    }

    statusText.innerHTML = `<span style="color:#4cd964">Refresh Lock ${modeId ? 'Set' : 'Disabled'}</span>`;
    updateRefreshDisplay();
}

let isOverlayOn = false;

async function toggleOverlay() {
    const statusSpan = document.getElementById('mon_overlay');
    const dot = document.getElementById('overlay-status-dot');

    // Toggle state
    isOverlayOn = !isOverlayOn;

    try {
        // Apply via shell command
        const cmd = `su -c "service call SurfaceFlinger 1034 i32 ${isOverlayOn ? 1 : 0}"`;
        await exec(cmd);

        // Update UI
        statusSpan.textContent = isOverlayOn ? 'ON' : 'OFF';
        statusSpan.style.color = isOverlayOn ? '#34C759' : '#FF453A';

        // Show/hide dot
        dot.style.display = isOverlayOn ? 'block' : 'none';

        // Optional: show toast or log
        console.log(`Overlay ${isOverlayOn ? 'ENABLED' : 'DISABLED'}`);
    } catch (e) {
        alert("Failed to toggle overlay. Root required?");
        isOverlayOn = !isOverlayOn; // Revert on error
        statusSpan.textContent = isOverlayOn ? 'ON' : 'OFF';
        dot.style.display = isOverlayOn ? 'block' : 'none';
    }
}

let currentManualLock = null;
let availableModes = []; // [{ id: "0", label: "60Hz" }, ...]

async function loadRefreshModesForButtons() {
    const container = document.getElementById('dynamic-refresh-buttons');
    container.innerHTML = '<div style="font-size:12px;color:#666;">Loading...</div>';

    try {
        const output = await exec(' /data/adb/modules/MTK_AI/script_runner/display_mode 2>/dev/null');
        const lines = output.trim().split('\n').filter(l => l.includes('|') && l.includes('Hz'));

        availableModes = lines.map(line => {
            const [id, spec] = line.split('|', 2);
            // Extract just the "120Hz" part from "1080x2400 120Hz"
            const hzMatch = spec?.match(/(\d+)Hz/);
            const hz = hzMatch ? hzMatch[1] + 'Hz' : spec || 'Mode ' + id;
            return { id, label: hz };
        });

        if (availableModes.length === 0) {
            container.innerHTML = '<div style="font-size:12px;color:#ff453a;">No modes detected</div>';
            return;
        }

        // Generate buttons
        container.innerHTML = '';
        availableModes.forEach(mode => {
            const btn = document.createElement('button');
            btn.className = 'refresh-btn';
            btn.textContent = mode.label;
            btn.onclick = () => setRefreshLock(mode.id);
            container.appendChild(btn);
        });

        // Load saved manual lock
        loadSavedManualLock();

    } catch (e) {
        console.error("Failed to load refresh modes:", e);
        container.innerHTML = '<div style="font-size:12px;color:#ff453a;">Error loading modes</div>';
    }
}

async function setRefreshLock(modeId) {
    // Clear active states
    document.querySelectorAll('.refresh-btn').forEach(btn => btn.classList.remove('active'));

    if (modeId === null) {
        currentManualLock = null;
        await exec(`su -c "rm -f /sdcard/MTK_AI_Engine/manual_refresh_lock.txt"`);
        document.getElementById('debug-msg').textContent = "Manual Refresh Lock: OFF";
        return;
    }

    currentManualLock = modeId;

    try {
        await exec(`su -c "service call SurfaceFlinger 1035 i32 ${modeId}"`);
        
        // Highlight active button
        const btn = Array.from(document.querySelectorAll('.refresh-btn'))
            .find(b => b.textContent === availableModes.find(m => m.id === modeId)?.label);
        if (btn) btn.classList.add('active');

        // Save
        await exec(`su -c "mkdir -p /sdcard/MTK_AI_Engine/ && echo '${modeId}' > /sdcard/MTK_AI_Engine/manual_refresh_lock.txt"`);
        document.getElementById('debug-msg').textContent = `Manual Refresh Lock: ${availableModes.find(m => m.id === modeId)?.label || modeId}`;

    } catch (e) {
        alert("Failed to apply refresh rate");
        currentManualLock = null;
    }
}

async function loadSavedManualLock() {
    try {
        const saved = await exec(`cat /sdcard/MTK_AI_Engine/manual_refresh_lock.txt 2>/dev/null`);
        const modeId = saved.trim();
        if (availableModes.some(m => m.id === modeId)) {
            currentManualLock = modeId;
            setRefreshLock(modeId); // This will highlight the button
        }
    } catch (e) {
        console.log("No saved manual lock");
    }
}

async function loadSavedGlobalSettings() {
    const dir = GLOBAL_CONFIG_DIR;
    
    // Load scaling
    const scaling = await exec(`cat ${dir}/scaling 2>/dev/null`);
    if (scaling.trim()) {
        const p = parseInt(scaling.trim());
        if (!isNaN(p)) {
            document.querySelectorAll('#dynamic-scaling-buttons .refresh-btn')
                .forEach(btn => btn.classList.toggle('active', btn.textContent === `${p}%`));
        }
    }
    
    // Load governor
    const gov = await exec(`cat ${dir}/governor 2>/dev/null`);
    if (gov.trim()) {
        document.querySelectorAll('#dynamic-governor-buttons .refresh-btn')
            .forEach(btn => btn.classList.toggle('active', btn.textContent.toLowerCase() === gov.trim()));
    }
    
    // Load renderer
    const renderer = await exec(`cat ${dir}/renderer 2>/dev/null`);
    if (renderer.trim()) {
        const label = renderer.trim() === 'skiavk' ? 'Vulkan' : 'OpenGL';
        document.querySelectorAll('#dynamic-renderer-buttons .refresh-btn')
            .forEach(btn => btn.classList.toggle('active', btn.textContent === label));
    }
}

// --- BASE DENSITY DETECTION ---
let BASE_DENSITY = 480;
async function initBaseDensity() {
    try {
        const out = await exec('wm density');
        const match = out.match(/(\d+)/);
        if (match) BASE_DENSITY = parseInt(match[1]) || 480;
    } catch (e) { /* keep fallback */ }
}

// --- SCALING DISPLAY UPDATE ---
function updateScalingDisplay(value) {
    const display = document.getElementById('scaling-val-display');
    if (display) display.textContent = value + '%';
}

// --- SAVE & APPLY SCALING ---
async function saveAndApplyScaling() {
    const pkg = currentTargetPkg;
    if (!pkg) return;

    const scale = document.getElementById('scaling-slider').value;
    const newDensity = Math.round(BASE_DENSITY * (scale / 100));
    
    // Save config
    await exec(`mkdir -p /sdcard/MTK_AI_Engine/per_app && echo "${scale}" > /sdcard/MTK_AI_Engine/per_app/${pkg}.scale`);
    // Apply
    await exec(`wm density ${newDensity}`);
    
    // Feedback
    document.getElementById('scaling-val-display').style.color = '#32D74B';
    updateStatusMsg(`Scaling set to ${scale}%`, "#32D74B");
}

// --- RESET SCALING ---
async function resetScalingToDefault() {
    const pkg = currentTargetPkg;
    if (!pkg) return;

    await exec(`rm -f /sdcard/MTK_AI_Engine/per_app/${pkg}.scale`);
    await exec(`wm density ${BASE_DENSITY}`);

    document.getElementById('scaling-slider').value = 100;
    updateScalingDisplay(100);
    document.getElementById('scaling-val-display').style.color = '#32D74B';
    updateStatusMsg("Scaling reset to 100%", "#32D74B");
}

// --- SAVE & APPLY CPU GOVERNOR ---
async function saveAndApplyGovernor() {
    const pkg = currentTargetPkg;
    if (!pkg) return;

    const gov = document.getElementById('governor-select').value;
    const govFile = `/sdcard/MTK_AI_Engine/per_app/${pkg}.governor`;

    if (gov) {
        await exec(`mkdir -p /sdcard/MTK_AI_Engine/per_app && echo "${gov}" > ${govFile}`);
        // Apply to all CPUs
        await exec(`
            for cpu in /sys/devices/system/cpu/cpu[0-9]*; do
                [ -f "\$cpu/cpufreq/scaling_governor" ] && echo "${gov}" > "\$cpu/cpufreq/scaling_governor"
            done
        `);
        updateStatusMsg(`CPU Governor: ${gov}`, "#FF9F0A");
    } else {
        await exec(`rm -f ${govFile}`);
        updateStatusMsg("CPU Governor: auto", "#FF9F0A");
    }
}

function cleanString(str) {
    return (str || '').toString().trim().replace(/[\x00-\x1F\x7F]/g, '');
}

async function loadRendererButtons() {
    const container = document.getElementById('dynamic-renderer-buttons');
    container.innerHTML = '';

    const modes = [
        { label: "Vulkan", value: "skiavk" },
        { label: "OpenGL", value: "skiagl" }
    ];

    try {
        const savedRaw = await exec(`cat /sdcard/MTK_AI_Engine/manual_renderer.txt 2>/dev/null`);
        // Clean the string: remove whitespace, newlines, quotes
        const savedMode = (savedRaw || '').trim().replace(/['"\n\r]/g, '');

        modes.forEach(mode => {
            const btn = document.createElement('button');
            btn.className = 'refresh-btn';
            if (savedMode === mode.value) {
                btn.classList.add('active');
            }
            btn.textContent = mode.label;
            btn.onclick = () => applyGlobalRenderer(mode.value);
            container.appendChild(btn);
        });
    } catch (e) {
        console.error("Failed to load renderer:", e);
        modes.forEach(mode => {
            const btn = document.createElement('button');
            btn.className = 'refresh-btn';
            btn.textContent = mode.label;
            btn.onclick = () => applyGlobalRenderer(mode.value);
            container.appendChild(btn);
        });
    }
}

// --- LOAD & CREATE GOVERNOR BUTTONS (with SD card load) ---
async function loadGovernorButtons() {
    const container = document.getElementById('dynamic-governor-buttons');
    container.innerHTML = '<div style="font-size:12px;color:#666;">Loading...</div>';

    try {
        const govRaw = await exec('cat /sys/devices/system/cpu/cpu0/cpufreq/scaling_available_governors 2>/dev/null');
        const governors = govRaw.trim().split(/\s+/).filter(g => g);

        // Load saved governor from SD card
        const savedGovRaw = await exec(`cat /sdcard/MTK_AI_Engine/manual_governor.txt 2>/dev/null`);
        const savedGov = savedGovRaw.trim();

        container.innerHTML = '';
        governors.forEach(gov => {
            const btn = document.createElement('button');
            btn.className = 'refresh-btn';
            if (gov === savedGov) {
                btn.classList.add('active'); // highlight saved
            }
            btn.textContent = gov.charAt(0).toUpperCase() + gov.slice(1);
            btn.onclick = () => applyGlobalGovernor(gov);
            container.appendChild(btn);
        });
    } catch (e) {
        container.innerHTML = '<div style="font-size:12px;color:#ff453a;">Root required</div>';
    }
}

// --- TOUCH ACTIVE CPU FREQUENCY (LIVE APPLY) ---
function updateTouchActiveFreqDisplay(value) {
    document.getElementById('touch-active-freq-val').textContent = value + '%';
}

async function applyTouchActiveFreq() {
    const percent = document.getElementById('touch-active-freq-slider').value;
    const clamped = Math.max(50, Math.min(100, parseInt(percent)));
    
    // Save to SD card
    await exec(`su -c "mkdir -p /sdcard/MTK_AI_Engine && echo '${clamped}' > /sdcard/MTK_AI_Engine/manual_touch_active_freq.txt"`);
    
    // Apply LIVE to all CPUs immediately
    await exec(`
        for cpu in /sys/devices/system/cpu/cpu[0-9]*; do
            if [ -f "\$cpu/cpufreq/cpuinfo_max_freq" ]; then
                MAX_FREQ=\$(cat "\$cpu/cpufreq/cpuinfo_max_freq")
                MIN_FREQ=\$(cat "\$cpu/cpufreq/cpuinfo_min_freq")
                TARGET_MAX=\$((MAX_FREQ * ${clamped} / 100))
                echo \$MIN_FREQ > "\$cpu/cpufreq/scaling_min_freq"
                echo \$TARGET_MAX > "\$cpu/cpufreq/scaling_max_freq"
            fi
        done
    `);
    
    updateStatusMsg(`Touch Active CPU: ${clamped}%`, "#32D74B");
}

// --- INACTIVE TOUCH CPU FREQUENCY (LIVE APPLY) ---
function updateInactiveFreqDisplay(value) {
    document.getElementById('inactive-freq-val').textContent = value + '%';
}

async function applyInactiveFreq() {
    const percent = document.getElementById('inactive-freq-slider').value;
    const clamped = Math.max(25, Math.min(50, parseInt(percent)));
    
    // Save to SD card
    await exec(`su -c "mkdir -p /sdcard/MTK_AI_Engine && echo '${clamped}' > /sdcard/MTK_AI_Engine/manual_inactive_freq.txt"`);
    
    // Apply LIVE to all CPUs immediately
    await exec(`
        for cpu in /sys/devices/system/cpu/cpu[0-9]*; do
            if [ -f "\$cpu/cpufreq/cpuinfo_max_freq" ]; then
                MAX_FREQ=\$(cat "\$cpu/cpufreq/cpuinfo_max_freq")
                TARGET_MAX=\$((MAX_FREQ * ${clamped} / 100))
                echo \$TARGET_MAX > "\$cpu/cpufreq/scaling_max_freq"
            fi
        done
    `);
    
    updateStatusMsg(`Inactive CPU: ${clamped}%`, "#FF9F0A");
}

// --- UNIFIED CPU FREQUENCY SCALING ---
function updateCpuFreqDisplay(value) {
    document.getElementById('cpu-freq-val').textContent = value + '%';
    
    // Optional: Show live temperature effect preview
    const tempElement = document.getElementById('cpu-temp-preview');
    if (tempElement) {
        // Simulate at 40°C (5°C above baseline)
        const tempDiff = 5; // Example: 40°C - 35°C
        const reduction = tempDiff * 5; // 25%
        const effective = Math.max(30, parseInt(value) - reduction);
        tempElement.textContent = `→ ${effective}% @ 40°C`;
    }
}

async function applyCpuFreqScaling() {
    const percent = document.getElementById('cpu-freq-slider').value;
    const clamped = Math.max(30, Math.min(100, parseInt(percent)));
    
    // Save to SD card
    await exec(`su -c "mkdir -p /sdcard/MTK_AI_Engine && echo '${clamped}' > /sdcard/MTK_AI_Engine/cpu_freq_scaling.txt"`);
    
    // Apply immediately with temperature logic
    await exec(`
        if [ -f "/sys/class/power_supply/battery/temp" ]; then
            TEMP_RAW=\$(cat /sys/class/power_supply/battery/temp)
            TEMP_INT=\$((TEMP_RAW / 10))
        else
            TEMP_INT=38
        fi
        
        BASE_PERCENT=${clamped}
        REF_TEMP=38  # Baseline temperature
        
        for cpu in /sys/devices/system/cpu/cpu[0-9]*; do
            if [ -f "\$cpu/cpufreq/cpuinfo_max_freq" ]; then
                MAX_FREQ=\$(cat "\$cpu/cpufreq/cpuinfo_max_freq")
                MIN_FREQ=\$(cat "\$cpu/cpufreq/cpuinfo_min_freq")
                
                TEMP_DIFF=\$((TEMP_INT - REF_TEMP))
                if [ "\$TEMP_DIFF" -gt 0 ]; then
                    REDUCTION=\$((TEMP_DIFF * 5))
                    CURRENT_PERCENT=\$((BASE_PERCENT - REDUCTION))
                    [ "\$CURRENT_PERCENT" -lt 30 ] && CURRENT_PERCENT=30
                else
                    CURRENT_PERCENT=\$BASE_PERCENT
                fi
                
                TARGET_FREQ=\$((MAX_FREQ * CURRENT_PERCENT / 100))
                echo \$MIN_FREQ > "\$cpu/cpufreq/scaling_min_freq"
                echo \$TARGET_FREQ > "\$cpu/cpufreq/scaling_max_freq"
            fi
        done
    `);
    
    updateStatusMsg(`CPU Max: ${clamped}% (auto-temp scaling active)`, "#007AFF");
}

function updateStatusMsg(msg, color) {
    const debug = document.getElementById('debug-msg');
    if (debug) {
        debug.innerText = msg;
        debug.style.color = color;
        setTimeout(() => { debug.innerText = "System Ready"; debug.style.color = ""; }, 2000);
    }
}

// ACCORDION BEHAVIOR: Only one tab open at a time
document.addEventListener('DOMContentLoaded', function() {
    const headers = document.querySelectorAll('.section-header');
    
    headers.forEach(header => {
        header.addEventListener('click', function() {
            const targetSection = this.nextElementSibling;
            const isCurrentlyExpanded = targetSection.classList.contains('expanded');
            
            // Close all sections first
            document.querySelectorAll('.section-content').forEach(section => {
                section.classList.remove('expanded');
                section.style.maxHeight = '0';
            });
            
            // Open clicked section (unless it was already open)
            if (!isCurrentlyExpanded) {
                targetSection.classList.add('expanded');
                // Calculate actual height needed
                const contentHeight = targetSection.scrollHeight;
                targetSection.style.maxHeight = contentHeight + 'px';
            }
        });
    });
});

// --- GLOBAL EEM VOLTAGE OFFSET (Main Menu) ---
function updateEemOffsetDisplayGlobal(value) {
    const display = document.getElementById('eem-offset-val');
    if (value > 0) {
        display.textContent = `+${value}`;
    } else {
        display.textContent = value.toString();
    }
}

async function applyEemVoltageOffset() {
    const offset = document.getElementById('eem-offset-slider').value;
    const status = document.getElementById('eem-status');
    
    status.textContent = "Applying...";
    status.style.color = "#FF9F0A";
    
    try {
        // Save to SD card for persistence
        await exec(`su -c "mkdir -p /sdcard/MTK_AI_Engine && echo '${offset}' > /sdcard/MTK_AI_Engine/eem_voltage_offset.txt"`);
        
        // Apply to all universal EEM paths
        const eemPaths = [
            "/proc/eem/EEM_DET_B/eem_offset",
            "/proc/eem/EEM_DET_L/eem_offset", 
            "/proc/eem/EEM_DET_CCI/eem_offset",
            "/proc/eem/EEM_DET_BL/eem_offset",
            "/proc/eemg/EEMG_DET_GPU/eemg_offset",
            "/proc/eemg/EEMG_DET_GPU_HI/eemg_offset"
        ];
        
        for (const path of eemPaths) {
            await exec(`su -c "echo '${offset}' > '${path}' 2>/dev/null || true"`);
        }
        
        status.textContent = `Applied: ${offset}`;
        status.style.color = "#32D74B";
        updateStatusMsg(`EEM Voltage Offset: ${offset}`, "#32D74B");
        
    } catch (error) {
        status.textContent = "Failed to apply";
        status.style.color = "#FF453A";
        console.error("EEM Voltage Error:", error);
    }
    
    setTimeout(() => {
        status.textContent = "Status: Ready";
        status.style.color = "#666";
    }, 3000);
}
async function loadSavedEemOffset() {
    try {
        const saved = await exec(`cat /sdcard/MTK_AI_Engine/eem_voltage_offset.txt 2>/dev/null`);
        const offset = parseInt(saved.trim()) || 0;
        const clamped = Math.max(-20, Math.min(10, offset));
        
        document.getElementById('eem-offset-slider').value = clamped;
        updateEemOffsetDisplayGlobal(clamped);
    } catch (e) {
        document.getElementById('eem-offset-slider').value = 0;
        updateEemOffsetDisplayGlobal(0);
    }
}

// --- PER-APP EEM VOLTAGE OFFSET (Popup) ---
function updateEemOffsetDisplay(value) {
    const display = document.getElementById('eem-offset-display');
    if (value > 0) {
        display.textContent = `+${value}`;
    } else {
        display.textContent = value.toString();
    }
    display.style.color = '#FF9F0A';
}

// Updated function that uses event target
async function saveAndApplyEemOffset(event) {
    const pkg = currentTargetPkg;
    if (!pkg) return;

    // Get value from the slider that triggered the event
    const offset = event.target.value;
    const eemFile = `/sdcard/MTK_AI_Engine/per_app/${pkg}.eem_offset`;

    try {
        // Save to SD card
        await exec(`su -c "mkdir -p /sdcard/MTK_AI_Engine/per_app && echo '${offset}' > '${eemFile}'"`);
        
        // Apply to EEM paths
        const eemPaths = [
            "/proc/eem/EEM_DET_B/eem_offset",
            "/proc/eem/EEM_DET_L/eem_offset",
            "/proc/eem/EEM_DET_CCI/eem_offset",
            "/proc/eem/EEM_DET_BL/eem_offset",
            "/proc/eemg/EEMG_DET_GPU/eemg_offset",
            "/proc/eemg/EEMG_DET_GPU_HI/eemg_offset"
        ];
        
        for (const path of eemPaths) {
            await exec(`su -c "echo '${offset}' > '${path}' 2>/dev/null || true"`);
        }
        
        updateStatusMsg(`EEM Offset: ${offset} → ${pkg}`, "#FF9F0A");
        document.getElementById('eem-offset-display').style.color = '#32D74B';
        
    } catch (error) {
        updateStatusMsg(`EEM Offset failed for ${pkg}`, "#FF453A");
        document.getElementById('eem-offset-display').style.color = '#FF453A';
    }
}

async function loadAppEemOffset(pkg) {
    try {
        const raw = await exec(`cat /sdcard/MTK_AI_Engine/per_app/${pkg}.eem_offset 2>/dev/null`);
        const offset = parseInt(raw.trim()) || 0;
        const clamped = Math.max(-20, Math.min(10, offset));
        
        document.getElementById('eem-offset-slider').value = clamped;
        updateEemOffsetDisplay(clamped);
    } catch (e) {
        document.getElementById('eem-offset-slider').value = 0;
        updateEemOffsetDisplay(0);
    }
}

// --- DYNAMIC CPU CONTROL SETTINGS ---
let cpuCgroups = [];

async function loadCpuControlSettings() {
    const status = document.getElementById('cpu-control-status');
    status.textContent = "Scanning cgroups...";
    status.style.color = "#FF9F0A";
    
    try {
        // Get all directories in /dev/cpuctl/
        const output = await exec(`ls -d /dev/cpuctl/*/ 2>/dev/null`);
        const dirs = output.trim().split('\n').filter(dir => dir && !dir.includes('..'));
        
        // Filter for directories that have 'cpu.shares' file
        const validCgroups = [];
        for (const dir of dirs) {
            const name = dir.replace('/dev/cpuctl/', '').replace('/', '');
            const sharesPath = `${dir}cpu.shares`;
            
            // Check if cpu.shares exists
            const hasShares = await exec(`test -f "${sharesPath}" && echo "yes" || echo "no"`);
            if (hasShares.trim() === 'yes') {
                // Read actual current value
                const currentValue = parseInt(await exec(`cat ${sharesPath} 2>/dev/null`)) || 1024;
                
                validCgroups.push({
                    name: name,
                    path: sharesPath,
                    default: currentValue,  // Use actual value as default
                    currentValue: currentValue
                });
            }
        }
        
        cpuCgroups = validCgroups;
        
        // Generate UI dynamically
        generateCpuControlUI();
        
        // Load saved values (if they exist)
        for (const cgroup of cpuCgroups) {
            const savedValue = parseInt(await exec(`cat /sdcard/MTK_AI_Engine/cpu_${cgroup.name}_share.txt 2>/dev/null`)) || cgroup.currentValue;
            
            // Update slider value
            const safeName = cgroup.name.replace(/[^a-zA-Z0-9_-]/g, '_');
            const slider = document.getElementById(`${safeName}-cpu-share-slider`);
            if (slider) {
                slider.value = Math.max(10, Math.min(8192, savedValue));
                updateCpuShareDisplay(safeName);
            }
        }
        
        status.textContent = `Found ${cpuCgroups.length} cgroups`;
        status.style.color = "#32D74B";
        
    } catch (error) {
        status.textContent = "Scan Failed";
        status.style.color = "#FF453A";
        console.error("CPU Control Scan Error:", error);
    }
}

function generateCpuControlUI() {
    const container = document.getElementById('cpu-cgroup-controls');
    container.innerHTML = '';
    
    if (cpuCgroups.length === 0) {
        container.innerHTML = '<div style="font-size: 12px; color: #ff453a; text-align: center; padding: 10px;">No CPU cgroups found</div>';
        return;
    }
    
    // Create controls for each cgroup
    cpuCgroups.forEach(cgroup => {
        const controlDiv = document.createElement('div');
        controlDiv.className = 'ios-range-container';
        controlDiv.style.padding = '16px';
        controlDiv.style.borderBottom = '1px solid var(--border-color)';
        controlDiv.style.marginBottom = '12px';
        
        const safeName = cgroup.name.replace(/[^a-zA-Z0-9_-]/g, '_');
        
        controlDiv.innerHTML = `
            <div class="range-label-row">
                <span class="item-title">${cgroup.name}</span>
                <span id="${safeName}-cpu-share-val" style="color:var(--color-blue); font-weight:bold;">${cgroup.default}</span>
            </div>
            <input type="range" id="${safeName}-cpu-share-slider" min="10" max="8192" step="10" value="${cgroup.default}" 
                   oninput="updateCpuShareDisplay('${safeName}')" 
                   onchange="applyCpuControlSettings()"
                   class="ios-range">
            <div id="${safeName}-cpu-share-labels" style="display: flex; justify-content: space-between; font-size: 10px; color: #666; margin-top: 8px;">
                <span>10</span>
                <span>${cgroup.default}</span>
                <span>8192</span>
            </div>
        `;
        
        container.appendChild(controlDiv);
    });
}

function updateCpuShareDisplay(safeName) {    const slider = document.getElementById(`${safeName}-cpu-share-slider`);
    const display = document.getElementById(`${safeName}-cpu-share-val`);
    if (slider && display) {
        display.textContent = slider.value;
    }
}

async function applyCpuControlSettings() {
    const status = document.getElementById('cpu-control-status');
    status.textContent = "Applying...";
    status.style.color = "#FF9F0A";
    
    try {
        const applyPromises = cpuCgroups.map(async (cgroup) => {
            const safeName = cgroup.name.replace(/[^a-zA-Z0-9_-]/g, '_');
            const slider = document.getElementById(`${safeName}-cpu-share-slider`);
            const value = parseInt(slider?.value) || cgroup.default;
            
            // Safety validation
            if (value < 10 || value > 16384) {
                throw new Error(`Invalid value for ${cgroup.name}: ${value}`);
            }
            
            // Save to SD card
            await exec(`su -c "mkdir -p /sdcard/MTK_AI_Engine && echo '${value}' > /sdcard/MTK_AI_Engine/cpu_${cgroup.name}_share.txt"`);
            
            // Apply to cgroup
            await exec(`su -c "echo '${value}' > '${cgroup.path}' 2>/dev/null"`);
        });
        
        await Promise.all(applyPromises);
        
        status.textContent = `Applied to ${cpuCgroups.length} cgroups`;
        status.style.color = "#32D74B";
        updateStatusMsg(`CPU Control Applied to ${cpuCgroups.length} cgroups`, "#32D74B");
        
    } catch (error) {
        status.textContent = "Apply Failed";
        status.style.color = "#FF453A";
        console.error("CPU Control Error:", error);
    }
    
    setTimeout(() => {
        status.textContent = "Status: Ready";
        status.style.color = "#666";
    }, 3000);
}

// Add this to your update function
function updateCpuShareDisplay(safeName) {
    const slider = document.getElementById(`${safeName}-cpu-share-slider`);
    const display = document.getElementById(`${safeName}-cpu-share-val`);
    if (slider && display) {
        display.textContent = slider.value;
        
        // Add visual feedback when user adjusts
        display.style.color = '#007AFF'; // Blue when adjusting
        setTimeout(() => {
            display.style.color = 'white'; // Back to normal after 1 second
        }, 1000);
    }
}

// When creating your popup element
const popup = document.createElement('div');
popup.className = 'app-popup';
popup.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 75vh;
    max-height: 75vh;
    background: #121212;
    z-index: 10000;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    border-radius: 0;
    padding: 16px;
`;

// --- FEATURE MAPPING & SYSTEM READY DETECTION ---
let featureMap = new Map();
let systemReady = false;

// List of all toggleable features (add your actual IDs)
const toggleFeatures = [
    'enable_trim', 'enable_bypass', 'enable_cleaner', 'enable_auto_freq', 
    'disable_zram', 'enable_performance', 'enable_notifications',
    'enable_limiter', 'enable_highframerate', 'enable_disable_thermal',
    'enable_gaming_prop',
    'enable_gaming_prop2', 'enable_cpu', 'enable_lite_gaming', 'enable_smart_powersave'
];

// CPU frequency sliders
const sliderFeatures = [
    'global-scaling-slider', 'touch-active-freq-slider', 'inactive-freq-slider',
    'cpu-freq-slider', 'eem-offset-slider', 'saturation_slider'
];

// Dynamic button containers
const dynamicContainers = [
    'dynamic-refresh-buttons', 'dynamic-governor-buttons', 'dynamic-renderer-buttons'
];

// Initialize feature mapping
function initializeFeatureMap() {
    // Map toggle switches
    toggleFeatures.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            featureMap.set(id, {
                type: 'toggle',
                element: element,
                ready: false,
                value: element.checked
            });
        }
    });
    
    // Map sliders
    sliderFeatures.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            featureMap.set(id, {
                type: 'slider',
                element: element,
                ready: false,
                value: element.value
            });
        }    });
    
    // Map dynamic containers
    dynamicContainers.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            featureMap.set(id, {
                type: 'container',
                element: element,
                ready: false,
                content: element.innerHTML
            });
        }
    });
}

// Check if all features are loaded and ready
function checkSystemReady() {
    let allReady = true;
    
    // Check if all toggle elements exist and have proper values
    toggleFeatures.forEach(id => {
        const feature = featureMap.get(id);
        if (!feature || !feature.element) {
            allReady = false;
        }
    });
    
    // Check if all slider elements exist
    sliderFeatures.forEach(id => {
        const feature = featureMap.get(id);
        if (!feature || !feature.element) {
            allReady = false;
        }
    });
    
    // Check if dynamic containers are populated
    dynamicContainers.forEach(id => {
        const feature = featureMap.get(id);
        if (!feature || !feature.element || feature.element.innerHTML.includes('Loading')) {
            allReady = false;
        }
    });
    
    return allReady;
}

// Show system ready popup
function showSystemReadyPopup() {
    if (systemReady) return; // Don't show multiple times    
    const popup = document.createElement('div');
    popup.className = 'system-ready-popup';
    popup.textContent = '✅ System Ready! All features loaded and ready to toggle.';
    document.body.appendChild(popup);
    
    // Remove popup after animation completes
    setTimeout(() => {
        if (popup.parentNode) {
            popup.parentNode.removeChild(popup);
        }
    }, 5000);
    
    systemReady = true;
    console.log('MTK AI Engine: System fully loaded and ready!');
}

// Monitor system readiness
async function monitorSystemReadiness() {
    let attempts = 0;
    const maxAttempts = 30; // Wait up to 30 seconds
    
    const checkInterval = setInterval(async () => {
        attempts++;
        
        // Initialize feature map on first attempt
        if (attempts === 1) {
            initializeFeatureMap();
        }
        
        // Check if system is ready
        if (checkSystemReady()) {
            clearInterval(checkInterval);
            showSystemReadyPopup();
            return;
        }
        
        // Stop checking after max attempts
        if (attempts >= maxAttempts) {
            clearInterval(checkInterval);
            console.warn('MTK AI Engine: System may not be fully ready');
        }
        
    }, 1000); // Check every second
}

// Update timeout display
function updateTimeoutDisplay(value) {
    document.getElementById('touch-timeout-val').textContent = value + 's';
}

// Save timeout to file
async function saveTouchTimeout() {
    const timeoutValue = document.getElementById('touch-timeout-slider').value;
    await exec(`echo "${timeoutValue}" > /sdcard/MTK_AI_Engine/touch_timeout.txt`);
    updateTimeoutDisplay(timeoutValue);
}

// Load saved timeout
async function loadTouchTimeout() {
    try {
        const savedTimeout = await exec(`cat /sdcard/MTK_AI_Engine/touch_timeout.txt 2>/dev/null`);
        const timeoutValue = savedTimeout.trim() || "5";
        const validTimeout = Math.max(3, Math.min(10, parseInt(timeoutValue) || 5));
        document.getElementById('touch-timeout-slider').value = validTimeout;
        updateTimeoutDisplay(validTimeout);
    } catch (e) {
        // Default to 5 seconds
        document.getElementById('touch-timeout-slider').value = 5;
        updateTimeoutDisplay(5);
    }
}

// Setup timeout slider events
document.addEventListener('DOMContentLoaded', () => {
    const timeoutSlider = document.getElementById('touch-timeout-slider');
    if (timeoutSlider) {
        // Load saved value
        loadTouchTimeout();
        
        // Real-time display update
        timeoutSlider.oninput = function() {
            updateTimeoutDisplay(this.value);
        };
        
        // Save when released
        timeoutSlider.onchange = saveTouchTimeout;
    }
});

// Start monitoring when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Small delay to ensure all elements are rendered
    setTimeout(monitorSystemReadiness, 15000);});

// Optional: Manual trigger function
function forceSystemReadyCheck() {
    initializeFeatureMap();
    if (checkSystemReady()) {
        showSystemReadyPopup();
        return true;
    }
    return false;
}

// Make Apps tab header collapsible
document.addEventListener('DOMContentLoaded', function() {
    const appsHeader = document.querySelector('#apps-tab .section-header');
    const appsContent = document.getElementById('app-list-container');
    
    if (appsHeader && appsContent) {
        // Set initial state
        appsContent.style.maxHeight = appsContent.scrollHeight + 'px';
        appsContent.style.transition = 'max-height 0.3s ease';
        
        // Add collapse toggle
        appsHeader.style.cursor = 'pointer';
        appsHeader.addEventListener('click', function() {
            if (appsContent.style.maxHeight === '0px' || !appsContent.style.maxHeight) {
                // Expand
                appsContent.style.maxHeight = appsContent.scrollHeight + 'px';
            } else {
                // Collapse
                appsContent.style.maxHeight = '0px';
            }
        });
    }
});

// Load manual override components
loadRefreshModesForButtons();   // Refresh rate buttons
loadGovernorButtons();         // Governor buttons  
loadRendererButtons();         // Renderer buttons
loadSavedGlobalScaling();      // Scaling slider (NEW)

document.addEventListener("DOMContentLoaded", () => setTimeout(init, 500));
