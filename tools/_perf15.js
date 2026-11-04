'use strict';
// perf2: 9 сценариев, 5 замеров каждые 2 с, утечка DOM 10/30 с, клики по флоту.
const fs = require('fs');
const path = require('path');
const cdp = require('./_cdp.js');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'reports');
const token = fs.readFileSync(path.join(OUT, '_token.txt'), 'utf8').trim();
const BASE = 'https://warbattleuniverse.com/';

const READ = `(() => {
  const el = document.getElementById('perf-probe');
  const txt = el ? el.textContent : '';
  const num = (re) => { const m = txt.match(re); return m ? +m[1] : null; };
  const t = document.title;
  return {
    text: txt.replace(/\\s+/g, ' ').trim(),
    title: t,
    fps: num(/FPS:\\s*([\\d.]+)/), worst: num(/худший кадр:\\s*(\\d+)/), long: num(/длинных задач:\\s*(\\d+)/),
    dom: num(/DOM-узлов:\\s*(\\d+)/), markers: num(/маркеров:\\s*(\\d+)/), hidden: num(/скрыто\\s*(\\d+)/),
    canvas: num(/canvas-слоёв:\\s*(\\d+)/), mem: num(/память:\\s*(\\d+)/),
    taps: (() => { const v = window.__shipTaps; if (v === undefined) return null; if (typeof v === 'number') return v; try { return v.size !== undefined ? v.size : Object.keys(v).length; } catch (e) { return String(v); } })()
  };
})()`;

const SCEN = [
    { name: 'базовый', extra: '' },
    { name: 'zoom=0.3', extra: '&zoom=0.3' },
    { name: 'zoom=1.6', extra: '&zoom=1.6' },
    { name: 'zoom=4', extra: '&zoom=4' },
    { name: 'tilt=45&spin=20', extra: '&tilt=45&spin=20' },
    { name: 'tilt=85', extra: '&tilt=85' },
    { name: 'render=canvas', extra: '&render=canvas' },
    { name: 'глобус (?dbl=earth)', extra: '&dbl=earth' },
    { name: 'PV (?pv=earth)', extra: '&pv=earth' }
];

