// Реестр миров: глобусы для известных систем и генерация для новых.
// Модуль отвечает за три вещи:
//   1) текстура глобуса (готовая карта или процедурная по адресу);
//   2) поселения мира (из данных или сгенерированные);
//   3) изменение населения со временем.

const KNOWN_TEX = {
    mercury: '/images/tex/mercury.webp',
    venus: '/images/tex/venus.webp',
    earth: '/images/tex/earth.webp',
    moon: '/images/tex/moon.webp',
    mars: '/images/tex/mars.webp',
    phobos: '/images/tex/phobos.webp',
    deimos: '/images/tex/deimos.webp',
    jupiter: '/images/tex/jupiter.webp',
    io: '/images/tex/io.webp',
    europa: '/images/tex/europa.webp',
    ganymede: '/images/tex/ganymede.webp',
    callisto: '/images/tex/callisto.webp',
    saturn: '/images/tex/saturn.webp',
    titan: '/images/tex/titan.webp',
    enceladus: '/images/tex/enceladus.webp',
    uranus: '/images/tex/uranus.webp',
    titania: '/images/tex/titania.webp',
    neptune: '/images/tex/neptune.webp',
    triton: '/images/tex/triton.webp',
    ceres: '/images/tex/ceres.jpg',
    belt: '/images/tex/ceres.jpg',
    kepler1: '/images/tex/kepler1.jpg'
};

const GAS = /saturn|jupiter|uranus|neptune|gas/i;

const registry = {};     // id -> { type, texture, settlements, pop, owner, era }
const texCache = {};
let planetgen = null;

export async function init() {
    if (planetgen) return;
    try {
        planetgen = await import('/js/planetgen.js');
    } catch (e) {
        console.warn('planetgen недоступен:', e);
    }
}

function hash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
}

function rng(seed) {
    let s = seed >>> 0;
    return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

function planetType(id, known) {
    if (GAS.test(id)) return 'gas';
    if (/ice|europa|enceladus|triton|phobos|deimos|titania/i.test(id)) return 'ice';
    if (/moon|ceres|belt|mercury/i.test(id)) return 'rocky';
    return 'earthlike';
}

export function texture(id) {
    if (KNOWN_TEX[id]) return KNOWN_TEX[id];
    if (texCache[id]) return texCache[id];
    if (!planetgen) return KNOWN_TEX.earth;
    const type = planetType(id, false);
    const canvas = planetgen.makePlanetCanvas(type, id, 1024, 512);
    texCache[id] = canvas.toDataURL('image/jpeg', 0.9);
    return texCache[id];
}

// Поселения известного мира приходят извне (WORLD_CITIES), новые — генерируются.
export function settlements(id, provided) {
    if (provided && provided.length) {
        registry[id] = registry[id] || {};
        registry[id].settlements = provided;
        registry[id].pop = provided.reduce((s, c) => s + (c.pop || 0), 0);
        registry[id].source = 'данные';
        return provided;
    }
    if (registry[id] && registry[id].settlements) return registry[id].settlements;

    const r = rng(hash(id));
    const n = 2 + Math.floor(r() * 2);
    const names = ['Первый посад', 'Артель', 'Орбитальный узел', 'Купола'];
    const kinds = ['столица', 'порт', 'добыча', 'жильё'];
    const out = [];
    for (let i = 0; i < n; i++) {
        out.push({
            name: id.replace(/_/g, '-') + ' · ' + names[i % names.length],
            lat: Math.round((-65 + r() * 130) * 10) / 10,
            lon: Math.round((-180 + r() * 360) * 10) / 10,
            pop: Math.round((1 + r() * 30)) * 1000000,
            hab: 1,
            type: kinds[i % kinds.length]
        });
    }
    registry[id] = { settlements: out, pop: out.reduce((s, c) => s + c.pop, 0), source: 'генерация' };
    return out;
}

// Рост населения: r % в год, но не выше предела жилого модуля.
export function grow(id, years, ratePct) {
    const rec = registry[id];
    if (!rec || !rec.settlements) return 0;
    const rate = (ratePct || 2) / 100;
    let before = 0, after = 0;
    rec.settlements.forEach(c => {
        before += c.pop || 0;
        const cap = (c.hab || 1) * 50000000;
        c.pop = Math.min(cap, Math.round((c.pop || 0) * Math.pow(1 + rate, years)));
        after += c.pop;
    });
    rec.pop = after;
    return after - before;
}

export function info(id) {
    const rec = registry[id];
    if (!rec) return null;
    return {
        id: id,
        pop: rec.pop,
        settlements: (rec.settlements || []).length,
        habitats: (rec.settlements || []).reduce((s, c) => s + (c.hab || 0), 0),
        source: rec.source
    };
}

export function all() { return Object.keys(registry).map(info); }
