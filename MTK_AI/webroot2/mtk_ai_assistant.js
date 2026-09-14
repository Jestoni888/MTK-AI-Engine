/**
MTK AI Engine - Pure Earth Floating Button with Draggable Exit
Short tap = Toggle AI/Manual Mode | Drag to move | Drag to bottom to hide
Swipe up from bottom edge or double-tap bottom to restore
*/
(function() {
'use strict';
const STATE_DIR = '/sdcard/MTK_AI_Engine';
const STORAGE_KEY = 'mtk_ai_assistant_pos';
let isAIMode = false;
let isDragging = false;
let hasMoved = false;
let dragStart = { x: 0, y: 0, time: 0 };

// ==========================================
// 🔧 KERNELSU EXEC WRAPPER
// ==========================================
const execFn = window.exec || async function(cmd, timeout = 15000) {
    return new Promise(resolve => {
        const cb = `mtk_ai_${Date.now()}_${Math.random().toString(36).substring(2)}`;
        const t = setTimeout(() => { delete window[cb]; resolve(''); }, timeout);
        window[cb] = (_, res) => { clearTimeout(t); delete window[cb]; resolve(res || ''); };
        if (window.ksu) {
            ksu.exec(cmd, `window.${cb}`);
        } else {
            clearTimeout(t);
            resolve('');
        }
    });
};

// ==========================================
//  INJECT STYLES
// ==========================================
function injectStyles() {
    if (document.getElementById('mtk-ai-styles')) return;
    const style = document.createElement('style');
    style.id = 'mtk-ai-styles';
    style.textContent = `
        .mtk-ai-btn {
            position: fixed; width: 48px; height: 48px; border-radius: 50%;
            cursor: grab; user-select: none; z-index: 99999;
            display: flex; align-items: center; justify-content: center;
            transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.3s ease, background 0.4s ease;
            touch-action: none; backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
            border: 1.5px solid rgba(255, 255, 255, 0.35);
        }
        .mtk-ai-btn:active { cursor: grabbing; }
        .mtk-ai-btn:hover { transform: scale(1.08); }
        .mtk-ai-btn.ai-mode {
            background: radial-gradient(circle at 30% 30%, rgba(0, 229, 255, 0.9) 0%, rgba(0, 120, 255, 0.8) 50%, rgba(90, 20, 200, 0.9) 100%);
            box-shadow: 0 0 15px rgba(0, 229, 255, 0.6), 0 0 30px rgba(0, 120, 255, 0.4), inset 0 0 10px rgba(255, 255, 255, 0.3);
        }
        .mtk-ai-btn.manual-mode {
            background: radial-gradient(circle at 30% 30%, rgba(255, 180, 50, 0.9) 0%, rgba(255, 90, 50, 0.8) 50%, rgba(200, 30, 80, 0.9) 100%);
            box-shadow: 0 0 15px rgba(255, 180, 50, 0.6), 0 0 30px rgba(255, 90, 50, 0.4), inset 0 0 10px rgba(255, 255, 255, 0.3);
        }
        .mtk-ai-btn .mtk-ai-icon {
            width: 32px; height: 32px; pointer-events: none;
            animation: mtk-earth-spin 10s linear infinite;
        }
        .mtk-ai-btn .mtk-ai-icon svg {
            width: 100%; height: 100%;
            filter: drop-shadow(0 0 3px rgba(255, 255, 255, 0.8));
        }
        @keyframes mtk-earth-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        
        .mtk-ai-btn::before {
            content: ''; position: absolute; inset: -4px; border-radius: 50%;
            border: 1px dashed rgba(255, 255, 255, 0.4);
            animation: mtk-orbit 12s linear infinite; pointer-events: none;
        }
        @keyframes mtk-orbit { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

        /* Exit Zone */
        #mtk-ai-exit-zone {
            position: fixed; bottom: 40px; left: 50%; transform: translateX(-50%) scale(0);
            width: 64px; height: 64px; border-radius: 50%;
            background: rgba(220, 38, 38, 0.85); border: 2px solid rgba(255,255,255,0.5);
            display: flex; align-items: center; justify-content: center;
            transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
            z-index: 99998; pointer-events: none; opacity: 0;
            box-shadow: 0 4px 20px rgba(220, 38, 38, 0.5);
        }
        #mtk-ai-exit-zone.active { transform: translateX(-50%) scale(1); opacity: 1; }
        #mtk-ai-exit-zone.hover { background: rgba(255, 0, 0, 1); transform: translateX(-50%) scale(1.2); }
        #mtk-ai-exit-zone svg { width: 28px; height: 28px; stroke: white; stroke-width: 2; fill: none; }

        /* Bottom Restore Trigger */
        #mtk-ai-bottom-trigger {
            position: fixed; bottom: 0; left: 0; right: 0; height: 20px;
            z-index: 99997; touch-action: none;
        }

        /* Toast */
        .mtk-ai-toast {
            position: fixed; top: 40px; left: 50%; transform: translateX(-50%) translateY(-100px);
            padding: 12px 24px; border-radius: 50px; color: #fff; font-family: system-ui, sans-serif;
            font-weight: 600; font-size: 14px; z-index: 100000;
            backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
            border: 1px solid rgba(255, 255, 255, 0.3); opacity: 0;
            transition: transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.3s ease;
            pointer-events: none; white-space: nowrap;
        }
        .mtk-ai-toast.show { transform: translateX(-50%) translateY(0); opacity: 1; }
        .mtk-ai-toast.ai { background: linear-gradient(135deg, rgba(0, 229, 255, 0.85), rgba(90, 20, 200, 0.85)); box-shadow: 0 8px 32px rgba(0, 120, 255, 0.5); }
        .mtk-ai-toast.manual { background: linear-gradient(135deg, rgba(255, 180, 50, 0.85), rgba(200, 30, 80, 0.85)); box-shadow: 0 8px 32px rgba(255, 90, 50, 0.5); }
    `;
    document.head.appendChild(style);
}

// ==========================================
// 🌍 PURE EARTH SVG ICON
// ==========================================
const earthSvg = `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <defs>
        <radialGradient id="earthOcean" cx="35%" cy="35%">
            <stop offset="0%" stop-color="#4FC3F7"/>
            <stop offset="60%" stop-color="#1976D2"/>
            <stop offset="100%" stop-color="#0D47A1"/>
        </radialGradient>
    </defs>
    <circle cx="50" cy="50" r="46" fill="url(#earthOcean)" stroke="rgba(255,255,255,0.5)" stroke-width="1"/>
    <path d="M30 25 Q35 22 40 26 Q44 30 42 36 Q38 40 32 38 Q26 34 28 28 Z" fill="#4CAF50" opacity="0.95"/>
    <path d="M55 22 Q62 20 66 26 Q68 32 62 36 Q56 34 54 28 Z" fill="#4CAF50" opacity="0.95"/>
    <path d="M20 48 Q28 44 36 48 Q40 54 34 60 Q26 62 20 56 Z" fill="#4CAF50" opacity="0.95"/>
    <path d="M58 46 Q68 44 74 50 Q76 58 68 62 Q60 60 56 54 Z" fill="#4CAF50" opacity="0.95"/>
    <path d="M40 70 Q48 66 56 70 Q58 78 50 82 Q42 80 40 74 Z" fill="#4CAF50" opacity="0.95"/>
    <path d="M5 50 Q50 44 95 50" fill="none" stroke="rgba(255,255,255,0.3)" stroke-width="0.8"/>
    <path d="M10 30 Q50 26 90 30" fill="none" stroke="rgba(255,255,255,0.2)" stroke-width="0.6"/>
    <path d="M10 70 Q50 74 90 70" fill="none" stroke="rgba(255,255,255,0.2)" stroke-width="0.6"/>
    <path d="M50 4 Q44 50 50 96" fill="none" stroke="rgba(255,255,255,0.2)" stroke-width="0.6"/>
    <path d="M50 4 Q56 50 50 96" fill="none" stroke="rgba(255,255,255,0.2)" stroke-width="0.6"/>
</svg>`;

const exitSvg = `<svg viewBox="0 0 24 24"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2M10 11v6M14 11v6"/></svg>`;

// ==========================================
//  STATE MANAGEMENT
// ==========================================
async function checkState() {
    try {
        const result = await execFn(`test -f "${STATE_DIR}/ai_mode" && echo "1" || echo "0"`);
        isAIMode = result.trim() === '1';
    } catch (e) {
        isAIMode = localStorage.getItem('mtk_ai_mode') === 'ai';
    }
    updateVisual();
}

async function toggleState() {
    isAIMode = !isAIMode;
    try {
        if (isAIMode) {
            await execFn(`mkdir -p "${STATE_DIR}" && echo "1" > "${STATE_DIR}/ai_mode"`);
        } else {
            await execFn(`rm -f "${STATE_DIR}/ai_mode"`);
        }
    } catch (e) {
        console.warn('State file operation failed:', e);
    }
    localStorage.setItem('mtk_ai_mode', isAIMode ? 'ai' : 'manual');
    updateVisual();
    showToast();
}

function updateVisual() {
    const btn = document.getElementById('mtk-ai-fab');
    if (!btn) return;
    btn.classList.remove('ai-mode', 'manual-mode');
    btn.classList.add(isAIMode ? 'ai-mode' : 'manual-mode');
}

function showToast() {
    let toast = document.getElementById('mtk-ai-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'mtk-ai-toast';
        toast.className = 'mtk-ai-toast';
        document.body.appendChild(toast);
    }
    toast.className = `mtk-ai-toast ${isAIMode ? 'ai' : 'manual'}`;
    toast.textContent = isAIMode ? '✨ AI Activated' : '🎮 Manual Mode Activated';
    void toast.offsetWidth;
    toast.classList.add('show');
    clearTimeout(window._mtk_toast_timer);
    window._mtk_toast_timer = setTimeout(() => toast.classList.remove('show'), 2200);
}

// ==========================================
// 🏗️ BUILD UI
// ==========================================
function createFloatingButton() {
    if (document.getElementById('mtk-ai-fab')) return;
    const btn = document.createElement('div');
    btn.id = 'mtk-ai-fab';
    btn.className = 'mtk-ai-btn';
    btn.innerHTML = `<div class="mtk-ai-icon">${earthSvg}</div>`;
    try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
        if (saved && typeof saved.x === 'number') {
            btn.style.left = saved.x + 'px';
            btn.style.top = saved.y + 'px';
        } else {
            btn.style.right = '24px';
            btn.style.bottom = '100px';
        }
    } catch (e) {
        btn.style.right = '24px';
        btn.style.bottom = '100px';
    }
    document.body.appendChild(btn);
    setupDragLogic(btn);
}

function createExitZone() {
    if (document.getElementById('mtk-ai-exit-zone')) return;
    const zone = document.createElement('div');
    zone.id = 'mtk-ai-exit-zone';
    zone.innerHTML = exitSvg;
    document.body.appendChild(zone);
}

function createBottomTrigger() {
    if (document.getElementById('mtk-ai-bottom-trigger')) return;
    const trigger = document.createElement('div');
    trigger.id = 'mtk-ai-bottom-trigger';
    document.body.appendChild(trigger);
    
    let startY = 0;
    let lastTap = 0;
    
    const restore = () => {
        const btn = document.getElementById('mtk-ai-fab');
        if (btn && btn.style.display === 'none') {
            btn.style.display = 'flex';
            btn.style.transform = 'scale(0)';
            setTimeout(() => btn.style.transform = 'scale(1)', 10);
        }
    };

    trigger.addEventListener('touchstart', (e) => { 
        startY = e.touches[0].clientY; 
        const now = Date.now();
        if (now - lastTap < 300) restore();
        lastTap = now;
    });
    trigger.addEventListener('touchend', (e) => {
        const endY = e.changedTouches[0].clientY;
        if (startY - endY > 10) restore(); // Swipe up
    });
}

// ==========================================
// 🖱️ DRAG & EXIT LOGIC
// ==========================================
function setupDragLogic(btn) {
    let startX, startY, initialLeft, initialTop;
    const exitZone = document.getElementById('mtk-ai-exit-zone');
    
    const isOverExit = (clientX, clientY) => {
        const rect = exitZone.getBoundingClientRect();
        return (clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom);
    };

    const onStart = (e) => {
        isDragging = true;
        hasMoved = false;
        dragStart.time = Date.now();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        startX = clientX;
        startY = clientY;
        const rect = btn.getBoundingClientRect();
        initialLeft = rect.left;
        initialTop = rect.top;
        btn.style.transition = 'none';
        btn.style.transform = 'scale(1.1)';
        exitZone.classList.add('active');
        if (e.cancelable) e.preventDefault();
    };

    const onMove = (e) => {
        if (!isDragging) return;
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        const dx = clientX - startX;
        const dy = clientY - startY;
        if (Math.abs(dx) > 5 || Math.abs(dy) > 5) hasMoved = true;
        
        let newLeft = initialLeft + dx;
        let newTop = initialTop + dy;
        const maxLeft = window.innerWidth - btn.offsetWidth;
        const maxTop = window.innerHeight - btn.offsetHeight;
        newLeft = Math.max(0, Math.min(newLeft, maxLeft));
        newTop = Math.max(0, Math.min(newTop, maxTop));
        
        btn.style.left = newLeft + 'px';
        btn.style.top = newTop + 'px';
        btn.style.right = 'auto';
        btn.style.bottom = 'auto';
        
        if (isOverExit(clientX, clientY)) {
            exitZone.classList.add('hover');
        } else {
            exitZone.classList.remove('hover');
        }
        if (e.cancelable) e.preventDefault();
    };

    const onEnd = (e) => {
        if (!isDragging) return;
        isDragging = false;
        btn.style.transform = 'scale(1)';
        btn.style.transition = 'all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)';
        
        const clientX = e.changedTouches ? e.changedTouches[0].clientX : startX;
        const clientY = e.changedTouches ? e.changedTouches[0].clientY : startY;
        
        exitZone.classList.remove('active', 'hover');
        
        if (isOverExit(clientX, clientY)) {
            // Hide button
            btn.style.display = 'none';
            localStorage.removeItem(STORAGE_KEY);
        } else {
            const rect = btn.getBoundingClientRect();
            localStorage.setItem(STORAGE_KEY, JSON.stringify({ x: rect.left, y: rect.top }));
            const elapsed = Date.now() - dragStart.time;
            if (!hasMoved && elapsed < 500) {
                toggleState();
            } else if (hasMoved) {
                snapToEdge(btn);
            }
        }
    };

    btn.addEventListener('touchstart', onStart, { passive: false });
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onEnd);
    btn.addEventListener('mousedown', onStart);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onEnd);
}

function snapToEdge(btn) {
    const rect = btn.getBoundingClientRect();
    const midX = rect.left + rect.width / 2;
    const targetLeft = midX < window.innerWidth / 2 ? 16 : window.innerWidth - rect.width - 16;
    btn.style.left = targetLeft + 'px';
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ x: targetLeft, y: rect.top }));
}

// ==========================================
// 🚀 INIT
// ==========================================
async function init() {
    injectStyles();
    createExitZone();
    createBottomTrigger();
    createFloatingButton();
    await checkState();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

window.MTKAIAssistant = { toggle: toggleState };
})();