// application.js - Complete App List Manager with Full-Width Cards & Per-App Game Toggle + Renderer Integration
(function() {
'use strict';
const CFG_DIR = '/sdcard/MTK_AI_Engine';
const GAMELIST_FILE = CFG_DIR + '/game_list.txt';
const PERAPP_DIR = CFG_DIR + '/per_app';
const REFRESH_LOCKS_DIR = CFG_DIR + '/refresh_locks';
const APP_CACHE_FILE = CFG_DIR + '/app_list_cache.json';
const WHITELIST_FILE = CFG_DIR + '/whitelist.txt';
const CLOUD_CACHE_FILE = CFG_DIR + '/cloud_app_names.json';
const CLOUD_APP_NAMES_URL = 'https://raw.githubusercontent.com/your-username/mtk-ai-app-names/main/app_names.json';
const CLOUD_CACHE_EXPIRY_HOURS = 24;

let allApps = [];
let gameList = [];
let currentTargetPkg = '';
let currentMonitorPkg = '';
let monitorInterval = null;
let isMonitorRunning = false;
let searchDebounceTimer = null;
let cloudAppNames = {};

// === EXEC HELPER ===
async function execFn(cmd, timeout = 1000) {
    return new Promise((resolve) => {
        const cb = 'cb_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
        const t = setTimeout(() => { delete window[cb]; resolve(''); }, timeout);
        window[cb] = (_, res) => {
            clearTimeout(t);
            delete window[cb];
            resolve(res || '');
        };
        if (window.ksu && typeof ksu.exec === 'function') {
            ksu.exec(cmd, 'window.' + cb);
        } else {
            clearTimeout(t);
            resolve('');
        }
    });
}

// === STATUS DISPLAY ===
function showStatus(msg, color) {
    const el = document.getElementById('debug-msg');
    if (el) {
        el.textContent = msg;
        el.style.color = color || '#fff';
        setTimeout(() => { el.textContent = 'System Ready'; }, 2000);
    }}

// === RENDERER MANAGEMENT FUNCTIONS ===
async function applyGlobalRenderer(rendererValue) {
    await execFn(`su -c "mkdir -p /sdcard/MTK_AI_Engine && echo '${rendererValue}' > /sdcard/MTK_AI_Engine/manual_renderer.txt"`);
    await execFn(`su -c "setprop debug.hwui.renderer ${rendererValue}"`);
    showStatus(`Renderer: ${rendererValue} — Restart apps`, '#007AFF');
    
    const displayName = rendererValue === "skiavk" ? "Vulkan" : "OpenGL";
    document.querySelectorAll("#dynamic-renderer-buttons .refresh-btn, .renderer-toggle-btn").forEach(btn => {
        btn.classList.toggle("active", btn.textContent === displayName || btn.dataset.value === rendererValue);
    });
}

async function verifyRenderer(pkg) {
    const statusEl = document.getElementById(`renderer-status-${pkg}`);    if (!statusEl) return;
    
    statusEl.innerHTML = "🔍 Checking Pipeline...";
    
    try {
        const cmd = `su -c "dumpsys gfxinfo ${pkg} | grep -iE 'Graphics|Pipeline|Renderer|EGL|GL|Vulkan'"`;
        const output = (await execFn(cmd, 5000)).toLowerCase();
        
        if (output.includes("vulkan") || output.includes("vkrender") || output.includes("vk ")) {
            statusEl.innerHTML = "<span style='color:#4cd964; font-weight:bold;'>VULKAN ✅</span>";
        } else if (output.includes("opengl") || output.includes("opengles") || output.includes("gl_")) {
            statusEl.innerHTML = "<span style='color:#ff9500; font-weight:bold;'>OPENGL ⚠️</span>";
        } else if (output.includes("skia") || output.includes("skiagl") || output.includes("skiavk")) {
            const isVk = output.includes("skiavk");
            statusEl.innerHTML = `<span style='color:${isVk ? "#4cd964" : "#ff9500"}; font-weight:bold;'>${isVk ? "VULKAN" : "OPENGL"} ${isVk ? "✅" : "⚠️"}</span>`;
        } else {
            statusEl.innerHTML = "<span style='color:#888'>No Data (Open Game & Check)</span>";
        }
    } catch (e) {
        statusEl.innerHTML = "<span style='color:#ff3b30'>Check Failed</span>";
        console.warn("Renderer verify error:", e);
    }
}

async function applyHardCoreFix(pkg, rendererValue) {
    const statusEl = document.getElementById(`renderer-status-${pkg}`);
    if (statusEl) statusEl.innerHTML = '<span style="color:var(--color-blue)">Restarting App...</span>';
    
    await execFn(`su -c "setprop debug.hwui.renderer ${rendererValue} && am force-stop ${pkg}"`);
    await execFn(`su -c "rm -rf /data/data/${pkg}/code_cache/com.android.opengl.shaders_cache 2>/dev/null"`);
    await execFn(`su -c "rm -rf /data/data/${pkg}/code_cache/com.android.skia.shaders_cache 2>/dev/null"`);
    await execFn(`su -c "rm -rf /data/data/${pkg}/cache/*shader* 2>/dev/null"`);
    
    if (statusEl) statusEl.innerHTML = '<span style="color:var(--color-green)">Applied!</span> Open game & Verify.';
    showStatus(`Renderer ${rendererValue === 'skiavk' ? 'Vulkan' : 'OpenGL'} applied to ${pkg}`, '#32D74B');
}

async function saveAndApplyRenderer(pkg, rendererValue) {
    const configDir = "/sdcard/MTK_AI_Engine/threading_configs";
    const configFile = `${configDir}/${pkg}.renderer`;
    
    await execFn(`su -c "mkdir -p ${configDir} && echo '${rendererValue}' > ${configFile}"`);
    await applyHardCoreFix(pkg, rendererValue);
    
    const popupToggle = document.getElementById(`renderer-toggle-${pkg}`);
    if (popupToggle) {
        popupToggle.querySelectorAll('.renderer-toggle-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.value === rendererValue);
        });
    }}

async function loadAppRenderer(pkg) {
    try {
        const perApp = await execFn(`cat /sdcard/MTK_AI_Engine/threading_configs/${pkg}.renderer 2>/dev/null`);
        if (perApp.trim()) return perApp.trim();
        const global = await execFn(`cat /sdcard/MTK_AI_Engine/manual_renderer.txt 2>/dev/null`);
        if (global.trim()) return global.trim();
        return "";
    } catch (e) {
        console.warn("Failed to load renderer pref:", e);
        return "";
    }
}

function createRendererToggles(pkg, savedValue, onToggle) {
    const container = document.createElement('div');
    container.id = `renderer-toggle-${pkg}`;
    container.style.cssText = 'display:flex;gap:8px;margin-top:8px;';
    
    const renderers = [
        { label: "Vulkan", value: "skiavk", color: "#4cd964" },
        { label: "OpenGL", value: "skiagl", color: "#ff9500" }
    ];
    
    renderers.forEach(renderer => {
        const btn = document.createElement('button');
        btn.className = `renderer-toggle-btn${savedValue === renderer.value ? ' active' : ''}`;
        btn.dataset.value = renderer.value;
        btn.style.cssText = `
            flex:1;
            padding:10px 12px;
            background:${savedValue === renderer.value ? renderer.color + '20' : '#2a2a2c'};
            border:1px solid ${savedValue === renderer.value ? renderer.color : '#3a3a3c'};
            border-radius:10px;
            color:${savedValue === renderer.value ? renderer.color : '#fff'};
            font-size:13px;
            font-weight:600;
            cursor:pointer;
            transition:all 0.2s ease;
        `;
        btn.onmouseover = function() { if (!this.classList.contains('active')) this.style.background = '#3a3a3c'; };
        btn.onmouseout = function() { if (!this.classList.contains('active')) this.style.background = '#2a2a2c'; };
        btn.onclick = (e) => {
            e.stopPropagation();
            onToggle(renderer.value);
        };
        btn.textContent = renderer.label;
        container.appendChild(btn);
    });    
    return container;
}

// === CLOUD APP NAMES ===
async function loadCloudAppNames() {
    try {
        const cached = localStorage.getItem('mtk_cloud_app_names');
        const cachedTime = localStorage.getItem('mtk_cloud_cache_time');
        if (cached && cachedTime) {
            const ageHours = (Date.now() - parseInt(cachedTime)) / (1000 * 60 * 60);
            if (ageHours < CLOUD_CACHE_EXPIRY_HOURS) {
                cloudAppNames = JSON.parse(cached);
                return;
            }
        }
        console.log('🌐 Fetching app names from cloud...');
        const response = await fetch(CLOUD_APP_NAMES_URL, { method: 'GET', headers: { 'Accept': 'application/json' }, cache: 'no-store' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        if (data && typeof data === 'object') {
            cloudAppNames = data;
            localStorage.setItem('mtk_cloud_app_names', JSON.stringify(cloudAppNames));
            localStorage.setItem('mtk_cloud_cache_time', Date.now().toString());
        }
    } catch (e) {
        console.warn('☁️ Cloud sync failed:', e.message);
        cloudAppNames = {};
    }
}

// === APP LABEL RESOLUTION ===
async function getAppLabel(pkg) {
    try {
        if (cloudAppNames[pkg]) return cloudAppNames[pkg];
        const dumpsysResult = await execFn(`dumpsys package ${pkg} 2>/dev/null`);
        if (dumpsysResult) {
            const labelMatch = dumpsysResult.match(/label= "([^ "]+) "/);
            if (labelMatch && labelMatch[1] && labelMatch[1].trim()) return labelMatch[1].trim();
            const appInfoMatch = dumpsysResult.match(/ApplicationInfo\{[^}]+\}/);
            if (appInfoMatch) {
                const labelMatch2 = appInfoMatch[0].match(/label=([^\s\}]+)/);
                if (labelMatch2 && labelMatch2[1]) return labelMatch2[1];
            }
        }
        const pmResult = await execFn(`pm list packages -f | grep "${pkg}" 2>/dev/null`);
        if (pmResult && pmResult.includes(pkg)) {
            const apkMatch = pmResult.match(/apk=([^\s=]+)/);
            if (apkMatch) {
                const apkName = apkMatch[1].split('/').pop().replace('.apk', '');                if (apkName && apkName !== pkg) return formatPackageName(apkName);
            }
        }
        const localName = getLocalAppName(pkg);
        if (localName) return localName;
        return formatPackageName(pkg);
    } catch (e) {
        return getLocalAppName(pkg) || formatPackageName(pkg);
    }
}

