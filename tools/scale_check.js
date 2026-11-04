
const fs=require('fs'),path=require('path'),vm=require('vm');
const code=fs.readFileSync(path.join(__dirname,'..','src','galaktika.Web','wwwroot','js','motion.js'),'utf8');
const sb={window:{},console:console,Date:Date,Math:Math};vm.createContext(sb);vm.runInContext(code,sb);
const M=sb.window.Motion, t0=7258075200000;
for (const sc of [1, 60]) {
  M.setScale(sc);
  const r = M.segmentPose(-27,183,-129,190,'ion_courier',0,t0);
  console.log('масштаб', sc+'x', '| период', Math.round(r.span), 'с | реально', (r.span/sc/60).toFixed(1), 'мин');
}
