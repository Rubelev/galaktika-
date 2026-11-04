// ============================================================================
//  QUEST-STATION.JS — квест «Авария на станции».
//  Главная версия: выход из строя системы управления охлаждением.
//
//  Порядок действий (нарушить нельзя):
//   1. Найти склад.
//   2. Взять предохранитель.
//   3. Взять набор инструментов.
//   4. Починить главный терминал (нужны предохранитель + инструменты).
//   5. Починить вспомогательный терминал (нужны инструменты).
//   6. Добежать до щитовой.
//   7. Включить питание на терминал → квест завершён.
//
//  Всё время: вращающийся жёлтый маяк + сирена.
//  Логика чистая (без DOM) — её же проверяет tools/quest_station_test.js.
//  Витрина/отладка: ?quest=1
// ============================================================================
(function (global) {
    'use strict';

    const STAGES = [
        'start',            // авария объявлена
        'warehouse',        // склад найден
        'fuse',             // предохранитель взят
        'tools',            // инструменты взяты
        'main-terminal',    // главный терминал починен
        'aux-terminal',     // вспомогательный починен
        'shield-room',      // добежал до щитовой
        'power-on',         // питание включено
        'done'              // квест завершён
    ];

    const ITEMS = { fuse: 'предохранитель', tools: 'набор инструментов' };

    function createQuest() {
        return {
            stage: 'start',
            items: { fuse: false, tools: false },
            alarm: true,          // жёлтый маяк вращается
            siren: true,          // сирена работает
            cause: 'cooling-control',   // система управления охлаждением
            startedAt: null,
            finishedAt: null,
            log: []
        };
    }

    function stageIndex(q) { return STAGES.indexOf(q.stage); }

    function can(q, action) {
        const i = stageIndex(q);
        if (action === 'find-warehouse') return q.stage === 'start';
        if (action === 'take-fuse') return q.stage === 'warehouse';
        if (action === 'take-tools') return q.stage === 'fuse';
        if (action === 'repair-main') return q.stage === 'tools' && q.items.fuse && q.items.tools;
        if (action === 'repair-aux') return q.stage === 'main-terminal' && q.items.tools;
        if (action === 'run-shield') return q.stage === 'aux-terminal';
        if (action === 'power-on') return q.stage === 'shield-room';
        return false;
    }

    function apply(q, action) {
        if (!can(q, action)) {
            const reasons = {
                'take-fuse': 'Сначала найди склад',
                'take-tools': 'Сначала возьми предохранитель',
                'repair-main': 'Нужны предохранитель и инструменты',
                'repair-aux': 'Сначала почини главный терминал',
                'run-shield': 'Сначала почини вспомогательный терминал',
                'power-on': 'Сначала добеги до щитовой',
                'find-warehouse': 'Авария уже началась'
            };
            return { ok: false, error: reasons[action] || 'Действие сейчас недоступно' };
        }
        if (action === 'find-warehouse') q.stage = 'warehouse';
        if (action === 'take-fuse') { q.items.fuse = true; q.stage = 'fuse'; }
        if (action === 'take-tools') { q.items.tools = true; q.stage = 'tools'; }
        if (action === 'repair-main') q.stage = 'main-terminal';
        if (action === 'repair-aux') q.stage = 'aux-terminal';
        if (action === 'run-shield') q.stage = 'shield-room';
        if (action === 'power-on') {
            q.stage = 'done';
            q.alarm = false;      // маяк гаснет
            q.siren = false;      // сирена замолкает
            q.finishedAt = Date.now();
        }
        q.log.push({ t: Date.now(), action: action, stage: q.stage });
        return { ok: true, stage: q.stage };
    }

    function start() {
        const q = createQuest();
        q.startedAt = Date.now();
        return q;
    }

    // ---------- отладочная витрина ?quest=1 ----------
    function ui() {
        if (!new URLSearchParams(location.search).has('quest')) return;
        document.body.innerHTML = '';
        document.body.style.cssText = 'margin:0;background:#0a0d14;color:#e8eef8;font:14px/1.6 Inter,system-ui,sans-serif';

        let q = start();
        const wrap = document.createElement('div');
        wrap.style.cssText = 'max-width:640px;margin:40px auto;padding:24px;border-radius:16px;' +
            'background:rgba(18,26,40,.95);border:1px solid rgba(255,209,102,.35)';
        document.body.appendChild(wrap);

        function render() {
            const alarm = q.alarm
                ? '<span style="display:inline-block;width:14px;height:14px;border-radius:50%;background:#ffd166;' +
                  'box-shadow:0 0 12px #ffd166;animation:spin 1s linear infinite"></span> МАЯК ВРАЩАЕТСЯ'
                : 'маяк выключен';
            const siren = q.siren ? '🔊 СИРЕНА' : 'тишина';
            wrap.innerHTML =
                '<div style="font-size:18px;font-weight:700;color:#ffd166">АВАРИЯ НА СТАНЦИИ</div>' +
                '<div style="opacity:.8;font-size:12px;margin-top:2px">причина: выход из строя системы управления охлаждением</div>' +
                '<div style="margin-top:12px">' + alarm + ' · ' + siren + '</div>' +
                '<div style="margin-top:14px;font-size:13px">Этап: <b>' + q.stage + '</b><br>' +
                'Предохранитель: ' + (q.items.fuse ? '✅' : '❌') + ' · Инструменты: ' + (q.items.tools ? '✅' : '❌') + '</div>' +
                '<div id="q-log" style="margin-top:12px;font-size:12px;opacity:.8;white-space:pre-line">' +
                q.log.slice(-6).map(function (e) { return e.action + ' → ' + e.stage; }).join('\n') + '</div>';

            const actions = [
                ['find-warehouse', 'Найти склад'],
                ['take-fuse', 'Взять предохранитель'],
                ['take-tools', 'Взять инструменты'],
                ['repair-main', 'Починить главный терминал'],
                ['repair-aux', 'Починить вспомогательный'],
                ['run-shield', 'Добежать до щитовой'],
                ['power-on', 'Включить питание']
            ];
            const box = document.createElement('div');
            box.style.cssText = 'margin-top:16px;display:flex;flex-direction:column;gap:6px';
            actions.forEach(function (a) {
                const b = document.createElement('button');
                b.textContent = a[1];
                b.style.cssText = 'padding:9px;border-radius:9px;border:1px solid rgba(143,214,255,.35);' +
                    'background:rgba(143,214,255,.1);color:#e8eef8;cursor:pointer;font:inherit;text-align:left';
                b.onclick = function () {
                    const r = apply(q, a[0]);
                    if (!r.ok) { b.style.borderColor = '#ff6b6b'; b.textContent = a[1] + ' — ' + r.error; }
                    else render();
                };
                box.appendChild(b);
            });
            wrap.appendChild(box);
            const st = document.createElement('style');
            st.textContent = '@keyframes spin{to{transform:rotate(360deg)}}';
            if (!document.getElementById('q-style')) { st.id = 'q-style'; document.head.appendChild(st); }
            document.title = 'QUEST ' + q.stage;
        }
        render();
    }

    global.QuestStation = {
        STAGES: STAGES,
        create: start,
        can: can,
        apply: apply,
        items: ITEMS
    };
    if (typeof module !== 'undefined' && module.exports) module.exports = global.QuestStation;

    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ui);
        else ui();
    }
})(typeof window !== 'undefined' ? window : globalThis);
