// boostcolor.js - Advanced Color Boost Manager with SurfaceFlinger Matrix (Transaction 1015)
// ✅ Professional UI + Pop-up Preset Selector + Custom Presets & Base Color on TOP + Sliders grouped tightly + ALL presets
// ✅ FIXED: Preset button now shows selected preset name
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
let customPresets = [];
let currentPresetName = null; // ✅ Track selected preset name

// 🎨 ALL PRESETS
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
    {name:'Vibrant Cool',color:'#4ECDC4',sat:1.7,sharp:1.5,warm:-4,matrix:[0.95,0,0,0,0,1.05,0,0,0,0,1.2,0,-0.02,0,0.03,1]},
    {name:'Soft Warm',color:'#FFB347',sat:1.3,sharp:1.1,warm:4,matrix:[1.08,0,0,0,0,1.05,0,0,0,0,0.98,0,0.02,0.01,0,1]},
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
    {name:'Desert',color:'#EDC9AF',sat:1.3,sharp:1.2,warm:8,matrix:[1.12,0,0,0,0,1.05,0,0,0,0,0.9,0,0.06,0.05,0.03,1]},
    {name:'Tropical',color:'#00CED1',sat:1.9,sharp:1.6,warm:3,matrix:[1.2,0,0,0,0,1.25,0,0,0,0,1.1,0,0.04,0.03,0.02,1]},
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

// Debounced auto-apply
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
        const s=modal.querySelector(`#${g.id}`), v=modal.querySelector(`#${g.valId}`);
        if (s&&v) { const val=(currentMatrix&&currentMatrix[g.idx]!==undefined)?currentMatrix[g.idx]:0.0; s.value=val; v.textContent=val.toFixed(2); }
    });
    updateMatrixStatus();
}

// ✅ Update preset button text to show selected preset name
function updatePresetButtonText() {
    const modal = document.getElementById('boost-modal');
    if (!modal) return;
    const presetBtn = modal.querySelector('#preset-select-btn');
    if (presetBtn) {
        const displayName = currentPresetName || 'Select Preset';
        presetBtn.innerHTML = `${displayName} <span style="float:right;opacity:0.5;">›</span>`;
    }
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
    updatePresetButtonText(); // ✅ Update preset button
    
    // Update modal accent colors
    const box = document.getElementById('boost-modal-box');
    if (box) {
        const applyBtn = box.querySelector('button[style*="linear-gradient"]');
        if (applyBtn) {
            applyBtn.style.background = `linear-gradient(135deg,${currentColor},${currentColor}cc)`;
            applyBtn.style.boxShadow = `0 4px 15px ${currentColor}40`;
        }
    }
    updateDisplay();
}

//  Load Custom Presets from JSON file
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

// Save Custom Presets to JSON file
async function saveCustomPresets() {
    try {
        await execFn(`mkdir -p /sdcard/MTK_AI_Engine`);
        const json = JSON.stringify(customPresets, null, 2);
        await execFn(`echo '${json.replace(/'/g, "'\\''")}' > ${CUSTOM_PRESETS_FILE}`);
    } catch(e) {
        console.error('Failed to save custom presets:', e);
    }
}

