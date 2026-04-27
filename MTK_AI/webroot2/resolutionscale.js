// resolutionscale.js - Resolution Scaling Manager (FIXED)
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
            }        } catch (e) {
            console.warn('Failed to load resolution config:', e);
        }
        updateDisplay();
    }

    function updateDisplay() {
        const valEl = document.querySelector('#resolution-scale-item .setting-value');
        if (valEl) {
            valEl.innerHTML = `${currentScale}% <i class="fas fa-chevron-right"></i>`;
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

        const modal = document.createElement('div');
        modal.id = 'resolution-modal';
        modal.style.cssText = `
            position: fixed; inset: 0; background: rgba(0,0,0,0.85); z-index: 10000;
            display: flex; align-items: center; justify-content: center;
            backdrop-filter: blur(5px);
        `;

        const box = document.createElement('div');
        box.style.cssText = `
            background: linear-gradient(135deg, #1a1f3a, #2d3561);
            border: 2px solid #2ecc71;
            border-radius: 20px;
            padding: 24px; width: 95%; max-width: 450px;
            box-shadow: 0 0 40px rgba(46, 204, 113, 0.2);
        `;

        // Header
        const header = document.createElement('div');
        header.style.cssText = 'text-align: center; margin-bottom: 20px;';
        header.innerHTML = `
            <h3 style="color: #2ecc71; margin: 0; font-size: 20px;">📐 Resolution & Texture</h3>
            <p style="color: #8b92b4; font-size: 12px; margin: 5px 0 0;">Adjust render resolution & texture quality</p>        `;

        // Resolution Slider
        const resSection = createSection('🖥️ Render Resolution');
        const resSlider = createSlider(currentScale, 50, 100, 5, (val) => {
            currentScale = val;
            resSection.querySelector('.slider-value').textContent = val + '%';
        });
        resSection.appendChild(resSlider);
        box.appendChild(resSection);

        // Texture Slider
        const texSection = createSection('🎨 Texture Quality');
        const texSlider = createSlider(currentTexture, 0.5, 2.0, 0.1, (val) => {
            currentTexture = val;
            texSection.querySelector('.slider-value').textContent = val.toFixed(1) + 'x';
        });
        texSection.appendChild(texSlider);
        box.appendChild(texSection);

        // Apply Button
        const applyBtn = document.createElement('button');
        applyBtn.textContent = '💾 Apply Changes';
        applyBtn.style.cssText = `
            width: 100%; padding: 14px; margin-top: 20px;
            background: linear-gradient(135deg, #2ecc71, #27ae60);
            color: #fff; border: none; border-radius: 12px;
            font-size: 14px; font-weight: 700; cursor: pointer;
            box-shadow: 0 4px 15px rgba(46, 204, 113, 0.4);
        `;
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
            width: 100%; padding: 12px; margin-top: 10px;
            background: rgba(255,255,255,0.1); color: #fff;
            border: none; border-radius: 10px; font-size: 13px;
            cursor: pointer;        `;
        cancelBtn.onclick = () => modal.remove();
        box.appendChild(cancelBtn);

        modal.appendChild(box);
        document.body.appendChild(modal);
        modal.onclick = e => { if (e.target === modal) modal.remove(); };
    }

    function createSection(title) {
        const section = document.createElement('div');
        section.style.cssText = 'margin-bottom: 16px;';
        section.innerHTML = `<div style="color: #fff; font-size: 13px; font-weight: 600; margin-bottom: 8px;">${title} <span class="slider-value" style="color: #8b92b4; font-weight: 400;"></span></div>`;
        return section;
    }

    function createSlider(value, min, max, step, onChange) {
        const container = document.createElement('div');
        container.style.cssText = 'padding: 8px 0;';
        
        const slider = document.createElement('input');
        slider.type = 'range';
        slider.min = min;
        slider.max = max;
        slider.step = step;
        slider.value = value;
        slider.style.cssText = `
            width: 100%; height: 6px; background: rgba(255,255,255,0.2);
            border-radius: 3px; outline: none; -webkit-appearance: none;
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
            if (window.showStatus) {                window.showStatus(`✅ Resolution: ${currentScale}% (${targetDensity}dpi) | Tex: ${currentTexture}x`, '#2ecc71');
            }
            
            console.log(`Applied resolution: ${currentScale}% (density: ${targetDensity})`);
            
        } catch (e) {
            console.error('Apply failed:', e);
            if (window.showStatus) {
                window.showStatus('❌ Failed to apply. Root required.', '#FF453A');
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