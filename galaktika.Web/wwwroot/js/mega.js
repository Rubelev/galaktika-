// Мегапроекты: орбитальная станция, терраформирование и кольцо Дайсона.
(function () {
    'use strict';

    function token() { try { return localStorage.getItem('galaktika_token') || ''; } catch (e) { return ''; } }
    function money(v) { return Math.round(v || 0).toLocaleString('ru-RU'); }
    function toast(t) { if (typeof window.notify === 'function') window.notify(t); }
    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    function api(path, body) {
        var opt = { headers: { 'X-Auth-Token': token() } };
        if (body) {
            opt.method = 'POST';
            opt.headers['Content-Type'] = 'application/json';
            opt.body = JSON.stringify(body);
        }
        return fetch(path, opt).then(function (r) { return r.json().catch(function () { return {}; }); })
            .catch(function () { return null; });
    }

    function modal() {
        var el = document.getElementById('mega-modal');
        if (el) return el;
        el = document.createElement('div');
        el.id = 'mega-modal';
        el.style.cssText = 'position:fixed;inset:0;display:none;align-items:center;justify-content:center;' +
            'background:rgba(3,8,20,.72);z-index:12000;padding:16px;';
        el.innerHTML = '<div style="width:min(760px,96vw);max-height:86vh;overflow:auto;background:#0b1526;' +
            'border:1px solid #1e3350;border-radius:12px;padding:18px 20px;color:#dbe6f5;">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">' +
            '<h2 style="margin:0;font-size:20px;">🏛 Мегапроекты</h2>' +
            '<button onclick="window.Mega.close()" style="background:none;border:none;color:#8ab4f8;font-size:22px;cursor:pointer;">&times;</button></div>' +
            '<div style="opacity:.65;font-size:12px;margin-bottom:12px;">Проекты для тех, кому уже тесно в своей системе. ' +
            'Венец — кольцо Дайсона вокруг звезды.</div>' +
            '<div id="mega-body">Загрузка…</div></div>';
        el.addEventListener('click', function (e) { if (e.target === el) window.Mega.close(); });
        document.body.appendChild(el);
        return el;
    }

    function render(d) {
        var box = document.getElementById('mega-body');
        if (!box) return;
        if (!d) { box.textContent = 'Сервер недоступен'; return; }
        if (d.error) { box.textContent = d.error; return; }
        var list = d.projects || [];
        box.innerHTML = list.map(function (p) {
            var canCredits = (d.credits || 0) >= p.credits;
            return '<div style="border:1px solid #16263d;border-radius:12px;padding:12px;margin-bottom:10px;' +
                (p.done ? 'opacity:.6;' : '') + '">' +
                '<div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;">' +
                '<b>' + (p.done ? '✅ ' : '') + esc(p.title) + '</b>' +
                '<span style="color:' + (p.done ? '#2ecc71' : '#f1c40f') + ';">+' + money(p.income) + ' кр/день · +' + p.energy + ' энергии</span></div>' +
                '<div style="opacity:.7;font-size:12px;margin:6px 0;">' +
                money(p.credits) + ' кр · ' + money(p.steel) + ' т стали · ' + money(p.chips) + ' чипов</div>' +
                (p.done
                    ? '<div style="opacity:.6;font-size:12px;">Построено</div>'
                    : '<button class="mega-btn" data-id="' + esc(p.id) + '"' + (canCredits ? '' : ' disabled') +
                      ' style="padding:7px 14px;border-radius:8px;border:none;background:#a78bfa;color:#12061f;' +
                      'font-weight:bold;cursor:pointer;">Построить</button>') +
                '</div>';
        }).join('') +
            '<div style="margin-top:8px;opacity:.7;">У вас: ' + money(d.credits) + ' кр · ' +
            money(d.steel) + ' т стали · ' + money(d.chips) + ' чипов</div>';

        Array.prototype.forEach.call(box.querySelectorAll('button.mega-btn'), function (btn) {
            btn.onclick = function () {
                btn.disabled = true;
                api('/api/mega/build', { id: btn.getAttribute('data-id') }).then(function (res) {
                    if (!res) { toast('Сервер недоступен'); btn.disabled = false; return; }
                    if (res.error) { toast(res.error); btn.disabled = false; return; }
                    toast(res.title + ' построен: +' + money(res.income) + ' кр/день');
                    if (typeof window.pullServerProfile === 'function') window.pullServerProfile();
                    load();
                });
            };
        });
    }

    function load() {
        if (!token()) { render(null); return; }
        api('/api/mega/list').then(render);
    }

    window.Mega = {
        open: function () { modal().style.display = 'flex'; load(); },
        close: function () {
            var m = document.getElementById('mega-modal');
            if (m) m.style.display = 'none';
        }
    };

    function addMenuButton() {
        var items = document.getElementById('left-menu-items');
        if (!items || document.getElementById('mega-menu-btn')) return;
        var b = document.createElement('button');
        b.id = 'mega-menu-btn';
        b.className = 'menu-btn';
        b.textContent = '🏛 Мегапроекты';
        b.onclick = function () { window.Mega.open(); };
        items.appendChild(b);
    }

    function boot() {
        addMenuButton();
        var tries = 0;
        var t = setInterval(function () {
            tries++;
            addMenuButton();
            if (document.getElementById('mega-menu-btn') || tries > 20) clearInterval(t);
        }, 1000);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
})();
