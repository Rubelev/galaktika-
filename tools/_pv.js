'use strict';
// PV: 9 точек входа, возврат, время до поверхности, консольные ошибки, новые вкладки.
const fs = require('fs');
const path = require('path');
const cdp = require('./_cdp.js');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'reports');
const token = fs.readFileSync(path.join(OUT, '_token.txt'), 'utf8').trim();
const BASE = 'https://warbattleuniverse.com/';

const STATE = `(() => {
  const vis = el => { if (!el) return false; const s = getComputedStyle(el); const r = el.getBoundingClientRect(); return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 2 && r.height > 2; };
  const b3 = document.getElementById('blocks3d-wrap');
  const canv = Array.from(document.querySelectorAll('canvas')).filter(c => vis(c)).map(c => ({ id: c.id, gl: (() => { try { return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch (e) { return false; } })() }));
  return {
    href: location.href.replace(/token=[^&]+/, 'token=T'), title: document.title, body: document.body.className,
    pvMode: document.body.classList.contains('pv-mode'),
    blocks: !!b3, blocksVis: vis(b3),
    pvBar: !!document.getElementById('pv-bar'), pvBarVis: vis(document.getElementById('pv-bar')),
    loading: (() => { const e = document.getElementById('pv-loading'); return e ? (vis(e) ? 'виден' : 'скрыт') : 'нет'; })(),
    solar: (() => { const e = document.querySelector('.solar-system-container'); if (!e) return 'нет'; return vis(e) ? 'виден' : 'скрыт'; })(),
    globe: (() => { const e = document.getElementById('globe-modal'); return e ? (vis(e) ? 'виден' : 'скрыт') : 'нет'; })(),
    canvases: canv,
    errBanner: (document.body.innerText.match(/Не удалось загрузить игру|интерфейс не отрисовался|Игра не загрузилась/g) || []).length,
    btns: Array.from(document.querySelectorAll('#pv-bar button, #globe-modal button')).map(b => (b.id ? '#' + b.id : '.' + String(b.className).split(' ')[0]) + '|' + (b.textContent || '').trim().slice(0, 30))
  };
})()`;

async function waitForSurface(b, sid, maxMs) {
    const t0 = Date.now();
    while (Date.now() - t0 < maxMs) {
        const ok = await cdp.evaluate(b, sid, `(() => { const e = document.getElementById('blocks3d-wrap'); if (!e) return false; const s = getComputedStyle(e); const r = e.getBoundingClientRect(); return s.display !== 'none' && r.width > 2; })()`);
        if (ok) return +((Date.now() - t0) / 1000).toFixed(1);
        await cdp.sleep(200);
    }
    return null;
}

async function clickAt(b, sid, x, y, dbl) {
    const n = dbl ? 2 : 1;
    for (let i = 0; i < n; i++) {
        await b.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: i + 1, buttons: 1 }, sid);
        await b.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: i + 1, buttons: 0 }, sid);
        await cdp.sleep(90);
    }
}

const GEOM = (sel) => `(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null;
  const r = e.getBoundingClientRect(); if (r.width < 2) return { invisible: true };
  return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), w: Math.round(r.width), h: Math.round(r.height) }; })()`;

async function consoleErrors(b, since) {
    return b.events.filter(e => e.method === 'Runtime.consoleAPICalled' && e.params.type === 'error' && e.ts > since)
        .map(e => (e.params.args || []).map(a => a.value || a.description || '').join(' ').slice(0, 160));
}

async function runPoint(b, name, url, opts) {
    opts = opts || {};
    const pg = await cdp.newPage(b, url, { wait: opts.wait || 9000 });
    const sid = pg.sessionId;
    const t0 = Date.now();
    const rec = { name: name, url: url.replace(/token=[^&]+/, 'token=T'), steps: [] };
    // ждём базовое состояние
    if (opts.pre) await opts.pre(b, sid);
    // действие
    if (opts.action) {
        const r = await opts.action(b, sid);
        rec.steps.push(r);
    }
    // время до поверхности
    rec.surfaceAfterSec = await waitForSurface(b, sid, opts.surfaceTimeout || 25000);
    rec.state = await cdp.evaluate(b, sid, STATE);
    rec.consoleErrors = await consoleErrors(b, t0 - 1000);
    if (opts.png) await cdp.screenshot(b, sid, path.join(OUT, opts.png));
    return { pg: pg, sid: sid, rec: rec };
}

