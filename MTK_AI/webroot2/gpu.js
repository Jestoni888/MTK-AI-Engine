// gpu.js - GPU Frequency & Governor Manager for MediaTek Devices (FIXED)
(function() {
    'use strict';

    const CONFIG_DIR = '/sdcard/MTK_AI_Engine';
    const CONFIG_FILE = `${CONFIG_DIR}/global_gpu_opp_index.txt`;
    const GOVERNOR_FILE = `${CONFIG_DIR}/gpu_governor.txt`;
    const LOCK_FILE = `${CONFIG_DIR}/gpu_freq_locked.txt`;
    
    let gpuFrequencyMap = {};
    let detectedMinFreq = 300;
    let detectedMaxFreq = 900;
    let gpuDriverType = null;
    let oppCount = 33;
    let currentOppIndex = 0;
    let isApplying = false;
    let isFreqLocked = false;
    let currentGovernor = 'simple_ondemand';
    let debugInfo = {};
    let hardwareMinFreq = null;  // Store actual hardware limits
    let hardwareMaxFreq = null;

    // GPU sysfs paths (auto-detected)
    const GPU_PATHS = {
        base: null,
        governor: null,
        availableGovernors: null,
        minFreq: null,
        maxFreq: null,
        curFreq: null,
        oppTable: null
    };

    // Safe exec wrapper (compatible with KernelSU/ksu exec)
    const execFn = typeof window.exec === 'function' ? window.exec : async function(cmd, timeout = 3000) {
        return new Promise(resolve => {
            const cb = `gpu_exec_${Date.now()}_${Math.random().toString(36).substring(2)}`;
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
                delete window[cb];                 resolve(res || ''); 
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

    // Show status message (integrates with main panel if available)
    function showStatus(msg, isError = false) {
        if (window.showStatus) {
            window.showStatus(msg, isError ? '#ef4444' : '#10b981');
        } else {
            console.log(isError ? '❌' : '✅', msg);
        }
    }

    // Detect GPU driver type and paths
    async function detectGpuDriver() {
        debugInfo = {};
        
        const candidateBases = [
            '/sys/devices/platform/13000000.mali/devfreq/13000000.mali',
            '/sys/devices/platform/soc/13000000.mali/devfreq/13000000.mali',
            '/sys/class/devfreq/13000000.mali',
            '/sys/devices/platform/26000000.mali/devfreq/26000000.mali',
            '/sys/devices/platform/gpu/devfreq/gpu'
        ];

        for (const base of candidateBases) {
            const exists = await execFn(`test -d ${base} && echo yes || echo no`, 1000);
            if (exists.trim() === 'yes') {
                GPU_PATHS.base = base;
                GPU_PATHS.governor = `${base}/governor`;
                GPU_PATHS.availableGovernors = `${base}/available_governors`;
                GPU_PATHS.minFreq = `${base}/min_freq`;
                GPU_PATHS.maxFreq = `${base}/max_freq`;
                GPU_PATHS.curFreq = `${base}/cur_freq`;                break;
            }
        }

        try {
            const v2 = await execFn('cat /proc/gpufreqv2/gpu_working_opp_table 2>/dev/null');
            debugInfo.v2Exists = v2 ? 'YES' : 'NO';
            if (v2 && v2.includes('freq')) {
                gpuDriverType = 'gpufreqv2';
                GPU_PATHS.oppTable = '/proc/gpufreqv2/gpu_working_opp_table';
                debugInfo.detected = 'gpufreqv2';
                return 'gpufreqv2';
            }
        } catch (e) { debugInfo.v2Error = e.message; }
        
        try {
            const legacy = await execFn('cat /proc/gpufreq/gpufreq_opp_dump 2>/dev/null');
            debugInfo.legacyExists = legacy ? 'YES' : 'NO';
            if (legacy && legacy.includes('freq')) {
                gpuDriverType = 'gpufreq';
                GPU_PATHS.oppTable = '/proc/gpufreq/gpufreq_opp_dump';
                debugInfo.detected = 'gpufreq';
                return 'gpufreq';
            }
        } catch (e) { debugInfo.legacyError = e.message; }
        
        gpuDriverType = null;
        debugInfo.detected = 'NONE';
        return null;
    }

    // Parse OPP table and build frequency map
    async function buildGpuFrequencyMap() {
        gpuFrequencyMap = {};
        try {
            let raw = '';
            if (gpuDriverType === 'gpufreqv2' && GPU_PATHS.oppTable) {
                raw = await execFn(`cat ${GPU_PATHS.oppTable} 2>/dev/null`);
            } else if (gpuDriverType === 'gpufreq' && GPU_PATHS.oppTable) {
                raw = await execFn(`cat ${GPU_PATHS.oppTable} 2>/dev/null`);
            }
            
            if (raw) {
                const lines = raw.trim().split('\n');
                for (const line of lines) {
                    const match = line.match(/\[(\d+)\]\s*freq\s*[=:]\s*(\d+)/);
                    if (match) {
                        const idx = parseInt(match[1]);
                        const freqKhz = parseInt(match[2]);
                        gpuFrequencyMap[idx] = Math.round(freqKhz / 1000);                    }
                }
            }
        } catch (e) { debugInfo.parseError = e.message; }
        
        if (Object.keys(gpuFrequencyMap).length === 0) {
            for (let i = 0; i <= 32; i++) {
                gpuFrequencyMap[i] = Math.round(900 - 600 * i / 32);
            }
        }
        
        oppCount = Object.keys(gpuFrequencyMap).length;
        const values = Object.values(gpuFrequencyMap);
        detectedMinFreq = Math.min(...values);
        detectedMaxFreq = Math.max(...values);
        
        // Store hardware limits for proper unlock restoration
        hardwareMinFreq = detectedMinFreq;
        hardwareMaxFreq = detectedMaxFreq;
        
        debugInfo.oppCount = oppCount;
        debugInfo.minFreq = detectedMinFreq;
        debugInfo.maxFreq = detectedMaxFreq;
    }

    // Get available governors from sysfs
    async function getAvailableGovernors() {
        try {
            if (!GPU_PATHS.availableGovernors) return ['simple_ondemand', 'performance', 'powersave'];
            const raw = await execFn(`cat ${GPU_PATHS.availableGovernors} 2>/dev/null`, 1000);
            const governors = raw.trim().split(/\s+/).filter(g => g.length > 0);
            return governors.length > 0 ? governors : ['simple_ondemand', 'performance', 'powersave'];
        } catch {
            return ['simple_ondemand', 'performance', 'powersave', 'sched', 'mtk_gpu'];
        }
    }

    // Read current GPU frequency in MHz
    async function getCurrentGpuFreq() {
        try {
            if (!GPU_PATHS.curFreq) return null;
            const freq = await execFn(`cat ${GPU_PATHS.curFreq} 2>/dev/null`, 1000);
            return parseInt(freq.trim()) / 1000;
        } catch {
            return null;
        }
    }

    // Read current min/max frequency range (returns hardware limits, not locked values)
    async function getGpuFreqRange() {        return {
            min: hardwareMinFreq || detectedMinFreq,
            max: hardwareMaxFreq || detectedMaxFreq
        };
    }

    // Read current governor
    async function getCurrentGovernor() {
        try {
            if (!GPU_PATHS.governor) return 'simple_ondemand';
            const gov = await execFn(`cat ${GPU_PATHS.governor} 2>/dev/null`, 1000);
            return gov.trim() || 'simple_ondemand';
        } catch {
            return 'simple_ondemand';
        }
    }

    // Apply GPU governor
    async function applyGpuGovernor(governor) {
        try {
            if (!GPU_PATHS.governor) {
                showStatus('⚠️ GPU governor path not found', true);
                return false;
            }
            await execFn(`su -c "echo '${governor}' > ${GPU_PATHS.governor}"`, 2000);
            await execFn(`echo "${governor}" > ${GOVERNOR_FILE} 2>/dev/null`, 1000);
            currentGovernor = governor;
            showStatus(`✅ GPU Governor: ${governor}`);
            if (window.restartService) await window.restartService();
            return true;
        } catch (e) {
            showStatus('⚠️ Failed to set GPU governor', true);
            debugInfo.governorError = e.message;
            return false;
        }
    }

    // Apply GPU frequency lock/unlock - FIXED: Properly restores hardware limits on unlock
    async function applyGpuFreqLock(isLocked, targetFreqMhz = null) {
        try {
            if (!GPU_PATHS.minFreq || !GPU_PATHS.maxFreq) {
                showStatus('⚠️ GPU frequency paths not found', true);
                return false;
            }
            
            isFreqLocked = isLocked;
            
            if (isLocked && targetFreqMhz !== null) {
                const freqKhz = targetFreqMhz * 1000;
                await execFn(`su -c "echo ${freqKhz} > ${GPU_PATHS.minFreq}"`, 2000);                await execFn(`su -c "echo ${freqKhz} > ${GPU_PATHS.maxFreq}"`, 2000);
                await execFn(`echo "${targetFreqMhz}" > ${LOCK_FILE} 2>/dev/null`, 1000);
                showStatus(`🔒 GPU locked at ${targetFreqMhz} MHz`);
            } else {
                // ✅ FIXED: Always restore to stored HARDWARE limits, not cached range
                const minKhz = (hardwareMinFreq || detectedMinFreq) * 1000;
                const maxKhz = (hardwareMaxFreq || detectedMaxFreq) * 1000;
                await execFn(`su -c "echo ${minKhz} > ${GPU_PATHS.minFreq}"`, 2000);
                await execFn(`su -c "echo ${maxKhz} > ${GPU_PATHS.maxFreq}"`, 2000);
                await execFn(`echo -1 > /proc/gpufreqv2/fix_target_opp_index 2>/dev/null`, 2000);
                await execFn(`rm -f ${LOCK_FILE} 2>/dev/null`, 1000);
                showStatus(`🔓 GPU frequency unlocked (dynamic scaling restored)`);
            }
            if (window.restartService) await window.restartService();
            return true;
        } catch (e) {
            showStatus('⚠️ Failed to apply GPU frequency lock', true);
            debugInfo.lockError = e.message;
            return false;
        }
    }
    
    async function unlockGpuDynamicScaling() {
    const commands = [];
    
    // Method 1: gpufreqv2 OPP unlock
    commands.push('echo -1 > /proc/gpufreqv2/fix_target_opp_index 2>/dev/null');
    
    // Method 2: Restore hardware limits via devfreq sysfs
    if (GPU_PATHS.minFreq && GPU_PATHS.maxFreq) {
        const minKhz = (hardwareMinFreq || detectedMinFreq) * 1000;
        const maxKhz = (hardwareMaxFreq || detectedMaxFreq) * 1000;
        commands.push(`echo ${minKhz} > ${GPU_PATHS.minFreq}`);
        commands.push(`echo ${maxKhz} > ${GPU_PATHS.maxFreq}`);
    }
    
    // Method 3: Clear any governor hints
    commands.push('echo 0 > /proc/gpufreqv2/limit_freq 2>/dev/null');
    
    // Execute all applicable commands
    for (const cmd of commands) {
        await execFn(`su -c "${cmd}"`, 2000);
    }
    
    // Remove lock file
    await execFn(`rm -f ${LOCK_FILE} 2>/dev/null`);
    
    showStatus('🔓 GPU dynamic scaling restored');
    return true;
}

    // Apply OPP index (for gpufreqv2 driver)
    async function applyGpuOppIndex(index) {
        try {
            if (gpuDriverType === 'gpufreqv2') {
                await execFn(`su -c "echo ${index} > /proc/gpufreqv2/fix_target_opp_index"`, 2000);
            } else if (gpuDriverType === 'gpufreq') {
                const freqKhz = (gpuFrequencyMap[index] || detectedMaxFreq) * 1000;
                await execFn(`su -c "echo ${freqKhz} > /proc/gpufreq/gpufreq_opp_freq"`, 2000);
            }
            return true;
        } catch (e) {
            debugInfo.oppError = e.message;
            return false;
        }
    }

    // Save OPP index to SD card
    async function saveToSdCard(index) {
        try {
            await execFn(`mkdir -p ${CONFIG_DIR} && echo '${index}' > ${CONFIG_FILE}`);
            const verify = await execFn(`cat ${CONFIG_FILE} 2>/dev/null`);
            return verify?.trim() === index.toString();
        } catch (e) {
            debugInfo.saveError = e.message;
            return false;
        }
    }

    // Load settings from SD card    
    async function loadFromSdCard() {
        try {
            const rawIdx = await execFn(`cat ${CONFIG_FILE} 2>/dev/null`);
            const savedIdx = parseInt(rawIdx?.trim());
            if (!isNaN(savedIdx) && savedIdx >= 0 && savedIdx < oppCount) {
                currentOppIndex = savedIdx;
                debugInfo.loadedOpp = 'YES';
            }
            
            const rawGov = await execFn(`cat ${GOVERNOR_FILE} 2>/dev/null`);
            if (rawGov?.trim()) {
                currentGovernor = rawGov.trim();
                debugInfo.loadedGov = 'YES';
            }
            
            const rawLock = await execFn(`cat ${LOCK_FILE} 2>/dev/null`);
            if (rawLock?.trim() && !isNaN(parseInt(rawLock))) {
                isFreqLocked = true;
                debugInfo.loadedLock = 'YES';
            }
            
            return true;
        } catch (e) {
            debugInfo.loadError = e.message;
            return false;
        }
    }

    // Update the card display in main panel
    function updateCardDisplay() {
        const valEl = document.querySelector('#gpu-freq-item .setting-value');
        if (valEl) {
            const freq = gpuFrequencyMap[currentOppIndex] || detectedMaxFreq;
            const lockIcon = isFreqLocked ? ' 🔒' : '';
            valEl.innerHTML = `${freq} MHz${lockIcon} <i class="fas fa-chevron-right"></i>`;
        }
    }

    // Bind click handler to open modal
    function bindClickHandler() {
        const item = document.getElementById('gpu-freq-item');
        if (!item) return;
        item.style.cursor = 'pointer';
        item.addEventListener('click', showGpuModal);
    }

    // Show GPU control modal - CLEAN UI REFACTOR
    function showGpuModal() {
        const existing = document.getElementById('gpu-modal');
        if (existing) existing.remove();
        const modal = document.createElement('div');
        modal.id = 'gpu-modal';
        modal.style.cssText = `
            position: fixed; inset: 0; background: rgba(0,0,0,0.85); z-index: 10000;
            display: flex; align-items: center; justify-content: center;
            backdrop-filter: blur(8px); animation: fadeIn 0.2s ease;
        `;

        const box = document.createElement('div');
        box.style.cssText = `
            background: linear-gradient(145deg, #1e2342, #2a3059);
            border: 1px solid rgba(255,69,58,0.4);
            border-radius: 18px;
            padding: 22px; width: 92%; max-width: 460px;
            box-shadow: 0 8px 32px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.05);
            color: #fff; transform: translateY(0); transition: transform 0.2s ease;
        `;

        // Header
        const header = document.createElement('div');
        header.style.cssText = 'text-align: center; margin-bottom: 18px; padding-bottom: 14px; border-bottom: 1px solid rgba(255,255,255,0.08);';
        header.innerHTML = `
            <h3 style="color: #FF453A; margin: 0 0 4px; font-size: 19px; font-weight: 600;">🎮 GPU Control</h3>
            <p style="color: #7a82b0; font-size: 12px; margin: 0; opacity: 0.9;">
                ${gpuDriverType || 'Auto-detected'} • ${oppCount} OPPs • ${detectedMinFreq}–${detectedMaxFreq} MHz
            </p>
        `;
        box.appendChild(header);

        // Governor Selection
        const govSection = document.createElement('div');
        govSection.style.cssText = 'margin-bottom: 18px;';
        govSection.innerHTML = `
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
                <span style="color:#fff;font-size:14px;font-weight:500;">GPU Governor</span>
                <span id="gpu-gov-val" style="color:#60a5fa;font-size:12px;font-weight:500;background:rgba(96,165,250,0.15);padding:3px 10px;border-radius:6px;">${currentGovernor}</span>
            </div>
            <select id="gpu-gov-select" style="width:100%;padding:11px 14px;border-radius:10px;border:1px solid rgba(255,255,255,0.15);background:rgba(255,255,255,0.08);color:#fff;font-size:13px;outline:none;transition:border-color 0.2s;">
                <option value="simple_ondemand">simple_ondemand (Balanced)</option>
                <option value="performance">performance (Max)</option>
                <option value="powersave">powersave (Efficient)</option>
                <option value="sched">sched (Scheduler-based)</option>
                <option value="mtk_gpu">mtk_gpu (MediaTek Default)</option>
            </select>
        `;
        box.appendChild(govSection);

        // Frequency Lock Toggle - Network Optimizer Style
const lockSection = document.createElement('div');
lockSection.style.cssText = 'margin-bottom: 16px;';
lockSection.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:16px;background:rgba(30,41,59,0.6);border:1px solid rgba(99,102,241,0.2);border-radius:16px;">
        <div style="flex:1;">
            <div style="color:#60a5fa;font-size:14px;font-weight:600;margin-bottom:4px;">Lock GPU Frequency</div>
            <div style="color:#94a3b8;font-size:12px;">Disable dynamic scaling for consistent performance</div>
        </div>
        <label class="gpu-switch" style="position:relative;display:inline-block;width:52px;height:28px;cursor:pointer;margin-left:16px;">
            <input type="checkbox" id="gpu-lock-toggle" ${isFreqLocked ? 'checked' : ''} style="opacity:0;width:0;height:0;">
            <span class="gpu-slider" style="position:absolute;top:0;left:0;right:0;bottom:0;background-color:#475569;transition:all 0.3s ease;border-radius:28px;">
                <span class="gpu-knob" style="position:absolute;content:'';height:22px;width:22px;left:3px;top:3px;background-color:#fff;transition:all 0.3s cubic-bezier(0.4, 0.0, 0.2, 1);border-radius:50%;box-shadow:0 2px 4px rgba(0,0,0,0.2);"></span>
            </span>
        </label>
    </div>
`;
        box.appendChild(lockSection);

        // Frequency Slider Section
        const sliderSection = document.createElement('div');
        sliderSection.id = 'gpu-slider-section';
        sliderSection.style.cssText = `
            margin-bottom:22px; padding:14px; background:rgba(255,255,255,0.04); 
            border-radius:12px; transition:opacity 0.2s ease, filter 0.2s ease;
            ${isFreqLocked ? '' : 'opacity:0.6;filter:blur(0.5px);'}
        `;
        
        const rangeLabels = document.createElement('div');
        rangeLabels.style.cssText = 'display:flex;justify-content:space-between;margin-bottom:10px;font-size:11px;color:#8b92b4;font-weight:500;';
        rangeLabels.innerHTML = `<span>${detectedMinFreq} MHz</span><span>${detectedMaxFreq} MHz</span>`;
        
        const labelRow = document.createElement('div');
        labelRow.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;';
        labelRow.innerHTML = `
            <span style="color:#fff;font-size:14px;font-weight:500;">Target Frequency</span>
            <span id="gpu-freq-val" style="color:#FF453A;font-size:19px;font-weight:700;text-shadow:0 0 12px rgba(255,69,58,0.3);">${gpuFrequencyMap[currentOppIndex] || detectedMaxFreq} MHz</span>
        `;
        
        const slider = document.createElement('input');
        slider.type = 'range';
        slider.min = 0;
        slider.max = oppCount - 1;
        slider.step = 1;
        slider.value = oppCount - 1 - currentOppIndex;
        slider.id = 'gpu-opp-slider';
        slider.style.cssText = `
            width:100%;height:5px;background:linear-gradient(90deg,#374151,#4b5563);
            border-radius:3px;outline:none;-webkit-appearance:none;cursor:pointer;
        `;
        slider.oninput = (e) => {
            const sliderVal = parseInt(e.target.value);            currentOppIndex = oppCount - 1 - sliderVal;
            const freq = gpuFrequencyMap[currentOppIndex] || detectedMaxFreq;
            document.getElementById('gpu-freq-val').textContent = `${freq} MHz`;
        };

// Add CSS for the toggle states
const style = document.createElement('style');
style.textContent = `
    .gpu-switch input:checked + .gpu-slider {
        background-color: #3b82f6;
    }
    
    .gpu-switch input:checked + .gpu-slider .gpu-knob {
        transform: translateX(24px);
    }
    
    .gpu-switch input:focus + .gpu-slider {
        box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.3);
    }
    
    .gpu-slider:hover {
        background-color: #64748b;
    }
    
    .gpu-switch input:checked + .gpu-slider:hover {
        background-color: #2563eb;
    }
`;
document.head.appendChild(style);

        sliderSection.append(rangeLabels, labelRow, slider);
        box.appendChild(sliderSection);

        // Info Box - Cleaner Design
        const infoBox = document.createElement('div');
        infoBox.style.cssText = `
            background:rgba(255,69,58,0.08);border:1px solid rgba(255,69,58,0.25);
            border-radius:12px;padding:12px 14px;margin-bottom:18px;font-size:12px;color:#fca5a5;
            line-height:1.4;
        `;
        infoBox.innerHTML = `
            <strong style="color:#FF453A;">💡 Quick Tips:</strong><br>
            • <b style="color:#fff;">Lock + High Freq:</b> Max gaming performance (↑ heat/battery)<br>
            • <b style="color:#fff;">Lock + Low Freq:</b> Cooler operation, longer battery life<br>
            • <b style="color:#fff;">Unlocked:</b> GPU scales dynamically based on workload ✅
        `;
        box.appendChild(infoBox);

        // Status Text
        const statusEl = document.createElement('div');
        statusEl.id = 'gpu-status-msg';
        statusEl.style.cssText = 'text-align:center;font-size:13px;color:#9ca3af;margin-bottom:14px;min-height:22px;padding:10px;border-radius:10px;background:rgba(255,255,255,0.03);transition:all 0.2s ease;';
        statusEl.textContent = 'Status: Ready to apply';        box.appendChild(statusEl);

        // Apply Button - CLEAN DESIGN WITH STATES
        const applyBtn = document.createElement('button');
        applyBtn.id = 'apply-gpu-btn';
        applyBtn.textContent = '💾 Apply GPU Settings';
        applyBtn.style.cssText = `
            width:100%;padding:13px;margin-bottom:10px;
            background:linear-gradient(135deg,#FF453A,#dc2626);
            color:#fff;border:none;border-radius:12px;
            font-size:14px;font-weight:600;cursor:pointer;
            box-shadow:0 4px 14px rgba(255,69,58,0.35);
            transition:all 0.2s ease; position: relative; overflow: hidden;
        `;
        applyBtn.onmouseenter = function() {
            this.style.transform = 'translateY(-1px)';
            this.style.boxShadow = '0 6px 20px rgba(255,69,58,0.5)';
        };
        applyBtn.onmouseleave = function() {
            this.style.transform = 'translateY(0)';
            this.style.boxShadow = '0 4px 14px rgba(255,69,58,0.35)';
        };
        applyBtn.onmousedown = function() {
            this.style.transform = 'translateY(1px)';
        };
        applyBtn.onclick = async () => {
            await applyAllGpuSettings(applyBtn, statusEl);
        };
        box.appendChild(applyBtn);

        // Button Group: Debug + Cancel
        const btnGroup = document.createElement('div');
        btnGroup.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:10px;';
        
        const debugBtn = document.createElement('button');
        debugBtn.textContent = '🔍 Debug';
        debugBtn.style.cssText = `
            padding:11px;background:rgba(255,255,255,0.08);color:#9ca3af;
            border:1px solid rgba(255,255,255,0.12);border-radius:10px;
            font-size:12px;cursor:pointer;transition:all 0.2s ease;
        `;
        debugBtn.onmouseenter = function() {
            this.style.background = 'rgba(255,255,255,0.12)';
            this.style.color = '#fff';
        };
        debugBtn.onclick = () => {
            alert(JSON.stringify({
                ...debugInfo,
                currentOppIndex,
                currentGovernor,                isFreqLocked,
                hardwareLimits: { min: hardwareMinFreq, max: hardwareMaxFreq },
                sampleFreqs: Object.entries(gpuFrequencyMap).slice(0, 5)
            }, null, 2));
        };
        
        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = 'Cancel';
        cancelBtn.style.cssText = `
            padding:11px;background:rgba(255,255,255,0.08);color:#fff;
            border:1px solid rgba(255,255,255,0.12);border-radius:10px;
            font-size:13px;cursor:pointer;transition:all 0.2s ease;font-weight:500;
        `;
        cancelBtn.onmouseenter = function() {
            this.style.background = 'rgba(239,68,68,0.2)';
            this.style.borderColor = 'rgba(239,68,68,0.4)';
        };
        cancelBtn.onclick = () => {
            modal.style.opacity = '0';
            setTimeout(() => modal.remove(), 150);
        };
        
        btnGroup.appendChild(debugBtn);
        btnGroup.appendChild(cancelBtn);
        box.appendChild(btnGroup);

        modal.appendChild(box);
        document.body.appendChild(modal);
        
        // Close on backdrop click with animation
        modal.onclick = e => { 
            if (e.target === modal) {
                modal.style.opacity = '0';
                setTimeout(() => modal.remove(), 150);
            }
        };

        // Toggle Switch Event Listener
        document.getElementById('gpu-lock-toggle').addEventListener('change', (e) => {
            isFreqLocked = e.target.checked;
            const sliderSec = document.getElementById('gpu-slider-section');
            if (sliderSec) {
                if (isFreqLocked) {
                    sliderSec.style.opacity = '1';
                    sliderSec.style.filter = 'none';
                    sliderSec.style.pointerEvents = 'auto';
                } else {
                    sliderSec.style.opacity = '0.6';
                    sliderSec.style.filter = 'blur(0.5px)';
                    sliderSec.style.pointerEvents = 'none';                }
            }
            // Update status hint
            const statusEl = document.getElementById('gpu-status-msg');
            if (statusEl) {
                statusEl.textContent = isFreqLocked ? '🔒 Locked mode selected' : '🔓 Dynamic scaling will be restored';
                statusEl.style.color = isFreqLocked ? '#fbbf24' : '#60a5fa';
            }
        });

        // Load available governors dynamically
        (async () => {
            const governors = await getAvailableGovernors();
            const select = document.getElementById('gpu-gov-select');
            if (select) {
                select.innerHTML = '';
                const labels = {
                    'simple_ondemand': 'simple_ondemand (Balanced)',
                    'performance': 'performance (Max)',
                    'powersave': 'powersave (Efficient)',
                    'sched': 'sched (Scheduler)',
                    'mtk_gpu': 'mtk_gpu (MediaTek)'
                };
                for (const gov of governors) {
                    const opt = document.createElement('option');
                    opt.value = gov;
                    opt.textContent = labels[gov] || gov;
                    if (gov === currentGovernor) opt.selected = true;
                    select.appendChild(opt);
                }
            }
        })();
    }

    // Apply all GPU settings - with proper unlock restoration
    async function applyAllGpuSettings(applyBtn, statusEl) {
        if (isApplying) {
            if (statusEl) {
                statusEl.textContent = '⏳ Already applying...';
                statusEl.style.color = '#fbbf24';
                statusEl.style.background = 'rgba(251,191,36,0.15)';
            }
            return;
        }
        
        isApplying = true;
        const targetIdx = currentOppIndex;
        const targetFreq = gpuFrequencyMap[targetIdx] || detectedMaxFreq;
        const selectedGov = document.getElementById('gpu-gov-select')?.value || currentGovernor;
                // Button feedback
        if (applyBtn) {
            applyBtn.disabled = true;
            applyBtn.textContent = '⏳ Applying...';
            applyBtn.style.opacity = '0.7';
            applyBtn.style.cursor = 'wait';
        }
        if (statusEl) {
            statusEl.textContent = `⏳ Applying ${targetFreq} MHz + ${selectedGov}...`;
            statusEl.style.color = '#fbbf24';
            statusEl.style.background = 'rgba(251,191,36,0.15)';
        }
        
        try {
            await execFn(`mkdir -p ${CONFIG_DIR}`);
            
            // 1. Apply governor first
            await applyGpuGovernor(selectedGov);
            
            // 2. Apply frequency lock/unlock (✅ FIXED: unlock now restores hardware limits)
            if (isFreqLocked) {
                await applyGpuFreqLock(true, targetFreq);
                await applyGpuOppIndex(targetIdx);
                await saveToSdCard(targetIdx);
            } else {
                await applyGpuFreqLock(false); // ✅ This now properly restores dynamic scaling
            }
            
            // Update card display
            updateCardDisplay();
            
            // Success feedback
            if (statusEl) {
                const lockText = isFreqLocked ? `🔒 ${targetFreq} MHz` : '🔓 Dynamic';
                statusEl.textContent = `✅ Applied: ${lockText} | ${selectedGov}`;
                statusEl.style.color = '#34d399';
                statusEl.style.background = 'rgba(52,211,153,0.15)';
            }
            showStatus(`✅ GPU: ${isFreqLocked ? targetFreq + ' MHz (locked)' : 'Dynamic scaling'} | ${selectedGov}`);
            
            // Close modal with animation
            const modal = document.getElementById('gpu-modal');
            if (modal) {
                modal.style.opacity = '0';
                setTimeout(() => modal.remove(), 200);
            }
            
        } catch (e) {
            console.error('GPU apply failed:', e);
            debugInfo.execError = e.message;            if (statusEl) {
                statusEl.textContent = `❌ Failed: ${e.message || 'Unknown error'}`;
                statusEl.style.color = '#f87171';
                statusEl.style.background = 'rgba(248,113,113,0.15)';
            }
            showStatus('❌ GPU apply failed', true);
        } finally {
            isApplying = false;
            if (applyBtn) {
                applyBtn.disabled = false;
                applyBtn.textContent = '💾 Apply GPU Settings';
                applyBtn.style.opacity = '1';
                applyBtn.style.cursor = 'pointer';
            }
        }
    }

    // Initialize module
    async function init() {
        console.log('🎮 Initializing GPU Manager...');
        await detectGpuDriver();
        await buildGpuFrequencyMap();
        await loadFromSdCard();
        currentGovernor = await getCurrentGovernor() || currentGovernor;
        updateCardDisplay();
        bindClickHandler();
        console.log('✅ GPU Manager ready');
    }

    // Public API
    window.GpuManager = {
        init,
        applyGpuGovernor,
        applyGpuFreqLock,
        getCurrentGpuFreq,
        getGpuFreqRange,
        getAvailableGovernors,
        debugInfo
    };

    // Auto-init
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();