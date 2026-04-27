// refreshrate.js - Refresh Rate Selector (Matches Your HTML)
(function() {
    'use strict';

    const CONFIG_FILE = '/sdcard/MTK_AI_Engine/manual_refresh_lock.txt';
    let availableModes = [];
    let currentMode = null;

    // Use global exec if available (from script.js/front.js)
    const execFn = typeof exec === 'function' ? exec : async function(cmd, timeout = 3000) {
        return new Promise(resolve => {
            const cb = `refresh_exec_${Date.now()}_${Math.random().toString(36).substring(2)}`;
            const t = setTimeout(() => { delete window[cb]; resolve(''); }, timeout);
            window[cb] = (_, res) => { clearTimeout(t); delete window[cb]; resolve(res || ''); };
            if (window.ksu) ksu.exec(cmd, `window.${cb}`);
            else { clearTimeout(t); resolve(''); }
        });
    };

    async function init() {
        await loadAvailableModes();
        await loadSavedMode();
        bindClickHandler();
    }

    async function loadAvailableModes() {
        try {
            // Load modes from your module script (format: ID|Label)
            const raw = await execFn('/data/adb/modules/MTK_AI/script_runner/display_mode 2>/dev/null');
            const lines = raw.trim().split('\n').filter(line => line.includes('|') && line.includes('Hz'));
            
            availableModes = lines.map(line => {
                const [id, label] = line.split('|', 2);
                // Extract Hz number for cleaner display
                const hzMatch = label?.match(/(\d+)Hz/);
                return {
                    id: id.trim(),
                    label: hzMatch ? hzMatch[1] + ' Hz' : (label?.trim() || 'Mode ' + id)
                };
            });
            
            if (availableModes.length === 0) {
                // Fallback modes if script fails
                availableModes = [
                    { id: '0', label: 'Auto' },
                    { id: '60', label: '60 Hz' },
                    { id: '90', label: '90 Hz' },
                    { id: '120', label: '120 Hz' }
                ];
            }        } catch (e) {
            console.warn('Failed to load refresh modes, using fallback:', e);
            availableModes = [
                { id: '0', label: 'Auto' },
                { id: '60', label: '60 Hz' },
                { id: '90', label: '90 Hz' },
                { id: '120', label: '120 Hz' }
            ];
        }
    }

    async function loadSavedMode() {
        try {
            const saved = await execFn(`cat ${CONFIG_FILE} 2>/dev/null`);
            const savedId = saved.trim();
            if (savedId && availableModes.some(m => m.id === savedId)) {
                currentMode = savedId;
                updateDisplay(savedId);
            }
        } catch (e) {
            console.log('No saved refresh mode found');
        }
    }

    function updateDisplay(modeId) {
        const valEl = document.getElementById('refresh-rate-val');
        if (!valEl) return;
        
        const mode = availableModes.find(m => m.id === modeId);
        const text = mode ? mode.label : (modeId === '0' ? 'Auto' : `${modeId} Hz`);
        
        // Update the value display with the selected mode
        valEl.innerHTML = `${text} <i class="fas fa-chevron-right"></i>`;
        valEl.style.color = modeId === '0' ? '#636366' : '#32D74B';
    }

    function bindClickHandler() {
        const item = document.getElementById('refresh-rate-item');
        if (!item) return;
        
        item.style.cursor = 'pointer';
        item.addEventListener('click', () => {
            if (availableModes.length === 0) {
                alert('⏳ Loading available refresh rates...');
                return;
            }
            showModeSelector();
        });
    }
    function showModeSelector() {
        // Remove existing modal if any
        const existing = document.getElementById('refresh-rate-modal');
        if (existing) existing.remove();

        // Create modal backdrop
        const modal = document.createElement('div');
        modal.id = 'refresh-rate-modal';
        modal.style.cssText = `
            position: fixed; inset: 0; background: rgba(0,0,0,0.75); z-index: 10000;
            display: flex; align-items: center; justify-content: center;
            backdrop-filter: blur(4px); animation: fadeIn 0.2s ease;
        `;

        // Create modal content box
        const box = document.createElement('div');
        box.style.cssText = `
            background: #1a1f3a; border: 1px solid #2a3152; border-radius: 16px;
            padding: 24px; width: 90%; max-width: 400px; 
            box-shadow: 0 10px 40px rgba(0,0,0,0.5); animation: slideUp 0.3s ease;
        `;

        // Title
        const title = document.createElement('h3');
        title.textContent = '🔄 Select Refresh Rate';
        title.style.cssText = 'color: #fff; margin: 0 0 16px; font-size: 18px; font-weight: 600; text-align: center;';

        // Current info
        const info = document.createElement('div');
        info.style.cssText = 'color: #8b92b4; font-size: 13px; margin-bottom: 20px; text-align: center;';
        const currentLabel = availableModes.find(m => m.id === currentMode)?.label || 'Auto';
        info.innerHTML = `<strong>Current:</strong> <span style="color: #32D74B">${currentLabel}</span>`;

        // Mode buttons grid
        const grid = document.createElement('div');
        grid.style.cssText = 'display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; margin-bottom: 20px;';

        availableModes.forEach(mode => {
            const btn = document.createElement('button');
            const isCurrent = mode.id === currentMode;
            
            btn.textContent = mode.label;
            btn.style.cssText = `
                padding: 14px 12px; 
                background: ${isCurrent ? 'linear-gradient(135deg, #9b59b6, #8e44ad)' : '#151b2d'};
                color: ${isCurrent ? '#fff' : '#e0e0e0'};
                border: ${isCurrent ? '2px solid #9b59b6' : '1px solid #2a3152'};
                border-radius: 12px; font-size: 13px; font-weight: ${isCurrent ? '700' : '500'};
                cursor: pointer; transition: all 0.2s ease;
            `;            
            // Hover effects
            btn.onmouseenter = () => { 
                if (!isCurrent) {
                    btn.style.background = '#252b45';
                    btn.style.borderColor = '#4a9eff';
                }
            };
            btn.onmouseleave = () => { 
                if (!isCurrent) {
                    btn.style.background = '#151b2d';
                    btn.style.borderColor = '#2a3152';
                }
            };
            
            // Click applies immediately
            btn.onclick = () => applyRefreshMode(mode.id);
            
            grid.appendChild(btn);
        });

        // Close button
        const closeBtn = document.createElement('button');
        closeBtn.textContent = 'Cancel';
        closeBtn.style.cssText = `
            width: 100%; padding: 14px; background: #2a3152; color: #fff;
            border: none; border-radius: 12px; font-size: 14px; font-weight: 600; cursor: pointer;
        `;
        closeBtn.onclick = () => modal.remove();

        // Assemble modal
        box.append(title, info, grid, closeBtn);
        modal.appendChild(box);
        
        // Close on backdrop click
        modal.onclick = e => { if (e.target === modal) modal.remove(); };
        
        // Add animations
        const style = document.createElement('style');
        style.textContent = `
            @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
            @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        `;
        document.head.appendChild(style);
        
        document.body.appendChild(modal);
    }

    async function applyRefreshMode(modeId) {
        const modal = document.getElementById('refresh-rate-modal');        if (modal) modal.remove();

        try {
            // 1. Apply SurfaceFlinger command (your module's method)
            await execFn(`su -c "service call SurfaceFlinger 1035 i32 ${modeId}"`);
            
            // 2. Save to SD card for persistence (service reads this)
            await execFn(`su -c "mkdir -p /sdcard/MTK_AI_Engine && echo '${modeId}' > ${CONFIG_FILE}"`);
            
            // 3. Update state and UI immediately
            currentMode = modeId;
            updateDisplay(modeId);
            
            // 4. Show status feedback if available
            if (typeof showStatus === 'function') {
                const label = availableModes.find(m => m.id === modeId)?.label || `${modeId} Hz`;
                showStatus(`✅ Refresh Rate: ${label}`, '#32D74B');
            }
            
        } catch (e) {
            console.error('Failed to apply refresh mode:', e);
            // Still update UI so user sees their selection
            currentMode = modeId;
            updateDisplay(modeId);
            if (typeof showStatus === 'function') {
                showStatus('⚠️ Applied (verify in logs)', '#FF9F0A');
            } else {
                alert('Applied with warnings. Check logs if issues occur.');
            }
        }
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Expose globally for manual calls
    window.applyRefreshMode = applyRefreshMode;
})();