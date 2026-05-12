// fpsgo.js - FINAL VERSION MATCHING YOUR KERNEL FILES
(function() {
    'use strict';

    const FPSGO_PATHS = [
        '/sys/kernel/fpsgo/common',
        '/sys/kernel/fpsgo/fstb',
        '/sys/kernel/fpsgo/fbt',
        '/sys/module/fpsgo/parameters',
        '/sys/module/gpu_fpsgo/parameters',
        '/sys/kernel/gpu_fpsgo',
        '/sys/devices/platform/soc/mtk_fpsgo',
        '/sys/devices/virtual/misc/fpsgo',
        '/sys/class/misc/fpsgo'
    ];

    const SYSTRACE_FLAGS = [
        { id: 'MANDATORY', bit: 0, value: 1, label: 'Mandatory', desc: 'Core FPSGO tracing (required)', recommended: true },
        { id: 'FBT', bit: 1, value: 2, label: 'FBT', desc: 'Frame Buffer Tracker', recommended: false },
        { id: 'FSTB', bit: 2, value: 4, label: 'FSTB', desc: 'Frame Scheduler - boost decision', recommended: true },
        { id: 'XGF', bit: 3, value: 8, label: 'XGF', desc: 'GPU/frame timeline debugging', recommended: false },
        { id: 'GBE', bit: 4, value: 16, label: 'GBE', desc: 'Game Boost Engine', recommended: true },
        { id: 'FBT_CTRL', bit: 5, value: 32, label: 'FBT_CTRL', desc: 'Advanced frame timing', recommended: false }
    ];

    const FPSGO_PRESETS = {
        minimal: { enable: 1, force: 1, mask: 1, desc: 'MANDATORY only' },
        balanced: { enable: 1, force: 1, mask: 21, desc: 'MANDATORY+FSTB+GBE' },
        aggressive: { enable: 1, force: 1, mask: 63, desc: 'All flags' },
        esports: { enable: 1, force: 1, mask: 53, desc: 'MANDATORY+FSTB+GBE+FBT_CTRL' },
        disabled: { enable: 0, force: 0, mask: 0, desc: 'FPSGO off' }
    };

    // === UPDATED PATTERNS MATCHING YOUR SCREENSHOT ===
    const FPSGO_TWEAK_PATTERNS = [
        { keywords: ['render_loading', 'loading'], label: 'Render Loading', desc: 'CPU loading threshold for boosting', min: 1, max: 100, step: 1, unit: '%', rec: 30, danger: 10 },
        { keywords: ['stop_boost', 'deboost'], label: 'Stop Boost', desc: 'Threshold to stop boosting', min: 1, max: 100, step: 1, unit: '%', rec: 70, danger: 90 },
        { keywords: ['blc_boost', 'boost_ta', 'uclamp_boost'], label: 'Boost Control', desc: 'General boost intensity', min: 0, max: 10, step: 1, unit: 'lvl', rec: 0, danger: 10 },
        { keywords: ['limit_cfreq', 'cfreq'], label: 'CPU Freq Limit', desc: 'Max CPU frequency limit', min: 0, max: 3000000, step: 100000, unit: 'kHz', rec: 0, danger: 1000000 },
        { keywords: ['fstb_soft_level', 'soft_level'], label: 'FSTB Soft Level', desc: 'Frame scheduler soft level', min: 0, max: 10, step: 1, unit: 'lvl', rec: 0, danger: 10 },
        { keywords: ['enable_ceiling', 'ceiling'], label: 'FPS Ceiling', desc: 'Max FPS cap', min: 0, max: 144, step: 5, unit: 'FPS', rec: 0, danger: 30 },
        { keywords: ['light_loading_policy'], label: 'Light Loading Policy', desc: 'Policy for light loading scenarios', min: 0, max: 1, step: 1, unit: '', rec: 1, danger: 0 },
        { keywords: ['adopt_low_fps'], label: 'Adopt Low FPS', desc: 'Allow low FPS adoption', min: 0, max: 1, step: 1, unit: '', rec: 1, danger: 0 }
    ];

    let detectedPaths = [];
    let detectedTweaks = {};
    let discoveredFiles = [];
    let systraceMaskPath = null;
    let systraceStatusPath = null;    let enablePath = null;
    let forcePath = null;
    
    let state = { preset: 'balanced', customMask: null, enable: 1, force: 1, customTweaks: {} };

    const execFn = window.exec || async function(cmd, timeout = 10000) {
        return new Promise(resolve => {
            const cb = 'fpsgo_' + Date.now() + '_' + Math.random().toString(36).substr(2);
            const t = setTimeout(() => { delete window[cb]; resolve(''); }, timeout);
            window[cb] = (_, res) => { clearTimeout(t); delete window[cb]; resolve(res || ''); };
            if (window.ksu) ksu.exec(cmd, 'window.' + cb);
            else { clearTimeout(t); resolve(''); }
        });
    };

    async function readRawFile(path) {
        if (!path) return '';
        try {
            let val = await execFn('cat ' + path + ' 2>&1');
            if (val && !val.includes('No such') && val.trim()) return val.trim();
            return '';
        } catch (e) { return ''; }
    }

    async function writeRawFile(path, value) {
        if (!path) return false;
        try {
            await execFn('echo ' + value + ' > ' + path + ' 2>&1');
            return true;
        } catch (e) { return false; }
    }

    function parseSystraceStatus(text) {
        if (!text) return 1;
        let mask = 0;
        text.split('\n').forEach(line => {
            line = line.trim().toUpperCase();
            if (line.includes('ON') && !line.includes('OFF')) {
                if (line.includes('MANDATORY')) mask |= 1;
                else if (line.includes('FBT_CTRL')) mask |= 32;
                else if (line.includes('FBT')) mask |= 2;
                else if (line.includes('FSTB')) mask |= 4;
                else if (line.includes('XGF')) mask |= 8;
                else if (line.includes('GBE')) mask |= 16;
            }
        });
        return mask;
    }

    async function detectAndScan() {        detectedPaths = [];
        detectedTweaks = {};
        discoveredFiles = [];
        systraceMaskPath = null;
        systraceStatusPath = null;
        enablePath = null;
        forcePath = null;

        const statusDiv = document.getElementById('fpsgo-scan-status');
        const pathsDiv = document.getElementById('fpsgo-paths-container');

        if (!statusDiv || !pathsDiv) return;

        statusDiv.innerHTML = '🔍 Scanning paths...';
        statusDiv.style.color = '#fbbf24';

        try {
            for (const path of FPSGO_PATHS) {
                try {
                    const exists = await execFn('test -e ' + path + ' && echo yes || echo no');
                    if (exists.trim() === 'yes') {
                        detectedPaths.push(path);
                        
                        try {
                            const fileList = await execFn('ls -1 ' + path + ' 2>/dev/null');
                            const files = fileList.split('\n').map(f => f.trim()).filter(f => f);
                            discoveredFiles.push({ dir: path, files });

                            if (files.includes('systrace_mask')) systraceMaskPath = path + '/systrace_mask';
                            if (files.includes('systrace_status')) systraceStatusPath = path + '/systrace_status';
                            if (files.includes('fpsgo_enable')) enablePath = path + '/fpsgo_enable';
                            if (files.includes('force_onoff')) forcePath = path + '/force_onoff';

                            // Match files against NEW patterns
                            for (const fname of files) {
                                const lowerName = fname.toLowerCase().replace(/[_\-\s]/g, '');
                                for (const pattern of FPSGO_TWEAK_PATTERNS) {
                                    if (pattern.keywords.some(k => lowerName.includes(k.toLowerCase().replace(/[_\-\s]/g, '')))) {
                                        const fullPath = path + '/' + fname;
                                        const val = await readRawFile(fullPath);
                                        if (!detectedTweaks[pattern.keywords[0]]) {
                                            detectedTweaks[pattern.keywords[0]] = { 
                                                path: fullPath, value: val, 
                                                config: { ...pattern, id: pattern.keywords[0] }
                                            };
                                        }
                                        break;
                                    }
                                }
                            }                        } catch (e) {
                            console.log('Error listing ' + path, e);
                        }
                    }
                } catch (e) {
                    console.log('Error checking ' + path, e);
                }
            }

            if (detectedPaths.length === 0) {
                pathsDiv.innerHTML = '<div style="color:#666;font-size:11px;text-align:center;padding:10px;">❌ No FPSGO paths found</div>';
                statusDiv.innerHTML = '<span style="color:#ef4444;">❌ No paths detected</span>';
            } else {
                let html = '<div style="color:#8b92b4;font-size:11px;margin-bottom:8px;text-align:center;">📍 Active Paths</div>';
                detectedPaths.forEach(p => {
                    const found = discoveredFiles.find(f => f.dir === p);
                    const fileCount = found ? found.files.length : 0;
                    html += `<div style="padding:6px;background:rgba(239,68,68,0.1);border:1px solid #ef4444;border-radius:6px;margin-bottom:4px;font-size:10px;color:#fff;"><span style="color:#10b981;">●</span> ${p} <span style="float:right;color:#aaa;">${fileCount} files</span></div>`;
                });
                pathsDiv.innerHTML = html;
                
                statusDiv.innerHTML = `<span style="color:#10b981;">✅ Found ${detectedPaths.length} path(s) • ${Object.keys(detectedTweaks).length} tweak(s)</span>`;
            }

            if (enablePath) state.enable = parseInt(await readRawFile(enablePath)) || 1;
            if (forcePath) state.force = parseInt(await readRawFile(forcePath)) || 1;
            
            if (systraceStatusPath) {
                state.customMask = parseSystraceStatus(await readRawFile(systraceStatusPath)) || 1;
            } else if (systraceMaskPath) {
                state.customMask = parseInt(await readRawFile(systraceMaskPath)) || 1;
            }

            for (const [id, data] of Object.entries(detectedTweaks)) {
                if (state.customTweaks[id] === undefined) {
                    state.customTweaks[id] = parseInt(data.value) || data.config.rec;
                }
            }

            state.preset = 'custom';
            saveState();

            setTimeout(() => {
                setupMasterControls();
                updateSystraceCheckboxes(state.customMask);
                renderPresets(document.getElementById('preset-list'));
                renderTweakControls(document.getElementById('tweak-controls'));
                const display = document.getElementById('mask-display');
                if (display) display.textContent = '(Mask: ' + state.customMask + ')';
            }, 100);
        } catch (err) {
            console.error('[FPSGO] Scan error:', err);
            statusDiv.innerHTML = '<span style="color:#ef4444;">❌ Scan failed</span>';
        }
    }

    function loadState() {
        try { const s = localStorage.getItem('fpsgo_settings'); if (s) state = { ...state, ...JSON.parse(s) }; } catch (e) {}
    }

    function saveState() { localStorage.setItem('fpsgo_settings', JSON.stringify(state)); }

    function renderPresets(container) {
        if (!container) return;
        container.innerHTML = '';
        Object.entries(FPSGO_PRESETS).forEach(([id, preset]) => {
            const isSelected = state.preset === id && state.customMask === null;
            const card = document.createElement('div');
            card.style.cssText = `padding:10px;border-radius:8px;cursor:pointer;background:${isSelected ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.05)'};border:${isSelected ? '1px solid #ef4444' : '1px solid transparent'};text-align:center;`;
            const count = SYSTRACE_FLAGS.filter(f => (preset.mask & f.value)).length;
            card.innerHTML = `<div style="color:#fff;font-weight:500;font-size:12px;">${id.toUpperCase()}</div><div style="color:#888;font-size:10px;">${preset.desc} • ${count} flags</div>`;
            card.onclick = async () => {
                state.preset = id;
                state.customMask = null;
                await applyPreset(preset);
                renderPresets(container);
            };
            container.appendChild(card);
        });
    }

    function renderSystraceFlags(container) {
        if (!container) return;
        container.innerHTML = '';
        const mask = state.customMask !== null ? state.customMask : (FPSGO_PRESETS[state.preset]?.mask || 1);
        
        SYSTRACE_FLAGS.forEach(flag => {
            const checked = (mask & flag.value) !== 0;
            const label = document.createElement('label');
            label.style.cssText = `display:flex;align-items:center;gap:8px;padding:10px;background:${checked ? 'rgba(239,68,68,0.15)' : 'rgba(255,255,255,0.05)'};border:1px solid ${checked ? 'rgba(239,68,68,0.4)' : 'transparent'};border-radius:8px;cursor:pointer;`;
            label.innerHTML = `<input type="checkbox" class="systrace-flag" data-value="${flag.value}" ${checked ? 'checked' : ''} style="accent-color:#ef4444;"><div><div style="color:#fff;font-size:12px;font-weight:500;">${flag.label}${flag.recommended ? ' ⭐' : ''}</div><div style="color:#888;font-size:10px;">${flag.desc}</div></div>`;
            container.appendChild(label);
        });

        container.querySelectorAll('.systrace-flag').forEach(cb => {
            cb.onchange = () => {
                let newMask = 0;
                container.querySelectorAll('.systrace-flag:checked').forEach(c => newMask |= parseInt(c.dataset.value));
                state.customMask = newMask;                state.preset = 'custom';
                saveState();
                document.getElementById('mask-display').textContent = '(Mask: ' + newMask + ')';
                renderPresets(document.getElementById('preset-list'));
            };
        });

        document.getElementById('mask-display').textContent = '(Mask: ' + mask + ')';
    }

    function renderTweakControls(container) {
        if (!container) return;
        container.innerHTML = '';
        
        const knownIds = Object.keys(detectedTweaks);
        
        if (knownIds.length === 0 && detectedPaths.length > 0) {
            container.innerHTML = '<div style="color:#fbbf24;font-size:11px;text-align:center;padding:10px;background:rgba(251,191,36,0.1);border-radius:8px;margin-bottom:10px;">⚠️ No tweak parameters detected.</div>';
            return;
        }

        const title = document.createElement('div');
        title.style.cssText = 'color:#fff;font-weight:500;margin:15px 0 8px;border-bottom:1px solid rgba(255,255,255,0.1);padding-bottom:8px;';
        title.textContent = '⚙️ Advanced Tweaks';
        container.appendChild(title);

        for (const id of knownIds) {
            const data = detectedTweaks[id];
            const cfg = data.config;
            const val = state.customTweaks[id] !== undefined ? state.customTweaks[id] : parseInt(data.value) || cfg.rec;
            const isDanger = val <= cfg.danger || (cfg.danger > cfg.rec && val >= cfg.danger);
            
            const row = document.createElement('div');
            row.style.cssText = `margin-bottom:12px;padding:10px;background:rgba(255,255,255,0.03);border-radius:8px;border:1px solid ${isDanger ? 'rgba(239,68,68,0.5)' : 'transparent'};`;
            
            row.innerHTML = `
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                    <span style="color:#fff;font-size:12px;font-weight:500;">${cfg.label} <span style="color:#10b981;font-size:10px;">[Rec: ${cfg.rec}${cfg.unit}]</span></span>
                    <span style="color:${isDanger ? '#ef4444' : '#10b981'};font-size:11px;font-weight:600;">${val}${cfg.unit}</span>
                </div>
                <div style="color:#888;font-size:10px;margin-bottom:8px;">${cfg.desc}</div>
                <input type="range" class="tweak-slider" data-id="${id}" min="${cfg.min}" max="${cfg.max}" step="${cfg.step}" value="${val}" style="width:100%;accent-color:#ef4444;">
                <div style="display:flex;justify-content:space-between;font-size:9px;color:#666;margin-top:4px;"><span>${cfg.min}${cfg.unit}</span><span>${cfg.max}${cfg.unit}</span></div>
            `;
            container.appendChild(row);
        }

        container.querySelectorAll('.tweak-slider').forEach(slider => {
            slider.oninput = (e) => {
                const id = e.target.dataset.id;                const val = parseInt(e.target.value);
                state.customTweaks[id] = val;
                state.preset = 'custom';
                saveState();
                const row = e.target.closest('div[style*="margin-bottom"]');
                const display = row.querySelector('span[style*="color:"]');
                const cfg = detectedTweaks[id].config;
                const isDanger = val <= cfg.danger || (cfg.danger > cfg.rec && val >= cfg.danger);
                display.textContent = val + cfg.unit;
                display.style.color = isDanger ? '#ef4444' : '#10b981';
                row.style.borderColor = isDanger ? 'rgba(239,68,68,0.5)' : 'transparent';
            };
            slider.onchange = async (e) => {
                const id = e.target.dataset.id;
                const val = parseInt(e.target.value);
                if (detectedTweaks[id]?.path) await writeRawFile(detectedTweaks[id].path, val);
            };
        });

        const applyBtn = document.createElement('button');
        applyBtn.style.cssText = 'width:100%;padding:10px;background:linear-gradient(135deg,#3b82f6,#8b5cf6);color:#fff;border:none;border-radius:8px;font-weight:600;cursor:pointer;margin-top:10px;';
        applyBtn.innerHTML = '<i class="fas fa-save"></i> Apply All Tweaks';
        applyBtn.onclick = async () => {
            const btn = applyBtn;
            const orig = btn.innerHTML;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Applying...';
            for (const [id, val] of Object.entries(state.customTweaks)) {
                if (detectedTweaks[id]?.path) await writeRawFile(detectedTweaks[id].path, val);
            }
            btn.innerHTML = '<i class="fas fa-check"></i> Applied!';
            setTimeout(() => { btn.innerHTML = orig; }, 1500);
        };
        container.appendChild(applyBtn);
    }

    function updateSystraceCheckboxes(mask) {
        const container = document.getElementById('systrace-flags');
        if (!container) return;
        container.querySelectorAll('.systrace-flag').forEach(cb => {
            const val = parseInt(cb.dataset.value);
            cb.checked = (mask & val) !== 0;
            const card = cb.closest('label') || cb.parentElement;
            card.style.background = cb.checked ? 'rgba(239,68,68,0.15)' : 'rgba(255,255,255,0.05)';
            card.style.border = cb.checked ? '1px solid rgba(239,68,68,0.4)' : '1px solid transparent';
        });
        const display = document.getElementById('mask-display');
        if (display) display.textContent = '(Mask: ' + mask + ')';
    }

    function setupMasterControls() {        const enableCb = document.querySelector('#master-enable input');
        const forceCb = document.querySelector('#master-force input');
        if (enableCb) {
            enableCb.checked = state.enable === 1;
            document.getElementById('master-enable').onclick = async (e) => {
                if (e.target.tagName !== 'INPUT') enableCb.checked = !enableCb.checked;
                state.enable = enableCb.checked ? 1 : 0;
                if (enablePath) await writeRawFile(enablePath, state.enable);
                saveState();
            };
        }
        if (forceCb) {
            forceCb.checked = state.force === 1;
            document.getElementById('master-force').onclick = async (e) => {
                if (e.target.tagName !== 'INPUT') forceCb.checked = !forceCb.checked;
                state.force = forceCb.checked ? 1 : 0;
                if (forcePath) await writeRawFile(forcePath, state.force);
                saveState();
            };
        }
    }

    async function applyCustomMask() {
        let mask = 0;
        document.querySelectorAll('.systrace-flag:checked').forEach(cb => mask |= parseInt(cb.dataset.value));
        const btn = document.getElementById('apply-mask-btn');
        const orig = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Applying...';
        if (systraceMaskPath) await writeRawFile(systraceMaskPath, mask);
        state.customMask = mask; state.preset = 'custom'; saveState();
        btn.innerHTML = '<i class="fas fa-check"></i> Applied!';
        setTimeout(() => { btn.innerHTML = orig; }, 1500);
    }

    async function applyPreset(preset) {
        if (enablePath) await writeRawFile(enablePath, preset.enable);
        if (forcePath) await writeRawFile(forcePath, preset.force);
        if (systraceMaskPath) await writeRawFile(systraceMaskPath, preset.mask);
        state = { ...state, enable: preset.enable, force: preset.force, customMask: null, preset: Object.keys(FPSGO_PRESETS).find(k => FPSGO_PRESETS[k] === preset) };
        saveState();
        setupMasterControls(); updateSystraceCheckboxes(preset.mask); renderPresets(document.getElementById('preset-list'));
    }

    async function showFpsgoModal() {
        const existing = document.getElementById('fpsgo-modal');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = 'fpsgo-modal';
        modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:10000;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(5px);';
        const box = document.createElement('div');
        box.style.cssText = 'background:linear-gradient(135deg,#1a1f3a,#2d3561);border:2px solid #ef4444;border-radius:20px;padding:24px;width:95%;max-width:560px;max-height:90vh;overflow-y:auto;';

        box.innerHTML = `
            <div style="background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);border-radius:12px;padding:12px;margin-bottom:15px;">
                <div style="color:#ef4444;font-weight:600;"><i class="fas fa-exclamation-triangle"></i> Bootloop Warning</div>
                <div style="color:#fca5a5;font-size:11px;margin-top:5px;">If stuck on logo, clear dalvik cache in recovery</div>
            </div>
            <h3 style="color:#ef4444;margin:0 0 15px;text-align:center;">FPSGO Manager</h3>
        `;

        const presetDiv = document.createElement('div'); presetDiv.id = 'preset-list'; presetDiv.style.cssText = 'display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-bottom:15px;'; box.appendChild(presetDiv);
        
        box.innerHTML += `<div style="color:#fff;font-weight:500;margin:15px 0 8px;">Master Controls</div>
            <div style="display:flex;gap:8px;margin-bottom:15px;">
                <label id="master-enable" style="flex:1;display:flex;align-items:center;gap:8px;padding:10px;background:rgba(255,255,255,0.05);border-radius:8px;cursor:pointer;"><input type="checkbox" style="accent-color:#ef4444;"><span style="color:#aaa;font-size:12px;">Enable FPSGO</span></label>
                <label id="master-force" style="flex:1;display:flex;align-items:center;gap:8px;padding:10px;background:rgba(255,255,255,0.05);border-radius:8px;cursor:pointer;"><input type="checkbox" style="accent-color:#ef4444;"><span style="color:#aaa;font-size:12px;">Force Apply</span></label>
            </div>`;

        box.innerHTML += `<div style="color:#fff;font-weight:500;margin:15px 0 8px;">Systrace Flags <span id="mask-display" style="color:#ef4444;font-size:11px;">(Mask: ?)</span></div>`;
        const flagsDiv = document.createElement('div'); flagsDiv.id = 'systrace-flags'; flagsDiv.style.cssText = 'display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-bottom:10px;'; box.appendChild(flagsDiv);

        const applyBtn = document.createElement('button'); applyBtn.id = 'apply-mask-btn'; applyBtn.style.cssText = 'width:100%;padding:10px;background:linear-gradient(135deg,#ef4444,#f97316);color:#fff;border:none;border-radius:8px;font-weight:600;cursor:pointer;margin-bottom:15px;'; applyBtn.innerHTML = '<i class="fas fa-save"></i> Apply Custom Mask'; box.appendChild(applyBtn);

        const tweakDiv = document.createElement('div'); tweakDiv.id = 'tweak-controls'; tweakDiv.style.cssText = 'margin-bottom:15px;'; box.appendChild(tweakDiv);

        const pathsDiv = document.createElement('div'); pathsDiv.id = 'fpsgo-paths-container'; pathsDiv.style.cssText = 'margin-bottom:15px;'; box.appendChild(pathsDiv);

        const statusDiv = document.createElement('div'); statusDiv.id = 'fpsgo-scan-status'; statusDiv.style.cssText = 'text-align:center;padding:8px;background:rgba(0,0,0,0.2);border-radius:8px;margin-bottom:15px;font-size:12px;color:#666;'; statusDiv.innerHTML = 'Scanning...'; box.appendChild(statusDiv);

        const bootBtn = document.createElement('button'); bootBtn.style.cssText = 'width:100%;padding:12px;background:rgba(16,185,129,0.2);color:#10b981;border:1px solid #10b981;border-radius:10px;margin-bottom:10px;cursor:pointer;font-weight:600;'; bootBtn.innerHTML = '<i class="fas fa-power-off"></i> Create Persistent Boot Script'; bootBtn.onclick = async function() { await generateBootScript(this); }; box.appendChild(bootBtn);

        const closeBtn = document.createElement('button'); closeBtn.style.cssText = 'width:100%;padding:12px;background:rgba(255,255,255,0.1);color:#fff;border:none;border-radius:10px;cursor:pointer;'; closeBtn.textContent = 'Close'; closeBtn.onclick = () => modal.remove(); box.appendChild(closeBtn);

        modal.appendChild(box); document.body.appendChild(modal);

        renderPresets(document.getElementById('preset-list'));
        renderSystraceFlags(document.getElementById('systrace-flags'));
        setupMasterControls();
        
        document.getElementById('apply-mask-btn').onclick = () => applyCustomMask();

        setTimeout(async () => {
            await detectAndScan();
            renderTweakControls(document.getElementById('tweak-controls'));
        }, 200);
    }

    async function generateBootScript(btnRef) {        const originalText = btnRef.innerHTML;
        btnRef.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Installing...';
        
        const enableCb = document.querySelector('#master-enable input');
        const forceCb = document.querySelector('#master-force input');
        const enableVal = (enableCb && enableCb.checked) ? 1 : 0;
        const forceVal = (forceCb && forceCb.checked) ? 1 : 0;
        
        let maskVal = 0;
        document.querySelectorAll('.systrace-flag:checked').forEach(cb => maskVal |= parseInt(cb.dataset.value));
        
        const filePath = '/data/adb/service.d/fpsgo.sh';
        try {
            await execFn('mkdir -p /data/adb/service.d');
            await execFn('echo "#!/system/bin/sh" > ' + filePath);
            await execFn('echo "# FPSGO Boot Script" >> ' + filePath);
            await execFn('echo "sleep 15" >> ' + filePath);
            
            if (enablePath) await execFn(`echo "echo ${enableVal} > ${enablePath}" >> ${filePath}`);
            if (forcePath) await execFn(`echo "echo ${forceVal} > ${forcePath}" >> ${filePath}`);
            if (systraceMaskPath) await execFn(`echo "echo ${maskVal} > ${systraceMaskPath}" >> ${filePath}`);
            
            for (const [id, val] of Object.entries(state.customTweaks)) {
                if (detectedTweaks[id]?.path) await execFn(`echo "echo ${val} > ${detectedTweaks[id].path}" >> ${filePath}`);
            }
            
            await execFn('chmod 755 ' + filePath);
            btnRef.innerHTML = '<i class="fas fa-check"></i> Installed!';
            setTimeout(() => {
                alert('✅ Boot script installed!\n' + filePath);
                btnRef.innerHTML = originalText;
            }, 500);
        } catch (e) {
            btnRef.innerHTML = '<i class="fas fa-times"></i> Failed';
            setTimeout(() => { alert('Failed: ' + e); btnRef.innerHTML = originalText; }, 500);
        }
    }

    async function init() {
        loadState();
        const btn = document.getElementById('fpsgo-btn');
        if (btn) btn.addEventListener('click', () => showFpsgoModal());
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();

    window.FpsgoManager = { init, showFpsgoModal };
})();