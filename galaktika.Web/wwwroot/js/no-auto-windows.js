// ============================================================================
//  NO-AUTO-WINDOWS.JS — окна вселенной открываются ТОЛЬКО по действию игрока.
//  Игрок жаловался: «биржа открывается, просят её или нет». Теперь любой
//  вызов open* без свежего клика/нажатия клавиши игнорируется, а попытка
//  пишется в журнал клиента вместе со стеком — чтобы найти виновника.
// ============================================================================
(function (global) {
    'use strict';

    let gestureAt = 0, lastTarget = null;
    function markGesture(ev) {
        gestureAt = Date.now();
        lastTarget = (ev && ev.target) || null;
    }
    ['pointerdown', 'keydown', 'touchstart', 'wheel'].forEach(function (ev) {
        global.addEventListener(ev, markGesture, true);
    });

    const GUARDED = ['Market', 'Trade', 'BuildPanel', 'Colony', 'Fleet', 'Lease'];

    function report(name, stack) {
        try {
            fetch('/api/clientlog', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    msg: 'auto-open blocked: ' + name,
                    src: 'no-auto-windows', line: 0,
                    stack: String(stack || '').slice(0, 900),
                    url: location.href
                })
            });
        } catch (e) { }
    }

    function guard(objName) {
        const obj = global[objName];
        if (!obj || typeof obj.open !== 'function' || obj.__guarded) return;
        const orig = obj.open.bind(obj);
        obj.open = function () {
            // открываем ТОЛЬКО если последний клик был по кнопке этого окна
            let byButton = false;
            try {
                const t = lastTarget && lastTarget.closest ? lastTarget.closest('button, a, [onclick]') : null;
                if (t) {
                    const sig = ((t.textContent || '') + ' ' + (t.getAttribute('onclick') || '') +
                                 ' ' + (t.id || '') + ' ' + (t.className || '')).toLowerCase();
                    byButton = /бирж|market|торг|trade/.test(sig);
                }
            } catch (e) { }
            const byGesture = Date.now() - gestureAt < 1500 && byButton;
            if (!byGesture) {
                report(objName + '.open', new Error('no gesture').stack);
                return null;      // молча не открываем
            }
            return orig.apply(null, arguments);
        };
        obj.__guarded = true;
    }

    function guardAll() {
        GUARDED.forEach(guard);
        // функции-обёртки
        ['openMarket', 'openFleet', 'openResourcesPanel'].forEach(function (fn) {
            const f = global[fn];
            if (typeof f !== 'function' || f.__guarded) return;
            const wrapped = function () {
                if (Date.now() - gestureAt >= 1500) {
                    report(fn, new Error('no gesture').stack);
                    return null;
                }
                return f.apply(null, arguments);
            };
            wrapped.__guarded = true;
            global[fn] = wrapped;
        });
    }

    let tries = 0;
    const t = setInterval(function () {
        guardAll();
        if (++tries > 40) clearInterval(t);
    }, 250);

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', guardAll);
    else guardAll();
})(typeof window !== 'undefined' ? window : globalThis);
