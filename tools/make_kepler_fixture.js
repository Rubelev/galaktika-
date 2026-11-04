// Эталон позиций Кеплера для сверки PHP с JS
const fs = require('fs'), path = require('path');
const K = require(path.join(__dirname, '..', 'src', 'galaktika.Web', 'wwwroot', 'js', 'orbit-kepler.js'));
const orbits = [
  { id: 'mercury', a: 0.3871, e: 0.2056, i: 7.0, om: 48.33, w: 29.12, M0: 174.79, P: 87.97 },
  { id: 'earth', a: 1.0, e: 0.0167, i: 0.0, om: -11.26, w: 114.21, M0: 358.62, P: 365.25 },
  { id: 'mars', a: 1.5237, e: 0.0934, i: 1.85, om: 49.56, w: 286.5, M0: 19.39, P: 686.98 },
  { id: 'jupiter', a: 5.2026, e: 0.0484, i: 1.3, om: 100.49, w: 273.87, M0: 20.02, P: 4331.0 },
  { id: 'sedna', a: 506.0, e: 0.849, i: 11.93, om: 144.25, w: 311.29, M0: 358.12, P: 4400000.0 }
];
const times = [0, 1793500000000, 2000000000000];
const out = { orbits: orbits, times: times, expected: {} };
orbits.forEach(function (o) {
  out.expected[o.id] = times.map(function (t) {
    const p = K.position(o, t);
    return { x: p.x, y: p.y, z: p.z };
  });
});
fs.writeFileSync(path.join(__dirname, '..', 'reports', 'kepler_fixture.json'), JSON.stringify(out));
console.log('эталон Кеплера:', orbits.length, 'орбит ×', times.length, 'моментов');