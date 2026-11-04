
INSERT OR IGNORE INTO system_type(id,name,purpose,notes) VALUES
 ('race','Система гонок','зрелище','арена на луне, заводы и мастерские'),
 ('war','Вармир','вечная война','клоны вместо людей, фронт'),
 ('home','Домашняя','экономика','торговля, колонии');

INSERT OR IGNORE INTO body_type(id,name,kind,can_land,can_build,has_atmosphere,base_gravity,base_temp_c) VALUES
 ('star','Звезда','star',0,1,0,NULL,NULL),
 ('rocky','Скалистая планета','planet',1,1,1,1.0,15),
 ('gas','Газовый гигант','planet',0,1,1,2.5,-140),
 ('ice','Ледяная планета','planet',0,1,1,0.8,-210),
 ('moon_rock','Луна скалистая','moon',1,1,0,0.16,-50),
 ('moon_ice','Луна ледяная','moon',1,1,0,0.13,-160),
 ('belt','Пояс астероидов','belt',0,0,0,0,NULL),
 ('portal','Врата','portal',0,1,0,NULL,NULL);

INSERT OR IGNORE INTO physics_rule(id,name,value,unit,applies_to,note) VALUES
 ('max_c','Предел скорости',0.95,'c','all','ничто не быстрее света'),
 ('time_scale','Глобальный масштаб времени',1,'x','all','одна константа для моделирования'),
 ('px_per_au','Пикселей в а.е.',185,'px','scene','одна шкала для всех систем');

INSERT OR IGNORE INTO ship_class(id,name,accel_km_s2,vmax_c,hp,cargo_t,role) VALUES
 ('fighter','Истребитель',150,0.30,40,0,'перехват'),
 ('light','Лёгкий',80,0.25,30,20,'разведка'),
 ('hauler','Грузовой',30,0.15,20,120,'логистика'),
 ('heavy','Тяжёлый',15,0.10,60,400,'флот');

INSERT OR IGNORE INTO system(id,name,type_id,star_class,time_scale,px_per_au) VALUES
 ('sol','Солнечная система','home','G2V',1,185),
 ('war','Вармир','war','K1V',1,185);

