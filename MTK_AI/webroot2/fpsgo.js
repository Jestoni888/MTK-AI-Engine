// fpsgo.js - FIXED VERSION WITH ROBUST EXEC HANDLING
(function() {
    'use strict';

    // === COMPREHENSIVE FPSGO PATHS ===
    const FPSGO_PATHS = [
        '/sys/kernel/fpsgo/common',
        '/sys/kernel/fpsgo/fstb',
        '/sys/kernel/fpsgo/fbt',
        '/sys/kernel/fpsgo/trace',
        '/sys/kernel/fpsgo/debug',
        '/sys/module/fpsgo/parameters',
        '/sys/module/gpu_fpsgo/parameters',
        '/sys/kernel/gpu_fpsgo',
        '/sys/devices/platform/soc/mtk_fpsgo',
        '/sys/devices/virtual/misc/fpsgo',
        '/sys/class/misc/fpsgo',
        '/sys/kernel/fpsgo/fre',
        '/sys/kernel/fpsgo/power'
    ];

    // === ALL KNOWN SYSTRACE FLAGS ===
    const ALL_SYSTRACE_FLAGS = [
        { id: 'MANDATORY', bit: 0, value: 1, label: 'Mandatory', desc: 'Core FPSGO tracing (required)', recommended: true, kernelMin: '4.14', kernelMax: null, aliases: ['FPSGO_TRACE', 'CORE', 'BASE'], category: 'core' },
        { id: 'FBT', bit: 1, value: 2, label: 'FBT', desc: 'Frame Buffer Tracker - frame timing', recommended: false, kernelMin: '4.14', kernelMax: null, aliases: ['FRAME_BUFFER', 'FRAME_TRACK'], category: 'frame' },
        { id: 'FSTB', bit: 2, value: 4, label: 'FSTB', desc: 'Frame Scheduler - boost decisions', recommended: true, kernelMin: '4.14', kernelMax: null, aliases: ['SCHEDULER', 'BOOST_SCHED', 'FRAME_SCHED'], category: 'scheduler' },
        { id: 'XGF', bit: 3, value: 8, label: 'XGF', desc: 'GPU/frame timeline (X Graphics Framework)', recommended: false, kernelMin: '4.14', kernelMax: null, aliases: ['GPU_XGF', 'TIMELINE', 'GPU_TRACE'], category: 'gpu' },
        { id: 'GBE', bit: 4, value: 16, label: 'GBE', desc: 'Game Boost Engine - aggressive mode', recommended: true, kernelMin: '4.19', kernelMax: null, aliases: ['GAME_BOOST', 'AGGRESSIVE'], category: 'boost' },
        { id: 'FBT_CTRL', bit: 5, value: 32, label: 'FBT_CTRL', desc: 'Advanced frame timing control', recommended: false, kernelMin: '5.4', kernelMax: null, aliases: ['FBT_ADVANCED', 'FRAME_CTRL'], category: 'frame' },
        { id: 'SCHED_TRACE', bit: 6, value: 64, label: 'SCHED', desc: 'Scheduler events & task migration', recommended: false, kernelMin: '4.14', kernelMax: null, aliases: ['SCHEDULER_TRACE', 'TASK_TRACE', 'CPU_SCHED'], category: 'scheduler' },
        { id: 'BOOST_TRACE', bit: 7, value: 128, label: 'BOOST', desc: 'CPU/GPU boost decision tracing', recommended: false, kernelMin: '4.19', kernelMax: null, aliases: ['FREQ_BOOST', 'PERF_BOOST', 'DYNAMIC_BOOST'], category: 'boost' },
        { id: 'FREQ_TRACE', bit: 8, value: 256, label: 'FREQ', desc: 'CPU/GPU frequency change events', recommended: false, kernelMin: '4.14', kernelMax: null, aliases: ['DVFS_TRACE', 'CLK_TRACE', 'FREQ_SCALE'], category: 'power' },
        { id: 'UCLAMP_TRACE', bit: 9, value: 512, label: 'UCLAMP', desc: 'Utilization clamping events', recommended: false, kernelMin: '5.4', kernelMax: null, aliases: ['UTIL_CLAMP', 'UCLAMP'], category: 'scheduler' },
        { id: 'GPU_TRACE', bit: 10, value: 1024, label: 'GPU', desc: 'GPU driver-specific tracing', recommended: false, kernelMin: '4.14', kernelMax: null, aliases: ['MALI_TRACE', 'PVR_TRACE', 'ADRENO_TRACE'], category: 'gpu' },
        { id: 'RENDER_TRACE', bit: 11, value: 2048, label: 'RENDER', desc: 'Render pipeline & composition', recommended: false, kernelMin: '4.19', kernelMax: null, aliases: ['COMPOSITOR', 'HWUI', 'SF_TRACE'], category: 'render' },
        { id: 'VSYNC_TRACE', bit: 12, value: 4096, label: 'VSYNC', desc: 'VSync signal & display events', recommended: false, kernelMin: '4.14', kernelMax: null, aliases: ['DISPLAY_SYNC', 'VSYNC_EVENT'], category: 'display' },
        { id: 'POWER_TRACE', bit: 13, value: 8192, label: 'POWER', desc: 'Power management & rail events', recommended: false, kernelMin: '4.14', kernelMax: null, aliases: ['PM_TRACE', 'RAIL_TRACE', 'POWER_MGMT'], category: 'power' },
        { id: 'THERMAL_TRACE', bit: 14, value: 16384, label: 'THERMAL', desc: 'Thermal throttling events', recommended: false, kernelMin: '4.19', kernelMax: null, aliases: ['TEMP_TRACE', 'THROTTLE', 'THERMAL_MGMT'], category: 'thermal' },
        { id: 'IO_TRACE', bit: 15, value: 32768, label: 'IO', desc: 'I/O latency & storage events', recommended: false, kernelMin: '4.14', kernelMax: null, aliases: ['STORAGE_TRACE', 'BLOCK_TRACE', 'DISK_IO'], category: 'io' },
        { id: 'MEM_TRACE', bit: 16, value: 65536, label: 'MEM', desc: 'Memory allocation & pressure', recommended: false, kernelMin: '4.19', kernelMax: null, aliases: ['MM_TRACE', 'ALLOC_TRACE', 'MEMORY_PRESSURE'], category: 'memory' },
        { id: 'IRQ_TRACE', bit: 17, value: 131072, label: 'IRQ', desc: 'Interrupt handling & latency', recommended: false, kernelMin: '4.14', kernelMax: null, aliases: ['INT_TRACE', 'HARDIRQ', 'SOFTIRQ'], category: 'irq' },
        { id: 'APP_TRACE', bit: 18, value: 262144, label: 'APP', desc: 'App lifecycle & foreground events', recommended: false, kernelMin: '4.19', kernelMax: null, aliases: ['ACTIVITY_TRACE', 'PROCESS_TRACE', 'APP_LIFECYCLE'], category: 'app' },
        { id: 'LATENCY_TRACE', bit: 19, value: 524288, label: 'LATENCY', desc: 'Frame latency & jank detection', recommended: true, kernelMin: '5.4', kernelMax: null, aliases: ['JANK_TRACE', 'FRAME_LATENCY', 'CHOREOGRAPHER'], category: 'frame' },
        { id: 'DEBUG_VERBOSE', bit: 20, value: 1048576, label: 'DEBUG', desc: 'Verbose debug output (dev only)', recommended: false, kernelMin: '5.10', kernelMax: null, aliases: ['VERBOSE', 'LOG_VERBOSE', 'DEBUG_LOG'], category: 'debug' },
        { id: 'FPSGO_EXT', bit: 21, value: 2097152, label: 'EXT', desc: 'Extended FPSGO features', recommended: false, kernelMin: '5.10', kernelMax: null, aliases: ['FPSGO_EXTENDED', 'EXTRA_TRACE', 'ADVANCED_FPSGO'], category: 'ext' },
        { id: 'PERF_HINT', bit: 22, value: 4194304, label: 'PERF_HINT', desc: 'Performance hint tracing', recommended: false, kernelMin: '5.15', kernelMax: null, aliases: ['HINT_TRACE', 'PERFORMANCE_HINT'], category: 'hint' },
        { id: 'ADAPTIVE_FPS', bit: 23, value: 8388608, label: 'ADAPTIVE', desc: 'Adaptive FPS control events', recommended: false, kernelMin: '5.15', kernelMax: null, aliases: ['FPS_ADAPTIVE', 'DYNAMIC_FPS'], category: 'fps' },
        { id: 'FRE', bit: 24, value: 16777216, label: 'FRE', desc: 'Frame Rate Enhancement - dynamic FPS optimization', recommended: true, kernelMin: '5.10', kernelMax: null, aliases: ['FRAME_RATE_ENHANCE', 'FRE_ENGINE', 'FPS_ENHANCE'], category: 'fps' },
        { id: 'FRE_THM', bit: 25, value: 33554432, label: 'FRE_THM', desc: 'FRE Thermal Management - thermal-aware FPS control', recommended: true, kernelMin: '5.10', kernelMax: null, aliases: ['FRE_THERMAL', 'FRE_THRESHOLD', 'FPS_THERMAL'], category: 'thermal' },
        { id: 'MTK_EXT_0', bit: 26, value: 67108864, label: 'MTK_EXT1', desc: 'MediaTek vendor extension 1', recommended: false, kernelMin: '4.14', kernelMax: null, aliases: ['MTK_VENDOR1', 'MEDIATEK_EXT1'], category: 'vendor' },        { id: 'MTK_EXT_1', bit: 27, value: 134217728, label: 'MTK_EXT2', desc: 'MediaTek vendor extension 2', recommended: false, kernelMin: '4.19', kernelMax: null, aliases: ['MTK_VENDOR2', 'MEDIATEK_EXT2'], category: 'vendor' },
        { id: 'QCOM_EXT', bit: 28, value: 268435456, label: 'QCOM_EXT', desc: 'Qualcomm vendor extension', recommended: false, kernelMin: '5.4', kernelMax: null, aliases: ['QUALCOMM_EXT', 'SNPE_TRACE'], category: 'vendor' }
    ];

    // === PRESETS ===
    const FPSGO_PRESETS = {
        minimal: { enable: 1, force: 1, mask: 1, desc: 'MANDATORY only', flags: ['MANDATORY'] },
        balanced: { enable: 1, force: 1, mask: 21, desc: 'MANDATORY+FSTB+GBE', flags: ['MANDATORY', 'FSTB', 'GBE'] },
        aggressive: { enable: 1, force: 1, mask: 63, desc: 'All common flags', flags: ['MANDATORY', 'FBT', 'FSTB', 'XGF', 'GBE', 'FBT_CTRL'] },
        esports: { enable: 1, force: 1, mask: 50331669, desc: 'Competitive + FRE', flags: ['MANDATORY', 'FSTB', 'GBE', 'FBT_CTRL', 'LATENCY_TRACE', 'FRE', 'FRE_THM'] },
        fre_optimized: { enable: 1, force: 1, mask: 50331648, desc: 'FRE-focused (latest devices)', flags: ['MANDATORY', 'FRE', 'FRE_THM', 'LATENCY_TRACE', 'ADAPTIVE_FPS'] },
        debug: { enable: 1, force: 1, mask: 536870911, desc: 'All flags (debug)', flags: ALL_SYSTRACE_FLAGS.map(f => f.id) },
        disabled: { enable: 0, force: 0, mask: 0, desc: 'FPSGO off', flags: [] }
    };

    // === TWEAK PATTERNS ===
    const FPSGO_TWEAK_PATTERNS = [
        { keywords: ['render_loading', 'loading'], label: 'Render Loading', desc: 'CPU loading threshold for boosting', min: 1, max: 100, step: 1, unit: '%', rec: 30, danger: 10 },
        { keywords: ['stop_boost', 'deboost'], label: 'Stop Boost', desc: 'Threshold to stop boosting', min: 1, max: 100, step: 1, unit: '%', rec: 70, danger: 90 },
        { keywords: ['blc_boost', 'boost_ta', 'uclamp_boost'], label: 'Boost Control', desc: 'General boost intensity', min: 0, max: 10, step: 1, unit: 'lvl', rec: 0, danger: 10 },
        { keywords: ['limit_cfreq', 'cfreq'], label: 'CPU Freq Limit', desc: 'Max CPU frequency limit', min: 0, max: 3000000, step: 100000, unit: 'kHz', rec: 0, danger: 1000000 },
        { keywords: ['fstb_soft_level', 'soft_level'], label: 'FSTB Soft Level', desc: 'Frame scheduler soft level', min: 0, max: 10, step: 1, unit: 'lvl', rec: 0, danger: 10 },
        { keywords: ['enable_ceiling', 'ceiling'], label: 'FPS Ceiling', desc: 'Max FPS cap', min: 0, max: 144, step: 5, unit: 'FPS', rec: 0, danger: 30 },
        { keywords: ['light_loading_policy'], label: 'Light Loading Policy', desc: 'Policy for light loading scenarios', min: 0, max: 1, step: 1, unit: '', rec: 1, danger: 0 },
        { keywords: ['adopt_low_fps'], label: 'Adopt Low FPS', desc: 'Allow low FPS adoption', min: 0, max: 1, step: 1, unit: '', rec: 1, danger: 0 },
        { keywords: ['fre_threshold', 'fre_thresh'], label: 'FRE Threshold', desc: 'Frame rate threshold for FRE activation', min: 30, max: 120, step: 5, unit: 'FPS', rec: 60, danger: 30 },
        { keywords: ['fre_thm_temp', 'fre_thermal'], label: 'FRE Thermal Limit', desc: 'Max temperature for FRE operation', min: 30, max: 85, step: 1, unit: '°C', rec: 45, danger: 70 }
    ];

    // === GLOBAL STATE ===
    let detectedPaths = [];
    let detectedTweaks = {};
    let discoveredFiles = [];
    let systraceMaskPath = null;
    let systraceStatusPath = null;
    let enablePath = null;
    let forcePath = null;
    let kernelVersion = null;
    let deviceModel = null;
    let execAvailable = false;
    
    let state = { 
        preset: 'balanced', 
        customMask: null, 
        enable: 1, 
        force: 1, 
        customTweaks: {},
        discoveredFlags: [],
        lastScanTime: 0
    };
    // === FIXED EXECUTION WRAPPER ===
    const execFn = async function(cmd, timeout = 10000) {
        return new Promise((resolve) => {
            // Check if we have a working exec method
            const hasKsu = typeof window.ksu !== 'undefined' && window.ksu !== null && typeof window.ksu.exec === 'function';
            const hasExec = typeof window.exec !== 'undefined' && window.exec !== null && typeof window.exec === 'function';
            
            if (!hasKsu && !hasExec) {
                console.error('[FPSGO] No root exec method available');
                resolve('');
                return;
            }
            
            const callbackName = 'fpsgo_cb_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
            let timeoutId = null;
            
            // Create callback handler
            window[callbackName] = function(_, result) {
                if (timeoutId) clearTimeout(timeoutId);
                try {
                    delete window[callbackName];
                } catch (e) {
                    window[callbackName] = undefined;
                }
                resolve(result || '');
            };
            
            // Set timeout
            timeoutId = setTimeout(() => {
                try {
                    delete window[callbackName];
                } catch (e) {
                    window[callbackName] = undefined;
                }
                console.warn('[FPSGO] Command timeout:', cmd);
                resolve('');
            }, timeout);
            
            // Execute command
            try {
                if (hasKsu) {
                    window.ksu.exec(cmd, 'window.' + callbackName);
                } else if (hasExec) {
                    window.exec(cmd, 'window.' + callbackName);
                }
            } catch (e) {
                console.error('[FPSGO] Exec error:', e.message);
                if (timeoutId) clearTimeout(timeoutId);
                try {                    delete window[callbackName];
                } catch (delErr) {
                    window[callbackName] = undefined;
                }
                resolve('');
            }
        });
    };

    // Test exec availability
    async function testExecAvailability() {
        try {
            const result = await execFn('echo test');
            execAvailable = result.trim() === 'test';
            return execAvailable;
        } catch (e) {
            execAvailable = false;
            return false;
        }
    }

    // === FILE I/O HELPERS ===
    async function readRawFile(path) {
        if (!path || !execAvailable) return '';
        try {
            let val = await execFn('cat "' + path + '" 2>&1');
            if (val && !val.toLowerCase().includes('no such') && !val.toLowerCase().includes('permission') && val.trim()) {
                return val.trim();
            }
            return '';
        } catch (e) { 
            return ''; 
        }
    }

    async function writeRawFile(path, value) {
        if (!path || !execAvailable) return false;
        try {
            const safeVal = String(value).replace(/[^a-zA-Z0-9._\-\s]/g, '');
            const result = await execFn('echo "' + safeVal + '" > "' + path + '" 2>&1');
            return !result.toLowerCase().includes('permission') && !result.toLowerCase().includes('readonly');
        } catch (e) { 
            return false; 
        }
    }

    // === SYSTEM DETECTION ===
    async function detectSystemInfo() {
        if (!execAvailable) return { kernel: null, device: null, android: null };
        try {            const ver = await execFn('uname -r 2>/dev/null');
            kernelVersion = ver.trim() || null;
            
            const model = await execFn('getprop ro.product.model 2>/dev/null');
            deviceModel = model.trim() || null;
            
            const androidVer = await execFn('getprop ro.build.version.release 2>/dev/null');
            
            return {
                kernel: kernelVersion,
                device: deviceModel,
                android: androidVer.trim() || null,
                parsedKernel: parseKernelVersion(kernelVersion)
            };
        } catch (e) {
            return { kernel: null, device: null, android: null };
        }
    }

    function parseKernelVersion(ver) {
        if (!ver) return { major: 4, minor: 14, patch: 0, full: '4.14.0' };
        const match = ver.match(/(\d+)\.(\d+)(?:\.(\d+))?/);
        if (match) {
            return {
                major: parseInt(match[1]) || 4,
                minor: parseInt(match[2]) || 14,
                patch: parseInt(match[3]) || 0,
                full: ver
            };
        }
        return { major: 4, minor: 14, patch: 0, full: ver };
    }

    function isKernelCompatible(flag, kernelVer) {
        if (!kernelVer) return true;
        const kv = parseKernelVersion(kernelVer);
        const minKv = flag.kernelMin ? parseKernelVersion(flag.kernelMin) : { major: 4, minor: 14 };
        
        const current = kv.major * 10000 + kv.minor * 100 + kv.patch;
        const min = minKv.major * 10000 + minKv.minor * 100 + minKv.patch;
        
        return current >= min;
    }

    // === SYSTRACE STATUS PARSER ===
    function parseSystraceStatus(text) {
        if (!text) return { mask: 1, activeFlags: ['MANDATORY'], raw: '', detected: {} };
        
        const flagLookup = {};
        ALL_SYSTRACE_FLAGS.forEach(flag => {            flagLookup[flag.id.toUpperCase()] = { value: flag.value, id: flag.id };
            flagLookup[flag.label.toUpperCase()] = { value: flag.value, id: flag.id };
            (flag.aliases || []).forEach(alias => {
                flagLookup[alias.toUpperCase()] = { value: flag.value, id: flag.id };
            });
        });
        
        let mask = 0;
        const active = [];
        const detected = {};
        const lines = text.split('\n');
        
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            
            const upper = trimmed.toUpperCase();
            const isOn = upper.includes('ON') || upper.includes('ENABLED') || upper.includes(': 1') || upper.match(/\.\.\.\s*ON$/i);
            const isOff = upper.includes('OFF') || upper.includes('DISABLED') || upper.includes(': 0') || upper.match(/\.\.\.\s*OFF$/i);
            
            if (isOff && !isOn) continue;
            
            for (const [name, info] of Object.entries(flagLookup)) {
                const regex = new RegExp('\\b' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i');
                if (regex.test(trimmed) && (isOn || !isOff)) {
                    mask |= info.value;
                    if (!active.includes(info.id)) {
                        active.push(info.id);
                        detected[info.id] = { name: name, state: isOn ? 'on' : 'unknown', line: trimmed };
                    }
                }
            }
            
            const namedFormat = trimmed.match(/^\s*([A-Z_][A-Z0-9_]*)\s*\.{2,}\s*(ON|OFF|ENABLED|DISABLED|\d)/i);
            if (namedFormat) {
                const flagName = namedFormat[1].toUpperCase();
                const flagState = namedFormat[2].toUpperCase();
                if (flagLookup[flagName] && (flagState === 'ON' || flagState === 'ENABLED' || flagState === '1')) {
                    const info = flagLookup[flagName];
                    mask |= info.value;
                    if (!active.includes(info.id)) {
                        active.push(info.id);
                        detected[info.id] = { name: flagName, state: 'on', line: trimmed };
                    }
                }
            }
        }
        
        return { mask: mask || 1, activeFlags: active.length ? active : ['MANDATORY'], raw: text, detected: detected };
    }
    // === MAIN DETECTION ===
    async function detectAndScan() {
        const startTime = Date.now();
        detectedPaths = [];
        detectedTweaks = {};
        discoveredFiles = [];
        systraceMaskPath = null;
        systraceStatusPath = null;
        enablePath = null;
        forcePath = null;
        state.discoveredFlags = [];

        const statusDiv = document.getElementById('fpsgo-scan-status');
        const pathsDiv = document.getElementById('fpsgo-paths-container');

        if (!statusDiv || !pathsDiv) return;

        // Test exec first
        statusDiv.innerHTML = '🔌 Testing root access...';
        statusDiv.style.color = '#fbbf24';
        
        const execOk = await testExecAvailability();
        
        if (!execOk) {
            statusDiv.innerHTML = '<span style="color:#ef4444;">❌ Root exec not available<br><small>Check if KernelSU/Root is properly installed</small></span>';
            pathsDiv.innerHTML = '<div style="color:#666;font-size:11px;text-align:center;padding:10px;">⚠️ Cannot execute commands</div>';
            return;
        }

        statusDiv.innerHTML = '🔍 Detecting system...';
        
        try {
            const sysInfo = await detectSystemInfo();
            statusDiv.innerHTML = `📱 ${sysInfo.device || 'Unknown'} • 🐧 ${sysInfo.kernel || 'Unknown'} • 🔍 Scanning...`;

            for (const path of FPSGO_PATHS) {
                try {
                    const exists = await execFn(`test -e "${path}" && echo yes || echo no`);
                    if (exists.trim() === 'yes') {
                        detectedPaths.push(path);
                        
                        try {
                            const fileList = await execFn(`ls -1 "${path}" 2>/dev/null`);
                            const files = fileList.split('\n').map(f => f.trim()).filter(f => f && !f.startsWith('ls:'));
                            discoveredFiles.push({ dir: path, files });

                            if (files.includes('systrace_mask')) systraceMaskPath = path + '/systrace_mask';
                            if (files.includes('systrace_status')) systraceStatusPath = path + '/systrace_status';
                            if (files.includes('fpsgo_enable')) enablePath = path + '/fpsgo_enable';                            if (files.includes('force_onoff')) forcePath = path + '/force_onoff';
                            if (files.includes('enable')) enablePath = enablePath || path + '/enable';

                            for (const fname of files) {
                                const lowerName = fname.toLowerCase().replace(/[_\-\s]/g, '');
                                for (const pattern of FPSGO_TWEAK_PATTERNS) {
                                    if (pattern.keywords.some(k => 
                                        lowerName.includes(k.toLowerCase().replace(/[_\-\s]/g, ''))
                                    )) {
                                        const fullPath = path + '/' + fname;
                                        const val = await readRawFile(fullPath);
                                        if (!detectedTweaks[pattern.keywords[0]]) {
                                            detectedTweaks[pattern.keywords[0]] = { 
                                                path: fullPath, 
                                                value: val, 
                                                config: { ...pattern, id: pattern.keywords[0] }
                                            };
                                        }
                                        break;
                                    }
                                }
                            }
                        } catch (e) {
                            console.log('Error listing ' + path, e);
                        }
                    }
                } catch (e) {
                    console.log('Error checking ' + path, e);
                }
            }

            if (detectedPaths.length === 0) {
                pathsDiv.innerHTML = '<div style="color:#666;font-size:11px;text-align:center;padding:10px;">❌ No FPSGO paths found</div>';
                statusDiv.innerHTML = '<span style="color:#ef4444;">❌ FPSGO not detected on this device</span>';
                return;
            }

            let html = '<div style="color:#8b92b4;font-size:11px;margin-bottom:8px;text-align:center;">📍 Active Paths</div>';
            detectedPaths.forEach(p => {
                const found = discoveredFiles.find(f => f.dir === p);
                const fileCount = found ? found.files.length : 0;
                html += `<div style="padding:6px;background:rgba(239,68,68,0.1);border:1px solid #ef4444;border-radius:6px;margin-bottom:4px;font-size:10px;color:#fff;"><span style="color:#10b981;">●</span> ${p} <span style="float:right;color:#aaa;">${fileCount} files</span></div>`;
            });
            pathsDiv.innerHTML = html;
            
            statusDiv.innerHTML = `<span style="color:#10b981;">✅ Found ${detectedPaths.length} path(s) • ${Date.now() - startTime}ms</span>`;

            if (enablePath) {
                const val = await readRawFile(enablePath);
                state.enable = parseInt(val) || (val?.toLowerCase().includes('on') ? 1 : 0) || 1;            }
            if (forcePath) {
                const val = await readRawFile(forcePath);
                state.force = parseInt(val) || (val?.toLowerCase().includes('on') ? 1 : 0) || 1;
            }
            
            if (systraceStatusPath) {
                const parsed = parseSystraceStatus(await readRawFile(systraceStatusPath));
                state.customMask = parsed.mask;
            } else if (systraceMaskPath) {
                const raw = await readRawFile(systraceMaskPath);
                state.customMask = parseInt(raw) || 1;
            }

            state.preset = 'custom';
            state.lastScanTime = Date.now();
            saveState();

            setTimeout(() => {
                setupMasterControls();
                renderPresets(document.getElementById('preset-list'));
                
                const flagsContainer = document.getElementById('systrace-flags');
                if (flagsContainer) {
                    renderSystraceFlags(flagsContainer, state.discoveredFlags);
                }
                
                renderTweakControls(document.getElementById('tweak-controls'));
                
                const display = document.getElementById('mask-display');
                if (display) {
                    display.textContent = `(Mask: ${state.customMask || 1})`;
                }
            }, 50);

        } catch (err) {
            console.error('[FPSGO] Scan error:', err);
            statusDiv.innerHTML = '<span style="color:#ef4444;">❌ Scan failed: ' + (err.message || err) + '</span>';
        }
    }

    // === STATE MANAGEMENT ===
    function loadState() {
        try { 
            const s = localStorage.getItem('fpsgo_settings'); 
            if (s) {
                const parsed = JSON.parse(s);
                state = { ...state, ...parsed, discoveredFlags: parsed.discoveredFlags || [] };
            }
        } catch (e) { console.log('[FPSGO] Load state error:', e); }    }

    function saveState() { 
        try { localStorage.setItem('fpsgo_settings', JSON.stringify(state)); } 
        catch (e) { console.log('[FPSGO] Save state error:', e); }
    }

    // === UI RENDERING ===
    function renderPresets(container) {
        if (!container) return;
        container.innerHTML = '';
        
        Object.entries(FPSGO_PRESETS).forEach(([id, preset]) => {
            const isSelected = state.preset === id && state.customMask === null;
            const card = document.createElement('div');
            card.style.cssText = `padding:10px;border-radius:8px;cursor:pointer;background:${isSelected ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.05)'};border:${isSelected ? '1px solid #ef4444' : '1px solid transparent'};text-align:center;`;
            
            card.innerHTML = `
                <div style="color:#fff;font-weight:600;font-size:12px;">${id.toUpperCase()}</div>
                <div style="color:#888;font-size:10px;margin:4px 0;">${preset.desc}</div>
            `;
            card.onclick = async () => {
                state.preset = id;
                state.customMask = null;
                await applyPreset(preset);
                renderPresets(container);
            };
            container.appendChild(card);
        });
    }

    function renderSystraceFlags(container, discoveredFlags = null) {
        if (!container) return;
        
        const flagsToRender = discoveredFlags && discoveredFlags.length > 0 ? discoveredFlags : ALL_SYSTRACE_FLAGS.map(f => ({...f, supported: true}));
        const showUnsupported = document.getElementById('show-unsupported')?.checked || false;
        const currentMask = state.customMask !== null ? state.customMask : (FPSGO_PRESETS[state.preset]?.mask || 1);
        
        const displayFlags = flagsToRender.filter(flag => showUnsupported || flag.id === 'MANDATORY' || flag.recommended);
        
        container.innerHTML = '';
        
        if (displayFlags.length === 0) {
            container.innerHTML = '<div style="color:#666;font-size:11px;text-align:center;padding:15px;">No flags to display</div>';
            return;
        }
        
        displayFlags.forEach(flag => {
            const checked = (currentMask & flag.value) !== 0;
            const label = document.createElement('label');            label.style.cssText = `display:flex;align-items:center;gap:8px;padding:8px;background:${checked ? 'rgba(239,68,68,0.15)' : 'rgba(255,255,255,0.05)'};border:1px solid ${checked ? 'rgba(239,68,68,0.4)' : 'transparent'};border-radius:6px;cursor:pointer;`;
            
            label.innerHTML = `
                <input type="checkbox" class="systrace-flag" data-value="${flag.value}" data-id="${flag.id}" 
                    ${checked ? 'checked' : ''} style="accent-color:#ef4444;">
                <div style="flex:1;">
                    <div style="color:#fff;font-size:11px;font-weight:500;">${flag.label}${flag.recommended ? ' ⭐' : ''}</div>
                    <div style="color:#888;font-size:9px;">${flag.desc}</div>
                </div>
            `;
            container.appendChild(label);
        });

        container.querySelectorAll('.systrace-flag').forEach(cb => {
            cb.onchange = () => {
                let newMask = 0;
                container.querySelectorAll('.systrace-flag:checked').forEach(c => {
                    newMask |= parseInt(c.dataset.value);
                });
                newMask |= 1;
                
                state.customMask = newMask;
                state.preset = 'custom';
                saveState();
                
                const display = document.getElementById('mask-display');
                if (display) display.textContent = '(Mask: ' + newMask + ')';
                renderPresets(document.getElementById('preset-list'));
            };
        });

        const display = document.getElementById('mask-display');
        if (display) {
            display.textContent = `(Mask: ${currentMask})`;
        }
    }

    function renderTweakControls(container) {
        if (!container) return;
        container.innerHTML = '';
        
        const knownIds = Object.keys(detectedTweaks);
        
        if (knownIds.length === 0 && detectedPaths.length > 0) {
            container.innerHTML = '<div style="color:#fbbf24;font-size:11px;text-align:center;padding:12px;background:rgba(251,191,36,0.1);border-radius:8px;margin:10px 0;">⚠️ No tweak parameters detected</div>';
            return;
        }

        const title = document.createElement('div');
        title.style.cssText = 'color:#fff;font-weight:600;margin:15px 0 10px;';        title.textContent = '⚙️ Advanced Tweaks';
        container.appendChild(title);

        for (const id of knownIds) {
            const data = detectedTweaks[id];
            const cfg = data.config;
            const val = state.customTweaks[id] !== undefined ? state.customTweaks[id] : parseInt(data.value) || cfg.rec;
            
            const row = document.createElement('div');
            row.style.cssText = 'margin-bottom:14px;padding:10px;background:rgba(255,255,255,0.03);border-radius:8px;';
            
            row.innerHTML = `
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                    <span style="color:#fff;font-size:12px;font-weight:500;">${cfg.label}</span>
                    <span style="color:#10b981;font-size:11px;font-weight:600;">${val}${cfg.unit}</span>
                </div>
                <input type="range" class="tweak-slider" data-id="${id}" min="${cfg.min}" max="${cfg.max}" step="${cfg.step}" value="${val}" style="width:100%;accent-color:#ef4444;">
            `;
            container.appendChild(row);
        }

        container.querySelectorAll('.tweak-slider').forEach(slider => {
            const id = slider.dataset.id;
            const cfg = detectedTweaks[id]?.config;
            
            slider.oninput = (e) => {
                const val = parseInt(e.target.value);
                state.customTweaks[id] = val;
                state.preset = 'custom';
                saveState();
                
                const row = e.target.closest('div[style*="margin-bottom"]');
                const display = row.querySelector('span[style*="color:#10b981"]');
                if (display) display.textContent = val + cfg.unit;
            };
            
            slider.onchange = async (e) => {
                const val = parseInt(e.target.value);
                if (detectedTweaks[id]?.path) {
                    await writeRawFile(detectedTweaks[id].path, val);
                }
            };
        });
    }

    function setupMasterControls() {
        const enableCb = document.querySelector('#master-enable input');
        const forceCb = document.querySelector('#master-force input');
        
        if (enableCb) {            enableCb.checked = state.enable === 1;
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
        document.querySelectorAll('.systrace-flag:checked').forEach(cb => {
            mask |= parseInt(cb.dataset.value);
        });
        mask |= 1;
        
        const btn = document.getElementById('apply-mask-btn');
        if (!btn || !systraceMaskPath) return;
        
        const orig = btn.innerHTML;
        btn.innerHTML = '⏳ Applying...';
        
        await writeRawFile(systraceMaskPath, mask);
        state.customMask = mask;
        state.preset = 'custom';
        saveState();
        
        btn.innerHTML = '✅ Applied!';
        setTimeout(() => { btn.innerHTML = orig; }, 1500);
    }

    async function applyPreset(preset) {
        if (enablePath) await writeRawFile(enablePath, preset.enable);
        if (forcePath) await writeRawFile(forcePath, preset.force);
        if (systraceMaskPath) await writeRawFile(systraceMaskPath, preset.mask);
        
        state = { ...state, enable: preset.enable, force: preset.force, customMask: null, preset: Object.keys(FPSGO_PRESETS).find(k => FPSGO_PRESETS[k] === preset) };
        saveState();
        
        setupMasterControls(); 
        updateSystraceCheckboxes(preset.mask); 
        renderPresets(document.getElementById('preset-list'));
        
        // Refresh terminal to show new mask
        setTimeout(updateTerminalStatus, 200);
    }

    function updateSystraceCheckboxes(mask) {
        const container = document.getElementById('systrace-flags');
        if (!container) return;
        container.querySelectorAll('.systrace-flag').forEach(cb => {
            const val = parseInt(cb.dataset.value);
            cb.checked = (mask & val) !== 0;
        });
    }

    // === MODAL ===
    async function showFpsgoModal() {
        const existing = document.getElementById('fpsgo-modal');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = 'fpsgo-modal';
        modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.9);z-index:10000;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(10px);padding:10px;';
        
        const box = document.createElement('div');
        box.style.cssText = 'background:linear-gradient(135deg,#1a1f3a,#2d3561);border:2px solid #ef4444;border-radius:20px;padding:20px;width:100%;max-width:600px;max-height:95vh;overflow-y:auto;';

        box.innerHTML = `
            <div style="background:rgba(239,68,68,0.15);border:1px solid rgba(239,68,68,0.4);border-radius:12px;padding:12px;margin-bottom:12px;">
                <div style="color:#ef4444;font-weight:600;">️ Bootloop Warning</div>
                <div style="color:#fca5a5;font-size:11px;margin-top:6px;">Incorrect settings can cause bootloops. Delete /data/adb/service.d/fpsgo.sh in recovery if stuck.</div>
            </div>
            
            <!-- TERMINAL STATUS BOX -->
            <div style="background:#0d1117;border:1px solid #30363d;border-radius:8px;padding:10px 12px;margin-bottom:15px;font-family:'Courier New',monospace;">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;border-bottom:1px solid #21262d;padding-bottom:6px;">
                    <span style="color:#8b949e;font-size:11px;font-weight:600;">📟 Live Systrace Status</span>
                    <button id="refresh-terminal" style="background:#21262d;color:#c9d1d9;border:1px solid #30363d;border-radius:4px;padding:2px 8px;font-size:10px;cursor:pointer;transition:all 0.2s;">↻ Refresh</button>
                </div>
                <div id="terminal-output" style="color:#3fb950;font-size:12px;line-height:1.4;min-height:36px;">$ su -c cat /sys/kernel/fpsgo/common/systrace_mask<br>Initializing...</div>
            </div>
            <!-- END TERMINAL -->

            <h3 style="color:#ef4444;margin:0 0 15px;text-align:center;">FPSGO Manager <span style="font-size:12px;color:#888;">v2.2 Terminal</span></h3>
        `;

        const presetDiv = document.createElement('div'); 
        presetDiv.id = 'preset-list'; 
        presetDiv.style.cssText = 'display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:15px;'; 
        box.appendChild(presetDiv);
        
        box.innerHTML += `
            <div style="color:#fff;font-weight:600;margin:15px 0 8px;">🎛️ Master Controls</div>
            <div style="display:flex;gap:8px;margin-bottom:15px;">
                <label id="master-enable" style="flex:1;display:flex;align-items:center;gap:8px;padding:10px;background:rgba(255,255,255,0.05);border-radius:8px;cursor:pointer;">
                    <input type="checkbox" style="accent-color:#ef4444;">
                    <span style="color:#aaa;font-size:12px;">Enable FPSGO</span>
                </label>
                <label id="master-force" style="flex:1;display:flex;align-items:center;gap:8px;padding:10px;background:rgba(255,255,255,0.05);border-radius:8px;cursor:pointer;">
                    <input type="checkbox" style="accent-color:#ef4444;">
                    <span style="color:#aaa;font-size:12px;">Force Apply</span>
                </label>
            </div>        `;

        box.innerHTML += `
            <div style="color:#fff;font-weight:600;margin:15px 0 8px;display:flex;justify-content:space-between;align-items:center;">
                <span>🔍 Systrace Flags <span id="mask-display" style="color:#ef4444;font-size:11px;">(Mask: ?)</span></span>
                <label style="font-size:10px;color:#888;cursor:pointer;">
                    <input type="checkbox" id="show-unsupported" style="accent-color:#fbbf24;"> Show all
                </label>
            </div>
        `;
        
        const flagsDiv = document.createElement('div'); 
        flagsDiv.id = 'systrace-flags'; 
        flagsDiv.style.cssText = 'display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-bottom:10px;max-height:200px;overflow-y:auto;'; 
        box.appendChild(flagsDiv);

        const applyBtn = document.createElement('button'); 
        applyBtn.id = 'apply-mask-btn'; 
        applyBtn.style.cssText = 'width:100%;padding:10px;background:linear-gradient(135deg,#ef4444,#f97316);color:#fff;border:none;border-radius:8px;font-weight:600;cursor:pointer;margin-bottom:15px;'; 
        applyBtn.innerHTML = '💾 Apply Custom Mask'; 
        box.appendChild(applyBtn);

        const tweakDiv = document.createElement('div'); 
        tweakDiv.id = 'tweak-controls'; 
        tweakDiv.style.cssText = 'margin-bottom:15px;'; 
        box.appendChild(tweakDiv);

        const pathsDiv = document.createElement('div'); 
        pathsDiv.id = 'fpsgo-paths-container'; 
        pathsDiv.style.cssText = 'margin-bottom:15px;'; 
        box.appendChild(pathsDiv);

        const statusDiv = document.createElement('div'); 
        statusDiv.id = 'fpsgo-scan-status'; 
        statusDiv.style.cssText = 'text-align:center;padding:10px;background:rgba(0,0,0,0.2);border-radius:8px;margin-bottom:15px;font-size:12px;color:#666;'; 
        statusDiv.innerHTML = '🔄 Starting...'; 
        box.appendChild(statusDiv);

        const bootBtn = document.createElement('button'); 
        bootBtn.style.cssText = 'width:100%;padding:12px;background:rgba(16,185,129,0.15);color:#10b981;border:1px solid #10b981;border-radius:10px;margin-bottom:10px;cursor:pointer;font-weight:600;'; 
        bootBtn.innerHTML = '⚡ Create Boot Script'; 
        bootBtn.onclick = async function() { await generateBootScript(this); }; 
        box.appendChild(bootBtn);

        const closeBtn = document.createElement('button'); 
        closeBtn.style.cssText = 'width:100%;padding:12px;background:rgba(255,255,255,0.1);color:#fff;border:none;border-radius:10px;cursor:pointer;'; 
        closeBtn.textContent = '✕ Close'; 
        closeBtn.onclick = () => modal.remove(); 
        box.appendChild(closeBtn);
        modal.appendChild(box); 
        document.body.appendChild(modal);

        // Terminal refresh button
        document.getElementById('refresh-terminal').onclick = () => updateTerminalStatus();
        
        // Category & unsupported toggles
        const categoryFilter = document.getElementById('category-filter');
        const showUnsupported = document.getElementById('show-unsupported');
        if (categoryFilter) categoryFilter.onchange = () => renderSystraceFlags(document.getElementById('systrace-flags'), state.discoveredFlags);
        if (showUnsupported) showUnsupported.onchange = () => renderSystraceFlags(document.getElementById('systrace-flags'), state.discoveredFlags);
        
        document.getElementById('apply-mask-btn').onclick = async () => {
            await applyCustomMask();
            setTimeout(updateTerminalStatus, 300); // Refresh terminal after apply
        };

        renderPresets(document.getElementById('preset-list'));
        setupMasterControls();
        
        // Initial scan & terminal load
        setTimeout(async () => {
            await detectAndScan();
            renderTweakControls(document.getElementById('tweak-controls'));
            renderSystraceFlags(document.getElementById('systrace-flags'), state.discoveredFlags);
            await updateTerminalStatus(); // Load terminal status after scan
        }, 100);
    }
    
    async function updateTerminalStatus() {
    const output = document.getElementById('terminal-output');
    if (!output) return;
    
    const targetPath = systraceMaskPath || '/sys/kernel/fpsgo/common/systrace_mask';
    output.innerHTML = `<span style="color:#8b949e;">$ su -c cat ${targetPath}</span><br><span style="color:#f0883e;">Reading...</span>`;
    
    if (!execAvailable) {
        output.innerHTML += `<br><span style="color:#f85149;">⚠ Root exec not available</span>`;
        return;
    }
    
    try {
        const result = await execFn(`cat "${targetPath}" 2>&1`);
        const clean = result.trim();
        
        if (clean && !clean.toLowerCase().includes('no such') && !clean.toLowerCase().includes('permission')) {
            const mask = parseInt(clean) || 0;
            const hex = mask.toString(16).toUpperCase();
            const activeFlags = ALL_SYSTRACE_FLAGS.filter(f => mask & f.value).map(f => f.label);
            
            output.innerHTML = `
                <span style="color:#8b949e;">$ su -c cat ${targetPath}</span><br>
                <span style="color:#3fb950;font-weight:bold;">${clean}</span><br>
                <span style="color:#58a6ff;">Hex: 0x${hex} | Decimal: ${mask}</span><br>
                <span style="color:#d2a8ff;">Flags: ${activeFlags.length ? activeFlags.join(', ') : 'None'}</span>
            `;
        } else {
            output.innerHTML += `<br><span style="color:#f85149;"> ${clean || 'Path not found'}</span>`;
        }
    } catch (e) {
        output.innerHTML += `<br><span style="color:#f85149;">❌ Error: ${e.message}</span>`;
    }
}

    async function generateBootScript(btnRef) {
        if (!execAvailable || !systraceMaskPath) {
            alert('❌ Cannot create boot script: FPSGO not detected or root unavailable');
            return;
        }
        
        const originalText = btnRef.innerHTML;
        btnRef.innerHTML = '⏳ Installing...';
        
        const enableCb = document.querySelector('#master-enable input');
        const forceCb = document.querySelector('#master-force input');
        const enableVal = (enableCb && enableCb.checked) ? 1 : 0;
        const forceVal = (forceCb && forceCb.checked) ? 1 : 0;
        
        let maskVal = state.customMask || 1;
        
        const filePath = '/data/adb/service.d/fpsgo.sh';
        
        try {
            await execFn('mkdir -p /data/adb/service.d 2>&1');
            
            const script = `#!/system/bin/sh
# FPSGO Boot Script
sleep 25
[ -f "${enablePath}" ] && echo ${enableVal} > "${enablePath}"
[ -f "${forcePath}" ] && echo ${forceVal} > "${forcePath}"
[ -f "${systraceMaskPath}" ] && echo ${maskVal} > "${systraceMaskPath}"
exit 0`;
            
            await execFn('echo "' + script.replace(/\n/g, '\\n') + '" > "' + filePath + '"');
            await execFn('chmod 755 "' + filePath + '"');
            
            btnRef.innerHTML = '✅ Installed!';
            setTimeout(() => {                alert('✅ Boot script created at ' + filePath);
                btnRef.innerHTML = originalText;
            }, 500);
        } catch (e) {
            btnRef.innerHTML = '❌ Failed';
            setTimeout(() => { 
                alert('Failed: ' + e.message); 
                btnRef.innerHTML = originalText; 
            }, 500);
        }
    }

    // === INIT ===
    async function init() {
        loadState();
        const btn = document.getElementById('fpsgo-btn');
        if (btn) {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                showFpsgoModal();
            });
            btn.style.cursor = 'pointer';
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    window.FpsgoManager = { 
        init, 
        showFpsgoModal,
        detectAndScan,
        ALL_SYSTRACE_FLAGS,
        FPSGO_PRESETS
    };
    
    console.log('[FPSGO] Manager v2.2 Fixed loaded');
})();