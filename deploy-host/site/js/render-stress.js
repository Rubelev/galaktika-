// ============================================================================
//  RENDER-STRESS.JS — стресс отрисовки: N спрайтов на canvas против N DOM-узлов.
//  ?stress=<N>&mode=canvas|dom
//  Меряет: FPS, среднее время кадра (JS), время отрисовки, пик.
//  Результат: JSON в <pre id="stress-report"> + краткий вердикт в <title>.
// ============================================================================
(function (global) {
    'use strict';
    const params = new URLSearchParams(location.search);
    const N = Math.max(10, parseInt(params.get('stress') || '600', 10));
    const MODE = params.get('mode') === 'dom' ? 'dom' : 'canvas';
    const DURATION_MS = 4000;

    function boot() {
        if (!params.has('stress')) return;

        const ART = '/images/ships/vol/ion_courier.png';
        const W = innerWidth, H = innerHeight;
        const ships = [];
        for (let i = 0; i < N; i++) {
            const a = (i / N) * Math.PI * 2;
            ships.push({
                a: a, r: 120 + (i % 40) * 8, sp: 0.15 + (i % 7) * 0.02,
                ang: 0, x: 0, y: 0
            });
        }

        let canvas = null, ctx = null, domNodes = null, img = null;
        if (MODE === 'canvas') {
            canvas = document.createElement('canvas');
            canvas.width = W; canvas.height = H;
            canvas.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#05080f';
            document.body.appendChild(canvas);
            ctx = canvas.getContext('2d');
            img = new Image(); img.src = ART;
        } else {
            const wrap = document.createElement('div');
            wrap.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#05080f;overflow:hidden';
            document.body.appendChild(wrap);
            domNodes = [];
            for (let i = 0; i < N; i++) {
                const el = document.createElement('div');
                el.style.cssText = 'position:absolute;width:9px;height:9px;background:url(' + ART + ') center/contain no-repeat;will-change:transform';
                wrap.appendChild(el);
                domNodes.push(el);
            }
        }

        const cx = W / 2, cy = H / 2;

        // СИНХРОННЫЙ БЕНЧМАРК: 60 кадров подряд, без rAF — так результат
        // не зависит от virtual-time в headless и от частоты монитора.
        function drawFrame(t) {
            if (MODE === 'canvas') {
                ctx.clearRect(0, 0, W, H);
                ctx.fillStyle = '#05080f';
                ctx.fillRect(0, 0, W, H);
                for (let i = 0; i < N; i++) {
                    const s = ships[i];
                    const a = s.a + t * s.sp;
                    const x = cx + Math.cos(a) * s.r, y = cy + Math.sin(a) * s.r * 0.55;
                    ctx.save();
                    ctx.translate(x, y);
                    ctx.rotate(a + Math.PI / 2);
                    if (img && img.complete) ctx.drawImage(img, -5, -5, 10, 10);
                    ctx.restore();
                }
            } else {
                for (let i = 0; i < N; i++) {
                    const s = ships[i];
                    const a = s.a + t * s.sp;
                    const x = cx + Math.cos(a) * s.r, y = cy + Math.sin(a) * s.r * 0.55;
                    domNodes[i].style.transform = 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px) rotate(' + (a * 57.3).toFixed(1) + 'deg)';
                }
                document.body.offsetHeight;   // форсируем layout, как в реальном кадре
            }
        }

        // прогрев
        for (let w = 0; w < 5; w++) drawFrame(w * 0.01);

        const FRAMES = 60;
        const t0 = performance.now();
        for (let f = 0; f < FRAMES; f++) drawFrame(f * 0.016);
        const total = performance.now() - t0;

        const avg = total / FRAMES;
        const report = {
            mode: MODE, n: N, frames: FRAMES,
            totalMs: +total.toFixed(1),
            drawAvgMs: +avg.toFixed(2),
            fpsTheoretical: +(1000 / avg).toFixed(1),
            budgetShare: +((avg / (1000 / 60)) * 100).toFixed(1)
        };
        const pre = document.createElement('pre');
        pre.id = 'stress-report';
        pre.style.display = 'none';
        pre.textContent = JSON.stringify(report);
        document.body.appendChild(pre);
        document.title = 'STRESS ' + MODE + ' n=' + N + ' draw=' + report.drawAvgMs + 'ms fps~' + report.fpsTheoretical;
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(boot, 800));
    else setTimeout(boot, 800);
})(typeof window !== 'undefined' ? window : globalThis);
