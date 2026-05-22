// setedit.js - System Property Editor (SetEdit Alternative)
(function() {
    'use strict';

    // ========== CONFIGURATION ==========
    const CFG = {
        REFRESH_INTERVAL: 8000,
        REFRESH_COOLDOWN: 2000,
        MAX_RESULTS: 500,
        TABLES: [
            { id: 'system', name: 'System', cmd: 'settings list system' },
            { id: 'secure', name: 'Secure', cmd: 'settings list secure' },
            { id: 'global', name: 'Global', cmd: 'settings list global' }
        ]
    };

    // ========== STATE ==========
    let currentTable = 'all';
    let searchTerm = '';
    let allProperties = [];
    let filteredProperties = [];
    let refreshInterval = null;
    let isRefreshing = false;
    let lastRefreshTime = 0;
    let rootAvailable = false;
    let editTarget = null;

    // ========== ROOT EXEC WRAPPER ==========
    const execFn = window.exec || (async function(command, timeout = 8000) {
        return new Promise((resolve) => {
            const callback = `se_exec_${Date.now()}_${Math.random().toString(36).substring(2)}`;
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
            } else if (window.rootExec && typeof rootExec === 'function') {
                try { rootExec(command, (res) => { clearTimeout(timer); resolve(res || ''); }); }
                catch (e) { clearTimeout(timer); resolve(''); }
            } else {
                clearTimeout(timer); if (window[callback]) delete window[callback]; resolve('');
            }
        });    });

    // ========== STYLES ==========
    const STYLES = `
    :root {
        --bg: #000; --card: #1c1c1e; --text: #fff; --text-dim: #86868b;
        --border: #3a3a3c; --blue: #0A84FF; --green: #32D74B; --red: #FF453A; 
        --orange: #FF9F0A; --purple: #BF5AF2; --yellow: #FFD60A;
        --switch-bg: #3a3a3c; --switch-on: #32D74B;
        --input-bg: #2c2c2e; --input-border: #48484a;
    }
    .se-root { 
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
        background: var(--bg); 
        color: var(--text); 
        line-height: 1.4; 
        padding: 12px; 
        min-height: 100vh;
        -webkit-tap-highlight-color: transparent;
        max-width: 600px;
        margin: 0 auto;
        padding-bottom: 90px;
    }
    .se-header { 
        display: flex; 
        justify-content: space-between; 
        align-items: center; 
        padding: 12px 0 16px; 
        border-bottom: 1px solid var(--border); 
        margin-bottom: 16px; 
        flex-wrap: wrap;
        gap: 10px;
    }
    .se-header h1 { 
        font-size: 18px; 
        font-weight: 700; 
        margin: 0;
        background: linear-gradient(90deg, var(--blue), var(--purple));
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
    }
    .se-search-box {
        display: flex; gap: 8px; width: 100%;
    }
    .se-search-input {
        flex: 1; background: var(--input-bg); border: 1px solid var(--input-border);
        border-radius: 10px; padding: 10px 14px; color: var(--text); font-size: 13px;
        outline: none; transition: border-color 0.2s;
    }
    .se-search-input:focus { border-color: var(--blue); }    .se-search-input::placeholder { color: var(--text-dim); }
    
    .se-btn { 
        padding: 10px 14px; border: none; border-radius: 10px; cursor: pointer; 
        font-weight: 600; font-size: 12px; transition: all 0.2s; display: inline-flex; 
        align-items: center; gap: 5px; user-select: none; white-space: nowrap;
    }
    .se-btn:active { transform: scale(0.97); }
    .se-btn-primary { background: linear-gradient(135deg, var(--blue), #007AFF); color: #fff; box-shadow: 0 4px 12px rgba(10,132,255,0.3); }
    .se-btn-danger { background: linear-gradient(135deg, var(--red), #FF3B30); color: #fff; }
    .se-btn-secondary { background: var(--card); color: var(--text); border: 1px solid var(--border); }
    .se-btn-success { background: linear-gradient(135deg, var(--green), #28CD41); color: #fff; }
    .se-btn-warning { background: linear-gradient(135deg, var(--orange), #FF9F0A); color: #fff; }
    .se-btn:disabled { opacity: 0.4; cursor: not-allowed; transform: none !important; }
    .se-btn-small { padding: 6px 10px; font-size: 11px; border-radius: 8px; }

    .se-table-tabs { display: flex; gap: 6px; margin-bottom: 14px; overflow-x: auto; padding-bottom: 4px; scrollbar-width: none; }
    .se-table-tabs::-webkit-scrollbar { display: none; }
    .se-tab-btn { padding: 8px 14px; background: var(--card); border: 1px solid var(--border); border-radius: 20px; color: var(--text-dim); font-size: 11px; font-weight: 600; cursor: pointer; transition: all 0.2s; white-space: nowrap; }
    .se-tab-btn.active { background: var(--blue); color: #fff; border-color: var(--blue); }
    .se-tab-btn:hover:not(.active) { border-color: var(--text-dim); color: var(--text); }

    .se-grid { display: grid; grid-template-columns: 1fr; gap: 10px; }
    .se-card { background: var(--card); border: 1px solid var(--border); border-radius: 14px; padding: 14px; position: relative; transition: border-color 0.2s, transform 0.15s, background 0.2s; }
    .se-card:hover { border-color: var(--blue); transform: translateY(-1px); }
    .se-card-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; margin-bottom: 8px; }
    .se-prop-name { font-weight: 600; font-size: 13px; color: #fff; word-break: break-word; flex: 1; }
    .se-prop-table { font-size: 10px; padding: 3px 8px; border-radius: 6px; background: var(--input-bg); color: var(--text-dim); text-transform: uppercase; font-weight: 700; letter-spacing: 0.3px; }
    .se-prop-table.system { color: var(--blue); border: 1px solid var(--blue); }
    .se-prop-table.secure { color: var(--purple); border: 1px solid var(--purple); }
    .se-prop-table.global { color: var(--orange); border: 1px solid var(--orange); }
    
    .se-prop-value { font-family: 'JetBrains Mono', monospace; font-size: 11px; color: var(--text-dim); background: rgba(0,0,0,0.25); padding: 8px 10px; border-radius: 8px; word-break: break-all; margin: 6px 0; border-left: 2px solid var(--border); }
    .se-prop-value.boolean-true { border-left-color: var(--green); color: var(--green); }
    .se-prop-value.boolean-false { border-left-color: var(--red); color: var(--red); }
    .se-prop-value.number { border-left-color: var(--yellow); color: var(--yellow); }
    
    .se-card-actions { display: flex; gap: 6px; margin-top: 10px; flex-wrap: wrap; }
    .se-card-actions .se-btn { flex: 1; min-width: 0; }

    .se-card.se-clickable { cursor: pointer; -webkit-tap-highlight-color: rgba(10,132,255,0.2); }
    .se-card.se-clickable:hover { background: rgba(10,132,255,0.05); }
    .se-card.se-clickable:active { transform: scale(0.98); background: rgba(10,132,255,0.12); }

    .se-status-box { background: var(--card); border: 1px solid var(--border); border-radius: 16px; padding: 32px 24px; text-align: center; margin: 24px 0; }
    .se-status-icon { font-size: 48px; margin-bottom: 12px; opacity: 0.6; }

    .se-modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.85); display: none; align-items: center; justify-content: center; z-index: 10005; backdrop-filter: blur(8px); padding: 16px; }
    .se-modal-overlay.active { display: flex; }
    .se-modal { background: var(--card); border: 1px solid var(--border); border-radius: 16px; width: 100%; max-width: 500px; max-height: 90vh; display: flex; flex-direction: column; box-shadow: 0 8px 32px rgba(0,0,0,0.6); }    .se-modal-header { padding: 14px 16px; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; }
    .se-modal-header h3 { margin: 0; font-size: 15px; color: #fff; }
    .se-modal-body { padding: 16px; overflow-y: auto; display: flex; flex-direction: column; gap: 12px; }
    .se-form-group { display: flex; flex-direction: column; gap: 6px; }
    .se-form-group label { font-size: 11px; color: var(--text-dim); font-weight: 600; text-transform: uppercase; letter-spacing: 0.4px; }
    .se-form-input, .se-form-select, .se-form-textarea { background: var(--input-bg); border: 1px solid var(--input-border); border-radius: 10px; padding: 10px 12px; color: var(--text); font-size: 13px; outline: none; transition: border-color 0.2s; font-family: 'JetBrains Mono', monospace; }
    .se-form-input:focus, .se-form-select:focus, .se-form-textarea:focus { border-color: var(--blue); }
    .se-form-textarea { min-height: 150px; resize: vertical; font-size: 11px; }
    .se-modal-footer { padding: 12px 16px; border-top: 1px solid var(--border); display: flex; justify-content: flex-end; gap: 10px; flex-wrap: wrap; }

    .se-loading { grid-column: 1/-1; text-align: center; padding: 40px; color: var(--text-dim); font-size: 13px; animation: se-pulse 2s infinite; }
    @keyframes se-pulse { 0%, 100% { opacity: 0.6; } 50% { opacity: 1; } }
    
    .se-toast { position: fixed; bottom: 16px; left: 50%; transform: translateX(-50%) translateY(20px); background: var(--card); border: 1px solid var(--border); padding: 12px 20px; border-radius: 50px; opacity: 0; transition: all 0.3s; pointer-events: none; z-index: 2000; box-shadow: 0 4px 20px rgba(0,0,0,0.4); font-weight: 600; color: #fff; font-size: 12px; }
    .se-toast.show { transform: translateX(-50%) translateY(0); opacity: 1; }
    .se-count-badge { background: var(--input-bg); padding: 4px 10px; border-radius: 20px; font-size: 11px; color: var(--text-dim); margin-left: 8px; }
    .se-script-info { background: rgba(0,0,0,0.3); padding: 12px; border-radius: 10px; font-size: 11px; color: var(--text-dim); border-left: 3px solid var(--orange); margin-bottom: 12px; }
    
    @media (max-width: 600px) {
        .se-header { flex-direction: column; align-items: stretch; }
        .se-search-box { flex-direction: column; }
        .se-card-actions { flex-direction: column; }
        .se-card-actions .se-btn { width: 100%; }
        .se-root { padding: 10px; padding-bottom: 90px; }
    }
    `;

    // ========== UI UTILITIES ==========
    function injectStyles() {
        if (document.getElementById('se-styles')) return;
        const style = document.createElement('style');
        style.id = 'se-styles';
        style.textContent = STYLES;
        document.head.appendChild(style);
    }

    function toast(msg, type = 'info', duration = 2500) {
        let t = document.getElementById('se-toast');
        if (!t) { t = document.createElement('div'); t.id = 'se-toast'; t.className = 'se-toast'; document.body.appendChild(t); }
        t.textContent = msg;
        t.style.borderColor = type === 'error' ? 'var(--red)' : type === 'success' ? 'var(--green)' : type === 'warning' ? 'var(--orange)' : 'var(--border)';
        t.classList.add('show');
        setTimeout(() => t.classList.remove('show'), duration);
    }

    function detectValueType(value) {
        const v = value.trim();
        if (v === 'true' || v === 'false') return 'boolean';
        if (/^-?\d+$/.test(v)) return 'number';
        if (/^-?\d+\.\d+$/.test(v)) return 'float';        return 'string';
    }

    function formatValue(value, type) {
        if (type === 'boolean') return value === '1' || value.toLowerCase() === 'true' ? 'true' : 'false';
        return value;
    }

    function getValueClass(value) {
        const type = detectValueType(value);
        if (type === 'boolean') return value === 'true' ? 'boolean-true' : 'boolean-false';
        if (type === 'number' || type === 'float') return 'number';
        return '';
    }

    // ========== EDIT MODAL ==========
    function openEditModal(prop, table, isNew = false) {
        editTarget = { prop, table, isNew };
        let modal = document.getElementById('se-modal-edit');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'se-modal-edit'; modal.className = 'se-modal-overlay';
            modal.onclick = (e) => { if (e.target === modal) closeEditModal(); };
            modal.innerHTML = `
                <div class="se-modal">
                    <div class="se-modal-header"><h3 id="se-modal-title">✏️ Edit Property</h3><button class="se-btn se-btn-secondary se-btn-small" onclick="SetEdit.closeEditModal()">✕</button></div>
                    <div class="se-modal-body">
                        <div class="se-form-group"><label>Table</label><select id="se-edit-table" class="se-form-select" disabled><option value="system">System</option><option value="secure">Secure</option><option value="global">Global</option></select></div>
                        <div class="se-form-group"><label>Property Name</label><input type="text" id="se-edit-name" class="se-form-input" placeholder="e.g., screen_brightness"></div>
                        <div class="se-form-group"><label>Value Type</label><select id="se-edit-type" class="se-form-select"><option value="string">String</option><option value="int">Integer</option><option value="long">Long</option><option value="float">Float</option></select></div>
                        <div class="se-form-group"><label>Value</label><input type="text" id="se-edit-value" class="se-form-input" placeholder="Enter value"></div>
                        <div id="se-edit-warning" style="font-size:11px;color:var(--orange);display:none;">⚠️ Changing system properties may cause instability</div>
                    </div>
                    <div class="se-modal-footer">
                        <button class="se-btn se-btn-danger" id="se-btn-delete" style="display:none;" onclick="SetEdit.deleteProperty()">️ Delete</button>
                        <button class="se-btn se-btn-secondary" onclick="SetEdit.closeEditModal()">Cancel</button>
                        <button class="se-btn se-btn-success" onclick="SetEdit.saveProperty()">💾 Save</button>
                    </div>
                </div>`;
            document.body.appendChild(modal);
        }
        document.getElementById('se-edit-table').value = table;
        document.getElementById('se-edit-name').value = prop || '';
        document.getElementById('se-edit-name').disabled = !isNew;
        const detectedType = detectValueType(document.getElementById('se-edit-value').value || '');
        document.getElementById('se-edit-type').value = {boolean:'string',number:'int',float:'float',string:'string'}[detectedType] || 'string';
        document.getElementById('se-edit-value').value = prop ? '' : '';
        document.getElementById('se-edit-warning').style.display = (table === 'secure' || table === 'global') ? 'block' : 'none';
        document.getElementById('se-btn-delete').style.display = isNew ? 'none' : 'inline-flex';
        modal.classList.add('active');        setTimeout(() => document.getElementById('se-edit-value').focus(), 100);
    }

    function closeEditModal() {
        const modal = document.getElementById('se-modal-edit');
        if (modal) modal.classList.remove('active');
        editTarget = null;
    }

    async function saveProperty() {
        if (!editTarget) return;
        const table = document.getElementById('se-edit-table').value;
        const name = document.getElementById('se-edit-name').value.trim();
        const value = document.getElementById('se-edit-value').value;
        if (!name) { toast(' Property name required', 'error'); return; }
        if (value === '' && !editTarget.isNew && !confirm('⚠️ Set empty value? This may cause issues.')) return;
        toast(`💾 Saving ${name}...`);
        try {
            await execFn(`settings put ${table} '${name.replace(/'/g, "'\\''")}' '${value.replace(/'/g, "'\\''")}'`);
            toast(`✅ ${name} updated`, 'success');
            closeEditModal();
            await refreshProperties();
        } catch (e) { toast(`❌ Failed: ${e.message || e}`, 'error'); }
    }

    async function deleteProperty() {
        if (!editTarget || editTarget.isNew) return;
        const { prop, table } = editTarget;
        if (!confirm(`⚠️ Delete "${prop}" from ${table} table?\nThis cannot be undone!`)) return;
        toast(`🗑️ Deleting ${prop}...`);
        try {
            await execFn(`settings delete ${table} '${prop.replace(/'/g, "'\\''")}'`);
            toast(`✅ "${prop}" deleted`, 'success');
            closeEditModal();
            await refreshProperties();
        } catch (e) { toast(`❌ Failed: ${e.message || e}`, 'error'); }
    }

    // ========== BOOT SCRIPT GENERATOR & INSTALLER ==========
    function openBootScriptModal() {
        let modal = document.getElementById('se-modal-bootscript');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'se-modal-bootscript'; modal.className = 'se-modal-overlay';
            modal.onclick = (e) => { if (e.target === modal) closeBootScriptModal(); };
            modal.innerHTML = `
                <div class="se-modal">
                    <div class="se-modal-header"><h3>🚀 Boot Script Generator</h3><button class="se-btn se-btn-secondary se-btn-small" onclick="SetEdit.closeBootScriptModal()">✕</button></div>
                    <div class="se-modal-body">
                        <div class="se-script-info">📝 Applies current filtered settings at boot via /data/adb/service.d/</div>                        <div id="se-bootscript-status" style="margin-bottom:12px;"></div>
                        <div class="se-form-group"><label>Script Preview</label><textarea id="se-bootscript-content" class="se-form-textarea" readonly></textarea></div>
                    </div>
                    <div class="se-modal-footer">
                        <button class="se-btn se-btn-secondary" onclick="SetEdit.closeBootScriptModal()">Close</button>
                        <button class="se-btn se-btn-secondary" onclick="SetEdit.copyBootScript()">📋 Copy</button>
                        <button class="se-btn se-btn-primary" onclick="SetEdit.downloadBootScript()">💾 Download</button>
                        <button class="se-btn se-btn-danger" id="se-btn-uninstall-boot" style="display:none;" onclick="SetEdit.uninstallBootScript()">🗑️ Uninstall</button>
                        <button class="se-btn se-btn-success" id="se-btn-install-boot" onclick="SetEdit.installBootScript()">⚡ Install to service.d</button>
                    </div>
                </div>`;
            document.body.appendChild(modal);
        }
        generateBootScript();
        checkAndShowBootScriptStatus();
        modal.classList.add('active');
    }

    function closeBootScriptModal() {
        const modal = document.getElementById('se-modal-bootscript');
        if (modal) modal.classList.remove('active');
    }

    function generateBootScript() {
        const timestamp = new Date().toISOString();
        let script = `#!/system/bin/sh
# SetEdit Pro Boot Script
# Generated: ${timestamp}
# Auto-installed via SetEdit UI

while [ "\$(getprop sys.boot_completed)" != "1" ]; do sleep 5; done
sleep 10
`;
        const tables = { system: [], secure: [], global: [] };
        filteredProperties.forEach(p => {
            const n = p.name.replace(/'/g, "'\\''");
            const v = p.value.replace(/'/g, "'\\''");
            tables[p.table].push(`settings put ${p.table} '${n}' '${v}'`);
        });
        ['system', 'secure', 'global'].forEach(t => {
            if (tables[t].length) {
                script += `\n# ${t.toUpperCase()}\n${tables[t].join('\n')}\n`;
            }
        });
        script += `log -t SetEdit-Pro "Boot script applied successfully"\n`;
        document.getElementById('se-bootscript-content').value = script;
    }

    async function checkBootScriptStatus() {
        const path = '/data/adb/service.d/setedit-boot.sh';        const exists = (await execFn(`test -f '${path}' && echo yes || echo no`)).trim();
        const execPerm = (await execFn(`test -x '${path}' && echo yes || echo no`)).trim();
        return { exists: exists === 'yes', executable: execPerm === 'yes', path };
    }

    async function checkAndShowBootScriptStatus() {
        const statusDiv = document.getElementById('se-bootscript-status');
        const installBtn = document.getElementById('se-btn-install-boot');
        const uninstallBtn = document.getElementById('se-btn-uninstall-boot');
        if (!statusDiv || !installBtn || !uninstallBtn) return;
        try {
            const s = await checkBootScriptStatus();
            if (s.exists) {
                statusDiv.innerHTML = `<div style="background:rgba(50,215,75,0.15);border:1px solid var(--green);padding:10px;border-radius:8px;font-size:11px;color:var(--green);">✅ Installed: <code>${s.path}</code> ${s.executable ? '✓ Executable' : '✗ Not executable'}</div>`;
                installBtn.style.display = 'none'; uninstallBtn.style.display = 'inline-flex';
            } else {
                statusDiv.innerHTML = `<div style="background:rgba(255,159,10,0.15);border:1px solid var(--orange);padding:10px;border-radius:8px;font-size:11px;color:var(--orange);">⚠️ Not installed. Click Install to auto-deploy.</div>`;
                installBtn.style.display = 'inline-flex'; uninstallBtn.style.display = 'none';
            }
        } catch (e) { statusDiv.innerHTML = ''; }
    }

    async function installBootScript() {
        if (!rootAvailable) { toast('❌ Root required', 'error'); return; }
        if (!confirm('️ Install to /data/adb/service.d/setedit-boot.sh?\nThis will run on every boot.')) return;
        toast('🚀 Installing...');
        try {
            const content = document.getElementById('se-bootscript-content').value;
            const path = '/data/adb/service.d/setedit-boot.sh';
            await execFn(`mkdir -p /data/adb/service.d`);
            // Safe heredoc write
            await execFn(`cat > '${path}' << 'SETEOF'\n${content}\nSETEOF`);
            await execFn(`chmod +x '${path}'`);
            const verify = (await execFn(`test -f '${path}' && test -x '${path}' && echo OK || echo FAIL`)).trim();
            if (verify === 'OK') {
                toast('✅ Boot script installed successfully!', 'success', 3000);
                await checkAndShowBootScriptStatus();
            } else { toast('❌ Installation failed', 'error'); }
        } catch (e) { toast(`❌ Error: ${e.message || e}`, 'error'); }
    }

    async function uninstallBootScript() {
        if (!rootAvailable) { toast('❌ Root required', 'error'); return; }
        const path = '/data/adb/service.d/setedit-boot.sh';
        if (!confirm('🗑️ Remove boot script?\nSettings will stop auto-applying at boot.')) return;
        try {
            await execFn(`rm -f '${path}'`);
            const verify = (await execFn(`test -f '${path}' && echo FAIL || echo OK`)).trim();
            if (verify === 'OK') {
                toast('✅ Uninstalled', 'success');                await checkAndShowBootScriptStatus();
            } else { toast('❌ Failed', 'error'); }
        } catch (e) { toast(`❌ Error: ${e.message || e}`, 'error'); }
    }

    async function copyBootScript() {
        const content = document.getElementById('se-bootscript-content').value;
        try { await navigator.clipboard.writeText(content); toast('📋 Copied', 'success'); }
        catch { const ta = document.createElement('textarea'); ta.value = content; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta); toast('📋 Copied', 'success'); }
    }

    function downloadBootScript() {
        const content = document.getElementById('se-bootscript-content').value;
        const blob = new Blob([content], { type: 'text/x-shellscript' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = `setedit-boot-${Date.now()}.sh`; a.click(); URL.revokeObjectURL(url);
        toast('💾 Downloaded', 'success');
    }

    // ========== PROPERTY PARSING & REFRESH ==========
    function parseSettingsOutput(output, tableId) {
        const lines = output.trim().split('\n').filter(l => l.trim());
        const props = [];
        for (const line of lines) {
            const match = line.match(/^([^=:\s]+)\s*[=:]\s*(.+)$/);
            if (match) props.push({ name: match[1].trim(), value: match[2].trim().replace(/^"|"$/g, ''), table: tableId, type: detectValueType(match[2].trim()) });
        }
        return props;
    }

    async function refreshProperties() {
        if (isRefreshing) return;
        const now = Date.now();
        if (now - lastRefreshTime < CFG.REFRESH_COOLDOWN) return;
        isRefreshing = true; lastRefreshTime = now;
        try {
            const grid = document.getElementById('se-grid');
            if (!grid) return;
            if (!allProperties.length) grid.innerHTML = '<div class="se-loading">🔍 Loading...</div>';
            allProperties = [];
            const tablesToFetch = currentTable === 'all' ? CFG.TABLES : CFG.TABLES.filter(t => t.id === currentTable);
            for (const table of tablesToFetch) {
                try {
                    const out = await execFn(table.cmd);
                    if (out?.trim()) allProperties.push(...parseSettingsOutput(out, table.id));
                } catch (e) { console.warn(e); }
            }
            applyFilter(); renderProperties();
            if (!rootAvailable) toast('⚠️ Root recommended', 'warning');
        } catch (e) { toast('❌ Load failed', 'error'); }        finally { isRefreshing = false; }
    }

    function applyFilter() {
        const term = searchTerm.toLowerCase();
        filteredProperties = allProperties.filter(p => {
            const matchesTable = currentTable === 'all' || p.table === currentTable;
            const matchesSearch = !term || p.name.toLowerCase().includes(term) || p.value.toLowerCase().includes(term);
            return matchesTable && matchesSearch;
        });
        if (filteredProperties.length > CFG.MAX_RESULTS) filteredProperties = filteredProperties.slice(0, CFG.MAX_RESULTS);
    }

    function renderProperties() {
        const grid = document.getElementById('se-grid');
        if (!grid) return;
        if (!filteredProperties.length) {
            grid.innerHTML = `<div class="se-status-box"><div class="se-status-icon">🔍</div><div style="color:var(--text-dim)">${searchTerm ? 'No matches' : 'No properties loaded'}</div>${!rootAvailable ? '<div style="margin-top:10px;color:var(--orange);font-size:11px">⚠️ Root access recommended</div>' : ''}</div>`;
            return;
        }
        filteredProperties.sort((a, b) => a.name.localeCompare(b.name));
        grid.innerHTML = filteredProperties.map(p => {
            const sn = p.name.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
            const sv = p.value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
            return `<div class="se-card se-clickable" onclick="SetEdit.editProperty('${sn}', '${p.table}')">
                <div class="se-card-header"><div class="se-prop-name">${p.name}</div><span class="se-prop-table ${p.table}">${p.table}</span></div>
                <div class="se-prop-value ${getValueClass(formatValue(p.value, p.type))}">${formatValue(p.value, p.type)}</div>
                <div class="se-card-actions" onclick="event.stopPropagation();">
                    <button class="se-btn se-btn-secondary se-btn-small" onclick="SetEdit.copyValue('${sn}', '${sv}')">📋 Copy</button>
                </div></div>`;
        }).join('');
        updateCount();
    }

    function updateCount() {
        const el = document.getElementById('se-count');
        if (!el) return;
        const total = currentTable === 'all' ? CFG.TABLES.map(t => allProperties.filter(p => p.table === t.id).length) : [allProperties.length];
        el.textContent = `${filteredProperties.length}/${total.join('+')} shown`;
    }

    // ========== PUBLIC ACTIONS ==========
    async function copyValue(name, value) {
        try { await navigator.clipboard.writeText(value); } catch { const ta = document.createElement('textarea'); ta.value = value; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta); }
        toast(`📋 "${name}" copied`, 'success', 1500);
    }

    function editProperty(name, table) {
        const prop = allProperties.find(p => p.name === name && p.table === table);
        if (!prop) return;        openEditModal(prop.name, prop.table, false);
        setTimeout(() => {
            document.getElementById('se-edit-value').value = prop.value;
            document.getElementById('se-edit-type').value = {boolean:'string',number:'int',float:'float',string:'string'}[detectValueType(prop.value)] || 'string';
        }, 150);
    }

    function addNewProperty() { openEditModal('', currentTable === 'all' ? 'system' : currentTable, true); setTimeout(() => document.getElementById('se-edit-name').focus(), 150); }
    function setTableFilter(id) {
        currentTable = id;
        document.querySelectorAll('.se-tab-btn').forEach(b => b.classList.toggle('active', b.dataset.table === id));
        applyFilter(); renderProperties();
    }
    function setSearchTerm(term) { searchTerm = term; applyFilter(); renderProperties(); }

    async function backupProperties() {
        toast('📦 Creating backup...');
        try {
            const backup = { timestamp: new Date().toISOString(), system: {}, secure: {}, global: {} };
            for (const t of CFG.TABLES) parseSettingsOutput(await execFn(t.cmd), t.id).forEach(p => backup[t.id][p.name] = { value: p.value, type: p.type });
            const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }));
            const a = document.createElement('a'); a.href = url; a.download = `setedit-backup-${Date.now()}.json`; a.click(); URL.revokeObjectURL(url);
            toast('✅ Backup saved', 'success');
        } catch (e) { toast(`❌ ${e.message || e}`, 'error'); }
    }

    async function restoreProperties(file) {
        if (!file || !confirm('️ Overwrite existing properties?')) return;
        toast('📦 Restoring...');
        try {
            const backup = JSON.parse(await file.text());
            let ok = 0, fail = 0;
            for (const [tid, props] of Object.entries(backup)) {
                if (!CFG.TABLES.find(t => t.id === tid)) continue;
                for (const [name, data] of Object.entries(props)) {
                    try { await execFn(`settings put ${tid} '${name.replace(/'/g, "'\\''")}' '${String(data.value).replace(/'/g, "'\\''")}'`); ok++; } catch { fail++; }
                }
            }
            toast(`✅ Restored ${ok}${fail ? ` (${fail} failed)` : ''}`, fail ? 'warning' : 'success');
            await refreshProperties();
        } catch (e) { toast(`❌ ${e.message || e}`, 'error'); }
    }

    // ========== UI CREATION ==========
    function createUI(container) {
        container.innerHTML = `
            <div class="se-root">
                <div class="se-header">
                    <h1>⚙️ SetEdit Pro</h1>
                    <div style="display:flex;gap:6px;flex-wrap:wrap;">                        <button class="se-btn se-btn-secondary se-btn-small" onclick="SetEdit.backupProperties()">📦 Backup</button>
                        <label class="se-btn se-btn-secondary se-btn-small" style="cursor:pointer"> Restore<input type="file" accept=".json" style="display:none" onchange="SetEdit.restoreProperties(this.files[0])"></label>
                        <button class="se-btn se-btn-warning se-btn-small" onclick="SetEdit.openBootScriptModal()">🚀 Boot Script</button>
                    </div>
                </div>
                <div class="se-search-box">
                    <input type="text" class="se-search-input" id="se-search" placeholder="🔍 Search properties..." oninput="SetEdit.setSearchTerm(this.value)">
                    <button class="se-btn se-btn-primary" onclick="SetEdit.addNewProperty()">➕ Add</button>
                </div>
                <div class="se-table-tabs">
                    <button class="se-tab-btn active" data-table="all" onclick="SetEdit.setTableFilter('all')">All<span class="se-count-badge" id="se-count">0</span></button>
                    ${CFG.TABLES.map(t => `<button class="se-tab-btn" data-table="${t.id}" onclick="SetEdit.setTableFilter('${t.id}')">${t.name}</button>`).join('')}
                </div>
                <div id="se-grid" class="se-grid"><div class="se-loading">🔍 Loading...</div></div>
            </div>`;
    }

    // ========== INIT & SETUP ==========
    function startAutoRefresh() {
        if (refreshInterval) clearInterval(refreshInterval);
        refreshProperties();
        refreshInterval = setInterval(() => { if (!document.hidden && !editTarget) refreshProperties(); }, CFG.REFRESH_INTERVAL);
    }

    function setupSetEditModal() {
        const btn = document.getElementById('setedit-btn');
        if (!btn) return;
        if (!document.getElementById('se-modal-container')) {
            const modal = document.createElement('div');
            modal.id = 'se-modal-container';
            modal.style.cssText = 'position:fixed;inset:0;background:#000;z-index:10000;display:none;overflow-y:auto;font-family:sans-serif;';
            modal.innerHTML = `
                <div style="position:sticky;top:0;background:rgba(0,0,0,0.95);padding:12px 16px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #3a3a3c;z-index:10;backdrop-filter:blur(10px);">
                    <h2 style="color:#fff;margin:0;font-size:16px;font-weight:700">⚙️ SetEdit Pro</h2>
                    <button id="se-close-btn" style="background:#3a3a3c;color:#fff;border:none;padding:6px 14px;border-radius:8px;cursor:pointer;font-size:12px">Close</button>
                </div>
                <div id="se-modal-root" style="padding-bottom:20px;"></div>`;
            document.body.appendChild(modal);
            document.getElementById('se-close-btn').onclick = () => { modal.style.display = 'none'; closeEditModal(); closeBootScriptModal(); };
        }
        btn.onclick = async () => {
            const modal = document.getElementById('se-modal-container');
            const root = document.getElementById('se-modal-root');
            modal.style.display = 'block';
            if (!root.hasChildNodes()) {
                injectStyles(); createUI(root);
                try { rootAvailable = (await execFn('id')).includes('uid=0'); } catch { rootAvailable = false; }
                if (!rootAvailable) toast('⚠️ Root recommended', 'warning', 4000);
                startAutoRefresh();
            }        };
    }

    // ========== PUBLIC API ==========
    window.SetEdit = {
        init: (containerId) => {
            injectStyles();
            const c = document.getElementById(containerId);
            if (!c) { console.error('SetEdit: Container not found'); return; }
            createUI(c);
            execFn('id').then(t => { rootAvailable = t.includes('uid=0'); if (!rootAvailable) toast('⚠️ Root recommended', 'warning', 4000); });
            startAutoRefresh();
        },
        refreshProperties, setTableFilter, setSearchTerm, editProperty, addNewProperty, copyValue,
        backupProperties, restoreProperties, openEditModal, closeEditModal, saveProperty, deleteProperty,
        openBootScriptModal, closeBootScriptModal, generateBootScript, copyBootScript, downloadBootScript,
        installBootScript, uninstallBootScript, checkBootScriptStatus,
        getAllProperties: () => [...allProperties], isRootAvailable: () => rootAvailable
    };

    document.addEventListener('DOMContentLoaded', setupSetEditModal);
})();