
const fs=require('fs'),path=require('path'),vm=require('vm');
const code=fs.readFileSync(path.join(__dirname,'..','src','galaktika.Web','wwwroot','js','motion.js'),'utf8');
const sb={window:{},console:console,Date:Date,Math:Math};vm.createContext(sb);vm.runInContext(code,sb);
const M=sb.window.Motion, t0=7258075200000;
for(let i=0;i<7;i++){
  const a=M.shipPose(i,t0), b=M.shipPose(i,t0+3600000); // +1 час
  const d=Math.hypot(b.x-a.x,b.y-a.y);
  const km=149600000/185;
  console.log('борт',i, a.from+'->'+a.to, '| за час', d.toFixed(1),'px =', Math.round(d*km/3600).toLocaleString('ru-RU'),'км/с =', (d*km/3600/299792).toFixed(2)+'c');
}