function getLocalAppName(pkg) {
    const localMappings = {
        'com.mobile.legends': 'Mobile Legends: Bang Bang', 'com.pubg.imobile': 'PUBG MOBILE',
        'com.pubg.krmobile': 'PUBG MOBILE: NEW STATE', 'com.garena.game.freefire': 'Garena Free Fire MAX',
        'com.activision.callofduty.shooter': 'Call of Duty®: Mobile', 'com.miHoYo.GenshinImpact': 'Genshin Impact',
        'com.miHoYo.Yuanshen': '原神', 'com.tencent.ig': 'PUBG MOBILE: RESISTANCE',
        'com.roblox.client': 'Roblox', 'com.supercell.clashofclans': 'Clash of Clans',
        'com.supercell.brawlstars': 'Brawl Stars', 'com.discord': 'Discord',
        'com.spotify.music': 'Spotify', 'com.netflix.mediaclient': 'Netflix',
        'com.whatsapp': 'WhatsApp', 'com.instagram.android': 'Instagram',
        'com.facebook.katana': 'Facebook', 'com.google.android.youtube': 'YouTube',
        'com.android.chrome': 'Chrome', 'com.zhiliaoapp.musically': 'TikTok',
        'com.ss.android.ugc.trill': 'TikTok Lite', 'org.telegram.messenger': 'Telegram',
        'com.twitter.android': 'X', 'com.snapchat.android': 'Snapchat',
        'com.tencent.tmgp.sgame': 'Honor of Kings', 'com.tencent.tmgp.pubgmhd': 'PUBG MOBILE HD',
        'com.tencent.lolm': 'League of Legends: Wild Rift', 'com.epicgames.fortnite': 'Fortnite',
        'com.miHoYo.hkrpg': 'Honkai: Star Rail', 'com.netease.idv.googleplay': 'Identity V'
    };
    return localMappings[pkg] || null;
}

function formatPackageName(pkg) {
    let name = pkg.replace(/^(com|io|org|net|app|me|jp|kr|cn|in|br|ru|de|fr|es|it)\./, '');
    const parts = name.split('.');
    if (parts.length >= 2) name = parts.slice(-2).join(' ');
    return name.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) || pkg;
}

// === SERVICE RESTART ===
async function restartMTKService() {
    showStatus('🔄 Restarting MTK AI Service...', '#FF9F0A');
    try {
        await execFn('su -c "pkill -9 -f \"/data/adb/modules/MTK_AI\" 2>/dev/null"', 3000);
        await new Promise(r => setTimeout(r, 400));
        const cmd = `su -c 'export PATH="/system/bin:/system/xbin:/sbin:/vendor/bin"; cd /data/adb/modules/MTK_AI; nohup sh /data/adb/modules/MTK_AI/service.sh >/dev/null 2>&1 & disown'`;
        await execFn(cmd, 5000);
        console.log('✅ MTK_AI service restarted');
    } catch (e) {
        console.warn('⚠️ Service restart skipped/failed:', e);    }
}

// === WHITELIST & GAME LIST ===
async function isInWhitelist(pkg) { try { const r = await execFn(`grep -Fx "${pkg}" ${WHITELIST_FILE} 2>/dev/null`); return r.trim() === pkg; } catch { return false; } }
async function addToWhitelist(pkg) { try { const exists = await isInWhitelist(pkg); if (exists) return true; await execFn(`mkdir -p ${CFG_DIR} && echo "${pkg}" >> ${WHITELIST_FILE}`); return true; } catch { return false; } }
async function removeFromWhitelist(pkg) { try { await execFn(`sed -i "/^${pkg}$/d" ${WHITELIST_FILE} 2>/dev/null`); return true; } catch { return false; } }
async function loadGameList() { try { const r = await execFn(`cat ${GAMELIST_FILE} 2>/dev/null`); gameList = r.split('\n').map(l => l.trim()).filter(l => l); } catch { gameList = []; } }

