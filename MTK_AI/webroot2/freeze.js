// freeze.js - App Freeze Manager (ULTRA-OPTIMIZED BULK CHECK)
(function() {
'use strict';
const CONFIG_FILE = '/sdcard/MTK_AI_Engine/freeze.conf';
const FROZEN_DIR = '/dev/freeze/frozen';
const THAW_DIR = '/dev/freeze/thaw';
let frozenPackages = {};
let detectedApps = [];

const execFn = window.exec || async function(cmd, timeout = 5000) {
    return new Promise(resolve => {
        const cb = `freeze_exec_${Date.now()}_${Math.random().toString(36).substring(2)}`;
        const t = setTimeout(() => { delete window[cb]; resolve(''); }, timeout);
        window[cb] = (_, res) => { clearTimeout(t); delete window[cb]; resolve(res || ''); };
        if (window.ksu) ksu.exec(cmd, `window.${cb}`);
        else { clearTimeout(t); resolve(''); }
    });
};

// === FROM application.js: Normalize package list ===
function normalizePkgList(raw) {
    let arr = [];
    if (Array.isArray(raw)) arr = raw;
    else if (raw && typeof raw === 'object' && Array.isArray(raw.packages)) arr = raw.packages;
    else if (typeof raw === 'string') {
        const s = raw.trim();
        if (s.startsWith('[')) { 
            try { arr = JSON.parse(s); } 
            catch (_) { arr = s.split('\n'); } 
        }
        else arr = s.split('\n');
    }
    return arr.map(p => (typeof p === 'string' ? p : (p && (p.packageName || p.package)) || ''))
              .map(s => s.replace(/^package:/, '').trim()).filter(Boolean);
}

// === FROM application.js: Get all packages (system + user) ===
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

// === FROM application.js: Enrich apps with labels and system flag ===
async function enrichApps(pkgs) {
    const labels = {}, system = new Set();
    let sawSystemFlag = false;
    try {
        if (typeof ksu !== 'undefined' && typeof ksu.getPackagesInfo === 'function') {
            let raw = await Promise.resolve(ksu.getPackagesInfo(JSON.stringify(pkgs)));
            if (typeof raw === 'string') { 
                try { raw = JSON.parse(raw); } 
                catch (_) { raw = []; } 
            }
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
    } catch (e) { console.warn('enrich ksu.getPackagesInfo failed:', e); }
    
    if (!sawSystemFlag) {
        try {
            const raw = await execFn('pm list packages -s 2>/dev/null', 5000);
            if (raw) normalizePkgList(raw).forEach(p => system.add(p));
        } catch (_) {}
    }
    return { labels, system };
}

// === FROM application.js: Format package name ===
function formatPackageName(pkg) {
    let name = pkg.replace(/^(com|io|org|net|app|me|jp|kr|cn|in|br|ru|de|fr|es|it)\./, '');
    const parts = name.split('.');
    if (parts.length >= 2) name = parts.slice(-2).join(' ');
    return name.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) || pkg;
}

// === FROM application.js: Local app name mappings ===
function getLocalAppName(pkg) {
    const localMappings = {
        'com.mobile.legends': 'Mobile Legends: Bang Bang',
        'com.pubg.imobile': 'PUBG MOBILE',
        'com.pubg.krmobile': 'PUBG MOBILE: NEW STATE',
        'com.garena.game.freefire': 'Garena Free Fire MAX',
        'com.activision.callofduty.shooter': 'Call of Duty®: Mobile',
        'com.miHoYo.GenshinImpact': 'Genshin Impact',
        'com.miHoYo.Yuanshen': '原神',
        'com.tencent.ig': 'PUBG MOBILE: RESISTANCE',
        'com.roblox.client': 'Roblox',
        'com.supercell.clashofclans': 'Clash of Clans',
        'com.supercell.brawlstars': 'Brawl Stars',
        'com.discord': 'Discord',
        'com.spotify.music': 'Spotify',
        'com.netflix.mediaclient': 'Netflix',
        'com.whatsapp': 'WhatsApp',
        'com.instagram.android': 'Instagram',
        'com.facebook.katana': 'Facebook',
        'com.google.android.youtube': 'YouTube',
        'com.android.chrome': 'Chrome',
        'com.zhiliaoapp.musically': 'TikTok',
        'com.ss.android.ugc.trill': 'TikTok Lite',
        'org.telegram.messenger': 'Telegram',
        'com.twitter.android': 'X',
        'com.snapchat.android': 'Snapchat',
        'com.tencent.tmgp.sgame': 'Honor of Kings',
        'com.tencent.tmgp.pubgmhd': 'PUBG MOBILE HD',
        'com.tencent.lolm': 'League of Legends: Wild Rift',
        'com.epicgames.fortnite': 'Fortnite',
        'com.miHoYo.hkrpg': 'Honkai: Star Rail',
        'com.netease.idv.googleplay': 'Identity V'
    };
    return localMappings[pkg] || null;
}

async function init() {
    await loadConfig();
    bindClickHandler();
}

async function loadConfig() {
    try {
        const raw = await execFn(`cat ${CONFIG_FILE} 2>/dev/null`);
        frozenPackages = {};
        if (raw && raw.trim()) {
            raw.trim().split('\n').forEach(line => {
                const [pkg, state] = line.split('=');
                if (pkg && state) frozenPackages[pkg.trim()] = state.trim();
            });
        }
    } catch (e) { console.warn('Freeze: Config load failed:', e); }
}

function bindClickHandler() {
    const btn = document.getElementById('freeze-apps-btn');
    if (!btn) { console.warn('Freeze: #freeze-apps-btn not found'); return; }
    btn.addEventListener('click', async () => {
        await loadConfig();
        showFreezeModal();
    });
}

function showFreezeModal() {
    const existing = document.getElementById('freeze-modal');
    if (existing) existing.remove();
    const modal = document.createElement('div');
    modal.id = 'freeze-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:10000;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(5px);';
    const box = document.createElement('div');
    box.style.cssText = 'background:linear-gradient(135deg,#1a1f3a,#2d3561);border:2px solid #06b6d4;border-radius:20px;padding:24px;width:95%;max-width:500px;box-shadow:0 0 40px rgba(6,182,212,0.2);';
    box.innerHTML = `
        <h3 style="color:#06b6d4;margin:0 0 5px;font-size:20px;text-align:center;">❄️ App Freeze Manager</h3>
        <p style="color:#8b92b4;font-size:12px;text-align:center;margin-bottom:20px;">Freeze/unfreeze all apps (User + System)</p>
        <div style="display:flex;gap:8px;margin-bottom:15px;">
            <input type="text" id="freeze-search" placeholder="🔍 Search apps..." style="flex:1;padding:10px 12px;background:rgba(0,0,0,0.3);border:1px solid #06b6d4;border-radius:8px;color:#fff;font-size:12px;">
            <button id="freeze-refresh-btn" style="padding:10px 16px;background:rgba(6,182,212,0.3);color:#fff;border:1px solid #06b6d4;border-radius:8px;font-size:12px;cursor:pointer;">🔄</button>
        </div>
        <div id="freeze-scan-status" style="text-align:center;font-size:12px;color:#666;margin-bottom:15px;min-height:40px;padding:8px;background:rgba(0,0,0,0.2);border-radius:8px;">
            <span style="color:#06b6d4;"> Loading...</span>
        </div>
        <div id="freeze-list" style="display:none;flex-direction:column;gap:8px;margin-bottom:15px;max-height:350px;overflow-y:auto;padding-right:4px;"></div>
        <div style="background:rgba(6,182,212,0.1);color:#7dd3fc;padding:10px;border-radius:8px;font-size:11px;text-align:center;margin-bottom:15px;">
            <i class="fas fa-info-circle"></i> Path: <code style="background:rgba(0,0,0,0.3);padding:2px 6px;border-radius:4px;">${FROZEN_DIR}</code>
        </div>
        <div style="display:flex;gap:10px;">
            <button id="freeze-thaw-all" style="flex:1;padding:12px;background:rgba(255,255,255,0.1);color:#fff;border:1px solid #06b6d4;border-radius:10px;font-size:13px;cursor:pointer;">Thaw All</button>
            <button id="freeze-cancel-btn" style="flex:1;padding:12px;background:rgba(255,255,255,0.1);color:#fff;border:none;border-radius:10px;font-size:13px;cursor:pointer;">Close</button>
        </div>
    `;
    modal.appendChild(box);
    document.body.appendChild(modal);
    modal.onclick = e => { if (e.target === modal) modal.remove(); };

    const searchInput = document.getElementById('freeze-search');
    if (searchInput) searchInput.addEventListener('input', (e) => filterApps(e.target.value));

    const refreshBtn = document.getElementById('freeze-refresh-btn');
    if (refreshBtn) refreshBtn.onclick = async () => { await loadConfig(); await scanApps(); };

    const thawAllBtn = document.getElementById('freeze-thaw-all');
    if (thawAllBtn) thawAllBtn.onclick = async () => await toggleAllApps(false);

    const cancelBtn = document.getElementById('freeze-cancel-btn');
    if (cancelBtn) cancelBtn.onclick = () => modal.remove();

    scanApps();
}

// ✅ ULTRA-OPTIMIZED: Get all frozen/thawed packages in just 2 shell commands!
async function getFrozenAndThawedPackages() {
    const frozenSet = new Set();
    const thawedSet = new Set();
    try {
        const frozenRaw = await execFn(`ls ${FROZEN_DIR} 2>/dev/null`, 5000);
        if (frozenRaw) frozenRaw.trim().split('\n').forEach(p => p.trim() && frozenSet.add(p.trim()));
        
        const thawedRaw = await execFn(`ls ${THAW_DIR} 2>/dev/null`, 5000);
        if (thawedRaw) thawedRaw.trim().split('\n').forEach(p => p.trim() && thawedSet.add(p.trim()));
    } catch (e) {
        console.warn('Failed to list freeze dirs:', e);
    }
    return { frozenSet, thawedSet };
}

function updateAppRowUI(pkg, isNowFrozen) {
    const appEl = document.getElementById(`app-${pkg}`);
    if (!appEl) return;
    
    const statusColor = isNowFrozen ? '#06b6d4' : '#ef4444';
    const statusText = isNowFrozen ? '❄️ Frozen' : '🔓 Active';
    const btnBg = isNowFrozen ? '#06b6d4' : '#ef4444';
    const btnText = isNowFrozen ? 'Thaw' : 'Freeze';

    const infoDiv = appEl.querySelector('div[style*="flex:1"]');
    if (infoDiv) {
        const statusLabel = infoDiv.querySelector('div:nth-child(2)');
        if (statusLabel) {
            statusLabel.style.color = statusColor;
            statusLabel.textContent = statusText;
        }
    }

    const btn = appEl.querySelector('.freeze-app-toggle');
    if (btn) {
        btn.style.background = btnBg;
        btn.textContent = btnText;
        btn.dataset.frozen = isNowFrozen ? '1' : '0';
        btn.disabled = false;
    }

    const appData = detectedApps.find(a => a.pkg === pkg);
    if (appData) appData.isFrozen = isNowFrozen;
}

async function scanApps() {
    const listEl = document.getElementById('freeze-list');
    const statusEl = document.getElementById('freeze-scan-status');
    if (!listEl || !statusEl) return; 
    
    try {
        await execFn(`mkdir -p ${FROZEN_DIR} ${THAW_DIR} 2>/dev/null`);
        statusEl.textContent = `⚡ Fetching packages...`;
        
        const allPkgs = await getAllPackages();
        
        if (!allPkgs.length) {
            statusEl.innerHTML = '<span style="color:#666;">No apps found.</span>';
            listEl.style.display = 'none';
            return;
        }
        
        statusEl.textContent = `⚡ Enriching ${allPkgs.length} apps...`;
        listEl.style.display = 'flex';
        listEl.innerHTML = '';
        detectedApps = [];

        const { labels, system } = await enrichApps(allPkgs);
        
        // ✅ OPTIMIZED: Check freeze status in bulk (2 shell commands total)
        statusEl.textContent = `⚡ Checking freeze status...`;
        const { frozenSet, thawedSet } = await getFrozenAndThawedPackages();

        const colors = ['#06b6d4', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#ef4444', '#14b8a6'];
        
        for (const pkg of allPkgs) {
            const isSystem = system.has(pkg);
            const appName = labels[pkg] || getLocalAppName(pkg) || formatPackageName(pkg);
            const isFrozen = frozenSet.has(pkg) && !thawedSet.has(pkg);
            detectedApps.push({ pkg, label: appName, isFrozen, isSystem });
        }
        
        // Sort: User apps first, then System apps, alphabetically
        detectedApps.sort((a, b) => {
            if (a.isSystem !== b.isSystem) return a.isSystem ? 1 : -1;
            return a.label.localeCompare(b.label);
        });

        for (const app of detectedApps) {
            const { pkg, label: appName, isFrozen, isSystem } = app;
            const colorIdx = pkg.charCodeAt(0) % colors.length;
            const color = colors[colorIdx];
            const firstLetter = appName.charAt(0).toUpperCase();
            const statusColor = isFrozen ? '#06b6d4' : '#ef4444';
            const statusText = isFrozen ? '❄️ Frozen' : ' Active';
            const btnBg = isFrozen ? '#06b6d4' : '#ef4444';
            const btnText = isFrozen ? 'Thaw' : 'Freeze';

            const appEl = document.createElement('div');
            appEl.id = `app-${pkg}`;
            appEl.style.cssText = 'background:rgba(0,0,0,0.3);border-radius:10px;padding:12px;display:flex;align-items:center;gap:12px;';
            
            appEl.innerHTML = `
                <div style="position:relative;width:48px;height:48px;flex-shrink:0;">
                    <img src="ksu://icon/${pkg}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" style="width:48px;height:48px;border-radius:12px;object-fit:cover;background:#2c2c2e;">
                    <div style="display:none;width:48px;height:48px;border-radius:12px;background:linear-gradient(135deg,${color},${color}aa);align-items:center;justify-content:center;color:#fff;font-size:24px;font-weight:bold;box-shadow:0 4px 12px rgba(0,0,0,0.3);">${firstLetter}</div>
                </div>
                <div style="flex:1;min-width:0;">
                    <div style="color:#fff;font-size:14px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${appName}</div>
                    <div style="color:${statusColor};font-size:11px;margin-top:2px;">${statusText}</div>
                    <div style="color:#555;font-size:10px;font-family:monospace;margin-top:1px;">${pkg}${isSystem ? ' (System)' : ''}</div>
                </div>
                <button class="freeze-app-toggle" data-pkg="${pkg}" data-frozen="${isFrozen ? '1' : '0'}" style="background:${btnBg};color:#fff;border:none;padding:8px 16px;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap;min-width:70px;">${btnText}</button>
            `;
            listEl.appendChild(appEl);
        }
        
        statusEl.style.display = 'none';
        console.log(`✅ Loaded ${detectedApps.length} apps`);

        listEl.querySelectorAll('.freeze-app-toggle').forEach(btn => {
            btn.onclick = async (e) => {
                const pkg = e.currentTarget.dataset.pkg;
                const currentlyFrozen = e.currentTarget.dataset.frozen === '1';
                e.currentTarget.disabled = true;
                e.currentTarget.textContent = '⏳';
                try {
                    if (currentlyFrozen) {
                        await execFn(`rm -f ${FROZEN_DIR}/${pkg}`);
                        await execFn(`touch ${THAW_DIR}/${pkg}`);
                        await execFn(`pm unsuspend ${pkg} 2>/dev/null || true`);
                    } else {
                        await execFn(`rm -f ${THAW_DIR}/${pkg}`);
                        await execFn(`touch ${FROZEN_DIR}/${pkg}`);
                        await execFn(`pm suspend ${pkg} 2>/dev/null || true`);
                    }
                    const newFrozenState = !currentlyFrozen;
                    frozenPackages[pkg] = newFrozenState ? '1' : '0';
                    await saveConfig();
                    updateAppRowUI(pkg, newFrozenState);
                } catch (err) {
                    console.error(`Failed ${pkg}:`, err);
                    e.currentTarget.textContent = currentlyFrozen ? 'Thaw' : 'Freeze';
                    e.currentTarget.disabled = false;
                }
            };
        });
    } catch (e) {
        console.error('Scan failed:', e);
        statusEl.innerHTML = `<span style="color:#FF453A;"> Error: ${e.message}</span>`;
    }
}

function filterApps(query) {
    const listEl = document.getElementById('freeze-list');
    if (!listEl) return;
    const q = query.toLowerCase().trim();
    const items = listEl.querySelectorAll('div[id^="app-"]'); // Select by ID pattern instead
    items.forEach(item => {
        const nameEl = item.querySelector('div[style*="color:#fff"]');
        const pkgEl = item.querySelector('div[style*="font-family:monospace"]');
        const name = nameEl?.textContent?.toLowerCase() || '';
        const pkg = pkgEl?.textContent?.toLowerCase() || '';
        item.style.display = (name.includes(q) || pkg.includes(q)) ? 'flex' : 'none';
    });
}

async function toggleAllApps(freeze) {
    const statusEl = document.getElementById('freeze-scan-status');
    if (!statusEl) return;
    statusEl.style.display = 'block';
    statusEl.innerHTML = `<span style="color:#06b6d4;"> ${freeze ? 'Freezing' : 'Thawing'}...</span>`;
    try {
        await execFn(`mkdir -p ${FROZEN_DIR} ${THAW_DIR}`);
        for (const app of detectedApps) {
            if (freeze) {
                await execFn(`rm -f ${THAW_DIR}/${app.pkg} && touch ${FROZEN_DIR}/${app.pkg} && pm suspend ${app.pkg} 2>/dev/null`);
                frozenPackages[app.pkg] = '1';
            } else {
                await execFn(`rm -f ${FROZEN_DIR}/${app.pkg} && touch ${THAW_DIR}/${app.pkg} && pm unsuspend ${app.pkg} 2>/dev/null`);
                frozenPackages[app.pkg] = '0';
            }
            updateAppRowUI(app.pkg, freeze);
        }
        await saveConfig();
        statusEl.innerHTML = `<span style="color:#32D74B;">✅ Done</span>`;
        setTimeout(() => { statusEl.style.display = 'none'; }, 1500);
    } catch (e) {
        statusEl.innerHTML = `<span style="color:#FF453A;">❌ Error</span>`;
    }
}

async function saveConfig() {
    try {
        let cfg = '';
        for (const [pkg, state] of Object.entries(frozenPackages)) cfg += `${pkg}=${state}\n`;
        await execFn(`mkdir -p /sdcard/MTK_AI_Engine && echo "${cfg}" > ${CONFIG_FILE}`);
    } catch (e) {}
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

window.FreezeManager = { init, showFreezeModal, toggleAllApps };
})();