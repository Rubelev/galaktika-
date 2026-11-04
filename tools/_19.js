'use strict';
// PV v=1144: все тела каталога — 2 кадра на тело для анализа дырок/мерцания.
const fs = require('fs');
const path = require('path');
const cdp = require('./_cdp.js');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'reports');
const token = fs.readFileSync(path.join(OUT, '_token.txt'), 'utf8').trim();
const BASE = 'https://warbattleuniverse.com/';

const LIST = `(() => {
  const b = (window.CATALOG && window.CATALOG.bodies) || [];
  return b.map(x => ({ id: x.id, name: x.name, class: x.class, parent: x.parent }));
})()`;

(async () => {
    const b = await cdp.launch({ width: 1400, height: 900 });
    const pg = await cdp.newPage(b, BASE + '?shot=1&onb=1&token=' + token, { wait: 9000 });
    const sid = pg.sessionId;
    const bodies = await cdp.evaluate(b, sid, LIST);
    fs.writeFileSync(path.join(OUT, '_19_list.json'), JSON.stringify(bodies, null, 1), 'utf8');
    console.log('тел:', bodies.length, bodies.map(x => x.id).join(','));
    const out = [];
    for (const body of bodies) {
        const url = BASE + '?pv=' + encodeURIComponent(body.id) + '&shot=1&onb=1&token=' + token;
        await b.send('Page.navigate', { url: url }, sid);
        await cdp.sleep(2500);
        // ждём поверхность
        let ok = false, w = 0;
        while (w < 18000) {
            ok = await cdp.evaluate(b, sid, `(() => { const e = document.getElementById('blocks3d-wrap'); return !!e && getComputedStyle(e).display !== 'none'; })()`);
            if (ok) break;
            await cdp.sleep(250); w += 250;
        }
        await cdp.sleep(1200);
        const p1 = path.join(OUT, '_pv19-' + body.id + '-a.png');
        const p2 = path.join(OUT, '_pv19-' + body.id + '-b.png');
        await cdp.screenshot(b, sid, p1);
        await cdp.sleep(900);
        await cdp.screenshot(b, sid, p2);
        const st = await cdp.evaluate(b, sid, `(() => ({ pv: document.body.classList.contains('pv-mode'), blocks: !!document.getElementById('blocks3d-wrap'), canv: Array.from(document.querySelectorAll('canvas')).filter(c => getComputedStyle(c).display !== 'none').length, err: !!document.getElementById('load-error'), banner: (document.body.innerText.match(/Не удалось загрузить игру|интерфейс не отрисовался/g)||[]).length }))()`);
        out.push({ id: body.id, name: body.name, cls: body.class, parent: body.parent, ok: ok, state: st, a: path.basename(p1), b: path.basename(p2) });
        fs.writeFileSync(path.join(OUT, '_19.json'), JSON.stringify(out, null, 1), 'utf8');
        console.log(body.id, 'surface:', ok, 'pv:', st.pv, 'canv:', st.canv);
    }
    await cdp.close(b);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
