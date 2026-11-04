// Язык интерфейса из настроек браузера: RU / EN / SL, с ручным переключением.
// Переводит видимые подписи на странице (меню, заголовки панелей, кнопки).
// Игровые тексты (лор, справочник, описания) остаются на русском, пока нет перевода.
(function () {
    'use strict';

    // ?safe=1 — безопасный режим: модуль не вмешивается в интерфейс
    var SAFE_MODE = /[?&]safe=1/.test(location.search);
    if (SAFE_MODE) return;

    var DICT = {
        en: {
            'История': 'Story', 'Квесты': 'Quests', 'Справочник': 'Codex', 'Флот': 'Fleet',
            'Чат': 'Chat', 'Ресурсы': 'Resources', 'Аренда': 'Rent', 'Луны и газ': 'Moons & gas',
            'Стройка': 'Construction', 'Колония': 'Colony', 'Миры': 'Worlds', 'Задания': 'Tasks',
            'Статистика': 'Statistics', 'Оплата': 'Payments', 'Пожелания': 'Suggestions',
            'Мегапроекты': 'Megaprojects', 'Рейтинг': 'Ranking', 'Общий чат': 'Public chat',
            'Первые шаги': 'First steps', 'Рейтинг и приглашения': 'Ranking & invites',
            'Брошенные миры': 'Abandoned worlds', 'Рост и интерес': 'Growth & interest',
            'Пожелания к развитию': 'Suggestions', 'Отправить': 'Send', 'Копировать': 'Copy',
            'Забрать награды': 'Claim rewards', 'Обновить': 'Refresh', 'Построить': 'Build',
            'Купить': 'Buy', 'Продать': 'Sell', 'Войти': 'Sign in', 'Регистрация': 'Sign up',
            'Выйти': 'Sign out', 'Вернуть бесплатно': 'Reclaim free', 'Колонизировать': 'Colonize',
            'Улучшить': 'Upgrade', 'Арендовать': 'Rent', 'Восстановить': 'Restore',
            'Ускорить': 'Speed up', 'Освоить': 'Settle', 'Загрузка…': 'Loading…',
            'Мои пожелания': 'My suggestions', 'Приглашено': 'Invited',
            'Войдите в игру': 'Sign in to play', 'Сервер недоступен': 'Server unavailable',
            'Достижения': 'Achievements', 'Население': 'Population', 'Кредиты': 'Credits',
            'Закрыть': 'Close', 'Далее': 'Next', 'Назад': 'Back', 'Пропустить': 'Skip'
        },
        sl: {
            'История': 'Zgodba', 'Квесты': 'Naloge', 'Справочник': 'Priročnik', 'Флот': 'Flota',
            'Чат': 'Klepet', 'Ресурсы': 'Viri', 'Аренда': 'Najem', 'Луны и газ': 'Lune in plin',
            'Стройка': 'Gradnja', 'Колония': 'Kolonija', 'Миры': 'Svetovi', 'Задания': 'Naloge',
            'Статистика': 'Statistika', 'Оплата': 'Plačila', 'Пожелания': 'Predlogi',
            'Мегапроекты': 'Megaprojekti', 'Рейтинг': 'Lestvica', 'Общий чат': 'Skupni klepet',
            'Первые шаги': 'Prvi koraki', 'Рейтинг и приглашения': 'Lestvica in povabila',
            'Брошенные миры': 'Zapuščeni svetovi', 'Рост и интерес': 'Rast in zanimanje',
            'Пожелания к развитию': 'Predlogi za razvoj', 'Отправить': 'Pošlji',
            'Копировать': 'Kopiraj', 'Забрать награды': 'Prevzemi nagrade', 'Обновить': 'Osveži',
            'Построить': 'Zgradi', 'Купить': 'Kupi', 'Продать': 'Prodaj', 'Войти': 'Prijava',
            'Регистрация': 'Registracija', 'Выйти': 'Odjava', 'Вернуть бесплатно': 'Vrni brezplačno',
            'Колонизировать': 'Koloniziraj', 'Улучшить': 'Izboljšaj', 'Арендовать': 'Najmi',
            'Восстановить': 'Obnovi', 'Ускорить': 'Pospeši', 'Освоить': 'Naseli',
            'Загрузка…': 'Nalaganje…', 'Мои пожелания': 'Moji predlogi', 'Приглашено': 'Povabljeni',
            'Войдите в игру': 'Prijavite se', 'Сервер недоступен': 'Strežnik ni dosegljiv',
            'Достижения': 'Dosežki', 'Население': 'Prebivalstvo', 'Кредиты': 'Krediti'
        },
        de: {
            'История': 'Geschichte',
            'Квесты': 'Quests',
            'Справочник': 'Kodex',
            'Флот': 'Flotte',
            'Чат': 'Chat',
            'Ресурсы': 'Ressourcen',
            'Аренда': 'Miete',
            'Луны и газ': 'Monde & Gas',
            'Стройка': 'Bau',
            'Колония': 'Kolonie',
            'Миры': 'Welten',
            'Задания': 'Aufgaben',
            'Статистика': 'Statistik',
            'Оплата': 'Zahlungen',
            'Пожелания': 'Vorschläge',
            'Мегапроекты': 'Megaprojekte',
            'Рейтинг': 'Rangliste',
            'Общий чат': 'Öffentlicher Chat',
            'Первые шаги': 'Erste Schritte',
            'Рейтинг и приглашения': 'Rangliste & Einladungen',
            'Брошенные миры': 'Verlassene Welten',
            'Рост и интерес': 'Wachstum & Interesse',
            'Пожелания к развитию': 'Vorschläge zur Entwicklung',
            'Отправить': 'Senden',
            'Копировать': 'Kopieren',
            'Забрать награды': 'Belohnungen abholen',
            'Обновить': 'Aktualisieren',
            'Построить': 'Bauen',
            'Купить': 'Kaufen',
            'Продать': 'Verkaufen',
            'Войти': 'Anmelden',
            'Регистрация': 'Registrieren',
            'Выйти': 'Abmelden',
            'Вернуть бесплатно': 'Kostenlos zurückholen',
            'Колонизировать': 'Kolonisieren',
            'Улучшить': 'Verbessern',
            'Арендовать': 'Mieten',
            'Восстановить': 'Wiederherstellen',
            'Ускорить': 'Beschleunigen',
            'Освоить': 'Besiedeln',
            'Загрузка…': 'Laden…',
            'Мои пожелания': 'Meine Vorschläge',
            'Приглашено': 'Eingeladen',
            'Войдите в игру': 'Bitte anmelden',
            'Сервер недоступен': 'Server nicht erreichbar',
            'Достижения': 'Erfolge',
            'Население': 'Bevölkerung',
            'Кредиты': 'Credits',
            'Закрыть': 'Schließen',
            'Далее': 'Weiter',
            'Назад': 'Zurück',
            'Пропустить': 'Überspringen'
        },
        fr: {
            'История': 'Histoire',
            'Квесты': 'Quêtes',
            'Справочник': 'Codex',
            'Флот': 'Flotte',
            'Чат': 'Chat',
            'Ресурсы': 'Ressources',
            'Аренда': 'Location',
            'Луны и газ': 'Lunes & gaz',
            'Стройка': 'Construction',
            'Колония': 'Colonie',
            'Миры': 'Mondes',
            'Задания': 'Tâches',
            'Статистика': 'Statistiques',
            'Оплата': 'Paiements',
            'Пожелания': 'Suggestions',
            'Мегапроекты': 'Mégaprojets',
            'Рейтинг': 'Classement',
            'Общий чат': 'Chat public',
            'Первые шаги': 'Premiers pas',
            'Рейтинг и приглашения': 'Classement & invitations',
            'Брошенные миры': 'Mondes abandonnés',
            'Рост и интерес': 'Croissance & intérêt',
            'Пожелания к развитию': 'Suggestions de développement',
            'Отправить': 'Envoyer',
            'Копировать': 'Copier',
            'Забрать награды': 'Récupérer les récompenses',
            'Обновить': 'Actualiser',
            'Построить': 'Construire',
            'Купить': 'Acheter',
            'Продать': 'Vendre',
            'Войти': 'Connexion',
            'Регистрация': 'Inscription',
            'Выйти': 'Déconnexion',
            'Вернуть бесплатно': 'Récupérer gratuitement',
            'Колонизировать': 'Coloniser',
            'Улучшить': 'Améliorer',
            'Арендовать': 'Louer',
            'Восстановить': 'Restaurer',
            'Ускорить': 'Accélérer',
            'Освоить': 'Coloniser',
            'Загрузка…': 'Chargement…',
            'Мои пожелания': 'Mes suggestions',
            'Приглашено': 'Invités',
            'Войдите в игру': 'Connectez-vous',
            'Сервер недоступен': 'Serveur indisponible',
            'Достижения': 'Succès',
            'Население': 'Population',
            'Кредиты': 'Crédits',
            'Закрыть': 'Fermer',
            'Далее': 'Suivant',
            'Назад': 'Retour',
            'Пропустить': 'Passer'
        },
        zh: {
            'История': '历史',
            'Квесты': '任务',
            'Справочник': '图鉴',
            'Флот': '舰队',
            'Чат': '聊天',
            'Ресурсы': '资源',
            'Аренда': '租用',
            'Луны и газ': '卫星与气体',
            'Стройка': '建造',
            'Колония': '殖民地',
            'Миры': '世界',
            'Задания': '任务',
            'Статистика': '统计',
            'Оплата': '支付',
            'Пожелания': '建议',
            'Мегапроекты': '超级工程',
            'Рейтинг': '排行榜',
            'Общий чат': '公共聊天',
            'Первые шаги': '第一步',
            'Рейтинг и приглашения': '排行榜与邀请',
            'Брошенные миры': '废弃世界',
            'Рост и интерес': '增长与兴趣',
            'Пожелания к развитию': '发展建议',
            'Отправить': '发送',
            'Копировать': '复制',
            'Забрать награды': '领取奖励',
            'Обновить': '刷新',
            'Построить': '建造',
            'Купить': '购买',
            'Продать': '出售',
            'Войти': '登录',
            'Регистрация': '注册',
            'Выйти': '退出',
            'Вернуть бесплатно': '免费取回',
            'Колонизировать': '殖民',
            'Улучшить': '升级',
            'Арендовать': '租用',
            'Восстановить': '修复',
            'Ускорить': '加速',
            'Освоить': '开拓',
            'Загрузка…': '加载中…',
            'Мои пожелания': '我的建议',
            'Приглашено': '已邀请',
            'Войдите в игру': '请先登录',
            'Сервер недоступен': '服务器不可用',
            'Достижения': '成就',
            'Население': '人口',
            'Кредиты': '信用点',
            'Закрыть': '关闭',
            'Далее': '下一步',
            'Назад': '返回',
            'Пропустить': '跳过'
        }
    };

    var NAMES = { ru: 'Русский', en: 'English', sl: 'Slovenščina', de: 'Deutsch', fr: 'Français', zh: '中文' };
    var current = 'ru';

    function detect() {
        try {
            var saved = localStorage.getItem('galaktika_lang');
            if (saved && NAMES[saved]) return saved;
        } catch (e) { }
        var raw = (navigator.languages && navigator.languages[0]) || navigator.language || 'ru';
        var code = String(raw).toLowerCase().slice(0, 2);
        if (code === 'ru' || code === 'uk' || code === 'be' || code === 'kk') return 'ru';
        if (code === 'sl') return 'sl';
        if (code === 'zh') return 'zh';
        if (code === 'de' || code === 'de-at' || code === 'de-ch') return 'de';
        if (code === 'fr') return 'fr';
        if (DICT[code]) return code;
        return 'en';
    }

    function tr(text) {
        if (!text || current === 'ru') return text;
        var dict = DICT[current];
        if (!dict) return text;
        var s = text.trim();
        if (!s) return text;
        if (dict[s]) return text.replace(s, dict[s]);
        var m = /^([^()]+?)\s*\(([^)]*)\)$/.exec(s);
        if (m && dict[m[1].trim()]) return text.replace(s, dict[m[1].trim()] + ' (' + m[2] + ')');
        // эмодзи в начале: «🏗 Стройка» → «🏗 Construction»
        var e = /^([\u{1F300}-\u{1FAFF}\u2600-\u27BF]+\s*)(.+)$/u.exec(s);
        if (e && dict[e[2].trim()]) return text.replace(s, e[1] + dict[e[2].trim()]);
        return text;
    }

    function walk(root) {
        if (!root) return;
        var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
        var nodes = [];
        while (w.nextNode()) nodes.push(w.currentNode);
        nodes.forEach(function (n) {
            var p = n.parentNode;
            if (!p || p.tagName === 'SCRIPT' || p.tagName === 'STYLE') return;
            var v = tr(n.nodeValue);
            if (v !== n.nodeValue) n.nodeValue = v;
        });
    }

    var timer = null;
    function soon() {
        if (timer) return;
        timer = setTimeout(function () { timer = null; walk(document.body); }, 150);
    }

    function switcher() {
        // язык переехал в «Настройки»: в меню отдельный блок больше не нужен
        var items = document.getElementById('settings-lang');
        if (!items || document.getElementById('lang-box')) return;
        var box = document.createElement('div');
        box.id = 'lang-box';
        box.style.cssText = 'display:flex;gap:6px;padding:10px 12px 4px;flex-wrap:wrap;';
        Object.keys(NAMES).forEach(function (code) {
            var b = document.createElement('button');
            b.textContent = code.toUpperCase();
            b.title = NAMES[code];
            b.style.cssText = 'padding:3px 8px;border-radius:6px;border:1px solid #2c4a6e;background:' +
                (code === current ? '#4f8ef7' : '#101f33') + ';color:' + (code === current ? '#04121f' : '#cfe0f5') +
                ';font:600 11px Inter,system-ui,sans-serif;cursor:pointer;';
            b.onclick = function () {
                try { localStorage.setItem('galaktika_lang', code); } catch (e) { }
                location.reload();
            };
            box.appendChild(b);
        });
        items.appendChild(box);
    }

    function startScreen() {
        var box = document.getElementById('start-lang');
        if (!box) return;
        Array.prototype.forEach.call(box.querySelectorAll('button.lang-pick'), function (b) {
            var code = b.getAttribute('data-lang');
            var on = code === current;
            b.style.background = on ? '#4f8ef7' : '#101f33';
            b.style.color = on ? '#04121f' : '#cfe0f5';
            if (!b.dataset.bound) {
                b.dataset.bound = '1';
                b.onclick = function () {
                    try { localStorage.setItem('galaktika_lang', code); } catch (e) { }
                    location.reload();
                };
            }
        });
    }

    window.LANG = { code: function () { return current; }, t: tr, startScreen: startScreen };

    current = detect();
    document.documentElement.lang = current;

    function boot() {
        walk(document.body);
        switcher();
        startScreen();
        new MutationObserver(soon).observe(document.body, { childList: true, subtree: true });
        var n = 0;
        var t = setInterval(function () {
            n++;
            walk(document.body);
            switcher();
            startScreen();
            if (n > 20) clearInterval(t);
        }, 800);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
})();
