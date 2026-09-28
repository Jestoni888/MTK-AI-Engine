// version.js - Module Version & Live Rollback Manager + GitHub File Manager (GitHub SHA + Commit History)
(function() {
'use strict';
const ONLINE_HASH_URL = 'https://raw.githubusercontent.com/Jestoni888/MTK-AI-Engine/refs/heads/main/version.txt';
const ONLINE_MANIFEST_URL = 'https://raw.githubusercontent.com/Jestoni888/MTK-AI-Engine/refs/heads/main/manifest.txt';
const GITHUB_API_URL = 'https://api.github.com/repos/Jestoni888/MTK-AI-Engine/commits?path=MTK_AI/module.prop&per_page=100';
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

async function getGitHubFile(path) {
    const res = await fetch(`https://api.github.com/repos/${ghCurrentRepo}/contents/${path}`, {
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

async function fetchVersions() {
    try {
        const hashResponse = await fetch(ONLINE_HASH_URL + '?t=' + Date.now());
        if (!hashResponse.ok) throw new Error('Failed to fetch hashes');
        const hashText = await hashResponse.text();
        const hashes = hashText.split('\n').map(h => h.trim()).filter(h => h.length > 10);
        let commitHistory = [];
        try { const apiResponse = await fetch(GITHUB_API_URL + '&t=' + Date.now()); if (apiResponse.ok) commitHistory = await apiResponse.json(); } catch (apiErr) {}
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
    modal.style.cssText = `position: fixed; inset: 0; background: rgba(0,0,0,0.8); z-index: 10000; display: flex; align-items: center; justify-content: center;`;
    const box = document.createElement('div');
    box.style.cssText = `background: linear-gradient(135deg, #1a1f3a, #2d3561); border: 2px solid #FF453A; border-radius: 20px; padding: 24px; width: 95%; max-width: 450px; max-height: 90vh; overflow-y: auto;`;
    box.innerHTML = `<h3 style="color: #FF453A; margin: 0 0 20px; text-align: center; font-size: 20px;">📦 Module Version & Live Rollback</h3> <div style="margin-bottom: 16px;"> <div style="display: flex; justify-content: space-between; margin-bottom: 6px;"><span style="color: #fff; font-size: 13px; font-weight: 600;">Currently Installed</span><span style="color: #32D74B; font-size: 12px;">Local</span></div> <div style="background: rgba(0,0,0,0.4); padding: 10px; border-radius: 10px; color: #fff; font-size: 13px; border: 1px solid rgba(255,255,255,0.1);">${localVersion}</div> </div> <div style="margin-bottom: 16px;"> <div style="display: flex; justify-content: space-between; margin-bottom: 6px;"><span style="color: #fff; font-size: 13px; font-weight: 600;">Select Target Version</span><span style="color: #0A84FF; font-size: 12px;">GitHub History</span></div> <select id="version-select" style="width: 100%; padding: 12px; background: rgba(0,0,0,0.4); color: #fff; border: 1px solid rgba(255,255,255,0.2); border-radius: 10px; font-size: 13px;"></select> <div id="hash-preview" style="background: rgba(0,0,0,0.4); padding: 10px; border-radius: 10px; color: #FFD700; font-size: 11px; margin-top: 8px; text-align: center;"></div> </div> <button id="install-btn" style="width: 100%; padding: 14px; background: linear-gradient(135deg, #FF453A, #d63031); color: #fff; border: none; border-radius: 12px; font-size: 14px; font-weight: 700; cursor: pointer;">📥 Live Install Selected Version</button> <button id="gh-manager-btn" style="width: 100%; padding: 12px; margin-top: 10px; background: rgba(255,255,255,0.05); color: #FFD700; border: 1px solid rgba(255,215,0,0.3); border-radius: 10px; font-size: 13px; cursor: pointer;"> GitHub File Manager (Admin)</button> <button id="close-btn" style="width: 100%; padding: 12px; margin-top: 10px; background: rgba(255,255,255,0.05); color: #8b92b4; border: none; border-radius: 10px; font-size: 13px; cursor: pointer;">Close</button>`;
    modal.appendChild(box);
    document.body.appendChild(modal);
    modal.onclick = e => { if (e.target === modal) modal.remove(); };
    const select = box.querySelector('#version-select');
    const hashPreview = box.querySelector('#hash-preview');
    if (availableVersions.length === 0 || availableVersions[0].hash === 'error') {
        const option = document.createElement('option'); option.textContent = 'Loading...'; select.appendChild(option);
    } else {
        availableVersions.forEach(v => {
            const option = document.createElement('option'); option.value = v.hash; option.textContent = v.label;
            if (v.hash === localHash) option.selected = true; select.appendChild(option);
        });
    }
    hashPreview.textContent = `Commit Hash: ${select.value}`;
    select.addEventListener('change', (e) => { hashPreview.textContent = `Commit Hash: ${e.target.value}`; });
    box.querySelector('#install-btn').onclick = async () => {
        const targetHash = select.value;
        const selectedVersion = availableVersions.find(v => v.hash === targetHash);
        if (targetHash === 'error' || !targetHash || targetHash.length < 10) return alert('Invalid selection');
        const btn = box.querySelector('#install-btn');
        btn.disabled = true; btn.style.opacity = '0.7'; btn.textContent = '📥 Fetching manifest...';
        try {
            const targetManifestUrl = ONLINE_MANIFEST_URL.replace('refs/heads/main', targetHash);
            const manifestRes = await fetch(`${targetManifestUrl}?t=${Date.now()}`);
            if (!manifestRes.ok) throw new Error('Manifest fetch failed');
            const manifestText = await manifestRes.text();
            const lines = manifestText.split('\n').filter(l => l.trim() && !l.startsWith('#'));
            btn.textContent = `⬇️ Downloading 0/${lines.length} files...`;
            let successCount = 0;
            for (let i = 0; i < lines.length; i++) {
                const parts = lines[i].trim().split(/\s+/);
                if (parts.length < 2) continue;
                const destPath = parts[0];
                let sourceUrl = parts[1].replace('refs/heads/main', targetHash);
                const fullPath = `${MODULE_DIR}/${destPath}`;
                const dirPath = fullPath.substring(0, fullPath.lastIndexOf('/'));
                await execFn(`mkdir -p '${dirPath}' && ${BUSYBOX} wget -q -O '${fullPath}' '${sourceUrl}'`, 10000);
                successCount++;
                btn.textContent = `⬇️ Downloading ${successCount}/${lines.length} files...`;
            }
            btn.textContent = '🔒 Setting permissions...';
            await execFn(`chmod -R 0755 '${MODULE_DIR}' && chown -R root:root '${MODULE_DIR}'`, 5000);
            const humanVersion = selectedVersion ? selectedVersion.label.split(' (')[0] : targetHash.substring(0, 7);
            await execFn(`sed -i 's/^version=.*/version=${humanVersion}/' '${LOCAL_PROP_PATH}'`, 3000);
            await execFn(`sed -i 's/^versionHash=.*/versionHash=${targetHash}/' '${LOCAL_PROP_PATH}'`, 3000);
            btn.textContent = '✅ Complete! Reboot recommended.';
            btn.style.background = 'linear-gradient(135deg, #32D74B, #248a3d)';
            localVersion = humanVersion; localHash = targetHash;
            updateCardDisplay();
        } catch (err) { btn.textContent = '❌ Failed. Check logs.'; btn.style.background = '#FF453A'; }
        btn.disabled = false; btn.style.opacity = '1';
    };
    box.querySelector('#gh-manager-btn').onclick = () => { modal.remove(); showUploadModal(); };
    box.querySelector('#close-btn').onclick = () => modal.remove();
}

// ========== GITHUB FILE MANAGER ==========
function showUploadModal() {
    const existing = document.getElementById('upload-modal');
    if (existing) existing.remove();
    const modal = document.createElement('div');
    modal.id = 'upload-modal';
    modal.style.cssText = `position: fixed; inset: 0; background: rgba(0,0,0,0.95); z-index: 10001; display: flex; align-items: center; justify-content: center; padding: 8px; box-sizing: border-box;`;
    const box = document.createElement('div');
    box.style.cssText = `background: linear-gradient(135deg, #1a1f3a, #2d3561); border: 2px solid #FFD700; border-radius: 16px; width: 100%; height: 100%; max-width: 100%; max-height: 100%; display: flex; flex-direction: column; overflow: hidden; position: relative;`;
    
    box.innerHTML = `
        <div style="padding: 12px 16px; border-bottom: 1px solid rgba(255,215,0,0.3); display: flex; justify-content: space-between; align-items: center; flex-shrink: 0;">
            <h3 style="color: #FFD700; margin: 0; font-size: 16px;">📤 GitHub File Manager</h3>
            <button id="gh-close-btn" style="background: rgba(255,69,58,0.2); color: #FF453A; border: 1px solid #FF453A; border-radius: 6px; padding: 4px 12px; font-size: 12px; cursor: pointer;">✕ Close</button>
        </div>
        <div id="gh-auth-section" style="padding: 16px; flex-shrink: 0;">
            <label style="color: #fff; font-size: 12px; display:block; margin-bottom: 6px;">GitHub Personal Access Token</label>
            <div style="display: flex; gap: 8px;">
                <input type="text" id="gh-token-input" placeholder="ghp_..." value="" style="flex: 1; padding: 10px; background: rgba(0,0,0,0.4); color: #fff; border: 1px solid rgba(255,255,255,0.2); border-radius: 8px; font-size: 13px;">
                <button id="gh-connect-btn" style="padding: 10px 18px; background: #0A84FF; color: #fff; border: none; border-radius: 8px; font-size: 13px; cursor: pointer; font-weight: bold;">Connect</button>
            </div>
            <div id="gh-status" style="color: #8b92b4; font-size: 12px; text-align: center; margin-top: 8px; min-height: 18px;"></div>
        </div>
        <div id="gh-main-section" style="display:none; flex: 1; overflow: hidden; flex-direction: column; padding: 12px 16px;">
            <select id="gh-repo-select" style="width: 100%; padding: 10px; background: rgba(0,0,0,0.4); color: #fff; border: 1px solid rgba(255,255,255,0.2); border-radius: 8px; font-size: 13px; box-sizing: border-box; margin-bottom: 10px;"></select>
            <div id="gh-breadcrumb" style="color: #FFD700; font-size: 12px; margin-bottom: 8px; font-weight: bold; flex-shrink: 0;">Path: Root</div>
            <div id="gh-file-list" style="flex: 1; overflow-y: auto; background: rgba(0,0,0,0.2); border-radius: 8px; padding: 8px; border: 1px solid rgba(255,255,255,0.1); min-height: 150px;"></div>
            <div style="margin-top: 10px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 10px; flex-shrink: 0;">
                <label style="color: #fff; font-size: 12px; display:block; margin-bottom: 4px;">Upload New File to Current Folder</label>
                <div style="display: flex; gap: 8px;">
                    <input type="file" id="gh-file-input" style="flex: 1; padding: 8px; background: rgba(0,0,0,0.4); color: #fff; border: 1px solid rgba(255,255,255,0.2); border-radius: 8px; font-size: 12px;">
                    <button id="gh-upload-btn" style="padding: 8px 16px; background: linear-gradient(135deg, #FFD700, #d4af37); color: #000; border: none; border-radius: 8px; font-weight: bold; cursor: pointer; font-size: 12px;">Upload</button>
                </div>
            </div>
        </div>
        
        <!-- FILE ACTIONS OVERLAY -->
        <div id="gh-action-overlay" style="display:none; position:absolute; inset:0; background:rgba(0,0,0,0.85); z-index:10; flex-direction:column; padding:20px; box-sizing:border-box; overflow-y:auto;">
            <h4 style="color:#FFD700; margin:0 0 5px; font-size:16px;">File Actions</h4>
            <div id="gh-action-filename" style="color:#fff; font-size:14px; margin-bottom:20px; word-break:break-all;"></div>
            
            <button id="gh-act-edit" style="width:100%; padding:12px; margin-bottom:10px; background:#9B59B6; color:#fff; border:none; border-radius:8px; font-size:13px; font-weight:bold; cursor:pointer;">✏️ Edit File</button>
            <button id="gh-act-replace" style="width:100%; padding:12px; margin-bottom:10px; background:#0A84FF; color:#fff; border:none; border-radius:8px; font-size:13px; font-weight:bold; cursor:pointer;">🔄 Replace with Local File</button>
            <input type="file" id="gh-replace-file-input" style="display:none;">
            
            <div style="display:flex; gap:8px; margin-bottom:10px;">
                <input type="text" id="gh-rename-input" placeholder="Enter new filename..." style="flex:1; padding:10px; background:rgba(0,0,0,0.4); color:#fff; border:1px solid rgba(255,255,255,0.2); border-radius:8px; font-size:13px;">
                <button id="gh-act-rename" style="padding:10px 16px; background:#FF9500; color:#fff; border:none; border-radius:8px; font-size:13px; font-weight:bold; cursor:pointer;">Rename</button>
            </div>
            
            <button id="gh-act-delete" style="width:100%; padding:12px; margin-bottom:10px; background:#FF453A; color:#fff; border:none; border-radius:8px; font-size:13px; font-weight:bold; cursor:pointer;">🗑️ Delete File</button>
            
            <button id="gh-act-viewlink" style="width:100%; padding:12px; margin-bottom:10px; background:#5856D6; color:#fff; border:none; border-radius:8px; font-size:13px; font-weight:bold; cursor:pointer;">🔗 View Raw Link</button>
            <div id="gh-raw-link-container" style="display:none; margin-bottom:10px; padding:10px; background:rgba(0,0,0,0.4); border-radius:8px; border:1px solid rgba(255,255,255,0.2);">
                <div style="color:#8b92b4; font-size:11px; margin-bottom:6px;">Raw HTTPS URL:</div>
                <div id="gh-raw-link-text" style="color:#fff; font-size:12px; word-break:break-all; font-family:monospace; margin-bottom:8px;"></div>
                <button id="gh-copy-link-btn" style="width:100%; padding:8px; background:#32D74B; color:#fff; border:none; border-radius:6px; font-size:12px; font-weight:bold; cursor:pointer;">📋 Copy Link</button>
            </div>
            
            <!-- NEW: GitHub SHA (matches GitHub format) -->
            <button id="gh-act-blobsha" style="width:100%; padding:12px; margin-bottom:10px; background:#17A2B8; color:#fff; border:none; border-radius:8px; font-size:13px; font-weight:bold; cursor:pointer;">🔐 View GitHub Blob SHA</button>
            <div id="gh-blobsha-container" style="display:none; margin-bottom:10px; padding:10px; background:rgba(0,0,0,0.4); border-radius:8px; border:1px solid rgba(255,255,255,0.2);">
                <div style="color:#8b92b4; font-size:11px; margin-bottom:6px;">GitHub Blob SHA (same as shown on GitHub):</div>
                <div id="gh-blobsha-short" style="color:#17A2B8; font-size:14px; font-family:monospace; font-weight:bold; margin-bottom:4px;"></div>
                <div id="gh-blobsha-full" style="color:#8b92b4; font-size:10px; word-break:break-all; font-family:monospace; margin-bottom:8px;"></div>
                <button id="gh-copy-blobsha-btn" style="width:100%; padding:8px; background:#17A2B8; color:#fff; border:none; border-radius:6px; font-size:12px; font-weight:bold; cursor:pointer;">📋 Copy SHA</button>
            </div>
            
            <!-- NEW: View on GitHub -->
            <button id="gh-act-viewongithub" style="width:100%; padding:12px; margin-bottom:10px; background:#24292e; color:#fff; border:none; border-radius:8px; font-size:13px; font-weight:bold; cursor:pointer;">🌐 View on GitHub</button>
            
            <!-- NEW: Commit History -->
            <button id="gh-act-history" style="width:100%; padding:12px; margin-bottom:10px; background:#6E5494; color:#fff; border:none; border-radius:8px; font-size:13px; font-weight:bold; cursor:pointer;">📜 Commit History</button>
            <div id="gh-history-container" style="display:none; margin-bottom:10px; padding:10px; background:rgba(0,0,0,0.4); border-radius:8px; border:1px solid rgba(255,255,255,0.2); max-height:250px; overflow-y:auto;">
                <div id="gh-history-list"></div>
            </div>
            
            <button id="gh-act-cancel" style="width:100%; padding:12px; margin-top:auto; background:rgba(255,255,255,0.1); color:#8b92b4; border:none; border-radius:8px; font-size:13px; cursor:pointer;">Cancel</button>
            <div id="gh-action-status" style="color:#8b92b4; font-size:12px; text-align:center; margin-top:10px; min-height:16px;"></div>
        </div>

        <!-- SIMPLE EDITOR -->
        <div id="gh-simple-editor" style="display:none; position:absolute; inset:0; background:#1e1e1e; z-index:11; flex-direction:column;">
            <div style="padding:10px 16px; border-bottom:1px solid rgba(255,255,255,0.1); display:flex; align-items:center; gap:8px; flex-shrink:0;">
                <button id="gh-editor-back" style="background:transparent; color:#0A84FF; border:1px solid #0A84FF; border-radius:6px; padding:6px 12px; font-size:12px; cursor:pointer;">⬅ Back</button>
                <span id="gh-editor-title" style="color:#FFD700; font-size:13px; font-weight:bold; flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;"></span>
                <button id="gh-editor-save" style="padding:6px 14px; background:#32D74B; color:#fff; border:none; border-radius:6px; font-size:12px; font-weight:bold; cursor:pointer;">💾 Save</button>
            </div>
            <textarea id="gh-simple-textarea" style="flex:1; width:100%; background:#1e1e1e; color:#D4D4D4; border:none; outline:none; padding:12px; font-family:'Courier New', monospace; font-size:13px; line-height:1.5; resize:none; box-sizing:border-box; tab-size:4;"></textarea>
            <div style="padding:6px 16px; background:rgba(0,0,0,0.3); color:#8b92b4; font-size:11px; display:flex; justify-content:space-between; flex-shrink:0; border-top:1px solid rgba(255,255,255,0.1);">
                <span id="gh-editor-msg">Ready</span>
                <span id="gh-editor-size">0 bytes</span>
            </div>
        </div>
    `;
    modal.appendChild(box);
    document.body.appendChild(modal);
    modal.onclick = e => { if (e.target === modal) modal.remove(); };
    
    const statusEl = () => document.getElementById('gh-status');
    const actionStatusEl = () => document.getElementById('gh-action-status');

    if (ghToken) document.getElementById('gh-token-input').value = ghToken;

    async function autoConnect() { if (!ghToken) return; await doConnect(ghToken, true); }
    async function doConnect(token, silent = false) {
        if (!silent) { statusEl().textContent = 'Connecting...'; statusEl().style.color = '#FFD700'; }
        await saveGhToken(token);
        try {
            const res = await fetch('https://api.github.com/user/repos?per_page=100&sort=updated', {
                headers: { 'Authorization': `token ${token}`, 'Accept': 'application/vnd.github.v3+json' }
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            ghRepos = await res.json();
            if (!Array.isArray(ghRepos)) throw new Error('Invalid response');
            const select = document.getElementById('gh-repo-select');
            select.innerHTML = '<option value="">Select a repository...</option>';
            ghRepos.forEach(repo => {
                const opt = document.createElement('option'); opt.value = repo.full_name; opt.textContent = repo.name; select.appendChild(opt);
            });
            document.getElementById('gh-auth-section').style.display = 'none';
            document.getElementById('gh-main-section').style.display = 'flex';
            if (!silent) { statusEl().textContent = '✅ Connected!'; statusEl().style.color = '#32D74B'; }
        } catch (e) { if (!silent) { statusEl().textContent = ` ${e.message}`; statusEl().style.color = '#FF453A'; } }
    }

    document.getElementById('gh-connect-btn').onclick = async () => {
        const token = document.getElementById('gh-token-input').value.trim();
        if (!token) { statusEl().textContent = '❌ Enter a token first.'; statusEl().style.color = '#FF453A'; return; }
        await doConnect(token, false);
    };
    setTimeout(autoConnect, 100);

    document.getElementById('gh-repo-select').onchange = (e) => {
        ghCurrentRepo = e.target.value; ghCurrentPath = ''; updateBreadcrumb();
        if (ghCurrentRepo) fetchDirectoryContents();
    };

    // ========== FILE ACTIONS ==========
    function showFileActions(item) {
        ghCurrentFile = item;
        document.getElementById('gh-action-filename').textContent = item.path;
        document.getElementById('gh-rename-input').value = item.name;
        actionStatusEl().textContent = '';
        document.getElementById('gh-raw-link-container').style.display = 'none';
        document.getElementById('gh-blobsha-container').style.display = 'none';
        document.getElementById('gh-history-container').style.display = 'none';
        document.getElementById('gh-action-overlay').style.display = 'flex';
    }

    document.getElementById('gh-act-cancel').onclick = () => {
        document.getElementById('gh-action-overlay').style.display = 'none';
    };

    // EDIT
    document.getElementById('gh-act-edit').onclick = async () => {
        document.getElementById('gh-action-overlay').style.display = 'none';
        const editor = document.getElementById('gh-simple-editor');
        const textarea = document.getElementById('gh-simple-textarea');
        const title = document.getElementById('gh-editor-title');
        const msg = document.getElementById('gh-editor-msg');
        const sizeEl = document.getElementById('gh-editor-size');
        
        title.textContent = ghCurrentFile.name;
        textarea.value = 'Loading...';
        msg.textContent = 'Loading content...';
        editor.style.display = 'flex';
        
        try {
            const info = await getGitHubFile(ghCurrentFile.path);
            ghCurrentFile = info;
            const decoded = decodeBase64UTF8(info.content);
            textarea.value = decoded;
            sizeEl.textContent = formatBytes(new Blob([decoded]).size);
            msg.textContent = 'Ready - Edit and tap Save';
        } catch(e) {
            textarea.value = 'Failed to load: ' + e.message;
            msg.textContent = 'Error loading file';
        }
    };

    document.getElementById('gh-editor-back').onclick = () => {
        document.getElementById('gh-simple-editor').style.display = 'none';
    };

    document.getElementById('gh-editor-save').onclick = async () => {
        const textarea = document.getElementById('gh-simple-textarea');
        const msg = document.getElementById('gh-editor-msg');
        const saveBtn = document.getElementById('gh-editor-save');
        msg.textContent = 'Saving...';
        saveBtn.disabled = true;
        try {
            const base64Content = encodeUTF8Base64(textarea.value);
            await uploadOrReplaceFile(ghCurrentFile.path, base64Content, `Edit ${ghCurrentFile.name} via WebUI`, ghCurrentFile.sha);
            msg.textContent = '✅ Saved successfully!';
            msg.style.color = '#32D74B';
            setTimeout(() => {
                msg.style.color = '#8b92b4';
                document.getElementById('gh-simple-editor').style.display = 'none';
                fetchDirectoryContents();
            }, 1200);
        } catch(e) {
            msg.textContent = ` Save failed: ${e.message}`;
            msg.style.color = '#FF453A';
        }
        saveBtn.disabled = false;
    };

    // REPLACE
    document.getElementById('gh-act-replace').onclick = () => { document.getElementById('gh-replace-file-input').click(); };
    document.getElementById('gh-replace-file-input').onchange = async (e) => {
        if (!e.target.files.length) return;
        const file = e.target.files[0];
        actionStatusEl().textContent = ` Replacing ${ghCurrentFile.name}...`;
        actionStatusEl().style.color = '#FFD700';
        try {
            const base64 = await readFileAsBase64(file);
            await uploadOrReplaceFile(ghCurrentFile.path, base64, `Replace ${ghCurrentFile.name} via WebUI`, ghCurrentFile.sha);
            actionStatusEl().textContent = '✅ Replaced successfully!';
            actionStatusEl().style.color = '#32D74B';
            setTimeout(() => { document.getElementById('gh-action-overlay').style.display = 'none'; fetchDirectoryContents(); }, 1000);
        } catch(err) { actionStatusEl().textContent = `❌ ${err.message}`; actionStatusEl().style.color = '#FF453A'; }
    };

    // RENAME
    document.getElementById('gh-act-rename').onclick = async () => {
        const newName = document.getElementById('gh-rename-input').value.trim();
        if (!newName || newName === ghCurrentFile.name) return;
        actionStatusEl().textContent = '⏳ Renaming...';
        actionStatusEl().style.color = '#FFD700';
        try {
            const newPath = ghCurrentFile.path.substring(0, ghCurrentFile.path.lastIndexOf('/') + 1) + newName;
            await renameGitHubFile(ghCurrentFile.path, newPath, newName);
            actionStatusEl().textContent = '✅ Renamed successfully!';
            actionStatusEl().style.color = '#32D74B';
            setTimeout(() => { document.getElementById('gh-action-overlay').style.display = 'none'; fetchDirectoryContents(); }, 1000);
        } catch(err) { actionStatusEl().textContent = `❌ ${err.message}`; actionStatusEl().style.color = '#FF453A'; }
    };

    // DELETE
    document.getElementById('gh-act-delete').onclick = async () => {
        if (!confirm(`Are you sure you want to delete ${ghCurrentFile.name}?`)) return;
        actionStatusEl().textContent = ' Deleting...';
        actionStatusEl().style.color = '#FFD700';
        try {
            await deleteGitHubFile(ghCurrentFile.path, ghCurrentFile.sha);
            actionStatusEl().textContent = '✅ Deleted successfully!';
            actionStatusEl().style.color = '#32D74B';
            setTimeout(() => { document.getElementById('gh-action-overlay').style.display = 'none'; fetchDirectoryContents(); }, 1000);
        } catch(err) { actionStatusEl().textContent = `❌ ${err.message}`; actionStatusEl().style.color = '#FF453A'; }
    };

    // VIEW RAW LINK
    document.getElementById('gh-act-viewlink').onclick = () => {
        const rawLink = `https://raw.githubusercontent.com/${ghCurrentRepo}/main/${ghCurrentFile.path}`;
        document.getElementById('gh-raw-link-text').textContent = rawLink;
        document.getElementById('gh-raw-link-container').style.display = 'block';
    };

    document.getElementById('gh-copy-link-btn').onclick = async () => {
        const linkText = document.getElementById('gh-raw-link-text').textContent;
        try {
            await navigator.clipboard.writeText(linkText);
            const b = document.getElementById('gh-copy-link-btn'); b.textContent = '✅ Copied!';
            setTimeout(() => { b.textContent = '📋 Copy Link'; }, 1500);
        } catch(err) {
            const ta = document.createElement('textarea'); ta.value = linkText; ta.style.position = 'fixed'; ta.style.opacity = '0';
            document.body.appendChild(ta); ta.select();
            try { document.execCommand('copy'); const b = document.getElementById('gh-copy-link-btn'); b.textContent = '✅ Copied!'; setTimeout(() => { b.textContent = '📋 Copy Link'; }, 1500); } catch(e) {}
            document.body.removeChild(ta);
        }
    };

    // ========== GITHUB BLOB SHA (matches GitHub format) ==========
    document.getElementById('gh-act-blobsha').onclick = async () => {
        const container = document.getElementById('gh-blobsha-container');
        const shortEl = document.getElementById('gh-blobsha-short');
        const fullEl = document.getElementById('gh-blobsha-full');
        container.style.display = 'block';
        
        // Ensure we have the latest SHA
        try {
            const info = await getGitHubFile(ghCurrentFile.path);
            ghCurrentFile = info;
            const fullSha = info.sha;
            const shortSha = fullSha.substring(0, 7); // GitHub's default short format
            
            shortEl.textContent = shortSha; // Big, bold, like GitHub
            fullEl.textContent = fullSha;   // Full 40-char SHA below
        } catch(e) {
            shortEl.textContent = 'Error';
            fullEl.textContent = e.message;
        }
    };

    document.getElementById('gh-copy-blobsha-btn').onclick = async () => {
        const fullSha = document.getElementById('gh-blobsha-full').textContent;
        if (!fullSha || fullSha.startsWith('Error')) return;
        try {
            await navigator.clipboard.writeText(fullSha);
            const b = document.getElementById('gh-copy-blobsha-btn'); b.textContent = '✅ Copied!';
            setTimeout(() => { b.textContent = '📋 Copy SHA'; }, 1500);
        } catch(err) {
            const ta = document.createElement('textarea'); ta.value = fullSha; ta.style.position = 'fixed'; ta.style.opacity = '0';
            document.body.appendChild(ta); ta.select();
            try { document.execCommand('copy'); const b = document.getElementById('gh-copy-blobsha-btn'); b.textContent = '✅ Copied!'; setTimeout(() => { b.textContent = ' Copy SHA'; }, 1500); } catch(e) {}
            document.body.removeChild(ta);
        }
    };

    // ========== VIEW ON GITHUB ==========
    document.getElementById('gh-act-viewongithub').onclick = () => {
        const githubUrl = `https://github.com/${ghCurrentRepo}/blob/main/${ghCurrentFile.path}`;
        // Try to open in external browser via shell
        execFn(`am start -a android.intent.action.VIEW -d "${githubUrl}" 2>/dev/null`, 3000).catch(() => {});
        // Fallback: show URL for manual copy
        actionStatusEl().textContent = `🌐 Opening: ${githubUrl}`;
        actionStatusEl().style.color = '#24292e';
    };

    // ========== COMMIT HISTORY ==========
    document.getElementById('gh-act-history').onclick = async () => {
        const container = document.getElementById('gh-history-container');
        const listEl = document.getElementById('gh-history-list');
        container.style.display = 'block';
        listEl.innerHTML = '<div style="color:#FFD700; font-size:12px; text-align:center; padding:10px;">⏳ Loading commit history...</div>';
        
        try {
            const commits = await getFileCommitHistory(ghCurrentFile.path, 20);
            listEl.innerHTML = '';
            
            if (!Array.isArray(commits) || commits.length === 0) {
                listEl.innerHTML = '<div style="color:#8b92b4; font-size:12px; text-align:center; padding:10px;">No commits found</div>';
                return;
            }
            
            commits.forEach(commit => {
                const sha = commit.sha;
                const shortSha = sha.substring(0, 7);
                const message = commit.commit.message.split('\n')[0] || 'No message';
                const author = commit.commit.author.name || 'Unknown';
                const date = new Date(commit.commit.author.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                
                const item = document.createElement('div');
                item.style.cssText = 'padding:10px; margin-bottom:8px; background:rgba(0,0,0,0.3); border-radius:6px; border-left:3px solid #6E5494; cursor:pointer;';
                item.innerHTML = `
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                        <span style="color:#17A2B8; font-family:monospace; font-size:12px; font-weight:bold;">${shortSha}</span>
                        <span style="color:#8b92b4; font-size:10px;">${date}</span>
                    </div>
                    <div style="color:#fff; font-size:12px; margin-bottom:4px; word-break:break-word;">${escapeHtml(message)}</div>
                    <div style="color:#8b92b4; font-size:10px;">by ${escapeHtml(author)}</div>
                `;
                item.onclick = () => {
                    // Open this specific commit on GitHub
                    const commitUrl = `https://github.com/${ghCurrentRepo}/commit/${sha}`;
                    execFn(`am start -a android.intent.action.VIEW -d "${commitUrl}" 2>/dev/null`, 3000).catch(() => {});
                    actionStatusEl().textContent = `🌐 Opening commit ${shortSha}...`;
                    actionStatusEl().style.color = '#6E5494';
                };
                listEl.appendChild(item);
            });
        } catch(e) {
            listEl.innerHTML = `<div style="color:#FF453A; font-size:12px; text-align:center; padding:10px;">❌ ${e.message}</div>`;
        }
    };

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // UPLOAD
    document.getElementById('gh-upload-btn').onclick = async () => {
        const fileInput = document.getElementById('gh-file-input');
        if (!fileInput.files.length) { statusEl().textContent = '❌ Select a file first.'; statusEl().style.color = '#FF453A'; return; }
        const file = fileInput.files[0];
        const targetPath = ghCurrentPath ? `${ghCurrentPath}/${file.name}` : file.name;
        statusEl().textContent = `⏳ Uploading ${file.name}...`; statusEl().style.color = '#FFD700';
        try {
            const base64Content = await readFileAsBase64(file);
            await uploadOrReplaceFile(targetPath, base64Content, `Upload ${file.name} via WebUI`);
            statusEl().textContent = '✅ Uploaded!'; statusEl().style.color = '#32D74B';
            fileInput.value = ''; fetchDirectoryContents();
        } catch(e) { statusEl().textContent = `❌ ${e.message}`; statusEl().style.color = '#FF453A'; }
    };

    document.getElementById('gh-close-btn').onclick = () => modal.remove();

    function updateBreadcrumb() { document.getElementById('gh-breadcrumb').textContent = ghCurrentPath ? `Path: ${ghCurrentPath}` : 'Path: Root'; }
    
    async function fetchDirectoryContents() {
        const listEl = document.getElementById('gh-file-list');
        listEl.innerHTML = '<div style="text-align:center; padding: 10px; color: #8b92b4;">Loading...</div>';
        const url = `https://api.github.com/repos/${ghCurrentRepo}/contents/${ghCurrentPath}`;
        try {
            const res = await fetch(url, { headers: { 'Authorization': `token ${ghToken}`, 'Accept': 'application/vnd.github.v3+json' } });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            if (Array.isArray(data)) {
                listEl.innerHTML = '';
                data.sort((a, b) => (a.type === b.type ? 0 : a.type === 'dir' ? -1 : 1));
                if (ghCurrentPath !== '') {
                    const backItem = document.createElement('div');
                    backItem.textContent = '⬅ ..';
                    backItem.style.cssText = 'padding: 10px; color: #0A84FF; cursor: pointer; font-size: 13px; border-bottom: 1px solid rgba(255,255,255,0.05);';
                    backItem.onclick = () => { ghCurrentPath = ghCurrentPath.split('/').slice(0, -1).join('/'); updateBreadcrumb(); fetchDirectoryContents(); };
                    listEl.appendChild(backItem);
                }
                data.forEach(item => {
                    const div = document.createElement('div');
                    const icon = item.type === 'dir' ? '📁' : '';
                    const size = item.size ? ` <span style="color:#8b92b4; font-size:11px;">(${formatBytes(item.size)})</span>` : '';
                    div.innerHTML = `${icon} ${item.name}${size}`;
                    div.style.cssText = 'padding: 10px; color: #fff; cursor: pointer; font-size: 13px; border-bottom: 1px solid rgba(255,255,255,0.05);';
                    div.onclick = () => {
                        if (item.type === 'dir') { ghCurrentPath = ghCurrentPath ? `${ghCurrentPath}/${item.name}` : item.name; updateBreadcrumb(); fetchDirectoryContents(); }
                        else showFileActions(item);
                    };
                    listEl.appendChild(div);
                });
            }
        } catch (e) { listEl.innerHTML = `<div style="color: #FF453A; padding: 10px;">Error: ${e.message}</div>`; }
    }

    function formatBytes(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1048576) return (bytes/1024).toFixed(1) + ' KB';
        return (bytes/1048576).toFixed(1) + ' MB';
    }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
})();