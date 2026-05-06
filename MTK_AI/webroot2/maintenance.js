// maintenance.js - System Maintenance Manager for Tools Page (FIXED)
(function() {
    'use strict';

    const CONFIG_FILE = '/sdcard/MTK_AI_Engine/maintenance.conf';
    const BACKUP_DIR = '/sdcard/MTK_AI_Engine/backups';
    
    const DEFAULT_TASKS = {
        update_backups: false, backup_apps: false, fix_permissions: true,
        clear_caches: true, optimize_apps: true, optimize_db: true,
        backup_sms: false, backup_calllog: false, backup_contacts: false,
        backup_calendars: false, backup_wifi: false, clean_memory: true,
        clean_system_apps: false, trim_partitions: true, clear_clipboard: true,
        clean_dalvik: false, wipe_dalvik_reboot: false, show_notification: true
    };

    let taskStates = { ...DEFAULT_TASKS };

    const execFn = window.exec || async function(cmd, timeout = 10000) {
        return new Promise(resolve => {
            const cb = `maint_exec_${Date.now()}_${Math.random().toString(36).substring(2)}`;
            const t = setTimeout(() => { delete window[cb]; resolve(''); }, timeout);
            window[cb] = (_, res) => { clearTimeout(t); delete window[cb]; resolve(res || ''); };
            if (window.ksu) ksu.exec(cmd, `window.${cb}`);
            else { clearTimeout(t); resolve(''); }
        });
    };

    async function init() {
        await loadConfig();
        bindClickHandler();
    }

    async function loadConfig() {
        try {
            const raw = await execFn(`cat ${CONFIG_FILE} 2>/dev/null`);
            if (raw && raw.trim()) {
                raw.trim().split('\n').forEach(line => {
                    const [key, val] = line.split('=');
                    if (key && val !== undefined) taskStates[key] = val.trim() === 'true';
                });
            }
        } catch (e) { console.warn('Maintenance: Config load failed:', e); }
    }

    async function saveConfig() {
        try {
            const config = Object.entries(taskStates).map(([k, v]) => `${k}=${v}`).join('\n');
            await execFn(`mkdir -p /sdcard/MTK_AI_Engine && echo "${config}" > ${CONFIG_FILE}`);
        } catch (e) { console.warn('Maintenance: Config save failed:', e); }    }

    function bindClickHandler() {
        const btn = document.getElementById('maintenance-btn');
        if (!btn) return;
        btn.addEventListener('click', () => showMaintenanceModal());
    }

    function showMaintenanceModal() {
        const existing = document.getElementById('maintenance-modal');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = 'maintenance-modal';
        modal.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,0.9);z-index:10000;display:flex;align-items:flex-end;justify-content:center;backdrop-filter:blur(5px);`;

        const box = document.createElement('div');
        box.style.cssText = `background:linear-gradient(135deg,#1a1f3a,#2d3561);border:2px solid #4a9eff;border-radius:20px 20px 0 0;padding:20px;width:100%;max-width:600px;box-shadow:0 0 40px rgba(74,158,255,0.2);max-height:85vh;overflow-y:auto;`;

        // Toggle generator (NO inline handlers)
        const createToggle = (id, label, desc) => {
            const on = taskStates[id];
            return `
            <div class="task-item" data-task="${id}" style="background:${on?'rgba(74,158,255,0.15)':'rgba(255,255,255,0.05)'};border:${on?'1px solid rgba(74,158,255,0.5)':'1px solid transparent'};border-radius:10px;padding:12px;margin-bottom:8px;transition:all 0.2s;">
                <div style="display:flex;justify-content:space-between;align-items:center;">
                    <div style="flex:1;">
                        <div class="task-title" style="color:${on?'#4a9eff':'#fff'};font-size:13px;font-weight:600;margin-bottom:2px;">${label}</div>
                        ${desc ? `<div style="color:#8b92b4;font-size:11px;">${desc}</div>` : ''}
                    </div>
                    <label class="toggle-wrap" style="position:relative;display:inline-block;width:50px;height:26px;cursor:pointer;">
                        <input type="checkbox" class="task-checkbox" data-task="${id}" style="opacity:0;width:0;height:0;">
                        <span class="toggle-slider" style="position:absolute;cursor:pointer;top:0;left:0;right:0;bottom:0;background-color:${on?'#4a9eff':'#555'};transition:.3s;border-radius:26px;box-shadow:${on?'0 0 8px rgba(74,158,255,0.6)':'none'};"></span>
                        <span class="toggle-knob" id="knob-${id}" style="position:absolute;height:20px;width:20px;left:3px;bottom:3px;background-color:white;transition:.3s;border-radius:50%;transform:${on?'translateX(24px)':'translateX(0)'};"></span>
                    </label>
                </div>
            </div>`;
        };

        box.innerHTML = `
            <h3 style="color:#4a9eff;margin:0 0 5px;font-size:18px;text-align:center;">🔧 Maintenance Tasks</h3>
            <p style="color:#8b92b4;font-size:11px;text-align:center;margin-bottom:15px;">Select tasks to perform now</p>
            <div id="task-list">
                <div style="color:#4a9eff;font-size:12px;font-weight:600;margin:10px 0 5px;padding-left:5px;">Backup & Optimization</div>
                ${createToggle('update_backups','Update existing backups','Refresh current backup files')}
                ${createToggle('backup_apps','Backup all user apps','Create APK backups of installed apps')}
                ${createToggle('fix_permissions','Fix permissions','Repair app & file permissions')}
                ${createToggle('clear_caches','Clear caches','Remove app cache files')}
                ${createToggle('optimize_apps','Optimize apps loading','Run dexopt on installed apps')}
                ${createToggle('optimize_db','Optimize database accesses','Vacuum & optimize app databases')}
                <div style="color:#4a9eff;font-size:12px;font-weight:600;margin:15px 0 5px;padding-left:5px;">Data Backup</div>                ${createToggle('backup_sms','Backup SMS','Save text messages to backup')}
                ${createToggle('backup_calllog','Backup call-log','Save call history')}
                ${createToggle('backup_contacts','Backup contacts','Export contacts to VCF')}
                ${createToggle('backup_calendars','Backup calendars','Save calendar events')}
                ${createToggle('backup_wifi','Backup Wi-Fi settings','Save WiFi configurations')}
                <div style="color:#4a9eff;font-size:12px;font-weight:600;margin:15px 0 5px;padding-left:5px;">System Cleanup</div>
                ${createToggle('clean_memory','Clean memory','Free up RAM')}
                ${createToggle('clean_system_apps','Clean updated system apps','Remove system app updates')}
                ${createToggle('trim_partitions','Trim all partitions','Run fstrim on storage')}
                ${createToggle('clear_clipboard','Clear clipboard','Clear clipboard history')}
                ${createToggle('clean_dalvik','Clean dalvik','Remove dalvik cache files')}
                ${createToggle('wipe_dalvik_reboot','Wipe dalvik (auto-reboot)','Full dalvik wipe + reboot')}
                <div style="color:#4a9eff;font-size:12px;font-weight:600;margin:15px 0 5px;padding-left:5px;">Options</div>
                ${createToggle('show_notification','Show results in notification','Display completion status')}
            </div>
            <div id="maint-status" style="text-align:center;font-size:12px;color:#666;margin-bottom:12px;min-height:40px;padding:10px;background:rgba(0,0,0,0.3);border-radius:10px;display:none;"></div>
            <div style="display:flex;gap:8px;margin-top:15px;">
                <button id="maint-cancel-btn" style="flex:1;padding:14px;background:rgba(255,255,255,0.1);color:#fff;border:none;border-radius:12px;font-size:14px;font-weight:600;cursor:pointer;">Cancel</button>
                <button id="maint-run-btn" style="flex:2;padding:14px;background:linear-gradient(135deg,#4a9eff,#2980b9);color:#fff;border:none;border-radius:12px;font-size:14px;font-weight:700;cursor:pointer;">▶ Run Selected Tasks</button>
            </div>
            <div style="margin-top:12px;padding:10px;background:rgba(241,196,15,0.1);border:1px solid rgba(241,196,15,0.3);border-radius:8px;font-size:10px;color:#f1c40f;line-height:1.4;">
                ⚠️ <strong>Warning:</strong> Some tasks require root access. Ensure backups exist before proceeding.
            </div>
        `;

        modal.appendChild(box);
        document.body.appendChild(modal);
        modal.onclick = e => { if (e.target === modal) modal.remove(); };

        // ✅ FIX: Attach events AFTER DOM insertion (prevents double-click bug)
        box.querySelectorAll('.task-checkbox').forEach(cb => {
            cb.checked = taskStates[cb.dataset.task] || false;
            cb.addEventListener('change', handleToggleChange);
        });

        document.getElementById('maint-cancel-btn').onclick = () => modal.remove();
        document.getElementById('maint-run-btn').onclick = () => runMaintenanceTasks();
    }

    // ✅ Clean single-click handler
    function handleToggleChange(e) {
        const id = e.target.dataset.task;
        const isChecked = e.target.checked;
        taskStates[id] = isChecked;
        saveConfig();
        updateTaskVisuals(id, isChecked);
    }

    function updateTaskVisuals(id, isEnabled) {
        const item = document.querySelector(`.task-item[data-task="${id}"]`);        if (!item) return;
        
        item.style.background = isEnabled ? 'rgba(74,158,255,0.15)' : 'rgba(255,255,255,0.05)';
        item.style.border = isEnabled ? '1px solid rgba(74,158,255,0.5)' : '1px solid transparent';
        
        const title = item.querySelector('.task-title');
        if (title) title.style.color = isEnabled ? '#4a9eff' : '#fff';
        
        const slider = item.querySelector('.toggle-slider');
        if (slider) {
            slider.style.backgroundColor = isEnabled ? '#4a9eff' : '#555';
            slider.style.boxShadow = isEnabled ? '0 0 8px rgba(74,158,255,0.6)' : 'none';
        }
        
        const knob = document.getElementById(`knob-${id}`);
        if (knob) knob.style.transform = isEnabled ? 'translateX(24px)' : 'translateX(0)';
    }

    async function runMaintenanceTasks() {
        const statusEl = document.getElementById('maint-status');
        const runBtn = document.getElementById('maint-run-btn');
        const cancelBtn = document.getElementById('maint-cancel-btn');
        
        const selected = Object.entries(taskStates).filter(([_, v]) => v).map(([k]) => k);
        if (selected.length === 0) {
            statusEl.style.display = 'block';
            statusEl.innerHTML = '<span style="color:#FF453A;">⚠️ No tasks selected</span>';
            return;
        }

        runBtn.disabled = true; runBtn.innerHTML = '⏳ Running...';
        cancelBtn.disabled = true;
        statusEl.style.display = 'block';
        statusEl.innerHTML = `<span style="color:#4a9eff;">🔄 Starting ${selected.length} tasks...</span>`;

        let completed = 0, errors = [];
        try {
            await execFn(`mkdir -p ${BACKUP_DIR}`);
            for (const task of selected) {
                try {
                    statusEl.innerHTML = `<span style="color:#FF9F0A;"> ${formatName(task)}...</span>`;
                    await executeTask(task);
                    completed++;
                    statusEl.innerHTML = `<span style="color:#32D74B;">✓ ${formatName(task)}</span>`;
                    await new Promise(r => setTimeout(r, 300));
                } catch (e) {
                    errors.push(`${task}: ${e.message}`);
                    statusEl.innerHTML = `<span style="color:#FF453A;">✗ ${formatName(task)}</span>`;
                    await new Promise(r => setTimeout(r, 300));
                }            }
            
            statusEl.innerHTML = `<span style="color:#32D74B;">✅ ${completed}/${selected.length} completed</span>${errors.length?`<br><small style="color:#FF453A">${errors.length} errors</small>`:''}`;
            if (taskStates.show_notification && window.showStatus) window.showStatus(`✅ ${completed} tasks done`, '#4a9eff');
            
            if (taskStates.wipe_dalvik_reboot) {
                statusEl.innerHTML += '<br><span style="color:#FF9F0A;">🔄 Rebooting...</span>';
                await new Promise(r => setTimeout(r, 2000));
                await execFn('su -c "reboot"');
            }
            setTimeout(() => document.getElementById('maintenance-modal')?.remove(), 2500);
        } catch (e) {
            statusEl.innerHTML = `<span style="color:#FF453A;">❌ ${e.message}</span>`;
            runBtn.disabled = false; runBtn.innerHTML = '▶ Run Selected Tasks';
            cancelBtn.disabled = false;
        }
    }

    async function executeTask(task) {
        const cmd = {
            update_backups: `cp -r /data/data ${BACKUP_DIR}/apps_data 2>/dev/null || true`,
            backup_apps: `pm list packages -3 | cut -d: -f2 | head -5 | while read p; do pm path $p | cut -d: -f2 | xargs -I{} cp {} ${BACKUP_DIR}/ 2>/dev/null; done`,
            fix_permissions: `su -c "chmod -R 755 /data/data /sdcard 2>/dev/null || true"`,
            clear_caches: `su -c "pm trim-caches 999999999" 2>/dev/null || true`,
            optimize_apps: `su -c "cmd package bg-dexopt-job" 2>/dev/null || true`,
            optimize_db: `find /data/data -name "*.db" -type f 2>/dev/null | head -10 | while read f; do su -c "sqlite3 \"$f\" VACUUM" 2>/dev/null; done`,
            backup_sms: `content query --uri content://sms > ${BACKUP_DIR}/sms.txt 2>/dev/null || true`,
            backup_calllog: `content query --uri content://call_log/calls > ${BACKUP_DIR}/calls.txt 2>/dev/null || true`,
            backup_contacts: `content query --uri content://contacts/raw > ${BACKUP_DIR}/contacts.txt 2>/dev/null || true`,
            backup_calendars: `content query --uri content://com.android.calendar/events > ${BACKUP_DIR}/cal.txt 2>/dev/null || true`,
            backup_wifi: `su -c "cp /data/misc/wifi/WifiConfigStore.xml ${BACKUP_DIR}/ 2>/dev/null" || true`,
            clean_memory: `sync && echo 3 > /proc/sys/vm/drop_caches 2>/dev/null || true`,
            clean_system_apps: `pm clear $(pm list packages -s | cut -d: -f2 | head -5) 2>/dev/null || true`,
            trim_partitions: `su -c "fstrim -v /data /system 2>/dev/null" || true`,
            clear_clipboard: `am broadcast -a com.android.internal.intent.action.CLEAR_CLIPBOARD 2>/dev/null || true`,
            clean_dalvik: `su -c "rm -rf /data/dalvik-cache/* /data/art-cache/* 2>/dev/null" || true`,
            wipe_dalvik_reboot: `su -c "rm -rf /data/dalvik-cache/* /data/art-cache/* /cache/dalvik-cache/* 2>/dev/null" || true`
        };
        if (cmd[task]) await execFn(cmd[task]);
    }

    function formatName(t) { return t.split('_').map(w => w[0].toUpperCase() + w.slice(1)).join(' '); }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();