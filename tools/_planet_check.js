const AU_KM = 149597870.7;
const ORBITAL = {
    earth:   { a: 1.00000011, e: 0.0167086, peri: 102.93768193, M0: 357.52911, period: 365.256 },
    mars:    { a: 1.523679,   e: 0.0934,    peri: 336.04084,    M0: 19.41248,  period: 686.980 },
    ceres:   { a: 2.7675,     e: 0.0758,    peri: 73.6,          M0: 95.0,      period: 1681.6 },
    jupiter: { a: 5.20260,    e: 0.0489,    peri: 14.75385,      M0: 20.0202,   period: 4332.589 },
    saturn:  { a: 9.55491,    e: 0.05551,   peri: 92.43194,      M0: 317.0207,  period: 10759.22 },
    venus:   { a: 0.72333566, e: 0.00677672, peri: 131.60246718, M0: 181.97909950, period: 224.701 },
    mercury: { a: 0.38709927, e: 0.20563593, peri: 77.45779628,  M0: 174.79252722, period: 87.969 },
    uranus:  { a: 19.2184461, e: 0.04629590, peri: 170.96424,    M0: 142.2386,  period: 30685.4 },
    neptune: { a: 30.1103869, e: 0.00898809, peri: 44.97135,     M0: 256.228,   period: 60189.0 }
};

// Положение на орбите в плоскости эклиптики (а.е.).
function keplerPosition(body, days) {
    const el = ORBITAL[body];
    if (!el) return { x: 0, y: 0 };
    const M = (el.M0 + 360.0 * days / el.period) * Math.PI / 180;
    // уравнение Кеплера решаем итерациями Ньютона
    let E = M;
    for (let i = 0; i < 8; i++) {
        E = E - (E - el.e * Math.sin(E) - M) / (1 - el.e * Math.cos(E));
    }
    const nu = 2 * Math.atan2(Math.sqrt(1 + el.e) * Math.sin(E / 2),
                              Math.sqrt(1 - el.e) * Math.cos(E / 2));
    const r = el.a * (1 - el.e * Math.cos(E));
    const lam = el.peri * Math.PI / 180 + nu;
    return { x: r * Math.cos(lam), y: r * Math.sin(lam) };
}

// Позиция планеты для карты: радиус в а.е. и угол в радианах.
// Карта и расчёт расстояний теперь из одного источника.
export function planetPosition(body, days) {
    const el = ORBITAL[body];
    if (!el) return null;
    const M = (el.M0 + 360.0 * days / el.period) * Math.PI / 180;
    let E = M;
    for (let i = 0; i < 8; i++) {
        E = E - (E - el.e * Math.sin(E) - M) / (1 - el.e * Math.cos(E));
    }
    const nu = 2 * Math.atan2(Math.sqrt(1 + el.e) * Math.sin(E / 2),
                              Math.sqrt(1 - el.e) * Math.cos(E / 2));
    const r = el.a * (1 - el.e * Math.cos(E));
    return { r: r, lam: el.peri * Math.PI / 180 + nu };
}

function routeDistanceKm(def, nowMs) {
    if (!def || !def.fromBody || !def.toBody) return def ? def.distKm : 1e8;
    const days = nowMs / 86400000;
    const p1 = keplerPosition(def.fromBody, days);
    const p2 = keplerPosition(def.toBody, days);
    const dAu = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    return Math.max(1e6, dAu * AU_KM);
}


const AU = 149597870.7;
function orbitRadiusTest(au) { return 15 + 34 * Math.log(1 + au); }  // условная шкала
for (const body of ['mercury','venus','earth','mars','jupiter','saturn','uranus','neptune']) {
    const p0 = planetPosition(body, 0);
    const p1 = planetPosition(body, 9000);
    const r = p0.r;
    console.log(body.padEnd(9), 'r =', r.toFixed(3), 'а.е. | угол', (p0.lam*180/Math.PI).toFixed(1), '° →', (p1.lam*180/Math.PI).toFixed(1), '°');
}
// проверка: расстояние Земля-Марс по позициям
function dist(a, b, day) {
    const p1 = planetPosition(a, day), p2 = planetPosition(b, day);
    const x1 = p1.r*Math.cos(p1.lam), y1 = p1.r*Math.sin(p1.lam);
    const x2 = p2.r*Math.cos(p2.lam), y2 = p2.r*Math.sin(p2.lam);
    return Math.hypot(x2-x1, y2-y1) * AU;
}
let lo = 1e15, hi = 0;
for (let d = 0; d < 3000; d++) { const v = dist('earth','mars',d); if (v<lo) lo=v; if (v>hi) hi=v; }
console.log('Земля-Марс через planetPosition:', (lo/1e6).toFixed(1), '—', (hi/1e6).toFixed(1), 'млн км');
