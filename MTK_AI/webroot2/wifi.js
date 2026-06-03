// wifi.js - WiFi Network Manager with 5GHz Lock & Password Saving
(function() {
    'use strict';

    const CONFIG_DIR = '/sdcard/MTK_AI_Engine/wifi';
    const CONFIG_FILE = `${CONFIG_DIR}/wifi_config.json`;
    let availableNetworks = [];
    let savedNetworks = {};
    let currentNetwork = null;

    // Use global exec if available
    const execFn = typeof exec === 'function' ? exec : async function(cmd, timeout = 5000) {
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
        await loadSavedNetworks();
        await loadCurrentNetwork();
        bindClickHandler();
    }

    async function createConfigDir() {
        try { await execFn(`su -c "mkdir -p ${CONFIG_DIR}"`); } catch (e) {}
    }

    async function loadSavedNetworks() {
        try {
            const raw = await execFn(`su -c "cat ${CONFIG_FILE} 2>/dev/null"`);
            if (raw.trim()) savedNetworks = JSON.parse(raw);
        } catch (e) { savedNetworks = {}; }
    }

    async function saveNetworks() {
        try {
            const json = JSON.stringify(savedNetworks, null, 2);
            // Use echo with proper escaping to handle special characters
            const escapedJson = json.replace(/"/g, '\\"').replace(/\n/g, '\\n');
            await execFn(`su -c "echo '${escapedJson}' > ${CONFIG_FILE}"`);
            console.log('Password saved successfully');
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
                updateDisplay();
            } else {
                currentNetwork = null;
                updateDisplay();
            }
        } catch (e) { currentNetwork = null; updateDisplay(); }
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

    function bindClickHandler() {
        const item = document.getElementById('wifi-item');
        if (!item) return;
        item.style.cursor = 'pointer';
        item.addEventListener('click', showNetworkSelector);
    }

    async function scanNetworks() {
        try {
            if (typeof showStatus === 'function') showStatus(' Scanning WiFi networks...', '#4a9eff');
            
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
                    ssid = standardMatch[4].trim().replace(/^\d+\.\d+\s+/, '').replace(/^"|"$/g, '');
                    security = standardMatch[5];
                }
                
                if (!ssid) {
                    const ssidMatch = line.match(/\d{4,5}\s+(?:-?\d+\s+)?(?:[\d.]+\s+)?([^\[\]]+?)(?=\s*\[|$)/);
                    if (ssidMatch) ssid = ssidMatch[1].trim().replace(/^\d+\.\d+\s+/, '').replace(/^"|"$/g, '');
                }

                if (!frequency) {
                    const freqMatch = line.match(/(\d{4,5})\s*MHz/);
                    if (freqMatch) frequency = parseInt(freqMatch[1]);
                }

                if (!bssid) {
                    const bssidMatch = line.match(/([0-9a-f]{2}:[0-9a-f]{2}:[0-9a-f]{2}:[0-9a-f]{2}:[0-9a-f]{2}:[0-9a-f]{2})/i);
                    if (bssidMatch) bssid = bssidMatch[1];
                }
                
                if (ssid && frequency >= 5000 && !seenSSIDs.has(ssid) && ssid.length > 0 && ssid.length < 33) {
                    seenSSIDs.add(ssid);
                    availableNetworks.push({ ssid, bssid: bssid || '', frequency, signal, security, hasPassword: !!savedNetworks[ssid] });
                }
            });
            availableNetworks.sort((a, b) => b.signal - a.signal);
        } catch (e) { console.error('Scan failed:', e); }
    }

    function showNetworkSelector() {
        const existing = document.getElementById('wifi-modal');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = 'wifi-modal';        modal.style.cssText = `position: fixed; inset: 0; background: rgba(0,0,0,0.75); z-index: 10000; display: flex; align-items: center; justify-content: center; backdrop-filter: blur(4px); animation: fadeIn 0.2s ease;`;

        const box = document.createElement('div');
        box.style.cssText = `background: #1a1f3a; border: 1px solid #2a3152; border-radius: 16px; padding: 24px; width: 90%; max-width: 500px; max-height: 80vh; overflow-y: auto; box-shadow: 0 10px 40px rgba(0,0,0,0.5); animation: slideUp 0.3s ease;`;

        const title = document.createElement('h3');
        title.textContent = ' WiFi Network Manager';
        title.style.cssText = 'color: #fff; margin: 0 0 16px; font-size: 18px; font-weight: 600; text-align: center;';

        const info = document.createElement('div');
        info.style.cssText = 'color: #8b92b4; font-size: 13px; margin-bottom: 20px; text-align: center;';
        info.innerHTML = currentNetwork 
            ? `<strong>Connected:</strong> <span style="color: #32D74B">${currentNetwork.ssid}</span>`
            : '<strong>Status:</strong> Not connected';

        const scanBtn = document.createElement('button');
        scanBtn.textContent = '🔄 Scan 5GHz Networks';
        scanBtn.style.cssText = `width: 100%; padding: 12px; margin-bottom: 16px; background: linear-gradient(135deg, #4a9eff, #2980b9); color: #fff; border: none; border-radius: 12px; font-size: 14px; font-weight: 600; cursor: pointer;`;
        scanBtn.onclick = async () => {
            scanBtn.disabled = true; scanBtn.textContent = '⏳ Scanning...';
            await scanNetworks();
            scanBtn.disabled = false; scanBtn.textContent = '🔄 Scan 5GHz Networks';
            renderNetworkList();
        };

        const networkList = document.createElement('div');
        networkList.id = 'wifi-network-list';
        networkList.style.cssText = 'display: flex; flex-direction: column; gap: 10px; margin-bottom: 20px;';

        const closeBtn = document.createElement('button');
        closeBtn.textContent = 'Cancel';
        closeBtn.style.cssText = `width: 100%; padding: 14px; background: #2a3152; color: #fff; border: none; border-radius: 12px; font-size: 14px; font-weight: 600; cursor: pointer;`;
        closeBtn.onclick = () => modal.remove();

        box.append(title, info, scanBtn, networkList, closeBtn);
        modal.appendChild(box);
        modal.onclick = e => { if (e.target === modal) modal.remove(); };

        const style = document.createElement('style');
        style.textContent = `@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } } @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }`;
        document.head.appendChild(style);
        document.body.appendChild(modal);

        renderNetworkList();
    }

    function renderNetworkList() {
        const list = document.getElementById('wifi-network-list');
        if (!list) return;
        list.innerHTML = '';        
        if (availableNetworks.length === 0) {
            list.innerHTML = '<div style="color: #8b92b4; text-align: center; padding: 20px;">Click "Scan 5GHz Networks" to find networks</div>';
            return;
        }

        availableNetworks.forEach(network => {
            const item = document.createElement('div');
            item.style.cssText = `padding: 16px; background: #151b2d; border: 1px solid #2a3152; border-radius: 12px; cursor: pointer; transition: all 0.2s ease;`;
            
            let actionHtml = '';
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
            
            item.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span style="color: #FF9F0A; font-size: 16px;">🔒</span>
                        <span style="color: #fff; font-weight: 700; font-size: 17px;">${network.ssid}</span>
                    </div>
                    <div style="text-align: right;">
                        <div style="color: ${network.signal > -70 ? '#32D74B' : '#FF9F0A'}; font-weight: 600; font-size: 14px;">${network.signal} dBm</div>
                        <div style="color: #8b92b4; font-size: 12px;">${network.frequency} MHz</div>
                    </div>
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center; padding-top: 10px; border-top: 1px solid #2a3152; margin-top: 10px;">
                    <div style="color: #6b7280; font-size: 11px;">${network.security}</div>
                    ${actionHtml}
                </div>
            `;
            
            item.onmouseenter = () => { item.style.borderColor = '#4a9eff'; item.style.background = '#1e2540'; };
            item.onmouseleave = () => { item.style.borderColor = '#2a3152'; item.style.background = '#151b2d'; };
            
            item.onclick = (e) => {
                if (e.target.classList.contains('forget-btn')) {
                    e.stopPropagation();
                    forgetPassword(network.ssid);
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
        if (savedNetworks[network.ssid]) {
            // Try connecting with saved password first
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
            <div style="display: flex; gap: 10px;">                <button id="pass-cancel-btn" style="flex: 1; padding: 14px; background: #2a3152; color: #fff; border: none; border-radius: 10px; font-weight: 600; cursor: pointer;">Cancel</button>
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
                input.style.borderColor = '#FF3B30'; 
                input.focus();
                return; 
            }
            
            modal.remove();
            // Pass shouldSave flag to executeConnection
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
        if (typeof showStatus === 'function') showStatus(`🔗 Connecting to ${network.ssid} (5GHz)...`, '#4a9eff');
        
        const cmd = `su -c 'cmd wifi connect-network "${network.ssid}" wpa2 "${password}" -b ${network.bssid}'`;
        await execFn(cmd);
        
        await new Promise(resolve => setTimeout(resolve, 3000));
        await execFn('su -c "svc wifi disable"');
        await new Promise(resolve => setTimeout(resolve, 2000));
        await execFn('su -c "svc wifi enable"');
        await new Promise(resolve => setTimeout(resolve, 4000));
        await loadCurrentNetwork();
        
        // Check if we actually connected to the target network
        if (currentNetwork && currentNetwork.ssid === network.ssid) {
            // SUCCESS! Only save if checkbox was checked and it's not already a saved password attempt
            if (shouldSave && !isSavedPassword) {
                savedNetworks[network.ssid] = password;
                await saveNetworks();
                
                // Update the availableNetworks array to show "Saved" status
                const netIndex = availableNetworks.findIndex(n => n.ssid === network.ssid);
                if (netIndex !== -1) {
                    availableNetworks[netIndex].hasPassword = true;
                }
                
                console.log(`✅ Password saved for ${network.ssid}`);
            }
            if (typeof showStatus === 'function') {
                const saveMsg = (shouldSave && !isSavedPassword) ? ' (Password saved)' : '';
                showStatus(`✅ Connected to ${network.ssid}${saveMsg}`, '#32D74B');
            }
            
            // Re-render the network list to show updated status
            renderNetworkList();
        } else {
            // Connection failed - don't save wrong password
            if (typeof showStatus === 'function') showStatus(`❌ Wrong password. Try again.`, '#FF3B30');
            
            // If it was a saved password that failed, remove it
            if (isSavedPassword) {
                delete savedNetworks[network.ssid];
                await saveNetworks();
                
                // Update the availableNetworks array
                const netIndex = availableNetworks.findIndex(n => n.ssid === network.ssid);
                if (netIndex !== -1) {
                    availableNetworks[netIndex].hasPassword = false;
                }
                
                console.log(`🗑️ Removed invalid saved password for ${network.ssid}`);
            }
            
            // Re-show modal for retry
            setTimeout(() => showPasswordModal(network, true, password), 500);
        }
    } catch (e) {
        console.error('Connection failed:', e);
        if (typeof showStatus === 'function') showStatus('❌ Connection failed', '#FF3B30');
        setTimeout(() => showPasswordModal(network, true, password), 500);
    }
}

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
    window.scanNetworks = scanNetworks;
})();