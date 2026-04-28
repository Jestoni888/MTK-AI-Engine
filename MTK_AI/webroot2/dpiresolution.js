// dpiResolution.js - DPI & Resolution Manager (Adaptive Screen Sizes)
(function() {
    'use strict';

    const CONFIG_PATH = '/sdcard/MTK_AI_Engine/dpi_config.json';
    
    const DENSITY_PRESETS = [
        { label: 'Low (160 DPI)', value: 160 },
        { label: 'Medium (240 DPI)', value: 240 },
        { label: 'High (320 DPI)', value: 320 },
        { label: 'Very High (480 DPI)', value: 480 },
        { label: 'Custom...', value: 'custom' }
    ];

    let currentRes = '', currentDpi = '', nativeRes = '', nativeDpi = '';
    let screenWidth = 0, screenHeight = 0;
    let isPortrait = false;
    let RESOLUTIONS = [];

    const execFn = window.exec || async function(cmd, timeout = 5000) {
        return new Promise(resolve => {
            const cb = `dpi_exec_${Date.now()}_${Math.random().toString(36).substring(2)}`;
            const t = setTimeout(() => { delete window[cb]; resolve(''); }, timeout);
            window[cb] = (_, res) => { clearTimeout(t); delete window[cb]; resolve(res || ''); };
            if (window.ksu) ksu.exec(cmd, `window.${cb}`);
            else { clearTimeout(t); resolve(''); }
        });
    };

    async function init() {
        bindClickHandler();
        await loadPersistedConfig();
        await detectScreenProperties();
        buildAdaptiveResolutions();
        updateCardDisplay();
    }

    function bindClickHandler() {
        const btn = document.getElementById('dpi-resolution-btn');
        if (!btn) return;
        btn.addEventListener('click', () => showDpiModal());
    }

    async function detectScreenProperties() {
        try {
            // Get current wm size
            const sizeRaw = await execFn('wm size 2>/dev/null | grep -oE "[0-9]+x[0-9]+"');
            if (sizeRaw && sizeRaw.trim()) {
                const [w, h] = sizeRaw.trim().split('x').map(Number);
                screenWidth = w;                screenHeight = h;
                isPortrait = h > w;
                currentRes = `${w}x${h}`;
            }

            // Get physical/native resolution from system
            const physicalWidth = await execFn('getprop ro.sf.lcd_width 2>/dev/null').trim();
            const physicalHeight = await execFn('getprop ro.sf.lcd_height 2>/dev/null').trim();
            
            if (physicalWidth && physicalHeight) {
                nativeRes = `${physicalWidth}x${physicalHeight}`;
                const pw = parseInt(physicalWidth);
                const ph = parseInt(physicalHeight);
                if (pw > 0 && ph > 0) {
                    screenWidth = pw;
                    screenHeight = ph;
                }
            } else {
                nativeRes = currentRes;
            }

            // Get current and native DPI
            const densityRaw = await execFn('wm density 2>/dev/null | grep -oE "[0-9]+"');
            currentDpi = densityRaw?.trim() || 'unknown';
            
            nativeDpi = await execFn('getprop ro.sf.lcd_density 2>/dev/null').trim();
            if (!nativeDpi) nativeDpi = currentDpi;

            console.log(`📱 Screen: ${screenWidth}x${screenHeight}, Portrait: ${isPortrait}, Native: ${nativeRes}`);
        } catch (e) {
            console.error('Screen detection failed:', e);
            // Fallback
            screenWidth = 1080;
            screenHeight = 2400;
            isPortrait = true;
            nativeRes = '1080x2400';
        }
    }

    function buildAdaptiveResolutions() {
        RESOLUTIONS = [];
        
        // Determine max dimensions based on orientation
        const maxW = isPortrait ? Math.min(screenWidth, screenHeight) : Math.max(screenWidth, screenHeight);
        const maxH = isPortrait ? Math.max(screenWidth, screenHeight) : Math.min(screenWidth, screenHeight);
        
        console.log(`📐 Max resolution: ${maxW}x${maxH} (${isPortrait ? 'Portrait' : 'Landscape'})`);

        // Generate percentage-based options
        const percentages = [            { label: '50% (Low)', pct: 0.5 },
            { label: '75% (Medium)', pct: 0.75 },
            { label: '90% (High)', pct: 0.9 },
            { label: '100% (Native)', pct: 1.0 }
        ];

        percentages.forEach(({ label, pct }) => {
            const w = Math.floor(maxW * pct);
            const h = Math.floor(maxH * pct);
            // Align to common multiples (8 or 16) for better compatibility
            const alignedW = Math.floor(w / 8) * 8;
            const alignedH = Math.floor(h / 8) * 8;
            
            RESOLUTIONS.push({
                label: `${label} (${alignedW}x${alignedH})`,
                value: `${alignedW}x${alignedH}`,
                density: Math.floor((pct === 1.0 ? parseInt(nativeDpi) || 420 : 240) * pct)
            });
        });

        // Add common preset resolutions if they fit the screen
        const commonResolutions = [
            { label: '720p HD', w: 1280, h: 720, density: 240 },
            { label: '1080p FHD', w: 1920, h: 1080, density: 420 },
            { label: '1440p 2K', w: 2560, h: 1440, density: 560 }
        ];

        commonResolutions.forEach(res => {
            const [w, h] = isPortrait ? [res.h, res.w] : [res.w, res.h];
            // Only add if it doesn't exceed screen size
            if (w <= maxW && h <= maxH) {
                // Avoid duplicates
                if (!RESOLUTIONS.find(r => r.value === `${w}x${h}`)) {
                    RESOLUTIONS.push({
                        label: `${res.label} (${w}x${h})`,
                        value: `${w}x${h}`,
                        density: res.density
                    });
                }
            }
        });

        // Add custom option
        RESOLUTIONS.push({ label: 'Custom...', value: 'custom', density: 'custom' });
        
        // Add reset option
        RESOLUTIONS.push({ label: '↺ Reset to Native', value: 'reset', density: 'reset' });

        // Sort by resolution size (largest first)
        RESOLUTIONS.sort((a, b) => {            if (a.value === 'custom' || a.value === 'reset') return 1;
            if (b.value === 'custom' || b.value === 'reset') return -1;
            const [aw, ah] = a.value.split('x').map(Number);
            const [bw, bh] = b.value.split('x').map(Number);
            return (bw * bh) - (aw * ah);
        });

        console.log('✅ Adaptive resolutions:', RESOLUTIONS);
    }

    async function loadPersistedConfig() {
        try {
            const saved = await execFn(`cat ${CONFIG_PATH} 2>/dev/null`);
            if (saved && saved.trim()) {
                const config = JSON.parse(saved.trim());
                if (config.lastResolution) currentRes = config.lastResolution;
                if (config.lastDensity) currentDpi = String(config.lastDensity);
            }
        } catch (e) { /* Ignore */ }
    }

    async function saveConfig() {
        try {
            const config = JSON.stringify({
                lastResolution: currentRes,
                lastDensity: currentDpi,
                timestamp: Date.now()
            });
            await execFn(`mkdir -p /sdcard/MTK_AI && echo '${config}' > ${CONFIG_PATH}`);
        } catch (e) { console.warn('Config save failed:', e); }
    }

    function updateCardDisplay() {
        const el = document.getElementById('dpi-res-current');
        if (!el) return;
        el.textContent = `${currentRes} • ${currentDpi} DPI`;
        el.style.fontSize = '11px';
        el.style.color = '#8b92b4';
    }

    function showDpiModal() {
        const existing = document.getElementById('dpi-modal');
        if (existing) existing.remove();

        const orientationText = isPortrait ? '📱 Portrait' : '📐 Landscape';
        const screenSizeText = `${screenWidth}x${screenHeight}`;
        
        const modal = document.createElement('div');
        modal.id = 'dpi-modal';
        modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:10000;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(5px);';
        const box = document.createElement('div');
        box.style.cssText = 'background:linear-gradient(135deg,#1a1f3a,#2d3561);border:2px solid #8b5cf6;border-radius:20px;padding:24px;width:95%;max-width:480px;';

        box.innerHTML = `
            <h3 style="color:#8b5cf6;margin:0 0 5px;font-size:20px;text-align:center;">🖥️ DPI & Resolution</h3>
            <p style="color:#8b92b4;font-size:12px;text-align:center;margin-bottom:10px;">
                ${orientationText} Mode • Screen: ${screenSizeText}
            </p>

            <div style="background:rgba(139,92,246,0.1);color:#c4b5fd;padding:10px;border-radius:8px;font-size:11px;text-align:center;margin-bottom:15px;">
                ⚠️ Extreme values may cause UI glitches. Tap "Reset" to restore defaults.
            </div>

            <div style="margin-bottom:15px;">
                <div style="color:#8b92b4;font-size:11px;margin-bottom:8px;">📐 Resolution</div>
                <div id="res-list" style="display:grid;grid-template-columns:1fr 1fr;gap:8px;"></div>
            </div>

            <div style="margin-bottom:15px;">
                <div style="color:#8b92b4;font-size:11px;margin-bottom:8px;">🔍 DPI (Density)</div>
                <div id="dpi-list" style="display:grid;grid-template-columns:1fr 1fr;gap:8px;"></div>
                <input type="number" id="custom-dpi" placeholder="Custom DPI (e.g., 360)" 
                    style="width:100%;margin-top:8px;padding:10px;background:rgba(0,0,0,0.3);border:1px solid #4b5563;border-radius:8px;color:#fff;font-size:13px;display:none;">
            </div>

            <div style="display:flex;gap:10px;margin-bottom:15px;">
                <button id="dpi-reset-btn" style="flex:1;padding:10px;background:rgba(239,68,68,0.2);color:#fca5a5;border:1px solid #ef4444;border-radius:10px;font-size:12px;cursor:pointer;">
                    ↺ Reset to Native
                </button>
                <button id="dpi-apply-btn" style="flex:1;padding:10px;background:linear-gradient(135deg,#8b5cf6,#6366f1);color:#fff;border:none;border-radius:10px;font-size:12px;cursor:pointer;font-weight:600;">
                    ✅ Apply Changes
                </button>
            </div>

            <div style="text-align:center;font-size:11px;color:#666;">
                Current: <span style="color:#fff">${currentRes} • ${currentDpi} DPI</span><br>
                Native: <span style="color:#8b92b4">${nativeRes} • ${nativeDpi} DPI</span>
            </div>

            <button id="dpi-cancel-btn" style="width:100%;margin-top:12px;padding:12px;background:rgba(255,255,255,0.1);color:#fff;border:none;border-radius:10px;font-size:13px;cursor:pointer;">Close</button>
        `;

        modal.appendChild(box);
        document.body.appendChild(modal);
        modal.onclick = e => { if (e.target === modal) modal.remove(); };
        document.getElementById('dpi-cancel-btn').onclick = () => modal.remove();

        renderResolutionButtons();
        renderDensityButtons();        bindModalEvents(modal);
    }

    function renderResolutionButtons() {
        const container = document.getElementById('res-list');
        if (!container) return;
        
        container.innerHTML = '';
        
        if (!RESOLUTIONS || RESOLUTIONS.length === 0) {
            container.innerHTML = '<div style="color:#ef4444;font-size:11px;text-align:center;padding:10px;grid-column:1/-1;">⚠️ No resolutions available</div>';
            return;
        }
        
        RESOLUTIONS.forEach(res => {
            const btn = document.createElement('button');
            const isActive = currentRes === res.value || (res.value === 'reset' && currentRes === nativeRes);
            btn.innerHTML = `${res.label}${isActive ? ' ✓' : ''}`;
            btn.style.cssText = `padding:10px;background:${isActive ? 'rgba(139,92,246,0.3)' : 'rgba(0,0,0,0.2)'};border:1px solid ${isActive ? '#8b5cf6' : '#4b5563'};border-radius:10px;color:#fff;font-size:11px;cursor:pointer;text-align:center;transition:all 0.2s;`;
            btn.onclick = () => {
                if (res.value === 'custom') {
                    showCustomResolutionInput();
                } else {
                    currentRes = res.value;
                    if (res.density !== 'reset' && res.density !== 'custom') {
                        document.querySelectorAll('#dpi-list button').forEach(b => {
                            b.style.background = 'rgba(0,0,0,0.2)';
                            b.style.borderColor = '#4b5563';
                        });
                        const match = Array.from(document.querySelectorAll('#dpi-list button')).find(b => parseInt(b.dataset.value) === res.density);
                        if (match) {
                            match.style.background = 'rgba(139,92,246,0.3)';
                            match.style.borderColor = '#8b5cf6';
                            currentDpi = String(res.density);
                        }
                        document.getElementById('custom-dpi').style.display = 'none';
                    }
                    renderResolutionButtons();
                }
            };
            container.appendChild(btn);
        });
    }

    function showCustomResolutionInput() {
        const container = document.getElementById('res-list');
        if (!container) return;
        
        container.innerHTML = `
            <div style="grid-column:1/-1;background:rgba(0,0,0,0.3);border:1px solid #8b5cf6;border-radius:10px;padding:12px;">                <div style="color:#8b92b4;font-size:11px;margin-bottom:8px;">Enter Custom Resolution:</div>
                <div style="display:flex;gap:8px;align-items:center;">
                    <input type="number" id="custom-width" placeholder="Width" 
                        style="flex:1;padding:8px;background:rgba(0,0,0,0.5);border:1px solid #4b5563;border-radius:6px;color:#fff;font-size:12px;">
                    <span style="color:#8b92b4;">×</span>
                    <input type="number" id="custom-height" placeholder="Height" 
                        style="flex:1;padding:8px;background:rgba(0,0,0,0.5);border:1px solid #4b5563;border-radius:6px;color:#fff;font-size:12px;">
                </div>
                <div style="display:flex;gap:8px;margin-top:8px;">
                    <button id="custom-res-apply" style="flex:1;padding:8px;background:linear-gradient(135deg,#8b5cf6,#6366f1);color:#fff;border:none;border-radius:6px;font-size:11px;cursor:pointer;">Apply</button>
                    <button id="custom-res-cancel" style="flex:1;padding:8px;background:rgba(255,255,255,0.1);color:#fff;border:none;border-radius:6px;font-size:11px;cursor:pointer;">Cancel</button>
                </div>
                <div style="color:#666;font-size:10px;margin-top:6px;text-align:center;">Max: ${screenWidth}x${screenHeight}</div>
            </div>
        `;
        
        document.getElementById('custom-width').value = screenWidth;
        document.getElementById('custom-height').value = screenHeight;
        
        document.getElementById('custom-res-apply').onclick = () => {
            const w = parseInt(document.getElementById('custom-width').value);
            const h = parseInt(document.getElementById('custom-height').value);
            if (w > 0 && h > 0 && w <= screenWidth * 1.5 && h <= screenHeight * 1.5) {
                currentRes = `${w}x${h}`;
                renderResolutionButtons();
            } else {
                alert('⚠️ Invalid resolution. Must be between 1x1 and ' + Math.floor(screenWidth * 1.5) + 'x' + Math.floor(screenHeight * 1.5));
            }
        };
        
        document.getElementById('custom-res-cancel').onclick = () => {
            renderResolutionButtons();
        };
    }

    function renderDensityButtons() {
        const container = document.getElementById('dpi-list');
        if (!container) return;
        
        container.innerHTML = '';
        
        DENSITY_PRESETS.forEach(dpi => {
            const btn = document.createElement('button');
            const isActive = currentDpi == dpi.value;
            btn.innerHTML = `${dpi.label}${isActive ? ' ✓' : ''}`;
            btn.dataset.value = dpi.value;
            btn.style.cssText = `padding:10px;background:${isActive ? 'rgba(139,92,246,0.3)' : 'rgba(0,0,0,0.2)'};border:1px solid ${isActive ? '#8b5cf6' : '#4b5563'};border-radius:10px;color:#fff;font-size:12px;cursor:pointer;text-align:center;transition:all 0.2s;`;
            btn.onclick = () => {
                if (dpi.value === 'custom') {
                    document.getElementById('custom-dpi').style.display = 'block';                    document.getElementById('custom-dpi').focus();
                } else {
                    document.getElementById('custom-dpi').style.display = 'none';
                    currentDpi = String(dpi.value);
                    renderDensityButtons();
                }
            };
            container.appendChild(btn);
        });

        const customInput = document.getElementById('custom-dpi');
        if (customInput) {
            customInput.onchange = (e) => {
                const val = parseInt(e.target.value);
                if (val >= 80 && val <= 1000) {
                    currentDpi = String(val);
                    renderDensityButtons();
                }
            };
        }
    }

    function bindModalEvents(modal) {
        document.getElementById('dpi-reset-btn').onclick = async () => {
            if (!confirm('Reset resolution & DPI to device defaults?')) return;
            
            const success1 = await applyWmCommand('wm size reset');
            const success2 = await applyWmCommand('wm density reset');
            
            if (success1 && success2) {
                await detectScreenProperties();
                buildAdaptiveResolutions();
                await saveConfig();
                updateCardDisplay();
                alert('✅ Reset to native values');
                modal.remove();
            } else {
                alert('⚠️ Reset failed. Check root permissions.');
            }
        };

        document.getElementById('dpi-apply-btn').onclick = async () => {
            let success = true;
            
            if (currentRes && currentRes !== 'unknown' && currentRes !== 'custom') {
                const cmd = currentRes === 'reset' ? 'wm size reset' : `wm size ${currentRes}`;
                success = await applyWmCommand(cmd) && success;
            }
            
            if (currentDpi && currentDpi !== 'unknown' && currentDpi !== 'custom') {                const cmd = currentDpi === 'reset' ? 'wm density reset' : `wm density ${currentDpi}`;
                success = await applyWmCommand(cmd) && success;
            }
            
            if (success) {
                await saveConfig();
                updateCardDisplay();
                alert('✅ Changes applied!\n\n🔄 Some apps may require restart to reflect new DPI.');
                modal.remove();
            } else {
                alert('⚠️ Failed to apply settings. Ensure root access is granted.');
            }
        };
    }

    async function applyWmCommand(cmd) {
        try {
            const result = await execFn(`su -c "${cmd}" 2>&1`);
            return !result.includes('Permission denied') && !result.includes('not found') && !result.includes('error');
        } catch (e) {
            console.error('Command failed:', cmd, e);
            return false;
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    window.DpiResolutionManager = { init, showDpiModal };
})();