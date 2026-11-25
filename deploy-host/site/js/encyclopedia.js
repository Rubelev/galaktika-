// Энциклопедия «Галактика Млечный Путь»
// Автор: Булатов Алексей Юрьевич (Rubelev) · ab@btema.ru
// Энциклопедия: все системы игры в одном месте, с разделами и анимацией.
// Данные берутся из глобальных таблиц и модулей — своего хранилища нет.

const SECTIONS = [
    { id: 'ships', title: 'Корабли' },
    { id: 'engines', title: 'Двигатели' },
    { id: 'buildings', title: 'Постройки' },
    { id: 'resources', title: 'Ресурсы' },
    { id: 'health', title: 'Болезни' },
    { id: 'worlds', title: 'Миры' },
    { id: 'factions', title: 'Расы' },
    { id: 'pirates', title: 'Пираты' },
    { id: 'artifacts', title: 'Артефакты' },
    { id: 'collection', title: 'Коллекция' },
    { id: 'cloning', title: 'Клонирование' },
    { id: 'platform', title: 'Платформа' },
    { id: 'routes', title: 'Маршруты' },
    { id: 'time', title: 'Время' }
];

const CLONING = [
    { name: 'Комплекс клонирования', lines: ['цена 380 000 кр · сталь 260 т · чипы 90', 'время 22 минуты · смена 20 андроидов', '+1.5 % к рождаемости при избытке еды'] },
    { name: 'Условие работы', lines: ['еды должно быть больше 110 % от потребления', 'без избытка еды комплекс не даёт ничего'] },
    { name: 'Предел', lines: ['до 4 комплексов на колонию', 'максимум +2 % к рождаемости', 'итоговый рост до 4 % в год'] }
];

const PLATFORM = [
    { name: 'Гравитационная платформа', lines: ['диск диаметром несколько километров', 'ходит между планетой и луной', 'один рейс — 240 секунд'] },
    { name: 'Расписание', lines: ['подъём раз в несколько часов игрового времени', 'не частый транспорт: рассчитан на массовые перевозки', 'перевозит людей и грузы без топлива'] },
    { name: 'Наземные узлы', lines: ['причал на планете', 'причал на луне', 'лифт доставки на орбиту'] }
];

const ROUTES = [
    { name: 'Внутри Солнечной', lines: ['Земля, Луна, Марс — 8 игровых часов', 'Пояс → Пояс — 10 часов', 'Земля → Пояс — 34 часа'] },
    { name: 'К внешним планетам', lines: ['Земля → Европа или Титан — 62 часа', 'Пояс → внешние — 40 часов'] },
    { name: 'За Врата', lines: ['Земля → колонии Альянса — 118 часов', 'Пояс → за Вратами — 96 часов', 'внешние → за Вратами — 74 часа'] },
    { name: 'Как ходят флоты', lines: ['109 торговых бортов на шести маршрутах', '16 пиратских бортов: 10 в системе, 6 за Вратами', 'каждый борт стоит в порту сутки за рейс'] }
];

const TIME = [
    { name: 'Масштаб времени', lines: ['1 секунда реального = 1 игровой час', 'игровой год ≈ 2 часа 26 минут', 'сутки проходят за 24 секунды'] },
    { name: 'Рейсы и стройка', lines: ['рейс Луна → Фобос (38 ч) — 38 секунд', 'стройка идёт по реальным минутам'] },
    { name: 'Население', lines: ['рост считается по игровым годам', 'болезни и смертность — тоже', 'ускорение времени ускоряет всё'] }
];

const FACTIONS = [
    { name: 'Земля', motto: 'Жить в согласии с природой', color: '#7fc8e0',
      text: 'Родина человечества, 12 млрд. Экологические города, орбитальный лифт, полный промышленный цикл.',
      traits: ['чипы и электроника', 'биология и медицина', 'орбитальные станции'] },
    { name: 'Марс', motto: 'Лучший звук — тишина', color: '#e0a07f',
      text: '4 млрд, подземные города и купольные фермы. Низкая гравитация изменила тело, а тишина — веру.',
      traits: ['тяжёлая вода и газ', 'ионные двигатели', 'закрытые экосистемы'] },
    { name: 'Астровитяне', motto: 'Никто нам не указ', color: '#c9b28f',
      text: '1 млрд, пять рудных городов на астероидах. В вакууме растут лёгкие кости и крепкий характер.',
      traits: ['металлы и руда', 'плазменные двигатели', 'вольные торговые пути'] }
];

