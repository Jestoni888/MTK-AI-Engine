// modulemanager.js - Module Manager Pro (Popup Modal Only)
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

    // ========== STYLES (MATCHING MAINTENANCE MODAL THEMING) ==========
    const STYLES = `
    :root {
        --bg: var(--bg-primary, #000000); 
        --card: var(--bg-card, #111111); 
        --text: #ffffff; 
        --text-dim: var(--text-secondary, #888888);
        --border: var(--border-color, #222222); 
        --blue: var(--accent-blue, #4a9eff); 
        --green: var(--accent-green, #2ecc71); 
        --red: var(--accent-red, #e74c3c); 
        --orange: var(--accent-orange, #f39c12); 
        --purple: var(--accent-purple, #9b59b6);        
        --switch-bg: var(--bg-secondary, #0a0a0a); 
        --switch-on: var(--accent-green, #2ecc71);
    }
    .mm-header { 
        display: flex; 
        justify-content: space-between; 
        align-items: center; 
        padding: 0 0 15px; 
        border-bottom: 1px solid var(--border); 
        margin-bottom: 15px; 
    }
    .mm-header h1 { 
        font-size: 18px; 
        font-weight: 700; 
        margin: 0;
        color: var(--blue);
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
        background: var(--blue); 
        color: #ffffff; 
        box-shadow: 0 4px 12px rgba(74,158,255,0.3); 
    }
    .mm-btn-danger { 
        background: var(--red); 
        color: #ffffff; 
    }
    .mm-btn-secondary { 
        background: var(--switch-bg); 
        color: #ffffff; 
        border: 1px solid var(--border); 
    }
    .mm-btn:disabled { opacity: 0.4; cursor: not-allowed; transform: none !important; }

    .mm-grid { 
        display: grid; 
        grid-template-columns: 1fr; 
        gap: 10px; 
        transition: opacity 0.15s ease; 
    }
    .mm-card { 
        background: var(--switch-bg); 
        border: 1px solid var(--border); 
        border-radius: 12px; 
        padding: 14px; 
        position: relative; 
        overflow: hidden; 
        transition: transform 0.25s, box-shadow 0.25s, border-color 0.25s; 
        will-change: transform; 
    }
    .mm-card:hover { 
        border-color: var(--blue); 
    }
    
    .mm-module-header { 
        display: flex; 
        justify-content: space-between; 
        align-items: flex-start; 
        margin-bottom: 8px; 
    }
    .mm-module-name { 
        font-weight: 700; 
        font-size: 15px; 
        word-break: break-word; 
        color: #ffffff; 
    }
    
    .mm-badge { 
        display: inline-block; 
        padding: 3px 8px; 
        border-radius: 6px; 
        font-size: 10px; 
        font-weight: 700; 
        text-transform: uppercase; 
        letter-spacing: 0.5px; 
    }
    .mm-badge-active { 
        background: rgba(46,204,113,0.15); 
        color: var(--green); 
        border: 1px solid var(--green); 
    }
    .mm-badge-inactive { 
        background: rgba(136,136,136,0.15); 
        color: var(--text-dim); 
        border: 1px solid var(--text-dim); 
    }
    .mm-badge-disabled { 
        background: rgba(243,156,18,0.15); 
        color: var(--orange); 
        border: 1px solid var(--orange); 
    }

    .mm-info-row { 
        font-size: 11px; 
        color: var(--text-dim); 
        margin: 8px 0; 
        display: flex; 
        flex-direction: column; 
        gap: 4px; 
    }
    .mm-pid-line { 
        font-family: 'JetBrains Mono', monospace; 
        font-size: 11px; 
        color: #ffffff; 
        background: var(--bg); 
        padding: 4px 6px; 
        border-radius: 6px; 
        word-break: break-all; 
        border-left: 3px solid var(--blue); 
    }

    .mm-actions { 
        display: grid; 
        grid-template-columns: repeat(4, 1fr); 
        gap: 6px; 
        margin-top: 10px; 
    }
    .mm-actions .mm-btn { 
        justify-content: center; 
        padding: 8px 4px; 
        font-size: 11px; 
        color: #ffffff;
        border-radius: 8px;
    }
    
    .mm-status-box { 
        background: var(--switch-bg); 
        border: 1px solid var(--border); 
        border-radius: 12px; 
        padding: 24px; 
        text-align: center; 
        margin: 10px 0; 
    }
    .mm-status-icon { 
        font-size: 36px; 
        margin-bottom: 8px; 
        opacity: 0.6; 
    }

    /* Popup Modal Styles matching Maintenance Modal */
    .mm-modal-overlay { 
        position: fixed; 
        inset: 0; 
        background: rgba(0,0,0,0.9); 
        display: none; 
        align-items: center; 
        justify-content: center; 
        z-index: 10000; 
        backdrop-filter: blur(5px); 
        padding: 20px; 
    }
    .mm-modal-overlay.active { display: flex; }
    
    .mm-modal { 
        background: var(--card); 
        border: 1px solid var(--border); 
        border-radius: 16px; 
        padding: 20px; 
        width: 100%; 
        max-width: 600px; 
        max-height: 85vh; 
        display: flex; 
        flex-direction: column; 
        box-shadow: 0 0 40px rgba(0,0,0,0.5); 
    }
    
    .mm-modal-body-scroll { 
        overflow-y: auto; 
        max-height: 65vh; 
        padding-right: 2px;
    }

    .mm-modal-inner-body { 
        font-family: 'JetBrains Mono', 'Fira Code', monospace; 
        font-size: 11px; 
        line-height: 1.6; 
        color: #ffffff; 
        white-space: pre-wrap; 
        background: var(--switch-bg); 
        border: 1px solid var(--border);
        border-radius: 10px;
        padding: 12px;
        margin-bottom: 15px;
        max-height: 50vh;
        overflow-y: auto;
    }
    
    .mm-log-refresh { 
        background: rgba(46,204,113,0.15); 
        border: 1px solid var(--green); 
        color: #ffffff; 
        padding: 6px 12px; 
        border-radius: 8px; 
        cursor: pointer; 
        font-size: 11px; 
        font-weight: 600; 
    }
    .mm-log-refresh:hover { background: rgba(46,204,113,0.25); }

    .mm-loading { 
        grid-column: 1/-1; 
        text-align: center; 
        padding: 32px; 
        color: var(--text-dim); 
        font-size: 13px; 
    }
    
    .mm-toast { 
        position: fixed; 
        bottom: 16px; 
        left: 50%; 
        transform: translateX(-50%) translateY(20px); 
        background: var(--card); 
        border: 1px solid var(--border); 
        padding: 10px 18px; 
        border-radius: 30px; 
        opacity: 0; 
        transition: all 0.3s; 
        pointer-events: none; 
        z-index: 20000; 
        box-shadow: 0 4px 20px rgba(0,0,0,0.4); 
        font-weight: 600; 
        color: #ffffff; 
        font-size: 12px; 
    }
    .mm-toast.show { 
        transform: translateX(-50%) translateY(0); 
        opacity: 1; 
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
        t.textContent = msg;
        t.style.borderColor = type === 'error' ? 'var(--red)' : type === 'success' ? 'var(--green)' : type === 'warning' ? 'var(--orange)' : 'var(--border)';
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
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
                        <h3 id="mm-modal-title" style="color:var(--blue);margin:0;font-size:16px;">📜 Console Logs</h3>
                        <button class="mm-log-refresh" onclick="ModuleManager.refreshLogs()">🔄 Refresh Live</button>
                    </div>
                    <div id="mm-modal-body" class="mm-modal-inner-body">Loading...</div>
                    <div style="display:flex;gap:8px;">
                        <button class="mm-btn mm-btn-secondary" style="flex:1;" onclick="ModuleManager.copyLogs()">📋 Copy</button>
                        <button class="mm-btn mm-btn-primary" style="flex:1;" onclick="ModuleManager.closeModal()">Done</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
        }
        document.getElementById('mm-modal-title').textContent = title;
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
            for (const pf of pidFiles.trim().split('\n')) {
                if (!pf) continue;
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
        if (!confirm(`⚠️ PERMANENTLY DELETE "${name}"?\n\nThis will remove files completely and cannot be undone!`)) return;
        
        toast(`🗑️ Deleting ${name}...`);
        try {
            await killModuleProcess(name, path);
            await new Promise(r => setTimeout(r, 400));
            
            await execFn(`sed -i "/^${name.replace(/\//g, '\\/')}\\$/d" ${CFG.AUTORUN_FILE} 2>/dev/null`);
            await execFn(`sed -i "/^${name.replace(/\//g, '\\/')}\\$/d" ${CFG.PROCESSED_FILE} 2>/dev/null`);
            await execFn(`find "${path}" -name "*.pid" -delete 2>/dev/null || true`);
            await execFn(`[ -f "${path}/remove" ] || touch "${path}/remove" 2>/dev/null || true`);
            
            const deleteResult = await execFn(`rm -rf "${path}" 2>&1 && echo "SUCCESS" || echo "FAILED"`);
            
            if (deleteResult.trim().includes('SUCCESS')) {
                const card = document.getElementById(`mm-card-${name}`);
                if (card) {
                    card.style.transition = 'all 0.2s ease';
                    card.style.opacity = '0';
                    card.style.transform = 'scale(0.95)';
                    setTimeout(() => card.remove(), 200);
                }
                knownModules.delete(name);
                toast(`✅ "${name}" deleted successfully`, 'success');
                setTimeout(() => refreshModules(), 500);
            } else {
                toast(`❌ Delete failed`, 'error');
                await refreshModules();
            }
        } catch (e) {
            toast(`❌ Error deleting module`, 'error');
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
                    <div>📂 <span style="color:var(--text-dim);font-size:10px">${path}</span></div>
                    <div>🔗 PID: <span class="mm-pid-line" id="mm-pid-${name}">${pid || 'None'}</span></div>
                </div>
                <div class="mm-actions">
                    <button class="mm-btn mm-btn-secondary" onclick="ModuleManager.viewLogs('${safeName}')">📜 Logs</button>
                    <button class="mm-btn mm-btn-danger" onclick="ModuleManager.killModule('${safeName}', '${safePath}')" ${!pid ? 'disabled' : ''}>KILL</button>
                    <button class="mm-btn mm-btn-primary" onclick="ModuleManager.restartModule('${safeName}', '${safePath}')">🔄 Restart</button>
                    <button class="mm-btn mm-btn-secondary" style="border-color:var(--red); color:var(--red);" onclick="ModuleManager.deleteModule('${safeName}', '${safePath}')">🗑️ Delete</button>
                </div>
            </div>`;
    }

    function updateModuleCard(name, isDisabled, isActive, pid) {
        const badge = document.getElementById(`mm-badge-${name}`);
        const pidEl = document.getElementById(`mm-pid-${name}`);
        const killBtn = document.querySelector(`#mm-card-${name} .mm-btn-danger`);
        if (!badge || !pidEl) return false;
        
        const newClass = isDisabled ? 'mm-badge-disabled' : (isActive ? 'mm-badge-active' : 'mm-badge-inactive');
        const newText = isDisabled ? 'Disabled' : (isActive ? 'Active' : 'Inactive');
        if (badge.className !== `mm-badge ${newClass}`) badge.className = `mm-badge ${newClass}`;
        if (badge.textContent !== newText) badge.textContent = newText;

        const newPidText = pid || 'None';
        if (pidEl.textContent !== newPidText) {
            pidEl.textContent = newPidText;
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
            
            const grid = document.getElementById('mm-grid');
            if (!grid) return;

            if (!names.length) {
                if (!initialLoadComplete) {
                    grid.innerHTML = '<div class="mm-status-box"><div class="mm-status-icon">📭</div><div style="color:var(--text-dim);font-size:12px">No modules found</div></div>';
                    initialLoadComplete = true;
                }
                knownModules.clear();
                return;
            }

            const seenModules = new Set();
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
                    if (card) card.remove();
                    knownModules.delete(modName);
                }
            }

            if (!initialLoadComplete && seenModules.size > 0) {
                const loadingEl = grid.querySelector('.mm-loading');
                if (loadingEl) loadingEl.remove();
                initialLoadComplete = true;
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
        
        const logcat = await execFn(`logcat -d -t 300 | grep -iE "${currentModule}|${path}" | tail -100`);
        if (logcat.trim()) logs += `📱 LOGCAT:\n${logcat.trim()}\n\n`;
        
        const restartLog = await execFn(`cat "${path}/restart.log" 2>/dev/null || echo "📭 No restart.log"`);
        logs += `🔄 RESTART LOG:\n${restartLog.trim()}\n`;
        
        const body = document.getElementById('mm-modal-body');
        if (body) body.textContent = logs.trim();
    }

    // ========== RESTART/KILL ==========
    async function restartModule(name, path) {
        toast(`🔄 Restarting ${name}...`);
        await killModuleProcess(name, path);
        await new Promise(r => setTimeout(r, 400));

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

        await startModuleProcess(name, path, runner);
        await execFn(`echo "${name}" >> ${CFG.AUTORUN_FILE}`);
        toast(`✅ Restarted successfully`, 'success');
        await refreshModules();
    }

    async function killModule(name, path) {
        toast(`⏳ Killing ${name}...`);
        await killModuleProcess(name, path);
        toast(`✅ ${name} terminated`, 'success');
        await refreshModules();
    }

    async function showDebugInfo() {
        const autorunState = await execFn(`cat ${CFG.AUTORUN_FILE} 2>/dev/null || echo "(empty)"`);
        openModal('🔍 Debug State', `📂 .module_autorun:\n${autorunState.trim()}`);
    }

    // ========== UI CREATION (MAINTENANCE STYLE MODAL) ==========
    function setupModuleManagerModal() {
        const btn = document.getElementById('modulemanager-btn');
        if (!btn) return;

        // Make button parent row clickable or bind directly like Maintenance Manager
        const parentRow = btn.closest('.setting-item, div[style*="display: flex"]') || btn.parentElement;
        if (parentRow && parentRow !== btn) {
            parentRow.style.cursor = 'pointer';
            parentRow.addEventListener('click', (e) => {
                if (e.target !== btn) openManagerModal();
            });
        }
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            openManagerModal();
        });
    }

    function openManagerModal() {
        if (!document.getElementById('mm-modal')) {
            const modal = document.createElement('div');
            modal.id = 'mm-modal';
            modal.className = 'mm-modal-overlay';
            modal.onclick = (e) => {
                if (e.target === modal) modal.classList.remove('active');
            };
            modal.innerHTML = `
                <div class="mm-modal">
                    <div class="mm-header">
                        <h1>📦 Module Manager</h1>
                        <button class="mm-btn mm-btn-secondary" onclick="ModuleManager.showDebugInfo()" style="padding:4px 10px; font-size:11px;">🔍</button>
                    </div>
                    <div class="mm-modal-body-scroll">
                        <div id="mm-grid" class="mm-grid">
                            <div class="mm-loading">🔍 Scanning modules...</div>
                        </div>
                    </div>
                    <div style="margin-top: 15px;">
                        <button id="mm-close-btn" class="mm-btn mm-btn-secondary" style="width: 100%; justify-content: center; padding: 12px;">Close</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);

            document.getElementById('mm-close-btn').onclick = () => {
                modal.classList.remove('active');
            };
        }

        const modal = document.getElementById('mm-modal');
        modal.classList.add('active');
        
        injectStyles();
        
        execFn('id').then(test => {
            rootAvailable = test.includes('uid=0');
        }).catch(() => { rootAvailable = false; });
        
        if (refreshInterval) clearInterval(refreshInterval);
        refreshModules();
        refreshInterval = setInterval(() => {
            if (!document.hidden && document.getElementById('mm-modal')?.classList.contains('active')) {
                refreshModules();
            }
        }, CFG.REFRESH_INTERVAL);
    }

    // ========== PUBLIC API ==========
    window.ModuleManager = {
        refreshModules,
        viewLogs,
        refreshLogs,
        copyLogs,
        closeModal,
        restartModule,
        killModule,
        deleteModule,
        showDebugInfo
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', setupModuleManagerModal);
    } else {
        setupModuleManagerModal();
    }

})();
