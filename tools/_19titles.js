'use strict';
const fs = require('fs');
const path = require('path');
const cdp = require('./_cdp.js');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'reports');
const token = fs.readFileSync(path.join(OUT, '_token.txt'), 'utf8').trim();
const BASE = 'https://warbattleuniverse.com/';
const T = `(() => {
  const t = document.querySelector('#pv-title, .pv-title, .pv-world-name');
  const sel = document.querySelector('#pv-field-select, select');
  const top = document.body.innerText.split('\\n').slice(0, 3).join(' | ');
  return { title: t ? t.textContent.trim() : null, select: sel ? sel.value : null, top: top.slice(0, 120),
           body: document.body.className, pvWorld: window.__pvWorld || null, href: location.search.replace(/token=[^&]+/, 'token=T') };
})()`;
(async () => {
    const b = await cdp.launch({ width: 1400, height: 900 });
    const out = {};
    for (const id of ['vesta', 'mars', 'titan', 'sedna', 'earth']) {
        const pg = await cdp.newPage(b, BASE + '?pv=' + id + '&shot=1&onb=1&token=' + token, { wait: 8000 });
        out[id] = await cdp.evaluate(b, pg.sessionId, T);
        try { await b.send('Target.closeTarget', { targetId: pg.targetId }); } catch (e) { }
    }
    fs.writeFileSync(path.join(OUT, '_19_titles.json'), JSON.stringify(out, null, 1), 'utf8');
    console.log(JSON.stringify(out, null, 1));
    await cdp.close(b);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
