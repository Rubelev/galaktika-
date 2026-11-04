// Пожелания к развитию: текстовое поле для игрока, раз в минуту можно отправить.
(function () {
    'use strict';

    function token() { try { return localStorage.getItem('galaktika_token') || ''; } catch (e) { return ''; } }

    function modal() {
        var el = document.getElementById('feedback-modal');
        if (el) return el;
        el = document.createElement('div');
        el.id = 'feedback-modal';
        el.style.cssText = 'position:fixed;inset:0;display:none;align-items:center;justify-content:center;' +
            'background:rgba(3,8,20,.72);z-index:12000;padding:16px;';
        el.innerHTML = '<div style="width:min(620px,96vw);background:#0b1526;border:1px solid #1e3350;' +
            'border-radius:12px;padding:18px 20px;color:#dbe6f5;">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">' +
            '<h2 style="margin:0;font-size:20px;">💡 Пожелания к развитию</h2>' +
            '<button onclick="window.Feedback.close()" style="background:none;border:none;color:#8ab4f8;font-size:22px;cursor:pointer;">&times;</button></div>' +
            '<div style="opacity:.7;font-size:12px;margin-bottom:8px;">Что добавить или поправить в игре? Читаю каждый день.</div>' +
            '<div style="background:#101f33;border:1px solid #1e3350;border-radius:10px;padding:9px 11px;font-size:12px;line-height:1.45;margin-bottom:10px;">' +
            '<b>Как это работает:</b> пожелание проходит проверку — если идея годная, вы получаете ' +
            '<b>рейтинг и кристаллы Вечности</b> (обычно 5, за крупную идею — до 50). ' +
            'Если предложение принято в работу — вам придёт сообщение об этом прямо в игру.</div>' +
            '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px;">' +
            ['idea|Идея','ship|Корабль','building|Постройка','equipment|Оборудование'].map(function (pair) {
                var parts = pair.split('|');
                return '<button type="button" class="fb-kind" data-kind="' + parts[0] + '" style="padding:5px 10px;' +
                    'border-radius:8px;border:1px solid #2c4a6e;background:#101f33;color:#cfe0f5;' +
                    'font:600 12px Inter,system-ui,sans-serif;cursor:pointer;">' + parts[1] + '</button>';
            }).join('') +
            '</div>' +
            '<textarea id="feedback-text" maxlength="4000" rows="6" placeholder="Например: не хватает подсказок про налоги; хочу больше лун; сделайте стройку быстрее…" ' +
            'style="width:100%;box-sizing:border-box;padding:10px;border-radius:10px;background:#101f33;color:#dbe6f5;' +
            'border:1px solid #1e3350;font:14px/1.4 Inter,system-ui,sans-serif;resize:vertical;"></textarea>' +
            '<div style="margin-top:10px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;">' +
            '<label style="padding:6px 11px;border-radius:9px;border:1px solid #2c4a6e;background:#101f33;cursor:pointer;font-size:12px;">' +
            '📎 Прикрепить<br><span style="opacity:.55;font-size:10px;">картинка до 8 МБ · видео до 40 МБ</span>' +
            '<input id="feedback-files" type="file" accept="image/*,video/*" multiple style="display:none;"></label>' +
            '<span id="feedback-att-info" style="font-size:11px;opacity:.6;"></span></div>' +
            '<div id="feedback-preview" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;"></div>' +
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;">' +
            '<span id="feedback-count" style="opacity:.55;font-size:12px;">0 / 1000</span>' +
            '<button id="feedback-send" style="padding:9px 16px;border-radius:9px;border:none;background:#2ecc71;' +
            'color:#04121f;font-weight:700;cursor:pointer;">Отправить</button></div>' +
            '<div id="feedback-msg" style="margin-top:8px;font-size:13px;"></div>' +
            '<div id="feedback-mine" style="margin-top:14px;padding-top:12px;border-top:1px solid #16263d;"></div></div>';
        el.addEventListener('click', function (e) { if (e.target === el) window.Feedback.close(); });
        document.body.appendChild(el);
        return el;
    }

    function bind() {
        var kind = 'idea';
        Array.prototype.forEach.call(document.querySelectorAll('button.fb-kind'), function (b) {
            b.onclick = function () {
                kind = b.getAttribute('data-kind');
                Array.prototype.forEach.call(document.querySelectorAll('button.fb-kind'), function (x) {
                    x.style.background = '#101f33'; x.style.color = '#cfe0f5';
                });
                b.style.background = '#4f8ef7'; b.style.color = '#04121f';
            };
        });
        var ta = document.getElementById('feedback-text');
        var counter = document.getElementById('feedback-count');
        var btn = document.getElementById('feedback-send');
        var msg = document.getElementById('feedback-msg');
        if (!ta || ta.dataset.bound) return;
        ta.dataset.bound = '1';
        ta.addEventListener('input', function () {
            if (counter) counter.textContent = ta.value.length + ' / 4000';
        });
        var filesInput = document.getElementById('feedback-files');
        var preview = document.getElementById('feedback-preview');
        var attInfo = document.getElementById('feedback-att-info');
        var picked = [];

        function renderPreview() {
            if (!preview) return;
            preview.innerHTML = '';
            picked.forEach(function (f, i) {
                var card = document.createElement('div');
                card.style.cssText = 'position:relative;width:74px;height:74px;border-radius:9px;' +
                    'border:1px solid #2c4a6e;overflow:hidden;background:#0d1a29;';
                if (f.kind === 'video') {
                    var v = document.createElement('video');
                    v.src = f.previewUrl;
                    v.muted = true;
                    v.style.cssText = 'width:100%;height:100%;object-fit:cover;';
                    card.appendChild(v);
                    var play = document.createElement('span');
                    play.textContent = '\u25B6';
                    play.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;' +
                        'justify-content:center;font-size:20px;color:#fff;text-shadow:0 1px 6px #000;';
                    card.appendChild(play);
                } else {
                    var img = document.createElement('img');
                    img.src = f.previewUrl;
                    img.style.cssText = 'width:100%;height:100%;object-fit:cover;';
                    card.appendChild(img);
                }
                var x = document.createElement('button');
                x.type = 'button';
                x.textContent = '\u2715';
                x.style.cssText = 'position:absolute;right:2px;top:2px;width:18px;height:18px;border-radius:50%;' +
                    'border:none;background:rgba(0,0,0,.65);color:#fff;font-size:11px;cursor:pointer;';
                x.onclick = function (ev) { ev.stopPropagation(); picked.splice(i, 1); renderPreview(); };
                card.appendChild(x);
                preview.appendChild(card);
            });
            if (attInfo) attInfo.textContent = picked.length ? ('файлов: ' + picked.length) : '';
        }

        if (filesInput) filesInput.onchange = function () {
            Array.prototype.forEach.call(filesInput.files || [], function (file) {
                if (picked.length >= 5) return;
                var isVideo = file.type.indexOf('video') === 0;
                var limit = isVideo ? 40 * 1024 * 1024 : 8 * 1024 * 1024;
                if (file.size > limit) { if (msg) msg.textContent = 'Файл больше ' + (isVideo ? '40' : '8') + ' МБ'; return; }
                picked.push({ file: file, kind: isVideo ? 'video' : 'image',
                    name: file.name, previewUrl: URL.createObjectURL(file) });
            });
            filesInput.value = '';
            renderPreview();
        };

        function uploadOne(item) {
            var CHUNK = 380 * 1024;
            var total = Math.ceil(item.file.size / CHUNK) || 1;
            var uploadId = Array.from(crypto.getRandomValues(new Uint8Array(8)))
                .map(function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
            var index = 0;
            function next() {
                var slice = item.file.slice(index * CHUNK, (index + 1) * CHUNK);
                return slice.arrayBuffer().then(function (buf) {
                    var bytes = new Uint8Array(buf);
                    var bin = '';
                    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
                    return fetch('/api/feedback/upload', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'X-Auth-Token': token() },
                        body: JSON.stringify({ uploadId: uploadId, chunkIndex: index, chunks: total,
                            name: item.name, data: btoa(bin) })
                    }).then(function (r) { return r.json().catch(function () { return {}; }); });
                }).then(function (res) {
                    if (!res || res.error) throw new Error((res && res.error) || 'ошибка загрузки');
                    index += 1;
                    if (attInfo) attInfo.textContent = 'загрузка ' + Math.min(100, Math.round(index / total * 100)) + '%';
                    if (index < total) return next();
                    return { url: res.url, kind: res.kind, name: item.name };
                });
            }
            return next();
        }

        if (btn) btn.onclick = function () {
            var text = (ta.value || '').trim();
            if (text.length < 3) { if (msg) msg.textContent = 'Напишите хотя бы пару слов'; return; }
            if (!token()) { if (msg) msg.textContent = 'Войдите в игру'; return; }
            btn.disabled = true;
            var uploaded = [];
            var chain = Promise.resolve();
            picked.forEach(function (item) {
                chain = chain.then(function () {
                    return uploadOne(item).then(function (att) { uploaded.push(att); });
                });
            });
            chain.then(function () {
            return fetch('/api/feedback/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-Auth-Token': token() },
                body: JSON.stringify({ text: text, kind: kind, attachments: uploaded })
            });
            }).then(function (r) { return r.json().catch(function () { return {}; }); }).then(function (res) {
                btn.disabled = false;
                if (!res || res.error) { if (msg) msg.textContent = (res && res.error) || 'Не удалось отправить'; return; }
                ta.value = '';
                if (counter) counter.textContent = '0 / 4000';
                picked.length = 0;
                renderPreview();
                if (res.quest) {
                    if (msg) msg.innerHTML = 'Спасибо! Пожелание записано, №' + res.entry.id +
                        '<div style="color:#2ecc71;margin-top:4px;">✓ Задание «' + res.quest.title +
                        '» выполнено: +' + res.quest.credits.toLocaleString('ru-RU') + ' кр' +
                        (res.quest.crystals ? ', +' + res.quest.crystals + ' кристалла' : '') + '</div>';
                } else if (msg) msg.textContent = 'Спасибо! Пожелание записано, №' + res.entry.id;
                if (typeof window.notify === 'function') window.notify('Пожелание отправлено');
            }).catch(function (err) {
            btn.disabled = false;
            if (attInfo) attInfo.textContent = '';
            if (msg) msg.textContent = (err && err.message) || 'Сервер недоступен';
        });
        };
    }

    var STATUS = {
        'new': ['на проверке', '#f1c40f'],
        'review': ['рассматривается', '#f1c40f'],
        'accepted': ['принято', '#2ecc71'],
        'rejected': ['отклонено', '#8a94a6']
    };

    function renderMine(data) {
        var box = document.getElementById('feedback-mine');
        if (!box) return;
        var list = (data && data.mine) || [];
        if (!list.length) { box.innerHTML = '<div style="opacity:.55;font-size:12px;">Ваших пожеланий пока нет.</div>'; return; }
        box.innerHTML = '<div style="font-size:12px;opacity:.65;margin-bottom:6px;">Мои пожелания</div>' +
            list.slice(-10).reverse().map(function (f) {
                var st = STATUS[f.status] || STATUS['new'];
                return '<div style="padding:6px 0;border-bottom:1px solid #16263d;font-size:12px;">' +
                    '<div style="display:flex;justify-content:space-between;gap:8px;">' +
                    '<span style="opacity:.6;">#' + f.id + ' · ' + new Date(f.ts * 1000).toLocaleDateString('ru-RU') + '</span>' +
                    '<span style="color:' + st[1] + ';font-weight:600;">' + st[0] +
                    (f.reward ? ' · +' + f.reward + ' крст' : '') + '</span></div>' +
                    '<div style="opacity:.8;">' + (f.text || '').slice(0, 160) + '</div>' +
                    (f.comment ? '<div style="opacity:.6;">Ответ: ' + f.comment + '</div>' : '') +
                    '</div>';
            }).join('');
    }

    function loadMine() {
        if (!token()) return;
        fetch('/api/feedback/mine', { headers: { 'X-Auth-Token': token() } })
            .then(function (r) { return r.json().catch(function () { return {}; }); })
            .then(function (d) {
                renderMine(d);
                (d.notices || []).forEach(function (n) {
                    var msg = n.status === 'accepted'
                        ? 'Ваше пожелание принято! Начислено ' + n.reward + ' кристаллов Вечности.'
                        : 'Ваше пожелание рассмотрено: отклонено' + (n.comment ? ' (' + n.comment + ')' : '');
                    if (typeof window.notify === 'function') window.notify(msg);
                });
            }).catch(function () { });
    }

    window.Feedback = {
        open: function () {
            modal().style.display = 'flex';
            bind();
            loadMine();
            var ta = document.getElementById('feedback-text');
            if (ta) setTimeout(function () { ta.focus(); }, 60);
        },
        close: function () {
            var m = document.getElementById('feedback-modal');
            if (m) m.style.display = 'none';
        }
    };

    function addMenuButton() {
        var items = document.getElementById('left-menu-items');
        if (!items || document.getElementById('feedback-menu-btn')) return;
        var b = document.createElement('button');
        b.id = 'feedback-menu-btn';
        b.className = 'menu-btn';
        b.textContent = '💡 Пожелания';
        b.onclick = function () { window.Feedback.open(); };
        items.appendChild(b);
    }

    function boot() {
        addMenuButton();
        if (token()) setTimeout(loadMine, 2500);
        var tries = 0;
        var t = setInterval(function () {
            tries++;
            addMenuButton();
            if (document.getElementById('feedback-menu-btn') || tries > 20) clearInterval(t);
        }, 1000);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
})();
