// zram.js - ZRAM Manager, Boot Persistence & Benchmark Suite
(function() {
    'use strict';
    
    const CONFIG_DIR = '/data/adb/zram_config';
    const CONFIG_FILE = `${CONFIG_DIR}/settings.conf`;
    const SERVICE_SCRIPT = '/data/adb/service.d/99-zram.sh';
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
                const rawAlgos = algo.trim().replace(/[\[\]]/g, ' ').split(/\s+/).filter(Boolean);
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
            const json = JSON.stringify(benchmarkHistory.slice(-20));
            await execFn(`mkdir -p /sdcard/MTK_AI_Engine && echo '${json}' > "${HISTORY_FILE}" 2>/dev/null`, 5000);
        } catch (e) {
            console.warn('Failed to save ZRAM benchmark history', e);
        }
    }

    function updateCardDisplay() {
        const valEl = document.querySelector('#zram-manager-item .setting-value');
        if (valEl) {
            valEl.innerHTML = currentZramMB === 0 
                ? `<span style="color: #ffffff;">Disabled <i class="fas fa-chevron-right"></i></span>` 
                : `<span style="color: #ffffff;">${currentZramMB} MB (${currentAlgo.toUpperCase()}) <i class="fas fa-chevron-right"></i></span>`;
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
                input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; width: 20px; height: 20px; background: var(--accent-blue); border-radius: 50%; cursor: pointer; border: 2px solid #ffffff; }
                .zram-tab-btn { flex: 1; padding: 10px; border: none; background: var(--bg-secondary); color: #ffffff; opacity: 0.6; font-weight: 600; cursor: pointer; border-bottom: 2px solid transparent; font-size: 12px; transition: all 0.2s; }
                .zram-tab-btn.active { color: #ffffff; opacity: 1; border-bottom: 2px solid var(--accent-blue); background: var(--bg-card); font-weight: 700; }
                .algo-pill { padding: 6px 12px; border-radius: 6px; background: var(--bg-secondary); color: #ffffff; opacity: 0.7; font-size: 11px; font-weight: 600; cursor: pointer; border: 1px solid var(--border-color); transition: all 0.2s; }
                .algo-pill.active { background: var(--accent-blue); color: #ffffff; opacity: 1; border-color: var(--accent-blue); }
            `;
            document.head.appendChild(style);
        }

        const modal = document.createElement('div');
        modal.id = 'zram-modal';
        modal.style.cssText = `
            position: fixed; inset: 0; background: rgba(0,0,0,0.85); z-index: 10000;
            display: flex; align-items: center; justify-content: center; backdrop-filter: blur(8px);
        `;

        const box = document.createElement('div');
        box.style.cssText = `
            background: var(--bg-card); border: 1px solid var(--border-color);
            border-radius: 20px; padding: 24px; width: 95%; max-width: 500px; max-height: 90vh;
            overflow-y: auto; box-shadow: 0 8px 32px rgba(0,0,0,0.6); color: #ffffff;
        `;

        let algoIndex = availableSystemAlgos.indexOf(currentAlgo);
        if (algoIndex === -1) algoIndex = 0;

        box.innerHTML = `
            <h3 style="color: #ffffff; margin: 0 0 4px; font-size: 20px; text-align: center; font-weight: 700;">🗄️ ZRAM Suite & Manager</h3>
            <p style="color: #ffffff; opacity: 0.75; font-size: 12px; text-align: center; margin-bottom: 15px;">Physical RAM: ${(physicalRamMB/1024).toFixed(1)} GB</p>

            <div style="display: flex; margin-bottom: 15px; border-radius: 10px; overflow: hidden; border: 1px solid var(--border-color); background: var(--bg-secondary);">
                <button id="zram-tab-apply" class="zram-tab-btn active">⚡ Config</button>
                <button id="zram-tab-test" class="zram-tab-btn">🧪 FIO Benchmark</button>
                <button id="zram-tab-history" class="zram-tab-btn">📊 Portfolio</button>
            </div>

            <!-- CONFIG / APPLY TAB -->
            <div id="zram-view-apply">
                <div style="margin-bottom: 14px;">
                    <div style="display: flex; justify-content: space-between; color: #ffffff; font-size: 13px; font-weight: 600; margin-bottom: 6px;">
                        <span>💾 ZRAM Size</span>
                        <span id="zram-size-val" style="color: #ffffff; font-weight: 700;">${currentZramMB === 0 ? 'Disabled' : `${currentZramMB} MB`}</span>
                    </div>
                    <input type="range" id="zram-size-slider" min="0" max="${Math.min(20480, physicalRamMB * 4)}" step="128" value="${currentZramMB}" style="width: 100%; height: 6px; background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 3px; outline: none;">
                    <div id="zram-warning" style="font-size: 11px; color: #ffffff; margin-top: 4px; min-height: 16px;"></div>
                </div>

                <div style="margin-bottom: 16px;">
                    <div style="display: flex; justify-content: space-between; color: #ffffff; font-size: 13px; font-weight: 600; margin-bottom: 6px;">
                        <span>⚙️ Compression Algorithm</span>
                        <span id="zram-algo-val" style="color: #ffffff; font-weight: 700;">${currentAlgo.toUpperCase()}</span>
                    </div>
                    <input type="range" id="zram-algo-slider" min="0" max="${availableSystemAlgos.length - 1}" step="1" value="${algoIndex}" style="width: 100%; height: 6px; background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 3px; outline: none; margin-bottom: 10px;">
                    
                    <div style="display: flex; gap: 6px; flex-wrap: wrap;" id="zram-algo-pills">
                        ${availableSystemAlgos.map((a, idx) => `
                            <div class="algo-pill ${a === currentAlgo ? 'active' : ''}" data-index="${idx}" data-algo="${a}">
                                ${a.toUpperCase()}
                            </div>
                        `).join('')}
                    </div>
                </div>

                <div style="margin-bottom: 16px;">
                    <div style="display: flex; justify-content: space-between; color: #ffffff; font-size: 13px; font-weight: 600; margin-bottom: 6px;">
                        <span>🔄 Swappiness Value</span>
                        <span id="zram-swap-val" style="color: #ffffff; font-weight: 700;">${currentSwappiness}</span>
                    </div>
                    <input type="range" id="zram-swap-slider" min="0" max="200" step="1" value="${currentSwappiness}" style="width: 100%; height: 6px; background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 3px; outline: none;">
                    <div style="display: flex; justify-content: space-between; color: #ffffff; opacity: 0.6; font-size: 10px; margin-top: 4px;">
                        <span>0 (Low Swap)</span>
                        <span>60 (Default)</span>
                        <span>100 (Balanced)</span>
                        <span>200 (Aggressive)</span>
                    </div>
                </div>

                <div id="zram-stats-box" style="background: var(--bg-secondary); border: 1px solid var(--border-color); padding: 12px; border-radius: 10px; margin-bottom: 14px; text-align: center; font-size: 12px; color: #ffffff;">
                    Loading live stats...
                </div>

                <button id="zram-apply-btn" style="width: 100%; padding: 12px; background: var(--accent-blue); color: #ffffff; border: none; border-radius: 12px; font-size: 14px; font-weight: 700; cursor: pointer; margin-bottom: 8px;">💾 Apply & Save Config</button>
                <button id="zram-disable-btn" style="width: 100%; padding: 10px; background: var(--accent-red); color: #ffffff; border: none; border-radius: 10px; font-size: 12px; font-weight: 700; cursor: pointer;">🚫 Disable ZRAM</button>
            </div>

            <!-- FIO BENCHMARK TAB -->
            <div id="zram-view-test" style="display: none;">
                <div style="margin-bottom: 14px; padding: 12px; background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 10px;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
                        <span style="color: #ffffff; font-size: 13px; font-weight: 600;">Test Payload Size</span>
                        <span id="zram-test-size-val" style="color: #ffffff; font-weight: 700;">${testZramMB} MB</span>
                    </div>
                    <input type="range" id="zram-test-size-slider" min="128" max="2048" step="128" value="${testZramMB}" style="width: 100%; height: 6px; background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 3px; outline: none;">
                    
                    <div style="display: flex; justify-content: space-between; margin: 12px 0 6px;">
                        <span style="color: #ffffff; font-size: 13px; font-weight: 600;">Compressibility Target</span>
                        <span id="zram-test-comp-val" style="color: #ffffff; font-weight: 700;">${testCompressPct}%</span>
                    </div>
                    <input type="range" id="zram-test-comp-slider" min="10" max="90" step="5" value="${testCompressPct}" style="width: 100%; height: 6px; background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 3px; outline: none;">

                    <div style="display: flex; justify-content: space-between; margin: 12px 0 6px;">
                        <span style="color: #ffffff; font-size: 13px; font-weight: 600;">Runtime Duration</span>
                        <span id="zram-test-time-val" style="color: #ffffff; font-weight: 700;">${testRuntimeSec}s</span>
                    </div>
                    <input type="range" id="zram-test-time-slider" min="5" max="30" step="5" value="${testRuntimeSec}" style="width: 100%; height: 6px; background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 3px; outline: none;">
                </div>

                <button id="zram-run-fio" style="width: 100%; padding: 12px; background: var(--accent-green); color: #ffffff; border: none; border-radius: 12px; font-size: 14px; font-weight: 700; cursor: pointer; margin-bottom: 10px;">🚀 Run ZRAM Memory Benchmark</button>
                <div id="zram-fio-result-card" style="display: none; padding: 12px; background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 10px; margin-bottom: 10px; font-size: 12px; border-left: 4px solid var(--accent-green); color: #ffffff;"></div>
            </div>

            <!-- PORTFOLIO TAB -->
            <div id="zram-view-history" style="display: none;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                    <span style="color: #ffffff; font-size: 13px; font-weight: 600;">ZRAM Testing Portfolio</span>
                    <button id="zram-clear-history" style="background: var(--accent-red); color: #ffffff; border: none; padding: 4px 8px; border-radius: 6px; font-size: 11px; cursor: pointer; font-weight: 600;">Clear History</button>
                </div>
                <div id="zram-history-container" style="max-height: 160px; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; margin-bottom: 12px;"></div>
                <div id="zram-recommendation-box" style="padding: 12px; background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 10px; font-size: 11px; color: #ffffff; margin-bottom: 15px;"></div>
            </div>

            <div id="zram-action-status" style="text-align: center; font-size: 12px; color: #ffffff; margin: 10px 0; min-height: 20px;"></div>
            <button id="zram-close-btn" style="width: 100%; padding: 10px; background: var(--bg-secondary); border: 1px solid var(--border-color); color: #ffffff; border-radius: 10px; font-size: 13px; font-weight: 600; cursor: pointer;">Close</button>
            <div id="zram-log-box" style="margin-top: 12px; background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 8px; padding: 8px; max-height: 100px; overflow-y: auto; font-family: monospace; font-size: 10px; color: #ffffff; text-align: left; line-height: 1.4; word-break: break-all;"></div>
        `;

        modal.appendChild(box);
        document.body.appendChild(modal);

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

        const sizeSlider = document.getElementById('zram-size-slider');
        const sizeVal = document.getElementById('zram-size-val');
        sizeSlider.oninput = (e) => {
            const val = parseInt(e.target.value);
            currentZramMB = val;
            sizeVal.textContent = val === 0 ? 'Disabled' : (val >= 1024 ? `${(val/1024).toFixed(1)} GB` : `${val} MB`);
            checkSizeWarning(val);
        };
        checkSizeWarning(currentZramMB);

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

        const swapSlider = document.getElementById('zram-swap-slider');
        const swapVal = document.getElementById('zram-swap-val');
        swapSlider.oninput = (e) => {
            currentSwappiness = parseInt(e.target.value);
            swapVal.textContent = currentSwappiness;
        };

        const tSizeSlider = document.getElementById('zram-test-size-slider');
        const tSizeVal = document.getElementById('zram-test-size-val');
        tSizeSlider.oninput = (e) => { testZramMB = parseInt(e.target.value); tSizeVal.textContent = `${testZramMB} MB`; };

        const tCompSlider = document.getElementById('zram-test-comp-slider');
        const tCompVal = document.getElementById('zram-test-comp-val');
        tCompSlider.oninput = (e) => { testCompressPct = parseInt(e.target.value); tCompVal.textContent = `${testCompressPct}%`; };

        const tTimeSlider = document.getElementById('zram-test-time-slider');
        const tTimeVal = document.getElementById('zram-test-time-val');
        tTimeSlider.oninput = (e) => { testRuntimeSec = parseInt(e.target.value); tTimeVal.textContent = `${testRuntimeSec}s`; };

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
            warnEl.style.display = 'block'; warnEl.style.color = '#ffffff';
        } else if (mb > physicalRamMB) {
            warnEl.innerHTML = `⚠️ zRAM (${(mb/1024).toFixed(1)} GB) exceeds physical RAM. May cause thrashing.`;
            warnEl.style.display = 'block'; warnEl.style.color = '#ffffff';
        } else if (mb > 0.75 * physicalRamMB && mb > 8192) {
            warnEl.innerHTML = `💡 Large allocation. Ensure sufficient free RAM.`;
            warnEl.style.display = 'block'; warnEl.style.color = '#ffffff';
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
        if (statusEl) statusEl.innerHTML = `<span style="color: #ffffff;">⚡ Testing ZRAM (${currentAlgo.toUpperCase()}) for ${testRuntimeSec}s...</span>`;

        const swapCheck = await execFn("grep '/zram' /proc/swaps | awk '{print $1}'", 3000);
        const zramDev = swapCheck.trim() || "/dev/block/zram0";

        const fioCmd = `${FIO_BIN} --name=zram_test --filename=${zramDev} --rw=randread --bs=4k --ioengine=psync --iodepth=1 --size=${testZramMB}M --runtime=${testRuntimeSec} --time_based=1 --zero_buffers=0`;

        if (logBox) {
            logBox.innerHTML += `<br><span style="color: #ffffff;">[${new Date().toLocaleTimeString()}] Executing: ${fioCmd}</span><br>`;
            logBox.scrollTop = logBox.scrollHeight;
        }

        try {
            const output = await execFn(fioCmd, (testRuntimeSec + 10) * 1000);

            if (!output || output.trim().length === 0) {
                throw new Error('FIO produced empty output');
            }

            const iopsMatch = output.match(/IOPS=([0-9kK\.]+)/) || output.match(/iops\s*:\s*min=\s*([0-9\.]+)/);
            const bwMatch = output.match(/BW=([0-9\.]+[MiBGKiB\/s]+)/);
            const latSectionMatch = output.match(/(?:clat|lat|slat)\s*\((nsec\vert{}usec\vert{}msec)\)\s*:[^\n]*avg=([0-9\.]+)/i) 
                                 || output.match(/lat\s*\((\w+)\)\s*:[^\n]*avg=([0-9\.]+)/i);

            if (!iopsMatch && !bwMatch) {
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
            
            if (latVal > 150) {
                speedRating = '🐢 Slower Compression Speed';
            } else if (latVal > 60) {
                speedRating = '⚖️ Moderate Swap Overhead';
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
                color: '#ffffff'
            };

            benchmarkHistory.push(entry);
            await saveHistory();

            if (resultCard) {
                resultCard.style.display = 'block';
                resultCard.style.borderLeftColor = 'var(--accent-green)';
                resultCard.innerHTML = `
                    <div style="font-weight: bold; color: #ffffff; margin-bottom: 4px;">${speedRating}</div>
                    <div style="color: #ffffff;"><b>Algo:</b> ${currentAlgo.toUpperCase()} | <b>Duration:</b> ${testRuntimeSec}s</div>
                    <div style="color: #ffffff;"><b>IOPS:</b> ${iops} | <b>Bandwidth:</b> ${bw}</div>
                    <div style="color: #ffffff;"><b>Avg Latency:</b> ${avgLat}</div>
                `;
            }

            if (statusEl) statusEl.innerHTML = `<span style="color: #ffffff;">✅ ZRAM Benchmark Completed (${testRuntimeSec}s)!</span>`;
            if (logBox) {
                logBox.innerHTML += `<span style="color: #ffffff;">[FIO Output] IOPS: ${iops} | BW: ${bw} | Lat: ${avgLat}</span><br>`;
                logBox.scrollTop = logBox.scrollHeight;
            }

        } catch (e) {
            if (statusEl) statusEl.innerHTML = `<span style="color: #ffffff;">❌ Benchmark Failed</span>`;
            if (logBox) logBox.innerHTML += `<span style="color: #ffffff;">Log: ${e.message}</span><br>`;
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
            container.innerHTML = `<div style="color: #ffffff; opacity: 0.6; font-size: 11px; text-align: center; padding: 20px;">No benchmark records found. Run a test in FIO Benchmark!</div>`;
            if (recBox) {
                recBox.innerHTML = `
                    <div style="color: #ffffff; font-weight: 700; margin-bottom: 4px;">💡 Recommended Profile:</div>
                    <div style="color: #ffffff;">No benchmark history available. Run FIO tests to find the best algorithm and size for your device.</div>
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
            const numericSize = parseInt(winner.size) || currentZramMB;
            recBox.innerHTML = `
                <div style="color: #ffffff; font-weight: 700; font-size: 12px; margin-bottom: 6px; display: flex; align-items: center; justify-content: space-between;">
                    <span>💡 Recommended Profile (Winner):</span>
                    <span style="background: var(--bg-primary); padding: 2px 8px; border-radius: 6px; border: 1px solid var(--border-color);">👑 ${winner.algo} (${winner.size})</span>
                </div>
                <div style="color: #ffffff; margin-bottom: 4px;">
                    Achieved lowest swap latency (<b>${winner.lat}</b>) and <b>${winner.bw}</b> throughput.
                </div>
                <div style="color: #ffffff; font-weight: 600; margin-bottom: 8px;">
                    ✔ Optimal settings for minimal memory paging lag under high multitasking load.
                </div>
                <button id="zram-apply-winner-btn" style="width: 100%; padding: 8px; background: var(--accent-orange); color: #ffffff; border: none; border-radius: 6px; font-weight: 700; cursor: pointer; font-size: 11px;">⚡ Apply Winner Config (${winner.algo} - ${winner.size})</button>
            `;

            setTimeout(() => {
                const applyWinnerBtn = document.getElementById('zram-apply-winner-btn');
                if (applyWinnerBtn) {
                    applyWinnerBtn.onclick = async () => {
                        currentZramMB = numericSize;
                        currentAlgo = winner.algo.toLowerCase();

                        // Switch to Config tab view
                        const btnApplyTab = document.getElementById('zram-tab-apply');
                        const vApply = document.getElementById('zram-view-apply');
                        const vHistory = document.getElementById('zram-view-history');
                        const btnHist = document.getElementById('zram-tab-history');

                        if (btnApplyTab && vApply) {
                            [btnApplyTab, btnHist].forEach(b => b?.classList.remove('active'));
                            [vApply, document.getElementById('zram-view-test'), vHistory].forEach(v => { if(v) v.style.display = 'none'; });
                            btnApplyTab.classList.add('active');
                            vApply.style.display = 'block';
                        }

                        // Update form controls in UI
                        const sizeSlider = document.getElementById('zram-size-slider');
                        const sizeVal = document.getElementById('zram-size-val');
                        if (sizeSlider) sizeSlider.value = currentZramMB;
                        if (sizeVal) sizeVal.textContent = currentZramMB >= 1024 ? `${(currentZramMB/1024).toFixed(1)} GB` : `${currentZramMB} MB`;

                        const algoIdx = availableSystemAlgos.indexOf(currentAlgo);
                        if (algoIdx !== -1) {
                            const algoSlider = document.getElementById('zram-algo-slider');
                            const algoVal = document.getElementById('zram-algo-val');
                            if (algoSlider) algoSlider.value = algoIdx;
                            if (algoVal) algoVal.textContent = currentAlgo.toUpperCase();
                            document.querySelectorAll('.algo-pill').forEach((p, idx) => {
                                if (idx === algoIdx) p.classList.add('active');
                                else p.classList.remove('active');
                            });
                        }

                        // Execute deployment and save
                        await applyZram(currentAlgo);
                    };
                }
            }, 50);
        }

        container.innerHTML = benchmarkHistory.slice().reverse().map(item => {
            const itemLat = parseLatency(item);
            const isWinner = winner && (item.id === winner.id || (item.algo === winner.algo && item.size === winner.size && Math.abs(itemLat - lowestLat) < 0.01));
            const bgStyle = isWinner ? 'background: var(--bg-card); border: 1px solid var(--accent-blue);' : 'background: var(--bg-secondary); border: 1px solid var(--border-color);';
            
            return `
                <div style="padding: 8px 12px; ${bgStyle} border-radius: 8px; font-size: 11px; border-left: 3px solid var(--accent-blue);">
                    <div style="display: flex; justify-content: space-between; color: #ffffff; font-weight: 600;">
                        <span>${item.algo} (${item.size}) ${isWinner ? '👑' : ''}</span>
                        <span style="color: #ffffff; opacity: 0.5; font-weight: normal;">${item.date}</span>
                    </div>
                    <div style="color: #ffffff; opacity: 0.8; margin-top: 2px;">
                        IOPS: <span style="color: #ffffff; font-weight: 700;">${item.iops}</span> | BW: <span style="color: #ffffff; font-weight: 700;">${item.bw}</span> | Latency: <span style="color: #ffffff; font-weight: 700;">${item.lat}</span>
                    </div>
                </div>
            `;
        }).join('');
    }

    async function installPersistentService(sizeMB, algo, swappiness) {
        const scriptContent = `#!/system/bin/sh
CONFIG_DIR="/data/adb/zram_config"
LOG="/sdcard/MTK_AI_Engine/zram_boot.log"
log() { echo "[$(date '+%H:%M:%S')] $*" >> "$LOG" 2>/dev/null; }
log "=== ZRAM Boot Service Starting ==="

COUNT=0
while [ $COUNT -lt 30 ]; do [ -d "$CONFIG_DIR" ] && break; sleep 2; COUNT=$((COUNT + 1)); done

SIZE="${sizeMB}M"
ALGO="${algo}"
SWAP="${swappiness}"

if [ -f "$CONFIG_DIR/settings.conf" ]; then
    while IFS='=' read -r key val; do
        case "$key" in
            SIZE) SIZE="$val" ;;
            ALGO) ALGO="$val" ;;
            SWAP) SWAP="$val" ;;
        esac
    done < "$CONFIG_DIR/settings.conf"
fi

log "Config loaded: SIZE=$SIZE, ALGO=$ALGO, SWAP=$SWAP"

ZRAM_DEV=$(grep '/zram' /proc/swaps | awk '{print $1}' | head -1)
[ -z "$ZRAM_DEV" ] && ZRAM_DEV="/dev/block/zram0"
ZRAM_NAME=$(basename "$ZRAM_DEV")

if [ "$SIZE" = "0M" ]; then
    /system/bin/swapoff "$ZRAM_DEV" 2>/dev/null
    /system/bin/echo 1 > "/sys/block/$ZRAM_NAME/reset"
    /system/bin/echo 0 > "/sys/block/$ZRAM_NAME/disksize" 2>/dev/null
    log "ZRAM disabled via boot config."
else
    NUM_MB=$(echo "$SIZE" | sed 's/M//')
    if [ "$NUM_MB" -gt 0 ] 2>/dev/null; then
        BYTES=$((NUM_MB * 1024 * 1024))
        /system/bin/swapoff "$ZRAM_DEV" 2>/dev/null
        /system/bin/echo 1 > "/sys/block/$ZRAM_NAME/reset"
        /system/bin/echo "$ALGO" > "/sys/block/$ZRAM_NAME/comp_algorithm" 2>/dev/null
        /system/bin/echo "$BYTES" > "/sys/block/$ZRAM_NAME/disksize"
        /system/bin/mkswap "$ZRAM_DEV" >/dev/null 2>&1
        /system/bin/swapon -p 100 "$ZRAM_DEV" 2>/dev/null || /system/bin/swapon "$ZRAM_DEV"
        /system/bin/echo "$SWAP" > /proc/sys/vm/swappiness
        log "ZRAM successfully initialized on boot."
    fi
fi
log "=== ZRAM Boot Service Complete ==="
exit 0`;

        const b64 = btoa(scriptContent);
        await execFn(`su -c "mkdir -p /data/adb/service.d && echo '${b64}' | base64 -d > '${SERVICE_SCRIPT}' && chmod 755 '${SERVICE_SCRIPT}'"`);
    }

    async function applyZram(algo) {
        const sizeMB = currentZramMB;
        if (sizeMB === 0) { disableZram(); return; }

        const sizeBytes = sizeMB * 1024 * 1024;
        const swappiness = currentSwappiness;

        const applyBtn = document.getElementById('zram-apply-btn');
        const statsBox = document.getElementById('zram-stats-box');
        if (applyBtn) { applyBtn.disabled = true; applyBtn.textContent = '⏳ Applying & Installing Bootscript...'; }
        if (statsBox) statsBox.textContent = 'Configuring zRAM & service.d...';

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

            await installPersistentService(sizeMB, algo, swappiness);

            currentZramMB = sizeMB;
            currentSwappiness = swappiness;
            currentAlgo = algo;
            updateCardDisplay();
            
            if (statsBox) statsBox.innerHTML = '<span style="color:#ffffff">✅ Applied & Boot Script Installed!</span>';

            if (applyBtn) { 
                applyBtn.disabled = false; 
                applyBtn.textContent = '💾 Apply & Save Config'; 
            }
        } catch (e) {
            console.error('ZRAM apply failed:', e);
            if (statsBox) statsBox.innerHTML = '<span style="color:#ffffff">❌ Failed. Check root/logs.</span>';
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

            await installPersistentService(0, currentAlgo, currentSwappiness);

            currentZramMB = 0;
            updateCardDisplay();

            if (statsBox) statsBox.innerHTML = '<span style="color:#ffffff">🚫 ZRAM Disabled & Bootscript Updated</span>';
        } catch (e) {
            console.error('ZRAM disable failed:', e);
            if (statsBox) statsBox.innerHTML = '<span style="color:#ffffff">❌ Failed to disable.</span>';
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
                    statsEl.innerHTML = `<span style="color:#ffffff; font-weight:700;">● ACTIVE</span> | ${usedMB} MB used / ${totalGB} GB total`;                
                } else {
                    statsEl.innerHTML = `<span style="color:#ffffff; font-weight:700;">● INACTIVE</span> | ZRAM is disabled`;
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
