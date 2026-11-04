'use strict';
// Собственный сэмплер дрожания: node _38b.js <tilt> <spin> [catalog]
const fs = require('fs');
const path = require('path');
const cdp = require('./_cdp.js');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'reports');
const token = fs.readFileSync(path.join(OUT, '_token.txt'), 'utf8').trim();
const BASE = 'https://warbattleuniverse.com/';

const SAMPLE = `(() => new Promise(resolve => {
  const t0 = performance.now();
  const frames = [];
  const ids = [];
  const els = Array.from(document.querySelectorAll('.planet[data-planet-id]')).slice(0, 9);
  els.forEach(e => ids.push(e.getAttribute('data-planet-id')));
  function tick() {
    frames.push(els.map(e => { const r = e.getBoundingClientRect(); return [r.left + r.width/2, r.top + r.height/2]; }));
    if (performance.now() - t0 < 3000) requestAnimationFrame(tick); else finish();
  }
  function finish() {
    const out = [];
    for (let i = 0; i < ids.length; i++) {
      const steps = [], accs = [];
      for (let k = 1; k < frames.length; k++) {
        const dx = frames[k][i][0] - frames[k-1][i][0], dy = frames[k][i][1] - frames[k-1][i][1];
        steps.push(Math.hypot(dx, dy));
      }
      for (let k = 1; k < steps.length; k++) accs.push(Math.abs(steps[k] - steps[k-1]));
      const avg = steps.reduce((a,b)=>a+b,0)/Math.max(1,steps.length);
      const max = Math.max(...steps, 0);
      const acc = accs.reduce((a,b)=>a+b,0)/Math.max(1,accs.length);
      out.push({ id: ids[i], frames: frames.length, avgPx: +avg.toFixed(2), maxPx: +max.toFixed(2), accPx: +acc.toFixed(2), score: +(acc/Math.max(0.001,avg)).toFixed(2) });
    }
    const w = document.querySelector('.planet[data-planet-id="earth"]');
    const wrap = w ? w.parentElement : null;
    const cs = w ? getComputedStyle(w) : null;
    const cw = wrap ? getComputedStyle(wrap) : null;
    resolve({ out: out, frames: frames.length, dt: (performance.now()-t0),
      planetTransform: w ? w.style.transform : null, wrapTransform: wrap ? wrap.style.transform : null,
      wrapClass: wrap ? wrap.className : null,
      pf: w ? (w.style.left || w.style.top) : null,
      transition: cs ? { prop: cs.transitionProperty, dur: cs.transitionDuration, timing: cs.transitionTimingFunction } : null,
      wrapTransition: cw ? { prop: cw.transitionProperty, dur: cw.transitionDuration } : null,
      orbitTransition: (() => { const o = document.querySelector('.orbit'); const co = o ? getComputedStyle(o) : null; return co ? { prop: co.transitionProperty, dur: co.transitionDuration } : null; })(),
      sceneTransform: getComputedStyle(document.querySelector('.solar-system')).transform });
  }
  requestAnimationFrame(tick);
}))()`;

(async () => {
    const tilt = process.argv[2] || '0', spin = process.argv[3] || '0';
    const extra = process.argv[4] === 'catalog' ? '&render=catalog' : '';
    const b = await cdp.launch({ width: 1400, height: 900, port: 9500 + Math.floor(Math.random() * 200) });
    const url = BASE + '?shot=1&onb=1&tilt=' + tilt + '&spin=' + spin + extra + '&token=' + token;
    const pg = await cdp.newPage(b, url, { wait: 10000 });
    const r = await cdp.evaluate(b, pg.sessionId, SAMPLE);
    const key = 't' + tilt + '_s' + spin + (extra ? '_cat' : '');
    fs.writeFileSync(path.join(OUT, '_38b_' + key + '.json'), JSON.stringify(r, null, 1), 'utf8');
    console.log(key, 'frames:', r.frames, 'dt:', Math.round(r.dt), '| transition:', JSON.stringify(r.transition), '| wrap:', JSON.stringify(r.wrapTransition), '| orbit:', JSON.stringify(r.orbitTransition));
    console.log('   planet.tr=', JSON.stringify(r.planetTransform), 'wrap.tr=', JSON.stringify(r.wrapTransform), 'scene=', r.sceneTransform.slice(0, 60));
    for (const x of r.out) console.log('   ', x.id, 'avg', x.avgPx, 'max', x.maxPx, 'score', x.score);
    await cdp.close(b);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
