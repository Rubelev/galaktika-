'use strict';
const fs = require('fs');
const path = require('path');
const cdp = require('./_cdp.js');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'reports');
const token = fs.readFileSync(path.join(OUT, '_token.txt'), 'utf8').trim();
const BASE = 'https://warbattleuniverse.com/';
const POS = (id) => `(() => { const e = document.querySelector('.planet[data-planet-id="${id}"]'); if (!e) return null; const r = e.getBoundingClientRect(); const x = r.left+r.width/2, y = r.top+r.height/2; const t = document.elementFromPoint(x,y); return { x: Math.round(x), y: Math.round(y), top: t ? (t.tagName.toLowerCase() + (t.id?'#'+t.id:'') + '.' + String(t.className).split(' ')[0]) : 'null' }; })()`;
const STATS = `(() => { const st = document.getElementById('catalog-stats'); return { stats: st ? st.textContent.replace(/\\s+/g,' ').trim() : null, href: location.href.replace(/token=[^&]+/, 'token=T') }; })()`;
(async () => {
    const b = await cdp.launch({ width: 1400, height: 900 });
    const out = {};
    // одиночные клики: по одной чистой загрузке на тело
    for (const id of ['vesta', 'pallas', 'ceres', 'mercury', 'hygiea']) {
        const pg = await cdp.newPage(b, BASE + '?shot=1&onb=1&render=catalog&token=' + token, { wait: 9500 });
        const sid = pg.sessionId;
        const p = await cdp.evaluate(b, sid, POS(id));
        if (!p) { out[id] = { err: 'нет цели' }; try { await b.send('Target.closeTarget', { targetId: pg.targetId }); } catch (e) { } continue; }
        await b.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'left', clickCount: 1, buttons: 1 }, sid);
        await b.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y, button: 'left', clickCount: 1, buttons: 0 }, sid);
        await cdp.sleep(900);
        out['click_' + id] = { pos: p, after: await cdp.evaluate(b, sid, STATS) };
        try { await b.send('Target.closeTarget', { targetId: pg.targetId }); } catch (e) { }
    }
    // двойной клик по vesta на свежей загрузке
    {
        const pg = await cdp.newPage(b, BASE + '?shot=1&onb=1&render=catalog&token=' + token, { wait: 9500 });
        const sid = pg.sessionId;
        const p = await cdp.evaluate(b, sid, POS('vesta'));
        out.dbl_pos = p;
        if (p) {
            for (let i = 0; i < 2; i++) {
                await b.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'left', clickCount: i + 1, buttons: 1 }, sid);
                await b.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y, button: 'left', clickCount: i + 1, buttons: 0 }, sid);
                await cdp.sleep(120);
            }
            await cdp.sleep(3500);
            out.dbl_after = await cdp.evaluate(b, sid, `(() => ({ href: location.href.replace(/token=[^&]+/, 'token=T'), pv: document.body.classList.contains('pv-mode'), blocks: !!document.getElementById('blocks3d-wrap'), stats: (document.getElementById('catalog-stats')||{}).textContent }))()`);
        }
        try { await b.send('Target.closeTarget', { targetId: pg.targetId }); } catch (e) { }
    }
    fs.writeFileSync(path.join(OUT, '_22b.json'), JSON.stringify(out, null, 1), 'utf8');
    console.log(JSON.stringify(out, null, 1));
    await cdp.close(b);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
