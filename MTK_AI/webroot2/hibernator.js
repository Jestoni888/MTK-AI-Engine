(function() {
    'use strict';

    const execFn = window.exec || async function(cmd, timeout = 5000) {
        return new Promise(resolve => {
            const cb = `hib_exec_${Date.now()}_${Math.random().toString(36).substring(2)}`;
            const t = setTimeout(() => { delete window[cb]; resolve(''); }, timeout);
            window[cb] = (_, res) => { clearTimeout(t); delete window[cb]; resolve(res || ''); };
            if (window.ksu) ksu.exec(cmd, `window.${cb}`);
            else { clearTimeout(t); resolve(''); }
        });
    };

    const CONFIG_DIR = '/sdcard/MTK_AI_Engine/config';
    const THRESHOLD_FILE = `${CONFIG_DIR}/ram_threshold.txt`;
    const FORCE_KILL_FILE = `${CONFIG_DIR}/force_kill.list`;
    const NEVER_KILL_FILE = `${CONFIG_DIR}/never_kill.list`;
    const ENABLE_CLEANER_FILE = '/sdcard/MTK_AI_Engine/enable_cleaner';

    const CRITICAL_APPS = [
        'com.android.systemui',
        'com.android.phone',
        'com.android.stk',
        'com.google.android.gms',
        'com.google.android.gsf',
        'com.google.android.packageinstaller',
        'com.android.settings',
        'com.google.android.setupwizard',
        'com.android.launcher3',
        'com.google.android.inputmethod.latin',
        'android',
        'com.android.providers.settings',
        'com.android.providers.downloads',
        'com.android.providers.media.module',
        'com.android.externalstorage',
        'com.android.documentsui',
        'com.android.permissioncontroller',
        'com.android.vending'
    ];

    let installedPackages = [];
    let forceKillList = [];
    let neverKillList = [];

    async function init() {
        const btn = document.getElementById('hibernator-btn');
        if (btn) btn.addEventListener('click', showHibernatorModal);
    }

    async function showHibernatorModal() {        const existing = document.getElementById('hibernator-modal');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = 'hibernator-modal';
        modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:10000;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(5px);';

        const box = document.createElement('div');
        box.style.cssText = 'background:linear-gradient(135deg,#1a1f3a,#2d3561);border:2px solid #3b82f6;border-radius:20px;padding:24px;width:95%;max-width:640px;max-height:90vh;overflow-y:auto;';

        box.innerHTML = `
            <h3 style="color:#3b82f6;margin:0 0 5px;font-size:20px;text-align:center;">❄️ RAM Hibernator</h3>
            <p style="color:#8b92b4;font-size:12px;text-align:center;margin-bottom:20px;">Manage auto-kill rules per app</p>

            <!-- AUTO RAM CLEANER TOGGLE -->
            <div style="background:rgba(255,255,255,0.05);border-radius:12px;padding:14px;margin-bottom:20px;display:flex;align-items:center;justify-content:space-between;">
                <div style="display:flex;align-items:center;gap:12px;flex:1;">
                    <div style="width:36px;height:36px;background:rgba(59,130,246,0.2);border-radius:8px;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                        <span style="color:#3b82f6;font-size:16px;">🧹</span>
                    </div>
                    <div>
                        <div style="color:#fff;font-size:13px;font-weight:600;">Auto Ram Cleaner</div>
                        <div style="color:#8b92b4;font-size:11px;">Periodically clean ram & force-stop background apps</div>
                    </div>
                </div>
                <label style="position:relative;display:inline-block;width:44px;height:24px;cursor:pointer;">
                    <input type="checkbox" id="enable-cleaner-toggle" style="opacity:0;width:0;height:0;">
                    <span id="toggle-slider" style="position:absolute;cursor:pointer;top:0;left:0;right:0;bottom:0;background-color:#4b5563;transition:.3s;border-radius:24px;">
                        <span style="position:absolute;content:'';height:18px;width:18px;left:3px;bottom:3px;background-color:white;transition:.3s;border-radius:50%;"></span>
                    </span>
                </label>
            </div>

            <div style="margin-bottom:25px;">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
                    <label style="color:#fff;font-size:13px;font-weight:600;">RAM usage Threshold to trigger hibernator</label>
                    <span id="threshold-value" style="color:#3b82f6;font-size:16px;font-weight:700;background:rgba(59,130,246,0.15);padding:4px 12px;border-radius:6px;">60%</span>
                </div>
                <input type="range" id="hib-threshold" min="30" max="90" value="60" step="5"
                    style="width:100%;height:8px;background:rgba(255,255,255,0.1);border-radius:4px;outline:none;-webkit-appearance:none;">
                <div style="display:flex;justify-content:space-between;margin-top:6px;">
                    <span style="color:#6b7280;font-size:10px;">30%</span>
                    <span style="color:#6b7280;font-size:10px;">60%</span>
                    <span style="color:#6b7280;font-size:10px;">90%</span>
                </div>
            </div>

            <div style="margin-bottom:15px;">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;flex-wrap:wrap;gap:8px;">
                    <div style="display:flex;align-items:center;gap:10px;">                        <label style="color:#fff;font-size:13px;font-weight:600;">📦 Installed Apps</label>
                        <span id="app-count" style="color:#8b92b4;font-size:11px;"></span>
                    </div>
                    <div style="display:flex;gap:6px;flex-wrap:wrap;">
                        <button id="kill-all-now-btn" style="padding:6px 12px;background:linear-gradient(135deg,#dc2626,#b91c1c);color:#fff;border:none;border-radius:8px;font-size:11px;cursor:pointer;font-weight:600;display:flex;align-items:center;gap:4px;white-space:nowrap;">
                            ☠️ Kill All Now
                        </button>
                        <button id="bulk-force-btn" style="padding:6px 12px;background:linear-gradient(135deg,#ef4444,#dc2626);color:#fff;border:none;border-radius:8px;font-size:11px;cursor:pointer;font-weight:600;display:flex;align-items:center;gap:4px;white-space:nowrap;">
                            ⚡ Add All to Force Kill
                        </button>
                        <button id="bulk-never-btn" style="padding:6px 12px;background:linear-gradient(135deg,#10b981,#059669);color:#fff;border:none;border-radius:8px;font-size:11px;cursor:pointer;font-weight:600;display:flex;align-items:center;gap:4px;white-space:nowrap;">
                            🛡️ Protect All
                        </button>
                        <button id="clear-all-btn" style="padding:6px 12px;background:rgba(107,114,128,0.3);color:#fff;border:none;border-radius:8px;font-size:11px;cursor:pointer;font-weight:600;white-space:nowrap;">
                            Clear Lists
                        </button>
                    </div>
                </div>
                <input type="text" id="hib-pkg-search" placeholder="🔍 Search apps..." 
                    style="width:100%;padding:10px;background:rgba(0,0,0,0.3);border:1px solid #4b5563;border-radius:10px;color:#fff;font-size:12px;outline:none;margin-bottom:10px;">
                <div id="hib-pkg-list" style="max-height:380px;overflow-y:auto;">
                    <div style="padding:20px;color:#8b92b4;text-align:center;font-size:12px;">
                        <div style="margin-bottom:8px;">⏳ Loading apps...</div>
                        <div style="font-size:11px;">Please wait</div>
                    </div>
                </div>
            </div>

            <div id="hib-status" style="text-align:center;color:#fbbf24;font-size:12px;margin-bottom:15px;min-height:18px;"></div>

            <div style="display:flex;gap:10px;">
                <button id="hib-save-btn" style="flex:1;padding:12px;background:linear-gradient(135deg,#3b82f6,#2563eb);color:#fff;border:none;border-radius:10px;font-size:13px;font-weight:600;cursor:pointer;transition:all 0.2s;">
                    💾 Save Config
                </button>
                <button id="hib-close-btn" style="flex:1;padding:12px;background:rgba(255,255,255,0.1);color:#fff;border:none;border-radius:10px;font-size:13px;cursor:pointer;transition:all 0.2s;">
                    Close
                </button>
            </div>
        `;

        modal.appendChild(box);
        document.body.appendChild(modal);
        modal.onclick = e => { if (e.target === modal) modal.remove(); };
        document.getElementById('hib-close-btn').onclick = () => modal.remove();

        const slider = document.getElementById('hib-threshold');
        const thresholdValue = document.getElementById('threshold-value');
        slider.oninput = function() {
            thresholdValue.textContent = this.value + '%';
        };
        // Toggle switch logic
        const toggle = document.getElementById('enable-cleaner-toggle');
        const toggleSlider = document.getElementById('toggle-slider');
        
        // Update toggle visual state
        function updateToggleVisual() {
            if (toggle.checked) {
                toggleSlider.style.backgroundColor = '#3b82f6';
                toggleSlider.querySelector('span').style.transform = 'translateX(20px)';
            } else {
                toggleSlider.style.backgroundColor = '#4b5563';
                toggleSlider.querySelector('span').style.transform = 'translateX(0)';
            }
        }

        toggle.onchange = async function() {
            try {
                if (this.checked) {
                    // ENABLE: Create the flag file
                    await execFn(`touch ${ENABLE_CLEANER_FILE}`);
                } else {
                    // DISABLE: Remove the flag file
                    await execFn(`rm -f ${ENABLE_CLEANER_FILE}`);
                }
                const statusEl = document.getElementById('hib-status');
                statusEl.textContent = `✅ Auto RAM Cleaner ${this.checked ? 'Enabled' : 'Disabled'}`;
                statusEl.style.color = '#10b981';
                setTimeout(() => { statusEl.textContent = ''; }, 2000);
            } catch (e) { 
                console.error(e); 
            }
            updateToggleVisual();
        };

        document.getElementById('kill-all-now-btn').onclick = () => killAllRunningNow();
        document.getElementById('bulk-force-btn').onclick = () => bulkAddToForceKill();
        document.getElementById('bulk-never-btn').onclick = () => bulkAddToNeverKill();
        document.getElementById('clear-all-btn').onclick = () => clearAllLists();

        document.getElementById('hib-pkg-search').addEventListener('input', filterPackages);
        document.getElementById('hib-save-btn').onclick = saveConfigs;

        await loadConfigs();
        await loadCleanerToggle();
        await loadPackages();
    }

    async function loadCleanerToggle() {
        try {            const exists = await execFn(`test -f ${ENABLE_CLEANER_FILE} && echo "yes" || echo "no"`);
            const toggle = document.getElementById('enable-cleaner-toggle');
            toggle.checked = exists.trim() === "yes";
            
            // Update visual state
            const toggleSlider = document.getElementById('toggle-slider');
            if (toggle.checked) {
                toggleSlider.style.backgroundColor = '#3b82f6';
                toggleSlider.querySelector('span').style.transform = 'translateX(20px)';
            }
        } catch (e) {
            console.error('Failed to load toggle state:', e);
        }
    }

    function isCriticalApp(pkg) {
        return CRITICAL_APPS.includes(pkg) || 
               pkg.startsWith('android.hardware.') || 
               pkg.startsWith('android.system.') || 
               pkg.startsWith('vendor.') ||
               pkg.startsWith('com.android.system') ||
               pkg === 'com.google.android.webview';
    }

    async function loadPackages() {
        const listEl = document.getElementById('hib-pkg-list');
        const appCountEl = document.getElementById('app-count');
        
        try {
            const raw = await execFn('pm list packages 2>/dev/null | cut -d: -f2 | sort -u');
            installedPackages = raw.trim().split('\n').filter(p => p.trim());
            
            renderPackages(installedPackages);
            appCountEl.textContent = `${installedPackages.length} apps`;
        } catch (e) {
            console.error('Load error:', e);
            listEl.innerHTML = '<div style="padding:10px;color:#ef4444;text-align:center;font-size:12px;">Failed to load apps</div>';
            appCountEl.textContent = 'Error';
        }
    }

    async function getAppRunningInfo(pkg) {
        try {
            const psOutput = await execFn(`ps -A -o PID,NAME 2>/dev/null | grep -E "(${pkg}|${pkg.replace(/\./g, '\\.')})" || echo ""`);
            const lines = psOutput.trim().split('\n').filter(l => l.trim());
            
            if (lines.length > 0) {
                const pid = lines[0].trim().split(/\s+/)[0];
                const memInfo = await execFn(`cat /proc/${pid}/status 2>/dev/null | grep -E "^(VmRSS|Threads):" || echo ""`);
                                return {
                    isRunning: true,
                    pid: pid,
                    processCount: lines.length,
                    memInfo: memInfo
                };
            }
            return { isRunning: false };
        } catch (e) {
            return { isRunning: false, error: true };
        }
    }

    async function showAppDetails(pkg) {
        const runningInfo = await getAppRunningInfo(pkg);
        const inForceKill = forceKillList.includes(pkg);
        const inNeverKill = neverKillList.includes(pkg);
        const isCritical = isCriticalApp(pkg);

        const detailModal = document.createElement('div');
        detailModal.id = 'app-detail-modal';
        detailModal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.9);z-index:10001;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(5px);';

        let statusBadge = '';
        if (isCritical) {
            statusBadge = '<span style="color:#f59e0b;font-size:11px;font-weight:700;padding:4px 10px;background:rgba(245,158,11,0.2);border-radius:4px;">CRITICAL - LOCKED</span>';
        } else if (inForceKill) {
            statusBadge = '<span style="color:#ef4444;font-size:11px;font-weight:700;padding:4px 10px;background:rgba(239,68,68,0.2);border-radius:4px;">IN FORCE KILL LIST</span>';
        } else if (inNeverKill) {
            statusBadge = '<span style="color:#10b981;font-size:11px;font-weight:700;padding:4px 10px;background:rgba(16,185,129,0.2);border-radius:4px;">PROTECTED</span>';
        } else {
            statusBadge = '<span style="color:#6b7280;font-size:11px;font-weight:600;padding:4px 10px;background:rgba(107,114,128,0.15);border-radius:4px;">INACTIVE</span>';
        }

        let runningStatus = '';
        if (runningInfo.isRunning) {
            runningStatus = `
                <div style="background:rgba(239,68,68,0.1);border:1px solid #ef4444;border-radius:10px;padding:15px;margin-bottom:15px;">
                    <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
                        <div style="width:10px;height:10px;background:#ef4444;border-radius:50%;animation:pulse 2s infinite;"></div>
                        <span style="color:#ef4444;font-size:13px;font-weight:700;">● RUNNING</span>
                    </div>
                    <div style="color:#fff;font-size:12px;margin-bottom:8px;">PID: <span style="color:#fca5a5;font-family:monospace;">${runningInfo.pid}</span></div>
                    <div style="color:#fff;font-size:12px;margin-bottom:12px;">Processes: <span style="color:#fca5a5;">${runningInfo.processCount}</span></div>
                    ${runningInfo.memInfo ? `<div style="background:rgba(0,0,0,0.3);border-radius:6px;padding:8px;margin-bottom:12px;"><pre style="color:#8b92b4;font-size:10px;margin:0;font-family:monospace;">${runningInfo.memInfo}</pre></div>` : ''}
                    <button id="force-stop-btn" style="width:100%;padding:10px;background:linear-gradient(135deg,#ef4444,#dc2626);color:#fff;border:none;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;">
                        ☠️ Force Stop Now
                    </button>
                </div>
            `;        } else {
            runningStatus = `
                <div style="background:rgba(16,185,129,0.1);border:1px solid #10b981;border-radius:10px;padding:15px;margin-bottom:15px;">
                    <div style="display:flex;align-items:center;gap:8px;">
                        <div style="width:10px;height:10px;background:#10b981;border-radius:50%;"></div>
                        <span style="color:#10b981;font-size:13px;font-weight:700;">● NOT RUNNING</span>
                    </div>
                    <div style="color:#8b92b4;font-size:11px;margin-top:8px;">App is currently stopped</div>
                </div>
            `;
        }

        detailModal.innerHTML = `
            <div style="background:linear-gradient(135deg,#1a1f3a,#2d3561);border:2px solid #3b82f6;border-radius:20px;padding:24px;width:95%;max-width:450px;position:relative;">
                <button id="detail-close-btn" style="position:absolute;top:12px;right:12px;background:rgba(255,255,255,0.1);border:none;border-radius:50%;width:32px;height:32px;color:#fff;cursor:pointer;font-size:16px;">✕</button>
                
                <div style="display:flex;align-items:center;gap:12px;margin-bottom:15px;">
                    <img src="ksu://icon/${pkg}" 
                        onerror="this.src='data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0OCIgaGVpZ2h0PSI0OCI+PHJlY3Qgd2lkdGg9IjQ4IiBoZWlnaHQ9IjQ4IiBmaWxsPSIjMzMzIi8+PHRleHQgeD0iMjQiIHk9IjMwIiBmb250LXNpemU9IjI0IiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmaWxsPSIjZmZmIj7wn5mFPC90ZXh0Pjwvc3ZnPg=='" 
                        style="width:56px;height:56px;border-radius:12px;object-fit:cover;">
                    <div style="flex:1;min-width:0;">
                        <div style="color:#fff;font-size:16px;font-weight:700;margin-bottom:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${getAppName(pkg)}</div>
                        <div style="color:#8b92b4;font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:monospace;">${pkg}</div>
                    </div>
                </div>

                ${statusBadge}

                <div style="margin-top:15px;">
                    <div style="color:#fff;font-size:13px;font-weight:600;margin-bottom:10px;">Status</div>
                    ${runningStatus}
                </div>

                <div style="display:flex;gap:8px;margin-top:15px;">
                    ${!isCritical ? `
                    <button id="modal-force-btn" data-action="force" style="flex:1;padding:10px;background:${inForceKill ? '#ef4444' : 'rgba(239,68,68,0.15)'};color:${inForceKill ? '#fff' : '#fca5a5'};border:none;border-radius:8px;font-size:11px;cursor:pointer;font-weight:600;">
                        ${inForceKill ? '✓ Remove from Force Kill' : '⚡ Add to Force Kill'}
                    </button>
                    <button id="modal-never-btn" data-action="never" style="flex:1;padding:10px;background:${inNeverKill ? '#10b981' : 'rgba(16,185,129,0.15)'};color:${inNeverKill ? '#fff' : '#6ee7b7'};border:none;border-radius:8px;font-size:11px;cursor:pointer;font-weight:600;">
                        ${inNeverKill ? '✓ Remove Protection' : '🛡️ Protect'}
                    </button>
                    ` : '<div style="flex:1;text-align:center;color:#6b7280;font-size:11px;">Cannot modify critical app</div>'}
                </div>
            </div>
        `;

        document.body.appendChild(detailModal);
        detailModal.onclick = e => { if (e.target === detailModal) detailModal.remove(); };
        document.getElementById('detail-close-btn').onclick = () => detailModal.remove();
        if (!isCritical) {
            document.getElementById('modal-force-btn').onclick = () => {
                togglePackage(pkg, 'force');
                detailModal.remove();
                const q = document.getElementById('hib-pkg-search').value.toLowerCase().trim();
                const filtered = q ? installedPackages.filter(p => p.toLowerCase().includes(q)) : installedPackages;
                renderPackages(filtered);
            };
            document.getElementById('modal-never-btn').onclick = () => {
                togglePackage(pkg, 'never');
                detailModal.remove();
                const q = document.getElementById('hib-pkg-search').value.toLowerCase().trim();
                const filtered = q ? installedPackages.filter(p => p.toLowerCase().includes(q)) : installedPackages;
                renderPackages(filtered);
            };
        }

        if (runningInfo.isRunning) {
            document.getElementById('force-stop-btn').onclick = async () => {
                const btn = document.getElementById('force-stop-btn');
                btn.disabled = true;
                btn.innerHTML = '⏳ Stopping...';
                
                try {
                    await execFn(`am force-stop ${pkg}`);
                    await new Promise(r => setTimeout(r, 500));
                    
                    const check = await getAppRunningInfo(pkg);
                    if (!check.isRunning) {
                        btn.innerHTML = '✅ Stopped Successfully';
                        btn.style.background = '#10b981';
                        setTimeout(() => detailModal.remove(), 800);
                    } else {
                        btn.innerHTML = '⚠️ Still Running';
                        btn.style.background = '#f59e0b';
                    }
                } catch (e) {
                    btn.innerHTML = '❌ Failed';
                    btn.style.background = '#ef4444';
                }
            };
        }
    }

    function renderPackages(pkgs) {
        const listEl = document.getElementById('hib-pkg-list');
        if (pkgs.length === 0) {
            listEl.innerHTML = '<div style="padding:20px;color:#8b92b4;text-align:center;font-size:12px;">No matching packages found</div>';
            return;
        }
        listEl.innerHTML = pkgs.map(pkg => {
            const inForceKill = forceKillList.includes(pkg);
            const inNeverKill = neverKillList.includes(pkg);
            const isCritical = isCriticalApp(pkg);
            
            let statusHtml = '';
            let forceBtnStyle = 'background:rgba(239,68,68,0.15);color:#fca5a5;';
            let neverBtnStyle = 'background:rgba(16,185,129,0.15);color:#6ee7b7;';
            let forceBtnText = '⚡ Force Kill';
            let neverBtnText = '🛡️ Never Kill';
            let forceDisabled = isCritical ? 'disabled style="opacity:0.5;cursor:not-allowed;"' : '';
            let neverDisabled = isCritical ? 'disabled style="opacity:0.5;cursor:not-allowed;"' : '';

            if (isCritical) {
                statusHtml = '<span style="color:#f59e0b;font-size:10px;font-weight:700;padding:3px 8px;background:rgba(245,158,11,0.2);border-radius:4px;">CRITICAL</span>';
                forceBtnText = '🔒 Locked';
                neverBtnText = '🔒 Locked';
            } else if (inForceKill) {
                statusHtml = '<span style="color:#ef4444;font-size:10px;font-weight:700;padding:3px 8px;background:rgba(239,68,68,0.2);border-radius:4px;">ACTIVE</span>';
                forceBtnStyle = 'background:#ef4444;color:#fff;';
                forceBtnText = '✓ Active';
            } else if (inNeverKill) {
                statusHtml = '<span style="color:#10b981;font-size:10px;font-weight:700;padding:3px 8px;background:rgba(16,185,129,0.2);border-radius:4px;">PROTECTED</span>';
                neverBtnStyle = 'background:#10b981;color:#fff;';
                neverBtnText = '✓ Protected';
            } else {
                statusHtml = '<span style="color:#6b7280;font-size:10px;font-weight:600;padding:3px 8px;background:rgba(107,114,128,0.15);border-radius:4px;">INACTIVE</span>';
            }

            return `
            <div class="app-item" style="display:flex;align-items:center;gap:12px;padding:12px;margin-bottom:8px;background:rgba(255,255,255,0.05);border-radius:12px;transition:all 0.2s;cursor:pointer;" onmouseover="this.style.background='rgba(255,255,255,0.1)'" onmouseout="this.style.background='rgba(255,255,255,0.05)'">
                <img src="ksu://icon/${pkg}" 
                    onerror="this.src='data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0OCIgaGVpZ2h0PSI0OCI+PHJlY3Qgd2lkdGg9IjQ4IiBoZWlnaHQ9IjQ4IiBmaWxsPSIjMzMzIi8+PHRleHQgeD0iMjQiIHk9IjMwIiBmb250LXNpemU9IjI0IiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmaWxsPSIjZmZmIj7wn5mFPC90ZXh0Pjwvc3ZnPg=='" 
                    style="width:44px;height:44px;border-radius:10px;object-fit:cover;flex-shrink:0;background:rgba(0,0,0,0.2);">
                
                <div style="flex:1;min-width:0;">
                    <div style="display:flex;align-items:center;gap:8px;margin-bottom:2px;">
                        <span style="color:#fff;font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${getAppName(pkg)}</span>
                        ${statusHtml}
                    </div>
                    <div style="color:#8b92b4;font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${pkg}</div>
                </div>

                <div style="display:flex;flex-direction:column;gap:6px;flex-shrink:0;">
                    <button data-pkg="${pkg}" data-action="force" class="toggle-btn" 
                        ${forceDisabled} style="${forceBtnStyle}padding:6px 10px;border:none;border-radius:6px;font-size:10px;cursor:pointer;font-weight:600;white-space:nowrap;transition:all 0.2s;min-width:85px;">
                        ${forceBtnText}
                    </button>
                    <button data-pkg="${pkg}" data-action="never" class="toggle-btn"                         ${neverDisabled} style="${neverBtnStyle}padding:6px 10px;border:none;border-radius:6px;font-size:10px;cursor:pointer;font-weight:600;white-space:nowrap;transition:all 0.2s;min-width:85px;">
                        ${neverBtnText}
                    </button>
                </div>
            </div>
            `;
        }).join('');

        listEl.querySelectorAll('.app-item').forEach(item => {
            item.onclick = (e) => {
                if (!e.target.classList.contains('toggle-btn')) {
                    const pkg = item.querySelector('.toggle-btn').dataset.pkg;
                    showAppDetails(pkg);
                }
            };
        });

        listEl.querySelectorAll('.toggle-btn:not([disabled])').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                togglePackage(btn.dataset.pkg, btn.dataset.action);
            };
        });
    }

    function getAppName(pkg) {
        const parts = pkg.split('.');
        const lastPart = parts[parts.length - 1];
        return lastPart.charAt(0).toUpperCase() + lastPart.slice(1).replace(/_/g, ' ');
    }

    function filterPackages() {
        const q = document.getElementById('hib-pkg-search').value.toLowerCase().trim();
        if (!q) return renderPackages(installedPackages);
        renderPackages(installedPackages.filter(pkg => pkg.toLowerCase().includes(q)));
    }

    function togglePackage(pkg, action) {
        if (isCriticalApp(pkg)) return;
        
        if (action === 'force') {
            const forceIdx = forceKillList.indexOf(pkg);
            const neverIdx = neverKillList.indexOf(pkg);
            
            if (forceIdx > -1) {
                forceKillList.splice(forceIdx, 1);
            } else {
                forceKillList.push(pkg);
                if (neverIdx > -1) neverKillList.splice(neverIdx, 1);
            }        } else if (action === 'never') {
            const forceIdx = forceKillList.indexOf(pkg);
            const neverIdx = neverKillList.indexOf(pkg);
            
            if (neverIdx > -1) {
                neverKillList.splice(neverIdx, 1);
            } else {
                neverKillList.push(pkg);
                if (forceIdx > -1) forceKillList.splice(forceIdx, 1);
            }
        }
        
        const q = document.getElementById('hib-pkg-search').value.toLowerCase().trim();
        const filtered = q ? installedPackages.filter(pkg => pkg.toLowerCase().includes(q)) : installedPackages;
        renderPackages(filtered);
    }

    async function killAllRunningNow() {
        const statusEl = document.getElementById('hib-status');
        const btn = document.getElementById('kill-all-now-btn');
        
        const runningApps = [];
        for (const pkg of forceKillList) {
            const info = await getAppRunningInfo(pkg);
            if (info.isRunning) {
                runningApps.push(pkg);
            }
        }
        
        if (runningApps.length === 0) {
            statusEl.textContent = 'ℹ️ No apps from Force Kill list are currently running';
            statusEl.style.color = '#6b7280';
            setTimeout(() => { statusEl.textContent = ''; }, 2500);
            return;
        }
        
        if (!confirm(`Kill ${runningApps.length} running apps NOW?\n\n${runningApps.join('\n')}\n\nThis will force stop them immediately.`)) {
            return;
        }
        
        btn.disabled = true;
        btn.innerHTML = '☠️ Killing...';
        statusEl.textContent = `⏳ Killing ${runningApps.length} apps...`;
        statusEl.style.color = '#fbbf24';
        
        let killedCount = 0;
        for (const pkg of runningApps) {
            try {
                await execFn(`am force-stop ${pkg}`);
                killedCount++;                statusEl.textContent = `☠️ Killed ${killedCount}/${runningApps.length}: ${getAppName(pkg)}`;
                await new Promise(r => setTimeout(r, 300));
            } catch (e) {
                console.error(`Failed to kill ${pkg}:`, e);
            }
        }
        
        btn.disabled = false;
        btn.innerHTML = '☠️ Kill All Now';
        statusEl.textContent = `✅ Successfully killed ${killedCount}/${runningApps.length} apps`;
        statusEl.style.color = '#10b981';
        setTimeout(() => { statusEl.textContent = ''; }, 3000);
        
        const q = document.getElementById('hib-pkg-search').value.toLowerCase().trim();
        const filtered = q ? installedPackages.filter(pkg => pkg.toLowerCase().includes(q)) : installedPackages;
        renderPackages(filtered);
    }

    async function bulkAddToForceKill() {
        const statusEl = document.getElementById('hib-status');
        const nonCritical = installedPackages.filter(pkg => !isCriticalApp(pkg) && !forceKillList.includes(pkg));
        
        if (nonCritical.length === 0) {
            statusEl.textContent = 'ℹ️ All eligible apps already in Force Kill list';
            statusEl.style.color = '#6b7280';
            return;
        }
        
        if (!confirm(`Add ${nonCritical.length} apps to Force Kill list?\n\nCritical system apps will be excluded automatically.`)) {
            return;
        }
        
        statusEl.textContent = `⏳ Adding ${nonCritical.length} apps to Force Kill...`;
        statusEl.style.color = '#fbbf24';
        
        nonCritical.forEach(pkg => {
            if (!forceKillList.includes(pkg)) {
                forceKillList.push(pkg);
                const idx = neverKillList.indexOf(pkg);
                if (idx > -1) neverKillList.splice(idx, 1);
            }
        });
        
        renderPackages(installedPackages);
        statusEl.textContent = `✅ Added ${nonCritical.length} apps to Force Kill list`;
        statusEl.style.color = '#10b981';
        setTimeout(() => { statusEl.textContent = ''; }, 2500);
    }

    async function bulkAddToNeverKill() {        const statusEl = document.getElementById('hib-status');
        const nonCritical = installedPackages.filter(pkg => !isCriticalApp(pkg) && !neverKillList.includes(pkg));
        
        if (nonCritical.length === 0) {
            statusEl.textContent = 'ℹ️ All eligible apps already protected';
            statusEl.style.color = '#6b7280';
            return;
        }
        
        if (!confirm(`Protect ${nonCritical.length} apps from being killed?\n\nCritical system apps are always protected.`)) {
            return;
        }
        
        statusEl.textContent = `⏳ Protecting ${nonCritical.length} apps...`;
        statusEl.style.color = '#fbbf24';
        
        nonCritical.forEach(pkg => {
            if (!neverKillList.includes(pkg)) {
                neverKillList.push(pkg);
                const idx = forceKillList.indexOf(pkg);
                if (idx > -1) forceKillList.splice(idx, 1);
            }
        });
        
        renderPackages(installedPackages);
        statusEl.textContent = `✅ Protected ${nonCritical.length} apps`;
        statusEl.style.color = '#10b981';
        setTimeout(() => { statusEl.textContent = ''; }, 2500);
    }

    function clearAllLists() {
        if (!confirm('Clear both Force Kill and Never Kill lists?\n\nThis will reset all app rules.')) {
            return;
        }
        
        forceKillList = [];
        neverKillList = [];
        renderPackages(installedPackages);
        
        const statusEl = document.getElementById('hib-status');
        statusEl.textContent = '✅ All lists cleared';
        statusEl.style.color = '#10b981';
        setTimeout(() => { statusEl.textContent = ''; }, 2000);
    }

    async function loadConfigs() {
        const statusEl = document.getElementById('hib-status');
        statusEl.textContent = 'Loading configs...';
        statusEl.style.color = '#fbbf24';
        try {
            await execFn(`mkdir -p ${CONFIG_DIR}`);
            const threshold = (await execFn(`cat ${THRESHOLD_FILE} 2>/dev/null`)).trim();
            const forceKill = (await execFn(`cat ${FORCE_KILL_FILE} 2>/dev/null`)).trim();
            const neverKill = (await execFn(`cat ${NEVER_KILL_FILE} 2>/dev/null`)).trim();

            const thresholdNum = parseInt(threshold) || 60;
            document.getElementById('hib-threshold').value = thresholdNum;
            document.getElementById('threshold-value').textContent = thresholdNum + '%';
            
            forceKillList = forceKill ? forceKill.split('\n').map(l => l.trim()).filter(l => l) : [];
            neverKillList = neverKill ? neverKill.split('\n').map(l => l.trim()).filter(l => l) : [];
            
            statusEl.textContent = '✅ Configs loaded';
            statusEl.style.color = '#10b981';
        } catch (e) {
            statusEl.textContent = '⚠️ Failed to load configs';
            statusEl.style.color = '#ef4444';
        }
    }

    async function writeConfigFile(path, content) {
        const escaped = content.replace(/'/g, "'\\''").replace(/\n/g, '\\n');
        await execFn(`printf '%b\\n' '${escaped}' > ${path}`);
    }

    async function saveConfigs() {
        const statusEl = document.getElementById('hib-status');
        const saveBtn = document.getElementById('hib-save-btn');
        saveBtn.disabled = true;
        saveBtn.innerHTML = '💾 Saving...';
        statusEl.textContent = 'Writing to disk...';
        statusEl.style.color = '#fbbf24';

        const threshold = document.getElementById('hib-threshold').value;
        const forceKill = forceKillList.join('\n');
        const neverKill = neverKillList.join('\n');

        try {
            await writeConfigFile(THRESHOLD_FILE, threshold);
            await writeConfigFile(FORCE_KILL_FILE, forceKill);
            await writeConfigFile(NEVER_KILL_FILE, neverKill);

            statusEl.textContent = '✅ Saved! Shell script will apply on next cycle.';
            statusEl.style.color = '#10b981';
            
            setTimeout(() => document.getElementById('hibernator-modal').remove(), 1200);
        } catch (e) {
            statusEl.textContent = '❌ Save failed. Check root permissions.';
            statusEl.style.color = '#ef4444';        } finally {
            saveBtn.disabled = false;
            saveBtn.innerHTML = '💾 Save Config';
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    window.HibernatorUI = { init };
})();