'use strict';
// Единый инвентарь центров/перекрытий + скриншоты 0.95 и 0.30.
const fs = require('fs');
const path = require('path');
const cdp = require('./_cdp.js');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'reports');
const token = fs.readFileSync(path.join(OUT, '_token.txt'), 'utf8').trim();

const SEL = [
    ['планета mercury', '.planet[data-planet-id="mercury"]'],
    ['планета venus', '.planet[data-planet-id="venus"]'],
    ['планета earth', '.planet[data-planet-id="earth"]'],
    ['планета mars', '.planet[data-planet-id="mars"]'],
    ['планета jupiter', '.planet[data-planet-id="jupiter"]'],
    ['планета saturn', '.planet[data-planet-id="saturn"]'],
    ['планета uranus', '.planet[data-planet-id="uranus"]'],
    ['планета neptune', '.planet[data-planet-id="neptune"]'],
    ['планета pluto', '.planet[data-planet-id="pluto"]'],
    ['луна Луна', '.moon[data-moon="Луна"]'],
    ['луна Титан', '.moon[data-moon="Титан"]'],
    ['луна Европа', '.moon[data-moon="Европа"]'],
    ['Врата', '.portal'],
    ['станция луны', '.moon-station'],
    ['флот fleet-0', '.ship-marker[data-sid="fleet-0"]'],
    ['торговец trade-earth-mars-0', '.ship-marker[data-sid="trade-earth-mars-0"]'],
    ['гражданский civil-5', '.ship-marker[data-sid="civil-5"]'],
    ['рудный belt-0', '.ship-marker[data-sid="belt-0"]'],
    ['пират pirate-0', '.ship-marker[data-sid="pirate-0"]'],
    ['зум +', '.zoom-btn[onclick="solarZoomIn()"]'],
    ['наклон ▲', '.d-btn.up'],
    ['чекбокс Все маршруты', '#routes-all'],
    ['кнопка Фильтры', '.view-head'],
    ['меню Флот', '.menu-btn[onclick="openFleet()"]'],
    ['меню Торговля', '#trade-btn'],
    ['☰ меню', '.menu-toggle']
];

const PROBE = `(sels => {
  const D = e => e ? (e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\\s+/).slice(0, 2).join('.') : '')) : 'null';
  return sels.map(([name, sel]) => {
    const el = document.querySelector(sel);
    if (!el) return { name: name, sel: sel, missing: true };
    const r = el.getBoundingClientRect();
    if (!r.width || getComputedStyle(el).display === 'none') return { name: name, sel: sel, invisible: true, w: Math.round(r.width) };
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const stack = (document.elementsFromPoint(x, y) || []).slice(0, 6).map(D);
    const top = document.elementsFromPoint(x, y)[0];
    return { name: name, sel: sel, x: Math.round(x), y: Math.round(y), w: Math.round(r.width), h: Math.round(r.height),
             own: top === el || el.contains(top), ancestor: !!(top && top.contains(el)), top: D(top), stack: stack,
             pe: getComputedStyle(el).pointerEvents };
  });
})(${JSON.stringify(SEL)})`;

(async () => {
    const b = await cdp.launch();
    const url = 'https://warbattleuniverse.com/?shot=1&onb=1&freeze=100000&token=' + token;
    const { sessionId } = await cdp.newPage(b, url, { wait: 9000 });
    await cdp.evaluate(b, sessionId, `(() => { try { if (typeof scale === 'number') { scale = 0.95; window.updateSolarTransform(); } } catch(e){} return 1; })()`);
    await cdp.sleep(800);
    const hi = await cdp.evaluate(b, sessionId, PROBE);
    await cdp.screenshot(b, sessionId, path.join(OUT, 'audit-scene-095.png'));
    const hid = await cdp.evaluate(b, sessionId, `(() => {
        try { if (typeof scale === 'number') { scale = 0.302682; window.updateSolarTransform(); } } catch(e){}
        return { hidden: Array.from(document.querySelectorAll('.ship-marker')).filter(e => getComputedStyle(e).display === 'none').length,
                 total: document.querySelectorAll('.ship-marker').length, body: document.body.className }; })()`);
    await cdp.sleep(700);
    const hid2 = await cdp.evaluate(b, sessionId, `(() => ({ hidden: Array.from(document.querySelectorAll('.ship-marker')).filter(e => getComputedStyle(e).display === 'none').length,
        total: document.querySelectorAll('.ship-marker').length, body: document.body.className }))()`);
    await cdp.screenshot(b, sessionId, path.join(OUT, 'audit-scene-030.png'));
    const out = { at095: hi, at030: hid2, viewport: await cdp.evaluate(b, sessionId, `[innerWidth, innerHeight]`) };
    fs.writeFileSync(path.join(OUT, '_final.json'), JSON.stringify(out, null, 1), 'utf8');
    console.log('ok', JSON.stringify(hid2));
    await cdp.close(b);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
