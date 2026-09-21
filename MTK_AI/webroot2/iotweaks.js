// iotweaks.js - I/O Tweaks Manager & Benchmark Tool
(function() {
'use strict';
const CONFIG_FILE = '/sdcard/MTK_AI_Engine/iotweaks.conf';
const SERVICE_SCRIPT = '/data/adb/service.d/99-iotweaks.sh';
const HISTORY_FILE = '/sdcard/MTK_AI_Engine/fio_history.json';
const FIO_BIN = '/data/adb/modules/MTK_AI/bin/fio';

let currentReadAhead = 4096;
let currentScheduler = 'none';
let testReadAhead = 16; // Slider value for FIO testing (Updated min default to 32)
let installPersistent = false;
let availableSchedulers = ['none', 'mq-deadline', 'bfq', 'kyber'];
let benchmarkHistory = [];

const execFn = window.exec || async function(cmd, timeout = 30000) {
    return new Promise((resolve, reject) => {
        const cb = `io_exec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const t = setTimeout(() => { delete window[cb]; reject(new Error('Command timed out')); }, timeout);
        window[cb] = (code, res) => {
            clearTimeout(t); delete window[cb];
            if (code !== 0) reject(new Error(`Exit ${code}: ${res?.trim() || 'Unknown error'}`));
            else resolve(res?.trim() || '');
        };
        if (window.ksu) {
            try { ksu.exec(cmd, `window.${cb}`); }
            catch (e) { clearTimeout(t); reject(e); }
        } else {
            clearTimeout(t); reject(new Error('No root execution environment found'));
        }
    });
};

async function init() {
    bindClickHandler(); 
    Promise.all([loadConfig(), fetchSchedulers(), loadHistory()]).catch(e => console.warn('Init background tasks failed:', e));
}

async function fetchSchedulers() {
    try {
        const cmd = `cat /sys/block/*/queue/scheduler 2>/dev/null | tr " " "\\n" | tr -d "[]" | sort -u`;
        const content = await execFn(cmd).catch(() => '');
        if (content) {
            const scheds = content.split('\n').map(s => s.trim()).filter(s => s);
            if (scheds.length > 0) {
                availableSchedulers = scheds;
                if (!availableSchedulers.includes(currentScheduler)) {
                    availableSchedulers.unshift(currentScheduler);
                }
            }
        }
    } catch (e) {
        console.warn('I/O Tweaks: Failed to fetch schedulers dynamically, using fallback.', e);
    }
}

async function loadConfig() {
    try {
        const raw = await execFn(`cat "${CONFIG_FILE}" 2>/dev/null`).catch(() => '');
        if (raw) {
            raw.split('\n').forEach(line => {
                const [key, val] = line.split('=');
                if (key === 'read_ahead' && !isNaN(parseInt(val))) currentReadAhead = parseInt(val);
                if (key === 'scheduler' && val) currentScheduler = val.trim();
            });
        }
        const svcCheck = await execFn(`[ -f "${SERVICE_SCRIPT}" ] && echo 1 || echo 0`).catch(() => '0');
        installPersistent = svcCheck === '1';
    } catch (e) { console.warn('I/O Tweaks: Config load failed:', e); }
}

async function loadHistory() {
    try {
        const raw = await execFn(`cat "${HISTORY_FILE}" 2>/dev/null`).catch(() => '[]');
        if (raw) benchmarkHistory = JSON.parse(raw);
    } catch (e) {
        benchmarkHistory = [];
    }
}

async function saveHistory() {
    try {
        const json = JSON.stringify(benchmarkHistory.slice(-20)); // Keep last 20 tests
        await execFn(`mkdir -p /sdcard/MTK_AI_Engine && echo '${json}' > "${HISTORY_FILE}" 2>/dev/null`);
    } catch (e) { console.warn('Failed to save benchmark history', e); }
}

function bindClickHandler() {
    const btn = document.getElementById('io-tweaks-btn');
    if (btn) btn.addEventListener('click', () => showIOModal());
}

async function updateLogBox(prefix) {
    const logBox = document.getElementById('io-log-box');
    if (!logBox) return;
    logBox.innerHTML += `<span style="color: #8b949e; font-weight: bold;">--- ${prefix} ---</span><br>`;
    logBox.scrollTop = logBox.scrollHeight;
    try {
        const cmd = `find /sys -type f \\( -name "read_ahead_kb" -o -name "scheduler" \\) -exec grep -H "" {} + 2>/dev/null`;
        const result = await execFn(cmd).catch(() => '');
        if (result && result.trim()) {
            const lines = result.trim().split('\n');
            lines.forEach(line => {
                const safeLine = line.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
                const isScheduler = line.includes('scheduler');
                const color = isScheduler ? '#79c0ff' : '#3fb950';
                const formattedLine = safeLine.replace(/^(.*?):(.*)$/, '$1 => $2');
                logBox.innerHTML += `<div style="color: ${color};">${formattedLine}</div>`;
            });
        } else {
            logBox.innerHTML += `<span style="color: #f85149;">No readable I/O files found.</span><br>`;
        }
    } catch (e) {
        logBox.innerHTML += `<span style="color: #f85149;">Error: ${e.message}</span><br>`;
    }
    logBox.scrollTop = logBox.scrollHeight;
}

function showIOModal() {
    document.getElementById('io-modal')?.remove();
    if (!document.getElementById('io-slider-style')) {
        const style = document.createElement('style');
        style.id = 'io-slider-style';
        style.textContent = `
            input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; width: 20px; height: 20px; background: #4a9eff; border-radius: 50%; cursor: pointer; border: 2px solid #fff; }
            .toggle-switch { position: relative; display: inline-block; width: 50px; height: 26px; }
            .toggle-switch input { opacity: 0; width: 0; height: 0; }
            .toggle-slider { position: absolute; cursor: pointer; inset: 0; background-color: #555; transition: .3s; border-radius: 26px; }
            .toggle-slider:before { position: absolute; content: ""; height: 20px; width: 20px; left: 3px; bottom: 3px; background-color: white; transition: .3s; border-radius: 50%; }
            input:checked + .toggle-slider { background-color: #4a9eff; }
            input:checked + .toggle-slider:before { transform: translateX(24px); }
            .tab-btn { flex: 1; padding: 10px; border: none; background: rgba(0,0,0,0.3); color: #8b92b4; font-weight: 600; cursor: pointer; border-bottom: 2px solid transparent; }
            .tab-btn.active { color: #4a9eff; border-bottom: 2px solid #4a9eff; background: rgba(74,158,255,0.1); }
        `;
        document.head.appendChild(style);
    }

    const modal = document.createElement('div');
    modal.id = 'io-modal';
    modal.style.cssText = `position: fixed; inset: 0; background: rgba(0,0,0,0.85); z-index: 10000; display: flex; align-items: center; justify-content: center; backdrop-filter: blur(5px);`;
    const box = document.createElement('div');
    box.style.cssText = `background: linear-gradient(135deg, #1a1f3a, #2d3561); border: 2px solid #4a9eff; border-radius: 20px; padding: 24px; width: 95%; max-width: 520px; max-height: 90vh; overflow-y: auto; box-shadow: 0 0 40px rgba(74, 158, 255, 0.2);`;
    
    box.innerHTML = `
        <h3 style="color: #4a9eff; margin: 0 0 5px; font-size: 20px; text-align: center;">💾 I/O Tweaks & FIO Suite</h3>
        <p style="color: #8b92b4; font-size: 12px; text-align: center; margin-bottom: 15px;">Optimize read-ahead & test storage latency</p>
        
        <div style="display: flex; margin-bottom: 15px; border-radius: 10px; overflow: hidden;">
            <button id="tab-apply" class="tab-btn active">⚡ Apply Tweaks</button>
            <button id="tab-test" class="tab-btn">🧪 FIO Benchmark</button>
            <button id="tab-history" class="tab-btn">📊 Portfolio</button>
        </div>

        <!-- APPLY TAB -->
        <div id="view-apply">
            <div style="margin-bottom: 15px;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                    <span style="color: #fff; font-size: 13px; font-weight: 600;">Read-Ahead KB</span>
                    <span id="io-ra-val" style="color: #4a9eff; font-weight: 600;">${currentReadAhead} KB</span>
                </div>
                <input type="range" id="io-ra-slider" min="16" max="8192" step="16" value="${currentReadAhead}" style="width: 100%; height: 6px; background: rgba(255,255,255,0.2); border-radius: 3px; outline: none;">
                <div style="display: flex; justify-content: space-between; font-size: 11px; color: #666; margin-top: 4px;"><span>16 KB</span><span>8192 KB</span></div>
            </div>
            <div style="margin-bottom: 15px;">
                <div style="color: #fff; font-size: 13px; font-weight: 600; margin-bottom: 8px;">I/O Scheduler</div>
                <select id="io-sched-select" style="width: 100%; padding: 10px; background: rgba(0,0,0,0.4); color: #fff; border: 1px solid rgba(255,255,255,0.2); border-radius: 10px;">
                    ${availableSchedulers.map(s => `<option value="${s}" ${s === currentScheduler ? 'selected' : ''}>${s.toUpperCase()}</option>`).join('')}
                </select>
            </div>
            <div style="margin-bottom: 15px; padding: 12px; background: rgba(74,158,255,0.1); border-radius: 12px; border: 1px solid rgba(74,158,255,0.3);">
                <div style="display: flex; align-items: center; justify-content: space-between;">
                    <div>
                        <div style="color: #fff; font-size: 13px; font-weight: 600;">🔄 Persistent on Boot</div>
                        <div style="color: #8b92b4; font-size: 11px;">Install to service.d for auto-apply on reboot</div>
                    </div>
                    <label class="toggle-switch">
                        <input type="checkbox" id="io-persist-toggle" ${installPersistent ? 'checked' : ''}>
                        <span class="toggle-slider"></span>
                    </label>
                </div>
            </div>
            <button id="io-apply-btn" style="width: 100%; padding: 12px; background: linear-gradient(135deg, #4a9eff, #2980b9); color: #fff; border: none; border-radius: 12px; font-size: 14px; font-weight: 700; cursor: pointer; margin-bottom: 10px;">💾 Apply I/O Tweaks</button>
        </div>

        <!-- BENCHMARK TEST TAB -->
        <div id="view-test" style="display: none;">
            <div style="margin-bottom: 15px; padding: 12px; background: rgba(0,0,0,0.3); border-radius: 10px;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                    <span style="color: #fff; font-size: 13px; font-weight: 600;">Test Read-Ahead Target</span>
                    <span id="io-test-val" style="color: #32D74B; font-weight: 600;">${testReadAhead} KB</span>
                </div>
                <input type="range" id="io-test-slider" min="16" max="8192" step="16" value="${testReadAhead}" style="width: 100%; height: 6px; background: rgba(255,255,255,0.2); border-radius: 3px; outline: none;">
                <div style="display: flex; justify-content: space-between; font-size: 11px; color: #888; margin-top: 4px;"><span>16 KB (Low Latency)</span><span>8192 KB (Bulk)</span></div>
            </div>
            <button id="io-run-fio" style="width: 100%; padding: 12px; background: linear-gradient(135deg, #32D74B, #1f9e30); color: #fff; border: none; border-radius: 12px; font-size: 14px; font-weight: 700; cursor: pointer; margin-bottom: 10px;">🚀 Execute FIO Benchmark</button>
            <div id="fio-result-card" style="display: none; padding: 12px; background: rgba(0,0,0,0.4); border-radius: 10px; margin-bottom: 10px; font-size: 12px; border-left: 4px solid #32D74B;"></div>
        </div>

        <!-- HISTORY / PORTFOLIO TAB -->
        <div id="view-history" style="display: none;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                <span style="color: #fff; font-size: 13px; font-weight: 600;">Testing Portfolio</span>
                <button id="io-clear-history" style="background: rgba(255,69,58,0.2); color: #ff453a; border: none; padding: 4px 8px; border-radius: 6px; font-size: 11px; cursor: pointer;">Clear History</button>
            </div>
            <div id="history-container" style="max-height: 200px; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; margin-bottom: 15px;"></div>
            
            <!-- DYNAMIC RECOMMENDATION BOX BASED ON PORTFOLIO WINNER -->
            <div id="dynamic-recommendation-box" style="padding: 12px; background: rgba(255,215,0,0.08); border: 1px solid rgba(255,215,0,0.3); border-radius: 10px; font-size: 11px; color: #8b92b4; margin-bottom: 15px;"></div>
        </div>

        <div id="io-status" style="text-align: center; font-size: 12px; color: #666; margin-bottom: 15px; min-height: 35px; padding: 8px; background: rgba(0,0,0,0.2); border-radius: 8px;"></div>
        <button id="io-cancel-btn" style="width: 100%; padding: 10px; background: rgba(255,255,255,0.1); color: #fff; border: none; border-radius: 10px; font-size: 13px; cursor: pointer;">Close</button>
        <div id="io-log-box" style="margin-top: 15px; background: #0d1117; border: 1px solid #30363d; border-radius: 8px; padding: 10px; max-height: 140px; overflow-y: auto; font-family: monospace; font-size: 11px; color: #3fb950; text-align: left; line-height: 1.4; word-break: break-all;"></div>
    `;

    modal.appendChild(box);
    document.body.appendChild(modal);
    
    setTimeout(() => updateLogBox('Initial Scan'), 50);

    // Tab Navigation
    const vApply = document.getElementById('view-apply');
    const vTest = document.getElementById('view-test');
    const vHistory = document.getElementById('view-history');
    const btnApply = document.getElementById('tab-apply');
    const btnTest = document.getElementById('tab-test');
    const btnHist = document.getElementById('tab-history');

    btnApply.onclick = () => { switchTab(btnApply, vApply); };
    btnTest.onclick = () => { switchTab(btnTest, vTest); };
    btnHist.onclick = () => { switchTab(btnHist, vHistory); renderHistory(); };

    function switchTab(activeBtn, activeView) {
        [btnApply, btnTest, btnHist].forEach(b => b.classList.remove('active'));
        [vApply, vTest, vHistory].forEach(v => v.style.display = 'none');
        activeBtn.classList.add('active');
        activeView.style.display = 'block';
    }

    const slider = document.getElementById('io-ra-slider');
    const raVal = document.getElementById('io-ra-val');
    if (slider && raVal) slider.oninput = () => { currentReadAhead = parseInt(slider.value); raVal.textContent = `${currentReadAhead} KB`; };

    const testSlider = document.getElementById('io-test-slider');
    const testVal = document.getElementById('io-test-val');
    if (testSlider && testVal) testSlider.oninput = () => { testReadAhead = parseInt(testSlider.value); testVal.textContent = `${testReadAhead} KB`; };

    const persistToggle = document.getElementById('io-persist-toggle');
    if (persistToggle) persistToggle.onchange = () => { installPersistent = persistToggle.checked; };

    document.getElementById('io-apply-btn').onclick = async () => {
        currentScheduler = document.getElementById('io-sched-select')?.value || currentScheduler;
        await applyTweaks();
    };

    document.getElementById('io-run-fio').onclick = async () => { await runFioBenchmark(); };
    document.getElementById('io-clear-history').onclick = async () => { benchmarkHistory = []; await saveHistory(); renderHistory(); };
    document.getElementById('io-cancel-btn').onclick = () => modal.remove();
    modal.onclick = e => { if (e.target === modal) modal.remove(); };
}

// Helper to extract numerical latency value robustly
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
    const statusEl = document.getElementById('io-status');
    const logBox = document.getElementById('io-log-box');
    const resultCard = document.getElementById('fio-result-card');
    const btnRun = document.getElementById('io-run-fio');

    if (!statusEl || !btnRun) return;

    btnRun.disabled = true;
    btnRun.textContent = '⏳ Testing I/O Performance...';
    statusEl.innerHTML = `<span style="color: #32D74B;">⚡ Applying ${testReadAhead} KB & Running FIO...</span>`;

    if (logBox) {
        logBox.innerHTML += `<br><span style="color: #79c0ff;">[${new Date().toLocaleTimeString()}] Temporarily setting read_ahead to ${testReadAhead} KB...</span><br>`;
        logBox.scrollTop = logBox.scrollHeight;
    }

    await execFn(`for file in $(find /sys -type f -name "read_ahead_kb" 2>/dev/null); do echo "${testReadAhead}" > "$file" 2>/dev/null; done`).catch(() => {});

    const testFile = '/data/local/tmp/fio_ui_test.tmp';
    const fioCmd = `${FIO_BIN} --name=ui_test --filename=${testFile} --rw=randread --bs=4k --iodepth=1 --size=64M --runtime=6 --time_based --direct=1`;

    try {
        const output = await execFn(fioCmd, 20000);
        await execFn(`rm -f ${testFile}`).catch(() => {});

        const iopsMatch = output.match(/IOPS=([0-9kK\.]+)/) || output.match(/iops\s*:\s*min=\s*([0-9\.]+)/);
        const bwMatch = output.match(/BW=([0-9\.]+[MiBGKiB\/s]+)/);
        
        // Improved Regex for robust latency parsing across FIO output versions
        const latSectionMatch = output.match(/(?:clat|lat|slat)\s*\((nsec\vert{}usec\vert{}msec)\)\s*:[^\n]*avg=([0-9\.]+)/i) 
                             || output.match(/lat\s*\((\w+)\)\s*:[^\n]*avg=([0-9\.]+)/i);

        const iops = iopsMatch ? iopsMatch[1] : 'N/A';
        const bw = bwMatch ? bwMatch[1] : 'N/A';
        
        let latVal = 999999;
        let unit = 'usec';

        if (latSectionMatch) {
            unit = latSectionMatch[1].toLowerCase();
            latVal = parseFloat(latSectionMatch[2]);

            // Normalize latency to microseconds (µs)
            if (unit === 'nsec') {
                latVal = latVal / 1000;
            } else if (unit === 'msec') {
                latVal = latVal * 1000;
            }
        }

        const avgLat = latVal !== 999999 ? `${latVal.toFixed(1)} µs` : 'N/A';

        let speedRating = '⚡ Fast Latency';
        let speedColor = '#32D74B';
        
        if (latVal > 250) {
            speedRating = '🐢 Slower Latency (High Prefetch Overhead)';
            speedColor = '#FF453A';
        } else if (latVal > 150) {
            speedRating = '⚖️ Balanced Performance';
            speedColor = '#FF9F0A';
        }

        const entry = {
            id: Date.now() + '_' + Math.random().toString(36).substr(2, 4),
            date: new Date().toLocaleTimeString(),
            raVal: Number(testReadAhead),
            ra: `${testReadAhead} KB`,
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
                <div><b>Read-Ahead:</b> ${testReadAhead} KB</div>
                <div><b>IOPS:</b> ${iops} | <b>Bandwidth:</b> ${bw}</div>
                <div><b>Avg Completion Latency:</b> ${avgLat}</div>
            `;
        }

        statusEl.innerHTML = `<span style="color: #32D74B;">✅ Benchmark Completed Successfully!</span>`;
        if (logBox) {
            logBox.innerHTML += `<span style="color: #3fb950;">[FIO Result] IOPS: ${iops} | BW: ${bw} | Lat: ${avgLat}</span><br>`;
            logBox.scrollTop = logBox.scrollHeight;
        }

    } catch (e) {
        statusEl.innerHTML = `<span style="color: #FF453A;">❌ FIO Error: ${e.message}</span>`;
        if (logBox) {
            logBox.innerHTML += `<span style="color: #ff453a;">Failed: Ensure binary exists at ${FIO_BIN}</span><br>`;
        }
    } finally {
        btnRun.disabled = false;
        btnRun.textContent = '🚀 Execute FIO Benchmark';
    }
}

function renderHistory() {
    const container = document.getElementById('history-container');
    const recBox = document.getElementById('dynamic-recommendation-box');
    if (!container) return;

    if (benchmarkHistory.length === 0) {
        container.innerHTML = `<div style="color: #666; font-size: 11px; text-align: center; padding: 20px;">No benchmark records found. Run a test in FIO Benchmark!</div>`;
        if (recBox) {
            recBox.innerHTML = `
                <div style="color: #79c0ff; font-weight: 600; margin-bottom: 4px;">💡 Recommended Profile:</div>
                <div style="color: #fff;">No benchmark history available. Run FIO tests to calculate your device's optimal read-ahead setting.</div>
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
                <span style="background: rgba(255,215,0,0.2); padding: 2px 8px; border-radius: 6px;">👑 ${winner.ra}</span>
            </div>
            <div style="color: #fff; margin-bottom: 4px;">
                This profile achieved the lowest storage latency (<b>${winner.lat}</b>) and <b>${winner.iops} IOPS</b> based on your benchmark tests.
            </div>
            <div style="color: #32D74B; font-weight: 600;">
                ✔ Recommended for smooth system responsiveness and minimal micro-stutters.
            </div>
        `;
    }

    container.innerHTML = benchmarkHistory.slice().reverse().map(item => {
        const itemLat = parseLatency(item);
        const isWinner = winner && (item.id === winner.id || (item.ra === winner.ra && Math.abs(itemLat - lowestLat) < 0.01));
        const bgStyle = isWinner ? 'background: rgba(255, 215, 0, 0.1); border: 1px solid #FFD700;' : 'background: rgba(0,0,0,0.3);';
        
        return `
            <div style="padding: 8px 12px; ${bgStyle} border-radius: 8px; font-size: 11px; border-left: 3px solid ${isWinner ? '#FFD700' : item.color};">
                <div style="display: flex; justify-content: space-between; color: #fff; font-weight: 600;">
                    <span>${item.ra} (${item.rating}) ${isWinner ? '👑' : ''}</span>
                    <span style="color: #666; font-weight: normal;">${item.date}</span>
                </div>
                <div style="color: #8b92b4; margin-top: 2px;">
                    IOPS: <span style="color: #79c0ff;">${item.iops}</span> | BW: <span style="color: #79c0ff;">${item.bw}</span> | Latency: <span style="color: #32D74B;">${item.lat}</span>
                </div>
            </div>
        `;
    }).join('');
}

async function applyTweaks() {
    const statusEl = document.getElementById('io-status');
    const applyBtn = document.getElementById('io-apply-btn');
    if (!statusEl || !applyBtn) return;
    applyBtn.disabled = true;
    applyBtn.textContent = installPersistent ? '⏳ Installing & Applying...' : '⏳ Applying...';
    statusEl.innerHTML = '<span style="color: #FF9F0A;">🔍 Scanning /sys for I/O files...</span>';
    await execFn(`mkdir -p /sdcard/MTK_AI_Engine && printf 'read_ahead=%s\\nscheduler=%s\\n' '${currentReadAhead}' '${currentScheduler}' > "${CONFIG_FILE}" 2>/dev/null`).catch(() => {});
    try {
        if (installPersistent) await installPersistentService();
        else await applyImmediate();
    } catch (e) {
        statusEl.innerHTML = `<span style="color: #FF453A;">❌ ${e.message}</span><br><small style="color: #8b92b4;">Ensure root access & check dmesg for SELinux</small>`;
        applyBtn.disabled = false;
        applyBtn.textContent = '💾 Apply I/O Tweaks';
    }
}

async function applyImmediate() {
    const statusEl = document.getElementById('io-status');
    const logBox = document.getElementById('io-log-box');
    if (logBox) {
        logBox.innerHTML += `<br><span style="color: #ffa657;">[${new Date().toLocaleTimeString()}] Applying tweaks...</span><br>`;
        logBox.scrollTop = logBox.scrollHeight;
    }
    
    statusEl.innerHTML = `<span style="color: #4a9eff;">⚡ Scanning and applying... Don't close UI</span>`;
    
    const script = `
        COUNT=0; SUCCESS=0
        for file in $(find /sys -type f \\( -name "read_ahead_kb" -o -name "scheduler" \\) 2>/dev/null); do
            COUNT=$((COUNT + 1))
            chmod 777 "$file" 2>/dev/null
            case "$file" in
                *read_ahead_kb) echo "${currentReadAhead}" > "$file" 2>/dev/null && SUCCESS=$((SUCCESS + 1)) ;;
                *scheduler) echo "${currentScheduler}" > "$file" 2>/dev/null && SUCCESS=$((SUCCESS + 1)) ;;
            esac
        done
        echo "$SUCCESS/$COUNT"
    `;
    
    try {
        const result = await execFn(script).catch(() => '0/0');
        const [success, total] = result.split('/');
        
        if (parseInt(success) > 0) {
            statusEl.innerHTML = `<span style="color: #32D74B;">✅ Applied to ${success}/${total}</span><br><small>${currentReadAhead} KB | ${currentScheduler}</small>`;
            window.showStatus?.(`✅ I/O Tweaks: ${success} entries updated`, '#4a9eff');
            if (logBox) {
                logBox.innerHTML += `<span style="color: #3fb950;">[${new Date().toLocaleTimeString()}] Applied successfully. Refreshing logs...</span><br>`;
                await updateLogBox('Post-Apply Scan');
            }
        } else {
            throw new Error('All writes failed (check root/SELinux)');
        }
    } catch (e) {
        throw e;
    }
    
    setTimeout(() => document.getElementById('io-modal')?.remove(), 2000);
}

async function installPersistentService() {
    const statusEl = document.getElementById('io-status');
    const logBox = document.getElementById('io-log-box');
    if (logBox) {
        logBox.innerHTML += `<br><span style="color: #ffa657;">[${new Date().toLocaleTimeString()}] Installing persistent service...</span><br>`;
        logBox.scrollTop = logBox.scrollHeight;
    }
    statusEl.innerHTML = '<span style="color: #4a9eff;">📦 Generating service script...</span>';
    const scriptContent = `#!/system/bin/sh
CONFIG="/sdcard/MTK_AI_Engine/iotweaks.conf"
LOG="/sdcard/MTK_AI_Engine/iotweaks.log"
log() { echo "[$(date '+%H:%M:%S')] $*" >> "$LOG" 2>/dev/null; }
log "=== I/O Tweaks Service Starting ==="
COUNT=0
while [ $COUNT -lt 30 ]; do [ -f "$CONFIG" ] && break; sleep 2; COUNT=$((COUNT + 1)); done
RA=4096; SCHED="none"
if [ -f "$CONFIG" ]; then
while IFS='=' read -r key val; do
case "$key" in read_ahead) RA="$val" ;; scheduler) SCHED="$val" ;; esac
done < "$CONFIG"
fi
log "Applying: RA=$RA, SCHED=$SCHED"
/system/bin/find /sys -type f \\( -name "read_ahead_kb" -o -name "scheduler" \\) 2>/dev/null | while IFS= read -r file; do
/system/bin/chmod 777 "$file" 2>/dev/null
case "$file" in
*read_ahead_kb) /system/bin/echo "$RA" | /system/bin/tee "$file" >/dev/null 2>&1 ;;
*scheduler) /system/bin/echo "$SCHED" | /system/bin/tee "$file" >/dev/null 2>&1 ;;
esac
log "Applied: $file"
done
log "=== I/O Tweaks Service Complete ==="
exit 0`;
    const b64 = btoa(scriptContent);
    await execFn(`su -c "mkdir -p /data/adb/service.d && echo '${b64}' | base64 -d > '${SERVICE_SCRIPT}' && chmod 755 '${SERVICE_SCRIPT}'"`);
    const verify = await execFn(`su -c "[ -x '${SERVICE_SCRIPT}' ] && echo ok || echo fail"`);
    if (verify !== 'ok') throw new Error('Service installation failed');
    statusEl.innerHTML = `<span style="color: #32D74B;">✅ Service installed</span><br><small>Auto-applies on boot</small>`;
    await applyImmediate();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
})();
