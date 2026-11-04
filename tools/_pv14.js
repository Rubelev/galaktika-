'use strict';
// PV v=1123: профиль как у игрока, два прохода (холодный / из кеша), проверки по DOM и кадру.
const fs = require('fs');
const path = require('path');
const cdp = require('./_cdp.js');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'reports');
const token = fs.readFileSync(path.join(OUT, '_token.txt'), 'utf8').trim();
const BASE = 'https://warbattleuniverse.com/';
const PROFILE = path.join(OUT, '_chrome-profile-pv');
const BODIES = ['earth', 'mars', 'jupiter', 'titan'];

const STATE = `(() => {
  const vis = el => { if (!el) return false; const s = getComputedStyle(el); const r = el.getBoundingClientRect(); return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 2; };
  const pvLoad = document.getElementById('pv-loading');
  const le = document.getElementById('load-error');
  return {
    pv: document.body.classList.contains('pv-mode'),
    blocksVis: vis(document.getElementById('blocks3d-wrap')),
    solar: vis(document.querySelector('.solar-system-container')),
    loading: pvLoad ? { exists: true, vis: vis(pvLoad), text: (pvLoad.textContent || '').trim().slice(0, 120) } : { exists: false },
    loadError: le ? { exists: true, vis: vis(le), text: (le.textContent || '').trim().slice(0, 200) } : { exists: false },
    racePanel: !!document.getElementById('race-panel'),
    leftMenu: vis(document.querySelector('.left-menu')),
    controlPanel: vis(document.querySelector('.control-panel')),
    mentor: vis(document.getElementById('mentor-panel')) || vis(document.getElementById('mentor-box')),
    pvBar: vis(document.getElementById('pv-bar')),
    globe: (() => { const e = document.getElementById('globe-modal'); return e ? getComputedStyle(e).display : 'none'; })(),
    scripts: Array.from(document.scripts).map(s => s.src).filter(s => /pv-boot|lore-race|planetview/.test(s)).map(s => s.replace('https://warbattleuniverse.com/', '')),
    bannerText: (document.body.innerText.match(/Не удалось загрузить игру|интерфейс не отрисовался|Игра не загрузилась|не запустился/g) || []).join('; '),
    title: document.title
  };
})()`;

async function waitSurface(b, sid, maxMs) {
    const t0 = Date.now();
    while (Date.now() - t0 < maxMs) {
        const ok = await cdp.evaluate(b, sid, `(() => { const e = document.getElementById('blocks3d-wrap'); if (!e) return false; const s = getComputedStyle(e); return s.display !== 'none' && e.getBoundingClientRect().width > 2; })()`);
        if (ok) return +((Date.now() - t0) / 1000).toFixed(1);
        await cdp.sleep(200);
    }
    return null;
}
async function tabs(b) { try { const r = await fetch('http://127.0.0.1:' + b.port + '/json/list'); return (await r.json()).filter(t => t.type === 'page'); } catch (e) { return []; } }
async function click(b, sid, x, y) {
    await b.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1, buttons: 1 }, sid);
    await b.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1, buttons: 0 }, sid);
}
const GEOM = (js) => `(() => { const e = ${js}; if (!e) return null; const r = e.getBoundingClientRect(); if (r.width < 2) return { invisible: true };
  const x = Math.round(r.left + r.width / 2), y = Math.round(r.top + r.height / 2);
  const D = el => el ? (el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\\s+/).slice(0,2).join('.') : '')) : 'null';
  return { x: x, y: y, w: Math.round(r.width), top: D(document.elementFromPoint(x, y)), stack: (document.elementsFromPoint(x, y) || []).slice(0, 4).map(D) }; })()`;

