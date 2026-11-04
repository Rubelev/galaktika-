// Автоматическая инфраструктура: дороги и фонари вокруг построек.
// Правила — в docs/ROADS-AND-LIGHTS.md. Запуск: window.Infrastructure.auto()
// или ?infra=1 (сама ждёт сцену и достраивает сеть).
(function () {
    'use strict';

    var RULES = {
        grid: 20,              // шаг городской сетки, м
        accessMax: 40,         // постройка без дороги дальше 40 м — нарушение
        lampStep: 28,          // фонарь каждые 28 м
        lampMinFromBuilding: 8,// не ближе 8 м к стене
        classes: {
            passage: { width: 5, lamps: 1, color: 0x3b4046 },    // проезд
            street: { width: 8, lamps: 1, color: 0x353a40 },    // улица
            highway: { width: 12, lamps: 2, color: 0x2f343a }   // магистраль
        },
        maxSlope: 0.12,        // уклон дороги не больше 12 %
        turnRadius: 8          // разворотное кольцо
    };

    var plan = null;
    var group = null;

    function dist(ax, az, bx, bz) {
        return Math.hypot(bx - ax, bz - az);
    }

    // ---------- планирование ----------
    function planNetwork(buildings, opts) {
        opts = opts || {};
        var grid = opts.grid || RULES.grid;
        var water = opts.water || [];        // [{x,z,w,d}]
        var curveY = opts.curveY || function () { return 0; };

        var inWater = function (x, z) {
            for (var i = 0; i < water.length; i++) {
                var w = water[i];
                if (Math.abs(x - w.x) < w.w / 2 && Math.abs(z - w.z) < w.d / 2) return true;
            }
            return false;
        };
        var steep = function (x1, z1, x2, z2) {
            var len = dist(x1, z1, x2, z2);
            if (len < 1) return false;
            return Math.abs(curveY(x2, z2) - curveY(x1, z1)) / len > RULES.maxSlope;
        };

        var snap = function (v) { return Math.round(v / grid) * grid; };
        var nodes = [];
        var roads = [];

        // опорные точки: у каждой постройки — въезд со стороны, обращённой к центру
        var entries = buildings.map(function (b) {
            var cx = b.x, cz = b.z;
            var halfW = (b.w || 20) / 2, halfD = (b.d || 20) / 2;
            var toCenterX = -cx, toCenterZ = -cz;
            var ex = cx + (Math.abs(toCenterX) > Math.abs(toCenterZ) ? Math.sign(toCenterX) * (halfW + 4) : 0);
            var ez = cz + (Math.abs(toCenterX) > Math.abs(toCenterZ) ? 0 : Math.sign(toCenterZ) * (halfD + 4));
            return { x: snap(ex), z: snap(ez), b: b };
        });

        // магистрали: ищем свободные полосы рядом с центром
        var laneFree = function (v, alongX) {
            return buildings.every(function (b) {
                var bw = (b.w || 20) / 2 + 4, bd = (b.d || 20) / 2 + 4;
                return alongX ? Math.abs(v - b.z) > bd : Math.abs(v - b.x) > bw;
            });
        };
        var spineZ = 0, spineX = 0;
        for (var k = 1; k <= 3; k++) {
            if (!laneFree(spineZ, true)) spineZ = Math.min(20, k * grid);
            if (!laneFree(spineX, false)) spineX = Math.min(20, k * grid);
            if (laneFree(spineZ, true) && laneFree(spineX, false)) break;
        }
        roads.push({ x1: -44, z1: spineZ, x2: 44, z2: spineZ, cls: 'highway', main: true });
        roads.push({ x1: spineX, z1: -44, x2: spineX, z2: 44, cls: 'highway', main: true });
        nodes.push({ x: spineX, z: spineZ });
        var SPINE = { x: spineX, z: spineZ };

        // подъезды: L-образный маршрут к ближайшей магистрали (оси X или Z)
        entries.forEach(function (e) {
            var nearX = { x: e.x, z: SPINE.z };   // точка на горизонтальной магистрали
            var nearZ = { x: SPINE.x, z: e.z };   // точка на вертикальной магистрали
            var useX = dist(e.x, e.z, nearX.x, nearX.z) <= dist(e.x, e.z, nearZ.x, nearZ.z);
            var joint = useX
                ? { x: e.x, z: 0 }             // сначала вдоль Z до оси X
                : { x: 0, z: e.z };            // сначала вдоль X до оси Z

            // вертикальное плечо — со сдвигом, если полоса занята постройкой
            var freeLane = function (fixed, from, to, alongX) {
                var cand = [fixed, fixed + grid, fixed - grid, fixed + 2 * grid, fixed - 2 * grid];
                for (var c = 0; c < cand.length; c++) {
                    var v = cand[c];
                    var blocked = buildings.some(function (b) {
                        var bw = (b.w || 20) / 2 + 3, bd = (b.d || 20) / 2 + 3;
                        if (alongX) {
                            // дорога вдоль Z на координате x = v
                            return Math.abs(v - b.x) < bw &&
                                   Math.min(from, to) - 2 < b.z + bd && Math.max(from, to) + 2 > b.z - bd;
                        }
                        // дорога вдоль X на координате z = v
                        return Math.abs(v - b.z) < bd &&
                               Math.min(from, to) - 2 < b.x + bw && Math.max(from, to) + 2 > b.x - bw;
                    });
                    if (!blocked || Math.abs(v - fixed) > 2 * grid) return v;
                }
                return fixed;
            };
            if (Math.abs(useX ? e.z : e.x) > grid / 2) {
                if (useX) {
                    var lx = freeLane(e.x, e.z, SPINE.z, true);
                    roads.push({ x1: lx, z1: e.z, x2: lx, z2: SPINE.z, cls: 'street' });
                    if (Math.abs(lx - e.x) > 1) roads.push({ x1: e.x, z1: e.z, x2: lx, z2: e.z, cls: 'passage' });
                } else {
                    var lz = freeLane(e.z, e.x, SPINE.x, false);
                    roads.push({ x1: e.x, z1: lz, x2: SPINE.x, z2: lz, cls: 'street' });
                    if (Math.abs(lz - e.z) > 1) roads.push({ x1: e.x, z1: e.z, x2: e.x, z2: lz, cls: 'passage' });
                }
            }
            nodes.push({ x: e.x, z: e.z });
            nodes.push({ x: joint.x, z: joint.z });
        });

        // проверка: дорога не идёт по воде и не круче 12 %
        var kept = roads.filter(function (r) {
            var steps = Math.max(2, Math.round(dist(r.x1, r.z1, r.x2, r.z2) / 4));
            for (var i = 0; i <= steps; i++) {
                var t = i / steps;
                var x = r.x1 + (r.x2 - r.x1) * t;
                var z = r.z1 + (r.z2 - r.z1) * t;
                if (r.cls !== 'highway' && inWater(x, z)) return false;
            }
            var midX = (r.x1 + r.x2) / 2, midZ = (r.z1 + r.z2) / 2;
            if (!r.main && Math.hypot(midX, midZ) > 42) return false;
            return !steep(r.x1, r.z1, r.x2, r.z2) || r.main;
        });

        // фонари: каждые 28 м, на магистрали — с двух сторон
        var lamps = [];
        kept.forEach(function (r) {
            var len = dist(r.x1, r.z1, r.x2, r.z2);
            var count = Math.max(1, Math.floor(len / (RULES.lampStep * 1.6)));
            var cls = RULES.classes[r.cls];
            for (var i = 0; i <= count; i++) {
                var t = count === 0 ? 0.5 : i / count;
                var x = r.x1 + (r.x2 - r.x1) * t;
                var z = r.z1 + (r.z2 - r.z1) * t;
                var nx = (r.z2 - r.z1) / (len || 1);
                var nz = -(r.x2 - r.x1) / (len || 1);
                var off = cls.width / 2 + 1.2;
                var sides = (r.cls === 'highway' || cls.lamps === 2) ? [-1, 1] : [-1];
                sides.forEach(function (s) {
                    var lx = x + nx * off * s;
                    var lz = z + nz * off * s;
                    var tooClose = buildings.some(function (b) {
                        return Math.abs(lx - b.x) < (b.w || 20) / 2 + RULES.lampMinFromBuilding &&
                               Math.abs(lz - b.z) < (b.d || 20) / 2 + RULES.lampMinFromBuilding;
                    });
                    if (tooClose) return;
                    var dup = lamps.some(function (o) { return Math.hypot(o.x - lx, o.z - lz) < 7; });
                    if (!dup) lamps.push({ x: lx, z: lz, cls: r.cls });
                });
            }
        });

        // проверка доступа: у каждой постройки дорога ближе 40 м
        var violations = [];
        buildings.forEach(function (b) {
            var best = 999;
            kept.forEach(function (r) {
                var vx = r.x2 - r.x1, vz = r.z2 - r.z1;
                var wx = b.x - r.x1, wz = b.z - r.z1;
                var t = Math.max(0, Math.min(1, (wx * vx + wz * vz) / (vx * vx + vz * vz || 1)));
                var px = r.x1 + vx * t, pz = r.z1 + vz * t;
                best = Math.min(best, dist(b.x, b.z, px, pz));
            });
            if (best > RULES.accessMax) {
                violations.push({ name: b.name || 'постройка', x: b.x, z: b.z, distance: Math.round(best) });
            }
        });

        return { roads: kept, lamps: lamps, nodes: nodes, violations: violations };
    }

    // ---------- отрисовка ----------
    function render(THREE, scene, p, curveY) {
        if (group) { scene.remove(group); group = null; }
        group = new THREE.Group();
        group.name = 'infrastructure';

        var asphalt = new THREE.MeshLambertMaterial({ color: 0x33383e });
        var kerb = new THREE.MeshLambertMaterial({ color: 0x9aa2a8 });
        var paint = new THREE.MeshBasicMaterial({ color: 0xe8e4c8 });

        p.roads.forEach(function (r) {
            var len = dist(r.x1, r.z1, r.x2, r.z2);
            if (len < 1) return;
            var cls = RULES.classes[r.cls];
            var mx = (r.x1 + r.x2) / 2, mz = (r.z1 + r.z2) / 2;
            var y = curveY(mx, mz);
            var ang = -Math.atan2(r.z2 - r.z1, r.x2 - r.x1);

            // за пределами острова дорогу не тянем
            if (Math.hypot(mx, mz) > 42) return;
            var pieces = Math.max(1, Math.round(len / 12));
            for (var pc = 0; pc < pieces; pc++) {
                var t0 = pc / pieces, t1 = (pc + 1) / pieces;
                var x0 = r.x1 + (r.x2 - r.x1) * t0, z0 = r.z1 + (r.z2 - r.z1) * t0;
                var x1 = r.x1 + (r.x2 - r.x1) * t1, z1 = r.z1 + (r.z2 - r.z1) * t1;
                var pmx = (x0 + x1) / 2, pmz = (z0 + z1) / 2;
                var plen = dist(x0, z0, x1, z1) + 0.4;
                var py = curveY(pmx, pmz);
                var piece = new THREE.Mesh(new THREE.BoxGeometry(plen, 0.16, cls.width), asphalt);
                piece.position.set(pmx, py + 0.08, pmz);
                piece.rotation.y = ang;
                group.add(piece);
                var pnx = (z1 - z0) / (plen || 1), pnz = -(x1 - x0) / (plen || 1);
                [-1, 1].forEach(function (sd) {
                    var kk = new THREE.Mesh(new THREE.BoxGeometry(plen, 0.24, 0.7), kerb);
                    kk.position.set(pmx + pnx * (cls.width / 2) * sd, py + 0.12, pmz + pnz * (cls.width / 2) * sd);
                    kk.rotation.y = ang;
                    group.add(kk);
                });
            }

            for (var m = 0; m * 6 < len; m++) {
                var t = (m * 6 + 3) / len;
                if (t > 1) break;
                var mark = new THREE.Mesh(new THREE.BoxGeometry(3, 0.03, 0.3), paint);
                mark.position.set(r.x1 + (r.x2 - r.x1) * t, y + 0.17, r.z1 + (r.z2 - r.z1) * t);
                mark.rotation.y = ang;
                group.add(mark);
            }
        });

        // фонари
        p.lamps.forEach(function (l) {
            var y = curveY(l.x, l.z);
            var pole = new THREE.Mesh(new THREE.BoxGeometry(0.26, 4.4, 0.26),
                new THREE.MeshLambertMaterial({ color: 0x2b3238 }));
            pole.position.set(l.x, y + 2.2, l.z);
            group.add(pole);
            var head = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.4, 0.8),
                new THREE.MeshBasicMaterial({ color: 0xffe0a8 }));
            head.position.set(l.x, y + 4.4, l.z);
            group.add(head);
            var pool = new THREE.Mesh(new THREE.CircleGeometry(2.6, 16),
                new THREE.MeshBasicMaterial({
                    color: 0xffd98a, transparent: true, opacity: 0.22,
                    blending: THREE.AdditiveBlending, depthWrite: false
                }));
            pool.rotation.x = -Math.PI / 2;
            pool.position.set(l.x, y + 0.06, l.z);
            group.add(pool);
        });

        scene.add(group);
        return group;
    }

    // зоны воды для проверок (по сцене вода — это меши с userData.baseY)
    function detectWater(THREE, scene) {
        var rects = [];
        scene.traverse(function (n) {
            if (!n.isMesh || !n.userData || n.userData.baseY === undefined) return;
            var b = new THREE.Box3().setFromObject(n);
            var c = b.getCenter(new THREE.Vector3());
            var s = b.getSize(new THREE.Vector3());
            rects.push({ x: c.x, z: c.z, w: Math.max(2, s.x), d: Math.max(2, s.z) });
        });
        return rects;
    }

    function auto() {
        var THREE = window.B3D_THREE;
        var scene = window.B3D_SCENE;
        var curveY = window.B3D_CURVE;
        if (!THREE || !scene) return null;
        var obstacles = window.B3D_OBSTACLES || [];
        var buildings = obstacles.map(function (o, i) {
            return { x: o.x, z: o.z, w: o.r * 2.6, d: o.r * 2.6, name: 'постройка ' + (i + 1) };
        });
        plan = planNetwork(buildings, { curveY: curveY, water: detectWater(THREE, scene) });
        render(THREE, scene, plan, curveY);
        if (window.console) {
            console.log('инфраструктура: дорог ' + plan.roads.length + ', фонарей ' + plan.lamps.length +
                ', нарушений доступа ' + plan.violations.length);
        }
        return plan;
    }

    window.Infrastructure = {
        plan: planNetwork,
        render: render,
        auto: auto,
        rules: RULES,
        last: function () { return plan; }
    };

    if (/[?&]infra=1/.test(location.search)) {
        var tries = 0;
        var t = setInterval(function () {
            tries++;
            if (window.B3D_SCENE && window.B3D_OBSTACLES && window.B3D_OBSTACLES.length) {
                clearInterval(t);
                auto();
            } else if (tries > 150) {
                clearInterval(t);
            }
        }, 300);
    }
})();