INSERT OR IGNORE INTO body(id,system_id,parent_id,name,type_id,orbit_a_au,orbit_period_days,orbit_epoch_deg,orbit_incl_deg,radius_km,color,role,is_habitable) VALUES ('mercury','sol',NULL,'Меркурий','rocky',0.387,87.97,0,7.0,2440,'#a9a19a','factory',0);
INSERT OR IGNORE INTO body(id,system_id,parent_id,name,type_id,orbit_a_au,orbit_period_days,orbit_epoch_deg,orbit_incl_deg,radius_km,color,role,is_habitable) VALUES ('venus','sol',NULL,'Венера','rocky',0.723,224.7,3.4,3.39,6052,'#e6c88c','factory',0);
INSERT OR IGNORE INTO body(id,system_id,parent_id,name,type_id,orbit_a_au,orbit_period_days,orbit_epoch_deg,orbit_incl_deg,radius_km,color,role,is_habitable) VALUES ('earth','sol',NULL,'Земля','rocky',1.0,365.25,0,1.0,6371,'#5a96dc','home',1);
INSERT OR IGNORE INTO body(id,system_id,parent_id,name,type_id,orbit_a_au,orbit_period_days,orbit_epoch_deg,orbit_incl_deg,radius_km,color,role,is_habitable) VALUES ('mars','sol',NULL,'Марс','rocky',1.524,687.0,1.85,1.85,3390,'#c86e50','workshop',0);
INSERT OR IGNORE INTO body(id,system_id,parent_id,name,type_id,orbit_a_au,orbit_period_days,orbit_epoch_deg,orbit_incl_deg,radius_km,color,role,is_habitable) VALUES ('jupiter','sol',NULL,'Юпитер','gas',5.203,4331.0,1.3,1.3,69911,'#d2b48c','factory',0);
INSERT OR IGNORE INTO body(id,system_id,parent_id,name,type_id,orbit_a_au,orbit_period_days,orbit_epoch_deg,orbit_incl_deg,radius_km,color,role,is_habitable) VALUES ('saturn','sol',NULL,'Сатурн','gas',9.537,10747.0,2.49,2.49,58232,'#dcc896','arena-portal',0);
INSERT OR IGNORE INTO body(id,system_id,parent_id,name,type_id,orbit_a_au,orbit_period_days,orbit_epoch_deg,orbit_incl_deg,radius_km,color,role,is_habitable) VALUES ('uranus','sol',NULL,'Уран','ice',19.19,30589.0,0.77,0.77,25362,'#96d2dc','workshop',0);
INSERT OR IGNORE INTO body(id,system_id,parent_id,name,type_id,orbit_a_au,orbit_period_days,orbit_epoch_deg,orbit_incl_deg,radius_km,color,role,is_habitable) VALUES ('neptune','sol',NULL,'Нептун','ice',30.07,59800.0,1.77,1.77,24622,'#6e8ce6','betting',0);
INSERT OR IGNORE INTO body(id,system_id,parent_id,name,type_id,orbit_a_au,orbit_period_days,orbit_epoch_deg,orbit_incl_deg,radius_km,color,role,is_habitable) VALUES ('pluto','sol',NULL,'Плутон','ice',39.48,90560.0,17.16,17.16,1188,'#aaaab4','scrapyard',0);
INSERT OR IGNORE INTO body(id,system_id,parent_id,name,type_id,orbit_a_au,orbit_period_days,radius_km,color,role,is_habitable) VALUES ('moon','sol','earth','Луна','moon_rock',0.00257,27.32,1737,'#b8b8b8','workshop',0);
INSERT OR IGNORE INTO body(id,system_id,parent_id,name,type_id,orbit_a_au,orbit_period_days,radius_km,color,role,is_habitable) VALUES ('phobos','sol','mars','Фобос','moon_rock',6.3e-05,0.319,11,'#9a8a7a','scrapyard',0);
INSERT OR IGNORE INTO body(id,system_id,parent_id,name,type_id,orbit_a_au,orbit_period_days,radius_km,color,role,is_habitable) VALUES ('deimos','sol','mars','Деймос','moon_rock',0.000156,1.263,6,'#a89a8a','scrapyard',0);
INSERT OR IGNORE INTO body(id,system_id,parent_id,name,type_id,orbit_a_au,orbit_period_days,radius_km,color,role,is_habitable) VALUES ('io','sol','jupiter','Ио','moon_rock',0.00282,1.769,1822,'#e6d27a','factory',0);
INSERT OR IGNORE INTO body(id,system_id,parent_id,name,type_id,orbit_a_au,orbit_period_days,radius_km,color,role,is_habitable) VALUES ('europa','sol','jupiter','Европа','moon_ice',0.00449,3.551,1561,'#dcdcdc','factory',0);
INSERT OR IGNORE INTO body(id,system_id,parent_id,name,type_id,orbit_a_au,orbit_period_days,radius_km,color,role,is_habitable) VALUES ('ganymede','sol','jupiter','Ганимед','moon_rock',0.00716,7.155,2634,'#b5a898','workshop',0);
INSERT OR IGNORE INTO body(id,system_id,parent_id,name,type_id,orbit_a_au,orbit_period_days,radius_km,color,role,is_habitable) VALUES ('callisto','sol','jupiter','Каллисто','moon_ice',0.01259,16.689,2410,'#8f8577','workshop',0);
INSERT OR IGNORE INTO body(id,system_id,parent_id,name,type_id,orbit_a_au,orbit_period_days,radius_km,color,role,is_habitable) VALUES ('mimas','sol','saturn','Мимас','moon_ice',0.00124,0.942,198,'#cfcfcf','factory',0);
INSERT OR IGNORE INTO body(id,system_id,parent_id,name,type_id,orbit_a_au,orbit_period_days,radius_km,color,role,is_habitable) VALUES ('enceladus','sol','saturn','Энцелад','moon_ice',0.00159,1.37,252,'#e8e8e8','factory',0);
INSERT OR IGNORE INTO body(id,system_id,parent_id,name,type_id,orbit_a_au,orbit_period_days,radius_km,color,role,is_habitable) VALUES ('tethys','sol','saturn','Тефия','moon_ice',0.00197,1.888,531,'#d8d8d8','workshop',0);
INSERT OR IGNORE INTO body(id,system_id,parent_id,name,type_id,orbit_a_au,orbit_period_days,radius_km,color,role,is_habitable) VALUES ('dione','sol','saturn','Диона','moon_ice',0.00252,2.737,561,'#cfcfcf','workshop',0);
INSERT OR IGNORE INTO body(id,system_id,parent_id,name,type_id,orbit_a_au,orbit_period_days,radius_km,color,role,is_habitable) VALUES ('rhea','sol','saturn','Рея','moon_ice',0.00352,4.518,764,'#cccccc','factory',0);
INSERT OR IGNORE INTO body(id,system_id,parent_id,name,type_id,orbit_a_au,orbit_period_days,radius_km,color,role,is_habitable) VALUES ('titan','sol','saturn','Титан','moon_rock',0.00817,15.945,2575,'#e0b96a','factory',0);
INSERT OR IGNORE INTO body(id,system_id,parent_id,name,type_id,orbit_a_au,orbit_period_days,radius_km,color,role,is_habitable) VALUES ('iapetus','sol','saturn','Япет','moon_ice',0.0238,79.32,735,'#b8b0a4','scrapyard',0);
INSERT OR IGNORE INTO body(id,system_id,parent_id,name,type_id,orbit_a_au,orbit_period_days,radius_km,color,role,is_habitable) VALUES ('miranda','sol','uranus','Миранда','moon_ice',0.00087,1.413,236,'#d0d0d0','workshop',0);
INSERT OR IGNORE INTO body(id,system_id,parent_id,name,type_id,orbit_a_au,orbit_period_days,radius_km,color,role,is_habitable) VALUES ('ariel','sol','uranus','Ариэль','moon_ice',0.00128,2.52,579,'#dcdcdc','workshop',0);
INSERT OR IGNORE INTO body(id,system_id,parent_id,name,type_id,orbit_a_au,orbit_period_days,radius_km,color,role,is_habitable) VALUES ('umbriel','sol','uranus','Умбриэль','moon_ice',0.00178,4.144,585,'#a8a8a8','scrapyard',0);
INSERT OR IGNORE INTO body(id,system_id,parent_id,name,type_id,orbit_a_au,orbit_period_days,radius_km,color,role,is_habitable) VALUES ('titania','sol','uranus','Титания','moon_ice',0.00292,8.706,789,'#c8c8c8','factory',0);
INSERT OR IGNORE INTO body(id,system_id,parent_id,name,type_id,orbit_a_au,orbit_period_days,radius_km,color,role,is_habitable) VALUES ('oberon','sol','uranus','Оберон','moon_ice',0.0039,13.463,761,'#bfbfbf','workshop',0);
INSERT OR IGNORE INTO body(id,system_id,parent_id,name,type_id,orbit_a_au,orbit_period_days,radius_km,color,role,is_habitable) VALUES ('proteus','sol','neptune','Протей','moon_ice',0.00079,1.122,210,'#a8a8a8','scrapyard',0);
INSERT OR IGNORE INTO body(id,system_id,parent_id,name,type_id,orbit_a_au,orbit_period_days,radius_km,color,role,is_habitable) VALUES ('triton','sol','neptune','Тритон','moon_ice',0.00237,5.877,1353,'#d0d8dc','betting',0);
INSERT OR IGNORE INTO body(id,system_id,parent_id,name,type_id,orbit_a_au,orbit_period_days,radius_km,color,role,is_habitable) VALUES ('nereid','sol','neptune','Нереида','moon_ice',0.0309,360.1,170,'#b0b0b0','betting',0);
INSERT OR IGNORE INTO body(id,system_id,parent_id,name,type_id,orbit_a_au,orbit_period_days,radius_km,color,role,is_habitable) VALUES ('charon','sol','pluto','Харон','moon_ice',0.00013,6.387,606,'#c0c0c0','betting',0);
INSERT OR IGNORE INTO body(id,system_id,parent_id,name,type_id,radius_km,color,role) VALUES ('sun','sol',NULL,'Солнце','star',696340,'#ffb020','star');
INSERT OR IGNORE INTO body(id,system_id,parent_id,name,type_id,orbit_a_au,orbit_period_days,radius_km,color,role) VALUES ('adrasteya','sol','jupiter','Адрастея','moon_rock',0.00129,0.298,8,'#d8c070','arena');
INSERT OR IGNORE INTO body(id,system_id,parent_id,name,type_id,radius_km,color,role) VALUES ('warprime','war',NULL,'Вармир-Прайм','rocky',7000,'#5fd08a','front');
INSERT OR IGNORE INTO race_event(id,system_id,arena_body_id,period_s,race_s,gather_s,laps) VALUES ('race-adrasteya','sol','adrasteya',21600,2400,600,3);
INSERT OR IGNORE INTO clone_set(id,name,str,rea,arm,acc,end_,psi,cost) VALUES ('assault','Штурмовик',9,6,8,5,7,2,120),('sniper','Снайпер',4,9,3,10,5,4,140),('tank','Танк',7,3,10,4,9,3,160),('psi','Псионик',3,7,4,6,6,10,180);
INSERT OR IGNORE INTO weapon_type(id,name,source_world,dmg,rate,crit) VALUES ('adrasteya_lance','Копьё Адрастеи','арена',14,1.1,0.12),('var_core','Ядро Вармира','литейная',10,1.25,0.06),('ice_shard','Ледяная пломба','Европа',6,1.4,0.04),('clone_mark','Клеймо клона','клонарня',8,1.0,0.10),('shard','Осколок обломка','пояс',18,0.8,0.08);
