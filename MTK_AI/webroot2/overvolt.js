// overvolt.js - Universal Performance/Frequency Tuner
(function() {
    'use strict';

    const CONFIG_FILE = '/sdcard/MTK_AI_Engine/overvolt.conf';
    let hwPaths = { cpu: [], gpu: [], thermal: [] };
    let stockValues = { maxFreq: 0, minFreq: 0, thermalMax: 0 };
    let currentProfile = 'balanced';
    let customSettings = { cpuMinPct: 30, cpuMaxPct: 100, thermalPct: 100, gpuBoost: false };

    // Safe exec wrapper - EXACT COPY from iotweaks.js
    const execFn = window.exec || async function(cmd, timeout = 5000) {
        return new Promise(resolve => {
            const cb = `ov_exec_${Date.now()}_${Math.random().toString(36).substring(2)}`;
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
                raw.trim().split('\n').forEach(line => {
                    const [key, val] = line.split('=');
                    if (key === 'profile') currentProfile = val.trim();
                    if (key === 'cpu_min_pct') customSettings.cpuMinPct = parseInt(val) || 30;
                    if (key === 'cpu_max_pct') customSettings.cpuMaxPct = parseInt(val) || 100;
                    if (key === 'thermal_pct') customSettings.thermalPct = parseInt(val) || 100;
                    if (key === 'gpu_boost') customSettings.gpuBoost = val.trim() === '1';
                });
            }
        } catch (e) { 
            console.warn('Overvolt: Config load failed:', e); 
        }
    }

    function bindClickHandler() {
        const btn = document.getElementById('overvolt-btn');
        if (!btn) {
            console.warn('Overvolt: #overvolt-btn not found');
            return;
        }        console.log('Overvolt: Button found, attaching click handler');
        btn.addEventListener('click', () => {
            console.log('Overvolt: Button clicked');
            showOvervoltModal();
        });
    }

    async function scanHardware() {
        hwPaths = { cpu: [], gpu: [], thermal: [] };
        stockValues = { maxFreq: 0, minFreq: 0, thermalMax: 0 };

        // 1. Scan CPU frequencies (Android 10+ uses policy*)
        try {
            const cpuRaw = await execFn('ls -d /sys/devices/system/cpu/cpufreq/policy* 2>/dev/null');
            if (!cpuRaw.trim()) {
                const fallback = await execFn('ls -d /sys/devices/system/cpu/cpu[0-9]*/cpufreq 2>/dev/null');
                cpuRaw.split('\n').filter(Boolean).forEach(p => {
                    if (p.includes('policy')) hwPaths.cpu.push(p);
                });
                fallback.split('\n').filter(Boolean).forEach(p => {
                    if (p.includes('cpu')) hwPaths.cpu.push(p);
                });
            } else {
                hwPaths.cpu = cpuRaw.trim().split('\n').filter(Boolean);
            }

            if (hwPaths.cpu.length) {
                const firstPath = hwPaths.cpu[0];
                const maxRaw = await execFn(`cat ${firstPath}/scaling_max_freq 2>/dev/null`);
                const minRaw = await execFn(`cat ${firstPath}/scaling_min_freq 2>/dev/null`);
                stockValues.maxFreq = parseInt(maxRaw) || 2000000;
                stockValues.minFreq = parseInt(minRaw) || 500000;
            }
        } catch (e) { console.warn('CPU scan failed:', e); }

        // 2. Scan Thermal limits
        try {
            const thermalRaw = await execFn('ls /sys/class/thermal/thermal_zone*/trip_point_*_temp 2>/dev/null');
            hwPaths.thermal = thermalRaw.trim().split('\n').filter(Boolean);
            if (hwPaths.thermal.length) {
                const maxTemp = await execFn(`cat ${hwPaths.thermal[hwPaths.thermal.length - 1]} 2>/dev/null`);
                stockValues.thermalMax = parseInt(maxTemp) || 85000;
            }
        } catch (e) { console.warn('Thermal scan failed:', e); }

        // 3. Scan GPU (common paths)
        try {
            const gpuPaths = [
                '/sys/class/kgsl/kgsl-3d0',
                '/sys/devices/platform/soc/*.gpu',                '/sys/devices/platform/*.gpu',
                '/sys/class/drm/card0/device'
            ];
            for (const base of gpuPaths) {
                const exists = await execFn(`test -d ${base} && echo "yes" || echo ""`);
                if (exists.includes('yes')) {
                    hwPaths.gpu.push(base);
                    break;
                }
            }
        } catch (e) { console.warn('GPU scan failed:', e); }

        console.log('Overvolt: Hardware detected:', hwPaths, stockValues);
    }

    function showOvervoltModal() {
        const existing = document.getElementById('overvolt-modal');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = 'overvolt-modal';
        modal.style.cssText = `
            position: fixed; inset: 0; background: rgba(0,0,0,0.85); z-index: 10000;
            display: flex; align-items: center; justify-content: center;
            backdrop-filter: blur(5px);
        `;

        const box = document.createElement('div');
        box.style.cssText = `
            background: linear-gradient(135deg, #1a1f3a, #2d3561);
            border: 2px solid #ef4444;
            border-radius: 20px;
            padding: 24px; width: 95%; max-width: 460px;
            box-shadow: 0 0 40px rgba(239, 68, 68, 0.2);
        `;

        box.innerHTML = `
            <h3 style="color: #ef4444; margin: 0 0 5px; font-size: 20px; text-align: center;">⚡ Performance Tuner</h3>
            <p style="color: #8b92b4; font-size: 12px; text-align: center; margin-bottom: 18px;">Adaptive CPU/GPU/Thermal optimization for any device</p>

            <div style="display: flex; gap: 8px; margin-bottom: 16px;">
                ${['extreme', 'balanced', 'battery', 'custom'].map(p => `
                    <button class="ov-profile-btn" data-profile="${p}" style="flex:1; padding:10px; border-radius:10px; border:1px solid rgba(255,255,255,0.1); background:${currentProfile===p ? '#ef4444' : 'rgba(0,0,0,0.3)'}; color:#fff; font-size:11px; font-weight:600; cursor:pointer;">
                        ${p === 'extreme' ? '🔥 Extreme' : p === 'balanced' ? '⚖️ Balanced' : p === 'battery' ? '🔋 Battery' : '🔧 Custom'}
                    </button>
                `).join('')}
            </div>

            <div id="ov-controls" style="display: flex; flex-direction: column; gap: 14px; margin-bottom: 16px;">
                <div>                    <div style="display:flex; justify-content:space-between; color:#fff; font-size:12px; font-weight:600; margin-bottom:4px;">
                        <span>CPU Min Freq</span>
                        <span id="ov-min-val" style="color:#ef4444;">${customSettings.cpuMinPct}%</span>
                    </div>
                    <input type="range" id="ov-min-slider" min="10" max="100" value="${customSettings.cpuMinPct}" style="width:100%; height:5px; background:rgba(255,255,255,0.2); border-radius:3px; outline:none;">
                </div>
                <div>
                    <div style="display:flex; justify-content:space-between; color:#fff; font-size:12px; font-weight:600; margin-bottom:4px;">
                        <span>CPU Max Freq</span>
                        <span id="ov-max-val" style="color:#ef4444;">${customSettings.cpuMaxPct}%</span>
                    </div>
                    <input type="range" id="ov-max-slider" min="50" max="100" value="${customSettings.cpuMaxPct}" style="width:100%; height:5px; background:rgba(255,255,255,0.2); border-radius:3px; outline:none;">
                </div>
                <div>
                    <div style="display:flex; justify-content:space-between; color:#fff; font-size:12px; font-weight:600; margin-bottom:4px;">
                        <span>Thermal Limit</span>
                        <span id="ov-thermal-val" style="color:#ef4444;">${customSettings.thermalPct}%</span>
                    </div>
                    <input type="range" id="ov-thermal-slider" min="80" max="110" value="${customSettings.thermalPct}" style="width:100%; height:5px; background:rgba(255,255,255,0.2); border-radius:3px; outline:none;">
                </div>
            </div>

            <div style="background: rgba(239,68,68,0.1); color: #fca5a5; padding: 10px; border-radius: 8px; font-size: 11px; text-align: center; margin-bottom: 15px;">
                <i class="fas fa-exclamation-triangle"></i> Extreme mode may cause instability or shutdowns. Use at your own risk.
            </div>

            <button id="ov-apply-btn" style="width: 100%; padding: 14px; background: linear-gradient(135deg, #ef4444, #b91c1c); color: #fff; border: none; border-radius: 12px; font-size: 14px; font-weight: 700; cursor: pointer; margin-bottom: 10px;">💾 Apply Performance Profile</button>
            <button id="ov-cancel-btn" style="width: 100%; padding: 12px; background: rgba(255,255,255,0.1); color: #fff; border: none; border-radius: 10px; font-size: 13px; cursor: pointer;">Cancel</button>
        `;

        modal.appendChild(box);
        document.body.appendChild(modal);
        modal.onclick = e => { if (e.target === modal) modal.remove(); };

        // Profile buttons
        box.querySelectorAll('.ov-profile-btn').forEach(btn => {
            btn.onclick = () => {
                currentProfile = btn.dataset.profile;
                box.querySelectorAll('.ov-profile-btn').forEach(b => {
                    b.style.background = b.dataset.profile === currentProfile ? '#ef4444' : 'rgba(0,0,0,0.3)';
                });
                applyProfileToUI();
            };
        });

        // Sliders
        const sliders = {
            'ov-min-slider': 'ov-min-val',
            'ov-max-slider': 'ov-max-val',
            'ov-thermal-slider': 'ov-thermal-val'        };
        Object.entries(sliders).forEach(([id, valId]) => {
            const slider = document.getElementById(id);
            const valEl = document.getElementById(valId);
            if (slider && valEl) {
                slider.oninput = () => {
                    valEl.textContent = slider.value + '%';
                    if (id === 'ov-min-slider') customSettings.cpuMinPct = parseInt(slider.value);
                    if (id === 'ov-max-slider') customSettings.cpuMaxPct = parseInt(slider.value);
                    if (id === 'ov-thermal-slider') customSettings.thermalPct = parseInt(slider.value);
                    currentProfile = 'custom';
                    box.querySelectorAll('.ov-profile-btn').forEach(b => b.style.background = 'rgba(0,0,0,0.3)');
                };
            }
        });

        // Apply
        document.getElementById('ov-apply-btn').onclick = async () => applyProfile();
        document.getElementById('ov-cancel-btn').onclick = () => modal.remove();

        // Initial UI sync
        applyProfileToUI();
    }

    function applyProfileToUI() {
        const profiles = {
            extreme: { min: 50, max: 100, thermal: 105 },
            balanced: { min: 30, max: 100, thermal: 100 },
            battery: { min: 20, max: 80, thermal: 95 },
            custom: { min: customSettings.cpuMinPct, max: customSettings.cpuMaxPct, thermal: customSettings.thermalPct }
        };
        const p = profiles[currentProfile] || profiles.balanced;
        customSettings = { ...customSettings, ...p };
        
        document.getElementById('ov-min-slider').value = p.min;
        document.getElementById('ov-min-val').textContent = p.min + '%';
        document.getElementById('ov-max-slider').value = p.max;
        document.getElementById('ov-max-val').textContent = p.max + '%';
        document.getElementById('ov-thermal-slider').value = p.thermal;
        document.getElementById('ov-thermal-val').textContent = p.thermal + '%';
    }

    async function applyProfile() {
        const applyBtn = document.getElementById('ov-apply-btn');
        const statusEl = document.createElement('div');
        statusEl.style.cssText = 'text-align:center; font-size:12px; color:#666; margin-bottom:15px; min-height:40px; padding:8px; background:rgba(0,0,0,0.2); border-radius:8px;';
        const box = document.querySelector('#overvolt-modal > div');
        if (box) box.insertBefore(statusEl, applyBtn);

        applyBtn.disabled = true;        applyBtn.textContent = '⏳ Applying...';
        statusEl.innerHTML = '<span style="color:#FF9F0A;">🔍 Scanning hardware & applying limits...</span>';

        try {
            let applied = [];

            // 1. CPU Frequencies
            if (hwPaths.cpu.length) {
                const minFreq = Math.floor(stockValues.maxFreq * (customSettings.cpuMinPct / 100));
                const maxFreq = Math.floor(stockValues.maxFreq * (customSettings.cpuMaxPct / 100));
                
                for (const path of hwPaths.cpu) {
                    await execFn(`su -c "echo ${minFreq} > ${path}/scaling_min_freq 2>/dev/null"`);
                    await execFn(`su -c "echo ${maxFreq} > ${path}/scaling_max_freq 2>/dev/null"`);
                    await execFn(`su -c "echo performance > ${path}/scaling_governor 2>/dev/null"`);
                }
                applied.push(`CPU: ${customSettings.cpuMinPct}%-${customSettings.cpuMaxPct}%`);
            }

            // 2. Thermal Limits
            if (hwPaths.thermal.length) {
                const newThermal = Math.floor(stockValues.thermalMax * (customSettings.thermalPct / 100));
                for (const path of hwPaths.thermal) {
                    await execFn(`su -c "echo ${newThermal} > ${path} 2>/dev/null"`);
                }
                applied.push(`Thermal: ${customSettings.thermalPct}%`);
            }

            // 3. GPU (best-effort)
            if (hwPaths.gpu.length) {
                const gpuPath = hwPaths.gpu[0];
                const gpuMax = await execFn(`cat ${gpuPath}/gpu_max_clock 2>/dev/null || cat ${gpuPath}/devfreq/max_freq 2>/dev/null`);
                if (gpuMax && parseInt(gpuMax) > 0) {
                    const gpuNew = Math.floor(parseInt(gpuMax) * (customSettings.cpuMaxPct / 100));
                    await execFn(`su -c "echo ${gpuNew} > ${gpuPath}/gpu_max_clock 2>/dev/null || echo ${gpuNew} > ${gpuPath}/devfreq/max_freq 2>/dev/null"`);
                    applied.push('GPU boosted');
                }
            }

            // Save config
            const configContent = `profile=${currentProfile}\ncpu_min_pct=${customSettings.cpuMinPct}\ncpu_max_pct=${customSettings.cpuMaxPct}\nthermal_pct=${customSettings.thermalPct}`;
            await execFn(`mkdir -p /sdcard/MTK_AI_Engine && echo -n "${configContent}" > ${CONFIG_FILE}`);

            // Verify
            statusEl.innerHTML = `<span style="color:#32D74B;">✅ Applied: ${applied.join(' • ')}</span>`;
            if (window.showStatus) window.showStatus(`✅ Performance: ${applied.join(', ')}`, '#ef4444');

            setTimeout(() => document.getElementById('overvolt-modal')?.remove(), 2000);

        } catch (e) {            console.error('Overvolt: Apply failed:', e);
            statusEl.innerHTML = `<span style="color:#FF453A;">❌ Error: ${e.message}</span>`;
            applyBtn.disabled = false;
            applyBtn.textContent = '💾 Apply Performance Profile';
        }
    }

    // Initialize
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Expose for debugging
    window.OvervoltManager = { init, showOvervoltModal, applyProfile };
})();