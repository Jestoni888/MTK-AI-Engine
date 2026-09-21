// zram.js - ZRAM Manager & Benchmark Suite
(function() {
    'use strict';
    
    const CONFIG_DIR = '/data/adb/zram_config';
    const CONFIG_FILE = `${CONFIG_DIR}/settings.conf`;
    const HISTORY_FILE = '/sdcard/MTK_AI_Engine/zram_fio_history.json';
    const FIO_BIN = '/data/adb/modules/MTK_AI/bin/fio';

    const AVAILABLE_ALGOS = ['zstd', 'lz4', 'lzo', 'lz4hc'];

    let physicalRamMB = 4096;
    let currentZramMB = 4096;
    let currentSwappiness = 60;
    let currentAlgo = 'zstd';
    let availableSystemAlgos = [...AVAILABLE_ALGOS];
    let statsInterval = null;

    // Benchmark state
    let testZramMB = 512;
    let testCompressPct = 60;
    let testRuntimeSec = 10;
    let benchmarkHistory = [];

    // Self-contained exec wrapper
    const execFn = async function(cmd, timeout = 30000) {
        return new Promise(resolve => {
            const cb = `zram_exec_${Date.now()}_${Math.random().toString(36).substring(2)}`;
            const t = setTimeout(() => { delete window[cb]; resolve(''); }, timeout);
            window[cb] = (_, res) => { clearTimeout(t); delete window[cb]; resolve(res || ''); };
            if (window.ksu) {
                try { ksu.exec(cmd, `window.${cb}`); }
                catch (e) { clearTimeout(t); resolve(''); }
            } else {
                clearTimeout(t);
                resolve('');
            }
        });
    };

    async function init() {
        await detectPhysicalRam();
        await loadCurrentZramState();
        await loadHistory();
        bindClickHandler();
    }

    async function detectPhysicalRam() {
        try {
            const memTotal = await execFn("cat /proc/meminfo | grep MemTotal | awk '{print $2}'", 5000);
            physicalRamMB = Math.floor(parseInt(memTotal) / 1024) || 4096;
        } catch (e) {
            physicalRamMB = 4096;
        }
    }

    async function loadCurrentZramState() {
        try {
            const swapInfo = await execFn("grep '/zram' /proc/swaps | awk '{print $1}'", 5000);
            const zramDev = (swapInfo.trim() || "/dev/block/zram0").split("/").pop();
            
            const disksize = await execFn(`cat /sys/block/${zramDev}/disksize 2>/dev/null`, 5000);
            if (disksize && disksize.trim() !== "" && parseInt(disksize) > 0) {                
                currentZramMB = Math.floor(parseInt(disksize) / 1024 / 1024);
            } else {
                const savedSize = await execFn(`grep '^SIZE=' ${CONFIG_FILE} 2>/dev/null | cut -d= -f2`, 5000);
                if (savedSize && savedSize.trim() === "0M") {
                    currentZramMB = 0;
                } else {
                    currentZramMB = Math.min(Math.floor(0.5 * physicalRamMB), 8192);
                }
            }

            const swappiness = await execFn("cat /proc/sys/vm/swappiness 2>/dev/null", 5000);
            currentSwappiness = swappiness.trim() ? parseInt(swappiness.trim()) : 60;

            const algo = await execFn(`cat /sys/block/${zramDev}/comp_algorithm 2>/dev/null`, 5000);
            if (algo.trim()) {
                // Extract supported system algorithms [zstd] lz4 lzo ...
                const rawAlgos = algo.trim().replace(/\[\vert{}\]/g, ' ').split(/\s+/).filter(Boolean);
                if (rawAlgos.length > 0) availableSystemAlgos = Array.from(new Set([...rawAlgos, ...AVAILABLE_ALGOS]));

                const match = algo.match(/\[([^\]]+)\]/);
                currentAlgo = match ? match[1] : 'zstd';
            }
        } catch (e) {
            console.warn('Failed to load zRAM state:', e);
        }
        updateCardDisplay();
    }

    async function loadHistory() {
        try {
            const raw = await execFn(`cat "${HISTORY_FILE}" 2>/dev/null`, 5000);
            if (raw) benchmarkHistory = JSON.parse(raw);
        } catch (e) {
            benchmarkHistory = [];
        }
    }

    async function saveHistory() {
        try {
            const json = JSON.stringify(benchmarkHistory.slice(-20)); // Keep last 20 tests
            await execFn(`mkdir -p /sdcard/MTK_AI_Engine && echo '${json}' > "${HISTORY_FILE}" 2>/dev/null`, 5000);
        } catch (e) {
            console.warn('Failed to save ZRAM benchmark history', e);
        }
    }

    function updateCardDisplay() {
        const valEl = document.querySelector('#zram-manager-item .setting-value');
        if (valEl) {
            valEl.innerHTML = currentZramMB === 0 
                ? `Disabled <i class="fas fa-chevron-right"></i>` 
                : `${currentZramMB} MB (${currentAlgo.toUpperCase()}) <i class="fas fa-chevron-right"></i>`;
        }
    }

    function bindClickHandler() {
        const item = document.getElementById('zram-manager-item');
        if (!item) return;
        item.style.cursor = 'pointer';
        item.addEventListener('click', showZramModal);
    }

    function showZramModal() {
        document.getElementById('zram-modal')?.remove();

        if (!document.getElementById('zram-modal-style')) {
            const style = document.createElement('style');
            style.id = 'zram-modal-style';
            style.textContent = `
                input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; width: 20px; height: 20px; background: #007AFF; border-radius: 50%; cursor: pointer; border: 2px solid #fff; }
                .zram-tab-btn { flex: 1; padding: 10px; border: none; background: rgba(0,0,0,0.3); color: #8b92b4; font-weight: 600; cursor: pointer; border-bottom: 2px solid transparent; font-size: 12px; }
                .zram-tab-btn.active { color: #007AFF; border-bottom: 2px solid #007AFF; background: rgba(0,122,255,0.1); }
                .algo-pill { padding: 6px 12px; border-radius: 6px; background: rgba(255,255,255,0.08); color: #8b92b4; font-size: 11px; font-weight: 600; cursor: pointer; border: 1px solid transparent; transition: all 0.2s; }
                .algo-pill.active { background: rgba(0,122,255,0.2); color: #007AFF; border-color: #007AFF; }
            `;
            document.head.appendChild(style);
        }

        const modal = document.createElement('div');
        modal.id = 'zram-modal';
        modal.style.cssText = `
            position: fixed; inset: 0; background: rgba(0,0,0,0.85); z-index: 10000;
            display: flex; align-items: center; justify-content: center; backdrop-filter: blur(5px);
        `;

        const box = document.createElement('div');
        box.style.cssText = `
            background: linear-gradient(135deg, #1a1f3a, #2d3561); border: 2px solid #007AFF;
            border-radius: 20px; padding: 24px; width: 95%; max-width: 500px; max-height: 90vh;
            overflow-y: auto; box-shadow: 0 0 40px rgba(0,122,255,0.2);
        `;

        let algoIndex = availableSystemAlgos.indexOf(currentAlgo);
        if (algoIndex === -1) algoIndex = 0;

        box.innerHTML = `
            <h3 style="color: #007AFF; margin: 0 0 4px; font-size: 20px; text-align: center;">🗄️ ZRAM Suite & Manager</h3>
            <p style="color: #8b92b4; font-size: 12px; text-align: center; margin-bottom: 15px;">Physical RAM: ${(physicalRamMB/1024).toFixed(1)} GB</p>

            <div style="display: flex; margin-bottom: 15px; border-radius: 10px; overflow: hidden;">
                <button id="zram-tab-apply" class="zram-tab-btn active">⚡ Config</button>
                <button id="zram-tab-test" class="zram-tab-btn">🧪 FIO Benchmark</button>
                <button id="zram-tab-history" class="zram-tab-btn">📊 Portfolio</button>
            </div>

            <!-- CONFIG / APPLY TAB -->
            <div id="zram-view-apply">
                <!-- ZRAM Size Slider -->
                <div style="margin-bottom: 14px;">
                    <div style="display: flex; justify-content: space-between; color: #fff; font-size: 13px; font-weight: 600; margin-bottom: 6px;">
                        <span>💾 ZRAM Size</span>
                        <span id="zram-size-val" style="color: #007AFF;">${currentZramMB === 0 ? 'Disabled' : `${currentZramMB} MB`}</span>
                    </div>
                    <input type="range" id="zram-size-slider" min="0" max="${Math.min(20480, physicalRamMB * 4)}" step="128" value="${currentZramMB}" style="width: 100%; height: 6px; background: rgba(255,255,255,0.2); border-radius: 3px; outline: none;">
                    <div id="zram-warning" style="font-size: 11px; color: #FFCC00; margin-top: 4px; min-height: 16px;"></div>
                </div>

                <!-- Compression Algorithm Slider & Quick Select -->
                <div style="margin-bottom: 16px;">
                    <div style="display: flex; justify-content: space-between; color: #fff; font-size: 13px; font-weight: 600; margin-bottom: 6px;">
                        <span>⚙️ Compression Algorithm</span>
                        <span id="zram-algo-val" style="color: #32D74B; font-weight: 700;">${currentAlgo.toUpperCase()}</span>
                    </div>
                    <input type="range" id="zram-algo-slider" min="0" max="${availableSystemAlgos.length - 1}" step="1" value="${algoIndex}" style="width: 100%; height: 6px; background: rgba(255,255,255,0.2); border-radius: 3px; outline: none; margin-bottom: 10px;">
                    
                    <div style="display: flex; gap: 6px; flex-wrap: wrap;" id="zram-algo-pills">
                        ${availableSystemAlgos.map((a, idx) => `
                            <div class="algo-pill ${a === currentAlgo ? 'active' : ''}" data-index="${idx}" data-algo="${a}">
                                ${a.toUpperCase()}
                            </div>
                        `).join('')}
                    </div>
                </div>

                <!-- Swappiness Slider -->
                <div style="margin-bottom: 16px;">
                    <div style="display: flex; justify-content: space-between; color: #fff; font-size: 13px; font-weight: 600; margin-bottom: 6px;">
                        <span>🔄 Swappiness Value</span>
                        <span id="zram-swap-val" style="color: #007AFF; font-weight: 700;">${currentSwappiness}</span>
                    </div>
                    <input type="range" id="zram-swap-slider" min="0" max="200" step="1" value="${currentSwappiness}" style="width: 100%; height: 6px; background: rgba(255,255,255,0.2); border-radius: 3px; outline: none;">
                    <div style="display: flex; justify-content: space-between; color: #666; font-size: 10px; margin-top: 4px;">
                        <span>0 (Low Swap)</span>
                        <span>60 (Default)</span>
                        <span>100 (Balanced)</span>
                        <span>200 (Aggressive)</span>
                    </div>
                </div>

                <div id="zram-stats-box" style="background: rgba(0,0,0,0.4); padding: 12px; border-radius: 10px; margin-bottom: 14px; text-align: center; font-size: 12px; color: #8b92b4;">
                    Loading live stats...
                </div>

                <button id="zram-apply-btn" style="width: 100%; padding: 12px; background: linear-gradient(135deg, #007AFF, #0056b3); color: #fff; border: none; border-radius: 12px; font-size: 14px; font-weight: 700; cursor: pointer; margin-bottom: 8px;">💾 Apply & Save Config</button>
                <button id="zram-disable-btn" style="width: 100%; padding: 10px; background: linear-gradient(135deg, #FF453A, #b30000); color: #fff; border: none; border-radius: 10px; font-size: 12px; font-weight: 700; cursor: pointer;">🚫 Disable ZRAM</button>
            </div>

            <!-- FIO BENCHMARK TAB -->
            <div id="zram-view-test" style="display: none;">
                <div style="margin-bottom: 14px; padding: 12px; background: rgba(0,0,0,0.3); border-radius: 10px;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
                        <span style="color: #fff; font-size: 13px; font-weight: 600;">Test Payload Size</span>
                        <span id="zram-test-size-val" style="color: #32D74B; font-weight: 600;">${testZramMB} MB</span>
                    </div>
                    <input type="range" id="zram-test-size-slider" min="128" max="2048" step="128" value="${testZramMB}" style="width: 100%; height: 6px; background: rgba(255,255,255,0.2); border-radius: 3px; outline: none;">
                    
                    <div style="display: flex; justify-content: space-between; margin: 12px 0 6px;">
                        <span style="color: #fff; font-size: 13px; font-weight: 600;">Compressibility Target</span>
                        <span id="zram-test-comp-val" style="color: #32D74B; font-weight: 600;">${testCompressPct}%</span>
                    </div>
                    <input type="range" id="zram-test-comp-slider" min="10" max="90" step="5" value="${testCompressPct}" style="width: 100%; height: 6px; background: rgba(255,255,255,0.2); border-radius: 3px; outline: none;">

                    <div style="display: flex; justify-content: space-between; margin: 12px 0 6px;">
                        <span style="color: #fff; font-size: 13px; font-weight: 600;">Runtime Duration</span>
                        <span id="zram-test-time-val" style="color: #32D74B; font-weight: 600;">${testRuntimeSec}s</span>
                    </div>
                    <input type="range" id="zram-test-time-slider" min="5" max="30" step="5" value="${testRuntimeSec}" style="width: 100%; height: 6px; background: rgba(255,255,255,0.2); border-radius: 3px; outline: none;">
                </div>

                <button id="zram-run-fio" style="width: 100%; padding: 12px; background: linear-gradient(135deg, #32D74B, #1f9e30); color: #fff; border: none; border-radius: 12px; font-size: 14px; font-weight: 700; cursor: pointer; margin-bottom: 10px;">🚀 Run ZRAM Memory Benchmark</button>
                <div id="zram-fio-result-card" style="display: none; padding: 12px; background: rgba(0,0,0,0.4); border-radius: 10px; margin-bottom: 10px; font-size: 12px; border-left: 4px solid #32D74B;"></div>
            </div>

            <!-- PORTFOLIO TAB -->
            <div id="zram-view-history" style="display: none;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                    <span style="color: #fff; font-size: 13px; font-weight: 600;">ZRAM Testing Portfolio</span>
                    <button id="zram-clear-history" style="background: rgba(255,69,58,0.2); color: #ff453a; border: none; padding: 4px 8px; border-radius: 6px; font-size: 11px; cursor: pointer;">Clear History</button>
                </div>
                <div id="zram-history-container" style="max-height: 200px; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; margin-bottom: 15px;"></div>
                <div id="zram-recommendation-box" style="padding: 12px; background: rgba(255,215,0,0.08); border: 1px solid rgba(255,215,0,0.3); border-radius: 10px; font-size: 11px; color: #8b92b4; margin-bottom: 15px;"></div>
            </div>

            <div id="zram-action-status" style="text-align: center; font-size: 12px; color: #8b92b4; margin: 10px 0; min-height: 20px;"></div>
            <button id="zram-close-btn" style="width: 100%; padding: 10px; background: rgba(255,255,255,0.1); color: #fff; border: none; border-radius: 10px; font-size: 13px; cursor: pointer;">Close</button>
            <div id="zram-log-box" style="margin-top: 12px; background: #0d1117; border: 1px solid #30363d; border-radius: 8px; padding: 8px; max-height: 100px; overflow-y: auto; font-family: monospace; font-size: 10px; color: #3fb950; text-align: left; line-height: 1.4; word-break: break-all;"></div>
        `;

        modal.appendChild(box);
        document.body.appendChild(modal);

        // Tab Navigation
        const vApply = document.getElementById('zram-view-apply');
        const vTest = document.getElementById('zram-view-test');
        const vHistory = document.getElementById('zram-view-history');
        const btnApply = document.getElementById('zram-tab-apply');
        const btnTest = document.getElementById('zram-tab-test');
        const btnHist = document.getElementById('zram-tab-history');

        btnApply.onclick = () => switchTab(btnApply, vApply);
        btnTest.onclick = () => switchTab(btnTest, vTest);
        btnHist.onclick = () => { switchTab(btnHist, vHistory); renderHistory(); };

        function switchTab(activeBtn, activeView) {
            [btnApply, btnTest, btnHist].forEach(b => b.classList.remove('active'));
            [vApply, vTest, vHistory].forEach(v => v.style.display = 'none');
            activeBtn.classList.add('active');
            activeView.style.display = 'block';
        }

        // Size Slider binding
        const sizeSlider = document.getElementById('zram-size-slider');
        const sizeVal = document.getElementById('zram-size-val');
        sizeSlider.oninput = (e) => {
            const val = parseInt(e.target.value);
            currentZramMB = val;
            sizeVal.textContent = val === 0 ? 'Disabled' : (val >= 1024 ? `${(val/1024).toFixed(1)} GB` : `${val} MB`);
            checkSizeWarning(val);
        };
        checkSizeWarning(currentZramMB);

        // Algorithm Slider & Pill binding
        const algoSlider = document.getElementById('zram-algo-slider');
        const algoVal = document.getElementById('zram-algo-val');
        const pills = document.querySelectorAll('.algo-pill');

        function setAlgo(index) {
            currentAlgo = availableSystemAlgos[index];
            algoSlider.value = index;
            algoVal.textContent = currentAlgo.toUpperCase();
            pills.forEach((p, idx) => {
                if (idx === index) p.classList.add('active');
                else p.classList.remove('active');
            });
        }

        algoSlider.oninput = (e) => setAlgo(parseInt(e.target.value));
        pills.forEach(p => p.onclick = () => setAlgo(parseInt(p.dataset.index)));

        // Swappiness Slider binding
        const swapSlider = document.getElementById('zram-swap-slider');
        const swapVal = document.getElementById('zram-swap-val');
        swapSlider.oninput = (e) => {
            currentSwappiness = parseInt(e.target.value);
            swapVal.textContent = currentSwappiness;
        };

        // Test Sliders binding
        const tSizeSlider = document.getElementById('zram-test-size-slider');
        const tSizeVal = document.getElementById('zram-test-size-val');
        tSizeSlider.oninput = (e) => { testZramMB = parseInt(e.target.value); tSizeVal.textContent = `${testZramMB} MB`; };

        const tCompSlider = document.getElementById('zram-test-comp-slider');
        const tCompVal = document.getElementById('zram-test-comp-val');
        tCompSlider.oninput = (e) => { testCompressPct = parseInt(e.target.value); tCompVal.textContent = `${testCompressPct}%`; };

        const tTimeSlider = document.getElementById('zram-test-time-slider');
        const tTimeVal = document.getElementById('zram-test-time-val');
        tTimeSlider.oninput = (e) => { testRuntimeSec = parseInt(e.target.value); tTimeVal.textContent = `${testRuntimeSec}s`; };

        // Action Buttons
        document.getElementById('zram-apply-btn').onclick = () => applyZram(currentAlgo);
        document.getElementById('zram-disable-btn').onclick = () => disableZram();
        document.getElementById('zram-run-fio').onclick = () => runFioBenchmark();
        document.getElementById('zram-clear-history').onclick = async () => { benchmarkHistory = []; await saveHistory(); renderHistory(); };
        document.getElementById('zram-close-btn').onclick = () => { modal.remove(); stopLiveStats(); };
        modal.onclick = e => { if (e.target === modal) { modal.remove(); stopLiveStats(); } };

        startLiveStats();
    }

    function checkSizeWarning(mb) {
        const warnEl = document.getElementById('zram-warning');
        if (!warnEl) return;
        warnEl.style.display = 'none';
        
        if (mb === 0) {
            warnEl.innerHTML = `ℹ️ ZRAM will be disabled. System relies solely on physical RAM.`;
            warnEl.style.display = 'block'; warnEl.style.color = '#8b92b4';
        } else if (mb > physicalRamMB) {
            warnEl.innerHTML = `⚠️ zRAM (${(mb/1024).toFixed(1)} GB) exceeds physical RAM. May cause thrashing.`;
            warnEl.style.display = 'block'; warnEl.style.color = '#FFCC00';
        } else if (mb > 0.75 * physicalRamMB && mb > 8192) {
            warnEl.innerHTML = `💡 Large allocation. Ensure sufficient free RAM.`;
            warnEl.style.display = 'block'; warnEl.style.color = '#FFCC00';
        }
    }

    function parseLatency(entry) {
        if (typeof entry.rawLat === 'number' && !isNaN(entry.rawLat) && entry.rawLat > 0) {
            return entry.rawLat;
        }
        if (typeof entry.lat === 'string') {
            const match = entry.lat.match(/([0-9\.]+)/);
            if (match) return parseFloat(match[1]);
        }
        return 999999;
    }

                async function runFioBenchmark() {
        const statusEl = document.getElementById('zram-action-status');
        const logBox = document.getElementById('zram-log-box');
        const resultCard = document.getElementById('zram-fio-result-card');
        const btnRun = document.getElementById('zram-run-fio');

        if (!btnRun) return;

        btnRun.disabled = true;
        btnRun.textContent = `⏳ Running ${testRuntimeSec}s Stress Test...`;
        if (statusEl) statusEl.innerHTML = `<span style="color: #32D74B;">⚡ Testing ZRAM (${currentAlgo.toUpperCase()}) for ${testRuntimeSec}s...</span>`;

        const swapCheck = await execFn("grep '/zram' /proc/swaps | awk '{print $1}'", 3000);
        const zramDev = swapCheck.trim() || "/dev/block/zram0";

        // Removed --direct=1 to fix O_DIRECT errors on ZRAM virtual block devices
        const fioCmd = `${FIO_BIN} --name=zram_test --filename=${zramDev} --rw=randread --bs=4k --ioengine=psync --iodepth=1 --size=${testZramMB}M --runtime=${testRuntimeSec} --time_based=1 --zero_buffers=0`;

        if (logBox) {
            logBox.innerHTML += `<br><span style="color: #79c0ff;">[${new Date().toLocaleTimeString()}] Executing: ${fioCmd}</span><br>`;
            logBox.scrollTop = logBox.scrollHeight;
        }

        try {
            const output = await execFn(fioCmd, (testRuntimeSec + 10) * 1000);

            // Log raw output to logBox for full diagnostic transparency
            if (!output || output.trim().length === 0) {
                throw new Error('FIO produced empty output');
            }

            // Parse IOPS, Bandwidth, and Latency
            const iopsMatch = output.match(/IOPS=([0-9kK\.]+)/) || output.match(/iops\s*:\s*min=\s*([0-9\.]+)/);
            const bwMatch = output.match(/BW=([0-9\.]+[MiBGKiB\/s]+)/);
            const latSectionMatch = output.match(/(?:clat|lat|slat)\s*\((nsec\vert{}usec\vert{}msec)\)\s*:[^\n]*avg=([0-9\.]+)/i) 
                                 || output.match(/lat\s*\((\w+)\)\s*:[^\n]*avg=([0-9\.]+)/i);

            if (!iopsMatch && !bwMatch) {
                // If FIO returned text but failed execution, output the raw error log
                const cleanErr = output.replace(/\n/g, ' ').substring(0, 150);
                throw new Error(cleanErr);
            }

            const iops = iopsMatch ? iopsMatch[1] : 'N/A';
            const bw = bwMatch ? bwMatch[1] : 'N/A';
            
            let latVal = 999999;
            if (latSectionMatch) {
                const unit = latSectionMatch[1].toLowerCase();
                latVal = parseFloat(latSectionMatch[2]);
                if (unit === 'nsec') latVal = latVal / 1000;
                else if (unit === 'msec') latVal = latVal * 1000;
            }

            const avgLat = latVal !== 999999 ? `${latVal.toFixed(1)} µs` : 'N/A';

            let speedRating = '⚡ High Throughput Memory';
            let speedColor = '#32D74B';
            
            if (latVal > 150) {
                speedRating = '🐢 Slower Compression Speed';
                speedColor = '#FF453A';
            } else if (latVal > 60) {
                speedRating = '⚖️ Moderate Swap Overhead';
                speedColor = '#FF9F0A';
            }

            const entry = {
                id: Date.now() + '_' + Math.random().toString(36).substr(2, 4),
                date: new Date().toLocaleTimeString(),
                algo: currentAlgo.toUpperCase(),
                size: `${currentZramMB} MB`,
                testDuration: `${testRuntimeSec}s`,
                iops: iops,
                bw: bw,
                rawLat: Number(latVal),
                lat: avgLat,
                rating: speedRating,
                color: speedColor
            };

            benchmarkHistory.push(entry);
            await saveHistory();

            if (resultCard) {
                resultCard.style.display = 'block';
                resultCard.style.borderLeftColor = speedColor;
                resultCard.innerHTML = `
                    <div style="font-weight: bold; color: ${speedColor}; margin-bottom: 4px;">${speedRating}</div>
                    <div><b>Algo:</b> ${currentAlgo.toUpperCase()} | <b>Duration:</b> ${testRuntimeSec}s</div>
                    <div><b>IOPS:</b> ${iops} | <b>Bandwidth:</b> ${bw}</div>
                    <div><b>Avg Latency:</b> ${avgLat}</div>
                `;
            }

            if (statusEl) statusEl.innerHTML = `<span style="color: #32D74B;">✅ ZRAM Benchmark Completed (${testRuntimeSec}s)!</span>`;
            if (logBox) {
                logBox.innerHTML += `<span style="color: #3fb950;">[FIO Output] IOPS: ${iops} | BW: ${bw} | Lat: ${avgLat}</span><br>`;
                logBox.scrollTop = logBox.scrollHeight;
            }

        } catch (e) {
            if (statusEl) statusEl.innerHTML = `<span style="color: #FF453A;">❌ Benchmark Failed</span>`;
            if (logBox) logBox.innerHTML += `<span style="color: #ff453a;">Log: ${e.message}</span><br>`;
        } finally {
            btnRun.disabled = false;
            btnRun.textContent = '🚀 Run ZRAM Memory Benchmark';
        }
    }

    function renderHistory() {
        const container = document.getElementById('zram-history-container');
        const recBox = document.getElementById('zram-recommendation-box');
        if (!container) return;

        if (benchmarkHistory.length === 0) {
            container.innerHTML = `<div style="color: #666; font-size: 11px; text-align: center; padding: 20px;">No benchmark records found. Run a test in FIO Benchmark!</div>`;
            if (recBox) {
                recBox.innerHTML = `
                    <div style="color: #007AFF; font-weight: 600; margin-bottom: 4px;">💡 Recommended Profile:</div>
                    <div style="color: #fff;">No benchmark history available. Run FIO tests to find the best algorithm and size for your device.</div>
                `;
            }
            return;
        }

        let winner = null;
        let lowestLat = Infinity;

        benchmarkHistory.forEach(item => {
            const lat = parseLatency(item);
            if (lat < lowestLat) {
                lowestLat = lat;
                winner = item;
            }
        });

        if (recBox && winner) {
            recBox.innerHTML = `
                <div style="color: #FFD700; font-weight: 700; font-size: 12px; margin-bottom: 6px; display: flex; align-items: center; justify-content: space-between;">
                    <span>💡 Recommended Profile (Winner):</span>
                    <span style="background: rgba(255,215,0,0.2); padding: 2px 8px; border-radius: 6px;">👑 ${winner.algo} (${winner.size})</span>
                </div>
                <div style="color: #fff; margin-bottom: 4px;">
                    Achieved lowest swap latency (<b>${winner.lat}</b>) and <b>${winner.bw}</b> throughput.
                </div>
                <div style="color: #32D74B; font-weight: 600;">
                    ✔ Optimal settings for minimal memory paging lag under high multitasking load.
                </div>
            `;
        }

        container.innerHTML = benchmarkHistory.slice().reverse().map(item => {
            const itemLat = parseLatency(item);
            const isWinner = winner && (item.id === winner.id || (item.algo === winner.algo && item.size === winner.size && Math.abs(itemLat - lowestLat) < 0.01));
            const bgStyle = isWinner ? 'background: rgba(255, 215, 0, 0.1); border: 1px solid #FFD700;' : 'background: rgba(0,0,0,0.3);';
            
            return `
                <div style="padding: 8px 12px; ${bgStyle} border-radius: 8px; font-size: 11px; border-left: 3px solid ${isWinner ? '#FFD700' : item.color};">
                    <div style="display: flex; justify-content: space-between; color: #fff; font-weight: 600;">
                        <span>${item.algo} (${item.size}) ${isWinner ? '👑' : ''}</span>
                        <span style="color: #666; font-weight: normal;">${item.date}</span>
                    </div>
                    <div style="color: #8b92b4; margin-top: 2px;">
                        IOPS: <span style="color: #007AFF;">${item.iops}</span> | BW: <span style="color: #007AFF;">${item.bw}</span> | Latency: <span style="color: #32D74B;">${item.lat}</span>
                    </div>
                </div>
            `;
        }).join('');
    }

        async function applyZram(algo) {
        const sizeMB = currentZramMB;
        if (sizeMB === 0) { disableZram(); return; }

        const sizeBytes = sizeMB * 1024 * 1024;
        const swappiness = currentSwappiness;

        if (sizeMB > 16384 && !confirm(`⚠️ Creating ${sizeMB/1024}GB zRAM may cause instability.\nPhysical RAM: ${physicalRamMB/1024}GB\nContinue?`)) return;

        const applyBtn = document.getElementById('zram-apply-btn');
        const statsBox = document.getElementById('zram-stats-box');
        if (applyBtn) { applyBtn.disabled = true; applyBtn.textContent = '⏳ Applying...'; }
        if (statsBox) statsBox.textContent = 'Resetting zRAM...';

        try {
            let zramDev = await execFn("grep '/zram' /proc/swaps | awk '{print $1}' | head -1");
            zramDev = zramDev.trim() || "/dev/block/zram0";
            const zramName = zramDev.split("/").pop();

            await execFn(`swapoff ${zramDev} 2>/dev/null`);
            await new Promise(r => setTimeout(r, 100));

            await execFn(`echo 1 > /sys/block/${zramName}/reset`);
            await new Promise(r => setTimeout(r, 200));

            await execFn(`echo ${algo} > /sys/block/${zramName}/comp_algorithm 2>/dev/null`);
            await execFn(`echo ${sizeBytes} > /sys/block/${zramName}/disksize`);

            await execFn(`mkswap ${zramDev} >/dev/null 2>&1`);
            await execFn(`swapon -p 100 ${zramDev} 2>/dev/null || swapon ${zramDev}`);

            await execFn(`echo ${swappiness} > /proc/sys/vm/swappiness`);

            await execFn(`mkdir -p ${CONFIG_DIR}`);
            await execFn(`echo "SIZE=${sizeMB}M" > ${CONFIG_FILE}`);
            await execFn(`echo "ALGO=${algo}" >> ${CONFIG_FILE}`);
            await execFn(`echo "SWAP=${swappiness}" >> ${CONFIG_FILE}`);

            currentZramMB = sizeMB;
            currentSwappiness = swappiness;
            currentAlgo = algo;
            updateCardDisplay();
            
            if (statsBox) statsBox.innerHTML = '<span style="color:#32D74B">✅ Applied & Saved Successfully!</span>';

            // Re-enable button and keep UI open
            if (applyBtn) { 
                applyBtn.disabled = false; 
                applyBtn.textContent = '💾 Apply & Save Config'; 
            }
        } catch (e) {
            console.error('ZRAM apply failed:', e);
            if (statsBox) statsBox.innerHTML = '<span style="color:#FF453A">❌ Failed. Check root/logs.</span>';
            if (applyBtn) { applyBtn.disabled = false; applyBtn.textContent = '💾 Apply & Save Config'; }
        }
    }

        async function disableZram() {
        if (!confirm('Are you sure you want to disable ZRAM?')) return;

        const statsBox = document.getElementById('zram-stats-box');
        if (statsBox) statsBox.textContent = 'Disabling ZRAM...';

        try {
            let zramDev = await execFn("grep '/zram' /proc/swaps | awk '{print $1}' | head -1");
            zramDev = zramDev.trim() || "/dev/block/zram0";
            const zramName = zramDev.split("/").pop();

            await execFn(`swapoff ${zramDev} 2>/dev/null`);
            await new Promise(r => setTimeout(r, 100));

            await execFn(`echo 1 > /sys/block/${zramName}/reset`);
            await new Promise(r => setTimeout(r, 200));
            await execFn(`echo 0 > /sys/block/${zramName}/disksize 2>/dev/null`);

            await execFn(`mkdir -p ${CONFIG_DIR}`);
            await execFn(`echo "SIZE=0M" > ${CONFIG_FILE}`);
            await execFn(`echo "ALGO=${currentAlgo}" >> ${CONFIG_FILE}`);
            await execFn(`echo "SWAP=${currentSwappiness}" >> ${CONFIG_FILE}`);

            currentZramMB = 0;
            updateCardDisplay();

            if (statsBox) statsBox.innerHTML = '<span style="color:#FF453A">🚫 ZRAM Disabled</span>';
            // UI remains open, live stats timer will update as INACTIVE
        } catch (e) {
            console.error('ZRAM disable failed:', e);
            if (statsBox) statsBox.innerHTML = '<span style="color:#FF453A">❌ Failed to disable.</span>';
        }
    }

    function startLiveStats() {
        stopLiveStats();
        statsInterval = setInterval(async () => {
            const statsEl = document.getElementById('zram-stats-box');
            if (!statsEl) { stopLiveStats(); return; }
            
            try {
                const swapInfo = await execFn("grep '/zram' /proc/swaps | awk '{print $1}'", 1000);
                const zramDev = (swapInfo.trim() || "/dev/block/zram0").split("/").pop();
                
                const mmStat = await execFn(`cat /sys/block/${zramDev}/mm_stat`, 1000);
                const disksize = await execFn(`cat /sys/block/${zramDev}/disksize`, 1000);
                
                if (mmStat && mmStat.trim() !== "" && mmStat !== "TIMEOUT" && parseInt(disksize) > 0) {
                    const parts = mmStat.trim().split(/\s+/);
                    const usedMB = (parseInt(parts[1]) / 1024 / 1024).toFixed(2);
                    const totalGB = (parseInt(disksize) / 1024 / 1024 / 1024).toFixed(2);
                    statsEl.innerHTML = `<span style="color:#32D74B">● ACTIVE</span> | ${usedMB} MB used / ${totalGB} GB total`;                
                } else {
                    statsEl.innerHTML = `<span style="color:#FF453A">● INACTIVE</span> | ZRAM is disabled`;
                }
            } catch (e) {
                statsEl.textContent = 'Stats unavailable';
            }
        }, 3000);
    }

    function stopLiveStats() {
        if (statsInterval) clearInterval(statsInterval);
        statsInterval = null;
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
