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

// === Package helpers (borrowed from freeze architecture) ===
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

    // Write config and package list to SD card via root shell
    const writeCmd = `su -c "mkdir -p /sdcard/MTK_AI_Engine && echo '${currentFilter}' > /sdcard/MTK_AI_Engine/dex2oat_filter.conf && echo '${appsText.replace(/'/g, "'\\''")}' > /sdcard/MTK_AI_Engine/compile_apps.txt"`;
    await execFn(writeCmd, 5000);
    log(`💾 Config & package list written to SD card.`);

    // Trigger independent background shell execution via root daemon
    const cmd = `su -c "nohup sh ${SCRIPT_PATH} file_bulk ${currentFilter} ${cleanFlag} >/sdcard/MTK_AI_Engine/debug.log 2>&1 &"`;
    log(`🚀 Delegating compilation task to independent background daemon...`);
    await execFn(cmd, 5000);
    return true;
}

// Stop Compilation
async function stopCompilation() {
    log('🛑 Requesting compilation stop...');
    await execFn(`sh ${SCRIPT_PATH} stop_compile`, 5000);
    if (window.showStatus) window.showStatus('🛑 Compilation stopped', '#ef4444');
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
    box.style.cssText = 'background:linear-gradient(145deg,#121826,#1e293b);border:1px solid rgba(6,182,212,0.3);border-radius:20px;padding:24px;width:100%;max-width:480px;box-shadow:0 10px 30px rgba(0,0,0,0.5);font-family:sans-serif;color:#f8fafc;';

    let html = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
            <h3 style="margin:0;font-size:18px;font-weight:700;color:#38bdf8;">⚡ ART Compiler Engine</h3>
            <button id="dex-close-x" style="background:none;border:none;color:#94a3b8;font-size:18px;cursor:pointer;">✕</button>
        </div>
        <p style="margin:0 0 20px;font-size:12px;color:#94a3b8;line-height:1.4;">Select a compilation profile and target. Tasks run independently in the background via shell daemon.</p>

        <div style="margin-bottom:16px;">
            <label style="display:block;font-size:12px;font-weight:600;color:#cbd5e1;margin-bottom:8px;">Compilation Profile / Filter</label>
            <select id="dex-filter-select" style="width:100%;padding:12px;background:#0f172a;color:#fff;border:1px solid #334155;border-radius:10px;font-size:13px;outline:none;">
    `;

    FILTERS.forEach(f => {
        html += `<option value="${f.id}" ${f.id === currentFilter ? 'selected' : ''}>${f.name}</option>`;
    });

    html += `
            </select>
            <div id="filter-desc" style="font-size:11px;color:#38bdf8;margin-top:6px;background:rgba(56,189,248,0.1);padding:8px;border-radius:6px;">${FILTERS.find(f => f.id === currentFilter).desc}</div>
        </div>

        <div style="margin-bottom:20px;">
            <label style="display:flex;align-items:center;gap:8px;font-size:12px;color:#cbd5e1;cursor:pointer;">
                <input type="checkbox" id="force-clean-cb" ${forceCleanEnabled ? 'checked' : ''} style="accent-color:#38bdf8;width:16px;height:16px;">
                <span>Force clean old ART artifacts before compilation</span>
            </label>
        </div>

        <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:16px;">
            <button id="btn-user" style="padding:12px;background:#0284c7;color:#fff;border:none;border-radius:10px;font-weight:600;font-size:13px;cursor:pointer;">🚀 Compile User Apps</button>
            <button id="btn-system" style="padding:12px;background:#4f46e5;color:#fff;border:none;border-radius:10px;font-weight:600;font-size:13px;cursor:pointer;">📱 Compile System Apps</button>
            <button id="btn-all" style="padding:12px;background:#0d9488;color:#fff;border:none;border-radius:10px;font-weight:600;font-size:13px;cursor:pointer;">⚡ Compile All Apps (User + System)</button>
            <button id="btn-per-app" style="padding:12px;background:#7c3aed;color:#fff;border:none;border-radius:10px;font-weight:600;font-size:13px;cursor:pointer;">🎯 Compile Specific App (Per-App)</button>
            <button id="btn-stop" style="padding:10px;background:#dc2626;color:#fff;border:none;border-radius:10px;font-weight:600;font-size:12px;cursor:pointer;">🛑 Stop Active Compilation</button>
        </div>

        <div id="dex-status" style="text-align:center;font-size:12px;color:#94a3b8;min-height:24px;"></div>
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
        statusEl.innerHTML = '<span style="color:#38bdf8;">Preparing user apps list...</span>';
        await executeShellTask('bulk_user');
        statusEl.innerHTML = '<span style="color:#22c55e;font-weight:600;">✅ User compilation running in background! Safe to close.</span>';
    };

    modal.querySelector('#btn-system').onclick = async () => {
        statusEl.innerHTML = '<span style="color:#38bdf8;">Preparing system apps list...</span>';
        await executeShellTask('bulk_system');
        statusEl.innerHTML = '<span style="color:#22c55e;font-weight:600;">✅ System compilation running in background! Safe to close.</span>';
    };

    modal.querySelector('#btn-all').onclick = async () => {
        statusEl.innerHTML = '<span style="color:#38bdf8;">Preparing all apps list...</span>';
        await executeShellTask('bulk');
        statusEl.innerHTML = '<span style="color:#22c55e;font-weight:600;">✅ All apps compilation running in background! Safe to close.</span>';
    };

    modal.querySelector('#btn-per-app').onclick = () => {
        modal.remove();
        showPerAppModal();
    };

    modal.querySelector('#btn-stop').onclick = async () => {
        statusEl.innerHTML = '<span style="color:#ef4444;">Stopping compiler tasks...</span>';
        await stopCompilation();
        statusEl.innerHTML = '<span style="color:#ef4444;font-weight:600;">🛑 Compilation halted.</span>';
    };
}

