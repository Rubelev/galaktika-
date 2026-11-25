// ============================================================================
//  SCENE-MODEL.JS — логика сцены вместо правок «под каждый кадр».
//
//  Идея: у сцены ОДНА математическая модель. И планета, и её орбита, и кольца,
//  и свечение звезды, и порядок отрисовки считаются из одних и тех же данных
//  (каталог тел: a, период, эпоха, наклон, радиус, ось). Рендерер (DOM или
//  canvas) только рисует то, что вернула модель — он не считает геометрию.
//
//  Почему так: раньше линия орбиты рисовалась по одной шкале, планета шла по
//  другой, кольца наклонялись «на глаз», свечение задавалось box-shadow.
//  Каждый такой дефект приходилось править отдельно. Здесь расхождение
//  невозможно: орбита и планета — результат одной функции.
// ============================================================================
(function (global) {
    'use strict';

    const AU_KM = 149597870.7;
    const MOON_ORBIT_SCALE = 25;   // визуальное увеличение лунных орбит
    const DEG = Math.PI / 180;
    // ЭПОХА J2000: m0/эпоха в каталоге заданы на 2000-01-01 12:00 UT — дни
    // считаем от неё же, а не от 1970 (иначе фаза расходится с Кеплером).
    const EPOCH_MS = Date.UTC(2000, 0, 1, 12, 0, 0);
    const DAY_MS = 86400000;

    // Безопасная нулевая позиция для вырожденного тела (C-05).
    function zeroOrbit() {
        return { x: 0, y: 0, z: 0, angle: 0, r: 0, invalid: true };
    }

    // ---------- 1. ОРБИТА: положение тела в плоскости системы ----------
    // Круговая модель по каталогу: a (а.е.), период (сут), эпоха (град).
    // каталог может отдавать короткие имена (a, e, i...) или длинные (orbit_a_au...)
    function norm(body) {
        const b = (body && typeof body === 'object') ? body : {};
        const pick = (a, c) => (b[a] !== undefined ? b[a] : b[c]);
        return {
            a: Number(pick('orbit_a_au', 'a')),
            e: pick('orbit_e', 'e'),
            i: Number(pick('orbit_i_deg', 'i')) || 0,
            om: Number(pick('orbit_om_deg', 'om')) || 0,
            w: Number(pick('orbit_w_deg', 'w')) || 0,
            m0: Number(pick('orbit_m0_deg', 'm0')) || 0,
            P: Number(pick('orbit_period_days', 'P'))
        };
    }

    function orbitPosition(body, timeMs) {
        // ГРАНИЦА (C-05): нет тела / NaN-время → нулевая позиция, не TypeError/NaN
        if (!body || typeof body !== 'object') return zeroOrbit();
        const t = Number(timeMs);
        if (!isFinite(t)) return zeroOrbit();
        // Если у тела есть элементы Кеплера (a, e, i, om, w, M0) — считаем
        // по настоящей орбите, а не по кругу. Одна функция для планеты и линии.
        const n = norm(body);
        if (global.OrbitKepler && n.e !== undefined && n.e !== null) {
            const k = global.OrbitKepler.position({
                a: n.a, e: Number(n.e), i: n.i, om: n.om, w: n.w, M0: n.m0, P: n.P || 365.25
            }, t);
            if (!isFinite(k.x) || !isFinite(k.y) || !isFinite(k.z)) return zeroOrbit();
            // для лун масштаб орбиты свой: в реальном масштабе Луна была бы в 0,5 px
            const px = pxForAu(body.parent ? MOON_ORBIT_SCALE : 1);
            return { x: k.x * px, y: k.y * px, z: k.z * px, angle: Math.atan2(k.y, k.x), r: k.r * px, kepler: true };
        }
        const a = Number(n.a);
        const period = Number(n.P);
        if (!isFinite(a) || a <= 0 || !isFinite(period) || period <= 0) return zeroOrbit();
        const days = (t - EPOCH_MS) / DAY_MS;
        const angle = (Number(body.orbit_epoch_deg || body.m0) || 0) * DEG + (days / period) * Math.PI * 2;
        const r = global.SceneModel.pxForAu(a);
        return { x: Math.cos(angle) * r, y: Math.sin(angle) * r, angle: angle, r: r };
    }

    // ---------- 2. ШКАЛА: одна на всю сцену ----------
    function pxForAu(au) {
        const px = (global.SceneModel && global.SceneModel.pxPerAu) || 185;
        return au * px;
    }

    // ---------- 3. РАЗМЕР: из физического радиуса, с разумными границами ----------
    function pxForRadius(radiusKm, kind) {
        const min = kind === 'moon' ? 2.5 : (kind === 'star' ? 24 : 5);
        const max = kind === 'star' ? 110 : (kind === 'moon' ? 14 : 38);
        // ГРАНИЦА: NaN/0/отрицательный радиус → считаем как 1 км (без NaN в рендере)
        const rk = Number(radiusKm);
        const base = (isFinite(rk) && rk > 0) ? rk : 1;
        // корень сглаживает разброс: Юпитер не в 11 раз больше Земли на экране
        const px = Math.sqrt(base) * 0.42;
        return Math.max(min, Math.min(max, px));
    }

    // ---------- 4. КОЛЬЦА: наклон из оси планеты, а не «на глаз» ----------
    function ringFrame(body) {
        if (!body.has_rings) return null;
        const tilt = Number(body.axis_tilt_deg) || 0;
        return {
            inner: 1.35,           // в радиусах планеты
            outer: 2.25,
            // кольца лежат в плоскости экватора: при 0° — горизонтально
            rotateX: 75 - Math.min(60, Math.abs(tilt) * 0.35),
            opacity: 0.55
        };
    }

    // ---------- 5. СВЕЧЕНИЕ ЗВЕЗДЫ: из радиуса, всегда круглое ----------
    function starGlow(body, pxRadius) {
        if (body.kind !== 'star' && body.type_id !== 'star') return null;
        return { radius: pxRadius * 2.6, soft: 0.55, color: body.color || '#ffb020' };
    }

    // ---------- 6. ПРОЕКЦИЯ: единственное место, где камера ----------
    // camera: { scale, tilt (roll вокруг X), spin (вокруг Z), cx, cy }
    function project(x, y, camera) {
        const c = camera || {};
        const scale = c.scale || 1;
        const tilt = (c.tilt || 0) * DEG;
        const spin = (c.spin || 0) * DEG;
        // экранная плоскость: сначала поворот вокруг Z, затем сжатие по Y от наклона
        const xr = x * Math.cos(spin) - y * Math.sin(spin);
        const yr = x * Math.sin(spin) + y * Math.cos(spin);
        const yt = yr * Math.cos(tilt);
        return {
            x: (c.cx || 0) + xr * scale,
            y: (c.cy || 0) + yt * scale,
            depth: yr * Math.sin(tilt),      // для порядка отрисовки
            scale: scale * (1 + 0.0 * Math.sin(tilt))
        };
    }

    // ---------- 7. ПОЛНЫЙ КАДР: всё, что нужно рендереру ----------
    // ЕДИНЫЙ ИСТОЧНИК: позиция и линия орбиты считаются ОДНИМ вызовом.
    // Раньше позиция шла через orbitPosition, а линия — через OrbitKepler.path
    // вручную, и они расходились на сотни/тысячи px. Теперь расхождение
    // невозможно по построению: оба значения возвращает эта функция.
    // РАДИАЛЬНАЯ ШКАЛА ДЛЯ ВСЕЙ СИСТЕМЫ: линейная (185 px/а.е.) выбрасывала
    // 9 из 18 тел за кадр (Юпитер 962 px, Седна 93 000 px). Логарифм
    // укладывает Меркурий…Седну в ~60…530 px и применяется ОДНОВРЕМЕННО
    // к позиции и к линии орбиты.
    function radialPx(aAu) {
        const a = Math.max(0.05, Number(aAu) || 1);
        return 72 * Math.log(1 + a / 0.3);
    }
    function compressR(a) {
        const a2 = Math.max(0.05, Number(a) || 1);
        return radialPx(a2) / (a2 * pxForAu(1));
    }

    // ВИДИМЫЙ РАДИУС ЛУННОЙ ОРБИТЫ: у планет в кадре ~60–330 px, а лунная
    // орбита в тех же единицах — доли пикселя (луна стоит НА планете и
    // перехватывает клик). Раскладываем луны кольцами вокруг планеты.
    // РАДИУС КОЛЬЦА ЛУНЫ — ОТ РЕАЛЬНОЙ ОРБИТЫ, без индексов:
    // индекс не доезжал до модели, из-за чего первая луна садилась на планету
    // (io 1 px, moon 2,8 px). Логарифм по a монотонен, поэтому луны одного
    // родителя гарантированно на разных кольцах.
    // РАНГ ЛУНЫ СЧИТАЕТСЯ ЗДЕСЬ ЖЕ по каталогу (byId): сколько лун того же
    // родителя имеют меньшую большую полуось. Никаких внешних индексов —
    // именно из-за них радиусы не применялись (io 1 px, Луна 2,8 px).
    // Шаг 14 px гарантированно больше зоны клика (7–9 px), поэтому
    // кольца соседних лун не перекрываются.
    function moonOrbitPx(body, byId) {
        if (!body || typeof body !== 'object') return 24;
        let rank = 0;
        if (byId) {
            for (const id in byId) {
                const s2 = byId[id];
                if (!s2 || s2.parent !== body.parent || s2.id === body.id) continue;
                if (Number(s2.a) < Number(body.a)) rank++;
            }
        }
        return 24 + 16 * rank;
    }

    function orbitFrame(body, timeMs, byId) {
        // ГРАНИЦА (C-05): нет тела — пустой кадр, не TypeError
        if (!body || typeof body !== 'object') {
            return { pos: { x: 0, y: 0 }, path: null, r: 0, off: { x: 0, y: 0 }, invalid: true };
        }
        const n = norm(body);
        const pos = orbitPosition(body, timeMs);
        let path = null;
        if (global.OrbitKepler && n.e !== undefined && n.e !== null && n.a > 0) {
            const px = pxForAu(1) * (body.parent ? MOON_ORBIT_SCALE : 1);
            // у вытянутых орбит (e>0.3) 128 точек дают разрыв между сэмплами
            // в тысячи px: Седна «отклонялась» на 2486 px из-за грубой сетки
            const samples = Number(n.e) > 0.3 ? 1024 : (Number(n.e) > 0.1 ? 256 : 128);
            path = global.OrbitKepler.path({ a: n.a, e: Number(n.e), i: n.i, om: n.om, w: n.w }, samples)
                .map(function (q) { return { x: q.x * px, y: q.y * px }; });
        }
        // смещение родителя — ОДНО и для позиции, и для линии
        let off = { x: 0, y: 0 };
        const hasParent = !!(body.parent && byId && byId[body.parent]);
        if (hasParent) {
            const parent = byId[body.parent];
            const pp = orbitPosition(parent, timeMs);
            // КЛЮЧЕВОЕ: родитель нарисован по логарифмической шкале,
            // значит и смещение луны должно быть по ней же
            const pk = compressR(norm(parent).a);
            off = { x: pp.x * pk, y: pp.y * pk };
        }
        if (body.parent) {
            if (!hasParent) {
                // ГРАНИЦА (C-05): родителя нет в кадре — луна остаётся в своей
                // вычисленной точке (не «кольцо у центра»), линия не рисуется
                const kk = compressR(n.a);
                return { pos: { x: pos.x * kk, y: pos.y * kk }, path: null,
                         r: pos.r * kk, off: off, parentMissing: true };
            }
            // луна: сохраняем УГОЛ, но ставим на видимое кольцо
            const L = Math.hypot(pos.x, pos.y) || 1;
            const R = moonOrbitPx(body, byId);
            const ang = Math.atan2(pos.y, pos.x);
            const mx = Math.cos(ang) * R, my = Math.sin(ang) * R;
            const ring = [];
            for (let a = 0; a < 64; a++) {
                const t = a / 64 * Math.PI * 2;
                ring.push({ x: Math.cos(t) * R + off.x, y: Math.sin(t) * R + off.y });
            }
            return { pos: { x: mx + off.x, y: my + off.y }, path: ring, r: R, off: off };
        }
        const k = compressR(n.a);
        if (path) path.forEach(function (q) { q.x = q.x * k + off.x; q.y = q.y * k + off.y; });
        return { pos: { x: pos.x * k + off.x, y: pos.y * k + off.y }, path: path, r: pos.r * k, off: off };
    }

    function frame(bodies, timeMs, camera) {
        const out = [];
        // единое ядро: тело может вращаться вокруг родителя (луна — вокруг планеты),
        // корабли-агенты берут физику из класса (ship_class)
        const byId = {};
        (bodies || []).forEach(function (b) { if (b && typeof b === 'object' && b.id) byId[b.id] = b; });
        (bodies || []).forEach(function (b) {
            // ГРАНИЦА (C-05): null/мусор в списке тел не роняет весь кадр
            if (!b || typeof b !== 'object') return;
            const kind = b.kind || (b.type_id && b.type_id.indexOf('moon') === 0 ? 'moon' : 'planet');
            let pos = orbitPosition(b, timeMs);
            // если есть родитель — прибавляем его позицию (луна вокруг планеты)
            if (b.parent && byId[b.parent]) {
                const pp = orbitPosition(byId[b.parent], timeMs);
                pos = { x: pos.x + pp.x, y: pos.y + pp.y, z: (pos.z || 0) + (pp.z || 0),
                        angle: pos.angle, r: Math.hypot(pos.x, pos.y), kepler: pos.kepler || pp.kepler };
            }
            if (!isFinite(pos.x) || !isFinite(pos.y)) pos = zeroOrbit();
            const p = project(pos.x, pos.y, camera);
            const r = pxForRadius(Number(b.radius_km) || 100, kind);
            out.push({
                id: b.id, kind: kind,
                // орбита — ТО ЖЕ число, что позиция: расхождение невозможно
                orbit: { r: pos.r, angle: pos.angle },
                pos: { x: p.x, y: p.y, depth: p.depth },
                radius: r * (camera && camera.scale || 1),
                rings: ringFrame(b),
                glow: starGlow(b, r),
                parent: b.parent_id || null,
                role: b.role || null
            });
        });
        // порядок: дальние (depth < 0) сначала, ближние сверху
        out.sort(function (a, b) { return a.pos.depth - b.pos.depth; });
        return out;
    }

    global.SceneModel = {
        pxPerAu: 185,
        AU_KM: AU_KM,
        orbitPosition: orbitPosition,
        pxForAu: pxForAu,
        pxForRadius: pxForRadius,
        ringFrame: ringFrame,
        starGlow: starGlow,
        project: project,
        orbitFrame: orbitFrame,
        frame: frame
    };

    if (typeof module !== 'undefined' && module.exports) module.exports = global.SceneModel;
})(typeof window !== 'undefined' ? window : globalThis);
