// Вид планеты: изометрическая карта с дорогами, транспортом и постройками.
// Отдельный модуль, чтобы правки основного скрипта его не задевали.

const ISO = { tw: 92, th: 46, cols: 13, rows: 9 };

const SURFACES = {
    earth: {
        name: 'Земля', tint: '#4a7a3a', road: '#a89a72',
        tex: '/images/tex/planets/earth_grass.jpg',
        buildings: ['Верфь', 'Завод оборудования', 'Фабрика андроидов', 'Космопорт', 'Док']
    },
    moon: {
        name: 'Луна', tint: '#5a5f68', road: '#8a9099',
        tex: '/images/tex/planets/moon_regolith.jpg',
        buildings: ['Биржа', 'Космопорт', 'Гравитационный лифт']
    },
    mars: {
        name: 'Марс', tint: '#8a4526', road: '#c98a5a',
        tex: '/images/tex/planets/mars_dust.jpg',
        buildings: ['Реактор тяжёлой воды', 'Ледяная буровая', 'Купол жизнеобеспечения', 'Фабрика андроидов']
    },
    belt: {
        name: 'Пояс', tint: '#2a303b', road: '#5a6472',
        tex: '/images/tex/planets/asteroid_rock.jpg',
        buildings: ['Буровая платформа', 'Плавильня', 'Кондритный комплекс', 'Газовый скиммер']
    }
};

const ICONS = {
    'Верфь': '🏭', 'Завод оборудования': '🏭', 'Фабрика андроидов': '🤖', 'Космопорт': '🚀',
    'Док': '🛠', 'Биржа': '📈', 'Гравитационный лифт': '🛗', 'Реактор тяжёлой воды': '⚛',
    'Ледяная буровая': '⛏', 'Купол жизнеобеспечения': '🏠', 'Буровая платформа': '⛏',
    'Плавильня': '🏭', 'Кондритный комплекс': '🪨', 'Газовый скиммер': '💨'
};

const SLOTS = [[7, 7], [9, 5], [11, 7], [6, 8], [10, 3], [8, 8]];

let state = null;

function isoX(c, r, W) { return (c - r) * (ISO.tw / 2) + W * 0.5; }
function isoY(c, r) { return (c + r) * (ISO.th / 2) + 46; }

function diamond(ctx, x, y, w, h, fill, stroke) {
    ctx.beginPath();
    ctx.moveTo(x, y - h / 2);
    ctx.lineTo(x + w / 2, y);
    ctx.lineTo(x, y + h / 2);
    ctx.lineTo(x - w / 2, y);
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
}

export function open(world, city) {
    const id = SURFACES[world] ? world : 'earth';
    let modal = document.getElementById('surface-modal');
    if (!modal) {
        document.body.insertAdjacentHTML('beforeend',
            '<div id="surface-modal" class="surface-modal"><div class="surface-frame">' +
            '<button class="surface-close" onclick="closeSurface()">×</button>' +
            '<canvas id="surface-canvas" width="1200" height="640"></canvas>' +
            '<div class="surface-title" id="surface-title"></div>' +
            '<div class="surface-tabs" id="surface-tabs"></div>' +
            '</div></div>');
        modal = document.getElementById('surface-modal');
    }
    modal.style.display = 'flex';

    document.getElementById('surface-title').textContent =
        SURFACES[id].name + (city ? ' · ' + city : '');

    document.getElementById('surface-tabs').innerHTML = Object.keys(SURFACES).map(k =>
        `<button class="surface-tab ${k === id ? 'active' : ''}" onclick="openSurface('${k}')">${SURFACES[k].name}</button>`
    ).join('');

    stop();
    const canvas = document.getElementById('surface-canvas');
    const tex = new Image();
    let texReady = false;
    tex.onload = () => { texReady = true; };
    tex.src = SURFACES[id].tex;

    // карта местности: если есть — рисуем её вместо сетки тайлов
    const bg = new Image();
    let bgReady = false;
    bg.onload = () => { bgReady = true; };
    bg.src = '/images/surface/' + id + '.jpg';

    const pts = SURFACES[id].buildings.map((name, i) => {
        const s = SLOTS[i] || SLOTS[0];
        return { name: name, x: isoX(s[0], s[1], canvas.width), y: isoY(s[0], s[1]) };
    });

    let phase = 0, raf = null;
    const loop = () => {
        if (document.getElementById('surface-modal').style.display !== 'flex') { raf = null; return; }
        phase = (phase + 0.0015) % 1;
        draw(canvas, id, bgReady ? bg : null, pts, phase);
        raf = requestAnimationFrame(loop);
    };
    loop();
    state = { stop: () => { if (raf) cancelAnimationFrame(raf); raf = null; } };
}

