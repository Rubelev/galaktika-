'use strict';
// Разведка кнопок масштаба времени.
const fs = require('fs');
const path = require('path');
const cdp = require('./_cdp.js');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'reports');
const token = fs.readFileSync(path.join(OUT, '_token.txt'), 'utf8').trim();

const PROBE = `(() => {
  const D = e => e ? (e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\\s+/).slice(0, 2).join('.') : '')) : 'null';
  const out = { buttons: [], timeScale: (typeof timeScale !== 'undefined' ? timeScale : null),
                sim: (typeof simulatedTime !== 'undefined' ? simulatedTime : null), panels: [] };
  const isTimeBtn = e => /^(1x|1м|1ч|1д|1г|×1|×60)/i.test((e.textContent || '').trim()) ||
                          /timeScale|setTimeMode|time-scale|timeMode/i.test((e.getAttribute('onclick') || '') + (e.className || ''));
  document.querySelectorAll('button, [role=button], .time-btn, .speed-btn').forEach(e => {
    if (!isTimeBtn(e)) return;
    const r = e.getBoundingClientRect();
    const s = getComputedStyle(e);
    out.buttons.push({ d: D(e), text: (e.textContent || '').trim().slice(0, 20),
      onclick: (e.getAttribute('onclick') || '').slice(0, 80),
      data: JSON.stringify(Object.assign({}, e.dataset)).slice(0, 120),
      r: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)],
      vis: s.display !== 'none' && r.width > 0 });
  });
  ['time-control-panel', 'control-panel-container', 'view-panel'].forEach(id => {
    const e = document.getElementById(id);
    if (e) out.panels.push(id + ' :: ' + getComputedStyle(e).display + ' :: ' + JSON.stringify(e.getBoundingClientRect()));
  });
  out.clock = (document.querySelector('.sim-clock, #sim-clock, .game-time, #game-time') || {}).textContent || '';
  out.bodyText = document.body.innerText.slice(0, 0);
  return out;
})()`;

(async () => {
    const b = await cdp.launch();
    const pg = await cdp.newPage(b, 'https://warbattleuniverse.com/?shot=1&onb=1&token=' + token, { wait: 9000 });
    const v = await cdp.evaluate(b, pg.sessionId, PROBE);
    fs.writeFileSync(path.join(OUT, '_scaleprobe.json'), JSON.stringify(v, null, 1), 'utf8');
    console.log(JSON.stringify(v, null, 1));
    await cdp.close(b);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
