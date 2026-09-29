// resolutionscale.js - Resolution Scaling Manager (Themed)
(function() {
    'use strict';

    const CONFIG_FILE = '/sdcard/MTK_AI_Engine/resolution_scale_config.txt';
    let currentScale = 100;
    let currentTexture = 1.0;
    let baseDensity = 480; // Default, will be detected

    // Safe exec wrapper
    const execFn = window.exec || async function(cmd, timeout = 3000) {
        return new Promise(resolve => {
            const cb = `res_exec_${Date.now()}_${Math.random().toString(36).substring(2)}`;
            const t = setTimeout(() => { delete window[cb]; resolve(''); }, timeout);
            window[cb] = (_, res) => { clearTimeout(t); delete window[cb]; resolve(res || ''); };
            if (window.ksu) ksu.exec(cmd, `window.${cb}`);
            else { clearTimeout(t); resolve(''); }
        });
    };

    async function init() {
        await detectBaseDensity();
        await loadSavedSettings();
        bindClickHandler();
    }

    async function detectBaseDensity() {
        try {
            const result = await execFn('wm density');
            const match = result.match(/density\s+(\d+)/);
            if (match) {
                baseDensity = parseInt(match[1]);
                console.log('Base density detected:', baseDensity);
            }
        } catch (e) {
            console.warn('Could not detect base density, using default 480');
        }
    }

    async function loadSavedSettings() {
        try {
            const config = await execFn(`cat ${CONFIG_FILE} 2>/dev/null`);
            if (config.trim()) {
                const lines = config.trim().split('\n');
                lines.forEach(line => {
                    const [key, value] = line.split('=');
                    if (key === 'scale') currentScale = parseInt(value);
                    else if (key === 'texture') currentTexture = parseFloat(value);
                });
            }
        } catch (e) {
            console.warn('Failed to load resolution config:', e);
        }
        updateDisplay();
    }

    function updateDisplay() {
        const valEl = document.querySelector('#resolution-scale-item .setting-value') || document.getElementById('resolution-scale-val');
        if (valEl) {
            valEl.innerHTML = `${currentScale}% <i class="fas fa-chevron-right"></i>`;
            valEl.style.color = 'var(--accent-green)';
        }
    }

    function bindClickHandler() {
        const item = document.getElementById('resolution-scale-item');
        if (!item) return;
        
        item.style.cursor = 'pointer';
        item.addEventListener('click', () => {
            showScaleModal();
        });
    }

    function showScaleModal() {
        const existing = document.getElementById('resolution-modal');
        if (existing) existing.remove();

        // Modal Backdrop
        const modal = document.createElement('div');
        modal.id = 'resolution-modal';
        modal.style.cssText = `
            position: fixed; inset: 0; background: rgba(0,0,0,0.75); z-index: 10000;
            display: flex; align-items: center; justify-content: center;
            backdrop-filter: blur(4px); animation: fadeIn 0.2s ease;
        `;

        // Modal Content Box
        const box = document.createElement('div');
        box.style.cssText = `
            background: var(--bg-card);
            border: 1px solid var(--border-color);
            border-radius: 16px;
            padding: 24px; width: 90%; max-width: 400px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.5);
            animation: slideUp 0.3s ease;
        `;

        // Header
        const header = document.createElement('div');
        header.style.cssText = 'text-align: center; margin-bottom: 20px;';
        header.innerHTML = `
            <h3 style="color: #ffffff; margin: 0; font-size: 18px; font-weight: 600;">📐 Resolution & Texture</h3>
            <p style="color: var(--text-secondary); font-size: 12px; margin: 5px 0 0;">Adjust render resolution & texture quality</p>
        `;
        box.appendChild(header);

        // Resolution Slider Section
        const resSection = createSection('🖥️ Render Resolution');
        const resSlider = createSlider(currentScale, 50, 100, 5, (val) => {
            currentScale = val;
            const valSpan = resSection.querySelector('.slider-value');
            if (valSpan) valSpan.textContent = val + '%';
        });
        resSection.appendChild(resSlider);
        box.appendChild(resSection);

        // Texture Quality Slider Section
        const texSection = createSection('🎨 Texture Quality');
        const texSlider = createSlider(currentTexture, 0.5, 2.0, 0.1, (val) => {
            currentTexture = val;
            const valSpan = texSection.querySelector('.slider-value');
            if (valSpan) valSpan.textContent = val.toFixed(1) + 'x';
        });
        texSection.appendChild(texSlider);
        box.appendChild(texSection);

        // Apply Button
        const applyBtn = document.createElement('button');
        applyBtn.textContent = '💾 Apply Changes';
        applyBtn.style.cssText = `
            width: 100%; padding: 14px; margin-top: 15px;
            background: var(--accent-blue);
            color: #ffffff; border: none; border-radius: 12px;
            font-size: 13px; font-weight: 600; cursor: pointer;
            transition: all 0.2s ease;
        `;
        applyBtn.onmouseenter = () => { applyBtn.style.opacity = '0.9'; };
        applyBtn.onmouseleave = () => { applyBtn.style.opacity = '1'; };
        
        applyBtn.onclick = async () => {
            applyBtn.disabled = true;
            applyBtn.textContent = '⏳ Applying...';
            await applySettings();
            applyBtn.textContent = '✅ Applied!';
            setTimeout(() => {
                modal.remove();
                updateDisplay();
            }, 800);
        };
        box.appendChild(applyBtn);

        // Cancel Button
        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = 'Cancel';
        cancelBtn.style.cssText = `
            width: 100%; padding: 14px; margin-top: 10px;
            background: var(--bg-secondary); color: #ffffff;
            border: 1px solid var(--border-color); border-radius: 12px;
            font-size: 13px; font-weight: 600; cursor: pointer;
            transition: all 0.2s ease;
        `;
        cancelBtn.onmouseenter = () => { cancelBtn.style.background = 'var(--bg-primary)'; };
        cancelBtn.onmouseleave = () => { cancelBtn.style.background = 'var(--bg-secondary)'; };
        cancelBtn.onclick = () => modal.remove();
        box.appendChild(cancelBtn);

        modal.appendChild(box);
        
        // Add CSS animations
        const style = document.createElement('style');
        style.textContent = `
            @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
            @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        `;
        document.head.appendChild(style);
        document.body.appendChild(modal);
        modal.onclick = e => { if (e.target === modal) modal.remove(); };
    }

    function createSection(title) {
        const section = document.createElement('div');
        section.style.cssText = 'margin-bottom: 16px; background: var(--bg-secondary); padding: 12px; border-radius: 12px; border: 1px solid var(--border-color);';
        section.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                <span style="color: #ffffff; font-size: 13px; font-weight: 600;">${title}</span>
                <span class="slider-value" style="color: var(--accent-green); font-weight: 600; font-size: 13px;">${title.includes('Resolution') ? currentScale + '%' : currentTexture.toFixed(1) + 'x'}</span>
            </div>
        `;
        return section;
    }

    function createSlider(value, min, max, step, onChange) {
        const container = document.createElement('div');
        container.style.cssText = 'padding: 4px 0;';
        
        const slider = document.createElement('input');
        slider.type = 'range';
        slider.min = min;
        slider.max = max;
        slider.step = step;
        slider.value = value;
        slider.style.cssText = `
            width: 100%; height: 6px; background: var(--border-color);
            border-radius: 3px; outline: none; -webkit-appearance: none; cursor: pointer;
        `;
        slider.oninput = (e) => onChange(parseFloat(e.target.value));
        
        container.appendChild(slider);
        return container;
    }

    async function applySettings() {
        try {
            // 1. Calculate new density based on scale percentage
            const targetDensity = Math.round(baseDensity * (currentScale / 100));
            
            // 2. Save to Config
            const config = `scale=${currentScale}\ntexture=${currentTexture}\ndensity=${targetDensity}`;
            await execFn(`mkdir -p /sdcard/MTK_AI_Engine && echo '${config}' > ${CONFIG_FILE}`);

            // 3. ACTUALLY APPLY the resolution change
            await execFn(`su -c "wm density ${targetDensity}"`);
            
            // 4. Show success message
            if (window.showStatus) {
                window.showStatus(`✅ Resolution: ${currentScale}% (${targetDensity}dpi) | Tex: ${currentTexture}x`, 'var(--accent-green)');
            }
            
            console.log(`Applied resolution: ${currentScale}% (density: ${targetDensity})`);
            
        } catch (e) {
            console.error('Apply failed:', e);
            if (window.showStatus) {
                window.showStatus('❌ Failed to apply. Root required.', 'var(--accent-red, #FF453A)');
            }
            alert('Failed to apply resolution. Make sure you have root access.');
        }
    }

    // Initialize
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
