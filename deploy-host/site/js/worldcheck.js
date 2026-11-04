// Проверка логики и физики построек: парящие, утопленные, в воде, за границей мира,
// наложение друг на друга. ?check=1 — отчёт в браузере и в консоли.
(function () {
    'use strict';

    var ISSUES = [];
    var world = 'неизвестно';

    function box3(obj) {
        var b = new THREE.Box3();
        try { b.setFromObject(obj); } catch (e) { return null; }
        return b;
    }

    var THREE = null;

    function scan(three, scene, opts) {
        THREE = three;
        ISSUES = [];
        opts = opts || {};
        var waterLevel = typeof opts.waterLevel === 'number' ? opts.waterLevel : -1;
        var islandR = opts.islandR || 44;
        var groundFn = opts.groundFn || function () { return 0; };
        var waterBoxes = [];
        var obstacles = [];

        scene.traverse(function (n) {
            if (!n.isMesh) return;
            if (n.userData && n.userData.baseY !== undefined) {
                var wb = box3(n);
                if (wb) waterBoxes.push(wb);
            }
        });

        var models = [];
        scene.children.forEach(function (child) {
            if (!child.isGroup) return;
            var b = box3(child);
            if (!b) return;
            var size = new THREE.Vector3();
            b.getSize(size);
            if (size.x < 1 && size.y < 1 && size.z < 1) return;   // мелочь пропускаем
            models.push({ obj: child, box: b, size: size });
        });

        models.forEach(function (m) {
            var c = m.box.getCenter(new THREE.Vector3());
            var ground = groundFn(c.x, c.z);
            var name = (m.obj.userData && m.obj.userData.kind) || (m.obj.userData && m.obj.userData.label) || 'группа';

            // 1) парит над землёй
            if (m.box.min.y > ground + 1.2) {
                ISSUES.push({ type: 'float', name: name, detail: 'низ на ' + (m.box.min.y - ground).toFixed(1) + ' м выше грунта', x: c.x, z: c.z });
            }
            // 2) утоплено
            if (m.box.max.y < ground - 0.5) {
                ISSUES.push({ type: 'sunk', name: name, detail: 'полностью ниже грунта', x: c.x, z: c.z });
            }
            // 3) за границей мира
            if (Math.hypot(c.x, c.z) > islandR) {
                ISSUES.push({ type: 'outside', name: name, detail: 'центр на ' + Math.hypot(c.x, c.z).toFixed(0) + ' м от центра', x: c.x, z: c.z });
            }
            // 4) стоит в воде
            if (waterLevel >= 0 && m.box.min.y < waterLevel + 0.2) {
                var inWater = false;
                for (var i = 0; i < waterBoxes.length; i++) {
                    var wb = waterBoxes[i];
                    if (m.box.min.x < wb.max.x && m.box.max.x > wb.min.x &&
                        m.box.min.z < wb.max.z && m.box.max.z > wb.min.z) { inWater = true; break; }
                }
                if (inWater) {
                    ISSUES.push({ type: 'water', name: name, detail: 'стоит в воде', x: c.x, z: c.z });
                }
            }
        });

        // 5) наложение построек
        for (var a = 0; a < models.length; a++) {
            for (var b2 = a + 1; b2 < models.length; b2++) {
                var ba = models[a].box, bb = models[b2].box;
                if (ba.intersectsBox(bb)) {
                    var ov = new THREE.Vector3();
                    ba.intersection(bb).getSize(ov);
                    var vol = ov.x * ov.y * ov.z;
                    if (vol > 4) {
                        ISSUES.push({ type: 'overlap', name: 'две постройки', detail: 'пересечение ' + vol.toFixed(0) + ' м³' });
                    }
                }
            }
        }

        return ISSUES;
    }

    function report() {
        var box = document.getElementById('wc-panel');
        if (box) box.remove();
        box = document.createElement('div');
        box.id = 'wc-panel';
        box.style.cssText = 'position:fixed;right:12px;top:56px;z-index:9700;width:330px;max-height:70vh;' +
            'overflow:auto;background:rgba(10,16,22,.95);border:2px solid #1e3a5f;border-radius:12px;' +
            'padding:12px;color:#dce8f7;font:12.5px Inter,system-ui,sans-serif';
        var byType = {};
        ISSUES.forEach(function (i) { byType[i.type] = (byType[i.type] || 0) + 1; });
        var names = { float: 'парят', sunk: 'утоплены', outside: 'за границей', water: 'в воде', overlap: 'пересекаются' };
        var head = Object.keys(byType).map(function (k) { return (names[k] || k) + ': ' + byType[k]; }).join(' · ');
        var rows = ISSUES.slice(0, 40).map(function (i) {
            return '<div style="padding:4px 0;border-bottom:1px solid #16263d">' +
                '<b style="color:#ffb48a">' + (names[i.type] || i.type) + '</b> · ' + i.name +
                '<div style="color:#9fb2c6;font-size:11.5px">' + i.detail + '</div></div>';
        }).join('');
        box.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center">' +
            '<b style="color:#8fd6ff">🧪 Проверка мира</b>' +
            '<button id="wc-close" style="border:none;border-radius:6px;padding:3px 8px;background:#2b3238;' +
            'color:#dce8f7;cursor:pointer">✕</button></div>' +
            '<div style="margin:6px 0;color:' + (ISSUES.length ? '#ffd05a' : '#3ec97a') + '">' +
            (ISSUES.length ? 'найдено проблем: ' + ISSUES.length : 'проблем не найдено') + '</div>' +
            '<div style="color:#9fb2c6;font-size:11.5px;margin-bottom:6px">' + (head || '') + '</div>' +
            (rows || '<div style="color:#6f8296">всё стоит на грунте, в границах и не пересекается</div>');
        document.body.appendChild(box);
        document.getElementById('wc-close').onclick = function () { box.remove(); };
        if (window.console) {
            console.table(ISSUES.map(function (i) {
                return { тип: i.type, объект: i.name, детали: i.detail, x: i.x, z: i.z };
            }));
        }
        return ISSUES;
    }

    window.WorldCheck = { scan: scan, report: report, issues: function () { return ISSUES; } };

    if (/[?&]check=1/.test(location.search)) {
        var st = document.createElement('style');
        st.textContent = '#welcome-screen,#auth-overlay,#legend-overlay{display:none !important}';
        document.head.appendChild(st);
        // ждём, пока сцена соберётся, и проверяем сами
        var badge = document.createElement('div');
        badge.id = 'wc-badge';
        badge.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:9999;padding:4px 8px;' +
            'background:#123;color:#8fd6ff;font:11px monospace;border-radius:6px';
        badge.textContent = 'WC: старт';
        document.body.appendChild(badge);
        var tries = 0;
        var timer = setInterval(function () {
            tries++;
            if (window.B3D_SCENE && window.B3D_THREE) {
                clearInterval(timer);
                badge.textContent = 'WC: сцена найдена, проверяю';
                if (window.B3D_CHECK) { window.B3D_CHECK(); badge.style.display = 'none'; return; }
                scan(window.B3D_THREE, window.B3D_SCENE, {
                    groundFn: function (x, z) { return window.B3D_CURVE ? window.B3D_CURVE(x, z) : 0; },
                    waterLevel: 0.25, islandR: 44
                });
                report();
            } else if (tries > 150) {
                clearInterval(timer);
                badge.textContent = 'WC: сцена не найдена';
            } else {
                badge.textContent = 'WC: ждём сцену (' + tries + ')';
            }
        }, 300);
    }
})();
