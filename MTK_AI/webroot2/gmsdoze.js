// gmsdoze.js - GMS Doze Manager for Tools Page
(function() {
    'use strict';

    const CONFIG_FILE = '/sdcard/MTK_AI_Engine/gmsdoze.conf';
    const GMS_PACKAGES = [
        'com.google.android.gms',
        'com.google.android.gsf',
        'com.google.android.gsf.login',
        'com.google.android.backuptransport',
        'com.google.android.partnersetup',
        'com.google.android.setupwizard'
    ];
    let isGmsEnabled = true;
    let detectedGms = [];

    // Safe exec wrapper - EXACT COPY from iotweaks.js
    const execFn = window.exec || async function(cmd, timeout = 5000) {
        return new Promise(resolve => {
            const cb = `gms_exec_${Date.now()}_${Math.random().toString(36).substring(2)}`;
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
                const [key, val] = raw.trim().split('=');
                if (key === 'state') isGmsEnabled = val.trim() === '1';
            }
        } catch (e) { 
            console.warn('GMSDoze: Config load failed:', e); 
        }
    }

    function bindClickHandler() {
        const btn = document.getElementById('gmsdoze-btn');
        if (!btn) {
            console.warn('GMSDoze: #gmsdoze-btn not found');
            return;
        }        console.log('GMSDoze: Button found, attaching click handler');
        btn.addEventListener('click', () => {
            console.log('GMSDoze: Button clicked');
            showGMSModal();
        });
    }

    function showGMSModal() {
        const existing = document.getElementById('gms-modal');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = 'gms-modal';
        modal.style.cssText = `
            position: fixed; inset: 0; background: rgba(0,0,0,0.85); z-index: 10000;
            display: flex; align-items: center; justify-content: center;
            backdrop-filter: blur(5px);
        `;

        const box = document.createElement('div');
        box.style.cssText = `
            background: linear-gradient(135deg, #1a1f3a, #2d3561);
            border: 2px solid #22c55e;
            border-radius: 20px;
            padding: 24px; width: 95%; max-width: 450px;
            box-shadow: 0 0 40px rgba(34, 197, 94, 0.2);
        `;

        box.innerHTML = `
            <h3 style="color: #22c55e; margin: 0 0 5px; font-size: 20px; text-align: center;">🔋 GMS Doze Manager</h3>
            <p style="color: #8b92b4; font-size: 12px; text-align: center; margin-bottom: 20px;">Disable Google Play Services to save battery & RAM</p>

            <div id="gms-scan-status" style="text-align: center; font-size: 12px; color: #666; margin-bottom: 15px; min-height: 40px; padding: 8px; background: rgba(0,0,0,0.2); border-radius: 8px;">
                <span style="color: #FF9F0A;">🔍 Checking GMS status...</span>
            </div>

            <div id="gms-list" style="display: none; flex-direction: column; gap: 8px; margin-bottom: 15px; max-height: 180px; overflow-y: auto; padding-right: 4px;">
            </div>

            <div style="background: rgba(239,68,68,0.1); color: #fca5a5; padding: 10px; border-radius: 8px; font-size: 11px; text-align: center; margin-bottom: 15px;">
                <i class="fas fa-exclamation-triangle"></i> Disabling GMS breaks Play Store, push notifications, location services & backups.
            </div>

            <button id="gms-toggle-btn" style="width: 100%; padding: 14px; background: linear-gradient(135deg, #22c55e, #16a34a); color: #fff; border: none; border-radius: 12px; font-size: 14px; font-weight: 700; cursor: pointer; margin-bottom: 10px;">
                🔄 ${isGmsEnabled ? 'Disable GMS' : 'Enable GMS'}
            </button>
            <button id="gms-cancel-btn" style="width: 100%; padding: 12px; background: rgba(255,255,255,0.1); color: #fff; border: none; border-radius: 10px; font-size: 13px; cursor: pointer;">Cancel</button>
        `;

        modal.appendChild(box);        document.body.appendChild(modal);
        modal.onclick = e => { if (e.target === modal) modal.remove(); };

        setTimeout(() => scanGMSStatus(), 100);

        document.getElementById('gms-toggle-btn').onclick = async () => {
            await toggleGMS();
        };
        document.getElementById('gms-cancel-btn').onclick = () => modal.remove();
    }

    async function scanGMSStatus() {
        const listEl = document.getElementById('gms-list');
        const statusEl = document.getElementById('gms-scan-status');
        if (!listEl || !statusEl) return;

        try {
            const disabledRaw = await execFn('pm list packages -d 2>/dev/null');
            const disabledPkgs = new Set((disabledRaw || '').trim().split('\n').map(p => p.replace('package:', '').trim()));

            detectedGms = [];
            let foundCount = 0;

            for (const pkg of GMS_PACKAGES) {
                const pathRaw = await execFn(`pm path ${pkg} 2>/dev/null`);
                if (pathRaw && pathRaw.includes('.apk')) {
                    foundCount++;
                    const isDisabled = disabledPkgs.has(pkg);
                    detectedGms.push({ pkg, isDisabled });
                }
            }

            if (foundCount === 0) {
                statusEl.innerHTML = '<span style="color: #666;">GMS not detected on this device.</span>';
                listEl.style.display = 'none';
                return;
            }

            isGmsEnabled = !detectedGms.every(g => g.isDisabled);
            statusEl.style.display = 'none';
            listEl.style.display = 'flex';
            listEl.innerHTML = '';

            detectedGms.forEach(g => {
                const item = document.createElement('div');
                item.style.cssText = 'background: rgba(0,0,0,0.3); border-radius: 8px; padding: 10px; display: flex; justify-content: space-between; align-items: center;';
                item.innerHTML = `
                    <div style="flex:1; min-width:0;">
                        <div style="color: #fff; font-size: 12px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${g.pkg}</div>
                        <div style="color: ${g.isDisabled ? '#FF453A' : '#32D74B'}; font-size: 11px; margin-top: 2px;">                            ${g.isDisabled ? '❌ Disabled' : '✅ Enabled'}
                        </div>
                    </div>
                `;
                listEl.appendChild(item);
            });

            const toggleBtn = document.getElementById('gms-toggle-btn');
            if (toggleBtn) {
                toggleBtn.textContent = isGmsEnabled ? '⚠️ Disable GMS' : '✅ Enable GMS';
                toggleBtn.style.background = isGmsEnabled 
                    ? 'linear-gradient(135deg, #ef4444, #b91c1c)' 
                    : 'linear-gradient(135deg, #22c55e, #16a34a)';
            }

        } catch (e) {
            console.error('GMSDoze: Scan failed:', e);
            statusEl.innerHTML = `<span style="color: #FF453A;">❌ Error: ${e.message}</span>`;
        }
    }

    async function toggleGMS() {
        const toggleBtn = document.getElementById('gms-toggle-btn');
        const statusEl = document.getElementById('gms-scan-status');
        
        if (!toggleBtn || !statusEl) return;

        toggleBtn.disabled = true;
        toggleBtn.textContent = '⏳ Applying...';
        statusEl.style.display = 'block';
        statusEl.innerHTML = '<span style="color: #FF9F0A;">🔄 Updating GMS state...</span>';

        try {
            const targetDisabled = isGmsEnabled;
            const cmdAction = targetDisabled ? 'disable-user' : 'enable';
            const successPkgs = [];

            for (const g of detectedGms) {
                try {
                    await execFn(`su -c "pm ${cmdAction} --user 0 ${g.pkg} 2>/dev/null"`);
                    successPkgs.push(g.pkg);
                } catch (err) {
                    console.warn(`GMSDoze: Failed to ${cmdAction} ${g.pkg}:`, err);
                }
            }

            isGmsEnabled = !targetDisabled;
            await execFn(`mkdir -p /sdcard/MTK_AI_Engine && echo "state=${isGmsEnabled ? 1 : 0}" > ${CONFIG_FILE}`);

            statusEl.innerHTML = `<span style="color: #32D74B;">✅ ${successPkgs.length}/${detectedGms.length} packages ${targetDisabled ? 'disabled' : 'enabled'}</span>`;            
            if (window.showStatus) {
                window.showStatus(`✅ GMS: ${targetDisabled ? 'Disabled' : 'Enabled'}`, isGmsEnabled ? '#22c55e' : '#ef4444');
            }

            setTimeout(() => {
                document.getElementById('gms-modal')?.remove();
                showGMSModal();
            }, 1500);

        } catch (e) {
            console.error('GMSDoze: Toggle failed:', e);
            statusEl.innerHTML = `<span style="color: #FF453A;">❌ Error: ${e.message}</span>`;
            toggleBtn.disabled = false;
            toggleBtn.textContent = isGmsEnabled ? '⚠️ Disable GMS' : '✅ Enable GMS';
        }
    }

    // Initialize
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    window.GMSDozeManager = { init, showGMSModal, toggleGMS };
})();