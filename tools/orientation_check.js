// Проверка конвенции углов: перигелий на экране против Ω+ω из каталога.
// В нашей цепочке ν=0 → поворот на ω → сжатие по i → поворот на Ω.
// Ожидание: экранный угол перигелия ≈ Ω + atan2(sinω·cos i, cosω), что при
// малом i близко к ϖ = Ω+ω (долгота перигелия из астрономии).
const planets = [
  { id: 'mercury', i: 7.005, om: 48.331, w: 29.124, varpi: 77.456 },
  { id: 'pluto',   i: 17.16, om: 110.299, w: 113.834, varpi: 224.07 }
];
const deg = r => r * 180 / Math.PI, rad = d => d * Math.PI / 180;
let bad = 0;
planets.forEach(p => {
  const w = rad(p.w), om = rad(p.om), inc = rad(p.i);
  // ν = 0: X0 = r, Y0 = 0
  const X1 = Math.cos(w), Y1 = Math.sin(w);
  const Y2 = Y1 * Math.cos(inc);
  const xs = X1 * Math.cos(om) - Y2 * Math.sin(om);
  const ys = X1 * Math.sin(om) + Y2 * Math.cos(om);
  let ang = deg(Math.atan2(ys, xs)); if (ang < 0) ang += 360;
  // Допуск 2°: при большом наклоне (Плутон i=17°) экранный угол перигелия
  // законно отличается от ϖ на величину порядка ω − atan2(sinω·cos i, cosω),
  // плюс округление элементов в каталоге.
  const expected = deg(Math.atan2(Math.sin(w) * Math.cos(inc), Math.cos(w))) + p.om;
  const diff = Math.min(Math.abs(ang - p.varpi), 360 - Math.abs(ang - p.varpi));
  const ok = diff <= 2.0;
  if (!ok) bad++;
  console.log((ok ? 'OK   ' : 'FAIL ') + p.id + ' экранный=' + ang.toFixed(2) +
    '° (формула Ω+atan2(sinω·cos i, cosω)=' + ((expected % 360 + 360) % 360).toFixed(2) + '°)' +
    ' экранный перигелий=' + ang.toFixed(2) + '° · ϖ из каталога=' + p.varpi.toFixed(2) +
    '° · расхождение=' + diff.toFixed(2) + '°');
});
console.log('ИТОГ: ' + (planets.length - bad) + '/' + planets.length + ' тел — конвенция углов совпадает с астрономической');
process.exit(bad ? 1 : 0);