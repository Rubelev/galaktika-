// Досуг колонии: деликатесы и театр — то, что поднимает счастье.
// ?amenities=1 — превью панели.
(function () {
    'use strict';
    if (/[?&]safe=1/.test(location.search)) return;

    var PRICE_FEAST = 8000;
    var PRICE_THEATRE = 45000;

    function el(tag, cls, text) {
        var d = document.createElement(tag);
        if (cls) d.className = cls;
        if (text !== undefined) d.textContent = text;
        return d;
    }

    function token() {
        try { return localStorage.getItem('galaktika_token') || ''; } catch (e) { return ''; }
    }

    function api(path, body, method) {
        return fetch(path, {
            method: method || 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Auth-Token': token() },
            body: body ? JSON.stringify(body) : undefined
        }).then(function (r) { return r.json().catch(function () { return {}; }); });
    }

    function toast(t) { if (typeof window.notify === 'function') window.notify(t); }

    function profile() {
        return api('/api/auth/me', null, 'GET').then(function (res) {
            try { return JSON.parse(res.profile || '{}'); } catch (e) { return {}; }
        });
    }

    function open() {
        var old = document.getElementById('am-wrap');
        if (old) old.remove();
        var wrap = el('div');
        wrap.id = 'am-wrap';
        wrap.style.cssText = 'position:fixed;inset:0;z-index:13000;background:rgba(4,8,12,.78);' +
            'display:flex;align-items:center;justify-content:center;padding:14px';

        var card = el('div');
        card.style.cssText = 'width:min(560px,96vw);max-height:90vh;overflow:auto;background:#0b1526;' +
            'border:2px solid #1e3a5f;border-radius:16px;padding:18px;color:#dce8f7;' +
            'font:14px/1.5 Inter,system-ui,sans-serif;box-shadow:0 24px 60px rgba(0,0,0,.6)';
        card.innerHTML =
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">' +
            '<b style="color:#8fd6ff;font-size:17px">🎭 Досуг колонии</b>' +
            '<button id="am-close" style="padding:4px 10px;border:none;border-radius:8px;background:#2b3238;' +
            'color:#e6eaed;cursor:pointer">✕</button></div>' +
            '<div id="am-info" style="color:#9fb2c6;margin-bottom:12px">Загрузка…</div>' +
            '<div style="display:grid;gap:10px">' +
            '<div style="background:#0f1c2e;border:1px solid #1e3a5f;border-radius:12px;padding:12px">' +
            '<b style="color:#ffd05a">🍲 Деликатесы</b>' +
            '<div style="color:#9fb2c6;font-size:12.5px;margin:4px 0 8px">Праздничный стол из своих запасов: ' +
            '<b style="color:#3ec97a">+6 счастья</b> сразу. Нужен запас зерна на 5 суток, раз в 12 часов.</div>' +
            '<button id="am-feast" style="padding:9px 14px;border:none;border-radius:9px;cursor:pointer;' +
            'background:linear-gradient(#ffe07a,#d8a41c);color:#2a1f00;font-weight:800">Заказать · 8 000 кр</button>' +
            '</div>' +
            '<div style="background:#0f1c2e;border:1px solid #1e3a5f;border-radius:12px;padding:12px">' +
            '<b style="color:#ffd05a">🎭 Театр</b>' +
            '<div style="color:#9fb2c6;font-size:12.5px;margin:4px 0 8px">Постоянная сцена: ' +
            '<b style="color:#3ec97a">+2 счастья</b> сразу и <b style="color:#3ec97a">+1,5 в сутки</b>, ' +
            'требует 10 % воды на содержание.</div>' +
            '<button id="am-theatre" style="padding:9px 14px;border:none;border-radius:9px;cursor:pointer;' +
            'background:linear-gradient(#8fd6ff,#2f9fe0);color:#04223a;font-weight:800">Построить · 45 000 кр</button>' +
            '<button id="am-premiere" style="margin-left:8px;padding:9px 14px;border:none;border-radius:9px;' +
            'cursor:pointer;background:linear-gradient(#ffb3c8,#c4407a);color:#2a0014;font-weight:800">' +
            'Премьера · 5 000 кр</button>' +
            '</div></div>' +
            '<div style="background:#0f1c2e;border:1px solid #1e3a5f;border-radius:12px;padding:12px">' +
            '<b style="color:#ffd05a">🛡 Наёмный патруль</b>' +
            '<div style="color:#9fb2c6;font-size:12.5px;margin:4px 0 8px">Наёмники на один рейд: ' +
            '<b style="color:#3ec97a">+2 к обороне</b>. Дешевле, чем строить уровень обороны.</div>' +
            '<button id="am-patrol" style="padding:9px 14px;border:none;border-radius:9px;cursor:pointer;' +
            'background:linear-gradient(#ffb86b,#d97a1c);color:#2a1400;font-weight:800">Нанять · 20 000 кр</button>' +
            '</div>' +
            '<div style="background:#0f1c2e;border:1px solid #1e3a5f;border-radius:12px;padding:12px">' +
            '<b style="color:#ffd05a">🏘 Жилой модуль</b>' +
            '<div style="color:#9fb2c6;font-size:12.5px;margin:4px 0 8px">+' +
            '<b style="color:#3ec97a">50 000</b> к лимиту населения. До 20 модулей.</div>' +
            '<button id="am-habitat" style="padding:9px 14px;border:none;border-radius:9px;cursor:pointer;' +
            'background:linear-gradient(#9be8c0,#2fae74);color:#06231a;font-weight:800">Построить · 80 000 кр</button>' +
            '</div>' +
            '<div style="background:#0f1c2e;border:1px solid #1e3a5f;border-radius:12px;padding:12px">' +
            '<b style="color:#ffd05a">♻️ Рециклинг воды</b>' +
            '<div style="color:#9fb2c6;font-size:12.5px;margin:4px 0 8px">Замкнутый контур: ' +
            '<b style="color:#3ec97a">−40 % расхода воды</b> навсегда.</div>' +
            '<button id="am-recycle" style="padding:9px 14px;border:none;border-radius:9px;cursor:pointer;' +
            'background:linear-gradient(#8fd6ff,#2f9fe0);color:#04223a;font-weight:800">Построить · 120 000 кр</button>' +
            '</div>' +
            '<div style="background:#0f1c2e;border:1px solid #1e3a5f;border-radius:12px;padding:12px">' +
            '<b style="color:#ffd05a">🌱 Гидропоника</b>' +
            '<div style="color:#9fb2c6;font-size:12.5px;margin:4px 0 8px">Овощные ярусы: ' +
            '<b style="color:#3ec97a">−30 % расхода зерна</b> навсегда.</div>' +
            '<button id="am-hydro" style="padding:9px 14px;border:none;border-radius:9px;cursor:pointer;' +
            'background:linear-gradient(#9be8c0,#2fae74);color:#06231a;font-weight:800">Построить · 150 000 кр</button>' +
            '</div>' +
            '<div style="background:#241016;border:1px solid #5f1e2a;border-radius:12px;padding:12px">' +
            '<b style="color:#ff8f7a">🏴 Пиратский рынок</b>' +
            '<div id="am-pirate" style="color:#c9a6ac;font-size:12.5px;margin:6px 0 8px">Загрузка…</div>' +
            '</div>' +
            '<div id="am-msg" style="margin-top:10px;min-height:18px;color:#8fd6ff"></div>' +
            '<div style="margin-top:12px;color:#6f8296;font-size:11.5px">Счастье даёт рост населения и налоги. ' +
            'При нуле население стоит, при 70+ — растёт вдвое быстрее.</div>';
        wrap.appendChild(card);
        document.body.appendChild(wrap);

        function msg(t, color) {
            var m = document.getElementById('am-msg');
            if (m) { m.textContent = t; m.style.color = color || '#8fd6ff'; }
        }

        function refresh() {
            profile().then(function (p) {
                var c = p.colony || {};
                var r = p.resources || {};
                var pop = c.population || 0;
                var grainDays = pop > 0 ? (r.grain || 0) / (pop * 0.3) : 0;
                document.getElementById('am-info').innerHTML =
                    'Население <b style="color:#dce8f7">' + Math.round(pop).toLocaleString('ru-RU') + '</b> · ' +
                    'счастье <b style="color:' + (c.happiness >= 50 ? '#3ec97a' : (c.happiness >= 20 ? '#ffd05a' : '#ff6b5a')) + '">' +
                    (c.happiness || 0).toFixed(1) + '</b> · ' +
                    'кредиты <b style="color:#ffd05a">' + Math.round(p.credits || 0).toLocaleString('ru-RU') + '</b> · ' +
                    'зерно ' + grainDays.toFixed(1) + ' сут' +
                    (c.theatre ? ' · <b style="color:#3ec97a">театр построен</b>' : '');
            });
        }

        document.getElementById('am-close').onclick = function () { wrap.remove(); };
        card.addEventListener('click', function (e) { e.stopPropagation(); });

        document.getElementById('am-feast').onclick = function () {
            api('/api/colony/feast', {}).then(function (res) {
                if (res.error) { msg(res.error, '#ff6b5a'); return; }
                msg('Деликатесы поданы: счастье ' + (res.happiness || 0).toFixed(1), '#3ec97a');
                toast('🍲 Деликатесы: +6 счастья');
                function pirate() {
            var box = document.getElementById('am-pirate');
            if (!box) return;
            api('/api/pirate/list', null, 'GET').then(function (res) {
                var lots = res.lots || [];
                if (!lots.length) { box.innerHTML = 'Сейчас пусто. Появится после рейда на колонию.'; return; }
                box.innerHTML = lots.map(function (l) {
                    return '<div>' + (l.resource === 'grain' ? '🌾' : '💧') + ' ' + l.qty + ' ' +
                        (l.resource === 'grain' ? 'кг' : 'т') + ' по ' + l.price + ' кр — ' +
                        '<a href="#" data-lot="' + l.id + '" style="color:#ff8f7a">купить</a></div>';
                }).join('');
                Array.prototype.forEach.call(box.querySelectorAll('a[data-lot]'), function (a) {
                    a.onclick = function (e) {
                        e.preventDefault();
                        api('/api/pirate/buy', { id: a.getAttribute('data-lot') }).then(function (r2) {
                            if (r2.error) { msg(r2.error, '#ff6b5a'); return; }
                            msg('Куплено: ' + r2.qty + ' по ' + r2.sum + ' кр', '#3ec97a');
                            pirate(); refresh();
                        });
                    };
                });
            });
        }
        refresh();
        pirate();
            });
        };
        document.getElementById('am-recycle').onclick = function () {
            api('/api/colony/recycle', {}).then(function (res) {
                if (res.error) { msg(res.error, '#ff6b5a'); return; }
                msg('Рециклинг построен: расход воды −40 %', '#3ec97a');
                refresh();
            });
        };
        document.getElementById('am-hydro').onclick = function () {
            api('/api/colony/hydro', {}).then(function (res) {
                if (res.error) { msg(res.error, '#ff6b5a'); return; }
                msg('Гидропоника запущена: расход зерна −30 %', '#3ec97a');
                refresh();
            });
        };
        document.getElementById('am-premiere').onclick = function () {
            api('/api/colony/premiere', {}).then(function (res) {
                if (res.error) { msg(res.error, '#ff6b5a'); return; }
                msg('Премьера прошла: +3 счастья, налоги +1 % на сутки', '#3ec97a');
                refresh();
            });
        };
        document.getElementById('am-patrol').onclick = function () {
            api('/api/colony/patrol', {}).then(function (res) {
                if (res.error) { msg(res.error, '#ff6b5a'); return; }
                msg('Патруль нанят: +' + (res.patrol || 2) + ' к обороне на один рейд', '#3ec97a');
                toast('🛡 Патруль нанят');
                refresh();
            });
        };
        document.getElementById('am-habitat').onclick = function () {
            api('/api/colony/habitat', { levels: 1 }).then(function (res) {
                if (res.error) { msg(res.error, '#ff6b5a'); return; }
                msg('Жилой модуль построен: лимит ' + (res.limit || '') + ' жителей', '#3ec97a');
                toast('🏘 Жилой модуль');
                refresh();
            });
        };
        document.getElementById('am-theatre').onclick = function () {
            api('/api/colony/theatre', {}).then(function (res) {
                if (res.error) { msg(res.error, '#ff6b5a'); return; }
                msg('Театр построен: +1,5 счастья в сутки', '#3ec97a');
                toast('🎭 Театр построен');
                refresh();
            });
        };
        refresh();
    }

    function addMenuButton() {
        var box = document.getElementById('left-menu-items');
        if (!box || document.getElementById('amenities-btn')) return;
        var b = el('button', 'menu-btn', '🎭 Досуг колонии');
        b.id = 'amenities-btn';
        b.setAttribute('data-tip', 'Досуг|Деликатесы и театр для счастья населения');
        b.onclick = open;
        var anchor = document.getElementById('settings-btn');
        if (anchor && anchor.parentNode === box) box.insertBefore(b, anchor);
        else box.appendChild(b);
    }

    window.Amenities = { open: open };

    if (/[?&]amenities=1/.test(location.search)) {
        var st = document.createElement('style');
        st.textContent = '#welcome-screen,#auth-overlay,#legend-overlay,#tut-modal{display:none !important}';
        document.head.appendChild(st);
        setTimeout(open, 1500);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () { setTimeout(addMenuButton, 1800); });
    } else setTimeout(addMenuButton, 1800);
    setInterval(addMenuButton, 4000);
})();
