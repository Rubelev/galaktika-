'use strict';
// Артефакты: два кадра подряд на одном ракурсе + сетка/GIF из 12 ключевых.
const fs = require('fs');
const path = require('path');
const cdp = require('./_cdp.js');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'reports');
const token = fs.readFileSync(path.join(OUT, '_token.txt'), 'utf8').trim();
const BASE = 'https://warbattleuniverse.com/';
(async () => {
    const b = await cdp.launch({ width: 1400, height: 900 });
    const pg = await cdp.newPage(b, BASE + '?shot=1&onb=1&freeze=100000&token=' + token, { wait: 8000 });
    const sid = pg.sessionId;
    const out = [];
    for (const [t, s, z] of [[0, 0, 0.3], [45, 0, 0.3], [85, 0, 0.3], [45, 135, 0.3]]) {
        await b.send('Page.navigate', { url: BASE + '?shot=1&onb=1&freeze=100000&tilt=' + t + '&spin=' + s + '&zoom=' + z + '&token=' + token }, sid);
        await cdp.sleep(4500);
        const p1 = path.join(OUT, '_diff-' + t + '-' + s + '-a.png');
        const p2 = path.join(OUT, '_diff-' + t + '-' + s + '-b.png');
        await cdp.screenshot(b, sid, p1);
        await cdp.sleep(700);
        await cdp.screenshot(b, sid, p2);
        out.push({ tilt: t, spin: s, zoom: z, a: path.basename(p1), b: path.basename(p2) });
    }
    fs.writeFileSync(path.join(OUT, '_3d_diff.json'), JSON.stringify(out, null, 1), 'utf8');
    console.log(JSON.stringify(out));
    await cdp.close(b);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