const PIRATES = [
    { name: 'Тень Юпитера', base: 'орбита Юпитера', ships: 6, note: 'грабят грузы между Поясом и газовыми гигантами' },
    { name: 'Кольца Сатурна', base: 'орбита Сатурна', ships: 5, note: 'база Барона Колец, титан и полимеры' },
    { name: 'Засада у Врат', base: 'у портала', ships: 4, note: 'перехватывают всё, что идёт за Врата' },
    { name: 'Рейд по колониям', base: 'за Вратами', ships: 3, note: 'нападают на караваны к колониям Альянса' },
    { name: 'Трасса Кеплера', base: 'Кеплер-1', ships: 3, note: 'молодая система без охраны — лёгкая добыча' }
];

const PIRATE_RULES = [
    'Налёт удаётся, если силы пирата не меньше 60% от сил жертвы',
    'При отпоре пират теряет корабль с шансом 55% и платит 140 000 за ремонт',
    'Добыча — 12–22% груза жертвы',
    'Обломки дают 25% массы и 4 кредита за тонну — флот они не окупают',
    'Содержание борта — 800 кредитов за цикл, новый корабль дорожает на 25%'
];

const ARTIFACTS = [
    { name: 'Кристалл Вечности', value: '20–60 кристаллов', note: 'основа всех древних артефактов, не синтезируется' },
    { name: 'Обломок контура', value: 'чертёж редкого корпуса', note: 'открывает плазменные и гравитационные корабли' },
    { name: 'Пластина данных', value: 'ускорение исследования', note: 'даёт очки в выбранную дисциплину' },
    { name: 'Гравитационный ключ', value: '×10 к силе оружия', note: 'редчайшая находка, меняет исход боя' }
];

const ARTIFACT_RULES = [
    'Находятся в рейсах и экспедициях за Врата',
    'Кристаллы нужны для чертежей и артефактов на чёрном рынке',
    'Шанс находки невелик — но одна пластина меняет баланс сил'
];

let current = 'ships';

export function open(section) {
    current = section || current;
    let modal = document.getElementById('enc-modal');
    if (!modal) {
        document.body.insertAdjacentHTML('beforeend',
            '<div id="enc-modal" class="market-modal"><div class="market-modal-content" style="width:960px;max-height:88vh">' +
            '<span class="close-btn" onclick="closeEncyclopedia()">&times;</span>' +
            '<h2>📖 Энциклопедия</h2>' +
            '<div style="font-size:10px;color:#6b7889;margin:-6px 0 10px">© Галактика, 2026</div>' +
            '<div id="enc-tabs" class="enc-tabs"></div>' +
            '<div id="enc-body" class="enc-body"></div>' +
            '</div></div>');
        modal = document.getElementById('enc-modal');
    }
    modal.style.display = 'flex';
    trophyStyles();
    render();
}

export function close() {
    const m = document.getElementById('enc-modal');
    if (m) m.style.display = 'none';
}

function tabs() {
    return SECTIONS.map(s =>
        `<button class="enc-tab ${s.id === current ? 'active' : ''}" onclick="encSection('${s.id}')">${s.title}</button>`
    ).join('');
}

function card(title, lines, icon) {
    return `<div class="enc-card">
        <div class="enc-icon">${icon || '◆'}</div>
        <div class="enc-title">${title}</div>
        ${lines.map(l => `<div class="enc-line">${l}</div>`).join('')}
    </div>`;
}

// ============================================================================
//  ТРОФЕЙНАЯ КОЛЛЕКЦИЯ (UI-01)
//  Все числа приходят с сервера: api.php?action=trophy_status / trophy_roll /
//  trophy_craft. Клиент НИЧЕГО не считает — владение (progress.owned),
//  осколки (shards), лимит и остаток бросков (rolls) берутся из ответа как есть.
//  Никаких наград и кристаллов в интерфейсе нет: только предметы и осколки.
// ============================================================================
let TROPHY = null;            // последний ответ trophy_status (числа — серверные)
let TROPHY_ERROR = '';
let TROPHY_RESULT = null;     // карточка последнего броска/крафта
let TROPHY_BUSY = false;