(async () => {
    const b = await cdp.launch();
    const pg = await cdp.newPage(b, BASE + '?shot=1&onb=1&perf2=1&token=' + token, { wait: 9000 });
    const sid = pg.sessionId;
    const out = { scenarios: [], leak: null, fleet: null };
    const load = async (extra) => {
        await b.send('Page.navigate', { url: BASE + '?shot=1&onb=1&perf2=1&token=' + token + extra }, sid);
        await cdp.sleep(9000);
    };
    for (const sc of SCEN) {
        await load(sc.extra);
        const samples = [];
        for (let i = 0; i < 5; i++) { samples.push(await cdp.evaluate(b, sid, READ)); await cdp.sleep(2000); }
        // биржа/склад: открываем панель для сценария «склад»
        out.scenarios.push({ name: sc.name, extra: sc.extra, samples: samples });
        fs.writeFileSync(path.join(OUT, '_perf15.json'), JSON.stringify(out, null, 1), 'utf8');
        console.log(sc.name, 'fps:', samples.map(s => s.fps).join('/'), 'worst:', samples.map(s => s.worst).join('/'), 'dom:', samples[0].dom, 'markers:', samples[0].markers, '/', samples[0].hidden, 'canvas:', samples[0].canvas, 'mem:', samples[0].mem);
    }
    // склад/биржа: отдельный сценарий — открываем панель ресурсов и биржу
    await load('');
    const shop = await cdp.evaluate(b, sid, `(() => { const r = {}; try { window.openResourcesPanel(); r.res = 'ok'; } catch (e) { r.res = e.message; } return r; })()`);
    await cdp.sleep(2000);
    const shopSamples = [];
    for (let i = 0; i < 3; i++) { shopSamples.push(await cdp.evaluate(b, sid, READ)); await cdp.sleep(2000); }
    out.shop = { opened: shop, samples: shopSamples };
    console.log('склад', JSON.stringify(shopSamples[0]));
    // утечка: DOM на 10 и 30 с от загрузки
    await load('');
    await cdp.sleep(1000);
    const t10 = await cdp.evaluate(b, sid, READ);
    await cdp.sleep(20000);
    const t30 = await cdp.evaluate(b, sid, READ);
    out.leak = { t10: t10, t30: t30 };
    console.log('leak dom:', t10.dom, '->', t30.dom, 'markers:', t10.markers, '->', t30.markers, 'canvas:', t10.canvas, '->', t30.canvas, 'mem:', t10.mem, '->', t30.mem);
    // клики по флоту
    if (true) {
        await cdp.evaluate(b, sid, `(() => { try { if (typeof scale === 'number') { scale = 0.95; window.updateSolarTransform(); } } catch(e){} return 1; })()`);
        await cdp.sleep(600);
        const before = await cdp.evaluate(b, sid, READ);
        const marks = await cdp.evaluate(b, sid, `(() => Array.from(document.querySelectorAll('.ship-marker')).filter(e => { const r = e.getBoundingClientRect(); return r.width > 1 && getComputedStyle(e).display !== 'none'; }).slice(0, 5).map(e => { const r = e.getBoundingClientRect(); return { sid: e.dataset.sid, x: Math.round(r.left + r.width/2), y: Math.round(r.top + r.height/2), pe: getComputedStyle(e).pointerEvents }; }))()`);
        for (const m of marks) {
            await b.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: m.x, y: m.y, button: 'left', clickCount: 1, buttons: 1 }, sid);
            await b.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: m.x, y: m.y, button: 'left', clickCount: 1, buttons: 0 }, sid);
            await cdp.sleep(350);
        }
        await cdp.sleep(600);
        const after = await cdp.evaluate(b, sid, READ);
        const tapsInfo = await cdp.evaluate(b, sid, `(() => { const v = window.__shipTaps; return { type: typeof v, val: (typeof v === 'number' ? v : (v ? (v.size !== undefined ? v.size : Object.keys(v).length) : null)) }; })()`);
        const errs = b.events.filter(e => e.method === 'Runtime.consoleAPICalled' && e.params.type === 'error').map(e => (e.params.args || []).map(a => a.value || a.description || '').join(' ').slice(0, 120)).slice(-5);
        out.fleet = { markers: marks, tapsBefore: before.taps, tapsAfter: tapsInfo, afterRead: after, consoleErrors: errs };
        console.log('fleet clicks:', JSON.stringify(marks.length), 'taps:', JSON.stringify(tapsInfo), 'errors:', errs.length);
    }
    // скрытые маркеры: не дёргаются ли
    const hidden = await cdp.evaluate(b, sid, `(() => { try { if (typeof scale === 'number') { scale = 0.3; window.updateSolarTransform(); } } catch(e){} return 1; })()`);
    await cdp.sleep(800);
    const h1 = await cdp.evaluate(b, sid, `(() => Array.from(document.querySelectorAll('.ship-marker')).filter(e => getComputedStyle(e).display === 'none').slice(0, 5).map(e => ({ sid: e.dataset.sid, t: e.style.transform })))()`);
    await cdp.sleep(1200);
    const h2 = await cdp.evaluate(b, sid, `(() => Array.from(document.querySelectorAll('.ship-marker')).filter(e => getComputedStyle(e).display === 'none').slice(0, 5).map(e => ({ sid: e.dataset.sid, t: e.style.transform })))()`);
    out.hiddenMarkers = { h1: h1, h2: h2 };
    console.log('hidden:', JSON.stringify(h1.length), 'changed:', h1.filter((x, i) => h2[i] && x.t !== h2[i].t).length);
    fs.writeFileSync(path.join(OUT, '_perf15.json'), JSON.stringify(out, null, 1), 'utf8');
    await cdp.close(b);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
