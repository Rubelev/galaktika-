// ============================================================================
//  СВЯЗИ: что править вместе с этим файлом
//  ---------------------------------------------------------------------------
//  Матрица «корпус → масса/двигатели/тяга» для карточек кораблей и каталога.
//
//   1) js/motion.js — TABLES.ships хранит ТЕ ЖЕ корпуса и доли скорости
//      (share: грузовик 0.30, лёгкий 0.40, истребитель 1.00 от 50 000 км/с).
//      Меняешь корпус или долю — правь в обоих файлах.
//   2) js/solar.js — карточка борта показывает скорость через Motion.shipSpeed,
//      но подписи/каталог берут имена отсюда.
//   3) tools/verify_math.js — проверяет классы скоростей (49 проверок).
//   4) html-шаблоны — <script src="js/speedmodel.js?v=N">, поднимай N.
// ============================================================================

// Матрица скоростей флота.
// Скорость = тяга двигателей / масса корпуса, с поправками на модернизацию
// двигателей и общий уровень технологий.
//
// Формула:  v = K * (двигателей * тяга_одного * (1 + 0.08*уровень_двигателя))
//                     / масса_корпуса * (1 + 0.05*уровень_технологий)
// K подобрана так, чтобы «Искра» (1 двигатель, 45 т) на стоке давала 100 км/с.
(function () {
    'use strict';

    const K = 10;                    // калибровка: 100 км/с у эталонного борта
    const ENGINE_BONUS = 0.08;       // +8 % за уровень модернизации двигателя
    const TECH_BONUS = 0.05;         // +5 % за уровень технологий
    const MAX_ENGINE_LEVEL = 5;
    const MAX_TECH_LEVEL = 10;

    // масса (т), количество двигателей, тяга одного двигателя (усл. кН)
    const FLEET = {
        jet_scout:     { name: '«Искра»',      mass: 45,  engines: 1, thrust: 450,  drive: 'jet' },
        jet_hauler:    { name: '«Баржа»',      mass: 320, engines: 2, thrust: 800,  drive: 'jet' },
        ion_courier:   { name: '«Стриж»',      mass: 90,  engines: 2, thrust: 1200, drive: 'ion' },
        ion_corsair:   { name: 'Корсар',       mass: 140, engines: 2, thrust: 1300, drive: 'ion' },
        ion_prospector:{ name: '«Геолог»',     mass: 180, engines: 2, thrust: 1000, drive: 'ion' },
        grav_frigate:  { name: 'Фрегат',       mass: 260, engines: 3, thrust: 1100, drive: 'grav' },
        plasma_interceptor: { name: 'Перехватчик', mass: 120, engines: 3, thrust: 900, drive: 'plasma' }
    };

    function speedKmS(id, opts) {
        const def = FLEET[id];
        if (!def) return null;
        const o = opts || {};
        const engineLevel = Math.max(0, Math.min(MAX_ENGINE_LEVEL, o.engineLevel || 0));
        const techLevel = Math.max(0, Math.min(MAX_TECH_LEVEL, o.techLevel || 0));
        const engines = Math.max(1, Math.round(o.engines || def.engines));
        const thrust = def.thrust * (1 + ENGINE_BONUS * engineLevel);
        const tech = 1 + TECH_BONUS * techLevel;
        const v = K * (engines * thrust) / def.mass * tech;
        return Math.round(v * 10) / 10;
    }

    function matrix(opts) {
        const out = [];
        for (const id in FLEET) {
            out.push({
                id: id,
                name: FLEET[id].name,
                mass: FLEET[id].mass,
                engines: FLEET[id].engines,
                thrust: FLEET[id].thrust,
                speed: speedKmS(id, opts)
            });
        }
        return out;
    }

    // Время рейса: расстояние / скорость. Возвращает игровые секунды.
    function travelGameSeconds(distKm, id, opts) {
        const v = speedKmS(id, opts) || 100;
        return distKm / v;
    }

    window.SpeedModel = {
        K: K,
        ENGINE_BONUS: ENGINE_BONUS,
        TECH_BONUS: TECH_BONUS,
        MAX_ENGINE_LEVEL: MAX_ENGINE_LEVEL,
        MAX_TECH_LEVEL: MAX_TECH_LEVEL,
        FLEET: FLEET,
        speedKmS: speedKmS,
        matrix: matrix,
        travelGameSeconds: travelGameSeconds
    };
})();