// === Per-App Selector Modal with Real Icons & Names ===
async function showPerAppModal() {
    const existing = document.getElementById('dex-perapp-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'dex-perapp-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:10000;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(5px);padding:20px;';
    
    const box = document.createElement('div');
    box.style.cssText = 'background:linear-gradient(135deg,#1a1f3a,#2d3561);border:2px solid #7c3aed;border-radius:20px;padding:24px;width:100%;max-width:480px;box-shadow:0 0 40px rgba(124,58,237,0.3);color:#fff;font-family:sans-serif;';
    
    box.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
            <h3 style="color:#a78bfa;margin:0;font-size:18px;">🎯 Select App to Compile</h3>
            <button id="perapp-close" style="background:none;border:none;color:#94a3b8;font-size:18px;cursor:pointer;">✕</button>
        </div>
        <p style="color:#94a3b8;font-size:12px;margin-bottom:16px;">Choose a single application to compile with profile: <b style="color:#38bdf8;">${currentFilter}</b></p>
        
        <div style="margin-bottom:12px;">
            <input type="text" id="perapp-search" placeholder="🔍 Search installed apps..." style="width:100%;padding:10px 12px;background:rgba(0,0,0,0.3);border:1px solid #7c3aed;border-radius:8px;color:#fff;font-size:12px;outline:none;">
        </div>
        
        <div id="perapp-status" style="text-align:center;font-size:12px;color:#a78bfa;padding:20px;">⚡ Scanning installed packages...</div>
        
        <div id="perapp-list" style="display:none;flex-direction:column;gap:8px;max-height:340px;overflow-y:auto;padding-right:4px;"></div>
    `;

    modal.appendChild(box);
    document.body.appendChild(modal);

    modal.querySelector('#perapp-close').onclick = () => modal.remove();
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };

    const searchInput = document.getElementById('perapp-search');
    const listEl = document.getElementById('perapp-list');
    const statusEl = document.getElementById('perapp-status');

    searchInput.oninput = (e) => {
        const q = e.target.value.toLowerCase().trim();
        listEl.querySelectorAll('.app-item').forEach(item => {
            const name = item.dataset.name.toLowerCase();
            const pkg = item.dataset.pkg.toLowerCase();
            item.style.display = (name.includes(q) || pkg.includes(q)) ? 'flex' : 'none';
        });
    };

    try {
        const allPkgs = await getAllPackages();
        if (!allPkgs.length) {
            statusEl.textContent = '❌ No packages found.';
            return;
        }

        const { labels, system } = await enrichApps(allPkgs);
        detectedApps = allPkgs.map(pkg => ({
            pkg,
            label: labels[pkg] || getLocalAppName(pkg) || formatPackageName(pkg),
            isSystem: system.has(pkg)
        }));

        detectedApps.sort((a, b) => {
            if (a.isSystem !== b.isSystem) return a.isSystem ? 1 : -1;
            return a.label.localeCompare(b.label);
        });

        statusEl.style.display = 'none';
        listEl.style.display = 'flex';
        listEl.innerHTML = '';

        const colors = ['#06b6d4', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#ef4444', '#14b8a6'];

        detectedApps.forEach(app => {
            const colorIdx = app.pkg.charCodeAt(0) % colors.length;
            const color = colors[colorIdx];
            const firstLetter = app.label.charAt(0).toUpperCase();

            const item = document.createElement('div');
            item.className = 'app-item';
            item.dataset.pkg = app.pkg;
            item.dataset.name = app.label;
            item.style.cssText = 'background:rgba(0,0,0,0.3);border-radius:10px;padding:10px 12px;display:flex;align-items:center;gap:12px;cursor:pointer;transition:background 0.2s;';
            item.onmouseover = () => item.style.background = 'rgba(124,58,237,0.2)';
            item.onmouseout = () => item.style.background = 'rgba(0,0,0,0.3)';

            item.innerHTML = `
                <div style="position:relative;width:40px;height:40px;flex-shrink:0;">
                    <img src="ksu://icon/${app.pkg}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" style="width:40px;height:40px;border-radius:10px;object-fit:cover;background:#2c2c2e;">
                    <div style="display:none;width:40px;height:40px;border-radius:10px;background:linear-gradient(135deg,${color},${color}aa);align-items:center;justify-content:center;color:#fff;font-size:18px;font-weight:bold;">${firstLetter}</div>
                </div>
                <div style="flex:1;min-width:0;">
                    <div style="color:#fff;font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${app.label}</div>
                    <div style="color:#94a3b8;font-size:10px;font-family:monospace;margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${app.pkg}${app.isSystem ? ' (System)' : ''}</div>
                </div>
                <button style="background:#7c3aed;color:#fff;border:none;padding:6px 12px;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer;">Compile</button>
            `;

            item.onclick = async () => {
                modal.remove();
                if (window.showStatus) window.showStatus(`🎯 Compiling ${app.label}...`, '#7c3aed');
                await executeShellTask('per_app', app.pkg);
                if (window.showStatus) window.showStatus(`✅ ${app.label} compilation task started in background!`, '#22c55e');
            };

            listEl.appendChild(item);
        });

    } catch (err) {
        statusEl.textContent = `❌ Error loading apps: ${err.message}`;
    }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindClickHandler); else bindClickHandler();

window.DEX2OATManager = { showDexModal, executeShellTask, stopCompilation };
})();
