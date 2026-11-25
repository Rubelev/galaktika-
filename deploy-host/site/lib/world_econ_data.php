<?php
// СГЕНЕРИРОВАНО из db/galaktika.db (world_event_econ)
// H-02 (2026-11-08): арены Вармира перебалансированы — при заполнении 25 % маржа 20 %,
// при 100 % — 53–55 % (было: 5 из 6 арен в минусе при 25 %). Тарсис не тронут
// (контроль: 216 540 кр при 30 %, 1 750 800 кр при 100 %).
// Правка внесена и в db/galaktika.db → world_event_econ, чтобы регенерация её не откатила.
$GLOBALS['WORLD_ECON'] = array(
  array('id'=>'race_tarsis','world'=>'tarsis','event'=>'Заезд на Тарсисе','capacity'=>15000,'ticket'=>80.0,'bet_margin'=>0.12,'bet_per_guest'=>700.0,'kg_food'=>0.3,'l_water'=>3.0,'kwh'=>2.4,'lux_share'=>0.32,'staff'=>180,'pay'=>1200.0,'prize'=>180000.0,'upkeep'=>45000.0),
  array('id'=>'war_pit','world'=>'war','event'=>'Арена «Яма»','capacity'=>2000,'ticket'=>45.0,'bet_margin'=>0.07,'bet_per_guest'=>300.0,'kg_food'=>0.3,'l_water'=>3.0,'kwh'=>1.5,'lux_share'=>0.32,'staff'=>10,'pay'=>900.0,'prize'=>5200.0,'upkeep'=>3000.0),
  array('id'=>'war_colosseum','world'=>'war','event'=>'Колизей','capacity'=>8000,'ticket'=>52.0,'bet_margin'=>0.065,'bet_per_guest'=>280.0,'kg_food'=>0.3,'l_water'=>3.0,'kwh'=>1.8,'lux_share'=>0.32,'staff'=>36,'pay'=>1000.0,'prize'=>22300.0,'upkeep'=>16000.0),
  array('id'=>'war_trenches','world'=>'war','event'=>'Траншеи','capacity'=>12000,'ticket'=>58.0,'bet_margin'=>0.055,'bet_per_guest'=>300.0,'kg_food'=>0.3,'l_water'=>3.0,'kwh'=>2.2,'lux_share'=>0.32,'staff'=>54,'pay'=>1100.0,'prize'=>35000.0,'upkeep'=>25000.0),
  array('id'=>'war_dome','world'=>'war','event'=>'Купол','capacity'=>20000,'ticket'=>64.0,'bet_margin'=>0.04,'bet_per_guest'=>300.0,'kg_food'=>0.3,'l_water'=>3.0,'kwh'=>2.6,'lux_share'=>0.32,'staff'=>84,'pay'=>1200.0,'prize'=>60000.0,'upkeep'=>40200.0),
  array('id'=>'war_sphere','world'=>'war','event'=>'Сфера','capacity'=>30000,'ticket'=>70.0,'bet_margin'=>0.03,'bet_per_guest'=>300.0,'kg_food'=>0.3,'l_water'=>3.0,'kwh'=>3.2,'lux_share'=>0.32,'staff'=>119,'pay'=>1300.0,'prize'=>92000.0,'upkeep'=>63900.0),
);
