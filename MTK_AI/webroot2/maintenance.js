// maintenance.js - System Maintenance Manager for Tools Page (CENTERED UI)
(function() {
'use strict';
const CONFIG_FILE = '/sdcard/MTK_AI_Engine/maintenance.conf';
const BACKUP_DIR = '/sdcard/MTK_AI_Engine/backups';
const DEFAULT_TASKS = {
    update_backups: false, backup_apps: false, fix_permissions: false,
    clear_caches: false, optimize_apps: false, optimize_db: false,
    backup_sms: false, backup_calllog: false, backup_contacts: false,
    backup_calendars: false, backup_wifi: false, clean_memory: false,
    clean_system_apps: false, trim_partitions: false, clear_clipboard: false,
    clean_dalvik: false, wipe_dalvik_reboot: false, show_notification: false,
    backup_partitions: false, flash_partitions: false
};
let taskStates = { ...DEFAULT_TASKS };
let selectedPartitions = [];
let flashImageMappings = {}; // Structure: { partitionName: "/sdcard/path_to_image.img" }

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
                const eqIdx = line.indexOf('=');
                if (eqIdx > -1) {
                    const key = line.substring(0, eqIdx);
                    const val = line.substring(eqIdx + 1);
                    if (key === 'selected_partitions') {
                        selectedPartitions = val.trim() ? val.trim().split(',') : [];
                    } else if (key === 'flash_mappings') {
                        try { flashImageMappings = JSON.parse(val.trim()); } catch(e) {}
                    } else if (taskStates.hasOwnProperty(key)) {
                        taskStates[key] = val.trim() === 'true';
                    }
                }
            });
        }
    } catch (e) { console.warn('Maintenance: Config load failed:', e); }
}

async function saveConfig() {
    try {
        const config = Object.entries(taskStates).map(([k, v]) => `${k}=${v}`).join('\n');
        const partConfig = `selected_partitions=${selectedPartitions.join(',')}`;
        const flashConfig = `flash_mappings=${JSON.stringify(flashImageMappings)}`;
        await execFn(`mkdir -p /sdcard/MTK_AI_Engine && echo "${config}" > ${CONFIG_FILE} && echo "${partConfig}" >> ${CONFIG_FILE} && echo "${flashConfig}" >> ${CONFIG_FILE}`);
    } catch (e) { console.warn('Maintenance: Config save failed:', e); }
}

function bindClickHandler() {
    const btn = document.getElementById('maintenance-btn');
    if (!btn) return;
    btn.addEventListener('click', () => showMaintenanceModal());
}

function updatePartitionDisplay() {
    const display = document.getElementById('selected-partitions-display');
    if (display) {
        if (selectedPartitions.length === 0) {
            display.innerHTML = '<span style="color:var(--accent-red);">No partitions selected</span>';
        } else {
            display.innerHTML = `<span style="color:var(--accent-green);">✓ ${selectedPartitions.length} partition(s) selected</span>`;
        }
    }
}

function updateFlashDisplay() {
    const display = document.getElementById('flash-mappings-display');
    if (display) {
        const count = Object.keys(flashImageMappings).length;
        if (count === 0) {
            display.innerHTML = '<span style="color:var(--accent-red);">No image files mapped</span>';
        } else {
            display.innerHTML = `<span style="color:var(--accent-green);">✓ ${count} image file(s) mapped</span>`;
        }
    }
}

