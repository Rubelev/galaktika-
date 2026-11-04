// Скриншот карточки борта: клик по первому маркеру флота, затем снимок экрана.
const { spawn } = require('child_process'); const os=require('os'), path=require('path'), fs=require('fs');
const url=process.argv[2], out=process.argv[3], port=Number(process.argv[4]||9441);
const edge='C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const prof=path.join(os.tmpdir(),'edge-shot-'+Date.now());
const child=spawn(edge,['--headless=new','--no-sandbox','--no-first-run','--remote-debugging-port='+port,'--user-data-dir='+prof,'--window-size=1400,900',url],{stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  let wsUrl=null;
  for(let i=0;i<80&&!wsUrl;i++){try{const l=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();const p=l.find(t=>t.type==='page');if(p)wsUrl=p.webSocketDebuggerUrl;}catch(e){} if(!wsUrl)await sleep(500);}
  const ws=new WebSocket(wsUrl); await new Promise((res,rej)=>{ws.addEventListener('open',res);ws.addEventListener('error',rej);});
  let id=0; const call=(m,p)=>new Promise((resolve,reject)=>{const my=++id;const on=ev=>{const d=JSON.parse(ev.data);if(d.id!==my)return;ws.removeEventListener('message',on);d.error?reject(new Error(JSON.stringify(d.error))):resolve(d.result);};ws.addEventListener('message',on);ws.send(JSON.stringify({id:my,method:m,params:p||{}}));});
  const ev=async e=>{const r=await call('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true});return r.result&&r.result.value;};
  await call('Page.enable'); await call('Runtime.enable'); await sleep(9000);
  const pos=JSON.parse(await ev(`(function(){var el=document.querySelector('.ship-marker--fleet');var r=el.getBoundingClientRect();return JSON.stringify({x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)});})()`));
  await call('Input.dispatchMouseEvent',{type:'mousePressed',x:pos.x,y:pos.y,button:'left',clickCount:1});
  await call('Input.dispatchMouseEvent',{type:'mouseReleased',x:pos.x,y:pos.y,button:'left',clickCount:1});
  await sleep(900);
  const shot=await call('Page.captureScreenshot',{format:'png'});
  fs.writeFileSync(out, Buffer.from(shot.data,'base64'));
  console.log('скриншот сохранён: '+out);
  ws.close(); child.kill(); process.exit(0);
})().catch(e=>{console.error('ERR',e.message);try{child.kill();}catch(x){}process.exit(1);});