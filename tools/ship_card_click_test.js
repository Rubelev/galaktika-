// DEF-261116-01 — регрессия клика по маркеру флота (CDP, нужен Chrome + статик-сервер).
//
// Запуск:
//   1) python -m http.server 0 --bind 127.0.0.1 --directory deploy-host/site   (запомнить порт)
//   2) chrome --headless=new --remote-debugging-port=9333 --user-data-dir=%TEMP%\cdp http://127.0.0.1:<порт>/
//   3) node tools/ship_card_click_test.js 9333 http://127.0.0.1:<порт>/?shot=1
//
// Проверяет: 1) window.showShipCard есть; 2) двойной клик по .ship-marker._fleet
// (ветка solar.js ~4904) открывает карточку без ошибки; 3) одиночный клик по
// .ship-marker--fleet (ship-card.js) тоже; 4) в консоли нет исключений.
const port = Number(process.argv[2] || 9333);
const targetUrl = process.argv[3] || 'http://127.0.0.1:63389/?shot=1';
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
    const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    const page = list.find(t => t.type === 'page');
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
    let id = 0; const pending = new Map(); const errors = [];
    ws.addEventListener('message', ev => {
        const d = JSON.parse(ev.data);
        if (d.id && pending.has(d.id)) { pending.get(d.id)(d.result); pending.delete(d.id); return; }
        if (d.method === 'Runtime.exceptionThrown') {
            const e = d.params.exceptionDetails;
            errors.push((e.exception && (e.exception.description || e.exception.value)) || e.text);
        }
        if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') {
            errors.push('console.error: ' + d.params.args.map(a => a.value || a.description || a.type).join(' '));
        }
    });
    const call = (m, p) => new Promise(res => { const my = ++id; pending.set(my, res); ws.send(JSON.stringify({ id: my, method: m, params: p || {} })); });
    const ev = async e => {
        const r = await call('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true });
        if (r.exceptionDetails) return { __err: r.exceptionDetails.text + ' ' + ((r.exceptionDetails.exception || {}).description || '') };
        return r.result && r.result.value;
    };
    await call('Runtime.enable');
    await call('Page.enable').catch(() => {});
    // без этого браузер отдаёт solar.js из кеша (?v= не менялся)
    await call('Network.enable').catch(() => {});
    await call('Network.setCacheDisabled', { cacheDisabled: true }).catch(() => {});
    await call('Page.navigate', { url: targetUrl });
    for (let i = 0; i < 30; i++) { if (await ev('document.readyState') === 'complete') break; await sleep(500); }
    await sleep(3000);

    console.log('typeof window.showShipCard =', await ev('typeof window.showShipCard'));
    console.log('typeof showShipCard        =', await ev('typeof showShipCard'));

    const mkMarker = (fleet) => `(function(){
        document.querySelectorAll('.gk-test-marker').forEach(function(n){ n.remove(); });
        var old = document.getElementById('ship-card'); if (old) old.remove();
        var m = document.createElement('div');
        m.className = 'ship-marker gk-test-marker' + (${fleet ? 'true' : 'false'} ? ' ship-marker--fleet' : '');
        m.style.cssText = 'position:fixed;left:320px;top:240px;width:2px;height:2px;display:block';
        m._fleet = { label: 'ТЕСТ-БОРТ', kind: 'hauler', hours: 1.5, art: 'jet_hauler' };
        document.body.appendChild(m);
        var r = m.getBoundingClientRect();
        return JSON.stringify({ x: r.left + r.width/2, y: r.top + r.height/2, cls: m.className });
    })()`;

    // --- A: двойной клик, ветка solar.js (showShipCard) ---
    const before = errors.length;
    const a0 = JSON.parse(await ev(mkMarker(false)));
    await ev(`(function(){ var m=document.querySelector('.gk-test-marker'); m.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,clientX:${a0.x},clientY:${a0.y}})); })()`);
    await sleep(60);
    await ev(`(function(){ var m=document.querySelector('.gk-test-marker'); m.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,clientX:${a0.x},clientY:${a0.y}})); })()`);
    await sleep(400);
    const aRes = await ev(`(function(){ var c=document.getElementById('ship-card');
        return JSON.stringify({ card: !!c, z: c ? c.style.zIndex : null, text: c ? c.textContent.slice(0,50) : null }); })()`);
    const aErr = errors.slice(before);
    console.log('A) двойной клик (.ship-marker):', aRes);
    console.log('   ошибок:', aErr.length, aErr.length ? '-> ' + String(aErr[0]).split('\n')[0] : '');

    // --- B: одиночный клик по --fleet (ship-card.js) ---
    const b0 = JSON.parse(await ev(mkMarker(true)));
    const before2 = errors.length;
    await ev(`(function(){ var m=document.querySelector('.gk-test-marker'); m.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,clientX:${b0.x},clientY:${b0.y}})); })()`);
    await sleep(400);
    const bRes = await ev(`(function(){ var c=document.getElementById('ship-card');
        return JSON.stringify({ card: !!c, z: c ? c.style.zIndex : null, text: c ? c.textContent.slice(0,50) : null,
            shipCardOpened: window.__shipCardOpened || 0 }); })()`);
    const bErr = errors.slice(before2);
    console.log('B) один клик (.ship-marker--fleet):', bRes);
    console.log('   ошибок:', bErr.length, bErr.length ? '-> ' + String(bErr[0]).split('\n')[0] : '');

    // --- C: двойной клик по маркеру БЕЗ _fleet (не должно быть ошибок) ---
    const before3 = errors.length;
    await ev(`(function(){ var old=document.getElementById('ship-card'); if(old) old.remove();
        var m=document.createElement('div'); m.className='ship-marker gk-test-marker';
        m.style.cssText='position:fixed;left:400px;top:300px;width:2px;height:2px';
        document.body.appendChild(m); return 1; })()`);
    await ev(`(function(){ var m=document.querySelector('.gk-test-marker'); for (var i=0;i<2;i++) m.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,clientX:400,clientY:300})); })()`);
    await sleep(300);
    console.log('C) двойной клик без _fleet — ошибок:', errors.length - before3);

    console.log('ИТОГО ошибок консоли на странице:', errors.length);
    errors.slice(0, 6).forEach(function (e, i) { console.log('  err' + (i + 1) + ': ' + String(e).split('\n')[0]); });
    const bad = errors.length > 0 || (await ev('typeof window.showShipCard')) !== 'function';
    ws.close();
    process.exit(bad ? 1 : 0);
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
