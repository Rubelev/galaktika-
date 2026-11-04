// ============================================================================
//  СВЯЗИ: что править вместе с этим файлом
//  ---------------------------------------------------------------------------
//  Отвечает за отрисовку сцены, но НЕ за математику движения — она в motion.js.
//
//  Меняешь здесь отрисовку/слой/маркеры — синхронно проверь:
//   1) js/motion.js — источник позиций: shipPose(), segmentPose(), routePose().
//      Не добавляй сюда свою формулу скорости: появится «второй апдейтер»,
//      и маркер начнёт прыгать (уже случалось: 77 px за кадр).
//   2) js/worldcoords.js — планеты берут позицию только оттуда
//      (WorldCoords.planetAt). Свои орбиты тут не считать.
//   3) app.css — классы маркеров (.ship-marker, .trade-ship, .moon, .orbit).
//      Меняешь размер/поворот — правь и transform в обеих сторонах.
//   4) html-шаблоны (make-static.ps1, App.razor): теги <script> и их ?v=N.
//      Поднимай версию при любой правке этого файла.
//   5) ?freeze / window.__freezeAt — тестовый режим кадра. Если трогаешь
//      animate(), не сломай жёсткую заморозку: время должно стоять.
//   6) tools/verify_math.js, deploy-host/audit_all.py — прогони после правок.
// ============================================================================

/* ==========================================================================
   ГАЛАКТИКА МЛЕЧНЫЙ ПУТЬ
   Автор и правообладатель: Булатов Алексей Юрьевич (Rubelev)
   Контакт: ab@btema.ru
   Все права защищены. Копирование без разрешения автора не допускается.
   ========================================================================== */

// Режим визуальных тестов: ?token=<токен> кладёт его в localStorage,
// чтобы headless-браузер мог снять игровую сцену целиком (правило 22).
(function () {
    try {
        const q = new URLSearchParams(location.search);
        const t = q.get('token');
        if (t) localStorage.setItem('galaktika_token', t);
    } catch (e) {}
})();

// =========================================================
// ГЛОБАЛЬНЫЙ ФЛАГ ОТЛАДКИ
// =========================================================
const DEBUG_MODE = false;

// Отладочный режим включается только ссылкой ?debug=1: в нём доступны ускорение
// времени и точки перехода к панелям. В обычной игре время идёт как в жизни.
const DEV_MODE = new URLSearchParams(window.location.search).has('debug'); 

function dbgLog(node, message, data = null) {
    if (!DEBUG_MODE) return;
    const timestamp = new Date().toLocaleTimeString('ru-RU', { hour12: false }) + '.' + new Date().getMilliseconds();
    if (data) {
        console.log(`🛠️ [DEBUG] [${timestamp}] [${node}] ${message}`, data);
    } else {
        console.log(`🛠️ [DEBUG] [${timestamp}] [${node}] ${message}`);
    }
}

let currentUser = JSON.parse(localStorage.getItem('galaktika_user')) || null;
let usersDB = JSON.parse(localStorage.getItem('galaktika_users')) || [];
// Доступ к текущему пользователю для внешних модулей (js/payments.js).
window.getCurrentUser = () => currentUser;
// Администраторы проекта: полный доступ к монитору и правкам.
// Свой адрес добавьте в список — роль выдаётся автоматически при входе.
const ADMIN_EMAILS = ["ab@btema.ru"];
const ADMIN_EMAIL = ADMIN_EMAILS[0];

function isAdminEmail(email) {
    return ADMIN_EMAILS.includes(String(email || '').toLowerCase().trim());
}

// Адрес из списка администраторов всегда получает права при входе.
if (currentUser && isAdminEmail(currentUser.email) && currentUser.role !== 'admin') {
    currentUser.role = 'admin';
    localStorage.setItem('galaktika_user', JSON.stringify(currentUser));
}
let slideTimer = null;
let selectedFaction = null;

const FACTION_NAMES = { earth: "🌍 Терра Нова", mars: "🔴 Мир Тишины", asteroid: "💫 Титановое Кольцо" };
// Всплывающие уведомления вместо alert: не блокируют игру и не вешают тесты.
// Дедупликация: одно и то же сообщение не показывается дважды подряд
const __lastToasts = new Map();
function notify(text, kind) {
    const nowTs = Date.now();
    const prev = __lastToasts.get(text) || 0;
    if (nowTs - prev < 3000) return;      // дубль в пределах 3 секунд — гасим
    __lastToasts.set(text, nowTs);
    if (__lastToasts.size > 60) __lastToasts.clear();

    let box = document.getElementById('toast-box');
    if (!box) {
        box = document.createElement('div');
        box.id = 'toast-box';
        box.className = 'toast-box';
        document.body.appendChild(box);
    }
    const el = document.createElement('div');
    el.className = 'toast ' + (kind || '');
    el.textContent = text;
    box.appendChild(el);
    setTimeout(() => { el.classList.add('out'); }, 2600);
    setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 3200);
}

// =========================================================
// ЭКОНОМИКА: 18 ресурсов в пяти категориях
// =========================================================
// price — ориентировочная цена в кредитах за единицу, tech — требуемая технология.
// «special» — чёрный рынок: честные фракции этим не торгуют, только пираты.
const RESOURCE_CATS = [
    { id: 'metals', name: 'Металлы', color: '#b0b8c4' },
    { id: 'water', name: 'Вода', color: '#4f8ef7' },
    { id: 'crystals', name: 'Кристаллы', color: '#a78bfa' },
    { id: 'elec', name: 'Электроника', color: '#7fe3ff' },
    { id: 'food', name: 'Продукты', color: '#2ecc71' },
    { id: 'hydro', name: 'Углеводороды', color: '#c98a3a', hint: 'Земля — избыток, Марс — метан и синтез, Пояс — кондритная органика' },
    { id: 'special', name: 'Особые', color: '#f1c40f', illegal: true }
];

const RESOURCES = {
    // --- металлы ---
    steel: { name: 'Сталь', cat: 'metals', unit: 'т', price: 12, tech: 'Металлургия' },
    copper: { name: 'Медь', cat: 'metals', unit: 'т', price: 9, tech: 'Металлургия' },
    nickel: { name: 'Никель', cat: 'metals', unit: 'т', price: 18, tech: 'Металлургия' },
    silver: { name: 'Серебро', cat: 'metals', unit: 'кг', price: 240, tech: 'Точная металлургия' },
    gold: { name: 'Золото', cat: 'metals', unit: 'кг', price: 900, tech: 'Точная металлургия' },

    // --- вода ---
    ice: { name: 'Орбитальный лёд', cat: 'water', unit: 'т', price: 3, tech: 'Добыча льда', note: 'требует очистки' },
    water: { name: 'Питьевая вода', cat: 'water', unit: 'т', price: 7, tech: 'Очистка воды' },
    heavy: { name: 'Тяжёлая вода', cat: 'water', unit: 'л', price: 150, tech: 'Реакторная химия', note: 'для реакторов' },

    // --- кристаллы ---
    quartz: { name: 'Кварц', cat: 'crystals', unit: 'кг', price: 30, tech: 'Оптика' },
    corundum: { name: 'Корунд', cat: 'crystals', unit: 'кг', price: 95, tech: 'Оптика' },
    diamond: { name: 'Алмаз', cat: 'crystals', unit: 'кар', price: 420, tech: 'Огранка' },

    // --- продукты ---
    grain: { name: 'Зерно', cat: 'food', unit: 'кг', price: 4, tech: 'Агрокультура' },
    meat: { name: 'Мясо', cat: 'food', unit: 'кг', price: 11, tech: 'Животноводство' },
    fish: { name: 'Рыба', cat: 'food', unit: 'кг', price: 9, tech: 'Аквакультура' },
    spice: { name: 'Специи', cat: 'food', unit: 'кг', price: 60, tech: 'Биохимия' },

    // --- углеводороды ---
    // В 2226 нефть жгут редко, но без неё не будет ни пластика, ни смазки, ни керосина
    // для тяжёлых ракет: заменить её пока нечем.
    oil: { name: 'Нефть (сырая)', cat: 'hydro', unit: 'т', price: 26, tech: 'Бурение', why: 'сырьё для химии', where: ['earth'] },
    gas: { name: 'Природный газ', cat: 'hydro', unit: 'т', price: 14, tech: 'Газодобыча', why: 'топливо и водород', where: ['earth', 'mars'] },
    kerosene: { name: 'Керосин', cat: 'hydro', unit: 'т', price: 48, tech: 'Крекинг', why: 'ракетное топливо', where: ['earth', 'mars'] },
    lubricant: { name: 'Смазочные масла', cat: 'hydro', unit: 'т', price: 70, tech: 'Нефтехимия', why: 'механика и подшипники', where: ['earth', 'mars'] },
    polymer: { name: 'Полимеры', cat: 'hydro', unit: 'т', price: 95, tech: 'Полимеризация', why: 'изоляция, упаковка, 3D-печать', where: ['earth', 'mars'] },
    bitumen: { name: 'Битум', cat: 'hydro', unit: 'т', price: 18, tech: 'Перегонка', why: 'герметизация и покрытия', where: ['earth'] },
    chondrite: { name: 'Кондритная органика', cat: 'hydro', unit: 'кг', price: 130, tech: 'Химия углерода', why: 'ПАУ и прекурсоры', where: ['asteroid'] },
    methanol: { name: 'Метанол', cat: 'hydro', unit: 'т', price: 55, tech: 'Синтез', why: 'растворители и топливо', where: ['asteroid', 'mars'] },

    // --- электроника ---
    chips: { name: 'Чипы', cat: 'elec', unit: 'шт', price: 320, tech: 'Микроэлектроника', why: 'мозги кораблей и станций' },
    boards: { name: 'Платы', cat: 'elec', unit: 'шт', price: 180, tech: 'Микроэлектроника', why: 'основа любой автоматики' },
    sensors: { name: 'Сенсоры', cat: 'elec', unit: 'шт', price: 240, tech: 'Оптика', why: 'навигация и связь' },
    manip: { name: 'Манипуляторы', cat: 'elec', unit: 'шт', price: 420, tech: 'Робототехника', why: 'руки кораблей' },
    androids: { name: 'Андроиды', cat: 'elec', unit: 'шт', price: 900, tech: 'Робототехника', why: 'работают на планетах и астероидах' },

    rare: { name: 'Редкоземельные металлы', cat: 'metals', unit: 'кг', price: 520, tech: 'Магнетизм', why: 'магниты, лазеры, сенсоры' },
    heavy: { name: 'Тяжёлые металлы', cat: 'metals', unit: 'кг', price: 480, tech: 'Металлургия', why: 'вольфрам и тантал для брони' },
    uranium: { name: 'Уран', cat: 'metals', unit: 'кг', price: 900, tech: 'Реакторы', why: 'топливо для реакторов и бомб' },

    frozen_h2: { name: 'Замороженный водород', cat: 'hydro', unit: 'т', price: 1400, tech: 'Криогеника', why: 'чистое топливо, хранится без потерь' },
    helium3: { name: 'Гелий-3', cat: 'hydro', unit: 'кг', price: 2600, tech: 'Термоядер', why: 'топливо термоядерных станций' },

    eternity: { name: 'Кристалл Вечности', cat: 'special', unit: 'крст', price: 0, tech: 'Врата', why: 'создать невозможно, только найти' },

    // --- особые (чёрный рынок) ---
    joy: { name: '«Счастье»', cat: 'special', unit: 'уп', price: 350, tech: '—', note: 'в пакетиках', illegal: true },
    butterflies: { name: '«Бабочки»', cat: 'special', unit: 'шт', price: 1200, tech: '—', note: 'живой товар', illegal: true },
    ash: { name: '«Пепел»', cat: 'special', unit: 'г', price: 800, tech: '—', note: 'запрещённая технология', illegal: true }
};

// Иконки рисуем инлайново: одна форма на категорию, цвет — по ресурсу.
const RESOURCE_SHAPES = {
    metals: '<path d="M18 64 L34 48 H74 L58 64 Z"/><path d="M22 48 L38 32 H78 L62 48 Z" opacity="0.55"/>',
    water: '<path d="M48 12 C48 12 26 42 26 56 a22 22 0 0 0 44 0 C70 42 48 12 48 12 Z"/>',
    crystals: '<path d="M48 10 L72 40 L48 86 L24 40 Z"/><path d="M48 10 L48 86" stroke="#000" stroke-opacity="0.28" stroke-width="3"/>',
    food: '<path d="M48 14 C66 24 76 44 70 62 C64 80 48 86 48 86 C48 86 32 80 26 62 C20 44 30 24 48 14 Z"/>',
    special: '<rect x="22" y="32" width="52" height="46" rx="8"/><path d="M22 46 H74" stroke="#000" stroke-opacity="0.3" stroke-width="3"/><text x="48" y="72" text-anchor="middle" font-size="26" font-family="Segoe UI" fill="#000" opacity="0.45">?</text>'
};

function resourceIcon(id) {
    const res = RESOURCES[id];
    if (!res) return '';
    const cat = RESOURCE_CATS.find(c => c.id === res.cat) || { color: '#999' };
    return `<svg class="res-svg" viewBox="0 0 96 96" width="26" height="26" aria-hidden="true"><g fill="${cat.color}">${RESOURCE_SHAPES[res.cat] || ''}</g></svg>`;
}

// Совместимость со старым кодом: все обращения к RESOURCE_INFO продолжают работать.
const RESOURCE_INFO = {};
Object.keys(RESOURCES).forEach(id => {
    RESOURCE_INFO[id] = { name: RESOURCES[id].name, icon: resourceIcon(id), unit: RESOURCES[id].unit, cat: RESOURCES[id].cat, price: RESOURCES[id].price, note: RESOURCES[id].note, why: RESOURCES[id].why, where: RESOURCES[id].where, tech: RESOURCES[id].tech, illegal: !!RESOURCES[id].illegal };
});

// Кто этим располагает: З — Земля, М — Марс, П — Пояс астероидов.
const FACTION_LETTER = { earth: 'З', mars: 'М', asteroid: 'П' };
function whereBadges(id) {
    const where = RESOURCES[id] && RESOURCES[id].where;
    if (!where) return '';
    return where.map(f => `<span class="res-where ${f}" title="${f === 'earth' ? 'Земля' : f === 'mars' ? 'Марс' : 'Пояс астероидов'}">${FACTION_LETTER[f]}</span>`).join('');
}

function zeroResources() {
    const out = {};
    Object.keys(RESOURCES).forEach(id => { out[id] = 0; });
    return out;
}

// Старые сохранения хранили 4 ресурса — переносим их в новую номенклатуру.
function migrateResources(user) {
    if (!user) return false;
    if (user.resourcesV === 2) return false;
    const old = user.resources || {};
    const next = zeroResources();
    next.water = old.water || 0;
    next.grain = old.food || 0;
    next.steel = old.metals || 0;
    next.quartz = old.crystals || 0;
    user.resources = next;
    user.resourcesV = 2;
    return true;
}

function initUsersDB() {
    let startTime = performance.now();
    let changed = false;
    // Инициализация админа
    if (!usersDB.find(u => u.email === ADMIN_EMAIL)) {
        usersDB.push({ 
            lastName: "Булатов Алексей Юрьевич", email: ADMIN_EMAIL, gameName: "Rubelev", role: "admin", credits: 80000, 
            password: "Docent@1973Docent", faction: "earth", hasSeenLegend: true,
            resources: Object.assign(zeroResources(), { water: 5000, grain: 20000, meat: 3000, fish: 2000, spice: 200, steel: 800, copper: 400, nickel: 100, silver: 20, gold: 5, heavy: 10, quartz: 300, diamond: 10, corundum: 50, chips: 40, boards: 60, manip: 14, copper: 400, nickel: 220, silver: 20, gold: 5, oil: 200000, gas: 150000, kerosene: 40000, lubricant: 15000, polymer: 25000, bitumen: 30000 }),
            resourcesV: 2,
            fleet: { transport: 5, recycler: 3, assault: 2, fighter: 10, cruiser: 1, super_cruiser: 0, colonizer: 1 },
            questProgress: { step: 0 }
        });
        changed = true;
    }

    // Смена пароля администратора: старый пароль заменяем новым.
    const adminRec = usersDB.find(u => u.email === ADMIN_EMAIL);
    if (adminRec && adminRec.password === "Docent1973Docenr") {
        adminRec.password = "Docent@1973Docent";
        changed = true;
    }
    if (currentUser && currentUser.email === ADMIN_EMAIL && currentUser.password === "Docent1973Docenr") {
        currentUser.password = "Docent@1973Docent";
        localStorage.setItem('galaktika_user', JSON.stringify(currentUser));
    }

    // Инициализация тестовых
    const testFactions = ["earth", "mars", "asteroid"];
    const testResources = [
        Object.assign(zeroResources(), { water: 5000, grain: 20000, meat: 3000, fish: 2000, spice: 200, steel: 800, copper: 400, nickel: 100, silver: 20, gold: 5, heavy: 10, quartz: 300, diamond: 10, corundum: 50, oil: 200000, gas: 150000, kerosene: 40000, lubricant: 15000, polymer: 25000, bitumen: 30000 }),
        Object.assign(zeroResources(), { water: 200, ice: 3000, heavy: 120, grain: 500, spice: 5, steel: 1500, copper: 900, nickel: 700, silver: 60, gold: 20, quartz: 400, diamond: 40, corundum: 200, chips: 30, boards: 40, manip: 10, copper: 700, nickel: 600, silver: 40, gold: 12, gas: 8000, kerosene: 1500, lubricant: 300, polymer: 500, methanol: 400 }),
        Object.assign(zeroResources(), { water: 300, ice: 8000, heavy: 40, grain: 200, meat: 50, spice: 10, steel: 12000, copper: 5000, nickel: 4000, silver: 300, gold: 90, quartz: 1500, diamond: 120, corundum: 400, chips: 50, boards: 70, manip: 18, copper: 5000, nickel: 4000, silver: 200, gold: 40, chondrite: 2500, methanol: 900, polymer: 200 })
    ];
    const testFleets = [
        { transport: 5, recycler: 3, assault: 2, fighter: 10, cruiser: 1, super_cruiser: 0, colonizer: 1 },
        { transport: 3, recycler: 2, assault: 5, fighter: 5, cruiser: 2, super_cruiser: 1, colonizer: 1 },
        { transport: 8, recycler: 10, assault: 8, fighter: 15, cruiser: 3, super_cruiser: 0, colonizer: 1 }
    ];
    ['test1@test.ru', 'test2@test.ru', 'test3@test.ru'].forEach((email, i) => {
        if (!usersDB.find(u => u.email === email)) {
            usersDB.push({ 
                lastName: `Тестов Тест${i+1}`, email: email, gameName: `Капитан Орлов`, role: "user", credits: 80000, 
                password: email, faction: testFactions[i], hasSeenLegend: true,
                resources: Object.assign(zeroResources(), testResources[i]), resourcesV: 2, fleet: testFleets[i], questProgress: { step: 0 }
            });
            changed = true;
        }
    });
    // Раньше база перезаписывалась (и сбрасывала пароли) при каждой загрузке страницы.
    if (changed) localStorage.setItem('galaktika_users', JSON.stringify(usersDB));
    dbgLog('DATABASE', 'User DB initialized', { time: (performance.now() - startTime).toFixed(2) + 'ms', users: usersDB.length, changed });
}
initUsersDB();
if (currentUser) { if (migrateResources(currentUser)) saveUser(); }

function saveUser() {
    localStorage.setItem('galaktika_user', JSON.stringify(currentUser));
    if (typeof syncProfile === 'function') { try { syncProfile(); } catch (e) {} }
    const idx = usersDB.findIndex(u => u.email === currentUser.email);
    if (idx !== -1) { usersDB[idx] = currentUser; localStorage.setItem('galaktika_users', JSON.stringify(usersDB)); }
}

// === ИНТЕРФЕЙС ===
window.showWelcomeScreen = () => { document.getElementById('welcome-screen').style.display = 'block'; document.getElementById('auth-form-login').style.display = 'none'; document.getElementById('auth-form-register').style.display = 'none'; };
window.showLoginForm = () => { document.getElementById('welcome-screen').style.display = 'none'; document.getElementById('auth-form-login').style.display = 'block'; document.getElementById('auth-form-register').style.display = 'none'; };
window.showRegisterForm = () => { document.getElementById('welcome-screen').style.display = 'none'; document.getElementById('auth-form-login').style.display = 'none'; document.getElementById('auth-form-register').style.display = 'block'; selectedFaction = null; document.querySelectorAll('.faction-card').forEach(c => c.classList.remove('selected')); };
window.selectFaction = (faction) => { selectedFaction = faction; document.querySelectorAll('.faction-card').forEach(c => c.classList.remove('selected')); const card = document.querySelector(`.faction-card[data-faction="${faction}"]`); if (card) card.classList.add('selected'); dbgLog('AUTH', 'Faction selected', faction); };

// =========================================================
// СЕРВЕРНАЯ АВТОРИЗАЦИЯ
// =========================================================
// Пароль проверяется на сервере. Если сервер недоступен
// (локальный запуск без API), работает прежний локальный вход.
let authToken = localStorage.getItem('galaktika_token') || null;

async function apiPost(path, body, withToken) {
    const headers = { 'Content-Type': 'application/json' };
    if (withToken && authToken) headers['X-Auth-Token'] = authToken;
    const res = await fetch(path, { method: 'POST', headers, body: JSON.stringify(body) });
    let data = null;
    try { data = await res.json(); } catch (e) {}
    return { ok: res.ok, status: res.status, data };
}

async function apiGet(path) {
    const headers = {};
    if (authToken) headers['X-Auth-Token'] = authToken;
    try {
        const res = await fetch(path, { headers });
        if (!res.ok) return null;
        return await res.json();
    } catch (e) { return null; }
}

// Серверный профиль — источник прогресса: подтягиваем при старте и после действий.
async function pullServerProfile() {
    if (!authToken || !currentUser) return false;
    const me = await apiGet('/api/auth/me');
    if (!me || !me.profile) return false;
    let srv = {};
    try { srv = JSON.parse(me.profile) || {}; } catch (e) { return false; }
    // НЕ стираем прогресс молча: если сервер пометил «колонию забрали»,
    // только предупреждаем. Раньше здесь удалялись все локальные ключи,
    // которых нет на сервере, — игрока «выкидывало в начало игры».
    if (srv.resetReason === 'colony_taken') {
        if (typeof notify === 'function') notify('Сервер сообщает: колонию забрали. Прогресс сохранён, проверьте склад.');
    }
    const hadLegend = currentUser.hasSeenLegend === true;
    Object.keys(srv).forEach(k => {
        if (srv[k] !== undefined) currentUser[k] = srv[k];
    });
    // пролог не должен запускаться повторно из-за пустого флага на сервере
    if (hadLegend) currentUser.hasSeenLegend = true;
    currentUser.role = me.role === 'admin' ? 'admin' : (currentUser.role || 'user');
    saveUser();
    if (typeof window.updateAuthUI === 'function') window.updateAuthUI();
    return true;
}
window.pullServerProfile = pullServerProfile;

window.apiLogin = async (email, password) => {
    try {
        const r = await apiPost('/api/auth/login', { email, password }, false);
        if (!r.ok) return { ok: false, reason: 'denied' };
        authToken = r.data.token;
        localStorage.setItem('galaktika_token', authToken);
        return { ok: true, role: r.data.role, profile: r.data.profile };
    } catch (e) {
        return { ok: false, reason: 'offline' };
    }
};

window.apiRegister = async (payload) => {
    try {
        // реф-код из ссылки приглашения
        try {
            const ref = localStorage.getItem('galaktika_ref');
            if (ref && !payload.ref) payload = Object.assign({}, payload, { ref: ref });
        } catch (e) { }
        const r = await apiPost('/api/auth/register', payload, false);
        if (!r.ok) return { ok: false, reason: 'denied', error: r.data && r.data.error };
        authToken = r.data.token;
        localStorage.setItem('galaktika_token', authToken);
        return { ok: true, role: r.data.role };
    } catch (e) {
        return { ok: false, reason: 'offline' };
    }
};

// Отправка профиля на сервер (не блокирует игру).
function syncProfile() {
    if (!authToken || !currentUser) return;
    apiPost('/api/auth/profile', { profile: JSON.stringify(currentUser) }, true).catch(() => {});
}

window.login = () => {
    const email = document.getElementById('login-email').value.trim(); const password = document.getElementById('login-password').value;
    if (!email || !password) { notify("Введите Email и пароль!"); return; }
    (async () => {
        const srv = await window.apiLogin(email, password);
        if (srv.ok) {
            // сервер подтвердил пароль: профиль берём с сервера, локальная копия — только дополнение
            const local = usersDB.find(u => u.email === email) || {};
            let server = {};
            try { server = JSON.parse(srv.profile) || {}; } catch (e) { server = {}; }
            const wiped = server.resetReason === 'colony_taken';
            const user = wiped ? Object.assign({}, server) : Object.assign({}, local, server);
            if (wiped) notify('Колонию забрали, пока вас не было. Вы начинаете заново.');
            user.email = email;
            user.role = srv.role === 'admin' ? 'admin' : (server.role || local.role || 'user');
            if (!user.password) user.password = password;
            const idx = usersDB.findIndex(u => u.email === email);
            if (idx >= 0) usersDB[idx] = user; else usersDB.push(user);
            localStorage.setItem('galaktika_users', JSON.stringify(usersDB));
            currentUser = user; saveUser(); updateAuthUI();
    if (MAINTENANCE && (!user || user.role !== 'admin')) {
        showMaintenance();
        setTimeout(() => {
            const scene = document.querySelector('.solar-system');
            if (scene) scene.style.display = 'none';
        }, 300);
    }
    window.solarReset();
            return;
        }
        if (srv.reason === 'denied') { notify('Неверный пароль!'); return; }

        // сервер недоступен — локальная проверка (офлайн-режим)
        const user = usersDB.find(u => u.email === email);
        if (!user) { notify("Пользователь не найден!"); return; }
        if (user.password !== password) { notify("Неверный пароль!"); return; }
        currentUser = user; saveUser(); updateAuthUI(); window.solarReset();
    })();
};

window.register = () => {
    const email = document.getElementById('reg-email').value.trim();
    const gameName = document.getElementById('reg-game').value.trim(); const password = document.getElementById('reg-password').value;
    const passwordConfirm = document.getElementById('reg-password-confirm').value;
    if (!email || !gameName || !password) { notify("Заполните все поля!"); return; }
    if (password.length < 4) { notify("Пароль должен быть не менее 4 символов!"); return; }
    if (password !== passwordConfirm) { notify("Пароли не совпадают!"); return; }
    if (!selectedFaction) { notify("Выберите свою цивилизацию!"); return; }
    if (usersDB.find(u => u.email === email)) { notify("Этот Email уже занят!"); return; }
    
    const factionDefaults = {
        earth: { water: 5000, grain: 20000, meat: 3000, fish: 2000, spice: 200, steel: 800, copper: 400, nickel: 100, silver: 20, gold: 5, heavy: 10, quartz: 300, diamond: 10, corundum: 50, oil: 200000, gas: 150000, kerosene: 40000, lubricant: 15000, polymer: 25000, bitumen: 30000 },
        mars: { water: 200, ice: 3000, heavy: 120, grain: 500, spice: 5, steel: 1500, copper: 900, nickel: 700, silver: 60, gold: 20, quartz: 400, diamond: 40, corundum: 200, gas: 8000, kerosene: 1500, lubricant: 300, polymer: 500, methanol: 400 },
        asteroid: { water: 300, ice: 8000, heavy: 40, grain: 200, meat: 50, spice: 10, steel: 12000, copper: 5000, nickel: 4000, silver: 300, gold: 90, quartz: 1500, diamond: 120, corundum: 400, chondrite: 2500, methanol: 900, polymer: 200 }
    };
    const newUser = { 
        email, gameName, role: isAdminEmail(email) ? "admin" : "user", password, faction: selectedFaction, hasSeenLegend: false,
        resources: Object.assign(zeroResources(), factionDefaults[selectedFaction]), resourcesV: 2, fleet: { transport: 3, recycler: 2, assault: 1, fighter: 5, cruiser: 1, super_cruiser: 0, colonizer: 0 }, questProgress: { step: 0 }
    };
    usersDB.push(newUser); localStorage.setItem('galaktika_users', JSON.stringify(usersDB));
    currentUser = newUser; saveUser(); updateAuthUI(); window.solarReset();
    // Регистрируем и на сервере, иначе у игрока нет токена и оплата ему недоступна.
    window.apiRegister({ email, password, lastName: '', gameName, faction: selectedFaction })
        .catch(() => {});
};

window.logout = () => { currentUser = null; localStorage.removeItem('galaktika_user'); showWelcomeScreen(); updateAuthUI(); };

function updateAuthUI() {
    // меню показываем только когда известен пользователь — иначе оно дважды
    // перестраивается при загрузке (визуально «двойной рывок»)
    if (currentUser) document.body.classList.add('auth-ready');
    const overlay = document.getElementById('auth-overlay'); const timeControl = document.getElementById('time-control-panel');
    const adminBtn = document.getElementById('admin-btn'); const userInfo = document.getElementById('user-info');
    const userFaction = document.getElementById('user-faction'); const leftMenu = document.getElementById('left-menu');
    const controlPanel = document.getElementById('control-panel-container'); const solarContainer = document.querySelector('.solar-system-container');
    if (currentUser) {
        overlay.style.display = 'none'; userInfo.innerText = currentUser.gameName;
        if (userFaction) userFaction.innerText = currentUser.faction ? FACTION_NAMES[currentUser.faction] : '';
        ensureFleet(currentUser);
        let creditsEl = document.getElementById('user-credits');
        if (!creditsEl) { creditsEl = document.createElement('div'); creditsEl.id = 'user-credits'; creditsEl.className = 'user-credits'; userFaction.parentNode.insertBefore(creditsEl, userFaction.nextSibling); }
        creditsEl.textContent = Math.round(currentUser.credits).toLocaleString('ru-RU') + ' кр';
        leftMenu.style.display = 'flex'; controlPanel.style.display = 'block'; solarContainer.style.visibility = 'visible';
        // Ускорение времени — инструмент разработчика, игроку оно не нужно.
        timeControl.style.display = currentUser.role === 'admin' ? 'flex' : 'none';
        adminBtn.style.display = currentUser.role === 'admin' ? 'block' : 'none';
    } else { 
        overlay.style.display = 'flex'; timeControl.style.display = 'none'; adminBtn.style.display = 'none'; userInfo.innerText = ''; 
        if (userFaction) userFaction.innerText = ''; leftMenu.style.display = 'none'; controlPanel.style.display = 'none'; solarContainer.style.visibility = 'hidden'; showWelcomeScreen();
    }
    refreshSolarVisibility();   // кеш для цикла анимации
}

// === ЛЕГЕНДА ===
// Семь слайдов вступления. У каждого свой визуальный образ (kind) и текст.
const LEGEND_SLIDES = [
    {
        kind: 'year', year: '2226', kicker: 'Пролог', title: 'Двести лет спустя',
        lines: [
            'Солнечная система. Мы всё ещё здесь — но домов стало больше.',
            'Земля выбрала экологию: чистые океаны, города-сады, запрет на грязные технологии. За это платят металлом, которого вечно не хватает.'
        ]
    },
    {
        kind: 'earth', texture: 'earth', kicker: 'Земля · Мегаполис', title: 'Терра Нова',
        lines: [
            '12 миллиардов человек, и все они едят, дышат и строят.',
            'Земля не воюет за ресурсы — она покупает их. Каждый грамм руды на её орбитах учтён, и каждая тонна стали стоит дороже, чем где-либо ещё.'
        ]
    },
    {
        kind: 'mars', texture: 'mars', kicker: 'Марс · Мир Тишины', title: 'Марсиане',
        lines: [
            'Полтора века под землёй сделали своё дело: марсиане выросли в тишине и не терпят шума.',
            'Их реакторы почти бесшумны, их корабли идут на ионных приводах, их города спрятаны в толще породы. «Лучший звук — тишина» — не лозунг, а физиология.'
        ]
    },
    {
        kind: 'belt', kicker: 'Пояс · Титановое Кольцо', title: 'Астровитяне',
        lines: [
            'Рождённые без гравитации не похожи на землян: узкие плечи, длинные пальцы, экзоскелеты с детства.',
            'Без антигравитационных компенсаторов они не выдерживают и мягкого ускорения. Зато никто лучше них не работает с металлом и добычей.'
        ]
    },
    {
        kind: 'portal', kicker: 'За орбитой Урана', title: 'Плоское кольцо',
        lines: [
            'Портал искали сто лет — и не находили. Кольцо лежит почти в плоскости эклиптики и не отражает свет: с орбиты Земли его просто нет.',
            'Оно становится видно, если подняться над плоскостью всего на 2–3 градуса. Тогда в телескопе проявляется объект чудовищной массы — и он работает.'
        ]
    },
    {
        kind: 'portal', kicker: 'После находки', title: 'Соседние системы',
        lines: [
            'За несколько десятилетий земляне, марсиане и астровитяне нашли и обжили ближайшие системы.',
            'Колонии строились вместе — и на новых мирах трое народов живут рядом, перенося туда свои привычки, споры и болезни.'
        ]
    },
    {
        kind: 'year', year: '150+', kicker: 'Хроника', title: 'Мир без больших войн',
        lines: [
            'Глобальных войн человечество не знает давно. Но это не мир — это перемирие с торговлей.',
            'Спорят за маршруты, за воду, за места у Врат. Стреляют редко, жалуются и судятся постоянно.'
        ]
    },
    {
        kind: 'paths', kicker: 'Угроза', title: 'Пираты',
        lines: [
            'Есть старые группировки: база в тени Юпитера, укрытие в кольцах Сатурна. Они живут этим десятилетиями.',
            'А есть одиночки — торговцы и добытчики, которые однажды не вернули груз и остались в тени. Из них и собирается следующий флот.'
        ]
    },
    {
        kind: 'ship', kicker: 'Университет Космической Экспансии', title: 'Вы — капитан',
        lines: [
            'Вы — выпускник университета, и у вас есть допуск к Вратам.',
            'В трюме — транспорт и допуск на первый рейс. Дальше всё зависит от того, как вы поведёте свой флот.'
        ]
    }
];

const LEGEND_MS = 7000;
let legendIndex = 0;
let legendTimer = null;
let legendProgressTimer = null;

function legendVisual(slide) {
    switch (slide.kind) {
        case 'year':
            return `<div class="lg-visual"><div class="lg-year">${slide.year}</div><div class="lg-glow-big"></div></div>`;
        case 'earth':
        case 'mars':
            return `<div class="lg-visual"><div class="lg-ring-outer"></div>` +
                `<div class="lg-sphere" style="background-image:url('/images/tex/${slide.texture}.webp')"></div></div>`;
        case 'belt':
            return `<div class="lg-visual"><div class="lg-belt" id="lg-belt"></div></div>`;
        case 'portal':
            return `<div class="lg-visual"><div class="lg-portal">` +
                `<span class="lg-ring a"></span><span class="lg-ring b"></span><span class="lg-core"></span></div></div>`;
        case 'ship':
            return `<div class="lg-visual"><div class="lg-ship-glow"></div>` +
                `<img class="lg-ship" src="/images/ships/colonizer.svg" alt=""></div>`;
        case 'paths':
            return `<div class="lg-visual"><div class="lg-paths">` +
                `<span class="lg-path p1">Торговля</span>` +
                `<span class="lg-path p2">Индустрия</span>` +
                `<span class="lg-path p3">Экспедиция</span></div></div>`;
    }
    return '<div class="lg-visual"></div>';
}

function buildLegend() {
    const overlay = document.getElementById('legend-overlay');
    if (!overlay || overlay.dataset.built === '1') return;
    overlay.dataset.built = '1';

    const slides = LEGEND_SLIDES.map((s, i) => `
        <section class="lg-slide" data-index="${i}">
            ${legendVisual(s)}
            <div class="lg-copy">
                <div class="lg-kicker">${s.kicker}</div>
                <h2 class="lg-title">${s.title}</h2>
                ${s.lines.map(t => `<p class="lg-text">${t}</p>`).join('')}
            </div>
        </section>`).join('');

    overlay.innerHTML = `
        <canvas id="legend-stars"></canvas>
        <div class="lg-stage">${slides}</div>
        <div class="legend-progress"><div class="legend-progress-bar" id="legend-progress-bar"></div></div>
        <div class="lg-dots" id="lg-dots">${LEGEND_SLIDES.map((_, i) => `<button class="lg-dot" data-dot="${i}" onclick="legendGo(${i})"></button>`).join('')}</div>
        <button class="legend-skip" onclick="skipLegend()">Пропустить вступление →</button>`;

    // Пояс астероидов: раскидываем точки по кольцу
    const belt = document.getElementById('lg-belt');
    if (belt) {
        let html = '';
        for (let i = 0; i < 90; i++) {
            const angle = Math.random() * Math.PI * 2;
            const radius = 34 + Math.random() * 16;
            const x = 50 + Math.cos(angle) * radius;
            const y = 50 + Math.sin(angle) * radius * 0.42;
            const size = 1 + Math.random() * 2.2;
            html += `<i style="left:${x.toFixed(2)}%;top:${y.toFixed(2)}%;width:${size.toFixed(1)}px;height:${size.toFixed(1)}px;` +
                `animation-delay:${(Math.random() * 6).toFixed(2)}s;animation-duration:${(5 + Math.random() * 6).toFixed(2)}s"></i>`;
        }
        belt.innerHTML = html;
    }

    drawLegendStars();
}

function drawLegendStars() {
    const canvas = document.getElementById('legend-stars');
    if (!canvas || !canvas.getContext) return;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);
    for (let i = 0; i < 320; i++) {
        const x = Math.random() * w, y = Math.random() * h;
        const r = Math.random() * 1.4 + 0.2;
        ctx.globalAlpha = 0.15 + Math.random() * 0.75;
        ctx.fillStyle = Math.random() < 0.2 ? '#aaccff' : '#ffffff';
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
}

function showSlide(index) {
    const slides = document.querySelectorAll('.lg-slide');
    if (!slides.length) return;
    legendIndex = Math.max(0, Math.min(index, slides.length - 1));
    slides.forEach((el, i) => el.classList.toggle('active', i === legendIndex));
    document.querySelectorAll('.lg-dot').forEach((d, i) => d.classList.toggle('active', i === legendIndex));

    const bar = document.getElementById('legend-progress-bar');
    if (bar) {
        bar.style.transition = 'none';
        bar.style.width = '0%';
        // перезапуск анимации на каждом слайде
        void bar.offsetWidth;
        bar.style.transition = `width ${LEGEND_MS}ms linear`;
        bar.style.width = '100%';
    }
}

function legendNext() {
    if (legendIndex + 1 >= LEGEND_SLIDES.length) { endLegend(); return; }
    showSlide(legendIndex + 1);
}

window.legendGo = (index) => {
    if (legendTimer) { clearInterval(legendTimer); legendTimer = setInterval(legendNext, LEGEND_MS); }
    showSlide(index);
};

window.startLegend = (startIndex) => {
    buildLegend();
    const overlay = document.getElementById('legend-overlay');
    if (!overlay) return;
    overlay.style.display = 'flex';
    showSlide(Number(startIndex) || 0);

    if (legendTimer) clearInterval(legendTimer);
    legendTimer = setInterval(legendNext, LEGEND_MS);

    if (!window.__legendKeys) {
        window.__legendKeys = true;
        document.addEventListener('keydown', (e) => {
            const overlayEl = document.getElementById('legend-overlay');
            if (!overlayEl || overlayEl.style.display === 'none') return;
            if (e.key === 'Escape') { window.skipLegend(); }
            else if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'Enter') { e.preventDefault(); window.legendGo(Math.min(legendIndex + 1, LEGEND_SLIDES.length - 1)); }
            else if (e.key === 'ArrowLeft') { window.legendGo(Math.max(legendIndex - 1, 0)); }
        });
    }
};

window.skipLegend = () => {
    if (legendTimer) { clearInterval(legendTimer); legendTimer = null; }
    endLegend();
};

function endLegend() {
    if (legendTimer) { clearInterval(legendTimer); legendTimer = null; }
    const overlay = document.getElementById('legend-overlay');
    if (overlay) overlay.style.display = 'none';
    if (currentUser) {
        currentUser.hasSeenLegend = true;
        saveUser();
        // Флаг «пролог пройден» должен жить НА СЕРВЕРЕ, иначе после перезагрузки
        // пролог запускается заново (баг Игоря).
        try {
            if (typeof apiPost === 'function' && authToken) {
                apiPost('/api/profile', { profile: JSON.stringify(currentUser) }, true)
                    .catch(() => {});
            }
        } catch (e) { }
    }
    updateAuthUI();
}

// =========================================================
// АСТРОНОМИЧЕСКИЕ ДАННЫЕ И ПОСТРОЕНИЕ СЦЕНЫ
// =========================================================
// Реальные элементы орбит на эпоху J2000: большая полуось в а.е.,
// сидерический период в земных сутках, средняя долгота на 01.01.2000 12:00 UT
// в градусах, период вращения вокруг оси в часах (минус — обратное вращение).
// Размеры в пикселях — художественные: настоящий масштаб показать нельзя
// (Нептун в 30 раз дальше Земли, а диаметр всего в 4 раза больше).

// «а.е. -> радиус орбиты в px»: линейная интерполяция по узлам.
// Внутренние планеты почти сохраняют пропорции, внешние сжаты.
const ORBIT_SCALE = [
    [0.387, 118], [0.723, 150], [1.000, 185], [1.524, 228], [2.100, 245],
    [3.300, 300], [5.203, 330], [9.537, 400], [19.191, 480], [30.069, 560], [39.482, 620]
];

function orbitRadius(au) {
    const t = ORBIT_SCALE;
    if (au <= t[0][0]) return t[0][1] * (au / t[0][0]);
    for (let i = 1; i < t.length; i++) {
        if (au <= t[i][0]) {
            const a0 = t[i - 1][0], r0 = t[i - 1][1], a1 = t[i][0], r1 = t[i][1];
            return r0 + (r1 - r0) * (au - a0) / (a1 - a0);
        }
    }
    const n = t.length;
    return t[n - 1][1] + (t[n - 1][1] - t[n - 2][1]) * (au - t[n - 1][0]) / (t[n - 1][0] - t[n - 2][0]);
}

// Солнечная система: 8 планет + Плутон и 23 крупных спутника.
// Периоды обращения — сидерические, в земных сутках; у Тритона знак минус
// (обратное движение). Расстояния спутников от планеты — художественные:
// в реальном масштабе Ио была бы в 6 радиусов Юпитера, а не в 45 px.
const SOL_SYSTEM = {
    id: 'sol',
    name: 'Солнечная система',
    star: { name: 'Солнце', size: 84, color: '#ffb300' },
    planets: [
        { id: 'mercury', name: 'Меркурий', au: 0.38710, period: 87.9691, L0: 252.25084, rotH: 1407.6, size: 9, texture: 'mercury', tint: '#b0a49a', moons: [] },
        { id: 'venus', name: 'Венера', au: 0.72333, period: 224.7008, L0: 181.97973, rotH: -5832.5, size: 16, texture: 'venus', tint: '#e0c088', moons: [] },
        {
            id: 'earth', name: 'Земля', au: 1.00000, period: 365.2564, L0: 100.46435, rotH: 23.9345, size: 26, texture: 'earth', tint: '#1565c0',
            moons: [{ name: 'Луна', period: 27.321661, epoch: 218.32, radius: 30, size: 8, texture: 'moon' }]
        },
        {
            id: 'mars', name: 'Марс', au: 1.52371, period: 686.9800, L0: 355.45332, rotH: 24.6229, size: 20, texture: 'mars', tint: '#c1440e',
            moons: [
                { name: 'Фобос', period: 0.318910, epoch: 35, radius: 20, size: 4, texture: 'phobos' },
                { name: 'Деймос', period: 1.262441, epoch: 120, radius: 27, size: 3, texture: 'deimos' }
            ]
        },
        {
            id: 'jupiter', name: 'Юпитер', au: 5.20289, period: 4332.589, L0: 34.40438, rotH: 9.9250, size: 54, texture: 'jupiter', tint: '#d8ca9d',
            moons: [
                { name: 'Ио', period: 1.769138, epoch: 10, radius: 36, size: 6, texture: 'io' },
                { name: 'Европа', period: 3.551181, epoch: 85, radius: 46, size: 5, texture: 'europa' },
                { name: 'Ганимед', period: 7.154553, epoch: 160, radius: 56, size: 8, texture: 'ganymede' },
                { name: 'Каллисто', period: 16.689018, epoch: 250, radius: 62, size: 7, texture: 'callisto' }
            ]
        },
        {
            id: 'saturn', name: 'Сатурн', au: 9.53707, period: 10759.22, L0: 49.94432, rotH: 10.656, size: 48, texture: 'saturn', tint: '#e0c9a3',
            moons: [
                { name: 'Мимас', period: 0.942422, epoch: 20, radius: 32, size: 3, tint: '#c9c6bf' },
                { name: 'Энцелад', period: 1.370218, epoch: 70, radius: 38, size: 4, texture: 'enceladus' },
                { name: 'Тефия', period: 1.887802, epoch: 120, radius: 44, size: 4, tint: '#cfcabf' },
                { name: 'Диона', period: 2.736915, epoch: 170, radius: 50, size: 4, tint: '#c8c2b6' },
                { name: 'Рея', period: 4.518212, epoch: 200, radius: 56, size: 5, tint: '#b0a89a' },
                { name: 'Титан', period: 15.945421, epoch: 45, radius: 64, size: 8, texture: 'titan' },
                { name: 'Япет', period: 79.3215, epoch: 300, radius: 72, size: 5, tint: '#8a8070' }
            ]
        },
        {
            id: 'uranus', name: 'Уран', au: 19.19126, period: 30685.4, L0: 313.23218, rotH: -17.24, size: 34, texture: 'uranus', tint: '#a8dbe0',
            moons: [
                { name: 'Миранда', period: 1.413479, epoch: 30, radius: 28, size: 4, tint: '#cfd6d8' },
                { name: 'Ариэль', period: 2.520379, epoch: 110, radius: 34, size: 5, tint: '#d9dee0' },
                { name: 'Умбриэль', period: 4.144177, epoch: 200, radius: 40, size: 4, tint: '#9aa0a4' },
                { name: 'Титания', period: 8.705872, epoch: 290, radius: 46, size: 6, texture: 'titania' },
                { name: 'Оберон', period: 13.463239, epoch: 350, radius: 52, size: 5, tint: '#b3b8bb' }
            ]
        },
        {
            id: 'neptune', name: 'Нептун', au: 30.06896, period: 60189.0, L0: 304.88003, rotH: 16.11, size: 32, texture: 'neptune', tint: '#3b5bdb',
            moons: [
                { name: 'Протей', period: 1.122315, epoch: 15, radius: 28, size: 3, tint: '#8f9aa8' },
                { name: 'Тритон', period: -5.876854, epoch: 60, radius: 36, size: 6, texture: 'triton' },
                { name: 'Нереида', period: 360.136, epoch: 210, radius: 44, size: 3, tint: '#8f9aa8' }
            ]
        },
        {
            id: 'pluto', name: 'Плутон', au: 39.48212, period: 90560.0, L0: 238.92881, rotH: -153.29, size: 10, tint: '#c8b6a6',
            moons: [{ name: 'Харон', period: 6.387230, epoch: 90, radius: 14, size: 5, tint: '#9c9c9c' }]
        }
    ]
};

function planetSurfaceStyle(p) {
    if (p.texture) return `background-image:url('/images/tex/${p.texture}.webp');background-color:${p.tint || '#333'}`;
    return `background:radial-gradient(circle at 35% 30%, ${p.tint}, rgba(0,0,0,0.85) 130%)`;
}

// луны без фото: рисуем процедурную текстуру на Python и берём её
const MOON_SLUG = {
    'Мимас': 'mimas', 'Тефия': 'tethys', 'Диона': 'dione', 'Рея': 'rhea',
    'Япет': 'iapetus', 'Миранда': 'miranda', 'Ариэль': 'ariel', 'Умбриэль': 'umbriel',
    'Оберон': 'oberon', 'Протей': 'proteus', 'Нереида': 'nereid', 'Харон': 'charon',
    'Луна': 'moon', 'Фобос': 'phobos', 'Деймос': 'deimos', 'Ио': 'io',
    'Европа': 'europa', 'Ганимед': 'ganymede', 'Каллисто': 'callisto',
    'Титан': 'titan', 'Энцелад': 'enceladus', 'Титания': 'titania', 'Тритон': 'triton'
};

// Луны, которые не шар: Фобос, Деймос, Гиперион, Протей, Нереида, Амальтея.
const IRREGULAR_MOONS = new Set(['Фобос', 'Деймос', 'Гиперион', 'Протей', 'Нереида']);

// картофелевидный контур: синусоидальные «шишки» плюс немного случайности
function potatoClip(seed) {
    const n = 18, pts = [];
    let state = Math.abs(seed) % 997 + 1;
    const rnd = () => (state = (state * 9301 + 49297) % 233280) / 233280;
    for (let i = 0; i < n; i++) {
        const a = i / n * Math.PI * 2;
        const rad = 0.40 + 0.055 * Math.sin(a * 2 + seed) + 0.035 * Math.sin(a * 3 + seed * 2) + 0.03 * rnd();
        const x = 50 + Math.cos(a) * rad * 100;
        const y = 50 + Math.sin(a) * rad * 100;
        pts.push(Math.max(1, Math.min(99, x)).toFixed(1) + '% ' + Math.max(1, Math.min(99, y)).toFixed(1) + '%');
    }
    return 'polygon(' + pts.join(', ') + ')';
}

// Луны, где по игре стоят станции: у Юпитера — Ио, Европа, Ганимед, Каллисто,
// у Сатурна — Титан и Энцелад, плюс Луна, Фобос, Деймос и Тритон.
const MOON_STATIONS = new Set(['Луна', 'Фобос', 'Деймос', 'Ио', 'Европа', 'Ганимед',
                               'Каллисто', 'Титан', 'Энцелад', 'Тритон']);

function moonMarkup(m) {
    // фото → своя текстура; иначе процедурная из /images/tex-proc/
    const slug = MOON_SLUG[m.name];
    const proc = !m.texture && slug ? `url('/images/tex-proc/${slug}.webp')` : null;
    const surface = m.texture
        ? `background-image:url('/images/tex/${m.texture}.webp')`
        : (proc ? `background-image:${proc}` : `background-color:${m.tint || '#999'}`);
    const irregular = IRREGULAR_MOONS.has(m.name);
    const seed = m.name.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
    const shape = irregular
        ? `clip-path:${potatoClip(seed)};border-radius:0;`
        : '';
    return `<div class="moon-orbit" style="width:${m.radius * 2}px;height:${m.radius * 2}px;">` +
        `<div class="moon${irregular ? ' irregular' : ''}" data-moon="${m.name}" data-period="${m.period}" data-epoch="${m.epoch}" ` +
        `style="${surface};width:${m.size}px;height:${m.size}px;${shape}">` +
        `<div class="moon-shadow"></div><div class="tooltip">${m.name}</div></div>` +
        ((MOON_STATIONS.has(m.name) || SETTLED_SYSTEM)
            ? `<span class="moon-station" title="${m.name}: орбитальная станция"></span>`
            : '') +
        `</div>`;
}

// Орбитальная станция стоит в 13 px от поверхности, к ней идёт гравитационный
// лифт — трос, по которому груз поднимается с планеты почти без затрат энергии.
// У жителей Пояса гравитация и так минимальна, поэтому им станции и лифты не нужны.
const STATION_DIST = 13;

// Станция нужна только там, где она есть по игре: у газовых гигантов
// нет ни поверхности, ни колоний — значок станции там бессмысленный.
const NO_STATION = new Set(['jupiter', 'saturn', 'uranus', 'neptune', 'kepler1']);

// Кеплер-1 заселена больше ста лет: там обжиты все пригодные планеты и луны.
// Для таких систем станции и огни городов рисуем всем мирам, кроме газовых гигантов.
let SETTLED_SYSTEM = false;
const GAS_GIANT_IDS = new Set(['jupiter', 'saturn', 'uranus', 'neptune']);
function isSettledWorld(p) {
    if (!SETTLED_SYSTEM) return false;
    if (GAS_GIANT_IDS.has(p.id)) return false;
    return true;
}

function stationMarkup(p) {
    if (p.noStation) return '';
    if (!isSettledWorld(p) && NO_STATION.has(p.id)) return '';
    // Станции на планетах не рисуем: на карте они выглядели как тёмные круги
    // на поверхности. Оставляем только данные в карточке планеты.
    return '';
}

// огни городов рисуем только там, где есть колонии и атмосфера
const LIGHTS_OK = new Set(['earth', 'mars', 'moon', 'titan', 'europa', 'ganymede']);

function planetMarkup(p) {
    const r = orbitRadius(p.au);
    const moons = (p.moons || []).map(moonMarkup).join('');
    const extra = p.id === 'saturn' ? ' saturn' : '';
    return `<div class="orbit" data-period="${p.period}" data-epoch="${p.L0}" style="width:${r * 2}px;height:${r * 2}px;">` +
        `<div class="planet-wrapper"><div class="planet${extra}" data-planet-id="${p.id}" data-rot-period="${p.rotH}" ` +
        `style="width:${p.size}px;height:${p.size}px;">` +
        `<div class="planet-surface" style="${planetSurfaceStyle(p)}"></div>` +
        `<div class="planet-shadow"></div>` +
        `${(LIGHTS_OK.has(p.id) || isSettledWorld(p)) ? '<div class="planet-lights"></div>' : ''}` +
        stationMarkup(p) +
        (moons ? `<div class="moon-system">${moons}</div>` : '') +
        `<div class="tooltip">${p.name}</div>` +
        `</div></div></div>`;
}

// Перестраивает сцену под конкретную систему: старая разметка (в том числе
// статическая из Razor) удаляется, поэтому страница может показать любой набор.
function buildScene(system) {
    window.__sceneSystem = system;
    // Кеплер-1 обжита больше ста лет: все луны и пригодные планеты освоены
    SETTLED_SYSTEM = /^kepler-?1$/i.test(system.id || '');
    const host = document.querySelector('.solar-system');
    if (!host) return null;
    host.querySelectorAll('.orbit, .portal, .system-extra').forEach(el => el.remove());

    beltEnabled = system.id === 'sol';                  // пояс астероидов есть только у Солнца
    if (!beltEnabled && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);

    let maxR = 0;
    system.planets.forEach(p => { maxR = Math.max(maxR, orbitRadius(p.au)); });

    let html = system.planets.map(planetMarkup).join('');
    if (system.id === 'sol') {
        // «Врата Атлантов» — объект неизвестной цивилизации ЗА орбитой Урана.
        // Кольцо лежит почти в плоскости эклиптики: с Земли виден только его край,
        // поэтому объект и не замечали двести лет. Наклон 74° даёт эту «плоскость».
        const portalR = orbitRadius(19.19126) + 45;   // между Ураном и Нептуном
        const ang = 160 * Math.PI / 180;
        const px = (Math.cos(ang) * portalR).toFixed(1);
        const py = (Math.sin(ang) * portalR).toFixed(1);
        html += `<div class="portal system-extra" onclick="openSystems()" ` +
            `style="transform:translate(-50%,-50%) translate(${px}px, ${py}px) rotateZ(-14deg) rotateX(74deg);">` +
            `<div class="portal-ring outer"></div><div class="portal-ring inner"></div><div class="portal-core"></div>` +
            `<div class="tooltip">🌀 Врата Атлантов — переход в другие системы</div></div>`;
    }
    host.insertAdjacentHTML('beforeend', html);

    // Слой трафика: корабли летают между станциями, а не между планетами.
    let layer = host.querySelector('.fleet-layer');
    if (!layer) { layer = document.createElement('div'); layer.className = 'fleet-layer'; host.appendChild(layer); }
    // Старый слой флотов рисовал борта по нормализованным 0..1 координатам,
    // из-за чего они «летали непонятно где». Флоты теперь в #fleet-traffic.
    layer.innerHTML = '';
    // гражданский трафик строим сразу при отрисовке системы, а не только в кадре:
    // иначе у колоний и в поясе астероидов бортов не видно
    civilBuilt = false;
    const oldCivil = document.getElementById('civil-traffic');
    if (oldCivil) oldCivil.remove();
    civilItems = [];
    if (system.id === 'sol') { ensureCivilSoon(); tradeBuilt = false; const oldTrade = document.getElementById('trade-traffic'); if (oldTrade) oldTrade.remove(); tradeShips = []; tradePaths = []; buildTradeTraffic(); updateTradeTraffic(); updateFleetTraffic(); }

    const sun = host.querySelector('.sun');
    if (sun && system.star) {
        const s = system.star;
        sun.style.width = s.size + 'px';
        sun.style.height = s.size + 'px';
        sun.style.background = `radial-gradient(circle at 30% 30%, #fffde7, ${s.color} 35%, #c0392b 85%, #6b1a00)`;
        sun.style.boxShadow = `0 0 60px ${s.color}, 0 0 150px ${s.color}`;
        const tip = sun.querySelector('.tooltip');
        if (tip) tip.textContent = s.name;
    }

    const title = document.querySelector('.control-panel .title');
    if (title) title.textContent = system.name;

    maxOrbitRadius = maxR;
    return system;
}

// =========================================================
// ТРАФИК МЕЖДУ СТАНЦИЯМИ
// =========================================================
// Рейсы идут от станции к станции (индексы планет в SOL_SYSTEM). t — доля пути.
// Скорость задана в реальном времени, а не в игровом: при 1x планеты стоят,
// а жизнь на орбитах не замирает.
const TRAFFIC_ROUTES = [
    { a: 2, b: 3, t: 0.15, speed: 0.020, ship: 'jet_hauler' },   // Земля — Марс
    { a: 2, b: 3, t: 0.65, speed: 0.014, ship: 'ion_courier' },
    { a: 4, b: 5, t: 0.35, speed: 0.010, ship: 'grav_frigate' }, // Юпитер — Сатурн
    { a: 3, b: 2, t: 0.90, speed: 0.017, ship: 'jet_scout' }
];

function buildFleetTraffic() {
    // Кривые траектории рисуем в SVG, корабли — прозрачными иконками.
    // JPEG-рендеры тут не годятся: у них нет прозрачности и виден чёрный квадрат.
    const paths = TRAFFIC_ROUTES.map((r, i) => `<path class="traffic-path" data-route="${i}"></path>`).join('');
    const ships = TRAFFIC_ROUTES.map((r, i) => {
        const name = (SHIPS[r.ship] && SHIPS[r.ship].name) || r.ship;
        // тот же треугольник, что у остальных бортов: одинаковый вид у всех кораблей
        return `<div class="ship-marker ship-marker--traffic" data-route="${i}" ` +
            `data-art="${r.ship}" ` +
            `style="background-image:url(${shipArtUrl(r.ship)})" ` +
            `title="${name} — двойной клик: карточка борта"></div>`;
    }).join('');
    return `<svg class="traffic-paths" width="1" height="1" overflow="visible">${paths}</svg>` + ships;
}

// Позиция станции относительно центра планеты (фиксированный угол).
const STATION_ANGLE = -Math.PI / 4;
// Карточка летящего транспорта: что за борт, чем везёт, с какой скоростью идёт.
// Полёт аппарата в космосе — 3D-сцена на three.js.
// Корабль — воксельная модель из Models3D, звёзды — по спектральным классам,
// туманность и планета — спрайты и сфера. Если three.js не загрузился,
// вызывается openShipFlight2D (canvas-версия).
function shipFlightShell(index) {
    const r = TRAFFIC_ROUTES[index];
    if (!r) return null;
    const ship = SHIPS[r.ship] || { name: 'Аппарат', cls: '', cargo: 0 };
    const drive = (typeof DRIVES !== 'undefined' && DRIVES[ship.drive]) ? DRIVES[ship.drive] : { name: '—' };
    const st = r.state || { vx: 0, vy: 0 };
    const speedKm = Math.round(Math.hypot(st.vx || 0, st.vy || 0) /
        (typeof SPEED_UNIT === 'number' ? SPEED_UNIT : 7) * 1000);
    const from = (planetNodes[r.a] && planetNodes[r.a].data && planetNodes[r.a].data.name) || 'станция';
    const to = (planetNodes[r.b] && planetNodes[r.b].data && planetNodes[r.b].data.name) || 'станция';

    const old = document.getElementById('ship-flight');
    if (old) old.remove();

    const modal = document.createElement('div');
    modal.id = 'ship-flight';
    modal.style.cssText = 'position:fixed;inset:0;z-index:100060;display:flex;align-items:center;justify-content:center;' +
        'background:rgba(2,4,8,.86);padding:14px';
    modal.innerHTML =
        '<div style="position:relative;width:min(880px,96vw);border-radius:18px;overflow:hidden;' +
        'border:1px solid #1e3a5f;background:#04070d">' +
        '<canvas id="ship-flight-canvas" style="display:block;width:100%;height:auto"></canvas>' +
        '<div style="position:absolute;left:0;right:0;bottom:0;padding:14px 18px;' +
        'background:linear-gradient(rgba(4,7,13,0),rgba(4,7,13,.94));color:#dce8f7;' +
        'font:14px/1.45 Inter,system-ui,sans-serif">' +
        '<div style="display:flex;justify-content:space-between;align-items:flex-end;gap:12px;flex-wrap:wrap">' +
        '<div><b style="color:#8fd6ff;font-size:17px">' + (ship.name || 'Аппарат') + '</b>' +
        '<div style="opacity:.75;font-size:12.5px">' + (ship.cls || '') + ' · ' + (drive.name || '') + '</div></div>' +
        '<div style="text-align:right;font-size:12.5px;opacity:.85">' +
        '<div>маршрут <b style="color:#ffd05a">' + from + ' → ' + to + '</b></div>' +
        '<div>скорость <b style="color:#3ec97a">' + speedKm + ' км/с</b> · трюм ' + (ship.cargo || '—') + ' т</div>' +
        '</div></div></div>' +
        '<button id="sf-close" style="position:absolute;right:10px;top:10px;border:none;border-radius:9px;' +
        'padding:6px 12px;background:rgba(20,30,46,.85);color:#dce8f7;cursor:pointer;font-size:15px">✕</button>' +
        '</div>';
    document.body.appendChild(modal);
    return { modal: modal, ship: ship, route: r, world: from };
}

function openShipFlight(index) {
    import('/lib/three/three.module.js')
        .then(function (THREE) {
            if (!window.Models3D || !window.Models3D.buildShip) throw new Error('нет Models3D');
            openShipFlight3D(index, THREE);
        })
        .catch(function (e) {
            console.warn('3D-полёт недоступен, рисую 2D:', e && e.message);
            openShipFlight2D(index);
        });
}

function openShipFlight3D(index, THREE) {
    const shell = shipFlightShell(index);
    if (!shell) return;

    const canvas = document.getElementById('ship-flight-canvas');
    const renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x04060c);

    const camera = new THREE.PerspectiveCamera(52, 1.7, 0.1, 2000);
    camera.position.set(0, 0, 34);

    // ---------- звёзды по спектральным классам ----------
    // O/B — голубовато-белые, A — белые, G — жёлтые, K — оранжевые, M — красные.
    const CLASSES = [
        { c: [0.72, 0.82, 1.00], w: 0.06 },
        { c: [0.90, 0.94, 1.00], w: 0.14 },
        { c: [1.00, 1.00, 1.00], w: 0.30 },
        { c: [1.00, 0.96, 0.86], w: 0.28 },
        { c: [1.00, 0.84, 0.68], w: 0.16 },
        { c: [1.00, 0.72, 0.60], w: 0.06 }
    ];

    function makeStars(count, spread, sizeMin, sizeMax) {
        const pos = new Float32Array(count * 3);
        const col = new Float32Array(count * 3);
        for (let i = 0; i < count; i++) {
            // равномерно по сфере, но с уплотнением к плоскости Галактики
            let u = Math.random() * 2 - 1;
            if (Math.random() < 0.55) u *= 0.18;          // диск Млечного Пути
            const phi = Math.random() * Math.PI * 2;
            const r = spread * (0.75 + Math.random() * 0.25);
            const s = Math.sqrt(1 - u * u);
            pos[i * 3] = Math.cos(phi) * s * r;
            pos[i * 3 + 1] = u * r;
            pos[i * 3 + 2] = Math.sin(phi) * s * r;

            // яркость по степенному закону: ярких мало
            const b = 0.25 + Math.pow(Math.random(), 2.6) * 0.75;
            let acc = 0, pick = CLASSES[CLASSES.length - 1];
            const rnd = Math.random();
            for (let k = 0; k < CLASSES.length; k++) {
                acc += CLASSES[k].w;
                if (rnd <= acc) { pick = CLASSES[k]; break; }
            }
            col[i * 3] = pick.c[0] * b;
            col[i * 3 + 1] = pick.c[1] * b;
            col[i * 3 + 2] = pick.c[2] * b;
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        g.setAttribute('color', new THREE.BufferAttribute(col, 3));
        const m = new THREE.PointsMaterial({
            size: (sizeMin + sizeMax) / 2, sizeAttenuation: false,
            vertexColors: true, transparent: true, opacity: 0.95,
            depthWrite: false, blending: THREE.AdditiveBlending
        });
        return new THREE.Points(g, m);
    }

    // Четыре слоя разного размера: так звёзды выглядят разнояркими, а не «горохом».
    const starLayers = [
        { pts: makeStars(2400, 260, 0.7, 0.7), speed: 1.8, wrap: 520, base: 0.9, ph: 0.0 },
        { pts: makeStars(900, 190, 1.1, 1.1), speed: 3.6, wrap: 380, base: 0.95, ph: 1.2 },
        { pts: makeStars(320, 130, 1.7, 1.7), speed: 6.2, wrap: 260, base: 1.0, ph: 2.4 },
        { pts: makeStars(90, 95, 2.6, 2.6), speed: 9.0, wrap: 190, base: 1.0, ph: 3.6 }
    ];
    starLayers.forEach(L => scene.add(L.pts));
    const starsNear = starLayers[2].pts;
    const starsFar = starLayers[0].pts;

    // ---------- полоса Млечного Пути ----------
    (function milkyWay() {
        const cv = document.createElement('canvas');
        cv.width = 1024; cv.height = 256;
        const cx = cv.getContext('2d');
        for (let i = 0; i < 5200; i++) {
            const x = Math.random() * 1024;
            const g = (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;
            const y = 128 + g * 52;
            const a = 0.05 + Math.random() * 0.22;
            cx.fillStyle = 'rgba(200,215,255,' + a + ')';
            cx.fillRect(x, y, 1 + Math.random(), 1 + Math.random());
        }
        const grd = cx.createLinearGradient(0, 0, 0, 256);
        grd.addColorStop(0, 'rgba(120,150,220,0)');
        grd.addColorStop(0.5, 'rgba(120,150,220,0.12)');
        grd.addColorStop(1, 'rgba(120,150,220,0)');
        cx.fillStyle = grd;
        cx.fillRect(0, 0, 1024, 256);

        // мягкая маска по краям, иначе виден прямоугольник спрайта
        cx.globalCompositeOperation = 'destination-in';
        const mask = cx.createRadialGradient(512, 128, 40, 512, 128, 520);
        mask.addColorStop(0, 'rgba(0,0,0,1)');
        mask.addColorStop(0.55, 'rgba(0,0,0,0.85)');
        mask.addColorStop(1, 'rgba(0,0,0,0)');
        cx.fillStyle = mask;
        cx.fillRect(0, 0, 1024, 256);
        cx.globalCompositeOperation = 'source-over';

        const tex = new THREE.CanvasTexture(cv);
        const band = new THREE.Sprite(new THREE.SpriteMaterial({
            map: tex, transparent: true, depthWrite: false,
            blending: THREE.AdditiveBlending, opacity: 0.55
        }));
        band.scale.set(420, 105, 1);
        band.position.set(-30, 40, -220);
        band.material.rotation = -0.22;
        scene.add(band);
    })();

    // ---------- туманность ----------
    function nebulaTexture(inner, outer) {
        const cv = document.createElement('canvas');
        cv.width = cv.height = 256;
        const cx = cv.getContext('2d');
        const grd = cx.createRadialGradient(128, 128, 6, 128, 128, 128);
        grd.addColorStop(0, inner);
        grd.addColorStop(0.45, outer);
        grd.addColorStop(1, 'rgba(0,0,0,0)');
        cx.fillStyle = grd;
        cx.fillRect(0, 0, 256, 256);
        const t = new THREE.CanvasTexture(cv);
        return t;
    }
    const neb1 = new THREE.Sprite(new THREE.SpriteMaterial({
        map: nebulaTexture('rgba(90,140,255,0.30)', 'rgba(40,70,160,0.10)'),
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.9
    }));
    neb1.scale.set(150, 150, 1);
    neb1.position.set(-52, 26, -120);
    scene.add(neb1);

    const neb2 = new THREE.Sprite(new THREE.SpriteMaterial({
        map: nebulaTexture('rgba(190,120,220,0.20)', 'rgba(90,50,130,0.08)'),
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.75
    }));
    neb2.scale.set(120, 120, 1);
    neb2.position.set(60, -26, -130);
    scene.add(neb2);

    // ---------- планета на фоне ----------
    const worldSlug = {
        'Юпитер': 'jupiter', 'Сатурн': 'saturn', 'Марс': 'mars', 'Земля': 'earth',
        'Луна': 'moon', 'Венера': 'venus', 'Меркурий': 'mercury', 'Уран': 'uranus',
        'Нептун': 'neptune', 'Титан': 'titan', 'Европа': 'europa', 'Ио': 'io'
    }[shell.world] || 'jupiter';
    const planetGeo = new THREE.SphereGeometry(26, 64, 32);
    const planetMat = new THREE.MeshStandardMaterial({ color: 0x223a55, roughness: 1, metalness: 0 });
    const planet = new THREE.Mesh(planetGeo, planetMat);
    planet.position.set(-34, -34, -80);
    planet.rotation.z = 0.25;
    scene.add(planet);

    new THREE.TextureLoader().load('/images/tex/' + worldSlug + '.webp', function (tex) {
        if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
        planetMat.map = tex;
        planetMat.color.set(0xffffff);
        planetMat.needsUpdate = true;
    });

    const sunLight = new THREE.DirectionalLight(0xfff2d8, 2.4);
    sunLight.position.set(40, 30, 20);
    scene.add(sunLight);

    // холодный контровой свет: подсвечивает борт корабля, иначе корпус читается силуэтом
    const rimLight = new THREE.DirectionalLight(0x8fc4ff, 1.6);
    rimLight.position.set(-30, -10, -25);
    scene.add(rimLight);

    scene.add(new THREE.AmbientLight(0x2a3a52, 1.05));

    // свечение атмосферы планеты
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
        map: nebulaTexture('rgba(120,180,255,0.45)', 'rgba(40,90,180,0.12)'),
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
    }));
    halo.scale.set(96, 96, 1);
    halo.position.copy(planet.position);
    scene.add(halo);

    // ---------- корабль ----------
    let shipGroup = null;
    try {
        shipGroup = window.Models3D.buildShip(shell.route.ship, THREE);
    } catch (e) { shipGroup = null; }
    if (!shipGroup) return openShipFlight2D(index);

    // нормализуем размер: любой корабль вписываем в ~16 единиц
    const box = new THREE.Box3().setFromObject(shipGroup);
    const size = new THREE.Vector3();
    box.getSize(size);
    const maxSide = Math.max(size.x, size.y, size.z) || 1;
    shipGroup.scale.setScalar(16 / maxSide);
    const holder = new THREE.Group();
    holder.add(shipGroup);
    // модель строится «носом вправо» по X — доворачиваем и поднимаем к центру
    shipGroup.position.sub(new THREE.Vector3(
        (box.min.x + box.max.x) / 2 * (16 / maxSide),
        (box.min.y + box.max.y) / 2 * (16 / maxSide),
        (box.min.z + box.max.z) / 2 * (16 / maxSide)
    ));
    holder.position.set(2, 1, 0);
    scene.add(holder);

    // двигатель: два светящихся спрайта и точечный свет
    const flameTex = nebulaTexture('rgba(180,230,255,0.95)', 'rgba(70,140,255,0.35)');
    const flame = new THREE.Sprite(new THREE.SpriteMaterial({
        map: flameTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
    }));
    flame.position.set(-9, 0, 0);
    flame.scale.set(14, 9, 1);
    holder.add(flame);

    const flameCore = new THREE.Sprite(new THREE.SpriteMaterial({
        map: flameTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
    }));
    flameCore.position.set(-8.4, 0, 0);
    flameCore.scale.set(6, 4, 1);
    holder.add(flameCore);

    const engineLight = new THREE.PointLight(0x7fc4ff, 40, 60);
    engineLight.position.set(-9, 0, 0);
    holder.add(engineLight);

    // ---------- размер и анимация ----------
    let W = 880, H = 480;
    function resize() {
        W = canvas.clientWidth || 880;
        H = Math.round(W * 0.54);
        canvas.style.height = H + 'px';
        renderer.setSize(W, H, false);
        camera.aspect = W / H;
        camera.updateProjectionMatrix();
    }
    resize();
    window.addEventListener('resize', resize);

    let raf = 0, last = performance.now(), t = 0;
    function loop(now) {
        raf = requestAnimationFrame(loop);
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        t += dt;

        // звёзды уходят влево: корабль летит вправо; у каждого слоя своя скорость и мерцание
        starLayers.forEach(L => {
            L.pts.position.x -= dt * L.speed;
            if (L.pts.position.x < -L.wrap / 2) L.pts.position.x += L.wrap;
            L.pts.material.opacity = L.base * (0.94 + Math.sin(t * (1.3 + L.speed * 0.12) + L.ph) * 0.06);
        });

        // туманность еле дышит
        neb1.material.opacity = 0.85 + Math.sin(t * 0.5) * 0.08;
        neb2.material.opacity = 0.68 + Math.cos(t * 0.42) * 0.07;

        // корабль покачивается
        holder.position.y = 1 + Math.sin(t * 1.25) * 0.35;
        holder.rotation.z = Math.sin(t * 0.85) * 0.045;
        holder.rotation.y = -0.42 + Math.sin(t * 0.23) * 0.18;   // лёгкий вид в 3/4
        holder.rotation.x = Math.sin(t * 0.6 + 2) * 0.03;

        // пламя двигателя мерцает
        const flick = 0.85 + Math.random() * 0.3;
        flame.scale.set(14 * flick, 9 * flick, 1);
        flameCore.scale.set(6 * flick, 4 * flick, 1);
        engineLight.intensity = 34 * flick;

        camera.position.x = Math.sin(t * 0.25) * 1.6;
        camera.lookAt(0, 0, 0);

        renderer.render(scene, camera);
    }
    raf = requestAnimationFrame(loop);

    const close = () => {
        cancelAnimationFrame(raf);
        window.removeEventListener('resize', resize);
        renderer.dispose();
        if (shell.modal.parentNode) shell.modal.remove();
    };
    document.getElementById('sf-close').onclick = close;
    shell.modal.onclick = (e) => { if (e.target === shell.modal) close(); };
}

// Полёт аппарата в космосе: звёзды, туманность, двигатель, трасса.
// Открывается двойным кликом по кораблю на карте.
function openShipFlight2D(index) {
    const r = TRAFFIC_ROUTES[index];
    if (!r) return;
    const ship = SHIPS[r.ship] || { name: 'Аппарат', cls: '', cargo: 0 };
    const drive = (typeof DRIVES !== 'undefined' && DRIVES[ship.drive]) ? DRIVES[ship.drive] : { name: '—' };
    const st = r.state || { vx: 0, vy: 0 };
    const speedKm = Math.round(Math.hypot(st.vx || 0, st.vy || 0) / (typeof SPEED_UNIT === 'number' ? SPEED_UNIT : 7) * 1000);
    const from = (planetNodes[r.a] && planetNodes[r.a].data && planetNodes[r.a].data.name) || 'станция';
    const to = (planetNodes[r.b] && planetNodes[r.b].data && planetNodes[r.b].data.name) || 'станция';

    const old = document.getElementById('ship-flight');
    if (old) old.remove();

    const modal = document.createElement('div');
    modal.id = 'ship-flight';
    modal.style.cssText = 'position:fixed;inset:0;z-index:100060;display:flex;align-items:center;justify-content:center;' +
        'background:rgba(2,4,8,.86);padding:14px';
    modal.innerHTML =
        '<div style="position:relative;width:min(860px,96vw);border-radius:18px;overflow:hidden;' +
        'border:1px solid #1e3a5f;background:#04070d">' +
        '<canvas id="ship-flight-canvas" style="display:block;width:100%;height:auto"></canvas>' +
        '<div style="position:absolute;left:0;right:0;bottom:0;padding:14px 18px;' +
        'background:linear-gradient(rgba(4,7,13,0),rgba(4,7,13,.94));color:#dce8f7;' +
        'font:14px/1.45 Inter,system-ui,sans-serif">' +
        '<div style="display:flex;justify-content:space-between;align-items:flex-end;gap:12px;flex-wrap:wrap">' +
        '<div><b style="color:#8fd6ff;font-size:17px">' + (ship.name || 'Аппарат') + '</b>' +
        '<div style="opacity:.75;font-size:12.5px">' + (ship.cls || '') + ' · ' + (drive.name || '') + '</div></div>' +
        '<div style="text-align:right;font-size:12.5px;opacity:.85">' +
        '<div>маршрут <b style="color:#ffd05a">' + from + ' → ' + to + '</b></div>' +
        '<div>скорость <b style="color:#3ec97a">' + speedKm + ' км/с</b> · трюм ' + (ship.cargo || '—') + ' т</div>' +
        '</div></div></div>' +
        '<button id="sf-close" style="position:absolute;right:10px;top:10px;border:none;border-radius:9px;' +
        'padding:6px 12px;background:rgba(20,30,46,.85);color:#dce8f7;cursor:pointer;font-size:15px">✕</button>' +
        '</div>';
    document.body.appendChild(modal);

    const canvas = document.getElementById('ship-flight-canvas');
    const ctx = canvas.getContext('2d');
    const art = new Image();
    art.src = shipArt(r.ship);

    let W = 860, H = 460;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    function resize() {
        W = canvas.clientWidth || 860;
        H = Math.round(W * 0.54);
        canvas.width = Math.round(W * dpr);
        canvas.height = Math.round(H * dpr);
        canvas.style.height = H + 'px';
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    window.addEventListener('resize', resize);

    // звёзды: три слоя с разной скоростью — даёт параллакс
    const stars = [];
    for (let i = 0; i < 260; i++) {
        const layer = i % 3;
        stars.push({
            x: Math.random() * W, y: Math.random() * H,
            r: 0.4 + layer * 0.45 + Math.random() * 0.5,
            v: 12 + layer * 34 + Math.random() * 18,
            a: 0.35 + layer * 0.2 + Math.random() * 0.3
        });
    }
    // частицы выхлопа
    const sparks = [];
    let t = 0, raf = 0, last = performance.now();

    function draw(dt) {
        t += dt;
        // фон: глубина космоса
        const g = ctx.createLinearGradient(0, 0, W, H);
        g.addColorStop(0, '#05080f');
        g.addColorStop(0.55, '#070c18');
        g.addColorStop(1, '#0a0f1e');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);

        // туманность — два мягких пятна, медленно дышат
        const neb = ctx.createRadialGradient(W * 0.28, H * 0.3, 10, W * 0.28, H * 0.3, W * 0.5);
        neb.addColorStop(0, 'rgba(70,110,190,' + (0.10 + 0.03 * Math.sin(t * 0.7)) + ')');
        neb.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = neb;
        ctx.fillRect(0, 0, W, H);
        const neb2 = ctx.createRadialGradient(W * 0.78, H * 0.68, 10, W * 0.78, H * 0.68, W * 0.42);
        neb2.addColorStop(0, 'rgba(150,90,160,' + (0.07 + 0.02 * Math.cos(t * 0.9)) + ')');
        neb2.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = neb2;
        ctx.fillRect(0, 0, W, H);

        // звёзды летят влево — аппарат будто движется вправо
        stars.forEach(st2 => {
            st2.x -= st2.v * dt;
            if (st2.x < -4) { st2.x = W + 4; st2.y = Math.random() * H; }
            ctx.globalAlpha = st2.a;
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(st2.x, st2.y, st2.r, 0, Math.PI * 2);
            ctx.fill();
            // штрих скорости у ближних
            if (st2.v > 40) {
                ctx.globalAlpha = st2.a * 0.5;
                ctx.strokeStyle = '#cfe0ff';
                ctx.lineWidth = st2.r * 0.8;
                ctx.beginPath();
                ctx.moveTo(st2.x, st2.y);
                ctx.lineTo(st2.x + st2.v * dt * 2.2, st2.y);
                ctx.stroke();
            }
        });
        ctx.globalAlpha = 1;

        // дальняя планета снизу
        const pr = W * 0.34;
        const pg = ctx.createRadialGradient(W * 0.18, H + pr * 0.55, pr * 0.2, W * 0.18, H + pr * 0.55, pr);
        pg.addColorStop(0, 'rgba(120,165,225,0.85)');
        pg.addColorStop(0.55, 'rgba(40,78,140,0.8)');
        pg.addColorStop(1, 'rgba(4,8,16,0)');
        ctx.fillStyle = pg;
        ctx.beginPath();
        ctx.arc(W * 0.18, H + pr * 0.55, pr, 0, Math.PI * 2);
        ctx.fill();

        // аппарат
        const cx = W * 0.56, cy = H * 0.44 + Math.sin(t * 1.6) * 4;
        const size = Math.min(190, W * 0.24);
        // свечение двигателя
        const glowR = size * 0.55;
        const eg = ctx.createRadialGradient(cx - size * 0.42, cy, 2, cx - size * 0.42, cy, glowR);
        eg.addColorStop(0, 'rgba(120,200,255,0.55)');
        eg.addColorStop(0.4, 'rgba(70,140,255,0.18)');
        eg.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = eg;
        ctx.beginPath();
        ctx.arc(cx - size * 0.42, cy, glowR, 0, Math.PI * 2);
        ctx.fill();

        if (art.complete && art.naturalWidth) {
            ctx.save();
            ctx.translate(cx, cy);
            ctx.rotate(Math.PI / 2 + Math.sin(t * 0.8) * 0.03);   // «носом вправо» + лёгкий крен
            const scale = size / Math.max(art.naturalWidth, art.naturalHeight);
            ctx.drawImage(art, -art.naturalWidth * scale / 2, -art.naturalHeight * scale / 2,
                art.naturalWidth * scale, art.naturalHeight * scale);
            ctx.restore();
        } else {
            ctx.fillStyle = 'rgba(140,180,220,0.6)';
            ctx.beginPath();
            ctx.ellipse(cx, cy, size * 0.3, size * 0.12, 0, 0, Math.PI * 2);
            ctx.fill();
        }

        // штрихи скорости: короткие линии позади аппарата
        ctx.strokeStyle = 'rgba(150,190,255,0.20)';
        ctx.lineWidth = 1;
        for (let i = 0; i < 12; i++) {
            const sy = cy - size * 0.45 + (i / 11) * size * 0.9;
            const off = ((t * 260 + i * 61) % (W * 0.9));
            const sx = cx - size * 0.5 - off;
            if (sx < -40) continue;
            ctx.beginPath();
            ctx.moveTo(sx, sy);
            ctx.lineTo(sx + 34, sy);
            ctx.stroke();
        }

        // частицы выхлопа
        if (Math.random() < 0.85) {
            sparks.push({
                x: cx - size * 0.44, y: cy + (Math.random() - 0.5) * size * 0.12,
                vx: -80 - Math.random() * 120, vy: (Math.random() - 0.5) * 26,
                life: 0.5 + Math.random() * 0.5, max: 1, r: 0.8 + Math.random() * 1.6
            });
        }
        for (let i = sparks.length - 1; i >= 0; i--) {
            const p = sparks[i];
            p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
            if (p.life <= 0) { sparks.splice(i, 1); continue; }
            ctx.globalAlpha = Math.max(0, p.life);
            ctx.fillStyle = i % 3 === 0 ? '#9fd8ff' : '#4f8ef7';
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
    }

    function loop(now) {
        raf = requestAnimationFrame(loop);
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        draw(dt);
    }
    raf = requestAnimationFrame(loop);

    const close = () => {
        cancelAnimationFrame(raf);
        window.removeEventListener('resize', resize);
        modal.remove();
    };
    document.getElementById('sf-close').onclick = close;
    modal.onclick = (e) => { if (e.target === modal) close(); };
}


// старый вид карточки оставлен как данные внутри анимации
function openTrafficCard(index) {
    openShipFlight(index);
}

function stationPoint(x, y, size) {
    const d = size / 2 + STATION_DIST;
    return { x: x + Math.cos(STATION_ANGLE) * d, y: y + Math.sin(STATION_ANGLE) * d };
}

function updateTraffic(dtMs) {
    if (!trafficNodes.length || planetNodes.length < 6) return;
    const dt = Math.min(dtMs, 80) / 1000;

    TRAFFIC_ROUTES.forEach((route, i) => {
        const el = trafficNodes[i];
        const A = planetNodes[route.a], B = planetNodes[route.b];
        if (!el || !A || !B || A.x === undefined || B.x === undefined) return;

        // станции у планет: трасса идёт по дуге, чтобы не резать систему по центру
        const start = stationPoint(A.x, A.y, A.size);
        const end = stationPoint(B.x, B.y, B.size);
        const dx = end.x - start.x, dy = end.y - start.y;
        const len = Math.hypot(dx, dy) || 1;
        const nx = dy / len, ny = -dx / len;
        const midX = (start.x + end.x) / 2, midY = (start.y + end.y) / 2;
        const outward = (nx * midX + ny * midY) >= 0 ? 1 : -1;
        const bulge = Math.min(70, Math.max(10, len * 0.26)) * outward;
        const cx = midX + nx * bulge;
        const cy = midY + ny * bulge;

        if (route.progress === undefined) route.progress = 0.15;
        const durGame = Math.max(1200, Math.min(30000, len * 40));
        if (route.lastSim === undefined) route.lastSim = simulatedTime;
        const dGame = Math.max(0, simulatedTime - route.lastSim);
        route.lastSim = simulatedTime;
        route.progress += dGame / 1000 / durGame;

        if (route.progress >= 1) {
            if (!route.dockedUntil) {
                route.dockedUntil = Date.now() + 1600;
                route.progress = 1;
            } else if (Date.now() > route.dockedUntil) {
                route.a = route.b;
                route.b = (route.b + 2) % planetNodes.length;
                route.dockedUntil = 0;
                route.progress = 0;
            }
        }
        const t = Math.min(1, route.progress);
        const drawPath = route.progress < 1;
        const pEl = routePaths[i];
        if (pEl) {
            pEl.setAttribute('d', `M ${start.x.toFixed(1)} ${start.y.toFixed(1)} Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${end.x.toFixed(1)} ${end.y.toFixed(1)}`);
            pEl.style.opacity = drawPath ? '0.45' : '0';
        }
        if (route.dockedUntil && Date.now() < route.dockedUntil) {
            el.style.opacity = '0.18';
            return;
        }
        const mt = 1 - t;
        const px = mt * mt * start.x + 2 * mt * t * cx + t * t * end.x;
        const py = mt * mt * start.y + 2 * mt * t * cy + t * t * end.y;
        const tx = 2 * mt * (cx - start.x) + 2 * t * (end.x - cx);
        const ty = 2 * mt * (cy - start.y) + 2 * t * (end.y - cy);
        const heading = Math.atan2(ty, tx) * 180 / Math.PI + 90;
        if (!scenePublish('traffic-' + i, el, { x: px, y: py, ang: heading, opacity: 0.95 })) {
            legacyPose(el, px, py, heading, { opacity: 0.95 });
        }
    });
}

// =========================================================
// ГЕНЕРАТОР ДРУГИХ СИСТЕМ (2-6 планет)
// =========================================================
function hashSeed(text) {
    let h = 2166136261;
    for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
}

function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const STAR_TYPES = [
    { name: 'жёлтый карлик', color: '#ffb300' },
    { name: 'оранжевый карлик', color: '#ff8f45' },
    { name: 'красный карлик', color: '#ff5a4d' },
    { name: 'белый гигант', color: '#dfe9ff' },
    { name: 'голубой гигант', color: '#8fc8ff' }
];

const NAME_HEAD = ['Ар', 'Вел', 'Гал', 'Дор', 'Зел', 'Кас', 'Лир', 'Мор', 'Нер', 'Ор', 'Пал', 'Рин', 'Сол', 'Тар', 'Ул', 'Фер', 'Хор', 'Элл', 'Юн', 'Яр'];
const NAME_MID = ['а', 'е', 'и', 'о', 'у', 'ан', 'ен', 'ор', 'ал', 'ир'];
const NAME_TAIL = ['ис', 'он', 'ум', 'ар', 'эль', 'ай', 'ер', 'ия', 'ус', 'ат'];

function makeName(rng) {
    const head = NAME_HEAD[Math.floor(rng() * NAME_HEAD.length)];
    const mid = rng() < 0.5 ? NAME_MID[Math.floor(rng() * NAME_MID.length)] : '';
    const tail = NAME_TAIL[Math.floor(rng() * NAME_TAIL.length)];
    return head + mid + tail;
}

// Текстуры, которыми можно «одеть» сгенерированную планету.
const GEN_TEXTURES = ['mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune'];
const GEN_TINTS = ['#c9a27a', '#8fa4c8', '#a8c8a0', '#c88f8f', '#a0a0c8', '#c8c0a0'];

function generateSystem(seedText) {
    const rng = mulberry32(hashSeed(seedText));
    const starType = STAR_TYPES[Math.floor(rng() * STAR_TYPES.length)];
    const count = 2 + Math.floor(rng() * 5);           // 2..6 планет — как в задании
    const planets = [];
    let au = 0.3 + rng() * 0.5;

    for (let i = 0; i < count; i++) {
        const period = 365.25 * Math.pow(au, 1.5);      // III закон Кеплера
        const size = Math.round(9 + Math.min(45, au * 7) * (0.7 + rng() * 0.6));
        const useTexture = rng() < 0.65;
        const texIndex = Math.floor(rng() * GEN_TEXTURES.length);
        const moons = [];
        const moonCount = Math.floor(rng() * 4);        // 0..3 спутника

        for (let m = 0; m < moonCount; m++) {
            moons.push({
                name: makeName(rng),
                period: 0.8 + rng() * 30,
                epoch: Math.floor(rng() * 360),
                radius: Math.round(size * (1.5 + m * 0.55)),
                size: 3 + Math.floor(rng() * 5),
                tint: GEN_TINTS[Math.floor(rng() * GEN_TINTS.length)]
            });
        }

        planets.push({
            id: 'gen-' + i,
            name: makeName(rng),
            au: au,
            period: period,
            L0: Math.floor(rng() * 360),
            rotH: (8 + rng() * 400) * (rng() < 0.2 ? -1 : 1),
            size: size,
            texture: useTexture ? GEN_TEXTURES[texIndex] : null,
            tint: GEN_TINTS[Math.floor(rng() * GEN_TINTS.length)],
            moons: moons
        });

        au *= 1.5 + rng() * 1.3;                        // разносим орбиты
        if (au > 40) au = 40;
    }

    return {
        id: seedText,
        name: 'Система ' + seedText.toUpperCase(),
        star: { name: makeName(rng), size: 90 + Math.round(rng() * 40), color: starType.color, type: starType.name },
        planets: planets
    };
}

// Каталог: Солнце + шесть детерминированных «открытых» систем.
const SYSTEM_SEEDS = ['kepler-1', 'kepler-2', 'kepler-3', 'kepler-4', 'kepler-5', 'kepler-6'];
let currentSystem = SOL_SYSTEM;

function resolveSystem(id) {
    if (!id || id === 'sol') return SOL_SYSTEM;
    if (SYSTEM_SEEDS.indexOf(id) === -1) return SOL_SYSTEM;
    return generateSystem(id);
}

// =========================================================
// АВТОНОМНЫЕ АГЕНТЫ
// =========================================================
// У каждого агента есть добытчики и постройки на его теле. Добыча идёт только
// если есть и то, и другое: без постройки добытчик бесполезен, без добытчика
// постройка простаивает на 30 % мощности.
const NPC_AGENTS = [
    // age — сколько лет мир освоен. Земля и Пояс строятся двести лет, колонии
    // Кеплера — двадцать, поэтому стартовый капитал у них разный.
    { id: 'n1', name: 'Вольный рынок Терры', kind: 'trade', base: 'Земля · станция', spec: 'grain', age: 240, credits: 900000, ships: 12, miners: 8, buildings: 12, stock: 5000, wealth: 900000 },
    { id: 'n2', name: 'Фермерский союз', kind: 'farm', base: 'Земля · купола', spec: 'grain', age: 240, credits: 400000, ships: 7, miners: 6, buildings: 9, stock: 3500, wealth: 400000 },
    { id: 'n3', name: 'Тихая артель', kind: 'mine', base: 'Марс · полюс', spec: 'ice', age: 180, credits: 520000, ships: 9, miners: 7, buildings: 8, stock: 2800, wealth: 520000 },
    { id: 'n4', name: 'Металлисты Пояса', kind: 'industry', base: 'Пояс · Церера', spec: 'steel', age: 120, credits: 700000, ships: 11, miners: 9, buildings: 10, stock: 4200, wealth: 700000 },
    { id: 'n5', name: 'Верфи Цереры', kind: 'industry', base: 'Пояс · док', spec: 'steel', age: 120, credits: 1100000, ships: 9, miners: 6, buildings: 14, stock: 6000, wealth: 1100000 },
    { id: 'n6', name: 'Газовики Юпитера', kind: 'mine', base: 'Юпитер · скиммеры', spec: 'gas', age: 90, credits: 380000, ships: 8, miners: 6, buildings: 7, stock: 2400, wealth: 380000 },
    { id: 'p1', name: 'Красный Шкипер', kind: 'pirate', base: 'Юпитер · тень', spec: 'ice', age: 40, credits: 120000, ships: 6, miners: 2, buildings: 2, stock: 400, wealth: 120000, raids: 0 },
    // --- первые пять систем Альянса: заселены 100 лет назад, уже обжиты ---
    { id: 'a1', name: 'Колония Альфа Центавра', kind: 'industry', base: 'Альфа Центавра · орбита', spec: 'chips', age: 100, pop: 2640000000, credits: 260000, ships: 8, miners: 4, buildings: 6, stock: 2200, wealth: 260000 },
    { id: 'a2', name: 'Фермы Тау Кита', kind: 'farm', base: 'Тау Кита · купола', spec: 'grain', age: 100, pop: 729000000, credits: 210000, ships: 6, miners: 3, buildings: 5, stock: 2600, wealth: 210000 },
    { id: 'a3', name: 'Рудники Эпсилон Эридана', kind: 'mine', base: 'Эпсилон Эридана · пояс', spec: 'steel', age: 100, pop: 238000000, credits: 240000, ships: 7, miners: 5, buildings: 6, stock: 2400, wealth: 240000 },
    { id: 'a4', name: 'Верфь Глизе 581', kind: 'industry', base: 'Глизе 581 · док', spec: 'steel', age: 100, pop: 344000000, credits: 300000, ships: 8, miners: 4, buildings: 7, stock: 2800, wealth: 300000 },
    { id: 'a5', name: 'Станция TRAPPIST-1', kind: 'trade', base: 'TRAPPIST-1 · орбита', spec: 'chips', age: 100, pop: 802000000, credits: 230000, ships: 6, miners: 3, buildings: 5, stock: 1900, wealth: 230000 },

    // --- Кеплер-1: заселена больше ста лет назад, все луны и пригодные миры обжиты ---
    { id: 'k1', name: 'Первый посад Кеплер-1', kind: 'farm', base: 'Кеплер-1 · купола', spec: 'grain', age: 120, credits: 42000, ships: 2, miners: 1, buildings: 2, stock: 700, wealth: 42000 },
    { id: 'k2', name: 'Артель Кеплер-1', kind: 'mine', base: 'Кеплер-1 · шахты', spec: 'steel', age: 120, credits: 38000, ships: 2, miners: 2, buildings: 2, stock: 900, wealth: 38000 },
    { id: 'k3', name: 'Станция Кеплер-1', kind: 'trade', base: 'Кеплер-1 · орбита', spec: 'chips', age: 120, credits: 55000, ships: 3, miners: 1, buildings: 1, stock: 500, wealth: 55000 },
    { id: 'p2', name: 'Барон Колец', kind: 'pirate', base: 'Сатурн · кольца', spec: 'ice', age: 30, credits: 90000, ships: 5, miners: 2, buildings: 2, stock: 300, wealth: 90000, raids: 0 }
];

const NPC_EVENTS = [];
let npcAccum = 0;

const MINER_COST = 20000, BUILDING_COST = 50000;

function npcLog(text) {
    // одно и то же событие повторялось до восьми раз подряд — склеиваем в счётчик
    const last = NPC_EVENTS[0];
    if (last && last.text === text) {
        last.count = (last.count || 1) + 1;
        last.t = new Date().toLocaleTimeString('ru-RU');
        return;
    }
    NPC_EVENTS.unshift({ t: new Date().toLocaleTimeString('ru-RU'), text: text, count: 1 });
    if (NPC_EVENTS.length > 40) NPC_EVENTS.pop();
}

function npcStep() {
    NPC_AGENTS.forEach(n => {
        const pirate = n.kind === 'pirate';

        // 1. Добыча: постройки дают объём, добытчики — полную мощность.
        const perBuilding = pirate ? 6 : ({ trade: 8, farm: 10, mine: 9, industry: 12 }[n.kind] || 8);
        const efficiency = n.miners > 0 ? 1 : 0.3;
        const produced = Math.round(n.buildings * perBuilding * efficiency);
        n.stock += produced;

        // 2. Продажа части склада — так появляются кредиты на развитие.
        if (n.stock > 200) {
            const sold = Math.min(n.stock - 100, 200);
            n.stock -= sold;
            n.credits += sold * 18;
        }

        // 3. Развитие: сначала добытчики, потом постройки.
        if (n.credits > BUILDING_COST + 30000 && n.buildings < 9) {
            n.credits -= BUILDING_COST; n.buildings += 1;
            npcLog(n.name + ' построил добывающий комплекс (' + n.buildings + ')');
        } else if (n.credits > MINER_COST + 15000 && n.miners < n.buildings + 1) {
            n.credits -= MINER_COST; n.miners += 1;
            npcLog(n.name + ' купил добытчик (флот добытчиков ' + n.miners + ')');
        } else if (n.credits > 90000 && n.ships < 6) {
            n.credits -= 45000; n.ships += 1;
            npcLog(n.name + ' построил корабль (флот ' + n.ships + ')');
        }

        n.wealth = n.credits + n.stock * 18 + n.ships * 30000 + n.miners * 20000 + n.buildings * 50000;
    });

    // 4. Пираты живут с грабежа
    NPC_AGENTS.filter(n => n.kind === 'pirate').forEach(p => {
        const victim = NPC_AGENTS.filter(n => n.kind !== 'pirate')
            .sort((a, b) => b.wealth - a.wealth)[0];
        if (!victim) return;
        if (p.ships >= Math.ceil(victim.ships * 0.6)) {
            const loot = Math.round(victim.credits * (0.2 + Math.random() * 0.15));
            victim.credits -= loot;
            victim.wealth = victim.credits + victim.stock * 18 + victim.ships * 30000;
            p.credits += loot;
            p.raids += 1;
            p.looted = (p.looted || 0) + loot;
            npcLog(p.name + ' ограбил ' + victim.name + ' на ' + loot.toLocaleString() + ' кр');
        } else {
            p.ships = Math.max(1, p.ships - 1);
            npcLog(p.name + ' не смог взять ' + victim.name + ' и потерял корабль');
        }
    });
}

// Рост населения: раз в игровой год, по экспоненте, с потолком по типу мира.
const POP_CAPS = { earthlike: 12e9, marslike: 6e9, station: 1.5e9 };
const POP_RATE = 0.02;            // базовый прирост 2 % в год
let popYearAccum = 0;

function popCapFor(n) {
    if (n.kind === 'pirate') return POP_CAPS.station;
    if (n.pop && n.pop > 2e9) return POP_CAPS.earthlike;
    if (/Марс|Кеплер/.test(n.base)) return POP_CAPS.marslike;
    if (/орбита|станц|док|тень|кольц/i.test(n.base)) return POP_CAPS.station;
    return POP_CAPS.earthlike;
}

// Топливо: каждый борт NPC тратит тяжёлую воду, нехватка бьёт по доходу.
const FUEL_PER_SHIP = 0.02;        // т тяжёлой воды на борт в сутки

// Ремонт: агенты тратят запчасти, чтобы держать технику в строю.
const PARTS_PER_SHIP = 0.05;

// Потребление: население агентов ест и пьёт со склада.
// Не хватило — мир голодает, рост населения останавливается.
const FOOD_PER_PERSON = 0.0022;    // т в сутки
const WATER_PER_PERSON = 0.008;    // т в сутки
const GOODS_PER_PERSON = 0.000008; // т ширпотреба в сутки

// Промышленность агента зависит от возраста мира: чем старше, тем больше
// фабрик. Земля и Пояс тянут полный цикл, молодая колония — почти ничего.
const INDUSTRY_BY_AGE = [
    { minAge: 150, printers: 4, equipment: 3 },
    { minAge: 90,  printers: 3, equipment: 2 },
    { minAge: 40,  printers: 2, equipment: 1 },
    { minAge: 0,   printers: 1, equipment: 1 }
];

function agentIndustry(n) {
    const row = INDUSTRY_BY_AGE.find(r => (n.age || 0) >= r.minAge) || INDUSTRY_BY_AGE[3];
    // пираты почти ничего не производят
    if (n.kind === 'pirate') return { printers: 1, equipment: 0 };
    return row;
}

function tickConsumption(days) {
    if (typeof NPC_AGENTS === 'undefined') return;
    NPC_AGENTS.forEach(n => {
        if (!n.pop) { n.starving = false; return; }
        const food = n.pop * FOOD_PER_PERSON * days;
        const water = n.pop * WATER_PER_PERSON * days;
        const goods = n.pop * GOODS_PER_PERSON * days;
        // фабрики печати покрывают ширпотреб сами, если они есть
        const ind = agentIndustry(n);
        const goodsSelf = ind.printers > 0 ? goods : 0;
        const need = Math.round(food + water + (goods - goodsSelf));
        if (n.stock >= need) {
            n.stock -= need;
            n.starving = false;
        } else {
            const lack = need - n.stock;
            n.stock = 0;
            n.starving = true;
            n.credits = Math.max(0, n.credits - lack * 40);
        }
    });
}

// Прибытие наёмных: по истечении срока люди становятся гражданами
// и сразу начинают есть.
function tickHiring() {
    if (!window.HIRING_QUEUE || !window.HIRING_QUEUE.length) return;
    const now = Date.now();
    const left = [];
    window.HIRING_QUEUE.forEach(q => {
        if (now >= q.at) {
            window.COLONY_POP = (window.COLONY_POP || 0) + q.count;
            currentUser.colonyPop = window.COLONY_POP;
            notify('Прибыли колонисты: ' + q.count + ' · всего ' + window.COLONY_POP.toLocaleString());
        } else left.push(q);
    });
    window.HIRING_QUEUE = left;

    // граждане потребляют: еда и вода списываются со склада игрока
    if (window.COLONY_POP > 0 && window.__hiringTick !== Math.floor(now / 30000)) {
        window.__hiringTick = Math.floor(now / 30000);
        const food = Math.round(window.COLONY_POP * 0.0022 * 30);
        const water = Math.round(window.COLONY_POP * 0.008 * 30);
        currentUser.resources.grain = Math.max(0, (currentUser.resources.grain || 0) - food);
        currentUser.resources.water = Math.max(0, (currentUser.resources.water || 0) - water);
        window.COLONY_HUNGRY = (currentUser.resources.grain <= 0 || currentUser.resources.water <= 0);
    }
}

function tickRepairs(days) {
    if (typeof NPC_AGENTS === 'undefined') return;
    NPC_AGENTS.forEach(n => {
        const need = Math.max(1, Math.round(n.ships * PARTS_PER_SHIP * days));
        const have = typeof n.parts === 'number' ? n.parts : 20;
        n.parts = Math.max(0, have - need);
        if (n.parts === 0 && (n.damage || 0) < 60) {
            n.damage = Math.min(100, (n.damage || 0) + 5);
        }
    });
}

function tickFleetFuel(days) {
    if (typeof NPC_AGENTS === 'undefined') return;
    NPC_AGENTS.forEach(n => {
        if (!n.ships) return;
        const need = n.ships * FUEL_PER_SHIP * days;
        // у агента нет отдельного топлива — считаем через склад
        if (n.stock >= need * 10) {
            n.stock -= Math.round(need * 10);
        } else {
            n.credits = Math.max(0, Math.round(n.credits * 0.995));
        }
    });
}

// Обеспеченность мира: если еды, воды или ширпотреба не хватает —
// население растёт медленнее или останавливается.
function supplyCoverage(good) {
    let need = 0, have = 0;
    WORLDS.forEach(w => {
        const pop = w.pop || 0;
        const perHead = { grain: 0.0022, water: 0.008, consumer: 0.000008 }[good] || 0;
        need += pop * perHead;
        have += (w.produces && w.produces[good]) || 0;
    });
    if (need <= 0) return 100;
    return Math.min(200, Math.round(have / need * 100));
}

// Клонирование: если еды в достатке и есть комплекс — рождаемость выше.
function cloneBonus() {
    const have = (currentUser && currentUser.cloners) || 0;
    if (have <= 0) return 0;
    const food = supplyCoverage('grain');
    if (food < 110) return 0;
    return Math.min(0.02, 0.005 * have);
}

function growthFactor() {
    const food = supplyCoverage('grain');
    const water = supplyCoverage('water');
    const goods = supplyCoverage('consumer');
    const worst = Math.min(food, water, goods);
    if (worst >= 90) return 1;
    if (worst >= 50) return 0.5;
    return 0.1;
}

function tickPopulation(gameYears) {
    if (typeof NPC_AGENTS === 'undefined') return;
    NPC_AGENTS.forEach(n => {
        if (!n.pop) return;
        const cap = popCapFor(n);
        if (n.starving) return;
        const g = growthFactor();
        n.pop = Math.min(cap, Math.round(n.pop * Math.pow(1 + POP_RATE * g + cloneBonus(), gameYears)));

        // болезни: без медицинских модулей население убывает
        if (window.__health) {
            const raceKey = /Марс|Кеплер/.test(n.base) ? 'mars' : (/Пояс|Церера|орбита|станц|тень|кольц/i.test(n.base) ? 'belt' : 'earth');
            const coverage = n.age >= 150 ? 0.6 : (n.age >= 90 ? 0.4 : 0.15);
            const need = window.__health.modulesNeeded(n.pop);
            const have = Math.round(need * coverage);
            const died = window.__health.deaths(n.pop, have, raceKey);
            n.pop = Math.max(1000, n.pop - Math.round(died * gameYears));
        }
    });
}

function tickNpcs(dtMs) {
    // шаг NPC привязан к скорости времени: при 1x и паузе колонии не развиваются
    if (typeof timeScale === 'number' && timeScale <= 0) return;
    npcAccum += dtMs * Math.min(Math.max(timeScale, 0.0001), 3600);
    while (npcAccum >= 10000) { npcAccum -= 10000; npcStep(); }
}

function npcOutput(n) {
    const perBuilding = n.kind === 'pirate' ? 6 : ({ trade: 8, farm: 10, mine: 9, industry: 12 }[n.kind] || 8);
    return Math.round(n.buildings * perBuilding * (n.miners > 0 ? 1 : 0.3));
}

function renderNpcs() {
    const body = document.getElementById('npc-body');
    if (!body) return;
    const maxWealth = Math.max.apply(null, NPC_AGENTS.map(n => n.wealth));
    const sorted = NPC_AGENTS.slice().sort((a, b) => b.wealth - a.wealth);

    const cards = sorted.map(n => {
        const pirate = n.kind === 'pirate';
        const buildings = Array.from({ length: Math.min(n.buildings, 16) }, () => '<i class="bl"></i>').join('');
        const wealthPct = Math.round(n.wealth / maxWealth * 100);
        return `<div class="npc-card ${pirate ? 'pirate' : ''}">
            <div class="npc-head"><b>${n.name}</b><span>${n.base} · ${n.age} лет</span></div>
            <div class="npc-visual">
                <div class="npc-bld" title="постройки: ${n.buildings}">${buildings}<em>${n.buildings}</em></div>
                <div class="npc-units">
                    <span title="добытчики">⛏ ${n.miners}</span>
                    <span title="корабли">🚀 ${n.ships}</span>
                    <span title="склад">📦 ${n.stock.toLocaleString()}</span>
                </div>
            </div>
            <div class="npc-bar"><b style="width:${wealthPct}%"></b></div>
            <div class="npc-foot">
                <span>${n.wealth.toLocaleString()} кр</span>
                <span>выпуск ${npcOutput(n)}/шаг</span>
                <span>${n.state === 'tug' ? '⚠ на буксире' : (n.damage ? 'повреждён ' + n.damage + '%' : (pirate ? 'налётов ' + n.raids + ' · наглость ' + Math.round((n.looted || 0) / Math.max(1, NPC_AGENTS.filter(x => x.kind !== 'pirate').reduce((s, x) => s + x.wealth, 0)) * 100) + '%' : ({ trade: 'торговля', farm: 'фермы', mine: 'добыча', industry: 'заводы' }[n.kind] || '')))}</span>
            </div>
        </div>`;
    }).join('');

    const log = NPC_EVENTS.slice(0, 8).map(e => `<div class="npc-event"><span>${e.t}</span> ${e.text}</div>`).join('') || '<div class="npc-event">событий пока нет</div>';
    const wreckLine = WRECKS.length
        ? `<div class="wreck-line">В космосе обломки: <b>${WRECKS.length}</b> · ${WRECKS.reduce((s, w) => s + w.mass, 0)} т сырья</div>`
        : '';
    body.innerHTML = `<div class="npc-cards">${cards}</div>${wreckLine}
        <h3 class="npc-log-title">Сводка событий</h3><div class="npc-log">${log}</div>`;
}

window.openNpc = () => {
    let modal = document.getElementById('npc-modal');
    if (!modal) {
        document.body.insertAdjacentHTML('beforeend',
            '<div id="npc-modal" class="npc-modal"><div class="npc-modal-content">' +
            '<span class="close-btn" onclick="closeNpc()">&times;</span>' +
            '<h2>🛰 Разведсводка</h2><div id="npc-body"></div></div></div>');
        modal = document.getElementById('npc-modal');
    }
    modal.style.display = 'flex';
    renderNpcs();
};
window.closeNpc = () => { const m = document.getElementById('npc-modal'); if (m) m.style.display = 'none'; };

function buildNpcUI() {
    const items = document.getElementById('left-menu-items');
    if (items && !document.getElementById('npc-btn')) {
        const btn = document.createElement('button');
        btn.id = 'npc-btn';
        btn.className = 'menu-btn';
        btn.textContent = '🛰 Разведсводка';
        btn.addEventListener('click', window.openNpc);
        items.appendChild(btn);
    }
}

// =========================================================
// НАСЕЛЕНИЕ И БИРЖА
// =========================================================
// Спрос и предложение выводятся из населения и профиля миров, цена считается
// от их отношения: price = base * (demand/supply)^0.6, в коридоре 0.4..3.
const WORLDS = [
    { id: 'earth', name: 'Земля', pop: 12000000000,
      produces: { grain: 1, meat: 1, fish: 1, spice: 0.6, water: 0.8, oil: 1, gas: 1, polymer: 1, kerosene: 1 },
      needs: { steel: 1, copper: 1, nickel: 1, quartz: 0.8, chips: 0.9, heavy: 0.5 } },
    { id: 'mars', name: 'Марс', pop: 4000000000,
      produces: { water: 0.3, gas: 0.7, heavy: 1, steel: 0.6, quartz: 0.7 },
      needs: { water: 1, grain: 1, meat: 0.8, polymer: 1, chips: 1, ice: 0.6, food: 1 } },
    { id: 'belt', name: 'Пояс', pop: 1000000000,
      produces: { steel: 1, copper: 1, nickel: 1, silver: 1, gold: 1, chondrite: 1, quartz: 0.8 },
      needs: { grain: 1, water: 0.8, chips: 0.6, kerosene: 0.8, polymer: 0.7 } }
];
window.WORLDS = WORLDS;


// Логистика: вся торговля мира идёт через его орбитальный узел, а не с поверхности.
// Земля — через Луну (там биржа), Марс — через Фобос и Деймос, Пояс — через Цереру
// и другие крупные астероиды. Лифт медленный: атмосфера не даёт разгоняться.
const LOGISTICS = {
    earth: { hub: 'Луна', elevatorKm: 400, elevatorSpeed: 300, hubDistKm: 384400, note: 'подъём с поверхности 1.3 ч, затем перелёт до Луны' },
    mars: { hub: 'Фобос', elevatorKm: 180, elevatorSpeed: 260, hubDistKm: 9376000, note: 'разрежённая атмосфера: 0.7 ч до Фобоса' },
    belt: { hub: 'Церера', elevatorKm: 0, elevatorSpeed: 0, hubDistKm: 414000000, note: 'гравитация минимальна — лифт не нужен, стыковка напрямую' }
};

// Время «поверхность → узел» в часах: только лифт, без полёта.
function elevatorHours(worldId) {
    const L = LOGISTICS[worldId];
    if (!L || !L.elevatorKm) return 0;
    return L.elevatorKm / L.elevatorSpeed;
}

// Врата Атлантов стоят на орбите Урана (19.2 а.е.). Путь до них считается по той
// же формуле, а сам переход между системами мгновенный: кольцо складывает
// пространство, а не разгоняет корабль.
const PORTAL_AU = 19.2;
const AU_KM = 149597870.7;
const WORLD_AU = { earth: 1.0, mars: 1.52, belt: 2.77 };

function portalTravelHours(worldId) {
    const fromAu = WORLD_AU[worldId] || 1.0;
    const km = Math.abs(PORTAL_AU - fromAu) * AU_KM;
    return brachistochrone(km, TRAVEL_PROFILES.cruise.accel).seconds / 3600;
}

// Путь до портала в другой системе: от её узла до внешнего края (по аналогии).
function systemPortalHours(outerAu) {
    const km = Math.max(0.2, Math.abs(outerAu - 1.0)) * AU_KM;
    return brachistochrone(km, TRAVEL_PROFILES.cruise.accel).seconds / 3600;
}

// Полная доставка между мирами: лифт вверх + перелёт узел-узел + лифт вниз.
function cargoDeliveryHours(fromId, toId) {
    const a = LOGISTICS[fromId], b = LOGISTICS[toId];
    if (!a || !b || fromId === toId) return null;
    const distKm = Math.abs(a.hubDistKm - b.hubDistKm) || 5000000;
    const flight = brachistochrone(distKm, TRAVEL_PROFILES.cruise.accel).seconds / 3600;
    return { flight: flight, elevators: elevatorHours(fromId) + elevatorHours(toId), total: flight + elevatorHours(fromId) + elevatorHours(toId) };
}

// Луны газовых гигантов: люди и роботы живут, работают и требуют снабжения.
// Каждая луна — отдельный рынок: еда, вода, запчасти, топливо.
const MOON_ECONOMY = [
    { id: 'io', name: 'Ио', pop: 4000000, needs: { grain: 1, water: 1, parts: 0.9, ice: 0.4 }, produces: { gas: 1, heavy: 0.6 } },
    { id: 'europa', name: 'Европа', pop: 12000000, needs: { grain: 1, parts: 1, chips: 0.4 }, produces: { ice: 1, water: 1, gas: 0.3 } },
    { id: 'ganymede', name: 'Ганимед', pop: 18000000, needs: { grain: 1, water: 1, parts: 1, chips: 0.6 }, produces: { steel: 0.7, ice: 0.8, gas: 0.4 } },
    { id: 'callisto', name: 'Каллисто', pop: 9000000, needs: { grain: 0.9, water: 0.8, parts: 0.8 }, produces: { ice: 1, steel: 0.5 } },
    { id: 'titan', name: 'Титан', pop: 22000000, needs: { grain: 1, water: 1, parts: 1, chips: 0.7 }, produces: { gas: 1, polymer: 0.8, oil: 0.9 } },
    { id: 'enceladus', name: 'Энцелад', pop: 5000000, needs: { grain: 0.8, parts: 0.7 }, produces: { ice: 1, water: 1 } },
    { id: 'rhea', name: 'Рея', pop: 3000000, needs: { grain: 0.7, water: 0.7, parts: 0.6 }, produces: { ice: 0.9 } },
    { id: 'iapet', name: 'Япет', pop: 2000000, needs: { grain: 0.6, water: 0.6, parts: 0.5 }, produces: { ice: 0.7, steel: 0.4 } },
    { id: 'triton', name: 'Тритон', pop: 6000000, needs: { grain: 0.8, water: 0.8, parts: 0.7 }, produces: { ice: 1, gas: 0.6 } },
    { id: 'titania', name: 'Титания', pop: 4000000, needs: { grain: 0.7, water: 0.7, parts: 0.6 }, produces: { ice: 0.8, steel: 0.3 } }
];

// луны входят в общий рынок наравне с планетами
if (typeof MOON_ECONOMY !== 'undefined') {
    MOON_ECONOMY.forEach(m => {
        if (!WORLDS.find(w => w.id === m.id)) WORLDS.push({ id: m.id, name: m.name, pop: m.pop, needs: m.needs, produces: m.produces });
    });
}

// В системах Кеплер-1..5 тоже есть газовые гиганты — и на их лунах живут люди.
// Каждая луна даёт газ и лёд, но требует еду, воду и запчасти.
const KEPLER_GIANTS = [
    { sys: 'kepler1', giant: 'Кеплер-1 b', moons: [
        { id: 'k1m1', name: 'Кеплер-1 · Луна I', pop: 3000000, needs: { grain: 0.8, water: 0.8, parts: 0.6 }, produces: { gas: 0.9, ice: 0.7 } },
        { id: 'k1m2', name: 'Кеплер-1 · Луна II', pop: 2000000, needs: { grain: 0.6, parts: 0.5 }, produces: { ice: 0.8 } }
    ] },
    { sys: 'kepler2', giant: 'Кеплер-2 c', moons: [
        { id: 'k2m1', name: 'Кеплер-2 · Луна I', pop: 5000000, needs: { grain: 0.9, water: 0.9, parts: 0.7 }, produces: { gas: 1, ice: 0.6 } },
        { id: 'k2m2', name: 'Кеплер-2 · Луна II', pop: 3000000, needs: { grain: 0.7, water: 0.6, parts: 0.6 }, produces: { ice: 0.9, steel: 0.4 } }
    ] },
    { sys: 'kepler3', giant: 'Кеплер-3 d', moons: [
        { id: 'k3m1', name: 'Кеплер-3 · Луна I', pop: 4000000, needs: { grain: 0.8, water: 0.7, parts: 0.7 }, produces: { gas: 0.8, ice: 0.8 } }
    ] },
    { sys: 'kepler4', giant: 'Кеплер-4 b', moons: [
        { id: 'k4m1', name: 'Кеплер-4 · Луна I', pop: 6000000, needs: { grain: 1, water: 1, parts: 0.8 }, produces: { gas: 1, heavy: 0.5 } },
        { id: 'k4m2', name: 'Кеплер-4 · Луна II', pop: 2000000, needs: { grain: 0.6, parts: 0.5 }, produces: { ice: 0.7 } }
    ] },
    { sys: 'kepler5', giant: 'Кеплер-5 b', moons: [
        { id: 'k5m1', name: 'Кеплер-5 · Луна I', pop: 7000000, needs: { grain: 1, water: 0.9, parts: 0.8 }, produces: { gas: 1, ice: 0.5, polymer: 0.4 } },
        { id: 'k5m2', name: 'Кеплер-5 · Луна II', pop: 3000000, needs: { grain: 0.7, water: 0.7, parts: 0.6 }, produces: { ice: 0.9 } }
    ] }
];

const MARKET_GOODS = ['water', 'grain', 'meat', 'steel', 'copper', 'nickel', 'quartz', 'chips', 'polymer', 'kerosene', 'heavy', 'ice'];

// У каждого мира своя биржа, а значит и своя цена: спрос и предложение
// считаются по профилю этого мира, а не по сумме всех.
let marketWorld = 'earth';

function marketIndex(good) {
    const w = WORLDS.find(x => x.id === marketWorld) || WORLDS[0];
    const demand = (w.needs[good] || 0);
    const supply = (w.produces[good] || 0);
    if (window.__econ) return window.__econ.marketIndex(good, [w]);
    return { demand: demand, supply: supply, ratio: demand / Math.max(supply, 0.15) };
}

// Цены не стоят: каждые 15 секунд они уходят случайным шагом, поэтому
// выгодно ловить момент, а не покупать всегда по одной цене.
const PRICE_DRIFT = {};
let priceAccum = 0;

function tickPrices(dtMs) {
    priceAccum += dtMs;
    while (priceAccum >= 15000) {
        priceAccum -= 15000;
        WORLDS.forEach(w => MARKET_GOODS.forEach(g => {
            const k = w.id + ':' + g;
            const cur = PRICE_DRIFT[k] === undefined ? 1 : PRICE_DRIFT[k];
            PRICE_DRIFT[k] = Math.max(0.5, Math.min(2, cur + (Math.random() - 0.5) * 0.09));
        }));
    }
}

function priceDrift(good) { return PRICE_DRIFT[marketWorld + ':' + good] || 1; }

function marketPrice(good) {
    const base = RESOURCES[good] ? RESOURCES[good].price : 50;
    const mi = marketIndex(good);
    const drift = priceDrift(good);
    if (window.__econ) {
        const p = window.__econ.priceOf(base, mi.ratio, drift);
        return { price: p, factor: (window.__econ.priceFactor(mi.ratio) * drift), demand: mi.demand, supply: mi.supply };
    }
    const factor = Math.max(0.4, Math.min(3, Math.pow(mi.ratio, 0.6)));
    return { price: Math.max(1, Math.round(base * factor * drift)), factor: factor * drift, demand: mi.demand, supply: mi.supply };
}

function renderMarket() {
    const body = document.getElementById('market-body');
    if (!body || !currentUser) return;
    ensureFleet(currentUser);
    // Подтягиваем настоящие цены NPC-биржи: иначе в таблице одна цена,
    // а списывается другая.
    if (!window.__npcPrices) {
        fetch('/api/npcmarket/quote').then(function (r) { return r.json(); }).then(function (res) {
            window.__npcPrices = (res && res.prices) || {};
            renderMarket();
        }).catch(function () { window.__npcPrices = {}; });
    }
    const rows = MARKET_GOODS.map(id => {
        const info = RESOURCES[id];
        const npc = (window.__npcPrices || {})[id];
        const p = npc ? { price: npc.buy, factor: 1 } : marketPrice(id);
        const owned = currentUser.resources[id] || 0;
        const trend = p.factor > 1.15 ? 'дефицит ↑' : p.factor < 0.85 ? 'избыток ↓' : 'ровно';
        const cls = p.factor > 1.15 ? 'def' : p.factor < 0.85 ? 'sur' : '';
        return `<tr>
            <td>${info.icon ? info.icon + ' ' : ''}${info.name}</td>
            <td class="num ${cls}">${Number(p.price).toFixed(2)}</td>
            <td>${trend}</td>
            <td class="num">${owned.toLocaleString()}</td>
            <td class="mkt-act">
                <button onclick="marketBuy('${id}')">+10</button>
                <button onclick="marketSell('${id}')">−10</button>
            </td></tr>`;
    }).join('');

    // Только обитаемые миры: у лун без населения было «0.0 млрд» и список растягивался.
    // «0.0 млрд» у лун заменяем на миллионы: 12 млн читается лучше, чем 0.0 млрд
    const fmtPop = (v) => (v >= 1e9 ? (v / 1e9).toFixed(1) + ' млрд' : Math.round(v / 1e6) + ' млн');
    const pop = WORLDS.filter(w => (w.pop || 0) >= 1e6)
        .map(w => `<span>${w.name}: <b>${fmtPop(w.pop)}</b></span>`).join('');
    const routes = ['earth', 'mars', 'belt'].map(w => {
        const L = LOGISTICS[w];
        const lift = elevatorHours(w);
        return `<div class="route-row"><span>${WORLDS.find(x => x.id === w).name} → ${L.hub}</span>` +
            `<b>${lift > 0 ? lift.toFixed(1) + ' ч лифт' : 'без лифта'}</b><i>${L.note}</i></div>`;
    }).join('');
    const portalRows = ['earth', 'mars', 'belt'].map(w => {
        const h = portalTravelHours(w);
        return `<div class="route-row"><span>${WORLDS.find(x => x.id === w).name} → Врата</span>` +
            `<b>${h < 24 ? h.toFixed(1) + ' ч' : (h / 24).toFixed(1) + ' сут'}</b><i>переход в другую систему — мгновенно</i></div>`;
    }).join('');
    // Биржа стоит на луне мира-владельца. У миров без биржи подпись раньше была
    // «undefined» — теперь показываем только те, где торговать реально можно.
    const EXCHANGES = { earth: 'Луна', mars: 'Фобос', belt: 'Церера' };
    const hubOf = (w) => {
        if (EXCHANGES[w.id]) return EXCHANGES[w.id];
        const L = LOGISTICS[w.id];
        return (L && L.hub) ? L.hub : null;
    };
    const tradeWorlds = WORLDS.filter(w => hubOf(w));
    const tabs = tradeWorlds.map(w =>
        `<button class="mkt-tab ${w.id === marketWorld ? 'active' : ''}" ` +
        `onclick="setMarketWorld('${w.id}')">${w.name} · ${hubOf(w)}</button>`).join('');
    const arts = (currentUser.artifacts || []).map((a, i) =>
        `<div class="mkt-art"><span><b>${a.name}</b> · ${a.kind}</span>
         <button class="auth-btn" style="width:auto;padding:4px 10px;margin:0" onclick="sellArtifact(${i})">Продать за ${a.crystals} крст</button></div>`
    ).join('') || '<div class="mkt-art muted">артефактов нет — ищите по адресам на карте</div>';
    const artifactsBlock = `<h3 class="npc-log-title">Артефакты предыдущих цивилизаций</h3><div class="mkt-arts">${arts}</div>`;
    body.innerHTML = `<div class="mkt-tabs">${tabs}</div>
        <div class="mkt-summary">${pop}</div>
        <div class="mkt-summary" style="justify-content:flex-end">кредиты: <b style="margin-left:6px">${Math.round(currentUser.credits).toLocaleString('ru-RU')}</b></div>
        <div class="mkt-hub">Все биржи стоят на лунах: низкая гравитация и дешёвая перевалка груза</div>
        <div class="route-table">${routes}</div>
        <div class="mkt-hub">До Врат Атлантов — по брахистохроне, прыжок между системами мгновенный</div>
        <div class="route-table">${portalRows}</div>
        ${artifactsBlock}
        <table class="mkt-table"><thead><tr><th>Товар</th><th>Цена</th><th>Рынок</th><th>У вас</th><th></th></tr></thead><tbody>${rows}</tbody></table>`;
}

window.openMarket = () => {
    let modal = document.getElementById('market-modal');
    if (!modal) {
        document.body.insertAdjacentHTML('beforeend',
            '<div id="market-modal" class="market-modal"><div class="market-modal-content">' +
            '<span class="close-btn" onclick="closeMarket()">&times;</span>' +
            '<h2>📈 Биржа</h2><div id="market-body"></div></div></div>');
        modal = document.getElementById('market-modal');
    }
    modal.style.display = 'flex';
    renderMarket();
};
window.closeMarket = () => { const m = document.getElementById('market-modal'); if (m) m.style.display = 'none'; };

// =========================================================
// РАЗДЕЛЫ МЕНЮ
// =========================================================
// Кнопки создаются разными модулями по одной; здесь они раскладываются
// по разделам: игра, экономика, гильдия, администратор.
const MENU_SECTIONS = [
    // всё игровое — в одной группе
    { title: 'Игра', open: true, items: ['Колония', 'Луны', 'Мегапроекты', 'Стройка', 'Постройки', 'Аренда',
        'Флот', 'Ресурсы', 'Карта', 'Миры', 'Системы', 'Поверхность', 'Разведсводка', 'Авария'] },
    { title: 'Развитие', items: ['Задания', 'Квесты', 'История', 'Справочник', 'Энциклопедия', 'Рейтинг', 'Звания'] },
    { title: 'Торговля', items: ['Рынок', 'Биржа', 'Чёрный рынок', 'Купить кристаллы'] },
    { title: 'Наука', items: ['Наука'] },
    { title: 'Общение', items: ['Чат', 'Общий чат', 'Гильдия', 'Пожелания'] },
    { title: 'Система', items: ['Настройки', 'Статистика', 'Админка', 'Монитор'] }
];

// Переключатель слоя станций: на общем плане станции и лифты выглядят
// как крапинки, поэтому их можно скрыть одним движением.
function addStationToggle() {
    const panel = document.querySelector('.view-panel');
    if (!panel || panel.querySelector('#station-toggle')) return;
    const row = document.createElement('div');
    row.className = 'station-toggle-row';
    row.innerHTML = '<label><input type="checkbox" id="station-toggle" checked> Станции и лифты</label>';
    const input = row.querySelector('input');
    input.addEventListener('change', () => {
        document.body.classList.toggle('hide-stations', !input.checked);
        try { localStorage.setItem('gm_hide_stations', input.checked ? '0' : '1'); } catch (e) {}
    });
    let saved = '0';
    try { saved = localStorage.getItem('gm_hide_stations') || '0'; } catch (e) {}
    if (saved === '1') { input.checked = false; document.body.classList.add('hide-stations'); }
    panel.appendChild(row);

    // ФИЛЬТР ФЛОТА: раскрывается — свои / все / транспорт / грузовые / истребители
    const row2 = document.createElement('div');
    row2.className = 'station-toggle-row fleet-filter';
    row2.innerHTML =
        '<label><input type="checkbox" id="fleet-routes-toggle" checked> Маршруты флотов</label>' +
        '<button type="button" class="flt-expand" title="Развернуть">▸</button>' +
        '<div class="flt-sub" style="display:none">' +
          '<label><input type="checkbox" data-flt="own" checked> Свои</label>' +
          '<label><input type="checkbox" data-flt="npc" checked> Все</label>' +
          '<label><input type="checkbox" data-flt="trade" checked> Торговые</label>' +
          '<label><input type="checkbox" data-flt="freight" checked> Грузовые</label>' +
          '<label><input type="checkbox" data-flt="fighter" checked> Истребители</label>' +
        '</div>';
    const input2 = row2.querySelector('#fleet-routes-toggle');
    input2.addEventListener('change', () => {
        const hide = !input2.checked;
        document.body.classList.toggle('hide-fleet-routes', hide);
        // прячем и линии маршрутов (SVG), и «хвосты» бортов
        document.querySelectorAll('.traffic-paths, .trade-paths, .route-line, .traffic-path, .trade-path')
            .forEach(function (el) { el.style.display = hide ? 'none' : ''; });
        try { localStorage.setItem('gm_hide_fleet_routes_v2', input2.checked ? '0' : '1'); } catch (e) {}
    });
    // по умолчанию маршруты ПОКАЗАНЫ (галочка стоит)
    let saved2 = '0';
    try { saved2 = localStorage.getItem('gm_hide_fleet_routes_v2') || '0'; } catch (e) {}
    input2.checked = saved2 !== '1';
    document.body.classList.toggle('hide-fleet-routes', saved2 === '1');

    const expand = row2.querySelector('.flt-expand');
    const sub = row2.querySelector('.flt-sub');
    expand.addEventListener('click', () => {
        const open = sub.style.display === 'none';
        sub.style.display = open ? 'flex' : 'none';
        expand.textContent = open ? '▾' : '▸';
    });
    row2.querySelectorAll('[data-flt]').forEach(cb => {
        const key = cb.getAttribute('data-flt');
        let saved = '0';
        try { saved = localStorage.getItem('gm_flt_' + key) || '0'; } catch (e) {}
        if (saved === '1') { cb.checked = false; document.body.classList.add('hide-flt-' + key); }
        cb.addEventListener('change', () => {
            document.body.classList.toggle('hide-flt-' + key, !cb.checked);
            try { localStorage.setItem('gm_flt_' + key, cb.checked ? '0' : '1'); } catch (e) {}
        });
    });
    panel.insertBefore(row2, panel.firstChild);

    // верхний уровень: смотреть все маршруты или только свои
    const row3 = document.createElement('div');
    row3.className = 'station-toggle-row';
    row3.innerHTML =
        '<label><input type="checkbox" id="routes-all" checked> Все маршруты</label>' +
        '<label style="margin-left:10px;"><input type="checkbox" id="routes-own"> Только свои</label>';
    const allCb = row3.querySelector('#routes-all');
    const ownCb = row3.querySelector('#routes-own');
    function applyRoutesScope() {
        const onlyOwn = ownCb.checked;
        allCb.checked = !onlyOwn;
        document.body.classList.toggle('only-own-routes', onlyOwn);
        try { localStorage.setItem('gm_routes_own', onlyOwn ? '1' : '0'); } catch (e) {}
    }
    allCb.addEventListener('change', function () { if (allCb.checked) ownCb.checked = false; applyRoutesScope(); });
    ownCb.addEventListener('change', function () { if (ownCb.checked) allCb.checked = false; applyRoutesScope(); });
    try { ownCb.checked = (localStorage.getItem('gm_routes_own') === '1'); } catch (e) {}
    allCb.checked = !ownCb.checked;
    applyRoutesScope();
    panel.insertBefore(row3, panel.firstChild);
}

// Язык интерфейса из профиля: подписи меню берутся из словаря.
const MENU_KEY_BY_RU = {
    'Биржа': 'market', 'Чёрный рынок': 'black_market', 'Наука': 'science', 'Постройки': 'buildings',
    'Чат': 'chat', 'Гильдия': 'guild', 'Админка': 'admin', 'Монитор': 'monitor',
    'История': 'history', 'Квесты': 'quests', 'Справочник': 'codex', 'Флот': 'fleet',
    'Ресурсы': 'resources', 'Системы': 'systems', 'Разведсводка': 'intel',
    'Поверхность': 'surface', 'Карта': 'map', 'Энциклопедия': 'encyclopedia'
};

window.setUserLang = (lang) => {
    if (!currentUser) return;
    currentUser.lang = lang;
    if (window.__i18n) window.__i18n.setLang(lang);
    saveUser();
    applyLanguage();
    renderDock();
    notify('Язык интерфейса: ' + ({ ru: 'русский', en: 'English', zh: '中文' }[lang] || lang));
    if (document.getElementById('enc-modal')) {
        const m = document.getElementById('enc-modal');
        if (m && m.style.display === 'flex') { try { window.openEncyclopedia('ships'); } catch (e) {} }
    }
};

function applyLanguage() {
    if (!window.__i18n) return;
    const lang = window.__i18n.langOf(currentUser);
    document.documentElement.lang = lang;
    document.querySelectorAll('#left-menu-items .menu-btn').forEach(btn => {
        const raw = (btn.textContent || '').replace(/^[^\p{L}]+/u, '').trim();
        const key = MENU_KEY_BY_RU[raw];
        if (!key) return;
        const icon = (btn.textContent || '').match(/^[^\p{L}]+/u);
        btn.textContent = (icon ? icon[0] : '') + window.__i18n.t(key, currentUser);
    });
}

function regroupMenu() {
    const box = document.getElementById('left-menu-items');
    if (!box || box.dataset.grouped === '1') return;
    const buttons = Array.from(box.querySelectorAll('button'));
    if (buttons.length < 5) return;
    box.dataset.grouped = '1';

    const used = new Set();
    const frag = document.createDocumentFragment();
    let collapsedState = null;
    try { collapsedState = JSON.parse(localStorage.getItem('gm_menu_collapsed') || 'null'); } catch (e) { collapsedState = null; }
    const hasSaved = collapsedState && typeof collapsedState === 'object';
    if (!hasSaved) collapsedState = {};
    MENU_SECTIONS.forEach((sec, idx) => {
        const own = buttons.filter(b => {
            if (used.has(b)) return false;
            const t = (b.textContent || '').trim();
            return sec.items.some(k => t.includes(k));
        });
        if (!own.length) return;
        own.forEach(b => used.add(b));
        const title = document.createElement('div');
        title.className = 'menu-sec-title';
        const closed = hasSaved ? (collapsedState[sec.title] === true) : !sec.open;
        const body = document.createElement('div');
        body.className = 'menu-sec-body' + (closed ? ' menu-collapsed' : '');
        const mark = document.createElement('span');
        mark.className = 'menu-sec-mark';
        mark.textContent = closed ? '▸' : '▾';
        title.appendChild(mark);
        title.appendChild(document.createTextNode(' ' + sec.title));
        title.title = closed ? 'Развернуть группу' : 'Свернуть группу';
        title.addEventListener('click', () => {
            const isClosed = body.classList.toggle('menu-collapsed');
            mark.textContent = isClosed ? '▸' : '▾';
            title.title = isClosed ? 'Развернуть группу' : 'Свернуть группу';
            try {
                const st = JSON.parse(localStorage.getItem('gm_menu_collapsed') || '{}') || {};
                st[sec.title] = isClosed;
                localStorage.setItem('gm_menu_collapsed', JSON.stringify(st));
            } catch (e) { }
        });
        own.forEach(b => body.appendChild(b));
        frag.appendChild(title);
        frag.appendChild(body);
    });
    // что не разложилось — в «Игра»
    const rest = buttons.filter(b => !used.has(b));
    if (rest.length) {
        const title = document.createElement('div');
        title.className = 'menu-sec-title';
        title.textContent = '▾ Прочее';
        const body = document.createElement('div');
        body.className = 'menu-sec-body';
        rest.forEach(b => body.appendChild(b));
        title.addEventListener('click', () => {
            const isClosed = body.classList.toggle('menu-collapsed');
            title.textContent = (isClosed ? '▸' : '▾') + ' Прочее';
        });
        frag.appendChild(title);
        frag.appendChild(body);
    }
    box.innerHTML = '';
    box.appendChild(frag);
}

window.setMarketWorld = (id) => { marketWorld = id; renderMarket(); };

// Биржа работает через сервер: раньше покупка меняла только локальные данные,
// поэтому цена на экране не совпадала со списанием, а кредиты «росли сами».
function _mktToken() {
    try { return localStorage.getItem('galaktika_token') || ''; } catch (e) { return ''; }
}
function syncProfileFromServer() {
    // без токена запрос давал 401 в консоли — просто выходим
    if (!_mktToken()) return Promise.resolve();
    return fetch('/api/auth/me', { headers: { 'X-Auth-Token': _mktToken() } })
        .then(function (r) { return r.json(); })
        .then(function (res) {
            if (!res || !res.profile) return;
            var prof = {};
            try { prof = JSON.parse(res.profile || '{}'); } catch (e) { prof = {}; }
            if (typeof prof.credits === 'number') currentUser.credits = prof.credits;
            if (prof.resources) currentUser.resources = prof.resources;
            if (prof.ships) currentUser.ships = prof.ships;
            if (typeof prof.dockSlots === 'number') currentUser.dockSlots = prof.dockSlots;
            if (typeof window.saveUser === 'function') window.saveUser();
            if (typeof window.updateCredits === 'function') window.updateCredits();
        })
        .catch(function () {});
}
function marketTrade(id, qty, side) {
    return fetch('/api/npcmarket/trade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Auth-Token': _mktToken() },
        body: JSON.stringify({ key: id, qty: qty, side: side })
    }).then(function (r) { return r.json(); }).then(function (res) {
        if (res && res.error) { notify(res.error); return null; }
        return syncProfileFromServer().then(function () { return res; });
    }).catch(function () { notify('Сервер недоступен'); return null; });
}

window.marketBuy = (id) => {
    marketTrade(id, 10, 'buy').then(function (res) { if (res) renderMarket(); });
};

window.marketSell = (id) => {
    if ((currentUser.resources[id] || 0) < 10) { notify('Меньше 10 единиц на складе'); return; }
    marketTrade(id, 10, 'sell').then(function (res) { if (res) renderMarket(); });
};

function buildMarketUI() {
    const items = document.getElementById('left-menu-items');
    if (items && !document.getElementById('market-btn')) {
        const btn = document.createElement('button');
        btn.id = 'market-btn';
        btn.className = 'menu-btn';
        btn.textContent = '📈 Биржа';
        btn.addEventListener('click', window.openMarket);
        items.appendChild(btn);
    }
}

// =========================================================
// СПРАВОЧНИК ПОСТРОЕК
// =========================================================
// Все постройки трёх рас. race: earth / mars / belt / all.
// time — минуты реального времени, crew — сколько андроидов нужно на смене.
const BUILDINGS = [
    // --- общие ---
    { id: 'dock', race: 'all', cat: 'Инфраструктура', name: 'Место в доке', cost: 75000, steel: 0, chips: 0, time: 4, crew: 0, out: 'стоянка корабля', note: 'аренда у верфи' },
    { id: 'yard', race: 'all', cat: 'Инфраструктура', name: 'Верфь', cost: 95000, steel: 200, chips: 20, time: 12, crew: 20, out: 'постройка кораблей', note: 'без верфи корпус не собрать' },
    { id: 'robots', race: 'all', cat: 'Производство', name: 'Фабрика андроидов', cost: 45000, steel: 120, chips: 5, time: 3, crew: 0, out: '+1 андроид / 25 с', note: 'рабочая сила для всех построек' },
    { id: 'equipment', race: 'all', cat: 'Производство', name: 'Завод оборудования', cost: 38000, steel: 90, chips: 10, time: 3, crew: 10, out: '+2 чипа / 20 с', note: 'чипы нужны везде' },

    // --- Земля ---
    { id: 'dome', race: 'earth', cat: 'Добыча', name: 'Ферма-купол', cost: 18000, steel: 40, chips: 0, time: 2, crew: 5, out: '+5 т зерна / 30 с', note: '12 млрд человек надо кормить' },
    { id: 'desal', race: 'earth', cat: 'Добыча', name: 'Очистная станция', cost: 26000, steel: 55, chips: 2, time: 3, crew: 5, out: '+6 т воды / 30 с', note: 'замкнутый цикл, потери 5 %' },
    { id: 'refinery', race: 'earth', cat: 'Производство', name: 'Нефтеперегонный завод', cost: 42000, steel: 110, chips: 6, time: 6, crew: 15, out: 'керосин, полимеры', note: 'Земля — химический цех системы' },
    { id: 'hab_earth', race: 'earth', cat: 'Жильё', name: 'Жилой массив · небоскрёбы', cost: 40000, steel: 300, chips: 20, time: 12, crew: 40, out: '10 млн жителей', note: '1 массив на 10 млн человек' },
    { id: 'cloner', race: 'all', cat: 'Жильё', name: 'Комплекс клонирования', cost: 380000, steel: 260, chips: 90, time: 22, crew: 20, out: '+1.5 % к рождаемости при избытке еды', note: 'выращивает новых людей из клеток, требует много питания' },
    { id: 'medmodule', race: 'all', cat: 'Жильё', name: 'Медицинский модуль', cost: 450000, steel: 200, chips: 60, time: 25, crew: 10, out: 'обслуживает 5 млн человек', note: 'полнофункциональный медробот, снижает смертность вчетверо' },
    { id: 'printer', race: 'all', cat: 'Производство', name: 'Фабрика 3D-печати', cost: 95000, steel: 160, chips: 25, time: 9, crew: 18, out: '+4 т ширпотреба / 30 с', note: 'печатает одежду и быт из полимеров' },
    { id: 'gasplant', race: 'all', cat: 'Добыча', name: 'Газовый завод', cost: 220000, steel: 420, chips: 60, time: 20, crew: 30, out: '+2 т замороженного водорода / 40 с', note: 'строится на спутниках газовых гигантов, требует дроны-добытчики' },
    { id: 'solar', race: 'all', cat: 'Энергия', name: 'Солнечная электростанция', cost: 45000, steel: 80, chips: 6, time: 5, crew: 5, out: '+12 МВт за уровень', note: 'выгодна у Солнца и там, где мало облаков' },
    { id: 'fusion', race: 'all', cat: 'Энергия', name: 'Термоядерная электростанция', cost: 160000, steel: 300, chips: 40, time: 14, crew: 30, out: '+80 МВт за уровень', note: 'дорого, но работает в любом мире' },
    { id: 'wind', race: 'earth', cat: 'Энергия', name: 'Ветровой парк', cost: 32000, steel: 60, chips: 4, time: 4, crew: 3, out: '+7 МВт за уровень', note: 'экологично, зависит от погоды' },
    { id: 'geo', race: 'earth', cat: 'Энергия', name: 'Геотермальная станция', cost: 54000, steel: 110, chips: 8, time: 6, crew: 8, out: '+14 МВт за уровень', note: 'энергия планеты, стабильна' },
    { id: 'tidal', race: 'earth', cat: 'Энергия', name: 'Приливная станция', cost: 48000, steel: 95, chips: 6, time: 6, crew: 6, out: '+11 МВт за уровень', note: 'работает на побережьях' },
    // --- Развлечения: поднимают счастье колонии ---
    { id: 'stadium', race: 'earth', cat: 'Развлечения', name: 'Стадион', cost: 65000, steel: 180, chips: 12, time: 10, crew: 20,
      out: '+8 счастья', note: 'арены для футбола и лёгкой атлетики на 40 000 мест' },
    { id: 'raceway', race: 'mars', cat: 'Развлечения', name: 'Гоночная трасса', cost: 82000, steel: 240, chips: 18, time: 12, crew: 24,
      out: '+10 счастья', note: 'кольцевая трасса с гравитационными виражами, гонки по субботам' },
    { id: 'park', race: 'belt', cat: 'Развлечения', name: 'Парк развлечений', cost: 48000, steel: 120, chips: 10, time: 8, crew: 16,
      out: '+6 счастья', note: 'купол с аттракционами, оранжереей и смотровой площадкой' },
    { id: 'elevator', race: 'earth', cat: 'Инфраструктура', name: 'Атмосферный лифт', cost: 90000, steel: 200, chips: 30, time: 15, crew: 25, out: '400 км при 300 км/ч', note: '1.3 ч до орбиты, быстрее атмосфера не даёт' },

    // --- Марс ---
    { id: 'iceshaft', race: 'mars', cat: 'Добыча', name: 'Ледяная буровая', cost: 30000, steel: 60, chips: 3, time: 4, crew: 8, out: '+3 т льда / 30 с', note: 'полярные шапки и подлёдные линзы' },
    { id: 'reactor', race: 'mars', cat: 'Производство', name: 'Реактор тяжёлой воды', cost: 75000, steel: 150, chips: 25, time: 10, crew: 20, out: '+1 л тяжёлой воды / 30 с', note: 'Марс живёт на реакторах' },
    { id: 'habitat', race: 'mars', cat: 'Инфраструктура', name: 'Купол жизнеобеспечения', cost: 55000, steel: 140, chips: 8, time: 8, crew: 12, out: 'жильё на 1 млн', note: 'потолок 4 млрд — не резиновый' },
    { id: 'hab_mars', race: 'mars', cat: 'Жильё', name: 'Жилой массив · полуподземный город', cost: 46000, steel: 380, chips: 24, time: 14, crew: 50, out: '10 млн жителей', note: '1 массив на 10 млн человек, тихо и под землёй' },
    { id: 'androidw', race: 'mars', cat: 'Производство', name: 'Фабрика андроидов (усиленная)', cost: 60000, steel: 160, chips: 15, time: 7, crew: 0, out: '+2 андроида / 25 с', note: '1 андроид на 200 жителей' },

    // --- Пояс ---
    { id: 'rig', race: 'belt', cat: 'Добыча', name: 'Буровая платформа', cost: 25000, steel: 80, chips: 2, time: 4, crew: 6, out: '+2 т руды / 30 с', note: 'ставится на астероид' },
    { id: 'smelter', race: 'belt', cat: 'Производство', name: 'Плавильня', cost: 48000, steel: 130, chips: 6, time: 6, crew: 12, out: 'сталь, медь, никель', note: 'металлургия Пояса' },
    { id: 'chondrite', race: 'belt', cat: 'Добыча', name: 'Кондритный комплекс', cost: 35000, steel: 70, chips: 4, time: 5, crew: 8, out: '+2 кг кондритов / 30 с', note: 'углеродистые астероиды типа C' },
    { id: 'hab_belt', race: 'belt', cat: 'Жильё', name: 'Жилой массив · купола', cost: 52000, steel: 420, chips: 30, time: 16, crew: 60, out: '10 млн жителей', note: '1 массив на 10 млн человек, купол под станцией' },
    { id: 'skimmer', race: 'belt', cat: 'Добыча', name: 'Газовый скиммер', cost: 55000, steel: 120, chips: 10, time: 8, crew: 10, out: '+1 т газа / 30 с', note: 'орбита газового гиганта' }
];

const RACE_NAMES = { earth: 'Земля · Терра Нова', mars: 'Марс · Мир Тишины', belt: 'Пояс · Титановое Кольцо', all: 'Общие для всех' };

// Один жилой массив на 10 млн человек. Считаем, сколько нужно каждому миру.
const POP_PER_HABITAT = 50000000;

// Склонение числительных: «1 массив», «2 массива», «5 массивов».
function plural(n, one, few, many) {
    const a = Math.abs(n) % 100, b = a % 10;
    if (a > 10 && a < 20) return many;
    if (b > 1 && b < 5) return few;
    if (b === 1) return one;
    return many;
}

function habitatNeeds() {
    return WORLDS.map(w => ({ name: w.name, pop: w.pop, need: Math.ceil(w.pop / POP_PER_HABITAT) }));
}

function renderBuildings() {
    const body = document.getElementById('buildings-body');
    if (!body) return;
    const groups = ['all', 'earth', 'mars', 'belt'];
    const needs = habitatNeeds().map(n => `<span>${n.name}: <b>${(n.pop / 1e9).toFixed(1)} млрд</b> → ${n.need > 0 ? (n.need.toLocaleString() + ' ' + plural(n.need, 'массив', 'массива', 'массивов')) : '—'}</span>`).join('');
    body.innerHTML = `<div class="mkt-summary">${needs}</div>` + groups.map(g => {
        const items = BUILDINGS.filter(b => b.race === g);
        if (!items.length) return '';
        const rows = items.map(b => `<tr>
            <td><b>${b.name}</b><div class="bld-note">${b.note}</div></td>
            <td>${b.cat}</td>
            <td class="num">${b.cost.toLocaleString()}</td>
            <td class="num">${b.steel ? b.steel + ' т' : '—'}</td>
            <td class="num">${b.chips ? b.chips : '—'}</td>
            <td class="num">${b.time} мин</td>
            <td class="num">${b.crew ? b.crew : '—'}</td>
            <td>${b.out}</td>
        </tr>`).join('');
        return `<h3 class="bld-race">${RACE_NAMES[g]}</h3>
            <table class="bld-table"><thead><tr>
            <th>Постройка</th><th>Тип</th><th>Кредиты</th><th>Сталь</th><th>Чипы</th><th>Время</th><th>Андроиды</th><th>Что даёт</th>
            </tr></thead><tbody>${rows}</tbody></table>`;
    }).join('');
}

window.openBuildings = () => {
    let modal = document.getElementById('buildings-modal');
    if (!modal) {
        document.body.insertAdjacentHTML('beforeend',
            '<div id="buildings-modal" class="market-modal"><div class="market-modal-content" style="width:980px">' +
            '<span class="close-btn" onclick="closeBuildings()">&times;</span>' +
            '<h2>🏗 Справочник построек</h2><div id="buildings-body"></div></div></div>');
        modal = document.getElementById('buildings-modal');
    }
    modal.style.display = 'flex';
    renderBuildings();
};
window.closeBuildings = () => { const m = document.getElementById('buildings-modal'); if (m) m.style.display = 'none'; };

function buildBuildingsUI() {
    const items = document.getElementById('left-menu-items');
    if (items && !document.getElementById('buildings-btn')) {
        const btn = document.createElement('button');
        btn.id = 'buildings-btn';
        btn.className = 'menu-btn';
        btn.textContent = '🏗 Постройки';
        btn.addEventListener('click', window.openBuildings);
        items.appendChild(btn);
    }
}

// =========================================================
// НАУКА
// =========================================================
// Очки исследования капают с оборота биржи: 1 очко за 1 000 кр.
// Уровни покупаются очками и ресурсом профиля расы.
const DISCIPLINES = [
    { id: 'biocycles', name: 'Биоциклы', race: 'earth', max: 5, res: 'grain', effect: '+10% к производству еды за уровень' },
    { id: 'organochem', name: 'Органохимия', race: 'earth', max: 5, res: 'spice', effect: 'полимеры из биомассы, дешевле нефтехимии' },
    { id: 'medicine', name: 'Медицина', race: 'earth', max: 5, res: 'grain', effect: '−15% потерь экипажа, быстрее ремонт' },
    { id: 'biomat', name: 'Биоматериалы', race: 'earth', max: 4, res: 'grain', effect: 'корпуса легче на 20%' },
    { id: 'acoustics', name: 'Акустика', race: 'mars', max: 5, res: 'quartz', effect: 'сенсоры, резонаторы, скрытность' },
    { id: 'precision', name: 'Точная механика', race: 'mars', max: 5, res: 'quartz', effect: '−25% износа, стройка на 15% быстрее' },
    { id: 'crystallics', name: 'Кристаллика', race: 'mars', max: 4, res: 'corundum', effect: 'кварц в чипы без потерь' },
    { id: 'tunnels', name: 'Подземное строительство', race: 'mars', max: 4, res: 'steel', effect: 'купола и шахты дешевле на 30%' },
    { id: 'osteo', name: 'Остеоинтеграция', race: 'belt', max: 5, res: 'steel', effect: 'экипаж переносит перегрузки' },
    { id: 'exo', name: 'Экзоскелеты', race: 'belt', max: 5, res: 'steel', effect: 'андроиды работают быстрее' },
    { id: 'antigrav', name: 'Антигравитация', race: 'belt', max: 4, res: 'copper', effect: 'манёвр у планет без топлива' },
    { id: 'robotics', name: 'Робототехника', race: 'belt', max: 5, res: 'nickel', effect: 'фабрики андроидов и манипуляторы' }
];

function researchLevel(id) {
    return (currentUser && currentUser.research && currentUser.research.levels && currentUser.research.levels[id]) || 0;
}

// Гибриды: колония за Вратами смешивает две родительские школы.
// Открываются, когда обе родительские дисциплины достигли 3-го уровня.
const HYBRIDS = [
    { id: 'quietbio', name: 'Тихая биология', parents: ['biocycles', 'acoustics'], effect: 'лекарства без шума, подземные фермы' },
    { id: 'zerobio', name: 'Биоинженерия невесомости', parents: ['medicine', 'osteo'], effect: 'органы для низкой гравитации' },
    { id: 'crystal', name: 'Кристаллические приводы', parents: ['crystallics', 'antigrav'], effect: 'гравитационный привод без вибраций' },
    { id: 'synthesis', name: 'Синтез', parents: ['biomat', 'robotics'], effect: 'доступ к финальным ветвям дерева' }
];

function hybridUnlocked(h) {
    return h.parents.every(p => researchLevel(p) >= 3);
}

function ensureResearch(user) {
    if (!user.research) user.research = { points: 0, levels: {} };
    if (!user.research.levels) user.research.levels = {};
}

function researchCost(disc) {
    const lvl = (currentUser.research.levels[disc.id] || 0);
    return { points: 20 * (lvl + 1), res: 50 * (lvl + 1) };
}

function addResearch(creditsTurnover) {
    if (!currentUser) return;
    ensureResearch(currentUser);
    const pts = creditsTurnover / 1000;
    if (pts >= 1) { currentUser.research.points += Math.round(pts); saveUser(); }
}

function renderScience() {
    const body = document.getElementById('science-body');
    if (!body || !currentUser) return;
    ensureResearch(currentUser);
    const faction = currentUser.faction || 'earth';
    const list = DISCIPLINES.filter(d => d.race === faction);

    const cards = list.map(d => {
        const lvl = currentUser.research.levels[d.id] || 0;
        const cost = researchCost(d);
        const haveRes = currentUser.resources[d.res] || 0;
        const can = lvl < d.max && currentUser.research.points >= cost.points && haveRes >= cost.res;
        const dots = Array.from({ length: d.max }, (_, i) => `<span class="dot ${i < lvl ? 'on' : ''}"></span>`).join('');
        return `<div class="sci-card">
            <div class="sci-head"><b>${d.name}</b><span>${dots}</span></div>
            <div class="sci-effect">${d.effect}</div>
            <div class="sci-cost">${lvl >= d.max ? 'максимум' : `${cost.points} очков · ${cost.res} т ${RESOURCES[d.res] ? RESOURCES[d.res].name : d.res}`}</div>
            <button class="auth-btn" style="padding:6px;font-size:12px" ${can ? `onclick="researchUp('${d.id}')"` : 'disabled'}>${lvl >= d.max ? 'изучено' : 'Изучить'}</button>
        </div>`;
    }).join('');

    const hybridCards = HYBRIDS.map(h => {
        const open = hybridUnlocked(h);
        return `<div class="sci-card ${open ? '' : 'locked'}">
            <div class="sci-head"><b>${h.name}</b><span>${open ? 'открыт' : 'закрыт'}</span></div>
            <div class="sci-effect">${h.effect}</div>
            <div class="sci-cost">${open ? 'гибрид выращен' : 'нужны обе дисциплины до ур. 3'}</div>
        </div>`;
    }).join('');

    body.innerHTML = `<div class="mkt-summary"><span>очки исследования: <b>${currentUser.research.points}</b></span><span>фракция: <b>${FACTION_NAMES[faction]}</b></span></div>
        <div class="sci-hint">Очки капают с оборота биржи: 1 очко за каждые 1 000 кр сделки. Торгуйте на Луне, Фобосе и Церере — и уровень откроется.</div>
        <div class="sci-grid">${cards}</div>
        <h3 class="npc-log-title">Гибридные дисциплины</h3>
        <div class="sci-grid">${hybridCards}</div>`;
}

window.openScience = () => {
    let modal = document.getElementById('science-modal');
    if (!modal) {
        document.body.insertAdjacentHTML('beforeend',
            '<div id="science-modal" class="market-modal"><div class="market-modal-content" style="width:940px">' +
            '<span class="close-btn" onclick="closeScience()">&times;</span>' +
            '<h2>🔬 Наука</h2><div id="science-body"></div></div></div>');
        modal = document.getElementById('science-modal');
    }
    modal.style.display = 'flex';
    renderScience();
};
window.closeScience = () => { const m = document.getElementById('science-modal'); if (m) m.style.display = 'none'; };

window.researchUp = (id) => {
    const d = DISCIPLINES.find(x => x.id === id);
    if (!d) return;
    const lvl = currentUser.research.levels[id] || 0;
    if (lvl >= d.max) return;
    const cost = researchCost(d);
    if (currentUser.research.points < cost.points) { notify('Нужно ' + cost.points + ' очков'); return; }
    if ((currentUser.resources[d.res] || 0) < cost.res) { notify('Нужно ' + cost.res + ' т ресурса профиля'); return; }
    currentUser.research.points -= cost.points;
    currentUser.resources[d.res] -= cost.res;
    currentUser.research.levels[id] = lvl + 1;
    saveUser(); renderScience(); notify(d.name + ': уровень ' + (lvl + 1));
};

function buildScienceUI() {
    const items = document.getElementById('left-menu-items');
    if (items && !document.getElementById('science-btn')) {
        const btn = document.createElement('button');
        btn.id = 'science-btn';
        btn.className = 'menu-btn';
        btn.textContent = '🔬 Наука';
        btn.addEventListener('click', window.openScience);
        items.appendChild(btn);
    }
}

// =========================================================
// ИЗОМЕТРИЧЕСКАЯ ПОВЕРХНОСТЬ
// =========================================================
// Ромбическая сетка, тайлы грунта, дороги и здания объёмами.
const ISO = { tw: 92, th: 46, cols: 13, rows: 9 };
let isoAnim = null;

// =========================================================
// БИБЛИОТЕКА ПОСТРОЕК И СЛОТОВ
// =========================================================
// Новый объект достаточно добавить в BUILDING_LIBRARY: он сам получит
// свободный слот нужного типа на любой карте. Координаты слотов заданы
// по сгенерированному пейзажу, поэтому постройки стоят на лугу, у дороги
// или на опушке, а не в случайных клетках.
const BUILDING_LIBRARY = {
    'Верфь':                     { icon: '🏭', h: 46, col: '#8fa3bf', slot: 'пром' },
    'Завод оборудования':        { icon: '🏭', h: 38, col: '#7c92ad', slot: 'пром' },
    'Фабрика андроидов':         { icon: '🤖', h: 42, col: '#9a8fbf', slot: 'пром' },
    'Док':                       { icon: '🛠', h: 34, col: '#8a9bb5', slot: 'пром' },
    'Плавильня':                 { icon: '🏭', h: 52, col: '#c97a4a', slot: 'пром' },
    'Кондритный комплекс':       { icon: '🪨', h: 34, col: '#8a8f6a', slot: 'пром' },
    'Космопорт':                 { icon: '🚀', h: 26, col: '#c0c8d8', slot: 'порт' },
    'Биржа':                     { icon: '📈', h: 44, col: '#ffd479', slot: 'порт' },
    'Гравитационный лифт':       { icon: '🛗', h: 96, col: '#a0e0ff', slot: 'порт' },
    'Реактор тяжёлой воды':      { icon: '⚛', h: 54, col: '#9fb0c9', slot: 'пром' },
    'Ледяная буровая':           { icon: '⛏', h: 40, col: '#7fc8e0', slot: 'добыча' },
    'Буровая платформа':         { icon: '⛏', h: 44, col: '#8fa3bf', slot: 'добыча' },
    'Газовый скиммер':           { icon: '💨', h: 40, col: '#7fc8e0', slot: 'добыча' },
    'Купол жизнеобеспечения':    { icon: '🏠', h: 30, col: '#8fd0a8', slot: 'жильё' },
    'Жилой массив · небоскрёбы':          { icon: '🏙', h: 64, col: '#9fb0c9', slot: 'жильё' },
    'Жилой массив · полуподземный город': { icon: '🏘', h: 36, col: '#c98a5a', slot: 'жильё' },
    'Жилой массив · купола':              { icon: '⛺', h: 40, col: '#8fd0a8', slot: 'жильё' },
    'Ферма-купол':               { icon: '🌾', h: 28, col: '#8fd0a8', slot: 'жильё' },
    'Очистная станция':          { icon: '💧', h: 32, col: '#7fc8e0', slot: 'добыча' }
};

// Слоты: тип + координаты на карте. Порядок задаёт приоритет.
const SURFACE_SLOTS = {
    earth: [
        { kind: 'порт', c: 7, r: 7 }, { kind: 'пром', c: 9, r: 5 },
        { kind: 'пром', c: 11, r: 7 }, { kind: 'порт', c: 6, r: 8 },
        { kind: 'пром', c: 10, r: 3 }, { kind: 'жильё', c: 8, r: 8 }
    ],
    moon: [
        { kind: 'порт', c: 7, r: 5 }, { kind: 'порт', c: 9, r: 7 },
        { kind: 'порт', c: 11, r: 5 }, { kind: 'пром', c: 6, r: 7 }
    ],
    mars: [
        { kind: 'пром', c: 6, r: 6 }, { kind: 'жильё', c: 9, r: 4 },
        { kind: 'добыча', c: 10, r: 8 }, { kind: 'пром', c: 7, r: 3 }
    ],
    kepler1: [
        { name: 'Первый посад', lat: 12.0, lon: 30.0, pop: 6000000, hab: 1, type: 'столица' },
        { name: 'Артель', lat: -18.0, lon: -60.0, pop: 4000000, hab: 1, type: 'добыча' },
        { name: 'Орбитальная станция', lat: 5.0, lon: 110.0, pop: 2000000, hab: 1, type: 'порт' }
    ],
    saturn: [
        { name: 'Сатурн · Кольца', lat: 15.0, lon: 60.0, pop: 90000, hab: 1, type: 'порт' }
    ],
    belt: [
        { name: 'Пояс · Церера', lat: 10.0, lon: 20.0, pop: 280000000, hab: 1, type: 'столица' },
        { name: 'Пояс · Веста', lat: -5.0, lon: 60.0, pop: 220000000, hab: 1, type: 'порт' },
        { name: 'Пояс · Паллада', lat: 15.0, lon: -40.0, pop: 190000000, hab: 1, type: 'порт' },
        { name: 'Пояс · Гигея', lat: -20.0, lon: 90.0, pop: 160000000, hab: 1, type: 'порт' },
        { name: 'Пояс · Интерамния', lat: 30.0, lon: -100.0, pop: 150000000, hab: 1, type: 'порт' }
    ]
};

// =========================================================
// ГОРОДА МИРОВ
// =========================================================
// Земля — по реальным городам-миллионникам, Марс — по регионам,
// Пояс — по настоящим астероидам. Массивов ровно столько, сколько
// даёт норма 10 млн человек на массив: 1200 / 400 / 100.
// Матрица ресурсов: что можно найти и в каком количестве (0..3) по типу тела.
const RESOURCE_MATRIX = {
    'астероид C': { organics: 3, water: 2, quartz: 1, heavy: 0, rare: 0, uranium: 0 },
    'астероид S': { copper: 3, nickel: 2, quartz: 2, steel: 2, rare: 1, heavy: 0, uranium: 0 },
    'астероид M': { steel: 3, nickel: 3, silver: 2, gold: 1, heavy: 2, rare: 1, uranium: 0 },
    'ледяной спутник': { ice: 3, water: 3, heavy: 1, uranium: 0 },
    'крупный спутник': { steel: 2, nickel: 2, rare: 2, uranium: 1 },
    'газовый гигант': { gas: 3, helium: 3, heavy: 0, uranium: 0 },
    'планета земного типа': { grain: 3, water: 2, organics: 2, oil: 2, rare: 0, uranium: 0 },
    'пустынная планета': { quartz: 2, rare: 2, uranium: 2, steel: 1 },
    'океанид': { water: 3, fish: 3, gas: 1 }
};

const WORLD_CITIES = {
    earth: [
        { name: 'Москва', lat: 55.8, lon: 37.6, pop: 625119847, hab: 25, type: 'столица' },
        { name: 'Санкт-Петербург', lat: 59.9, lon: 30.3, pop: 107382550, hab: 11, type: 'порт' },
        { name: 'Лондон', lat: 51.5, lon: -0.1, pop: 182166826, hab: 19, type: 'порт' },
        { name: 'Париж', lat: 48.9, lon: 2.4, pop: 212847555, hab: 22, type: 'порт' },
        { name: 'Берлин', lat: 52.5, lon: 13.4, pop: 70949185, hab: 7, type: 'порт' },
        { name: 'Мадрид', lat: 40.4, lon: -3.7, pop: 128475551, hab: 13, type: 'порт' },
        { name: 'Рим', lat: 41.9, lon: 12.5, pop: 82454458, hab: 9, type: 'порт' },
        { name: 'Стамбул', lat: 41.0, lon: 29.0, pop: 297219559, hab: 31, type: 'порт' },
        { name: 'Каир', lat: 30.0, lon: 31.2, pop: 408437200, hab: 42, type: 'порт' },
        { name: 'Лагос', lat: 6.5, lon: 3.4, pop: 295302013, hab: 31, type: 'порт' },
        { name: 'Киншаса', lat: -4.4, lon: 15.3, pop: 299137105, hab: 31, type: 'порт' },
        { name: 'Йоханнесбург', lat: -26.2, lon: 28.1, pop: 115052733, hab: 12, type: 'порт' },
        { name: 'Найроби', lat: -1.3, lon: 36.8, pop: 97794823, hab: 10, type: 'порт' },
        { name: 'Тегеран', lat: 35.7, lon: 51.4, pop: 174496644, hab: 18, type: 'порт' },
        { name: 'Багдад', lat: 33.3, lon: 44.4, pop: 143815916, hab: 15, type: 'порт' },
        { name: 'Эр-Рияд', lat: 24.7, lon: 46.7, pop: 147651007, hab: 15, type: 'порт' },
        { name: 'Карачи', lat: 24.9, lon: 67.0, pop: 322147651, hab: 33, type: 'порт' },
        { name: 'Дели', lat: 28.6, lon: 77.2, pop: 630872483, hab: 65, type: 'порт' },
        { name: 'Мумбаи', lat: 19.1, lon: 72.9, pop: 408437200, hab: 42, type: 'порт' },
        { name: 'Колката', lat: 22.6, lon: 88.4, pop: 289549377, hab: 30, type: 'порт' },
        { name: 'Дакка', lat: 23.8, lon: 90.4, pop: 431447747, hab: 45, type: 'порт' },
        { name: 'Бангкок', lat: 13.8, lon: 100.5, pop: 205177373, hab: 21, type: 'порт' },
        { name: 'Джакарта', lat: -6.2, lon: 106.8, pop: 203259827, hab: 21, type: 'порт' },
        { name: 'Манила', lat: 14.6, lon: 121.0, pop: 281879195, hab: 29, type: 'порт' },
        { name: 'Гонконг', lat: 22.3, lon: 114.2, pop: 143815916, hab: 15, type: 'порт' },
        { name: 'Шанхай', lat: 31.2, lon: 121.5, pop: 559923298, hab: 58, type: 'порт' },
        { name: 'Пекин', lat: 39.9, lon: 116.4, pop: 419942474, hab: 43, type: 'порт' },
        { name: 'Сеул', lat: 37.6, lon: 127.0, pop: 189837009, hab: 20, type: 'порт' },
        { name: 'Токио', lat: 35.7, lon: 139.7, pop: 709491850, hab: 73, type: 'порт' },
        { name: 'Осака', lat: 34.7, lon: 135.5, pop: 364333653, hab: 38, type: 'порт' },
        { name: 'Тайбэй', lat: 25.0, lon: 121.6, pop: 134228188, hab: 14, type: 'порт' },
        { name: 'Сидней', lat: -33.9, lon: 151.2, pop: 101629914, hab: 10, type: 'порт' },
        { name: 'Мельбурн', lat: -37.8, lon: 145.0, pop: 99712368, hab: 10, type: 'порт' },
        { name: 'Окленд', lat: -36.9, lon: 174.8, pop: 32598274, hab: 3, type: 'порт' },
        { name: 'Лос-Анджелес', lat: 34.0, lon: -118.2, pop: 239693193, hab: 25, type: 'порт' },
        { name: 'Нью-Йорк', lat: 40.7, lon: -74.0, pop: 360498562, hab: 37, type: 'порт' },
        { name: 'Чикаго', lat: 41.9, lon: -87.6, pop: 170661553, hab: 18, type: 'порт' },
        { name: 'Майами', lat: 25.8, lon: -80.2, pop: 118887824, hab: 12, type: 'порт' },
        { name: 'Торонто', lat: 43.6, lon: -79.4, pop: 120805369, hab: 12, type: 'порт' },
        { name: 'Мехико', lat: 19.4, lon: -99.1, pop: 418024928, hab: 43, type: 'порт' },
        { name: 'Сан-Паулу', lat: -23.6, lon: -46.6, pop: 429530201, hab: 44, type: 'порт' },
        { name: 'Буэнос-Айрес', lat: -34.6, lon: -58.4, pop: 295302013, hab: 31, type: 'порт' },
        { name: 'Рио-де-Жанейро', lat: -22.9, lon: -43.2, pop: 258868648, hab: 27, type: 'порт' },
        { name: 'Лима', lat: -12.1, lon: -77.0, pop: 210930010, hab: 22, type: 'порт' },
        { name: 'Богота', lat: 4.7, lon: -74.1, pop: 216682646, hab: 22, type: 'порт' },
        { name: 'Сантьяго', lat: -33.5, lon: -70.7, pop: 130393097, hab: 13, type: 'порт' },
        { name: 'Гавана', lat: 23.1, lon: -82.4, pop: 40268456, hab: 4, type: 'порт' },
        { name: 'Касабланка', lat: 33.6, lon: -7.6, pop: 72866731, hab: 9, type: 'порт' }
    ],
    moon: [
        { name: 'Лунная биржа', lat: 0.0, lon: 0.0, pop: 12000000, hab: 2, type: 'столица' },
        { name: 'Море Спокойствия', lat: 8.0, lon: 31.0, pop: 5000000, hab: 1, type: 'порт' },
        { name: 'Кратер Тихо', lat: -43.0, lon: -11.0, pop: 3000000, hab: 1, type: 'порт' }
    ],
    mars: [
        { name: 'Элизий', lat: 25.0, lon: 147.0, pop: 600000000, hab: 60, type: 'столица' },
        { name: 'Олимп', lat: 18.6, lon: -133.8, pop: 420000000, hab: 42, type: 'порт' },
        { name: 'Утопия', lat: 46.7, lon: 117.5, pop: 480000000, hab: 48, type: 'порт' },
        { name: 'Хриса', lat: 23.0, lon: -40.0, pop: 380000000, hab: 38, type: 'порт' },
        { name: 'Ацидалия', lat: 46.0, lon: -20.0, pop: 300000000, hab: 30, type: 'порт' },
        { name: 'Фарсида', lat: 0.0, lon: -100.0, pop: 360000000, hab: 36, type: 'порт' },
        { name: 'Сиртис', lat: 8.4, lon: 69.5, pop: 320000000, hab: 32, type: 'порт' },
        { name: 'Эллада', lat: -42.4, lon: 70.5, pop: 300000000, hab: 30, type: 'порт' },
        { name: 'Аргир', lat: -49.7, lon: -43.4, pop: 280000000, hab: 28, type: 'порт' },
        { name: 'Амазония', lat: 0.0, lon: -160.0, pop: 220000000, hab: 22, type: 'порт' },
        { name: 'Долины Маринер', lat: -13.0, lon: -59.0, pop: 200000000, hab: 20, type: 'порт' },
        { name: 'Прометей', lat: -60.0, lon: 80.0, pop: 140000000, hab: 14, type: 'порт' }
    ],
    belt: [
        { name: 'Пояс · Церера', lat: 10.0, lon: 20.0, pop: 180000000, hab: 18, type: 'столица' },
        { name: 'Пояс · Веста', lat: -5.0, lon: 60.0, pop: 140000000, hab: 14, type: 'порт' },
        { name: 'Пояс · Паллада', lat: 15.0, lon: -40.0, pop: 110000000, hab: 11, type: 'порт' },
        { name: 'Пояс · Гигея', lat: -20.0, lon: 90.0, pop: 95000000, hab: 10, type: 'порт' },
        { name: 'Пояс · Интерамния', lat: 30.0, lon: -100.0, pop: 85000000, hab: 8, type: 'порт' },
        { name: 'Пояс · Давида', lat: 45.0, lon: 10.0, pop: 75000000, hab: 8, type: 'порт' },
        { name: 'Пояс · Сильвия', lat: -35.0, lon: -70.0, pop: 70000000, hab: 7, type: 'порт' },
        { name: 'Пояс · Гектор', lat: 55.0, lon: 130.0, pop: 65000000, hab: 6, type: 'порт' },
        { name: 'Пояс · Евномия', lat: -50.0, lon: 150.0, pop: 60000000, hab: 6, type: 'порт' },
        { name: 'Пояс · Психея', lat: 20.0, lon: -150.0, pop: 55000000, hab: 6, type: 'порт' },
        { name: 'Пояс · Ирида', lat: -10.0, lon: 0.0, pop: 40000000, hab: 4, type: 'порт' },
        { name: 'Пояс · Юнона', lat: 35.0, lon: 80.0, pop: 25000000, hab: 2, type: 'порт' }
    ]
};

function cityHabitats(city) { return Math.ceil(city.pop / POP_PER_HABITAT); }

function worldTotals(world) {
    const cities = WORLD_CITIES[world] || [];
    const pop = cities.reduce((s, c) => s + c.pop, 0);
    const habitats = cities.reduce((s, c) => s + cityHabitats(c), 0);
    return { pop: pop, habitats: habitats, cities: cities.length };
}

const CITY_COLORS = { 'столица': 0xffd479, 'биржа': 0x7fe3ff, 'порт': 0x9fd0ff, 'пром': 0xff9d6b, 'добыча': 0xc0c8d8, 'жильё': 0x8fd0a8 };

// Поселения для мира, которого нет в данных: строятся детерминированно
// от адреса — у каждой новой системы сразу есть 2-3 города на глобусе.
const GEN_CITIES = {};

function generatedSettlements(world) {
    let h = 2166136261;
    for (let i = 0; i < world.length; i++) { h ^= world.charCodeAt(i); h = Math.imul(h, 16777619); }
    const rnd = () => { h = (h * 1664525 + 1013904223) >>> 0; return h / 4294967296; };
    const n = 2 + Math.floor(rnd() * 2);
    const kinds = ['столица', 'порт', 'добыча', 'жильё'];
    const out = [];
    for (let i = 0; i < n; i++) {
        out.push({
            name: (GLOBE_NAMES[world] || world) + ' · ' + ['Первый посад', 'Артель', 'Орбитальный узел', 'Купола'][i % 4],
            lat: Math.round((-70 + rnd() * 140) * 10) / 10,
            lon: Math.round((-180 + rnd() * 360) * 10) / 10,
            pop: Math.round((1 + rnd() * 40)) * 1000000,
            hab: 1,
            type: kinds[i % kinds.length]
        });
    }
    return out;
}

function globeMarkers(world) {
    let src = WORLD_CITIES[world];
    if (worldsModule) {
        try { src = worldsModule.settlements(world, src); }
        catch (e) { console.warn('worlds.settlements:', e); }
    }
    if (!src) {
        if (!GEN_CITIES[world]) GEN_CITIES[world] = generatedSettlements(world);
        src = GEN_CITIES[world];
    }
    const cities = src.map(c => ({
        lat: c.lat, lon: c.lon,
        label: c.name + ' · ' + (c.pop / 1e9).toFixed(2) + ' млрд · ' + cityHabitats(c).toLocaleString() + ' массивов',
        color: CITY_COLORS[c.type] || 0x7fe3ff
    }));
    const stations = (typeof ORBITAL_STATIONS !== 'undefined' ? ORBITAL_STATIONS : [])
        .filter(s => s.owner === world)
        .map(s => {
            const load = stationLoad(s);
            return {
                lat: s.lat, lon: s.lon,
                label: 'СТАНЦИЯ ' + s.name + ' · живых ' + Math.round((s.living || 0) / 1000) + ' тыс (' + load.livingPct + '%) · синтетиков ' + Math.round((s.synths || 0) / 1000) + ' тыс (' + load.synthPct + '%)',
                color: 0xdfe9f7
            };
        });
    return cities.concat(stations);
}

// Сгенерированные миры: адрес начинается с gen_, тип задан суффиксом.
let globeModule = null;

function isGeneratedWorld(id) { return typeof id === 'string' && id.indexOf('gen_') === 0; }

function generatedType(id) {
    const t = id.replace('gen_', '');
    return ['earthlike', 'gas', 'rocky', 'ice'].includes(t) ? t : 'rocky';
}

function generatedTexture(id) {
    // canvas модуля planetgen отдаём как dataURL — three.js примет его как обычную картинку
    if (!window.__planetgen) return null;
    const type = generatedType(id);
    const canvas = window.__planetgen.makePlanetCanvas(type, id, 1024, 512);
    return canvas.toDataURL('image/jpeg', 0.92);
}

// Текстуры для глобуса: те же карты, что и в сцене системы.
// Принадлежность лун и малых тел — стартовые установки мира.
// Орбитальные станции — искусственные объекты огромных размеров.
// Металла уходит столько, что постройка длится десятилетиями, но станций много:
// без них не живут ни орбита Венеры, ни лунные базы.
// Предел любой станции: 1 млн живых и 1.5 млн синтетиков.
// Живым нужны воздух, вода и еда; синтетикам — энергия и ремонт.
const STATION_LIMITS = { living: 1000000, synthetic: 1500000 };

const ORBITAL_STATIONS = [
    { name: 'Венера-1', owner: 'earth', lat: 12.0, lon: 40.0, living: 640000, synths: 900000, note: 'станция землян на орбите Венеры' },
    { name: 'Луна-Хаб', owner: 'earth', lat: 0.0, lon: 0.0, living: 980000, synths: 1450000, note: 'узел биржи, крупнейшая станция системы' },
    { name: 'Фобос-Док', owner: 'mars', lat: 5.0, lon: 40.0, living: 420000, synths: 760000, note: 'марсианская перевалочная база' },
    { name: 'Церера-Верфь', owner: 'belt', lat: 10.0, lon: 20.0, living: 310000, synths: 1200000, note: 'астероидная верфь' },
    { name: 'Кольца Сатурна', owner: 'saturn', lat: 15.0, lon: 60.0, living: 90000, synths: 640000, note: 'пиратская база Барона Колец в кольцах' },
    { name: 'Юпитер-Скиммер', owner: 'belt', lat: 25.0, lon: -120.0, living: 150000, synths: 1100000, note: 'газовый промысел' }
];

function stationLoad(st) {
    return {
        livingPct: Math.round((st.living || 0) / STATION_LIMITS.living * 100),
        synthPct: Math.round((st.synths || 0) / STATION_LIMITS.synthetic * 100)
    };
}

const MOON_OWNERS = {
    'Луна': 'earth',
    'Фобос': 'mars', 'Деймос': 'mars',
    'Европа': 'earth',
    'Церера': 'belt', 'Веста': 'belt', 'Паллада': 'belt', 'Гигея': 'belt',
    'Интерамния': 'belt', 'Давида': 'belt', 'Сильвия': 'belt', 'Гектор': 'belt'
};
// Луны газовых гигантов поделены тремя народами — закрепляем жребием при старте
const GIANT_MOONS = ['Ио', 'Ганимед', 'Каллисто', 'Титан', 'Энцелад', 'Рея', 'Япет'];
function moonOwner(name) {
    if (MOON_OWNERS[name]) return MOON_OWNERS[name];
    let h = 0;
    for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
    return ['earth', 'mars', 'belt'][h % 3];
}

const GLOBE_NAMES = {
    mercury: 'Меркурий',
    venus: 'Венера',
    earth: 'Земля',
    moon: 'Луна',
    mars: 'Марс',
    phobos: 'Фобос',
    deimos: 'Деймос',
    ceres: 'Церера',
    jupiter: 'Юпитер',
    io: 'Ио',
    europa: 'Европа',
    ganymede: 'Ганимед',
    callisto: 'Каллисто',
    saturn: 'Сатурн',
    titan: 'Титан',
    enceladus: 'Энцелад',
    uranus: 'Уран',
    titania: 'Титания',
    neptune: 'Нептун',
    triton: 'Тритон'
};

const GLOBE_TEX = {
    mercury: '/images/tex/mercury.webp',
    venus: '/images/tex/venus.webp',
    earth: '/images/tex/earth.webp',
    moon: '/images/tex/moon.webp',
    mars: '/images/tex/mars.webp',
    phobos: '/images/tex/phobos.webp',
    deimos: '/images/tex/deimos.webp',
    ceres: '/images/tex/ceres.webp',
    jupiter: '/images/tex/jupiter.webp',
    io: '/images/tex/io.webp',
    europa: '/images/tex/europa.webp',
    ganymede: '/images/tex/ganymede.webp',
    callisto: '/images/tex/callisto.webp',
    saturn: '/images/tex/saturn.webp',
    titan: '/images/tex/titan.webp',
    enceladus: '/images/tex/enceladus.webp',
    uranus: '/images/tex/uranus.webp',
    titania: '/images/tex/titania.webp',
    neptune: '/images/tex/neptune.webp',
    triton: '/images/tex/triton.webp',
    belt: '/images/tex/ceres.webp',
    kepler1: '/images/tex/kepler1.webp'
};

// Текстура глобуса: готовая карта для известных тел, процедурная — для новых систем.
const GEN_CACHE = {};
let worldsModule = null;
import('/js/worlds.js').then(m => { worldsModule = m; m.init(); }).catch(e => console.warn('worlds:', e));
function globeTextureFor(id) {
    if (GLOBE_TEX[id]) return GLOBE_TEX[id];
    if (worldsModule) {
        try {
            const t = worldsModule.texture(id);
            if (t) return t;
        } catch (e) { console.warn('worlds.texture:', e); }
    }
    if (!window.__planetgen) return GLOBE_TEX.earth;
    if (GEN_CACHE[id]) return GEN_CACHE[id];
    const type = /gas|saturn|jupiter/i.test(id) ? 'gas' : 'earthlike';
    try {
        const canvas = window.__planetgen.makePlanetCanvas(type, id, 1024, 512);
        GEN_CACHE[id] = canvas.toDataURL('image/jpeg', 0.9);
        return GEN_CACHE[id];
    } catch (e) { console.warn('gen texture:', e); return GLOBE_TEX.earth; }
}

// Защита от двойного вызова: второй клик из пары «двойного» приходил сюда
// повторно и мгновенно закрывал только что открытый глобус.
let __lastGlobeAt = 0;
let __lastGlobeId = '';
window.openGlobe = (id) => {
    const nowTs = Date.now();
    if (id === __lastGlobeId && nowTs - __lastGlobeAt < 700) return;
    __lastGlobeAt = nowTs; __lastGlobeId = id;
    const world = (typeof id === 'string' && id) ? id : 'earth';
    let modal = document.getElementById('globe-modal');
    if (!modal) {
        document.body.insertAdjacentHTML('beforeend',
            '<div id="globe-modal" class="globe-modal"><div class="globe-frame">' +
            '<button class="surface-close" onclick="closeGlobe()">×</button>' +
            '<canvas id="globe-canvas"></canvas>' +
            '<div class="globe-title" id="globe-title"></div>' +
            '<div class="globe-tabs" id="globe-tabs"></div>' +
            '<div class="globe-tip" id="globe-tip"></div>' +
            '<div class="globe-legend" id="globe-legend">' +
            '  <b>Города</b>' +
            '  <span><i style="background:#ffd479"></i> столица</span>' +
            '  <span><i style="background:#7fe3ff"></i> биржа</span>' +
            '  <span><i style="background:#9fd0ff"></i> порт</span>' +
            '  <span><i style="background:#ff9d6b"></i> промзона</span>' +
            '  <span><i style="background:#c0c8d8"></i> добыча</span>' +
            '  <span><i style="background:#8fd0a8"></i> жильё</span>' +
            '  <span><i style="background:#dfe9f7;border:1px solid #7fe3ff"></i> орбитальная станция</span>' +
            '</div>' +
            '<div class="globe-hint">вращение — перетаскивание · масштаб — колесо</div>' +
            '<button class="globe-surface-btn" id="globe-surface">⬇ Спуститься на планетарный вид</button>' +
            '</div></div>');
        modal = document.getElementById('globe-modal');
    }
    modal.style.display = 'flex';
    // На газовых гигантах селиться негде: там только добыча газа,
    // а заводы и жильё — на лунах. Поэтому население и города = 0.
    const GAS_GIANTS = { jupiter: 'Европа, Ио, Ганимед', saturn: 'Титан, Энцелад',
                         uranus: 'Титания', neptune: 'Тритон' };
    let tot, titleTail;
    if (GAS_GIANTS[world]) {
        tot = { pop: 0, cities: 0, habitats: 0 };
        titleTail = 'газовый гигант · заводы на лунах: ' + GAS_GIANTS[world];
    } else {
        tot = (WORLD_CITIES[world] ? worldTotals(world) : (() => {
            const cities = (typeof GEN_CITIES !== 'undefined' && GEN_CITIES[world]) ? GEN_CITIES[world] : generatedSettlements(world);
            const pop = cities.reduce((s, c) => s + (c.pop || 0), 0);
            return { pop: pop, cities: cities.length, habitats: cities.length };
        })());
        const popText = tot.pop >= 1e9 ? (tot.pop / 1e9).toFixed(1) + ' млрд' : Math.round(tot.pop / 1e6) + ' млн';
        titleTail = popText + ' · ' + tot.cities + ' городов · ' + tot.habitats.toLocaleString() + ' модулей';
    }
    document.getElementById('globe-title').textContent = (GLOBE_NAMES[world] || world) + ' · ' + titleTail;
    document.getElementById('globe-tabs').innerHTML = Object.keys(GLOBE_TEX).map(k =>
        `<button class="surface-tab ${k === world ? 'active' : ''}" onclick="openGlobe('${k}')">${GLOBE_NAMES[k] || k}</button>`
    ).join('');
    const surfaceBtn = document.getElementById('globe-surface');
    if (surfaceBtn) {
        surfaceBtn.onclick = () => {
            // закрываем глобус и даём кадру «успокоиться»: если вызвать сцену
            // сразу, она строится в момент, когда глобус ещё убирает свои узлы
            window.closeGlobe();
            const openScene = () => {
                // планетарный вид — в отдельной вкладке, чтобы карта не терялась
                const pvUrl = location.pathname + '?pv=' + encodeURIComponent(world);
                const win = window.open(pvUrl, '_blank');
                if (win) { if (typeof closeGlobe === 'function') closeGlobe(); else { const m = document.getElementById('globe-modal'); if (m) m.style.display = 'none'; } return; }
                if (window.PlanetView && typeof window.PlanetView.open === 'function') {
                    window.PlanetView.open(world);
                } else if (typeof notify === 'function') {
                    notify('Планетарный вид ещё загружается');
                }
            };
            setTimeout(openScene, 120);
        };
    }
    import('/js/planetgen.js').then(m => { window.__planetgen = m; }).catch(() => {});
    import('/js/globe.js').then(m => {
        globeModule = m;
        const tex = globeTextureFor(world);
        m.start(
            document.getElementById('globe-canvas'),
            tex,
            globeMarkers(world),
            marker => {
                // клик только подсвечивает название, ничего не открывает
                window.__pickedCity = marker.label;
                const tip = document.getElementById('globe-tip');
                if (tip) {
                    tip.textContent = marker.label;
                    tip.style.display = 'block';
                    tip.classList.add('pinned');
                    clearTimeout(window.__tipTimer);
                    window.__tipTimer = setTimeout(() => tip.classList.remove('pinned'), 4000);
                }
            },
            { rings: /saturn|jupiter|uranus|neptune|gas/i.test(world), tip: document.getElementById('globe-tip') }
        );
    }).catch(e => console.warn('глобус недоступен:', e));
};

window.closeGlobe = () => {
    const m = document.getElementById('globe-modal');
    if (m) m.style.display = 'none';
    if (globeModule) { globeModule.stop(); globeModule = null; }
};

// =========================================================
// РЕЖИМ ПОЛЁТА
// =========================================================
// Отдельный экран: вид из кабины, приборы, цель. Автопилот ведёт бой сам,
// ручное управление включается кнопкой.
const FLIGHT = { open: false, raf: null, autopilot: true, t: 0 };

function openFlight() {
    let modal = document.getElementById('flight-modal');
    if (!modal) {
        document.body.insertAdjacentHTML('beforeend',
            '<div id="flight-modal" class="flight-modal"><div class="flight-frame">' +
            '<button class="surface-close" onclick="closeFlight()">×</button>' +
            '<canvas id="flight-canvas" width="1000" height="520"></canvas>' +
            '<div class="flight-hud">' +
            '  <div class="hud-block"><span>СКОРОСТЬ</span><b id="hud-speed">0</b><em>км/с</em></div>' +
            '  <div class="hud-block"><span>КУРС</span><b id="hud-course">000</b><em>°</em></div>' +
            '  <div class="hud-block"><span>ЩИТ</span><b id="hud-shield">100</b><em>%</em></div>' +
            '  <div class="hud-block"><span>КОРПУС</span><b id="hud-hull">100</b><em>%</em></div>' +
            '  <div class="hud-block"><span>ТОПЛИВО</span><b id="hud-fuel">100</b><em>%</em></div>' +
            '  <div class="hud-block"><span>ДО ЦЕЛИ</span><b id="hud-dist">0</b><em>км</em></div>' +
            '</div>' +
            '<div class="flight-controls">' +
            '  <button class="fly-btn" onclick="flightThrottle(1)">▲ Тяга</button>' +
            '  <button class="fly-btn" onclick="flightThrottle(-1)">▼ Тормоз</button>' +
            '  <button class="fly-btn" id="fly-auto" onclick="toggleAutopilot()">Автопилот: вкл</button>' +
            '  <button class="fly-btn fire" onclick="flightFire()">Огонь</button>' +
            '  <button class="fly-btn" onclick="closeFlight()">Выход</button>' +
            '</div>' +
            '<div class="flight-log" id="flight-log"></div>' +
            '</div></div>');
        modal = document.getElementById('flight-modal');
    }
    modal.style.display = 'flex';
    FLIGHT.open = true;
    FLIGHT.t = 0;
    FLIGHT.state = { speed: 1200, course: 45, shield: 100, hull: 100, fuel: 100, dist: 84000, targetHull: 100 };
    flightLog('Борт в космосе. Цель: пиратский «Клык», 84 000 км.');
    stopFlightLoop();
    loopFlight();
}

function flightLog(text) {
    const box = document.getElementById('flight-log');
    if (!box) return;
    const line = document.createElement('div');
    line.textContent = text;
    box.appendChild(line);
    while (box.children.length > 6) box.removeChild(box.firstChild);
}

function stopFlightLoop() {
    if (FLIGHT.raf) cancelAnimationFrame(FLIGHT.raf);
    FLIGHT.raf = null;
}

function closeFlight() {
    const m = document.getElementById('flight-modal');
    if (m) m.style.display = 'none';
    FLIGHT.open = false;
    stopFlightLoop();
}

window.toggleAutopilot = () => {
    FLIGHT.autopilot = !FLIGHT.autopilot;
    const b = document.getElementById('fly-auto');
    if (b) b.textContent = 'Автопилот: ' + (FLIGHT.autopilot ? 'вкл' : 'выкл');
    flightLog(FLIGHT.autopilot ? 'Автопилот включён' : 'Ручное управление');
};

window.flightThrottle = (dir) => {
    if (FLIGHT.autopilot) { flightLog('Автопилот сам держит тягу'); return; }
    const s = FLIGHT.state;
    s.speed = Math.max(0, Math.min(12000, s.speed + dir * 400));
    s.fuel = Math.max(0, s.fuel - (dir > 0 ? 0.6 : 0));
};

window.flightFire = () => {
    const s = FLIGHT.state;
    if (s.dist > 30000) { flightLog('Вне дальности огня'); return; }
    if (s.fuel < 1) { flightLog('Нет энергии для залпа'); return; }
    s.fuel -= 1.5;
    s.targetHull = Math.max(0, s.targetHull - (12 + Math.random() * 10) * (s.armament || 1));
    flightLog('Залп: корпус цели ' + Math.round(s.targetHull) + '%');
};

function loopFlight() {
    const canvas = document.getElementById('flight-canvas');
    if (!canvas || !FLIGHT.open) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    const s = FLIGHT.state;
    FLIGHT.t += 1;

    // автопилот: подходит, стреляет, уклоняется
    if (FLIGHT.autopilot) {
        s.dist = Math.max(2000, s.dist - 180);
        s.speed = 2400 + Math.sin(FLIGHT.t / 40) * 600;
        if (s.dist < 26000 && FLIGHT.t % 30 === 0) {
            s.targetHull = Math.max(0, s.targetHull - (9 + Math.random() * 8));
            flightLog('Автопилот: залп, корпус цели ' + Math.round(s.targetHull) + '%');
        }
        if (s.targetHull > 0 && FLIGHT.t % 90 === 0) {
            s.shield = Math.max(0, s.shield - 6);
            if (s.shield === 0) s.hull = Math.max(0, s.hull - 4);
            flightLog('Попадание: щит ' + Math.round(s.shield) + '%');
        }
        s.fuel = Math.max(0, s.fuel - 0.05);
    } else {
        s.dist = Math.max(500, s.dist - s.speed / 60);
        s.fuel = Math.max(0, s.fuel - 0.02);
    }

    // фон: звёзды
    ctx.fillStyle = '#03060c';
    ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 160; i++) {
        const x = (i * 137.5) % W, y = (i * 89.3) % H;
        ctx.fillStyle = 'rgba(255,255,255,' + (0.15 + (i % 7) / 20) + ')';
        ctx.fillRect(x, y, 1.2, 1.2);
    }

    // прицел
    ctx.strokeStyle = 'rgba(127,227,255,0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(W / 2, H / 2, 90, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(W / 2 - 120, H / 2); ctx.lineTo(W / 2 + 120, H / 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(W / 2, H / 2 - 120); ctx.lineTo(W / 2, H / 2 + 120); ctx.stroke();

    // цель
    if (s.targetHull > 0) {
        const scale = Math.min(1, 26000 / Math.max(s.dist, 1));
        const r = 26 * scale + 4;
        ctx.fillStyle = 'rgba(255,120,80,0.85)';
        ctx.beginPath(); ctx.arc(W / 2, H / 2, r, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(255,180,120,0.6)';
        ctx.beginPath(); ctx.arc(W / 2, H / 2, r + 14, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = '#ffb37a';
        ctx.font = '12px system-ui';
        ctx.textAlign = 'center';
        ctx.fillText('Клык · ' + Math.round(s.targetHull) + '%', W / 2, H / 2 + r + 34);
        ctx.textAlign = 'left';
    } else {
        ctx.fillStyle = '#2ecc71';
        ctx.font = '18px system-ui';
        ctx.textAlign = 'center';
        ctx.fillText('Цель уничтожена', W / 2, H / 2);
        ctx.textAlign = 'left';
        if (!s.rewarded) {
            s.rewarded = true;
            const credits = 18000 + Math.round(Math.random() * 14000);
            const gold = 4 + Math.round(Math.random() * 10);
            currentUser.credits = (currentUser.credits || 0) + credits;
            currentUser.resources.gold = (currentUser.resources.gold || 0) + gold;
            // если квест на пирата взят и он на шаге абордажа — засчитываем
            if (currentUser.quests && currentUser.quests.pirate === 1) currentUser.quests.pirate = 2;
            saveUser(); updateCredits();
            flightLog('Победа: +' + credits.toLocaleString() + ' кр и ' + gold + ' кг золота');
        }
    }

    const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
    set('hud-speed', Math.round(s.speed).toLocaleString());
    set('hud-course', String(Math.round(s.course)).padStart(3, '0'));
    set('hud-shield', Math.round(s.shield));
    set('hud-hull', Math.round(s.hull));
    set('hud-fuel', Math.round(s.fuel));
    set('hud-dist', Math.round(s.dist).toLocaleString());

    FLIGHT.raf = requestAnimationFrame(loopFlight);
}

// Запуск боя конкретным бортом из дока: берём его корпус, щит и ход.
window.openFlightFor = (shipIndex) => {
    if (!currentUser || !currentUser.ships || !currentUser.ships[shipIndex]) { notify('Нет такого корабля'); return; }
    const ship = currentUser.ships[shipIndex];
    const def = SHIPS[ship.id];
    const drive = effectiveDrive(def.drive);
    openFlight();
    FLIGHT.shipIndex = shipIndex;
    FLIGHT.state.hull = 100;
    FLIGHT.state.shield = 100;
    FLIGHT.state.speed = Math.round(drive.vmax * 1000);
    FLIGHT.state.maxSpeed = Math.round(drive.vmax * 1200);
    FLIGHT.state.armament = (ship.artifact && ship.artifact.mult) ? ship.artifact.mult : 1;
    flightLog('Борт: «' + def.name + '» · ход ' + drive.vmax + ' у.е. · урон ×' + FLIGHT.state.armament);
};

window.openFlight = openFlight;
window.closeFlight = closeFlight;

// =========================================================
// ЧЁРНЫЙ РЫНОК
// =========================================================
// Ассортимент обновляется случайно: чертежи кораблей, артефакты, спецгруз.
// Редкое (артефакты, орудия) — только за кристаллы, обычное — за металл и воду.
const BM_GOODS = [
    { id: 'bp_scout', name: 'Чертеж: разведчик', kind: 'blueprint', ship: 'jet_scout', crystals: 2 },
    { id: 'bp_hauler', name: 'Чертеж: грузовик', kind: 'blueprint', ship: 'jet_hauler', crystals: 3 },
    { id: 'bp_lancer', name: 'Чертеж: ланцет', kind: 'blueprint', ship: 'plasma_lancer', crystals: 6 },
    { id: 'bp_frigate', name: 'Чертеж: фрегат', kind: 'blueprint', ship: 'grav_frigate', crystals: 9 },
    { id: 'bp_colossus', name: 'Чертеж: линкор', kind: 'blueprint', ship: 'grav_colossus', crystals: 14 },
    { id: 'art_weapon', name: 'Орудие Предтеч', kind: 'artifact', crystals: 8 },
    { id: 'art_item', name: 'Осколок без тени', kind: 'artifact', crystals: 4 },
    { id: 'res_steel', name: 'Партия стали · 500 т', kind: 'resource', res: 'steel', amount: 500, price: 60000 },
    { id: 'res_water', name: 'Партия воды · 800 т', kind: 'resource', res: 'water', amount: 800, price: 24000 },
    { id: 'res_chips', name: 'Ящик чипов · 40', kind: 'resource', res: 'chips', amount: 40, price: 18000 }
];

function bmOffers() {
    // детерминированный набор на текущие сутки
    const day = Math.floor(Date.now() / 86400000);
    let seed = day * 2654435761 % 2147483647;
    const pick = [];
    const pool = BM_GOODS.slice();
    for (let i = 0; i < 4 && pool.length; i++) {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        pick.push(pool.splice(seed % pool.length, 1)[0]);
    }
    return pick;
}

window.openBlackMarket = () => {
    let modal = document.getElementById('bm-modal');
    if (!modal) {
        document.body.insertAdjacentHTML('beforeend',
            '<div id="bm-modal" class="market-modal"><div class="market-modal-content" style="width:720px">' +
            '<span class="close-btn" onclick="closeBlackMarket()">&times;</span>' +
            '<h2>🕶 Чёрный рынок</h2><div id="bm-body"></div></div></div>');
        modal = document.getElementById('bm-modal');
    }
    modal.style.display = 'flex';
    renderBlackMarket();
};

window.closeBlackMarket = () => { const m = document.getElementById('bm-modal'); if (m) m.style.display = 'none'; };

function renderBlackMarket() {
    const body = document.getElementById('bm-body');
    if (!body || !currentUser) return;
    const crystals = currentUser.resources.eternity || 0;
    const offers = bmOffers().map(o => {
        const price = o.kind === 'resource'
            ? `<b>${o.price.toLocaleString()} кр</b>`
            : `<b>${o.crystals} крст</b>`;
        return `<div class="bm-row">
            <div><b>${o.name}</b><span>${
                o.kind === 'blueprint' ? 'чертеж · открывает постройку корпуса'
                : o.kind === 'artifact' ? 'артефакт · редкая находка'
                : 'груз со склада пиратов'}</span></div>
            ${price}
            <button class="auth-btn" style="width:auto;padding:6px 12px;margin:0" onclick="bmBuy('${o.id}')">Купить</button>
        </div>`;
    }).join('');
    body.innerHTML = `<div class="mkt-summary"><span>кристаллы: <b>${crystals}</b></span>
        <span>кредиты: <b>${Math.round(currentUser.credits || 0).toLocaleString('ru-RU')}</b></span></div>
        <div class="bm-list">${offers}</div>
        <h3 class="npc-log-title">Выставить своё</h3>
        <div class="bm-list">
            ${['steel', 'water', 'chips'].map(rid => {
                const have = currentUser.resources[rid] || 0;
                const price = { steel: 2, water: 1, chips: 3 }[rid];
                return `<div class="bm-row">
                    <div><b>${RESOURCES[rid].name}</b><span>у вас ${have.toLocaleString()} · ${price} крст за 100</span></div>
                    <div class="bm-actions">
                        <button class="auth-btn" style="width:auto;padding:5px 10px;margin:0" onclick="bmSellResource('${rid}',${price},100)">100</button>
                        <button class="auth-btn" style="width:auto;padding:5px 10px;margin:0" onclick="bmSellResource('${rid}',${price},500)">500</button>
                        <button class="auth-btn" style="width:auto;padding:5px 10px;margin:0" onclick="bmSellResource('${rid}',${price},0)">всё</button>
                    </div>
                </div>`;
            }).join('')}
        </div>
        <div class="bm-list">
            ${(currentUser.artifacts || []).map((a, i) => `<div class="bm-row">
                <div><b>${a.name}</b><span>ваш артефакт · продать за ${a.crystals} крст</span></div>
                <button class="auth-btn" style="width:auto;padding:6px 12px;margin:0" onclick="sellArtifact(${i})">Продать</button>
            </div>`).join('') || '<div class="bm-row"><span>нечего выставить — артефактов нет</span></div>'}
        </div>`;
}

window.bmSellResource = (id, price, amount) => {
    if (!currentUser) return;
    const have = currentUser.resources[id] || 0;
    const qty = amount === 0 ? Math.floor(have / 100) * 100 : amount;
    if (qty < 100 || have < qty) { notify('Нужно минимум 100 единиц'); return; }
    // Сделку считает сервер: он же решает, сколько кристаллов за это дать
    fetch('/api/bm/sell', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Auth-Token': localStorage.getItem('galaktika_token') || '' },
        body: JSON.stringify({ resource: id, qty: qty })
    }).then(r => r.json()).then(res => {
        if (res.error) { notify(res.error); return; }
        if (window.pullServerProfile) window.pullServerProfile();
        currentUser.resources[id] = (currentUser.resources[id] || 0) - qty;
        currentUser.resources.eternity = (currentUser.resources.eternity || 0) + res.crystals;
        saveUser(); updateCredits(); renderBlackMarket();
        notify('Продано ' + qty.toLocaleString() + ' единиц за ' + res.crystals + ' крст');
    }).catch(() => {
        // сервер недоступен — считаем локально, как раньше
        currentUser.resources[id] -= qty;
        const gain = Math.max(1, Math.round(price * qty / 100));
        currentUser.resources.eternity = (currentUser.resources.eternity || 0) + gain;
        saveUser(); updateCredits(); renderBlackMarket();
        notify('Продано ' + qty.toLocaleString() + ' единиц за ' + gain + ' крст');
    });
};

window.bmBuy = (id) => {
    const o = bmOffers().find(x => x.id === id);
    if (!o) { notify('Товар уже продан'); return; }
    if (o.kind === 'resource') {
        if (currentUser.credits < o.price) { notify('Не хватает кредитов'); return; }
        currentUser.credits -= o.price;
        currentUser.resources[o.res] = (currentUser.resources[o.res] || 0) + o.amount;
    } else {
        if ((currentUser.resources.eternity || 0) < o.crystals) { notify('Не хватает кристаллов Вечности'); return; }
        currentUser.resources.eternity -= o.crystals;
        if (o.kind === 'artifact') {
            currentUser.artifacts = currentUser.artifacts || [];
            currentUser.artifacts.push({ key: 'bm:' + o.id, name: o.name, kind: 'предмет', crystals: 4 });
        } else {
            currentUser.blueprints = currentUser.blueprints || {};
            currentUser.blueprints[o.ship] = true;
        }
    }
    saveUser(); updateCredits(); renderBlackMarket();
    notify('Куплено: ' + o.name);
};

// =========================================================
// МОДЕРНИЗАЦИЯ КОРАБЛЯ
// =========================================================
// Один экран: корпус, двигатель, артефакт. Всё, что можно улучшить — здесь.
window.openModernize = (shipIndex) => {
    let modal = document.getElementById('mod-modal');
    if (!modal) {
        document.body.insertAdjacentHTML('beforeend',
            '<div id="mod-modal" class="market-modal"><div class="market-modal-content" style="width:640px">' +
            '<span class="close-btn" onclick="closeModernize()">&times;</span>' +
            '<h2>🔧 Модернизация</h2><div id="mod-body"></div></div></div>');
        modal = document.getElementById('mod-modal');
    }
    modal.style.display = 'flex';
    renderModernize(shipIndex);
};

window.closeModernize = () => { const m = document.getElementById('mod-modal'); if (m) m.style.display = 'none'; };

function renderModernize(shipIndex) {
    const body = document.getElementById('mod-body');
    if (!body || !currentUser || !currentUser.ships[shipIndex]) { if (body) body.innerHTML = '<p>Корабль не найден</p>'; return; }
    const ship = currentUser.ships[shipIndex];
    const def = SHIPS[ship.id];
    const drive = effectiveDrive(def.drive);
    const lvl = (currentUser.driveTech && currentUser.driveTech[def.drive]) || 1;
    const cost = 25000 * lvl;
    const arts = currentUser.artifacts || [];

    body.innerHTML = `
        <div class="mod-head"><b>«${def.name}»</b><span>${def.cls} · ${def.driveLabel || def.drive}</span></div>
        <div class="mod-row"><span>Двигатель</span><b>уровень ${lvl} · ход ${drive.vmax} у.е.</b>
            <button class="auth-btn" style="width:auto;padding:6px 12px;margin:0" onclick="modUpgrade(${shipIndex})">Улучшить · ${cost.toLocaleString()} кр</button></div>
        <div class="mod-row"><span>Орудие</span><b>${ship.artifact ? ship.artifact.name + ' (×' + ship.artifact.mult + ')' : 'не установлено'}</b>
            ${ship.artifact ? `<button class="auth-btn" style="width:auto;padding:6px 12px;margin:0" onclick="modRemoveArtifact(${shipIndex})">Снять</button>` : ''}</div>
        <h3 class="npc-log-title">Артефакты в трюме</h3>
        <div class="bm-list">${arts.length ? arts.map((a, i) => `<div class="bm-row">
            <div><b>${a.name}</b><span>${a.kind}${a.effect ? ' · можно установить' : ' · только на продажу'}</span></div>
            ${a.effect ? `<button class="auth-btn" style="width:auto;padding:6px 12px;margin:0" onclick="modInstall(${i})">Установить</button>` : ''}
        </div>`).join('') : '<div class="bm-row"><span>пусто</span></div>'}</div>`;
}

window.modUpgrade = (shipIndex) => {
    const ship = currentUser.ships[shipIndex];
    const def = SHIPS[ship.id];
    try {
        if (typeof upgradeDrive === 'function') { upgradeDrive(def.drive); }
        else { notify('Улучшение недоступно'); return; }
    } catch (e) { notify('Ошибка улучшения'); return; }
    renderModernize(shipIndex);
};

window.modInstall = (artifactIndex) => {
    try { installArtifact(artifactIndex); } catch (e) { notify('Не удалось установить'); return; }
    renderModernize(window.__modShip || 0);
};

window.modRemoveArtifact = (shipIndex) => {
    const ship = currentUser.ships[shipIndex];
    if (!ship || !ship.artifact) return;
    currentUser.artifacts = currentUser.artifacts || [];
    currentUser.artifacts.push({ key: 'removed:' + Date.now(), name: ship.artifact.name, kind: 'оружие', crystals: 3, effect: { type: 'damage', mult: ship.artifact.mult } });
    delete ship.artifact;
    saveUser(); renderModernize(shipIndex); notify('Орудие снято в трюм');
};

// =========================================================
// ОБУЧЕНИЕ
// =========================================================
// Пять шагов для нового капитана. Показывается один раз.
const TUTORIAL = [
    { t: 'Добро пожаловать', d: 'Вы — выпускник Университета Экспансии. У вас есть допуск к Вратам и 80 000 кредитов. Цель — свой корабль и своя колония.' },
    { t: 'Шаг 1. Осмотритесь', d: 'Откройте «Биржу»: там продают зерно, воду, металлы и детали для корабля.' },
    { t: 'Шаг 2. Постройте «Искру»', d: 'Разведчик «Искра» стоит 18 000 кр и требует 60 т стали, 20 т меди, 10 т никеля, 2 т серебра, 1 т золота и 8 чипов. Всё это есть на бирже, стройка идёт 5 минут.' },
    { t: 'Шаг 3. Первый рейс', d: 'Отправьте борт в рейс кнопкой в доке. Маршрут выберется сам, груз закупится. Через 30–40 минут вернётся прибыль.' },
    { t: 'Шаг 4. Застройте мир', d: 'В доке есть «Жилой массив» — 40 000 кр и 12 минут. Каждые 10 % застройки дают премию 50 000.' },
    { t: 'Шаг 5. Опасность', d: 'Пираты держат тень Юпитера и кольца Сатурна. Если у вас есть боевой борт — жмите «⚔ В бой» и отбивайтесь. 35 % их атак отбиваются.' }
];

function showTutorial(step) {
    const i = step || 0;
    let modal = document.getElementById('tut-modal');
    if (!modal) {
        document.body.insertAdjacentHTML('beforeend',
            '<div id="tut-modal" class="market-modal"><div class="market-modal-content" style="width:560px">' +
            '<div id="tut-body"></div></div></div>');
        modal = document.getElementById('tut-modal');
    }
    modal.style.display = 'flex';
    const s = TUTORIAL[i];
    document.getElementById('tut-body').innerHTML =
        `<div class="tut-kicker">ОБУЧЕНИЕ · ${i + 1} из ${TUTORIAL.length}</div>` +
        `<h2 class="tut-title">${s.t}</h2>` +
        `<p class="tut-text">${s.d}</p>` +
        `<div class="tut-actions">` +
        (i < TUTORIAL.length - 1
            ? `<button class="auth-btn" style="width:auto;padding:10px 22px;margin:0" onclick="showTutorial(${i + 1})">Далее</button>`
            : `<button class="auth-btn" style="width:auto;padding:10px 22px;margin:0" onclick="closeTutorial()">Понятно</button>`) +
        `<button class="auth-btn" style="width:auto;padding:10px 22px;margin:0;background:transparent;border-color:rgba(255,255,255,0.2)" onclick="closeTutorial()">Пропустить</button>` +
        `</div>`;
}

window.showTutorial = showTutorial;
window.closeTutorial = () => {
    const m = document.getElementById('tut-modal');
    if (m) m.style.display = 'none';
    try { localStorage.setItem('gm_tutorial_done', '1'); } catch (e) {}
};

function maybeTutorial() {
    // не показывать в тестовых режимах и для скриншотов
    if (/[?&]notutor=1/.test(location.search)) return;
    if (/[?&]shot=1/.test(location.search)) return;
    let done = false;
    try { done = localStorage.getItem('gm_tutorial_done') === '1'; } catch (e) {}
    if (done) return;
    // только новичкам: без кораблей и колонии, иначе обучение мешает играть
    const u = (typeof currentUser !== 'undefined' && currentUser) ? currentUser : null;
    if (!u) return;
    if ((u.ships && u.ships.length) || u.colony) return;
    setTimeout(() => showTutorial(0), 1500);
}

// Чертёж корабля: отдельный 3D-вид, сам корабль не трогаем.
let blueprintModule = null;

// Дополнительный контур двигателя: второй мотор на том же корпусе.
window.buyEngineContour = (type) => {
    ensureFleet(currentUser);
    ensureResearch(currentUser);
    if (!currentUser.driveExtra) currentUser.driveExtra = {};
    const have = currentUser.driveExtra[type] || 0;
    if (have >= 3) { notify('Максимум три контура'); return; }
    import('/js/engines.js').then(m => {
        const price = m.extraCost(type, have);
        if (currentUser.credits < price) { notify('Нужно ' + price.toLocaleString() + ' кр'); return; }
        currentUser.credits -= price;
        currentUser.driveExtra[type] = have + 1;
        saveUser(); updateCredits();
        notify('Контур установлен: ' + (have + 1) + ' из 3');
    }).catch(() => notify('Модуль двигателей недоступен'));
};

window.openBlueprint = (shipId) => {
    import('/js/blueprint.js')
        .then(m => { blueprintModule = m; m.open(shipId); })
        .catch(e => { console.warn('blueprint:', e); notify('Чертёж недоступен'); });
};

window.closeBlueprint = () => {
    if (blueprintModule) blueprintModule.close();
    else { const m = document.getElementById('bp-modal'); if (m) m.style.display = 'none'; }
};

// Чертёж двигателя: схема, уровни и дополнительный контур.
window.openEngineBlueprint = (type) => {
    const t = type || 'jet';
    let modal = document.getElementById('eng-modal');
    if (!modal) {
        document.body.insertAdjacentHTML('beforeend',
            '<div id="eng-modal" class="market-modal"><div class="market-modal-content" style="width:680px">' +
            '<span class="close-btn" onclick="document.getElementById(\'eng-modal\').style.display=\'none\'">&times;</span>' +
            '<div id="eng-body"></div></div></div>');
        modal = document.getElementById('eng-modal');
    }
    modal.style.display = 'flex';
    import('/js/engines.js').then(m => {
        const e = m.ENGINES[t];
        const lvl = (currentUser && currentUser.driveTech && currentUser.driveTech[t]) || 1;
        const extra = 0;
        const rows = e.blueprint.map((b, i) => `<div class="bp-part"><span>${i + 1}</span><b>${b}</b></div>`).join('');
        document.getElementById('eng-body').innerHTML =
            `<div class="tut-kicker">ЧЕРТЁЖ ДВИГАТЕЛЯ</div>` +
            `<h2 class="tut-title">${e.code} · ${e.name}</h2>` +
            `<p class="tut-text">${e.note}</p>` +
            `<div class="bp-parts" style="flex-direction:column;align-items:flex-start">${rows}</div>` +
            `<div class="bp-parts" style="margin-top:16px">` +
            `<div class="bp-part"><span>Ход, ур. ${lvl}</span><b>${m.speed(t, lvl, extra)} у.е.</b></div>` +
            `<div class="bp-part"><span>С +3 контурами</span><b>${m.speed(t, lvl, 3)} у.е.</b></div>` +
            `<div class="bp-part"><span>Расход топлива</span><b>${m.fuelUse(t, lvl, extra)}</b></div>` +
            `<div class="bp-part"><span>Апгрейд до ур. ${Math.min(5, lvl + 1)}</span><b>${m.upgradeCost(t, lvl).toLocaleString()} кр</b></div>` +
            `<div class="bp-part"><span>Доп. контур</span><b>${m.extraCost(t, 0).toLocaleString()} кр</b></div>` +
            `</div>`;
    }).catch(err => { console.warn('engines:', err); notify('Чертёж двигателя недоступен'); });
};

// Энциклопедия: отдельный модуль, разделы и карточки с анимацией.
window.openEncyclopedia = (section) => {
    import('/js/encyclopedia.js')
        .then(m => m.open(section))
        .catch(e => { console.warn('enc:', e); notify('Энциклопедия недоступна'); });
};

function buildSurfaceUI() {
    const items = document.getElementById('left-menu-items');
    if (items && !document.getElementById('surface-btn')) {
        const btn = document.createElement('button');
        btn.id = 'surface-btn';
        btn.className = 'menu-btn';
        btn.textContent = '🌍 Поверхность';
        btn.addEventListener('click', () => window.openGlobe((currentUser && currentUser.faction) || 'earth'));
        items.appendChild(btn);
    }
}

// =========================================================
// ГИЛЬДИИ
// =========================================================
// Гильдия — союз игроков: общий чат, общая казна, помощь в обороне.
// Пока без сервера чат локальный: сообщения видны на этом устройстве.
const GUILD_STORAGE = 'gm_guild_v1';

function loadGuild() {
    try { return JSON.parse(localStorage.getItem(GUILD_STORAGE)) || null; } catch (e) { return null; }
}
function saveGuild(g) { try { localStorage.setItem(GUILD_STORAGE, JSON.stringify(g)); } catch (e) {} }

const GUILD_CREATE_COST = 50000;

function renderGuild() {
    const body = document.getElementById('guild-body');
    if (!body) return;
    const g = loadGuild();
    if (!g) {
        body.innerHTML = `<div class="guild-empty">
            <p>Вы не в гильдии. Создание стоит ${GUILD_CREATE_COST.toLocaleString()} кр.</p>
            <p class="guild-note">Гильдия даёт общий чат, казну и защиту: союзники видят нападение на вашу систему и могут прийти на помощь.</p>
            <input id="guild-name" class="auth-input" placeholder="Название гильдии" maxlength="24">
            <button class="auth-btn" onclick="createGuild()">Создать гильдию</button>
        </div>`;
        return;
    }
    const msgs = (g.chat || []).slice(-30).map(m =>
        `<div class="guild-msg"><b>${m.from}</b><span>${m.t}</span><p>${m.text}</p></div>`).join('')
        || '<div class="guild-msg"><i>сообщений пока нет</i></div>';
    body.innerHTML = `<div class="guild-head">
            <div><b>${g.name}</b><span>участников: ${(g.members || []).length}</span></div>
            <div class="guild-treasury">казна: <b>${(g.treasury || 0).toLocaleString()}</b> кр</div>
        </div>
        <div class="guild-chat">${msgs}</div>
        <div class="guild-input"><input id="guild-msg" class="auth-input" placeholder="Сообщение гильдии" maxlength="200">
        <button class="auth-btn" onclick="sendGuildMessage()">Отправить</button></div>`;
}

window.createGuild = () => {
    if (!currentUser) return;
    if (currentUser.credits < GUILD_CREATE_COST) { notify('Нужно ' + GUILD_CREATE_COST.toLocaleString() + ' кр'); return; }
    const nameEl = document.getElementById('guild-name');
    const name = (nameEl && nameEl.value.trim()) || 'Безымянная гильдия';
    currentUser.credits -= GUILD_CREATE_COST;
    saveUser(); updateCredits();
    saveGuild({ name: name, owner: currentUser.email, members: [currentUser.email], treasury: 0, chat: [] });
    notify('Гильдия «' + name + '» создана');
    renderGuild();
};

window.sendGuildMessage = () => {
    const g = loadGuild();
    const input = document.getElementById('guild-msg');
    if (!g || !input || !input.value.trim()) return;
    g.chat = g.chat || [];
    g.chat.push({ from: currentUser.gameName || currentUser.email, text: input.value.trim(), t: new Date().toLocaleTimeString('ru-RU').slice(0, 5) });
    input.value = '';
    saveGuild(g);
    renderGuild();
};

window.openGuild = () => {
    let modal = document.getElementById('guild-modal');
    if (!modal) {
        document.body.insertAdjacentHTML('beforeend',
            '<div id="guild-modal" class="market-modal"><div class="market-modal-content" style="width:640px">' +
            '<span class="close-btn" onclick="closeGuild()">&times;</span>' +
            '<h2>🛡 Гильдия</h2><div id="guild-body"></div></div></div>');
        modal = document.getElementById('guild-modal');
    }
    modal.style.display = 'flex';
    renderGuild();
};
window.closeGuild = () => { const m = document.getElementById('guild-modal'); if (m) m.style.display = 'none'; };

function buildGuildUI() {
    const items = document.getElementById('left-menu-items');
    if (items && !document.getElementById('guild-btn')) {
        const btn = document.createElement('button');
        btn.id = 'guild-btn';
        btn.className = 'menu-btn';
        btn.textContent = '🛡 Гильдия';
        btn.addEventListener('click', window.openGuild);
        items.appendChild(btn);
    }
}

// =========================================================
// ПЕРЕГРУППИРОВКА МЕНЮ
// =========================================================
// Кнопки собираются разными модулями, здесь они раскладываются по смыслу.
const MENU_SECTIONS_LEGACY = [
    { title: 'Игра', keys: ['флот', 'квест', 'кодекс', 'разведсводка', 'поверхность', 'легенда', 'корабли'] },
    { title: 'Экономика', keys: ['биржа', 'постройки', 'наука'] },
    { title: 'Гильдия', keys: ['гильдия'] },
    { title: 'Администратор', keys: ['админ', 'монитор', 'пользовател'] }
];

function regroupMenuLegacy() {
    const items = document.getElementById('left-menu-items');
    if (!items) return;
    const buttons = Array.from(items.querySelectorAll('.menu-btn, button'));
    if (!buttons.length) return;
    const used = new Set();
    const html = [];
    MENU_SECTIONS.forEach(sec => {
        const matched = buttons.filter(b => {
            if (used.has(b)) return false;
            const t = (b.textContent || '').toLowerCase();
            return sec.keys.some(k => t.includes(k));
        });
        if (!matched.length) return;
        matched.forEach(b => used.add(b));
        html.push(`<div class="menu-sec"><span class="menu-sec-title">${sec.title}</span></div>`);
        matched.forEach(b => { items.appendChild(b); });
    });
    buttons.forEach(b => { if (!used.has(b)) items.appendChild(b); });
    // заголовки вставляем перед кнопками
    MENU_SECTIONS.forEach(sec => {
        const first = buttons.find(b => !b.dataset.placed && sec.keys.some(k => (b.textContent || '').toLowerCase().includes(k)));
    });
}

// =========================================================
// КАТАЛОГ ГАЛАКТИКИ
// =========================================================
// Адрес -> система. Генерация детерминированная: один адрес всегда даёт
// одну и ту же звезду, планеты и ресурсы, у всех игроков одинаково.
const STAR_CATALOG = [
    { id: 'СОЛ', name: 'Солнце', ly: 0, cls: 'G' },
    { id: 'АЛЬФА-ЦЕНТАВРА', name: 'Альфа Центавра', ly: 4.37, cls: 'G' },
    { id: 'БАРНАРДА', name: 'Звезда Барнарда', ly: 5.96, cls: 'M' },
    { id: 'ВОЛЬФ-359', name: 'Вольф 359', ly: 7.86, cls: 'M' },
    { id: 'ЛАЛАНД-21185', name: 'Лаланд 21185', ly: 8.29, cls: 'M' },
    { id: 'СИРИУС', name: 'Сириус', ly: 8.6, cls: 'A' },
    { id: 'ЛЮТЕН-7268', name: 'Лютен 726-8', ly: 8.73, cls: 'M' },
    { id: 'РОСС-154', name: 'Росс 154', ly: 9.7, cls: 'M' },
    { id: 'РОСС-248', name: 'Росс 248', ly: 10.3, cls: 'M' },
    { id: 'ЭПСИЛОН-ЭРИДАНА', name: 'Эпсилон Эридана', ly: 10.5, cls: 'K' },
    { id: 'ПРОЦИОН', name: 'Процион', ly: 11.46, cls: 'F' },
    { id: '61-ЛЕБЕДЯ', name: '61 Лебедя', ly: 11.4, cls: 'K' },
    { id: 'ТАУ-КИТА', name: 'Тау Кита', ly: 11.9, cls: 'G' },
    { id: 'ЭПСИЛОН-ИНДЕЙЦА', name: 'Эпсилон Индейца', ly: 11.8, cls: 'K' },
    { id: 'ГРУМБРИДЖ-1618', name: 'Грумбридж 1618', ly: 15.9, cls: 'K' },
    { id: 'ГЛИЗЕ-581', name: 'Глизе 581', ly: 20.4, cls: 'M' },
    { id: 'ДЗЕТА-СЕТКИ', name: 'Дзета Сетки', ly: 39.5, cls: 'G' },
    { id: 'TRAPPIST-1', name: 'TRAPPIST-1', ly: 40.7, cls: 'M' },
    { id: 'КЕПЛЕР-186', name: 'Кеплер-186', ly: 561, cls: 'M' },
    { id: 'КЕПЛЕР-452', name: 'Кеплер-452', ly: 1800, cls: 'G' }
];

// Альянс — колыбель человечества: Солнечная система и пять первых колоний,
// освоенных до начала масштабной экспансии. Всё остальное за Вратами — фронтир.
// Кто владеет мирами Солнечной системы. Игрок приходит на всё готовое:
// планетами управляют агенты, у нового капитана — только его корабль.
const PLANET_OWNERS = {
    'Земля': 'n1', 'Луна': 'n1',
    'Марс': 'n3', 'Фобос': 'n3', 'Деймос': 'n3',
    'Венера': 'n5', 'Меркурий': 'n5',
    'Церера': 'n4', 'Пояс': 'n4',
    'Юпитер': 'n6', 'Ганимед': 'n6', 'Европа': 'n6',
    'Сатурн': 'p2', 'Титан': 'p2',
    'Уран': 'n5', 'Нептун': 'n5'
};

function planetOwner(name) {
    const id = PLANET_OWNERS[name];
    if (!id || typeof NPC_AGENTS === 'undefined') return null;
    return NPC_AGENTS.find(a => a.id === id) || null;
}

const ALLIANCE_CORE = [
    'ГМ-СОЛ', 'ГМ-АЛЬФА-ЦЕНТАВРА', 'ГМ-ТАУ-КИТА',
    'ГМ-ЭПСИЛОН-ЭРИДАНА', 'ГМ-ГЛИЗЕ-581', 'ГМ-TRAPPIST-1'
];

function isAlliance(addr) { return ALLIANCE_CORE.indexOf(normalizeAddress(addr)) >= 0; }

const STAR_CLASSES = { M: 'красный карлик', K: 'оранжевый карлик', G: 'жёлтый карлик', F: 'бело-жёлтая', A: 'белая' };

// Обитаемость: на Венере и газовых гигантах жить нельзя, но газовый гигант —
// источник водорода и гелия, а его ледяные спутники и пояс астероидов —
// годятся под станции. Астровитянам пояс подходит лучше планеты.
const PLANET_TYPES = [
    { t: 'каменистая', live: 0.045, res: 'metals' },
    { t: 'океанид', live: 0.045, res: 'water' },
    { t: 'пустынная', live: 0.03, res: 'metals' },
    { t: 'венера', live: 0, res: 'none' },
    { t: 'газовый гигант', live: 0, res: 'hydrogen' },
    { t: 'ледяной гигант', live: 0, res: 'helium' }
];

function addrHash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
}
function addrRand(seed) {
    let s = seed >>> 0;
    return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

function normalizeAddress(raw) {
    return String(raw || '').trim().toUpperCase().replace(/\s+/g, '');
}

function systemFromAddress(raw) {
    const addr = normalizeAddress(raw);
    if (!addr) return null;
    const rnd = addrRand(addrHash(addr));

    // именованная звезда, каталожная или порядковая
    let known = STAR_CATALOG.find(s => addr === 'ГМ-' + s.id || addr === s.id);
    let name, ly, cls;
    if (known) {
        name = known.name; ly = known.ly; cls = known.cls;
    } else {
        cls = ['M', 'M', 'K', 'G', 'F', 'A'][Math.floor(rnd() * 6)];
        ly = 10 + Math.floor(rnd() * 990);
        name = addr.replace('ГМ-', '');
    }

    const planetCount = 2 + Math.floor(rnd() * 8);
    const planets = [];
    for (let i = 0; i < planetCount; i++) {
        const def = PLANET_TYPES[Math.floor(rnd() * PLANET_TYPES.length)];
        const habitable = def.live > 0 && rnd() < def.live;
        // параметры каменистых миров: землеподобность решает всё для Земли
        let params = null, earthLike = false;
        if (def.live > 0) {
            const g = 0.55 + rnd() * 1.25;                 // g
            const temp = -70 + rnd() * 140;                // °C
            const water = Math.round(rnd() * 100);         // %
            const atmo = ['нет', 'тонкая', 'плотная'][Math.floor(rnd() * 3)];
            earthLike = Math.abs(g - 1) < 0.25 && temp > -10 && temp < 35 && water > 30 && atmo !== 'нет';
            params = { g: Math.round(g * 100) / 100, temp: Math.round(temp), water: water, atmo: atmo };
        }
        planets.push({ type: def.t, colonizable: habitable, res: def.res, ice: rnd() > 0.5,
                       params: params, earthLike: earthLike });
    }

    // пояс астероидов — жильё для астровитян и металлы
    const belt = rnd() < 0.25;
    // ледяные спутники газовых гигантов — вода и станции
    const iceMoons = planets.filter(p => p.res === 'hydrogen' || p.res === 'helium').filter(() => rnd() < 0.2).length;
    // именованные звёзды исследовали первыми именно потому, что у них нашли
    // кандидатов на колонизацию — как минимум одно тело там есть всегда
    if (known && !planets.some(p => p.colonizable)) {
        const idx = planets.findIndex(p => /каменистая|океанид|пустынная/.test(p.type));
        if (idx >= 0) planets[idx].colonizable = true;
    }
    // землеподобная планета — лучший приз: Земля терраформирует её и разводит биологию
    if (!planets.some(p => p.earthLike)) {
        const rocky = planets.filter(p => p.params);
        if (rocky.length && rnd() < 0.04) {
            const p = rocky[Math.floor(rnd() * rocky.length)];
            p.earthLike = true;
            p.params.g = Math.round((0.85 + rnd() * 0.3) * 100) / 100;
            p.params.temp = Math.round(-5 + rnd() * 35);
            p.params.water = 35 + Math.round(rnd() * 55);
            p.params.atmo = 'плотная';
            p.colonizable = true;
        }
    }
    // Земля — эталон: в Солнечной системе всегда есть землеподобный мир
    if (known && known.id === 'СОЛ' && planets.length >= 3) {
        const p = planets[2];
        p.earthLike = true;
        p.colonizable = true;
        p.type = 'каменистая';
        p.params = { g: 1.0, temp: 15, water: 71, atmo: 'плотная' };
    }
    const colonizable = planets.filter(p => p.colonizable);
    const habitats = colonizable.length + (belt ? 1 : 0) + iceMoons;
    const hasPortal = habitats > 0;

    // 1 % систем хранят след предыдущих цивилизаций
    let artifact = null;
    if (rnd() < 0.01) {
        const kinds = [
            { kind: 'постройка', names: ['Руины орбитального кольца', 'Разбитый купол', 'Башня неизвестных', 'Шпиль у мёртвой звезды'] },
            { kind: 'знания', names: ['Архив навигации', 'Библиотека карт', 'Записи о Вратах', 'Матрица расчётов'] },
            { kind: 'предмет', names: ['Осколок без тени', 'Ключ Врат', 'Резонатор', 'Звездный компас'] },
            { kind: 'оружие', names: ['Орудие Предтеч', 'Пушка Пустоты', 'Резонатор-излучатель', 'Клык Бездны'] }
        ];
        const k = kinds[Math.floor(rnd() * kinds.length)];
        artifact = {
            kind: k.kind,
            name: k.names[Math.floor(rnd() * k.names.length)],
            crystals: 1 + Math.floor(rnd() * 4),
            // оружие неизвестного принципа: на боевом корабле даёт ×10 к урону
            effect: k.kind === 'оружие' ? { type: 'damage', mult: 10 } : null
        };
    }

    return {
        address: addr,
        alliance: isAlliance(addr),
        name: name,
        star: STAR_CLASSES[cls] + ' (' + cls + ')',
        ly: ly,
        planets: planets,
        colonizable: colonizable.length,
        belt: belt,
        iceMoons: iceMoons,
        gasGiants: planets.filter(p => p.res === 'hydrogen' || p.res === 'helium').length,
        habitats: habitats,
        artifact: artifact,
        portal: hasPortal,
        risk: hasPortal ? (Math.round(rnd() * 100)) : null
    };
}

function renderMap() {
    const body = document.getElementById('map-body');
    if (!body) return;
    const input = document.getElementById('map-addr');
    const raw = (input && input.value) || 'ГМ-АЛЬФА-ЦЕНТАВРА';
    const s = systemFromAddress(raw);
    if (!s) { body.innerHTML = '<p class="muted">Введите адрес вида ГМ-СИРИУС или ГМ-HIP-32349</p>'; return; }
    const planets = s.planets.map((p, i) => {
        let extra = '';
        if (p.params) extra = ` · ${p.params.g} g · ${p.params.temp} °C · вода ${p.params.water}% · ${p.params.atmo} атмосфера`;
        const badge = p.earthLike ? ' · <span class="earth">близка к Земле</span>'
            : (p.colonizable ? ' · <span class="ok">колонизируемая</span>' : '');
        const note = p.earthLike ? '<div class="terra">терраформирование по земным нормам: биология, растения, атмосфера</div>' : '';
        return `<li><b>${i + 1}.</b> ${p.type}${extra}${badge}${note}</li>`;
    }).join('');
    body.innerHTML = `<div class="map-card">
        <div class="map-head"><b>${s.name}</b><span>${s.address}</span></div>
        <div class="map-row"><span>Звезда</span><b>${s.star}</b></div>
        <div class="map-row"><span>Расстояние</span><b>${s.ly} св. лет</b></div>
        <div class="map-row"><span>Статус</span><b class="${s.alliance ? 'ok' : ''}">${s.alliance ? 'Альянс' : 'фронтир'}</b></div>
        <div class="map-row"><span>Владелец</span><b>агенты Альянса</b></div>
        <div class="map-row"><span>Планет</span><b>${s.planets.length}</b></div>
        <div class="map-row"><span>Пригодных к колонизации</span><b>${s.colonizable}</b></div>
        <div class="map-row"><span>Врата</span><b class="${s.portal ? 'ok' : 'no'}">${s.portal ? 'есть — система в сети' : 'нет — жизни нет'}</b></div>
        <ul class="map-planets">${planets}</ul>
        ${s.artifact ? `<div class="artifact">
            <b>Артефакт: ${s.artifact.name}</b>
            <span>${s.artifact.kind} · можно продать за ${s.artifact.crystals} кристалл(ов) Вечности</span>
            <button class="auth-btn" style="margin-top:8px" onclick="claimArtifact('${s.address}')">Отправить экспедицию · 5 000 кр</button>
        </div>` : ''}
    </div>`;
}

window.claimArtifact = (address) => {
    if (!currentUser) return;
    const s = systemFromAddress(address);
    if (!s || !s.artifact) { notify('Артефактов здесь нет'); return; }
    if (currentUser.credits < 5000) { notify('Экспедиция стоит 5 000 кр'); return; }
    const scout = (currentUser.ships || []).find(x => x.id === 'jet_scout');
    if (!scout) { notify('Нужен разведчик'); return; }
    currentUser.credits -= 5000;
    currentUser.artifacts = currentUser.artifacts || [];
    const key = s.address + ':' + s.artifact.name;
    if (currentUser.artifacts.some(a => a.key === key)) { notify('Этот артефакт уже у вас'); saveUser(); updateCredits(); return; }
    currentUser.artifacts.push({ key: key, name: s.artifact.name, kind: s.artifact.kind, crystals: s.artifact.crystals, effect: s.artifact.effect || null });
    saveUser(); updateCredits();
    notify('Артефакт «' + s.artifact.name + '» доставлен в трюм');
};

window.installArtifact = (index) => {
    if (!currentUser || !currentUser.artifacts || !currentUser.artifacts[index]) return;
    const a = currentUser.artifacts[index];
    if (!a.effect || a.effect.type !== 'damage') { notify('Этот артефакт нельзя установить на корабль'); return; }
    const combat = (currentUser.ships || []).filter(s => COMBAT_IDS.includes(s.id) && !s.artifact);
    if (!combat.length) { notify('Нужен свободный боевой корабль'); return; }
    const best = combat.sort((x, y) => (SHIPS[y.id].hull + SHIPS[y.id].shield) - (SHIPS[x.id].hull + SHIPS[x.id].shield))[0];
    best.artifact = { name: a.name, mult: a.effect.mult };
    currentUser.artifacts.splice(index, 1);
    saveUser(); notify(`${a.name} установлен на «${shipName(best.id)}»: урон ×${a.effect.mult}`);
    if (document.getElementById('fleet-modal') && document.getElementById('fleet-modal').style.display === 'flex') renderDock();
};

window.sellArtifact = (index) => {
    if (!currentUser || !currentUser.artifacts || !currentUser.artifacts[index]) return;
    const a = currentUser.artifacts[index];
    currentUser.resources.eternity = (currentUser.resources.eternity || 0) + a.crystals;
    currentUser.artifacts.splice(index, 1);
    saveUser(); updateCredits();
    notify('Продано: +' + a.crystals + ' Кристалл(ов) Вечности');
    if (typeof renderMarket === 'function') renderMarket();
};

window.openMap = () => {
    let modal = document.getElementById('map-modal');
    if (!modal) {
        document.body.insertAdjacentHTML('beforeend',
            '<div id="map-modal" class="market-modal"><div class="market-modal-content" style="width:660px">' +
            '<span class="close-btn" onclick="closeMap()">&times;</span>' +
            '<h2>🗺 Карта галактики</h2>' +
            '<div class="map-input"><input id="map-addr" class="auth-input" placeholder="ГМ-СИРИУС" value="ГМ-АЛЬФА-ЦЕНТАВРА">' +
            '<button class="auth-btn" onclick="renderMap()">Сканировать</button></div>' +
            '<div class="map-hint">Именованные: ГМ-СИРИУС, ГМ-ТАУ-КИТА. Каталожные: ГМ-HIP-32349. Порядковые: ГМ-000000001.</div>' +
            '<div id="map-body"></div></div></div>');
        modal = document.getElementById('map-modal');
    }
    modal.style.display = 'flex';
    renderMap();
};
window.closeMap = () => { const m = document.getElementById('map-modal'); if (m) m.style.display = 'none'; };

function buildMonitorUI() {
    const items = document.getElementById('left-menu-items');
    if (!items || document.getElementById('monitor-btn') || !currentUser || currentUser.role !== 'admin') return;
    const btn = document.createElement('button');
    btn.id = 'monitor-btn';
    btn.className = 'menu-btn';
    btn.textContent = '📊 Монитор';
    btn.addEventListener('click', () => window.openAdminModal());
    items.appendChild(btn);
}

function buildMapUI() {
    const items = document.getElementById('left-menu-items');
    if (items && !document.getElementById('map-btn')) {
        const btn = document.createElement('button');
        btn.id = 'map-btn';
        btn.className = 'menu-btn';
        btn.textContent = '🗺 Карта';
        btn.addEventListener('click', window.openMap);
        items.appendChild(btn);
    }
}

// === ПАНЕЛЬ ВИДИМОСТИ (правая панель) ===
const VIEW_KEY = 'galaktika_view';
const FILTERS_KEY = 'galaktika_filters_open';
let filtersOpen = localStorage.getItem(FILTERS_KEY) === '1';
let viewFlags = (() => {
    try { return Object.assign({ orbits: true, moons: true, belt: true, stars: true, labels: true, portal: true }, JSON.parse(localStorage.getItem(VIEW_KEY) || '{}')); }
    catch (e) { return { orbits: true, moons: true, belt: true, stars: true, labels: true, portal: true }; }
})();
const VIEW_ITEMS = [['orbits', 'Орбиты'], ['moons', 'Спутники'], ['belt', 'Пояс'], ['fleets', 'Флоты'],
                    ['stars', 'Звёзды'], ['labels', 'Подписи'], ['portal', 'Портал']];

function applyViewFlags() {
    const container = document.querySelector('.solar-system-container');
    if (container) {
        container.classList.toggle('hide-orbits', !viewFlags.orbits);
        container.classList.toggle('hide-moons', !viewFlags.moons);
        container.classList.toggle('hide-labels', !viewFlags.labels);
        container.classList.toggle('hide-portal', !viewFlags.portal);
        container.classList.toggle('hide-stars', !viewFlags.stars);
    }
    document.querySelectorAll('.ship-marker').forEach(el => {
        el.style.visibility = viewFlags.fleets === false ? 'hidden' : 'visible';
    });
    const civil = document.getElementById('civil-traffic');
    if (civil) civil.style.display = viewFlags.fleets === false ? 'none' : '';
    const fl = document.getElementById('fleet-dots');
    if (fl) fl.style.display = viewFlags.fleets === false ? 'none' : '';
    beltEnabled = viewFlags.belt && currentSystem && currentSystem.id === 'sol';
    if (!beltEnabled && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    document.querySelectorAll('.view-toggle').forEach(btn => {
        btn.classList.toggle('active', !!viewFlags[btn.dataset.flag]);
    });
}

window.toggleView = (flag) => {
    viewFlags[flag] = !viewFlags[flag];
    try { localStorage.setItem(VIEW_KEY, JSON.stringify(viewFlags)); } catch (e) { }
    applyViewFlags();
};

function buildViewPanel() {
    const panel = document.querySelector('.control-panel');
    if (!panel || document.getElementById('view-panel')) return;
    panel.insertAdjacentHTML('beforeend',
        '<div class="view-panel' + (filtersOpen ? '' : ' collapsed') + '" id="view-panel">' +
        '<button class="view-head" onclick="toggleFilters()"><span>Фильтры</span><span class="chev">▾</span></button>' +
        '<div class="view-grid">' +
        VIEW_ITEMS.map(([flag, label]) =>
            `<button class="view-toggle" data-flag="${flag}" onclick="toggleView('${flag}')">${label}</button>`).join('') +
        '</div></div>');
}

window.toggleFilters = () => {
    filtersOpen = !filtersOpen;
    try { localStorage.setItem(FILTERS_KEY, filtersOpen ? '1' : '0'); } catch (e) { }
    const panel = document.getElementById('view-panel');
    if (panel) panel.classList.toggle('collapsed', !filtersOpen);
};

// включает видимость ускоренных кнопок, если тестовый режим разрешён
function applyTestMode() {
    if (TIME_TEST_MODE) document.body.classList.add('test-mode');
    // «1x» (реальное время) убираем: при нём планеты делают оборот за год,
    // и кажется, что карта «замерла». Основной режим — 1 с = 1 мин.
    // кнопку «реальное время» больше не скрываем — она нужна игроку и админу
    document.querySelectorAll('.mode-btn[data-mode="real"]').forEach(b => { b.style.display = ''; });
    // ползунок не запираем: он же служит для тонкой настройки у админа
    const input = document.getElementById('time-scale');
    if (input) input.max = String(MAX_TIME_SCALE);
}

function buildTimeExtras() {
    const row = document.querySelector('#time-control-panel > div');
    if (!row || document.getElementById('pause-btn')) return;
    const btn = document.createElement('button');
    btn.id = 'pause-btn';
    btn.className = 'mode-btn';
    btn.dataset.mode = 'pause';
    btn.textContent = '⏸';
    btn.title = 'Пауза симуляции';
    btn.addEventListener('click', () => window.setTimeMode('pause'));
    row.insertBefore(btn, row.firstChild);
}

// === ИНТЕРФЕЙС ВЫБОРА СИСТЕМ ===
function buildSystemsUI() {
    const items = document.getElementById('left-menu-items');
    if (items && !document.getElementById('systems-btn')) {
        const btn = document.createElement('button');
        btn.id = 'systems-btn';
        btn.className = 'menu-btn';
        btn.textContent = '🌌 Системы';
        btn.addEventListener('click', window.openSystems);
        items.appendChild(btn);
    }
    if (!document.getElementById('systems-modal')) {
        document.body.insertAdjacentHTML('beforeend',
            '<div id="systems-modal" class="systems-modal"><div class="systems-modal-content">' +
            '<span class="close-btn" onclick="closeSystems()">&times;</span>' +
            '<h2>🌌 Системы</h2><div id="systems-list" class="systems-list"></div></div></div>');
    }
}

window.openSystems = () => {
    const modal = document.getElementById('systems-modal');
    if (!modal) return;
    const list = document.getElementById('systems-list');
    const entries = [{ id: 'sol', name: SOL_SYSTEM.name, count: SOL_SYSTEM.planets.length, star: 'жёлтый карлик' }];
    SYSTEM_SEEDS.forEach(seed => {
        const s = generateSystem(seed);
        entries.push({ id: s.id, name: s.name, count: s.planets.length, star: s.star.type });
    });
    list.innerHTML = entries.map(e => {
        const active = (currentSystem && currentSystem.id === e.id) ? ' active' : '';
        return `<button class="system-row${active}" onclick="switchSystem('${e.id}')">` +
            `<span class="system-name">${e.name}</span>` +
            `<span class="system-meta">${e.count} планет · ${e.star}</span>` +
            `${e.id === currentSystem.id ? '<span class="system-badge">вы здесь</span>' : ''}</button>`;
    }).join('');
    modal.style.display = 'flex';
};

window.closeSystems = () => {
    const modal = document.getElementById('systems-modal');
    if (modal) modal.style.display = 'none';
};

window.switchSystem = (id) => {
    const url = new URL(window.location.href);
    if (id === 'sol') url.searchParams.delete('system'); else url.searchParams.set('system', id);
    window.location.href = url.href;
};

// === ЗВЕЗДЫ ===
// Канва 6000x6000 — это 144 МБ видеопамяти ради ~100 видимых звёзд.
// 3000x3000 с той же плотностью даёт тот же вид при 36 МБ.
const STAR_FIELD = 3000;
const STAR_COUNT = 1800;
const starCanvas = document.getElementById('starfield-canvas');
const starCtx = starCanvas ? starCanvas.getContext('2d') : null;
if (starCanvas) { starCanvas.width = STAR_FIELD; starCanvas.height = STAR_FIELD; }
const stars = []; const nebulas = [ { x: 1750, y: 1650, r: 200, color: 'rgba(255, 100, 100, 0.15)' }, { x: 1100, y: 1300, r: 300, color: 'rgba(100, 100, 255, 0.15)' } ];
function initStars() { if (stars.length > 0) return; for (let i = 0; i < STAR_COUNT; i++) { stars.push({ x: Math.random() * STAR_FIELD, y: Math.random() * STAR_FIELD, r: Math.random() * 2.5 + 0.5, alpha: Math.random() * 0.8 + 0.2, color: Math.random() < 0.2 ? '#aaccff' : (Math.random() < 0.1 ? '#ffccaa' : '#ffffff') }); } }
function drawStars() {
    if (!starCtx) return; starCtx.clearRect(0, 0, STAR_FIELD, STAR_FIELD);
    nebulas.forEach(n => { const gradient = starCtx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.r); gradient.addColorStop(0, n.color); gradient.addColorStop(1, 'transparent'); starCtx.fillStyle = gradient; starCtx.beginPath(); starCtx.arc(n.x, n.y, n.r, 0, Math.PI * 2); starCtx.fill(); });
    stars.forEach(s => { starCtx.beginPath(); starCtx.arc(s.x, s.y, s.r, 0, Math.PI * 2); starCtx.fillStyle = s.color; starCtx.globalAlpha = s.alpha; starCtx.fill(); });
    starCtx.globalAlpha = 1.0;
}
initStars();

// === АСТЕРОИДЫ ===
const canvas = document.getElementById('asteroid-canvas');
const ctx = canvas ? canvas.getContext('2d') : null;
let beltEnabled = true;

// Буфер канвы должен совпадать с её CSS-размером: статическая разметка страницы
// может отставать от стилей, и тогда пояс рисуется в другом масштабе.
function sizeBeltCanvas() {
    if (!canvas) return;
    const size = Math.round(canvas.clientWidth || 700);
    if (size > 0 && canvas.width !== size) { canvas.width = size; canvas.height = size; }
}
// 15 000 объектов с пятью свойствами каждый — это 15 000 обращений к куче на кадр.
// 6 000 штук в типизированных массивах выглядят так же плотно, но дешевле в разы.
const BELT_COUNT = 9000;
let beltA = new Float64Array(0), beltE = new Float64Array(0), beltI = new Float64Array(0), beltPeriod = new Float64Array(0), beltEpoch = new Float64Array(0), beltInclCos = new Float64Array(0);
let beltReady = false;

// Пояс генерируется на клиенте: страница рендерится статически (SSR),
// поэтому OnAfterRenderAsync на стороне Blazor здесь не вызывается.
function generateAsteroids(count = BELT_COUNT) {
    beltA = new Float64Array(count); beltE = new Float64Array(count); beltI = new Float64Array(count);
    beltPeriod = new Float64Array(count); beltEpoch = new Float64Array(count); beltInclCos = new Float64Array(count);
    for (let i = 0; i < count; i++) {
        const a = 2.1 + Math.random() * 1.2;              // большая полуось, а.е.
        beltA[i] = a;
        beltE[i] = Math.random() * 0.2;                   // эксцентриситет
        const inc = Math.random() * 15;                   // наклонение, град
        beltI[i] = inc;
        beltInclCos[i] = Math.cos(inc * Math.PI / 180);   // cos наклонения считаем один раз
        // период по III закону Кеплера; ×40 — иначе на скорости 60×
        // астероиды и сборщики «летают» с колоссальной скоростью
        beltPeriod[i] = 365.25 * Math.pow(a, 1.5) * 40;
        beltEpoch[i] = Math.random() * 360;
    }
    beltReady = true;
}

// Совместимость: если данные всё же придут из .NET — используем их.
window.initAsteroids = (json) => {
    if (json) {
        try {
            const parsed = JSON.parse(json);
            if (Array.isArray(parsed) && parsed.length) {
                const n = parsed.length;
                beltA = new Float64Array(n); beltE = new Float64Array(n); beltI = new Float64Array(n);
                beltPeriod = new Float64Array(n); beltEpoch = new Float64Array(n); beltInclCos = new Float64Array(n);
                for (let i = 0; i < n; i++) {
                    beltA[i] = parsed[i].A; beltE[i] = parsed[i].E; beltI[i] = parsed[i].I;
                    beltPeriod[i] = parsed[i].Period * 40; beltEpoch[i] = parsed[i].Epoch;
                    beltInclCos[i] = Math.cos(beltI[i] * Math.PI / 180);
                }
                beltReady = true;
                return;
            }
        } catch (e) { console.warn('initAsteroids: некорректный JSON', e); }
    }
    if (!beltReady) generateAsteroids();
};


// ===== ПОЯС АСТЕРОИДОВ: у каждого объекта свой адрес =====
// Адрес детерминированный: он считается из орбитальных элементов, поэтому
// один и тот же астероид всегда называется одинаково.
let beltSelected = -1;
const BELT_HABITATS = {};        // индекс → { name, sector }

function beltAddress(i) {
    const angle = ((beltEpoch[i] + 360) % 360 + 360) % 360;
    const sector = Math.floor(angle / 15) + 1;
    return 'ПОЯС-' + String(sector).padStart(2, '0') + '-' + String((i % 997) + 1).padStart(3, '0');
}

// Жилые астероиды: 12 штук, равномерно по поясу, с именами секторов
function beltHabitats() {
    if (Object.keys(BELT_HABITATS).length) return BELT_HABITATS;
    for (let k = 0; k < 12; k++) {
        const idx = Math.floor(beltA.length * (k + 0.5) / 12);
        BELT_HABITATS[idx] = {
            name: 'Жилой сектор ' + String.fromCharCode(65 + k),
            sector: k + 1
        };
    }
    return BELT_HABITATS;
}

function beltPos(i, days) {
    const angle = beltEpoch[i] + (days / beltPeriod[i]) * 360;
    const rad = (((angle % 360) + 360) % 360) * Math.PI / 180;
    const e = beltE[i], cosRad = Math.cos(rad);
    const r = beltA[i] * (1 - e * e) / (1 + e * cosRad);
    const rPx = orbitRadius(r);
    return { x: cosRad * rPx, y: Math.sin(rad) * rPx * beltInclCos[i], r: r, ang: rad };
}

// клик по поясу: адрес астероида; двойной клик — наезд камеры на него.
// Слушаем документ, а не canvas: иначе холст перехватывал клики по планетам
// и глобус не открывался (был виден только адрес астероида).
let beltTapPrev = { t: 0, i: -1 };
function attachBeltPicker() {
    if (document._beltPicker) return;
    document._beltPicker = true;

    document.addEventListener('click', function (ev) {
        if (!beltReady || !beltEnabled) return;
        if (ev.target.closest && ev.target.closest('.control-panel, .left-menu, .resources-panel, [id$="-modal"]')) return;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
        const px = ev.clientX - cx, py = ev.clientY - cy;
        const days = (simulatedTime - EPOCH_MS) / DAY_MS;
        const sk = rect.width / canvas.width;
        let best = -1, bestD = 1e9, bestPos = null;
        const step = Math.max(1, Math.floor(beltA.length / 900));
        for (let i = 0; i < beltA.length; i += step) {
            const p2 = beltPos(i, days);
            const d = Math.hypot(p2.x * sk - px, p2.y * sk - py);
            if (d < bestD) { bestD = d; best = i; bestPos = p2; }
        }
        if (best < 0 || bestD > 14) return;      // попадание только по самому астероиду

        const now = Date.now();
        const isDouble = beltTapPrev.i === best && now - beltTapPrev.t < 450;
        beltTapPrev = { t: now, i: best };
        if (isDouble && bestPos && typeof window.cinematicZoom === 'function') {
            const s = Math.max(4, scale * 2.6);
            window.cinematicZoom({ scale: s, x: -s * bestPos.x, y: -s * bestPos.y, spin: 6 }, 800);
            return;
        }
        const hab = BELT_HABITATS[best];
        const au = bestPos.r.toFixed(2);
        const text = (hab ? hab.name + ' · ' : '') + beltAddress(best) + ' · ' + au + ' а.е. · период ' +
            (beltPeriod[best] / 365.25).toFixed(1) + ' г';
        if (typeof notify === 'function') notify(text);
    }, true);
}
setInterval(attachBeltPicker, 1500);

function drawAsteroids(currentDays) {
    if (!ctx || !beltReady || !beltEnabled) return;
    const days = currentDays;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    // Один путь на весь пояс: отдельные beginPath+arc+fill на каждый астероид — это главный тормоз кадра.
    ctx.beginPath();
    for (let i = 0; i < beltA.length; i++) {
        const angle = beltEpoch[i] + (days / beltPeriod[i]) * 360;
        const rad = (((angle % 360) + 360) % 360) * Math.PI / 180;
        const e = beltE[i];
        const cosRad = Math.cos(rad);
        const r = beltA[i] * (1 - e * e) / (1 + e * cosRad);
        const rPx = orbitRadius(r);            // та же шкала «а.е. -> px», что у планет
        ctx.rect(cosRad * rPx - 1, Math.sin(rad) * rPx * beltInclCos[i] - 1, 2, 2);
    }
    ctx.fillStyle = 'rgba(150, 140, 130, 0.6)';
    ctx.fill();

    // жилые сектора — бирюзовое свечение, выбранный — жёлтое кольцо
    const hab = beltHabitats();
    for (const idx in hab) {
        const p2 = beltPos(Number(idx), days);
        ctx.beginPath();
        ctx.arc(p2.x, p2.y, 3.2, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(127,227,255,0.95)';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(p2.x, p2.y, 7, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(127,227,255,0.55)';
        ctx.lineWidth = 1;
        ctx.stroke();
    }
    if (beltSelected >= 0) {
        const p3 = beltPos(beltSelected, days);
        ctx.beginPath();
        ctx.arc(p3.x, p3.y, 10, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255,215,90,0.95)';
        ctx.lineWidth = 1.6;
        ctx.stroke();
    }
    ctx.restore();
}

// === КАМЕРА ===
// Радиус самой внешней орбиты текущей системы — выставляется в buildScene().
let maxOrbitRadius = 505;
function fitScale() {
    // Размеры берём из окна: на момент разбора скрипта layout может быть не посчитан.
    const w = window.innerWidth || 1600;
    const h = window.innerHeight || 900;
    return Math.min(Math.max(Math.min(w, h) / 2 / (maxOrbitRadius + 60), 0.35), 1.3);
}
// ?tilt=40&spin=15 — фиксированный ракурс для 3D-проверки (правило 23).
// Без параметров камера ведёт себя как обычно.
const __view = new URLSearchParams(location.search);
const __tilt = parseFloat(__view.get('tilt'));
const __spin = parseFloat(__view.get('spin'));
let scale = fitScale(), posX = 0, posY = 0,
    rotX = isNaN(__tilt) ? 0 : Math.max(-85, Math.min(85, __tilt)),
    rotZ = isNaN(__spin) ? 0 : Math.max(-180, Math.min(180, __spin));
// tilt-param-applied: если ракурс задан ссылкой — держим его
setTimeout(() => {
    if (!isNaN(__tilt) || !isNaN(__spin)) {
        if (typeof window.updateSolarTransform === 'function') window.updateSolarTransform();
    }
}, 600);

window.updateSolarTransform = () => {
    const el = document.querySelector('.solar-system');
    if (el) { el.style.transform = `translate(${posX}px, ${posY}px) scale(${scale}) rotateX(${rotX}deg) rotateZ(${rotZ}deg)`; el.style.setProperty('--rot-x', rotX + 'deg'); el.style.setProperty('--rot-z', rotZ + 'deg');
        // размер планет подстраивается под зум: далеко — крупнее, вблизи — не раздуваются
        el.style.setProperty('--planet-scale', Math.max(0.65, Math.min(1.9, 0.55 / (scale || 1))).toFixed(2));
        el.style.setProperty('--moon-scale', Math.max(0.7, Math.min(1.6, 0.42 / (scale || 1))).toFixed(2));
        const slider = document.getElementById('tilt-slider'); if (slider) slider.value = rotX; }
    const txt = document.getElementById('scale-text'); if (txt) txt.innerText = scale.toFixed(1) + 'x';
    // при сильном приближении маркеры станций не нужны: на поверхности планеты
    // они выглядели как тёмная «дырка» с синим кольцом
    const sc = document.querySelector('.solar-system-container');
    if (sc) sc.classList.toggle('hide-stations', scale > 2.2);
    // гравитационные платформы показываем только при приближении ×4 и ближе
    const sys = document.querySelector('.solar-system');
    if (sys) sys.classList.toggle('gravity-on', scale >= 4);
    document.querySelectorAll('.gravity-platform').forEach(el => {
        el.style.display = scale >= 4 ? 'block' : 'none';
    });
    // обратный масштаб: элементы интерфейса сцены (станции, трафик) не должны
    // расти вместе с зумом — иначе «корабли» становятся гигантскими
    try {
        document.documentElement.style.setProperty('--inv-scale', String(1 / (typeof scale === 'number' && scale > 0 ? scale : 1)));
    } catch (e) { }
    document.body.classList.toggle('ships-hidden', (typeof scale === 'number' ? scale : 1) < SHIP_HIDE_BELOW_SCALE);
    if (starCanvas) { starCanvas.style.transform = `translate(-50%, -50%) translate(${posX * 0.2}px, ${posY * 0.2}px) rotateX(${rotX * 0.2}deg) rotateZ(${rotZ * 0.2}deg) scale(1.5)`; }
};
window.moveView = (dir) => { const step = 10; if (dir === 'up') rotX = Math.max(rotX - step, -85); if (dir === 'down') rotX = Math.min(rotX + step, 85); if (dir === 'left') rotZ -= step; if (dir === 'right') rotZ += step; window.updateSolarTransform(); };
window.updateTilt = (val) => { rotX = parseFloat(val); window.updateSolarTransform(); };
// Масштаб всегда меняется вокруг точки под курсором (или центра экрана):
// иначе при приближении к Земле картинку «уносит» к Солнцу, потому что
// transform-origin у сцены — центр системы.
// Порог перехода в вид глобуса: при увеличении ×9 система открывает планету.
const GLOBE_ZOOM = 9;
let globeLockUntil = 0;

// какая планета под точкой экрана (или ближайшая к центру)
function planetAtScreen(cx, cy) {
    const px = window.innerWidth / 2 + cx;
    const py = window.innerHeight / 2 + cy;
    // защита: элементыFromPoint падает на NaN/Infinity (было из-за нулевых
    // размеров при программных кликах)
    if (!isFinite(px) || !isFinite(py)) return null;
    const hit = document.elementFromPoint(px, py);
    const direct = hit && hit.closest ? hit.closest('.planet[data-planet-id]') : null;
    if (direct) return direct.getAttribute('data-planet-id');

    let best = null, bestDist = Infinity;
    document.querySelectorAll('.planet[data-planet-id]').forEach(function (el) {
        const r = el.getBoundingClientRect();
        if (!r.width) return;
        const d = Math.hypot(r.left + r.width / 2 - px, r.top + r.height / 2 - py);
        if (d < bestDist) { bestDist = d; best = el.getAttribute('data-planet-id'); }
    });
    return best;
}

function openGlobeFor(id) {
    if (!id || typeof window.openGlobe !== 'function') return false;
    globeLockUntil = Date.now() + 2000;
    window.openGlobe(id);          // сначала глобус, с него — на поверхность
    return true;
}

function zoomAt(targetScale, cx, cy) {
    const s = Math.max(0.1, Math.min(10, targetScale));
    // на подходе к ×9 показываем подсказку
    if (s >= GLOBE_ZOOM - 1.4 && scale < GLOBE_ZOOM - 1.4 && s < GLOBE_ZOOM) {
        if (window.toast) window.toast('Ещё немного — и откроется вид глобуса');
    }
    if (s >= GLOBE_ZOOM && Date.now() > globeLockUntil) {
        const id = planetAtScreen(cx || 0, cy || 0);
        if (openGlobeFor(id)) return;                 // дальше не увеличиваем
    }
    if (Math.abs(s - scale) < 1e-6) return;
    const k = s / scale;
    posX = cx - k * (cx - posX);
    posY = cy - k * (cy - posY);
    scale = s;
    window.updateSolarTransform();
}

// Двойной клик по планете — подлететь к ней и поставить в центр экрана.
function focusPlanet(node) {
    if (!node || node.x === undefined) return;
    const s = Math.max(scale, 3.0);
    scale = s;
    posX = -s * node.x;
    posY = -s * node.y;
    window.updateSolarTransform();
}

window.solarZoomIn = () => zoomAt(scale * 1.25, 0, 0);
window.solarZoomOut = () => zoomAt(scale / 1.25, 0, 0);
window.solarReset = () => { scale = fitScale(); posX = 0; posY = 0; rotX = isNaN(__tilt) ? 0 : __tilt; rotZ = isNaN(__spin) ? 0 : __spin; window.updateSolarTransform(); };

let isDragging = false, startX, startY;
window.addEventListener('mousedown', (e) => { if (e.target.closest('.control-panel') || e.target.closest('.auth-container') || e.target.closest('.legend-overlay') || e.target.closest('.left-menu') || e.target.closest('.codex-modal') || e.target.closest('.admin-modal') || e.target.closest('.fleet-modal') || e.target.closest('.quest-modal')) return; isDragging = true; startX = e.clientX - posX; startY = e.clientY - posY; document.body.style.cursor = 'grabbing'; });
window.addEventListener('mousemove', (e) => { if (!isDragging) return; posX = e.clientX - startX; posY = e.clientY - startY; window.updateSolarTransform(); });
window.addEventListener('mouseup', () => { isDragging = false; document.body.style.cursor = 'default'; });
window.addEventListener('wheel', (e) => {
    // при открытом окне колесо не должно зумить карту под ним
    if (typeof isModalVisible === 'function') {
        const opened = ['market-modal', 'npc-modal', 'flight-modal', 'globe-modal', 'build-modal',
                        'admin-modal', 'systems-modal', 'tut-modal', 'onb-guide']
            .some(id => isModalVisible(document.getElementById(id)));
        if (opened) return;
    }
    if (e.target.closest('.control-panel') || e.target.closest('.legend-overlay')) return;
    // любая форма/панель должна прокручиваться, а не приближать карту
    if (e.target.closest('[id$="-modal"]') || e.target.closest('.admin-modal') ||
        e.target.closest('.fleet-modal') || e.target.closest('.quest-modal') ||
        e.target.closest('.codex-modal') || e.target.closest('.auth-container') ||
        e.target.closest('.resources-panel') || e.target.closest('.market-panel') ||
        e.target.closest('.chat-panel') || e.target.closest('.panel')) return;
    e.preventDefault();
    const cx = e.clientX - window.innerWidth / 2;
    const cy = e.clientY - window.innerHeight / 2;
    zoomAt(e.deltaY < 0 ? scale * 1.12 : scale / 1.12, cx, cy);
}, { passive: false });

// Двойной клик по планете — приблизить и отцентрировать её.
// Двойной клик по планете или луне открывает вид глобуса.
// Если для мира глобуса ещё нет — приближаем его, как раньше.
// Глобус открывается для любого мира, у которого есть текстура в GLOBE_TEX,
// плюс Кеплер-1 (у него в карте ключ kepler1, а id планеты — kepler).
const GLOBE_READY = new Set(Object.keys(GLOBE_TEX).concat(['kepler']));

function globeIdForTarget(target) {
    if (!target || !target.closest) return null;
    const planetEl = target.closest('.planet[data-planet-id]');
    if (planetEl) {
        const id = planetEl.getAttribute('data-planet-id');
        return id === 'kepler1' ? 'kepler' : id;
    }
    const moonEl = target.closest('.moon[data-moon]');
    if (moonEl) {
        const nm = moonEl.getAttribute('data-moon');
        return (typeof MOON_SLUG !== 'undefined' && MOON_SLUG[nm]) ? MOON_SLUG[nm] : null;
    }
    return null;
}

// Планеты всё время движутся, поэтому первый и второй клик могут попасть
// в РАЗНЫЕ элементы — нативный dblclick тогда не срабатывает. Ловим двойной
// клик вручную: по времени и расстоянию между нажатиями.
let __lastClick = { t: 0, x: 0, y: 0, el: null };
document.addEventListener('click', (e) => {
    const now = Date.now();
    const prev = __lastClick;
    __lastClick = { t: now, x: e.clientX, y: e.clientY, el: e.target };
    if (now - prev.t > 420) return;
    if (Math.hypot(e.clientX - prev.x, e.clientY - prev.y) > 26) return;
    // цель могла «уехать» под курсором — берём любой из двух элементов
    let el = e.target;
    if (el && el.closest && !el.closest('.planet, .moon, .ship-marker')) el = prev.el;
    if (!el || !el.closest) return;
    const shipEl = el.closest('.ship-marker');
    if (shipEl) {
        if (shipEl.classList.contains('ship-marker--traffic')) {
            openTrafficCard(parseInt(shipEl.getAttribute('data-route'), 10));
        } else if (shipEl._fleet && typeof openFleetCard === 'function') {
            openFleetCard(shipEl._fleet);
        }
        return;
    }
    const id = globeIdForTarget(el);
    if (id && GLOBE_READY.has(id) && typeof window.openGlobe === 'function') {
        window.openGlobe(id);
    }
}, true);

// Прямая привязка двойного клика к самим планетам: глобальный обработчик
// иногда не срабатывает (цель «уезжает» под курсором, перекрытие слоями).
// Здесь событие приходит на саму планету — надёжнее.
function bindPlanetDblClick() {
    document.querySelectorAll('.planet[data-planet-id]').forEach(function (el) {
        if (el.__dblBound) return;
        el.__dblBound = true;
        el.addEventListener('dblclick', function (ev) {
            ev.stopPropagation();
            var id = el.getAttribute('data-planet-id');
            if (!id) return;
            // наезд, затем глобус (раньше здесь открывалось мгновенно и
            // перебивало кинематографичный переход)
            var opened = window.cinematicFocus(el, function () {
                if (typeof window.openGlobe === 'function') window.openGlobe(id);
            });
            if (!opened && typeof window.openGlobe === 'function') window.openGlobe(id);
        });
    });
}

// СВОЙ детектор двойного клика: планета движется по орбите, поэтому второй
// клик часто попадает уже в другой элемент и нативный dblclick не приходит.
let __tapPrev = { t: 0, id: null, x: 0, y: 0 };
document.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const el = e.target;
    const id = (el && el.closest && el.closest('.planet[data-planet-id]'))
        ? el.closest('.planet[data-planet-id]').getAttribute('data-planet-id')
        : globeIdForTarget(el);
    const now = Date.now();
    const prev = __tapPrev;
    __tapPrev = { t: now, id: id, x: e.clientX, y: e.clientY };
    if (!prev.id || !id) return;
    if (prev.id !== id) return;
    if (now - prev.t > 520) return;
    if (Math.hypot(e.clientX - prev.x, e.clientY - prev.y) > 60) return;
    if (document.getElementById('globe-modal')) return;   // уже открыт
    __tapPrev = { t: 0, id: null, x: 0, y: 0 };
    if (typeof window.openGlobe === 'function') window.openGlobe(prev.id);
}, true);

document.addEventListener('dblclick', (e) => {
    // двойной клик по летящему транспорту — карточка борта
    // Любой корабль на карте открывается двойным кликом: транспорт — карточкой
    // борта, флот — карточкой с маршрутом.
    const anyShip = e.target.closest && e.target.closest('.ship-marker');
    if (anyShip) {
        if (anyShip.classList.contains('ship-marker--traffic')) {
            openTrafficCard(parseInt(anyShip.getAttribute('data-route'), 10));
        } else if (anyShip._fleet && typeof openFleetCard === 'function') {
            openFleetCard(anyShip._fleet);
        }
        return;
    }
    const id = globeIdForTarget(e.target);
    if (id && GLOBE_READY.has(id) && typeof window.openGlobe === 'function') {
        window.openGlobe(id);        // двойной клик по планете — глобус
        return;
    }
    // спутник без текстуры глобуса — всё равно открываем планетарный вид
    const moonEl = e.target.closest && e.target.closest('.moon[data-moon]');
    if (moonEl && window.PlanetView && typeof window.PlanetView.open === 'function') {
        const slug = (typeof MOON_SLUG !== 'undefined' && MOON_SLUG[moonEl.getAttribute('data-moon')]) ||
                     moonEl.getAttribute('data-moon');
        window.PlanetView.open(slug);
        return;
    }
    // запасной путь: для миров без глобуса — приблизить и отцентрировать
    const planetEl = e.target.closest && e.target.closest('.planet');
    if (planetEl && planetNodes.length) {
        const node = planetNodes.find(n => n.planet === planetEl);
        focusPlanet(node);
        if (id && window.toast) window.toast('Глобус этого мира ещё в работе — приближаю');
    }
});

// === ВРЕМЯ ===
const EPOCH_MS = Date.UTC(2000, 0, 1, 12, 0, 0);   // эпоха J2000 — от неё считаются орбиты
const DAY_MS = 86400000;
// Действие игры — 2226 год, то есть «сейчас + 200 лет». Смещение применяется
// к самому simulatedTime, поэтому не только часы показывают 2226-й, но и планеты
// стоят на позициях, соответствующих этому году, а не сегодняшней дате.
const GAME_YEAR_OFFSET = 200;
const GAME_OFFSET_MS = (() => {
    const now = new Date();
    const future = new Date(now.getTime());
    future.setFullYear(future.getFullYear() + GAME_YEAR_OFFSET);
    return future.getTime() - now.getTime();
})();
// По умолчанию 1 секунда реального времени = 1 игровая МИНУТА (60×).
// Было 3600× (1 с = 1 час) — планеты крутились слишком быстро и «не читались».
const DEFAULT_TIME_SCALE = 1;   // реальное время: 1 с = 1 с
// Ускоренное время (1ч, 1д, 1г) — инструмент тестирования, а не игровая механика.
// Включается только флагом ?test=1, на локальном хосте или админом.
const TIME_TEST_MODE = (() => {
    if (/[?&]test=1/.test(location.search)) return true;
    if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') return true;
    try {
        const u = window.getCurrentUser ? window.getCurrentUser() : null;
        return !!(u && (u.admin === true || u.role === 'admin'));
    } catch (e) { return false; }
})();
const MAX_TIME_SCALE = TIME_TEST_MODE ? 31557600 : 60;   // 1x реальное время, 1м = 60×

let timeScale = DEFAULT_TIME_SCALE;   // по умолчанию 1 с = 1 с (реальное время)
let simulatedTime = Date.now() + GAME_OFFSET_MS;
let lastRealTime = performance.now();

function syncTimeUI(mode) {
    document.querySelectorAll('.mode-btn').forEach(b => { if (b.dataset.mode) b.classList.toggle('active', b.dataset.mode === mode); });
    const input = document.getElementById('time-scale');
    if (input) input.value = Math.round(timeScale);
}

window.setTimeMode = (mode) => {
    let scaleValue = 1;
    if (mode === 'pause') scaleValue = 0;
    if (mode === 'real') scaleValue = 1;      // 1 секунда = 1 секунда
    if (mode === 'min') scaleValue = 60;
    if (mode === 'hour') scaleValue = 3600;
    if (mode === 'day') scaleValue = 86400;
    if (mode === 'year') scaleValue = 31557600;
    if (scaleValue > MAX_TIME_SCALE) {
        if (typeof notify === 'function') {
            notify('Ускоренное время — только в тестовом режиме (?test=1)');
        }
        return;
    }
    timeScale = scaleValue;
    syncTimeUI(mode);
};

function modeForScale(value) {
    if (value === 1) return 'real';
    if (value === 60) return 'min';
    if (value === 3600) return 'hour';
    if (value === 86400) return 'day';
    if (value === 31557600) return 'year';
    return null;
}

window.applyTimeScale = () => {
    const input = document.getElementById('time-scale');
    let val = parseFloat(input.value);
    if (isNaN(val) || val <= 0) val = 1;
    if (val > MAX_TIME_SCALE) {
        val = MAX_TIME_SCALE;
        if (typeof notify === 'function') {
            notify('Максимум ' + MAX_TIME_SCALE + '× — быстрее только в тестовом режиме');
        }
    }
    timeScale = val;
    syncTimeUI(modeForScale(val));
};

window.resetToRealTime = () => {
    timeScale = DEFAULT_TIME_SCALE;
    simulatedTime = Date.now() + GAME_OFFSET_MS;   // текущий момент игры, а не реальный
    syncTimeUI(modeForScale(timeScale));
};

// === ЧАТ ===
// Кнопка «Админка» нужна только администратору — обычному игроку она видна не должна.
// Дубли меню: «Рынок» открывал ту же биржу, а кнопка EN — переключатель языка,
// которого нет. Прячем оба, чтобы не путать игрока.
// Название пункта без эмодзи: иначе «⚙️ Админка» не сравнивается с «админка».
function menuLabel(btn) {
    return (btn.textContent || '')
        .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\uFE0F]/gu, '')
        .trim().toLowerCase();
}

function hideDuplicateMenuButtons() {
    const seen = new Set();
    document.querySelectorAll('.menu-btn').forEach(btn => {
        const t = menuLabel(btn);
        // «Рынок» открывает ту же биржу, «EN» — переключатель без перевода
        if (t === 'рынок' || t === 'en' || t === 'english') { btn.style.display = 'none'; return; }
        // одинаковые подписи оставляем только в одном экземпляре
        if (seen.has(t)) { btn.style.display = 'none'; return; }
        seen.add(t);
    });
}

function hideAdminButtons() {
    let isAdmin = false;
    try {
        const u = window.getCurrentUser ? window.getCurrentUser() : null;
        const admins = (window.ADMIN_EMAILS || [window.ADMIN_EMAIL || 'ab@btema.ru']).map(e => String(e).toLowerCase());
        isAdmin = !!(u && (u.role === 'admin' || (u.email && admins.indexOf(String(u.email).toLowerCase()) >= 0)));
    } catch (e) { isAdmin = false; }
    document.querySelectorAll('.menu-btn').forEach(btn => {
        const t = menuLabel(btn);
        if (t.indexOf('админка') >= 0 || t.indexOf('монитор') >= 0) {
            btn.style.display = isAdmin ? '' : 'none';
        }
    });
    const ab = document.getElementById('admin-btn');
    if (ab) ab.style.display = isAdmin ? '' : 'none';
}

// Esc закрывает верхнее окно: раньше окна копились друг на друге.
// Окна позиционированы как fixed, поэтому offsetParent у них всегда null.
// Раньше из-за этого Esc не закрывал ни одно окно — проверяем computed style.
function isModalVisible(el) {
    if (!el) return false;
    const st = getComputedStyle(el);
    if (st.display === 'none' || st.visibility === 'hidden') return false;
    if (Number(st.opacity) < 0.05) return false;
    return true;
}

function closeTopModal() {
    const ids = ['onb-guide', 'ship-flight', 'globe-modal', 'build-modal', 'systems-modal',
                 'flight-modal', 'npc-modal', 'market-modal', 'admin-modal', 'traffic-card'];
    for (const id of ids) {
        const el = document.getElementById(id);
        if (!el) continue;
        if (!isModalVisible(el)) continue;
        if (id === 'globe-modal' && typeof window.closeGlobe === 'function') { window.closeGlobe(); }
        else if (id === 'ship-flight') { el.remove(); }
        else el.style.display = 'none';
        return true;
    }
    const modals = document.querySelectorAll('.market-modal, .npc-modal, .flight-modal, .globe-modal');
    for (const m of modals) {
        if (isModalVisible(m)) {
            m.style.display = 'none';
            return true;
        }
    }
    return false;
}

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && closeTopModal()) e.preventDefault();
});

setInterval(function () { hideAdminButtons(); hideDuplicateMenuButtons(); }, 6000);
setTimeout(function () { if (typeof ensureCivilSoon === 'function') ensureCivilSoon(); }, 1500);

window.toggleLeftMenu = () => { const menu = document.getElementById('left-menu'); const chat = document.getElementById('chat-panel'); const res = document.getElementById('resources-panel'); if (chat.style.display === 'flex' || res.style.display === 'flex') return; menu.classList.toggle('collapsed'); };
window.openChat = () => { document.getElementById('left-menu-items').style.display = 'none'; document.getElementById('chat-panel').style.display = 'flex'; };
window.closeChat = () => { document.getElementById('left-menu-items').style.display = 'flex'; document.getElementById('chat-panel').style.display = 'none'; };
window.sendMessage = () => { const input = document.getElementById('chat-input'); const text = input.value.trim(); if (!text) return; const msgBox = document.getElementById('chat-messages'); const msg = document.createElement('div'); msg.className = 'chat-msg my-msg'; msg.innerText = `${currentUser ? currentUser.gameName : 'Гость'}: ${text}`; msgBox.appendChild(msg); msgBox.scrollTop = msgBox.scrollHeight; input.value = ''; };

// === РЕСУРСЫ ===
window.openResourcesPanel = () => { document.getElementById('left-menu-items').style.display = 'none'; document.getElementById('resources-panel').style.display = 'flex'; renderResourcesPanel(); };
window.closeResourcesPanel = () => { document.getElementById('left-menu-items').style.display = 'flex'; document.getElementById('resources-panel').style.display = 'none'; };
function renderResourcesPanel(targetId) {
    if (!currentUser) return;
    if (migrateResources(currentUser)) saveUser();
    const list = document.getElementById(targetId || 'resources-list');
    if (!list) return;
    const res = currentUser.resources || {};

    let html = '';
    RESOURCE_CATS.forEach(cat => {
        const ids = Object.keys(RESOURCES).filter(id => RESOURCES[id].cat === cat.id);
        const owned = ids.filter(id => (res[id] || 0) > 0);
        const showAll = true;   // показываем весь каталог, нули не прячем
        const visible = showAll ? ids : owned;
        html += `<div class="res-group"><div class="res-group-head" style="color:${cat.color}">` +
            `${cat.name}${cat.illegal ? ' <span class="res-illegal">вне закона</span>' : ''}${cat.hint ? `<span class="res-hint">${cat.hint}</span>` : ''}</div>`;
        if (!visible.length) {
            html += `<div class="res-empty">пока ничего нет</div>`;
        } else {
            visible.forEach(id => {
                const info = RESOURCES[id];
                const amount = res[id] || 0;
                html += `<div class="res-row" title="${info.tech === '—' ? 'чёрный рынок' : 'технология: ' + info.tech}">` +
                    `<span class="res-ico">${resourceIcon(id)}</span>` +
                    `<span class="res-name">${info.name}${(info.why || info.note) ? `<i>${info.why || info.note}</i>` : ''}${whereBadges(id)}</span>` +
                    `<span class="res-amount">${amount.toLocaleString()} <em>${info.unit}</em></span>` +
                    `<span class="res-price">${(amount * info.price).toLocaleString()} кр</span>` +
                    `</div>`;
            });
        }
        html += '</div>';
    });
    const arts = currentUser.artifacts || [];
    html += `<div class="res-group"><div class="res-group-head" style="color:#7fe3ff">Артефакты <span class="res-hint">следы прежних цивилизаций · возятся как груз</span></div>`;
    if (!arts.length) {
        html += `<div class="res-empty">пока ничего нет — ищите по адресам на карте</div>`;
    } else {
        arts.forEach((a, i) => {
            html += `<div class="res-row"><span class="res-ico">🏺</span>` +
                `<span class="res-name">${a.name}<i>${a.kind} · можно возить и продать за ${a.crystals} крст</i></span>` +
                `<span class="res-amount">1 <em>шт</em></span>` +
                `<span class="res-price">${a.effect ? `<button class="auth-btn" style="width:auto;padding:2px 8px;margin:0 4px 0 0;font-size:11px" onclick="installArtifact(${i})">установить ×${a.effect.mult}</button>` : ''}` +
                `<button class="auth-btn" style="width:auto;padding:2px 8px;margin:0;font-size:11px" onclick="sellArtifact(${i})">продать</button></span></div>`;
        });
    }
    html += '</div>';

    const total = Object.keys(RESOURCES).reduce((sum, id) => sum + (res[id] || 0) * RESOURCES[id].price, 0);
    html += `<div class="res-total">Стоимость склада: <b>${total.toLocaleString()} кр</b></div>`;
    list.innerHTML = html;
};

// === СПРАВОЧНИК ===
window.openCodex = () => { document.getElementById('codex-modal').style.display = 'flex'; showLoreTab('earth'); };
window.closeCodex = () => { document.getElementById('codex-modal').style.display = 'none'; };
window.showLoreTab = (factionId) => {
    document.querySelectorAll('.codex-tab').forEach(t => t.classList.remove('active'));
    const activeTab = document.querySelector(`.codex-tab[data-tab="${factionId}"]`); if (activeTab) activeTab.classList.add('active');
    const body = document.getElementById('codex-body');
    if (factionId === 'resources') { if (!currentUser) { body.innerHTML = '<p style="color:#ff6b6b;">Войдите в игру, чтобы увидеть свои ресурсы.</p>'; return; } body.innerHTML = `<div class="codex-header" style="border-color: #8ab4f8;"><div class="codex-title" style="color: #8ab4f8;">📦 Ресурсы колонии</div><div class="codex-subtitle">${FACTION_NAMES[currentUser.faction]}</div></div><div id="codex-res-list" class="resources-list codex-res"></div>`; renderResourcesPanel('codex-res-list'); return; }
    if (factionId === 'portal') { const p = window.PORTAL_LORE; body.innerHTML = `<div class="codex-header" style="border-color: #00e5ff;"><div class="codex-title" style="color: #00e5ff;">${p.name}</div><div class="codex-subtitle">${p.subtitle}</div><div class="codex-tagline">${p.location}</div></div><div class="codex-section"><h3>📜 История открытия</h3><p>${p.history}</p></div><div class="codex-section"><h3>⚙️ Технология</h3><p>${p.technology}</p></div><div class="codex-section codex-trade" style="border-color: rgba(0, 229, 255, 0.3); background: rgba(0, 229, 255, 0.05);"><div><b>📍 Расположение:</b> ${p.location}</div><div><b>🗓️ Год открытия:</b> ${p.discovered}</div></div><div class="codex-section"><h3>⚠️ Опасность</h3><p>${p.danger}</p></div><div class="codex-section"><h3>🌌 Текущее состояние</h3><p>${p.current}</p></div><div class="codex-quote" style="border-color: #00e5ff;">${p.quote}</div>`; return; }
    if (factionId === 'captain') { const c = window.CAPTAIN_LORE; body.innerHTML = `<div class="codex-header" style="border-color: #f1c40f;"><div class="codex-title" style="color: #f1c40f;">🎖️ ${c.rank}</div><div class="codex-subtitle">${c.subtitle}</div></div><div class="codex-section"><h3>📜 История</h3><p>${c.history}</p></div><div class="codex-section"><h3>🎯 Миссия</h3><p>${c.mission}</p></div><div class="codex-section"><h3>💼 Навыки</h3><div style="display:flex; gap:8px; flex-wrap:wrap;">${c.skills.map(s => `<span style="background: rgba(241, 196, 15, 0.2); color:#f1c40f; padding:6px 12px; border-radius:20px; font-size:13px;">${s}</span>`).join('')}</div></div>`; return; }
    const lore = window.GALAXY_LORE[factionId]; if (!lore) return;
    body.innerHTML = `<div class="codex-header" style="border-color: ${lore.color};"><div class="codex-title" style="color: ${lore.color};">${lore.name}</div><div class="codex-subtitle">${lore.subtitle}</div><div class="codex-tagline">${lore.tagline}</div></div><div class="codex-section"><h3>📜 История</h3><p>${lore.history}</p></div><div class="codex-section codex-economy-grid"><div class="codex-economy-card deficit"><h3 style="color:#ff6b6b;">⚠️ Дефицит</h3><ul>${lore.deficit.map(d => `<li>${d}</li>`).join('')}</ul></div><div class="codex-economy-card surplus"><h3 style="color:#2ecc71;">💎 Избыток</h3><ul>${lore.surplus.map(s => `<li>${s}</li>`).join('')}</ul></div></div><div class="codex-section codex-trade"><div><b>📤 Экспорт:</b> ${lore.exports}</div><div><b>📥 Импорт:</b> ${lore.imports}</div><div><b>💰 Валюта:</b> ${lore.currency}</div></div><div class="codex-quote" style="border-color: ${lore.color};">${lore.quote}</div>`;
};

// === АДМИНКА ===
window.openAdminModal = () => { document.getElementById('admin-modal').style.display = 'flex'; renderAdminPanel(); };
window.closeAdminModal = () => { document.getElementById('admin-modal').style.display = 'none'; };
// Монитор администратора: один экран — все игроки, флот, склад и производство.
function adminTopResources(u, limit) {
    const res = u.resources || {};
    return Object.keys(res)
        .filter(k => res[k] > 0 && RESOURCES[k])
        .sort((a, b) => res[b] - res[a])
        .slice(0, limit)
        .map(k => `${RESOURCES[k].name} ${res[k].toLocaleString()}`)
        .join(' · ') || '—';
}

function adminFleet(u) {
    const ships = Array.isArray(u.ships) ? u.ships : [];
    if (!ships.length) return '—';
    const names = ships.slice(0, 2).map(s => SHIPS[s.id] ? shipName(s.id) : s.id).join(', ');
    return ships.length + ' · ' + names + (ships.length > 2 ? ' …' : '');
}

function adminProduction(u) {
    const fac = u.factories || {};
    const parts = Object.keys(fac).filter(k => fac[k] > 0)
        .map(k => (FACTORIES[k] ? FACTORIES[k].name.split(' ')[0] : k) + ' ур.' + fac[k]);
    return parts.join(' · ') || '—';
}

function adminActivity(u) {
    const q = u.quests || {};
    const steps = Object.values(q).reduce((a, b) => a + b, 0);
    if (steps > 0) return 'квесты: ' + steps + ' шаг(ов)';
    if (Object.values(u.factories || {}).some(v => v > 0)) return 'производство';
    if ((u.ships || []).length) return 'флот в доке';
    return 'наблюдает';
}

// Переход из админки на планету: сначала закрываем монитор, потом показываем мир.
// Вид планеты живёт отдельным модулем js/surface.js
let surfaceModule = null;
// экономика вынесена в модуль: цены считаются там, здесь только вызовы
import('/js/economy.js').then(m => { window.__econ = m; }).catch(e => console.warn('econ:', e));
import('/js/production.js').then(m => { window.__prod = m; }).catch(e => console.warn('prod:', e));
import('/js/engines.js').then(m => { window.__engines = m; }).catch(e => console.warn('engines:', e));
import('/js/health.js').then(m => { window.__health = m; }).catch(e => console.warn('health:', e));
import('/js/i18n.js').then(m => { window.__i18n = m; m.setLang(m.langOf(currentUser)); applyLanguage(); }).catch(e => console.warn('i18n:', e));

// Карта поверхности временно отключена: планету смотрим глобусом.
window.openSurface = (world, city) => {
    notify('Карта поверхности отключена — планета открывается глобусом');
};

window.__openSurfaceLegacy = (world, city) => {
    const id = (typeof world === 'string' && world) ? world : 'earth';
    if (surfaceModule) { surfaceModule.open(id, city || ''); return; }
    import('/js/surface.js')
        .then(m => { surfaceModule = m; m.open(id, city || ''); })
        .catch(e => { console.warn('surface:', e); notify('Вид планеты не загрузился'); });
};

window.closeSurface = () => {
    const m = document.getElementById('surface-modal');
    if (m) m.style.display = 'none';
    if (surfaceModule && surfaceModule.stop) surfaceModule.stop();
};

window.openWorldFromAdmin = (wid, city) => {
    window.__pickedCity = city || '';
    const m = document.getElementById('admin-modal');
    if (m) m.style.display = 'none';
    setTimeout(() => {
        try {
            // планета открывается глобусом; если он не поднялся за 700 мс —
            // показываем карту мира, чтобы админ не остался с пустым экраном
            window.__pickedCity = city || '';
            let globeShown = false;
            if (typeof window.openGlobe === 'function') {
                try { window.openGlobe(wid); globeShown = true; }
                catch (e) { console.error('globe:', e); }
            }
            setTimeout(() => {
                const gm = document.getElementById('globe-modal');
                if (!(gm && gm.style.display === 'flex')) {
                    notify('Глобус не открылся — смотрите консоль (globe:)');
                }
            }, 900);
        } catch (e) { notify('Ошибка открытия мира'); }
    }, 120);
};

function renderAdminPanel() {
    const list = document.getElementById('user-list-modal');
    if (!list) return;
    const users = (usersDB || []).filter(u => u.role !== 'admin').slice().sort((a, b) => (b.credits || 0) - (a.credits || 0));
    const totalCredits = users.reduce((s, u) => s + (u.credits || 0), 0);
    const totalShips = users.reduce((s, u) => s + (u.ships || []).length, 0);

    const rows = users.map(u => `<tr>
        <td><b>${u.gameName || u.email}</b><div class="mon-sub">${u.email}</div></td>
        <td>${u.faction ? FACTION_NAMES[u.faction] : '—'}</td>
        <td class="num">${(u.credits || 0).toLocaleString()}</td>
        <td>${adminFleet(u)}</td>
        <td class="mon-res">${adminTopResources(u, 3)}</td>
        <td>${adminProduction(u)}</td>
        <td>${adminActivity(u)}</td>
        <td class="mon-act"><button onclick="changeUserPassword('${u.email}')">пароль</button>
            <button class="del" onclick="deleteUser('${u.email}')">✖</button></td>
    </tr>`).join('');

    // --- постройки всех игроков: поиск и сортировка по объёму ---
    const allB = [];
    users.forEach(u => {
        const fac = u.factories || {};
        Object.keys(fac).forEach(k => {
            if (!fac[k]) return;
            const def = FACTORIES[k];
            allB.push({
                player: u.gameName || u.email,
                building: def ? def.name : k,
                race: u.faction ? (FACTION_NAMES[u.faction] || u.faction) : '—',
                lvl: fac[k],
                out: def ? (def.per + ' / ' + def.every + ' с') : '—'
            });
        });
    });
    allB.sort((a, b) => b.lvl - a.lvl);
    const q = (window.__adminBldSearch || '').toLowerCase();
    const filteredB = allB.filter(r => !q ||
        r.player.toLowerCase().includes(q) || r.building.toLowerCase().includes(q) || r.race.toLowerCase().includes(q));
    const RACE_WORLD = { 'Терра Нова': 'earth', 'Мир Тишины': 'mars', 'Титановое Кольцо': 'belt' };
    const bldRows = filteredB.map(r => {
        const wid = RACE_WORLD[r.race] || 'earth';
        return `<tr>
        <td>${r.player}</td>
        <td><a class="mon-link" href="javascript:void(0)" onclick="closeAdminModal && closeAdminModal(); window.__pickedCity='${r.building}'; window.__focusBuilding='${r.building}'; showSurface('${wid}')">${r.building}</a></td>
        <td>${r.race}</td>
        <td class="num">${r.lvl}</td><td>${r.out}</td>
        <td><button class="mon-act-btn" onclick="window.__focusBuilding='${r.building}'; openWorldFromAdmin('${wid}','${r.building}')">открыть</button></td></tr>`;
    }).join('')
        || '<tr><td colspan="5" class="mon-sub">ничего не найдено</td></tr>';

    // Дерево: игрок → мир → постройки. Мир — гиперссылка на вид планеты.
    const WORLD_OF_RACE = { earth: ['Земля', 'earth'], mars: ['Марс', 'mars'], belt: ['Пояс', 'belt'] };
    const treeNodes = users.map(u => {
        const w = WORLD_OF_RACE[u.faction] || ['Земля', 'earth'];
        const fac = u.factories || {};
        const blds = Object.keys(fac).filter(k => fac[k] > 0)
            .map(k => `<div class="adm-leaf">${FACTORIES[k] ? FACTORIES[k].name : k} · ур. ${fac[k]}</div>`).join('')
            || '<div class="adm-leaf muted">построек нет</div>';
        const hab = u.habitatsBuilt ? `<div class="adm-leaf">Жилые массивы · ${u.habitatsBuilt}</div>` : '';
        return `<details class="adm-node">
            <summary>${u.gameName || u.email} <span class="adm-badge">игрок</span></summary>
            <details class="adm-node">
                <summary><a class="mon-link" href="javascript:void(0)" onclick="openWorldFromAdmin('${w[1]}','${w[0]}')">${w[0]}</a>
                <a class="mon-link" href="javascript:void(0)" onclick="openWorldFromAdmin('moon','Луна')" style="margin-left:8px">Луна</a></summary>
                ${blds}${hab}
            </details>
        </details>`;
    }).join('');

    const agentNodes = (typeof NPC_AGENTS !== 'undefined' ? NPC_AGENTS : []).map(n => {
        const base = n.base.split(' · ')[0];
        // мир определяем по агенту, а не по тексту базы
        const AGENT_WORLD = { n1: 'earth', n2: 'earth', n3: 'mars', n4: 'belt', n5: 'belt', n6: 'belt', p1: 'belt', p2: 'saturn', k1: 'earth', k2: 'earth', k3: 'kepler1', a1: 'earth', a2: 'earth', a3: 'earth', a4: 'earth', a5: 'earth' };
        const wid = AGENT_WORLD[n.id] || 'belt';
        return `<details class="adm-node">
            <summary>${n.name} <span class="adm-badge ${n.kind === 'pirate' ? 'pirate' : ''}">${n.kind === 'pirate' ? 'пират' : 'агент'}</span></summary>
            <details class="adm-node">
                <summary><a class="mon-link" href="javascript:void(0)" onclick="openWorldFromAdmin('${wid}','${base}')">${base}</a></summary>
                <div class="adm-leaf">построек: ${n.buildings} · флот: ${n.ships} · добытчики: ${n.miners}</div>
            </details>
        </details>`;
    }).join('');

    list.innerHTML = `<div class="mon-summary">
            <span>игроков: <b>${users.length}</b></span>
            <span>кредитов всего: <b>${totalCredits.toLocaleString()}</b></span>
            <span>кораблей: <b>${totalShips}</b></span>
            <span>обновлено: <b>${new Date().toLocaleTimeString('ru-RU')}</b></span>
        </div>
        <table class="mon-table"><thead><tr>
            <th>Игрок</th><th>Фракция</th><th>Кредиты</th><th>Флот</th><th>Склад</th><th>Производство</th><th>Занятие</th><th></th>
        </tr></thead><tbody>${rows}</tbody></table>
        <h3 class="npc-log-title">Дерево: игроки, миры, постройки</h3>
        <div class="adm-tree">${treeNodes}${agentNodes}</div>
<h3 class="npc-log-title">Системы Альянса</h3>
        <table class="mon-table"><thead><tr><th>Система</th><th>Адрес</th><th>Расстояние</th></tr></thead><tbody>${
            ALLIANCE_CORE.map(a => {
                const st = STAR_CATALOG.find(x => ('ГМ-' + x.id) === a);
                return `<tr><td>${st ? st.name : a.replace('ГМ-', '')}</td><td class="mon-sub">${a}</td><td class="num">${st ? st.ly : '—'} св. лет</td></tr>`;
            }).join('')
        }</tbody></table>
        <h3 class="npc-log-title">Экономика · баланс спроса и предложения</h3>
        <table class="mon-table"><thead><tr><th>Товар</th><th>Спрос</th><th>Предложение</th><th>Покрытие</th><th>Цена</th></tr></thead><tbody>${
            ['water', 'grain', 'steel', 'chips', 'heavy', 'uranium', 'rare', 'ice'].map(gid => {
                const info = RESOURCES[gid] || { name: gid, price: 0 };
                let demand = 0, supply = 0;
                WORLDS.forEach(w => {
                    demand += (w.needs && w.needs[gid]) || 0;
                    supply += (w.produces && w.produces[gid]) || 0;
                });
                const ratio = demand / Math.max(supply, 0.15);
                const factor = Math.max(0.4, Math.min(3, Math.pow(ratio, 0.6)));
                const price = Math.round(info.price * factor);
                const cover = demand > 0 ? Math.round(supply / demand * 100) : 100;
                const cls = cover < 80 ? 'style="color:#ff8a6b"' : (cover > 150 ? 'style="color:#2ecc71"' : '');
                return `<tr><td>${info.name}</td><td class="num">${demand.toFixed(1)}</td><td class="num">${supply.toFixed(1)}</td>
                    <td class="num" ${cls}>${cover}%</td><td class="num">${price.toLocaleString()}</td></tr>`;
            }).join('')
        }</tbody></table>
        <h3 class="npc-log-title">Агенты Альянса · ${(typeof NPC_AGENTS !== 'undefined' ? NPC_AGENTS.length : 0)}</h3>
        <table class="mon-table"><thead><tr>
            <th>Агент</th><th>База</th><th>Лет</th><th>Богатство</th><th>Население</th><th>Флот</th><th>Постройки</th><th>Занятие</th>
        </tr></thead><tbody>${
            (typeof NPC_AGENTS !== 'undefined' ? NPC_AGENTS : []).map(n => `<tr class="${n.kind === 'pirate' ? 'npc-pirate' : ''}">
                <td><b>${n.name}</b><div class="mon-sub">${n.id} · агент</div></td>
                <td>${n.base}</td>
                <td class="num">${n.age}</td>
                <td class="num">${n.wealth.toLocaleString()}</td>
                <td class="num">${n.pop ? (n.pop >= 1e9 ? (n.pop / 1e9).toFixed(2) + ' млрд' : (n.pop / 1e6).toFixed(0) + ' млн') : '—'}</td>
                <td class="num">${n.ships}</td>
                <td class="num">${n.buildings}</td>
                <td>${n.kind === 'pirate' ? 'налётов ' + n.raids : ({ trade: 'торговля', farm: 'фермы', mine: 'добыча', industry: 'заводы' }[n.kind] || '')}</td>
            </tr>`).join('')
        }</tbody></table>
        <h3 class="npc-log-title">Постройки игроков и рас · всего ${allB.length}</h3>
        <input class="auth-input" placeholder="Поиск: игрок, постройка, раса" value="${window.__adminBldSearch || ''}"
            oninput="window.__adminBldSearch = this.value; renderAdminPanel();" style="margin: 0 0 10px; max-width: 340px">
        <table class="mon-table"><thead><tr>
            <th>Игрок</th><th>Постройка</th><th>Раса</th><th>Уровень</th><th>Выпуск</th>
        </tr></thead><tbody>${bldRows}</tbody></table>`;
}

window.changeUserPassword = (email) => {
    const newPass = prompt(`Введите новый пароль для ${email}:`);
    if (newPass && newPass.trim() !== "") {
        const user = usersDB.find(u => u.email === email);
        if (user) { user.password = newPass.trim(); localStorage.setItem('galaktika_users', JSON.stringify(usersDB)); notify("Пароль успешно изменен!"); }
    }
};
window.deleteUser = (email) => { usersDB = usersDB.filter(u => u.email !== email); localStorage.setItem('galaktika_users', JSON.stringify(usersDB)); renderAdminPanel(); };

// === ФЛОТ: ДВИГАТЕЛИ, КОРАБЛИ, ДОК ===
// Четыре семейства двигателей задают характер корабля: тягу, расход, цену.
// Единица скорости: 1 у.е. = 7 px/с в масштабе сцены. У каждого привода свои
// предельная скорость и разгон — технологии разные, и это видно в цифрах.
const SPEED_UNIT = 7;

const DRIVES = {
    jet: { name: 'Реактивный', color: '#ff9a4d', vmax: 3.2, accel: 2.4, note: 'дёшево и тяговито, но прожорливо' },
    ion: { name: 'Ионный', color: '#4fd8ff', vmax: 2.4, accel: 0.8, note: 'экономичный, дальний ход, слабая тяга' },
    plasma: { name: 'Плазменный', color: '#b06bff', vmax: 5.6, accel: 4.2, note: 'самый быстрый, горячий и дорогой' },
    grav: { name: 'Гравитационный', color: '#7dffb0', vmax: 2.8, accel: 1.6, note: 'тяжёлый ход, броня и плавность' }
};

// Гравитационная постоянная сцены: подбирается так, чтобы у планет траектории
// заметно искривлялись, но корабль не «прилипал» к ним.
const GRAV_K = 900;

function driveTechLevel(drive) {
    if (!currentUser) return 1;
    const tech = currentUser.driveTech || {};
    return tech[drive] || 1;
}

// Уровень технологии привода: +15 % к разгону и предельной скорости за уровень.
function effectiveDrive(drive) {
    const d = DRIVES[drive];
    const lvl = driveTechLevel(drive);
    const extra = (currentUser && currentUser.driveExtra && currentUser.driveExtra[drive]) || 0;
    if (window.__engines) {
        const vmax = window.__engines.speed(drive, lvl, extra);
        const k = d.vmax ? vmax / d.vmax : 1;
        return { vmax: vmax, accel: Math.round(d.accel * k * 100) / 100, level: lvl, extra: extra };
    }
    const k = 1 + (lvl - 1) * 0.15 + 0.18 * extra;
    return { vmax: Math.round(d.vmax * k * 100) / 100, accel: Math.round(d.accel * k * 100) / 100, level: lvl, extra: extra };
}

// У каждого народа свой флот и свои названия кораблей одного класса.
const RACE_SHIP_NAMES = {
    earth: {
        jet_scout: 'Искра', jet_hauler: 'Баржа', ion_courier: 'Стриж', ion_prospector: 'Старатель',
        plasma_interceptor: 'Клинок', plasma_lancer: 'Копьё', grav_frigate: 'Щит', grav_colossus: 'Молот'
    },
    mars: {
        jet_scout: 'Шёпот', jet_hauler: 'Тихий воз', ion_courier: 'Ветер', ion_prospector: 'Глубина',
        plasma_interceptor: 'Игла', plasma_lancer: 'Статика', grav_frigate: 'Купол', grav_colossus: 'Безмолвие'
    },
    belt: {
        jet_scout: 'Осколок', jet_hauler: 'Рудовоз', ion_courier: 'Струна', ion_prospector: 'Бур',
        plasma_interceptor: 'Крюк', plasma_lancer: 'Гарпун', grav_frigate: 'Каркас', grav_colossus: 'Титан'
    }
};

// Название корабля с учётом расы игрока, с откатом на общее.
function shipName(id) {
    const race = (currentUser && currentUser.faction) || 'earth';
    const table = RACE_SHIP_NAMES[race] || RACE_SHIP_NAMES.earth;
    if (table && table[id]) return table[id];
    return (SHIPS[id] && SHIPS[id].name) || id;
}

const SHIPS = {
    jet_scout: { name: '«Искра»', cls: 'Разведчик', drive: 'jet', price: 18000, steel: 60, parts: { steel: 60, copper: 20, nickel: 10, silver: 2, gold: 1, chips: 8 }, hull: 40, shield: 10, speed: 2.4, cargo: 40, crew: 2, guns: [{ n: 'Автопушка 20 мм', d: 6, t: 'кинетика' }], desc: 'Малый разведчик: дешёвый, быстрый, но без запаса прочности.' },
    jet_hauler: { name: '«Баржа»', cls: 'Грузовик', drive: 'jet', price: 26000, steel: 120, parts: { steel: 120, copper: 40, nickel: 25, silver: 4, gold: 1, chips: 14, boards: 20, manip: 4 }, hull: 90, shield: 15, speed: 1.2, cargo: 600, crew: 4, guns: [{ n: 'Автопушка 20 мм', d: 4, t: 'кинетика' }], desc: 'Рабочая лошадь торговца: трюм на 600 тонн, брони почти нет.' },
    ion_courier: { name: '«Стриж»', cls: 'Курьер', drive: 'ion', price: 34000, steel: 80, parts: { steel: 80, copper: 30, nickel: 15, silver: 3, gold: 2, chips: 20, boards: 26, manip: 3 }, hull: 55, shield: 25, speed: 3.0, cargo: 150, crew: 3, guns: [{ n: 'Лазер 40 кВт', d: 8, t: 'энергия' }], desc: 'Дальний курьер: ионный ход экономит топливо на длинных маршрутах.' },
    ion_corsair: { name: 'Корсар «Вольный»', cls: 'Корсар', drive: 'ion', price: 75000, steel: 120, parts: { steel: 120, copper: 36, nickel: 18, silver: 3, gold: 1, chips: 14, boards: 16, manip: 3 }, hull: 120, shield: 50, speed: 3, cargo: 200, crew: 4, guns: [{ n: 'Ионная пушка 40 мм', d: 12, t: 'энергия' }], desc: 'Прочный курьер-универсал: держит удар лучше «Стрижа», возит вдвое больше, но медленнее.' },
    ion_prospector: { name: '«Старатель»', cls: 'Добытчик', drive: 'ion', price: 42000, steel: 140, parts: { steel: 140, copper: 60, nickel: 35, silver: 6, gold: 2, chips: 18, boards: 24, manip: 6 }, hull: 110, shield: 20, speed: 1.4, cargo: 500, crew: 5, guns: [{ n: 'Автопушка 20 мм', d: 5, t: 'кинетика' }, { n: 'Бур-дробовик', d: 7, t: 'кинетика' }], desc: 'Мирный добытчик, но с «клыками»: в Поясе без них не выжить.' },
    plasma_interceptor: { name: '«Клинок»', cls: 'Перехватчик', drive: 'plasma', price: 58000, steel: 110, parts: { steel: 110, copper: 45, nickel: 30, silver: 8, gold: 3, chips: 30, boards: 34, manip: 5 }, hull: 70, shield: 40, speed: 4.2, cargo: 60, crew: 2, guns: [{ n: 'Плазменная пушка', d: 14, t: 'плазма' }, { n: 'Плазменная пушка', d: 14, t: 'плазма' }], desc: 'Перехватчик: догоняет любого, кто уходит с грузом.' },
    plasma_lancer: { name: '«Копьё»', cls: 'Ланцет', drive: 'plasma', price: 92000, steel: 200, parts: { steel: 200, copper: 80, nickel: 50, silver: 14, gold: 5, chips: 44, boards: 48, manip: 8 }, hull: 130, shield: 60, speed: 3.4, cargo: 120, crew: 4, guns: [{ n: 'Тяжёлая плазма', d: 30, t: 'плазма' }, { n: 'Ракетный залп', d: 12, t: 'ракеты' }], desc: 'Охотник за пиратами: один залп решает бой.' },
    grav_frigate: { name: '«Щит»', cls: 'Фрегат', drive: 'grav', price: 130000, steel: 320, parts: { steel: 320, copper: 120, nickel: 80, silver: 24, gold: 8, chips: 70, boards: 76, manip: 14 }, hull: 260, shield: 120, speed: 2.2, cargo: 300, crew: 12, guns: [{ n: 'Турель 30 мм', d: 18, t: 'кинетика' }, { n: 'Турель 30 мм', d: 18, t: 'кинетика' }], desc: 'Конвой: гравитационный привод держит удар и не трясёт груз.' },
    grav_colossus: { name: '«Молот»', cls: 'Линкор', drive: 'grav', price: 320000, steel: 900, parts: { steel: 900, copper: 300, nickel: 200, silver: 60, gold: 20, chips: 160, boards: 180, manip: 30 }, hull: 620, shield: 260, speed: 1.6, cargo: 700, crew: 40, guns: [{ n: 'Тяжёлое орудие', d: 40, t: 'кинетика' }, { n: 'Тяжёлое орудие', d: 40, t: 'кинетика' }, { n: 'Турель 30 мм', d: 18, t: 'кинетика' }], desc: 'Флагман: медленный, дорогой, но сносит пиратскую стаю целиком.' }
};
window.SHIPS = SHIPS;


// Рендеры от ИИ, прошедшие отбор (остальные показываются SVG-иконкой).
const RENDER_OK = { jet_scout: 1, jet_hauler: 1, ion_courier: 1, ion_prospector: 1, plasma_interceptor: 1, plasma_lancer: 1 };
function shipArt(id) { return RENDER_OK[id] ? `/images/ships/render/${id}.jpg` : `/images/ships/${id}.svg`; }

const SHIP_ORDER = ['jet_scout', 'jet_hauler', 'ion_courier', 'ion_prospector', 'plasma_interceptor', 'plasma_lancer', 'grav_frigate', 'grav_colossus'];
const DOCK_SLOT_PRICE = 75000;

// Ничего не строится мгновенно. Время в минутах реального времени.
const MAX_PARALLEL_BUILDS = 4;

// Каждый следующий уровень: время растёт экспоненциально, а расход стали
// и рабочих рук падает — крупная стройка эффективнее мелкой.
function levelTime(baseMinutes, level) { return window.__prod ? window.__prod.levelTime(baseMinutes, level) : Math.max(1, Math.round(baseMinutes * Math.pow(1.5, level))); }
function levelSteel(baseSteel, level) { return window.__prod ? window.__prod.levelSteel(baseSteel, level) : Math.max(1, Math.round(baseSteel * Math.pow(0.9, level))); }
function levelCrew(baseCrew, level) { return window.__prod ? window.__prod.levelCrew(baseCrew, level) : Math.max(0, Math.round(baseCrew * Math.pow(0.85, level))); }
const SHIP_BUILD_MIN = { jet_scout: 3, jet_hauler: 4, ion_courier: 5, ion_prospector: 6,
    plasma_interceptor: 7, plasma_lancer: 9, grav_frigate: 12, grav_colossus: 18 };
const FACTORY_BUILD_MIN = 3;
// Андроиды — рабочая сила: каждый уровень фабрики требует 10 единиц на смене.
const ANDROIDS_PER_LEVEL = 10;

// Производство в доке: фабрика андроидов и завод оборудования.
// Уровень 1..3, каждый уровень ускоряет выпуск.
const FACTORIES = {
    robots: { name: 'Фабрика андроидов', desc: 'Собирает андроидов для работ на поверхности планет и астероидов.', out: 'androids', per: 1, every: 25, cost: 45000, steel: 120 },
    equipment: { name: 'Завод оборудования', desc: 'Печатает чипы и платы для кораблей и станций.', out: 'chips', per: 2, every: 20, cost: 38000, steel: 90 }
};

// =========================================================
// РЕЙСЫ ИГРОКА
// =========================================================
// Корабль уходит по маршруту между биржами. Время сжато: 1 игровой час = 1
// реальная минута, иначе рейс Луна → Фобос шёл бы 38 реальных часов.
const TRIP_SCALE = 60;                 // игровых секунд на реальную секунду
const ROUTES_TRADE = [
    { id: 'moon-phobos', name: 'Луна → Фобос', hours: 38, risk: 0.25, margin: 1.35 },
    { id: 'phobos-ceres', name: 'Фобос → Церера', hours: 46, risk: 0.30, margin: 1.4 },
    { id: 'ceres-ganymede', name: 'Церера → Ганимед', hours: 30, risk: 0.35, margin: 1.5 },
    { id: 'ganymede-titan', name: 'Ганимед → Титан', hours: 34, risk: 0.4, margin: 1.55 },
    { id: 'titan-gate', name: 'Титан → Врата', hours: 30, risk: 0.2, margin: 1.6 }
];

function tripMinutes(hours) { return Math.max(1, Math.round(hours * 60 / TRIP_SCALE)); }

window.startTrip = (index) => {
    ensureFleet(currentUser);
    const ship = currentUser.ships[index];
    if (!ship) { notify('Нет корабля'); return; }
    if (!Array.isArray(currentUser.trips)) currentUser.trips = [];
    if (currentUser.trips.some(t => t.shipIndex === index)) { notify('Этот борт уже в рейсе'); return; }

    const cargoCost = Math.round(SHIPS[ship.id].cargo * 12);
    // если в трюме есть артефакт — везём его: на чужой бирже он дороже
    let carried = null;
    if (Array.isArray(currentUser.artifacts) && currentUser.artifacts.length) {
        carried = currentUser.artifacts.shift();
    }
    if (currentUser.credits < cargoCost) { notify('Нужно ' + cargoCost.toLocaleString() + ' кр на груз'); return; }
    const route = ROUTES_TRADE[Math.floor(Math.random() * ROUTES_TRADE.length)];
    currentUser.credits -= cargoCost;
    const mins = tripMinutes(route.hours);
    currentUser.trips.push({
        shipIndex: index, route: route.id, routeName: route.name, risk: route.risk,
        margin: route.margin, cost: cargoCost, artifact: carried, endsAt: Date.now() + mins * 60000, minutes: mins
    });
    saveUser(); renderDock(); updateCredits();
    notify(`Борт ушёл: ${route.name}, ${mins} мин`);
};

function tickTrips() {
    if (!currentUser || !Array.isArray(currentUser.trips) || !currentUser.trips.length) return;
    const now = Date.now();
    for (let i = currentUser.trips.length - 1; i >= 0; i--) {
        const t = currentUser.trips[i];
        if (now < t.endsAt) continue;
        const ship = currentUser.ships[t.shipIndex];
        // встреча с пиратом
        if (Math.random() < t.risk * (1 - 0.03 * researchLevel('antigrav'))) {
            const power = ship ? (SHIPS[ship.id].hull + SHIPS[ship.id].shield) : 50;
            if (power < 120) {
                const lost = Math.round(t.cost * 0.5);
                currentUser.credits = Math.max(0, currentUser.credits - lost);
                notify(`Рейс ${t.routeName}: пираты перехватили груз, потеря ${lost.toLocaleString()} кр`);
                currentUser.trips.splice(i, 1);
                continue;
            }
            notify(`Рейс ${t.routeName}: пираты атаковали, но борт отбился`);
        }
        const profit = Math.round(t.cost * t.margin);
        currentUser.credits += profit;
        if (t.artifact) {
            const gain = Math.max(1, Math.round(t.artifact.crystals * 1.5));
            currentUser.resources.eternity = (currentUser.resources.eternity || 0) + gain;
            notify(`Артефакт «${t.artifact.name}» продан на чужой бирже: +${gain} крст`);
        }
        notify(`Рейс ${t.routeName} завершён: +${profit.toLocaleString()} кр`);
        currentUser.trips.splice(i, 1);
    }
    saveUser(); if (document.getElementById('fleet-modal') && document.getElementById('fleet-modal').style.display === 'flex') renderDock();
}

function ensureFleet(user) {
    if (!user) return;
    if (typeof user.credits !== 'number') user.credits = 80000;
    if (typeof user.dockSlots !== 'number') user.dockSlots = 1;
    if (!Array.isArray(user.ships)) user.ships = [];
    if (!Array.isArray(user.fleet)) user.fleet = [];
    if (!user.driveTech) user.driveTech = { jet: 1, ion: 1, plasma: 1, grav: 1 };
    if (!user.factories) user.factories = { robots: 0, equipment: 0 };
    if (!user.quests) user.quests = { trade: 0, ice: 0, yard: 0 };
    if (!user.factoryClock) user.factoryClock = 0;
    if (!Array.isArray(user.buildQueue)) user.buildQueue = [];
    if (typeof user.habitatsBuilt !== 'number') user.habitatsBuilt = 0;
    if (typeof user.medModules !== 'number') user.medModules = 0;
    if (typeof user.cloners !== 'number') user.cloners = 0;
    if (!user.lang) user.lang = 'ru';
}


// Физика борта из единого ядра: класс, скорость, разгон/торможение, время рейса
function fleetPhysicsLine(shipId) {
    try {
        if (!window.Motion) return '';
        const art = shipId;
        const v = window.Motion.shipSpeed(art, {
            engineLevel: (currentUser && currentUser.engineLevel) || 0,
            techLevel: (currentUser && currentUser.techLevel) || 0
        });
        const kmPerPx = window.Motion.TABLES.motion.kmPerAu / window.Motion.TABLES.motion.pxPerAuAtEarth;
        // эталонный рейс: Земля -> Марс по таблице
        const r = window.Motion.TABLES.routes.find(x => x.id === 'earth-mars');
        const prof = window.Motion.flightProfile(r.len * kmPerPx, v);
        const cls = (window.Motion.TABLES.ships[art] || {}).cls || 'light';
        const clsRu = cls === 'truck' ? 'грузовик' : (cls === 'fighter' ? 'истребитель' : 'лёгкий транспорт');
        return `<div class="ship-physics" style="font-size:11px;color:#8fb4d8;margin-top:4px">
            ${clsRu} · <b>${Math.round(v).toLocaleString('ru-RU')} км/с</b>
            · разгон ${Math.round(prof.tAcc)} с · торможение ${Math.round(prof.tAcc)} с
            · Земля→Марс ${Math.round(prof.total / 60)} с</div>`;
    } catch (e) { return ''; }
}

function shipCardHtml(shipId, actions) {
    const s = SHIPS[shipId];
    const d = DRIVES[s.drive];
    const eff = effectiveDrive(s.drive);
    return `<div class="ship-card">
        <div class="ship-head">
            <div class="ship-stage" onclick="openHangar('${shipId}')" title="Открыть в доке">
                <span class="stage-ring"></span>
                <img class="ship-img" src="${shipArt(shipId)}" alt="">
                <span class="stage-pad"></span>
            </div>
            <div><div class="ship-name">${s.name}</div><div class="ship-cls">${s.cls} · <span style="color:${d.color}">${d.name}</span></div></div></div>
        <div class="ship-desc">${s.desc}</div>
        <div class="ship-stats">
            <span>Корпус <b>${s.hull}</b></span><span>Щит <b>${s.shield}</b></span>
            <span>Ход <b>${(eff.vmax).toFixed(1)} у.е.</b></span><span>Разгон <b>${(eff.accel).toFixed(1)} у.е./с²</b></span>
            <span>Трюм <b>${s.cargo} т</b></span><span>Экипаж <b>${s.crew}</b></span>
        </div>
        ${fleetPhysicsLine(shipId)}
        <div class="ship-guns">${s.guns.map(g => `<span class="gun">${g.n} · ${g.d} ${g.t}</span>`).join('')}</div>
        <button class="auth-btn" style="width:auto;padding:6px 12px;margin-top:8px" onclick="openBlueprint('${shipId}')">Чертёж</button>
        ${actions || ''}</div>`;
}

window.upgradeDrive = (drive) => {
    ensureFleet(currentUser);
    const lvl = driveTechLevel(drive);
    const cost = 25000 * lvl;
    if (currentUser.credits < cost) { notify('Нужно ' + cost.toLocaleString() + ' кр на тюнинг'); return; }
    currentUser.credits -= cost;
    currentUser.driveTech[drive] = lvl + 1;
    saveUser(); updateCredits();
    const openShip = document.querySelector('.hangar-ship');
    if (openShip) { const id = openShip.getAttribute('src').split('/').pop().replace('.svg', ''); renderHangar(id); }
};

// =========================================================
// ВРЕМЯ ПЕРЕЛЁТА: релятивистская брахистохрона
// =========================================================
// Корабль разгоняется половину пути и тормозит вторую половину с постоянным
// собственным ускорением a. Координатное время (время станции):
//     t = 2*(c/a)*sinh(a*tau/c),  где tau = (c/a)*acosh(1 + a*d/(2c^2))
// Скорость v = c*tanh(a*tau/c) всегда меньше c — предел не нарушается.
const LIGHT_C = 299792.458;               // км/с

const TRAVEL_PROFILES = {
    boost: { name: 'форсаж', accel: 26694, note: 'короткие плечи, до 2 700 g' },
    cruise: { name: 'крейсер', accel: 908, note: 'дальние рейсы, 93 g' }
};

function brachistochrone(km, accel) {
    const c = 299792458, d = Math.abs(km) * 1000, a = accel;
    const arg = 1 + (a * d) / (2 * c * c);
    const tau = (c / a) * Math.acosh(arg);          // собственное время половины пути
    const tHalf = (c / a) * Math.sinh((a * tau) / c);
    const vMax = c * Math.tanh((a * tau) / c);
    return {
        seconds: 2 * tHalf,
        proper: 2 * tau,
        vMax: vMax / 1000,                            // км/с
        gamma: 1 / Math.sqrt(1 - (vMax / c) * (vMax / c))
    };
}

// Маршруты для справки в доке (км).
const ROUTES = [
    { name: 'Земля → Луна', km: 384400, profile: 'boost' },
    { name: 'Земля → Марс', km: 78300000, profile: 'cruise' },
    { name: 'Земля → Юпитер', km: 628000000, profile: 'cruise' },
    { name: 'Земля → Нептун', km: 4340000000, profile: 'cruise' }
];

function routeTime(km, profileKey) {
    const r = brachistochrone(km, TRAVEL_PROFILES[profileKey].accel);
    const d = r.seconds < 3600 ? (r.seconds / 60).toFixed(0) + ' мин'
        : r.seconds < 86400 ? (r.seconds / 3600).toFixed(1) + ' ч'
            : (r.seconds / 86400).toFixed(2) + ' сут';
    return { time: d, vMax: Math.round(r.vMax).toLocaleString(), gamma: r.gamma.toFixed(3) };
}

function hangarStatsHtml(s) {
    const bar = (label, value, max) => {
        const pct = Math.max(4, Math.min(100, Math.round(value / max * 100)));
        return `<div class="hstat"><span>${label}</span><i><b style="width:${pct}%"></b></i><em>${value}</em></div>`;
    };
    return bar('Корпус', s.hull, 650) + bar('Щит', s.shield, 280) + bar('Ход', s.speed, 5) + bar('Трюм', s.cargo, 700);
}

// «Док»: корабль на подиуме, как будто его готовят к полёту.
function renderHangar(shipId) {
    ensureFleet(currentUser);
    const s = SHIPS[shipId];
    const d = DRIVES[s.drive];
    const eff = effectiveDrive(s.drive);
    const body = document.getElementById('fleet-body');
    if (!body || !s) return;

    const canBuy = currentUser.credits >= s.price && (currentUser.resources.steel || 0) >= s.steel && currentUser.ships.length < currentUser.dockSlots;
    const reason = currentUser.ships.length >= currentUser.dockSlots ? 'В доке нет свободного места' :
        currentUser.credits < s.price ? 'Не хватает кредитов' :
            (currentUser.resources.steel || 0) < s.steel ? 'Не хватает стали' : '';

    body.innerHTML = `
        <button class="back-btn" onclick="renderDock()">← Назад к верфи</button>
        <div class="hangar">
            <div class="hangar-stage">
                <span class="hangar-ring"></span>
                <span class="hangar-glow"></span>
                <img class="hangar-render" src="${shipArt(shipId)}" alt="">
                <span class="hangar-platform"></span>
            </div>
            <div class="hangar-info">
                <div class="ship-cls">${s.cls} · <span style="color:${d.color}">${d.name} привод</span></div>
                <h2 class="hangar-title">${s.name}</h2>
                <p class="hangar-desc">${s.desc}</p>
                <div class="hangar-status"><span class="dot"></span>Подготовка к полёту<span class="dots"><i>.</i><i>.</i><i>.</i></span></div>
                <div class="hstats">${hangarStatsHtml(s)}</div>
                <div class="ship-guns">${s.guns.map(g => `<span class="gun">${g.n} · ${g.d} ${g.t}</span>`).join('')}</div>
                <div class="engine-row">
                    <span class="engine-lvl">Двигатель: ур. <b>${eff.level}</b> · ${(eff.accel).toFixed(1)} у.е./с² · макс ${(eff.vmax).toFixed(1)} у.е.</span>
                    <button class="auth-btn" style="width:auto;padding:6px 12px;margin:0" onclick="upgradeDrive('${s.drive}')">Тюнинг · ${(25000 * eff.level).toLocaleString()} кр</button>
                </div>
                <div class="route-table">${ROUTES.map(r => {
                    const t = routeTime(r.km, r.profile);
                    return `<div class="route-row"><span>${r.name}</span><b>${t.time}</b><i>${t.vMax} км/с · γ ${t.gamma}</i></div>`;
                }).join('')}</div>
                <div class="hangar-buy">
                    <span class="price ${canBuy ? '' : 'no'}">${s.price.toLocaleString()} кр <i>+ ${s.steel} т стали</i></span>
                    <button class="auth-btn" style="width:auto;padding:10px 22px;margin:0" ${canBuy ? `onclick="buyShip('${shipId}'); renderDock();"` : 'disabled'}>${canBuy ? 'Купить и занять место' : reason}</button>
                </div>
            </div>
        </div>`;
}

// Автопилот для тестовых прогонов: выполняет первую цепочку за игрока
// и пишет отчёт в #autopilot-report (видно в DOM-дампе).
window.runAutopilot = async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const log = [];
    ensureFleet(currentUser);
    log.push('старт: кредиты ' + currentUser.credits + ', кораблей ' + currentUser.ships.length);

    if (!currentUser.ships.length) {
        window.buyShip('jet_hauler');
        await wait(150);
        log.push('куплен корабль: ' + (currentUser.ships[0] ? SHIPS[currentUser.ships[0].id].name : 'нет') + ', кредиты ' + currentUser.credits);
    }
    if (questStep('trade') === 0) { currentUser.quests.trade = 1; saveUser(); log.push('шаг 1 пройден'); }
    if (questStep('trade') === 1) {
        window.questAct('trade', 'buy');
        await wait(120);
        log.push('партия куплена, кредиты ' + currentUser.credits);
    }
    if (questStep('trade') === 2) {
        window.questAct('trade', 'sell');
        await wait(120);
        log.push('груз продан, кредиты ' + currentUser.credits);
    }
    log.push('итог: шаг ' + questStep('trade') + ' из 3, кредиты ' + currentUser.credits);
    const box = document.createElement('div');
    box.id = 'autopilot-report';
    box.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:99999;color:#2ecc71;font:11px monospace;background:rgba(0,0,0,.7);padding:6px';
    box.textContent = 'AUTOPILOT ' + currentUser.email + ': ' + log.join(' | ');
    document.body.appendChild(box);
};

window.startHangar3D = (canvas, id) => {
    if (!canvas) return;
    import('/js/hangar3d.js').then(m => m.start(canvas, id)).catch(e => console.warn('3D-док недоступен:', e));
};

window.openHangar = (shipId) => { renderHangar(shipId); };
window.renderHangar = renderHangar;

function renderDock() {
    ensureFleet(currentUser);
    const body = document.getElementById('fleet-body');
    const title = document.getElementById('fleet-faction-name');
    if (title) title.textContent = '· док, мест: ' + currentUser.dockSlots + ' · кредиты: ' + Math.round(currentUser.credits).toLocaleString('ru-RU');
    if (!body) return;

    let html = '<div class="dock-grid">';
    for (let i = 0; i < currentUser.dockSlots; i++) {
        const ship = currentUser.ships[i];
        if (ship) {
            const trip = (currentUser.trips || []).find(t => t.shipIndex === i);
            const modBtn = `<button class="auth-btn" style="margin-top:6px" onclick="window.__modShip=${i}; openModernize(${i})">Модернизация</button>` +
                (COMBAT_IDS.includes(ship.id)
                    ? `<button class="auth-btn" style="margin-top:6px;border-color:rgba(255,120,80,0.7);color:#ffb37a" onclick="openFlightFor(${i})">⚔ В бой</button>`
                    : '');
            const tripBtn = trip
                ? `<div class="trip-line">в рейсе: ${trip.routeName} · осталось ${Math.max(0, Math.ceil((trip.endsAt - Date.now()) / 60000))} мин</div>`
                : `<button class="auth-btn" style="margin-top:6px" onclick="startTrip(${i})">Отправить в рейс</button>`;
            html += `<div class="dock-slot filled">${shipCardHtml(ship.id, modBtn + tripBtn + `<button class="auth-btn" style="margin-top:6px" onclick="sellShip(${i})">Продать за ${Math.round(SHIPS[ship.id].price * 0.6).toLocaleString()} кр</button>`)}</div>`;
        } else {
            html += `<div class="dock-slot"><div class="dock-empty">Место ${i + 1}<br><span>свободно</span></div>
                <button class="auth-btn" onclick="scrollToShop()">Купить корабль</button></div>`;
        }
    }
    html += `<div class="dock-slot rent"><div class="dock-empty">Место ${currentUser.dockSlots + 1}<br><span>аренда</span></div>
        <button class="auth-btn" onclick="rentDockSlot()">Арендовать · ${DOCK_SLOT_PRICE.toLocaleString()} кр</button></div>`;
    html += '</div>';

    if (currentUser.buildQueue.length) {
        html += '<h3 style="margin:26px 0 12px; font-weight:400">Строится</h3><div class="build-queue">';
        currentUser.buildQueue.forEach(q => {
            const left = Math.max(0, q.endsAt - Date.now());
            const pct = Math.round(100 - (left / (q.minutes * 60000)) * 100);
            html += `<div class="build-row"><span>${q.name}</span><i><b style="width:${pct}%"></b></i><em>${Math.ceil(left / 60000)} мин</em></div>`;
        });
        html += '</div>';
    }

    const target = 263;
    const built = currentUser.habitatsBuilt || 0;
    const pctDone = Math.min(100, Math.round(built / target * 100));
    html += '<h3 style="margin:26px 0 12px; font-weight:400">Застройка планеты</h3>' +
        `<div class="hab-row"><div class="hab-bar"><b style="width:${pctDone}%"></b></div>` +
        `<span>${built} из ${target} массивов · ${pctDone}%</span>` +
        `<button class="auth-btn" style="width:auto;padding:8px 16px;margin:0" onclick="buildHabitat()">🏙 Жилой массив · 40 000 кр + 120 т</button></div>`;

    const energy = totalEnergy();
    html += '<h3 style="margin:26px 0 12px; font-weight:400">Энергия · ' + energy + ' МВт</h3><div class="factory-row">';
    ['solar','fusion','wind','geo','tidal'].forEach(pid => {
        const b = BUILDINGS.find(x => x.id === pid);
        if (!b) return;
        if (pid === 'wind' || pid === 'geo' || pid === 'tidal') {
            if ((currentUser.faction || 'earth') !== 'earth') return;
        }
        const lvl = (currentUser.plants || {})[pid] || 0;
        const price = b.cost * (lvl + 1);
        const eff = pid === 'solar' ? Math.round((SOLAR_EFFICIENCY[currentUser.faction] || 1) * 100) : 100;
        html += `<div class="factory-card">
            <div class="factory-name">${b.name}</div>
            <div class="factory-desc">${b.note}${pid === 'solar' ? ' · КПД ' + eff + '%' : ''}</div>
            <div class="factory-out">ур. <b>${lvl}</b> · ${PLANT_POWER[pid]} МВт${pid === 'solar' ? ' × ' + eff + '%' : ''}</div>
            <button class="auth-btn" ${lvl >= 5 ? 'disabled' : ''} onclick="buildPlant('${pid}')">${lvl >= 5 ? 'максимум' : 'Построить · ' + price.toLocaleString() + ' кр'}</button>
        </div>`;
    });
    html += '</div>';

    // язык интерфейса
    const curLang = (currentUser && currentUser.lang) || 'ru';
    html += '<h3 style="margin:26px 0 12px; font-weight:400">Язык интерфейса</h3>' +
        '<div class="hab-row">' +
        [['ru', 'Русский'], ['en', 'English'], ['zh', '中文']].map(x =>
            '<button class="auth-btn" style="width:auto;padding:6px 14px;margin:0' + (x[0] === curLang ? ';border-color:#7fe3ff;color:#7fe3ff' : '') + '" onclick="setUserLang(\'' + x[0] + '\')">' + x[1] + '</button>'
        ).join('') +
        '</div>';

    // оборудование: клонирование
    const cloneHave = currentUser.cloners || 0;
    const cloneBonus = Math.min(2, cloneHave * 0.5);
    html += '<h3 style="margin:26px 0 12px; font-weight:400">Клонирование</h3>' +
        '<div class="hab-row">' +
        `<span>комплексов ${cloneHave} из 4 · прирост рождаемости +${cloneBonus}% (нужен избыток еды)</span>` +
        `<button class="auth-btn" style="width:auto;padding:8px 14px;margin:0" onclick="buildCloner()">Построить · 380 000 кр</button>` +
        `<button class="auth-btn" style="width:auto;padding:8px 14px;margin:0" onclick="buyCloner()">Купить · 500 000 кр</button>` +
        '</div>';

    // найм людей
    html += '<h3 style="margin:26px 0 12px; font-weight:400">Найм колонистов</h3>' +
        `<div class="hab-row" style="align-items:flex-start"><span style="min-width:150px">колония: ${(GLOBE_NAMES[window.COLONY_WORLD] || 'Кеплер-1')} · жителей ${(window.COLONY_POP || 0).toLocaleString()}</span>` +
        '<button class="auth-btn" style="width:auto;padding:8px 12px;margin:0" onclick="hirePeople(\'earth\', 1000)">Земля · 1000</button>' +
        '<button class="auth-btn" style="width:auto;padding:8px 12px;margin:0" onclick="hirePeople(\'mars\', 1000)">Марс · 1000</button>' +
        '<button class="auth-btn" style="width:auto;padding:8px 12px;margin:0" onclick="hirePeople(\'belt\', 1000)">Пояс · 1000</button>' +
        '<button class="auth-btn" style="width:auto;padding:8px 12px;margin:0" onclick="hirePeople(\'moon\', 1000)">Луна · 1000</button>' +
        '</div>';

    // оборудование: медицинские модули
    const medHave = currentUser.medModules || 0;
    const medNeed = 10;   // колония 50 млн при норме 5 млн на модуль
    const medPct = Math.min(100, Math.round(medHave / medNeed * 100));
    const sickPct = medHave === 0 ? 10.8 : Math.max(2.7, 10.8 - 8.1 * (medPct / 100));
    html += '<h3 style="margin:26px 0 12px; font-weight:400">Оборудование</h3>' +
        '<div class="hab-row"><span style="min-width:220px">чертежи двигателей</span>' +
        ['jet', 'ion', 'plasma', 'grav'].map(d => '<button class="auth-btn" style="width:auto;padding:6px 10px;margin:0" onclick="openEngineBlueprint(\'' + d + '\')">' + d + '</button>').join('') +
        '</div>' +
        '<div class="hab-row">' +
        `<div class="hab-bar"><b style="width:${medPct}%;background:linear-gradient(90deg,#2ecc71,#7fe3ff)"></b></div>` +
        `<span>медмодулей ${medHave} из ${medNeed} · покрытие ${medPct}% · больных ${sickPct.toFixed(1)}%</span>` +
        `<button class="auth-btn" style="width:auto;padding:8px 14px;margin:0" onclick="buildMedical()">Построить · 450 000 кр</button>` +
        `<button class="auth-btn" style="width:auto;padding:8px 14px;margin:0" onclick="buyMedical()">Купить · 600 000 кр</button>` +
        `<button class="auth-btn" style="width:auto;padding:8px 14px;margin:0" onclick="openBlueprint('medrobot')">Чертёж</button>` +
        '</div>';

    html += '<h3 style="margin:26px 0 12px; font-weight:400">Производство</h3><div class="factory-row">';
    Object.keys(FACTORIES).forEach(fid => {
        const f = FACTORIES[fid];
        const lvl = currentUser.factories[fid] || 0;
        const price = f.cost * (lvl + 1);
        const can = currentUser.credits >= price && (currentUser.resources.steel || 0) >= f.steel;
        html += `<div class="factory-card">
            <div class="factory-name">${f.name}</div>
            <div class="factory-desc">${f.desc}</div>
            <div class="factory-out">ур. <b>${lvl}</b> · ${f.per * Math.max(lvl, 1)} ${RESOURCES[f.out].name} / ${f.every} с</div>
            <button class="auth-btn ${can || lvl === 0 ? '' : ''}" ${lvl >= 3 ? 'disabled' : ''} onclick="buildFactory('${fid}')">${lvl >= 3 ? 'максимум' : (lvl === 0 ? 'Построить' : 'Улучшить') + ' · ' + price.toLocaleString() + ' кр + ' + f.steel + ' т'}</button>
        </div>`;
    });
    html += '</div>';

    html += '<h3 style="margin:26px 0 12px; font-weight:400">Разведка</h3>' +
        '<div class="survey-row"><span>Разведчик ищет малые астероиды с ценными металлами. Шанс находки 25 %, рейс 3 000 кр.</span>' +
        '<button class="auth-btn" style="width:auto;padding:8px 16px;margin:0" data-needs-scout="1" onclick="surveyAsteroids()">🔍 Отправить разведчик</button></div>';

    html += '<h3 style="margin:26px 0 12px; font-weight:400">Верфь</h3><div class="ship-shop" id="ship-shop">';
    SHIP_ORDER.forEach(id => {
        const s = SHIPS[id];
        const afford = currentUser.credits >= s.price && (currentUser.resources.steel || 0) >= s.steel;
        html += shipCardHtml(id,
            `<div class="ship-buy"><span class="price ${afford ? '' : 'no'}">${s.price.toLocaleString()} кр <i>+ ${s.steel} т стали</i></span>
             <button class="auth-btn ${afford ? '' : 'disabled'}" ${afford ? `onclick="buyShip('${id}')"` : 'disabled'}>Купить</button></div>`);
    });
    html += '</div>';
    body.innerHTML = html;
}

window.openFleet = () => {
    if (!currentUser) return;
    // синхронизируем доки с сервером, чтобы счётчик мест не расходился
    if (typeof syncProfileFromServer === 'function') {
        syncProfileFromServer().then(function () {
            if (typeof renderDock === 'function') renderDock();
        });
    }
    ensureFleet(currentUser); saveUser();
    document.getElementById('fleet-modal').style.display = 'flex';
    renderDock();
};
window.closeFleet = () => { document.getElementById('fleet-modal').style.display = 'none'; };
// Жилой массив: цель — застроить свой мир, веха каждые 10 %.
// =========================================================
// ЭНЕРГЕТИКА
// =========================================================
// Каждая станция даёт мегаватты за уровень. Солнце зависит от мира:
// у Солнца много света, в Поясе — мало.
const SOLAR_EFFICIENCY = { earth: 1.0, moon: 1.0, mars: 0.55, belt: 0.35 };
const PLANT_POWER = { solar: 12, fusion: 80, wind: 7, geo: 14, tidal: 11 };

function totalEnergy() {
    const plants = (currentUser && currentUser.plants) || {};
    let mw = 0;
    Object.keys(plants).forEach(id => {
        const base = PLANT_POWER[id] || 0;
        const level = plants[id] || 0;
        if (id === 'solar') {
            const eff = SOLAR_EFFICIENCY[currentUser.faction] || 1;
            mw += base * level * eff;
        } else {
            mw += base * level;
        }
    });
    return Math.round(mw);
}

window.buildPlant = (id) => {
    ensureFleet(currentUser);
    const b = BUILDINGS.find(x => x.id === id);
    if (!b) { notify('Неизвестная постройка'); return; }
    if (currentUser.buildQueue.length >= MAX_PARALLEL_BUILDS) { notify('Все верфи заняты'); return; }
    const lvl = (currentUser.plants || {})[id] || 0;
    if (lvl >= 5) { notify('Максимальный уровень'); return; }
    const price = b.cost * (lvl + 1);
    if (currentUser.credits < price) { notify('Нужно ' + price.toLocaleString() + ' кр'); return; }
    const pSteel = levelSteel(b.steel, lvl);
    if ((currentUser.resources.steel || 0) < pSteel) { notify('Нужно ' + pSteel + ' т стали'); return; }
    // термоядерная станция не запускается без урана
    if (id === 'fusion') {
        const needU = 20 * (lvl + 1);
        if ((currentUser.resources.uranium || 0) < needU) { notify('Нужно ' + needU + ' кг урана'); return; }
        currentUser.resources.uranium -= needU;
    }
    currentUser.credits -= price;
    currentUser.resources.steel -= pSteel;
    const pMin = levelTime(b.time, lvl);
    currentUser.buildQueue.push({ kind: 'plant', id: id, name: b.name, minutes: pMin, endsAt: Date.now() + pMin * 60000 });
    saveUser(); renderDock(); updateCredits();
};

// Комплекс клонирования: тоже можно построить или купить готовым.
window.buildCloner = () => {
    ensureFleet(currentUser);
    if (currentUser.buildQueue.length >= MAX_PARALLEL_BUILDS) { notify('Все верфи заняты'); return; }
    const cost = 380000, steel = 260, chips = 90;
    if (currentUser.credits < cost) { notify('Нужно ' + cost.toLocaleString() + ' кр'); return; }
    if ((currentUser.resources.steel || 0) < steel) { notify('Нужно ' + steel + ' т стали'); return; }
    if ((currentUser.resources.chips || 0) < chips) { notify('Нужно ' + chips + ' чипов'); return; }
    currentUser.credits -= cost;
    currentUser.resources.steel -= steel;
    currentUser.resources.chips -= chips;
    currentUser.buildQueue.push({ kind: 'cloner', id: 'cloner', name: 'Комплекс клонирования', minutes: 22, endsAt: Date.now() + 22 * 60000 });
    saveUser(); renderDock(); updateCredits();
};

window.buyCloner = () => {
    ensureFleet(currentUser);
    const price = 500000;
    if (currentUser.credits < price) { notify('Нужно ' + price.toLocaleString() + ' кр'); return; }
    currentUser.credits -= price;
    currentUser.cloners = (currentUser.cloners || 0) + 1;
    saveUser(); updateCredits();
    notify('Комплекс клонирования куплен: всего ' + currentUser.cloners);
};

// Медицинский модуль: можно построить самому или купить готовый.
// Постройка дешевле, но идёт 25 минут и требует сталь и чипы.
// Найм людей: чем ближе условия нового мира к родным, тем дешевле переезд.
window.COLONY_WORLD = window.COLONY_WORLD || 'kepler1';
window.COLONY_POP = window.COLONY_POP || 0;

window.setColony = (world) => {
    window.COLONY_WORLD = world;
    renderDock();
};

window.hirePeople = (sourceId, count) => {
    const n = Math.max(100, Math.min(100000, Math.round(count || 1000)));
    import('/js/hiring.js').then(m => {
        const target = window.COLONY_WORLD;
        const price = m.hireCost(sourceId, target) * n;
        if (currentUser.credits < price) {
            notify('Нужно ' + price.toLocaleString() + ' кр (похожесть ' +
                Math.round(m.compatibility(sourceId, target) * 100) + '%)');
            return;
        }
        currentUser.credits -= price;
        const arrived = m.survivors(n, sourceId, target);
        const hours = m.travelHours(sourceId, target);
        window.HIRING_QUEUE = window.HIRING_QUEUE || [];
        window.HIRING_QUEUE.push({ at: m.arrivalAt(sourceId, target, Date.now(), timeScale), count: arrived, source: sourceId });
        saveUser(); updateCredits(); renderDock();
        notify(`${m.SOURCES[sourceId].name}: нанято ${n}, прибудут ${arrived} через ${hours} ч пути · −${price.toLocaleString()} кр`);
    }).catch(e => { console.warn('hiring:', e); notify('Найм недоступен'); });
};

window.buildMedical = () => {
    ensureFleet(currentUser);
    if (currentUser.buildQueue.length >= MAX_PARALLEL_BUILDS) { notify('Все верфи заняты'); return; }
    const cost = 450000, steel = 200, chips = 60;
    if (currentUser.credits < cost) { notify('Нужно ' + cost.toLocaleString() + ' кр'); return; }
    if ((currentUser.resources.steel || 0) < steel) { notify('Нужно ' + steel + ' т стали'); return; }
    if ((currentUser.resources.chips || 0) < chips) { notify('Нужно ' + chips + ' чипов'); return; }
    currentUser.credits -= cost;
    currentUser.resources.steel -= steel;
    currentUser.resources.chips -= chips;
    currentUser.buildQueue.push({ kind: 'med', id: 'medmodule', name: 'Медицинский модуль', minutes: 25, endsAt: Date.now() + 25 * 60000 });
    saveUser(); renderDock(); updateCredits();
};

// Покупка готового: дороже, но сразу.
window.buyMedical = () => {
    ensureFleet(currentUser);
    const price = 600000;
    if (currentUser.credits < price) { notify('Нужно ' + price.toLocaleString() + ' кр'); return; }
    currentUser.credits -= price;
    currentUser.medModules = (currentUser.medModules || 0) + 1;
    saveUser(); updateCredits();
    notify('Медицинский модуль куплен: всего ' + currentUser.medModules);
};

window.buildHabitat = () => {
    ensureFleet(currentUser);
    if (currentUser.buildQueue.length >= MAX_PARALLEL_BUILDS) { notify('Все верфи заняты: ' + MAX_PARALLEL_BUILDS + ' строек'); return; }
    const cost = 40000, steel = 120;
    if (currentUser.credits < cost) { notify('Нужно ' + cost.toLocaleString() + ' кр'); return; }
    if ((currentUser.resources.steel || 0) < steel) { notify('Нужно ' + steel + ' т стали'); return; }
    currentUser.credits -= cost;
    currentUser.resources.steel -= steel;
    currentUser.buildQueue.push({ kind: 'habitat', id: 'habitat', name: 'Жилой массив', minutes: 12, endsAt: Date.now() + 12 * 60000 });
    saveUser(); renderDock(); updateCredits();
};

window.buildFactory = (fid) => {
    ensureFleet(currentUser);
    const f = FACTORIES[fid];
    const lvl = currentUser.factories[fid] || 0;
    if (lvl >= 3) return;
    const price = f.cost * (lvl + 1);
    if ((currentUser.buildQueue || []).length >= MAX_PARALLEL_BUILDS) { notify('Все верфи заняты: ' + MAX_PARALLEL_BUILDS + ' строек одновременно'); return; }
    const RARE_HULLS = ['plasma_lancer', 'grav_frigate', 'grav_colossus'];
    if (RARE_HULLS.includes(shipId) && !(currentUser.blueprints || {})[shipId]) {
        notify('Нужен чертёж «' + s.name + '» — ищите на чёрном рынке');
        return;
    }
    if (currentUser.credits < price) { notify('Нужно ' + price.toLocaleString() + ' кр'); return; }
    const steelNeed = levelSteel(f.steel, lvl);
    if ((currentUser.resources.steel || 0) < steelNeed) { notify('Нужно ' + steelNeed + ' т стали'); return; }
    // рабочая сила: андроиды должны покрывать все уровни фабрик
    const need = (lvl + 1) * ANDROIDS_PER_LEVEL;
    const have = currentUser.resources.androids || 0;
    if (have < need) { notify('Нужно ' + need + ' андроидов на смене, есть ' + have); return; }
    currentUser.credits -= price;
    currentUser.resources.steel -= steelNeed;
    const fmin = levelTime(FACTORY_BUILD_MIN + lvl, lvl);
    currentUser.buildQueue.push({ kind: 'factory', id: fid, name: f.name, endsAt: Date.now() + fmin * 60000, minutes: fmin });
    saveUser(); renderDock(); updateCredits();
};

// Завершение строек: раз в кадр проверяем, не истекло ли время.
function tickBuilds() {
    if (!currentUser || !Array.isArray(currentUser.buildQueue) || !currentUser.buildQueue.length) return;
    const now = Date.now();
    let changed = false;
    for (let i = currentUser.buildQueue.length - 1; i >= 0; i--) {
        const q = currentUser.buildQueue[i];
        if (now < q.endsAt) continue;
        if (q.kind === 'ship') {
            currentUser.ships.push({ id: q.id, builtAt: now });
            // корабль готов — только теперь квест «Первая сделка» переходит к закупке
            if (currentUser.quests && (currentUser.quests.trade || 0) === 0) currentUser.quests.trade = 1;
        } else if (q.kind === 'plant') {
            currentUser.plants = currentUser.plants || {};
            currentUser.plants[q.id] = (currentUser.plants[q.id] || 0) + 1;
            notify(q.name + ' построена, уровень ' + currentUser.plants[q.id]);
        } else if (q.kind === 'cloner') {
            currentUser.cloners = (currentUser.cloners || 0) + 1;
            notify('Комплекс клонирования готов: всего ' + currentUser.cloners);
        } else if (q.kind === 'med') {
            currentUser.medModules = (currentUser.medModules || 0) + 1;
            notify('Медицинский модуль готов: всего ' + currentUser.medModules);
        } else if (q.kind === 'habitat') {
            currentUser.habitatsBuilt = (currentUser.habitatsBuilt || 0) + 1;
            const target = 263;   // норма Земли при 50 млн на массив
            const pct = Math.floor(currentUser.habitatsBuilt / target * 100);
            const prev = Math.floor((currentUser.habitatsBuilt - 1) / target * 100);
            if (pct >= prev + 10) {
                const bonus = 50000;
                currentUser.credits += bonus;
                notify(`Застроено ${pct}% планеты — премия ${bonus.toLocaleString()} кр`);
            } else {
                notify('Жилой массив готов: ' + currentUser.habitatsBuilt + ' из ' + target);
            }
        } else {
            currentUser.factories[q.id] = (currentUser.factories[q.id] || 0) + 1;
        }
        currentUser.buildQueue.splice(i, 1);
        changed = true;
    }
    if (changed) { saveUser(); if (document.getElementById('fleet-modal').style.display === 'flex') renderDock(); }
}

// =========================================================
// БОЙ НА МАРШРУТАХ
// =========================================================
// Пират перехватывает торговца: силы сравниваются, торговец отстреливается,
// при тяжёлых повреждениях его тащит буксир в док на ремонт.
let combatAccum = 0;

// Обломки: после гибели корабля в космосе остаётся до 40 % массы корпуса.
// Собрать их может любой, у кого есть добытчики, — это сталь, медь и чипы.
const WRECKS = [];
function addWreck(owner, mass) {
    WRECKS.push({ owner: owner, mass: mass, at: Date.now() });
}

function npcForce(n) { return n.ships * 3 + (n.kind === 'pirate' ? 4 : 0); }

// Экономика пирата: доход с налётов идёт на новые корабли, а неудачные
// бои стоят ему борта. Иначе он либо растёт бесконечно, либо вымирает.
const PIRATE_SHIP_COST = 65000;
let pirateEconAccum = 0;

function tickPirateEconomy(dtMs) {
    if (typeof NPC_AGENTS === 'undefined') return;
    pirateEconAccum += dtMs;
    if (pirateEconAccum < 30000) return;
    pirateEconAccum -= 30000;

    NPC_AGENTS.filter(n => n.kind === 'pirate').forEach(p => {
        // трофеи уже начислены в tickCombat; здесь — расходы и потери
        const upkeep = p.ships * 800;                  // содержание борта
        const repair = Math.round((p.damage || 0) * 40);   // ремонт по повреждениям
        p.credits = Math.max(0, p.credits - upkeep - repair);
        if (repair > 0) {
            p.damage = Math.max(0, (p.damage || 0) - 25);
        }

        // каждый следующий борт дороже: флот растёт всё медленнее
        const shipCost = Math.round(PIRATE_SHIP_COST * (1 + 0.25 * (p.ships - 2)));
        if (p.credits >= shipCost && p.ships < 8) {
            p.credits -= shipCost;
            p.ships += 1;
            npcLog(`${p.name} построил новый корабль (флот ${p.ships})`);
        } else if (p.credits < 15000 && p.ships > 1 && Math.random() < 0.25) {
            p.ships -= 1;
            npcLog(`${p.name} потерял корабль: не хватило на ремонт`);
        }
        p.wealth = p.credits + p.stock * 18 + p.ships * 30000 + p.miners * 20000 + p.buildings * 50000;
    });
}

function tickCombat(dtMs) {
    combatAccum += dtMs;
    if (combatAccum < 20000) return;
    combatAccum -= 20000;

    const pirates = NPC_AGENTS.filter(n => n.kind === 'pirate');
    const traders = NPC_AGENTS.filter(n => n.kind !== 'pirate' && (n.state || 'ok') === 'ok');
    if (!pirates.length || !traders.length) return;

    const p = pirates[Math.floor(Math.random() * pirates.length)];
    // цель — самый жирный груз
    const target = traders.sort((a, b) => b.stock - a.stock)[0];

    if (npcForce(p) > npcForce(target) * 1.1) {
        const loot = Math.round(target.stock * (0.12 + Math.random() * 0.10));
        target.stock -= loot;
        p.stock += loot;
        // торговец успевает ответить
        target.damage = (target.damage || 0) + 20 + Math.round(Math.random() * 20);
        p.damage = (p.damage || 0) + 5 + Math.round(Math.random() * 10);
        npcLog(`${p.name} перехватил ${target.name}: груз ${loot.toLocaleString()}, повреждения ${target.damage}%`);

        if (target.damage >= 60) {
            target.state = 'tug';
            target.tugEndsAt = Date.now() + 45000;
            npcLog(`${target.name}: корпус ${target.damage}%, вызван буксир`);
        }
    } else {
        p.damage = (p.damage || 0) + 25;
        if (Math.random() < 0.55 && p.ships > 1) {
            p.ships -= 1;
            // ремонт и восстановление дороже любого трофея
            const repairBill = 140000;
            p.credits = Math.max(0, p.credits - repairBill);
            npcLog(`${p.name} потерял корабль в бою с ${target.name} (ремонт ${repairBill.toLocaleString()} кр)`);
        } else {
            npcLog(`${p.name} получил отпор от ${target.name}`);
        }
        if (p.damage >= 100) {
            p.damage = 0;
            p.ships = Math.max(1, p.ships - 1);
            addWreck(p.name, 60 + Math.round(Math.random() * 40));
            npcLog(`${p.name} потерял корабль — обломки остались в космосе`);
        }
    }

    // сбор обломков: у кого есть добытчики, тот и подбирает
    if (WRECKS.length) {
        const salvager = NPC_AGENTS.filter(n => n.kind !== 'pirate' && n.miners > 0)
            .sort((a, b) => b.miners - a.miners)[0];
        if (salvager) {
            const w = WRECKS.shift();
            const got = Math.round(w.mass * 0.25);
            salvager.stock += got;
            salvager.credits += Math.round(got * 4);
            npcLog(`${salvager.name} собрал обломки ${w.owner}: ${got} т сырья`);
        }
    }

    // буксировка: 45 секунд, потом ремонт в доке
    NPC_AGENTS.forEach(n => {
        if (n.state === 'tug' && Date.now() >= (n.tugEndsAt || 0)) {
            const cost = 8000;
            n.credits = Math.max(0, n.credits - cost);
            n.damage = 0;
            n.state = 'ok';
            npcLog(`${n.name} отремонтирован в доке за ${cost.toLocaleString()} кр`);
        }
    });
}

// =========================================================
// КОАЛИЦИЯ ТОРГОВЦЕВ
// =========================================================
// Если пират ограбил торговцев больше чем на 25 % их общего оборота —
// они скидываются и нанимают боевой флот: база уничтожается, остатки в салваж.
function checkCoalition() {
    const traders = NPC_AGENTS.filter(n => n.kind !== 'pirate');
    const turnover = traders.reduce((s, n) => s + n.wealth, 0);
    if (turnover <= 0) return;

    NPC_AGENTS.filter(n => n.kind === 'pirate').forEach(p => {
        const naughty = p.looted || 0;
        const share = naughty / turnover;
        if (share > 0.25) {
            const lost = p.buildings + p.ships;
            p.buildings = 0;
            p.ships = 1;
            p.stock = 0;
            p.looted = 0;
            p.damage = 0;
            p.state = 'ok';
            addWreck(p.name, 120 + Math.round(Math.random() * 80));
            npcLog(`Коалиция наняла флот: база ${p.name} уничтожена (${lost} объектов)`);
        }
    });
}

// Тик производства: раз в f.every секунд реального времени фабрика выдаёт партию.
function tickFactories(dtMs) {
    if (!currentUser) return;
    ensureFleet(currentUser);
    currentUser.factoryClock = (currentUser.factoryClock || 0) + dtMs;
    let changed = false;
    Object.keys(FACTORIES).forEach(fid => {
        const lvl = currentUser.factories[fid] || 0;
        if (!lvl) return;
        const f = FACTORIES[fid];
        while (currentUser.factoryClock >= f.every * 1000) {
            let amount = f.per * lvl;
            if (f.out === 'androids') amount *= 1 + 0.1 * researchLevel('exo');
            if (f.out === 'chips') {
                amount *= 1 + 0.1 * researchLevel('robotics') + 0.08 * researchLevel('crystallics');
                // редкозёмы нужны для чипов: нет их — выпуск падает
                const rareHave = currentUser.resources.rare || 0;
                if (rareHave >= 2) {
                    currentUser.resources.rare -= 2;
                } else {
                    amount *= 0.4;
                    if (!currentUser.__rareWarned) {
                        currentUser.__rareWarned = true;
                        notify('Нет редкозёмов: чипы выпускаются на 40 %');
                    }
                }
            }
            currentUser.resources[f.out] = (currentUser.resources[f.out] || 0) + Math.round(amount);
            currentUser.factoryClock -= f.every * 1000;
            changed = true;
        }
    });
    if (changed) saveUser();
}

window.scrollToShop = () => { const el = document.getElementById('ship-shop'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); };

window.buyShip = (shipId) => {
    ensureFleet(currentUser);
    const s = SHIPS[shipId];
    if (currentUser.ships.length + currentUser.buildQueue.filter(q => q.kind === 'ship').length >= currentUser.dockSlots) {
        notify('Все места в доке заняты, включая строящиеся'); return;
    }
    if (currentUser.credits < s.price) { notify('Не хватает кредитов: нужно ' + s.price.toLocaleString()); return; }
    const missing = [];
    Object.keys(s.parts || {}).forEach(k => { const need = s.parts[k]; if ((currentUser.resources[k] || 0) < need) missing.push((RESOURCES[k] ? RESOURCES[k].name : k) + ': ' + need); });
    if (missing.length) { notify('Не хватает комплектующих:\n' + missing.join('\n')); return; }
    currentUser.credits -= s.price;
    Object.keys(s.parts || {}).forEach(k => { currentUser.resources[k] = (currentUser.resources[k] || 0) - s.parts[k]; });
    const minutes = Math.max(1, Math.round((SHIP_BUILD_MIN[shipId] || 5) * (1 - 0.03 * researchLevel('precision') - 0.02 * researchLevel('biomat'))));
    currentUser.buildQueue.push({ kind: 'ship', id: shipId, name: s.name, endsAt: Date.now() + minutes * 60000, minutes: minutes });
    saveUser(); renderDock(); updateCredits();
};

// Кнопка разведки недоступна без разведчика в доке
function updateSurveyButtons() {
    try {
        const hasScout = !!(currentUser && (currentUser.ships || []).some(s2 => s2 && s2.id === 'jet_scout'));
        document.querySelectorAll('[data-needs-scout]').forEach(b => {
            b.disabled = !hasScout;
            b.style.opacity = hasScout ? '' : '0.45';
            b.title = hasScout ? '' : 'Нужен разведчик в доке';
        });
    } catch (e) { }
}
window.updateSurveyButtons = updateSurveyButtons;

window.surveyAsteroids = () => {
    ensureFleet(currentUser);
    const scout = currentUser.ships.find(s => s.id === 'jet_scout');
    if (!scout) { notify('Нужен разведчик в доке'); return; }
    if (currentUser.credits < 3000) { notify('Разведка стоит 3 000 кр'); return; }
    currentUser.credits -= 3000;
    const found = Math.random() < (0.25 + 0.05 * researchLevel('acoustics'));
    if (found) {
        const silver = 20 + Math.round(Math.random() * 40);
        const gold = 5 + Math.round(Math.random() * 15);
        currentUser.resources.silver = (currentUser.resources.silver || 0) + silver;
        currentUser.resources.gold = (currentUser.resources.gold || 0) + gold;
        notify(`Найден малый астероид: ${silver} кг серебра, ${gold} кг золота`);
    } else {
        notify('Разведка пустая: только обычные кондриты');
    }
    saveUser(); renderDock(); updateCredits();
};

window.sellShip = (index) => {
    const ship = currentUser.ships[index];
    if (!ship) return;
    const back = Math.round(SHIPS[ship.id].price * 0.6);
    if (!confirm('Продать ' + shipName(ship.id) + ' за ' + back.toLocaleString() + ' кр?')) return;
    currentUser.credits += back;
    currentUser.ships.splice(index, 1);
    saveUser(); renderDock(); updateCredits();
};

window.rentDockSlot = () => {
    // аренду считает сервер: цена растёт с каждым местом
    var token = '';
    try { token = localStorage.getItem('galaktika_token') || ''; } catch (e) { token = ''; }
    if (!token) { notify('Войдите в игру'); return; }
    fetch('/api/rent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Auth-Token': token },
        body: JSON.stringify({ what: 'dock' })
    }).then(function (r) { return r.json().catch(function () { return {}; }); }).then(function (res) {
        if (res.error) { notify(res.error); return; }
        currentUser.credits = res.credits;
        currentUser.dockSlots = res.dockSlots;
        saveUser(); renderDock(); updateCredits();
        notify('Арендовано место в доке: всего ' + res.dockSlots);
    }).catch(function () { notify('Сервер недоступен'); });
};

// аренда ремонтной мастерской — тоже на сервере
window.rentWorkshop = () => {
    var token = '';
    try { token = localStorage.getItem('galaktika_token') || ''; } catch (e) { token = ''; }
    if (!token) { notify('Войдите в игру'); return; }
    fetch('/api/rent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Auth-Token': token },
        body: JSON.stringify({ what: 'workshop' })
    }).then(function (r) { return r.json().catch(function () { return {}; }); }).then(function (res) {
        if (res.error) { notify(res.error); return; }
        currentUser.credits = res.credits;
        currentUser.workshops = res.workshops;
        saveUser(); renderDock(); updateCredits();
        notify('Арендована мастерская: всего ' + res.workshops);
    }).catch(function () { notify('Сервер недоступен'); });
};

function updateCredits() {
    const el = document.getElementById('user-credits');
    if (el && currentUser) el.textContent = Math.round(currentUser.credits).toLocaleString('ru-RU') + ' кр';
}

// === КВЕСТЫ ===
// Три цепочки. Прогресс хранится в user.quests[id] — номер текущего шага.
const QUESTS = [
    {
        id: 'trade', title: 'Первая сделка',
        desc: 'Молодому капитану дали одно место в доке. Купите корабль, слетайте за кварцем и продайте его на Марсе.',
        steps: [
            { key: 'ship', text: 'Купить корабль в доке', hint: 'любой корабль из верфи' },
            { key: 'buy', text: 'Отправить корабль за кварцем', hint: 'стоимость партии 4 000 кр' },
            { key: 'sell', text: 'Продать кварц на Марсе', hint: 'выручка 11 000 кр' }
        ],
        buyCost: 4000, sellGain: 11000
    },
    {
        id: 'ice', title: 'Лёд и вода',
        desc: 'Станция на орбите просит льда: лифт поднимет груз наверх, очистка даст питьевую воду.',
        steps: [
            { key: 'ice', text: 'Купить 20 т орбитального льда', hint: '3 кр за тонну · 60 кр' },
            { key: 'clean', text: 'Очистить лёд на станции', hint: 'нужен завод оборудования ур. 1' },
            { key: 'sell', text: 'Продать 18 т воды колонии', hint: 'выручка 9 000 кр' }
        ],
        iceCost: 60, iceAmount: 20, waterAmount: 18, sellGain: 9000
    },
    {
        id: 'yard', title: 'Контракт верфи',
        desc: 'Верфь просит чипы: без них не собрать ни один корпус. Нужен второй корабль и завод.',
        steps: [
            { key: 'chips', text: 'Сдать 30 чипов на верфь', hint: 'производит завод оборудования' },
            { key: 'steel', text: 'Довезти 200 т стали', hint: 'покупается на бирже' },
            { key: 'done', text: 'Подписать контракт', hint: 'награда — место в доке' }
        ],
        chipNeed: 30, steelNeed: 200, reward: 40000
    },
    {
        id: 'delivery_steel', title: 'Сталь на Фобос',
        desc: 'Марсианской верфи нужна сталь: возьмите партию на Луне и довезите до Фобоса.',
        steps: [
            { key: 'take', text: 'Взять 50 т стали на Луне', hint: '18 000 кр задаток' },
            { key: 'deliver', text: 'Довезти груз на Фобос', hint: 'награда 30 000 кр' }
        ], cost: 18000, gain: 30000
    },
    {
        id: 'delivery_water', title: 'Вода в Пояс',
        desc: 'Шахтёрам Цереры не хватает воды. Партия опечатана, нужно только доставить.',
        steps: [
            { key: 'take', text: 'Принять груз воды', hint: '9 000 кр задаток' },
            { key: 'deliver', text: 'Доставить на Цереру', hint: 'награда 17 000 кр' }
        ], cost: 9000, gain: 17000
    },
    {
        id: 'delivery_chips', title: 'Чипы для Ганимеда',
        desc: 'Станция на Ганимеде просит электронику: 30 чипов, срок — сутки.',
        steps: [
            { key: 'take', text: 'Купить 30 чипов', hint: '15 000 кр задаток' },
            { key: 'deliver', text: 'Отвезти на Ганимед', hint: 'награда 29 000 кр' }
        ], cost: 15000, gain: 29000
    },
    {
        id: 'patrol', title: 'Патруль',
        desc: 'Корабль коалиции просит подкрепление: патрулирование маршрута и зачистка пирата.',
        steps: [
            { key: 'patrol', text: 'Выйти на патрулирование', hint: 'нужен боевой борт' },
            { key: 'deliver', text: 'Вернуться с докладом', hint: 'награда 20 000 кр' }
        ], cost: 0, gain: 20000
    },
    {
        id: 'escort', title: 'Сопровождение груза',
        desc: 'Ценный груз идёт до Титана. Вероятность атаки — 80 %. Нужен борт с оружием.',
        steps: [
            { key: 'escort', text: 'Взять груз под охрану', hint: 'риск атаки 80 %' },
            { key: 'deliver', text: 'Довести груз до Титана', hint: 'награда 35 000 кр' }
        ], cost: 0, gain: 35000
    }
];

// Сила боевого кулака: суммарный корпус и щит боевых кораблей.
// Пиратский «Клык» силён на 90–160, поэтому квест открывается только когда
// у игрока хватает силы гарантированно победить одиночное судно.
const PIRATE_MAX_POWER = 160;
const COMBAT_IDS = ['plasma_interceptor', 'plasma_lancer', 'grav_frigate', 'grav_colossus'];

function combatForce() {
    if (!currentUser || !Array.isArray(currentUser.ships)) return 0;
    return currentUser.ships
        .filter(s => COMBAT_IDS.includes(s.id))
        .reduce((sum, s) => {
            const base = SHIPS[s.id].hull + SHIPS[s.id].shield;
            // мастерские: каждый уровень модернизации даёт +12% к силе корабля
            const upgrade = 1 + 0.12 * (s.level || 0);
            const withArtifact = s.artifact && s.artifact.mult ? base * s.artifact.mult : base;
            return sum + withArtifact * upgrade;
        }, 0);
}

function pirateQuestUnlocked() { return combatForce() >= PIRATE_MAX_POWER; }

function questStep(id) { return (currentUser.quests && currentUser.quests[id]) || 0; }

function questAction(q) {
    const step = questStep(q.id);
    if (step >= q.steps.length) return '<span class="quest-done">выполнено</span>';
    const key = q.steps[step].key;
    return `<button class="auth-btn" style="width:auto;padding:8px 15px;margin:0" onclick="questAct('${q.id}','${key}')">${
        key === 'ship' ? 'Открыть док' : key === 'done' ? 'Подписать' : 'Выполнить'}</button>`;
}

window.openQuests = () => { if (!currentUser) return; document.getElementById('quest-modal').style.display = 'flex'; renderQuest(); };
window.closeQuests = () => { document.getElementById('quest-modal').style.display = 'none'; };

function renderQuest() {
    ensureFleet(currentUser);
    const body = document.getElementById('quest-body');
    if (!body) return;
    body.innerHTML = QUESTS.map(q => {
        if (q.id === 'pirate' && !pirateQuestUnlocked()) {
            const f = combatForce();
            return `<div class="quest-chain locked">
                <div class="quest-header"><h3>${q.title} 🔒</h3>
                <p>${q.desc}</p>
                <p class="quest-lock">Откроется, когда боевой кулак даст ${PIRATE_MAX_POWER} единиц силы. Сейчас: ${f}.</p></div>
            </div>`;
        }
        const step = questStep(q.id);
        return `<div class="quest-chain">
            <div class="quest-header"><h3>${q.title}</h3><p>${q.desc}</p></div>
            <div class="quest-steps">${q.steps.map((s, i) => {
                const done = step > i, active = step === i;
                return `<div class="quest-step ${done ? 'completed' : (active ? 'active' : '')}">
                    <div class="step-num">${done ? '✓' : i + 1}</div>
                    <div class="step-info"><b>${s.text}</b><div class="step-cost">${s.hint}</div></div>
                    ${active ? questAction(q) : ''}</div>`;
            }).join('')}</div>
            ${step >= q.steps.length ? '<div class="quest-reward"><b>Цель достигнута</b></div>' : ''}
        </div>`;
    }).join('');
}

window.questAct = (id, key) => {
    ensureFleet(currentUser);
    const q = QUESTS.find(x => x.id === id);
    if (!q) return;
    const step = questStep(id);
    const need = q.steps[step];

    if (key === 'ship') { window.openFleet(); return; }
    if (key !== need.key) return;

    if (key === 'buy') {
        if (!currentUser.ships.length) { notify('Сначала купите корабль в доке'); return; }
        if (currentUser.credits < q.buyCost) { notify('Не хватает кредитов на партию'); return; }
        currentUser.credits -= q.buyCost;
    }
    if (key === 'sell') { currentUser.credits += q.sellGain; currentUser.resources.quartz = (currentUser.resources.quartz || 0) + 200; }
    if (key === 'ice') {
        if (currentUser.credits < q.iceCost) { notify('Не хватает кредитов'); return; }
        currentUser.credits -= q.iceCost;
        currentUser.resources.ice = (currentUser.resources.ice || 0) + q.iceAmount;
    }
    if (key === 'clean') {
        if (!currentUser.factories.equipment) { notify('Нужен завод оборудования ур. 1'); return; }
        currentUser.resources.ice = Math.max(0, (currentUser.resources.ice || 0) - q.iceAmount);
        currentUser.resources.water = (currentUser.resources.water || 0) + q.waterAmount;
    }
    if (key === 'chips') {
        if ((currentUser.resources.chips || 0) < q.chipNeed) { notify('Нужно ' + q.chipNeed + ' чипов на складе'); return; }
        currentUser.resources.chips -= q.chipNeed;
    }
    if (key === 'steel') {
        if ((currentUser.resources.steel || 0) < q.steelNeed) { notify('Нужно ' + q.steelNeed + ' т стали'); return; }
        currentUser.resources.steel -= q.steelNeed;
    }
    if (key === 'done') { currentUser.credits += q.reward; currentUser.dockSlots += 1; }

    // --- торговые, патруль и сопровождение ---
    if (key === 'take') {
        if (currentUser.credits < (q.cost || 0)) { notify('Нужно ' + (q.cost || 0).toLocaleString() + ' кр'); return; }
        currentUser.credits -= (q.cost || 0);
    }
    if (key === 'patrol') {
        if (!(currentUser.ships || []).some(s => COMBAT_IDS.includes(s.id))) { notify('Нужен боевой корабль'); return; }
        notify('Патруль начат');
        window.openFlight();
    }
    if (key === 'escort') {
        if (!(currentUser.ships || []).some(s => COMBAT_IDS.includes(s.id))) { notify('Нужен борт с оружием'); return; }
        notify(Math.random() < 0.8 ? 'Атака! Пираты вышли на груз' : 'Переход прошёл спокойно');
        window.openFlight();
    }
    if (key === 'deliver') {
        currentUser.credits += (q.gain || 0);
        notify('Доставлено: +' + (q.gain || 0).toLocaleString() + ' кр');
    }

    // --- охота на пирата ---
    if (key === 'scan') {
        if (!pirateQuestUnlocked()) { notify('Нужен борт силой ' + PIRATE_MAX_POWER); return; }
        if (currentUser.credits < q.scanCost) { notify('Разведка стоит ' + q.scanCost.toLocaleString() + ' кр'); return; }
        currentUser.credits -= q.scanCost;
        if (Math.random() < 0.6) { notify('След найден: пиратский «Клык» держится у Пояса'); }
        else { notify('След остыл — попробуйте ещё раз'); saveUser(); renderQuest(); return; }
    }
    if (key === 'board') {
        const combatShips = ['plasma_interceptor', 'plasma_lancer', 'grav_frigate', 'grav_colossus'];
        const mine = currentUser.ships.filter(s => combatShips.includes(s.id));
        if (!mine.length) { notify('Нужен боевой корабль: перехватчик, ланцет, фрегат или линкор'); return; }
        const force = mine.reduce((sum, s) => sum + (SHIPS[s.id].hull + SHIPS[s.id].shield), 0);
        const pirateForce = 90 + Math.round(Math.random() * 70);
        if (force >= pirateForce) {
            notify('Абордаж удался: команда пирата сдалась');
        } else {
            const repairCost = Math.round(8000 * (1 - 0.15 * researchLevel('medicine')));
            currentUser.credits = Math.max(0, currentUser.credits - repairCost);
            notify('Абордаж провалился, ремонт обошёлся в ' + repairCost.toLocaleString() + ' кр');
            saveUser(); renderQuest(); updateCredits(); return;
        }
    }
    if (key === 'loot') {
        const credits = 18000 + Math.round(Math.random() * 22000);
        const gold = 6 + Math.round(Math.random() * 14);
        currentUser.credits += credits;
        currentUser.resources.gold = (currentUser.resources.gold || 0) + gold;
        notify(`Трюм пирата вскрыт: ${credits.toLocaleString()} кр и ${gold} кг золота`);
    }

    currentUser.quests[id] = step + 1;
    saveUser(); renderQuest(); updateCredits();
};


// === ВРЕМЯ НА ЭКРАНЕ ===
// При ускорении «часы» прыгали на 6 часов каждые 250 мс — выглядело как дребезг.
// Теперь точное время показывается только при медленной симуляции, а при быстрой
// на его месте стоит постоянная подпись скорости (она не меняется от кадра к кадру).
let lastClockUpdate = 0;
let lastClockText = '', lastDateText = '';

function formatSpeed(ts) {
    const a = Math.abs(ts);
    if (a < 2) return 'реальное время';
    if (a < 60) return Math.round(a) + ' сек/с';        // реальное время
    if (a < 3600) return Math.round(a / 60) + ' мин/с';
    if (a < 86400) { const v = a / 3600; return (v < 10 ? v.toFixed(1).replace('.0', '') : Math.round(v)) + ' ч/с'; }
    if (a < 31557600) { const v = a / 86400; return (v < 10 ? v.toFixed(1).replace('.0', '') : Math.round(v)) + ' сут/с'; }
    const y = a / 31557600;
    return (y < 10 ? y.toFixed(1).replace('.0', '') : Math.round(y)) + ' г/с';
}

function updateSimClock(nowMs) {
    if (nowMs - lastClockUpdate < 200) return;
    lastClockUpdate = nowMs;

    const simDate = new Date(simulatedTime);
    const dateEl = document.getElementById('live-date');
    const timeEl = document.getElementById('live-time');

    if (dateEl) {
        const text = simDate.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
        if (text !== lastDateText) { dateEl.textContent = text; lastDateText = text; }
        if (!dateEl.title) dateEl.title = 'Игровое время: текущая дата + ' + GAME_YEAR_OFFSET + ' лет';
    }
    if (timeEl) {
        // Быстрее минуты в секунду часы нечитаемы — показываем множитель времени.
        const text = Math.abs(timeScale) < 60 ? simDate.toLocaleTimeString('ru-RU') : formatSpeed(timeScale);
        if (text !== lastClockText) { timeEl.textContent = text; lastClockText = text; }
    }
}

// === ОСНОВНОЙ ЦИКЛ АНИМАЦИИ (JS) ===
// Сцена разбирается один раз: querySelectorAll/parseFloat/clientWidth в каждом кадре
// — это лишние обходы DOM и вызовы layout на ровном месте.
let planetNodes = [];
let moonNodes = [];
let sceneReady = false;
let trafficNodes = [];
let routeLines = [];
let routePaths = [];
let solarVisible = false;

function buildStamp() {
    const stamp = document.createElement('div');
    stamp.className = 'build-stamp';
    stamp.textContent = 'модель 624 · ' + currentSystem.name + (DEV_MODE ? ' · отладка' : '');
    document.body.appendChild(stamp);
}

function refreshSolarVisibility() {
    const el = document.querySelector('.solar-system-container');
    solarVisible = !!el && getComputedStyle(el).visibility !== 'hidden';
}

function buildSceneCache() {
    planetNodes = Array.from(document.querySelectorAll('.orbit')).map(el => {
        const planet = el.querySelector('.planet');
        return {
            wrapper: el.querySelector('.planet-wrapper'),
            planet,
            period: parseFloat(el.dataset.period),
            epoch: parseFloat(el.dataset.epoch),
            radius: el.clientWidth / 2,
            surface: planet ? planet.querySelector('.planet-surface') : null,
            shadow: planet ? planet.querySelector('.planet-shadow') : null,
            lights: planet ? planet.querySelector('.planet-lights') : null,
            rotPeriodHours: planet ? parseFloat(planet.dataset.rotPeriod) : NaN,
            surfaceWidth: 0,
            size: planet ? (parseFloat(planet.style.width) || 0) : 0,
            x: undefined,
            y: undefined,
            lastShadowAngle: NaN,
            lastBgOffset: NaN
        };
    }).filter(n => n.wrapper && !isNaN(n.period) && !isNaN(n.epoch) && n.radius > 0);

    // Ширина текстуры нужна для пиксельного сдвига: читаем один раз, а не 60 раз в секунду.
    planetNodes.forEach(n => { n.surfaceWidth = n.surface ? n.surface.clientWidth : 0; });

    const shadowsByPlanet = new Map();
    planetNodes.forEach(n => { if (n.planet) shadowsByPlanet.set(n.planet, n.shadow); });

    // ЛУННЫЕ БАЗЫ: по легенде все луны заселены. Фракция выбирается
    // «жребием» — детерминированно по имени луны, чтобы не менялась при перезагрузке.
    const BASE_FACTIONS = [
        { id: 'earth',    name: 'Земляне',      color: '#7fd6ff' },
        { id: 'asteroid', name: 'Астровитяне',  color: '#ffd166' },
        { id: 'mars',     name: 'Марсиане',     color: '#ff8a65' }
    ];
    function factionFor(name) {
        let h = 0;
        for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 100000;
        return BASE_FACTIONS[h % BASE_FACTIONS.length];
    }
    window.__moonFaction = factionFor;

    moonNodes = Array.from(document.querySelectorAll('.moon-orbit')).map(el => {
        const moon = el.querySelector('.moon');
        const host = el.closest('.planet');
        // радиус берём из clientWidth, а если слой не разложен (0) — из inline-стиля
        const rPx = (el.clientWidth || parseFloat(el.style.width) || 60) / 2;
        return {
            moon,
            period: moon ? parseFloat(moon.dataset.period) : NaN,
            epoch: moon ? parseFloat(moon.dataset.epoch) : NaN,
            radius: rPx,
            shadow: moon ? moon.querySelector('.moon-shadow') : null,
            hostShadow: host ? (shadowsByPlanet.get(host) || null) : null,
            lastShadowBg: null
        };
    }).filter(n => n.moon && !isNaN(n.period) && !isNaN(n.epoch) && n.radius > 0);

    // раскрашиваем луны по фракции и подписываем базу
    try {
        moonNodes.forEach(n => {
            const el = n.moon;
            if (!el) return;
            const nm = el.getAttribute('data-moon') || '';
            const f = factionFor(nm);
            el.dataset.base = f.id;
            el.style.boxShadow = '0 0 0 1.5px ' + f.color + ', 0 0 10px ' + f.color + '80';
            // Луна и Фобос — космопорты: низкая гравитация, нет атмосферы
            const isSpaceport = (nm === 'Луна' || nm === 'Фобос');
            if (isSpaceport) {
                el.dataset.spaceport = '1';
                el.classList.add('spaceport-moon');
                el.title = nm + ' · космопорт · база: ' + f.name;
            } else {
                el.title = nm + ' · база: ' + f.name;
            }
            n.faction = f;
        });
    } catch (e) { }

    window.__moonDbg = moonNodes.map(n => ({
        name: (n.moon && n.moon.getAttribute('data-moon')) || '?',
        period: n.period, radius: +n.radius.toFixed(1)
    }));
    trafficNodes = Array.from(document.querySelectorAll('.ship-marker--traffic'));
    routeLines = Array.from(document.querySelectorAll('.route-line'));
    routePaths = Array.from(document.querySelectorAll('.traffic-path'));
    sceneReady = planetNodes.length > 0;

    // гражданские борта двигаются вместе с планетами
    if (civilItems.length) updateCivilTraffic();
}

function updatePlanetShadow(node, angleDeg) {
    // Градиент пересобираем только когда планета заметно повернулась, иначе
    // 60 раз в секунду переписывается одна и та же строка стиля.
    let delta = Math.abs(angleDeg - node.lastShadowAngle);
    if (delta > 180) delta = 360 - delta;
    if (delta < 0.25) return;
    const rad = angleDeg * Math.PI / 180;
    const lx = 50 - Math.cos(rad) * 50;
    const ly = 50 - Math.sin(rad) * 50;
    if (node.shadow) node.shadow.style.background = `radial-gradient(circle at ${lx.toFixed(2)}% ${ly.toFixed(2)}%, transparent 10%, rgba(0,0,0,0.9) 75%)`
    // огни городов видны только на теневой стороне — маска повторяет направление света
    if (node.lights) {
        node.lights.style.setProperty('--lx', lx.toFixed(2) + '%');
        node.lights.style.setProperty('--ly', ly.toFixed(2) + '%');
    };
    node.lastShadowAngle = angleDeg;
}

function calculateAngles(currentDays) {
    if (!sceneReady) return;

    // --- ПЛАНЕТЫ ---
    for (let i = 0; i < planetNodes.length; i++) {
        const n = planetNodes[i];
        // Если загружен модуль флотов — берём настоящую кеплерову орбиту:
        // радиус зависит от угла, поэтому путь получается эллиптическим.
        let angle, px, py;
        // id планеты может лежать в data-атрибуте, а не в n.data
        const body = (n.data && n.data.id) ||
            (n.planet && n.planet.getAttribute && n.planet.getAttribute('data-planet-id')) ||
            (n.wrapper && n.wrapper.getAttribute && n.wrapper.getAttribute('data-planet-id')) || null;
        // Единая система координат: если модуль загружен, позиция берётся ТОЛЬКО
        // из WorldCoords. Тогда планета, пояс, трассы и корабли считаются в одной
        // системе, и рассинхрона «борт не на линии» не возникает.
        const wc = (window.WorldCoords && body) ? window.WorldCoords.planetAt(body, simulatedTime) : null;
        if (wc) {
            angle = wc.angleDeg;
            px = wc.x;
            py = wc.y;
            n.x = px; n.y = py;
            n.wrapper.style.transform = `translate(${px.toFixed(2)}px, ${py.toFixed(2)}px)`;
            updatePlanetShadow(n, angle);
            if (n.surface && n.rotPeriodHours && n.surfaceWidth > 0) {
                const rotationDegrees = (currentDays * 24 / n.rotPeriodHours) * 360;
                const turn = (((rotationDegrees % 360) + 360) % 360) / 360;
                const offset = -turn * n.surfaceWidth * 2;
                if (!(Math.abs(offset - n.lastBgOffset) < 0.05)) {
                    n.surface.style.backgroundPosition = `${offset.toFixed(2)}px center`;
                    n.lastBgOffset = offset;
                }
            }
            continue;
        }
        const kp = (fleetsModule && body && typeof fleetsModule.planetPosition === 'function')
            ? fleetsModule.planetPosition(body, currentDays) : null;
        if (kp) {
            angle = (kp.lam * 180 / Math.PI + 360) % 360;
            const rPx = orbitRadius(kp.r);
            px = Math.cos(kp.lam) * rPx;
            py = Math.sin(kp.lam) * rPx;
        } else {
            angle = (n.epoch + (currentDays / n.period) * 360) % 360;
            const rad = angle * Math.PI / 180;
            px = Math.cos(rad) * n.radius;
            py = Math.sin(rad) * n.radius;
        }
        n.x = px; n.y = py;
        n.wrapper.style.transform = `translate(${px.toFixed(2)}px, ${py.toFixed(2)}px)`;

        updatePlanetShadow(n, angle);

        if (n.surface && n.rotPeriodHours && n.surfaceWidth > 0) {
            const rotationDegrees = (currentDays * 24 / n.rotPeriodHours) * 360;
            // Сдвиг в пикселях, а не в процентах: шаг плитки кратен ширине планеты,
            // поэтому на стыке витка нет щели от округления процентов.
            const turn = (((rotationDegrees % 360) + 360) % 360) / 360;
            const offset = -turn * n.surfaceWidth * 2;
            if (!(Math.abs(offset - n.lastBgOffset) < 0.05)) {
                n.surface.style.backgroundPosition = `${offset.toFixed(2)}px center`;
                n.lastBgOffset = offset;
            }
        }
    }

    // --- СПУТНИКИ ---
    for (let i = 0; i < moonNodes.length; i++) {
        const n = moonNodes[i];
        const angle = (n.epoch + (currentDays / n.period) * 360) % 360;
        const rad = angle * Math.PI / 180;
        const mx = (Math.cos(rad) * n.radius).toFixed(2);
        const my = (Math.sin(rad) * n.radius).toFixed(2);
        n.moon.style.transform = `translate(calc(-50% + ${mx}px), calc(-50% + ${my}px))`;
        n.lastMx = parseFloat(mx); n.lastMy = parseFloat(my);

        // Тень луны как у планеты — копируем строку только если она изменилась
        const bg = n.hostShadow ? n.hostShadow.style.background : '';
        if (bg && n.shadow && bg !== n.lastShadowBg) { n.shadow.style.background = bg; n.lastShadowBg = bg; }
    }
}

// === ДИАГНОСТИКА КАДРА (включается только через ?perf=1) ===
const PERF_ENABLED = new URLSearchParams(window.location.search).has('perf');
let perfFrames = 0, perfAccum = 0, perfLastLog = performance.now();
function perfTick(frameMs) {
    if (!PERF_ENABLED) return;
    perfFrames++; perfAccum += frameMs;
    const now = performance.now();
    if (now - perfLastLog >= 1000) {
        console.log(`[PERF] fps=${(perfFrames * 1000 / (now - perfLastLog)).toFixed(1)} avgFrame=${(perfAccum / perfFrames).toFixed(2)}ms`);
        perfFrames = 0; perfAccum = 0; perfLastLog = now;
    }
}

// =========================================================
// ФЛОТЫ НА КАРТЕ
// =========================================================
// Позиции берутся из js/fleets.js: они считаются от часов, поэтому борта
// летают всегда — при старте, после паузы, при ускорении.
let fleetsModule = null;
let fleetDots = [];
let fleetLayer = null;


// =========================================================
// ГРАЖДАНСКИЙ ТРАФИК: колонии и пояс астероидов
// Раньше борта были только на межпланетных трассах, поэтому у колоний
// и в поясе астероидов ничего не двигалось.
// =========================================================
// У газовых гигантов поселений нет: там добыча газа, заводы на лунах,
// и торговля идёт с лун. У Земли и Марса — обычное снабжение колоний.
const CIVIL_GAS_MOONS = { jupiter: ['Европа', 'Ио', 'Ганимед'], saturn: ['Титан', 'Энцелад'] };
const CIVIL_COLONY_MOON = { earth: 'Луна', mars: 'Фобос' };
const CIVIL_PERIOD_GAME_S = 2400;      // полный оборот — 40 реальных секунд при 60×
let civilLayer = null, civilItems = [], civilBuilt = false;

// Объёмные рендеры (PNG с прозрачностью) есть не для всех классов:
// для остальных остаются плоские SVG.
const VOL_ART = new Set(['jet_scout', 'jet_hauler', 'ion_courier',
                         'ion_prospector', 'grav_frigate', 'plasma_interceptor']);
function shipArtUrl(art) {
    return VOL_ART.has(art) ? '/images/ships/vol/' + art + '.png'
                            : '/images/ships/' + art + '.svg';
}

// Реальные орбитальные данные лун: [расстояние до планеты, км; период, часов].
// Раньше гражданские борта показывали «0 млн км» и «0.0 ч» — теперь цифры честные.
const MOON_ORBITS = {
    'Луна':     [384400, 655.7],
    'Фобос':    [9376, 7.65],
    'Ио':       [421800, 42.5],
    'Европа':   [671100, 85.2],
    'Ганимед':  [1070400, 171.7],
    'Титан':    [1221870, 382.7],
    'Энцелад':  [238040, 32.9]
};

function civilMarker(art, label, cls) {
    const el = document.createElement('div');
    el.className = 'ship-marker' + (cls ? ' ' + cls : '');
    el.style.backgroundImage = 'url(' + shipArtUrl(art) + ')';
    el.style.pointerEvents = 'auto';
    el.title = label;
    let distKm = 0, hours = 0;
    for (const name in MOON_ORBITS) {
        if (label.indexOf(name) >= 0) { distKm = MOON_ORBITS[name][0]; hours = MOON_ORBITS[name][1]; break; }
    }
    el._fleet = { kind: label.split('·')[0].trim(), label: label, hours: hours,
                  distKm: distKm, art: art, color: '#9fb2c6' };
    el.dataset.dist = String(distKm);
    el.dataset.hours = String(hours);
    return el;
}


// =========================================================
// ТОРГОВЫЕ ТРАССЫ ОТ ВРАТ: корабли летят между реальными планетами,
// а не «висят» в нормализованных координатах. Пунктир показывает путь.
// =========================================================
const TRADE_LINKS = [
    { a: 'portal', b: 'earth',  count: 1, art: ['jet_scout'] },
    { a: 'earth',  b: 'mars',   count: 4, art: ['jet_hauler', 'ion_courier'] },
    { a: 'mars',   b: 'jupiter', count: 3, art: ['ion_prospector', 'jet_hauler'] },
    { a: 'jupiter', b: 'saturn', count: 3, art: ['grav_frigate', 'ion_prospector'] },
    // прямой рейс Юпитер <-> Земля: раньше его не было вообще
    { a: 'earth', b: 'jupiter', count: 2, art: ['ion_courier', 'jet_hauler'] },
    // торговля лунных баз: марсианские и астровитянские базы возят грузы
    { a: 'mars', b: 'saturn', count: 2, art: ['ion_prospector', 'jet_hauler'] },
    { a: 'saturn', b: 'earth', count: 2, art: ['grav_frigate', 'ion_courier'] }
];
let tradeShips = [], tradePaths = [], tradeBuilt = false, tradeLayer = null;

function portalPoint() {
    // Врата стоят там же, где нарисованы: радиус как в разметке портала
    const r = orbitRadius(19.19126) + 45;
    const ang = 160 * Math.PI / 180;
    return { x: Math.cos(ang) * r, y: Math.sin(ang) * r, size: 16 };
}

function planetPoint(id) {
    if (id === 'portal') return portalPoint();
    const n = planetNodes.find(p => (p.id || (p.planet && p.planet.getAttribute && p.planet.getAttribute('data-planet-id'))) === id);
    if (!n) return null;
    if (n.x !== undefined) return { x: n.x, y: n.y, size: n.size || 18 };
    const days = (simulatedTime - EPOCH_MS) / DAY_MS;
    const a = ((n.epoch || 0) + (days / (n.period || 365)) * 360) * Math.PI / 180;
    return { x: Math.cos(a) * (n.radius || 200), y: Math.sin(a) * (n.radius || 200), size: n.size || 18 };
}


// Слои должны жить в ТОМ ЖЕ контейнере, что и планеты: иначе своя точка отсчёта
// и маркеры уезжают вместе с пунктиром, «отрываясь» от планет.

// Автокалибровка слоя: вычисляем, на сколько нарисованная планета смещена
// относительно её мировых координат, и сдвигаем весь слой на эту разницу.
// Так маркеры и пунктир гарантированно совпадают с планетами при любом зуме/наклоне.
let __lastAlign = 0;
function alignLayerToPlanets(layer) {
    if (!layer || !planetNodes.length) return;
    const n = planetNodes.find(p => p.wrapper && p.planet && p.x !== undefined);
    if (!n) return;
    const pr = n.planet.getBoundingClientRect();
    // ВАЖНО: измеряем слой БЕЗ его собственного сдвига, иначе transform
    // учитывается в getBoundingClientRect и калибровка «раскачивается» —
    // именно это давало переключение картинки раз в секунду.
    const keep = layer.style.transform;
    layer.style.transform = 'none';
    const lr = layer.getBoundingClientRect();
    layer.style.transform = keep;
    if (!pr.width || !lr.width) return;
    const scaleNow = (lr.width / (layer.offsetWidth || lr.width)) || 1;
    const dx = ((pr.left + pr.width / 2) - lr.left) / scaleNow - n.x;
    const dy = ((pr.top + pr.height / 2) - lr.top) / scaleNow - n.y;
    if (!isFinite(dx) || !isFinite(dy)) return;
    if (Math.abs(dx) < 0.6 && Math.abs(dy) < 0.6) return;   // уже выровнено
    layer.style.transform = 'translate(' + dx.toFixed(1) + 'px,' + dy.toFixed(1) + 'px)';
}
function alignAllLayers() {
    // Слои и орбиты теперь имеют общее начало координат (центр системы),
    // поэтому сдвиг не нужен — только показываем слой после первого кадра.
    [tradeLayer, fltLayer, civilLayer].forEach(l => { if (l && l.style.opacity !== '1') l.style.opacity = '1'; });
}

function trafficHost() {
    try {
        const n = planetNodes && planetNodes.length ? planetNodes[0] : null;
        if (n && n.wrapper && n.wrapper.parentElement) return n.wrapper.parentElement;
    } catch (e) { }
    return document.querySelector('.solar-system') || document.querySelector('.system-view');
}

function buildTradeTraffic() {
    if (tradeBuilt || !planetNodes.length) return;
    const host = trafficHost();
    if (!host) return;
    tradeBuilt = true;
    setTimeout(() => { try { buildPortalTraffic(); } catch (e) {} }, 300);

    tradeLayer = document.createElement('div');
    tradeLayer.id = 'trade-traffic';
    tradeLayer.style.cssText = 'position:absolute;left:50%;top:50%;width:0;height:0;overflow:visible;pointer-events:none;z-index:2';
    host.appendChild(tradeLayer);

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'trade-paths');
    svg.setAttribute('width', '1'); svg.setAttribute('height', '1');
    svg.setAttribute('overflow', 'visible');
    // ВАЖНО: то же начало координат, что у маркеров (0,0 слоя), иначе пунктир
    // смещён относительно бортов на полконтейнера.
    svg.style.cssText = 'position:absolute;left:0;top:0;overflow:visible;pointer-events:none;';
    tradeLayer.appendChild(svg);

    TRADE_LINKS.forEach((link, li) => {
        // Врата вне системы: трассы и борта от них рисуют «облако» за орбитами
        if (link.a === 'portal' || link.b === 'portal') return;
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', 'rgba(127,227,255,0.5)');
        path.setAttribute('stroke-width', '1.4');
        path.setAttribute('stroke-dasharray', '6 7');
        path.setAttribute('stroke-linecap', 'round');
        path.setAttribute('class', 'trade-path');
        svg.appendChild(path);
        // индекс пути должен совпадать с индексом звена (portal-звенья
        // пропускаются, из-за чего push сдвигал соответствие)
        tradePaths[li] = path;

        for (let k = 0; k < link.count; k++) {
            const art = link.art[k % link.art.length];
            const el = document.createElement('div');
            el.className = 'ship-marker trade-ship';
            el.dataset.role = /^plasma/.test(art) ? 'fighter'
                : (/jet_hauler|grav_|ion_prospector/.test(art) ? 'freight' : 'trade');
            el.dataset.side = 'npc';
            el.style.backgroundImage = 'url(' + shipArtUrl(art) + ')';
            el.style.pointerEvents = 'auto';
            el.style.zIndex = '2';
            el.title = 'торговец · ' + link.a + ' → ' + link.b;
            el.dataset.sid = 'trade-' + link.a + '-' + link.b + '-' + k;   // стабильный ключ замеров
            el._fleet = { kind: 'торговец', label: el.title, hours: 0, art: art, color: '#8fd6ff' };
            tradeLayer.appendChild(el);
            el.dataset.seed = String(li * 100 + k);
            tradeShips.push({
                el: el, link: li, phase: k / link.count,
                // стабильный seed: не зависит от порядка обновления и перезагрузок
                seed: li * 100 + k,
                speed: 0.85 + (k % 3) * 0.12
            });
        }
    });
}


// ===== ФЛОТЫ: маршрут строится в момент вылета и дальше заморожен =====
// Координаты берутся из реальных позиций планет (planetPoint), а не из
// нормализованных 0..1 — иначе борта «летают непонятно где».
const FLEET_PAIRS = [
    { a: 'earth',   b: 'mars',    art: 'jet_scout',    ships: 2 },
    { a: 'mars',    b: 'jupiter', art: 'ion_courier',  ships: 2 },
    { a: 'jupiter', b: 'saturn',  art: 'jet_hauler',   ships: 2 },
    { a: 'earth',   b: 'jupiter', art: 'grav_frigate', ships: 1 }
];
let fltLayer = null, fltBuilt = false;
const fltItems = [];

function fltBezier(A, cp, B, t) {
    const u = 1 - t;
    return { x: u * u * A.x + 2 * u * t * cp.x + t * t * B.x,
             y: u * u * A.y + 2 * u * t * cp.y + t * t * B.y };
}


// Маршрут флота с УПРЕЖДЕНИЕМ: летим не туда, где планета сейчас, а туда,
// где она будет к моменту прибытия. Маршрут строится на момент вылета.
function fleetRouteFor(fromId, toId, durMs) {
    const A = planetPoint(fromId);
    if (!A) return null;
    let B = planetPoint(toId);
    if (!B) return null;
    const WC = window.WorldCoords;
    if (WC && WC.planetAt && durMs > 0) {
        // реальные мс показа -> игровые мс (при 60× это ×60), но не больше часа игры
        const etaGameMs = Math.min(durMs * (timeScale || 60), 3600000);
        const tgt = WC.planetAt(toId, simulatedTime + etaGameMs);
        if (tgt) B = { x: tgt.x, y: tgt.y, size: tgt.size };
    }
    const dx = B.x - A.x, dy = B.y - A.y, len = Math.hypot(dx, dy) || 1;
    const nx = dy / len, ny = -dx / len;
    const midX = (A.x + B.x) / 2, midY = (A.y + B.y) / 2;
    const side = (nx * midX + ny * midY) >= 0 ? 1 : -1;
    let bulge = Math.min(46, Math.max(10, len * 0.12)) * side;
    const dLine = Math.abs(A.x * B.y - B.x * A.y) / len;
    if (dLine < 135) bulge = Math.min(70, Math.max(Math.abs(bulge), 135 - dLine + 25)) * side;
    let cpx = midX + nx * bulge, cpy = midY + ny * bulge;
    const cR = Math.hypot(cpx, cpy), limR = maxOrbitRadius * 0.92;
    if (cR > limR) { cpx = cpx / cR * limR; cpy = cpy / cR * limR; }
    return { A: A, B: B, cp: { x: cpx, y: cpy }, len: len };
}

function buildFleetUnits() {
    if (fltBuilt) return;
    // слой мог остаться от предыдущей попытки — не строим второй
    const stale = document.getElementById('fleet-traffic');
    if (stale && stale.childElementCount > 0) { fltBuilt = true; return; }
    const host = document.querySelector('.solar-system');
    if (!host) return;
    fltLayer = document.createElement('div');
    fltLayer.id = 'fleet-traffic';
    fltLayer.style.cssText = 'position:absolute;left:50%;top:50%;width:0;height:0;overflow:visible;pointer-events:none;z-index:6;opacity:0';
    try {
        const e0 = planetPoint('earth');
        fltLayer.dataset.dbg = 'planets=' + planetNodes.length + ' earth=' + (e0 ? 'ok' : 'null');
    } catch (err) { fltLayer.dataset.dbg = 'err=' + err.message; }
    host.appendChild(fltLayer);
    const SVGNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(SVGNS, 'svg');
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '100%');
    svg.style.cssText = 'position:absolute;inset:0;overflow:visible';
    fltLayer.appendChild(svg);

    FLEET_PAIRS.forEach((pair, pi) => {
        const R0 = fleetRouteFor(pair.a, pair.b, 0);
        if (!R0) return;
        const A = R0.A, B = R0.B, cp = R0.cp, len = R0.len;

        // пунктир — та же замороженная трасса, по которой идёт борт
        const path = document.createElementNS(SVGNS, 'path');
        path.setAttribute('d', 'M' + A.x + ' ' + A.y + ' Q' + cp.x + ' ' + cp.y + ' ' + B.x + ' ' + B.y);
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', 'rgba(127,227,255,0.45)');
        path.setAttribute('stroke-width', '1.3');
        path.setAttribute('stroke-dasharray', '5 7');
        svg.appendChild(path);
        const routePath = path;

        for (let k = 0; k < (pair.ships || 1); k++) {
            const el = document.createElement('div');
            el.className = 'ship-marker ship-marker--fleet';
            el.dataset.role = 'own';
            el.dataset.side = 'own';
            let art = '/images/ships/vol/jet_scout.png';
            try { if (typeof shipArtUrl === 'function') art = shipArtUrl(pair.art); } catch (e) { }
            el.style.cssText = 'position:absolute;width:22px;height:22px;z-index:6;' +
                'background:url(' + art + ') center/contain no-repeat;' +
                'filter:drop-shadow(0 0 6px rgba(140,210,255,0.55))';
            el.title = 'Флот: ' + pair.a + ' → ' + pair.b;
            fltLayer.appendChild(el);
            // Скорость борта — 100 км/с. Расстояние берём по шкале карты
            // (1 а.е. = 185 px = 149.6 млн км), время считаем в игровых секундах,
            // а для показа сжимаем до 20…120 реальных секунд (60×).
            const kmPerPx = 149600000 / 185;
            const distKm = Math.hypot(B.x - A.x, B.y - A.y) * kmPerPx;
            // скорость из матрицы: масса, число двигателей, модернизация, технологии
            let vKmS = 100;
            try {
                if (window.SpeedModel) {
                    const lvl = (currentUser && currentUser.engineLevel) || 0;
                    const tech = (currentUser && currentUser.techLevel) || 0;
                    vKmS = window.SpeedModel.speedKmS(pair.art, { engineLevel: lvl, techLevel: tech }) || 100;
                }
            } catch (e) { }
            const durGame = distKm / vKmS;                 // игровых секунд
            const durRealRaw = durGame / 60;              // реальных секунд при 60×
            // показ рейса: целимся в 8 px/с по экрану (12…45 с на рейс)
            const durShow = Math.max(12, Math.min(45, len / 8));
            const compress = durRealRaw / durShow;
            el._pathEl = routePath;
            el.art = pair.art;
            el._idx = fltItems.filter(x => !x.portalLoop).length;   // номер борта в расписании
            el._fromId = pair.a; el._toId = pair.b; el._path = routePath;
            // el._idx — номер борта в расписании; других источников быть не должно
            el.dataset.sid = 'fleet-' + el._idx;
            fltItems.push({ el: el, A: A, cp: cp, B: B, dur: durShow,
                            fromId: pair.a, toId: pair.b, path: routePath, prevT: 0,
                            t0: simulatedTime, phase: pi * 0.23 + k * 0.5,
                            phase: pi * 0.23 + k * 0.5,
                            distKm: distKm, durGame: durGame, compress: compress });
        }
    });
    // ---- межсистемные рейсы ----
    // Флот чужой системы не может «летать» по нашей карте: он выходит из Врат
    // и уходит в Врата. Показываем короткий отрезок у портала, а не трассу
    // через всю систему.
    const P = null;   // Врата далеко за орбитами: межсистемные борта не рисуем на карте
    if (P) {
        const inX = P.x * 0.86, inY = P.y * 0.86;   // точка чуть ближе к Солнцу
        const outX = P.x * 1.06, outY = P.y * 1.06; // чуть снаружи
        for (let k = 0; k < 2; k++) {
            const el = document.createElement('div');
            el.className = 'ship-marker ship-marker--fleet ship-marker--portal';
            let art = '/images/ships/vol/jet_scout.png';
            try { if (typeof shipArtUrl === 'function') art = shipArtUrl('ion_courier'); } catch (e) { }
            el.style.cssText = 'position:absolute;width:22px;height:22px;z-index:6;opacity:.75;' +
                'background:url(' + art + ') center/contain no-repeat;' +
                'filter:drop-shadow(0 0 6px rgba(160,120,255,0.6))';
            el.title = 'Межсистемный рейс · Врата';
            fltLayer.appendChild(el);
            fltItems.push({ el: el, A: { x: outX, y: outY }, cp: { x: P.x, y: P.y },
                            B: { x: inX, y: inY }, dur: 26, phase: k * 0.5, portal: true });
        }
        const path = document.createElementNS(SVGNS, 'path');
        path.setAttribute('class', 'route-line');
        path.setAttribute('d', 'M' + outX + ' ' + outY + ' Q' + P.x + ' ' + P.y + ' ' + inX + ' ' + inY);
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', 'rgba(170,140,255,0.55)');
        path.setAttribute('stroke-width', '1.2');
        path.setAttribute('stroke-dasharray', '4 6');
        svg.appendChild(path);
    }

    // гражданские борта не должны отлетать далеко от своей планеты
    civilItems.forEach(it => {
        if (it.kind !== 'platform') it.radius = Math.min(it.radius || 18, 26);
    });
    // Борта у Врат убраны: они крутились по эллипсу «ни туда ни сюда».
    if (fltItems.length) fltBuilt = true;
    window.__fltDebug = fltItems.map(it => ({
        t: it.fromId || (it.portalLoop ? 'portal' : '?'),
        A: it.A ? [Math.round(it.A.x), Math.round(it.A.y)] : null,
        B: it.B ? [Math.round(it.B.x), Math.round(it.B.y)] : null,
        tl: it.tl ? it.tl.total : null
    }));
}


// ===== ТАЙМЛАЙН РЕЙСА =====
// Полный цикл: погрузка -> взлёт -> ускорение -> крейсерский ход ->
// подход/приземление -> разгрузка (+ ожидание на орбите, если доки заняты).
// Минимум 5 минут ИГРОВОГО времени на рейс, независимо от длины плеча.
const FLEET_PHASES = {
    // стоянки короткие: длинные паузы на 60× выглядели как «дёрганое» движение
    load: 25,        // погрузка у станции
    takeoff: 10,     // отрыв и выход на орбиту
    accel: 20,       // разгон
    land: 15,        // подход и приземление
    unload: 25,      // разгрузка
    dockWait: 60,    // ожидание свободного дока (при занятости)
    minTotal: 300,   // 5 игровых минут — минимум на рейс
    targetPxSec: 2.5 // целевая экранная скорость борта
};

function fleetTimeline(lenPx) {
    const P = FLEET_PHASES;
    const scale = timeScale || 60;
    // крейсер: столько игровых секунд, чтобы на экране борт шёл ~2,5 px/с
    let cruise = Math.max(60, (lenPx / P.targetPxSec) * scale);
    // ожидание на орбите: если все доки заняты
    let wait = 0;
    try {
        const u = window.getCurrentUser ? window.getCurrentUser() : null;
        const ships = (u && u.ships) ? u.ships.length : 0;
        const slots = (u && typeof u.dockSlots === 'number') ? u.dockSlots : 1;
        if (ships >= slots) wait = P.dockWait;
    } catch (e) { }
    let total = P.load + P.takeoff + P.accel + cruise + P.land + P.unload + wait;
    // Скорость крейсера ОДНА для всех плеч — 2,5 px/с по экрану.
    // Если рейс короче 5 игровых минут, недостаток уходит в ожидание у станции.
    // ожидание у станции ограничено: иначе короткие плечи почти всё время стоят
    wait = Math.min(wait + Math.max(0, P.minTotal - total), 30);
    total = P.load + P.takeoff + P.accel + cruise + P.land + P.unload + wait;
    return { load: P.load, takeoff: P.takeoff, accel: P.accel, cruise: cruise,
             land: P.land, unload: P.unload, wait: wait, total: total };
}

// ЛИНИИ МАРШРУТОВ ФЛОТА: без них борта «летали без маршрутов».
const FLEET_RING = ['earth', 'mars', 'jupiter', 'saturn'];
let fleetRouteSvg = null;
let fleetRoutePaths = [];

function ensureFleetRoutes() {
    if (fleetRouteSvg) return;
    const scene = document.querySelector('.solar-system');
    if (!scene) return;
    fleetRouteSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    fleetRouteSvg.setAttribute('class', 'fleet-routes');
    fleetRouteSvg.setAttribute('width', '1');
    fleetRouteSvg.setAttribute('height', '1');
    fleetRouteSvg.setAttribute('overflow', 'visible');
    fleetRouteSvg.style.cssText = 'position:absolute;left:0;top:0;overflow:visible;pointer-events:none;z-index:1;';
    scene.appendChild(fleetRouteSvg);
    for (let i = 0; i < FLEET_RING.length; i++) {
        const a = FLEET_RING[i], b = FLEET_RING[(i + 1) % FLEET_RING.length];
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('class', 'fleet-route');
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', 'rgba(143, 214, 255, 0.35)');
        path.setAttribute('stroke-width', '1');
        path.setAttribute('stroke-dasharray', '5 7');
        fleetRouteSvg.appendChild(path);
        fleetRoutePaths.push({ a: a, b: b, el: path });
    }
}

function updateFleetRoutes() {
    ensureFleetRoutes();
    fleetRoutePaths.forEach(function (r) {
        const A = planetPoint(r.a), B = planetPoint(r.b);
        if (!A || !B) return;
        r.el.setAttribute('d', 'M' + A.x.toFixed(1) + ' ' + A.y.toFixed(1) +
            ' L' + B.x.toFixed(1) + ' ' + B.y.toFixed(1));
    });
}

function updateFleetTraffic() {
    alignAllLayers();
    if (!fltBuilt) {
        // ждём, пока планеты появятся в planetNodes: до этого planetPoint() = null
        if (!planetNodes.length) return;
        // планеты могут быть в списке, но ещё без координат — тогда маршруты
        // получились бы из точки (0,0), и борта стояли бы в центре Солнца
        const e0 = planetPoint('earth');
        if (!e0 || Math.hypot(e0.x, e0.y) < 50) return;
        buildFleetUnits();
        if (!fltBuilt) return;
    }
    const scene = document.querySelector('.solar-system');
    if (scene && fltLayer && fltLayer.parentNode !== scene) scene.appendChild(fltLayer);
    // время берём игровое: иначе переключатель скорости на флоты не влияет
    const now = simulatedTime / 1000;
    if (window.Motion) window.Motion.setTime(simulatedTime);
    fltItems.forEach(it => {
        try {
            if (!window.Motion) return;
            // портальный контур: гладкий эллипс вокруг Врат
            if (it.portalLoop) {
                if (it.t0p === undefined) it.t0p = simulatedTime;
                const sec = (simulatedTime - it.t0p) / 1000;
                const ang = (sec / 60) * Math.PI * 2 + (it.phase || 0) * Math.PI * 2;
                const px = it.P.x + Math.cos(ang) * 46;
                const py = it.P.y + Math.sin(ang) * 26;
                if (window.SceneBridge && window.SceneBridge.on()) {
                    const pid = 'portal-' + (it.el._idx !== undefined ? it.el._idx : (it.shipIndex || 0));
                    window.SceneBridge.watch(pid, it.el, 12);
                    window.SceneBridge.publish(pid, { x: px, y: py, ang: ang * 180 / Math.PI + 90, opacity: 1 });
                } else {
                    legacyPose(it.el, px, py, ang * 180 / Math.PI + 90, { opacity: 1 });
                }
                return;
            }
            // обычный борт: расписание из Motion (ближайший заказ, без «туда-обратно»)
            // номер борта лежит на DOM-элементе (el._idx), а не на элементе массива
            if (it.shipIndex === undefined) {
                // индексы обязаны быть уникальными: два борта с одним индексом
                // встают в одну точку (тестировщик ловил слипание 0.0 px)
                const used = window.__fleetIdxUsed = window.__fleetIdxUsed || new Set();
                let idx = (it.el && it.el._idx !== undefined) ? it.el._idx : it._idx;
                if (idx === undefined || used.has(idx)) {
                    idx = 0;
                    while (used.has(idx) && idx < 400) idx++;
                }
                used.add(idx);
                it.shipIndex = idx;
            }
            const ps = window.Motion.shipPose(it.shipIndex, simulatedTime);
            if (!ps) return;
            // визуальный развод: два борта с одинаковой фазой не должны слипаться
            const off = (it.shipIndex % 12) * 0.7;
            const offA = (it.shipIndex * 2.399) % 6.28;
            ps.x += Math.cos(offA) * off;
            ps.y += Math.sin(offA) * off;
            if (it.el.style.left !== '') {
                const d = Math.hypot(ps.x - (parseFloat(it.el.style.left) || 0),
                                     ps.y - (parseFloat(it.el.style.top) || 0));
                if (d > 25) {
                    const fj = (window.__fj = window.__fj || { max: 0, jumps: 0, frames: 0, where: '' });
                    fj.jumps++; if (d > fj.max) { fj.max = d; fj.where = 'ship' + it.shipIndex; }
                }
            }
            // хвост только в полёте: на стоянке/погрузке его быть не должно
            it.el.dataset.moving = (ps.phase === 'fly') ? '1' : '0';
            it.el.dataset.role = 'own';
            it.el.dataset.side = 'own';
            if (!it.el.__dblBound) {
                it.el.__dblBound = true;
                it.el.addEventListener('dblclick', function (ev) {
                    ev.stopPropagation();
                    if (this._fleet && typeof openFleetCard === 'function') openFleetCard(this._fleet);
                });
            }
            const msF = markerSize();
            if (it.el.dataset.ms !== String(msF)) {
                it.el.dataset.ms = String(msF);
                if (!canvasMode()) {
                    it.el.style.width = msF + 'px';
                    it.el.style.height = msF + 'px';
                }
            }
            // стоянка: сдвигаем ТОЛЬКО картинку, координаты остаются в планете —
            // так борт не прячется под спрайтом планеты и нет разрыва траектории
            const parked = (ps.phase === 'load' || ps.phase === 'unload' || ps.phase === 'wait');
            if (window.SceneBridge && window.SceneBridge.on()) {
                const fid = 'fleet-' + it.shipIndex;
                window.SceneBridge.watch(fid, it.el, 12);
                window.SceneBridge.publish(fid, {
                    x: ps.x, y: ps.y, ang: ps.ang || 0,
                    shiftY: parked ? 12 : 0,
                    opacity: ps.opacity
                });
            } else {
                legacyPose(it.el, ps.x, ps.y, ps.ang || 0, {
                    shiftY: parked ? 12 : 0,
                    scale: depthScale(ps.y),
                    standUp: true,
                    opacity: ps.opacity
                });
            }
            const cargo = ps.cargo && ps.cargo !== '-' ? ' · ' + ps.cargo : '';
            // скорость борта и его класс — сразу в подсказке
            let vTxt = '';
            try {
                const art = it.art || 'jet_scout';
                const v = window.Motion.shipSpeed(art,
                    { engineLevel: (currentUser && currentUser.engineLevel) || 0,
                      techLevel: (currentUser && currentUser.techLevel) || 0 });
                const cls = (window.Motion.TABLES.ships[art] || {}).cls || 'light';
                const clsRu = cls === 'truck' ? 'грузовик' : (cls === 'fighter' ? 'истребитель' : 'лёгкий');
                vTxt = ' · ' + Math.round(v).toLocaleString('ru-RU') + ' км/с · ' + clsRu;
            } catch (e) { }
            const title = 'Флот · ' + (ps.from || ps.leg) + (ps.to ? ' → ' + ps.to : '') + cargo + vTxt;
            if (it.el.title !== title) it.el.title = title;
        } catch (err) {
            if (!window.__fleetItemErr) window.__fleetItemErr =
                String(err && err.message) + ' @ ' + String(err && err.stack || '').split('\n')[1];
        }
    });
    // диагностика: видно, обновляются ли борта каждый кадр
    try {
        if (fltLayer) fltLayer.dataset.upd = String(Math.round(simulatedTime)) + '|' +
            fltItems.length + '|' + (fltItems[0] ? fltItems[0].el.style.left : '-');
    } catch (e) { }
}

// Глубина сцены: борт дальше по оси Y рисуется чуть меньше — появляется объём,
// иначе на наклонной карте все спрайты выглядят одинаково плоскими.
// Размер борта не зависит от зума: иначе при 0,3× он становится точкой.
// РЕАЛЬНЫЙ РАЗМЕР КОРАБЛЯ ОТНОСИТЕЛЬНО ЛУНЫ.
// Корабль 120 м, Луна 3474 км → отношение 3.45e-5. При «×4» корабль
// на экране был бы 0.0017 px (невидим), поэтому оставлен минимум 2 px.
const SHIP_LENGTH_KM = 0.12;
const MOON_DIAMETER_KM = 3474;
const SHIP_EXAGGERATION = 4;        // множитель владельца
const SHIP_MIN_PX = 2;              // порог видимости
const MOON_REF_PX = 12;             // типичный размер луны на экране

function markerSize() {
    const sc = (typeof scale === 'number' && scale > 0) ? scale : 1;
    const moonPx = MOON_REF_PX / sc;
    const realPx = moonPx * (SHIP_LENGTH_KM / MOON_DIAMETER_KM) * SHIP_EXAGGERATION;
    return Math.max(SHIP_MIN_PX, Math.min(15, Math.round(realPx * 100) / 100));
}

function depthScale(y) {
    const k = 0.86 + 0.26 * Math.max(0, Math.min(1, (y + 420) / 840));
    return k.toFixed(2);
}

// Борт над плоскостью орбит: компенсируем наклон сцены (rotX), чтобы спрайт
// не лежал «наклейкой» на полу, и слегка приподнимаем его.
function standUp() {
    // Объём: отменяем поворот сцены и компенсируем наклон ЧАСТИЧНО (60%),
    // чтобы спрайт не выглядел плоской наклейкой, но и не «складывался в ребро».
    const rx = (typeof rotX === 'number') ? rotX : 0;
    const rz = (typeof rotZ === 'number') ? rotZ : 0;
    return ' translateY(-4px) perspective(420px)' +
           ' rotateZ(' + (-rz).toFixed(0) + 'deg)' +
           ' rotateX(' + (-rx * 0.6).toFixed(0) + 'deg)';
}

// ===== РЕЙСЫ ЧЕРЕЗ ВРАТА =====
// Врата — статичная точка. Борт летит Земля -> Врата и исчезает,
// встречный появляется у Врат и летит к Земле. Один и тот же закон времени.
let portalRouteShips = [];
function buildPortalTraffic() {
    if (portalRouteShips.length || !tradeLayer) return;
    const P0 = planetPoint('earth'), PG = portalPoint();
    if (!P0 || !PG) return;

    const svg = tradeLayer.querySelector('svg.trade-paths');
    if (svg) {
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('class', 'trade-path portal-path');
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', 'rgba(138, 180, 248, 0.55)');
        path.setAttribute('stroke-width', '1.2');
        path.setAttribute('stroke-dasharray', '6 7');
        path.setAttribute('d', 'M' + P0.x + ' ' + P0.y + ' L' + PG.x + ' ' + PG.y);
        svg.appendChild(path);
    }

    for (let k = 0; k < 2; k++) {
        const el = document.createElement('div');
        el.className = 'ship-marker trade-ship';
        el.style.backgroundImage = 'url(' + shipArtUrl('ion_courier') + ')';
        el.style.pointerEvents = 'none';
        el.style.zIndex = '2';
        el.title = k === 0 ? 'рейс · Земля → Врата' : 'рейс · Врата → Земля';
        tradeLayer.appendChild(el);
        portalRouteShips.push({ el: el, outbound: k === 0, phase: k * 0.5 });
    }
}

// ЕДИНЫЙ РЕЕСТР БОРТОВ: единственная схема управления и отрисовки.
// Любой борт регистрируется здесь и получает позу ТОЛЬКО из motion.js.
const SHIP_REGISTRY = new Map();
window.__shipRegistry = SHIP_REGISTRY;

function registerShip(id, el, poseFn) {
    if (!id || !el || typeof poseFn !== 'function') return;
    SHIP_REGISTRY.set(id, { el: el, pose: poseFn });
}

function unregisterShip(id) { SHIP_REGISTRY.delete(id); }

function updateShipsUnified() {
    SHIP_REGISTRY.forEach(function (rec, id) {
        let pose = null;
        try { pose = rec.pose(simulatedTime); } catch (e) { pose = null; }
        if (!pose) return;
        if (!scenePublish(id, rec.el, {
            x: pose.x, y: pose.y, ang: pose.ang, opacity: pose.opacity
        })) {
            legacyPose(rec.el, pose.x, pose.y, pose.ang, { opacity: pose.opacity });
        }
    });
}

function updatePortalTraffic() {
    if (!portalRouteShips.length) return;
    const P0 = planetPoint('earth'), PG = portalPoint();
    if (!P0 || !PG) return;

    // линия Врат — статичная
    portalRouteShips.forEach(function (sh) {
        const id = 'portal-' + (sh.outbound ? 'out' : 'in');
        registerShip(id, sh.el, function (tMs) {
            const A = sh.outbound ? planetPoint('earth') : portalPoint();
            const B = sh.outbound ? portalPoint() : planetPoint('earth');
            if (!A || !B) return null;
            return window.Motion.segmentPose(A.x, A.y, B.x, B.y, 'ion_courier', sh.phase, tMs);
        });
    });
}

function updateTradeTraffic() {
    window.__tradeDbg = [];
    alignAllLayers();
    if (!tradeBuilt) { buildTradeTraffic(); return; }
    // Слой должен жить ВНУТРИ трансформируемой сцены, иначе при сдвиге/зуме
    // карты планеты уезжают, а корабли остаются на месте — «летают непонятно где».
    const scene = document.querySelector('.solar-system');
    if (scene && tradeLayer && tradeLayer.parentNode !== scene) {
        scene.appendChild(tradeLayer);
    }
    const now = simulatedTime;
    TRADE_LINKS.forEach((link, li) => {
        // Врата стоят далеко за орбитами: трасса от них уводит борта «в пустоту»
        if (link.a === 'portal' || link.b === 'portal') return;
        const A = planetPoint(link.a), B = planetPoint(link.b);
        if (!A || !B) return;
        const dx = B.x - A.x, dy = B.y - A.y;
        const len = Math.hypot(dx, dy) || 1;
        const nx = dy / len, ny = -dx / len;
        const midX = (A.x + B.x) / 2, midY = (A.y + B.y) / 2;
        const outward = (nx * midX + ny * midY) >= 0 ? 1 : -1;
        let bulge = Math.min(120, Math.max(18, len * 0.22)) * outward;

        // Баллистика: трасса не должна проходить близко к Солнцу.
        // Считаем минимальное расстояние от Солнца (0,0) до хорды и, если
        // она идёт слишком близко, отводим дугу в сторону с большим зазором.
        const SUN_SAFE = 135;                 // минимальный зазор от светила, px
        const dLine = Math.abs(A.x * B.y - B.x * A.y) / len;
        if (dLine < SUN_SAFE && !(link.a === 'portal' || link.b === 'portal')) {
            const side = (nx * midX + ny * midY) >= 0 ? 1 : -1;
            const need = (SUN_SAFE - dLine) + Math.min(90, len * 0.18);
            bulge = (bulge >= 0 ? 1 : -1) * Math.max(Math.abs(bulge), need) * side * side;
            bulge = Math.abs(bulge) * (side || outward);
        }
        const cx = midX + nx * bulge, cy = midY + ny * bulge;
        // Пунктир перерисовывается КАЖДЫЙ кадр по живым координатам планет:
        // раньше путь строился один раз и «отставал» от бортов.
        if (tradePaths[li]) {
            tradePaths[li].setAttribute('d',
                'M' + A.x.toFixed(1) + ' ' + A.y.toFixed(1) +
                ' Q' + cx.toFixed(1) + ' ' + cy.toFixed(1) +
                ' ' + B.x.toFixed(1) + ' ' + B.y.toFixed(1));
        }

        const path = tradePaths[li];
        if (path) {
            path.setAttribute('d', `M ${A.x.toFixed(1)} ${A.y.toFixed(1)} Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${B.x.toFixed(1)} ${B.y.toFixed(1)}`);
        }

        // длина дуги Безье ≈ хорда + 2/3 стрелки прогиба
        const arcLen = len + Math.abs(bulge) * 0.66;
        // у Солнца борт теряет скорость на преодоление притяжения
        const sunGap = Math.abs(A.x * B.y - B.x * A.y) / len;
        const gravityCost = sunGap < 260 ? 1 + (260 - sunGap) / 260 * 0.35 : 1;
        // ЕДИНЫЙ алгоритм: скорость класса, разгон/торможение, та же формула, что у флота
        tradeShips.filter(s => s.link === li).forEach((ship, idx) => {
            const pth = tradePaths[li];
            ship.el._pathEl = pth || null;
            const ps = window.Motion && window.Motion.curvePose
                ? window.Motion.curvePose(A.x, A.y, cx, cy, B.x, B.y,
                      ship.art || 'ion_courier',
                      // фаза — чистая функция seed: не зависит от count и порядка
                      ((ship.seed || 0) * 0.137 + 0.5) % 1, simulatedTime)
                : null;
            if (!ps) return;
            // диагностика: видно, какая длина и период легли в расчёт
            ship.el.dataset.dbg = Math.round(ps.span) + '|' + Math.round(ps.km) + '|' + Math.round(ps.lenPx);
            (window.__tradeDbg = window.__tradeDbg || []).push({
                link: li, seed: ship.seed, art: ps.art, v: Math.round(ps.vKmS),
                span: Math.round(ps.span), km: Math.round(ps.km),
                tIn: ps.tIn, el: Math.round(ps.el), cyc: ps.cyc, u: +ps.u.toFixed(4),
                ph: ps.phaseUsed,
                lenPx: ps.lenPx, ax: ps.ax, ay: ps.ay, bx: ps.bx, by: ps.by
            });
            if (Math.hypot(ps.x, ps.y) > maxOrbitRadius * 1.08) {
                ship.el.style.display = 'none';
            } else {
                ship.el.style.display = '';
            }
            // диагностика: что посчитало ядро и что попало в стиль
            ship.el.dataset.coreX = ps.x.toFixed(1);
            ship.el.dataset.coreY = ps.y.toFixed(1);
            ship.el.dataset.u = ps.u.toFixed(5);
            ship.el.dataset.el = String(Math.round(ps.el));
            ship.el.dataset.cyc = String(ps.cyc);
            ship.el.dataset.ph = String(ps.phaseUsed);
            ship.el.dataset.t = String(Math.round(simulatedTime));
            ship.el.dataset.len = String(ps.lenPx);
            ship.el.dataset.span = String(Math.round(ps.span));
            ship.el.dataset.now = String(Math.round(simulatedTime));
            ship.el.dataset.pst = String(Math.round(ps.tIn));
            ship.el.dataset.art = ps.art;
            ship.el.dataset.ax = String(Math.round(ps.ax));
            ship.el.dataset.by = String(Math.round(ps.by));
            ship.el.dataset.moving = (ps.phase === 'fly') ? '1' : '0';
            const art = ship.art || 'ion_courier';
            ship.el.dataset.role = /^plasma/.test(art) ? 'fighter'
                : (/jet_hauler|grav_|ion_prospector/.test(art) ? 'freight' : 'trade');
            ship.el.dataset.side = 'npc';
            if (!ship.el.__dblBound) {
                ship.el.__dblBound = true;
                ship.el.addEventListener('dblclick', function (ev) {
                    ev.stopPropagation();
                    var ri = parseInt(this.getAttribute('data-route'), 10);
                    if (!isNaN(ri) && typeof openTrafficCard === 'function') openTrafficCard(ri);
                });
            }
            const msT = markerSize();
            if (ship.el.dataset.ms !== String(msT)) {
                ship.el.dataset.ms = String(msT);
                if (!canvasMode()) {
                    ship.el.style.width = msT + 'px';
                    ship.el.style.height = msT + 'px';
                }
            }
            // НОВЫЙ СЛОЙ: позицию пишет только scene.js (флаг ?scene=2).
            const bridgeId = 'trade-' + (ship.seed || 0);
            if (window.SceneBridge && window.SceneBridge.on()) {
                window.SceneBridge.watch(bridgeId, ship.el, 12);
                window.SceneBridge.publish(bridgeId, {
                    x: ps.x, y: ps.y, ang: ps.ang,
                    hidden: (ps.phase !== 'fly' && ps.phase !== 'load')
                });
            } else {
                legacyPose(ship.el, ps.x, ps.y, ps.ang, { scale: depthScale(ps.y), standUp: true });
            }
            if (ship.el.dataset.coreX !== String(parseFloat(ps.x.toFixed(1)))) {
                window.__overwritten = (window.__overwritten || 0) + 1;
            }
        });
    });
}

function buildCivilTraffic() {
    if (civilBuilt || !planetNodes.length) return;
    const host = trafficHost();
    if (!host) return;
    civilBuilt = true;
    civilLayer = document.createElement('div');
    civilLayer.id = 'civil-traffic';
    civilLayer.style.cssText = 'position:absolute;left:50%;top:50%;width:0;height:0;overflow:visible;pointer-events:none;z-index:4';
    host.appendChild(civilLayer);

    // 1) снабжение колоний: шаттлы вокруг планет с обитаемыми лунами
    planetNodes.forEach((n, i) => {
        const pid = n.id ||
                    (n.planet && n.planet.getAttribute && n.planet.getAttribute('data-planet-id')) ||
                    (n.data && n.data.id) || '';
        const gasMoons = CIVIL_GAS_MOONS[pid];
        const colonyMoon = CIVIL_COLONY_MOON[pid];
        if (gasMoons) {
            // танкеры вокруг лун: заводы стоят на них, а не на гиганте
            gasMoons.forEach((moonName, mi) => {
                for (let k = 0; k < 1; k++) {
                    const el = civilMarker('jet_hauler', 'газовый танкер · ' + moonName + ' → орбита');
                    civilLayer.appendChild(el);
                    civilItems.push({
                        el: el, kind: 'gas', planetIndex: i, moonName: moonName,
                        radius: 15 + k * 6,
                        phase: (mi / gasMoons.length) * Math.PI * 2 + k,
                        speed: 1.1 + k * 0.2
                    });
                }
            });
            return;
        }
        // Лунная линия: борта идут между планетой и её луной (Земля ↔ Луна)
        if (pid === 'earth') {
            for (let k = 0; k < 5; k++) {
                const el = civilMarker(k % 2 ? 'jet_hauler' : 'ion_courier',
                    'лунная линия · Земля ↔ Луна');
                civilLayer.appendChild(el);
                civilItems.push({
                    el: el, kind: 'lunar', planetIndex: i, moonName: 'Луна',
                    phase: k / 5, speed: 1 + k * 0.07
                });
            }
        }
        if (!colonyMoon) return;
        for (let k = 0; k < 3; k++) {
            const planetRu = { earth: 'Земля', mars: 'Марс' }[pid] || (n.name || pid);
            const el = civilMarker(k === 0 ? 'jet_hauler' : 'ion_courier',
                'снабжение колонии · ' + planetRu + ' → ' + colonyMoon);
            civilLayer.appendChild(el);
            civilItems.push({
                el: el, kind: 'colony', planetIndex: i,
                radius: (n.size || 20) + 22 + k * 7,
                phase: (k / 3) * Math.PI * 2 + i,
                speed: 1 + k * 0.12
            });
        }
    });

    // 1б) гравитационные платформы: видны только при приближении ×4 и ближе
    planetNodes.forEach((n, i) => {
        const el = document.createElement('div');
        el.className = 'gravity-platform';
        el.style.cssText = 'position:absolute;width:26px;height:10px;pointer-events:none;' +
            'background:linear-gradient(90deg,rgba(127,227,255,.15),rgba(127,227,255,.75),rgba(127,227,255,.15));' +
            'border-top:1px solid rgba(127,227,255,.85);border-bottom:1px solid rgba(127,227,255,.35);' +
            'box-shadow:0 0 10px rgba(127,227,255,.45);border-radius:3px;display:none;z-index:4';
        civilLayer.appendChild(el);
        civilItems.push({
            el: el, kind: 'platform', planetIndex: i,
            radius: (n.size || 20) + 34,
            phase: i * 0.9,
            speed: 0.45
        });
    });

    // 2) рудные борта в поясе астероидов.
    // Пояс лежит МЕЖДУ орбитами Марса и Юпитера — радиусы берём от живых планет,
    // а не из «астрономических» констант, иначе борта уезжали за пояс.
    const pMars = planetPoint('mars'), pJup = planetPoint('jupiter');
    const rMars = pMars ? Math.hypot(pMars.x, pMars.y) : orbitRadius(1.52);
    const rJup = pJup ? Math.hypot(pJup.x, pJup.y) : orbitRadius(5.2);
    const beltInner = rMars * 1.18;
    const beltOuter = rJup * 0.82;
    for (let k = 0; k < 8; k++) {
        const el = civilMarker(k % 2 ? 'ion_prospector' : 'jet_hauler',
            'рудный транспорт · пояс астероидов');
        // честные цифры для карточки: ~2.7 а.е. от Солнца, оборот ~4,6 года
        el._fleet.distKm = 400000000;
        el._fleet.hours = 40300;
        el.dataset.dist = '400000000';
        el.dataset.hours = '40300';
        civilLayer.appendChild(el);
        el.dataset.sid = 'belt-' + k;
        civilItems.push({
            el: el, kind: 'belt', planetIndex: -1,
            radius: beltInner + (beltOuter - beltInner) * ((k + 0.5) / 8),
            phase: (k / 8) * Math.PI * 2,
            speed: 0.6
        });
    }

    // ПИРАТЫ: три борта, у каждого свой цикл «набег -> домой с добычей -> пир»
    for (let k = 0; k < 3; k++) {
        const el = civilMarker(k === 0 ? 'plasma_interceptor' : (k === 1 ? 'jet_scout' : 'plasma_fighter'),
            'пират · набег и дележ добычи');
        el.dataset.sid = 'pirate-' + k;
        civilLayer.appendChild(el);
        civilItems.push({
            el: el, kind: 'pirate', planetIndex: -1,
            idx: k, phase: k * 0.33
        });
    }
}

// Планеты строятся асинхронно — ждём их появления и только тогда ставим борта.
function ensureCivilSoon(tries) {
    tries = tries || 0;
    if (planetNodes && planetNodes.length) {
        if (!civilBuilt) { civilBuilt = false; buildCivilTraffic(); updateCivilTraffic(); }
        return;
    }
    if (tries < 60) setTimeout(function () { ensureCivilSoon(tries + 1); }, 250);
}

// ===== ГРАВИТАЦИОННЫЕ ЛИФТЫ =====
// Локальная торговля луна <-> планета идёт не кораблями, а лифтом:
// на карте это тонкая линия с бегущими штрихами от планеты к луне.
let elevatorSvg = null;
const elevatorPaths = new Map();

function ensureElevatorLayer() {
    if (elevatorSvg) return;
    const scene = document.querySelector('.solar-system');
    if (!scene) return;
    elevatorSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    elevatorSvg.setAttribute('class', 'elevator-layer');
    elevatorSvg.setAttribute('width', '1');
    elevatorSvg.setAttribute('height', '1');
    elevatorSvg.setAttribute('overflow', 'visible');
    elevatorSvg.style.cssText = 'position:absolute;left:0;top:0;overflow:visible;pointer-events:none;z-index:1;';
    scene.appendChild(elevatorSvg);
}

function updateElevators() {
    if (!moonNodes.length) return;
    ensureElevatorLayer();
    if (!elevatorSvg) return;

    for (const n of moonNodes) {
        if (!n.moon || !n.faction) continue;
        const name = n.moon.getAttribute('data-moon') || '';
        const host = n.moon.closest('.planet');
        // координаты планеты: берём из planetNodes по совпадению DOM
        const hostNode = planetNodes.find(pn => pn.planet === host);
        if (!hostNode || hostNode.x === undefined) continue;

        let path = elevatorPaths.get(n.moon);
        if (!path) {
            path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.setAttribute('fill', 'none');
            path.setAttribute('stroke', n.faction.color);
            path.setAttribute('stroke-width', '1');
            path.setAttribute('stroke-dasharray', '3 6');
            path.setAttribute('stroke-opacity', '0.55');
            path.setAttribute('class', 'elevator' + ((name === 'Луна' || name === 'Фобос') ? ' spaceport' : ''));
            elevatorSvg.appendChild(path);
            elevatorPaths.set(n.moon, path);
        }
        const x1 = hostNode.x, y1 = hostNode.y;
        const x2 = hostNode.x + (n.lastMx || 0), y2 = hostNode.y + (n.lastMy || 0);
        path.setAttribute('d', 'M' + x1.toFixed(1) + ' ' + y1.toFixed(1) + ' L' + x2.toFixed(1) + ' ' + y2.toFixed(1));
    }
}

// ЕДИНСТВЕННЫЙ старый писатель позиции (аварийный путь ?scene=1).
// Весь остальной код обязан писать позиции только через scenePublish().
function legacyPose(el, x, y, ang, opts) {
    opts = opts || {};
    const cid = el.dataset.sid || el.title || '';
    if (cid) {
        const capped = capSpeed('L:' + cid, { x: x, y: y });
        x = capped.x; y = capped.y;
    }
    if (canvasMode()) {
        try {
            const sid = el.dataset.sid || ('el-' + (el._pid || (el._pid = ++window.__pidSeq || 1)));
            const art = (el.style.backgroundImage || '').match(/ships\/vol\/([a-z_]+)\.png/);
            window.__poseExtra.set(sid, {
                x: x, y: y, ang: ang, opacity: opts.opacity,
                art: art ? art[1] : 'ion_courier',
                px: parseFloat(el.dataset.ms) || parseFloat(el.style.width) || 8,
                side: el.dataset.side || ''
            });
        } catch (e) { }
        return;
    }
    el.style.left = x.toFixed(1) + 'px';
    el.style.top = y.toFixed(1) + 'px';
    var shift = opts.shiftY ? ' translate(0,' + opts.shiftY + 'px)' : '';
    var scale = opts.scale ? ' scale(' + opts.scale + ')' : '';
    el.style.transform = 'translate(-50%,-50%)' + shift + scale +
        (opts.standUp ? standUp() : '') +
        (ang === undefined || ang === null ? '' : ' rotate(' + ang.toFixed(1) + 'deg)');
    if (opts.opacity !== undefined) el.style.opacity = String(opts.opacity);
}

// Отдать позу новому слою. Возвращает true, если позицию пишет scene.js
// и старые записи делать НЕ нужно.
// Кэш поз для canvas-рендера (?render=canvas)
window.__poseCache = window.__poseCache || new Map();
window.__poseExtra = window.__poseExtra || new Map();   // позы из аварийного пути

function canvasMode() {
    return document.body.classList.contains('render-canvas');
}

// ОБЩИЙ ОГРАНИЧИТЕЛЬ СКОРОСТИ ДЛЯ ВСЕХ СЛОЁВ:
// ни один борт не должен смещаться быстрее 1 px за 45 игровых секунд.
// Порог мягкий (×2.2) — на разгон/торможение smoothstep, но телепорты режет.
// страховка только от телепортов: 12 px за 45 игровых секунд
// (≈0,7 c) — физика классов (0,1–0,3 c) под ограничитель больше не попадает
const SPEED_CAP_PX_PER_GS = 12 / 45;
window.__pubLast = window.__pubLast || new Map();

function capSpeed(id, pose) {
    if (!pose || !isFinite(pose.x) || !isFinite(pose.y)) return pose;
    const prev = window.__pubLast.get(id);
    if (prev && isFinite(simulatedTime)) {
        const dtGs = Math.max(0, (simulatedTime - prev.t) / 1000);
        const maxStep = dtGs * SPEED_CAP_PX_PER_GS;
        const dx = pose.x - prev.x, dy = pose.y - prev.y;
        const d = Math.hypot(dx, dy);
        if (dtGs > 0 && maxStep > 0 && d > maxStep) {
            const k = maxStep / d;
            pose.x = prev.x + dx * k;
            pose.y = prev.y + dy * k;
            window.__capped = (window.__capped || 0) + 1;
        }
    }
    window.__pubLast.set(id, { x: pose.x, y: pose.y, t: simulatedTime });
    return pose;
}

function scenePublish(id, el, pose) {
    pose = capSpeed(id, pose);
    if (canvasMode()) {
        // ВАЖНО: не вызываем SceneBridge — он пишет style.transform.
        // Поза уходит только в кэш, рисует canvas.
        try {
            const art = (el.style.backgroundImage || '').match(/ships\/vol\/([a-z_]+)\.png/);
            window.__poseCache.set(id, {
                x: pose.x, y: pose.y, ang: pose.ang, opacity: pose.opacity,
                art: art ? art[1] : 'ion_courier',
                px: parseFloat(el.dataset.ms) || 8,
                side: el.dataset.side || ''
            });
        } catch (e) { }
        return true;
    }
    try {
        const art = (el.style.backgroundImage || '').match(/ships\/vol\/([a-z_]+)\.png/);
        window.__poseCache.set(id, {
            x: pose.x, y: pose.y, ang: pose.ang, opacity: pose.opacity,
            art: art ? art[1] : 'ion_courier',
            px: parseFloat(el.dataset.ms) || 8,
            side: el.dataset.side || ''
        });
    } catch (e) { }
    if (!window.SceneBridge || !window.SceneBridge.on()) return false;
    window.SceneBridge.watch(id, el, 12);
    window.SceneBridge.publish(id, pose);
    return true;
}

function civilId(it) {
    if (!it.bridgeId) {
        it.bridgeId = (it.el && it.el.dataset && it.el.dataset.sid) ||
            ('civil-' + (it.el && it.el._idx !== undefined ? it.el._idx : Math.random().toString(36).slice(2, 7)));
    }
    return it.bridgeId;
}

// Стабильные идентификаторы всем гражданским маркерам — нужны и мосту,
// и замерам (в старом пути их раньше не было вовсе).
function stampCivilSids() {
    civilItems.forEach(function (it, i) {
        if (it.el && !it.el.dataset.sid) it.el.dataset.sid = 'civil-' + i;
    });
}

function updateCivilTraffic() {
    alignAllLayers();
    if (!civilItems.length) { buildCivilTraffic(); return; }
    const scene2 = document.querySelector('.solar-system');
    if (scene2 && civilLayer && civilLayer.parentNode !== scene2) {
        scene2.appendChild(civilLayer);
    }
    const t = simulatedTime / 1000;                      // игровые секунды
    // Индекс планеты мог устареть после пересборки planetNodes — тогда борт
    // «отклеивался» и висел в стороне. Привязываем по названию из подписи.
    const PID_BY_NAME = { 'Земля': 'earth', 'Марс': 'mars', 'Юпитер': 'jupiter', 'Сатурн': 'saturn' };
    stampCivilSids();
    for (const it of civilItems) {
        // локальная торговля луна-планета идёт ЛИФТОМ, а не кораблями
        if (it.kind === 'lunar') { if (it.el) it.el.style.display = 'none'; continue; }
        const label = (it.el && it.el.title) || '';
        for (const nm in PID_BY_NAME) {
            if (label.indexOf(nm) >= 0) {
                const idx = planetNodes.findIndex(n => (n.id || '') === PID_BY_NAME[nm]);
                if (idx >= 0) it.planetIndex = idx;
                break;
            }
        }
        let cx = 0, cy = 0;
        if (it.kind === 'platform') {
            const n = planetNodes[it.planetIndex];
            if (!n) continue;
            let baseX = 0, baseY = 0;
            if (n.x !== undefined) { baseX = n.x; baseY = n.y; }
            else {
                const days0 = (simulatedTime - EPOCH_MS) / DAY_MS;
                const a0 = ((n.epoch || 0) + (days0 / (n.period || 365)) * 360) * Math.PI / 180;
                baseX = Math.cos(a0) * (n.radius || 200);
                baseY = Math.sin(a0) * (n.radius || 200);
            }
            const ang = it.phase + (simulatedTime / 1000 / 2400) * Math.PI * 2 * it.speed;
            // радиус платформы жёстко ограничен: иначе она уезжает «в пустоту»
            const pr = Math.min(34, Math.max(12, it.radius || 20));
            const px0 = baseX + Math.cos(ang) * pr;
            const py0 = baseY + Math.sin(ang) * pr;
            if (!scenePublish(civilId(it), it.el, { x: px0, y: py0, ang: ang * 180 / Math.PI + 90 })) {
                legacyPose(it.el, px0, py0, ang * 180 / Math.PI + 90);
            }
            continue;
        }
        if (it.kind === 'lunar') {
            const n = planetNodes[it.planetIndex];
            if (!n) continue;
            let baseX = 0, baseY = 0;
            if (n.x !== undefined) { baseX = n.x; baseY = n.y; }
            else {
                const days0 = (simulatedTime - EPOCH_MS) / DAY_MS;
                const a0 = ((n.epoch || 0) + (days0 / (n.period || 365)) * 360) * Math.PI / 180;
                baseX = Math.cos(a0) * (n.radius || 200);
                baseY = Math.sin(a0) * (n.radius || 200);
            }
            // позиция луны
            let mx = 0, my = 0;
            const mn = moonNodes.find(m => {
                const el2 = m.moon;
                const nm = el2 && (el2.getAttribute('data-moon') || (el2.textContent || '').trim());
                return nm && nm.indexOf(it.moonName) >= 0;
            });
            if (mn) {
                const days = (simulatedTime - EPOCH_MS) / DAY_MS;
                const a1 = ((mn.epoch || 0) + (days / (mn.period || 27)) * 360) * Math.PI / 180;
                mx = Math.cos(a1) * (mn.radius || 30);
                my = Math.sin(a1) * (mn.radius || 30);
            }
            // пинг-понг: 0 — планета, 1 — луна
            const tt = (simulatedTime / 1000 / 900 * it.speed + it.phase) % 2;
            let f = tt < 1 ? tt : 2 - tt;
            // не заходить в диск луны и планеты: 15% пути — стоянка на орбите
            f = 0.15 + f * 0.70;
            cx = baseX + (baseX + mx - baseX) * f;
            cy = baseY + (baseY + my - baseY) * f;
            const dirAngle = Math.atan2(my, mx) * 180 / Math.PI + (tt < 1 ? 90 : -90);
            if (!scenePublish(civilId(it), it.el, { x: cx, y: cy, ang: dirAngle })) {
                legacyPose(it.el, cx, cy, dirAngle);
            }
            continue;
        }
        if (it.kind === 'pirate') {
            // Законченный цикл пирата: набег (грабёж) -> домой с добычей -> пир.
            // Цикл: набег -> домой с добычей -> пир (выставляет лот на рынок)
            // -> доставка проданного лота покупателю.
            const RAID = 700, HOME = 380, FEAST = 260, DELIVER = 420;
            const CYCLE = RAID + HOME + FEAST + DELIVER;
            const tm = ((simulatedTime / 1000) + (it.phase || 0) * 500) % CYCLE;
            const LOOT = ['артефакт «Клинок Ро»', 'контейнер чипов', 'ящик редкозёма', 'капсула с данными'];
            const cycleNo = Math.floor(((simulatedTime / 1000) + (it.phase || 0) * 500) / CYCLE);
            const base = planetPoint('jupiter');
            if (!base) continue;
            const d = Math.hypot(base.x, base.y) || 1;
            const homeP = { x: base.x + (base.x / d) * 26, y: base.y + (base.y / d) * 26 };
            const targets = ['earth', 'mars', 'saturn'];
            const victim = planetPoint(targets[(it.idx || 0) % targets.length]);
            let px = homeP.x, py = homeP.y, heading = 0, carrying = false, feast = false, delivering = false;
            if (victim && tm < RAID) {
                // набег: крадётся у жертвы по малой орбите
                const a = (simulatedTime / 1000 / 300 + (it.phase || 0)) * Math.PI * 2;
                const r = 22 + (it.idx || 0) * 4;
                px = victim.x + Math.cos(a) * r;
                py = victim.y + Math.sin(a) * r;
                heading = a * 180 / Math.PI + 90;
            } else if (tm < RAID + HOME) {
                // домой с добычей: линия маршрута видна
                carrying = true;
                const k = Math.min(1, (tm - RAID) / HOME);
                const e = k * k * (3 - 2 * k);
                const from = victim || homeP;
                px = from.x + (homeP.x - from.x) * e;
                py = from.y + (homeP.y - from.y) * e;
                heading = Math.atan2(homeP.y - from.y, homeP.x - from.x) * 180 / Math.PI + 90;
            } else if (tm < RAID + HOME + FEAST) {
                // ПИР: пират выставляет награбленное на рынок
                feast = true;
                if (it.listedCycle !== cycleNo) {
                    it.listedCycle = cycleNo;
                    it.loot = LOOT[(cycleNo + (it.idx || 0)) % LOOT.length];
                    it.listed = true;
                    it.sold = ((cycleNo + (it.idx || 0)) % 2) === 0;   // половина лотов уходит
                    if (typeof notify === 'function') {
                        notify('🏴‍☠️ Пират выставил на рынок: ' + it.loot);
                    }
                    if (it.sold && typeof notify === 'function') {
                        setTimeout(function () {
                            notify('📦 Лот пирата куплен: ' + it.loot + ' — идёт доставка');
                        }, 400);
                    }
                }
            } else {
                // ДОСТАВКА проданного лота: от базы пирата к покупателю
                delivering = true;
                const buyerId = (it.idx || 0) % 2 === 0 ? 'earth' : 'mars';
                const buyer = planetPoint(buyerId);
                if (buyer) {
                    const k = Math.min(1, (tm - RAID - HOME - FEAST) / DELIVER);
                    const e = k * k * (3 - 2 * k);
                    px = homeP.x + (buyer.x - homeP.x) * e;
                    py = homeP.y + (buyer.y - homeP.y) * e;
                    heading = Math.atan2(buyer.y - homeP.y, buyer.x - homeP.x) * 180 / Math.PI + 90;
                    it.deliverTo = buyerId;
                }
            }
            if (!it.routeEl) {
                if (!window.__pirateSvg) {
                    const scene = document.querySelector('.solar-system');
                    if (scene) {
                        window.__pirateSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                        window.__pirateSvg.setAttribute('class', 'pirate-routes');
                        window.__pirateSvg.setAttribute('width', '1');
                        window.__pirateSvg.setAttribute('height', '1');
                        window.__pirateSvg.setAttribute('overflow', 'visible');
                        window.__pirateSvg.style.cssText = 'position:absolute;left:0;top:0;overflow:visible;pointer-events:none;z-index:1;';
                        scene.appendChild(window.__pirateSvg);
                    }
                }
                if (window.__pirateSvg) {
                    it.routeEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                    it.routeEl.setAttribute('class', 'pirate-route');
                    it.routeEl.setAttribute('fill', 'none');
                    it.routeEl.setAttribute('stroke', 'rgba(255, 120, 120, 0.55)');
                    it.routeEl.setAttribute('stroke-width', '1');
                    it.routeEl.setAttribute('stroke-dasharray', '3 6');
                    window.__pirateSvg.appendChild(it.routeEl);
                }
            }
            if (it.routeEl) {
                if (carrying && victim) {
                    it.routeEl.style.display = '';
                    it.routeEl.setAttribute('d', 'M' + victim.x.toFixed(1) + ' ' + victim.y.toFixed(1) +
                        ' L' + homeP.x.toFixed(1) + ' ' + homeP.y.toFixed(1));
                    it.routeEl.setAttribute('stroke', 'rgba(255, 120, 120, 0.55)');
                } else if (delivering) {
                    const buyer = planetPoint(it.deliverTo || 'earth');
                    if (buyer) {
                        it.routeEl.style.display = '';
                        it.routeEl.setAttribute('d', 'M' + homeP.x.toFixed(1) + ' ' + homeP.y.toFixed(1) +
                            ' L' + buyer.x.toFixed(1) + ' ' + buyer.y.toFixed(1));
                        it.routeEl.setAttribute('stroke', 'rgba(255, 209, 102, 0.7)');
                    }
                } else {
                    it.routeEl.style.display = 'none';
                }
            }
            if (!scenePublish(civilId(it), it.el, { x: px, y: py, ang: heading })) {
                legacyPose(it.el, px, py, heading);
            }
            it.el.dataset.carrying = carrying ? '1' : '0';
            it.el.dataset.feast = feast ? '1' : '0';
            it.el.dataset.delivering = delivering ? '1' : '0';
            if (it.loot) it.el.dataset.loot = it.loot;
            it.el.title = 'пират' + (it.loot ? ' · ' + it.loot : '') +
                (delivering ? ' · доставка на ' + (it.deliverTo || '') : '');
            continue;
        }
        if (it.kind === 'belt') {
            // Цикл: добыча на поясе -> рейс с грузом к планете -> разгрузка -> обратно.
            // Линия маршрута появляется ТОЛЬКО когда борт везёт ресурс.
            const MINE = 800;
            // Рейс не быстрее 1 px за 45 игровых секунд: FLY считается от расстояния,
            // иначе борт пролетал ~270 px за 420 с (29 px/45с) — пояс «летал» в 30 раз быстрее.
            const dest0 = it.destId || 'earth';
            const P0 = planetPoint(dest0);
            const beltP0 = { x: Math.cos((simulatedTime / 1000 / (it.beltPeriod || 60000) + (it.phase || 0)) * Math.PI * 2) * it.radius,
                             y: Math.sin((simulatedTime / 1000 / (it.beltPeriod || 60000) + (it.phase || 0)) * Math.PI * 2) * it.radius };
            const distPx0 = P0 ? Math.hypot(P0.x - beltP0.x, P0.y - beltP0.y) : 0;
            // ФИЗИКА: время рейса = кинематика грузового класса
            const beltKm = distPx0 * 808649;
            const FLY = (window.Motion && window.Motion.kinSec)
                ? Math.max(60, Math.round(window.Motion.kinSec(beltKm, 'hauler')))
                : Math.max(420, Math.round(distPx0 * 45 / 60) * 60);
            const CYCLE = MINE + FLY + 600;
            const tm = ((simulatedTime / 1000) + (it.phase || 0) * 300) % CYCLE;
            // период обхода пояса — из правила «не быстрее 1 px за 45 с»:
            // 2πR / (1/45) = 2πR·45 секунд. Было 2400 с → 2,14 c.
            const beltPeriod = Math.max(2400, 2 * Math.PI * Math.abs(it.radius || 200) * 45);
            const a = (simulatedTime / 1000 / beltPeriod + (it.phase || 0)) * Math.PI * 2;
            const beltP = { x: Math.cos(a) * it.radius, y: Math.sin(a) * it.radius };
            const destId = it.destId || (it.targetId = it.targetId || (Math.random() < 0.5 ? 'earth' : 'mars'));
            const P = planetPoint(destId);
            let bx = beltP.x, by = beltP.y, heading = 0, carrying = false, unloading = false;
            if (P && tm >= MINE && tm < MINE + FLY) {
                carrying = true;
                const k = Math.min(1, (tm - MINE) / FLY);
                const e = k * k * (3 - 2 * k);
                const tx = P.x - (P.x / (Math.hypot(P.x, P.y) || 1)) * 12;
                const ty = P.y - (P.y / (Math.hypot(P.x, P.y) || 1)) * 12;
                bx = beltP.x + (tx - beltP.x) * e;
                by = beltP.y + (ty - beltP.y) * e;
                heading = Math.atan2(ty - beltP.y, tx - beltP.x) * 180 / Math.PI + 90;
            } else if (P && tm >= MINE + FLY) {
                // разгрузка у планеты: линия уже не нужна
                unloading = true;
                const d = Math.hypot(P.x, P.y) || 1;
                bx = P.x - (P.x / d) * 12;
                by = P.y - (P.y / d) * 12;
            }
            // путь
            if (!it.routeSvg) {
                const scene = document.querySelector('.solar-system');
                if (scene && !window.__beltRouteSvg) {
                    window.__beltRouteSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                    window.__beltRouteSvg.setAttribute('class', 'belt-routes');
                    window.__beltRouteSvg.setAttribute('width', '1');
                    window.__beltRouteSvg.setAttribute('height', '1');
                    window.__beltRouteSvg.setAttribute('overflow', 'visible');
                    window.__beltRouteSvg.style.cssText = 'position:absolute;left:0;top:0;overflow:visible;pointer-events:none;z-index:1;';
                    scene.appendChild(window.__beltRouteSvg);
                }
                it.routeSvg = window.__beltRouteSvg || null;
                if (it.routeSvg) {
                    it.routeEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                    it.routeEl.setAttribute('class', 'belt-route');
                    it.routeEl.setAttribute('fill', 'none');
                    it.routeEl.setAttribute('stroke', 'rgba(255, 209, 102, 0.5)');
                    it.routeEl.setAttribute('stroke-width', '1');
                    it.routeEl.setAttribute('stroke-dasharray', '4 6');
                    it.routeSvg.appendChild(it.routeEl);
                }
            }
            if (it.routeEl) {
                if (carrying && P) {
                    it.routeEl.style.display = '';
                    it.routeEl.setAttribute('d', 'M' + beltP.x.toFixed(1) + ' ' + beltP.y.toFixed(1) +
                        ' L' + P.x.toFixed(1) + ' ' + P.y.toFixed(1));
                } else {
                    it.routeEl.style.display = 'none';
                }
            }
            if (!scenePublish(civilId(it), it.el, { x: bx, y: by, ang: heading })) {
                legacyPose(it.el, bx, by, heading);
            }
            it.el.dataset.carrying = carrying ? '1' : '0';
            it.el.dataset.unloading = unloading ? '1' : '0';
            continue;
        }
        if (it.kind === 'gas') {
            const n = planetNodes[it.planetIndex];
            if (!n) continue;
            // позиция планеты
            let baseX = 0, baseY = 0;
            if (n.x !== undefined) { baseX = n.x; baseY = n.y; }
            else {
                const days0 = (simulatedTime - EPOCH_MS) / DAY_MS;
                const a0 = ((n.epoch || 0) + (days0 / (n.period || 365)) * 360) * Math.PI / 180;
                baseX = Math.cos(a0) * (n.radius || 200);
                baseY = Math.sin(a0) * (n.radius || 200);
            }
            // позиция луны относительно планеты — из её орбиты
            const mn = moonNodes.filter(m => {
                const el = m.moon;
                const nm = el && (el.getAttribute('data-moon') || (el.textContent || '').trim());
                return nm && it.moonName && nm.indexOf(it.moonName.split(' ')[0]) >= 0;
            }).find(m => {
                const host = m.moon && m.moon.closest && m.moon.closest('.planet');
                return !host || !n.planet || host === n.planet;
            });
            let mx = 0, my = 0;
            if (mn) {
                const days = (simulatedTime - EPOCH_MS) / DAY_MS;
                const a1 = ((mn.epoch || 0) + (days / (mn.period || 27)) * 360) * Math.PI / 180;
                mx = Math.cos(a1) * (mn.radius || 30);
                my = Math.sin(a1) * (mn.radius || 30);
            }
            cx = baseX + mx; cy = baseY + my;
        } else if (it.kind === 'colony') {
            const n = planetNodes[it.planetIndex];
            if (!n) continue;
            if (n.x !== undefined) {
                cx = n.x; cy = n.y;
            } else {
                // углы ещё не посчитаны — берём угол из периода планеты
                const days = (simulatedTime - EPOCH_MS) / DAY_MS;
                const a0 = ((n.epoch || 0) + (days / (n.period || 365)) * 360) * Math.PI / 180;
                cx = Math.cos(a0) * (n.radius || 200);
                cy = Math.sin(a0) * (n.radius || 200);
            }
        }
        const ang = it.phase + (t / CIVIL_PERIOD_GAME_S) * Math.PI * 2 * it.speed;
        const px = cx + Math.cos(ang) * it.radius;
        const py = cy + Math.sin(ang) * it.radius;
        const heading = ang * 180 / Math.PI + 90;
        // страховка: гражданские борта тоже не должны «улетать» за систему
        if (Math.hypot(px, py) > maxOrbitRadius * 1.05) {
            it.el.style.display = 'none';
        } else {
            it.el.style.display = '';
        }
        if (!scenePublish(civilId(it), it.el, { x: px, y: py, ang: heading })) {
            legacyPose(it.el, px, py, heading);
        }
        // видимость — отдельное правило, одинаковое для обоих слоёв
        it.el.style.display = (Math.hypot(px, py) > maxOrbitRadius * 1.05) ? 'none' : '';
    }
}

function buildFleetDots() {
    if (fleetLayer) return;
    const host = document.querySelector('.solar-system') || document.querySelector('.system-view') || document.body;
    fleetLayer = document.createElement('div');
    fleetLayer.id = 'fleet-dots';
    fleetLayer.className = 'fleet-dots';
    host.appendChild(fleetLayer);
}

// Легенда: кто из треугольников кто и сколько их.
let fleetRouteLayer = null;
function buildFleetRouteLayer() {
    const host = document.querySelector('.solar-system') || document.querySelector('.system-view');
    if (!host || !fleetsModule) return;
    const R = maxOrbitRadius;
    const routes = fleetsModule.routeLines();
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'fleet-routes');
    svg.setAttribute('width', String(R * 2.4));
    svg.setAttribute('height', String(R * 2.4));
    svg.setAttribute('viewBox', `${-R * 1.2} ${-R * 1.2} ${R * 2.4} ${R * 2.4}`);
    svg.style.cssText = 'position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);pointer-events:none;z-index:1';
    routes.forEach(r => {
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        const d = r.pts.map((pt, i) => {
            const x = (pt[0] - 0.5) * 2 * R;
            const y = (pt[1] - 0.5) * 2 * R;
            return (i === 0 ? 'M ' : 'L ') + x.toFixed(1) + ' ' + y.toFixed(1);
        }).join(' ');
        path.setAttribute('d', d);
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', 'rgba(127,227,255,0.16)');
        path.setAttribute('stroke-width', '1');
        path.setAttribute('stroke-dasharray', '3 7');
        svg.appendChild(path);
    });
    host.appendChild(svg);
    fleetRouteLayer = svg;
}

function ensureFleetLegend() {
    let box = document.getElementById('fleet-legend');
    if (box) return box;
    const host = document.querySelector('.control-panel') || document.body;
    box = document.createElement('div');
    box.id = 'fleet-legend';
    box.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:9000;padding:8px 10px;' +
        'background:rgba(8,14,24,.88);border:1px solid #1e3a5f;border-radius:10px;' +
        'color:#dce8f7;font:12px Inter,system-ui,sans-serif;line-height:1.5;pointer-events:none';
    host.appendChild(box);
    return box;
}

// Карточка борта по клику: те же данные, что в подсказке, но крупно и с фазами.
function openFleetCard(d) {
    const old = document.getElementById('fleet-card');
    if (old) old.remove();
    const card = document.createElement('div');
    card.id = 'fleet-card';
    card.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:12500;width:300px;padding:14px 16px;' +
        'background:rgba(9,16,26,.97);border:1px solid #2b4a6e;border-radius:14px;color:#dce8f7;' +
        'font:13px/1.5 Inter,system-ui,sans-serif;box-shadow:0 10px 30px #000a';
    const hours = d.hours || 0;
    const eta = hours >= 24 ? (hours / 24).toFixed(1) + ' сут' : hours.toFixed(1) + ' ч';
    const ph = d.phases || {};
    const fmt = (sec) => sec >= 3600 ? (sec / 3600).toFixed(1) + ' ч' : Math.round(sec / 60) + ' мин';
    card.innerHTML =
        '<div style="display:flex;justify-content:space-between;align-items:center">' +
        '<b style="color:' + (d.color || '#7fe3a8') + ';font-size:15px">' + (d.kind || 'борт') + '</b>' +
        '<button id="fc-close" style="border:none;border-radius:7px;padding:3px 9px;background:#2b3238;color:#e6eaed;cursor:pointer">✕</button></div>' +
        '<div style="opacity:.8;margin-top:6px">' + (d.label || '') + '</div>' +
        '<div style="margin-top:8px;font-size:12.5px;opacity:.85">' +
        '<div>расстояние: <b>' + ((d.distKm || 0) / 1e6).toFixed(0) + ' млн км</b></div>' +
        '<div>время рейса: <b>' + eta + '</b>' + (d.fuel ? ' · топливо <b>' + d.fuel + ' т</b>' : '') + '</div>' +
        (ph.accel ? '<div>фазы: разгон ' + fmt(ph.accel) + ' · марш ' + fmt(ph.coast) + ' · торможение ' + fmt(ph.brake) + '</div>' : '') +
        (d.inBattle ? '<div style="color:#ffd479">идёт бой</div>' : '') +
        '</div>';
    document.body.appendChild(card);
    document.getElementById('fc-close').onclick = () => card.remove();
}

// Всплывающая подсказка: нативный title появляется через секунду и без деталей.
function ensureFleetTip() {
    let tip = document.getElementById('fleet-tip');
    if (tip) return tip;
    tip = document.createElement('div');
    tip.id = 'fleet-tip';
    tip.style.cssText = 'position:fixed;z-index:12000;display:none;max-width:280px;padding:8px 10px;' +
        'background:rgba(8,14,24,.96);border:1px solid #2b4a6e;border-radius:9px;color:#dce8f7;' +
        'font:12px Inter,system-ui,sans-serif;pointer-events:none;box-shadow:0 6px 18px #0008';
    document.body.appendChild(tip);
    return tip;
}

function updateFleetDots() {
    // Старые маркеры флотов рисовались в нормализованных координатах и висели
    // вне системы. Теперь торговцев ведёт updateTradeTraffic по планетам.
    document.querySelectorAll('#fleet-dots .ship-marker').forEach(el => el.remove());
    return;
    // eslint-disable-next-line no-unreachable
    if (!fleetsModule) {
        import('/js/fleets.js?v=12').then(m => { fleetsModule = m; m.init(); buildFleetDots(); }).catch(e => console.warn('fleets:', e));
        return;
    }
    if (!fleetLayer) buildFleetDots();
    if (!fleetLayer) return;

    // Позиция бортов считается от ИГРОВОГО времени: simulatedTime уже идёт
    // с множителем timeScale, поэтому второй раз масштаб не применяем.
    // Рейс длится столько, сколько нужно физике: путь / скорость борта.
    const pos = fleetsModule.positions(simulatedTime, 1);
    const W = fleetLayer.clientWidth || window.innerWidth;
    const H = fleetLayer.clientHeight || window.innerHeight;
    const cx = W * 0.5, cy = H * 0.52;
    const R = Math.min(W, H) * 0.42;

    while (fleetDots.length < pos.length) {
        const el = document.createElement('div');
        el.className = 'ship-marker';
        fleetLayer.appendChild(el);
        fleetDots.push(el);
    }
    const legend = ensureFleetLegend();
    if (legend) {
        let trade = 0, pirate = 0, battle = 0;
        for (let k = 0; k < pos.length; k++) {
            const q = pos[k];
            if (!q || !q.inFlight) continue;
            if (q.side === 'pirate') pirate++; else trade++;
            if (q.inBattle) battle++;
        }
        legend.innerHTML = '<b style="color:#8fd6ff">Флот на карте</b><br>' +
            '<span style="color:#9fb2c6">▲</span> всего бортов: <b>' + (trade + pirate) + '</b><br>' +
            '<span style="opacity:.75">торговцы ' + trade + ' · пираты ' + pirate +
            (battle ? ' · в бою ' + battle : '') + '</span><br>' +
            '<span style="opacity:.6">наведите на маркер — тип, маршрут и время</span>';
    }

    // тонкие линии маршрутов: борт видно на своей трассе, а не «в пустоте»
    if (fleetsModule && typeof fleetsModule.routeLines === 'function' && !fleetRouteLayer) {
        buildFleetRouteLayer();
    }

    for (let i = 0; i < fleetDots.length; i++) {
        const el = fleetDots[i];
        const s = pos[i];
        if (!s) { el.style.display = 'none'; continue; }
        el.style.display = s.inFlight ? 'block' : 'none';

        const px = cx + (s.x - 0.5) * 2 * R;
        const py = cy + (s.y - 0.5) * 2 * R;

        // курс: треугольник должен смотреть туда, куда летит борт, а не вверх
        const prevX = parseFloat(el.dataset.px || px);
        const prevY = parseFloat(el.dataset.py || py);
        let heading = parseFloat(el.dataset.hdg || 0);
        const dx = px - prevX, dy = py - prevY;
        if (Math.hypot(dx, dy) > 0.3) {
            // треугольник нарисован «носом вверх» → +90°
            heading = Math.atan2(dy, dx) * 180 / Math.PI + 90;
            // курс меняется плавно, иначе борт «дёргается» на разворотах
            const prevH = parseFloat(el.dataset.hdg || heading);
            let delta = ((heading - prevH + 540) % 360) - 180;
            heading = prevH + delta * 0.35;
            el.dataset.hdg = heading;
        }
        // подсказка и данные для карточки
        el._fleet = s;
        if (!el._tipBound) {
            el._tipBound = true;
            el.addEventListener('pointerenter', function (ev) {
                const tip = ensureFleetTip();
                const d = el._fleet || {};
                const hours = d.hours || 0;
                const eta = hours >= 24 ? (hours / 24).toFixed(0) + ' сут' : hours.toFixed(1) + ' ч';
                tip.innerHTML = '<b style="color:' + (d.color || '#7fe3a8') + '">' +
                    (d.kind || 'борт') + '</b><br>' +
                    '<span style="opacity:.8">' + (d.label || '') + '</span><br>' +
                    '<span style="opacity:.65">в пути: ' + eta + (d.inBattle ? ' · бой' : '') + '</span>';
                tip.style.display = 'block';
            });
            el.addEventListener('pointermove', function (ev) {
                const tip = ensureFleetTip();
                tip.style.left = Math.min(window.innerWidth - 300, ev.clientX + 14) + 'px';
                tip.style.top = Math.max(8, ev.clientY - 70) + 'px';
            });
            el.addEventListener('click', function () {
                if (el._fleet) openFleetCard(el._fleet);
            });
            el.addEventListener('pointerleave', function () {
                const tip = document.getElementById('fleet-tip');
                if (tip) tip.style.display = 'none';
            });
        }

        el.dataset.px = px;
        el.dataset.py = py;

        const sid2 = el.dataset.sid || ('entity-' + px + '-' + py);
        if (!scenePublish(sid2, el, { x: px, y: py, ang: heading })) {
            legacyPose(el, px, py, heading);
        }
        // спрайт корабля: у каждого борта своя модель, как в каталоге
        // Текстура корабля из каталога: класс подобран по длине маршрута.
        // Нос спрайта смотрит вверх, поэтому курс = atan2 + 90°.
        const art = s.art || 'jet_scout';
        if (el.dataset.art !== art) {
            el.dataset.art = art;
            el.style.backgroundImage = 'url(' + shipArtUrl(art) + ')';
        }
        // цвет не меняем: все борта выглядят одинаково, роль — в подсказке
        el.dataset.side = s.side;
        el.title = s.label || s.kind;
    }
}

let logicAccum = 0;   // накопитель времени для «медленной» логики

function animate() {
    const now = performance.now();
    let realDelta = now - lastRealTime;
    lastRealTime = now;
    if (realDelta > 250) realDelta = 250;   // вкладка была свёрнута — не прыгаем на часы вперёд
    if (window.Motion) window.Motion.setScale(timeScale || 1);
    // РЕЖИМ КАДРА: время жёстко фиксировано, иначе любой кадр «уезжает»
    // и сравнивать скриншоты бессмысленно (проверено: расхождение 200 px).
    if (window.__freezeAt) {
        simulatedTime = window.__freezeAt;
        realDelta = 0;              // тики не должны копить время в тестовом кадре
    } else if (!document.hidden) {
        simulatedTime += realDelta * timeScale;
    }

    if (solarVisible) {
        const currentDays = (simulatedTime - EPOCH_MS) / DAY_MS;
        // Каждый кадр: только то, что двигается на экране.
        calculateAngles(currentDays);
        updateTraffic(realDelta);
        updateFleetDots();
        updateTradeTraffic(); updatePortalTraffic(); updateFleetTraffic(); updateFleetRoutes(); updateShipsUnified();
        updateCivilTraffic();
        updateElevators();
        // Тяжёлая логика (стройка, цены, бои, экономика) — 4 раза в секунду:
        // на глаз это незаметно, а кадры освобождаются.
        logicAccum += realDelta;
        const runLogic = logicAccum >= 250;
        if (runLogic) {
            const dt = logicAccum;
            logicAccum = 0;
            tickFactories(dt);
            tickBuilds();
            tickPrices(dt);
            tickTrips();
            tickCombat(dt);
            tickPirateEconomy(dt);
            checkCoalition();
        }
        // население растёт по игровому времени: 30 суток = 1/12 года
        popYearAccum += realDelta * (typeof timeScale === 'number' ? timeScale : 1);
        while (popYearAccum >= 30 * 86400000 / 1000) {
            popYearAccum -= 30 * 86400000 / 1000;
            tickPopulation(1 / 12);
            tickFleetFuel(30);
            tickRepairs(30);
            tickHiring();
            tickConsumption(30);
        }
        if (runLogic) {
            tickNpcs(realDelta);
            drawAsteroids(currentDays);
        }
        updateSimClock(now);
    }
    // Замер производительности: ?perf=1 пишет средний FPS в заголовок
    if (window.__perfOn === undefined) {
        try { window.__perfOn = new URLSearchParams(location.search).has('perf'); } catch (e) { window.__perfOn = false; }
    }
    if (window.__perfOn) {
        window.__perfFrames = (window.__perfFrames || 0) + 1;
        window.__perfSum = (window.__perfSum || 0) + realDelta;
        if (window.__perfFrames === 180) {
            const avg = window.__perfSum / window.__perfFrames;
            document.title = 'PERF fps=' + (1000 / avg).toFixed(1) + ' кадр=' + avg.toFixed(1) + 'мс';
        }
    }
    perfTick(realDelta);
    requestAnimationFrame(animate);
}

// === ИНИЦИАЛИЗАЦИЯ ===
// ── РЕЖИМ ТЕХНИЧЕСКИХ РАБОТ ──────────────────────────────────────────────
// Пока картинка движения не отлажена, игроки не играют. Вход для отладки:
//   ?dev=1  — открывает сцену (только для разработки)
const MAINTENANCE = false;   // техработы завершены — игра открыта для всех
// Проверка доступа: админ играет, остальные видят заглушку.
function applyMaintenanceGate() {
    if (!MAINTENANCE) return false;
    const isAdmin = currentUser && currentUser.role === 'admin';
    if (isAdmin) {
        const m = document.getElementById('maintenance-screen');
        if (m) m.remove();
        const scene = document.querySelector('.solar-system');
        if (scene) scene.style.display = '';
        return false;
    }
    if (!document.getElementById('maintenance-screen')) showMaintenance();
    return true;
}

function showMaintenance() {
    const d = document.createElement('div');
    d.id = 'maintenance-screen';
    d.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;' +
        'justify-content:center;flex-direction:column;gap:14px;background:#05080f;' +
        'color:#cfe3ff;font-family:inherit;text-align:center;padding:32px';
    d.innerHTML = '<div style="font-size:22px;font-weight:600">Идут технические работы</div>' +
        '<div style="max-width:520px;line-height:1.5;color:#8fb4d8">Отлаживаем движение объектов на карте. ' +
        'Игра вернётся, как только картинка будет соответствовать физике.</div>' +
        '<div style="font-size:12px;color:#55708f">Спасибо за терпение</div>';
    document.body.appendChild(d);
    return d;
}

// СБРОС КЭША БЕЗ РУЧНЫХ ДЕЙСТВИЙ.
// Номер сборки хранится в localStorage: после деплоя страница один раз
// перезагружается сама — как будто закрыли и открыли браузер.
const APP_BUILD = (document.querySelector('meta[name="app-build"]') || {}).content || '';
if (APP_BUILD) {
    try {
        const prev = localStorage.getItem('galaktika_build');
        if (prev && prev !== APP_BUILD && !sessionStorage.getItem('galaktika_reloaded_' + APP_BUILD)) {
            sessionStorage.setItem('galaktika_reloaded_' + APP_BUILD, '1');
            localStorage.setItem('galaktika_build', APP_BUILD);
            location.reload();
        } else {
            localStorage.setItem('galaktika_build', APP_BUILD);
        }
    } catch (e) { }
}

document.addEventListener('DOMContentLoaded', () => {
    // ── Тестовый кадр: ставим заморозку ПЕРВОЙ строкой инициализации,
    //    иначе часть систем успевает прожить секунды и кадр уезжает.
    (function applyFreeze() {
        const fz = new URLSearchParams(location.search).get('freeze');
        if (fz === null || fz === '') return;
        const f = parseFloat(fz);
        if (!isFinite(f)) return;
        const base = (window.Motion && Motion.TABLES.time.epochMs) || EPOCH_MS;
        const rawOff = (typeof GAME_OFFSET_MS === 'number') ? GAME_OFFSET_MS : 0;
        window.__freezeAt = base + Math.floor(rawOff / 86400000) * 86400000 + f * 1000;
        simulatedTime = window.__freezeAt;
        timeScale = 0;
        if (window.Motion) window.Motion.setTime(window.__freezeAt);
    })();

    // техработы решаются по роли ниже, после загрузки профиля
    // ?zoom=1.6 — тестовый масштаб (для скриншотов и слайдшоу)
    (function applyZoomParam() {
        const z = new URLSearchParams(location.search).get('zoom');
        if (z === null) return;
        const v = parseFloat(z);
        if (!isFinite(v) || v <= 0) return;
        setTimeout(function () { if (typeof window.zoomAt === 'function') window.zoomAt(v, 0, 0); }, 1200);
    })();

    initStars(); drawStars();
    sizeBeltCanvas();
    if (!beltReady) generateAsteroids();
    currentSystem = resolveSystem(new URLSearchParams(window.location.search).get('system'));
    buildScene(currentSystem);
    buildSystemsUI();
    buildNpcUI();
    buildMarketUI();
    buildBuildingsUI();
    buildScienceUI();
    buildSurfaceUI();
    buildGuildUI();
    buildMapUI();
    setTimeout(regroupMenu, 900);
    maybeTutorial();
    setTimeout(addStationToggle, 1000);
    setTimeout(buildMonitorUI, 1100);
    setTimeout(() => {
        const items = document.getElementById('left-menu-items');
        if (items && !document.getElementById('enc-btn')) {
            const eb = document.createElement('button');
            eb.id = 'enc-btn'; eb.className = 'menu-btn'; eb.textContent = '📖 Энциклопедия';
            eb.addEventListener('click', () => window.openEncyclopedia('ships'));
            items.appendChild(eb);
            items.dataset.grouped = '0';
            regroupMenu();
            hideAdminButtons();
            hideDuplicateMenuButtons();
        }
    }, 1150);
    setTimeout(() => {
        const items = document.getElementById('left-menu-items');
        if (items && !document.getElementById('bm-btn')) {
            const b = document.createElement('button');
            b.id = 'bm-btn'; b.className = 'menu-btn'; b.textContent = '🕶 Чёрный рынок';
            b.addEventListener('click', window.openBlackMarket);
            items.appendChild(b);
            // кнопка появилась после раскладки — раскладываем меню заново
            items.dataset.grouped = '0';
            regroupMenu();
            hideAdminButtons();
            hideDuplicateMenuButtons();
        }
    }, 1200);
    setTimeout(() => { if (urlParams.get('open') === 'flight') window.openFlight(); }, 1200);
    // ?open=market|resources|build|fleet — открыть окно сразу (для скриншотов)
    setTimeout(() => {
        const which = urlParams.get('open');
        try {
            if (which === 'market' && typeof window.openMarket === 'function') window.openMarket();
            else if (which === 'resources' && typeof window.openResourcesPanel === 'function') window.openResourcesPanel();
            else if (which === 'build' && window.BuildPanel) window.BuildPanel.open();
            else if (which === 'fleet' && typeof window.openFleet === 'function') { window.openFleet(); if (urlParams.get('ship') && typeof window.renderHangar === 'function') window.renderHangar(urlParams.get('ship')); }
        } catch (e) { console.warn('open param:', e); }
    }, 2000);
    buildViewPanel();
    // убираем подпись Солнца из DOM: она рисовала тёмный прямоугольник
    function removeSunTooltip() {
        document.querySelectorAll('.sun .tooltip').forEach(t => t.remove());
    }
    removeSunTooltip();
    setTimeout(removeSunTooltip, 500);
    setTimeout(removeSunTooltip, 1500);
    // Тестовый режим панорамирования: ?press=down:5 — пять нажатий «вниз»
    (function applyPressParam() {
        const spec = new URLSearchParams(location.search).get('press');
        if (!spec) return;
        const parts = spec.split(':');
        const dir = parts[0], times = Math.max(1, Math.min(30, parseInt(parts[1] || '1', 10) || 1));
        let n = 0;
        const t = setInterval(() => {
            if (typeof window.moveView === 'function') window.moveView(dir);
            if (++n >= times) clearInterval(t);
        }, 120);
    })();

    // Тест клика по планете: ?click=earth откроет планетарный вид
    (function applyClickParam() {
        const id = new URLSearchParams(location.search).get('click');
        if (!id) return;
        setTimeout(() => {
            if (window.PlanetView && typeof window.PlanetView.open === 'function') {
                try {
                    window.PlanetView.open(id);
                    setTimeout(() => {
                        const cvs = document.querySelectorAll('canvas');
                        const bar = document.getElementById('pv-bar');
                        document.title = 'PV who=' + String(window.__pvClosedBy || '-').slice(0, 220).replace(/\n/g, ' | ') +
                            ' err=' + (window.__pvErr || '-') + ' bars=' +
                            document.querySelectorAll('#pv-bar').length + ' wrap=' +
                            document.querySelectorAll('#blocks3d-wrap').length + ' step=' + (window.__pvStep || '?');
                        window.__pvDiag = { step: window.__pvStep, err: window.__pvErr || '', bars: bar ? 1 : 0, canvases: cvs.length };
                        /* второй title не нужен */ document.title = document.title || 'PV step=' + (window.__pvStep || '?') +
                            ' blocks=' + (window.Blocks3D ? 'да' : 'нет') +
                            ' canvases=' + cvs.length +
                            ' bar=' + (bar ? (getComputedStyle(bar).display) : 'нет') +
                            ' webgl=' + (function () {
                                try { return document.createElement('canvas').getContext('webgl') ? 'да' : 'нет'; }
                                catch (e) { return 'нет'; }
                            })();
                    }, 7000);
                } catch (e) { console.error('PlanetView.open:', e); }
            } else {
                console.warn('PlanetView не загружен');
            }
        }, 2200);
    })();

    // ТЕСТ: ?dbl=earth — программно шлём двойной клик по планете и пишем итог в заголовок
    (function testDbl() {
        const id = new URLSearchParams(location.search).get('dbl');
        if (!id) return;
        setTimeout(() => {
            const el = document.querySelector('.planet[data-planet-id="' + id + '"]');
            if (!el) { document.title = 'DBL нет планеты ' + id; return; }
            const r = el.getBoundingClientRect();
            const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
            // два нажатия по центру планеты: проверяем роутер нового слоя
            for (let i = 0; i < 2; i++) {
                document.dispatchEvent(new PointerEvent('pointerdown', {
                    bubbles: true, cancelable: true, clientX: cx, clientY: cy, button: 0
                }));
            }
            window.__pdX = cx; window.__pdY = cy;
            el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true, clientX: cx, clientY: cy }));
            setTimeout(() => {
                const modal = document.getElementById('globe-modal');
                document.title = 'DBL ' + id +
                    ' modal=' + (modal ? (getComputedStyle(modal).display) : 'нет') +
                    ' err=' + (window.__globeErr || '-') +
                    ' openGlobe=' + (typeof window.openGlobe);
            }, 2000);
        }, 3000);
    })();

    // САМОПРОВЕРКА ДВИЖЕНИЯ: ?selftest2=1
    // Меряет смещение маркеров ВНУТРИ одной сессии за 600 игровых секунд —
    // без перезагрузок, поэтому фазы и случайные seed не мешают.
    (function selfTest() {
        if (!new URLSearchParams(location.search).has('selftest2')) return;
        setTimeout(function () {
            var els = Array.prototype.slice.call(document.querySelectorAll('.ship-marker[data-sid]'));
            function snap() {
                return els.map(function (e) {
                    var m = (e.style.transform || '').match(/translate\((-?[\d.]+)px,\s*(-?[\d.]+)px\)/);
                    return m ? [parseFloat(m[1]), parseFloat(m[2])] : null;
                });
            }
            var a = snap();
            var t0 = simulatedTime;
            window.__freezeAt = t0 + 600000;     // прыжок на 600 игровых секунд
            setTimeout(function () {
                var b = snap();
                var kmPerPx = 149600000 / 185;
                var maxPx = 0, fast = 0, cmp = 0;
                for (var i = 0; i < a.length; i++) {
                    if (!a[i] || !b[i]) continue;
                    cmp++;
                    var d = Math.hypot(b[i][0] - a[i][0], b[i][1] - a[i][1]);
                    if (d > maxPx) maxPx = d;
                    if (d * kmPerPx / 600 / 299792 > 0.25) fast++;
                }
                document.title = 'SELFTEST маркеров=' + cmp + ' макс=' + maxPx.toFixed(1) +
                    'px быстрее0.25c=' + fast + ' t0=' + Math.round(t0 / 1000);
            }, 900);
        }, 5000);
    })();

    // ПРИЁМОЧНЫЙ ТЕСТ: ?smoke=1 — проверяет кликабельность объектов
    // (планета -> глобус, корабль -> карточка) через роутер нового слоя.
    // Тапы повторяются, пока сцена пересобирается: элементы могут быть нулевого размера.
    (function smoke() {
        if (!new URLSearchParams(location.search).has('smoke')) return;
        var log = [];
        ['openGlobe', 'openTrafficCard', 'openFleetCard', 'openShipFlight'].forEach(function (n) {
            var orig = window[n];
            if (typeof orig !== 'function') return;
            window[n] = function () {
                log.push(n + ':' + arguments[0]);
                return orig.apply(this, arguments);
            };
        });

        function tap(el, x, y) {
            for (var i = 0; i < 2; i++) {
                setTimeout(function () {
                    document.dispatchEvent(new PointerEvent('pointerdown', {
                        bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0
                    }));
                }, i * 180);
            }
        }

        function centerOf(el) {
            var r = el.getBoundingClientRect();
            if (!r.width || !r.height) return null;
            return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
        }

        var tries = 0;
        var timer = setInterval(function () {
            tries++;
            if (log.length || tries > 45) {
                clearInterval(timer);
                document.title = 'SMOKE tries=' + tries + ' pd=' + (window.__pdCount || 0) + ' bridge=' +
                    !!(window.SceneBridge && window.SceneBridge.on && window.SceneBridge.on()) +
                    ' calls=[' + log.join(' ') + ']';
                return;
            }
            var earth = document.querySelector('.planet[data-planet-id="earth"]');
            var c = earth ? centerOf(earth) : null;
            if (c) tap(earth, c.x, c.y);
        }, 500);

        // второй проход: корабль
        setTimeout(function () {
            var ship = document.querySelector('.trade-ship[data-sid]') ||
                       document.querySelector('.ship-marker--fleet[data-sid]');
            var c = ship ? centerOf(ship) : null;
            if (c) tap(ship, c.x, c.y);
        }, 14000);
    })();

    // ── КИНЕМАТОГРАФИЧНЫЙ НАЕЗД ────────────────────────────────────────────
    // Двойной клик не открывает объект мгновенно: карта плавно наезжает,
    // слегка доворачивается и только потом открывается глобус или карточка.
    let camAnimId = null;
    function stopCamAnim() {
        if (camAnimId) { cancelAnimationFrame(camAnimId); camAnimId = null; }
    }
    function easeInOut(k) { return k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; }

    function cinematicZoom(target, ms, done) {
        stopCamAnim();
        const from = { scale: scale, x: posX, y: posY, rotZ: rotZ };
        const to = {
            scale: target.scale,
            x: target.x,
            y: target.y,
            rotZ: rotZ + (target.spin || 0)
        };
        const t0 = performance.now();
        const dur = ms || 900;
        function step() {
            const k = Math.min(1, (performance.now() - t0) / dur);
            const e = easeInOut(k);
            scale = from.scale + (to.scale - from.scale) * e;
            posX = from.x + (to.x - from.x) * e;
            posY = from.y + (to.y - from.y) * e;
            rotZ = from.rotZ + (to.rotZ - from.rotZ) * e;
            window.updateSolarTransform();
            if (k < 1) camAnimId = requestAnimationFrame(step);
            else { camAnimId = null; if (typeof done === 'function') done(); }
        }
        camAnimId = requestAnimationFrame(step);
        // страховка: если rAF замер (фоновая вкладка, headless), шаг всё равно
        // завершится по таймеру — иначе открытие объекта не произойдёт
        let finished = false;
        const finish = function () {
            if (finished) return;
            finished = true;
            if (typeof done === 'function') done();
        };
        setTimeout(function () {
            if (!finished) { stopCamAnim(); scale = to.scale; posX = to.x; posY = to.y; rotZ = to.rotZ; window.updateSolarTransform(); finish(); }
        }, dur + 200);
    }

    // где объект на карте: берём координаты планеты из planetNodes или из маркера
    function scenePointOf(el) {
        const node = planetNodes.find(n => n.planet === el);
        if (node && node.x !== undefined) return { x: node.x, y: node.y, scale: Math.max(6, scale * 3) };
        const px = parseFloat(el.dataset.px);
        const py = parseFloat(el.dataset.py);
        if (isFinite(px) && isFinite(py)) return { x: px, y: py, scale: Math.max(4, scale * 2.4) };
        const m = (el.style.transform || '').match(/translate\((-?[\d.]+)px,\s*(-?[\d.]+)px\)/);
        if (m) return { x: parseFloat(m[1]), y: parseFloat(m[2]), scale: Math.max(4, scale * 2.4) };
        return null;
    }

    window.cinematicFocus = function (el, after) {
        const p = el && scenePointOf(el);
        if (!p) { if (typeof after === 'function') after(); return false; }
        cinematicZoom(
            { scale: p.scale, x: -p.scale * p.x, y: -p.scale * p.y, spin: 8 },
            900,
            function () { if (typeof after === 'function') after(); }
        );
        return true;
    };

    // любое действие пользователя отменяет наезд
    document.addEventListener('wheel', stopCamAnim, { passive: true });
    document.addEventListener('pointerdown', function (ev) {
        if (!ev.target.closest || !ev.target.closest('.planet, .ship-marker')) stopCamAnim();
    }, true);

    // ПОСТОЯННАЯ ПРИВЯЗКА КЛИКОВ.
    // Элементы сцены пересобираются (ресайз, смена слоя), и разовые
    // обработчики терялись — планеты и корабли «переставали кликаться».
    // Поэтому раз в секунду до-привязываем недостающие обработчики.
    document.addEventListener('pointerdown', function (ev) {
        window.__pdX = ev.clientX; window.__pdY = ev.clientY;
    }, true);

    function bindInteractions() {
        document.querySelectorAll('.planet[data-planet-id]').forEach(function (el) {
            if (el.__openBound) return;
            el.__openBound = true;
            el.addEventListener('dblclick', function (ev) {
                ev.stopPropagation();
                var id = el.getAttribute('data-planet-id');
                if (!id) return;
                // сначала красивый наезд, потом глобус
                var opened = window.cinematicFocus(el, function () {
                    if (typeof window.openGlobe === 'function') window.openGlobe(id);
                });
                if (!opened && typeof window.openGlobe === 'function') window.openGlobe(id);
            });
            el.addEventListener('click', function (ev) {
                // одиночный клик открывает глобус, но только если это не перетаскивание
                if (Math.hypot(ev.clientX - (window.__pdX || 0), ev.clientY - (window.__pdY || 0)) > 6) return;
                var id = el.getAttribute('data-planet-id');
                if (id && typeof window.openGlobe === 'function') {
                    setTimeout(function () { window.openGlobe(id); }, 10);
                }
            });
        });
        document.querySelectorAll('.moon[data-moon]').forEach(function (el) {
            if (el.__openBound) return;
            el.__openBound = true;
            el.addEventListener('dblclick', function (ev) {
                ev.stopPropagation();
                var nm = el.getAttribute('data-moon');
                if (nm && window.PlanetView && typeof window.PlanetView.open === 'function') {
                    window.PlanetView.open(nm);
                }
            });
        });
        document.querySelectorAll('.ship-marker').forEach(function (el) {
            if (el.__openBound) return;
            el.__openBound = true;
            el.addEventListener('dblclick', function (ev) {
                ev.stopPropagation();
                var ri = parseInt(el.getAttribute('data-route'), 10);
                var open = function () {
                    if (!isNaN(ri) && typeof openTrafficCard === 'function') openTrafficCard(ri);
                    else if (el._fleet && typeof openFleetCard === 'function') openFleetCard(el._fleet);
                };
                if (!window.cinematicFocus(el, open)) open();
            });
        });
    }
    setInterval(bindInteractions, 1000);
    bindInteractions();

    // ТЕСТ НАЕЗДА: ?cinema=earth — в 2.5 с запускает кинематографичный зум
    (function cinemaTest() {
        const id = new URLSearchParams(location.search).get('cinema');
        if (!id) return;
        setTimeout(function () {
            const el = document.querySelector('.planet[data-planet-id="' + id + '"]');
            if (!el) { document.title = 'CINEMA нет планеты'; return; }
            window.cinematicFocus(el, function () {
                if (typeof window.openGlobe === 'function') window.openGlobe(id);
                document.title = 'CINEMA done scale=' + scale.toFixed(1);
            });
            setTimeout(function () {
                document.title = 'CINEMA шаг scale=' + scale.toFixed(2) + ' pos=' + Math.round(posX) + ',' + Math.round(posY);
            }, 450);
        }, 2500);
    })();

    // ОТДЕЛЬНАЯ ВКЛАДКА ДЛЯ ПЛАНЕТАРНОГО ВИДА: ?pv=earth
    // В этой вкладке карта не нужна вовсе — сразу скрываем её и открываем вид.
    (function pvTab() {
        const id = new URLSearchParams(location.search).get('pv');
        if (!id) return;
        document.body.classList.add('pv-mode');
        const sc = document.querySelector('.solar-system-container');
        if (sc) { sc.dataset.pvHidden = '1'; sc.style.display = 'none'; }
        // видимый экран загрузки вместо чёрного: вкладка не должна выглядеть «сломанной»
        const load = document.createElement('div');
        load.id = 'pv-loading';
        load.innerHTML = '<div style="font-size:18px">Загрузка планетарного вида</div>' +
            '<div style="opacity:.65;font-size:13px">готовим поверхность и блоки…</div>';
        document.body.appendChild(load);
        let waited = 0;
        const loadTimer = setInterval(function () {
            waited += 400;
            if (document.getElementById('blocks3d-wrap')) {
                clearInterval(loadTimer);
                if (load.parentNode) load.remove();
            } else if (waited > 12000) {
                clearInterval(loadTimer);
                load.innerHTML = '<div style="font-size:18px">Планетарный вид не запустился</div>' +
                    '<div style="opacity:.7;font-size:13px;max-width:420px;text-align:center">' +
                    'Проверьте поддержку WebGL в браузере (chrome://gpu) и обновите страницу.</div>' +
                    '<button onclick="location.reload()" style="margin-top:10px;padding:8px 16px;border-radius:8px;' +
                    'border:none;background:#2ecc71;color:#04121f;font-weight:700;cursor:pointer">Обновить</button>';
            }
        }, 400);
        const tryOpen = function (left) {
            if (window.PlanetView && typeof window.PlanetView.open === 'function') {
                window.PlanetView.open(id);
                return;
            }
            if (left > 0) setTimeout(function () { tryOpen(left - 1); }, 400);
        };
        setTimeout(function () { tryOpen(12); }, 600);
    })();

    // УНИВЕРСАЛЬНЫЙ ТЕСТ КЛИКОВ: ?probe=planet|ship|moon
    (function probe() {
        const what = new URLSearchParams(location.search).get('probe');
        if (!what) return;
        setTimeout(function () {
            let el = null;
            if (what === 'planet') el = document.querySelector('.planet[data-planet-id="earth"]');
            else if (what === 'ship') el = document.querySelector('.ship-marker[data-sid]');
            else if (what === 'moon') el = document.querySelector('.moon[data-moon]');
            if (!el) { document.title = 'PROBE нет цели ' + what; return; }
            const r = el.getBoundingClientRect();
            const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
            window.__pdX = cx; window.__pdY = cy;
            const before = document.querySelectorAll('[id$="-modal"], #fleet-card').length;
            el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true, clientX: cx, clientY: cy }));
            setTimeout(function () {
                const modals = Array.from(document.querySelectorAll('[id$="-modal"], #fleet-card'))
                    .filter(function (m) { return getComputedStyle(m).display !== 'none'; })
                    .map(function (m) { return m.id; });
                document.title = 'PROBE ' + what + ' visible=[' + modals.join(',') + '] scale=' + scale.toFixed(2);
            }, 1600);
        }, 6000);
    })();

    // АУДИТ СКОРОСТЕЙ ПО ЕДИНОМУ РЕЕСТРУ: ?speedaudit=1
    (function speedAudit() {
        if (!new URLSearchParams(location.search).has('speedaudit')) return;
        setTimeout(function () {
            const kmPerPx = 149600000 / 185, C = 299792;
            let max = 0, maxId = '', over = 0, n = 0;
            SHIP_REGISTRY.forEach(function (rec, id) {
                try {
                    const a = rec.pose(simulatedTime);
                    const b = rec.pose(simulatedTime + 600000);
                    if (!a || !b) return;
                    n++;
                    const d = Math.hypot(b.x - a.x, b.y - a.y);
                    const c = (d * kmPerPx / 600) / C;
                    if (c > max) { max = c; maxId = id; }
                    if (c > 0.25) over++;
                } catch (e) { }
            });
            document.title = 'SPEEDAUDIT бортов=' + n + ' макс=' + max.toFixed(3) + 'c (' + maxId + ') быстрее0.25c=' + over;
        }, 6000);
    })();

    // ГИБРИДНЫЙ РЕНДЕР: ?render=canvas — корабли рисуются одним canvas-проходом
    (function hybridRender() {
        if (new URLSearchParams(location.search).get('render') !== 'canvas') return;
        document.body.classList.add('render-canvas');
        const initCanvas = function () { if (window.SceneCanvas) window.SceneCanvas.init(); };
        setTimeout(initCanvas, 1200);
        let last = 0, frames = 0;
        function loop() {
            const now = performance.now();
            if (now - last > 33) {            // 30 Гц для бортов
                last = now;
                if (window.SceneCanvas && window.__poseCache) {
                    window.SceneCanvas.draw({ scale: scale, posX: posX, posY: posY, rotX: rotX, rotZ: rotZ });
                    if (new URLSearchParams(location.search).has('canvasprobe')) {
                        // проверка клика по борту: жмём в экранную точку первого борта
                        try {
                            const cam2 = window.__lastCamera || {};
                            const sc2 = cam2.scale || 1;
                            const cv = document.getElementById('scene-canvas');
                            const rr2 = cv.getBoundingClientRect();
                            const first = window.__poseCache.values().next().value;
                            if (first) {
                                const sx2 = rr2.left + rr2.width / 2 + (cam2.posX || 0) + first.x * sc2;
                                const sy2 = rr2.top + rr2.height / 2 + (cam2.posY || 0) + first.y * sc2;
                                document.dispatchEvent(new PointerEvent('pointerdown', {
                                    clientX: sx2, clientY: sy2, bubbles: true
                                }));
                            }
                        } catch (e) { }
                        document.title = 'CANVAS бортов=' + (window.__canvasDrawn || 0) +
                            ' cache=' + (window.__poseCache ? window.__poseCache.size : 0) +
                            ' extra=' + (window.__poseExtra ? window.__poseExtra.size : 0) +
                            ' routes=' + (window.__canvasRoutes || 0) + ' taps=' + (window.__canvasTap || 0) + ' markers=' + document.querySelectorAll('.ship-marker').length +
                            ' scale=' + scale.toFixed(2);
                    }
                }
            }
            frames++;
            requestAnimationFrame(loop);
        }
        setTimeout(function () { requestAnimationFrame(loop); }, 1500);
    })();

    // убираем анимацию меню на время первой раскладки
    (function calmMenu() {
        const menu = document.querySelector('.left-menu');
        if (!menu) return;
        menu.classList.add('no-anim');
        setTimeout(function () { menu.classList.remove('no-anim'); }, 500);
    })();

    // РОУТЕР КЛИКОВ ПО БОРТАМ: маркеры не ловят мышь (перекрывали планеты),
    // поэтому ищем ближайший борт по прямоугольникам и отправляем событие ему.
    (function shipClickRouter() {
        if (window.__shipRouter) return;
        window.__shipRouter = true;
        let prev = { t: 0, el: null };
        document.addEventListener('pointerdown', function (ev) {
            if (ev.target && ev.target.closest &&
                ev.target.closest('.control-panel, .left-menu, [id$="-modal"], .resources-panel')) return;
            const nodes = document.querySelectorAll('.ship-marker');
            let best = null, bestD = 12;
            for (let i = 0; i < nodes.length; i++) {
                const r = nodes[i].getBoundingClientRect();
                if (!r.width) continue;
                const d = Math.hypot(r.left + r.width / 2 - ev.clientX, r.top + r.height / 2 - ev.clientY);
                if (d < bestD) { bestD = d; best = nodes[i]; }
            }
            if (!best) return;
            const now = Date.now();
            const dbl = prev.el === best && now - prev.t < 450;
            prev = { t: now, el: best };
            best.dispatchEvent(new MouseEvent(dbl ? 'dblclick' : 'click', {
                bubbles: true, cancelable: true, clientX: ev.clientX, clientY: ev.clientY
            }));
            window.__shipTaps = (window.__shipTaps || 0) + 1;
        }, true);
    })();

    buildTimeExtras();
    bindPlanetDblClick();
    setTimeout(bindPlanetDblClick, 1500);
    // состояние кнопок «нужен разведчик» обновляем периодически
    setInterval(() => { try { if (window.updateSurveyButtons) window.updateSurveyButtons(); } catch (e) { } }, 1500);
    // пока идёт загрузка профиля — проверяем доступ несколько раз
    let gateTries = 0;
    const gateTimer = setInterval(() => {
        applyMaintenanceGate();
        if (++gateTries > 20) clearInterval(gateTimer);
    }, 500);
    applyTestMode();
    applyViewFlags();
    // «?debug» ускоряет время только администратору, иначе игрок получил бы ускорение ссылкой
    // По умолчанию 1 секунда реального времени = 1 игровая минута (60×).
    // Раньше подсветка показывала «1x», хотя время шло в 60 раз быстрее.
    // РЕАЛЬНОЕ ВРЕМЯ: по умолчанию 1 секунда = 1 секунда.
    // Ускорения (мин/сутки) игрок включает сам ползунком.
    timeScale = 1;
    syncTimeUI('real');
    // Оставляем «пауза», «1x» и «1м» (ускорение 60×). Сутки/год — убираем.
    document.querySelectorAll('.mode-btn[data-mode="hour"], .mode-btn[data-mode="day"],' +
        ' .mode-btn[data-mode="year"]').forEach(b => { b.style.display = 'none'; });
    document.querySelectorAll('.mode-btn[data-mode="min"]').forEach(b => {
        b.style.setProperty('display', 'inline-flex', 'important');
    });
    // ?speed=min|sec — ручной выбор темпа для тестов и ссылок
    (function applySpeedParam() {
        const sp = new URLSearchParams(location.search).get('speed');
        if (sp === 'min') { timeScale = 60; syncTimeUI('min'); }
        else if (sp === 'sec') { timeScale = 1; syncTimeUI('sec'); }
    })();
    // Масштаб и кеш сцены — после первой раскладки, иначе радиусы орбит ещё нулевые.
    requestAnimationFrame(() => {
        scale = fitScale();
        window.updateSolarTransform();
        buildSceneCache();
        refreshSolarVisibility();
    });
    const urlParams = new URLSearchParams(window.location.search); const doLogout = urlParams.get('logout');
    // Автовход по ?login= убран: он пускал под любой учётной записью без пароля.
    if (doLogout === 'true') { currentUser = null; localStorage.removeItem('galaktika_user'); window.history.replaceState({}, document.title, window.location.pathname); }
    else if (urlParams.get('login')) { window.history.replaceState({}, document.title, window.location.pathname); }
    updateAuthUI();
    // Прогресс живёт на сервере: тянем профиль при старте и отправляем изменения регулярно.
    if (authToken && currentUser) pullServerProfile();
    setInterval(() => { if (authToken && currentUser) syncProfile(); }, 60000);
    window.addEventListener('beforeunload', () => { if (authToken && currentUser) syncProfile(); });
    buildStamp();
    if (urlParams.get('open') === 'res') window.openResourcesPanel();
    if (urlParams.get('open') === 'fleet') { window.openFleet(); const shp = urlParams.get('ship'); if (shp) window.renderHangar(shp); }
    if (urlParams.get('open') === 'quest') window.openQuests();
    if (urlParams.get('open') === 'npc') window.openNpc();
    if (urlParams.get('open') === 'admin') window.openAdminModal();
    if (urlParams.get('open') === 'market') window.openMarket();
    if (urlParams.get('open') === 'buildings') window.openBuildings();
    if (urlParams.get('open') === 'science') window.openScience();
    if (urlParams.get('open') === 'globe') window.openGlobe(urlParams.get('world') || 'earth');
    // ?consistency=1 — автотест согласованности: DOM vs WorldCoords (в координатах сцены)
    if (urlParams.get('consistency')) {
        setTimeout(() => {
            const WC = window.WorldCoords;
            if (!WC) { document.title = 'CONS нет WorldCoords'; return; }
            const now = simulatedTime;
            const model = WC.planetsAt(now);
            const dom = {};
            planetNodes.forEach(n => {
                const id = n.id || (n.planet && n.planet.getAttribute && n.planet.getAttribute('data-planet-id'));
                if (!id || n.x === undefined) return;
                dom[id] = { x: n.x, y: n.y };
            });
            const rows = [], bad = [];
            let maxDelta = 0, worst = '-';
            for (const id in model) {
                if (!dom[id]) continue;
                const d = Math.hypot(model[id].x - dom[id].x, model[id].y - dom[id].y);
                rows.push(id + ':' + d.toFixed(0));
                if (d > maxDelta) { maxDelta = d; worst = id; }
                if (d > 5) bad.push(id + ' Δ' + d.toFixed(0) + 'px');
            }
            // маркеры: расстояние до ближайшей планеты в координатах сцены
            const planets = Object.keys(dom).map(k => dom[k]);
            // Точная проверка: маркер либо у своей планеты, либо лежит НА пути
            // (isPointInStroke с утолщённым штрихом), либо это пояс/гравитация.
            let far = 0; const farList = [];
            function nearestPlanet(x, y) {
                let best = 1e9;
                planets.forEach(p2 => { const d = Math.hypot(p2.x - x, p2.y - y); if (d < best) best = d; });
                return best;
            }
            function onAnyLine(paths, x, y) {
                for (const pth of paths) {
                    try {
                        const L = pth.getTotalLength();
                        if (!L) continue;
                        const N = 400;
                        for (let k = 0; k <= N; k++) {
                            const q = pth.getPointAtLength(L * k / N);
                            if (Math.hypot(q.x - x, q.y - y) < 2) return true;
                        }
                    } catch (e) { }
                }
                return false;
            }
            const tradePathsEls = [...document.querySelectorAll('#trade-traffic path')];
            const fleetPathsEls = [...document.querySelectorAll('#fleet-traffic path')];
            document.querySelectorAll('.ship-marker').forEach(el => {
                const x = parseFloat(el.style.left), y = parseFloat(el.style.top);
                if (isNaN(x) || isNaN(y)) return;
                const layer = (el.parentElement && el.parentElement.id) || '?';
                // если у маркера есть свой путь — проверяем строго по нему
                if (el._pathEl && el._pathEl.getTotalLength) {
                    const L = el._pathEl.getTotalLength();
                    let bestD = 1e9;
                    for (let k = 0; k <= 500; k++) {
                        const q = el._pathEl.getPointAtLength(L * k / 500);
                        const d = Math.hypot(q.x - x, q.y - y);
                        if (d < bestD) bestD = d;
                    }
                    // у флотов есть боковой сдвиг 7 px, чтобы не сливаться с торговцами
                    const tol = layer === 'fleet-traffic' ? 9 : 2;
                    if (bestD > tol) {
                        far++;
                        farList.push(layer + ':off' + bestD.toFixed(1) + ' "' + (el.getAttribute('title') || '').slice(0, 14) + '"');
                    }
                    return;
                }
                const title = (el.getAttribute('title') || '');
                if (layer === 'civil-traffic' && title.indexOf('платформ') >= 0) return;   // платформы скрыты
                const dp = nearestPlanet(x, y);
                // Рубежи: гражданские борта ходят вокруг планет и лун (луна
                // добавляет ~26 px), поэтому допуск шире; рудные — в поясе.
                const isBelt = title.indexOf('пояс') >= 0;
                if (isBelt) {
                    const r = Math.hypot(x, y);
                    if (r >= 240 && r <= 320) return;                   // в кольце пояса
                }
                if (title.indexOf('Врат') >= 0) return;               // рейсы к Вратам — вне планет
                if (layer === 'civil-traffic' && dp <= 100) return;
                if (dp <= 55) return;                                  // стоит у планеты
                if (layer === 'trade-traffic' && onAnyLine(tradePathsEls, x, y)) return;
                if (layer === 'fleet-traffic' && onAnyLine(fleetPathsEls, x, y)) return;
                far++;
                farList.push(layer + ':' + Math.round(dp) + 'px "' + title.slice(0, 14) + '"');
            });
            // начало/конец трассы флота = планета (≤2 px)
            let routeOff = 0;
            fleetPathsEls.forEach(pth => {
                try {
                    const L = pth.getTotalLength();
                    if (!L) return;
                    const a = pth.getPointAtLength(0), b = pth.getPointAtLength(L);
                    if (nearestPlanet(a.x, a.y) > 2) routeOff++;
                    if (nearestPlanet(b.x, b.y) > 2) routeOff++;
                } catch (e) { }
            });
            document.title = 'CONS планет Δmax=' + maxDelta.toFixed(0) + 'px (' + worst + ')' +
                ' | расхождений>5px: ' + bad.length + (bad.length ? ' ' + bad.slice(0, 4).join(',') : '') +
                ' | маркеров вне мест: ' + far + (farList.length ? ' ' + farList.slice(0, 5).join(',') : '') +
                ' | концов трасс не у планеты: ' + routeOff;
        }, 5000);
    }

    // ?fleetjump=1 — поиск разрывов: максимальный скачок маркера за кадр
    if (urlParams.get('fleetjump')) {
        const prev = new Map();
        let frames = 0, maxJump = 0, jumps = 0, where = '-';
        const tickJ = () => {
            document.querySelectorAll('#fleet-traffic .ship-marker').forEach((el, i) => {
                const x = parseFloat(el.style.left), y = parseFloat(el.style.top);
                if (isNaN(x) || isNaN(y)) return;
                const key = i + ':' + (el.getAttribute('title') || '');
                const p0 = prev.get(key);
                if (p0) {
                    const d = Math.hypot(x - p0.x, y - p0.y);
                    if (d > maxJump) { maxJump = d; where = (el.getAttribute('title') || '').slice(0, 16); }
                    if (d > 8) jumps++;
                }
                prev.set(key, { x: x, y: y });
            });
            if (++frames < 40) requestAnimationFrame(tickJ);
            else document.title = 'JUMP кадров=' + frames + ' макс_скачок=' + maxJump.toFixed(1) +
                'px скачков>8px=' + jumps + ' (' + where + ')';
        };
        setTimeout(tickJ, 1500);
    }

    // Заморозку ставим СРАЗУ (а не только по таймеру): иначе до первого
    // срабатывания успевают пройти секунды и кадр «уезжает» на минуты.
    if (urlParams.get('freeze') !== null && urlParams.get('freeze') !== '') {
        const f0 = parseFloat(urlParams.get('freeze'));
        if (isFinite(f0)) {
            const base0 = (window.Motion && Motion.TABLES.time.epochMs) || EPOCH_MS;
            const rawOff = (typeof GAME_OFFSET_MS === 'number') ? GAME_OFFSET_MS : 0;
            window.__freezeAt = base0 + Math.floor(rawOff / 86400000) * 86400000 + f0 * 1000;
            simulatedTime = window.__freezeAt;
            if (window.Motion) window.Motion.setTime(window.__freezeAt);
        }
    }

    // ?freeze=<игровые секунды от эпохи> — полностью воспроизводимый кадр:
    // время ставится АБСОЛЮТНО (от J2000), поэтому кадр не зависит от загрузки
    if (urlParams.get('freeze') !== null && urlParams.get('freeze') !== '') {
        const frozen = parseFloat(urlParams.get('freeze'));
        if (isFinite(frozen)) {
            const baseEpoch = (window.Motion && Motion.TABLES.time.epochMs) || EPOCH_MS;
            const apply = () => {
                // Игровая эпоха, округлённая до суток: иначе offset содержит
                // текущее время загрузки, и два кадра с разницей «1 секунда»
                // на самом деле отстоят на минуты — все замеры скорости врали.
                const rawOffset = (typeof GAME_OFFSET_MS === 'number') ? GAME_OFFSET_MS : 0;
                const offset = Math.floor(rawOffset / 86400000) * 86400000;
                simulatedTime = baseEpoch + offset + frozen * 1000;
                window.__freezeAt = simulatedTime;   // держим это время каждый кадр
                timeScale = 0;
                if (window.Motion) window.Motion.setTime(simulatedTime);
            };
            setTimeout(apply, 1200);
            setTimeout(apply, 2400);
            setTimeout(apply, 3600);
        }
    }

    // ?routes=1 — инвентаризация маршрутов и видимости бортов
    if (urlParams.get('routes')) {
        setTimeout(() => {
            const rows = [];
            document.querySelectorAll('#fleet-traffic .ship-marker').forEach((el, i) => {
                const st = getComputedStyle(el);
                const x = parseFloat(el.style.left) || 0, y = parseFloat(el.style.top) || 0;
                rows.push(i + ':' + (el.getAttribute('title') || '').slice(0, 18) +
                    ' xy=' + Math.round(x) + ',' + Math.round(y) +
                    ' r=' + Math.round(Math.hypot(x, y)) +
                    ' ' + st.display + '/' + st.opacity);
            });
            const paths = document.querySelectorAll('#fleet-traffic path').length;
            const trade = document.querySelectorAll('#trade-traffic .ship-marker').length;
            const dbg = JSON.stringify((window.__fltDebug || []).slice(0, 2));
            const err = window.__fleetItemErr || '-';
            const fj = window.__fj || { max: 0, jumps: 0, frames: 0, where: '' };
            const fjTxt = ' скачок=' + fj.max.toFixed(1) + 'px/>8:' + fj.jumps + ' кадров=' + fj.frames + ' (' + fj.where + ')';
            // сверяем нарисованное с ядром: позиция маркера против Motion.shipPose
            let maxDev = 0, devId = '-';
            try {
                document.querySelectorAll('#fleet-traffic .ship-marker').forEach((el, i) => {
                    const ps = window.Motion && window.Motion.shipPose(i, simulatedTime);
                    if (!ps) return;
                    const d = Math.hypot((parseFloat(el.style.left) || 0) - ps.x,
                                         (parseFloat(el.style.top) || 0) - ps.y);
                    if (d > maxDev) { maxDev = d; devId = i + ':' + (el.getAttribute('title') || ''); }
                });
            } catch (e) { maxDev = -1; }
            window.__moonDbg = moonNodes.map(n => ({
                name: (n.moon && n.moon.getAttribute('data-moon')) || '?',
                period: n.period, radius: +n.radius.toFixed(1)
            }));
            document.title = 'ROUTES moons=' + JSON.stringify(window.__moonDbg.slice(0, 6)) + ' trade=' + JSON.stringify((window.__tradeDbg || []).slice(0, 4)) + ' откл_ядра=' + maxDev.toFixed(1) + 'px(' + devId + ') путей=' + paths + ' флотов=' + rows.length +
                ' err=' + err + fjTxt + ' dbg=' + dbg +
                ' торговцев=' + trade + ' || ' + rows.join(' ; ');
        }, 3500);
    }

    // ?fleetdiag=1 — качество движения флотов: скорость, рывки, остановки
    if (urlParams.get('fleetdiag')) {
        const samples = new Map();
        let rounds = 0;
        const tickSample = () => {
            document.querySelectorAll('#fleet-traffic .ship-marker').forEach((el, i) => {
                const x = parseFloat(el.style.left), y = parseFloat(el.style.top);
                if (isNaN(x) || isNaN(y)) return;
                const key = i + ':' + (el.getAttribute('title') || '');
                if (!samples.has(key)) samples.set(key, []);
                samples.get(key).push({ x: x, y: y, t: performance.now(), sim: simulatedTime });
            });
            if (++rounds < 10) setTimeout(tickSample, 250);
            else {
                let maxJump = 0, maxSpeed = 0, minSpeed = 1e9, jumps = 0, blocks = 0;
                let sumSpeed = 0, cnt = 0;
                samples.forEach(arr => {
                    for (let k = 1; k < arr.length; k++) {
                        const dt = (arr[k].t - arr[k - 1].t) / 1000 || 1;
                        const d = Math.hypot(arr[k].x - arr[k - 1].x, arr[k].y - arr[k - 1].y);
                        const v = d / dt;
                        if (d > 25) jumps++;
                        if (v > maxSpeed) maxSpeed = v;
                        if (v < minSpeed) minSpeed = v;
                        sumSpeed += v; cnt++;
                        if (d > maxJump) maxJump = d;
                    }
                    blocks++;
                });
                let simSpan = 0;
                samples.forEach(arr => { if (arr.length > 1) simSpan = Math.max(simSpan, arr[arr.length - 1].sim - arr[0].sim); });
                document.title = 'FLEETDIAG игровых_сек=' + (simSpan / 1000).toFixed(1) + ' бортов=' + blocks +
                    ' скорость_ср=' + (cnt ? (sumSpeed / cnt).toFixed(1) : '0') + 'px/с' +
                    ' макс=' + maxSpeed.toFixed(1) +
                    ' мин=' + (minSpeed === 1e9 ? '0' : minSpeed.toFixed(1)) +
                    ' рывков>25px=' + jumps + ' макс_рывок=' + maxJump.toFixed(0) + 'px';
            }
        };
        setTimeout(tickSample, 600);
    }

    // ?speeds=1 — матрица скоростей флота
    if (urlParams.get('speeds')) {
        setTimeout(() => {
            const SM = window.SpeedModel;
            if (!SM) { document.title = 'SPEEDS нет модуля'; return; }
            const base = SM.matrix({}).map(r => r.id + ':' + r.speed).join(' ');
            const up = SM.matrix({ engineLevel: 5, techLevel: 10 }).map(r => r.id + ':' + r.speed).join(' ');
            document.title = 'SPEEDS сток ' + base + ' || макс ' + up;
        }, 2500);
    }

    // ?errors=1 — ошибки, ход времени, движение планет и реакция флота на паузу
    if (urlParams.get('errors')) {
        window.__errs2 = [];
        window.addEventListener('error', (ev) => window.__errs2.push(String(ev.message).slice(0, 80)));
        window.addEventListener('unhandledrejection', (ev) => window.__errs2.push('promise:' + String(ev.reason).slice(0, 70)));
        const earthOf = () => planetNodes.find(n =>
            (n.planet && n.planet.getAttribute && n.planet.getAttribute('data-planet-id')) === 'earth') || null;
        let t0 = 0, e0 = null, f0 = null, paused = null;
        setTimeout(() => {
            t0 = simulatedTime;
            const e = earthOf(); if (e) e0 = e.x;
            const fl = document.querySelector('#fleet-traffic .ship-marker');
            if (fl) f0 = fl.style.left;
        }, 1200);
        setTimeout(() => {
            const e = earthOf();
            const dt = (simulatedTime - t0) / 1000;
            const earthShift = (e && e0 !== null && typeof e.x === 'number') ? +(e.x - e0).toFixed(2) : null;
            let sw = 'ok';
            try {
                window.setTimeMode('pause');
                if (timeScale !== 0) sw = 'pause:' + timeScale;
                window.setTimeMode('min');
                if (timeScale !== 60) sw += ' min:' + timeScale;
            } catch (err) { sw = 'throw:' + err.message; }
            const withX = planetNodes.filter(n => typeof n.x === 'number').length;
            document.title = 'ERR timeScale=' + timeScale + ' игровых_сек=' + dt.toFixed(1) +
                ' земля_сдвиг=' + (earthShift === null ? '?' : earthShift) +
                ' планет_с_x=' + withX + '/' + planetNodes.length +
                ' переключатель=' + sw + ' ошибок=' + window.__errs2.length +
                ' ранних=' + ((window.__earlyErrs || []).length) +
                (window.__earlyErrs && window.__earlyErrs.length ? ' [' + window.__earlyErrs.slice(0, 2).join(' | ') + ']' : '') +
                ' animErr=' + (window.__animErr || '-');
            // сначала проверяем, что при 60× борт ДВИЖЕТСЯ
            const fl0 = document.querySelector('#fleet-traffic .ship-marker');
            if (fl0) {
                const l1 = fl0.style.left, t1 = fl0.style.top;
                setTimeout(() => {
                    const moved = (fl0.style.left !== l1) || (fl0.style.top !== t1);
                    document.title += ' | в движении: ' + (moved ? 'да' : 'НЕТ');
                }, 1500);
            }
            // пауза должна заморозить борт
            const fl2 = document.querySelector('#fleet-traffic .ship-marker');
            if (fl2 && f0 !== null) {
                window.setTimeMode('pause');
                const before = fl2.style.left;
                setTimeout(() => {
                    const moved = fl2.style.left !== before;
                    document.title += ' | пауза: ' + (moved ? 'борт ДВИЖЕТСЯ' : 'борт стоит');
                    window.setTimeMode('min');
                }, 1500);
            }
        }, 20000);
    }

    // ?wc=1 — самопроверка единой системы координат
    if (urlParams.get('wc')) {
        setTimeout(() => {
            document.title = 'WC ' + (window.WorldCoords ? window.WorldCoords.selfTest() : 'модуль не загружен');
        }, 2500);
    }

    // ?checkfleet=1 — проверка координат: каждый борт должен стоять у своей планеты
    if (urlParams.get('checkfleet')) {
        setTimeout(() => {
            const sun = document.querySelector('.sun');
            const sr = sun ? sun.getBoundingClientRect() : null;
            const cx = sr ? sr.left + sr.width / 2 : innerWidth / 2;
            const cy = sr ? sr.top + sr.height / 2 : innerHeight / 2;
            const planets = planetNodes.filter(n => n.x !== undefined).map(n => ({
                id: n.id || '?', x: n.x, y: n.y
            }));
            const bad = [];
            document.querySelectorAll('.ship-marker').forEach(el => {
                // сцена масштабируется/сдвигается — считаем в её координатах
                const x = parseFloat(el.style.left) || 0;
                const y = parseFloat(el.style.top) || 0;
                let best = null, bestD = 1e9;
                planets.forEach(p2 => {
                    const d = Math.hypot(p2.x - x, p2.y - y);
                    if (d < bestD) { bestD = d; best = p2.id; }
                });
                if (bestD > 120) {
                    bad.push((el.parentElement.id || '?') + ' ' + (el.getAttribute('title') || '').slice(0, 18) +
                             ' → ' + Math.round(x) + ',' + Math.round(y) + ' (до ' + best + ' ' + Math.round(bestD) + 'px)');
                }
            });
            document.title = 'FLEETCHECK планет:' + planets.length + ' бортов:' +
                document.querySelectorAll('.ship-marker').length + ' вне орбит:' + bad.length +
                (bad.length ? ' | ' + bad.slice(0, 6).join(' ; ') : ' | все у своих планет');
        }, 4500);
    }

    // ?far=1 — самые далёкие от Солнца маркеры на экране (вне зависимости от слоя)
    if (urlParams.get('far')) {
        setTimeout(() => {
            const sun = document.querySelector('.sun');
            const sr = sun ? sun.getBoundingClientRect() : null;
            const cx = sr ? sr.left + sr.width / 2 : innerWidth / 2;
            const cy = sr ? sr.top + sr.height / 2 : innerHeight / 2;
            const rows = [];
            document.querySelectorAll('.ship-marker').forEach(el => {
                const r = el.getBoundingClientRect();
                const d = Math.hypot(r.left + r.width / 2 - cx, r.top + r.height / 2 - cy);
                rows.push({ d: Math.round(d), parent: el.parentElement.id || '?',
                            title: (el.getAttribute('title') || '').slice(0, 24),
                            x: Math.round(r.left), y: Math.round(r.top),
                            vis: getComputedStyle(el).display + '/' + getComputedStyle(el.parentElement).display });
            });
            rows.sort((a, b) => b.d - a.d);
            document.title = 'FAR ' + rows.slice(0, 8).map(r =>
                r.d + 'px ' + r.parent + ' [' + r.title + '] ' + r.x + ',' + r.y + ' ' + r.vis).join(' ; ');
        }, 4500);
    }

    // ?nolayer=civil|trade|fleet — выключить слой, чтобы найти источник
    if (urlParams.get('nolayer')) {
        const which = urlParams.get('nolayer');
        setInterval(() => {
            const map = { civil: '#civil-traffic', trade: '#trade-traffic', fleet: '#fleet-traffic' };
            const sel = map[which] || ('#' + which);
            document.querySelectorAll(sel).forEach(el => { el.style.display = 'none'; });
        }, 400);
    }

    // ?listmarkers=1 — полный список маркеров: слой, координаты, подпись
    if (urlParams.get('listmarkers')) {
        setTimeout(() => {
            const rows = [];
            document.querySelectorAll('.ship-marker, .gravity-platform').forEach(el => {
                const p = el.parentElement || {};
                const x = Math.round(parseFloat(el.style.left) || 0);
                const y = Math.round(parseFloat(el.style.top) || 0);
                rows.push((p.id || 'no') + '|' + x + ',' + y + '|' +
                          (el.getAttribute('title') || '').slice(0, 26));
            });
            document.title = 'LIST ' + rows.join(' ; ');
        }, 4200);
    }

    // ?dumpmarkers=1 — разбор маркеров по родительским слоям (диагностика)
    if (urlParams.get('dumpmarkers')) {
        setTimeout(() => {
            const byParent = {};
            const far = [];
            document.querySelectorAll('.ship-marker, .gravity-platform').forEach(el => {
                const p = el.parentElement || {};
                const key = (p.id || p.className || 'нет').toString().slice(0, 24);
                byParent[key] = (byParent[key] || 0) + 1;
                const x = parseFloat(el.style.left) || 0;
                const y = parseFloat(el.style.top) || 0;
                if (Math.hypot(x, y) > 380) {
                    far.push(key + '@' + Math.round(x) + ',' + Math.round(y) +
                             '(' + (el.getAttribute('title') || el.className).toString().slice(0, 18) + ')');
                }
            });
            const layers = [...document.querySelectorAll('#fleet-traffic, #trade-traffic, #civil-traffic, #fleet-dots, #gravity-platform')]
                .map(el => el.id + ':' + el.childElementCount).join(' ');
            document.title = 'DUMP ' + JSON.stringify(byParent) + ' | слои: ' + layers +
                             ' | дальние: ' + far.slice(0, 6).join(' ; ');
        }, 4000);
    }

    // ?testpv=mars — пройти цепочку «глобус → планетарный вид» и записать итог
    if (urlParams.get('testpv')) {
        window.__errs = [];
        window.addEventListener('error', (ev) => window.__errs.push(String(ev.message || ev.error)));
        setTimeout(() => {
            const id = urlParams.get('testpv');
            if (urlParams.get('mode') === 'direct') {
                try { window.PlanetView.open(id); } catch (e) { window.__errs.push('PV.open: ' + e.message); }
                setTimeout(function () {
                    const wrap = document.getElementById('blocks3d-wrap');
                    const pv = document.querySelector('#pv-bar');
                    document.title = 'DIRECT id=' + id + ' blocks3d=' + (window.Blocks3D ? 'да' : 'нет')
                        + ' wrap=' + (wrap ? 'есть' : 'нет') + ' pvbar=' + (pv ? 'есть' : 'нет')
                        + ' errs=' + (window.__errs.join(' | ') || 'нет')
                        + ' step=' + (window.__pvStep || '-')
                        + ' pvErr=' + (window.__pvErr || '-');
                }, 4000);
                return;
            }
            try { window.openGlobe(id); } catch (e) { window.__errs.push('openGlobe: ' + e.message); }
            setTimeout(() => {
                const btn = document.getElementById('globe-surface');
                if (!btn) { window.__errs.push('нет кнопки globe-surface'); }
                else { try { btn.click(); } catch (e) { window.__errs.push('click: ' + e.message); } }
                setTimeout(() => {
                    const wrap = document.getElementById('blocks3d-wrap');
                    const pv = document.querySelector('#pv-bar');
                    const modal = document.getElementById('globe-modal');
                    document.title = 'PV id=' + id
                        + ' blocks3d=' + (window.Blocks3D ? 'да' : 'нет')
                        + ' wrap=' + (wrap ? 'есть' : 'нет')
                        + ' pvbar=' + (pv ? 'есть' : 'нет')
                        + ' globe=' + (modal ? getComputedStyle(modal).display : 'нет')
                        + ' errs=' + (window.__errs.join(' | ') || 'нет');
                }, 4000);
            }, 1500);
        }, 2500);
    }

    // ?testdbl=earth — проверка обработчика двойного клика: шлём настоящий dblclick
    if (urlParams.get('testdbl')) {
        setTimeout(() => {
            const id = urlParams.get('testdbl');
            const el = document.querySelector('.planet[data-planet-id="' + id + '"]');
            const modal = document.getElementById('globe-modal');
            const before = modal ? getComputedStyle(modal).display : 'нет модалки';
            let error = '';
            try {
                if (!el) throw new Error('планета ' + id + ' не найдена');
                const rect = el.getBoundingClientRect();
                const cx2 = rect.left + rect.width / 2, cy2 = rect.top + rect.height / 2;
                const gap = parseInt(urlParams.get('gap') || '120', 10);
                const fire = (type) => el.dispatchEvent(new MouseEvent(type, { bubbles: true, clientX: cx2, clientY: cy2 }));
                fire('pointerdown'); fire('pointerup'); fire('click');
                setTimeout(() => {
                    fire('pointerdown'); fire('pointerup'); fire('click'); fire('dblclick');
                }, gap);
            } catch (e) { error = e.message; }
            setTimeout(() => {
                const m = document.getElementById('globe-modal');
                const after = m ? getComputedStyle(m).display : 'нет модалки';
                document.title = 'DBL id=' + id + ' before=' + before + ' after=' + after + (error ? ' err=' + error : '');
            }, 900);
        }, 3000);
    }
    if (urlParams.get('open') === 'surface') window.showSurface(urlParams.get('world') || 'earth');
    if (urlParams.get('open') === 'guild') window.openGuild();
    if (urlParams.get('open') === 'map') window.openMap();
    if (urlParams.get('autopilot')) setTimeout(() => window.runAutopilot(), 400);
    // ВАЖНО: берём из уже разобранных urlParams — auto-login выше чистит query через replaceState
    const legendParam = urlParams.get('legend');
    if (legendParam !== null) {
        startLegend(Number(legendParam) || 0);
    } else {
        // Вступление больше не запускается само: осталось кнопкой «История» в меню
        const legendOverlay = document.getElementById('legend-overlay');
        if (legendOverlay) legendOverlay.style.display = 'none';
    }
    requestAnimationFrame(animate);
});

// Слияние лун Кеплера в рынок и города — после объявления WORLD_CITIES.
function mergeKeplerWorlds() {
    if (typeof KEPLER_GIANTS === 'undefined' || typeof WORLDS === 'undefined') return;
    KEPLER_GIANTS.forEach(g => g.moons.forEach(m => {
        if (!WORLDS.find(w => w.id === m.id)) {
            WORLDS.push({ id: m.id, name: m.name, pop: m.pop, needs: m.needs, produces: m.produces });
        }
        if (typeof WORLD_CITIES !== 'undefined' && !WORLD_CITIES[m.id]) {
            WORLD_CITIES[m.id] = [{ name: m.name, lat: 15.0, lon: 45.0, pop: m.pop, hab: 1, type: 'добыча' }];
        }
    }));
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mergeKeplerWorlds);
else setTimeout(mergeKeplerWorlds, 0);

// =========================================================
// КОРАБЛИ: покупка и продажа считаются на сервере
// (цены и комплектующие в ship_table() на сервере, клиент только показывает)
// =========================================================
window.buyShip = function (shipId) {
    ensureFleet(currentUser);
    var token = '';
    try { token = localStorage.getItem('galaktika_token') || ''; } catch (e) { token = ''; }
    if (!token) { notify('Войдите в игру, чтобы покупать корабли'); return; }
    fetch('/api/ship/buy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Auth-Token': token },
        body: JSON.stringify({ id: shipId })
    }).then(function (r) { return r.json(); }).then(function (res) {
        if (res.error) { notify(res.error); return; }
        if (window.pullServerProfile) window.pullServerProfile();
        if (typeof res.credits === 'number') currentUser.credits = res.credits;
        if (res.resources) { currentUser.resources = currentUser.resources || {}; Object.assign(currentUser.resources, res.resources); }
        saveUser(); renderDock(); updateCredits();
        notify('Корабль куплен и стоит в доке');
    }).catch(function () { notify('Сервер недоступен — покупка кораблей недоступна'); });
};

window.sellShip = function (index) {
    var token = '';
    try { token = localStorage.getItem('galaktika_token') || ''; } catch (e) { token = ''; }
    if (!token) { notify('Войдите в игру'); return; }
    fetch('/api/ship/sell', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Auth-Token': token },
        body: JSON.stringify({ index: index })
    }).then(function (r) { return r.json(); }).then(function (res) {
        if (res.error) { notify(res.error); return; }
        if (window.pullServerProfile) window.pullServerProfile();
        if (typeof res.credits === 'number') currentUser.credits = res.credits;
        saveUser(); renderDock(); updateCredits();
        notify('Продан за ' + (res.refund || 0).toLocaleString() + ' кр');
    }).catch(function () { notify('Сервер недоступен — продажа недоступна'); });
};
// =========================================================
// СТРОЙКА: уровень сооружения и списание считает сервер
// =========================================================
window.buildFactory = function (fid) {
    ensureFleet(currentUser);
    var token = '';
    try { token = localStorage.getItem('galaktika_token') || ''; } catch (e) { token = ''; }
    if (!token) { notify('Войдите в игру, чтобы строить'); return; }
    fetch('/api/build/factory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Auth-Token': token },
        body: JSON.stringify({ id: fid })
    }).then(function (r) { return r.json(); }).then(function (res) {
        if (res.error) { notify(res.error); return; }
        if (window.pullServerProfile) window.pullServerProfile();
        if (typeof res.credits === 'number') currentUser.credits = res.credits;
        currentUser.resources = currentUser.resources || {};
        if (typeof res.steel === 'number') currentUser.resources.steel = res.steel;
        currentUser.factories = currentUser.factories || {};
        currentUser.factories[fid] = res.level;
        saveUser(); renderDock(); updateCredits();
        notify('Построено: уровень ' + res.level + ' за ' + (res.cost || 0).toLocaleString() + ' кр');
    }).catch(function () { notify('Сервер недоступен — стройка недоступна'); });
};
// =========================================================
// МОДУЛИ КОЛОНИИ: клон-комплекс и медмодули — считает сервер
// =========================================================
window.buyCloner = function () {
    ensureFleet(currentUser);
    var token = '';
    try { token = localStorage.getItem('galaktika_token') || ''; } catch (e) { token = ''; }
    if (!token) { notify('Войдите в игру'); return; }
    fetch('/api/build/module', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Auth-Token': token },
        body: JSON.stringify({ kind: 'cloner' })
    }).then(function (r) { return r.json(); }).then(function (res) {
        if (res.error) { notify(res.error); return; }
        if (window.pullServerProfile) window.pullServerProfile();
        if (typeof res.credits === 'number') currentUser.credits = res.credits;
        currentUser.cloners = res.count;
        saveUser(); updateCredits(); renderDock();
        notify('Комплекс клонирования куплен: всего ' + res.count);
    }).catch(function () { notify('Сервер недоступен'); });
};

window.buyMedical = function () {
    ensureFleet(currentUser);
    var token = '';
    try { token = localStorage.getItem('galaktika_token') || ''; } catch (e) { token = ''; }
    if (!token) { notify('Войдите в игру'); return; }
    fetch('/api/build/module', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Auth-Token': token },
        body: JSON.stringify({ kind: 'medical_buy' })
    }).then(function (r) { return r.json(); }).then(function (res) {
        if (res.error) { notify(res.error); return; }
        if (window.pullServerProfile) window.pullServerProfile();
        if (typeof res.credits === 'number') currentUser.credits = res.credits;
        currentUser.medModules = res.count;
        saveUser(); updateCredits(); renderDock();
        notify('Медицинский модуль куплен: всего ' + res.count);
    }).catch(function () { notify('Сервер недоступен'); });
};

window.buildMedical = function () {
    ensureFleet(currentUser);
    var token = '';
    try { token = localStorage.getItem('galaktika_token') || ''; } catch (e) { token = ''; }
    if (!token) { notify('Войдите в игру'); return; }
    fetch('/api/build/module', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Auth-Token': token },
        body: JSON.stringify({ kind: 'medical_build' })
    }).then(function (r) { return r.json(); }).then(function (res) {
        if (res.error) { notify(res.error); return; }
        if (window.pullServerProfile) window.pullServerProfile();
        if (typeof res.credits === 'number') currentUser.credits = res.credits;
        currentUser.medModules = res.count;
        saveUser(); updateCredits(); renderDock();
        notify('Медицинский модуль построен: всего ' + res.count);
    }).catch(function () { notify('Сервер недоступен'); });
};
// =========================================================
// СТРОЙКА С ВРЕМЕНЕМ: заказ уходит в серверную очередь (js/build.js)
// =========================================================
function __queueBuild(kind, id) {
    if (typeof window.buildStart === 'function') return window.buildStart(kind, id);
    notify('Модуль стройки не загрузился');
    return null;
}
window.buyShip = function (shipId) { ensureFleet(currentUser); __queueBuild('ship', shipId); };
window.buildFactory = function (fid) { ensureFleet(currentUser); __queueBuild('factory', fid); };
window.buyCloner = function () { ensureFleet(currentUser); __queueBuild('module', 'cloner'); };
window.buyMedical = function () { ensureFleet(currentUser); __queueBuild('module', 'medical_buy'); };
// Общий план: корабли в реальном масштабе не видны — прячем до приближения
const SHIP_HIDE_BELOW_SCALE = 0.22;

window.buildMedical = function () { ensureFleet(currentUser); __queueBuild('module', 'medical_build'); };