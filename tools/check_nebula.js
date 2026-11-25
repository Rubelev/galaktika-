const { spawn } = require('child_process'); const os=require('os'), path=require('path'), fs=require('fs');
const url=process.argv[2], out=process.argv[3], port=Number(process.argv[4]||9523);
const edge='C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const prof=path.join(os.tmpdir(),'edge-nb-'+Date.now());
  const child=spawn(edge,['--headless=new','--no-sandbox','--no-first-run','--remote-debugging-port='+port,'--user-data-dir='+prof,'--window-size=1400,860',url],{stdio:'ignore'});
  let wsUrl=null;
  for(let i=0;i<80&&!wsUrl;i++){try{const l=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();const p=l.find(t=>t.type==='page');if(p)wsUrl=p.webSocketDebuggerUrl;}catch(e){} if(!wsUrl)await sleep(500);}
  const ws=new WebSocket(wsUrl); await new Promise((res,rej)=>{ws.addEventListener('open',res);ws.addEventListener('error',rej);});
  let id=0; const call=(m,p)=>new Promise((resolve,reject)=>{const my=++id;const on=ev=>{const d=JSON.parse(ev.data);if(d.id!==my)return;ws.removeEventListener('message',on);d.error?reject(new Error(JSON.stringify(d.error))):resolve(d.result);};ws.addEventListener('message',on);ws.send(JSON.stringify({id:my,method:m,params:p||{}}));});
  const ev=async e=>{const r=await call('Runtime.evaluate',{expression:e,returnByValue:true});return r.result&&r.result.value;};
  const errs=[];
  ws.addEventListener('message', e => { const d=JSON.parse(e.data); if(d.method==='Runtime.exceptionThrown') errs.push(((d.params.exceptionDetails.exception||{}).description||'ex').slice(0,100)); });
  await call('Runtime.enable'); await sleep(10000);
  const info = await ev(`JSON.stringify({mood: window.Backdrops?Backdrops.current():null, nebula: !!(window.Nebula && Nebula.enabled()), canvases: document.querySelectorAll('#gx-nebula canvas').length})`);
  console.log(info);
  // грубый замер FPS за 2 секунды
  const fps = await ev(`new Promise(function(res){var n=0,t=performance.now();function f(){n++;if(performance.now()-t<2000)requestAnimationFrame(f);else res(Math.round(n/((performance.now()-t)/1000)));}requestAnimationFrame(f);})`);
  console.log("fps ~", fps, "| ошибки:", JSON.stringify(errs.slice(0,3)));
  const shot=await call('Page.captureScreenshot',{format:'png'}); fs.writeFileSync(out, Buffer.from(shot.data,'base64'));
  ws.close(); child.kill(); process.exit(0);
})().catch(e=>{console.error('ERR',e.message);process.exit(1);});