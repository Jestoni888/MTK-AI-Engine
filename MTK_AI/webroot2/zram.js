// zram.js - ZRAM Manager (Standalone Version)
(function() {
    'use strict';
    
    // Helper: Parse size strings like "3712M", "4G", "512K" → MB integer
function parseSizeString(sizeStr) {
    if (!sizeStr) return null;
    sizeStr = sizeStr.trim().toUpperCase();
    const match = sizeStr.match(/^(\d+(?:\.\d+)?)([MGK]?)$/);
    if (!match) return parseInt(sizeStr) || null;
    
    const value = parseFloat(match[1]);
    const unit = match[2];
    
    if (unit === 'G') return Math.round(value * 1024);      // GB → MB
    if (unit === 'K') return Math.round(value / 1024);      // KB → MB
    return Math.round(value);                                // MB or no unit
}

    const CONFIG_DIR = '/data/adb/zram_config';
    const CONFIG_FILE = `${CONFIG_DIR}/settings.conf`;
    let physicalRamMB = 4096;
    let currentZramMB = 4096;
    let currentSwappiness = 60;
    let currentAlgo = 'zstd';
    let statsInterval = null;

    // Self-contained exec wrapper (doesn't depend on front.js)
    const execFn = async function(cmd, timeout = 3000) {
        return new Promise(resolve => {
            const cb = `zram_exec_${Date.now()}_${Math.random().toString(36).substring(2)}`;
            const t = setTimeout(() => { delete window[cb]; resolve(''); }, timeout);
            window[cb] = (_, res) => { clearTimeout(t); delete window[cb]; resolve(res || ''); };
            if (window.ksu) {
                try { ksu.exec(cmd, `window.${cb}`); }
                catch (e) { clearTimeout(t); resolve(''); }
            } else {
                clearTimeout(t);
                resolve('');
            }
        });
    };

    async function init() {
        await detectPhysicalRam();
        await loadCurrentZramState();
        bindClickHandler();
    }

    async function detectPhysicalRam() {
        try {
            const memTotal = await execFn("cat /proc/meminfo | grep MemTotal | awk '{print $2}'");
            physicalRamMB = Math.floor(parseInt(memTotal) / 1024) || 4096;
        } catch (e) {
            physicalRamMB = 4096;
        }
    }

    async function loadCurrentZramState() {
        try {
            const swapInfo = await execFn("grep '/zram' /proc/swaps | awk '{print $1}'");
            const zramDev = (swapInfo.trim() || "/dev/block/zram0").split("/").pop();
            
            const disksize = await execFn(`cat /sys/block/${zramDev}/disksize 2>/dev/null`);
            if (disksize && disksize.trim() !== "0") {                currentZramMB = Math.floor(parseInt(disksize) / 1024 / 1024);
            } else {
                currentZramMB = Math.min(Math.floor(0.5 * physicalRamMB), 8192);
            }

            const swappiness = await execFn("cat /proc/sys/vm/swappiness 2>/dev/null");
            currentSwappiness = swappiness.trim() ? parseInt(swappiness.trim()) : 60;

            const algo = await execFn(`cat /sys/block/${zramDev}/comp_algorithm 2>/dev/null`);
            if (algo.trim()) {
                const match = algo.match(/\[([^\]]+)\]/);
                currentAlgo = match ? match[1] : 'zstd';
            }
        } catch (e) {
            console.warn('Failed to load zRAM state:', e);
        }
        updateCardDisplay();
    }

    function updateCardDisplay() {
        const valEl = document.querySelector('#zram-manager-item .setting-value');
        if (valEl) {
            valEl.innerHTML = `${currentZramMB} MB <i class="fas fa-chevron-right"></i>`;
        }
    }

    function bindClickHandler() {
        const item = document.getElementById('zram-manager-item');
        if (!item) {
            console.warn('ZRAM: ID #zram-manager-item not found');
            return;
        }
        item.style.cursor = 'pointer';
        item.addEventListener('click', showZramModal);
    }

    function showZramModal() {
        const existing = document.getElementById('zram-modal');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = 'zram-modal';
        modal.style.cssText = `
            position: fixed; inset: 0; background: rgba(0,0,0,0.85); z-index: 10000;
            display: flex; align-items: center; justify-content: center;
            backdrop-filter: blur(5px);
        `;

        const box = document.createElement('div');
        box.style.cssText = `            background: linear-gradient(135deg, #1a1f3a, #2d3561);
            border: 2px solid #007AFF;
            border-radius: 20px;
            padding: 24px; width: 90%; max-width: 450px;
            box-shadow: 0 0 40px rgba(0,122,255,0.2);
        `;

        // Header
        const header = document.createElement('div');
        header.style.cssText = 'text-align: center; margin-bottom: 20px;';
        header.innerHTML = `
            <h3 style="color: #007AFF; margin: 0; font-size: 20px;">🗄️ ZRAM Manager</h3>
            <p style="color: #8b92b4; font-size: 12px; margin: 5px 0 0;">Physical RAM: ${(physicalRamMB/1024).toFixed(1)} GB</p>
        `;

        // ZRAM Size Slider
        const sizeSection = createSection('💾 ZRAM Size');
        const sizeSlider = createSlider(currentZramMB, 256, Math.min(20480, physicalRamMB * 4), 128, (val) => {
            currentZramMB = val;
            sizeSection.querySelector('.slider-value').textContent = val >= 1024 ? `${(val/1024).toFixed(1)} GB` : `${val} MB`;
            checkSizeWarning(val);
        });
        sizeSection.appendChild(sizeSlider);
        box.appendChild(sizeSection);

        // Warning Element
        const warningEl = document.createElement('div');
        warningEl.id = 'zram-warning';
        warningEl.style.cssText = 'font-size: 11px; color: #FFCC00; margin-top: 4px; min-height: 16px;';
        box.appendChild(warningEl);

        // Algorithm Selector
        const algoSection = createSection('⚙️ Compression Algorithm');
        const algoSelect = document.createElement('select');
        algoSelect.id = 'zram-algo-select';
        algoSelect.style.cssText = `
            width: 100%; padding: 10px; background: rgba(0,0,0,0.3); color: #fff;
            border: 1px solid rgba(255,255,255,0.2); border-radius: 8px; margin-top: 8px;
        `;
        ['zstd', 'lz4', 'lzo', 'lz4hc'].forEach(algo => {
            const opt = document.createElement('option');
            opt.value = algo; opt.textContent = algo.toUpperCase();
            if (algo === currentAlgo) opt.selected = true;
            algoSelect.appendChild(opt);
        });
        algoSection.appendChild(algoSelect);
        box.appendChild(algoSection);

        // Swappiness Slider
        const swapSection = createSection('🔄 Swappiness');        const swapSlider = createSlider(currentSwappiness, 0, 200, 10, (val) => {
            currentSwappiness = val;
            swapSection.querySelector('.slider-value').textContent = val;
        });
        swapSection.appendChild(swapSlider);
        box.appendChild(swapSection);

        // Live Stats Box
        const statsBox = document.createElement('div');
        statsBox.id = 'zram-stats-box';
        statsBox.style.cssText = `
            background: rgba(0,0,0,0.4); padding: 12px; border-radius: 10px;
            margin: 16px 0; text-align: center; font-size: 13px; color: #8b92b4;
        `;
        statsBox.textContent = 'Loading stats...';
        box.appendChild(statsBox);

        // Apply Button
        const applyBtn = document.createElement('button');
        applyBtn.textContent = '💾 Apply & Save';
        applyBtn.style.cssText = `
            width: 100%; padding: 14px; margin-top: 10px;
            background: linear-gradient(135deg, #007AFF, #0056b3);
            color: #fff; border: none; border-radius: 12px;
            font-size: 14px; font-weight: 700; cursor: pointer;
        `;
        applyBtn.onclick = () => applyZram(algoSelect.value);
        box.appendChild(applyBtn);

        // Cancel Button
        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = 'Cancel';
        cancelBtn.style.cssText = `
            width: 100%; padding: 12px; margin-top: 10px;
            background: rgba(255,255,255,0.1); color: #fff;
            border: none; border-radius: 10px; font-size: 13px; cursor: pointer;
        `;
        cancelBtn.onclick = () => { modal.remove(); stopLiveStats(); };
        box.appendChild(cancelBtn);

        modal.appendChild(box);
        document.body.appendChild(modal);
        modal.onclick = e => { if (e.target === modal) { modal.remove(); stopLiveStats(); } };

        startLiveStats();
    }

    function createSection(title) {
        const section = document.createElement('div');
        section.style.cssText = 'margin-bottom: 16px;';        section.innerHTML = `<div style="color: #fff; font-size: 13px; font-weight: 600; margin-bottom: 8px;">${title} <span class="slider-value" style="color: #8b92b4; font-weight: 400;"></span></div>`;
        return section;
    }

    function createSlider(value, min, max, step, onChange) {
        const container = document.createElement('div');
        container.style.cssText = 'padding: 8px 0;';
        const slider = document.createElement('input');
        slider.type = 'range'; slider.min = min; slider.max = max; slider.step = step; slider.value = value;
        slider.style.cssText = `
            width: 100%; height: 6px; background: rgba(255,255,255,0.2);
            border-radius: 3px; outline: none; -webkit-appearance: none;
        `;
        slider.oninput = (e) => onChange(parseFloat(e.target.value));
        container.appendChild(slider);
        return container;
    }

    function checkSizeWarning(mb) {
        const warnEl = document.getElementById('zram-warning');
        if (!warnEl) return;
        warnEl.style.display = 'none';
        if (mb > physicalRamMB) {
            warnEl.innerHTML = `⚠️ zRAM (${(mb/1024).toFixed(1)} GB) exceeds physical RAM. May cause thrashing.`;
            warnEl.style.display = 'block';
        } else if (mb > 0.75 * physicalRamMB && mb > 8192) {
            warnEl.innerHTML = `💡 Large allocation. Ensure sufficient free RAM.`;
            warnEl.style.display = 'block';
        }
    }

    async function applyZram(algo) {
    const sizeMB = currentZramMB;
    const sizeBytes = sizeMB * 1024 * 1024; // Convert to bytes for disksize
    const swappiness = currentSwappiness;

    if (sizeMB > 16384 && !confirm(`⚠️ Creating ${sizeMB/1024}GB zRAM may cause instability.\nPhysical RAM: ${physicalRamMB/1024}GB\nContinue?`)) return;

    const applyBtn = document.querySelector('#zram-modal button[onclick]');
    const statsBox = document.getElementById('zram-stats-box');
    if (applyBtn) { applyBtn.disabled = true; applyBtn.textContent = '⏳ Applying...'; }
    if (statsBox) statsBox.textContent = 'Resetting zRAM...';

    try {
        // Step 1: Find zram device
        let zramDev = await execFn("grep '/zram' /proc/swaps | awk '{print $1}' | head -1");
        zramDev = zramDev.trim() || "/dev/block/zram0";
        const zramName = zramDev.split("/").pop(); // e.g., "zram0"

        // Step 2: Disable swap first
        await execFn(`swapoff ${zramDev} 2>/dev/null`);
        
        // Small delay to ensure swapoff completes
        await new Promise(r => setTimeout(r, 100));

        // Step 3: Reset zram device
        await execFn(`echo 1 > /sys/block/${zramName}/reset`);
        
        // Delay for reset to complete (critical!)
        await new Promise(r => setTimeout(r, 200));

        // Step 4: Set compression algorithm (AFTER reset)
        await execFn(`echo ${algo} > /sys/block/${zramName}/comp_algorithm 2>/dev/null`);

        // Step 5: Set disksize in BYTES (not MB string!)
        await execFn(`echo ${sizeBytes} > /sys/block/${zramName}/disksize`);

        // Step 6: Create swap and enable
        await execFn(`mkswap ${zramDev} >/dev/null 2>&1`);
        await execFn(`swapon -p 100 ${zramDev} 2>/dev/null || swapon ${zramDev}`);

        // Step 7: Set swappiness
        await execFn(`echo ${swappiness} > /proc/sys/vm/swappiness`);

        // Step 8: Save config persistently
        await execFn(`mkdir -p ${CONFIG_DIR}`);
        await execFn(`echo "SIZE=${sizeMB}M" > ${CONFIG_FILE}`);
        await execFn(`echo "ALGO=${algo}" >> ${CONFIG_FILE}`);
        await execFn(`echo "SWAP=${swappiness}" >> ${CONFIG_FILE}`);

        // Update local state
        currentZramMB = sizeMB;
        currentSwappiness = swappiness;
        currentAlgo = algo;
        updateCardDisplay();
        
        if (statsBox) statsBox.innerHTML = '<span style="color:#32D74B">✅ Applied successfully!</span>';
        
        // Close modal after success
        setTimeout(() => { 
            document.getElementById('zram-modal')?.remove(); 
            stopLiveStats(); 
        }, 800);

    } catch (e) {
        console.error('ZRAM apply failed:', e);
        if (statsBox) statsBox.innerHTML = '<span style="color:#FF453A">❌ Failed. Check root/logs.</span>';
        if (applyBtn) { applyBtn.disabled = false; applyBtn.textContent = '💾 Apply & Save'; }
        
        // Show debug info
        alert(`Error applying ZRAM:\n${e.message || e}\n\nEnsure:\n• Device is rooted\n• KSU has shell permissions\n• No other process is using zram`);
    }
}

    function startLiveStats() {
        stopLiveStats();
        statsInterval = setInterval(async () => {
            const statsEl = document.getElementById('zram-stats-box');
            if (!statsEl) { stopLiveStats(); return; }
            
            try {
                const swapInfo = await execFn("grep '/zram' /proc/swaps | awk '{print $1}'", 1000);
                const zramDev = (swapInfo.trim() || "/dev/block/zram0").split("/").pop();
                
                const mmStat = await execFn(`cat /sys/block/${zramDev}/mm_stat`, 1000);
                const disksize = await execFn(`cat /sys/block/${zramDev}/disksize`, 1000);
                
                if (mmStat && mmStat.trim() !== "" && mmStat !== "TIMEOUT") {
                    const parts = mmStat.trim().split(/\s+/);
                    const usedMB = (parseInt(parts[1]) / 1024 / 1024).toFixed(2);
                    const totalGB = (parseInt(disksize) / 1024 / 1024 / 1024).toFixed(2);
                    statsEl.innerHTML = `<span style="color:#32D74B">● ACTIVE</span> | ${usedMB} MB used / ${totalGB} GB total`;                } else {
                    statsEl.textContent = 'Inactive or not mounted';
                }
            } catch (e) {
                statsEl.textContent = 'Stats unavailable';
            }
        }, 3000);
    }

    function stopLiveStats() {
        if (statsInterval) clearInterval(statsInterval);
        statsInterval = null;
    }

    // Initialize
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();