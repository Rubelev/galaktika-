
const fs=require('fs'),path=require('path'),vm=require('vm');
const code=fs.readFileSync(path.join(__dirname,'..','src','galaktika.Web','wwwroot','js','motion.js'),'utf8');
const sb={window:{},console:console,Date:Date,Math:Math};vm.createContext(sb);vm.runInContext(code,sb);
const M=sb.window.Motion;
const i=0, sch=M.SCHEDULES[i], span=sch.total*1000, base=Date.UTC(2200,0,1);
let prev=null,best=0,info=null;
for(let g=0; g<=span; g+=250){
  const ps=M.shipPose(i, base+g);
  if(!ps) continue;
  if(prev){
    const d=Math.hypot(ps.x-prev.x, ps.y-prev.y);
    if(d>best){best=d;info={g, before:prev.leg+'/'+prev.phase, after:ps.leg+'/'+ps.phase, x0:prev.x,y0:prev.y,x1:ps.x,y1:ps.y};}
  }
  prev=ps;
}
console.log('макс шаг',best.toFixed(1),'на g =',info.g,'| фазы:',info.before,'->',info.after);
console.log('точка',info.x0.toFixed(0),info.y0.toFixed(0),'->',info.x1.toFixed(0),info.y1.toFixed(0));
console.log('legs:', sch.legs.map(l=>l.kind+':'+(l.from||l.at)+'->'+(l.to||'-')+'/'+Math.round(l.seconds)).join(' | '));
