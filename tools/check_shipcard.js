const { spawn } = require('child_process'); const os=require('os'), path=require('path');
const url=process.argv[2], port=Number(process.argv[3]||9495);
const edge='C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const prof=path.join(os.tmpdir(),'edge-sc-'+Date.now());
  const child=spawn(edge,['--headless=new','--no-sandbox','--no-first-run','--remote-debugging-port='+port,'--user-data-dir='+prof,'--window-size=1400,900',url],{stdio:'ignore'});
  let wsUrl=null;
  for(let i=0;i<80&&!wsUrl;i++){try{const l=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();const p=l.find(t=>t.type==='page');if(p)wsUrl=p.webSocketDebuggerUrl;}catch(e){} if(!wsUrl)await sleep(500);}
  const ws=new WebSocket(wsUrl); await new Promise((res,rej)=>{ws.addEventListener('open',res);ws.addEventListener('error',rej);});
  let id=0; const call=(m,p)=>new Promise((resolve,reject)=>{const my=++id;const on=ev=>{const d=JSON.parse(ev.data);if(d.id!==my)return;ws.removeEventListener('message',on);d.error?reject(new Error(JSON.stringify(d.error))):resolve(d.result);};ws.addEventListener('message',on);ws.send(JSON.stringify({id:my,method:m,params:p||{}}));});
  const ev=async e=>{const r=await call('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true});return r.result&&r.result.value;};
  const errs=[];
  ws.addEventListener('message', ev2 => { const d=JSON.parse(ev2.data); if(d.method==='Runtime.exceptionThrown') errs.push((d.params.exceptionDetails.exception||{}).description||'ex'); });
  await call('Runtime.enable'); await call('Log.enable'); await sleep(11000);
  const t = await ev(`typeof window.showShipCard`);
  const clicked = await ev(`(function(){ var m=document.querySelector('.ship-marker--fleet')||document.querySelector('.ship-marker'); if(!m) return 'нет маркера'; var r=m.getBoundingClientRect(); ['mousedown','mouseup','click','dblclick'].forEach(function(t){ m.dispatchEvent(new MouseEvent(t,{bubbles:true,clientX:r.x+1,clientY:r.y+1})); }); return 'клик отправлен'; })()`);
  await sleep(1200);
  const card = await ev(`(function(){ var c=document.getElementById('ship-card'); return c ? (c.innerText||'').replace(/\\s+/g,' ').slice(0,80) : 'нет карточки'; })()`);
  console.log(JSON.stringify({typeofShowShipCard: t, click: clicked, card: card, errors: errs.slice(0,3)}));
  ws.close(); child.kill(); process.exit(0);
})().catch(e=>{console.error('ERR',e.message);process.exit(1);});