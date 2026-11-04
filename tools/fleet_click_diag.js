// Диагностика: кто открывает #fleet-modal при клике по маркеру борта.
const { spawn } = require('child_process'); const os=require('os'), path=require('path');
const url = process.argv[2], port = Number(process.argv[3]||9421);
const edge='C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const prof=path.join(os.tmpdir(),'edge-diag-'+Date.now());
const child=spawn(edge,['--headless=new','--no-sandbox','--no-first-run','--remote-debugging-port='+port,'--user-data-dir='+prof,'--window-size=1400,900',url],{stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  let wsUrl=null;
  for(let i=0;i<80&&!wsUrl;i++){try{const l=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();const p=l.find(t=>t.type==='page');if(p)wsUrl=p.webSocketDebuggerUrl;}catch(e){} if(!wsUrl)await sleep(500);}
  const ws=new WebSocket(wsUrl); await new Promise((res,rej)=>{ws.addEventListener('open',res);ws.addEventListener('error',rej);});
  let id=0; const call=(m,p)=>new Promise((resolve,reject)=>{const my=++id;const on=ev=>{const d=JSON.parse(ev.data);if(d.id!==my)return;ws.removeEventListener('message',on);d.error?reject(new Error(JSON.stringify(d.error))):resolve(d.result);};ws.addEventListener('message',on);ws.send(JSON.stringify({id:my,method:m,params:p||{}}));});
  const ev=async e=>{const r=await call('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true});return r.result&&r.result.value;};
  await call('Runtime.enable'); await sleep(9000);

  // 1) перехватываем openFleet и снимаем стек
  await ev(`(function(){
      window.__fleetCalls = [];
      var orig = window.openFleet;
      if (orig && !orig.__patched) {
          var patched = function(){ window.__fleetCalls.push(new Error('openFleet').stack || 'no-stack'); return orig.apply(this, arguments); };
          patched.__patched = true; window.openFleet = patched;
      }
      return !!orig;
  })()`);

  // 2) описываем первый маркер
  const info = await ev(`(function(){
      var el = document.querySelector('.ship-marker');
      if (!el) return 'нет маркеров';
      var r = el.getBoundingClientRect();
      return JSON.stringify({
        cls: el.className,
        attrs: Array.from(el.attributes).map(function(a){return a.name+'='+a.value.slice(0,40);}),
        x: Math.round(r.left+r.width/2), y: Math.round(r.top+r.height/2),
        allMarkers: document.querySelectorAll('.ship-marker').length,
        traffic: document.querySelectorAll('.ship-marker--traffic').length
      });
  })()`);
  console.log('МАРКЕР: ' + info);

  const pos = JSON.parse(info);
  await call('Input.dispatchMouseEvent', {type:'mousePressed', x:pos.x, y:pos.y, button:'left', clickCount:1});
  await call('Input.dispatchMouseEvent', {type:'mouseReleased', x:pos.x, y:pos.y, button:'left', clickCount:1});
  await sleep(900);

  const after = await ev(`JSON.stringify({
      modal: (document.getElementById('fleet-modal')||{}).style ? document.getElementById('fleet-modal').style.display : 'нет',
      shipCard: !!document.getElementById('ship-card'),
      cards: document.querySelectorAll('#ship-card, .ship-card').length,
      calls: (window.__fleetCalls||[]).length,
      bound: !!window.__fleetClickBound,
      hit: window.__lastFleetHit || null,
      hasFn: typeof window.showShipCard,
      stack: (window.__fleetCalls||[])[0] || null
  })`);
  console.log('ПОСЛЕ КЛИКА: ' + after);
  ws.close(); child.kill(); process.exit(0);
})().catch(e=>{console.error('ERR',e.message);try{child.kill();}catch(x){}process.exit(1);});