'use strict';
// Масштабы времени: кнопки скрыты, поэтому режимы ставим setTimeMode()+applyTimeScale()
// (эквивалент нажатия), а меряем и живое поведение, и отклик на шаг игрового времени.
const fs = require('fs');
const path = require('path');
const cdp = require('./_cdp.js');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'reports');
const token = fs.readFileSync(path.join(OUT, '_token.txt'), 'utf8').trim();
const KM = 149600000 / 185, C = 299792.458;

const SIDS = ['trade-earth-mars-0', 'fleet-0', 'portal-in', 'belt-0', 'pirate-0', 'civil-5'];

const READ = `(() => {
  const out = { sim: (typeof simulatedTime !== 'undefined' ? simulatedTime : null),
                ts: (typeof timeScale !== 'undefined' ? timeScale : null),
                freeze: (window.__freezeAt !== undefined ? window.__freezeAt : null),
                pos: {}, ang: {}, dev: {} };
  const P = {};
  document.querySelectorAll('.planet[data-planet-id]').forEach(el => {
    const r = el.getBoundingClientRect();
    P[el.getAttribute('data-planet-id')] = [r.left + r.width / 2, r.top + r.height / 2];
  });
  const sc = document.querySelector('.solar-system');
  const tr = sc ? (sc.style.transform || '') : '';
  const sm = tr.match(/scale\\(([-\\d.]+)\\)/);
  out.scale = sm ? +sm[1] : null;
  // координаты сцены -> экран
  const s = out.scale || 1;
  const inv = (x, y) => [innerWidth / 2 + x * s, innerHeight / 2 + y * s];
  const paths = { trade: [], fleet: [] };
  document.querySelectorAll('#trade-traffic path').forEach(p => paths.trade.push(p));
  document.querySelectorAll('#fleet-traffic path').forEach(p => paths.fleet.push(p));
  const distTo = (el, x, y) => {
    let best = Infinity;
    try {
      const L = el.getTotalLength();
      for (let i = 0; i <= 60; i++) { const q = el.getPointAtLength(L * i / 60); const d = Math.hypot(q.x - x, q.y - y); if (d < best) best = d; }
    } catch (e) { }
    return best;
  };
  document.querySelectorAll('.ship-marker').forEach(el => {
    const sid = el.dataset.sid || '';
    if (${JSON.stringify(SIDS)}.indexOf(sid) < 0) return;
    const t = el.style.transform || '';
    const m = t.match(/translate\\((-?[\\d.]+)px,\\s*(-?[\\d.]+)px\\)/);
    const a = t.match(/rotate\\((-?[\\d.]+)deg\\)/);
    if (!m) return;
    out.pos[sid] = [parseFloat(m[1]), parseFloat(m[2])];
    out.ang[sid] = a ? parseFloat(a[1]) : null;
    let best = Infinity;
    if (sid.indexOf('trade-') === 0) paths.trade.forEach(p => { best = Math.min(best, distTo(p, out.pos[sid][0], out.pos[sid][1])); });
    else if (sid.indexOf('fleet-') === 0) paths.fleet.forEach(p => { best = Math.min(best, distTo(p, out.pos[sid][0], out.pos[sid][1])); });
    else if (sid.indexOf('portal-') === 0 && paths.trade.length) { best = distTo(paths.trade[paths.trade.length - 1], out.pos[sid][0], out.pos[sid][1]); }
    else if (sid.indexOf('belt-') === 0) {
      try {
        const days = (simulatedTime - EPOCH_MS) / DAY_MS;
        const step = Math.max(1, Math.floor(beltA.length / 300));
        for (let i = 0; i < beltA.length; i += step) { const p = beltPos(i, days); const d = Math.hypot(p.x - out.pos[sid][0], p.y - out.pos[sid][1]); if (d < best) best = d; }
      } catch (e) { }
    }
    out.dev[sid] = isFinite(best) ? +best.toFixed(2) : null;
  });
  out.planets = P;
  return out;
})()`;

const SETMODE = (mode) => `(() => { try { setTimeMode('${mode}'); applyTimeScale(); } catch(e) { return 'ERR:' + e.message; }
  return { ts: (typeof timeScale !== 'undefined' ? timeScale : null), sim: (typeof simulatedTime !== 'undefined' ? simulatedTime : null) }; })()`;

const SETT = (t) => `(() => { window.__freezeAt = ${t}; return window.__freezeAt; })()`;