async function syncWhitelistFromGameList() {
    showStatus('🔄 Syncing whitelist...', '#0A84FF');
    try {
        await loadGameList();
        const gameSet = new Set(gameList);
        const whitelistRaw = await execFn(`cat ${WHITELIST_FILE} 2>/dev/null`);
        const existingWhitelist = new Set(whitelistRaw.split('\n').map(l => l.trim()).filter(l => l));
        const pkgResult = await execFn('pm list packages -3 2>/dev/null');
        const allPkgs = pkgResult.split('\n').map(p => p.replace('package:', '').trim()).filter(p => p);
        let added = 0, removed = 0;
        for (const pkg of allPkgs) {
            if (gameSet.has(pkg)) {
                if (existingWhitelist.has(pkg)) { await execFn(`sed -i "/^${pkg}$/d" ${WHITELIST_FILE} 2>/dev/null`); removed++; }
            } else {
                if (!existingWhitelist.has(pkg)) { await execFn(`echo "${pkg}" >> ${WHITELIST_FILE}`); added++; }
            }
        }
        showStatus(`✅ Sync: +${added} whitelisted, -${removed} removed`, '#32D74B');
        if (allApps.length > 0) { allApps.forEach(app => { app.isInGameList = !gameSet.has(app.pkg); }); renderAppList(allApps); }
    } catch (e) { showStatus('❌ Sync failed', '#FF453A'); }
}

// === APP LIST LOADING ===
async function loadAppList() {
    const container = document.getElementById('app-list-container');
    if (!container) return;
    await loadCloudAppNames();
    const cachedList = localStorage.getItem('mtk_ai_app_list_cache');
    const cachedCount = localStorage.getItem('mtk_ai_app_count');
    try {
        const countCmd = await execFn('pm list packages -3 | wc -l');
        const currentCount = parseInt(countCmd.trim()) || 0;
        if (cachedList && cachedCount == currentCount) {
            allApps = JSON.parse(cachedList);
            await loadGameList();
            allApps.forEach(app => { app.isInGameList = gameList.includes(app.pkg); });
            renderAppList(allApps); return;
        }
    } catch (e) { console.log("Cache check failed, reloading list."); }

    container.innerHTML = '<div style="text-align:center;padding:40px;color:#888;">⏳ Scanning Installed Apps...</div>';    try {
        await loadGameList();
        const result = await execFn('pm list packages -3 2>/dev/null');
        const packages = result.split('\n').map(p => p.replace('package:', '').trim()).filter(p => p);
        allApps = [];
        const batchSize = 10;
        for (let i = 0; i < packages.length; i += batchSize) {
            const batch = packages.slice(i, i + batchSize);
            const batchApps = await Promise.all(batch.map(async pkg => {
                const label = await getAppLabel(pkg);
                return { pkg, label, isInGameList: gameList.includes(pkg) };
            }));
            allApps = allApps.concat(batchApps);
            container.innerHTML = `<div style="text-align:center;padding:40px;color:#888;">⏳ Loading apps... ${Math.min(100, Math.round(((i + batchSize) / packages.length) * 100))}%</div>`;
        }
        allApps.sort((a, b) => { if (a.isInGameList && !b.isInGameList) return -1; if (!a.isInGameList && b.isInGameList) return 1; return a.label.localeCompare(b.label); });
        localStorage.setItem('mtk_ai_app_list_cache', JSON.stringify(allApps));
        localStorage.setItem('mtk_ai_app_count', packages.length.toString());
        renderAppList(allApps);
    } catch (e) { container.innerHTML = `<div style="text-align:center;padding:40px;color:#ff453a;">❌ Failed to load apps<br><small>${e.message}</small></div>`; }
}

// === SEARCH ===
function searchApps(query) {
    const q = query.toLowerCase().trim();
    document.getElementById('search-clear-btn').style.display = q.length > 0 ? 'flex' : 'none';
    if (!q) { renderAppList(allApps); return; }
    const filtered = allApps.filter(app => app.label.toLowerCase().includes(q) || app.pkg.toLowerCase().includes(q));
    document.getElementById('app-list-container').innerHTML = filtered.length === 0 ? `<div style="text-align:center;padding:40px;color:#888;">🔍 No apps found for "${query}"</div>` : '';
    if (filtered.length > 0) renderAppList(filtered);
}
function handleSearchInput(e) { clearTimeout(searchDebounceTimer); searchDebounceTimer = setTimeout(() => searchApps(e.target.value), 150); }
function clearSearch() { const i = document.getElementById('app-search-input'); if (i) { i.value = ''; searchApps(''); i.focus(); } }

// === RENDER APP LIST ===
function renderAppList(apps) {
    const container = document.getElementById('app-list-container');
    if (!container) return;
    if (apps.length === 0) { container.innerHTML = '<div style="text-align:center;padding:40px;color:#888;">No apps found</div>'; return; }

    container.style.cssText = `
        width: 100%;
        max-width: 100%;
        padding: 0;
        margin: 0;
        overflow-x: hidden;
    `;

    let html = '<div style="display: flex; flex-direction: column; gap: 0; padding: 0; width: 100%;">';
    apps.forEach(app => {
        const isActive = gameList.includes(app.pkg);
        
        html += `
        <div class="app-card" data-pkg="${app.pkg}" onclick="openAppConfigPopup('${app.pkg}')" style="
            background: #1c1c1e;
            border-radius: 0;
            padding: 16px;
            display: flex;
            align-items: center;
            gap: 14px;
            cursor: pointer;
            transition: background 0.15s ease;
            width: 100%;
            max-width: 100%;
            box-sizing: border-box;
            margin: 0;
            border-bottom: 1px solid rgba(255,255,255,0.05);
        " onmouseover="this.style.background='#2c2c2e'" onmouseout="this.style.background='#1c1c1e'">
            
            <!-- App Icon -->
            <img src="ksu://icon/${app.pkg}" 
                onerror="this.src='image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0OCIgaGVpZ2h0PSI0OCI+PHJlY3Qgd2lkdGg9IjQ4IiBoZWlnaHQ9IjQ4IiBmaWxsPSIjMzMzIi8+PHRleHQgeD0iMjQiIHk9IjMwIiBmb250LXNpemU9IjI0IiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmaWxsPSIjZmZmIj7wn5mFPC90ZXh0Pjwvc3ZnPg=='" 
                style="width: 52px; height: 52px; border-radius: 14px; flex-shrink: 0; background: #2c2c2e; pointer-events: none; object-fit: cover;">
            
            <!-- App Info -->
            <div style="flex: 1; min-width: 0; display: flex; flex-direction: column; justify-content: center; gap: 2px;">
                <div style="color: #fff; font-size: 16px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                    ${app.label}
                </div>
                <div style="color: #888; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                    ${app.pkg}
                </div>
                <div style="color: ${isActive ? '#ff9f0a' : '#888'}; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 2px;">
                    ${isActive ? 'ACTIVE' : 'INACTIVE'}
                </div>
            </div>
        </div>
        `;
    });

    html += '</div>';
    container.innerHTML = html;
}