function trophyToken() {
    try { return localStorage.getItem('galaktika_token') || ''; } catch (e) { return ''; }
}

function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, ch => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
    ));
}

function trophyStyles() {
    if (document.getElementById('enc-coll-style')) return;
    const st = document.createElement('style');
    st.id = 'enc-coll-style';
    st.textContent = [
        '.enc-coll{grid-column:1/-1}',
        '.enc-coll-head{display:flex;align-items:baseline;gap:14px;flex-wrap:wrap;margin:2px 0 12px}',
        '.enc-coll-big{font-size:26px;font-weight:700;color:#e8f1ff;line-height:1}',
        '.enc-coll-big b{color:#7fe3ff}',
        '.enc-coll-sub{font-size:12px;color:#8fa0b8}',
        '.enc-coll-empty{border:1px dashed rgba(127,227,255,.35);border-radius:10px;padding:12px 14px;margin-bottom:12px;',
        'background:rgba(127,227,255,.05);color:#cfe0f5;font-size:13px;line-height:1.5}',
        '.enc-coll-set{border:1px solid rgba(127,227,255,.18);border-radius:12px;padding:12px;margin-bottom:12px;',
        'background:rgba(255,255,255,.02);animation:encIn .45s ease both}',
        '.enc-coll-set.complete{border-color:rgba(255,208,90,.55);box-shadow:0 0 18px rgba(255,208,90,.10)}',
        '.enc-coll-set-head{display:flex;align-items:center;gap:12px;flex-wrap:wrap}',
        '.enc-coll-set-name{font-size:15px;font-weight:600;color:#e8f1ff}',
        '.enc-coll-set-prog{font-size:12px;color:#7fe3ff}',
        '.enc-coll-src{font-size:11px;color:#7d8ea6;margin:2px 0 10px}',
        '.enc-coll-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(118px,1fr));gap:8px}',
        '.enc-coll-tile{display:flex;flex-direction:column;gap:4px;min-height:104px;padding:9px 8px;border-radius:10px;',
        'border:1px solid rgba(127,227,255,.14);background:rgba(6,14,24,.55)}',
        '.enc-coll-tile.owned{border-color:rgba(127,227,255,.55);background:linear-gradient(180deg,rgba(46,204,113,.10),rgba(6,14,24,.6));',
        'box-shadow:inset 0 0 18px rgba(127,227,255,.08)}',
        '.enc-coll-tile.empty .enc-coll-ico,.enc-coll-tile.empty .enc-coll-name,.enc-coll-tile.empty .enc-coll-rare{filter:grayscale(1);opacity:.45}',
        '.enc-coll-ico{font-size:22px;line-height:1.1}',
        '.enc-coll-name{font-size:11px;color:#e8f1ff;line-height:1.25}',
        '.enc-coll-rare{font-size:10px;color:#8fa0b8}',
        '.enc-coll-tile.owned .enc-coll-rare{color:#ffd05a}',
        '.enc-coll-shards{margin-top:auto;font-size:10px;color:#7d8ea6}',
        '.enc-coll-btn{font-family:inherit;font-size:11px;cursor:pointer;border-radius:7px;padding:4px 8px;',
        'border:1px solid rgba(127,227,255,.4);background:rgba(59,130,246,.35);color:#e8f1ff}',
        '.enc-coll-btn:hover{border-color:#7fe3ff;color:#fff}',
        '.enc-coll-btn:disabled{opacity:.45;cursor:default}',
        '.enc-coll-roll{margin-left:auto}',
        '.enc-coll-res{margin:0 0 12px;border:1px solid rgba(127,227,255,.35);border-radius:10px;padding:10px 12px;',
        'background:rgba(59,130,246,.12);font-size:12px;color:#dce8f7;line-height:1.5}',
        '.enc-coll-res.enc-coll-wait{border-color:rgba(255,160,90,.5);background:rgba(255,160,90,.10)}',
        '.enc-coll-note{font-size:11px;color:#8fa0b8;margin-top:4px}',
        '@media (max-width:640px){.enc-coll-grid{grid-template-columns:repeat(auto-fill,minmax(96px,1fr))}}'
    ].join('');
    document.head.appendChild(st);
}

