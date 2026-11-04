// Проверка «игроки онлайн»: открывает игру под одним аккаунтом и смотрит,
// появились ли маркеры других игроков (кто-то уже пинговал с другого аккаунта).
// Запуск: node tools/players_online_check.js "<url>" [port]
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');

const url = process.argv[2];
const port = Number(process.argv[3] || 9351);
if (!url) { console.error('нужен URL'); process.exit(2); }

const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const prof = path.join(os.tmpdir(), 'edge-po-' + Date.now());
const child = spawn(edge, ['--headless=new', '--no-sandbox', '--no-first-run',
    '--remote-debugging-port=' + port, '--user-data-dir=' + prof, '--window-size=1400,900', url], { stdio: 'ignore' });
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
    await sleep(12000);   // пинг уходит через 4 с, ответ — сразу

    const out = await ev(`JSON.stringify({
        players: window.__playersOnline,
        markers: document.querySelectorAll('.player-marker').length,
        names: Array.from(document.querySelectorAll('.player-marker')).map(function(e){return e.getAttribute('data-player');}),
        hud: (document.getElementById('players-online-hud')||{}).textContent || '',
        error: window.__playersError || null
    })`);
    console.log('RESULT ' + out);

    ws.close(); child.kill(); process.exit(0);
})().catch(e => { console.error('ERR', e.message); try { child.kill(); } catch (x) { } process.exit(1); });
