// Порядок в меню: кнопки группируются по смыслу, у каждой группы заголовок.
(function () {
    'use strict';

    // ?safe=1 — безопасный режим: модуль не вмешивается в интерфейс
    var SAFE_MODE = /[?&]safe=1/.test(location.search);
    if (SAFE_MODE) return;

    // русские подписи кнопок меню, чтобы группы собирались по тексту
    var BY_TEXT = [
        { match: /История|Квесты|Справочник|Флот|Ресурсы/, group: 'Игра' },
        { match: /Аренда|Луны|Стройка|Оплата/, group: 'Экономика' },
        { match: /Колония|Миры/, group: 'Колония' },
        { match: /чат|Задания|Пожелания/i, group: 'Люди' },
        { match: /Статистика/, group: 'Админ' }
    ];

    function groupOf(btn) {
        var text = btn.textContent || '';
        for (var i = 0; i < BY_TEXT.length; i++) {
            if (BY_TEXT[i].match.test(text)) return BY_TEXT[i].group;
        }
        return 'Игра';
    }

    var busy = false;

    function signature(items) {
        return Array.prototype.map.call(items.children, function (el) {
            return (el.className === 'menu-section' ? 'H:' : 'B:') + (el.textContent || '').slice(0, 24);
        }).join('|');
    }

    function tidy() {
        if (busy) return false;
        busy = true;
        var items = document.getElementById('left-menu-items');
        if (!items) { busy = false; return false; }
        var buttons = Array.prototype.slice.call(items.querySelectorAll('button'));
        if (!buttons.length) { busy = false; return false; }

        var buckets = {};
        buttons.forEach(function (b) {
            var g = groupOf(b);
            (buckets[g] = buckets[g] || []).push(b);
        });

        // если состав и порядок уже правильные — ничего не трогаем (иначе зацикливание)
        var before = signature(items);
        var plan = [];
        ['Игра', 'Экономика', 'Колония', 'Люди', 'Админ'].forEach(function (name) {
            var list = buckets[name];
            if (!list || !list.length) return;
            plan.push('H:' + name.slice(0, 24));
            list.forEach(function (b) { plan.push('B:' + (b.textContent || '').slice(0, 24)); });
        });
        if (before === plan.join('|')) { busy = false; return true; }

        // убираем только кнопки и заголовки, остальное (переключатель языка и т.п.) сохраняем
        Array.prototype.slice.call(items.children).forEach(function (el) {
            if (el.tagName === 'BUTTON' || el.className === 'menu-section') items.removeChild(el);
        });
        var order = ['Игра', 'Экономика', 'Колония', 'Люди', 'Админ'];
        order.forEach(function (name) {
            var list = buckets[name];
            if (!list || !list.length) return;
            var head = document.createElement('div');
            head.className = 'menu-section';
            head.textContent = name;
            items.appendChild(head);
            list.forEach(function (b) { items.appendChild(b); });
        });
        busy = false;
        return true;
    }

    function boot() {
        var tries = 0;
        var timer = setInterval(function () {
            tries++;
            tidy();
            if (tries > 30) clearInterval(timer);
        }, 700);
        // модули добавляют кнопки в первые секунды: хватает опроса без наблюдателя
        // (наблюдатель приводил к бесконечной перетасовке меню и зависанию страницы)
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
})();
