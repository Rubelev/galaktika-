// ============================================================================
//  EVENT-SANDBOX.JS — песочница событий: агент проходит сценарий, человек
//  потом смотрит шаги, состояния и журнал.
//
//  Сценарий — данные (JSON-подобный объект):
//    { id, title, cause, steps: [ { id, action, title, requires, gives,
//                                   needsItems, failAfter } ] }
//  requires  — какие шаги должны быть выполнены раньше
//  needsItems— какие предметы обязательны
//  gives     — какие предметы выдаёт шаг
//  failAfter — если шаг не выполнен за N мс игрового времени (для таймеров)
//
//  API: Scenario.validate(s), Scenario.create(s), Scenario.can(st, stepId),
//       Scenario.apply(st, stepId), Scenario.autoPlay(s) → transcript
//  Витрина: ?sandbox=quest|quest-auto
// ============================================================================
(function (global) {
    'use strict';

    const SCENARIOS = {
        'station-accident': {
            id: 'station-accident',
            title: 'Авария на станции',
            cause: 'выход из строя системы управления охлаждением',
            steps: [
                { id: 'find-warehouse', action: 'Найти склад', title: 'Найти склад' },
                { id: 'take-fuse', action: 'Взять предохранитель', title: 'Взять предохранитель', requires: ['find-warehouse'], gives: ['fuse'] },
                { id: 'take-tools', action: 'Взять инструменты', title: 'Взять инструменты', requires: ['take-fuse'], gives: ['tools'] },
                { id: 'repair-main', action: 'Починить главный терминал', title: 'Починить главный терминал', requires: ['take-tools'], needsItems: ['fuse', 'tools'] },
                { id: 'repair-aux', action: 'Починить вспомогательный терминал', title: 'Починить вспомогательный', requires: ['repair-main'], needsItems: ['tools'] },
                { id: 'run-shield', action: 'Добежать до щитовой', title: 'Добежать до щитовой', requires: ['repair-aux'] },
                { id: 'power-on', action: 'Включить питание', title: 'Включить питание', requires: ['run-shield'], final: true }
            ]
        },
        // событие с таймером и ветвлением: два пути к спасению станции
        'reactor-overheat': {
            id: 'reactor-overheat',
            title: 'Перегрев реактора',
            cause: 'отказ контура охлаждения',
            steps: [
                { id: 'take-extinguisher', action: 'Взять огнетушитель', title: 'Взять огнетушитель', gives: ['ext'], failAfter: 600000 },
                { id: 'open-valve', action: 'Открыть клапан', title: 'Открыть клапан сброса', requires: ['take-extinguisher'], consumes: ['ext'] },
                { id: 'bypass-pump', action: 'Замкнуть насос', title: 'Замкнуть насос напрямую', requires: ['take-extinguisher'], needsItems: ['ext'] },
                { id: 'vent', action: 'Сбросить пар', title: 'Сбросить пар', requiresAny: ['open-valve', 'bypass-pump'] },
                { id: 'restart', action: 'Запустить реактор', title: 'Запустить реактор', requires: ['vent'], final: true }
            ]
        },
        // пример второго события — чтобы показать расширяемость
        'coolant-leak': {
            id: 'coolant-leak',
            title: 'Утечка охлаждающей жидкости',
            cause: 'трещина в контуре охлаждения',
            steps: [
                { id: 'find-leak', action: 'Найти утечку', title: 'Найти утечку' },
                { id: 'take-sealant', action: 'Взять герметик', title: 'Взять герметик', requires: ['find-leak'], gives: ['sealant'] },
                { id: 'seal-pipe', action: 'Заделать контур', title: 'Заделать контур', requires: ['take-sealant'], needsItems: ['sealant'] },
                { id: 'restart-pump', action: 'Перезапустить насос', title: 'Перезапустить насос', requires: ['seal-pipe'], final: true }
            ]
        }
    };

    function validate(s) {
        const errors = [];
        if (!s || !s.id) errors.push('нет id сценария');
        if (!Array.isArray(s && s.steps) || !s.steps.length) errors.push('нет шагов');
        const ids = new Set();
        (s.steps || []).forEach(function (st, i) {
            if (!st.id) errors.push('шаг #' + i + ': нет id');
            if (ids.has(st.id)) errors.push('дубль шага: ' + st.id);
            ids.add(st.id);
            (st.requires || []).forEach(function (r) {
                if (!ids.has(r)) errors.push('шаг ' + st.id + ': требует несуществующий ' + r);
            });
        });
        return { ok: errors.length === 0, errors: errors };
    }

    function create(s) {
        const st = {
            scenario: s.id,
            failed: false,
            failReason: null,
            deadlines: {},
            done: [],
            items: {},
            startedAt: Date.now(),
            finishedAt: null,
            stage: s.steps[0] ? s.steps[0].id : null,
            log: []
        };
        (s.steps || []).forEach(function (step) {
            (step.gives || []).forEach(function (it) { st.items[it] = false; });
            // таймер шага: если не выполнен за failAfter мс — провал
            if (step.failAfter) st.deadlines[step.id] = Date.now() + Number(step.failAfter);
        });
        return st;
    }

    function stepById(s, id) {
        return (s.steps || []).filter(function (x) { return x.id === id; })[0] || null;
    }

    function nextStep(s, st) {
        return (s.steps || []).filter(function (x) { return st.done.indexOf(x.id) < 0; })[0] || null;
    }

    function can(s, st, stepId) {
        const step = stepById(s, stepId);
        if (!step) return { ok: false, error: 'нет такого шага' };
        if (st.done.indexOf(stepId) >= 0) return { ok: false, error: 'шаг уже выполнен' };
        if (st.failed) return { ok: false, error: 'событие провалено: ' + (st.failReason || '') };
        for (const r of (step.requires || [])) {
            if (st.done.indexOf(r) < 0) return { ok: false, error: 'сначала: ' + (stepById(s, r) || {}).title };
        }
        if (Array.isArray(step.requiresAny) && step.requiresAny.length) {
            const any = step.requiresAny.some(function (r) { return st.done.indexOf(r) >= 0; });
            if (!any) return { ok: false, error: 'нужен один из шагов: ' + step.requiresAny.join(' / ') };
        }
        for (const it of (step.needsItems || [])) {
            if (!st.items[it]) return { ok: false, error: 'нужен предмет: ' + it };
        }
        return { ok: true };
    }

    function apply(s, st, stepId) {
        const c = can(s, st, stepId);
        if (!c.ok) return c;
        const step = stepById(s, stepId);
        st.done.push(stepId);
        (step.gives || []).forEach(function (it) { st.items[it] = true; });
        (step.consumes || []).forEach(function (it) { st.items[it] = false; });
        st.stage = step.final ? 'done' : ((nextStep(s, st) || {}).id || 'done');
        if (st.stage === 'done') st.finishedAt = Date.now();
        st.log.push({ t: Date.now() - st.startedAt, step: stepId, stage: st.stage, items: Object.assign({}, st.items) });
        return { ok: true, stage: st.stage };
    }

    // проверка таймеров: вызывается из UI или из теста с явным временем
    function tick(s, st, nowMs) {
        if (st.failed || st.stage === 'done') return st;
        const now = nowMs || Date.now();
        for (const id in st.deadlines) {
            if (st.done.indexOf(id) >= 0) continue;
            if (now >= st.deadlines[id]) {
                st.failed = true;
                st.failReason = 'не успели: ' + ((stepById(s, id) || {}).title || id);
                st.stage = 'failed';
                st.log.push({ t: now - st.startedAt, step: 'TIMEOUT', stage: 'failed', items: Object.assign({}, st.items) });
                return st;
            }
        }
        return st;
    }

    // проход сценария «как агент»: строго по порядку, с отчётом
    function autoPlay(s) {
        const v = validate(s);
        const st = create(s);
        const transcript = [];
        if (!v.ok) return { ok: false, errors: v.errors, transcript: [] };
        let guard = 0;
        while (st.stage !== 'done' && guard++ < 100) {
            const step = nextStep(s, st);
            if (!step) break;
            const r = apply(s, st, step.id);
            transcript.push({ step: step.id, ok: r.ok, stage: st.stage, error: r.error || null });
            if (!r.ok) break;      // застряли — это баг сценария
        }
        return { ok: st.stage === 'done', stage: st.stage, steps: st.done.length, transcript: transcript };
    }

    // ---------- песочница ----------
    function ui() {
        const q = new URLSearchParams(location.search);
        const mode = q.get('sandbox');
        if (!mode) return;
        document.body.innerHTML = '';
        document.body.style.cssText = 'margin:0;background:#0a0d14;color:#e8eef8;font:14px/1.6 Inter,system-ui,sans-serif';
        const wrap = document.createElement('div');
        wrap.style.cssText = 'max-width:760px;margin:24px auto;padding:20px;border-radius:14px;' +
            'background:rgba(18,26,40,.96);border:1px solid rgba(143,214,255,.25)';
        document.body.appendChild(wrap);

        const scenarioId = (mode === 'quest-auto') ? 'station-accident' : (q.get('id') || 'station-accident');
        const s = SCENARIOS[scenarioId];
        if (!s) { wrap.textContent = 'нет сценария: ' + scenarioId; return; }
        const st = create(s);

        function render(extra) {
            const steps = s.steps.map(function (step) {
                const done = st.done.indexOf(step.id) >= 0;
                const c = can(s, st, step.id);
                return '<div style="margin-top:6px;padding:8px 10px;border-radius:9px;' +
                    'border:1px solid ' + (done ? 'rgba(143,227,168,.6)' : (c.ok ? 'rgba(143,214,255,.45)' : 'rgba(255,255,255,.12)')) + ';' +
                    'background:' + (done ? 'rgba(143,227,168,.12)' : 'rgba(143,214,255,.05)') + '">' +
                    (done ? '✅ ' : (c.ok ? '▶ ' : '⛔ ')) + step.title +
                    (done ? '' : '<span style="opacity:.6;font-size:11px"> — ' + (c.ok ? 'доступно' : c.error) + '</span>') +
                    '</div>';
            }).join('');
            wrap.innerHTML =
                '<div style="font-size:17px;font-weight:700;color:#ffd166">ПЕСОЧНИЦА · ' + s.title + '</div>' +
                '<div style="font-size:12px;opacity:.8">причина: ' + s.cause + '</div>' +
                '<div style="margin-top:8px;font-size:12px">этап: <b>' + st.stage + '</b> · предметы: ' +
                Object.keys(st.items).map(function (k) { return k + (st.items[k] ? '✅' : '❌'); }).join(' ') + '</div>' +
                '<div style="margin-top:10px">' + steps + '</div>' +
                (extra ? '<div style="margin-top:10px;color:#ff8a8a;font-size:12px">' + extra + '</div>' : '') +
                '<div style="margin-top:12px;font:11px/1.5 ui-monospace,monospace;opacity:.8;white-space:pre-line">' +
                st.log.map(function (e) { return '+' + e.t + 'ms ' + e.step + ' → ' + e.stage; }).join('\n') + '</div>' +
                '<pre id="sandbox-report" style="display:none">' + JSON.stringify({
                    scenario: s.id, stage: st.stage, done: st.done, items: st.items, log: st.log
                }) + '</pre>';

            const bar = document.createElement('div');
            bar.style.cssText = 'margin-top:12px;display:flex;gap:8px;flex-wrap:wrap';
            const bAuto = document.createElement('button');
            bAuto.textContent = 'Пройти автоматически (как агент)';
            bAuto.style.cssText = 'padding:9px 12px;border-radius:9px;border:1px solid rgba(255,209,102,.5);background:rgba(255,209,102,.12);color:#ffd166;cursor:pointer;font:inherit';
            bAuto.onclick = function () {
                const r = autoPlay(s);
                document.title = 'SANDBOX ' + (r.ok ? 'OK' : 'FAIL') + ' steps=' + r.steps;
                wrap.insertAdjacentHTML('beforeend', '<pre id="sandbox-auto" style="margin-top:10px;font:11px/1.5 ui-monospace,monospace;color:#8fe3a8;white-space:pre-wrap">' +
                    JSON.stringify(r, null, 1) + '</pre>');
            };
            bar.appendChild(bAuto);
            s.steps.forEach(function (step) {
                const b = document.createElement('button');
                b.textContent = step.title;
                b.style.cssText = 'padding:7px 10px;border-radius:8px;border:1px solid rgba(143,214,255,.35);' +
                    'background:rgba(143,214,255,.08);color:#e8eef8;cursor:pointer;font:inherit;font-size:12px';
                b.onclick = function () {
                    const r = apply(s, st, step.id);
                    render(r.ok ? null : ('нельзя: ' + r.error));
                };
                bar.appendChild(b);
            });
            wrap.appendChild(bar);
            document.title = 'SANDBOX ' + s.id + ' ' + st.stage;
        }

        render();
        if (mode === 'quest-auto') {
            const r = autoPlay(s);
            document.title = 'SANDBOX AUTO ' + (r.ok ? 'OK' : 'FAIL') + ' steps=' + r.steps;
            wrap.insertAdjacentHTML('afterbegin', '<pre id="sandbox-auto" style="font:11px/1.5 ui-monospace,monospace;color:#8fe3a8;white-space:pre-wrap">' +
                JSON.stringify(r, null, 1) + '</pre>');
        }
    }

    global.Scenario = { SCENARIOS: SCENARIOS, validate: validate, create: create, can: can, apply: apply, autoPlay: autoPlay, tick: tick };
    if (typeof module !== 'undefined' && module.exports) module.exports = global.Scenario;

    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ui);
        else ui();
    }
})(typeof window !== 'undefined' ? window : globalThis);