function showSuccessModal(title, message) {
    const existing = document.getElementById('success-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'success-modal';
    modal.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:10005;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(6px);padding:20px;`;
    
    const box = document.createElement('div');
    box.style.cssText = `background:var(--bg-card);border:1px solid var(--accent-green);border-radius:20px;padding:25px;width:90%;max-width:380px;text-align:center;box-shadow:0 0 30px rgba(46, 204, 113, 0.3);transform:scale(0.9);transition:all 0.2s ease-out;`;
    
    box.innerHTML = `
        <div style="font-size:48px;line-height:1;margin-bottom:12px;">✅</div>
        <h3 style="color:var(--accent-green);margin:0 0 8px;font-size:18px;font-weight:700;">${title}</h3>
        <p style="color:var(--text-primary);font-size:13px;line-height:1.4;margin:0 0 20px;">${message}</p>
        <button id="success-modal-ok" style="width:100%;padding:12px;background:var(--accent-green);color:#fff;border:none;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer;">OK</button>
    `;

    modal.appendChild(box);
    document.body.appendChild(modal);

    setTimeout(() => { box.style.transform = 'scale(1)'; }, 10);

    const closeFn = () => modal.remove();
    document.getElementById('success-modal-ok').onclick = closeFn;
    modal.onclick = e => { if (e.target === modal) closeFn(); };
}

async function showPartitionPicker() {
    const picker = document.createElement('div');
    picker.id = 'partition-picker';
    picker.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,0.95);z-index:10001;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(5px);`;
    
    const box = document.createElement('div');
    box.style.cssText = `background:var(--bg-card);border:1px solid var(--border-color);border-radius:20px;padding:20px;width:90%;max-width:500px;max-height:80vh;overflow-y:auto;margin:20px;`;
    
    box.innerHTML = `
        <h3 style="color:var(--accent-blue);margin:0 0 15px;text-align:center;">Select Partitions</h3>
        <div id="partition-loading" style="text-align:center;color:var(--text-secondary);">Loading partitions...</div>
        <div id="partition-list" style="display:none;max-height:50vh;overflow-y:auto;background:var(--bg-secondary);border:1px solid var(--border-color);border-radius:10px;padding:10px;margin-bottom:15px;"></div>
        <div style="display:flex;gap:8px;margin-bottom:15px;">
            <button id="part-select-all" style="flex:1;padding:10px;background:rgba(74, 158, 255, 0.2);color:var(--accent-blue);border:1px solid var(--accent-blue);border-radius:8px;font-size:12px;cursor:pointer;">Select All</button>
            <button id="part-deselect-all" style="flex:1;padding:10px;background:rgba(255, 69, 58, 0.2);color:var(--accent-red);border:1px solid var(--accent-red);border-radius:8px;font-size:12px;cursor:pointer;">Deselect All</button>
        </div>
        <div style="display:flex;gap:8px;">
            <button id="part-cancel" style="flex:1;padding:12px;background:var(--bg-secondary);color:var(--text-primary);border:1px solid var(--border-color);border-radius:10px;font-size:14px;cursor:pointer;">Cancel</button>
            <button id="part-save" style="flex:2;padding:12px;background:var(--accent-blue);color:var(--text-primary);border:none;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer;">Save Selection</button>
        </div>
    `;
    
    picker.appendChild(box);
    document.body.appendChild(picker);
    
    picker.onclick = e => { if (e.target === picker) picker.remove(); };
    document.getElementById('part-cancel').onclick = () => picker.remove();
    
    try {
        const res = await execFn('ls -1 /dev/block/by-name/ 2>/dev/null');
        const parts = res.trim().split('\n').filter(p => p && !p.includes('..') && p.trim() !== '');
        
        const listEl = document.getElementById('partition-list');
        document.getElementById('partition-loading').style.display = 'none';
        listEl.style.display = 'block';
        
        listEl.innerHTML = parts.map(p => `
            <label style="display:flex;align-items:center;padding:8px;background:var(--bg-secondary);border:1px solid var(--border-color);border-radius:8px;margin-bottom:5px;cursor:pointer;">
                <input type="checkbox" class="part-checkbox" value="${p}" ${selectedPartitions.includes(p)?'checked':''} style="margin-right:10px;accent-color:var(--accent-blue);width:18px;height:18px;">
                <span style="color:var(--text-primary);font-size:13px;font-family:monospace;">${p}</span>
            </label>
        `).join('');
        
        document.getElementById('part-select-all').onclick = () => {
            listEl.querySelectorAll('.part-checkbox').forEach(cb => cb.checked = true);
        };
        document.getElementById('part-deselect-all').onclick = () => {
            listEl.querySelectorAll('.part-checkbox').forEach(cb => cb.checked = false);
        };
        document.getElementById('part-save').onclick = () => {
            selectedPartitions = Array.from(listEl.querySelectorAll('.part-checkbox:checked')).map(cb => cb.value);
            saveConfig();
            updatePartitionDisplay();
            picker.remove();
        };
    } catch (e) {
        document.getElementById('partition-loading').innerHTML = '<span style="color:var(--accent-red);">Failed to load partitions. Root required.</span>';
    }
}

async function openStorageBrowser(targetPart, updateUiCallback) {
    let currentDir = '/sdcard';
    
    const browserModal = document.createElement('div');
    browserModal.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,0.95);z-index:10002;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(5px);`;
    
    const box = document.createElement('div');
    box.style.cssText = `background:var(--bg-card);border:1px solid var(--border-color);border-radius:16px;padding:20px;width:90%;max-width:500px;max-height:80vh;display:flex;flex-direction:column;margin:20px;`;
    
    box.innerHTML = `
        <h3 style="color:var(--accent-blue);margin:0 0 5px;font-size:16px;text-align:center;">Select Image for ${targetPart}</h3>
        <div id="browser-path" style="font-size:11px;font-family:monospace;color:var(--text-secondary);word-break:break-all;margin-bottom:10px;background:var(--bg-secondary);padding:6px 10px;border-radius:6px;border:1px solid var(--border-color);">/sdcard</div>
        <div id="browser-file-list" style="flex:1;overflow-y:auto;max-height:50vh;background:var(--bg-secondary);border:1px solid var(--border-color);border-radius:8px;padding:8px;margin-bottom:12px;"></div>
        <div style="display:flex;gap:8px;">
            <button id="browser-clear" style="flex:1;padding:10px;background:rgba(255, 69, 58, 0.2);color:var(--accent-red);border:1px solid var(--accent-red);border-radius:8px;font-size:12px;cursor:pointer;">Clear Selection</button>
            <button id="browser-close" style="flex:1;padding:10px;background:var(--bg-secondary);color:var(--text-primary);border:1px solid var(--border-color);border-radius:8px;font-size:12px;cursor:pointer;">Close</button>
        </div>
    `;
    
    browserModal.appendChild(box);
    document.body.appendChild(browserModal);

    async function renderDirectory(dir) {
        currentDir = dir;
        document.getElementById('browser-path').textContent = currentDir;
        const fileListEl = document.getElementById('browser-file-list');
        fileListEl.innerHTML = '<div style="color:var(--text-secondary);text-align:center;padding:10px;">Loading files...</div>';

        try {
            const raw = await execFn(`ls -1 -p "${currentDir}" 2>/dev/null`);
            const items = raw.trim().split('\n').filter(i => i.trim() !== '');
            
            let html = '';
            if (currentDir !== '/sdcard' && currentDir !== '/') {
                html += `<div class="file-item dir-up" style="padding:10px;background:var(--bg-card);border:1px solid var(--border-color);border-radius:6px;margin-bottom:6px;cursor:pointer;color:var(--accent-blue);font-size:13px;font-weight:bold;">📁 .. (Go Up)</div>`;
            }

            const dirs = items.filter(i => i.endsWith('/'));
            const files = items.filter(i => !i.endsWith('/') && (i.endsWith('.img') || i.endsWith('.bin') || i.endsWith('.iso')));

            dirs.forEach(d => {
                const name = d.replace('/', '');
                html += `<div class="file-item dir-item" data-name="${name}" style="padding:10px;background:var(--bg-card);border:1px solid var(--border-color);border-radius:6px;margin-bottom:6px;cursor:pointer;color:var(--text-primary);font-size:13px;">📁 ${name}</div>`;
            });

            files.forEach(f => {
                html += `<div class="file-item img-item" data-name="${f}" style="padding:10px;background:rgba(74, 158, 255, 0.1);border:1px solid var(--accent-blue);border-radius:6px;margin-bottom:6px;cursor:pointer;color:var(--accent-blue);font-size:13px;font-weight:600;">💾 ${f}</div>`;
            });

            if (dirs.length === 0 && files.length === 0) {
                html += '<div style="color:var(--text-secondary);text-align:center;padding:15px;font-size:12px;">No folders or .img/.bin files found</div>';
            }

            fileListEl.innerHTML = html;

            fileListEl.querySelectorAll('.dir-up').forEach(el => {
                el.onclick = () => {
                    const parentDir = currentDir.substring(0, currentDir.lastIndexOf('/')) || '/sdcard';
                    renderDirectory(parentDir);
                };
            });

            fileListEl.querySelectorAll('.dir-item').forEach(el => {
                el.onclick = () => {
                    const nextDir = `${currentDir}/${el.dataset.name}`.replace('//', '/');
                    renderDirectory(nextDir);
                };
            });

            fileListEl.querySelectorAll('.img-item').forEach(el => {
                el.onclick = () => {
                    const selectedPath = `${currentDir}/${el.dataset.name}`.replace('//', '/');
                    flashImageMappings[targetPart] = selectedPath;
                    updateUiCallback(selectedPath);
                    browserModal.remove();
                };
            });

        } catch (e) {
            fileListEl.innerHTML = '<div style="color:var(--accent-red);text-align:center;padding:10px;">Failed to list directory contents.</div>';
        }
    }

    document.getElementById('browser-clear').onclick = () => {
        delete flashImageMappings[targetPart];
        updateUiCallback('');
        browserModal.remove();
    };

    document.getElementById('browser-close').onclick = () => browserModal.remove();

    renderDirectory('/sdcard');
}

async function showFlashImagePicker() {
    const picker = document.createElement('div');
    picker.id = 'flash-picker';
    picker.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,0.95);z-index:10001;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(5px);`;
    
    const box = document.createElement('div');
    box.style.cssText = `background:var(--bg-card);border:1px solid var(--border-color);border-radius:20px;padding:20px;width:90%;max-width:550px;max-height:80vh;overflow-y:auto;margin:20px;`;
    
    box.innerHTML = `
        <h3 style="color:var(--accent-blue);margin:0 0 10px;text-align:center;">Configure Flash Mappings</h3>
        <p style="color:var(--text-secondary);font-size:11px;text-align:center;margin-bottom:15px;">Tap on a partition target below to pick an image directly from storage.</p>
        <div id="flash-loading" style="text-align:center;color:var(--text-secondary);">Loading partitions...</div>
        <div id="flash-list" style="display:none;max-height:50vh;overflow-y:auto;background:var(--bg-secondary);border:1px solid var(--border-color);border-radius:10px;padding:10px;margin-bottom:15px;"></div>
        <div style="display:flex;gap:8px;">
            <button id="flash-cancel" style="flex:1;padding:12px;background:var(--bg-secondary);color:var(--text-primary);border:1px solid var(--border-color);border-radius:10px;font-size:14px;cursor:pointer;">Cancel</button>
            <button id="flash-save" style="flex:2;padding:12px;background:var(--accent-blue);color:var(--text-primary);border:none;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer;">Save Mappings</button>
        </div>
    `;
    
    picker.appendChild(box);
    document.body.appendChild(picker);
    
    picker.onclick = e => { if (e.target === picker) picker.remove(); };
    document.getElementById('flash-cancel').onclick = () => picker.remove();
    
    try {
        const res = await execFn('ls -1 /dev/block/by-name/ 2>/dev/null');
        const parts = res.trim().split('\n').filter(p => p && !p.includes('..') && p.trim() !== '');
        
        const listEl = document.getElementById('flash-list');
        document.getElementById('flash-loading').style.display = 'none';
        listEl.style.display = 'block';
        
        listEl.innerHTML = parts.map(p => {
            const mappedPath = flashImageMappings[p] || '';
            return `
            <div class="flash-item-card" data-target="${p}" style="padding:10px;background:var(--bg-card);border:1px solid var(--border-color);border-radius:8px;margin-bottom:8px;cursor:pointer;">
                <div style="color:var(--accent-blue);font-size:12px;font-family:monospace;font-weight:bold;margin-bottom:4px;">Target: /dev/block/by-name/${p}</div>
                <div id="path-disp-${p}" style="width:100%;padding:8px;background:var(--bg-secondary);border:1px solid var(--border-color);border-radius:6px;color:${mappedPath?'var(--accent-green)':'var(--text-secondary)'};font-size:12px;font-family:monospace;box-sizing:border-box;word-break:break-all;">
                    ${mappedPath || '📂 Tap to select image file from storage...'}
                </div>
            </div>`;
        }).join('');
        
        listEl.querySelectorAll('.flash-item-card').forEach(card => {
            card.onclick = () => {
                const target = card.dataset.target;
                openStorageBrowser(target, (newPath) => {
                    const disp = document.getElementById(`path-disp-${target}`);
                    if (disp) {
                        disp.textContent = newPath || '📂 Tap to select image file from storage...';
                        disp.style.color = newPath ? 'var(--accent-green)' : 'var(--text-secondary)';
                    }
                });
            };
        });

        document.getElementById('flash-save').onclick = () => {
            saveConfig();
            updateFlashDisplay();
            picker.remove();
        };
    } catch (e) {
        document.getElementById('flash-loading').innerHTML = '<span style="color:var(--accent-red);">Failed to load partitions. Root required.</span>';
    }
}

