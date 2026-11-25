// DEF-261122-01 — регрессия starCtx.createRadialGradient (CDP).
//
// Запуск:
//   1) python -m http.server 0 --bind 127.0.0.1 --directory deploy-host/site
//   2) chrome --headless=new --remote-debugging-port=9337 --user-data-dir=%TEMP%\cdp http://127.0.0.1:<порт>/
//   3) node tools/starfield_ctx_test.js 9337 http://127.0.0.1:<порт>/
//
// Случаи:
//   A. обычный 2D-контекст: 0 ошибок, звёзды и туманность нарисованы (пиксели);
//   B. getContext('2d') для #starfield-canvas возвращает null: 0 ошибок, тихий выход;
//   C. контекст без createRadialGradient (arc/fill есть): 0 ошибок, звёзды рисуются;
//   D. контекст умеет только fillRect: 0 ошибок, звёзды рисуются прямоугольниками.
const port = Number(process.argv[2] || 9337);
const base = (process.argv[3] || 'http://127.0.0.1:55438/').replace(/\/$/, '') + '/';
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Внедряется ДО скриптов страницы. mode: 'null' | 'nograd' | 'rect'
const INJECT = mode => `(function(){
    var orig = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function(type){
        if (this.id === 'starfield-canvas' && type === '2d') {
            ${mode === 'null' ? 'return null;' : ''}
            ${mode === 'nograd' ? `
            var st = { fillStyle: '#000', globalAlpha: 1, nArc: 0, nFill: 0, nBegin: 0, nClear: 0, nRect: 0 };
            st.fill = function(){ st.nFill++; };
            st.arc = function(){ st.nArc++; };
            st.beginPath = function(){ st.nBegin++; };
            st.clearRect = function(){ st.nClear++; };
            st.fillRect = function(){ st.nRect++; };
            window.__starStub = st;
            return st;` : ''}
            ${mode === 'rect' ? `
            var st = { fillStyle: '#000', globalAlpha: 1, nFill: 0, nRect: 0, nClear: 0 };
            st.fill = function(){ st.nFill++; };
            st.clearRect = function(){ st.nClear++; };
            st.fillRect = function(){ st.nRect++; };
            window.__starStub = st;
            return st;` : ''}
        }
        return orig.apply(this, arguments);
    };
})();`;

(async () => {
    const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    const page = list.find(t => t.type === 'page');
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
    let id = 0; const pending = new Map();
    let errors = [];
    ws.addEventListener('message', e => {
        const d = JSON.parse(e.data);
        if (d.id && pending.has(d.id)) { pending.get(d.id)(d.result); pending.delete(d.id); return; }
        if (d.method === 'Runtime.exceptionThrown') {
            const x = d.params.exceptionDetails;
            errors.push((x.exception && (x.exception.description || x.exception.value)) || x.text);
        }
        if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') {
            errors.push('console.error: ' + d.params.args.map(a => a.value || a.description || a.type).join(' '));
        }
    });
    const call = (m, p) => new Promise(res => { const my = ++id; pending.set(my, res); ws.send(JSON.stringify({ id: my, method: m, params: p || {} })); });
    const ev = async x => {
        const r = await call('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true });
        if (r.exceptionDetails) return { __err: r.exceptionDetails.text };
        return r.result && r.result.value;
    };
    await call('Runtime.enable');
    await call('Page.enable');
    await call('Network.enable');
    await call('Network.setCacheDisabled', { cacheDisabled: true });

    const PIX = `(function(){
        var c = document.getElementById('starfield-canvas');
        if (!c) return JSON.stringify({ canvas: false });
        var ctx = c.getContext('2d');
        if (!ctx || typeof ctx.getImageData !== 'function') return JSON.stringify({ canvas: true, ctx: false });
        var d = ctx.getImageData(0, 0, 400, 400).data;
        var n = 0; for (var i = 3; i < d.length; i += 4) if (d[i] > 0) n++;
        var nb = ctx.getImageData(1750, 1650, 1, 1).data;
        return JSON.stringify({ canvas: true, ctx: true, starsPixels: n, nebulaAlpha: nb[3], w: c.width, h: c.height });
    })()`;

    const CASES = [
        { name: 'A: обычный 2D-контекст', mode: null, check: 'pixels' },
        { name: 'B: getContext → null', mode: 'null', check: 'none' },
        { name: 'C: нет createRadialGradient', mode: 'nograd', check: 'stub' },
        { name: 'D: только fillRect', mode: 'rect', check: 'stub' }
    ];

    let fails = 0;
    for (const c of CASES) {
        let scriptId = null;
        if (c.mode) {
            const r = await call('Page.addScriptToEvaluateOnNewDocument', { source: INJECT(c.mode) });
            scriptId = r && r.identifier;
        }
        errors = [];
        await call('Page.navigate', { url: base + '?shot=1&case=' + encodeURIComponent(c.mode || 'normal') });
        // ждём не только readyState, но и факт исполнения solar.js (иначе меряем пустую канву)
        let ready = false;
        for (let i = 0; i < 60; i++) {
            const st = await ev('document.readyState + "|" + (typeof window.SHIPS)');
            if (st === 'complete|object') { ready = true; break; }
            await sleep(300);
        }
        await sleep(1000);

        let info = {};
        if (c.check === 'pixels') info = JSON.parse(await ev(PIX));
        if (c.check === 'stub') { const s = await ev('JSON.stringify(window.__starStub || null)'); info = JSON.parse(s); }

        const starErrors = errors.filter(e => /starCtx|createRadialGradient/.test(String(e)));
        let ok = ready && starErrors.length === 0;
        if (c.check === 'pixels') ok = ok && info.starsPixels > 0 && info.nebulaAlpha > 0;
        if (c.check === 'stub') ok = ok && !!info && (c.mode === 'rect' ? info.nRect > 0 : (info.nArc > 0 && info.nFill > 0));
        if (!ok) fails++;
        console.log((ok ? 'OK   ' : 'FAIL ') + c.name.padEnd(30) +
            ' starCtx-ошибок=' + starErrors.length + '/' + errors.length +
            ' | ready=' + ready +
            (c.check === 'pixels' ? ' | пикселей=' + info.starsPixels + ' альфа туманности=' + info.nebulaAlpha + ' canvas=' + info.w + 'x' + info.h : '') +
            (c.check === 'stub' ? ' | stub=' + JSON.stringify(info) : ''));
        // прочие ошибки страницы (не наши) печатаем отдельно, чтобы не путать с дефектом
        errors.filter(e => !/starCtx|createRadialGradient/.test(String(e))).slice(0, 2)
            .forEach(e => console.log('      прочее: ' + String(e).split('\n')[0]));
        if (scriptId) await call('Page.removeScriptToEvaluateOnNewDocument', { identifier: scriptId }).catch(() => { });
    }
    console.log('\n=== ИТОГ ===\nслучаев: ' + CASES.length + ' | провалов: ' + fails);
    ws.close();
    process.exit(fails ? 1 : 0);
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
