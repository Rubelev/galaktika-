// Minimal CDP driver for headless Chrome (Node 24 native WebSocket).
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

class Browser {
    constructor(proc, ws) { this.proc = proc; this.ws = ws; this.id = 0; this.pending = new Map(); this.events = []; this.sessionId = null; }
    send(method, params = {}, sessionId) {
        const id = ++this.id;
        const msg = { id, method, params };
        if (sessionId) msg.sessionId = sessionId;
        return new Promise((resolve, reject) => {
            this.pending.set(id, { resolve, reject });
            this.ws.send(JSON.stringify(msg));
        });
    }
    onMessage(raw) {
        let m; try { m = JSON.parse(raw); } catch { return; }
        if (m.id && this.pending.has(m.id)) {
            const p = this.pending.get(m.id); this.pending.delete(m.id);
            if (m.error) p.reject(new Error(m.error.message + ' ' + JSON.stringify(m.error.data || '')));
            else p.resolve(m.result);
        } else if (m.method) {
            this.events.push(m);
        }
    }
}

async function launch(opts = {}) {
    const port = opts.port || 9300 + Math.floor(Math.random() * 200);
    const udd = opts.profileDir || path.join(os.tmpdir(), 'chrome-audit-' + Date.now() + '-' + port);
    fs.mkdirSync(udd, { recursive: true });
    const args = [
        '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
        '--hide-scrollbars', '--mute-audio', '--no-first-run', '--no-default-browser-check',
        '--disable-extensions', '--disable-background-timer-throttling',
        '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
        '--window-size=' + (opts.width || 1400) + ',' + (opts.height || 900),
        '--remote-debugging-port=' + port,
        '--user-data-dir=' + udd,
        'about:blank'
    ];
    const proc = spawn(CHROME, args, { stdio: ['ignore', 'ignore', 'ignore'] });
    let ver = null;
    for (let i = 0; i < 100; i++) {
        await sleep(150);
        try {
            const r = await fetch(`http://127.0.0.1:${port}/json/version`);
            ver = await r.json(); break;
        } catch { }
    }
    if (!ver) { try { proc.kill(); } catch { } throw new Error('chrome did not start'); }
    const ws = new WebSocket(ver.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = e => rej(new Error('ws error')); });
    const b = new Browser(proc, ws);
    ws.onmessage = ev => b.onMessage(ev.data);
    b.port = port;
    b.udd = udd;
    b.version = ver['Browser'];
    return b;
}

async function newPage(b, url, opts = {}) {
    const { targetId } = await b.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await b.send('Target.attachToTarget', { targetId, flatten: true });
    await b.send('Page.enable', {}, sessionId);
    await b.send('Runtime.enable', {}, sessionId);
    await b.send('Page.navigate', { url }, sessionId);
    await sleep(opts.wait || 4000);
    return { sessionId, targetId };
}

async function evaluate(b, sessionId, expression) {
    const r = await b.send('Runtime.evaluate', {
        expression, returnByValue: true, awaitPromise: true, userGesture: true
    }, sessionId);
    if (r.exceptionDetails) {
        return { __error: r.exceptionDetails.text + ' :: ' + (r.exceptionDetails.exception && r.exceptionDetails.exception.description || '') };
    }
    return r.result.value;
}

async function screenshot(b, sessionId, file) {
    const r = await b.send('Page.captureScreenshot', { format: 'png' }, sessionId);
    fs.writeFileSync(file, Buffer.from(r.data, 'base64'));
    return file;
}

async function close(b) {
    try { await b.send('Browser.close'); } catch { }
    try { b.ws.close(); } catch { }
    try { b.proc.kill(); } catch { }
}

module.exports = { launch, newPage, evaluate, screenshot, close, sleep };
