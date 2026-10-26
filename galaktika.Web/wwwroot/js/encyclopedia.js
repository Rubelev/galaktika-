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
            '<div style="font-size:10px;color:#6b7889;margin:-6px 0 10px">© Булатов Алексей Юрьевич, 2026</div>' +
            '<div id="enc-tabs" class="enc-tabs"></div>' +
            '<div id="enc-body" class="enc-body"></div>' +
            '</div></div>');
        modal = document.getElementById('enc-modal');
    }
    modal.style.display = 'flex';
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
    }

    body.innerHTML = html;
    body.querySelectorAll('.enc-card').forEach((el, i) => {
        el.style.animationDelay = (i * 0.03) + 's';
    });
}

window.encSection = (id) => { current = id; render(); };
window.closeEncyclopedia = () => close();
window.openEncyclopedia = (s) => open(s);
