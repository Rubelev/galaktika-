// Приглашения и рейтинг: ссылка с реф-кодом, награда обоим, таблица лидеров.
(function () {
    'use strict';

    function token() { try { return localStorage.getItem('galaktika_token') || ''; } catch (e) { return ''; } }
    function money(v) { return Math.round(v || 0).toLocaleString('ru-RU'); }
    function toast(t) { if (typeof window.notify === 'function') window.notify(t); }
    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    function api(path, body) {
        var opt = { headers: { 'X-Auth-Token': token() } };
        if (body) {
            opt.method = 'POST';
            opt.headers['Content-Type'] = 'application/json';
            opt.body = JSON.stringify(body);
        }
        return fetch(path, opt).then(function (r) { return r.json().catch(function () { return {}; }); })
            .catch(function () { return null; });
    }

    // запоминаем реф-код из адреса, чтобы отправить его при регистрации
    (function catchRef() {
        try {
            var m = /[?&]ref=([a-z0-9]+)/i.exec(location.search);
            if (m) localStorage.setItem('galaktika_ref', m[1].toLowerCase());
        } catch (e) { }
    })();

    function modal() {
        var el = document.getElementById('social-modal');
        if (el) return el;
        el = document.createElement('div');
        el.id = 'social-modal';
        el.style.cssText = 'position:fixed;inset:0;display:none;align-items:center;justify-content:center;' +
            'background:rgba(3,8,20,.72);z-index:12000;padding:16px;';
        el.innerHTML = '<div style="width:min(760px,96vw);max-height:86vh;overflow:auto;background:#0b1526;' +
            'border:1px solid #1e3350;border-radius:12px;padding:18px 20px;color:#dbe6f5;">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">' +
            '<h2 style="margin:0;font-size:20px;">🏆 Рейтинг и приглашения</h2>' +
            '<button onclick="window.Social.close()" style="background:none;border:none;color:#8ab4f8;font-size:22px;cursor:pointer;">&times;</button></div>' +
            '<div id="social-invite" style="margin-bottom:12px;"></div>' +
            '<div id="social-board">Загрузка…</div></div>';
        el.addEventListener('click', function (e) { if (e.target === el) window.Social.close(); });
        document.body.appendChild(el);
        return el;
    }

    function shareBtn(title, kind, link) {
        var text = 'Играю в «Галактику» — браузерная космическая стратегия. Заходи:';
        var url = '';
        if (kind === 'vk') url = 'https://vk.com/share.php?url=' + encodeURIComponent(link) + '&title=' + encodeURIComponent(text);
        if (kind === 'tg') url = 'https://t.me/share/url?url=' + encodeURIComponent(link) + '&text=' + encodeURIComponent(text);
        if (kind === 'wa') url = 'https://wa.me/?text=' + encodeURIComponent(text + ' ' + link);
        return '<a href="' + url + '" target="_blank" rel="noopener" style="padding:7px 11px;border-radius:8px;' +
            'background:#101f33;border:1px solid #2c4a6e;color:#cfe0f5;text-decoration:none;' +
            'font:600 12px Inter,system-ui,sans-serif;">' + title + '</a>';
    }

    function renderInvite(d) {
        var box = document.getElementById('social-invite');
        if (!box) return;
        if (!d || d.error) { box.innerHTML = ''; return; }
        var link = location.origin + '/?ref=' + encodeURIComponent(d.code);
        box.innerHTML = '<div style="background:#101f33;border:1px solid #1e3350;border-radius:10px;padding:12px;">' +
            '<div style="font-size:13px;margin-bottom:6px;">Пригласите друга: он получит <b>+25 000 кр</b> и <b>+10 кристаллов</b>, ' +
            'вы — столько же за каждого, кто придёт.</div>' +
            '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">' +
            '<input id="ref-link" readonly value="' + esc(link) + '" style="flex:1;min-width:220px;padding:8px;border-radius:8px;' +
            'background:#0b1526;color:#dbe6f5;border:1px solid #1e3350;font-size:12px;">' +
            '<button id="ref-copy" style="padding:8px 12px;border-radius:8px;border:none;background:#2ecc71;color:#04121f;font-weight:700;cursor:pointer;">Копировать</button>' +
            '<button id="ref-claim" style="padding:8px 12px;border-radius:8px;border:none;background:#4f8ef7;color:#04121f;font-weight:700;cursor:pointer;">Забрать награды</button>' +
            '</div><div style="opacity:.6;font-size:12px;margin-top:6px;">Приглашено: ' + (d.invited || 0) + '</div>' +
            '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;">' +
            shareBtn('ВКонтакте', 'vk', link) +
            shareBtn('Telegram', 'tg', link) +
            shareBtn('WhatsApp', 'wa', link) +
            '</div></div>';

        var copy = document.getElementById('ref-copy');
        if (copy) copy.onclick = function () {
            var input = document.getElementById('ref-link');
            input.select();
            try { document.execCommand('copy'); toast('Ссылка скопирована'); } catch (e) { toast('Скопируйте вручную'); }
        };
        var claim = document.getElementById('ref-claim');
        if (claim) claim.onclick = function () {
            claim.disabled = true;
            api('/api/referral/claim', {}).then(function (res) {
                claim.disabled = false;
                if (!res || res.error) { toast((res && res.error) || 'Сервер недоступен'); return; }
                toast(res.newRewards > 0
                    ? 'Начислено за ' + res.newRewards + ' приглашённых: +' + money(res.newRewards * 25000) + ' кр'
                    : 'Новых приглашённых пока нет');
                load();
            });
        };
    }

    function renderBoard(d) {
        var box = document.getElementById('social-board');
        if (!box) return;
        if (!d || d.error) { box.textContent = 'Рейтинг недоступен'; return; }
        var rows = d.rows || [];
        if (!rows.length) { box.textContent = 'Пока никто не играет'; return; }
        box.innerHTML = '<div style="font-size:13px;opacity:.7;margin-bottom:6px;">Топ по населению</div>' +
            rows.map(function (r, i) {
                return '<div style="display:flex;justify-content:space-between;gap:8px;padding:5px 0;' +
                    'border-bottom:1px solid #16263d;font-size:13px;">' +
                    '<span>' + (i + 1) + '. <b>' + esc(r.name) + '</b>' +
                    (r.stage ? ' <span style="opacity:.5;font-size:11px;">' + esc(r.stage) + '</span>' : '') + '</span>' +
                    '<span style="opacity:.85;">' + money(r.population) + ' жит. · ' + money(r.credits) + ' кр · ' + r.ships + ' кор.</span>' +
                    '</div>';
            }).join('');
    }

    function load() {
        if (!token()) {
            api('/api/leaderboard').then(renderBoard);
            return;
        }
        api('/api/referral/info').then(renderInvite);
        api('/api/leaderboard').then(renderBoard);
    }

    window.Social = {
        open: function () { modal().style.display = 'flex'; load(); },
        close: function () {
            var m = document.getElementById('social-modal');
            if (m) m.style.display = 'none';
        }
    };

    function addMenuButton() {
        var items = document.getElementById('left-menu-items');
        if (!items || document.getElementById('social-menu-btn')) return;
        var b = document.createElement('button');
        b.id = 'social-menu-btn';
        b.className = 'menu-btn';
        b.textContent = '🏆 Рейтинг';
        b.onclick = function () { window.Social.open(); };
        items.appendChild(b);
    }

    function boot() {
        addMenuButton();
        var tries = 0;
        var t = setInterval(function () {
            tries++;
            addMenuButton();
            if (document.getElementById('social-menu-btn') || tries > 20) clearInterval(t);
        }, 1000);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
})();
