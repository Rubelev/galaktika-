const { spawn } = require('child_process'); const os=require('os'), path=require('path');
const url=process.argv[2], port=Number(process.argv[3]||9472);
const edge='C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const prof=path.join(os.tmpdir(),'edge-cand-'+Date.now());
  const child=spawn(edge,['--headless=new','--no-sandbox','--no-first-run','--remote-debugging-port='+port,'--user-data-dir='+prof,'--window-size=1400,900',url],{stdio:'ignore'});
  let wsUrl=null;
  for(let i=0;i<80&&!wsUrl;i++){try{const l=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();const p=l.find(t=>t.type==='page');if(p)wsUrl=p.webSocketDebuggerUrl;}catch(e){} if(!wsUrl)await sleep(500);}
  const ws=new WebSocket(wsUrl); await new Promise((res,rej)=>{ws.addEventListener('open',res);ws.addEventListener('error',rej);});
  let id=0; const call=(m,p)=>new Promise((resolve,reject)=>{const my=++id;const on=ev=>{const d=JSON.parse(ev.data);if(d.id!==my)return;ws.removeEventListener('message',on);d.error?reject(new Error(JSON.stringify(d.error))):resolve(d.result);};ws.addEventListener('message',on);ws.send(JSON.stringify({id:my,method:m,params:p||{}}));});
  const ev=async e=>{const r=await call('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true});return r.result&&r.result.value;};
  await call('Runtime.enable'); await sleep(9000);
  const cands = await ev(`JSON.stringify(Array.from(document.querySelectorAll('#left-menu *, .left-menu *')).filter(function(e){
        return /колони/i.test(e.textContent||'') && e.children.length===0;
    }).slice(0,6).map(function(e){ return {tag:e.tagName, cls:e.className, id:e.id, text:(e.textContent||'').trim().slice(0,40)}; }))`);
  console.log('кандидаты: ' + cands);
  const fn = await ev(`JSON.stringify({ColonyPanel: typeof window.ColonyPanel, openColony: typeof window.openColony, colonyUI: typeof window.colonyUI})`);
  console.log('функции: ' + fn);
  ws.close(); child.kill(); process.exit(0);
})().catch(e=>{console.error('ERR',e.message);process.exit(1);});