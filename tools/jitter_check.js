// Быстрая самопроверка зонда дрожания: читаем отчёт через CDP.
const { spawn } = require('child_process');
const os = require('os'), path = require('path');
const url = process.argv[2], port = Number(process.argv[3] || 9371);
const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const prof = path.join(os.tmpdir(), 'edge-jit-' + Date.now());
const child = spawn(edge, ['--headless=new','--no-sandbox','--no-first-run','--remote-debugging-port='+port,
  '--user-data-dir='+prof,'--window-size=1400,900', url], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  let wsUrl = null;
  for (let i = 0; i < 80 && !wsUrl; i++) {
    try { const l = await (await fetch('http://127.0.0.1:'+port+'/json/list')).json();
      const p = l.find(t => t.type === 'page'); if (p) wsUrl = p.webSocketDebuggerUrl; } catch (e) {}
    if (!wsUrl) await sleep(500);
  }
  const ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
  let id = 0;
  const call = (m, p) => new Promise((resolve, reject) => {
    const my = ++id;
    const on = ev => { const d = JSON.parse(ev.data); if (d.id !== my) return; ws.removeEventListener('message', on);
      d.error ? reject(new Error(JSON.stringify(d.error))) : resolve(d.result); };
    ws.addEventListener('message', on); ws.send(JSON.stringify({ id: my, method: m, params: p || {} }));
  });
  await call('Runtime.enable');
  await sleep(Number(process.argv[4] || 15000));
  const r = await call('Runtime.evaluate', { expression: "JSON.stringify(window.__jitterReport || null)", returnByValue: true, awaitPromise: true });
  console.log('REPORT ' + (r.result && r.result.value));
  ws.close(); child.kill(); process.exit(0);
})().catch(e => { console.error('ERR', e.message); try { child.kill(); } catch(x){} process.exit(1); });