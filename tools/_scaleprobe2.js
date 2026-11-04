'use strict';
// Разведка масштабов времени в тестовом режиме (?test=1) и через прямые вызовы.
const fs = require('fs');
const path = require('path');
const cdp = require('./_cdp.js');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'reports');
const token = fs.readFileSync(path.join(OUT, '_token.txt'), 'utf8').trim();

const READ = `(() => {
  const D = e => e ? (e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\\s+/).slice(0, 3).join('.') : '')) : 'null';
  const out = { timeScale: (typeof timeScale !== 'undefined' ? timeScale : null), sim: (typeof simulatedTime !== 'undefined' ? simulatedTime : null),
                tcp: (() => { const e = document.getElementById('time-control-panel'); if (!e) return 'нет'; const r = e.getBoundingClientRect(); return getComputedStyle(e).display + ' ' + Math.round(r.width) + 'x' + Math.round(r.height); })(),
                body: document.body.className,
                buttons: [] };
  document.querySelectorAll('button.mode-btn, button.apply-btn').forEach(e => {
    const r = e.getBoundingClientRect(); const s = getComputedStyle(e);
    out.buttons.push({ d: D(e), text: (e.textContent || '').trim(), onclick: (e.getAttribute('onclick') || ''),
      r: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)],
      vis: s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 });
  });
  return out;
})()`;

(async () => {
    const b = await cdp.launch();
    const url = 'https://warbattleuniverse.com/?shot=1&onb=1&test=1&token=' + token;
    const pg = await cdp.newPage(b, url, { wait: 9000 });
    const before = await cdp.evaluate(b, pg.sessionId, READ);
    const after = [];
    for (const mode of ['real', 'min', 'hour', 'day', 'year']) {
        const v = await cdp.evaluate(b, pg.sessionId, `(() => { try { setTimeMode('${mode}'); applyTimeScale(); } catch(e) { return 'ERR:' + e.message; }
            return { mode: '${mode}', timeScale: (typeof timeScale !== 'undefined' ? timeScale : null), sim: (typeof simulatedTime !== 'undefined' ? simulatedTime : null) }; })()`);
        after.push(v);
    }
    fs.writeFileSync(path.join(OUT, '_scaleprobe2.json'), JSON.stringify({ before: before, after: after }, null, 1), 'utf8');
    console.log(JSON.stringify({ tcp: before.tcp, body: before.body, buttons: before.buttons, after: after }, null, 1));
    await cdp.close(b);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
