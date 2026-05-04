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
        deviceInfo: {
            name: 'Detecting...',
            codename: '...',
            android: '...',
            chipset: 'Detecting...',
            ram: '...',
            storage: '...',
            kernel: '...',
            uptime: '...'
        }
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
            '/sys/devices/system/cpu/cpufreq/policy0/scaling_available_governors',            '/sys/devices/system/cpu/cpu0/cpufreq/scaling_cur_freq',
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
        // Add this to the thermal section in PERFORMANCE_PATHS:
thermal: [
    '/sys/class/thermal/thermal_zone0/temp',
    '/sys/class/thermal/thermal_zone0/type',
    '/sys/class/thermal/thermal_zone0/policy',
    '/sys/class/thermal/thermal_zone0/trip_point_0_temp',
    '/sys/class/thermal/thermal_zone*/mode',  // ✅ Added thermal zone mode
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
            '/proc/sys/kernel/sched_min_task_util_for_colocation',            '/proc/sys/kernel/sched_util_clamp_min',
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

    // ============ SAFE EXEC WRAPPER ============
    async function exec(command, timeout = 5000) {
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

    // ============ TERMINAL UI STYLES (Inline Console) ============
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
            }
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
            .terminal-container::-webkit-scrollbar-thumb { background: #444; border-radius: 3px; }            .terminal-btn {
                background: rgba(50,215,75,0.15); border: 1px solid rgba(50,215,75,0.4);
                color: #32D74B; padding: 6px 12px; font-family: monospace; font-size: 11px;
                border-radius: 4px; cursor: pointer; width: 100%; margin-top: 8px;
                -webkit-tap-highlight-color: transparent; transition: all 0.1s;
            }
            .terminal-btn:active { background: rgba(50,215,75,0.3); transform: scale(0.98); }
            .terminal-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        `;
        document.head.appendChild(style);
    }

    // ============ INLINE CONSOLE FUNCTIONS ============
    function renderInlineConsole(results) {
    if (!results) return '<div class="terminal-container">Waiting...</div>';
    const { summary, categories } = results;
    const pct = Math.round((summary.accessible / Math.max(1, summary.total)) * 100);
    
    let html = `<div class="terminal-container" style="max-height: 500px;">`;
    html += `<div class="term-line"><span class="term-label t-bright-cyan">[MTK-AI]</span><span class="t-white">${summary.accessible}/${summary.total} paths OK (${pct}%)</span></div>`;
    
    const hasLog = categories.logcat?.some(p => p.readable);
    html += `<div class="term-line"><span class="term-label t-bright-cyan">[LOGCAT]</span><span class="${hasLog ? 't-bright-green' : 't-bright-red'}">${hasLog ? 'Active' : 'Blocked'}</span></div>`;
    
    // Show ALL accessible paths from ALL categories
    for (const [cat, items] of Object.entries(categories)) {
        const readable = items.filter(i => i.readable);
        if (readable.length > 0) {
            readable.forEach(item => {
                const shortPath = item.originalPath.split('/').pop();
                
                // Special formatting for thermal mode values
                let displayValue = item.value ? item.value.substring(0, 40) : 'N/A';
                let statusClass = 't-bright-green';
                let statusText = '[OK]';
                
                // Highlight thermal mode status
                if (shortPath === 'mode' && cat === 'thermal') {
                    if (item.value?.trim() === 'disabled') {
                        statusClass = 't-bright-red';
                        statusText = '[DISABLED]';
                    } else if (item.value?.trim() === 'enabled') {
                        statusClass = 't-bright-cyan';
                        statusText = '[ENABLED]';
                    }
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
            const line = document.createElement('div');
            line.className = 'term-line';
            line.innerHTML = `<span class="term-label ${colorClass}">${prefix}</span><span class="t-white">${message}</span>`;
            consoleEl.appendChild(line);
            consoleEl.scrollTop = consoleEl.scrollHeight;
        }
    }

    // ============ PATH CHECKING FUNCTIONS ============
    // Replace your checkPathStatus function with this wildcard-fixed version:
async function checkPathStatus(path, timeout = 1000) {
    return new Promise(async (resolve) => {
        const timer = setTimeout(() => resolve({ exists: false, readable: false, path, value: null }), timeout);
        try {
            if (path.includes('*')) {
                // Use shell globbing directly - more reliable than ls + grep
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
                                exists: true,
                                readable: true,
                                path: filePath.trim(),
                                originalPath: path,
                                value: value.replace(/\s+/g, ' ')
                            });
                        }
                    }
                    
                    if (results.length > 0) {
                        // For thermal mode wildcards, combine all zone values
                        if (path.includes('/mode') && path.includes('thermal')) {
                            const allModes = results.map(r => r.value.trim()).filter(v => v);
                            resolve({
                                exists: true,
                                readable: allModes.length > 0,
                                path: path,
                                originalPath: path,
                                value: allModes.join(', '),  // e.g., "enabled, disabled, enabled"
                                isCombined: true  // Flag for renderer
                            });
                        } else {
                            resolve(results[0]);  // Return first match for non-thermal wildcards
                        }
                    } else {
                        resolve({ exists: false, readable: false, path, originalPath: path, value: null });
                    }
                } else {
                    resolve({ exists: false, readable: false, path, originalPath: path, value: null });
                }
            } else {
                // Non-wildcard path - original logic
                const testRead = await exec(`cat "${path}" 2>/dev/null | head -c 30`);
                clearTimeout(timer);
                resolve({ 
                    exists: testRead !== '', 
                    readable: testRead.trim() !== '', 
                    path, 
                    originalPath: path, 
                    value: testRead.trim().replace(/\s+/g, ' ') 
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
                else results.summary.missing++;            }
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
            const storage = await exec('df /data | tail -1');            const storageMatch = storage.match(/\s+(\d+)\s+\d+\s+\d+\s+\d+%/);
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
            lines.forEach(line => {                if (line.startsWith('MemTotal:')) { const m = line.match(/(\d+)/); if (m) total = parseInt(m[1]); }
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
            state.cpuUsage = await parseCpuUsage();            const gpu = await getGPUInfo();
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
            if (mtkServicesEnabled) {
                await exec(`pkill -f "MTK_AI.*mtk_ai_engine" 2>/dev/null; pkill -9 -f "/data/adb/modules/MTK_AI" 2>/dev/null; pkill -f "dumpsys2" 2>/dev/null; pkill -f "script_runner.*global" 2>/dev/null; pkill -f "service.sh" 2>/dev/null; killall service.sh mtk_ai_engine 2>/dev/null`);
                mtkServicesEnabled = false;
                if (txt) { txt.textContent = 'MANUAL MODE'; txt.style.color = '#FF453A'; }
                if (dot) { dot.style.background = '#FF453A'; dot.style.display = 'block'; }
                showStatus('⏹️ MTK AI services disabled', '#FF453A');
            } else {
                await exec(`su -c 'export PATH="/system/bin:/system/xbin:/sbin:/vendor/bin"; cd /data/adb/modules/MTK_AI; nohup sh /data/adb/modules/MTK_AI/service.sh >/dev/null 2>&1 & disown'`);
                mtkServicesEnabled = true;
                if (txt) { txt.textContent = 'AUTO MODE'; txt.style.color = '#32D74B'; }
                if (dot) { dot.style.background = '#32D74B'; dot.style.display = 'block'; }
                showStatus('▶️ MTK AI services enabled', '#32D74B');
            }
            setTimeout(() => { if (dot) dot.style.display = 'none'; }, 2000);
        } catch (e) { showStatus('❌ Toggle failed', '#FF453A'); }
    };
    async function checkMTKServicesStatus() {
        try {
            const result = await exec('pgrep -f "mtk_ai_engine" 2>/dev/null'), isRunning = result.trim().length > 0;
            mtkServicesEnabled = isRunning;
            const txt = document.getElementById('mon_services'), dot = document.getElementById('services-status-dot');
            if (isRunning) { if (txt) { txt.textContent = 'AUTO MODE'; txt.style.color = '#32D74B'; } if (dot) { dot.style.background = '#32D74B'; dot.style.display = 'block'; } }
            else { if (txt) { txt.textContent = 'MANUAL MODE'; txt.style.color = '#FF453A'; } if (dot) { dot.style.background = '#FF453A'; dot.style.display = 'block'; } }
            setTimeout(() => { if (dot) dot.style.display = 'none'; }, 1000);
        } catch (e) { console.error('Service check error:', e); }
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
        setInterval(() => { if (!state.lastPathCheck || Date.now() - state.lastPathCheck > 60000) { checkPerformancePaths().then(r => { state.pathStatus = r; state.lastPathCheck = Date.now(); }).catch(() => {}); } }, 10000);
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
        
        // ✅ Inline console refresh button (matches your HTML)
        document.getElementById('inline-refresh-btn')?.addEventListener('click', async () => {
            const btn = document.getElementById('inline-refresh-btn'); if (!btn) return;
            btn.disabled = true; btn.textContent = '[SCANNING...]';
            addConsoleMessage('[REFRESH]', 'Manual scan started...', 't-bright-yellow');
            setTimeout(async () => {                try {
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

    // ============ OPTIMIZED INIT (INLINE CONSOLE) ============
    async function init() {
        console.log('MTK AI Engine initializing...');
        
        // Inject styles (no UI injection - your HTML already has the console)
        injectTerminalStyles();
        
        // Show initial loading in YOUR inline console
        addConsoleMessage('[INIT]', 'Loading MTK AI Engine...', 't-bright-cyan');
        
        // Fast device info load
        await loadDeviceInfo();
        addConsoleMessage('[DEVICE]', `Loaded: ${state.deviceInfo.name}`, 't-bright-green');
        
        // Quick critical paths check
        addConsoleMessage('[SCAN]', 'Checking critical paths...', 't-yellow');
        const criticalResults = await checkCriticalPaths();
        state.pathStatus = criticalResults;
        updateInlineConsole(criticalResults); // ✅ Uses your #inline-console
        addConsoleMessage('[SCAN]', `Critical: ${criticalResults.summary.accessible}/${criticalResults.summary.total} OK`, 't-bright-green');
        
        // Load system status
        await loadSystemStatus();
        addConsoleMessage('[SYS]', 'System monitors active', 't-bright-green');
        
        // Check services
        await checkMTKServicesStatus();
        
        // Setup UI (includes your #inline-refresh-btn handler)
        setupEventListeners();
        setupViewDetails();
        startLiveUpdates();        
        // Background full path scan
        addConsoleMessage('[BG]', 'Starting full scan...', 't-gray');
        setTimeout(async () => {
            try {
                const fullResults = await checkPerformancePaths();
                state.pathStatus = fullResults;
                updateInlineConsole(fullResults); // ✅ Uses your #inline-console
                addConsoleMessage('[BG]', `Full: ${fullResults.summary.accessible}/${fullResults.summary.total}`, 't-bright-green');
            } catch (e) { addConsoleMessage('[ERROR]', `Scan failed: ${e.message}`, 't-bright-red'); }
        }, 1000);
        
        addConsoleMessage('[READY]', 'MTK AI Engine ready', 't-bright-green');
        console.log('MTK AI Engine ready. Inline Console Active.');
    }
    
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();