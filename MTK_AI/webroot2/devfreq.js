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
// === Other Devfreq Nodes (SoC / BW / misc) ===
const OTHER_CONFIG_FILE = `${BASE_DIR}/devfreq_other_config.json`;
let otherDevfreqNodes = [];   // [{path, name, availableFrequencies, minFreq, maxFreq}, ...]
let otherNodesConfig = {};    // { nodeName: { minFreq, maxFreq } }
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
        find /sys -type f -name "available_frequencies" 2>/dev/null | while read -r freq_file; do
        dev="\${freq_file%/*}"
        case "\$dev" in
            *mem*|*dvfs*|*dmc*|*gpu*|*gpubw*) ;;
            *) continue ;;
        esac
        [ -r "\$freq_file" ] || continue
        valid_freq=\$(tr -s '[:space:]' '\\n' < "\$freq_file" | grep -E '^[0-9]+\$' | sort -n | tail -1)
        [ -z "\$valid_freq" ] && continue
        if { [ -f "\$dev/min_freq" ] && [ -f "\$dev/max_freq" ]; } || [ -f "\$dev/set_freq" ]; then
            echo "\$dev"
        fi
    done`;
    // Execute the find command and trim whitespace/newlines
    let matchedPath = (await execFn(findCmd, 2000)).trim();

    // Only assign paths if a valid match was found (no fallback)
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

// Detect devfreq nodes NOT matching the primary filter
async function detectOtherDevfreqNodes() {
    const cmd = `find /sys -type f -name "available_frequencies" 2>/dev/null | while read -r freq_file; do
        dev="\${freq_file%/*}"
        case "\$dev" in
            *mem*|*dvfs*|*dmc*|*gpu*|*gpubw*) continue ;;
        esac
        [ -r "\$freq_file" ] || continue
        valid_freq=\$(tr -s '[:space:]' '\\n' < "\$freq_file" | grep -E '^[0-9]+\$' | sort -n | tail -1)
        [ -z "\$valid_freq" ] && continue
        if { [ -f "\$dev/min_freq" ] && [ -f "\$dev/max_freq" ]; } || [ -f "\$dev/set_freq" ]; then
            echo "\$dev"
        fi
    done`;
    const result = (await execFn(cmd, 3000)).trim();
    const paths = result.split('\n').filter(p => p.length > 0);
    otherDevfreqNodes = [];
    for (const path of paths) {
        const name = path.split('/').pop();
        const raw = await execFn(`cat ${path}/available_frequencies 2>/dev/null`, 1000);
        const freqs = raw.trim().split(/\s+/)
            .map(f => Math.round(parseInt(f) / 1000))
            .filter(f => !isNaN(f) && f > 0);
        const uniqueFreqs = Array.from(new Set(freqs)).sort((a, b) => a - b);
        if (uniqueFreqs.length === 0) continue;
        otherDevfreqNodes.push({
            path,
            name,
            availableFrequencies: uniqueFreqs,
            minFreq: uniqueFreqs[0],
            maxFreq: uniqueFreqs[uniqueFreqs.length - 1]
        });
    }
    console.log(`🔧 Found ${otherDevfreqNodes.length} other devfreq node(s)`);
}

async function loadOtherNodesConfig() {
    try {
        const raw = await execFn(`cat ${OTHER_CONFIG_FILE} 2>/dev/null`, 1000);
        if (raw.trim()) {
            otherNodesConfig = JSON.parse(raw.trim());
            for (const node of otherDevfreqNodes) {
                const saved = otherNodesConfig[node.name];
                if (!saved) continue;
                if (node.availableFrequencies.includes(saved.minFreq)) node.minFreq = saved.minFreq;
                if (node.availableFrequencies.includes(saved.maxFreq)) node.maxFreq = saved.maxFreq;
            }
            return true;
        }
    } catch (e) {
        console.log('No saved other-devfreq config found.');
    }
    return false;
}

async function saveOtherNodesConfig() {
    try {
        const configToSave = {};
        for (const node of otherDevfreqNodes) {
            configToSave[node.name] = { minFreq: node.minFreq, maxFreq: node.maxFreq };
        }
        const jsonStr = JSON.stringify(configToSave, null, 2);
        await execFn(`mkdir -p ${BASE_DIR} && echo '${jsonStr}' > ${OTHER_CONFIG_FILE}`, 2000);
        return true;
    } catch (e) {
        console.error('Failed to save other config', e);
        return false;
    }
}

async function applyOtherNodeSettings(nodeName) {
    const node = otherDevfreqNodes.find(n => n.name === nodeName);
    if (!node) return false;
    try {
        const minHz = node.minFreq * 1000;
        const maxHz = node.maxFreq * 1000;
        await execFn(`su -c "echo ${minHz} > ${node.path}/min_freq"`, 2000);
        await execFn(`su -c "echo ${maxHz} > ${node.path}/max_freq"`, 2000);
        return true;
    } catch (e) {
        console.error(`Failed to apply ${nodeName}`, e);
        return false;
    }
}

async function applyAllOtherNodes() {
    let success = 0;
    for (const node of otherDevfreqNodes) {
        if (await applyOtherNodeSettings(node.name)) success++;
    }
    await saveOtherNodesConfig();
    return success;
}

function updateOtherCardDisplay() {
    const valEl = document.querySelector('#other-devfreq-item .setting-value');
    if (!valEl) return;
    if (otherDevfreqNodes.length === 0) {
        valEl.innerHTML = `No other nodes <i class="fas fa-chevron-right"></i>`;
    } else {
        const sample = otherDevfreqNodes.slice(0, 2).map(n => n.name.split(':')[0]).join(', ');
        valEl.innerHTML = `${otherDevfreqNodes.length} node(s) • ${sample} <i class="fas fa-chevron-right"></i>`;
    }
}

function createOtherDevfreqCard() {
    const existingCard = document.getElementById('devfreq-item');
    if (!existingCard) return;

    const card = document.createElement('div');
    card.id = 'other-devfreq-item';
    card.className = existingCard.className;
    card.style.cssText = existingCard.style.cssText || '';
    card.innerHTML = `
        <div class="setting-icon" style="background:linear-gradient(135deg,#f59e0b,#d97706);">
            <i class="fas fa-microchip"></i>
        </div>
        <div class="setting-info" style="flex:1;">
            <div class="setting-title">Other Devfreq Nodes</div>
            <div class="setting-desc">SoC, bandwidth & misc frequency control</div>
        </div>
        <div class="setting-value" style="color:#f59e0b;font-size:12px;font-weight:500;">
            Loading... <i class="fas fa-chevron-right"></i>
        </div>
    `;
    card.style.cursor = 'pointer';
    card.addEventListener('click', showOtherDevfreqModal);
    existingCard.parentNode.insertBefore(card, existingCard.nextSibling);
}

function showOtherDevfreqModal() {
    const existing = document.getElementById('other-devfreq-modal');
    if (existing) existing.remove();

    if (otherDevfreqNodes.length === 0) {
        showStatus('⚠️ No other devfreq nodes detected', true);
        return;
    }
    
    if (!document.getElementById('other-slider-style')) {
    const style = document.createElement('style');
    style.id = 'other-slider-style';
    style.textContent = `
        .other-slider {
            -webkit-appearance: none !important;
            appearance: none !important;
            width: 100%;
            height: 30px; /* Larger invisible touch area */
            background: transparent !important;
            outline: none;
            cursor: pointer;
            margin: 0;
        }
        .other-slider::-webkit-slider-runnable-track {
            width: 100%;
            height: 6px;
            background: linear-gradient(90deg, #374151, #4b5563);
            border-radius: 3px;
        }
        .other-slider::-webkit-slider-thumb {
            -webkit-appearance: none !important;
            appearance: none !important;
            height: 24px;
            width: 24px;
            border-radius: 50%;
            background: #f59e0b;
            margin-top: -9px; /* Perfectly centers thumb on track */
            box-shadow: 0 2px 6px rgba(0,0,0,0.5);
            border: 2px solid #fff;
        }
        .other-slider::-moz-range-track {
            width: 100%;
            height: 6px;
            background: linear-gradient(90deg, #374151, #4b5563);
            border-radius: 3px;
        }
        .other-slider::-moz-range-thumb {
            height: 24px;
            width: 24px;
            border-radius: 50%;
            background: #f59e0b;
            border: 2px solid #fff;
            box-shadow: 0 2px 6px rgba(0,0,0,0.5);
        }
    `;
    document.head.appendChild(style);
}

    const modal = document.createElement('div');
    modal.id = 'other-devfreq-modal';
    modal.style.cssText = `
        position: fixed; inset: 0; background: rgba(0,0,0,0.85); z-index: 10000;
        display: flex; align-items: center; justify-content: center;
        backdrop-filter: blur(8px); animation: fadeIn 0.2s ease;
    `;

    const box = document.createElement('div');
    box.style.cssText = `
        background: linear-gradient(145deg, #1e2342, #2a3059);
        border: 1px solid rgba(245, 158, 11, 0.4);
        border-radius: 18px; padding: 22px;
        width: 92%; max-width: 480px; max-height: 85vh; overflow-y: auto;
        box-shadow: 0 8px 32px rgba(0,0,0,0.4); color: #fff;
    `;

    // Header
    const header = document.createElement('div');
    header.style.cssText = 'text-align:center;margin-bottom:18px;padding-bottom:14px;border-bottom:1px solid rgba(255,255,255,0.08);';
    header.innerHTML = `
        <h3 style="color:#f59e0b;margin:0 0 4px;font-size:19px;font-weight:600;">🔧 Other Devfreq Nodes</h3>
        <p style="color:#7a82b0;font-size:12px;margin:0;">Frequency adjustment only (‼️Setting to higher frequency will put in maximum performance state with a costs of OVERHEATING🔥)</p>
    `;
    box.appendChild(header);

    // Nodes list
    const nodesContainer = document.createElement('div');
    otherDevfreqNodes.forEach((node, idx) => {
        const minIdx = Math.max(0, node.availableFrequencies.indexOf(node.minFreq));
        const maxIdx = node.availableFrequencies.indexOf(node.maxFreq);
        const safeMax = maxIdx >= 0 ? maxIdx : node.availableFrequencies.length - 1;

        const block = document.createElement('div');
        block.style.cssText = `
            margin-bottom:14px;padding:14px;
            background:rgba(255,255,255,0.04);
            border:1px solid rgba(245,158,11,0.15);
            border-radius:12px;
        `;
        block.innerHTML = `
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
                <span style="color:#f59e0b;font-size:14px;font-weight:600;">📍 ${node.name}</span>
                <span style="color:#94a3b8;font-size:11px;">${node.availableFrequencies[0]}–${node.availableFrequencies[node.availableFrequencies.length-1]} MHz</span>
            </div>
            <div style="margin-bottom:10px;">
                <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
                    <span style="color:#fff;font-size:12px;">Min</span>
                    <span id="other-min-val-${idx}" style="color:#6366f1;font-size:13px;font-weight:700;">${node.availableFrequencies[minIdx]} MHz</span>
                </div>
                <input type="range" class="other-slider" id="other-min-slider-${idx}" min="0" max="${node.availableFrequencies.length - 1}" step="1" value="${minIdx}">
            </div>
            <div style="margin-bottom:12px;">
                <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
                    <span style="color:#fff;font-size:12px;">Max</span>
                    <span id="other-max-val-${idx}" style="color:#ef4444;font-size:13px;font-weight:700;">${node.availableFrequencies[safeMax]} MHz</span>
                </div>
                <input type="range" class="other-slider" id="other-max-slider-${idx}" min="0" max="${node.availableFrequencies.length - 1}" step="1" value="${safeMax}">
            </div>
            <button class="other-apply-btn" data-idx="${idx}" style="
                width:100%;padding:9px;
                background:linear-gradient(135deg,#f59e0b,#d97706);
                color:#fff;border:none;border-radius:8px;
                font-size:12px;font-weight:600;cursor:pointer;
            ">Apply ${node.name}</button>
        `;
        nodesContainer.appendChild(block);
    });
    box.appendChild(nodesContainer);

    // Status
    const statusEl = document.createElement('div');
    statusEl.id = 'other-status-msg';
    statusEl.style.cssText = 'text-align:center;font-size:12px;color:#9ca3af;margin:12px 0;min-height:18px;';
    statusEl.textContent = 'Adjust sliders and apply per node';
    box.appendChild(statusEl);

    // Apply All
    const applyAllBtn = document.createElement('button');
    applyAllBtn.textContent = '💾 Apply All & Save';
    applyAllBtn.style.cssText = `
        width:100%;padding:12px;margin-bottom:10px;
        background:linear-gradient(135deg,#f59e0b,#d97706);
        color:#fff;border:none;border-radius:12px;
        font-size:14px;font-weight:600;cursor:pointer;
    `;
    applyAllBtn.onclick = async () => {
        otherDevfreqNodes.forEach((node, idx) => {
            const minI = parseInt(document.getElementById(`other-min-slider-${idx}`).value);
            const maxI = parseInt(document.getElementById(`other-max-slider-${idx}`).value);
            node.minFreq = node.availableFrequencies[minI];
            node.maxFreq = node.availableFrequencies[maxI];
        });
        applyAllBtn.disabled = true;
        applyAllBtn.textContent = '⏳ Applying...';
        const success = await applyAllOtherNodes();
        statusEl.textContent = `✅ Applied ${success}/${otherDevfreqNodes.length} nodes & saved`;
        statusEl.style.color = '#10b981';
        applyAllBtn.disabled = false;
        applyAllBtn.textContent = '💾 Apply All & Save';
        updateOtherCardDisplay();
        setTimeout(() => {
            modal.style.opacity = '0';
            setTimeout(() => modal.remove(), 150);
        }, 800);
    };
    box.appendChild(applyAllBtn);

    // Cancel
    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.style.cssText = `
        width:100%;padding:10px;background:rgba(255,255,255,0.08);color:#fff;
        border:1px solid rgba(255,255,255,0.12);border-radius:10px;
        font-size:13px;cursor:pointer;
    `;
    cancelBtn.onclick = () => {
        modal.style.opacity = '0';
        setTimeout(() => modal.remove(), 150);
    };
    box.appendChild(cancelBtn);

    modal.appendChild(box);
    document.body.appendChild(modal);

    // === FIXED SLIDER EVENT BINDING ===
otherDevfreqNodes.forEach((node, idx) => {
    const minSlider = document.getElementById(`other-min-slider-${idx}`);
    const maxSlider = document.getElementById(`other-max-slider-${idx}`);
    const minVal = document.getElementById(`other-min-val-${idx}`);
    const maxVal = document.getElementById(`other-max-val-${idx}`);

    // Clean handlers (NO preventDefault!)
    const handleMinInput = () => {
        let minI = parseInt(minSlider.value);
        let maxI = parseInt(maxSlider.value);
        if (minI > maxI) {
            maxSlider.value = minI;
            maxVal.textContent = `${node.availableFrequencies[minI]} MHz`;
        }
        minVal.textContent = `${node.availableFrequencies[minI]} MHz`;
    };

    const handleMaxInput = () => {
        let maxI = parseInt(maxSlider.value);
        let minI = parseInt(minSlider.value);
        if (maxI < minI) {
            minSlider.value = maxI;
            minVal.textContent = `${node.availableFrequencies[maxI]} MHz`;
        }
        maxVal.textContent = `${node.availableFrequencies[maxI]} MHz`;
    };

    // ONLY use 'input' event. It handles both mouse and touch dragging natively.
    minSlider.addEventListener('input', handleMinInput);
    maxSlider.addEventListener('input', handleMaxInput);

    // Apply button handler
    const applyBtn = nodesContainer.querySelectorAll('.other-apply-btn')[idx];
    if (applyBtn) {
        applyBtn.onclick = async () => {
            node.minFreq = node.availableFrequencies[parseInt(minSlider.value)];
            node.maxFreq = node.availableFrequencies[parseInt(maxSlider.value)];
            applyBtn.disabled = true;
            applyBtn.textContent = '⏳ Applying...';
            const ok = await applyOtherNodeSettings(node.name);
            await saveOtherNodesConfig();
            applyBtn.disabled = false;
            applyBtn.textContent = `Apply ${node.name}`;
            statusEl.textContent = ok ? `✅ ${node.name} applied & saved` : `❌ ${node.name} failed`;
            statusEl.style.color = ok ? '#10b981' : '#ef4444';
            updateOtherCardDisplay();
        };
    }
});

modal.onclick = e => {
    if (e.target === modal) {
        modal.style.opacity = '0';
        setTimeout(() => modal.remove(), 150);
    }
};
}

async function init() {
    console.log('⚡ Initializing Devfreq Global Manager...');
    await detectDevfreqNode();
    await loadHardwareLimits();
    await loadGovernors();
    await loadGlobalConfig();
    updateCardDisplay();
    bindClickHandler();

    // === NEW: Other devfreq nodes ===
    await detectOtherDevfreqNodes();
    await loadOtherNodesConfig();
    createOtherDevfreqCard();
    updateOtherCardDisplay();

    console.log('✅ Devfreq Global Manager ready');
}

window.DevfreqManager = {
    init,
    showDevfreqModal,
    loadGlobalConfig,
    saveGlobalConfig,
    applySysfsSettings,
    getConfig: () => currentConfig,
    // NEW
    getOtherNodes: () => otherDevfreqNodes,
    showOtherDevfreqModal,
    applyAllOtherNodes,
    saveOtherNodesConfig
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
})();