// === TOGGLE GAME LIST ===
async function toggleGameList(pkg, fromPopup = false) {
    const app = allApps.find(a => a.pkg === pkg);
    if (!app) return;
        const wasActive = gameList.includes(pkg);
    app.isInGameList = !wasActive;
    
    if (app.isInGameList) {
        if (!gameList.includes(pkg)) gameList.push(pkg);
        await removeFromWhitelist(pkg);
        await execFn(`echo "${pkg}" >> ${GAMELIST_FILE}`);
        showStatus('✅ Added to Game List: ' + app.label, '#32D74B');
    } else {
        gameList = gameList.filter(p => p !== pkg);
        await addToWhitelist(pkg);
        await execFn(`sed -i "/^${pkg}$/d" ${GAMELIST_FILE}`);
        showStatus('❌ Removed from Game List: ' + app.label, '#ff9f0a');
    }
    
    if (allApps.length > 0) {
        allApps.sort((a, b) => { 
            if (a.isInGameList && !b.isInGameList) return -1; 
            if (!a.isInGameList && b.isInGameList) return 1; 
            return a.label.localeCompare(b.label); 
        });
        renderAppList(allApps);
    }
    
    restartMTKService();
    
    if (fromPopup) {
        const toggleEl = document.getElementById(`popup-toggle-${pkg}`);
        const statusEl = document.getElementById(`popup-status-${pkg}`);
        if (toggleEl && statusEl) {
            const isActive = gameList.includes(pkg);
            toggleEl.style.transition = 'all 0.3s cubic-bezier(0.4, 0.0, 0.2, 1)';
            toggleEl.style.backgroundColor = isActive ? '#ff9f0a' : '#3a3a3c';
            
            const thumb = toggleEl.querySelector('.toggle-thumb');
            if (isActive) {
                thumb.style.left = 'auto';
                thumb.style.right = '3px';
            } else {
                thumb.style.left = '3px';
                thumb.style.right = 'auto';
            }
            
            statusEl.textContent = isActive ? 'ACTIVE' : 'INACTIVE';
            statusEl.style.color = isActive ? '#ff9f0a' : '#888';
            statusEl.style.transition = 'color 0.3s ease';
        }
        
        if (navigator.vibrate) navigator.vibrate(50);
    }}

// === MONITOR POPUP ===
function openMonitorPopup(pkg) {
    currentMonitorPkg = pkg;
    const app = allApps.find(a => a.pkg === pkg);
    if (!app) return;
    const modal = document.createElement('div');
    modal.id = 'monitor-popup';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:10000;display:flex;align-items:center;justify-content:center;padding:10px;';
    modal.innerHTML = `
        <div style="background:#1c1c1e;border-radius:20px;width:100%;max-width:420px;max-height:85vh;overflow:hidden;display:flex;flex-direction:column;">
            <div style="padding:20px;border-bottom:1px solid #333;display:flex;justify-content:space-between;align-items:center;">
                <div><h3 style="margin:0;color:#fff;font-size:18px;">Session Monitor</h3><small style="color:#888;font-family:monospace;">${pkg}</small></div>
                <button onclick="closeMonitorPopup()" style="background:none;border:none;color:#888;font-size:28px;cursor:pointer;line-height:1;">&times;</button>
            </div>
            <div style="flex:1;overflow-y:auto;padding:20px;">
                <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:20px;">
                    <div style="background:rgba(0,0,0,0.3);padding:12px 5px;border-radius:12px;text-align:center;"><span>⚡</span><span id="stat-avg-power" style="font-size:1rem;font-weight:bold;color:#ffcc00;display:block;">--</span><span style="font-size:0.65rem;color:#aaa;">Power</span></div>
                    <div style="background:rgba(0,0,0,0.3);padding:12px 5px;border-radius:12px;text-align:center;"><span>🌡️</span><span id="stat-avg-temp" style="font-size:1rem;font-weight:bold;color:#ff6b6b;display:block;">--</span><span style="font-size:0.65rem;color:#aaa;">Temp</span></div>
                    <div style="background:rgba(0,0,0,0.3);padding:12px 5px;border-radius:12px;text-align:center;"><span>🎮</span><span id="stat-avg-fps" style="font-size:1rem;font-weight:bold;color:#4cd964;display:block;">--</span><span style="font-size:0.65rem;color:#aaa;">FPS</span></div>
                </div>
                <div id="monitor-status" style="text-align:center;color:#888;margin-bottom:20px;">Ready</div>
                <div style="display:flex;gap:10px;">
                    <button id="btn-toggle-monitor" onclick="toggleMonitor()" style="flex:1;padding:12px;background:linear-gradient(90deg,#007bff,#0056b3);color:#fff;border:none;border-radius:8px;font-weight:bold;cursor:pointer;">▶️ Start Monitor</button>
                    <button onclick="closeMonitorPopup()" style="flex:1;padding:12px;background:#3a3a3c;color:#fff;border:none;border-radius:8px;font-weight:bold;cursor:pointer;">Close</button>
                </div>
            </div>
        </div>`;
    document.body.appendChild(modal);
}
function closeMonitorPopup() { const m = document.getElementById('monitor-popup'); if (m) { m.remove(); if (monitorInterval) clearInterval(monitorInterval); monitorInterval = null; isMonitorRunning = false; } }
async function toggleMonitor() {
    const btn = document.getElementById('btn-toggle-monitor');
    const status = document.getElementById('monitor-status');
    if (!currentMonitorPkg) return;
    if (isMonitorRunning) {
        isMonitorRunning = false; btn.innerHTML = '▶️ Start Monitor'; btn.style.background = 'linear-gradient(90deg,#007bff,#0056b3)'; status.textContent = '⏹️ Stopped'; status.style.color = '#ff9f0a';
        await execFn(`rm -f /sdcard/MTK_AI_Engine/enable_monitor`); if (monitorInterval) clearInterval(monitorInterval); monitorInterval = null;
    } else {
        isMonitorRunning = true; btn.innerHTML = '⏹️ Stop Monitor'; btn.style.background = '#ff453a'; status.textContent = '✅ Monitoring...'; status.style.color = '#4cd964';
        await execFn(`mkdir -p /sdcard/MTK_AI_Engine && echo '${currentMonitorPkg}' > /sdcard/MTK_AI_Engine/active_monitor_pkg.txt && touch /sdcard/MTK_AI_Engine/enable_monitor`);
        monitorInterval = setInterval(readStatsFile, 3000);
    }
}
async function readStatsFile() {
    if (!currentMonitorPkg) return;
    try {
        const result = await execFn(`cat /sdcard/MTK_AI_Engine/stats_${currentMonitorPkg}.txt 2>/dev/null`);
        if (!result || result.trim() === '') return;        const stats = {};
        result.split('\n').forEach(line => { const parts = line.split(':'); if (parts.length >= 2) stats[parts[0].trim()] = parts.slice(1).join(':').trim(); });
        const mapping = { 'Avg_Power': 'stat-avg-power', 'Avg_Temp': 'stat-avg-temp', 'Avg_FPS': 'stat-avg-fps', 'Samples': 'stat-samples' };
        for (const [key, id] of Object.entries(mapping)) { const el = document.getElementById(id); if (el && stats[key]) el.textContent = stats[key]; }
        const timeEl = document.getElementById('stat-time'); if (timeEl && stats['Timestamp']) timeEl.textContent = stats['Timestamp'].split(' ')[1] || '--:--:--';
    } catch (e) { console.warn('Read stats failed:', e); }
}

