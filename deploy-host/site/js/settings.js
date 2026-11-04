// Настройки игрока: язык, интерфейс, аккаунт. Кнопка «⚙ Настройки» в меню.
(function () {
    'use strict';

    var SAFE = /[?&]safe=1/.test(location.search);
    if (SAFE) return;

    var LANGS = { ru: 'Русский', en: 'English', sl: 'Slovenščina', de: 'Deutsch', fr: 'Français', zh: '中文' };

    function el(tag, cls, text) {
        var d = document.createElement(tag);
        if (cls) d.className = cls;
        if (text) d.textContent = text;
        return d;
    }

    function currentLang() {
        // Приоритет — язык из профиля: иначе подсветка не совпадала с фактическим UI
        try {
            var u = (window.getCurrentUser && window.getCurrentUser()) || null;
            if (u && u.lang) return u.lang;
        } catch (e) { }
        try { return localStorage.getItem('galaktika_lang') || 'ru'; } catch (e) { return 'ru'; }
    }

    function setLang(code) {
        try { localStorage.setItem('galaktika_lang', code); } catch (e) { }
        // сохраняем выбор в профиль, чтобы подсветка переживала перезагрузку
        try {
            var u = (window.getCurrentUser && window.getCurrentUser()) || null;
            if (u) { u.lang = code; if (typeof window.saveUser === 'function') window.saveUser(); }
        } catch (e) { }
        location.reload();
    }

    function row(title, hint, control) {
        var r = el('div', 'set-row');
        var left = el('div', 'set-left');
        left.appendChild(el('div', 'set-title', title));
        if (hint) left.appendChild(el('div', 'set-hint', hint));
        r.appendChild(left);
        r.appendChild(control);
        return r;
    }

    function langPicker() {
        var box = el('div', 'set-langs');
        Object.keys(LANGS).forEach(function (code) {
            var b = el('button', 'set-lang' + (code === currentLang() ? ' on' : ''), code.toUpperCase());
            b.type = 'button';
            b.title = LANGS[code];
            b.onclick = function () { setLang(code); };
            box.appendChild(b);
        });
        return box;
    }

    function stationsToggle() {
        var label = el('label', 'set-switch');
        var input = el('input');
        input.type = 'checkbox';
        var saved = '0';
        try { saved = localStorage.getItem('gm_hide_stations') || '0'; } catch (e) { }
        input.checked = saved !== '1';
        input.onchange = function () {
            try { localStorage.setItem('gm_hide_stations', input.checked ? '0' : '1'); } catch (e) { }
            document.body.classList.toggle('hide-stations', !input.checked);
            var mirror = document.getElementById('station-toggle');
            if (mirror) mirror.checked = input.checked;
        };
        label.appendChild(input);
        label.appendChild(el('span', null, 'Показывать'));
        return label;
    }

    function build() {
        if (document.getElementById('settings-modal')) return;

        var modal = el('div');
        modal.id = 'settings-modal';
        modal.className = 'settings-modal';
        modal.style.display = 'none';
        modal.onclick = function (e) { if (e.target === modal) close(); };

        var card = el('div', 'settings-card');

        var head = el('div', 'set-head');
        head.appendChild(el('div', 'set-h1', 'Настройки'));
        var closeBtn = el('button', 'set-close', '✕');
        closeBtn.type = 'button';
        closeBtn.onclick = close;
        head.appendChild(closeBtn);
        card.appendChild(head);

        card.appendChild(el('div', 'set-group', 'Язык интерфейса'));
        card.appendChild(row('Язык', 'Интерфейс переводится автоматически', langPicker()));

        card.appendChild(el('div', 'set-group', 'Интерфейс'));
        card.appendChild(row('Станции и лифты', 'Показывать орбитальные станции и гравитационные лифты', stationsToggle()));

        card.appendChild(el('div', 'set-group', 'Аккаунт'));
        var pwdBtn = el('button', 'set-btn', 'Сменить пароль');
        pwdBtn.type = 'button';
        pwdBtn.onclick = function () {
            close();
            if (typeof window.changeUserPassword === 'function') window.changeUserPassword();
            else if (typeof window.notify === 'function') window.notify('Смена пароля доступна в админке');
        };
        card.appendChild(row('Пароль', 'Смена пароля из игры', pwdBtn));

        var tutBtn = el('button', 'set-btn', 'Показать');
        tutBtn.type = 'button';
        tutBtn.onclick = function () {
            close();
            if (typeof window.showTutorial === 'function') window.showTutorial();
        };
        card.appendChild(row('Обучение', 'Повторить подсказки для новичка', tutBtn));

        var outBtn = el('button', 'set-btn set-btn-danger', 'Выйти');
        outBtn.type = 'button';
        outBtn.onclick = function () {
            close();
            if (typeof window.logout === 'function') window.logout();
        };
        card.appendChild(row('Выход', 'Завершить сессию на этом устройстве', outBtn));

        modal.appendChild(card);
        document.body.appendChild(modal);

        var style = document.createElement('style');
        style.textContent = [
            '.settings-modal{position:fixed;inset:0;z-index:9000;display:none;align-items:center;justify-content:center;',
            'background:rgba(3,10,20,.72);}',
            '.settings-card{width:min(520px,94vw);max-height:88vh;overflow-y:auto;overscroll-behavior:contain;',
            'background:#0b1727;border:1px solid #23405f;border-radius:14px;padding:16px 18px;color:#dce8f7;',
            'font:13px/1.5 Inter,system-ui,Segoe UI,sans-serif;box-shadow:0 20px 60px rgba(0,0,0,.5);}',
            '.set-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}',
            '.set-h1{font-size:16px;font-weight:700;color:#8fd0ff}',
            '.set-close{background:none;border:none;color:#7f93ad;font-size:16px;cursor:pointer}',
            '.set-group{margin:14px 0 6px;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:#5f7590}',
            '.set-row{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:9px 0;border-top:1px solid #14273d}',
            '.set-title{font-weight:600}',
            '.set-hint{font-size:11px;color:#6d8299;margin-top:2px}',
            '.set-langs{display:flex;gap:5px;flex-wrap:wrap;justify-content:flex-end}',
            '.set-lang{padding:4px 9px;border-radius:7px;border:1px solid #2c4a6e;background:#101f33;color:#cfe0f5;',
            'font:600 11px Inter,system-ui,sans-serif;cursor:pointer}',
            '.set-lang.on{background:#4f8ef7;color:#04121f;border-color:#4f8ef7}',
            '.set-btn{padding:6px 12px;border-radius:8px;border:1px solid #2c4a6e;background:#14283f;color:#dce8f7;',
            'font:600 12px Inter,system-ui,sans-serif;cursor:pointer}',
            '.set-btn:hover{background:#1b3550}',
            '.set-btn-danger{border-color:#7a2b2b;background:#2a1414;color:#ffb4b4}'
        ].join('');
        document.head.appendChild(style);
    }

    function open() {
        build();
        var modal = document.getElementById('settings-modal');
        if (modal) modal.style.display = 'flex';
    }

    function close() {
        var modal = document.getElementById('settings-modal');
        if (modal) modal.style.display = 'none';
    }

    function addMenuButton() {
        var box = document.getElementById('left-menu-items');
        if (!box || document.getElementById('settings-btn')) return;
        var b = el('button', 'menu-btn', '⚙ Настройки');
        b.id = 'settings-btn';
        b.setAttribute('data-tip', 'Настройки|Язык, интерфейс, пароль и выход');
        b.onclick = open;
        var anchor = document.getElementById('admin-btn');
        if (anchor && anchor.parentNode === box) box.insertBefore(b, anchor);
        else box.appendChild(b);
        // меню пересобирается по группам — просим разложить заново
        var items = box;
        if (items.dataset) items.dataset.grouped = '0';
        if (typeof window.regroupMenu === 'function') window.regroupMenu();
    }

    function boot() {
        build();
        addMenuButton();
        setInterval(addMenuButton, 3000);
        if (typeof window.regroupMenu === 'function') {
            var box = document.getElementById('left-menu-items');
            if (box && box.dataset) box.dataset.grouped = '0';
            window.regroupMenu();
        }
    }

    window.Settings = { open: open, close: close };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(boot, 1400); });
    else setTimeout(boot, 1400);
})();
