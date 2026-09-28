// version.js - Module Version & Live Rollback Manager + Pro GitHub Editor (Fixed)
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
let CURL_BIN = 'curl';
let editorRawText = '';
let searchMatches = [];
let currentMatchIndex = -1;
let isEditing = false;

async function init() {
    await Promise.all([fetchVersions(), fetchLocalVersion(), loadGhToken(), detectCurl()]);
    bindClickHandler();
}

async function detectCurl() {
    const res = await execFn('which curl || ls /system/bin/curl || ls /system/xbin/curl', 2000);
    if (res && res.trim()) CURL_BIN = res.trim().split('\n')[0];
}

async function loadGhToken() {
    try {
        const exists = await execFn(`test -f ${TOKEN_PATH} && echo 1 || echo 0`, 2000);
        if (exists.trim() === '1') {
            // Read the file directly (it's stored as Base64)
            const b64 = (await execFn(`cat ${TOKEN_PATH} 2>/dev/null`)).trim();
            if (b64 && b64.length > 0) {
                try {
                    ghToken = atob(b64);
                    console.log('Token loaded successfully');
                } catch(e) {
                    console.error('Failed to decode token:', e);
                    ghToken = '';
                }
            }
        }
    } catch (e) { 
        console.error('Error loading token:', e);
        ghToken = ''; 
    }
}

async function saveGhToken(token) {
    try {
        const b64 = btoa(token);
        await execFn(`printf '%s' '${b64}' > ${TOKEN_PATH} && chmod 600 ${TOKEN_PATH}`, 3000);
        ghToken = token;
        console.log('Token saved successfully');
    } catch(e) {
        console.error('Failed to save token:', e);
    }
}

async function uploadFileToGitHub(filePath, contentBase64, commitMsg, token, existingSha = '') {
    if (CURL_BIN === 'curl' && !await execFn('which curl', 1000)) throw new Error('curl not installed');
    const apiUrl = `https://api.github.com/repos/${ghCurrentRepo}/contents/${filePath}`;
    let sha = existingSha;
    if (!sha) {
        const checkRes = await fetch(apiUrl, { headers: { 'Authorization': `token ${token}`, 'Accept': 'application/vnd.github.v3+json' } });
        if (checkRes.ok) { const data = await checkRes.json(); if (data.sha) sha = data.sha; }
    }
    const payload = { message: commitMsg, content: contentBase64, branch: 'main' };
    if (sha) payload.sha = sha;
    const tmpFile = '/data/local/tmp/gh_payload.json';
    const payloadB64 = btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
    await execFn(`printf '%s' '${payloadB64}' | ${BUSYBOX} base64 -d > ${tmpFile}`, 5000);
    const putCmd = `${CURL_BIN} -s -w "\n%{http_code}" -X PUT -H "Authorization: token ${token}" -H "Accept: application/vnd.github.v3+json" -H "Content-Type: application/json" -d @${tmpFile} "${apiUrl}"`;
    const putRes = await execFn(putCmd, 15000);
    await execFn(`rm -f ${tmpFile}`, 2000);
    const lines = putRes.trim().split('\n');
    const httpCode = lines.pop();
    const resBody = lines.join('\n');
    if (httpCode !== '200' && httpCode !== '201') {
        let errMsg = 'Action failed';
        try { errMsg = JSON.parse(resBody).message; } catch(e) {}
        throw new Error(`${errMsg} (HTTP ${httpCode})`);
    }
    return JSON.parse(resBody);
}

function readFileAsBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