// 💾 Show Save Preset Dialog
function showSavePresetDialog() {
    const existing = document.getElementById('save-preset-dialog');
    if (existing) existing.remove();
    const overlay = document.createElement('div'); overlay.id = 'save-preset-dialog';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:10001;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(5px);';
    const dialog = document.createElement('div');
    dialog.style.cssText = 'background:linear-gradient(160deg,#12141d,#1a1d2e);border:1px solid rgba(255,255,255,0.1);border-radius:20px;padding:24px;width:90%;max-width:360px;box-shadow:0 20px 60px rgba(0,0,0,0.5);';
    dialog.innerHTML = `
        <div style="text-align:center;margin-bottom:20px;">
            <h4 style="color:#fff;margin:0;font-size:18px;font-weight:600;">💾 Save Preset</h4>
            <p style="color:#8b92b4;font-size:12px;margin:6px 0 0;">Save your current color settings</p>
        </div>
        <div style="margin-bottom:20px;">
            <label style="color:#e0e0e0;font-size:13px;display:block;margin-bottom:8px;font-weight:500;">Preset Name:</label>
            <input type="text" id="preset-name-input" placeholder="My Custom Preset" maxlength="20"
                style="width:100%;padding:12px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:10px;color:#fff;font-size:14px;outline:none;box-sizing:border-box;transition:border 0.2s;">
        </div>
        <div style="display:flex;gap:12px;">
            <button id="cancel-save-btn" style="flex:1;padding:12px;background:rgba(255,255,255,0.05);color:#fff;border:1px solid rgba(255,255,255,0.1);border-radius:10px;font-size:14px;font-weight:500;cursor:pointer;transition:all 0.2s;">Cancel</button>
            <button id="confirm-save-btn" style="flex:1;padding:12px;background:linear-gradient(135deg,#00D4FF,#00D4FFaa);color:#000;border:none;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer;transition:all 0.2s;box-shadow:0 4px 15px rgba(0,212,255,0.3);">Save</button>
        </div>
    `;
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
    overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };
    const input = dialog.querySelector('#preset-name-input');
    input.focus();
    input.onfocus = () => input.style.borderColor = '#00D4FF';
    input.onblur = () => input.style.borderColor = 'rgba(255,255,255,0.1)';
    
    dialog.querySelector('#cancel-save-btn').onclick = () => overlay.remove();
    dialog.querySelector('#confirm-save-btn').onclick = () => {
        const name = input.value.trim();
        if (!name) { input.style.borderColor = '#FF453A'; input.placeholder = 'Name required!'; return; }
        const exists = customPresets.findIndex(p => p.name.toLowerCase() === name.toLowerCase());
        if (exists !== -1) {
            if (!confirm(`"${name}" already exists. Overwrite?`)) return;
            customPresets[exists] = { name, color: currentColor, sat: currentSaturation, sharp: currentSharpness, warm: currentWarmth, matrix: currentMatrix ? [...currentMatrix] : null };
        } else {
            customPresets.push({ name, color: currentColor, sat: currentSaturation, sharp: currentSharpness, warm: currentWarmth, matrix: currentMatrix ? [...currentMatrix] : null });
        }            
        saveCustomPresets();
        overlay.remove();
        renderCustomPresetsPopup();
        if (window.showStatus) window.showStatus(`✅ Preset "${name}" saved!`, currentColor);
    };
    input.onkeydown = e => { if (e.key === 'Enter') dialog.querySelector('#confirm-save-btn').click(); };
}

