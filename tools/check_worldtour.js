const { spawn } = require('child_process'); const os=require('os'), path=require('path'), fs=require('fs');
const url=process.argv[2], out1=process.argv[3], out2=process.argv[4], port=Number(process.argv[5]||9501);
const edge='C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const prof=path.join(os.tmpdir(),'edge-wt-'+Date.now());
  const child=spawn(edge,['--headless=new','--no-sandbox','--no-first-run','--remote-debugging-port='+port,'--user-data-dir='+prof,'--window-size=1400,860',url],{stdio:'ignore'});
  let wsUrl=null;
  for(let i=0;i<80&&!wsUrl;i++){try{const l=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();const p=l.find(t=>t.type==='page');if(p)wsUrl=p.webSocketDebuggerUrl;}catch(e){} if(!wsUrl)await sleep(500);}
  const ws=new WebSocket(wsUrl); await new Promise((res,rej)=>{ws.addEventListener('open',res);ws.addEventListener('error',rej);});
  let id=0; const call=(m,p)=>new Promise((resolve,reject)=>{const my=++id;const on=ev=>{const d=JSON.parse(ev.data);if(d.id!==my)return;ws.removeEventListener('message',on);d.error?reject(new Error(JSON.stringify(d.error))):resolve(d.result);};ws.addEventListener('message',on);ws.send(JSON.stringify({id:my,method:m,params:p||{}}));});
  const errs=[];
  ws.addEventListener('message', e => { const d=JSON.parse(e.data); if(d.method==='Runtime.exceptionThrown') errs.push(((d.params.exceptionDetails.exception||{}).description||'ex').slice(0,110)); });
  await call('Runtime.enable'); await call('Page.enable');
  await sleep(16000);
  const s1 = await call('Runtime.evaluate',{expression:`JSON.stringify({
     canvas: !!document.getElementById('world-tour-canvas'),
     title: (document.getElementById('wt-title')||{}).textContent||'',
     text: ((document.getElementById('wt-text')||{}).textContent||'').slice(0,80),
     progress: (document.getElementById('wt-progress')||{}).style.width
  })`,returnByValue:true});
  console.log("срез 1:", s1.result.value);
  let shot=await call('Page.captureScreenshot',{format:'png'}); fs.writeFileSync(out1, Buffer.from(shot.data,'base64'));
  await sleep(14000);
  const s2 = await call('Runtime.evaluate',{expression:`JSON.stringify({
     title: (document.getElementById('wt-title')||{}).textContent||'',
     progress: (document.getElementById('wt-progress')||{}).style.width
  })`,returnByValue:true});
  console.log("срез 2:", s2.result.value);
  shot=await call('Page.captureScreenshot',{format:'png'}); fs.writeFileSync(out2, Buffer.from(shot.data,'base64'));
  console.log("ошибки:", JSON.stringify(errs.slice(0,3)));
  ws.close(); child.kill(); process.exit(0);
})().catch(e=>{console.error('ERR',e.message);process.exit(1);});