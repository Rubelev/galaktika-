| № | Цель | Центр (x,y) | elementFromPoint | Ожидаемое | Факт | Итог |
|---|---|---|---|---|---|---|
| 1 | планета mercury | 731, 445 | `div.planet` | глобус/наезд | globe=flex; оверлей globe-modal | успех |
| 2 | планета venus | 619, 349 | `div.planet` | глобус/наезд | globe=flex; оверлей globe-modal | успех |
| 3 | планета earth | 673, 510 | `div.ship-marker.trade-ship` | глобус/наезд | оверлей fleet-card; scale 0.591176→4 rotX 0→0 rotZ 0→8 | успех |
| 4 | планета mars | 613, 514 | `div.ship-marker.trade-ship` | глобус/наезд | оверлей fleet-card; scale 0.591176→4 rotX 0→0 rotZ 0→8 | успех |
| 5 | планета jupiter | 875, 344 | `div.planet` | глобус/наезд | globe=flex; оверлей globe-modal | успех |
| 6 | планета saturn | 895, 291 | `div.planet.saturn` | глобус/наезд | globe=flex; оверлей globe-modal | успех |
| 7 | планета uranus | 664, 685 | `div.planet` | глобус/наезд | globe=flex; оверлей globe-modal | успех |
| 8 | планета neptune | 997, 527 | `div.planet` | глобус/наезд | globe=flex; оверлей globe-modal | успех |
| 9 | планета pluto | 331, 470 | `div.planet` | глобус/наезд | globe=flex; оверлей globe-modal | успех |
| 10 | луна Луна | 668, 536 | `div.moon.spaceport-moon` | карточка/вид | globe=flex; оверлей globe-modal | успех |
| 11 | луна Титан | 869, 341 | `div.moon` | карточка/вид | globe=flex; оверлей globe-modal | успех |
| 12 | луна Европа | 845, 316 | `div.ship-marker` | карточка/вид | оверлей fleet-card; scale 0.591176→4 rotX 0→0 rotZ 0→8; toast: ПОЯС-02-355 · 2.93 а.е. · период 238.1 г | успех |
| 13 | Врата | 395, 511 | `div.portal-core` | окно систем | оверлей systems-modal | успех |
| 14 | астероид пояса | 407, 436 | `div.solar-system` | сообщение | toast: ПОЯС-13-001 · 3.39 а.е. · период 206.3 г | успех |
| 15 | флот fleet-0 | 671, 574 | `div.ship-marker.ship-marker--fleet` | карточка борта | scale 0.95→4 rotX 0→0 rotZ 0→8 | камера без карточки |
| 16 | торговец earth-mars-0 | 615, 514 | `div.ship-marker.trade-ship` | карточка борта | без изменений | нет эффекта |
| 17 | гражданский civil-5 | 707, 571 | `div.ship-marker` | карточка борта | оверлей fleet-card; scale 0.95→4 rotX 0→0 rotZ 0→8 | успех |
| 18 | пират pirate-0 | 651, 594 | `div.ship-marker` | карточка борта | оверлей fleet-card; scale 0.95→4 rotX 0→0 rotZ 0→8 | успех |
| 19 | зум + | 1324, 307 | `button.zoom-btn` | изменение камеры | scale 0.591176→0.73897 rotX 0→0 rotZ 0→0 | успех |
| 20 | зум − | 1236, 307 | `button.zoom-btn` | изменение камеры | scale 0.591176→0.472941 rotX 0→0 rotZ 0→0 | успех |
| 21 | наклон ▲ | 1143, 254 | `button.d-btn.up` | изменение камеры | scale 0.591176→0.591176 rotX 0→-10 rotZ 0→0 | успех |
| 22 | наклон ▼ | 1143, 332 | `button.d-btn.down` | изменение камеры | scale 0.591176→0.591176 rotX 0→10 rotZ 0→0 | успех |
| 23 | поворот ◀ | 1104, 293 | `button.d-btn.left` | изменение камеры | scale 0.591176→0.591176 rotX 0→0 rotZ 0→-10 | успех |
| 24 | поворот ▶ | 1182, 293 | `button.d-btn.right` | изменение камеры | scale 0.591176→0.591176 rotX 0→0 rotZ 0→10 | успех |
| 25 | сброс • | 1143, 293 | `button.d-btn.center` | изменение камеры | без изменений | нет эффекта |
| 26 | Фильтры | 1216, 475 | `button.view-head` | изменение камеры | без изменений | нет эффекта |
| 27 | чекбокс Все маршруты | 1097, 390 | `input#routes-all` | смена состояния | без изменений | нет эффекта |
| 28 | чекбокс Только свои | 1107, 409 | `input#routes-own` | смена состояния | checked: routes-all=1,routes-own=0,fleet-routes-toggle=1,=1,=1,=1,=1,=1,station-toggle=1,=1 → routes-all=0,routes-own=1,fleet-routes-toggle=1,=1,=1,=1 | успех |
| 29 | чекбокс Маршруты флотов | 1097, 438 | `input#fleet-routes-toggle` | смена состояния | checked: routes-all=0,routes-own=1,fleet-routes-toggle=1,=1,=1,=1,=1,=1,station-toggle=1,=1 → routes-all=0,routes-own=1,fleet-routes-toggle=0,=1,=1,=1 | успех |
| 30 | чекбокс Станции и лифты | 1097, 642 | `input#station-toggle` | смена состояния | checked: routes-all=0,routes-own=1,fleet-routes-toggle=0,=1,=1,=1,=1,=1,station-toggle=1,=1 → routes-all=0,routes-own=1,fleet-routes-toggle=0,=1,=1,=1 | успех |
| 31 | меню Флот | 165, 40 | `div.menu-sec-title` | окно/панель | без изменений | нет эффекта |
| 32 | меню Торговля | 165, 606 | `div.res-group-head` | окно/панель | без изменений | нет эффекта |
| 33 | пустое место 700,760 | 700, 760 | `div.solar-system-container` | ничего не открывать | без изменений | успех |
| 34 | пустое место 500,120 | 500, 120 | `div.solar-system-container` | ничего не открывать | без изменений | успех |

ИТОГО успех: 27 из 34