// cpu.js - CPU Frequency Control - FULL FEATURED (Optimized + Tunables + Script Generator)
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
let tunablesModalElement = null;
let globalMaxPercent = 100;
let offscreenEnabled = false;
let offscreenFreqPercent = 50;
let offscreenGovernor = 'powersave';
let offscreenSaveTimer = null;
let tunableTimers = {};
let modifiedTunables = {};
let freqReadAbort = false;

console.log('[CPU.js] Script loaded - FULL FEATURED');

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

async function fastRead(path) {
    const res = await execFn(`${BUSYBOX} cat "${path}" 2>/dev/null`, 500);
    return res?.trim() || '';
}

async function batchReadFreqs(cpuIndices) {
    if (cpuIndices.length === 0) return [];
    const paths = cpuIndices.map(i => `/sys/devices/system/cpu/cpu${i}/cpufreq/scaling_cur_freq`).join(' ');
    const cmd = `for f in ${paths}; do ${BUSYBOX} cat "$f" 2>/dev/null; echo "---"; done`;
    const result = await execFn(cmd, 1000);
    return result.split('---').map(s => parseInt(s.trim()) || 0).filter(n => n > 0);
}

async function writeWithBusybox(path, value) {
    try {
        await execFn(`su -c 'chmod 777 "${path}"'`, 100);
        await execFn(`su -c '${BUSYBOX} echo "${value}" > "${path}"'`, 100);
        return true;
    } catch (e) {
        console.error(`Write failed for ${path}:`, e);
        return false;
    }
}

async function lockFilePermissions(path) {
    if (!protectionEnabled) return true;
    try {
        await execFn(`su -c 'chmod 000 "${path}"'`, 100);
        return true;
    } catch (e) { return false; }
}

async function unlockFilePermissions(path) {
    try {
        await execFn(`su -c 'chmod 777 "${path}"'`, 100);
        return true;
    } catch (e) { return false; }
}

async function safeRead(path) {
    await unlockFilePermissions(path);
    return await fastRead(path);
}

async function init() {
    try {
        console.log('[CPU.js] Initializing...');
        await execFn(`su -c 'mkdir -p "${CONFIG_DIR}"'`, 100);
        
        const existingTouch = await fastRead(TOUCH_FREQ_CONFIG);
        if (!existingTouch) await execFn(`su -c '${BUSYBOX} echo "100" > "${TOUCH_FREQ_CONFIG}"'`, 100);
        
        const existingOffEnabled = await fastRead(OFFSCREEN_ENABLE_CONFIG);
        if (!existingOffEnabled) await execFn(`su -c '${BUSYBOX} echo "0" > "${OFFSCREEN_ENABLE_CONFIG}"'`, 100);
        
        const existingOffFreq = await fastRead(OFFSCREEN_FREQ_CONFIG);
        if (!existingOffFreq) await execFn(`su -c '${BUSYBOX} echo "50" > "${OFFSCREEN_FREQ_CONFIG}"'`, 100);
        
        const existingOffGov = await fastRead(OFFSCREEN_GOV_CONFIG);
        if (!existingOffGov) await execFn(`su -c '${BUSYBOX} echo "powersave" > "${OFFSCREEN_GOV_CONFIG}"'`, 100);
        
        await loadSystemData();
        await loadSavedSettings();
        setupToggleHandler();
        console.log('[CPU.js] Initialization complete');
    } catch (e) { console.error('[CPU.js] Init failed:', e); }
}

async function loadSystemData() {
    const cpuTopo = await execFn(`${BUSYBOX} ls -d /sys/devices/system/cpu/cpu[0-9]* 2>/dev/null | ${BUSYBOX} wc -l`, 2000);
    coreCount = parseInt(cpuTopo) || 8;
    
    const raw = await fastRead('/sys/devices/system/cpu/cpu0/cpufreq/scaling_available_governors');
    availableGovernors = raw?.split(/\s+/).filter(g => g) || ['performance', 'schedutil', 'powersave'];
    
    const policyList = await execFn(`${BUSYBOX} ls -d /sys/devices/system/cpu/cpufreq/policy* 2>/dev/null`, 2000);
    const policyIds = (policyList?.match(/policy\d+/g) || []).sort((a,b) => parseInt(a.replace('policy','')) - parseInt(b.replace('policy','')));
    
    for (const pid of policyIds) {
        const basePath = `/sys/devices/system/cpu/cpufreq/${pid}`;
        const cpuinfoMin = parseInt(await fastRead(`${basePath}/cpuinfo_min_freq`)) || 1000;
        const cpuinfoMax = parseInt(await fastRead(`${basePath}/cpuinfo_max_freq`)) || 1000;
        const cpus = (await execFn(`${BUSYBOX} cat ${basePath}/affected_cpus 2>/dev/null`, 500))?.trim().split(/\s+/).map(Number).filter(n => !isNaN(n)) || [];
        policies.push({ id: pid, cpus, curFreq: 0, cpuinfoMin, cpuinfoMax, step: 1000 });
    }
    
    if (policies.length === 0) {
        for (let i = 0; i < coreCount; i++) {
            const basePath = `/sys/devices/system/cpu/cpu${i}/cpufreq`;
            const cpuinfoMin = parseInt(await fastRead(`${basePath}/cpuinfo_min_freq`)) || 1000;
            const cpuinfoMax = parseInt(await fastRead(`${basePath}/cpuinfo_max_freq`)) || 1000;
            policies.push({ id: `cpu${i}`, cpus: [i], curFreq: 0, cpuinfoMin, cpuinfoMax, step: 1000 });
        }
    }
    console.log('[CPU.js] Loaded', policies.length, 'policies');
}

