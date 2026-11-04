'use strict';
const fs = require('fs');
const path = require('path');
const cdp = require('./_cdp.js');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'reports');
const token = fs.readFileSync(path.join(OUT, '_token.txt'), 'utf8').trim();
const BASE = 'https://warbattleuniverse.com/';
const ST = `(() => { const vis = el => { if (!el) return false; const s = getComputedStyle(el); const r = el.getBoundingClientRect(); return s.display !== 'none' && r.width > 2; };
  return { pv: document.body.classList.contains('pv-mode'), blocksVis: vis(document.getElementById('blocks3d-wrap')),
           globe: (() => { const e = document.getElementById('globe-modal'); return e ? getComputedStyle(e).display : 'none'; })(),
           solar: vis(document.querySelector('.solar-system-container')),
           title: document.title }; })()`;
(async () => {
    const b = await cdp.launch();
    const out = [];
    for (const name of ['Луна', 'Титан']) {
        const pg = await cdp.newPage(b, BASE + '?shot=1&onb=1&token=' + token, { wait: 9000 });
        const sid = pg.sessionId;
        await cdp.evaluate(b, sid, `(() => { try { if (typeof scale === 'number') { scale = 0.95; window.updateSolarTransform(); } } catch(e){} return 1; })()`);
        await cdp.sleep(500);
        const g = await cdp.evaluate(b, sid, `(() => { const e = document.querySelector('.moon[data-moon="${name}"]'); if (!e) return null; const r = e.getBoundingClientRect(); return { x: Math.round(r.left+r.width/2), y: Math.round(r.top+r.height/2), w: Math.round(r.width) }; })()`);
        let res = { name: name, geom: g };
        if (g && g.w > 1) {
            for (let i = 0; i < 2; i++) {
                await b.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: g.x, y: g.y, button: 'left', clickCount: i + 1, buttons: 1 }, sid);
                await b.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: g.x, y: g.y, button: 'left', clickCount: i + 1, buttons: 0 }, sid);
                await cdp.sleep(90);
            }
            await cdp.sleep(4000);
            res.afterDbl = await cdp.evaluate(b, sid, ST);
        }
        out.push(res);
        console.log(name, JSON.stringify(res));
        try { await b.send('Target.closeTarget', { targetId: pg.targetId }); } catch (e) { }
    }
    fs.writeFileSync(path.join(OUT, '_pv_moons.json'), JSON.stringify(out, null, 1), 'utf8');
    await cdp.close(b);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
