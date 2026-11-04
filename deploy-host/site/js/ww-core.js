// ============================================================================
//  WW-CORE.JS — механика WAR WORLD: клоны, снаряжение, арены, бой.
//  Чистые функции без DOM — их же проверяет tools/ww_core_test.js.
//  Документ: docs/LORE-WARWORLD-COMBAT.md
// ============================================================================
(function (global) {
    'use strict';

    const MIN_GROW_MIN = 60;          // минимум 60 минут реального времени
    const BASE_COST = 100;
    const STATS = ['dex', 'cun', 'str', 'end', 'spd'];

    // ---- клон ----
    function sumStats(stats) {
        return STATS.reduce(function (a, k) { return a + (Number(stats[k]) || 0); }, 0);
    }
    function growMinutes(stats) {
        const s = sumStats(stats);
        return MIN_GROW_MIN * (1 + Math.max(0, s - 30) / 45);
    }
    function cost(stats) {
        const s = sumStats(stats);
        return Math.round(BASE_COST * (1 + Math.max(0, s - 30) / 20));
    }
    function cloneInfo(stats) {
        const s = sumStats(stats);
        return { sum: s, minutes: +growMinutes(stats).toFixed(1), cost: cost(stats),
                 hp: 40 + (Number(stats.end) || 0) * 3 };
    }

    // ---- снаряжение ----
    const GEAR = {
        weapon: { 1: 4, 2: 7, 3: 11, 4: 16, 5: 22 },
        armor:  { 1: 2, 2: 4, 3: 7, 4: 11, 5: 16 },
        ammo:   { 1: 1, 2: 2, 3: 4, 4: 6, 5: 9 }
    };
    function gearBonus(kind, tier) {
        const t = Math.max(1, Math.min(5, Math.floor(tier || 1)));
        return (GEAR[kind] && GEAR[kind][t]) || 0;
    }

    // ---- арены ----
    const ARENAS = {
        pit:     { name: 'Яма', tier: 1, weapons: 'топоры, мечи, луки' },
        colosseum:{ name: 'Колизей', tier: 2, weapons: 'копья, щиты' },
        trenches:{ name: 'Траншеи', tier: 3, weapons: 'огнестрел, гранаты' },
        dome:    { name: 'Купол', tier: 4, weapons: 'плазма, экзоскелеты' },
        sphere:  { name: 'Сфера', tier: 5, weapons: 'бластеры, лазерные мечи' }
    };
    function arenaAllows(arenaId, tier) {
        const a = ARENAS[arenaId];
        if (!a) return false;
        return Math.floor(tier || 1) <= a.tier;
    }

    // ---- бой ----
    function makeFighter(clone, loadout) {
        const c = cloneInfo(clone);
        const w = gearBonus('weapon', loadout && loadout.weaponTier);
        const a = gearBonus('armor', loadout && loadout.armorTier);
        const am = gearBonus('ammo', loadout && loadout.ammoTier);
        return {
            stats: Object.assign({}, clone),
            hp: c.hp,
            weapon: w + am, armor: a,
            power: c.sum + w + a + am
        };
    }

    // детерминированный ГПСЧ (mulberry32), чтобы бой был воспроизводим
    function rng(seed) {
        let t = seed >>> 0;
        return function () {
            t += 0x6D2B79F5;
            let r = Math.imul(t ^ (t >>> 15), 1 | t);
            r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
            return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
        };
    }

    function fight(a, b, seed) {
        // бой не должен портить исходные объекты: копируем бойцов,
        // иначе второй вызов с тем же seed даёт другой результат
        a = Object.assign({}, a, { stats: Object.assign({}, a.stats) });
        b = Object.assign({}, b, { stats: Object.assign({}, b.stats) });
        const r = rng(seed || 1);
        const log = [];
        let round = 0;
        while (a.hp > 0 && b.hp > 0 && round < 30) {
            round++;
            const order = (a.stats.spd + a.stats.dex / 2 >= b.stats.spd + b.stats.dex / 2) ? [a, b] : [b, a];
            for (const [atk, def] of [[order[0], order[1]], [order[1], order[0]]]) {
                if (atk.hp <= 0 || def.hp <= 0) continue;
                const hit = 0.5 + (atk.stats.dex - def.stats.dex) / 40;
                if (r() > Math.max(0.05, Math.min(0.95, hit))) {
                    log.push({ round, miss: true, by: atk.stats.name || 'atk' });
                    continue;
                }
                if (r() < Math.min(0.5, def.stats.dex / 100)) {
                    log.push({ round, dodge: true, by: def.stats.name || 'def' });
                    continue;
                }
                const crit = r() < Math.min(0.6, atk.stats.cun / 100);
                let dmg = atk.stats.str + atk.weapon - def.armor;
                dmg = Math.max(1, Math.round(dmg * (crit ? 2 : 1)));
                def.hp -= dmg;
                log.push({ round, dmg, crit, attackerHp: atk.hp, defenderHp: def.hp });
            }
        }
        const winner = (a.hp > 0 && b.hp <= 0) ? 'a' : (b.hp > 0 && a.hp <= 0) ? 'b' : 'draw';
        return { winner, rounds: round, aHp: Math.max(0, a.hp), bHp: Math.max(0, b.hp), log };
    }

    global.WWCore = {
        STATS, MIN_GROW_MIN, ARENAS, GEAR,
        sumStats, growMinutes, cost, cloneInfo,
        gearBonus, arenaAllows, makeFighter, fight, rng
    };
    if (typeof module !== 'undefined' && module.exports) module.exports = global.WWCore;
})(typeof window !== 'undefined' ? window : globalThis);
