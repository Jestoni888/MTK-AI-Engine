// boostcolor.js - Advanced Color Boost Manager
(function() {
    'use strict';

    const CONFIG_FILE = '/sdcard/MTK_AI_Engine/boost_color_config.txt';
    let currentColor = '#FF9F0A';
    let currentSaturation = 1.0;
    let currentSharpness = 1.0;
    let currentWarmth = 0;

    // Safe exec wrapper
    const execFn = window.exec || async function(cmd, timeout = 3000) {
        return new Promise(resolve => {
            const cb = `boost_exec_${Date.now()}_${Math.random().toString(36).substring(2)}`;
            const t = setTimeout(() => { delete window[cb]; resolve(''); }, timeout);
            window[cb] = (_, res) => { clearTimeout(t); delete window[cb]; resolve(res || ''); };
            if (window.ksu) ksu.exec(cmd, `window.${cb}`);
            else { clearTimeout(t); resolve(''); }
        });
    };

    async function init() {
        await loadSavedConfig();
        bindClickHandler();
    }

    async function loadSavedConfig() {
        try {
            const config = await execFn(`cat ${CONFIG_FILE} 2>/dev/null`);
            if (config.trim()) {
                const lines = config.trim().split('\n');
                lines.forEach(line => {
                    const [key, value] = line.split('=');
                    if (key === 'color') currentColor = value;
                    else if (key === 'saturation') currentSaturation = parseFloat(value);
                    else if (key === 'sharpness') currentSharpness = parseFloat(value);
                    else if (key === 'warmth') currentWarmth = parseInt(value);
                });
            }
        } catch (e) {
            console.warn('Failed to load boost config:', e);
        }
        updateDisplay();
    }

    async function saveConfig() {
        try {
            const config = `color=${currentColor}
saturation=${currentSaturation}
sharpness=${currentSharpness}warmth=${currentWarmth}`;
            await execFn(`mkdir -p /sdcard/MTK_AI_Engine && echo '${config}' > ${CONFIG_FILE}`);
        } catch (e) {
            console.error('Failed to save config:', e);
        }
    }

    function updateDisplay() {
        const valEl = document.querySelector('#boost-color-item .setting-value');
        if (valEl) {
            valEl.innerHTML = `${currentColor} <i class="fas fa-chevron-right"></i>`;
            valEl.style.color = currentColor;
        }
    }

    function bindClickHandler() {
        const item = document.getElementById('boost-color-item');
        if (!item) return;
        
        item.style.cursor = 'pointer';
        item.addEventListener('click', () => {
            showBoostModal();
        });
    }

    function showBoostModal() {
        const existing = document.getElementById('boost-modal');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = 'boost-modal';
        modal.style.cssText = `
            position: fixed; inset: 0; background: rgba(0,0,0,0.85); z-index: 10000;
            display: flex; align-items: center; justify-content: center;
            backdrop-filter: blur(5px);
        `;

        const box = document.createElement('div');
        box.style.cssText = `
            background: linear-gradient(135deg, #1a1f3a, #2d3561);
            border: 2px solid ${currentColor};
            border-radius: 20px;
            padding: 24px; width: 95%; max-width: 450px;
            box-shadow: 0 0 40px ${currentColor}40;
            max-height: 90vh; overflow-y: auto;
        `;

        // Header
        const header = document.createElement('div');
        header.style.cssText = 'text-align: center; margin-bottom: 20px;';        header.innerHTML = `
            <h3 style="color: ${currentColor}; margin: 0; font-size: 20px;">🎨 Advanced Color Boost</h3>
            <p style="color: #8b92b4; font-size: 12px; margin: 5px 0 0;">System-wide color enhancement</p>
        `;

        // Color Picker Section
        const colorSection = createSection('🎨 Base Color');
        const colorInput = document.createElement('input');
        colorInput.type = 'color';
        colorInput.value = currentColor;
        colorInput.style.cssText = `
            width: 100%; height: 50px; border: none; border-radius: 12px;
            background: transparent; cursor: pointer;
        `;
        colorInput.oninput = (e) => {
            currentColor = e.target.value;
            box.style.borderColor = currentColor;
            box.style.boxShadow = `0 0 40px ${currentColor}40`;
            header.querySelector('h3').style.color = currentColor;
        };
        colorSection.appendChild(colorInput);
        box.appendChild(colorSection);

        // Saturation Slider
        const satSection = createSection('💧 Saturation Boost');
        const satSlider = createSlider(currentSaturation, 0.5, 2.5, 0.1, (val) => {
            currentSaturation = val;
            satSection.querySelector('.slider-value').textContent = val.toFixed(1) + 'x';
        });
        satSection.appendChild(satSlider);
        box.appendChild(satSection);

        // Sharpness Slider
        const sharpSection = createSection('🔍 Sharpness/Clarity');
        const sharpSlider = createSlider(currentSharpness, 0.5, 2.0, 0.1, (val) => {
            currentSharpness = val;
            sharpSection.querySelector('.slider-value').textContent = val.toFixed(1) + 'x';
        });
        sharpSection.appendChild(sharpSlider);
        box.appendChild(sharpSection);

        // Warmth Slider
        const warmSection = createSection('🌡️ Color Temperature');
        const warmSlider = createSlider(currentWarmth, -10, 10, 1, (val) => {
            currentWarmth = val;
            const label = val < 0 ? 'Cool' : val > 0 ? 'Warm' : 'Neutral';
            warmSection.querySelector('.slider-value').textContent = `${label} (${val})`;
        });
        warmSection.appendChild(warmSlider);
        box.appendChild(warmSection);
        // AMOLED Mode Toggle
        const amoledSection = createSection('📱 AMOLED Optimization');
        const amoledToggle = document.createElement('label');
        amoledToggle.style.cssText = 'display: flex; align-items: center; justify-content: space-between; padding: 12px; background: rgba(0,0,0,0.3); border-radius: 10px; cursor: pointer;';
        amoledToggle.innerHTML = `
            <span style="color: #fff; font-size: 13px;">Deep Blacks & Vivid Colors</span>
            <input type="checkbox" id="amoled-toggle" style="transform: scale(1.3);">
        `;
        amoledSection.appendChild(amoledToggle);
        box.appendChild(amoledSection);

        // Preset Buttons
        const presetSection = createSection('⚡ Quick Presets');
        const presets = [
            { name: 'Vivid', color: '#FF9F0A', sat: 1.8, sharp: 1.5, warm: 3 },
            { name: 'AMOLED', color: '#00D4FF', sat: 2.0, sharp: 1.3, warm: -2 },
            { name: 'Warm', color: '#FF6B35', sat: 1.5, sharp: 1.2, warm: 8 },
            { name: 'Cool', color: '#4ECDC4', sat: 1.6, sharp: 1.4, warm: -5 },
            { name: 'Natural', color: '#95E1D3', sat: 1.0, sharp: 1.0, warm: 0 }
        ];
        
        const presetGrid = document.createElement('div');
        presetGrid.style.cssText = 'display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px;';
        
        presets.forEach(preset => {
            const btn = document.createElement('button');
            btn.textContent = preset.name;
            btn.style.cssText = `
                padding: 10px; background: ${preset.color}20;
                border: 1px solid ${preset.color}; color: ${preset.color};
                border-radius: 8px; font-size: 11px; font-weight: 600;
                cursor: pointer; transition: all 0.2s;
            `;
            btn.onmouseenter = () => {
                btn.style.background = preset.color;
                btn.style.color = '#fff';
            };
            btn.onmouseleave = () => {
                btn.style.background = `${preset.color}20`;
                btn.style.color = preset.color;
            };
            btn.onclick = () => {
                currentColor = preset.color;
                currentSaturation = preset.sat;
                currentSharpness = preset.sharp;
                currentWarmth = preset.warm;
                
                colorInput.value = currentColor;
                satSlider.querySelector('input').value = currentSaturation;                sharpSlider.querySelector('input').value = currentSharpness;
                warmSlider.querySelector('input').value = currentWarmth;
                
                satSection.querySelector('.slider-value').textContent = currentSaturation.toFixed(1) + 'x';
                sharpSection.querySelector('.slider-value').textContent = currentSharpness.toFixed(1) + 'x';
                const warmLabel = currentWarmth < 0 ? 'Cool' : currentWarmth > 0 ? 'Warm' : 'Neutral';
                warmSection.querySelector('.slider-value').textContent = `${warmLabel} (${currentWarmth})`;
                
                box.style.borderColor = currentColor;
                box.style.boxShadow = `0 0 40px ${currentColor}40`;
                header.querySelector('h3').style.color = currentColor;
            };
            presetGrid.appendChild(btn);
        });
        
        presetSection.appendChild(presetGrid);
        box.appendChild(presetSection);

        // Apply Button
        const applyBtn = document.createElement('button');
        applyBtn.textContent = '💾 Apply Color Boost';
        applyBtn.style.cssText = `
            width: 100%; padding: 14px; margin-top: 20px;
            background: linear-gradient(135deg, ${currentColor}, ${currentColor}aa);
            color: #fff; border: none; border-radius: 12px;
            font-size: 14px; font-weight: 700; cursor: pointer;
            box-shadow: 0 4px 15px ${currentColor}60;
        `;
        applyBtn.onclick = async () => {
            await applyBoost();
            modal.remove();
        };
        box.appendChild(applyBtn);

        // Cancel Button
        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = 'Cancel';
        cancelBtn.style.cssText = `
            width: 100%; padding: 12px; margin-top: 10px;
            background: rgba(255,255,255,0.1); color: #fff;
            border: none; border-radius: 10px; font-size: 13px;
            cursor: pointer;
        `;
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

    async function applyBoost() {
        try {
            // 1. Apply Saturation via SurfaceFlinger
            await execFn(`su -c "service call SurfaceFlinger 1022 f ${currentSaturation}"`);
            
            // 2. Apply Color Temperature (Warmth)
            if (currentWarmth !== 0) {
                // Apply via settings for color temperature
                const tempValue = 6500 + (currentWarmth * 200); // Base 6500K, adjust by warmth
                await execFn(`su -c "settings put system screen_color_temperature ${tempValue}"`);
                await execFn(`su -c "settings put system screen_color_temperature_native ${tempValue}"`);
            }
            
            // 3. Apply Sharpness/Filter (if supported)
            if (currentSharpness !== 1.0) {
                // Try to apply via system properties for display sharpness
                await execFn(`su -c "setprop sys.display.sharpness ${currentSharpness}"`);
            }
            
            // 4. Apply AMOLED optimization (deep blacks)
            const amoledEnabled = document.getElementById('amoled-toggle')?.checked;
            if (amoledEnabled) {                await execFn(`su -c "settings put system screen_brightness_mode 0"`);
                // Apply color matrix for AMOLED
                await execFn(`su -c "setprop sys.led.color.matrix 1"`);
            }
            
            // 5. Apply color filter for base color tint
            const r = parseInt(currentColor.substr(1, 2), 16) / 255;
            const g = parseInt(currentColor.substr(3, 2), 16) / 255;
            const b = parseInt(currentColor.substr(5, 2), 16) / 255;
            
            // Apply color matrix via SurfaceFlinger
            await execFn(`su -c "service call SurfaceFlinger 1037 f ${r} f ${g} f ${b} f 1.0"`);
            
            // 6. Save configuration
            await saveConfig();
            
            // 7. Show success message
            if (window.showStatus) {
                window.showStatus(`✅ Color Boost Applied! Sat:${currentSaturation}x Sharp:${currentSharpness}x`, currentColor);
            }
            
            updateDisplay();
            
        } catch (e) {
            console.error('Boost apply failed:', e);
            if (window.showStatus) {
                window.showStatus('❌ Color Boost Failed', '#FF453A');
            }
            alert('Failed to apply color boost. Ensure root access.');
        }
    }

    // Initialize
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Expose globally
    window.applyBoostColor = applyBoost;
})();