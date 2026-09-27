// version.js - Module Version & Live Rollback Manager (File History Fetcher)
(function() {
    'use strict';
    
    // Links & Paths
    const ONLINE_HASH_URL = 'https://raw.githubusercontent.com/Jestoni888/MTK-AI-Engine/refs/heads/main/version.txt';
    const ONLINE_MANIFEST_URL = 'https://raw.githubusercontent.com/Jestoni888/MTK-AI-Engine/refs/heads/main/manifest.txt';
    const GITHUB_API_URL = 'https://api.github.com/repos/Jestoni888/MTK-AI-Engine/commits?path=MTK_AI/module.prop&per_page=100';
    const LOCAL_PROP_PATH = '/data/adb/modules/MTK_AI/module.prop';
    const MODULE_DIR = '/data/adb/modules/MTK_AI';
    const BUSYBOX = '/data/adb/modules/MTK_AI/busybox';
    
    // Safe exec wrapper
    const execFn = typeof window.exec === 'function' ? window.exec : async function(cmd, timeout = 5000) {
        return new Promise(resolve => {
            const cb = `ver_exec_${Date.now()}_${Math.random().toString(36).substring(2)}`;
            const t = setTimeout(() => { delete window[cb]; resolve(''); }, timeout);
            window[cb] = (_, res) => { clearTimeout(t); delete window[cb]; resolve(res || ''); };
            if (window.ksu) ksu.exec(cmd, `window.${cb}`);
            else { clearTimeout(t); resolve(''); }
        });
    };

    let availableVersions = [];
    let localVersion = 'Loading...';
    let localHash = '';

    async function init() {
        await Promise.all([fetchVersions(), fetchLocalVersion()]);
        bindClickHandler();
    }

    async function fetchVersions() {
        try {
            // 1. Fetch the list of hashes from version.txt
            const hashResponse = await fetch(ONLINE_HASH_URL + '?t=' + Date.now());
            if (!hashResponse.ok) throw new Error('Failed to fetch hashes');
            
            const hashText = await hashResponse.text();
            const hashes = hashText.split('\n').map(h => h.trim()).filter(h => h.length > 10);

            // 2. Fetch commit history from GitHub API to get dates
            let commitHistory = [];
            try {
                const apiResponse = await fetch(GITHUB_API_URL + '&t=' + Date.now());
                if (apiResponse.ok) commitHistory = await apiResponse.json();
            } catch (apiErr) { console.warn('GitHub API error, falling back to raw hashes.'); }

            // 3. Fetch actual module.prop content for each hash to get the real version string
            availableVersions = await Promise.all(hashes.map(async (hash) => {
                const match = commitHistory.find(c => c.sha === hash || c.sha.startsWith(hash));
                const date = match ? new Date(match.commit.author.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Unknown Date';
                
                let historicalVersion = hash.substring(0, 7); // Fallback
                
                try {
                    // Fetch the raw module.prop file from this specific commit
                    const propUrl = `https://raw.githubusercontent.com/Jestoni888/MTK-AI-Engine/${hash}/MTK_AI/module.prop?t=${Date.now()}`;
                    const propRes = await fetch(propUrl);
                    if (propRes.ok) {
                        const propText = await propRes.text();
                        // Extract the version= line
                        const versionMatch = propText.match(/^version=(.*)$/m);
                        if (versionMatch && versionMatch[1].trim()) {
                            historicalVersion = versionMatch[1].trim();
                        }
                    }
                } catch (e) {
                    console.warn(`Failed to fetch prop for ${hash}`);
                }

                return { 
                    hash: hash, 
                    label: `${historicalVersion} (${date})`, // e.g., "v2.0.0 (Sep 26, 2026)"
                    shortHash: hash.substring(0, 7) 
                };
            }));

        } catch (e) {
            availableVersions = [{ hash: 'error', label: 'Network Error', shortHash: 'err' }];
        }
    }

    async function fetchLocalVersion() {
        try {
            const localProp = await execFn(`cat ${LOCAL_PROP_PATH} 2>/dev/null`);
            const versionMatch = localProp.match(/^version=(.*)$/m);
            const hashMatch = localProp.match(/^versionHash=(.*)$/m);
            
            localVersion = versionMatch ? versionMatch[1].trim() : 'Unknown';
            localHash = hashMatch ? hashMatch[1].trim() : '';
        } catch (e) { 
            localVersion = 'Unknown'; 
            localHash = '';
        }
        updateCardDisplay();
    }

    function updateCardDisplay() {
        const valEl = document.querySelector('#version-item .setting-value');
        if (valEl) valEl.innerHTML = `${localVersion} <i class="fas fa-chevron-right"></i>`;
    }

    function bindClickHandler() {
        const item = document.getElementById('version-item');
        if (!item) return;
        item.style.cursor = 'pointer';
        item.addEventListener('click', showVersionModal);
    }

    function showVersionModal() {
        const existing = document.getElementById('version-modal');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = 'version-modal';
        modal.style.cssText = `position: fixed; inset: 0; background: rgba(0,0,0,0.85); z-index: 10000; display: flex; align-items: center; justify-content: center; backdrop-filter: blur(5px);`;

        const box = document.createElement('div');
        box.style.cssText = `background: linear-gradient(135deg, #1a1f3a, #2d3561); border: 2px solid #FF453A; border-radius: 20px; padding: 24px; width: 95%; max-width: 450px; box-shadow: 0 0 40px rgba(255, 69, 58, 0.2); max-height: 90vh; overflow-y: auto;`;

        const header = document.createElement('div');
        header.style.cssText = 'text-align: center; margin-bottom: 20px;';
        header.innerHTML = `<h3 style="color: #FF453A; margin: 0; font-size: 20px;">📦 Module Version & Live Rollback</h3><p style="color: #8b92b4; font-size: 12px; margin: 5px 0 0;">Select a historical version to install directly</p>`;

        const localRow = document.createElement('div');
        localRow.style.cssText = 'margin-bottom: 16px;';
        localRow.innerHTML = `<div style="display: flex; justify-content: space-between; margin-bottom: 6px;"><span style="color: #fff; font-size: 13px; font-weight: 600;">Currently Installed</span><span style="color: #32D74B; font-size: 12px;">Local</span></div><div style="background: rgba(0,0,0,0.4); padding: 10px; border-radius: 10px; color: #fff; font-size: 13px; word-break: break-all; border: 1px solid rgba(255,255,255,0.1);">${localVersion}</div>`;

        const selectRow = document.createElement('div');
        selectRow.style.cssText = 'margin-bottom: 16px;';
        selectRow.innerHTML = `<div style="display: flex; justify-content: space-between; margin-bottom: 6px;"><span style="color: #fff; font-size: 13px; font-weight: 600;">Select Target Version</span><span style="color: #0A84FF; font-size: 12px;">GitHub History</span></div>`;
        
        const select = document.createElement('select');
        select.id = 'version-select';
        select.style.cssText = `width: 100%; padding: 12px; background: rgba(0,0,0,0.4); color: #fff; border: 1px solid rgba(255,255,255,0.2); border-radius: 10px; font-size: 13px; outline: none;`;
        
        // Show loading state if versions aren't ready
        if (availableVersions.length === 0 || availableVersions[0].hash === 'error') {
            const option = document.createElement('option');
            option.textContent = 'Loading commit history...';
            select.appendChild(option);
        } else {
            availableVersions.forEach(v => {
                const option = document.createElement('option');
                option.value = v.hash;
                option.textContent = v.label;
                if (v.hash === localHash) option.selected = true;
                select.appendChild(option);
            });
        }
        selectRow.appendChild(select);

        const hashPreview = document.createElement('div');
        hashPreview.style.cssText = `background: rgba(0,0,0,0.4); padding: 10px; border-radius: 10px; color: #FFD700; font-size: 11px; word-break: break-all; border: 1px dashed rgba(255,255,255,0.2); margin-top: 8px; text-align: center;`;
        hashPreview.textContent = `Commit Hash: ${select.value}`;
        select.addEventListener('change', (e) => { hashPreview.textContent = `Commit Hash: ${e.target.value}`; });
        selectRow.appendChild(hashPreview);

        // --- LIVE INSTALL BUTTON ---
        const installBtn = document.createElement('button');
        installBtn.textContent = '⚡ Live Install Selected Version';
        installBtn.style.cssText = `width: 100%; padding: 14px; margin-top: 15px; background: linear-gradient(135deg, #FF453A, #d63031); color: #fff; border: none; border-radius: 12px; font-size: 14px; font-weight: 700; cursor: pointer; box-shadow: 0 4px 15px rgba(255, 69, 58, 0.4);`;
        
        installBtn.onclick = async () => {
            const targetHash = document.getElementById('version-select').value;
            const selectedVersion = availableVersions.find(v => v.hash === targetHash);
            if (targetHash === 'error' || !targetHash || targetHash.length < 10) return alert('Invalid selection or still loading');
            
            installBtn.disabled = true;
            installBtn.style.opacity = '0.7';
            installBtn.textContent = '📥 Fetching manifest...';
            
            try {
                const manifestRes = await fetch(`${ONLINE_MANIFEST_URL}?t=${Date.now()}`);
                if (!manifestRes.ok) throw new Error('Manifest fetch failed');
                const manifestText = await manifestRes.text();
                const lines = manifestText.split('\n').filter(l => l.trim() && !l.startsWith('#'));
                
                installBtn.textContent = `⬇️ Downloading 0/${lines.length} files...`;
                
                let successCount = 0;
                for (let i = 0; i < lines.length; i++) {
                    const parts = lines[i].trim().split(/\s+/);
                    if (parts.length < 2) continue;
                    
                    const destPath = parts[0];
                    let sourceUrl = parts[1];
                    sourceUrl = sourceUrl.replace('refs/heads/main', targetHash);
                    
                    const fullPath = `${MODULE_DIR}/${destPath}`;
                    const dirPath = fullPath.substring(0, fullPath.lastIndexOf('/'));
                    
                    await execFn(`mkdir -p '${dirPath}' && ${BUSYBOX} wget -q -O '${fullPath}' '${sourceUrl}'`, 10000);
                    successCount++;
                    installBtn.textContent = `⬇️ Downloading ${successCount}/${lines.length} files...`;
                }
                
                installBtn.textContent = '🔒 Setting permissions...';
                await execFn(`chmod -R 0755 '${MODULE_DIR}' && chown -R root:root '${MODULE_DIR}'`, 5000);
                
                // Update local module.prop to reflect the new version and hash
                const humanVersion = selectedVersion ? selectedVersion.label.split(' (')[0] : targetHash.substring(0, 7);
                await execFn(`sed -i 's/^version=.*/version=${humanVersion}/' '${LOCAL_PROP_PATH}'`, 3000);
                await execFn(`sed -i 's/^versionHash=.*/versionHash=${targetHash}/' '${LOCAL_PROP_PATH}'`, 3000);
                
                installBtn.textContent = '✅ Live Install Complete! Reboot recommended.';
                installBtn.style.background = 'linear-gradient(135deg, #32D74B, #248a3d)';
                localVersion = humanVersion;
                localHash = targetHash;
                updateCardDisplay();
                
            } catch (err) {
                console.error(err);
                installBtn.textContent = '❌ Installation Failed. Check logs.';
                installBtn.style.background = '#FF453A';
            }
            
            installBtn.disabled = false;
            installBtn.style.opacity = '1';
        };

        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = 'Close';
        cancelBtn.style.cssText = `width: 100%; padding: 12px; margin-top: 10px; background: rgba(255,255,255,0.05); color: #8b92b4; border: none; border-radius: 10px; font-size: 13px; cursor: pointer;`;
        cancelBtn.onclick = () => modal.remove();

        box.append(header, localRow, selectRow, installBtn, cancelBtn);
        modal.appendChild(box);
        document.body.appendChild(modal);
        modal.onclick = e => { if (e.target === modal) modal.remove(); };
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();