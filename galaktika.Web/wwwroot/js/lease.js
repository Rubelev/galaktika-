// Аренда: места в доке и ремонтные мастерские — ранний рост без колонии.
(function () {
    'use strict';

    function token() { try { return localStorage.getItem('galaktika_token') || ''; } catch (e) { return ''; } }
    function money(v) { return Math.round(v || 0).toLocaleString('ru-RU'); }
    function user() { return (window.getCurrentUser && window.getCurrentUser()) || {}; }
    function toast(t) { if (typeof window.notify === 'function') window.notify(t); }

    function post(what) {
        return fetch('/api/rent', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Auth-Token': token() },
            body: JSON.stringify({ what: what })
        }).then(function (r) { return r.json().catch(function () { return {}; }); })
            .catch(function () { return null; });
    }

    function modal() {
        var el = document.getElementById('lease-modal');
        if (el) return el;
        el = document.createElement('div');
        el.id = 'lease-modal';
        el.style.cssText = 'position:fixed;inset:0;display:none;align-items:center;justify-content:center;' +
            'background:rgba(3,8,20,.72);z-index:12000;padding:16px;';
        el.innerHTML = '<div style="width:min(620px,96vw);background:#0b1526;border:1px solid #1e3350;' +
            'border-radius:12px;padding:18px 20px;color:#dbe6f5;">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">' +
            '<h2 style="margin:0;font-size:20px;">🛠 Аренда</h2>' +
            '<button onclick="window.Lease.close()" style="background:none;border:none;color:#8ab4f8;font-size:22px;cursor:pointer;">&times;</button></div>' +
            '<div style="opacity:.65;font-size:12px;margin-bottom:12px;">Пока учитесь, проще арендовать: место в доке и мастерскую. ' +
            'Каждое следующее место дороже.</div>' +
            '<div id="lease-body"></div></div>';
        el.addEventListener('click', function (e) { if (e.target === el) window.Lease.close(); });
        document.body.appendChild(el);
        return el;
    }

    var HIRE_COUNT = 100;

    function hireBtn(source, title, price, cols) {
        var have = (cols && cols[source]) || 0;
        return '<button class="hire-btn" data-source="' + source + '" style="padding:7px 12px;border-radius:8px;' +
            'border:1px solid #2c4a6e;background:#101f33;color:#dbe6f5;cursor:pointer;text-align:left;">' +
            '<div><b>' + title + '</b></div>' +
            '<div style="font-size:12px;opacity:.75;">+' + HIRE_COUNT + ' чел · ' + money(100 * price) + ' кр</div>' +
            '<div style="font-size:11px;opacity:.5;">нанято: ' + have + '</div>' +
            '</button>';
    }

    function shipsBlock(u) {
        var ships = u.ships || [];
        if (!ships.length) return '';
        var rows = ships.map(function (ship, i) {
            var lvl = ship.level || 0;
            var price = 50000 * (lvl + 1);
            return '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:5px 0;">' +
                '<span>' + (ship.id || 'корабль') + ' · уровень ' + lvl + '</span>' +
                '<button class="upgrade-btn" data-index="' + i + '" style="padding:5px 10px;border-radius:6px;border:none;' +
                'background:#9b59b6;color:#fff;font-weight:bold;cursor:pointer;">Улучшить · ' + money(price) + ' кр</button>' +
                '</div>';
        }).join('');
        return '<div style="margin-top:14px;padding-top:12px;border-top:1px solid #16263d;">' +
            '<div style="margin-bottom:6px;"><b>Модернизация флота</b> ' +
            '<span style="opacity:.6;font-size:12px;">(уровень ≤ число мастерских)</span></div>' + rows + '</div>';
    }

    function render() {
        var box = document.getElementById('lease-body');
        if (!box) return;
        var u = user();
        var slots = u.dockSlots || 2, shops = u.workshops || 0;
        var cols = (u.colonists && typeof u.colonists === 'object') ? u.colonists : {};
        var total = Object.keys(cols).reduce(function (a, k) { return a + (cols[k] || 0); }, 0);
        // Цена должна совпадать с сервером: /api/rent считает 25000 * slots.
        // Раньше в окне было 50 000 * slots — отсюда расхождение «50 000 против 75 000».
        var dockPrice = 25000 * slots, shopPrice = 120000 + 60000 * shops;
        box.innerHTML =
            '<div style="border:1px solid #16263d;border-radius:10px;padding:12px;margin-bottom:10px;">' +
            '<div><b>Место в доке</b> · занято ' + slots + ' из 5</div>' +
            '<div style="opacity:.65;font-size:12px;margin:6px 0;">Больше кораблей одновременно</div>' +
            (slots >= 5
                ? '<div style="opacity:.6;">Все места арендованы</div>'
                : '<button class="lease-btn" data-what="dock" style="padding:7px 12px;border-radius:8px;border:none;' +
                  'background:#2ecc71;color:#04121f;font-weight:bold;cursor:pointer;">Арендовать · ' + money(dockPrice) + ' кр</button>') +
            '</div>' +
            '<div style="border:1px solid #16263d;border-radius:10px;padding:12px;">' +
            '<div><b>Ремонтная мастерская</b> · ' + shops + ' из 3</div>' +
            '<div style="opacity:.65;font-size:12px;margin:6px 0;">Ремонт и обслуживание флота</div>' +
            (shops >= 3
                ? '<div style="opacity:.6;">Все мастерские арендованы</div>'
                : '<button class="lease-btn" data-what="workshop" style="padding:7px 12px;border-radius:8px;border:none;' +
                  'background:#4f8ef7;color:#04121f;font-weight:bold;cursor:pointer;">Арендовать · ' + money(shopPrice) + ' кр</button>') +
            '</div>' +
            '<div style="margin-top:14px;padding-top:12px;border-top:1px solid #16263d;">' +
            '<div style="margin-bottom:6px;"><b>Найм переселенцев</b> <span style="opacity:.6;font-size:12px;">' +
            '(платёж: кредиты и зерно вперемешку)</span></div>' +
            '<div style="display:flex;gap:8px;flex-wrap:wrap;">' +
            hireBtn('earth', 'Земляне', 1200, cols) +
            hireBtn('mars', 'Марсиане-технократы', 2000, cols) +
            hireBtn('astral', 'Астровитяне', 1500, cols) +
            '</div>' +
            '<div style="margin-top:8px;opacity:.7;font-size:12px;">Нанято: ' + total + ' чел.</div>' +
            '</div>' +
            shipsBlock(u) +
            '<div style="margin-top:14px;padding-top:12px;border-top:1px solid #16263d;">' +
            '<div><b>Оптовый контракт</b> · закупка у NPC на 15% дешевле, 30 дней</div>' +
            '<div style="opacity:.6;font-size:12px;margin:4px 0;">Окупается за 5–6 сделок торговца</div>' +
            '<button id="buy-contract" style="padding:7px 12px;border-radius:8px;border:none;background:#f1c40f;color:#04121f;font-weight:700;cursor:pointer;">Купить · 50 000 кр</button>' +
            '</div>' +
            '<div style="margin-top:10px;opacity:.7;">Ваш капитал: ' + money(u.credits || 0) + ' кр</div>';

        var contractBtn = document.getElementById('buy-contract');
        if (contractBtn) {
            contractBtn.onclick = function () {
                contractBtn.disabled = true;
                fetch('/api/contract/buy', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-Auth-Token': token() },
                    body: JSON.stringify({ type: 'wholesale' })
                }).then(function (r) { return r.json().catch(function () { return {}; }); }).then(function (res) {
                    contractBtn.disabled = false;
                    if (!res || res.error) { toast((res && res.error) || 'Сервер недоступен'); return; }
                    var usr = user();
                    if (typeof res.credits === 'number') usr.credits = res.credits;
                    if (typeof window.updateAuthUI === 'function') window.updateAuthUI();
                    toast('Контракт действует до ' + new Date(res.until * 1000).toLocaleDateString('ru-RU'));
                    render();
                }).catch(function () { contractBtn.disabled = false; toast('Сервер недоступен'); });
            };
        }

        Array.prototype.forEach.call(box.querySelectorAll('button.upgrade-btn'), function (btn) {
            btn.onclick = function () {
                btn.disabled = true;
                fetch('/api/shipupgrade', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-Auth-Token': token() },
                    body: JSON.stringify({ index: parseInt(btn.getAttribute('data-index'), 10) })
                }).then(function (r) { return r.json().catch(function () { return {}; }); }).then(function (res) {
                    if (!res) { toast('Сервер недоступен'); btn.disabled = false; return; }
                    if (res.error) { toast(res.error); btn.disabled = false; return; }
                    var usr = user();
                    usr.credits = res.credits;
                    if (usr.resources) usr.resources.steel = res.steel;
                    var idx = parseInt(btn.getAttribute('data-index'), 10);
                    if (usr.ships && usr.ships[idx]) usr.ships[idx].level = res.level;
                    toast('Уровень корабля: ' + res.level);
                    render();
                }).catch(function () { toast('Сервер недоступен'); btn.disabled = false; });
            };
        });

        Array.prototype.forEach.call(box.querySelectorAll('button.hire-btn'), function (btn) {
            btn.onclick = function () {
                var src = btn.getAttribute('data-source');
                btn.disabled = true;
                fetch('/api/hire', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-Auth-Token': token() },
                    body: JSON.stringify({ count: HIRE_COUNT, source: src })
                }).then(function (r) { return r.json().catch(function () { return {}; }); }).then(function (res) {
                    if (!res) { toast('Сервер недоступен'); btn.disabled = false; return; }
                    if (res.error) { toast(res.error); btn.disabled = false; return; }
                    var usr = user();
                    usr.credits = res.credits;
                    usr.colonists = res.colonists;
                    if (usr.resources && typeof res.grain === 'number') usr.resources.grain = res.grain;
                    if (typeof window.updateAuthUI === 'function') window.updateAuthUI();
                    toast('Нанято ' + res.hired + ' чел. Всего переселенцев: ' + res.colonistsTotal);
                    render();
                }).catch(function () { toast('Сервер недоступен'); btn.disabled = false; });
            };
        });

        Array.prototype.forEach.call(box.querySelectorAll('button.lease-btn'), function (btn) {
            btn.onclick = function () {
                btn.disabled = true;
                post(btn.getAttribute('data-what')).then(function (res) {
                    if (!res) { toast('Сервер недоступен'); btn.disabled = false; return; }
                    if (res.error) { toast(res.error); btn.disabled = false; return; }
                    var usr = user();
                    usr.credits = res.credits;
                    usr.dockSlots = res.dockSlots;
                    usr.workshops = res.workshops;
                    if (typeof window.updateAuthUI === 'function') window.updateAuthUI();
                    if (typeof window.renderDock === 'function') { try { window.renderDock(); } catch (e) { } }
                    toast(btn.getAttribute('data-what') === 'dock'
                        ? 'Мест в доке: ' + res.dockSlots
                        : 'Мастерских: ' + res.workshops);
                    render();
                });
            };
        });
    }

    window.Lease = {
        open: function () { modal().style.display = 'flex'; render(); },
        close: function () {
            var m = document.getElementById('lease-modal');
            if (m) m.style.display = 'none';
        }
    };

    function addMenuButton() {
        var items = document.getElementById('left-menu-items');
        if (!items || document.getElementById('lease-menu-btn')) return;
        var b = document.createElement('button');
        b.id = 'lease-menu-btn';
        b.className = 'menu-btn';
        b.textContent = '🛠 Аренда';
        b.onclick = function () { window.Lease.open(); };
        items.appendChild(b);
    }

    function boot() {
        addMenuButton();
        var tries = 0;
        var t = setInterval(function () {
            tries++;
            addMenuButton();
            if (document.getElementById('lease-menu-btn') || tries > 20) clearInterval(t);
        }, 1000);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
})();
