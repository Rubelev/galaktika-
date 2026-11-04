// Общий чат: сообщения хранятся на сервере (/api/chat/*), обновление раз в 4 секунды.
(function () {
    'use strict';

    var lastId = 0;
    var timer = null;

    function token() { try { return localStorage.getItem('galaktika_token') || ''; } catch (e) { return ''; } }
    function user() { return (window.getCurrentUser && window.getCurrentUser()) || null; }
    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }
    function time(ts) {
        var d = new Date((ts || 0) * 1000);
        return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    }

    function apiGet(path) {
        return fetch(path, { headers: { 'X-Auth-Token': token() } })
            .then(function (r) { return r.json().catch(function () { return {}; }); })
            .catch(function () { return null; });
    }
    function apiPost(path, body) {
        return fetch(path, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Auth-Token': token() },
            body: JSON.stringify(body || {})
        }).then(function (r) { return r.json().catch(function () { return {}; }); })
            .catch(function () { return null; });
    }

    function modal() {
        var el = document.getElementById('chat-modal');
        if (el) return el;
        el = document.createElement('div');
        el.id = 'chat-modal';
        el.style.cssText = 'position:fixed;inset:0;display:none;align-items:center;justify-content:center;' +
            'background:rgba(3,8,20,.72);z-index:12000;padding:16px;';
        el.innerHTML = '<div style="width:min(680px,96vw);height:min(620px,86vh);display:flex;flex-direction:column;' +
            'background:#0b1526;border:1px solid #1e3350;border-radius:12px;padding:16px 18px;color:#dbe6f5;">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">' +
            '<h2 style="margin:0;font-size:19px;">💬 Общий чат</h2>' +
            '<button onclick="window.Chat.close()" style="background:none;border:none;color:#8ab4f8;font-size:22px;cursor:pointer;">&times;</button></div>' +
            '<div id="chat-tips" style="display:none;border:1px solid #2b4a2f;background:#0e1f16;border-radius:8px;' +
        'padding:8px 10px;margin-bottom:8px;font-size:12px;color:#bfe8cd;"></div>' +
        '<div id="chat-log" style="flex:1;overflow:auto;border:1px solid #16263d;border-radius:8px;padding:8px;font-size:13px;"></div>' +
            '<div style="display:flex;gap:8px;margin-top:10px;">' +
            '<input id="chat-text" maxlength="300" placeholder="Сообщение…" style="flex:1;padding:9px;border-radius:8px;' +
            'background:#101f33;color:#dbe6f5;border:1px solid #1e3350;">' +
            '<button id="chat-send" style="padding:9px 16px;border-radius:8px;border:none;background:#2ecc71;color:#04121f;font-weight:bold;cursor:pointer;">▶</button>' +
            '</div><div id="chat-msg" style="margin-top:6px;font-size:12px;opacity:.75;"></div></div>';
        el.addEventListener('click', function (e) { if (e.target === el) window.Chat.close(); });
        document.body.appendChild(el);
        return el;
    }

    function render(messages) {
        var log = document.getElementById('chat-log');
        if (!log) return;
        if (!messages.length) { log.innerHTML = '<div style="opacity:.6;">Пока тихо. Напишите первым.</div>'; return; }
        var me = (user() && user().email || '').toLowerCase();
        log.innerHTML = messages.map(function (m) {
            var mine = String(m.email).toLowerCase() === me;
            return '<div style="margin-bottom:6px;">' +
                '<span style="opacity:.55;font-size:11px;">' + time(m.ts) + '</span> ' +
                '<b style="color:' + (mine ? '#2ecc71' : '#8ab4f8') + ';">' + esc(m.name || m.email) + '</b>: ' +
                esc(m.text) + '</div>';
        }).join('');
        log.scrollTop = log.scrollHeight;
    }

    function renderTips(data) {
    var box = document.getElementById('chat-tips');
    if (!box) return;
    var tips = (data && data.tips) || [];
    if (!tips.length) { box.style.display = 'none'; return; }
    box.style.display = 'block';
    box.innerHTML = '<div style="font-weight:700;color:#7ee2a8;margin-bottom:4px;">🤖 ' +
        esc(data.name || 'Советник') + '</div>' +
        tips.map(function (t) {
            return '<div style="margin:3px 0;">• ' + esc(t) + '</div>';
        }).join('');
}

function loadTips() {
    apiGet('/api/chat/tips').then(renderTips);
}

function load() {
        apiGet('/api/chat/list?since=0').then(function (r) {
            loadTips();
    var messages = (r && r.messages) || [];
            if (messages.length) lastId = messages[messages.length - 1].id;
            render(messages);
        });
    }

    function send() {
        var input = document.getElementById('chat-text');
        var msgBox = document.getElementById('chat-msg');
        var text = (input.value || '').trim();
        if (!text) return;
        if (!token()) { if (msgBox) msgBox.textContent = 'Войдите в игру, чтобы писать'; return; }
        apiPost('/api/chat/send', { text: text }).then(function (r) {
            if (r && r.error) { if (msgBox) msgBox.textContent = r.error; return; }
            input.value = '';
            if (msgBox) msgBox.textContent = '';
            load();
        });
    }

    window.Chat = {
        open: function () {
            modal().style.display = 'flex';
            load();
            if (timer) clearInterval(timer);
            timer = setInterval(load, 4000);
            var input = document.getElementById('chat-text');
            if (input) {
                input.onkeydown = function (e) { if (e.key === 'Enter') send(); };
                setTimeout(function () { input.focus(); }, 50);
            }
            var btn = document.getElementById('chat-send');
            if (btn) btn.onclick = send;
        },
        close: function () {
            var m = document.getElementById('chat-modal');
            if (m) m.style.display = 'none';
            if (timer) { clearInterval(timer); timer = null; }
        }
    };

    function addMenuButton() {
        var items = document.getElementById('left-menu-items');
        if (!items || document.getElementById('chat-menu-btn')) return;
        var b = document.createElement('button');
        b.id = 'chat-menu-btn';
        b.className = 'menu-btn';
        b.textContent = '💬 Общий чат';
        b.onclick = function () { window.Chat.open(); };
        items.appendChild(b);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', addMenuButton);
    else addMenuButton();
})();
