// freeze.js - App Freeze Manager (VERIFIED FIX)
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
            <p style="color:#8b92b4;font-size:12px;text-align:center;margin-bottom:20px;">Freeze/unfreeze user apps</p>
            
            <div style="display:flex;gap:8px;margin-bottom:15px;">
                <input type="text" id="freeze-search" placeholder="🔍 Search apps..." style="flex:1;padding:10px 12px;background:rgba(0,0,0,0.3);border:1px solid #06b6d4;border-radius:8px;color:#fff;font-size:12px;">
                <button id="freeze-refresh-btn" style="padding:10px 16px;background:rgba(6,182,212,0.3);color:#fff;border:1px solid #06b6d4;border-radius:8px;font-size:12px;cursor:pointer;">🔄</button>
            </div>
            
            <div id="freeze-scan-status" style="text-align:center;font-size:12px;color:#666;margin-bottom:15px;min-height:40px;padding:8px;background:rgba(0,0,0,0.2);border-radius:8px;">
                <span style="color:#06b6d4;">⚡ Loading...</span>
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
        if (searchInput) {
            searchInput.addEventListener('input', (e) => filterApps(e.target.value));
        }

        const refreshBtn = document.getElementById('freeze-refresh-btn');
        if (refreshBtn) {
            refreshBtn.onclick = async () => {
                await loadConfig();
                await scanApps();
            };
        }
        const thawAllBtn = document.getElementById('freeze-thaw-all');
        if (thawAllBtn) {
            thawAllBtn.onclick = async () => await toggleAllApps(false);
        }

        const cancelBtn = document.getElementById('freeze-cancel-btn');
        if (cancelBtn) {
            cancelBtn.onclick = () => modal.remove();
        }

        scanApps();
    }

    // ✅ VERIFY FROZEN STATUS
    async function isPackageFrozen(pkg) {
        try {
            // Check if file exists in frozen directory
            const checkFrozen = await execFn(`test -f ${FROZEN_DIR}/${pkg} && echo "yes" || echo "no"`);
            const inFrozen = checkFrozen.trim() === 'yes';
            
            // Also check thaw directory
            const checkThaw = await execFn(`test -f ${THAW_DIR}/${pkg} && echo "yes" || echo "no"`);
            const inThaw = checkThaw.trim() === 'yes';
            
            console.log(`${pkg}: frozen=${inFrozen}, thaw=${inThaw}`);
            return inFrozen && !inThaw;
        } catch (e) {
            console.error(`Failed to check ${pkg}:`, e);
            return false;
        }
    }

    async function scanApps() {
        const listEl = document.getElementById('freeze-list');
        const statusEl = document.getElementById('freeze-scan-status');
        if (!listEl || !statusEl) return;

        try {
            await execFn(`mkdir -p ${FROZEN_DIR} ${THAW_DIR} 2>/dev/null`);

            // Get all user apps
            const appsRaw = await execFn('pm list packages -f -3 2>/dev/null');
            const lines = appsRaw.trim().split('\n').filter(l => l);

            if (!lines.length) {
                statusEl.innerHTML = '<span style="color:#666;">No user apps found.</span>';
                listEl.style.display = 'none';
                return;
            }
            statusEl.textContent = `⚡ Checking ${lines.length} apps...`;
            listEl.style.display = 'flex';
            listEl.innerHTML = '';
            detectedApps = [];

            const colors = ['#06b6d4', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#ef4444', '#14b8a6'];

            for (const line of lines) {
                const apkMatch = line.match(/package:(.*\.apk)=([^\s]+)/);
                if (!apkMatch) continue;
                
                const apkPath = apkMatch[1];
                const pkg = apkMatch[2];

                // Extract name
                let appName = pkg;
                try {
                    const apkName = apkPath.split('/').pop().replace('.apk', '');
                    if (apkName && apkName !== 'base') {
                        appName = apkName.replace(/[_-]/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                    } else {
                        const parts = pkg.split('.');
                        appName = parts[parts.length - 1].replace(/([a-z])([A-Z])/g, '$1 $2');
                    }
                } catch (e) {}

                // ✅ VERIFY LIVE STATUS FOR EACH APP
                const isFrozen = await isPackageFrozen(pkg);

                detectedApps.push({ pkg, label: appName, isFrozen });

                const colorIdx = pkg.charCodeAt(0) % colors.length;
                const color = colors[colorIdx];
                const firstLetter = appName.charAt(0).toUpperCase();
                const statusColor = isFrozen ? '#06b6d4' : '#ef4444';
                const statusText = isFrozen ? '❄️ Frozen' : '🔓 Active';
                const btnBg = isFrozen ? '#06b6d4' : '#ef4444';
                const btnText = isFrozen ? 'Thaw' : 'Freeze';

                const appEl = document.createElement('div');
                appEl.id = `app-${pkg}`;
                appEl.style.cssText = 'background:rgba(0,0,0,0.3);border-radius:10px;padding:12px;display:flex;align-items:center;gap:12px;';
                appEl.innerHTML = `
                    <div style="width:48px;height:48px;border-radius:12px;background:linear-gradient(135deg,${color},${color}aa);display:flex;align-items:center;justify-content:center;color:#fff;font-size:24px;font-weight:bold;box-shadow:0 4px 12px rgba(0,0,0,0.3);">
                        ${firstLetter}
                    </div>
                    <div style="flex:1;min-width:0;">
                        <div style="color:#fff;font-size:14px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${appName}</div>
                        <div style="color:${statusColor};font-size:11px;margin-top:2px;">${statusText}</div>
                        <div style="color:#555;font-size:10px;font-family:monospace;margin-top:1px;">${pkg}</div>                    </div>
                    <button class="freeze-app-toggle" data-pkg="${pkg}" data-frozen="${isFrozen ? '1' : '0'}" 
                        style="background:${btnBg};color:#fff;border:none;padding:8px 16px;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap;min-width:70px;">
                        ${btnText}
                    </button>
                `;
                listEl.appendChild(appEl);
            }

            statusEl.style.display = 'none';
            console.log(`✅ Loaded ${detectedApps.length} apps`);

            // Bind toggle buttons
            listEl.querySelectorAll('.freeze-app-toggle').forEach(btn => {
                btn.onclick = async (e) => {
                    const pkg = e.currentTarget.dataset.pkg;
                    const currentlyFrozen = e.currentTarget.dataset.frozen === '1';
                    
                    e.currentTarget.disabled = true;
                    e.currentTarget.textContent = '⏳';
                    
                    try {
                        if (currentlyFrozen) {
                            // ✅ THAW: Remove from frozen, add to thaw
                            console.log(`🔓 Thawing ${pkg}...`);
                            await execFn(`rm -f ${FROZEN_DIR}/${pkg}`);
                            await execFn(`touch ${THAW_DIR}/${pkg}`);
                            await execFn(`pm unsuspend ${pkg} 2>/dev/null || true`);
                            
                            // Verify thaw worked
                            await new Promise(r => setTimeout(r, 300));
                            const verifyThaw = await isPackageFrozen(pkg);
                            console.log(`After thaw: ${pkg} is ${verifyThaw ? 'FROZEN' : 'THAWED'}`);
                            
                        } else {
                            // ✅ FREEZE: Remove from thaw, add to frozen
                            console.log(`❄️ Freezing ${pkg}...`);
                            await execFn(`rm -f ${THAW_DIR}/${pkg}`);
                            await execFn(`touch ${FROZEN_DIR}/${pkg}`);
                            await execFn(`pm suspend ${pkg} 2>/dev/null || true`);
                            
                            // Verify freeze worked
                            await new Promise(r => setTimeout(r, 300));
                            const verifyFreeze = await isPackageFrozen(pkg);
                            console.log(`After freeze: ${pkg} is ${verifyFreeze ? 'FROZEN' : 'ACTIVE'}`);
                        }
                        
                        frozenPackages[pkg] = currentlyFrozen ? '0' : '1';
                        await saveConfig();
                                                // ✅ COMPLETE REFRESH
                        showFreezeModal();
                        
                    } catch (err) {
                        console.error(`Failed ${pkg}:`, err);
                        e.currentTarget.textContent = currentlyFrozen ? 'Thaw' : 'Freeze';
                        e.currentTarget.disabled = false;
                    }
                };
            });

        } catch (e) {
            console.error('Scan failed:', e);
            statusEl.innerHTML = `<span style="color:#FF453A;">❌ Error: ${e.message}</span>`;
        }
    }

    function filterApps(query) {
        const listEl = document.getElementById('freeze-list');
        if (!listEl) return;
        const q = query.toLowerCase();
        const items = listEl.querySelectorAll('div[style*="background:rgba"]');
        items.forEach(item => {
            const name = item.querySelector('div:nth-child(2) div:first-child')?.textContent?.toLowerCase() || '';
            const pkg = item.querySelector('div:nth-child(2) div:nth-child(3)')?.textContent?.toLowerCase() || '';
            item.style.display = (name.includes(q) || pkg.includes(q)) ? 'flex' : 'none';
        });
    }

    async function toggleAllApps(freeze) {
        const statusEl = document.getElementById('freeze-scan-status');
        if (!statusEl) return;

        statusEl.style.display = 'block';
        statusEl.innerHTML = `<span style="color:#06b6d4;">🔄 ${freeze ? 'Freezing' : 'Thawing'}...</span>`;

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
            }
            
            await saveConfig();            statusEl.innerHTML = `<span style="color:#32D74B;">✅ Done</span>`;
            await new Promise(r => setTimeout(r, 500));
            showFreezeModal();
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