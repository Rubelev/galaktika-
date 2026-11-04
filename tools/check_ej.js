
const fs=require('fs'),path=require('path'),vm=require('vm');
const code=fs.readFileSync(path.join(__dirname,'..','src','galaktika.Web','wwwroot','js','motion.js'),'utf8');
const sb={window:{},console:console,Date:Date,Math:Math};vm.createContext(sb);vm.runInContext(code,sb);
const M=sb.window.Motion, km=149600000/185, t0=7258075200000;
for (const sc of [1, 60]) {
  M.setScale(sc);
  const a=M.segmentPose(149,106,36,327,'ion_courier',0,t0);
  const b=M.segmentPose(149,106,36,327,'ion_courier',0,t0+3600000);
  const d=Math.hypot(b.x-a.x,b.y-a.y);
  console.log('scale',sc+'x','| период',Math.round(a.span),'с | за час',d.toFixed(1),'px | скорость',Math.round(d*km/3600).toLocaleString('ru-RU'),'км/с =',(d*km/3600/299792).toFixed(2)+'c');
}