// Render Custom Presets Grid (Inside Popup)
function renderCustomPresetsPopup() {
    const container = document.getElementById('custom-presets-container-popup');
    if (!container) return;
    container.innerHTML = '';
    if (customPresets.length === 0) {
        container.innerHTML = '<div style="color:#666;font-size:12px;padding:12px;text-align:center;background:rgba(255,255,255,0.02);border-radius:10px;">No custom presets yet. Tap "Save Current" to create one.</div>';
        return;
    }
    const grid = document.createElement('div');
    grid.style.cssText = 'display:grid;grid-template-columns:repeat(3,1fr);gap:10px;';
    customPresets.forEach((p, idx) => {
        const btn = document.createElement('div');
        btn.style.cssText = `position:relative;padding:12px 8px;background:${p.color}15;border:1px solid ${p.color}40;color:${p.color};border-radius:10px;font-size:11px;cursor:pointer;transition:all 0.2s;text-align:center;`;
        btn.innerHTML = `
            <div style="font-size:11px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${p.name}</div>
            <div style="font-size:9px;opacity:0.7;margin-top:2px;">S:${p.sat} T:${p.warm}${p.matrix?' 🔷':''}</div>
            <button class="delete-preset-btn" data-idx="${idx}" style="position:absolute;top:4px;right:4px;background:rgba(255,69,58,0.8);color:#fff;border:none;border-radius:50%;width:18px;height:18px;font-size:12px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;opacity:0.8;transition:all 0.2s;">×</button>
        `;
        btn.onmouseenter = () => { btn.style.background = p.color; btn.style.color = '#fff'; btn.style.transform = 'scale(1.03)'; btn.style.boxShadow=`0 4px 12px ${p.color}40`; };
        btn.onmouseleave = () => { btn.style.background = `${p.color}15`; btn.style.color = p.color; btn.style.transform = 'scale(1)'; btn.style.boxShadow='none'; };
        btn.onclick = (e) => {
            if (e.target.classList.contains('delete-preset-btn')) return;
            currentColor = p.color; currentSaturation = p.sat; currentSharpness = p.sharp;
            currentWarmth = p.warm; currentMatrix = p.matrix ? [...p.matrix] : null;
            currentPresetName = p.name; // ✅ Track custom preset name
            syncAllUI(); debouncedApply(50);
            if (window.showStatus) window.showStatus(`✅ Custom: ${p.name}`, p.color);
            document.getElementById('preset-popup')?.remove();
        };
        grid.appendChild(btn);
    });
    container.appendChild(grid);
    
    container.querySelectorAll('.delete-preset-btn').forEach(btn => {
        btn.onmouseenter = () => btn.style.opacity = '1';
        btn.onmouseleave = () => btn.style.opacity = '0.8';
        btn.onclick = (e) => {
            e.stopPropagation();
            const idx = parseInt(btn.dataset.idx);
            const name = customPresets[idx].name;
            if (confirm(`Delete preset "${name}"?`)) {
                customPresets.splice(idx, 1);
                saveCustomPresets();
                renderCustomPresetsPopup();
                if (window.showStatus) window.showStatus(`️ Deleted "${name}"`, '#FF453A');
            }
        };
    });
}

