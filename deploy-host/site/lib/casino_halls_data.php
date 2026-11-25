<?php
// СГЕНЕРИРОВАНО из db/galaktika.db (casino_zone, casino_hall)
$GLOBALS['CASINO_ZONES'] = array(
  array('id'=>'roulette','name'=>'Рулетки','theme'=>'Зал вращающихся колёс','min_stake'=>10,'max_stake'=>200000,'description'=>'Все рулетки мира: от европейской до молнийной'),
  array('id'=>'slots','name'=>'Игровые автоматы','theme'=>'Неоновые ряды','min_stake'=>5,'max_stake'=>50000,'description'=>'От одноруких бандитов до голографических автоматов'),
  array('id'=>'cards','name'=>'Карты','theme'=>'Тихие залы: сигары, виски, кожа','min_stake'=>100,'max_stake'=>1000000,'description'=>'Блэкджек, покер, бридж — тишина и дым'),
  array('id'=>'horses','name'=>'Скачки','theme'=>'Ипподром на кольцах','min_stake'=>50,'max_stake'=>200000,'description'=>'Лошади и гибриды: от робо-коней до метановых скакунов'),
  array('id'=>'sports','name'=>'Спорт','theme'=>'Олимпийская арена','min_stake'=>100,'max_stake'=>500000,'description'=>'Люди и андроиды: забеги, дуэли, прыжки'),
);
$GLOBALS['CASINO_HALLS'] = array(
  array('id'=>'roul_bronze','zone_id'=>'roulette','name'=>'Бронзовый зал','tier'=>1,'stake_min'=>10,'stake_max'=>2000,'tables'=>12,'vibe'=>'винил, официанты в жилетах'),
  array('id'=>'roul_silver','zone_id'=>'roulette','name'=>'Серебряный зал','tier'=>2,'stake_min'=>200,'stake_max'=>25000,'tables'=>8,'vibe'=>'зеркала, хрусталь'),
  array('id'=>'roul_gold','zone_id'=>'roulette','name'=>'Золотой зал','tier'=>3,'stake_min'=>1000,'stake_max'=>120000,'tables'=>6,'vibe'=>'золото, ложи'),
  array('id'=>'roul_platinum','zone_id'=>'roulette','name'=>'Платиновый зал','tier'=>4,'stake_min'=>5000,'stake_max'=>400000,'tables'=>4,'vibe'=>'только по приглашениям'),
  array('id'=>'roul_void','zone_id'=>'roulette','name'=>'Зал Пустоты','tier'=>5,'stake_min'=>50000,'stake_max'=>2000000,'tables'=>1,'vibe'=>'ноль гравитации, один стол'),
  array('id'=>'slot_street','zone_id'=>'slots','name'=>'Улица автоматов','tier'=>1,'stake_min'=>5,'stake_max'=>500,'tables'=>120,'vibe'=>'неон, музыка, толпа'),
  array('id'=>'slot_arcade','zone_id'=>'slots','name'=>'Аркада','tier'=>2,'stake_min'=>20,'stake_max'=>5000,'tables'=>80,'vibe'=>'голограммы, ретро-крин'),
  array('id'=>'slot_vault','zone_id'=>'slots','name'=>'Хранилище','tier'=>3,'stake_min'=>100,'stake_max'=>25000,'tables'=>30,'vibe'=>'сейфы, ставки вслепую'),
  array('id'=>'card_smoke','zone_id'=>'cards','name'=>'Курительный зал','tier'=>2,'stake_min'=>100,'stake_max'=>20000,'tables'=>14,'vibe'=>'сигары, виски, приглушённый свет'),
  array('id'=>'card_private','zone_id'=>'cards','name'=>'Приватные кабинеты','tier'=>4,'stake_min'=>1000,'stake_max'=>300000,'tables'=>6,'vibe'=>'один стол, охрана'),
  array('id'=>'card_bridge','zone_id'=>'cards','name'=>'Бридж-салон','tier'=>3,'stake_min'=>500,'stake_max'=>50000,'tables'=>8,'vibe'=>'тишина, только карты'),
  array('id'=>'horse_ring','zone_id'=>'horses','name'=>'Кольцевой ипподром','tier'=>1,'stake_min'=>50,'stake_max'=>10000,'tables'=>1,'vibe'=>'кольца Цереры'),
  array('id'=>'horse_titan','zone_id'=>'horses','name'=>'Метановые равнины','tier'=>3,'stake_min'=>500,'stake_max'=>80000,'tables'=>1,'vibe'=>'Титан, жидкий метан'),
  array('id'=>'horse_ice','zone_id'=>'horses','name'=>'Ледяной трек','tier'=>4,'stake_min'=>1000,'stake_max'=>150000,'tables'=>1,'vibe'=>'Европа, лёд'),
  array('id'=>'sport_arena','zone_id'=>'sports','name'=>'Олимпийская арена','tier'=>2,'stake_min'=>100,'stake_max'=>30000,'tables'=>1,'vibe'=>'зрители 30 000'),
  array('id'=>'sport_zero','zone_id'=>'sports','name'=>'Нулевая гравитация','tier'=>4,'stake_min'=>500,'stake_max'=>200000,'tables'=>1,'vibe'=>'арена на орбите'),
);
