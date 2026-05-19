// renderer.js - Global Renderer with Bootloop Prevention (KernelSU + MTK Optimized)
(function() {
    'use strict';

    const RENDERER_OPTIONS = [
        { 
            id: 'auto', 
            label: 'Auto / Default', 
            desc: 'Let system choose optimal renderer',
            safe: true,
            tweaks: [
                { prop: 'debug.hwui.renderer', value: 'skiagl', desc: 'Default SkiaGL', persistent: false },
                { prop: 'persist.sys.ui.hw', value: '1', desc: 'Hardware UI', persistent: true }
            ]
        },
        { 
            id: 'skia-vulkan', 
            label: 'Skia Vulkan', 
            desc: 'Hardware-accelerated 2D via Vulkan',
            safe: false, // Requires Vulkan driver check
            tweaks: [
                { prop: 'debug.hwui.renderer', value: 'skia', desc: 'Skia renderer', persistent: false },
                { prop: 'debug.hwui.pipeline', value: 'skia', desc: 'Skia pipeline', persistent: false },
                { prop: 'ro.hardware.egl', value: 'vulkan', desc: 'Vulkan EGL', persistent: true },
                { prop: 'debug.egl.hw', value: '1', desc: 'EGL hardware acceleration', persistent: false },
                { prop: 'persist.graphics.egl', value: 'vulkan', desc: 'Persistent Vulkan EGL', persistent: true },
                { prop: 'debug.vulkan.enable', value: '1', desc: 'Enable Vulkan', persistent: false }
            ]
        },
        { 
            id: 'skiagl', 
            label: 'SkiaGL', 
            desc: 'OpenGL-backed Skia rendering (Recommended for MTK)',
            safe: true,
            tweaks: [
                { prop: 'debug.hwui.renderer', value: 'skiagl', desc: 'SkiaGL renderer', persistent: false },
                { prop: 'debug.hwui.pipeline', value: 'gl', desc: 'OpenGL pipeline', persistent: false },
                { prop: 'ro.hardware.egl', value: 'angle', desc: 'ANGLE EGL', persistent: true },
                { prop: 'debug.egl.hw', value: '1', desc: 'EGL hardware acceleration', persistent: false },
                { prop: 'debug.gralloc.gfx_ubwc_disable', value: '0', desc: 'UBWC enabled', persistent: false }
            ]
        },
        { 
            id: 'opengl', 
            label: 'OpenGL ES', 
            desc: 'Legacy OpenGL ES rendering (Safe fallback)',
            safe: true,
            tweaks: [
                { prop: 'debug.hwui.renderer', value: 'opengl', desc: 'OpenGL renderer', persistent: false },
                { prop: 'ro.hardware.egl', value: 'default', desc: 'Default EGL', persistent: true },                { prop: 'debug.egl.hw', value: '0', desc: 'EGL software fallback', persistent: false },
                { prop: 'debug.gralloc.gfx_ubwc_disable', value: '1', desc: 'UBWC disabled', persistent: false },
                { prop: 'persist.sys.ui.hw', value: '0', desc: 'Software UI rendering', persistent: true }
            ]
        },
        { 
            id: 'vulkan', 
            label: 'Vulkan', 
            desc: 'Low-level, high-performance API (MTK: Test First!)',
            safe: false,
            tweaks: [
                { prop: 'debug.hwui.renderer', value: 'vulkan', desc: 'Vulkan renderer', persistent: false },
                { prop: 'ro.hardware.egl', value: 'vulkan', desc: 'Vulkan EGL', persistent: true },
                { prop: 'debug.egl.hw', value: '1', desc: 'EGL hardware acceleration', persistent: false },
                { prop: 'persist.graphics.egl', value: 'vulkan', desc: 'Persistent Vulkan', persistent: true },
                { prop: 'debug.vulkan.enable', value: '1', desc: 'Vulkan enabled', persistent: false },
                { prop: 'ro.vulkan.version', value: '1.3', desc: 'Vulkan 1.3', persistent: true }
            ]
        },
        { 
            id: 'skia-gl-threaded', 
            label: 'Skia GL Threaded', 
            desc: 'Multi-threaded Skia OpenGL (Advanced)',
            safe: false,
            tweaks: [
                { prop: 'debug.hwui.renderer', value: 'skiagl', desc: 'SkiaGL renderer', persistent: false },
                { prop: 'debug.hwui.use_buffer_age', value: 'false', desc: 'Disable buffer age', persistent: false },
                { prop: 'debug.hwui.render_thread_mode', value: 'threaded', desc: 'Threaded rendering', persistent: false },
                { prop: 'debug.egl.hw', value: '1', desc: 'EGL hardware acceleration', persistent: false }
            ]
        },
        { 
            id: 'skia-vk-threaded', 
            label: 'Skia VK Threaded', 
            desc: 'Multi-threaded Skia Vulkan (Advanced)',
            safe: false,
            tweaks: [
                { prop: 'debug.hwui.renderer', value: 'skia', desc: 'Skia Vulkan renderer', persistent: false },
                { prop: 'debug.hwui.pipeline', value: 'vk', desc: 'Vulkan pipeline', persistent: false },
                { prop: 'debug.hwui.render_thread_mode', value: 'threaded', desc: 'Threaded rendering', persistent: false },
                { prop: 'ro.hardware.egl', value: 'vulkan', desc: 'Vulkan EGL', persistent: true },
                { prop: 'debug.egl.hw', value: '1', desc: 'EGL hardware acceleration', persistent: false },
                { prop: 'debug.vulkan.enable', value: '1', desc: 'Vulkan enabled', persistent: false }
            ]
        }
    ];

    // === STATE MANAGEMENT ===
    let state = { global: 'auto' };
    let modalOverlay = null;    let testModeActive = false;
    let testModeTimeout = null;

    // === CONFIG ===
    const CONFIG = {
        storagePath: '/sdcard/MTK_AI_Engine',
        backupFile: 'renderer_backup.txt',
        fallbackFile: 'fallback_renderer.txt',
        testModeDuration: 30000 // 30 seconds
    };

    // === KERNELSU SHELL EXECUTION ===
    const execFn = window.exec || async function(cmd, timeout = 10000) {
        return new Promise(resolve => {
            const cb = `renderer_exec_${Date.now()}_${Math.random().toString(36).substring(2)}`;
            const t = setTimeout(() => { delete window[cb]; resolve(''); }, timeout);
            window[cb] = (_, res) => { clearTimeout(t); delete window[cb]; resolve(res || ''); };
            if (window.ksu) ksu.exec(cmd, `window.${cb}`);
            else { clearTimeout(t); resolve(''); }
        });
    };

    // === SAFE PERSISTENT PROP SETTING (ro.* protected) ===
    async function setPropPersistent(prop, value, skipRo = false) {
        // 🛡️ NEVER set ro.* props at runtime without explicit override
        if (prop.startsWith('ro.') && !skipRo) {
            console.warn(`[Renderer] Blocked runtime set of ro.* prop: ${prop}`);
            return false;
        }
        
        const commands = [];
        
        // For persist.* props: write to property file + setprop
        if (prop.startsWith('persist.')) {
            const propFile = `/data/property/${prop.replace(/\./g, '_')}`;
            commands.push(`mkdir -p /data/property 2>/dev/null`);
            commands.push(`echo -n "${value}" > ${propFile} 2>/dev/null`);
            commands.push(`chmod 600 ${propFile} 2>/dev/null`);
            commands.push(`chown root:root ${propFile} 2>/dev/null`);
        }
        
        // Always apply via setprop for immediate effect
        commands.push(`setprop ${prop} "${value}"`);
        
        for (const cmd of commands) {
            try { 
                const result = await execFn(cmd);
                console.log(`[Renderer] Exec: ${cmd} → ${result.substring(0, 100)}`);
            } catch (e) { 
                console.warn(`[Renderer] Cmd failed: ${cmd}`, e);             }
        }
        return true;
    }

    async function getProp(prop) {
        try {
            const result = await execFn(`getprop ${prop}`);
            return result.trim() || 'not set';
        } catch (e) { return 'error'; }
    }

    // === DEVICE COMPATIBILITY CHECKS ===
    async function getDeviceInfo() {
        return {
            hardware: await getProp('ro.hardware'),
            platform: await getProp('ro.board.platform'),
            product: await getProp('ro.product.name'),
            vulkanVersion: await getProp('ro.vulkan.version'),
            eglExtensions: await execFn('eglinfo 2>/dev/null | grep -i extension || echo "not available"'),
            gpuRenderer: await execFn('dumpsys SurfaceFlinger | grep -i "gl renderer" | head -1 || echo "unknown"')
        };
    }

    async function isRendererCompatible(rendererId) {
        const opt = RENDERER_OPTIONS.find(o => o.id === rendererId);
        if (!opt) return false;
        
        // Always allow safe renderers
        if (opt.safe) return true;
        
        const info = await getDeviceInfo();
        const platform = info.platform?.toLowerCase() || '';
        const vulkanVer = info.vulkanVersion;
        
        // === MTK-SPECIFIC BLOCKS ===
        const mtkOldPlatforms = ['mt6735', 'mt6737', 'mt6750', 'mt6753', 'mt6755', 'mt6757', 'mt6761', 'mt6762', 'mt6763', 'mt6765', 'mt6768', 'mt6769', 'mt6771', 'mt6779', 'mt6833', 'mt6853', 'mt6873', 'mt6877', 'mt6885', 'mt6891', 'mt6893', 'mt6895'];
        
        // Block Vulkan on older MTK platforms without confirmed support
        if (rendererId.includes('vulkan') && mtkOldPlatforms.some(p => platform.includes(p))) {
            if (!vulkanVer || vulkanVer === 'not set' || vulkanVer.startsWith('1.0')) {
                console.warn(`[Renderer] Vulkan blocked: ${platform} + Vulkan ${vulkanVer}`);
                return false;
            }
        }
        
        // Block threaded modes on low-RAM devices
        if (rendererId.includes('threaded')) {
            const mem = await execFn('grep MemTotal /proc/meminfo | awk \'{print $2}\'');
            const memMB = parseInt(mem) / 1024;            if (memMB < 3000) {
                console.warn(`[Renderer] Threaded mode blocked: ${memMB.toFixed(1)}MB RAM`);
                return false;
            }
        }
        
        return true;
    }

    // === BACKUP & RECOVERY ===
    async function backupCurrentProps() {
        const props = ['debug.hwui.renderer', 'debug.hwui.pipeline', 'ro.hardware.egl', 
                      'persist.graphics.egl', 'debug.egl.hw', 'debug.vulkan.enable', 
                      'ro.vulkan.version', 'debug.gralloc.gfx_ubwc_disable', 'persist.sys.ui.hw'];
        
        let backup = `# Renderer Backup - ${new Date().toISOString()}\n`;
        for (const prop of props) {
            const val = await getProp(prop);
            backup += `${prop}=${val}\n`;
        }
        
        await execFn(`mkdir -p ${CONFIG.storagePath}`);
        await execFn(`echo '${backup}' > ${CONFIG.storagePath}/${CONFIG.backupFile}`);
        console.log('[Renderer] Props backed up');
    }

    async function generateRecoveryScript() {
        const script = `#!/system/bin/sh
# Auto-generated Renderer Recovery Script
# Path: ${CONFIG.storagePath}/recover_renderer.sh

echo "🔧 MTK AI Engine - Renderer Recovery"
echo "====================================="

# Reset all renderer-related props
resetprop -n debug.hwui.renderer ""
resetprop -n debug.hwui.pipeline ""
resetprop -n ro.hardware.egl ""
resetprop -n persist.graphics.egl ""
resetprop -n debug.egl.hw ""
resetprop -n debug.vulkan.enable ""
resetprop -n ro.vulkan.version ""
resetprop -n debug.gralloc.gfx_ubwc_disable ""
resetprop -n persist.sys.ui.hw ""

# Clear shader/dalvik caches
rm -rf /data/dalvik-cache/*hwui* 2>/dev/null
rm -rf /data/dalvik-cache/*shader* 2>/dev/null
rm -rf /data/dalvik-cache/*vulkan* 2>/dev/null
rm -rf /data/app/*/oat/*/*renderer* 2>/dev/nullrm -rf /data/data/*/code_cache/*shader* 2>/dev/null
rm -rf /data/data/*/cache/*shader* 2>/dev/null

# Restore fallback renderer if exists
if [ -f "${CONFIG.storagePath}/${CONFIG.fallbackFile}" ]; then
    FALLBACK=\$(cat "${CONFIG.storagePath}/${CONFIG.fallbackFile}")
    echo "📦 Restoring fallback: \$FALLBACK"
    setprop debug.hwui.renderer "\$FALLBACK"
fi

echo "✅ Recovery complete. Rebooting in 3 seconds..."
sleep 3
reboot
`;
        await execFn(`echo '${script}' > ${CONFIG.storagePath}/recover_renderer.sh`);
        await execFn(`chmod 755 ${CONFIG.storagePath}/recover_renderer.sh`);
        console.log('[Renderer] Recovery script generated');
    }

    // === SAFE APPLY FLOW (Test → Confirm → Persist) ===
    async function testApplyRenderer(rendererId) {
        const opt = RENDERER_OPTIONS.find(o => o.id === rendererId);
        if (!opt) return false;
        
        // Apply ONLY non-persistent props for testing
        for (const tweak of opt.tweaks.filter(t => !t.persistent)) {
            await execFn(`setprop ${tweak.prop} "${tweak.value}"`);
        }
        
        testModeActive = true;
        console.log(`[Renderer] Test mode active for ${rendererId}`);
        return true;
    }

    async function confirmApplyRenderer(rendererId) {
        const opt = RENDERER_OPTIONS.find(o => o.id === rendererId);
        if (!opt) return false;
        
        // Apply persistent props
        for (const tweak of opt.tweaks.filter(t => t.persistent)) {
            await setPropPersistent(tweak.prop, tweak.value);
        }
        
        // Save preference
        await execFn(`mkdir -p ${CONFIG.storagePath} && echo '${rendererId}' > ${CONFIG.storagePath}/global_renderer.txt`);
        
        // Save as fallback for recovery
        await execFn(`echo '${rendererId}' > ${CONFIG.storagePath}/${CONFIG.fallbackFile}`);
        
        testModeActive = false;        if (testModeTimeout) { clearTimeout(testModeTimeout); testModeTimeout = null; }
        
        console.log(`[Renderer] Confirmed and persisted ${rendererId}`);
        return true;
    }

    async function cancelTestMode() {
        if (!testModeActive) return;
        
        // Revert non-persistent changes by resetting to empty/default
        const currentOpt = RENDERER_OPTIONS.find(o => o.id === state.global);
        if (currentOpt) {
            for (const tweak of currentOpt.tweaks.filter(t => !t.persistent)) {
                await execFn(`setprop ${tweak.prop} ""`);
            }
        }
        
        testModeActive = false;
        if (testModeTimeout) { clearTimeout(testModeTimeout); testModeTimeout = null; }
        console.log('[Renderer] Test mode cancelled');
    }

    // === DIAGNOSTIC ===
    async function checkRendererStatus() {
        const status = {};
        const props = ['debug.hwui.renderer', 'ro.hardware.egl', 'persist.graphics.egl', 'debug.egl.hw', 'debug.vulkan.enable', 'ro.vulkan.version'];
        for (const prop of props) { status[prop] = await getProp(prop); }
        
        try {
            const dump = await execFn('dumpsys gfxinfo | grep -i pipeline');
            const lines = dump.split('\n').filter(l => l.includes('Pipeline='));
            status.activePipelines = {
                vulkan: lines.filter(l => l.includes('Vulkan')).length,
                opengl: lines.filter(l => l.includes('OpenGL')).length,
                total: lines.length
            };
        } catch (e) { status.activePipelines = { error: e.message }; }
        
        // Add device info for debugging
        status.device = await getDeviceInfo();
        return status;
    }

    // === CORE FRAMEWORK SKIP LIST ===
    const SKIP_CORE_FRAMEWORK = [
        'android', 'com.android.server.telecom', 'com.android.server.wifi',
        'com.android.server.connectivity', 'com.android.server.net',
        'com.android.providers.settings', 'com.android.shell',
        'com.android.statementservice', 'com.android.managedprovisioning',
        'com.android.permissioncontroller', 'com.android.externalstorage',        'com.android.systemui', 'com.android.launcher3', 'com.android.quickstep',
        'com.android.launcher', 'com.google.android.launcher',
        'com.miui.home', 'com.sec.android.app.launcher', 'com.htc.launcher',
        'com.oppo.launcher', 'com.lge.launcher2', 'com.huawei.android.launcher',
        'com.android.phone', 'com.android.incallui', 'com.android.providers.telephony',
        'com.android.carrierconfig', 'com.android.stk', 'com.android.simappdialog',
        'com.google.android.gms', 'com.google.android.gsf',
        'com.google.android.gms.core', 'com.google.android.setupwizard',
        'com.google.android.configupdater', 'com.google.android.partnersetup',
        'com.google.android.gms.location.history',
        'com.android.keyguard', 'com.android.locksettings',
        'com.google.android.gms.security', 'com.android.biometrics',
        'com.android.systemui.plugin.globalactions',
        'com.google.android.inputmethod.latin', 'com.android.inputdevices',
        'com.google.android.marvin.talkback', 'com.android.accessibility',
        'com.google.android.googlequicksearchbox',
        'com.android.providers.media', 'com.android.providers.media.module',
        'com.android.providers.downloads', 'com.android.providers.contacts',
        'com.android.providers.calendar', 'com.android.providers.downloads.ui',
        'com.android.mms', 'com.android.providers.userdictionary',
        'com.android.mtp', 'com.google.android.packageinstaller',
        'com.android.packageinstaller', 'com.android.vending',
        'com.google.android.apps.nbu.files', 'com.google.android.documentsui',
        'com.android.documentsui', 'com.google.android.webview',
        'com.android.chrome', 'com.android.webview', 'org.chromium.webview_shell',
        'com.google.android.trichromelibrary'
    ];

    // === FORCE APPLY (With Safety Checks) ===
    async function forceApplyRenderer(rendererId, pkg = null, forceStopAll = false) {
        // === SAFETY CHECK ===
        if (!await isRendererCompatible(rendererId)) {
            const opt = RENDERER_OPTIONS.find(o => o.id === rendererId);
            alert(`⚠️ ${opt?.label || rendererId} is not compatible with your device.\n\nTry "SkiaGL" or "Auto" instead.`);
            return;
        }
        
        const opt = RENDERER_OPTIONS.find(o => o.id === rendererId);
        if (!opt) return;
        
        const statusEl = document.getElementById('apply-status');
        if (statusEl) {
            const scopeText = pkg ? `to ${pkg}` : (forceStopAll ? 'system-wide' : 'global');
            statusEl.innerHTML = `<span style="color:#8b5cf6;">🔄 Applying ${scopeText}...</span>`;
            statusEl.style.display = 'block';
        }
        
        try {
            // === 0. Backup current state ===
            await backupCurrentProps();            await generateRecoveryScript();
            
            // === 1. Apply all renderer tweaks ===
            for (const tweak of opt.tweaks) { 
                if (tweak.persistent) {
                    await setPropPersistent(tweak.prop, tweak.value);
                } else {
                    await execFn(`setprop ${tweak.prop} "${tweak.value}"`);
                }
            }
            
            // === 2. Save global preference ===
            await execFn(`mkdir -p ${CONFIG.storagePath} && echo '${rendererId}' > ${CONFIG.storagePath}/global_renderer.txt`);
            
            // === 3. Force Stop Strategy ===
            if (pkg) {
                // Per-App Mode
                await execFn(`su -c "rm -rf /data/data/${pkg}/code_cache/com.android.opengl.shaders_cache 2>/dev/null"`);
                await execFn(`su -c "rm -rf /data/data/${pkg}/code_cache/com.android.skia.shaders_cache 2>/dev/null"`);
                await execFn(`su -c "rm -rf /data/data/${pkg}/cache/*shader* 2>/dev/null"`);
                console.log(`[Renderer] Cleared caches + force-stopped ${pkg}`);
                
            } else if (forceStopAll) {
                // AGGRESSIVE MODE
                if (statusEl) statusEl.innerHTML = '<span style="color:#f59e0b;">⚙️ Force-stopping all non-core apps...</span>';
                
                try {
                    const allPkgsRaw = await execFn('pm list packages 2>/dev/null | cut -d: -f2', 15000);
                    const allPkgs = allPkgsRaw.split('\n').map(p => p.trim()).filter(p => p && p.includes('.'));
                    
                    let stopped = 0, skipped = 0;
                    for (const appPkg of allPkgs) {
                        if (SKIP_CORE_FRAMEWORK.includes(appPkg)) { skipped++; continue; }
                        try {
                            await execFn(`am force-stop ${appPkg} 2>/dev/null`, 2000);
                            stopped++;
                            if (stopped % 15 === 0) await new Promise(r => setTimeout(r, 30));
                        } catch (e) { /* ignore */ }
                    }
                    console.log(`[Renderer] 🛑 Stopped: ${stopped} | 🛡️ Skipped: ${skipped}`);
                } catch (e) {
                    console.warn('[Renderer] Bulk force-stop failed:', e);
                }
                
                // Clear ALL caches
                await execFn(`su -c "rm -rf /data/dalvik-cache/*hwui* 2>/dev/null"`);
                await execFn(`su -c "rm -rf /data/dalvik-cache/*shader* 2>/dev/null"`);
                await execFn(`su -c "rm -rf /data/app/*/oat/*/*renderer* 2>/dev/null"`);
                console.log('[Renderer] Cleared global caches');
                            } else {
                // Standard Global Mode
                await execFn(`su -c "rm -rf /data/dalvik-cache/*hwui* 2>/dev/null"`);
                await execFn(`su -c "rm -rf /data/dalvik-cache/*shader* 2>/dev/null"`);
                console.log('[Renderer] Cleared shader caches');
            }
            
            // === 4. Update UI ===
            if (statusEl) {
                const diag = await checkRendererStatus();
                let hint = '';
                if (pkg) hint = 'Reopen app';
                else if (forceStopAll) hint = 'Apps restarting...';
                else hint = 'Reboot recommended for full effect';
                
                statusEl.innerHTML = `<span style="color:#32D74B;">✅ Applied</span><br>
                    <small style="color:#888;">Vulkan: ${diag.activePipelines?.vulkan || '?'} | OpenGL: ${diag.activePipelines?.opengl || '?'}<br>
                    <i style="color:#f59e0b;">⚠️ ${hint}</i><br>
                    <i style="color:#8b5cf6;">💾 Backup: ${CONFIG.storagePath}/${CONFIG.backupFile}</i></small>`;
            }
            
            // === 5. Dispatch event ===
            window.dispatchEvent(new CustomEvent('renderer-changed', { 
                detail: { 
                    renderer: rendererId, 
                    tweaks: opt.tweaks, 
                    scope: pkg ? 'per-app' : (forceStopAll ? 'system-aggressive' : 'global'),
                    package: pkg,
                    forceStopAll: forceStopAll
                } 
            }));
            
        } catch (e) {
            console.error('[Renderer] Apply failed:', e);
            if (statusEl) statusEl.innerHTML = `<span style="color:#FF453A;">❌ Error: ${e.message}</span>`;
        }
    }

    // === STATE MANAGEMENT ===
    function loadState() { 
        try { 
            const saved = localStorage.getItem('renderer_settings'); 
            if (saved) {
                const parsed = JSON.parse(saved);
                state = { global: parsed.global || 'auto' };
            }
            // Load from sdcard if available (persistent across reinstalls)
            (async () => {
                const savedFile = await execFn(`cat ${CONFIG.storagePath}/global_renderer.txt 2>/dev/null`);
                if (savedFile?.trim() && RENDERER_OPTIONS.some(o => o.id === savedFile.trim())) {                    state.global = savedFile.trim();
                    saveState();
                }
            })();
        } catch (e) { state = { global: 'auto' }; } 
    }
    
    function saveState() { 
        localStorage.setItem('renderer_settings', JSON.stringify(state)); 
        updateMainButton(); 
    }
    
    function updateMainButton() {
        const val = document.getElementById('renderer-val');
        if (!val) return;
        const opt = RENDERER_OPTIONS.find(o => o.id === state.global);
        const compatIcon = opt?.safe ? '✅' : '⚠️';
        val.innerHTML = `${compatIcon} ${opt ? opt.label : 'Auto'} <i class="fas fa-chevron-right"></i>`;
    }

    // === MODAL UI ===
    function createModal() {
        if (modalOverlay) return modalOverlay.querySelector('#modal-content');
        modalOverlay = document.createElement('div');
        modalOverlay.id = 'renderer-modal-overlay';
        Object.assign(modalOverlay.style, {
            position: 'fixed', top: '0', left: '0', width: '100%', height: '100%',
            background: 'rgba(0,0,0,0.85)', zIndex: '9999', display: 'flex',
            alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(5px)',
            opacity: '0', transition: 'opacity 0.3s ease'
        });
        const modal = document.createElement('div');
        Object.assign(modal.style, {
            background: 'linear-gradient(135deg, #1a1f3a, #2d3561)', borderRadius: '20px',
            width: '95%', maxWidth: '500px', maxHeight: '85vh', overflow: 'hidden',
            display: 'flex', flexDirection: 'column', boxShadow: '0 0 40px rgba(139, 92, 246, 0.2)',
            border: '2px solid rgba(139, 92, 246, 0.5)'
        });
        const header = document.createElement('div');
        header.innerHTML = `<h3 style="margin:0; color:#8b5cf6; font-weight:600; font-size:18px;">Renderer Configuration</h3>
            <button id="close-renderer-modal" style="background:none; border:none; color:#888; font-size:20px; cursor:pointer; padding:5px;"><i class="fas fa-times"></i></button>`;
        Object.assign(header.style, { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px', borderBottom: '1px solid rgba(255,255,255,0.1)' });
        const content = document.createElement('div');
        content.id = 'modal-content';
        Object.assign(content.style, { flex: '1', overflowY: 'auto', padding: '20px' });
        modal.appendChild(header);
        modal.appendChild(content);
        modalOverlay.appendChild(modal);
        document.body.appendChild(modalOverlay);
        document.getElementById('close-renderer-modal').addEventListener('click', closeModal);        modalOverlay.addEventListener('click', (e) => { if (e.target === modalOverlay) closeModal(); });
        setTimeout(() => { modalOverlay.style.opacity = '1'; }, 10);
        return content;
    }

    function closeModal() {
        if (!modalOverlay) return;
        // Cancel test mode if modal closed during testing
        if (testModeActive) cancelTestMode();
        modalOverlay.style.opacity = '0';
        setTimeout(() => { modalOverlay.remove(); modalOverlay = null; }, 300);
    }

    // === ⚠️ BOOTLOOP WARNING COMPONENT ===
    function createBootloopWarning() {
        const warning = document.createElement('div');
        warning.style.cssText = `
            background: linear-gradient(135deg, rgba(239,68,68,0.15), rgba(220,38,38,0.1));
            border: 1px solid rgba(239,68,68,0.4);
            border-radius: 12px;
            padding: 12px 15px;
            margin-bottom: 15px;
            cursor: pointer;
            transition: all 0.2s ease;
        `;
        warning.innerHTML = `
            <div style="display:flex; align-items:center; gap:10px;">
                <div style="width:32px; height:32px; background:rgba(239,68,68,0.2); border-radius:8px; display:flex; align-items:center; justify-content:center; color:#ef4444; flex-shrink:0;">
                    <i class="fas fa-exclamation-triangle"></i>
                </div>
                <div style="flex:1; min-width:0;">
                    <div style="color:#fff; font-weight:600; font-size:13px;">⚠️ Bootloop Warning</div>
                    <div style="color:#fca5a5; font-size:11px;">If stuck on logo, use recovery script</div>
                </div>
                <i class="fas fa-chevron-down" style="color:#888; font-size:12px;"></i>
            </div>
            <div id="warning-details" style="display:none; margin-top:12px; padding-top:12px; border-top:1px solid rgba(239,68,68,0.3);">
                <div style="color:#fca5a5; font-size:11px; line-height:1.6;">
                    <strong>🚨 If device won't boot:</strong><br>
                    1. Power off completely<br>
                    2. Boot to Recovery (Vol+ + Power)<br>
                    3. Mount /system as read-write<br>
                    4. Run via ADB:<br>
                    <code style="background:rgba(0,0,0,0.3); padding:2px 5px; border-radius:3px; display:block; margin:5px 0;">adb shell su -c "${CONFIG.storagePath}/recover_renderer.sh"</code><br>
                    5. Or manually clear: /data/dalvik-cache/*shader*<br><br>
                    <i style="color:#fbbf24;">💡 Backup created at: ${CONFIG.storagePath}/${CONFIG.backupFile}</i>
                </div>
            </div>
        `;
        warning.addEventListener('click', (e) => {            if (e.target.closest('#warning-details')) return;
            const details = warning.querySelector('#warning-details');
            const icon = warning.querySelector('.fa-chevron-down');
            if (details.style.display === 'none') {
                details.style.display = 'block';
                icon.className = 'fas fa-chevron-up';
            } else {
                details.style.display = 'none';
                icon.className = 'fas fa-chevron-down';
            }
        });
        return warning;
    }

    // === RENDER MAIN VIEW ===
    async function renderMainView(container) {
        container.innerHTML = '';
        
        // ⚠️ BOOTLOOP WARNING
        container.appendChild(createBootloopWarning());

        // Device Info Badge
        const deviceInfo = await getDeviceInfo();
        const infoBadge = document.createElement('div');
        infoBadge.style.cssText = 'background:rgba(139,92,246,0.1); border:1px solid rgba(139,92,246,0.3); border-radius:10px; padding:10px; margin-bottom:15px; font-size:11px; color:#aaa;';
        infoBadge.innerHTML = `
            <strong>📱 Device:</strong> ${deviceInfo.platform || deviceInfo.hardware || 'Unknown'}<br>
            <strong>🎮 GPU:</strong> ${deviceInfo.gpuRenderer?.replace('GL renderer:', '').trim() || 'Unknown'}<br>
            <strong>⚡ Vulkan:</strong> ${deviceInfo.vulkanVersion !== 'not set' ? deviceInfo.vulkanVersion : 'Not detected'}
        `;
        container.appendChild(infoBadge);

        // Status/Apply Button
        const applySection = document.createElement('div');
        applySection.style.cssText = 'margin-bottom:20px;';
        
        const currentOpt = RENDERER_OPTIONS.find(o => o.id === state.global);
        const isUnsafe = !currentOpt?.safe;
        
        applySection.innerHTML = `
            <button id="apply-btn" style="width:100%; padding:12px; background:linear-gradient(135deg, ${isUnsafe ? '#f59e0b, #ea580c' : '#8b5cf6, #6366f1'}); 
                color:#fff; border:none; border-radius:12px; font-weight:600; cursor:pointer; display:flex; 
                align-items:center; justify-content:center; gap:8px;">
                <i class="fas ${isUnsafe ? 'fa-exclamation-triangle' : 'fa-bolt'}"></i> 
                ${isUnsafe ? '⚠️ Test & Apply' : 'Apply Renderer'}
            </button>
            <button id="recovery-btn" style="width:100%; padding:10px; margin-top:8px; background:rgba(239,68,68,0.2); 
                color:#fca5a5; border:1px solid rgba(239,68,68,0.4); border-radius:10px; font-size:12px; cursor:pointer;">
                🆘 Generate Recovery Script
            </button>            <div id="apply-status" style="margin-top:10px; font-size:12px; color:#888; display:none;"></div>
            <div id="test-mode-banner" style="display:none; margin-top:10px; padding:10px; background:rgba(245,158,11,0.15); 
                border:1px solid rgba(245,158,11,0.4); border-radius:10px; font-size:12px; color:#fcd34d;">
                ⏱️ Test mode active! Changes will revert in <span id="test-timer">30</span>s<br>
                <button id="confirm-test" style="margin-top:5px; padding:5px 10px; background:#32D74B; border:none; border-radius:5px; color:#000; font-weight:600; cursor:pointer;">✅ Keep Changes</button>
                <button id="cancel-test" style="margin-top:5px; padding:5px 10px; background:#ef4444; border:none; border-radius:5px; color:#fff; font-weight:600; cursor:pointer; margin-left:5px;">❌ Revert</button>
            </div>
        `;
        container.appendChild(applySection);

        // Bind buttons
        document.getElementById('apply-btn').addEventListener('click', async () => {
            if (!currentOpt?.safe) {
                // Test mode flow for unsafe renderers
                await testApplyRenderer(state.global);
                
                // Show test mode UI
                document.getElementById('test-mode-banner').style.display = 'block';
                document.getElementById('apply-btn').disabled = true;
                
                // Start countdown
                let seconds = CONFIG.testModeDuration / 1000;
                document.getElementById('test-timer').textContent = seconds;
                
                testModeTimeout = setInterval(() => {
                    seconds--;
                    document.getElementById('test-timer').textContent = seconds;
                    if (seconds <= 0) {
                        clearInterval(testModeTimeout);
                        cancelTestMode();
                        document.getElementById('test-mode-banner').style.display = 'none';
                        document.getElementById('apply-btn').disabled = false;
                        alert('⏰ Test mode expired. Changes reverted.');
                    }
                }, 1000);
                
                // Confirm button
                document.getElementById('confirm-test').onclick = async () => {
                    await confirmApplyRenderer(state.global);
                    document.getElementById('test-mode-banner').style.display = 'none';
                    document.getElementById('apply-btn').disabled = false;
                    document.getElementById('apply-btn').innerHTML = `<i class="fas fa-check"></i> Applied!`;
                    setTimeout(() => {
                        document.getElementById('apply-btn').innerHTML = `<i class="fas ${isUnsafe ? 'fa-exclamation-triangle' : 'fa-bolt'}"></i> ${isUnsafe ? '⚠️ Test & Apply' : 'Apply Renderer'}`;
                    }, 2000);
                };
                
                // Cancel button
                document.getElementById('cancel-test').onclick = () => {
                    cancelTestMode();                    document.getElementById('test-mode-banner').style.display = 'none';
                    document.getElementById('apply-btn').disabled = false;
                };
                
            } else {
                // Direct apply for safe renderers
                await forceApplyRenderer(state.global);
            }
        });
        
        document.getElementById('recovery-btn').addEventListener('click', async () => {
            await generateRecoveryScript();
            alert(`✅ Recovery script saved to:\n${CONFIG.storagePath}/recover_renderer.sh\n\nRun via ADB if needed:\nadb shell su -c "${CONFIG.storagePath}/recover_renderer.sh"`);
        });

        // Active Tweaks Display
        const tweaksBox = document.createElement('div');
        Object.assign(tweaksBox.style, {
            background: 'rgba(139, 92, 246, 0.1)', border: '1px solid rgba(139, 92, 246, 0.3)',
            borderRadius: '12px', padding: '15px', marginBottom: '20px'
        });
        let tweaksHtml = `<div style="color:#8b5cf6; font-weight:600; margin-bottom:10px; font-size:13px;">
            <i class="fas fa-magic"></i> Active Tweaks (${currentOpt?.label})
        </div>`;
        if (currentOpt?.tweaks) {
            tweaksHtml += '<div style="font-size:12px; color:#aaa;">';
            currentOpt.tweaks.forEach(tweak => {
                const badge = tweak.persistent 
                    ? '<span style="background:#8b5cf6; color:#fff; padding:2px 6px; border-radius:4px; font-size:10px; margin-left:5px;">PERSIST</span>' 
                    : '<span style="background:#6b7280; color:#fff; padding:2px 6px; border-radius:4px; font-size:10px; margin-left:5px;">TEST</span>';
                tweaksHtml += `<div style="margin:5px 0; display:flex; justify-content:space-between; align-items:center;">
                    <span>${tweak.prop}${badge}</span><span style="color:#8b5cf6;">${tweak.value}</span></div>`;
            });
            tweaksHtml += '</div>';
        }
        tweaksBox.innerHTML = tweaksHtml;
        container.appendChild(tweaksBox);

        // Renderer Options
        RENDERER_OPTIONS.forEach(opt => {
            const item = document.createElement('div');
            const isSelected = state.global === opt.id;
            const compatBadge = opt.safe 
                ? '<span style="background:#32D74B; color:#000; padding:2px 8px; border-radius:10px; font-size:10px; margin-left:8px;">SAFE</span>' 
                : '<span style="background:#f59e0b; color:#000; padding:2px 8px; border-radius:10px; font-size:10px; margin-left:8px;">TEST</span>';
            
            Object.assign(item.style, {
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '15px', borderRadius: '12px', marginBottom: '10px', cursor: 'pointer',
                background: isSelected ? 'rgba(139, 92, 246, 0.2)' : 'rgba(255,255,255,0.05)',                border: isSelected ? '1px solid rgba(139, 92, 246, 0.5)' : '1px solid transparent'
            });
            item.innerHTML = `<div style="flex:1;">
                <div style="color:#fff; font-weight:500; margin-bottom:3px;">${opt.label}${compatBadge}</div>
                <div style="color:#888; font-size:12px;">${opt.desc}</div>
            </div>
            <div style="color:${isSelected ? '#8b5cf6' : '#444'};"><i class="fas ${isSelected ? 'fa-check-circle' : 'fa-circle'}"></i></div>`;
            item.addEventListener('click', async () => { 
                state.global = opt.id; 
                saveState(); 
                renderMainView(container); 
            });
            container.appendChild(item);
        });

        // Show current status after delay
        setTimeout(async () => {
            const diag = await checkRendererStatus();
            const statusEl = document.getElementById('apply-status');
            if (statusEl && diag.activePipelines) {
                statusEl.style.display = 'block';
                statusEl.innerHTML = `<small style="color:#888;">Active: Vulkan=${diag.activePipelines.vulkan||0}, OpenGL=${diag.activePipelines.opengl||0}</small>`;
            }
        }, 500);
    }

    // === INIT ===
    function init() {
        const btn = document.getElementById('renderer-item');
        if (!btn) { console.warn('[Renderer] Button not found'); return; }
        
        // Ensure storage path exists
        (async () => {
            await execFn(`mkdir -p ${CONFIG.storagePath}`);
        })();
        
        loadState(); 
        updateMainButton();
        btn.addEventListener('click', async () => { 
            const container = createModal(); 
            await renderMainView(container); 
        });
        console.log('[Renderer] Initialized with KernelSU + Bootloop Prevention');
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();

    // Export for external use
    window.RendererConfig = {         state, 
        setPropPersistent, 
        getProp, 
        checkRendererStatus, 
        forceApplyRenderer, 
        RENDERER_OPTIONS,
        cancelTestMode,
        CONFIG
    };
})();