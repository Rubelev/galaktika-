
const fs=require('fs'),path=require('path'),vm=require('vm');
const code=fs.readFileSync(path.join(__dirname,'..','src','galaktika.Web','wwwroot','js','motion.js'),'utf8');
const sb={window:{},console:console,Date:Date,Math:Math};vm.createContext(sb);vm.runInContext(code,sb);
const M=sb.window.Motion;
const kmPerPx=M.TABLES.motion.kmPerAu/M.TABLES.motion.pxPerAuAtEarth;
for(const r of M.TABLES.routes){
  const v=M.shipSpeed(r.art);
  const sec=r.span/1000;
  const pxPerSec=r.len/(sec/1);
  const kmS=pxPerSec*kmPerPx;
  console.log(r.id.padEnd(16), 'v='+Math.round(v).toLocaleString('ru-RU'),'км/с',
    '| путь', Math.round(r.len*kmPerPx/1e6)+' млн км',
    '| игровых сек', Math.round(sec),
    '| реальных сек', Math.round(sec/60),
    '| на карте', Math.round(kmS).toLocaleString('ru-RU'),'км/с (', (kmS/299792).toFixed(2),'c )');
}
