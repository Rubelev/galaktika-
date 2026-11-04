
const fs=require('fs'),path=require('path'),vm=require('vm');
const code=fs.readFileSync(path.join(__dirname,'..','src','galaktika.Web','wwwroot','js','motion.js'),'utf8');
const sb={window:{},console:console,Date:Date,Math:Math};vm.createContext(sb);vm.runInContext(code,sb);
const M=sb.window.Motion, T=M.TABLES;
const kmPerPx=T.motion.kmPerAu/T.motion.pxPerAuAtEarth, c=T.motion.speedOfLight;
console.log('скорость света', c.toLocaleString('ru-RU'), 'км/с | база борта', T.motion.baseSpeedKmS.toLocaleString('ru-RU'), 'км/с | ускорение', T.motion.accelKmS2, 'км/с2');
for(const r of T.routes){
  const v=M.shipSpeed(r.art), prof=M.flightProfile(r.len*kmPerPx, v);
  const sec=prof.total;
  console.log(r.id.padEnd(15),
   'v='+Math.round(v).toLocaleString('ru-RU')+' км/с ('+(v/c).toFixed(2)+'c)',
   '| '+Math.round(r.len*kmPerPx/1e6)+' млн км',
   '| разгон '+Math.round(prof.tAcc)+' с',
   '| крейсер '+Math.round(prof.tCruise)+' с',
   '| торможение '+Math.round(prof.tAcc)+' с',
   '| итого '+Math.round(sec)+' игр. с = '+(sec/60).toFixed(1)+' реал. с');
}
