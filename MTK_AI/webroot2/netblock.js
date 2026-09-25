// netblock.js - Universal App NetBlock Manager
// Supports: KernelSU, Magisk, APatch | iptables, iptables-legacy, iptables-nft, nftables
(function() {
'use strict';

// === UNIVERSAL PATHS ===
const STORAGE = (typeof ksu !== 'undefined' && ksu.env?.EXTERNAL_STORAGE) || '/sdcard';
const CONFIG_DIR = `${STORAGE}/MTK_AI_Engine`;
const CONFIG_FILE = `${CONFIG_DIR}/netblock.conf`;
const BOOT_SCRIPT = '/data/adb/service.d/netblock.sh';
const BOOT_LOG = `${CONFIG_DIR}/netblock_boot.log`;

let blockedPackages = {}; // pkg -> uid
let detectedApps = [];
let iptablesCmd = 'iptables';
let ip6tablesCmd = 'ip6tables';
let iptablesAvailable = false;

// === UNIVERSAL EXEC (supports KSU, Magisk WebUI, APatch) ===
const execFn = window.exec || async function(cmd, timeout = 5000) {
    return new Promise(resolve => {
        const cb = `nb_${Date.now()}_${Math.random().toString(36).substring(2,8)}`;
        const t = setTimeout(() => { delete window[cb]; resolve(''); }, timeout);
        window[cb] = (_, res) => { clearTimeout(t); delete window[cb]; resolve(res || ''); };
        try {
            if (window.ksu && typeof ksu.exec === 'function') ksu.exec(cmd, `window.${cb}`);
            else if (window.exec) window.exec(cmd, `window.${cb}`);
            else { clearTimeout(t); resolve(''); }
        } catch (e) { clearTimeout(t); resolve(''); }
    });
};

const execSilent = async (cmd) => execFn(`${cmd} 2>/dev/null`, 3000);

// === DETECT IPTABLES VARIANT ===
async function detectIptables() {
    // Try variants in order of preference
    const variants = ['iptables', 'iptables-nft', 'iptables-legacy', '/system/bin/iptables'];
    for (const v of variants) {
        const res = await execSilent(`which ${v}`);
        if (res && res.trim()) {
            iptablesCmd = v.trim();
            break;
        }
    }
    const v6variants = ['ip6tables', 'ip6tables-nft', 'ip6tables-legacy', '/system/bin/ip6tables'];
    for (const v of v6variants) {
        const res = await execSilent(`which ${v}`);
        if (res && res.trim()) {
            ip6tablesCmd = v.trim();
            break;
        }
    }
    // Test if iptables actually works
    const test = await execSilent(`${iptablesCmd} -L -n 2>&1 | head -1`);
    iptablesAvailable = !!(test && !test.toLowerCase().includes('not found') && !test.toLowerCase().includes('permission denied'));
    console.log(`🔧 iptables: ${iptablesCmd} | ip6tables: ${ip6tablesCmd} | OK: ${iptablesAvailable}`);
    return iptablesAvailable;
}

// === ROBUST UID DETECTION (multiple fallbacks) ===
async function getUid(pkg) {
    // Method 1: dumpsys (fastest, most reliable)
    let res = await execSilent(`dumpsys package ${pkg} | grep -m1 -E 'userId=|appId=' | grep -oE '[0-9]+'`);
    if (res && res.trim()) return res.trim();
    
    // Method 2: pm dump
    res = await execSilent(`pm dump ${pkg} | grep -m1 'userId=' | grep -oE '[0-9]+'`);
    if (res && res.trim()) return res.trim();
    
    // Method 3: stat on data dir
    res = await execSilent(`stat -c %u /data/data/${pkg} 2>/dev/null`);
    if (res && res.trim()) return res.trim();
    
    // Method 4: ls -ld
    res = await execSilent(`ls -ld /data/data/${pkg} 2>/dev/null | awk '{print $3}'`);
    if (res && res.trim() && !isNaN(res.trim())) return res.trim();
    
    // Method 5: /data/system/packages.list
    res = await execSilent(`grep -E '^${pkg} ' /data/system/packages.list | awk '{print $2}'`);
    if (res && res.trim()) return res.trim();
    
    return '';
}

// === NORMALIZE PACKAGE LIST ===
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
            if (typeof raw === 'string') {
                try { raw = JSON.parse(raw); } catch (_) { raw = []; }
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

function formatPackageName(pkg) {
    let name = pkg.replace(/^(com|io|org|net|app|me|jp|kr|cn|in|br|ru|de|fr|es|it)./, '');
    const parts = name.split('.');
    if (parts.length >= 2) name = parts.slice(-2).join(' ');
    return name.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) || pkg;
}

// === IPTABLES OPERATIONS (with chain auto-creation) ===
async function ensureChain() {
    if (!iptablesAvailable) return false;
    // Create chain if missing
    await execSilent(`${iptablesCmd} -N NETBLOCK`);
    await execSilent(`${ip6tablesCmd} -N NETBLOCK`);
    // Link to OUTPUT if not already linked
    const linked = await execSilent(`${iptablesCmd} -C OUTPUT -j NETBLOCK`);
    if (!linked || linked.toLowerCase().includes('no chain') || linked.toLowerCase().includes('bad')) {
        await execSilent(`${iptablesCmd} -A OUTPUT -j NETBLOCK`);
    }
    const linked6 = await execSilent(`${ip6tablesCmd} -C OUTPUT -j NETBLOCK`);
    if (!linked6 || linked6.toLowerCase().includes('no chain') || linked6.toLowerCase().includes('bad')) {
        await execSilent(`${ip6tablesCmd} -A OUTPUT -j NETBLOCK`);
    }
    return true;
}

async function addBlockRule(uid) {
    await execSilent(`${iptablesCmd} -A NETBLOCK -m owner --uid-owner ${uid} -j DROP`);
    await execSilent(`${ip6tablesCmd} -A NETBLOCK -m owner --uid-owner ${uid} -j DROP`);
}

async function removeBlockRule(uid) {
    await execSilent(`${iptablesCmd} -D NETBLOCK -m owner --uid-owner ${uid} -j DROP`);
    await execSilent(`${ip6tablesCmd} -D NETBLOCK -m owner --uid-owner ${uid} -j DROP`);
}

// === BOOT SCRIPT GENERATION ===
async function installBootScript() {
    const script = `#!/system/bin/sh
# NetBlock Boot Persistence Script
# Auto-generated by netblock.js - Do not edit manually
# Runs on every boot via KernelSU/Magisk service.d

MODDIR=\${0%/*}
LOG="${BOOT_LOG}"
CONFIG="${CONFIG_FILE}"
IPT="${iptablesCmd}"
IP6T="${ip6tablesCmd}"

log() { echo "[\$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "\$LOG"; }

log "=== NetBlock boot script starting ==="

# Wait for iptables to be ready (max 60s)
WAIT=0
while [ \$WAIT -lt 60 ]; do
    if \$IPT -L -n >/dev/null 2>&1; then
        break
    fi
    sleep 1
    WAIT=\$((WAIT + 1))
done

if [ \$WAIT -ge 60 ]; then
    log "ERROR: iptables not available after 60s"
    exit 1
fi
log "iptables ready after \${WAIT}s"

# Create chain
\$IPT -N NETBLOCK 2>/dev/null || \$IPT -F NETBLOCK 2>/dev/null
\$IP6T -N NETBLOCK 2>/dev/null || \$IP6T -F NETBLOCK 2>/dev/null

# Link to OUTPUT
\$IPT -C OUTPUT -j NETBLOCK >/dev/null 2>&1 || \$IPT -A OUTPUT -j NETBLOCK
\$IP6T -C OUTPUT -j NETBLOCK >/dev/null 2>&1 || \$IP6T -A OUTPUT -j NETBLOCK
log "Chain NETBLOCK created and linked"

# Apply rules from config
if [ ! -f "\$CONFIG" ]; then
    log "No config file at \$CONFIG"
    exit 0
fi

COUNT=0
while IFS='=' read -r pkg uid; do
    [ -z "\$pkg" ] && continue
    [ -z "\$uid" ] && continue
    # Skip comments
    case "\$pkg" in \\#*) continue ;; esac
    
    \$IPT -A NETBLOCK -m owner --uid-owner "\$uid" -j DROP 2>/dev/null
    \$IP6T -A NETBLOCK -m owner --uid-owner "\$uid" -j DROP 2>/dev/null
    COUNT=\$((COUNT + 1))
    log "Applied rule: \$pkg (UID=\$uid)"
done < "\$CONFIG"

log "=== Done: \$COUNT rules applied ==="
`;
    
    await execFn(`mkdir -p /data/adb/service.d`, 3000);
    await execFn(`mkdir -p "${CONFIG_DIR}"`, 3000);
    // Write script using printf to avoid shell escaping issues
    const escaped = script.replace(/'/g, "'\\''");
    await execFn(`printf '%s' '${escaped}' > ${BOOT_SCRIPT}`, 5000);
    await execFn(`chmod 755 ${BOOT_SCRIPT}`, 2000);
    console.log('✅ Boot script installed:', BOOT_SCRIPT);
}

// === INIT ===
async function init() {
    await detectIptables();
    await loadConfig();
    await ensureChain();
    await installBootScript();
    bindClickHandler();
}

async function loadConfig() {
    try {
        const raw = await execFn(`cat "${CONFIG_FILE}" 2>/dev/null`);
        blockedPackages = {};
        if (raw && raw.trim()) {
            raw.trim().split('\n').forEach(line => {
                const [pkg, uid] = line.split('=');
                if (pkg && uid) blockedPackages[pkg.trim()] = uid.trim();
            });
        }
    } catch (e) { console.warn('NetBlock: Config load failed:', e); }
}

function bindClickHandler() {
    const btn = document.getElementById('netblock-apps-btn') || document.getElementById('freeze-apps-btn');
    if (!btn) { console.warn('NetBlock: button not found'); return; }
    btn.addEventListener('click', async () => {
        if (!iptablesAvailable) {
            alert('⚠️ iptables not available on this device!');
            return;
        }
        await loadConfig();
        showNetBlockModal();
    });
}

function showNetBlockModal() {
    const existing = document.getElementById('netblock-modal');
    if (existing) existing.remove();
    
    const modal = document.createElement('div');
    modal.id = 'netblock-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:10000;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(5px);';
    
    const box = document.createElement('div');
    box.style.cssText = 'background:linear-gradient(135deg,#1a1f3a,#2d3561);border:2px solid #06b6d4;border-radius:20px;padding:24px;width:95%;max-width:500px;box-shadow:0 0 40px rgba(6,182,212,0.2);';
    
    box.innerHTML = `
        <h3 style="color:#06b6d4;margin:0 0 5px;font-size:20px;text-align:center;">🌐 App NetBlock Manager</h3>
        <p style="color:#8b92b4;font-size:12px;text-align:center;margin-bottom:20px;">Block internet (Wi-Fi & Data) per app via root iptables</p>
        <div style="display:flex;gap:8px;margin-bottom:15px;">
            <input type="text" id="netblock-search" placeholder="🔍 Search apps..." style="flex:1;padding:10px 12px;background:rgba(0,0,0,0.3);border:1px solid #06b6d4;border-radius:8px;color:#fff;font-size:12px;">
            <button id="netblock-refresh-btn" style="padding:10px 16px;background:rgba(6,182,212,0.3);color:#fff;border:1px solid #06b6d4;border-radius:8px;font-size:12px;cursor:pointer;">🔄</button>
        </div>
        <div id="netblock-scan-status" style="text-align:center;font-size:12px;color:#666;margin-bottom:15px;min-height:40px;padding:8px;background:rgba(0,0,0,0.2);border-radius:8px;">
            <span style="color:#06b6d4;"> Loading...</span>
        </div>
        <div id="netblock-list" style="display:none;flex-direction:column;gap:8px;margin-bottom:15px;max-height:350px;overflow-y:auto;padding-right:4px;"></div>
        <div style="background:rgba(6,182,212,0.1);color:#7dd3fc;padding:10px;border-radius:8px;font-size:11px;text-align:center;margin-bottom:15px;">
            <i class="fas fa-info-circle"></i> Engine: <code style="background:rgba(0,0,0,0.3);padding:2px 6px;border-radius:4px;">${iptablesCmd}</code> | Boot: <code style="background:rgba(0,0,0,0.3);padding:2px 6px;border-radius:4px;">service.d</code>
        </div>
        <div style="display:flex;gap:10px;">
            <button id="netblock-unblock-all" style="flex:1;padding:12px;background:rgba(255,255,255,0.1);color:#fff;border:1px solid #06b6d4;border-radius:10px;font-size:13px;cursor:pointer;">Unblock All</button>
            <button id="netblock-cancel-btn" style="flex:1;padding:12px;background:rgba(255,255,255,0.1);color:#fff;border:none;border-radius:10px;font-size:13px;cursor:pointer;">Close</button>
        </div>
    `;
    
    modal.appendChild(box);
    document.body.appendChild(modal);
    modal.onclick = e => { if (e.target === modal) modal.remove(); };

    const searchInput = document.getElementById('netblock-search');
    if (searchInput) searchInput.addEventListener('input', (e) => filterApps(e.target.value));
    
    const refreshBtn = document.getElementById('netblock-refresh-btn');
    if (refreshBtn) refreshBtn.onclick = async () => { await loadConfig(); await scanApps(); };
    
    const unblockAllBtn = document.getElementById('netblock-unblock-all');
    if (unblockAllBtn) unblockAllBtn.onclick = async () => await toggleAllApps(false);
    
    const cancelBtn = document.getElementById('netblock-cancel-btn');
    if (cancelBtn) cancelBtn.onclick = () => modal.remove();

    scanApps();
}

function updateAppRowUI(pkg, isNowBlocked) {
    const appEl = document.getElementById(`app-${pkg}`);
    if (!appEl) return;
    
    const statusColor = isNowBlocked ? '#ef4444' : '#10b981';
    const statusText = isNowBlocked ? '🚫 Blocked' : '🟢 Online';
    const btnBg = isNowBlocked ? '#ef4444' : '#10b981';
    const btnText = isNowBlocked ? 'Unblock' : 'Block';
    
    const infoDiv = appEl.querySelector('div[style*="flex:1"]');
    if (infoDiv) {
        const statusLabel = infoDiv.querySelector('div:nth-child(2)');
        if (statusLabel) {
            statusLabel.style.color = statusColor;
            statusLabel.textContent = statusText;
        }
    }
    
    const btn = appEl.querySelector('.netblock-app-toggle');
    if (btn) {
        btn.style.background = btnBg;
        btn.textContent = btnText;
        btn.dataset.blocked = isNowBlocked ? '1' : '0';
        btn.disabled = false;
    }
    
    const appData = detectedApps.find(a => a.pkg === pkg);
    if (appData) appData.isBlocked = isNowBlocked;
}

async function scanApps() {
    const listEl = document.getElementById('netblock-list');
    const statusEl = document.getElementById('netblock-scan-status');
    if (!listEl || !statusEl) return;

    try {
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
        
        statusEl.textContent = `⚡ Checking block status...`;
        
        const colors = ['#06b6d4', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#ef4444', '#14b8a6'];
        
        for (const pkg of allPkgs) {
            const isSystem = system.has(pkg);
            const appName = labels[pkg] || formatPackageName(pkg);
            const isBlocked = blockedPackages.hasOwnProperty(pkg);
            detectedApps.push({ pkg, label: appName, isBlocked, isSystem });
        }
        
        detectedApps.sort((a, b) => {
            if (a.isSystem !== b.isSystem) return a.isSystem ? 1 : -1;
            return a.label.localeCompare(b.label);
        });
        
        for (const app of detectedApps) {
            const { pkg, label: appName, isBlocked, isSystem } = app;
            const colorIdx = pkg.charCodeAt(0) % colors.length;
            const color = colors[colorIdx];
            const firstLetter = appName.charAt(0).toUpperCase();
            
            const statusColor = isBlocked ? '#ef4444' : '#10b981';
            const statusText = isBlocked ? '🚫 Blocked' : '🟢 Online';
            const btnBg = isBlocked ? '#ef4444' : '#10b981';
            const btnText = isBlocked ? 'Unblock' : 'Block';
            
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
                <button class="netblock-app-toggle" data-pkg="${pkg}" data-blocked="${isBlocked ? '1' : '0'}" style="background:${btnBg};color:#fff;border:none;padding:8px 16px;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap;min-width:70px;">${btnText}</button>
            `;
            listEl.appendChild(appEl);
        }
        
        statusEl.style.display = 'none';
        console.log(`✅ Loaded ${detectedApps.length} apps`);
        
        listEl.querySelectorAll('.netblock-app-toggle').forEach(btn => {
            btn.onclick = async (e) => {
                const pkg = e.currentTarget.dataset.pkg;
                const currentlyBlocked = e.currentTarget.dataset.blocked === '1';
                e.currentTarget.disabled = true;
                e.currentTarget.textContent = '⏳';
                
                try {
                    if (currentlyBlocked) {
                        const uid = blockedPackages[pkg];
                        if (uid) await removeBlockRule(uid);
                        delete blockedPackages[pkg];
                    } else {
                        let uid = blockedPackages[pkg];
                        if (!uid) uid = await getUid(pkg);
                        if (uid) {
                            await ensureChain();
                            await addBlockRule(uid);
                            blockedPackages[pkg] = uid;
                        } else {
                            throw new Error('UID not found');
                        }
                    }
                    
                    const newBlockedState = !currentlyBlocked;
                    await saveConfig();
                    updateAppRowUI(pkg, newBlockedState);
                } catch (err) {
                    console.error(`Failed ${pkg}:`, err);
                    e.currentTarget.textContent = currentlyBlocked ? 'Unblock' : 'Block';
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
    const listEl = document.getElementById('netblock-list');
    if (!listEl) return;
    const q = query.toLowerCase().trim();
    const items = listEl.querySelectorAll('div[id^="app-"]');
    items.forEach(item => {
        const nameEl = item.querySelector('div[style*="color:#fff"]');
        const pkgEl = item.querySelector('div[style*="font-family:monospace"]');
        const name = nameEl?.textContent?.toLowerCase() || '';
        const pkg = pkgEl?.textContent?.toLowerCase() || '';
        item.style.display = (name.includes(q) || pkg.includes(q)) ? 'flex' : 'none';
    });
}

async function toggleAllApps(block) {
    const statusEl = document.getElementById('netblock-scan-status');
    if (!statusEl) return;
    
    statusEl.style.display = 'block';
    statusEl.innerHTML = `<span style="color:#06b6d4;"> ${block ? 'Blocking' : 'Unblocking'}...</span>`;
    
    try {
        await ensureChain();
        
        for (const app of detectedApps) {
            if (block) {
                let uid = blockedPackages[app.pkg];
                if (!uid) {
                    uid = await getUid(app.pkg);
                    if (uid) blockedPackages[app.pkg] = uid;
                }
                if (uid) await addBlockRule(uid);
            } else {
                const uid = blockedPackages[app.pkg];
                if (uid) {
                    await removeBlockRule(uid);
                    delete blockedPackages[app.pkg];
                }
            }
            updateAppRowUI(app.pkg, block);
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
        for (const [pkg, uid] of Object.entries(blockedPackages)) {
            cfg += `${pkg}=${uid}\n`;
        }
        await execFn(`mkdir -p "${CONFIG_DIR}"`, 2000);
        await execFn(`printf '%s' "${cfg.replace(/"/g, '\\"')}" > "${CONFIG_FILE}"`, 3000);
        await installBootScript(); // Keep boot script in sync
    } catch (e) { console.warn('Save config failed:', e); }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

window.NetBlockManager = { init, showNetBlockModal, toggleAllApps, detectIptables };
})();