// update.js - Background-Powered Update Notifier
// Reads pre-computed SHA256 results from /sdcard/MTK_AI/.update_status
(function() {
    'use strict';

    // ===== CONFIG =====
    const MODDIR = '/data/adb/modules/MTK_AI';
    const STATUS_FILE = '/sdcard/MTK_AI/.update_status';
    const ACTION_SCRIPT = `${MODDIR}/action.sh`;
    const CHECKER_SCRIPT = `${MODDIR}/update_checker.sh`;
    const BUSYBOX = `${MODDIR}/busybox`;
    // 🔥 NEW: Changelog URL
    const CHANGELOG_URL = 'https://raw.githubusercontent.com/Jestoni888/MTK-AI-Engine/refs/heads/main/changelog.md';

    let statusData = null;

    // ===== ROOT EXEC =====
    const execCmd = async function(cmd, timeout = 8000) {
        return new Promise(resolve => {
            const cb = `ucb_${Date.now()}`;
            const t = setTimeout(() => { delete window[cb]; resolve(''); }, timeout);
            window[cb] = (_, res) => { clearTimeout(t); delete window[cb]; resolve(res || ''); };
            if (window.ksu) ksu.exec(cmd, `window.${cb}`);
            else { clearTimeout(t); resolve(''); }
        });
    };

    // ===== READ STATUS =====
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
    // 🔥 Fire both scripts independently in background
    execCmd(`su -c '${CHECKER_SCRIPT}' >/dev/null 2>&1 &`, 2000);
};
    // 🔥 NEW: Fetch changelog from GitHub (non-blocking)
    const fetchChangelog = async function() {
        try {
            const resp = await fetch(CHANGELOG_URL + '?t=' + Date.now(), { cache: 'no-store' });
            if (resp.ok) {
                let text = await resp.text();
                // Simple formatting: ## → bold, - → bullet
                text = text
                    .replace(/^##\s+(.+)$/gm, '<strong style="color:#4a9eff;">$1</strong>')
                    .replace(/^-\s+(.+)$/gm, '• $1')
                    .replace(/\n/g, '<br>');
                return text.trim() || '<em style="color:#666;">No changes listed</em>';
            }
        } catch (e) { /* ignore */ }
        return '<em style="color:#FF9F0A;">⚠️ Could not load changelog</em>';
    };

    // ===== SHOW MODAL =====
    function showUpdateModal(data) {
        if (document.getElementById('update-modal-overlay')) return;
        
        statusData = data; // Cache for container click fallback
        
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

        // 🔥 NEW: Changelog section injected into modal
        modal.innerHTML = `
            <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;padding-bottom:12px;border-bottom:1px solid #2a3152;">
                <div style="width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,#4a9eff,#2a75ff);display:flex;align-items:center;justify-content:center;">
                    <span style="color:#fff;font-size:20px;">🔄</span>
                </div>
                <div>
                    <div style="color:#fff;font-size:18px;font-weight:700;">Update Available!</div>                    <div style="color:#8b92b4;font-size:12px;">New version of MTK AI Engine</div>
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
                <button id="dl-btn" style="flex:1;padding:14px;background:linear-gradient(135deg,#32D74B,#2ecc71);color:#fff;border:none;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer;">⬇️ Download Update</button>
                <button id="later-btn" style="flex:1;padding:14px;background:#2a3152;color:#fff;border:none;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer;">Later</button>
            </div>`;

        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        // 🔥 NEW: Async changelog fetch (non-blocking, won't delay modal)
        fetchChangelog().then(html => {
            const el = document.getElementById('changelog-content');
            if (el) el.innerHTML = html;
        });

        document.getElementById('dl-btn').onclick = async () => {
            const btn = document.getElementById('dl-btn');
            btn.innerHTML = '⏳ Starting...'; btn.disabled = true; btn.style.background = '#FF9F0A';
            await execCmd(`su -c 'nohup sh "${ACTION_SCRIPT}" >/dev/null 2>&1 &'`, 3000);
            
            const poll = setInterval(async () => {
                const running = await execCmd(`su -c 'pgrep -f "action.sh"'`, 2000);
                if (!running?.trim()) {
                    clearInterval(poll);                    btn.innerHTML = '✅ Complete!'; btn.style.background = '#32D74B';
                    if (window.showStatus) window.showStatus('✅ Update installed!', '#32D74B');
                    setTimeout(() => { closeModal(); location.reload(); }, 1200);
                }
            }, 2000);
        };
        document.getElementById('later-btn').onclick = closeModal;
        
        overlay.style.display = 'flex';
        document.body.style.overflow = 'hidden';
    }

    function closeModal() {
        const el = document.getElementById('update-modal-overlay');
        if (el) { el.style.display = 'none'; document.body.style.overflow = ''; }
    }

    // ===== MAIN CHECK LOGIC (REVISED) =====
async function checkForUpdates(refresh = false) {
    // Always trigger background checker when page is active
    await triggerCheck();
    
    // Small delay to let checker write status file
    await new Promise(res => setTimeout(res, refresh ? 100 : 800));
    
    // Read updated status
    statusData = await readStatus();
    
    // Only show modal if update is actually available
    if (statusData?.update_available) {
        showUpdateModal(statusData);
    }
    // ✅ No update? Silent exit. No popup, no noise.
}

    // ===== MANUAL BUTTON =====
    const btn = document.getElementById('update-btn');
    if (btn) {
        btn.onclick = (e) => {
            e.preventDefault();
            btn.style.animation = 'spin 1s linear infinite';
            checkForUpdates(true).then(() => setTimeout(() => btn.style.animation = '', 1000));
        };
    }

    // 🔥 HTML CONTAINER CLICK TRIGGER
    const updateContainer = document.getElementById('update-container') || 
                            document.querySelector('[data-trigger="update-popup"]');
    if (updateContainer) {
        updateContainer.style.cursor = 'pointer';        updateContainer.title = 'Check for updates';
        updateContainer.addEventListener('click', async (e) => {
            e.preventDefault();
            if (statusData?.update_available) {
                showUpdateModal(statusData);
            } else {
                await checkForUpdates(true);
            }
        });
    }

    // ===== PAGE VISIBILITY: Re-check when tab becomes active =====
document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
        // Page just became visible → trigger fresh check
        checkForUpdates(false);
    }
});

// ===== INIT: Run on DOM load =====
document.addEventListener('DOMContentLoaded', () => {
    // Initial check when HTML is first active
    checkForUpdates(false);
});

    // ===== PUBLIC API =====
    window.MTKUpdate = {
        check: () => checkForUpdates(true),
        getStatus: () => readStatus(),
        clear: () => execCmd(`su -c '${CHECKER_SCRIPT} --clear'`),
        showModal: (data) => showUpdateModal(data)
    };
})();
