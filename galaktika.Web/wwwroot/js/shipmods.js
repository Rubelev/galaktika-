// Модернизация кораблей: простые уровни (+10 %) и разовые чертежи/артефакты.
// ?mods=1 — превью панели.
(function () {
    'use strict';
    if (/[?&]safe=1/.test(location.search)) return;

    function el(tag, cls, text) {
        var d = document.createElement(tag);
        if (cls) d.className = cls;
        if (text !== undefined) d.textContent = text;
        return d;
    }
    function token() { try { return localStorage.getItem('galaktika_token') || ''; } catch (e) { return ''; } }
    function api(path, body, method) {
        return fetch(path, {
            method: method || 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Auth-Token': token() },
            body: body ? JSON.stringify(body) : undefined
        }).then(function (r) { return r.json().catch(function () { return {}; }); });
    }
    function toast(t) { if (typeof window.notify === 'function') window.notify(t); }
    function money(n) { return Math.round(n).toLocaleString('ru-RU'); }
    function secs(s) {
        if (s <= 0) return 'готово';
        var m = Math.floor(s / 60), r = s % 60;
        return m > 0 ? (m + ' мин ' + r + ' с') : (r + ' с');
    }

    // запасные таблицы: нужны, если панель открыта без входа (превью)
    var DEFAULT_BRANCHES = {
        weapon: { name: 'Оружие', stat: 'урон' },
        shield: { name: 'Щит', stat: 'ёмкость и регенерация' },
        armor: { name: 'Броня', stat: 'сопротивление' },
        engine: { name: 'Двигатель', stat: 'уклонение' }
    };
    var DEFAULT_BLUEPRINTS = {
        bp_plasma_core: { name: 'Плазменный сердечник', dmg: 0.25, price: 120000, buy: true, rare: 'редкий', note: 'усиливает подачу энергии на орудия' },
        bp_rail_accel: { name: 'Магнитный ускоритель', acc: 0.15, price: 60000, buy: true, rare: 'обычный', note: 'разгоняет снаряды' },
        bp_shield_harmonic: { name: 'Гармонизатор щита', shield: 0.30, price: 110000, buy: true, rare: 'редкий', note: 'выравнивает поле щита' },
        bp_armor_adamant: { name: 'Адамантиевая броня', armor: 0.20, price: 95000, buy: true, rare: 'редкий', note: 'слой адамантия' },
        bp_engine_vector: { name: 'Векторный привод', evade: 0.25, price: 75000, buy: true, rare: 'обычный', note: 'боковые дюзы' },
        bp_targeting_ai: { name: 'ИИ наводчика', dmg: 0.10, acc: 0.10, price: 85000, buy: true, rare: 'обычный', note: 'предсказывает манёвр' },
        bp_reactor_overdrive: { name: 'Реактор «Перегрузка»', energy: 0.20, price: 100000, buy: true, rare: 'редкий', note: 'больше пушек в залпе' },
        bp_repair_drone: { name: 'Ремонтные дроны', hull: 0.15, price: 70000, buy: true, rare: 'обычный', note: 'латают корпус' },
        bp_torpedo_boost: { name: 'Форсаж торпед', pen: 0.20, price: 80000, buy: true, rare: 'обычный', note: 'пробивает броню' },
        art_jupiter_eye: { name: 'Глаз Юпитера', dmg: 0.12, price: 0, buy: false, rare: 'артефакт', note: 'найден на станции' },
        art_void_shard: { name: 'Осколок Пустоты', pen: 0.20, price: 0, buy: false, rare: 'артефакт', note: 'трофей пиратов' },
        art_ancient_key: { name: 'Ключ Древних', dmg: 0.08, shield: 0.08, armor: 0.08, evade: 0.08, price: 0, buy: false, rare: 'артефакт', note: 'редкий квест' },
        art_kepler_core: { name: 'Ядро Кеплера', energy: 0.15, price: 0, buy: false, rare: 'артефакт', note: 'колония «Кеплер-1»' }
    };

    var state = { ships: [], branches: {}, blueprints: {}, owned: [], ship: 0,
                  docks: { total: 1, busy: 0, free: 1, upgradeCost: 120000 } };
    var timer = null;

    function open() {
        var old = document.getElementById('sm-wrap');
        if (old) old.remove();
        var wrap = el('div');
        wrap.id = 'sm-wrap';
        wrap.style.cssText = 'position:fixed;inset:0;z-index:13200;background:rgba(4,8,12,.85);' +
            'display:flex;align-items:center;justify-content:center;padding:14px';
        var card = el('div');
        card.style.cssText = 'width:min(760px,96vw);max-height:92vh;overflow:auto;background:#0b1526;' +
            'border:2px solid #1e3a5f;border-radius:16px;padding:18px;color:#dce8f7;' +
            'font:14px/1.5 Inter,system-ui,sans-serif';
        card.innerHTML =
            '<div style="display:flex;justify-content:space-between;align-items:center">' +
            '<b style="color:#8fd6ff;font-size:17px">🔧 Модернизация кораблей</b>' +
            '<button id="sm-close" style="padding:4px 10px;border:none;border-radius:8px;background:#2b3238;' +
            'color:#e6eaed;cursor:pointer">✕</button></div>' +
            '<div style="color:#9fb2c6;font-size:12.5px;margin-top:4px">' +
            'Простые уровни дают +10 % и требуют времени. Чертежи дают бонус сразу и навсегда.</div>' +
            '<div id="sm-docks" style="margin:10px 0;padding:10px 12px;background:#0f1c2e;' +
            'border:1px solid #1e3a5f;border-radius:12px;font-size:13px"></div>' +
            '<div id="sm-ships" style="display:flex;gap:6px;margin:10px 0;flex-wrap:wrap"></div>' +
            '<div id="sm-body" style="display:grid;gap:10px"></div>' +
            '<div id="sm-bp" style="margin-top:14px"></div>' +
            '<div id="sm-msg" style="margin-top:10px;min-height:18px;color:#8fd6ff"></div>';
        wrap.appendChild(card);
        document.body.appendChild(wrap);
        card.addEventListener('click', function (e) { e.stopPropagation(); });
        document.getElementById('sm-close').onclick = function () { wrap.remove(); if (timer) clearInterval(timer); };

        function msg(t, c) {
            var m = document.getElementById('sm-msg');
            if (m) { m.textContent = t; m.style.color = c || '#8fd6ff'; }
        }

        function load() {
            api('/api/shipmods', null, 'GET').then(function (res) {
                state.ships = res.ships || [];
                state.branches = (res.branches && Object.keys(res.branches).length) ? res.branches : DEFAULT_BRANCHES;
                state.blueprints = (res.blueprints && Object.keys(res.blueprints).length) ? res.blueprints : DEFAULT_BLUEPRINTS;
                state.owned = res.owned || [];
                if (res.docks) state.docks = res.docks;
                if (res.shipyard) state.shipyard = res.shipyard;
                // превью без входа: показываем пример, чтобы было видно интерфейс
                if (!state.ships.length && /[?&]demo=1/.test(location.search)) {
                    state.ships = [{ index: 0, name: 'Ланцер «Пика»', mods: { weapon: 3, shield: 1 },
                        blueprints: ['bp_rail_accel'], busy: false, modEnds: 0, modKind: '', modLevel: 0 }];
                    state.owned = ['bp_plasma_core', 'art_jupiter_eye'];
                }
                if (state.ships.length && !state.ships[state.ship]) state.ship = 0;
                renderDocks();
                renderShips();
                renderBody();
                renderBlueprints();
            });
        }

        function renderDocks() {
            var box = document.getElementById('sm-docks');
            if (!box) return;
            var d = state.docks || {};
            var sy = state.shipyard || {};
            var total = d.total || 1, busy = d.busy || 0, free = d.free >= 0 ? d.free : Math.max(0, total - busy);
            var cells = '';
            for (var i = 0; i < total; i++) {
                var used = i < busy;
                cells += '<span title="' + (used ? 'занят' : 'свободен') + '" style="display:inline-block;' +
                    'width:26px;height:26px;border-radius:6px;margin-right:4px;line-height:26px;text-align:center;' +
                    'background:' + (used ? '#8a4a2a' : '#1f3a2a') + ';border:1px solid ' +
                    (used ? '#c46a3a' : '#2f7f5f') + '">' + (used ? '⚙' : '✓') + '</span>';
            }
            box.innerHTML = '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">' +
                '<b style="color:#8fd6ff">🏗 Верфь ' + (sy.level || 1) + ' ур · доки: ' + busy + ' / ' + total + '</b>' +
                '<span style="color:#9fb2c6;font-size:12px">скорость ×' + (sy.speed || 1) +
                ' · рабочих мест ' + (sy.jobs || 200).toLocaleString('ru-RU') + '</span>' +
                '<span style="flex:1"></span>' + cells +
                (total < 5
                    ? '<button id="sm-dockup" style="padding:7px 11px;border:none;border-radius:8px;cursor:pointer;' +
                      'background:linear-gradient(#ffe07a,#d8a41c);color:#2a1f00;font-weight:800">' +
                      'Улучшить верфь · ' + money(d.upgradeCost || 120000) + ' кр</button>'
                    : '<span style="color:#6f8296">максимум 5 доков</span>') +
                '</div>' +
                '<div style="color:#9fb2c6;font-size:12px;margin-top:6px">' +
                'Доки общие: в них и строят корабли, и модернизируют. Свободно: <b style="color:' +
                (free > 0 ? '#3ec97a' : '#ff6b5a') + '">' + free + '</b></div>' +
                ((d.queue && d.queue.length)
                    ? '<div style="margin-top:6px;color:#ffd05a;font-size:12px">В очереди: ' +
                      d.queue.map(function (q, i) {
                          var nm = state.branches[q.kind] ? state.branches[q.kind].name : q.kind;
                          return (i + 1) + ') ' + nm + ' → ур. ' + q.level;
                      }).join(' · ') + '</div>'
                    : '');
            var up = document.getElementById('sm-dockup');
            if (up) up.onclick = function () {
                api('/api/shipyard/upgrade', {}).then(function (res) {
                    if (res.error) { msg(res.error, '#ff6b5a'); return; }
                    msg('Верфь улучшена: уровень ' + res.level + ', доков ' + res.docks +
                        ', скорость ×' + res.speed, '#3ec97a');
                    toast('Верфь: уровень ' + res.level);
                    load();
                });
            };
        }

        function renderShips() {
            var box = document.getElementById('sm-ships');
            if (!box) return;
            if (!state.ships.length) {
                box.innerHTML = '<span style="color:#ff9a8a">У вас нет кораблей — постройте на верфи.</span>';
                return;
            }
            box.innerHTML = state.ships.map(function (s, i) {
                var active = i === state.ship;
                return '<button data-ship="' + i + '" style="padding:7px 12px;border-radius:9px;cursor:pointer;' +
                    'border:none;font-weight:800;background:' + (active ? 'linear-gradient(#8fd6ff,#2f9fe0)' : '#2b4a6e') +
                    ';color:' + (active ? '#04223a' : '#dce8f7') + '">' + (s.name || ('Корабль ' + (i + 1))) + '</button>';
            }).join('');
            Array.prototype.forEach.call(box.querySelectorAll('button[data-ship]'), function (b) {
                b.onclick = function () {
                    state.ship = parseInt(b.getAttribute('data-ship'), 10);
                    renderShips(); renderBody(); renderBlueprints();
                };
            });
        }

        function renderBody() {
            var box = document.getElementById('sm-body');
            if (!box) return;
            var sh = state.ships[state.ship];
            if (!sh) { box.innerHTML = ''; return; }
            var busy = sh.busy;
            var left = busy ? Math.max(0, sh.modEnds - Math.floor(Date.now() / 1000)) : 0;
            var html = '';
            Object.keys(state.branches).forEach(function (kind) {
                var b = state.branches[kind];
                var lvl = (sh.mods && sh.mods[kind]) ? sh.mods[kind] : 0;
                var cost = Math.round(8000 * Math.pow(1.6, lvl));
                var sec = Math.round(300 * Math.pow(1.5, lvl));
                var maxed = lvl >= 10;
                html += '<div style="display:flex;align-items:center;gap:10px;background:#0f1c2e;' +
                    'border:1px solid #1e3a5f;border-radius:12px;padding:10px">' +
                    '<div style="flex:1"><b style="color:#ffd05a">' + b.name + '</b>' +
                    '<div style="color:#9fb2c6;font-size:12px">' + b.stat + ' · уровень ' + lvl + '/10 · ' +
                    'прибавка <b style="color:#3ec97a">+' + (lvl * 10) + ' %</b></div>' +
                    '<div style="height:6px;background:#16222e;border-radius:3px;overflow:hidden;margin-top:5px">' +
                    '<i style="display:block;height:100%;width:' + (lvl * 10) + '%;background:linear-gradient(90deg,#3ec97a,#ffd05a)"></i></div>' +
                    '</div>' +
                    (maxed
                        ? '<span style="color:#3ec97a;font-weight:800">максимум</span>'
                        : '<button data-mod="' + kind + '" ' + (busy ? 'disabled' : '') + ' style="padding:9px 12px;' +
                          'border:none;border-radius:9px;cursor:pointer;font-weight:800;' +
                          'background:' + (busy ? '#3a4652' : 'linear-gradient(#ffe07a,#d8a41c)') + ';color:#2a1f00">' +
                          '+1 ур · ' + money(cost) + ' кр · ' + secs(sec) + '</button>') +
                    '</div>';
            });
            if (busy) {
                html += '<div style="background:#102a1e;border:1px solid #2f7f5f;border-radius:12px;padding:10px">' +
                    '<b style="color:#3ec97a">Идёт модернизация: ' + (state.branches[sh.modKind] ? state.branches[sh.modKind].name : sh.modKind) +
                    ' → уровень ' + sh.modLevel + '</b>' +
                    '<div id="sm-timer" style="font:700 13px monospace;color:#9fe0b0;margin-top:4px">' +
                    'осталось ' + secs(left) + '</div>' +
                    '<button id="sm-accel" style="margin-top:8px;margin-right:6px;padding:9px 13px;border:none;' +
                    'border-radius:9px;cursor:pointer;background:#a78bfa;color:#12061f;font-weight:800"' +
                    (left > 0 ? '' : ' disabled') + '>⚡ Ускорить · ' + Math.max(1, Math.ceil(left / 60)) + ' крст</button>' +
                    '<button id="sm-claim" style="margin-top:8px;padding:9px 13px;border:none;border-radius:9px;' +
                    'cursor:pointer;background:' + (left > 0 ? '#3a4652' : 'linear-gradient(#8fd6ff,#2f9fe0)') + ';' +
                    'color:#04223a;font-weight:800"' + (left > 0 ? ' disabled' : '') + '>Забрать</button></div>';
            }
            box.innerHTML = html;
            Array.prototype.forEach.call(box.querySelectorAll('button[data-mod]'), function (b) {
                b.onclick = function () {
                    api('/api/shipmod/start', { ship: state.ship, kind: b.getAttribute('data-mod') })
                        .then(function (res) {
                            if (res.error) {
                                msg(res.error, '#ff6b5a');
                                if (res.error.indexOf('очередь') >= 0) {
                                    var q = document.getElementById('sm-queue-go');
                                    if (!q) {
                                        q = el('button', null, '⏳ Встать в очередь');
                                        q.id = 'sm-queue-go';
                                        q.style.cssText = 'margin-left:8px;padding:8px 12px;border:none;' +
                                            'border-radius:9px;cursor:pointer;background:#2b4a6e;color:#dce8f7;font-weight:800';
                                        document.getElementById('sm-msg').appendChild(q);
                                    }
                                    q.onclick = function () {
                                        api('/api/shipmod/start', { ship: state.ship, kind: b.getAttribute('data-mod'), queue: true })
                                            .then(function (r2) {
                                                if (r2.error) { msg(r2.error, '#ff6b5a'); return; }
                                                msg('В очереди, позиция ' + r2.position + ' · −' + money(r2.cost) + ' кр', '#3ec97a');
                                                load();
                                            });
                                    };
                                }
                                return;
                            }
                            msg('Начато: −' + money(res.cost) + ' кр, готово через ' + secs(res.seconds), '#3ec97a');
                            load();
                        });
                };
            });
            var accel = document.getElementById('sm-accel');
            if (accel) accel.onclick = function () {
                api('/api/shipmod/accelerate', { ship: state.ship }).then(function (res) {
                    if (res.error) { msg(res.error, '#ff6b5a'); return; }
                    msg('Ускорено за ' + res.crystals + ' кристаллов, осталось ' + res.eternity, '#3ec97a');
                    load();
                });
            };
            var claim = document.getElementById('sm-claim');
            if (claim) claim.onclick = function () {
                api('/api/shipmod/claim', { ship: state.ship }).then(function (res) {
                    if (res.error) { msg(res.error, '#ff6b5a'); return; }
                    msg('Модернизация завершена: уровень ' + res.level, '#3ec97a');
                    toast('Уровень ' + res.level);
                    load();
                });
            };
        }

        function renderBlueprints() {
            var box = document.getElementById('sm-bp');
            if (!box) return;
            var sh = state.ships[state.ship] || { blueprints: [] };
            var applied = sh.blueprints || [];
            var rows = Object.keys(state.blueprints).map(function (id) {
                var bp = state.blueprints[id];
                var have = state.owned.indexOf(id) >= 0;
                var installed = applied.indexOf(id) >= 0;
                var effects = [];
                if (bp.dmg) effects.push('+' + Math.round(bp.dmg * 100) + '% урон');
                if (bp.shield) effects.push('+' + Math.round(bp.shield * 100) + '% щит');
                if (bp.armor) effects.push('+' + Math.round(bp.armor * 100) + '% броня');
                if (bp.evade) effects.push('+' + Math.round(bp.evade * 100) + '% уклонение');
                if (bp.acc) effects.push('+' + Math.round(bp.acc * 100) + '% точность');
                if (bp.hull) effects.push('+' + Math.round(bp.hull * 100) + '% корпус');
                if (bp.energy) effects.push('+' + Math.round(bp.energy * 100) + '% энергия');
                if (bp.pen) effects.push('+' + Math.round(bp.pen * 100) + '% пробитие');
                return '<div style="display:flex;align-items:center;gap:8px;background:#161022;' +
                    'border:1px solid #3a2a4a;border-radius:10px;padding:9px">' +
                    '<div style="flex:1"><b style="color:' + (bp.rare === 'артефакт' ? '#c08cff' : '#ffd05a') + '">' +
                    bp.name + '</b> <span style="color:#6f8296;font-size:11.5px">' + (bp.rare || '') + '</span>' +
                    '<div style="color:#9fb2c6;font-size:12px">' + effects.join(' · ') + ' · ' + (bp.note || '') + '</div></div>' +
                    (installed
                        ? '<span style="color:#3ec97a;font-weight:800">установлен</span>'
                        : have
                            ? '<button data-apply="' + id + '" style="padding:8px 12px;border:none;border-radius:8px;' +
                              'cursor:pointer;background:linear-gradient(#9be8c0,#2fae74);color:#06231a;font-weight:800">Установить</button>'
                            : (bp.buy
                                ? '<button data-buy="' + id + '" style="padding:8px 12px;border:none;border-radius:8px;' +
                                  'cursor:pointer;background:#2b4a6e;color:#dce8f7;font-weight:800">Купить · ' + money(bp.price) + '</button>'
                                : '<span style="color:#8f6fb0;font-size:12px">только найти</span>')) +
                    '</div>';
            }).join('');
            box.innerHTML = '<b style="color:#8fd6ff">📜 Чертежи и артефакты</b>' +
                '<div style="display:grid;gap:8px;margin-top:8px">' + rows + '</div>';
            Array.prototype.forEach.call(box.querySelectorAll('button[data-buy]'), function (b) {
                b.onclick = function () {
                    api('/api/blueprint/buy', { id: b.getAttribute('data-buy') }).then(function (res) {
                        if (res.error) { msg(res.error, '#ff6b5a'); return; }
                        msg('Чертёж куплен', '#3ec97a');
                        load();
                    });
                };
            });
            Array.prototype.forEach.call(box.querySelectorAll('button[data-apply]'), function (b) {
                b.onclick = function () {
                    api('/api/blueprint/apply', { id: b.getAttribute('data-apply'), ship: state.ship })
                        .then(function (res) {
                            if (res.error) { msg(res.error, '#ff6b5a'); return; }
                            msg('Чертёж установлен на корабль', '#3ec97a');
                            load();
                        });
                };
            });
        }

        load();
        if (timer) clearInterval(timer);
        timer = setInterval(load, 15000);
    }

    function addMenuButton() {
        var box = document.getElementById('left-menu-items');
        if (!box || document.getElementById('sm-btn')) return;
        var b = el('button', 'menu-btn', '🔧 Модернизация');
        b.id = 'sm-btn';
        b.setAttribute('data-tip', 'Модернизация|Уровни +10 % и чертежи');
        b.onclick = open;
        var anchor = document.getElementById('settings-btn');
        if (anchor && anchor.parentNode === box) box.insertBefore(b, anchor);
        else box.appendChild(b);
    }

    window.ShipMods = { open: open };

    if (/[?&]mods=1/.test(location.search)) {
        var st = document.createElement('style');
        st.textContent = '#welcome-screen,#auth-overlay,#legend-overlay{display:none !important}';
        document.head.appendChild(st);
        setTimeout(open, 1500);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () { setTimeout(addMenuButton, 1800); });
    } else setTimeout(addMenuButton, 1800);
    setInterval(addMenuButton, 4000);
})();
