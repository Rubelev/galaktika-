// Извлекаем SOL_SYSTEM.planets из solar.js (данные → БД), без хрупких регулярок.
const fs = require('fs'), path = require('path'), vm = require('vm');
const file = path.join(__dirname, '..', 'src', 'galaktika.Web', 'wwwroot', 'js', 'solar.js');
const src = fs.readFileSync(file, 'utf8');
const startKey = src.indexOf('planets: [');
if (startKey < 0) { console.error('нет planets: ['); process.exit(1); }
const open = src.indexOf('[', startKey);
let depth = 0, end = -1;
for (let i = open; i < src.length; i++) {
    const ch = src[i];
    if (ch === '[') depth++;
    else if (ch === ']') { depth--; if (depth === 0) { end = i; break; } }
}
const literal = src.slice(open, end + 1);
const sandbox = {}; vm.createContext(sandbox);
const data = vm.runInContext('(' + literal + ')', sandbox);
fs.writeFileSync(path.join(__dirname, '..', 'reports', 'planets-dump.json'), JSON.stringify(data, null, 1));
const moons = data.reduce((n, p) => n + (p.moons ? p.moons.length : 0), 0);
console.log('планет:', data.length, '| лун:', moons, '| поля:', Object.keys(data[0]).join(','));