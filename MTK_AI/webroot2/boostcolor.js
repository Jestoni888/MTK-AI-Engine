// boostcolor.js - Advanced Color Boost Manager with SurfaceFlinger Matrix (Transaction 1015)
// ✅ Custom Preset Creator + Presets & Base Color on TOP + Sliders grouped tightly + ALL presets
(function() {
    'use strict';

    const CONFIG_FILE = '/sdcard/MTK_AI_Engine/boost_color_config.txt';
    const CUSTOM_PRESETS_FILE = '/sdcard/MTK_AI_Engine/boost_color_custom_presets.json';
    let currentColor = '#FF9F0A';
    let currentSaturation = 1.0;
    let currentSharpness = 1.0;
    let currentWarmth = 0;
    let currentMatrix = null;
    let detectedPropsCache = {};
    let applyTimeout = null;
    let customPresets = []; // 💾 NEW: Custom presets storage

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

    //  Debounced auto-apply
    function debouncedApply(delay = 150) {
        if (applyTimeout) clearTimeout(applyTimeout);
        applyTimeout = setTimeout(async () => { await applyBoost(); }, delay);
    }

    // 🔍 MTK Color & Matrix Property Detection
    async function detectSystemColorProps(forUI = false) {
        try {
            const props = await execFn(`su -c "getprop | grep -iE 'color|saturation|gamma|vivid|hdr|display|sf|surfaceflinger|mtk|led|matrix'" 2>/dev/null`);
            const detected = {}; const propList = [];
            if (props.trim()) {
                props.trim().split('\n').forEach(line => {
                    const match = line.match(/\[([^\]]+)\]:\s*\[([^\]]*)\]/);
                    if (match) {
                        const [, key, value] = match; const lowerKey = key.toLowerCase();
                        propList.push({ key, value, matched: false });
                        if (lowerKey.includes('saturation') || lowerKey.includes('sat')) {
                            const num = parseFloat(value);
                            if (!isNaN(num)) { detected.saturation = Math.max(0.5, Math.min(2.5, num)); propList[propList.length-1].matched = true; propList[propList.length-1].mapsTo = 'saturation'; }
                        } else if (lowerKey.includes('sharpness') || lowerKey.includes('clarity')) {
                            const num = parseFloat(value);
                            if (!isNaN(num)) { detected.sharpness = Math.max(0.5, Math.min(2.0, num)); propList[propList.length-1].matched = true; propList[propList.length-1].mapsTo = 'sharpness'; }                        } else if (lowerKey.includes('temperature') || lowerKey.includes('warmth') || lowerKey.includes('kelvin')) {
                            const num = parseInt(value);
                            if (!isNaN(num)) { detected.warmth = Math.max(-10, Math.min(10, Math.round((num-6500)/200))); propList[propList.length-1].matched = true; propList[propList.length-1].mapsTo = 'warmth'; propList[propList.length-1].kelvin = num; }
                        } else if (lowerKey.includes('color') && (lowerKey.includes('filter') || lowerKey.includes('tint'))) {
                            const cm = value.match(/#?([A-Fa-f0-9]{6})/);
                            if (cm) { detected.color = '#'+cm[1].toUpperCase(); propList[propList.length-1].matched = true; propList[propList.length-1].mapsTo = 'color'; }
                        } else if (lowerKey.includes('hdr') || lowerKey.includes('vivid')) {
                            if (value==='1'||value.toLowerCase()==='true'||value.toLowerCase()==='on') {
                                detected.saturation = detected.saturation||1.5; detected.sharpness = detected.sharpness||1.3;
                                propList[propList.length-1].matched = true; propList[propList.length-1].mapsTo = 'preset:vivid';
                            }
                        } else if (lowerKey.includes('matrix')) {
                            const parts = value.split(/[\s,;]+/).filter(v=>v.trim()!=='');
                            const nums = parts.map(v=>parseFloat(v)).filter(n=>!isNaN(n));
                            if (nums.length>=16) { detected.colorMatrix = nums.slice(0,20); propList[propList.length-1].matched = true; propList[propList.length-1].mapsTo = 'matrix'; propList[propList.length-1].matrixValue = detected.colorMatrix; propList[propList.length-1].matrixSize = nums.length; }
                        }
                    }
                });
            }
            const tempSetting = await execFn(`su -c "settings get system screen_color_temperature 2>/dev/null"`);
            if (tempSetting.trim() && !isNaN(parseInt(tempSetting))) {
                const kelvin = parseInt(tempSetting);
                detected.warmth = Math.max(-10, Math.min(10, Math.round((kelvin-6500)/200)));
                propList.push({key:'settings.system.screen_color_temperature',value:`${kelvin}K`,matched:true,mapsTo:'warmth',kelvin});
            }
            const amoledProp = await execFn(`su -c "getprop persist.sys.led.color.matrix 2>/dev/null"`);
            if (amoledProp.trim()==='1') { detected.amoled = true; propList.push({key:'persist.sys.led.color.matrix',value:'1',matched:true,mapsTo:'amoled'}); }
            if (forUI) detectedPropsCache = {propList, detected};
            return forUI ? detectedPropsCache : detected;
        } catch(e) { console.warn('Color prop detection failed:',e); return forUI ? {propList:[],detected:{}} : {}; }
    }

    // 🔷 Matrix UI & State Management
    function updateMatrixStatus() {
        const el = document.getElementById('matrix-status'); if (!el) return;
        if (currentMatrix && Array.isArray(currentMatrix)) {
            const id = [1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
            const chg = currentMatrix.some((v,i)=>v!==(id[i]||0));
            el.textContent = `Active: ${currentMatrix.length}-float matrix${chg?' (modified)':''}`; el.style.color = chg?'#00D4FF':'#8b92b4';
        } else { el.textContent='Using default identity matrix'; el.style.color='#8b92b4'; }
    }

    function refreshMatrixUI() {
        const modal = document.getElementById('boost-modal'); if (!modal) return;
        [{idx:0,id:'gain-slider-0',valId:'gain-val-0'},{idx:5,id:'gain-slider-5',valId:'gain-val-5'},{idx:10,id:'gain-slider-10',valId:'gain-val-10'}].forEach(g=>{
            const s=modal.querySelector(`#${g.id}`), v=modal.querySelector(`#${g.valId}`);
            if (s&&v) { const val=(currentMatrix&&currentMatrix[g.idx]!==undefined)?currentMatrix[g.idx]:1.0; s.value=val; v.textContent=val.toFixed(2); }
        });
        [{idx:12,id:'offset-slider-12',valId:'offset-val-12'},{idx:13,id:'offset-slider-13',valId:'offset-val-13'},{idx:14,id:'offset-slider-14',valId:'offset-val-14'}].forEach(g=>{
            const s=modal.querySelector(`#${g.id}`), v=modal.querySelector(`#${g.valId}`);            if (s&&v) { const val=(currentMatrix&&currentMatrix[g.idx]!==undefined)?currentMatrix[g.idx]:0.0; s.value=val; v.textContent=val.toFixed(2); }
        });
        updateMatrixStatus();
    }

    // 🔄 ROBUST UI SYNC
    function syncAllUI() {
        const modal = document.getElementById('boost-modal'); if (!modal) return;
        const cp = modal.querySelector('input[type="color"]'); if (cp) cp.value = currentColor;
        const ss = document.getElementById('sat-slider'), sv = document.getElementById('sat-val');
        if (ss) ss.value = currentSaturation; if (sv) sv.textContent = currentSaturation.toFixed(1)+'x';
        const shs = document.getElementById('sharp-slider'), shv = document.getElementById('sharp-val');
        if (shs) shs.value = currentSharpness; if (shv) shv.textContent = currentSharpness.toFixed(1)+'x';
        const ws = document.getElementById('warm-slider'), wv = document.getElementById('warm-val');
        if (ws) ws.value = currentWarmth; if (wv) { const lb = currentWarmth<0?'Cool':currentWarmth>0?'Warm':'Neutral'; wv.textContent=`${lb} (${currentWarmth})`; }
        refreshMatrixUI();
        const box = modal.querySelector('div'); if (box) { box.style.borderColor=currentColor; box.style.boxShadow=`0 0 40px ${currentColor}40`; const h3=modal.querySelector('h3'); if (h3) h3.style.color=currentColor; }
    }

    // 💾 NEW: Load Custom Presets from JSON file
    async function loadCustomPresets() {
        try {
            const content = await execFn(`cat ${CUSTOM_PRESETS_FILE} 2>/dev/null`);
            if (content.trim()) {
                customPresets = JSON.parse(content.trim());
                if (!Array.isArray(customPresets)) customPresets = [];
            }
        } catch(e) {
            console.warn('Failed to load custom presets:', e);
            customPresets = [];
        }
    }

    //  NEW: Save Custom Presets to JSON file
    async function saveCustomPresets() {
        try {
            await execFn(`mkdir -p /sdcard/MTK_AI_Engine`);
            const json = JSON.stringify(customPresets, null, 2);
            await execFn(`echo '${json.replace(/'/g, "'\\''")}' > ${CUSTOM_PRESETS_FILE}`);
        } catch(e) {
            console.error('Failed to save custom presets:', e);
        }
    }

    // 💾 NEW: Show Save Preset Dialog
    function showSavePresetDialog() {
        const existing = document.getElementById('save-preset-dialog');
        if (existing) existing.remove();

        const overlay = document.createElement('div');        overlay.id = 'save-preset-dialog';
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:10001;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(3px);';
        
        const dialog = document.createElement('div');
        dialog.style.cssText = 'background:linear-gradient(135deg,#1a1f3a,#2d3561);border:2px solid #00D4FF;border-radius:16px;padding:20px;width:90%;max-width:360px;box-shadow:0 0 30px #00D4FF60;';
        
        dialog.innerHTML = `
            <div style="text-align:center;margin-bottom:14px;">
                <h4 style="color:#00D4FF;margin:0;font-size:16px;">💾 Save Current as Preset</h4>
                <p style="color:#8b92b4;font-size:11px;margin:6px 0 0;">Save your current color settings</p>
            </div>
            <div style="margin-bottom:12px;">
                <label style="color:#fff;font-size:12px;display:block;margin-bottom:6px;">Preset Name:</label>
                <input type="text" id="preset-name-input" placeholder="My Custom Preset" maxlength="20"
                    style="width:100%;padding:10px;background:rgba(0,0,0,0.4);border:1px solid rgba(255,255,255,0.2);border-radius:8px;color:#fff;font-size:13px;outline:none;box-sizing:border-box;">
            </div>
            <div style="display:flex;gap:8px;">
                <button id="cancel-save-btn" style="flex:1;padding:10px;background:rgba(255,255,255,0.1);color:#fff;border:none;border-radius:8px;font-size:13px;cursor:pointer;">Cancel</button>
                <button id="confirm-save-btn" style="flex:1;padding:10px;background:linear-gradient(135deg,#00D4FF,#00D4FFaa);color:#000;border:none;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;">Save</button>
            </div>
        `;
        
        overlay.appendChild(dialog);
        document.body.appendChild(overlay);
        overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };
        
        const input = dialog.querySelector('#preset-name-input');
        input.focus();
        
        dialog.querySelector('#cancel-save-btn').onclick = () => overlay.remove();
        dialog.querySelector('#confirm-save-btn').onclick = () => {
            const name = input.value.trim();
            if (!name) { input.style.borderColor = '#FF453A'; input.placeholder = 'Name required!'; return; }
            
            // Check duplicate
            const exists = customPresets.findIndex(p => p.name.toLowerCase() === name.toLowerCase());
            if (exists !== -1) {
                if (!confirm(`"${name}" already exists. Overwrite?`)) return;
                customPresets[exists] = {
                    name, color: currentColor, sat: currentSaturation,
                    sharp: currentSharpness, warm: currentWarmth,
                    matrix: currentMatrix ? [...currentMatrix] : null
                };
            } else {
                customPresets.push({
                    name, color: currentColor, sat: currentSaturation,
                    sharp: currentSharpness, warm: currentWarmth,
                    matrix: currentMatrix ? [...currentMatrix] : null
                });
            }            
            saveCustomPresets();
            overlay.remove();
            renderCustomPresets();
            if (window.showStatus) window.showStatus(`✅ Preset "${name}" saved!`, currentColor);
        };
        
        input.onkeydown = e => { if (e.key === 'Enter') dialog.querySelector('#confirm-save-btn').click(); };
    }

    //  NEW: Render Custom Presets Grid
    function renderCustomPresets() {
        const container = document.getElementById('custom-presets-container');
        if (!container) return;
        
        container.innerHTML = '';
        
        if (customPresets.length === 0) {
            container.innerHTML = '<div style="color:#666;font-size:11px;padding:8px;text-align:center;">No custom presets yet. Tap "💾 Save Current" to create one.</div>';
            return;
        }
        
        const grid = document.createElement('div');
        grid.style.cssText = 'display:grid;grid-template-columns:repeat(3,1fr);gap:6px;';
        
        customPresets.forEach((p, idx) => {
            const btn = document.createElement('div');
            btn.style.cssText = `position:relative;padding:10px 6px;background:${p.color}20;border:1px solid ${p.color};color:${p.color};border-radius:8px;font-size:10px;cursor:pointer;transition:all 0.2s;text-align:center;`;
            btn.innerHTML = `
                <div style="font-size:10px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${p.name}</div>
                <div style="font-size:8px;opacity:0.7;">S:${p.sat} T:${p.warm}${p.matrix?' 🔷':''}</div>
                <button class="delete-preset-btn" data-idx="${idx}" style="position:absolute;top:2px;right:4px;background:rgba(255,0,0,0.7);color:#fff;border:none;border-radius:50%;width:18px;height:18px;font-size:10px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;">×</button>
            `;
            btn.onmouseenter = () => { btn.style.background = p.color; btn.style.color = '#fff'; btn.style.transform = 'scale(1.03)'; };
            btn.onmouseleave = () => { btn.style.background = `${p.color}20`; btn.style.color = p.color; btn.style.transform = 'scale(1)'; };
            btn.onclick = (e) => {
                if (e.target.classList.contains('delete-preset-btn')) return;
                currentColor = p.color; currentSaturation = p.sat; currentSharpness = p.sharp;
                currentWarmth = p.warm; currentMatrix = p.matrix ? [...p.matrix] : null;
                syncAllUI(); debouncedApply(50);
                if (window.showStatus) window.showStatus(`✅ Custom: ${p.name}`, p.color);
            };
            grid.appendChild(btn);
        });
        
        container.appendChild(grid);
        
        // Bind delete buttons
        container.querySelectorAll('.delete-preset-btn').forEach(btn => {
            btn.onclick = (e) => {                e.stopPropagation();
                const idx = parseInt(btn.dataset.idx);
                const name = customPresets[idx].name;
                if (confirm(`Delete preset "${name}"?`)) {
                    customPresets.splice(idx, 1);
                    saveCustomPresets();
                    renderCustomPresets();
                    if (window.showStatus) window.showStatus(`🗑️ Deleted "${name}"`, '#FF453A');
                }
            };
        });
    }

    //  Presets Section (Base Color + Built-in + Custom)
    function createPresetsSection() {
        const presetsDiv = document.createElement('div'); 
        presetsDiv.style.cssText = 'margin-bottom:12px;';
        
        // 💾 Save Current Button
        const saveBtnRow = document.createElement('div');
        saveBtnRow.style.cssText = 'display:flex;gap:6px;margin-bottom:8px;';
        const saveBtn = document.createElement('button');
        saveBtn.textContent = '💾 Save Current as Preset';
        saveBtn.style.cssText = 'flex:1;padding:10px;background:linear-gradient(135deg,#00D4FF,#00D4FFaa);color:#000;border:none;border-radius:8px;font-size:11px;font-weight:700;cursor:pointer;';
        saveBtn.onclick = showSavePresetDialog;
        saveBtnRow.appendChild(saveBtn);
        presetsDiv.appendChild(saveBtnRow);
        
        // Built-in Presets
        const builtinLabel = document.createElement('div');
        builtinLabel.style.cssText = 'color:#8b92b4;font-size:11px;margin-bottom:6px;';
        builtinLabel.textContent = ' Built-in Presets:';
        presetsDiv.appendChild(builtinLabel);
        
        const presetGrid = document.createElement('div'); 
        presetGrid.style.cssText = 'display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:12px;';
        
        const ALL_PRESETS = [
            {name:'Vivid',color:'#FF9F0A',sat:1.8,sharp:1.5,warm:3,matrix:null},
            {name:'AMOLED',color:'#00D4FF',sat:2.0,sharp:1.3,warm:-2,matrix:[1.2,0,0,0,0,1.15,0,0,0,0,1.1,0,0.02,0.02,0.01,1]},
            {name:'Warm',color:'#FF6B35',sat:1.5,sharp:1.2,warm:8,matrix:null},
            {name:'Cool',color:'#4ECDC4',sat:1.6,sharp:1.4,warm:-5,matrix:null},
            {name:'Natural',color:'#95E1D3',sat:1.0,sharp:1.0,warm:0,matrix:null},
            {name:'Cinematic',color:'#FFD93D',sat:1.4,sharp:1.3,warm:2,matrix:[1.1,0,0,0,0,1.05,0,0,0,0,0.95,0,0.03,0.02,0,1]},
            {name:'High Contrast',color:'#FF9F0A',sat:1.5,sharp:1.4,warm:1,matrix:[1.15,0,0,0,0,1.1,0,0,0,0,1.05,0,0.05,0.03,0.02,1]},
            {name:'Blue Filter',color:'#87CEEB',sat:1.2,sharp:1.1,warm:-3,matrix:[1.0,0,0,0,0,0.95,0,0,0,0,0.75,0,0.05,0.03,-0.05,1]},
            {name:'Night Mode',color:'#6B5B95',sat:1.1,sharp:1.0,warm:5,matrix:[0.9,0,0,0,0,0.88,0,0,0,0,0.8,0,0.05,0.03,0,1]},
            {name:'HDR Pop',color:'#FF6B6B',sat:1.9,sharp:1.6,warm:0,matrix:[1.25,0,0,0,0,1.2,0,0,0,0,1.15,0,0.03,0.02,0.02,1]},
            {name:'Sepia',color:'#D4A574',sat:1.3,sharp:1.2,warm:6,matrix:[1.0,0,0,0,0,0.85,0,0,0,0,0.6,0,0.15,0.1,0.05,1]},
            {name:'Vibrant Cool',color:'#4ECDC4',sat:1.7,sharp:1.5,warm:-4,matrix:[0.95,0,0,0,0,1.05,0,0,0,0,1.2,0,-0.02,0,0.03,1]},            {name:'Soft Warm',color:'#FFB347',sat:1.3,sharp:1.1,warm:4,matrix:[1.08,0,0,0,0,1.05,0,0,0,0,0.98,0,0.02,0.01,0,1]},
            {name:'Dark Vibrant',color:'#FF6B6B',sat:1.2,sharp:1.4,warm:-1,matrix:[1.5,0,0,0,0,1.5,0,0,0,0,1.5,0,-0.22,-0.22,-0.22,1]},
            {name:'Dark Vibrant+',color:'#CC0000',sat:1.2,sharp:1.4,warm:-1,matrix:[1.4,0,0,0,0,1.4,0,0,0,0,1.4,0,-0.14,-0.14,-0.14,1]},
            {name:'Red Punch',color:'#FF5555',sat:1.6,sharp:1.3,warm:2,matrix:[1.25,0,0,0,0,0.95,0,0,0,0,0.95,0,0,0,0,1]},
            {name:'Cool Boost',color:'#4ECDC4',sat:1.5,sharp:1.4,warm:-6,matrix:[0.95,0,0,0,0,1.0,0,0,0,0,1.15,0,0,0,0,1]},
            {name:'Identity',color:'#FFFFFF',sat:1.0,sharp:1.0,warm:0,matrix:[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]},
            {name:'Reset',color:'#FFFFFF',sat:1.0,sharp:1.0,warm:0,matrix:null},
            {name:'Gaming FPS',color:'#00FF88',sat:1.6,sharp:1.8,warm:-3,matrix:[1.1,0,0,0,0,1.15,0,0,0,0,1.05,0,0.02,0.01,0,1]},
            {name:'Gaming HDR',color:'#FF4444',sat:2.0,sharp:1.7,warm:0,matrix:[1.3,0,0,0,0,1.25,0,0,0,0,1.2,0,0.04,0.03,0.02,1]},
            {name:'Gaming Night',color:'#8844FF',sat:1.4,sharp:1.5,warm:4,matrix:[0.95,0,0,0,0,0.9,0,0,0,0,0.85,0,0.03,0.02,0,1]},
            {name:'Gaming Pro',color:'#FFAA00',sat:1.7,sharp:1.6,warm:1,matrix:[1.2,0,0,0,0,1.18,0,0,0,0,1.12,0,0.03,0.02,0.01,1]},
            {name:'Photo Pro',color:'#FFD700',sat:1.3,sharp:1.4,warm:2,matrix:[1.05,0,0,0,0,1.08,0,0,0,0,1.02,0,0.02,0.01,0,1]},
            {name:'Video Cinema',color:'#FF8800',sat:1.5,sharp:1.3,warm:3,matrix:[1.12,0,0,0,0,1.08,0,0,0,0,0.98,0,0.04,0.03,0.01,1]},
            {name:'Video HDR+',color:'#FF5500',sat:1.8,sharp:1.6,warm:1,matrix:[1.22,0,0,0,0,1.18,0,0,0,0,1.12,0,0.05,0.04,0.02,1]},
            {name:'Portrait',color:'#FFB6C1',sat:1.2,sharp:1.1,warm:5,matrix:[1.08,0,0,0,0,1.05,0,0,0,0,1.0,0,0.03,0.02,0.01,1]},
            {name:'Landscape',color:'#87CEEB',sat:1.6,sharp:1.5,warm:-2,matrix:[1.1,0,0,0,0,1.12,0,0,0,0,1.08,0,0.02,0.01,0,1]},
            {name:'Eye Care',color:'#FFCC66',sat:1.1,sharp:1.0,warm:7,matrix:[1.05,0,0,0,0,1.02,0,0,0,0,0.95,0,0.04,0.03,0.01,1]},
            {name:'Reading',color:'#FFE4B5',sat:1.0,sharp:1.0,warm:8,matrix:[1.08,0,0,0,0,1.05,0,0,0,0,0.92,0,0.05,0.04,0.02,1]},
            {name:'Paper Mode',color:'#F5DEB3',sat:0.9,sharp:1.0,warm:9,matrix:[1.1,0,0,0,0,1.08,0,0,0,0,0.9,0,0.06,0.05,0.03,1]},
            {name:'Low Blue',color:'#87CEFA',sat:1.1,sharp:1.0,warm:-4,matrix:[0.98,0,0,0,0,0.95,0,0,0,0,0.85,0,0.02,0.01,-0.02,1]},
            {name:'sRGB',color:'#FFFFFF',sat:1.0,sharp:1.0,warm:0,matrix:[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]},
            {name:'DCI-P3',color:'#FF9F0A',sat:1.4,sharp:1.2,warm:1,matrix:[1.15,0,0,0,0,1.1,0,0,0,0,1.05,0,0.03,0.02,0.01,1]},
            {name:'Adobe RGB',color:'#FFB347',sat:1.5,sharp:1.3,warm:2,matrix:[1.18,0,0,0,0,1.12,0,0,0,0,1.08,0,0.04,0.03,0.02,1]},
            {name:'Vintage',color:'#D2691E',sat:1.2,sharp:1.1,warm:6,matrix:[1.1,0,0,0,0,0.95,0,0,0,0,0.8,0,0.08,0.06,0.04,1]},
            {name:'Retro',color:'#CD853F',sat:1.3,sharp:1.2,warm:7,matrix:[1.12,0,0,0,0,0.98,0,0,0,0,0.82,0,0.1,0.08,0.05,1]},
            {name:'Noir',color:'#2F4F4F',sat:0.8,sharp:1.3,warm:-2,matrix:[0.9,0,0,0,0,0.88,0,0,0,0,0.85,0,0.02,0.01,0,1]},
            {name:'Pastel',color:'#FFB6C1',sat:1.1,sharp:1.0,warm:4,matrix:[1.05,0,0,0,0,1.08,0,0,0,0,1.05,0,0.02,0.02,0.01,1]},
            {name:'Neon',color:'#FF00FF',sat:2.2,sharp:1.8,warm:-1,matrix:[1.4,0,0,0,0,1.35,0,0,0,0,1.3,0,0.06,0.05,0.04,1]},
            {name:'Cyberpunk',color:'#00FFFF',sat:1.9,sharp:1.7,warm:-5,matrix:[1.25,0,0,0,0,1.3,0,0,0,0,1.35,0,0.05,0.04,0.06,1]},
            {name:'Sunset',color:'#FF6347',sat:1.7,sharp:1.4,warm:8,matrix:[1.2,0,0,0,0,1.05,0,0,0,0,0.9,0,0.08,0.06,0.03,1]},
            {name:'Ocean',color:'#006994',sat:1.5,sharp:1.3,warm:-6,matrix:[0.95,0,0,0,0,1.05,0,0,0,0,1.2,0,-0.02,0,0.04,1]},
            {name:'Forest',color:'#228B22',sat:1.4,sharp:1.3,warm:3,matrix:[1.05,0,0,0,0,1.15,0,0,0,0,0.95,0,0.02,0.04,0,1]},
            {name:'Autumn',color:'#D2691E',sat:1.6,sharp:1.4,warm:7,matrix:[1.18,0,0,0,0,1.02,0,0,0,0,0.85,0,0.07,0.05,0.02,1]},
            {name:'Winter',color:'#B0E0E6',sat:1.2,sharp:1.2,warm:-7,matrix:[0.98,0,0,0,0,1.02,0,0,0,0,1.15,0,-0.01,0,0.03,1]},
            {name:'Spring',color:'#98FB98',sat:1.5,sharp:1.3,warm:2,matrix:[1.08,0,0,0,0,1.12,0,0,0,0,1.0,0,0.03,0.03,0.01,1]},
            {name:'Summer',color:'#FFD700',sat:1.8,sharp:1.5,warm:5,matrix:[1.22,0,0,0,0,1.15,0,0,0,0,0.95,0,0.06,0.05,0.02,1]},
            {name:'Monochrome',color:'#808080',sat:0.5,sharp:1.2,warm:0,matrix:[0.8,0,0,0,0,0.8,0,0,0,0,0.8,0,0.05,0.05,0.05,1]},
            {name:'Invert',color:'#000000',sat:1.0,sharp:1.0,warm:0,matrix:[-1,0,0,0,0,-1,0,0,0,0,-1,0,1,1,1,1]},
            {name:'Grayscale',color:'#A9A9A9',sat:0.0,sharp:1.0,warm:0,matrix:[0.3,0.59,0.11,0,0.3,0.59,0.11,0,0.3,0.59,0.11,0,0,0,0,1]},
            {name:'Extreme HDR',color:'#FF0000',sat:2.5,sharp:2.0,warm:0,matrix:[1.5,0,0,0,0,1.45,0,0,0,0,1.4,0,0.08,0.07,0.06,1]},
            {name:'Ultra Vivid',color:'#FF1493',sat:2.3,sharp:1.9,warm:1,matrix:[1.45,0,0,0,0,1.4,0,0,0,0,1.35,0,0.07,0.06,0.05,1]},
            {name:'Deep Black',color:'#000000',sat:1.8,sharp:1.5,warm:-3,matrix:[1.3,0,0,0,0,1.25,0,0,0,0,1.2,0,-0.15,-0.15,-0.15,1]},
            {name:'Pure White',color:'#FFFFFF',sat:1.2,sharp:1.3,warm:0,matrix:[1.1,0,0,0,0,1.1,0,0,0,0,1.1,0,0.02,0.02,0.02,1]},
            {name:'Golden Hour',color:'#FFD700',sat:1.6,sharp:1.3,warm:9,matrix:[1.25,0,0,0,0,1.1,0,0,0,0,0.85,0,0.1,0.08,0.04,1]},
            {name:'Blue Hour',color:'#4169E1',sat:1.4,sharp:1.3,warm:-8,matrix:[0.95,0,0,0,0,1.0,0,0,0,0,1.25,0,-0.03,0,0.05,1]},
            {name:'Twilight',color:'#483D8B',sat:1.3,sharp:1.2,warm:5,matrix:[1.05,0,0,0,0,0.98,0,0,0,0,0.9,0,0.05,0.04,0.02,1]},
            {name:'Dawn',color:'#FFA07A',sat:1.4,sharp:1.2,warm:7,matrix:[1.15,0,0,0,0,1.05,0,0,0,0,0.92,0,0.07,0.06,0.03,1]},
            {name:'Dusk',color:'#FF6347',sat:1.5,sharp:1.3,warm:6,matrix:[1.18,0,0,0,0,1.02,0,0,0,0,0.88,0,0.08,0.06,0.03,1]},
            {name:'Arctic',color:'#E0FFFF',sat:1.1,sharp:1.2,warm:-9,matrix:[0.95,0,0,0,0,1.0,0,0,0,0,1.2,0,-0.02,0,0.04,1]},
            {name:'Desert',color:'#EDC9AF',sat:1.3,sharp:1.2,warm:8,matrix:[1.12,0,0,0,0,1.05,0,0,0,0,0.9,0,0.06,0.05,0.03,1]},            {name:'Tropical',color:'#00CED1',sat:1.9,sharp:1.6,warm:3,matrix:[1.2,0,0,0,0,1.25,0,0,0,0,1.1,0,0.04,0.03,0.02,1]},
            {name:'Mystic',color:'#9370DB',sat:1.5,sharp:1.4,warm:4,matrix:[1.1,0,0,0,0,1.05,0,0,0,0,1.0,0,0.04,0.03,0.02,1]},
            {name:'Royal',color:'#4B0082',sat:1.6,sharp:1.5,warm:2,matrix:[1.15,0,0,0,0,1.08,0,0,0,0,1.05,0,0.05,0.04,0.03,1]},
            {name:'Emerald',color:'#50C878',sat:1.7,sharp:1.5,warm:1,matrix:[1.1,0,0,0,0,1.2,0,0,0,0,1.05,0,0.03,0.04,0.01,1]},
            {name:'Ruby',color:'#E0115F',sat:1.8,sharp:1.6,warm:3,matrix:[1.25,0,0,0,0,1.05,0,0,0,0,0.95,0,0.05,0.03,0.02,1]},
            {name:'Sapphire',color:'#0F52BA',sat:1.6,sharp:1.5,warm:-4,matrix:[1.0,0,0,0,0,1.08,0,0,0,0,1.25,0,0.01,0.02,0.05,1]},
            {name:'Amber',color:'#FFBF00',sat:1.7,sharp:1.4,warm:6,matrix:[1.22,0,0,0,0,1.1,0,0,0,0,0.88,0,0.08,0.06,0.03,1]},
            {name:'Coral',color:'#FF7F50',sat:1.6,sharp:1.4,warm:5,matrix:[1.18,0,0,0,0,1.08,0,0,0,0,0.95,0,0.06,0.05,0.03,1]},
            {name:'Lavender',color:'#E6E6FA',sat:1.2,sharp:1.1,warm:3,matrix:[1.05,0,0,0,0,1.08,0,0,0,0,1.1,0,0.03,0.03,0.02,1]},
            {name:'Mint',color:'#98FF98',sat:1.4,sharp:1.3,warm:-2,matrix:[1.05,0,0,0,0,1.15,0,0,0,0,1.05,0,0.02,0.03,0.01,1]},
            {name:'Peach',color:'#FFDAB9',sat:1.3,sharp:1.2,warm:6,matrix:[1.12,0,0,0,0,1.05,0,0,0,0,0.95,0,0.05,0.04,0.02,1]},
            {name:'Plum',color:'#DDA0DD',sat:1.4,sharp:1.3,warm:4,matrix:[1.1,0,0,0,0,1.05,0,0,0,0,1.0,0,0.04,0.03,0.02,1]},
            {name:'Teal',color:'#008080',sat:1.5,sharp:1.4,warm:-3,matrix:[1.0,0,0,0,0,1.12,0,0,0,0,1.1,0,0.02,0.03,0.02,1]},
            {name:'Crimson',color:'#DC143C',sat:1.7,sharp:1.5,warm:3,matrix:[1.22,0,0,0,0,1.05,0,0,0,0,0.95,0,0.05,0.03,0.02,1]},
            {name:'Indigo',color:'#4B0082',sat:1.5,sharp:1.4,warm:2,matrix:[1.12,0,0,0,0,1.05,0,0,0,0,1.08,0,0.04,0.03,0.03,1]},
            {name:'Bronze',color:'#CD7F32',sat:1.4,sharp:1.3,warm:7,matrix:[1.15,0,0,0,0,1.05,0,0,0,0,0.88,0,0.07,0.05,0.03,1]},
            {name:'Silver',color:'#C0C0C0',sat:1.1,sharp:1.2,warm:0,matrix:[1.05,0,0,0,0,1.05,0,0,0,0,1.05,0,0.02,0.02,0.02,1]},
            {name:'Gold',color:'#FFD700',sat:1.6,sharp:1.4,warm:6,matrix:[1.2,0,0,0,0,1.12,0,0,0,0,0.9,0,0.08,0.06,0.03,1]},
            {name:'Platinum',color:'#E5E4E2',sat:1.0,sharp:1.1,warm:0,matrix:[1.02,0,0,0,0,1.02,0,0,0,0,1.02,0,0.01,0.01,0.01,1]},
            {name:'Copper',color:'#B87333',sat:1.5,sharp:1.3,warm:7,matrix:[1.18,0,0,0,0,1.08,0,0,0,0,0.9,0,0.07,0.05,0.03,1]},
            {name:'Rose Gold',color:'#B76E79',sat:1.3,sharp:1.2,warm:5,matrix:[1.1,0,0,0,0,1.05,0,0,0,0,0.98,0,0.04,0.03,0.02,1]}
        ];
        
        ALL_PRESETS.forEach(p=>{
            const btn = document.createElement('button');
            btn.innerHTML = `<div style="font-size:10px;font-weight:600;">${p.name}</div><div style="font-size:8px;opacity:0.7;">S:${p.sat} T:${p.warm}${p.matrix?' ':''}</div>`;
            btn.style.cssText = `padding:10px 6px;background:${p.color}20;border:1px solid ${p.color};color:${p.color};border-radius:8px;font-size:10px;cursor:pointer;transition:all 0.2s;text-align:center;`;
            btn.onmouseenter = ()=>{btn.style.background=p.color;btn.style.color='#fff';btn.style.transform='scale(1.03)';};
            btn.onmouseleave = ()=>{btn.style.background=`${p.color}20`;btn.style.color=p.color;btn.style.transform='scale(1)';};
            btn.onclick = ()=>{
                currentColor=p.color; currentSaturation=p.sat; currentSharpness=p.sharp; currentWarmth=p.warm; currentMatrix=p.matrix?[...p.matrix]:null;
                syncAllUI(); debouncedApply(50);
                if (window.showStatus) window.showStatus(`✅ Preset: ${p.name}`, p.color);
            };
            presetGrid.appendChild(btn);
        });
        presetsDiv.appendChild(presetGrid);
        
        //  Custom Presets Section
        const customLabel = document.createElement('div');
        customLabel.style.cssText = 'color:#00D4FF;font-size:11px;margin-bottom:6px;font-weight:600;';
        customLabel.textContent = '⭐ My Custom Presets:';
        presetsDiv.appendChild(customLabel);
        
        const customContainer = document.createElement('div');
        customContainer.id = 'custom-presets-container';
        customContainer.style.cssText = 'min-height:40px;';
        presetsDiv.appendChild(customContainer);
        
        return presetsDiv;
    }

    // 🔷 Modified Matrix Section (Manual controls only)
    function createMatrixSection() {
        const section = document.createElement('div');
        section.id = 'matrix-section-container';
        section.style.cssText = 'margin-bottom:12px;padding:14px;background:rgba(0,212,255,0.06);border-radius:14px;border:1px solid rgba(0,212,255,0.2);';
        const header = document.createElement('div');
        header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;';
        header.innerHTML = `<span style="color:#00D4FF;font-size:13px;font-weight:600;">🔷 Color Matrix (SF 1015)</span>
                            <button id="matrix-reset-btn" style="padding:4px 10px;font-size:10px;background:rgba(255,255,255,0.1);color:#fff;border:1px solid rgba(255,255,255,0.3);border-radius:6px;cursor:pointer;">Reset</button>`;
        section.appendChild(header);
        const statusDiv = document.createElement('div'); statusDiv.id='matrix-status'; statusDiv.style.cssText='font-size:11px;color:#8b92b4;margin-bottom:10px;padding:6px 8px;background:rgba(0,0,0,0.3);border-radius:6px;';
        section.appendChild(statusDiv);

        // RGB Gain Sliders
        const rgbSection = document.createElement('div'); rgbSection.style.cssText='margin-bottom:8px;padding-bottom:8px;border-bottom:1px solid rgba(255,255,255,0.1);';
        rgbSection.innerHTML = '<div style="color:#8b92b4;font-size:11px;margin-bottom:6px;">🎨 RGB Gain (Diagonal)</div>';
        [{label:'Red Gain (m00)',idx:0,color:'#FF5555',sid:'gain-slider-0',vid:'gain-val-0'},{label:'Green Gain (m11)',idx:5,color:'#55FF55',sid:'gain-slider-5',vid:'gain-val-5'},{label:'Blue Gain (m22)',idx:10,color:'#5555FF',sid:'gain-slider-10',vid:'gain-val-10'}].forEach(g=>{
            const row=document.createElement('div'); row.style.cssText='margin-bottom:4px;';
            const hr=document.createElement('div'); hr.style.cssText='display:flex;justify-content:space-between;margin-bottom:2px;';
            const iv=(currentMatrix&&currentMatrix[g.idx]!==undefined)?currentMatrix[g.idx]:1.0;
            hr.innerHTML=`<span style="color:#8b92b4;font-size:10px;">${g.label}</span><span id="${g.vid}" style="color:${g.color};font-size:10px;font-weight:600;">${iv.toFixed(2)}</span>`;
            row.appendChild(hr);
            const sl=document.createElement('input'); sl.type='range';sl.min=0.5;sl.max=2.0;sl.step=0.05;sl.id=g.sid;sl.value=iv;
            sl.style.cssText='width:100%;height:4px;background:rgba(255,255,255,0.2);border-radius:3px;outline:none;-webkit-appearance:none;';
            sl.oninput=(e)=>{if(!currentMatrix||!Array.isArray(currentMatrix))currentMatrix=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];currentMatrix[g.idx]=parseFloat(e.target.value);document.getElementById(g.vid).textContent=currentMatrix[g.idx].toFixed(2);updateMatrixStatus();debouncedApply(120);};
            row.appendChild(sl); rgbSection.appendChild(row);
        }); section.appendChild(rgbSection);

        // Alpha Offset Sliders
        const alphaSection = document.createElement('div'); alphaSection.style.cssText='margin-bottom:8px;';
        alphaSection.innerHTML = '<div style="color:#8b92b4;font-size:11px;margin-bottom:6px;">➕ Alpha Offset (Last Row)</div>';
        [{label:'Red Offset (m30)',idx:12,color:'#FF8888',sid:'offset-slider-12',vid:'offset-val-12'},{label:'Green Offset (m31)',idx:13,color:'#88FF88',sid:'offset-slider-13',vid:'offset-val-13'},{label:'Blue Offset (m32)',idx:14,color:'#8888FF',sid:'offset-slider-14',vid:'offset-val-14'}].forEach(g=>{
            const row=document.createElement('div'); row.style.cssText='margin-bottom:4px;';
            const hr=document.createElement('div'); hr.style.cssText='display:flex;justify-content:space-between;margin-bottom:2px;';
            const iv=(currentMatrix&&currentMatrix[g.idx]!==undefined)?currentMatrix[g.idx]:0.0;
            hr.innerHTML=`<span style="color:#8b92b4;font-size:10px;">${g.label}</span><span id="${g.vid}" style="color:${g.color};font-size:10px;font-weight:600;">${iv.toFixed(2)}</span>`;
            row.appendChild(hr);
            const sl=document.createElement('input'); sl.type='range';sl.min=-0.5;sl.max=0.5;sl.step=0.02;sl.id=g.sid;sl.value=iv;
            sl.style.cssText='width:100%;height:4px;background:rgba(255,255,255,0.2);border-radius:3px;outline:none;-webkit-appearance:none;';
            sl.oninput=(e)=>{if(!currentMatrix||!Array.isArray(currentMatrix))currentMatrix=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];currentMatrix[g.idx]=parseFloat(e.target.value);document.getElementById(g.vid).textContent=currentMatrix[g.idx].toFixed(2);updateMatrixStatus();debouncedApply(120);};
            row.appendChild(sl); alphaSection.appendChild(row);
        }); section.appendChild(alphaSection);

        header.querySelector('#matrix-reset-btn').onclick=()=>{currentMatrix=null;refreshMatrixUI();if(window.showStatus)window.showStatus('Matrix reset to default','#8b92b4');debouncedApply(50);};
        setTimeout(()=>refreshMatrixUI(),0); return section;    }

    // ⚙️ Config & Init
    async function init() { 
        await loadSavedConfig(); 
        await loadCustomPresets(); // 💾 Load custom presets
        bindClickHandler(); 
    }
    
    async function loadSavedConfig() {
        try {
            await detectSystemColorProps(true);
            const cfg = await execFn(`cat ${CONFIG_FILE} 2>/dev/null`);
            if (cfg.trim()) {
                cfg.trim().split('\n').forEach(line=>{const[k,v]=line.split('=');if(k==='color'&&v)currentColor=v;else if(k==='saturation'&&v)currentSaturation=parseFloat(v);else if(k==='sharpness'&&v)currentSharpness=parseFloat(v);else if(k==='warmth'&&v)currentWarmth=parseInt(v);else if(k==='matrix'&&v&&v!=='default'){const n=v.split(/[\s,;]+/).filter(x=>x.trim()!=='').map(x=>parseFloat(x)).filter(x=>!isNaN(x));if(n.length>=16)currentMatrix=n.slice(0,20);}});
            } else if (detectedPropsCache.detected && Object.keys(detectedPropsCache.detected).length>0) {
                const d=detectedPropsCache.detected;if(d.color)currentColor=d.color;if(d.saturation)currentSaturation=d.saturation;if(d.sharpness)currentSharpness=d.sharpness;if(d.warmth!==undefined)currentWarmth=d.warmth;if(d.colorMatrix)currentMatrix=d.colorMatrix;
            }
        } catch(e){console.warn('Failed to load boost config:',e);} updateDisplay();
    }
    
    async function saveConfig() {
        try { let ms=''; if(currentMatrix&&Array.isArray(currentMatrix)&&currentMatrix.length)ms=`\nmatrix=${currentMatrix.join(' ')}`;
            const cfg=`color=${currentColor}\nsaturation=${currentSaturation}\nsharpness=${currentSharpness}\nwarmth=${currentWarmth}${ms}`;
            await execFn(`mkdir -p /sdcard/MTK_AI_Engine && echo '${cfg}' > ${CONFIG_FILE}`);
        } catch(e){console.error('Failed to save config:',e);}
    }
    
    function updateDisplay() {
        const el = document.querySelector('#boost-color-item .setting-value');
        if (el) { const mb=(currentMatrix&&Array.isArray(currentMatrix))?` <span style="font-size:9px;background:#00D4FF;color:#000;padding:2px 4px;border-radius:4px;margin-left:5px;">MATRIX</span>`:'';
            el.innerHTML=`${currentColor}${mb} <i class="fas fa-chevron-right"></i>`; el.style.color=currentColor; }
    }
    
    function bindClickHandler() { const it=document.getElementById('boost-color-item'); if(!it)return; it.style.cursor='pointer'; it.addEventListener('click',()=>showBoostModal()); }

    //  Modal Builder
    function showBoostModal() {
        const ex = document.getElementById('boost-modal'); if(ex)ex.remove();
        const modal = document.createElement('div'); modal.id='boost-modal';
        modal.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:10000;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(5px);';
        const box = document.createElement('div');
        box.style.cssText=`background:linear-gradient(135deg,#1a1f3a,#2d3561);border:2px solid ${currentColor};border-radius:20px;padding:20px;width:95%;max-width:480px;box-shadow:0 0 40px ${currentColor}40;max-height:95vh;overflow-y:auto;`;
        
        const hdr = document.createElement('div'); hdr.style.cssText='text-align:center;margin-bottom:12px;';
        hdr.innerHTML=`<h3 style="color:${currentColor};margin:0;font-size:20px;">🎨 Advanced Color Boost</h3><p style="color:#8b92b4;font-size:12px;margin:5px 0 0;">System-wide color enhancement</p>`;
        box.appendChild(hdr); 

        // 1. 🎨 Base Color (TOP)
        const cs = document.createElement('div'); cs.style.cssText='margin-bottom:10px;';        cs.innerHTML=`<div style="color:#fff;font-size:13px;font-weight:600;margin-bottom:6px;">🎨 Base Color</div>`;
        const ci = document.createElement('input'); ci.type='color';ci.value=currentColor;
        ci.style.cssText='width:100%;height:45px;border:none;border-radius:12px;background:transparent;cursor:pointer;';
        ci.oninput=(e)=>{currentColor=e.target.value;syncAllUI();debouncedApply(80);};
        cs.appendChild(ci); box.appendChild(cs);

        // 2. ⚡ ALL Presets + 💾 Custom Presets (TOP)
box.appendChild(createPresetsSection());
// ✅ Render custom presets AFTER element is in DOM
setTimeout(() => renderCustomPresets(), 50);

        // 3. 💧 Saturation
        const ss = document.createElement('div'); ss.style.cssText='margin-bottom:8px;';
        ss.innerHTML=`<div style="color:#fff;font-size:13px;font-weight:600;margin-bottom:4px;">💧 Saturation Boost <span id="sat-val" style="color:#8b92b4;font-weight:400;">${currentSaturation.toFixed(1)}x</span></div>`;
        const sls = document.createElement('input'); sls.id='sat-slider';sls.type='range';sls.min=0.5;sls.max=2.5;sls.step=0.1;sls.value=currentSaturation;
        sls.style.cssText='width:100%;height:6px;background:rgba(255,255,255,0.2);border-radius:3px;outline:none;-webkit-appearance:none;';
        sls.oninput=(e)=>{currentSaturation=parseFloat(e.target.value);document.getElementById('sat-val').textContent=currentSaturation.toFixed(1)+'x';debouncedApply(100);};
        ss.appendChild(sls); box.appendChild(ss);
        
        // 4. 🔍 Sharpness
        const shs = document.createElement('div'); shs.style.cssText='margin-bottom:8px;';
        shs.innerHTML=`<div style="color:#fff;font-size:13px;font-weight:600;margin-bottom:4px;">🔍 Sharpness/Clarity <span id="sharp-val" style="color:#8b92b4;font-weight:400;">${currentSharpness.toFixed(1)}x</span></div>`;
        const slsh = document.createElement('input'); slsh.id='sharp-slider';slsh.type='range';slsh.min=0.5;slsh.max=2.0;slsh.step=0.1;slsh.value=currentSharpness;
        slsh.style.cssText='width:100%;height:6px;background:rgba(255,255,255,0.2);border-radius:3px;outline:none;-webkit-appearance:none;';
        slsh.oninput=(e)=>{currentSharpness=parseFloat(e.target.value);document.getElementById('sharp-val').textContent=currentSharpness.toFixed(1)+'x';debouncedApply(100);};
        shs.appendChild(slsh); box.appendChild(shs);

        // 5. 🌡️ Temperature
        const ws = document.createElement('div'); ws.style.cssText='margin-bottom:10px;';
        const wl = currentWarmth<0?'Cool':currentWarmth>0?'Warm':'Neutral';
        ws.innerHTML=`<div style="color:#fff;font-size:13px;font-weight:600;margin-bottom:4px;">🌡️ Color Temperature <span id="warm-val" style="color:#8b92b4;font-weight:400;">${wl} (${currentWarmth})</span></div>`;
        const slw = document.createElement('input'); slw.id='warm-slider';slw.type='range';slw.min=-10;slw.max=10;slw.step=1;slw.value=currentWarmth;
        slw.style.cssText='width:100%;height:6px;background:rgba(255,255,255,0.2);border-radius:3px;outline:none;-webkit-appearance:none;';
        slw.oninput=(e)=>{currentWarmth=parseInt(e.target.value);const lb=currentWarmth<0?'Cool':currentWarmth>0?'Warm':'Neutral';document.getElementById('warm-val').textContent=`${lb} (${currentWarmth})`;debouncedApply(100);};
        ws.appendChild(slw); box.appendChild(ws);

        // 6. 📱 AMOLED
        const as = document.createElement('div'); as.style.cssText='margin-bottom:12px;';
        as.innerHTML=`<div style="color:#fff;font-size:13px;font-weight:600;margin-bottom:6px;">📱 AMOLED Optimization</div>`;
        const at = document.createElement('label'); at.style.cssText='display:flex;align-items:center;justify-content:space-between;padding:10px;background:rgba(0,0,0,0.3);border-radius:10px;cursor:pointer;';
        at.innerHTML=`<span style="color:#fff;font-size:13px;">Deep Blacks & Vivid Colors</span><input type="checkbox" id="amoled-toggle" style="transform:scale(1.3);">`;
        as.appendChild(at); box.appendChild(as);
        at.querySelector('input[type="checkbox"]').onchange=()=>debouncedApply(50);

        // 7. 🔷 Matrix Section
        box.appendChild(createMatrixSection());

        // 8. 💾 Apply on Boot Button
        const ab = document.createElement('button'); ab.textContent='💾 Apply on Boot (Persistent)';
        ab.style.cssText=`width:100%;padding:14px;margin-top:16px;background:linear-gradient(135deg,${currentColor},${currentColor}aa);color:#fff;border:none;border-radius:12px;font-size:14px;font-weight:700;cursor:pointer;box-shadow:0 4px 15px ${currentColor}60;`;
        ab.onclick=async()=>{
            const success = await createBootScript();            if (success && window.showStatus) window.showStatus('✅ Boot script installed', currentColor);
        };
        box.appendChild(ab);
        
        const cb = document.createElement('button'); cb.textContent='Cancel';
        cb.style.cssText='width:100%;padding:12px;margin-top:8px;background:rgba(255,255,255,0.1);color:#fff;border:none;border-radius:10px;font-size:13px;cursor:pointer;';
        cb.onclick=()=>modal.remove(); box.appendChild(cb);
        
        modal.appendChild(box); document.body.appendChild(modal);
        modal.onclick=e=>{if(e.target===modal)modal.remove();};
        if(detectedPropsCache.detected?.amoled)document.getElementById('amoled-toggle').checked=true;
    }

    // 🚀 Apply Boost
    async function applyBoost() {
        try {
            await execFn(`su -c "service call SurfaceFlinger 1022 f ${currentSaturation}" 2>/dev/null`);
            if(currentWarmth!==0){const tv=6500+(currentWarmth*200);await execFn(`su -c "settings put system screen_color_temperature ${tv}"`);await execFn(`su -c "settings put system screen_color_temperature_native ${tv}"`);}
            if(currentSharpness!==1.0)await execFn(`su -c "setprop sys.display.sharpness ${currentSharpness}"`);
            const ae=document.getElementById('amoled-toggle')?.checked;
            if(ae){await execFn(`su -c "settings put system screen_brightness_mode 0"`);await execFn(`su -c "setprop sys.led.color.matrix 1"`);await execFn(`su -c "setprop persist.sys.led.color.matrix 1"`);}
            else{await execFn(`su -c "setprop sys.led.color.matrix 0"`);await execFn(`su -c "setprop persist.sys.led.color.matrix 0"`);}
            if(currentMatrix&&Array.isArray(currentMatrix)&&currentMatrix.length>=16){const m16=currentMatrix.slice(0,16);let mc='su -c "service call SurfaceFlinger 1015 i32 1';m16.forEach(v=>{mc+=` f ${v}`;});mc+='"';await execFn(mc);}
            const r=parseInt(currentColor.substr(1,2),16)/255,g=parseInt(currentColor.substr(3,2),16)/255,b=parseInt(currentColor.substr(5,2),16)/255;
            await execFn(`su -c "service call SurfaceFlinger 1037 f ${r} f ${g} f ${b} f 1.0" 2>/dev/null`);
            await saveConfig();
            const ms=(currentMatrix&&Array.isArray(currentMatrix))?' | Matrix:SF1015':'';
            if(window.showStatus)window.showStatus(`✅ Color Boost Applied! Sat:${currentSaturation}x Sharp:${currentSharpness}x${ms}`,currentColor);
            updateDisplay();
        } catch(e){console.error('Boost apply failed:',e);if(window.showStatus)window.showStatus('❌ Color Boost Failed','#FF453A');alert('Failed to apply color boost. Ensure root access.');}
    }

    async function debugColorProps(){const r=await execFn(`su -c "getprop | grep -iE 'color|saturation|gamma|vivid|hdr|display|sf|surfaceflinger|mtk|matrix'"`);console.log('[MTK Color Debug]',r);return r;}

    // 🔧 Boot script generator
    async function createBootScript() {
        try {
            const BOOT_SRC = '/sdcard/MTK_AI_Engine/boost_color_apply_tmp.sh';
            const BOOT_DST = '/data/adb/modules/MTK_AI/script_runner/boost_color_apply.sh';
            const FLAG = '/sdcard/MTK_AI_Engine/boost_color_amoled.flag';
            
            const lines = [
                '#!/system/bin/sh',
                'LC_ALL=C',
                'export LC_ALL',
                '',
                'CONFIG_PATHS=("/sdcard/MTK_AI_Engine/boost_color_config.txt" "/storage/emulated/0/MTK_AI_Engine/boost_color_config.txt" "/data/media/0/MTK_AI_Engine/boost_color_config.txt")',
                'FLAG_PATHS=("/sdcard/MTK_AI_Engine/boost_color_amoled.flag" "/storage/emulated/0/MTK_AI_Engine/boost_color_amoled.flag")',
                'LOG="/data/adb/modules/MTK_AI/boost_color.log"',
                '',                'echo "=== $(date) Script Started ===" > "$LOG"',
                '',
                '# 1. Locate Config & Flag',
                'CONFIG=""',
                'for p in "${CONFIG_PATHS[@]}"; do [ -f "$p" ] && { CONFIG="$p"; break; }; done',
                'FLAG=""',
                'for p in "${FLAG_PATHS[@]}"; do [ -f "$p" ] && { FLAG="$p"; break; }; done',
                '',
                'if [ -z "$CONFIG" ]; then echo "❌ Config not found" >> "$LOG"; exit 0; fi',
                'echo "✅ Config: $CONFIG" >> "$LOG"',
                '',
                '# 2. Safe Parser',
                'get_val() {',
                '    grep "^${1}=" "$CONFIG" 2>/dev/null | head -n 1 | cut -d\'=\' -f2- | sed \'s/\\r$//\' | sed \'s/^[[:space:]]*//;s/[[:space:]]*$//\'',
                '}',
                '',
                'COLOR=$(get_val "color")',
                'SAT=$(get_val "saturation")',
                'SHARP=$(get_val "sharpness")',
                'WARM=$(get_val "warmth")',
                'MATRIX=$(get_val "matrix")',
                '',
                'echo "📝 Parsed: COLOR=\'$COLOR\' SAT=\'$SAT\' SHARP=\'$SHARP\' WARM=\'$WARM\'" >> "$LOG"',
                'echo "📝 MATRIX=\'$MATRIX\'" >> "$LOG"',
                '',
                '# 3. Android Version / SDK Transaction Mapping',
                'SDK=$(getprop ro.build.version.sdk 2>/dev/null | grep -oE \'^[0-9]+\')',
                'VER=$(getprop ro.build.version.release 2>/dev/null | grep -oE \'^[0-9]+\')',
                'case "$SDK" in',
                '    36|16) TINT=1038; SATU=1022; MAT=1015 ;;',
                '    35|15) TINT=1038; SATU=1022; MAT=1015 ;;',
                '    33|34) TINT=1037; SATU=1022; MAT=1015 ;;',
                '    31|32) TINT=1035; SATU=1022; MAT=1015 ;;',
                '    *) TINT=1037; SATU=1022; MAT=1015 ;;',
                'esac',
                'echo "📱 SDK $SDK (Android $VER) -> Tint=$TINT Sat=$SATU Matrix=$MAT" >> "$LOG"',
                '',
                '# 4. Validation & Execution Helpers',
                'safe_float() {',
                '    echo "$1" | grep -qE \'^-?[0-9]*\\.?[0-9]+$\' && echo "$1" || echo ""',
                '}',
                'apply_sf() {',
                '    echo "▶ Executing: service call SurfaceFlinger $@" >> "$LOG"',
                '    timeout 3 service call SurfaceFlinger "$@" >> "$LOG" 2>&1 || echo "️ SF call failed/timed out (safe)" >> "$LOG"',
                '}',
                '',
                '# 5. Apply Settings',
                '# Saturation',
                'if [ -n "$SAT" ]; then',
                '    V=$(safe_float "$SAT")',                '    [ -n "$V" ] && apply_sf "$SATU" f "$V"',
                'fi',
                '',
                '# Temperature',
                'if [ -n "$WARM" ] && [ "$WARM" != "0" ]; then',
                '    TV=$((6500 + WARM * 200))',
                '    echo "▶ Temp $TV" >> "$LOG"',
                '    settings put system screen_color_temperature "$TV" 2>/dev/null || settings put secure screen_color_temperature "$TV" 2>/dev/null || echo "⚠️ Settings temp failed" >> "$LOG"',
                'fi',
                '',
                '# Sharpness',
                'if [ -n "$SHARP" ] && [ "$SHARP" != "1.0" ]; then',
                '    V=$(safe_float "$SHARP")',
                '    [ -n "$V" ] && { echo "▶ Sharp $V" >> "$LOG"; setprop sys.display.sharpness "$V" 2>/dev/null || true; }',
                'fi',
                '',
                '# Color Tint',
                'if [ -n "$COLOR" ]; then',
                '    CLEAN="${COLOR#\\#}"',
                '    if [ "${#CLEAN}" -eq 6 ]; then',
                '        R=$(printf "%d" "0x$(echo "$CLEAN" | cut -c1-2)" 2>/dev/null || echo 0)',
                '        G=$(printf "%d" "0x$(echo "$CLEAN" | cut -c3-4)" 2>/dev/null || echo 0)',
                '        B=$(printf "%d" "0x$(echo "$CLEAN" | cut -c5-6)" 2>/dev/null || echo 0)',
                '        RF=$(awk -v r="$R" \'BEGIN{printf "%.2f", r/255}\')',
                '        GF=$(awk -v g="$G" \'BEGIN{printf "%.2f", g/255}\')',
                '        BF=$(awk -v b="$B" \'BEGIN{printf "%.2f", b/255}\')',
                '        echo "▶ Tint: #$CLEAN -> R=$R($RF) G=$G($GF) B=$B($BF)" >> "$LOG"',
                '        apply_sf "$TINT" f "$RF" f "$GF" f "$BF" f 1.0',
                '    else',
                '        echo "❌ Invalid hex length (${#CLEAN})" >> "$LOG"',
                '    fi',
                'fi',
                '',
                '# Matrix',
                'if [ -n "$MATRIX" ] && [ "$MATRIX" != "default" ]; then',
                '    CNT=0; CMD="service call SurfaceFlinger $MAT i32 1"',
                '    for v in $MATRIX; do',
                '        VAL=$(safe_float "$v"); [ -z "$VAL" ] && VAL="0.0"',
                '        CMD="$CMD f $VAL"; CNT=$((CNT + 1))',
                '        [ $CNT -ge 16 ] && break',
                '    done',
                '    echo "▶ Matrix CMD ready ($CNT values)" >> "$LOG"',
                '    eval "$CMD" >> "$LOG" 2>&1 || echo "⚠️ Matrix execution failed" >> "$LOG"',
                'fi',
                '',
                '# AMOLED',
                'if [ -n "$FLAG" ] && [ -f "$FLAG" ]; then',
                '    settings put system screen_brightness_mode 0 2>/dev/null || true',
                '    setprop sys.led.color.matrix 1 2>/dev/null || true',
                '    setprop persist.sys.led.color.matrix 1 2>/dev/null || true',                'else',
                '    setprop sys.led.color.matrix 0 2>/dev/null || true',
                '    setprop persist.sys.led.color.matrix 0 2>/dev/null || true',
                'fi',
                '',
                'echo "=== ✅ Script Finished ===" >> "$LOG"',
                'exit 0'
            ];
            
            await execFn(`mkdir -p /sdcard/MTK_AI_Engine`);
            for (const line of lines) {
                const safe = line.replace(/'/g, "'\\''");
                await execFn(`echo '${safe}' >> ${BOOT_SRC}`);
            }
            
            await execFn(`su -c "cp '${BOOT_SRC}' '${BOOT_DST}' && chmod 755 '${BOOT_DST}' && rm -f '${BOOT_SRC}'"`);
            
            const ae = document.getElementById('amoled-toggle')?.checked || false;
            if (ae) { await execFn(`su -c "echo 1 > '${FLAG}'"`); }
            else { await execFn(`su -c "rm -f '${FLAG}'"`); }
            
            await saveConfig();
            return true;
        } catch(e) {
            console.error('Boot script failed:', e);
            return false;
        }
    }

    if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',init);}else{init();}
    window.applyBoostColor=applyBoost;window.debugColorProps=debugColorProps;window.detectSystemColorProps=()=>detectSystemColorProps(true);
})();