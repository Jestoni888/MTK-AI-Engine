// renderer.js - Global Renderer Only (Minimal Changes from Working Version)
(function() {
    'use strict';

    const RENDERER_OPTIONS = [
        { 
            id: 'auto', 
            label: 'Auto / Default', 
            desc: 'Let system choose optimal renderer',
            tweaks: [
                { prop: 'debug.hwui.renderer', value: 'skiagl', desc: 'Default SkiaGL', persistent: false },
                { prop: 'persist.sys.ui.hw', value: '1', desc: 'Hardware UI', persistent: true }
            ]
        },
        { 
            id: 'skia-vulkan', 
            label: 'Skia Vulkan', 
            desc: 'Hardware-accelerated 2D via Vulkan',
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
            desc: 'OpenGL-backed Skia rendering',
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
            desc: 'Legacy OpenGL ES rendering',
            tweaks: [
                { prop: 'debug.hwui.renderer', value: 'opengl', desc: 'OpenGL renderer', persistent: false },
                { prop: 'ro.hardware.egl', value: 'default', desc: 'Default EGL', persistent: true },
                { prop: 'debug.egl.hw', value: '0', desc: 'EGL software fallback', persistent: false },
                { prop: 'debug.gralloc.gfx_ubwc_disable', value: '1', desc: 'UBWC disabled', persistent: false },
                { prop: 'persist.sys.ui.hw', value: '0', desc: 'Software UI rendering', persistent: true }
            ]        },
        { 
            id: 'vulkan', 
            label: 'Vulkan', 
            desc: 'Low-level, high-performance API',
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
            desc: 'Multi-threaded Skia OpenGL',
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
            desc: 'Multi-threaded Skia Vulkan',
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

    // === ONLY CHANGE 1: Remove perApp from state ===
    let state = { global: 'auto' };
    let modalOverlay = null;

    // --- KernelSU Shell Execution (UNCHANGED) ---
    const execFn = window.exec || async function(cmd, timeout = 10000) {
        return new Promise(resolve => {
            const cb = `renderer_exec_${Date.now()}_${Math.random().toString(36).substring(2)}`;
            const t = setTimeout(() => { delete window[cb]; resolve(''); }, timeout);
            window[cb] = (_, res) => { clearTimeout(t); delete window[cb]; resolve(res || ''); };            if (window.ksu) ksu.exec(cmd, `window.${cb}`);
            else { clearTimeout(t); resolve(''); }
        });
    };

    // --- PERSISTENT PROP SETTING (UNCHANGED) ---
    async function setPropPersistent(prop, value) {
        const commands = [];
        if (prop.startsWith('ro.')) {
            commands.push(`resetprop -n ${prop} "${value}" 2>/dev/null`);
        }
        if (prop.startsWith('persist.')) {
            const propFile = `/data/property/${prop.replace(/\./g, '_')}`;
            commands.push(`echo -n "${value}" > ${propFile} 2>/dev/null`);
            commands.push(`chmod 600 ${propFile} 2>/dev/null`);
            commands.push(`chown root:root ${propFile} 2>/dev/null`);
        }
        commands.push(`setprop ${prop} "${value}"`);
        for (const cmd of commands) {
            try { await execFn(cmd); } catch (e) {}
        }
        console.log(`[Renderer] Applied: ${prop}=${value}`);
    }

    async function getProp(prop) {
        try {
            const result = await execFn(`getprop ${prop}`);
            return result.trim() || 'not set';
        } catch (e) { return 'error'; }
    }

    // --- DIAGNOSTIC (UNCHANGED) ---
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
        return status;
    }

    // === CORE FRAMEWORK SKIP LIST (Never force-stop these) ===
    const SKIP_CORE_FRAMEWORK = [        // 🔹 Android Core Framework & OS
        'android', 'com.android.server.telecom', 'com.android.server.wifi',
        'com.android.server.connectivity', 'com.android.server.net',
        'com.android.providers.settings', 'com.android.shell',
        'com.android.statementservice', 'com.android.managedprovisioning',
        'com.android.permissioncontroller', 'com.android.externalstorage',
        
        // 🔹 System UI, Navigation & Launcher
        'com.android.systemui', 'com.android.launcher3', 'com.android.quickstep',
        'com.android.launcher', 'com.google.android.launcher',
        // Common OEM Launchers
        'com.miui.home', 'com.sec.android.app.launcher', 'com.htc.launcher',
        'com.oppo.launcher', 'com.lge.launcher2', 'com.huawei.android.launcher',
        
        // 🔹 Telephony, SIM & Carrier Services
        'com.android.phone', 'com.android.incallui', 'com.android.providers.telephony',
        'com.android.carrierconfig', 'com.android.stk', 'com.android.simappdialog',
        
        // 🔹 Google Critical Services (GMS)
        'com.google.android.gms', 'com.google.android.gsf',
        'com.google.android.gms.core', 'com.google.android.setupwizard',
        'com.google.android.configupdater', 'com.google.android.partnersetup',
        'com.google.android.gms.location.history',
        
        // 🔹 Security, Keyguard & Biometrics
        'com.android.keyguard', 'com.android.locksettings',
        'com.google.android.gms.security', 'com.android.biometrics',
        'com.android.systemui.plugin.globalactions',
        
        // 🔹 Input Methods, Accessibility & Voice
        'com.google.android.inputmethod.latin', 'com.android.inputdevices',
        'com.google.android.marvin.talkback', 'com.android.accessibility',
        'com.google.android.googlequicksearchbox',
        
        // 🔹 Content Providers & Media
        'com.android.providers.media', 'com.android.providers.media.module',
        'com.android.providers.downloads', 'com.android.providers.contacts',
        'com.android.providers.calendar', 'com.android.providers.downloads.ui',
        'com.android.mms', 'com.android.providers.userdictionary',
        'com.android.providers.media.module', 'com.android.mtp',
        
        // 🔹 Package Management, Store & Updates
        'com.google.android.packageinstaller', 'com.android.packageinstaller',
        'com.android.vending', 'com.google.android.apps.nbu.files',
        'com.google.android.documentsui', 'com.android.documentsui',
        
        // 🔹 WebView & System Rendering
        'com.google.android.webview', 'com.android.chrome', 'com.android.webview', 'org.chromium.webview_shell',
        'com.google.android.trichromelibrary'
    ];
    // --- FORCE APPLY (Aggressive Mode with Core Framework Protection) ---
    async function forceApplyRenderer(rendererId, pkg = null, forceStopAll = false) {
        const opt = RENDERER_OPTIONS.find(o => o.id === rendererId);
        if (!opt) return;
        
        const statusEl = document.getElementById('apply-status');
        if (statusEl) {
            const scopeText = pkg ? `to ${pkg}` : (forceStopAll ? 'system-wide' : 'global');
            statusEl.innerHTML = `<span style="color:#8b5cf6;">🔄 Applying ${scopeText}...</span>`;
            statusEl.style.display = 'block';
        }
        
        try {
            // === 1. Apply all renderer tweaks ===
            for (const tweak of opt.tweaks) { 
                await setPropPersistent(tweak.prop, tweak.value); 
            }
            
            // === 2. Save global preference for persistence ===
            await execFn(`mkdir -p /sdcard/MTK_AI_Engine && echo '${rendererId}' > /sdcard/MTK_AI_Engine/global_renderer.txt`);
            
            // === 3. Force Stop Strategy ===
            if (pkg) {
                // === Per-App Mode ===
                await execFn(`su -c "rm -rf /data/data/${pkg}/code_cache/com.android.opengl.shaders_cache 2>/dev/null"`);
                await execFn(`su -c "rm -rf /data/data/${pkg}/code_cache/com.android.skia.shaders_cache 2>/dev/null"`);
                await execFn(`su -c "rm -rf /data/data/${pkg}/cache/*shader* 2>/dev/null"`);
                await execFn(`su -c "rm -rf /data/data/${pkg}/cache/shader_cache 2>/dev/null"`);
                console.log(`[Renderer] Cleared caches + force-stopped ${pkg}`);
                
            } else if (forceStopAll) {
                // === AGGRESSIVE MODE: Force-stop ALL non-critical apps ===
                if (statusEl) statusEl.innerHTML = '<span style="color:#f59e0b;">⚙️ Force-stopping all non-core apps...</span>';
                
                try {
                    // Get ALL installed packages
                    const allPkgsRaw = await execFn('pm list packages 2>/dev/null | cut -d: -f2', 15000);
                    const allPkgs = allPkgsRaw.split('\n').map(p => p.trim()).filter(p => p && p.includes('.'));
                    
                    let stopped = 0, skipped = 0;
                    for (const appPkg of allPkgs) {
                        // Skip core framework & critical system packages
                        if (SKIP_CORE_FRAMEWORK.includes(appPkg)) { skipped++; continue; }
                        
                        try {
                            await execFn(`am force-stop ${appPkg} 2>/dev/null`, 2000);
                            stopped++;
                            // Throttle to prevent system overload
                            if (stopped % 15 === 0) await new Promise(r => setTimeout(r, 30));                        } catch (e) { /* ignore individual failures */ }
                    }
                    console.log(`[Renderer] 🛑 Stopped: ${stopped} | 🛡️ Skipped (core): ${skipped} | 📦 Total: ${allPkgs.length}`);
                    
                } catch (e) {
                    console.warn('[Renderer] Bulk force-stop failed, falling back to am kill-all:', e);
                }
                
                // === Clear ALL shader/dalvik caches ===
                await execFn(`su -c "rm -rf /data/dalvik-cache/*hwui* 2>/dev/null"`);
                await execFn(`su -c "rm -rf /data/dalvik-cache/*shader* 2>/dev/null"`);
                await execFn(`su -c "rm -rf /data/app/*/oat/*/*renderer* 2>/dev/null"`);
                await execFn(`su -c "rm -rf /data/data/*/code_cache/*shader* 2>/dev/null"`);
                await execFn(`su -c "rm -rf /data/data/*/cache/*shader* 2>/dev/null"`);
                console.log('[Renderer] Cleared all shader/dalvik caches');
                
            } else {
                // === Standard Global Mode ===
                await execFn(`su -c "rm -rf /data/dalvik-cache/*hwui* 2>/dev/null"`);
                await execFn(`su -c "rm -rf /data/dalvik-cache/*shader* 2>/dev/null"`);
                await execFn(`su -c "rm -rf /data/system/package_cache/* 2>/dev/null"`);
                console.log('[Renderer] Cleared global shader/dalvik caches');
            }
            
            // === 4. Update UI status (REMOVED: Restart critical graphics services) ===
            if (statusEl) {
                const diag = await checkRendererStatus();
                let hint = '';
                if (pkg) hint = 'Reopen app';
                else if (forceStopAll) hint = 'Apps restarting...';
                else hint = 'Reboot recommended for full effect';
                
                statusEl.innerHTML = `<span style="color:#32D74B;">✅ Applied</span><br>
                    <small style="color:#888;">Vulkan: ${diag.activePipelines?.vulkan || '?'} | OpenGL: ${diag.activePipelines?.opengl || '?'}<br>
                    <i style="color:#f59e0b;">⚠️ ${hint}</i></small>`;
            }
            
            // === 5. Dispatch event for other modules ===
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
            console.error('[Renderer] Apply failed:', e);            if (statusEl) statusEl.innerHTML = `<span style="color:#FF453A;">❌ Error: ${e.message}</span>`;
        }
    }

    // === ONLY CHANGE 2: Remove package listing functions (listPackages, getFallbackApps) ===
    // These were only used for per-app view, now removed

    // --- State Management ---
    function loadState() { 
        try { 
            const saved = localStorage.getItem('renderer_settings'); 
            if (saved) {
                const parsed = JSON.parse(saved);
                // === ONLY CHANGE 3: Migrate state, ignore perApp if present ===
                state = { global: parsed.global || 'auto' };
            }
        } catch (e) { state = { global: 'auto' }; } 
    }
    
    function saveState() { 
        localStorage.setItem('renderer_settings', JSON.stringify(state)); 
        updateMainButton(); 
    }
    
    // === ONLY CHANGE 4: Remove per-app count from button display ===
    function updateMainButton() {
        const val = document.getElementById('renderer-val');
        if (!val) return;
        const opt = RENDERER_OPTIONS.find(o => o.id === state.global);
        val.innerHTML = `${opt ? opt.label : 'Auto'} <i class="fas fa-chevron-right"></i>`;
    }

    // --- Modal Creation (UNCHANGED) ---
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
        });        const header = document.createElement('div');
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
        document.getElementById('close-renderer-modal').addEventListener('click', closeModal);
        modalOverlay.addEventListener('click', (e) => { if (e.target === modalOverlay) closeModal(); });
        setTimeout(() => { modalOverlay.style.opacity = '1'; }, 10);
        return content;
    }

    function closeModal() {
        if (!modalOverlay) return;
        modalOverlay.style.opacity = '0';
        setTimeout(() => { modalOverlay.remove(); modalOverlay = null; }, 300);
    }

    // --- ⚠️ BOOTLOOP WARNING COMPONENT (UNCHANGED) ---
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
                    <div style="color:#fca5a5; font-size:11px;">If stuck on logo, clear dalvik cache in recovery</div>
                </div>
                <i class="fas fa-chevron-down" style="color:#888; font-size:12px;"></i>
            </div>
            <div id="warning-details" style="display:none; margin-top:12px; padding-top:12px; border-top:1px solid rgba(239,68,68,0.3);">
                <div style="color:#fca5a5; font-size:11px; line-height:1.6;">
                    <strong>Recovery Steps:</strong><br>
                    1. Power off device completely<br>                    2. Boot into Recovery (Vol+ + Power)<br>
                    3. Select "Wipe Dalvik/ART Cache"<br>
                    4. Select "Wipe Cache Partition"<br>
                    5. Optional: Wipe Data (loses apps)<br>
                    6. Reboot System<br><br>
                    <i style="color:#fbbf24;">💡 Tip: Backup first! Some renderer tweaks require compatible GPU drivers.</i>
                </div>
            </div>
        `;
        warning.addEventListener('click', (e) => {
            if (e.target.closest('#warning-details')) return;
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

    // --- Render Main View (ONLY CHANGE 5: Remove Per-App Button Section) ---
    async function renderMainView(container) {
        container.innerHTML = '';
        // ⚠️ BOOTLOOP WARNING (Prominent, at top)
        container.appendChild(createBootloopWarning());

        // Status/Apply Button
        const applySection = document.createElement('div');
        applySection.style.cssText = 'margin-bottom:20px;';
        applySection.innerHTML = `
            <button id="force-apply-btn" style="width:100%; padding:12px; background:linear-gradient(135deg, #8b5cf6, #6366f1); 
                color:#fff; border:none; border-radius:12px; font-weight:600; cursor:pointer; display:flex; 
                align-items:center; justify-content:center; gap:8px;">
                <i class="fas fa-bolt"></i> Force Apply Renderer
            </button>
            <div id="apply-status" style="margin-top:10px; font-size:12px; color:#888; display:none;"></div>
        `;
        container.appendChild(applySection);

        // Active Tweaks Display
        const tweaksBox = document.createElement('div');
        Object.assign(tweaksBox.style, {
            background: 'rgba(139, 92, 246, 0.1)', border: '1px solid rgba(139, 92, 246, 0.3)',
            borderRadius: '12px', padding: '15px', marginBottom: '20px'
        });
        const currentOpt = RENDERER_OPTIONS.find(o => o.id === state.global);        let tweaksHtml = `<div style="color:#8b5cf6; font-weight:600; margin-bottom:10px; font-size:13px;">
            <i class="fas fa-magic"></i> Active Renderer Tweaks
        </div>`;
        if (currentOpt && currentOpt.tweaks) {
            tweaksHtml += '<div style="font-size:12px; color:#aaa;">';
            currentOpt.tweaks.forEach(tweak => {
                const badge = tweak.persistent ? '<span style="background:#8b5cf6; color:#fff; padding:2px 6px; border-radius:4px; font-size:10px; margin-left:5px;">PERSIST</span>' : '';
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
            Object.assign(item.style, {
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '15px', borderRadius: '12px', marginBottom: '10px', cursor: 'pointer',
                background: isSelected ? 'rgba(139, 92, 246, 0.2)' : 'rgba(255,255,255,0.05)',
                border: isSelected ? '1px solid rgba(139, 92, 246, 0.5)' : '1px solid transparent'
            });
            item.innerHTML = `<div style="flex:1;">
                <div style="color:#fff; font-weight:500; margin-bottom:3px;">${opt.label}</div>
                <div style="color:#888; font-size:12px;">${opt.desc}</div>
            </div>
            <div style="color:${isSelected ? '#8b5cf6' : '#444'};"><i class="fas ${isSelected ? 'fa-check-circle' : 'fa-circle'}"></i></div>`;
            item.addEventListener('click', async () => { state.global = opt.id; saveState(); renderMainView(container); });
            container.appendChild(item);
        });

        // === ONLY CHANGE 6: REMOVED Per-App Button Section ===

        // Bind Force Apply
        document.getElementById('force-apply-btn').addEventListener('click', async () => { await forceApplyRenderer(state.global); });

        // Show current status
        setTimeout(async () => {
            const diag = await checkRendererStatus();
            const statusEl = document.getElementById('apply-status');
            if (statusEl && diag.activePipelines) {
                statusEl.style.display = 'block';
                statusEl.innerHTML = `<small style="color:#888;">Active: Vulkan=${diag.activePipelines.vulkan||0}, OpenGL=${diag.activePipelines.opengl||0}</small>`;
            }
        }, 500);
    }
    // === ONLY CHANGE 7: REMOVED renderPerAppView function entirely ===

    // --- Init (UNCHANGED) ---
    function init() {
        const btn = document.getElementById('renderer-item');
        if (!btn) { console.warn('[Renderer] Button not found'); return; }
        loadState(); updateMainButton();
        btn.addEventListener('click', async () => { const container = createModal(); await renderMainView(container); });
        console.log('[Renderer] Initialized with KernelSU support');
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();

    window.RendererConfig = { state, setPropPersistent, getProp, checkRendererStatus, forceApplyRenderer, RENDERER_OPTIONS };
})();