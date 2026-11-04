'use strict';
// Замороженная серия с гарантией отрисовки: ждём, пока пройдут 2 кадра rAF.
const fs = require('fs');
const path = require('path');
const cdp = require('./_cdp.js');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'reports');
const token = fs.readFileSync(path.join(OUT, '_token.txt'), 'utf8').trim();

const SIDS = ['trade-earth-mars-0', 'fleet-0', 'portal-in', 'belt-0', 'pirate-0', 'civil-5'];

const READ = `(() => {
  const out = { sim: (typeof simulatedTime !== 'undefined' ? simulatedTime : null), frames: window.__frames || 0, pos: {}, ang: {}, dev: {} };
  const paths = { trade: [], fleet: [] };
  document.querySelectorAll('#trade-traffic path').forEach(p => paths.trade.push(p));
  document.querySelectorAll('#fleet-traffic path').forEach(p => paths.fleet.push(p));
  const distTo = (el, x, y) => { let b = Infinity; try { const L = el.getTotalLength(); for (let i = 0; i <= 60; i++) { const q = el.getPointAtLength(L * i / 60); const d = Math.hypot(q.x - x, q.y - y); if (d < b) b = d; } } catch (e) { } return b; };
  document.querySelectorAll('.ship-marker').forEach(el => {
    const sid = el.dataset.sid || '';
    if (${JSON.stringify(SIDS)}.indexOf(sid) < 0) return;
    const t = el.style.transform || '';
    const m = t.match(/translate\\((-?[\\d.]+)px,\\s*(-?[\\d.]+)px\\)/);
    const a = t.match(/rotate\\((-?[\\d.]+)deg\\)/);
    if (!m) return;
    const x = parseFloat(m[1]), y = parseFloat(m[2]);
    out.pos[sid] = [x, y];
    out.ang[sid] = a ? parseFloat(a[1]) : null;
    let best = Infinity;
    if (sid.indexOf('trade-') === 0) paths.trade.forEach(p => { best = Math.min(best, distTo(p, x, y)); });
    else if (sid.indexOf('fleet-') === 0) paths.fleet.forEach(p => { best = Math.min(best, distTo(p, x, y)); });
    else if (sid.indexOf('portal-') === 0 && paths.trade.length) best = distTo(paths.trade[paths.trade.length - 1], x, y);
    else if (sid.indexOf('belt-') === 0) {
      try { const days = (simulatedTime - EPOCH_MS) / DAY_MS; const step = Math.max(1, Math.floor(beltA.length / 300));
        for (let i = 0; i < beltA.length; i += step) { const p = beltPos(i, days); const d = Math.hypot(p.x - x, p.y - y); if (d < best) best = d; } } catch (e) { }
    }
    out.dev[sid] = isFinite(best) ? +best.toFixed(2) : null;
  });
  return out;
})()`;

(async () => {
    const b = await cdp.launch();
    const pg = await cdp.newPage(b, 'https://warbattleuniverse.com/?shot=1&onb=1&test=1&token=' + token, { wait: 9000 });
    const sid = pg.sessionId;
    await cdp.evaluate(b, sid, `(() => { try { if (typeof scale === 'number') { scale = 0.95; window.updateSolarTransform(); } } catch(e){}
        window.__frames = 0; (function tick(){ window.__frames++; requestAnimationFrame(tick); })(); return 1; })()`);
    await cdp.sleep(800);
    const base = await cdp.evaluate(b, sid, `(typeof simulatedTime !== 'undefined' ? simulatedTime : 0)`);
    const offsets = [0, 1, 60, 3600, 86400, 31536000];
    const samples = [];
    for (const off of offsets) {
        await cdp.evaluate(b, sid, `(() => { window.__freezeAt = ${base} + ${off} * 1000; return 1; })()`);
        // ждём минимум 2 кадра и совпадения времени
        for (let i = 0; i < 30; i++) {
            await cdp.sleep(150);
            const st = await cdp.evaluate(b, sid, `({ f: window.__frames || 0, s: (typeof simulatedTime !== 'undefined' ? simulatedTime : null), t: window.__freezeAt })`);
            if (st.f >= (samples.length ? 2 : 1) && Math.abs(st.s - st.t) < 1) break;
        }
        await cdp.sleep(350);
        samples.push(Object.assign({ off: off }, await cdp.evaluate(b, sid, READ)));
    }
    fs.writeFileSync(path.join(OUT, '_scales2.json'), JSON.stringify({ base: base, samples: samples }, null, 1), 'utf8');
    console.log(JSON.stringify(samples.map(s => ({ off: s.off, frames: s.frames, sim: s.sim, pos: s.pos })), null, 1));
    await cdp.close(b);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
