// Шаг 2.3: кликабельность флота. Открывает игру, кликает по 5 маркерам
// кораблей реальными событиями мыши (CDP) и проверяет, открылась ли карточка.
// Запуск: node tools/click_fleet.js "<url>" [port]
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');

const url = process.argv[2];
const port = Number(process.argv[3] || 9341);
if (!url) { console.error('нужен URL'); process.exit(2); }

const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const prof = path.join(os.tmpdir(), 'edge-fleet-' + Date.now());
const child = spawn(edge, [
    '--headless=new', '--no-sandbox', '--no-first-run',
    '--remote-debugging-port=' + port,
    '--user-data-dir=' + prof,
    '--window-size=1400,900',
    url
], { stdio: 'ignore' });

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function target() {
    for (let i = 0; i < 60; i++) {
        try {
            const list = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json();
            const p = list.find(t => t.type === 'page');
            if (p && p.webSocketDebuggerUrl) return p.webSocketDebuggerUrl;
        } catch (e) { }
        await sleep(500);
    }
    throw new Error('CDP не поднялся');
}

function rpc(ws) {
    return (method, params) => new Promise((resolve, reject) => {
        const id = Math.floor(Math.random() * 1e6);
        const onMsg = ev => {
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
    const ws = new WebSocket(await target());
    await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
    const call = rpc(ws);
    await call('Runtime.enable');
    await sleep(7000);   // даём сцене построиться

    const evalJs = async (expr, awaitPromise) => {
        const r = await call('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: !!awaitPromise });
        return r.result && r.result.value;
    };

    const markers = await evalJs(`JSON.stringify(Array.from(document.querySelectorAll('.ship-marker')).slice(0,5).map(function(el){
        var r = el.getBoundingClientRect();
        return {x: Math.round(r.left + r.width/2), y: Math.round(r.top + r.height/2), id: el.getAttribute('data-ship') || el.getAttribute('data-route') || el.getAttribute('data-sid') || el.textContent.trim().slice(0,20)};
    }))`, true);
    const list = JSON.parse(markers || '[]');
    console.log('маркеров найдено:', list.length, JSON.stringify(list));

    let opened = 0;
    for (const m of list) {
        await call('Input.dispatchMouseEvent', { type: 'mousePressed', x: m.x, y: m.y, button: 'left', clickCount: 1 });
        await call('Input.dispatchMouseEvent', { type: 'mouseReleased', x: m.x, y: m.y, button: 'left', clickCount: 1 });
        await sleep(700);
        const shown = await evalJs(`!!document.querySelector('.fleet-modal, #fleet-modal, .ship-card')`, true);
        if (shown) opened++;
        // закрываем, если открылось
        await evalJs(`(function(){ var b=document.querySelector('.fleet-modal .close, #fleet-modal .close, .modal-close'); if(b) b.click(); return true; })()`, true);
        await sleep(300);
    }
    console.log('карточек открылось:', opened, 'из', list.length);
    console.log(opened === list.length && list.length === 5 ? 'ИТОГ: 5/5 — кликабельность флота работает' : 'ИТОГ: ' + opened + '/' + list.length + ' — требуется доработка');
    ws.close(); child.kill();
    process.exit(0);
})().catch(e => { console.error('ERR', e.message); try { child.kill(); } catch (x) { } process.exit(1); });
