
const fs=require('fs'),path=require('path'),vm=require('vm');
const code=fs.readFileSync(path.join(__dirname,'..','src','galaktika.Web','wwwroot','js','motion.js'),'utf8');
const sb={window:{},console:console,Date:Date,Math:Math};vm.createContext(sb);vm.runInContext(code,sb);
const M=sb.window.Motion;

// игровое «сейчас»: реальное время + 200 лет (как в игре)
const now = new Date();
const game = new Date(now.getTime());
game.setFullYear(game.getFullYear() + 200);
const t = game.getTime();

const a = M.bodyAt('mars', t), j = M.bodyAt('jupiter', t);
const px = Math.hypot(j.x - a.x, j.y - a.y);
const AU = 185;                              // пикселей на 1 а.е.
const au = px / AU;
const kmPerAu = 149597870.7;
const km = au * kmPerAu;

console.log('игровое время:', game.toISOString().slice(0,19).replace('T',' '));
console.log('Марс:      x=' + a.x.toFixed(1) + ' y=' + a.y.toFixed(1) + '  (r=' + Math.hypot(a.x,a.y).toFixed(0) + ' px, ' + a.au.toFixed(3) + ' а.е.)');
console.log('Юпитер:    x=' + j.x.toFixed(1) + ' y=' + j.y.toFixed(1) + '  (r=' + Math.hypot(j.x,j.y).toFixed(0) + ' px, ' + j.au.toFixed(3) + ' а.е.)');
console.log('расстояние на карте:', px.toFixed(1), 'px =', au.toFixed(4), 'а.е.');
console.log('расстояние в км:    ', Math.round(km).toLocaleString('ru-RU'), 'км =', (km/1e6).toFixed(1), 'млн км');

const v1 = km / 0.83;                       // за 0,83 РЕАЛЬНОЙ секунды
const v2 = km / (0.83 * 60);                // за 0,83 игровой секунды (1 с = 60 игровых)
const c = 299792.458;
console.log('');
console.log('за 0,83 реальной секунды нужно:', Math.round(v1).toLocaleString('ru-RU'), 'км/с =', (v1/c).toFixed(2), 'c');
console.log('за 0,83 игровой секунды нужно: ', Math.round(v2).toLocaleString('ru-RU'), 'км/с =', (v2/c).toFixed(2), 'c');
