
const fs=require('fs'),path=require('path'),vm=require('vm');
const code=fs.readFileSync(path.join(__dirname,'..','src','galaktika.Web','wwwroot','js','motion.js'),'utf8');
const sb={window:{},console:console,Date:Date,Math:Math};vm.createContext(sb);vm.runInContext(code,sb);
const M=sb.window.Motion, T=M.TABLES;
for(const r of T.routes){
  const sec = r.span/1000, real = sec/60;
  console.log(r.id.padEnd(15), 'span', Math.round(sec)+'с', '| реально', (real/60).toFixed(1)+' мин');
}
