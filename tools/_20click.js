'use strict';
const fs = require('fs');
const path = require('path');
const cdp = require('./_cdp.js');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'reports');
const token = fs.readFileSync(path.join(OUT, '_token.txt'), 'utf8').trim();
const BASE = 'https://warbattleuniverse.com/';

const INFO = `(() => {
  const els = Array.from(document.querySelectorAll('[data-body-id]'));
  const ids = Array.from(new Set(els.map(e => e.getAttribute('data-body-id'))));
  const vis = els.filter(e => { const r = e.getBoundingClientRect(); return r.width > 2 && r.height > 2; }).map(e => { const r = e.getBoundingClientRect(); return { id: e.getAttribute('data-body-id'), x: Math.round(r.left + r.width/2), y: Math.round(r.top + r.height/2), w: Math.round(r.width) }; });
  const st = document.getElementById('catalog-stats');
  return { total: els.length, distinct: ids.length, ids: ids.slice(0, 50), visible: vis.slice(0, 12), stats: st ? st.textContent.replace(/\\s+/g, ' ').trim() : null, title: document.title };
})()`;

(async () => {
    const b = await cdp.launch({ width: 1400, height: 900 });
    const pg = await cdp.newPage(b, BASE + '?shot=1&onb=1&render=catalog&token=' + token, { wait: 10000 });
    const sid = pg.sessionId;
    const info = await cdp.evaluate(b, sid, INFO);
    console.log('visible:', JSON.stringify(info.visible));
    console.log('distinct:', info.distinct, 'total:', info.total);
    const targets = info.visible.slice(0, 5);
    for (const t of targets) {
        await b.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: t.x, y: t.y, button: 'left', clickCount: 1, buttons: 1 }, sid);
        await b.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: t.x, y: t.y, button: 'left', clickCount: 1, buttons: 0 }, sid);
        await cdp.sleep(400);
    }
    await cdp.sleep(700);
    const after = await cdp.evaluate(b, sid, `(() => { const st = document.getElementById('catalog-stats'); return { stats: st ? st.textContent.replace(/\\s+/g, ' ').trim() : null, title: document.title }; })()`);
    console.log('after clicks:', JSON.stringify(after));
    // dblclick по видимой планете
    if (targets[0]) {
        const t = targets[0];
        for (let i = 0; i < 2; i++) {
            await b.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: t.x, y: t.y, button: 'left', clickCount: i + 1, buttons: 1 }, sid);
            await b.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: t.x, y: t.y, button: 'left', clickCount: i + 1, buttons: 0 }, sid);
            await cdp.sleep(90);
        }
        await cdp.sleep(2500);
        const list = (await (await fetch('http://127.0.0.1:' + b.port + '/json/list')).json()).filter(x => x.type === 'page');
        console.log('after dbl:', JSON.stringify({ n: list.length, urls: list.map(x => (x.url || '').replace(/token=[^&]+/, 'token=T').slice(0, 100)) }));
    }
    fs.writeFileSync(path.join(OUT, '_20_click.json'), JSON.stringify({ info: info, after: after }, null, 1), 'utf8');
    await cdp.close(b);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