function draw(canvas, id, tex, pts, phase) {
    const s = SURFACES[id];
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;

    ctx.fillStyle = '#05070d';
    ctx.fillRect(0, 0, W, H);

    // звёзды
    for (let i = 0; i < 120; i++) {
        ctx.fillStyle = 'rgba(255,255,255,' + (0.12 + (i % 7) / 25) + ')';
        ctx.fillRect((i * 137) % W, (i * 89) % (H * 0.35), 1, 1);
    }

    // фоновая карта местности вместо сетки
    if (tex) {
        const scale = Math.max(W / tex.width, H / tex.height);
        const dw = tex.width * scale, dh = tex.height * scale;
        ctx.drawImage(tex, (W - dw) / 2, (H - dh) / 2, dw, dh);
        ctx.fillStyle = 'rgba(4,8,14,0.18)';
        ctx.fillRect(0, 0, W, H);
    }

    // тайлы (только если нет карты местности)
    for (let r = 0; tex ? false : r < ISO.rows; r++) {
        for (let c = 0; c < ISO.cols; c++) {
            const x = isoX(c, r, W), y = isoY(c, r);
            const n = (c * 7 + r * 13) % 10;
            const shade = n > 6 ? 0.82 : 1;
            if (tex) {
                ctx.save();
                ctx.globalAlpha = shade;
                ctx.fillStyle = s.tint;
                diamond(ctx, x, y, ISO.tw - 1, ISO.th - 1, null, 'rgba(0,0,0,0.35)');
                ctx.globalCompositeOperation = 'source-atop';
                ctx.drawImage(tex, 0, 0, tex.width, tex.height, x - 60, y - 40, 120, 80);
                ctx.restore();
                diamond(ctx, x, y, ISO.tw - 1, ISO.th - 1, null, 'rgba(0,0,0,0.25)');
            } else {
                diamond(ctx, x, y, ISO.tw - 1, ISO.th - 1, s.tint, 'rgba(0,0,0,0.35)');
            }
        }
    }

    // дороги с поворотами
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(20,24,18,0.55)';
    ctx.lineWidth = 20;
    for (let i = 1; i < pts.length; i++) {
        ctx.beginPath();
        ctx.moveTo(pts[i - 1].x, pts[i - 1].y);
        ctx.quadraticCurveTo(pts[i].x, pts[i - 1].y, pts[i].x, pts[i].y);
        ctx.stroke();
    }
    ctx.strokeStyle = s.road;
    ctx.lineWidth = 14;
    ctx.globalAlpha = 0.9;
    for (let i = 1; i < pts.length; i++) {
        ctx.beginPath();
        ctx.moveTo(pts[i - 1].x, pts[i - 1].y);
        ctx.quadraticCurveTo(pts[i].x, pts[i - 1].y, pts[i].x, pts[i].y);
        ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // транспорт в обе стороны
    const vehicles = ['#e8b64c', '#c9d4e3', '#7fe3ff'];
    for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i];
        for (let dir = 0; dir < 2; dir++) {
            const t = dir === 0 ? (phase * 4 + i * 0.21) % 1 : 1 - ((phase * 4 + i * 0.21 + 0.5) % 1);
            const x = a.x + (b.x - a.x) * t + (dir === 0 ? 4 : -4);
            const y = a.y + (b.y - a.y) * t + (dir === 0 ? 2 : -2);
            ctx.fillStyle = 'rgba(0,0,0,0.35)';
            diamond(ctx, x + 2, y + 3, 14, 7);
            diamond(ctx, x, y, 12, 6, vehicles[(i + dir) % vehicles.length]);
        }
    }

    // постройки
    pts.forEach((p, i) => {
        ctx.fillStyle = 'rgba(20,26,20,0.55)';
        ctx.beginPath();
        ctx.ellipse(p.x, p.y + 3, 26, 11, 0, 0, Math.PI * 2);
        ctx.fill();

        const focus = (typeof window !== 'undefined' && window.__focusBuilding) === p.name;
        if (focus) {
            ctx.strokeStyle = 'rgba(255,212,121,0.95)';
            ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(p.x, p.y - 20, 22, 0, Math.PI * 2); ctx.stroke();
        }

        ctx.beginPath();
        ctx.arc(p.x, p.y - 20, 14, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(6,12,22,0.9)';
        ctx.fill();
        ctx.strokeStyle = focus ? '#ffd479' : 'rgba(127,227,255,0.7)';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.font = '14px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#e8f1ff';
        ctx.fillText(ICONS[p.name] || '◆', p.x, p.y - 15);

        const label = p.name;
        const tw = ctx.measureText(label).width;
        ctx.fillStyle = 'rgba(5,10,18,0.82)';
        ctx.fillRect(p.x - tw / 2 - 7, p.y - 56, tw + 14, 16);
        ctx.fillStyle = '#dfe9f7';
        ctx.font = '11px system-ui, sans-serif';
        ctx.fillText(label, p.x, p.y - 44);
        ctx.textAlign = 'left';
    });
}

export function stop() {
    if (state) { state.stop(); state = null; }
}
