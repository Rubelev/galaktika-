
const fs=require('fs'),path=require('path'),vm=require('vm');
const code=fs.readFileSync(path.join(__dirname,'..','src','galaktika.Web','wwwroot','js','motion.js'),'utf8');
const sb={window:{},console:console,Date:Date,Math:Math};vm.createContext(sb);vm.runInContext(code,sb);
const M=sb.window.Motion;
const r = M.TABLES.routes[0];
const kmPerPx = M.TABLES.motion.kmPerAu / M.TABLES.motion.pxPerAuAtEarth;
const v = M.shipSpeed(r.art);
const prof = M.flightProfile(r.len * kmPerPx, v);
console.log('route', r.id, 'len', r.len.toFixed(1), 'v', v, 'span', (r.span/1000).toFixed(1));
console.log('prof.total', prof.total.toFixed(1), 'tAcc', prof.tAcc.toFixed(1), 'tCruise', prof.tCruise.toFixed(1));
const ps = M.routePose(r.id, 0, Date.UTC(2200,0,1));
console.log('ps.total', ps.total.toFixed(1));
console.log('phases sum', (M.TABLES.phases.load + M.TABLES.phases.takeoff + prof.total + M.TABLES.phases.unload).toFixed(1));
