'use strict';
// Пояс: жив ли цикл (борт ездит к планете и обратно) и какова его скорость по шагам времени.
// Портал: дрожание позы между соседними кадрами (шаг 1 игровая секунда).
const fs = require('fs');
const path = require('path');
const cdp = require('./_cdp.js');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'reports');
const token = fs.readFileSync(path.join(OUT, '_token.txt'), 'utf8').trim();
const KM = 149600000 / 185, C = 299792.458;

const READ = `(() => {
  const out = { pos: {}, ang: {} };
  document.querySelectorAll('.ship-marker').forEach(el => {
    const sid = el.dataset.sid || '';
    if (!sid) return;
    const tr = el.style.transform || '';
    const m = tr.match(/translate\\((-?[\\d.]+)px,\\s*(-?[\\d.]+)px\\)/);
    const a = tr.match(/rotate\\((-?[\\d.]+)deg\\)/);
    if (m) { out.pos[sid] = [parseFloat(m[1]), parseFloat(m[2])]; out.ang[sid] = a ? parseFloat(a[1]) : null; }
  });
  return out;
})()`;

const setT = (t) => `(() => { window.__freezeAt = ${t}; return window.__freezeAt; })()`;

(async () => {
    const b = await cdp.launch();
    const pg = await cdp.newPage(b, 'https://warbattleuniverse.com/?shot=1&onb=1&freeze=100000&token=' + token, { wait: 9000 });
    const sid = pg.sessionId;
    await cdp.evaluate(b, sid, `(() => { try { if (typeof scale === 'number') { scale = 0.95; window.updateSolarTransform(); } } catch(e){} return 1; })()`);
    await cdp.sleep(700);
    const base = await cdp.evaluate(b, sid, `window.__freezeAt`);

    // --- 1) пояс: 28 сэмплов через 500 игровых секунд (полный цикл ~13 500 с) ---
    const beltSamples = [];
    for (let off = 0; off <= 13500; off += 500) {
        await cdp.evaluate(b, sid, setT(base + off * 1000));
        await cdp.sleep(180);
        const r = await cdp.evaluate(b, sid, READ);
        const row = { off: off, r: {} };
        for (const k in r.pos) {
            if (k.indexOf('belt-') === 0) row.r[k] = [r.pos[k][0], r.pos[k][1], +Math.hypot(r.pos[k][0], r.pos[k][1]).toFixed(1)];
        }
        beltSamples.push(row);
    }
    // --- 2) портал: 12 сэмплов по 1 игровой секунде ---
    const portalSamples = [];
    for (let off = 0; off <= 11; off += 1) {
        await cdp.evaluate(b, sid, setT(base + 5000 + off * 1000));
        await cdp.sleep(180);
        const r = await cdp.evaluate(b, sid, READ);
        portalSamples.push({ off: off, out: r.pos['portal-out'] ? [r.pos['portal-out'][0], r.pos['portal-out'][1], r.ang['portal-out']] : null,
                             in: r.pos['portal-in'] ? [r.pos['portal-in'][0], r.pos['portal-in'][1], r.ang['portal-in']] : null });
    }
    // --- разбор ---
    const beltIds = Object.keys(beltSamples[0].r);
    const belt = {};
    for (const id of beltIds) {
        const radii = beltSamples.map(s => s.r[id] ? s.r[id][2] : null).filter(v => v !== null);
        let maxStep = 0;
        for (let i = 1; i < beltSamples.length; i++) {
            const a = beltSamples[i - 1].r[id], c = beltSamples[i].r[id];
            if (!a || !c) continue;
            const d = Math.hypot(c[0] - a[0], c[1] - a[1]);
            if (d > maxStep) maxStep = d;
        }
        belt[id] = { rMin: Math.min(...radii), rMax: Math.max(...radii), rRange: +(Math.max(...radii) - Math.min(...radii)).toFixed(1),
                     moved: ids => 0, maxStep500: +maxStep.toFixed(1), px45: +(maxStep * 45 / 500).toFixed(2),
                     unique: new Set(beltSamples.map(s => s.r[id] ? s.r[id][0] + ',' + s.r[id][1] : '')).size };
    }
    const portalSteps = [];
    for (let i = 1; i < portalSamples.length; i++) {
        const a = portalSamples[i - 1], c = portalSamples[i];
        const step = (x, y) => (x && y) ? +Math.hypot(y[0] - x[0], y[1] - x[1]).toFixed(3) : null;
        portalSteps.push({ off: c.off, out: step(a.out, c.out), in: step(a.in, c.in),
                           dAngOut: (a.out && c.out && a.out[2] !== null && c.out[2] !== null) ? +(c.out[2] - a.out[2]).toFixed(2) : null,
                           dAngIn: (a.in && c.in && a.in[2] !== null && c.in[2] !== null) ? +(c.in[2] - a.in[2]).toFixed(2) : null });
    }
    const res = { base: base, belt: belt, beltSamples: beltSamples, portalSamples: portalSamples, portalSteps: portalSteps };
    fs.writeFileSync(path.join(OUT, '_belt10.json'), JSON.stringify(res, null, 1), 'utf8');
    console.log(JSON.stringify({ belt: belt, portalSteps: portalSteps }, null, 1));
    await cdp.close(b);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
