// ============================================================================
//  PERF-PROBE.JS — замер производительности на живом кадре.
//  Открывается по ?perf2=1: показывает FPS, худший кадр, длинные задачи,
//  число узлов DOM и стилевых пересчётов, обновляя цифры раз в секунду.
// ============================================================================
(function (global) {
    'use strict';
    if (!new URLSearchParams(location.search).has('perf2')) return;

    function boot() {
        const box = document.createElement('div');
        box.id = 'perf-probe';
        box.style.cssText = 'position:fixed;left:12px;top:12px;z-index:100000;padding:10px 12px;border-radius:10px;' +
            'background:rgba(8,14,24,.88);border:1px solid rgba(143,214,255,.35);color:#dfe8f5;' +
            'font:11px/1.55 ui-monospace,Consolas,monospace;white-space:pre;pointer-events:none';
        document.body.appendChild(box);

        let frames = 0, last = performance.now(), worst = 0, tickStart = performance.now();
        let longTasks = 0;
        try {
            if ('PerformanceObserver' in window) {
                new PerformanceObserver(function (list) {
                    longTasks += list.getEntries().length;
                }).observe({ entryTypes: ['longtask'] });
            }
        } catch (e) { }

        function frame(now) {
            frames++;
            const dt = now - last;
            last = now;
            if (dt > worst) worst = dt;
            requestAnimationFrame(frame);
        }
        requestAnimationFrame(frame);

        setInterval(function () {
            const now = performance.now();
            const elapsed = (now - tickStart) / 1000;
            const fps = frames / Math.max(0.001, elapsed);
            const nodes = document.getElementsByTagName('*').length;
            const markers = document.querySelectorAll('.ship-marker').length;
            const hidden = document.querySelectorAll('.ship-marker[style*="display: none"]').length;
            const canvases = document.querySelectorAll('canvas').length;
            box.textContent =
                'FPS: ' + fps.toFixed(1) + '   худший кадр: ' + worst.toFixed(0) + ' мс\n' +
                'длинных задач: ' + longTasks + '\n' +
                'DOM-узлов: ' + nodes + '   маркеров: ' + markers + ' (скрыто ' + hidden + ')\n' +
                'canvas-слоёв: ' + canvases + '   память: ' +
                ((performance.memory && (performance.memory.usedJSHeapSize / 1048576).toFixed(0) + ' МБ') || 'н/д');
            document.title = 'PERF fps=' + fps.toFixed(1) + ' worst=' + worst.toFixed(0) +
                ' long=' + longTasks + ' dom=' + nodes;
            frames = 0; worst = 0; longTasks = 0; tickStart = now;
        }, 1000);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(boot, 2500); });
    else setTimeout(boot, 2500);
})(typeof window !== 'undefined' ? window : globalThis);
