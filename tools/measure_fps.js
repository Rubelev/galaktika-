// Измерение FPS в РЕАЛЬНОМ времени через CDP (без virtual-time, который ломает rAF).
// Запуск: node tools/measure_fps.js "<url>" [seconds] [port]
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const url = process.argv[2];
const seconds = Number(process.argv[3] || 8);
const port = Number(process.argv[4] || 9333);
if (!url) { console.error('нужен URL'); process.exit(2); }

const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const prof = path.join(os.tmpdir(), 'edge-fps-' + Date.now());

const child = spawn(edge, [
    '--headless=new', '--no-sandbox', '--no-first-run',
    '--remote-debugging-port=' + port,
    '--user-data-dir=' + prof,
    '--window-size=1400,900',
    url
], { stdio: 'ignore' });

function getJson(p) {
    return fetch('http://127.0.0.1:' + port + p).then(r => r.json());
}

async function waitTarget() {
    for (let i = 0; i < 60; i++) {
        try {
            const list = await getJson('/json/list');
            const page = list.find(t => t.type === 'page');
            if (page && page.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
        } catch (e) { }
        await new Promise(r => setTimeout(r, 500));
    }
    throw new Error('CDP не поднялся');
}

function cdp(ws, method, params) {
    return new Promise((resolve, reject) => {
        const id = Math.floor(Math.random() * 1e6);
        const onMsg = (ev) => {
            const m = JSON.parse(ev.data);
            if (m.id !== id) return;
            ws.removeEventListener('message', onMsg);
            m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result);
        };
        ws.addEventListener('message', onMsg);
        ws.send(JSON.stringify({ id, method, params: params || {} }));
    });
}

(async () => {
    const wsUrl = await waitTarget();
    const ws = new WebSocket(wsUrl);
    await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });

    await cdp(ws, 'Runtime.enable');
    // ждём РЕАЛЬНОЕ время: страница успевает отрисовать и зонд — набрать статистику
    await new Promise(r => setTimeout(r, seconds * 1000));

    const expr = `(function(){
        const pick = (sel) => { const el = document.querySelector(sel); return el ? el.textContent.trim() : ''; };
        return JSON.stringify({
            title: document.title,
            overlay: pick('#perf-overlay'),
            holes: (window.matchMedia && window.matchMedia('(min-resolution: 1dppx)')) ? 1 : 0,
            has3d: !!document.querySelector('#blocks3d-wrap')
        });
    })()`;
    const r = await cdp(ws, 'Runtime.evaluate', { expression: expr, returnByValue: true });
    console.log('RESULT ' + r.result.value);

    // дополнительно считаем кадры сами, за 3 с реального времени
    const fpsExpr = `new Promise(function(res){
        let n = 0; const t0 = performance.now();
        function tick(){ n++; if (performance.now() - t0 < 3000) requestAnimationFrame(tick); else res(JSON.stringify({fps: n / ((performance.now()-t0)/1000), frames: n})); }
        requestAnimationFrame(tick);
    })`;
    const fps = await cdp(ws, 'Runtime.evaluate', { expression: fpsExpr, awaitPromise: true, returnByValue: true });
    console.log('FPS ' + fps.result.value);

    ws.close();
    child.kill();
    process.exit(0);
})().catch(e => { console.error('ERR', e.message); try { child.kill(); } catch (x) { } process.exit(1); });
