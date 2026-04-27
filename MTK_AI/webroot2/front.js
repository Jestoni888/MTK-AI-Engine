(function() {
    'use strict';

    // Global state
    const state = {
        currentPage: 'home',
        servicesEnabled: true,
        refreshRate: '120 Hz',
        cpuUsage: 28,
        gpuUsage: 18,
        ramUsage: 42,
        batteryLevel: 78,
        totalRamGB: '8.00',
        usedRamGB: '3.36',
        cpuFreqGhz: '1.02 GHz',
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

    // Safe exec wrapper
    async function exec(command, timeout = 3000) {
        return new Promise((resolve) => {
            const callback = `exec_cb_${Date.now()}_${Math.random().toString(36).substring(2)}`;
            const timer = setTimeout(() => { delete window[callback]; resolve(''); }, timeout);
            window[callback] = (success, result) => {
                clearTimeout(timer);
                delete window[callback];
                resolve(result || '');
            };
            if (window.ksu) {
                try { ksu.exec(command, `window.${callback}`); } 
                catch (e) { clearTimeout(timer); resolve(''); }
            } else {
                clearTimeout(timer);
                resolve('');
            }
        });
    }

    // Load Device Info
    async function loadDeviceInfo() {
        try {            let name = await exec('getprop ro.product.model');
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
            state.deviceInfo.chipset = chipset.trim() || 'MTK Platform';

            const memInfo = await exec('cat /proc/meminfo | grep MemTotal');
            const memMatch = memInfo.match(/MemTotal:\s+(\d+)/);
            if (memMatch) state.deviceInfo.ram = `${(parseInt(memMatch[1]) / 1024 / 1024).toFixed(2)} GB`;

            const storage = await exec('df /data | tail -1');
            const storageMatch = storage.match(/\s+(\d+)\s+\d+\s+\d+\s+\d+%/);
            if (storageMatch) state.deviceInfo.storage = `${Math.floor(parseInt(storageMatch[1]) / 1024 / 1024)} GB`;

            const kernel = await exec('uname -r');
            state.deviceInfo.kernel = kernel.trim() || 'Unknown';

            const uptime = await exec('cat /proc/uptime');
            const sec = parseFloat(uptime.split(' ')[0]);
            const d = Math.floor(sec / 86400);
            const h = Math.floor((sec % 86400) / 3600);
            const m = Math.floor((sec % 3600) / 60);
            state.deviceInfo.uptime = `${d > 0 ? d + 'd ' : ''}${h > 0 ? h + 'h ' : ''}${m}m`.trim();

            updateDeviceInfo();
        } catch (e) { console.error('Device Info Error:', e); }
    }

    function updateDeviceInfo() {
        const map = {
            'device-name': state.deviceInfo.name,
            'codename': `codename: ${state.deviceInfo.codename}`,
            'android-version': state.deviceInfo.android,
            'chipset': state.deviceInfo.chipset,
            'ram': state.deviceInfo.ram,
            'storage': state.deviceInfo.storage,
            'kernel': state.deviceInfo.kernel,            'uptime': state.deviceInfo.uptime
        };
        for (const [id, val] of Object.entries(map)) {
            const el = document.getElementById(id);
            if (el) el.textContent = val;
        }
    }

    // Load System Status
    async function loadSystemStatus() {
        try {
            state.cpuUsage = parseCpuUsage(await exec('top -n 1 | grep "cpu " | head -1')) || 28;
            const gpu = await getGPUInfo();
            state.gpuUsage = gpu.usage || 18;
            state.gpuFreq = gpu.freq || 480;
            state.ramUsage = parseRamUsage(await exec('cat /proc/meminfo | grep Mem')) || 42;
            state.batteryLevel = parseInt(await exec('cat /sys/class/power_supply/battery/capacity')) || 78;
            updateSystemStatus();
        } catch (e) { console.error('System Status Error:', e); }
    }

    async function getGPUInfo() {
        let info = { usage: 0, freq: 0 };
        try {
            for (const p of ['/sys/class/devfreq/soc:gpu/cur_freq', '/sys/class/devfreq/13000000.mali/cur_freq', '/sys/class/devfreq/mali/cur_freq']) {
                const f = await exec(`cat ${p} 2>/dev/null`);
                if (f && !isNaN(parseInt(f.trim()))) { info.freq = Math.round(parseInt(f.trim()) / 1000000); break; }
            }
            for (const p of ['/sys/class/misc/mali0/gpu_usage', '/sys/class/devfreq/soc:gpu/load']) {
                const l = await exec(`cat ${p} 2>/dev/null`);
                if (l && !isNaN(parseInt(l.trim()))) { info.usage = parseInt(l.trim()); break; }
            }
            if (info.freq === 0) info.freq = 480;
            if (info.usage === 0) info.usage = Math.floor(Math.random() * 30);
        } catch (e) {}
        return info;
    }

    function updateSystemStatus() {
        updateCircularProgress('cpu-progress', state.cpuUsage);
        updateCircularProgress('gpu-progress', state.gpuUsage);
        updateCircularProgress('ram-progress', state.ramUsage);
        updateCircularProgress('battery-progress', state.batteryLevel);

        const cpuEl = document.getElementById('cpu-freq');
        if (cpuEl) (async () => { try { const f = await exec('cat /sys/devices/system/cpu/cpufreq/policy0/scaling_cur_freq 2>/dev/null'); if (f && !isNaN(parseInt(f.trim()))) cpuEl.textContent = `${(parseInt(f.trim()) / 1000000).toFixed(2)} GHz`; } catch(e){} })();

        const gpuEl = document.getElementById('gpu-freq');
        if (gpuEl) gpuEl.textContent = `${state.gpuFreq} MHz`;
        const ramEl = document.getElementById('ram-text');
        if (ramEl) (async () => { try { const t = await exec('cat /proc/meminfo | grep MemTotal | awk \'{print $2}\''); const f = await exec('cat /proc/meminfo | grep MemFree | awk \'{print $2}\''); if (t && f) ramEl.textContent = `${((parseInt(t.trim()) - parseInt(f.trim())) / 1024 / 1024).toFixed(2)} / ${(parseInt(t.trim()) / 1024 / 1024).toFixed(2)} GB`; } catch(e){} })();

        const battEl = document.getElementById('battery-temp');
        if (battEl) (async () => { try { const tmp = await exec('cat /sys/class/power_supply/battery/temp 2>/dev/null'); if (tmp && !isNaN(parseInt(tmp.trim()))) { const c = (parseInt(tmp.trim()) / 10).toFixed(0); battEl.textContent = `${c}°C • ${c < 35 ? 'Good' : c < 40 ? 'Warm' : 'Hot'}`; } } catch(e){} })();
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
                circle.style.strokeDashoffset = c - (pct / 100) * c;
            }
            const txt = el.querySelector('.progress-text');
            if (txt) txt.textContent = `${pct}%`;
        } catch (e) {}
    }

    function parseCpuUsage(out) { if (!out) return 28; const m = out.match(/(\d+\.?\d*)%\s*(?:id|us)/); return m ? Math.round(100 - parseFloat(m[1])) : 28; }
    function parseRamUsage(out) {
        if (!out) return 42; let t = 0, f = 0;
        out.split('\n').forEach(l => {
            if (l.includes('MemTotal:')) { const m = l.match(/\d+/); if (m) t = parseInt(m[0]); }
            if (l.includes('MemFree:')) { const m = l.match(/\d+/); if (m) f = parseInt(m[0]); }
        });
        return t > 0 ? Math.round((1 - f / t) * 100) : 42;
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

// Check status using pgrep for mtk_ai_engine specifically
async function checkMTKServicesStatus() {
    try {
        // Check for the actual mtk_ai_engine process (more accurate than service.sh)
        const result = await exec('pgrep -f "mtk_ai_engine" 2>/dev/null');
        const isRunning = result.trim().length > 0;
        
        mtkServicesEnabled = isRunning;
        
        const txt = document.getElementById('mon_services');
        const dot = document.getElementById('services-status-dot');
        
        if (isRunning) {
            // Service IS running → AUTO MODE
            if (txt) { 
                txt.textContent = 'AUTO MODE'; 
                txt.style.color = '#32D74B'; 
            }
            if (dot) { 
                dot.style.background = '#32D74B'; 
                dot.style.display = 'block'; 
            }
        } else {
            // Service NOT running → MANUAL MODE
            if (txt) { 
                txt.textContent = 'MANUAL MODE'; 
                txt.style.color = '#FF453A'; 
            }
            if (dot) { 
                dot.style.background = '#FF453A'; 
                dot.style.display = 'block'; 
            }
        }
        
        // Hide dot after 1 second
        setTimeout(() => { if (dot) dot.style.display = 'none'; }, 1000);
        
    } catch (e) {
        console.error('Failed to check mtk_ai_engine status:', e);
        // Fallback: assume stopped on error
        const txt = document.getElementById('mon_services');
        const dot = document.getElementById('services-status-dot');
        if (txt) { txt.textContent = 'MANUAL MODE'; txt.style.color = '#FF453A'; }
        if (dot) { dot.style.background = '#FF453A'; dot.style.display = 'block'; }
        setTimeout(() => { if (dot) dot.style.display = 'none'; }, 1000);
    }
}

// Run status check on page load
checkMTKServicesStatus();

// Optional: Re-check status every 10 seconds to stay in sync
setInterval(() => {
    checkMTKServicesStatus();
}, 10000);

    // Overlay Toggle (Exposed to window for HTML onclick)
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

    function showStatus(msg, color) {
        const el = document.getElementById('status-message');
        if (el) { el.textContent = msg; el.style.color = color || ''; }
    }
    function startLiveUpdates() {
        setInterval(() => { try { loadSystemStatus(); } catch (e) {} }, 3000);
        setInterval(() => { try { checkMTKServicesStatus(); } catch (e) {} }, 5000);
    }

    function setupEventListeners() {
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', () => {
                const page = item.dataset.page;
                document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.page === page));
                document.querySelectorAll('.page').forEach(p => p.classList.toggle('active', p.id === `${page}-page`));
            });
        });
        const svcCard = document.getElementById('mtk-services-card');
        if (svcCard) svcCard.addEventListener('click', window.toggleMTKServices);
    }

    async function init() {
        console.log('MTK AI Engine initializing...');
        await loadDeviceInfo();
        await loadSystemStatus();
        await checkMTKServicesStatus();
        setupEventListeners();
        startLiveUpdates();
        console.log('MTK AI Engine ready.');
    }
    
    // Add this to your front.js file - either in setupEventListeners() or after DOM load

// View Detailed Info - Search Google for device
const viewDetailsBtn = document.getElementById('view-detailed-info');
if (viewDetailsBtn) {
    viewDetailsBtn.addEventListener('click', () => {
        // Get device name from the DOM or state
        const deviceName = state.deviceInfo.name || 
                          document.getElementById('device-name')?.textContent || 
                          'Unknown Device';
        
        // Create Google search URL
        const searchTerm = `${deviceName} specs review`;
        const googleUrl = `https://www.google.com/search?q=${encodeURIComponent(searchTerm)}`;
        
        // Open in new tab/window
        window.open(googleUrl, '_blank');
    });
}

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();