// 🎨 Preset Pop-up Selector
function showPresetPopup() {
    const existing = document.getElementById('preset-popup');
    if (existing) existing.remove();
    
    const overlay = document.createElement('div');
    overlay.id = 'preset-popup';
    overlay.style.cssText = 'position:absolute;inset:0;background:rgba(18,20,29,0.98);z-index:20;display:flex;flex-direction:column;border-radius:24px;overflow:hidden;backdrop-filter:blur(10px);animation:slideIn 0.3s ease-out;';
    
    if (!document.getElementById('preset-popup-style')) {
        const style = document.createElement('style');
        style.id = 'preset-popup-style';
        style.textContent = `
            @keyframes slideIn {
                from { transform: translateY(20px); opacity: 0; }
                to { transform: translateY(0); opacity: 1; }
            }
        `;
        document.head.appendChild(style);
    }
    
    const header = document.createElement('div');
    header.style.cssText = 'padding:16px 20px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid rgba(255,255,255,0.08);';
    header.innerHTML = `
        <h3 style="color:#fff;margin:0;font-size:18px;font-weight:600;">Color Presets</h3>
        <button id="close-preset-popup" style="background:rgba(255,255,255,0.1);border:none;color:#fff;width:32px;height:32px;border-radius:50%;font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background 0.2s;">✕</button>
    `;
    overlay.appendChild(header);
    
    const content = document.createElement('div');
    content.style.cssText = 'flex:1;overflow-y:auto;padding:20px;';
    
    const saveBtn = document.createElement('button');
    saveBtn.textContent = ' Save Current Settings as Preset';
    saveBtn.style.cssText = 'width:100%;padding:14px;background:linear-gradient(135deg,#00D4FF,#00D4FFaa);color:#000;border:none;border-radius:12px;font-size:14px;font-weight:700;cursor:pointer;margin-bottom:20px;transition:all 0.2s;box-shadow:0 4px 15px rgba(0,212,255,0.3);';
    saveBtn.onmouseenter = () => saveBtn.style.transform = 'translateY(-2px)';
    saveBtn.onmouseleave = () => saveBtn.style.transform = 'translateY(0)';
    saveBtn.onclick = showSavePresetDialog;
    content.appendChild(saveBtn);
    
    const builtinLabel = document.createElement('div');
    builtinLabel.style.cssText = 'color:#8b92b4;font-size:12px;margin-bottom:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;';
    builtinLabel.textContent = 'Built-in Presets';
    content.appendChild(builtinLabel);
    
    const presetGrid = document.createElement('div');
    presetGrid.style.cssText = 'display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:24px;';
    
    ALL_PRESETS.forEach(p=>{
        const btn = document.createElement('button');
        btn.innerHTML = `<div style="font-size:11px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${p.name}</div><div style="font-size:9px;opacity:0.7;margin-top:2px;">S:${p.sat} T:${p.warm}${p.matrix?' 🔷':''}</div>`;
        btn.style.cssText = `padding:12px 8px;background:${p.color}15;border:1px solid ${p.color}40;color:${p.color};border-radius:10px;font-size:11px;cursor:pointer;transition:all 0.2s;text-align:center;`;
        btn.onmouseenter = ()=>{btn.style.background=p.color;btn.style.color='#fff';btn.style.transform='scale(1.03)';btn.style.boxShadow=`0 4px 12px ${p.color}40`;};
        btn.onmouseleave = ()=>{btn.style.background=`${p.color}15`;btn.style.color=p.color;btn.style.transform='scale(1)';btn.style.boxShadow='none';};
        btn.onclick = ()=>{
            currentColor=p.color; currentSaturation=p.sat; currentSharpness=p.sharp; currentWarmth=p.warm; currentMatrix=p.matrix?[...p.matrix]:null;
            currentPresetName = p.name; // ✅ Track selected preset name
            syncAllUI(); debouncedApply(50);
            if (window.showStatus) window.showStatus(`✅ Preset: ${p.name}`, p.color);
            overlay.remove();
        };
        presetGrid.appendChild(btn);
    });
    content.appendChild(presetGrid);
    
    const customLabel = document.createElement('div');
    customLabel.style.cssText = 'color:#00D4FF;font-size:12px;margin-bottom:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;';
    customLabel.textContent = 'My Custom Presets';
    content.appendChild(customLabel);
    
    const customContainer = document.createElement('div');
    customContainer.id = 'custom-presets-container-popup';
    customContainer.style.cssText = 'min-height:40px;';
    content.appendChild(customContainer);
    
    overlay.appendChild(content);
    
    const box = document.getElementById('boost-modal-box');
    box.appendChild(overlay);
    
    const closeBtn = header.querySelector('#close-preset-popup');
    closeBtn.onclick = () => overlay.remove();
    closeBtn.onmouseenter = () => closeBtn.style.background = 'rgba(255,255,255,0.2)';
    closeBtn.onmouseleave = () => closeBtn.style.background = 'rgba(255,255,255,0.1)';
    
    setTimeout(() => renderCustomPresetsPopup(), 50);
}

// 🎨 Professional UI Helpers
function createSectionCard(title) {
    const el = document.createElement('div');
    el.style.cssText = 'margin-bottom:16px;';
    const header = document.createElement('div');
    header.style.cssText = 'color:#fff;font-size:14px;font-weight:600;margin-bottom:10px;display:flex;align-items:center;gap:8px;';
    header.textContent = title;
    el.appendChild(header);
    
    const content = document.createElement('div');
    content.style.cssText = 'background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.06);border-radius:16px;padding:16px;';
    el.appendChild(content);
    
    return { el, content };
}