async function trophyApi(action, body) {
    const headers = { 'Content-Type': 'application/json' };
    const t = trophyToken();
    if (t) headers['X-Auth-Token'] = t;
    const res = await fetch('/api.php?action=' + action, {
        method: body ? 'POST' : 'GET',
        headers: headers,
        body: body ? JSON.stringify(body) : undefined
    });
    let j = null;
    try { j = await res.json(); } catch (e) { j = null; }
    return { status: res.status, ok: res.ok, j: j };
}

// «через N ч» по wait_sec из ответа сервера (ничего не досчитываем)
function fmtWait(sec) {
    const s = Math.max(0, Number(sec) || 0);
    if (s < 3600) return Math.max(1, Math.round(s / 60)) + ' мин';
    return Math.ceil(s / 3600) + ' ч';
}

async function loadTrophy() {
    const r = await trophyApi('trophy_status');
    if (r.status === 401) { TROPHY = null; TROPHY_ERROR = 'нужно войти в игру'; return; }
    if (!r.ok || !r.j || !r.j.progress) {
        TROPHY = null;
        TROPHY_ERROR = (r.j && r.j.error) || ('ошибка ' + r.status);
        return;
    }
    TROPHY = r.j;
    TROPHY_ERROR = '';
}

function trophyResult() {
    const r = TROPHY_RESULT;
    if (!r) return '';
    if (r.kind === 'wait') {
        return '<div class="enc-coll-res enc-coll-wait">Лимит бросков исчерпан · следующий через ' + fmtWait(r.waitSec) +
            '<div class="enc-coll-note">' + esc(r.text || '') + '</div></div>';
    }
    if (r.kind === 'error') {
        return '<div class="enc-coll-res enc-coll-wait">Не получилось: ' + esc(r.text || '') + '</div>';
    }
    if (r.kind === 'roll') {
        if (r.drop && r.item) {
            return '<div class="enc-coll-res">🎁 Выпал предмет: <b>' + esc(r.item.icon || '') + ' ' + esc(r.item.name) + '</b> · ' +
                esc(r.item.rare || '') + (r.setComplete ? ' · <b>сет «' + esc(r.setName) + '» собран</b>' : '') +
                '<div class="enc-coll-note">' + esc(r.item.note || '') + ' · осколков у вас: ' + r.shardsTotal + '</div></div>';
        }
        if (r.duplicate) {
            return '<div class="enc-coll-res">♻️ Дубликат: +' + r.shards + ' осколок · всего осколков: ' + r.shardsTotal +
                '<div class="enc-coll-note">сет: ' + esc(r.setName || '') + ' · pity: ' + esc(r.pity) + '</div></div>';
        }
        return '<div class="enc-coll-res">Пусто · осколков у вас: ' + r.shardsTotal +
            '<div class="enc-coll-note">сет: ' + esc(r.setName || '') + ' · pity: ' + esc(r.pity) + '</div></div>';
    }
    if (r.kind === 'craft') {
        return '<div class="enc-coll-res">🔧 Скрафчено: <b>' + esc((r.item && r.item.icon) || '') + ' ' +
            esc((r.item && r.item.name) || '') + '</b> · потрачено ' + r.cost + ' осколков · осталось ' + r.shardsTotal +
            (r.setComplete ? ' · <b>сет собран</b>' : '') + '</div>';
    }
    return '';
}

