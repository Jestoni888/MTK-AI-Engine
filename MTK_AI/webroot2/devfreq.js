// devfreq.js - Global Devfreq Frequency & Governor Manager for MediaTek Devices
(function() {
'use strict';

const BASE_DIR = '/sdcard/MTK_AI_Engine';
const GLOBAL_CONFIG_FILE = `${BASE_DIR}/devfreq_config.json`;

let currentConfig = {
    governor: 'simple_ondemand',
    isLocked: false,
    minFreq: null,
    maxFreq: null
};

let availableFrequencies = []; // Sorted low -> high (MHz)
let availableGovernors = [];
let hardwareMinFreq = null;
let hardwareMaxFreq = null;
let isApplying = false;

// Devfreq node paths
const DEVFREQ_PATHS = {
    base: null,
    governor: null,
    availableGovernors: null,
    availableFrequencies: null,
    minFreq: null,
    maxFreq: null,
    curFreq: null
};

// Safe exec wrapper (compatible with KernelSU / ksu.exec)
const execFn = typeof window.exec === 'function' ? window.exec : async function(cmd, timeout = 3000) {
    return new Promise(resolve => {
        const cb = `devfreq_exec_${Date.now()}_${Math.random().toString(36).substring(2)}`;
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

function showStatus(msg, isError = false) {
    if (window.showStatus) {
        window.showStatus(msg, isError ? '#ef4444' : '#10b981');
    } else {
        console.log(isError ? '❌' : '✅', msg);
    }
}

// Target devfreq node based on your specified target name filter
async function detectDevfreqNode() {
    const findCmd = `
        for dev in /sys/class/devfreq/*; do
            [ -d "$dev" ] || continue
            name=$(basename "$dev")
            if [[ "$name" == *"mem"* ]] || [[ "$name" == *"dvfs"* ]] || [[ "$name" == *"dmc"* ]] || [[ "$name" == *"gpu"* ]] || [[ "$name" == *"gpubw"* ]]; then
                echo "$dev"
                break
            fi
        done
    `;

    let matchedPath = (await execFn(findCmd, 2000)).trim();

    // Fallback: pick the first available node if filter returns empty
    if (!matchedPath) {
        matchedPath = (await execFn('ls -d /sys/class/devfreq/* 2>/dev/null | head -n 1', 1000)).trim();
    }

    if (matchedPath) {
        DEVFREQ_PATHS.base = matchedPath;
        DEVFREQ_PATHS.governor = `${matchedPath}/governor`;
        DEVFREQ_PATHS.availableGovernors = `${matchedPath}/available_governors`;
        DEVFREQ_PATHS.availableFrequencies = `${matchedPath}/available_frequencies`;
        DEVFREQ_PATHS.minFreq = `${matchedPath}/min_freq`;
        DEVFREQ_PATHS.maxFreq = `${matchedPath}/max_freq`;
        DEVFREQ_PATHS.curFreq = `${matchedPath}/cur_freq`;
    }
}

async function loadHardwareLimits() {
    try {
        if (DEVFREQ_PATHS.availableFrequencies) {
            const raw = await execFn(`cat ${DEVFREQ_PATHS.availableFrequencies} 2>/dev/null`, 1000);
            const freqs = raw.trim().split(/\s+/).map(f => Math.round(parseInt(f) / 1000)).filter(f => !isNaN(f) && f > 0);
            if (freqs.length > 0) {
                availableFrequencies = Array.from(new Set(freqs)).sort((a, b) => a - b);
            }
        }
    } catch (e) {
        console.error('Error fetching devfreq frequencies:', e);
    }

    if (availableFrequencies.length === 0) {
        availableFrequencies = [200, 400, 600, 800, 1000, 1200];
    }

    hardwareMinFreq = availableFrequencies[0];
    hardwareMaxFreq = availableFrequencies[availableFrequencies.length - 1];
}

async function loadGovernors() {
    try {
        if (DEVFREQ_PATHS.availableGovernors) {
            const raw = await execFn(`cat ${DEVFREQ_PATHS.availableGovernors} 2>/dev/null`, 1000);
            const govs = raw.trim().split(/\s+/).filter(g => g.length > 0);
            if (govs.length > 0) availableGovernors = govs;
        }
    } catch (e) {
        console.error('Error fetching devfreq governors:', e);
    }

    if (availableGovernors.length === 0) {
        availableGovernors = ['simple_ondemand', 'performance', 'powersave', 'userspace'];
    }
}

async function loadGlobalConfig() {
    try {
        const raw = await execFn(`cat ${GLOBAL_CONFIG_FILE} 2>/dev/null`, 1000);
        if (raw.trim()) {
            const parsed = JSON.parse(raw.trim());
            currentConfig = {
                governor: parsed.governor || 'simple_ondemand',
                isLocked: parsed.isLocked ?? false,
                minFreq: parsed.minFreq || hardwareMinFreq,
                maxFreq: parsed.maxFreq || hardwareMaxFreq
            };
            return true;
        }
    } catch (e) {
        console.log('No saved global devfreq config found, using default.');
    }

    currentConfig = {
        governor: 'simple_ondemand',
        isLocked: false,
        minFreq: hardwareMinFreq,
        maxFreq: hardwareMaxFreq
    };
    return false;
}

async function saveGlobalConfig() {
    try {
        const jsonStr = JSON.stringify(currentConfig, null, 2);
        await execFn(`mkdir -p ${BASE_DIR} && echo '${jsonStr}' > ${GLOBAL_CONFIG_FILE}`, 2000);
        return true;
    } catch (e) {
        console.error(`Failed to save config to ${GLOBAL_CONFIG_FILE}`, e);
        return false;
    }
}

async function applySysfsSettings() {
    if (!DEVFREQ_PATHS.base) {
        showStatus('⚠️ Devfreq node path not found', true);
        return false;
    }

    try {
        if (DEVFREQ_PATHS.governor && currentConfig.governor) {
            await execFn(`su -c "echo '${currentConfig.governor}' > ${DEVFREQ_PATHS.governor}"`, 2000);
        }

        if (currentConfig.isLocked) {
            const minHz = (currentConfig.minFreq || hardwareMinFreq) * 1000;
            const maxHz = (currentConfig.maxFreq || hardwareMaxFreq) * 1000;
            await execFn(`su -c "echo ${minHz} > ${DEVFREQ_PATHS.minFreq}"`, 2000);
            await execFn(`su -c "echo ${maxHz} > ${DEVFREQ_PATHS.maxFreq}"`, 2000);
        } else {
            const minHz = hardwareMinFreq * 1000;
            const maxHz = hardwareMaxFreq * 1000;
            await execFn(`su -c "echo ${minHz} > ${DEVFREQ_PATHS.minFreq}"`, 2000);
            await execFn(`su -c "echo ${maxHz} > ${DEVFREQ_PATHS.maxFreq}"`, 2000);
        }
        return true;
    } catch (e) {
        console.error('Failed to write settings to sysfs', e);
        return false;
    }
}

function updateCardDisplay() {
    const valEl = document.querySelector('#devfreq-item .setting-value');
    if (valEl) {
        const lockIcon = currentConfig.isLocked ? ' 🔒' : '';
        const rangeText = currentConfig.isLocked 
            ? `${currentConfig.minFreq} - ${currentConfig.maxFreq} MHz` 
            : 'Dynamic';
        valEl.innerHTML = `${rangeText}${lockIcon} <i class="fas fa-chevron-right"></i>`;
    }
}

function bindClickHandler() {
    const item = document.getElementById('devfreq-item');
    if (!item) return;
    item.style.cursor = 'pointer';
    item.addEventListener('click', showDevfreqModal);
}

function showDevfreqModal() {
    const existing = document.getElementById('devfreq-modal');
    if (existing) existing.remove();

    const nodeName = DEVFREQ_PATHS.base ? DEVFREQ_PATHS.base.split('/').pop() : 'Devfreq';

    const modal = document.createElement('div');
    modal.id = 'devfreq-modal';
    modal.style.cssText = `
        position: fixed; inset: 0; background: rgba(0,0,0,0.85); z-index: 10000;
        display: flex; align-items: center; justify-content: center;
        backdrop-filter: blur(8px); animation: fadeIn 0.2s ease;
    `;

    const box = document.createElement('div');
    box.style.cssText = `
        background: linear-gradient(145deg, #1e2342, #2a3059);
        border: 1px solid rgba(99, 102, 241, 0.4);
        border-radius: 18px;
        padding: 22px; width: 92%; max-width: 460px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.05);
        color: #fff; transform: translateY(0); transition: transform 0.2s ease;
    `;

    // Header
    const header = document.createElement('div');
    header.style.cssText = 'text-align: center; margin-bottom: 18px; padding-bottom: 14px; border-bottom: 1px solid rgba(255,255,255,0.08);';
    header.innerHTML = `
        <h3 style="color: #6366f1; margin: 0 0 4px; font-size: 19px; font-weight: 600;">⚡ Devfreq Global Control</h3>
        <p style="color: #7a82b0; font-size: 12px; margin: 0; opacity: 0.9;">
            ${nodeName} • ${hardwareMinFreq}–${hardwareMaxFreq} MHz
        </p>
    `;
    box.appendChild(header);

    // Governor Selection
    const govSection = document.createElement('div');
    govSection.style.cssText = 'margin-bottom: 18px;';
    govSection.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
            <span style="color:#fff;font-size:14px;font-weight:500;">Devfreq Governor</span>
            <span id="devfreq-gov-val" style="color:#60a5fa;font-size:12px;font-weight:500;background:rgba(96,165,250,0.15);padding:3px 10px;border-radius:6px;">${currentConfig.governor}</span>
        </div>
        <select id="devfreq-gov-select" style="width:100%;padding:11px 14px;border-radius:10px;border:1px solid rgba(255,255,255,0.15);background:rgba(255,255,255,0.08);color:#fff;font-size:13px;outline:none;transition:border-color 0.2s;">
            ${availableGovernors.map(g => `<option value="${g}" ${g === currentConfig.governor ? 'selected' : ''}>${g}</option>`).join('')}
        </select>
    `;
    box.appendChild(govSection);

    // Lock Toggle
    const lockSection = document.createElement('div');
    lockSection.style.cssText = 'margin-bottom: 16px;';
    lockSection.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:16px;background:rgba(30,41,59,0.6);border:1px solid rgba(99,102,241,0.2);border-radius:16px;">
            <div style="flex:1;">
                <div style="color:#60a5fa;font-size:14px;font-weight:600;margin-bottom:4px;">Lock Frequency Range</div>
                <div style="color:#94a3b8;font-size:12px;">Override dynamic limits with target range</div>
            </div>
            <label class="devfreq-switch" style="position:relative;display:inline-block;width:52px;height:28px;cursor:pointer;margin-left:16px;">
                <input type="checkbox" id="devfreq-lock-toggle" ${currentConfig.isLocked ? 'checked' : ''} style="opacity:0;width:0;height:0;">
                <span class="devfreq-slider" style="position:absolute;top:0;left:0;right:0;bottom:0;background-color:#475569;transition:all 0.3s ease;border-radius:28px;">
                    <span class="devfreq-knob" style="position:absolute;content:'';height:22px;width:22px;left:3px;top:3px;background-color:#fff;transition:all 0.3s cubic-bezier(0.4, 0.0, 0.2, 1);border-radius:50%;box-shadow:0 2px 4px rgba(0,0,0,0.2);"></span>
                </span>
            </label>
        </div>
    `;
    box.appendChild(lockSection);

    // Sliders Container
    const slidersContainer = document.createElement('div');
    slidersContainer.id = 'devfreq-sliders-container';
    slidersContainer.style.cssText = `
        margin-bottom:22px; padding:14px; background:rgba(255,255,255,0.04); 
        border-radius:12px; transition:opacity 0.2s ease, filter 0.2s ease;
        ${currentConfig.isLocked ? '' : 'opacity:0.6;filter:blur(0.5px);pointer-events:none;'}
    `;

    // Minimum Frequency Slider
    const minIdx = availableFrequencies.indexOf(currentConfig.minFreq) !== -1 ? availableFrequencies.indexOf(currentConfig.minFreq) : 0;
    const minBlock = document.createElement('div');
    minBlock.style.cssText = 'margin-bottom: 16px;';
    minBlock.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
            <span style="color:#fff;font-size:13px;font-weight:500;">Minimum Frequency</span>
            <span id="devfreq-min-val" style="color:#6366f1;font-size:16px;font-weight:700;">${availableFrequencies[minIdx]} MHz</span>
        </div>
        <input type="range" id="devfreq-min-slider" min="0" max="${availableFrequencies.length - 1}" step="1" value="${minIdx}"
            style="width:100%;height:5px;background:linear-gradient(90deg,#374151,#4b5563);border-radius:3px;outline:none;-webkit-appearance:none;cursor:pointer;">
    `;

    // Maximum Frequency Slider
    const maxIdx = availableFrequencies.indexOf(currentConfig.maxFreq) !== -1 ? availableFrequencies.indexOf(currentConfig.maxFreq) : availableFrequencies.length - 1;
    const maxBlock = document.createElement('div');
    maxBlock.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
            <span style="color:#fff;font-size:13px;font-weight:500;">Maximum Frequency</span>
            <span id="devfreq-max-val" style="color:#ef4444;font-size:16px;font-weight:700;">${availableFrequencies[maxIdx]} MHz</span>
        </div>
        <input type="range" id="devfreq-max-slider" min="0" max="${availableFrequencies.length - 1}" step="1" value="${maxIdx}"
            style="width:100%;height:5px;background:linear-gradient(90deg,#374151,#4b5563);border-radius:3px;outline:none;-webkit-appearance:none;cursor:pointer;">
    `;

    slidersContainer.appendChild(minBlock);
    slidersContainer.appendChild(maxBlock);
    box.appendChild(slidersContainer);

    // CSS Styling injection for custom toggle switches
    if (!document.getElementById('devfreq-custom-style')) {
        const style = document.createElement('style');
        style.id = 'devfreq-custom-style';
        style.textContent = `
            .devfreq-switch input:checked + .devfreq-slider { background-color: #6366f1; }
            .devfreq-switch input:checked + .devfreq-slider .devfreq-knob { transform: translateX(24px); }
            .devfreq-switch input:focus + .devfreq-slider { box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.3); }
        `;
        document.head.appendChild(style);
    }

    // Status Message
    const statusEl = document.createElement('div');
    statusEl.id = 'devfreq-status-msg';
    statusEl.style.cssText = 'text-align:center;font-size:13px;color:#9ca3af;margin-bottom:14px;min-height:22px;padding:10px;border-radius:10px;background:rgba(255,255,255,0.03);transition:all 0.2s ease;';
    statusEl.textContent = 'Status: Ready to apply';
    box.appendChild(statusEl);

    // Apply Button
    const applyBtn = document.createElement('button');
    applyBtn.textContent = '💾 Apply Devfreq Settings';
    applyBtn.style.cssText = `
        width:100%;padding:13px;margin-bottom:10px;
        background:linear-gradient(135deg,#6366f1,#4f46e5);
        color:#fff;border:none;border-radius:12px;
        font-size:14px;font-weight:600;cursor:pointer;
        box-shadow:0 4px 14px rgba(99,102,241,0.35);
        transition:all 0.2s ease;
    `;

    applyBtn.onclick = async () => {
        await applyAllDevfreqSettings(applyBtn, statusEl, modal);
    };
    box.appendChild(applyBtn);

    // Cancel Button
    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.style.cssText = `
        width:100%;padding:11px;background:rgba(255,255,255,0.08);color:#fff;
        border:1px solid rgba(255,255,255,0.12);border-radius:10px;
        font-size:13px;cursor:pointer;transition:all 0.2s ease;font-weight:500;
    `;
    cancelBtn.onclick = () => {
        modal.style.opacity = '0';
        setTimeout(() => modal.remove(), 150);
    };
    box.appendChild(cancelBtn);

    modal.appendChild(box);
    document.body.appendChild(modal);

    // Slider range enforcement
    const minSlider = document.getElementById('devfreq-min-slider');
    const maxSlider = document.getElementById('devfreq-max-slider');
    const minValLabel = document.getElementById('devfreq-min-val');
    const maxValLabel = document.getElementById('devfreq-max-val');

    minSlider.oninput = (e) => {
        let minI = parseInt(e.target.value);
        let maxI = parseInt(maxSlider.value);
        if (minI > maxI) {
            maxSlider.value = minI;
            maxValLabel.textContent = `${availableFrequencies[minI]} MHz`;
        }
        minValLabel.textContent = `${availableFrequencies[minI]} MHz`;
    };

    maxSlider.oninput = (e) => {
        let maxI = parseInt(e.target.value);
        let minI = parseInt(minSlider.value);
        if (maxI < minI) {
            minSlider.value = maxI;
            minValLabel.textContent = `${availableFrequencies[maxI]} MHz`;
        }
        maxValLabel.textContent = `${availableFrequencies[maxI]} MHz`;
    };

    document.getElementById('devfreq-lock-toggle').addEventListener('change', (e) => {
        const isLocked = e.target.checked;
        slidersContainer.style.opacity = isLocked ? '1' : '0.6';
        slidersContainer.style.filter = isLocked ? 'none' : 'blur(0.5px)';
        slidersContainer.style.pointerEvents = isLocked ? 'auto' : 'none';
        statusEl.textContent = isLocked ? '🔒 Locked range selected' : '🔓 Dynamic scaling selected';
        statusEl.style.color = isLocked ? '#fbbf24' : '#60a5fa';
    });

    document.getElementById('devfreq-gov-select').addEventListener('change', (e) => {
        document.getElementById('devfreq-gov-val').textContent = e.target.value;
    });

    modal.onclick = e => { 
        if (e.target === modal) {
            modal.style.opacity = '0';
            setTimeout(() => modal.remove(), 150);
        }
    };
}

async function applyAllDevfreqSettings(applyBtn, statusEl, modal) {
    if (isApplying) return;
    isApplying = true;

    if (applyBtn) {
        applyBtn.disabled = true;
        applyBtn.textContent = '⏳ Applying...';
        applyBtn.style.opacity = '0.7';
    }

    try {
        const selectedGov = document.getElementById('devfreq-gov-select').value;
        const isLocked = document.getElementById('devfreq-lock-toggle').checked;
        const minIdx = parseInt(document.getElementById('devfreq-min-slider').value);
        const maxIdx = parseInt(document.getElementById('devfreq-max-slider').value);

        currentConfig.governor = selectedGov;
        currentConfig.isLocked = isLocked;
        currentConfig.minFreq = availableFrequencies[minIdx];
        currentConfig.maxFreq = availableFrequencies[maxIdx];

        await saveGlobalConfig();
        await applySysfsSettings();

        updateCardDisplay();

        showStatus(`✅ Devfreq Global: ${selectedGov} (${isLocked ? `${currentConfig.minFreq}-${currentConfig.maxFreq} MHz` : 'Dynamic'})`);

        if (modal) {
            modal.style.opacity = '0';
            setTimeout(() => modal.remove(), 200);
        }
    } catch (e) {
        console.error('Devfreq apply failed:', e);
        showStatus('❌ Devfreq apply failed', true);
    } finally {
        isApplying = false;
        if (applyBtn) {
            applyBtn.disabled = false;
            applyBtn.textContent = '💾 Apply Devfreq Settings';
            applyBtn.style.opacity = '1';
        }
    }
}

async function init() {
    console.log('⚡ Initializing Devfreq Global Manager...');
    await detectDevfreqNode();
    await loadHardwareLimits();
    await loadGovernors();
    await loadGlobalConfig();
    updateCardDisplay();
    bindClickHandler();
    console.log('✅ Devfreq Global Manager ready');
}

window.DevfreqManager = {
    init,
    showDevfreqModal,
    loadGlobalConfig,
    saveGlobalConfig,
    applySysfsSettings,
    getConfig: () => currentConfig
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
})();