(async () => {
    const b = await cdp.launch();
    const pg = await cdp.newPage(b, 'https://warbattleuniverse.com/?shot=1&onb=1&test=1&token=' + token, { wait: 9000 });
    const sid = pg.sessionId;
    await cdp.evaluate(b, sid, `(() => { try { if (typeof scale === 'number') { scale = 0.95; window.updateSolarTransform(); } } catch(e){} return 1; })()`);
    await cdp.sleep(600);
    const out = { live: [], frozen: [], switching: [], frozenDiff: [] };

    // ---- 1) живой режим на каждом масштабе ----
    for (const mode of ['real', 'min', 'hour', 'day', 'year']) {
        const st = await cdp.evaluate(b, sid, SETMODE(mode));
        await cdp.sleep(500);
        const a = await cdp.evaluate(b, sid, READ);
        await cdp.sleep(1500);
        const c = await cdp.evaluate(b, sid, READ);
        const rows = {};
        for (const k of SIDS) {
            if (!a.pos[k] || !c.pos[k]) continue;
            const d = Math.hypot(c.pos[k][0] - a.pos[k][0], c.pos[k][1] - a.pos[k][1]);
            const dg = (c.sim - a.sim) / 1000;
            rows[k] = { d: +d.toFixed(2), dg: Math.round(dg), px45: dg ? +(d * 45 / dg).toFixed(3) : null, c: dg ? +(d * KM / dg / C).toFixed(4) : null };
        }
        out.live.push({ mode: mode, ts: st.ts, simA: a.sim, simC: c.sim, dg: +((c.sim - a.sim) / 1000).toFixed(0), rows: rows });
    }

    // ---- 2) переключение масштабов (прыжок сцены) ----
    await cdp.evaluate(b, sid, SETMODE('real'));
    await cdp.sleep(600);
    const s0 = await cdp.evaluate(b, sid, READ);
    await cdp.evaluate(b, sid, SETMODE('year'));
    await cdp.sleep(120);
    const s1 = await cdp.evaluate(b, sid, READ);
    await cdp.evaluate(b, sid, SETMODE('real'));
    await cdp.sleep(120);
    const s2 = await cdp.evaluate(b, sid, READ);
    await cdp.sleep(800);
    const s3 = await cdp.evaluate(b, sid, READ);
    const jump = (x, y) => { const r = {}; for (const k of SIDS) if (x.pos[k] && y.pos[k]) r[k] = +Math.hypot(y.pos[k][0] - x.pos[k][0], y.pos[k][1] - x.pos[k][1]).toFixed(2); return r; };
    out.switching = [{ step: '1x -> 1г', dg: Math.round((s1.sim - s0.sim) / 1000), d: jump(s0, s1) },
                     { step: '1г -> 1x', dg: Math.round((s2.sim - s1.sim) / 1000), d: jump(s1, s2) },
                     { step: '1x через 0,8 с', dg: Math.round((s3.sim - s2.sim) / 1000), d: jump(s2, s3) }];

    // ---- 3) замороженная серия: отклик на шаг игрового времени ----
    const base = await cdp.evaluate(b, sid, `(typeof simulatedTime !== 'undefined' ? simulatedTime : 0)`);
    await cdp.evaluate(b, sid, SETT(base));
    await cdp.sleep(300);
    const offsets = [0, 1, 60, 3600, 86400, 31536000];
    const samples = [];
    for (const off of offsets) {
        await cdp.evaluate(b, sid, SETT(base + off * 1000));
        await cdp.sleep(260);
        samples.push(Object.assign({ off: off }, await cdp.evaluate(b, sid, READ)));
    }
    out.frozen = samples;
    // проверка независимости от множителя при одном и том же freeze
    await cdp.evaluate(b, sid, SETMODE('year'));
    await cdp.sleep(200);
    const fy = await cdp.evaluate(b, sid, READ);
    await cdp.evaluate(b, sid, SETMODE('real'));
    await cdp.sleep(200);
    const fr = await cdp.evaluate(b, sid, READ);
    const dd = {};
    for (const k of SIDS) if (fy.pos[k] && fr.pos[k]) dd[k] = +Math.hypot(fr.pos[k][0] - fy.pos[k][0], fr.pos[k][1] - fy.pos[k][1]).toFixed(2);
    out.frozenDiff = [{ step: '1г -> 1x при одном __freezeAt', dg: Math.round((fr.sim - fy.sim) / 1000), d: dd }];

    fs.writeFileSync(path.join(OUT, '_scales.json'), JSON.stringify(out, null, 1), 'utf8');
    console.log(JSON.stringify({ live: out.live.map(l => ({ mode: l.mode, ts: l.ts, dg: l.dg, rows: l.rows })), switching: out.switching, frozenDiff: out.frozenDiff }, null, 1));
    await cdp.close(b);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