function trophyHtml() {
    if (!TROPHY) {
        return '<div class="enc-coll"><div class="enc-coll-res enc-coll-wait">Коллекция недоступна: ' +
            esc(TROPHY_ERROR || 'нет ответа') +
            '<div class="enc-coll-note"><button class="enc-coll-btn" onclick="encTrophyReload()">Повторить</button></div></div></div>';
    }
    const P = TROPHY.progress || {};
    const owned = P.owned || {};
    const bySet = P.by_set || {};
    const items = P.items || [];
    const setIds = Object.keys(bySet);
    const setsTotal = (P.sets_total !== undefined && P.sets_total !== null) ? Number(P.sets_total) : setIds.length;
    const setsDone = (P.sets_complete !== undefined && P.sets_complete !== null)
        ? Number(P.sets_complete)
        : setIds.filter(k => bySet[k] && bySet[k].complete).length;
    const have = Number(P.have) || 0;
    const total = Number(P.total) || items.length;
    const shards = Number(TROPHY.shards) || 0;
    const cost = Number(TROPHY.craft_cost) || 5;
    const rolls = TROPHY.rolls || {};
    const left = Number(rolls.left) || 0;
    const limit = Number(rolls.limit) || 0;

    let out = '<div class="enc-coll">';
    out += '<div class="enc-coll-head"><div class="enc-coll-big"><b>' + have + '</b> / ' + total + '</div>' +
        '<div class="enc-coll-sub">сетов собрано ' + setsDone + ' из ' + setsTotal +
        ' · осколки: ' + shards + ' · бросков осталось ' + left + (limit ? ' из ' + limit : '') +
        (left === 0 && Number(rolls.wait_sec) > 0 ? ' · следующий через ' + fmtWait(rolls.wait_sec) : '') +
        '</div></div>';
    if (have === 0) {
        out += '<div class="enc-coll-empty">Коллекция пуста. Выберите сет и сделайте первый бросок: предметы падают из игры, дубликаты превращаются в осколки.</div>';
    }
    out += trophyResult();
    setIds.forEach(function (setId) {
        const s = bySet[setId] || {};
        const setItems = items.filter(function (it) { return it.set === setId; });
        out += '<div class="enc-coll-set' + (s.complete ? ' complete' : '') + '" data-set="' + esc(setId) + '">';
        out += '<div class="enc-coll-set-head"><div class="enc-coll-set-name">' + esc(s.name || setId) +
            (s.complete ? ' 🏅' : '') + '</div>' +
            '<div class="enc-coll-set-prog">собрано ' + (Number(s.have) || 0) + '/' + (Number(s.total) || setItems.length) + '</div>' +
            '<button class="enc-coll-btn enc-coll-roll"' + (left > 0 ? '' : ' disabled title="Лимит бросков"') +
            ' onclick="encTrophyRoll(\'' + esc(setId) + '\')"' +
            '>🎲 Бросок (осталось ' + left + ')</button></div>';
        if (s.source) out += '<div class="enc-coll-src">источник: ' + esc(s.source) + '</div>';
        out += '<div class="enc-coll-grid">';
        setItems.forEach(function (it) {
            const isOwned = !!Number(owned[it.id]);     // owned: 1/0 (v1273) или метка времени (v1272) — оба «есть»
            out += '<div class="enc-coll-tile ' + (isOwned ? 'owned' : 'empty') + '" data-item="' + esc(it.id) +
                '" title="' + esc(it.note || it.name) + '">' +
                '<div class="enc-coll-ico">' + esc(it.icon || '◆') + '</div>' +
                '<div class="enc-coll-name">' + esc(it.name) + '</div>' +
                '<div class="enc-coll-rare">' + esc(it.rare || '') + '</div>';
            if (isOwned) {
                out += '<div class="enc-coll-shards">в коллекции</div>';
            } else {
                out += '<div class="enc-coll-shards">осколки ' + shards + '/' + cost + '</div>';
                if (shards >= cost) {
                    out += '<button class="enc-coll-btn" onclick="encTrophyCraft(\'' + esc(setId) + '\',\'' + esc(it.id) +
                        '\')">Скрафтить · ' + cost + ' осколков</button>';
                }
            }
            out += '</div>';
        });
        out += '</div></div>';
    });
    out += '</div>';
    return out;
}

function paintCollection() {
    if (current !== 'collection') return;
    const body = document.getElementById('enc-body');
    if (!body) return;
    body.innerHTML = trophyHtml();
}

window.encTrophyReload = async function () {
    TROPHY_ERROR = '';
    await loadTrophy();
    paintCollection();
};

