'use strict';
const fs = require('fs');
const path = require('path');
const cdp = require('./_cdp.js');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'reports');
const token = fs.readFileSync(path.join(OUT, '_token.txt'), 'utf8').trim();

(async () => {
    const b = await cdp.launch();
    const url = 'https://warbattleuniverse.com/?shot=1&onb=1&freeze=100000&token=' + token;
    const { sessionId } = await cdp.newPage(b, url, { wait: 8000 });
    // rAF liveness
    const live = await cdp.evaluate(b, sessionId, `new Promise(res => {
        let n = 0; const t0 = performance.now();
        const tick = () => { n++; if (performance.now() - t0 < 1500) requestAnimationFrame(tick); else res({frames: n, ms: performance.now() - t0}); };
        requestAnimationFrame(tick);
    })`);
    // before/after force
    const probe = await cdp.evaluate(b, sessionId, `(() => {
        const read = () => Array.from(document.querySelectorAll('#trade-traffic .ship-marker')).map(el => {
            const m = (el.style.transform||'').match(/translate\\((-?[\\d.]+)px,\\s*(-?[\\d.]+)px\\)/);
            return { sid: el.dataset.sid, x: m?+m[1]:null, y: m?+m[2]:null, u: el.dataset.u };
        });
        const before = read();
        const t0 = performance.now();
        updateTradeTraffic(); updatePortalTraffic(); updateFleetTraffic(); updateFleetRoutes(); updateShipsUnified(); updateCivilTraffic(); updateElevators();
        const after = read();
        const cfg = {};
        // найти t, при котором u совпадёт с записанным: перебор по смещению
        const el = document.querySelector('#trade-traffic .ship-marker[data-sid="trade-earth-mars-0"]');
        return { before, after, sim: window.__freezeAt, motionNow: window.Motion.now(),
                 gravity: typeof updateElevators, cfg };
    })()`);
    const same = probe.before.every((s, i) => Math.abs(s.x - probe.after[i].x) < 0.05 && Math.abs(s.y - probe.after[i].y) < 0.05);
    const changed = probe.before.map((s, i) => ({ sid: s.sid, d: +Math.hypot(probe.after[i].x - s.x, probe.after[i].y - s.y).toFixed(2) }))
        .filter(r => r.d > 0.01).sort((a, c) => c.d - a.d);
    const res = { raf: live, forcedSame: same, changed, sim: probe.sim, motionNow: probe.motionNow };
    console.log(JSON.stringify(res, null, 1));
    fs.writeFileSync(path.join(OUT, '_diag_force.json'), JSON.stringify(res, null, 1), 'utf8');
    await cdp.close(b);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
