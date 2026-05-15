/**
 * MTK-AI-Engine Online Update System
 * Uses KernelSU exec method (compatible with your WebUI)
 */

(function() {
  'use strict';

  const UPDATE_CONFIG = {
    repoBase: 'https://github.com/Jestoni888/MTK-AI-Engine',
    commitHash: '76504f019b67314f87bd43a147f544ab5fbbde62',
    moduleBase: '/data/adb/modules/MTK_AI',
    busyBox: '/data/adb/modules/MTK_AI/busybox',
    
    targets: [
      ['MTK_AI/webroot2', '/data/adb/modules/MTK_AI/webroot/', true],
      ['MTK_AI/service.d', '/data/adb/modules/MTK_AI/service.d/', true],
      ['MTK_AI/script_runner', '/data/adb/modules/MTK_AI/script_runner/', true],
      ['MTK_AI/MTK_AI/AI_MODE/normal_mode', '/data/adb/modules/MTK_AI/MTK_AI/AI_MODE/normal_mode/', true],
      ['MTK_AI/MTK_AI/AI_MODE/global_mode', '/data/adb/modules/MTK_AI/MTK_AI/AI_MODE/global_mode/', true],
      ['MTK_AI/MTK_AI/AI_MODE/gaming_mode', '/data/adb/modules/MTK_AI/MTK_AI/AI_MODE/gaming_mode/', true],
      ['MTK_AI/MTK_AI/AI_MODE/auto_frequency', '/data/adb/modules/MTK_AI/MTK_AI/AI_MODE/auto_frequency/', true],
      ['MTK_AI/main_control', '/data/adb/modules/MTK_AI/main_control/', true],
      ['MTK_AI/lib64', '/data/adb/modules/MTK_AI/lib64/', true],
      ['MTK_AI', '/data/adb/modules/MTK_AI/', true]
    ],
    
    fallbackMethods: ['busybox_wget', 'busybox_curl', 'native_curl', 'native_wget', 'fetch_api'],
    timeouts: { download: 120000, exec: 30000, retry: 3 }
  };

  // ==================== DYNAMIC CSS ====================
  function injectStyles() {
    if (document.getElementById('mtkai-update-styles')) return;
    
    const style = document.createElement('style');
    style.id = 'mtkai-update-styles';
    style.textContent = `
      #mtkai-update-modal {
        position: fixed; top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(0,0,0,0.7); display: flex;
        align-items: center; justify-content: center;
        z-index: 9999; font-family: system-ui, sans-serif;
      }
      #mtkai-update-modal.hidden { display: none !important; }
      .mtkai-modal-content {
        background: #1e1e2e; color: #cdd6f4;
        border-radius: 12px; padding: 20px;
        max-width: 650px; width: 92%; max-height: 85vh;
        display: flex; flex-direction: column; gap: 12px;        box-shadow: 0 8px 32px rgba(0,0,0,0.4);
      }
      .mtkai-modal-header {
        display: flex; justify-content: space-between;
        align-items: center; padding-bottom: 8px;
        border-bottom: 1px solid #45475a;
      }
      .mtkai-modal-title { font-size: 1.1rem; font-weight: 600; margin: 0; }
      .mtkai-modal-close {
        background: none; border: none; color: #a6adc8;
        font-size: 1.5rem; cursor: pointer; line-height: 1;
        padding: 0 4px; border-radius: 4px;
      }
      .mtkai-modal-close:hover { background: #45475a; color: #fff; }
      #mtkai-update-log {
        background: #11111b; border-radius: 8px; padding: 12px;
        font-family: 'SF Mono', 'Fira Code', monospace;
        font-size: 11px; line-height: 1.4;
        max-height: 45vh; overflow-y: auto;
        white-space: pre-wrap; word-break: break-word;
        border: 1px solid #45475a;
      }
      .mtkai-log-entry { margin: 2px 0; }
      .mtkai-log-info { color: #89b4fa; }
      .mtkai-log-success { color: #a6e3a1; }
      .mtkai-log-warn { color: #f9e2af; }
      .mtkai-log-error { color: #f38ba8; }
      .mtkai-log-debug { color: #6c7086; }
      .mtkai-modal-actions {
        display: flex; gap: 10px; justify-content: flex-end;
        padding-top: 8px; border-top: 1px solid #45475a;
      }
      .mtkai-btn {
        padding: 8px 16px; border-radius: 6px; border: none;
        font-size: 13px; font-weight: 500; cursor: pointer;
        transition: background 0.2s;
      }
      .mtkai-btn-secondary { background: #45475a; color: #cdd6f4; }
      .mtkai-btn-secondary:hover { background: #585b70; }
      .mtkai-btn-primary { background: #89b4fa; color: #11111b; }
      .mtkai-btn-primary:hover { background: #74c7ec; }
      .mtkai-btn-primary.hidden { display: none; }
      #update-btn.updating { opacity: 0.7; cursor: wait; }
      #update-btn.updating::before {
        content: "🔄 "; animation: mtkai-spin 1s linear infinite;
      }
      @keyframes mtkai-spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }      #mtkai-update-log::-webkit-scrollbar { width: 8px; }
      #mtkai-update-log::-webkit-scrollbar-track { background: #11111b; }
      #mtkai-update-log::-webkit-scrollbar-thumb {
        background: #45475a; border-radius: 4px;
      }
    `;
    document.head.appendChild(style);
  }

  function createModal() {
    if (document.getElementById('mtkai-update-modal')) return;
    
    const modal = document.createElement('div');
    modal.id = 'mtkai-update-modal';
    modal.className = 'hidden';
    modal.innerHTML = `
      <div class="mtkai-modal-content">
        <div class="mtkai-modal-header">
          <h3 class="mtkai-modal-title">🔄 MTK-AI Online Update</h3>
          <button class="mtkai-modal-close" id="mtkai-modal-close">&times;</button>
        </div>
        <div id="mtkai-update-log"></div>
        <div class="mtkai-modal-actions">
          <button class="mtkai-btn mtkai-btn-secondary" id="mtkai-update-cancel">Cancel</button>
          <button class="mtkai-btn mtkai-btn-primary hidden" id="mtkai-update-restart">Restart Service</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  }

  // ==================== UTILITIES ====================
  function githubToRaw(githubPath, filename = null) {
    const { commitHash } = UPDATE_CONFIG;
    let rawPath = githubPath.replace(/^MTK_AI\//, '');
    if (filename) {
      return `https://raw.githubusercontent.com/Jestoni888/MTK-AI-Engine/${commitHash}/MTK_AI/${rawPath}/${filename}`;
    }
    return `https://raw.githubusercontent.com/Jestoni888/MTK-AI-Engine/${commitHash}/MTK_AI/${rawPath}`;
  }

  function githubApiUrl(githubPath) {
    const { commitHash } = UPDATE_CONFIG;
    let path = githubPath.replace(/^MTK_AI\//, '');
    return `https://api.github.com/repos/Jestoni888/MTK-AI-Engine/contents/MTK_AI/${path}?ref=${commitHash}`;
  }

  function log(msg, type = 'info') {
    const timestamp = new Date().toLocaleTimeString();
    const formatted = `[${timestamp}] [${type.toUpperCase()}] ${msg}`;    console.log(formatted);
    
    const logEl = document.getElementById('mtkai-update-log');
    if (logEl) {
      const entry = document.createElement('div');
      entry.className = `mtkai-log-entry mtkai-log-${type}`;
      entry.textContent = formatted;
      logEl.appendChild(entry);
      logEl.scrollTop = logEl.scrollHeight;
    }
  }

  // ==================== FIXED execRoot (Using KernelSU pattern) ====================
  async function execRoot(cmd, timeout = 3000) {
    return new Promise(resolve => {
      const cb = `mtk_exec_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      let settled = false;
      const t = setTimeout(() => {
        if (!settled) { 
          settled = true; 
          delete window[cb]; 
          resolve(''); 
        }
      }, timeout);
      
      window[cb] = (_, res) => { 
        if (settled) return;
        settled = true;
        clearTimeout(t); 
        delete window[cb]; 
        resolve(res || ''); 
      };
       
      try {
        if (window.ksu && typeof ksu.exec === 'function') {
          ksu.exec(cmd, `window.${cb}`);
        } else {
          settled = true;
          clearTimeout(t);
          delete window[cb];
          resolve('');
        }
      } catch (e) {
        settled = true;
        clearTimeout(t);
        delete window[cb];
        resolve('');
      }
    });
  }
  async function pathExists(path) {
    try {
      const result = await execRoot(`test -e "${path}" && echo "1" || echo "0"`);
      return result.trim() === '1';
    } catch { return false; }
  }

  async function ensureDir(path) {
    try {
      await execRoot(`mkdir -p "${path}" && chmod 755 "${path}"`);
      return true;
    } catch (e) {
      log(`Failed to create ${path}: ${e.message}`, 'error');
      return false;
    }
  }

  // ==================== DOWNLOAD METHODS ====================
  async function downloadBusyBoxWget(url, dest) {
    const bb = UPDATE_CONFIG.busyBox;
    return await execRoot(`${bb} wget --no-check-certificate -q -O "${dest}" "${url}" && chmod 644 "${dest}"`);
  }

  async function downloadBusyBoxCurl(url, dest) {
    const bb = UPDATE_CONFIG.busyBox;
    return await execRoot(`${bb} curl -fsSL -k -o "${dest}" "${url}" && chmod 644 "${dest}"`);
  }

  async function downloadNativeCurl(url, dest) {
    return await execRoot(`curl -fsSL -k -o "${dest}" "${url}" && chmod 644 "${dest}"`);
  }

  async function downloadNativeWget(url, dest) {
    return await execRoot(`wget --no-check-certificate -q -O "${dest}" "${url}" && chmod 644 "${dest}"`);
  }

  async function downloadFetchAPI(url, dest) {
    const response = await fetch(url, {
      headers: { 'Accept': 'application/octet-stream' },
      signal: AbortSignal.timeout(UPDATE_CONFIG.timeouts.download)
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const blob = await response.blob();
    const arrayBuffer = await blob.arrayBuffer();
    const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
    await execRoot(`echo "${base64}" | base64 -d > "${dest}" && chmod 644 "${dest}"`);
    return true;
  }
  async function downloadWithFallback(url, dest, filename = '') {
    const methods = {
      'busybox_wget': downloadBusyBoxWget,
      'busybox_curl': downloadBusyBoxCurl,
      'native_curl': downloadNativeCurl,
      'native_wget': downloadNativeWget,
      'fetch_api': downloadFetchAPI
    };
    let lastError;
    
    for (const methodName of UPDATE_CONFIG.fallbackMethods) {
      const method = methods[methodName];
      if (!method) continue;
      try {
        log(`Trying ${methodName} for ${filename || url}...`, 'debug');
        await method(url, dest);
        if (await pathExists(dest)) {
          const size = await execRoot(`stat -c%s "${dest}" 2>/dev/null || echo "0"`);
          if (parseInt(size.trim()) > 0) {
            log(`✓ Downloaded via ${methodName}: ${filename || dest}`, 'success');
            return true;
          }
        }
      } catch (e) {
        lastError = e;
        log(`✗ ${methodName} failed: ${e.message}`, 'warn');
      }
    }
    throw new Error(`All download methods failed. Last error: ${lastError?.message}`);
  }

  // ==================== GITHUB API ====================
  async function fetchGitHubFileList(githubPath) {
    const url = githubApiUrl(githubPath);
    try {
      const response = await fetch(url, {
        headers: { 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'MTK-AI-Updater/1.0' },
        signal: AbortSignal.timeout(UPDATE_CONFIG.timeouts.download)
      });
      if (!response.ok) { if (response.status === 404) return null; throw new Error(`GitHub API: ${response.status}`); }
      return await response.json();
    } catch (e) {
      log(`GitHub API fetch failed: ${e.message}`, 'warn');
      return null;
    }
  }

  async function updateDirectory(githubPath, devicePath, filesOnly = false) {
    log(`📁 Processing: ${githubPath} → ${devicePath}`, 'info');
    await ensureDir(devicePath);    const fileList = await fetchGitHubFileList(githubPath);
    if (!fileList || !Array.isArray(fileList)) {
      log(`⚠ Could not fetch file list for ${githubPath}, skipping...`, 'warn');
      return false;
    }
    let successCount = 0, failCount = 0;
    
    for (const item of fileList) {
      if (filesOnly && item.type === 'dir') { log(`⊘ Skipping directory (filesOnly): ${item.name}`, 'debug'); continue; }
      const rawUrl = item.download_url || githubToRaw(githubPath, item.name);
      const destPath = `${devicePath}${item.name}`;
      try {
        if (item.type === 'file') {
          await downloadWithFallback(rawUrl, destPath, item.name);
          successCount++;
        } else if (item.type === 'dir' && !filesOnly) {
          await updateDirectory(`${githubPath}/${item.name}`, `${devicePath}${item.name}/`);
          successCount++;
        }
      } catch (e) {
        log(`✗ Failed: ${item.name} - ${e.message}`, 'error');
        failCount++;
      }
    }
    log(`✅ ${githubPath}: ${successCount} updated, ${failCount} failed`, failCount === 0 ? 'success' : 'warn');
    return failCount === 0;
  }

  // ==================== MAIN UPDATE LOGIC ====================
  async function preUpdateChecks() {
    log('🔍 Running pre-update checks...', 'info');
    
    // Test root access
    try {
      const rootCheck = await execRoot('id');
      log(`Root check output: ${rootCheck}`, 'debug');
      if (!rootCheck.includes('uid=0')) {
        throw new Error('Root access not detected (uid != 0)');
      }
      log('✓ Root access confirmed', 'success');
    } catch (e) {
      log(`✗ Root check failed: ${e.message}`, 'error');
      log('⚠️ Make sure KernelSU is installed and WebUI has root access', 'warn');
      return false;
    }
    
    if (!await pathExists(UPDATE_CONFIG.moduleBase)) {
      log('✗ Module directory not found: ' + UPDATE_CONFIG.moduleBase, 'error');
      return false;
    }    log('✓ Module directory found', 'success');
    
    if (await pathExists(UPDATE_CONFIG.busyBox)) {
      log(`✓ BusyBox found: ${UPDATE_CONFIG.busyBox}`, 'success');
    } else {
      log('⚠️ BusyBox not found, using fallback methods', 'warn');
    }
    
    return true;
  }

  async function createBackup() {
    const backupDir = `${UPDATE_CONFIG.moduleBase}/.backup_${Date.now()}`;
    log(`📦 Creating backup: ${backupDir}`, 'info');
    try {
      await execRoot(`mkdir -p "${backupDir}"`);
      const criticalDirs = ['webroot', 'service.d', 'script_runner', 'main_control', 'MTK_AI'];
      for (const dir of criticalDirs) {
        const src = `${UPDATE_CONFIG.moduleBase}/${dir}`;
        if (await pathExists(src)) await execRoot(`cp -r "${src}" "${backupDir}/" 2>/dev/null || true`);
      }
      log(`✓ Backup created: ${backupDir}`, 'success');
      return backupDir;
    } catch (e) { log(`⚠️ Backup failed (continuing): ${e.message}`, 'warn'); return null; }
  }

  async function runUpdate() {
    log('🚀 Starting MTK-AI-Engine update...', 'info');
    if (!await preUpdateChecks()) { log('✗ Pre-update checks failed, aborting', 'error'); return false; }
    await createBackup();
    let totalSuccess = 0, totalFail = 0;
    
    for (const [githubPath, devicePath, isDir, filesOnly] of UPDATE_CONFIG.targets) {
      try {
        if (isDir) { const r = await updateDirectory(githubPath, devicePath, filesOnly); r ? totalSuccess++ : totalFail++; }
        else {
          const rawUrl = githubToRaw(githubPath);
          const filename = githubPath.split('/').pop();
          await downloadWithFallback(rawUrl, devicePath + filename, filename);
          totalSuccess++;
        }
      } catch (e) { log(`✗ Critical error updating ${githubPath}: ${e.message}`, 'error'); totalFail++; }
    }
    
    log(`\n📊 Update Summary: ${totalSuccess} succeeded, ${totalFail} failed`, totalFail === 0 ? 'success' : 'error');
    
    if (totalSuccess > 0) {
      log('🔧 Fixing permissions...', 'info');
      try {
        await execRoot(`find "${UPDATE_CONFIG.moduleBase}" -type f -exec chmod 644 {} \\;`);        await execRoot(`find "${UPDATE_CONFIG.moduleBase}" -type d -exec chmod 755 {} \\;`);
        await execRoot(`find "${UPDATE_CONFIG.moduleBase}" -name "*.sh" -exec chmod 755 {} \\;`);
        log('✓ Permissions updated', 'success');
      } catch (e) { log(`⚠️ Permission fix failed: ${e.message}`, 'warn'); }
    }
    
    if (totalSuccess > 0 && totalFail === 0) {
      const restartBtn = document.getElementById('mtkai-update-restart');
      if (restartBtn) {
        restartBtn.classList.remove('hidden');
        restartBtn.onclick = async () => {
          log('🔄 Restarting MTK-AI service...', 'info');
          try {
            await execRoot(`pkill -9 -f "/data/adb/modules/MTK_AI" 2>/dev/null`, 3000);
            await new Promise(r => setTimeout(r, 400));
            await execRoot(`sh "${UPDATE_CONFIG.moduleBase}/service.sh" >/dev/null 2>&1 &`);
            log('✓ Service restart command sent', 'success');
          } catch (e) { log(`⚠️ Restart command failed: ${e.message}`, 'warn'); }
        };
      }
    }
    return totalFail === 0;
  }

  // ==================== UI EVENT HANDLERS ====================
  function setupUI() {
    const updateBtn = document.getElementById('update-btn');
    if (!updateBtn) { console.warn('Update button #update-btn not found'); return; }
    
    const modal = document.getElementById('mtkai-update-modal');
    const closeBtn = document.getElementById('mtkai-modal-close');
    const cancelBtn = document.getElementById('mtkai-update-cancel');
    const restartBtn = document.getElementById('mtkai-update-restart');
    const logEl = document.getElementById('mtkai-update-log');
    
    const showModal = () => { if (modal) { modal.classList.remove('hidden'); logEl.innerHTML = ''; } };
    const hideModal = () => { if (modal) modal.classList.add('hidden'); };
    
    updateBtn.addEventListener('click', async () => {
      showModal();
      updateBtn.disabled = true;
      updateBtn.classList.add('updating');
      if (restartBtn) restartBtn.classList.add('hidden');
      
      try {
        const success = await runUpdate();
        if (success) {
          log('🎉 Update completed successfully!', 'success');
          if (typeof window.showToast === 'function') window.showToast('✅ Module updated!');
        } else { log('⚠️ Update completed with errors.', 'warn'); }      } catch (e) {
        log(`💥 Update crashed: ${e.message}`, 'error');
        if (typeof window.showToast === 'function') window.showToast('❌ Update failed: ' + e.message);
      } finally {
        updateBtn.disabled = false;
        updateBtn.classList.remove('updating');
      }
    });
    
    if (closeBtn) closeBtn.addEventListener('click', hideModal);
    if (cancelBtn) cancelBtn.addEventListener('click', hideModal);
    if (modal) modal.addEventListener('click', (e) => { if (e.target === modal) hideModal(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && modal && !modal.classList.contains('hidden')) hideModal(); });
  }

  // ==================== INITIALIZATION ====================
  function init() {
    injectStyles();
    createModal();
    setupUI();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
  
  window.MTKAIUpdate = { runUpdate, downloadWithFallback, execRoot, config: UPDATE_CONFIG };
  
})();