async function loadSavedSettings() {
    try {
        const savedGov = await fastRead(GOV_CONFIG);
        const liveGov = await fastRead('/sys/devices/system/cpu/cpu0/cpufreq/scaling_governor');
        currentGovernor = (savedGov && availableGovernors.includes(savedGov)) ? savedGov : (liveGov || 'performance');
        
        const touchFreq = await fastRead(TOUCH_FREQ_CONFIG);
        if (touchFreq) { let p = parseInt(touchFreq); if (!isNaN(p)) globalMaxPercent = Math.min(100, Math.max(25, p)); }
        
        const offEnabled = await fastRead(OFFSCREEN_ENABLE_CONFIG);
        offscreenEnabled = (offEnabled === '1');
        
        const offFreq = await fastRead(OFFSCREEN_FREQ_CONFIG);
        if (offFreq) { let p = parseInt(offFreq); if (!isNaN(p)) offscreenFreqPercent = Math.min(100, Math.max(25, p)); }
        
        const offGov = await fastRead(OFFSCREEN_GOV_CONFIG);
        if (offGov && availableGovernors.includes(offGov)) offscreenGovernor = offGov;
        else if (availableGovernors.includes('powersave')) offscreenGovernor = 'powersave';
        else if (availableGovernors.length > 0) offscreenGovernor = availableGovernors[0];
    } catch (e) { console.warn('[CPU.js] Settings load error:', e); }
}

function setupToggleHandler() {
    const item = document.getElementById('cpu-gov-item');
    if (!item) { console.error('[CPU.js] ERROR: cpu-gov-item not found!'); return; }
    item.style.cursor = 'pointer';
    item.addEventListener('click', (e) => {
        if (e.target.closest('#cpu-gov-modal') || e.target.closest('#cpu-control-modal') || e.target.closest('#tunables-modal')) return;
        togglePanel();
    });
}

function togglePanel() {
    panelVisible = !panelVisible;
    if (panelVisible) { if (!panelRendered) { renderModal(); panelRendered = true; } openModal(); }
    else { closeModal(); }
}

function openModal() {
    if (!modalElement) return;
    modalElement.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    startFreqUpdates();
}

function closeModal() {
    if (!modalElement) return;
    modalElement.style.display = 'none';
    document.body.style.overflow = '';
    panelVisible = false;
    stopFreqUpdates();
}

window.showCPUPanel = function() {
    if (!panelRendered) { renderModal(); panelRendered = true; }
    panelVisible = true;
    openModal();
};

window.closeCPUPanel = closeModal;

// ✅ TUNABLES MODAL
function openTunablesModal() {
    if (!tunablesModalElement) { renderTunablesModal(); }
    tunablesModalElement.style.display = 'flex';
    loadAndRenderTunables();
}

function closeTunablesModal() {
    if (tunablesModalElement) { tunablesModalElement.style.display = 'none'; }
}

function renderTunablesModal() {
    tunablesModalElement = document.createElement('div');
    tunablesModalElement.id = 'tunables-modal';
    tunablesModalElement.style.cssText = `display:none;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.85);z-index:10002;justify-content:center;align-items:center;padding:20px;backdrop-filter:blur(10px);font-family:system-ui,sans-serif;`;
    tunablesModalElement.addEventListener('click', (e) => { if (e.target === tunablesModalElement) closeTunablesModal(); });
    
    const modalContent = document.createElement('div');
    modalContent.style.cssText = `background:linear-gradient(135deg,var(--bg-secondary),var(--bg-card));border:2px solid var(--accent-purple);border-radius:16px;width:100%;max-width:520px;max-height:85vh;overflow-y:auto;box-shadow:0 20px 60px rgba(155,89,182,0.4);color:var(--text-primary);`;
    
    const header = document.createElement('div');
    header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:20px 24px;border-bottom:2px solid var(--border-color);position:sticky;top:0;background:linear-gradient(135deg,var(--bg-secondary),var(--bg-card));z-index:10;border-radius:16px 16px 0 0;flex-wrap:wrap;gap:10px;';
    header.innerHTML = `
        <div> 
            <div style="color:var(--accent-purple);font-size:18px;font-weight:700;">⚙️ Governor Tunables</div> 
            <div style="color:var(--text-secondary);font-size:12px;margin-top:2px;" id="tunables-modal-gov-name">Current: ${currentGovernor}</div> 
        </div>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            <button id="refresh-tunables-btn" style="background:var(--bg-secondary);color:var(--text-primary);border:1px solid var(--border-color);border-radius:8px;padding:8px 12px;font-size:12px;cursor:pointer;font-weight:600;">🔄 Refresh</button>
            <button id="generate-script-btn" style="background:linear-gradient(135deg,var(--accent-purple),var(--accent-blue));color:var(--text-primary);border:none;border-radius:8px;padding:8px 12px;font-size:12px;cursor:pointer;font-weight:600;box-shadow:0 4px 10px rgba(155,89,182,0.3);">💾 Save Script</button>
            <button id="tunables-close-btn" style="width:32px;height:32px;border-radius:50%;border:1px solid var(--border-color);background:var(--bg-secondary);color:var(--text-primary);font-size:20px;cursor:pointer;display:flex;align-items:center;justify-content:center;">×</button>
        </div>`;
    modalContent.appendChild(header);
    
    const body = document.createElement('div');
    body.style.cssText = 'padding:20px 24px;';
    body.innerHTML = '<div id="tunables-modal-list" style="display:flex;flex-direction:column;gap:12px;"></div>';
    modalContent.appendChild(body);
    
    tunablesModalElement.appendChild(modalContent);
    document.body.appendChild(tunablesModalElement);
    
    document.getElementById('tunables-close-btn')?.addEventListener('click', (e) => { e.stopPropagation(); closeTunablesModal(); });
    document.getElementById('refresh-tunables-btn')?.addEventListener('click', (e) => { e.stopPropagation(); loadAndRenderTunables(); });
    document.getElementById('generate-script-btn')?.addEventListener('click', (e) => { e.stopPropagation(); generateTunablesScript(); });
    
    document.addEventListener('keydown', function tunablesEscHandler(e) {
        if (e.key === 'Escape' && tunablesModalElement?.style.display === 'flex') { closeTunablesModal(); }
    });
}