// === APP CONFIG POPUP WITH RENDERER ===
async function openAppConfigPopup(pkg) {
    currentTargetPkg = pkg;
    const app = allApps.find(a => a.pkg === pkg);
    if (!app) return;

    const isActive = gameList.includes(pkg);

    const modal = document.createElement('div');
    modal.id = 'app-config-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:#000;z-index:10000;display:flex;flex-direction:column;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:#fff;overflow:hidden;';

    modal.innerHTML = `
    <!-- Header -->
    <div style="height:56px;display:flex;align-items:center;justify-content:space-between;padding:0 16px;">
        <button onclick="closeAppConfigPopup()" style="background:none;border:none;color:#fff;font-size:24px;cursor:pointer;padding:8px;margin-left:-8px;">←</button>
        <h2 style="margin:0;font-size:18px;font-weight:600;">App Profile</h2>
        <div style="position:relative;">
            <button onclick="document.getElementById('menu-${pkg}').style.display = document.getElementById('menu-${pkg}').style.display === 'block' ? 'none' : 'block'" 
                style="background:none;border:none;color:#fff;font-size:20px;cursor:pointer;padding:8px;">⋮</button>
            <div id="menu-${pkg}" style="display:none;position:absolute;right:0;top:30px;background:#1e1e1e;border-radius:12px;width:180px;box-shadow:0 4px 12px rgba(0,0,0,0.5);z-index:101;">
                <div onclick="launchApp('${pkg}')" style="padding:14px 16px;border-bottom:1px solid #333;cursor:pointer;">Launch</div>
                <div style="padding:14px 16px;border-bottom:1px solid #333;cursor:pointer;">App Info</div>
                <div onclick="resetScalingToDefault('${pkg}')" style="padding:14px 16px;color:#ff5c5c;cursor:pointer;">Reset Scaling</div>
            </div>
        </div>
    </div>

    <!-- Scrollable Content -->
    <div style="flex:1;overflow-y:auto;padding-bottom:20px;">
        
        <!-- App Header with Game Toggle -->
        <div style="display:flex;flex-direction:column;align-items:center;padding:10px 0 20px;">
            <img src="ksu://icon/${app.pkg}" style="width:80px;height:80px;border-radius:20px;margin-bottom:12px;object-fit:cover;" onerror="this.src='https://via.placeholder.com/80'">
            <h2 style="margin:0;font-size:20px;font-weight:600;">${app.name || app.label || 'Unknown App'}</h2>
            <p style="margin:4px 0 0;color:#888;font-size:14px;">${pkg}</p>
            
            <!-- Game Toggle Switch -->
            <div style="margin-top:16px;display:flex;align-items:center;gap:12px;background:#1e1e1e;padding:10px 16px;border-radius:16px;">
                <span style="color:#888;font-size:14px;">Game Mode</span>
                <div id="popup-toggle-${pkg}" onclick="event.stopPropagation(); toggleGameList('${pkg}', true)" style="
                    position: relative;                    width: 52px;
                    height: 28px;
                    background-color: ${isActive ? '#ff9f0a' : '#3a3a3c'};
                    border-radius: 28px;
                    cursor: pointer;
                    transition: background-color 0.2s ease;
                ">
                    <div class="toggle-thumb" style="
                        position: absolute;
                        top: 3px;
                        ${isActive ? 'right: 3px;' : 'left: 3px;'}
                        width: 22px;
                        height: 22px;
                        background-color: #fff;
                        border-radius: 50%;
                        transition: 0.2s ease;
                        box-shadow: 0 2px 4px rgba(0,0,0,0.3);
                    "></div>
                </div>
                <span id="popup-status-${pkg}" style="color: ${isActive ? '#ff9f0a' : '#888'}; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">
                    ${isActive ? 'ACTIVE' : 'INACTIVE'}
                </span>
            </div>
        </div>

        <!-- Kernel Section -->
        <div style="padding:0 16px;margin-bottom:8px;">
            <span style="display:inline-block;background:#1e1e1e;padding:4px 12px;border-radius:12px;font-size:13px;color:#8ab4f8;">Kernel</span>
        </div>

        <!-- DVFS Settings Item -->
        <div class="new-accordion-item" style="margin:0 16px 12px;background:#1e1e1e;border-radius:24px;overflow:hidden;">
            <div class="accordion-header" onclick="toggleAccordion(this)" style="padding:18px;display:flex;align-items:center;cursor:pointer;">
                <div style="width:40px;height:40px;background:#2a3a8a;border-radius:50%;display:flex;align-items:center;justify-content:center;margin-right:14px;">
                    <span style="font-size:18px;">📊</span>
                </div>
                <div style="flex:1;">
                    <div style="font-size:17px;font-weight:500;margin-bottom:2px;">DVFS Settings</div>
                    <div style="font-size:13px;color:#888;">Set per-app DVFS policies for GPU/CPU frequency management.</div>
                </div>
                <div style="width:32px;height:32px;background:#2a2a2a;border-radius:50%;display:flex;align-items:center;justify-content:center;">
                    <span style="color:#888;font-size:12px;transition:transform 0.2s;">▼</span>
                </div>
            </div>
            <div class="accordion-content" style="display:none;padding:0 18px 18px;border-top:1px solid #333;">
                <label style="display:block;color:#888;font-size:11px;margin:16px 0 6px;">CPU Governor</label>
                <select id="config-governor" style="width:100%;padding:10px;background:#121212;border:1px solid #333;border-radius:12px;color:#fff;" onchange="saveAppConfig('${pkg}')">
                    <option value="default">Default</option>
                    <option value="performance">Performance</option>
                    <option value="powersave">Powersave</option>                    <option value="schedutil">Schedutil</option>
                </select>
                <label style="display:block;color:#888;font-size:11px;margin:16px 0 6px;">CPU Max Limit</label>
                <input type="range" id="config-cpu-limit" min="30" max="100" value="100" style="width:100%;margin-bottom:4px;" oninput="document.getElementById('cpu-limit-val').textContent=this.value+'%'; saveAppConfig('${pkg}')">
                <div style="text-align:center;color:#8ab4f8;font-size:12px;"><span id="cpu-limit-val">100%</span></div>
            </div>
        </div>

        <!-- Lock Frequencies Item -->
        <div class="new-accordion-item" style="margin:0 16px 12px;background:#1e1e1e;border-radius:24px;overflow:hidden;">
            <div class="accordion-header" onclick="toggleAccordion(this)" style="padding:18px;display:flex;align-items:center;cursor:pointer;">
                <div style="width:40px;height:40px;background:#2a3a8a;border-radius:50%;display:flex;align-items:center;justify-content:center;margin-right:14px;">
                    <span style="font-size:18px;">🔒</span>
                </div>
                <div style="flex:1;">
                    <div style="font-size:17px;font-weight:500;margin-bottom:2px;">Lock Frequencies</div>
                    <div style="font-size:13px;color:#888;">Lock frequencies to the maximum available within system limits.</div>
                </div>
                <div style="width:32px;height:32px;background:#2a2a2a;border-radius:50%;display:flex;align-items:center;justify-content:center;">
                    <span style="color:#888;font-size:12px;transition:transform 0.2s;">▼</span>
                </div>
            </div>
            <div class="accordion-content" style="display:none;padding:0 18px 18px;border-top:1px solid #333;">
                 <label style="display:block;color:#888;font-size:11px;margin:16px 0 6px;">GPU OPP Index</label>
                 <input type="range" id="config-gpu-opp" min="0" max="32" value="0" style="width:100%;margin-bottom:4px;" oninput="document.getElementById('gpu-opp-val').textContent=this.value; saveAppConfig('${pkg}')">
                 <div style="text-align:center;color:#8ab4f8;font-size:12px;"><span id="gpu-opp-val">0</span></div>
            </div>
        </div>

        <!-- Scheduler Priority Item -->
        <div class="new-accordion-item" style="margin:0 16px 24px;background:#1e1e1e;border-radius:24px;overflow:hidden;">
            <div class="accordion-header" onclick="toggleAccordion(this)" style="padding:18px;display:flex;align-items:center;cursor:pointer;">
                <div style="width:40px;height:40px;background:#2a3a8a;border-radius:50%;display:flex;align-items:center;justify-content:center;margin-right:14px;">
                    <span style="font-size:18px;">⏱️</span>
                </div>
                <div style="flex:1;">
                    <div style="font-size:17px;font-weight:500;margin-bottom:2px;">Scheduler Priority</div>
                    <div style="font-size:13px;color:#888;">Android scheduler priority level for target processes.</div>
                </div>
                <div style="width:32px;height:32px;background:#2a2a2a;border-radius:50%;display:flex;align-items:center;justify-content:center;">
                    <span style="color:#888;font-size:12px;transition:transform 0.2s;">▼</span>
                </div>
            </div>
            <div class="accordion-content" style="display:none;padding:0 18px 18px;border-top:1px solid #333;">
                <label style="display:block;color:#888;font-size:11px;margin:16px 0 6px;">VSync Offset (ns)</label>
                <input type="number" id="config-vsync" value="0" style="width:100%;padding:10px;background:#121212;border:1px solid #333;border-radius:12px;color:#fff;margin-bottom:12px;" onchange="saveAppConfig('${pkg}')">
                <label style="display:block;color:#888;font-size:11px;margin-bottom:6px;">EEM Voltage Offset</label>
                <input type="range" id="config-eem" min="-20" max="10" value="0" style="width:100%;margin-bottom:4px;" oninput="document.getElementById('eem-val').textContent=(this.value>0?'+':'')+this.value; saveAppConfig('${pkg}')">
                <div style="text-align:center;color:#ff9f0a;font-size:12px;"><span id="eem-val">0</span></div>
            </div>        </div>

        <!-- Game API Section -->
        <div style="padding:0 16px;margin-bottom:8px;">
            <span style="display:inline-block;background:#1e1e1e;padding:4px 12px;border-radius:12px;font-size:13px;color:#8ab4f8;">Game API</span>
        </div>

        <!-- Downscaling Item (DENSITY-ONLY) -->
        <div class="new-accordion-item" style="margin:0 16px 12px;background:#1e1e1e;border-radius:24px;overflow:hidden;">
            <div class="accordion-header" onclick="toggleAccordion(this)" style="padding:18px;display:flex;align-items:center;cursor:pointer;">
                <div style="width:40px;height:40px;background:#2a3a8a;border-radius:50%;display:flex;align-items:center;justify-content:center;margin-right:14px;">
                    <span style="font-size:18px;">📉</span>
                </div>
                <div style="flex:1;">
                    <div style="font-size:17px;font-weight:500;margin-bottom:2px;">Downscaling</div>
                    <div style="font-size:13px;color:#888;">Scale UI density via wm density (no resolution change).</div>
                </div>
                <div style="width:32px;height:32px;background:#2a2a2a;border-radius:50%;display:flex;align-items:center;justify-content:center;">
                    <span style="color:#888;font-size:12px;transition:transform 0.2s;">▼</span>
                </div>
            </div>
            <div class="accordion-content" style="display:none;padding:0 18px 18px;border-top:1px solid #333;">  
                <label style="display:block;color:#888;font-size:11px;margin-bottom:6px;">Downscale Factor</label>
                <input type="range" id="config-downscale" min="10" max="100" value="100" step="5" style="width:100%;margin-bottom:4px;" oninput="document.getElementById('downscale-val').textContent=(this.value/100).toFixed(1)+'x'; saveAppConfig('${pkg}')">
                <div style="text-align:center;color:#ff9f0a;font-size:12px;"><span id="downscale-val">1.0x</span></div>
            </div>
        </div>

        <!-- Refresh Rate Control Item -->
        <div class="new-accordion-item" style="margin:0 16px 24px;background:#1e1e1e;border-radius:24px;overflow:hidden;">
            <div class="accordion-header" onclick="toggleAccordion(this)" style="padding:18px;display:flex;align-items:center;cursor:pointer;">
                <div style="width:40px;height:40px;background:#2a3a8a;border-radius:50%;display:flex;align-items:center;justify-content:center;margin-right:14px;">
                    <span style="font-size:18px;">🔄</span>
                </div>
                <div style="flex:1;">
                    <div style="font-size:17px;font-weight:500;margin-bottom:2px;">Refresh Rate Control</div>
                    <div style="font-size:13px;color:#888;">Set the refresh rate limit for the app profile.</div>
                </div>
                <div style="width:32px;height:32px;background:#2a2a2a;border-radius:50%;display:flex;align-items:center;justify-content:center;">
                    <span style="color:#888;font-size:12px;transition:transform 0.2s;">▼</span>
                </div>
            </div>
            <div class="accordion-content" style="display:none;padding:0 18px 18px;border-top:1px solid #333;">
                <label style="display:block;color:#888;font-size:11px;margin:16px 0 6px;">Refresh Rate Lock</label>
                <select id="config-refresh-rate" style="width:100%;padding:10px;background:#121212;border:1px solid #333;border-radius:12px;color:#fff;margin-bottom:12px;" onchange="saveAppConfig('${pkg}')"><option value="">Loading modes...</option></select>
            </div>        </div>

        <!-- Custom Shell Command -->
        <div class="new-accordion-item" style="margin:0 16px 24px;background:#1e1e1e;border-radius:24px;overflow:hidden;">
            <div class="accordion-header" onclick="toggleAccordion(this)" style="padding:18px;display:flex;align-items:center;cursor:pointer;">
                <div style="width:40px;height:40px;background:#2a3a8a;border-radius:50%;display:flex;align-items:center;justify-content:center;margin-right:14px;">
                    <span style="font-size:18px;">📜</span>
                </div>
                <div style="flex:1;">
                    <div style="font-size:17px;font-weight:500;margin-bottom:2px;">Custom Shell Command</div>
                    <div style="font-size:13px;color:#888;">Execute custom commands on app launch</div>
                </div>
                <div style="width:32px;height:32px;background:#2a2a2a;border-radius:50%;display:flex;align-items:center;justify-content:center;">
                    <span style="color:#888;font-size:12px;transition:transform 0.2s;">▼</span>
                </div>
            </div>
            <div class="accordion-content" style="display:none;padding:0 18px 18px;border-top:1px solid #333;">
                <label style="display:block;color:#888;font-size:11px;margin:16px 0 6px;">Command</label>
                <textarea id="config-custom-cmd" rows="3" placeholder="e.g., setprop debug.sf.early_phase_offset_ns 0" style="width:100%;padding:10px;background:#121212;border:1px solid #333;border-radius:12px;color:#fff;font-family:monospace;font-size:12px;resize:vertical;" onchange="saveAppConfig('${pkg}')"></textarea>
            </div>
        </div>

        <!-- Graphics Renderer Section -->
        <div class="new-accordion-item" style="margin:0 16px 24px;background:#1e1e1e;border-radius:24px;overflow:hidden;">
            <div class="accordion-header" onclick="toggleAccordion(this)" style="padding:18px;display:flex;align-items:center;cursor:pointer;">
                <div style="width:40px;height:40px;background:#2a3a8a;border-radius:50%;display:flex;align-items:center;justify-content:center;margin-right:14px;">
                    <span style="font-size:18px;">🎨</span>
                </div>
                <div style="flex:1;">
                    <div style="font-size:17px;font-weight:500;margin-bottom:2px;">Graphics Renderer</div>
                    <div style="font-size:13px;color:#888;">Select Vulkan or OpenGL for Skia rendering pipeline.</div>
                </div>
                <div style="width:32px;height:32px;background:#2a2a2a;border-radius:50%;display:flex;align-items:center;justify-content:center;">
                    <span style="color:#888;font-size:12px;transition:transform 0.2s;">▼</span>
                </div>
            </div>
            <div class="accordion-content" style="display:none;padding:0 18px 18px;border-top:1px solid #333;">
                <label style="display:block;color:#888;font-size:11px;margin:16px 0 6px;">Renderer Selection</label>
                <div id="renderer-toggle-container-${pkg}"></div>
                <div style="display:flex;align-items:center;gap:8px;margin-top:12px;padding:10px;background:#121212;border-radius:10px;">
                    <span style="font-size:12px;color:#888;">Status:</span>
                    <span id="renderer-status-${pkg}" style="font-size:12px;font-weight:500;color:#888;">Not checked</span>
                    <button onclick="verifyRenderer('${pkg}'); event.stopPropagation();" 
                        style="margin-left:auto;padding:6px 12px;background:#007AFF;color:#fff;border:none;border-radius:8px;font-size:11px;cursor:pointer;">
                        🔍 Verify
                    </button>
                </div>
                <div style="margin-top:10px;padding:8px 12px;background:rgba(255,159,10,0.1);border-radius:8px;border:1px solid rgba(255,159,10,0.3);">
                    <span style="font-size:11px;color:#ff9f0a;">💡 Tip: Changes require app restart. Clear shader caches automatically.</span>
                </div>            </div>
        </div>

    </div>

    <!-- Footer Actions - DISMISS ONLY -->
    <div style="padding:16px 24px;background:#000;display:flex;justify-content:flex-end;border-top:1px solid #1e1e1e;">
        <button onclick="closeAppConfigPopup()" style="padding:14px 24px;background:#1e1e1e;color:#fff;border:none;border-radius:16px;cursor:pointer;font-weight:600;font-size:15px;">Dismiss</button>
    </div>
    `;
    document.body.appendChild(modal);

    // Inject styles for the new UI elements
    const style = document.createElement('style');
    style.textContent = `
        .new-accordion-item { transition: background 0.2s; }
        .new-accordion-item:hover { background: #252525; }
        .renderer-toggle-btn.active {
            box-shadow: 0 0 0 2px rgba(76, 217, 100, 0.3);
        }
        .renderer-toggle-btn[data-value="skiavk"].active {
            border-color: #4cd964 !important;
            color: #4cd964 !important;
        }
        .renderer-toggle-btn[data-value="skiagl"].active {
            border-color: #ff9500 !important;
            color: #ff9500 !important;
        }
    `;
    document.head.appendChild(style);
    
    // Toggle Logic for Accordions
    window.toggleAccordion = function(header) {
        const content = header.nextElementSibling;
        const arrow = header.querySelector('span:last-child');
        if (content.style.display === "none" || content.style.display === "") {
            content.style.display = "block";
            arrow.style.transform = "rotate(180deg)";
        } else {
            content.style.display = "none";
            arrow.style.transform = "rotate(0deg)";
        }
    };

    // Fetch Refresh Rates
    try {
        const select = document.getElementById('config-refresh-rate');
        const raw = await execFn('/data/adb/modules/MTK_AI/script_runner/display_mode 2>/dev/null', 3000);
        const lines = raw.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        if (select && lines.length > 0) {            select.innerHTML = '<option value="">Default / System</option>';
            lines.forEach((line, idx) => { const opt = document.createElement('option'); opt.value = String(idx); opt.textContent = `Mode ${idx}: ${line}`; select.appendChild(opt); });
        } else if (select) { select.innerHTML = '<option value="">No modes detected</option>'; }
    } catch (e) { const s = document.getElementById('config-refresh-rate'); if (s) s.innerHTML = '<option value="">Script failed</option>'; }

    // Initialize density & load config
    await loadAppConfig(pkg);
    
    // === Initialize Renderer Toggles ===
    try {
        const savedRenderer = await loadAppRenderer(pkg);
        const toggleContainer = document.getElementById(`renderer-toggle-container-${pkg}`);
        if (toggleContainer) {
            toggleContainer.appendChild(createRendererToggles(pkg, savedRenderer, async (value) => {
                await saveAndApplyRenderer(pkg, value);
            }));
        }
    } catch (e) {
        console.warn("Renderer toggle init failed:", e);
    }
}

