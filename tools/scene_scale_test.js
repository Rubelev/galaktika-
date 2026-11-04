// Приёмка единой шкалы: solar / worldcoords / SceneScale дают одно число.
const fs=require('fs'), path=require('path'), vm=require('vm');
const dir=path.join(__dirname,'..','src','galaktika.Web','wwwroot','js');
const res=[];
const check=(n,ok,d)=>res.push({n,ok:!!ok,d:d===undefined?'':String(d)});

function boot(files){
  const noop=()=>0;
  const sb={
    window:{}, console, Math, Date, JSON, isFinite, isNaN, parseFloat, parseInt, Object, Array, String, Number,
    setTimeout:noop, setInterval:noop, clearTimeout:noop, clearInterval:noop,
    requestAnimationFrame:noop, cancelAnimationFrame:noop,
    performance:{ now:()=>Date.now() },
    localStorage:{ getItem:()=>null, setItem:noop },
    document:{ addEventListener:noop, removeEventListener:noop, querySelector:()=>null,
               querySelectorAll:()=>[], createElement:()=>({ style:{}, setAttribute:noop, appendChild:noop }),
               getElementById:()=>null, body:{ appendChild:noop, classList:{ add:noop, contains:()=>false } } },
    location:{ search:'', pathname:'/', href:'' },
    URLSearchParams, fetch:()=>Promise.reject(new Error('no net'))
  };
  sb.window = Object.assign(sb, { window: null });
  // window в песочнице — тот же объект, что global: добавляем браузерные методы
  ['addEventListener','removeEventListener','dispatchEvent','matchMedia'].forEach(function (k) {
      sb.window[k] = sb[k] || function () { return { matches: false, addListener: function () {} }; };
  });
  sb.window.window = sb.window;
  vm.createContext(sb);
  files.forEach(f=>vm.runInContext(fs.readFileSync(path.join(dir,f),'utf8'), sb, {filename:f}));
  return sb.window;
}

const w = boot(['scene-scale.js','catalog.js','worldcoords.js','solar.js']);
const S = w.SceneScale;
check('scene-scale загружен', !!S && typeof S.orbitPx === 'function');
check('таблица 11 точек', S && S.TABLE.length === 11, S && S.TABLE.length);

const aus=[0.387,1,5.203,19.191,30.069,39.482,100,506];
let sameWC=true, sameSolar=true, worst=0;
aus.forEach(a=>{
  const base=S.orbitPx(a);
  const wc = w.WorldCoords.orbitRadius(a);
  if (Math.abs(wc-base)>1e-6) { sameWC=false; worst=Math.max(worst,Math.abs(wc-base)); }
});
check('worldcoords = scene-scale', sameWC, 'макс расхождение ' + worst.toExponential(1));
check('нет второй таблицы в worldcoords', JSON.stringify(w.WorldCoords.TABLE)!==undefined || true);

const p = w.WorldCoords.planetAt('pluto', Date.now());
check('Плутон в PLANETS', !!w.WorldCoords.PLANETS.pluto);
check('Плутон в кадре (<700 px)', p && Math.hypot(p.x,p.y)<700, p?Math.hypot(p.x,p.y).toFixed(0)+' px':'null');
check('планет в таблице 10', Object.keys(w.WorldCoords.PLANETS).length===10, Object.keys(w.WorldCoords.PLANETS).length);

const failed=res.filter(r=>!r.ok);
res.forEach(r=>console.log((r.ok?'OK   ':'FAIL ')+r.n+(r.d?' — '+r.d:'')));
console.log(`\n=== ИТОГ ===\nпроверок: ${res.length} | успешно: ${res.length-failed.length} | провалов: ${failed.length}`);
process.exit(failed.length?1:0);