// terminalemulator.js - Adaptive Terminal Emulator for Tools Page
(function() {
    'use strict';

    const CONFIG_FILE = '/sdcard/MTK_AI_Engine/terminal.conf';
    const MAX_HISTORY = 50;
    
    let config = {
        history: [],
        autoScroll: true,
        fontSize: 13,
        theme: 'dark'
    };

    // Predefined commands list - Easy to extend!
    const PREDEFINED_COMMANDS = [
        { label: '🔍 getprop | grep [keyword]', cmd: 'getprop | grep ', copyOnly: true, hint: 'Paste keyword after' },
        { label: '📱 List all properties', cmd: 'getprop', copyOnly: false },
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

    // Safe exec wrapper (matches your existing pattern)
    const execFn = window.exec || async function(cmd, timeout = 15000) {
        return new Promise(resolve => {
            const cb = `term_exec_${Date.now()}_${Math.random().toString(36).substring(2)}`;
            const t = setTimeout(() => { delete window[cb]; resolve(''); }, timeout);
            window[cb] = (_, res) => { clearTimeout(t); delete window[cb]; resolve(res || ''); };
            if (window.ksu) ksu.exec(cmd, `window.${cb}`);
            else { clearTimeout(t); resolve(''); }
        });
    };

    async function init() {
        await loadConfig();
        bindClickHandler();
    }

    async function loadConfig() {        try {
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

    async function detectTermux() {
        try {
            const res = await execFn('pm path com.termux 2>/dev/null');
            return res && res.includes('/data/app') && !res.includes('Not found');
        } catch { return false; }
    }

    function showTerminalModal() {
        const existing = document.getElementById('terminal-modal');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = 'terminal-modal';
        modal.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,0.92);z-index:10000;display:flex;align-items:flex-end;justify-content:center;backdrop-filter:blur(6px);`;

        const box = document.createElement('div');
        box.style.cssText = `background:#0d1117;border:1px solid #30363d;border-radius:16px 16px 0 0;width:100%;max-width:700px;height:85vh;display:flex;flex-direction:column;overflow:hidden;`;

        // Header
        const header = document.createElement('div');
        header.style.cssText = `display:flex;justify-content:space-between;align-items:center;padding:12px 16px;background:#161b22;border-bottom:1px solid #30363d;`;
        header.innerHTML = `
            <div style="display:flex;align-items:center;gap:8px;">
                <i class="fas fa-terminal" style="color:#58a6ff;"></i>
                <span style="color:#c9d1d9;font-weight:600;font-size:15px;">Terminal Emulator</span>
                <span id="termux-badge" style="display:none;background:#238636;color:#fff;font-size:10px;padding:2px 8px;border-radius:10px;margin-left:6px;">TERMUX DETECTED</span>
            </div>
            <div style="display:flex;gap:6px;">
                <button id="term-commands-btn" style="background:#30363d;color:#c9d1d9;border:none;padding:6px 10px;border-radius:6px;cursor:pointer;font-size:12px;display:flex;align-items:center;gap:4px;"><i class="fas fa-list"></i> Commands</button>                <button id="term-clear-btn" style="background:#21262d;color:#c9d1d9;border:none;padding:6px 10px;border-radius:6px;cursor:pointer;font-size:12px;"><i class="fas fa-trash"></i> Clear</button>
                <button id="term-copy-btn" style="background:#21262d;color:#c9d1d9;border:none;padding:6px 10px;border-radius:6px;cursor:pointer;font-size:12px;"><i class="fas fa-copy"></i> Copy</button>
                <button id="term-close-btn" style="background:#da3633;color:#fff;border:none;padding:6px 10px;border-radius:6px;cursor:pointer;font-size:12px;"><i class="fas fa-times"></i></button>
            </div>
        `;

        // Output area
        const output = document.createElement('div');
        output.id = 'terminal-output';
        output.style.cssText = `flex:1;overflow-y:auto;padding:12px 16px;font-family:'Courier New',Courier,monospace;font-size:${config.fontSize}px;color:#c9d1d9;line-height:1.5;white-space:pre-wrap;word-break:break-all;`;
        output.innerHTML = `<span style="color:#58a6ff;">root@mtk-ai-engine:~#</span> <span style="color:#8b949e;">Welcome to Terminal Emulator. Type 'help' for commands.\n</span>`;

        // Input area
        const inputWrap = document.createElement('div');
        inputWrap.style.cssText = `display:flex;align-items:center;padding:10px 16px;background:#0d1117;border-top:1px solid #30363d;gap:8px;`;
        inputWrap.innerHTML = `
            <span style="color:#58a6ff;font-weight:bold;font-family:monospace;font-size:${config.fontSize}px;">root@device:~#</span>
            <input id="terminal-input" type="text" style="flex:1;background:transparent;border:none;color:#c9d1d9;font-family:'Courier New',monospace;font-size:${config.fontSize}px;outline:none;padding:4px;" placeholder="Type command..." autocomplete="off" spellcheck="false">
        `;

        // Commands dropdown (hidden by default)
        const commandsDropdown = document.createElement('div');
        commandsDropdown.id = 'commands-dropdown';
        commandsDropdown.style.cssText = `display:none;position:absolute;top:52px;right:16px;background:#161b22;border:1px solid #30363d;border-radius:8px;max-height:300px;overflow-y:auto;z-index:10001;min-width:280px;box-shadow:0 8px 24px rgba(0,0,0,0.4);`;
        commandsDropdown.innerHTML = PREDEFINED_COMMANDS.map((item, i) => `
            <div style="padding:10px 12px;border-bottom:1px solid #30363d;cursor:pointer;display:flex;justify-content:space-between;align-items:center;" data-cmd-index="${i}">
                <div style="flex:1;min-width:0;">
                    <div style="color:#c9d1d9;font-size:13px;font-weight:500;">${item.label}</div>
                    ${item.hint ? `<div style="color:#8b949e;font-size:11px;margin-top:2px;">${item.hint}</div>` : ''}
                </div>
                <div style="display:flex;gap:4px;flex-shrink:0;">
                    <button class="cmd-copy-btn" data-cmd-index="${i}" style="background:#30363d;color:#c9d1d9;border:none;padding:4px 8px;border-radius:4px;cursor:pointer;font-size:11px;">Copy</button>
                    ${!item.copyOnly ? `<button class="cmd-run-btn" data-cmd-index="${i}" style="background:#238636;color:#fff;border:none;padding:4px 8px;border-radius:4px;cursor:pointer;font-size:11px;">Run</button>` : ''}
                </div>
            </div>
        `).join('');

        // Termux launch bar
        const termuxBar = document.createElement('div');
        termuxBar.id = 'termux-bar';
        termuxBar.style.cssText = `display:none;padding:8px 16px;background:#161b22;border-top:1px solid #30363d;`;
        termuxBar.innerHTML = `
            <button id="open-termux-btn" style="width:100%;padding:10px;background:#238636;color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;">
                <i class="fas fa-external-link-alt"></i> Open in Termux (Full PTY Support)
            </button>
        `;

        box.append(header, output, inputWrap, termuxBar);
        modal.appendChild(box);
        modal.appendChild(commandsDropdown);        document.body.appendChild(modal);
        modal.onclick = e => { 
            if (e.target === modal) modal.remove(); 
            commandsDropdown.style.display = 'none';
        };

        // Post-DOM event binding
        const input = document.getElementById('terminal-input');
        const outputEl = document.getElementById('terminal-output');
        let historyIndex = -1;

        input.addEventListener('keydown', async (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const cmd = input.value.trim();
                if (!cmd) return;
                
                input.value = '';
                historyIndex = -1;
                
                if (config.history[config.history.length - 1] !== cmd) {
                    config.history.push(cmd);
                    if (config.history.length > MAX_HISTORY) config.history.shift();
                    await saveConfig();
                }
                
                await executeCommand(cmd, outputEl);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                if (config.history.length === 0) return;
                historyIndex = Math.max(-1, historyIndex - 1);
                input.value = historyIndex === -1 ? '' : config.history[config.history.length - 1 - historyIndex];
            } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                if (historyIndex === -1) return;
                historyIndex = Math.min(config.history.length - 1, historyIndex + 1);
                input.value = historyIndex === -1 ? '' : config.history[config.history.length - 1 - historyIndex];
            }
        });

        // Header buttons
        document.getElementById('term-close-btn').onclick = () => modal.remove();
        document.getElementById('term-clear-btn').onclick = () => {
            outputEl.innerHTML = '';
            appendOutput(`<span style="color:#58a6ff;">root@mtk-ai-engine:~#</span> <span style="color:#8b949e;">Screen cleared.\n</span>`, outputEl);
        };
        document.getElementById('term-copy-btn').onclick = () => {
            const text = outputEl.innerText;
            navigator.clipboard.writeText(text).then(() => {
                appendOutput(`<span style="color:#3fb950;">📋 Output copied to clipboard</span>\n`, outputEl);            }).catch(() => appendOutput(`<span style="color:#f85149;">❌ Copy failed</span>\n`, outputEl));
        };

        // Commands dropdown toggle
        document.getElementById('term-commands-btn').onclick = (e) => {
            e.stopPropagation();
            const isVisible = commandsDropdown.style.display === 'block';
            commandsDropdown.style.display = isVisible ? 'none' : 'block';
        };

        // Commands dropdown interactions
        commandsDropdown.addEventListener('click', (e) => {
            const copyBtn = e.target.closest('.cmd-copy-btn');
            const runBtn = e.target.closest('.cmd-run-btn');
            const item = e.target.closest('[data-cmd-index]');
            
            if (copyBtn || runBtn) {
                e.stopPropagation();
                const idx = parseInt((copyBtn || runBtn).dataset.cmdIndex);
                const cmdObj = PREDEFINED_COMMANDS[idx];
                
                if (copyBtn) {
                    navigator.clipboard.writeText(cmdObj.cmd).then(() => {
                        appendOutput(`<span style="color:#3fb950;">📋 Copied: ${escapeHtml(cmdObj.label)}</span>\n`, outputEl);
                        if (cmdObj.copyOnly) {
                            input.value = cmdObj.cmd;
                            input.focus();
                        }
                    });
                }
                if (runBtn && !cmdObj.copyOnly) {
                    if (cmdObj.confirm && !confirm(`⚠️ Execute: ${cmdObj.cmd}?`)) return;
                    input.value = cmdObj.cmd;
                    executeCommand(cmdObj.cmd, outputEl);
                }
                commandsDropdown.style.display = 'none';
            } else if (item && !e.target.closest('button')) {
                // Click on item row -> copy to input for editing
                const idx = parseInt(item.dataset.cmdIndex);
                input.value = PREDEFINED_COMMANDS[idx].cmd;
                input.focus();
                commandsDropdown.style.display = 'none';
            }
        });

        // Termux detection & launch
        detectTermux().then(hasTermux => {
            if (hasTermux) {
                document.getElementById('termux-badge').style.display = 'inline-block';
                document.getElementById('termux-bar').style.display = 'block';            }
        });

        document.getElementById('open-termux-btn').onclick = () => {
            execFn('am start -n com.termux/.app.TermuxActivity 2>/dev/null || am start -a android.intent.action.VIEW -d termux:// 2>/dev/null');
            if (window.showStatus) window.showStatus('🚀 Opening Termux...', '#238636');
        };

        // Focus input
        setTimeout(() => input.focus(), 100);
    }

    async function executeCommand(cmd, outputEl) {
        appendOutput(`<span style="color:#58a6ff;">root@mtk-ai-engine:~#</span> ${escapeHtml(cmd)}\n`, outputEl);
        
        try {
            const result = await execFn(cmd, 15000);
            if (result !== undefined && result !== '') {
                appendOutput(`${escapeHtml(result)}\n`, outputEl);
            } else {
                appendOutput(`<span style="color:#8b949e;">(command completed with no output)\n</span>`, outputEl);
            }
        } catch (e) {
            appendOutput(`<span style="color:#f85149;">Error: ${escapeHtml(e.message || 'Execution failed')}\n</span>`, outputEl);
        }
        
        scrollToBottom(outputEl);
    }

    function appendOutput(html, outputEl) {
        outputEl.innerHTML += html;
        if (config.autoScroll) scrollToBottom(outputEl);
    }
    function scrollToBottom(outputEl) {
        outputEl.scrollTop = outputEl.scrollHeight;
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Initialize
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