function toggleConfigSection(header) {
    const content = header.nextElementSibling;
    const arrow = header.querySelector('.collapse-arrow');
    const isExpanded = content.style.display === 'block';
    document.querySelectorAll('#app-config-modal .collapse-content').forEach(c => c.style.display = 'none');
    document.querySelectorAll('#app-config-modal .collapse-arrow').forEach(a => a.textContent = '▼');
    if (!isExpanded) { content.style.display = 'block'; arrow.textContent = '▲'; }
}

async function loadAppConfig(pkg) {
    try {
        const refreshResult = await execFn(`cat ${REFRESH_LOCKS_DIR}/${pkg}.mode 2>/dev/null`);
        if (refreshResult.trim() !== "") { const s = document.getElementById('config-refresh-rate'); if (s) s.value = refreshResult.trim(); }
        
        const downscaleResult = await execFn(`cat ${PERAPP_DIR}/${pkg}.downscale 2>/dev/null`);
        if (downscaleResult.trim()) { const sl = document.getElementById('config-downscale'); const d = document.getElementById('downscale-val'); if (sl) { sl.value = downscaleResult.trim(); if (d) d.textContent = (downscaleResult.trim() / 100).toFixed(1) + 'x'; } }
        const govResult = await execFn(`cat ${PERAPP_DIR}/${pkg}.governor 2>/dev/null`);
        if (govResult.trim()) { const s = document.getElementById('config-governor'); if (s) s.value = govResult.trim(); }
        const cpuResult = await execFn(`cat ${PERAPP_DIR}/${pkg}.cpu_percent 2>/dev/null`);
        if (cpuResult.trim()) { const sl = document.getElementById('config-cpu-limit'); if (sl) { sl.value = cpuResult.trim(); document.getElementById('cpu-limit-val').textContent = cpuResult.trim() + '%'; } }
        const gpuResult = await execFn(`cat ${PERAPP_DIR}/${pkg}.gpu_opp 2>/dev/null`);
        if (gpuResult.trim()) { const sl = document.getElementById('config-gpu-opp'); if (sl) { sl.value = gpuResult.trim(); document.getElementById('gpu-opp-val').textContent = gpuResult.trim(); } }
        const vsyncResult = await execFn(`cat ${CFG_DIR}/vsync_configs/${pkg}.vsync 2>/dev/null`);
        if (vsyncResult.trim()) { const i = document.getElementById('config-vsync'); if (i) i.value = vsyncResult.trim().replace(/\D/g, ''); }
        const eemResult = await execFn(`cat ${PERAPP_DIR}/${pkg}.eem_offset 2>/dev/null`);
        if (eemResult.trim()) { const sl = document.getElementById('config-eem'); if (sl) { sl.value = eemResult.trim(); document.getElementById('eem-val').textContent = (eemResult.trim() > 0 ? '+' : '') + eemResult.trim(); } }
        const cmdResult = await execFn(`cat ${PERAPP_DIR}/${pkg}.cmd 2>/dev/null`);
        if (cmdResult.trim()) { try { const t = document.getElementById('config-custom-cmd'); if (t) t.value = decodeURIComponent(escape(atob(cmdResult.trim()))); } catch (e) { const t = document.getElementById('config-custom-cmd'); if (t) t.value = cmdResult.trim(); } }
        
        // Load renderer preference
        const rendererResult = await execFn(`cat /sdcard/MTK_AI_Engine/threading_configs/${pkg}.renderer 2>/dev/null`);
        if (rendererResult.trim()) {
            const toggleContainer = document.getElementById(`renderer-toggle-container-${pkg}`);
            if (toggleContainer) {
                toggleContainer.querySelectorAll('.renderer-toggle-btn').forEach(btn => {
                    btn.classList.toggle('active', btn.dataset.value === rendererResult.trim());
                    const isActive = btn.classList.contains('active');
                    const color = btn.dataset.value === 'skiavk' ? '#4cd964' : '#ff9500';
                    btn.style.background = isActive ? color + '20' : '#2a2a2c';
                    btn.style.borderColor = isActive ? color : '#3a3a3c';
                    btn.style.color = isActive ? color : '#fff';
                });
            }
        }
    } catch (e) { console.warn('Failed to load app config:', e); }
}

