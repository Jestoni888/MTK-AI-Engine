// spoof.js - Fixed Scope, Dynamic Event Delegation & Runtime Shell Execution
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
        name: '📱 Google Pixel 9 Pro',
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
        name: '📱 OnePlus 12',
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
let originalProps = {};
let safetyNetBypass = false, playIntegrityBypass = false;

// Dynamic command execution resolver
async function execFn(cmd, timeout = 3000) {
    if (typeof window.exec === 'function') {
        return await window.exec(cmd);
    }
    if (window.Android && typeof window.Android.exec === 'function') {
        return window.Android.exec(cmd);
    }
    console.warn('[Spoof] No execution bridge available:', cmd);
    return '';
}

// Log helper
async function logAction(msg) {
    const timestamp = new Date().toISOString();
    await execFn(`echo "[${timestamp}] ${msg}" >> "${LOG_FILE}"`);
}

// Read current system property
async function getProp(prop) {
    try {
        const val = await execFn(`getprop ${prop}`);
        return val ? val.trim() : '';
    } catch (e) {
        return '';
    }
}

// Backup original system values
async function backupOriginalProps() {
    for (const prop of SPOOF_PROPS) {
        if (!originalProps[prop]) {
            originalProps[prop] = await getProp(prop);
        }
    }
}

// Inject modern theme CSS into document head using index.html variable palette
function injectStyles() {
    if (document.getElementById('spoof-tuner-styles')) return;

    const styleEl = document.createElement('style');
    styleEl.id = 'spoof-tuner-styles';
    styleEl.textContent = `
        /* Spoof Tuner Modal Overlays */
        .spoof-modal-overlay {
            position: fixed;
            top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(0, 0, 0, 0.75);
            backdrop-filter: blur(12px);
            -webkit-backdrop-filter: blur(12px);
            z-index: 10000;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 16px;
            animation: spoofFadeIn 0.25s ease;
        }

        .spoof-modal-card {
            background: var(--bg-card, #121824);
            border: 1px solid var(--border-color, rgba(255, 255, 255, 0.12));
            border-radius: 16px;
            width: 100%;
            max-width: 520px;
            max-height: 85vh;
            display: flex;
            flex-direction: column;
            color: #ffffff;
            box-shadow: 0 12px 40px rgba(0, 0, 0, 0.6);
            overflow: hidden;
            animation: spoofSlideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .spoof-modal-header {
            background: linear-gradient(135deg, var(--bg-secondary, #1a2234) 0%, var(--bg-card, #121824) 100%);
            padding: 16px 20px;
            border-bottom: 1px solid var(--border-color, rgba(255, 255, 255, 0.12));
            display: flex;
            align-items: center;
            justify-content: space-between;
        }

        .spoof-modal-header h3 {
            font-size: 16px;
            font-weight: 700;
            color: #ffffff;
            margin: 0;
            display: flex;
            align-items: center;
            gap: 10px;
        }

        .spoof-modal-header h3 i {
            color: var(--accent-blue, #4a9eff);
        }

        .spoof-close-btn {
            background: none;
            border: none;
            color: var(--text-secondary, #a0aec0);
            font-size: 18px;
            cursor: pointer;
            padding: 4px 8px;
            border-radius: 8px;
            transition: all 0.2s;
        }

        .spoof-close-btn:hover {
            color: #ffffff;
            background: rgba(255, 255, 255, 0.08);
        }

        .spoof-modal-body {
            padding: 16px 20px;
            overflow-y: auto;
            flex: 1;
            scrollbar-width: thin;
            scrollbar-color: var(--accent-blue, #4a9eff) var(--bg-secondary, #1a2234);
        }

        .spoof-section-title {
            font-size: 11px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.8px;
            color: var(--accent-blue, #4a9eff);
            margin: 16px 0 10px;
            display: flex;
            align-items: center;
            gap: 6px;
        }

        .spoof-section-title:first-child {
            margin-top: 0;
        }

        .spoof-preset-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 8px;
            margin-bottom: 16px;
        }

        .spoof-preset-btn {
            background: var(--bg-secondary, #1a2234);
            border: 1px solid var(--border-color, rgba(255, 255, 255, 0.12));
            border-radius: 10px;
            padding: 10px 12px;
            color: #ffffff;
            font-size: 12px;
            font-weight: 600;
            cursor: pointer;
            text-align: left;
            transition: all 0.2s;
            display: flex;
            align-items: center;
            justify-content: space-between;
        }

        .spoof-preset-btn:hover {
            border-color: var(--accent-blue, #4a9eff);
            background: rgba(74, 158, 255, 0.08);
        }

        .spoof-preset-btn.active {
            background: rgba(74, 158, 255, 0.16);
            border-color: var(--accent-blue, #4a9eff);
            color: #ffffff;
            box-shadow: 0 0 12px rgba(74, 158, 255, 0.25);
        }

        .spoof-input-group {
            margin-bottom: 12px;
        }

        .spoof-input-group label {
            display: block;
            font-size: 11px;
            color: var(--text-secondary, #a0aec0);
            margin-bottom: 4px;
            font-weight: 600;
        }

        .spoof-input-control {
            width: 100%;
            background: var(--bg-secondary, #1a2234);
            border: 1px solid var(--border-color, rgba(255, 255, 255, 0.12));
            border-radius: 8px;
            padding: 10px 12px;
            color: #ffffff;
            font-size: 13px;
            outline: none;
            transition: border-color 0.2s;
        }

        .spoof-input-control:focus {
            border-color: var(--accent-blue, #4a9eff);
            box-shadow: 0 0 0 2px rgba(74, 158, 255, 0.2);
        }

        .spoof-toggle-row {
            background: var(--bg-secondary, #1a2234);
            border: 1px solid var(--border-color, rgba(255, 255, 255, 0.12));
            border-radius: 12px;
            padding: 12px 14px;
            margin-bottom: 8px;
            display: flex;
            align-items: center;
            justify-content: space-between;
        }

        .spoof-toggle-label {
            display: flex;
            flex-direction: column;
        }

        .spoof-toggle-title {
            font-size: 13px;
            font-weight: 600;
            color: #ffffff;
        }

        .spoof-toggle-desc {
            font-size: 11px;
            color: var(--text-secondary, #a0aec0);
        }

        .spoof-modal-footer {
            padding: 14px 20px;
            background: var(--bg-secondary, #1a2234);
            border-top: 1px solid var(--border-color, rgba(255, 255, 255, 0.12));
            display: flex;
            gap: 10px;
            justify-content: flex-end;
        }

        .spoof-btn-primary {
            background: var(--accent-blue, #4a9eff);
            color: #ffffff;
            border: none;
            border-radius: 8px;
            padding: 10px 18px;
            font-size: 12px;
            font-weight: 700;
            cursor: pointer;
            transition: all 0.2s;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        .spoof-btn-primary:hover {
            background: #3b82f6;
            transform: translateY(-1px);
            box-shadow: 0 4px 12px rgba(74, 158, 255, 0.35);
        }

        .spoof-btn-secondary {
            background: var(--bg-card, #121824);
            color: #ffffff;
            border: 1px solid var(--border-color, rgba(255, 255, 255, 0.12));
            border-radius: 8px;
            padding: 10px 16px;
            font-size: 12px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s;
        }

        .spoof-btn-secondary:hover {
            border-color: var(--accent-red, #ff4d4d);
            color: var(--accent-red, #ff4d4d);
        }

        @keyframes spoofFadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
        }

        @keyframes spoofSlideUp {
            from { opacity: 0; transform: translateY(12px) scale(0.98); }
            to { opacity: 1; transform: translateY(0) scale(1); }
        }
    `;
    document.head.appendChild(styleEl);
}