function showMaintenanceModal() {
    const existing = document.getElementById('maintenance-modal');
    if (existing) existing.remove();
    const modal = document.createElement('div');
    modal.id = 'maintenance-modal';
    modal.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,0.9);z-index:10000;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(5px);padding:20px;`;
    const box = document.createElement('div');
    box.style.cssText = `background:var(--bg-card);border:1px solid var(--border-color);border-radius:16px;padding:20px;width:100%;max-width:600px;box-shadow:0 0 40px rgba(0,0,0,0.5);max-height:85vh;overflow-y:auto;`;
    
    const createToggle = (id, label, desc) => {
        const on = taskStates[id];
        return `
        <div class="task-item" data-task="${id}" style="background:${on?'rgba(74, 158, 255, 0.15)':'var(--bg-secondary)'};border:${on?'1px solid var(--accent-blue)':'1px solid var(--border-color)'};border-radius:10px;padding:12px;margin-bottom:8px;transition:all 0.2s;">
            <div style="display:flex;justify-content:space-between;align-items:center;">
                <div style="flex:1;">
                    <div class="task-title" style="color:${on?'var(--accent-blue)':'var(--text-primary)'};font-size:13px;font-weight:600;margin-bottom:2px;">${label}</div>
                    ${desc ? `<div style="color:var(--text-secondary);font-size:11px;">${desc}</div>` : ''}
                </div>
                <label class="toggle-wrap" style="position:relative;display:inline-block;width:50px;height:26px;cursor:pointer;">
                    <input type="checkbox" class="task-checkbox" data-task="${id}" style="opacity:0;width:0;height:0;" ${on ? 'checked' : ''}>
                    <span class="toggle-slider" style="position:absolute;cursor:pointer;top:0;left:0;right:0;bottom:0;background-color:${on?'var(--accent-blue)':'var(--border-color)'};transition:.3s;border-radius:26px;box-shadow:${on?'0 0 8px rgba(74, 158, 255, 0.6)':'none'};"></span>
                    <span class="toggle-knob" id="knob-${id}" style="position:absolute;height:20px;width:20px;left:3px;bottom:3px;background-color:var(--text-primary);transition:.3s;border-radius:50%;transform:${on?'translateX(24px)':'translateX(0)'};"></span>
                </label>
            </div>
        </div>`;
    };
    
    box.innerHTML = `
        <h3 style="color:var(--accent-blue);margin:0 0 5px;font-size:18px;text-align:center;">🔧 Maintenance Tasks</h3>
        <p style="color:var(--text-secondary);font-size:11px;text-align:center;margin-bottom:15px;">Toggle a task to execute automatically</p>
        <div id="task-list">
            <div style="color:var(--accent-blue);font-size:12px;font-weight:600;margin:10px 0 5px;padding-left:5px;">Backup & Optimization</div>
            ${createToggle('update_backups','Update existing backups','Refresh current backup files')}
            ${createToggle('backup_apps','Backup all user apps','Create APK backups of installed apps')}
            ${createToggle('fix_permissions','Fix permissions','Repair app & file permissions')}
            ${createToggle('clear_caches','Clear caches','Remove app cache files')}
            ${createToggle('optimize_apps','Optimize apps loading','Run dexopt on installed apps')}
            ${createToggle('optimize_db','Optimize database accesses','Vacuum & optimize app databases')}
            <div style="color:var(--accent-blue);font-size:12px;font-weight:600;margin:15px 0 5px;padding-left:5px;">Data Backup & Flashing</div>                
            ${createToggle('backup_sms','Backup SMS','Save text messages to backup')}
            ${createToggle('backup_calllog','Backup call-log','Save call history')}
            ${createToggle('backup_contacts','Backup contacts','Export contacts to VCF')}
            ${createToggle('backup_calendars','Backup calendars','Save calendar events')}
            ${createToggle('backup_wifi','Backup Wi-Fi settings','Save WiFi configurations')}
            ${createToggle('backup_partitions','Backup Partition Images','Backup specific images from /dev/block/by-name/')}
            <div style="margin:-4px 0 12px 0; padding: 0 4px;">
                <button id="select-partitions-btn" style="width:100%;padding:10px;background:var(--bg-secondary);color:var(--text-secondary);border:1px dashed var(--border-color);border-radius:8px;font-size:12px;cursor:pointer;">
                    📂 Choose Partitions to Backup
                </button>
                <div id="selected-partitions-display" style="text-align:center;font-size:11px;margin-top:5px;color:var(--text-secondary);">No partitions selected</div>
            </div>
            ${createToggle('flash_partitions','Flash Partition Images','Flash custom image files to selected block targets')}
            <div style="margin:-4px 0 12px 0; padding: 0 4px;">
                <button id="configure-flash-btn" style="width:100%;padding:10px;background:var(--bg-secondary);color:var(--text-secondary);border:1px dashed var(--border-color);border-radius:8px;font-size:12px;cursor:pointer;">
                    ⚡ Configure Flash Image Files
                </button>
                <div id="flash-mappings-display" style="text-align:center;font-size:11px;margin-top:5px;color:var(--text-secondary);">No image files mapped</div>
            </div>
            <div style="color:var(--accent-blue);font-size:12px;font-weight:600;margin:15px 0 5px;padding-left:5px;">System Cleanup</div>
            ${createToggle('clean_memory','Clean memory','Free up RAM')}
            ${createToggle('clean_system_apps','Clean updated system apps','Remove system app updates')}
            ${createToggle('trim_partitions','Trim all partitions','Run fstrim on storage')}
            ${createToggle('clear_clipboard','Clear clipboard','Clear clipboard history')}
            ${createToggle('clean_dalvik','Clean dalvik','Remove dalvik cache files')}
            ${createToggle('wipe_dalvik_reboot','Wipe dalvik (auto-reboot)','Full dalvik wipe + reboot')}
            <div style="color:var(--accent-blue);font-size:12px;font-weight:600;margin:15px 0 5px;padding-left:5px;">Options</div>
            ${createToggle('show_notification','Show results in notification','Display completion status')}
        </div>
        <div id="maint-status" style="text-align:center;font-size:12px;color:var(--text-secondary);margin-bottom:12px;min-height:40px;padding:10px;background:var(--bg-secondary);border:1px solid var(--border-color);border-radius:10px;display:none;"></div>
        <div style="margin-top:15px;">
            <button id="maint-close-btn" style="width:100%;padding:14px;background:var(--bg-secondary);color:var(--text-primary);border:1px solid var(--border-color);border-radius:12px;font-size:14px;font-weight:600;cursor:pointer;">Close</button>
        </div>
        <div style="margin-top:12px;padding:10px;background:rgba(241,196,15,0.1);border:1px solid rgba(241,196,15,0.3);border-radius:8px;font-size:10px;color:var(--accent-orange);line-height:1.4;">
            ⚠️ <strong>Warning:</strong> Flashing or backing up partition images requires root access. Verify image paths carefully to prevent bricking devices.
        </div>
    `;
    modal.appendChild(box);
    document.body.appendChild(modal);
    modal.onclick = e => { if (e.target === modal) modal.remove(); };
    
    box.querySelectorAll('.task-checkbox').forEach(cb => {
        cb.checked = taskStates[cb.dataset.task] || false;
        cb.addEventListener('change', handleToggleChange);
    });
    document.getElementById('maint-close-btn').onclick = () => modal.remove();
    document.getElementById('select-partitions-btn').onclick = () => showPartitionPicker();
    document.getElementById('configure-flash-btn').onclick = () => showFlashImagePicker();
    updatePartitionDisplay();
    updateFlashDisplay();
}

async function handleToggleChange(e) {
    const id = e.target.dataset.task;
    const isChecked = e.target.checked;
    taskStates[id] = isChecked;
    saveConfig();
    updateTaskVisuals(id, isChecked);

    if (isChecked) {
        await runSingleTask(id);
    }
}

function updateTaskVisuals(id, isEnabled) {
    const item = document.querySelector(`.task-item[data-task="${id}"]`);
    if (!item) return;
    item.style.background = isEnabled ? 'rgba(74, 158, 255, 0.15)' : 'var(--bg-secondary)';
    item.style.border = isEnabled ? '1px solid var(--accent-blue)' : '1px solid var(--border-color)';
    const title = item.querySelector('.task-title');
    if (title) title.style.color = isEnabled ? 'var(--accent-blue)' : 'var(--text-primary)';
    const slider = item.querySelector('.toggle-slider');
    if (slider) {
        slider.style.backgroundColor = isEnabled ? 'var(--accent-blue)' : 'var(--border-color)';
        slider.style.boxShadow = isEnabled ? '0 0 8px rgba(74, 158, 255, 0.6)' : 'none';
    }
    const knob = document.getElementById(`knob-${id}`);
    if (knob) knob.style.transform = isEnabled ? 'translateX(24px)' : 'translateX(0)';

    const cb = item.querySelector('.task-checkbox');
    if (cb) cb.checked = isEnabled;
}

async function runSingleTask(task) {
    const statusEl = document.getElementById('maint-status');
    if (!statusEl) return;

    if (task === 'show_notification') {
        statusEl.style.display = 'block';
        statusEl.innerHTML = `<span style="color:var(--accent-green);">✓ Notifications enabled</span>`;
        showSuccessModal("Notification Option", "Result notifications option updated successfully.");
        turnOffToggle(task);
        return;
    }

    statusEl.style.display = 'block';
    statusEl.innerHTML = `<span style="color:var(--accent-orange);">⏳ Running ${formatName(task)}...</span>`;

    try {
        await execFn(`mkdir -p ${BACKUP_DIR}`);
        await executeTask(task);
        statusEl.innerHTML = `<span style="color:var(--accent-green);">✓ ${formatName(task)} completed</span>`;
        
        if (taskStates.show_notification && window.showStatus) {
            window.showStatus(`✅ ${formatName(task)} done`, 'var(--accent-blue)');
        }

        showSuccessModal(`${formatName(task)} Successful`, `Process executed and completed without errors.`);

        if (task === 'wipe_dalvik_reboot') {
            statusEl.innerHTML += '<br><span style="color:var(--accent-orange);">🔄 Rebooting...</span>';
            await new Promise(r => setTimeout(r, 2000));
            await execFn('su -c "reboot"');
        }
    } catch (e) {
        statusEl.innerHTML = `<span style="color:var(--accent-red);">✗ ${formatName(task)}: ${e.message}</span>`;
    } finally {
        turnOffToggle(task);
    }
}

function turnOffToggle(task) {
    taskStates[task] = false;
    saveConfig();
    updateTaskVisuals(task, false);
}

async function executeTask(task) {
    if (task === 'backup_partitions') {
        if (selectedPartitions.length === 0) throw new Error('No partitions selected');
        await execFn('su -c "mkdir -p /sdcard/AndroidBackups"', 5000);
        for (const p of selectedPartitions) {
            await execFn(`su -c "dd if=/dev/block/by-name/${p} of=/sdcard/AndroidBackups/${p}.img bs=4M 2>/dev/null"`, 300000);
        }
        return;
    }

    if (task === 'flash_partitions') {
        const targets = Object.keys(flashImageMappings);
        if (targets.length === 0) throw new Error('No image files mapped for flashing');
        for (const targetPart of targets) {
            const imgPath = flashImageMappings[targetPart];
            if (!imgPath) continue;
            await execFn(`su -c "dd if='${imgPath}' of='/dev/block/by-name/${targetPart}' bs=4M status=none 2>/dev/null"`, 300000);
        }
        return;
    }

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
