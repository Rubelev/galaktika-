// Проверка 2.2: клик по маркеру открывает карточку ИМЕННО этого борта.
// Сравниваем подпись маркера (title) с текстом открывшейся карточки.
// Запуск: node tools/fleet_identity_check.js "<url>" [port]
const { spawn } = require('child_process');
const os = require('os'), path = require('path');
const url = process.argv[2], port = Number(process.argv[3] || 9411);
if (!url) { console.error('нужен URL'); process.exit(2); }

const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const prof = path.join(os.tmpdir(), 'edge-fid-' + Date.now());
const child = spawn(edge, ['--headless=new', '--no-sandbox', '--no-first-run',
    '--remote-debugging-port=' + port, '--user-data-dir=' + prof, '--window-size=1400,900', url], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
    let wsUrl = null;
    for (let i = 0; i < 80 && !wsUrl; i++) {
        try {
            const l = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json();
            const p = l.find(t => t.type === 'page');
            if (p) wsUrl = p.webSocketDebuggerUrl;
        } catch (e) { }
        if (!wsUrl) await sleep(500);
    }
    const ws = new WebSocket(wsUrl);
    await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
    let id = 0;
    const call = (m, p) => new Promise((resolve, reject) => {
        const my = ++id;
        const on = ev => {
            const d = JSON.parse(ev.data);
            if (d.id !== my) return;
            ws.removeEventListener('message', on);
            d.error ? reject(new Error(JSON.stringify(d.error))) : resolve(d.result);
        };
        ws.addEventListener('message', on);
        ws.send(JSON.stringify({ id: my, method: m, params: p || {} }));
    });
    const ev = async expr => {
        const r = await call('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
        return r.result && r.result.value;
    };

    await call('Runtime.enable');
    await sleep(9000);

    const list = JSON.parse(await ev(`JSON.stringify(Array.from(document.querySelectorAll('.ship-marker--fleet')).slice(0,5).map(function(el){
        var r = el.getBoundingClientRect();
        return { x: Math.round(r.left + r.width/2), y: Math.round(r.top + r.height/2),
                 title: (el.title || '').trim() };
    }))`) || '[]');

    let ok = 0;
    for (const m of list) {
        await call('Input.dispatchMouseEvent', { type: 'mousePressed', x: m.x, y: m.y, button: 'left', clickCount: 1 });
        await call('Input.dispatchMouseEvent', { type: 'mouseReleased', x: m.x, y: m.y, button: 'left', clickCount: 1 });
        await sleep(800);
        const cardText = await ev(`(function(){
            var el = document.getElementById('ship-card');
            return el ? (el.textContent || '').replace(/\\s+/g,' ').trim().slice(0, 200) : '';
        })()`);
        // ключевое слово из подписи маркера должно найтись в карточке
        // ключ — маршрут из подписи маркера: «Флот · earth → mars · …»
        const parts = (m.title || '').split('·');
        const route = parts.length > 1 ? parts[1].trim() : '';
        const key = route.split('→')[0].trim();
        const match = key && cardText && cardText.toLowerCase().indexOf(key.toLowerCase()) >= 0;
        if (match) ok++;
        console.log((match ? 'OK   ' : 'FAIL ') + 'маркер «' + (m.title || '—') + '» → карточка «' + (cardText || 'не открылась').slice(0, 160) + '»');
        await ev(`(function(){ var c=document.getElementById('ship-card'); if(c) c.remove(); return true; })()`);
        await sleep(300);
    }
    console.log('ИТОГ: ' + ok + '/' + list.length + ' кликов открыли карточку СВОЕГО борта');
    ws.close(); child.kill(); process.exit(ok === list.length && list.length > 0 ? 0 : 1);
})().catch(e => { console.error('ERR', e.message); try { child.kill(); } catch (x) { } process.exit(1); });