function createSliderRow(label, sliderId, valId, initialVal, min, max, step, onChange) {
    const row = document.createElement('div');
    row.style.cssText = 'margin-bottom:16px;';
    if (label.includes('Temperature')) row.style.marginBottom = '0';
    
    const header = document.createElement('div');
    header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;';
    header.innerHTML = `<span style="color:#e0e0e0;font-size:13px;font-weight:500;">${label}</span><span id="${valId}" style="color:#8b92b4;font-size:12px;font-weight:500;background:rgba(255,255,255,0.05);padding:2px 8px;border-radius:6px;">${onChange(initialVal)}</span>`;
    row.appendChild(header);
    
    const slider = document.createElement('input');
    slider.id = sliderId;
    slider.className = 'boost-slider';
    slider.type = 'range';
    slider.min = min;
    slider.max = max;
    slider.step = step;
    slider.value = initialVal;
    slider.style.cssText = 'width:100%;height:6px;background:rgba(255,255,255,0.1);border-radius:3px;outline:none;-webkit-appearance:none;appearance:none;cursor:pointer;';
    slider.style.setProperty('--thumb-color', currentColor);
    
    slider.oninput = (e) => {
        const val = parseFloat(e.target.value);
        const text = onChange(val);
        document.getElementById(valId).textContent = text;
        currentPresetName = null; // ✅ Clear preset name when manually adjusting
        updatePresetButtonText();
        debouncedApply(100);
    };
    
    row.appendChild(slider);
    return row;
}

