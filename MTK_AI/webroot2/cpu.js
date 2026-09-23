// cpu.js - CPU Frequency Control - TRUE POPUP MODAL (Unified Global Slider + Off-Screen Profile)
(function() {
'use strict';
const CONFIG_DIR = '/sdcard/MTK_AI_Engine';
const GOV_CONFIG = `${CONFIG_DIR}/manual_governor.txt`;
const TOUCH_FREQ_CONFIG = `${CONFIG_DIR}/manual_touch_active_freq.txt`;
const OFFSCREEN_FREQ_CONFIG = `${CONFIG_DIR}/manual_offscreen_freq.txt`;
const OFFSCREEN_GOV_CONFIG = `${CONFIG_DIR}/manual_offscreen_gov.txt`;
const OFFSCREEN_ENABLE_CONFIG = `${CONFIG_DIR}/offscreen_enabled.txt`;
const BUSYBOX = '/data/adb/modules/MTK_AI/busybox';

let availableGovernors = [];
let currentGovernor = '';
let policies = [];
let coreCount = 8;
let panelVisible = false;
let panelRendered = false;
let freqUpdateInterval = null;
let globalApplyTimer = null;
let protectionEnabled = true;
let modalElement = null;
let globalMaxPercent = 100; // Unified global percentage

// Off-screen profile states
let offscreenEnabled = false;
let offscreenFreqPercent = 50;
let offscreenGovernor = 'powersave';
let offscreenSaveTimer = null;

console.log('[CPU.js] Script loaded - Unified Global Slider & Off-Screen Profile');

// ✅ execFn
const execFn = async function(cmd, timeout = 10000) {
return new Promise((resolve) => {
const cb = `cpu_exec_${Date.now()}_${Math.random().toString(36).substring(2)}`;
let settled = false;
const t = setTimeout(() => {
if (!settled) { settled = true; delete window[cb]; resolve('TIMEOUT'); }
}, timeout);
window[cb] = (code, res) => {
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
settled = true; clearTimeout(t); delete window[cb];
resolve('ERROR: No KernelSU');
}
} catch (e) {
settled = true; clearTimeout(t); delete window[cb];
resolve(`ERROR: ${e.message}`);
}
});
};

// ✅ UPDATED: chmod 777 before writing, pkill removed
async function writeWithBusybox(path, value) {
try {
await execFn(`su -c 'chmod 777 "${path}"'`, 100);
await new Promise(r => setTimeout(r, 50));
await execFn(`su -c '${BUSYBOX} echo "${value}" > "${path}"'`, 100);
await new Promise(r => setTimeout(r, 50));
const verify = await execFn(`${BUSYBOX} cat "${path}" 2>/dev/null`, 100);
return verify?.trim() === value.toString();
} catch (e) {
console.error(`Write failed for ${path}:`, e);
return false;
}
}

// ✅ chmod 000 after applying
async function lockFilePermissions(path) {
if (!protectionEnabled) return true;
try {
await execFn(`su -c 'chmod 000 "${path}"'`, 100);
return true;
} catch (e) {
console.warn(`Failed to lock ${path}:`, e);
return false;
}
}

// ✅ chmod 777 to unlock
async function unlockFilePermissions(path) {
try {
await execFn(`su -c 'chmod 777 "${path}"'`, 100);
return true;
} catch (e) {
console.warn(`Failed to unlock ${path}:`, e);
return false;
}
}

async function safeRead(path) {
await unlockFilePermissions(path);
const res = await execFn(`${BUSYBOX} cat "${path}" 2>/dev/null`, 100);
return res?.trim() || '';
}

async function init() {
try {
console.log('[CPU.js] Initializing...');
await ensureConfigDir();

    // Ensure touch freq config exists
    const existingTouch = await safeRead(TOUCH_FREQ_CONFIG);
    if (!existingTouch) {
        await execFn(`su -c '${BUSYBOX} echo "100" > "${TOUCH_FREQ_CONFIG}"'`, 100);
    }

    // Ensure off-screen configs exist with defaults
    const existingOffEnabled = await safeRead(OFFSCREEN_ENABLE_CONFIG);
    if (!existingOffEnabled) {
        await execFn(`su -c '${BUSYBOX} echo "0" > "${OFFSCREEN_ENABLE_CONFIG}"'`, 100);
    }
    const existingOffFreq = await safeRead(OFFSCREEN_FREQ_CONFIG);
    if (!existingOffFreq) {
        await execFn(`su -c '${BUSYBOX} echo "50" > "${OFFSCREEN_FREQ_CONFIG}"'`, 100);
    }
    const existingOffGov = await safeRead(OFFSCREEN_GOV_CONFIG);
    if (!existingOffGov) {
        await execFn(`su -c '${BUSYBOX} echo "powersave" > "${OFFSCREEN_GOV_CONFIG}"'`, 100);
    }

    await loadSystemData();
    await loadSavedSettings();
    setupToggleHandler();
    console.log('[CPU.js] Initialization complete');
} catch (e) {
    console.error('[CPU.js] Initialization failed:', e);
}
}

async function ensureConfigDir() {
await execFn(`su -c 'mkdir -p "${CONFIG_DIR}"'`, 100);
}

async function loadSystemData() {
const cpuTopo = await execFn(`${BUSYBOX} ls -d /sys/devices/system/cpu/cpu[0-9]* 2>/dev/null | ${BUSYBOX} wc -l`);
coreCount = parseInt(cpuTopo) || 8;
const raw = await safeRead('/sys/devices/system/cpu/cpu0/cpufreq/scaling_available_governors');
availableGovernors = raw?.split(/\s+/).filter(g => g) || ['performance', 'schedutil', 'powersave'];
const policyList = await execFn(`${BUSYBOX} ls -d /sys/devices/system/cpu/cpufreq/policy* 2>/dev/null`);
 const policyIds = (policyList?.match(/policy\d+/g) || []).sort((a,b) => {
     const na = parseInt(a.replace('policy','')), nb = parseInt(b.replace('policy',''));
     return na - nb;
 });
 for (const pid of policyIds) {
     const basePath = `/sys/devices/system/cpu/cpufreq/${pid}`;
     const cpuinfoMin = parseInt(await safeRead(`${basePath}/cpuinfo_min_freq`)) || 1000;
     const cpuinfoMax = parseInt(await safeRead(`${basePath}/cpuinfo_max_freq`)) || 1000;
     const cpus = (await execFn(`${BUSYBOX} cat ${basePath}/affected_cpus 2>/dev/null`))?.trim().split(/\s+/).map(Number).filter(n => !isNaN(n)) || [];
     policies.push({
         id: pid, cpus, curFreq: 0, 
         cpuinfoMin, cpuinfoMax, step: 1000
     });
 }
 if (policies.length === 0) {
     for (let i = 0; i < coreCount; i++) {
         const basePath = `/sys/devices/system/cpu/cpu${i}/cpufreq`;
         const cpuinfoMin = parseInt(await safeRead(`${basePath}/cpuinfo_min_freq`)) || 1000;
         const cpuinfoMax = parseInt(await safeRead(`${basePath}/cpuinfo_max_freq`)) || 1000;
         policies.push({
             id: `cpu${i}`, cpus: [i], curFreq: 0,
             cpuinfoMin, cpuinfoMax, step: 1000
         });
     }
 }
 console.log('[CPU.js] Loaded', policies.length, 'policies');
}

async function loadSavedSettings() {
try {
const savedGov = await safeRead(GOV_CONFIG);
const liveGov = await safeRead('/sys/devices/system/cpu/cpu0/cpufreq/scaling_governor');
currentGovernor = (savedGov && availableGovernors.includes(savedGov)) ? savedGov : (liveGov || 'performance');

    const touchFreq = await safeRead(TOUCH_FREQ_CONFIG);
    if (touchFreq) {
        let parsed = parseInt(touchFreq);
        if (!isNaN(parsed)) {
            globalMaxPercent = Math.min(100, Math.max(25, parsed));
        }
    }

    // Load off-screen settings
    const offEnabled = await safeRead(OFFSCREEN_ENABLE_CONFIG);
    offscreenEnabled = (offEnabled === '1');

    const offFreq = await safeRead(OFFSCREEN_FREQ_CONFIG);
    if (offFreq) {
        let parsed = parseInt(offFreq);
        if (!isNaN(parsed)) offscreenFreqPercent = Math.min(100, Math.max(25, parsed));
    }

    const offGov = await safeRead(OFFSCREEN_GOV_CONFIG);
    if (offGov && availableGovernors.includes(offGov)) {
        offscreenGovernor = offGov;
    } else if (availableGovernors.includes('powersave')) {
        offscreenGovernor = 'powersave';
    } else if (availableGovernors.length > 0) {
        offscreenGovernor = availableGovernors[0];
    }
} catch (e) { console.warn('[CPU.js] Settings load error:', e); }
}

function setupToggleHandler() {
const item = document.getElementById('cpu-gov-item');
if (!item) { console.error('[CPU.js] ERROR: cpu-gov-item not found!'); return; }
item.style.cursor = 'pointer';
item.addEventListener('click', (e) => {
if (e.target.closest('#cpu-gov-modal') || e.target.closest('#cpu-control-modal')) return;
togglePanel();
});
}

function togglePanel() {
panelVisible = !panelVisible;
if (panelVisible) {
if (!panelRendered) { renderModal(); panelRendered = true; }
openModal();
} else {
closeModal();
}
}

function openModal() {
if (!modalElement) return;
modalElement.style.display = 'flex';
document.body.style.overflow = 'hidden';
startFreqUpdates();
console.log('[CPU.js] Modal opened');
}

function closeModal() {
if (!modalElement) return;
modalElement.style.display = 'none';
document.body.style.overflow = '';
panelVisible = false;
stopFreqUpdates();
console.log('[CPU.js] Modal closed');
}

window.showCPUPanel = function() {
if (!panelRendered) { renderModal(); panelRendered = true; }
panelVisible = true;
openModal();
};
window.closeCPUPanel = closeModal;

function renderModal() {
console.log('[CPU.js] renderModal called');
const existing = document.getElementById('cpu-control-modal');
if (existing) existing.remove();
modalElement = document.createElement('div');
 modalElement.id = 'cpu-control-modal';
 modalElement.style.cssText = `
     display: none; position: fixed; top: 0; left: 0;
     width: 100%; height: 100%; background: rgba(0, 0, 0, 0.85);
     z-index: 10000; justify-content: center; align-items: center;
     padding: 20px; backdrop-filter: blur(10px);
     font-family: system-ui, -apple-system, sans-serif;
 `;
 modalElement.addEventListener('click', (e) => {
     if (e.target === modalElement) closeModal();
 });

 const modalContent = document.createElement('div');
 modalContent.style.cssText = `
     background: linear-gradient(135deg, #121418, #1a1f3a);
     border: 2px solid #4a9eff; border-radius: 16px;
     width: 100%; max-width: 520px; max-height: 90vh;
     overflow-y: auto; box-shadow: 0 20px 60px rgba(74, 158, 255, 0.4);
     position: relative; color: #fff;
 `;

 const header = document.createElement('div');
 header.style.cssText = 'display:flex; justify-content:space-between; align-items:center; padding:20px 24px; border-bottom:2px solid #2a3152; position: sticky; top: 0; background: linear-gradient(135deg, #121418, #1a1f3a); z-index: 10; border-radius: 16px 16px 0 0;';
 header.innerHTML = `
     <div>
         <div style="color:#fff; font-size:18px; font-weight:700;">⚡ CPU Control</div>
         <div style="color:#8b92b4; font-size:12px; margin-top:2px;">On-Screen Profile & Off-Screen Profile</div>
     </div>
     <div style="display:flex; align-items:center; gap:12px;">
         <div style="background:#0a0c10; padding:6px 14px; border-radius:8px; border:1px solid #4a9eff;">
             <span style="color:#8b92b4; font-size:11px;">Governor: </span>
             <span id="panel-gov-name" style="color:#32D74B; font-weight:700; font-size:13px;">${currentGovernor}</span>
         </div>
         <button id="modal-close-btn" style="
             width:32px; height:32px; border-radius:50%; border:none; 
             background:#2a3152; color:#fff; font-size:20px; cursor:pointer; 
             display:flex; align-items:center; justify-content:center;
             transition: background 0.2s; line-height:1;">×</button>
     </div>`;
 modalContent.appendChild(header);

 const body = document.createElement('div');
 body.style.cssText = 'padding:20px 24px;';

 // Protection toggle
 const protectionRow = document.createElement('div');
 protectionRow.style.cssText = 'display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; padding:12px 16px; background:#0a0c10; border-radius:10px; border:1px solid #2a3152;';
 protectionRow.innerHTML = `
     <div>
         <div style="color:#fff; font-size:14px; font-weight:600;">🔒 Lock Frequencies</div>
         <div style="color:#8b92b4; font-size:11px; margin-top:2px;">Prevent system overrides</div>
     </div>`;

 const toggleContainer = document.createElement('label');
 toggleContainer.style.cssText = 'position:relative; display:inline-block; width:52px; height:28px; cursor:pointer;';
 const toggleInput = document.createElement('input');
 toggleInput.type = 'checkbox';
 toggleInput.checked = protectionEnabled;
 toggleInput.style.cssText = 'opacity:0; width:0; height:0;';
 const toggleSlider = document.createElement('span');
 toggleSlider.style.cssText = `position:absolute; cursor:pointer; top:0; left:0; right:0; bottom:0; background:${protectionEnabled ? '#32D74B' : '#2a3152'}; border-radius:28px; transition:0.3s;`;
 const toggleKnob = document.createElement('span');
 toggleKnob.style.cssText = `position:absolute; height:22px; width:22px; left:${protectionEnabled ? '27px' : '3px'}; bottom:3px; background:#fff; border-radius:50%; transition:0.3s; box-shadow:0 2px 4px rgba(0,0,0,0.3);`;

 toggleContainer.appendChild(toggleInput);
 toggleContainer.appendChild(toggleSlider);
 toggleContainer.appendChild(toggleKnob);
 protectionRow.appendChild(toggleContainer);
 body.appendChild(protectionRow);

 toggleInput.addEventListener('change', (e) => {
     protectionEnabled = e.target.checked;
     toggleSlider.style.background = protectionEnabled ? '#32D74B' : '#2a3152';
     toggleKnob.style.left = protectionEnabled ? '27px' : '3px';
     if (window.showStatus) window.showStatus(protectionEnabled ? 'Protection: ENABLED 🔒' : 'Protection: DISABLED ✏️', protectionEnabled ? '#32D74B' : '#FF9F0A');
     const statusEl = document.getElementById('status-global');
     if (statusEl) statusEl.textContent = protectionEnabled ? '🔒 Will lock after apply' : '✏️ Editable';
 });

 // ✅ ON-SCREEN PROFILE CARD (Renamed & Governor Button Moved Here)
 const slidersContainer = document.createElement('div');
 slidersContainer.style.cssText = 'display:flex; flex-direction:column; gap:16px;';
 slidersContainer.appendChild(createGlobalSlider());
 body.appendChild(slidersContainer);

 // ✅ OFF-SCREEN PROFILE
 body.appendChild(createOffscreenCard());

 modalContent.appendChild(body);
 modalElement.appendChild(modalContent);
 document.body.appendChild(modalElement);

 document.getElementById('modal-close-btn')?.addEventListener('click', (e) => {
     e.stopPropagation();
     closeModal();
 });

 document.addEventListener('keydown', function escHandler(e) {
     if (e.key === 'Escape' && modalElement?.style.display === 'flex') {
         closeModal();
         document.removeEventListener('keydown', escHandler);
     }
 });
 console.log('[CPU.js] Modal rendered');
}

// ✅ Helper to calculate absolute frequency from percentage
function calcFreqFromPercent(percent, cpuinfoMax, cpuinfoMin) {
let freq = Math.round((percent / 100) * cpuinfoMax);
return Math.max(cpuinfoMin, freq);
}

// ✅ ON-SCREEN PROFILE UI (Renamed from ALL CORES & Governor button moved inside)
function createGlobalSlider() {
const card = document.createElement('div');
card.style.cssText = 'background:#0a0c10; border:1px solid #2a3152; border-radius:12px; padding:16px;';
card.innerHTML = `<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;"> <div> <div style="color:#4a9eff; font-size:16px; font-weight:700;">☀️ On-Screen Profile</div> <div style="color:#8b92b4; font-size:11px; margin-top:2px;">Active CPU Max Limit</div> </div> <div style="text-align:right;"> <div style="color:#32D74B; font-size:15px; font-weight:700; font-family:monospace;" id="cur-freq-global">-- MHz</div> <div style="color:#8b92b4; font-size:10px;">Current Avg</div> </div> </div>`;

const wrapper = document.createElement('div');
 wrapper.style.cssText = 'margin:15px 0;';

 const valueDisplay = document.createElement('div');
 valueDisplay.id = 'val-global';
 valueDisplay.style.cssText = 'text-align:center; color:#fff; font-size:16px; font-weight:700; font-family:monospace; margin-bottom:16px; padding:8px; background:#1a1f3a; border-radius:8px;';
 wrapper.appendChild(valueDisplay);

 const maxLabel = document.createElement('div');
 maxLabel.style.cssText = 'color:#32D74B; font-size:12px; font-weight:600; margin-bottom:8px;';
 maxLabel.textContent = '📈 MAX Frequency Limit (%)';
 wrapper.appendChild(maxLabel);

 const maxSlider = document.createElement('input');
 maxSlider.type = 'range';
 maxSlider.id = 'slider-max-global';
 maxSlider.min = 25;
 maxSlider.max = 100;
 maxSlider.step = 1;
 maxSlider.value = globalMaxPercent;
 maxSlider.style.cssText = 'width:100%; height:6px; background:linear-gradient(to right, #2a3152 50%, #32D74B 50%); border-radius:3px; outline:none; -webkit-appearance:none;';

 maxSlider.addEventListener('input', () => {
     let val = parseInt(maxSlider.value);
     globalMaxPercent = val;
     updateGlobalValueDisplay(valueDisplay);
     updateSliderFill(maxSlider, 25, 100, val, '#32D74B');
     debouncedApplyGlobal(maxSlider);
 });

 updateGlobalValueDisplay(valueDisplay);
 updateSliderFill(maxSlider, 25, 100, globalMaxPercent, '#32D74B');
 wrapper.appendChild(maxSlider);

 const infoText = document.createElement('div');
 infoText.style.cssText = 'text-align:center; color:#8b92b4; font-size:11px; margin-top:8px; padding:6px; background:#1a1f3a; border-radius:6px;';
 infoText.innerHTML = `Allowed Range: <span style="color:#fff; font-weight:600;">25%</span> - <span style="color:#fff; font-weight:600;">100%</span>`;
 wrapper.appendChild(infoText);

 card.appendChild(wrapper);

 // Governor button moved inside On-Screen Profile card to match Off-Screen style
 const changeBtn = document.createElement('button');
 changeBtn.textContent = '🔄 Change Active Governor';
 changeBtn.style.cssText = 'width:100%; margin-top:12px; padding:12px; background:linear-gradient(135deg,#4a9eff,#2a75ff); color:#fff; border:none; border-radius:8px; font-size:14px; font-weight:700; cursor:pointer;';
 changeBtn.addEventListener('click', (e) => { e.stopPropagation(); showGovernorSelector(); });
 card.appendChild(changeBtn);

 const statusRow = document.createElement('div');
 statusRow.id = 'status-global';
 statusRow.style.cssText = 'text-align:center; color:#8b92b4; font-size:11px; margin-top:12px; min-height:16px; font-weight:600;';
 statusRow.textContent = protectionEnabled ? '🔒 Will lock after apply' : '✏️ Editable';
 card.appendChild(statusRow);

 return card;
}

function updateGlobalValueDisplay(el) {
const maxPossible = policies.length > 0 ? Math.max(...policies.map(p => p.cpuinfoMax)) : 0;
const calcFreq = maxPossible > 0 ? Math.round((globalMaxPercent / 100) * maxPossible) : 0;
el.textContent = `MAX: ${globalMaxPercent}% (${Math.round(calcFreq/1000)} MHz)`;
}

function updateSliderFill(slider, minBound, maxBound, value, color) {
const range = maxBound - minBound;
const pct = ((value - minBound) / range) * 100;
slider.style.background = `linear-gradient(to right, ${color} ${pct}%, #2a3152 ${pct}%)`;
}

function debouncedApplyGlobal(sliderElement) {
if (globalApplyTimer) clearTimeout(globalApplyTimer);
globalApplyTimer = setTimeout(() => applyGlobalLimit(sliderElement), 150);
}

// ✅ UNIFIED APPLY LOGIC
async function applyGlobalLimit(sliderElement) {
if (sliderElement) sliderElement.style.opacity = '0.7';
let successCount = 0;
try {
// 1. Write percent to text file
await unlockFilePermissions(TOUCH_FREQ_CONFIG);
if (await writeWithBusybox(TOUCH_FREQ_CONFIG, globalMaxPercent)) {
successCount++;
if (protectionEnabled) await lockFilePermissions(TOUCH_FREQ_CONFIG);
}

    // 2. Apply absolute calculated frequency to all policies
     for (const p of policies) {
         const absMax = calcFreqFromPercent(globalMaxPercent, p.cpuinfoMax, p.cpuinfoMin);
         if (p.id.startsWith('policy')) {
             const pBase = `/sys/devices/system/cpu/cpufreq/${p.id}`;
             await unlockFilePermissions(`${pBase}/scaling_max_freq`);
             if (await writeWithBusybox(`${pBase}/scaling_max_freq`, absMax)) { 
                 successCount++; 
                 if (protectionEnabled) await lockFilePermissions(`${pBase}/scaling_max_freq`); 
             }
         }
         for (const cpu of p.cpus) {
             const basePath = `/sys/devices/system/cpu/cpu${cpu}/cpufreq`;
             await unlockFilePermissions(`${basePath}/scaling_max_freq`);
             if (await writeWithBusybox(`${basePath}/scaling_max_freq`, absMax)) { 
                 successCount++; 
                 if (protectionEnabled) await lockFilePermissions(`${basePath}/scaling_max_freq`); 
             }
         }
     }

     await new Promise(r => setTimeout(r, 100));
     const statusEl = document.getElementById('status-global');
     if (statusEl) {
         if (protectionEnabled && successCount > 0) {
             statusEl.textContent = `🔒 Locked MAX: ${globalMaxPercent}%`;
             statusEl.style.color = '#32D74B';
         } else if (successCount > 0) {
             statusEl.textContent = `✅ Applied MAX: ${globalMaxPercent}%`;
             statusEl.style.color = '#32D74B';
         } else {
             statusEl.textContent = '❌ Failed';
             statusEl.style.color = '#FF453A';
         }
     }

     if (successCount > 0 && window.showStatus) {
         window.showStatus(`Global MAX: ${globalMaxPercent}% ${protectionEnabled ? '🔒' : ''}`, '#32D74B');
     }
     if (sliderElement) sliderElement.style.opacity = '1';
 } catch (e) {
     console.error('Apply error:', e);
     if (window.showStatus) window.showStatus(`Error applying global limit`, '#FF453A');
     if (sliderElement) sliderElement.style.opacity = '1';
 }
}

// ✅ OFF-SCREEN PROFILE UI & LOGIC
function createOffscreenCard() {
    const card = document.createElement('div');
    card.style.cssText = 'background:#0a0c10; border:1px solid #2a3152; border-radius:12px; padding:16px; margin-top:16px;';
    
    const headerRow = document.createElement('div');
    headerRow.style.cssText = 'display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;';
    headerRow.innerHTML = `
        <div>
            <div style="color:#FF9F0A; font-size:16px; font-weight:700;">🌙 Off-Screen Profile</div>
            <div style="color:#8b92b4; font-size:11px; margin-top:2px;">Auto-apply when display is off</div>
        </div>
    `;
    
    const toggleContainer = document.createElement('label');
    toggleContainer.style.cssText = 'position:relative; display:inline-block; width:52px; height:28px; cursor:pointer;';
    const toggleInput = document.createElement('input');
    toggleInput.type = 'checkbox';
    toggleInput.checked = offscreenEnabled;
    toggleInput.style.cssText = 'opacity:0; width:0; height:0;';
    const toggleSlider = document.createElement('span');
    toggleSlider.style.cssText = `position:absolute; cursor:pointer; top:0; left:0; right:0; bottom:0; background:${offscreenEnabled ? '#FF9F0A' : '#2a3152'}; border-radius:28px; transition:0.3s;`;
    const toggleKnob = document.createElement('span');
    toggleKnob.style.cssText = `position:absolute; height:22px; width:22px; left:${offscreenEnabled ? '27px' : '3px'}; bottom:3px; background:#fff; border-radius:50%; transition:0.3s; box-shadow:0 2px 4px rgba(0,0,0,0.3);`;
    
    toggleContainer.appendChild(toggleInput);
    toggleContainer.appendChild(toggleSlider);
    toggleContainer.appendChild(toggleKnob);
    headerRow.appendChild(toggleContainer);
    
    toggleInput.addEventListener('change', (e) => {
        offscreenEnabled = e.target.checked;
        toggleSlider.style.background = offscreenEnabled ? '#FF9F0A' : '#2a3152';
        toggleKnob.style.left = offscreenEnabled ? '27px' : '3px';
        saveOffscreenSettings();
        if (window.showStatus) window.showStatus(`Off-Screen Profile: ${offscreenEnabled ? 'ENABLED 🌙' : 'DISABLED'}`, offscreenEnabled ? '#FF9F0A' : '#8b92b4');
    });

    card.appendChild(headerRow);

    const content = document.createElement('div');
    content.id = 'offscreen-content';
    content.style.cssText = `opacity: ${offscreenEnabled ? '1' : '0.5'}; transition: opacity 0.3s; pointer-events: ${offscreenEnabled ? 'auto' : 'none'};`;

    // Off-screen Frequency Slider
    const freqWrapper = document.createElement('div');
    freqWrapper.style.cssText = 'margin-bottom:16px;';
    const freqLabel = document.createElement('div');
    freqLabel.style.cssText = 'color:#FF9F0A; font-size:12px; font-weight:600; margin-bottom:8px;';
    freqLabel.textContent = '📉 Off-Screen Max Frequency (%)';
    freqWrapper.appendChild(freqLabel);

    const freqValue = document.createElement('div');
    freqValue.id = 'val-offscreen-freq';
    freqValue.style.cssText = 'text-align:center; color:#fff; font-size:14px; font-weight:700; font-family:monospace; margin-bottom:10px; padding:6px; background:#1a1f3a; border-radius:8px;';
    freqWrapper.appendChild(freqValue);

    const freqSlider = document.createElement('input');
    freqSlider.type = 'range';
    freqSlider.id = 'slider-offscreen-freq';
    freqSlider.min = 25;
    freqSlider.max = 100;
    freqSlider.step = 1;
    freqSlider.value = offscreenFreqPercent;
    freqSlider.style.cssText = 'width:100%; height:6px; background:linear-gradient(to right, #2a3152 50%, #FF9F0A 50%); border-radius:3px; outline:none; -webkit-appearance:none;';
    
    freqSlider.addEventListener('input', () => {
        let val = parseInt(freqSlider.value);
        offscreenFreqPercent = val;
        updateOffscreenFreqDisplay(freqValue);
        updateSliderFill(freqSlider, 25, 100, val, '#FF9F0A');
        debouncedSaveOffscreen();
    });
    
    updateOffscreenFreqDisplay(freqValue);
    updateSliderFill(freqSlider, 25, 100, offscreenFreqPercent, '#FF9F0A');
    freqWrapper.appendChild(freqSlider);
    content.appendChild(freqWrapper);

    // Off-screen Governor Selector
    const govWrapper = document.createElement('div');
    govWrapper.style.cssText = 'margin-bottom:16px;';
    const govLabel = document.createElement('div');
    govLabel.style.cssText = 'color:#FF9F0A; font-size:12px; font-weight:600; margin-bottom:8px;';
    govLabel.textContent = '⚙️ Off-Screen Governor';
    govWrapper.appendChild(govLabel);

    const govSelect = document.createElement('select');
    govSelect.id = 'select-offscreen-gov';
    govSelect.style.cssText = 'width:100%; padding:10px; background:#1a1f3a; color:#fff; border:1px solid #2a3152; border-radius:8px; font-size:14px; font-weight:600; outline:none; cursor:pointer;';
    
    availableGovernors.forEach(gov => {
        const opt = document.createElement('option');
        opt.value = gov;
        opt.textContent = gov.charAt(0).toUpperCase() + gov.slice(1);
        if (gov === offscreenGovernor) opt.selected = true;
        govSelect.appendChild(opt);
    });

    govSelect.addEventListener('change', (e) => {
        offscreenGovernor = e.target.value;
        debouncedSaveOffscreen();
    });

    govWrapper.appendChild(govSelect);
    content.appendChild(govWrapper);

    const infoText = document.createElement('div');
    infoText.style.cssText = 'text-align:center; color:#8b92b4; font-size:11px; margin-top:8px; padding:8px; background:#1a1f3a; border-radius:6px;';
    infoText.innerHTML = `Config saved to <span style="color:#FF9F0A; font-weight:600;">/sdcard/MTK_AI_Engine/</span><br>Offscreen profile can save battery & less overheating.`;
    content.appendChild(infoText);

    card.appendChild(content);
    return card;
}

function updateOffscreenFreqDisplay(el) {
    const maxPossible = policies.length > 0 ? Math.max(...policies.map(p => p.cpuinfoMax)) : 0;
    const calcFreq = maxPossible > 0 ? Math.round((offscreenFreqPercent / 100) * maxPossible) : 0;
    el.textContent = `MAX: ${offscreenFreqPercent}% (${Math.round(calcFreq/1000)} MHz)`;
}

function debouncedSaveOffscreen() {
    if (offscreenSaveTimer) clearTimeout(offscreenSaveTimer);
    offscreenSaveTimer = setTimeout(saveOffscreenSettings, 300);
}

async function saveOffscreenSettings() {
    try {
        await unlockFilePermissions(OFFSCREEN_ENABLE_CONFIG);
        await writeWithBusybox(OFFSCREEN_ENABLE_CONFIG, offscreenEnabled ? '1' : '0');
        if (protectionEnabled) await lockFilePermissions(OFFSCREEN_ENABLE_CONFIG);

        await unlockFilePermissions(OFFSCREEN_FREQ_CONFIG);
        await writeWithBusybox(OFFSCREEN_FREQ_CONFIG, offscreenFreqPercent);
        if (protectionEnabled) await lockFilePermissions(OFFSCREEN_FREQ_CONFIG);

        await unlockFilePermissions(OFFSCREEN_GOV_CONFIG);
        await writeWithBusybox(OFFSCREEN_GOV_CONFIG, offscreenGovernor);
        if (protectionEnabled) await lockFilePermissions(OFFSCREEN_GOV_CONFIG);

        const contentEl = document.getElementById('offscreen-content');
        if (contentEl) {
            contentEl.style.opacity = offscreenEnabled ? '1' : '0.5';
            contentEl.style.pointerEvents = offscreenEnabled ? 'auto' : 'none';
        }
    } catch (e) {
        console.error('Save offscreen settings error:', e);
    }
}

async function updateGlobalCurrentFrequency() {
let totalFreq = 0;
let count = 0;
for (const p of policies) {
if (p.cpus.length === 0) continue;
const curFreq = await safeRead(`/sys/devices/system/cpu/cpu${p.cpus[0]}/cpufreq/scaling_cur_freq`);
const freq = parseInt(curFreq) || 0;
totalFreq += freq;
count++;
}
const avgFreq = count > 0 ? Math.round(totalFreq / count) : 0;
const el = document.getElementById('cur-freq-global');
if (el) {
el.textContent = `${Math.round(avgFreq/1000)} MHz`;
el.style.color = '#32D74B';
}
}

async function startFreqUpdates() {
if (freqUpdateInterval) clearInterval(freqUpdateInterval);
await updateGlobalCurrentFrequency();
freqUpdateInterval = setInterval(async () => { await updateGlobalCurrentFrequency(); }, 1000);
}

function stopFreqUpdates() {
if (freqUpdateInterval) { clearInterval(freqUpdateInterval); freqUpdateInterval = null; }
if (globalApplyTimer) clearTimeout(globalApplyTimer);
globalApplyTimer = null;
if (offscreenSaveTimer) clearTimeout(offscreenSaveTimer);
offscreenSaveTimer = null;
}

async function applyGovernor(gov) {
gov = gov.toLowerCase().trim();
if (!availableGovernors.includes(gov)) { alert(`❌ Governor "${gov}" not supported`); return; }
const modal = document.getElementById('cpu-gov-modal');
if (!modal) return;
const titleEl = modal.querySelector('h3');
 const statusEl = modal.querySelector('.apply-status') || (() => {
     const el = document.createElement('div'); el.className = 'apply-status';
     el.style.cssText = 'text-align:center; padding:10px 0; font-size:13px;';
     modal.querySelector('div[style*="grid"]').before(el); return el;
 })();

 titleEl.textContent = 'Applying...';
 statusEl.textContent = `Writing ${gov}...`; statusEl.style.color = '#FF9F0A';

 try {
     await execFn(`su -c 'chmod 777 "${GOV_CONFIG}" 2>/dev/null'`, 100);
     await execFn(`su -c '${BUSYBOX} echo "${gov}" > "${GOV_CONFIG}"'`, 3000);

     for (const p of policies) {
         if (p.id.startsWith('policy')) {
             const govPath = `/sys/devices/system/cpu/cpufreq/${p.id}/scaling_governor`;
             await execFn(`su -c 'chmod 777 "${govPath}" 2>/dev/null'`, 100);
             await execFn(`su -c '${BUSYBOX} echo "${gov}" > "${govPath}"'`, 3000);
             if (protectionEnabled) await execFn(`su -c 'chmod 000 "${govPath}"'`, 100);
         }
     }

     for (let i = 0; i < coreCount; i++) {
         const govPath = `/sys/devices/system/cpu/cpu${i}/cpufreq/scaling_governor`;
         await execFn(`su -c 'chmod 777 "${govPath}" 2>/dev/null'`, 100);
         await execFn(`su -c '${BUSYBOX} echo "${gov}" > "${govPath}"'`, 3000);
         if (protectionEnabled) await execFn(`su -c 'chmod 000 "${govPath}"'`, 100);
     }

     await new Promise(r => setTimeout(r, 500));
     const verify = await safeRead('/sys/devices/system/cpu/cpu0/cpufreq/scaling_governor');
     if (verify?.trim().toLowerCase() !== gov) throw new Error(`Verify failed`);

     currentGovernor = gov;
     const govNameEl = document.getElementById('panel-gov-name');
     if (govNameEl) govNameEl.textContent = currentGovernor;

     if (window.showStatus) window.showStatus(`Governor → ${currentGovernor} ${protectionEnabled ? '🔒' : ''}`, '#32D74B');

     titleEl.textContent = '✅ Applied';
     statusEl.textContent = `${currentGovernor} active`; statusEl.style.color = '#32D74B';
     setTimeout(() => modal.remove(), 100);
 } catch (e) {
     console.error('Governor apply failed:', e);
     titleEl.textContent = '❌ Failed';
     statusEl.textContent = e.message || 'Check permissions'; statusEl.style.color = '#FF453A';
     setTimeout(() => modal.remove(), 100);
 }
}

function showGovernorSelector() {
const existing = document.getElementById('cpu-gov-modal');
if (existing) existing.remove();
const modal = document.createElement('div');
modal.id = 'cpu-gov-modal';
modal.style.cssText = `position: fixed; inset: 0; background: rgba(0,0,0,0.9); z-index: 10001; display: flex; align-items: center; justify-content: center; backdrop-filter: blur(8px);`;

const box = document.createElement('div');
box.style.cssText = `background: linear-gradient(135deg, #1a1f3a, #151b2d); border: 2px solid #4a9eff; border-radius: 16px; padding: 24px; width: 90%; max-width: 400px; box-shadow: 0 20px 60px rgba(74, 158, 255, 0.4);`;
box.innerHTML = `<h3 style="margin:0 0 16px; font-size:18px; font-weight:700; text-align:center; color:#fff;">🔄 Select Active Governor</h3> <div style="color:#8b92b4; font-size:13px; margin-bottom:20px; text-align:center;"> Current: <span style="color:#32D74B; font-weight:700;">${currentGovernor}</span> </div> <div id="gov-grid" style="display:grid; grid-template-columns:repeat(2,1fr); gap:10px; margin-bottom:20px;"></div> <button id="gov-close" style="width:100%; padding:12px; background:#2a3152; color:#fff; border:none; border-radius:10px; font-size:14px; font-weight:600; cursor:pointer;">Cancel</button>`;

const grid = box.querySelector('#gov-grid');
availableGovernors.forEach(gov => {
const btn = document.createElement('button');
const isCurrent = gov === currentGovernor;
btn.textContent = gov.charAt(0).toUpperCase() + gov.slice(1);
btn.style.cssText = `padding:14px; background:${isCurrent ? 'linear-gradient(135deg,#32D74B,#2ecc71)' : '#0f1419'}; color:${isCurrent ? '#fff' : '#e0e0e0'}; border:${isCurrent ? '2px solid #32D74B' : '1px solid #2a3152'}; border-radius:10px; font-size:13px; font-weight:${isCurrent ? '700' : '600'}; cursor:pointer;`;
btn.onclick = () => applyGovernor(gov);
grid.appendChild(btn);
});

box.querySelector('#gov-close').onclick = () => modal.remove();
modal.onclick = e => { if (e.target === modal) modal.remove(); };
modal.appendChild(box);
document.body.appendChild(modal);
}

// Cleanup
window.addEventListener('beforeunload', () => {
stopFreqUpdates();
if (modalElement) modalElement.remove();
});

// Init
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();

window.applyCPUGovernor = applyGovernor;
})();