async function fetchVersions() {
    try {
        const hashResponse = await fetch(ONLINE_HASH_URL + '?t=' + Date.now());
        if (!hashResponse.ok) throw new Error('Failed to fetch hashes');
        const hashText = await hashResponse.text();
        const hashes = hashText.split('\n').map(h => h.trim()).filter(h => h.length > 10);
        let commitHistory = [];
        try {
            const apiResponse = await fetch(GITHUB_API_URL + '&t=' + Date.now());
            if (apiResponse.ok) commitHistory = await apiResponse.json();
        } catch (apiErr) {}
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
    box.innerHTML = `
        <h3 style="color: #FF453A; margin: 0 0 20px; text-align: center; font-size: 20px;">📦 Module Version & Live Rollback</h3>
        <div style="margin-bottom: 16px;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 6px;"><span style="color: #fff; font-size: 13px; font-weight: 600;">Currently Installed</span><span style="color: #32D74B; font-size: 12px;">Local</span></div>
            <div style="background: rgba(0,0,0,0.4); padding: 10px; border-radius: 10px; color: #fff; font-size: 13px; border: 1px solid rgba(255,255,255,0.1);">${localVersion}</div>
        </div>
        <div style="margin-bottom: 16px;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 6px;"><span style="color: #fff; font-size: 13px; font-weight: 600;">Select Target Version</span><span style="color: #0A84FF; font-size: 12px;">GitHub History</span></div>
            <select id="version-select" style="width: 100%; padding: 12px; background: rgba(0,0,0,0.4); color: #fff; border: 1px solid rgba(255,255,255,0.2); border-radius: 10px; font-size: 13px;"></select>
            <div id="hash-preview" style="background: rgba(0,0,0,0.4); padding: 10px; border-radius: 10px; color: #FFD700; font-size: 11px; margin-top: 8px; text-align: center;"></div>
        </div>
        <button id="install-btn" style="width: 100%; padding: 14px; background: linear-gradient(135deg, #FF453A, #d63031); color: #fff; border: none; border-radius: 12px; font-size: 14px; font-weight: 700; cursor: pointer;"> Live Install Selected Version</button>
        <button id="gh-manager-btn" style="width: 100%; padding: 12px; margin-top: 10px; background: rgba(255,255,255,0.05); color: #FFD700; border: 1px solid rgba(255,215,0,0.3); border-radius: 10px; font-size: 13px; cursor: pointer;"> GitHub File Manager (Admin)</button>
        <button id="close-btn" style="width: 100%; padding: 12px; margin-top: 10px; background: rgba(255,255,255,0.05); color: #8b92b4; border: none; border-radius: 10px; font-size: 13px; cursor: pointer;">Close</button>
    `;
    modal.appendChild(box);
    document.body.appendChild(modal);
    modal.onclick = e => { if (e.target === modal) modal.remove(); };

    const select = box.querySelector('#version-select');
    const hashPreview = box.querySelector('#hash-preview');
    if (availableVersions.length === 0 || availableVersions[0].hash === 'error') {
        const option = document.createElement('option');
        option.textContent = 'Loading...';
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
    hashPreview.textContent = `Commit Hash: ${select.value}`;
    select.addEventListener('change', (e) => { hashPreview.textContent = `Commit Hash: ${e.target.value}`; });

    box.querySelector('#install-btn').onclick = async () => {
        const targetHash = select.value;
        const selectedVersion = availableVersions.find(v => v.hash === targetHash);
        if (targetHash === 'error' || !targetHash || targetHash.length < 10) return alert('Invalid selection');
        const btn = box.querySelector('#install-btn');
        btn.disabled = true; btn.style.opacity = '0.7'; btn.textContent = ' Fetching manifest...';
        try {
            const targetManifestUrl = ONLINE_MANIFEST_URL.replace('refs/heads/main', targetHash);
            const manifestRes = await fetch(`${targetManifestUrl}?t=${Date.now()}`);
            if (!manifestRes.ok) throw new Error('Manifest fetch failed');
            const manifestText = await manifestRes.text();
            const lines = manifestText.split('\n').filter(l => l.trim() && !l.startsWith('#'));
            btn.textContent = `️ Downloading 0/${lines.length} files...`;
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
                btn.textContent = `️ Downloading ${successCount}/${lines.length} files...`;
            }
            btn.textContent = ' Setting permissions...';
            await execFn(`chmod -R 0755 '${MODULE_DIR}' && chown -R root:root '${MODULE_DIR}'`, 5000);
            const humanVersion = selectedVersion ? selectedVersion.label.split(' (')[0] : targetHash.substring(0, 7);
            await execFn(`sed -i 's/^version=.*/version=${humanVersion}/' '${LOCAL_PROP_PATH}'`, 3000);
            await execFn(`sed -i 's/^versionHash=.*/versionHash=${targetHash}/' '${LOCAL_PROP_PATH}'`, 3000);
            btn.textContent = '✅ Complete! Reboot recommended.';
            btn.style.background = 'linear-gradient(135deg, #32D74B, #248a3d)';
            localVersion = humanVersion; localHash = targetHash;
            updateCardDisplay();
        } catch (err) {
            btn.textContent = '❌ Failed. Check logs.';
            btn.style.background = '#FF453A';
        }
        btn.disabled = false; btn.style.opacity = '1';
    };

    box.querySelector('#gh-manager-btn').onclick = () => { modal.remove(); showUploadModal(); };
    box.querySelector('#close-btn').onclick = () => modal.remove();
}

// ========== SYNTAX HIGHLIGHTER (Fixed) ==========
function highlightSyntax(code, filename) {
    const ext = filename ? filename.split('.').pop().toLowerCase() : '';
    
    // Escape HTML first
    let html = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    
    // Use token replacement to avoid nested tag issues
    const tokens = [];
    let tokenIdx = 0;
    const addToken = (color, text) => {
        const ph = `§§T${tokenIdx++}§§`;
        tokens.push({ ph, html: `<span style="color:${color};">${text}</span>` });
        return ph;
    };
    
    // 1. Multi-line comments
    html = html.replace(/\/\*[\s\S]*?\*\//g, m => addToken('#6A9955', m));
    // 2. Single-line comments
    html = html.replace(/\/\/.*$/gm, m => addToken('#6A9955', m));
    html = html.replace(/^#.*$/gm, m => addToken('#6A9955', m));
    // 3. Strings
    html = html.replace(/`(?:[^`\\]|\\.)*`/g, m => addToken('#CE9178', m));
    html = html.replace(/"(?:[^"\\]|\\.)*"/g, m => addToken('#CE9178', m));
    html = html.replace(/'(?:[^'\\]|\\.)*'/g, m => addToken('#CE9178', m));
    // 4. Keywords
    const kw = /\b(const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|new|this|class|extends|import|export|default|from|async|await|try|catch|finally|throw|typeof|instanceof|in|of|true|false|null|undefined|void|delete|yield|static|get|set|super|require|module|exports)\b/g;
    html = html.replace(kw, m => addToken('#C586C0', m));
    // 5. Numbers
    html = html.replace(/\b\d+\.?\d*\b/g, m => addToken('#B5CEA8', m));
    // 6. Function calls
    html = html.replace(/\b([a-zA-Z_]\w*)\s*(?=\()/g, (_, name) => addToken('#DCDCAA', name));
    
    // Replace placeholders with actual colored spans
    tokens.forEach(t => { html = html.split(t.ph).join(t.html); });
    
    return html;
}

// ========== SEARCH HIGHLIGHTER ==========
function applySearchHighlights(code, query) {
    if (!query) return highlightSyntax(code, ghCurrentFile ? ghCurrentFile.name : '');
    
    const ext = ghCurrentFile ? ghCurrentFile.name.split('.').pop().toLowerCase() : '';
    let html = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    
    const tokens = [];
    let tokenIdx = 0;
    const addToken = (color, text, isSearchMatch = false) => {
        const ph = `§§T${tokenIdx++}§§`;
        const style = isSearchMatch 
            ? `<span style="background:#FFD700; color:#000; border-radius:2px; font-weight:bold;">${text}</span>`
            : `<span style="color:${color};">${text}</span>`;
        tokens.push({ ph, html: style });
        return ph;
    };
    
    // First, find and mark search matches
    const lowerHtml = html.toLowerCase();
    const lowerQuery = query.toLowerCase();
    let searchPos = 0;
    let processedHtml = '';
    let lastEnd = 0;
    
    while ((searchPos = lowerHtml.indexOf(lowerQuery, searchPos)) !== -1) {
        processedHtml += html.substring(lastEnd, searchPos);
        const matchText = html.substring(searchPos, searchPos + query.length);
        processedHtml += addToken(null, matchText, true);
        searchPos += query.length;
        lastEnd = searchPos;
    }
    processedHtml += html.substring(lastEnd);
    html = processedHtml;
    
    // Apply syntax highlighting
    html = html.replace(/\/\*[\s\S]*?\*\//g, m => addToken('#6A9955', m));
    html = html.replace(/\/\/.*$/gm, m => addToken('#6A9955', m));
    html = html.replace(/^#.*$/gm, m => addToken('#6A9955', m));
    html = html.replace(/`(?:[^`\\]|\\.)*`/g, m => addToken('#CE9178', m));
    html = html.replace(/"(?:[^"\\]|\\.)*"/g, m => addToken('#CE9178', m));
    html = html.replace(/'(?:[^'\\]|\\.)*'/g, m => addToken('#CE9178', m));
    const kw = /\b(const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|new|this|class|extends|import|export|default|from|async|await|try|catch|finally|throw|typeof|instanceof|in|of|true|false|null|undefined|void|delete|yield|static|get|set|super)\b/g;
    html = html.replace(kw, m => addToken('#C586C0', m));
    html = html.replace(/\b\d+\.?\d*\b/g, m => addToken('#B5CEA8', m));
    html = html.replace(/\b([a-zA-Z_]\w*)\s*(?=\()/g, (_, name) => addToken('#DCDCAA', name));
    
    tokens.forEach(t => { html = html.split(t.ph).join(t.html); });
    return html;
}

// ========== FULL GITHUB FILE MANAGER ==========
function showUploadModal() {
    const existing = document.getElementById('upload-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'upload-modal';
    modal.style.cssText = `position: fixed; inset: 0; background: rgba(0,0,0,0.95); z-index: 10001; display: flex; align-items: center; justify-content: center; padding: 8px; box-sizing: border-box;`;

    const box = document.createElement('div');
    box.style.cssText = `background: linear-gradient(135deg, #1a1f3a, #2d3561); border: 2px solid #FFD700; border-radius: 16px; width: 100%; height: 100%; max-width: 100%; max-height: 100%; display: flex; flex-direction: column; overflow: hidden;`;

    box.innerHTML = `
        <div style="padding: 12px 16px; border-bottom: 1px solid rgba(255,215,0,0.3); display: flex; justify-content: space-between; align-items: center; flex-shrink: 0;">
            <h3 style="color: #FFD700; margin: 0; font-size: 16px;"> GitHub File Manager</h3>
            <button id="gh-close-btn" style="background: rgba(255,69,58,0.2); color: #FF453A; border: 1px solid #FF453A; border-radius: 6px; padding: 4px 12px; font-size: 12px; cursor: pointer;"> Close</button>
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
                <label style="color: #fff; font-size: 12px; display:block; margin-bottom: 4px;">Upload Local File</label>
                <div style="display: flex; gap: 8px;">
                    <input type="file" id="gh-file-input" style="flex: 1; padding: 8px; background: rgba(0,0,0,0.4); color: #fff; border: 1px solid rgba(255,255,255,0.2); border-radius: 8px; font-size: 12px;">
                    <button id="gh-upload-btn" style="padding: 8px 16px; background: linear-gradient(135deg, #FFD700, #d4af37); color: #000; border: none; border-radius: 8px; font-weight: bold; cursor: pointer; font-size: 12px;">Upload</button>
                </div>
            </div>
        </div>
        <div id="gh-editor-section" style="display:none; flex: 1; overflow: hidden; flex-direction: column;">
            <div style="padding: 10px 16px; border-bottom: 1px solid rgba(255,255,255,0.1); display: flex; align-items: center; gap: 8px; flex-shrink: 0; flex-wrap: wrap;">
                <button id="gh-back-btn" style="background: transparent; color: #0A84FF; border: 1px solid #0A84FF; border-radius: 6px; padding: 6px 12px; font-size: 12px; cursor: pointer;">⬅ Back</button>
                <span id="gh-editor-filename" style="color: #FFD700; font-size: 13px; font-weight: bold; flex: 1;"></span>
                <button id="gh-edit-toggle-btn" style="padding: 6px 14px; background: #0A84FF; color: #fff; border: none; border-radius: 6px; font-weight: bold; cursor: pointer; font-size: 12px;">✏️ Edit</button>
                <button id="gh-save-btn" style="padding: 6px 14px; background: #32D74B; color: #fff; border: none; border-radius: 6px; font-weight: bold; cursor: pointer; font-size: 12px; display:none;">💾 Save</button>
            </div>
            <div style="padding: 8px 16px; border-bottom: 1px solid rgba(255,255,255,0.1); display: flex; align-items: center; gap: 6px; flex-shrink: 0; background: rgba(0,0,0,0.2);">
                <span style="color: #8b92b4; font-size: 12px;">🔍</span>
                <input type="text" id="gh-search-input" placeholder="Search in file..." style="flex: 1; padding: 6px 10px; background: rgba(0,0,0,0.4); color: #fff; border: 1px solid rgba(255,255,255,0.2); border-radius: 6px; font-size: 12px; min-width: 0;">
                <button id="gh-search-prev" style="padding: 6px 10px; background: rgba(255,255,255,0.1); color: #fff; border: none; border-radius: 6px; font-size: 11px; cursor: pointer;">▲ Prev</button>
                <button id="gh-search-next" style="padding: 6px 10px; background: rgba(255,255,255,0.1); color: #fff; border: none; border-radius: 6px; font-size: 11px; cursor: pointer;">▼ Next</button>
                <span id="gh-search-count" style="color: #8b92b4; font-size: 11px; min-width: 50px; text-align: right;"></span>
            </div>
            <div style="flex: 1; overflow: hidden; display: flex; position: relative; background: #1e1e1e;">
                <div id="gh-line-numbers" style="width: 50px; background: #252526; color: #858585; font-family: 'Courier New', monospace; font-size: 13px; line-height: 1.5; padding: 10px 8px 10px 0; text-align: right; overflow: hidden; user-select: none; border-right: 1px solid #333; flex-shrink: 0; white-space: pre;"></div>
                <div style="flex: 1; position: relative; overflow: hidden;">
                    <pre id="gh-highlight-pre" style="position: absolute; left: 0; right: 0; top: 0; bottom: 0; margin: 0; padding: 10px; font-family: 'Courier New', monospace; font-size: 13px; line-height: 1.5; color: #D4D4D4; overflow: auto; white-space: pre; word-wrap: normal; pointer-events: none; tab-size: 4;"></pre>
                    <textarea id="gh-editor-textarea" style="position: absolute; left: 0; right: 0; top: 0; bottom: 0; margin: 0; padding: 10px; font-family: 'Courier New', monospace; font-size: 13px; line-height: 1.5; background: transparent; color: transparent; caret-color: #fff; border: none; outline: none; resize: none; overflow: auto; white-space: pre; word-wrap: normal; tab-size: 4; pointer-events: none;"></textarea>
                </div>
            </div>
            <div style="padding: 6px 16px; background: rgba(0,0,0,0.3); color: #8b92b4; font-size: 11px; display: flex; justify-content: space-between; flex-shrink: 0; border-top: 1px solid rgba(255,255,255,0.1);">
                <span id="gh-cursor-pos">Read-only mode</span>
                <span id="gh-file-size">0 bytes</span>
            </div>
        </div>
    `;

    modal.appendChild(box);
    document.body.appendChild(modal);
    modal.onclick = e => { if (e.target === modal) modal.remove(); };

    const statusEl = () => document.getElementById('gh-status');

    // Set token value if it exists
    if (ghToken) {
        document.getElementById('gh-token-input').value = ghToken;
    }

    async function autoConnect() {
        if (!ghToken) return;
        await doConnect(ghToken, true);
    }

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
                const opt = document.createElement('option');
                opt.value = repo.full_name;
                opt.textContent = repo.name;
                select.appendChild(opt);
            });
            document.getElementById('gh-auth-section').style.display = 'none';
            document.getElementById('gh-main-section').style.display = 'flex';
            if (!silent) { statusEl().textContent = '✅ Connected!'; statusEl().style.color = '#32D74B'; }
        } catch (e) {
            if (!silent) { statusEl().textContent = `❌ ${e.message}`; statusEl().style.color = '#FF453A'; }
        }
    }

    document.getElementById('gh-connect-btn').onclick = async () => {
        const token = document.getElementById('gh-token-input').value.trim();
        if (!token) { statusEl().textContent = ' Enter a token first.'; statusEl().style.color = '#FF453A'; return; }
        await doConnect(token, false);
    };
    setTimeout(autoConnect, 100);

    document.getElementById('gh-repo-select').onchange = (e) => {
        ghCurrentRepo = e.target.value;
        ghCurrentPath = '';
        updateBreadcrumb();
        if (ghCurrentRepo) fetchDirectoryContents();
    };

    document.getElementById('gh-back-btn').onclick = () => {
        document.getElementById('gh-editor-section').style.display = 'none';
        document.getElementById('gh-main-section').style.display = 'flex';
        ghCurrentFile = null;
        isEditing = false;
    };

    document.getElementById('gh-edit-toggle-btn').onclick = () => {
        isEditing = !isEditing;
        const textarea = document.getElementById('gh-editor-textarea');
        const editBtn = document.getElementById('gh-edit-toggle-btn');
        const saveBtn = document.getElementById('gh-save-btn');
        const cursorPos = document.getElementById('gh-cursor-pos');
        
        if (isEditing) {
            textarea.style.pointerEvents = 'auto';
            textarea.style.color = 'rgba(255,255,255,0.01)';
            editBtn.textContent = '👁️ View';
            editBtn.style.background = '#FF9500';
            saveBtn.style.display = 'block';
            cursorPos.textContent = 'Editing mode - tap to place cursor';
        } else {
            textarea.style.pointerEvents = 'none';
            textarea.style.color = 'transparent';
            textarea.blur();
            editBtn.textContent = '✏️ Edit';
            editBtn.style.background = '#0A84FF';
            saveBtn.style.display = 'none';
            cursorPos.textContent = 'Read-only mode';
            const query = document.getElementById('gh-search-input').value;
            if (query) performSearch(query);
            else refreshHighlight();
        }
    };

    document.getElementById('gh-save-btn').onclick = async () => {
        const content = document.getElementById('gh-editor-textarea').value;
        const base64Content = btoa(unescape(encodeURIComponent(content)));
        const saveBtn = document.getElementById('gh-save-btn');
        saveBtn.textContent = '⏳ Saving...'; saveBtn.disabled = true;
        try {
            await uploadFileToGitHub(ghCurrentFile.path, base64Content, `Update ${ghCurrentFile.name} via WebUI`, ghToken, ghCurrentFile.sha);
            document.getElementById('gh-cursor-pos').textContent = '✅ Saved!';
            setTimeout(() => { saveBtn.textContent = '💾 Save'; saveBtn.disabled = false; }, 1500);
        } catch(e) {
            document.getElementById('gh-cursor-pos').textContent = `❌ ${e.message}`;
            saveBtn.textContent = ' Save'; saveBtn.disabled = false;
        }
    };

    document.getElementById('gh-upload-btn').onclick = async () => {
        const fileInput = document.getElementById('gh-file-input');
        if (!fileInput.files.length) { statusEl().textContent = ' Select a file first.'; statusEl().style.color = '#FF453A'; return; }
        const file = fileInput.files[0];
        const targetPath = ghCurrentPath ? `${ghCurrentPath}/${file.name}` : file.name;
        statusEl().textContent = `Uploading ${file.name}...`; statusEl().style.color = '#FFD700';
        try {
            const base64Content = await readFileAsBase64(file);
            await uploadFileToGitHub(targetPath, base64Content, `Upload ${file.name} via WebUI`, ghToken);
            statusEl().textContent = '✅ Uploaded!'; statusEl().style.color = '#32D74B';
            fileInput.value = '';
            fetchDirectoryContents();
        } catch(e) { statusEl().textContent = `❌ ${e.message}`; statusEl().style.color = '#FF453A'; }
    };

    document.getElementById('gh-close-btn').onclick = () => modal.remove();

    function updateBreadcrumb() {
        document.getElementById('gh-breadcrumb').textContent = ghCurrentPath ? `Path: ${ghCurrentPath}` : 'Path: Root';
    }

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
                        else openFileEditor(item);
                    };
                    listEl.appendChild(div);
                });
            } else openFileEditor(data);
        } catch (e) { listEl.innerHTML = `<div style="color: #FF453A; padding: 10px;">Error: ${e.message}</div>`; }
    }

    function formatBytes(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1048576) return (bytes/1024).toFixed(1) + ' KB';
        return (bytes/1048576).toFixed(1) + ' MB';
    }

    function updateLineNumbers() {
        const textarea = document.getElementById('gh-editor-textarea');
        const lineNums = document.getElementById('gh-line-numbers');
        const lines = textarea.value.split('\n').length;
        let html = '';
        for (let i = 1; i <= lines; i++) html += i.toString().padStart(4, ' ') + '\n';
        lineNums.textContent = html;
    }

    function refreshHighlight() {
        const textarea = document.getElementById('gh-editor-textarea');
        const pre = document.getElementById('gh-highlight-pre');
        const query = document.getElementById('gh-search-input').value;
        pre.innerHTML = applySearchHighlights(textarea.value, query) + '\n';
    }

    function syncScroll() {
        const textarea = document.getElementById('gh-editor-textarea');
        const lineNums = document.getElementById('gh-line-numbers');
        const pre = document.getElementById('gh-highlight-pre');
        lineNums.scrollTop = textarea.scrollTop;
        pre.scrollTop = textarea.scrollTop;
        pre.scrollLeft = textarea.scrollLeft;
    }

    function updateCursorPos() {
        const textarea = document.getElementById('gh-editor-textarea');
        const pos = textarea.selectionStart;
        const text = textarea.value.substring(0, pos);
        const lines = text.split('\n');
        const ln = lines.length;
        const col = lines[lines.length - 1].length + 1;
        document.getElementById('gh-cursor-pos').textContent = `Ln ${ln}, Col ${col}`;
        document.getElementById('gh-file-size').textContent = formatBytes(new Blob([textarea.value]).size);
    }

    function performSearch(query) {
        const textarea = document.getElementById('gh-editor-textarea');
        const countEl = document.getElementById('gh-search-count');
        
        if (!query) {
            searchMatches = [];
            currentMatchIndex = -1;
            countEl.textContent = '';
            refreshHighlight();
            return;
        }

        searchMatches = [];
        const text = textarea.value;
        const lowerText = text.toLowerCase();
        const lowerQuery = query.toLowerCase();
        let pos = 0;
        while ((pos = lowerText.indexOf(lowerQuery, pos)) !== -1) {
            searchMatches.push({ start: pos, end: pos + query.length });
            pos += query.length;
        }
        currentMatchIndex = searchMatches.length > 0 ? 0 : -1;
        countEl.textContent = searchMatches.length > 0 ? `${currentMatchIndex + 1}/${searchMatches.length}` : 'No results';
        
        refreshHighlight();
        
        if (currentMatchIndex >= 0) scrollToMatch(0);
    }

    function scrollToMatch(index) {
        if (searchMatches.length === 0) return;
        currentMatchIndex = ((index % searchMatches.length) + searchMatches.length) % searchMatches.length;
        const match = searchMatches[currentMatchIndex];
        const textarea = document.getElementById('gh-editor-textarea');
        const textBefore = textarea.value.substring(0, match.start);
        const linesBefore = textBefore.split('\n');
        const lineHeight = 19.5;
        const targetScroll = (linesBefore.length - 1) * lineHeight;
        textarea.scrollTop = Math.max(0, targetScroll - textarea.clientHeight / 3);
        document.getElementById('gh-highlight-pre').scrollTop = textarea.scrollTop;
        document.getElementById('gh-line-numbers').scrollTop = textarea.scrollTop;
        document.getElementById('gh-search-count').textContent = `${currentMatchIndex + 1}/${searchMatches.length}`;
    }

    document.getElementById('gh-search-input').addEventListener('input', (e) => performSearch(e.target.value));
    document.getElementById('gh-search-next').onclick = () => scrollToMatch(currentMatchIndex + 1);
    document.getElementById('gh-search-prev').onclick = () => scrollToMatch(currentMatchIndex - 1);

    async function openFileEditor(item) {
        document.getElementById('gh-main-section').style.display = 'none';
        document.getElementById('gh-editor-section').style.display = 'flex';
        document.getElementById('gh-editor-filename').textContent = item.name;
        document.getElementById('gh-editor-textarea').value = 'Loading...';
        document.getElementById('gh-search-input').value = '';
        document.getElementById('gh-search-count').textContent = '';
        searchMatches = [];
        currentMatchIndex = -1;
        isEditing = false;
        
        const textarea = document.getElementById('gh-editor-textarea');
        textarea.style.pointerEvents = 'none';
        textarea.style.color = 'transparent';
        document.getElementById('gh-edit-toggle-btn').textContent = '️ Edit';
        document.getElementById('gh-edit-toggle-btn').style.background = '#0A84FF';
        document.getElementById('gh-save-btn').style.display = 'none';
        document.getElementById('gh-cursor-pos').textContent = 'Read-only mode';
        
        ghCurrentFile = item;
        
        if (!item.content) {
            try {
                const url = `https://api.github.com/repos/${ghCurrentRepo}/contents/${item.path}`;
                const res = await fetch(url, { headers: { 'Authorization': `token ${ghToken}`, 'Accept': 'application/vnd.github.v3+json' } });
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                ghCurrentFile = await res.json();
            } catch(e) { textarea.value = 'Failed to load.'; return; }
        }
        
        try {
            const cleanBase64 = ghCurrentFile.content.replace(/\n/g, '');
            const decoded = atob(cleanBase64);
            editorRawText = decoded;
            textarea.value = decoded;
            
            textarea.oninput = () => { updateLineNumbers(); refreshHighlight(); updateCursorPos(); };
            textarea.onscroll = syncScroll;
            textarea.onclick = () => { if (isEditing) updateCursorPos(); };
            textarea.onkeyup = () => { if (isEditing) updateCursorPos(); };
            
            updateLineNumbers();
            refreshHighlight();
            document.getElementById('gh-file-size').textContent = formatBytes(new Blob([decoded]).size);
        } catch(e) { textarea.value = '[Binary file]'; }
    }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
})();