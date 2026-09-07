// dex2oat.js - ART Compiler & JIT Manager (FULL + Accurate Dexopt Info + Manual Cleanup)
(function() {
'use strict';
const CONFIG_FILE = '/sdcard/MTK_AI_Engine/dex2oat.conf';
const APP_OVERRIDES_FILE = '/sdcard/MTK_AI_Engine/dex2oat-apps.json';
const LOG_FILE = '/sdcard/MTK_AI_Engine/dex2oat.log';
const FILTERS = ['speed', 'speed-profile', 'quicken', 'verify', 'interpret-only', 'space', 'space-profile', 'time', 'everything'];
const ADVANCED_FLAGS = {
    '--compile-pic': 'Generate position-independent code',
    '--inline-depth=4': 'Maximum inlining depth',
    '--max-inline-inline-depth=4': 'Deep inlining for hot methods',
    '--resolve-startup-strings=true': 'Pre-resolve strings in startup methods',
    '--generate-mini-debug-info=true': 'Minimal debug info for backtraces'
};
const PROFILES = {
    'balanced': { name: '⚖️ Balanced (Default)', filter: 'speed-profile', jit: true, bgDexopt: true, threads: 4, heapXms: '256m', heapXmx: '512m', flags: [] },
    'performance': { name: '🚀 Performance Mode', filter: 'speed', jit: true, bgDexopt: true, threads: 8, heapXms: '512m', heapXmx: '1024m', flags: ['--resolve-startup-strings=true'] },
    'full': { name: '🔥 FULL COMPILER', filter: 'everything', jit: false, bgDexopt: false, threads: 16, heapXms: '1024m', heapXmx: '2048m', flags: ['--resolve-startup-strings=true', '--generate-mini-debug-info=true'] },
    'battery': { name: '🔋 Battery Saver', filter: 'space-profile', jit: true, bgDexopt: false, threads: 2, heapXms: '128m', heapXmx: '256m', flags: [] }
};
// State
let currentFilter = 'speed-profile';
let jitEnabled = true;
let bgDexoptEnabled = true;
let currentProfile = 'balanced';
let customThreads = 4;
let customHeapXms = '256m';
let customHeapXmx = '512m';
let selectedFlags = [];
let androidVersion = 13;
let appOverrides = {};
let installedApps = [];
let appsLoaded = false;
let forceCleanEnabled = false;
let selectedAppForInfo = null;

// 🔧 Robust exec wrapper
const execFn = window.exec || async function(cmd, timeout = 30000) {
    return new Promise(resolve => {
        const cb = 'dex_exec_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);
        const t = setTimeout(function() { delete window[cb]; log('⚠️ Timeout: ' + cmd.substring(0, 100) + '...'); resolve(''); }, timeout);
        window[cb] = function(_, res) { clearTimeout(t); delete window[cb]; resolve(res || ''); };
        if (window.ksu && typeof ksu.exec === 'function') { try { ksu.exec(cmd, 'window.' + cb); } catch(e) { clearTimeout(t); delete window[cb]; resolve(''); } }
        else { clearTimeout(t); resolve(''); }
    });
};

// 📝 Logging helper    
function log(msg) {
    console.log('[DEX2OAT] ' + msg);
    execFn('echo "' + msg.replace(/"/g, '') + '" >> ' + LOG_FILE + ' 2>/dev/null');
}

// 🔍 Detect Android version
async function detectAndroidVersion() {
    try {
        const ver = await execFn('getprop ro.build.version.release', 5000);
        androidVersion = parseInt(ver.trim().split('.')[0]) || 13;
        log('📱 Android ' + androidVersion + ' detected');
        return androidVersion;
    } catch { return 13; }
}

// 🛡️ Safe setprop
function shellQuote(str) {
    str = String(str);
    if (!str) return "''";
    if (/^[a-zA-Z0-9._\-:@%/+=,]+$/.test(str)) return str;
    return "'" + str.split("'").join("'\"'\"'") + "'";
}

async function safeSetprop(prop, value, fallback) {
    try {
        const cmd = 'setprop ' + shellQuote(prop) + ' ' + shellQuote(value);
        const res = await execFn('su -c "' + cmd + '" 2>&1', 5000);
        if (res && (res.toLowerCase().includes('error') || res.toLowerCase().includes('failed'))) {
            log('⚠️ setprop failed: ' + prop + '=' + value);
            if (fallback !== undefined && fallback !== null) {
                await execFn('su -c "setprop ' + shellQuote(prop) + ' ' + shellQuote(fallback) + '" 2>/dev/null');
            }
            return false;
        }
        log('✅ setprop ' + prop + '=' + value);
        return true;
    } catch (e) {
        log('❌ setprop exception: ' + prop);
        if (fallback !== undefined && fallback !== null) {
            await execFn('su -c "setprop ' + shellQuote(prop) + ' ' + shellQuote(fallback) + '" 2>/dev/null');
        }
        return false;
    }
}

const FILTER_FALLBACK = ['speed', 'speed-profile', 'quicken', 'verify'];
function getEffectiveFilter(pkg, globalFilter) {
    return (appOverrides[pkg] && FILTERS.includes(appOverrides[pkg])) ? appOverrides[pkg] : globalFilter;
}

// ✅ Accurate parser for actual dumpsys package dexopt output
async function getDexoptInfo(pkg) {
    try {
        const escapedPkg = pkg.replace(/\./g, '\\.');
        const output = await execFn('dumpsys package dexopt 2>/dev/null | grep -A 6 "^  \\[' + escapedPkg + '\\]"', 10000);
        if (!output || !output.trim()) return { pkg: pkg, error: 'No dexopt info found in dumpsys' };
        const lines = output.trim().split('\n');
        const info = { pkg: pkg, status: 'unknown', reason: 'unknown', abi: 'unknown', oatPath: null, apkPath: null };
        for (let i = 0; i < lines.length; i++) {
            let line = lines[i].trim();
            if (line.startsWith('path:')) { info.apkPath = line.replace('path:', '').trim(); }
            if (/^(arm|arm64|x86|x86_64):/.test(line)) {
                info.abi = line.split(':')[0].trim();
                const statusMatch = line.match(/\[status=([^\]]+)\]/);
                if (statusMatch) info.status = statusMatch[1];
                const reasonMatch = line.match(/\[reason=([^\]]+)\]/);
                if (reasonMatch) info.reason = reasonMatch[1];
            }
            if (line.includes('[location is')) {
                const locMatch = line.match(/\[location is (.+?)\]/);
                if (locMatch) info.oatPath = locMatch[1].trim();
            }
        }
        return info;
    } catch (e) { 
        log('⚠️ getDexoptInfo failed for ' + pkg + ': ' + e.message); 
        return { pkg: pkg, error: e.message }; 
    }
}

// 🔧 Shell Caller: Delegates heavy compilation to the robust shell script
async function executeShellCompile(mode, pkg, filter, forceClean) {
    const cleanFlag = forceClean ? "1" : "0";
    const scriptPath = "/data/adb/modules/MTK_AI/MTK_AI/AI_MODE/auto_frequency/webui_workload.sh";
    const cmd = `nohup sh ${scriptPath} compile_apps ${mode} "${pkg}" ${filter} ${cleanFlag} >/dev/null 2>&1 &`;
    log(`🚀 Delegating compilation to background shell: ${mode} | ${pkg || 'ALL'} | ${filter}`);
    await execFn(cmd, 5000); 
    return true;
}

// 🛑 Stop Compilation
async function stopCompilation() {
    const statusEl = document.getElementById('dex-status');
    if (statusEl) statusEl.innerHTML = '<span style="color:#ef4444;">🛑 Stopping compilation processes...</span>';
    log('🛑 Requesting shell to stop compilation...');
    
    const scriptPath = "/data/adb/modules/MTK_AI/MTK_AI/AI_MODE/auto_frequency/webui_workload.sh";
    const cmd = `sh ${scriptPath} stop_compile`;
    
    await execFn(cmd, 5000);
    
    if (statusEl) statusEl.innerHTML = '<span style="color:#ef4444;font-weight:600;">✅ Compilation stopped.</span>';
    if (window.showStatus) window.showStatus('🛑 Compilation stopped', '#ef4444');
}

// 🔁 Enhanced compileWithFallback (Now acts purely as a shell caller)
async function compileWithFallback(pkg, preferredFilter, forceClean = false) {
    const targetFilter = getEffectiveFilter(pkg, preferredFilter);
    log(`🎯 Requesting shell compile for [${pkg}] with filter [${targetFilter}]`);
    return await executeShellCompile('single', pkg, targetFilter, forceClean);
}

// 🧹 Delete previous dex2oat artifacts
async function deleteDexArtifacts(pkg) {
    log('🧹 Cleaning dex artifacts for ' + pkg + ' via shell reset');
    const res = await execFn('su -c "cmd package compile --reset ' + pkg + '" 2>&1', 15000);
    return !res || !res.toLowerCase().includes('failure');
}

async function isSystemApp(pkg) {
    try {
        const path = await execFn('pm path ' + pkg + ' 2>/dev/null | head -1', 5000);
        return path && (path.includes('/system/') || path.includes('/vendor/') || path.includes('/product/') || path.includes('/oem/'));
    } catch { return true; }
}

async function loadAppOverrides() {
    try {
        const raw = await execFn('cat ' + APP_OVERRIDES_FILE + ' 2>/dev/null', 5000);
        if (raw && raw.trim()) {
            const parsed = JSON.parse(raw.trim());
            if (typeof parsed === 'object') appOverrides = parsed;
            log('📥 Loaded ' + Object.keys(appOverrides).length + ' per-app overrides');
        }
    } catch (e) { log('⚠️ App overrides load failed'); appOverrides = {}; }
}

async function saveAppOverrides() {
    try {
        await execFn('mkdir -p /sdcard/MTK_AI_Engine 2>/dev/null');
        const json = JSON.stringify(appOverrides);
        await execFn('echo -n "' + json + '" > ' + APP_OVERRIDES_FILE + ' 2>/dev/null');
        log('💾 Saved ' + Object.keys(appOverrides).length + ' per-app overrides');
    } catch (e) { log('❌ App overrides save failed'); }
}

async function saveConfig() {
    const lines = [
        'filter=' + currentFilter, 'jit=' + (jitEnabled ? 1 : 0), 'bg_dexopt=' + (bgDexoptEnabled ? 1 : 0),
        'profile=' + currentProfile, 'threads=' + customThreads, 'heap_xms=' + customHeapXms,
        'heap_xmx=' + customHeapXmx, 'flags=' + selectedFlags.join(','), 'force_clean=' + (forceCleanEnabled ? 1 : 0)
    ];
    const content = lines.join('\n');
    await execFn('mkdir -p /sdcard/MTK_AI_Engine 2>/dev/null');
    await execFn('echo -n "' + content + '" > ' + CONFIG_FILE + ' 2>/dev/null');
    await execFn('chmod 644 ' + CONFIG_FILE + ' 2>/dev/null');
    log('💾 Config saved to ' + CONFIG_FILE);
}

async function init() {
    await detectAndroidVersion();
    await loadConfig();
    await loadAppOverrides();
    bindClickHandler();
    log('🚀 DEX2OAT Manager initialized');
}

async function loadConfig() {
    try {
        const raw = await execFn('cat ' + CONFIG_FILE + ' 2>/dev/null', 5000);
        if (raw && raw.trim()) {
            raw.trim().split('\n').forEach(function(line) {
                const parts = line.split('=');
                const key = parts[0];
                const val = parts.slice(1).join('=');
                const v = val ? val.trim() : '';
                if (key === 'filter' && FILTERS.indexOf(v) !== -1) currentFilter = v;
                if (key === 'jit') jitEnabled = v === '1';
                if (key === 'bg_dexopt') bgDexoptEnabled = v === '1';
                if (key === 'profile' && PROFILES[v]) currentProfile = v;
                if (key === 'threads') customThreads = parseInt(v) || 4;
                if (key === 'heap_xms') customHeapXms = v;
                if (key === 'heap_xmx') customHeapXmx = v;
                if (key === 'flags' && v) selectedFlags = v.split(',').filter(function(f) { return f; });
                if (key === 'force_clean') forceCleanEnabled = v === '1';
            });
            log('📥 Config loaded: ' + currentFilter + ' | JIT:' + jitEnabled);
        }
    } catch (e) { log('⚠️ Config load failed'); }
}

async function loadInstalledApps() {
    if (appsLoaded) return installedApps;
    try {
        log('📦 Loading installed apps...');
        const raw = await execFn('pm list packages -3 2>/dev/null', 15000);
        if (raw) {
            const pkgs = raw.trim().split('\n').map(function(l) { return l.replace('package:', '').trim(); }).filter(function(p) { return p; });
            installedApps = pkgs.map(function(pkg) { return { pkg: pkg, label: pkg }; });
            appsLoaded = true;
            log('📦 Loaded ' + installedApps.length + ' user apps');
        }
    } catch (e) { log('⚠️ Failed to load apps: ' + e.message); }
    return installedApps;
}

function populateAppDropdown(selectEl, apps) {
    if (!selectEl) return;
    let html = '<option value="">-- Select App --</option>';
    apps.forEach(function(app) {
        const label = app.label || app.pkg;
        html += '<option value="' + app.pkg + '">' + label + '</option>';
    });
    selectEl.innerHTML = html;
}

function renderOverrideListHtml() {
    const entries = Object.entries(appOverrides);
    return entries.length > 0 ? entries.map(function(item) {
        const pkg = item[0];
        const filter = item[1];
        return '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 10px;background:rgba(0,0,0,0.25);border-radius:8px;margin:4px 0;font-size:11px;">' +
            '<span style="color:#fff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:45%;">' + pkg + '</span>' +
            '<span style="color:#67e8f9;font-weight:600;">' + filter + '</span>' +
            '<button data-pkg="' + pkg + '" class="app-info-btn" style="padding:4px 8px;background:#06b6d4;color:#fff;border:none;border-radius:6px;font-size:10px;cursor:pointer;margin-left:4px;">📋 Info</button>' +
            '<button data-pkg="' + pkg + '" class="app-compile-now" style="padding:4px 10px;background:#fbbf24;color:#000;border:none;border-radius:6px;font-size:10px;font-weight:600;cursor:pointer;margin-left:4px;">⚡ Compile</button>' +
            '<button data-pkg="' + pkg + '" class="app-clean-now" style="padding:4px 8px;background:#8b5cf6;color:#fff;border:none;border-radius:6px;font-size:10px;cursor:pointer;margin-left:4px;">🗑️ Clean</button>' +
            '<button data-pkg="' + pkg + '" class="app-override-remove" style="padding:4px 8px;background:#FF453A;color:#fff;border:none;border-radius:6px;font-size:10px;cursor:pointer;margin-left:4px;">✕</button>' +
            '</div>';
    }).join('') : '<div style="color:#666;font-size:11px;text-align:center;padding:12px;">No per-app overrides set</div>';
}

function renderDexoptInfoHtml(info) {
    if (!info || info.error) {
        return '<div style="color:#FF453A;font-size:11px;padding:8px;">⚠️ ' + (info ? info.error : 'Could not fetch info') + '</div>';
    }
    const statusColor = info.status === 'speed' || info.status === 'everything' ? '#fbbf24' :
                       info.status === 'speed-profile' ? '#67e8f9' :
                       info.status === 'quicken' ? '#a3e635' :
                       info.status === 'verify' ? '#666' : '#8b92b4';
    return '<div style="font-size:11px;line-height:1.6;">' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:8px;">' +
            '<div><span style="color:#8b92b4;">Status:</span> <span style="color:' + statusColor + ';font-weight:600;">' + info.status + '</span></div>' +
            '<div><span style="color:#8b92b4;">Reason:</span> <span style="color:#fff;">' + info.reason + '</span></div>' +
            '<div><span style="color:#8b92b4;">ABI:</span> <span style="color:#fff;">' + info.abi + '</span></div>' +
            '<div><span style="color:#8b92b4;">OAT File:</span> <span style="color:' + (info.oatPath ? '#32D74B' : '#FF453A') + ';">' + (info.oatPath ? '✅ Exists' : '❌ Missing') + '</span></div>' +
        '</div>' +
        (info.oatPath ? '<div style="margin-top:4px;"><span style="color:#8b92b4;">ODex Path:</span><br><span style="color:#666;font-size:10px;word-break:break-all;">' + info.oatPath + '</span></div>' : '') +
        (info.apkPath ? '<div style="margin-top:4px;"><span style="color:#8b92b4;">APK Path:</span><br><span style="color:#666;font-size:10px;word-break:break-all;">' + info.apkPath + '</span></div>' : '') +
        '</div>';
}

function bindClickHandler() {
    const btn = document.getElementById('dex2oat-btn');
    if (!btn) { log('⚠️ #dex2oat-btn not found'); return; }
    btn.addEventListener('click', function() { showDexModal(); });
}

function showDexModal() {
    const existing = document.getElementById('dex-modal');
    if (existing) existing.remove();
    const modal = document.createElement('div');
    modal.id = 'dex-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.9);z-index:10000;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(8px);overflow-y:auto;padding:20px;';
    const box = document.createElement('div');
    box.style.cssText = 'background:linear-gradient(135deg,#1a1f3a,#2d3561,#1a1f3a);border:2px solid #06b6d4;border-radius:24px;padding:28px;width:100%;max-width:620px;box-shadow:0 0 60px rgba(6,182,212,0.3);max-height:95vh;overflow-y:auto;';
    let html = '';
    html += '<h3 style="color:#06b6d4;margin:0 0 8px;font-size:22px;text-align:center;font-weight:700;">⚡ ART Compiler Pro</h3>';
    html += '<p style="color:#8b92b4;font-size:13px;text-align:center;margin-bottom:24px;">Accurate dexopt parsing • Per-app control • Manual cleanup</p>';
    
    html += '<div style="margin-bottom:20px;">';
    html += '<div style="color:#fff;font-size:14px;font-weight:600;margin-bottom:10px;">🎯 Performance Profile</div>';
    html += '<select id="profile-select" style="width:100%;padding:12px;background:rgba(0,0,0,0.4);color:#fff;border:1px solid #06b6d4;border-radius:12px;font-size:14px;">';
    Object.entries(PROFILES).forEach(function(item) {
        const k = item[0]; const p = item[1];
        html += '<option value="' + k + '"' + (k === currentProfile ? ' selected' : '') + '>' + p.name + '</option>';
    });
    html += '</select>';
    html += '<div id="profile-desc" style="font-size:11px;color:#67e8f9;margin-top:6px;padding:8px;background:rgba(6,182,212,0.15);border-radius:8px;">' + PROFILES[currentProfile].name + '</div>';
    html += '</div>';
    
    html += '<div style="margin-bottom:18px;">';
    html += '<div style="color:#fff;font-size:14px;font-weight:600;margin-bottom:8px;">🔧 Compiler Filter</div>';
    html += '<select id="dex-filter-select" style="width:100%;padding:10px;background:rgba(0,0,0,0.4);color:#fff;border:1px solid rgba(255,255,255,0.2);border-radius:10px;">';
    FILTERS.forEach(function(f) { html += '<option value="' + f + '"' + (f === currentFilter ? ' selected' : '') + '>' + f.toUpperCase() + '</option>'; });
    html += '</select>';
    html += '<div id="filter-desc" style="font-size:11px;color:#666;margin-top:4px;">' + getFilterDesc(currentFilter) + '</div>';
    html += '</div>';
    
    html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:18px;">';
    html += '<div style="background:rgba(0,0,0,0.3);border-radius:12px;padding:14px;text-align:center;">';
    html += '<div style="color:#fff;font-size:12px;font-weight:600;margin-bottom:8px;">JIT Compiler</div>';
    html += '<button id="dex-jit-btn" style="width:100%;padding:10px;border-radius:10px;border:none;font-weight:600;cursor:pointer;background:' + (jitEnabled ? '#32D74B' : '#FF453A') + ';color:#fff;">' + (jitEnabled ? '✅ Enabled' : '❌ Disabled') + '</button>';
    html += '</div>';
    html += '<div style="background:rgba(0,0,0,0.3);border-radius:12px;padding:14px;text-align:center;">';
    html += '<div style="color:#fff;font-size:12px;font-weight:600;margin-bottom:8px;">Background Dexopt</div>';
    html += '<button id="dex-bg-btn" style="width:100%;padding:10px;border-radius:10px;border:none;font-weight:600;cursor:pointer;background:' + (bgDexoptEnabled ? '#32D74B' : '#FF453A') + ';color:#fff;">' + (bgDexoptEnabled ? '✅ Enabled' : '❌ Disabled') + '</button>';
    html += '</div>';
    html += '</div>';
    
    html += '<details style="margin-bottom:18px;background:rgba(0,0,0,0.25);border-radius:12px;padding:14px;" open>';
    html += '<summary style="color:#06b6d4;font-weight:600;cursor:pointer;font-size:13px;">⚙️ Advanced Options</summary>';
    html += '<div style="margin-top:12px;display:grid;gap:10px;">';
    html += '<div><label style="color:#fff;font-size:12px;display:block;margin-bottom:4px;">Threads: <span id="threads-val">' + customThreads + '</span></label><input type="range" id="threads-slider" min="1" max="16" value="' + customThreads + '" style="width:100%;accent-color:#06b6d4;"></div>';
    html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">';
    html += '<div><label style="color:#fff;font-size:12px;display:block;margin-bottom:4px;">Heap Xms</label><select id="heap-xms" style="width:100%;padding:8px;background:rgba(0,0,0,0.4);color:#fff;border:1px solid rgba(255,255,255,0.2);border-radius:8px;">';
    ['128m','256m','512m','1024m','2048m'].forEach(function(s) { html += '<option value="' + s + '"' + (s === customHeapXms ? ' selected' : '') + '>' + s + '</option>'; });
    html += '</select></div>';
    html += '<div><label style="color:#fff;font-size:12px;display:block;margin-bottom:4px;">Heap Xmx</label><select id="heap-xmx" style="width:100%;padding:8px;background:rgba(0,0,0,0.4);color:#fff;border:1px solid rgba(255,255,255,0.2);border-radius:8px;">';
    ['256m','512m','1024m','2048m','4096m'].forEach(function(s) { html += '<option value="' + s + '"' + (s === customHeapXmx ? ' selected' : '') + '>' + s + '</option>'; });
    html += '</select></div>';
    html += '</div>';
    html += '<div><label style="color:#fff;font-size:12px;display:block;margin-bottom:4px;">Advanced Flags</label><div style="max-height:120px;overflow-y:auto;background:rgba(0,0,0,0.3);border-radius:8px;padding:8px;">';
    Object.entries(ADVANCED_FLAGS).forEach(function(item) {
        const flag = item[0]; const desc = item[1];
        const checked = selectedFlags.indexOf(flag) !== -1 ? ' checked' : '';
        html += '<label style="display:flex;align-items:center;gap:8px;color:#ccc;font-size:11px;margin:4px 0;">';
        html += '<input type="checkbox" data-flag="' + flag + '"' + checked + ' style="accent-color:#06b6d4;">';
        html += '<span>' + flag + '</span><span style="color:#666;margin-left:auto;">' + desc + '</span>';
        html += '</label>';
    });
    html += '</div></div>';
    html += '<div style="margin-top:8px;"><label style="display:flex;align-items:center;gap:8px;color:#fff;font-size:12px;cursor:pointer;">';
    html += '<input type="checkbox" id="force-clean-checkbox"' + (forceCleanEnabled ? ' checked' : '') + ' style="accent-color:#fbbf24;">';
    html += '<span>🧹 Force clean old dex2oat files before compile</span>';
    html += '<span style="color:#666;margin-left:auto;font-size:10px;">(Slower but ensures fresh AOT)</span>';
    html += '</label></div>';
    html += '</div></details>';
    
    html += '<div style="background:rgba(6,182,212,0.12);color:#67e8f9;padding:12px;border-radius:10px;font-size:11px;margin-bottom:20px;border-left:3px solid #06b6d4;"><strong>💡 Tips:</strong> Info panel now parses actual dumpsys output. 📋 Click "Info" to see real dexopt status. 🗑️ "Clean" removes stale .odex/.vdex files.</div>';
    
    html += '<details style="margin-bottom:18px;background:rgba(0,0,0,0.2);border-radius:12px;padding:14px;" open>';
    html += '<summary style="color:#fbbf24;font-weight:600;cursor:pointer;font-size:13px;">🎮 Per-App Compiler Override</summary>';
    html += '<div style="margin-top:12px;display:flex;flex-direction:column;gap:10px;">';
    html += '<div style="display:flex;gap:8px;">';
    html += '<select id="app-select-pkg" style="flex:1;padding:8px;background:rgba(0,0,0,0.4);color:#fff;border:1px solid rgba(255,255,255,0.2);border-radius:8px;font-size:12px;"><option value="">⏳ Loading apps...</option></select>';
    html += '<select id="app-select-filter" style="flex:1;padding:8px;background:rgba(0,0,0,0.4);color:#fff;border:1px solid #06b6d4;border-radius:8px;font-size:12px;">';
    FILTERS.forEach(function(f) { html += '<option value="' + f + '">' + f + '</option>'; });
    html += '</select></div>';
    html += '<div style="display:flex;gap:8px;">';
    html += '<button id="app-override-add" style="flex:1;padding:10px;background:#32D74B;color:#fff;border:none;border-radius:8px;font-weight:600;cursor:pointer;font-size:13px;">➕ Add Override</button>';
    html += '<button id="app-fetch-info" style="padding:10px 14px;background:#06b6d4;color:#fff;border:none;border-radius:8px;font-weight:600;cursor:pointer;font-size:13px;" disabled>📋 Fetch Info</button>';
    html += '</div>';
    html += '<div id="app-dexopt-info-panel" style="display:none;margin-top:8px;padding:10px;background:rgba(6,182,212,0.1);border:1px solid #06b6d4;border-radius:8px;">';
    html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">';
    html += '<span style="color:#67e8f9;font-weight:600;font-size:12px;">📊 Compilation Info</span>';
    html += '<button id="app-clean-manual" style="padding:4px 10px;background:#8b5cf6;color:#fff;border:none;border-radius:6px;font-size:11px;cursor:pointer;">🗑️ Clean Artifacts</button>';
    html += '</div>';
    html += '<div id="app-dexopt-content">Select an app and click "Fetch Info" to view compilation details</div>';
    html += '</div>';
    html += '<div style="margin-top:8px;padding:8px;background:rgba(0,0,0,0.15);border-radius:8px;">';
    html += '<div style="font-size:11px;color:#8b92b4;margin-bottom:6px;">📋 Overrides:</div>';
    html += '<div id="app-override-list" style="max-height:180px;overflow-y:auto;">' + renderOverrideListHtml() + '</div>';
    html += '</div></div></details>';
    
    html += '<button id="dex-apply-btn" style="width:100%;padding:16px;background:linear-gradient(135deg,#06b6d4,#0891b2);color:#fff;border:none;border-radius:14px;font-size:15px;font-weight:700;cursor:pointer;margin-bottom:10px;box-shadow:0 4px 20px rgba(6,182,212,0.4);">💾 Apply Configuration</button>';
    html += '<button id="dex-compile-user" style="width:100%;padding:12px;background:linear-gradient(135deg,#22c55e,#16a34a);color:#fff;border:none;border-radius:12px;font-size:13px;font-weight:600;cursor:pointer;margin-bottom:10px;">🚀 Compile User Apps Only</button>';
html += '<button id="dex-compile-system" style="width:100%;padding:12px;background:linear-gradient(135deg,#8b5cf6,#7c3aed);color:#fff;border:none;border-radius:12px;font-size:13px;font-weight:600;cursor:pointer;margin-bottom:10px;">📱 Compile System Apps Only</button>';
html += '<button id="dex-force-recompile" style="width:100%;padding:12px;background:linear-gradient(135deg,#f59e0b,#d97706);color:#fff;border:none;border-radius:12px;font-size:13px;font-weight:600;cursor:pointer;margin-bottom:10px;">⚡ Force ALL Apps + Clean</button>';
    
    // 🛑 NEW STOP BUTTON
    html += '<button id="dex-stop-compile" style="width:100%;padding:12px;background:linear-gradient(135deg,#ef4444,#dc2626);color:#fff;border:none;border-radius:12px;font-size:13px;font-weight:600;cursor:pointer;margin-bottom:10px;">🛑 Stop Compilation</button>';
    
    html += '<button id="dex-cancel-btn" style="width:100%;padding:12px;background:rgba(255,255,255,0.1);color:#fff;border:none;border-radius:10px;font-size:13px;cursor:pointer;">Cancel</button>';
    html += '<div id="dex-status" style="text-align:center;font-size:12px;color:#666;margin-top:15px;min-height:40px;"></div>';
    
    box.innerHTML = html;
    modal.appendChild(box);
    document.body.appendChild(modal);
    modal.onclick = function(e) { if (e.target === modal) modal.remove(); };
    
    // ===== EVENT HANDLERS =====
    const profileSelect = document.getElementById('profile-select');
    const profileDesc = document.getElementById('profile-desc');
    if (profileSelect) {
        profileSelect.onchange = function() {
            const p = PROFILES[profileSelect.value];
            if (p) {
                currentProfile = profileSelect.value; currentFilter = p.filter; jitEnabled = p.jit; bgDexoptEnabled = p.bgDexopt;
                customThreads = p.threads; customHeapXms = p.heapXms; customHeapXmx = p.heapXmx; selectedFlags = p.flags.slice();
                document.getElementById('dex-filter-select').value = currentFilter;
                document.getElementById('filter-desc').textContent = getFilterDesc(currentFilter);
                document.getElementById('dex-jit-btn').textContent = jitEnabled ? '✅ Enabled' : '❌ Disabled';
                document.getElementById('dex-jit-btn').style.background = jitEnabled ? '#32D74B' : '#FF453A';
                document.getElementById('dex-bg-btn').textContent = bgDexoptEnabled ? '✅ Enabled' : '❌ Disabled';
                document.getElementById('dex-bg-btn').style.background = bgDexoptEnabled ? '#32D74B' : '#FF453A';
                document.getElementById('threads-slider').value = customThreads;
                document.getElementById('threads-val').textContent = customThreads;
                document.getElementById('heap-xms').value = customHeapXms;
                document.getElementById('heap-xmx').value = customHeapXmx;
                const cbs = document.querySelectorAll('#dex-modal input[type="checkbox"][data-flag]');
                for (let i = 0; i < cbs.length; i++) { cbs[i].checked = selectedFlags.indexOf(cbs[i].dataset.flag) !== -1; }
                profileDesc.textContent = p.name;
                profileDesc.style.color = p.filter === 'everything' ? '#fbbf24' : '#67e8f9';
            }
        };
    }
    
    const filterSelect = document.getElementById('dex-filter-select');
    const filterDesc = document.getElementById('filter-desc');
    if (filterSelect && filterDesc) filterSelect.onchange = function() { currentFilter = filterSelect.value; filterDesc.textContent = getFilterDesc(currentFilter); };
    
    const jitBtn = document.getElementById('dex-jit-btn');
    if (jitBtn) jitBtn.onclick = function() { jitEnabled = !jitEnabled; jitBtn.textContent = jitEnabled ? '✅ Enabled' : '❌ Disabled'; jitBtn.style.background = jitEnabled ? '#32D74B' : '#FF453A'; };
    
    const bgBtn = document.getElementById('dex-bg-btn');
    if (bgBtn) bgBtn.onclick = function() { bgDexoptEnabled = !bgDexoptEnabled; bgBtn.textContent = bgDexoptEnabled ? '✅ Enabled' : '❌ Disabled'; bgBtn.style.background = bgDexoptEnabled ? '#32D74B' : '#FF453A'; };
    
    const threadsSlider = document.getElementById('threads-slider');
    const threadsVal = document.getElementById('threads-val');
    if (threadsSlider && threadsVal) threadsSlider.oninput = function() { threadsVal.textContent = threadsSlider.value; customThreads = parseInt(threadsSlider.value); };
    
    const heapXms = document.getElementById('heap-xms');
    const heapXmx = document.getElementById('heap-xmx');
    if (heapXms) heapXms.onchange = function() { customHeapXms = heapXms.value; };
    if (heapXmx) heapXmx.onchange = function() { customHeapXmx = heapXmx.value; };
    
    const flagCbs = document.querySelectorAll('#dex-modal input[type="checkbox"][data-flag]');
    for (let i = 0; i < flagCbs.length; i++) {
        flagCbs[i].onchange = function() {
            const flag = this.dataset.flag;
            if (this.checked) { if (selectedFlags.indexOf(flag) === -1) selectedFlags.push(flag); }
            else { const idx = selectedFlags.indexOf(flag); if (idx !== -1) selectedFlags.splice(idx, 1); }
        };
    }
    
    const cleanCb = document.getElementById('force-clean-checkbox');
    if (cleanCb) cleanCb.onchange = function() { forceCleanEnabled = this.checked; log('🧹 Force clean: ' + (this.checked ? 'ON' : 'OFF')); };
    
    const applyBtn = document.getElementById('dex-apply-btn');
    if (applyBtn) applyBtn.onclick = async function() { 
        currentFilter = document.getElementById('dex-filter-select').value; 
        customHeapXms = document.getElementById('heap-xms').value; 
        customHeapXmx = document.getElementById('heap-xmx').value; 
        await applyDexTweaks(); 
    };
    
    // 🚀 Compile User Apps Only
const compileUserBtn = document.getElementById('dex-compile-user');
if (compileUserBtn) compileUserBtn.onclick = async function() { 
    const statusEl = document.getElementById('dex-status'); 
    if (statusEl) statusEl.innerHTML = '<span style="color:#22c55e;">🔄 Compiling user apps...</span>'; 
    await executeShellCompile('bulk_user', '', currentFilter, forceCleanEnabled); 
    if (statusEl) statusEl.innerHTML = '<span style="color:#32D74B;font-weight:600;">✅ User compilation running in background. Check notifications.</span>';
    if (window.showStatus) window.showStatus('✅ User compilation running in background', '#32D74B');
};

// 📱 Compile System Apps Only (NEW)
const compileSystemBtn = document.getElementById('dex-compile-system');
if (compileSystemBtn) compileSystemBtn.onclick = async function() { 
    const statusEl = document.getElementById('dex-status'); 
    if (statusEl) statusEl.innerHTML = '<span style="color:#8b5cf6;">🔄 Compiling system apps...</span>'; 
    await executeShellCompile('bulk_system', '', currentFilter, forceCleanEnabled); 
    if (statusEl) statusEl.innerHTML = '<span style="color:#32D74B;font-weight:600;">✅ System compilation running in background. Check notifications.</span>';
    if (window.showStatus) window.showStatus('✅ System compilation running in background', '#32D74B');
};

// ⚡ Force ALL Apps + Clean
const forceBtn = document.getElementById('dex-force-recompile');
if (forceBtn) forceBtn.onclick = async function() { 
    const statusEl = document.getElementById('dex-status'); 
    if (statusEl) statusEl.innerHTML = '<span style="color:#f59e0b;">⚠️ Force compiling ALL apps + cleaning...</span>'; 
    await executeShellCompile('bulk', '', currentFilter, true); 
    if (statusEl) statusEl.innerHTML = '<span style="color:#32D74B;font-weight:600;">✅ ALL compilation running in background. Check notifications.</span>';
    if (window.showStatus) window.showStatus('✅ ALL compilation running in background', '#32D74B');
};

    // 🛑 STOP BUTTON EVENT LISTENER
    const stopBtn = document.getElementById('dex-stop-compile');
    if (stopBtn) stopBtn.onclick = async function() { await stopCompilation(); };
    
    const cancelBtn = document.getElementById('dex-cancel-btn');
    if (cancelBtn) cancelBtn.onclick = function() { modal.remove(); };
    
    const appSelectPkg = document.getElementById('app-select-pkg');
    const appSelectFilter = document.getElementById('app-select-filter');
    const appFetchInfoBtn = document.getElementById('app-fetch-info');
    const appCleanManualBtn = document.getElementById('app-clean-manual');
    const appDexoptInfoPanel = document.getElementById('app-dexopt-info-panel');
    const appDexoptContent = document.getElementById('app-dexopt-content');
    
    if (appSelectPkg && appFetchInfoBtn) {
        appSelectPkg.onchange = function() {
            const pkg = appSelectPkg.value;
            appFetchInfoBtn.disabled = !pkg;
            if (pkg) { selectedAppForInfo = pkg; } else { selectedAppForInfo = null; appDexoptInfoPanel.style.display = 'none'; }
        };
    }
    
    if (appFetchInfoBtn) {
        appFetchInfoBtn.onclick = async function() {
            const pkg = appSelectPkg.value;
            if (!pkg) { alert('Select an app first'); return; }
            appFetchInfoBtn.disabled = true;
            appFetchInfoBtn.textContent = '⏳ Loading...';
            appDexoptInfoPanel.style.display = 'block';
            appDexoptContent.innerHTML = '<div style="color:#67e8f9;font-size:11px;">🔄 Fetching compilation info for ' + pkg + '...</div>';
            try {
                const info = await getDexoptInfo(pkg);
                appDexoptContent.innerHTML = renderDexoptInfoHtml(info);
                selectedAppForInfo = pkg;
                log('📊 Fetched info for ' + pkg);
            } catch (e) {
                appDexoptContent.innerHTML = '<div style="color:#FF453A;font-size:11px;">❌ Error: ' + e.message + '</div>';
            } finally {
                appFetchInfoBtn.disabled = false;
                appFetchInfoBtn.textContent = '📋 Fetch Info';
            }
        };
    }
    
    if (appCleanManualBtn) {
        appCleanManualBtn.onclick = async function() {
            const pkg = selectedAppForInfo || appSelectPkg.value;
            if (!pkg) { alert('Select an app first'); return; }
            if (!confirm('🗑️ Delete dex2oat artifacts for\n\n' + pkg + '\n\nThis will force recompilation on next launch.\nContinue?')) return;
            appCleanManualBtn.disabled = true;
            appCleanManualBtn.textContent = '⏳ Cleaning...';
            try {
                const result = await deleteDexArtifacts(pkg);
                if (result) {
                    appDexoptContent.innerHTML = '<div style="color:#32D74B;font-weight:600;font-size:11px;">✅ Artifacts cleaned for ' + pkg + '</div><div style="color:#666;font-size:10px;margin-top:4px;">Next app launch will trigger fresh compilation</div>';
                    log('🧹 Manual clean completed for ' + pkg);
                    if (window.showStatus) window.showStatus('✅ Cleaned: ' + pkg, '#32D74B');
                } else {
                    appDexoptContent.innerHTML = '<div style="color:#fbbf24;font-size:11px;">⚠️ Cleanup had issues - check logs</div>';
                }
            } catch (e) {
                appDexoptContent.innerHTML = '<div style="color:#FF453A;font-size:11px;">❌ Error: ' + e.message + '</div>';
            } finally {
                appCleanManualBtn.disabled = false;
                appCleanManualBtn.textContent = '🗑️ Clean Artifacts';
            }
        };
    }
    
    const appOverrideAdd = document.getElementById('app-override-add');
    if (appOverrideAdd) {
        appOverrideAdd.onclick = async function() {
            const pkg = appSelectPkg.value;
            const filter = appSelectFilter.value;
            if (!pkg || FILTERS.indexOf(filter) === -1) { alert('Select an app and filter'); return; }
            appOverrides[pkg] = filter;
            await saveAppOverrides();
            const list = document.getElementById('app-override-list');
            if (list) list.innerHTML = renderOverrideListHtml();
            appSelectPkg.value = '';
            appFetchInfoBtn.disabled = true;
            log('✅ Added override: ' + pkg + ' → ' + filter);
            if (window.showStatus) window.showStatus('✅ ' + pkg + ' → ' + filter, '#32D74B');
        };
    }
    
    box.addEventListener('click', async function(e) {
        if (e.target.classList && e.target.classList.contains('app-info-btn')) {
            const pkg = e.target.dataset.pkg;
            e.target.textContent = '⏳'; e.target.disabled = true;
            appDexoptInfoPanel.style.display = 'block';
            appDexoptContent.innerHTML = '<div style="color:#67e8f9;font-size:11px;">🔄 Fetching info for ' + pkg + '...</div>';
            selectedAppForInfo = pkg;
            try {
                const info = await getDexoptInfo(pkg);
                appDexoptContent.innerHTML = renderDexoptInfoHtml(info);
            } catch (err) {
                appDexoptContent.innerHTML = '<div style="color:#FF453A;font-size:11px;">❌ ' + err.message + '</div>';
            } finally {
                e.target.textContent = '📋 Info'; e.target.disabled = false;
            }
            return;
        }
        if (e.target.classList && e.target.classList.contains('app-compile-now')) {
            const pkg = e.target.dataset.pkg;
            const filter = appOverrides[pkg] || currentFilter;
            const statusEl = document.getElementById('dex-status');
            const originalText = e.target.textContent;
            if (statusEl) statusEl.innerHTML = '<span style="color:#fbbf24;">⚡ Compiling ' + pkg + ' with ' + filter + '...</span>';
            e.target.textContent = '⏳'; e.target.disabled = true; e.target.style.opacity = '0.7';
            try {
                const result = await compileWithFallback(pkg, filter, forceCleanEnabled);
                if (result) {
                    log('✅ Compiled ' + pkg + ' with ' + filter);
                    if (window.showStatus) window.showStatus('✅ ' + pkg + ' compiled!', '#32D74B');
                } else {
                    log('❌ Failed to compile ' + pkg);
                    if (window.showStatus) window.showStatus('❌ ' + pkg + ' failed', '#FF453A');
                }
            } catch (err) { 
                log('❌ Error: ' + err.message);
                if (window.showStatus) window.showStatus('❌ Error: ' + err.message, '#FF453A');
            } finally {
                e.target.textContent = originalText; e.target.disabled = false; e.target.style.opacity = '1';
            }
            return;
        }
        if (e.target.classList && e.target.classList.contains('app-clean-now')) {
            const pkg = e.target.dataset.pkg;
            if (!confirm('🗑️ Delete dex2oat artifacts for\n\n' + pkg + '\n\nContinue?')) return;
            e.target.textContent = '⏳'; e.target.disabled = true;
            try {
                const result = await deleteDexArtifacts(pkg);
                if (result) {
                    log('🧹 Cleaned ' + pkg);
                    if (window.showStatus) window.showStatus('✅ Cleaned: ' + pkg, '#8b5cf6');
                    if (selectedAppForInfo === pkg && appDexoptInfoPanel.style.display !== 'none') {
                        appDexoptContent.innerHTML = '<div style="color:#32D74B;font-size:11px;">✅ Cleaned! Fetch info again to see updated status</div>';
                    }
                }
            } catch (err) {
                log('❌ Clean error: ' + err.message);
                if (window.showStatus) window.showStatus('❌ Clean failed', '#FF453A');
            } finally {
                e.target.textContent = '🗑️ Clean'; e.target.disabled = false;
            }
            return;
        }
        if (e.target.classList && e.target.classList.contains('app-override-remove')) {
            const pkg = e.target.dataset.pkg;
            delete appOverrides[pkg];
            await saveAppOverrides();
            const list = document.getElementById('app-override-list');
            if (list) list.innerHTML = renderOverrideListHtml();
            if (selectedAppForInfo === pkg) { appDexoptInfoPanel.style.display = 'none'; selectedAppForInfo = null; }
            log('✅ Removed override: ' + pkg);
        }
    });
    
    (async function initAppList() {
        if (appSelectPkg) {
            appSelectPkg.innerHTML = '<option value="">⏳ Loading apps...</option>';
            appSelectPkg.disabled = true;
        }
        if (!appsLoaded) { await loadInstalledApps(); }
        if (appSelectPkg && installedApps.length > 0) {
            populateAppDropdown(appSelectPkg, installedApps);
            appSelectPkg.disabled = false;
        } else if (appSelectPkg) {
            appSelectPkg.innerHTML = '<option value="">⚠️ No apps found</option>';
            appSelectPkg.disabled = true;
        }
    })();
}

function getFilterDesc(filter) {
    const desc = {
        'speed': '🔥 AOT ALL methods. Max perf, ~2-3x storage.',
        'speed-profile': '⚖️ Profile-guided AOT. Balanced perf/storage.',
        'quicken': '⚡ Interpreter optimizations only. Fast compile.',
        'verify': '✅ Verify only, no compilation. Minimal storage.',
        'interpret-only': '🐌 Pure interpretation. Slowest, smallest.',
        'space': '💾 Optimize for storage over speed.',
        'space-profile': '💾+📊 Space + profile guidance.',
        'time': '⏱️ Minimize compile time (legacy).',
        'everything': '🚀 AGGRESSIVE: Full AOT + inlining + resolution.'
    };
    return desc[filter] || '';
}

async function applyDexTweaks() {
    const applyBtn = document.getElementById('dex-apply-btn');
    let statusEl = document.getElementById('dex-status');
    if (!statusEl) {
        statusEl = document.createElement('div');
        statusEl.id = 'dex-status';
        statusEl.style.cssText = 'text-align:center;font-size:12px;color:#666;margin-bottom:15px;min-height:50px;padding:10px;background:rgba(0,0,0,0.25);border-radius:10px;';
        const box = document.querySelector('#dex-modal > div');
        if (box) box.insertBefore(statusEl, applyBtn);
    }
    applyBtn.disabled = true;
    applyBtn.textContent = '⏳ Applying...';
    statusEl.innerHTML = '<span style="color:#FF9F0A;">🔧 Updating ART properties...</span>';
    try {
        await safeSetprop('dalvik.vm.dex2oat-filter', currentFilter);
        await safeSetprop('dalvik.vm.image-dex2oat-filter', currentFilter);
        const reasons = ['install', 'bg-dexopt', 'boot', 'first-boot', 'inactive', 'cmdline', 'ab-ota'];
        for (let i = 0; i < reasons.length; i++) {
            const reason = reasons[i];
            const f = (reason === 'bg-dexopt' && !bgDexoptEnabled) ? 'quicken' : currentFilter;
            await safeSetprop('pm.dexopt.' + reason, f);
        }
        await safeSetprop('dalvik.vm.usejit', jitEnabled ? 1 : 0);
        if (androidVersion < 14) await safeSetprop('dalvik.vm.usejitprofiles', jitEnabled ? 1 : 0, null);
        if (jitEnabled) {
            await safeSetprop('dalvik.vm.jitinitialsize', '8m');
            await safeSetprop('dalvik.vm.jitmaxsize', '128m');
            await safeSetprop('dalvik.vm.jitthreshold', '5000');
            await safeSetprop('dalvik.vm.jitprithreadweight', '250');
            await safeSetprop('dalvik.vm.jittransitionweight', '500');
        } else {
            await safeSetprop('dalvik.vm.jitinitialsize', '0');
            await safeSetprop('dalvik.vm.jitmaxsize', '0');
        }
        await safeSetprop('dalvik.vm.dex2oat-threads', customThreads);
        await safeSetprop('dalvik.vm.boot-dex2oat-threads', customThreads);
        await safeSetprop('dalvik.vm.background-dex2oat-threads', Math.max(2, customThreads - 2));
        await safeSetprop('dalvik.vm.dex2oat-Xms', customHeapXms);
        await safeSetprop('dalvik.vm.dex2oat-Xmx', customHeapXmx);
        await safeSetprop('dalvik.vm.image-dex2oat-Xms', customHeapXms);
        await safeSetprop('dalvik.vm.image-dex2oat-Xmx', customHeapXmx);
        const flagString = selectedFlags.join(' ');
        await safeSetprop('dalvik.vm.dex2oat-flags', flagString || '', '');
        await safeSetprop('dalvik.vm.ps-min-first-save-ms', '30000');
        await safeSetprop('dalvik.vm.ps-min-save-period-ms', '60000');
        await safeSetprop('dalvik.vm.bgdexopt.new-classes-percent', '10');
        await safeSetprop('dalvik.vm.bgdexopt.new-methods-percent', '10');
        await safeSetprop('dalvik.vm.dex2oat-swap', 'true');
        await safeSetprop('dalvik.vm.dex2oat-resolve-startup-strings', 'true');
        await saveConfig();
        await saveAppOverrides();
        const storageNote = (currentFilter === 'speed' || currentFilter === 'everything') ? '<br><small style="color:#fbbf24;">⚠️ Full AOT may use 2-3x app storage</small>' : '';
        const cleanNote = forceCleanEnabled ? '<br><small style="color:#67e8f9;">🧹 Force clean enabled for next compile</small>' : '';
        statusEl.innerHTML = '<span style="color:#32D74B;font-weight:600;">✅ ART Updated</span><br><small style="color:#8b92b4;">Filter:<strong>' + currentFilter + '</strong> | JIT:' + (jitEnabled?'ON':'OFF') + ' | Threads:' + customThreads + '</small>' + storageNote + cleanNote;
        if (window.showStatus) window.showStatus('🚀 ART: ' + currentFilter + ' • JIT:' + (jitEnabled?'ON':'OFF') + ' • ' + customThreads + ' threads', currentFilter === 'everything' ? '#fbbf24' : '#06b6d4');
        setTimeout(function() { const m = document.getElementById('dex-modal'); if (m) m.remove(); }, 2500);
    } catch (e) {
        log('❌ Apply failed: ' + e.message);
        statusEl.innerHTML = '<span style="color:#FF453A;font-weight:600;">❌ Error</span><br><small style="color:#8b92b4;">' + (e.message || 'Check root access') + '</small>';
        applyBtn.disabled = false;
        applyBtn.textContent = '💾 Apply Configuration';
    }
}

// 🚀 Smart Compile (Bulk)
async function smartCompile(includeSystem, forceClean = false) {
    const statusEl = document.getElementById('dex-status');
    if (statusEl) statusEl.innerHTML = '<span style="color:#fbbf24;">🚀 Delegating bulk compilation to background shell engine...</span>';
    const filter = currentFilter;
    log('🚀 Triggering bulk shell compilation...');
    await executeShellCompile('bulk', '', filter, forceClean);
    if (statusEl) statusEl.innerHTML = '<span style="color:#32D74B;font-weight:600;">✅ Bulk compilation running in background. Check notifications for real-time progress.</span>';
    if (window.showStatus) window.showStatus('✅ Compilation running in background', '#32D74B');
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();

window.DEX2OATManager = { 
    init, showDexModal, applyDexTweaks, smartCompile, compileWithFallback, stopCompilation,
    getEffectiveFilter, getDexoptInfo, deleteDexArtifacts, PROFILES, FILTERS, ADVANCED_FLAGS 
};
})();