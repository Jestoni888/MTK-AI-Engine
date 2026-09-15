// renderer.js - Simplified 3-Option Renderer
(function() {
'use strict';

const RENDERER_OPTIONS = [
    { 
        id: 'skiagl', 
        label: 'SkiaGL (Recommended)', 
        desc: 'OpenGL-backed rendering - Stable & compatible',
        value: 'skiagl',
        safe: true
    },
    { 
        id: 'skiavk', 
        label: 'SkiaVulkan', 
        desc: 'Vulkan-backed rendering - Better performance, less stable',
        value: 'skiavk',
        safe: false
    },
    { 
        id: 'opengl', 
        label: 'OpenGL (Legacy)', 
        desc: 'Legacy OpenGL ES - Safe fallback for old devices',
        value: 'opengl',
        safe: true
    }
];

// === STATE ===
let state = { global: 'skiagl' };
let modalOverlay = null;

// === CONFIG ===
const CONFIG = {
    storagePath: '/sdcard/MTK_AI_Engine',
    configFile: 'manual_renderer.txt'
};

// === KERNELSU EXECUTION ===
const execFn = window.exec || async function(cmd, timeout = 10000) {
    return new Promise(resolve => {
        const cb = `renderer_exec_${Date.now()}_${Math.random().toString(36).substring(2)}`;
        const t = setTimeout(() => { delete window[cb]; resolve(''); }, timeout);
        window[cb] = (_, res) => { clearTimeout(t); delete window[cb]; resolve(res || ''); };
        if (window.ksu) ksu.exec(cmd, `window.${cb}`);
        else { clearTimeout(t); resolve(''); }
    });
};

// === APPLY RENDERER ===
async function applyRenderer(rendererId) {
    const opt = RENDERER_OPTIONS.find(o => o.id === rendererId);
    if (!opt) return false;

    try {
        // Apply the renderer property
        const result = await execFn(`setprop debug.hwui.renderer "${opt.value}"`);
        console.log(`[Renderer] Applied: ${opt.value}`);

        // Save to config file
        await execFn(`mkdir -p ${CONFIG.storagePath}`);
        await execFn(`echo '${opt.value}' > ${CONFIG.storagePath}/${CONFIG.configFile}`);
        
        // Save state
        state.global = rendererId;
        localStorage.setItem('renderer_settings', JSON.stringify(state));
        
        return true;
    } catch (e) {
        console.error('[Renderer] Apply failed:', e);
        return false;
    }
}

// === LOAD STATE ===
function loadState() {
    try {
        const saved = localStorage.getItem('renderer_settings');
        if (saved) {
            const parsed = JSON.parse(saved);
            state = { global: parsed.global || 'skiagl' };
        }
        
        // Load from config file
        (async () => {
            const savedValue = await execFn(`cat ${CONFIG.storagePath}/${CONFIG.configFile} 2>/dev/null`);
            const trimmed = savedValue?.trim();
            const opt = RENDERER_OPTIONS.find(o => o.value === trimmed);
            if (opt) {
                state.global = opt.id;
                saveState();
            }
        })();
    } catch (e) {
        state = { global: 'skiagl' };
    }
}

function saveState() {
    localStorage.setItem('renderer_settings', JSON.stringify(state));
    updateMainButton();
}

function updateMainButton() {
    const val = document.getElementById('renderer-val');
    if (!val) return;
    const opt = RENDERER_OPTIONS.find(o => o.id === state.global);
    const icon = opt?.safe ? '✅' : '⚠️';
    val.innerHTML = `${icon} ${opt ? opt.label : 'SkiaGL'} <i class="fas fa-chevron-right"></i>`;
}

// === MODAL UI ===
function createModal() {
    if (modalOverlay) return modalOverlay.querySelector('#modal-content');
    
    modalOverlay = document.createElement('div');
    modalOverlay.id = 'renderer-modal-overlay';
    Object.assign(modalOverlay.style, {
        position: 'fixed', top: '0', left: '0', width: '100%', height: '100%',
        background: 'rgba(0,0,0,0.85)', zIndex: '9999', display: 'flex',
        alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(5px)',
        opacity: '0', transition: 'opacity 0.3s ease'
    });

    const modal = document.createElement('div');
    Object.assign(modal.style, {
        background: 'linear-gradient(135deg, #1a1f3a, #2d3561)', borderRadius: '20px',
        width: '95%', maxWidth: '450px', maxHeight: '80vh', overflow: 'hidden',
        display: 'flex', flexDirection: 'column', boxShadow: '0 0 40px rgba(139, 92, 246, 0.2)',
        border: '2px solid rgba(139, 92, 246, 0.5)'
    });

    const header = document.createElement('div');
    header.innerHTML = `
        <h3 style="margin:0; color:#8b5cf6; font-weight:600; font-size:18px;">Renderer Selection</h3>
        <button id="close-renderer-modal" style="background:none; border:none; color:#888; font-size:20px; cursor:pointer; padding:5px;">
            <i class="fas fa-times"></i>
        </button>
    `;
    Object.assign(header.style, {
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '20px', borderBottom: '1px solid rgba(255,255,255,0.1)'
    });

    const content = document.createElement('div');
    content.id = 'modal-content';
    Object.assign(content.style, { flex: '1', overflowY: 'auto', padding: '20px' });

    modal.appendChild(header);
    modal.appendChild(content);
    modalOverlay.appendChild(modal);
    document.body.appendChild(modalOverlay);

    document.getElementById('close-renderer-modal').addEventListener('click', closeModal);
    modalOverlay.addEventListener('click', (e) => { if (e.target === modalOverlay) closeModal(); });

    setTimeout(() => { modalOverlay.style.opacity = '1'; }, 10);
    return content;
}

function closeModal() {
    if (!modalOverlay) return;
    modalOverlay.style.opacity = '0';
    setTimeout(() => { modalOverlay.remove(); modalOverlay = null; }, 300);
}

// === RENDER MAIN VIEW ===
async function renderMainView(container) {
    container.innerHTML = '';

    // Info box
    const infoBox = document.createElement('div');
    infoBox.style.cssText = 'background:rgba(139,92,246,0.1); border:1px solid rgba(139,92,246,0.3); border-radius:10px; padding:12px; margin-bottom:15px; font-size:12px; color:#aaa;';
    infoBox.innerHTML = `
        <strong>📝 Config File:</strong> ${CONFIG.storagePath}/${CONFIG.configFile}<br>
        <strong>💡 Tip:</strong> SkiaGL is recommended for most devices
    `;
    container.appendChild(infoBox);

    // Status display
    const statusEl = document.createElement('div');
    statusEl.id = 'apply-status';
    statusEl.style.cssText = 'margin-bottom:15px; font-size:12px; color:#888; display:none;';
    container.appendChild(statusEl);

    // Renderer options
    RENDERER_OPTIONS.forEach(opt => {
        const item = document.createElement('div');
        const isSelected = state.global === opt.id;
        const badge = opt.safe 
            ? '<span style="background:#32D74B; color:#000; padding:2px 8px; border-radius:10px; font-size:10px; margin-left:8px;">SAFE</span>'
            : '<span style="background:#f59e0b; color:#000; padding:2px 8px; border-radius:10px; font-size:10px; margin-left:8px;">TEST</span>';

        Object.assign(item.style, {
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '15px', borderRadius: '12px', marginBottom: '10px', cursor: 'pointer',
            background: isSelected ? 'rgba(139, 92, 246, 0.2)' : 'rgba(255,255,255,0.05)',
            border: isSelected ? '1px solid rgba(139, 92, 246, 0.5)' : '1px solid transparent',
            transition: 'all 0.2s ease'
        });

        item.innerHTML = `
            <div style="flex:1;">
                <div style="color:#fff; font-weight:500; margin-bottom:3px;">
                    ${opt.label}${badge}
                </div>
                <div style="color:#888; font-size:12px;">${opt.desc}</div>
            </div>
            <div style="color:${isSelected ? '#8b5cf6' : '#444'};">
                <i class="fas ${isSelected ? 'fa-check-circle' : 'fa-circle'}"></i>
            </div>
        `;

        item.addEventListener('click', async () => {
            // Show applying status
            statusEl.style.display = 'block';
            statusEl.innerHTML = `<span style="color:#8b5cf6;">🔄 Applying ${opt.label}...</span>`;

            // Apply renderer
            const success = await applyRenderer(opt.id);
            
            if (success) {
                statusEl.innerHTML = `<span style="color:#32D74B;">✅ Applied: ${opt.value}</span><br>
                    <small style="color:#888;"><i>Reboot recommended for full effect</i></small>`;
                renderMainView(container); // Refresh to show selection
            } else {
                statusEl.innerHTML = `<span style="color:#FF453A;">❌ Failed to apply</span>`;
            }
        });

        container.appendChild(item);
    });

    // Reset button
    const resetBtn = document.createElement('button');
    resetBtn.style.cssText = 'width:100%; padding:10px; margin-top:10px; background:rgba(239,68,68,0.2); color:#fca5a5; border:1px solid rgba(239,68,68,0.4); border-radius:10px; font-size:12px; cursor:pointer;';
    resetBtn.innerHTML = '🔄 Reset to Default (Clear Config)';
    resetBtn.addEventListener('click', async () => {
        await execFn(`rm -f ${CONFIG.storagePath}/${CONFIG.configFile}`);
        await execFn(`setprop debug.hwui.renderer ""`);
        state.global = 'skiagl';
        saveState();
        statusEl.style.display = 'block';
        statusEl.innerHTML = `<span style="color:#32D74B;">✅ Reset to system default</span>`;
        setTimeout(() => renderMainView(container), 500);
    });
    container.appendChild(resetBtn);
}

// === INIT ===
function init() {
    const btn = document.getElementById('renderer-item');
    if (!btn) {
        console.warn('[Renderer] Button not found');
        return;
    }

    // Ensure storage path exists
    (async () => {
        await execFn(`mkdir -p ${CONFIG.storagePath}`);
    })();

    loadState();
    updateMainButton();

    btn.addEventListener('click', async () => {
        const container = createModal();
        await renderMainView(container);
    });

    console.log('[Renderer] Initialized - Simplified 3-Option Mode');
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

// Export for external use
window.RendererConfig = {
    state,
    applyRenderer,
    RENDERER_OPTIONS,
    CONFIG
};

})();