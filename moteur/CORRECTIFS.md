# Moteur de duel — audit du moteur C# et correctifs du port TypeScript

Port de `moteur-combat.cs` (`ResoudreCombatInterne` + `DeclencherUsageStrategemeLocal`, `DeclencherSoinActifLocal`,
`AppliquerSaignement`, `CalculerDegatsBaseArme`, `AppliquerAmelioration`, `GetEffectiveStats`) vers `moteur/moteur.ts`.
Sources lues : `moteur-combat.cs`, `duel.cs`, `simulations.cs`, `catalog.cs`, `catalogue_stats.json` (Projet claude.ai),
la mémoire de conception du projet (bugfixes, saignement, Ronde 11, niveaux max, 5 scalings, audit overlay) et les
2 replays C# réels de `demo-data.js`.

Chaque correctif est tagué dans le code (`CORRECTIF Fx` / drapeau `F.xxx`) et désactivable d'un bloc avec
`opts.compat_cs = true` (tests de parité uniquement — **jamais en production**). Les chiffres d'impact viennent de
`EQUILIBRAGE.md` §4-6 (15 000 et 8 000 duels, builds aléatoires du vrai catalogue).

Légende : **[bug]** logique fausse par rapport à l'intention documentée · **[équilibrage]** comportement voulu discutable,
modifié et justifié · **[cosmétique]** replay/overlay seulement · **[robustesse]** garde-fou sans effet sur les builds actuels.

---

## 0. Constat préalable : quelle version du C# fait foi ?

- La copie `moteur-combat.cs` du Projet **ne contient pas la Ronde 11** (économie de tours), alors que `catalog.cs`,
  `simulations.cs`, la mémoire (27/09) et **les données du catalogue du site** l'ont (Sabimaru, Pétards, Plumes, Canon ont
  `usagesParCombat`/`cooldownTours` ; la Gourde est un `soinDirect`).
- Les 2 replays C# réels (27/09, 20h36-20h40) montrent un moteur **sans** Ronde 11 : le lancement de l'Éclair de Tomoe
  (round 1) est suivi d'une attaque à l'arme dans la même action (round 2), et le Sabimaru empoisonne à chaque coup
  (pile +9 = 3 Dague + 6 Sabimaru). La Ronde 11 n'a donc jamais tourné en live.
- **Décision** : le port suit `moteur-combat.cs` ligne à ligne, et applique la Ronde 11 telle que codée dans
  `simulations.cs` (décision utilisateur explicite, catalogue déjà calibré pour elle) → F12. Le mode `compat_cs` reproduit
  le moteur live d'avant Ronde 11 (celui des replays).

## 1. Correctifs appliqués

