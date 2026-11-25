// DEF-261118-01 — регрессия фильтра ботов в js/errlog.js (CDP).
//
// Запуск:
//   1) python -m http.server 0 --bind 127.0.0.1 --directory deploy-host/site   (запомнить порт)
//   2) chrome --headless=new --remote-debugging-port=9336 --user-data-dir=%TEMP%\cdp http://127.0.0.1:<порт>/
//   3) node tools/errlog_bot_filter_test.js 9336 http://127.0.0.1:<порт>/
//
// Для каждого случая: подменить UA, открыть страницу, выстрелить window 'error'
// с уникальной меткой и посчитать POST /api/clientlog, в теле которого есть метка.
// Бот/Lighthouse/pagespeed → 0 отправок; обычный UA → отправка есть.
const port = Number(process.argv[2] || 9336);
const base = (process.argv[3] || 'http://127.0.0.1:55438/').replace(/\/$/, '') + '/';
const sleep = ms => new Promise(r => setTimeout(r, ms));

const UA_DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.0.0 Safari/537.36';
const UA_GOOGLEBOT = 'Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
const UA_LIGHTHOUSE = 'Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Mobile Safari/537.36 Chrome-Lighthouse';
const UA_HEADLESS = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/157.0.0.0 Safari/537.36';
const UA_CURL = 'curl/8.4.0';

const CASES = [
    { name: 'Googlebot (Nexus 5X)', ua: UA_GOOGLEBOT, path: '?shot=1&case=bot', expect: 0 },
    { name: 'Lighthouse UA', ua: UA_LIGHTHOUSE, path: '?shot=1&case=lh', expect: 0 },
    { name: 'HeadlessChrome', ua: UA_HEADLESS, path: '?shot=1&case=headless', expect: 0 },
    { name: 'curl', ua: UA_CURL, path: '?shot=1&case=curl', expect: 0 },
    { name: 'URL ?lighthouse=1', ua: UA_DESKTOP, path: '?shot=1&lighthouse=1', expect: 0 },
    { name: 'URL ?pagespeed=1', ua: UA_DESKTOP, path: '?shot=1&pagespeed=1', expect: 0 },
    { name: 'обычный UA (контроль)', ua: UA_DESKTOP, path: '?shot=1&case=normal', expect: 1 }
];

(async () => {
    const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    const page = list.find(t => t.type === 'page');
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
    let id = 0; const pending = new Map();
    let posts = [];
    ws.addEventListener('message', ev => {
        const d = JSON.parse(ev.data);
        if (d.id && pending.has(d.id)) { pending.get(d.id)(d.result); pending.delete(d.id); return; }
        if (d.method === 'Network.requestWillBeSent') {
            const q = d.params.request;
            if (q.method === 'POST' && /\/api\/clientlog/.test(q.url)) {
                posts.push({ url: q.url, body: q.postData || '' });
            }
        }
    });
    const call = (m, p) => new Promise(res => { const my = ++id; pending.set(my, res); ws.send(JSON.stringify({ id: my, method: m, params: p || {} })); });
    const ev = async e => {
        const r = await call('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true });
        if (r.exceptionDetails) return { __err: r.exceptionDetails.text };
        return r.result && r.result.value;
    };
    await call('Runtime.enable');
    await call('Page.enable');
    await call('Network.enable');
    await call('Network.setCacheDisabled', { cacheDisabled: true });

    let fails = 0;
    for (const c of CASES) {
        await call('Network.setUserAgentOverride', { userAgent: c.ua });
        await call('Page.navigate', { url: base + c.path });
        for (let i = 0; i < 30; i++) { if (await ev('document.readyState') === 'complete') break; await sleep(300); }
        await sleep(1200);
        const boots = await ev('typeof window.__booted');
        const uaSeen = await ev('navigator.userAgent');
        posts = [];
        const marker = 'DEF02-' + c.name.replace(/[^\w]+/g, '_') + '-' + Date.now();
        await ev(`window.dispatchEvent(new ErrorEvent('error', { message: ${JSON.stringify(marker)}, filename: 'def02.js', lineno: 42, colno: 1, error: new Error(${JSON.stringify(marker)}) })); 1`);
        await sleep(1500);
        const hits = posts.filter(p => (p.body || '').indexOf(marker) >= 0);
        const sent = hits.length > 0 ? 1 : 0;
        const ok = sent === c.expect;
        if (!ok) fails++;
        console.log((ok ? 'OK   ' : 'FAIL ') + c.name.padEnd(24) +
            ' отправок=' + sent + ' (ждали ' + c.expect + ')' +
            ' | __booted=' + boots +
            ' | UA подменён=' + (String(uaSeen).slice(0, 34)) + '…');
        if (c.expect === 1 && sent === 1) {
            const body = hits[0].body;
            console.log('     тело: ' + String(body).slice(0, 120));
        }
    }
    console.log('\n=== ИТОГ ===\nслучаев: ' + CASES.length + ' | провалов: ' + fails);
    ws.close();
    process.exit(fails ? 1 : 0);
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
