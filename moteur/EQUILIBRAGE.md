# Rapport d'équilibrage — moteur de duel du site

Généré par `node moteur/rapport-equilibrage.mjs` (moteur site-1.0.0). Données : instantané demo-data.js du 2026-09-29T00:34:37+00:00.
Deux populations : **réels** = un joueur équipé de la base contre un joueur réel quelconque (builds actuels) ; **aléatoires** = builds tirés du vrai catalogue (stacks 0-70, chaque emplacement rempli à 85 %, niveau uniforme jusqu'au plafond de rareté).
« corrigé » = moteur de production ; « compat C# » = mêmes seeds avec tous les correctifs désactivés (comportement de moteur-combat.cs).

## 1. Vue d'ensemble

| Population | Duels | Victoire attaquant | Égalités | Rounds moyens | Fatigue atteinte | Fin à 45 actions | Le favori (PowerLevel) gagne | Explosions de saignement |
|---|---|---|---|---|---|---|---|---|
| réels — corrigé | 15000 | 94.5 % | 0.0 % | 6.7 | 4.3 % | 0.0 % | 98.8 % | 0 |
| réels — compat C# | 15000 | 94.5 % | 0.0 % | 6.4 | 3.9 % | 0.0 % | 98.8 % | 0 |
| aléatoires — corrigé | 15000 | 49.5 % | 0.6 % | 12.9 | 13.7 % | 0.0 % | 82.8 % | 5 |
| aléatoires — compat C# | 15000 | 49.4 % | 0.5 % | 11.9 | 7.8 % | 0.0 % | 82.7 % | 7 |

## 2. Taux de victoire de l'attaquant par écart de PowerLevel

Écart = (P_défenseur − P_attaquant) / P_attaquant, par tranche de 10 %. La tranche « équitable » de duel.cs est ±30 %.

| Écart | réels n | réels V att. | aléatoires n | aléatoires V att. (corrigé) | aléatoires V att. (compat C#) |
|---|---|---|---|---|---|
| ≤ −40 % | 13801 | 100.0 % | 3370 | 96.3 % | 95.8 % |
| -40 à -30 % | 132 | 94.7 % | 1128 | 86.3 % | 84.7 % |
| -30 à -20 % | 70 | 78.6 % | 1056 | 75.6 % | 76.8 % |
| -20 à -10 % | 97 | 69.1 % | 1037 | 65.9 % | 66.0 % |
| -10 à 0 % | 72 | 54.2 % | 913 | 54.9 % | 53.9 % |
| 0 à 10 % | 64 | 37.5 % | 837 | 42.2 % | 42.1 % |
| 10 à 20 % | 52 | 25.0 % | 749 | 36.7 % | 37.0 % |
| 20 à 30 % | 106 | 27.4 % | 648 | 25.8 % | 27.3 % |
| 30 à 40 % | 35 | 31.4 % | 583 | 23.2 % | 22.1 % |
| 40 à 50 % | 51 | 13.7 % | 553 | 16.1 % | 14.5 % |
| ≥ +50 % | 520 | 2.1 % | 4126 | 5.1 % | 5.4 % |

## 3. Comparaison avec l'historique réel (DEMO_DONNEES.duels)

- 66 duels historiques avec PowerLevel et vainqueur : le favori (PowerLevel C#) a gagné **71.2 %** (moteur site sur populations réelles : 98.8 %).
- Rejeu des mêmes affiches avec les builds ACTUELS (200 seeds chacune, 66 affiches) : le vainqueur historique gagne en moyenne **72.8 %** des rejeux ; notre moteur désigne le même vainqueur majoritaire dans **78.8 %** des cas.
- Limite : les builds ont évolué depuis les duels (niveaux, stacks) et les duels historiques ont été joués sans Ronde 11 ; la comparaison est indicative, pas une parité.

## 4. Taux de victoire par objet équipé (builds aléatoires, égalité = ½)

Tous les objets, du plus fort au plus faible. Un objet porté par les deux camps compte deux fois.

| Objet | Combats | WR corrigé | WR compat C# | Δ pts |
|---|---|---|---|---|
| Lame de la mort (#36) | 1395 | 72.3 % | 73.8 % | -1.6 |
| Arc de Genichiro (#38) | 1318 | 67.0 % | 64.3 % | +2.7 |
| Lame Kusabimaru (#35) | 1434 | 64.7 % | 65.4 % | -0.7 |
| Sabimaru (#44) | 1631 | 63.6 % | 70.1 % | -6.6 |
| Manteau du Loup (#46) | 2333 | 62.8 % | 60.3 % | +2.5 |
| Gourde Médicinale (#40) | 1663 | 62.2 % | 62.3 % | -0.1 |
| Générateur de bouclier (#17) | 2642 | 60.9 % | 59.9 % | +1.0 |
| Croc du limier (2h) (#31) | 1341 | 59.1 % | 56.5 % | +2.6 |
| Lame vampirique (#3) | 1327 | 58.6 % | 56.5 % | +2.1 |
| Odachi de la Chouette (#39) | 1352 | 58.4 % | 57.5 % | +0.9 |
| Eclair de Tomoe (#50) | 2516 | 58.3 % | 58.2 % | +0.1 |
| Armure de Robert (#45) | 2410 | 57.8 % | 56.9 % | +0.9 |
| Restes du démon de la haine (#47) | 2280 | 56.7 % | 57.2 % | -0.5 |
| Armure Anti-crit (#9) | 2259 | 56.3 % | 56.7 % | -0.4 |
| Slip de protection (#12) | 2271 | 55.2 % | 54.9 % | +0.3 |
| Stimulant (#11) | 1667 | 55.0 % | 54.1 % | +0.9 |
| Protection Démocratique (#13) | 2332 | 54.9 % | 55.1 % | -0.1 |
| Dague empoisonnée (#4) | 1393 | 54.6 % | 53.7 % | +0.9 |
| Écailles de Dragon (#24) | 2370 | 54.2 % | 55.7 % | -1.5 |
| Hache Chargée (#48) | 2535 | 53.7 % | 55.0 % | -1.3 |
| Souffle Draconique (#23) | 2556 | 53.6 % | 54.0 % | -0.5 |
| Croc du limier (1H) (#30) | 1287 | 53.1 % | 52.4 % | +0.7 |
| Solo Silo (#22) | 2528 | 53.0 % | 52.2 % | +0.9 |
| Pistolet Bolster (#29) | 1274 | 53.0 % | 55.3 % | -2.3 |
| Lance Gyoubu (#37) | 1293 | 52.9 % | 52.4 % | +0.5 |
| Volto-Hache (#25) | 1371 | 52.2 % | 48.2 % | +3.9 |
| Tantô de Cérémonie (#34) | 1361 | 52.1 % | 55.4 % | -3.3 |
| Frappe 500kg (#21) | 2540 | 51.8 % | 52.8 % | -0.9 |
| Gas Orbital (#18) | 2539 | 51.5 % | 50.8 % | +0.6 |
| Armure épineuse (#15) | 2306 | 51.1 % | 51.7 % | -0.6 |
| Deadeye (#7) | 1359 | 50.7 % | 50.0 % | +0.7 |
| Parapluie Chargé (#26) | 1633 | 50.6 % | 48.6 % | +2.0 |
| Armure Med-Kit (#14) | 2346 | 50.4 % | 49.5 % | +0.9 |
| Bouclier épineux (#10) | 1597 | 49.6 % | 46.1 % | +3.5 |
| Pétards Shinobi (#42) | 1619 | 48.8 % | 52.7 % | -3.9 |
| Arbalète Explosive (#27) | 1306 | 48.4 % | 49.9 % | -1.5 |
| Gros Bâton (1h) (#16) | 1276 | 46.7 % | 48.1 % | -1.4 |
| Marteau de la Liberté (#5) | 1359 | 46.2 % | 46.0 % | +0.2 |
| Armure Lourde (#28) | 2299 | 45.6 % | 46.5 % | -0.9 |
| Machete Démocratique (#1) | 1308 | 45.5 % | 50.0 % | -4.5 |
| Plumes de corbeau (#41) | 1645 | 45.0 % | 47.7 % | -2.6 |
| Canon Flamboyant (#43) | 1661 | 44.3 % | 56.1 % | -11.7 |
| Shurikens Shinobi (#49) | 2577 | 43.8 % | 45.8 % | -2.0 |
| Frappe Aérienne (#20) | 2554 | 43.7 % | 45.8 % | -2.1 |
| Frappe de précision (#19) | 2567 | 43.1 % | 46.8 % | -3.7 |
| Armure de Rakshasa (#33) | 2360 | 42.3 % | 41.9 % | +0.5 |
| Grande Carapace de Tortue (#32) | 1683 | 41.7 % | 39.9 % | +1.8 |
| Bouclier Ballistique (#8) | 1612 | 40.4 % | 37.3 % | +3.2 |
| Gros Bâton (2H) (#6) | 1366 | 39.8 % | 39.4 % | +0.4 |
| Gallant (#2) | 1355 | 34.0 % | 33.1 % | +0.9 |

## 5. Mains nues contre arme faible (question « déséquiper une arme augmente la puissance »)

Pour chacun des 21 joueurs réels armés : taux de victoire avec son arme vs sans arme, contre 60 adversaires réels × 5 seeds.

- **Moteur C# (compat)** : 1/21 joueurs gagnent PLUS souvent sans arme.
- **Moteur corrigé (F10 plancher mains nues)** : 0/21.

| Joueur | Arme (niv.) | WR arme C# | WR mains nues C# | WR arme corrigé | WR mains nues corrigé | PowerLevel arme / nu (formule corrigée) |
|---|---|---|---|---|---|---|
| asgard_fr_ | Gallant (0) | 92.0 % | 91.7 % | 91.7 % | 91.7 % | 414.7 / 408.9 |
| aurel_le_dragon | Volto-Hache (6) | 100.0 % | 100.0 % | 100.0 % | 100.0 % | 3448.2 / 2050.1 |
| ayen57 | Volto-Hache (1) | 97.7 % | 93.3 % | 96.3 % | 93.3 % | 900.6 / 727.5 |
| bg4563 | Marteau de la Liberté (4) | 95.9 % | 94.9 % | 95.9 % | 94.6 % | 675.7 / 558.5 |
| bonjesuisunflemmard | Croc du limier (2h) (0) | 95.9 % | 93.9 % | 96.3 % | 93.9 % | 508.8 / 357.6 |
| cerne_underscore | Deadeye (5) | 96.7 % | 93.3 % | 96.0 % | 93.0 % | 620.2 / 379.1 |
| crepox | Pistolet Bolster (1) | 98.7 % | 97.7 % | 98.7 % | 97.7 % | 871.5 / 763.2 |
| f01101111x | Arbalète Explosive (1) | 93.3 % | 93.3 % | 93.3 % | 93.0 % | 604.9 / 561.7 |
| kaidorttv | Machete Démocratique (0) | 93.2 % | 93.2 % | 93.2 % | 93.2 % | 334.7 / 307.6 |
| kargnacc | Dague empoisonnée (0) | 100.0 % | 100.0 % | 100.0 % | 100.0 % | 1180.2 / 1056.6 |
| mowglitchblaat | Odachi de la Chouette (0) | 100.0 % | 98.6 % | 99.3 % | 98.6 % | 967.5 / 692.9 |
| mrshydiver | Deadeye (0) | 93.3 % | 91.7 % | 93.3 % | 91.7 % | 323.3 / 216.2 |
| noobynoobaze | Deadeye (1) | 97.3 % | 94.3 % | 98.0 % | 96.0 % | 763.7 / 435.4 |
| o_rico_o0 | Machete Démocratique (5) | 95.7 % | 94.7 % | 96.3 % | 95.3 % | 622.6 / 499.4 |
| petonns | Lame vampirique (0) | 98.7 % | 97.7 % | 99.3 % | 97.7 % | 974.1 / 839.4 |
| ronon_trent | Tantô de Cérémonie (12) | 100.0 % | 100.0 % | 100.0 % | 100.0 % | 3128.6 / 2572.6 |
| shenco | Gallant (1) | 96.0 % | 96.3 % | 96.3 % | 96.3 % | 762.5 / 704 |
| tasha_tv35 | Gros Bâton (2H) (0) | 93.3 % | 91.7 % | 93.3 % | 91.7 % | 311.8 / 262.1 |
| tercana | Lame de la mort (1) | 100.0 % | 100.0 % | 100.0 % | 100.0 % | 2998.4 / 1791 |
| tuan_kirie | Volto-Hache (0) | 98.6 % | 97.3 % | 98.3 % | 98.0 % | 820.1 / 710.2 |
| zarakaih | Volto-Hache (2) | 97.3 % | 93.7 % | 97.7 % | 93.3 % | 512.9 / 272.9 |

## 6. Impact isolé de chaque correctif (8 000 builds aléatoires, moteur corrigé moins UN correctif)

| Correctif retiré | Victoire att. | Rounds moyens | Objets les plus affectés (Δ WR quand on RETIRE le correctif) |
|---|---|---|---|
| (aucun — référence) | 49.1 % | 12.83 | |
| ronde11 | 49.1 % | 11.63 | Canon Flamboyant +12.1, Pétards Shinobi +5.7, Sabimaru +5.4 |
| reviveUniverselle | 49.0 % | 12.76 | Manteau du Loup -1.7, Lance Gyoubu -0.6, Gas Orbital -0.5 |
| stratBriseDefMarque | 49.2 % | 12.87 | Hache Chargée -1.1, Pétards Shinobi -0.4, Lame de la mort +0.4 |
| antiHealVolDeVie | 49.1 % | 12.83 | Pistolet Bolster +0.0, Grande Carapace de Tortue +0.0, Manteau du Loup +0.0 |
| dureesParPorteur | 49.2 % | 12.91 | Pétards Shinobi -5.7, Gros Bâton (1h) -0.8, Canon Flamboyant +0.7 |
| clampPvMaxErosion | 49.1 % | 12.83 | Pistolet Bolster +0.0, Grande Carapace de Tortue +0.0, Manteau du Loup +0.0 |
| tenaciteStrategeme | 49.2 % | 12.83 | Machete Démocratique +0.4, Armure de Robert -0.3, Armure de Rakshasa +0.3 |
| ampFeuStrategeme | 49.1 % | 12.84 | Armure Anti-crit +0.1, Restes du démon de la haine -0.1, Souffle Draconique -0.1 |
| plancherMainsNues | 49.3 % | 12.92 | Dague empoisonnée -2.5, Lame vampirique -1.1, Pétards Shinobi -0.7 |
| arrondiSansBiais | 49.2 % | 12.95 | Grande Carapace de Tortue -0.6, Odachi de la Chouette +0.5, Gallant -0.5 |

## 7. Lecture rapide

- Voir CORRECTIFS.md pour le détail de chaque correctif (symptôme, cause C#, correctif, impact).
- Le saignement (banque + explosion à 20 stacks) n'explose presque jamais dans un duel de 45 actions max : c'est le constat d'équilibrage le plus net (section 1, colonne « Explosions »).