(async () => {
    const b = await cdp.launch();
    const out = [];
    const log = (x) => { out.push(x); fs.writeFileSync(path.join(OUT, '_pv.json'), JSON.stringify(out, null, 1), 'utf8'); console.log('done', x.name, 'surface:', x.rec.surfaceAfterSec, 'pv:', x.rec.state.pvMode, 'solar:', x.rec.state.solar, 'globe:', x.rec.state.globe, 'load:', x.rec.state.loading); };
    const close = async (p) => { try { await b.send('Target.closeTarget', { targetId: p.targetId }); } catch (e) { } };

    // 1) прямой ?pv=earth
    {
        const r = await runPoint(b, '1. ?pv=earth', BASE + '?pv=earth&shot=1&onb=1&token=' + token, { png: 'audit-pv-1-direct.png' });
        log(r); await close(r.pg);
    }
    // 2) ?planet=earth
    {
        const r = await runPoint(b, '2. ?planet=earth', BASE + '?planet=earth&shot=1&onb=1&token=' + token, { png: 'audit-pv-2-planet.png' });
        log(r); await close(r.pg);
    }
    // 3) меню «Планетарный вид»
    {
        const r = await runPoint(b, '3. меню Планетарный вид', BASE + '?shot=1&onb=1&token=' + token, {
            pre: async (bb, sid) => { await cdp.sleep(400); },
            action: async (bb, sid) => {
                const g = await cdp.evaluate(bb, sid, GEOM('#pv-btn'));
                if (!g || g.invisible) return { clicked: false, note: 'кнопка #pv-btn невидима' };
                await clickAt(bb, sid, g.x, g.y, false);
                await cdp.sleep(1200);
                return { clicked: true, at: [g.x, g.y] };
            },
            png: 'audit-pv-3-menu.png'
        });
        // были ли новые вкладки
        try {
            const list = await (await fetch('http://127.0.0.1:' + b.port + '/json/list')).json();
            r.rec.tabs = list.filter(t => t.type === 'page').map(t => (t.url || '').replace(/token=[^&]+/, 'token=T').slice(0, 90));
        } catch (e) { r.rec.tabs = 'ERR'; }
        log(r); await close(r.pg);
    }
    // 4) двойной клик по Земле -> глобус -> «Спуститься»
    {
        const r = await runPoint(b, '4. двойной клик → глобус → спуск', BASE + '?shot=1&onb=1&token=' + token, {
            pre: async (bb, sid) => {
                await cdp.evaluate(bb, sid, `(() => { try { if (typeof scale === 'number') { scale = 0.95; window.updateSolarTransform(); } } catch(e){} return 1; })()`);
                await cdp.sleep(400);
            },
            action: async (bb, sid) => {
                const g = await cdp.evaluate(bb, sid, GEOM('.planet[data-planet-id="earth"]'));
                if (!g || g.invisible) return { note: 'Земля не найдена' };
                await clickAt(bb, sid, g.x, g.y, true);
                await cdp.sleep(1600);
                let globe = await cdp.evaluate(bb, sid, `(() => { const e = document.getElementById('globe-modal'); return e ? getComputedStyle(e).display : 'none'; })()`);
                if (globe === 'none') { // запасной путь: вкладка глобуса
                    await cdp.evaluate(bb, sid, `(() => { try { window.openGlobe('earth'); } catch(e){} return 1; })()`);
                    await cdp.sleep(1200);
                    globe = await cdp.evaluate(bb, sid, `(() => { const e = document.getElementById('globe-modal'); return e ? getComputedStyle(e).display : 'none'; })()`);
                }
                const d = await cdp.evaluate(bb, sid, GEOM('#globe-surface'));
                if (!d || d.invisible) return { globe: globe, descent: 'кнопка не найдена' };
                await clickAt(bb, sid, d.x, d.y, false);
                return { globe: globe, descent: 'нажата ' + d.x + ',' + d.y };
            },
            png: 'audit-pv-4-globe.png'
        });
        log(r); await close(r.pg);
    }
    // 5) одиночный клик по Земле -> глобус -> спуск
    {
        const r = await runPoint(b, '5. одиночный клик → глобус → спуск', BASE + '?shot=1&onb=1&token=' + token, {
            pre: async (bb, sid) => {
                await cdp.evaluate(bb, sid, `(() => { try { if (typeof scale === 'number') { scale = 0.95; window.updateSolarTransform(); } } catch(e){} return 1; })()`);
                await cdp.sleep(400);
            },
            action: async (bb, sid) => {
                const g = await cdp.evaluate(bb, sid, GEOM('.planet[data-planet-id="earth"]'));
                if (!g || g.invisible) return { note: 'Земля не найдена' };
                await clickAt(bb, sid, g.x, g.y, false);
                await cdp.sleep(1400);
                const globe = await cdp.evaluate(bb, sid, `(() => { const e = document.getElementById('globe-modal'); return e ? getComputedStyle(e).display : 'none'; })()`);
                if (globe === 'none') return { globe: 'не открылся', descent: 'не нажималась' };
                const d = await cdp.evaluate(bb, sid, GEOM('#globe-surface'));
                if (!d || d.invisible) return { globe: globe, descent: 'кнопка не найдена' };
                await clickAt(bb, sid, d.x, d.y, false);
                return { globe: globe, descent: 'нажата' };
            }
        });
        log(r); await close(r.pg);
    }
    // 6) карточка планеты: есть ли вообще
    {
        const r = await runPoint(b, '6. карточка планеты', BASE + '?shot=1&onb=1&token=' + token, {
            action: async (bb, sid) => {
                const info = await cdp.evaluate(bb, sid, `(() => {
                    const ids = ['planet-card','planet-modal','planet-info','planetview-modal'];
                    const found = ids.filter(id => document.getElementById(id));
                    const cls = Array.from(document.querySelectorAll('[class*=planet-card],[class*=planetinfo],[class*=planet-info]')).map(e => e.className).slice(0,5);
                    return { ids: found, cls: cls };
                })()`);
                return info;
            }
        });
        r.rec.note = 'карточки планеты в DOM нет; роль карточки выполняет #globe-modal (кнопка #globe-surface)';
        log(r); await close(r.pg);
    }
    // 7) повторный вход: PV -> ↑ К глобусу -> Спуститься (2 цикла)
    {
        const pg = await cdp.newPage(b, BASE + '?pv=earth&shot=1&onb=1&token=' + token, { wait: 10000 });
        const sid = pg.sessionId;
        const rec = { name: '7. PV → К глобусу → спуск ×2', url: '(pv)', steps: [] };
        const t0 = Date.now();
        rec.surface1 = await waitForSurface(b, sid, 25000);
        for (let i = 1; i <= 2; i++) {
            const g = await cdp.evaluate(b, sid, GEOM('#pv-bar button'));
            const up = await cdp.evaluate(b, sid, GEOM('#pv-bar button'));
            // найти кнопку «К глобусу»
            const btn = await cdp.evaluate(b, sid, `(() => { const b = Array.from(document.querySelectorAll('#pv-bar button')).find(x => /глобус/i.test(x.textContent || '')); if (!b) return null; const r = b.getBoundingClientRect(); return { x: Math.round(r.left + r.width/2), y: Math.round(r.top + r.height/2), text: b.textContent.trim() }; })()`);
            if (!btn) { rec.steps.push({ cycle: i, note: 'кнопка «К глобусу» не найдена' }); break; }
            await clickAt(b, sid, btn.x, btn.y, false);
            await cdp.sleep(1600);
            const st1 = await cdp.evaluate(b, sid, STATE);
            const d = await cdp.evaluate(b, sid, GEOM('#globe-surface'));
            let desc = 'кнопка спуска не найдена';
            if (d && !d.invisible) { await clickAt(b, sid, d.x, d.y, false); desc = 'нажата'; }
            const back = await waitForSurface(b, sid, 20000);
            const st2 = await cdp.evaluate(b, sid, STATE);
            rec.steps.push({ cycle: i, btn: btn.text, afterToGlobe: { globe: st1.globe, pv: st1.pvMode, solar: st1.solar }, descent: desc, surfaceAfterSec: back, pvBack: st2.pvMode, solarAfter: st2.solar });
            await cdp.sleep(400);
        }
        rec.state = await cdp.evaluate(b, sid, STATE);
        rec.consoleErrors = await consoleErrors(b, t0 - 1000);
        await cdp.screenshot(b, sid, path.join(OUT, 'audit-pv-7-return.png'));
        log({ pg: pg, sid: sid, rec: rec }); await close(pg);
    }
    // 8) ?tilt=45&spin=20 и ?zoom=4
    for (const [nm, extra] of [['8a. ?pv=earth&tilt=45&spin=20', '&tilt=45&spin=20'], ['8b. ?pv=earth&zoom=4', '&zoom=4']]) {
        const r = await runPoint(b, nm, BASE + '?pv=earth&shot=1&onb=1&token=' + token + extra, {});
        log(r); await close(r.pg);
    }
    // 9) ?render=canvas
    {
        const r = await runPoint(b, '9. ?pv=earth&render=canvas', BASE + '?pv=earth&shot=1&onb=1&render=canvas&token=' + token, {});
        log(r); await close(r.pg);
    }

    fs.writeFileSync(path.join(OUT, '_pv.json'), JSON.stringify(out, null, 1), 'utf8');
    await cdp.close(b);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
