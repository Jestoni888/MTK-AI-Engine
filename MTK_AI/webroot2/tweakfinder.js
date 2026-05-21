// tweakfinder.js - Tweak Finder & Control Builder Module
(function() {
    'use strict';

    // ========== CONFIGURATION ==========
    const CFG = {
        BB: "/data/adb/modules/MTK_AI/busybox",
        CACHE_FILE: "/sdcard/MTK_AI_Engine/tweak_search_cache.json",
        REGISTRY_FILE: "/sdcard/MTK_AI_Engine/tweak_controls.json",
        VALUES_DIR: "/sdcard/MTK_AI_Engine/tweak_values",
        TRIGGERS_DIR: "/sdcard/MTK_AI_Engine/triggers",
        safePaths: [
            "/sys/class","/sys","/sys/devices","/sys/kernel","/sys/module",
            "/proc", "/dev/cpuctl","/dev/cpuset","/dev"
        ],
        maxAnalyze: 8192,
        maxResults: 2000
    };

    // ========== STATE ==========
    let searchCache = {}, controls = [], analyzing = null, editingId = null;
    let rootAvailable = false, currentApp = null, appScripts = {};
    let watchdogInterval = null;
    let currentBrowsePath = '/', browseHistory = [];

    // ========== ROOT EXECUTION WRAPPER ==========
    const execFn = window.exec || (async function(cmd, timeout = 30000) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('TIMEOUT')), timeout);
            const cb = `tf_exec_${Date.now()}_${Math.random().toString(36).substring(2)}`;
            window[cb] = (_, res, err) => {
                clearTimeout(timer);
                delete window[cb];
                if (err) reject(new Error(err));
                else resolve(res || '');
            };
            if (window.ksu) ksu.exec(cmd, `window.${cb}`);
            else { clearTimeout(timer); resolve(''); }
        });
    });

    // ========== UI STYLES (Injected Dynamically) ==========
    const STYLES = `
    :root { --bg: #000; --card: #1c1c1e; --text: #fff; --text-dim: #86868b; --border: #3a3a3c; --blue: #0A84FF; --green: #32D74B; --red: #FF453A; --orange: #FF9F0A; --switch-bg: #3a3a3c; --switch-on: #32D74B; }
    .tf-root { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: var(--bg); color: var(--text); padding: 12px; line-height: 1.4; max-width: 600px; margin: 0 auto; padding-bottom: 80px; }
    .tf-header { display: flex; justify-content: space-between; align-items: center; padding: 12px 0 16px; border-bottom: 1px solid var(--border); margin-bottom: 16px; }
    .tf-header h1 { font-size: 18px; font-weight: 700; }
    .tf-header .status { font-size: 11px; color: var(--text-dim); }
    .tf-search-box { display: flex; gap: 8px; margin-bottom: 12px; }
    .tf-search-box input { flex: 1; padding: 12px 14px; background: var(--card); color: var(--text); border: 1px solid var(--border); border-radius: 12px; font-size: 14px; }    .tf-search-box input:focus { outline: none; border-color: var(--blue); }    .tf-search-box button { padding: 12px 16px; background: var(--blue); color: white; border: none; border-radius: 12px; font-weight: 600; font-size: 14px; }
    .tf-search-options { display: flex; gap: 12px; margin-bottom: 16px; font-size: 12px; flex-wrap: wrap; }
    .tf-search-options label { display: flex; align-items: center; gap: 4px; color: var(--text-dim); }
    .tf-search-options input { accent-color: var(--blue); }
    .tf-results-container { margin-bottom: 24px; }
    .tf-list-item { display: flex; justify-content: space-between; align-items: center; padding: 12px; background: var(--card); border-radius: 12px; margin-bottom: 8px; border: 1px solid var(--border); }
    .tf-item-content { flex: 1; min-width: 0; margin-right: 10px; cursor: pointer; }
    .tf-item-title { font-weight: 600; font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .tf-item-desc { font-size: 11px; color: var(--text-dim); margin-top: 2px; word-break: break-all; }
    .tf-item-badge { font-size: 9px; color: var(--green); background: rgba(50,215,75,0.15); padding: 2px 6px; border-radius: 4px; margin-top: 4px; display: inline-block; }
    .tf-btn-sm { padding: 6px 10px; background: #2c2c2e; color: white; border: none; border-radius: 8px; font-size: 10px; font-weight: 500; margin-left: 4px; cursor: pointer; }
    .tf-btn-sm.add { background: var(--orange); }
    .tf-btn-sm.edit { background: var(--blue); }
    .tf-btn-sm.remove { background: var(--red); }
    .tf-btn-sm:active { transform: scale(0.98); }
    .tf-section-title { font-size: 14px; font-weight: 600; color: var(--blue); margin: 24px 0 12px; text-transform: uppercase; letter-spacing: 0.5px; }
    .tf-control-card { background: var(--card); border-radius: 12px; padding: 14px; margin-bottom: 10px; border: 1px solid var(--border); }
    .tf-control-card.applied { border-color: var(--green); box-shadow: 0 0 8px rgba(50,215,75,0.3); }
    .tf-control-header { display: flex; justify-content: space-between; align-items: start; margin-bottom: 10px; }
    .tf-control-title { font-weight: 600; font-size: 14px; }
    .tf-control-path { font-size: 10px; color: var(--text-dim); }
    .tf-control-actions { display: flex; gap: 4px; }
    .tf-ios-switch { position: relative; display: inline-block; width: 46px; height: 28px; flex-shrink: 0; }
    .tf-ios-switch input { opacity: 0; width: 0; height: 0; }
    .tf-slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: var(--switch-bg); transition: .3s; border-radius: 28px; }
    .tf-slider:before { position: absolute; content: ""; height: 24px; width: 24px; left: 2px; bottom: 2px; background-color: white; transition: .3s; border-radius: 50%; }
    .tf-ios-switch input:checked + .tf-slider { background-color: var(--switch-on); }
    .tf-ios-switch input:checked + .tf-slider:before { transform: translateX(18px); }
    .tf-slider-control { width: 100%; padding: 4px 0; }
    .tf-slider-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
    .tf-slider-value { font-family: monospace; color: var(--blue); font-weight: bold; background: rgba(10,132,255,0.15); padding: 2px 6px; border-radius: 4px; font-size: 12px; }
    .tf-range { width: 100%; height: 4px; background: var(--switch-bg); border-radius: 2px; outline: none; -webkit-appearance: none; }
    .tf-range::-webkit-slider-thumb { -webkit-appearance: none; width: 20px; height: 20px; background: var(--blue); border-radius: 50%; cursor: pointer; }
    .tf-slider-hints { display: flex; justify-content: space-between; font-size: 9px; color: var(--text-dim); margin-top: 2px; }
    .tf-text-control, .tf-gov-select { width: 100%; padding: 10px; background: #2c2c2e; color: white; border: 1px solid var(--border); border-radius: 8px; font-size: 13px; }
    .tf-ppm-grid { display: grid; grid-template-columns: 1fr; gap: 8px; margin-top: 10px; }
    .tf-ppm-item { display: flex; justify-content: space-between; align-items: center; padding: 10px; background: rgba(255,255,255,0.03); border-radius: 8px; border: 1px solid var(--border); }
    .tf-ppm-info { flex: 1; min-width: 0; }
    .tf-ppm-idx { font-size: 10px; color: var(--orange); font-weight: 600; margin-bottom: 2px; }
    .tf-ppm-name { font-size: 12px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .tf-ppm-status { font-size: 10px; color: var(--text-dim); margin-top: 2px; }
    .tf-ppm-status.on { color: var(--green); }
    .tf-ppm-status.off { color: var(--red); }
    .tf-modal-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.85); display: flex; align-items: center; justify-content: center; z-index: 10005; padding: 20px; }
    .tf-modal-card { background: var(--card); border-radius: 16px; padding: 18px; max-width: 420px; width: 100%; border: 1px solid var(--border); }
    .tf-modal-title { font-size: 16px; font-weight: 700; margin-bottom: 12px; }
    .tf-modal-field { margin-bottom: 14px; }
    .tf-modal-field label { display: block; font-size: 12px; margin-bottom: 5px; color: var(--text-dim); }
    .tf-modal-field input, .tf-modal-field select { width: 100%; padding: 10px; background: #2c2c2e; color: white; border: 1px solid var(--border); border-radius: 8px; font-size: 13px; }
    .tf-modal-row { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }    .tf-modal-check { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--text-dim); }    .tf-modal-check input { accent-color: var(--blue); }
    .tf-modal-actions { display: flex; gap: 10px; margin-top: 16px; }
    .tf-modal-actions button { flex: 1; padding: 11px; border: none; border-radius: 10px; font-weight: 600; font-size: 13px; cursor: pointer; }
    .tf-modal-actions .cancel { background: #2c2c2e; color: white; }
    .tf-modal-actions .create { background: var(--blue); color: white; }
    .tf-modal-actions .delete { background: var(--red); color: white; }
    .tf-status-bar { position: fixed; bottom: 16px; left: 50%; transform: translateX(-50%); background: var(--card); color: var(--text); padding: 10px 20px; border-radius: 50px; font-size: 12px; font-weight: 500; box-shadow: 0 4px 20px rgba(0,0,0,0.4); border: 1px solid var(--border); z-index: 10000; max-width: 90%; text-align: center; display: none; animation: slideUp 0.25s ease; }
    @keyframes slideUp { from { opacity: 0; transform: translate(-50%, 15px); } to { opacity: 1; transform: translate(-50%, 0); } }
    .tf-status-bar.success { border-color: var(--green); color: var(--green); }
    .tf-status-bar.error { border-color: var(--red); color: var(--red); }
    .tf-status-bar.warning { border-color: var(--orange); color: var(--orange); }
    .tf-empty-state { text-align: center; padding: 30px 20px; color: var(--text-dim); }
    .tf-empty-state .icon { font-size: 40px; margin-bottom: 12px; opacity: 0.6; }
    .tf-empty-state p { margin: 6px 0; font-size: 13px; }
    .tf-empty-state code { background: var(--card); padding: 2px 5px; border-radius: 4px; font-size: 10px; color: var(--blue); }
    .tf-loading { display: flex; align-items: center; justify-content: center; gap: 8px; padding: 20px; color: var(--text-dim); font-size: 13px; }
    .tf-spinner { width: 16px; height: 16px; border: 2px solid var(--border); border-top-color: var(--blue); border-radius: 50%; animation: spin 1s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .tf-cache-info { font-size: 11px; color: var(--text-dim); text-align: center; margin: 8px 0 16px; padding: 8px; background: rgba(255,255,255,0.03); border-radius: 8px; }
    .tf-cache-info button { background: none; border: none; color: var(--blue); font-size: 11px; padding: 0; cursor: pointer; text-decoration: underline; }
    .tf-tab-nav { display: flex; gap: 8px; margin-bottom: 16px; overflow-x: auto; padding-bottom: 8px; }
    .tf-tab-btn { padding: 10px 16px; background: var(--card); border: 1px solid var(--border); border-radius: 10px; font-size: 12px; font-weight: 600; color: var(--text-dim); white-space: nowrap; cursor: pointer; }
    .tf-tab-btn.active { background: var(--blue); color: white; border-color: var(--blue); }
    .tf-tab-content { display: none; }
    .tf-tab-content.active { display: block; }
    .tf-app-list { margin-top: 12px; }
    .tf-app-item { display: flex; justify-content: space-between; align-items: center; padding: 12px; background: var(--card); border-radius: 12px; margin-bottom: 8px; border: 1px solid var(--border); }
    .tf-app-pkg { font-family: monospace; font-size: 12px; color: var(--blue); flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-right: 10px; }
    .tf-app-status { font-size: 10px; color: var(--text-dim); background: rgba(255,255,255,0.05); padding: 4px 8px; border-radius: 6px; margin-right: 8px; }
    .tf-app-status.has-script { color: var(--green); background: rgba(50,215,75,0.15); }
    .tf-editor-modal { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.9); z-index: 10005; display: none; align-items: center; justify-content: center; padding: 20px; }
    .tf-editor-modal.active { display: flex; }
    .tf-editor-card { background: var(--card); border-radius: 16px; padding: 20px; width: 100%; max-width: 600px; max-height: 90vh; overflow-y: auto; border: 1px solid var(--border); }
    .tf-editor-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
    .tf-editor-title { font-size: 16px; font-weight: 700; }
    .tf-editor-pkg { font-family: monospace; font-size: 11px; color: var(--blue); margin-top: 4px; }
    .tf-script-editor { width: 100%; min-height: 300px; background: #0a0a0a; color: #0f0; border: 1px solid var(--border); border-radius: 8px; padding: 12px; font-family: 'Courier New', monospace; font-size: 11px; line-height: 1.5; resize: vertical; }
    .tf-editor-actions { display: flex; gap: 10px; margin-top: 16px; }
    .tf-editor-actions button { flex: 1; padding: 12px; border: none; border-radius: 10px; font-weight: 600; font-size: 13px; cursor: pointer; }
    .tf-btn-test { background: var(--orange); color: white; }
    .tf-btn-save { background: var(--blue); color: white; }
    .tf-btn-cancel { background: #2c2c2e; color: white; }
    .tf-btn-delete { background: var(--red); color: white; }
    .tf-current-app-box { background: rgba(10,132,255,0.1); border: 1px solid var(--blue); border-radius: 12px; padding: 16px; margin-bottom: 16px; }
    .tf-current-app-label { font-size: 11px; color: var(--text-dim); margin-bottom: 8px; }
    .tf-current-app-value { font-family: monospace; font-size: 14px; color: var(--blue); word-break: break-all; }
    .tf-app-icon { width: 32px; height: 32px; border-radius: 8px; margin-right: 12px; background: var(--card); display: flex; align-items: center; justify-content: center; font-size: 16px; flex-shrink: 0; }
    .tf-app-item button { z-index: 100; position: relative; pointer-events: auto !important; }
    .tf-app-item > div[onclick] { pointer-events: none; }    .tf-app-item > div[onclick] > * { pointer-events: auto; }
    .tf-app-item > div[onclick] button { pointer-events: auto !important; }    `;

    // ========== UTILITY FUNCTIONS ==========
    function showStatus(msg, type = 'info', dur = 3000) {
        const b = document.getElementById('tf-status-bar');
        if (!b) return;
        b.textContent = msg;
        b.className = '';
        b.classList.add(type);
        b.style.display = 'block';
        if (dur > 0) setTimeout(() => { if (b.textContent === msg) b.style.display = 'none'; }, dur);
    }

    function updateHeader(text, color = '') {
        const el = document.getElementById('tf-header-status');
        if (el) { el.textContent = text; el.style.color = color; }
    }

    function escapeHtml(s) {
        const d = document.createElement('div');
        d.textContent = s;
        return d.innerHTML;
    }

    function filterProcPids(paths) {
        return paths.filter(path => {
            if (path.startsWith('/proc/')) {
                const afterProc = path.substring(6);
                const firstPart = afterProc.split('/')[0];
                return /^[a-z]/i.test(firstPart);
            }
            return true;
        });
    }

    async function getChipsetProcPaths() {
        try {
            const cpuinfo = await execFn(`cat /proc/cpuinfo 2>/dev/null`);
            const extraPaths = [];
            if (cpuinfo.toLowerCase().includes('mediatek')) {
                extraPaths.push('/proc/mtktscpu', '/proc/mtk_cpufreq', '/proc/mtk_gpu');
            } else if (cpuinfo.toLowerCase().includes('qualcomm') || cpuinfo.toLowerCase().includes('snapdragon')) {
                extraPaths.push('/proc/msm_cpufreq', '/proc/kgsl-3d0', '/proc/qcom');
            } else if (cpuinfo.toLowerCase().includes('unisoc') || cpuinfo.toLowerCase().includes('spreadtrum')) {
                extraPaths.push('/proc/sprd_cpufreq', '/proc/gpu', '/proc/thermal');
            } else if (cpuinfo.toLowerCase().includes('exynos')) {
                extraPaths.push('/proc/exynos_cpufreq', '/proc/mali');
            }            return extraPaths;
        } catch (e) { return []; }
    }
    // ========== SEARCH & ANALYSIS ==========
    async function doSearch() {
        if (!rootAvailable) { showStatus('⚠️ Root not available', 'error'); return; }
        const kw = document.getElementById('tf-search-input').value.trim();
        const byName = document.getElementById('tf-opt-name').checked;
        const byContent = document.getElementById('tf-opt-content').checked;
        const byPath = document.getElementById('tf-opt-path').checked;
        const status = document.getElementById('tf-search-status');
        const results = document.getElementById('tf-search-results-container');
        
        if (!kw) { showStatus('Enter a keyword', 'warning'); return; }
        if (!byName && !byContent && !byPath) { showStatus('Select search mode', 'warning'); return; }
        
        const key = `${kw}_${byName}_${byContent}_${byPath}`;
        status.style.display = 'block';
        status.textContent = '🔍 Scanning...';
        status.style.color = 'var(--orange)';
        results.innerHTML = '<div class="tf-loading"><div class="tf-spinner"></div>Searching...</div>';
        
        setTimeout(async () => {
            try {
                if (searchCache[key]) {
                    status.textContent = `💾 Loaded ${searchCache[key].length} (cache)`;
                    status.style.color = 'var(--green)';
                    renderResults(searchCache[key]);
                    return;
                }
                
                let found = [];
                const chipsetPaths = await getChipsetProcPaths();
                const allPaths = [...new Set([...CFG.safePaths, ...chipsetPaths])];
                const excludePids = "-path '/proc/[0-9]*' -prune -o";
                
                if (byPath) {
                    // 1. FIRST: Check if keyword is an exact full path
                    if (kw.startsWith('/')) {
                        const exists = await execFn(`${CFG.BB} test -e "${kw}" 2>/dev/null && echo "yes" || echo "no"`);
                        if (exists.trim() === 'yes') {
                            const isDir = await execFn(`${CFG.BB} test -d "${kw}" 2>/dev/null && echo "dir" || echo "file"`);
                            if (isDir.trim() === 'dir') {
                                const filesOut = await execFn(`${CFG.BB} find "${kw}" -maxdepth 1 -type f 2>/dev/null | ${CFG.BB} head -n ${CFG.maxResults}`);
                                found = filesOut.split('\n').filter(l => l.trim());
                            } else {
                                found = [kw];
                            }
                        }
                    }
                    
                    // 2. SECOND: Check known locations (fast)                    
                    if (found.length === 0) {
                        const knownPaths = [`/sys/${kw}`, `/dev/${kw}`];
                        for (const expPath of knownPaths) {
                            try {
                                const exists = await execFn(`${CFG.BB} test -d "${expPath}" 2>/dev/null && echo "yes" || echo "no"`);
                                if (exists.trim() === 'yes') {
                                    const filesOut = await execFn(`${CFG.BB} ls -1 "${expPath}" 2>/dev/null | ${CFG.BB} head -n 100`);
                                    const files = filesOut.split('\n').filter(l => l.trim());
                                    for (const f of files) {
                                        const fullPath = `${expPath}/${f}`;
                                        const isFile = await execFn(`${CFG.BB} test -f "${fullPath}" 2>/dev/null && echo "yes" || echo "no"`);
                                        if (isFile.trim() === 'yes') found.push(fullPath);
                                    }
                                }
                            } catch (e) { /* skip errors */ }
                        }
                        
                        // Check /proc for non-numeric directories containing keyword
                        try {
                            const procDirsCmd = `${CFG.BB} ls -1 /proc 2>/dev/null | ${CFG.BB} grep "^[a-z]"`;
                            const procDirsOut = await execFn(procDirsCmd);
                            const procTopDirs = procDirsOut.split('\n').filter(l => l.trim());
                            
                            for (const dirName of procTopDirs) {
                                const fullPath = `/proc/${dirName}`;
                                if (dirName.toLowerCase().includes(kw.toLowerCase())) {
                                    const isDir = await execFn(`${CFG.BB} test -d "${fullPath}" 2>/dev/null && echo "yes" || echo "no"`);
                                    if (isDir.trim() === 'yes') {
                                        const filesOut = await execFn(`${CFG.BB} find "${fullPath}" -maxdepth 2 -type f 2>/dev/null | ${CFG.BB} head -n 100`);
                                        const files = filesOut.split('\n').filter(l => l.trim());
                                        found = [...found, ...files];
                                    }
                                }
                                try {
                                    const subCmd = `${CFG.BB} ls -1 "${fullPath}" 2>/dev/null | ${CFG.BB} grep -i "${kw}"`;
                                    const subOut = await execFn(subCmd);
                                    const subDirs = subOut.split('\n').filter(l => l.trim());
                                    for (const sub of subDirs) {
                                        const subPath = `${fullPath}/${sub}`;
                                        const isDir = await execFn(`${CFG.BB} test -d "${subPath}" 2>/dev/null && echo "yes" || echo "no"`);
                                        if (isDir.trim() === 'yes') {
                                            const filesOut = await execFn(`${CFG.BB} find "${subPath}" -maxdepth 1 -type f 2>/dev/null | ${CFG.BB} head -n 100`);
                                            const files = filesOut.split('\n').filter(l => l.trim());
                                            found = [...found, ...files];
                                        }
                                    }
                                } catch (e) { /* skip */ }
                            }
                        } catch (e) { /* skip */ }
                    }                    
                    // 3. THIRD: Limited wildcard search if still nothing found
                    if (found.length === 0) {
                        const limitedPaths = ['/sys', '/proc/sys', '/sys/devices', '/sys/class', '/sys/module'];
                        for (const basePath of limitedPaths) {
                            try {
                                const cmd = `${CFG.BB} find "${basePath}" -maxdepth 3 -type d -name "*${kw}*" 2>/dev/null | ${CFG.BB} head -n 10`;
                                const dirOut = await execFn(cmd);
                                const dirs = dirOut.split('\n').filter(l => l.trim());
                                for (const dir of dirs) {
                                    const filesOut = await execFn(`${CFG.BB} find "${dir}" -maxdepth 1 -type f 2>/dev/null | ${CFG.BB} head -n 50`);
                                    const dirFiles = filesOut.split('\n').filter(l => l.trim());
                                    found = [...found, ...dirFiles];
                                }
                            } catch (e) { /* skip */ }
                        }
                    }
                    found = [...new Set(found)].slice(0, CFG.maxResults);
                    
                } else if (byName && !byContent && !byPath) {
                    const out = await execFn(`${CFG.BB} find ${allPaths.join(' ')} ${excludePids} -type f -name "*${kw}*" 2>/dev/null | ${CFG.BB} head -n ${CFG.maxResults}`);
                    found = filterProcPids(out.split('\n').filter(l => l.trim()));
                } else if (byContent && !byName && !byPath) {
                    const out = await execFn(`${CFG.BB} grep -ril --binary-files=without-match "${kw}" ${allPaths.join(' ')} ${excludePids} 2>/dev/null | ${CFG.BB} head -n ${CFG.maxResults}`);
                    found = filterProcPids(out.split('\n').filter(l => l.trim()));
                } else {
                    const n = await execFn(`${CFG.BB} find ${allPaths.join(' ')} ${excludePids} -type f -name "*${kw}*" 2>/dev/null`);
                    const c = await execFn(`${CFG.BB} grep -ril --binary-files=without-match "${kw}" ${allPaths.join(' ')} ${excludePids} 2>/dev/null`);
                    found = [...new Set([...n.split('\n'), ...c.split('\n')].filter(l => l.trim()))].slice(0, CFG.maxResults);
                    found = filterProcPids(found);
                }
                
                if (!found.length) {
                    status.textContent = '❌ No files found';
                    status.style.color = 'var(--red)';
                    results.innerHTML = '<div class="tf-empty-state"><div class="icon">📭</div><p>No matching files</p></div>';
                    return;
                }
                
                searchCache[key] = found;
                await saveCache();
                document.getElementById('tf-cache-count').textContent = Object.keys(searchCache).length;
                status.textContent = `✅ Found ${found.length} files`;
                status.style.color = 'var(--green)';
                renderResults(found);
            } catch (e) {
                console.error(e);
                status.textContent = `⚠️ ${e.message}`;
                status.style.color = 'var(--red)';
                results.innerHTML = '<div style="padding:20px;text-align:center;color:var(--red)">Search failed</div>';            }
        }, 100);
    }

    // ========== BROWSE FUNCTIONS ==========
    async function browsePath(path) {
        if (!rootAvailable) { showStatus('⚠️ Root not available', 'error'); return; }
        const status = document.getElementById('tf-search-status');
        const results = document.getElementById('tf-browse-results-container');
        const browsePathEl = document.getElementById('tf-browse-current-path');
        
        status.style.display = 'block';
        status.textContent = `📂 ${path}`;
        status.style.color = 'var(--blue)';
        if (browsePathEl) browsePathEl.textContent = path;
        results.innerHTML = '<div class="tf-loading"><div class="tf-spinner"></div>Loading...</div>';
        
        try {
            const dirCmd = `${CFG.BB} ls -1 "${path}" 2>/dev/null`;
            const dirOut = await execFn(dirCmd);
            const items = dirOut.split('\n').filter(l => l.trim());
            
            let html = '';
            if (path !== '/') {
                const parentPath = path.substring(0, path.lastIndexOf('/')) || '/';
                html += `<div class="tf-list-item" style="background:rgba(10,132,255,0.15);border-color:var(--blue)">
                    <div class="tf-item-content" onclick="TweakFinder.browsePath('${parentPath}')">
                        <div class="tf-item-title">📁 .. (Parent)</div>
                        <div class="tf-item-desc">${parentPath}</div>
                    </div>
                </div>`;
            }
            
            const dirs = [], files = [];
            for (const item of items) {
                const fullPath = path === '/' ? `/${item}` : `${path}/${item}`;
                const isDir = await execFn(`${CFG.BB} test -d "${fullPath}" && echo "yes" || echo "no"`);
                if (isDir.trim() === 'yes') dirs.push({ name: item, path: fullPath });
                else files.push({ name: item, path: fullPath });
            }
            
            for (const dir of dirs.sort((a, b) => a.name.localeCompare(b.name))) {
                const writable = CFG.safePaths.some(s => dir.path.startsWith(s));
                const hasCtrl = controls.find(c => c.path === dir.path);
                html += `<div class="tf-list-item">
                    <div class="tf-item-content" onclick="TweakFinder.browsePath('${dir.path}')">
                        <div class="tf-item-title">📁 ${escapeHtml(dir.name)}</div>
                        <div class="tf-item-desc">${escapeHtml(dir.path)}</div>
                        ${hasCtrl ? '<span class="tf-item-badge">✓ Control</span>' : ''}
                    </div>                    <div style="display:flex;gap:4px">
                        ${writable ? `<button class="tf-btn-sm add" onclick="event.stopPropagation(); TweakFinder.browseAddControl('${dir.path}', 'dir')">➕</button>` : ''}
                    </div>
                </div>`;
            }
            
            for (const file of files.sort((a, b) => a.name.localeCompare(b.name))) {
                const writable = CFG.safePaths.some(s => file.path.startsWith(s));
                const hasCtrl = controls.find(c => c.path === file.path);
                html += `<div class="tf-list-item">
                    <div class="tf-item-content" onclick="TweakFinder.previewFile('${file.path}')">
                        <div class="tf-item-title">📄 ${escapeHtml(file.name)}</div>
                        <div class="tf-item-desc">${escapeHtml(file.path)}</div>
                        ${hasCtrl ? '<span class="tf-item-badge">✓ Control</span>' : ''}
                    </div>
                    <div style="display:flex;gap:4px">
                        ${writable && !hasCtrl ? `<button class="tf-btn-sm add" onclick="event.stopPropagation(); TweakFinder.analyzeFile('${file.path}')">➕</button>` : ''}
                        ${hasCtrl ? `<button class="tf-btn-sm edit" onclick="event.stopPropagation(); TweakFinder.editControlByPath('${file.path}')">⚙️</button>` : ''}
                        <button class="tf-btn-sm" onclick="event.stopPropagation(); TweakFinder.previewFile('${file.path}')">✏️</button>
                    </div>
                </div>`;
            }
            
            if (!items.length) html = '<div class="tf-empty-state"><div class="icon">📭</div><p>Empty directory</p></div>';
            results.innerHTML = html;
            currentBrowsePath = path;
        } catch (e) {
            console.error(e);
            status.textContent = `⚠️ ${e.message}`;
            status.style.color = 'var(--red)';
            results.innerHTML = '<div style="padding:20px;text-align:center;color:var(--red)">Failed to load directory</div>';
        }
    }

    async function browseAddControl(path, type) {
        if (type === 'dir') {
            const name = prompt('Enter control name for directory:', path.split('/').pop());
            if (name) {
                analyzing = { path, type: 'text', options: { label: name, path }, content: path };
                showCreator();
            }
        }
    }

    function renderResults(paths) {
        const container = document.getElementById('tf-search-results-container');
        if (!container) return;
        if (!paths.length) {
            container.innerHTML = '<div class="tf-empty-state"><div class="icon">📭</div><p>No results</p></div>';
            return;        }
        let html = '';
        paths.forEach(p => {
            const name = p.split('/').pop();
            const writable = CFG.safePaths.some(s => p.startsWith(s));
            const hasCtrl = controls.find(c => c.path === p);
            html += `<div class="tf-list-item">
                <div class="tf-item-content" onclick="TweakFinder.previewFile('${p}')">
                    <div class="tf-item-title">${escapeHtml(name)}</div>
                    <div class="tf-item-desc">${escapeHtml(p)}</div>
                    ${hasCtrl ? '<span class="tf-item-badge">✓ Control</span>' : ''}
                </div>
                <div style="display:flex;gap:4px">
                    ${writable && !hasCtrl ? `<button class="tf-btn-sm add" onclick="TweakFinder.analyzeFile('${p}')">➕</button>` : ''}
                    ${hasCtrl ? `<button class="tf-btn-sm edit" onclick="TweakFinder.editControlByPath('${p}')">⚙️</button>` : ''}
                    <button class="tf-btn-sm" onclick="TweakFinder.previewFile('${p}')">✏️</button>
                </div>
            </div>`;
        });
        container.innerHTML = html;
    }

    async function saveCache() {
        try {
            const json = JSON.stringify(searchCache).replace(/"/g, '\\"');
            await execFn(`${CFG.BB} echo "${json}" > "${CFG.CACHE_FILE}"`);
        } catch (e) { console.warn('Cache save failed', e); }
    }

    function clearCache() {
        if (!confirm('Clear search cache?')) return;
        searchCache = {};
        execFn(`${CFG.BB} rm -f "${CFG.CACHE_FILE}"`);
        document.getElementById('tf-cache-count').textContent = '0';
        showStatus('Cache cleared', 'info', 2000);
    }

    async function previewFile(path) {
        try {
            const content = await execFn(`${CFG.BB} head -c 20000 "${path}" 2>/dev/null`);
            const clean = content.replace(/\0/g, '').trim();
            const name = path.split('/').pop();
            const modal = document.createElement('div');
            modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.95);display:flex;align-items:center;justify-content:center;z-index:10010;padding:0;';
            modal.innerHTML = `<div style="background:#1c1c1e;border-radius:16px;padding:16px;width:95vw;max-width:600px;height:90vh;border:1px solid #3a3a3c;display:flex;flex-direction:column">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-shrink:0">
                    <strong style="font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:70%">📄 ${escapeHtml(name)}</strong>
                    <button onclick="this.closest('.tf-modal').remove()" style="background:none;border:none;color:#fff;font-size:28px;cursor:pointer;line-height:1;padding:0;width:32px;height:32px">&times;</button>
                </div>
                <pre style="background:#000;padding:12px;border-radius:8px;font-size:9px;color:#0f0;flex:1;overflow-y:auto;overflow-x:auto;white-space:pre;min-height:0;line-height:1.3">${escapeHtml(clean)}</pre>                <div style="margin-top:12px;text-align:center;flex-shrink:0;display:flex;gap:8px;justify-content:center">
                    <button onclick="TweakFinder.copyContent('${escapeHtml(clean).replace(/'/g, "\\'")}')" style="padding:10px 16px;background:#0A84FF;color:white;border:none;border-radius:10px;font-weight:600">📋 Copy</button>
                    <button onclick="this.closest('.tf-modal').remove()" style="padding:10px 24px;background:#2c2c2e;color:white;border:none;border-radius:10px;font-weight:600">Close</button>
                </div>
            </div>`;
            modal.className = 'tf-modal';
            document.body.appendChild(modal);
        } catch (e) { alert(`Cannot read: ${e.message}`); }
    }

    function copyContent(text) {
        navigator.clipboard.writeText(text).then(() => showStatus('📋 Copied', 'success', 2000)).catch(() => showStatus('❌ Copy failed', 'error', 2000));
    }
    function extractNumberFromText(text) {
        const patterns = [/index[:\s]+(\d+)/i, /value[:\s]+(\d+)/i, /freq[:\s]+(\d+)/i, /:\s*(\d+)/, /(\d+)/];
        for (const p of patterns) {
            const m = text.match(p);
            if (m) return parseFloat(m[1]);
        }
        return null;
    }

    async function getAvailableGovernors(governorPath) {
        if (governorPath) {
            const dir = governorPath.substring(0, governorPath.lastIndexOf('/'));
            try {
                const avPath = `${dir}/available_governors`;
                const content = await execFn(`${CFG.BB} cat "${avPath}" 2>/dev/null`);
                if (content.trim()) return content.trim().split(/\s+/).filter(g => g);
            } catch (e) {}
        }
        try {
            const path = '/sys/devices/system/cpu/cpu0/cpufreq/scaling_available_governors';
            const content = await execFn(`${CFG.BB} cat "${path}" 2>/dev/null`);
            return content.trim().split(/\s+/).filter(g => g);
        } catch (e) { return ['performance', 'powersave', 'schedutil', 'ondemand', 'conservative']; }
    }

    async function getCurrentGovernor(governorPath) {
        try {
            const path = governorPath || '/sys/devices/system/cpu/cpu0/cpufreq/scaling_governor';
            const content = await execFn(`${CFG.BB} cat "${path}" 2>/dev/null`);
            return content.trim();
        } catch (e) { return 'schedutil'; }
    }

    async function scanPathForOptions(path) {
        try {
            const dir = path.substring(0, path.lastIndexOf('/'));
            const files = await execFn(`${CFG.BB} ls "${dir}" 2>/dev/null`);            const fileList = files.split('\n').filter(f => f.trim());
            const options = { min: null, max: null, values: [] };
            for (const file of fileList) {
                const fullPath = `${dir}/${file}`;
                const lower = file.toLowerCase();
                if (lower.includes('min')) {
                    const val = await execFn(`${CFG.BB} cat "${fullPath}" 2>/dev/null`);
                    const num = parseFloat(val.trim());
                    if (!isNaN(num)) options.min = num;
                }
                if (lower.includes('max')) {
                    const val = await execFn(`${CFG.BB} cat "${fullPath}" 2>/dev/null`);
                    const num = parseFloat(val.trim());
                    if (!isNaN(num)) options.max = num;
                }
                if (lower.includes('mode') || lower.includes('enable') || lower.includes('state')) {
                    const val = await execFn(`${CFG.BB} cat "${fullPath}" 2>/dev/null`);
                    const trimmed = val.trim().toLowerCase();
                    if (['0', '1', 'enabled', 'disabled', 'true', 'false'].includes(trimmed)) options.values.push(trimmed);
                }
            }
            return options;
        } catch (e) { return { min: null, max: null, values: [] }; }
    }

    function parsePPMStatus(content) {
        const policies = [];
        const lines = content.split('\n');
        const pattern = /\[(\d+)\]\s+(\w+):\s+(enabled|disabled)/i;
        for (const line of lines) {
            const match = line.match(pattern);
            if (match) {
                policies.push({ index: parseInt(match[1]), name: match[2], enabled: match[3].toLowerCase() === 'enabled' });
            }
        }
        return policies;
    }

    async function analyzeFile(path) {
        const status = document.getElementById('tf-search-status');
        status.textContent = `🔍 Analyzing ${path.split('/').pop()}...`;
        status.style.color = 'var(--orange)';
        try {
            const wr = await execFn(`test -w "${path}" && echo "yes" || echo "no"`);
            if (wr.trim() !== 'yes') throw new Error('Not writable');
            const content = await execFn(`${CFG.BB} head -c ${CFG.maxAnalyze} "${path}" 2>/dev/null`);
            const val = content.trim();
            if (!val) throw new Error('Empty file');
            
            if (path.includes('policy_status') || path.includes('ppm')) {                const policies = parsePPMStatus(content);
                if (policies.length > 0) {
                    analyzing = { path, type: 'ppm_policy', options: { policies }, content: val };
                    showCreator();
                    status.textContent = '✅ PPM Policy control ready';
                    status.style.color = 'var(--green)';
                    return;
                }
            }
            
            let type = 'text', opts = {};
            const fileName = path.split('/').pop();
            if ((fileName === 'governor' || fileName === 'scaling_governor') && !path.includes('available')) {
                type = 'governor';
                const governors = await getAvailableGovernors(path);
                const current = await getCurrentGovernor(path);
                opts = { governors, current, path };
            } else if (/^(0|1|false|true|disabled|enabled)$/i.test(val)) {
                type = 'toggle';
                opts = val.toLowerCase() === '0' || val.toLowerCase() === 'false' || val.toLowerCase() === 'disabled'
                    ? { off: val, on: val === '0' ? '1' : val === 'false' ? 'true' : 'enabled' }
                    : { on: val, off: val === '1' ? '0' : val === 'true' ? 'false' : 'disabled' };
            } else {
                const extractedNum = extractNumberFromText(val);
                if (extractedNum !== null) {
                    type = 'slider';
                    const num = extractedNum;
                    const scanned = await scanPathForOptions(path);
                    if (path.includes('opp_index') || path.includes('oppidx')) {
                        opts = { min: 0, max: 32, step: 1, unit: '', current: num, availableValues: scanned.values.length > 0 ? scanned.values : null };
                    } else {
                        opts = { min: scanned.min || detectMin(path, num), max: scanned.max || detectMax(path, num), step: detectStep(path), unit: detectUnit(path), current: num, availableValues: scanned.values.length > 0 ? scanned.values : null };
                    }
                }
            }
            analyzing = { path, type, options: opts, content: val };
            showCreator();
            status.textContent = '✅ Ready to create control';
            status.style.color = 'var(--green)';
        } catch (e) {
            console.error(e);
            status.textContent = `❌ ${e.message}`;
            status.style.color = 'var(--red)';
            alert(`Cannot analyze: ${e.message}`);
        }
    }

    function detectMin(p, cur) { const l = p.toLowerCase(); if (l.includes('min') || l.includes('low')) return Math.min(0, cur); if (l.includes('temp') || l.includes('thermal')) return 0; if (l.includes('freq') || l.includes('mhz')) return 300; if (l.includes('volt') || l.includes('mv')) return 0; return Math.max(0, Math.floor(cur * 0.1)); }
    function detectMax(p, cur) { const l = p.toLowerCase(); if (l.includes('max') || l.includes('high')) return Math.max(100, cur * 2); if (l.includes('temp') || l.includes('thermal')) return 100; if (l.includes('freq') || l.includes('mhz')) return 3000; if (l.includes('volt') || l.includes('mv')) return 1500; if (l.includes('percent') || l.includes('ratio')) return 100; return Math.ceil(cur * 3); }
    function detectStep(p) { const l = p.toLowerCase(); if (l.includes('freq')) return 50; if (l.includes('volt') || l.includes('mv')) return 25; if (l.includes('percent')) return 5; return 1; }    function detectUnit(p) { const l = p.toLowerCase(); if (l.includes('freq') || l.includes('mhz')) return 'MHz'; if (l.includes('volt') || l.includes('mv')) return 'mV'; if (l.includes('temp')) return '°C'; if (l.includes('percent') || l.includes('ratio')) return '%'; if (l.includes('time') || l.includes('ms')) return 'ms'; return ''; }

    // ========== CONTROL CREATOR ==========
    function showCreator() {
        if (!analyzing) return;
        const { path, type, options } = analyzing;
        const cpuMatch = path.match(/cpu(\d+)|policy(\d+)/i);
        const cpuIdx = cpuMatch ? (cpuMatch[1] || cpuMatch[2]) : 'x';
        const safeId = `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}_${cpuIdx}`;
        const modal = document.createElement('div');
        modal.className = 'tf-modal-overlay';
        modal.innerHTML = `            <div class="tf-modal-card">
                <div class="tf-modal-title">${editingId ? '✏️ Edit Control' : '➕ Create Control'}</div>
                <div style="font-size:11px;color:var(--text-dim);margin-bottom:14px;word-break:break-all">
                    <strong>File:</strong> ${path.split('/').pop()}<br>
                    <strong>Path:</strong> ${path}
                </div>
                <div class="tf-modal-field">
                    <label>Control Type</label>
                    <select id="tf-cc-type">
                        <option value="toggle" ${type === 'toggle' ? 'selected' : ''}>🔘 Toggle</option>
                        <option value="slider" ${type === 'slider' ? 'selected' : ''}>📊 Slider</option>
                        <option value="governor" ${type === 'governor' ? 'selected' : ''}>🎛️ Governor</option>
                        <option value="ppm_policy" ${type === 'ppm_policy' ? 'selected' : ''}>🔧 PPM Policies</option>
                        <option value="permission" ${type === 'permission' ? 'selected' : ''}>🔒 File Permissions</option>
                        <option value="text">📝 Text</option>
                    </select>
                </div>
                ${analyzing.content && !/^\d+$/.test(analyzing.content.trim()) ? `<div style="font-size:10px;color:var(--orange);margin-top:4px">ℹ️ Extracted: "${analyzing.content.trim().slice(0, 50)}${analyzing.content.length > 50 ? '...' : ''}"</div>` : ''}
                <div id="tf-cc-toggle-opt" style="display:${type === 'toggle' ? 'block' : 'none'}" class="tf-modal-field">
                    <label>OFF / ON values</label>
                    <div class="tf-modal-row">
                        <input id="tf-cc-off" value="${options.off || '0'}" placeholder="OFF">
                        <input id="tf-cc-on" value="${options.on || '1'}" placeholder="ON">
                    </div>
                    ${options.availableValues ? `<div style="margin-top:8px;font-size:10px;color:var(--text-dim)">Available: ${options.availableValues.join(', ')}</div>` : ''}
                </div>
                <div id="tf-cc-slider-opt" style="display:${type === 'slider' ? 'block' : 'none'}" class="tf-modal-field">
                    <label>Range & Step</label>
                    <div class="tf-modal-row">
                        <input id="tf-cc-min" type="number" value="${options.min || 0}" placeholder="Min">
                        <input id="tf-cc-max" type="number" value="${options.max || 100}" placeholder="Max">
                        <input id="tf-cc-step" type="number" value="${options.step || 1}" placeholder="Step">
                        <input id="tf-cc-unit" value="${options.unit || ''}" placeholder="Unit">
                    </div>
                </div>
                <div id="tf-cc-governor-opt" style="display:${type === 'governor' ? 'block' : 'none'}" class="tf-modal-field">
                    <label>Available Governors</label>
                    <select id="tf-cc-governor-select" class="tf-gov-select">
                        ${options.governors?.map(g => `<option value="${g}" ${g === options.current ? 'selected' : ''}>${g}</option>`).join('') || ''}                    </select>
                    <div style="font-size:10px;color:var(--text-dim);margin-top:4px">
                        Current: <strong style="color:var(--green)">${options.current || 'unknown'}</strong>
                    </div>
                </div>
                <div id="tf-cc-ppm-opt" style="display:${type === 'ppm_policy' ? 'block' : 'none'}" class="tf-modal-field">
                    <label>PPM Policies to Control</label>
                    <div style="max-height:200px;overflow-y:auto;margin-top:8px">
                        ${options.policies?.map(p => `
                            <label style="display:flex;align-items:center;gap:8px;padding:6px;background:rgba(255,255,255,0.03);margin-bottom:4px;border-radius:6px;font-size:11px">
                                <input type="checkbox" class="tf-ppm-policy-check" value="${p.index}" ${p.enabled ? 'checked' : ''}>
                                <span style="color:${p.enabled ? 'var(--green)' : 'var(--text-dim)'}">[${p.index}] ${p.name}</span>
                                <span style="margin-left:auto;font-size:10px">${p.enabled ? 'ON' : 'OFF'}</span>
                            </label>
                        `).join('') || '<div style="color:var(--text-dim);font-size:11px">No policies detected</div>'}
                    </div>
                    <div style="font-size:10px;color:var(--text-dim);margin-top:6px">ℹ️ Each policy will get its own toggle switch</div>
                </div>
                <div id="tf-cc-permission-opt" style="display:${type === 'permission' ? 'block' : 'none'}" class="tf-modal-field">
                    <label>Permission Mode (Octal)</label>
                    <select id="tf-cc-permission-mode" class="tf-gov-select">
                        <option value="644" ${options.permission === '644' ? 'selected' : ''}>644 - rw-r--r-- (Normal file)</option>
                        <option value="755" ${options.permission === '755' ? 'selected' : ''}>755 - rwxr-xr-x (Executable)</option>
                        <option value="600" ${options.permission === '600' ? 'selected' : ''}>600 - rw------- (Root only)</option>
                        <option value="640" ${options.permission === '640' ? 'selected' : ''}>640 - rw-r----- (Root + group)</option>
                        <option value="660" ${options.permission === '660' ? 'selected' : ''}>660 - rw-rw---- (Root + group write)</option>
                        <option value="664" ${options.permission === '664' ? 'selected' : ''}>664 - rw-rw-r-- (Group writable)</option>
                        <option value="777" ${options.permission === '777' ? 'selected' : ''}>777 - rwxrwxrwx (Full access ⚠️)</option>
                        <option value="000" ${options.permission === '000' ? 'selected' : ''}>000 - --------- (No access/Locked)</option>
                        <option value="custom" ${options.permission === 'custom' ? 'selected' : ''}>Custom...</option>
                    </select>
                    <input id="tf-cc-permission-custom" type="text" placeholder="Enter custom permission (e.g., 750)" 
                           style="display:${options.permission === 'custom' ? 'block' : 'none'};margin-top:8px;width:100%;padding:10px;background:#2c2c2e;color:white;border:1px solid var(--border);border-radius:8px;font-size:13px;font-family:monospace">
                    <div style="font-size:10px;color:var(--text-dim);margin-top:6px">ℹ️ Supports * wildcard for multiple files</div>
                </div>
                <div class="tf-modal-field">
                    <label>Display Label</label>
                    <input id="tf-cc-label" value="${options.label || path.split('/').pop().replace(/[_-]/g, ' ')}">
                </div>
                <div class="tf-modal-field">
                    <label>File Path <span style="color:var(--orange);font-size:10px">(editable)</span></label>
                    <input id="tf-cc-path" value="${options.path || path}" style="font-family:monospace;font-size:11px">
                    <div style="font-size:9px;color:var(--text-dim);margin-top:2px">💡 supports wildcard path "*"</div>
                </div>
                <label class="tf-modal-check">
                    <input type="checkbox" id="tf-cc-persist" ${options.persist ? 'checked' : ''}>
                    <span>Save to SD card (persists after reboot)</span>
                </label>
                <div class="tf-modal-actions">
                    ${editingId ? `<button class="delete" onclick="TweakFinder.deleteControl('${options.id}')">🗑️ Delete</button>` : ''}                    <button class="cancel" onclick="TweakFinder.closeCreator()">Cancel</button>
                    <button class="create" onclick="${editingId ? `TweakFinder.updateControl('${options.id}')` : `TweakFinder.createControl('${safeId}')`}">${editingId ? 'Save Changes' : 'Create'}</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        document.getElementById('tf-cc-type').onchange = function () {
            document.getElementById('tf-cc-toggle-opt').style.display = this.value === 'toggle' ? 'block' : 'none';
            document.getElementById('tf-cc-slider-opt').style.display = this.value === 'slider' ? 'block' : 'none';
            document.getElementById('tf-cc-governor-opt').style.display = this.value === 'governor' ? 'block' : 'none';
            document.getElementById('tf-cc-ppm-opt').style.display = this.value === 'ppm_policy' ? 'block' : 'none';
            document.getElementById('tf-cc-permission-opt').style.display = this.value === 'permission' ? 'block' : 'none';
        };
        const permModeSelect = document.getElementById('tf-cc-permission-mode');
        const permCustomInput = document.getElementById('tf-cc-permission-custom');
        if (permModeSelect && permCustomInput) {
            permModeSelect.onchange = function () {
                permCustomInput.style.display = this.value === 'custom' ? 'block' : 'none';
            };
        }
    }

    function closeCreator() {
        const m = document.querySelector('.tf-modal-overlay');
        if (m) m.remove();
        analyzing = null;
        editingId = null;
    }

    // ========== CONTROL MANAGEMENT ==========
    async function createControl(id) {
        if (!rootAvailable) { showStatus('⚠️ Root required', 'error'); return; }
        const type = document.getElementById('tf-cc-type').value;
        const label = document.getElementById('tf-cc-label').value.trim() || 'Control';
        const persist = document.getElementById('tf-cc-persist').checked;
        const cfg = { id, path: document.getElementById('tf-cc-path').value.trim() || analyzing.path, type, label, persist, created: Date.now() };

        if (type === 'toggle') {
            cfg.off = document.getElementById('tf-cc-off').value;
            cfg.on = document.getElementById('tf-cc-on').value;
            cfg.current = cfg.off;
        } else if (type === 'slider') {
            cfg.min = parseInt(document.getElementById('tf-cc-min').value) || 0;
            cfg.max = parseInt(document.getElementById('tf-cc-max').value) || 100;
            cfg.step = parseInt(document.getElementById('tf-cc-step').value) || 1;
            cfg.unit = document.getElementById('tf-cc-unit').value || '';
            cfg.current = parseFloat(analyzing.options.current) || cfg.min;
        } else if (type === 'governor') {
            cfg.governors = analyzing.options.governors;
            cfg.current = document.getElementById('tf-cc-governor-select').value;        } else if (type === 'ppm_policy') {
            const checks = document.querySelectorAll('.tf-ppm-policy-check');
            cfg.policies = [];
            checks.forEach(chk => {
                if (chk.checked) {
                    const idx = parseInt(chk.value);
                    const policy = analyzing.options.policies.find(p => p.index === idx);
                    if (policy) { cfg.policies.push({ index: idx, name: policy.name, enabled: true }); }
                }
            });
            cfg.current = cfg.policies.length > 0 ? 'mixed' : 'none';
        } else if (type === 'permission') {
            const modeSelect = document.getElementById('tf-cc-permission-mode');
            const customInput = document.getElementById('tf-cc-permission-custom');
            cfg.permission = modeSelect.value === 'custom' ? customInput.value.trim() : modeSelect.value;
            cfg.current = cfg.permission;
            if (!/^[0-7]{3,4}$/.test(cfg.permission)) { showStatus('⚠️ Invalid permission format. Use octal (e.g., 644, 755)', 'warning', 3000); }
        } else {
            cfg.current = analyzing.content.trim();
        }
        try {
            controls.push(cfg);
            await saveRegistry();
            if (persist) await saveValue(id, cfg.current);
            renderControl(cfg);
            closeCreator();
            showStatus(`✅ Created: ${label}`, 'success');
            const lastKey = Object.keys(searchCache).pop();
            if (lastKey && searchCache[lastKey]) renderResults(searchCache[lastKey]);
        } catch (e) {
            console.error(e);
            showStatus(`❌ Failed: ${e.message}`, 'error', 4000);
        }
    }

    async function updateControl(id) {
        if (!rootAvailable) { showStatus('⚠️ Root required', 'error'); return; }
        const idx = controls.findIndex(c => c.id === id);
        if (idx < 0) return;
        const cfg = controls[idx];
        const newType = document.getElementById('tf-cc-type').value;
        const label = document.getElementById('tf-cc-label').value.trim() || 'Control';
        const persist = document.getElementById('tf-cc-persist').checked;
        const newPath = document.getElementById('tf-cc-path')?.value.trim();

        if (newPath && newPath !== cfg.path) {
            if (!newPath.includes('*')) {
                const wr = await execFn(`test -w "${newPath}" && echo "yes" || echo "no"`);
                if (wr.trim() !== 'yes') { showStatus(`❌ Path not writable: ${newPath}`, 'error', 4000); return; }
            }            const duplicate = controls.find(c => c.path === newPath && c.id !== cfg.id);
            if (duplicate) { showStatus(`⚠️ Path already used by "${duplicate.label}"`, 'warning', 4000); if (!confirm('Continue anyway?')) return; }
            cfg.path = newPath;
        }
        cfg.label = label; cfg.persist = persist;

        if (newType === 'toggle') {
            cfg.type = 'toggle'; cfg.off = document.getElementById('tf-cc-off').value; cfg.on = document.getElementById('tf-cc-on').value;
            if (![cfg.off, cfg.on].includes(cfg.current)) cfg.current = cfg.off;
            delete cfg.min; delete cfg.max; delete cfg.step; delete cfg.unit; delete cfg.governors; delete cfg.policies; delete cfg.permission;
        } else if (newType === 'slider') {
            cfg.type = 'slider';
            cfg.min = parseInt(document.getElementById('tf-cc-min').value) || 0; cfg.max = parseInt(document.getElementById('tf-cc-max').value) || 100;
            cfg.step = parseInt(document.getElementById('tf-cc-step').value) || 1; cfg.unit = document.getElementById('tf-cc-unit').value || '';
            const num = parseFloat(cfg.current) || cfg.min; cfg.current = Math.max(cfg.min, Math.min(cfg.max, num));
            delete cfg.off; delete cfg.on; delete cfg.governors; delete cfg.policies; delete cfg.permission;
        } else if (newType === 'governor') {
            cfg.type = 'governor'; cfg.governors = await getAvailableGovernors(cfg.path); cfg.current = document.getElementById('tf-cc-governor-select').value;
            delete cfg.off; delete cfg.on; delete cfg.min; delete cfg.max; delete cfg.step; delete cfg.unit; delete cfg.policies; delete cfg.permission;
        } else if (newType === 'ppm_policy') {
            cfg.type = 'ppm_policy';
            const checks = document.querySelectorAll('.tf-ppm-policy-check'); cfg.policies = [];
            checks.forEach(chk => {
                if (chk.checked) {
                    const idx = parseInt(chk.value);
                    const policy = analyzing.options.policies.find(p => p.index === idx);
                    if (policy) { cfg.policies.push({ index: idx, name: policy.name, enabled: true }); }
                }
            });
            delete cfg.off; delete cfg.on; delete cfg.min; delete cfg.max; delete cfg.step; delete cfg.unit; delete cfg.governors; delete cfg.permission;
        } else if (newType === 'permission') {
            cfg.type = 'permission';
            const modeSelect = document.getElementById('tf-cc-permission-mode');
            const customInput = document.getElementById('tf-cc-permission-custom');
            cfg.permission = modeSelect.value === 'custom' ? customInput.value.trim() : modeSelect.value;
            cfg.current = cfg.permission;
            delete cfg.off; delete cfg.on; delete cfg.min; delete cfg.max; delete cfg.step; delete cfg.unit; delete cfg.governors; delete cfg.policies;
        } else {
            cfg.type = 'text';
            delete cfg.off; delete cfg.on; delete cfg.min; delete cfg.max; delete cfg.step; delete cfg.unit; delete cfg.governors; delete cfg.policies; delete cfg.permission;
        }
        try {
            controls[idx] = cfg;
            await saveRegistry();
            const el = document.getElementById(`tf-ctrl-${id}`); if (el) el.remove();
            renderControl(cfg);
            const lastKey = Object.keys(searchCache).pop(); if (lastKey && searchCache[lastKey]) renderResults(searchCache[lastKey]);
            closeCreator(); showStatus(`✅ Updated: ${label}`, 'success');
        } catch (e) { console.error(e); showStatus(`❌ Failed: ${e.message}`, 'error', 4000); }
    }
    async function deleteControl(id) {
        if (!rootAvailable) { showStatus('⚠️ Root required', 'error'); return; }
        if (!confirm('Delete this control?')) return;
        const idx = controls.findIndex(c => c.id === id); if (idx < 0) return;
        try {
            controls.splice(idx, 1); await saveRegistry();
            const el = document.getElementById(`tf-ctrl-${id}`); if (el) el.remove();
            try { await execFn(`${CFG.BB} rm -f "${CFG.VALUES_DIR}/${id}.val" 2>/dev/null`); } catch (e) {}
            const lastKey = Object.keys(searchCache).pop(); if (lastKey && searchCache[lastKey]) renderResults(searchCache[lastKey]);
            closeCreator(); showStatus('🗑️ Control deleted', 'info', 2000);
        } catch (e) { console.error(e); showStatus(`❌ Failed: ${e.message}`, 'error', 4000); }
    }

    async function saveRegistry() {
        try {
            await execFn(`${CFG.BB} mkdir -p "${CFG.VALUES_DIR}" 2>/dev/null`);
            const json = JSON.stringify(controls).replace(/"/g, '\\"');
            await execFn(`${CFG.BB} echo "${json}" > "${CFG.REGISTRY_FILE}"`);
        } catch (e) { console.warn('Registry save failed', e); }
    }

    async function loadRegistry() {
        try {
            const raw = await execFn(`${CFG.BB} cat "${CFG.REGISTRY_FILE}" 2>/dev/null`);
            if (raw.trim()) controls = JSON.parse(raw.trim());
            controls.forEach(renderControl);
            setTimeout(() => { applyAllSavedValues(); }, 500);
        } catch (e) { controls = []; }
    }

    async function saveValue(id, val) {
        try { await execFn(`${CFG.BB} echo "${val}" > "${CFG.VALUES_DIR}/${id}.val"`); } catch (e) { console.warn('Value save failed', e); }
    }

    async function loadValue(id, def) {
        try { const raw = await execFn(`${CFG.BB} cat "${CFG.VALUES_DIR}/${id}.val" 2>/dev/null`), t = raw.trim(); if (t) return !isNaN(t) ? Number(t) : t; } catch (e) {} return def;
    }

    async function readCurrentValue(path) {
        try { const content = await execFn(`${CFG.BB} cat "${path}" 2>/dev/null`); return content.trim(); } catch (e) { return null; }
    }

    function renderControl(cfg) {
        const container = document.getElementById('tf-discovered-controls-container');
        if (!container) return;
        if (container.querySelector('.tf-empty-state')) container.innerHTML = '';
        const isToggle = cfg.type === 'toggle', isSlider = cfg.type === 'slider', isGov = cfg.type === 'governor', isPPM = cfg.type === 'ppm_policy', isPerm = cfg.type === 'permission';
        let html = `<div class="tf-control-card" id="tf-ctrl-${cfg.id}">
            <div class="tf-control-header">                <div><div class="tf-control-title">${escapeHtml(cfg.label)}</div><div class="tf-control-path">${escapeHtml(cfg.path.split('/').pop())}</div></div>
                <div class="tf-control-actions">
                    <button class="tf-btn-sm edit" onclick="TweakFinder.editControl('${cfg.id}')">⚙️</button>
                    <button class="tf-btn-sm remove" onclick="TweakFinder.removeControl('${cfg.id}')">✕</button>
                </div>
            </div>`;
        if (isToggle) {
            html += `<div style="display:flex;justify-content:space-between;align-items:center">
                <span id="tf-ts-${cfg.id}" style="font-size:11px;color:${cfg.current === cfg.on ? 'var(--green)' : 'var(--text-dim)'}">${cfg.current === cfg.on ? '✅ ON' : '❌ OFF'}</span>
                <label class="tf-ios-switch"><input type="checkbox" id="tf-ct-${cfg.id}" ${cfg.current === cfg.on ? 'checked' : ''} onchange="TweakFinder.applyToggle('${cfg.id}',this.checked)"><span class="tf-slider"></span></label>
            </div>`;
        } else if (isSlider) {
            html += `<div style="margin:6px 0">
                <div style="display:flex;justify-content:space-between;margin-bottom:4px">
                    <span id="tf-sv-${cfg.id}" style="font-family:monospace;color:var(--blue);font-weight:bold;font-size:12px">${cfg.current}${cfg.unit || ''}</span>
                    <span id="tf-pct-${cfg.id}" style="font-size:9px;color:var(--orange)"></span>
                    <span style="font-size:9px;color:var(--text-dim)">${cfg.min}${cfg.unit || ''}–${cfg.max}${cfg.unit || ''}</span>
                </div>
                <input type="range" id="tf-cs-${cfg.id}" min="${cfg.min}" max="${cfg.max}" step="${cfg.step}" value="${cfg.current}" oninput="TweakFinder.updateSlider('${cfg.id}',this.value)" onchange="TweakFinder.applySlider('${cfg.id}',this.value)" class="tf-slider-control">
                <div class="tf-slider-hints"><span>${cfg.min}</span><span>${cfg.max}</span></div>
            </div>`;
        } else if (isGov) {
            html += `<div style="margin-top:8px"><select id="tf-gov-select-${cfg.id}" class="tf-gov-select" onchange="TweakFinder.applyGovernor('${cfg.id}',this.value)">${cfg.governors?.map(g => `<option value="${g}" ${g === cfg.current ? 'selected' : ''}>${g}</option>`).join('') || ''}</select></div>`;
        } else if (isPPM) {
            html += `<div class="tf-ppm-grid" id="tf-ppm-grid-${cfg.id}">`;
            if (cfg.policies && cfg.policies.length > 0) {
                cfg.policies.forEach(pol => {
                    html += `<div class="tf-ppm-item"><div class="tf-ppm-info"><div class="tf-ppm-idx">[${pol.index}]</div><div class="tf-ppm-name">${escapeHtml(pol.name)}</div><div class="tf-ppm-status ${pol.enabled ? 'on' : 'off'}" id="tf-ppm-status-${cfg.id}-${pol.index}">${pol.enabled ? '✅ Enabled' : '❌ Disabled'}</div></div><label class="tf-ios-switch"><input type="checkbox" id="tf-ppm-toggle-${cfg.id}-${pol.index}" ${pol.enabled ? 'checked' : ''} onchange="TweakFinder.applyPPMPolicy('${cfg.id}',${pol.index},this.checked)"><span class="tf-slider"></span></label></div>`;
                });
            } else { html += `<div style="color:var(--text-dim);font-size:11px;text-align:center;padding:20px">No policies configured</div>`; }
            html += `</div>`;
        } else if (isPerm) {
            html += `<div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px">
                <div><div style="font-size:11px;color:var(--text-dim)">Current Permission</div><div id="tf-perm-val-${cfg.id}" style="font-family:monospace;font-size:14px;color:var(--blue);font-weight:bold">${cfg.current || '---'}</div></div>
                <select id="tf-perm-select-${cfg.id}" onchange="TweakFinder.applyPermission('${cfg.id}',this.value)" style="padding:8px 12px;background:#2c2c2e;color:white;border:1px solid var(--border);border-radius:8px;font-size:12px;font-family:monospace">
                    <option value="644" ${cfg.current === '644' ? 'selected' : ''}>644</option><option value="755" ${cfg.current === '755' ? 'selected' : ''}>755</option>
                    <option value="600" ${cfg.current === '600' ? 'selected' : ''}>600</option><option value="640" ${cfg.current === '640' ? 'selected' : ''}>640</option>
                    <option value="660" ${cfg.current === '660' ? 'selected' : ''}>660</option><option value="664" ${cfg.current === '664' ? 'selected' : ''}>664</option>
                    <option value="777" ${cfg.current === '777' ? 'selected' : ''}>777</option><option value="000" ${cfg.current === '000' ? 'selected' : ''}>000</option>
                    <option value="custom">Custom...</option>
                </select>
            </div>
            <input type="text" id="tf-perm-custom-${cfg.id}" placeholder="Enter custom permission" style="display:none;margin-top:8px;width:100%;padding:8px;background:#2c2c2e;color:white;border:1px solid var(--border);border-radius:8px;font-size:12px;font-family:monospace" onchange="TweakFinder.applyPermission('${cfg.id}',this.value)">
            <div style="font-size:9px;color:var(--text-dim);margin-top:6px">ℹ️ Supports * wildcard paths</div>`;
            setTimeout(() => {
                const sel = document.getElementById(`tf-perm-select-${cfg.id}`);
                const custom = document.getElementById(`tf-perm-custom-${cfg.id}`);
                if (sel && custom) {
                    sel.onchange = function () {
                        custom.style.display = this.value === 'custom' ? 'block' : 'none';                        if (this.value !== 'custom') TweakFinder.applyPermission(cfg.id, this.value);
                    };
                }
            }, 100);
        } else {
            html += `<input type="text" class="tf-text-control" id="tf-ctext-${cfg.id}" value="${escapeHtml(cfg.current)}" onchange="TweakFinder.applyText('${cfg.id}',this.value)">`;
        }
        html += `</div>`;
        container.insertAdjacentHTML('afterbegin', html);
        refreshControlState(cfg).catch(() => {
            if (cfg.persist) {
                loadValue(cfg.id, cfg.current).then(saved => {
                    if (saved !== cfg.current) {
                        cfg.current = saved;
                        if (isToggle) {
                            const el = document.getElementById(`tf-ct-${cfg.id}`), st = document.getElementById(`tf-ts-${cfg.id}`);
                            if (el) el.checked = (saved === cfg.on);
                            if (st) { st.textContent = (saved === cfg.on) ? '✅ ON' : '❌ OFF'; st.style.color = (saved === cfg.on) ? 'var(--green)' : 'var(--text-dim)'; }
                        } else if (isSlider) {
                            const sl = document.getElementById(`tf-cs-${cfg.id}`), dv = document.getElementById(`tf-sv-${cfg.id}`);
                            if (sl) sl.value = saved;
                            if (dv) dv.textContent = `${saved}${cfg.unit || ''}`;
                        } else if (isGov) {
                            const sel = document.getElementById(`tf-gov-select-${cfg.id}`);
                            if (sel) sel.value = saved;
                        } else if (isPerm) {
                            const pv = document.getElementById(`tf-perm-val-${cfg.id}`);
                            if (pv) pv.textContent = saved;
                        } else {
                            const tx = document.getElementById(`tf-ctext-${cfg.id}`);
                            if (tx) tx.value = saved;
                        }
                    }
                });
            }
        });
    }

    // ========== APPLY FUNCTIONS ==========
    async function applyToggle(id, on) {
        if (!rootAvailable) { showStatus('⚠️ Root required', 'error'); return; }
        const cfg = controls.find(c => c.id === id); if (!cfg) return;
        const val = on ? cfg.on : cfg.off;
        const st = document.getElementById(`tf-ts-${id}`);
        try {
            if (cfg.path.includes('*')) {
                const dir = cfg.path.substring(0, cfg.path.lastIndexOf('/'));
                const pattern = cfg.path.substring(cfg.path.lastIndexOf('/') + 1);
                const files = await execFn(`${CFG.BB} ls ${dir}/${pattern} 2>/dev/null`);
                const fileList = files.split('\n').filter(f => f.trim());                let successCount = 0;
                for (const file of fileList) {
                    if (await execFn(`test -w "${file}" && echo "yes" || echo "no"`) === 'yes') {
                        await execFn(`${CFG.BB} echo "${val}" > "${file}" 2>/dev/null`);
                        successCount++;
                    }
                }
                showStatus(`✅ Applied to ${successCount}/${fileList.length} paths`, 'success');
            } else {
                await execFn(`${CFG.BB} echo "${val}" > "${cfg.path}" 2>/dev/null`);
            }
            if (cfg.persist) await saveValue(id, val);
            cfg.current = val;
            if (st) { st.textContent = on ? '✅ ON' : '❌ OFF'; st.style.color = on ? 'var(--green)' : 'var(--text-dim)'; }
            showStatus(`✅ ${cfg.label}: ${on ? 'ON' : 'OFF'}`, 'success');
            setTimeout(async () => {
                try {
                    const actual = await readCurrentValue(cfg.path);
                    if (actual === null || actual === undefined) return;
                    const el = document.getElementById(`tf-ct-${id}`);
                    const actualOn = (actual === cfg.on);
                    cfg.current = actual;
                    if (el) el.checked = actualOn;
                    if (st) {
                        if (actualOn !== on) { st.textContent = `⚠️ ${actual}`; st.style.color = 'var(--orange)'; showStatus(`⚠️ ${cfg.label}: wrote ${val}, kernel has ${actual}`, 'warning', 5000); }
                        else { st.textContent = actualOn ? '✅ ON' : '❌ OFF'; st.style.color = actualOn ? 'var(--green)' : 'var(--text-dim)'; }
                    }
                } catch (e) { console.warn('[Toggle verify]', e); }
            }, 350);
        } catch (e) {
            console.error(e);
            const el = document.getElementById(`tf-ct-${id}`);
            if (el) el.checked = !on;
            showStatus(`❌ ${e.message}`, 'error', 4000);
        }
    }

    async function applyPPMPolicy(ctrlId, policyIdx, enabled) {
        if (!rootAvailable) { showStatus('⚠️ Root required', 'error'); return; }
        const cfg = controls.find(c => c.id === ctrlId); if (!cfg) return;
        const value = enabled ? '1' : '0';
        const statusEl = document.getElementById(`tf-ppm-status-${ctrlId}-${policyIdx}`);
        const policy = cfg.policies.find(p => p.index === policyIdx);
        try {
            await execFn(`${CFG.BB} echo "${policyIdx} ${value}" > "${cfg.path}" 2>/dev/null`);
            if (policy) policy.enabled = enabled;
            if (statusEl) { statusEl.textContent = enabled ? '✅ Enabled' : '❌ Disabled'; statusEl.className = `tf-ppm-status ${enabled ? 'on' : 'off'}`; }
            showStatus(`✅ ${policy ? policy.name : 'Policy'} ${enabled ? 'enabled' : 'disabled'}`, 'success');
            setTimeout(async () => {
                const content = await readCurrentValue(cfg.path);                const policies = parsePPMStatus(content);
                const current = policies.find(p => p.index === policyIdx);
                if (statusEl && current) {
                    statusEl.textContent = current.enabled ? '✅ Enabled' : '❌ Disabled';
                    statusEl.className = `tf-ppm-status ${current.enabled ? 'on' : 'off'}`;
                    if (policy) policy.enabled = current.enabled;
                }
            }, 300);
        } catch (e) {
            console.error(e);
            const toggle = document.getElementById(`tf-ppm-toggle-${ctrlId}-${policyIdx}`);
            if (toggle) toggle.checked = !enabled;
            showStatus(`❌ ${e.message}`, 'error', 4000);
        }
    }

    function updateSlider(id, val) {
        const cfg = controls.find(c => c.id === id); if (!cfg) return;
        const dv = document.getElementById(`tf-sv-${id}`);
        if (dv) { dv.textContent = `${val}${cfg.unit || ''}`; dv.style.color = 'var(--orange)'; setTimeout(() => dv.style.color = 'var(--blue)', 600); }
    }

    async function applySlider(id, val) {
        if (!rootAvailable) { showStatus('⚠️ Root required', 'error'); return; }
        const cfg = controls.find(c => c.id === id); if (!cfg) { showStatus('❌ Control not found', 'error', 4000); return; }
        const num = parseFloat(val) || val;
        const dv = document.getElementById(`tf-sv-${id}`);
        try {
            if (cfg.path.includes('*')) {
                const dir = cfg.path.substring(0, cfg.path.lastIndexOf('/'));
                const pattern = cfg.path.substring(cfg.path.lastIndexOf('/') + 1);
                const files = await execFn(`${CFG.BB} ls ${dir}/${pattern} 2>/dev/null`);
                const fileList = files.split('\n').filter(f => f.trim());
                for (const file of fileList) {
                    await execFn(`${CFG.BB} echo "${num}" > "${file}" 2>/dev/null`);
                }
                showStatus(`✅ Applied to ${fileList.length} paths`, 'success');
            } else {
                if (!cfg.path.includes('*')) {
                    const wr = await execFn(`test -w "${cfg.path}" && echo "yes" || echo "no"`);
                    if (wr.trim() !== 'yes') { showStatus(`❌ Path not writable: ${cfg.path}`, 'error', 4000); return; }
                }
                await execFn(`${CFG.BB} echo "${num}" > "${cfg.path}" 2>/dev/null`);
            }
            if (cfg.persist) await saveValue(id, num);
            cfg.current = num;
            showStatus(`✅ ${cfg.label}: ${num}${cfg.unit || ''}`, 'success');
            setTimeout(async () => {
                const actual = await readCurrentValue(cfg.path);
                if (dv) { dv.textContent = `${actual}${cfg.unit || ''}`; dv.style.color = actual == num ? 'var(--green)' : 'var(--orange)'; }                const pctEl = document.getElementById(`tf-pct-${id}`);
                if (pctEl) { const pct = await calculatePercentage(cfg); pctEl.textContent = pct ? `(${pct})` : ''; }
            }, 300);
        } catch (e) {
            console.error(e);
            showStatus(`❌ ${e.message}`, 'error', 4000);
        }
    }

    async function applyGovernor(id, value) {
        if (!rootAvailable) { showStatus('⚠️ Root required', 'error'); return; }
        const cfg = controls.find(c => c.id === id); if (!cfg) { showStatus('❌ Control not found', 'error', 4000); return; }
        const sel = document.getElementById(`tf-gov-select-${id}`);
        try {
            if (cfg.path.includes('*')) {
                const dir = cfg.path.substring(0, cfg.path.lastIndexOf('/'));
                const pattern = cfg.path.substring(cfg.path.lastIndexOf('/') + 1);
                const files = await execFn(`${CFG.BB} ls ${dir}/${pattern} 2>/dev/null`);
                const fileList = files.split('\n').filter(f => f.trim());
                for (const file of fileList) {
                    await execFn(`${CFG.BB} echo "${value}" > "${file}" 2>/dev/null`);
                }
                showStatus(`✅ Governor applied to ${fileList.length} paths`, 'success');
            } else {
                if (!cfg.path.includes('*')) {
                    const wr = await execFn(`test -w "${cfg.path}" && echo "yes" || echo "no"`);
                    if (wr.trim() !== 'yes') { showStatus(`❌ Path not writable: ${cfg.path}`, 'error', 4000); return; }
                }
                await execFn(`${CFG.BB} echo "${value}" > "${cfg.path}" 2>/dev/null`);
            }
            cfg.current = value;
            showStatus(`✅ ${cfg.label}: ${value}`, 'success');
            if (sel) { sel.style.borderColor = 'var(--green)'; setTimeout(() => sel.style.borderColor = '', 2000); }
            setTimeout(async () => {
                const actual = await readCurrentValue(cfg.path);
                if (sel) { sel.value = actual; sel.style.color = actual === value ? 'var(--green)' : 'var(--orange)'; }
            }, 300);
        } catch (e) {
            console.error(e);
            showStatus(`❌ ${e.message}`, 'error', 4000);
        }
    }

    async function applyText(id, val) {
        if (!rootAvailable) { showStatus('⚠️ Root required', 'error'); return; }
        const cfg = controls.find(c => c.id === id); if (!cfg) return;
        const tx = document.getElementById(`tf-ctext-${id}`);
        try {
            if (cfg.path.includes('*')) {
                const dir = cfg.path.substring(0, cfg.path.lastIndexOf('/'));                const pattern = cfg.path.substring(cfg.path.lastIndexOf('/') + 1);
                const files = await execFn(`${CFG.BB} ls ${dir}/${pattern} 2>/dev/null`);
                const fileList = files.split('\n').filter(f => f.trim());
                let successCount = 0;
                for (const file of fileList) {
                    if (await execFn(`test -w "${file}" && echo "yes" || echo "no"`) === 'yes') {
                        await execFn(`${CFG.BB} echo "${val}" > "${file}" 2>/dev/null`);
                        successCount++;
                    }
                }
                showStatus(`✅ Applied to ${successCount}/${fileList.length} paths`, 'success');
            } else {
                await execFn(`${CFG.BB} echo "${val}" > "${cfg.path}" 2>/dev/null`);
            }
            if (cfg.persist) await saveValue(id, val);
            cfg.current = val;
            showStatus(`✅ ${cfg.label} updated`, 'success');
        } catch (e) {
            console.error(e);
            showStatus(`❌ ${e.message}`, 'error', 4000);
        }
    }

    async function applyPermission(id, value) {
        if (!rootAvailable) { showStatus('⚠️ Root required', 'error'); return; }
        const cfg = controls.find(c => c.id === id); if (!cfg) return;
        if (value === 'custom') {
            const customInput = document.getElementById(`tf-perm-custom-${id}`);
            if (customInput && customInput.style.display !== 'none') { value = customInput.value.trim(); } else { return; }
        }
        if (!/^[0-7]{3,4}$/.test(value)) { showStatus('❌ Invalid permission. Use octal (e.g., 644)', 'error', 3000); return; }
        const valDisplay = document.getElementById(`tf-perm-val-${id}`);
        try {
            if (cfg.path.includes('*')) {
                const dir = cfg.path.substring(0, cfg.path.lastIndexOf('/'));
                const pattern = cfg.path.substring(cfg.path.lastIndexOf('/') + 1);
                const filesRaw = await execFn(`${CFG.BB} ls ${dir}/${pattern} 2>/dev/null`);
                const files = filesRaw.split('\n').filter(f => f.trim());
                let success = 0;
                for (const file of files) {
                    const wr = await execFn(`test -w "${file}" && echo "yes" || echo "no"`);
                    if (wr.trim() === 'yes') { await execFn(`${CFG.BB} chmod ${value} "${file}" 2>/dev/null`); success++; }
                }
                showStatus(`✅ Applied ${value} to ${success}/${files.length} files`, 'success');
            } else {
                const wr = await execFn(`test -w "${cfg.path}" && echo "yes" || echo "no"`);
                if (wr.trim() !== 'yes') throw new Error('Path not writable');
                await execFn(`${CFG.BB} chmod ${value} "${cfg.path}" 2>/dev/null`);
                showStatus(`✅ Permission set to ${value}`, 'success');
            }            if (valDisplay) { valDisplay.textContent = value; valDisplay.style.color = 'var(--green)'; setTimeout(() => valDisplay.style.color = 'var(--blue)', 1000); }
            if (cfg.persist) await saveValue(id, value);
            cfg.current = value;
            setTimeout(async () => {
                try {
                    const actual = await execFn(`${CFG.BB} stat -c "%a" "${cfg.path}" 2>/dev/null`);
                    if (actual.trim() && !actual.trim().includes('No such file')) {
                        if (valDisplay) {
                            valDisplay.textContent = actual.trim();
                            if (actual.trim() !== value) { valDisplay.style.color = 'var(--orange)'; showStatus(`⚠️ Kernel has ${actual.trim()}, not ${value}`, 'warning', 4000); }
                        }
                    }
                } catch (e) { /* silent */ }
            }, 400);
        } catch (e) {
            console.error(e);
            showStatus(`❌ ${e.message}`, 'error', 4000);
            setTimeout(async () => {
                const actual = await readCurrentValue(cfg.path);
                if (valDisplay && actual) valDisplay.textContent = actual;
            }, 500);
        }
    }

    // ========== UI REFRESH ==========
    async function calculatePercentage(cfg) {
        if (!cfg.path.includes('scaling_')) return '';
        try {
            const maxPath = cfg.path.replace('scaling_max_freq', 'cpuinfo_max_freq').replace('scaling_min_freq', 'cpuinfo_min_freq');
            const maxFreq = await execFn(`${CFG.BB} cat "${maxPath}" 2>/dev/null`);
            const current = parseInt(cfg.current) || 0;
            const max = parseInt(maxFreq.trim()) || cfg.max;
            if (max > 0) { const pct = Math.round((current / max) * 100); return `${pct}%`; }
        } catch (e) {}
        return '';
    }

    async function refreshControlState(cfg) {
        try {
            let actualValue;
            if (cfg.path.includes('*')) {
                const dir = cfg.path.substring(0, cfg.path.lastIndexOf('/'));
                const pattern = cfg.path.substring(cfg.path.lastIndexOf('/') + 1);
                const files = await execFn(`${CFG.BB} ls ${dir}/${pattern} 2>/dev/null`);
                const fileList = files.split('\n').filter(f => f.trim());
                if (fileList.length > 0) { actualValue = await execFn(`${CFG.BB} cat "${fileList[0]}" 2>/dev/null`); }
            } else { actualValue = await execFn(`${CFG.BB} cat "${cfg.path}" 2>/dev/null`); }
            if (!actualValue) return;
            const actual = actualValue.trim();
            switch (cfg.type) {                case 'toggle': {
                    const actualNorm = actual.toLowerCase();
                    const onNorm = (cfg.on || '').toString().trim().toLowerCase();
                    const offNorm = (cfg.off || '').toString().trim().toLowerCase();
                    const isOn = (actualNorm === onNorm);
                    const isOff = (actualNorm === offNorm);
                    const toggleEl = document.getElementById(`tf-ct-${cfg.id}`);
                    const statusEl = document.getElementById(`tf-ts-${cfg.id}`);
                    if (toggleEl) toggleEl.checked = isOn;
                    if (statusEl) {
                        if (isOn) { statusEl.textContent = '✅ ON'; statusEl.style.color = 'var(--green)'; }
                        else if (isOff) { statusEl.textContent = '❌ OFF'; statusEl.style.color = 'var(--text-dim)'; }
                        else { statusEl.textContent = `⚠️ ${actual}`; statusEl.style.color = 'var(--orange)'; }
                    }
                    cfg.current = actual; break;
                }
                case 'slider':
                    const num = parseFloat(actual) || cfg.min;
                    const clamped = Math.max(cfg.min, Math.min(cfg.max, num));
                    const sliderEl = document.getElementById(`tf-cs-${cfg.id}`);
                    const valueEl = document.getElementById(`tf-sv-${cfg.id}`);
                    const pctEl = document.getElementById(`tf-pct-${cfg.id}`);
                    if (sliderEl) sliderEl.value = clamped;
                    if (valueEl) valueEl.textContent = `${clamped}${cfg.unit || ''}`;
                    if (pctEl) { const pct = await calculatePercentage({ ...cfg, current: clamped }); pctEl.textContent = pct ? `(${pct})` : ''; }
                    cfg.current = clamped; break;
                case 'governor':
                    const govEl = document.getElementById(`tf-gov-select-${cfg.id}`);
                    if (govEl && cfg.governors?.includes(actual)) { govEl.value = actual; govEl.style.color = 'var(--green)'; setTimeout(() => govEl.style.color = '', 1000); }
                    cfg.current = actual; break;
                case 'ppm_policy':
                    const policies = parsePPMStatus(actualValue);
                    if (cfg.policies) {
                        cfg.policies.forEach(pol => {
                            const currentPol = policies.find(p => p.index === pol.index);
                            if (currentPol) {
                                pol.enabled = currentPol.enabled;
                                const toggle = document.getElementById(`tf-ppm-toggle-${cfg.id}-${pol.index}`);
                                const status = document.getElementById(`tf-ppm-status-${cfg.id}-${pol.index}`);
                                if (toggle) toggle.checked = currentPol.enabled;
                                if (status) { status.textContent = currentPol.enabled ? '✅ Enabled' : '❌ Disabled'; status.className = `tf-ppm-status ${currentPol.enabled ? 'on' : 'off'}`; }
                            }
                        });
                    } break;
                case 'permission':
                    const permVal = document.getElementById(`tf-perm-val-${cfg.id}`);
                    if (permVal) { permVal.textContent = actual; permVal.style.color = 'var(--blue)'; }
                    cfg.current = actual; break;
                case 'text':
                    const textEl = document.getElementById(`tf-ctext-${cfg.id}`);                    if (textEl) textEl.value = actual;
                    cfg.current = actual; break;
            }
        } catch (e) { console.warn(`Failed to refresh control ${cfg.id}:`, e); }
    }

    async function refreshAllControls() {
        await new Promise(resolve => setTimeout(resolve, 200));
        for (const cfg of controls) {
            await refreshControlState(cfg);
            await new Promise(resolve => setTimeout(resolve, 50));
        }
    }

    async function applyAllSavedValues() {
        if (!rootAvailable) return;
        let appliedCount = 0;
        let failedCount = 0;
        for (const cfg of controls) {
            if (!cfg.persist) continue;
            try {
                const savedRaw = await execFn(`${CFG.BB} cat "${CFG.VALUES_DIR}/${cfg.id}.val" 2>/dev/null`);
                const savedValue = savedRaw.trim();
                if (!savedValue) continue;
                let targetFiles = [];
                if (cfg.path.includes('*')) {
                    const dir = cfg.path.substring(0, cfg.path.lastIndexOf('/'));
                    const pattern = cfg.path.substring(cfg.path.lastIndexOf('/') + 1);
                    const filesRaw = await execFn(`${CFG.BB} ls ${dir}/${pattern} 2>/dev/null`);
                    targetFiles = filesRaw.split('\n').filter(f => f.trim());
                } else {
                    targetFiles = [cfg.path];
                }
                if (targetFiles.length === 0) { console.warn(`No files matched: ${cfg.path}`); failedCount++; continue; }
                if (cfg.type === 'toggle') {
                    const val = savedValue === cfg.on ? cfg.on : cfg.off;
                    for (const file of targetFiles) {
                        const wr = await execFn(`test -w "${file}" && echo "yes" || echo "no"`);
                        if (wr.trim() === 'yes') { await execFn(`${CFG.BB} echo "${val}" > "${file}" 2>/dev/null`); }
                    }
                    cfg.current = val; appliedCount++;
                } else if (cfg.type === 'slider') {
                    const num = parseFloat(savedValue) || cfg.min;
                    for (const file of targetFiles) {
                        const wr = await execFn(`test -w "${file}" && echo "yes" || echo "no"`);
                        if (wr.trim() === 'yes') { await execFn(`${CFG.BB} echo "${num}" > "${file}" 2>/dev/null`); }
                    }
                    cfg.current = num; appliedCount++;
                } else if (cfg.type === 'governor') {
                    for (const file of targetFiles) {                        const wr = await execFn(`test -w "${file}" && echo "yes" || echo "no"`);
                        if (wr.trim() === 'yes') { await execFn(`${CFG.BB} echo "${savedValue}" > "${file}" 2>/dev/null`); }
                    }
                    cfg.current = savedValue; appliedCount++;
                } else if (cfg.type === 'permission') {
                    if (/^[0-7]{3,4}$/.test(savedValue)) {
                        for (const file of targetFiles) {
                            await execFn(`${CFG.BB} chmod ${savedValue} "${file}" 2>/dev/null`);
                        }
                        cfg.current = savedValue; appliedCount++;
                    }
                } else if (cfg.type === 'text') {
                    for (const file of targetFiles) {
                        const wr = await execFn(`test -w "${file}" && echo "yes" || echo "no"`);
                        if (wr.trim() === 'yes') { await execFn(`${CFG.BB} echo "${savedValue}" > "${file}" 2>/dev/null`); }
                    }
                    cfg.current = savedValue; appliedCount++;
                } else if (cfg.type === 'ppm_policy') {
                    if (cfg.policies && cfg.policies.length > 0) {
                        for (const pol of cfg.policies) {
                            const value = pol.enabled ? '1' : '0';
                            for (const file of targetFiles) {
                                const wr = await execFn(`test -w "${file}" && echo "yes" || echo "no"`);
                                if (wr.trim() === 'yes') { await execFn(`${CFG.BB} echo "${pol.index} ${value}" > "${file}" 2>/dev/null`); }
                            }
                        }
                        appliedCount++;
                    }
                }
                await new Promise(resolve => setTimeout(resolve, 100));
            } catch (e) { console.warn(`Failed to apply ${cfg.label}:`, e); failedCount++; }
        }
        if (appliedCount > 0) {
            const msg = failedCount > 0 ? `✅ Applied ${appliedCount} tweak(s) | ⚠️ ${failedCount} failed` : `✅ Applied ${appliedCount} saved tweak(s) from SD card`;
            showStatus(msg, appliedCount > 0 ? 'success' : 'warning', 5000);
        }
        setTimeout(() => { refreshAllControls(); }, 500);
    }

    // ========== APP TRIGGERS ==========
    async function loadAppScripts() {
        try {
            await execFn(`${CFG.BB} mkdir -p "${CFG.TRIGGERS_DIR}" 2>/dev/null`);
            const files = await execFn(`${CFG.BB} ls "${CFG.TRIGGERS_DIR}"/*.sh 2>/dev/null`);
            const fileList = files.split('\n').filter(f => f.trim());
            appScripts = {};
            for (const file of fileList) {
                const pkg = file.split('/').pop().replace('.sh', '');
                const content = await execFn(`${CFG.BB} cat "${file}" 2>/dev/null`);
                appScripts[pkg] = content.trim();            }
        } catch (e) { console.warn('Load app scripts failed', e); }
    }

    async function saveAppScript(pkg, code) {
        try {
            await execFn(`${CFG.BB} mkdir -p "${CFG.TRIGGERS_DIR}" 2>/dev/null`);
            await execFn(`${CFG.BB} echo '${code.replace(/'/g, "'\\''")}' > "${CFG.TRIGGERS_DIR}/${pkg}.sh" 2>/dev/null`);
            await execFn(`chmod 755 "${CFG.TRIGGERS_DIR}/${pkg}.sh"`);
            appScripts[pkg] = code;
            showStatus(`✅ Script saved for ${pkg}`, 'success');
        } catch (e) { showStatus(`❌ Save failed: ${e.message}`, 'error', 4000); }
    }

    async function deleteAppScript(pkg) {
        if (!confirm(`Delete trigger script for ${pkg}?`)) return;
        try {
            await execFn(`${CFG.BB} rm -f "${CFG.TRIGGERS_DIR}/${pkg}.sh" 2>/dev/null`);
            delete appScripts[pkg];
            showStatus(`🗑️ Script deleted for ${pkg}`, 'info', 2000);
        } catch (e) { showStatus(`❌ Delete failed: ${e.message}`, 'error', 4000); }
    }

    async function testAppScript(pkg) {
        if (!appScripts[pkg]) { showStatus('⚠️ No script to test', 'warning'); return; }
        showStatus('▶️ Running test...', 'info', 0);
        try {
            const result = await execFn(`sh "${CFG.TRIGGERS_DIR}/${pkg}.sh" 2>&1`);
            showStatus(result.trim() || '✅ Test completed', result.includes('error') || result.includes('Error') ? 'error' : 'success', 5000);
        } catch (e) { showStatus(`❌ Test failed: ${e.message}`, 'error', 5000); }
    }

    async function getCurrentApp() {
        try {
            const methods = [
                `dumpsys window windows | grep -E 'mCurrentFocus|mFocusedApp' | head -1`,
                `dumpsys activity activities | grep mResumedActivity`,
                `cmd package list packages -f | grep -v 'package:' | head -1`
            ];
            for (const cmd of methods) {
                const result = await execFn(cmd);
                const match = result.match(/([a-z0-9._]+\/[a-z0-9._]+)/i) || result.match(/package:([a-z0-9._]+)/i);
                if (match && match[1]) {
                    const pkg = match[1].split('/')[0];
                    return pkg;
                }
            }
            return null;
        } catch (e) { return null; }
    }
    function renderAppList(filter = '') {
        const container = document.getElementById('tf-app-list-container');
        if (!container) return;
        const allApps = Object.keys(appScripts).sort();
        const filtered = filter ? allApps.filter(pkg => pkg.toLowerCase().includes(filter.toLowerCase())) : allApps;
        if (!filtered.length) {
            container.innerHTML = '<div class="tf-empty-state"><p>No apps found</p></div>';
            return;
        }
        let html = '';
        filtered.forEach(pkg => {
            const hasScript = !!appScripts[pkg];
            html += `<div class="tf-app-item">
                <div style="display:flex;align-items:center;flex:1;min-width:0" onclick="TweakFinder.openScriptEditor('${pkg}')">
                    <div class="tf-app-icon">📱</div>
                    <div style="flex:1;min-width:0">
                        <div class="tf-app-pkg">${escapeHtml(pkg)}</div>
                        <div class="tf-app-status ${hasScript ? 'has-script' : ''}">${hasScript ? '✓ Script' : 'No script'}</div>
                    </div>
                </div>
                <div style="display:flex;gap:4px">
                    <button class="tf-btn-sm edit" onclick="TweakFinder.openScriptEditor('${pkg}')">✏️</button>
                    <button class="tf-btn-sm remove" onclick="TweakFinder.deleteAppScript('${pkg}')">🗑️</button>
                </div>
            </div>`;
        });
        container.innerHTML = html;
    }

    function openScriptEditor(pkg) {
        const modal = document.getElementById('tf-script-editor-modal');
        const pkgName = document.getElementById('tf-editor-pkg-name');
        const codeArea = document.getElementById('tf-script-code');
        if (!modal || !pkgName || !codeArea) return;
        pkgName.textContent = pkg;
        codeArea.value = appScripts[pkg] || `#!/system/bin/sh
# Trigger script for ${pkg}
# This runs when app launches/exits

# Example: Set CPU to performance
# echo performance > /sys/devices/system/cpu/cpu0/cpufreq/scaling_governor

# Example: Adjust GPU freq
# echo 600000000 > /sys/class/kgsl/kgsl-3d0/min_pwrlevel`;
        modal.classList.add('active');
    }

    function closeEditor() {
        document.getElementById('tf-script-editor-modal').classList.remove('active');    }

    async function saveAppScriptFromUI() {
        const pkg = document.getElementById('tf-editor-pkg-name').textContent;
        const code = document.getElementById('tf-script-code').value;
        await saveAppScript(pkg, code);
        closeEditor();
        renderAppList(document.getElementById('tf-app-search').value);
    }

    async function deleteAppScriptFromUI() {
        const pkg = document.getElementById('tf-editor-pkg-name').textContent;
        await deleteAppScript(pkg);
        closeEditor();
        renderAppList(document.getElementById('tf-app-search').value);
    }

    async function testAppScriptFromUI() {
        const pkg = document.getElementById('tf-editor-pkg-name').textContent;
        await testAppScript(pkg);
    }

    // ========== TABS & UI INIT ==========
    function switchTab(tabName) {
        document.querySelectorAll('.tf-tab-btn').forEach(btn => btn.classList.remove('active'));
        document.querySelectorAll('.tf-tab-content').forEach(tab => tab.classList.remove('active'));
        document.querySelector(`.tf-tab-btn[onclick*="'${tabName}'"]`)?.classList.add('active');
        document.getElementById(`tf-tab-${tabName}`)?.classList.add('active');
        
        // Auto-load browse when tab is opened
        if (tabName === 'browse' && currentBrowsePath === '/') {
            setTimeout(() => browsePath('/'), 100);
        }
    }

    function injectStyles() {
        const style = document.createElement('style');
        style.textContent = STYLES;
        document.head.appendChild(style);
    }

    function createUI(container) {
        container.innerHTML = `
            <div class="tf-search-box"><input type="text" id="tf-search-input" placeholder="Search: boost, freq, thermal..."><button id="tf-btn-search">🔍</button></div>
            <div class="tf-search-options">
                <label><input type="checkbox" id="tf-opt-name" checked> Name</label>
                <label><input type="checkbox" id="tf-opt-content"> Content</label>
                <label><input type="checkbox" id="tf-opt-path"> Path/Folder</label>
            </div>
            <div class="tf-tab-nav">                <button class="tf-tab-btn active" onclick="TweakFinder.switchTab('search')">🔍 Search</button>
                <button class="tf-tab-btn" onclick="TweakFinder.switchTab('browse')">📁 Browse</button>
                <button class="tf-tab-btn" onclick="TweakFinder.switchTab('controls')">🎛️ Controls</button>
            </div>
            <div class="tf-cache-info">Cache: <span id="tf-cache-count">0</span> searches <button onclick="TweakFinder.clearCache()">Clear</button></div>
            <div id="tf-search-status" style="font-size:12px;color:var(--orange);margin:8px 0 12px;display:none"></div>
            
            <!-- Search Tab -->
            <div id="tf-tab-search" class="tf-tab-content active">
                <div id="tf-search-results-container">
                    <div class="tf-empty-state"><div class="icon">🔍</div><p><strong>Search for tweakable files</strong></p><p>Enter a keyword to scan /sys, /proc, /dev paths</p></div>
                </div>
            </div>
            
            <!-- Browse Tab -->
            <div id="tf-tab-browse" class="tf-tab-content">
                <div style="display:flex;gap:8px;margin-bottom:12px;align-items:center;flex-wrap:wrap">
                    <button class="tf-btn-sm" onclick="TweakFinder.browsePath('/')" style="background:var(--blue)">🏠 Root</button>
                    <button class="tf-btn-sm" onclick="TweakFinder.browsePath('/sys')">🔧 Sys</button>
                    <button class="tf-btn-sm" onclick="TweakFinder.browsePath('/proc')">📊 Proc</button>
                    <button class="tf-btn-sm" onclick="TweakFinder.browsePath('/dev')">⚡ Dev</button>
                </div>
                <div style="font-size:11px;color:var(--text-dim);margin-bottom:8px;padding:8px;background:rgba(255,255,255,0.03);border-radius:8px">
                    📍 Current: <code id="tf-browse-current-path" style="color:var(--blue)">/</code>
                </div>
                <div id="tf-browse-results-container">
                    <div class="tf-empty-state">
                        <div class="icon">📁</div>
                        <p><strong>Browse filesystem</strong></p>
                        <p>Navigate directories to find tweakable files</p>
                        <button class="tf-btn-sm add" onclick="TweakFinder.browsePath('/')" style="margin-top:12px">Start Browsing</button>
                    </div>
                </div>
            </div>
            
            <!-- Controls Tab -->
            <div id="tf-tab-controls" class="tf-tab-content">
                <div class="tf-section-title">🎛️ My Controls</div>
                <div id="tf-discovered-controls-container">
                    <div class="tf-empty-state"><div class="icon">🎛️</div><p>No controls yet</p><p>Search above, then tap <strong>➕ Add Control</strong></p></div>
                </div>
            </div>
            
            <!-- Triggers Tab -->
            <div id="tf-tab-triggers" class="tf-tab-content">
                <div class="tf-section-title">🎮 Per-App Trigger Manager</div>
                <div class="tf-current-app-box">
                    <div class="tf-current-app-label">📱 Currently Detected App</div>
                    <div class="tf-current-app-value" id="tf-current-app-display">Loading...</div>
                    <button class="tf-btn-sm" style="margin-top:8px" onclick="TweakFinder.refreshCurrentApp()">🔄 Refresh</button>                </div>
                <div style="display:flex;gap:8px;margin-bottom:12px">
                    <input type="text" id="tf-app-search" placeholder="Search package name..." style="flex:1;padding:10px;background:var(--card);color:var(--text);border:1px solid var(--border);border-radius:8px;font-size:13px">
                    <button class="tf-btn-sm add" onclick="TweakFinder.createNewAppScript()">➕ New</button>
                </div>
                <div id="tf-app-list-container" class="tf-app-list"></div>
            </div>
            
            <div id="tf-status-bar" class="tf-status-bar"></div>
            <div id="tf-script-editor-modal" class="tf-editor-modal">
                <div class="tf-editor-card">
                    <div class="tf-editor-header">
                        <div><div class="tf-editor-title">✏️ Edit App Trigger Script</div><div class="tf-editor-pkg" id="tf-editor-pkg-name">com.example.app</div></div>
                        <button onclick="TweakFinder.closeEditor()" style="background:none;border:none;color:var(--text);font-size:24px;cursor:pointer">&times;</button>
                    </div>
                    <div style="font-size:11px;color:var(--text-dim);margin-bottom:12px">💡 Script path: <code style="color:var(--blue)">/sdcard/MTK_AI_Engine/triggers/<package>.sh</code></div>
                    <textarea id="tf-script-code" class="tf-script-editor" placeholder="#!/system/bin/sh
# Your commands here"></textarea>
                    <div style="font-size:10px;color:var(--text-dim);margin:8px 0">⚠️ Script runs as root. Use #!/system/bin/sh at the top.</div>
                    <div class="tf-editor-actions">
                        <button class="tf-btn-delete" onclick="TweakFinder.deleteAppScriptFromUI()">🗑️ Delete</button>
                        <button class="tf-btn-cancel" onclick="TweakFinder.closeEditor()">Cancel</button>
                        <button class="tf-btn-test" onclick="TweakFinder.testAppScriptFromUI()">▶️ Test</button>
                        <button class="tf-btn-save" onclick="TweakFinder.saveAppScriptFromUI()">💾 Save</button>
                    </div>
                </div>
            </div>
        `;
    }

    async function init(containerId) {
        injectStyles();
        const container = document.getElementById(containerId);
        if (!container) { console.error(`TweakFinder: Container #${containerId} not found`); return; }
        createUI(container);
        
        // Bind events
        document.getElementById('tf-btn-search').onclick = doSearch;
        document.getElementById('tf-search-input').onkeydown = e => { if (e.key === 'Enter') doSearch(); };
        document.getElementById('tf-app-search').oninput = e => renderAppList(e.target.value);
        
        // Check root
        updateHeader('Checking root...', 'var(--orange)');
        try {
            const test = await execFn('id');
            rootAvailable = test.includes('uid=0');
        } catch (e) { rootAvailable = false; }
        
        if (!rootAvailable) {
            updateHeader('⚠️ No root access', 'var(--red)');            showStatus('⚠️ Root required. Ensure WebView has root permission.', 'warning', 0);
            document.getElementById('tf-btn-search').disabled = true;
            document.getElementById('tf-search-input').disabled = true;
            return;
        }
        
        updateHeader('✓ Root available', 'var(--green)');
        showStatus('✅ Root detected', 'success', 2000);
        
        // Setup directories
        try {
            await execFn(`${CFG.BB} mkdir -p "/sdcard/MTK_AI_Engine" 2>/dev/null`);
            await execFn(`${CFG.BB} mkdir -p "${CFG.VALUES_DIR}" 2>/dev/null`);
            await execFn(`${CFG.BB} mkdir -p "${CFG.TRIGGERS_DIR}" 2>/dev/null`);
        } catch (e) {}
        
        // Load cache & registry
        try {
            const c = await execFn(`${CFG.BB} cat "${CFG.CACHE_FILE}" 2>/dev/null`);
            if (c.trim()) { searchCache = JSON.parse(c.trim()); document.getElementById('tf-cache-count').textContent = Object.keys(searchCache).length; }
        } catch (e) {}
        
        await loadRegistry();
        await loadAppScripts();
        renderAppList();
        
        // Detect current app
        currentApp = await getCurrentApp();
        document.getElementById('tf-current-app-display').textContent = currentApp || 'No app detected';
        
        // Auto-apply saved values
        setTimeout(() => { applyAllSavedValues(); }, 500);
    }

    // ========== PUBLIC API ==========
    window.TweakFinder = {
        init,
        switchTab,
        doSearch,
        browsePath,
        browseAddControl,
        previewFile,
        copyContent,
        analyzeFile,
        createControl,
        updateControl,
        deleteControl,
        editControl: (id) => { const cfg = controls.find(c => c.id === id); if (cfg) { editingId = id; analyzing = { path: cfg.path, type: cfg.type, options: cfg, content: '' }; showCreator(); } },
        editControlByPath: (path) => { const cfg = controls.find(c => c.path === path); if (cfg) TweakFinder.editControl(cfg.id); },
        removeControl: (id) => { if (confirm('Remove this control?')) deleteControl(id); },        applyToggle,
        applySlider,
        applyGovernor,
        applyText,
        applyPermission,
        applyPPMPolicy,
        updateSlider,
        closeCreator,
        clearCache,
        refreshCurrentApp: async () => { currentApp = await getCurrentApp(); document.getElementById('tf-current-app-display').textContent = currentApp || 'No app detected'; },
        createNewAppScript: () => { const pkg = prompt('Enter package name:'); if (pkg) openScriptEditor(pkg); },
        openScriptEditor,
        closeEditor,
        saveAppScriptFromUI,
        deleteAppScriptFromUI,
        testAppScriptFromUI,
        renderAppList,
        loadAppScripts,
        saveAppScript,
        deleteAppScript,
        testAppScript,
        getCurrentApp,
        // Expose for debugging
        getControls: () => controls,
        getSearchCache: () => searchCache
    };

    // ==========================================
    // MODAL SETUP (Paste at very bottom)
    // ==========================================
    function setupTweakFinderModal() {
        const btn = document.getElementById('tweakfinder-btn');
        if (!btn) return;

        if (!document.getElementById('tf-modal')) {
            const modal = document.createElement('div');
            modal.id = 'tf-modal';
            modal.style.cssText = 'position:fixed;inset:0;background:#000;z-index:10000;display:none;overflow-y:auto;font-family:sans-serif;';
            modal.innerHTML = `
                <div style="position:sticky;top:0;background:rgba(0,0,0,0.95);padding:15px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #333;z-index:10;backdrop-filter:blur(10px);">
                    <h2 style="color:#fff;margin:0;font-size:18px;">🔍 Tweak Finder</h2>
                    <button id="tf-close-btn" style="background:#333;color:#fff;border:none;padding:8px 16px;border-radius:20px;cursor:pointer;">Close</button>
                </div>
                <div id="tf-modal-root" style="padding-bottom:20px;"></div>
            `;
            document.body.appendChild(modal);
            document.getElementById('tf-close-btn').onclick = () => { modal.style.display = 'none'; };
        }

        btn.onclick = async () => {            const modal = document.getElementById('tf-modal');
            const root = document.getElementById('tf-modal-root');
            modal.style.display = 'block';
            if (!root.hasChildNodes()) {
                injectStyles(); 
                await init('tf-modal-root');
            }
        };
    }

    document.addEventListener('DOMContentLoaded', setupTweakFinderModal);

})(); // End of script