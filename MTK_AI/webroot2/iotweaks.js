// iotweaks.js - I/O Tweaks Manager for Tools Page
(function() {
    'use strict';

    const CONFIG_FILE = '/sdcard/MTK_AI_Engine/iotweaks.conf';
    const SERVICE_SCRIPT = '/data/adb/service.d/99-iotweaks.sh';
    let currentReadAhead = 4096;
    let currentScheduler = 'none';
    let installPersistent = false;
    
    // Fallback list in case fetching from sysfs fails
    let availableSchedulers = ['none', 'mq-deadline', 'bfq', 'kyber'];

    const execFn = window.exec || async function(cmd, timeout = 10000) {
        return new Promise((resolve, reject) => {
            const cb = `io_exec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
            const t = setTimeout(() => { delete window[cb]; reject(new Error('Command timed out')); }, timeout);
            window[cb] = (code, res) => {
                clearTimeout(t); delete window[cb];
                if (code !== 0) reject(new Error(`Exit ${code}: ${res?.trim() || 'Unknown error'}`));
                else resolve(res?.trim() || '');
            };
            if (window.ksu) {
                try { ksu.exec(cmd, `window.${cb}`); }
                catch (e) { clearTimeout(t); reject(e); }
            } else {
                clearTimeout(t); reject(new Error('No root execution environment found'));
            }
        });
    };

    async function init() {
        await loadConfig();
        await fetchSchedulers();
        bindClickHandler();
    }

    // Dynamically fetch available I/O schedulers from the device
    async function fetchSchedulers() {
        try {
            const cmd = `su -c 'cat /sys/block/*/queue/scheduler 2>/dev/null | tr " " "\\n" | tr -d "[]" | sort -u'`;
            const content = await execFn(cmd).catch(() => '');
            
            if (content) {
                // Parse the newline-separated list of unique schedulers
                const scheds = content.split('\n').map(s => s.trim()).filter(s => s);
                if (scheds.length > 0) {
                    availableSchedulers = scheds;
                    
                    // Ensure the currently saved scheduler is in the list                    
                    if (!availableSchedulers.includes(currentScheduler)) {
                        availableSchedulers.unshift(currentScheduler);
                    }
                }
            }
        } catch (e) {
            console.warn('I/O Tweaks: Failed to fetch schedulers dynamically, using fallback.', e);
        }
    }

    async function loadConfig() {
        try {
            const raw = await execFn(`cat "${CONFIG_FILE}" 2>/dev/null`).catch(() => '');
            if (raw) {
                raw.split('\n').forEach(line => {
                    const [key, val] = line.split('=');
                    if (key === 'read_ahead' && !isNaN(parseInt(val))) currentReadAhead = parseInt(val);
                    if (key === 'scheduler' && val) currentScheduler = val.trim();
                });
            }
            const svcCheck = await execFn(`[ -f "${SERVICE_SCRIPT}" ] && echo 1 || echo 0`).catch(() => '0');
            installPersistent = svcCheck === '1';
        } catch (e) { console.warn('I/O Tweaks: Config load failed:', e); }
    }

    function bindClickHandler() {
        const btn = document.getElementById('io-tweaks-btn');
        if (btn) btn.addEventListener('click', () => showIOModal());
    }

    function showIOModal() {
        document.getElementById('io-modal')?.remove();

        if (!document.getElementById('io-slider-style')) {
            const style = document.createElement('style');
            style.id = 'io-slider-style';
            style.textContent = `
                input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; width: 20px; height: 20px; background: #4a9eff; border-radius: 50%; cursor: pointer; border: 2px solid #fff; }
                .toggle-switch { position: relative; display: inline-block; width: 50px; height: 26px; }
                .toggle-switch input { opacity: 0; width: 0; height: 0; }
                .toggle-slider { position: absolute; cursor: pointer; inset: 0; background-color: #555; transition: .3s; border-radius: 26px; }
                .toggle-slider:before { position: absolute; content: ""; height: 20px; width: 20px; left: 3px; bottom: 3px; background-color: white; transition: .3s; border-radius: 50%; }
                input:checked + .toggle-slider { background-color: #4a9eff; }
                input:checked + .toggle-slider:before { transform: translateX(24px); }
            `;
            document.head.appendChild(style);
        }

        const modal = document.createElement('div');
        modal.id = 'io-modal';        modal.style.cssText = `position: fixed; inset: 0; background: rgba(0,0,0,0.85); z-index: 10000; display: flex; align-items: center; justify-content: center; backdrop-filter: blur(5px);`;

        const box = document.createElement('div');
        box.style.cssText = `background: linear-gradient(135deg, #1a1f3a, #2d3561); border: 2px solid #4a9eff; border-radius: 20px; padding: 24px; width: 95%; max-width: 480px; box-shadow: 0 0 40px rgba(74, 158, 255, 0.2);`;

        box.innerHTML = `
            <h3 style="color: #4a9eff; margin: 0 0 5px; font-size: 20px; text-align: center;">💾 I/O Tweaks Manager</h3>
            <p style="color: #8b92b4; font-size: 12px; text-align: center; margin-bottom: 20px;">Optimize storage read-ahead & scheduler</p>
            <div style="margin-bottom: 20px;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                    <span style="color: #fff; font-size: 13px; font-weight: 600;">Read-Ahead KB</span>
                    <span id="io-ra-val" style="color: #4a9eff; font-weight: 600;">${currentReadAhead} KB</span>
                </div>
                <input type="range" id="io-ra-slider" min="128" max="8192" step="128" value="${currentReadAhead}" style="width: 100%; height: 6px; background: rgba(255,255,255,0.2); border-radius: 3px; outline: none;">
                <div style="display: flex; justify-content: space-between; font-size: 11px; color: #666; margin-top: 4px;"><span>128 KB</span><span>8192 KB</span></div>
            </div>
            <div style="margin-bottom: 20px;">
                <div style="color: #fff; font-size: 13px; font-weight: 600; margin-bottom: 8px;">I/O Scheduler</div>
                <select id="io-sched-select" style="width: 100%; padding: 10px; background: rgba(0,0,0,0.4); color: #fff; border: 1px solid rgba(255,255,255,0.2); border-radius: 10px;">
                    ${availableSchedulers.map(s => `<option value="${s}" ${s === currentScheduler ? 'selected' : ''}>${s.toUpperCase()}</option>`).join('')}
                </select>
            </div>
            <div style="margin-bottom: 20px; padding: 12px; background: rgba(74,158,255,0.1); border-radius: 12px; border: 1px solid rgba(74,158,255,0.3);">
                <div style="display: flex; align-items: center; justify-content: space-between;">
                    <div>
                        <div style="color: #fff; font-size: 13px; font-weight: 600;">🔄 Persistent on Boot</div>
                        <div style="color: #8b92b4; font-size: 11px;">Install to service.d for auto-apply after reboot</div>
                    </div>
                    <label class="toggle-switch">
                        <input type="checkbox" id="io-persist-toggle" ${installPersistent ? 'checked' : ''}>
                        <span class="toggle-slider"></span>
                    </label>
                </div>
            </div>
            <div id="io-status" style="text-align: center; font-size: 12px; color: #666; margin-bottom: 15px; min-height: 40px; padding: 8px; background: rgba(0,0,0,0.2); border-radius: 8px;"></div>
            <button id="io-apply-btn" style="width: 100%; padding: 14px; background: linear-gradient(135deg, #4a9eff, #2980b9); color: #fff; border: none; border-radius: 12px; font-size: 14px; font-weight: 700; cursor: pointer; margin-bottom: 10px;">💾 Apply I/O Tweaks</button>
            <button id="io-cancel-btn" style="width: 100%; padding: 12px; background: rgba(255,255,255,0.1); color: #fff; border: none; border-radius: 10px; font-size: 13px; cursor: pointer;">Cancel</button>
        `;

        modal.appendChild(box);
        document.body.appendChild(modal);
        modal.onclick = e => { if (e.target === modal) modal.remove(); };

        const slider = document.getElementById('io-ra-slider');
        const raVal = document.getElementById('io-ra-val');
        if (slider && raVal) slider.oninput = () => { currentReadAhead = parseInt(slider.value); raVal.textContent = `${currentReadAhead} KB`; };

        const persistToggle = document.getElementById('io-persist-toggle');
        if (persistToggle) persistToggle.onchange = () => { installPersistent = persistToggle.checked; };
        document.getElementById('io-apply-btn').onclick = async () => {
            currentScheduler = document.getElementById('io-sched-select')?.value || currentScheduler;
            await applyTweaks();
        };
        document.getElementById('io-cancel-btn').onclick = () => modal.remove();
    }

    async function applyTweaks() {
        const statusEl = document.getElementById('io-status');
        const applyBtn = document.getElementById('io-apply-btn');
        if (!statusEl || !applyBtn) return;

        applyBtn.disabled = true;
        applyBtn.textContent = installPersistent ? '⏳ Installing & Applying...' : '⏳ Applying...';
        statusEl.innerHTML = '<span style="color: #FF9F0A;">🔍 Scanning /sys for I/O files...</span>';

        await execFn(`mkdir -p /sdcard/MTK_AI_Engine && printf 'read_ahead=%s\\nscheduler=%s\\n' '${currentReadAhead}' '${currentScheduler}' > "${CONFIG_FILE}" 2>/dev/null`).catch(() => {});

        try {
            if (installPersistent) await installPersistentService();
            else await applyImmediate();
        } catch (e) {
            statusEl.innerHTML = `<span style="color: #FF453A;">❌ ${e.message}</span><br><small style="color: #8b92b4;">Ensure root access & check dmesg for SELinux</small>`;
            applyBtn.disabled = false;
            applyBtn.textContent = '💾 Apply I/O Tweaks';
        }
    }

    async function applyImmediate() {
        const statusEl = document.getElementById('io-status');
        const findResult = await execFn(`find /sys -type f \\( -name "read_ahead_kb" -o -name "scheduler" \\) 2>/dev/null`).catch(() => '');
        const files = findResult.split('\n').filter(f => f && f.trim());
        if (files.length === 0) throw new Error('No I/O tunable files found');

        statusEl.innerHTML = `<span style="color: #4a9eff;">⚡ Applying to ${files.length} entries... Don't close UI while applying</span>`;
        let success = 0;

        for (const file of files) {
            try {
                await execFn(`su -c "chmod 777 '${file}' 2>/dev/null"`);
                if (file.includes('read_ahead_kb')) {
                    await execFn(`su -c "echo '${currentReadAhead}' | tee '${file}' >/dev/null 2>&1"`);
                } else if (file.includes('scheduler')) {
                    await execFn(`su -c "echo '${currentScheduler}' | tee '${file}' >/dev/null 2>&1"`);
                }
                success++;
            } catch (e) { console.warn(`Failed ${file}:`, e); }
        }

        if (success > 0) {            statusEl.innerHTML = `<span style="color: #32D74B;">✅ Applied to ${success}/${files.length}</span><br><small>${currentReadAhead} KB | ${currentScheduler}</small>`;
            window.showStatus?.(`✅ I/O Tweaks: ${success} entries updated`, '#4a9eff');
        } else {
            throw new Error('All writes failed (check root/SELinux)');
        }
        setTimeout(() => document.getElementById('io-modal')?.remove(), 2000);
    }

    async function installPersistentService() {
        const statusEl = document.getElementById('io-status');
        statusEl.innerHTML = '<span style="color: #4a9eff;">📦 Generating service script...</span>';
        
        // Hardened POSIX script for Android service.d
        const scriptContent = `#!/system/bin/sh
CONFIG="/sdcard/MTK_AI_Engine/iotweaks.conf"
LOG="/sdcard/MTK_AI_Engine/iotweaks.log"
log() { echo "[$(date '+%H:%M:%S')] $*" >> "$LOG" 2>/dev/null; }
log "=== I/O Tweaks Service Starting ==="
COUNT=0
while [ $COUNT -lt 30 ]; do [ -f "$CONFIG" ] && break; sleep 2; COUNT=$((COUNT + 1)); done
RA=4096; SCHED="none"
if [ -f "$CONFIG" ]; then
  while IFS='=' read -r key val; do
    case "$key" in read_ahead) RA="$val" ;; scheduler) SCHED="$val" ;; esac
  done < "$CONFIG"
fi
log "Applying: RA=$RA, SCHED=$SCHED"
/system/bin/find /sys -type f \\( -name "read_ahead_kb" -o -name "scheduler" \\) 2>/dev/null | while IFS= read -r file; do
  /system/bin/chmod 777 "$file" 2>/dev/null
  case "$file" in
    *read_ahead_kb) /system/bin/echo "$RA" | /system/bin/tee "$file" >/dev/null 2>&1 ;;
    *scheduler) /system/bin/echo "$SCHED" | /system/bin/tee "$file" >/dev/null 2>&1 ;;
  esac
  log "Applied: $file"
done
log "=== I/O Tweaks Service Complete ==="
exit 0`;

        // Encode to Base64 in JS to guarantee ZERO shell parsing/escaping issues
        const b64 = btoa(scriptContent);
        await execFn(`su -c "mkdir -p /data/adb/service.d && echo '${b64}' | base64 -d > '${SERVICE_SCRIPT}' && chmod 755 '${SERVICE_SCRIPT}'"`);
        
        const verify = await execFn(`su -c "[ -x '${SERVICE_SCRIPT}' ] && echo ok || echo fail"`);
        if (verify !== 'ok') throw new Error('Service installation failed');
        
        statusEl.innerHTML = `<span style="color: #32D74B;">✅ Service installed</span><br><small>Auto-applies on boot</small>`;
        await applyImmediate();
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);    else init();
})();