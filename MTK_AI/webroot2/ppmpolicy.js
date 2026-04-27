// ppmpolicy.js - PPM Policy Manager for MediaTek Devices
(function() {
    'use strict';

    let ppmPolicyStates = {};

    // Safe exec wrapper (uses global exec if available)
    const execFn = typeof window.exec === 'function' ? window.exec : async function(cmd, timeout = 3000) {
        return new Promise(resolve => {
            const cb = `ppm_exec_${Date.now()}_${Math.random().toString(36).substring(2)}`;
            const t = setTimeout(() => { delete window[cb]; resolve(''); }, timeout);
            window[cb] = (_, res) => { clearTimeout(t); delete window[cb]; resolve(res || ''); };
            if (window.ksu) ksu.exec(cmd, `window.${cb}`);
            else { clearTimeout(t); resolve(''); }
        });
    };

    async function init() {
        // Check if PPM exists
        const check = await execFn("ls /proc/ppm/policy_status 2>/dev/null");
        if (!check.trim()) {
            console.warn("PPM Policy: /proc/ppm/policy_status not found. Hiding card.");
            const item = document.getElementById('ppm-policy-item');
            if (item) item.style.display = 'none';
            return;
        }

        bindClickHandler();
        // Initial load to set card display
        await refreshCardDisplay();
    }

    function bindClickHandler() {
        const item = document.getElementById('ppm-policy-item');
        if (!item) return;

        item.style.cursor = 'pointer';
        item.addEventListener('click', () => {
            showPpmModal();
        });
    }

    // === NEW: Determine profile name from policy states ===
    function getCurrentProfileName(policies) {
        if (!policies) return 'Unknown';
        
        const sysBoostEnabled = policies[9] === true;
        const thermalDisabled = policies[4] === false;
        
        let enabledCount = 0;        for (let i = 0; i <= 9; i++) {
            if (policies[i] === true) enabledCount++;
        }
        
        if (sysBoostEnabled && thermalDisabled && enabledCount <= 3) {
            return 'Performance';
        }
        if (policies[4] === true && enabledCount >= 5) {
            return 'Balanced';
        }
        if (enabledCount <= 2) {
            return 'Power Saving';
        }
        return 'Custom';
    }

    // === NEW: Update the Advanced tab card display ===
    async function refreshCardDisplay() {
        const policies = await loadPPMPolicyStates();
        if (!policies) return;
        
        const profileName = getCurrentProfileName(policies);
        const valEl = document.querySelector('#ppm-policy-item .setting-value');
        if (valEl) {
            valEl.innerHTML = `${profileName} <i class="fas fa-chevron-right"></i>`;
            // Color code based on profile
            if (profileName === 'Performance') valEl.style.color = '#FF453A';
            else if (profileName === 'Balanced') valEl.style.color = '#AF52DE';
            else if (profileName === 'Power Saving') valEl.style.color = '#32D74B';
            else valEl.style.color = '#8b92b4';
        }
    }

    async function loadPPMPolicyStates() {
        try {
            const raw = await execFn("cat /proc/ppm/policy_status 2>/dev/null");
            if (!raw || raw.includes("NOT_FOUND")) return false;

            let parsed = {};
            const regex = /\[(\d+)\]\s+PPM_POLICY_([A-Z_0-9]+):\s+(\w+)/gi;
            let match;
            
            while ((match = regex.exec(raw)) !== null) {
                const idx = parseInt(match[1]);
                const status = match[3].toLowerCase() === 'enabled';
                if (!isNaN(idx) && idx >= 0 && idx <= 9) {
                    parsed[idx] = status;
                }
            }
                        return parsed;
        } catch (e) {
            console.error("PPM Load Error:", e);
            return false;
        }
    }

    async function showPpmModal() {
        const existing = document.getElementById('ppm-modal');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = 'ppm-modal';
        modal.style.cssText = `
            position: fixed; inset: 0; background: rgba(0,0,0,0.85); z-index: 10000;
            display: flex; align-items: center; justify-content: center;
            backdrop-filter: blur(5px);
        `;

        const box = document.createElement('div');
        box.style.cssText = `
            background: linear-gradient(135deg, #1a1f3a, #2d3561);
            border: 2px solid #AF52DE;
            border-radius: 20px;
            padding: 24px; width: 95%; max-width: 450px;
            box-shadow: 0 0 40px rgba(175, 82, 222, 0.2);
        `;

        const header = document.createElement('div');
        header.style.cssText = 'text-align: center; margin-bottom: 10px;';
        header.innerHTML = `
            <h3 style="color: #AF52DE; margin: 0; font-size: 20px;">🛡️ PPM Policy Control</h3>
            <p style="color: #8b92b4; font-size: 12px; margin: 5px 0 0;">Power Performance Management</p>
        `;

        const actions = document.createElement('div');
        actions.style.cssText = 'display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 20px;';
        
        const btnPerf = document.createElement('button');
        btnPerf.textContent = '🔥 Performance Mode';
        btnPerf.style.cssText = `
            padding: 10px; background: rgba(255, 69, 58, 0.2); color: #FF453A;
            border: 1px solid #FF453A; border-radius: 8px; cursor: pointer; font-size: 12px;
        `;
        btnPerf.onclick = () => applyProfile('perf');

        const btnBalanced = document.createElement('button');
        btnBalanced.textContent = '⚖️ Balanced Mode';
        btnBalanced.style.cssText = `
            padding: 10px; background: rgba(50, 215, 116, 0.2); color: #32D74B;            border: 1px solid #32D74B; border-radius: 8px; cursor: pointer; font-size: 12px;
        `;
        btnBalanced.onclick = () => applyProfile('balanced');

        actions.append(btnPerf, btnBalanced);
        box.appendChild(actions);

        const listContainer = document.createElement('div');
        listContainer.id = 'ppm-policy-list';
        listContainer.style.cssText = 'max-height: 40vh; overflow-y: auto; margin-bottom: 10px;';
        listContainer.innerHTML = '<div style="text-align:center; padding: 20px; color: #8b92b4;">Loading policies...</div>';
        box.appendChild(listContainer);

        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = 'Close';
        cancelBtn.style.cssText = `
            width: 100%; padding: 12px; background: rgba(255,255,255,0.1); color: #fff;
            border: none; border-radius: 10px; font-size: 13px; cursor: pointer;
        `;
        cancelBtn.onclick = () => modal.remove();
        box.appendChild(cancelBtn);

        modal.appendChild(box);
        document.body.appendChild(modal);
        modal.onclick = e => { if (e.target === modal) modal.remove(); };

        const policies = await loadPPMPolicyStates();
        renderPolicies(policies, listContainer);
    }

    function renderPolicies(policies, container) {
        if (!policies) {
            container.innerHTML = '<div style="text-align:center; padding: 20px; color: #FF453A;">Failed to load PPM data</div>';
            return;
        }

        container.innerHTML = '';
        const policyNames = {
            0: "PTPOD", 1: "UT", 2: "FORCE_LIMIT", 3: "PWR_THRO", 
            4: "🔥 THERMAL", 5: "DLPT", 6: "HARD_USER_LIMIT", 
            7: "USER_LIMIT", 8: "LCM_OFF", 9: "✅ SYS_BOOST"
        };

        for (let i = 0; i <= 9; i++) {
            const isEnabled = policies[i] === true;
            const name = policyNames[i] || `POLICY_${i}`;
            
            const row = document.createElement('div');
            row.style.cssText = `
                display: flex; align-items: center; justify-content: space-between;                background: rgba(0,0,0,0.3); padding: 10px 12px; border-radius: 8px; margin-bottom: 8px;
            `;

            const label = document.createElement('span');
            label.style.cssText = 'color: #fff; font-size: 13px; font-weight: 500;';
            label.textContent = name;

            const toggle = document.createElement('label');
            toggle.style.cssText = 'position: relative; display: inline-block; width: 40px; height: 20px; cursor: pointer;';
            
            const input = document.createElement('input');
            input.type = 'checkbox';
            input.checked = isEnabled;
            input.style.cssText = 'opacity: 0; width: 0; height: 0;';
            input.onchange = () => togglePolicy(i, input.checked);

            const slider = document.createElement('span');
            slider.style.cssText = `
                position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0;
                background-color: ${isEnabled ? '#32D74B' : '#ccc'}; transition: .4s; border-radius: 20px;
            `;
            
            const dot = document.createElement('span');
            dot.style.cssText = `
                position: absolute; content: ""; height: 16px; width: 16px; left: 2px; bottom: 2px;
                background-color: white; transition: .4s; border-radius: 50%;
                transform: ${isEnabled ? 'translateX(20px)' : 'translateX(0)'};
            `;

            slider.appendChild(dot);
            toggle.append(input, slider);
            row.append(label, toggle);
            container.appendChild(row);
        }
    }

    async function togglePolicy(index, status) {
        const val = status ? 1 : 0;
        try {
            await execFn(`echo "${index} ${val}" > /proc/ppm/policy_status`);
            const policies = await loadPPMPolicyStates();
            const list = document.getElementById('ppm-policy-list');
            if (list && policies) renderPolicies(policies, list);
            // Update card display after toggle
            await refreshCardDisplay();
        } catch (e) {
            console.error("Toggle PPM failed", e);
            alert("Failed to toggle policy. Check root.");
        }
    }
    async function applyProfile(type) {
        let commands = "";
        if (type === 'perf') {
            for (let i = 0; i <= 8; i++) commands += `echo "${i} 0" > /proc/ppm/policy_status; `;
            commands += `echo "9 1" > /proc/ppm/policy_status`;
        } else {
            for (let i = 0; i <= 9; i++) commands += `echo "${i} 1" > /proc/ppm/policy_status; `;
        }

        try {
            await execFn(`su -c '${commands}'`);
            alert(`Applied ${type === 'perf' ? 'Performance' : 'Balanced'} profile.`);
            const policies = await loadPPMPolicyStates();
            const list = document.getElementById('ppm-policy-list');
            if (list && policies) renderPolicies(policies, list);
            // === FIX: Update the main card display ===
            await refreshCardDisplay();
        } catch (e) {
            console.error("Apply Profile failed", e);
            alert("Failed to apply profile.");
        }
    }

    // Initialize
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();