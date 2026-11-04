'use strict';
const fs = require('fs');
const path = require('path');
const cdp = require('./_cdp.js');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'reports');
const token = fs.readFileSync(path.join(OUT, '_token.txt'), 'utf8').trim();

const INV = `(() => {
  const vis = (el) => { const s = getComputedStyle(el), r = el.getBoundingClientRect(); return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0; };
  const R = (el) => { const r = el.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)]; };
  const out = { modals: [], buttons: [], menu: [], panels: [], sliders: [], checks: [], ids: [] };
  document.querySelectorAll('[id]').forEach(el => {
    const id = el.id;
    if (/modal|card|overlay|panel|menu|globe|toast/i.test(id)) out.ids.push(id + ' :: ' + R(el).join(',') + ' :: ' + getComputedStyle(el).display);
  });
  document.querySelectorAll('button, [role=button], .d-btn, .menu-btn, input[type=checkbox], input[type=range]').forEach(el => {
    if (!vis(el)) return;
    const b = { tag: el.tagName, id: el.id || null, cls: el.className || null, text: (el.textContent || '').trim().slice(0, 30),
                onclick: (el.getAttribute('onclick') || '').slice(0, 60), r: R(el),
                type: el.type || null, checked: el.checked, value: el.value };
    if (/checkbox/.test(el.type || '')) out.checks.push(b);
    else if (/range/.test(el.type || '')) out.sliders.push(b);
    else if (el.closest('.left-menu')) out.menu.push(b);
    else out.buttons.push(b);
  });
  document.querySelectorAll('.control-panel, .left-menu, #resources-panel, .legend-overlay').forEach(el => out.panels.push({ cls: el.className, id: el.id, r: R(el), d: getComputedStyle(el).display }));
  return out;
})()`;

(async () => {
    const b = await cdp.launch();
    const url = 'https://warbattleuniverse.com/?shot=1&onb=1&freeze=100000&token=' + token;
    const { sessionId } = await cdp.newPage(b, url, { wait: 9500 });
    const v = await cdp.evaluate(b, sessionId, INV);
    fs.writeFileSync(path.join(OUT, '_inv.json'), JSON.stringify(v, null, 1), 'utf8');
    console.log('modals', v.modals.length, 'ids', v.ids.length, 'buttons', v.buttons.length, 'menu', v.menu.length, 'checks', v.checks.length, 'sliders', v.sliders.length);
    await cdp.close(b);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
