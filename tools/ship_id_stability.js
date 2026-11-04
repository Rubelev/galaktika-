// Проверка стабильности id: две загрузки подряд, сравнение набора data-sid.
const { spawn } = require('child_process'); const os=require('os'), path=require('path');
const url=process.argv[2];
const edge='C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function one(port){
  const prof=path.join(os.tmpdir(),'edge-sid-'+port+'-'+Date.now());
  const child=spawn(edge,['--headless=new','--no-sandbox','--no-first-run','--remote-debugging-port='+port,'--user-data-dir='+prof,'--window-size=1400,900',url],{stdio:'ignore'});
  let wsUrl=null;
  for(let i=0;i<80&&!wsUrl;i++){try{const l=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();const p=l.find(t=>t.type==='page');if(p)wsUrl=p.webSocketDebuggerUrl;}catch(e){} if(!wsUrl)await sleep(500);}
  const ws=new WebSocket(wsUrl); await new Promise((res,rej)=>{ws.addEventListener('open',res);ws.addEventListener('error',rej);});
  let id=0; const call=(m,p)=>new Promise((resolve,reject)=>{const my=++id;const on=ev=>{const d=JSON.parse(ev.data);if(d.id!==my)return;ws.removeEventListener('message',on);d.error?reject(new Error(JSON.stringify(d.error))):resolve(d.result);};ws.addEventListener('message',on);ws.send(JSON.stringify({id:my,method:m,params:p||{}}));});
  await call('Runtime.enable'); await sleep(9000);
  const r=await call('Runtime.evaluate',{expression:"JSON.stringify(Array.from(document.querySelectorAll('.ship-marker--fleet')).map(function(e){return e.dataset.sid;}))",returnByValue:true});
  ws.close(); child.kill();
  return JSON.parse(r.result.value);
}
(async()=>{
  const a=await one(9451);
  const b=await one(9452);
  const sa=a.slice().sort().join('|'), sb=b.slice().sort().join('|');
  console.log('борта 1:', a.slice(0,6).join(', '));
  console.log('борта 2:', b.slice(0,6).join(', '));
  console.log('всего:', a.length, '/', b.length, '| совпадают:', sa===sb);
  const bad = a.filter(x=>!x || /^fleet-\d+$/.test(x));
  console.log(bad.length ? ('ОСТАЛИСЬ индексы: '+bad.join(', ')) : 'индексов fleet-N не осталось');
  process.exit(sa===sb && bad.length===0 ? 0 : 1);
})().catch(e=>{console.error('ERR',e.message);process.exit(1);});