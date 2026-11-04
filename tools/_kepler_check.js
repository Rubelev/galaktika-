const AU_KM = 149597870.7;
const ORBITAL = {
    earth:   { a: 1.00000011, e: 0.0167086, peri: 102.93768193, M0: 357.52911, period: 365.256 },
    mars:    { a: 1.523679,   e: 0.0934,    peri: 336.04084,    M0: 19.41248,  period: 686.980 },
    ceres:   { a: 2.7675,     e: 0.0758,    peri: 73.6,          M0: 95.0,      period: 1681.6 },
    jupiter: { a: 5.20260,    e: 0.0489,    peri: 14.75385,      M0: 20.0202,   period: 4332.589 },
    saturn:  { a: 9.55491,    e: 0.05551,   peri: 92.43194,      M0: 317.0207,  period: 10759.22 }
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

function routeDistanceKm(def, nowMs) {
    if (!def || !def.fromBody || !def.toBody) return def ? def.distKm : 1e8;
    const days = nowMs / 86400000;
    const p1 = keplerPosition(def.fromBody, days);
    const p2 = keplerPosition(def.toBody, days);
    const dAu = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    return Math.max(1e6, dAu * AU_KM);
}


const days = (d) => d * 86400000;
let lo = {d: 1e15, day: 0}, hi = {d: 0, day: 0}, sum = 0, n = 0;
for (let day = 0; day < 3000; day++) {
    const dd = routeDistanceKm({ fromBody: 'earth', toBody: 'mars' }, days(day));
    if (dd < lo.d) lo = { d: dd, day };
    if (dd > hi.d) hi = { d: dd, day };
    sum += dd; n++;
}
console.log('Земля-Марс:', (lo.d/1e6).toFixed(1), '—', (hi.d/1e6).toFixed(1), 'млн км, среднее', (sum/n/1e6).toFixed(1));
for (const pair of [['earth','ceres'], ['ceres','jupiter'], ['jupiter','saturn']]) {
    let a = 1e15, b = 0;
    for (let day = 0; day < 4000; day += 3) {
        const dd = routeDistanceKm({ fromBody: pair[0], toBody: pair[1] }, days(day));
        if (dd < a) a = dd; if (dd > b) b = dd;
    }
    console.log(pair[0] + '-' + pair[1] + ':', (a/1e6).toFixed(0), '—', (b/1e6).toFixed(0), 'млн км');
}
