/**
 * profile.js - Developer Profile & Donation Modal
 * ✅ Pure exec + am start. NO fallbacks. NO clipboard.
 */
(function() {
    'use strict';

    const PROFILE = {
        name: "Jestoni Ceniza Cenabre",
        message: "If you like my work, you can give me a small donation for this project.",
        note: "Contact me via any of the links above ",
        links: [
            // 🆕 Main Module Website for Updates
            { label: "🔧 MTK-AI-Engine", url: "https://github.com/Jestoni888/MTK-AI-Engine", icon: "fab fa-github" },
            { label: "Telegram", url: "https://t.me/mikamisaturo", icon: "fab fa-telegram" },
            { label: "Facebook", url: "https://www.facebook.com/jestonicenabre888", icon: "fab fa-facebook" },
            { label: "YouTube", url: "https://youtube.com/@jestonicenabre", icon: "fab fa-youtube" }
        ]
    };

    // ✅ EXACT exec pattern from your terminalemulator.js
    const execCmd = window.exec || async function(cmd, timeout = 15000) {
        return new Promise(resolve => {
            const cb = `prof_${Date.now()}_${Math.random().toString(36).substring(2)}`;
            const t = setTimeout(() => { delete window[cb]; resolve(''); }, timeout);
            window[cb] = (_, res) => { clearTimeout(t); delete window[cb]; resolve(res || ''); };
            if (window.ksu) ksu.exec(cmd, `window.${cb}`);
            else { clearTimeout(t); resolve(''); }
        });
    };

    /**
     * 🚀 Direct shell launch ONLY
     * Note: Android uses `am start` (Activity Manager), not `pm start` (Package Manager)
     */
    async function openExternal(url) {
        const fullUrl = url.startsWith('http') ? url : 'https://' + url;
        
        // Intent first → explicit Chrome fallback (same pattern as your terminal code)
        const cmd = `am start -a android.intent.action.VIEW -d "${fullUrl}" 2>/dev/null || am start -n com.android.chrome/com.google.android.apps.chrome.Main -d "${fullUrl}" 2>/dev/null`;
        
        console.log('[Profile] Executing:', cmd);
        await execCmd(cmd);
    }

    function init() {
        const btn = document.getElementById('ai-control-btn');
        if (!btn) return;
        createModal();
        btn.addEventListener('click', (e) => { e.preventDefault(); openModal(); });    }
    function createModal() {
        const overlay = document.createElement('div');
        overlay.id = 'profile-modal-overlay';
        overlay.style.cssText = 'display:none;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.75);z-index:9999;justify-content:center;align-items:center;font-family:system-ui,sans-serif;';
        overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });

        const modal = document.createElement('div');
        modal.style.cssText = 'background:linear-gradient(135deg,#1a1a2e,#16213e);border-radius:16px;padding:24px;max-width:400px;width:90%;color:#fff;position:relative;box-shadow:0 10px 40px rgba(0,0,0,0.5);border:1px solid rgba(255,255,255,0.1);';

        modal.innerHTML += `
            <div style="text-align:center;padding-bottom:16px;border-bottom:1px solid rgba(255,255,255,0.1);margin-bottom:16px">
                <i class="fas fa-robot" style="font-size:32px;color:#00d9ff;margin-bottom:8px;display:block"></i>
                <h3 style="margin:0;font-size:18px;font-weight:600">${PROFILE.name}</h3>
            </div>
            <p style="color:#ccc;text-align:center;margin:0 0 20px 0;line-height:1.5;font-size:14px">${PROFILE.message}</p>
        `;

        const linksContainer = document.createElement('div');
        linksContainer.style.cssText = 'display:flex;flex-direction:column;gap:12px;margin-bottom:20px;';

        PROFILE.links.forEach(link => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.style.cssText = 'display:flex;align-items:center;gap:12px;padding:12px 16px;background:rgba(255,255,255,0.08);border-radius:10px;border:1px solid rgba(255,255,255,0.1);color:#fff;cursor:pointer;width:100%;font-size:14px;transition:all 0.2s;text-align:left;';
            btn.addEventListener('mouseenter', () => { btn.style.background = 'rgba(255,255,255,0.15)'; });
            btn.addEventListener('mouseleave', () => { btn.style.background = 'rgba(255,255,255,0.08)'; });
            btn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); openExternal(link.url); });
            btn.innerHTML = `<i class="${link.icon}" style="font-size:20px;width:24px;text-align:center"></i><span style="font-weight:500;flex:1">${link.label}</span><i class="fas fa-external-link-alt" style="font-size:12px;opacity:0.6"></i>`;
            linksContainer.appendChild(btn);
        });
        modal.appendChild(linksContainer);

        const note = document.createElement('p');
        note.style.cssText = 'color:#888;text-align:center;margin:0;font-size:12px;font-style:italic;';
        note.textContent = PROFILE.note;
        modal.appendChild(note);

        overlay.appendChild(modal);
        document.body.appendChild(overlay);
    }

    function openModal() { const o = document.getElementById('profile-modal-overlay'); if (o) { o.style.display = 'flex'; document.body.style.overflow = 'hidden'; } }
    function closeModal() { const o = document.getElementById('profile-modal-overlay'); if (o) { o.style.display = 'none'; document.body.style.overflow = ''; } }    window.ProfileModal = { open: openModal, close: closeModal, toggle: () => { const o = document.getElementById('profile-modal-overlay'); if (o?.style.display === 'flex') closeModal(); else openModal(); } };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();