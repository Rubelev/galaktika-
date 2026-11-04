'use strict';
const fs = require('fs');
const path = require('path');
const cdp = require('./_cdp.js');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'reports');
const token = fs.readFileSync(path.join(OUT, '_token.txt'), 'utf8').trim();
const BASE = 'https://warbattleuniverse.com/';

(async () => {
    const b = await cdp.launch();
    console.log('chrome', b.version);
    const url = BASE + '?shot=1&onb=1&freeze=100000&token=' + token;
    const { sessionId } = await cdp.newPage(b, url, { wait: 9000 });
    const info = await cdp.evaluate(b, sessionId, `(() => {
        const r = {};
        r.title = document.title;
        r.build = (document.querySelector('meta[name=app-build]')||{}).content;
        r.hasMotion = typeof window.Motion;
        r.motionKeys = window.Motion ? Object.keys(window.Motion) : null;
        r.hasWC = typeof window.WorldCoords;
        r.wcKeys = window.WorldCoords ? Object.keys(window.WorldCoords) : null;
        r.poseCache = typeof window.__poseCache;
        r.bridge = typeof window.SceneBridge;
        r.markers = document.querySelectorAll('.ship-marker').length;
        r.planets = document.querySelectorAll('.planet[data-planet-id]').length;
        r.tradePaths = document.querySelectorAll('.trade-path').length;
        r.fleetTraffic = document.querySelectorAll('#fleet-traffic').length;
        r.moons = document.querySelectorAll('.moon').length;
        r.stations = document.querySelectorAll('.station').length;
        r.portals = document.querySelectorAll('.portal').length;
        r.tethers = document.querySelectorAll('.tether').length;
        r.trafficShips = document.querySelectorAll('.traffic-ship').length;
        r.bodyChildren = document.body.children.length;
        r.inner = [innerWidth, innerHeight];
        return r;
    })()`);
    console.log(JSON.stringify(info, null, 1));
    await cdp.screenshot(b, sessionId, path.join(OUT, '_probe.png'));
    await cdp.close(b);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
