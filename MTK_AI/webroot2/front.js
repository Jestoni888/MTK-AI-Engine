(function() {
'use strict';
// ============ GLOBAL STATE ============
 const state = {
     currentPage: 'home',
     servicesEnabled: true,
     refreshRate: '120 Hz',
     cpuUsage: 0,
     gpuUsage: 0,
     ramUsage: 0,
     batteryLevel: 0,
     totalRamGB: '0.00',
     usedRamGB: '0.00',
     cpuFreqGhz: '0.00 GHz',
     gpuFreq: 0,
     lastPathCheck: 0,
     pathStatus: null,
     consoleLoaded: false,
     deviceInfo: {
         name: 'Detecting...',
         codename: '...',
         android: '...',
         chipset: 'Detecting...',
         ram: '...',
         storage: '...',
         kernel: '...',
         uptime: '...'
     },
     currentProfile: 'balance',
     profileLocked: false
 };
 // ============ PERFORMANCE PATHS DATABASE ============
 const PERFORMANCE_PATHS = {
     mtk: [
         '/proc/cpufreq/cpufreq_cci_mode', '/proc/cpufreq/cpufreq_power_mode',
         '/proc/cpufreq/cpufreq_freq_idx', '/proc/cpufreq/cpufreq_opp_idx',
         '/proc/gpufreqv2/gpufreq_status', '/proc/gpufreqv2/gpufreq_opp_freq',
         '/sys/kernel/ged/hal/gpu_utilization', '/sys/kernel/ged/hal/current_freq',
         '/sys/kernel/ged/hal/boost_idx', '/proc/mtk_mali/gpu_memory',
         '/proc/mtk_cpufreq/cpufreq_table', '/proc/cpuidle/cpuidle_state*/name',
         '/proc/cpuidle/cpuidle_state*/residency',
         '/sys/module/mtk_ppm/parameters/ppm_enabled',
         '/sys/module/mtk_ppm/parameters/ppm_policy'
     ],
     cpu: [
         '/sys/devices/system/cpu/cpufreq/policy0/scaling_cur_freq',
         '/sys/devices/system/cpu/cpufreq/policy0/scaling_max_freq',
         '/sys/devices/system/cpu/cpufreq/policy0/scaling_min_freq',
         '/sys/devices/system/cpu/cpufreq/policy0/scaling_governor',
         '/sys/devices/system/cpu/cpufreq/policy0/scaling_available_frequencies',
         '/sys/devices/system/cpu/cpufreq/policy0/scaling_available_governors',
         '/sys/devices/system/cpu/cpu0/cpufreq/scaling_cur_freq',
         '/sys/devices/system/cpu/cpu4/cpufreq/scaling_cur_freq',
         '/sys/devices/system/cpu/cpu7/cpufreq/scaling_cur_freq',
         '/sys/devices/system/cpu/cpu*/cpufreq/scaling_cur_freq',
         '/sys/devices/system/cpu/cpu*/online',
         '/sys/devices/system/cpu/possible', '/sys/devices/system/cpu/present'
     ],
     gpu: [
         '/sys/class/devfreq/soc:gpu/cur_freq', '/sys/class/devfreq/soc:gpu/load',
         '/sys/class/devfreq/soc:gpu/available_frequencies',
         '/sys/class/devfreq/13000000.mali/cur_freq',
         '/sys/class/devfreq/17000000.mali/cur_freq',
         '/sys/class/devfreq/*/cur_freq',
         '/sys/class/kgsl/kgsl-3d0/devfreq/cur_freq',
         '/sys/class/kgsl/kgsl-3d0/gpuclk',
         '/sys/class/misc/mali0/gpu_usage', '/sys/kernel/debug/gpu/gpu_load'
     ],
     io: [
         '/sys/block/mmcblk0/queue/scheduler', '/sys/block/mmcblk0/queue/read_ahead_kb',
         '/sys/block/mmcblk0/queue/nr_requests', '/sys/block/mmcblk0/queue/rq_affinity',
         '/sys/block/sda/queue/scheduler', '/sys/block/sda/queue/read_ahead_kb',
         '/sys/block/*/queue/scheduler', '/sys/block/*/queue/read_ahead_kb',
         '/sys/block/*/queue/rotational', '/sys/class/block/*/queue/scheduler'
     ],
     thermal: [
         '/sys/class/thermal/thermal_zone0/temp',
         '/sys/class/thermal/thermal_zone0/type',
         '/sys/class/thermal/thermal_zone0/policy',
         '/sys/class/thermal/thermal_zone0/trip_point_0_temp',
         '/sys/class/thermal/thermal_zone*/mode',
         '/sys/class/thermal/thermal_message',
         '/sys/devices/virtual/thermal/thermal_message',
         '/sys/class/thermal/thermal_zone*/temp',
         '/sys/class/thermal/thermal_zone*/type',
         '/sys/devices/virtual/thermal/cooling_device*/cur_state',
         '/sys/devices/virtual/thermal/cooling_device*/max_state',
         '/proc/thermal_policy/00'
     ],
     power: [
         '/sys/class/power_supply/battery/capacity', '/sys/class/power_supply/battery/temp',
         '/sys/class/power_supply/battery/voltage_now',
         '/sys/class/power_supply/battery/current_now',
         '/sys/class/power_supply/battery/power_now',
         '/sys/class/power_supply/battery/status',
         '/sys/class/power_supply/battery/health',
         '/sys/class/power_supply/*/status', '/sys/class/power_supply/*/type',
         '/sys/class/power_supply/*/voltage_now',
         '/sys/class/power_supply/*/current_now', '/proc/mtk_battery_cmd/cmd'
     ],
     scheduler: [
         '/proc/sys/kernel/sched_boost',
         '/proc/sys/kernel/sched_min_task_util_for_colocation',
         '/proc/sys/kernel/sched_util_clamp_min',
         '/proc/sys/kernel/sched_util_clamp_max',
         '/proc/sys/kernel/sched_util_clamp_min_rt_default',
         '/proc/sys/kernel/walt_rtg_cfs_boost_prio',
         '/proc/sys/kernel/walt_fair_ravg_window',
         '/dev/cpuset/foreground/cpus', '/dev/cpuset/background/cpus',
         '/dev/cpuset/top-app/cpus', '/dev/cpuset/restricted/cpus',
         '/dev/stune/top-app/cpus', '/dev/stune/foreground/cpus',
         '/dev/stune/background/cpus',
         '/proc/sys/kernel/sched_walt_rotate_big_tasks'
     ],
     memory: [
         '/proc/meminfo', '/proc/vmstat', '/proc/zoneinfo',
         '/sys/module/lowmemorykiller/parameters/minfree',
         '/sys/module/lowmemorykiller/parameters/adj',
         '/sys/module/lowmemorykiller/parameters/cost',
         '/sys/module/lowmemorykiller/parameters/debug_level',
         '/sys/module/ashmem/parameters/ashmem_enable_ump',
         '/proc/sys/vm/swappiness', '/proc/sys/vm/vfs_cache_pressure',
         '/proc/sys/vm/dirty_ratio', '/proc/sys/vm/dirty_background_ratio'
     ],
     graphics: [
         '/sys/class/drm/card0/device/gpu_busy_percent',
         '/sys/kernel/debug/dri/0/amdgpu_pm_info',
         '/sys/kernel/debug/gpu/power', '/proc/driver/mtk_gpu_info',
         '/sys/class/drm/version', '/vendor/etc/egl/egl.cfg'
     ],
     logcat: [
         '/dev/log/main', '/dev/log/system', '/dev/log/events',
         '/dev/log/radio', '/dev/log/crash', '/proc/sys/kernel/printk',
         '/proc/kmsg', '/sys/kernel/debug/tracing/trace',
         '/sys/kernel/debug/tracing/available_tracers'
     ],
     network: [
         '/proc/net/wireless', '/sys/class/net/wlan0/operstate',
         '/sys/class/net/wlan0/speed', '/data/misc/wifi/wpa_supplicant.conf',
         '/proc/sys/net/ipv4/tcp_congestion_control',
         '/proc/sys/net/core/wmem_max', '/proc/sys/net/core/rmem_max'
     ]
 };
 const CRITICAL_PATHS = {
     mtk: ['/proc/cpufreq/cpufreq_power_mode', '/sys/kernel/ged/hal/gpu_utilization'],
     cpu: ['/sys/devices/system/cpu/cpufreq/policy0/scaling_cur_freq'],
     gpu: ['/sys/class/devfreq/soc:gpu/cur_freq'],
     thermal: ['/sys/class/thermal/thermal_zone0/temp'],
     power: ['/sys/class/power_supply/battery/capacity'],
     logcat: ['/dev/log/main']
 };
 const pathStatusCache = {};
 // ============ PROFILE MODES CONFIGURATION ============
 // ============ PROFILE MODES CONFIGURATION ============
const PROFILE_MODES = {
    performance: {
        label: 'PERFORMANCE',
        color: '#FF3B30',
        desc: 'Max clocks • Thermal disabled • Aggressive boost • Can cause auto reboot • Automode stops',
        commands: `su -c "pkill -9 -f '/data/adb/modules/MTK_AI' 2>/dev/null"; export LD_LIBRARY_PATH=/data/adb/modules/MTK_AI/lib64:$LD_LIBRARY_PATH; su -c 'export PATH="/system/bin:/system/xbin:/sbin:/vendor/bin:$PATH"; cd /data/adb/modules/MTK_AI; nohup /data/adb/modules/MTK_AI/main_control/mode "performance mode" >/dev/null 2>&1 &'; nohup sh /data/adb/modules/MTK_AI/service.sh >/dev/null 2>&1 &`
    },
    balance: {
        label: 'BALANCE',
        color: '#FF9500',
        desc: 'schedutil • Normal thermal • Smart switch on gaming/normal',
        commands: `su -c "pkill -9 -f '/data/adb/modules/MTK_AI' 2>/dev/null"; rm -f /sdcard/MTK_AI_Engine/enable_limiter; su -c 'export PATH="/system/bin:/system/xbin:/sbin:/vendor/bin:$PATH"; cd /data/adb/modules/MTK_AI; nohup sh /data/adb/modules/MTK_AI/service.sh >/dev/null 2>&1 & disown'`
    },
    powersave: {
        label: 'POWERSAVE',
        color: '#34C759',
        desc: 'schedutil • Frequency relax • Offset -10 • Smart switch on gaming/normal',
        commands: `su -c "pkill -9 -f '/data/adb/modules/MTK_AI' 2>/dev/null"; touch /sdcard/MTK_AI_Engine/enable_limiter 2>/dev/null; echo "1" > /sdcard/MTK_AI_Engine/enable_limiter 2>/dev/null; su -c 'export PATH="/system/bin:/system/xbin:/sbin:/vendor/bin:$PATH"; cd /data/adb/modules/MTK_AI; nohup sh /data/adb/modules/MTK_AI/service.sh >/dev/null 2>&1 & disown'`
    }
};
// ============ STATE FILE MANAGEMENT ============
const STATE_FILE_PATH = '/sdcard/MTK_AI_Engine/automode';
const PROFILE_FILE_PATH = '/sdcard/MTK_AI_Engine/current_profile';
async function saveServicesState(enabledOrMode) {
try {
await exec(`mkdir -p /sdcard/MTK_AI_Engine 2>/dev/null`);
let val = (typeof enabledOrMode === 'number') ? enabledOrMode : (enabledOrMode ? 1 : 0);
await exec(`echo "${val}" > "${STATE_FILE_PATH}" 2>/dev/null`);
return true;
} catch (e) { console.error('Failed to save services state:', e); return false; }
}
async function loadServicesState() {
try {
const result = await exec(`cat "${STATE_FILE_PATH}" 2>/dev/null`);
const val = result.trim();
if (val === '1' || val === '2') return true;
if (val === '0') return false;
return null;
} catch (e) { console.error('Failed to load services state:', e); return null; }
}
async function saveProfileState(profile) {
try {
await exec(`mkdir -p /sdcard/MTK_AI_Engine 2>/dev/null`);
await exec(`echo "${profile}" > "${PROFILE_FILE_PATH}" 2>/dev/null`);
return true;
} catch (e) { console.error('Failed to save profile state:', e); return false; }
}
async function loadProfileState() {
try {
const result = await exec(`cat "${PROFILE_FILE_PATH}" 2>/dev/null`);
const val = result.trim().toLowerCase();
if (PROFILE_MODES[val]) return val;
return null;
} catch (e) { console.error('Failed to load profile state:', e); return null; }
}
// ============ SAFE EXEC WRAPPER ============
 async function exec(command, timeout = 10000) {
     return new Promise((resolve) => {
         const callback = `exec_cb_${Date.now()}_${Math.random().toString(36).substring(2)}`;
         const timer = setTimeout(() => { if (window[callback]) delete window[callback]; resolve(''); }, timeout);
         window[callback] = (success, result) => {
             clearTimeout(timer);
             if (window[callback]) delete window[callback];
             resolve(result || '');
         };
         if (window.ksu && typeof ksu.exec === 'function') {
             try { ksu.exec(command, `window.${callback}`); } 
             catch (e) { clearTimeout(timer); if (window[callback]) delete window[callback]; resolve(''); }
         } else { clearTimeout(timer); if (window[callback]) delete window[callback]; resolve(''); }
     });
 }
 // ============ TERMINAL & UI STYLES ============
 function injectTerminalStyles() {
     if (document.getElementById('terminal-styles')) return;
     const style = document.createElement('style');
     style.id = 'terminal-styles';
     style.textContent = `
         .terminal-container { 
             background: #000 !important; color: #e5e5e5 !important;
             font-family: 'Courier New', Courier, monospace !important;
             font-size: 11px !important; line-height: 1.4 !important;
             padding: 8px !important; border: 1px solid #333 !important;
             white-space: pre-wrap !important; word-wrap: break-word !important;
             max-height: 200px !important; overflow-y: auto !important;
             -webkit-overflow-scrolling: touch !important; user-select: text !important;
             cursor: pointer !important; transition: border-color 0.2s !important;
         }
         .terminal-container:hover { border-color: #32D74B !important; }
         .terminal-container.loading { opacity: 0.7; cursor: wait !important; }
         .terminal-container .t-cyan { color: #11a8cd; } 
         .terminal-container .t-white { color: #e5e5e5; } 
         .terminal-container .t-gray { color: #888888; }
         .terminal-container .t-red { color: #cd3131; }
         .terminal-container .t-bright-cyan { color: #3bc7e5; font-weight: bold; }
         .terminal-container .t-bright-green { color: #23d18b; font-weight: bold; }
         .terminal-container .t-bright-yellow { color: #f5f543; font-weight: bold; }
         .terminal-container .t-bright-red { color: #f14c4c; font-weight: bold; }
         .terminal-container .term-line { display: flex; margin: 1px 0; align-items: flex-start; }
         .terminal-container .term-label { width: 65px; flex-shrink: 0; color: #3bc7e5; font-weight: bold; font-size: 10px; }
         .terminal-container .term-path { color: #f14c4c; margin-right: 4px; }
         .terminal-container .term-arrow { color: #555; margin: 0 3px; }
         .terminal-container .term-value { color: #e5e5e5; font-size: 10px; max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
         .terminal-container .term-status { margin-left: auto; font-weight: bold; font-size: 9px; }
         .terminal-container::-webkit-scrollbar { width: 5px; }
         .terminal-container::-webkit-scrollbar-thumb { background: #444; border-radius: 3px; }
         .terminal-btn {
             background: rgba(50,215,75,0.15); border: 1px solid rgba(50,215,75,0.4);
             color: #32D74B; padding: 6px 12px; font-family: monospace; font-size: 11px;
             border-radius: 4px; cursor: pointer; width: 100%; margin-top: 8px;
             -webkit-tap-highlight-color: transparent; transition: all 0.1s;
         }
         .terminal-btn:active { background: rgba(50,215,75,0.3); transform: scale(0.98); }
         .terminal-btn:disabled { opacity: 0.5; cursor: not-allowed; }
         .console-hint {
             text-align: center; color: #888; font-size: 10px; padding: 12px 8px;
             font-style: italic; border: 1px dashed #444; border-radius: 4px;
         }
         .profile-card {
             background: #1a1a1a;
             border-radius: 16px;
             padding: 16px;
             border: 1px solid #2a2a2a;
             margin-top: 12px;
             grid-column: 1 / -1;
         }
         .profile-header {
             display: flex;
             align-items: center;
             gap: 8px;
             margin-bottom: 12px;
         }
         .profile-icon { font-size: 18px; }
         .profile-title {
             font-size: 12px; font-weight: 700; color: #fff;
             text-transform: uppercase; letter-spacing: 0.5px;
         }
         .profile-toggle {
             display: flex; gap: 8px; padding: 4px;
             background: #111; border-radius: 12px; border: 1px solid #333;
         }
         .profile-btn {
             flex: 1; padding: 12px 4px; border: 2px solid transparent;
             border-radius: 8px; background: #1a1a1a; color: #666;
             font-size: 11px; font-weight: 700; text-align: center;
             cursor: pointer; transition: all 0.2s; text-transform: uppercase;
             letter-spacing: 0.5px;
         }
         .profile-btn:hover { background: #252525; }
         .profile-btn.active {
             border-color: currentColor; background: rgba(255,255,255,0.1);
             color: inherit !important; box-shadow: 0 0 15px rgba(0,0,0,0.5);
         }
         .profile-btn[data-mode="performance"] { color: #FF3B30; }
         .profile-btn[data-mode="balance"] { color: #FF9500; }
         .profile-btn[data-mode="powersave"] { color: #34C759; }
         .profile-desc {
             text-align: center; font-size: 10px; color: #666;
             padding: 10px 8px 4px; min-height: 24px;
             transition: color 0.3s;
         }
         .profile-locked {
             text-align: center; font-size: 9px; color: #888;
             padding: 4px; background: rgba(255,255,255,0.05);
             border-radius: 4px; margin-top: 8px; display: none;
         }
         .apply-btn {
             background: linear-gradient(135deg, #32D74B, #30B0C7);
             border: none; color: #000; padding: 12px 24px;
             font-weight: 700; border-radius: 8px; cursor: pointer;
             width: 100%; margin-top: 12px; font-size: 12px;
             text-transform: uppercase; letter-spacing: 1px;
             transition: transform 0.1s, box-shadow 0.1s;
         }
         .apply-btn:active { transform: scale(0.98); }
         .apply-btn:disabled { background: #333; color: #666; cursor: not-allowed; transform: none; }
         .apply-btn.applying {
             background: linear-gradient(135deg, #FF9500, #FF3B30);
             color: #fff; animation: pulse 1s infinite;
         }
         @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.7; } }
     `;
     document.head.appendChild(style);
 }
 // ============ PROFILE UI RENDERING ============
 function injectProfileToggle() {
     const servicesCard = document.querySelector('.status-card') || document.getElementById('mtk-services-card')?.closest('.status-card');
     const systemStatusSection = document.querySelector('.system-status') || document.querySelector('.system-status-section');
     let container = null;
     if (systemStatusSection) {
         container = systemStatusSection;
     } else {
         if (servicesCard) {
             container = servicesCard.parentElement;
         }
     }
     if (container) {
         const div = document.createElement('div');
         div.className = 'profile-card';
         div.innerHTML = `
             <div class="profile-header">
                 <span class="profile-icon"></span>
                 <span class="profile-title">MASTER MODE</span>
             </div>
             <div class="profile-toggle" id="profile-toggle-group">
                 <button class="profile-btn" data-mode="performance" onclick="selectProfile('performance')">PERF</button>
                 <button class="profile-btn" data-mode="balance" onclick="selectProfile('balance')">BALANCE</button>
                 <button class="profile-btn" data-mode="powersave" onclick="selectProfile('powersave')">SAVE</button>
             </div>
             <div class="profile-desc" id="profile-desc">Select a mode to optimize your device</div>
             <div class="profile-locked" id="profile-locked">🔒 Applying changes... Please wait</div>
             <button class="apply-btn" id="apply-profile-btn" onclick="applyProfile()">ACTIVATE</button>
         `;
         if (container.lastChild && container.lastChild.classList.contains('profile-card')) {
             container.removeChild(container.lastChild);
         }
         const refNode = document.getElementById('refresh-rate-overlay-card')?.closest('.status-card') || 
                         (document.getElementById('mtk-services-card')?.closest('.status-card') || container.lastChild);
         if (refNode) {
             refNode.after(div);
         } else {
             container.appendChild(div);
         }
         updateProfileUI();
     }
 }
 function updateProfileUI() {
     const mode = state.currentProfile;
     const config = PROFILE_MODES[mode];
     document.querySelectorAll('.profile-btn').forEach(btn => {
         const btnMode = btn.dataset.mode;
         const isActive = btnMode === mode;
         btn.classList.toggle('active', isActive);
         if (isActive) {
             btn.style.setProperty('--glow-color', config.color);
         }
     });
     const descEl = document.getElementById('profile-desc');
     if (descEl) {
         descEl.textContent = config.desc;
         descEl.style.color = config.color;
     }
     const applyBtn = document.getElementById('apply-profile-btn');
     if (applyBtn) {
         applyBtn.textContent = `ACTIVATE ${config.label.toUpperCase()}`;
     }
 }
 // ============ PROFILE FUNCTIONS ============
 window.selectProfile = function(mode) {
     if (!PROFILE_MODES[mode]) return;
     if (state.profileLocked) return;
     state.currentProfile = mode;
     updateProfileUI();
 };
 window.applyProfile = async function() {
     if (state.profileLocked) return;
     const mode = state.currentProfile;
     const config = PROFILE_MODES[mode];
     const btn = document.getElementById('apply-profile-btn');
     const lockMsg = document.getElementById('profile-locked');
     if (!btn) return;
     state.profileLocked = true;
     btn.disabled = true;
     btn.classList.add('applying');
     btn.textContent = 'APPLYING...';
     lockMsg.style.display = 'block';
     showStatus(`⚡ Applying ${config.label}...`, config.color);
     addConsoleMessage('[PROFILE]', `Applying ${config.label} mode...`, 't-bright-yellow');
     try {
         await exec(config.commands);
         await saveProfileState(mode);
         showStatus(`✅ ${config.label} mode active`, config.color);
         addConsoleMessage('[PROFILE]', `${config.label} applied successfully`, 't-bright-green');
         updateProfileUI();
     } catch (e) {
         showStatus(`❌ Failed: ${e.message}`, '#FF3B30');
         addConsoleMessage('[ERROR]', `Profile apply failed: ${e.message}`, 't-bright-red');
     } finally {
         setTimeout(() => {
             state.profileLocked = false;
             btn.disabled = false;
             btn.classList.remove('applying');
             lockMsg.style.display = 'none';
             updateProfileUI();
         }, 2000);
     }
 };
 // ============ INLINE CONSOLE FUNCTIONS ============
 function renderInlineConsole(results) {
     if (!results) return '<div class="console-hint">👆 Tap to load system paths scan</div>';
     const { summary, categories } = results;
     const pct = Math.round((summary.accessible / Math.max(1, summary.total)) * 100);
     let html = `<div class="terminal-container" style="max-height: 500px;">`;
     html += `<div class="term-line"><span class="term-label t-bright-cyan">[MTK-AI]</span><span class="t-white">${summary.accessible}/${summary.total} paths OK (${pct}%)</span></div>`;
     const hasLog = categories.logcat?.some(p => p.readable);
     html += `<div class="term-line"><span class="term-label t-bright-cyan">[LOGCAT]</span><span class="${hasLog ? 't-bright-green' : 't-bright-red'}">${hasLog ? 'Active' : 'Blocked'}</span></div>`;
     html += `<div class="term-line"><span class="term-label t-bright-cyan">[MODE]</span><span class="t-white" style="color: ${PROFILE_MODES[state.currentProfile].color}">${PROFILE_MODES[state.currentProfile].label}</span></div>`;
     for (const [cat, items] of Object.entries(categories)) {
         const readable = items.filter(i => i.readable);
         if (readable.length > 0) {
             readable.forEach(item => {
                 const shortPath = item.originalPath.split('/').pop();
                 let displayValue = item.value ? item.value.substring(0, 40) : 'N/A';
                 let statusClass = 't-bright-green';
                 let statusText = '[OK]';
                 if (shortPath === 'mode' && cat === 'thermal') {
                     if (item.value?.trim() === 'disabled') { statusClass = 't-bright-red'; statusText = '[DISABLED]'; } 
                     else if (item.value?.trim() === 'enabled') { statusClass = 't-bright-cyan'; statusText = '[ENABLED]'; }
                 }
                 html += `<div class="term-line"><span class="term-label t-gray">[${cat}]</span><span class="term-path t-red">${shortPath}</span><span class="term-arrow">→</span><span class="term-value">${displayValue}</span><span class="term-status ${statusClass}">${statusText}</span></div>`;
             });
         }
     }
     html += `</div>`;
     return html;
 }
 function updateInlineConsole(results) {
     const container = document.getElementById('inline-console');
     const statusEl = document.getElementById('console-status');
     if (container && results) {
         container.innerHTML = renderInlineConsole(results);
         container.classList.remove('loading');
         container.scrollTop = container.scrollHeight;
     }
     if (statusEl && results?.summary) {
         const { summary } = results;
         const pct = Math.round((summary.accessible / Math.max(1, summary.total)) * 100);
         statusEl.textContent = `${summary.accessible}/${summary.total} accessible (${pct}%)`;
         statusEl.style.color = pct >= 70 ? 'var(--accent-green)' : pct >= 40 ? 'var(--accent-yellow)' : 'var(--accent-red)';
     }
 }
 function addConsoleMessage(prefix, message, colorClass) {
     const consoleEl = document.getElementById('inline-console');
     if (consoleEl) {
         const hint = consoleEl.querySelector('.console-hint');
         if (hint) hint.remove();
         const line = document.createElement('div');
         line.className = 'term-line';
         line.innerHTML = `<span class="term-label ${colorClass}">${prefix}</span><span class="t-white">${message}</span>`;
         consoleEl.appendChild(line);
         consoleEl.scrollTop = consoleEl.scrollHeight;
     }
 }
 async function loadConsoleOnDemand() {
     if (state.consoleLoaded) return;
     const container = document.getElementById('inline-console');
     if (!container) return;
     container.classList.add('loading');
     container.innerHTML = '<div class="console-hint">⏳ Scanning paths...</div>';
     try {
         addConsoleMessage('[SCAN]', 'Checking critical paths...', 't-yellow');
         const criticalResults = await checkCriticalPaths();
         state.pathStatus = criticalResults;
         updateInlineConsole(criticalResults);
         addConsoleMessage('[SCAN]', `Critical: ${criticalResults.summary.accessible}/${criticalResults.summary.total} OK`, 't-bright-green');
         setTimeout(async () => {
             try {
                 const fullResults = await checkPerformancePaths();
                 state.pathStatus = fullResults;
                 updateInlineConsole(fullResults);
                 addConsoleMessage('[BG]', `Full: ${fullResults.summary.accessible}/${fullResults.summary.total}`, 't-bright-green');
             } catch (e) { 
                 addConsoleMessage('[ERROR]', `Scan failed: ${e.message}`, 't-bright-red'); 
             }
         }, 100);
         state.consoleLoaded = true;
         addConsoleMessage('[READY]', 'Console active', 't-bright-green');
     } catch (e) {
         container.innerHTML = `<div class="console-hint t-bright-red">❌ Error: ${e.message}</div>`;
         container.classList.remove('loading');
     }
 }
 // ============ PATH CHECKING FUNCTIONS ============
 async function checkPathStatus(path, timeout = 1000) {
     return new Promise(async (resolve) => {
         const timer = setTimeout(() => resolve({ exists: false, readable: false, path, value: null }), timeout);
         try {
             if (path.includes('*')) {
                 const globResult = await exec(`for f in ${path}; do [ -r "$f" ] && echo "$f:$(cat "$f" 2>/dev/null | head -c 30)"; done 2>/dev/null`);
                 clearTimeout(timer);
                 if (globResult && globResult.trim()) {
                     const lines = globResult.trim().split('\n').filter(l => l.includes(':'));
                     const results = [];
                     for (const line of lines) {
                         const [filePath, ...valueParts] = line.split(':');
                         const value = valueParts.join(':').trim();
                         if (value) {
                             results.push({
                                 exists: true, readable: true, path: filePath.trim(),
                                 originalPath: path, value: value.replace(/\s+/g, ' ')
                             });
                         }
                     }
                     if (results.length > 0) {
                         if (path.includes('/mode') && path.includes('thermal')) {
                             const allModes = results.map(r => r.value.trim()).filter(v => v);
                             resolve({
                                 exists: true, readable: allModes.length > 0,
                                 path: path, originalPath: path, value: allModes.join(', '), isCombined: true
                             });
                         } else { resolve(results[0]); }
                     } else { resolve({ exists: false, readable: false, path, originalPath: path, value: null }); }
                 } else { resolve({ exists: false, readable: false, path, originalPath: path, value: null }); }
             } else {
                 const testRead = await exec(`cat "${path}" 2>/dev/null | head -c 30`);
                 clearTimeout(timer);
                 resolve({ 
                     exists: testRead !== '', readable: testRead.trim() !== '', 
                     path, originalPath: path, value: testRead.trim().replace(/\s+/g, ' ') 
                 });
             }
         } catch (e) { 
             clearTimeout(timer); 
             resolve({ exists: false, readable: false, path, originalPath: path, value: null, error: e.message }); 
         }
     });
 }
 async function checkCriticalPaths() {
     const results = { timestamp: Date.now(), categories: {}, summary: { total: 0, accessible: 0, restricted: 0, missing: 0 } };
     for (const [category, paths] of Object.entries(CRITICAL_PATHS)) {
         results.categories[category] = [];
         for (const path of paths) {
             const status = await checkPathStatus(path, 500);
             results.categories[category].push(status);
             results.summary.total++;
             if (status.readable) results.summary.accessible++;
             else if (status.exists) results.summary.restricted++;
             else results.summary.missing++;
         }
     }
     return results;
 }
 async function checkPerformancePaths() {
     const results = { timestamp: Date.now(), categories: {}, summary: { total: 0, accessible: 0, restricted: 0, missing: 0 } };
     for (const [category, paths] of Object.entries(PERFORMANCE_PATHS)) {
         results.categories[category] = [];
         for (const path of paths) {
             const cacheKey = path.includes('*') ? path : null;
             if (cacheKey && pathStatusCache[cacheKey]) { results.categories[category].push({...pathStatusCache[cacheKey]}); continue; }
             const status = await checkPathStatus(path);
             if (cacheKey) pathStatusCache[cacheKey] = {...status};
             results.categories[category].push(status);
             results.summary.total++;
             if (status.readable) results.summary.accessible++;
             else if (status.exists) results.summary.restricted++;
             else results.summary.missing++;
         }
     }
     return results;
 }
 // ============ DEVICE INFO ============
 async function loadDeviceInfo() {
     try {
         let name = await exec('getprop ro.product.model');
         if (!name || name.trim() === '') name = await exec('getprop ro.product.marketname');
         if (!name || name.trim() === '') name = await exec('getprop ro.product.device');
         state.deviceInfo.name = name.trim() || 'Unknown Device';
         const codename = await exec('getprop ro.product.device');
         state.deviceInfo.codename = codename.trim() || 'unknown';
         const android = await exec('getprop ro.build.version.release');
         state.deviceInfo.android = android.trim() || '?';
         let chipset = await exec('getprop ro.hardware');
         if (!chipset || chipset.trim() === '') {
             const cpuInfo = await exec('cat /proc/cpuinfo | grep "Hardware" | head -1');
             const match = cpuInfo.match(/Hardware\s*:\s*(.+)/);
             if (match) chipset = match[1].trim();
         }
         state.deviceInfo.chipset = (chipset || 'MTK Platform').trim();
         const memInfo = await exec('cat /proc/meminfo | grep MemTotal');
         const memMatch = memInfo.match(/MemTotal:\s+(\d+)/);
         if (memMatch) {
             const ramGB = parseInt(memMatch[1]) / 1024 / 1024;
             state.deviceInfo.ram = `${ramGB.toFixed(2)} GB`;
             state.totalRamGB = ramGB.toFixed(2);
         }
         const storage = await exec('df /data | tail -1');
         const storageMatch = storage.match(/\s+(\d+)\s+\d+\s+\d+\s+\d+%/);
         if (storageMatch) {
             const storageGB = Math.floor(parseInt(storageMatch[1]) / 1024 / 1024);
             state.deviceInfo.storage = `${storageGB} GB`;
         }
         const kernel = await exec('uname -r');
         state.deviceInfo.kernel = kernel.trim() || 'Unknown';
         const uptime = await exec('cat /proc/uptime');
         const sec = parseFloat(uptime.split(' ')[0]);
         const d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600), m = Math.floor((sec % 3600) / 60);
         state.deviceInfo.uptime = `${d > 0 ? d + 'd ' : ''}${h > 0 ? h + 'h ' : ''}${m}m`.trim();
         updateDeviceInfo();
     } catch (e) { console.error('Device Info Error:', e); }
 }
 function updateDeviceInfo() {
     const map = {
         'device-name': state.deviceInfo.name, 'codename': `codename: ${state.deviceInfo.codename}`,
         'android-version': state.deviceInfo.android, 'chipset': state.deviceInfo.chipset,
         'ram': state.deviceInfo.ram, 'storage': state.deviceInfo.storage,
         'kernel': state.deviceInfo.kernel, 'uptime': state.deviceInfo.uptime
     };
     for (const [id, val] of Object.entries(map)) {
         const el = document.getElementById(id);
         if (el) el.textContent = val;
     }
 }
 // ============ CPU/RAM/GPU PARSERS ============
 async function parseCpuUsage() {
     try {
         const stat1 = await exec('cat /proc/stat | grep "^cpu "');
         await new Promise(r => setTimeout(r, 500));
         const stat2 = await exec('cat /proc/stat | grep "^cpu "');
         const parseStat = (stat) => {
             const values = stat.trim().split(/\s+/).slice(1).map(v => parseInt(v) || 0);
             return { idle: values[3] + values[4], total: values.reduce((a, b) => a + b, 0) };
         };
         const s1 = parseStat(stat1), s2 = parseStat(stat2);
         const idleDiff = s2.idle - s1.idle, totalDiff = s2.total - s1.total;
         if (totalDiff <= 0) return state.cpuUsage;
         return Math.max(0, Math.min(100, Math.round((1 - (idleDiff / totalDiff)) * 100)));
     } catch (e) { return state.cpuUsage; }
 }
 async function parseRamUsage() {
     try {
         const memInfo = await exec('cat /proc/meminfo'), lines = memInfo.split('\n');
         let total = 0, free = 0, buffers = 0, cached = 0, sReclaimable = 0;
         lines.forEach(line => {
             if (line.startsWith('MemTotal:')) { const m = line.match(/(\d+)/); if (m) total = parseInt(m[1]); }
             else if (line.startsWith('MemFree:')) { const m = line.match(/(\d+)/); if (m) free = parseInt(m[1]); }
             else if (line.startsWith('Buffers:')) { const m = line.match(/(\d+)/); if (m) buffers = parseInt(m[1]); }
             else if (line.startsWith('Cached:')) { const m = line.match(/(\d+)/); if (m) cached = parseInt(m[1]); }
             else if (line.startsWith('SReclaimable:')) { const m = line.match(/(\d+)/); if (m) sReclaimable = parseInt(m[1]); }
         });
         const available = free + buffers + cached + sReclaimable, used = Math.max(0, total - available);
         state.totalRamGB = (total / 1024 / 1024).toFixed(2);
         state.usedRamGB = (used / 1024 / 1024).toFixed(2);
         return total > 0 ? Math.round((used / total) * 100) : 0;
     } catch (e) { return state.ramUsage; }
 }
 async function getGPUInfo() {
     let info = { usage: 0, freq: 0, memoryMB: 0 };
     try {
         const gedUtil = await exec('cat /sys/kernel/ged/hal/gpu_utilization 2>/dev/null');
         if (gedUtil?.trim()) {
             for (const v of gedUtil.trim().split(/\s+/)) {
                 const n = parseInt(v); if (!isNaN(n) && n >= 0 && n <= 100) { info.usage = n; break; }
             }
         }
         const gedFreq = await exec('cat /sys/kernel/ged/hal/current_freq 2>/dev/null');
         if (gedFreq?.trim()) {
             const parts = gedFreq.trim().split(/\s+/);
             if (parts.length >= 2) { const f = parseInt(parts[1]); if (f > 100) info.freq = Math.round(f / 1000); }
         }
         const memInfo = await exec('cat /proc/mtk_mali/gpu_memory 2>/dev/null');
         if (memInfo) { const m = memInfo.match(/^mali0\s+(\d+)/m); if (m) info.memoryMB = (parseInt(m[1]) / 1024).toFixed(1); }
         if (info.freq === 0) {
             for (const p of ['/sys/class/devfreq/soc:gpu/cur_freq', '/sys/class/devfreq/13000000.mali/cur_freq', '/proc/gpufreqv2/gpufreq_status']) {
                 const r = await exec(`cat ${p} 2>/dev/null`);
                 if (r) { const nm = r.match(/(\d{5,})/); if (nm) { let v = parseInt(nm[1]); if (v > 10000) v = Math.round(v/1000); if (v > 0 && v < 2000) { info.freq = v; break; } } }
             }
         }
         if (info.usage === 0) {
             for (const p of ['/sys/class/misc/mali0/gpu_usage', '/sys/class/devfreq/soc:gpu/load']) {
                 const r = await exec(`cat ${p} 2>/dev/null`);
                 if (r && !isNaN(parseInt(r.trim()))) { info.usage = parseInt(r.trim()); if (info.usage > 0 && info.usage <= 100) break; }
             }
         }
         if (info.freq === 0) info.freq = 471; if (isNaN(info.usage)) info.usage = 0;
     } catch (e) { console.error('GPU info error:', e); }
     return info;
 }
 // ============ SYSTEM STATUS ============    
 async function loadSystemStatus() {
     try {
         state.cpuUsage = await parseCpuUsage();
         const gpu = await getGPUInfo();
         state.gpuUsage = gpu.usage; state.gpuFreq = gpu.freq;
         state.ramUsage = await parseRamUsage();
         const battCap = await exec('cat /sys/class/power_supply/battery/capacity 2>/dev/null');
         state.batteryLevel = parseInt(battCap.trim()) || 0;
         updateSystemStatus();
     } catch (e) { console.error('System Status Error:', e); }
 }
 function updateSystemStatus() {
     updateCircularProgress('cpu-progress', state.cpuUsage);
     updateCircularProgress('gpu-progress', state.gpuUsage);
     updateCircularProgress('ram-progress', state.ramUsage);
     updateCircularProgress('battery-progress', state.batteryLevel);
     (async () => { try { const f = await exec('cat /sys/devices/system/cpu/cpufreq/policy0/scaling_cur_freq 2>/dev/null'); const el = document.getElementById('cpu-freq'); if (f && el) el.textContent = `${(parseInt(f.trim())/1e6).toFixed(2)} GHz`; } catch(e){} })();
     const gpuEl = document.getElementById('gpu-freq'); if (gpuEl) gpuEl.textContent = `${state.gpuFreq} MHz`;
     const ramEl = document.getElementById('ram-text'); if (ramEl) ramEl.textContent = `${state.usedRamGB} / ${state.totalRamGB} GB`;
     (async () => { try { const t = await exec('cat /sys/class/power_supply/battery/temp 2>/dev/null'); const el = document.getElementById('battery-temp'); if (t && el) { const c = (parseInt(t.trim())/10).toFixed(0); el.textContent = `${c}°C • ${c<35?'Good':c<40?'Warm':'Hot'}`; } } catch(e){} })();
 }
 function updateCircularProgress(id, pct) {
     const el = document.getElementById(id); if (!el) return;
     const circle = el.querySelector('circle.progress-bar'); if (!circle) return;
     const r = circle.r.baseVal.value, c = 2 * Math.PI * r;
     circle.style.strokeDasharray = c; circle.style.strokeDashoffset = c - (Math.max(0, Math.min(100, pct)) / 100) * c;
     const txt = el.querySelector('.progress-text'); if (txt) txt.textContent = `${Math.max(0, Math.min(100, pct))}%`;
 }
 // ============ MTK SERVICES & OVERLAY ============
 let mtkServicesEnabled = false;
window.toggleMTKServices = async function() {
const txt = document.getElementById('mon_services'), dot = document.getElementById('services-status-dot');
try {
const readRes = await exec('cat /sdcard/MTK_AI_Engine/automode 2>/dev/null || echo 0');
let mode = parseInt(readRes.trim()) || 0;
     mode = (mode + 1) % 3;
     await exec(`su -c "mkdir -p /sdcard/MTK_AI_Engine && echo '${mode}' > /sdcard/MTK_AI_Engine/automode"`);
     await exec(`su -c "pkill -9 -f \\"/data/adb/modules/MTK_AI\\" 2>/dev/null"`);
     await exec(`su -c 'export PATH="/system/bin:/system/xbin:/sbin:/vendor/bin"; cd /data/adb/modules/MTK_AI; nohup sh /data/adb/modules/MTK_AI/service.sh >/dev/null 2>&1 & disown'`);
     mtkServicesEnabled = (mode !== 0);
     await saveServicesState(mode);
     let modeText = '', modeColor = '', statusMsg = '';
     if (mode === 0) {
         modeText = 'LITE MODE'; modeColor = '#FF453A'; statusMsg = '⏹️ MTK AI services - LITE MODE';
     } else if (mode === 1) {
         modeText = 'HARD MODE'; modeColor = '#32D74B'; statusMsg = '▶️ MTK AI services - HARD MODE';
     } else if (mode === 2) {
         modeText = 'STANDARD MODE'; modeColor = '#FF9500'; statusMsg = '⚡ MTK AI services - STANDARD MODE';
     }
     if (txt) { txt.textContent = modeText; txt.style.color = modeColor; }
     if (dot) { dot.style.background = modeColor; dot.style.display = 'block'; }
     showStatus(statusMsg, modeColor);
     setTimeout(() => { if (dot) dot.style.display = 'none'; }, 2000);
 } catch (e) { 
     showStatus('❌ Toggle failed: ' + e.message, '#FF453A'); 
 }
};
async function checkMTKServicesStatus() {
try {
const result = await exec('cat /sdcard/MTK_AI_Engine/automode 2>/dev/null || echo 0');
const mode = parseInt(result.trim()) || 0;
    mtkServicesEnabled = (mode !== 0);
     const txt = document.getElementById('mon_services');
     const dot = document.getElementById('services-status-dot');
     let modeText = '', modeColor = '';
     if (mode === 1) {
         modeText = 'HARD MODE'; modeColor = '#32D74B';
     } else if (mode === 2) {
         modeText = 'STANDARD MODE'; modeColor = '#FF9500';
     } else {
         modeText = 'LITE MODE'; modeColor = '#0000ff';
     }
     if (txt) { txt.textContent = modeText; txt.style.color = modeColor; }
     if (dot) { dot.style.background = modeColor; dot.style.display = 'block'; }
     setTimeout(() => { if (dot) dot.style.display = 'none'; }, 1000);
 } catch (e) {
     console.error('Service check error:', e);
 }
}
let isOverlayOn = false;
 window.toggleOverlay = async function() {
     const txt = document.getElementById('mon_overlay'), dot = document.getElementById('overlay-status-dot');
     if (!txt) return; const nextState = !isOverlayOn;
     try {
         await exec(`service call SurfaceFlinger 1034 i32 ${nextState ? 1 : 0}`);
         isOverlayOn = nextState;
         txt.textContent = isOverlayOn ? 'ON' : 'OFF';
         txt.style.color = isOverlayOn ? '#34C759' : '#FF453A';
         if (dot) dot.style.display = isOverlayOn ? 'block' : 'none';
     } catch (err) { console.error('Overlay error:', err); isOverlayOn = !isOverlayOn; }
 };
 function showStatus(msg, color) { const el = document.getElementById('status-message'); if (el) { el.textContent = msg; el.style.color = color || ''; } }
 function startLiveUpdates() {
     setInterval(() => { try { loadSystemStatus(); } catch (e) {} }, 2000);
     setInterval(() => { try { checkMTKServicesStatus(); } catch (e) {} }, 5000);
     setInterval(() => { 
         if (state.consoleLoaded && (!state.lastPathCheck || Date.now() - state.lastPathCheck > 60000)) { 
             checkPerformancePaths().then(r => { 
                 state.pathStatus = r;
                 state.lastPathCheck = Date.now(); 
                 updateInlineConsole(r); 
             }).catch(() => {}); 
         } 
     }, 10000);
 }
 // ============ EVENT LISTENERS ============
 function setupEventListeners() {
     document.querySelectorAll('.nav-item').forEach(item => {
         item.addEventListener('click', () => {
             const page = item.dataset.page; state.currentPage = page;
             document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.page === page));
             document.querySelectorAll('.page').forEach(p => p.classList.toggle('active', p.id === `${page}-page`));
         });
     });
     const svcCard = document.getElementById('mtk-services-card');
     if (svcCard) svcCard.addEventListener('click', window.toggleMTKServices);
     const consoleEl = document.getElementById('inline-console');
     if (consoleEl) {
         consoleEl.addEventListener('click', (e) => {
             if (e.target.closest('#inline-refresh-btn')) return;
             loadConsoleOnDemand();
         });
     }
     document.getElementById('inline-refresh-btn')?.addEventListener('click', async () => {
         const btn = document.getElementById('inline-refresh-btn'); if (!btn) return;
         if (!state.consoleLoaded) { await loadConsoleOnDemand(); }
         btn.disabled = true; btn.textContent = '[SCANNING...]';
         addConsoleMessage('[REFRESH]', 'Manual scan started...', 't-bright-yellow');
         setTimeout(async () => {
             try {
                 const results = await checkPerformancePaths();
                 updateInlineConsole(results); state.pathStatus = results; state.lastPathCheck = Date.now();
                 addConsoleMessage('[REFRESH]', `Done: ${results.summary.accessible}/${results.summary.total}`, 't-bright-green');
             } catch (e) { addConsoleMessage('[ERROR]', `Failed: ${e.message}`, 't-bright-red'); }
             finally { btn.disabled = false; btn.textContent = '[REFRESH PATHS]'; }
         }, 100);
     });
 }
 function setupViewDetails() {
     const btn = document.getElementById('view-detailed-info');
     if (btn) btn.addEventListener('click', () => {
         const name = state.deviceInfo.name || document.getElementById('device-name')?.textContent || 'Unknown Device';
         window.open(`https://www.google.com/search?q=${encodeURIComponent(name + ' specs review')}`, '_blank');
     });
 }
 // ============ OPTIMIZED INIT ============
 async function init() {
     console.log('MTK AI Engine initializing...');
     injectTerminalStyles();
     const consoleEl = document.getElementById('inline-console');
     if (consoleEl) {
         consoleEl.innerHTML = '<div class="console-hint">👆 Tap here to load system paths scan</div>';
     }
     setTimeout(injectProfileToggle, 500);
     await loadDeviceInfo();
     await loadSystemStatus();
const savedState = await loadServicesState();
if (savedState !== null) {
mtkServicesEnabled = savedState;
const txt = document.getElementById('mon_services');
const dot = document.getElementById('services-status-dot');
const mode = parseInt((await exec('cat /sdcard/MTK_AI_Engine/automode 2>/dev/null || echo 0')).trim()) || 0;
if (mode === 2) {
    if (txt) { txt.textContent = 'STANDARD MODE'; txt.style.color = '#FF9500'; }
    if (dot) { dot.style.background = '#FF9500'; dot.style.display = 'block'; setTimeout(() => dot.style.display = 'none', 1000); }
} else if (mode === 1) {
    if (txt) { txt.textContent = 'HARD MODE'; txt.style.color = '#32D74B'; }
    if (dot) { dot.style.background = '#32D74B'; dot.style.display = 'block'; setTimeout(() => dot.style.display = 'none', 1000); }
} else {
    if (txt) { txt.textContent = 'LITE MODE'; txt.style.color = '#0000ff'; }
    if (dot) { dot.style.background = '#FF453A'; dot.style.display = 'block'; setTimeout(() => dot.style.display = 'none', 1000); }
}
}
    const savedProfile = await loadProfileState();
    if (savedProfile && PROFILE_MODES[savedProfile]) {
        state.currentProfile = savedProfile;
        setTimeout(updateProfileUI, 1000);
    }
    await checkMTKServicesStatus();
    setupEventListeners();
    setupViewDetails();
    startLiveUpdates();
    console.log('MTK AI Engine ready.');
}
// ============ CONTROL CENTER (PRO PANEL + ZIP CONFIG) ============
const CC_DIR = '/sdcard/MTK_AI_Engine';
const CC_DIR2 = '/data/adb/modules/MTK_AI';  // ★ NEW: second backup directory
const CC_BACKUP_ZIP = '/sdcard/MTK_AI_Full_Backup.zip';  // ★ MODIFIED: renamed to reflect full backup
const CC_ONLINE_URL = 'https://github.com/Jestoni888/MTK-AI-Engine/raw/refs/heads/main/config/MTK_AI_Engine.zip';
const CC_TMP_ZIP = '/sdcard/.mtk_online.zip';
const CC_TMP_B64 = '/sdcard/.mtk_b64.tmp';
let ccBusy = false;
function injectCCAssets() {
if (!document.getElementById('fa-cdn')) {
const l = document.createElement('link');
l.id = 'fa-cdn'; l.rel = 'stylesheet';
l.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css';
document.head.appendChild(l);
}
if (document.getElementById('cc-styles')) return;
const s = document.createElement('style'); s.id = 'cc-styles';
s.textContent = `.cc-card { grid-column:1/-1; width:100%; background:#372e4f; border-radius:24px; padding:20px 16px; border:1px solid rgba(255,255,255,.06); margin:12px 0; box-sizing:border-box; } .cc-header { display:flex; align-items:center; gap:10px; margin:0 4px 16px; color:#b9a8e0; font-size:12px; font-weight:800; letter-spacing:2px; text-transform:uppercase; } .cc-header i { color:#FFD60A; font-size:14px; } .cc-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:12px; } .cc-btn { --acc:#8f7bd0; --soft:rgba(143,123,208,.15); display:flex; flex-direction:column; align-items:center; gap:6px; padding:14px 4px 12px; border:none; border-radius:16px; cursor:pointer; background:linear-gradient(160deg,#2b2342,#241c3a); box-shadow:inset 0 1px 0 rgba(255,255,255,.06), 0 4px 10px rgba(0,0,0,.35); transition:transform .12s, background .2s; -webkit-tap-highlight-color:transparent; } .cc-btn:active { transform:scale(.95); } .cc-ico { width:34px; height:34px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:15px; color:var(--acc); background:var(--soft); } .cc-lbl { font-size:9px; font-weight:800; letter-spacing:.8px; text-transform:uppercase; color:#e6def7; } .cc-sub { font-size:8px; font-weight:700; letter-spacing:1px; color:var(--acc); } #cc-btn-services { --acc:#5b9dff; --soft:rgba(91,157,255,.15); } #cc-btn-overlay { --acc:#b678e8; --soft:rgba(182,120,232,.15); } #cc-btn-save { --acc:#32D74B; --soft:rgba(50,215,75,.15); } #cc-btn-local { --acc:#FF9F0A; --soft:rgba(255,159,10,.15); } #cc-btn-online { --acc:#32BEEB; --soft:rgba(50,190,235,.15); } #cc-btn-reset { --acc:#FF453A; --soft:rgba(255,69,58,.15); } .cc-btn[data-active="true"] { background:var(--acc); } .cc-btn[data-active="true"] .cc-ico { background:rgba(0,0,0,.18); color:#1b1530; } .cc-btn[data-active="true"] .cc-lbl, .cc-btn[data-active="true"] .cc-sub { color:#1b1530; } .cc-btn.busy { animation:pulse 1s infinite; opacity:.6; pointer-events:none; } .cc-status { text-align:center; font-family:monospace; font-size:10px; color:#8f7bd0; margin-top:14px; min-height:14px; }`;
document.head.appendChild(s);
}
function removeOldCards() {
['mtk-services-card', 'refresh-rate-overlay-card'].forEach(id => {
const el = document.getElementById(id);
if (el) (el.closest('.status-card') || el).remove();
});
const cards = [...document.querySelectorAll('[class*="card"]')].filter(c => /MTK AI SERVICES|REFRESH RATE OVERLAY/.test(c.textContent || ''));
cards.forEach(c => { if (!c.querySelector('[class*="card"]')) c.remove(); });
}
function placeControlCenter(card) {
const master = document.querySelector('.profile-card') ||
[...document.querySelectorAll('[class*="card"]')].find(c => (c.textContent || '').includes('MASTER MODE') && !c.querySelector('.cc-grid'));
if (master) { master.before(card); return; }
const consoleCard = document.getElementById('inline-console')?.closest('[class*="card"]');
if (consoleCard) { consoleCard.before(card); return; }
document.body.appendChild(card);
}
function enforcePosition() {
const card = document.getElementById('cc-card');
const master = document.querySelector('.profile-card');
if (card && master && master.previousElementSibling !== card) master.before(card);
}
window.toggleMTKServices = async function() {
if (ccBusy) return;
try {
const readRes = await exec('cat /sdcard/MTK_AI_Engine/automode 2>/dev/null || echo 0');
let mode = parseInt(readRes.trim()) || 0;
     mode = (mode + 1) % 3;
     await exec(`su -c "mkdir -p /sdcard/MTK_AI_Engine && echo '${mode}' > /sdcard/MTK_AI_Engine/automode"`);
     await exec(`su -c "pkill -9 -f '/data/adb/modules/MTK_AI' 2>/dev/null"`);
     await exec(`su -c 'export PATH="/system/bin:/system/xbin:/sbin:/vendor/bin"; cd /data/adb/modules/MTK_AI; nohup sh /data/adb/modules/MTK_AI/service.sh >/dev/null 2>&1 & disown'`);
     let statusMsg = '', statusColor = '';
     if (mode === 0) {
         mtkServicesEnabled = false;
         statusMsg = '⏹️ MTK AI services → LITE MODE';
         statusColor = '#FF453A';
     } else if (mode === 1) {
         mtkServicesEnabled = true;
         statusMsg = '▶️ MTK AI services → HARD MODE';
         statusColor = '#32D74B';
     } else {
         mtkServicesEnabled = true;
         statusMsg = '⚡ MTK AI services → STANDARD MODE';
         statusColor = '#FF9500';
     }
     await saveServicesState(mode);
     showStatus(statusMsg, statusColor);
     updateControlStates();
 } catch (e) { 
     showStatus('❌ Toggle failed: ' + e.message, '#FF453A'); 
 }
};
window.toggleOverlay = async function() {
const next = !isOverlayOn;
try {
await exec(`service call SurfaceFlinger 1034 i32 ${next ? 1 : 0}`);
isOverlayOn = next;
showStatus(next ? '👁️ FPS overlay ON' : '🙈 FPS overlay OFF', next ? '#34C759' : '#FF453A');
updateControlStates();
} catch (e) { console.error('Overlay error:', e); }
};
// ---- ZIP engine (store method, no zip binary needed) ----
const CRC_T = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c; } return t; })();
function crc32(u) { let c = 0xFFFFFFFF; for (let i = 0; i < u.length; i++) c = CRC_T[(c ^ u[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
function b64ToBytes(b) { const bin = atob(b.replace(/\s+/g, '')); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; }
function bytesToB64(u) { let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); }
function buildZip(entries) {
const enc = new TextEncoder(), parts = [], central = [];
let offset = 0, cdSize = 0;
for (const e of entries) {
const name = enc.encode(e.name), crc = crc32(e.data);
const lh = new Uint8Array(30), lv = new DataView(lh.buffer);
lv.setUint32(0, 0x04034b50, true); lv.setUint16(4, 20, true);
lv.setUint32(14, crc, true); lv.setUint32(18, e.data.length, true); lv.setUint32(22, e.data.length, true);
lv.setUint16(26, name.length, true);
parts.push(lh, name, e.data);
const ch = new Uint8Array(46), cv = new DataView(ch.buffer);
cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true);
cv.setUint32(16, crc, true); cv.setUint32(20, e.data.length, true); cv.setUint32(24, e.data.length, true);
cv.setUint16(28, name.length, true); cv.setUint32(42, offset, true);
central.push(ch, name);
offset += 30 + name.length + e.data.length; cdSize += 46 + name.length;
}
const eo = new Uint8Array(22), ev = new DataView(eo.buffer);
ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, entries.length, true); ev.setUint16(10, entries.length, true);
ev.setUint32(12, cdSize, true); ev.setUint32(16, offset, true);
let total = 22; parts.forEach(p => total += p.length); central.forEach(p => total += p.length);
const out = new Uint8Array(total); let pos = 0;
for (const p of [...parts, ...central, eo]) { out.set(p, pos); pos += p.length; }
return out;
}
// ★ FIXED: Reduced chunk size to 8000 to prevent shell ARG_MAX truncation
async function writeBytesToSdcard(bytes, path) {
    const b64 = bytesToB64(bytes);
    await exec(`rm -f "${path}" "${CC_TMP_B64}" 2>/dev/null`);
    
    // Reduced from 16000 to 8000 to safely bypass shell/IPC command length limits
    for (let i = 0; i < b64.length; i += 8000) {
        await exec(`printf '%s' '${b64.slice(i, i + 8000)}' >> "${CC_TMP_B64}"`);
    }
    
    await exec(`(base64 -d "${CC_TMP_B64}" 2>/dev/null || busybox base64 -d "${CC_TMP_B64}") > "${path}"`);
    await exec(`rm -f "${CC_TMP_B64}" 2>/dev/null`);
}
// ---- UI state helpers ----
function setCCStatus(m, c) { const el = document.getElementById('cc-status'); if (el) { el.textContent = m; el.style.color = c || '#8f7bd0'; } }
function setCCBusy(b) { ccBusy = b; document.querySelectorAll('.cc-btn').forEach(x => { x.disabled = b; x.classList.toggle('busy', b); }); }
async function updateControlStates() {
const s = document.getElementById('cc-btn-services');
if (s) {
const mode = parseInt((await exec('cat /sdcard/MTK_AI_Engine/automode 2>/dev/null || echo 0')).trim()) || 0;
    s.dataset.active = (mode !== 0);
     s.querySelector('.cc-ico i').className = 'fas ' + (mode !== 0 ? 'fa-rocket' : 'fa-microchip');
     if (mode === 2) {
         s.querySelector('.cc-sub').textContent = 'STANDARD';
     } else if (mode === 1) {
         s.querySelector('.cc-sub').textContent = 'HARD';
     } else {
         s.querySelector('.cc-sub').textContent = 'LITE';
     }
 }
 const o = document.getElementById('cc-btn-overlay');
 if (o) {
     o.dataset.active = isOverlayOn;
     o.querySelector('.cc-ico i').className = 'fas ' + (isOverlayOn ? 'fa-eye' : 'fa-eye-slash');
     o.querySelector('.cc-sub').textContent = isOverlayOn ? 'ON' : 'OFF';
 }
}
// ★ FIXED: Dynamically strips the exact CC_DIR2 path, preserving nested 'MTK_AI/' folders
window.cfgSave = async function() {
    if (ccBusy) return; 
    setCCBusy(true); 
    setCCStatus('⏳ Zipping both config folders...', '#FF9F0A');
    try {
        const entries = [];
        
        // --- Backup CC_DIR (/sdcard/MTK_AI_Engine) ---
        const list1 = await exec(`find "${CC_DIR}" -type f 2>/dev/null`);
        const files1 = list1.split('\n').map(x => x.trim()).filter(Boolean);
        for (const f of files1) {
            setCCStatus(`⏳ Packing [SD] ${entries.length + 1}...`, '#FF9F0A');
            const b64 = await exec(`base64 "${f}" 2>/dev/null`);
            if (b64.trim()) {
                entries.push({ name: f.replace(/^\/sdcard\//, ''), data: b64ToBytes(b64) });
            }
        }

        // --- Backup CC_DIR2 (/data/adb/modules/MTK_AI) ---
        const list2 = await exec(`find "${CC_DIR2}" -type f 2>/dev/null`);
        const files2 = list2.split('\n').map(x => x.trim()).filter(Boolean);
        for (const f of files2) {
            setCCStatus(`⏳ Packing [MOD] ${entries.length + 1}...`, '#FF9F0A');
            const b64 = await exec(`base64 "${f}" 2>/dev/null`);
            if (b64.trim()) {
                // ★ FIX: Uses a dynamic regex to strip ONLY the exact base path (/data/adb/modules/MTK_AI/)
                // This leaves 'MTK_AI/AI_MODE' intact instead of stripping it.
                const relPath = f.replace(new RegExp(`^${CC_DIR2.replace(/\//g, '\\/')}/`), '');
                entries.push({ name: 'MTK_AI_Module/' + relPath, data: b64ToBytes(b64) });
            }
        }

        if (!entries.length) throw new Error('both folders missing / empty');
        const zip = buildZip(entries);
        await writeBytesToSdcard(zip, CC_BACKUP_ZIP);
        setCCStatus(`✅ Backup → ${CC_BACKUP_ZIP} (${entries.length} files from both dirs)`, '#32D74B');
        showStatus('💾 Full config zipped to /sdcard', '#32D74B');
    } catch (e) { 
        setCCStatus('❌ ' + e.message, '#FF453A'); 
    } finally { 
        setCCBusy(false); 
    }
};

// ★ FIXED: Encodes to a temp text file first to avoid binary pipe corruption
window.cfgRestoreLocal = async function() {
    if (ccBusy) return;
    
    const sizeStr = await exec(`stat -c %s "${CC_BACKUP_ZIP}" 2>/dev/null`);
    const size = parseInt(sizeStr) || 0;
    if (!size) { setCCStatus('❌ No local backup zip found', '#FF453A'); return; }
    if (!confirm('Restore local backup?\nBoth /sdcard/MTK_AI_Engine AND /data/adb/modules/MTK_AI will be overwritten.')) return;
    
    setCCBusy(true); 
    setCCStatus('⏳ Restoring local backup...', '#5b9dff');
    
    try {
        // 1. Encode the ZIP to a base64 temp file to avoid binary pipe issues
        setCCStatus('⏳ Encoding backup...', '#5b9dff');
        await exec(`(busybox base64 -w 0 "${CC_BACKUP_ZIP}" > /sdcard/.mtk_b64.tmp 2>/dev/null || base64 -w 0 "${CC_BACKUP_ZIP}" > /sdcard/.mtk_b64.tmp 2>/dev/null)`);
        
        const b64SizeStr = await exec(`stat -c %s /sdcard/.mtk_b64.tmp 2>/dev/null`);
        const b64Size = parseInt(b64SizeStr) || 0;
        if (!b64Size) throw new Error('cannot encode backup to base64');
        
        // 2. Read the base64 text file in chunks to bypass KSU IPC limits
        let b64 = "";
        const chunkSizeKB = 50; // 50KB of text per chunk
        const totalChunks = Math.ceil(b64Size / (chunkSizeKB * 1024));
        
        for (let i = 0; i < totalChunks; i++) {
            setCCStatus(`⏳ Reading backup... ${Math.round((i / totalChunks) * 100)}%`, '#5b9dff');
            const chunk = await exec(`dd if=/sdcard/.mtk_b64.tmp bs=1024 skip=${i * chunkSizeKB} count=${chunkSizeKB} 2>/dev/null`);
            if (!chunk) throw new Error('cannot read backup chunk');
            b64 += chunk;
        }
        
        // 3. Cleanup temp file
        await exec(`rm -f /sdcard/.mtk_b64.tmp 2>/dev/null`);
        
        if (!b64) throw new Error('cannot read backup zip');
        
        // 4. Decode and extract
        const n = await extractZipBytesToSdcard(b64ToBytes(b64));
        if (!n) throw new Error('backup zip empty');
        
        await afterConfigChange('✅ Local config restored (' + n + ' files)');
    } catch (e) { 
        await exec(`rm -f /sdcard/.mtk_b64.tmp 2>/dev/null`); // Ensure cleanup on error
        setCCStatus('❌ ' + e.message, '#FF453A'); 
    } finally { 
        setCCBusy(false); 
    }
};

// ★ MODIFIED: cfgReset removes BOTH directories
window.cfgReset = async function() {
if (ccBusy) return;
if (!confirm('⚠️ RESET will run:\nrm -rf /sdcard/MTK_AI_Engine\nrm -rf /data/adb/modules/MTK_AI\n\nContinue?')) return;
setCCBusy(true); setCCStatus('⏳ rm -rf both dirs...', '#FF453A');
await exec(`rm -rf "${CC_DIR}" 2>/dev/null`);
setCCStatus('✅ Config reset (both folders removed)', '#32D74B');
showStatus('♻️ Full config reset', '#FF453A');
setCCBusy(false);
};
async function afterConfigChange(okMsg) {
const p = await loadProfileState(); if (p) { state.currentProfile = p; updateProfileUI(); }
const sv = await loadServicesState(); if (sv !== null) mtkServicesEnabled = sv;
updateControlStates();
setCCStatus(okMsg, '#32D74B'); showStatus('📦 Config updated', '#32D74B');
}
// ---- BUILD PANEL ----
function injectControlCenter() {
if (document.getElementById('cc-card')) return;
injectCCAssets();
if (!document.getElementById('cc-services-modal')) {
const modalStyle = document.createElement('style');
modalStyle.textContent = `.cc-modal-overlay { position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.8); z-index:99999; display:flex; align-items:center; justify-content:center; opacity:0; pointer-events:none; transition:opacity 0.3s; backdrop-filter:blur(5px); } .cc-modal-overlay.active { opacity:1; pointer-events:auto; } .cc-modal-box { background:#1e1a2e; border:1px solid rgba(255,255,255,0.1); border-radius:20px; padding:24px; width:85%; max-width:320px; box-shadow:0 10px 30px rgba(0,0,0,0.5); transform:scale(0.9); transition:transform 0.3s; position:relative; } .cc-modal-overlay.active .cc-modal-box { transform:scale(1); } .cc-modal-title { color:#fff; font-size:16px; font-weight:800; text-align:center; margin-bottom:20px; text-transform:uppercase; letter-spacing:1px; } .cc-mode-info { background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.05); border-radius:12px; padding:14px; margin-bottom:12px; transition:all 0.2s; } .cc-mode-info.active-mode { border-color:#5b9dff; background:rgba(91,157,255,0.1); } .cc-mode-info.active-mode-standard { border-color:#FF9500; background:rgba(255,149,0,0.1); } .cc-mode-name { font-size:12px; font-weight:800; color:#5b9dff; margin-bottom:6px; display:flex; align-items:center; gap:6px; } .cc-mode-info.active-mode .cc-mode-name, .cc-mode-info.active-mode-standard .cc-mode-name { color:#fff; } .cc-mode-name::before { content:''; width:6px; height:6px; border-radius:50%; background:currentColor; box-shadow:0 0 8px currentColor; } .cc-mode-desc { font-size:11px; color:#aaa; line-height:1.5; } .cc-modal-btn { width:100%; padding:14px; border:none; border-radius:12px; background:linear-gradient(135deg, #5b9dff, #b678e8); color:#fff; font-weight:800; font-size:13px; text-transform:uppercase; letter-spacing:1px; cursor:pointer; margin-top:10px; box-shadow:0 4px 15px rgba(91,157,255,0.3); } .cc-modal-btn:active { transform:scale(0.97); } .cc-modal-close { position:absolute; top:12px; right:14px; background:rgba(255,255,255,0.1); border:none; color:#fff; font-size:18px; width:28px; height:28px; border-radius:50%; display:flex; align-items:center; justify-content:center; cursor:pointer; }`;
document.head.appendChild(modalStyle);
const modal = document.createElement('div');
modal.id = 'cc-services-modal';
modal.className = 'cc-modal-overlay';
modal.innerHTML = `<div class="cc-modal-box"> <button class="cc-modal-close" onclick="document.getElementById('cc-services-modal').classList.remove('active')">&times;</button> <div class="cc-modal-title">MTK AI Services</div> <div class="cc-mode-info" id="modal-lite-mode" style="cursor:pointer" onclick="switchToMode(0)"> <div class="cc-mode-name">LITE MODE</div> <div class="cc-mode-desc">A lightweight daemon that uses Java runtime environment as fastest detection than dumpsys & logcat.</div> </div> <div class="cc-mode-info" id="modal-standard-mode" style="cursor:pointer" onclick="switchToMode(2)"> <div class="cc-mode-name" style="color:#FF9500">STANDARD MODE</div> <div class="cc-mode-desc">Uses dumpsys as standard detection that can support all devices, slow but reliable.</div> </div> <div class="cc-mode-info" id="modal-hard-mode" style="cursor:pointer" onclick="switchToMode(1)"> <div class="cc-mode-name">HARD MODE</div> <div class="cc-mode-desc">Instant detection it uses both touch detection & logcat so it will slightly consumes more cpu.</div> </div> </div>`;
document.body.appendChild(modal);
modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.classList.remove('active');
});
}
window.switchToMode = async function(mode) {
const modal = document.getElementById('cc-services-modal');
if (modal) modal.classList.remove('active');
try {
     await exec(`su -c "mkdir -p /sdcard/MTK_AI_Engine && echo '${mode}' > /sdcard/MTK_AI_Engine/automode"`);
     await exec(`su -c "pkill -9 -f '/data/adb/modules/MTK_AI' 2>/dev/null"`);
     await exec(`su -c 'export PATH="/system/bin:/system/xbin:/sbin:/vendor/bin"; cd /data/adb/modules/MTK_AI; nohup sh /data/adb/modules/MTK_AI/service.sh >/dev/null 2>&1 & disown'`);
     mtkServicesEnabled = (mode !== 0);
     await saveServicesState(mode);
     let statusMsg = '', statusColor = '';
     if (mode === 0) {
         statusMsg = '⏹️ MTK AI services → LITE MODE';
         statusColor = '#FF453A';
     } else if (mode === 1) {
         statusMsg = '▶️ MTK AI services → HARD MODE';
         statusColor = '#32D74B';
     } else {
         statusMsg = '⚡ MTK AI services → STANDARD MODE';
         statusColor = '#FF9500';
     }
     showStatus(statusMsg, statusColor);
     updateControlStates();
 } catch (e) {
     showStatus('❌ Switch failed: ' + e.message, '#FF453A');
 }
};
window.showServicesModal = async function() {
const modal = document.getElementById('cc-services-modal');
if (!modal) return;
const liteEl = document.getElementById('modal-lite-mode');
 const standardEl = document.getElementById('modal-standard-mode');
 const hardEl = document.getElementById('modal-hard-mode');
 liteEl.classList.remove('active-mode');
 standardEl.classList.remove('active-mode', 'active-mode-standard');
 hardEl.classList.remove('active-mode');
 try {
     const readRes = await exec('cat /sdcard/MTK_AI_Engine/automode 2>/dev/null || echo 0');
     const mode = parseInt(readRes.trim()) || 0;
     if (mode === 0) {
         liteEl.classList.add('active-mode');
     } else if (mode === 2) {
         standardEl.classList.add('active-mode-standard');
     } else {
         hardEl.classList.add('active-mode');
     }
 } catch (e) {
     if (mtkServicesEnabled) {
         hardEl.classList.add('active-mode');
     } else {
         liteEl.classList.add('active-mode');
     }
 }
 modal.classList.add('active');
};
const card = document.createElement('div');
card.id = 'cc-card'; card.className = 'cc-card';
card.innerHTML = `<div class="cc-header"><i class="fas fa-sliders"></i><span>CONTROL CENTER</span></div> <div class="cc-grid"> <button class="cc-btn" id="cc-btn-services" onclick="showServicesModal()"><span class="cc-ico"><i class="fas fa-microchip"></i></span><span class="cc-lbl">Services</span><span class="cc-sub">LITE</span></button> <button class="cc-btn" id="cc-btn-overlay" onclick="toggleOverlay()"><span class="cc-ico"><i class="fas fa-eye-slash"></i></span><span class="cc-lbl">FPS Overlay</span><span class="cc-sub">OFF</span></button> <button class="cc-btn" id="cc-btn-save" onclick="cfgSave()"><span class="cc-ico"><i class="fas fa-file-zipper"></i></span><span class="cc-lbl">Save Current module version & config</span><span class="cc-sub">ZIP→/sdcard</span></button> <button class="cc-btn" id="cc-btn-local" onclick="cfgRestoreLocal()"><span class="cc-ico"><i class="fas fa-box-open"></i></span><span class="cc-lbl">Load Save module version & config</span><span class="cc-sub">UNZIP</span></button> <button class="cc-btn" id="cc-btn-online" onclick="cfgLoadOnline()"><span class="cc-ico"><i class="fas fa-cloud-arrow-down"></i></span><span class="cc-lbl">Online config</span><span class="cc-sub">GITHUB</span></button> <button class="cc-btn" id="cc-btn-reset" onclick="cfgReset()"><span class="cc-ico"><i class="fas fa-trash-can"></i></span><span class="cc-lbl">Reset config</span><span class="cc-sub">RM -RF</span></button> </div> <div class="cc-status" id="cc-status">Ready</div>`;
placeControlCenter(card);
setInterval(() => updateControlStates(), 2000);
setInterval(updateControlStates, 2000);
}
removeOldCards();
setTimeout(removeOldCards, 300);
setTimeout(removeOldCards, 900);
(function tryCC(n = 0) {
if (document.getElementById('cc-card')) return;
if (!document.body) { setTimeout(() => tryCC(n + 1), 100); return; }
if (document.querySelector('.profile-card') || n >= 10) { injectControlCenter(); return; }
setTimeout(() => tryCC(n + 1), 200);
})();
setTimeout(enforcePosition, 2500);
// ============ ROBUST ONLINE/LOCAL CONFIG (fetch + JS unzip, no binaries needed) ============
async function inflateRaw(u8) {
if (typeof DecompressionStream === 'undefined') throw new Error('no inflate support');
const ds = new DecompressionStream('deflate-raw');
const resp = new Response(new Blob([u8]).stream().pipeThrough(ds));
return new Uint8Array(await resp.arrayBuffer());
}
function parseZip(u8) {
const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
let eocd = -1;
for (let i = u8.length - 22; i >= 0; i--) {
if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
}
if (eocd < 0) throw new Error('bad zip: EOCD not found');
const count = dv.getUint16(eocd + 10, true);
 let ptr = dv.getUint32(eocd + 16, true);
 const out = [];
 for (let i = 0; i < count; i++) {
     if (ptr + 46 > u8.length) break;
     if (dv.getUint32(ptr, true) !== 0x02014b50) break;
     const method = dv.getUint16(ptr + 10, true);
     const compSize = dv.getUint32(ptr + 20, true);
     const nameLen = dv.getUint16(ptr + 28, true);
     const extraLen = dv.getUint16(ptr + 30, true);
     const commentLen = dv.getUint16(ptr + 32, true);
     const offset = dv.getUint32(ptr + 42, true);
     if (ptr + 46 + nameLen > u8.length) break;
     const name = new TextDecoder().decode(u8.subarray(ptr + 46, ptr + 46 + nameLen));
     out.push({ name, method, compSize, offset });
     ptr += 46 + nameLen + extraLen + commentLen;
 }
 return out;
}
function zipEntryData(u8, e) {
const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
if (e.offset + 30 > u8.length) throw new Error('invalid local header offset');
const nameLen = dv.getUint16(e.offset + 26, true);
const extraLen = dv.getUint16(e.offset + 28, true);
const start = e.offset + 30 + nameLen + extraLen;
if (start + e.compSize > u8.length) throw new Error('compressed data exceeds file bounds');
return u8.subarray(start, start + e.compSize);
}
async function ensureDirectoryExists(path) {
const dir = path.substring(0, path.lastIndexOf('/'));
if (dir && dir !== '/sdcard' && dir !== '/data' && dir !== '/data/adb' && dir !== '/data/adb/modules') {
await exec(`mkdir -p "${dir}" 2>/dev/null`);
}
}

// ★ FIXED: Preserves nested same-name folders like 'MTK_AI/MTK_AI/AI_MODE'
async function extractZipBytesToSdcard(u8) {
    const entries = parseZip(u8);
    let written = 0;
    for (const e of entries) {
        if (e.name.includes('..')) continue;
        let target = '';
        let name = e.name;
        
        if (name.startsWith('MTK_AI_Module/')) {
            // Module files → /data/adb/modules/MTK_AI/...
            let relPath = name.replace(/^MTK_AI_Module\//, '');
            
            // ★ FIX: Removed the aggressive backward-compat strip. 
            // If relPath is 'MTK_AI/AI_MODE', it stays 'MTK_AI/AI_MODE'.
            target = '/data/adb/modules/MTK_AI/' + relPath;
        } else if (name.startsWith('MTK_AI_Engine/')) {
            // Sdcard config → /sdcard/MTK_AI_Engine/...
            target = '/sdcard/' + name;
        } else {
            // Fallback for unknown structures
            target = '/sdcard/MTK_AI_Engine/' + name;
        }
        
        if (e.name.endsWith('/')) {
            await exec(`mkdir -p "${target}" 2>/dev/null`);
            continue;
        }
        await ensureDirectoryExists(target);
        try {
            let data = zipEntryData(u8, e);
            if (e.method === 8) {
                data = await inflateRaw(data);
            } else if (e.method !== 0) {
                console.warn(`Skipping unsupported compression method ${e.method} for ${e.name}`);
                continue; 
            }
            await writeBytesToSdcard(data, target);
            written++;
        } catch (err) {
            console.error(`Failed to extract ${e.name}:`, err);
        }
    }
    return written;
}

// ---- ONLINE: multi-transport downloader ----
const BBX2 = '/data/adb/modules/MTK_AI/busybox';
const CC_URL_LIST = [
'https://raw.githubusercontent.com/Jestoni888/MTK-AI-Engine/refs/heads/main/config/MTK_AI_Engine.zip',
'https://raw.githubusercontent.com/Jestoni888/MTK-AI-Engine/main/config/MTK_AI_Engine.zip',
'https://github.com/Jestoni888/MTK-AI-Engine/raw/refs/heads/main/config/MTK_AI_Engine.zip'
];
async function ccTryFetch() {
for (const url of CC_URL_LIST) {
try {
const resp = await fetch(url, { cache: 'no-store' });
if (resp.ok) {
const u8 = new Uint8Array(await resp.arrayBuffer());
if (u8.length > 22) return { u8, via: 'fetch' };
}
} catch (e) { /* try next URL */ }
}
return null;
}
async function ccTryShell() {
for (const url of CC_URL_LIST) {
let size = parseInt(await exec(`${BBX2} wget -q -O "${CC_TMP_ZIP}" --no-check-certificate "${url}" 2>/dev/null; stat -c %s "${CC_TMP_ZIP}" 2>/dev/null`, 60000)) || 0;
if (!size) size = parseInt(await exec(`curl -L --connect-timeout 15 -o "${CC_TMP_ZIP}" "${url}" 2>/dev/null; stat -c %s "${CC_TMP_ZIP}" 2>/dev/null`, 60000)) || 0;
if (!size) size = parseInt(await exec(`wget -q -O "${CC_TMP_ZIP}" "${url}" 2>/dev/null; stat -c %s "${CC_TMP_ZIP}" 2>/dev/null`, 60000)) || 0;
if (size) return { size, via: 'shell wget/curl' };
}
return null;
}
async function ccTryDownloadManager() {
await exec(`rm -f "${CC_TMP_ZIP}" /sdcard/MTK_AI_Engine_online.zip 2>/dev/null`);
await exec(`content insert --uri content://downloads/public_downloads --bind uri:s:"${CC_URL_LIST[0]}" --bind destination:i:6 --bind hint:s:"MTK_AI_Engine_online.zip" --bind visibility:i:1 2>/dev/null`, 10000);
for (let i = 0; i < 25; i++) {
await new Promise(r => setTimeout(r, 1000));
const size = parseInt(await exec(`stat -c %s /sdcard/MTK_AI_Engine_online.zip 2>/dev/null`)) || 0;
if (size > 22) {
await exec(`cp -f /sdcard/MTK_AI_Engine_online.zip "${CC_TMP_ZIP}" 2>/dev/null; rm -f /sdcard/MTK_AI_Engine_online.zip 2>/dev/null`);
return { size, via: 'DownloadManager' };
}
}
return null;
}
window.cfgLoadOnline = async function() {
if (ccBusy) return;
if (!confirm('Download & apply online config?\n/sdcard/MTK_AI_Engine will be overwritten.')) return;
setCCBusy(true);
let u8 = null, zipOnDisk = false, via = '';
try {
setCCStatus('⏳ [1/3] WebView fetch (direct raw URL)...', '#32BEEB');
const f = await ccTryFetch();
if (f) { u8 = f.u8; via = f.via; }
if (!u8) {
setCCStatus('⏳ [2/3] Shell wget/curl...', '#32BEEB');
const s = await ccTryShell();
if (s) {
zipOnDisk = true; via = s.via;
const b64 = await exec(`(${BBX2} base64 "${CC_TMP_ZIP}" 2>/dev/null || base64 "${CC_TMP_ZIP}" 2>/dev/null)`, 60000);
if (b64.trim()) u8 = b64ToBytes(b64);
}
}
if (!u8) {
setCCStatus('⏳ [3/3] Android DownloadManager...', '#32BEEB');
const d = await ccTryDownloadManager();
if (d) {
zipOnDisk = true; via = d.via;
const b64 = await exec(`(${BBX2} base64 "${CC_TMP_ZIP}" 2>/dev/null || base64 "${CC_TMP_ZIP}" 2>/dev/null)`, 60000);
if (b64.trim()) u8 = b64ToBytes(b64);
}
}
if (!u8 || u8.length < 22) throw new Error('all download methods failed');
setCCStatus(`⏳ Extracting ${u8.length} B (via ${via})...`, '#32BEEB');
if (!zipOnDisk) await writeBytesToSdcard(u8, CC_TMP_ZIP);
const uz = await exec(`cd /sdcard && ${BBX2} unzip -o "${CC_TMP_ZIP}" >/dev/null 2>&1; echo EXIT=$?`, 60000);
if (/EXIT=0/.test(uz)) {
await exec(`if [ -d "${CC_DIR}/MTK_AI_Engine" ]; then cp -rf "${CC_DIR}/MTK_AI_Engine/." "${CC_DIR}/" 2>/dev/null; rm -rf "${CC_DIR}/MTK_AI_Engine"; fi`);
} else {
const n = await extractZipBytesToSdcard(u8);
if (!n) throw new Error('unzip failed & JS extractor empty');
}
await exec(`rm -f "${CC_TMP_ZIP}" 2>/dev/null`);
await afterConfigChange(`✅ Online config applied (via ${via})`);
} catch (e) { setCCStatus('❌ ' + e.message, '#FF453A'); }
finally { setCCBusy(false); }
};
// ============ CONTROL CENTER THEME SYNC ============
function injectCCThemeOverride() {
if (document.getElementById('cc-theme-styles')) return;
const s = document.createElement('style');
s.id = 'cc-theme-styles';
s.textContent = `#cc-card .cc-btn { background: linear-gradient(160deg, var(--cc-btn-bg1, #2b2342), var(--cc-btn-bg2, #241c3a)); } #cc-card .cc-btn[data-active="true"] { background: var(--acc); } #cc-card .cc-lbl { color: var(--cc-lbl, #e6def7); }`;
document.head.appendChild(s);
}
function ccShade(color, f) {
const m = (color || '').match(/rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)/);
if (!m) return null;
return `rgb(${Math.round(m[1] * f)}, ${Math.round(m[2] * f)}, ${Math.round(m[3] * f)})`;
}
let ccThemeKey = '';
function applyCCTheme() {
const card = document.getElementById('cc-card');
const sample = document.querySelector('.status-card') || document.querySelector('.profile-card');
if (!card || !sample) return;
const cs = getComputedStyle(sample);
const key = cs.backgroundColor + '|' + cs.borderRadius + '|' + cs.borderColor + '|' + cs.color;
if (key === ccThemeKey) return;
ccThemeKey = key;
card.style.background = cs.backgroundColor;
card.style.border = '1px solid ' + (cs.borderColor && cs.borderColor !== 'rgba(0, 0, 0, 0)' ? cs.borderColor : 'rgba(255,255,255,0.06)');
card.style.borderRadius = cs.borderRadius || '24px';
const root = document.documentElement.style;
root.setProperty('--cc-btn-bg1', ccShade(cs.backgroundColor, 0.72) || '#2b2342');
root.setProperty('--cc-btn-bg2', ccShade(cs.backgroundColor, 0.58) || '#241c3a');
root.setProperty('--cc-lbl', cs.color || '#e6def7');
const hdr = card.querySelector('.cc-header');
if (hdr) hdr.style.color = cs.color || '#b9a8e0';
const st = document.getElementById('cc-status');
if (st) st.style.color = ccShade(cs.color, 0.75) || '#8f7bd0';
}
function watchCCTheme() {
if (window.ccThemeWatchOn) return;
window.ccThemeWatchOn = true;
const mo = new MutationObserver(() => setTimeout(applyCCTheme, 250));
const opts = { attributes: true, attributeFilter: ['class', 'style', 'data-theme'] };
mo.observe(document.documentElement, opts);
mo.observe(document.body, opts);
document.addEventListener('click', () => setTimeout(applyCCTheme, 350), true);
setInterval(applyCCTheme, 3000);
}
(function waitCCForTheme(n = 0) {
if (document.getElementById('cc-card')) {
injectCCThemeOverride(); applyCCTheme(); watchCCTheme(); return;
}
if (n < 40) setTimeout(() => waitCCForTheme(n + 1), 250);
})();
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
})();
