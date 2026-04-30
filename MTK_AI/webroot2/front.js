(function() {
    'use strict';

    // Global state
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

    // Safe exec wrapper with timeout
    async function exec(command, timeout = 5000) {
        return new Promise((resolve) => {
            const callback = `exec_cb_${Date.now()}_${Math.random().toString(36).substring(2)}`;
            const timer = setTimeout(() => { 
                if (window[callback]) delete window[callback]; 
                resolve(''); 
            }, timeout);
            
            window[callback] = (success, result) => {
                clearTimeout(timer);
                if (window[callback]) delete window[callback];
                resolve(result || '');
            };
            
            if (window.ksu && typeof ksu.exec === 'function') {
                try { 
                    ksu.exec(command, `window.${callback}`); 
                } catch (e) { 
                    clearTimeout(timer); 
                    if (window[callback]) delete window[callback];
                    resolve('');                 }
            } else {
                clearTimeout(timer);
                if (window[callback]) delete window[callback];
                resolve('');
            }
        });
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

            // RAM from /proc/meminfo
            const memInfo = await exec('cat /proc/meminfo | grep MemTotal');
            const memMatch = memInfo.match(/MemTotal:\s+(\d+)/);
            if (memMatch) {
                const ramGB = parseInt(memMatch[1]) / 1024 / 1024;
                state.deviceInfo.ram = `${ramGB.toFixed(2)} GB`;
                state.totalRamGB = ramGB.toFixed(2);
            }

            // Storage from df
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
            const d = Math.floor(sec / 86400);
            const h = Math.floor((sec % 86400) / 3600);
            const m = Math.floor((sec % 3600) / 60);
            state.deviceInfo.uptime = `${d > 0 ? d + 'd ' : ''}${h > 0 ? h + 'h ' : ''}${m}m`.trim();

            updateDeviceInfo();
        } catch (e) { 
            console.error('Device Info Error:', e); 
        }
    }

    function updateDeviceInfo() {
        const map = {
            'device-name': state.deviceInfo.name,
            'codename': `codename: ${state.deviceInfo.codename}`,
            'android-version': state.deviceInfo.android,
            'chipset': state.deviceInfo.chipset,
            'ram': state.deviceInfo.ram,
            'storage': state.deviceInfo.storage,
            'kernel': state.deviceInfo.kernel,
            'uptime': state.deviceInfo.uptime
        };
        for (const [id, val] of Object.entries(map)) {
            const el = document.getElementById(id);
            if (el) el.textContent = val;
        }
    }

    // ============ ACCURATE CPU USAGE PARSER ============
    async function parseCpuUsage() {
        try {
            // Read /proc/stat twice with delay to calculate delta
            const stat1 = await exec('cat /proc/stat | grep "^cpu "');
            await new Promise(r => setTimeout(r, 500));
            const stat2 = await exec('cat /proc/stat | grep "^cpu "');
            
            const parseStat = (stat) => {
                const values = stat.trim().split(/\s+/).slice(1).map(v => parseInt(v) || 0);
                // cpu user nice system idle iowait irq softirq steal guest guest_nice
                const idle = values[3] + values[4]; // idle + iowait
                const total = values.reduce((a, b) => a + b, 0);
                return { idle, total };
            };
            
            const s1 = parseStat(stat1);
            const s2 = parseStat(stat2);
                        const idleDiff = s2.idle - s1.idle;
            const totalDiff = s2.total - s1.total;
            
            if (totalDiff <= 0) return state.cpuUsage;
            const usage = Math.round((1 - (idleDiff / totalDiff)) * 100);
            return Math.max(0, Math.min(100, usage)); // Clamp 0-100
        } catch (e) {
            console.error('CPU parse error:', e);
            return state.cpuUsage;
        }
    }

    // ============ ACCURATE RAM USAGE PARSER ============
    async function parseRamUsage() {
        try {
            const memInfo = await exec('cat /proc/meminfo');
            const lines = memInfo.split('\n');
            
            let total = 0, free = 0, buffers = 0, cached = 0, sReclaimable = 0;
            
            lines.forEach(line => {
                if (line.startsWith('MemTotal:')) {
                    const m = line.match(/(\d+)/); if (m) total = parseInt(m[1]);
                } else if (line.startsWith('MemFree:')) {
                    const m = line.match(/(\d+)/); if (m) free = parseInt(m[1]);
                } else if (line.startsWith('Buffers:')) {
                    const m = line.match(/(\d+)/); if (m) buffers = parseInt(m[1]);
                } else if (line.startsWith('Cached:')) {
                    const m = line.match(/(\d+)/); if (m) cached = parseInt(m[1]);
                } else if (line.startsWith('SReclaimable:')) {
                    const m = line.match(/(\d+)/); if (m) sReclaimable = parseInt(m[1]);
                }
            });
            
            // Linux "available" memory calculation
            const available = free + buffers + cached + sReclaimable;
            const used = Math.max(0, total - available);
            const usage = total > 0 ? Math.round((used / total) * 100) : 0;
            
            // Update state values for display
            state.totalRamGB = (total / 1024 / 1024).toFixed(2);
            state.usedRamGB = (used / 1024 / 1024).toFixed(2);
            
            return Math.max(0, Math.min(100, usage));
        } catch (e) {
            console.error('RAM parse error:', e);
            return state.ramUsage;
        }
    }
    // ============ GPU INFO (MediaTek + Universal) ============
async function getGPUInfo() {
    let info = { usage: 0, freq: 0, memoryMB: 0 };
    try {
        // 1️⃣ Get GPU Usage from GED HAL (MediaTek Standard)
        // Path: /sys/kernel/ged/hal/gpu_utilization
        // Format: "val1 val2 val3" (e.g., "0 0 100")
        const gedUtil = await exec('cat /sys/kernel/ged/hal/gpu_utilization 2>/dev/null');
        if (gedUtil && gedUtil.trim()) {
            const parts = gedUtil.trim().split(/\s+/);
            // Usually the first or last number represents utilization %
            // We try to find the first valid number that looks like a percentage
            for (let i = 0; i < parts.length; i++) {
                const val = parseInt(parts[i]);
                if (!isNaN(val) && val >= 0 && val <= 100) {
                    info.usage = val;
                    console.log(` GPU Usage: ${info.usage}% (from GED HAL utilization)`);
                    break; 
                }
            }
        }

        // 2️⃣ Get Exact GPU Frequency from GED HAL
        // Path: /sys/kernel/ged/hal/current_freq
        // Format: "index freq_khz" (e.g., "26 471000")
        const gedFreq = await exec('cat /sys/kernel/ged/hal/current_freq 2>/dev/null');
        if (gedFreq && gedFreq.trim()) {
            const parts = gedFreq.trim().split(/\s+/);
            // The frequency is usually the second number (kHz)
            if (parts.length >= 2) {
                const freqKHz = parseInt(parts[1]);
                if (!isNaN(freqKHz) && freqKHz > 100) {
                    info.freq = Math.round(freqKHz / 1000); // Convert kHz -> MHz
                    console.log(` GPU Freq: ${info.freq} MHz (from GED HAL current_freq)`);
                }
            }
        }

        // 3️⃣ Get GPU Memory (VRAM) Usage
        // Path: /proc/mtk_mali/gpu_memory
        // Format: "mali0 62469 \n kctx-..."
        const memInfo = await exec('cat /proc/mtk_mali/gpu_memory 2>/dev/null');
        if (memInfo) {
            // Look for "mali0" followed by a number
            const match = memInfo.match(/^mali0\s+(\d+)/m);
            if (match) {
                const kb = parseInt(match[1]);
                info.memoryMB = (kb / 1024).toFixed(1); // Convert KB to MB
                console.log(`💾 GPU Memory: ${info.memoryMB} MB`);
            }        }

        // 4️⃣ Universal Fallbacks (for non-MediaTek or if GED fails)
        // Standard devfreq paths (Qualcomm/Exynos)
        if (info.freq === 0) {
            const fallbackPaths = [
                '/sys/class/devfreq/soc:gpu/cur_freq',
                '/sys/class/devfreq/13000000.mali/cur_freq',
                '/proc/gpufreqv2/gpufreq_status' // Legacy MTK path
            ];
            for (const path of fallbackPaths) {
                const res = await exec(`cat ${path} 2>/dev/null`);
                if (res) {
                    // Handle simple number or "Freq: 836000" format
                    const numMatch = res.match(/(\d{5,})/); 
                    if (numMatch) {
                        let val = parseInt(numMatch[1]);
                        // If value is huge (kHz), convert to MHz
                        if (val > 10000) val = Math.round(val / 1000);
                        if (val > 0 && val < 2000) {
                            info.freq = val;
                            console.log(`🔄 Freq Fallback: ${info.freq} MHz`);
                            break;
                        }
                    }
                }
            }
        }

        if (info.usage === 0) {
            const fallbackUtil = [
                '/sys/class/misc/mali0/gpu_usage',
                '/sys/class/devfreq/soc:gpu/load'
            ];
            for (const path of fallbackUtil) {
                const res = await exec(`cat ${path} 2>/dev/null`);
                if (res && !isNaN(parseInt(res.trim()))) {
                    info.usage = parseInt(res.trim());
                    if (info.usage > 0 && info.usage <= 100) {
                        console.log(`🔄 Usage Fallback: ${info.usage}%`);
                        break;
                    }
                }
            }
        }

        // Final Defaults
        if (info.freq === 0) info.freq = 471; // Baseline for Dimensity 1200
        if (isNaN(info.usage)) info.usage = 0;
    } catch (e) { 
        console.error('GPU info error:', e); 
    }
    return info;
}

    // ============ UPDATE SYSTEM STATUS ============
    async function loadSystemStatus() {
        try {
            state.cpuUsage = await parseCpuUsage();
            const gpu = await getGPUInfo();
            state.gpuUsage = gpu.usage;
            state.gpuFreq = gpu.freq;
            state.ramUsage = await parseRamUsage();            
            const battCap = await exec('cat /sys/class/power_supply/battery/capacity 2>/dev/null');
            state.batteryLevel = parseInt(battCap.trim()) || 0;
            
            updateSystemStatus();
        } catch (e) { 
            console.error('System Status Error:', e); 
        }
    }

    async function updateRamText() {
        try {
            const ramEl = document.getElementById('ram-text');
            if (ramEl && state.totalRamGB && state.usedRamGB) {
                ramEl.textContent = `${state.usedRamGB} / ${state.totalRamGB} GB`;
            }
        } catch(e) {
            console.error('RAM text update error:', e);
        }
    }

    function updateSystemStatus() {
        updateCircularProgress('cpu-progress', state.cpuUsage);
        updateCircularProgress('gpu-progress', state.gpuUsage);
        updateCircularProgress('ram-progress', state.ramUsage);
        updateCircularProgress('battery-progress', state.batteryLevel);

        // CPU Frequency
        (async () => { 
            try { 
                const f = await exec('cat /sys/devices/system/cpu/cpufreq/policy0/scaling_cur_freq 2>/dev/null'); 
                const cpuEl = document.getElementById('cpu-freq');
                if (f && !isNaN(parseInt(f.trim())) && cpuEl) {
                    cpuEl.textContent = `${(parseInt(f.trim()) / 1000000).toFixed(2)} GHz`; 
                }
            } catch(e){} 
        })();

        // GPU Frequency
        const gpuEl = document.getElementById('gpu-freq');
        if (gpuEl) gpuEl.textContent = `${state.gpuFreq} MHz`;
        
        // RAM Text
        updateRamText();

        // Battery Temperature
        (async () => { 
            try { 
                const tmp = await exec('cat /sys/class/power_supply/battery/temp 2>/dev/null'); 
                const battEl = document.getElementById('battery-temp');                if (tmp && !isNaN(parseInt(tmp.trim())) && battEl) { 
                    const c = (parseInt(tmp.trim()) / 10).toFixed(0); 
                    battEl.textContent = `${c}°C • ${c < 35 ? 'Good' : c < 40 ? 'Warm' : 'Hot'}`; 
                } 
            } catch(e){} 
        })();
    }

    function updateCircularProgress(id, pct) {
        try {
            const el = document.getElementById(id);
            if (!el) return;
            const circle = el.querySelector('circle.progress-bar');
            if (circle) {
                const r = circle.r.baseVal.value;
                const c = 2 * Math.PI * r;
                circle.style.strokeDasharray = c;
                circle.style.strokeDashoffset = c - (Math.max(0, Math.min(100, pct)) / 100) * c;
            }
            const txt = el.querySelector('.progress-text');
            if (txt) txt.textContent = `${Math.max(0, Math.min(100, pct))}%`;
        } catch (e) {}
    }

    // MTK Services Toggle
let mtkServicesEnabled = false;

window.toggleMTKServices = async function() {
    const txt = document.getElementById('mon_services');
    const dot = document.getElementById('services-status-dot');
    try {
        if (mtkServicesEnabled) {
            // DISABLE SERVICES (Manual Mode)
            await exec(`
                pkill -f "MTK_AI.*mtk_ai_engine" 2>/dev/null
                pkill -9 -f "/data/adb/modules/MTK_AI" 2>/dev/null
                pkill -f "dumpsys2" 2>/dev/null
                pkill -f "script_runner.*global" 2>/dev/null
                pkill -f "service.sh" 2>/dev/null
                killall service.sh mtk_ai_engine 2>/dev/null
            `);
            mtkServicesEnabled = false;
            if (txt) { txt.textContent = 'MANUAL MODE'; txt.style.color = '#FF453A'; }
            if (dot) { dot.style.background = '#FF453A'; dot.style.display = 'block'; }
            showStatus('⏹️ MTK AI services disabled', '#FF453A');
        } else {
            // ENABLE SERVICES (Auto Mode)
            await exec(`
                su -c '
                export PATH="/system/bin:/system/xbin:/sbin:/vendor/bin"
                cd /data/adb/modules/MTK_AI
                nohup sh /data/adb/modules/MTK_AI/service.sh >/dev/null 2>&1 &
                disown
                '
            `);
            mtkServicesEnabled = true;
            if (txt) { txt.textContent = 'AUTO MODE'; txt.style.color = '#32D74B'; }
            if (dot) { dot.style.background = '#32D74B'; dot.style.display = 'block'; }
            showStatus('▶️ MTK AI services enabled', '#32D74B');
        }
        setTimeout(() => { if (dot) dot.style.display = 'none'; }, 2000);
    } catch (e) { 
        showStatus('❌ Toggle failed', '#FF453A');
        console.error('Toggle error:', e);
    }
};

    async function checkMTKServicesStatus() {
        try {
            const result = await exec('pgrep -f "mtk_ai_engine" 2>/dev/null');
            const isRunning = result.trim().length > 0;
            mtkServicesEnabled = isRunning;
            
            const txt = document.getElementById('mon_services');
            const dot = document.getElementById('services-status-dot');
            
            if (isRunning) {
                if (txt) { txt.textContent = 'AUTO MODE'; txt.style.color = '#32D74B'; }
                if (dot) { dot.style.background = '#32D74B'; dot.style.display = 'block'; }
            } else {
                if (txt) { txt.textContent = 'MANUAL MODE'; txt.style.color = '#FF453A'; }
                if (dot) { dot.style.background = '#FF453A'; dot.style.display = 'block'; }
            }
            setTimeout(() => { if (dot) dot.style.display = 'none'; }, 1000);
        } catch (e) {
            console.error('Failed to check mtk_ai_engine status:', e);
            const txt = document.getElementById('mon_services');
            const dot = document.getElementById('services-status-dot');
            if (txt) { txt.textContent = 'MANUAL MODE'; txt.style.color = '#FF453A'; }
            if (dot) { dot.style.background = '#FF453A'; dot.style.display = 'block'; }
            setTimeout(() => { if (dot) dot.style.display = 'none'; }, 1000);
        }
    }

    // ============ OVERLAY TOGGLE ============
    let isOverlayOn = false;
    window.toggleOverlay = async function() {
        const txt = document.getElementById('mon_overlay');
        const dot = document.getElementById('overlay-status-dot');
        if (!txt) return;
        const nextState = !isOverlayOn;
        try {
            await exec(`service call SurfaceFlinger 1034 i32 ${nextState ? 1 : 0}`);
            isOverlayOn = nextState;
            txt.textContent = isOverlayOn ? 'ON' : 'OFF';
            txt.style.color = isOverlayOn ? '#34C759' : '#FF453A';
            if (dot) dot.style.display = isOverlayOn ? 'block' : 'none';
            console.log('Overlay', isOverlayOn ? 'ON' : 'OFF');
        } catch (err) {
            console.error('Overlay error:', err);
            isOverlayOn = !isOverlayOn;
            alert('Failed to toggle overlay. Root required?');
        }
    };

    // ============ UTILITIES ============
    function showStatus(msg, color) {
        const el = document.getElementById('status-message');
        if (el) { el.textContent = msg; el.style.color = color || ''; }
    }
    
    function startLiveUpdates() {
        // System stats every 2 seconds
        setInterval(() => { 
            try { loadSystemStatus(); } catch (e) {} 
        }, 2000);
        
        // MTK service status every 5 seconds
        setInterval(() => { 
            try { checkMTKServicesStatus(); } catch (e) {} 
        }, 5000);
    }

    function setupEventListeners() {
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', () => {
                const page = item.dataset.page;
                document.querySelectorAll('.nav-item').forEach(n => 
                    n.classList.toggle('active', n.dataset.page === page));
                document.querySelectorAll('.page').forEach(p => 
                    p.classList.toggle('active', p.id === `${page}-page`));
            });
        });
        
        const svcCard = document.getElementById('mtk-services-card');
        if (svcCard) svcCard.addEventListener('click', window.toggleMTKServices);
    }

    // ============ VIEW DETAILS (Google Search) ============    
    function setupViewDetails() {
        const viewDetailsBtn = document.getElementById('view-detailed-info');
        if (viewDetailsBtn) {
            viewDetailsBtn.addEventListener('click', () => {
                const deviceName = state.deviceInfo.name || 
                                  document.getElementById('device-name')?.textContent || 
                                  'Unknown Device';
                const searchTerm = `${deviceName} specs review`;
                const googleUrl = `https://www.google.com/search?q=${encodeURIComponent(searchTerm)}`;
                window.open(googleUrl, '_blank');
            });
        }
    }

    // ============ INIT ============
    async function init() {
        console.log('MTK AI Engine initializing...');
        await loadDeviceInfo();
        await loadSystemStatus();
        await checkMTKServicesStatus();
        setupEventListeners();
        setupViewDetails();
        startLiveUpdates();
        console.log('MTK AI Engine ready.');
    }
    
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();