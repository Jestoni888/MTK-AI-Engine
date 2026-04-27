// gpu.js - GPU Frequency Manager for MediaTek Devices
(function() {
    'use strict';

    const CONFIG_DIR = '/sdcard/MTK_AI_Engine';
    const CONFIG_FILE = `${CONFIG_DIR}/global_gpu_opp_index.txt`;
    
    let gpuFrequencyMap = {};
    let detectedMinFreq = 300;
    let detectedMaxFreq = 900;
    let gpuDriverType = null;
    let oppCount = 33;
    let currentOppIndex = 0;
    let isApplying = false;
    let debugInfo = {};

    // Safe exec wrapper (uses global exec if available)
    const execFn = typeof window.exec === 'function' ? window.exec : async function(cmd, timeout = 3000) {
        return new Promise(resolve => {
            const cb = `gpu_exec_${Date.now()}_${Math.random().toString(36).substring(2)}`;
            const t = setTimeout(() => { delete window[cb]; resolve(''); }, timeout);
            window[cb] = (_, res) => { clearTimeout(t); delete window[cb]; resolve(res || ''); };
            if (window.ksu) ksu.exec(cmd, `window.${cb}`);
            else { clearTimeout(t); resolve(''); }
        });
    };

    async function init() {
        await loadGpuSettings();
        bindClickHandler();
    }

    async function detectGpuDriver() {
        debugInfo = {};
        try {
            const v2 = await execFn('cat /proc/gpufreqv2/gpu_working_opp_table 2>/dev/null');
            debugInfo.v2Exists = v2 ? 'YES' : 'NO';
            if (v2 && v2.includes('freq')) {
                gpuDriverType = 'gpufreqv2';
                debugInfo.detected = 'gpufreqv2';
                return 'gpufreqv2';
            }
        } catch (e) { debugInfo.v2Error = e.message; }
        
        try {
            const legacy = await execFn('cat /proc/gpufreq/gpufreq_opp_dump 2>/dev/null');
            debugInfo.legacyExists = legacy ? 'YES' : 'NO';
            if (legacy && legacy.includes('freq')) {
                gpuDriverType = 'gpufreq';
                debugInfo.detected = 'gpufreq';                return 'gpufreq';
            }
        } catch (e) { debugInfo.legacyError = e.message; }
        
        gpuDriverType = null;
        debugInfo.detected = 'NONE';
        return null;
    }

    async function buildGpuFrequencyMap() {
        gpuFrequencyMap = {};
        try {
            let raw = '';
            if (gpuDriverType === 'gpufreqv2') {
                raw = await execFn('cat /proc/gpufreqv2/gpu_working_opp_table 2>/dev/null');
            } else if (gpuDriverType === 'gpufreq') {
                raw = await execFn('cat /proc/gpufreq/gpufreq_opp_dump 2>/dev/null');
            }
            
            if (raw) {
                const lines = raw.trim().split('\n');
                for (const line of lines) {
                    const match = line.match(/\[(\d+)\]\s*freq\s*[=:]\s*(\d+)/);
                    if (match) {
                        const idx = parseInt(match[1]);
                        const freqKhz = parseInt(match[2]);
                        gpuFrequencyMap[idx] = Math.round(freqKhz / 1000); // Convert to MHz
                    }
                }
            }
        } catch (e) { debugInfo.parseError = e.message; }
        
        // Fallback if no frequencies detected
        if (Object.keys(gpuFrequencyMap).length === 0) {
            for (let i = 0; i <= 32; i++) {
                gpuFrequencyMap[i] = Math.round(900 - 600 * i / 32);
            }
        }
        
        oppCount = Object.keys(gpuFrequencyMap).length;
        const values = Object.values(gpuFrequencyMap);
        detectedMinFreq = Math.min(...values);
        detectedMaxFreq = Math.max(...values);
        
        debugInfo.oppCount = oppCount;
        debugInfo.minFreq = detectedMinFreq;
        debugInfo.maxFreq = detectedMaxFreq;
    }

    function updateCardDisplay() {        const valEl = document.querySelector('#gpu-freq-item .setting-value');
        if (valEl) {
            const freq = gpuFrequencyMap[currentOppIndex] || detectedMaxFreq;
            valEl.innerHTML = `${freq} MHz <i class="fas fa-chevron-right"></i>`;
        }
    }

    function bindClickHandler() {
        const item = document.getElementById('gpu-freq-item');
        if (!item) return;
        
        item.style.cursor = 'pointer';
        item.addEventListener('click', showGpuModal);
    }

    function showGpuModal() {
        const existing = document.getElementById('gpu-modal');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = 'gpu-modal';
        modal.style.cssText = `
            position: fixed; inset: 0; background: rgba(0,0,0,0.85); z-index: 10000;
            display: flex; align-items: center; justify-content: center;
            backdrop-filter: blur(5px);
        `;

        const box = document.createElement('div');
        box.style.cssText = `
            background: linear-gradient(135deg, #1a1f3a, #2d3561);
            border: 2px solid #FF453A;
            border-radius: 20px;
            padding: 24px; width: 95%; max-width: 450px;
            box-shadow: 0 0 40px rgba(255, 69, 58, 0.2);
        `;

        // Header
        const header = document.createElement('div');
        header.style.cssText = 'text-align: center; margin-bottom: 20px;';
        header.innerHTML = `
            <h3 style="color: #FF453A; margin: 0; font-size: 20px;">🎮 GPU Frequency</h3>
            <p style="color: #8b92b4; font-size: 12px; margin: 5px 0 0;">${gpuDriverType || 'Unknown'} | ${oppCount} OPPs</p>
        `;

        // Frequency Range Labels
        const rangeLabels = document.createElement('div');
        rangeLabels.style.cssText = 'display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 11px; color: #8b92b4;';
        rangeLabels.innerHTML = `<span>${detectedMinFreq} MHz</span><span>${detectedMaxFreq} MHz</span>`;
        box.appendChild(rangeLabels);
        // Slider Section
        const sliderSection = document.createElement('div');
        sliderSection.style.cssText = 'margin-bottom: 24px;';
        
        const labelRow = document.createElement('div');
        labelRow.style.cssText = 'display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;';
        labelRow.innerHTML = `
            <span style="color: #fff; font-size: 14px; font-weight: 600;">GPU Frequency</span>
            <span id="gpu-opp-val" style="color: #FF453A; font-size: 18px; font-weight: 700;">${gpuFrequencyMap[currentOppIndex] || detectedMaxFreq} MHz</span>
        `;
        
        const slider = document.createElement('input');
        slider.type = 'range';
        slider.min = 0;
        slider.max = oppCount - 1;
        slider.step = 1;
        // Invert: slider max = lowest freq (index 0), slider min = highest freq (index oppCount-1)
        slider.value = oppCount - 1 - currentOppIndex;
        slider.id = 'gpu-opp-slider';
        slider.style.cssText = `
            width: 100%; height: 6px; background: rgba(255,255,255,0.2);
            border-radius: 3px; outline: none; -webkit-appearance: none;
        `;
        slider.oninput = (e) => {
            const sliderVal = parseInt(e.target.value);
            currentOppIndex = oppCount - 1 - sliderVal;
            const freq = gpuFrequencyMap[currentOppIndex] || detectedMaxFreq;
            document.getElementById('gpu-opp-val').textContent = `${freq} MHz`;
        };

        // Add custom thumb style
        const style = document.createElement('style');
        style.textContent = `
            input[type=range]::-webkit-slider-thumb {
                -webkit-appearance: none; width: 22px; height: 22px; 
                background: #FF453A; border-radius: 50%; cursor: pointer;
                border: 2px solid #fff;
            }
        `;
        document.head.appendChild(style);

        sliderSection.append(labelRow, slider);
        box.appendChild(sliderSection);

        // Info Box
        const infoBox = document.createElement('div');
        infoBox.style.cssText = `
            background: rgba(255,69,58,0.1); border: 1px solid rgba(255,69,58,0.3);
            border-radius: 10px; padding: 12px; margin-bottom: 20px; font-size: 12px; color: #FF453A;
        `;        infoBox.innerHTML = `
            <strong>💡 Tip:</strong> Higher frequency = better performance but more heat/battery drain.<br>
            Lower frequency = cooler operation, better battery life.
        `;
        box.appendChild(infoBox);

        // Status Text
        const statusEl = document.createElement('div');
        statusEl.id = 'gpu-status-msg';
        statusEl.style.cssText = 'text-align: center; font-size: 13px; color: #666; margin-bottom: 16px; min-height: 20px; padding: 8px; border-radius: 8px;';
        statusEl.textContent = 'Status: Ready';
        box.appendChild(statusEl);

        // Apply Button
        const applyBtn = document.createElement('button');
        applyBtn.id = 'apply-global-gpu-btn';
        applyBtn.textContent = '💾 Apply GPU Frequency';
        applyBtn.style.cssText = `
            width: 100%; padding: 14px; margin-bottom: 10px;
            background: linear-gradient(135deg, #FF453A, #d63031);
            color: #fff; border: none; border-radius: 12px;
            font-size: 14px; font-weight: 700; cursor: pointer;
            box-shadow: 0 4px 15px rgba(255, 69, 58, 0.4);
        `;
        applyBtn.onclick = async () => {
            await applyGlobalGpuSettings(applyBtn, statusEl);
        };
        box.appendChild(applyBtn);

        // Debug Button (optional)
        const debugBtn = document.createElement('button');
        debugBtn.textContent = '🔍 Show Debug Info';
        debugBtn.style.cssText = `
            width: 100%; padding: 10px; margin-bottom: 10px;
            background: rgba(255,255,255,0.1); color: #8b92b4;
            border: 1px solid rgba(255,255,255,0.2); border-radius: 10px;
            font-size: 12px; cursor: pointer;
        `;
        debugBtn.onclick = () => {
            alert(JSON.stringify(debugInfo, null, 2));
        };
        box.appendChild(debugBtn);

        // Cancel Button
        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = 'Cancel';
        cancelBtn.style.cssText = `
            width: 100%; padding: 12px;
            background: rgba(255,255,255,0.1); color: #fff;
            border: none; border-radius: 10px; font-size: 13px; cursor: pointer;        `;
        cancelBtn.onclick = () => modal.remove();
        box.appendChild(cancelBtn);

        modal.appendChild(box);
        document.body.appendChild(modal);
        modal.onclick = e => { if (e.target === modal) modal.remove(); };
    }

    async function loadGpuSettings() {
        try {
            await detectGpuDriver();
            await buildGpuFrequencyMap();
            
            // Load saved OPP index
            let savedIdx = await loadFromSdCard();
            if (savedIdx === null) {
                // Fallback to localStorage
                const ls = localStorage.getItem('gpu_opp_index');
                if (ls) savedIdx = parseInt(ls);
            }
            
            if (savedIdx !== null && !isNaN(savedIdx)) {
                currentOppIndex = Math.max(0, Math.min(savedIdx, oppCount - 1));
            }
            
            updateCardDisplay();
        } catch (e) {
            console.warn('GPU load failed, using defaults:', e);
            currentOppIndex = 0;
            updateCardDisplay();
        }
    }

    async function loadFromSdCard() {
        try {
            const raw = await execFn(`cat ${CONFIG_FILE} 2>/dev/null`);
            const val = parseInt(raw?.trim());
            if (!isNaN(val) && val >= 0 && val < oppCount) {
                debugInfo.loadedFromSd = 'YES';
                return val;
            }
            debugInfo.loadedFromSd = 'NO (invalid)';
        } catch (e) {
            debugInfo.loadedFromSd = `NO (${e.message})`;
        }
        return null;
    }

    async function saveToSdCard(index) {        try {
            // Try direct write first
            await execFn(`mkdir -p ${CONFIG_DIR} && echo '${index}' > ${CONFIG_FILE}`);
            const verify = await execFn(`cat ${CONFIG_FILE} 2>/dev/null`);
            if (verify?.trim() === index.toString()) {
                debugInfo.saveMethod = 'Direct write';
                debugInfo.saveSuccess = 'YES';
                return true;
            }
        } catch (e) {
            debugInfo.saveError = e.message;
        }
        
        // Fallback with su -c
        try {
            await execFn(`su -c "mkdir -p ${CONFIG_DIR} && echo '${index}' > ${CONFIG_FILE}"`);
            const verify = await execFn(`cat ${CONFIG_FILE} 2>/dev/null`);
            if (verify?.trim() === index.toString()) {
                debugInfo.saveMethod = 'su -c';
                debugInfo.saveSuccess = 'YES';
                return true;
            }
        } catch (e) {
            debugInfo.saveSuError = e.message;
        }
        
        debugInfo.saveSuccess = 'NO';
        return false;
    }

    async function applyGlobalGpuSettings(applyBtn, statusEl) {
        if (isApplying) {
            if (statusEl) statusEl.textContent = '⏳ Already applying...';
            return;
        }
        
        isApplying = true;
        const targetIdx = currentOppIndex;
        const targetFreq = gpuFrequencyMap[targetIdx] || detectedMaxFreq;
        const targetFreqKhz = targetFreq * 1000;
        
        if (applyBtn) {
            applyBtn.disabled = true;
            applyBtn.textContent = '⏳ Applying...';
        }
        if (statusEl) {
            statusEl.textContent = `⏳ Applying ${targetFreq} MHz...`;
            statusEl.style.color = '#FF9F0A';
            statusEl.style.background = 'rgba(255,159,10,0.15)';
        }
        try {
            // Ensure config dir exists
            await execFn(`mkdir -p ${CONFIG_DIR}`);
            
            // Save to SD card
            await saveToSdCard(targetIdx);
            
            // Also save to localStorage as fallback
            localStorage.setItem('gpu_opp_index', targetIdx.toString());
            
            // Apply based on driver type
            if (gpuDriverType === 'gpufreqv2') {
                await execFn(`su -c "echo ${targetIdx} > /proc/gpufreqv2/fix_target_opp_index"`);
                debugInfo.execCmd = `echo ${targetIdx} > /proc/gpufreqv2/fix_target_opp_index`;
            } else if (gpuDriverType === 'gpufreq') {
                await execFn(`su -c "echo ${targetFreqKhz} > /proc/gpufreq/gpufreq_opp_freq"`);
                await execFn(`su -c "echo ${targetIdx} > /proc/gpufreq/gpufreq_sb_idx" 2>/dev/null`);
                debugInfo.execCmd = `echo ${targetFreqKhz} > /proc/gpufreq/gpufreq_opp_freq`;
            } else {
                // Try both as fallback
                await execFn(`su -c "echo ${targetIdx} > /proc/gpufreqv2/fix_target_opp_index" 2>/dev/null`);
                await execFn(`su -c "echo ${targetFreqKhz} > /proc/gpufreq/gpufreq_opp_freq" 2>/dev/null`);
            }
            
            // Update card display
            updateCardDisplay();
            
            // Success feedback
            if (statusEl) {
                statusEl.textContent = `✅ SUCCESS: ${targetFreq} MHz | Saved`;
                statusEl.style.color = '#32D74B';
                statusEl.style.background = 'rgba(50,215,75,0.15)';
            }
            if (window.showStatus) {
                window.showStatus(`✅ GPU: ${targetFreq} MHz`, '#FF453A');
            }
            
            // Close modal after delay
            setTimeout(() => {
                document.getElementById('gpu-modal')?.remove();
            }, 1000);
            
        } catch (e) {
            console.error('GPU apply failed:', e);
            debugInfo.execError = e.message;
            if (statusEl) {
                statusEl.textContent = `❌ FAILED: ${e.message}`;
                statusEl.style.color = '#FF453A';
                statusEl.style.background = 'rgba(255,69,58,0.15)';            }
            if (window.showStatus) {
                window.showStatus('❌ GPU apply failed', '#FF453A');
            }
        } finally {
            isApplying = false;
            if (applyBtn) {
                applyBtn.disabled = false;
                applyBtn.textContent = '💾 Apply GPU Frequency';
            }
        }
    }

    // Initialize
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();