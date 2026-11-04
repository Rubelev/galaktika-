'use strict';
// Меню: что перекрывает кнопки и открывается ли окно. Свежая страница на каждую кнопку.
const fs = require('fs');
const path = require('path');
const cdp = require('./_cdp.js');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'reports');
const token = fs.readFileSync(path.join(OUT, '_token.txt'), 'utf8').trim();

const STATE = `(() => {
  const shown = Array.from(document.querySelectorAll('[id$="-modal"], #tr-wrap, #pv-fly, #fleet-card, #ship-flight, #blocks3d-wrap, #design-wrap'))
    .filter(e => getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().width > 0).map(e => (e.id || e.className));
  return { overlays: shown.join('|'), body: document.body.className,
           leftCls: (document.getElementById('left-menu') || {}).className || '',
           itemsDisplay: (() => { const e = document.getElementById('left-menu-items'); return e ? getComputedStyle(e).display : '-'; })() };
})()`;

const T = [
    { name: 'Флот (центр)', sel: '.menu-btn[onclick="openFleet()"]', dy: 0 },
    { name: 'Флот (низ кнопки)', sel: '.menu-btn[onclick="openFleet()"]', dy: 13 },
    { name: 'Ресурсы', sel: '.menu-btn[onclick="openResourcesPanel()"]', dy: 0 },
    { name: 'Системы', sel: '#systems-btn', dy: 0 },
    { name: 'Торговля', sel: '#trade-btn', dy: 0 },
    { name: 'Разведсводка', sel: '#npc-btn', dy: 0 },
    { name: 'Луны и газ', sel: '#moons-menu-btn', dy: 0 },
    { name: '☰', sel: '.menu-toggle', dy: 0 }
];

(async () => {
    const b = await cdp.launch();
    const res = [];
    for (const t of T) {
        const url = 'https://warbattleuniverse.com/?shot=1&onb=1&freeze=100000&token=' + token;
        const pg = await cdp.newPage(b, url, { wait: 7600 });
        const sid = pg.sessionId;
        const g = await cdp.evaluate(b, sid, `(() => {
            const D = e => e ? (e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\\s+/).slice(0,2).join('.') : '')) : 'null';
            const el = document.querySelector(${JSON.stringify(t.sel)}); if (!el) return null;
            const r = el.getBoundingClientRect(); const x = Math.round(r.left + r.width/2), y = Math.round(r.top + r.height/2 + ${t.dy});
            const s = getComputedStyle(el);
            const st = (document.elementsFromPoint(x, y) || []).slice(0, 5).map(D);
            return { x: x, y: y, w: Math.round(r.width), h: Math.round(r.height), display: s.display, vis: s.visibility, op: s.opacity,
                     stack: st, hitSelf: st.some(d => d.indexOf(el.id || 'zzz') >= 0 && el.id) || st.length > 0 };
        })()`);
        const before = await cdp.evaluate(b, sid, STATE);
        if (g) {
            await b.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: g.x, y: g.y, button: 'left', clickCount: 1, buttons: 1 }, sid);
            await b.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: g.x, y: g.y, button: 'left', clickCount: 1, buttons: 0 }, sid);
            await cdp.sleep(900);
        }
        const after = await cdp.evaluate(b, sid, STATE);
        res.push({ name: t.name, geom: g, before: before, after: after });
        console.log(t.name, '| top:', g ? g.stack[0] : 'n/a', '| overlays:', after.overlays.slice(0, 50) || '-');
        try { await b.send('Target.closeTarget', { targetId: pg.targetId }); } catch (e) { }
    }
    fs.writeFileSync(path.join(OUT, '_click6.json'), JSON.stringify(res, null, 1), 'utf8');
    await cdp.close(b);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
