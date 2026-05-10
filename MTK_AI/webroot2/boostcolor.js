// boostcolor.js - Advanced Color Boost Manager with SurfaceFlinger Matrix (Transaction 1015)
// ✅ Unified sliders + auto-apply + ALL presets (Color+Sat+Sharp+Temp+Matrix) + working UI pattern
(function() {
    'use strict';

    const CONFIG_FILE = '/sdcard/MTK_AI_Engine/boost_color_config.txt';
    let currentColor = '#FF9F0A';
    let currentSaturation = 1.0;
    let currentSharpness = 1.0;
    let currentWarmth = 0;
    let currentMatrix = null;
    let detectedPropsCache = {};
    let applyTimeout = null;

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

    // 🔁 Debounced auto-apply
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
                            if (!isNaN(num)) { detected.sharpness = Math.max(0.5, Math.min(2.0, num)); propList[propList.length-1].matched = true; propList[propList.length-1].mapsTo = 'sharpness'; }
                        } else if (lowerKey.includes('temperature') || lowerKey.includes('warmth') || lowerKey.includes('kelvin')) {
                            const num = parseInt(value);                            if (!isNaN(num)) { detected.warmth = Math.max(-10, Math.min(10, Math.round((num-6500)/200))); propList[propList.length-1].matched = true; propList[propList.length-1].mapsTo = 'warmth'; propList[propList.length-1].kelvin = num; }                        } else if (lowerKey.includes('color') && (lowerKey.includes('filter') || lowerKey.includes('tint'))) {                            const cm = value.match(/#?([A-Fa-f0-9]{6})/);
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

    // 🎨 Build Detected Props Panel
    function buildDetectedPropsPanel() {
        const panel = document.createElement('div');
        panel.style.cssText = 'margin:16px 0;padding:12px;background:rgba(0,0,0,0.25);border-radius:12px;border:1px solid rgba(255,255,255,0.1);';
        const header = document.createElement('div');
        header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;';
        header.innerHTML = `<span style="color:#8b92b4;font-size:12px;font-weight:600;">🔍 Detected System Props</span>
                            <button id="refresh-props-btn" style="padding:4px 10px;font-size:10px;background:rgba(255,255,255,0.15);color:#8b92b4;border:1px solid #8b92b4;border-radius:6px;cursor:pointer;">⟳ Refresh</button>`;
        panel.appendChild(header);
        const list = document.createElement('div'); list.id = 'detected-props-list'; list.style.cssText = 'max-height:180px;overflow-y:auto;';
        function renderProps() {
            list.innerHTML = '';
            if (!detectedPropsCache.propList?.length) { list.innerHTML = '<div style="color:#666;font-size:11px;padding:8px;">No color-related props detected</div>'; return; }
            detectedPropsCache.propList.forEach(prop => {
                const item = document.createElement('div');
                item.style.cssText = `display:flex;justify-content:space-between;align-items:center;padding:6px 8px;margin:4px 0;background:${prop.matched?'rgba(0,212,255,0.1)':'rgba(255,255,255,0.05)'};border-radius:6px;font-size:11px;border-left:2px solid ${prop.matched?'#00D4FF':'transparent'};`;
                const left = document.createElement('div'); left.style.cssText = 'flex:1;min-width:0;';
                let valDisplay = prop.value; if (prop.mapsTo==='matrix') valDisplay = `${prop.matrixSize}-float Matrix`;
                left.innerHTML = `<div style="color:${prop.matched?currentColor:'#aaa'};font-weight:${prop.matched?600:400};">${prop.key.split('.').pop()}</div><div style="color:#666;font-size:10px;word-break:break-all;">${valDisplay}</div>`;
                const right = document.createElement('div');                if (prop.matched) { const btn = document.createElement('button'); btn.textContent='Apply'; btn.style.cssText=`padding:3px 8px;font-size:9px;background:${currentColor};color:#000;border:none;border-radius:4px;font-weight:600;cursor:pointer;`; btn.onclick=()=>applyDetectedProp(prop); right.appendChild(btn); }
                else { right.innerHTML = '<span style="color:#555;font-size:10px;">info</span>'; }                item.appendChild(left); item.appendChild(right); list.appendChild(item);
            });        }
        renderProps(); panel.appendChild(list);
        header.querySelector('#refresh-props-btn').onclick = async () => {
            const btn = header.querySelector('#refresh-props-btn'); btn.textContent='⏳'; btn.disabled=true;
            await detectSystemColorProps(true); renderProps(); btn.textContent='⟳ Refresh'; btn.disabled=false;
            if (window.showStatus) window.showStatus(' Props refreshed', currentColor);
        };
        return panel;
    }

    function applyDetectedProp(prop) {
        if (!prop.mapsTo) return;
        if (prop.mapsTo==='saturation') currentSaturation = Math.max(0.5, Math.min(2.5, parseFloat(prop.value)||1.0));
        else if (prop.mapsTo==='sharpness') currentSharpness = Math.max(0.5, Math.min(2.0, parseFloat(prop.value)||1.0));
        else if (prop.mapsTo==='warmth' && prop.kelvin) currentWarmth = Math.max(-10, Math.min(10, Math.round((prop.kelvin-6500)/200)));
        else if (prop.mapsTo==='color') { const m=prop.value.match(/#?([A-Fa-f0-9]{6})/); if (m) currentColor='#'+m[1].toUpperCase(); }
        else if (prop.mapsTo==='preset:vivid') { currentSaturation=1.8; currentSharpness=1.5; currentWarmth=3; }
        else if (prop.mapsTo==='matrix' && prop.matrixValue) { currentMatrix=[...prop.matrixValue]; if (window.showStatus) window.showStatus(`🟦 ${prop.matrixSize}-float Matrix Loaded`, '#00D4FF'); refreshMatrixUI(); }
        else if (prop.mapsTo==='amoled') document.getElementById('amoled-toggle')?.setAttribute('checked','true');
        if (window.showStatus && prop.mapsTo!=='matrix') window.showStatus(`✅ Applied: ${prop.key.split('.').pop()}`, currentColor);
        syncAllUI(); debouncedApply(50);
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
            const s=modal.querySelector(`#${g.id}`), v=modal.querySelector(`#${g.valId}`);
            if (s&&v) { const val=(currentMatrix&&currentMatrix[g.idx]!==undefined)?currentMatrix[g.idx]:0.0; s.value=val; v.textContent=val.toFixed(2); }
        });
        updateMatrixStatus();
    }
    // 🔄 ROBUST UI SYNC - Direct ID targeting (replaces fragile text-matching)
    function syncAllUI() {
        const modal = document.getElementById('boost-modal'); if (!modal) return;        const cp = modal.querySelector('input[type="color"]'); if (cp) cp.value = currentColor;
        const ss = document.getElementById('sat-slider'), sv = document.getElementById('sat-val');
        if (ss) ss.value = currentSaturation; if (sv) sv.textContent = currentSaturation.toFixed(1)+'x';        const shs = document.getElementById('sharp-slider'), shv = document.getElementById('sharp-val');
        if (shs) shs.value = currentSharpness; if (shv) shv.textContent = currentSharpness.toFixed(1)+'x';
        const ws = document.getElementById('warm-slider'), wv = document.getElementById('warm-val');
        if (ws) ws.value = currentWarmth; if (wv) { const lb = currentWarmth<0?'Cool':currentWarmth>0?'Warm':'Neutral'; wv.textContent=`${lb} (${currentWarmth})`; }
        refreshMatrixUI();
        const box = modal.querySelector('div'); if (box) { box.style.borderColor=currentColor; box.style.boxShadow=`0 0 40px ${currentColor}40`; const h3=modal.querySelector('h3'); if (h3) h3.style.color=currentColor; }
    }

    // 🔷 Unified Matrix Section with ALL Presets + Sliders
    function createMatrixSection() {
        const section = document.createElement('div');
        section.id = 'matrix-section-container';
        section.style.cssText = 'margin-bottom:16px;padding:14px;background:rgba(0,212,255,0.06);border-radius:14px;border:1px solid rgba(0,212,255,0.2);';
        const header = document.createElement('div');
        header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;';
        header.innerHTML = `<span style="color:#00D4FF;font-size:13px;font-weight:600;">🔷 Color Matrix (SF 1015)</span>
                            <button id="matrix-reset-btn" style="padding:4px 10px;font-size:10px;background:rgba(255,255,255,0.1);color:#fff;border:1px solid rgba(255,255,255,0.3);border-radius:6px;cursor:pointer;">Reset</button>`;
        section.appendChild(header);
        const statusDiv = document.createElement('div'); statusDiv.id='matrix-status'; statusDiv.style.cssText='font-size:11px;color:#8b92b4;margin-bottom:12px;padding:6px 8px;background:rgba(0,0,0,0.3);border-radius:6px;';
        section.appendChild(statusDiv);

        // 🎨 ALL-IN-ONE Unified Presets Grid (Color+Sat+Sharp+Temp+Matrix)
        const presetsDiv = document.createElement('div'); presetsDiv.style.cssText='margin-bottom:14px;';
        presetsDiv.innerHTML = '<div style="color:#8b92b4;font-size:11px;margin-bottom:6px;">⚡ ALL Presets (Color+Sat+Sharp+Temp+Matrix):</div>';
        const presetGrid = document.createElement('div'); presetGrid.style.cssText='display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:10px;';
        
        const ALL_PRESETS = [
            // Color-focused presets
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
            {name:'Vibrant Cool',color:'#4ECDC4',sat:1.7,sharp:1.5,warm:-4,matrix:[0.95,0,0,0,0,1.05,0,0,0,0,1.2,0,-0.02,0,0.03,1]},
            {name:'Soft Warm',color:'#FFB347',sat:1.3,sharp:1.1,warm:4,matrix:[1.08,0,0,0,0,1.05,0,0,0,0,0.98,0,0.02,0.01,0,1]},
            {name:'Dark Vibrant',color:'#FF6B6B',sat:1.2,sharp:1.4,warm:-1,matrix:[1.5,0,0,0,0,1.5,0,0,0,0,1.5,0,-0.22,-0.22,-0.22,1]},
            {name:'Red Punch',color:'#FF5555',sat:1.6,sharp:1.3,warm:2,matrix:[1.25,0,0,0,0,0.95,0,0,0,0,0.95,0,0,0,0,1]},
            {name:'Cool Boost',color:'#4ECDC4',sat:1.5,sharp:1.4,warm:-6,matrix:[0.95,0,0,0,0,1.0,0,0,0,0,1.15,0,0,0,0,1]},            {name:'Identity',color:'#FFFFFF',sat:1.0,sharp:1.0,warm:0,matrix:[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]},
            {name:'Reset',color:'#FFFFFF',sat:1.0,sharp:1.0,warm:0,matrix:null}
        ];
                ALL_PRESETS.forEach(p=>{
            const btn = document.createElement('button');
            btn.innerHTML = `<div style="font-size:10px;font-weight:600;">${p.name}</div><div style="font-size:8px;opacity:0.7;">S:${p.sat} T:${p.warm}${p.matrix?' 🔷':''}</div>`;
            btn.style.cssText = `padding:10px 6px;background:${p.color}20;border:1px solid ${p.color};color:${p.color};border-radius:8px;font-size:10px;cursor:pointer;transition:all 0.2s;text-align:center;`;            btn.onmouseenter = ()=>{btn.style.background=p.color;btn.style.color='#fff';btn.style.transform='scale(1.03)';};
            btn.onmouseleave = ()=>{btn.style.background=`${p.color}20`;btn.style.color=p.color;btn.style.transform='scale(1)';};
            btn.onclick = ()=>{
                currentColor=p.color; currentSaturation=p.sat; currentSharpness=p.sharp; currentWarmth=p.warm; currentMatrix=p.matrix?[...p.matrix]:null;
                syncAllUI(); debouncedApply(50);
                if (window.showStatus) window.showStatus(`✅ Preset: ${p.name}`, p.color);
            };
            presetGrid.appendChild(btn);
        });
        presetsDiv.appendChild(presetGrid); section.appendChild(presetsDiv);

        // RGB Gain Sliders
        const rgbSection = document.createElement('div'); rgbSection.style.cssText='margin-bottom:12px;padding-bottom:12px;border-bottom:1px solid rgba(255,255,255,0.1);';
        rgbSection.innerHTML = '<div style="color:#8b92b4;font-size:11px;margin-bottom:8px;">🎨 RGB Gain (Diagonal)</div>';
        [{label:'Red Gain (m00)',idx:0,color:'#FF5555',sid:'gain-slider-0',vid:'gain-val-0'},{label:'Green Gain (m11)',idx:5,color:'#55FF55',sid:'gain-slider-5',vid:'gain-val-5'},{label:'Blue Gain (m22)',idx:10,color:'#5555FF',sid:'gain-slider-10',vid:'gain-val-10'}].forEach(g=>{
            const row=document.createElement('div'); row.style.cssText='margin-bottom:8px;';
            const hr=document.createElement('div'); hr.style.cssText='display:flex;justify-content:space-between;margin-bottom:4px;';
            const iv=(currentMatrix&&currentMatrix[g.idx]!==undefined)?currentMatrix[g.idx]:1.0;
            hr.innerHTML=`<span style="color:#8b92b4;font-size:10px;">${g.label}</span><span id="${g.vid}" style="color:${g.color};font-size:10px;font-weight:600;">${iv.toFixed(2)}</span>`;
            row.appendChild(hr);
            const sl=document.createElement('input'); sl.type='range';sl.min=0.5;sl.max=2.0;sl.step=0.05;sl.id=g.sid;sl.value=iv;
            sl.style.cssText='width:100%;height:4px;background:rgba(255,255,255,0.2);border-radius:3px;outline:none;-webkit-appearance:none;';
            sl.oninput=(e)=>{if(!currentMatrix||!Array.isArray(currentMatrix))currentMatrix=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];currentMatrix[g.idx]=parseFloat(e.target.value);document.getElementById(g.vid).textContent=currentMatrix[g.idx].toFixed(2);updateMatrixStatus();debouncedApply(120);};
            row.appendChild(sl); rgbSection.appendChild(row);
        }); section.appendChild(rgbSection);

        // Alpha Offset Sliders
        const alphaSection = document.createElement('div'); alphaSection.style.cssText='margin-bottom:12px;';
        alphaSection.innerHTML = '<div style="color:#8b92b4;font-size:11px;margin-bottom:8px;">➕ Alpha Offset (Last Row)</div>';
        [{label:'Red Offset (m30)',idx:12,color:'#FF8888',sid:'offset-slider-12',vid:'offset-val-12'},{label:'Green Offset (m31)',idx:13,color:'#88FF88',sid:'offset-slider-13',vid:'offset-val-13'},{label:'Blue Offset (m32)',idx:14,color:'#8888FF',sid:'offset-slider-14',vid:'offset-val-14'}].forEach(g=>{
            const row=document.createElement('div'); row.style.cssText='margin-bottom:8px;';
            const hr=document.createElement('div'); hr.style.cssText='display:flex;justify-content:space-between;margin-bottom:4px;';
            const iv=(currentMatrix&&currentMatrix[g.idx]!==undefined)?currentMatrix[g.idx]:0.0;
            hr.innerHTML=`<span style="color:#8b92b4;font-size:10px;">${g.label}</span><span id="${g.vid}" style="color:${g.color};font-size:10px;font-weight:600;">${iv.toFixed(2)}</span>`;
            row.appendChild(hr);
            const sl=document.createElement('input'); sl.type='range';sl.min=-0.5;sl.max=0.5;sl.step=0.02;sl.id=g.sid;sl.value=iv;
            sl.style.cssText='width:100%;height:4px;background:rgba(255,255,255,0.2);border-radius:3px;outline:none;-webkit-appearance:none;';
            sl.oninput=(e)=>{if(!currentMatrix||!Array.isArray(currentMatrix))currentMatrix=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];currentMatrix[g.idx]=parseFloat(e.target.value);document.getElementById(g.vid).textContent=currentMatrix[g.idx].toFixed(2);updateMatrixStatus();debouncedApply(120);};
            row.appendChild(sl); alphaSection.appendChild(row);
        }); section.appendChild(alphaSection);

        header.querySelector('#matrix-reset-btn').onclick=()=>{currentMatrix=null;refreshMatrixUI();if(window.showStatus)window.showStatus('Matrix reset to default','#8b92b4');debouncedApply(50);};        setTimeout(()=>refreshMatrixUI(),0); return section;
    }

    // ⚙️ Config & Init
    async function init() { await loadSavedConfig(); bindClickHandler(); }    async function loadSavedConfig() {
        try {
            await detectSystemColorProps(true);
            const cfg = await execFn(`cat ${CONFIG_FILE} 2>/dev/null`);
            if (cfg.trim()) {                cfg.trim().split('\n').forEach(line=>{const[k,v]=line.split('=');if(k==='color'&&v)currentColor=v;else if(k==='saturation'&&v)currentSaturation=parseFloat(v);else if(k==='sharpness'&&v)currentSharpness=parseFloat(v);else if(k==='warmth'&&v)currentWarmth=parseInt(v);else if(k==='matrix'&&v&&v!=='default'){const n=v.split(/[\s,;]+/).filter(x=>x.trim()!=='').map(x=>parseFloat(x)).filter(x=>!isNaN(x));if(n.length>=16)currentMatrix=n.slice(0,20);}});
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

    // 🎨 Modal Builder - EXACT original pattern
    function showBoostModal() {
        const ex = document.getElementById('boost-modal'); if(ex)ex.remove();
        const modal = document.createElement('div'); modal.id='boost-modal';
        modal.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:10000;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(5px);';
        const box = document.createElement('div');
        box.style.cssText=`background:linear-gradient(135deg,#1a1f3a,#2d3561);border:2px solid ${currentColor};border-radius:20px;padding:24px;width:95%;max-width:480px;box-shadow:0 0 40px ${currentColor}40;max-height:95vh;overflow-y:auto;`;
        const hdr = document.createElement('div'); hdr.style.cssText='text-align:center;margin-bottom:20px;';
        hdr.innerHTML=`<h3 style="color:${currentColor};margin:0;font-size:20px;">🎨 Advanced Color Boost</h3><p style="color:#8b92b4;font-size:12px;margin:5px 0 0;">System-wide color enhancement</p>`;
        box.appendChild(hdr); box.appendChild(buildDetectedPropsPanel());

        // 🎨 Color Picker
        const cs = document.createElement('div'); cs.style.cssText='margin-bottom:16px;';
        cs.innerHTML=`<div style="color:#fff;font-size:13px;font-weight:600;margin-bottom:8px;">🎨 Base Color</div>`;
        const ci = document.createElement('input'); ci.type='color';ci.value=currentColor;
        ci.style.cssText='width:100%;height:50px;border:none;border-radius:12px;background:transparent;cursor:pointer;';
        ci.oninput=(e)=>{currentColor=e.target.value;syncAllUI();debouncedApply(80);};
        cs.appendChild(ci); box.appendChild(cs);

        // 💧 Saturation (DIRECT handler + ID)
        const ss = document.createElement('div'); ss.style.cssText='margin-bottom:16px;';        ss.innerHTML=`<div style="color:#fff;font-size:13px;font-weight:600;margin-bottom:8px;">💧 Saturation Boost <span id="sat-val" style="color:#8b92b4;font-weight:400;">${currentSaturation.toFixed(1)}x</span></div>`;
        const sls = document.createElement('input'); sls.id='sat-slider';sls.type='range';sls.min=0.5;sls.max=2.5;sls.step=0.1;sls.value=currentSaturation;
        sls.style.cssText='width:100%;height:6px;background:rgba(255,255,255,0.2);border-radius:3px;outline:none;-webkit-appearance:none;';
        sls.oninput=(e)=>{currentSaturation=parseFloat(e.target.value);document.getElementById('sat-val').textContent=currentSaturation.toFixed(1)+'x';debouncedApply(100);};
        ss.appendChild(sls); box.appendChild(ss);
        // 🔍 Sharpness (DIRECT handler + ID)
        const shs = document.createElement('div'); shs.style.cssText='margin-bottom:16px;';
        shs.innerHTML=`<div style="color:#fff;font-size:13px;font-weight:600;margin-bottom:8px;">🔍 Sharpness/Clarity <span id="sharp-val" style="color:#8b92b4;font-weight:400;">${currentSharpness.toFixed(1)}x</span></div>`;
        const slsh = document.createElement('input'); slsh.id='sharp-slider';slsh.type='range';slsh.min=0.5;slsh.max=2.0;slsh.step=0.1;slsh.value=currentSharpness;
        slsh.style.cssText='width:100%;height:6px;background:rgba(255,255,255,0.2);border-radius:3px;outline:none;-webkit-appearance:none;';
        slsh.oninput=(e)=>{currentSharpness=parseFloat(e.target.value);document.getElementById('sharp-val').textContent=currentSharpness.toFixed(1)+'x';debouncedApply(100);};        shs.appendChild(slsh); box.appendChild(shs);

        // 🌡️ Temperature (DIRECT handler + ID)
        const ws = document.createElement('div'); ws.style.cssText='margin-bottom:16px;';
        const wl = currentWarmth<0?'Cool':currentWarmth>0?'Warm':'Neutral';
        ws.innerHTML=`<div style="color:#fff;font-size:13px;font-weight:600;margin-bottom:8px;">🌡️ Color Temperature <span id="warm-val" style="color:#8b92b4;font-weight:400;">${wl} (${currentWarmth})</span></div>`;
        const slw = document.createElement('input'); slw.id='warm-slider';slw.type='range';slw.min=-10;slw.max=10;slw.step=1;slw.value=currentWarmth;
        slw.style.cssText='width:100%;height:6px;background:rgba(255,255,255,0.2);border-radius:3px;outline:none;-webkit-appearance:none;';
        slw.oninput=(e)=>{currentWarmth=parseInt(e.target.value);const lb=currentWarmth<0?'Cool':currentWarmth>0?'Warm':'Neutral';document.getElementById('warm-val').textContent=`${lb} (${currentWarmth})`;debouncedApply(100);};
        ws.appendChild(slw); box.appendChild(ws);

        // 📱 AMOLED
        const as = document.createElement('div'); as.style.cssText='margin-bottom:16px;';
        as.innerHTML=`<div style="color:#fff;font-size:13px;font-weight:600;margin-bottom:8px;">📱 AMOLED Optimization</div>`;
        const at = document.createElement('label'); at.style.cssText='display:flex;align-items:center;justify-content:space-between;padding:12px;background:rgba(0,0,0,0.3);border-radius:10px;cursor:pointer;';
        at.innerHTML=`<span style="color:#fff;font-size:13px;">Deep Blacks & Vivid Colors</span><input type="checkbox" id="amoled-toggle" style="transform:scale(1.3);">`;
        as.appendChild(at); box.appendChild(as);
        at.querySelector('input[type="checkbox"]').onchange=()=>debouncedApply(50);

        // 🔷 Matrix Section
        box.appendChild(createMatrixSection());

        // 💾 Apply on Boot Button (MODIFIED)
        const ab = document.createElement('button'); ab.textContent='💾 Apply on Boot (Persistent)';
        ab.style.cssText=`width:100%;padding:14px;margin-top:20px;background:linear-gradient(135deg,${currentColor},${currentColor}aa);color:#fff;border:none;border-radius:12px;font-size:14px;font-weight:700;cursor:pointer;box-shadow:0 4px 15px ${currentColor}60;`;
        ab.onclick=async()=>{
            const success = await createBootScript();
            if (success && window.showStatus) window.showStatus('✅ Boot script installed', currentColor);
        };
        box.appendChild(ab);
        const cb = document.createElement('button'); cb.textContent='Cancel';
        cb.style.cssText='width:100%;padding:12px;margin-top:10px;background:rgba(255,255,255,0.1);color:#fff;border:none;border-radius:10px;font-size:13px;cursor:pointer;';
        cb.onclick=()=>modal.remove(); box.appendChild(cb);
        modal.appendChild(box); document.body.appendChild(modal);
        modal.onclick=e=>{if(e.target===modal)modal.remove();};
        if(detectedPropsCache.detected?.amoled)document.getElementById('amoled-toggle').checked=true;
    }

    // 🚀 Apply Boost (UNCHANGED)
    async function applyBoost() {
        try {            await execFn(`su -c "service call SurfaceFlinger 1022 f ${currentSaturation}" 2>/dev/null`);
            if(currentWarmth!==0){const tv=6500+(currentWarmth*200);await execFn(`su -c "settings put system screen_color_temperature ${tv}"`);await execFn(`su -c "settings put system screen_color_temperature_native ${tv}"`);}
            if(currentSharpness!==1.0)await execFn(`su -c "setprop sys.display.sharpness ${currentSharpness}"`);            const ae=document.getElementById('amoled-toggle')?.checked;
            if(ae){await execFn(`su -c "settings put system screen_brightness_mode 0"`);await execFn(`su -c "setprop sys.led.color.matrix 1"`);await execFn(`su -c "setprop persist.sys.led.color.matrix 1"`);}
            else{await execFn(`su -c "setprop sys.led.color.matrix 0"`);await execFn(`su -c "setprop persist.sys.led.color.matrix 0"`);}
            if(currentMatrix&&Array.isArray(currentMatrix)&&currentMatrix.length>=16){const m16=currentMatrix.slice(0,16);let mc='su -c "service call SurfaceFlinger 1015 i32 1';m16.forEach(v=>{mc+=` f ${v}`;});mc+='"';await execFn(mc);}
            const r=parseInt(currentColor.substr(1,2),16)/255,g=parseInt(currentColor.substr(3,2),16)/255,b=parseInt(currentColor.substr(5,2),16)/255;
            await execFn(`su -c "service call SurfaceFlinger 1037 f ${r} f ${g} f ${b} f 1.0" 2>/dev/null`);
            await saveConfig();
            const ms=(currentMatrix&&Array.isArray(currentMatrix))?' | Matrix:SF1015':'';            if(window.showStatus)window.showStatus(`✅ Color Boost Applied! Sat:${currentSaturation}x Sharp:${currentSharpness}x${ms}`,currentColor);
            updateDisplay();
        } catch(e){console.error('Boost apply failed:',e);if(window.showStatus)window.showStatus('❌ Color Boost Failed','#FF453A');alert('Failed to apply color boost. Ensure root access.');}
    }

    async function debugColorProps(){const r=await execFn(`su -c "getprop | grep -iE 'color|saturation|gamma|vivid|hdr|display|sf|surfaceflinger|mtk|matrix'"`);console.log('[MTK Color Debug]',r);return r;}

    // 🔧 REPLACED: Clean boot script generator using heredoc (no base64, no backslash hell)
    // 🔧 REPLACED: Two-step boot script generator (100% reliable)
async function createBootScript() {
    try {
        const BOOT_SRC = '/sdcard/MTK_AI_Engine/boost_color_apply_tmp.sh';
        const BOOT_DST = '/data/adb/modules/MTK_AI/script_runner/boost_color_apply.sh';
        const FLAG = '/sdcard/MTK_AI_Engine/boost_color_amoled.flag';
        
        // Step 1: Write script to /sdcard/ first (simple echo, no root escaping hell)
        const lines = [
            '#!/system/bin/sh',
            'LC_ALL=C',
            'export LC_ALL',
            '',
            'CONFIG_PATHS=("/sdcard/MTK_AI_Engine/boost_color_config.txt" "/storage/emulated/0/MTK_AI_Engine/boost_color_config.txt" "/data/media/0/MTK_AI_Engine/boost_color_config.txt")',
            'FLAG_PATHS=("/sdcard/MTK_AI_Engine/boost_color_amoled.flag" "/storage/emulated/0/MTK_AI_Engine/boost_color_amoled.flag")',
            'LOG="/data/adb/service.d/boost_color.log"',
            '',
            'echo "=== $(date) Script Started ===" > "$LOG"',
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
            '    31|32) TINT=1035; SATU=1022; MAT=1015 ;;',            '    *) TINT=1037; SATU=1022; MAT=1015 ;;',
            'esac',
            'echo "📱 SDK $SDK (Android $VER) -> Tint=$TINT Sat=$SATU Matrix=$MAT" >> "$LOG"',
            '',
            '# 4. Validation & Execution Helpers',
            'safe_float() {',
            '    echo "$1" | grep -qE \'^-?[0-9]*\\.?[0-9]+$\' && echo "$1" || echo ""',
            '}',
            'apply_sf() {',
            '    echo "▶ Executing: service call SurfaceFlinger $@" >> "$LOG"',
            '    timeout 3 service call SurfaceFlinger "$@" >> "$LOG" 2>&1 || echo "⚠️ SF call failed/timed out (safe)" >> "$LOG"',
            '}',
            '',
            '# 5. Apply Settings',
            '# Saturation',
            'if [ -n "$SAT" ]; then',
            '    V=$(safe_float "$SAT")',
            '    [ -n "$V" ] && apply_sf "$SATU" f "$V"',
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
            '',            '# Matrix',
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
            '    setprop persist.sys.led.color.matrix 1 2>/dev/null || true',
            'else',
            '    setprop sys.led.color.matrix 0 2>/dev/null || true',
            '    setprop persist.sys.led.color.matrix 0 2>/dev/null || true',
            'fi',
            '',
            'echo "=== ✅ Script Finished ===" >> "$LOG"',
            'exit 0'
        ];
        
        // Write to /sdcard/ first (no root, simple echo)
        await execFn(`mkdir -p /sdcard/MTK_AI_Engine`);
        for (const line of lines) {
            // Escape single quotes for JS → shell safety
            const safe = line.replace(/'/g, "'\\''");
            await execFn(`echo '${safe}' >> ${BOOT_SRC}`);
        }
        
        // Step 2: Root only does simple cp + chmod (no complex parsing)
        await execFn(`su -c "cp '${BOOT_SRC}' '${BOOT_DST}' && chmod 755 '${BOOT_DST}' && rm -f '${BOOT_SRC}'"`);
        
        // Save AMOLED flag
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
    window.refreshDetectedPropsUI=()=>{detectSystemColorProps(true);const m=document.getElementById('boost-modal');if(m){const p=m.querySelector('#detected-props-list')?.parentElement;if(p)p.replaceWith(buildDetectedPropsPanel());}};
})();
