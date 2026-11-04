'use strict';
// C) Полный цикл для выборки: PV -> «К глобусу» -> спуск (2 цикла) + tilt/zoom/canvas.
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
           bar: vis(document.getElementById('pv-bar')),
           canv: Array.from(document.querySelectorAll('canvas')).filter(vis).length,
           title: document.title }; })()`;

async function tabs(b) { try { const r = await fetch('http://127.0.0.1:' + b.port + '/json/list'); return (await r.json()).filter(t => t.type === 'page'); } catch (e) { return []; } }
async function waitSurface(b, sid, maxMs) {
    const t0 = Date.now();
    while (Date.now() - t0 < maxMs) {
        const ok = await cdp.evaluate(b, sid, `(() => { const e = document.getElementById('blocks3d-wrap'); if (!e) return false; const s = getComputedStyle(e); return s.display !== 'none' && e.getBoundingClientRect().width > 2; })()`);
        if (ok) return +((Date.now() - t0) / 1000).toFixed(1);
        await cdp.sleep(150);
    }
    return null;
}
async function click(b, sid, x, y) {
    await b.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1, buttons: 1 }, sid);
    await b.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1, buttons: 0 }, sid);
}
const GEOM = (js) => `(() => { const e = ${js}; if (!e) return null; const r = e.getBoundingClientRect(); if (r.width < 2) return { invisible: true }; return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), text: (e.textContent || '').trim().slice(0, 30) }; })()`;

(async () => {
    const b = await cdp.launch();
    const out = { cycle: [], variants: [] };
    const bodies = [['земля', 'earth', 'audit-pv-earth.png'], ['марс', 'mars', 'audit-pv-mars.png'], ['юпитер', 'jupiter', 'audit-pv-jupiter.png'], ['сатурн', 'saturn', null],
                    ['луна', 'moon', 'audit-pv-moon.png'], ['титан', 'titan', 'audit-pv-titan.png'], ['европа', 'europa', 'audit-pv-europa.png'], ['ганимeд', 'ganymede', null]];

    for (const [nm, id, png] of bodies) {
        const pg = await cdp.newPage(b, BASE + '?pv=' + id + '&shot=1&onb=1&token=' + token, { wait: 8500 });
        const sid = pg.sessionId;
        const rec = { name: nm, id: id, entry: '?pv=' + id, surfaceSec: await waitSurface(b, sid, 20000), cycles: [] };
        rec.stateAfterEntry = await cdp.evaluate(b, sid, ST);
        if (png) await cdp.screenshot(b, sid, path.join(OUT, png));
        for (let i = 1; i <= 2; i++) {
            const btn = await cdp.evaluate(b, sid, GEOM(`Array.from(document.querySelectorAll('#pv-bar button')).find(x => /глобус/i.test(x.textContent||''))`));
            if (!btn || btn.invisible) { rec.cycles.push({ cycle: i, note: 'кнопка «К глобусу» не найдена' }); break; }
            await click(b, sid, btn.x, btn.y);
            await cdp.sleep(1800);
            const s1 = await cdp.evaluate(b, sid, ST);
            // спуск: если глобус открыт — кнопка в нём; иначе фиксируем, что спуск недоступен
            const d = await cdp.evaluate(b, sid, GEOM(`document.getElementById('globe-surface')`));
            let desc = 'глобус не открылся — кнопка спуска недоступна';
            let newTab = false, tabUrl = null, surfNew = null;
            if (s1.globe === 'flex' && d && !d.invisible) {
                const before = (await tabs(b)).length;
                await click(b, sid, d.x, d.y);
                await cdp.sleep(1800);
                const after = await tabs(b);
                const created = after.filter(t => (t.url || '').indexOf('pv=' + id) >= 0);
                newTab = created.length > 0;
                tabUrl = created.length ? created[0].url.replace(/token=[^&]+/, 'token=T') : null;
                if (created.length) {
                    // проверим, что в новой вкладке реально появилась поверхность
                    const tgt = created[0];
                    try {
                        const att = await b.send('Target.attachToTarget', { targetId: tgt.id, flatten: true });
                        const nsid = att.sessionId;
                        await b.send('Runtime.enable', {}, nsid);
                        await cdp.sleep(500);
                        let t = 0;
                        while (t < 15000) {
                            const ok = await cdp.evaluate(b, nsid, `(() => { const e = document.getElementById('blocks3d-wrap'); if (!e) return false; const s = getComputedStyle(e); return s.display !== 'none' && e.getBoundingClientRect().width > 2; })()`);
                            if (ok) break;
                            await cdp.sleep(300); t += 300;
                        }
                        surfNew = await cdp.evaluate(b, nsid, ST);
                        await b.send('Target.closeTarget', { targetId: tgt.id });
                    } catch (e) { surfNew = { error: e.message }; }
                }
                desc = 'нажата';
            }
            rec.cycles.push({ cycle: i, afterToGlobe: { pv: s1.pv, globe: s1.globe, solar: s1.solar, bar: s1.bar }, descent: desc, newTab: newTab, tabUrl: tabUrl, surfaceInNewTab: surfNew });
            // возвращаемся в PV для второго цикла, если вышли на карту
            if (!s1.pv) {
                await cdp.evaluate(b, sid, `(() => { try { window.PlanetView.open(${JSON.stringify(id)}); } catch(e){} return 1; })()`);
                await cdp.sleep(2500);
            }
        }
        try { await b.send('Target.closeTarget', { targetId: pg.targetId }); } catch (e) { }
        out.cycle.push(rec);
        fs.writeFileSync(path.join(OUT, '_pv_cycle.json'), JSON.stringify(out, null, 1), 'utf8');
        console.log('cycle', nm, 'surface:', rec.surfaceSec, JSON.stringify(rec.cycles.map(c => [c.cycle, c.afterToGlobe, c.descent, c.newTab, c.surfaceInNewTab && c.surfaceInNewTab.pv])));
    }

    // варианты: tilt / zoom / canvas для 8 тел
    const pg2 = await cdp.newPage(b, BASE + '?shot=1&onb=1&token=' + token, { wait: 8000 });
    const sid2 = pg2.sessionId;
    for (const [nm, id] of bodies) {
        for (const [variant, extra] of [['tilt', '&tilt=45&spin=20'], ['zoom', '&zoom=4'], ['canvas', '&render=canvas']]) {
            const url = BASE + '?pv=' + id + '&shot=1&onb=1&token=' + token + extra;
            await b.send('Page.navigate', { url: url }, sid2);
            await cdp.sleep(2500);
            const t = await waitSurface(b, sid2, 12000);
            const st = await cdp.evaluate(b, sid2, ST);
            out.variants.push({ name: nm, id: id, variant: variant, surfaceSec: t, pv: st.pv, blocks: st.blocksVis, solar: st.solar, canv: st.canv, title: st.title });
            fs.writeFileSync(path.join(OUT, '_pv_cycle.json'), JSON.stringify(out, null, 1), 'utf8');
            console.log('variant', nm, variant, 'surface:', t, 'pv:', st.pv);
        }
    }
    await cdp.close(b);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
