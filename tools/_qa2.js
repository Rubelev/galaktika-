'use strict';
// Проверка qa.js (только ?qa=1) и сохранения ?tilt= в transform.
const fs = require('fs');
const path = require('path');
const cdp = require('./_cdp.js');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'reports');
const token = fs.readFileSync(path.join(OUT, '_token.txt'), 'utf8').trim();

const READ = `(() => {
  const tr = (document.querySelector('.solar-system') || { style: {} }).style.transform || '';
  const g = re => { const m = tr.match(re); return m ? +m[1] : null; };
  const qa = document.getElementById('qa-report');
  let report = null;
  try { report = qa ? JSON.parse(qa.textContent) : null; } catch (e) { report = { parseError: String(e) }; }
  return { title: document.title, hasQaReport: !!qa, report: report,
           transform: tr, rotX: g(/rotateX\\(([-\\d.]+)deg\\)/), rotZ: g(/rotateZ\\(([-\\d.]+)deg\\)/),
           tiltVar: (typeof __tilt !== 'undefined' ? __tilt : 'n/a'),
           build: (document.querySelector('meta[name=app-build]') || {}).content };
})()`;

(async () => {
    const b = await cdp.launch();
    const out = {};
    // 1) обычная страница с ?tilt=45&spin=20, без qa
    let pg = await cdp.newPage(b, 'https://warbattleuniverse.com/?shot=1&onb=1&freeze=100000&token=' + token + '&tilt=45&spin=20', { wait: 9500 });
    out.normal = await cdp.evaluate(b, pg.sessionId, READ);
    try { await b.send('Target.closeTarget', { targetId: pg.targetId }); } catch (e) { }
    // 2) обычная страница без tilt
    pg = await cdp.newPage(b, 'https://warbattleuniverse.com/?shot=1&onb=1&freeze=100000&token=' + token, { wait: 9500 });
    out.plain = await cdp.evaluate(b, pg.sessionId, READ);
    try { await b.send('Target.closeTarget', { targetId: pg.targetId }); } catch (e) { }
    // 3) страница с ?qa=1
    pg = await cdp.newPage(b, 'https://warbattleuniverse.com/?shot=1&onb=1&freeze=100000&token=' + token + '&qa=1', { wait: 12000 });
    out.qa = await cdp.evaluate(b, pg.sessionId, READ);
    try { await b.send('Target.closeTarget', { targetId: pg.targetId }); } catch (e) { }
    fs.writeFileSync(path.join(OUT, '_qa2.json'), JSON.stringify(out, null, 1), 'utf8');
    console.log(JSON.stringify({ normalTitle: out.normal.title, normalQa: out.normal.hasQaReport, normalRot: [out.normal.rotX, out.normal.rotZ], tiltVar: out.normal.tiltVar,
        plainTitle: out.plain.title, plainQa: out.plain.hasQaReport, qaTitle: out.qa.title, qaHasReport: out.qa.hasQaReport,
        qaFails: out.qa.report && out.qa.report.results ? out.qa.report.results.filter(r => !r.ok).map(r => r.name + ' :: ' + r.detail) : null }));
    await cdp.close(b);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