window.encTrophyRoll = async function (setId) {
    if (TROPHY_BUSY) return;
    TROPHY_BUSY = true;
    try {
        const rid = (window.crypto && window.crypto.randomUUID)
            ? window.crypto.randomUUID()
            : ('r' + Date.now() + '-' + Math.random().toString(36).slice(2));
        const r = await trophyApi('trophy_roll', { set: setId, roll_id: rid });
        if (r.status === 429) {
            TROPHY_RESULT = { kind: 'wait', waitSec: (r.j && r.j.wait_sec) || 0,
                              text: (r.j && r.j.error) || 'лимит бросков на сегодня исчерпан' };
        } else if (!r.ok || !r.j || r.j.ok === false) {
            TROPHY_RESULT = { kind: 'error', text: (r.j && r.j.error) || ('ошибка ' + r.status) };
        } else {
            const j = r.j;
            TROPHY_RESULT = {
                kind: 'roll', drop: !!j.drop, duplicate: !!j.duplicate, item: j.item || null,
                shards: Number(j.shards) || 0,
                shardsTotal: (j.shards_total !== undefined) ? Number(j.shards_total)
                                                           : (TROPHY ? Number(TROPHY.shards) || 0 : 0),
                pity: (j.pity !== undefined) ? j.pity : '—',
                setComplete: !!j.set_complete, setName: j.set_name || ''
            };
        }
        await loadTrophy();          // сетка и все числа — снова из ответа сервера
        paintCollection();
    } catch (e) {
        TROPHY_RESULT = { kind: 'error', text: 'сеть: ' + (e && e.message) };
        paintCollection();
    } finally {
        TROPHY_BUSY = false;
    }
};

window.encTrophyCraft = async function (setId, itemId) {
    if (TROPHY_BUSY) return;
    TROPHY_BUSY = true;
    try {
        // сервер ждёт {set, item}; item_id отправляем рядом для совместимости с ТЗ
        const r = await trophyApi('trophy_craft', { set: setId, item: itemId, item_id: itemId });
        if (!r.ok || !r.j || r.j.ok === false) {
            TROPHY_RESULT = { kind: 'error', text: (r.j && r.j.error) || ('ошибка ' + r.status) };
        } else {
            TROPHY_RESULT = { kind: 'craft', item: r.j.crafted || null, cost: Number(r.j.cost) || 0,
                              shardsTotal: Number(r.j.shards) || 0, setComplete: !!r.j.set_complete };
        }
        await loadTrophy();
        paintCollection();
    } catch (e) {
        TROPHY_RESULT = { kind: 'error', text: 'сеть: ' + (e && e.message) };
        paintCollection();
    } finally {
        TROPHY_BUSY = false;
    }
};