// 🔷 Modified Matrix Section
function createMatrixSection() {
    const section = document.createElement('div');
    section.id = 'matrix-section-container';
    
    const header = document.createElement('div');
    header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;';
    header.innerHTML = `<span style="color:#e0e0e0;font-size:13px;font-weight:500;">RGB Gain & Offset</span>
                        <button id="matrix-reset-btn" style="padding:6px 12px;font-size:11px;background:rgba(255,255,255,0.08);color:#fff;border:1px solid rgba(255,255,255,0.15);border-radius:8px;cursor:pointer;transition:all 0.2s;">Reset</button>`;
    section.appendChild(header);
    
    const statusDiv = document.createElement('div'); statusDiv.id='matrix-status'; statusDiv.style.cssText='font-size:11px;color:#8b92b4;margin-bottom:12px;padding:8px 12px;background:rgba(0,0,0,0.2);border-radius:8px;';
    section.appendChild(statusDiv);
    
    const rgbSection = document.createElement('div'); rgbSection.style.cssText='margin-bottom:12px;padding-bottom:12px;border-bottom:1px solid rgba(255,255,255,0.05);';
    rgbSection.innerHTML = '<div style="color:#8b92b4;font-size:11px;margin-bottom:8px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">RGB Gain (Diagonal)</div>';
    [{label:'Red Gain (m00)',idx:0,color:'#FF5555',sid:'gain-slider-0',vid:'gain-val-0'},{label:'Green Gain (m11)',idx:5,color:'#55FF55',sid:'gain-slider-5',vid:'gain-val-5'},{label:'Blue Gain (m22)',idx:10,color:'#5555FF',sid:'gain-slider-10',vid:'gain-val-10'}].forEach(g=>{
        const row=document.createElement('div'); row.style.cssText='margin-bottom:10px;';
        const hr=document.createElement('div'); hr.style.cssText='display:flex;justify-content:space-between;margin-bottom:4px;';
        const iv=(currentMatrix&&currentMatrix[g.idx]!==undefined)?currentMatrix[g.idx]:1.0;
        hr.innerHTML=`<span style="color:#e0e0e0;font-size:12px;">${g.label}</span><span id="${g.vid}" style="color:${g.color};font-size:12px;font-weight:600;">${iv.toFixed(2)}</span>`;
        row.appendChild(hr);
        const sl=document.createElement('input'); sl.type='range';sl.min=0.5;sl.max=2.0;sl.step=0.05;sl.id=g.sid;sl.value=iv;
        sl.className = 'boost-slider';
        sl.style.cssText='width:100%;height:4px;background:rgba(255,255,255,0.1);border-radius:3px;outline:none;-webkit-appearance:none;appearance:none;cursor:pointer;';
        sl.style.setProperty('--thumb-color', g.color);
        sl.oninput=(e)=>{if(!currentMatrix||!Array.isArray(currentMatrix))currentMatrix=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];currentMatrix[g.idx]=parseFloat(e.target.value);document.getElementById(g.vid).textContent=currentMatrix[g.idx].toFixed(2);updateMatrixStatus();currentPresetName=null;updatePresetButtonText();debouncedApply(120);};
        row.appendChild(sl); rgbSection.appendChild(row);
    }); section.appendChild(rgbSection);
    
    const alphaSection = document.createElement('div');
    alphaSection.innerHTML = '<div style="color:#8b92b4;font-size:11px;margin-bottom:8px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Alpha Offset (Last Row)</div>';
    [{label:'Red Offset (m30)',idx:12,color:'#FF8888',sid:'offset-slider-12',vid:'offset-val-12'},{label:'Green Offset (m31)',idx:13,color:'#88FF88',sid:'offset-slider-13',vid:'offset-val-13'},{label:'Blue Offset (m32)',idx:14,color:'#8888FF',sid:'offset-slider-14',vid:'offset-val-14'}].forEach(g=>{
        const row=document.createElement('div'); row.style.cssText='margin-bottom:10px;';
        if (g.label.includes('Blue')) row.style.marginBottom = '0';
        const hr=document.createElement('div'); hr.style.cssText='display:flex;justify-content:space-between;margin-bottom:4px;';
        const iv=(currentMatrix&&currentMatrix[g.idx]!==undefined)?currentMatrix[g.idx]:0.0;
        hr.innerHTML=`<span style="color:#e0e0e0;font-size:12px;">${g.label}</span><span id="${g.vid}" style="color:${g.color};font-size:12px;font-weight:600;">${iv.toFixed(2)}</span>`;
        row.appendChild(hr);
        const sl=document.createElement('input'); sl.type='range';sl.min=-0.5;sl.max=0.5;sl.step=0.02;sl.id=g.sid;sl.value=iv;
        sl.className = 'boost-slider';
        sl.style.cssText='width:100%;height:4px;background:rgba(255,255,255,0.1);border-radius:3px;outline:none;-webkit-appearance:none;appearance:none;cursor:pointer;';
        sl.style.setProperty('--thumb-color', g.color);
        sl.oninput=(e)=>{if(!currentMatrix||!Array.isArray(currentMatrix))currentMatrix=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];currentMatrix[g.idx]=parseFloat(e.target.value);document.getElementById(g.vid).textContent=currentMatrix[g.idx].toFixed(2);updateMatrixStatus();currentPresetName=null;updatePresetButtonText();debouncedApply(120);};
        row.appendChild(sl); alphaSection.appendChild(row);
    }); section.appendChild(alphaSection);
    
    const resetBtn = header.querySelector('#matrix-reset-btn');
    resetBtn.onclick=()=>{currentMatrix=null;refreshMatrixUI();currentPresetName=null;updatePresetButtonText();if(window.showStatus)window.showStatus('Matrix reset to default','#8b92b4');debouncedApply(50);};
    resetBtn.onmouseenter=()=>{resetBtn.style.background='rgba(255,255,255,0.15)';};
    resetBtn.onmouseleave=()=>{resetBtn.style.background='rgba(255,255,255,0.08)';};
    
    setTimeout(()=>refreshMatrixUI(),0); 
    return section;
}

