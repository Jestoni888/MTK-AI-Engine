// dex2oat.js - Clean, Professional ART Compiler (Shell-Driven Engine + Per-App Support)
(function() {
'use strict';
const CONFIG_FILE = '/sdcard/MTK_AI_Engine/dex2oat.conf';
const SCRIPT_PATH = '/data/adb/modules/MTK_AI/MTK_AI/AI_MODE/auto_frequency/webui_workload.sh';

const FILTERS = [
    { id: 'speed-profile', name: '⚖️ Balanced (Speed-Profile)', desc: 'Profile-guided AOT. Best balance for daily usage.' },
    { id: 'speed', name: '🔥 Performance (Speed AOT)', desc: 'Full AOT compilation for maximum app responsiveness.' },
    { id: 'quicken', name: '⚡ Fast Optimization (Quicken)', desc: 'Quick verification and optimization without heavy storage overhead.' },
    { id: 'everything', name: '🚀 Extreme (Everything)', desc: 'Aggressive full compilation. Maximum performance, higher storage usage.' },
    { id: 'verify', name: '🛡️ Verify Only (Verify)', desc: 'Only verify dex files without compilation. Saves maximum space.' },
    { id: 'space', name: '💾 Space Optimized (Space)', desc: 'Optimized for minimal disk space usage.' },
    { id: 'space-profile', name: '📉 Space Profile-Guided', desc: 'Profile-guided compilation optimized for space savings.' }
];

let currentFilter = 'speed-profile';
let forceCleanEnabled = false;
let detectedApps = [];

// Robust shell execution wrapper
const execFn = window.exec || async function(cmd, timeout = 30000) {
    return new Promise(resolve => {
        const cb = 'dex_exec_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);
        const t = setTimeout(function() { delete window[cb]; resolve(''); }, timeout);
        window[cb] = function(_, res) { clearTimeout(t); delete window[cb]; resolve(res || ''); };
        if (window.ksu && typeof ksu.exec === 'function') { try { ksu.exec(cmd, 'window.' + cb); } catch(e) { clearTimeout(t); delete window[cb]; resolve(''); } }
        else { clearTimeout(t); resolve(''); }
    });
};

function log(msg) {
    console.log('[DEX2OAT] ' + msg);
}

// === Package helpers ===
function normalizePkgList(raw) {
    let arr = [];
    if (Array.isArray(raw)) arr = raw;
    else if (raw && typeof raw === 'object' && Array.isArray(raw.packages)) arr = raw.packages;
    else if (typeof raw === 'string') {
        const s = raw.trim();
        if (s.startsWith('[')) { try { arr = JSON.parse(s); } catch (_) { arr = s.split('\n'); } }
        else arr = s.split('\n');
    }
    return arr.map(p => (typeof p === 'string' ? p : (p && (p.packageName || p.package)) || ''))
              .map(s => s.replace(/^package:/, '').trim()).filter(Boolean);
}

async function getAllPackages() {
    let pkgs = [];
    try {
        if (typeof ksu !== 'undefined' && typeof ksu.listPackages === 'function') {
            let raw = await Promise.resolve(ksu.listPackages('all'));
            pkgs = normalizePkgList(raw);
        }
    } catch (e) {}
    if (!pkgs.length) {
        try {
            const raw = await execFn('pm list packages 2>/dev/null', 5000);
            pkgs = normalizePkgList(raw);
        } catch (e) {}
    }
    return pkgs;
}

async function enrichApps(pkgs) {
    const labels = {}, system = new Set();
    let sawSystemFlag = false;
    try {
        if (typeof ksu !== 'undefined' && typeof ksu.getPackagesInfo === 'function') {
            let raw = await Promise.resolve(ksu.getPackagesInfo(JSON.stringify(pkgs)));
            if (typeof raw === 'string') { try { raw = JSON.parse(raw); } catch (_) { raw = []; } }
            if (Array.isArray(raw)) {
                raw.forEach((info, i) => {
                    if (!info) return;
                    const pkg = info.packageName || info.package || pkgs[i];
                    if (pkg && (info.appLabel || info.label)) labels[pkg] = info.appLabel || info.label;
                    let sys = null;
                    if (typeof info.isSystem === 'boolean') sys = info.isSystem;
                    else if (info.applicationInfo?.flags != null) sys = (info.applicationInfo.flags & 0x00000001) !== 0 || (info.applicationInfo.flags & 0x00000080) !== 0;
                    else if (info.flags != null) sys = (info.flags & 0x00000001) !== 0 || (info.flags & 0x00000080) !== 0;
                    if (sys !== null) { sawSystemFlag = true; if (sys && pkg) system.add(pkg); }
                });
            }
        }
    } catch (e) {}
    if (!sawSystemFlag) {
        try {
            const raw = await execFn('pm list packages -s 2>/dev/null', 5000);
            if (raw) normalizePkgList(raw).forEach(p => system.add(p));
        } catch (_) {}
    }
    return { labels, system };
}

function formatPackageName(pkg) {
    let name = pkg.replace(/^(com|io|org|net|app|me|jp|kr|cn|in|br|ru|de|fr|es|it)\./, '');
    const parts = name.split('.');
    if (parts.length >= 2) name = parts.slice(-2).join(' ');
    return name.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) || pkg;
}

function getLocalAppName(pkg) {
    const localMappings = {
        'com.mobile.legends': 'Mobile Legends: Bang Bang',
        'com.pubg.imobile': 'PUBG MOBILE',
        'com.activision.callofduty.shooter': 'Call of Duty®: Mobile',
        'com.miHoYo.GenshinImpact': 'Genshin Impact',
        'com.roblox.client': 'Roblox',
        'com.supercell.clashofclans': 'Clash of Clans',
        'com.discord': 'Discord',
        'com.spotify.music': 'Spotify',
        'com.google.android.youtube': 'YouTube',
        'com.android.chrome': 'Chrome',
        'com.zhiliaoapp.musically': 'TikTok',
        'org.telegram.messenger': 'Telegram',
        'com.miHoYo.hkrpg': 'Honkai: Star Rail'
    };
    return localMappings[pkg] || null;
}

// 📂 Write config & package list directly to SD card, then delegate to shell script
async function executeShellTask(mode, targetPkg = null) {
    const cleanFlag = forceCleanEnabled ? "1" : "0";
    let appsText = "";

    if (mode === 'per_app' && targetPkg) {
        appsText = targetPkg;
        log(`🎯 Targeting single app compilation: ${targetPkg}`);
    } else {
        let appsCmd = "pm list packages -3"; // User apps
        if (mode === 'bulk_system') appsCmd = "pm list packages -s"; // System apps
        if (mode === 'bulk') appsCmd = "pm list packages"; // Both

        log(`📦 Fetching package list for mode: ${mode}...`);
        const raw = await execFn(`${appsCmd} 2>/dev/null`, 15000);
        if (!raw || !raw.trim()) {
            log('❌ Failed to retrieve package list.');
            return false;
        }

        const pkgs = raw.trim().split('\n')
            .map(l => l.replace('package:', '').trim())
            .filter(p => p.length > 0);

        if (pkgs.length === 0) {
            log('⚠️ No packages found.');
            return false;
        }
        appsText = pkgs.join('\n');
    }

    const writeCmd = `su -c "mkdir -p /sdcard/MTK_AI_Engine && echo '${currentFilter}' > /sdcard/MTK_AI_Engine/dex2oat_filter.conf && echo '${appsText.replace(/'/g, "'\\''")}' > /sdcard/MTK_AI_Engine/compile_apps.txt"`;
    await execFn(writeCmd, 5000);
    log(`💾 Config & package list written to SD card.`);

    const cmd = `su -c "nohup sh ${SCRIPT_PATH} file_bulk ${currentFilter} ${cleanFlag} >/sdcard/MTK_AI_Engine/debug.log 2>&1 &"`;
    log(`🚀 Delegating compilation task to independent background daemon...`);
    await execFn(cmd, 5000);
    return true;
}

// Stop Compilation
async function stopCompilation() {
    log('🛑 Requesting compilation stop...');
    await execFn(`sh ${SCRIPT_PATH} stop_compile`, 5000);
    if (window.showStatus) window.showStatus('🛑 Compilation stopped', 'var(--accent-red)');
}

function bindClickHandler() {
    const btn = document.getElementById('dex2oat-btn');
    if (btn) btn.addEventListener('click', showDexModal);
}

function showDexModal() {
    const existing = document.getElementById('dex-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'dex-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:10000;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(6px);padding:20px;';
    
    const box = document.createElement('div');
    box.style.cssText = 'background:var(--bg-card);border:1px solid var(--border-color);border-radius:20px;padding:24px;width:100%;max-width:480px;box-shadow:0 10px 30px rgba(0,0,0,0.5);font-family:sans-serif;color:var(--text-primary);';

    let html = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
            <h3 style="margin:0;font-size:18px;font-weight:700;color:var(--accent-blue);">⚡ ART Compiler Engine</h3>
            <button id="dex-close-x" style="background:none;border:none;color:var(--text-secondary);font-size:18px;cursor:pointer;">✕</button>
        </div>
        <p style="margin:0 0 20px;font-size:12px;color:var(--text-secondary);line-height:1.4;">Select a compilation profile and target. Tasks run independently in the background via shell daemon.</p>

        <div style="margin-bottom:16px;">
            <label style="display:block;font-size:12px;font-weight:600;color:var(--text-primary);margin-bottom:8px;">Compilation Profile / Filter</label>
            <select id="dex-filter-select" style="width:100%;padding:12px;background:var(--bg-secondary);color:var(--text-primary);border:1px solid var(--border-color);border-radius:10px;font-size:13px;outline:none;">
    `;

    FILTERS.forEach(f => {
        html += `<option value="${f.id}" ${f.id === currentFilter ? 'selected' : ''}>${f.name}</option>`;
    });

    html += `
            </select>
            <div id="filter-desc" style="font-size:11px;color:var(--text-primary);margin-top:6px;background:rgba(74,158,255,0.1);padding:8px;border-radius:6px;">${FILTERS.find(f => f.id === currentFilter).desc}</div>
        </div>

        <div style="margin-bottom:20px;">
            <label style="display:flex;align-items:center;gap:8px;font-size:12px;color:var(--text-primary);cursor:pointer;">
                <input type="checkbox" id="force-clean-cb" ${forceCleanEnabled ? 'checked' : ''} style="accent-color:var(--accent-blue);width:16px;height:16px;">
                <span>Force clean old ART artifacts before compilation</span>
            </label>
        </div>

        <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:16px;">
            <button id="btn-user" style="padding:12px;background:var(--accent-blue);color:#ffffff;border:none;border-radius:10px;font-weight:600;font-size:13px;cursor:pointer;">🚀 Compile User Apps</button>
            <button id="btn-system" style="padding:12px;background:var(--accent-purple);color:#ffffff;border:none;border-radius:10px;font-weight:600;font-size:13px;cursor:pointer;">📱 Compile System Apps</button>
            <button id="btn-all" style="padding:12px;background:var(--accent-green);color:#ffffff;border:none;border-radius:10px;font-weight:600;font-size:13px;cursor:pointer;">⚡ Compile All Apps (User + System)</button>
            <button id="btn-per-app" style="padding:12px;background:var(--accent-purple);color:#ffffff;border:none;border-radius:10px;font-weight:600;font-size:13px;cursor:pointer;">🎯 Compile Specific App (Per-App)</button>
            <button id="btn-stop" style="padding:10px;background:var(--accent-red);color:#ffffff;border:none;border-radius:10px;font-weight:600;font-size:12px;cursor:pointer;">🛑 Stop Active Compilation</button>
        </div>

        <div id="dex-status" style="text-align:center;font-size:12px;color:var(--text-secondary);min-height:24px;"></div>
    `;

    box.innerHTML = html;
    modal.appendChild(box);
    document.body.appendChild(modal);

    modal.querySelector('#dex-close-x').onclick = () => modal.remove();
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };

    const filterSelect = modal.querySelector('#dex-filter-select');
    const filterDesc = modal.querySelector('#filter-desc');
    filterSelect.onchange = () => {
        currentFilter = filterSelect.value;
        const match = FILTERS.find(f => f.id === currentFilter);
        if (match) filterDesc.textContent = match.desc;
    };

    modal.querySelector('#force-clean-cb').onchange = (e) => {
        forceCleanEnabled = e.target.checked;
    };

    const statusEl = modal.querySelector('#dex-status');

    modal.querySelector('#btn-user').onclick = async () => {
        statusEl.innerHTML = '<span style="color:var(--text-primary);">Preparing user apps list...</span>';
        await executeShellTask('bulk_user');
        statusEl.innerHTML = '<span style="color:var(--accent-green);font-weight:600;">✅ User compilation running in background! Safe to close.</span>';
    };

    modal.querySelector('#btn-system').onclick = async () => {
        statusEl.innerHTML = '<span style="color:var(--text-primary);">Preparing system apps list...</span>';
        await executeShellTask('bulk_system');
        statusEl.innerHTML = '<span style="color:var(--accent-green);font-weight:600;">✅ System compilation running in background! Safe to close.</span>';
    };

    modal.querySelector('#btn-all').onclick = async () => {
        statusEl.innerHTML = '<span style="color:var(--text-primary);">Preparing all apps list...</span>';
        await executeShellTask('bulk');
        statusEl.innerHTML = '<span style="color:var(--accent-green);font-weight:600;">✅ All apps compilation running in background! Safe to close.</span>';
    };

    modal.querySelector('#btn-per-app').onclick = async () => {
        statusEl.innerHTML = '<span style="color:var(--text-primary);">Loading installed apps for per-app compilation...</span>';
        const pkgs = await getAllPackages();
        if (!pkgs.length) {
            statusEl.innerHTML = '<span style="color:var(--accent-red);">❌ No packages found.</span>';
            return;
        }
        const { labels, system } = await enrichApps(pkgs);
        
        let perAppHtml = `
            <div style="margin-top:12px;border-top:1px solid var(--border-color);padding-top:12px;">
                <div style="font-size:12px;font-weight:600;color:var(--text-primary);margin-bottom:8px;">Select App to Compile:</div>
                <input type="text" id="per-app-search" placeholder="Search app..." style="width:100%;padding:8px;background:var(--bg-secondary);color:var(--text-primary);border:1px solid var(--border-color);border-radius:8px;font-size:12px;margin-bottom:8px;outline:none;">
                <div id="per-app-list" style="max-height:160px;overflow-y:auto;display:flex;flex-direction:column;gap:6px;">
        `;

        pkgs.forEach(pkg => {
            const label = labels[pkg] || getLocalAppName(pkg) || formatPackageName(pkg);
            perAppHtml += `
                <div class="per-app-row" data-pkg="${pkg}" data-name="${label.toLowerCase()}" style="display:flex;justify-content:space-between;align-items:center;padding:8px;background:var(--bg-secondary);border-radius:6px;cursor:pointer;border:1px solid var(--border-color);">
                    <div>
                        <div style="font-size:12px;font-weight:600;color:var(--text-primary);">${label}</div>
                        <div style="font-size:10px;color:var(--text-secondary);font-family:monospace;">${pkg}</div>
                    </div>
                    <button style="padding:4px 10px;background:var(--accent-blue);color:#ffffff;border:none;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer;">Compile</button>
                </div>
            `;
        });

        perAppHtml += `</div></div>`;
        
        let existingContainer = modal.querySelector('#per-app-container');
        if (existingContainer) existingContainer.remove();
        
        const container = document.createElement('div');
        container.id = 'per-app-container';
        container.innerHTML = perAppHtml;
        box.appendChild(container);

        statusEl.innerHTML = '<span style="color:var(--text-primary);">Select an app below to compile.</span>';

        const searchInput = container.querySelector('#per-app-search');
        searchInput.oninput = (e) => {
            const val = e.target.value.toLowerCase();
            container.querySelectorAll('.per-app-row').forEach(row => {
                const name = row.dataset.name;
                const pkg = row.dataset.pkg.toLowerCase();
                row.style.display = (name.includes(val) || pkg.includes(val)) ? 'flex' : 'none';
            });
        };

        container.querySelectorAll('.per-app-row').forEach(row => {
            row.onclick = async () => {
                const targetPkg = row.dataset.pkg;
                statusEl.innerHTML = `<span style="color:var(--text-primary);">Compiling ${targetPkg}...</span>`;
                await executeShellTask('per_app', targetPkg);
                statusEl.innerHTML = `<span style="color:var(--accent-green);font-weight:600;">✅ Compilation started for ${targetPkg}!</span>`;
            };
        });
    };

    modal.querySelector('#btn-stop').onclick = async () => {
        statusEl.innerHTML = '<span style="color:var(--accent-red);">Stopping compilation...</span>';
        await stopCompilation();
        statusEl.innerHTML = '<span style="color:var(--accent-red);font-weight:600;">🛑 Compilation stopped.</span>';
    };
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindClickHandler);
} else {
    bindClickHandler();
}

window.showDexModal = showDexModal;
})();
