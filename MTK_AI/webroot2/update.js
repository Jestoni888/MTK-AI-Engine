// update.js - Auto Update Checker (SHA256 + Binary Existence + Full Scan)
(function() {
    'use strict';

    const MODULE_PATH = '/data/adb/modules/MTK_AI/module.prop';
    const ONLINE_URL = 'https://raw.githubusercontent.com/Jestoni888/MTK-AI-Engine/refs/heads/main/MTK_AI/module.prop';
    const MANIFEST_URL = 'https://raw.githubusercontent.com/Jestoni888/MTK-AI-Engine/refs/heads/main/manifest.txt';
    const BUSYBOX = '/data/adb/modules/MTK_AI/busybox';
    const ACTION_SCRIPT = '/data/adb/modules/MTK_AI/action.sh';
    const MODDIR = '/data/adb/modules/MTK_AI';

    let currentVersion = '0.0.0';
    let onlineVersion = '0.0.0';
    let filesChanged = false;
    let changedFilesList = [];

    // Exec function for root commands
    const execCmd = async function(cmd, timeout = 10000) {
        return new Promise(resolve => {
            const cb = `upd_${Date.now()}`;
            const t = setTimeout(() => { delete window[cb]; resolve(''); }, timeout);
            window[cb] = (_, res) => { clearTimeout(t); delete window[cb]; resolve(res || ''); };
            if (window.ksu) ksu.exec(cmd, `window.${cb}`);
            else { clearTimeout(t); resolve(''); }
        });
    };

    // Parse module.prop
    function parseProp(content) {
        const props = {};
        if (!content || content.includes('ERROR') || content.includes('TIMEOUT')) return props;
        content.split('\n').forEach(line => {
            line = line.trim();
            if (!line || line.startsWith('#')) return;
            const eq = line.indexOf('=');
            if (eq > 0) props[line.substring(0, eq).trim()] = line.substring(eq + 1).trim();
        });
        return props;
    }

    // Compare semantic versions
    function compareVersions(v1, v2) {
        if (!v1 || !v2 || v1 === '0.0.0' || v2 === '0.0.0') return 0;
        const a = v1.split('.').map(Number);
        const b = v2.split('.').map(Number);
        for (let i = 0; i < Math.max(a.length, b.length); i++) {
            if ((a[i]||0) > (b[i]||0)) return 1;
            if ((a[i]||0) < (b[i]||0)) return -1;
        }
        return 0;    }

    // Check if file is text-based (safe for SHA256 content check)
    function isTextFile(path) {
        return /\.(sh|js|html|prop|txt|cfg|conf|xml|json)$/i.test(path);
    }

    // Compute SHA256 of local file using busybox
    const getLocalFileHash = async function(filepath) {
        try {
            // Returns null if file missing or command fails
            const cmd = `${BUSYBOX} sha256sum "${filepath}" 2>/dev/null | ${BUSYBOX} cut -d' ' -f1`;
            const result = await execCmd(cmd, 8000);
            return result && result.trim() ? result.trim().toLowerCase() : null;
        } catch (e) {
            return null;
        }
    };

    // Compute SHA256 of string/content using Web Crypto API
    const computeSHA256 = async function(content) {
        try {
            const encoder = new TextEncoder();
            const data = encoder.encode(content);
            const hashBuffer = await crypto.subtle.digest('SHA-256', data);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').toLowerCase();
        } catch (e) {
            return null;
        }
    };

    // Parse manifest.txt format
    function parseManifest(content) {
        const entries = {};
        if (!content || content.includes('ERROR') || content.includes('TIMEOUT')) return entries;
        content.split('\n').forEach(line => {
            line = line.trim();
            if (!line || line.startsWith('#')) return;
            const spaceIdx = line.indexOf(' ');
            if (spaceIdx > 0) {
                const relPath = line.substring(0, spaceIdx).trim();
                const url = line.substring(spaceIdx + 1).trim();
                if (relPath && url) entries[relPath] = url;
            }
        });
        return entries;
    }

    // Required files list    
    const REQUIRED_FILES = new Set([
        "MTK_AI/AI_MODE/auto_frequency/auto_frequency",
        "MTK_AI/AI_MODE/auto_frequency/cpu6",
        "MTK_AI/AI_MODE/auto_frequency/cpu7",
        "MTK_AI/AI_MODE/gaming_mode/app_optimizer",
        "MTK_AI/AI_MODE/gaming_mode/bypass_on",
        "MTK_AI/AI_MODE/gaming_mode/bypass_active",
        "MTK_AI/AI_MODE/gaming_mode/disable_thermal",
        "MTK_AI/AI_MODE/gaming_mode/thermalx",
        "MTK_AI/AI_MODE/gaming_mode/gaming_prop",
        "MTK_AI/AI_MODE/gaming_mode/gaming_prop_2",
        "MTK_AI/AI_MODE/gaming_mode/limit",
        "MTK_AI/AI_MODE/gaming_mode/lite_gaming",
        "MTK_AI/AI_MODE/gaming_mode/performance",
        "MTK_AI/AI_MODE/gaming_mode/unlock",
        "MTK_AI/AI_MODE/gaming_mode/unlockfps",
        "MTK_AI/AI_MODE/normal_mode/bypass_off",
        "MTK_AI/AI_MODE/normal_mode/normal_cpuset",
        "MTK_AI/AI_MODE/normal_mode/normal_prop",
        "MTK_AI/AI_MODE/normal_mode/powersave",
        "MTK_AI/AI_MODE/normal_mode/powersavex",
        "MTK_AI/AI_MODE/global_mode/charger_check",
        "MTK_AI/AI_MODE/global_mode/ram_cleaner",
        "MTK_AI/AI_MODE/global_mode/resources_tweaks",
        "MTK_AI/AI_MODE/global_mode/trim_memory",
        "MTK_AI/AI_MODE/global_mode/webview_tweaks",
        "MTK_AI/AI_MODE/global_mode/module_executer",
        "script_runner/display_mode",
        "script_runner/global",
        "script_runner/mtk_ai_manual",
        "script_runner/refresh_rate_locker",
        "script_runner/sf_controller",
        "script_runner/mtk_ai_eem_boot",
        "script_runner/monitor_app_stats",
        "service.d/backup.sh",
        "main_control/mtk_ai_engine",
        "main_control/mtk_ai_engine.sh",
        "main_control/mode",
        "action.sh",
        "service.sh",
        "post-fs-data.sh",
        "module.prop",
        "webroot/index.html",
        "webroot/application.js",
        "webroot/animationspeed.js",
        "webroot/boostcolor.js",
        "webroot/cpu.js",
        "webroot/cputoggle.js",
        "webroot/dex2oat.js",
        "webroot/eemvoltage.js",
        "webroot/fpsgo.js",        "webroot/freeze.js",
        "webroot/front.js",
        "webroot/gmsdoze.js",
        "webroot/gpu.js",
        "webroot/iotweaks.js",
        "webroot/mtk_ai_engine.js",
        "webroot/overvolt.js",
        "webroot/ppmpolicy.js",
        "webroot/refreshrate.js",
        "webroot/resolutionscale.js",
        "webroot/thermalzone.js",
        "webroot/zram.js",
        "webroot/process.js",
        "webroot/dpiresolution.js",
        "webroot/performancetest.js",
        "webroot/maintenance.js",
        "webroot/networktweak.js",
        "webroot/terminalemulator.js",
        "webroot/tweakfinder.js",
        "webroot/modulemanager.js",
        "webroot/profile.js",
        "webroot/renderer.js",
        "webroot/cpuset.js",
        "webroot/setedit.js",
        "webroot/update.js",
        "lib64/libc++_shared.so"
    ]);

    // ✅ Main integrity check
    async function checkFileIntegrity() {
        try {
            const manifestResp = await fetch(MANIFEST_URL, { cache: 'no-store' });
            if (!manifestResp.ok) return false;
            
            const manifest = parseManifest(await manifestResp.text());
            if (Object.keys(manifest).length === 0) return false;

            changedFilesList = [];

            for (const [relPath, onlineUrl] of Object.entries(manifest)) {
                if (!REQUIRED_FILES.has(relPath)) continue;
                
                const localPath = `${MODDIR}/${relPath}`;
                const isText = isTextFile(relPath);

                // 1. Check Local Existence (Works for both Text and Binary)
                const localHash = await getLocalFileHash(localPath);
                
                if (!localHash) {
                    // File is MISSING locally -> Trigger Update                    
                    changedFilesList.push({ path: relPath, reason: 'Missing' });
                    continue;
                }

                // File exists locally.
                if (isText) {
                    // 2. Text File: Check SHA256 Content
                    try {
                        const onlineResp = await fetch(onlineUrl, { cache: 'no-store' });
                        if (!onlineResp.ok) {
                            changedFilesList.push({ path: relPath, reason: 'Online unavailable' });
                            continue;
                        }
                        
                        const onlineContent = await onlineResp.text();
                        const onlineHash = await computeSHA256(onlineContent);
                        
                        if (localHash !== onlineHash) {
                            changedFilesList.push({ path: relPath, reason: 'Modified' });
                        }
                    } catch (e) {
                        changedFilesList.push({ path: relPath, reason: 'Error' });
                    }
                } else {
                    // 3. Binary File: Existence Check Only
                    // Since localHash is valid, the file exists.
                    // We assume it's up to date if present.
                    // (No SHA256 check to avoid text-corruption issues)
                }
            }

            // ✅ REMOVED EARLY EXIT: Now checks ALL files so update.js is detected
            // even if backup.sh fails.
            
            console.log(`[Integrity] Scan complete. ${changedFilesList.length} issues found.`);
            return changedFilesList.length > 0;

        } catch (e) {
            console.error('[Integrity] Check failed:', e);
            return false;
        }
    }

    // Create update modal
    function createModal() {
        if (document.getElementById('update-modal-overlay')) return;
        const overlay = document.createElement('div');
        overlay.id = 'update-modal-overlay';
        overlay.style.cssText = 'display:none;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.85);z-index:10001;justify-content:center;align-items:center;';
        overlay.onclick = (e) => { if (e.target === overlay) closeModal(); };
        const modal = document.createElement('div');
        modal.style.cssText = 'background:linear-gradient(135deg,#1a1f3a,#151b2d);border-radius:16px;padding:24px;max-width:480px;width:90%;color:#fff;border:2px solid #4a9eff;';

        const fileListHTML = changedFilesList.length > 0 
            ? `<div style="margin-top:16px;padding:12px;background:#0a0c10;border-radius:8px;border:1px solid #2a3152;max-height:200px;overflow-y:auto;">
                <div style="color:#8b92b4;font-size:12px;margin-bottom:8px;font-weight:600;">Changed Files:</div>
                ${changedFilesList.map(f => `
                    <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 8px;margin-bottom:4px;background:#1a1f3a;border-radius:6px;font-family:monospace;font-size:11px;">
                        <span style="color:#fff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:70%;">${f.path}</span>
                        <span style="color:#FF9F0A;font-size:10px;margin-left:8px;flex-shrink:0;">${f.reason}</span>
                    </div>
                `).join('')}
               </div>`
            : '';

        const integrityNote = filesChanged 
            ? `<div style="color:#FF9F0A;font-size:11px;margin-top:8px;">️ ${changedFilesList.length} file(s) changed</div>`
            : '';
            
        modal.innerHTML = `
            <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;padding-bottom:12px;border-bottom:1px solid #2a3152;">
                <div style="width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,#4a9eff,#2a75ff);display:flex;align-items:center;justify-content:center;">
                    <span style="color:#fff;font-size:20px;">🔄</span>
                </div>
                <div>
                    <div style="color:#fff;font-size:18px;font-weight:700;">Update Available!</div>
                    <div style="color:#8b92b4;font-size:12px;">New version of MTK AI Engine</div>
                    ${integrityNote}
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
            ${fileListHTML}
            <div style="display:flex;gap:12px;margin-top:16px;">
                <button id="download-btn" style="flex:1;padding:14px;background:linear-gradient(135deg,#32D74B,#2ecc71);color:#fff;border:none;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer;transition:all 0.3s;">⬇️ Download Update</button>
                <button id="later-btn" style="flex:1;padding:14px;background:#2a3152;color:#fff;border:none;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer;">Later</button>
            </div>        `;

        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        const downloadBtn = document.getElementById('download-btn');
        downloadBtn.onclick = async () => {
            try {
                downloadBtn.innerHTML = '⏳ Starting...';
                downloadBtn.style.background = '#FF9F0A';
                downloadBtn.disabled = true;
                downloadBtn.style.opacity = '0.8';
                downloadBtn.style.cursor = 'not-allowed';

                const cmd = `su -c 'nohup sh "${ACTION_SCRIPT}" > /dev/null 2>&1 &'`;
                await execCmd(cmd, 5000);

                downloadBtn.innerHTML = '⏳ Updating...';
                
                const pollInterval = setInterval(async () => {
                    const pgrepCmd = `su -c 'pgrep -f "action.sh"'`;
                    const result = await execCmd(pgrepCmd, 3000);
                    const pids = result ? result.trim().split(/\s+/).filter(p => p.length > 0) : [];
                    const isRunning = pids.length > 0;

                    if (isRunning) {
                        downloadBtn.innerHTML = '⏳ Updating...';
                        downloadBtn.style.background = '#FF9F0A';
                    } else {
                        clearInterval(pollInterval);
                        downloadBtn.innerHTML = '✅ Update Complete!';
                        downloadBtn.style.background = '#32D74B';
                        downloadBtn.disabled = false;
                        downloadBtn.style.opacity = '1';
                        downloadBtn.style.cursor = 'pointer';

                        if (window.showStatus) window.showStatus('✅ Update installed successfully!', '#32D74B');
                        setTimeout(() => closeModal(), 1500);
                    }
                }, 1500);

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
            const localContent = await execCmd(`${BUSYBOX} cat "${MODULE_PATH}" 2>/dev/null`, 5000);
            if (localContent && localContent.trim()) {
                const localProp = parseProp(localContent);
                const localVer = localProp.version || localProp.versionCode || '0.0.0';
                if (localVer && localVer !== '0.0.0') currentVersion = localVer;
            }

            const response = await fetch(ONLINE_URL, { cache: 'no-store' });
            if (response.ok) {
                const onlineContent = await response.text();
                const onlineProp = parseProp(onlineContent);
                const onlineVer = onlineProp.version || onlineProp.versionCode || '0.0.0';
                if (onlineVer && onlineVer !== '0.0.0') onlineVersion = onlineVer;
            }

            filesChanged = await checkFileIntegrity();
            
            if (currentVersion !== '0.0.0' && onlineVersion !== '0.0.0') {
                const versionNewer = compareVersions(onlineVersion, currentVersion) > 0;
                if (versionNewer || filesChanged) {
                    console.log(`[Update] Trigger: version=${versionNewer}, filesChanged=${filesChanged}`);
                    if (filesChanged) console.log('[Update] Changed files:', changedFilesList);
                    openModal();
                }
            }        } catch (e) {
            console.error('[Update] Check error:', e);
        }
    }

    // Setup manual update button
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
