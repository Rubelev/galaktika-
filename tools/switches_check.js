// Проверка рубильников в щитовой: открывает тур на кадре «Щитовая»,
// кликает по каждому рубильнику реальными событиями мыши и проверяет состояние.
// Запуск: node tools/switches_check.js "<url>" [port]
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');

const url = process.argv[2];
const port = Number(process.argv[3] || 9361);
if (!url) { console.error('нужен URL'); process.exit(2); }

const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const prof = path.join(os.tmpdir(), 'edge-sw-' + Date.now());
const child = spawn(edge, ['--headless=new', '--no-sandbox', '--no-first-run',
    '--remote-debugging-port=' + port, '--user-data-dir=' + prof, '--window-size=1400,900', url], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function target() {
    for (let i = 0; i < 80; i++) {
        try {
            const list = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json();
            const p = list.find(t => t.type === 'page');
            if (p && p.webSocketDebuggerUrl) return p.webSocketDebuggerUrl;
        } catch (e) { }
        await sleep(500);
    }
    throw new Error('CDP не поднялся');
}

(async () => {
    const ws = new WebSocket(await target());
    await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
    let id = 0;
    const call = (method, params) => new Promise((resolve, reject) => {
        const myId = ++id;
        const onMsg = ev => {
            const m = JSON.parse(ev.data);
            if (m.id !== myId) return;
            ws.removeEventListener('message', onMsg);
            m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result);
        };
        ws.addEventListener('message', onMsg);
        ws.send(JSON.stringify({ id: myId, method, params: params || {} }));
    });
    const ev = async expr => {
        const r = await call('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
        return r.result && r.result.value;
    };

    await call('Runtime.enable');
    await sleep(9000);   // модуль THREE + построение сцены

    // принудительно переходим на кадр «Щитовая»
    await ev(`(function(){ var t=window.StationTour; if(!t) return 'нет тура';
        var i=t.stops.findIndex(function(s){return s.name==='Щитовая';}); t.show(i); return 'ok'; })()`);
    await sleep(800);

    const before = await ev(`JSON.stringify({states: window.StationTour.states(), pos: window.StationTour.screenPositions(), title: document.title})`);
    console.log('ДО: ' + before);

    const pos = JSON.parse(before).pos;
    for (const p of pos) {
        await call('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'left', clickCount: 1 });
        await call('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y, button: 'left', clickCount: 1 });
        await sleep(350);
    }

    const after = await ev(`JSON.stringify({states: window.StationTour.states(), title: document.title,
        hud: (document.getElementById('tour-switches')||{}).textContent || ''})`);
    console.log('ПОСЛЕ: ' + after);

    const st = JSON.parse(after).states || [];
    const on = st.filter(Boolean).length;
    console.log('включено рубильников: ' + on + '/' + st.length);
    console.log(on === st.length && st.length === 4 ? 'ИТОГ: 4/4 — рубильники переключаются действием' : 'ИТОГ: ' + on + '/' + st.length + ' — требуется доработка');

    ws.close(); child.kill(); process.exit(0);
})().catch(e => { console.error('ERR', e.message); try { child.kill(); } catch (x) { } process.exit(1); });
