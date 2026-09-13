/**
 * MTK AI Engine - Futuristic Floating Assistant & Toggle
 * Features:
 * 1. Futuristic glowing circle UI (Cyan for AI, Orange for Manual)
 * 2. Short Tap: Toggles AI/Manual mode (writes/deletes /sdcard/MTK_AI_Engine/ai_mode)
 * 3. Long Press: Opens Keyless AI Chat Assistant (Puter.js)
 * 4. Draggable with edge snapping & position persistence
 */
(function() {
    'use strict';

    const STATE_FILE = '/sdcard/MTK_AI_Engine/ai_mode';
    const STORAGE_KEY = 'mtk_ai_assistant_pos';
    
    let isAIMode = false;
    let isDragging = false;
    let hasMoved = false;
    let dragStart = { x: 0, y: 0, time: 0 };
    let longPressTimer = null;

    // ==========================================
    // 🔧 EXECUTE SHELL COMMAND (KernelSU pattern)
    // ==========================================
    const execFn = window.exec || async function(cmd, timeout = 10000) {
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
    // 🎨 INJECT FUTURISTIC CSS
    // ==========================================
    function injectStyles() {
        if (document.getElementById('mtk-ai-styles')) return;
        const style = document.createElement('style');
        style.id = 'mtk-ai-styles';
        style.textContent = `
            .mtk-ai-btn {
                position: fixed; width: 64px; height: 64px; border-radius: 50%;
                cursor: grab; user-select: none; z-index: 99999;
                display: flex; align-items: center; justify-content: center;
                transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.3s ease, background 0.4s ease;
                touch-action: none; backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
                border: 2px solid rgba(255, 255, 255, 0.3);
            }
            .mtk-ai-btn:active { cursor: grabbing; }
            .mtk-ai-btn:hover { transform: scale(1.08); }
            
            /* AI Mode - Cyan/Blue Neon */
            .mtk-ai-btn.ai-mode {
                background: radial-gradient(circle at 30% 30%, rgba(0, 229, 255, 0.9) 0%, rgba(0, 120, 255, 0.8) 50%, rgba(90, 20, 200, 0.9) 100%);
                box-shadow: 0 0 20px rgba(0, 229, 255, 0.7), 0 0 40px rgba(0, 120, 255, 0.5), 0 0 60px rgba(90, 20, 200, 0.3), inset 0 0 15px rgba(255, 255, 255, 0.4);
                animation: mtk-pulse-ai 2.5s ease-in-out infinite;
            }
            /* Manual Mode - Orange/Red Neon */
            .mtk-ai-btn.manual-mode {
                background: radial-gradient(circle at 30% 30%, rgba(255, 180, 50, 0.9) 0%, rgba(255, 90, 50, 0.8) 50%, rgba(200, 30, 80, 0.9) 100%);
                box-shadow: 0 0 20px rgba(255, 180, 50, 0.7), 0 0 40px rgba(255, 90, 50, 0.5), 0 0 60px rgba(200, 30, 80, 0.3), inset 0 0 15px rgba(255, 255, 255, 0.4);
                animation: mtk-pulse-manual 2.5s ease-in-out infinite;
            }
            @keyframes mtk-pulse-ai {
                0%, 100% { box-shadow: 0 0 20px rgba(0, 229, 255, 0.7), 0 0 40px rgba(0, 120, 255, 0.5), 0 0 60px rgba(90, 20, 200, 0.3), inset 0 0 15px rgba(255, 255, 255, 0.4); }
                50% { box-shadow: 0 0 30px rgba(0, 229, 255, 0.9), 0 0 60px rgba(0, 120, 255, 0.7), 0 0 90px rgba(90, 20, 200, 0.5), inset 0 0 20px rgba(255, 255, 255, 0.6); }
            }
            @keyframes mtk-pulse-manual {
                0%, 100% { box-shadow: 0 0 20px rgba(255, 180, 50, 0.7), 0 0 40px rgba(255, 90, 50, 0.5), 0 0 60px rgba(200, 30, 80, 0.3), inset 0 0 15px rgba(255, 255, 255, 0.4); }
                50% { box-shadow: 0 0 30px rgba(255, 180, 50, 0.9), 0 0 60px rgba(255, 90, 50, 0.7), 0 0 90px rgba(200, 30, 80, 0.5), inset 0 0 20px rgba(255, 255, 255, 0.6); }
            }
            .mtk-ai-btn .mtk-ai-icon { width: 32px; height: 32px; position: relative; pointer-events: none; }
            .mtk-ai-btn .mtk-ai-icon svg { width: 100%; height: 100%; filter: drop-shadow(0 0 4px rgba(255, 255, 255, 0.8)); }
            .mtk-ai-btn::before {
                content: ''; position: absolute; inset: -6px; border-radius: 50%;
                border: 1.5px dashed rgba(255, 255, 255, 0.5); animation: mtk-orbit 8s linear infinite; pointer-events: none;
            }
            @keyframes mtk-orbit { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

            /* Toast Notification */
            .mtk-ai-toast {
                position: fixed; top: 40px; left: 50%; transform: translateX(-50%) translateY(-100px);
                padding: 14px 28px; border-radius: 50px; color: #fff; font-family: system-ui, sans-serif;
                font-weight: 600; font-size: 15px; letter-spacing: 0.5px; z-index: 100000;
                backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
                border: 1px solid rgba(255, 255, 255, 0.3); opacity: 0;
                transition: transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.3s ease;
                pointer-events: none; white-space: nowrap;
            }
            .mtk-ai-toast.show { transform: translateX(-50%) translateY(0); opacity: 1; }
            .mtk-ai-toast.ai { background: linear-gradient(135deg, rgba(0, 229, 255, 0.85), rgba(90, 20, 200, 0.85)); box-shadow: 0 8px 32px rgba(0, 120, 255, 0.5); }
            .mtk-ai-toast.manual { background: linear-gradient(135deg, rgba(255, 180, 50, 0.85), rgba(200, 30, 80, 0.85)); box-shadow: 0 8px 32px rgba(255, 90, 50, 0.5); }

            /* Chat Modal */
            .mtk-ai-modal {
                position: fixed; inset: 0; background: rgba(0,0,0,0.85); z-index: 100001;
                display: flex; align-items: center; justify-content: center; backdrop-filter: blur(8px);
            }
            .mtk-ai-modal-content {
                background: linear-gradient(135deg, #1a1f3a, #2d3561); border: 2px solid #8b5cf6;
                border-radius: 20px; padding: 24px; width: 95%; max-width: 500px; height: 80vh;
                display: flex; flex-direction: column; box-shadow: 0 0 40px rgba(139,92,246,0.2);
            }
        `;
        document.head.appendChild(style);
    }

    // ==========================================
    // 🔄 STATE MANAGEMENT
    // ==========================================
    async function checkState() {
        try {
            const result = await execFn(`test -f "${STATE_FILE}" && echo "1" || echo "0"`);
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
                await execFn(`mkdir -p /sdcard/MTK_AI_Engine && echo "1" > "${STATE_FILE}"`);
            } else {
                await execFn(`rm -f "${STATE_FILE}"`);
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
        
        // Update icon based on mode
        const iconSvg = isAIMode 
            ? `<path d="M12 2L14.5 8.5L21 11L14.5 13.5L12 20L9.5 13.5L3 11L9.5 8.5L12 2Z" fill="white" stroke="white" stroke-width="0.5"/>`
            : `<path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8z"/><path d="M12 6v6l4 2"/><circle cx="12" cy="12" r="3" fill="white"/>`;
        
        btn.querySelector('.mtk-ai-icon svg').innerHTML = iconSvg;
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
        void toast.offsetWidth; // force reflow
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
        btn.innerHTML = `<div class="mtk-ai-icon"><svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"></svg></div>`;
        
        // Restore position
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

    // ==========================================
    // 🖱️ DRAG & CLICK LOGIC
    // ==========================================
    function setupDragLogic(btn) {
        let startX, startY, initialLeft, initialTop;

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
            if (e.cancelable) e.preventDefault();

            // Long press for chat
            longPressTimer = setTimeout(() => {
                if (isDragging && !hasMoved) {
                    openAIChat();
                    isDragging = false; // cancel drag after long press
                }
            }, 600);
        };

        const onMove = (e) => {
            if (!isDragging) return;
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const clientY = e.touches ? e.touches[0].clientY : e.clientY;
            const dx = clientX - startX;
            const dy = clientY - startY;
            
            if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
                hasMoved = true;
                clearTimeout(longPressTimer);
            }

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
            if (e.cancelable) e.preventDefault();
        };

        const onEnd = (e) => {
            if (!isDragging) return;
            clearTimeout(longPressTimer);
            isDragging = false;
            btn.style.transform = 'scale(1)';
            btn.style.transition = 'all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)';
            
            // Save position
            const rect = btn.getBoundingClientRect();
            localStorage.setItem(STORAGE_KEY, JSON.stringify({ x: rect.left, y: rect.top }));

            // If it was a quick tap without moving, toggle state
            const elapsed = Date.now() - dragStart.time;
            if (!hasMoved && elapsed < 500) {
                toggleState();
            } else if (hasMoved) {
                snapToEdge(btn);
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
    // 🤖 AI CHAT MODAL (Puter.js)
    // ==========================================
    function loadPuterLibrary() {
        return new Promise((resolve, reject) => {
            if (window.puter) return resolve();
            const script = document.createElement('script');
            script.src = 'https://js.puter.com/v2/';
            script.onload = () => resolve();
            script.onerror = () => reject(new Error("Failed to load Puter.js"));
            document.head.appendChild(script);
        });
    }

    async function getSystemContext() {
        try {
            const [model, androidVer, ramTotal, chip, memFree] = await Promise.all([
                execFn('getprop ro.product.model', 2000),
                execFn('getprop ro.build.version.release', 2000),
                execFn('grep MemTotal /proc/meminfo | awk \'{print $2}\'', 2000),
                execFn('getprop ro.hardware.chipname 2>/dev/null || getprop ro.mediatek.platform 2>/dev/null', 2000),
                execFn('grep MemFree /proc/meminfo | awk \'{print $2}\'', 2000)
            ]);
            const ramMB = Math.round(parseInt(ramTotal || 0) / 1024);
            const freeMB = Math.round(parseInt(memFree || 0) / 1024);
            return `Device: ${model.trim()} | Android: ${androidVer.trim()} | Chip: ${chip.trim() || 'Unknown'} | RAM: ${ramMB}MB Total, ${freeMB}MB Free`;
        } catch (e) {
            return 'Unable to fetch system context.';
        }
    }

    function openAIChat() {
        if (document.getElementById('mtk-ai-chat-modal')) return;

        const modal = document.createElement('div');
        modal.id = 'mtk-ai-chat-modal';
        modal.className = 'mtk-ai-modal';
        modal.innerHTML = `
            <div class="mtk-ai-modal-content">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:15px;">
                    <h3 style="color:#8b5cf6;margin:0;font-size:20px;">🤖 MTK AI Assistant</h3>
                    <button id="mtk-ai-close-btn" style="background:rgba(255,255,255,0.1);border:none;color:#fff;width:32px;height:32px;border-radius:50%;cursor:pointer;font-size:16px;">✕</button>
                </div>
                <div id="mtk-ai-chat-box" style="flex:1;overflow-y:auto;background:rgba(0,0,0,0.3);border-radius:12px;padding:12px;margin-bottom:15px;display:flex;flex-direction:column;gap:10px;">
                    <div style="background:rgba(139,92,246,0.1);padding:10px;border-radius:10px;color:#e0e7ff;font-size:13px;align-self:flex-start;max-width:85%;">
                        Hello! I'm your MTK AI Assistant. Long-pressed me to open this. I can help you optimize your device, troubleshoot errors, or explain module features. What would you like to know?
                    </div>
                </div>
                <div style="display:flex;gap:8px;">
                    <input type="text" id="mtk-ai-input" placeholder="Ask about optimization, errors..." style="flex:1;padding:12px;background:rgba(0,0,0,0.4);border:1px solid #8b5cf6;border-radius:10px;color:#fff;font-size:13px;outline:none;">
                    <button id="mtk-ai-send-btn" style="padding:12px 20px;background:#8b5cf6;color:#fff;border:none;border-radius:10px;font-weight:600;cursor:pointer;">Send</button>
                </div>
                <div style="text-align:center;margin-top:10px;">
                    <span style="font-size:10px;color:#6b7280;">Powered by Keyless Cloud AI Engine</span>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        document.getElementById('mtk-ai-close-btn').onclick = () => modal.remove();
        document.getElementById('mtk-ai-send-btn').onclick = handleChatSend;
        document.getElementById('mtk-ai-input').addEventListener('keypress', (e) => { if (e.key === 'Enter') handleChatSend(); });
    }

    function addChatMessage(text, sender) {
        const chatBox = document.getElementById('mtk-ai-chat-box');
        if (!chatBox) return;
        const msgDiv = document.createElement('div');
        const isUser = sender === 'user';
        msgDiv.style.cssText = `padding:10px 14px;border-radius:12px;font-size:13px;max-width:85%;word-wrap:break-word;white-space:pre-wrap;align-self:${isUser ? 'flex-end' : 'flex-start'};background:${isUser ? '#8b5cf6' : 'rgba(139,92,246,0.1)'};color:${isUser ? '#fff' : '#e0e7ff'};`;
        msgDiv.textContent = text;
        chatBox.appendChild(msgDiv);
        chatBox.scrollTop = chatBox.scrollHeight;
    }

    async function handleChatSend() {
        const input = document.getElementById('mtk-ai-input');
        const userText = input.value.trim();
        if (!userText) return;

        input.value = '';
        addChatMessage(userText, 'user');
        
        const loadingMsg = document.createElement('div');
        loadingMsg.style.cssText = 'padding:10px 14px;border-radius:12px;font-size:13px;background:rgba(139,92,246,0.1);color:#e0e7ff;align-self:flex-start;';
        loadingMsg.textContent = '🤔 Thinking...';
        document.getElementById('mtk-ai-chat-box').appendChild(loadingMsg);

        try {
            await loadPuterLibrary();
            const systemContext = await getSystemContext();
            const fullPrompt = `System Context: You are an expert Android system optimizer for MTK_AI_Engine. Device Info: ${systemContext}.\n\nUser Question: ${userText}`;
            
            const response = await puter.ai.chat(fullPrompt);
            loadingMsg.remove();
            
            let responseText = '';
            if (typeof response === 'string') responseText = response.trim();
            else if (response && response.message && response.message.content) responseText = response.message.content.trim();
            else responseText = String(response);
            
            addChatMessage(responseText, 'ai');
        } catch (e) {
            loadingMsg.remove();
            addChatMessage(`❌ Error: ${e.message}`, 'ai');
        }
    }

    // ==========================================
    // 🚀 INITIALIZATION
    // ==========================================
    async function init() {
        injectStyles();
        createFloatingButton();
        await checkState();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    window.MTKAIAssistant = { openChat: openAIChat, toggle: toggleState };
})();