// networktweak.js - Network Optimizer for Tools Page
(function() {
    'use strict';

    const CONFIG_FILE = '/sdcard/MTK_AI_Engine/networktweak.conf';
    
    // Default values (safe Android defaults)
    const DEFAULTS = {
        congestion: 'cubic',
        rmem_max: 2097152,
        wmem_max: 2097152,
        rmem: '4096 87380 2097152',
        wmem: '4096 65536 2097152',
        window_scaling: 1,
        sack: 1,
        timestamps: 1,
        fastopen: 0,
        tw_reuse: 0,
        keepalive_time: 600,
        fin_timeout: 30,
        low_latency: 0,
        active_preset: 'balance'
    };

    // Preset configurations
    const PRESETS = {
        optimize: {
            congestion: 'bbr',
            rmem_max: 16777216, wmem_max: 16777216,
            rmem: '4096 87380 16777216', wmem: '4096 65536 16777216',
            window_scaling: 1, sack: 1, timestamps: 1, fastopen: 3,
            tw_reuse: 1, keepalive_time: 300, fin_timeout: 15, low_latency: 1,
            active_preset: 'optimize'
        },
        balance: {
            congestion: 'bbr',
            rmem_max: 8388608, wmem_max: 8388608,
            rmem: '4096 87380 8388608', wmem: '4096 65536 8388608',
            window_scaling: 1, sack: 1, timestamps: 1, fastopen: 0,
            tw_reuse: 1, keepalive_time: 600, fin_timeout: 30, low_latency: 0,
            active_preset: 'balance'
        },
        powersave: {
            congestion: 'cubic',
            rmem_max: 2097152, wmem_max: 2097152,
            rmem: '4096 87380 2097152', wmem: '4096 65536 2097152',
            window_scaling: 1, sack: 1, timestamps: 1, fastopen: 0,
            tw_reuse: 0, keepalive_time: 1200, fin_timeout: 60, low_latency: 0,
            active_preset: 'powersave'
        }    };

    let config = { ...DEFAULTS };

    // Safe exec wrapper
    const execFn = window.exec || async function(cmd, timeout = 8000) {
        return new Promise(resolve => {
            const cb = `net_exec_${Date.now()}_${Math.random().toString(36).substring(2)}`;
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
                    if (key && val !== undefined) {
                        const parsed = val.trim();
                        config[key] = (parsed === 'true' || parsed === '1') ? 1 : 
                                      (parsed === 'false' || parsed === '0') ? 0 : parsed;
                    }
                });
            }
        } catch (e) { console.warn('NetworkTweak: Config load failed:', e); }
    }

    async function saveConfig() {
        try {
            const lines = Object.entries(config).map(([k, v]) => `${k}=${v}`).join('\n');
            await execFn(`mkdir -p /sdcard/MTK_AI_Engine && echo "${lines}" > ${CONFIG_FILE}`);
        } catch (e) { console.warn('NetworkTweak: Config save failed:', e); }
    }

    function bindClickHandler() {
        const btn = document.getElementById('network-tweak-btn');
        if (!btn) return;
        btn.addEventListener('click', () => showNetworkModal());
    }

    function showNetworkModal() {        const existing = document.getElementById('network-modal');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = 'network-modal';
        modal.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,0.9);z-index:10000;display:flex;align-items:flex-end;justify-content:center;backdrop-filter:blur(5px);`;

        const box = document.createElement('div');
        box.style.cssText = `background:linear-gradient(135deg,#1a1f3a,#2d3561);border:2px solid #4a9eff;border-radius:20px 20px 0 0;padding:20px;width:100%;max-width:600px;box-shadow:0 0 40px rgba(74,158,255,0.2);max-height:85vh;overflow-y:auto;`;

        // Preset buttons
        const presetBtns = ['optimize', 'balance', 'powersave'];
        const activePreset = config.active_preset || 'balance';

        // Toggle generator
        const createToggle = (id, label, desc) => {
            const on = config[id] === 1;
            return `
            <div class="task-item" data-net="${id}" style="background:${on?'rgba(74,158,255,0.15)':'rgba(255,255,255,0.05)'};border:${on?'1px solid rgba(74,158,255,0.5)':'1px solid transparent'};border-radius:10px;padding:12px;margin-bottom:8px;transition:all 0.2s;">
                <div style="display:flex;justify-content:space-between;align-items:center;">
                    <div style="flex:1;">
                        <div class="net-title" style="color:${on?'#4a9eff':'#fff'};font-size:13px;font-weight:600;margin-bottom:2px;">${label}</div>
                        ${desc ? `<div style="color:#8b92b4;font-size:11px;">${desc}</div>` : ''}
                    </div>
                    <label class="toggle-wrap" style="position:relative;display:inline-block;width:50px;height:26px;cursor:pointer;">
                        <input type="checkbox" class="net-checkbox" data-net="${id}" style="opacity:0;width:0;height:0;">
                        <span class="toggle-slider" style="position:absolute;cursor:pointer;top:0;left:0;right:0;bottom:0;background-color:${on?'#4a9eff':'#555'};transition:.3s;border-radius:26px;box-shadow:${on?'0 0 8px rgba(74,158,255,0.6)':'none'};"></span>
                        <span class="toggle-knob" id="knob-${id}" style="position:absolute;height:20px;width:20px;left:3px;bottom:3px;background-color:white;transition:.3s;border-radius:50%;transform:${on?'translateX(24px)':'translateX(0)'};"></span>
                    </label>
                </div>
            </div>`;
        };

        box.innerHTML = `
            <h3 style="color:#4a9eff;margin:0 0 5px;font-size:18px;text-align:center;">🌐 Network Optimizer</h3>
            <p style="color:#8b92b4;font-size:11px;text-align:center;margin-bottom:15px;">TCP congestion & kernel network tweaks</p>

            <div style="display:flex;gap:8px;margin-bottom:15px;">
                ${presetBtns.map(p => `
                    <button class="preset-btn" data-preset="${p}" style="flex:1;padding:10px;background:${p===activePreset?'#4a9eff':'rgba(255,255,255,0.1)'};color:#fff;border:${p===activePreset?'2px solid #4a9eff':'1px solid transparent'};border-radius:10px;font-size:12px;font-weight:600;cursor:pointer;text-transform:capitalize;transition:all 0.2s;">
                        ${p === 'optimize' ? '⚡ Optimize' : p === 'balance' ? '⚖️ Balance' : '🔋 Powersave'}
                    </button>
                `).join('')}
            </div>

            <div style="background:rgba(0,0,0,0.3);border-radius:10px;padding:12px;margin-bottom:15px;">
                <div style="color:#8b92b4;font-size:11px;margin-bottom:6px;">TCP Congestion Algorithm</div>
                <select id="net-congestion" style="width:100%;padding:10px;background:rgba(0,0,0,0.4);color:#fff;border:1px solid rgba(255,255,255,0.2);border-radius:8px;font-size:13px;">
                    <option value="bbr" ${config.congestion==='bbr'?'selected':''}>BBR (Modern, High Throughput)</option>
                    <option value="bbr2" ${config.congestion==='bbr2'?'selected':''}>BBR2 (Experimental)</option>                    <option value="cubic" ${config.congestion==='cubic'?'selected':''}>Cubic (Default Android)</option>
                    <option value="reno" ${config.congestion==='reno'?'selected':''}>Reno (Legacy, Stable)</option>
                    <option value="westwood" ${config.congestion==='westwood'?'selected':''}>Westwood (WiFi Friendly)</option>
                </select>
            </div>

            <div style="color:#4a9eff;font-size:12px;font-weight:600;margin:10px 0 5px;padding-left:5px;">Advanced TCP Tweaks</div>
            ${createToggle('window_scaling', 'TCP Window Scaling', 'Enable larger window sizes for high bandwidth')}
            ${createToggle('sack', 'Selective ACK (SACK)', 'Improve recovery from packet loss')}
            ${createToggle('timestamps', 'TCP Timestamps', 'Better RTT measurement & PAWS')}
            ${createToggle('fastopen', 'TCP Fast Open', 'Reduce latency on repeated connections')}
            ${createToggle('tw_reuse', 'TIME_WAIT Reuse', 'Recycle sockets faster for high connections')}
            ${createToggle('low_latency', 'Low Latency Mode', 'Prioritize responsiveness over throughput')}

            <div id="net-status" style="text-align:center;font-size:12px;color:#666;margin:15px 0;min-height:35px;padding:10px;background:rgba(0,0,0,0.3);border-radius:10px;display:none;"></div>

            <div style="display:flex;gap:8px;margin-top:5px;">
                <button id="net-cancel-btn" style="flex:1;padding:14px;background:rgba(255,255,255,0.1);color:#fff;border:none;border-radius:12px;font-size:14px;font-weight:600;cursor:pointer;">Cancel</button>
                <button id="net-apply-btn" style="flex:2;padding:14px;background:linear-gradient(135deg,#4a9eff,#2980b9);color:#fff;border:none;border-radius:12px;font-size:14px;font-weight:700;cursor:pointer;">🚀 Apply Tweaks</button>
            </div>

            <div style="margin-top:12px;padding:10px;background:rgba(241,196,15,0.1);border:1px solid rgba(241,196,15,0.3);border-radius:8px;font-size:10px;color:#f1c40f;line-height:1.4;">
                ️ <strong>Note:</strong> Requires root. Some kernels may ignore certain sysctl values. Reboot may be needed for full effect.
            </div>
        `;

        modal.appendChild(box);
        document.body.appendChild(modal);
        modal.onclick = e => { if (e.target === modal) modal.remove(); };

        // ✅ Attach events AFTER DOM insertion
        box.querySelectorAll('.net-checkbox').forEach(cb => {
            cb.checked = config[cb.dataset.net] === 1;
            cb.addEventListener('change', handleNetToggle);
        });

        box.querySelectorAll('.preset-btn').forEach(btn => {
            btn.addEventListener('click', () => applyPreset(btn.dataset.preset));
        });

        document.getElementById('net-cancel-btn').onclick = () => modal.remove();
        document.getElementById('net-apply-btn').onclick = () => applyNetworkTweaks();
    }

    // ✅ Single-click toggle handler
    function handleNetToggle(e) {
        const id = e.target.dataset.net;
        const isChecked = e.target.checked;
        config[id] = isChecked ? 1 : 0;
        updateNetVisuals(id, isChecked);    }

    function updateNetVisuals(id, isEnabled) {
        const item = document.querySelector(`.task-item[data-net="${id}"]`);
        if (!item) return;
        item.style.background = isEnabled ? 'rgba(74,158,255,0.15)' : 'rgba(255,255,255,0.05)';
        item.style.border = isEnabled ? '1px solid rgba(74,158,255,0.5)' : '1px solid transparent';
        
        const title = item.querySelector('.net-title');
        if (title) title.style.color = isEnabled ? '#4a9eff' : '#fff';
        
        const slider = item.querySelector('.toggle-slider');
        if (slider) {
            slider.style.backgroundColor = isEnabled ? '#4a9eff' : '#555';
            slider.style.boxShadow = isEnabled ? '0 0 8px rgba(74,158,255,0.6)' : 'none';
        }
        
        const knob = document.getElementById(`knob-${id}`);
        if (knob) knob.style.transform = isEnabled ? 'translateX(24px)' : 'translateX(0)';
    }

    function applyPreset(presetName) {
        const preset = PRESETS[presetName];
        if (!preset) return;
        
        // Update config with preset values
        Object.assign(config, preset);
        
        // Update UI controls
        const congestionSel = document.getElementById('net-congestion');
        if (congestionSel) congestionSel.value = preset.congestion;
        
        document.querySelectorAll('.net-checkbox').forEach(cb => {
            const id = cb.dataset.net;
            if (preset[id] !== undefined) {
                cb.checked = preset[id] === 1;
                updateNetVisuals(id, preset[id] === 1);
            }
        });
        
        // Highlight active preset button
        document.querySelectorAll('.preset-btn').forEach(btn => {
            const isActive = btn.dataset.preset === presetName;
            btn.style.background = isActive ? '#4a9eff' : 'rgba(255,255,255,0.1)';
            btn.style.border = isActive ? '2px solid #4a9eff' : '1px solid transparent';
        });
        
        config.active_preset = presetName;
    }
    async function applyNetworkTweaks() {
        const statusEl = document.getElementById('net-status');
        const applyBtn = document.getElementById('net-apply-btn');
        const cancelBtn = document.getElementById('net-cancel-btn');
        
        if (!statusEl) return;
        
        // Sync congestion dropdown to config
        const congSel = document.getElementById('net-congestion');
        if (congSel) config.congestion = congSel.value;
        
        await saveConfig();
        
        applyBtn.disabled = true; applyBtn.innerHTML = '⏳ Applying...';
        cancelBtn.disabled = true;
        statusEl.style.display = 'block';
        statusEl.innerHTML = '<span style="color:#4a9eff;">🔧 Applying network tweaks...</span>';

        try {
            const commands = [
                `sysctl -w net.ipv4.tcp_congestion_control=${config.congestion}`,
                `sysctl -w net.core.rmem_max=${config.rmem_max}`,
                `sysctl -w net.core.wmem_max=${config.wmem_max}`,
                `sysctl -w net.ipv4.tcp_rmem="${config.rmem}"`,
                `sysctl -w net.ipv4.tcp_wmem="${config.wmem}"`,
                `sysctl -w net.ipv4.tcp_window_scaling=${config.window_scaling}`,
                `sysctl -w net.ipv4.tcp_sack=${config.sack}`,
                `sysctl -w net.ipv4.tcp_timestamps=${config.timestamps}`,
                `sysctl -w net.ipv4.tcp_fastopen=${config.fastopen}`,
                `sysctl -w net.ipv4.tcp_tw_reuse=${config.tw_reuse}`,
                `sysctl -w net.ipv4.tcp_keepalive_time=${config.keepalive_time}`,
                `sysctl -w net.ipv4.tcp_fin_timeout=${config.fin_timeout}`,
                `sysctl -w net.ipv4.tcp_low_latency=${config.low_latency}`,
                `sysctl -w net.ipv4.tcp_syncookies=1`,
                `sysctl -w net.core.netdev_max_backlog=3000`
            ];

            // Execute with fallback to /proc/sys if sysctl fails
            for (const cmd of commands) {
                const key = cmd.split('=')[0].replace('sysctl -w ', '').trim();
                const val = cmd.split('=')[1].trim();
                await execFn(`su -c "${cmd} 2>/dev/null || echo ${val} > /proc/sys/${key.replace(/\./g, '/')} 2>/dev/null" || true`);
            }

            statusEl.innerHTML = `<span style="color:#32D74B;">✅ Network tweaks applied!</span><br><small style="color:#8b92b4;">Congestion: ${config.congestion.toUpperCase()} | Preset: ${config.active_preset}</small>`;
            
            if (window.showStatus) {
                window.showStatus(`🌐 Network: ${config.congestion} + ${config.active_preset} applied`, '#4a9eff');
            }
                        setTimeout(() => document.getElementById('network-modal')?.remove(), 2000);
        } catch (e) {
            console.error('NetworkTweak: Apply failed:', e);
            statusEl.innerHTML = `<span style="color:#FF453A;">❌ Error: ${e.message}</span>`;
            applyBtn.disabled = false; applyBtn.innerHTML = '🚀 Apply Tweaks';
            cancelBtn.disabled = false;
        }
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();