async function saveAppConfig(pkg) {
    try {
        const refreshRate = document.getElementById('config-refresh-rate').value;
        if (refreshRate !== "") await execFn(`mkdir -p ${REFRESH_LOCKS_DIR} && echo "${refreshRate}" > ${REFRESH_LOCKS_DIR}/${pkg}.mode`);
        else await execFn(`rm -f ${REFRESH_LOCKS_DIR}/${pkg}.mode 2>/dev/null`);
        
        const downscaleRaw = document.getElementById('config-downscale').value;
        await execFn(`mkdir -p ${PERAPP_DIR} && echo "${downscaleRaw}" > ${PERAPP_DIR}/${pkg}.downscale`);
        await execFn(`am force-stop ${pkg}`);
        await execFn(`cmd game set --downscale ${(parseInt(downscaleRaw) / 100).toFixed(1)} ${pkg}`);

        const governor = document.getElementById('config-governor').value;
        if (governor) await execFn(`mkdir -p ${PERAPP_DIR} && echo "${governor}" > ${PERAPP_DIR}/${pkg}.governor`);
        const cpuLimit = document.getElementById('config-cpu-limit').value;
        await execFn(`mkdir -p ${PERAPP_DIR} && echo "${cpuLimit}" > ${PERAPP_DIR}/${pkg}.cpu_percent`);
        const gpuOpp = document.getElementById('config-gpu-opp').value;
        await execFn(`mkdir -p ${PERAPP_DIR} && echo "${gpuOpp}" > ${PERAPP_DIR}/${pkg}.gpu_opp`);

        const vsync = document.getElementById('config-vsync').value;
        if (vsync) await execFn(`mkdir -p ${CFG_DIR}/vsync_configs && echo "${vsync}" > ${CFG_DIR}/vsync_configs/${pkg}.vsync`);
        const eem = document.getElementById('config-eem').value;
        await execFn(`mkdir -p ${PERAPP_DIR} && echo "${eem}" > ${PERAPP_DIR}/${pkg}.eem_offset`);

        const customCmd = document.getElementById('config-custom-cmd').value.trim();
        if (customCmd) { const encoded = btoa(unescape(encodeURIComponent(customCmd))); await execFn(`mkdir -p ${PERAPP_DIR} && echo "${encoded}" > ${PERAPP_DIR}/${pkg}.cmd`); }
        else await execFn(`rm -f ${PERAPP_DIR}/${pkg}.cmd 2>/dev/null`);

        showStatus('Configuration saved for ' + pkg, '#32D74B');
    } catch (e) { console.error('Save config failed:', e); showStatus('Failed to save configuration', '#FF453A'); }
}

