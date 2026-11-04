'use strict';
const fs = require('fs');
const path = require('path');
const cdp = require('./_cdp.js');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'reports');
const token = fs.readFileSync(path.join(OUT, '_token.txt'), 'utf8').trim();
const BASE = 'https://warbattleuniverse.com/';
const PROBE = `(() => {
  const ss = document.querySelector('.solar-system');
  const kids = ss ? Array.from(ss.children).map(e => e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + '.' + String(e.className || '').split(' ').slice(0,2).join('.')) : [];
  const canv = Array.from(document.querySelectorAll('canvas')).map(c => ({ id: c.id, cls: c.className, w: c.width, h: c.height, rect: (() => { const r = c.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)]; })() }));
  const sm = window.SceneModel || {};
  const keys = Object.keys(sm).slice(0, 30);
  let bodies = null;
  try { bodies = (sm.getBodies ? Object.keys(sm.getBodies()) : (sm.bodies ? Object.keys(sm.bodies) : null)); } catch (e) { bodies = 'ERR:' + e.message; }
  let sample = null;
  try { if (sm.getBodies) { const b = sm.getBodies(); const k = Object.keys(b)[0]; sample = { key: k, val: b[k] }; } } catch (e) { sample = 'ERR:' + e.message; }
  const wcKeys = Object.keys(window.WorldCoords || {}).slice(0, 20);
  let planetsAt = null;
  try { planetsAt = window.WorldCoords.planetsAt(window.Motion && window.Motion.now ? window.Motion.now() : Date.now()); } catch (e) { planetsAt = 'ERR:' + e.message; }
  return { kids: kids.slice(0, 40), canv: canv, modelKeys: keys, bodies: bodies, sample: sample, wcKeys: wcKeys,
           planetsAtKeys: planetsAt && typeof planetsAt === 'object' ? Object.keys(planetsAt).slice(0, 50) : planetsAt,
           planetsAtSample: planetsAt && typeof planetsAt === 'object' ? planetsAt[Object.keys(planetsAt)[0]] : null };
})()`;
(async () => {
    const b = await cdp.launch({ width: 1400, height: 900 });
    const pg = await cdp.newPage(b, BASE + '?shot=1&onb=1&token=' + token, { wait: 11000 });
    const v = await cdp.evaluate(b, pg.sessionId, PROBE);
    fs.writeFileSync(path.join(OUT, '_18_probe2.json'), JSON.stringify(v, null, 1), 'utf8');
    console.log(JSON.stringify(v, null, 1).slice(0, 5000));
    await cdp.close(b);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
