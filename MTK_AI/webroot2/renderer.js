// renderer.js - WITH BOOTLOOP WARNING
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

    let state = { global: 'auto', perApp: {} };
    let installedApps = [];
    let modalOverlay = null;

    // --- KernelSU Shell Execution ---
    const execFn = window.exec || async function(cmd, timeout = 10000) {
        return new Promise(resolve => {
            const cb = `renderer_exec_${Date.now()}_${Math.random().toString(36).substring(2)}`;
            const t = setTimeout(() => { delete window[cb]; resolve(''); }, timeout);
            window[cb] = (_, res) => { clearTimeout(t); delete window[cb]; resolve(res || ''); };            if (window.ksu) ksu.exec(cmd, `window.${cb}`);
            else { clearTimeout(t); resolve(''); }
        });
    };

    // --- PERSISTENT PROP SETTING ---
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

    // --- DIAGNOSTIC ---
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

    // --- FORCE APPLY ---
    async function forceApplyRenderer(rendererId) {        const opt = RENDERER_OPTIONS.find(o => o.id === rendererId);
        if (!opt) return;
        const statusEl = document.getElementById('apply-status');
        if (statusEl) {
            statusEl.innerHTML = '<span style="color:#8b5cf6;">🔄 Applying tweaks...</span>';
            statusEl.style.display = 'block';
        }
        try {
            for (const tweak of opt.tweaks) { await setPropPersistent(tweak.prop, tweak.value); }
            await execFn('killall -9 com.android.systemui 2>/dev/null || true');
            await execFn('killall -9 android.hardware.graphics.composer 2>/dev/null || true');
            await execFn('rm -rf /data/dalvik-cache/*hwui* 2>/dev/null || true');
            if (statusEl) {
                const diag = await checkRendererStatus();
                statusEl.innerHTML = `<span style="color:#32D74B;">✅ Applied</span><br>
                    <small style="color:#888;">Vulkan: ${diag.activePipelines?.vulkan || '?'} | OpenGL: ${diag.activePipelines?.opengl || '?'}<br>
                    <i style="color:#f59e0b;">⚠️ Reboot recommended</i></small>`;
            }
            window.dispatchEvent(new CustomEvent('renderer-changed', { detail: { renderer: rendererId, tweaks: opt.tweaks } }));
        } catch (e) {
            console.error('[Renderer] Force apply failed:', e);
            if (statusEl) statusEl.innerHTML = `<span style="color:#FF453A;">❌ Error: ${e.message}</span>`;
        }
    }

    // --- Package Listing ---
    async function listPackages() {
        try {
            const appsRaw = await execFn('pm list packages -f -3 2>/dev/null');
            const lines = appsRaw.trim().split('\n').filter(l => l && l.includes('package:'));
            if (!lines.length) { installedApps = getFallbackApps(); return installedApps; }
            const packages = [];
            for (const line of lines) {
                const apkMatch = line.match(/package:(.*\.apk)=([^\s]+)/);
                if (!apkMatch) continue;
                const apkPath = apkMatch[1], pkg = apkMatch[2];
                let appName = pkg;
                try {
                    const apkName = apkPath.split('/').pop().replace('.apk', '');
                    if (apkName && apkName !== 'base') {
                        appName = apkName.replace(/[_-]/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                    } else {
                        const parts = pkg.split('.');
                        appName = parts[parts.length - 1].replace(/([a-z])([A-Z])/g, '$1 $2');
                    }
                } catch (e) {}
                packages.push({ packageName: pkg, appName: appName, path: apkPath });
            }
            installedApps = packages;
            return packages;        } catch (e) { installedApps = getFallbackApps(); return installedApps; }
    }

    function getFallbackApps() {
        return [
            { packageName: 'com.android.chrome', appName: 'Chrome', path: '' },
            { packageName: 'com.google.android.youtube', appName: 'YouTube', path: '' },
            { packageName: 'com.miHoYo.GenshinImpact', appName: 'Genshin Impact', path: '' }
        ];
    }

    // --- State Management ---
    function loadState() { try { const saved = localStorage.getItem('renderer_settings'); if (saved) state = { ...state, ...JSON.parse(saved) }; } catch (e) {} }
    function saveState() { localStorage.setItem('renderer_settings', JSON.stringify(state)); updateMainButton(); }
    function updateMainButton() {
        const val = document.getElementById('renderer-val');
        if (!val) return;
        const opt = RENDERER_OPTIONS.find(o => o.id === state.global);
        const count = Object.keys(state.perApp).length;
        val.innerHTML = `${opt ? opt.label : 'Auto'} ${count > 0 ? `(${count})` : ''} <i class="fas fa-chevron-right"></i>`;
    }

    // --- Modal Creation ---
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
        modalOverlay.appendChild(modal);        document.body.appendChild(modalOverlay);
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

    // --- ⚠️ BOOTLOOP WARNING COMPONENT ---
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
                    1. Power off device completely<br>
                    2. Boot into Recovery (Vol+ + Power)<br>
                    3. Select "Wipe Dalvik/ART Cache"<br>
                    4. Select "Wipe Cache Partition"<br>
                    5. Optional: Wipe Data (loses apps)<br>
                    6. Reboot System<br><br>
                    <i style="color:#fbbf24;">💡 Tip: Backup first! Some renderer tweaks require compatible GPU drivers.</i>
                </div>
            </div>
        `;
                // Toggle details on click
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

    // --- Render Main View ---
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
                <i class="fas fa-bolt"></i> Force Apply & Restart Services
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
        const currentOpt = RENDERER_OPTIONS.find(o => o.id === state.global);
        let tweaksHtml = `<div style="color:#8b5cf6; font-weight:600; margin-bottom:10px; font-size:13px;">
            <i class="fas fa-magic"></i> Active Renderer Tweaks
        </div>`;
        if (currentOpt && currentOpt.tweaks) {
            tweaksHtml += '<div style="font-size:12px; color:#aaa;">';
            currentOpt.tweaks.forEach(tweak => {                const badge = tweak.persistent ? '<span style="background:#8b5cf6; color:#fff; padding:2px 6px; border-radius:4px; font-size:10px; margin-left:5px;">PERSIST</span>' : '';
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

        // Per-App Button
        const perAppBtn = document.createElement('div');
        Object.assign(perAppBtn.style, { marginTop: '20px', paddingTop: '20px', borderTop: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer' });
        const perAppCount = Object.keys(state.perApp).length;
        perAppBtn.innerHTML = `<div style="display:flex; align-items:center; justify-content:space-between; padding:15px; 
            background:rgba(139, 92, 246, 0.1); border-radius:12px; border:1px solid rgba(139, 92, 246, 0.3);">
            <div style="display:flex; align-items:center; gap:12px;">
                <div style="width:40px; height:40px; background:rgba(139, 92, 246, 0.2); border-radius:10px; 
                    display:flex; align-items:center; justify-content:center; color:#8b5cf6;">
                    <i class="fas fa-sliders-h"></i>
                </div>
                <div>
                    <div style="color:#fff; font-weight:500;">Advanced Per-App Renderer</div>
                    <div style="color:#888; font-size:12px;">${perAppCount} apps configured</div>
                </div>
            </div>
            <i class="fas fa-chevron-right" style="color:#8b5cf6;"></i>
        </div>`;
        perAppBtn.addEventListener('click', () => renderPerAppView(container));
        container.appendChild(perAppBtn);

        // Bind Force Apply        document.getElementById('force-apply-btn').addEventListener('click', async () => { await forceApplyRenderer(state.global); });

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

    // --- Per-App View ---
    async function renderPerAppView(container) {
        container.innerHTML = '';
        const statusDiv = document.createElement('div');
        statusDiv.id = 'renderer-scan-status';
        statusDiv.style.cssText = 'text-align:center;font-size:12px;color:#666;margin-bottom:15px;min-height:40px;padding:8px;background:rgba(0,0,0,0.2);border-radius:8px;';
        statusDiv.innerHTML = '<span style="color:#8b5cf6;">⚡ Loading apps...</span>';
        container.appendChild(statusDiv);
        const header = document.createElement('div');
        header.innerHTML = `<button id="back-to-main" style="background:none; border:none; color:#8b5cf6; cursor:pointer; 
            padding:0; display:flex; align-items:center; gap:8px; font-size:14px; margin-bottom:15px;">
            <i class="fas fa-arrow-left"></i> Back to Global Settings
        </button>
        <div style="color:#fff; font-weight:600; margin-bottom:5px;">Per-App Renderer Configuration</div>`;
        container.appendChild(header);
        const searchBox = document.createElement('input');
        searchBox.type = 'text'; searchBox.id = 'renderer-search'; searchBox.placeholder = '🔍 Search apps...';
        Object.assign(searchBox.style, { width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid rgba(139, 92, 246, 0.3)', background: 'rgba(0,0,0,0.3)', color: '#fff', marginBottom: '15px', fontSize: '14px', boxSizing: 'border-box' });
        container.appendChild(searchBox);
        const appList = document.createElement('div');
        appList.id = 'app-list';
        appList.style.cssText = 'display:none;flex-direction:column;gap:8px;margin-bottom:15px;max-height:350px;overflow-y:auto;padding-right:4px;';
        container.appendChild(appList);
        await listPackages();
        statusDiv.style.display = 'none'; appList.style.display = 'flex'; appList.innerHTML = '';
        if (installedApps.length > 0) header.querySelector('div:nth-child(2)').textContent += ` (${installedApps.length} apps)`;
        const colors = ['#8b5cf6', '#06b6d4', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#ef4444'];
        installedApps.forEach(app => {
            const currentRenderer = state.perApp[app.packageName] || 'Auto';
            const colorIdx = app.packageName.charCodeAt(0) % colors.length;
            const color = colors[colorIdx];
            const firstLetter = app.appName.charAt(0).toUpperCase();
            const appItem = document.createElement('div');
            appItem.style.cssText = 'background:rgba(0,0,0,0.3);border-radius:10px;padding:12px;display:flex;align-items:center;gap:12px;';
            appItem.innerHTML = `<div style="width:48px;height:48px;border-radius:12px;background:linear-gradient(135deg,${color},${color}aa);display:flex;align-items:center;justify-content:center;color:#fff;font-size:24px;font-weight:bold;">${firstLetter}</div>
                <div style="flex:1; min-width:0;">
                    <div style="color:#fff; font-size:14px; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${app.appName}</div>                    <div style="color:#555; font-size:10px; font-family:monospace; margin-top:1px;">${app.packageName}</div>
                </div>
                <select class="app-renderer-select" data-package="${app.packageName}" 
                    style="background:rgba(139, 92, 246, 0.2); color:#fff; border:1px solid rgba(139, 92, 246, 0.3); 
                    padding:8px 12px; border-radius:8px; font-size:12px; cursor:pointer; outline:none; min-width:120px;">
                    <option value="Auto" ${currentRenderer === 'Auto' ? 'selected' : ''}>Auto</option>
                    <option value="skia-vulkan" ${currentRenderer === 'skia-vulkan' ? 'selected' : ''}>Skia Vulkan</option>
                    <option value="skiagl" ${currentRenderer === 'skiagl' ? 'selected' : ''}>SkiaGL</option>
                    <option value="opengl" ${currentRenderer === 'opengl' ? 'selected' : ''}>OpenGL</option>
                    <option value="vulkan" ${currentRenderer === 'vulkan' ? 'selected' : ''}>Vulkan</option>
                    <option value="skia-gl-threaded" ${currentRenderer === 'skia-gl-threaded' ? 'selected' : ''}>Skia GL Threaded</option>
                    <option value="skia-vk-threaded" ${currentRenderer === 'skia-vk-threaded' ? 'selected' : ''}>Skia VK Threaded</option>
                </select>`;
            const select = appItem.querySelector('.app-renderer-select');
            select.addEventListener('change', (e) => { const pkg = e.target.dataset.package; const value = e.target.value; if (value === 'Auto') delete state.perApp[pkg]; else state.perApp[pkg] = value; saveState(); });
            appList.appendChild(appItem);
        });
        document.getElementById('renderer-search').addEventListener('input', (e) => {
            const q = e.target.value.toLowerCase();
            const items = appList.querySelectorAll('div[style*="background:rgba"]');
            items.forEach(item => {
                const name = item.querySelector('div:nth-child(2) div:first-child')?.textContent?.toLowerCase() || '';
                const pkg = item.querySelector('div:nth-child(2) div:nth-child(2)')?.textContent?.toLowerCase() || '';
                item.style.display = (name.includes(q) || pkg.includes(q)) ? 'flex' : 'none';
            });
        });
        document.getElementById('back-to-main').addEventListener('click', () => renderMainView(container));
    }

    // --- Init ---
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