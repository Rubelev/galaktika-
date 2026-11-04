// ============================================================================
//  PV-BOOT.JS — надёжный вход в планетарный вид по ссылке ?pv=<мир>.
//  Загружается ДО остальных модулей: сразу показывает экран загрузки,
//  скрывает карту и сам открывает поверхность, когда модуль готов.
// ============================================================================
(function (global) {
    'use strict';

    const params = new URLSearchParams(location.search);
    const pvId = params.get('pv');
    const legacyId = params.get('planet');
    const id = pvId || legacyId;
    if (!id) return;

    // точка на глобусе, по которой щёлкнули (lat/lon)
    const lat = parseFloat(params.get('lat'));
    const lon = parseFloat(params.get('lon'));
    if (isFinite(lat) && isFinite(lon)) window.__pvPoint = { lat: lat, lon: lon };

    window.__pvTab = true;
    document.documentElement.setAttribute('data-pv', id);

    function hideMap() {
        const sc = document.querySelector('.solar-system-container');
        if (sc) { sc.dataset.pvHidden = '1'; sc.style.display = 'none'; }
        document.body.classList.add('pv-mode');
        // меню и панели вселенной в PV не нужны
        document.querySelectorAll('.left-menu, .control-panel, #race-panel, .mentor-panel, #mentor-panel')
            .forEach(function (el) { if (el) el.style.display = 'none'; });
    }

    function loading() {
        if (document.getElementById('pv-loading')) return;
        const el = document.createElement('div');
        el.id = 'pv-loading';
        el.style.cssText = 'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;' +
            'flex-direction:column;gap:10px;background:#070b12;color:#cfe3ff;z-index:99998;' +
            'font:15px/1.5 Inter,system-ui,sans-serif;text-align:center';
        el.innerHTML = '<div style="font-size:18px">Загрузка планетарного вида</div>' +
            '<div style="opacity:.65;font-size:13px">мир: ' + id + ' · готовим поверхность и блоки…</div>';
        (document.body || document.documentElement).appendChild(el);
    }

    function surfaceReady() {
        return !!document.getElementById('blocks3d-wrap');
    }

    function fail(text) {
        const el = document.getElementById('pv-loading');
        if (!el) return;
        el.innerHTML = '<div style="font-size:18px">Планетарный вид не запустился</div>' +
            '<div style="opacity:.7;font-size:13px;max-width:460px">' + text + '</div>' +
            '<button onclick="location.reload()" style="margin-top:12px;padding:8px 16px;border-radius:8px;' +
            'border:none;background:#2ecc71;color:#04121f;font-weight:700;cursor:pointer">Обновить</button>';
    }

    let tries = 0, started = 0;
    function step() {
        hideMap();
        if (surfaceReady()) {
            // мало «узел есть»: ждём, пока 3D реально нарисует кадр,
            // иначе первый вход даёт чёрный кадр (8,6 % пикселей)
            const t0 = window.__pvReadyAt || (window.__pvReadyAt = Date.now());
            const canRemove = Date.now() - t0 > 1200;
            if (canRemove) {
                const el = document.getElementById('pv-loading');
                if (el) el.remove();
                return;
            }
            setTimeout(step, 200);
            return;
        }
        // пробуем открыть вид, как только модуль появился
        if (tries === 6 && !started && global.PlanetView && typeof global.PlanetView.open === 'function') {
            started = 1;
            try { global.PlanetView.open(id, global.__pvPoint || null); } catch (e) { }
        }
        tries++;
        // повторные попытки: модуль 3D может подгружаться дольше
        if ((tries === 15 || tries === 35) && !surfaceReady() && global.PlanetView &&
            typeof global.PlanetView.open === 'function') {
            try { global.PlanetView.open(id, global.__pvPoint || null); } catch (e) { }
        }
        if (tries === 75 && !surfaceReady()) {
            let webgl = false;
            try {
                const c = document.createElement('canvas');
                webgl = !!(c.getContext('webgl2') || c.getContext('webgl'));
            } catch (e) { }
            const stepName = global.__pvStep || 'нет шага';
            const err = global.__pvErr || '';
            fail('Причина: ' + stepName + (err ? ' · ' + err : '') +
                 '<br>WebGL: ' + (webgl ? 'есть' : 'НЕТ') +
                 '<br>Проверьте chrome://gpu и обновите страницу.');
            try {
                fetch('/api/clientlog', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        msg: 'pv-fail: ' + stepName + (err ? ' | ' + err : '') +
                             ' | webgl=' + webgl + ' | id=' + id,
                        src: 'pv-boot', line: 0, stack: '', url: location.href
                    })
                });
            } catch (e) { }
            return;
        }
        setTimeout(step, 400);
    }

    // «↑ К глобусу»: жёсткая очистка. Раньше 3D-слой и панель оставались
    // поверх карты, а глобус не открывался (8 из 8 тел).
    function backToGlobe() {
        window.__pvUserExit = true;
        window.__pvOpenedAt = 0;
        ['blocks3d-wrap', 'pv-bar', 'pv-fly', 'pv-loading', 'pv-hud'].forEach(function (id) {
            const el = document.getElementById(id);
            if (el && el.parentNode) el.parentNode.removeChild(el);
        });
        document.body.classList.remove('pv-mode');
        document.body.classList.remove('descent-mode');
        const sc = document.querySelector('.solar-system-container');
        if (sc) { sc.style.display = ''; delete sc.dataset.pvHidden; }
        document.querySelectorAll('.left-menu, .control-panel').forEach(function (el) {
            if (el) el.style.display = '';
        });
        if (typeof window.solarReset === 'function') window.solarReset();
        if (typeof window.openGlobe === 'function') {
            try { window.openGlobe(id); } catch (e) { }
        } else {
            location.href = location.pathname + '?dbl=' + encodeURIComponent(id);
        }
    }
    window.__pvBack = backToGlobe;

    document.addEventListener('click', function (ev) {
        const t = ev.target;
        if (!t || !t.closest) return;
        const btn = t.closest('#pv-bar button, .pv-btn');
        if (!btn) return;
        const txt = (btn.textContent || '');
        if (txt.indexOf('глобус') < 0 && txt.indexOf('↑') < 0) return;
        ev.preventDefault();
        ev.stopPropagation();
        backToGlobe();
    }, true);

    // На странице планетарного вида никакие окна вселенной не нужны:
    // раньше поверх PV открывалась «Биржа» (её звал наставник/онбординг).
    function killGameUi() {
        document.querySelectorAll('[id],[class]').forEach(function (el) {
            if (!el || el === document.body) return;
            const tag = ((el.id || '') + ' ' + (el.className || '')).toLowerCase();
            if (/market|birge|exchange|mentor|tutor|onboard|tut-modal|focus-modal|infopanel/.test(tag)) {
                el.style.display = 'none';
                el.style.visibility = 'hidden';
                el.style.pointerEvents = 'none';
            }
        });
        try {
            if (global.Market && typeof global.Market.close === 'function') global.Market.close();
        } catch (e) { }
    }

    setInterval(function () {
        if (document.body.classList.contains('pv-mode')) return;
        const wrap = document.getElementById('blocks3d-wrap');
        const bar = document.getElementById('pv-bar');
        if (wrap && wrap.parentNode) wrap.parentNode.removeChild(wrap);
        if (bar && bar.parentNode) bar.parentNode.removeChild(bar);
        const sc = document.querySelector('.solar-system-container');
        if (sc && sc.dataset.pvHidden) { sc.style.display = ''; delete sc.dataset.pvHidden; }
    }, 600);

    function boot() {
        hideMap();
        loading();
        killGameUi();
        setInterval(killGameUi, 1500);
        step();
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
})(typeof window !== 'undefined' ? window : globalThis);