// Build & Display Modal
async function openSpoofPopup() {
    injectStyles();
    await backupOriginalProps();

    const existingModal = document.getElementById('spoof-tuner-modal');
    if (existingModal) existingModal.remove();

    const modalHTML = `
        <div class="spoof-modal-overlay" id="spoof-tuner-modal">
            <div class="spoof-modal-card">
                <div class="spoof-modal-header">
                    <h3><i class="fas fa-mask"></i> Device Spoofer</h3>
                    <button class="spoof-close-btn" id="spoof-modal-close"><i class="fas fa-times"></i></button>
                </div>
                <div class="spoof-modal-body">
                    <div class="spoof-section-title"><i class="fas fa-mobile-alt"></i> Device Presets</div>
                    <div class="spoof-preset-grid">
                        ${Object.keys(DEVICE_PRESETS).map(key => `
                            <button class="spoof-preset-btn ${currentPreset === key ? 'active' : ''}" data-preset="${key}">
                                <span>${DEVICE_PRESETS[key].name}</span>${currentPreset === key ? '<i class="fas fa-check" style="color:var(--accent-blue, #4a9eff)"></i>' : ''}
                            </button>
                        `).join('')}
                    </div>

                    <div class="spoof-section-title"><i class="fas fa-sliders-h"></i> Property Values</div>
                    <div class="spoof-input-group">
                        <label>MODEL (ro.product.model)</label>
                        <input type="text" class="spoof-input-control" id="spoof-prop-model" value="${customProps['ro.product.model'] || originalProps['ro.product.model'] || ''}" placeholder="e.g. Pixel 8">
                    </div>
                    <div class="spoof-input-group">
                        <label>MANUFACTURER (ro.product.manufacturer)</label>
                        <input type="text" class="spoof-input-control" id="spoof-prop-manufacturer" value="${customProps['ro.product.manufacturer'] || originalProps['ro.product.manufacturer'] || ''}" placeholder="e.g. Google">
                    </div>
                    <div class="spoof-input-group">
                        <label>FINGERPRINT (ro.build.fingerprint)</label>
                        <input type="text" class="spoof-input-control" id="spoof-prop-fingerprint" value="${customProps['ro.build.fingerprint'] || originalProps['ro.build.fingerprint'] || ''}" placeholder="Build Fingerprint">
                    </div>

                    <div class="spoof-section-title"><i class="fas fa-shield-alt"></i> Identity & Integrity</div>
                    <div class="spoof-toggle-row">
                        <div class="spoof-toggle-label">
                            <span class="spoof-toggle-title">Play Integrity Bypass</span>
                            <span class="spoof-toggle-desc">Spoof key attestation & build props</span>
                        </div>
                        <label class="switch">
                            <input type="checkbox" id="spoof-play-integrity" ${playIntegrityBypass ? 'checked' : ''}>
                            <span class="slider"></span>
                        </label>
                    </div>
                    <div class="spoof-toggle-row">
                        <div class="spoof-toggle-label">
                            <span class="spoof-toggle-title">SafetyNet Attestation</span>
                            <span class="spoof-toggle-desc">Pass basic integrity check</span>
                        </div>
                        <label class="switch">
                            <input type="checkbox" id="spoof-safetynet" ${safetyNetBypass ? 'checked' : ''}>
                            <span class="slider"></span>
                        </label>
                    </div>
                </div>
                <div class="spoof-modal-footer">
                    <button class="spoof-btn-secondary" id="spoof-reset-btn">Reset Defaults</button>
                    <button class="spoof-btn-primary" id="spoof-apply-btn">Apply Changes</button>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);
    bindModalEvents();
}

// Bind modal listeners
function bindModalEvents() {
    const modal = document.getElementById('spoof-tuner-modal');
    if (!modal) return;

    document.getElementById('spoof-modal-close').addEventListener('click', () => modal.remove());

    modal.querySelectorAll('.spoof-preset-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const key = this.dataset.preset;
            currentPreset = key;

            if (key !== 'custom' && DEVICE_PRESETS[key]) {
                const presetProps = DEVICE_PRESETS[key].props;
                if (presetProps['ro.product.model']) {
                    document.getElementById('spoof-prop-model').value = presetProps['ro.product.model'];
                }
                if (presetProps['ro.product.manufacturer']) {
                    document.getElementById('spoof-prop-manufacturer').value = presetProps['ro.product.manufacturer'];
                }
                if (presetProps['ro.build.fingerprint']) {
                    document.getElementById('spoof-prop-fingerprint').value = presetProps['ro.build.fingerprint'];
                }
            }

            modal.querySelectorAll('.spoof-preset-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
        });
    });

    document.getElementById('spoof-apply-btn').addEventListener('click', async () => {
        const model = document.getElementById('spoof-prop-model').value;
        const manufacturer = document.getElementById('spoof-prop-manufacturer').value;
        const fingerprint = document.getElementById('spoof-prop-fingerprint').value;

        playIntegrityBypass = document.getElementById('spoof-play-integrity')?.checked || false;
        safetyNetBypass = document.getElementById('spoof-safetynet')?.checked || false;

        if (currentPreset !== 'custom' && DEVICE_PRESETS[currentPreset]) {
            const propsToApply = DEVICE_PRESETS[currentPreset].props;
            for (const [prop, val] of Object.entries(propsToApply)) {
                await execFn(`resetprop ${prop} "${val}"`);
            }
        } else {
            if (model) await execFn(`resetprop ro.product.model "${model}"`);
            if (manufacturer) await execFn(`resetprop ro.product.manufacturer "${manufacturer}"`);
            if (fingerprint) await execFn(`resetprop ro.build.fingerprint "${fingerprint}"`);
        }

        await logAction(`Applied spoof profile [${currentPreset}]: model=${model}`);
        modal.remove();
        if (typeof window.showStatusMessage === 'function') {
            window.showStatusMessage('Spoof properties applied successfully');
        }
    });

    document.getElementById('spoof-reset-btn').addEventListener('click', async () => {
        for (const prop of SPOOF_PROPS) {
            if (originalProps[prop]) {
                await execFn(`resetprop ${prop} "${originalProps[prop]}"`);
            }
        }
        await logAction('Reset properties to original hardware values');
        modal.remove();
        if (typeof window.showStatusMessage === 'function') {
            window.showStatusMessage('Restored original device properties');
        }
    });
}

// Expose openSpoofPopup globally on window object
window.openSpoofPopup = openSpoofPopup;

// Document-wide Event Delegation for dynamically loaded trigger elements
document.addEventListener('click', (e) => {
    const spoofBtn = e.target.closest('#spoof-btn');
    if (spoofBtn) {
        e.preventDefault();
        openSpoofPopup();
    }
});

})();
