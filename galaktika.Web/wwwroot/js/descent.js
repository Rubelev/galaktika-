// Переход с глобуса на планетарный вид: колесиком (приближение) и кнопкой.
// Работает поверх solar.js: смотрит, над какой планетой курсор, и даёт «спуск».
(function () {
    'use strict';

    // какие тела умеют показывать планетарный вид
    var PLANET_MAP = {
        earth: 'earth', mars: 'mars', venus: 'venus', mercury: 'mercury',
        jupiter: 'jupiter', saturn: 'saturn', uranus: 'uranus',
        neptune: 'neptune', pluto: 'pluto'
    };
    var MOON_MAP = {
        'луна': 'moon', 'фобос': 'phobos', 'деймос': 'deimos',
        'ио': 'io', 'европа': 'europa', 'ганимед': 'ganymede', 'каллисто': 'callisto',
        'мимас': 'mimas', 'энцелад': 'enceladus', 'тефия': 'tethys', 'диона': 'dione',
        'рея': 'rhea', 'япет': 'iapetus', 'титан': 'titan',
        'миранда': 'miranda', 'ариэль': 'ariel', 'умбриэль': 'umbriel',
        'титания': 'titania', 'оберон': 'oberon',
        'протей': 'proteus', 'тритон': 'triton', 'нереида': 'nereid',
        'харон': 'charon'
    };

    // винительный падеж: «Спуститься на Землю», а не «на Земля»
    var ACCUSATIVE = {
        'земля': 'Землю', 'луна': 'Луну', 'марс': 'Марс', 'венера': 'Венеру',
        'меркурий': 'Меркурий', 'юпитер': 'Юпитер', 'сатурн': 'Сатурн',
        'уран': 'Уран', 'нептун': 'Нептун', 'плутон': 'Плутон',
        'титан': 'Титан', 'европа': 'Европу', 'ио': 'Ио', 'ганимед': 'Ганимед',
        'каллисто': 'Каллисто', 'мимас': 'Мимас', 'энцелад': 'Энцелад',
        'тефия': 'Тефию', 'диона': 'Диону', 'рея': 'Рею', 'япет': 'Япет',
        'миранда': 'Миранду', 'ариэль': 'Ариэль', 'умбриэль': 'Умбриэль',
        'титания': 'Титанию', 'оберон': 'Оберон', 'протей': 'Протея',
        'тритон': 'Тритон', 'нереида': 'Нереиду', 'харон': 'Харон',
        'фобос': 'Фобос', 'деймос': 'Деймос'
    };

    function accusative(name) {
        if (!name) return '';
        return ACCUSATIVE[name.toLowerCase()] || name;
    }

    var btn = null;
    var hover = { world: null, name: '' };
    var wheelCount = 0, wheelTimer = 0, lastWorld = null;
    var busy = false;

    function hasOverlay() {
        return !!(document.getElementById('blocks3d-wrap') || document.getElementById('pv-bar') ||
            document.getElementById('design-wrap') || document.getElementById('cg-wrap') ||
            document.getElementById('build-wrap') || document.getElementById('rq-wrap'));
    }

    function worldOf(el) {
        if (!el || !el.closest) return null;
        var moon = el.closest('.moon');
        if (moon) {
            var name = (moon.getAttribute('data-moon') || '').toLowerCase();
            if (MOON_MAP[name]) return { world: MOON_MAP[name], name: moon.getAttribute('data-moon') };
            return null;
        }
        var planet = el.closest('.planet');
        if (planet) {
            var id = (planet.getAttribute('data-planet-id') || '').toLowerCase();
            if (PLANET_MAP[id]) {
                var tip = planet.querySelector('.tooltip');
                return { world: PLANET_MAP[id], name: tip ? tip.textContent : id };
            }
        }
        return null;
    }

    function makeButton() {
        if (btn) return btn;
        btn = document.createElement('button');
        btn.id = 'descent-btn';
        btn.style.cssText = 'position:fixed;bottom:22px;left:50%;transform:translateX(-50%) translateY(20px);' +
            'z-index:9600;padding:11px 20px;border:4px solid #0a0e12;border-radius:14px;cursor:pointer;' +
            'font:800 14px Inter,system-ui,sans-serif;color:#04223a;background:linear-gradient(#8fd6ff,#2f9fe0);' +
            'box-shadow:0 6px 0 #0a0e12;opacity:0;pointer-events:none;transition:opacity .2s,transform .2s';
        btn.onclick = function () { if (hover.world) descend(hover.world, hover.name); };
        document.body.appendChild(btn);
        return btn;
    }

    function showButton(info) {
        var b = makeButton();
        b.textContent = '⬇ Спуститься на ' + accusative(info.name || 'планету') + '  (клик по планете)';
        b.style.opacity = '1';
        b.style.pointerEvents = 'auto';
        b.style.transform = 'translateX(-50%) translateY(0)';
    }

    function hideButton() {
        if (!btn) return;
        btn.style.opacity = '0';
        btn.style.pointerEvents = 'none';
        btn.style.transform = 'translateX(-50%) translateY(20px)';
    }

    function descend(world, name) {
        if (busy || hasOverlay()) return;
        if (!window.PlanetView || typeof window.PlanetView.open !== 'function') return;
        busy = true;
        hideButton();
        try {
            window.PlanetView.open(world);
        } catch (e) {
            busy = false;
            return;
        }
        setTimeout(function () { busy = false; }, 1200);
    }

    document.addEventListener('mousemove', function (e) {
        if (hasOverlay()) { hideButton(); return; }
        var info = worldOf(e.target);
        if (info) {
            hover = info;
            showButton(info);
        } else {
            hover = { world: null, name: '' };
            hideButton();
        }
    }, { passive: true });

    // клик по глобусу = спуск на планету (как «нажать» на неё)
    var downX = 0, downY = 0, downT = 0;
    var clickTimer = null;          // отложенный спуск: даём шанс второму клику
    var lastClickAt = 0;
    var DOUBLE_MS = 320;

    document.addEventListener('pointerdown', function (e) {
        downX = e.clientX; downY = e.clientY; downT = Date.now();
    }, { passive: true });

    document.addEventListener('click', function (e) {
        if (hasOverlay()) return;
        if (e.target.closest && (e.target.closest('.control-panel') || e.target.closest('.legend-overlay') ||
            e.target.closest('[id$="-modal"]') || e.target.closest('.panel') ||
            e.target.closest('.left-menu') || e.target.closest('#descent-btn') ||
            e.target.closest('.ship-marker--traffic'))) return;
        // отсекаем перетаскивание камеры и долгие нажатия
        if (Math.abs(e.clientX - downX) > 6 || Math.abs(e.clientY - downY) > 6) return;
        if (Date.now() - downT > 700) return;
        var info = worldOf(e.target);
        if (!info) return;

        // Клик по планете больше НЕ спускает на поверхность: иначе первый клик
        // из двойного уводил в планетарный вид и глобус не открывался.
        // Спуск — только кнопкой «⬇ Спуститься на планетарный вид» или из меню.
        if (!e.target.closest || !e.target.closest('#descent-btn')) return;

        var now = Date.now();
        if (now - lastClickAt < DOUBLE_MS) {
            lastClickAt = 0;
            if (clickTimer) { clearTimeout(clickTimer); clickTimer = null; }
            return;
        }
        lastClickAt = now;
        if (clickTimer) { clearTimeout(clickTimer); clickTimer = null; }
        var world = info.world, name = info.name;
        clickTimer = setTimeout(function () {
            clickTimer = null;
            lastClickAt = 0;
            descend(world, name);
        }, DOUBLE_MS);
    });

    // колесико: приближение над планетой = спуск
    window.addEventListener('wheel', function (e) {
        if (e.target.closest && (e.target.closest('.control-panel') || e.target.closest('.legend-overlay') ||
            e.target.closest('[id$="-modal"]') || e.target.closest('.panel') || e.target.closest('.left-menu'))) return;
        if (hasOverlay()) return;
        var info = worldOf(e.target);
        if (!info) { wheelCount = 0; return; }
        if (e.deltaY >= 0) {                    // отдаление — не спускаемся
            wheelCount = 0;
            return;
        }
        // считаем подряд идущие «приближения» над одной планетой
        if (lastWorld !== info.world) { lastWorld = info.world; wheelCount = 0; }
        wheelCount++;
        clearTimeout(wheelTimer);
        wheelTimer = setTimeout(function () { wheelCount = 0; }, 900);
        if (wheelCount >= 3) {
            wheelCount = 0;
            descend(info.world, info.name);
        }
    }, { passive: true });

    // демо-режим для скриншота: ?descent=1
    if (/[?&]descent=1/.test(location.search)) {
        var st = document.createElement('style');
        st.textContent = '#welcome-screen,#auth-overlay,#legend-overlay,#tut-modal{display:none !important}';
        document.head.appendChild(st);
        setTimeout(function () {
            ['welcome-screen', 'auth-overlay'].forEach(function (id) {
                var n = document.getElementById(id);
                if (n) n.style.display = 'none';
            });
            hover = { world: 'earth', name: 'Земля' };
            showButton(hover);
        }, 1500);
    }

    window.Descent = { descend: descend, worldOf: worldOf };
})();
