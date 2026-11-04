
const fs=require('fs'),path=require('path'),vm=require('vm');
const code=fs.readFileSync(path.join(__dirname,'..','src','galaktika.Web','wwwroot','js','motion.js'),'utf8');
const sb={window:{},console:console,Date:Date,Math:Math};vm.createContext(sb);vm.runInContext(code,sb);
const M=sb.window.Motion, T=M.TABLES;
for(const r of T.routes) console.log(r.id.padEnd(15), 'span', Math.round(r.span/1000),'s =', (r.span/1000/60).toFixed(1),'мин реальных (60x)');
for(const [i,sch] of M.SCHEDULES.entries()){
  const fly = sch.legs.filter(l=>l.kind==='fly');
  console.log('борт',i,'рейсов',fly.length,'| средний', Math.round(sch.total/fly.length),'с =', (sch.total/fly.length/60).toFixed(1),'мин');
}
