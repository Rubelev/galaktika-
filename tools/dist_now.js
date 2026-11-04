
const fs=require('fs'),path=require('path'),vm=require('vm');
const code=fs.readFileSync(path.join(__dirname,'..','src','galaktika.Web','wwwroot','js','motion.js'),'utf8');
const sb={window:{},console:console,Date:Date,Math:Math};vm.createContext(sb);vm.runInContext(code,sb);
const M=sb.window.Motion;
const kmPerAu = 149597870.7;

function report(label, when){
  const a = M.bodyAt('mars', when.getTime());
  const j = M.bodyAt('jupiter', when.getTime());
  const px = Math.hypot(j.x-a.x, j.y-a.y);
  const au = px / 185;
  const km = au * kmPerAu;
  console.log(label + ' (' + when.toISOString().slice(0,10) + '):');
  console.log('  Марс   r=' + a.au.toFixed(3) + ' а.е.');
  console.log('  Юпитер r=' + j.au.toFixed(3) + ' а.е.');
  console.log('  расстояние: ' + au.toFixed(3) + ' а.е. = ' + Math.round(km).toLocaleString('ru-RU') + ' км = ' + (km/1e6).toFixed(1) + ' млн км');
  console.log('  свет идёт: ' + Math.round(km/299792.458) + ' с (' + (km/299792.458/60).toFixed(1) + ' мин)');
  console.log('');
  return {au, km};
}

const real = new Date();                       // реальное «сейчас»
const game = new Date(real.getTime());
game.setFullYear(game.getFullYear() + 200);    // игровое время (2226)
const r = report('РЕАЛЬНОЕ время', real);
const g = report('ИГРОВОЕ время', game);
console.log('разница игрового и реального: ' + (g.km - r.km > 0 ? '+' : '') + Math.round((g.km - r.km)/1e6) + ' млн км');