async function runBody(b, pass, id, withReturn) {
    const rec = { pass: pass, body: id };
    const pg = await cdp.newPage(b, 'about:blank', { wait: 200 });
    const sid = pg.sessionId;
    await b.send('Network.enable', {}, sid);
    const t0 = Date.now();
    await b.send('Page.navigate', { url: BASE + '?pv=' + id + '&shot=1&onb=1&token=' + token }, sid);
    await cdp.sleep(2500);
    rec.surfaceSec = await waitSurface(b, sid, 25000);
    await cdp.sleep(1500);
    rec.state = await cdp.evaluate(b, sid, STATE);
    rec.net = b.events.filter(e => e.method === 'Network.responseReceived' && /pv-boot|lore-race|planetview/.test((e.params.response || {}).url || ''))
        .map(e => ({ url: e.params.response.url.split('/').pop(), fromDiskCache: e.params.response.fromDiskCache, fromMemoryCache: e.params.response.fromMemoryCache, status: e.params.response.status }));
    const png = path.join(OUT, 'audit-pv14-' + id + '-' + pass + '.png');
    await cdp.screenshot(b, sid, png);
    rec.png = path.relative(ROOT, png);
    if (withReturn) {
        const btn = await cdp.evaluate(b, sid, GEOM(`Array.from(document.querySelectorAll('#pv-bar button')).find(x => /глобус/i.test(x.textContent||''))`));
        rec.upBtn = btn;
        if (btn && !btn.invisible) {
            await click(b, sid, btn.x, btn.y);
            await cdp.sleep(2500);
            rec.afterUp = await cdp.evaluate(b, sid, STATE);
            // повторный спуск
            const d = await cdp.evaluate(b, sid, GEOM(`document.getElementById('globe-surface')`));
            rec.descent = 'нет кнопки';
            if (d && !d.invisible) {
                const before = (await tabs(b)).length;
                await click(b, sid, d.x, d.y);
                await cdp.sleep(1800);
                const created = (await tabs(b)).filter(x => (x.url || '').indexOf('pv=' + id) >= 0);
                rec.descent = created.length ? 'новая вкладка' : 'без новой вкладки';
                rec.descentUrl = created.length ? created[0].url.replace(/token=[^&]+/, 'token=T') : null;
                for (const t of created) { try { await b.send('Target.closeTarget', { targetId: t.id }); } catch (e) { } }
            }
        }
    }
    try { await b.send('Target.closeTarget', { targetId: pg.targetId }); } catch (e) { }
    return rec;
}

(async () => {
    fs.rmSync(PROFILE, { recursive: true, force: true });
    fs.mkdirSync(PROFILE, { recursive: true });
    const out = { profile: PROFILE, cold: [], warm: [], menu: null };
    for (const pass of ['cold', 'warm']) {
        const b = await cdp.launch({ profileDir: PROFILE });
        for (const id of BODIES) {
            const rec = await runBody(b, pass, id, pass === 'warm' && (id === 'earth' || id === 'mars' || id === 'titan'));
            out[pass].push(rec);
            fs.writeFileSync(path.join(OUT, '_pv14.json'), JSON.stringify(out, null, 1), 'utf8');
            console.log(pass, id, 'surface:', rec.surfaceSec, 'pv:', rec.state.pv, 'blocks:', rec.state.blocksVis, 'loading:', JSON.stringify(rec.state.loading), 'err:', JSON.stringify(rec.state.loadError), 'race:', rec.state.racePanel, 'scripts:', rec.state.scripts.join(','));
        }
        if (pass === 'warm') {
            // меню «Планетарный вид»
            const pg = await cdp.newPage(b, BASE + '?shot=1&onb=1&token=' + token, { wait: 9000 });
            const sid = pg.sessionId;
            const before = (await tabs(b)).length;
            const g = await cdp.evaluate(b, sid, GEOM(`document.getElementById('pv-btn')`));
            out.menu = { btn: g, tabsBefore: before };
            if (g && !g.invisible) {
                await click(b, sid, g.x, g.y);
                await cdp.sleep(1800);
                const after = await tabs(b);
                out.menu.newTab = after.filter(t => (t.url || '').indexOf('pv=') >= 0).map(t => t.url.replace(/token=[^&]+/, 'token=T'));
                out.menu.tabsAfter = after.length;
                for (const t of after.filter(x => (x.url || '').indexOf('pv=') >= 0)) { try { await b.send('Target.closeTarget', { targetId: t.id }); } catch (e) { } }
            }
            try { await b.send('Target.closeTarget', { targetId: pg.targetId }); } catch (e) { }
            fs.writeFileSync(path.join(OUT, '_pv14.json'), JSON.stringify(out, null, 1), 'utf8');
            console.log('menu:', JSON.stringify(out.menu));
        }
        await cdp.close(b);
        await cdp.sleep(1500);
    }
    fs.writeFileSync(path.join(OUT, '_pv14.json'), JSON.stringify(out, null, 1), 'utf8');
    await cdp.close;
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
