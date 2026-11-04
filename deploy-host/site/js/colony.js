// Колония игрока: население, снабжение едой и водой, налоги, рост и голод.
// Данные живут в профиле игрока (currentUser.colony) и уезжают на сервер через syncProfile.
(function () {
    'use strict';

    var CAP = 5000000;                    // потолок населения
    var FOOD_PER_PERSON_DAY = 0.3;        // кг зерна на человека в день
    var WATER_PER_PERSON_DAY = 0.003;     // т воды на человека в день
    var TAX_BASE = 18;                     // кредитов с человека в день при ставке 100%
    var COST_FOUND = 300000;              // основание колонии
    var PRICE = { grain: 4, water: 7 };   // закупка провизии по биржевым ценам
    var WORLDS = { kepler: 'Кеплер-1 · купола', ceres: 'Церера · купола', mars: 'Марс · полюс' };

    // ---- чистая математика (проверяется отдельно, без DOM) ----
    var ColonyMath = {
        FOOD_PER_PERSON_DAY: FOOD_PER_PERSON_DAY,
        WATER_PER_PERSON_DAY: WATER_PER_PERSON_DAY,
        TAX_BASE: TAX_BASE,
        CAP: CAP,

        create: function (world, name) {
            return {
                world: world || 'kepler',
                name: name || 'Новый Кеплер',
                founded: Math.floor(Date.now() / 1000),
                lastTick: Math.floor(Date.now() / 1000),
                population: 50000,
                happiness: 70,
                taxRate: 0.10,
                taxCollected: 0,
                daysLived: 0
            };
        },

        // Продвигает колонию на days суток, списывая еду и воду из resources.
        step: function (state, resources, days) {
            var out = { credits: 0, foodShort: 0, waterShort: 0, deficit: 0, died: 0 };
            if (!state || !(state.population > 0) || !(days > 0)) return out;
            days = Math.min(days, 30);   // больше месяца за один заход не считаем

            var foodNeed = state.population * FOOD_PER_PERSON_DAY * days;
            var waterNeed = state.population * WATER_PER_PERSON_DAY * days;
            var grain = Math.max(0, resources.grain || 0);
            var water = Math.max(0, resources.water || 0);
            var foodGot = Math.min(grain, foodNeed);
            var waterGot = Math.min(water, waterNeed);

            resources.grain = grain - foodGot;
            resources.water = water - waterGot;

            out.foodShort = foodNeed > 0 ? 1 - foodGot / foodNeed : 0;
            out.waterShort = waterNeed > 0 ? 1 - waterGot / waterNeed : 0;
            out.deficit = Math.max(out.foodShort, out.waterShort);

            if (out.deficit > 0.001) {
                state.happiness -= 10 * out.deficit * days;
            } else {
                state.happiness += 1.0 * days;
            }
            state.happiness = Math.max(0, Math.min(100, state.happiness));

            out.credits = state.population * (state.taxRate || 0) * TAX_BASE * days;
            state.taxCollected = (state.taxCollected || 0) + out.credits;

            var rate = 0.01;                       // базовый рост 2% в год
            if (state.happiness > 70) rate *= 2;         // довольные размножаются быстрее
            if (out.deficit > 0.3) rate = -0.10 * out.deficit;

            var before = state.population;
            state.population = Math.max(0, Math.min(CAP, before * Math.exp(rate * days)));

            // волны переселенцев на 30/60/90 день — награда за удержание
            var livedBefore = state.daysLived || 0;
            var livedAfter = livedBefore + days;
            [30, 60, 90].forEach(function (milestone) {
                if (livedBefore < milestone && livedAfter >= milestone) {
                    state.population = Math.min(CAP, state.population * 1.5);
                    out.wave = milestone;
                }
            });
            out.died = Math.max(0, before - state.population);
            state.daysLived = (state.daysLived || 0) + days;
            return out;
        },

        // Сколько дней продержится колония на текущих запасах
        daysLeft: function (state, resources) {
            if (!state || !(state.population > 0)) return 0;
            var foodDays = (resources.grain || 0) / (state.population * FOOD_PER_PERSON_DAY);
            var waterDays = (resources.water || 0) / (state.population * WATER_PER_PERSON_DAY);
            return Math.max(0, Math.min(foodDays, waterDays));
        }
    };
    window.ColonyMath = ColonyMath;

    // ---- доступ к игроку ----
    function user() { return (window.getCurrentUser && window.getCurrentUser()) || null; }
    function money(v) { return Math.round(v).toLocaleString('ru-RU'); }
    function toast(t) { if (typeof window.notify === 'function') window.notify(t); }
    function save() {
        if (typeof window.saveUser === 'function') window.saveUser();
        if (typeof window.syncProfile === 'function') window.syncProfile();
    }

    function tick(silent) {
        var u = user();
        if (!u || !u.colony) return null;
        var token = '';
        try { token = localStorage.getItem('galaktika_token') || ''; } catch (e) { token = ''; }

        if (token) {
            fetch('/api/colony/tick', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Auth-Token': token }, body: '{}' })
                .then(function (r) { return r.json().catch(function () { return {}; }); })
                .then(function (r) {
                    if (!r || r.error || !r.colony) { localTick(silent); return; }
                    u.colony = r.colony;
                    if (typeof r.credits === 'number') u.credits = r.credits;
                    u.resources = u.resources || {};
                    if (r.resources) {
                        if (typeof r.resources.grain === 'number') u.resources.grain = r.resources.grain;
                        if (typeof r.resources.water === 'number') u.resources.water = r.resources.water;
                    }
                    save();
                    var rep = r.report || {};
                    if (!silent && rep.credits > 0) toast('Колония: +' + money(rep.credits) + ' кр налогов');
                    if (!silent && rep.deficit > 0.01) toast('Колония голодает: не хватает ' + (rep.foodShort > 0.01 ? 'еды' : 'воды'));
                })
                .catch(function () { localTick(silent); });
            return null;
        }
        return localTick(silent);
    }

    // Офлайн: тот же расчёт локально
    function localTick(silent) {
        var u = user();
        if (!u || !u.colony) return null;
        var now = Math.floor(Date.now() / 1000);
        var days = (now - (u.colony.lastTick || now)) / 86400;
        if (days <= 0.00001) return null;
        u.resources = u.resources || {};
        var res = ColonyMath.step(u.colony, u.resources, days);
        u.colony.lastTick = now;
        if (res.credits > 0) u.credits = (u.credits || 0) + res.credits;
        save();
        if (!silent && res.credits > 0) toast('Колония: +' + money(res.credits) + ' кр налогов');
        return res;
    }

    // ---- интерфейс ----
    function modal() {
        var el = document.getElementById('colony-modal');
        if (el) return el;
        el = document.createElement('div');
        el.id = 'colony-modal';
        el.style.cssText = 'position:fixed;inset:0;display:none;align-items:center;justify-content:center;' +
            'background:rgba(3,8,20,.72);z-index:12000;padding:16px;';
        el.innerHTML = '<div style="width:min(760px,96vw);max-height:88vh;overflow:auto;background:#0b1526;' +
            'border:1px solid #1e3350;border-radius:12px;padding:18px 20px;color:#dbe6f5;">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">' +
            '<h2 style="margin:0;font-size:20px;">🏙 Колония</h2>' +
            '<button onclick="window.Colony.close()" style="background:none;border:none;color:#8ab4f8;font-size:22px;cursor:pointer;">&times;</button>' +
            '</div><div id="colony-body"></div></div>';
        el.addEventListener('click', function (e) { if (e.target === el) window.Colony.close(); });
        document.body.appendChild(el);
        return el;
    }

    function row(label, value, hint) {
        return '<div style="display:flex;justify-content:space-between;gap:12px;padding:7px 0;border-bottom:1px solid #16263d;">' +
            '<span style="opacity:.75;">' + label + '</span>' +
            '<span style="text-align:right;"><b>' + value + '</b>' + (hint ? '<div style="opacity:.55;font-size:12px;">' + hint + '</div>' : '') + '</span></div>';
    }

    var RUIN_COST = { robots: 45000, equipment: 38000, agro: 400000 };

    function ruinsBlock(c) {
        var list = (c && c.ruins) || [];
        if (!list.length) return '';
        var html = '<div style="margin-top:14px;padding:10px;border-radius:10px;background:#141d2e;border:1px solid #23324a;">' +
            '<div style="margin-bottom:6px;">🏚 Руины прежней цивилизации</div>';
        list.forEach(function (r) {
            var name = (window.COLONY_FACTORY_NAMES && window.COLONY_FACTORY_NAMES[r.id]) || r.id;
            var price = Math.round(((RUIN_COST[r.id] || 40000) * (r.max || 1)) * 0.5);
            html += '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:4px 0;">' +
                '<span>' + name + ' · до ' + (r.max || 1) + ' ур.</span>' +
                '<button class="restore-btn" data-id="' + r.id + '" style="padding:5px 10px;border-radius:6px;border:none;' +
                'background:#f39c12;color:#1a1204;font-weight:bold;cursor:pointer;">Восстановить · ' + money(price) + ' кр</button>' +
                '</div>';
        });
        return html + '</div>';
    }

    function restore(id) {
        var token = '';
        try { token = localStorage.getItem('galaktika_token') || ''; } catch (e) { token = ''; }
        if (!token) { toast('Войдите в игру'); return; }
        fetch('/api/colony/restore', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Auth-Token': token },
            body: JSON.stringify({ id: id })
        }).then(function (r) { return r.json().catch(function () { return {}; }); }).then(function (res) {
            if (!res || res.error) { toast((res && res.error) || 'Сервер недоступен'); return; }
            var u = user();
            if (!u) return;
            u.colony.ruins = res.ruins || [];
            u.factories = u.factories || {};
            u.factories[id] = res.factory.level;
            if (typeof res.credits === 'number') u.credits = res.credits;
            u.resources = u.resources || {};
            if (typeof res.steel === 'number') u.resources.steel = res.steel;
            save();
            if (typeof window.updateAuthUI === 'function') window.updateAuthUI();
            toast('Восстановлено до ' + res.factory.level + ' ур.');
            render();
        }).catch(function () { toast('Сервер недоступен'); });
    }

    function render() {
        var box = document.getElementById('colony-body');
        if (!box) return;
        var u = user();
        if (!u) { box.innerHTML = '<p>Войдите в игру.</p>'; return; }

        if (!u.colony) {
            box.innerHTML = '<p>У вас пока нет своего мира. Колония даёт население, налоги и смысл возить грузы.</p>' +
                '<p style="opacity:.7;">Основание: <b>' + money(COST_FOUND) + ' кр</b>. Начать можно на Кеплер-1.</p>' +
                '<button id="colony-found" style="padding:10px 16px;border-radius:8px;border:none;cursor:pointer;' +
                'background:#2ecc71;color:#04121f;font-weight:bold;">Основать колонию</button>';
            document.getElementById('colony-found').onclick = found;
            return;
        }

        var c = u.colony;
        var res = u.resources || {};
        var daysLeft = ColonyMath.daysLeft(c, res);
        var foodPerDay = c.population * FOOD_PER_PERSON_DAY;
        var waterPerDay = c.population * WATER_PER_PERSON_DAY;
        var taxPerDay = c.population * (c.taxRate || 0) * TAX_BASE;
        var upkeepPerDay = c.population * c.population * 0.000001;
        var energyNow = (u.resources || {}).energy || u.energy || 0;
        var energyOff = Math.min(0.2, energyNow / 25000);
        var upkeepAfter = upkeepPerDay * (1 - energyOff);
        var taxPer30 = c.population * (c.taxRate || 0) * TAX_BASE * 30;
        var capNow = (c.stage === 'elevator') ? 5000000 : ((c.stage === 'planet') ? 1500000 : 250000);
        var pop30 = Math.min(capNow, c.population * Math.exp(0.01 * (c.happiness > 70 ? 2 : 1) * 30));
        var taxHint = (c.taxRate || 0) < 0.15
            ? 'при ' + Math.round((c.taxRate || 0) * 100) + '% колония у предела ~600 тыс.: для роста нужна ставка 15–20%'
            : 'ставка выше 15%: доход растёт, но счастье падает';
        var agroLevel = ((u.factories || {}).agro) || 0;
        var agroCapacity = agroLevel * 250000;
        var autonomy = !!c.autonomy;
        var peak = Math.max(c.peak || 0, c.population || 0);
        var lost = Math.max(0, Math.floor(peak - (c.population || 0)));
        var stage = c.stage || 'moon';
        var stageCap = stage === 'elevator' ? 5000000 : (stage === 'planet' ? 1500000 : 250000);
        var stageName = stage === 'elevator' ? 'Планета с гравитационным лифтом'
            : (stage === 'planet' ? 'Планета' : 'Лунная база');
        var growthPerDay = c.happiness > 70 ? 2 * 0.01 : 0.01;

        box.innerHTML =
            '<div style="margin-bottom:10px;"><b>' + c.name + '</b> · ' + (WORLDS[c.world] || c.world) +
            ' · основана ' + new Date((c.founded || 0) < 1e12 ? (c.founded || 0) * 1000 : c.founded).toLocaleDateString('ru-RU') + '</div>' +
            row('Жилой модуль', (c.habitat || 0) + ' ур.', '+' + money((c.habitat || 0) * 50000) + ' к потолку') +
            row('Док на месте', (c.docks || 0) + ' шт.', 'обслуживание флота в колонии') +
            row('Этап', stageName, 'потолок ' + money(stageCap) + ' жителей') +
            row('Население', money(c.population) + ' чел.', 'потолок ' + money(CAP)) +
            row('Счастье', Math.round(c.happiness) + '%', c.happiness > 70 ? 'растут быстрее' : 'нужно снабжение') +
            row('Запас еды (зерно)', money(res.grain || 0) + ' кг', 'расход ' + money(foodPerDay) + ' кг/день') +
            row('Запас воды', money(res.water || 0) + ' т', 'расход ' + money(waterPerDay) + ' т/день') +
            row('Хватит запасов', daysLeft > 0 ? Math.floor(daysLeft) + ' дн.' : 'нет', daysLeft < 3 ? 'голод близко' : '') +
            row('Налоги', money(taxPerDay) + ' кр/день', 'ставка ' + Math.round(c.taxRate * 100) + '% · собрано ' + money(c.taxCollected || 0)) +
            row('Потеряно людей', lost > 0 ? money(lost) + ' чел.' : 'нет', lost > 0 ? 'можно вернуть по 100 кр/чел' : 'колония в порядке') +
            row('Содержание', money(upkeepPerDay) + ' кр/день',
                'с учётом энергии: ' + money(upkeepAfter) + ' кр/день (скидка ' + Math.round(energyOff * 100) + '%)') +
            row('Прогноз на 30 дней', money(taxPer30) + ' кр налогов',
                'население ≈ ' + money(pop30) + ' чел. · ' + taxHint) +
            row('Агрокомплекс', agroLevel ? (agroLevel + ' ур. · кормит ' + money(agroCapacity)) : 'не построен',
                autonomy ? 'замкнутая экономика включена' : 'снабжение с Земли') +
            row('Прирост', (growthPerDay * 100).toFixed(3) + '%/день', 'до ' + money(c.population * (1 + growthPerDay)) + ' чел. за сутки') +
            row('Оборона', (c.defense || 0) + ' ур.', 'следующий налёт через ~' + Math.max(0, Math.round(((c.nextRaidIn || 0) - (Math.floor(Date.now()/1000) - (c.lastRaid || 0))) / 3600)) + ' ч') +
            (c.lastReport ? '<div style="margin:8px 0;padding:8px;border-radius:8px;background:' + (c.lastReport.result === 'repelled' ? '#12301f' : '#301414') + ';font-size:13px;">' +
                (c.lastReport.result === 'repelled'
                    ? '🛡 Последний налёт отбит (сила ' + c.lastReport.strength + ', оборона ' + c.lastReport.defense + ')'
                    : '⚠️ Последний налёт: сила ' + c.lastReport.strength + ', потеряно ' + money(c.lastReport.losses) + ' жителей' +
                      (c.lastReport.stolen && c.lastReport.stolen.grain ? ', украдено зерна ' + money(c.lastReport.stolen.grain) : '')) +
                '</div>' : '') +
            '<div style="margin:14px 0 8px;">Ставка налога: <b id="tax-val">' + Math.round(c.taxRate * 100) + '%</b></div>' +
            '<input id="tax-range" type="range" min="0" max="30" value="' + Math.round(c.taxRate * 100) + '" style="width:100%;">' +
            '<div style="opacity:.6;font-size:12px;margin-top:4px;">Выше ставка — больше денег, но счастье падает на 0.05 в день за каждый процент выше 15%.</div>' +
            ruinsBlock(c) +
        '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px;">' +
            '<button id="buy-food" style="padding:9px 14px;border-radius:8px;border:none;cursor:pointer;background:#2ecc71;color:#04121f;font-weight:bold;">Купить еды на 7 дней</button>' +
            '<button id="buy-water" style="padding:9px 14px;border-radius:8px;border:none;cursor:pointer;background:#4f8ef7;color:#04121f;font-weight:bold;">Купить воды на 7 дней</button>' +
            '<button id="buy-defense" style="padding:9px 14px;border-radius:8px;border:none;cursor:pointer;background:#f1c40f;color:#04121f;font-weight:bold;">Оборона +1 · ' + money(150000 * ((c.defense || 0) + 1)) + ' кр</button>' +
            (lost >= 100 ? '<button id="restore-pop" style="padding:9px 14px;border-radius:8px;border:none;cursor:pointer;background:#16a085;color:#04121f;font-weight:bold;">Программа переселения · ' + money(lost) + ' чел за ' + money(lost * 100) + ' кр</button>' : '') +
            '<button id="next-stage" style="padding:9px 14px;border-radius:8px;border:none;cursor:pointer;background:#9b59b6;color:#fff;font-weight:bold;">' + (stage === 'moon' ? 'Спуск на планету · 500 000 кр + 500 т стали' : (stage === 'planet' ? 'Гравитационный лифт · 2 000 000 кр + 2 000 т стали + 200 чипов' : 'Все этапы пройдены')) + '</button>' +
            '<button id="toggle-autonomy" style="padding:9px 14px;border-radius:8px;border:none;cursor:pointer;background:' + (autonomy ? '#e67e22' : '#27ae60') + ';color:#04121f;font-weight:bold;">' + (autonomy ? 'Вернуться к снабжению с Земли' : 'Замкнутая экономика') + '</button>' +
            '</div>' +
            '<div id="colony-msg" style="margin-top:10px;opacity:.8;"></div>';

        var range = document.getElementById('tax-range');
        range.oninput = function () {
            document.getElementById('tax-val').textContent = range.value + '%';
        };
        range.onchange = function () {
            var v = Math.max(0, Math.min(30, Number(range.value))) / 100;
            if (v > 0.15) {
                c.happiness = Math.max(0, c.happiness - (v - 0.15) * 20);
            }
            c.taxRate = v;
            save();
            render();
        };

        document.getElementById('buy-food').onclick = function () { buy('grain', foodPerDay * 7); };
        document.getElementById('buy-water').onclick = function () { buy('water', waterPerDay * 7); };
        document.getElementById('buy-defense').onclick = function () {
            var token = '';
            try { token = localStorage.getItem('galaktika_token') || ''; } catch (e) { token = ''; }
            if (!token) { toast('Войдите в игру'); return; }
            fetch('/api/colony/defense', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Auth-Token': token }, body: JSON.stringify({ levels: 1 }) })
                .then(function (r) { return r.json().catch(function () { return {}; }); })
                .then(function (r) {
                    if (r && r.error) { toast(r.error); return; }
                    if (r && r.colony) {
                        u.colony = r.colony;
                        if (typeof r.credits === 'number') u.credits = r.credits;
                        save();
                        if (typeof window.updateAuthUI === 'function') window.updateAuthUI();
                        toast('Оборона: ' + r.colony.defense + ' ур.');
                        render();
                    }
                })
                .catch(function () { toast('Сервер недоступен'); });
        };
    }

    function buy(kind, amount) {
        var u = user();
        if (!u || !u.colony) return;
        amount = Math.ceil(amount);
        Array.prototype.forEach.call(document.querySelectorAll('.restore-btn'), function (btn) {
            btn.onclick = function () { restore(btn.getAttribute('data-id')); };
        });

        var autonomyBtn = document.getElementById('toggle-autonomy');
        if (autonomyBtn) {
            autonomyBtn.onclick = function () {
                var token = '';
                try { token = localStorage.getItem('galaktika_token') || ''; } catch (e) { token = ''; }
                if (!token) { toast('Войдите в игру'); return; }
                fetch('/api/colony/autonomy', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-Auth-Token': token },
                    body: JSON.stringify({ on: !u.colony.autonomy })
                }).then(function (r) { return r.json().catch(function () { return {}; }); }).then(function (res) {
                    if (!res || res.error) { toast((res && res.error) || 'Сервер недоступен'); return; }
                    u.colony.autonomy = res.autonomy;
                    save(); render();
                    toast(res.autonomy ? 'Система перешла на замкнутый цикл' : 'Снабжение с Земли восстановлено');
                }).catch(function () { toast('Сервер недоступен'); });
            };
        }

        var stageBtn = document.getElementById('next-stage');
        if (stageBtn) {
            stageBtn.onclick = function () {
                var to = u.colony.stage === 'planet' ? 'elevator' : 'moon';
                if (u.colony.stage === 'elevator') { toast('Все этапы пройдены'); return; }
                var token = '';
                try { token = localStorage.getItem('galaktika_token') || ''; } catch (e) { token = ''; }
                if (!token) { toast('Войдите в игру'); return; }
                fetch('/api/colony/stage', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-Auth-Token': token },
                    body: JSON.stringify({ to: to })
                }).then(function (r) { return r.json().catch(function () { return {}; }); }).then(function (res) {
                    if (!res || res.error) { toast((res && res.error) || 'Сервер недоступен'); return; }
                    u.colony.stage = res.stage;
                    if (typeof res.credits === 'number') u.credits = res.credits;
                    save(); render();
                    toast(res.stageName + ': потолок ' + money(res.capacity) + ' жителей');
                }).catch(function () { toast('Сервер недоступен'); });
            };
        }

        var restoreBtn = document.getElementById('restore-pop');
        if (restoreBtn) {
            restoreBtn.onclick = function () {
                var token = '';
                try { token = localStorage.getItem('galaktika_token') || ''; } catch (e) { token = ''; }
                if (!token) { toast('Войдите в игру'); return; }
                fetch('/api/colony/restore_population', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-Auth-Token': token },
                    body: '{}'
                }).then(function (r) { return r.json().catch(function () { return {}; }); }).then(function (res) {
                    if (!res || res.error) { toast((res && res.error) || 'Сервер недоступен'); return; }
                    u.colony.population = res.population;
                    if (typeof res.credits === 'number') u.credits = res.credits;
                    save(); render();
                    toast('Переселено ' + money(res.restored) + ' человек');
                }).catch(function () { toast('Сервер недоступен'); });
            };
        }

        var msg = document.getElementById('colony-msg');
        // если рынок уже загружен — покупаем через него (списывается и склад NPC)
        if (window.Market && typeof window.Market.trade === 'function') {
            window.Market.trade(kind, amount, true);
            if (typeof window.updateAuthUI === 'function') window.updateAuthUI();
            render();
            return;
        }
        var cost = Math.ceil(amount * (PRICE[kind] || 1));
        if ((u.credits || 0) < cost) {
            if (msg) msg.textContent = 'Не хватает кредитов: нужно ' + money(cost);
            return;
        }
        u.credits -= cost;
        u.resources = u.resources || {};
        u.resources[kind] = (u.resources[kind] || 0) + amount;
        save();
        if (msg) msg.textContent = 'Куплено ' + money(amount) + (kind === 'grain' ? ' кг зерна' : ' т воды') + ' за ' + money(cost) + ' кр';
        if (typeof window.updateAuthUI === 'function') window.updateAuthUI();
        render();
    }

    function found() {
        var u = user();
        if (!u) return;
        if ((u.credits || 0) < COST_FOUND) { toast('Нужно ' + money(COST_FOUND) + ' кр'); return; }
        var token = '';
        try { token = localStorage.getItem('galaktika_token') || ''; } catch (e) { token = ''; }

        function apply(colony, credits) {
            u.colony = colony;
            if (typeof credits === 'number') u.credits = credits;
            save();
            if (typeof window.updateAuthUI === 'function') window.updateAuthUI();
            toast('Колония основана');
            render();
        }

        if (token) {
            fetch('/api/colony/found', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Auth-Token': token }, body: '{}' })
                .then(function (r) { return r.json().catch(function () { return {}; }); })
                .then(function (r) {
                    if (r && r.colony) { apply(r.colony, r.credits); return; }
                    if (r && r.error) { toast(r.error); return; }
                    // сервер недоступен — локально
                    u.credits -= COST_FOUND;
                    apply(ColonyMath.create('kepler', 'Новый Кеплер'), u.credits);
                })
                .catch(function () {
                    u.credits -= COST_FOUND;
                    apply(ColonyMath.create('kepler', 'Новый Кеплер'), u.credits);
                });
            return;
        }
        u.credits -= COST_FOUND;
        apply(ColonyMath.create('kepler', 'Новый Кеплер'), u.credits);
    }

    window.Colony = {
        open: function () { modal().style.display = 'flex'; tick(true); render(); },
        close: function () { var m = document.getElementById('colony-modal'); if (m) m.style.display = 'none'; },
        tick: function () { return tick(false); },
        found: found
    };

    function addMenuButton() {
        var items = document.getElementById('left-menu-items');
        if (!items || document.getElementById('colony-menu-btn')) return;
        var b = document.createElement('button');
        b.id = 'colony-menu-btn';
        b.className = 'menu-btn';
        b.textContent = '🏙 Колония';
        b.onclick = function () { window.Colony.open(); };
        items.appendChild(b);
    }

    function boot() {
        addMenuButton();
        tick(true);
        setInterval(function () { tick(true); }, 60000);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
})();
