// fpsgo.js - FPSGO Toggle Manager (Read-Only Detection)
(function() {
    'use strict';

    const FPSGO_PATHS = [
        '/sys/module/fpsgo/parameters',
        '/sys/kernel/fpsgo/fstb',
        '/sys/kernel/fpsgo/fbt',
        '/sys/kernel/fpsgo/common',
        '/sys/devices/virtual/misc/fpsgo',
        '/sys/class/misc/fpsgo',
        '/sys/module/gpu_fpsgo/parameters',
        '/sys/module/gpu_fpsgo',
        '/sys/kernel/gpu_fpsgo',
        '/sys/devices/platform/soc/mtk_fpsgo',
        '/proc/fpsgo',
        '/dev/fpsgo'
    ];

    let detectedPaths = [];
    let currentSettings = {};
    let pathStatus = {};
    let foundToggles = [];

    const execFn = window.exec || async function(cmd, timeout = 5000) {
        return new Promise(resolve => {
            const cb = `fpsgo_exec_${Date.now()}_${Math.random().toString(36).substring(2)}`;
            const t = setTimeout(() => { delete window[cb]; resolve(''); }, timeout);
            window[cb] = (_, res) => { clearTimeout(t); delete window[cb]; resolve(res || ''); };
            if (window.ksu) ksu.exec(cmd, `window.${cb}`);
            else { clearTimeout(t); resolve(''); }
        });
    };

    async function init() {
        bindClickHandler();
    }

    function bindClickHandler() {
        const btn = document.getElementById('fpsgo-btn');
        if (!btn) return;
        btn.addEventListener('click', () => showFpsgoModal());
    }

    function showFpsgoModal() {
        const existing = document.getElementById('fpsgo-modal');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = 'fpsgo-modal';
        modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:10000;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(5px);';

        const box = document.createElement('div');
        box.style.cssText = 'background:linear-gradient(135deg,#1a1f3a,#2d3561);border:2px solid #ef4444;border-radius:20px;padding:24px;width:95%;max-width:500px;';

        box.innerHTML = `
            <h3 style="color:#ef4444;margin:0 0 5px;font-size:20px;text-align:center;">🚀 FPSGO Manager</h3>            <p style="color:#8b92b4;font-size:12px;text-align:center;margin-bottom:20px;">Common MTK FPSGO Tweaks</p>

            <div id="fpsgo-paths-container" style="margin-bottom:15px;"></div>

            <div id="fpsgo-scan-status" style="text-align:center;font-size:12px;color:#666;margin-bottom:15px;min-height:40px;padding:8px;background:rgba(0,0,0,0.2);border-radius:8px;">
                <span style="color:#ef4444;">🔍 Checking permissions...</span>
            </div>

            <div id="fpsgo-list" style="display:none;flex-direction:column;gap:10px;margin-bottom:15px;max-height:400px;overflow-y:auto;padding-right:4px;"></div>

            <div style="background:rgba(239,68,68,0.1);color:#fca5a5;padding:10px;border-radius:8px;font-size:11px;text-align:center;margin-bottom:15px;">
                🔒 Grey toggles = Read-only (kernel locked)
            </div>

            <button id="fpsgo-cancel-btn" style="width:100%;padding:12px;background:rgba(255,255,255,0.1);color:#fff;border:none;border-radius:10px;font-size:13px;cursor:pointer;">Close</button>
        `;

        modal.appendChild(box);
        document.body.appendChild(modal);
        modal.onclick = e => { if (e.target === modal) modal.remove(); };

        document.getElementById('fpsgo-cancel-btn').onclick = () => modal.remove();

        detectAndScan();
    }

    async function detectAndScan() {
        const statusEl = document.getElementById('fpsgo-scan-status');
        const pathsContainer = document.getElementById('fpsgo-paths-container');
        const listEl = document.getElementById('fpsgo-list');

        detectedPaths = [];
        pathStatus = {};
        currentSettings = {};
        foundToggles = [];

        for (const path of FPSGO_PATHS) {
            try {
                const check = await execFn(`test -d ${path} && echo "exists" || echo "missing"`);
                pathStatus[path] = check.trim() === 'exists';
                if (pathStatus[path]) detectedPaths.push(path);
            } catch (e) {
                pathStatus[path] = false;
            }
        }

        displayPaths(pathsContainer);

        if (detectedPaths.length === 0) {
            statusEl.innerHTML = '<span style="color:#666;">❌ No FPSGO paths found</span>';            listEl.style.display = 'none';
            return;
        }

        statusEl.innerHTML = `<span style="color:#ef4444;">⚡ Scanning ${detectedPaths.length} path(s)...</span>`;
        
        for (const basePath of detectedPaths) {
            await scanPathForToggles(basePath);
        }

        if (foundToggles.length === 0) {
            statusEl.innerHTML = '<span style="color:#666;">⚠️ No parameters found</span>';
            listEl.style.display = 'none';
            return;
        }

        listEl.innerHTML = '';
        let writableCount = 0;
        let readOnlyCount = 0;

        foundToggles.forEach(toggle => {
            const row = createToggleRow(toggle);
            listEl.appendChild(row);
            if (toggle.writable) writableCount++;
            else readOnlyCount++;
        });

        statusEl.innerHTML = `<span style="color:#10b981;">✅ ${writableCount} writable, ${readOnlyCount} read-only</span>`;
        listEl.style.display = 'flex';

        bindToggleEvents(listEl);
    }

    async function scanPathForToggles(basePath) {
        try {
            const isDir = await execFn(`test -d ${basePath} && echo "yes" || echo "no"`);
            
            if (isDir.trim() === 'yes') {
                const rawList = await execFn(`ls ${basePath} 2>/dev/null`);
                const files = rawList.trim().split('\n').filter(f => f && f.trim());

                for (const file of files) {
                    const paramName = file.trim();
                    if (!paramName || paramName.startsWith('.') || paramName === 'uevent') continue;

                    const fullPath = `${basePath}/${paramName}`;
                    await checkIfToggle(paramName, fullPath);
                }
            }
        } catch (e) {            console.error(`Failed to scan ${basePath}:`, e);
        }
    }

    async function checkIfToggle(name, path) {
        try {
            // Check readable
            const testRead = await execFn(`test -r ${path} && echo "yes" || echo "no"`);
            if (testRead.trim() !== 'yes') return;

            // Read current value
            let val = await execFn(`cat ${path} 2>/dev/null`);
            val = val ? val.trim() : '';

            // Only process 0/1 values
            if (val !== '0' && val !== '1') return;

            // Check if writable
            const testWrite = await execFn(`test -w ${path} && echo "yes" || echo "no"`);
            const isWritable = testWrite.trim() === 'yes';

            // Try to write to confirm (test write)
            let actuallyWritable = isWritable;
            if (isWritable) {
                // Try a test write (write same value to test)
                const testResult = await execFn(`su -c "chmod 666 ${path} 2>/dev/null; echo ${val} > ${path} 2>&1"`);
                // If error contains "Read-only" or "Permission", it's not actually writable
                if (testResult.includes('Read-only') || testResult.includes('Permission denied')) {
                    actuallyWritable = false;
                }
            }

            const desc = name.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

            if (!foundToggles.find(t => t.name === name && t.path === path)) {
                foundToggles.push({
                    name: name,
                    path: path,
                    value: val,
                    writable: actuallyWritable,
                    desc: desc
                });
                console.log(`${actuallyWritable ? '✅' : '🔒'} ${name} = ${val}`);
            }
        } catch (e) {}
    }

    function displayPaths(container) {
        if (!container) return;
        let html = '<div style="background:rgba(0,0,0,0.3);border-radius:12px;padding:12px;">';        html += '<div style="color:#8b92b4;font-size:11px;margin-bottom:8px;text-align:center;">📍 Active Paths</div>';
        
        detectedPaths.forEach((path, index) => {
            html += `
                <div style="display:flex;align-items:center;gap:8px;padding:8px;margin-bottom:${index < detectedPaths.length - 1 ? '6px' : '0'};background:rgba(16,185,129,0.1);border:1px solid #10b981;border-radius:8px;">
                    <span style="font-size:14px;">🟢</span>
                    <code style="flex:1;color:#fff;font-size:10px;overflow:hidden;text-overflow:ellipsis;">${path}</code>
                </div>
            `;
        });
        html += '</div>';
        container.innerHTML = html;
    }

    function createToggleRow(toggle) {
        const row = document.createElement('div');
        row.style.cssText = `background:rgba(0,0,0,0.2);border-radius:10px;padding:12px;display:flex;justify-content:space-between;align-items:center;opacity:${toggle.writable ? '1' : '0.5'};`;

        const isChecked = toggle.value === '1';
        
        row.innerHTML = `
            <div style="flex:1;min-width:0;">
                <div style="color:#fff;font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                    ${toggle.desc} ${!toggle.writable ? '🔒' : ''}
                </div>
                <div style="color:#666;font-size:10px;margin-top:2px;">${toggle.name}</div>
            </div>
            <div style="position:relative;display:inline-block;width:44px;height:24px;margin-left:8px;">
                <input type="checkbox" class="fpsgo-toggle" 
                    data-path="${toggle.path}" 
                    data-param="${toggle.name}" 
                    data-desc="${toggle.desc}"
                    ${isChecked ? 'checked' : ''}
                    ${!toggle.writable ? 'disabled' : ''}
                    style="opacity:0;width:0;height:0;">
                <span style="position:absolute;cursor:${toggle.writable ? 'pointer' : 'not-allowed'};top:0;left:0;right:0;bottom:0;background-color:${isChecked ? '#ef4444' : '#4b5563'};transition:.3s;border-radius:24px;${!toggle.writable ? 'filter:grayscale(100%);' : ''}"
                    ${toggle.writable ? 'onclick="this.previousElementSibling.click()"' : ''}></span>
            </div>
        `;
        return row;
    }

    function bindToggleEvents(container) {
        container.querySelectorAll('.fpsgo-toggle:not(:disabled)').forEach(toggle => {
            toggle.addEventListener('change', async (e) => {
                const targetVal = e.target.checked ? '1' : '0';
                const path = e.target.dataset.path;
                const param = e.target.dataset.param;
                const desc = e.target.dataset.desc;
                                e.target.disabled = true;
                e.target.style.opacity = '0.5';
                
                try {
                    await execFn(`su -c "chmod 666 ${path} && echo ${targetVal} > ${path}"`);
                    
                    // Verify
                    const verify = await execFn(`cat ${path} 2>/dev/null`);
                    const actualVal = verify ? verify.trim() : '';

                    if (actualVal === targetVal) {
                        // Success
                        const slider = e.target.nextElementSibling;
                        if (slider) {
                            slider.style.backgroundColor = targetVal === '1' ? '#10b981' : '#4b5563';
                            setTimeout(() => {
                                slider.style.backgroundColor = targetVal === '1' ? '#ef4444' : '#4b5563';
                            }, 300);
                        }
                    } else {
                        // Failed
                        e.target.checked = !e.target.checked;
                        alert(`⚠️ Could not apply ${desc}\n\nKernel rejected the change.`);
                    }
                } catch (err) {
                    e.target.checked = !e.target.checked;
                    alert(`Error applying ${desc}`);
                }
                
                e.target.disabled = false;
                e.target.style.opacity = '1';
            });
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    window.FpsgoManager = { init, showFpsgoModal };
})();