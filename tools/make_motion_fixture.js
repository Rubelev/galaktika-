// Генерирует эталон для PHP-теста: считает позы JS-ядром и сохраняет JSON.
// Запуск: node galaktika/tools/make_motion_fixture.js
'use strict';
const fs = require('fs');
const path = require('path');
const MC = require(path.join(__dirname, '..', 'src', 'galaktika.Web', 'wwwroot', 'js', 'motion-core.js'));

const world = {
    bodies: {
        earth: { x: 0, y: 0 },
        mars: { x: 102, y: 0 },
        jupiter: { x: 527, y: 60 },
        saturn: { x: 620, y: -40 },
        moon: { x: 18, y: 10 }
    }
};

const ships = [
    {
        id: 'hauler-1', cls: 'hauler', at: 'earth', startedAt: 0,
        orders: [
            { op: 'MOVE_TO', to: 'mars' },
            { op: 'ORBIT', at: 'mars', radius: 26, turns: 1, sec: 240 },
            { op: 'LAND', at: 'mars' },
            { op: 'UNLOAD', sec: 120 },
            { op: 'MOVE_TO', to: 'earth' },
            { op: 'HOLD', at: 'earth', sec: 300 }
        ]
    },
    {
        id: 'light-1', cls: 'light', at: 'mars', startedAt: 0,
        orders: [
            { op: 'MOVE_TO', to: 'jupiter' },
            { op: 'PATROL', points: ['jupiter', 'saturn', 'earth'], loops: 2 }
        ]
    },
    {
        id: 'fighter-1', cls: 'fighter', at: 'earth', startedAt: 0,
        orders: [
            { op: 'MOVE_TO', to: 'jupiter' },
            { op: 'LOAD', sec: 90 },
            { op: 'MOVE_TO', to: 'moon' }
        ]
    }
];

const samples = [0, 60000, 300000, 1200000, 3600000, 7200000, 12000000, 24000000, 36000000];
const expected = ships.map(ship => {
    const out = {};
    samples.forEach(t => {
        const p = MC.poseAt(ship, t, world);
        out[String(t)] = { x: p.x, y: p.y, ang: p.ang, op: p.op };
    });
    return out;
});

const fixture = { world, ships, samples, expected };
const outPath = path.join(__dirname, '..', 'reports', 'motion_fixture.json');
fs.writeFileSync(outPath, JSON.stringify(fixture, null, 1), 'utf8');
console.log('эталон записан:', outPath, '| бортов:', ships.length, '| точек:', samples.length);
