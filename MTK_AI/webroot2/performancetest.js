// performancetest.js - Device Performance & Thermal Analyzer (WITH DURATION SLIDER)
(function() {
    'use strict';

    const execFn = window.exec || async function(cmd, timeout = 10000) {
        return new Promise(resolve => {
            const cb = `perf_exec_${Date.now()}_${Math.random().toString(36).slice(2)}`;
            const t = setTimeout(() => { delete window[cb]; resolve(''); }, timeout);
            window[cb] = (_, res) => { clearTimeout(t); delete window[cb]; resolve(res || ''); };
            if (window.ksu) ksu.exec(cmd, `window.${cb}`);
            else { clearTimeout(t); resolve(''); }
        });
    };

    // 🔍 Test State
    let results = {
        storage: 0, cpuFreq: [], cpuStability: 0, gpuFPS: 0, 
        ramSpeed: 0, zramRatio: 0, thermalDelta: 0, thermalProfile: ''
    };
    let testRunning = false;
    let testDuration = 30000; // Default 30 seconds

    function bindClickHandler() {
        const btn = document.getElementById('performance-test-btn');
        if (!btn) { console.warn('PerfTest: Button not found'); return; }
        btn.addEventListener('click', () => showPerfModal());
    }

    function showPerfModal() {
        const existing = document.getElementById('perf-modal');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = 'perf-modal';
        modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:10000;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(5px);';

        const box = document.createElement('div');
        box.style.cssText = 'background:linear-gradient(135deg,#1a1f3a,#2d3561);border:2px solid #8b5cf6;border-radius:20px;padding:24px;width:95%;max-width:500px;max-height:90vh;overflow-y:auto;';

        box.innerHTML = `
            <h3 style="color:#8b5cf6;margin:0 0 5px;font-size:20px;text-align:center;">📊 Performance Analyzer</h3>
            <p style="color:#8b92b4;font-size:12px;text-align:center;margin-bottom:20px;">Safe benchmarks & device analysis</p>

            <!-- Duration Slider -->
            <div style="background:rgba(0,0,0,0.3);border-radius:12px;padding:16px;margin-bottom:15px;">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                    <label style="color:#fff;font-size:13px;font-weight:600;">⏱️ Test Duration</label>
                    <span id="duration-display" style="color:#8b5cf6;font-size:14px;font-weight:bold;">30 sec</span>
                </div>
                <input type="range" id="duration-slider" min="10" max="300" step="10" value="30"                     style="width:100%;height:6px;background:rgba(255,255,255,0.2);border-radius:3px;outline:none;-webkit-appearance:none;">
                <div style="display:flex;justify-content:space-between;margin-top:6px;">
                    <span style="color:#666;font-size:10px;">10s</span>
                    <span style="color:#666;font-size:10px;">1 min</span>
                    <span style="color:#666;font-size:10px;">3 min</span>
                    <span style="color:#666;font-size:10px;">5 min</span>
                </div>
            </div>

            <div id="perf-status" style="text-align:center;font-size:12px;color:#666;margin-bottom:15px;min-height:40px;padding:8px;background:rgba(0,0,0,0.2);border-radius:8px;">
                <span style="color:#8b5cf6;">⚙️ Ready to test</span>
            </div>

            <div id="perf-progress" style="width:100%;height:6px;background:rgba(255,255,255,0.1);border-radius:3px;margin-bottom:15px;overflow:hidden;display:none;">
                <div id="perf-bar" style="width:0%;height:100%;background:linear-gradient(90deg,#8b5cf6,#06b6d4);transition:width 0.3s;"></div>
            </div>

            <div id="perf-results" style="display:none;flex-direction:column;gap:10px;margin-bottom:15px;"></div>

            <button id="perf-start-btn" style="width:100%;padding:12px;background:linear-gradient(135deg,#8b5cf6,#6d28d9);color:#fff;border:none;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer;">🚀 Start Full Suite</button>
            <button id="perf-close-btn" style="width:100%;margin-top:8px;padding:10px;background:rgba(255,255,255,0.1);color:#fff;border:none;border-radius:10px;font-size:13px;cursor:pointer;">Close</button>
        `;

        modal.appendChild(box);
        document.body.appendChild(modal);
        modal.onclick = e => { if (e.target === modal) modal.remove(); };

        // Duration slider handler
        const slider = document.getElementById('duration-slider');
        const display = document.getElementById('duration-display');
        
        slider.addEventListener('input', (e) => {
            const val = parseInt(e.target.value);
            testDuration = val * 1000; // Convert to ms
            
            // Update display text
            if (val >= 60) {
                const mins = val / 60;
                display.textContent = `${mins} min${mins > 1 ? 's' : ''}`;
            } else {
                display.textContent = `${val} sec`;
            }
        });

        document.getElementById('perf-close-btn').onclick = () => { testRunning = false; modal.remove(); };
        document.getElementById('perf-start-btn').onclick = async () => {
            if (testRunning) return;
            testRunning = true;
            document.getElementById('perf-start-btn').disabled = true;
            document.getElementById('perf-start-btn').textContent = '⏳ Running...';            await runFullSuite();
            document.getElementById('perf-start-btn').disabled = false;
            document.getElementById('perf-start-btn').textContent = '🔄 Run Again';
        };
    }

    function updateStatus(msg, color = '#8b92b4') {
        const el = document.getElementById('perf-status');
        if (el) el.innerHTML = `<span style="color:${color}">${msg}</span>`;
    }

    function updateProgress(percent) {
        const bar = document.getElementById('perf-bar');
        const prog = document.getElementById('perf-progress');
        if (bar && prog) {
            prog.style.display = 'block';
            bar.style.width = `${percent}%`;
        }
    }

    function addResult(title, value, color = '#fff', detail = '') {
        const container = document.getElementById('perf-results');
        if (!container) return;
        container.style.display = 'flex';
        const row = document.createElement('div');
        row.style.cssText = 'background:rgba(0,0,0,0.3);border-radius:10px;padding:12px;display:flex;justify-content:space-between;align-items:center;';
        row.innerHTML = `
            <div style="flex:1;">
                <div style="color:#8b92b4;font-size:11px;">${title}</div>
                <div style="color:${color};font-size:14px;font-weight:600;">${value}</div>
                ${detail ? `<div style="color:#666;font-size:10px;margin-top:2px;">${detail}</div>` : ''}
            </div>
        `;
        container.appendChild(row);
    }

    function showAnalysis(profile, thermal, summary) {
        const container = document.getElementById('perf-results');
        if (!container) return;
        const row = document.createElement('div');
        row.style.cssText = 'background:rgba(139,92,246,0.15);border:1px solid #8b5cf6;border-radius:12px;padding:16px;margin-top:10px;text-align:center;';
        row.innerHTML = `
            <div style="color:#c4b5fd;font-size:12px;margin-bottom:8px;">📱 Device Profile</div>
            <div style="font-size:18px;font-weight:bold;color:#fff;margin-bottom:4px;">${profile}</div>
            <div style="font-size:13px;color:#8b92b4;margin-bottom:10px;">Thermal: <span style="color:${thermal.includes('Fast') ? '#ef4444' : '#10b981'}">${thermal}</span></div>
            <div style="font-size:12px;color:#666;line-height:1.4;">${summary}</div>
        `;
        container.appendChild(row);
    }
    // 🧪 TEST FUNCTIONS
    async function testStorage() {
        updateStatus('📦 Testing Storage Write Speed...');
        try {
            // Adjust dd count based on duration (faster for shorter tests)
            const ddCount = testDuration < 30000 ? 50 : 100;
            const cmd = `dd if=/dev/zero of=/data/local/tmp/_perf_test bs=1M count=${ddCount} oflag=direct 2>&1 | grep -oP '[\\d.]+\\s+[MGk]?B/s'`;
            const res = await execFn(`su -c "${cmd}"`, 15000);
            await execFn(`su -c "rm -f /data/local/tmp/_perf_test"`);
            
            const match = res.match(/([\d.]+)\s*([MGk]?B\/s)/);
            if (match) {
                let mbps = parseFloat(match[1]);
                if (match[2].includes('G')) mbps *= 1024;
                else if (match[2].includes('k')) mbps /= 1024;
                results.storage = mbps;
                addResult('Storage Write', `${mbps.toFixed(0)} MB/s`, mbps > 600 ? '#10b981' : '#f59e0b', mbps > 800 ? 'NVMe/UFS 3.1+' : mbps > 400 ? 'UFS 2.1/3.0' : 'eMMC/UFS 2.0');
            }
        } catch (e) { addResult('Storage Write', 'Failed', '#ef4444'); }
        updateProgress(20);
        await new Promise(r => setTimeout(r, 300));
    }

    async function testRAM_ZRAM() {
        updateStatus('🧠 Testing RAM & ZRAM...');
        try {
            // 1. JS RAM Allocation Test
            const arrSize = 20 * 1024 * 1024; // 20MB
            const start = performance.now();
            const arr = new Uint8Array(arrSize);
            for (let i = 0; i < arr.length; i++) arr[i] = i % 256;
            const duration = performance.now() - start;
            results.ramSpeed = (arrSize / 1024 / 1024) / (duration / 1000);
            
            // 2. Check ZRAM Block Device
            const zramPath = '/sys/block/zram0';
            const zramExists = await execFn(`test -d ${zramPath} && echo "yes" || echo "no"`, 2000);
            
            let zramStatus = '';
            let zramColor = '#666';
            let zramDetail = '';

            if (zramExists.trim() === 'yes') {
                // Read all ZRAM stats
                const disksize = await execFn(`cat ${zramPath}/disksize 2>/dev/null`);
                const origData = await execFn(`cat ${zramPath}/orig_data_size 2>/dev/null`);
                const comprData = await execFn(`cat ${zramPath}/compr_data_size 2>/dev/null`);
                const maxStreams = await execFn(`cat ${zramPath}/max_comp_streams 2>/dev/null`);
                const compAlgo = await execFn(`cat ${zramPath}/comp_algorithm 2>/dev/null`);
                
                const diskSizeVal = parseInt(disksize?.trim() || '0');
                const origVal = parseInt(origData?.trim() || '0');
                const comprVal = parseInt(comprData?.trim() || '0');
                
                if (diskSizeVal > 0) {
                    // ZRAM is active with allocated size
                    const diskSizeMB = (diskSizeVal / 1024 / 1024).toFixed(0);
                    
                    if (origVal > 0 && comprVal > 0) {
                        // Has compression data
                        results.zramRatio = origVal / comprVal;
                        zramStatus = `Active (${diskSizeMB}MB)`;
                        zramDetail = `Ratio: ${results.zramRatio.toFixed(2)}x | Algo: ${compAlgo.trim() || 'unknown'}`;
                        zramColor = results.zramRatio > 2.0 ? '#10b981' : '#f59e0b';
                    } else {
                        // Freshly activated, no data compressed yet
                        zramStatus = `Active (${diskSizeMB}MB)`;
                        zramDetail = `Ready | Algo: ${compAlgo.trim() || 'unknown'} | Streams: ${maxStreams.trim() || 'N/A'}`;
                        zramColor = '#3b82f6'; // Blue for ready but idle
                    }
                } else {
                    // Module exists but not activated
                    zramStatus = 'Module Loaded (Inactive)';
                    zramDetail = 'Run "Enable ZRAM" to activate';
                    zramColor = '#f59e0b';
                }
            } else {
                zramStatus = 'Not Available';
                zramDetail = 'ZRAM kernel module not found';
            }

            // Display RAM Speed
            const ramColor = results.ramSpeed > 6000 ? '#10b981' : results.ramSpeed > 3000 ? '#f59e0b' : '#ef4444';
            addResult('RAM Speed', `${results.ramSpeed.toFixed(0)} MB/s`, ramColor, 'Memory Allocation Benchmark');
            
            // Display ZRAM Status
            addResult('ZRAM Status', zramStatus, zramColor, zramDetail);

        } catch (e) {
            addResult('RAM/ZRAM', 'Test Failed', '#ef4444', e.message);
        }
        updateProgress(40);
        await new Promise(r => setTimeout(r, 300));
    }

    async function testCPU_Thermal() {        const durationSec = testDuration / 1000;
        updateStatus(`🔥 Testing CPU Load & Thermals (${durationSec}s)...`);
        
        const thermalPaths = await execFn(`ls /sys/class/thermal/thermal_zone*/temp 2>/dev/null`);
        const zones = thermalPaths.trim().split('\n').filter(p => p);
        
        // Read initial temps
        let initialTemps = {};
        for (const z of zones) {
            const t = await execFn(`cat ${z} 2>/dev/null`);
            if (t) initialTemps[z] = parseInt(t) / 1000;
        }

        // CPU freq monitoring
        results.cpuFreq = [];
        const freqPaths = [];
        for (let i = 0; i < 8; i++) {
            const p = `/sys/devices/system/cpu/cpu${i}/cpufreq/scaling_cur_freq`;
            if ((await execFn(`test -f ${p} && echo 1`)).trim() === '1') freqPaths.push(p);
        }

        // JS stress loop + freq sampling
        const stressEnd = Date.now() + testDuration;
        while (Date.now() < stressEnd && testRunning) {
            // Busy wait ~100ms
            const loopStart = performance.now();
            while (performance.now() - loopStart < 100) { Math.sqrt(Math.random()); }
            
            // Sample freqs
            if (freqPaths.length > 0) {
                const p = freqPaths[Math.floor(Math.random() * freqPaths.length)];
                const f = await execFn(`cat ${p} 2>/dev/null`);
                if (f) results.cpuFreq.push(parseInt(f.trim()));
            }
        }

        // Read final temps
        let finalTemps = {};
        for (const z of zones) {
            const t = await execFn(`cat ${z} 2>/dev/null`);
            if (t) finalTemps[z] = parseInt(t) / 1000;
        }

        // Calculate CPU stability
        if (results.cpuFreq.length > 0) {
            const maxF = Math.max(...results.cpuFreq);
            const minF = Math.min(...results.cpuFreq);
            results.cpuStability = (minF / maxF) * 100;
            addResult('CPU Stability', `${results.cpuStability.toFixed(0)}%`, results.cpuStability > 85 ? '#10b981' : '#ef4444', `Freq range: ${(minF/1000).toFixed(0)}-${(maxF/1000).toFixed(0)} MHz`);
        }
        // Calculate thermal delta
        let maxDelta = 0;
        for (const z of zones) {
            if (initialTemps[z] && finalTemps[z]) {
                const d = finalTemps[z] - initialTemps[z];
                if (d > maxDelta) maxDelta = d;
            }
        }
        results.thermalDelta = maxDelta;
        
        let thermalBadge = 'Balanced';
        if (maxDelta > 12) thermalBadge = 'Heats Fast 🔥';
        else if (maxDelta < 5) thermalBadge = 'Cools Fast ❄️';
        results.thermalProfile = thermalBadge;
        addResult('Thermal ΔT', `${maxDelta.toFixed(1)}°C`, maxDelta > 10 ? '#ef4444' : '#10b981', thermalBadge);

        updateProgress(70);
        await new Promise(r => setTimeout(r, 300));
    }

    async function testGPU() {
        const durationSec = testDuration / 1000;
        updateStatus(`🎮 Testing GPU Draw Calls (${durationSec}s)...`);
        
        try {
            const canvas = document.createElement('canvas');
            canvas.width = 256; canvas.height = 256;
            document.body.appendChild(canvas);
            const ctx = canvas.getContext('2d');
            
            let frames = 0;
            const gpuEnd = Date.now() + testDuration;
            while (Date.now() < gpuEnd && testRunning) {
                ctx.fillStyle = `hsl(${frames % 360}, 70%, 50%)`;
                ctx.fillRect(0, 0, 256, 256);
                for (let i = 0; i < 200; i++) {
                    ctx.fillStyle = `rgba(${Math.random()*255},${Math.random()*255},${Math.random()*255},0.8)`;
                    ctx.fillRect(Math.random()*256, Math.random()*256, 20, 20);
                }
                frames++;
                await new Promise(r => setTimeout(r, 0)); // Yield to browser
            }
            canvas.remove();
            results.gpuFPS = frames / (testDuration / 1000);
            addResult('GPU Draw FPS', `${results.gpuFPS.toFixed(0)} FPS`, results.gpuFPS > 50 ? '#10b981' : '#f59e0b', 'Canvas 2D Stress');
        } catch (e) { addResult('GPU Test', 'Failed', '#ef4444'); }
        updateProgress(90);
        await new Promise(r => setTimeout(r, 300));
    }
    function generateAnalysis() {
        let score = 0;
        if (results.storage > 600) score += 2; else if (results.storage > 300) score += 1;
        if (results.cpuStability > 85) score += 2; else if (results.cpuStability > 60) score += 1;
        if (results.gpuFPS > 45) score += 2; else if (results.gpuFPS > 25) score += 1;
        if (results.ramSpeed > 6000) score += 1; else if (results.ramSpeed > 3000) score += 0.5;
        if (results.zramRatio > 2.0) score += 1; else if (results.zramRatio > 1.5) score += 0.5;
        if (results.thermalDelta < 6) score += 2; else if (results.thermalDelta < 10) score += 1;

        let profile = 'Power Save 🔋';
        if (score >= 7) profile = 'Gaming Beast 🚀';
        else if (score >= 4.5) profile = 'Balanced ⚖️';

        let thermalText = results.thermalProfile;
        let summary = '';
        if (profile === 'Gaming Beast 🚀') {
            summary = 'High sustained performance with excellent cooling. Ideal for heavy gaming & multitasking.';
        } else if (profile === 'Balanced ⚖️') {
            summary = 'Good mid-range performance. May throttle under extended heavy loads.';
        } else {
            summary = 'Entry-level or aging hardware. Best suited for light tasks & battery saving.';
        }

        addResult('Final Verdict', profile, '#8b5cf6');
        showAnalysis(profile, thermalText, summary);
        updateStatus('✅ Analysis Complete', '#10b981');
        updateProgress(100);
    }

    async function runFullSuite() {
        document.getElementById('perf-results').innerHTML = '';
        document.getElementById('perf-results').style.display = 'none';
        updateProgress(0);
        
        await testStorage();
        await testRAM_ZRAM();
        await testCPU_Thermal();
        await testGPU();
        
        generateAnalysis();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bindClickHandler);
    } else {
        bindClickHandler();
    }

    window.PerfTestManager = { bindClickHandler, runFullSuite };
    })();