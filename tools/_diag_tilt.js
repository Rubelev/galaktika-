'use strict';
const fs = require('fs');
const path = require('path');
const cdp = require('./_cdp.js');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'reports');
const token = fs.readFileSync(path.join(OUT, '_token.txt'), 'utf8').trim();

(async () => {
    const b = await cdp.launch();
    const url = 'https://warbattleuniverse.com/?shot=1&onb=1&freeze=100000&token=' + token + '&tilt=45&spin=20';
    const { sessionId } = await cdp.newPage(b, url, { wait: 9000 });
    const r = await cdp.evaluate(b, sessionId, `(() => {
      const scene = document.querySelector('.solar-system');
      const st = (el) => el ? (el.getAttribute('style')||'') : null;
      const g = (n) => { try { return eval(n); } catch (e) { return 'ERR:' + e.message; } };
      return {
        search: location.search.replace(/token=[^&]+/, 'token=T'),
        tiltVar: g('__tilt'), spinVar: g('__spin'), rotXVar: g('typeof rotX!=="undefined"?rotX:"undef"'),
        rotZVar: g('typeof rotZ!=="undefined"?rotZ:"undef"'),
        scaleVar: g('typeof scale!=="undefined"?scale:"undef"'),
        scene: st(scene),
        container: st(document.querySelector('.solar-system-container')),
        slider: (document.getElementById('tilt-slider')||{}).value,
        bridgeOn: !!(window.SceneBridge && window.SceneBridge.on && window.SceneBridge.on()),
        sceneKeys: window.SceneBridge ? Object.keys(window.SceneBridge) : null,
        bodyClass: document.body.className,
        tiltQueryEls: Array.from(document.querySelectorAll('[oninput*="tilt"],[onchange*="tilt"],[onclick*="updateTilt"]')).map(e => e.id + '|' + (e.getAttribute('oninput')||e.getAttribute('onchange')||e.getAttribute('onclick')||'')),
        roots: Array.from(document.querySelectorAll('.solar-system, .solar-system-container, .system-view, #scene, .scene')).map(e => (e.id?'#'+e.id:'.'+e.className) + ' :: ' + (e.getAttribute('style')||''))
      };
    })()`);
    console.log(JSON.stringify(r, null, 1));
    await cdp.close(b);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
