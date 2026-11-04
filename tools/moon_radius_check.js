const fs = require('fs'), path = require('path'), vm = require('vm');
const jsDir = path.join(__dirname, '..', 'src', 'galaktika.Web', 'wwwroot', 'js');
const sandbox = { window: {}, console, Math, Date, JSON, isFinite, document: { addEventListener(){}, querySelector: () => null, createElement: () => ({ style: {} }) } };
sandbox.window.window = sandbox.window;
vm.createContext(sandbox);
['orbit-kepler.js','scene-model.js'].forEach(f => vm.runInContext(fs.readFileSync(path.join(jsDir, f),'utf8'), sandbox, {filename:f}));
const cat = JSON.parse(fs.readFileSync(path.join(jsDir,'catalog.js'),'utf8').split('window.CATALOG = ')[1].replace(/;\s*$/,''));
const byId = {}; (cat.bodies||[]).forEach(b => { if ((b.system||'sol') === 'sol') byId[b.id] = b; });
const M = sandbox.window.SceneModel;
['io','moon','mimas','phobos','proteus','europa','ganymede','titan'].forEach(id => {
  const b = byId[id]; if (!b) { console.log(id, 'нет в каталоге'); return; }
  const f = M.orbitFrame(b, 0, byId);
  console.log(id.padEnd(10), 'parent', String(b.parent).padEnd(8), 'a=', b.a, '| R =', f.r.toFixed(1), '| |pos| =', Math.hypot(f.pos.x,f.pos.y).toFixed(1));
});