// ✅ SCRIPT GENERATOR
async function generateTunablesScript() {
    const btn = document.getElementById('generate-script-btn');
    if (btn) { btn.textContent = 'Generating...'; btn.style.opacity = '0.7'; }
    const scriptPath = CONFIG_DIR + '/apply_tunables.sh';
    try {
        await execFn("su -c 'chmod 777 \"" + CONFIG_DIR + "\"'", 100);
        let script = '#!/system/bin/sh\n';
        script += '# MTK AI Engine - Governor Tunables Script\n';
        script += '# Generated: ' + new Date().toISOString() + '\n';
        script += '# Governor: ' + currentGovernor + '\n';
        script += '# Applies tunables to ALL CPU cores\n\n';
        script += 'echo "Applying tunables for ' + currentGovernor + '..."\n\n';
        
        const entries = Object.entries(modifiedTunables);
        if (entries.length === 0) {
            script += 'echo "No tunables modified in this session."\n';
        } else {
            for (const [path, value] of entries) {
                const safeValue = value.replace(/'/g, "'\\''");
                const tunableName = path.split('/').pop();
                const cpuMatch = path.match(/\/cpu(\d+)\//);
                if (cpuMatch) {
                    script += '# Apply to all CPU cores\n';
                    script += 'for cpu_dir in /sys/devices/system/cpu/cpu[0-9]*; do\n';
                    script += '  tunable_path="$cpu_dir/cpufreq/' + currentGovernor + '/' + tunableName + '"\n';
                    script += '  if [ -f "$tunable_path" ]; then\n';
                    script += '    chmod 777 "$tunable_path"\n';
                    script += "    echo '" + safeValue + "' > \"$tunable_path\"\n";
                    script += '    echo "Applied: $tunable_path = ' + value + '"\n';
                    script += '  fi\n';
                    script += 'done\n';
                } else if (path.includes('/cpufreq/policy')) {
                    script += '# Apply to all CPU policies\n';
                    script += 'for policy_dir in /sys/devices/system/cpu/cpufreq/policy*; do\n';
                    script += '  tunable_path="$policy_dir/' + tunableName + '"\n';
                    script += '  if [ -f "$tunable_path" ]; then\n';
                    script += '    chmod 777 "$tunable_path"\n';
                    script += "    echo '" + safeValue + "' > \"$tunable_path\"\n";
                    script += '    echo "Applied: $tunable_path = ' + value + '"\n';
                    script += '  fi\n';
                    script += 'done\n';
                } else {
                    script += 'if [ -f "' + path + '" ]; then\n';
                    script += '  chmod 777 "' + path + '"\n';
                    script += "  echo '" + safeValue + "' > \"" + path + "\"\n";
                    script += '  echo "Applied: ' + path + ' = ' + value + '"\n';
                    script += 'else\n';
                    script += '  echo "Skipped (not found): ' + path + '"\n';
                    script += 'fi\n';
                }
                script += '\n';
            }
        }
        
        const base64Content = btoa(script);
        await execFn("su -c 'echo \"" + base64Content + "\" | base64 -d > \"" + scriptPath + "\"'", 500);
        await execFn("su -c 'chmod 755 \"" + scriptPath + "\"'", 100);
        
        const verify = await execFn("su -c 'test -f \"" + scriptPath + "\" && echo OK || echo FAIL'", 100);
        if (verify && verify.trim() === 'OK') {
            if (btn) { btn.textContent = 'Saved!'; btn.style.opacity = '1'; setTimeout(function() { btn.textContent = 'Save Script'; }, 2000); }
            if (window.showStatus) window.showStatus('Script saved: ' + scriptPath, 'var(--accent-green)');
        } else {
            throw new Error('File verification failed');
        }
    } catch (e) {
        console.error('Script generation failed:', e);
        if (btn) { btn.textContent = 'Failed'; btn.style.opacity = '1'; setTimeout(function() { btn.textContent = 'Save Script'; }, 2000); }
        if (window.showStatus) window.showStatus('Script generation failed: ' + e.message, 'var(--accent-red)');
    }
}

function renderModal() {
    const existing = document.getElementById('cpu-control-modal');
    if (existing) existing.remove();
    modalElement = document.createElement('div');
    modalElement.id = 'cpu-control-modal';
    modalElement.style.cssText = `display:none;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.85);z-index:10000;justify-content:center;align-items:center;padding:20px;backdrop-filter:blur(10px);font-family:system-ui,sans-serif;`;
    modalElement.addEventListener('click', (e) => { if (e.target === modalElement) closeModal(); });
    
    const modalContent = document.createElement('div');
    modalContent.style.cssText = `background:linear-gradient(135deg,var(--bg-secondary),var(--bg-card));border:2px solid var(--border-color);border-radius:16px;width:100%;max-width:520px;max-height:90vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.5);color:var(--text-primary);`;
    
    const header = document.createElement('div');
    header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:20px 24px;border-bottom:2px solid var(--border-color);position:sticky;top:0;background:linear-gradient(135deg,var(--bg-secondary),var(--bg-card));z-index:10;border-radius:16px 16px 0 0;';
    header.innerHTML = `
        <div style="display:flex;align-items:center;gap:10px;">
            <button id="open-tunables-btn" style="display:flex;align-items:center;gap:8px;padding:8px 14px;background:rgba(155,89,182,0.12);border:1px solid rgba(155,89,182,0.35);border-radius:10px;color:var(--text-primary);font-size:13px;font-weight:600;cursor:pointer;transition:all 0.2s ease;font-family:system-ui,sans-serif;letter-spacing:0.2px;">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
                Tunables
            </button>
        </div>
        <div style="display:flex;align-items:center;gap:12px;">
            <div style="background:var(--bg-primary);padding:6px 14px;border-radius:8px;border:1px solid var(--border-color);">
                <span style="color:var(--text-secondary);font-size:11px;">Governor: </span>
                <span id="panel-gov-name" style="color:var(--accent-green);font-weight:700;font-size:13px;">${currentGovernor}</span>
            </div>
            <button id="modal-close-btn" style="width:32px;height:32px;border-radius:50%;border:1px solid var(--border-color);background:var(--bg-secondary);color:var(--text-primary);font-size:20px;cursor:pointer;display:flex;align-items:center;justify-content:center;">×</button>
        </div>`;
    modalContent.appendChild(header);
    
    const body = document.createElement('div');
    body.style.cssText = 'padding:20px 24px;';
    
    // Protection toggle
    const protectionRow = document.createElement('div');
    protectionRow.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;padding:12px 16px;background:var(--bg-primary);border-radius:10px;border:1px solid var(--border-color);';
    protectionRow.innerHTML = `<div><div style="color:var(--text-primary);font-size:14px;font-weight:600;">Lock Frequencies</div><div style="color:var(--text-secondary);font-size:11px;margin-top:2px;">Prevent system overrides</div></div>`;
    
    const toggleContainer = document.createElement('label');
    toggleContainer.style.cssText = 'position:relative;display:inline-block;width:52px;height:28px;cursor:pointer;';
    const toggleInput = document.createElement('input');
    toggleInput.type = 'checkbox';
    toggleInput.checked = protectionEnabled;
    toggleInput.style.cssText = 'opacity:0;width:0;height:0;';
    const toggleSlider = document.createElement('span');
    toggleSlider.style.cssText = `position:absolute;cursor:pointer;top:0;left:0;right:0;bottom:0;background:${protectionEnabled?'var(--accent-green)':'var(--border-color)'};border-radius:28px;transition:0.3s;`;
    const toggleKnob = document.createElement('span');
    toggleKnob.style.cssText = `position:absolute;height:22px;width:22px;left:${protectionEnabled?'27px':'3px'};bottom:3px;background:var(--text-primary);border-radius:50%;transition:0.3s;box-shadow:0 2px 4px rgba(0,0,0,0.3);`;
    
    toggleContainer.appendChild(toggleInput);
    toggleContainer.appendChild(toggleSlider);
    toggleContainer.appendChild(toggleKnob);
    protectionRow.appendChild(toggleContainer);
    body.appendChild(protectionRow);
    
    toggleInput.addEventListener('change', (e) => {
        protectionEnabled = e.target.checked;
        toggleSlider.style.background = protectionEnabled ? 'var(--accent-green)' : 'var(--border-color)';
        toggleKnob.style.left = protectionEnabled ? '27px' : '3px';
        if (window.showStatus) window.showStatus(protectionEnabled ? 'Protection: ENABLED' : 'Protection: DISABLED', protectionEnabled ? 'var(--accent-green)' : 'var(--accent-orange)');
        const statusEl = document.getElementById('status-global');
        if (statusEl) statusEl.textContent = protectionEnabled ? '🔒 Will lock after apply' : '✏️ Editable';
    });
    
    const slidersContainer = document.createElement('div');
    slidersContainer.style.cssText = 'display:flex;flex-direction:column;gap:16px;';
    slidersContainer.appendChild(createGlobalSlider());
    body.appendChild(slidersContainer);
    
    body.appendChild(createOffscreenCard());
    modalContent.appendChild(body);
    modalElement.appendChild(modalContent);
    document.body.appendChild(modalElement);
    
    document.getElementById('modal-close-btn')?.addEventListener('click', (e) => { e.stopPropagation(); closeModal(); });
    document.getElementById('open-tunables-btn')?.addEventListener('click', (e) => { e.stopPropagation(); openTunablesModal(); });
    
    document.addEventListener('keydown', function escHandler(e) {
        if (e.key === 'Escape' && modalElement?.style.display === 'flex') { closeModal(); document.removeEventListener('keydown', escHandler); }
    });
}

function calcFreqFromPercent(percent, cpuinfoMax, cpuinfoMin) {
    let freq = Math.round((percent / 100) * cpuinfoMax);
    return Math.max(cpuinfoMin, freq);
}

function createGlobalSlider() {
    const card = document.createElement('div');
    card.style.cssText = 'background:var(--bg-primary);border:1px solid var(--border-color);border-radius:12px;padding:16px;';
    card.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;"><div><div style="color:var(--accent-blue);font-size:16px;font-weight:700;">️ On-Screen Profile</div><div style="color:var(--text-secondary);font-size:11px;margin-top:2px;">Active CPU Max Limit</div></div><div style="text-align:right;"><div style="color:var(--accent-green);font-size:15px;font-weight:700;font-family:monospace;" id="cur-freq-global">-- MHz</div><div style="color:var(--text-secondary);font-size:10px;">Current Avg</div></div></div>`;
    
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'margin:15px 0;';
    const valueDisplay = document.createElement('div');
    valueDisplay.id = 'val-global';
    valueDisplay.style.cssText = 'text-align:center;color:var(--text-primary);font-size:16px;font-weight:700;font-family:monospace;margin-bottom:16px;padding:8px;background:var(--bg-card);border-radius:8px;';
    wrapper.appendChild(valueDisplay);
    
    const maxLabel = document.createElement('div');
    maxLabel.style.cssText = 'color:var(--accent-green);font-size:12px;font-weight:600;margin-bottom:8px;';
    maxLabel.textContent = '📈 MAX Frequency Limit (%)';
    wrapper.appendChild(maxLabel);
    
    const maxSlider = document.createElement('input');
    maxSlider.type = 'range';
    maxSlider.id = 'slider-max-global';
    maxSlider.min = 25; maxSlider.max = 100; maxSlider.step = 1;
    maxSlider.value = globalMaxPercent;
    maxSlider.style.cssText = 'width:100%;height:6px;background:linear-gradient(to right,var(--border-color) 50%,var(--accent-green) 50%);border-radius:3px;outline:none;-webkit-appearance:none;';
    maxSlider.addEventListener('input', () => {
        let val = parseInt(maxSlider.value);
        globalMaxPercent = val;
        updateGlobalValueDisplay(valueDisplay);
        updateSliderFill(maxSlider, 25, 100, val, 'var(--accent-green)');
        debouncedApplyGlobal(maxSlider);
    });
    
    updateGlobalValueDisplay(valueDisplay);
    updateSliderFill(maxSlider, 25, 100, globalMaxPercent, 'var(--accent-green)');
    wrapper.appendChild(maxSlider);
    
    const infoText = document.createElement('div');
    infoText.style.cssText = 'text-align:center;color:var(--text-secondary);font-size:11px;margin-top:8px;padding:6px;background:var(--bg-card);border-radius:6px;';
    infoText.innerHTML = `Allowed Range: <span style="color:var(--text-primary);font-weight:600;">25%</span> - <span style="color:var(--text-primary);font-weight:600;">100%</span>`;
    wrapper.appendChild(infoText);
    card.appendChild(wrapper);
    
    const changeBtn = document.createElement('button');
    changeBtn.textContent = '🔄 Change Active Governor';
    changeBtn.style.cssText = 'width:100%;margin-top:12px;padding:12px;background:var(--bg-card);border:1px solid var(--border-color);color:var(--text-primary);border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;';
    changeBtn.addEventListener('click', (e) => { e.stopPropagation(); showGovernorSelector(); });
    card.appendChild(changeBtn);
    
    const statusRow = document.createElement('div');
    statusRow.id = 'status-global';
    statusRow.style.cssText = 'text-align:center;color:var(--text-secondary);font-size:11px;margin-top:12px;min-height:16px;font-weight:600;';
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
    const pct = range > 0 ? ((value - minBound) / range) * 100 : 0;
    slider.style.background = `linear-gradient(to right, ${color} ${pct}%, var(--border-color) ${pct}%)`;
}

function debouncedApplyGlobal(sliderElement) {
    if (globalApplyTimer) clearTimeout(globalApplyTimer);
    globalApplyTimer = setTimeout(() => applyGlobalLimit(sliderElement), 300);
}

async function applyGlobalLimit(sliderElement) {
    if (sliderElement) sliderElement.style.opacity = '0.7';
    let successCount = 0;
    try {
        await unlockFilePermissions(TOUCH_FREQ_CONFIG); 
        if (await writeWithBusybox(TOUCH_FREQ_CONFIG, globalMaxPercent)) { successCount++; if (protectionEnabled) await lockFilePermissions(TOUCH_FREQ_CONFIG); }
        
        for (const p of policies) {
            const absMax = calcFreqFromPercent(globalMaxPercent, p.cpuinfoMax, p.cpuinfoMin);
            if (p.id.startsWith('policy')) {
                const pBase = `/sys/devices/system/cpu/cpufreq/${p.id}`;
                await unlockFilePermissions(`${pBase}/scaling_max_freq`);
                if (await writeWithBusybox(`${pBase}/scaling_max_freq`, absMax)) { successCount++; if (protectionEnabled) await lockFilePermissions(`${pBase}/scaling_max_freq`); }
            }
            for (const cpu of p.cpus) {
                const basePath = `/sys/devices/system/cpu/cpu${cpu}/cpufreq`;
                await unlockFilePermissions(`${basePath}/scaling_max_freq`);
                if (await writeWithBusybox(`${basePath}/scaling_max_freq`, absMax)) { successCount++; if (protectionEnabled) await lockFilePermissions(`${basePath}/scaling_max_freq`); }
            }
        }
        
        const statusEl = document.getElementById('status-global');
        if (statusEl) {
            if (protectionEnabled && successCount > 0) { statusEl.textContent = `🔒 Locked MAX: ${globalMaxPercent}%`; statusEl.style.color = 'var(--accent-green)'; }
            else if (successCount > 0) { statusEl.textContent = `✅ Applied MAX: ${globalMaxPercent}%`; statusEl.style.color = 'var(--accent-green)'; }
            else { statusEl.textContent = '❌ Failed'; statusEl.style.color = 'var(--accent-red)'; }
        }
        if (successCount > 0 && window.showStatus) window.showStatus(`Global MAX: ${globalMaxPercent}%`, 'var(--accent-green)');
    } catch (e) { 
        console.error('Apply error:', e); 
        if (window.showStatus) window.showStatus('Error applying', 'var(--accent-red)'); 
    }
    if (sliderElement) sliderElement.style.opacity = '1';
}

function createOffscreenCard() {
    const card = document.createElement('div');
    card.style.cssText = 'background:var(--bg-primary);border:1px solid var(--border-color);border-radius:12px;padding:16px;margin-top:16px;';
    
    const headerRow = document.createElement('div');
    headerRow.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;';
    headerRow.innerHTML = `<div><div style="color:var(--accent-orange);font-size:16px;font-weight:700;">🌙 Off-Screen Profile</div><div style="color:var(--text-secondary);font-size:11px;margin-top:2px;">Auto-apply when display is off</div></div>`;
    
    const toggleContainer = document.createElement('label');
    toggleContainer.style.cssText = 'position:relative;display:inline-block;width:52px;height:28px;cursor:pointer;';
    const toggleInput = document.createElement('input');
    toggleInput.type = 'checkbox';
    toggleInput.checked = offscreenEnabled;
    toggleInput.style.cssText = 'opacity:0;width:0;height:0;';
    const toggleSlider = document.createElement('span');
    toggleSlider.style.cssText = `position:absolute;cursor:pointer;top:0;left:0;right:0;bottom:0;background:${offscreenEnabled?'var(--accent-orange)':'var(--border-color)'};border-radius:28px;transition:0.3s;`;
    const toggleKnob = document.createElement('span');
    toggleKnob.style.cssText = `position:absolute;height:22px;width:22px;left:${offscreenEnabled?'27px':'3px'};bottom:3px;background:var(--text-primary);border-radius:50%;transition:0.3s;box-shadow:0 2px 4px rgba(0,0,0,0.3);`;
    
    toggleContainer.appendChild(toggleInput);
    toggleContainer.appendChild(toggleSlider);
    toggleContainer.appendChild(toggleKnob);
    headerRow.appendChild(toggleContainer);
    
    toggleInput.addEventListener('change', (e) => {
        offscreenEnabled = e.target.checked;
        toggleSlider.style.background = offscreenEnabled ? 'var(--accent-orange)' : 'var(--border-color)';
        toggleKnob.style.left = offscreenEnabled ? '27px' : '3px';
        saveOffscreenSettings();
        if (window.showStatus) window.showStatus(`Off-Screen: ${offscreenEnabled ? 'ON' : 'OFF'}`, offscreenEnabled ? 'var(--accent-orange)' : 'var(--text-secondary)');
    });
    card.appendChild(headerRow);
    
    const content = document.createElement('div');
    content.id = 'offscreen-content';
    content.style.cssText = `opacity:${offscreenEnabled?'1':'0.5'};transition:opacity 0.3s;pointer-events:${offscreenEnabled?'auto':'none'};`;
    
    const freqWrapper = document.createElement('div');
    freqWrapper.style.cssText = 'margin-bottom:16px;';
    const freqLabel = document.createElement('div');
    freqLabel.style.cssText = 'color:var(--accent-orange);font-size:12px;font-weight:600;margin-bottom:8px;';
    freqLabel.textContent = '📉 Off-Screen Max Frequency (%)';
    freqWrapper.appendChild(freqLabel);
    
    const freqValue = document.createElement('div');
    freqValue.id = 'val-offscreen-freq';
    freqValue.style.cssText = 'text-align:center;color:var(--text-primary);font-size:14px;font-weight:700;font-family:monospace;margin-bottom:10px;padding:6px;background:var(--bg-card);border-radius:8px;';
    freqWrapper.appendChild(freqValue);
    
    const freqSlider = document.createElement('input');
    freqSlider.type = 'range';
    freqSlider.id = 'slider-offscreen-freq';
    freqSlider.min = 25; freqSlider.max = 100; freqSlider.step = 1;
    freqSlider.value = offscreenFreqPercent;
    freqSlider.style.cssText = 'width:100%;height:6px;background:linear-gradient(to right,var(--border-color) 50%,var(--accent-orange) 50%);border-radius:3px;outline:none;-webkit-appearance:none;';
    freqSlider.addEventListener('input', () => {
        let val = parseInt(freqSlider.value);
        offscreenFreqPercent = val;
        updateOffscreenFreqDisplay(freqValue);
        updateSliderFill(freqSlider, 25, 100, val, 'var(--accent-orange)');
        debouncedSaveOffscreen();
    });
    
    updateOffscreenFreqDisplay(freqValue);
    updateSliderFill(freqSlider, 25, 100, offscreenFreqPercent, 'var(--accent-orange)');
    freqWrapper.appendChild(freqSlider);
    content.appendChild(freqWrapper);
    
    const govWrapper = document.createElement('div');
    govWrapper.style.cssText = 'margin-bottom:16px;';
    const govLabel = document.createElement('div');
    govLabel.style.cssText = 'color:var(--accent-orange);font-size:12px;font-weight:600;margin-bottom:8px;';
    govLabel.textContent = '⚙️ Off-Screen Governor';
    govWrapper.appendChild(govLabel);
    
    const govSelect = document.createElement('select');
    govSelect.id = 'select-offscreen-gov';
    govSelect.style.cssText = 'width:100%;padding:10px;background:var(--bg-card);color:var(--text-primary);border:1px solid var(--border-color);border-radius:8px;font-size:14px;font-weight:600;outline:none;cursor:pointer;';
    availableGovernors.forEach(gov => {
        const opt = document.createElement('option');
        opt.value = gov;
        opt.textContent = gov.charAt(0).toUpperCase() + gov.slice(1);
        if (gov === offscreenGovernor) opt.selected = true; 
        govSelect.appendChild(opt);
    });
    govSelect.addEventListener('change', (e) => { offscreenGovernor = e.target.value; debouncedSaveOffscreen(); });
    govWrapper.appendChild(govSelect);
    content.appendChild(govWrapper);
    
    const infoText = document.createElement('div');
    infoText.style.cssText = 'text-align:center;color:var(--text-secondary);font-size:11px;margin-top:8px;padding:8px;background:var(--bg-card);border-radius:6px;';
    infoText.innerHTML = `Config saved to <span style="color:var(--accent-orange);font-weight:600;">/sdcard/MTK_AI_Engine/</span>`;
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
    offscreenSaveTimer = setTimeout(saveOffscreenSettings, 500);
}

async function saveOffscreenSettings() {
    try {
        await unlockFilePermissions(OFFSCREEN_ENABLE_CONFIG);
        await writeWithBusybox(OFFSCREEN_ENABLE_CONFIG, offscreenEnabled ? '1' : '0');
        
        await unlockFilePermissions(OFFSCREEN_FREQ_CONFIG);
        await writeWithBusybox(OFFSCREEN_FREQ_CONFIG, offscreenFreqPercent);
        if (protectionEnabled) await lockFilePermissions(OFFSCREEN_FREQ_CONFIG);
        
        await unlockFilePermissions(OFFSCREEN_GOV_CONFIG);
        await writeWithBusybox(OFFSCREEN_GOV_CONFIG, offscreenGovernor);
        
        const contentEl = document.getElementById('offscreen-content');
        if (contentEl) { contentEl.style.opacity = offscreenEnabled ? '1' : '0.5'; contentEl.style.pointerEvents = offscreenEnabled ? 'auto' : 'none'; }
    } catch (e) { console.error('Save offscreen error:', e); }
}

async function updateGlobalCurrentFrequency() {
    freqReadAbort = true;
    const myToken = Date.now();
    freqReadAbort = false;
    const allCpus = new Set();
    for (const p of policies) { for (const c of p.cpus) allCpus.add(c); }
    const cpuIndices = Array.from(allCpus);
    if (cpuIndices.length === 0) return;
    const freqs = await batchReadFreqs(cpuIndices);
    if (freqReadAbort) return;
    const totalFreq = freqs.reduce((a, b) => a + b, 0);
    const avgFreq = freqs.length > 0 ? Math.round(totalFreq / freqs.length) : 0;
    const el = document.getElementById('cur-freq-global');
    if (el && !freqReadAbort) { el.textContent = `${Math.round(avgFreq/1000)} MHz`; el.style.color = 'var(--accent-green)'; }
}

async function startFreqUpdates() {
    if (freqUpdateInterval) clearInterval(freqUpdateInterval);
    await updateGlobalCurrentFrequency();
    freqUpdateInterval = setInterval(updateGlobalCurrentFrequency, 2000);
}

function stopFreqUpdates() {
    freqReadAbort = true;
    if (freqUpdateInterval) { clearInterval(freqUpdateInterval); freqUpdateInterval = null; }
    if (globalApplyTimer) clearTimeout(globalApplyTimer);
    globalApplyTimer = null;
    if (offscreenSaveTimer) clearTimeout(offscreenSaveTimer);
    offscreenSaveTimer = null;
    for (const key in tunableTimers) { clearTimeout(tunableTimers[key]); }
    tunableTimers = {};
}

async function applyGovernor(gov) {
    gov = gov.toLowerCase().trim();
    if (!availableGovernors.includes(gov)) { alert(`Governor "${gov}" not supported`); return; }
    
    const modal = document.getElementById('cpu-gov-modal');
    if (!modal) return;
    
    const titleEl = modal.querySelector('h3');
    const statusEl = modal.querySelector('.apply-status') || (() => {
        const el = document.createElement('div'); el.className = 'apply-status';
        el.style.cssText = 'text-align:center;padding:10px 0;font-size:13px;';
        modal.querySelector('div[style*="grid"]').before(el); return el;
    })();
    
    titleEl.textContent = 'Applying...';
    statusEl.textContent = `Writing ${gov}...`; statusEl.style.color = 'var(--accent-orange)';
    
    try {
        await execFn(`su -c 'chmod 777 "${GOV_CONFIG}" 2>/dev/null'`, 100);
        await execFn(`su -c '${BUSYBOX} echo "${gov}" > "${GOV_CONFIG}"'`, 3000);
        
        for (const p of policies) {
            if (p.id.startsWith('policy')) {
                const govPath = `/sys/devices/system/cpu/cpufreq/${p.id}/scaling_governor`;
                await execFn(`su -c 'chmod 777 "${govPath}" 2>/dev/null'`, 100);
                await execFn(`su -c '${BUSYBOX} echo "${gov}" > "${govPath}"'`, 3000);
            }
        }
        
        for (let i = 0; i < coreCount; i++) {
            const govPath = `/sys/devices/system/cpu/cpu${i}/cpufreq/scaling_governor`;
            await execFn(`su -c 'chmod 777 "${govPath}" 2>/dev/null'`, 100);
            await execFn(`su -c '${BUSYBOX} echo "${gov}" > "${govPath}"'`, 3000);
        }
        
        await new Promise(r => setTimeout(r, 500));
        const verify = await fastRead('/sys/devices/system/cpu/cpu0/cpufreq/scaling_governor');
        if (verify?.trim().toLowerCase() !== gov) throw new Error('Verify failed');
        
        currentGovernor = gov;
        const govNameEl = document.getElementById('panel-gov-name');
        if (govNameEl) govNameEl.textContent = currentGovernor;
        const govNameModalEl = document.getElementById('tunables-modal-gov-name');
        if (govNameModalEl) govNameModalEl.textContent = `Current: ${currentGovernor}`;
        modifiedTunables = {};
        
        if (window.showStatus) window.showStatus(`Governor → ${currentGovernor}`, 'var(--accent-green)');
        titleEl.textContent = '✅ Applied';
        statusEl.textContent = `${currentGovernor} active`; statusEl.style.color = 'var(--accent-green)';
        
        setTimeout(() => modal.remove(), 100);
    } catch (e) {
        console.error('Governor apply failed:', e);
        titleEl.textContent = '❌ Failed';
        statusEl.textContent = e.message || 'Check permissions'; statusEl.style.color = 'var(--accent-red)';
        setTimeout(() => modal.remove(), 100);
    }
}

function showGovernorSelector() {
    const existing = document.getElementById('cpu-gov-modal');
    if (existing) existing.remove();
    
    const modal = document.createElement('div');
    modal.id = 'cpu-gov-modal';
    modal.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,0.9);z-index:10001;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(8px);`;
    
    const box = document.createElement('div');
    box.style.cssText = `background:linear-gradient(135deg,var(--bg-secondary),var(--bg-card));border:2px solid var(--border-color);border-radius:16px;padding:24px;width:90%;max-width:400px;box-shadow:0 20px 60px rgba(0,0,0,0.5);`;
    box.innerHTML = `<h3 style="margin:0 0 16px;font-size:18px;font-weight:700;text-align:center;color:var(--text-primary);"> Select Active Governor</h3><div style="color:var(--text-secondary);font-size:13px;margin-bottom:20px;text-align:center;">Current: <span style="color:var(--accent-green);font-weight:700;">${currentGovernor}</span></div><div id="gov-grid" style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-bottom:20px;"></div><button id="gov-close" style="width:100%;padding:12px;background:var(--border-color);color:var(--text-primary);border:none;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer;">Cancel</button>`;
    
    const grid = box.querySelector('#gov-grid');
    availableGovernors.forEach(gov => {
        const btn = document.createElement('button');
        const isCurrent = gov === currentGovernor;
        btn.textContent = gov.charAt(0).toUpperCase() + gov.slice(1);
        btn.style.cssText = `padding:14px;background:${isCurrent?'var(--accent-green)':'var(--bg-primary)'};color:${isCurrent?'var(--text-primary)':'var(--text-primary)'};border:${isCurrent?'2px solid var(--accent-green)':'1px solid var(--border-color)'};border-radius:10px;font-size:13px;font-weight:${isCurrent?'700':'600'};cursor:pointer;`;
        btn.onclick = () => applyGovernor(gov);
        grid.appendChild(btn);
    });
    
    box.querySelector('#gov-close').onclick = () => modal.remove();
    modal.onclick = e => { if (e.target === modal) modal.remove(); };
    modal.appendChild(box);
    document.body.appendChild(modal);
}

// ✅ TUNABLES LOGIC
async function loadGovernorTunables() {
    const gov = currentGovernor;
    if (!gov) return [];
    let basePath = `/sys/devices/system/cpu/cpufreq/${gov}`;
    let files = await execFn(`${BUSYBOX} ls -1 "${basePath}" 2>/dev/null`, 100);
    
    if (!files || files.includes('No such') || files.includes('ERROR') || files.includes('TIMEOUT')) {
        basePath = `/sys/devices/system/cpu/cpu0/cpufreq/${gov}`;
        files = await execFn(`${BUSYBOX} ls -1 "${basePath}" 2>/dev/null`, 100);
    }
    if (!files || files.includes('No such') || files.includes('ERROR') || files.includes('TIMEOUT')) { return []; }
    
    const tunables = [];
    const fileList = files.trim().split('\n').filter(f => f && !f.includes(' '));
    const limitedFiles = fileList.slice(0, 20);
    
    for (const f of limitedFiles) {
        const path = `${basePath}/${f}`;
        const val = await safeRead(path);
        tunables.push({ name: f, path: path, value: val || '0', isNumeric: /^[\d]+$/.test(val?.trim()) });
    }
    return tunables;
}

async function loadAndRenderTunables() {
    const listEl = document.getElementById('tunables-modal-list');
    const govNameEl = document.getElementById('tunables-modal-gov-name');
    if (!listEl) return;
    if (govNameEl) govNameEl.textContent = `Current: ${currentGovernor}`;
    
    listEl.innerHTML = '<div style="text-align:center;color:var(--text-secondary);font-size:12px;padding:20px;">Loading...</div>';
    const tunables = await loadGovernorTunables();
    listEl.innerHTML = '';
    
    if (tunables.length === 0) {
        listEl.innerHTML = '<div style="text-align:center;color:var(--text-secondary);font-size:12px;padding:20px;">No tunables found for this governor.</div>';
        return;
    }
    for (const t of tunables) { listEl.appendChild(createTunableRow(t)); }
}

function createTunableRow(tunable) {
    const row = document.createElement('div');
    row.style.cssText = 'background:var(--bg-card);border-radius:8px;padding:12px;';
    const safeId = tunable.name.replace(/[^a-zA-Z0-9_]/g, '_');
    const isSingleNumeric = /^[\d]+$/.test(tunable.value.trim());
    
    row.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;"><div style="color:var(--text-primary);font-size:13px;font-weight:600;font-family:monospace;">${tunable.name}</div><div style="color:var(--accent-purple);font-size:12px;font-weight:700;font-family:monospace;" id="val-${safeId}">${tunable.value}</div></div>`;
    
    if (isSingleNumeric) {
        const numVal = parseInt(tunable.value);
        const minVal = 0;
        const maxVal = Math.max(100, numVal * 3);
        const stepVal = Math.max(1, Math.floor((maxVal - minVal) / 100));
        
        const sliderWrapper = document.createElement('div');
        sliderWrapper.style.cssText = 'margin-top:8px;';
        const slider = document.createElement('input');
        slider.type = 'range';
        slider.min = minVal; slider.max = maxVal; slider.step = stepVal;
        slider.value = numVal;
        slider.style.cssText = 'width:100%;height:6px;background:linear-gradient(to right,var(--border-color) 50%,var(--accent-purple) 50%);border-radius:3px;outline:none;-webkit-appearance:none;';
        slider.addEventListener('input', () => {
            const v = parseInt(slider.value);
            row.querySelector(`#val-${safeId}`).textContent = v;
            updateSliderFill(slider, minVal, maxVal, v, 'var(--accent-purple)');
            debouncedApplyTunable(tunable.path, v.toString());
        });
        updateSliderFill(slider, minVal, maxVal, numVal, 'var(--accent-purple)');
        sliderWrapper.appendChild(slider);
        row.appendChild(sliderWrapper);
    } else {
        const inputWrapper = document.createElement('div');
        inputWrapper.style.cssText = 'margin-top:8px;display:flex;gap:8px;';
        const input = document.createElement('input');
        input.type = 'text';
        input.value = tunable.value;
        input.style.cssText = 'flex:1;padding:8px;background:var(--bg-primary);color:var(--text-primary);border:1px solid var(--border-color);border-radius:6px;font-size:12px;font-family:monospace;outline:none;';
        const applyBtn = document.createElement('button');
        applyBtn.textContent = 'Apply';
        applyBtn.style.cssText = 'padding:8px 12px;background:var(--accent-purple);color:var(--text-primary);border:none;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;';
        applyBtn.addEventListener('click', () => { debouncedApplyTunable(tunable.path, input.value.trim()); });
        inputWrapper.appendChild(input);
        inputWrapper.appendChild(applyBtn);
        row.appendChild(inputWrapper);
    }
    
    const status = document.createElement('div');
    status.id = `status-${safeId}`;
    status.style.cssText = 'text-align:right;color:var(--text-secondary);font-size:10px;margin-top:6px;min-height:14px;';
    row.appendChild(status);
    return row;
}

function debouncedApplyTunable(path, value) {
    if (tunableTimers[path]) clearTimeout(tunableTimers[path]);
    tunableTimers[path] = setTimeout(() => applyTunable(path, value), 500);
}

async function applyTunable(path, value) {
    const fileName = path.split('/').pop();
    const safeId = fileName.replace(/[^a-zA-Z0-9_]/g, '_');
    const statusEl = document.getElementById(`status-${safeId}`);
    
    if (statusEl) { statusEl.textContent = 'Applying...'; statusEl.style.color = 'var(--accent-orange)'; }
    try {
        await unlockFilePermissions(path);
        const success = await writeWithBusybox(path, value);
        
        if (statusEl) {
            if (success) {
                modifiedTunables[path] = value;
                statusEl.textContent = '✅ Applied';
                statusEl.style.color = 'var(--accent-green)';
            } else {
                statusEl.textContent = '❌ Failed';
                statusEl.style.color = 'var(--accent-red)';
            }
        }
    } catch (e) {
        console.error('Apply tunable error:', e);
        if (statusEl) { statusEl.textContent = '⚠️ Error'; statusEl.style.color = 'var(--accent-red)'; }
    }
}

window.addEventListener('beforeunload', () => { stopFreqUpdates(); if (modalElement) modalElement.remove(); if (tunablesModalElement) tunablesModalElement.remove(); });

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();

window.applyCPUGovernor = applyGovernor;
})();
