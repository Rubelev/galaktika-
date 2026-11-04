// Мультиязычность: строки интерфейса по языку профиля.
// Игра хранит язык в currentUser.lang; здесь — словари и функция t().

export const LANGS = {
    ru: 'Русский',
    en: 'English',
    zh: '中文'
};

const DICT = {
    ru: {
        menu_play: 'Игра',
        menu_econ: 'Экономика',
        menu_sci: 'Наука',
        menu_chat: 'Чат',
        menu_admin: 'Администраторы',
        market: 'Биржа',
        black_market: 'Чёрный рынок',
        science: 'Наука',
        buildings: 'Постройки',
        chat: 'Чат',
        guild: 'Гильдия',
        admin: 'Админка',
        monitor: 'Монитор',
        history: 'История',
        quests: 'Квесты',
        codex: 'Справочник',
        fleet: 'Флот',
        resources: 'Ресурсы',
        systems: 'Системы',
        intel: 'Разведсводка',
        surface: 'Поверхность',
        map: 'Карта',
        encyclopedia: 'Энциклопедия',
        credits: 'Кредиты',
        population: 'Население',
        buy: 'Купить',
        build: 'Построить',
        close: 'Закрыть',
        back: 'Назад',
        next: 'Далее',
        skip: 'Пропустить',
        loading: 'Загрузка…'
    },
    en: {
        menu_play: 'Game',
        menu_econ: 'Economy',
        menu_sci: 'Science',
        menu_chat: 'Chat',
        menu_admin: 'Administrators',
        market: 'Exchange',
        black_market: 'Black market',
        science: 'Science',
        buildings: 'Buildings',
        chat: 'Chat',
        guild: 'Guild',
        admin: 'Admin',
        monitor: 'Monitor',
        history: 'History',
        quests: 'Quests',
        codex: 'Codex',
        fleet: 'Fleet',
        resources: 'Resources',
        systems: 'Systems',
        intel: 'Intel',
        surface: 'Surface',
        map: 'Map',
        encyclopedia: 'Encyclopedia',
        credits: 'Credits',
        population: 'Population',
        buy: 'Buy',
        build: 'Build',
        close: 'Close',
        back: 'Back',
        next: 'Next',
        skip: 'Skip',
        loading: 'Loading…'
    },
    zh: {
        menu_play: '游戏',
        menu_econ: '经济',
        menu_sci: '科研',
        menu_chat: '聊天',
        menu_admin: '管理',
        market: '交易所',
        black_market: '黑市',
        science: '科研',
        buildings: '建筑',
        chat: '聊天',
        guild: '公会',
        admin: '管理台',
        monitor: '监控',
        history: '历史',
        quests: '任务',
        codex: '手册',
        fleet: '舰队',
        resources: '资源',
        systems: '星系',
        intel: '情报',
        surface: '地表',
        map: '星图',
        encyclopedia: '百科',
        credits: '信用点',
        population: '人口',
        buy: '购买',
        build: '建造',
        close: '关闭',
        back: '返回',
        next: '下一步',
        skip: '跳过',
        loading: '加载中…'
    }
};

// Язык по умолчанию — русский, если в профиле не задан.
export function langOf(user) {
    const l = (user && user.lang) || localStorage.getItem('gm_lang') || 'ru';
    return DICT[l] ? l : 'ru';
}

export function setLang(l) {
    if (!DICT[l]) return;
    localStorage.setItem('gm_lang', l);
    document.documentElement.lang = l;
    document.documentElement.dir = 'ltr';
}

export function t(key, user) {
    const l = langOf(user);
    return (DICT[l] && DICT[l][key]) || DICT.ru[key] || key;
}

export function dict(l) { return DICT[l] || DICT.ru; }

export function selfCheck() {
    const keys = Object.keys(DICT.ru);
    const same = ['en', 'zh'].every(l => keys.every(k => DICT[l][k]));
    return { ok: same, keys: keys.length, langs: Object.keys(DICT) };
}
