// ============================================================================
//  LORE-RACE.JS — «Система Гонок»: у каждой луны своя роль, раз в 6 игровых
//  часов идёт заезд на выживание. Легенда: docs/LORE-RACES.md
//  Здесь только витрина: роли лун, расписание и панель ближайшего заезда.
// ============================================================================
(function (global) {
    'use strict';

    const ARENA_NAME = 'Адрастея';           // луна-арена (можно заменить, когда определимся)

    // роли: по имени луны, иначе — по порядку
    const ROLES = {
        'адрастея': { role: 'arena', label: 'Арена гонок', color: '#ffd166' },
        'титан': { role: 'factory', label: 'Завод двигателей', color: '#8fd6ff' },
        'европа': { role: 'factory', label: 'Завод корпусов', color: '#8fd6ff' },
        'ио': { role: 'factory', label: 'Завод расходников', color: '#8fd6ff' },
        'ганимед': { role: 'workshop', label: 'Мастерская ремонта', color: '#8fe3a8' },
        'каллисто': { role: 'workshop', label: 'Мастерская брони', color: '#8fe3a8' },
        'луна': { role: 'workshop', label: 'Мастерская «Старая Луна»', color: '#8fe3a8' },
        'фобос': { role: 'scrapyard', label: 'Свалка обломков', color: '#c9a3ff' },
        'деймос': { role: 'scrapyard', label: 'Скупка металла', color: '#c9a3ff' },
        'тритон': { role: 'betting', label: 'Ставки и тотализатор', color: '#ffb4a2' },
        'харон': { role: 'betting', label: 'Букмекерская контора', color: '#ffb4a2' },
        'миранда': { role: 'factory', label: 'Сборочный цех', color: '#8fd6ff' },
        'оберон': { role: 'workshop', label: 'Ремонт двигателей', color: '#8fe3a8' },
        'титания': { role: 'factory', label: 'Литьё корпусов', color: '#8fd6ff' },
        'ариэль': { role: 'workshop', label: 'Мастерская «Тихий док»', color: '#8fe3a8' }
    };

    const PERIOD_MS = 6 * 3600 * 1000;       // заезд каждые 6 игровых часов
    const RACE_MS = 40 * 60 * 1000;          // сам заезд 40 минут
    const GATHER_MS = 10 * 60 * 1000;        // сбор перед стартом

    function roleOf(name) {
        const key = (name || '').toLowerCase();
        for (const k in ROLES) if (key.indexOf(k) >= 0) return ROLES[k];
        return null;
    }

    function fmt(ms) {
        const s = Math.max(0, Math.round(ms / 1000));
        const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
        return (h ? h + ' ч ' : '') + m + ' мин ' + String(ss).padStart(2, '0') + ' с';
    }

    function phase(now) {
        const p = ((now % PERIOD_MS) + PERIOD_MS) % PERIOD_MS;
        const toRace = PERIOD_MS - p;
        if (toRace <= GATHER_MS) return { name: 'сбор', left: toRace, cls: 'gather' };
        if (p < RACE_MS) return { name: 'заезд', left: RACE_MS - p, cls: 'race' };
        return { name: 'ожидание', left: toRace, cls: 'wait' };
    }

    function ensurePanel() {
        if (document.getElementById('race-panel')) return document.getElementById('race-panel');
        const el = document.createElement('div');
        el.id = 'race-panel';
        el.style.cssText = 'position:fixed;left:330px;bottom:16px;z-index:10002;width:280px;padding:12px 14px;' +
            'border-radius:14px;background:rgba(12,20,34,0.86);border:1px solid rgba(255,209,102,0.35);' +
            'color:#dfe8f5;font:12px/1.5 Inter,system-ui,sans-serif;backdrop-filter:blur(8px)';
        el.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center">' +
            '<b style="color:#ffd166;letter-spacing:.4px">🏁 ГОНКИ НА ВЫЖИВАНИЕ</b>' +
            '<span id="race-phase" style="font-size:11px;opacity:.85"></span></div>' +
            '<div id="race-arena" style="margin-top:6px;opacity:.85;font-size:11px"></div>' +
            '<div id="race-timer" style="font-size:20px;margin-top:4px;font-variant-numeric:tabular-nums"></div>' +
            '<div id="race-legend" style="margin-top:6px;font-size:11px;line-height:1.7"></div>';
        document.body.appendChild(el);
        return el;
    }

    let rolesPainted = 0;
    function paintRoles(force) {
        if (!force && rolesPainted && Date.now() - rolesPainted < 15000) return;
        rolesPainted = Date.now();
        const moons = document.querySelectorAll('.moon');
        let factories = 0, workshops = 0, bets = 0, junk = 0;
        moons.forEach(function (m) {
            const name = m.getAttribute('data-moon') || m.title || '';
            const r = roleOf(name);
            if (!r) return;
            m.title = (name ? name + ' · ' : '') + r.label;
            m.dataset.role = r.role;
            if (!m.dataset.roleGlow) { m.dataset.roleGlow = '1'; }   // без filter: он тормозил отрисовку планет
            if (r.role === 'factory') factories++;
            else if (r.role === 'workshop') workshops++;
            else if (r.role === 'betting') bets++;
            else if (r.role === 'scrapyard') junk++;
        });
        const legend = document.getElementById('race-legend');
        if (legend) {
            legend.innerHTML =
                '<span style="color:#ffd166">●</span> арена · ' +
                '<span style="color:#8fd6ff">●</span> заводов ' + factories + ' · ' +
                '<span style="color:#8fe3a8">●</span> мастерских ' + workshops + ' · ' +
                '<span style="color:#c9a3ff">●</span> свалок ' + junk + ' · ' +
                '<span style="color:#ffb4a2">●</span> ставок ' + bets;
        }
    }

    function tick() {
        const el = ensurePanel();
        const now = (typeof global.simulatedTime === 'number') ? global.simulatedTime : Date.now();
        const ph = phase(now);
        const phEl = document.getElementById('race-phase');
        if (phEl) {
            phEl.textContent = ph.name.toUpperCase();
            phEl.style.color = ph.cls === 'race' ? '#ff8a8a' : (ph.cls === 'gather' ? '#ffd166' : '#8ab4f8');
        }
        const arena = document.getElementById('race-arena');
        if (arena) arena.textContent = 'трасса: ' + ARENA_NAME + ' · 3 круга по кольцам';
        const timer = document.getElementById('race-timer');
        if (timer) {
            timer.textContent = (ph.cls === 'race' ? 'до финиша ' : 'до старта ') + fmt(ph.left);
            timer.style.color = ph.cls === 'race' ? '#ff8a8a' : '#ffd166';
        }
        paintRoles();
    }

    function boot() {
        const q = new URLSearchParams(location.search);
        if (q.has('pv') || q.has('planet') || q.has('war') || q.has('garage')) return;
        if (!document.querySelector('.solar-system')) return;
        tick();
        setInterval(function () { if (!document.hidden) tick(); }, 2000);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(boot, 2000); });
    else setTimeout(boot, 2000);
})(typeof window !== 'undefined' ? window : globalThis);