async function render() {
    const tabsEl = document.getElementById('enc-tabs');
    const body = document.getElementById('enc-body');
    if (!tabsEl || !body) return;
    tabsEl.innerHTML = tabs();

    let html = '';

    if (current === 'ships') {
        const ships = (typeof SHIPS !== 'undefined') ? SHIPS : {};
        const race = (typeof currentUser !== 'undefined' && currentUser && currentUser.faction) || 'earth';
        const names = (typeof RACE_SHIP_NAMES !== 'undefined') ? RACE_SHIP_NAMES[race] : null;
        html = Object.keys(ships).map(id => {
            const s = ships[id];
            const nm = (names && names[id]) || s.name;
            return card(nm, [
                `класс: ${id.replace(/_/g, ' ')}`,
                `привод: ${s.drive}`,
                `корпус ${s.hull} · щит ${s.shield} · трюм ${s.cargo}`,
                `цена: ${(s.price || 0).toLocaleString()} кр`
            ], '🚀');
        }).join('');
    } else if (current === 'engines') {
        try {
            const m = await import('/js/engines.js');
            html = Object.keys(m.ENGINES).map(k => {
                const e = m.ENGINES[k];
                return card(`${e.code} · ${e.name}`, [
                    e.note,
                    `ход: ${e.vmax} · тяга: ${e.thrust} · расход: ${e.fuel}`,
                    `до 5 уровня и +3 контура: ход ${m.speed(k, 5, 3)}`
                ], '⚙');
            }).join('');
        } catch (e) { html = '<div class="enc-line">двигатели недоступны</div>'; }
    } else if (current === 'buildings') {
        const b = (typeof BUILDINGS !== 'undefined') ? BUILDINGS : [];
        html = b.map(x => card(x.name, [
            `${x.cat || '—'} · ${x.race || 'все'}`,
            `цена: ${(x.cost || 0).toLocaleString()} кр · сталь ${x.steel || 0} т`,
            `время: ${x.time || 0} мин · ${x.out || ''}`
        ], x.icon || '🏗')).join('');
    } else if (current === 'resources') {
        const r = (typeof RESOURCES !== 'undefined') ? RESOURCES : {};
        const cats = (typeof RESOURCE_CATS !== 'undefined') ? RESOURCE_CATS : [];
        html = cats.map(c => {
            const ids = Object.keys(r).filter(id => r[id].cat === c.id);
            if (!ids.length) return '';
            return `<h3 class="enc-cat" style="color:${c.color}">${c.name}</h3>` +
                ids.map(id => card(r[id].name, [
                    `${(r[id].price || 0).toLocaleString()} кр · ${r[id].unit || ''}`,
                    r[id].why || r[id].tech || ''
                ], '📦')).join('');
        }).join('');
    } else if (current === 'health') {
        try {
            const m = await import('/js/health.js');
            const races = { earth: 'Земляне', mars: 'Марсиане', belt: 'Астровитяне' };
            html = Object.keys(races).map(rk =>
                `<h3 class="enc-cat">${races[rk]}</h3>` +
                m.DISEASES[rk].map(d => card(d.name, [
                    `заболеваемость ${(d.incidence * 100).toFixed(1)} % · смертность ${(d.mortality * 100).toFixed(0)} %`,
                    d.note
                ], '🩺')).join('')
            ).join('') +
            `<h3 class="enc-cat">Медицина</h3>` +
            card('Медицинский модуль', [
                `модуль на ${(m.MODULE_CAPACITY / 1e6).toFixed(0)} млн человек`,
                `цена ${m.MODULE_COST.toLocaleString()} кр · содержание ${m.MODULE_UPKEEP.toLocaleString()}`,
                'полное покрытие снижает заболеваемость вчетверо'
            ], '🏥');
        } catch (e) { html = '<div class="enc-line">медицина недоступна</div>'; }
    } else if (current === 'factions') {
        html = FACTIONS.map(f =>
            `<div class="enc-card" style="border-color:${f.color}55">
                <div class="enc-title" style="color:${f.color}">${f.name}</div>
                <div class="enc-line">「${f.motto}」</div>
                <div class="enc-line" style="margin:8px 0">${f.text}</div>
                ${f.traits.map(t => `<div class="enc-line">◆ ${t}</div>`).join('')}
            </div>`).join('');
    } else if (current === 'pirates') {
        html = PIRATES.map(p => card(p.name, [
            `база: ${p.base} · бортов ${p.ships}`,
            p.note
        ], '🏴')).join('') +
        `<h3 class="enc-cat">Правила налёта</h3>` +
        PIRATE_RULES.map(r => `<div class="enc-card"><div class="enc-line">• ${r}</div></div>`).join('');
    } else if (current === 'artifacts') {
        html = ARTIFACTS.map(a => card(a.name, [
            `ценность: ${a.value}`,
            a.note
        ], '💎')).join('') +
        `<h3 class="enc-cat">Как найти</h3>` +
        ARTIFACT_RULES.map(r => `<div class="enc-card"><div class="enc-line">• ${r}</div></div>`).join('');
    } else if (current === 'cloning') {
        html = CLONING.map(c => card(c.name, c.lines, '🧬')).join('');
    } else if (current === 'platform') {
        html = PLATFORM.map(c => card(c.name, c.lines, '🛸')).join('');
    } else if (current === 'routes') {
        html = ROUTES.map(c => card(c.name, c.lines, '🛰')).join('');
    } else if (current === 'time') {
        html = TIME.map(c => card(c.name, c.lines, '⏳')).join('');
    } else if (current === 'worlds') {
        const w = (typeof WORLD_CITIES !== 'undefined') ? WORLD_CITIES : {};
        const names = (typeof GLOBE_NAMES !== 'undefined') ? GLOBE_NAMES : {};
        html = Object.keys(w).map(id =>
            card(names[id] || id, [
                `поселений: ${w[id].length}`,
                `население: ${(w[id].reduce((s, c) => s + (c.pop || 0), 0) / 1e6).toFixed(0)} млн`
            ], '🌍')
        ).join('');
    } else if (current === 'collection') {
        // числа коллекции — только из ответа сервера
        if (!TROPHY && !TROPHY_ERROR) await loadTrophy();
        html = trophyHtml();
    }

    body.innerHTML = html;
    body.querySelectorAll('.enc-card').forEach((el, i) => {
        el.style.animationDelay = (i * 0.03) + 's';
    });
}

window.encSection = (id) => { current = id; render(); };
window.closeEncyclopedia = () => close();
window.openEncyclopedia = (s) => open(s);
