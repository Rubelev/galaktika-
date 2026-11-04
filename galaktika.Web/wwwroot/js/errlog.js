// Ловим ошибки на клиенте: отправляем на сервер и показываем понятное сообщение
// вместо белого экрана.
(function () {
    'use strict';

    var sent = 0;

    function report(msg, src, line, stack) {
        if (sent >= 5) return;      // не заваливаем сервер
        sent++;
        try {
            fetch('/api/clientlog', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    msg: String(msg || 'unknown'),
                    src: String(src || ''),
                    line: line || 0,
                    stack: String(stack || ''),
                    url: location.href
                }),
                keepalive: true
            }).catch(function () { });
        } catch (e) { }
    }

    function banner(text) {
        if (document.getElementById('load-error')) return;
        var el = document.createElement('div');
        el.id = 'load-error';
        el.style.cssText = 'position:fixed;left:50%;top:14px;transform:translateX(-50%);z-index:99999;' +
            'max-width:92vw;padding:12px 16px;border-radius:10px;background:#2a0f14;border:1px solid #7a2230;' +
            'color:#ffd9de;font:13px/1.4 Inter,system-ui,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.5);';
        el.innerHTML = '<b>Не удалось загрузить игру.</b><br>' +
            '<span style="opacity:.85;">' + text + '</span><br>' +
            '<span style="opacity:.6;font-size:12px;">Обновите страницу (Ctrl+F5). Если не помогло — напишите через «💡 Пожелания».</span>';
        document.body.appendChild(el);
        setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 20000);
    }

    window.addEventListener('error', function (e) {
        if (!e || !e.message) return;
        report(e.message, e.filename, e.lineno, e.error && e.error.stack);
    });

    window.addEventListener('unhandledrejection', function (e) {
        var r = e && e.reason;
        report((r && (r.message || r)) || 'promise rejection', '', 0, r && r.stack);
    });

    // какие модули должны быть загружены
    var EXPECTED = {
        solar: ['apiLogin', 'pullServerProfile', 'updateAuthUI', 'notify', 'startLegend'],
        colony: ['Colony'], chat: ['Chat'], build: ['BuildPanel'], quests: ['Quests'],
        lease: ['Lease'], moons: ['Moons'], mega: ['Mega'], stats: ['Stats'],
        social: ['Social'], feedback: ['Feedback'], lang: ['LANG'], market: ['Market']
    };

    function missingModules() {
        var missing = [];
        Object.keys(EXPECTED).forEach(function (mod) {
            var ok = EXPECTED[mod].every(function (key) { return typeof window[key] !== 'undefined'; });
            if (!ok) missing.push(mod);
        });
        return missing;
    }

    // Проверка «страница пустая» и «модуль не загрузился»
    window.addEventListener('load', function () {
        setTimeout(function () {
            function visible(id) {
                var el = document.getElementById(id);
                if (!el) return false;
                var st = getComputedStyle(el);
                return st.display !== 'none' && st.visibility !== 'hidden' && el.getBoundingClientRect().height > 40;
            }
            // В планетарном виде меню и карта скрыты — это норма, а не «пустая страница».
            var anyCanvas = Array.prototype.some.call(document.querySelectorAll('canvas'), function (c) {
                return c.getBoundingClientRect().height > 100;
            });
            var qp = new URLSearchParams(location.search);
            var pvTab = document.body.classList.contains('pv-mode') || qp.has('pv') ||
                        qp.has('quest') || qp.has('war') || qp.has('garage') || qp.has('spec') || qp.has('sys') || qp.has('sandbox');
            var hasGame = pvTab || visible('auth-overlay') || visible('left-menu') ||
                !!document.getElementById('blocks3d-wrap') || anyCanvas;
            var missing = missingModules();
            if (missing.length) {
                report('modules not loaded: ' + missing.join(','), 'boot-check', 0, '');
                if (!hasGame) banner('Не загрузились модули: ' + missing.join(', '));
            } else if (!hasGame) {
                banner('Интерфейс не отрисовался.');
            }
        }, 7000);
    });
})();

/* boot ok */
window.__booted = true;
