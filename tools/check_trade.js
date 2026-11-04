
const fs=require('fs'),path=require('path'),vm=require('vm');
const code=fs.readFileSync(path.join(__dirname,'..','src','galaktika.Web','wwwroot','js','motion.js'),'utf8');
const sb={window:{},console:console,Date:Date,Math:Math};vm.createContext(sb);vm.runInContext(code,sb);
const M=sb.window.Motion;
const kmPerPx = M.TABLES.motion.kmPerAu / M.TABLES.motion.pxPerAuAtEarth;
const t0 = 7258075200000;
const cases = [
  {ax:-27.1, ay:183.2, bx:-129.3, by:190.3, art:'ion_courier', ph:0.2},
  {ax:149.3, ay:106.3, bx:-209.7, by:-98.5, art:'jet_hauler', ph:0.9},
  {ax:36.0, ay:327.4, bx:177.1, by:-354.1, art:'grav_frigate', ph:0.6}
];
for (const c of cases) {
  const a = M.segmentPose(c.ax,c.ay,c.bx,c.by,c.art,c.ph,t0,0);
  const b = M.segmentPose(c.ax,c.ay,c.bx,c.by,c.art,c.ph,t0+60000,0);
  let du = b.u - a.u; if (du < -0.5) du += 1;
  const lenPx = Math.hypot(c.bx-c.ax, c.by-c.ay);
  const span = a.span;
  const expected = 60/span;
  const vEff = (lenPx*kmPerPx)/span;
  console.log(c.art.padEnd(12),
    'span='+Math.round(span)+'s',
    'Δu='+du.toFixed(5),
    'ожид='+expected.toFixed(5),
    'v_eff='+Math.round(vEff).toLocaleString('ru-RU')+' км/с',
    (vEff/299792).toFixed(2)+'c');
}