function closeAppConfigPopup() { const m = document.getElementById('app-config-modal'); if (m) m.remove(); }
function startMonitoring(pkg) { closeAppConfigPopup(); openMonitorPopup(pkg); setTimeout(() => toggleMonitor(), 500); }

async function launchApp(pkg) {
    showStatus('🚀 Launching ' + pkg + '...', '#0A84FF');
    try {
        const dumpsysResult = await execFn(`dumpsys package ${pkg} 2>/dev/null | grep -A 1 "android.intent.action.MAIN" | grep "android.intent.category.LAUNCHER" | awk '{print $4}'`, 3000);
        if (dumpsysResult && dumpsysResult.trim()) {
            const activity = dumpsysResult.trim();
            await execFn(`am start -n ${activity}`, 3000);
            showStatus('✅ Launched: ' + pkg, '#32D74B');
        } else {
            await execFn(`monkey -p ${pkg} -c android.intent.category.LAUNCHER 1 2>/dev/null`, 3000);
            showStatus('✅ Launched (monkey): ' + pkg, '#32D74B');
        }
    } catch (e) {        showStatus('❌ Failed: ' + e.message, '#FF453A');
    }
}

// === SEARCH INIT ===
function initSearch() {
    const existingSearch = document.querySelector('.search-box-pro');
    if (existingSearch) existingSearch.remove();
    const searchContainer = document.createElement('div');
    searchContainer.className = 'search-box-pro';
    searchContainer.style.cssText = 'position:sticky;top:0;z-index:100;background:linear-gradient(180deg,#1c1c1e 95%,transparent);padding:12px 16px 16px 16px;backdrop-filter:blur(10px);';
    searchContainer.innerHTML = `<div style="position:relative;display:flex;align-items:center;gap:10px;"><span style="color:#888;font-size:18px;position:absolute;left:14px;pointer-events:none;">🔍</span><input type="text" id="app-search-input" placeholder="Search apps..." style="width:100%;padding:12px 12px 12px 42px;background:#2c2c2e;border:1px solid #3a3a3c;border-radius:14px;color:#fff;font-size:15px;outline:none;" onfocus="this.style.borderColor='#0A84FF'" onblur="this.style.borderColor='#3a3a3c'"><button id="search-clear-btn" onclick="clearSearch()" style="position:absolute;right:14px;background:#3a3a3c;border:none;color:#fff;cursor:pointer;font-size:14px;width:24px;height:24px;border-radius:50%;display:none;align-items:center;justify-content:center;" onmouseover="this.style.background='#4a4a4c'" onmouseout="this.style.background='#3a3a3c'">✕</button></div>`;
    const appListSection = document.getElementById('app-list-container');
    if (appListSection) appListSection.parentNode.insertBefore(searchContainer, appListSection);
    document.getElementById('app-search-input').addEventListener('input', handleSearchInput);
    document.getElementById('search-clear-btn').addEventListener('input', (e) => { e.target.style.display = e.target.value.length > 0 ? 'flex' : 'none'; });
}

// Initialize
document.addEventListener('DOMContentLoaded', async function() {
    await loadCloudAppNames();
    initSearch();
    loadAppList();
    syncWhitelistFromGameList();
});

// Exports
window.loadAppList = loadAppList;
window.toggleGameList = toggleGameList;
window.openAppConfigPopup = openAppConfigPopup;
window.openMonitorPopup = openMonitorPopup;
window.closeMonitorPopup = closeMonitorPopup;
window.toggleMonitor = toggleMonitor;
window.searchApps = searchApps;
window.closeAppConfigPopup = closeAppConfigPopup;
window.startMonitoring = startMonitoring;
window.toggleConfigSection = toggleConfigSection;
window.saveAppConfig = saveAppConfig;
window.clearSearch = clearSearch;
window.launchApp = launchApp;
window.loadCloudAppNames = loadCloudAppNames;
// Renderer exports
window.applyGlobalRenderer = applyGlobalRenderer;
window.verifyRenderer = verifyRenderer;
window.applyHardCoreFix = applyHardCoreFix;
window.saveAndApplyRenderer = saveAndApplyRenderer;
window.loadAppRenderer = loadAppRenderer;
})();