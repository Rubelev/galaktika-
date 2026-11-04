// Телефонная подгонка: панели и формы не должны вылезать за экран.
// Работает поверх любых инлайновых стилей — выставляет размеры напрямую.
(function () {
    'use strict';

    var SAFE = /[?&]safe=1/.test(location.search);
    if (SAFE) return;

    var SELECTORS = [
        '#welcome-screen', '.auth-container', '.market-modal-content', '.fleet-modal-content',
        '.quest-modal-content', '.codex-modal-content', '.admin-modal-content', '.chat-panel',
        '.settings-card', '.resources-panel', '.user-list-modal', '.mentor-box', '.rbx-card',
        '#tut-modal > div', '[id$="-modal"] > div'
    ];

    function isPhone() { return window.innerWidth <= 760; }

    function fixNode(el) {
        var w = Math.min(window.innerWidth - 24, Math.floor(window.innerWidth * 0.94));
        el.style.setProperty('width', w + 'px', 'important');
        el.style.setProperty('max-width', w + 'px', 'important');
        el.style.setProperty('box-sizing', 'border-box', 'important');
        el.style.setProperty('overflow-x', 'hidden', 'important');
        el.style.setProperty('left', 'auto', 'important');
        el.style.setProperty('right', 'auto', 'important');
        if (el.id === 'welcome-screen') {
            el.style.setProperty('margin', '12px auto', 'important');
            el.style.setProperty('position', 'relative', 'important');
            el.style.setProperty('transform', 'none', 'important');
        }
        var maxH = Math.floor(window.innerHeight * 0.88);
        if (!el.classList.contains('auth-container') && el.id !== 'welcome-screen') {
            el.style.setProperty('max-height', maxH + 'px', 'important');
            el.style.setProperty('overflow-y', 'auto', 'important');
        }
    }

    function fixAll() {
        if (!isPhone()) return;
        SELECTORS.forEach(function (sel) {
            var nodes;
            try { nodes = document.querySelectorAll(sel); } catch (e) { return; }
            Array.prototype.forEach.call(nodes, fixNode);
        });
        document.documentElement.style.setProperty('overflow-x', 'hidden', 'important');
        document.body.style.setProperty('overflow-x', 'hidden', 'important');
        // чат на телефоне — почти на весь экран
        var chat = document.querySelector('.chat-panel');
        if (chat) chat.style.setProperty('height', Math.floor(window.innerHeight * 0.78) + 'px', 'important');
    }

    var raf = null;
    function schedule() {
        if (raf) return;
        raf = requestAnimationFrame(function () { raf = null; fixAll(); });
    }

    window.addEventListener('resize', schedule);
    window.addEventListener('orientationchange', schedule);
    document.addEventListener('DOMContentLoaded', function () {
        schedule();
        setTimeout(schedule, 900);
        setTimeout(schedule, 2200);
    });
    // новые окна появляются динамически — догоняем их
    setInterval(schedule, 1500);

    window.MobileFix = { run: fixAll };

    // ?probe=1 — диагностика: пишем размеры в заголовок и плашку
    if (/[?&]probe=1/.test(location.search)) {
        setTimeout(function () {
            var w = document.getElementById('welcome-screen');
            var info = 'vw=' + window.innerWidth + ' vh=' + window.innerHeight
                + ' welcome=' + (w ? Math.round(w.getBoundingClientRect().width) : 'none')
                + ' phone=' + isPhone();
            document.title = info;
            var box = document.createElement('div');
            box.id = 'probe-out';
            box.textContent = info;
            box.style.cssText = 'position:fixed;left:0;top:0;z-index:99999;background:#000;color:#0f0;font:12px monospace;padding:4px';
            document.body.appendChild(box);
        }, 3000);
    }
})();
