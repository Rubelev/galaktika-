'use strict';
// B) Матрица: глобус -> «Спуститься» для всех тел; открывается ли НОВАЯ вкладка с ?pv=<id>.
const fs = require('fs');
const path = require('path');
const cdp = require('./_cdp.js');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'reports');
const token = fs.readFileSync(path.join(OUT, '_token.txt'), 'utf8').trim();
const BASE = 'https://warbattleuniverse.com/';

async function tabs(b) {
    try { const r = await fetch('http://127.0.0.1:' + b.port + '/json/list'); return (await r.json()).filter(t => t.type === 'page'); } catch (e) { return []; }
}

const ST = `(() => { const vis = el => { if (!el) return false; const s = getComputedStyle(el); const r = el.getBoundingClientRect(); return s.display !== 'none' && r.width > 2; };
  return { pv: document.body.classList.contains('pv-mode'), blocksVis: vis(document.getElementById('blocks3d-wrap')),
           globe: (() => { const e = document.getElementById('globe-modal'); return e ? getComputedStyle(e).display : 'none'; })(),
           solar: vis(document.querySelector('.solar-system-container')), title: document.title }; })()`;

(async () => {
    const b = await cdp.launch();
    const pg = await cdp.newPage(b, BASE + '?shot=1&onb=1&token=' + token, { wait: 9000 });
    const sid = pg.sessionId;
    const list = JSON.parse(fs.readFileSync(path.join(OUT, '_pv_all.json'), 'utf8')).list;
    const bodies = [];
    for (const p of list.planets) bodies.push({ kind: 'планета', name: p.name || p.id, id: p.id });
    for (const m of list.moons) bodies.push({ kind: 'луна', name: m.name, id: m.slug || m.name });
    const out = [];
    for (const body of bodies) {
        const before = (await tabs(b)).length;
        // глобус тела через его вкладку (та же карточка, что открывается двойным кликом)
        await cdp.evaluate(b, sid, `(() => { try { window.openGlobe(${JSON.stringify(body.id)}); } catch(e) { window.__gErr = e.message; } return 1; })()`);
        await cdp.sleep(1100);
        const g = await cdp.evaluate(b, sid, `(() => { const e = document.getElementById('globe-surface'); if (!e) return null; const r = e.getBoundingClientRect(); return { x: Math.round(r.left+r.width/2), y: Math.round(r.top+r.height/2), w: Math.round(r.width) }; })()`);
        const rec = { kind: body.kind, name: body.name, id: body.id, globeOpened: await cdp.evaluate(b, sid, `(() => { const e = document.getElementById('globe-modal'); return e ? getComputedStyle(e).display : 'none'; })()`) };
        if (!g || g.w < 2) { rec.descent = 'кнопка не найдена'; out.push(rec); continue; }
        rec.descent = 'нажата';
        await b.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: g.x, y: g.y, button: 'left', clickCount: 1, buttons: 1 }, sid);
        await b.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: g.x, y: g.y, button: 'left', clickCount: 1, buttons: 0 }, sid);
        await cdp.sleep(1800);
        const after = await tabs(b);
        const created = after.filter(t => (t.url || '').indexOf('pv=' + body.id) >= 0 || (t.url || '').indexOf('pv=' + encodeURIComponent(body.id)) >= 0);
        rec.newTab = created.length > 0;
        rec.newTabUrl = created.length ? created[0].url.replace(/token=[^&]+/, 'token=T') : null;
        rec.tabsBefore = before; rec.tabsAfter = after.length;
        rec.pageState = await cdp.evaluate(b, sid, ST);
        for (const t of created) { try { await b.send('Target.closeTarget', { targetId: t.id }); } catch (e) { } }
        out.push(rec);
        fs.writeFileSync(path.join(OUT, '_pv_matrix.json'), JSON.stringify(out, null, 1), 'utf8');
        console.log(body.kind, body.name, '(' + body.id + ')', 'globe:', rec.globeOpened, 'newTab:', rec.newTab, 'pvHere:', rec.pageState.pv);
    }
    await cdp.close(b);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
