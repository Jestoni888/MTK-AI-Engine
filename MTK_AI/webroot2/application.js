// application.js - Complete App List Manager with Smart Caching
(function() {
'use strict';

const CFG_DIR = '/sdcard/MTK_AI_Engine';
const GAMELIST_FILE = CFG_DIR + '/game_list.txt';
const PERAPP_DIR = CFG_DIR + '/perapp';
const REFRESH_LOCKS_DIR = CFG_DIR + '/refresh_locks';
const APP_CACHE_FILE = CFG_DIR + '/app_list_cache.json'; // NEW CACHE FILE
const WHITELIST_FILE = CFG_DIR + '/whitelist.txt';

let allApps = [];
let gameList = [];
let currentTargetPkg = '';
let currentMonitorPkg = '';
let monitorInterval = null;
let isMonitorRunning = false;

// Exec function
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

// Show status
function showStatus(msg, color) {
    const el = document.getElementById('debug-msg');
    if (el) {
        el.textContent = msg;
        el.style.color = color || '#fff';
        setTimeout(() => { el.textContent = 'System Ready'; }, 2000);
    }
}

// === AUTO-RESTART MTK AI SERVICE ===
async function restartMTKService() {
    showStatus('🔄 Restarting MTK AI Service...', '#FF9F0A');
    try {
        // 1. Kill existing daemon & child processes
        await execFn('pkill -9 -f "/data/adb/modules/MTK_AI" 2>/dev/null', 2000);
        await new Promise(r => setTimeout(r, 500)); // Brief cleanup delay
        
        // 2. Relaunch service in background
        await execFn(`su -c '
            export PATH="/system/bin:/system/xbin:/sbin:/vendor/bin"
            cd /data/adb/modules/MTK_AI
            nohup sh /data/adb/modules/MTK_AI/service.sh >/dev/null 2>&1 &
            disown
        '`, 3000);
        
        showStatus('✅ Service restarted & configs applied', '#32D74B');
    } catch (e) {
        console.warn('Service restart failed:', e);
        showStatus('⚠️ Config saved. Manual restart may be needed.', '#FFCC00');
    }
}

// Check if package is in whitelist
async function isInWhitelist(pkg) {
    try {
        const result = await execFn(`grep -Fx "${pkg}" ${WHITELIST_FILE} 2>/dev/null`);
        return result.trim() === pkg;
    } catch (e) { return false; }
}

// Add package to whitelist
async function addToWhitelist(pkg) {
    try {
        // Avoid duplicates
        const exists = await isInWhitelist(pkg);
        if (exists) return true;
        await execFn(`mkdir -p ${CFG_DIR} && echo "${pkg}" >> ${WHITELIST_FILE}`);
        return true;
    } catch (e) { console.warn('Whitelist add failed:', e); return false; }
}

// Remove package from whitelist
async function removeFromWhitelist(pkg) {
    try {
        await execFn(`sed -i "/^${pkg}$/d" ${WHITELIST_FILE} 2>/dev/null`);
        return true;
    } catch (e) { console.warn('Whitelist remove failed:', e); return false; }
}

// Load game list
async function loadGameList() {    try {
        const result = await execFn(`cat ${GAMELIST_FILE} 2>/dev/null`);
        gameList = result.split('\n').map(l => l.trim()).filter(l => l);
    } catch (e) {
        gameList = [];
    }
}

// === AUTO-WHITELIST SYNC: Scan all apps, whitelist non-games ===
async function syncWhitelistFromGameList() {
    const WHITELIST_FILE = CFG_DIR + '/whitelist.txt';
    
    showStatus('🔄 Syncing whitelist...', '#0A84FF');
    
    try {
        // 1. Load current game list
        await loadGameList();
        const gameSet = new Set(gameList);
        
        // 2. Load existing whitelist into Set for fast lookup
        const whitelistRaw = await execFn(`cat ${WHITELIST_FILE} 2>/dev/null`);
        const existingWhitelist = new Set(
            whitelistRaw.split('\n').map(l => l.trim()).filter(l => l)
        );
        
        // 3. Get all third-party packages
        const pkgResult = await execFn('pm list packages -3 2>/dev/null');
        const allPkgs = pkgResult.split('\n')
            .map(p => p.replace('package:', '').trim())
            .filter(p => p);
        
        let added = 0, removed = 0;
        const newWhitelist = [];
        
        // 4. Process each app
        for (const pkg of allPkgs) {
            if (gameSet.has(pkg)) {
                // ✅ In game list → REMOVE from whitelist if present
                if (existingWhitelist.has(pkg)) {
                    await execFn(`sed -i "/^${pkg}$/d" ${WHITELIST_FILE} 2>/dev/null`);
                    removed++;
                    console.log(`🎮 Removed from whitelist: ${pkg}`);
                }
            } else {
                // ❌ NOT in game list → ADD to whitelist if missing
                if (!existingWhitelist.has(pkg)) {
                    await execFn(`echo "${pkg}" >> ${WHITELIST_FILE}`);
                    added++;
                    console.log(`🛡️ Whitelisted: ${pkg}`);
                }
                newWhitelist.push(pkg);
            }
        }
        
        // 5. Update UI feedback
        const msg = `✅ Sync complete: +${added} whitelisted, -${removed} removed`;
        showStatus(msg, '#32D74B');
        console.log(msg);
        
        // 6. (Optional) Refresh app list UI if open
        if (allApps.length > 0) {
            allApps.forEach(app => {
                app.isWhitelisted = !gameSet.has(app.pkg);
            });
            renderAppList(allApps);
        }
        
    } catch (e) {
        console.error('Whitelist sync failed:', e);
        showStatus('❌ Sync failed: ' + e.message, '#FF453A');
    }
}

// UPDATED loadAppList with Smart Caching
async function loadAppList() {
    const container = document.getElementById('app-list-container');
    if (!container) return;

    // 1. CHECK CACHE: Try to load from memory first
    const cachedList = localStorage.getItem('mtk_ai_app_list_cache');
    const cachedCount = localStorage.getItem('mtk_ai_app_count');

    try {
        // 2. QUICK COUNT CHECK: This is fast. It counts how many apps you have.
        const countCmd = await execFn('pm list packages -3 | wc -l');
        const currentCount = parseInt(countCmd.trim()) || 0;

        // If the number of apps hasn't changed, load from cache instantly
        if (cachedList && cachedCount == currentCount) {
            console.log("🚀 Loading apps from cache (Instant)");
            allApps = JSON.parse(cachedList);
            
            // Just refresh the "Game List" status (in case you added/removed a game)
            await loadGameList();
            allApps.forEach(app => {
                app.isInGameList = gameList.includes(app.pkg);
            });
            
            renderAppList(allApps);
            return; // Stop here! No need to scan again.
        }
    } catch (e) {
        console.log("Cache check failed, reloading list.");
    }

    // 3. FULL SCAN: Only runs if you installed/uninstalled an app
    container.innerHTML = '<div style="text-align:center;padding:40px;color:#888;">⏳ Scanning Installed Apps...</div>';

    try {
        await loadGameList();
        
        const result = await execFn('pm list packages -3 2>/dev/null');
        const packages = result.split('\n').map(p => p.replace('package:', '').trim()).filter(p => p);
        
        // Get app info (This is the slow part, so we only do it when necessary)
        allApps = await Promise.all(packages.map(async pkg => {
            try {
                const labelResult = await execFn(`dumpsys package ${pkg} 2>/dev/null | grep -m1 "label=" | cut -d'=' -f2`);
                const label = labelResult.trim() || pkg.split('.').pop();
                return { pkg, label, isInGameList: gameList.includes(pkg) };
            } catch (e) {
                return { pkg, label: pkg.split('.').pop(), isInGameList: gameList.includes(pkg) };
            }
        }));
        
        // Sort: game list first, then alphabetically
        allApps.sort((a, b) => {
            if (a.isInGameList && !b.isInGameList) return -1;
            if (!a.isInGameList && b.isInGameList) return 1;
            return a.label.localeCompare(b.label);
        });
        
        // SAVE TO CACHE for next time
        localStorage.setItem('mtk_ai_app_list_cache', JSON.stringify(allApps));
        localStorage.setItem('mtk_ai_app_count', packages.length.toString());

        renderAppList(allApps);
        
    } catch (e) {
        container.innerHTML = '<div style="text-align:center;padding:40px;color:#ff453a;">❌ Failed to load apps<br><small>' + e.message + '</small></div>';
    }
}

// Render app list
function renderAppList(apps) {
    const container = document.getElementById('app-list-container');        
    if (!container) return;
    
    if (apps.length === 0) {
        container.innerHTML = '<div style="text-align:center;padding:40px;color:#888;">No apps found</div>';
        return;
    }
    
    let html = '';
    let lastSection = null;
    
    apps.forEach(app => {
        const section = app.isInGameList ? 'game-list' : 'available';
        
        // Add section divider
        if (section !== lastSection) {
            lastSection = section;
            const count = apps.filter(a => a.isInGameList).length;
            if (section === 'game-list') {
                html += `<div class="section-divider added">📋 In Game List (${count})</div>`;
            } else {
                html += `<div class="section-divider">📱 Available Apps (${apps.filter(a => !a.isInGameList).length})</div>`;
            }
        }
        
        html += `
             <div class="list-item" data-pkg="${app.pkg}">
                 <div class="item-center">
                     <img src="ksu://icon/${app.pkg}" onerror="this.src='image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCI+PHJlY3Qgd2lkdGg9IjQwIiBoZWlnaHQ9IjQwIiBmaWxsPSIjMzMzIi8+PHRleHQgeD0iMjAiIHk9IjI1IiBmb250LXNpemU9IjIwIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmaWxsPSIjZmZmIj7wn5mFPC90ZXh0Pjwvc3ZnPg=='" style="width:40px;height:40px;border-radius:10px;">
                     <div class="item-info">
                         <div class="item-title">${app.label}</div>
                         <div class="item-desc">${app.pkg}</div>
                     </div>
                 </div>
                 <div class="item-settings">
                     <button onclick="openMonitorPopup('${app.pkg}')" title="Monitor" style="background:rgba(76,217,100,0.2);color:#4cd964;border:none;width:34px;height:34px;border-radius:8px;cursor:pointer;font-size:15px;">📊</button>
                     <button onclick="openAppConfigPopup('${app.pkg}')" title="Configure" style="background:rgba(10,132,255,0.2);color:#0A84FF;border:none;width:34px;height:34px;border-radius:8px;cursor:pointer;font-size:15px;">⚙️</button>
                 </div>
                 <div class="item-action">
                     <button onclick="toggleGameList('${app.pkg}')" style="background:${app.isInGameList ? '#FF453A' : '#0A84FF'};color:#fff;border:none;padding:6px 12px;border-radius:6px;cursor:pointer;font-size:10px;font-weight:700;text-transform:uppercase;">${app.isInGameList ? 'REMOVE' : 'ADD'}</button>
                 </div>
             </div>
        `;    });
    
    container.innerHTML = html;
}

// Toggle game list - AUTO WHITELIST SYNC
async function toggleGameList(pkg) {
    try {
        const app = allApps.find(a => a.pkg === pkg);
        if (!app) return;
        
        if (app.isInGameList) {
            // === REMOVING FROM GAME LIST → AUTO-ADD TO WHITELIST ===
            gameList = gameList.filter(p => p !== pkg);
            await execFn(`sed -i "/^${pkg}$/d" ${GAMELIST_FILE} 2>/dev/null`);
            
            // Auto-add to whitelist (skip if already there)
            await addToWhitelist(pkg);
            
            showStatus('Removed: ' + app.label + ' → Whitelisted', '#FF453A');
        } else {
            // === ADDING TO GAME LIST → AUTO-REMOVE FROM WHITELIST ===
            gameList.push(pkg);
            await execFn(`echo "${pkg}" >> ${GAMELIST_FILE}`);
            
            // Auto-remove from whitelist
            await removeFromWhitelist(pkg);
            
            showStatus('Added: ' + app.label + ' → Game List', '#32D74B');
        }
        
        // Update local data immediately
        app.isInGameList = !app.isInGameList;
        
        // Re-sort array so "In Game List" items stay at the top
        allApps.sort((a, b) => {
            if (a.isInGameList && !b.isInGameList) return -1;
            if (!a.isInGameList && b.isInGameList) return 1;
            return a.label.localeCompare(b.label);
        });

        // Re-render UI instantly
        renderAppList(allApps);
        await restartMTKService();
    } catch (e) {
        showStatus('Failed to update', '#FF453A');
    }
}

// Search apps
function searchApps(query) {
    const q = query.toLowerCase().trim();
    if (!q) {
        renderAppList(allApps);
        return;
    }
    
    const filtered = allApps.filter(app => 
        app.label.toLowerCase().includes(q) || 
        app.pkg.toLowerCase().includes(q)
    );
    renderAppList(filtered);
}

// Open monitor popup
function openMonitorPopup(pkg) {
    currentMonitorPkg = pkg;
    const app = allApps.find(a => a.pkg === pkg);
    if (!app) return;
    
    const modal = document.createElement('div');    modal.id = 'monitor-popup';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:10000;display:flex;align-items:center;justify-content:center;padding:10px;';
    
    modal.innerHTML = `
         <div style="background:#1c1c1e;border-radius:20px;width:100%;max-width:420px;max-height:85vh;overflow:hidden;display:flex;flex-direction:column;">
             <div style="padding:20px;border-bottom:1px solid #333;display:flex;justify-content:space-between;align-items:center;">
                 <div>
                     <h3 style="margin:0;color:#fff;font-size:18px;">Session Monitor</h3>
                     <small style="color:#888;font-family:monospace;">${pkg}</small>
                 </div>
                 <button onclick="closeMonitorPopup()" style="background:none;border:none;color:#888;font-size:28px;cursor:pointer;line-height:1;">&times;</button>
             </div>
            
             <div style="flex:1;overflow-y:auto;padding:20px;">
                 <div class="stats-grid" style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:20px;">
                     <div class="stat-box" style="background:rgba(0,0,0,0.3);padding:12px 5px;border-radius:12px;text-align:center;">
                         <span class="stat-icon">⚡</span>
                         <span id="stat-avg-power" class="stat-value" style="font-size:1rem;font-weight:bold;color:#ffcc00;">--</span>
                         <span class="stat-label" style="font-size:0.65rem;color:#aaa;">Power</span>
                     </div>
                     <div class="stat-box" style="background:rgba(0,0,0,0.3);padding:12px 5px;border-radius:12px;text-align:center;">
                         <span class="stat-icon">🌡️</span>
                         <span id="stat-avg-temp" class="stat-value" style="font-size:1rem;font-weight:bold;color:#ff6b6b;">--</span>
                         <span class="stat-label" style="font-size:0.65rem;color:#aaa;">Temp</span>
                     </div>
                     <div class="stat-box" style="background:rgba(0,0,0,0.3);padding:12px 5px;border-radius:12px;text-align:center;">
                         <span class="stat-icon">🎮</span>
                         <span id="stat-avg-fps" class="stat-value" style="font-size:1rem;font-weight:bold;color:#4cd964;">--</span>
                         <span class="stat-label" style="font-size:0.65rem;color:#aaa;">FPS</span>
                     </div>
                 </div>
                
                 <div class="details-row" style="display:flex;justify-content:space-between;font-size:0.75rem;color:#888;margin-bottom:20px;padding:10px 0;border-top:1px solid rgba(255,255,255,0.05);">
                     <span>Samples: <span id="stat-samples">0</span></span>
                     <span>Last: <span id="stat-time">--:--:--</span></span>
                 </div>
                
                 <div id="monitor-status" style="text-align:center;color:#888;margin-bottom:20px;">Ready</div>
                
                 <div class="action-buttons" style="display:flex;gap:10px;">
                     <button id="btn-toggle-monitor" onclick="toggleMonitor()" style="flex:1;padding:12px;background:linear-gradient(90deg,#007bff,#0056b3);color:#fff;border:none;border-radius:8px;font-weight:bold;cursor:pointer;">▶️ Start Monitor</button>
                     <button onclick="closeMonitorPopup()" style="flex:1;padding:12px;background:#3a3a3c;color:#fff;border:none;border-radius:8px;font-weight:bold;cursor:pointer;">Close</button>
                 </div>
             </div>
         </div>
    `;
    
    document.body.appendChild(modal);
}
// Close monitor popup
function closeMonitorPopup() {
    const modal = document.getElementById('monitor-popup');
    if (modal) {
        modal.remove();
        if (monitorInterval) {
            clearInterval(monitorInterval);
            monitorInterval = null;
        }
        isMonitorRunning = false;
    }
}

// Toggle monitor
async function toggleMonitor() {
    const btn = document.getElementById('btn-toggle-monitor');
    const status = document.getElementById('monitor-status');
    
    if (!currentMonitorPkg) return;
    
    if (isMonitorRunning) {
        isMonitorRunning = false;
        btn.innerHTML = '▶️ Start Monitor';
        btn.style.background = 'linear-gradient(90deg,#007bff,#0056b3)';
        status.textContent = '⏹️ Stopped';
        status.style.color = '#ff9f0a';
        
        await execFn(`rm -f /sdcard/MTK_AI_Engine/enable_monitor`);
        
        if (monitorInterval) {
            clearInterval(monitorInterval);
            monitorInterval = null;
        }
    } else {
        isMonitorRunning = true;
        btn.innerHTML = '⏹️ Stop Monitor';
        btn.style.background = '#ff453a';
        status.textContent = '✅ Monitoring...';
        status.style.color = '#4cd964';
        
        await execFn(`mkdir -p /sdcard/MTK_AI_Engine && echo '${currentMonitorPkg}' > /sdcard/MTK_AI_Engine/active_monitor_pkg.txt && touch /sdcard/MTK_AI_Engine/enable_monitor`);
        
        monitorInterval = setInterval(readStatsFile, 3000);
    }
}

// Read stats file
async function readStatsFile() {
     if (!currentMonitorPkg) return;
        try {
        const result = await execFn(`cat /sdcard/MTK_AI_Engine/stats_${currentMonitorPkg}.txt 2>/dev/null`);
        if (!result || result.trim() === '') return;
        
        const lines = result.split('\n');
        const stats = {};            
        lines.forEach(line => {
            const parts = line.split(':');
            if (parts.length >= 2) {
                stats[parts[0].trim()] = parts.slice(1).join(':').trim();
            }
        });
        
        const mapping = {
            'Avg_Power': 'stat-avg-power',
            'Avg_Temp': 'stat-avg-temp',
            'Avg_FPS': 'stat-avg-fps',
            'Samples': 'stat-samples'
        };
        
        for (const [key, id] of Object.entries(mapping)) {
            const el = document.getElementById(id);
            if (el && stats[key]) {
                el.textContent = stats[key];
            }
        }
        
        const timeEl = document.getElementById('stat-time');
        if (timeEl && stats['Timestamp']) {
            timeEl.textContent = stats['Timestamp'].split(' ')[1] || '--:--:--';
        }
        
    } catch (e) {
        console.warn('Read stats failed:', e);
    }
}

// Open app config popup
async function openAppConfigPopup(pkg) {
    currentTargetPkg = pkg;
    const app = allApps.find(a => a.pkg === pkg);
    if (!app) return;
    
    const modal = document.createElement('div');
    modal.id = 'app-config-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:10000;display:flex;align-items:center;justify-content:center;padding:10px;';
    
    modal.innerHTML = `
         <div style="background:#1c1c1e;border-radius:20px;width:100%;max-width:480px;max-height:85vh;overflow:hidden;display:flex;flex-direction:column;">
             <div style="padding:20px;border-bottom:1px solid #333;display:flex;justify-content:space-between;align-items:center;">                 <div>
                     <h3 style="margin:0;color:#fff;font-size:18px;">Per-App Configuration</h3>
                     <small style="color:#888;font-family:monospace;">${pkg}</small>
                 </div>
                 <button onclick="closeAppConfigPopup()" style="background:none;border:none;color:#888;font-size:28px;cursor:pointer;line-height:1;">&times;</button>
             </div>
            
             <div style="flex:1;overflow-y:auto;padding:10px;">
                 <div class="collapse-section" style="margin-bottom:10px;">
                     <div class="collapse-header" onclick="toggleConfigSection(this)" style="background:rgba(255,255,255,0.05);padding:14px 16px;border-radius:12px;cursor:pointer;display:flex;align-items:center;gap:10px;">
                         <span style="font-size:18px;">📱</span>
                         <span style="flex:1;color:#fff;font-weight:600;">Display & Refresh</span>
                         <span class="collapse-arrow" style="color:#888;font-size:12px;">▼</span>
                     </div>
                     <div class="collapse-content" style="display:none;padding:14px 16px;">
                         <div style="margin-bottom:12px;">
                             <label style="display:block;color:#888;font-size:11px;margin-bottom:6px;">Refresh Rate Lock</label>
                             <!-- DYNAMIC PLACEHOLDER -->
<select id="config-refresh-rate" style="width:100%;padding:10px;background:rgba(0,0,0,0.3);border:1px solid #444;border-radius:8px;color:#fff;">
    <option value="">Loading modes...</option>
</select>
                         </div>
                         <div style="margin-bottom:12px;">
                             <label style="display:block;color:#888;font-size:11px;margin-bottom:6px;">Resolution Scaling</label>
                             <input type="range" id="config-scaling" min="50" max="200" value="100" style="width:100%;" oninput="document.getElementById('scaling-val').textContent=this.value+'%'">
                             <div style="text-align:center;color:#0A84FF;font-size:11px;margin-top:4px;"><span id="scaling-val">100%</span></div>
                         </div>
                     </div>
                 </div>
                
                 <div class="collapse-section" style="margin-bottom:10px;">
                     <div class="collapse-header" onclick="toggleConfigSection(this)" style="background:rgba(255,255,255,0.05);padding:14px 16px;border-radius:12px;cursor:pointer;display:flex;align-items:center;gap:10px;">
                         <span style="font-size:18px;">⚡</span>
                         <span style="flex:1;color:#fff;font-weight:600;">CPU & Performance</span>
                         <span class="collapse-arrow" style="color:#888;font-size:12px;">▼</span>
                     </div>
                     <div class="collapse-content" style="display:none;padding:14px 16px;">
                         <div style="margin-bottom:12px;">
                             <label style="display:block;color:#888;font-size:11px;margin-bottom:6px;">CPU Governor</label>
                             <select id="config-governor" style="width:100%;padding:10px;background:rgba(0,0,0,0.3);border:1px solid #444;border-radius:8px;color:#fff;">
                                 <option value="">Default</option>
                                 <option value="performance">Performance</option>
                                 <option value="powersave">Powersave</option>
                                 <option value="schedutil">Schedutil</option>
                             </select>
                         </div>
                         <div style="margin-bottom:12px;">                             <label style="display:block;color:#888;font-size:11px;margin-bottom:6px;">CPU Max Limit</label>
                             <input type="range" id="config-cpu-limit" min="30" max="100" value="100" style="width:100%;" oninput="document.getElementById('cpu-limit-val').textContent=this.value+'%'">
                             <div style="text-align:center;color:#0A84FF;font-size:11px;margin-top:4px;"><span id="cpu-limit-val">100%</span></div>
                         </div>
                     </div>
                 </div>
                
                 <div class="collapse-section" style="margin-bottom:10px;">
                     <div class="collapse-header" onclick="toggleConfigSection(this)" style="background:rgba(255,255,255,0.05);padding:14px 16px;border-radius:12px;cursor:pointer;display:flex;align-items:center;gap:10px;">
                         <span style="font-size:18px;">🎮</span>
                         <span style="flex:1;color:#fff;font-weight:600;">GPU Frequency</span>
                         <span class="collapse-arrow" style="color:#888;font-size:12px;">▼</span>
                     </div>
                     <div class="collapse-content" style="display:none;padding:14px 16px;">
                         <div style="margin-bottom:12px;">
                             <label style="display:block;color:#888;font-size:11px;margin-bottom:6px;">GPU OPP Index</label>
                             <input type="range" id="config-gpu-opp" min="0" max="32" value="0" style="width:100%;" oninput="document.getElementById('gpu-opp-val').textContent=this.value">
                             <div style="text-align:center;color:#0A84FF;font-size:11px;margin-top:4px;"><span id="gpu-opp-val">0</span></div>
                         </div>
                     </div>
                 </div>
                
                 <div class="collapse-section" style="margin-bottom:10px;">
                     <div class="collapse-header" onclick="toggleConfigSection(this)" style="background:rgba(255,255,255,0.05);padding:14px 16px;border-radius:12px;cursor:pointer;display:flex;align-items:center;gap:10px;">
                         <span style="font-size:18px;">🎯</span>
                         <span style="flex:1;color:#fff;font-weight:600;">Latency & Voltage</span>
                         <span class="collapse-arrow" style="color:#888;font-size:12px;">▼</span>
                     </div>
                     <div class="collapse-content" style="display:none;padding:14px 16px;">
                         <div style="margin-bottom:12px;">
                             <label style="display:block;color:#888;font-size:11px;margin-bottom:6px;">VSync Offset (ns)</label>
                             <input type="number" id="config-vsync" value="0" style="width:100%;padding:10px;background:rgba(0,0,0,0.3);border:1px solid #444;border-radius:8px;color:#fff;">
                         </div>
                         <div style="margin-bottom:12px;">
                             <label style="display:block;color:#888;font-size:11px;margin-bottom:6px;">EEM Voltage Offset</label>
                             <input type="range" id="config-eem" min="-20" max="10" value="0" style="width:100%;" oninput="document.getElementById('eem-val').textContent=(this.value>0?'+':'')+this.value">
                             <div style="text-align:center;color:#FF9F0A;font-size:11px;margin-top:4px;"><span id="eem-val">0</span></div>
                         </div>
                     </div>
                 </div>
                
                 <div class="collapse-section" style="margin-bottom:10px;">
                     <div class="collapse-header" onclick="toggleConfigSection(this)" style="background:rgba(255,255,255,0.05);padding:14px 16px;border-radius:12px;cursor:pointer;display:flex;align-items:center;gap:10px;">
                         <span style="font-size:18px;">📜</span>
                         <span style="flex:1;color:#fff;font-weight:600;">Custom Shell Command</span>
                         <span class="collapse-arrow" style="color:#888;font-size:12px;">▼</span>
                     </div>
                     <div class="collapse-content" style="display:none;padding:14px 16px;">
                         <div style="margin-bottom:12px;">
                             <label style="display:block;color:#888;font-size:11px;margin-bottom:6px;">Command (executed on app launch)</label>                             <textarea id="config-custom-cmd" rows="3" placeholder="e.g., setprop debug.sf.early_phase_offset_ns 0" style="width:100%;padding:10px;background:rgba(0,0,0,0.3);border:1px solid #444;border-radius:8px;color:#fff;font-family:monospace;font-size:11px;resize:vertical;"></textarea>
                         </div>
                     </div>
                 </div>
                
                 <div class="collapse-section" style="margin-bottom:10px;">
                     <div class="collapse-header" onclick="toggleConfigSection(this)" style="background:rgba(255,255,255,0.05);padding:14px 16px;border-radius:12px;cursor:pointer;display:flex;align-items:center;gap:10px;">
                         <span style="font-size:18px;">📊</span>
                         <span style="flex:1;color:#fff;font-weight:600;">Session Monitoring</span>
                         <span class="collapse-arrow" style="color:#888;font-size:12px;">▼</span>
                     </div>
                     <div class="collapse-content" style="display:none;padding:14px 16px;">
                         <div style="text-align:center;padding:20px;color:#888;">
                             <div style="font-size:40px;margin-bottom:10px;">📊</div>
                             <div>Monitor performance metrics during app usage</div>
                             <button onclick="startMonitoring('${pkg}')" style="margin-top:15px;padding:10px 20px;background:#0A84FF;color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:600;">Start Monitoring</button>
                         </div>
                     </div>
                 </div>
             </div>
            
             <div style="padding:16px;border-top:1px solid #333;display:flex;gap:10px;">
                 <button onclick="saveAppConfig('${pkg}')" style="flex:1;padding:12px;background:#32D74B;color:#000;border:none;border-radius:10px;cursor:pointer;font-weight:700;">Save Configuration</button>
                 <button onclick="closeAppConfigPopup()" style="flex:1;padding:12px;background:#3a3a3c;color:#fff;border:none;border-radius:10px;cursor:pointer;font-weight:700;">Dismiss</button>
             </div>
         </div>
    `;
    
    document.body.appendChild(modal);

// 🔥 DYNAMIC REFRESH RATE MODE LOADER
try {
    const select = document.getElementById('config-refresh-rate');
    // Run script with 3s timeout
    const raw = await execFn('/data/adb/modules/MTK_AI/script_runner/display_mode 2>/dev/null', 3000);
    const lines = raw.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    
    if (select && lines.length > 0) {
        select.innerHTML = '<option value="">Default / System</option>';
        lines.forEach((line, idx) => {
            const opt = document.createElement('option');
            opt.value = String(idx); // Save as "0", "1", "2"...
            opt.textContent = `Mode ${idx}: ${line}`;
            select.appendChild(opt);
        });
    } else if (select) {
        select.innerHTML = '<option value="">No modes detected</option>';
    }
} catch (e) {
    const select = document.getElementById('config-refresh-rate');
    if (select) select.innerHTML = '<option value="">Script failed</option>';
}

// Load saved per-app values AFTER modes are ready
    await loadAppConfig(pkg);
}

// Toggle config section
function toggleConfigSection(header) {
     const content = header.nextElementSibling;
    const arrow = header.querySelector('.collapse-arrow');
    const isExpanded = content.style.display === 'block';
    
    document.querySelectorAll('#app-config-modal .collapse-content').forEach(c => c.style.display = 'none');
    document.querySelectorAll('#app-config-modal .collapse-arrow').forEach(a => a.textContent = '▼');
    
    if (!isExpanded) {
        content.style.display = 'block';
        arrow.textContent = '▲';
    }
}

// Load app config
async function loadAppConfig(pkg) {    
    try {
        // Refresh Rate (Index-based)
        const refreshResult = await execFn(`cat ${REFRESH_LOCKS_DIR}/${pkg}.mode 2>/dev/null`);
        if (refreshResult.trim() !== "") {
            const select = document.getElementById('config-refresh-rate');
            if (select) select.value = refreshResult.trim();
        }

        const scaleResult = await execFn(`cat ${PERAPP_DIR}/${pkg}.scale 2>/dev/null`);
        if (scaleResult.trim()) {
            const slider = document.getElementById('config-scaling');
            if (slider) {
                slider.value = scaleResult.trim();
                document.getElementById('scaling-val').textContent = scaleResult.trim() + '%';
            }
        }
        
        const govResult = await execFn(`cat ${PERAPP_DIR}/${pkg}.governor 2>/dev/null`);
        if (govResult.trim()) {
            const select = document.getElementById('config-governor');
            if (select) select.value = govResult.trim();
        }
        
        const cpuResult = await execFn(`cat ${PERAPP_DIR}/${pkg}.cpu_percent 2>/dev/null`);
        if (cpuResult.trim()) {
            const slider = document.getElementById('config-cpu-limit');
            if (slider) {
                slider.value = cpuResult.trim();
                document.getElementById('cpu-limit-val').textContent = cpuResult.trim() + '%';
            }
        }
        
        const gpuResult = await execFn(`cat ${PERAPP_DIR}/${pkg}.gpu_opp 2>/dev/null`);
        if (gpuResult.trim()) {
            const slider = document.getElementById('config-gpu-opp');
            if (slider) {
                slider.value = gpuResult.trim();
                document.getElementById('gpu-opp-val').textContent = gpuResult.trim();
            }
        }
        
        const vsyncResult = await execFn(`cat ${CFG_DIR}/vsync_configs/${pkg}.vsync 2>/dev/null`);
        if (vsyncResult.trim()) {
            const input = document.getElementById('config-vsync');
            if (input) input.value = vsyncResult.trim().replace(/\D/g, '');
        }
        
        const eemResult = await execFn(`cat ${PERAPP_DIR}/${pkg}.eem_offset 2>/dev/null`);
        if (eemResult.trim()) {
            const slider = document.getElementById('config-eem');
            if (slider) {                
                slider.value = eemResult.trim();
                document.getElementById('eem-val').textContent = (eemResult.trim() > 0 ? '+' : '') + eemResult.trim();
            }
        }
        
        const cmdResult = await execFn(`cat ${PERAPP_DIR}/${pkg}.cmd 2>/dev/null`);
        if (cmdResult.trim()) {
            try {
                const textarea = document.getElementById('config-custom-cmd');
                if (textarea) textarea.value = decodeURIComponent(escape(atob(cmdResult.trim())));
            } catch (e) {
                const textarea = document.getElementById('config-custom-cmd');
                if (textarea) textarea.value = cmdResult.trim();
            }
        }
    } catch (e) {
        console.warn('Failed to load app config:', e);
    }
}

// Save app config
async function saveAppConfig(pkg) {
    try {
        // Refresh Rate (Save Index: 0, 1, 2...)
        const refreshRate = document.getElementById('config-refresh-rate').value;
        if (refreshRate !== "") {
            await execFn(`mkdir -p ${REFRESH_LOCKS_DIR} && echo "${refreshRate}" > ${REFRESH_LOCKS_DIR}/${pkg}.mode`);
        } else {
            await execFn(`rm -f ${REFRESH_LOCKS_DIR}/${pkg}.mode 2>/dev/null`);
        }

        const scaling = document.getElementById('config-scaling').value;
        await execFn(`mkdir -p ${PERAPP_DIR} && echo "${scaling}" > ${PERAPP_DIR}/${pkg}.scale`);
        
        const governor = document.getElementById('config-governor').value;
        if (governor) {
            await execFn(`mkdir -p ${PERAPP_DIR} && echo "${governor}" > ${PERAPP_DIR}/${pkg}.governor`);
        }
        
        const cpuLimit = document.getElementById('config-cpu-limit').value;
        await execFn(`mkdir -p ${PERAPP_DIR} && echo "${cpuLimit}" > ${PERAPP_DIR}/${pkg}.cpu_percent`);
        
        const gpuOpp = document.getElementById('config-gpu-opp').value;
        await execFn(`mkdir -p ${PERAPP_DIR} && echo "${gpuOpp}" > ${PERAPP_DIR}/${pkg}.gpu_opp`);
        
        const vsync = document.getElementById('config-vsync').value;
        if (vsync) {
            await execFn(`mkdir -p ${CFG_DIR}/vsync_configs && echo "${vsync}" > ${CFG_DIR}/vsync_configs/${pkg}.vsync`);
        }
        
        const eem = document.getElementById('config-eem').value;
        await execFn(`mkdir -p ${PERAPP_DIR} && echo "${eem}" > ${PERAPP_DIR}/${pkg}.eem_offset`);        
        
        const customCmd = document.getElementById('config-custom-cmd').value.trim();
        if (customCmd) {
            const encoded = btoa(unescape(encodeURIComponent(customCmd)));
            await execFn(`mkdir -p ${PERAPP_DIR} && echo "${encoded}" > ${PERAPP_DIR}/${pkg}.cmd`);
        } else {
            await execFn(`rm -f ${PERAPP_DIR}/${pkg}.cmd 2>/dev/null`);
        }
        
        showStatus('Configuration saved for ' + pkg, '#32D74B');
        closeAppConfigPopup();
        
    } catch (e) {
        console.error('Save config failed:', e);
        showStatus('Failed to save configuration', '#FF453A');
    }
}

// Close config popup
function closeAppConfigPopup() {
    const modal = document.getElementById('app-config-modal');
    if (modal) modal.remove();
}

// Start monitoring
function startMonitoring(pkg) {
    closeAppConfigPopup();
    openMonitorPopup(pkg);
    setTimeout(() => { toggleMonitor(); }, 500);
}

// Initialize search
function initSearch() {
    const searchInput = document.getElementById('app-search-input');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            searchApps(e.target.value);
        });
    }
}

// Initialize on load
document.addEventListener('DOMContentLoaded', function() {
    if (!document.getElementById('app-search-input')) {
        const searchContainer = document.createElement('div');
        searchContainer.className = 'search-box-pro';
        searchContainer.innerHTML = `
             <span class="search-icon">🔍</span>
             <input type="text" id="app-search-input" placeholder="Search apps by name or package...">
             <button id="search-clear-btn" onclick="document.getElementById('app-search-input').value='';searchApps('');this.classList.remove('visible')">✕</button>        `;
        
        const appListSection = document.querySelector('.section-header');
        if (appListSection) {
            appListSection.parentNode.insertBefore(searchContainer, appListSection.nextSibling);
        }
    }
    
    initSearch();
    loadAppList();
    syncWhitelistFromGameList()
});

// Export functions
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
})();