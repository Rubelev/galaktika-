// Строгая проверка: расстояние от тела до ЕГО линии орбиты ≤ 6 px.
// Линия берётся из SVG-пути (та же формула, что позиция) либо из круглого .orbit.
const { spawn } = require('child_process');
const os = require('os'), path = require('path');
const url = process.argv[2], port = Number(process.argv[3] || 9391);
const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const prof = path.join(os.tmpdir(), 'edge-fit-' + Date.now());
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
  await sleep(9000);
  const expr = `(function(){
    function segDist(px,py,ax,ay,bx,by){
      var dx=bx-ax, dy=by-ay, l2=dx*dx+dy*dy;
      if(!l2) return Math.hypot(px-ax,py-ay);
      var t=Math.max(0,Math.min(1,((px-ax)*dx+(py-ay)*dy)/l2));
      return Math.hypot(px-(ax+dx*t), py-(ay+dy*t));
    }
    return JSON.stringify(Array.from(document.querySelectorAll('.planet[data-planet-id]')).map(function(el){
      var orbit=el.closest('.orbit'); if(!orbit) return {id:el.getAttribute('data-planet-id'), err:'нет .orbit'};
      var wrap=el.closest('.planet-wrapper')||el;
      var m=(wrap.style.transform||'').match(/translate\\(\\s*(-?[\\d.]+)px,\\s*(-?[\\d.]+)px/);
      var tx=m?+m[1]:0, ty=m?+m[2]:0;
      var svg=orbit.querySelector('svg.orbit-path path');
      var min=Infinity;
      if(svg && svg.getAttribute('d')){
        var nums=(svg.getAttribute('d').match(/-?\\d+(\\.\\d+)?/g)||[]).map(Number);
        for(var i=0;i+3<nums.length;i+=2){
          var d=segDist(tx,ty,nums[i],nums[i+1],nums[i+2],nums[i+3]);
          if(d<min) min=d;
        }
        return {id:el.getAttribute('data-planet-id'), dist:+min.toFixed(1), src:'path'};
      }
      var ow=parseFloat(orbit.style.width)||1, oh=parseFloat(orbit.style.height)||1;
      var r=Math.hypot(tx/(ow/2), ty/(oh/2));
      var d2=Math.abs(r-1)*Math.min(ow,oh)/2;
      return {id:el.getAttribute('data-planet-id'), dist:+d2.toFixed(1), src:'ellipse'};
    }));
  })()`;
  const r = await call('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  const rows = JSON.parse((r.result && r.result.value) || '[]');
  let bad = 0;
  rows.forEach(function (o) {
    const ok = o.dist !== undefined && o.dist <= 6;
    if (!ok) bad++;
    console.log((ok ? 'OK   ' : 'FAIL ') + o.id + ' Δ=' + o.dist + ' px (' + (o.src || o.err) + ')');
  });
  console.log('ИТОГ: ' + (rows.length - bad) + '/' + rows.length + ' тел в пределах 6 px');
  ws.close(); child.kill(); process.exit(bad ? 1 : 0);
})().catch(e => { console.error('ERR', e.message); try { child.kill(); } catch(x){} process.exit(1); });