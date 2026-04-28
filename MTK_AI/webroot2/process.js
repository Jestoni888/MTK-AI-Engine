// process.js - Process Manager (Monitor, Search, Kill - Advanced)
(function() {
    'use strict';

    let allProcesses = [];
    let currentSort = 'cpu';
    let currentFilter = 'all';
    let refreshTimer = null;
    let isRefreshing = false;

    const execFn = window.exec || async function(cmd, timeout = 5000) {
        return new Promise(resolve => {
            const cb = `proc_exec_${Date.now()}_${Math.random().toString(36).substring(2)}`;
            const t = setTimeout(() => { delete window[cb]; resolve(''); }, timeout);
            window[cb] = (_, res) => { clearTimeout(t); delete window[cb]; resolve(res || ''); };
            if (window.ksu) ksu.exec(cmd, `window.${cb}`);
            else { clearTimeout(t); resolve(''); }
        });
    };

    async function init() {
        bindClickHandler();
        await loadProcesses();
    }

    function bindClickHandler() {
        const btn = document.getElementById('process-btn');
        if (!btn) return;
        btn.addEventListener('click', () => showProcessModal());
    }

    async function loadProcesses() {
        if (isRefreshing) return; // Prevent overlapping refreshes
        isRefreshing = true;
        
        try {
            const raw = await execFn('ps -eo pid,ppid,user,%cpu,%mem,rss,vsz,args --sort=-%cpu 2>/dev/null');
            allProcesses = parsePsOutput(raw);
            updateCardDisplay();
            renderProcessList(); // Auto-update list if modal is open
        } catch (e) {
            console.error('Failed to load processes:', e);
        } finally {
            isRefreshing = false;
        }
    }

    function parsePsOutput(raw) {
        const lines = raw.trim().split('\n').filter(l => l.trim());
        const processes = [];        
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            const match = line.match(/^(\d+)\s+(\d+)\s+(\S+)\s+([\d.]+)\s+([\d.]+)\s+(\d+)\s+(\d+)\s+(.+)$/);
            
            if (match) {
                const [, pid, ppid, user, cpu, mem, rss, vsz, cmd] = match;
                const cmdParts = cmd.split('/').pop().split(' ');
                const appName = cmdParts[0] || 'unknown';
                
                const isSystem = user === 'root' || user === 'system' || cmd.startsWith('/system') || cmd.includes('system_server');
                const packageName = extractPackageName(cmd);
                
                processes.push({
                    pid: parseInt(pid),
                    ppid: parseInt(ppid),
                    user: user,
                    cpu: parseFloat(cpu),
                    mem: parseFloat(mem),
                    rss: parseInt(rss) * 1024,
                    vsz: parseInt(vsz) * 1024,
                    cmd: cmd.trim(),
                    appName: appName,
                    packageName: packageName,
                    isSystem: isSystem
                });
            }
        }
        
        return processes;
    }

    function extractPackageName(cmd) {
        const match = cmd.match(/([a-z][a-z0-9_]*(\.[a-z0-9_]+)+)/i);
        return match ? match[0] : '';
    }

    function formatBytes(bytes) {
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
        if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(0)}MB`;
        return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)}GB`;
    }

    function updateCardDisplay() {
        const el = document.getElementById('process-count');
        if (!el) return;
        const total = allProcesses.length;
        const apps = allProcesses.filter(p => !p.isSystem).length;
        el.textContent = `${total} total • ${apps} apps`;
        el.style.fontSize = '11px';        el.style.color = '#8b92b4';
    }

    function showProcessModal() {
        const existing = document.getElementById('process-modal');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = 'process-modal';
        modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:10000;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(5px);';

        const box = document.createElement('div');
        box.style.cssText = 'background:linear-gradient(135deg,#1a1f3a,#2d3561);border:2px solid #f97316;border-radius:20px;padding:24px;width:95%;max-width:520px;';

        box.innerHTML = `
            <h3 style="color:#f97316;margin:0 0 5px;font-size:20px;text-align:center;">⚙️ Process Manager</h3>
            <p style="color:#8b92b4;font-size:12px;text-align:center;margin-bottom:15px;">Monitor & kill running processes</p>

            <div style="display:flex;gap:8px;margin-bottom:12px;">
                <input type="text" id="process-search" placeholder="🔍 Search process name..." 
                    style="flex:1;padding:10px;background:rgba(0,0,0,0.3);border:1px solid #4b5563;border-radius:10px;color:#fff;font-size:12px;outline:none;">
                <select id="process-filter" style="padding:10px;background:rgba(0,0,0,0.3);border:1px solid #4b5563;border-radius:10px;color:#fff;font-size:12px;cursor:pointer;">
                    <option value="all">All</option>
                    <option value="apps">Apps Only</option>
                    <option value="system">System Only</option>
                </select>
                <select id="process-sort" style="padding:10px;background:rgba(0,0,0,0.3);border:1px solid #4b5563;border-radius:10px;color:#fff;font-size:12px;cursor:pointer;">
                    <option value="cpu">By CPU</option>
                    <option value="memory">By Memory</option>
                    <option value="name">By Name</option>
                </select>
            </div>

            <div style="background:rgba(239,68,68,0.1);border:1px solid #ef4444;border-radius:8px;padding:8px;margin-bottom:12px;">
                <div style="color:#fca5a5;font-size:10px;text-align:center;">
                    ⚠️ <strong>WARNING:</strong> Killing system processes may cause instability or bootloop. Use with caution!
                </div>
            </div>

            <div id="process-list" style="max-height:400px;overflow-y:auto;margin-bottom:15px;">
                <div style="text-align:center;color:#666;padding:20px;">Loading processes...</div>
            </div>

            <div style="display:flex;gap:10px;">
                <button id="process-refresh-btn" style="flex:1;padding:10px;background:rgba(255,255,255,0.1);color:#fff;border:none;border-radius:10px;font-size:12px;cursor:pointer;">
                    🔄 Refresh
                </button>
                <button id="process-cancel-btn" style="flex:1;padding:10px;background:rgba(255,255,255,0.1);color:#fff;border:none;border-radius:10px;font-size:12px;cursor:pointer;">
                    Close
                </button>            </div>
        `;

        modal.appendChild(box);
        document.body.appendChild(modal);
        modal.onclick = e => { if (e.target === modal) modal.remove(); };
        document.getElementById('process-cancel-btn').onclick = () => {
            clearInterval(refreshTimer);
            modal.remove();
        };

        // 🔥 Auto-refresh every 1 second
        refreshTimer = setInterval(() => loadProcesses(), 1000);

        renderProcessList();
        bindModalEvents(modal);
    }

    function renderProcessList() {
        const container = document.getElementById('process-list');
        if (!container) return;

        const searchTerm = document.getElementById('process-search')?.value.toLowerCase() || '';
        const filterType = document.getElementById('process-filter')?.value || 'all';
        const sortBy = document.getElementById('process-sort')?.value || 'cpu';

        let filtered = allProcesses.filter(p => {
            if (filterType === 'apps' && p.isSystem) return false;
            if (filterType === 'system' && !p.isSystem) return false;
            if (searchTerm) {
                const searchStr = `${p.appName} ${p.packageName} ${p.cmd}`.toLowerCase();
                return searchStr.includes(searchTerm);
            }
            return true;
        });

        filtered.sort((a, b) => {
            switch (sortBy) {
                case 'cpu': return b.cpu - a.cpu;
                case 'memory': return b.rss - a.rss;
                case 'name': return a.appName.localeCompare(b.appName);
                default: return b.cpu - a.cpu;
            }
        });

        if (filtered.length === 0) {
            container.innerHTML = `
                <div style="text-align:center;color:#666;padding:20px;">
                    ${searchTerm ? '🔍 No processes match your search' : 'No processes found'}
                </div>            `;
            return;
        }

        container.innerHTML = filtered.map(p => `
            <div class="process-item" data-pid="${p.pid}" style="background:rgba(0,0,0,0.2);border-radius:10px;padding:12px;margin-bottom:8px;display:flex;align-items:center;gap:12px;cursor:pointer;transition:all 0.2s;" onmouseover="this.style.background='rgba(249,115,22,0.1)'" onmouseout="this.style.background='rgba(0,0,0,0.2)'">
                <div style="flex:1;min-width:0;">
                    <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
                        <span style="color:#fff;font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;">${p.appName}</span>
                        ${p.isSystem ? '<span style="font-size:9px;background:rgba(239,68,68,0.2);color:#ef4444;padding:2px 6px;border-radius:4px;">SYS</span>' : '<span style="font-size:9px;background:rgba(59,130,246,0.2);color:#3b82f6;padding:2px 6px;border-radius:4px;">APP</span>'}
                    </div>
                    <div style="color:#666;font-size:10px;overflow:hidden;text-overflow:ellipsis;">${p.packageName || p.cmd.split(' ')[0]}</div>
                </div>
                <div style="text-align:right;min-width:100px;">
                    <div style="color:#f97316;font-size:12px;font-weight:600;">${p.cpu.toFixed(1)}%</div>
                    <div style="color:#8b92b4;font-size:10px;">${formatBytes(p.rss)}</div>
                </div>
            </div>
        `).join('');

        container.querySelectorAll('.process-item').forEach(item => {
            item.addEventListener('click', () => {
                const pid = parseInt(item.dataset.pid);
                showProcessDetails(pid);
            });
        });
    }

    function bindModalEvents(modal) {
        const searchInput = document.getElementById('process-search');
        const filterSelect = document.getElementById('process-filter');
        const sortSelect = document.getElementById('process-sort');
        const refreshBtn = document.getElementById('process-refresh-btn');

        searchInput.addEventListener('input', () => renderProcessList());
        filterSelect.addEventListener('change', () => renderProcessList());
        sortSelect.addEventListener('change', () => renderProcessList());
        
        refreshBtn.onclick = async () => {
            refreshBtn.innerHTML = '🔄 Loading...';
            await loadProcesses();
            renderProcessList();
            refreshBtn.innerHTML = '🔄 Refresh';
        };
    }

    async function showProcessDetails(pid) {
        const process = allProcesses.find(p => p.pid === pid);
        if (!process) return;
        const detailModal = document.createElement('div');
        detailModal.id = 'process-detail-modal';
        detailModal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.9);z-index:10001;display:flex;align-items:center;justify-content:center;';

        let additionalInfo = '';
        try {
            const procInfo = await execFn(`cat /proc/${pid}/status 2>/dev/null | grep -E "^(Name|State|VmRSS|VmSize|Threads|Uid|Gid):"`);
            const cmdline = await execFn(`cat /proc/${pid}/cmdline 2>/dev/null | tr '\\0' ' '`);
            const oomScore = await execFn(`cat /proc/${pid}/oom_score 2>/dev/null`);
            const oomScoreAdj = await execFn(`cat /proc/${pid}/oom_score_adj 2>/dev/null`);
            const cgroup = await execFn(`cat /proc/${pid}/cgroup 2>/dev/null | head -5`);
            
            additionalInfo = `
                <div style="background:rgba(0,0,0,0.3);border-radius:8px;padding:12px;margin-bottom:15px;">
                    <div style="color:#8b92b4;font-size:11px;margin-bottom:8px;">📊 Extended Info</div>
                    <div style="color:#fff;font-size:11px;line-height:1.6;">
                        ${procInfo ? procInfo.split('\n').filter(l => l.trim()).map(l => `<div>${l}</div>`).join('') : ''}
                        <div style="margin-top:8px;"><strong>CMD:</strong> ${cmdline || 'N/A'}</div>
                        <div><strong>OOM Score:</strong> ${oomScore || 'N/A'}</div>
                        <div><strong>OOM Adj:</strong> ${oomScoreAdj || 'N/A'}</div>
                        ${cgroup ? `<div style="margin-top:8px;"><strong>CGroup:</strong><br><span style="color:#666;font-size:10px;">${cgroup.replace(/\n/g, '<br>')}</span></div>` : ''}
                    </div>
                </div>
            `;
        } catch (e) {
            additionalInfo = '<div style="color:#666;font-size:11px;">Additional details unavailable</div>';
        }

        const killButtonHtml = `
            <button id="kill-btn" style="flex:1;padding:12px;background:linear-gradient(135deg,#ef4444,#dc2626);color:#fff;border:none;border-radius:10px;font-size:13px;font-weight:600;cursor:pointer;">
                ☠️ KILL Process
            </button>
        `;

        detailModal.innerHTML = `
            <div style="background:linear-gradient(135deg,#1a1f3a,#2d3561);border:2px solid #f97316;border-radius:20px;padding:24px;width:95%;max-width:500px;">
                <h3 style="color:#f97316;margin:0 0 15px;font-size:18px;text-align:center;">📱 Process Details</h3>
                
                <div style="background:rgba(0,0,0,0.3);border-radius:12px;padding:15px;margin-bottom:15px;">
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;font-size:12px;">
                        <div><span style="color:#8b92b4;">PID:</span> <span style="color:#fff;font-weight:600;">${process.pid}</span></div>
                        <div><span style="color:#8b92b4;">PPID:</span> <span style="color:#fff;">${process.ppid}</span></div>
                        <div><span style="color:#8b92b4;">User:</span> <span style="color:#fff;">${process.user}</span></div>
                        <div><span style="color:#8b92b4;">State:</span> <span style="color:#fff;">Running</span></div>
                        <div><span style="color:#8b92b4;">CPU:</span> <span style="color:#f97316;font-weight:600;">${process.cpu.toFixed(1)}%</span></div>
                        <div><span style="color:#8b92b4;">Memory:</span> <span style="color:#3b82f6;font-weight:600;">${formatBytes(process.rss)}</span></div>
                        <div style="grid-column:1/-1;"><span style="color:#8b92b4;">Command:</span> <span style="color:#fff;font-size:10px;word-break:break-all;">${process.cmd}</span></div>
                    </div>
                </div>
                ${additionalInfo}

                <div style="display:flex;gap:10px;">
                    ${killButtonHtml}
                    <button id="detail-close-btn" style="flex:1;padding:12px;background:rgba(255,255,255,0.1);color:#fff;border:none;border-radius:10px;font-size:13px;cursor:pointer;">
                        Close
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(detailModal);
        detailModal.onclick = e => { if (e.target === detailModal) detailModal.remove(); };
        document.getElementById('detail-close-btn').onclick = () => detailModal.remove();

        document.getElementById('kill-btn').onclick = () => killProcess(pid, detailModal);
    }

    async function killProcess(pid, detailModal) {
        const process = allProcesses.find(p => p.pid === pid);
        const processType = process?.isSystem ? 'SYSTEM' : 'APP';
        
        if (!confirm(`⚠️ WARNING: You are about to kill a ${processType} process!\n\nPID: ${pid}\nName: ${process?.appName}\n\nThis may cause system instability. Continue?`)) return;

        try {
            detailModal.querySelector('#kill-btn').innerHTML = '💀 Killing...';
            detailModal.querySelector('#kill-btn').disabled = true;

            // Try SIGTERM first (graceful)
            await execFn(`su -c "kill -15 ${pid}"`);
            
            await new Promise(r => setTimeout(r, 500));
            
            // Check if still alive
            const stillAlive = await execFn(`ps -p ${pid} -o pid= 2>/dev/null`);
            
            if (stillAlive.trim()) {
                // Force kill with SIGKILL
                await execFn(`su -c "kill -9 ${pid}"`);
            }

            await new Promise(r => setTimeout(r, 300));
            const verify = await execFn(`ps -p ${pid} -o pid= 2>/dev/null`);
            
            if (!verify.trim()) {
                alert(`✅ Process ${pid} killed successfully!`);
            } else {
                alert(`⚠️ Process ${pid} may still be running (protected)`);
            }
            detailModal.remove();
            await loadProcesses();
            renderProcessList();
        } catch (e) {
            alert(`❌ Failed to kill process: ${e.message}`);
            detailModal.querySelector('#kill-btn').innerHTML = '☠️ KILL Process';
            detailModal.querySelector('#kill-btn').disabled = false;
        }
    }

    window.ProcessManager = { init, showProcessModal };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();