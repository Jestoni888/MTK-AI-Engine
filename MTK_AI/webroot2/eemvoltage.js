// eemvoltage.js - EEM Voltage Offset Manager (Pure Dynamic Discovery)
// Updated: Removed all hardcoded fallbacks. Relies entirely on 'find /proc/'
(function() {
'use strict';
const CONFIG_DIR_NORMAL = '/sdcard/MTK_AI_Engine/eem_offsets/normal';
const CONFIG_DIR_GAMING = '/sdcard/MTK_AI_Engine/eem_offsets/gaming';

let currentProfile = 'normal';
let currentOffsets = { normal: {}, gaming: {} };
let availablePaths = [];

// Safe exec wrapper
const execFn = typeof window.exec === 'function' ? window.exec : async function(cmd, timeout = 5000) {
    return new Promise(resolve => {
        const cb = `eem_exec_${Date.now()}_${Math.random().toString(36).substring(2)}`;
        const t = setTimeout(() => { delete window[cb]; resolve(''); }, timeout);
        window[cb] = (_, res) => { clearTimeout(t); delete window[cb]; resolve(res || ''); };
        if (window.ksu) ksu.exec(cmd, `window.${cb}`);
        else { clearTimeout(t); resolve(''); }
    });
};

// Pure dynamic discovery - NO FALLBACKS
async function discoverEemPaths() {
    const discovered = [];
    try {
        // Scans entire /proc/ for any file with 'eem' and 'offset' in the path
        const rawPaths = await execFn(`find /proc/ -type f -path "*eem*offset*" 2>/dev/null`);
        if (rawPaths) {
            const pathList = rawPaths.trim().split('\n');
            for (const rawPath of pathList) {
                const cleanPath = rawPath.trim();
                if (!cleanPath) continue;
                
                const pathParts = cleanPath.split('/');
                let domainName = 'Unknown';
                let prefix = 'EEM';
                
                const fileIndex = pathParts.length - 1;
                if (fileIndex > 0) {
                    domainName = pathParts[fileIndex - 1];
                }
                
                if (cleanPath.includes('eemg')) {
                    prefix = 'EEMG';
                }
                
                const safeId = domainName.toLowerCase().replace(/[^a-z0-9]/g, '_');
                const displayName = domainName.replace(/^(EEMG?_DET_)?/, '').replace(/_/g, ' ');
                
                discovered.push({
                    id: safeId,
                    name: `${prefix} ${displayName}`.trim(),
                    path: cleanPath
                });
            }
        }
    } catch (e) {
        console.warn('Find command failed:', e);
    }

    // Returns exactly what was found. If 0, it means the dynamic scan failed.
    return discovered;
}

async function init() {
    availablePaths = await discoverEemPaths();
    console.log(`[EEM] Dynamic scan found ${availablePaths.length} paths.`);
    await loadAllOffsets();
    bindClickHandler();
}

async function loadAllOffsets() {
    for (const path of availablePaths) {
        let liveVal = 0;
        try {
            const raw = await execFn(`cat "${path.path}" 2>/dev/null`);
            const val = parseInt(raw?.trim());
            if (!isNaN(val) && val >= -100 && val <= 100) {
                liveVal = val;
            }
        } catch (e) {
            console.warn(`Failed to read actual value for ${path.id}:`, e);
        }
        try {
            const saved = await execFn(`cat ${CONFIG_DIR_NORMAL}/${path.id}.txt 2>/dev/null`);
            const val = parseInt(saved?.trim());
            currentOffsets.normal[path.id] = (!isNaN(val) && val >= -50 && val <= 50) ? val : liveVal;
        } catch (e) {
            currentOffsets.normal[path.id] = liveVal;
        }
        try {
            const saved = await execFn(`cat ${CONFIG_DIR_GAMING}/${path.id}.txt 2>/dev/null`);
            const val = parseInt(saved?.trim());
            currentOffsets.gaming[path.id] = (!isNaN(val) && val >= -50 && val <= 50) ? val : liveVal;
        } catch (e) {
            currentOffsets.gaming[path.id] = liveVal;
        }
    }
    updateCardDisplay();
}

function updateCardDisplay() {
    const valEl = document.querySelector('#eem-voltage-item .setting-value');
    if (valEl && availablePaths.length > 0) {
        const calcAvg = (profile) => {
            const values = availablePaths.map(p => currentOffsets[profile][p.id]);
            return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
        };
        const avgN = calcAvg('normal');
        const avgG = calcAvg('gaming');
        const signN = avgN > 0 ? '+' : '';
        const signG = avgG > 0 ? '+' : '';
        valEl.innerHTML = `N: ${signN}${avgN} | G: ${signG}${avgG} <i class="fas fa-chevron-right"></i>`;
    } else if (valEl) {
        valEl.innerHTML = `N/A <i class="fas fa-chevron-right"></i>`;
    }
}

function bindClickHandler() {
    const item = document.getElementById('eem-voltage-item');
    if (!item) return;
    item.style.cursor = availablePaths.length > 0 ? 'pointer' : 'not-allowed';
    item.addEventListener('click', () => {
        if (availablePaths.length === 0) {
            showNoPathsMessage();
            return;
        }
        showEemModal();
    });
}

function showNoPathsMessage() {
    const existing = document.getElementById('eem-modal');
    if (existing) existing.remove();
    const modal = document.createElement('div');
    modal.id = 'eem-modal';
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
        text-align: center;
    `;
    box.innerHTML = `
        <h3 style="color: #FF453A; margin: 0 0 15px;">⚠️ Dynamic Scan Failed</h3>
        <p style="color: #8b92b4; font-size: 14px; line-height: 1.5;">
            The <code style="background:rgba(255,255,255,0.1);padding:2px 6px;border-radius:4px;">find /proc/</code> command returned 0 results.<br><br>
            This means either EEM is not supported on this kernel, or SELinux is blocking the scan.
        </p>
        <button id="eem-close-btn" style="
            margin-top: 15px; padding: 10px 30px;
            background: rgba(255,69,58,0.2); color: #FF453A;
            border: 1px solid #FF453A; border-radius: 10px;
            font-size: 13px; cursor: pointer;">OK</button>
    `;
    modal.appendChild(box);
    document.body.appendChild(modal);
    document.getElementById('eem-close-btn').onclick = () => modal.remove();
    modal.onclick = e => { if (e.target === modal) modal.remove(); };
}

function updateProfileUI(profile) {
    const normalBtn = document.getElementById('profile-normal-btn');
    const gamingBtn = document.getElementById('profile-gaming-btn');
    const applyBtn = document.getElementById('eem-apply-btn');
    const resetBtn = document.getElementById('eem-reset-btn');
    if (normalBtn && gamingBtn) {
        if (profile === 'normal') {
            normalBtn.style.background = '#FF9F0A';
            normalBtn.style.color = '#000';
            gamingBtn.style.background = 'transparent';
            gamingBtn.style.color = '#8b92b4';
        } else {
            gamingBtn.style.background = '#FF9F0A';
            gamingBtn.style.color = '#000';
            normalBtn.style.background = 'transparent';
            normalBtn.style.color = '#8b92b4';
        }
    }
    if (applyBtn) applyBtn.textContent = `💾 Apply ${profile === 'gaming' ? 'Gaming' : 'Normal'} Profile`;
    if (resetBtn) resetBtn.textContent = `🔄 Reset ${profile === 'gaming' ? 'Gaming' : 'Normal'} to 0 mV`;
    availablePaths.forEach(path => {
        const slider = document.getElementById(`eem-slider-${path.id}`);
        const valEl = document.getElementById(`eem-val-${path.id}`);
        if (slider) slider.value = currentOffsets[profile][path.id];
        if (valEl) valEl.textContent = formatOffset(currentOffsets[profile][path.id]);
    });
}

function showEemModal() {
    if (availablePaths.length === 0) {
        showNoPathsMessage();
        return;
    }
    const existing = document.getElementById('eem-modal');
    if (existing) existing.remove();
    const modal = document.createElement('div');
    modal.id = 'eem-modal';
    modal.style.cssText = `
        position: fixed; inset: 0; background: rgba(0,0,0,0.85); z-index: 10000;
        display: flex; align-items: center; justify-content: center;
        backdrop-filter: blur(5px);
    `;
    const box = document.createElement('div');
    box.style.cssText = `
        background: linear-gradient(135deg, #1a1f3a, #2d3561);
        border: 2px solid #FF9F0A;
        border-radius: 20px;
        padding: 24px; width: 95%; max-width: 500px;
        box-shadow: 0 0 40px rgba(255, 159, 10, 0.2);
        max-height: 85vh; overflow-y: auto;
    `;
    const header = document.createElement('div');
    header.style.cssText = 'text-align: center; margin-bottom: 15px;';
    header.innerHTML = `
        <h3 style="color: #FF9F0A; margin: 0; font-size: 20px;">⚡ EEM Voltage Offsets</h3>
        <p style="color: #8b92b4; font-size: 12px; margin: 5px 0 0;">
            ${availablePaths.length} dynamic domains detected via /proc/ scan
        </p>
    `;
    box.appendChild(header);
    const profileSelector = document.createElement('div');
    profileSelector.style.cssText = 'display: flex; background: rgba(0,0,0,0.3); border-radius: 10px; padding: 4px; margin-bottom: 20px;';
    const normalBtn = document.createElement('button');
    normalBtn.id = 'profile-normal-btn';
    normalBtn.textContent = '🏠 Normal Mode';
    normalBtn.style.cssText = `flex: 1; padding: 10px; border: none; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.2s; background: ${currentProfile === 'normal' ? '#FF9F0A' : 'transparent'}; color: ${currentProfile === 'normal' ? '#000' : '#8b92b4'};`;
    normalBtn.onclick = () => {
        currentProfile = 'normal';
        updateProfileUI('normal');
    };
    const gamingBtn = document.createElement('button');
    gamingBtn.id = 'profile-gaming-btn';
    gamingBtn.textContent = '🎮 Gaming Mode';
    gamingBtn.style.cssText = `flex: 1; padding: 10px; border: none; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.2s; background: ${currentProfile === 'gaming' ? '#FF9F0A' : 'transparent'}; color: ${currentProfile === 'gaming' ? '#000' : '#8b92b4'};`;
    gamingBtn.onclick = () => {
        currentProfile = 'gaming';
        updateProfileUI('gaming');
    };
    profileSelector.append(normalBtn, gamingBtn);
    box.appendChild(profileSelector);
    
    availablePaths.forEach(path => {
        const sliderSection = document.createElement('div');
        sliderSection.style.cssText = 'margin-bottom: 20px; padding-bottom: 15px; border-bottom: 1px solid rgba(255,255,255,0.1);';
        const labelRow = document.createElement('div');
        labelRow.style.cssText = 'display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;';
        labelRow.innerHTML = `
            <span style="color: #fff; font-size: 13px; font-weight: 600;">${path.name}</span>
            <span id="eem-val-${path.id}" style="color: #FF9F0A; font-size: 16px; font-weight: 700;">${formatOffset(currentOffsets[currentProfile][path.id])}</span>
        `;
        const slider = document.createElement('input');
        slider.type = 'range';
        slider.min = -20;
        slider.max = 10;
        slider.step = 1;
        slider.value = currentOffsets[currentProfile][path.id];
        slider.id = `eem-slider-${path.id}`;
        slider.style.cssText = `
            width: 100%; height: 6px; background: rgba(255,255,255,0.2);
            border-radius: 3px; outline: none; -webkit-appearance: none;
        `;
        slider.oninput = (e) => {
            currentOffsets[currentProfile][path.id] = parseInt(e.target.value);
            const valEl = document.getElementById(`eem-val-${path.id}`);
            if (valEl) valEl.textContent = formatOffset(currentOffsets[currentProfile][path.id]);
        };
        sliderSection.append(labelRow, slider);
        box.appendChild(sliderSection);
    });
    
    const style = document.createElement('style');
    style.textContent = `
        input[type=range]::-webkit-slider-thumb {
            -webkit-appearance: none; width: 20px; height: 20px; 
            background: #FF9F0A; border-radius: 50%; cursor: pointer;
            border: 2px solid #fff;
        }
    `;
    document.head.appendChild(style);
    
    const infoBox = document.createElement('div');
    infoBox.style.cssText = `
        background: rgba(255,159,10,0.1); border: 1px solid rgba(255,159,10,0.3);
        border-radius: 10px; padding: 12px; margin: 15px 0; font-size: 11px; color: #FF9F0A;
    `;
    infoBox.innerHTML = `
        <strong>💡 Tip:</strong> Pure dynamic scan. No hardcoded paths.<br>
        Negative = undervolt (cooler), Positive = overvolt (stable)
    `;
    box.appendChild(infoBox);
    
    const statusEl = document.createElement('div');
    statusEl.id = 'eem-status';
    statusEl.style.cssText = 'text-align: center; font-size: 13px; color: #666; margin-bottom: 16px; min-height: 20px;';
    statusEl.textContent = 'Status: Ready';
    box.appendChild(statusEl);
    
    const applyBtn = document.createElement('button');
    applyBtn.id = 'eem-apply-btn';
    applyBtn.textContent = `💾 Apply ${currentProfile === 'gaming' ? 'Gaming' : 'Normal'} Profile`;
    applyBtn.style.cssText = `
        width: 100%; padding: 14px; margin-bottom: 10px;
        background: linear-gradient(135deg, #FF9F0A, #e68a00);
        color: #fff; border: none; border-radius: 12px;
        font-size: 14px; font-weight: 700; cursor: pointer;
        box-shadow: 0 4px 15px rgba(255, 159, 10, 0.4);
    `;
    applyBtn.onclick = async () => {
        await applyAllOffsets(statusEl, applyBtn);
    };
    box.appendChild(applyBtn);
    
    const resetBtn = document.createElement('button');
    resetBtn.id = 'eem-reset-btn';
    resetBtn.textContent = `🔄 Reset ${currentProfile === 'gaming' ? 'Gaming' : 'Normal'} to 0 mV`;
    resetBtn.style.cssText = `
        width: 100%; padding: 12px; margin-bottom: 10px;
        background: rgba(255,255,255,0.1); color: #fff;
        border: 1px solid rgba(255,255,255,0.2); border-radius: 10px;
        font-size: 13px; cursor: pointer;
    `;
    resetBtn.onclick = async () => {
        availablePaths.forEach(p => {
            currentOffsets[currentProfile][p.id] = 0;
            const slider = document.getElementById(`eem-slider-${p.id}`);
            const valEl = document.getElementById(`eem-val-${p.id}`);
            if (slider) slider.value = 0;
            if (valEl) valEl.textContent = '0 mV';
        });
        await applyAllOffsets(statusEl, applyBtn);
    };
    box.appendChild(resetBtn);
    
    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.style.cssText = `
        width: 100%; padding: 12px;
        background: rgba(255,255,255,0.1); color: #fff;
        border: none; border-radius: 10px; font-size: 13px; cursor: pointer;
    `;
    cancelBtn.onclick = () => modal.remove();
    box.appendChild(cancelBtn);
    
    modal.appendChild(box);
    document.body.appendChild(modal);
    modal.onclick = e => { if (e.target === modal) modal.remove(); };
}

function formatOffset(val) {
    const sign = val > 0 ? '+' : '';
    return `${sign}${val} mV`;
}

async function applyAllOffsets(statusEl, applyBtn) {
    if (applyBtn) {
        applyBtn.disabled = true;
        applyBtn.textContent = '⏳ Applying...';
    }
    if (statusEl) {
        statusEl.textContent = `Writing to EEM nodes (${currentProfile} profile)...`;
        statusEl.style.color = '#FF9F0A';
    }
    try {
        const configDir = currentProfile === 'normal' ? CONFIG_DIR_NORMAL : CONFIG_DIR_GAMING;
        await execFn(`mkdir -p ${configDir}`);
        let successCount = 0;
        for (const path of availablePaths) {
            const offset = currentOffsets[currentProfile][path.id];
            await execFn(`echo '${offset}' > ${configDir}/${path.id}.txt`);
            const result = await execFn(`su -c "echo '${offset}' > '${path.path}' 2>/dev/null" && echo "ok" || echo "fail"`);
            if (result?.trim() === 'ok') successCount++;
        }
        updateCardDisplay();
        if (statusEl) {
            if (successCount === availablePaths.length) {
                statusEl.textContent = `✅ ${currentProfile === 'gaming' ? 'Gaming' : 'Normal'} profile applied!`;
                statusEl.style.color = '#32D74B';
            } else {
                statusEl.textContent = `⚠️ ${successCount}/${availablePaths.length} applied (check root)`;
                statusEl.style.color = '#FF9F0A';
            }
        }
        if (window.showStatus) {
            const msg = successCount === availablePaths.length 
                ? `✅ EEM offsets applied (${currentProfile})` 
                : `⚠️ Partial apply: ${successCount}/${availablePaths.length}`;
            window.showStatus(msg, successCount === availablePaths.length ? '#32D74B' : '#FF9F0A');
        }
        if (successCount === availablePaths.length) {
            setTimeout(() => {
                document.getElementById('eem-modal')?.remove();
            }, 1200);
        }
    } catch (e) {
        console.error('EEM apply failed:', e);
        if (statusEl) {
            statusEl.textContent = '❌ Failed. Check root.';
            statusEl.style.color = '#FF453A';
        }
        if (applyBtn) {
            applyBtn.disabled = false;
            applyBtn.textContent = `💾 Apply ${currentProfile === 'gaming' ? 'Gaming' : 'Normal'} Profile`;
        }
        if (window.showStatus) {
            window.showStatus('❌ EEM apply failed', '#FF453A');
        }
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
})();
