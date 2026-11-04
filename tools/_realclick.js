'use strict';
// Проверка клика НАСТОЯЩИМИ событиями мыши через CDP Input.dispatchMouseEvent.
const fs = require('fs');
const path = require('path');
const cdp = require('./_cdp.js');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'reports');
const token = fs.readFileSync(path.join(OUT, '_token.txt'), 'utf8').trim();

async function clickAt(b, sid, x, y, count = 1) {
    for (let i = 0; i < 2; i++) {
        await b.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: i + 1, buttons: 1 }, sid);
        await b.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: i + 1, buttons: 0 }, sid);
        await cdp.sleep(60);
    }
}

const STATE = `(() => ({
  globe: (() => { const g = document.getElementById('globe-modal'); return g ? getComputedStyle(g).display : 'none'; })(),
  globeTitle: (document.getElementById('globe-title') || {}).textContent || '',
  toast: (() => { const t = document.querySelector('#toast-box .toast:last-child'); return t ? t.textContent.slice(0, 80) : ''; })(),
  scale: (() => { const m = (document.querySelector('.solar-system').style.transform || '').match(/scale\\(([-\\d.]+)\\)/); return m ? +m[1] : null; })(),
  modals: Array.from(document.querySelectorAll('[id$="-modal"]')).filter(e => getComputedStyle(e).display !== 'none').map(e => e.id).join('|')
}))()`;

(async () => {
    const b = await cdp.launch();
    const url = 'https://warbattleuniverse.com/?shot=1&onb=1&freeze=100000&token=' + token;
    const { sessionId } = await cdp.newPage(b, url, { wait: 9500 });
    await cdp.evaluate(b, sessionId, `(() => { try { if (typeof scale === 'number') { scale = 0.95; window.updateSolarTransform(); } } catch(e){} return 1; })()`);
    await cdp.sleep(600);
    const targets = await cdp.evaluate(b, sessionId, `(() => {
        const r = el => { const b = el.getBoundingClientRect(); return { x: b.left + b.width/2, y: b.top + b.height/2, w: b.width, h: b.height }; };
        const out = {};
        out.earth = r(document.querySelector('.planet[data-planet-id="earth"]'));
        out.mars = r(document.querySelector('.planet[data-planet-id="mars"]'));
        out.moon = r(document.querySelector('.moon[data-moon="Луна"]'));
        out.portal = r(document.querySelector('.portal'));
        out.moonStation = r(document.querySelector('.moon-station'));
        out.menuFleet = r(document.querySelector('.menu-btn[onclick="openFleet()"]'));
        out.zoomIn = r(document.querySelector('.zoom-btn[onclick="solarZoomIn()"]'));
        out.zoomOut = r(document.querySelector('.zoom-btn[onclick="solarZoomOut()"]'));
        out.tiltDown = r(document.querySelector('.d-btn.down'));
        out.check = r(document.getElementById('routes-all'));
        out.fleetShip = r(document.querySelector('.ship-marker[data-sid="fleet-0"]'));
        out.tradeShip = r(document.querySelector('.ship-marker[data-sid="trade-earth-mars-0"]'));
        return out;
    })()`);
    const results = [];
    const closeAll = async () => {
        await cdp.evaluate(b, sessionId, `(() => { try { if (typeof window.closeGlobe === 'function') window.closeGlobe(); } catch(e){} document.querySelectorAll('[id$="-modal"]').forEach(m => { if (getComputedStyle(m).display !== 'none') m.style.display='none'; }); const tb=document.getElementById('toast-box'); if(tb) tb.remove(); try { window.solarReset(); } catch(e){} try { scale = 0.95; window.updateSolarTransform(); } catch(e){} return 1; })()`);
        await cdp.sleep(250);
    };
    for (const name of Object.keys(targets)) {
        const t = targets[name];
        if (!t || !t.w) { results.push({ name, missing: true }); continue; }
        await closeAll();
        const before = await cdp.evaluate(b, sessionId, STATE);
        await clickAt(b, sessionId, t.x, t.y, 2);
        await cdp.sleep(450);
        const after = await cdp.evaluate(b, sessionId, STATE);
        const changed = JSON.stringify(before) !== JSON.stringify(after);
        results.push({ name, x: Math.round(t.x), y: Math.round(t.y), w: Math.round(t.w), h: Math.round(t.h),
                       before, after, changed });
        // для кораблей и панели — одиночный клик
    }
    // одиночный клик по Земле и по кнопке зума
    await closeAll();
    const b1 = await cdp.evaluate(b, sessionId, STATE);
    await clickAt(b, sessionId, targets.earth.x, targets.earth.y, 1);
    await cdp.sleep(700);
    const a1 = await cdp.evaluate(b, sessionId, STATE);
    await closeAll();
    const b2 = await cdp.evaluate(b, sessionId, STATE);
    await clickAt(b, sessionId, targets.zoomIn.x, targets.zoomIn.y, 1);
    await cdp.sleep(400);
    const a2 = await cdp.evaluate(b, sessionId, STATE);
    fs.writeFileSync(path.join(OUT, '_realclicks.json'), JSON.stringify({ results, singleEarth: { before: b1, after: a1 }, singleZoom: { before: b2, after: a2 } }, null, 1), 'utf8');
    console.log('done', results.length);
    await cdp.close(b);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
