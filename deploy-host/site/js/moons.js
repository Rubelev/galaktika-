// Аванпосты на других лунах и газовый завод: доход и энергия.
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
        var el = document.getElementById('moons-modal');
        if (el) return el;
        el = document.createElement('div');
        el.id = 'moons-modal';
        el.style.cssText = 'position:fixed;inset:0;display:none;align-items:center;justify-content:center;' +
            'background:rgba(3,8,20,.72);z-index:12000;padding:16px;';
        el.innerHTML = '<div style="width:min(760px,96vw);max-height:86vh;overflow:auto;background:#0b1526;' +
            'border:1px solid #1e3350;border-radius:12px;padding:18px 20px;color:#dbe6f5;">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">' +
            '<h2 style="margin:0;font-size:20px;">🌕 Луны и газ</h2>' +
            '<button onclick="window.Moons.close()" style="background:none;border:none;color:#8ab4f8;font-size:22px;cursor:pointer;">&times;</button></div>' +
            '<div style="opacity:.65;font-size:12px;margin-bottom:12px;">Аванпост на луне даёт 2 500 кр и 2 энергии в день. ' +
            'Газовый завод на гиганте — 8 000 кр и 10 энергии за уровень.</div>' +
            '<div id="moons-body">Загрузка…</div></div>';
        el.addEventListener('click', function (e) { if (e.target === el) window.Moons.close(); });
        document.body.appendChild(el);
        return el;
    }

    function render(d) {
        var box = document.getElementById('moons-body');
        if (!box) return;
        if (!d) { box.textContent = 'Сервер недоступен'; return; }
        if (d.error) { box.textContent = d.error; return; }
        var moons = d.moons || {};
        var taken = {};
        (d.outposts || []).forEach(function (o) { taken[o.moon] = true; });
        var cost = 150000 + (d.outposts || []).length * 50000;

        var rows = Object.keys(moons).map(function (key) {
            var mine = taken[key];
            return '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:6px 0;' +
                'border-bottom:1px solid #16263d;">' +
                '<span>' + (mine ? '🏗 ' : '▫️ ') + esc(moons[key]) + '</span>' +
                (mine
                    ? '<span style="color:#2ecc71;">освоена</span>'
                    : '<button class="moon-btn" data-moon="' + esc(key) + '" style="padding:5px 10px;border-radius:6px;' +
                      'border:none;background:#2ecc71;color:#04121f;font-weight:bold;cursor:pointer;">Освоить · ' +
                      money(cost) + ' кр</button>') +
                '</div>';
        }).join('');

        var gas = d.gasPlant || null;
        var gasLevel = gas ? gas.level : 0;
        var gasCost = 400000 + gasLevel * 250000;

        box.innerHTML =
            '<div style="margin-bottom:8px;"><b>Аванпосты</b> · ' + (d.outposts || []).length + ' из 5</div>' + rows +
            '<div style="margin-top:14px;padding-top:12px;border-top:1px solid #16263d;">' +
            '<div><b>Газовый завод</b> · уровень ' + gasLevel + ' из 3</div>' +
            (gasLevel >= 3
                ? '<div style="opacity:.6;margin-top:6px;">Завод максимального уровня</div>'
                : '<button id="gas-btn" style="margin-top:6px;padding:6px 12px;border-radius:8px;border:none;' +
                  'background:#9b59b6;color:#fff;font-weight:bold;cursor:pointer;">' +
                  (gasLevel ? 'Улучшить' : 'Построить') + ' · ' + money(gasCost) + ' кр + ' + (300 + gasLevel * 150) + ' т стали</button>') +
            '</div>' +
            '<div style="margin-top:10px;opacity:.75;">Доход с аванпостов и газа: ' + money(d.income) + ' кр/день · энергия: ' +
            (d.energy || 0) + '</div>';

        Array.prototype.forEach.call(box.querySelectorAll('button.moon-btn'), function (btn) {
            btn.onclick = function () {
                btn.disabled = true;
                api('/api/outpost/found', { moon: btn.getAttribute('data-moon') }).then(function (res) {
                    if (!res) { toast('Сервер недоступен'); btn.disabled = false; return; }
                    if (res.error) { toast(res.error); btn.disabled = false; return; }
                    toast('Аванпост основан: ' + res.outposts + ' из 5');
                    load();
                });
            };
        });

        var gasBtn = document.getElementById('gas-btn');
        if (gasBtn) {
            gasBtn.onclick = function () {
                gasBtn.disabled = true;
                api('/api/gasplant/build', {}).then(function (res) {
                    if (!res) { toast('Сервер недоступен'); gasBtn.disabled = false; return; }
                    if (res.error) { toast(res.error); gasBtn.disabled = false; return; }
                    toast('Газовый завод: уровень ' + res.level);
                    load();
                });
            };
        }
    }

    function load() {
        if (!token()) { render(null); return; }
        api('/api/outposts').then(render);
    }

    window.Moons = {
        open: function () { modal().style.display = 'flex'; load(); },
        close: function () {
            var m = document.getElementById('moons-modal');
            if (m) m.style.display = 'none';
        }
    };

    function addMenuButton() {
        var items = document.getElementById('left-menu-items');
        if (!items || document.getElementById('moons-menu-btn')) return;
        var b = document.createElement('button');
        b.id = 'moons-menu-btn';
        b.className = 'menu-btn';
        b.textContent = '🌕 Луны и газ';
        b.onclick = function () { window.Moons.open(); };
        items.appendChild(b);
    }

    function boot() {
        addMenuButton();
        var tries = 0;
        var t = setInterval(function () {
            tries++;
            addMenuButton();
            if (document.getElementById('moons-menu-btn') || tries > 20) clearInterval(t);
        }, 1000);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
})();
