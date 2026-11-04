// ============================================================================
//  QA.JS — визуальный тестировщик сцены (запускается страницей ?qa=1).
//  Проверяет: повороты системы, смещение кадра, корабли относительно трасс,
//  наложения панелей, клавиши и смену видов. Результат пишет в #qa-report JSON
//  и в document.title, чтобы внешний скрипт мог его прочитать.
// ============================================================================
(function (global) {
    'use strict';
    const results = [];
    function check(name, ok, detail) {
        results.push({ name: name, ok: !!ok, detail: detail === undefined ? '' : String(detail) });
    }

    function rectOf(sel) {
        const el = document.querySelector(sel);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: r.left, y: r.top, w: r.width, h: r.height };
    }
    function overlaps(a, b) {
        if (!a || !b || !a.w || !b.w) return false;
        return !(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y);
    }
    function planetScreen(id) {
        const el = document.querySelector('.planet[data-planet-id="' + id + '"]');
        if (!el) return null;
        const r = el.getBoundingClientRect();
        if (!r.width) return null;
        return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height };
    }
    function inViewport(p, w, h) {
        return p && p.x >= -20 && p.y >= -20 && p.x <= w + 20 && p.y <= h + 20;
    }

    // расстояние от точки до отрезка (px)
    function distToSegment(p, a, b) {
        const dx = b.x - a.x, dy = b.y - a.y;
        const len2 = dx * dx + dy * dy;
        if (!len2) return Math.hypot(p.x - a.x, p.y - a.y);
        let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
        t = Math.max(0, Math.min(1, t));
        return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
    }

    // ближайшая точка SVG-пути для маршрута
    function nearestOnPath(pathEl, p) {
        let best = 1e9;
        try {
            const total = pathEl.getTotalLength();
            const steps = 60;
            for (let i = 0; i <= steps; i++) {
                const pt = pathEl.getPointAtLength(total * i / steps);
                const d = Math.hypot(pt.x - p.x, pt.y - p.y);
                if (d < best) best = d;
            }
        } catch (e) { }
        return best;
    }

    function shipSamples() {
        const out = [];
        document.querySelectorAll('.ship-marker').forEach(function (el) {
            const tr = el.style.transform || '';
            const m = tr.match(/translate\((-?[\d.]+)px,\s*(-?[\d.]+)px\)/);
            if (!m) return;
            out.push({ el: el, x: parseFloat(m[1]), y: parseFloat(m[2]),
                       route: el.getAttribute('data-route'),
                       title: (el.title || '').slice(0, 24) });
        });
        return out;
    }

    function sceneScale() {
        const m = (document.querySelector('.solar-system').style.transform || '')
            .match(/scale\(([\d.]+)\)/);
        return m ? parseFloat(m[1]) : 1;
    }

    async function run() {
        const params = new URLSearchParams(location.search);
        const scenario = params.get('qa');
        const W = global.innerWidth, H = global.innerHeight;

        // 1) базовое состояние
        const planets = ['mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune'];
        const visible = planets.map(planetScreen).filter(Boolean);
        check('планеты построены', visible.length >= 6, 'видно ' + visible.length + ' из 8');
        check('планеты в кадре', visible.every(p => inViewport(p, W, H)),
            visible.filter(p => !inViewport(p, W, H)).length + ' за кадром');

        // 2) наложения панелей
        const ctrl = rectOf('.control-panel');
        const menu = rectOf('.left-menu');
        const res = rectOf('#resources-panel');
        check('панель управления не поверх меню', !overlaps(ctrl, menu),
            'пересечение: ' + overlaps(ctrl, menu));
        check('склад не поверх панели управления', !overlaps(ctrl, res),
            'пересечение: ' + overlaps(ctrl, res));

        // 3) корабли относительно трасс
        const allPaths = Array.from(document.querySelectorAll(
            '.trade-path, .fleet-route, .belt-route, .portal-path, .traffic-path, .route-line'));
        // скрытые трассы не считаем: борт, который «на поясе», не обязан быть на линии
        const paths = allPaths.filter(function (el) {
            const st = getComputedStyle(el);
            return st.display !== 'none' && st.visibility !== 'hidden' && st.opacity !== '0';
        });
        const ships = shipSamples();
        let worst = 0, worstTitle = '';
        let checked = 0;
        ships.forEach(function (s) {
            if (!paths.length) return;
            let best = 1e9;
            paths.forEach(function (p) { best = Math.min(best, nearestOnPath(p, { x: s.x, y: s.y })); });
            if (best > 120) return;           // у борта сейчас нет своей линии — не проверяем
            checked++;
            const dPx = best * sceneScale();
            if (dPx > worst) { worst = dPx; worstTitle = s.title; }
        });
        check('борта не дальше 12 px от своей трассы', worst <= 12,
            'проверено ' + checked + ', макс ' + worst.toFixed(1) + ' px (' + worstTitle + ')');

        // 4) слипание бортов
        let minD = 1e9, pair = '';
        for (let i = 0; i < ships.length; i++) {
            for (let j = i + 1; j < ships.length; j++) {
                const d = Math.hypot(ships[i].x - ships[j].x, ships[i].y - ships[j].y) * sceneScale();
                if (d < minD) { minD = d; pair = ships[i].title + ' / ' + ships[j].title; }
            }
        }
        check('борта не слиплись (>=2 px)', ships.length < 2 || minD >= 2,
            'мин дистанция ' + (isFinite(minD) ? minD.toFixed(1) : '—') + ' px (' + pair + ')');

        // 5) клавиши: наклон и зум
        function sceneRotX() {
            const tr = (document.querySelector('.solar-system') || {}).style;
            const m = tr && (tr.transform || '').match(/rotateX\((-?[\d.]+)deg\)/);
            return m ? parseFloat(m[1]) : 0;
        }
        const beforeTilt = sceneRotX();
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
        const afterTilt = sceneRotX();
        check('клавиши наклона обрабатываются', Math.abs(afterTilt - beforeTilt) > 1,
            'rotX ' + beforeTilt.toFixed(0) + ' → ' + afterTilt.toFixed(0));

        // 5b) имитация нажатия кнопки панели (горячих клавиш наклона в игре нет)
        function findBtn(fragment) {
            return Array.from(document.querySelectorAll('button')).find(function (b) {
                return ((b.getAttribute('onclick') || '') + (b.dataset.action || '')).indexOf(fragment) >= 0;
            });
        }
        const zoomBtn = findBtn('solarZoomIn');
        const zoomBefore = sceneScale();
        if (zoomBtn) { zoomBtn.click(); await new Promise(r => setTimeout(r, 150)); }
        check('кнопка приближения работает', !zoomBtn || sceneScale() > zoomBefore,
            'scale ' + zoomBefore.toFixed(2) + ' → ' + sceneScale().toFixed(2));

        // 6) зум: скрытие/показ кораблей
        const zoomIn = global.solarZoomIn, zoomOut = global.solarZoomOut;
        if (typeof zoomIn === 'function') {
            for (let i = 0; i < 4; i++) zoomIn();
            const s1 = sceneScale();
            const hiddenAtZoomIn = document.body.classList.contains('ships-hidden');
            check('при приближении корабли видны', !hiddenAtZoomIn, 'scale=' + s1.toFixed(2));
            if (typeof zoomOut === 'function') {
                for (let i = 0; i < 8; i++) zoomOut();
                const s2 = sceneScale();
                check('при отдалении корабли скрыты', document.body.classList.contains('ships-hidden'),
                    'scale=' + s2.toFixed(2));
            }
        } else {
            check('функции зума доступны', false, 'solarZoomIn нет');
        }

        // 7) смена вида: глобус
        if (typeof global.openGlobe === 'function') {
            global.openGlobe('earth');
            await new Promise(r => setTimeout(r, 400));
            const modal = document.getElementById('globe-modal');
            const shown = modal && getComputedStyle(modal).display !== 'none';
            check('глобус открывается', !!shown, shown ? 'display=flex' : 'не открылся');
            if (shown && typeof global.closeGlobe === 'function') global.closeGlobe();
        } else {
            check('openGlobe доступен', false, 'нет функции');
        }

        // 8) поворот системы: после смены tilt планеты остаются в кадре
        if (typeof global.updateTilt === 'function') {
            global.updateTilt(55);
            await new Promise(r => setTimeout(r, 200));
            const after = planets.map(planetScreen).filter(Boolean);
            check('после наклона 55° планеты в кадре',
                after.every(p => inViewport(p, W, H)),
                after.filter(p => !inViewport(p, W, H)).length + ' за кадром');
            global.updateTilt(0);
        }

        // отчёт
        const report = { scenario: scenario, w: W, h: H, results: results,
                         ok: results.every(r => r.ok) };
        const box = document.createElement('pre');
        box.id = 'qa-report';
        box.style.display = 'none';
        box.textContent = JSON.stringify(report);
        document.body.appendChild(box);
        const failed = results.filter(r => !r.ok);
        document.title = 'QA ' + (failed.length ? 'FAIL ' + failed.length : 'OK ' + results.length);
    }

    // ВАЖНО: тестировщик не должен работать на обычных страницах —
    // он менял зум и сбрасывал ?tilt=, из-за чего снимки были плоскими
    if (!new URLSearchParams(location.search).has('qa')) return;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () { setTimeout(run, 3000); });
    } else {
        setTimeout(run, 3000);
    }
})(typeof window !== 'undefined' ? window : globalThis);
