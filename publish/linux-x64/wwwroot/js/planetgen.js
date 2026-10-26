// Генератор текстур планет: детерминированный, без внешних картинок.
// Типы: earthlike (континенты, океаны, льды), gas (полосы гиганта), rocky, ice.
// Возвращает canvas в равнопромежуточной проекции 2:1 — его можно натянуть на шар.

function hash32(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
}

function mulberry32(a) {
    return function () {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// Простой value noise по решётке с билинейной интерполяцией.
function makeNoise(rand, size) {
    const g = new Float32Array(size * size);
    for (let i = 0; i < g.length; i++) g[i] = rand();
    const at = (x, y) => g[((y % size + size) % size) * size + ((x % size + size) % size)];
    return function (x, y) {
        const xi = Math.floor(x), yi = Math.floor(y);
        const xf = x - xi, yf = y - yi;
        const u = xf * xf * (3 - 2 * xf);
        const v = yf * yf * (3 - 2 * yf);
        const a = at(xi, yi), b = at(xi + 1, yi), c = at(xi, yi + 1), d = at(xi + 1, yi + 1);
        return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
    };
}

function fbm(noise, x, y, octaves) {
    let sum = 0, amp = 0.5, freq = 1;
    for (let i = 0; i < octaves; i++) {
        sum += noise(x * freq, y * freq) * amp;
        freq *= 2; amp *= 0.5;
    }
    return sum;
}

export function makePlanetCanvas(type, seedText, w, h) {
    w = w || 1024; h = h || 512;
    const seed = hash32(type + ':' + seedText);
    const rand = mulberry32(seed);
    const noise = makeNoise(rand, 64);

    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(w, h);
    const d = img.data;

    for (let y = 0; y < h; y++) {
        const lat = 1 - (y / h) * 2;                 // 1 полюс, -1 полюс
        for (let x = 0; x < w; x++) {
            const lon = (x / w) * 6.28318;
            let r, g, b;
            const n = fbm(noise, (x / w) * 8 + seed % 7, (y / h) * 4, 4);

            if (type === 'gas') {
                // полосы по широте + турбулентность
                const band = Math.sin(lat * 9 + n * 2.2);
                const t = (band + 1) / 2;
                r = 210 - t * 90 + n * 40;
                g = 170 - t * 70 + n * 30;
                b = 120 + t * 40 + n * 25;
                if (Math.abs(lat) > 0.75) { r *= 0.85; g *= 0.85; b *= 0.9; }
            } else if (type === 'ice') {
                const t = 0.75 + n * 0.25;
                r = 200 * t; g = 220 * t; b = 240 * t;
            } else if (type === 'rocky') {
                const t = 0.45 + n * 0.55;
                r = 150 * t; g = 130 * t; b = 115 * t;
                const crater = fbm(noise, x / w * 24, y / h * 12, 3);
                if (crater > 0.62) { r *= 0.72; g *= 0.72; b *= 0.75; }
            } else {
                // earthlike: суша/вода/льды
                const land = n > 0.52;
                const pole = Math.abs(lat) > 0.82 - n * 0.05;
                if (pole) { r = 232; g = 240; b = 248; }
                else if (land) {
                    const alt = (n - 0.52) / 0.48;
                    r = 90 + alt * 90; g = 120 + alt * 70; b = 70 + alt * 40;
                    if (alt > 0.72) { r = 170; g = 160; b = 150; }      // горы
                    if (Math.abs(lat) < 0.28 && alt < 0.25) { r = 120; g = 150; b = 80; } // тропики
                } else {
                    const depth = (0.52 - n) / 0.52;
                    r = 20; g = 70 - depth * 30; b = 120 + depth * 60;
                }
                // облака
                const cloud = fbm(noise, x / w * 5 + 11, y / h * 3 + 7, 3);
                if (cloud > 0.66) {
                    const a = Math.min(1, (cloud - 0.66) / 0.2) * 0.85;
                    r = r * (1 - a) + 245 * a; g = g * (1 - a) + 248 * a; b = b * (1 - a) + 252 * a;
                }
            }

            const i = (y * w + x) * 4;
            d[i] = Math.max(0, Math.min(255, r));
            d[i + 1] = Math.max(0, Math.min(255, g));
            d[i + 2] = Math.max(0, Math.min(255, b));
            d[i + 3] = 255;
        }
    }
    ctx.putImageData(img, 0, 0);
    return c;
}

// Текстура колец: тонкие концентрические полосы, прозрачность по радиусу.
export function makeRingCanvas(seedText, w) {
    w = w || 512;
    const c = document.createElement('canvas');
    c.width = w; c.height = 8;
    const ctx = c.getContext('2d');
    const rand = mulberry32(hash32('ring:' + seedText));
    const img = ctx.createImageData(w, 8);
    for (let x = 0; x < w; x++) {
        const t = x / w;
        let a = 0.35 + 0.35 * Math.sin(t * 60 + rand() * 0.2);
        a *= 0.4 + 0.6 * rand();
        if (t < 0.08 || t > 0.96) a *= 0.2;
        const shade = 190 + Math.sin(t * 22) * 40;
        for (let y = 0; y < 8; y++) {
            const i = (y * w + x) * 4;
            img.data[i] = shade; img.data[i + 1] = shade * 0.94; img.data[i + 2] = shade * 0.82;
            img.data[i + 3] = Math.max(0, Math.min(255, a * 255));
        }
    }
    ctx.putImageData(img, 0, 0);
    return c;
}
