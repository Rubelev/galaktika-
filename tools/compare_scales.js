// Сравниваем таблицы шкал в трёх модулях
const fs=require('fs'), path=require('path'), vm=require('vm');
const dir=path.join(__dirname,'..','src','galaktika.Web','wwwroot','js');
function grab(file, varName){
  const src=fs.readFileSync(path.join(dir,file),'utf8');
  const i=src.indexOf(varName);
  if(i<0) return null;
  const open=src.indexOf('[', i);
  let d=0,end=-1;
  for(let k=open;k<src.length;k++){ const c=src[k]; if(c==='[')d++; else if(c===']'){d--; if(!d){end=k;break;}} }
  const sb={}; vm.createContext(sb);
  return vm.runInContext('('+src.slice(open,end+1)+')', sb);
}
const tables = {
  'solar.js': grab('solar.js','ORBIT_SCALE'),
  'worldcoords.js': grab('worldcoords.js','ORBIT_SCALE'),
  'motion.js': grab('motion.js','ORBIT_SCALE')
};
for (const k in tables) console.log(k, tables[k] ? JSON.stringify(tables[k]) : 'нет таблицы');
const a = JSON.stringify(tables['solar.js']);
const b = JSON.stringify(tables['worldcoords.js']);
const c = JSON.stringify(tables['motion.js']);
console.log('одинаковые таблицы:', a===b && b===c);