// activitylauncher.js - Native-Grade Activity Launcher with Saved Shortcuts
(function() {
'use strict';

let detectedApps = [];
let isHandlerBound = false;
let activeExpandedPkg = null;

// Shell command executor supporting KernelSU and webview fallbacks
const execFn = window.exec || async function(cmd, timeout = 10000) {
    return new Promise(resolve => {
        const cb = `act_exec_${Date.now()}_${Math.random().toString(36).substring(2)}`;
        const t = setTimeout(() => { delete window[cb]; resolve(''); }, timeout);
        window[cb] = (_, res) => { clearTimeout(t); delete window[cb]; resolve(res || ''); };
        
        if (window.ksu && typeof window.ksu.exec === 'function') {
            window.ksu.exec(cmd, `window.${cb}`);
        } else {
            clearTimeout(t);
            resolve('');
        }
    });
};

// --- LOCAL STORAGE & FAVORITES MANAGEMENT ---

function getSavedItems() {
    try {
        return JSON.parse(localStorage.getItem('act_saved_shortcuts') || '[]');
    } catch (e) {
        return [];
    }
}

function saveSavedItems(items) {
    try {
        localStorage.setItem('act_saved_shortcuts', JSON.stringify(items));
    } catch (e) {}
}

function isItemSaved(component) {
    const saved = getSavedItems();
    return saved.some(i => i.component === component);
}

function toggleSaveItem(itemData) {
    let saved = getSavedItems();
    const index = saved.findIndex(i => i.component === itemData.component);
    const nowSaved = index === -1;

    if (nowSaved) {
        saved.push(itemData);
    } else {
        saved.splice(index, 1);
    }
    
    saveSavedItems(saved);
    updateSavedUI();
    syncStarButtons(itemData.component, nowSaved);
}

function syncStarButtons(component, isSaved) {
    const starBtns = document.querySelectorAll(`[data-save-component="${CSS.escape(component)}"]`);
    starBtns.forEach(btn => {
        btn.innerText = isSaved ? '⭐' : '☆';
        btn.title = isSaved ? 'Remove from Saved' : 'Save Shortcut';
        btn.style.color = isSaved ? '#ffd60a' : 'var(--text-secondary, #8e8e93)';
    });
}

function updateSavedUI() {
    const savedContainer = document.getElementById('act-saved-section');
    if (!savedContainer) return;

    const items = getSavedItems();
    if (items.length === 0) {
        savedContainer.style.display = 'none';
        savedContainer.innerHTML = '';
        return;
    }

    savedContainer.style.display = 'flex';
    savedContainer.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
            <span style="font-size:12px;font-weight:700;color:#ffd60a;">⭐ Saved Shortcuts (${items.length})</span>
            <span id="act-toggle-saved-btn" style="font-size:10px;color:var(--text-secondary, #8e8e93);cursor:pointer;user-select:none;">▼ Hide</span>
        </div>
        <div id="act-saved-items-list" style="display:flex;flex-direction:column;gap:6px;width:100%;box-sizing:border-box;"></div>
    `;

    const toggleBtn = document.getElementById('act-toggle-saved-btn');
    const listEl = document.getElementById('act-saved-items-list');

    if (toggleBtn && listEl) {
        toggleBtn.onclick = () => {
            const isHidden = listEl.style.display === 'none';
            listEl.style.display = isHidden ? 'flex' : 'none';
            toggleBtn.innerText = isHidden ? '▼ Hide' : '▲ Show';
        };
    }

    items.forEach(item => {
        const el = document.createElement('div');
        el.className = 'act-activity-item';
        el.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 10px;background:var(--bg-secondary, #2c2c2e);border:1px solid #ffd60a33;border-radius:6px;width:100%;box-sizing:border-box;';

        el.innerHTML = `
            <div style="flex:1;min-width:0;padding-right:6px;">
                <div style="font-size:12px;font-weight:600;color:#fff;font-family:sans-serif;word-break:break-all;">${item.displayTitle}</div>
                <div style="font-size:9px;color:var(--text-secondary, #8e8e93);font-family:monospace;margin-top:2px;word-break:break-all;">${item.component}</div>
            </div>
            <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">
                <button class="act-sub-launch-btn" style="padding:5px 10px;background:var(--accent-blue, #0a84ff);color:#fff;border:none;border-radius:6px;font-size:10px;font-weight:700;cursor:pointer;white-space:nowrap;">Launch ➔</button>
                <button class="act-unsave-btn" style="padding:5px 8px;background:rgba(255,69,58,0.15);color:var(--accent-red, #ff453a);border:1px solid var(--accent-red, #ff453a);border-radius:6px;font-size:10px;cursor:pointer;white-space:nowrap;" title="Remove Shortcut">🗑️</button>
            </div>
        `;

        const launchBtn = el.querySelector('.act-sub-launch-btn');
        launchBtn.onclick = (e) => {
            e.stopPropagation();
            launchSpecificActivity(item.component, launchBtn);
        };

        const unsaveBtn = el.querySelector('.act-unsave-btn');
        unsaveBtn.onclick = (e) => {
            e.stopPropagation();
            toggleSaveItem(item);
        };

        listEl.appendChild(el);
    });
}

// --- PACKAGE RESOLUTION ---

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

// --- UI CONTROLLER ---

function init() {
    bindClickHandler();
}

function bindClickHandler() {
    if (isHandlerBound) return;
    isHandlerBound = true;

    document.addEventListener('click', function(e) {
        const target = e.target;
        if (!target) return;

        let el = target.closest('#activitylauncher-btn, [data-action="activitylauncher"], .activitylauncher-trigger');
        if (!el) {
            const candidate = target.closest('button, a, div');
            if (candidate) {
                const txt = candidate.innerText || candidate.textContent || '';
                if (txt.indexOf('Activity Launcher') !== -1 && (target.tagName === 'BUTTON' || txt.indexOf('Open') !== -1)) {
                    el = candidate;
                }
            }
        }

        if (el) {
            e.preventDefault();
            e.stopPropagation();
            if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
            showActivityLauncherModal();
        }
    }, true);
}

window.showActivityLauncherModal = showActivityLauncherModal;
window.openActivityLauncher = showActivityLauncherModal;

function showActivityLauncherModal() {
    activeExpandedPkg = null;
    const existing = document.getElementById('activitylauncher-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'activitylauncher-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:10000;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(5px);padding:16px;box-sizing:border-box;';

    const box = document.createElement('div');
    box.style.cssText = 'background:var(--bg-card, #1c1c1e);border:1px solid var(--border-color, #2c2c2e);border-radius:16px;padding:20px;width:100%;max-width:560px;box-shadow:0 4px 20px rgba(0,0,0,0.5);max-height:88vh;display:flex;flex-direction:column;color:var(--text-primary, #ffffff);box-sizing:border-box;';

    box.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
            <h3 style="color:var(--accent-blue, #0a84ff);margin:0;font-size:18px;">🚀 Activity Launcher</h3>
            <span style="background:rgba(10,132,255,0.15);color:var(--accent-blue, #0a84ff);border:1px solid var(--accent-blue, #0a84ff);border-radius:6px;padding:2px 8px;font-size:10px;font-weight:700;">ROOT</span>
        </div>
        <p style="color:var(--text-secondary, #8e8e93);font-size:11px;margin:0 0 12px;">Launch primary apps, save shortcuts, or tap card to inspect hidden activities.</p>
        
        <div style="display:flex;gap:8px;margin-bottom:8px;">
            <div style="position:relative;flex:1;">
                <input type="text" id="act-search" placeholder="Search apps..." style="width:100%;padding:10px 32px 10px 12px;background:var(--bg-secondary, #2c2c2e);border:1px solid var(--border-color, #3a3a3c);border-radius:8px;color:#fff;font-size:12px;box-sizing:border-box;">
                <button id="act-clear-search" style="position:absolute;right:8px;top:50%;transform:translateY(-50%);background:none;border:none;color:var(--text-secondary, #8e8e93);font-size:14px;cursor:pointer;display:none;padding:2px 6px;">✕</button>
            </div>
            <button id="act-refresh-btn" style="padding:10px 14px;background:var(--bg-secondary, #2c2c2e);color:#fff;border:1px solid var(--border-color, #3a3a3c);border-radius:8px;font-size:12px;cursor:pointer;">🔄</button>
        </div>

        <div id="act-status-bar" style="text-align:center;font-size:12px;color:var(--text-secondary, #8e8e93);margin-bottom:12px;padding:8px;background:var(--bg-secondary, #2c2c2e);border:1px solid var(--border-color, #3a3a3c);border-radius:8px;">
            Initializing app list...
        </div>

        <!-- Saved Shortcuts Container -->
        <div id="act-saved-section" style="display:none;flex-direction:column;background:rgba(255,214,10,0.05);border:1px solid rgba(255,214,10,0.2);border-radius:10px;padding:10px;margin-bottom:10px;width:100%;box-sizing:border-box;"></div>

        <div id="act-app-list" style="flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:8px;padding-right:4px;margin-bottom:12px;min-height:150px;width:100%;box-sizing:border-box;"></div>

        <button id="act-close-btn" style="width:100%;padding:12px;background:var(--bg-secondary, #2c2c2e);color:var(--text-primary, #ffffff);border:1px solid var(--border-color, #3a3a3c);border-radius:10px;font-size:13px;font-weight:600;cursor:pointer;">Close</button>
    `;

    modal.appendChild(box);
    document.body.appendChild(modal);

    modal.onclick = e => { if (e.target === modal) modal.remove(); };
    document.getElementById('act-close-btn').onclick = () => modal.remove();

    const searchInput = document.getElementById('act-search');
    const clearBtn = document.getElementById('act-clear-search');

    if (searchInput && clearBtn) {
        searchInput.addEventListener('input', (e) => {
            const val = e.target.value;
            clearBtn.style.display = val ? 'block' : 'none';
            filterApps(val);
        });

        clearBtn.addEventListener('click', () => {
            searchInput.value = '';
            clearBtn.style.display = 'none';
            searchInput.focus();
            filterApps('');
        });
    }

    const refreshBtn = document.getElementById('act-refresh-btn');
    if (refreshBtn) refreshBtn.onclick = () => scanApps();

    updateSavedUI();
    scanApps();
}

async function scanApps() {
    const listEl = document.getElementById('act-app-list');
    const statusEl = document.getElementById('act-status-bar');
    if (!listEl || !statusEl) return;

    statusEl.style.display = 'block';
    statusEl.innerHTML = '⚡ Fetching installed packages...';
    listEl.innerHTML = '';
    detectedApps = [];

    try {
        const allPkgs = await getAllPackages();
        if (!allPkgs.length) {
            statusEl.innerHTML = '<span style="color:var(--accent-red, #ff453a);">No apps found or root access denied.</span>';
            return;
        }

        statusEl.innerHTML = `⚡ Resolving app names (${allPkgs.length} packages found)...`;
        const { labels, system } = await enrichApps(allPkgs);

        for (const pkg of allPkgs) {
            const isSystem = system.has(pkg);
            const appName = labels[pkg] || formatPackageName(pkg);
            detectedApps.push({ pkg, label: appName, isSystem });
        }

        detectedApps.sort((a, b) => {
            if (a.isSystem !== b.isSystem) return a.isSystem ? 1 : -1;
            return a.label.localeCompare(b.label);
        });

        renderAppList(detectedApps);
        statusEl.style.display = 'none';

        const searchInput = document.getElementById('act-search');
        if (searchInput && searchInput.value) {
            filterApps(searchInput.value);
        }
    } catch (e) {
        console.error('Activity Launcher scan error:', e);
        statusEl.innerHTML = `<span style="color:var(--accent-red, #ff453a);">Error: ${e.message || e}</span>`;
    }
}

function renderAppList(apps) {
    const listEl = document.getElementById('act-app-list');
    if (!listEl) return;

    listEl.innerHTML = '';

    apps.forEach(app => {
        const { pkg, label: appName, isSystem } = app;
        const firstLetter = appName.charAt(0).toUpperCase();

        const card = document.createElement('div');
        card.className = 'act-app-card';
        card.id = `act-card-${pkg}`;
        card.dataset.pkg = pkg;
        card.dataset.label = appName;
        card.style.cssText = 'background:var(--bg-secondary, #2c2c2e);border:1px solid var(--border-color, #3a3a3c);border-radius:10px;overflow:hidden;flex-shrink:0;display:flex;flex-direction:column;width:100%;box-sizing:border-box;transition:border-color 0.2s ease;';

        card.innerHTML = `
            <div class="act-app-header" style="padding:10px 12px;display:flex;align-items:center;gap:8px;cursor:pointer;user-select:none;width:100%;box-sizing:border-box;">
                <div style="position:relative;width:38px;height:38px;flex-shrink:0;">
                    <img src="ksu://icon/${pkg}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" style="width:38px;height:38px;border-radius:8px;object-fit:cover;background:var(--bg-card, #1c1c1e);">
                    <div style="display:none;width:38px;height:38px;border-radius:8px;background:var(--accent-blue, #0a84ff);align-items:center;justify-content:center;color:#fff;font-size:18px;font-weight:bold;">${firstLetter}</div>
                </div>
                <div style="flex:1;min-width:0;">
                    <div class="act-app-title" style="color:#fff;font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${appName}</div>
                    <div class="act-app-pkg" style="color:var(--text-secondary, #8e8e93);font-size:10px;font-family:monospace;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${pkg}${isSystem ? ' (System)' : ''}</div>
                </div>
                <button class="act-direct-launch-btn" style="padding:6px 12px;background:var(--accent-blue, #0a84ff);color:#fff;border:none;border-radius:6px;font-size:11px;font-weight:700;cursor:pointer;white-space:nowrap;flex-shrink:0;">Launch</button>
                <div class="act-arrow" style="font-size:10px;color:var(--text-secondary, #8e8e93);transition:transform 0.2s ease;padding:2px;flex-shrink:0;">▲</div>
            </div>
            <div class="act-activities-container" style="display:none;border-top:1px solid var(--border-color, #3a3a3c);background:var(--bg-card, #1c1c1e);padding:10px;width:100%;box-sizing:border-box;flex-direction:column;gap:8px;">
                <div class="act-loading-spinner" style="font-size:11px;color:var(--text-secondary, #8e8e93);text-align:center;padding:6px;">⚡ Decoding Binary APK Manifest...</div>
                <div class="act-activities-list" style="display:flex;flex-direction:column;gap:6px;width:100%;box-sizing:border-box;"></div>
            </div>
        `;

        const header = card.querySelector('.act-app-header');
        const launchBtn = card.querySelector('.act-direct-launch-btn');

        launchBtn.onclick = (e) => {
            e.stopPropagation();
            launchPrimaryApp(pkg, launchBtn);
        };

        header.onclick = (e) => {
            if (e.target === launchBtn || launchBtn.contains(e.target)) return;
            toggleAppActivities(pkg, card);
        };

        listEl.appendChild(card);
    });
}

async function launchPrimaryApp(pkg, btnEl) {
    const originalText = btnEl.innerText;
    btnEl.innerText = '⏳';
    btnEl.disabled = true;

    try {
        const cmd = `su -c "monkey -p ${pkg} -c android.intent.category.LAUNCHER 1 2>/dev/null || am start $(cmd package resolve-activity --brief ${pkg} 2>/dev/null | tail -n 1)"`;
        await execFn(cmd, 4000);
        
        btnEl.style.background = 'var(--accent-green, #30d158)';
        btnEl.innerText = '✅ Opened';
    } catch (e) {
        btnEl.style.background = 'var(--accent-red, #ff453a)';
        btnEl.innerText = '❌ Error';
    }

    setTimeout(() => {
        btnEl.style.background = 'var(--accent-blue, #0a84ff)';
        btnEl.innerText = originalText;
        btnEl.disabled = false;
    }, 1800);
}

// --- DYNAMIC CARD EXPAND & AUTO-CLEAR SEARCH SCOPE ---

async function toggleAppActivities(pkg, card) {
    const container = card.querySelector('.act-activities-container');
    const arrow = card.querySelector('.act-arrow');
    const spinner = card.querySelector('.act-loading-spinner');
    const actList = card.querySelector('.act-activities-list');
    const searchInput = document.getElementById('act-search');
    const clearBtn = document.getElementById('act-clear-search');

    const isExpanded = container.style.display === 'flex';

    if (isExpanded) {
        container.style.display = 'none';
        arrow.textContent = '▲';
        card.style.borderColor = 'var(--border-color, #3a3a3c)';
        activeExpandedPkg = null;

        if (searchInput) {
            searchInput.value = '';
            searchInput.placeholder = 'Search apps...';
        }
        if (clearBtn) clearBtn.style.display = 'none';

        filterApps('');
    } else {
        if (activeExpandedPkg && activeExpandedPkg !== pkg) {
            const prevCard = document.getElementById(`act-card-${activeExpandedPkg}`);
            if (prevCard) {
                const prevContainer = prevCard.querySelector('.act-activities-container');
                const prevArrow = prevCard.querySelector('.act-arrow');
                if (prevContainer) prevContainer.style.display = 'none';
                if (prevArrow) prevArrow.textContent = '▲';
                prevCard.style.borderColor = 'var(--border-color, #3a3a3c)';
            }
        }

        activeExpandedPkg = pkg;
        container.style.display = 'flex';
        arrow.textContent = '▼';
        card.style.borderColor = 'var(--accent-blue, #0a84ff)';

        if (searchInput) {
            searchInput.value = '';
            searchInput.placeholder = `🔍 Search in ${card.dataset.label}...`;
            searchInput.focus();
        }
        if (clearBtn) clearBtn.style.display = 'none';

        if (actList.children.length === 0) {
            actList.innerHTML = '';
            spinner.style.display = 'block';

            const activities = await fetchAllManifestActivities(pkg);
            spinner.style.display = 'none';

            if (!activities || activities.length === 0) {
                actList.innerHTML = '<div style="font-size:11px;color:var(--text-secondary, #8e8e93);padding:6px;text-align:center;">No activities found in binary manifest.</div>';
            } else {
                activities.forEach(itemInfo => {
                    let shortClass = itemInfo.fullClass;
                    if (shortClass.startsWith(pkg)) {
                        shortClass = shortClass.substring(pkg.length);
                        if (!shortClass.startsWith('.')) shortClass = '.' + shortClass;
                    }
                    const actComponent = `${pkg}/${shortClass}`;
                    const savedState = isItemSaved(actComponent);
                    
                    const itemData = {
                        displayTitle: itemInfo.displayTitle,
                        component: actComponent,
                        pkg: pkg
                    };

                    const item = document.createElement('div');
                    item.className = 'act-activity-item';
                    item.dataset.title = itemInfo.displayTitle.toLowerCase();
                    item.dataset.shortClass = shortClass.toLowerCase();
                    item.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 10px;background:var(--bg-secondary, #2c2c2e);border:1px solid var(--border-color, #3a3a3c);border-radius:6px;width:100%;box-sizing:border-box;';

                    item.innerHTML = `
                        <div style="flex:1;min-width:0;padding-right:6px;">
                            <div class="act-title" style="font-size:12px;font-weight:600;color:#fff;font-family:sans-serif;word-break:break-all;">${itemInfo.displayTitle}</div>
                            <div class="act-component" style="font-size:9px;color:var(--text-secondary, #8e8e93);font-family:monospace;margin-top:2px;word-break:break-all;">${actComponent}</div>
                        </div>
                        <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">
                            <button class="act-save-btn" data-save-component="${actComponent}" style="background:none;border:none;font-size:16px;cursor:pointer;padding:2px;color:${savedState ? '#ffd60a' : 'var(--text-secondary, #8e8e93)'};" title="${savedState ? 'Remove from Saved' : 'Save Shortcut'}">${savedState ? '⭐' : '☆'}</button>
                            <button class="act-sub-launch-btn" style="padding:5px 10px;background:var(--accent-blue, #0a84ff);color:#fff;border:none;border-radius:6px;font-size:10px;font-weight:700;cursor:pointer;white-space:nowrap;">Launch ➔</button>
                        </div>
                    `;

                    const btn = item.querySelector('.act-sub-launch-btn');
                    btn.onclick = (e) => {
                        e.stopPropagation();
                        launchSpecificActivity(actComponent, btn);
                    };

                    const saveBtn = item.querySelector('.act-save-btn');
                    saveBtn.onclick = (e) => {
                        e.stopPropagation();
                        toggleSaveItem(itemData);
                    };

                    actList.appendChild(item);
                });
            }
        }

        filterApps('');
    }
}

// --- BINARY AXML STRING POOL DECODER ---

async function fetchAllManifestActivities(pkg) {
    const foundClasses = new Set();
    const pkgEscaped = pkg.replace(/\./g, '\\.');

    try {
        const pathCmd = `su -c "pm path ${pkg} 2>/dev/null | head -n 1 | cut -d: -f2"`;
        const apkPath = (await execFn(pathCmd, 2500)).trim();

        if (apkPath) {
            const b64 = await execFn(`su -c "unzip -p '${apkPath}' AndroidManifest.xml | base64"`, 5000);
            if (b64 && b64.length > 50) {
                const binaryStr = atob(b64.replace(/\s/g, ''));
                const len = binaryStr.length;
                const bytes = new Uint8Array(len);
                for (let i = 0; i < len; i++) {
                    bytes[i] = binaryStr.charCodeAt(i);
                }

                let asciiStr = "";
                for (let i = 0; i < len; i++) {
                    const c = bytes[i];
                    asciiStr += (c >= 32 && c <= 126) ? String.fromCharCode(c) : " ";
                }

                let utf16Str = "";
                for (let i = 0; i < len - 1; i += 2) {
                    if (bytes[i + 1] === 0) {
                        const c = bytes[i];
                        utf16Str += (c >= 32 && c <= 126) ? String.fromCharCode(c) : " ";
                    } else {
                        utf16Str += " ";
                    }
                }

                const combinedPool = asciiStr + " " + utf16Str;

                const fullRegex = new RegExp(`${pkgEscaped}\\.([a-zA-Z0-9_.]+)`, 'g');
                let match;
                while ((match = fullRegex.exec(combinedPool)) !== null) {
                    const subPath = match[1].trim();
                    const fullClass = `${pkg}.${subPath}`;
                    
                    const parts = subPath.split('.');
                    const className = parts[parts.length - 1];

                    if (className && /^[A-Z][a-zA-Z0-9_]*$/.test(className)) {
                        const lower = subPath.toLowerCase();
                        if (!lower.includes('provider') && 
                            !lower.includes('receiver') && 
                            !lower.includes('service') && 
                            !lower.includes('permission')) {
                            foundClasses.add(fullClass);
                        }
                    }
                }

                const dotRegex = /\b\.([A-Z][a-zA-Z0-9_]+)\b/g;
                let dotMatch;
                while ((dotMatch = dotRegex.exec(combinedPool)) !== null) {
                    const cls = dotMatch[1].trim();
                    const lower = cls.toLowerCase();
                    if (!lower.includes('provider') && !lower.includes('receiver') && !lower.includes('service')) {
                        foundClasses.add(`${pkg}.${cls}`);
                    }
                }
            }
        }
    } catch (e) {
        console.warn('Activity Launcher: Binary AXML decoding error:', e);
    }

    try {
        const queryCmd = `su -c "cmd package query-activities --brief -p ${pkg} 2>/dev/null"`;
        const qRes = await execFn(queryCmd, 2000);
        if (qRes) {
            qRes.split('\n').forEach(line => {
                const trimmed = line.trim();
                if (trimmed.includes('/')) {
                    const cls = trimmed.split('/')[1];
                    if (cls) {
                        foundClasses.add(cls.startsWith('.') ? `${pkg}${cls}` : cls);
                    }
                }
            });
        }
    } catch (e) {}

    const items = Array.from(foundClasses).map(fullClass => {
        let className = fullClass.split('.').pop();
        let displayTitle = className.replace(/([a-z])([A-Z])/g, '$1 $2').trim();

        return { fullClass, displayTitle };
    });

    return items.sort((a, b) => {
        const aMain = a.displayTitle.includes('EngineerMode') || a.displayTitle.includes('Main');
        const bMain = b.displayTitle.includes('EngineerMode') || b.displayTitle.includes('Main');
        if (aMain && !bMain) return -1;
        if (!aMain && bMain) return 1;
        return a.displayTitle.localeCompare(b.displayTitle);
    });
}

async function launchSpecificActivity(component, btnEl) {
    const originalText = btnEl.innerText;
    btnEl.innerText = '⏳';
    btnEl.disabled = true;

    try {
        const cmd = `su -c "am start -n ${component} --user 0 2>/dev/null || am start -n ${component} 2>/dev/null || am start -a android.intent.action.MAIN -n ${component}"`;
        const res = await execFn(cmd, 4000);
        
        if (res && res.toLowerCase().includes('error')) {
            btnEl.style.background = 'var(--accent-red, #ff453a)';
            btnEl.innerText = '❌ Failed';
        } else {
            btnEl.style.background = 'var(--accent-green, #30d158)';
            btnEl.innerText = '✅ Sent';
        }
    } catch (e) {
        btnEl.style.background = 'var(--accent-red, #ff453a)';
        btnEl.innerText = '❌ Error';
    }

    setTimeout(() => {
        btnEl.style.background = 'var(--accent-blue, #0a84ff)';
        btnEl.innerText = originalText;
        btnEl.disabled = false;
    }, 1800);
}

// --- STRICT SUB-ACTIVITY SEARCH FILTER ---

function filterApps(query) {
    const q = query.toLowerCase().trim();
    const cards = document.querySelectorAll('.act-app-card');

    if (activeExpandedPkg) {
        cards.forEach(card => {
            if (card.dataset.pkg !== activeExpandedPkg) {
                card.style.display = 'none';
            } else {
                card.style.display = 'flex';
                const actItems = card.querySelectorAll('.act-activity-item');
                actItems.forEach(item => {
                    if (!q) {
                        item.style.display = 'flex';
                    } else {
                        const title = item.dataset.title || '';
                        const shortClass = item.dataset.shortClass || '';
                        
                        const matches = title.includes(q) || shortClass.includes(q);
                        item.style.display = matches ? 'flex' : 'none';
                    }
                });
            }
        });
        return;
    }

    cards.forEach(card => {
        const appName = (card.dataset.label || '').toLowerCase();
        const pkg = (card.dataset.pkg || '').toLowerCase();

        if (!q) {
            card.style.display = 'flex';
            return;
        }

        const matches = appName.includes(q) || pkg.includes(q);
        card.style.display = matches ? 'flex' : 'none';
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

window.ActivityLauncher = { init, showActivityLauncherModal, scanApps };
})();
