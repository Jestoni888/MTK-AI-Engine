// spoof.js - FIXED with resetprop for ro.* properties
(function() {
'use strict';
const CONFIG_FILE = '/sdcard/MTK_AI_Engine/spoof.conf';
const LOG_FILE = '/sdcard/MTK_AI_Engine/spoof.log';

const SPOOF_PROPS = [
    'ro.product.model', 'ro.product.name', 'ro.build.fingerprint',
    'ro.product.manufacturer', 'ro.hardware', 'ro.serialno', 'ro.boot.serialno',
    'ro.product.board', 'ro.board.platform', 'ro.hardware.chipname', 'ro.chipname',
    'ro.config.per_app_memcg', 'ro.hardware.egl', 'ro.hardware.vulkan',
    'ro.gpu.vendor', 'ro.gpu.renderer', 'ro.build.id', 'ro.build.display.id',
    'ro.build.version.incremental', 'ro.build.date.utc', 'ro.build.tags',
    'ro.product.device', 'ro.build.product', 'ro.build.type'
];

const DEVICE_PRESETS = {
    'pixel8': {
        name: '📱 Google Pixel 8',
        props: {
            'ro.product.model': 'Pixel 8', 'ro.product.name': 'shiba',
            'ro.product.device': 'shiba', 'ro.build.product': 'shiba',
            'ro.build.fingerprint': 'google/shiba/shiba:14/AP2A.240605.024/12040211:user/release-keys',
            'ro.product.manufacturer': 'Google', 'ro.hardware': 'shiba',
            'ro.product.board': 'shiba', 'ro.board.platform': 'gs3',
            'ro.hardware.chipname': 'gs3', 'ro.chipname': 'gs3',
            'ro.hardware.egl': 'angle', 'ro.hardware.vulkan': 'angle',
            'ro.gpu.vendor': 'ARM', 'ro.gpu.renderer': 'Mali-G715',
            'ro.build.id': 'AP2A.240605.024', 'ro.build.display.id': 'AP2A.240605.024',
            'ro.build.version.incremental': '12040211', 'ro.build.tags': 'release-keys',
            'ro.build.type': 'user',
            'ro.serialno': '8A1X1234567890', 'ro.boot.serialno': '8A1X1234567890'
        }
    },
    's24ultra': {
        name: '📱 Samsung Galaxy S24 Ultra',
        props: {
            'ro.product.model': 'SM-S928B', 'ro.product.name': 'e3sxxx',
            'ro.product.device': 'e3s', 'ro.build.product': 'e3s',
            'ro.build.fingerprint': 'samsung/e3sxxx/e3s:14/UP1A.231005.007/S928BXXU1AWA1:user/release-keys',
            'ro.product.manufacturer': 'Samsung', 'ro.hardware': 'e3s',
            'ro.product.board': 'e3s', 'ro.board.platform': 'exynos2400',
            'ro.hardware.chipname': 'exynos2400', 'ro.chipname': 'exynos2400',
            'ro.hardware.egl': 'mali', 'ro.hardware.vulkan': 'mali',
            'ro.gpu.vendor': 'ARM', 'ro.gpu.renderer': 'Xclipse-940',
            'ro.build.id': 'UP1A.231005.007', 'ro.build.display.id': 'UP1A.231005.007',
            'ro.build.version.incremental': 'S928BXXU1AWA1', 'ro.build.tags': 'release-keys',
            'ro.build.type': 'user',
            'ro.serialno': 'R5CN1234567', 'ro.boot.serialno': 'R5CN1234567'
        }
    },
    's23ultra': {
        name: '📱 Samsung Galaxy S23 Ultra',
        props: {
            'ro.product.model': 'SM-S918B', 'ro.product.name': 'dm3qxxx',
            'ro.product.device': 'dm3q', 'ro.build.product': 'dm3q',
            'ro.build.fingerprint': 'samsung/dm3qxxx/dm3q:14/UP1A.231005.007/S918BXXU5CWH5:user/release-keys',
            'ro.product.manufacturer': 'Samsung', 'ro.hardware': 'dm3q',
            'ro.product.board': 'dm3q', 'ro.board.platform': 'kalama',
            'ro.hardware.chipname': 'sm8550', 'ro.chipname': 'sm8550',
            'ro.hardware.egl': 'mali', 'ro.hardware.vulkan': 'mali',
            'ro.gpu.vendor': 'Qualcomm', 'ro.gpu.renderer': 'Adreno-740',
            'ro.build.id': 'UP1A.231005.007', 'ro.build.display.id': 'UP1A.231005.007',
            'ro.build.version.incremental': 'S918BXXU5CWH5', 'ro.build.tags': 'release-keys',
            'ro.build.type': 'user',
            'ro.serialno': 'R5CN9999999', 'ro.boot.serialno': 'R5CN9999999'
        }
    },
    'pixel9pro': {
        name: ' Google Pixel 9 Pro',
        props: {
            'ro.product.model': 'Pixel 9 Pro', 'ro.product.name': 'caiman',
            'ro.product.device': 'caiman', 'ro.build.product': 'caiman',
            'ro.build.fingerprint': 'google/caiman/caiman:15/AP3A.241005.015/12180455:user/release-keys',
            'ro.product.manufacturer': 'Google', 'ro.hardware': 'caiman',
            'ro.product.board': 'caiman', 'ro.board.platform': 'gs4',
            'ro.hardware.chipname': 'gs4', 'ro.chipname': 'gs4',
            'ro.hardware.egl': 'angle', 'ro.hardware.vulkan': 'angle',
            'ro.gpu.vendor': 'ARM', 'ro.gpu.renderer': 'Mali-G715',
            'ro.build.id': 'AP3A.241005.015', 'ro.build.display.id': 'AP3A.241005.015',
            'ro.build.version.incremental': '12180455', 'ro.build.tags': 'release-keys',
            'ro.build.type': 'user',
            'ro.serialno': '8A2X9876543210', 'ro.boot.serialno': '8A2X9876543210'
        }
    },
    'iphone15promax': {
        name: '🍎 iPhone 15 Pro Max',
        props: {
            'ro.product.model': 'iPhone16,2', 'ro.product.name': 'iPhone16,2',
            'ro.product.device': 'iPhone16,2', 'ro.build.product': 'iPhone16,2',
            'ro.build.fingerprint': 'Apple/iPhone16,2/iPhone:17.0:21A329:user/release-keys',
            'ro.product.manufacturer': 'Apple', 'ro.hardware': 't8130',
            'ro.product.board': 't8130', 'ro.board.platform': 't8130',
            'ro.hardware.chipname': 'A17Pro', 'ro.chipname': 'A17Pro',
            'ro.hardware.egl': 'powervr', 'ro.gpu.vendor': 'Apple',
            'ro.gpu.renderer': 'Apple-GPU',
            'ro.build.id': '21A329', 'ro.build.display.id': '21A329',
            'ro.build.tags': 'release-keys', 'ro.build.type': 'user',
            'ro.serialno': 'F2LW12345678', 'ro.boot.serialno': 'F2LW12345678'
        }
    },
    'oneplus12': {
        name: ' OnePlus 12',
        props: {
            'ro.product.model': 'CPH2573', 'ro.product.name': 'OP595DL1',
            'ro.product.device': 'OP595DL1', 'ro.build.product': 'OP595DL1',
            'ro.build.fingerprint': 'OnePlus/OP595DL1/OP595DL1:14/UKQ1.230804.001/1234567890:user/release-keys',
            'ro.product.manufacturer': 'OnePlus', 'ro.hardware': 'OP595DL1',
            'ro.product.board': 'kalama', 'ro.board.platform': 'kalama',
            'ro.hardware.chipname': 'sm8650', 'ro.chipname': 'sm8650',
            'ro.hardware.egl': 'mali', 'ro.hardware.vulkan': 'mali',
            'ro.gpu.vendor': 'Qualcomm', 'ro.gpu.renderer': 'Adreno-750',
            'ro.build.id': 'UKQ1.230804.001', 'ro.build.display.id': 'UKQ1.230804.001',
            'ro.build.version.incremental': '1234567890', 'ro.build.tags': 'release-keys',
            'ro.build.type': 'user',
            'ro.serialno': 'OP12987654', 'ro.boot.serialno': 'OP12987654'
        }
    },
    'custom': { name: '✏️ Custom Values', props: {} }
};

let currentPreset = 'custom';
let customProps = {};
let spoofEnabled = false;
let originalProps = {};
let androidId = '', adId = '', macAddress = '', latitude = '', longitude = '';
let safetyNetBypass = false, playIntegrityBypass = false, mockLocation = false;

const execFn = window.exec || async function(cmd, timeout = 30000) {
    return new Promise(resolve => {
        const cb = 'spoof_exec_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);
        const t = setTimeout(function() { delete window[cb]; log('⚠️ Timeout'); resolve(''); }, timeout);
        window[cb] = function(_, res) { clearTimeout(t); delete window[cb]; resolve(res || ''); };
        if (window.ksu && typeof ksu.exec === 'function') { try { ksu.exec(cmd, 'window.' + cb); } catch(e) { clearTimeout(t); delete window[cb]; resolve(''); } }
        else { clearTimeout(t); resolve(''); }
    });
};

function log(msg) {
    console.log('[SPOOF] ' + msg);
    execFn('echo "' + msg.replace(/"/g, '') + '" >> ' + LOG_FILE + ' 2>/dev/null');
}

function shellQuote(str) {
    str = String(str);
    if (!str) return "''";
    if (/^[a-zA-Z0-9._\-:@%/+=,]+$/.test(str)) return str;
    return "'" + str.split("'").join("'\"'\"'") + "'";
}

// 🔥 FIXED: Use resetprop for ro.* properties
async function safeSetprop(prop, value) {
    try {
        let cmd, res;
        // Use resetprop for ro.* properties (Magisk/KernelSU)
        if (prop.startsWith('ro.')) {
            cmd = 'su -c "resetprop ' + shellQuote(prop) + ' ' + shellQuote(value) + '" 2>&1';
            res = await execFn(cmd, 5000);
            // Fallback to setprop if resetprop fails
            if (res && (res.toLowerCase().includes('not found') || res.toLowerCase().includes('error'))) {
                log('️ resetprop failed, trying setprop for ' + prop);
                cmd = 'su -c "setprop ' + shellQuote(prop) + ' ' + shellQuote(value) + '" 2>&1';
                res = await execFn(cmd, 5000);
            }
        } else {
            cmd = 'su -c "setprop ' + shellQuote(prop) + ' ' + shellQuote(value) + '" 2>&1';
            res = await execFn(cmd, 5000);
        }
        if (res && (res.toLowerCase().includes('error') || res.toLowerCase().includes('failed'))) return false;
        return true;
    } catch (e) { 
        log(' setprop error: ' + e.message);
        return false; 
    }
}

async function safeSettingsPut(table, key, value) {
    try {
        const cmd = 'su -c "settings put ' + shellQuote(table) + ' ' + shellQuote(key) + ' ' + shellQuote(value) + '" 2>&1';
        const res = await execFn(cmd, 5000);
        return !res || !res.toLowerCase().includes('error');
    } catch { return false; }
}

async function loadConfig() {
    try {
        const raw = await execFn('cat ' + CONFIG_FILE + ' 2>/dev/null', 5000);
        if (raw && raw.trim()) {
            const parsed = JSON.parse(raw.trim());
            if (parsed.preset) currentPreset = parsed.preset;
            if (parsed.customProps) customProps = parsed.customProps;
            if (parsed.enabled !== undefined) spoofEnabled = parsed.enabled;
            if (parsed.androidId) androidId = parsed.androidId;
            if (parsed.adId) adId = parsed.adId;
            if (parsed.macAddress) macAddress = parsed.macAddress;
            if (parsed.latitude) latitude = parsed.latitude;
            if (parsed.longitude) longitude = parsed.longitude;
            if (parsed.safetyNetBypass !== undefined) safetyNetBypass = parsed.safetyNetBypass;
            if (parsed.playIntegrityBypass !== undefined) playIntegrityBypass = parsed.playIntegrityBypass;
            if (parsed.mockLocation !== undefined) mockLocation = parsed.mockLocation;
            log('📥 Config loaded');
        }
    } catch { log('⚠️ Config load failed'); }
}

async function saveConfig() {
    try {
        await execFn('mkdir -p /sdcard/MTK_AI_Engine 2>/dev/null');
        const data = JSON.stringify({ preset: currentPreset, customProps, enabled: spoofEnabled, androidId, adId, macAddress, latitude, longitude, safetyNetBypass, playIntegrityBypass, mockLocation });
        await execFn('echo -n "' + data + '" > ' + CONFIG_FILE + ' 2>/dev/null');
    } catch { log('❌ Config save failed'); }
}

async function cacheOriginalProps() {
    if (Object.keys(originalProps).length > 0) return;
    for (const prop of SPOOF_PROPS) {
        const val = await execFn('getprop ' + prop, 3000);
        if (val && val.trim()) originalProps[prop] = val.trim();
    }
}

async function spoofMacAddress() {
    if (!macAddress || !macAddress.trim()) return false;
    try {
        await execFn('su -c "ip link set wlan0 down" 2>&1');
        await execFn('su -c "ip link set wlan0 address ' + macAddress.trim() + '" 2>&1');
        await execFn('su -c "ip link set wlan0 up" 2>&1');
        log('✅ MAC spoofed');
        return true;
    } catch { return false; }
}

async function spoofLocation() {
    if (!latitude || !longitude) return false;
    try {
        await safeSettingsPut('secure', 'mock_location', '1');
        await safeSettingsPut('secure', 'location_changer_latitude', latitude.trim());
        await safeSettingsPut('secure', 'location_changer_longitude', longitude.trim());
        log('✅ Location spoofed');
        return true;
    } catch { return false; }
}

async function applySafetyNetBypass() {
    try {
        await safeSetprop('ro.debuggable', '0');
        await safeSetprop('ro.secure', '1');
        await safeSetprop('ro.boot.verifiedbootstate', 'green');
        await safeSetprop('ro.boot.veritymode', 'enforcing');
        await safeSetprop('ro.boot.flash.locked', '1');
        await safeSetprop('ro.build.type', 'user');
        await safeSetprop('ro.build.tags', 'release-keys');
        log('✅ SafetyNet bypass applied');
        return true;
    } catch { return false; }
}

async function applySpoof() {
    const statusEl = document.getElementById('spoof-status');
    const applyBtn = document.getElementById('spoof-apply-btn');
    if (!statusEl || !applyBtn) return;
    
    applyBtn.disabled = true;
    applyBtn.textContent = ' Applying...';
    statusEl.innerHTML = '<span style="color:#fbbf24;"> Applying spoofing with resetprop...</span>';
    
    await cacheOriginalProps();
    let success = 0, failed = 0;
    
    const targetProps = currentPreset === 'custom' ? customProps : (DEVICE_PRESETS[currentPreset]?.props || {});
    
    for (const [prop, value] of Object.entries(targetProps)) {
        if (value && value.trim()) {
            const ok = await safeSetprop(prop, value.trim());
            if (ok) { log('✅ ' + prop + '=' + value); success++; }
            else { log('❌ Failed: ' + prop); failed++; }
        }
    }
    
    if (androidId) { if (await safeSettingsPut('secure', 'android_id', androidId)) success++; else failed++; }
    if (adId) { if (await safeSettingsPut('secure', 'advertising_id', adId)) success++; else failed++; }
    if (macAddress) { if (await spoofMacAddress()) success++; else failed++; }
    if (latitude && longitude) { if (await spoofLocation()) success++; else failed++; }
    if (safetyNetBypass || playIntegrityBypass) { if (await applySafetyNetBypass()) success++; else failed++; }
    
    spoofEnabled = true;
    await saveConfig();
    
    const color = failed === 0 ? '#32D74B' : '#fbbf24';
    statusEl.innerHTML = '<span style="color:' + color + ';font-weight:600;">✅ Spoof Applied!</span><br><small style="color:#8b92b4;">' + success + ' applied | ' + failed + ' failed<br>🔄 <b>Force stop DevCheck & reopen!</b></small>';
    applyBtn.disabled = false;
    applyBtn.textContent = '💾 Apply Spoof';
}

async function resetSpoof() {
    const statusEl = document.getElementById('spoof-status');
    const resetBtn = document.getElementById('spoof-reset-btn');
    if (!statusEl || !resetBtn) return;
    
    resetBtn.disabled = true;
    resetBtn.textContent = ' Resetting...';
    
    let success = 0;
    for (const [prop, val] of Object.entries(originalProps)) {
        if (await safeSetprop(prop, val)) success++;
    }
    await safeSettingsPut('secure', 'mock_location', '0');
    
    spoofEnabled = false;
    await saveConfig();
    statusEl.innerHTML = '<span style="color:#32D74B;font-weight:600;">✅ Reset Complete</span>';
    resetBtn.disabled = false;
    resetBtn.textContent = '🔄 Reset to Default';
}

function showSpoofModal() {
    const existing = document.getElementById('spoof-modal');
    if (existing) existing.remove();
    
    const modal = document.createElement('div');
    modal.id = 'spoof-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.9);z-index:10000;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(8px);overflow-y:auto;padding:20px;';
    
    const box = document.createElement('div');
    box.style.cssText = 'background:linear-gradient(135deg,#1a1f3a,#2d3561,#1a1f3a);border:2px solid #f59e0b;border-radius:24px;padding:28px;width:100%;max-width:650px;box-shadow:0 0 60px rgba(245,158,11,0.3);max-height:90vh;overflow-y:auto;';
    
    let html = '<h3 style="color:#f59e0b;margin:0 0 8px;font-size:22px;text-align:center;font-weight:700;">🎭 Device Spoofer (FIXED)</h3>';
    html += '<p style="color:#8b92b4;font-size:13px;text-align:center;margin-bottom:24px;">Uses resetprop for ro.* properties</p>';
    
    html += '<div style="margin-bottom:18px;"><div style="color:#fff;font-size:14px;font-weight:600;margin-bottom:10px;">📱 Preset Profile</div>';
    html += '<select id="spoof-preset-select" style="width:100%;padding:12px;background:rgba(0,0,0,0.4);color:#fff;border:1px solid #f59e0b;border-radius:12px;font-size:14px;">';
    Object.entries(DEVICE_PRESETS).forEach(function(item) {
        html += '<option value="' + item[0] + '"' + (item[0] === currentPreset ? ' selected' : '') + '>' + item[1].name + '</option>';
    });
    html += '</select></div>';
    
    html += '<details style="margin-bottom:18px;background:rgba(0,0,0,0.25);border-radius:12px;padding:14px;" ' + (currentPreset === 'custom' ? 'open' : '') + '>';
    html += '<summary style="color:#f59e0b;font-weight:600;cursor:pointer;font-size:13px;">✏️ Custom Properties</summary>';
    html += '<div style="margin-top:12px;display:grid;gap:10px;">';
    ['ro.product.model', 'ro.product.name', 'ro.product.device', 'ro.build.product', 'ro.product.manufacturer', 'ro.build.fingerprint', 'ro.build.id', 'ro.build.display.id'].forEach(function(prop) {
        const val = customProps[prop] || '';
        html += '<div style="display:flex;gap:8px;align-items:center;"><span style="color:#8b92b4;font-size:11px;width:140px;">' + prop + '</span><input type="text" data-prop="' + prop + '" value="' + val + '" style="flex:1;padding:8px;background:rgba(0,0,0,0.4);color:#fff;border:1px solid rgba(255,255,255,0.2);border-radius:8px;font-size:12px;"></div>';
    });
    html += '</div></details>';
    
    html += '<div style="margin-bottom:18px;"><div style="color:#fff;font-size:14px;font-weight:600;margin-bottom:10px;">🆔 Identity</div>';
    html += '<div style="display:grid;gap:10px;">';
    [['spoof-android-id', 'Android ID', androidId], ['spoof-mac', 'MAC Address', macAddress]].forEach(function(item) {
        html += '<div style="display:flex;gap:8px;align-items:center;"><span style="color:#8b92b4;font-size:12px;width:120px;">' + item[1] + '</span><input type="text" id="' + item[0] + '" value="' + item[2] + '" style="flex:1;padding:8px;background:rgba(0,0,0,0.4);color:#fff;border:1px solid rgba(255,255,255,0.2);border-radius:8px;font-size:12px;"></div>';
    });
    html += '</div></div>';
    
    html += '<div style="background:rgba(50,215,75,0.12);color:#32D74B;padding:12px;border-radius:10px;font-size:11px;margin-bottom:20px;border-left:3px solid #32D74B;">';
    html += '<strong>✅ FIXED:</strong> Now uses <code>resetprop</code> for ro.* properties. <b>Force stop DevCheck after applying!</b>';
    html += '</div>';
    
    html += '<button id="spoof-apply-btn" style="width:100%;padding:16px;background:linear-gradient(135deg,#f59e0b,#d97706);color:#fff;border:none;border-radius:14px;font-size:15px;font-weight:700;cursor:pointer;margin-bottom:10px;">💾 Apply Spoof</button>';
    html += '<button id="spoof-reset-btn" style="width:100%;padding:12px;background:rgba(255,255,255,0.1);color:#fff;border:none;border-radius:12px;font-size:13px;font-weight:600;cursor:pointer;margin-bottom:10px;">🔄 Reset</button>';
    html += '<button id="spoof-cancel-btn" style="width:100%;padding:12px;background:rgba(255,255,255,0.05);color:#8b92b4;border:none;border-radius:10px;font-size:13px;cursor:pointer;">Cancel</button>';
    html += '<div id="spoof-status" style="text-align:center;font-size:12px;color:#666;margin-top:15px;"></div>';
    
    box.innerHTML = html;
    modal.appendChild(box);
    document.body.appendChild(modal);
    
    document.getElementById('spoof-preset-select').onchange = function() { currentPreset = this.value; };
    document.getElementById('spoof-apply-btn').onclick = async function() {
        customProps = {};
        box.querySelectorAll('input[data-prop]').forEach(function(inp) { if (inp.value.trim()) customProps[inp.dataset.prop] = inp.value.trim(); });
        androidId = document.getElementById('spoof-android-id')?.value.trim() || '';
        macAddress = document.getElementById('spoof-mac')?.value.trim() || '';
        await applySpoof();
    };
    document.getElementById('spoof-reset-btn').onclick = resetSpoof;
    document.getElementById('spoof-cancel-btn').onclick = function() { modal.remove(); };
}

function bindClickHandler() {
    const btn = document.getElementById('spoof-btn');
    if (btn) btn.addEventListener('click', showSpoofModal);
}

async function init() {
    await loadConfig();
    bindClickHandler();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
window.SPOOFManager = { init, showSpoofModal, applySpoof, resetSpoof, DEVICE_PRESETS };
})();