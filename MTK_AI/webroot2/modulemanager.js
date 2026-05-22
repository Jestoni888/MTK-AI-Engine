// modulemanager.js - Module Manager Pro (Matching TweakFinder UI)
(function() {
    'use strict';

    // ========== CONFIGURATION ==========
    const CFG = {
        MODULES_DIR: '/data/adb/modules',
        AUTORUN_FILE: '/data/adb/.module_autorun',
        PROCESSED_FILE: '/data/adb/.module_processed',
        CHECKER_PID: '/data/adb/.module_checker.pid',
        REFRESH_INTERVAL: 10000,
        REFRESH_COOLDOWN: 3000
    };

    // ========== STATE ==========
    let currentModule = '';
    let refreshInterval = null;
    let isRefreshing = false;
    let lastRefreshTime = 0;
    let knownModules = new Set();
    let initialLoadComplete = false;
    let rootAvailable = false;

    // ========== ROOT EXEC WRAPPER ==========
    const execFn = window.exec || (async function(command, timeout = 5000) {
        return new Promise((resolve) => {
            const callback = `mm_exec_${Date.now()}_${Math.random().toString(36).substring(2)}`;
            const timer = setTimeout(() => { 
                if (window[callback]) delete window[callback]; 
                resolve(''); 
            }, timeout);
            window[callback] = (success, result) => {
                clearTimeout(timer);
                if (window[callback]) delete window[callback];
                resolve(result || '');
            };
            if (window.ksu && typeof ksu.exec === 'function') {
                try { ksu.exec(command, `window.${callback}`); } 
                catch (e) { clearTimeout(timer); if (window[callback]) delete window[callback]; resolve(''); }
            } else {
                clearTimeout(timer); if (window[callback]) delete window[callback]; resolve('');
            }
        });
    });

    // ========== STYLES (MATCHING TWEAKFINDER.JS) ==========
    const STYLES = `
    :root {
        --bg: #000; --card: #1c1c1e; --text: #fff; --text-dim: #86868b;
        --border: #3a3a3c; --blue: #0A84FF; --green: #32D74B; --red: #FF453A; --orange: #FF9F0A; --purple: #BF5AF2;        --switch-bg: #3a3a3c; --switch-on: #32D74B;
    }
    .mm-root { 
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
        background: var(--bg); 
        color: var(--text); 
        line-height: 1.4; 
        padding: 12px; 
        min-height: 100vh;
        -webkit-tap-highlight-color: transparent;
        max-width: 600px;
        margin: 0 auto;
        padding-bottom: 80px;
    }
    .mm-header { 
        display: flex; 
        justify-content: space-between; 
        align-items: center; 
        padding: 12px 0 16px; 
        border-bottom: 1px solid var(--border); 
        margin-bottom: 16px; 
    }
    .mm-header h1 { 
        font-size: 18px; 
        font-weight: 700; 
        margin: 0;
        background: linear-gradient(90deg, var(--orange), var(--purple));
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
    }
    
    .mm-btn { 
        padding: 10px 16px; 
        border: none; 
        border-radius: 10px; 
        cursor: pointer; 
        font-weight: 600; 
        font-size: 13px; 
        transition: all 0.2s; 
        display: inline-flex; 
        align-items: center; 
        gap: 6px; 
        user-select: none; 
        -webkit-user-select: none; 
    }
    .mm-btn:active { transform: scale(0.96); }
    .mm-btn-primary { 
        background: linear-gradient(135deg, var(--blue), #007AFF); 
        color: #fff; 
        box-shadow: 0 4px 12px rgba(10,132,255,0.3);     }
    .mm-btn-danger { 
        background: linear-gradient(135deg, var(--red), #FF3B30); 
        color: #fff; 
    }
    .mm-btn-secondary { 
        background: var(--card); 
        color: var(--text); 
        border: 1px solid var(--border); 
    }
    .mm-btn:disabled { opacity: 0.4; cursor: not-allowed; transform: none !important; }

    .mm-grid { 
        display: grid; 
        grid-template-columns: 1fr; 
        gap: 12px; 
        transition: opacity 0.15s ease; 
    }
    .mm-card { 
        background: var(--card); 
        border: 1px solid var(--border); 
        border-radius: 16px; 
        padding: 16px; 
        position: relative; 
        overflow: hidden; 
        transition: transform 0.25s, box-shadow 0.25s, border-color 0.25s; 
        will-change: transform; 
    }
    .mm-card:hover { 
        transform: translateY(-2px); 
        box-shadow: 0 8px 24px rgba(0,0,0,0.4); 
        border-color: var(--blue); 
    }
    
    .mm-module-header { 
        display: flex; 
        justify-content: space-between; 
        align-items: flex-start; 
        margin-bottom: 12px; 
    }
    .mm-module-name { 
        font-weight: 700; 
        font-size: 16px; 
        word-break: break-word; 
        color: #fff; 
    }
    
    .mm-badge { 
        display: inline-block; 
        padding: 4px 10px;         border-radius: 8px; 
        font-size: 11px; 
        font-weight: 700; 
        text-transform: uppercase; 
        letter-spacing: 0.5px; 
        transition: background-color 0.2s, color 0.2s, border-color 0.2s; 
    }
    .mm-badge-active { 
        background: rgba(50,215,75,0.15); 
        color: var(--green); 
        border: 1px solid var(--green); 
    }
    .mm-badge-inactive { 
        background: rgba(134,134,139,0.15); 
        color: var(--text-dim); 
        border: 1px solid var(--text-dim); 
    }
    .mm-badge-disabled { 
        background: rgba(255,159,10,0.15); 
        color: var(--orange); 
        border: 1px solid var(--orange); 
    }

    .mm-info-row { 
        font-size: 12px; 
        color: var(--text-dim); 
        margin: 10px 0; 
        display: flex; 
        flex-direction: column; 
        gap: 6px; 
    }
    .mm-pid-line { 
        font-family: 'JetBrains Mono', monospace; 
        font-size: 11px; 
        color: #a5b3ce; 
        background: rgba(0,0,0,0.3); 
        padding: 6px 8px; 
        border-radius: 8px; 
        word-break: break-all; 
        border-left: 3px solid var(--blue); 
        transition: color 0.2s; 
    }

    .mm-actions { 
        display: grid; 
        grid-template-columns: repeat(4, 1fr); 
        gap: 8px; 
        margin-top: 14px; 
    }
    .mm-actions .mm-btn {         justify-content: center; 
        padding: 10px 6px; 
        font-size: 11px; 
    }
    .mm-status-box { 
        background: var(--card); 
        border: 1px solid var(--border); 
        border-radius: 16px; 
        padding: 32px 24px; 
        text-align: center; 
        margin: 24px 0; 
    }
    .mm-status-icon { 
        font-size: 48px; 
        margin-bottom: 12px; 
        opacity: 0.6; 
    }

    /* Modal overlays - HIGHER than main modal container */
    .mm-modal-overlay { 
        position: fixed; 
        inset: 0; 
        background: rgba(0,0,0,0.85); 
        display: none; 
        align-items: center; 
        justify-content: center; 
        z-index: 10005; 
        backdrop-filter: blur(8px); 
        padding: 20px; 
    }
    .mm-modal-overlay.active { display: flex; }
    .mm-modal { 
        background: var(--card); 
        border: 1px solid var(--border); 
        border-radius: 16px; 
        width: 100%; 
        max-width: 600px; 
        max-height: 85vh; 
        display: flex; 
        flex-direction: column; 
        box-shadow: 0 8px 32px rgba(0,0,0,0.6); 
    }
    .mm-modal-header { 
        padding: 16px 18px; 
        border-bottom: 1px solid var(--border); 
        display: flex; 
        justify-content: space-between; 
        align-items: center; 
    }
    .mm-modal-header h3 {         margin: 0; 
        font-size: 16px; 
        color: #fff; 
        display: flex; 
        align-items: center; 
        gap: 8px; 
    }
    .mm-modal-body { 
        padding: 16px 18px; 
        overflow-y: auto; 
        font-family: 'JetBrains Mono', 'Fira Code', monospace; 
        font-size: 11px; 
        line-height: 1.6; 
        color: #a5b3ce; 
        white-space: pre-wrap; 
        flex: 1; 
        background: #0a0a0a; 
        border-radius: 0 0 16px 16px; 
    }
    .mm-modal-footer { 
        padding: 12px 18px; 
        border-top: 1px solid var(--border); 
        display: flex; 
        justify-content: flex-end; 
        gap: 10px; 
    }
    .mm-log-refresh { 
        background: rgba(50,215,75,0.15); 
        border: 1px solid var(--green); 
        color: var(--green); 
        padding: 6px 12px; 
        border-radius: 8px; 
        cursor: pointer; 
        font-size: 11px; 
        font-weight: 600; 
    }
    .mm-log-refresh:hover { background: rgba(50,215,75,0.25); }

    .mm-loading { 
        grid-column: 1/-1; 
        text-align: center; 
        padding: 48px; 
        color: var(--text-dim); 
        font-size: 13px; 
        animation: mm-pulse 2s infinite; 
    }
    @keyframes mm-pulse { 
        0%, 100% { opacity: 0.6; } 
        50% { opacity: 1; } 
    }    
    .mm-toast { 
        position: fixed; 
        bottom: 16px; 
        left: 50%; 
        transform: translateX(-50%) translateY(20px); 
        background: var(--card); 
        border: 1px solid var(--border); 
        padding: 12px 20px; 
        border-radius: 50px; 
        opacity: 0; 
        transition: all 0.3s; 
        pointer-events: none; 
        z-index: 2000; 
        box-shadow: 0 4px 20px rgba(0,0,0,0.4); 
        font-weight: 600; 
        color: #fff; 
        font-size: 12px; 
    }
    .mm-toast.show { 
        transform: translateX(-50%) translateY(0); 
        opacity: 1; 
    }
    
    @media (max-width: 600px) {
        .mm-grid { grid-template-columns: 1fr; }
        .mm-header { flex-direction: column; gap: 12px; align-items: flex-start; }
        .mm-actions { grid-template-columns: repeat(2, 1fr); }
        .mm-root { padding: 10px; padding-bottom: 80px; }
    }
    `;

    // ========== UI UTILITIES ==========
    function injectStyles() {
        if (document.getElementById('mm-styles')) return;
        const style = document.createElement('style');
        style.id = 'mm-styles';
        style.textContent = STYLES;
        document.head.appendChild(style);
    }

    function toast(msg, type = 'info') {
        let t = document.getElementById('mm-toast');
        if (!t) {
            t = document.createElement('div');
            t.id = 'mm-toast';
            t.className = 'mm-toast';
            document.body.appendChild(t);
        }
        t.textContent = msg;        t.style.borderColor = type === 'error' ? 'var(--red)' : type === 'success' ? 'var(--green)' : type === 'warning' ? 'var(--orange)' : 'var(--border)';
        t.classList.add('show');
        setTimeout(() => t.classList.remove('show'), 2500);
    }

    function openModal(title, content) {
        let modal = document.getElementById('mm-modal-logs');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'mm-modal-logs';
            modal.className = 'mm-modal-overlay';
            modal.onclick = (e) => { if (e.target === modal) closeModal(); };
            modal.innerHTML = `
                <div class="mm-modal">
                    <div class="mm-modal-header">
                        <h3 id="mm-modal-title">📜 Console Logs</h3>
                        <button class="mm-log-refresh" onclick="ModuleManager.refreshLogs()">🔄 Refresh Live</button>
                    </div>
                    <div id="mm-modal-body" class="mm-modal-body">Loading...</div>
                    <div class="mm-modal-footer">
                        <button class="mm-btn mm-btn-secondary" onclick="ModuleManager.copyLogs()">📋 Copy</button>
                        <button class="mm-btn mm-btn-primary" onclick="ModuleManager.closeModal()">Done</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
        }
        document.getElementById('mm-modal-title').innerHTML = title;
        document.getElementById('mm-modal-body').textContent = content;
        modal.classList.add('active');
    }

    function closeModal() {
        const modal = document.getElementById('mm-modal-logs');
        if (modal) modal.classList.remove('active');
    }

    function copyLogs() {
        const body = document.getElementById('mm-modal-body');
        if (body) {
            navigator.clipboard.writeText(body.textContent);
            toast('📋 Logs copied to clipboard', 'success');
        }
    }

    // ========== PROCESS DETECTION ==========
    async function isModuleRunning(modName, modPath) {
        const pidFiles = await execFn(`find "${modPath}" -maxdepth 1 -name "*.pid" 2>/dev/null`);
        if (pidFiles.trim()) {
            for (const pf of pidFiles.trim().split('\n')) {                if (!pf) continue;
                const pid = await execFn(`cat '${pf}' 2>/dev/null | tr -cd '0-9'`);
                if (pid && pid.trim()) {
                    const alive = await execFn(`kill -0 ${pid.trim()} 2>/dev/null && echo "alive" || echo "dead"`);
                    if (alive.trim() === 'alive') return pid.trim();
                }
            }
        }
        const psOutput = await execFn(`ps -A -o pid,args 2>/dev/null`);
        const lines = psOutput.trim().split('\n');
        for (const line of lines) {
            if (line.includes(modPath) || line.includes(modName)) {
                if (!line.includes('grep') && !line.includes('module_checker')) {
                    const pidMatch = line.match(/^(\d+)/);
                    if (pidMatch) return pidMatch[1];
                }
            }
        }
        const pgrep = await execFn(`pgrep -f "${modName}" 2>/dev/null`);
        return pgrep.trim() ? pgrep.trim().split('\n')[0] : '';
    }

    // ========== KILL MODULE ==========
    async function killModuleProcess(modName, modPath) {
        const safePath = modPath.replace(/'/g, "'\\''");
        
        const pids = await execFn(`
            ps -A -o pid,args 2>/dev/null | 
            grep -F '${safePath}' | 
            grep -vE 'grep|module_checker|Module Manager|ksu.exec' | 
            awk '{print \$1}' | 
            sort -u
        `);
        if (pids.trim()) {
            for (const pid of pids.trim().split('\n').filter(p => p && /^\d+$/.test(p.trim()))) {
                await execFn(`kill -9 ${pid.trim()} 2>/dev/null`);
            }
        }
        const namePids = await execFn(`
            pgrep -f "${modName.replace(/'/g, "'\\''")}" 2>/dev/null | 
            grep -vE 'grep|module_checker' || true
        `);
        if (namePids.trim()) {
            for (const pid of namePids.trim().split('\n').filter(p => p && /^\d+$/.test(p.trim()))) {
                await execFn(`kill -9 ${pid.trim()} 2>/dev/null`);
            }
        }
        await execFn(`sed -i "/^${modName.replace(/\//g, '\\/')}\\$/d" ${CFG.AUTORUN_FILE} 2>/dev/null`);
        await new Promise(r => setTimeout(r, 300));
    }
    // ========== START MODULE ==========
    async function startModuleProcess(modName, modPath, script) {
        const logFile = `${modPath}/restart.log`;
        const command = `
            su -c "
                export MODPATH='${modPath}';
                export MODULE_NAME='${modName}';
                cd '${modPath}' && 
                chmod +x '${script}' && 
                nohup sh '${script}' > '${logFile}' 2>&1 &
            "`;
        try {
            await execFn(command);
        } catch (e) {
            console.error(`Failed to start ${modName}:`, e);
        }
    }

    // ========== DELETE MODULE COMPLETELY ==========
    async function deleteModule(name, path) {
        if (!confirm(`⚠️ PERMANENTLY DELETE "${name}"?\n\nThis will:\n• Kill all running processes\n• Remove from /data/adb/modules\n• Delete autorun entries\n• Cannot be undone!\n\nContinue?`)) return;
        
        toast(`🗑️ Deleting ${name}...`);
        
        try {
            // 1. Kill any running processes first
            await killModuleProcess(name, path);
            await new Promise(r => setTimeout(r, 400));
            
            // 2. Remove from autorun/processed files
            await execFn(`sed -i "/^${name.replace(/\//g, '\\/')}\\$/d" ${CFG.AUTORUN_FILE} 2>/dev/null`);
            await execFn(`sed -i "/^${name.replace(/\//g, '\\/')}\\$/d" ${CFG.PROCESSED_FILE} 2>/dev/null`);
            
            // 3. Remove PID files if any
            await execFn(`find "${path}" -name "*.pid" -delete 2>/dev/null || true`);
            
            // 4. Create remove flag for Magisk/KernelSU unmount on next boot
            await execFn(`[ -f "${path}/remove" ] || touch "${path}/remove" 2>/dev/null || true`);
            
            // 5. Actually delete the module directory
            const deleteResult = await execFn(`rm -rf "${path}" 2>&1 && echo "SUCCESS" || echo "FAILED"`);
            
            if (deleteResult.trim().includes('SUCCESS')) {
                // 6. Remove card from UI immediately with animation
                const card = document.getElementById(`mm-card-${name}`);
                if (card) {
                    card.style.transition = 'all 0.2s ease';
                    card.style.opacity = '0';
                    card.style.transform = 'scale(0.95)';                    setTimeout(() => card.remove(), 200);
                }
                knownModules.delete(name);
                toast(`✅ "${name}" deleted successfully`, 'success');
                
                // 7. Refresh to ensure list consistency
                setTimeout(() => refreshModules(), 500);
            } else {
                toast(`❌ Delete failed: ${deleteResult.trim()}`, 'error');
                await refreshModules();
            }
        } catch (e) {
            console.error(`Delete error for ${name}:`, e);
            toast(`❌ Error: ${e.message || e}`, 'error');
            await refreshModules();
        }
    }

    // ========== UI RENDERING ==========
    function createModuleCard(name, path, isDisabled, isActive, pid) {
        const statusClass = isDisabled ? 'mm-badge-disabled' : (isActive ? 'mm-badge-active' : 'mm-badge-inactive');
        const statusText = isDisabled ? 'Disabled' : (isActive ? 'Active' : 'Inactive');
        const safeName = name.replace(/'/g, "\\'");
        const safePath = path.replace(/'/g, "\\'");
        return `
            <div class="mm-card" data-module="${name}" id="mm-card-${name}">
                <div class="mm-module-header">
                    <div class="mm-module-name">${name}</div>
                    <span class="mm-badge ${statusClass}" id="mm-badge-${name}">${statusText}</span>
                </div>
                <div class="mm-info-row">
                    <div>📂 <span style="color:var(--text-dim);font-size:11px">${path}</span></div>
                    <div>🔗 PID: <span class="mm-pid-line" id="mm-pid-${name}">${pid || 'None'}</span></div>
                </div>
                <div class="mm-actions">
                    <button class="mm-btn mm-btn-secondary" onclick="ModuleManager.viewLogs('${safeName}')" title="View Logs">📜Logs</button>
                    <button class="mm-btn mm-btn-danger" onclick="ModuleManager.killModule('${safeName}', '${safePath}')" ${!pid ? 'disabled' : ''} title="Kill Process">KILL</button>
                    <button class="mm-btn mm-btn-primary" onclick="ModuleManager.restartModule('${safeName}', '${safePath}')" title="Restart Module">🔄Restart</button>
                    <button class="mm-btn mm-btn-danger" style="background:linear-gradient(135deg, #8E8E93, #636366)" onclick="ModuleManager.deleteModule('${safeName}', '${safePath}')" title="Delete Completely">🗑️Delete</button>
                </div>
            </div>`;
    }

    function updateModuleCard(name, isDisabled, isActive, pid) {
        const badge = document.getElementById(`mm-badge-${name}`);
        const pidEl = document.getElementById(`mm-pid-${name}`);
        const killBtn = document.querySelector(`#mm-card-${name} .mm-btn-danger`);
        if (!badge || !pidEl) return false;
        const newClass = isDisabled ? 'mm-badge-disabled' : (isActive ? 'mm-badge-active' : 'mm-badge-inactive');
        const newText = isDisabled ? 'Disabled' : (isActive ? 'Active' : 'Inactive');        if (badge.className !== `mm-badge ${newClass}`) badge.className = `mm-badge ${newClass}`;
        if (badge.textContent !== newText) badge.textContent = newText;

        const newPidText = pid || 'None';
        if (pidEl.textContent !== newPidText) {
            pidEl.style.color = 'var(--orange)';
            pidEl.textContent = newPidText;
            setTimeout(() => pidEl.style.color = '', 300);
        }
        if (killBtn) killBtn.disabled = !pid;
        return true;
    }

    // ========== REFRESH MODULES ==========
    async function refreshModules() {
        if (isRefreshing) return;
        const now = Date.now();
        if (now - lastRefreshTime < CFG.REFRESH_COOLDOWN) return;
        isRefreshing = true; lastRefreshTime = now;
        
        try {
            const raw = await execFn(`ls ${CFG.MODULES_DIR} 2>/dev/null`);
            const names = raw.trim().split('\n').filter(n => {
                const name = n.trim();
                return name && !['magisk','modules_update','.','..'].includes(name);
            });
            
            if (!names.length) {
                if (!initialLoadComplete) {
                    const grid = document.getElementById('mm-grid');
                    if (grid) grid.innerHTML = '<div class="mm-status-box"><div class="mm-status-icon">📭</div><div style="color:var(--text-dim);font-size:13px">No modules found</div></div>';
                    initialLoadComplete = true;
                }
                knownModules.clear();
                return;
            }

            const seenModules = new Set();
            const grid = document.getElementById('mm-grid');
            if (!grid) return;
            
            for (const name of names) {
                seenModules.add(name);
                const path = `${CFG.MODULES_DIR}/${name}`;
                const existingCard = document.getElementById(`mm-card-${name}`);
                
                const disabled = await execFn(`test -f "${path}/disable" && echo "1" || echo "0"`);
                const isDisabled = disabled.trim() === "1";
                const pid = await isModuleRunning(name, path);
                const isActive = pid && pid.length > 0 && !isDisabled;                
                if (existingCard) {
                    updateModuleCard(name, isDisabled, isActive, pid);
                } else {
                    const tempDiv = document.createElement('div');
                    tempDiv.innerHTML = createModuleCard(name, path, isDisabled, isActive, pid);
                    grid.appendChild(tempDiv.firstElementChild);
                    knownModules.add(name);
                }
            }

            for (const modName of [...knownModules]) {
                if (!seenModules.has(modName)) {
                    const card = document.getElementById(`mm-card-${modName}`);
                    if (card) {
                        card.style.opacity = '0';
                        card.style.transform = 'scale(0.95)';
                        setTimeout(() => card.remove(), 200);
                    }
                    knownModules.delete(modName);
                }
            }

            if (!initialLoadComplete && seenModules.size > 0) {
                const loadingEl = grid.querySelector('.mm-loading');
                if (loadingEl) loadingEl.remove();
                initialLoadComplete = true;
                toast(`✅ Found ${names.length} module${names.length !== 1 ? 's' : ''}`, 'success');
            }
        } catch (e) {
            console.error('Refresh error:', e);
        } finally {
            isRefreshing = false;
        }
    }

    // ========== LOGS ==========
    async function viewLogs(name) {
        currentModule = name;
        openModal(`📜 Console Logs: ${name}`, '⏳ Fetching live logs...');
        await refreshLogs();
    }

    async function refreshLogs() {
        if (!currentModule) return;
        const path = `${CFG.MODULES_DIR}/${currentModule}`;
        let logs = `🔴 LIVE LOGS: ${currentModule}\n═══════════════════════════════════════\n\n`;
        
        const logcat = await execFn(`logcat -d -t 300 | grep -iE "${currentModule}|${path}" | tail -150`);
        if (logcat.trim()) logs += `📱 LOGCAT:\n${logcat.trim()}\n\n`;        
        const dmesg = await execFn(`dmesg | grep -iE "${currentModule}" | tail -30`);
        if (dmesg.trim()) logs += `🔧 DMESG:\n${dmesg.trim()}\n\n`;
        
        const restartLog = await execFn(`cat "${path}/restart.log" 2>/dev/null || echo "📭 No restart.log"`);
        logs += `🔄 RESTART LOG:\n${restartLog.trim()}\n\n`;
        
        const pid = await isModuleRunning(currentModule, path);
        if (pid) {
            const cmdline = await execFn(`cat /proc/${pid}/cmdline 2>/dev/null | tr '\\0' ' '`);
            logs += `⚡ PID: ${pid} | CMD: ${cmdline.trim() || 'N/A'}\n`;
        } else {
            logs += `⚠️ No active process\n`;
        }
        const body = document.getElementById('mm-modal-body');
        if (body) body.textContent = logs.trim();
    }

    // ========== RESTART/KILL ==========
    async function restartModule(name, path) {
        if (!confirm(`🔄 Restart "${name}"?\nKills existing & auto-runs eligible scripts.`)) return;
        toast(`🔄 Restarting ${name}...`);

        await killModuleProcess(name, path);
        await new Promise(r => setTimeout(r, 500));

        const runners = ['service.sh', 'post-fs-data.sh', 'custom.sh', 'start.sh'];
        let runner = '';
        for (const r of runners) {
            const isExec = await execFn(`[ -x "${path}/${r}" ] && echo "yes" || echo "no"`);
            if (isExec.trim() === 'yes') { runner = r; break; }
        }

        if (!runner) {
            toast(`❌ No executable script found`, 'error');
            await refreshModules();
            return;
        }

        toast(`▶️ Executing ${runner}...`);
        await startModuleProcess(name, path, runner);
        await execFn(`echo "${name}" >> ${CFG.AUTORUN_FILE}`);

        let newPid = '';
        for (let i = 0; i < 8; i++) {
            await new Promise(r => setTimeout(r, 500));
            newPid = await isModuleRunning(name, path);
            if (newPid) break;
        }
        if (newPid) {
            toast(`✅ Restarted (PID: ${newPid})`, 'success');
        } else {
            const logCheck = await execFn(`[ -f "${path}/restart.log" ] && echo "yes" || echo "no"`);
            toast(logCheck.trim() === 'yes' ? `⚠️ Script ran but exited (check logs)` : `⚠️ Not detected (may be one-shot)`, 'warning');
        }
        await refreshModules();
    }

    async function killModule(name, path) {
        if (!confirm(`⚠️ Terminate process for "${name}"?`)) return;
        toast(`⏳ Killing ${name}...`);
        await killModuleProcess(name, path);
        toast(`✅ ${name} terminated`, 'success');
        await refreshModules();
    }

    // ========== DEBUG ==========
    async function showDebugInfo() {
        toast('🔍 Gathering system info...');
        const autorunState = await execFn(`cat ${CFG.AUTORUN_FILE} 2>/dev/null || echo "(empty)"`);
        const processed = await execFn(`cat ${CFG.PROCESSED_FILE} 2>/dev/null || echo "(empty)"`);
        const lockCheck = await execFn(`cat ${CFG.CHECKER_PID} 2>/dev/null || echo "(none)"`);
        openModal('🔍 Debug State', 
`📂 .module_autorun:\n${autorunState.trim()}
📂 .module_processed:\n${processed.trim()}
🔒 Checker PID:\n${lockCheck.trim()}`);
    }

    // ========== UI CREATION ==========
    function createUI(container) {
        container.innerHTML = `
            <div class="mm-root">
                <div class="mm-header">
                    <h1>📦 Module Manager</h1>
                    <button class="mm-btn mm-btn-secondary" onclick="ModuleManager.showDebugInfo()" style="padding:6px 12px;font-size:11px">🔍</button>
                </div>
                <div id="mm-grid" class="mm-grid">
                    <div class="mm-loading">🔍 Scanning modules...</div>
                </div>
            </div>
        `;
    }

    // ========== AUTO-REFRESH ==========
    function startAutoRefresh() {
        if (refreshInterval) clearInterval(refreshInterval);
        refreshModules();
        refreshInterval = setInterval(() => {
            if (!document.hidden) refreshModules();        }, CFG.REFRESH_INTERVAL);
    }

    // ========== MODAL SETUP ==========
    function setupModuleManagerModal() {
        const btn = document.getElementById('modulemanager-btn');
        if (!btn) return;

        if (!document.getElementById('mm-modal')) {
            const modal = document.createElement('div');
            modal.id = 'mm-modal';
            modal.style.cssText = 'position:fixed;inset:0;background:#000;z-index:10000;display:none;overflow-y:auto;font-family:sans-serif;';
            modal.innerHTML = `
                <div style="position:sticky;top:0;background:rgba(0,0,0,0.95);padding:12px 16px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #3a3a3c;z-index:10;backdrop-filter:blur(10px);">
                    <h2 style="color:#fff;margin:0;font-size:16px;font-weight:700">📦 Module Manager</h2>
                    <button id="mm-close-btn" style="background:#3a3a3c;color:#fff;border:none;padding:6px 14px;border-radius:8px;cursor:pointer;font-size:12px">Close</button>
                </div>
                <div id="mm-modal-root" style="padding-bottom:20px;"></div>
            `;
            document.body.appendChild(modal);
            
            document.getElementById('mm-close-btn').onclick = () => {
                modal.style.display = 'none';
            };
        }

        btn.onclick = async () => {
            const modal = document.getElementById('mm-modal');
            const root = document.getElementById('mm-modal-root');
            
            modal.style.display = 'block';
            
            if (!root.hasChildNodes()) {
                injectStyles();
                createUI(root);
                
                try {
                    const test = await execFn('id');
                    rootAvailable = test.includes('uid=0');
                } catch (e) { rootAvailable = false; }
                
                if (!rootAvailable) {
                    toast('⚠️ Root required', 'error');
                }
                
                startAutoRefresh();
            }
        };
    }
    // ========== PUBLIC API ==========
    window.ModuleManager = {
        init: (containerId) => {
            injectStyles();
            const container = document.getElementById(containerId);
            if (!container) { console.error(`ModuleManager: Container #${containerId} not found`); return; }
            createUI(container);
            
            execFn('id').then(test => {
                rootAvailable = test.includes('uid=0');
                if (!rootAvailable) toast('⚠️ Root required', 'error');
            });
            
            startAutoRefresh();
        },
        refreshModules,
        viewLogs,
        refreshLogs,
        copyLogs,
        closeModal,
        restartModule,
        killModule,
        deleteModule,  // <-- Added to public API
        showDebugInfo,
        getKnownModules: () => [...knownModules],
        isRootAvailable: () => rootAvailable
    };

    document.addEventListener('DOMContentLoaded', setupModuleManagerModal);

})();