// ============================================================================
//  BUILD-SYNC.JS — сборки едут за игроком: localStorage + профиль на сервере.
//  Сервер — источник истины (build_save/build_load), localStorage — быстрый кеш.
//  Если сети нет или игрок не вошёл — работаем локально, без ошибок.
// ============================================================================
(function (global) {
    'use strict';
    if ((new URLSearchParams(location.search).get('off') || '').split(',').indexOf('sync') >= 0) { global.BuildSync = null; return; }

    function token() {
        try {
            const keys = ['galaktika_token', 'token', 'authToken', 'dsh_token'];
            for (const k of keys) {
                const v = localStorage.getItem(k);
                if (v) return v;
            }
        } catch (e) { }
        return '';
    }

    function api(action, body) {
        const t = token();
        const url = 'api.php?action=' + action + (t ? '' : '');
        const opts = {
            method: body ? 'POST' : 'GET',
            credentials: 'same-origin',
            headers: Object.assign({ 'Content-Type': 'application/json' }, t ? { 'X-Auth-Token': t } : {})
        };
        if (body) opts.body = JSON.stringify(body);
        return fetch(url, opts).then(function (r) {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.json();
        });
    }

    // сохранить: сначала локально (мгновенно), потом на сервер (не блокируя UI)
    function save(kind, data) {
        try {
            localStorage.setItem('galaktika_' + kind + '_v1', JSON.stringify(data));
        } catch (e) { }
        return api('build_save', { kind: kind, data: data }).then(function (r) {
            global.__buildSynced = (global.__buildSynced || 0) + 1;
            return r;
        }).catch(function (e) {
            global.__buildSyncError = String(e && e.message || e);
            return null;
        });
    }

    // загрузить: сервер приоритетнее, локальный кеш — запасной путь
    function load(kind) {
        return api('build_load&kind=' + encodeURIComponent(kind), null).then(function (r) {
            const b = r && r.build && r.build.data;
            if (b) {
                try { localStorage.setItem('galaktika_' + kind + '_v1', JSON.stringify(b)); } catch (e) { }
                return b;
            }
            return local(kind);
        }).catch(function () { return local(kind); });
    }

    function local(kind) {
        try {
            const raw = localStorage.getItem('galaktika_' + kind + '_v1');
            return raw ? JSON.parse(raw) : null;
        } catch (e) { return null; }
    }

    global.BuildSync = { save: save, load: load, local: local, token: token };
})(typeof window !== 'undefined' ? window : globalThis);