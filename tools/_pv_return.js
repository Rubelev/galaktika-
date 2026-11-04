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
           solar: vis(document.querySelector('.solar-system-container')), bar: vis(document.getElementById('pv-bar')) }; })()`;
async function tabs(b) { try { const r = await fetch('http://127.0.0.1:' + b.port + '/json/list'); return (await r.json()).filter(t => t.type === 'page'); } catch (e) { return []; } }
(async () => {
    const b = await cdp.launch();
    const out = [];
    for (const id of ['earth', 'titan']) {
        const pg = await cdp.newPage(b, BASE + '?pv=' + id + '&shot=1&onb=1&token=' + token, { wait: 9000 });
        const sid = pg.sessionId;
        const t0 = Date.now();
        let t = 0;
        while (t < 15000) { const ok = await cdp.evaluate(b, sid, `(() => { const e = document.getElementById('blocks3d-wrap'); return !!e && getComputedStyle(e).display !== 'none'; })()`); if (ok) break; await cdp.sleep(200); t += 200; }
        const entry = +((Date.now() - t0) / 1000).toFixed(1);
        const btn = await cdp.evaluate(b, sid, `(() => { const b = Array.from(document.querySelectorAll('#pv-bar button')).find(x => /глобус/i.test(x.textContent||'')); if (!b) return null; const r = b.getBoundingClientRect(); return { x: Math.round(r.left+r.width/2), y: Math.round(r.top+r.height/2), text: b.textContent.trim() }; })()`);
        await b.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: btn.x, y: btn.y, button: 'left', clickCount: 1, buttons: 1 }, sid);
        await b.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: btn.x, y: btn.y, button: 'left', clickCount: 1, buttons: 0 }, sid);
        await cdp.sleep(1200);
        const s1 = await cdp.evaluate(b, sid, ST);
        await cdp.sleep(4000);
        const s2 = await cdp.evaluate(b, sid, ST);
        // повторный спуск: открываем глобус заново и жмём кнопку
        await cdp.evaluate(b, sid, `(() => { try { window.openGlobe(${JSON.stringify(id)}); } catch(e){} return 1; })()`);
        await cdp.sleep(1200);
        const d = await cdp.evaluate(b, sid, `(() => { const e = document.getElementById('globe-surface'); if (!e) return null; const r = e.getBoundingClientRect(); return { x: Math.round(r.left+r.width/2), y: Math.round(r.top+r.height/2), w: Math.round(r.width) }; })()`);
        let newTab = false, tabUrl = null, surf = null;
        if (d && d.w > 2) {
            await b.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: d.x, y: d.y, button: 'left', clickCount: 1, buttons: 1 }, sid);
            await b.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: d.x, y: d.y, button: 'left', clickCount: 1, buttons: 0 }, sid);
            await cdp.sleep(1800);
            const created = (await tabs(b)).filter(x => (x.url || '').indexOf('pv=' + id) >= 0);
            newTab = created.length > 0; tabUrl = created.length ? created[0].url.replace(/token=[^&]+/, 'token=T') : null;
            if (created.length) {
                try {
                    const att = await b.send('Target.attachToTarget', { targetId: created[0].id, flatten: true });
                    const nsid = att.sessionId;
                    let w = 0;
                    while (w < 15000) { const ok = await cdp.evaluate(b, nsid, `(() => { const e = document.getElementById('blocks3d-wrap'); return !!e && getComputedStyle(e).display !== 'none'; })()`); if (ok) break; await cdp.sleep(300); w += 300; }
                    surf = await cdp.evaluate(b, nsid, ST);
                    await b.send('Target.closeTarget', { targetId: created[0].id });
                } catch (e) { surf = { err: e.message }; }
            }
        }
        out.push({ id, entrySec: entry, btn: btn && btn.text, afterToGlobe_1s: s1, afterToGlobe_5s: s2, descent: d ? 'нажата' : 'нет кнопки', newTab, tabUrl, surfaceInNewTab: surf });
        try { await b.send('Target.closeTarget', { targetId: pg.targetId }); } catch (e) { }
        console.log(id, JSON.stringify(out[out.length - 1]));
    }
    fs.writeFileSync(path.join(OUT, '_pv_return.json'), JSON.stringify(out, null, 1), 'utf8');
    await cdp.close(b);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
