// boostcolor.js - Advanced Color Boost Manager with SurfaceFlinger Matrix (Transaction 1015)
(function() {
    'use strict';

    const CONFIG_FILE = '/sdcard/MTK_AI_Engine/boost_color_config.txt';
    let currentColor = '#FF9F0A';
    let currentSaturation = 1.0;
    let currentSharpness = 1.0;
    let currentWarmth = 0;
    let currentMatrix = null; // 16-float array for 4x4 matrix
    let detectedPropsCache = {};

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

    // 🔍 MTK Color & Matrix Property Detection
    async function detectSystemColorProps(forUI = false) {
        try {
            const props = await execFn(`su -c "getprop | grep -iE 'color|saturation|gamma|vivid|hdr|display|sf|surfaceflinger|mtk|led|matrix'" 2>/dev/null`);
            const detected = {};
            const propList = [];

            if (props.trim()) {
                const lines = props.trim().split('\n');
                lines.forEach(line => {
                    const match = line.match(/\[([^\]]+)\]:\s*\[([^\]]*)\]/);
                    if (match) {
                        const [, key, value] = match;
                        const lowerKey = key.toLowerCase();
                        propList.push({ key, value, matched: false });

                        if (lowerKey.includes('saturation') || lowerKey.includes('sat')) {
                            const num = parseFloat(value);
                            if (!isNaN(num)) {
                                detected.saturation = Math.max(0.5, Math.min(2.5, num));
                                propList[propList.length - 1].matched = true;
                                propList[propList.length - 1].mapsTo = 'saturation';
                            }
                        } else if (lowerKey.includes('sharpness') || lowerKey.includes('clarity')) {
                            const num = parseFloat(value);
                            if (!isNaN(num)) {
                                detected.sharpness = Math.max(0.5, Math.min(2.0, num));                                propList[propList.length - 1].matched = true;
                                propList[propList.length - 1].mapsTo = 'sharpness';
                            }
                        } else if (lowerKey.includes('temperature') || lowerKey.includes('warmth') || lowerKey.includes('kelvin')) {
                            const num = parseInt(value);
                            if (!isNaN(num)) {
                                detected.warmth = Math.max(-10, Math.min(10, Math.round((num - 6500) / 200)));
                                propList[propList.length - 1].matched = true;
                                propList[propList.length - 1].mapsTo = 'warmth';
                                propList[propList.length - 1].kelvin = num;
                            }
                        } else if (lowerKey.includes('color') && (lowerKey.includes('filter') || lowerKey.includes('tint'))) {
                            const colorMatch = value.match(/#?([A-Fa-f0-9]{6})/);
                            if (colorMatch) {
                                detected.color = '#' + colorMatch[1].toUpperCase();
                                propList[propList.length - 1].matched = true;
                                propList[propList.length - 1].mapsTo = 'color';
                            }
                        } else if (lowerKey.includes('hdr') || lowerKey.includes('vivid')) {
                            if (value === '1' || value.toLowerCase() === 'true' || value.toLowerCase() === 'on') {
                                detected.saturation = detected.saturation || 1.5;
                                detected.sharpness = detected.sharpness || 1.3;
                                propList[propList.length - 1].matched = true;
                                propList[propList.length - 1].mapsTo = 'preset:vivid';
                            }
                        } else if (lowerKey.includes('matrix')) {
                            const parts = value.split(/[\s,;]+/).filter(v => v.trim() !== '');
                            const nums = parts.map(v => parseFloat(v)).filter(n => !isNaN(n));
                            if (nums.length >= 16) {
                                detected.colorMatrix = nums.slice(0, 20);
                                propList[propList.length - 1].matched = true;
                                propList[propList.length - 1].mapsTo = 'matrix';
                                propList[propList.length - 1].matrixValue = detected.colorMatrix;
                                propList[propList.length - 1].matrixSize = nums.length;
                            }
                        }
                    }
                });
            }

            const tempSetting = await execFn(`su -c "settings get system screen_color_temperature 2>/dev/null"`);
            if (tempSetting.trim() && !isNaN(parseInt(tempSetting))) {
                const kelvin = parseInt(tempSetting);
                detected.warmth = Math.max(-10, Math.min(10, Math.round((kelvin - 6500) / 200)));
                propList.push({ key: 'settings.system.screen_color_temperature', value: `${kelvin}K`, matched: true, mapsTo: 'warmth', kelvin });
            }

            const amoledProp = await execFn(`su -c "getprop persist.sys.led.color.matrix 2>/dev/null"`);
            if (amoledProp.trim() === '1') {
                detected.amoled = true;                propList.push({ key: 'persist.sys.led.color.matrix', value: '1', matched: true, mapsTo: 'amoled' });
            }

            if (forUI) detectedPropsCache = { propList, detected };
            return forUI ? detectedPropsCache : detected;
        } catch (e) {
            console.warn('Color prop detection failed:', e);
            return forUI ? { propList: [], detected: {} } : {};
        }
    }

    // 🎨 Build Detected Props Panel
    function buildDetectedPropsPanel() {
        const panel = document.createElement('div');
        panel.style.cssText = 'margin: 16px 0; padding: 12px; background: rgba(0,0,0,0.25); border-radius: 12px; border: 1px solid rgba(255,255,255,0.1);';

        const header = document.createElement('div');
        header.style.cssText = 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;';
        header.innerHTML = `<span style="color: #8b92b4; font-size: 12px; font-weight: 600;">🔍 Detected System Props</span>
                            <button id="refresh-props-btn" style="padding: 4px 10px; font-size: 10px; background: rgba(255,255,255,0.15); color: #8b92b4; border: 1px solid #8b92b4; border-radius: 6px; cursor: pointer;">⟳ Refresh</button>`;
        panel.appendChild(header);

        const list = document.createElement('div');
        list.id = 'detected-props-list';
        list.style.cssText = 'max-height: 180px; overflow-y: auto;';

        function renderProps() {
            list.innerHTML = '';
            if (!detectedPropsCache.propList?.length) {
                list.innerHTML = '<div style="color: #666; font-size: 11px; padding: 8px;">No color-related props detected</div>';
                return;
            }
            detectedPropsCache.propList.forEach(prop => {
                const item = document.createElement('div');
                item.style.cssText = `display: flex; justify-content: space-between; align-items: center; padding: 6px 8px; margin: 4px 0; background: ${prop.matched ? 'rgba(0,212,255,0.1)' : 'rgba(255,255,255,0.05)'}; border-radius: 6px; font-size: 11px; border-left: 2px solid ${prop.matched ? '#00D4FF' : 'transparent'};`;
                
                const left = document.createElement('div');
                left.style.cssText = 'flex: 1; min-width: 0;';
                let valDisplay = prop.value;
                if (prop.mapsTo === 'matrix') valDisplay = `${prop.matrixSize}-float Matrix`;
                left.innerHTML = `<div style="color: ${prop.matched ? currentColor : '#aaa'}; font-weight: ${prop.matched ? 600 : 400};">${prop.key.split('.').pop()}</div>
                                  <div style="color: #666; font-size: 10px; word-break: break-all;">${valDisplay}</div>`;

                const right = document.createElement('div');
                if (prop.matched) {
                    const btn = document.createElement('button');
                    btn.textContent = 'Apply';
                    btn.style.cssText = `padding: 3px 8px; font-size: 9px; background: ${currentColor}; color: #000; border: none; border-radius: 4px; font-weight: 600; cursor: pointer;`;
                    btn.onclick = () => applyDetectedProp(prop);
                    right.appendChild(btn);                } else {
                    right.innerHTML = '<span style="color: #555; font-size: 10px;">info</span>';
                }

                item.appendChild(left);
                item.appendChild(right);
                list.appendChild(item);
            });
        }

        renderProps();
        panel.appendChild(list);

        header.querySelector('#refresh-props-btn').onclick = async () => {
            const btn = header.querySelector('#refresh-props-btn');
            btn.textContent = '⏳';
            btn.disabled = true;
            await detectSystemColorProps(true);
            renderProps();
            btn.textContent = '⟳ Refresh';
            btn.disabled = false;
            if (window.showStatus) window.showStatus(' Props refreshed', currentColor);
        };

        return panel;
    }

    function applyDetectedProp(prop) {
        if (!prop.mapsTo) return;

        if (prop.mapsTo === 'saturation') currentSaturation = Math.max(0.5, Math.min(2.5, parseFloat(prop.value) || 1.0));
        else if (prop.mapsTo === 'sharpness') currentSharpness = Math.max(0.5, Math.min(2.0, parseFloat(prop.value) || 1.0));
        else if (prop.mapsTo === 'warmth' && prop.kelvin) currentWarmth = Math.max(-10, Math.min(10, Math.round((prop.kelvin - 6500) / 200)));
        else if (prop.mapsTo === 'color') {
            const match = prop.value.match(/#?([A-Fa-f0-9]{6})/);
            if (match) currentColor = '#' + match[1].toUpperCase();
        }
        else if (prop.mapsTo === 'preset:vivid') { currentSaturation = 1.8; currentSharpness = 1.5; currentWarmth = 3; }
        else if (prop.mapsTo === 'matrix' && prop.matrixValue) {
            currentMatrix = [...prop.matrixValue];
            if (window.showStatus) window.showStatus(`🟦 ${prop.matrixSize}-float Matrix Loaded`, '#00D4FF');
            refreshMatrixUI();
        }
        else if (prop.mapsTo === 'amoled') document.getElementById('amoled-toggle')?.setAttribute('checked', 'true');

        if (window.showStatus && prop.mapsTo !== 'matrix') window.showStatus(`✅ Applied: ${prop.key.split('.').pop()}`, currentColor);
        updateModalUI();
        updateDisplay();
    }
    // 🔷 Matrix UI & State Management
    function updateMatrixStatus() {
        const statusEl = document.getElementById('matrix-status');
        if (!statusEl) return;
        
        if (currentMatrix && Array.isArray(currentMatrix)) {
            const identity = [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];
            const hasChanges = currentMatrix.some((v, i) => v !== (identity[i] || 0));
            statusEl.textContent = `Active: ${currentMatrix.length}-float matrix${hasChanges ? ' (modified)' : ''}`;
            statusEl.style.color = hasChanges ? '#00D4FF' : '#8b92b4';
        } else {
            statusEl.textContent = 'Using default identity matrix';
            statusEl.style.color = '#8b92b4';
        }
    }

    // Add this enhanced matrix section to replace createMatrixSection()
function createMatrixSection() {
    const section = document.createElement('div');
    section.id = 'matrix-section-container';
    section.style.cssText = 'margin-bottom: 16px; padding: 14px; background: rgba(0,212,255,0.06); border-radius: 14px; border: 1px solid rgba(0,212,255,0.2);';

    const header = document.createElement('div');
    header.style.cssText = 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;';
    header.innerHTML = `<span style="color: #00D4FF; font-size: 13px; font-weight: 600;">🔷 Color Matrix (SF 1015)</span>
                        <button id="matrix-reset-btn" style="padding: 4px 10px; font-size: 10px; background: rgba(255,255,255,0.1); color: #fff; border: 1px solid rgba(255,255,255,0.3); border-radius: 6px; cursor: pointer;">Reset</button>`;
    section.appendChild(header);

    const statusDiv = document.createElement('div');
    statusDiv.id = 'matrix-status';
    statusDiv.style.cssText = 'font-size: 11px; color: #8b92b4; margin-bottom: 12px; padding: 6px 8px; background: rgba(0,0,0,0.3); border-radius: 6px;';
    section.appendChild(statusDiv);

    // Comprehensive Presets Grid
    const presetsDiv = document.createElement('div');
    presetsDiv.style.cssText = 'margin-bottom: 14px;';
    presetsDiv.innerHTML = '<div style="color: #8b92b4; font-size: 11px; margin-bottom: 6px;">📦 Matrix Presets (RGB + Alpha):</div>';
    
    const presetGrid = document.createElement('div');
    presetGrid.style.cssText = 'display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px; margin-bottom: 10px;';
    
    // All shell script functions + custom combos
    const shellPresets = [
        // mat4_default - Identity
        { 
            name: 'Identity', 
            desc: 'Default matrix',
            m: [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1] 
        },
        // mat4 - Uniform scaling
        { 
            name: 'Vivid+', 
            desc: 'mat4(1.2) uniform',
            m: [1.2,0,0,0, 0,1.2,0,0, 0,0,1.1,0, 0,0,0,1] 
        },
        { 
            name: 'Super Vivid', 
            desc: 'mat4(1.3) extreme',
            m: [1.3,0,0,0, 0,1.3,0,0, 0,0,1.2,0, 0,0,0,1] 
        },
        // mat4_rgb - Individual RGB gains
        { 
            name: 'Warm Boost', 
            desc: 'mat4_rgb(1.15,1.05,0.95)',
            m: [1.15,0,0,0, 0,1.05,0,0, 0,0,0.95,0, 0,0,0,1] 
        },
        {             name: 'Cool Boost', 
            desc: 'mat4_rgb(0.95,1.0,1.15)',
            m: [0.95,0,0,0, 0,1.0,0,0, 0,0,1.15,0, 0,0,0,1] 
        },
        { 
            name: 'Red Punch', 
            desc: 'mat4_rgb(1.25,0.95,0.95)',
            m: [1.25,0,0,0, 0,0.95,0,0, 0,0,0.95,0, 0,0,0,1] 
        },
        // mat4_rgba - RGB + Alpha offset
        { 
            name: 'AMOLED Deep', 
            desc: 'mat4_rgba + offset',
            m: [1.2,0,0,0, 0,1.15,0,0, 0,0,1.1,0, 0.02,0.02,0.01,1] 
        },
        { 
            name: 'Cinematic', 
            desc: 'mat4_rgba warm',
            m: [1.1,0,0,0, 0,1.05,0,0, 0,0,0.95,0, 0.03,0.02,0,1] 
        },
        // mat4_aaa - Alpha adjustments
        { 
            name: 'High Contrast', 
            desc: 'mat4_aaa boost',
            m: [1.15,0,0,0, 0,1.1,0,0, 0,0,1.05,0, 0.05,0.03,0.02,1] 
        },
        { 
            name: 'Soft Warm', 
            desc: 'Gentle + alpha',
            m: [1.08,0,0,0, 0,1.05,0,0, 0,0,0.98,0, 0.02,0.01,0,1] 
        },
        // Custom combos
        { 
            name: 'Blue Filter', 
            desc: 'Reduce blue light',
            m: [1.0,0,0,0, 0,0.95,0,0, 0,0,0.75,0, 0.05,0.03,-0.05,1] 
        },
        { 
            name: 'Sepia', 
            desc: 'Vintage brown',
            m: [1.0,0,0,0, 0,0.85,0,0, 0,0,0.6,0, 0.15,0.1,0.05,1] 
        },
        { 
            name: 'Vibrant Cool', 
            desc: 'Cool + vivid',
            m: [0.95,0,0,0, 0,1.05,0,0, 0,0,1.2,0, -0.02,0,0.03,1] 
        },
        { 
            name: 'Natural+', 
            desc: 'Subtle enhance',            m: [1.05,0,0,0, 0,1.03,0,0, 0,0,1.02,0, 0.01,0.01,0,1] 
        },
        { 
            name: 'Night Mode', 
            desc: 'Dark + warm',
            m: [0.9,0,0,0, 0,0.88,0,0, 0,0,0.8,0, 0.05,0.03,0,1] 
        },
        { 
            name: 'HDR Pop', 
            desc: 'Max vividness',
            m: [1.25,0,0,0, 0,1.2,0,0, 0,0,1.15,0, 0.03,0.02,0.02,1] 
        }
    ];
    
    shellPresets.forEach(p => {
        const btn = document.createElement('button');
        btn.innerHTML = `<div style="font-size: 10px; font-weight: 600;">${p.name}</div><div style="font-size: 8px; opacity: 0.7;">${p.desc}</div>`;
        btn.style.cssText = 'padding: 8px 6px; background: rgba(0,212,255,0.1); color: #00D4FF; border: 1px solid rgba(0,212,255,0.3); border-radius: 6px; cursor: pointer; text-align: center; transition: all 0.2s;';
        btn.onmouseenter = () => {
            btn.style.background = 'rgba(0,212,255,0.3)';
            btn.style.transform = 'scale(1.02)';
        };
        btn.onmouseleave = () => {
            btn.style.background = 'rgba(0,212,255,0.1)';
            btn.style.transform = 'scale(1)';
        };
        btn.onclick = () => {
            currentMatrix = [...p.m];
            refreshMatrixUI();
            if (window.showStatus) window.showStatus(`Matrix: ${p.name}`, '#00D4FF');
        };
        presetGrid.appendChild(btn);
    });
    presetsDiv.appendChild(presetGrid);
    section.appendChild(presetsDiv);

    // RGB Gain Sliders (Diagonal: m00, m11, m22)
    const rgbSection = document.createElement('div');
    rgbSection.style.cssText = 'margin-bottom: 12px; padding-bottom: 12px; border-bottom: 1px solid rgba(255,255,255,0.1);';
    rgbSection.innerHTML = '<div style="color: #8b92b4; font-size: 11px; margin-bottom: 8px;">🎨 RGB Gain (Diagonal - mat4_rgb)</div>';
    
    const rgbGains = [
        { label: 'Red Gain (m00)', idx: 0, color: '#FF5555', sliderId: 'gain-slider-0', valId: 'gain-val-0' },
        { label: 'Green Gain (m11)', idx: 5, color: '#55FF55', sliderId: 'gain-slider-5', valId: 'gain-val-5' },
        { label: 'Blue Gain (m22)', idx: 10, color: '#5555FF', sliderId: 'gain-slider-10', valId: 'gain-val-10' }
    ];

    rgbGains.forEach(g => {
        const row = document.createElement('div');
        row.style.cssText = 'margin-bottom: 8px;';        const headerRow = document.createElement('div');
        headerRow.style.cssText = 'display: flex; justify-content: space-between; margin-bottom: 4px;';
        const initVal = (currentMatrix && currentMatrix[g.idx] !== undefined) ? currentMatrix[g.idx] : 1.0;
        headerRow.innerHTML = `<span style="color: #8b92b4; font-size: 10px;">${g.label}</span>
                               <span id="${g.valId}" style="color: ${g.color}; font-size: 10px; font-weight: 600;">${initVal.toFixed(2)}</span>`;
        row.appendChild(headerRow);

        const slider = document.createElement('input');
        slider.type = 'range'; slider.min = 0.5; slider.max = 2.0; slider.step = 0.05;
        slider.id = g.sliderId;
        slider.value = initVal;
        slider.style.cssText = 'width: 100%; height: 4px; background: rgba(255,255,255,0.2); border-radius: 3px; outline: none; -webkit-appearance: none;';
        slider.oninput = (e) => {
            if (!currentMatrix || !Array.isArray(currentMatrix)) {
                currentMatrix = [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];
            }
            currentMatrix[g.idx] = parseFloat(e.target.value);
            document.getElementById(g.valId).textContent = currentMatrix[g.idx].toFixed(2);
            updateMatrixStatus();
        };
        row.appendChild(slider);
        rgbSection.appendChild(row);
    });
    section.appendChild(rgbSection);

    // Alpha/Offset Sliders (Last row: m30, m31, m32)
    const alphaSection = document.createElement('div');
    alphaSection.style.cssText = 'margin-bottom: 12px;';
    alphaSection.innerHTML = '<div style="color: #8b92b4; font-size: 11px; margin-bottom: 8px;">➕ Alpha Offset (Last Row - mat4_rgba/aaa)</div>';
    
    const alphaOffsets = [
        { label: 'Red Offset (m30)', idx: 12, color: '#FF8888', sliderId: 'offset-slider-12', valId: 'offset-val-12' },
        { label: 'Green Offset (m31)', idx: 13, color: '#88FF88', sliderId: 'offset-slider-13', valId: 'offset-val-13' },
        { label: 'Blue Offset (m32)', idx: 14, color: '#8888FF', sliderId: 'offset-slider-14', valId: 'offset-val-14' }
    ];

    alphaOffsets.forEach(g => {
        const row = document.createElement('div');
        row.style.cssText = 'margin-bottom: 8px;';
        const headerRow = document.createElement('div');
        headerRow.style.cssText = 'display: flex; justify-content: space-between; margin-bottom: 4px;';
        const initVal = (currentMatrix && currentMatrix[g.idx] !== undefined) ? currentMatrix[g.idx] : 0.0;
        headerRow.innerHTML = `<span style="color: #8b92b4; font-size: 10px;">${g.label}</span>
                               <span id="${g.valId}" style="color: ${g.color}; font-size: 10px; font-weight: 600;">${initVal.toFixed(2)}</span>`;
        row.appendChild(headerRow);

        const slider = document.createElement('input');
        slider.type = 'range'; slider.min = -0.5; slider.max = 0.5; slider.step = 0.02;
        slider.id = g.sliderId;
        slider.value = initVal;        slider.style.cssText = 'width: 100%; height: 4px; background: rgba(255,255,255,0.2); border-radius: 3px; outline: none; -webkit-appearance: none;';
        slider.oninput = (e) => {
            if (!currentMatrix || !Array.isArray(currentMatrix)) {
                currentMatrix = [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];
            }
            currentMatrix[g.idx] = parseFloat(e.target.value);
            document.getElementById(g.valId).textContent = currentMatrix[g.idx].toFixed(2);
            updateMatrixStatus();
        };
        row.appendChild(slider);
        alphaSection.appendChild(row);
    });
    section.appendChild(alphaSection);

    header.querySelector('#matrix-reset-btn').onclick = () => {
        currentMatrix = null;
        refreshMatrixUI();
        if (window.showStatus) window.showStatus('Matrix reset to default', '#8b92b4');
    };

    setTimeout(() => refreshMatrixUI(), 0);
    return section;
}

// Update refreshMatrixUI to handle offset sliders
function refreshMatrixUI() {
    const modal = document.getElementById('boost-modal');
    if (!modal) return;

    // RGB gains
    const gains = [
        { idx: 0, id: 'gain-slider-0', valId: 'gain-val-0' },
        { idx: 5, id: 'gain-slider-5', valId: 'gain-val-5' },
        { idx: 10, id: 'gain-slider-10', valId: 'gain-val-10' }
    ];

    gains.forEach(g => {
        const slider = modal.querySelector(`#${g.id}`);        const valEl = modal.querySelector(`#${g.valId}`);
        if (slider && valEl) {
            const val = (currentMatrix && currentMatrix[g.idx] !== undefined) ? currentMatrix[g.idx] : 1.0;
            slider.value = val;
            valEl.textContent = val.toFixed(2);
        }
    });

    // Alpha offsets
    const offsets = [
        { idx: 12, id: 'offset-slider-12', valId: 'offset-val-12' },
        { idx: 13, id: 'offset-slider-13', valId: 'offset-val-13' },
        { idx: 14, id: 'offset-slider-14', valId: 'offset-val-14' }
    ];

    offsets.forEach(g => {
        const slider = modal.querySelector(`#${g.id}`);
        const valEl = modal.querySelector(`#${g.valId}`);
        if (slider && valEl) {
            const val = (currentMatrix && currentMatrix[g.idx] !== undefined) ? currentMatrix[g.idx] : 0.0;
            slider.value = val;
            valEl.textContent = val.toFixed(2);
        }
    });

    updateMatrixStatus();
}

    function updateModalUI() {
        const modal = document.getElementById('boost-modal');
        if (!modal) return;

        const colorInput = modal.querySelector('input[type="color"]');
        if (colorInput) colorInput.value = currentColor;

        modal.querySelectorAll('.slider-value').forEach(el => {
            const parent = el.closest('div');
            if (!parent) return;
            const slider = parent.querySelector('input[type="range"]');
            if (!slider) return;

            if (parent.textContent.includes('Saturation')) {
                slider.value = currentSaturation;
                el.textContent = currentSaturation.toFixed(1) + 'x';
            } else if (parent.textContent.includes('Sharpness')) {
                slider.value = currentSharpness;
                el.textContent = currentSharpness.toFixed(1) + 'x';
            } else if (parent.textContent.includes('Temperature')) {
                slider.value = currentWarmth;
                const label = currentWarmth < 0 ? 'Cool' : currentWarmth > 0 ? 'Warm' : 'Neutral';
                el.textContent = `${label} (${currentWarmth})`;
            }
        });

        refreshMatrixUI();

        const box = modal.querySelector('div');
        if (box) {            box.style.borderColor = currentColor;
            box.style.boxShadow = `0 0 40px ${currentColor}40`;
            const h3 = modal.querySelector('h3');
            if (h3) h3.style.color = currentColor;
        }
    }

    // ⚙️ Config & Init
    async function init() {
        await loadSavedConfig();
        bindClickHandler();
    }

    async function loadSavedConfig() {
        try {
            await detectSystemColorProps(true);
            const config = await execFn(`cat ${CONFIG_FILE} 2>/dev/null`);
            if (config.trim()) {
                config.trim().split('\n').forEach(line => {
                    const [key, value] = line.split('=');
                    if (key === 'color' && value) currentColor = value;
                    else if (key === 'saturation' && value) currentSaturation = parseFloat(value);
                    else if (key === 'sharpness' && value) currentSharpness = parseFloat(value);
                    else if (key === 'warmth' && value) currentWarmth = parseInt(value);
                    else if (key === 'matrix' && value && value !== 'default') {
                        const nums = value.split(/[\s,;]+/).filter(v => v.trim() !== '').map(v => parseFloat(v)).filter(n => !isNaN(n));
                        if (nums.length >= 16) currentMatrix = nums.slice(0, 20);
                    }
                });
            } else if (detectedPropsCache.detected && Object.keys(detectedPropsCache.detected).length > 0) {
                const d = detectedPropsCache.detected;
                if (d.color) currentColor = d.color;
                if (d.saturation) currentSaturation = d.saturation;
                if (d.sharpness) currentSharpness = d.sharpness;
                if (d.warmth !== undefined) currentWarmth = d.warmth;
                if (d.colorMatrix) currentMatrix = d.colorMatrix;
            }
        } catch (e) {
            console.warn('Failed to load boost config:', e);
        }
        updateDisplay();
    }

    async function saveConfig() {
        try {
            let matrixStr = '';
            if (currentMatrix && Array.isArray(currentMatrix) && currentMatrix.length) {
                matrixStr = `\nmatrix=${currentMatrix.join(' ')}`;
            }
            const config = `color=${currentColor}\nsaturation=${currentSaturation}\nsharpness=${currentSharpness}\nwarmth=${currentWarmth}${matrixStr}`;            await execFn(`mkdir -p /sdcard/MTK_AI_Engine && echo '${config}' > ${CONFIG_FILE}`);
        } catch (e) {
            console.error('Failed to save config:', e);
        }
    }

    function updateDisplay() {
        const valEl = document.querySelector('#boost-color-item .setting-value');
        if (valEl) {
            const matrixBadge = (currentMatrix && Array.isArray(currentMatrix)) ? ` <span style="font-size:9px;background:#00D4FF;color:#000;padding:2px 4px;border-radius:4px;margin-left:5px;">MATRIX</span>` : '';
            valEl.innerHTML = `${currentColor}${matrixBadge} <i class="fas fa-chevron-right"></i>`;
            valEl.style.color = currentColor;
        }
    }

    function bindClickHandler() {
        const item = document.getElementById('boost-color-item');
        if (!item) return;
        item.style.cursor = 'pointer';
        item.addEventListener('click', () => showBoostModal());
    }

    // 🎨 Modal Builder
    function showBoostModal() {
        const existing = document.getElementById('boost-modal');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = 'boost-modal';
        modal.style.cssText = 'position: fixed; inset: 0; background: rgba(0,0,0,0.85); z-index: 10000; display: flex; align-items: center; justify-content: center; backdrop-filter: blur(5px);';

        const box = document.createElement('div');
        box.style.cssText = `background: linear-gradient(135deg, #1a1f3a, #2d3561); border: 2px solid ${currentColor}; border-radius: 20px; padding: 24px; width: 95%; max-width: 480px; box-shadow: 0 0 40px ${currentColor}40; max-height: 95vh; overflow-y: auto;`;
        
        const header = document.createElement('div');
        header.style.cssText = 'text-align: center; margin-bottom: 20px;';
        header.innerHTML = `<h3 style="color: ${currentColor}; margin: 0; font-size: 20px;">🎨 Advanced Color Boost</h3><p style="color: #8b92b4; font-size: 12px; margin: 5px 0 0;">System-wide color enhancement</p>`;
        box.appendChild(header);

        box.appendChild(buildDetectedPropsPanel());

        const colorSection = createSection('🎨 Base Color');
        const colorInput = document.createElement('input');
        colorInput.type = 'color';
        colorInput.value = currentColor;
        colorInput.style.cssText = 'width: 100%; height: 50px; border: none; border-radius: 12px; background: transparent; cursor: pointer;';
        colorInput.oninput = (e) => {
            currentColor = e.target.value;
            updateModalUI();
            if (document.getElementById('detected-props-list')) {                const oldPanel = document.getElementById('detected-props-list').parentElement;
                oldPanel.replaceWith(buildDetectedPropsPanel());
            }
        };
        colorSection.appendChild(colorInput);
        box.appendChild(colorSection);

        const satSection = createSection('💧 Saturation Boost');
        const satSlider = createSlider(currentSaturation, 0.5, 2.5, 0.1, (val) => {
            currentSaturation = val;
            satSection.querySelector('.slider-value').textContent = val.toFixed(1) + 'x';
        });
        satSection.appendChild(satSlider);
        box.appendChild(satSection);

        const sharpSection = createSection('🔍 Sharpness/Clarity');
        const sharpSlider = createSlider(currentSharpness, 0.5, 2.0, 0.1, (val) => {
            currentSharpness = val;
            sharpSection.querySelector('.slider-value').textContent = val.toFixed(1) + 'x';
        });
        sharpSection.appendChild(sharpSlider);
        box.appendChild(sharpSection);

        const warmSection = createSection('🌡️ Color Temperature');
        const warmSlider = createSlider(currentWarmth, -10, 10, 1, (val) => {
            currentWarmth = val;
            const label = val < 0 ? 'Cool' : val > 0 ? 'Warm' : 'Neutral';
            warmSection.querySelector('.slider-value').textContent = `${label} (${currentWarmth})`;
        });
        warmSection.appendChild(warmSlider);
        box.appendChild(warmSection);

        const amoledSection = createSection('📱 AMOLED Optimization');
        const amoledToggle = document.createElement('label');
        amoledToggle.style.cssText = 'display: flex; align-items: center; justify-content: space-between; padding: 12px; background: rgba(0,0,0,0.3); border-radius: 10px; cursor: pointer;';
        amoledToggle.innerHTML = `<span style="color: #fff; font-size: 13px;">Deep Blacks & Vivid Colors</span><input type="checkbox" id="amoled-toggle" style="transform: scale(1.3);">`;
        amoledSection.appendChild(amoledToggle);
        box.appendChild(amoledSection);

        const matrixSection = createMatrixSection();
        box.appendChild(matrixSection);

        const presetSection = createSection('⚡ Quick Presets');
        const presets = [
            { name: 'Vivid', color: '#FF9F0A', sat: 1.8, sharp: 1.5, warm: 3 },
            { name: 'AMOLED', color: '#00D4FF', sat: 2.0, sharp: 1.3, warm: -2 },
            { name: 'Warm', color: '#FF6B35', sat: 1.5, sharp: 1.2, warm: 8 },
            { name: 'Cool', color: '#4ECDC4', sat: 1.6, sharp: 1.4, warm: -5 },
            { name: 'Natural', color: '#95E1D3', sat: 1.0, sharp: 1.0, warm: 0 }
        ];        const presetGrid = document.createElement('div');
        presetGrid.style.cssText = 'display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px;';
        presets.forEach(preset => {
            const btn = document.createElement('button');
            btn.textContent = preset.name;
            btn.style.cssText = `padding: 10px; background: ${preset.color}20; border: 1px solid ${preset.color}; color: ${preset.color}; border-radius: 8px; font-size: 11px; font-weight: 600; cursor: pointer; transition: all 0.2s;`;
            btn.onmouseenter = () => { btn.style.background = preset.color; btn.style.color = '#fff'; };
            btn.onmouseleave = () => { btn.style.background = `${preset.color}20`; btn.style.color = preset.color; };
            btn.onclick = () => {
                currentColor = preset.color; currentSaturation = preset.sat; currentSharpness = preset.sharp; currentWarmth = preset.warm;
                updateModalUI();
            };
            presetGrid.appendChild(btn);
        });
        presetSection.appendChild(presetGrid);
        box.appendChild(presetSection);

        const applyBtn = document.createElement('button');
        applyBtn.textContent = '💾 Apply Color Boost';
        applyBtn.style.cssText = `width: 100%; padding: 14px; margin-top: 20px; background: linear-gradient(135deg, ${currentColor}, ${currentColor}aa); color: #fff; border: none; border-radius: 12px; font-size: 14px; font-weight: 700; cursor: pointer; box-shadow: 0 4px 15px ${currentColor}60;`;
        applyBtn.onclick = async () => { await applyBoost(); modal.remove(); };
        box.appendChild(applyBtn);

        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = 'Cancel';
        cancelBtn.style.cssText = 'width: 100%; padding: 12px; margin-top: 10px; background: rgba(255,255,255,0.1); color: #fff; border: none; border-radius: 10px; font-size: 13px; cursor: pointer;';
        cancelBtn.onclick = () => modal.remove();
        box.appendChild(cancelBtn);

        modal.appendChild(box);
        document.body.appendChild(modal);
        modal.onclick = e => { if (e.target === modal) modal.remove(); };
        if (detectedPropsCache.detected?.amoled) document.getElementById('amoled-toggle').checked = true;
    }

    function createSection(title) {
        const section = document.createElement('div');
        section.style.cssText = 'margin-bottom: 16px;';
        section.innerHTML = `<div style="color: #fff; font-size: 13px; font-weight: 600; margin-bottom: 8px;">${title} <span class="slider-value" style="color: #8b92b4; font-weight: 400;"></span></div>`;
        return section;
    }

    function createSlider(value, min, max, step, onChange) {
        const container = document.createElement('div');
        container.style.cssText = 'padding: 8px 0; display: flex; align-items: center; gap: 10px;';
        const slider = document.createElement('input');
        slider.type = 'range'; slider.min = min; slider.max = max; slider.step = step; slider.value = value;
        slider.style.cssText = 'flex: 1; height: 6px; background: rgba(255,255,255,0.2); border-radius: 3px; outline: none; -webkit-appearance: none;';
        slider.oninput = (e) => onChange(parseFloat(e.target.value));
                const valueSpan = document.createElement('span');
        valueSpan.className = 'slider-value';
        valueSpan.style.cssText = 'color: #8b92b4; font-size: 12px; min-width: 50px; text-align: right;';
        container.appendChild(slider);
        container.appendChild(valueSpan);
        onChange(value);
        return container;
    }

    // 🚀 Apply Boost with SurfaceFlinger Matrix (Transaction 1015)
    async function applyBoost() {
        try {
            // 1. Apply Saturation via SurfaceFlinger
            await execFn(`su -c "service call SurfaceFlinger 1022 f ${currentSaturation}" 2>/dev/null`);
            
            // 2. Apply Color Temperature
            if (currentWarmth !== 0) {
                const tempValue = 6500 + (currentWarmth * 200);
                await execFn(`su -c "settings put system screen_color_temperature ${tempValue}"`);
                await execFn(`su -c "settings put system screen_color_temperature_native ${tempValue}"`);
            }
            
            // 3. Apply Sharpness
            if (currentSharpness !== 1.0) {
                await execFn(`su -c "setprop sys.display.sharpness ${currentSharpness}"`);
            }
            
            // 4. AMOLED Optimization
            const amoledEnabled = document.getElementById('amoled-toggle')?.checked;
            if (amoledEnabled) {
                await execFn(`su -c "settings put system screen_brightness_mode 0"`);
                await execFn(`su -c "setprop sys.led.color.matrix 1"`);
                await execFn(`su -c "setprop persist.sys.led.color.matrix 1"`);
            } else {
                await execFn(`su -c "setprop sys.led.color.matrix 0"`);
                await execFn(`su -c "setprop persist.sys.led.color.matrix 0"`);
            }

            // 5. 🔷 Apply Color Matrix via SurfaceFlinger Transaction 1015
            // Format: service call SurfaceFlinger 1015 i32 1 f m00 f m01 ... f m33
            if (currentMatrix && Array.isArray(currentMatrix) && currentMatrix.length >= 16) {
                // Build 4x4 matrix command (use first 16 values)
                const matrix16 = currentMatrix.slice(0, 16);
                let matrixCmd = 'su -c "service call SurfaceFlinger 1015 i32 1';
                matrix16.forEach(val => {
                    matrixCmd += ` f ${val}`;
                });
                matrixCmd += '"';
                
                await execFn(matrixCmd);                console.log('[Matrix Applied]', matrix16);
            }
            
            // 6. Apply base color tint (optional, via SurfaceFlinger 1037)
            const r = parseInt(currentColor.substr(1, 2), 16) / 255;
            const g = parseInt(currentColor.substr(3, 2), 16) / 255;
            const b = parseInt(currentColor.substr(5, 2), 16) / 255;
            await execFn(`su -c "service call SurfaceFlinger 1037 f ${r} f ${g} f ${b} f 1.0" 2>/dev/null`);
            
            // 7. Save configuration
            await saveConfig();
            
            // 8. Show success feedback
            const matrixStatus = (currentMatrix && Array.isArray(currentMatrix)) ? ` | Matrix:SF1015` : '';
            if (window.showStatus) {
                window.showStatus(`✅ Color Boost Applied! Sat:${currentSaturation}x Sharp:${currentSharpness}x${matrixStatus}`, currentColor);
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

    async function debugColorProps() {
        const raw = await execFn(`su -c "getprop | grep -iE 'color|saturation|gamma|vivid|hdr|display|sf|surfaceflinger|mtk|matrix'"`);
        console.log('[MTK Color Debug]', raw);
        return raw;
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    window.applyBoostColor = applyBoost;
    window.debugColorProps = debugColorProps;
    window.detectSystemColorProps = () => detectSystemColorProps(true);
    window.refreshDetectedPropsUI = () => {
        detectSystemColorProps(true);
        const modal = document.getElementById('boost-modal');
        if (modal) {
            const panel = modal.querySelector('#detected-props-list')?.parentElement;
            if (panel) panel.replaceWith(buildDetectedPropsPanel());
        }    };
})();