// update.js - Background-Powered Update Notifier (with Internet Check & index.html Theming)
(function() {
'use strict';
const MODDIR = '/data/adb/modules/MTK_AI';
const STATUS_FILE = '/sdcard/MTK_AI_Engine/.update_status';
const PROGRESS_FILE = '/sdcard/MTK_AI_Engine/.update_progress';
const AUTO_UPDATE_FILE = '/sdcard/MTK_AI_Engine/auto_update';
const ACTION_SCRIPT = `${MODDIR}/action.sh`;
const BUSYBOX = `${MODDIR}/busybox`;
const CHANGELOG_URL = 'https://raw.githubusercontent.com/Jestoni888/MTK-AI-Engine/refs/heads/main/changelog.md';
const CHANGELOG_MIRROR = 'https://cdn.jsdelivr.net/gh/Jestoni888/MTK-AI-Engine@main/changelog.md';
let statusData = null;
let bannerDismissed = false;

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

// 🔍 Check if auto_update file exists
const checkAutoUpdateEnabled = async function() {
    try {
        const result = await execCmd(`ls "${AUTO_UPDATE_FILE}" 2>/dev/null && echo "YES" || echo "NO"`, 3000);
        return result.includes('YES');
    } catch (e) {
        return false;
    }
};

// 🌐 Check for active internet connection
const checkInternet = async () => {
    try {
        // Method 1: Quick ping test
        const pingResult = await execCmd('ping -c 1 -W 2 8.8.8.8 >/dev/null 2>&1 && echo "ONLINE" || echo "OFFLINE"', 4000);
        if (pingResult.includes('ONLINE')) return true;
        
        // Method 2: Try to resolve DNS
        const nslookupResult = await execCmd('nslookup google.com >/dev/null 2>&1 && echo "DNS_OK" || echo "DNS_FAIL"', 4000);
        if (nslookupResult.includes('DNS_OK')) return true;
        
        return false;
    } catch (e) {
        return false;
    }
};

// 📝 Format raw markdown text into styled HTML matching index.html theme
function formatChangelog(md) {
    if (!md || !md.trim()) return 'Failed to load changelog.';
    md = md.trim();
    if (/^404/i.test(md) || /^<(!doctype|html)/i.test(md)) return 'Failed to load changelog.';
    const lines = md.split('\n');
    let html = '';
    for (let line of lines) {
        line = line.trim();
        if (!line) continue;
        if (line.startsWith('--- version') && line.endsWith('---')) {
            const ver = line.replace('--- version ', '').replace(' ---', '').trim();
            html += `<div style="color:var(--accent-blue);font-weight:bold;font-size:13px;margin-top:12px;margin-bottom:6px;border-bottom:1px solid var(--border-color);padding-bottom:4px;">🚀 Version ${ver}</div>`;
        } else if (line.startsWith('•')) {
            html += `<div style="margin-left:8px;margin-bottom:5px;color:#ffffff;display:flex;align-items:flex-start;gap:6px;"><span style="color:var(--text-secondary);">•</span><span>${line.substring(1).trim()}</span></div>`;
        } else {
            html += `<div style="color:#ffffff;margin-bottom:5px;">${line}</div>`;
        }
    }
    return html || 'No changelog available.';
}

// 🆕 Load changelog for top banner
async function loadBannerChangelog() {
    const el = document.getElementById('banner-changelog-content');
    if (!el) return;
    
    let md = '';
    for (const url of [CHANGELOG_URL, CHANGELOG_MIRROR]) {
        try {
            const res = await fetch(url, { cache: 'no-store' });
            if (res.ok) {
                md = await res.text();
                if (md && md.trim()) break;
            }
        } catch (e) { /* try next source */ }
    }
    if (!md || !md.trim()) {
        try {
            const cmd = `${BUSYBOX} wget -qO- -T 10 "${CHANGELOG_URL}" 2>/dev/null || curl -s -m 10 "${CHANGELOG_URL}" 2>/dev/null || wget -qO- -T 10 "${CHANGELOG_URL}" 2>/dev/null`;
            md = await execCmd(cmd, 12000);
        } catch (e) { /* ignore */ }
    }
    if (el) el.innerHTML = formatChangelog(md);
}

// 📢 Show top banner using index.html CSS Variables
function showTopBanner() {
    if (bannerDismissed || document.getElementById('update-top-banner')) return;
    
    const banner = document.createElement('div');
    banner.id = 'update-top-banner';
    banner.style.cssText = `
        position: fixed; top: 0; left: 0; right: 0; z-index: 99999;
        background: linear-gradient(135deg, var(--bg-secondary) 0%, var(--bg-card) 100%);
        border-bottom: 2px solid var(--accent-blue);
        color: #ffffff; font-family: sans-serif;
        box-shadow: 0 4px 12px rgba(0,0,0,0.5);
        transition: all 0.4s ease-out;
        overflow: hidden;
        max-height: 50px;
    `;
    
    banner.innerHTML = `
        <div id="banner-header" style="height: 50px; display: flex; align-items: center; justify-content: center; gap: 10px; cursor: pointer; font-size: 14px; font-weight: 600; padding: 0 16px; color: #ffffff;">
            <span style="font-size: 20px;">📢</span>
            <span style="flex: 1; text-align: center; color: #ffffff;">Tap to view Changelog</span>
            <span id="banner-arrow" style="transition: transform 0.3s; font-size: 14px; color: var(--text-secondary);">▼</span>
        </div>
        <div id="banner-body" style="padding: 0 16px; max-height: 0; overflow: hidden; transition: all 0.4s ease-out;">
            <div style="color: var(--text-secondary); font-size: 12px; margin-bottom: 8px; font-weight: 600; padding-top: 12px;">Changelog (Latest):</div>
            <div id="banner-changelog-content" style="color: #ffffff; font-size: 12px; line-height: 1.5; max-height: 300px; overflow-y: auto; margin-bottom: 16px; padding: 8px; background: var(--bg-primary); border-radius: 8px; border: 1px solid var(--border-color);">
                ⏳ Loading changelog...
            </div>
            <div style="display: flex; gap: 12px; padding-bottom: 16px;">
                <button id="banner-close-btn" style="width: 100%; padding: 12px; background: var(--bg-secondary); color: #ffffff; border: 1px solid var(--border-color); border-radius: 10px; font-size: 14px; font-weight: 600; cursor: pointer;">Close</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(banner);
    document.body.style.paddingTop = '50px';
    
    const header = document.getElementById('banner-header');
    const body = document.getElementById('banner-body');
    const arrow = document.getElementById('banner-arrow');
    let isExpanded = false;
    
    header.onclick = () => {
        isExpanded = !isExpanded;
        if (isExpanded) {
            banner.style.maxHeight = '600px';
            body.style.maxHeight = '500px';
            body.style.paddingTop = '16px';
            arrow.style.transform = 'rotate(180deg)';
            loadBannerChangelog();
        } else {
            banner.style.maxHeight = '50px';
            body.style.maxHeight = '0';
            body.style.paddingTop = '0';
            arrow.style.transform = 'rotate(0deg)';
        }
    };
    
    document.getElementById('banner-close-btn').onclick = () => {
        bannerDismissed = true;
        banner.remove();
        document.body.style.paddingTop = '0';
    };
}

// 🌐 Fetch changelog for modal
async function loadChangelog() {
    const el = document.getElementById('changelog-content');
    if (!el) return;
    let md = '';
    for (const url of [CHANGELOG_URL, CHANGELOG_MIRROR]) {
        try {
            const res = await fetch(url, { cache: 'no-store' });
            if (res.ok) {
                md = await res.text();
                if (md && md.trim()) break;
            }
        } catch (e) { /* try next source */ }
    }
    if (!md || !md.trim()) {
        try {
            const cmd = `${BUSYBOX} wget -qO- -T 10 "${CHANGELOG_URL}" 2>/dev/null || curl -s -m 10 "${CHANGELOG_URL}" 2>/dev/null || wget -qO- -T 10 "${CHANGELOG_URL}" 2>/dev/null`;
            md = await execCmd(cmd, 12000);
        } catch (e) { /* ignore */ }
    }
    if (el) el.innerHTML = formatChangelog(md);
}

function showUpdateModal(data) {
    if (document.getElementById('update-modal-overlay')) return;
    statusData = data;
    const overlay = document.createElement('div');
    overlay.id = 'update-modal-overlay';
    overlay.style.cssText = 'display:none;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.85);z-index:10001;justify-content:center;align-items:center;';
    overlay.onclick = (e) => { if (e.target === overlay) closeModal(); };
    
    const modal = document.createElement('div');
    modal.style.cssText = 'background:linear-gradient(135deg,var(--bg-secondary) 0%,var(--bg-card) 100%);border-radius:16px;padding:24px;max-width:480px;width:90%;color:#ffffff;border:1px solid var(--border-color);max-height:90vh;overflow-y:auto;box-shadow:0 8px 32px rgba(0,0,0,0.5);';
    
    const filesHTML = data.changed_files?.length > 0
        ? `<div style="margin-top:16px;padding:12px;background:var(--bg-primary);border-radius:8px;border:1px solid var(--border-color);max-height:200px;overflow-y:auto;">
            <div style="color:var(--text-secondary);font-size:12px;margin-bottom:8px;font-weight:600;">Changed Files:</div>
            ${data.changed_files.map(f => `
                <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 8px;margin-bottom:4px;background:var(--bg-secondary);border-radius:6px;font-family:monospace;font-size:11px;border:1px solid var(--border-color);">
                    <span style="color:#ffffff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:70%;">${f.path}</span>
                    <span style="color:var(--accent-orange);font-size:10px;margin-left:8px;flex-shrink:0;">${f.reason}</span>
                </div>
            `).join('')}
          </div>` : '';

    const changelogHTML = `
        <div style="margin-top:16px;padding:12px;background:var(--bg-primary);border-radius:8px;border:1px solid var(--border-color);max-height:250px;overflow-y:auto;">
            <div style="color:var(--text-secondary);font-size:12px;margin-bottom:8px;font-weight:600;">Changelog (Latest):</div>
            <div id="changelog-content" style="color:#ffffff;font-size:12px;font-family:sans-serif;line-height:1.5;">⏳ Loading changelog...</div>
        </div>`;

    modal.innerHTML = `
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;padding-bottom:12px;border-bottom:1px solid var(--border-color);">
            <div style="width:40px;height:40px;background:var(--bg-secondary);border-radius:10px;display:flex;align-items:center;justify-content:center;color:var(--accent-blue);font-size:20px;border:1px solid var(--border-color);">
                <i class="fas fa-arrow-alt-circle-up"></i>
            </div>
            <div>
                <div style="font-size:18px;font-weight:700;color:#ffffff;">Update Available!</div>
                <div style="font-size:12px;color:var(--text-secondary);">New version detected</div>
            </div>
        </div>
        <div style="font-size:13px;color:#ffffff;line-height:1.5;">
            A new update is available for MTK AI Engine.
        </div>
        ${filesHTML}
        ${changelogHTML}
        <div id="update-progress-container" style="display:none;margin-top:16px;">
            <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text-secondary);margin-bottom:6px;">
                <span id="update-progress-status" style="color:#ffffff;">Updating...</span>
                <span id="update-progress-percent" style="color:var(--accent-blue);">0%</span>
            </div>
            <div style="width:100%;background:var(--bg-primary);height:8px;border-radius:4px;overflow:hidden;border:1px solid var(--border-color);">
                <div id="update-progress-bar" style="width:0%;height:100%;background:var(--accent-blue);transition:width 0.3s ease;"></div>
            </div>
        </div>
        <div style="display:flex;gap:12px;margin-top:20px;">
            <button id="modal-update-btn" style="flex:1;padding:12px;background:var(--accent-blue);color:#ffffff;border:none;border-radius:10px;font-weight:700;font-size:14px;cursor:pointer;transition:all 0.2s;">
                <i class="fas fa-download"></i> Update Now
            </button>
            <button id="modal-auto-btn" style="padding:12px;background:var(--bg-secondary);color:#ffffff;border:1px solid var(--border-color);border-radius:10px;font-weight:600;font-size:13px;cursor:pointer;display:flex;align-items:center;gap:6px;">
                <i class="fas fa-sync-alt" id="auto-btn-icon"></i> <span id="auto-btn-text">Auto: OFF</span>
            </button>
            <button id="modal-close-btn" style="padding:12px 18px;background:var(--bg-secondary);color:#ffffff;border:1px solid var(--border-color);border-radius:10px;font-weight:600;font-size:14px;cursor:pointer;">
                Close
            </button>
        </div>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    overlay.style.display = 'flex';

    loadChangelog();

    checkAutoUpdateEnabled().then(enabled => {
        const autoText = document.getElementById('auto-btn-text');
        const autoBtn = document.getElementById('modal-auto-btn');
        if (autoText && autoBtn) {
            if (enabled) {
                autoText.textContent = 'Auto: ON';
                autoBtn.style.borderColor = 'var(--accent-green)';
                autoBtn.style.color = '#ffffff';
            } else {
                autoText.textContent = 'Auto: OFF';
                autoBtn.style.borderColor = 'var(--border-color)';
                autoBtn.style.color = '#ffffff';
            }
        }
    });

    const autoBtn = document.getElementById('modal-auto-btn');
    if (autoBtn) {
        autoBtn.onclick = async () => {
            const isEnabled = await checkAutoUpdateEnabled();
            if (isEnabled) {
                await execCmd(`rm -f "${AUTO_UPDATE_FILE}"`, 3000);
                document.getElementById('auto-btn-text').textContent = 'Auto: OFF';
                autoBtn.style.borderColor = 'var(--border-color)';
            } else {
                await execCmd(`touch "${AUTO_UPDATE_FILE}"`, 3000);
                document.getElementById('auto-btn-text').textContent = 'Auto: ON';
                autoBtn.style.borderColor = 'var(--accent-green)';
            }
        };
    }

    const closeBtn = document.getElementById('modal-close-btn');
    if (closeBtn) closeBtn.onclick = closeModal;

    const updateBtn = document.getElementById('modal-update-btn');
    if (updateBtn) {
        updateBtn.onclick = async () => {
            updateBtn.disabled = true;
            updateBtn.style.opacity = '0.6';
            updateBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Starting...';
            
            document.getElementById('update-progress-container').style.display = 'block';
            
            await execCmd(`sh "${ACTION_SCRIPT}" update >/dev/null 2>&1 &`, 3000);
            
            pollUpdateProgress();
        };
    }
}

function closeModal() {
    const overlay = document.getElementById('update-modal-overlay');
    if (overlay) overlay.remove();
}

async function pollUpdateProgress() {
    const progressContainer = document.getElementById('update-progress-container');
    const statusEl = document.getElementById('update-progress-status');
    const percentEl = document.getElementById('update-progress-percent');
    const barEl = document.getElementById('update-progress-bar');
    const updateBtn = document.getElementById('modal-update-btn');

    if (!progressContainer) return;

    const interval = setInterval(async () => {
        try {
            const raw = await execCmd(`${BUSYBOX} cat "${PROGRESS_FILE}" 2>/dev/null`, 2000);
            if (raw && raw.trim()) {
                const text = raw.trim();
                let pct = 0;
                const match = text.match(/(\d+)%/);
                if (match) pct = parseInt(match[1]);

                if (statusEl) statusEl.textContent = text;
                if (percentEl) percentEl.textContent = `${pct}%`;
                if (barEl) barEl.style.width = `${pct}%`;

                if (text.includes('SUCCESS') || text.includes('Complete') || pct >= 100) {
                    clearInterval(interval);
                    if (statusEl) statusEl.textContent = 'Update Complete! Restarting UI...';
                    if (barEl) barEl.style.background = 'var(--accent-green)';
                    setTimeout(() => {
                        window.location.reload();
                    }, 2000);
                } else if (text.includes('FAILED') || text.includes('ERROR')) {
                    clearInterval(interval);
                    if (statusEl) statusEl.textContent = text;
                    if (barEl) barEl.style.background = 'var(--accent-red)';
                    if (updateBtn) {
                        updateBtn.disabled = false;
                        updateBtn.style.opacity = '1';
                        updateBtn.innerHTML = '<i class="fas fa-redo"></i> Retry Update';
                    }
                }
            }
        } catch (e) { /* ignore */ }
    }, 1000);
}

async function checkForUpdates(isManual = false) {
    const online = await checkInternet();
    if (!online) {
        if (isManual) {
            const statusMsg = document.getElementById('status-message');
            if (statusMsg) statusMsg.textContent = 'Offline: Internet connection required';
        }
        return;
    }

    const data = await readStatus();
    if (data && data.update_available) {
        showUpdateModal(data);
        showTopBanner();
    } else if (isManual) {
        const statusMsg = document.getElementById('status-message');
        if (statusMsg) {
            statusMsg.textContent = 'System is Up to Date';
            setTimeout(() => { statusMsg.textContent = 'System Ready'; }, 2000);
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const updateBtn = document.getElementById('update-btn');
    if (updateBtn) {
        updateBtn.addEventListener('click', () => {
            updateBtn.classList.add('fa-spin');
            checkForUpdates(true).finally(() => {
                setTimeout(() => updateBtn.classList.remove('fa-spin'), 1000);
            });
        });
    }

    setTimeout(() => {
        checkForUpdates(false);
    }, 3000);
});
})();
