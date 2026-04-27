// cpu.js - CPU Governor Manager (Fixed & Verified)
(function() {
    'use strict';

    const CONFIG_FILE = '/sdcard/MTK_AI_Engine/manual_governor.txt';
    let availableGovernors = [];
    let currentGovernor = 'performance';

    // Safe exec wrapper (uses global exec or provides fallback)
    const execFn = window.exec || async function(cmd, timeout = 5000) {
        return new Promise(resolve => {
            const cb = `cpu_exec_${Date.now()}_${Math.random().toString(36).substring(2)}`;
            const t = setTimeout(() => { delete window[cb]; resolve(''); }, timeout);
            window[cb] = (_, res) => { clearTimeout(t); delete window[cb]; resolve(res || ''); };
            if (window.ksu) ksu.exec(cmd, `window.${cb}`);
            else { clearTimeout(t); resolve(''); }
        });
    };

    async function init() {
        await loadGovernorData();
        bindClickHandler();
    }

    async function loadGovernorData() {
        try {
            const raw = await execFn('cat /sys/devices/system/cpu/cpu0/cpufreq/scaling_available_governors 2>/dev/null');
            availableGovernors = raw?.trim().split(/\s+/).filter(g => g) || [];
            if (availableGovernors.length === 0) {
                availableGovernors = ['performance', 'schedutil', 'powersave', 'conservative', 'ondemand', 'interactive'];
            }

            const saved = await execFn(`cat ${CONFIG_FILE} 2>/dev/null`);
            const live = await execFn('cat /sys/devices/system/cpu/cpu0/cpufreq/scaling_governor 2>/dev/null');
            
            currentGovernor = (saved?.trim() && availableGovernors.includes(saved.trim())) 
                ? saved.trim() 
                : (live?.trim() || 'performance');
        } catch (e) {
            console.warn('CPU Governor init error:', e);
            currentGovernor = 'performance';
        }
        updateDisplay();
    }

    function updateDisplay() {
        const valEl = document.querySelector('#cpu-gov-item .setting-value');
        if (valEl) {
            valEl.innerHTML = `${currentGovernor.charAt(0).toUpperCase() + currentGovernor.slice(1)} <i class="fas fa-chevron-right"></i>`;
        }    }

    async function applyGovernor(gov) {
        gov = gov.toLowerCase().trim();
        if (!availableGovernors.includes(gov)) {
            alert(`❌ Governor "${gov}" is not supported.\nAvailable: ${availableGovernors.join(', ')}`);
            return;
        }

        const modal = document.getElementById('cpu-gov-modal');
        if (!modal) return;

        // 1. Show applying state
        const titleEl = modal.querySelector('h3');
        const statusEl = modal.querySelector('.apply-status') || (() => {
            const el = document.createElement('div');
            el.className = 'apply-status';
            el.style.cssText = 'text-align:center; padding:10px 0; font-size:13px;';
            modal.querySelector('div[style*="grid"]').before(el);
            return el;
        })();

        titleEl.textContent = '⏳ Applying Governor...';
        statusEl.textContent = `Writing ${gov} to all CPU clusters...`;
        statusEl.style.color = '#FF9F0A';

        try {
            // 2. Save preference
            await execFn(`mkdir -p /sdcard/MTK_AI_Engine && echo '${gov}' > ${CONFIG_FILE}`);
            
            // 3. Apply to ALL CPU cores
            // KernelSU WebView already runs as root, so we skip 'su -c' to avoid parsing failures
            const applyCmd = `for cpu in /sys/devices/system/cpu/cpu[0-9]*; do [ -f "$cpu/cpufreq/scaling_governor" ] && echo '${gov}' > "$cpu/cpufreq/scaling_governor"; done`;
            await execFn(applyCmd);
            
            // 4. VERIFY the change actually took effect (critical for "locking")
            await new Promise(res => setTimeout(res, 300)); // Small delay for kernel to settle
            const verify = await execFn('cat /sys/devices/system/cpu/cpu0/cpufreq/scaling_governor 2>/dev/null');
            const actualGov = verify?.trim().toLowerCase();
            
            if (actualGov !== gov) {
                throw new Error(`Kernel rejected governor. Expected: ${gov}, Got: ${actualGov || 'unknown'}`);
            }

            // 5. Update state & UI ONLY after verification
            currentGovernor = gov;
            updateDisplay();
            
            if (window.showStatus) {
                window.showStatus(`✅ CPU Governor → ${currentGovernor}`, '#32D74B');            }

            // 6. Success feedback & close modal
            titleEl.textContent = '✅ Governor Locked!';
            statusEl.textContent = `${currentGovernor} applied to all clusters`;
            statusEl.style.color = '#32D74B';
            
            setTimeout(() => modal.remove(), 1200);

        } catch (e) {
            console.error('Failed to apply governor:', e);
            titleEl.textContent = '❌ Apply Failed';
            statusEl.textContent = e.message || 'Check root permissions & kernel support';
            statusEl.style.color = '#FF453A';
            
            if (window.showStatus) {
                window.showStatus('❌ Governor apply failed', '#FF453A');
            }
            setTimeout(() => modal.remove(), 2500);
        }
    }

    function bindClickHandler() {
        const item = document.getElementById('cpu-gov-item');
        if (!item) return;
        
        item.style.cursor = 'pointer';
        item.addEventListener('click', () => {
            if (availableGovernors.length === 0) {
                alert('⏳ Loading available governors...');
                return;
            }
            showGovernorSelector();
        });
    }

    function showGovernorSelector() {
        const existing = document.getElementById('cpu-gov-modal');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = 'cpu-gov-modal';
        modal.style.cssText = `
            position: fixed; inset: 0; background: rgba(0,0,0,0.75); z-index: 10000;
            display: flex; align-items: center; justify-content: center;
            backdrop-filter: blur(4px); animation: fadeIn 0.2s ease;
        `;

        const box = document.createElement('div');
        box.style.cssText = `            background: #1a1f3a; border: 1px solid #2a3152; border-radius: 16px;
            padding: 24px; width: 90%; max-width: 400px; 
            box-shadow: 0 10px 40px rgba(0,0,0,0.5); animation: slideUp 0.3s ease;
        `;

        const title = document.createElement('h3');
        title.textContent = '🔧 Select CPU Governor';
        title.style.cssText = 'color: #fff; margin: 0 0 16px; font-size: 18px; font-weight: 600; text-align: center;';

        const info = document.createElement('div');
        info.style.cssText = 'color: #8b92b4; font-size: 13px; margin-bottom: 16px; text-align: center;';
        info.innerHTML = `<strong>Current:</strong> <span style="color: #32D74B">${currentGovernor}</span> &nbsp;|&nbsp; <strong>Available:</strong> ${availableGovernors.length}`;

        const grid = document.createElement('div');
        grid.style.cssText = 'display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; margin-bottom: 20px;';

        availableGovernors.forEach(gov => {
            const btn = document.createElement('button');
            const isCurrent = gov === currentGovernor;
            btn.textContent = gov.charAt(0).toUpperCase() + gov.slice(1);
            btn.style.cssText = `
                padding: 14px 12px; 
                background: ${isCurrent ? 'linear-gradient(135deg, #32D74B, #2ecc71)' : '#151b2d'};
                color: ${isCurrent ? '#fff' : '#e0e0e0'};
                border: ${isCurrent ? '2px solid #32D74B' : '1px solid #2a3152'};
                border-radius: 12px; font-size: 13px; font-weight: ${isCurrent ? '700' : '500'};
                cursor: pointer; transition: all 0.2s ease; text-transform: capitalize;
            `;
            btn.onmouseenter = () => { if (!isCurrent) { btn.style.background = '#252b45'; btn.style.borderColor = '#4a9eff'; } };
            btn.onmouseleave = () => { if (!isCurrent) { btn.style.background = '#151b2d'; btn.style.borderColor = '#2a3152'; } };
            btn.onclick = () => applyGovernor(gov);
            grid.appendChild(btn);
        });

        const closeBtn = document.createElement('button');
        closeBtn.textContent = 'Cancel';
        closeBtn.style.cssText = `
            width: 100%; padding: 14px; background: #2a3152; color: #fff;
            border: none; border-radius: 12px; font-size: 14px; font-weight: 600; cursor: pointer;
        `;
        closeBtn.onclick = () => modal.remove();

        box.append(title, info, grid, closeBtn);
        modal.appendChild(box);
        modal.onclick = e => { if (e.target === modal) modal.remove(); };
        
        const style = document.createElement('style');
        style.textContent = `
            @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
            @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }        `;
        document.head.appendChild(style);
        document.body.appendChild(modal);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    window.applyCPUGovernor = applyGovernor;
})();