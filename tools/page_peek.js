// Быстрый осмотр страницы: заголовок, шапка, наличие 3D.
const { spawn } = require('child_process'); const os=require('os'), path=require('path');
const url=process.argv[2], port=Number(process.argv[3]||9461);
const edge='C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const prof=path.join(os.tmpdir(),'edge-peek-'+Date.now());
  const child=spawn(edge,['--headless=new','--no-sandbox','--no-first-run','--remote-debugging-port='+port,'--user-data-dir='+prof,'--window-size=1400,900',url],{stdio:'ignore'});
  let wsUrl=null;
  for(let i=0;i<80&&!wsUrl;i++){try{const l=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();const p=l.find(t=>t.type==='page');if(p)wsUrl=p.webSocketDebuggerUrl;}catch(e){} if(!wsUrl)await sleep(500);}
  const ws=new WebSocket(wsUrl); await new Promise((res,rej)=>{ws.addEventListener('open',res);ws.addEventListener('error',rej);});
  let id=0; const call=(m,p)=>new Promise((resolve,reject)=>{const my=++id;const on=ev=>{const d=JSON.parse(ev.data);if(d.id!==my)return;ws.removeEventListener('message',on);d.error?reject(new Error(JSON.stringify(d.error))):resolve(d.result);};ws.addEventListener('message',on);ws.send(JSON.stringify({id:my,method:m,params:p||{}}));});
  await call('Runtime.enable'); await sleep(9000);
  const r=await call('Runtime.evaluate',{expression:`JSON.stringify({
      title: document.title,
      hdr: (document.querySelector('.pv-title, #pv-title, .b3d-title, .pv-bar')||{}).textContent||'',
      world: (document.querySelector('#pv-world, .pv-world select, select')||{}).value||'',
      has3d: !!document.querySelector('#blocks3d-wrap'),
      blocks: document.querySelectorAll('#blocks3d-wrap canvas').length,
      err: !!document.querySelector('#load-error'), pvWorld: window.__pvWorld || null, pvReq: window.__pvRequested || null, pvStep: window.__pvStep || null
  })`,returnByValue:true});
  console.log(r.result.value);
  ws.close(); child.kill(); process.exit(0);
})().catch(e=>{console.error('ERR',e.message);process.exit(1);});