| # | Type | Symptôme | Cause (C#) | Correctif TS | Impact équilibrage |
|---|---|---|---|---|---|
| F1 | [bug] | Combats non rejouables ; deux duels lancés dans la même fenêtre de ~15 ms pouvaient tirer la même séquence (piège déjà noté dans la mémoire) | `ResoudreCombatInterne` : `Random rnd = new Random();` (graine horloge) | RNG sfc32 seedée (`creerRng`, init splitmix32), `replay.seed` ; même seed + mêmes entrées = même replay (testé). Ordre de consommation des tirages identique au C# | Aucun (distribution uniforme équivalente) |
| F2 | [bug] | Le Dernier souffle (Protection Démocratique, Manteau du Loup) ne sauve pas d'un coup de stratagème, d'un missile, d'un renvoi de dégâts ni d'une explosion de saignement | `DeclencherUsageStrategemeLocal` et `AppliquerSaignement` font `pvX -= …` sans test de revive ; après un stratagème, `if (pvA <= 0 \|\| pvB <= 0) continue` termine le combat. Renvoi : `AppliquerDegatsAvecShield(frappeur, degatsReflechis)` sans test | Toute perte de PV passe par `AppliquerDegatsAvecShield` / `DegatsBruts`, qui vérifient le revive (`verifierDernierSouffle`) | Manteau du Loup +1,7 pt ; conforme au texte « survit une fois par combat » |
| F3 | [bug] | La Hache Chargée brise la DEF mais ses propres stratagèmes (et ceux des autres) n'en profitent pas ; la Marque (« +X % dégâts reçus de toutes sources ») n'amplifie pas les stratagèmes | `DeclencherUsageStrategemeLocal` : `defCible = statsB.Def` (sans `briseDefPoints`), aucune lecture de `marqueDegatsX` | DEF effective = `max(0, def − briseDef)` et multiplicateur de marque sur chaque coup de stratagème | Hache Chargée +1,1 pt, Pétards +0,4 |
| F4 | [bug] | L'anti-soin (Odachi, Sabimaru) ne réduit pas le vol de vie, seul soin continu de l'arme | Bloc `Lifesteal` : `pvA = Min(pvMaxA, pvA + volDeVie)` sans `antiHealPourcentage` | `volDeVie × (1 − antiHeal)` | Ciblé : Lame vampirique contre Odachi, vol de vie total −24 % ; négligeable en moyenne (combinaison rare) |
| F5 | [bug] | Frénésie souvent inutile ; Marque/Anti-soin/Brise-def/buff des Plumes durent ~2× moins que leur « N tours » | Bloc de décrément (`antiHealDureeA/B`, `marqueDuree`, `frenesieDuree`, `buffDefDuree`, `briseDefDuree`) exécuté pour **les deux** joueurs à **chaque action de n'importe qui**. La frénésie (bonus d'AP, ajouté seulement au tick externe) pouvait expirer avant d'avoir compté une seule fois | Durées décrémentées au **tour de l'affecté** (comme poison, brûlure, étourdissement, paralysie déjà), `999` reste « jusqu'à la fin » | Pétards Shinobi +5,7 pts ; la frénésie (Kusabimaru) compte enfin ; brise-def/marque ≈ 1 coup → ≈ N coups |
| F6 | [bug] | Avec la Lame de la mort, la cible peut avoir PV > PV max (100 % des duels du cas test Lame vs tank en C#) ; une régénération suivante « soigne » alors négativement | Érosion `pvMaxB *= (1 − x)` sans ramener `pvB` | `pv = min(pv, pvMax)` après érosion ; invariant PV ≤ max testé sur 22 000 duels | Très faible (la Lame reste n°1 du classement) |
| F7 | [bug] | La Ténacité (Armure de Robert 50 %) ne protège pas des étourdissements de stratagème (Hache Chargée 2 tours, Shurikens) | Jet d'étourdissement de `DeclencherUsageStrategemeLocal` sans jet de ténacité, contrairement à l'arme et au ModeTir | Même jet de ténacité que pour l'arme | Armure de Robert +0,3 pt |
| F8 | [bug] | Restes du démon de la haine (« amplifie tous les dégâts de Brûlure infligés par le porteur ») n'amplifie pas la brûlure du Souffle Draconique | Couche de brûlure du stratagème ajoutée sans `AmplificationDegatsFeuPourcentage` du torse du porteur (l'offhand, lui, l'applique) | Amplification appliquée | ≈ 0 (combinaison rare) |
| F9 | [cosmétique] | En stance 2 (Volto-Hache) l'overlay ne reçoit ni l'image ni le son de stance 2 ; toute l'arme hors dégâts est perdue (Anim, CoupsParUsage, Précision, Parade…) | `VueArmeSelonStance` du moteur ne copie QUE les champs de dégâts/scaling (la copie locale de duel.cs copiait `Stance2ImageUrl/Stance2Sons`) | Vue = copie complète de l'arme + champs stance 2 + `stance2ImageUrl`/`stance2Sons` | Aucun sur le catalogue actuel (Volto n'a pas de passif) |
| F10 | [équilibrage] | **« Déséquiper une arme faible augmente la puissance »** : confirmé dans le **moteur**, pas seulement dans la formule (voir §2) | `CalculerDegatsBaseArme` : mains nues = `Atk` (équivalent scaling A pur), alors qu'une arme = base + lettres de scaling ; à ATK élevée, Dague (ATK D), Lame vampirique (ATK E), Tantô (C)… frappent moins fort que les poings | **Plancher mains nues** : si l'espérance de l'arme (base moyenne + scalings) est < ATK, on ajoute la différence (÷ nb de coups). La variance de l'arme est conservée. Même plancher dans `estimerAtkEquivalent` (formule-combat.js) pour que le PowerLevel reste cohérent | Dague empoisonnée +2,5 pts, Lame vampirique +1,1 ; aucune arme ne change pour qui ne stacke pas l'ATK. PowerLevel de kargnacc (Dague, 36 ATK) : 893 → 1180 |
| F11 | [équilibrage] | Les armes multi-coups (Gallant ×5, Arc mode 2 ×4, Frappe Aérienne ×6) perdent ~0,5 dégât par balle | `(int)degatsBrutsCoup` : troncature par balle, biais systématique −0,5/balle (≈ −15 % sur Gallant à bas niveau) | Arrondi cumulatif sans biais : balle k = round(Σ₁..k) − round(Σ₁..k−1) ; la somme des balles = `degats` | Gallant +0,5 pt ; ±0,6 ailleurs (bruit) |
| F12 | [équilibrage — décision utilisateur] | Ronde 11 absente du moteur live (voir §0) | — | Port de la Ronde 11 de `simulations.cs` : Stratagème, soin actif et nouvelle « action offhand » (`EstActionOffhand` : usages > 0 et pas un soin) **remplacent** l'attaque du tour ; les effets au contact de ces 4 offhands sont désactivés ; round `offhand_action: true`. Les ticks (poison, brûlure, fatigue, régén) d'un tour consommé par une capacité sont publiés dans un round environnemental (`frappeur: ""`) — sinon l'overlay ne les verrait jamais | Le plus gros effet : Canon Flamboyant −12,1 pts, Pétards −5,7, Sabimaru −5,4 (ils procaient à CHAQUE coup) ; rounds moyens +1,2. Premier jet non calibré, conforme à la mémoire |
| F13 | [robustesse] | Boucle infinie si les deux vitesses ≤ 0 (AP jamais ≥ 100) | `apA += statsA.Spd + frenesie` sans plancher | Plancher de 1 AP par tick (tie-break inchangé) | Aucun (vitesse min actuelle ≈ 6) |
| F14 | [cosmétique] | Soin actif sans image dans l'overlay | `DeclencherSoinActifLocal` envoie `soin_image = ""` | `soin_image = image de l'objet` (comme la copie de duel.cs) | — |
| F15 | [cosmétique] | Un vainqueur peut apparaître à 0 PV (vivant avec 0 < PV < 1 après un tick de poison fractionnaire) | `Math.Max(0, (int)pvA)` | PV affiché = `max(1, (int)pv)` si vivant | — |
| F16 | [bug, formule-combat.js] | PowerLevel `NaN` pour un objet de niveau > 0 dont `incrementPassif` vaut 0 (clé absente des données creuses du site, ex. Lame vampirique +1) | `niveau * c.incrementPassif` avec `undefined` | `(incrementPassif \|\| 0)` + `ResistanceFeu` ajouté à la table des passifs (absent aussi en C#, inerte aujourd'hui car incrément 0). Le moteur normalise en plus chaque objet (`normaliserObjet`) | Pages calculateur/profil corrigées au passage |

## 2. « Déséquiper une arme faible augmente la puissance » — analyse moteur

- **Moteur C#** : oui. Dégâts par coup mains nues = `Atk` (variance 0,85-1,15). Arme = moyenne de la fourchette + Σ(stat ×
  lettre, ×0,6 hors ATK) (+0,3×ATK si aucune lettre ATK). Exemples niveau 0 : Dague = 6 + 0,25·ATK + 0,3·luck ; Lame
  vampirique = 7 + 0,1·ATK + 0,045·PV ; un joueur à 36 ATK (kargnacc) attend 20,4 dégâts avec la Dague contre 36 à mains nues.
  Même un nouveau joueur à 15 ATK frappe mieux à mains nues qu'avec la Dague (11,3).
- Mesure (EQUILIBRAGE §5) : 1/21 joueur réel gagne plus souvent sans arme en C# (shenco, Gallant +1 : 96,3 % vs 96,0 %) ; la
  plupart des joueurs armés compensent par les stats plates de l'arme. Sur les builds aléatoires l'effet est net pour les
  armes à faible scaling ATK.
- **Correctif retenu (F10)** : une arme ne peut pas frapper moins fort **en espérance** que les poings ; on ne touche ni aux
  lettres, ni à la variance, ni aux mains nues des nouveaux joueurs. Après correctif : 0/21.
- Alternative écartée (à trancher par le game designer si F10 paraît trop généreux) : affaiblir les mains nues
  (ex. 8-12 + 0,3·ATK). Elle ne garantit pas la propriété (la Lame vampirique n'a que 0,1·ATK) et nerfe les nouveaux joueurs.

## 3. Constats non corrigés (choix de conception à trancher)

1. **Saignement (banque + explosion à 20 stacks) quasi inerte** : 4 à 7 explosions pour 15 000-22 000 duels. Un duel dure ~13
   rounds et 45 actions max ; il faut 20 coups qui touchent. La mémoire indique que le seuil 20 est une décision explicite :
   non modifié. Pistes : seuil 8-10, ou 2-3 stacks par coup sur Croc/Lance.
2. `PoisonDuree` n'est lu nulle part (le poison est une pile dégressive −1/tick) : champ mort.
3. Retour en stance 0 (Volto-Hache) **purge poison et brûlure du porteur** (`if (stanceActuelleA == 0) { poisonStackA = 0; … }`)
   — présent dans toutes les copies C#, sans texte de catalogue : conservé, à confirmer.
4. Bonus de stance sur `luck`, `esquive`, `pv` ignorés en combat (crit/esquive/PV max figés au départ). Aucun objet concerné.
5. Le scaling « spd » lit `SpdLineaire` = stacks seuls : les bonus de vitesse d'objets (Croc +3, Sabimaru +4…) ne comptent pas
   pour le scaling, alors que la luck d'objet compte pour le scaling « crit ». Incohérent mais identique dans la formule de
   PowerLevel : non modifié (changerait l'équilibre des armes spd).
6. Fin à 45 actions : départage au ratio PV/PV max, l'attaquant gagne l'égalité exacte. Jamais observé (la fatigue tue avant).
7. Tantô de Cérémonie : la recharge ne concerne pas le 3e réservoir d'usages de la Ronde 11 (question ouverte dans la mémoire).
8. `GetEffectiveStats` (C#) applique les stats des 4 emplacements, `formule-combat.js` seulement arme/offhand/torse : on suit la
   formule (aucun stratagème n'a de stat).
9. Le PowerLevel affiché par les duels live venait de la copie locale de `duel.cs`, sans les termes « Panoplie Sekiro » ;
   le site utilise `formule-combat.js` (termes inclus) : les PowerLevels des objets Sekiro ne sont pas comparables un à un.
10. `simulations.cs` utilise `DIVISEUR = 2.8` contre 5 partout ailleurs (échelle de PowerLevel différente dans `!simuler`).
11. `ReductionDegatsTir` ne s'applique qu'à `Anim == "tir"` (pas à l'Arbalète « bombardement »), et les stratagèmes ne
    critiquent jamais : conforme aux commentaires du catalogue, conservé.
12. Les copies de secours `ResoudreCombatLocalDeSecours` (duel/auto-battle/bot-battle) ont toujours l'ancienne règle
    d'égalité et l'ancien saignement : sans objet pour le site.

## 4. Parité avec le moteur C#

- **dotnet indisponible** (apt et dot.net renvoient 403 via le proxy) : pas de différentiel coup par coup avec RNG injectée.
- Vérifié (`node moteur/parite.mjs` → `parite-resultats.md`) :
  - format : **toutes** les clés racine et de round des replays C# sont produites ; ajouts listés ;
  - stats effectives : PV max identiques au C# quand le build n'a pas bougé (kargnacc 230, bg4563 150) ;
  - faisabilité en mode `compat_cs` : **16/16** événements des 2 replays C# (dégâts d'arme par balle avec/sans crit, Éclair de
    Tomoe, Solo Silo, ticks de poison) tombent dans les plages exactes de nos formules ;
  - statistique : l'issue C# (vainqueur, ±2 rounds) est reproduite dans 46 % / 80 % des seeds ; même vainqueur majoritaire.
  - historique (66 duels, EQUILIBRAGE §3) : rejoués avec les builds actuels, notre moteur désigne le même vainqueur
    majoritaire dans 79 % des cas (les builds ont changé depuis : indicatif).
- **Non vérifié** : identité bit à bit des séquences d'actions (nécessite le C# compilé) ; le moteur Ronde 11 n'a aucune
  référence live (jamais déployé).

## 5. Notes d'intégration (backend)

- `Equipement.niveau` = `inventory.niveau` (nombre d'exemplaires − 1) **sans** re-soustraire 1 ; le moteur plafonne par rareté.
  `numero` optionnel sur `Equipement` (repris dans `build_*`).
- Ne jamais passer `compat_cs` ni `_correctifs` depuis l'Edge Function.
- Le moteur remplit `points_*`, `medailles_*`, `lootbox_*` à 0 : c'est la RPC qui décide des récompenses. `tranche` et
  `statut_*` sont calculés comme `duel.cs` (±30 % de PowerLevel), `id`/`date` via `opts`.
- Build : `node moteur/build.mjs` (régénère `formule-combat.gen.ts` depuis `../formule-combat.js` — à relancer après toute
  modification de la formule), puis `node moteur/moteur.test.mjs`.

---

## 6. Moteur 1.1 (02/10) — décisions de MrShyDiver après revue en jeu

Le site est le moteur de référence : ces règles n'existent pas dans le C#. `VERSION_MOTEUR = "site-1.1.0"`.

| # | Règle | Avant | Maintenant |
|---|---|---|---|
| V1 | **Ordre des tours** | Le plus rapide jouait autant de fois que sa jauge le permettait (une Lame de la mort rapide : 4 tours d'affilée) | **Alternance + tour bonus** : même jauge, mais jamais plus de `MAX_TOURS_DAFFILEE = 2` tours d'affilée ; au-delà la main passe d'office. Deux jauges pleines : la plus remplie d'abord, puis le plus rapide, puis l'attaquant. 60 de vitesse contre 50 = 6 tours pour 5 |
| V2 | **Vitesse** | `10 + 40·tanh(points/40)` + vitesse des objets hors courbe (50 points + Slip +25 = 71,9 battait 100 points = 49,5) | **Linéaire** : `10 + points + objets`. Le plafond de 2 tours d'affilée remplace la courbe dégressive. `formule-combat.js` : puissance multipliée par `spd·(10+REF)/(10·(spd+REF))`, `SPD_REFERENCE = 20` (1 pour un joueur sans vitesse, sature comme le moteur) |
| V3 | **Un tour = un round** | Un tour pris par une capacité publiait ses effets de début de tour dans un round « d'environnement » séparé (sans texte quand il ne portait qu'une régénération : « Rien ne se passe ce tour-ci ») | Ces effets sont rattachés au round de la capacité. Il ne reste un round d'environnement que si un combattant meurt de ses effets avant d'agir. Chaque round porte `tour` (numéro du tour de jeu) |
| V4 | **Impacts différés** (Solo Silo 2 tours, Éclair de Tomoe 1 tour) | Comptés en tours du porteur : avec un écart de vitesse, l'impact arrivait bien plus tard | Comptés en **tours du combat** : lancé au tour N, il tombe au début du tour N + délai, quel que soit le joueur, sans prendre le tour de personne (`impact_differe: true`, même numéro de `tour` que l'action qui suit) |
| V5 | **Mains gauches à charges** | L'écran les jouait comme une attaque ratée, sans charges ni recharge visibles | Chaque round publie pour les deux côtés `strategeme_usages_*`, `strategeme_recharge_*`, `offhand_usages_*`, `offhand_recharge_*`, `missile_en_vol_*` ; le replay porte `offhand_usages_max_*`. Les soins actifs portent aussi `offhand_action` |
| V6 | **Soins actifs** (Stimulant, Gourde) | Partaient dès qu'il manquait 1 PV (une Gourde de 262 PV gaspillée pour 6 PV) | Ne partent que s'il manque au moins leur montant, ou sous 50 % de PV |
| V7 | **Gourde Médicinale** | Soin immédiat | `soinDureeTours = 3` (donnée d'objet) : 1/3 à l'utilisation, 1/3 au début des 2 tours suivants du porteur, sans lui coûter d'action (`regen_montant`, effet `soin_continu`) |
| V8 | **Soins renforcés** (Gourde) | Soin actif et régénération seulement | Aussi le vol de vie |
| V9 | **Tantô de Cérémonie** | Rechargeait le stratagème, sinon le soin ; jamais les mains gauches à action ; sacrifice même sans rien à recharger ; rien à l'écran | Tous les 3 coups portés : rend 1 charge à **chaque** objet entamé (stratagème et main gauche), sacrifice de 15 % des PV actuels seulement s'il y a quelque chose à recharger. Round : `sacrifice_pv`, `recharge_strategeme`, `recharge_offhand` |
| V10 | **Lame de la mort** | Contrecoup = 5 % des dégâts infligés (83 dégâts = 4 PV), invisible à l'écran | Contrecoup = 5 % des **PV actuels** du porteur à chaque coup porté (ne peut pas le tuer). Round : `contrecoup`, `erosion_pv_max` |

Mesures après changement (builds aléatoires du vrai catalogue) : 6 000 duels sans anomalie (PV ≤ PV max, charges dans leurs bornes, jamais 3 tours d'affilée, une seule action par tour, même graine = même combat), 15,3 tours en moyenne. Sur 12 000 duels, le plus puissant gagne 55 % / 71 % / 86 % / 97 % des fois pour un écart de puissance < 10 % / 10-30 % / 30-60 % / > 60 %. Le plus rapide gagne 74 % des duels : la vitesse pèse lourd, à surveiller.

Après toute modification : `node outils/moteur-navigateur.mjs` (régénère `moteur-bac.js`), recopier `formule-combat.js` dans `formule-combat.gen.ts`, pousser, puis épingler le nouveau commit dans `index.ts` et redéployer la fonction `duel`.

### 1.1.1 (02/10, soir)

- **Saignement** : l'explosion se déclenche à **5 charges** (20 auparavant, elle n'arrivait presque jamais). Décision de MrShyDiver.
- **Volto-Hache** : la purge du poison et de la brûlure au retour en première forme est un passif voulu (confirmé). Elle est maintenant écrite sur la fiche et annoncée dans le récit du combat (effet `purge`).
- **Vitesse, mesure à build identique** (9 000 duels, N points en vitesse contre N points dans une autre stat) : avec la règle actuelle (rapport des vitesses) la vitesse gagne 72 % / 82 % / 87 % pour 5 / 10 / 20 points — trop forte. Règle proposée, pas encore appliquée : chaque point de vitesse d'avance = 1 % de tour en plus (47 % / 47 % / 49 %, donc équitable) ; à 2 % par point : 53 % / 59 % / 62 %.

### 1.2.0 (02/10, soir) — vitesse à l'écart

Décision de MrShyDiver : **chaque point de vitesse d'avance = 1,2 % de tour en plus** (`TOUR_BONUS_PAR_POINT = 1.2`, dans `formule-combat.js`). La jauge de chacun gagne 100 par échange, celle du plus rapide 100 + 1,2 × écart ; le plafond de 2 tours d'affilée reste. +10 d'avance : un tour bonus tous les ~8 tours adverses ; +25 : un tous les ~3 ; +83 : le plafond de 2 pour 1. La formule de puissance suit la même règle face à un adversaire de vitesse 20.

Mesures : à build identique, N points en vitesse contre N points ailleurs → la vitesse gagne 48 % / 48 % / 49 % pour 5 / 10 / 20 points (72 % / 82 % / 87 % avec le rapport des vitesses). Sur builds aléatoires, le plus rapide gagne 61 % des duels (74 % avant). 6 000 duels sans anomalie, 15,9 tours en moyenne.


### 1.3.0 (03/10) — critique des stratagèmes

Constat de MrShyDiver, confirmé dans le code : les dégâts directs d'un stratagème ne pouvaient jamais être critiques (`crit_par_balle` forcé à faux).
Corrigé (drapeau `critStrategeme`, inactif en mode compat C#) : chaque coup d'un stratagème tire un critique avec la chance du lanceur
(`15 + 55·tanh(chance/55)` %, moins l'anti-critique de l'armure adverse, sans le bonus de critique propre à l'arme) et fait alors ×2. Vaut aussi pour les impacts différés
(Solo Silo, Éclair de Tomoe : tirage à l'impact). Le round publie `crit` et `crit_par_balle` ; l'écran et le récit les lisaient déjà.
Formule de puissance : dégâts directs de stratagème × (1 + critique %).
Non concernés : bouclier, poison et brûlure (dégâts dans le temps). Les mains gauches n'infligent aucun dégât direct (elles posent poison, brûlure, marque, brise-défense, anti-soin) : rien à corriger.
À noter : les dégâts de stratagème ne dépendent toujours d'aucune stat d'attaque.

Contrôle (600 duels par cas) : chance 0 → 13,8 % de critiques (théorie 15), chance 60 → 59,1 % (58,8), Frappe Aérienne 6 coups chance 30 → 42,0 % (42,3),
Éclair de Tomoe différé → 44,1 % (42,3), cible en Armure Anti-crit → 0 %, mode compat → 0 % ; dégâts critiques = 2 × dégâts normaux. 6 000 duels sans anomalie.
Effet mesuré sur 20 000 duels (builds au hasard, objets à mi-chemin) : 13,5 → 12,7 tours ; Éclair de Tomoe 63,6 → 66,6 % de victoires, Solo Silo 54,5 → 57,2,
Frappe 500kg 45,8 → 48,5, Frappe Aérienne 39,4 → 41,1, Frappe de précision 34,6 → 35,9 ; Générateur de bouclier 66,6 → 62,6, Gas Orbital 49,4 → 44,4.


### Règles à l'essai, atelier patchnote et éditeur d'objets (03/10) — moteur inchangé (1.3.0)

Décisions de MrShyDiver : **200 PV de base** (10 PV par point inchangé), **puissance par budget** avec **15 par point de PV** (10 pour les autres stats),
tous les emplacements × 1, arme à deux mains × 2. **Rien de tout cela n'est en ligne** : c'est rangé dans `formule-combat.js` sous `REGLES_ESSAI`, `BUDGET`,
`budgetObjet` et `puissanceBudget`, et seul le Simulateur s'en sert (mode « à l'essai »). `moteur-bac.js` expose `MoteurDuel.CST` pour que le Simulateur
applique `BASE_PV = 200` le temps d'une simulation, puis le remette.

Bascule en ligne le jour venu (dans cet ordre) : `CST.BASE_PV = 200` ; `puissanceDe` de la fonction `duel` et `construireCombattant` passent à `puissanceBudget` ;
affichages de puissance du site ; `node outils/moteur-navigateur.mjs` ; redéploiement de `duel` ; `puissance_perimee = true` ; puis MrShyDiver publie les objets depuis l'atelier.

Patchnotes : tables `public.patchnotes` (lecture publique), `private.items_brouillon` et `private.patchnote_brouillon` ; fonctions `patchnote_*`
verrouillées par `private.recetteur()`. Les objets à l'essai ne touchent pas `public.items` avant `patchnote_publier()`, qui applique les objets,
garde leur photo avant / après, vide le texte du brouillon et marque les puissances à recalculer (une seule transaction).
Le verdict buff / nerf / équilibrage est calculé à l'affichage (`App.patch.diff`) à partir des deux versions.

Simulateur : la colonne « à puissance égale » remplace la fenêtre à 15 %. On ajuste sur tous les duels la chance de gagner selon le rapport des puissances
(courbe logistique à une pente), puis on mesure pour chaque objet l'écart entre victoires réelles et attendues. Raison : quand tous les builds ont les mêmes points
et le même stade d'amélioration, la fenêtre faisait passer les objets rares pour « trop forts » simplement parce qu'ils pèsent plus lourd.
