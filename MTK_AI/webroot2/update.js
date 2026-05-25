// update.js - Auto Update Checker (BACKGROUND MODE + PGPOLLING)
(function() {
    'use strict';

    const MODULE_PATH = '/data/adb/modules/MTK_AI/module.prop';
    const ONLINE_URL = 'https://raw.githubusercontent.com/Jestoni888/MTK-AI-Engine/refs/heads/main/MTK_AI/module.prop';
    const BUSYBOX = '/data/adb/modules/MTK_AI/busybox';
    const ACTION_SCRIPT = '/data/adb/modules/MTK_AI/action.sh';

    let currentVersion = '0.0.0';
    let onlineVersion = '0.0.0';

    // Exec function
    const execCmd = async function(cmd, timeout = 10000) {
        return new Promise(resolve => {
            const cb = `upd_${Date.now()}`;
            const t = setTimeout(() => { delete window[cb]; resolve(''); }, timeout);
            window[cb] = (_, res) => { clearTimeout(t); delete window[cb]; resolve(res || ''); };
            if (window.ksu) ksu.exec(cmd, `window.${cb}`);
            else { clearTimeout(t); resolve(''); }
        });
    };

    // Parse properties
    function parseProp(content) {
        const props = {};
        if (!content || content.includes('ERROR') || content.includes('TIMEOUT')) return props;
        
        content.split('\n').forEach(line => {
            line = line.trim();
            if (!line || line.startsWith('#')) return;
            const eq = line.indexOf('=');
            if (eq > 0) {
                const key = line.substring(0, eq).trim();
                const value = line.substring(eq + 1).trim();
                props[key] = value;
            }
        });
        return props;
    }

    // Compare versions
    function compareVersions(v1, v2) {
        if (!v1 || !v2 || v1 === '0.0.0' || v2 === '0.0.0') return 0;
        const a = v1.split('.').map(Number);
        const b = v2.split('.').map(Number);
        for (let i = 0; i < Math.max(a.length, b.length); i++) {
            if ((a[i]||0) > (b[i]||0)) return 1;
            if ((a[i]||0) < (b[i]||0)) return -1;
        }        return 0;
    }

    // Create modal
    function createModal() {
        if (document.getElementById('update-modal-overlay')) return;

        const overlay = document.createElement('div');
        overlay.id = 'update-modal-overlay';
        overlay.style.cssText = 'display:none;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.85);z-index:10001;justify-content:center;align-items:center;';
        overlay.onclick = (e) => { if (e.target === overlay) closeModal(); };

        const modal = document.createElement('div');
        modal.style.cssText = 'background:linear-gradient(135deg,#1a1f3a,#151b2d);border-radius:16px;padding:24px;max-width:420px;width:90%;color:#fff;border:2px solid #4a9eff;';

        modal.innerHTML = `
            <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;padding-bottom:12px;border-bottom:1px solid #2a3152;">
                <div style="width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,#4a9eff,#2a75ff);display:flex;align-items:center;justify-content:center;">
                    <span style="color:#fff;font-size:20px;">🔄</span>
                </div>
                <div>
                    <div style="color:#fff;font-size:18px;font-weight:700;">Update Available!</div>
                    <div style="color:#8b92b4;font-size:12px;">New version of MTK AI Engine</div>
                </div>
            </div>
            <div style="background:#0a0c10;border-radius:10px;padding:16px;margin-bottom:20px;border:1px solid #2a3152;">
                <div style="display:flex;justify-content:space-between;margin-bottom:10px;">
                    <span style="color:#8b92b4;font-size:13px;">Current:</span>
                    <span id="current-ver" style="color:#FF9F0A;font-weight:600;font-family:monospace;">${currentVersion}</span>
                </div>
                <div style="display:flex;justify-content:space-between;margin-bottom:10px;">
                    <span style="color:#8b92b4;font-size:13px;">Available:</span>
                    <span id="online-ver" style="color:#32D74B;font-weight:700;font-family:monospace;">${onlineVersion}</span>
                </div>
                <div style="display:flex;justify-content:space-between;">
                    <span style="color:#8b92b4;font-size:13px;">Module:</span>
                    <span style="color:#fff;font-weight:500;">MTK AI Engine</span>
                </div>
            </div>
            <div style="display:flex;gap:12px;">
                <button id="download-btn" style="flex:1;padding:14px;background:linear-gradient(135deg,#32D74B,#2ecc71);color:#fff;border:none;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer;transition:all 0.3s;">⬇️ Download Update</button>
                <button id="later-btn" style="flex:1;padding:14px;background:#2a3152;color:#fff;border:none;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer;">Later</button>
            </div>
        `;

        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        // ✅ BACKGROUND EXECUTION + PGPOLLING
        const downloadBtn = document.getElementById('download-btn');        downloadBtn.onclick = async () => {
            try {
                // 1. UI: Starting
                downloadBtn.innerHTML = '⏳ Starting...';
                downloadBtn.style.background = '#FF9F0A';
                downloadBtn.disabled = true;
                downloadBtn.style.opacity = '0.8';
                downloadBtn.style.cursor = 'not-allowed';

                // 2. Launch script in background
                // nohup + & ensures it runs detached from the UI process
                const cmd = `su -c 'nohup sh "${ACTION_SCRIPT}" > /dev/null 2>&1 &'`;
                await execCmd(cmd, 5000);

                // 3. UI: Updating (Background)
                downloadBtn.innerHTML = '⏳ Updating...';
                
                // 4. Polling Loop using pgrep
                const pollInterval = setInterval(async () => {
                    // Check if process is still running
                    // pgrep -f matches the full command line arguments
                    const pgrepCmd = `su -c 'pgrep -f "action.sh"'`;
                    const result = await execCmd(pgrepCmd, 3000);
                    
                    // Parse result: pgrep returns PIDs (numbers), empty if not found
                    const pids = result ? result.trim().split(/\s+/).filter(p => p.length > 0) : [];
                    const isRunning = pids.length > 0;

                    if (isRunning) {
                        // Still running
                        downloadBtn.innerHTML = '⏳ Updating...';
                        downloadBtn.style.background = '#FF9F0A';
                    } else {
                        // Process finished
                        clearInterval(pollInterval);
                        
                        // 5. UI: Complete
                        downloadBtn.innerHTML = '✅ Update Complete!';
                        downloadBtn.style.background = '#32D74B';
                        downloadBtn.disabled = false;
                        downloadBtn.style.opacity = '1';
                        downloadBtn.style.cursor = 'pointer';

                        if (window.showStatus) window.showStatus('✅ Update installed successfully!', '#32D74B');

                        // Auto close modal
                        setTimeout(() => {
                            closeModal();
                        }, 1500);
                    }                }, 1500); // Check every 1.5 seconds

            } catch (e) {
                console.error('[Update] Launch failed:', e);
                downloadBtn.innerHTML = ' Error';
                downloadBtn.style.background = '#FF453A';
            }
        };

        document.getElementById('later-btn').onclick = closeModal;
    }

    function openModal() {
        createModal();
        const overlay = document.getElementById('update-modal-overlay');
        if (overlay) {
            const curEl = document.getElementById('current-ver');
            const onEl = document.getElementById('online-ver');
            if (curEl) curEl.textContent = currentVersion;
            if (onEl) onEl.textContent = onlineVersion;
            
            overlay.style.display = 'flex';
            document.body.style.overflow = 'hidden';
        }
    }

    function closeModal() {
        const overlay = document.getElementById('update-modal-overlay');
        if (overlay) {
            overlay.style.display = 'none';
            document.body.style.overflow = '';
        }
    }

    // Main check function
    async function checkUpdates() {
        try {
            // Read local version
            const localContent = await execCmd(`${BUSYBOX} cat "${MODULE_PATH}" 2>/dev/null`, 5000);
            if (localContent && localContent.trim()) {
                const localProp = parseProp(localContent);
                const localVer = localProp.version || localProp.versionCode || '0.0.0';
                if (localVer && localVer !== '0.0.0') {
                    currentVersion = localVer;
                }
            }

            // Fetch online version
            const response = await fetch(ONLINE_URL, { cache: 'no-store' });
            if (response.ok) {                const onlineContent = await response.text();
                const onlineProp = parseProp(onlineContent);
                const onlineVer = onlineProp.version || onlineProp.versionCode || '0.0.0';
                if (onlineVer && onlineVer !== '0.0.0') {
                    onlineVersion = onlineVer;
                }
            }

            // Only show if we have valid versions AND online is newer
            if (currentVersion !== '0.0.0' && onlineVersion !== '0.0.0') {
                if (compareVersions(onlineVersion, currentVersion) > 0) {
                    openModal();
                }
            }
        } catch (e) {
            console.error('[Update] Check error:', e);
        }
    }

    // Setup button
    const btn = document.getElementById('update-btn');
    if (btn) {
        btn.onclick = (e) => {
            e.preventDefault();
            btn.style.animation = 'spin 1s linear infinite';
            checkUpdates().then(() => setTimeout(() => btn.style.animation = '', 1500));
        };
    }

    // Auto-check on load
    setTimeout(checkUpdates, 2000);

})();