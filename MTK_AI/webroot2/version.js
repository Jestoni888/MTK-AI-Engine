// version.js - Module Version & Live Rollback Manager + GitHub File Manager (Auto-Update Enabled)
(function() {
'use strict';

const ONLINE_HASH_URL = 'https://raw.githubusercontent.com/Jestoni888/MTK-AI-Engine/refs/heads/main/version.txt';
const ONLINE_MANIFEST_URL = 'https://raw.githubusercontent.com/Jestoni888/MTK-AI-Engine/refs/heads/main/manifest.txt';
const LOCAL_PROP_PATH = '/data/adb/modules/MTK_AI/module.prop';
const MODULE_DIR = '/data/adb/modules/MTK_AI';
const BUSYBOX = '/data/adb/modules/MTK_AI/busybox';
const TOKEN_PATH = '/data/adb/modules/MTK_AI/.gh_token';

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
let ghToken = '';
let ghRepos = [];
let ghCurrentRepo = '';
let ghCurrentPath = '';
let ghCurrentFile = null;

async function init() {
    await Promise.all([fetchVersions(), fetchLocalVersion(), loadGhToken()]);
    bindClickHandler();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

async function loadGhToken() {
    try {
        const exists = await execFn(`test -f ${TOKEN_PATH} && echo 1 || echo 0`, 2000);
        if (exists.trim() === '1') {
            const b64 = (await execFn(`cat ${TOKEN_PATH} 2>/dev/null`)).trim();
            if (b64 && b64.length > 0) { try { ghToken = atob(b64); } catch(e) { ghToken = ''; } }
        }
    } catch (e) { ghToken = ''; }
}

async function saveGhToken(token) {
    try {
        const b64 = btoa(token);
        await execFn(`printf '%s' '${b64}' > ${TOKEN_PATH} && chmod 600 ${TOKEN_PATH}`, 3000);
        ghToken = token;
    } catch(e) { console.error('Failed to save token:', e); }
}

async function getGitHubFile(path, ref = 'main') {
    const url = `https://api.github.com/repos/${ghCurrentRepo}/contents/${path}${ref !== 'main' ? '?ref=' + ref : ''}`;
    const res = await fetch(url, {
        headers: { 'Authorization': `token ${ghToken}`, 'Accept': 'application/vnd.github.v3+json' }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
}

async function uploadOrReplaceFile(path, base64Content, message, sha = null) {
    const apiUrl = `https://api.github.com/repos/${ghCurrentRepo}/contents/${path}`;
    if (!sha) { try { const info = await getGitHubFile(path); sha = info.sha; } catch(e) {} }
    const payload = { message: message || 'Update via WebUI', content: base64Content, branch: 'main' };
    if (sha) payload.sha = sha;
    const res = await fetch(apiUrl, {
        method: 'PUT',
        headers: { 'Authorization': `token ${ghToken}`, 'Accept': 'application/vnd.github.v3+json', 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.message || `HTTP ${res.status}`); }
    return await res.json();
}

async function deleteGitHubFile(path, sha) {
    if (!sha) { const info = await getGitHubFile(path); sha = info.sha; }
    const res = await fetch(`https://api.github.com/repos/${ghCurrentRepo}/contents/${path}`, {
        method: 'DELETE',
        headers: { 'Authorization': `token ${ghToken}`, 'Accept': 'application/vnd.github.v3+json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: `Delete ${path} via WebUI`, sha })
    });
    if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.message || `HTTP ${res.status}`); }
    return await res.json();
}

async function renameGitHubFile(oldPath, newPath, newName) {
    const info = await getGitHubFile(oldPath);
    await uploadOrReplaceFile(newPath, info.content, `Rename ${oldPath} to ${newName}`, info.sha);
    await deleteGitHubFile(oldPath, info.sha);
}

async function getFileCommitHistory(path, perPage = 20) {
    const res = await fetch(`https://api.github.com/repos/${ghCurrentRepo}/commits?path=${path}&per_page=${perPage}`, {
        headers: { 'Authorization': `token ${ghToken}`, 'Accept': 'application/vnd.github.v3+json' }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
}

function readFileAsBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function readFileAsText(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsText(file);
    });
}

function decodeBase64UTF8(b64) {
    try {
        const binary = atob(b64.replace(/\n/g, ''));
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return new TextDecoder('utf-8').decode(bytes);
    } catch(e) { return atob(b64.replace(/\n/g, '')); }
}

function encodeUTF8Base64(text) {
    const bytes = new TextEncoder().encode(text);
    let binary = '';
    bytes.forEach(b => binary += String.fromCharCode(b));
    return btoa(binary);
}

// ========== AUTO-UPDATE VERSION CHAIN ==========
async function autoUpdateModuleProp(initialContent) {
    const msgEl = document.getElementById('gh-editor-msg') || document.getElementById('gh-status') || document.getElementById('gh-action-status');
    const setStatus = (text, color) => { if (msgEl) { msgEl.textContent = text; if (color) msgEl.style.color = color; } };
    
    try {
        setStatus('⏳ Uploading initial module.prop...', 'var(--accent-orange)');
        const base64_1 = encodeUTF8Base64(initialContent);
        const res1 = await uploadOrReplaceFile('MTK_AI/module.prop', base64_1, 'Update module.prop via WebUI');
        const commit1Sha = res1.commit.sha;
        const shortSha = commit1Sha.slice(-7);
        
        let updatedContent = initialContent.replace(/^version=.+$/m, (match) => {
            const ver = match.substring(8).replace(/-[a-f0-9]{7}$/, '');
            return `version=${ver}-${shortSha}`;
        });
        
        const vcMatch = updatedContent.match(/^versionCode=(\d+)$/m);
        const versionMatch = updatedContent.match(/^version=(.+)$/m);
        const newVersion = versionMatch ? versionMatch[1] : '';
        const newVersionCode = vcMatch ? parseInt(vcMatch[1]) : null;
        
        setStatus(' Appending SHA to version...', 'var(--accent-orange)');
        const base64_2 = encodeUTF8Base64(updatedContent);
        const res2 = await uploadOrReplaceFile('MTK_AI/module.prop', base64_2, `Update version to ${newVersion}`);
        const commit2Sha = res2.commit.sha;
        
        setStatus(' Updating version.txt...', 'var(--accent-orange)');
        let versionTxtContent = '';
        try {
            const vInfo = await getGitHubFile('version.txt');
            versionTxtContent = decodeBase64UTF8(vInfo.content);
        } catch(e) {}
        versionTxtContent = commit2Sha + '\n' + versionTxtContent;
        await uploadOrReplaceFile('version.txt', encodeUTF8Base64(versionTxtContent), `Prepend commit ${commit2Sha.slice(0,7)}`);
        
        if (newVersion && newVersionCode !== null) {
            setStatus('🔄 Updating update.json...', 'var(--accent-orange)');
            try {
                const uInfo = await getGitHubFile('update.json');
                let uJson = JSON.parse(decodeBase64UTF8(uInfo.content));
                uJson.version = newVersion;
                uJson.versionCode = newVersionCode;
                await uploadOrReplaceFile('update.json', encodeUTF8Base64(JSON.stringify(uJson, null, 2)), `Update to ${newVersion}`);
            } catch(e) { console.error('Failed to update update.json', e); }
        }
        
        setStatus('✅ All version files auto-updated!', 'var(--accent-green)');
        return true;
    } catch (e) {
        setStatus(`❌ Auto-update failed: ${e.message}`, 'var(--accent-red)');
        console.error(e);
        return false;
    }
}

async function fetchVersions() {
    try {
        const hashResponse = await fetch(ONLINE_HASH_URL + '?t=' + Date.now());
        if (!hashResponse.ok) throw new Error('Failed to fetch hashes');
        const hashText = await hashResponse.text();
        const hashes = hashText.split('\n').map(h => h.trim()).filter(h => h.length > 10);
        
        let commitHistory = [];
        let page = 1;
        let hasMore = true;
        
        try {
            while (hasMore) {
                const apiUrl = `https://api.github.com/repos/Jestoni888/MTK-AI-Engine/commits?path=MTK_AI/module.prop&per_page=100&page=${page}&t=${Date.now()}`;
                const apiResponse = await fetch(apiUrl);
                if (apiResponse.ok) {
                    const data = await apiResponse.json();
                    if (data.length === 0) {
                        hasMore = false;
                    } else {
                        commitHistory = commitHistory.concat(data);
                        page++;
                        const allFound = hashes.every(h => commitHistory.some(c => c.sha === h || c.sha.startsWith(h)));
                        if (allFound) hasMore = false;
                    }
                } else {
                    hasMore = false;
                }
            }
        } catch (apiErr) {
            console.error("Pagination error:", apiErr);
        }
        
        availableVersions = await Promise.all(hashes.map(async (hash) => {
            const match = commitHistory.find(c => c.sha === hash || c.sha.startsWith(hash));
            const date = match ? new Date(match.commit.author.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Unknown Date';
            let historicalVersion = hash.substring(0, 7);
            try {
                const propUrl = `https://raw.githubusercontent.com/Jestoni888/MTK-AI-Engine/${hash}/MTK_AI/module.prop?t=${Date.now()}`;
                const propRes = await fetch(propUrl);
                if (propRes.ok) {
                    const propText = await propRes.text();
                    const versionMatch = propText.match(/^version=(.*)$/m);
                    if (versionMatch && versionMatch[1].trim()) historicalVersion = versionMatch[1].trim();
                }
            } catch (e) {}
            return { hash, label: `${historicalVersion} (${date})`, shortHash: hash.substring(0, 7) };
        }));
    } catch (e) { availableVersions = [{ hash: 'error', label: 'Network Error', shortHash: 'err' }]; }
}

async function fetchLocalVersion() {
    try {
        const localProp = await execFn(`cat ${LOCAL_PROP_PATH} 2>/dev/null`);
        const versionMatch = localProp.match(/^version=(.*)$/m);
        const hashMatch = localProp.match(/^versionHash=(.*)$/m);
        localVersion = versionMatch ? versionMatch[1].trim() : 'Unknown';
        localHash = hashMatch ? hashMatch[1].trim() : '';
    } catch (e) { localVersion = 'Unknown'; localHash = ''; }
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
    modal.style.cssText = `position: fixed; inset: 0; background: rgba(0, 0, 0, 0.75); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); z-index: 10000; display: flex; align-items: center; justify-content: center; padding: 15px;`;

    const box = document.createElement('div');
    box.style.cssText = `background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 16px; padding: 20px; width: 100%; max-width: 480px; box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5); color: #ffffff; max-height: 90vh; overflow-y: auto; display: flex; flex-direction: column; gap: 15px;`;

    box.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border-color); padding-bottom: 12px;">
            <div style="font-size: 16px; font-weight: 700; color: #ffffff; display: flex; align-items: center; gap: 8px;">
                <i class="fas fa-code-branch" style="color: var(--accent-blue);"></i> Module Version Manager
            </div>
            <button id="close-ver-modal" style="background: none; border: none; color: #ffffff; font-size: 20px; cursor: pointer; padding: 4px;"><i class="fas fa-times"></i></button>
        </div>

        <div style="background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 12px; padding: 12px 16px;">
            <div style="font-size: 11px; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;">Current Local Version</div>
            <div style="font-size: 15px; font-weight: 700; color: #ffffff;">${localVersion}</div>
            ${localHash ? `<div style="font-size: 11px; color: var(--text-secondary); font-family: monospace; margin-top: 2px;">Hash: ${localHash}</div>` : ''}
        </div>

        <div>
            <label style="font-size: 12px; font-weight: 600; color: #ffffff; margin-bottom: 8px; display: block;">Select Version to Rollback / Switch:</label>
            <select id="version-select" style="width: 100%; padding: 10px 12px; background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 10px; color: #ffffff; font-size: 13px; outline: none; cursor: pointer;">
                ${availableVersions.length > 0 ? availableVersions.map(v => `<option value="${v.hash}">${v.label}</option>`).join('') : '<option value="">No online versions found</option>'}
            </select>
        </div>

        <div style="display: flex; gap: 10px; flex-wrap: wrap;">
            <button id="apply-rollback-btn" style="flex: 1; padding: 12px; background: var(--accent-blue); border: none; border-radius: 10px; color: #ffffff; font-size: 13px; font-weight: 700; cursor: pointer; transition: opacity 0.2s;">
                <i class="fas fa-undo"></i> Apply Rollback
            </button>
            <button id="open-gh-manager-btn" style="flex: 1; padding: 12px; background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 10px; color: #ffffff; font-size: 13px; font-weight: 600; cursor: pointer;">
                <i class="fab fa-github"></i> GitHub Manager
            </button>
        </div>

        <div id="version-status" style="font-size: 12px; text-align: center; min-height: 18px; color: var(--accent-green);"></div>
    `;

    modal.appendChild(box);
    document.body.appendChild(modal);

    document.getElementById('close-ver-modal').onclick = () => modal.remove();
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };

    document.getElementById('apply-rollback-btn').onclick = () => {
        const select = document.getElementById('version-select');
        const selectedHash = select.value;
        const selectedLabel = select.options[select.selectedIndex] ? select.options[select.selectedIndex].text : selectedHash;
        if (selectedHash && selectedHash !== 'error') {
            doRollback(selectedHash, selectedLabel);
        }
    };

    document.getElementById('open-gh-manager-btn').onclick = () => {
        modal.remove();
        showGitHubManagerModal();
    };
}

async function doRollback(hash, label) {
    const statusEl = document.getElementById('version-status');
    if (statusEl) {
        statusEl.textContent = `⏳ Downloading & applying rollback (${label})...`;
        statusEl.style.color = 'var(--accent-orange)';
    }
    try {
        const propUrl = `https://raw.githubusercontent.com/Jestoni888/MTK-AI-Engine/${hash}/MTK_AI/module.prop`;
        const res = await fetch(propUrl);
        if (!res.ok) throw new Error('Failed to fetch module.prop from GitHub');
        const content = await res.text();
        
        const b64 = encodeUTF8Base64(content);
        await execFn(`printf '%s' '${b64}' | base64 -d > ${LOCAL_PROP_PATH}`);
        
        const hashLine = `versionHash=${hash}`;
        await execFn(`grep -q "^versionHash=" ${LOCAL_PROP_PATH} && sed -i "s/^versionHash=.*/${hashLine}/" ${LOCAL_PROP_PATH} || echo "${hashLine}" >> ${LOCAL_PROP_PATH}`);
        
        await fetchLocalVersion();
        if (statusEl) {
            statusEl.textContent = `✅ Rollback applied to ${label}! Reboot recommended.`;
            statusEl.style.color = 'var(--accent-green)';
        }
    } catch(e) {
        if (statusEl) {
            statusEl.textContent = `❌ Rollback failed: ${e.message}`;
            statusEl.style.color = 'var(--accent-red)';
        }
    }
}

function showGitHubManagerModal() {
    const existing = document.getElementById('gh-manager-modal');
    if (existing) existing.remove();

    if (!ghCurrentRepo) ghCurrentRepo = 'Jestoni888/MTK-AI-Engine';

    const modal = document.createElement('div');
    modal.id = 'gh-manager-modal';
    modal.style.cssText = `position: fixed; inset: 0; background: rgba(0,0,0,0.75); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); z-index: 10000; display: flex; align-items: center; justify-content: center; padding: 15px;`;

    const box = document.createElement('div');
    box.style.cssText = `background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 16px; padding: 20px; width: 100%; max-width: 640px; height: 85vh; box-shadow: 0 8px 32px rgba(0,0,0,0.5); color: #ffffff; display: flex; flex-direction: column; gap: 15px;`;

    box.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border-color); padding-bottom: 12px;">
            <div style="font-size: 16px; font-weight: 700; color: #ffffff; display: flex; align-items: center; gap: 8px;">
                <i class="fab fa-github" style="color: var(--accent-blue);"></i> GitHub File Manager Pro
            </div>
            <button id="close-gh-modal" style="background: none; border: none; color: #ffffff; font-size: 20px; cursor: pointer; padding: 4px;"><i class="fas fa-times"></i></button>
        </div>

        <div style="display: flex; gap: 8px; align-items: center; background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 10px; padding: 8px 12px;">
            <i class="fas fa-key" style="color: var(--accent-blue); font-size: 14px;"></i>
            <input type="password" id="gh-token-input" placeholder="GitHub Personal Access Token" value="${ghToken}" style="flex: 1; background: transparent; border: none; color: #ffffff; font-size: 12px; outline: none;" />
            <button id="save-gh-token-btn" style="background: var(--accent-blue); border: none; border-radius: 6px; color: #ffffff; padding: 6px 12px; font-size: 11px; font-weight: 700; cursor: pointer;">Save Token</button>
        </div>

        <div style="display: flex; gap: 8px; align-items: center;">
            <div style="font-size: 12px; font-weight: 600; color: #ffffff;">Repo:</div>
            <input type="text" id="gh-repo-input" value="${ghCurrentRepo}" style="flex: 1; background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 8px; padding: 6px 10px; color: #ffffff; font-size: 12px; outline: none;" />
            <button id="load-repo-btn" style="background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 8px; color: #ffffff; padding: 6px 12px; font-size: 12px; font-weight: 600; cursor: pointer;"><i class="fas fa-sync"></i> Load</button>
        </div>

        <div id="gh-explorer-container" style="flex: 1; overflow-y: auto; background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 12px; padding: 12px; display: flex; flex-direction: column; gap: 10px;">
            <div style="text-align: center; color: var(--text-secondary); padding: 20px;">Loading repository...</div>
        </div>

        <div id="gh-status" style="font-size: 12px; text-align: center; min-height: 18px; color: var(--accent-green);"></div>
    `;

    modal.appendChild(box);
    document.body.appendChild(modal);

    document.getElementById('close-gh-modal').onclick = () => modal.remove();
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };

    document.getElementById('save-gh-token-btn').onclick = async () => {
        const tokenVal = document.getElementById('gh-token-input').value.trim();
        await saveGhToken(tokenVal);
        const statusEl = document.getElementById('gh-status');
        if (statusEl) {
            statusEl.textContent = ' Token saved successfully!';
            statusEl.style.color = 'var(--accent-green)';
        }
        renderGitHubExplorer(document.getElementById('gh-explorer-container'));
    };

    document.getElementById('load-repo-btn').onclick = () => {
        ghCurrentRepo = document.getElementById('gh-repo-input').value.trim();
        ghCurrentPath = '';
        renderGitHubExplorer(document.getElementById('gh-explorer-container'));
    };

    renderGitHubExplorer(document.getElementById('gh-explorer-container'));
}

async function renderGitHubExplorer(container) {
    if (!container) return;
    container.innerHTML = `<div style="text-align: center; color: var(--text-secondary); padding: 20px;"><i class="fas fa-spinner fa-spin"></i> Fetching files...</div>`;

    try {
        const files = await getGitHubFile(ghCurrentPath);
        if (!Array.isArray(files)) {
            container.innerHTML = `<div style="color: var(--accent-red); padding: 10px;">Error: Path is not a folder or repository not found.</div>`;
            return;
        }

        let html = `
            <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border-color); padding-bottom: 8px;">
                <div style="font-size: 12px; font-weight: 600; color: #ffffff; word-break: break-all;">
                    <i class="fas fa-folder-open" style="color: var(--accent-blue);"></i> /${ghCurrentPath}
                </div>
                <div style="display: flex; gap: 6px;">
                    ${ghCurrentPath ? `<button id="gh-nav-back" style="background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 6px; color: #ffffff; padding: 4px 8px; font-size: 11px; cursor: pointer;"><i class="fas fa-arrow-up"></i> Up</button>` : ''}
                    <button id="gh-upload-file-btn" style="background: var(--accent-blue); border: none; border-radius: 6px; color: #ffffff; padding: 4px 8px; font-size: 11px; font-weight: 700; cursor: pointer;"><i class="fas fa-upload"></i> Upload</button>
                    <input type="file" id="gh-file-upload-input" style="display: none;" />
                </div>
            </div>
            <div style="display: flex; flex-direction: column; gap: 6px; flex: 1; overflow-y: auto;">
        `;

        files.sort((a, b) => (a.type === 'dir' ? -1 : 1) - (b.type === 'dir' ? -1 : 1));

        files.forEach(f => {
            const isDir = f.type === 'dir';
            const icon = isDir ? 'fa-folder' : 'fa-file-code';
            const iconColor = isDir ? 'var(--accent-orange)' : 'var(--accent-blue)';

            html += `
                <div class="gh-file-item" style="display: flex; align-items: center; justify-content: space-between; padding: 8px 10px; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 8px; cursor: pointer; transition: border-color 0.2s;" data-path="${f.path}" data-type="${f.type}" data-sha="${f.sha}" data-name="${f.name}">
                    <div style="display: flex; align-items: center; gap: 8px; overflow: hidden;">
                        <i class="fas ${icon}" style="color: ${iconColor}; font-size: 14px;"></i>
                        <span style="font-size: 12px; color: #ffffff; text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">${f.name}</span>
                    </div>
                    ${!isDir ? `
                        <div style="display: flex; gap: 4px;">
                            <button class="gh-hist-btn" data-path="${f.path}" style="background: transparent; border: none; color: var(--text-secondary); padding: 4px; cursor: pointer;" title="History"><i class="fas fa-history"></i></button>
                            <button class="gh-edit-btn" data-path="${f.path}" data-sha="${f.sha}" data-name="${f.name}" style="background: transparent; border: none; color: var(--accent-blue); padding: 4px; cursor: pointer;" title="Edit"><i class="fas fa-edit"></i></button>
                            <button class="gh-del-btn" data-path="${f.path}" data-sha="${f.sha}" style="background: transparent; border: none; color: var(--accent-red); padding: 4px; cursor: pointer;" title="Delete"><i class="fas fa-trash"></i></button>
                        </div>
                    ` : ''}
                </div>
            `;
        });

        html += `</div>`;
        container.innerHTML = html;

        if (document.getElementById('gh-nav-back')) {
            document.getElementById('gh-nav-back').onclick = () => {
                const parts = ghCurrentPath.split('/').filter(Boolean);
                parts.pop();
                ghCurrentPath = parts.join('/');
                renderGitHubExplorer(container);
            };
        }

        const uploadBtn = document.getElementById('gh-upload-file-btn');
        const fileInput = document.getElementById('gh-file-upload-input');
        if (uploadBtn && fileInput) {
            uploadBtn.onclick = () => fileInput.click();
            fileInput.onchange = async (e) => {
                const file = e.target.files[0];
                if (!file) return;
                const statusEl = document.getElementById('gh-status');
                try {
                    if (statusEl) { statusEl.textContent = `⏳ Uploading ${file.name}...`; statusEl.style.color = 'var(--accent-orange)'; }
                    const b64 = await readFileAsBase64(file);
                    const targetPath = ghCurrentPath ? `${ghCurrentPath}/${file.name}` : file.name;
                    await uploadOrReplaceFile(targetPath, b64, `Upload ${file.name} via WebUI`);
                    if (statusEl) { statusEl.textContent = ` Uploaded ${file.name}!`; statusEl.style.color = 'var(--accent-green)'; }
                    renderGitHubExplorer(container);
                } catch(err) {
                    if (statusEl) { statusEl.textContent = `❌ Upload failed: ${err.message}`; statusEl.style.color = 'var(--accent-red)'; }
                }
            };
        }

        container.querySelectorAll('.gh-file-item').forEach(item => {
            item.onclick = (e) => {
                if (e.target.closest('button')) return;
                const type = item.dataset.type;
                const path = item.dataset.path;
                if (type === 'dir') {
                    ghCurrentPath = path;
                    renderGitHubExplorer(container);
                } else {
                    showFileEditorModal({ path, sha: item.dataset.sha, name: item.dataset.name });
                }
            };
        });

        container.querySelectorAll('.gh-edit-btn').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                showFileEditorModal({ path: btn.dataset.path, sha: btn.dataset.sha, name: btn.dataset.name });
            };
        });

        container.querySelectorAll('.gh-del-btn').forEach(btn => {
            btn.onclick = async (e) => {
                e.stopPropagation();
                if (confirm(`Delete ${btn.dataset.path}?`)) {
                    const statusEl = document.getElementById('gh-status');
                    try {
                        if (statusEl) { statusEl.textContent = `⏳ Deleting...`; statusEl.style.color = 'var(--accent-orange)'; }
                        await deleteGitHubFile(btn.dataset.path, btn.dataset.sha);
                        if (statusEl) { statusEl.textContent = ` Deleted ${btn.dataset.path}`; statusEl.style.color = 'var(--accent-green)'; }
                        renderGitHubExplorer(container);
                    } catch(err) {
                        if (statusEl) { statusEl.textContent = `❌ Delete failed: ${err.message}`; statusEl.style.color = 'var(--accent-red)'; }
                    }
                }
            };
        });

        container.querySelectorAll('.gh-hist-btn').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                showCommitHistoryModal(btn.dataset.path);
            };
        });

    } catch (e) {
        container.innerHTML = `<div style="color: var(--accent-red); padding: 10px;">Failed to load files: ${e.message}</div>`;
    }
}

async function showFileEditorModal(fileInfo) {
    const existing = document.getElementById('gh-editor-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'gh-editor-modal';
    modal.style.cssText = `position: fixed; inset: 0; background: rgba(0,0,0,0.75); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); z-index: 10001; display: flex; align-items: center; justify-content: center; padding: 15px;`;

    const box = document.createElement('div');
    box.style.cssText = `background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 16px; padding: 20px; width: 100%; max-width: 680px; height: 85vh; box-shadow: 0 8px 32px rgba(0,0,0,0.5); color: #ffffff; display: flex; flex-direction: column; gap: 12px;`;

    box.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border-color); padding-bottom: 10px;">
            <div style="font-size: 14px; font-weight: 700; color: #ffffff; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                <i class="fas fa-file-signature" style="color: var(--accent-blue);"></i> Edit: ${fileInfo.path}
            </div>
            <button id="close-gh-editor" style="background: none; border: none; color: #ffffff; font-size: 20px; cursor: pointer;"><i class="fas fa-times"></i></button>
        </div>

        <textarea id="gh-editor-textarea" style="flex: 1; background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 10px; padding: 12px; color: #ffffff; font-family: monospace; font-size: 12px; line-height: 1.4; resize: none; outline: none;" placeholder="Loading content..."></textarea>

        <input type="text" id="gh-commit-msg" placeholder="Commit message" value="Update ${fileInfo.name} via WebUI" style="background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 8px; padding: 8px 12px; color: #ffffff; font-size: 12px; outline: none;" />

        <div style="display: flex; gap: 10px; justify-content: flex-end;">
            <button id="cancel-gh-editor" style="padding: 10px 16px; background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 8px; color: #ffffff; font-size: 12px; cursor: pointer;">Cancel</button>
            <button id="save-gh-editor" style="padding: 10px 18px; background: var(--accent-blue); border: none; border-radius: 8px; color: #ffffff; font-size: 12px; font-weight: 700; cursor: pointer;">Save & Commit</button>
        </div>

        <div id="gh-editor-msg" style="font-size: 12px; text-align: center; min-height: 18px; color: var(--accent-green);"></div>
    `;

    modal.appendChild(box);
    document.body.appendChild(modal);

    document.getElementById('close-gh-editor').onclick = () => modal.remove();
    document.getElementById('cancel-gh-editor').onclick = () => modal.remove();

    const textarea = document.getElementById('gh-editor-textarea');
    const msgEl = document.getElementById('gh-editor-msg');

    try {
        const fileData = await getGitHubFile(fileInfo.path);
        const textContent = decodeBase64UTF8(fileData.content);
        textarea.value = textContent;
    } catch(err) {
        msgEl.textContent = `❌ Failed to load content: ${err.message}`;
        msgEl.style.color = 'var(--accent-red)';
    }

    document.getElementById('save-gh-editor').onclick = async () => {
        const content = textarea.value;
        const commitMsg = document.getElementById('gh-commit-msg').value.trim() || `Update ${fileInfo.name}`;

        if (fileInfo.path === 'MTK_AI/module.prop') {
            const ok = await autoUpdateModuleProp(content);
            if (ok) setTimeout(() => modal.remove(), 1500);
        } else {
            try {
                msgEl.textContent = '⏳ Committing file...';
                msgEl.style.color = 'var(--accent-orange)';
                const b64 = encodeUTF8Base64(content);
                await uploadOrReplaceFile(fileInfo.path, b64, commitMsg, fileInfo.sha);
                msgEl.textContent = ' Saved & Committed!';
                msgEl.style.color = 'var(--accent-green)';
                setTimeout(() => modal.remove(), 1200);
            } catch(err) {
                msgEl.textContent = `❌ Commit failed: ${err.message}`;
                msgEl.style.color = 'var(--accent-red)';
            }
        }
    };
}

async function showCommitHistoryModal(path) {
    const existing = document.getElementById('gh-history-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'gh-history-modal';
    modal.style.cssText = `position: fixed; inset: 0; background: rgba(0,0,0,0.75); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); z-index: 10002; display: flex; align-items: center; justify-content: center; padding: 15px;`;

    const box = document.createElement('div');
    box.style.cssText = `background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 16px; padding: 20px; width: 100%; max-width: 580px; height: 75vh; box-shadow: 0 8px 32px rgba(0,0,0,0.5); color: #ffffff; display: flex; flex-direction: column; gap: 12px;`;

    box.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border-color); padding-bottom: 10px;">
            <div style="font-size: 14px; font-weight: 700; color: #ffffff; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                <i class="fas fa-history" style="color: var(--accent-blue);"></i> History: ${path}
            </div>
            <button id="close-gh-hist" style="background: none; border: none; color: #ffffff; font-size: 20px; cursor: pointer;"><i class="fas fa-times"></i></button>
        </div>

        <div id="gh-hist-list" style="flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 8px;">
            <div style="text-align: center; color: var(--text-secondary); padding: 20px;"><i class="fas fa-spinner fa-spin"></i> Fetching commit history...</div>
        </div>
    `;

    modal.appendChild(box);
    document.body.appendChild(modal);

    document.getElementById('close-gh-hist').onclick = () => modal.remove();

    const listEl = document.getElementById('gh-hist-list');

    try {
        const commits = await getFileCommitHistory(path);
        if (!Array.isArray(commits) || commits.length === 0) {
            listEl.innerHTML = `<div style="text-align: center; color: var(--text-secondary); padding: 20px;">No commits found.</div>`;
            return;
        }

        let html = '';
        commits.forEach(c => {
            const author = c.commit.author ? c.commit.author.name : 'Unknown';
            const date = new Date(c.commit.author.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
            const msg = c.commit.message;
            const shortSha = c.sha.substring(0, 7);

            html += `
                <div style="background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 10px; padding: 10px 12px; display: flex; flex-direction: column; gap: 4px;">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <span style="font-size: 11px; font-family: monospace; color: var(--accent-blue);">${shortSha}</span>
                        <span style="font-size: 11px; color: var(--text-secondary);">${date}</span>
                    </div>
                    <div style="font-size: 12px; color: #ffffff; font-weight: 600;">${msg}</div>
                    <div style="font-size: 11px; color: var(--text-secondary);">By ${author}</div>
                </div>
            `;
        });
        listEl.innerHTML = html;
    } catch(err) {
        listEl.innerHTML = `<div style="color: var(--accent-red); padding: 10px;">Failed to load history: ${err.message}</div>`;
    }
}

})();