// ⚙️ Config & Init
async function init() { 
    if (!document.getElementById('boost-slider-styles')) {
        const style = document.createElement('style');
        style.id = 'boost-slider-styles';
        style.textContent = `
            .boost-slider::-webkit-slider-thumb {
                -webkit-appearance: none;
                appearance: none;
                width: 18px;
                height: 18px;
                background: var(--thumb-color, #FF9F0A);
                border-radius: 50%;
                cursor: pointer;
                box-shadow: 0 2px 6px rgba(0,0,0,0.3);
                transition: transform 0.1s;
            }
            .boost-slider::-webkit-slider-thumb:active {
                transform: scale(1.2);
            }
            .boost-slider::-moz-range-thumb {
                width: 18px;
                height: 18px;
                background: var(--thumb-color, #FF9F0A);
                border-radius: 50%;
                cursor: pointer;
                border: none;
                box-shadow: 0 2px 6px rgba(0,0,0,0.3);
            }
        `;
        document.head.appendChild(style);
    }
    
    await loadSavedConfig(); 
    await loadCustomPresets();
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
    if (el) { const mb=(currentMatrix&&Array.isArray(currentMatrix))?` <span style="font-size:9px;background:#00D4FF;color:#000;padding:2px 6px;border-radius:4px;margin-left:5px;font-weight:600;">MATRIX</span>`:'';
        el.innerHTML=`${currentColor}${mb} <i class="fas fa-chevron-right"></i>`; el.style.color=currentColor; }
}

function bindClickHandler() { const it=document.getElementById('boost-color-item'); if(!it)return; it.style.cursor='pointer'; it.addEventListener('click',()=>showBoostModal()); }

