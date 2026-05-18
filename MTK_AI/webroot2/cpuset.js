/* cpuset.js - Dual Mode Controller (Presets + Custom List) */
(function() {
    'use strict';

    // Hide the old flickering container immediately
    const oldContainer = document.getElementById("cpuset-content");
    if (oldContainer) {
        oldContainer.style.display = 'none';
        console.log("cpuset.js: Hidden old flickering container.");
    }

    const CFG_FILE = "/sdcard/MTK_AI_Engine/cpuset_auto.json";
    const CPUSET_PATH = "/dev/cpuset";
    let cpuCount = 8;
    let validGroups = [];

    // Robust exec wrapper
    const execFn = window.exec || async function(cmd, timeout = 5000) {
        return new Promise(resolve => {
            const cb = 'cpuset_' + Date.now() + '_' + Math.random().toString(36).substr(2);
            const t = setTimeout(() => { delete window[cb]; resolve(''); }, timeout);
            window[cb] = (_, res) => { clearTimeout(t); delete window[cb]; resolve(res || ''); };
            if (window.ksu) ksu.exec(cmd, 'window.' + cb);
            else { clearTimeout(t); resolve(''); }
        });
    };

    // 1. Logic: Generate Masks
    function generateMasks() {
        const all = Array(cpuCount).fill(true);
        const eff = Math.max(2, Math.floor(cpuCount * 0.5));
        const little = Array(cpuCount).fill(false);
        for (let i = 0; i < eff; i++) little[i] = true;

        const format = (arr) => {
            let res = [], start = null;
            for (let i = 0; i <= arr.length; i++) {
                if (arr[i]) { if (start === null) start = i; }
                else if (start !== null) {
                    res.push(start === i - 1 ? `${start}` : `${start}-${i - 1}`);
                    start = null;
                }
            }
            return res.join(",") || "";
        };

        return {
            performance: { name: "🚀 Performance", desc: "All cores active", mask: format(all), bgMask: format(all) },
            balanced: { name: "⚖️ Balanced", desc: "Background on efficiency", mask: format(all), bgMask: format(little) },
            powersave: { name: "🔋 Power Save", desc: "Limit all to efficiency", mask: format(little), bgMask: format(little) }        };
    }

    // 2. Logic: Apply Mask to Kernel
    async function applyMaskToKernel(presetKey) {
        const masks = generateMasks();
        const preset = masks[presetKey];
        if (!preset) return;

        const status = document.getElementById('cpuset-status');
        if (status) status.textContent = "⏳ Applying...";

        for (const group of validGroups) {
            const path = `${CPUSET_PATH}/${group}/cpus`;
            const isBackground = group.includes('background') || group.includes('restricted');
            const maskToWrite = (presetKey === 'balanced' && isBackground) ? preset.bgMask : preset.mask;
            try { await execFn(`echo "${maskToWrite}" > "${path}" 2>/dev/null`); } catch (e) {}
        }
        
        // Save to JSON
        try {
            const json = JSON.stringify({ timestamp: new Date().toISOString(), activePreset: presetKey }, null, 2);
            await execFn(`echo '${json}' > "${CFG_FILE}"`);
        } catch (e) {}

        if (status) {
            status.textContent = "✅ Applied & Saved!";
            setTimeout(() => { if (status) status.textContent = "Ready"; }, 1500);
        }
    }

    // 3. UI: Render Presets (The Clean Buttons)
    function renderPresetsUI(contentDiv) {
        const masks = generateMasks();
        contentDiv.innerHTML = ""; // Clear content

        const presets = [
            { key: 'performance', icon: 'fa-bolt', color: '#FF453A' },
            { key: 'balanced', icon: 'fa-balance-scale', color: '#FF9F0A' },
            { key: 'powersave', icon: 'fa-leaf', color: '#32D74B' }
        ];

        presets.forEach(p => {
            const data = masks[p.key];
            const card = document.createElement("div");
            card.style.cssText = `padding:16px;border-radius:12px;cursor:pointer;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);display:flex;align-items:center;gap:12px;margin-bottom:10px;`;
            
            card.innerHTML = `
                <div style="width:40px;height:40px;border-radius:10px;background:${p.color};display:flex;align-items:center;justify-content:center;color:#fff;font-size:18px;">
                    <i class="fas ${p.icon}"></i>                </div>
                <div style="flex:1;">
                    <div style="color:#fff;font-weight:bold;font-size:14px;">${data.name}</div>
                    <div style="color:#888;font-size:11px;">${data.desc}</div>
                </div>
                <div style="color:#AF52DE;font-size:12px;">Tap to Apply</div>
            `;
            
            card.onclick = () => {
                applyMaskToKernel(p.key);
                // Update UI feedback
                card.style.background = 'rgba(175,82,222,0.2)';
                card.style.border = '1px solid #AF52DE';
                setTimeout(() => {
                    card.style.background = 'rgba(255,255,255,0.05)';
                    card.style.border = '1px solid rgba(255,255,255,0.1)';
                }, 500);
            };
            contentDiv.appendChild(card);
        });

        // Add "Custom Mode" Button at bottom
        const customBtn = document.createElement("button");
        customBtn.innerHTML = '<i class="fas fa-sliders-h"></i> Switch to Custom Mode';
        customBtn.style.cssText = "width:100%;padding:12px;background:rgba(175,82,222,0.2);color:#AF52DE;border:1px solid #AF52DE;border-radius:10px;margin-top:15px;cursor:pointer;font-weight:bold;";
        customBtn.onclick = () => renderCustomUI(contentDiv);
        contentDiv.appendChild(customBtn);
    }

    // 4. UI: Render Custom List (The Detailed Checkboxes)
    async function renderCustomUI(contentDiv) {
        contentDiv.innerHTML = '<div style="text-align:center;padding:40px;color:#888;"> Loading CPU groups...</div>';

        try {
            // Detect CPUs & Groups
            const nproc = await execFn("nproc --all");
            cpuCount = Math.max(1, parseInt(nproc.trim()) || 8);
            
            const ls = await execFn(`ls ${CPUSET_PATH}`);
            validGroups = ls.trim().split("\n").filter(g => g && !["cgroup.procs", "notify_on_release", "tasks", ".", ".."].includes(g));

            contentDiv.innerHTML = "";

            for (const group of validGroups) {
                const path = `${CPUSET_PATH}/${group}/cpus`;
                const writable = await execFn(`[ -f "${path}" ] && [ -w "${path}" ] && echo "1" || echo "0"`);
                if (writable.trim() !== "1") continue;

                // Group Card
                const groupDiv = document.createElement("div");                groupDiv.style.cssText = "margin-bottom:20px;padding:15px;background:rgba(255,255,255,0.05);border-radius:12px;border:1px solid rgba(255,255,255,0.1);";
                
                groupDiv.innerHTML = `
                    <div style="display:flex;justify-content:space-between;margin-bottom:10px;">
                        <span style="color:#AF52DE;font-weight:bold;text-transform:uppercase;">${group}</span>
                        <span style="color:#888;font-size:12px;">Current: Loading...</span>
                    </div>
                    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(60px,1fr));gap:10px;" class="cpuset-grid"></div>
                `;

                const grid = groupDiv.querySelector('.cpuset-grid');
                contentDiv.appendChild(groupDiv);

                // Create Checkboxes
                for (let i = 0; i < cpuCount; i++) {
                    const label = document.createElement("label");
                    label.style.cssText = "display:flex;flex-direction:column;align-items:center;gap:4px;cursor:pointer;";
                    
                    const cb = document.createElement("input");
                    cb.type = "checkbox";
                    cb.dataset.path = path;
                    cb.dataset.core = i;
                    cb.style.cssText = "width:18px;height:18px;accent-color:#AF52DE;";
                    
                    label.appendChild(cb);
                    label.appendChild(document.createTextNode(`CPU${i}`));
                    grid.appendChild(label);
                }

                // Load Current State
                const currentMask = (await execFn(`cat "${path}" 2>/dev/null`)).trim();
                const checks = Array(cpuCount).fill(false);
                if (currentMask) {
                    currentMask.split(",").forEach(part => {
                        if (part.includes("-")) {
                            const [s, e] = part.split("-").map(Number);
                            for (let k = s; k <= e && k < cpuCount; k++) checks[k] = true;
                        } else {
                            const idx = parseInt(part, 10);
                            if (!isNaN(idx) && idx < cpuCount) checks[idx] = true;
                        }
                    });
                }

                grid.querySelectorAll("input").forEach((cb, i) => cb.checked = checks[i]);
                groupDiv.querySelector('span:last-child').textContent = `Current: ${currentMask || "none"}`;

                // Bind Changes
                grid.querySelectorAll("input").forEach(cb => {
                    cb.addEventListener("change", async () => {                        const all = Array.from(grid.querySelectorAll("input")).map(c => c.checked);
                        const newMask = generateMasks().performance.mask; // Re-use format logic
                        const res = [];
                        let start = null;
                        for (let i = 0; i <= all.length; i++) {
                            if (all[i]) { if (start === null) start = i; }
                            else if (start !== null) { res.push(start === i - 1 ? `${start}` : `${start}-${i - 1}`); start = null; }
                        }
                        const finalMask = res.join(",");

                        try {
                            await execFn(`echo "${finalMask}" > "${path}" 2>/dev/null`);
                            groupDiv.querySelector('span:last-child').textContent = `Current: ${finalMask}`;
                        } catch (e) {
                            cb.checked = !cb.checked; // Revert
                        }
                    });
                });
            }

            // Add "Back to Presets" Button
            const backBtn = document.createElement("button");
            backBtn.innerHTML = '<i class="fas fa-arrow-left"></i> Back to Presets';
            backBtn.style.cssText = "width:100%;padding:12px;background:rgba(255,255,255,0.1);color:#fff;border:none;border-radius:10px;margin-top:15px;cursor:pointer;font-weight:bold;";
            backBtn.onclick = () => renderPresetsUI(contentDiv);
            contentDiv.appendChild(backBtn);

        } catch (e) {
            contentDiv.innerHTML = `<div style="text-align:center;color:red;">Error: ${e.message}</div>`;
        }
    }

    // 5. Modal Logic
    function showCpusetModal() {
        let modal = document.getElementById("cpuset-modal");
        if (modal) {
            modal.style.display = "flex";
            return;
        }

        modal = document.createElement("div");
        modal.id = "cpuset-modal";
        modal.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:10000;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(5px);";

        const box = document.createElement("div");
        box.style.cssText = "background:linear-gradient(135deg,#1a1f3a,#2d3561);border:2px solid #AF52DE;border-radius:20px;padding:24px;width:95%;max-width:500px;max-height:85vh;overflow-y:auto;";

        box.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
                <h3 style="color:#AF52DE;margin:0;"><i class="fas fa-microchip"></i> CPU Set Manager</h3>                <button id="cpuset-close-btn" style="background:rgba(255,255,255,0.1);color:#fff;border:none;border-radius:8px;padding:8px 16px;cursor:pointer;">
                    <i class="fas fa-times"></i> Close
                </button>
            </div>
            <div id="cpuset-status" style="text-align:center;color:#666;font-size:12px;margin-bottom:15px;">Ready</div>
            <div id="cpuset-modal-content"></div>
        `;

        modal.appendChild(box);
        document.body.appendChild(modal);

        // Close Logic
        document.getElementById("cpuset-close-btn").onclick = () => modal.style.display = "none";
        modal.onclick = (e) => { if (e.target === modal) modal.style.display = "none"; };

        // Initial Render
        renderPresetsUI(document.getElementById("cpuset-modal-content"));
    }

    // 6. Init
    function init() {
        // Bind to YOUR card
        const card = document.getElementById("cpuset-item");
        if (card) {
            card.addEventListener("click", showCpusetModal);
            console.log("cpuset.js: Attached to #cpuset-item");
        } else {
            console.warn("cpuset.js: #cpuset-item not found!");
        }
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();
    
    window.CpusetPresets = { init };
})();