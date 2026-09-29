// terminalemulator.js - Adaptive Terminal Emulator for Tools Page
(function() {
'use strict';
const CONFIG_FILE = '/sdcard/MTK_AI_Engine/terminal.conf';
const MAX_HISTORY = 50;
let config = {
    history: [],
    historyIndex: -1,
    autoScroll: true,
    fontSize: 16,
    theme: 'dark'
};

// Predefined commands list
const PREDEFINED_COMMANDS = [
    { label: '🔍 getprop | grep [keyword]', cmd: 'getprop | grep ', copyOnly: true, hint: 'Paste keyword after' },
    { label: '📱 List all properties', cmd: 'getprop', copyOnly: false },
    { label: '☮️ CPU governor live', cmd: `cat /sys/devices/system/cpu/cpu*/cpufreq/scaling_governor 2>/dev/null | tr '\\n' ' '`, copyOnly: false, live: true, interval: 1000 },
    { label: '⚡ CPU freq live (MHz)', cmd: `cat /sys/devices/system/cpu/cpu*/cpufreq/scaling_cur_freq 2>/dev/null | awk '{printf "%.0f ", $1/1000}'`, copyOnly: false, live: true, interval: 1000 },
    { label: '⚙️ Devfreq nodes info', cmd: `find /sys -type f -name "available_frequencies" 2>/dev/null | sort | while read -r f; do d="\${f%/*}"; [ -r "\$f" ] || continue; n=\$(basename "\$d"); m=\$(cat "\$d/min_freq" 2>/dev/null); x=\$(cat "\$d/max_freq" 2>/dev/null); s=\$(cat "\$d/set_freq" 2>/dev/null); echo "==================================="; echo "=== \$n ==="; echo "Path: \$d"; echo "Governor lists: \$(tr -s '[:space:]' ' ' < "\$d/available_governors" 2>/dev/null)"; echo "Current Governor: \$(tr -s '[:space:]' ' ' < "\$d/governor" 2>/dev/null)"; echo "Available Frequency: \$(tr -s '[:space:]' ' ' < "\$f" 2>/dev/null)"; echo "Current Frequency Min/Max: \${m:-\$s} / \${x:-\$s}"; done`, copyOnly: false },
    { label: '🔎 Read-ahead & Scheduler', cmd: `find /sys \\( -name "read_ahead_kb" -o -name "scheduler" \\) ! -type d 2>/dev/null | while IFS= read -r file; do [ -r "$file" ] && echo "$file => $(cat "$file" 2>/dev/null)"; done`, copyOnly: false },
    { label: '🔋 Battery stats', cmd: 'dumpsys battery', copyOnly: false },
    { label: '📶 WiFi info', cmd: 'cmd wifi list-networks', copyOnly: false },
    { label: '🧠 CPU info', cmd: 'cat /proc/cpuinfo', copyOnly: false },
    { label: '🌡️ Thermal zones', cmd: 'ls /sys/class/thermal/thermal_zone*/temp', copyOnly: false },
    { label: '⚡ Current frequency', cmd: 'cat /sys/devices/system/cpu/cpu*/cpufreq/scaling_cur_freq', copyOnly: false },
    { label: '📦 Installed packages', cmd: 'pm list packages', copyOnly: false },
    { label: '🔒 SELinux status', cmd: 'getenforce', copyOnly: false },
    { label: '🗂️ Mount points', cmd: 'mount | grep -E "ext4|f2fs"', copyOnly: false },
    { label: '🧹 Clear logcat', cmd: 'logcat -c', copyOnly: false },
    { label: '📜 View logcat', cmd: 'logcat -d -v threadtime', copyOnly: false },
    { label: '💾 Free memory', cmd: 'cat /proc/meminfo | grep -E "MemAvailable|MemFree"', copyOnly: false },
    { label: '🔄 Reboot', cmd: 'reboot', copyOnly: false, confirm: true },
    { label: '🔌 Reboot recovery', cmd: 'reboot recovery', copyOnly: false, confirm: true },
];

const execFn = window.exec || async function(cmd, timeout = 15000) {
    return new Promise(resolve => {
        const cb = `term_exec_${Date.now()}_${Math.random().toString(36).substring(2)}`;
        const t = setTimeout(() => { delete window[cb]; resolve(''); }, timeout);
        window[cb] = (_, res) => { clearTimeout(t); delete window[cb]; resolve(res || ''); };
        if (window.ksu) ksu.exec(cmd, `window.${cb}`);
        else { clearTimeout(t); resolve(''); }
    });
};

function escapeHtml(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function appendOutput(html) {
    const historyEl = document.getElementById('terminal-history');
    const outputEl = document.getElementById('terminal-output');
    if (!historyEl) return;
    historyEl.innerHTML += html;
    if (config.autoScroll && outputEl) {
        outputEl.scrollTop = outputEl.scrollHeight;
    }
}

let liveMonitorInterval = null;

function stopLiveMonitor() {
    if (liveMonitorInterval) {
        clearInterval(liveMonitorInterval);
        liveMonitorInterval = null;
        appendOutput(`<span style="color:var(--accent-red);">⏹️ Live monitor stopped.\n</span>`);
    }
}

function startLiveMonitor(cmdObj) {
    if (liveMonitorInterval) {
        stopLiveMonitor();
        return;
    }

    appendOutput(`<span style="color:var(--accent-green);">▶️ Starting live monitor (every ${cmdObj.interval}ms). Click 'Run' again to stop.\n</span>`);

    const poll = async () => {
        const time = new Date().toLocaleTimeString();
        try {
            const res = await execFn(cmdObj.cmd, 3000);
            if (res && res.trim()) {
                appendOutput(`<span style="color:#ffffff;">[${time}]</span> <span style="color:#ffffff;">${escapeHtml(res.trim())}</span>\n`);
            }
        } catch (e) {}
    };

    poll();
    liveMonitorInterval = setInterval(poll, cmdObj.interval);
}

async function init() {
    await loadConfig();
    bindClickHandler();
    bindKeyboardShortcut();
}

async function loadConfig() {
    try {
        const raw = await execFn(`cat ${CONFIG_FILE} 2>/dev/null`);
        if (raw && raw.trim()) {
            const parsed = JSON.parse(raw.trim());
            config = { ...config, ...parsed };
        }
    } catch (e) { console.warn('Terminal: Config load failed:', e); }
}

async function saveConfig() {
    try {
        await execFn(`mkdir -p /sdcard/MTK_AI_Engine && echo '${JSON.stringify(config)}' > ${CONFIG_FILE}`);
    } catch (e) { console.warn('Terminal: Config save failed:', e); }
}

function bindClickHandler() {
    const btn = document.getElementById('terminal-btn');
    if (!btn) return;
    btn.addEventListener('click', () => showTerminalModal());
}

function bindKeyboardShortcut() {
    document.addEventListener('keydown', (e) => {
        if (e.key === ' ' || e.code === 'Space') {
            const activeEl = document.activeElement;
            const isEditing = activeEl && (
                activeEl.tagName === 'INPUT' ||
                activeEl.tagName === 'TEXTAREA' ||
                activeEl.isContentEditable
            );

            if (!isEditing && !document.getElementById('terminal-modal')) {
                e.preventDefault();
                showTerminalModal();
            }
        }
    });
}

async function detectTermux() {
    try {
        const res = await execFn('pm path com.termux 2>/dev/null');
        return res && res.includes('/data/app') && !res.includes('Not found');
    } catch { return false; }
}

function showTerminalModal() {
    const existing = document.getElementById('terminal-modal');
    if (existing) existing.remove();

    // Backdrop container centered with flex alignment
    const modal = document.createElement('div');
    modal.id = 'terminal-modal';
    modal.style.cssText = `position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.92);z-index:10000;display:flex;align-items:center;justify-content:center;padding:12px;backdrop-filter:blur(6px);box-sizing:border-box;transition:align-items 0.2s ease, padding 0.2s ease;`;

    // Modal Box sizing adaptively based on available viewport
    const box = document.createElement('div');
    box.style.cssText = `background:var(--bg-card);border:1px solid var(--border-color);border-radius:16px;width:100%;max-width:720px;height:100%;max-height:750px;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 12px 32px rgba(0,0,0,0.6);transition:max-height 0.2s ease;`;

    // Header
    const header = document.createElement('div');
    header.style.cssText = `display:flex;justify-content:space-between;align-items:center;padding:12px 16px;background:var(--bg-secondary);border-bottom:1px solid var(--border-color);flex-shrink:0;`;
    header.innerHTML = `
        <div style="display:flex;align-items:center;gap:8px;">
            <i class="fas fa-terminal" style="color:var(--accent-blue);"></i>
            <span style="color:#ffffff;font-weight:600;font-size:15px;">Terminal Emulator</span>
            <span id="termux-badge" style="display:none;background:var(--accent-green);color:#ffffff;font-size:10px;padding:2px 8px;border-radius:10px;margin-left:6px;">TERMUX DETECTED</span>
        </div>
        <div style="display:flex;gap:6px;">
            <button id="term-commands-btn" style="background:var(--bg-card);color:#ffffff;border:1px solid var(--border-color);padding:6px 10px;border-radius:6px;cursor:pointer;font-size:12px;display:flex;align-items:center;gap:4px;"><i class="fas fa-list"></i> Commands</button>
            <button id="term-clear-btn" style="background:var(--bg-card);color:#ffffff;border:1px solid var(--border-color);padding:6px 10px;border-radius:6px;cursor:pointer;font-size:12px;"><i class="fas fa-trash"></i> Clear</button>
            <button id="term-copy-btn" style="background:var(--bg-card);color:#ffffff;border:1px solid var(--border-color);padding:6px 10px;border-radius:6px;cursor:pointer;font-size:12px;"><i class="fas fa-copy"></i> Copy</button>
            <button id="term-close-btn" style="background:var(--accent-red);color:#ffffff;border:none;padding:6px 10px;border-radius:6px;cursor:pointer;font-size:12px;"><i class="fas fa-times"></i></button>
        </div>
    `;

    // Main Terminal Viewport (Screen history + Inline prompt)
    const output = document.createElement('div');
    output.id = 'terminal-output';
    output.style.cssText = `flex:1;overflow-y:auto;padding:12px 16px;font-family:'Courier New',Courier,monospace;font-size:${config.fontSize}px;color:#ffffff;line-height:1.5;white-space:pre-wrap;word-break:break-all;cursor:text;`;

    output.innerHTML = `
        <div id="terminal-history"><span style="color:var(--accent-blue);">root@mtk-ai-engine:~#</span> <span style="color:#ffffff;">Welcome to Terminal Emulator. Type 'help' for commands.\n</span></div>
        <div id="terminal-prompt-line" style="display:flex;align-items:center;gap:6px;margin-top:2px;">
            <span style="color:var(--accent-blue);font-weight:bold;font-family:monospace;font-size:${config.fontSize}px;flex-shrink:0;">root@device:~#</span>
            <input id="terminal-input" type="text" style="flex:1;background:transparent;border:none;color:#ffffff;font-family:'Courier New',Courier,monospace;font-size:${config.fontSize}px;outline:none;padding:0;margin:0;width:100%;" autocomplete="off" spellcheck="false">
        </div>
    `;

    // Commands dropdown
    const commandsDropdown = document.createElement('div');
    commandsDropdown.id = 'commands-dropdown';
    commandsDropdown.style.cssText = `display:none;position:absolute;top:52px;right:16px;background:var(--bg-secondary);border:1px solid var(--border-color);border-radius:8px;max-height:250px;overflow-y:auto;z-index:10001;min-width:280px;box-shadow:0 8px 24px rgba(0,0,0,0.4);`;
    commandsDropdown.innerHTML = PREDEFINED_COMMANDS.map((item, i) => `
        <div style="padding:10px 12px;border-bottom:1px solid var(--border-color);cursor:pointer;display:flex;justify-content:space-between;align-items:center;" data-cmd-index="${i}">
            <div style="flex:1;min-width:0;">
                <div style="color:#ffffff;font-size:13px;font-weight:500;">${escapeHtml(item.label)}</div>
                ${item.hint ? `<div style="color:#ffffff;font-size:11px;margin-top:2px;opacity:0.8;">${escapeHtml(item.hint)}</div>` : ''}
            </div>
            <div style="display:flex;gap:4px;flex-shrink:0;">
                <button class="cmd-copy-btn" data-cmd-index="${i}" style="background:var(--bg-card);color:#ffffff;border:1px solid var(--border-color);padding:4px 8px;border-radius:4px;cursor:pointer;font-size:11px;">Copy</button>
                ${!item.copyOnly ? `<button class="cmd-run-btn" data-cmd-index="${i}" style="background:var(--accent-green);color:#ffffff;border:none;padding:4px 8px;border-radius:4px;cursor:pointer;font-size:11px;">Run</button>` : ''}
            </div>
        </div>
    `).join('');

    // Termux launch bar
    const termuxBar = document.createElement('div');
    termuxBar.id = 'termux-bar';
    termuxBar.style.cssText = `display:none;padding:8px 16px;background:var(--bg-secondary);border-top:1px solid var(--border-color);text-align:center;flex-shrink:0;`;
    termuxBar.innerHTML = `<button id="launch-termux-btn" style="background:var(--accent-purple);color:#ffffff;border:none;padding:6px 14px;border-radius:6px;cursor:pointer;font-size:12px;font-weight:bold;"><i class="fas fa-terminal"></i> Open in Termux App</button>`;

    box.appendChild(header);
    box.appendChild(output);
    box.appendChild(commandsDropdown);
    box.appendChild(termuxBar);
    modal.appendChild(box);
    document.body.appendChild(modal);

    const input = document.getElementById('terminal-input');

    // Tap anywhere on terminal screen to focus input
    output.addEventListener('click', (e) => {
        const selection = window.getSelection();
        if (!selection || selection.toString().length === 0) {
            if (input) input.focus();
        }
    });

    // Dynamic keyboard & viewport resize handling
    const handleViewportChange = () => {
        if (!window.visualViewport) return;
        const vp = window.visualViewport;
        const isFocused = document.activeElement === input;
        const keyboardActive = vp.height < window.innerHeight * 0.85 || isFocused;

        if (keyboardActive) {
            modal.style.alignItems = 'flex-start';
            modal.style.paddingTop = '8px';
            modal.style.height = `${vp.height}px`;
            modal.style.top = `${vp.offsetTop}px`;
            box.style.maxHeight = `${vp.height - 16}px`;
        } else {
            modal.style.alignItems = 'center';
            modal.style.paddingTop = '12px';
            modal.style.height = '100%';
            modal.style.top = '0px';
            box.style.maxHeight = '750px';
        }
        output.scrollTop = output.scrollHeight;
    };

    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', handleViewportChange);
        window.visualViewport.addEventListener('scroll', handleViewportChange);
    }

    if (input) {
        input.focus();
        input.addEventListener('focus', () => setTimeout(handleViewportChange, 100));
        input.addEventListener('blur', () => setTimeout(handleViewportChange, 100));
    }

    detectTermux().then(hasTermux => {
        if (hasTermux) {
            const badge = document.getElementById('termux-badge');
            const bar = document.getElementById('termux-bar');
            if (badge) badge.style.display = 'inline-block';
            if (bar) bar.style.display = 'block';
        }
    });

    const cleanupModal = () => {
        if (window.visualViewport) {
            window.visualViewport.removeEventListener('resize', handleViewportChange);
            window.visualViewport.removeEventListener('scroll', handleViewportChange);
        }
        stopLiveMonitor();
        modal.remove();
    };

    document.getElementById('term-close-btn').addEventListener('click', cleanupModal);

    document.getElementById('term-clear-btn').addEventListener('click', () => {
        const historyEl = document.getElementById('terminal-history');
        if (historyEl) {
            historyEl.innerHTML = `<span style="color:var(--accent-blue);">root@mtk-ai-engine:~#</span> <span style="color:#ffffff;">Console cleared.\n</span>`;
        }
    });

    document.getElementById('term-copy-btn').addEventListener('click', () => {
        const historyEl = document.getElementById('terminal-history');
        const textToCopy = historyEl ? historyEl.innerText : output.innerText;
        navigator.clipboard.writeText(textToCopy).then(() => {
            appendOutput(`<span style="color:var(--accent-green);">📋 Output copied to clipboard.\n</span>`);
        }).catch(() => {
            appendOutput(`<span style="color:var(--accent-red);">❌ Failed to copy output.\n</span>`);
        });
    });

    document.getElementById('term-commands-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        const dd = document.getElementById('commands-dropdown');
        if (dd) dd.style.display = (dd.style.display === 'none' || !dd.style.display) ? 'block' : 'none';
    });

    modal.addEventListener('click', (e) => {
        const dd = document.getElementById('commands-dropdown');
        const btn = document.getElementById('term-commands-btn');
        if (dd && dd.style.display === 'block' && !dd.contains(e.target) && !btn.contains(e.target)) {
            dd.style.display = 'none';
        }
    });

    commandsDropdown.addEventListener('click', async (e) => {
        const copyBtn = e.target.closest('.cmd-copy-btn');
        const runBtn = e.target.closest('.cmd-run-btn');

        if (copyBtn) {
            e.stopPropagation();
            const idx = parseInt(copyBtn.dataset.cmdIndex, 10);
            const item = PREDEFINED_COMMANDS[idx];
            if (item && input) {
                input.value = item.cmd;
                input.focus();
                commandsDropdown.style.display = 'none';
                output.scrollTop = output.scrollHeight;
            }
        } else if (runBtn) {
            e.stopPropagation();
            const idx = parseInt(runBtn.dataset.cmdIndex, 10);
            const item = PREDEFINED_COMMANDS[idx];
            if (item) {
                commandsDropdown.style.display = 'none';
                if (item.confirm && !confirm(`Execute '${item.cmd}'?`)) return;
                if (item.live) {
                    startLiveMonitor(item);
                } else {
                    executeCommand(item.cmd);
                }
            }
        }
    });

    modal.addEventListener('click', function handleTermuxLaunch(e) {
        if (e.target && e.target.closest('#launch-termux-btn')) {
            execFn('am start -n com.termux/.app.TermuxActivity 2>/dev/null');
        }
    });

    let historyIdx = -1;
    input.addEventListener('keydown', async (e) => {
        if (e.key === 'Enter') {
            const cmd = input.value.trim();
            input.value = '';

            if (!cmd) {
                appendOutput(`<span style="color:var(--accent-blue);">root@device:~#</span>\n`);
                return;
            }

            if (config.history[config.history.length - 1] !== cmd) {
                config.history.push(cmd);
                if (config.history.length > MAX_HISTORY) config.history.shift();
                saveConfig();
            }
            historyIdx = -1;

            if (cmd === 'clear') {
                const historyEl = document.getElementById('terminal-history');
                if (historyEl) {
                    historyEl.innerHTML = `<span style="color:var(--accent-blue);">root@mtk-ai-engine:~#</span> <span style="color:#ffffff;">Console cleared.\n</span>`;
                }
                return;
            }

            if (cmd === 'help') {
                appendOutput(`<span style="color:var(--accent-blue);">root@device:~#</span> <span style="color:#ffffff;">${escapeHtml(cmd)}</span>\n`);
                appendOutput(`<span style="color:#ffffff;">Available built-in commands:\n  help    - Show this message\n  clear   - Clear terminal output\n  exit    - Close terminal emulator\n</span>`);
                return;
            }

            if (cmd === 'exit') {
                cleanupModal();
                return;
            }

            await executeCommand(cmd);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (config.history.length > 0) {
                if (historyIdx === -1) historyIdx = config.history.length - 1;
                else if (historyIdx > 0) historyIdx--;
                input.value = config.history[historyIdx] || '';
            }
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (historyIdx !== -1) {
                if (historyIdx < config.history.length - 1) {
                    historyIdx++;
                    input.value = config.history[historyIdx] || '';
                } else {
                    historyIdx = -1;
                    input.value = '';
                }
            }
        }
    });
}

async function executeCommand(cmd) {
    appendOutput(`<span style="color:var(--accent-blue);">root@device:~#</span> <span style="color:#ffffff;">${escapeHtml(cmd)}</span>\n`);
    try {
        const res = await execFn(cmd);
        if (res) {
            appendOutput(`<span style="color:#ffffff;">${escapeHtml(res)}</span>\n`);
        } else {
            appendOutput(`<span style="color:#ffffff;">(Command returned no output)</span>\n`);
        }
    } catch (err) {
        appendOutput(`<span style="color:var(--accent-red);">Error: ${escapeHtml(err.message || String(err))}</span>\n`);
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
})();