// 🎨 Professional Modal Builder
function showBoostModal() {
    const ex = document.getElementById('boost-modal'); if(ex)ex.remove();
    const modal = document.createElement('div'); modal.id='boost-modal';
    modal.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:10000;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(8px);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;';
    
    const box = document.createElement('div'); box.id='boost-modal-box';
    box.style.cssText=`background:linear-gradient(160deg,#12141d,#1a1d2e);border:1px solid rgba(255,255,255,0.1);border-radius:24px;padding:0;width:92%;max-width:440px;box-shadow:0 20px 60px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.05);max-height:90vh;overflow:hidden;display:flex;flex-direction:column;position:relative;`;
    
    // Header
    const hdr = document.createElement('div');
    hdr.style.cssText='padding:20px 24px 16px;text-align:center;border-bottom:1px solid rgba(255,255,255,0.05);';
    hdr.innerHTML=`<h3 style="color:#fff;margin:0;font-size:20px;font-weight:700;letter-spacing:-0.5px;">Advanced Color Boost</h3><p style="color:#8b92b4;font-size:12px;margin:4px 0 0;font-weight:400;">System-wide display enhancement</p>`;
    box.appendChild(hdr);
    
    // Scrollable Content
    const content = document.createElement('div');
    content.style.cssText='flex:1;overflow-y:auto;padding:20px 24px;';
    
    // 1. Base Color
    const cs = createSectionCard('🎨 Base Color');
    const ci = document.createElement('input'); ci.type='color';ci.value=currentColor;
    ci.style.cssText='width:100%;height:48px;border:none;border-radius:12px;background:transparent;cursor:pointer;padding:0;';
    ci.oninput=(e)=>{currentColor=e.target.value;currentPresetName=null;syncAllUI();debouncedApply(80);};
    cs.content.appendChild(ci);
    content.appendChild(cs.el);

    // 2. Presets Button (Pop-up) - ✅ Now shows selected preset name
    const presetCard = createSectionCard('✨ Color Presets');
    const presetBtn = document.createElement('button');
    presetBtn.id = 'preset-select-btn';
    const displayName = currentPresetName || 'Select Preset';
    presetBtn.innerHTML = `${displayName} <span style="float:right;opacity:0.5;">›</span>`;
    presetBtn.style.cssText = 'width:100%;padding:14px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);color:#fff;border-radius:12px;font-size:14px;font-weight:500;cursor:pointer;text-align:left;display:flex;justify-content:space-between;align-items:center;transition:all 0.2s;';
    presetBtn.onmouseenter = () => presetBtn.style.background = 'rgba(255,255,255,0.1)';
    presetBtn.onmouseleave = () => presetBtn.style.background = 'rgba(255,255,255,0.05)';
    presetBtn.onclick = showPresetPopup;
    presetCard.content.appendChild(presetBtn);
    content.appendChild(presetCard.el);

    // 3. Fine Tuning
    const tuneCard = createSectionCard('⚙️ Fine Tuning');
    tuneCard.content.appendChild(createSliderRow('💧 Saturation', 'sat-slider', 'sat-val', currentSaturation, 0.5, 2.5, 0.1, (v) => { currentSaturation = v; return v.toFixed(1)+'x'; }));
    tuneCard.content.appendChild(createSliderRow('🔍 Sharpness', 'sharp-slider', 'sharp-val', currentSharpness, 0.5, 2.0, 0.1, (v) => { currentSharpness = v; return v.toFixed(1)+'x'; }));
    tuneCard.content.appendChild(createSliderRow('🌡️ Temperature', 'warm-slider', 'warm-val', currentWarmth, -10, 10, 1, (v) => { currentWarmth = v; const lb = v<0?'Cool':v>0?'Warm':'Neutral'; return `${lb} (${v})`; }));
    content.appendChild(tuneCard.el);

    // 4. Display Modes
    const modeCard = createSectionCard('📱 Display Modes');
    const at = document.createElement('label');
    at.style.cssText='display:flex;align-items:center;justify-content:space-between;padding:12px 16px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:12px;cursor:pointer;';
    at.innerHTML=`<div><div style="color:#fff;font-size:14px;font-weight:500;">AMOLED Optimization</div><div style="color:#8b92b4;font-size:11px;margin-top:2px;">Deep blacks & vivid colors</div></div><input type="checkbox" id="amoled-toggle" style="transform:scale(1.4);accent-color:${currentColor};">`;
    modeCard.content.appendChild(at);
    at.querySelector('input').onchange=()=>debouncedApply(50);
    content.appendChild(modeCard.el);

    // 5. Advanced Matrix
    const matrixCard = createSectionCard('🔷 Color Matrix (SF 1015)');
    matrixCard.content.appendChild(createMatrixSection());
    content.appendChild(matrixCard.el);

    box.appendChild(content);

    // Footer
    const footer = document.createElement('div');
    footer.style.cssText = 'padding:16px 24px;border-top:1px solid rgba(255,255,255,0.05);display:flex;gap:12px;';
    
    const ab = document.createElement('button'); ab.textContent='💾 Apply on Boot';
    ab.style.cssText=`flex:1;padding:14px;background:linear-gradient(135deg,${currentColor},${currentColor}cc);color:#fff;border:none;border-radius:12px;font-size:14px;font-weight:600;cursor:pointer;box-shadow:0 4px 15px ${currentColor}40;transition:all 0.2s;`;
    ab.onclick=async()=>{
        const success = await createBootScript();
        if (success && window.showStatus) window.showStatus('✅ Boot script installed', currentColor);
    };
    footer.appendChild(ab);
    
    const cb = document.createElement('button'); cb.textContent='Close';
    cb.style.cssText='flex:1;padding:14px;background:rgba(255,255,255,0.08);color:#fff;border:1px solid rgba(255,255,255,0.1);border-radius:12px;font-size:14px;font-weight:500;cursor:pointer;transition:all 0.2s;';
    cb.onclick=()=>modal.remove(); 
    footer.appendChild(cb);
    
    box.appendChild(footer);
    modal.appendChild(box); 
    document.body.appendChild(modal);
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
    } catch(e){console.error('Boost apply failed:',e);if(window.showStatus)window.showStatus(' Color Boost Failed','#FF453A');alert('Failed to apply color boost. Ensure root access.');}
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
            '    31|32) TINT=1035; SATU=1022; MAT=1015 ;;',
            '    *) TINT=1037; SATU=1022; MAT=1015 ;;',
            'esac',
            'echo " SDK $SDK (Android $VER) -> Tint=$TINT Sat=$SATU Matrix=$MAT" >> "$LOG"',
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
            '    setprop persist.sys.led.color.matrix 1 2>/dev/null || true',
            'else',
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