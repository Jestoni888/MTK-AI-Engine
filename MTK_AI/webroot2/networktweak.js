// networktweak.js - Full Network Optimizer for Tools Page
(function() {
    'use strict';

    const CONFIG_FILE = '/sdcard/MTK_AI_Engine/networktweak.conf';
    const PING_HOST = '1.1.1.1';
    const PING_INTERVAL = 5000;
    
    const DEFAULTS = {
        congestion: 'cubic',
        bbr_enabled: 0,
        bbr_min_rtpt: 2000,
        bbr_pacing_gain: 100,
        rmem_max: 2097152,
        wmem_max: 2097152,
        rmem: '4096 87380 2097152',
        wmem: '4096 65536 2097152',
        tcp_rmem_auto: 1,
        tcp_wmem_auto: 1,
        window_scaling: 1,
        sack: 1,
        timestamps: 1,
        fastopen: 0,
        tw_reuse: 0,
        ecn: 1,
        mtu_probing: 1,
        slow_start_after_idle: 1,
        challenge_ack_limit: 1000,
        syncookies: 1,
        syn_retries: 3,
        synack_retries: 2,
        keepalive_time: 600,
        keepalive_intvl: 60,
        keepalive_probes: 3,
        fin_timeout: 30,
        orphan_retries: 3,
        netdev_max_backlog: 3000,
        somaxconn: 1024,
        txqueuelen: 1000,
        low_latency: 0,
        fq_pacing: 1,
        tcp_no_metrics_save: 0,
        tcp_adv_win_scale: 2,
        tcp_moderate_rcvbuf: 1,
        wifi_power_save: 0,
        wifi_scan_interval: 300,
        prefer_5ghz: 1,
        dns_primary: '',
        dns_secondary: '',
        dns_cache: 1,        active_preset: 'balance',
        ping_host: PING_HOST,
        auto_apply: 1
    };

    const PRESETS = {
        optimize: {
            congestion: 'bbr', bbr_enabled: 1,
            rmem_max: 33554432, wmem_max: 33554432,
            rmem: '4096 87380 33554432', wmem: '4096 65536 33554432',
            window_scaling: 1, sack: 1, timestamps: 1, fastopen: 3,
            tw_reuse: 1, ecn: 1, mtu_probing: 1,
            keepalive_time: 300, keepalive_intvl: 30, fin_timeout: 10,
            netdev_max_backlog: 5000, somaxconn: 4096, txqueuelen: 2000,
            low_latency: 1, fq_pacing: 1, tcp_no_metrics_save: 1,
            wifi_power_save: 0, prefer_5ghz: 1, dns_cache: 0,
            active_preset: 'optimize'
        },
        balance: {
            congestion: 'bbr', bbr_enabled: 1,
            rmem_max: 16777216, wmem_max: 16777216,
            rmem: '4096 87380 16777216', wmem: '4096 65536 16777216',
            window_scaling: 1, sack: 1, timestamps: 1, fastopen: 1,
            tw_reuse: 1, ecn: 1, mtu_probing: 1,
            keepalive_time: 600, keepalive_intvl: 60, fin_timeout: 30,
            netdev_max_backlog: 3000, somaxconn: 1024, txqueuelen: 1000,
            low_latency: 0, fq_pacing: 1, tcp_no_metrics_save: 0,
            wifi_power_save: 1, prefer_5ghz: 1, dns_cache: 1,
            active_preset: 'balance'
        },
        powersave: {
            congestion: 'cubic', bbr_enabled: 0,
            rmem_max: 2097152, wmem_max: 2097152,
            rmem: '4096 87380 2097152', wmem: '4096 65536 2097152',
            window_scaling: 1, sack: 1, timestamps: 1, fastopen: 0,
            tw_reuse: 0, ecn: 0, mtu_probing: 0,
            keepalive_time: 1200, keepalive_intvl: 120, fin_timeout: 60,
            netdev_max_backlog: 1000, somaxconn: 128, txqueuelen: 500,
            low_latency: 0, fq_pacing: 0, tcp_no_metrics_save: 0,
            wifi_power_save: 1, prefer_5ghz: 0, dns_cache: 1,
            active_preset: 'powersave'
        },
        gaming: {
            congestion: 'bbr', bbr_enabled: 1,
            rmem_max: 25165824, wmem_max: 25165824,
            rmem: '4096 87380 25165824', wmem: '4096 65536 25165824',
            window_scaling: 1, sack: 1, timestamps: 1, fastopen: 3,
            tw_reuse: 1, ecn: 1, mtu_probing: 2,
            keepalive_time: 180, keepalive_intvl: 20, fin_timeout: 10,
            netdev_max_backlog: 8000, somaxconn: 8192, txqueuelen: 4096,            low_latency: 1, fq_pacing: 1, tcp_no_metrics_save: 1,
            challenge_ack_limit: 2000, syncookies: 1,
            wifi_power_save: 0, prefer_5ghz: 1, dns_cache: 0,
            active_preset: 'gaming'
        }
    };

    const DNS_PRESETS = {
        'auto': { primary: '', secondary: '', label: '🔄 System Default' },
        'cloudflare': { primary: '1.1.1.1', secondary: '1.0.0.1', label: '☁️ Cloudflare' },
        'google': { primary: '8.8.8.8', secondary: '8.8.4.4', label: '🔵 Google' },
        'quad9': { primary: '9.9.9.9', secondary: '149.112.112.112', label: '🔒 Quad9' },
        'opendns': { primary: '208.67.222.222', secondary: '208.67.220.220', label: '🛡️ OpenDNS' },
        'nextdns': { primary: '45.90.28.0', secondary: '45.90.30.0', label: '⚡ NextDNS' }
    };

    let config = { ...DEFAULTS };
    let pingTimer = null;
    let currentPing = '--';
    let currentDNS = { primary: '...', secondary: '...' };

    const execFn = window.exec || async function(cmd, timeout = 10000) {
        return new Promise(resolve => {
            const cb = 'net_exec_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);
            const t = setTimeout(() => { delete window[cb]; resolve(''); }, timeout);
            window[cb] = (_, res) => { clearTimeout(t); delete window[cb]; resolve(res || ''); };
            if (window.ksu) {
                try { ksu.exec(cmd, 'window.' + cb); } 
                catch(e) { clearTimeout(t); resolve(''); }
            } else { 
                clearTimeout(t); 
                resolve(''); 
            }
        });
    };

    async function init() {
        await loadConfig();
        await fetchCurrentDNS();
        bindClickHandler();
        if (document.getElementById('network-tweak-btn')) {
            startPingMonitor();
        }
    }

    async function loadConfig() {
        try {
            const raw = await execFn('cat ' + CONFIG_FILE + ' 2>/dev/null');
            if (raw && raw.trim()) {
                raw.trim().split('\n').forEach(line => {                    const parts = line.split('=');
                    const key = parts[0];
                    const val = parts.slice(1).join('=');
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
            const lines = Object.entries(config).map(([k, v]) => k + '=' + v).join('\n');
            const safeLines = lines.replace(/"/g, '\\"');
            await execFn('mkdir -p /sdcard/MTK_AI_Engine && echo "' + safeLines + '" > ' + CONFIG_FILE + ' && chmod 644 ' + CONFIG_FILE);
            return true;
        } catch (e) { 
            console.warn('NetworkTweak: Config save failed:', e); 
            return false;
        }
    }

    async function fetchCurrentDNS() {
        try {
            const dns1 = await execFn('getprop net.dns1 2>/dev/null');
            const dns2 = await execFn('getprop net.dns2 2>/dev/null');
            currentDNS.primary = dns1?.trim() || 'N/A';
            currentDNS.secondary = dns2?.trim() || 'N/A';
            if (!config.dns_primary) config.dns_primary = currentDNS.primary;
            if (!config.dns_secondary) config.dns_secondary = currentDNS.secondary;
        } catch (e) {
            console.warn('DNS fetch failed:', e);
        }
    }

    function startPingMonitor() {
        if (pingTimer) clearInterval(pingTimer);
        
        const doPing = async () => {
            const host = config.ping_host || PING_HOST;
            try {
                const result = await execFn('ping -c 1 -W 2 ' + host + ' 2>/dev/null | grep "time=" | head -1');
                const match = result?.match(/time[=<](\d+\.?\d*)\s*ms/);
                currentPing = match ? parseFloat(match[1]).toFixed(1) + ' ms' : '✗';
                
                const pingEl = document.getElementById('live-ping-value');
                if (pingEl) pingEl.textContent = currentPing;                
                if (pingEl) {
                    const ms = parseFloat(currentPing);
                    pingEl.style.color = (!isNaN(ms) && ms < 50) ? '#32D74B' : 
                                         (!isNaN(ms) && ms < 150) ? '#FFD600' : '#FF453A';
                }
            } catch (e) {
                currentPing = '✗';
                const pingEl = document.getElementById('live-ping-value');
                if (pingEl) {
                    pingEl.textContent = '✗';
                    pingEl.style.color = '#FF453A';
                }
            }
        };
        
        doPing();
        pingTimer = setInterval(doPing, PING_INTERVAL);
    }

    function stopPingMonitor() {
        if (pingTimer) {
            clearInterval(pingTimer);
            pingTimer = null;
        }
    }

    function bindClickHandler() {
        const btn = document.getElementById('network-tweak-btn');
        if (!btn) return;
        btn.addEventListener('click', () => {
            fetchCurrentDNS();
            showNetworkModal();
            startPingMonitor();
        });
    }

    function createToggle(id, label, desc) {
        const on = config[id] === 1;
        const bg = on ? 'rgba(74,158,255,0.12)' : 'rgba(255,255,255,0.04)';
        const border = on ? '1px solid rgba(74,158,255,0.4)' : '1px solid transparent';
        const titleColor = on ? '#4a9eff' : '#fff';
        const sliderBg = on ? '#4a9eff' : '#555';
        const sliderShadow = on ? '0 0 10px rgba(74,158,255,0.5)' : 'none';
        const knobTransform = on ? 'translateX(24px)' : 'translateX(0)';
        
        return `
        <div class="task-item" data-net="${id}" style="background:${bg};border:${border};border-radius:12px;padding:14px;margin-bottom:10px;transition:all 0.2s;">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;">
                <div style="flex:1;min-width:0;">                    <div class="net-title" style="color:${titleColor};font-size:13px;font-weight:600;margin-bottom:3px;">${label}</div>
                    ${desc ? `<div style="color:#8b92b4;font-size:11px;line-height:1.3;">${desc}</div>` : ''}
                </div>
                <label class="toggle-wrap" style="position:relative;display:inline-block;width:52px;height:28px;cursor:pointer;flex-shrink:0;">
                    <input type="checkbox" class="net-checkbox" data-net="${id}" style="opacity:0;width:0;height:0;">
                    <span class="toggle-slider" style="position:absolute;cursor:pointer;top:0;left:0;right:0;bottom:0;background-color:${sliderBg};transition:.3s;border-radius:28px;box-shadow:${sliderShadow};"></span>
                    <span class="toggle-knob" id="knob-${id}" style="position:absolute;height:22px;width:22px;left:3px;bottom:3px;background-color:white;transition:.3s;border-radius:50%;transform:${knobTransform};box-shadow:0 2px 4px rgba(0,0,0,0.2);"></span>
                </label>
            </div>
        </div>`;
    }

    function showNetworkModal() {
        const existing = document.getElementById('network-modal');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = 'network-modal';
        modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.92);z-index:10000;display:flex;align-items:flex-end;justify-content:center;backdrop-filter:blur(8px);';
        modal.onclick = e => { if (e.target === modal) { stopPingMonitor(); modal.remove(); } };

        const box = document.createElement('div');
        box.style.cssText = 'background:linear-gradient(135deg,#1a1f3a,#2d3561);border:2px solid #4a9eff;border-radius:24px 24px 0 0;padding:20px;width:100%;max-width:650px;box-shadow:0 0 50px rgba(74,158,255,0.25);max-height:90vh;overflow-y:auto;';

        const dnsButtons = Object.entries(DNS_PRESETS).map(([key, dns]) => {
            const isActive = (config.dns_primary === dns.primary && config.dns_secondary === dns.secondary) || 
                            (key === 'auto' && !config.dns_primary);
            const bg = isActive ? '#4a9eff' : 'rgba(255,255,255,0.08)';
            const border = isActive ? '2px solid #4a9eff' : '1px solid rgba(255,255,255,0.15)';
            return '<button class="dns-btn" data-dns="' + key + '" style="flex:1;padding:8px 6px;background:' + bg + ';color:#fff;border:' + border + ';border-radius:8px;font-size:10px;font-weight:600;cursor:pointer;transition:all 0.15s;white-space:nowrap;">' + dns.label + '</button>';
        }).join('');

        const presetButtons = ['optimize', 'balance', 'powersave', 'gaming'].map(p => {
            const isActive = config.active_preset === p;
            const icons = { optimize: '⚡', balance: '⚖️', powersave: '🔋', gaming: '🎮' };
            const labels = { optimize: 'Optimize', balance: 'Balance', powersave: 'Powersave', gaming: 'Gaming' };
            const bg = isActive ? '#4a9eff' : 'rgba(255,255,255,0.08)';
            const border = isActive ? '2px solid #4a9eff' : '1px solid rgba(255,255,255,0.15)';
            return '<button class="preset-btn" data-preset="' + p + '" style="flex:1;min-width:70px;padding:10px 6px;background:' + bg + ';color:#fff;border:' + border + ';border-radius:10px;font-size:11px;font-weight:600;cursor:pointer;text-transform:capitalize;transition:all 0.2s;">' + icons[p] + ' ' + labels[p] + '</button>';
        }).join('');

        const toggleSection = [
            { id: 'window_scaling', label: 'TCP Window Scaling', desc: 'Enable larger window sizes for high bandwidth networks' },
            { id: 'sack', label: 'Selective ACK (SACK)', desc: 'Improve recovery from packet loss events' },
            { id: 'timestamps', label: 'TCP Timestamps', desc: 'Better RTT measurement & PAWS protection' },
            { id: 'fastopen', label: 'TCP Fast Open', desc: 'Reduce latency on repeated connections (TFO)' },
            { id: 'tw_reuse', label: 'TIME_WAIT Reuse', desc: 'Recycle sockets faster for high connection counts' },
            { id: 'ecn', label: 'ECN Support', desc: 'Explicit Congestion Notification for proactive throttling' },
            { id: 'mtu_probing', label: 'TCP MTU Probing', desc: 'Auto-detect optimal packet size to avoid fragmentation' },
            { id: 'fq_pacing', label: 'FQ Packet Pacing', desc: 'Smooth traffic bursts for better latency' },            { id: 'tcp_no_metrics_save', label: 'No Metrics Cache', desc: 'Prevent stale RTT caching on route changes' },
            { id: 'low_latency', label: 'Low Latency Mode', desc: 'Prioritize responsiveness over bulk throughput' },
            { id: 'wifi_power_save', label: 'WiFi Power Save', desc: 'Reduce WiFi power usage (may increase latency)' },
            { id: 'prefer_5ghz', label: 'Prefer 5GHz WiFi', desc: 'Prioritize 5GHz band for lower interference' }
        ].map(t => createToggle(t.id, t.label, t.desc)).join('');

        box.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;padding-bottom:12px;border-bottom:1px solid rgba(255,255,255,0.1);">
                <div>
                    <h3 style="color:#4a9eff;margin:0;font-size:18px;">🌐 Network Optimizer Pro</h3>
                    <p style="color:#8b92b4;font-size:11px;margin:3px 0 0;">TCP stack, DNS & latency tuning</p>
                </div>
                <div style="text-align:right;">
                    <div style="color:#8b92b4;font-size:10px;">LIVE PING</div>
                    <div id="live-ping-value" style="color:#32D74B;font-size:18px;font-weight:700;font-family:monospace;">${currentPing}</div>
                    <div style="color:#666;font-size:9px;margin-top:2px;">to ${config.ping_host || PING_HOST}</div>
                </div>
            </div>

            <div style="display:flex;gap:8px;margin-bottom:15px;flex-wrap:wrap;">
                ${presetButtons}
            </div>

            <div style="background:rgba(0,0,0,0.25);border-radius:12px;padding:12px;margin-bottom:15px;display:grid;grid-template-columns:repeat(3,1fr);gap:8px;text-align:center;">
                <div>
                    <div style="color:#8b92b4;font-size:9px;">CURRENT DNS</div>
                    <div id="current-dns-display" style="color:#fff;font-size:11px;font-weight:600;font-family:monospace;">${currentDNS.primary}</div>
                </div>
                <div>
                    <div style="color:#8b92b4;font-size:9px;">CONGESTION</div>
                    <div style="color:#4a9eff;font-size:11px;font-weight:600;">${(config.congestion || 'cubic').toUpperCase()}</div>
                </div>
                <div>
                    <div style="color:#8b92b4;font-size:9px;">PRESET</div>
                    <div style="color:#FFD600;font-size:11px;font-weight:600;">${(config.active_preset || 'balance').toUpperCase()}</div>
                </div>
            </div>

            <div style="background:rgba(0,0,0,0.25);border-radius:12px;padding:12px;margin-bottom:15px;">
                <div style="color:#8b92b4;font-size:11px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;">
                    <span>TCP Congestion Algorithm</span>
                    <span id="bbr-status" style="color:${(config.congestion==='bbr'||config.congestion==='bbr2')?'#32D74B':'#666'};font-size:10px;font-weight:600;">${(config.congestion==='bbr'||config.congestion==='bbr2')?'✓ BBR Active':'BBR Inactive'}</span>
                </div>
                <select id="net-congestion" style="width:100%;padding:10px;background:rgba(0,0,0,0.4);color:#fff;border:1px solid rgba(255,255,255,0.2);border-radius:8px;font-size:13px;">
                    <option value="bbr" ${config.congestion==='bbr'?'selected':''}>🚀 BBR (Modern, High Throughput)</option>
                    <option value="bbr2" ${config.congestion==='bbr2'?'selected':''}>🧪 BBR2 (Experimental)</option>
                    <option value="cubic" ${config.congestion==='cubic'?'selected':''}>📦 Cubic (Default Android)</option>
                    <option value="reno" ${config.congestion==='reno'?'selected':''}>🔄 Reno (Legacy, Stable)</option>
                    <option value="westwood" ${config.congestion==='westwood'?'selected':''}>📶 Westwood (WiFi Optimized)</option>
                    <option value="vegas" ${config.congestion==='vegas'?'selected':''}>⏱️ Vegas (Delay-Based)</option>                </select>
            </div>

            <div style="background:rgba(0,0,0,0.25);border-radius:12px;padding:12px;margin-bottom:15px;">
                <div style="color:#8b92b4;font-size:11px;margin-bottom:8px;">DNS Resolver (Quick Switch)</div>
                <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px;">${dnsButtons}</div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
                    <input type="text" id="dns-primary" placeholder="Primary DNS" value="${config.dns_primary || ''}" 
                           style="padding:10px;background:rgba(0,0,0,0.4);color:#fff;border:1px solid rgba(255,255,255,0.2);border-radius:8px;font-size:12px;">
                    <input type="text" id="dns-secondary" placeholder="Secondary DNS" value="${config.dns_secondary || ''}" 
                           style="padding:10px;background:rgba(0,0,0,0.4);color:#fff;border:1px solid rgba(255,255,255,0.2);border-radius:8px;font-size:12px;">
                </div>
                <div style="margin-top:8px;display:flex;align-items:center;gap:8px;">
                    <label class="toggle-wrap" style="position:relative;display:inline-flex;align-items:center;gap:6px;cursor:pointer;">
                        <input type="checkbox" id="dns-cache-toggle" ${config.dns_cache===1?'checked':''} style="accent-color:#4a9eff;">
                        <span style="color:#8b92b4;font-size:11px;">Enable DNS caching</span>
                    </label>
                </div>
            </div>

            <div style="color:#4a9eff;font-size:12px;font-weight:600;margin:15px 0 8px;padding-left:5px;display:flex;align-items:center;gap:6px;">
                <span>⚙️ Advanced TCP Tweaks</span>
                <span style="background:rgba(74,158,255,0.15);color:#4a9eff;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:600;">${Object.keys(DEFAULTS).filter(k=>['window_scaling','sack','timestamps','fastopen','tw_reuse','ecn','mtu_probing','fq_pacing'].includes(k)).filter(k=>config[k]===1).length} Active</span>
            </div>
            
            ${toggleSection}

            <details style="background:rgba(0,0,0,0.2);border-radius:12px;padding:12px;margin:15px 0;cursor:pointer;">
                <summary style="color:#4a9eff;font-size:12px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:6px;">
                    📊 Socket Buffer Tuning <span style="color:#8b92b4;font-size:10px;font-weight:400;">(Advanced)</span>
                </summary>
                <div style="margin-top:12px;display:grid;grid-template-columns:1fr 1fr;gap:10px;">
                    <div>
                        <label style="color:#8b92b4;font-size:10px;display:block;margin-bottom:4px;">RMEM Max (bytes)</label>
                        <input type="number" id="rmem-max" value="${config.rmem_max}" 
                               style="width:100%;padding:8px;background:rgba(0,0,0,0.4);color:#fff;border:1px solid rgba(255,255,255,0.2);border-radius:6px;font-size:11px;">
                    </div>
                    <div>
                        <label style="color:#8b92b4;font-size:10px;display:block;margin-bottom:4px;">WMEM Max (bytes)</label>
                        <input type="number" id="wmem-max" value="${config.wmem_max}" 
                               style="width:100%;padding:8px;background:rgba(0,0,0,0.4);color:#fff;border:1px solid rgba(255,255,255,0.2);border-radius:6px;font-size:11px;">
                    </div>
                </div>
                <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;">
                    <label class="toggle-wrap" style="display:inline-flex;align-items:center;gap:6px;cursor:pointer;">
                        <input type="checkbox" id="tcp-rmem-auto" ${config.tcp_rmem_auto===1?'checked':''} style="accent-color:#4a9eff;">
                        <span style="color:#8b92b4;font-size:11px;">Auto-tune RMEM</span>
                    </label>
                    <label class="toggle-wrap" style="display:inline-flex;align-items:center;gap:6px;cursor:pointer;">
                        <input type="checkbox" id="tcp-wmem-auto" ${config.tcp_wmem_auto===1?'checked':''} style="accent-color:#4a9eff;">                        <span style="color:#8b92b4;font-size:11px;">Auto-tune WMEM</span>
                    </label>
                </div>
            </details>

            <div id="net-status" style="text-align:center;font-size:12px;color:#666;margin:15px 0;min-height:40px;padding:12px;background:rgba(0,0,0,0.25);border-radius:12px;display:none;"></div>

            <div style="display:flex;gap:10px;margin-top:10px;">
                <button id="net-cancel-btn" style="flex:1;padding:14px;background:rgba(255,255,255,0.08);color:#fff;border:1px solid rgba(255,255,255,0.15);border-radius:14px;font-size:14px;font-weight:600;cursor:pointer;transition:all 0.2s;">Cancel</button>
                <button id="net-apply-btn" style="flex:2;padding:14px;background:linear-gradient(135deg,#4a9eff,#2980b9);color:#fff;border:none;border-radius:14px;font-size:14px;font-weight:700;cursor:pointer;transition:all 0.2s;box-shadow:0 4px 12px rgba(74,158,255,0.3);">🚀 Apply All Tweaks</button>
            </div>

            <div style="margin-top:15px;padding:12px;background:rgba(241,196,15,0.08);border:1px solid rgba(241,196,15,0.25);border-radius:10px;font-size:10px;color:#f1c40f;line-height:1.5;">
                ⚠️ <strong>Root Required:</strong> Most tweaks need root access. Some kernels may ignore certain sysctl values. Changes persist until reboot unless saved to init script. Config auto-saved to <code>/sdcard/MTK_AI_Engine/</code>.
            </div>
        `;

        modal.appendChild(box);
        document.body.appendChild(modal);

        box.querySelectorAll('.net-checkbox').forEach(cb => {
            cb.checked = config[cb.dataset.net] === 1;
            cb.addEventListener('change', handleNetToggle);
        });

        box.querySelectorAll('.preset-btn').forEach(btn => {
            btn.addEventListener('click', () => applyPreset(btn.dataset.preset));
        });

        box.querySelectorAll('.dns-btn').forEach(btn => {
            btn.addEventListener('click', () => applyDNSPreset(btn.dataset.dns));
        });

        const congSel = document.getElementById('net-congestion');
        if (congSel) {
            congSel.value = config.congestion || 'cubic';
            congSel.addEventListener('change', (e) => {
                config.congestion = e.target.value;
                updateBBRStatus();
            });
        }

        document.getElementById('dns-primary').addEventListener('input', (e) => config.dns_primary = e.target.value);
        document.getElementById('dns-secondary').addEventListener('input', (e) => config.dns_secondary = e.target.value);
        document.getElementById('dns-cache-toggle').addEventListener('change', (e) => config.dns_cache = e.target.checked ? 1 : 0);

        document.getElementById('rmem-max').addEventListener('input', (e) => config.rmem_max = parseInt(e.target.value) || DEFAULTS.rmem_max);
        document.getElementById('wmem-max').addEventListener('input', (e) => config.wmem_max = parseInt(e.target.value) || DEFAULTS.wmem_max);
        document.getElementById('tcp-rmem-auto').addEventListener('change', (e) => config.tcp_rmem_auto = e.target.checked ? 1 : 0);
        document.getElementById('tcp-wmem-auto').addEventListener('change', (e) => config.tcp_wmem_auto = e.target.checked ? 1 : 0);
        document.getElementById('net-cancel-btn').onclick = () => { stopPingMonitor(); modal.remove(); };
        document.getElementById('net-apply-btn').onclick = () => applyNetworkTweaks();

        updateBBRStatus();
        document.getElementById('current-dns-display').textContent = config.dns_primary || currentDNS.primary || 'N/A';
    }

    function updateBBRStatus() {
        const statusEl = document.getElementById('bbr-status');
        if (statusEl) {
            const isBBR = config.congestion === 'bbr' || config.congestion === 'bbr2';
            statusEl.textContent = isBBR ? '✓ BBR Active' : 'BBR Inactive';
            statusEl.style.color = isBBR ? '#32D74B' : '#666';
        }
    }

    function handleNetToggle(e) {
        const id = e.target.dataset.net;
        const isChecked = e.target.checked;
        config[id] = isChecked ? 1 : 0;
        updateNetVisuals(id, isChecked);
        if (id === 'congestion' || id === 'bbr_enabled') updateBBRStatus();
    }

    function updateNetVisuals(id, isEnabled) {
        const item = document.querySelector('.task-item[data-net="' + id + '"]');
        if (!item) return;
        item.style.background = isEnabled ? 'rgba(74,158,255,0.12)' : 'rgba(255,255,255,0.04)';
        item.style.border = isEnabled ? '1px solid rgba(74,158,255,0.4)' : '1px solid transparent';
        
        const title = item.querySelector('.net-title');
        if (title) title.style.color = isEnabled ? '#4a9eff' : '#fff';
        
        const slider = item.querySelector('.toggle-slider');
        if (slider) {
            slider.style.backgroundColor = isEnabled ? '#4a9eff' : '#555';
            slider.style.boxShadow = isEnabled ? '0 0 10px rgba(74,158,255,0.5)' : 'none';
        }
        
        const knob = document.getElementById('knob-' + id);
        if (knob) knob.style.transform = isEnabled ? 'translateX(24px)' : 'translateX(0)';
    }

    function applyPreset(presetName) {
        const preset = PRESETS[presetName];
        if (!preset) return;
        
        Object.assign(config, preset);
                const congestionSel = document.getElementById('net-congestion');
        if (congestionSel) congestionSel.value = preset.congestion;
        
        document.querySelectorAll('.net-checkbox').forEach(cb => {
            const id = cb.dataset.net;
            if (preset[id] !== undefined) {
                cb.checked = preset[id] === 1;
                updateNetVisuals(id, preset[id] === 1);
            }
        });
        
        if (document.getElementById('rmem-max')) {
            document.getElementById('rmem-max').value = preset.rmem_max;
            document.getElementById('wmem-max').value = preset.wmem_max;
        }
        
        document.querySelectorAll('.preset-btn').forEach(btn => {
            const isActive = btn.dataset.preset === presetName;
            btn.style.background = isActive ? '#4a9eff' : 'rgba(255,255,255,0.08)';
            btn.style.border = isActive ? '2px solid #4a9eff' : '1px solid rgba(255,255,255,0.15)';
        });
        
        if (preset.dns_primary !== undefined) {
            config.dns_primary = preset.dns_primary;
            config.dns_secondary = preset.dns_secondary;
            const primaryInput = document.getElementById('dns-primary');
            const secondaryInput = document.getElementById('dns-secondary');
            if (primaryInput) primaryInput.value = preset.dns_primary;
            if (secondaryInput) secondaryInput.value = preset.dns_secondary;
            document.getElementById('current-dns-display').textContent = preset.dns_primary || 'N/A';
        }
        
        updateBBRStatus();
        config.active_preset = presetName;
    }

    function applyDNSPreset(dnsKey) {
        const dns = DNS_PRESETS[dnsKey];
        if (!dns) return;
        
        config.dns_primary = dns.primary;
        config.dns_secondary = dns.secondary;
        
        const primaryInput = document.getElementById('dns-primary');
        const secondaryInput = document.getElementById('dns-secondary');
        if (primaryInput) primaryInput.value = dns.primary;
        if (secondaryInput) secondaryInput.value = dns.secondary;
        
        const dnsDisplay = document.getElementById('current-dns-display');
        if (dnsDisplay) dnsDisplay.textContent = dns.primary || 'System Default';        
        document.querySelectorAll('.dns-btn').forEach(btn => {
            const isActive = btn.dataset.dns === dnsKey;
            btn.style.background = isActive ? '#4a9eff' : 'rgba(255,255,255,0.08)';
            btn.style.border = isActive ? '2px solid #4a9eff' : '1px solid rgba(255,255,255,0.15)';
        });
    }

    async function applyNetworkTweaks() {
        const statusEl = document.getElementById('net-status');
        const applyBtn = document.getElementById('net-apply-btn');
        const cancelBtn = document.getElementById('net-cancel-btn');
        
        if (!statusEl) return;
        
        const congSel = document.getElementById('net-congestion');
        if (congSel) config.congestion = congSel.value;
        
        await saveConfig();
        
        applyBtn.disabled = true; 
        applyBtn.innerHTML = '⏳ Applying...';
        applyBtn.style.opacity = '0.7';
        cancelBtn.disabled = true;
        statusEl.style.display = 'block';
        statusEl.innerHTML = '<span style="color:#4a9eff;">🔧 Applying network optimizations...</span>';

        try {
            const cmds = [];
            
            cmds.push('sysctl -w net.ipv4.tcp_congestion_control=' + config.congestion + ' 2>/dev/null || echo ' + config.congestion + ' > /proc/sys/net/ipv4/tcp_congestion_control 2>/dev/null');
            
            if (config.congestion === 'bbr' || config.congestion === 'bbr2') {
                cmds.push('sysctl -w net.ipv4.tcp_bbr_min_rtt_ms=' + config.bbr_min_rtpt + ' 2>/dev/null || true');
                cmds.push('sysctl -w net.ipv4.tcp_bbr_pacing_gain=' + config.bbr_pacing_gain + ' 2>/dev/null || true');
            }
            
            cmds.push('sysctl -w net.core.rmem_max=' + config.rmem_max + ' 2>/dev/null || echo ' + config.rmem_max + ' > /proc/sys/net/core/rmem_max 2>/dev/null');
            cmds.push('sysctl -w net.core.wmem_max=' + config.wmem_max + ' 2>/dev/null || echo ' + config.wmem_max + ' > /proc/sys/net/core/wmem_max 2>/dev/null');
            cmds.push('sysctl -w net.ipv4.tcp_rmem="' + config.rmem + '" 2>/dev/null || echo "' + config.rmem + '" > /proc/sys/net/ipv4/tcp_rmem 2>/dev/null');
            cmds.push('sysctl -w net.ipv4.tcp_wmem="' + config.wmem + '" 2>/dev/null || echo "' + config.wmem + '" > /proc/sys/net/ipv4/tcp_wmem 2>/dev/null');
            if (config.tcp_rmem_auto) cmds.push('sysctl -w net.ipv4.tcp_moderate_rcvbuf=1 2>/dev/null || true');
            
            cmds.push('sysctl -w net.ipv4.tcp_window_scaling=' + config.window_scaling + ' 2>/dev/null || true');
            cmds.push('sysctl -w net.ipv4.tcp_sack=' + config.sack + ' 2>/dev/null || true');
            cmds.push('sysctl -w net.ipv4.tcp_timestamps=' + config.timestamps + ' 2>/dev/null || true');
            cmds.push('sysctl -w net.ipv4.tcp_fastopen=' + config.fastopen + ' 2>/dev/null || true');
            cmds.push('sysctl -w net.ipv4.tcp_tw_reuse=' + config.tw_reuse + ' 2>/dev/null || true');
            cmds.push('sysctl -w net.ipv4.tcp_ecn=' + config.ecn + ' 2>/dev/null || true');
            cmds.push('sysctl -w net.ipv4.tcp_mtu_probing=' + config.mtu_probing + ' 2>/dev/null || true');            cmds.push('sysctl -w net.ipv4.tcp_slow_start_after_idle=' + config.slow_start_after_idle + ' 2>/dev/null || true');
            cmds.push('sysctl -w net.ipv4.tcp_challenge_ack_limit=' + config.challenge_ack_limit + ' 2>/dev/null || true');
            cmds.push('sysctl -w net.ipv4.tcp_syncookies=' + config.syncookies + ' 2>/dev/null || true');
            cmds.push('sysctl -w net.ipv4.tcp_syn_retries=' + config.syn_retries + ' 2>/dev/null || true');
            cmds.push('sysctl -w net.ipv4.tcp_synack_retries=' + config.synack_retries + ' 2>/dev/null || true');
            cmds.push('sysctl -w net.ipv4.tcp_no_metrics_save=' + config.tcp_no_metrics_save + ' 2>/dev/null || true');
            cmds.push('sysctl -w net.ipv4.tcp_adv_win_scale=' + config.tcp_adv_win_scale + ' 2>/dev/null || true');
            if (config.fq_pacing) cmds.push('sysctl -w net.core.default_qdisc=fq 2>/dev/null || true');
            
            cmds.push('sysctl -w net.ipv4.tcp_keepalive_time=' + config.keepalive_time + ' 2>/dev/null || true');
            cmds.push('sysctl -w net.ipv4.tcp_keepalive_intvl=' + config.keepalive_intvl + '2>/dev/null || true');
            cmds.push('sysctl -w net.ipv4.tcp_keepalive_probes=' + config.keepalive_probes + ' 2>/dev/null || true');
            cmds.push('sysctl -w net.ipv4.tcp_fin_timeout=' + config.fin_timeout + ' 2>/dev/null || true');
            cmds.push('sysctl -w net.ipv4.tcp_max_orphans=' + (config.orphan_retries * 128) + ' 2>/dev/null || true');
            
            cmds.push('sysctl -w net.core.netdev_max_backlog=' + config.netdev_max_backlog + ' 2>/dev/null || true');
            cmds.push('sysctl -w net.core.somaxconn=' + config.somaxconn + ' 2>/dev/null || true');
            cmds.push('ip link set dev wlan0 txqueuelen ' + config.txqueuelen + ' 2>/dev/null || true');
            
            if (config.low_latency) {
                cmds.push('sysctl -w net.ipv4.tcp_low_latency=1 2>/dev/null || true');
                cmds.push('sysctl -w net.ipv4.tcp_fastopen=3 2>/dev/null || true');
            }
            
            if (config.dns_primary) {
                cmds.push('setprop net.dns1 ' + config.dns_primary + ' 2>/dev/null || true');
                cmds.push('setprop net.dns2 ' + (config.dns_secondary || config.dns_primary) + ' 2>/dev/null || true');
                cmds.push('ndc resolver flushdefaultnet 2>/dev/null || true');
                cmds.push('ndc resolver flushif wlan0 2>/dev/null || true');
            }
            
            if (config.wifi_power_save !== undefined) {
                const psMode = config.wifi_power_save ? '1' : '0';
                cmds.push('echo ' + psMode + ' > /sys/module/wlan/parameters/ps_enable 2>/dev/null || true');
                cmds.push('wifi setpower ' + psMode + ' 2>/dev/null || true');
            }
            if (config.prefer_5ghz) {
                cmds.push('cmd wifi set-wifi-enabled enabled 2>/dev/null || true');
                cmds.push('cmd wifi set-5ghz-priority enabled 2>/dev/null || true');
            }
            
            for (const cmd of cmds) {
                await execFn('su -c "' + cmd + '" 2>/dev/null || true');
            }

            statusEl.innerHTML = '<span style="color:#32D74B;">✅ Network optimizations applied!</span><br><small style="color:#8b92b4;">' + config.congestion.toUpperCase() + ' • ' + config.active_preset + ' • DNS: ' + (config.dns_primary || 'System') + '</small>';
            
            if (window.showStatus) {
                window.showStatus('🌐 Network: ' + config.congestion + ' + ' + config.active_preset + ' • DNS: ' + (config.dns_primary || 'Auto'), '#4a9eff');
            }            
            await fetchCurrentDNS();
            const dnsDisplay = document.getElementById('current-dns-display');
            if (dnsDisplay) dnsDisplay.textContent = config.dns_primary || currentDNS.primary || 'N/A';
            
            setTimeout(() => {
                if (document.getElementById('network-modal')) {
                    stopPingMonitor();
                    document.getElementById('network-modal').remove();
                }
            }, 2500);
            
        } catch (e) {
            console.error('NetworkTweak: Apply failed:', e);
            statusEl.innerHTML = '<span style="color:#FF453A;">❌ Error: ' + (e.message || 'Unknown') + '</span>';
            applyBtn.disabled = false; 
            applyBtn.innerHTML = '🚀 Apply All Tweaks';
            applyBtn.style.opacity = '1';
            cancelBtn.disabled = false;
        }
    }

    window.addEventListener('beforeunload', () => {
        stopPingMonitor();
    });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();