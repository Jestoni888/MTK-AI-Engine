// animationspeed.js - Display Animation Speed Manager
(function() {
    'use strict';

    const CONFIG_DIR = '/sdcard/MTK_AI_Engine/animation';
    const SETTINGS = [
        { key: 'window_animation_scale', id: 'anim_window', label: 'Window Animation', desc: 'Opening/closing windows' },
        { key: 'transition_animation_scale', id: 'anim_transition', label: 'Transition Animation', desc: 'Activity/screen transitions' },
        { key: 'animator_duration_scale', id: 'anim_animator', label: 'Animator Duration', desc: 'Property animations (e.g. buttons)' },
        { key: 'transition_animation_duration_ratio', id: 'anim_duration_ratio', label: 'MI Transition Ratio', desc: 'Xiaomi-specific transition speed' }
    ];
    
    const OPTIONS = [
        { val: '0.1', label: '0.1×' }, { val: '0.25', label: '0.25×' }, { val: '0.5', label: '0.5×' },
        { val: '0.75', label: '0.75×' }, { val: '1', label: '1.0× (Default)' }, { val: '1.25', label: '1.25×' },
        { val: '1.5', label: '1.5×' }, { val: '1.75', label: '1.75×' }, { val: '2', label: '2.0×' },
        { val: '2.5', label: '2.5×' }, { val: '3', label: '3.0×' }, { val: '', label: 'System Default' }
    ];

    let currentValues = { anim_window: '1', anim_transition: '1', anim_animator: '1', anim_duration_ratio: '1' };

    // Safe exec wrapper
    const execFn = typeof window.exec === 'function' ? window.exec : async function(cmd, timeout = 3000) {
        return new Promise(resolve => {
            const cb = `anim_exec_${Date.now()}_${Math.random().toString(36).substring(2)}`;
            const t = setTimeout(() => { delete window[cb]; resolve(''); }, timeout);
            window[cb] = (_, res) => { clearTimeout(t); delete window[cb]; resolve(res || ''); };
            if (window.ksu) ksu.exec(cmd, `window.${cb}`);
            else { clearTimeout(t); resolve(''); }
        });
    };

    async function init() {
        await loadCurrentValues();
        bindClickHandler();
    }

    async function loadCurrentValues() {
        for (const s of SETTINGS) {
            try {
                const val = await execFn(`settings get global ${s.key}`);
                const clean = val?.trim();
                if (clean && clean !== 'null' && clean !== 'undefined') {
                    currentValues[s.id] = clean;
                }
            } catch (e) {
                // Fallback to config files if settings read fails
                try {
                    const saved = await execFn(`cat ${CONFIG_DIR}/${s.key} 2>/dev/null`);
                    if (saved.trim()) currentValues[s.id] = saved.trim();                } catch (e2) {}
            }
        }
        updateCardDisplay();
    }

    function updateCardDisplay() {
        const valEl = document.querySelector('#animation-speed-item .setting-value');
        if (valEl) {
            const displayVal = currentValues.anim_window || '1';
            valEl.innerHTML = `${displayVal}x <i class="fas fa-chevron-right"></i>`;
        }
    }

    function bindClickHandler() {
        const item = document.getElementById('animation-speed-item');
        if (!item) return;
        
        item.style.cursor = 'pointer';
        item.addEventListener('click', showAnimModal);
    }

    function showAnimModal() {
        const existing = document.getElementById('anim-modal');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = 'anim-modal';
        modal.style.cssText = `
            position: fixed; inset: 0; background: rgba(0,0,0,0.85); z-index: 10000;
            display: flex; align-items: center; justify-content: center;
            backdrop-filter: blur(5px);
        `;

        const box = document.createElement('div');
        box.style.cssText = `
            background: linear-gradient(135deg, #1a1f3a, #2d3561);
            border: 2px solid #FF453A;
            border-radius: 20px;
            padding: 24px; width: 95%; max-width: 450px;
            box-shadow: 0 0 40px rgba(255, 69, 58, 0.2);
            max-height: 90vh; overflow-y: auto;
        `;

        // Header
        const header = document.createElement('div');
        header.style.cssText = 'text-align: center; margin-bottom: 20px;';
        header.innerHTML = `
            <h3 style="color: #FF453A; margin: 0; font-size: 20px;">⏱️ Animation Speed</h3>
            <p style="color: #8b92b4; font-size: 12px; margin: 5px 0 0;">System UI transition multipliers</p>        `;

        // Build dropdowns
        SETTINGS.forEach(s => {
            const row = document.createElement('div');
            row.style.cssText = 'margin-bottom: 16px;';
            
            const labelRow = document.createElement('div');
            labelRow.style.cssText = 'display: flex; justify-content: space-between; margin-bottom: 6px;';
            labelRow.innerHTML = `
                <span style="color: #fff; font-size: 13px; font-weight: 600;">${s.label}</span>
                <span style="color: #8b92b4; font-size: 11px;">${s.desc}</span>
            `;
            
            const select = document.createElement('select');
            select.id = s.id;
            select.style.cssText = `
                width: 100%; padding: 10px; background: rgba(0,0,0,0.4); color: #fff;
                border: 1px solid rgba(255,255,255,0.2); border-radius: 10px; font-size: 13px;
            `;
            
            OPTIONS.forEach(opt => {
                const option = document.createElement('option');
                option.value = opt.val;
                option.textContent = opt.label;
                if (opt.val === currentValues[s.id]) option.selected = true;
                select.appendChild(option);
            });
            
            row.append(labelRow, select);
            box.appendChild(row);
        });

        // Apply Button
        const applyBtn = document.createElement('button');
        applyBtn.id = 'apply_anim_btn';
        applyBtn.textContent = '💾 Apply Animation Settings';
        applyBtn.style.cssText = `
            width: 100%; padding: 14px; margin-top: 10px;
            background: linear-gradient(135deg, #FF453A, #d63031);
            color: #fff; border: none; border-radius: 12px;
            font-size: 14px; font-weight: 700; cursor: pointer;
            box-shadow: 0 4px 15px rgba(255, 69, 58, 0.4);
        `;
        applyBtn.onclick = async () => {
            await applySettings();
            modal.remove();
        };
        box.appendChild(applyBtn);
        // Cancel Button
        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = 'Cancel';
        cancelBtn.style.cssText = `
            width: 100%; padding: 12px; margin-top: 10px;
            background: rgba(255,255,255,0.1); color: #fff;
            border: none; border-radius: 10px; font-size: 13px; cursor: pointer;
        `;
        cancelBtn.onclick = () => modal.remove();
        box.appendChild(cancelBtn);

        modal.appendChild(box);
        document.body.appendChild(modal);
        modal.onclick = e => { if (e.target === modal) modal.remove(); };
    }

    async function applySettings() {
        const applyBtn = document.getElementById('apply_anim_btn');
        if (applyBtn) {
            applyBtn.disabled = true;
            applyBtn.textContent = '⏳ Applying...';
        }

        try {
            for (const s of SETTINGS) {
                const val = document.getElementById(s.id).value;
                
                // Apply to Android global settings
                await execFn(`settings put global ${s.key} ${val}`);
                
                // Save to config directory
                await execFn(`mkdir -p ${CONFIG_DIR} && echo '${val}' > ${CONFIG_DIR}/${s.key}`);
                
                currentValues[s.id] = val;
            }
            
            updateCardDisplay();
            
            if (window.showStatus) {
                window.showStatus('✅ Animation speed updated!', '#32D74B');
            }
            
        } catch (e) {
            console.error('Animation apply failed:', e);
            if (window.showStatus) {
                window.showStatus('❌ Failed to apply. Check root.', '#FF453A');
            } else {
                alert('Failed to apply settings. Ensure root access.');
            }
        }    }

    // Initialize
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();