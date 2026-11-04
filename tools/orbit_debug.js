const { spawn } = require('child_process'); const os=require('os'), path=require('path');
const url = process.argv[2], port = Number(process.argv[3]||9394);
const edge='C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const prof=path.join(os.tmpdir(),'edge-dbg-'+Date.now());
const child=spawn(edge,['--headless=new','--no-sandbox','--no-first-run','--remote-debugging-port='+port,'--user-data-dir='+prof,'--window-size=1400,900',url],{stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  let wsUrl=null;
  for(let i=0;i<80&&!wsUrl;i++){try{const l=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();const p=l.find(t=>t.type==='page');if(p)wsUrl=p.webSocketDebuggerUrl;}catch(e){} if(!wsUrl)await sleep(500);}
  const ws=new WebSocket(wsUrl); await new Promise((res,rej)=>{ws.addEventListener('open',res);ws.addEventListener('error',rej);});
  let id=0; const call=(m,p)=>new Promise((resolve,reject)=>{const my=++id;const on=ev=>{const d=JSON.parse(ev.data);if(d.id!==my)return;ws.removeEventListener('message',on);d.error?reject(new Error(JSON.stringify(d.error))):resolve(d.result);};ws.addEventListener('message',on);ws.send(JSON.stringify({id:my,method:m,params:p||{}}));});
  await call('Runtime.enable'); await sleep(9000);
  const expr=`JSON.stringify(['mercury','saturn','uranus'].map(function(id){
     var el=document.querySelector('.planet[data-planet-id="'+id+'"]');
     var w=el.closest('.planet-wrapper'), o=el.closest('.orbit');
     var m=(w.style.transform||'').match(/translate\\(\\s*(-?[\\d.]+)px,\\s*(-?[\\d.]+)px/);
     var tx=m?+m[1]:0, ty=m?+m[2]:0;
     var pth=o.querySelector('svg.orbit-path path'); var d=pth?pth.getAttribute('d'):'';
     var nums=(d.match(/-?\\d+(\\.\\d+)?/g)||[]).map(Number);
     var best=1e9, bx=0, by=0;
     function seg(px,py,ax,ay,bx2,by2){var dx=bx2-ax,dy=by2-ay,l2=dx*dx+dy*dy;if(!l2)return Math.hypot(px-ax,py-ay);var t=Math.max(0,Math.min(1,((px-ax)*dx+(py-ay)*dy)/l2));return Math.hypot(px-(ax+dx*t),py-(ay+dy*t));}
     for(var i=0;i+3<nums.length;i+=2){var dd=seg(tx,ty,nums[i],nums[i+1],nums[i+2],nums[i+3]); if(dd<best){best=dd;bx=nums[i];by=nums[i+1];}}
     var cc=window.WorldCoords.planetAt(id, Date.now());
     return {id:id, tx:+tx.toFixed(1), ty:+ty.toFixed(1), nearest:+best.toFixed(1), nx:bx, ny:by,
             calc:cc?[+cc.x.toFixed(1),+cc.y.toFixed(1)]:null, dist:+(m?Math.hypot(+m[1],+m[2]):0).toFixed(1)};
  }))`;
  const r=await call('Runtime.evaluate',{expression:expr,returnByValue:true,awaitPromise:true});
  console.log(r.result.value);
  ws.close(); child.kill(); process.exit(0);
})().catch(e=>{console.error('ERR',e.message);try{child.kill();}catch(x){}process.exit(1);});