// update.js - Background-Powered Update Notifier
(function() {
    'use strict';

    const MODDIR = '/data/adb/modules/MTK_AI';
    const STATUS_FILE = '/sdcard/MTK_AI_Engine/.update_status';
    const PROGRESS_FILE = '/sdcard/MTK_AI_Engine/.update_progress';
    const ACTION_SCRIPT = `${MODDIR}/action.sh`;
    const CHECKER_SCRIPT = `${MODDIR}/update_checker.sh`;
    const BUSYBOX = `${MODDIR}/busybox`;
    const CHANGELOG_URL = 'https://raw.githubusercontent.com/Jestoni888/MTK-AI-Engine/refs/heads/main/changelog.md';

    let statusData = null;

    const execCmd = async function(cmd, timeout = 8000) {
        return new Promise(resolve => {
            const cb = `ucb_${Date.now()}`;
            const t = setTimeout(() => { delete window[cb]; resolve(''); }, timeout);
            window[cb] = (_, res) => { clearTimeout(t); delete window[cb]; resolve(res || ''); };
            if (window.ksu) ksu.exec(cmd, `window.${cb}`);
            else { clearTimeout(t); resolve(''); }
        });
    };

    const readStatus = async function() {
        try {
            const raw = await execCmd(`${BUSYBOX} cat "${STATUS_FILE}" 2>/dev/null`, 3000);
            if (raw && raw.trim().startsWith('{')) {
                const parsed = JSON.parse(raw.trim());
                parsed.changed_files = parsed.changed_files || [];
                if (typeof parsed.changed_files === "string") {
                    try { parsed.changed_files = JSON.parse(parsed.changed_files); } 
                    catch(e) { parsed.changed_files = []; }
                }
                return parsed;
            }
        } catch (e) { /* ignore */ }
        return null;
    };

    const triggerCheck = async function() {
        execCmd(`su -c '${CHECKER_SCRIPT}' >/dev/null 2>&1 &`, 2000);
    };

    const fetchChangelog = async function() {
        try {
            const resp = await fetch(CHANGELOG_URL + '?t=' + Date.now(), { cache: 'no-store' });
            if (resp.ok) {
                let text = await resp.text();
                text = text
                    .replace(/^##\s+(.+)$/gm, '<strong style="color:#4a9eff;">$1</strong>')
                    .replace(/^-\s+(.+)$/gm, '• $1')
                    .replace(/\n/g, '<br>');
                return text.trim() || '<em style="color:#666;">No changes listed</em>';
            }
        } catch (e) { /* ignore */ }
        return '<em style="color:#FF9F0A;">⚠️ Could not load changelog</em>';
    };

    function showUpdateModal(data) {
        if (document.getElementById('update-modal-overlay')) return;
        statusData = data;
        
        const overlay = document.createElement('div');
        overlay.id = 'update-modal-overlay';
        overlay.style.cssText = 'display:none;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.85);z-index:10001;justify-content:center;align-items:center;';
        overlay.onclick = (e) => { if (e.target === overlay) closeModal(); };
        
        const modal = document.createElement('div');
        modal.style.cssText = 'background:linear-gradient(135deg,#1a1f3a,#151b2d);border-radius:16px;padding:24px;max-width:480px;width:90%;color:#fff;border:2px solid #4a9eff;';

        const filesHTML = data.changed_files?.length > 0 
            ? `<div style="margin-top:16px;padding:12px;background:#0a0c10;border-radius:8px;border:1px solid #2a3152;max-height:200px;overflow-y:auto;">
                <div style="color:#8b92b4;font-size:12px;margin-bottom:8px;font-weight:600;">Changed Files:</div>
                ${data.changed_files.map(f => `
                    <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 8px;margin-bottom:4px;background:#1a1f3a;border-radius:6px;font-family:monospace;font-size:11px;">
                        <span style="color:#fff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:70%;">${f.path}</span>
                        <span style="color:#FF9F0A;font-size:10px;margin-left:8px;flex-shrink:0;">${f.reason}</span>
                    </div>
                `).join('')}
               </div>` : '';

        modal.innerHTML = `
            <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;padding-bottom:12px;border-bottom:1px solid #2a3152;">
                <div style="width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,#4a9eff,#2a75ff);display:flex;align-items:center;justify-content:center;">
                    <span style="color:#fff;font-size:20px;">🔄</span>
                </div>
                <div>
                    <div style="color:#fff;font-size:18px;font-weight:700;">Update Available!</div>
                    <div style="color:#8b92b4;font-size:12px;">New version of MTK AI Engine</div>
                    ${data.files_changed ? `<div style="color:#FF9F0A;font-size:11px;margin-top:4px;">⚠️ ${data.changed_files.length} file(s) modified</div>` : ''}
                </div>
            </div>
            <div style="background:#0a0c10;border-radius:10px;padding:16px;margin-bottom:20px;border:1px solid #2a3152;">
                <div style="display:flex;justify-content:space-between;margin-bottom:10px;">
                    <span style="color:#8b92b4;font-size:13px;">Current:</span>
                    <span style="color:#FF9F0A;font-weight:600;font-family:monospace;">${data.current_version}</span>
                </div>
                <div style="display:flex;justify-content:space-between;margin-bottom:10px;">
                    <span style="color:#8b92b4;font-size:13px;">Available:</span>
                    <span style="color:#32D74B;font-weight:700;font-family:monospace;">${data.online_version}</span>
                </div>
                <div style="display:flex;justify-content:space-between;font-size:11px;color:#666;">
                    <span>Checked: ${new Date(data.last_check * 1000).toLocaleTimeString()}</span>
                </div>
            </div>
            ${filesHTML}
            <div style="margin-top:16px;">
                <div style="color:#8b92b4;font-size:12px;margin-bottom:8px;font-weight:600;">📋 What's New:</div>
                <div id="changelog-content" style="background:#0a0c10;border-radius:8px;padding:12px;border:1px solid #2a3152;max-height:150px;overflow-y:auto;font-size:12px;line-height:1.4;color:#c5c9e0;">
                    <em style="color:#666;">Loading changelog...</em>
                </div>
            </div>
            <div style="display:flex;gap:12px;margin-top:16px;">
                <button id="dl-btn" style="flex:1;padding:14px;background:linear-gradient(135deg,#32D74B,#2ecc71);color:#fff;border:none;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer;transition:all 0.2s;">⬇️ Download Update</button>
                <button id="later-btn" style="flex:1;padding:14px;background:#2a3152;color:#fff;border:none;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer;transition:all 0.2s;">Later</button>
            </div>`;

        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        fetchChangelog().then(html => {
            const el = document.getElementById('changelog-content');
            if (el) el.innerHTML = html;
        });

        // 🔥 Enhanced Download Button with Robust Progress Bar & Failsafe
        document.getElementById('dl-btn').onclick = async () => {
            const btn = document.getElementById('dl-btn');
            const laterBtn = document.getElementById('later-btn');
            
            btn.innerHTML = '⏳ Downloading...'; 
            btn.disabled = true; 
            btn.style.background = '#FF9F0A';
            if (laterBtn) { laterBtn.disabled = true; laterBtn.style.opacity = '0.5'; }
            
            // Inject progress bar UI
            let progressContainer = document.getElementById('update-progress-container');
            if (!progressContainer) {
                progressContainer = document.createElement('div');
                progressContainer.id = 'update-progress-container';
                progressContainer.style.cssText = 'margin-top:16px; display:none;';
                progressContainer.innerHTML = `
                    <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
                        <span id="update-progress-text" style="color:#4a9eff;font-size:13px;font-weight:700;">0%</span>
                        <span style="color:#8b92b4;font-size:12px;">Downloading Update...</span>
                    </div>
                    <div style="width:100%;height:10px;background:#0a0c10;border-radius:5px;overflow:hidden;border:1px solid #2a3152;">
                        <div id="update-progress-bar" style="width:0%;height:100%;background:linear-gradient(90deg,#4a9eff,#2a75ff);border-radius:5px;transition:width 0.4s ease-out;"></div>
                    </div>
                `;
                const buttonContainer = btn.parentElement;
                buttonContainer.parentNode.insertBefore(progressContainer, buttonContainer.nextSibling);
            }
            progressContainer.style.display = 'block';
            
            // Trigger background update script
            await execCmd(`su -c 'nohup sh "${ACTION_SCRIPT}" >/dev/null 2>&1 &'`, 3000);
            
            let pollAttempts = 0;
            const maxAttempts = 60; // 60 seconds max wait time safeguard
            
            const poll = setInterval(async () => {
                pollAttempts++;
                
                // 1. Try to read actual progress from file
                const progressRaw = await execCmd(`${BUSYBOX} cat "${PROGRESS_FILE}" 2>/dev/null`, 2000);
                const progress = parseInt(progressRaw?.trim(), 10);
                
                const progressBar = document.getElementById('update-progress-bar');
                const progressText = document.getElementById('update-progress-text');
                
                if (!isNaN(progress) && progress >= 0 && progress <= 100) {
                    if (progressBar) progressBar.style.width = `${progress}%`;
                    if (progressText) {
                        if (progress === 100) {
                            progressText.innerText = '100% - Finalizing...';
                            progressText.style.color = '#FF9F0A';
                        } else {
                            progressText.innerText = `${progress}%`;
                            progressText.style.color = '#4a9eff';
                        }
                    }
                } else {
                    // Fallback: Simulate smooth progress up to 90% if file read fails
                    if (progressBar) {
                        let currentWidth = parseFloat(progressBar.style.width || '0');
                        if (currentWidth < 90) {
                            currentWidth += Math.random() * 3 + 1;
                            progressBar.style.width = `${currentWidth}%`;
                            if (progressText) progressText.innerText = `${Math.round(currentWidth)}%`;
                        }
                    }
                }

                // 2. Check if action.sh is still running
                const running = await execCmd(`su -c 'pgrep -f "action.sh"'`, 2000);
                // 3. Check if service.sh has started (indicates action.sh reached 'exec service.sh')
                const serviceRunning = await execCmd(`su -c 'pgrep -f "MTK_AI/service.sh"'`, 2000);
                
                // Condition to mark as done:
                // - action.sh is no longer running, OR
                // - progress is 100% AND service.sh is now running, OR
                // - we hit the 60-second timeout safeguard
                const isDone = !running?.trim() || (progress === 100 && serviceRunning?.trim()) || pollAttempts >= maxAttempts;

                if (isDone) {
                    clearInterval(poll);
                    
                    // Force UI to 100% and show Done state
                    if (progressBar) {
                        progressBar.style.width = '100%';
                        progressBar.style.background = 'linear-gradient(90deg, #32D74B, #2ecc71)';
                    }
                    if (progressText) {
                        progressText.innerText = '✅ Complete!';
                        progressText.style.color = '#32D74B';
                    }
                    
                    btn.innerHTML = '✅ Done!'; 
                    btn.style.background = '#32D74B';
                    
                    if (window.showStatus) window.showStatus('✅ Update installed! Restarting...', '#32D74B');
                    setTimeout(() => { closeModal(); location.reload(); }, 1500);
                }
            }, 1000); // Poll every 1 second
        };

        document.getElementById('later-btn').onclick = closeModal;
        overlay.style.display = 'flex';
        document.body.style.overflow = 'hidden';
    }

    function closeModal() {
        const el = document.getElementById('update-modal-overlay');
        if (el) { el.style.display = 'none'; document.body.style.overflow = ''; }
    }

    async function checkForUpdates(refresh = false) {
        await triggerCheck();
        await new Promise(res => setTimeout(res, refresh ? 100 : 800));
        statusData = await readStatus();
        if (statusData?.update_available) {
            showUpdateModal(statusData);
        }
    }

    const btn = document.getElementById('update-btn');
    if (btn) {
        btn.onclick = (e) => {
            e.preventDefault();
            btn.style.animation = 'spin 1s linear infinite';
            checkForUpdates(true).then(() => setTimeout(() => btn.style.animation = '', 1000));
        };
    }

    const updateContainer = document.getElementById('update-container') || document.querySelector('[data-trigger="update-popup"]');
    if (updateContainer) {
        updateContainer.style.cursor = 'pointer';
        updateContainer.title = 'Check for updates';
        updateContainer.addEventListener('click', async (e) => {
            e.preventDefault();
            if (statusData?.update_available) {
                showUpdateModal(statusData);
            } else {
                await checkForUpdates(true);
            }
        });
    }

    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) checkForUpdates(false);
    });

    document.addEventListener('DOMContentLoaded', () => {
        checkForUpdates(false);
    });

    window.MTKUpdate = {
        check: () => checkForUpdates(true),
        getStatus: () => readStatus(),
        clear: () => execCmd(`su -c '${CHECKER_SCRIPT} --clear'`),
        showModal: (data) => showUpdateModal(data)
    };
})();
