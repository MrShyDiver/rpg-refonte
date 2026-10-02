// @ts-nocheck
// FICHIER GÉNÉRÉ par moteur/build.mjs depuis ../formule-combat.js — ne pas éditer à la main.
// =========================================================================
// PORT JAVASCRIPT DE LA FORMULE DE COMBAT DE duel.cs
// ⚠️ Doit rester STRICTEMENT SYNCHRONISÉ avec CalculerPowerLevelSimule et ses
// fonctions associées dans duel.cs (GetEffectiveStats, ValeurStat,
// EstimerAtkEquivalent(AvecStance), AppliquerStatAuPersonnage, Mitigation).
// Toute modification de la formule côté C# doit être reportée ici À L'IDENTIQUE,
// sinon cette page se met à mentir aux joueurs sur leurs propres dégâts/survie.
// Constantes et logique copiées le 2025 depuis duel.cs (voir commentaires
// d'origine côté C# pour le détail de chaque choix de calibrage).
// =========================================================================

const CST = {
    BASE_ATK: 10.0, BONUS_ATK_PAR_STACK: 1.0,
    BASE_DEF: 10.0, BONUS_DEF_PAR_STACK: 1.0,
    // Le mannequin de test n'est plus une valeur fixe : il DEMARRE a BASE_ATK/BASE_DEF/
    // BASE_LUCK_MANNEQUIN/BASE_SPD (10 partout) et grandit ensuite au fil du combat -- voir
    // simulerSurvieEtOffense plus bas. BASE_LUCK_MANNEQUIN est la seule valeur de depart qui
    // n existait pas deja (les joueurs demarrent a 0 luck, le mannequin a 10 pour lui donner un
    // peu de crit des le premier tour).
    BASE_LUCK_MANNEQUIN: 10.0,
    BASE_PV: 100.0, BONUS_PV_PAR_STACK: 10.0,
    BASE_SPD: 10.0, SPD_MAX_BONUS: 40.0, K_SPD: 40.0, // SPD_MAX_BONUS / K_SPD : plus utilisés depuis la v1.1 (vitesse linéaire)
    SPD_REFERENCE: 20.0, // vitesse d'un adversaire type (10 de base + ~10 investis), pour la puissance
    TOUR_BONUS_PAR_POINT: 1.2, // % de tour en plus par point de vitesse d'avance (moteur 1.2)
    BASE_ESQUIVE: 15.0,
    BASE_CRIT: 15.0, LUCK_CRIT_MAX: 55.0, K_LUCK: 55.0,
    DEF_MITIGATION_MAX: 60.0, K_DEF_MITIGATION: 58.27,
    COEF_ATK_BASE: 0.3, PENALITE_HORS_ATK: 0.6,
    COEF_LETTRE_SCALING: { S: 1.3, A: 1.0, B: 0.75, C: 0.5, D: 0.25, E: 0.1 },
    POIDS_SCALING_STAT: { atk: 1.0, def: 1.0, pv: 0.1, spd: 1.0, crit: 1.0 },
    MAX_ACTIONS: 45, ROPE_START_ACTION: 20, ROPE_CADENCE: 2,
    // ROPE_START_ACTION/ROPE_CADENCE/FATIGUE_CROISSANCE gardent leur nom et leur valeur d origine
    // (elles pilotaient la "fatigue" avant) mais servent maintenant a fixer le RYTHME auquel le
    // mannequin monte en puissance -- voir simulerSurvieEtOffense. Plus de fatigue en tant que
    // telle : le mannequin a une vie infinie, le combat s arrete quand LE JOUEUR TESTE meurt (ou
    // au bout de MAX_ACTIONS par securite, ce qui ne devrait jamais arriver vu la croissance
    // exponentielle).
    FATIGUE_CROISSANCE: 1.30,
    POIDS_BURST: 2.5,
    // Contribution DIRECTE de la survie au score, en plus de son effet deja present via le cumul
    // des degats infliges -- sans ca, une survie exceptionnelle avec une attaque quasi nulle
    // donnait un score proche de zero. pvTotaux agrege deja proprement PV + DEF (via la
    // mitigation) + boucliers ; le multiplier par ce poids lui donne une valeur propre, dans la
    // meme "monnaie" que les degats infliges. Calibre contre des duels reels connus (6 a 10
    // donnent le meme classement correct ; 8 est le choix median).
    POIDS_DEFENSE: 8.0,
    DIVISEUR: 5.0,
    // Même valeur approximative que le commentaire C# ("2 armes tir sur 7 au catalogue") —
    // à recalculer si le roster d'armes change significativement.
    PROPORTION_ARMES_TIR: 0.30,
};

function mitigation(def) {
    return (CST.DEF_MITIGATION_MAX * Math.tanh(def / CST.K_DEF_MITIGATION)) / 100.0;
}

// Port fidèle de AppliquerAmelioration (duel.cs, ~L2252) : renvoie une COPIE de l'objet du
// catalogue avec tous ses champs qui progressent par doublon réellement appliqués au niveau
// possédé — les 3 stats (Bonus/Bonus2/Bonus3 via Increment/2/3), la fourchette de dégâts d'arme
// (BaseDegatsMin/Max via IncrementBaseDegats, seulement si Scaling1Stat est renseigné), les
// dégâts d'impact des stratagèmes (DegatsDirects via IncrementDegatsDirects), les champs de
// stance 2 (mêmes règles que la stance 0), et le passif spécial ciblé par StatPrincipale (monté
// de IncrementParNiveau — nommé "incrementPassif" dans catalogue_stats.json — par niveau).
// ⚠️ AVANT ce correctif, cette fonction n'existait pas côté JS : le calculateur ne faisait monter
// QUE les 3 stats de base, ce qui sous-estimait fortement les dégâts et le PowerLevel de tout
// objet dont l'identité repose sur IncrementBaseDegats, IncrementDegatsDirects ou StatPrincipale
// (la quasi-totalité des armes et stratagèmes avec doublons).
const CHAMP_STAT_PRINCIPALE = {
    Lifesteal: 'lifesteal', PoisonDegats: 'poisonDegats', Precision: 'precision', CritBonus: 'critBonus',
    Penetration: 'penetration', EtourdissementChance: 'etourdissementChance', ExecutionBonus: 'executionBonus',
    Blocage: 'blocage', BlocageReduction: 'blocageReduction', Reflection: 'reflection',
    ResistancePoison: 'resistancePoison', Regeneration: 'regeneration', ResistanceCrit: 'resistanceCrit', ResistanceFeu: 'resistanceFeu',
    DegatsDirects: 'degatsDirects', SoinDirect: 'soinDirect', SaignementDegats: 'saignementDegats',
    BrulureDegats: 'brulureDegats', AntiHealPourcentage: 'antiHealPourcentage', ShieldMontant: 'shieldMontant',
    RageBonusMax: 'rageBonusMax', MarqueDegatsPourcentage: 'marqueDegatsPourcentage', ParadeChance: 'paradeChance',
    TenaciteChance: 'tenaciteChance', FrenesieBonusSpd: 'frenesieBonusSpd',
    // EXTENSION "PANOPLIE SEKIRO" -- mêmes principe, nouveaux champs (miroir des cas ajoutés à
    // AppliquerPassifSurGearInfo côté C#).
    RechargeSacrificePourcentage: 'rechargeSacrificePourcentage', ReductionPvMaxPourcentage: 'reductionPvMaxPourcentage',
    AutoDegatsPourcentageDesDegats: 'autoDegatsPourcentageDesDegats', AmplificationSoinsPourcentage: 'amplificationSoinsPourcentage',
    EsquiveParadeBuffPourcentage: 'esquiveParadeBuffPourcentage', BriseDefPoints: 'briseDefPoints',
    DernierSouffleFractionPv: 'dernierSouffleFractionPv', BruleeReflectionDegats: 'bruleeReflectionDegats',
    AmplificationDegatsFeuPourcentage: 'amplificationDegatsFeuPourcentage', SaignementChanceParCoup: 'saignementChanceParCoup',
    ParalysieChance: 'paralysieChance', RiposteEtourdissementTousLesCoups: 'riposteEtourdissementTousLesCoups',
};

// Miroir de NIVEAU_MAX_PAR_RARETE (moteur-combat.cs) -- garder synchronisé.
const NIVEAU_MAX_PAR_RARETE = { commun: 25, normal: 20, rare: 15, epique: 10, legendaire: 5 };
function niveauMaxPourRarete(rarete) {
    return NIVEAU_MAX_PAR_RARETE[rarete] !== undefined ? NIVEAU_MAX_PAR_RARETE[rarete] : NIVEAU_MAX_PAR_RARETE.commun;
}

function appliquerAmelioration(original, niveau) {
    if (!original || !niveau || niveau <= 0) return original;
    niveau = Math.min(niveau, niveauMaxPourRarete(original.rarete));
    // ⚠️ EXTENSION additive : statsExtra/passifsExtra (4e stat, 5e stat, 2e passif...) -- une copie
    // superficielle (spread) suffit pour les champs scalaires, mais statsExtra est un TABLEAU
    // partagé avec l'objet catalogue original : il faut le recopier explicitement (map) avant d'en
    // muter les entrées plus bas, sous peine de corrompre l'objet catalogue partagé entre tous les
    // joueurs (identique à la précaution prise côté C#).
    const c = { ...original };
    if (original.statsExtra) c.statsExtra = original.statsExtra.map(sl => ({ ...sl }));
    if (original.passifsExtra) c.passifsExtra = original.passifsExtra.map(p => ({ ...p }));
    // EXTENSION "5 SCALINGS" : scalingExtra/stance2ScalingExtra (au-delà de scaling1/scaling2) --
    // même précaution : ce sont des tableaux partagés avec le catalogue, recopiés en nouveaux
    // objets. Pas de montée par niveau ici (les lettres de scaling ne scalent pas), donc une
    // simple copie superficielle par entrée suffit -- miroir de ScalingExtra?.ConvertAll côté C#.
    if (original.scalingExtra) c.scalingExtra = original.scalingExtra.map(sl => ({ ...sl }));
    if (original.stance2ScalingExtra) c.stance2ScalingExtra = original.stance2ScalingExtra.map(sl => ({ ...sl }));
    // EXTENSION "PANOPLIE SEKIRO" : modesTir (Arc de Genichiro) -- même précaution, même si rien
    // ne monte en niveau dedans (pas d'incrément par mode) : évite de partager la référence.
    if (original.modesTir) c.modesTir = original.modesTir.map(m => ({ ...m }));

    if (c.stat) c.bonus = (c.bonus || 0) + niveau * (c.increment || 0);
    if (c.stat2) c.bonus2 = (c.bonus2 || 0) + niveau * (c.increment2 || 0);
    if (c.stat3) c.bonus3 = (c.bonus3 || 0) + niveau * (c.increment3 || 0);
    // ⚠️ EXTENSION : les stats supplémentaires montent elles aussi, chacune à son propre rythme --
    // un objet sans statsExtra (tous les objets existants) traverse cette boucle sans rien faire.
    if (c.statsExtra) c.statsExtra.forEach(slot => { slot.bonus = (slot.bonus || 0) + niveau * (slot.increment || 0); });

    if (c.scaling1Stat && c.incrementBaseDegats) {
        c.baseDegatsMin = (c.baseDegatsMin || 0) + niveau * c.incrementBaseDegats;
        c.baseDegatsMax = (c.baseDegatsMax || 0) + niveau * c.incrementBaseDegats;
    }
    if ((c.degatsDirects || 0) > 0 && c.incrementDegatsDirects) {
        c.degatsDirects = c.degatsDirects + niveau * c.incrementDegatsDirects;
    }

    if (c.dureeStance) {
        if (c.stance2Stat) c.stance2Bonus = (c.stance2Bonus || 0) + niveau * (c.stance2IncrementBonus || 0);
        if (c.stance2Stat2) c.stance2Bonus2 = (c.stance2Bonus2 || 0) + niveau * (c.stance2IncrementBonus2 || 0);
        if (c.stance2Stat3) c.stance2Bonus3 = (c.stance2Bonus3 || 0) + niveau * (c.stance2IncrementBonus3 || 0);
        if (c.stance2Scaling1Stat && c.stance2IncrementBaseDegats) {
            c.stance2BaseDegatsMin = (c.stance2BaseDegatsMin || 0) + niveau * c.stance2IncrementBaseDegats;
            c.stance2BaseDegatsMax = (c.stance2BaseDegatsMax || 0) + niveau * c.stance2IncrementBaseDegats;
        }
    }

    // Le passif historique (statPrincipale) ET chaque entrée de passifsExtra suivent maintenant le
    // même principe : un nom de champ (PascalCase, traduit via CHAMP_STAT_PRINCIPALE) + un montant
    // à ajouter par niveau -- un objet à 2 passifs a statPrincipale (le 1er, comme avant) PLUS une
    // entrée dans passifsExtra (le 2e), chacun montant indépendamment de l'autre.
    if (c.statPrincipale) {

        const champ = CHAMP_STAT_PRINCIPALE[c.statPrincipale];
        if (champ) c[champ] = (c[champ] || 0) + niveau * (c.incrementPassif || 0); // CORRECTIF site : données creuses (clé absente = NaN)
    }
    if (c.passifsExtra) {
        c.passifsExtra.forEach(passif => {
            // ⚠️ CORRECTIF : même repli buggé que ci-dessus -- supprimé.
            const champ = CHAMP_STAT_PRINCIPALE[passif.champ];
            if (champ) c[champ] = (c[champ] || 0) + niveau * (passif.incrementPassif || 0);
        });
    }

    return c;
}

// --- Construit les Stats effectives à partir de stacks CHOISIS (hypothétiques) et d'un
// équipement CHOISI (hypothétique) — équivalent JS de GetEffectiveStats, mais sans jamais lire
// les registres réels : tout vient des choix faits sur cette page. L'équipement reçu ici doit
// déjà être nivelé (voir appliquerAmelioration) : cette fonction ne fait plus monter les stats
// elle-même, pour n'avoir qu'un seul endroit où "niveau" est appliqué.
function calculerStatsEffectives(stacks, equipement) {
    const s = {
        atk: CST.BASE_ATK + CST.BONUS_ATK_PAR_STACK * stacks.atk,
        def: CST.BASE_DEF + CST.BONUS_DEF_PAR_STACK * stacks.def,
        pv: CST.BASE_PV + CST.BONUS_PV_PAR_STACK * stacks.pv,
        // v1.1 (02/10) : la vitesse est linéaire (1 point investi = +1). La courbe dégressive n'a plus
        // lieu d'être : le moteur plafonne lui-même l'avantage à 2 tours d'affilée.
        spd: CST.BASE_SPD + stacks.spd,
        spdLineaire: stacks.spd,
        luckLineaire: Math.max(0, stacks.luck), // deluck non simulable ici (dépend d'un adversaire réel)
        esquiveGear: 0,
    };
    [equipement.arme, equipement.offhand, equipement.torso].forEach(g => {
        if (!g) return;
        appliquerStatAuPersonnage(s, g.stat, g.bonus || 0);
        appliquerStatAuPersonnage(s, g.stat2, g.bonus2 || 0);
        appliquerStatAuPersonnage(s, g.stat3, g.bonus3 || 0);
        // ⚠️ EXTENSION : 4e stat, 5e stat... -- statsExtra absent (tous les objets existants) ne
        // change rien au résultat par rapport à l'ancien comportement.
        if (g.statsExtra) g.statsExtra.forEach(slot => appliquerStatAuPersonnage(s, slot.nom, slot.bonus || 0));
    });
    return s;
}

function appliquerStatAuPersonnage(s, stat, bonus) {
    if (!stat) return;
    if (stat === 'atk') s.atk += bonus;
    else if (stat === 'def') s.def += bonus;
    else if (stat === 'pv') s.pv += bonus;
    else if (stat === 'spd') s.spd += bonus;
    else if (stat === 'esquive') s.esquiveGear += bonus;
    // ⚠️ CORRECTIF : "crit" comme stat d'objet (Armure de Rakshasa, Deadeye, Dague empoisonnée)
    // était silencieusement ignoré. Traité comme un bonus de LUCK (pas un %crit à part) --
    // cohérent avec le fait que luck pilote déjà le %crit ET le scaling d'arme "crit".
    // "luck" comme stat d'objet (Armure de Rakshasa, Deadeye, Dague empoisonnée) ajoute
    // directement à luckLineaire -- comme si le joueur avait investi ce montant lui-même.
    else if (stat === 'luck') s.luckLineaire += bonus;
}

function valeurStat(s, nomStat) {
    let brute;
    switch (nomStat) {
        case 'atk': brute = s.atk; break;
        case 'def': brute = s.def; break;
        case 'pv': brute = s.pv; break;
        case 'spd': brute = s.spdLineaire; break;
        case 'crit': brute = s.luckLineaire; break;
        default: return 0;
    }
    const poids = CST.POIDS_SCALING_STAT[nomStat] ?? 1.0;
    return brute * poids;
}

// Vue de l'arme selon la stance (1 = stance2) — substitue uniquement les champs de dégâts/scaling.
function vueArmeSelonStance(arme, stance) {
    if (!arme || !arme.dureeStance || stance === 0) return arme;
    return {
        ...arme,
        baseDegatsMin: arme.stance2BaseDegatsMin, baseDegatsMax: arme.stance2BaseDegatsMax,
        scaling1Stat: arme.stance2Scaling1Stat, scaling1Lettre: arme.stance2Scaling1Lettre,
        scaling2Stat: arme.stance2Scaling2Stat, scaling2Lettre: arme.stance2Scaling2Lettre,
        // ⚠️ EXTENSION "5 SCALINGS" : la vue stance 2 lit désormais stance2ScalingExtra comme sa
        // propre liste de scalings supplémentaires -- absent (toutes les armes existantes) = pas
        // de scalingExtra en stance 2, comportement inchangé.
        scalingExtra: arme.stance2ScalingExtra,
    };
}

function appliquerBonusArmeStance(s, arme, stance, signe) {
    if (!arme) return;
    if (stance === 0) {
        appliquerStatAuPersonnage(s, arme.stat, signe * (arme.bonus || 0));
        appliquerStatAuPersonnage(s, arme.stat2, signe * (arme.bonus2 || 0));
        appliquerStatAuPersonnage(s, arme.stat3, signe * (arme.bonus3 || 0));
        // ⚠️ EXTENSION : symétrique au C# -- statsExtra sur arme en stance 0 uniquement (limitation
        // connue : stance2StatsExtra pas encore géré, ni côté C# ni ici).
        if (arme.statsExtra) arme.statsExtra.forEach(slot => appliquerStatAuPersonnage(s, slot.nom, signe * (slot.bonus || 0)));
    } else {
        appliquerStatAuPersonnage(s, arme.stance2Stat, signe * (arme.stance2Bonus || 0));
        appliquerStatAuPersonnage(s, arme.stance2Stat2, signe * (arme.stance2Bonus2 || 0));
        appliquerStatAuPersonnage(s, arme.stance2Stat3, signe * (arme.stance2Bonus3 || 0));
    }
}

function estimerAtkEquivalent(stats, arme) {
    if (!arme || !arme.scaling1Stat) return stats.atk;
    let total = ((arme.baseDegatsMin || 0) + (arme.baseDegatsMax || 0)) / 2.0;
    let atkDejaCompte = false;
    function appliquer(nomStat, lettre) {
        if (!nomStat) return;
        const coef = CST.COEF_LETTRE_SCALING[lettre] || 0;
        const valeur = valeurStat(stats, nomStat);
        if (nomStat === 'atk') { total += valeur * coef; atkDejaCompte = true; }
        else total += valeur * coef * CST.PENALITE_HORS_ATK;
    }
    appliquer(arme.scaling1Stat, arme.scaling1Lettre);
    appliquer(arme.scaling2Stat, arme.scaling2Lettre);
    // ⚠️ EXTENSION "5 SCALINGS" : scalings supplémentaires (jusqu'à 5 stats au total sur une
    // arme) -- absent (toutes les armes existantes) ne change rien au résultat par rapport à avant.
    if (arme.scalingExtra) arme.scalingExtra.forEach(sl => appliquer(sl.stat, sl.lettre));
    if (!atkDejaCompte) total += stats.atk * CST.COEF_ATK_BASE;
    // CORRECTIF site (moteur/CORRECTIFS.md F10) : une arme ne frappe jamais moins fort que les mains nues.
    return Math.max(total, stats.atk);
}

// Moyenne 50/50 stance0/stance2, exactement comme EstimerAtkEquivalentAvecStance (voir duel.cs :
// le porteur passe autant de tours dans chaque stance, DureeStance régissant le switch dans les
// deux sens — c'est directement l'approximation justifiée par la mécanique réelle, pas un choix
// arbitraire de cette page).
function estimerAtkEquivalentAvecStance(s, arme) {
    const stance0 = estimerAtkEquivalent(s, arme);
    if (!arme || !arme.dureeStance) return stance0;
    const sStance2 = { ...s };
    appliquerBonusArmeStance(sStance2, arme, 0, -1.0);
    appliquerBonusArmeStance(sStance2, arme, 1, 1.0);
    const stance2 = estimerAtkEquivalent(sStance2, vueArmeSelonStance(arme, 1));
    return (stance0 + stance2) / 2.0;
}

// Horizon utilise pour amorcer une toute premiere estimation de survie, avant qu on ait pu
// calculer un survieTours reel pour CE personnage precis (voir le second passage plus bas, dans
// calculerPowerLevelSimule).
const HORIZON_INITIAL_TOURS = 10.0;

function usagesEffectifsStrategeme(s, horizonTours) {
    const usages = Math.max(1, s.usagesParCombat || 1);
    let total = 0;
    for (let k = 1; k <= usages; k++) {
        const coolDownEcoule = (k - 1) * (s.cooldownTours || 0);
        total += Math.max(0, 1.0 - coolDownEcoule / Math.max(0.01, horizonTours));
    }
    return total;
}

// ⚠️ REMPLACE L'ANCIENNE "FATIGUE" (un multiplicateur abstrait sur les dégâts subis) PAR UN
// MANNEQUIN QUI GRANDIT RÉELLEMENT : ses 4 stats (ATK/DEF/Chance/Vitesse) démarrent à la vraie
// base du jeu (10, 10, 10 -- BASE_LUCK_MANNEQUIN --, 10) et progressent au même rythme que
// l'ancienne fatigue (×FATIGUE_CROISSANCE tous les ROPE_CADENCE tours, à partir de
// ROPE_START_ACTION -- le calendrier dépend de TA vitesse, exactement comme avant). Le mannequin a
// une vie infinie : le combat ne s'arrête QUE quand le personnage testé meurt (ou au bout de
// MAX_ACTIONS par sécurité, ce qui ne devrait jamais arriver vu que la croissance est
// exponentielle). Comme sa DEF grandit aussi, on calcule maintenant tes dégâts infligés TOUR PAR
// TOUR (et non plus en un seul dpaInflige constant multiplié par la survie) : ils diminuent au fil
// du combat, exactement comme sa menace grandit -- un vrai bras de fer, plus une pénalité abstraite.
function simulerSurvieEtOffense(pvTotaux, hitChance, atkEquivalent, critMulti, arme, penetrationTotal,
                                  enemyHitChance, mitigationSelf, blocageMitig, etourdissementTotal, reductionTirTotal,
                                  regen, lifesteal, tourDebutCroissance, toursParTickCroissance) {
    let survieTours = CST.MAX_ACTIONS, cumulDegatsSubis = 0.0, totalDmgOffense = 0.0, paliers = 0;
    for (let tour = 1; tour <= CST.MAX_ACTIONS; tour++) {
        if (tour >= tourDebutCroissance) paliers = Math.floor((tour - tourDebutCroissance) / toursParTickCroissance) + 1;
        const facteur = Math.pow(CST.FATIGUE_CROISSANCE, paliers);
        const mannequinAtk = CST.BASE_ATK * facteur, mannequinDef = CST.BASE_DEF * facteur;
        const mannequinLuck = CST.BASE_LUCK_MANNEQUIN * facteur, mannequinSpd = CST.BASE_SPD * facteur;

        // Dégâts que TU infliges ce tour-ci -- de plus en plus mitigés, sa DEF grandissant.
        const defCibleEff = mannequinDef * (1.0 - Math.min(1.0, penetrationTotal / 100.0));
        const mitigationRef = mitigation(defCibleEff);
        let dpaInfligeCeTour = hitChance * (atkEquivalent * (1.0 - mitigationRef)) * critMulti;
        if (arme && arme.executionBonus > 0 && arme.executionSeuil > 0) {
            dpaInfligeCeTour *= (1.0 + Math.min(1.0, arme.executionSeuil / 100.0) * (arme.executionBonus / 100.0));
        }
        totalDmgOffense += dpaInfligeCeTour;

        // Dégâts que LE MANNEQUIN t'inflige ce tour-ci -- de plus en plus fort (ATK), plus souvent
        // (SPD) et critique plus souvent (Chance), au même rythme.
        const mannequinCritPct = CST.BASE_CRIT + CST.LUCK_CRIT_MAX * Math.tanh(mannequinLuck / CST.K_LUCK);
        let dpaSubiCeTour = enemyHitChance * (mannequinAtk * (1.0 - mitigationSelf)) * (1.0 + mannequinCritPct / 100.0);
        dpaSubiCeTour *= (1.0 - blocageMitig);
        if (etourdissementTotal > 0) dpaSubiCeTour *= (1.0 - Math.min(0.5, hitChance * (etourdissementTotal / 100.0) * 0.7));
        if (reductionTirTotal > 0) dpaSubiCeTour *= (1.0 - Math.min(1.0, reductionTirTotal / 100.0) * CST.PROPORTION_ARMES_TIR);
        dpaSubiCeTour *= (mannequinSpd / CST.BASE_SPD);

        const soinCeTour = regen + dpaInfligeCeTour * (lifesteal / 100.0);
        const degatsDeCeTour = dpaSubiCeTour - Math.min(soinCeTour, dpaSubiCeTour * 0.60);
        const cumulAvantCeTour = cumulDegatsSubis;
        cumulDegatsSubis += degatsDeCeTour;
        if (cumulDegatsSubis >= pvTotaux) {
            const restant = pvTotaux - cumulAvantCeTour;
            return { survieTours: Math.max(1.0, (tour - 1) + Math.min(1.0, restant / Math.max(0.01, degatsDeCeTour))), totalDmgOffense };
        }
    }
    return { survieTours: Math.max(1.0, survieTours), totalDmgOffense };
}

// Port fidèle de CalculerPowerLevelSimule — même structure, mêmes noms de variable côté C#
// pour qu'un futur correctif soit trivial à reporter ici par simple comparaison ligne à ligne.
function calculerPowerLevelSimule(s, atkEquivalent, critPct, esquivePct, arme, offhand, torso, strat) {
    let lifesteal = 0, regen = 0, parade = 0, blocage = 0, blocageReduc = 0, shield = 0;
    let poisonDmg = 0, saignementDmg = 0, bonusPlatDivers = 0;
    let critBonusTotal = 0, precisionTotal = 0, penetrationTotal = 0;
    let etourdissementTotal = 0, reductionTirTotal = 0;
    // EXTENSION "PANOPLIE SEKIRO" : burn porté par l'équipement (weapon/offhand/torso), en plus
    // du burn de stratagème déjà compté plus bas. Miroir de la même addition côté C#.
    let brulureDmgGear = 0;

    const gearAvecSoin = [];
    [arme, offhand, torso].forEach(g => {
        if (!g) return;
        lifesteal += g.lifesteal || 0;
        regen += g.regeneration || 0;
        parade += g.paradeChance || 0;
        blocage += g.blocage || 0;
        blocageReduc += g.blocageReduction || 0;
        shield += g.shieldMontant || 0;
        if ((g.soinDirect || 0) > 0) gearAvecSoin.push(g);
        const pd = g.poisonDegats || 0;
        poisonDmg += pd * (pd + 1) / 2.0;
        saignementDmg += g.saignementDegats || 0;
        critBonusTotal += g.critBonus || 0;
        precisionTotal += g.precision || 0;
        penetrationTotal += g.penetration || 0;
        etourdissementTotal += g.etourdissementChance || 0;
        reductionTirTotal += g.reductionDegatsTir || 0;
        bonusPlatDivers += (g.resistanceCrit || 0) * 0.150;
        bonusPlatDivers += (g.reflection || 0) * 0.6;
        bonusPlatDivers += (g.antiHealPourcentage || 0) * (g.antiHealDuree || 0) * 0.3;
        bonusPlatDivers += (g.rageBonusMax || 0) * 1.0;
        bonusPlatDivers += (g.marqueDegatsPourcentage || 0) * (g.marqueDuree || 0) * 0.5;
        bonusPlatDivers += (g.tenaciteChance || 0) * 0.8;
        bonusPlatDivers += g.dernierSouffleActif ? 40.0 : 0;
        bonusPlatDivers += (g.frenesieBonusSpd || 0) * (g.frenesieDuree || 0) * 0.3;
        bonusPlatDivers += (g.resistancePoison || 0) * 0.2;
        bonusPlatDivers += (g.resistanceFeu || 0) * 0.2;
        if ((g.brulureDegats || 0) > 0 && (g.brulureDuree || 0) > 0) {
            const amp = 1.0 + ((torso && torso.amplificationDegatsFeuPourcentage) || 0) / 100.0;
            brulureDmgGear += (g.brulureDegats || 0) * (g.brulureDuree || 0) * amp;
        }
        // Contributions heuristiques des nouveaux passifs "Panoplie Sekiro" -- même esprit que
        // les lignes ci-dessus (approximations plates, pas une resimulation du mécanisme réel qui
        // vit dans ResoudreCombatInterne côté C#, jamais porté en JS -- voir l'en-tête du fichier).
        bonusPlatDivers += ((g.rechargeSacrificePourcentage || 0) > 0 && (g.rechargeTousLesCoups || 0) > 0) ? (30.0 / g.rechargeTousLesCoups) : 0;
        bonusPlatDivers += (g.reductionPvMaxPourcentage || 0) * 4.0;
        bonusPlatDivers += (g.amplificationSoinsPourcentage || 0) * 0.5;
        bonusPlatDivers += (g.esquiveParadeBuffPourcentage || 0) * (g.esquiveParadeBuffDuree || 0) * 0.4;
        bonusPlatDivers += (g.briseDefPoints || 0) * Math.min(g.briseDefDuree || 0, 6) * 0.6;
        bonusPlatDivers += (g.dernierSouffleFractionPv || 0) * 100.0;
        bonusPlatDivers += (g.bruleeReflectionDegats || 0) * (g.bruleeReflectionDuree || 0) * 0.5;
        bonusPlatDivers += (g.saignementChanceParCoup || 0) * 0.3;
        bonusPlatDivers += (g.paralysieChance || 0) * Math.max(1, g.paralysieDuree || 0) * 0.5;
        bonusPlatDivers += (g.riposteEtourdissementTousLesCoups || 0) > 0 ? (40.0 / g.riposteEtourdissementTousLesCoups) : 0;
        if (g.modesTir && g.modesTir.length > 0) {
            let moyMulti = 0;
            g.modesTir.forEach(m => { moyMulti += m.multiplicateurDegats || 0; });
            moyMulti /= g.modesTir.length;
            bonusPlatDivers += (moyMulti - 1.0) * 30.0;
        }
    });

    const hitChance = (100.0 - Math.max(0, CST.BASE_ESQUIVE - precisionTotal)) / 100.0;
    const critMulti = 1.0 + (critPct + critBonusTotal) / 100.0;
    let enemyHitChance = (100.0 - esquivePct) / 100.0;
    enemyHitChance *= (100.0 - parade) / 100.0;
    const mitigationSelf = mitigation(s.def);
    const blocageMitig = (blocage / 100.0) * (blocageReduc / 100.0);

    // v1.1 : part des tours jouée face à un adversaire de vitesse SPD_REFERENCE, ramenée à 1 pour un
    // joueur sans vitesse (échelle de puissance inchangée pour lui), et qui sature comme le moteur.
    // v1.2 : même règle que le moteur (jauge de 100 + 1,2 par point d'avance, au plus 2 tours pour 1).
    const rythme = (v) => Math.min(2.0, Math.max(0.5, (100.0 + CST.TOUR_BONUS_PAR_POINT * Math.max(0, v - CST.SPD_REFERENCE)) / (100.0 + CST.TOUR_BONUS_PAR_POINT * Math.max(0, CST.SPD_REFERENCE - v))));
    const facteurVitesse = rythme(s.spd) / rythme(CST.BASE_SPD);
    const fractionActionsPropres = facteurVitesse / (facteurVitesse + 1.0);
    const tourDebutCroissance = CST.ROPE_START_ACTION * fractionActionsPropres;
    const toursParTickCroissance = Math.max(0.01, CST.ROPE_CADENCE * fractionActionsPropres);

    // Recharges de bouclier/soin en 2 passages, comme avant : la fatigue étant remplacée par un
    // mannequin qui grandit, l'horizon pertinent pour "combien de charges avant la mort" reste la
    // survie ESTIMÉE, pas un chiffre fixe arbitraire.
    const calculerPvTotaux = (horizon) => {
        let soinDirectH = 0, shieldStratH = 0;
        gearAvecSoin.forEach(g => { soinDirectH += (g.soinDirect || 0) * usagesEffectifsStrategeme(g, horizon); });
        if (strat && strat.shieldMontant > 0) shieldStratH = strat.shieldMontant * usagesEffectifsStrategeme(strat, horizon);
        return s.pv + shield + shieldStratH + soinDirectH;
    };

    const passeInitiale = simulerSurvieEtOffense(calculerPvTotaux(HORIZON_INITIAL_TOURS), hitChance, atkEquivalent, critMulti, arme,
        penetrationTotal, enemyHitChance, mitigationSelf, blocageMitig, etourdissementTotal, reductionTirTotal,
        regen, lifesteal, tourDebutCroissance, toursParTickCroissance);
    const pvTotaux = calculerPvTotaux(passeInitiale.survieTours);
    const passeFinale = simulerSurvieEtOffense(pvTotaux, hitChance, atkEquivalent, critMulti, arme,
        penetrationTotal, enemyHitChance, mitigationSelf, blocageMitig, etourdissementTotal, reductionTirTotal,
        regen, lifesteal, tourDebutCroissance, toursParTickCroissance);
    let survieTours = passeFinale.survieTours;

    let totalDmg = passeFinale.totalDmgOffense * facteurVitesse;

    const coupsQuiTouchent = hitChance * survieTours;
    const facteurPoisonSoutenu = Math.min(80.0, 1.0 + coupsQuiTouchent * coupsQuiTouchent * 0.03);
    totalDmg += poisonDmg * facteurPoisonSoutenu;
    totalDmg += saignementDmg * 3.0 * Math.min(3.0, survieTours / 3.0);
    totalDmg += brulureDmgGear;

    if (strat) {
        let stratDegats = (strat.degatsDirects || 0) * usagesEffectifsStrategeme(strat, survieTours) * Math.max(1, strat.coupsParUsage || 1);
        if (strat.delaiTours > 0) {
            const fiabilite = Math.min(1.0, survieTours / (strat.delaiTours + 1.0));
            stratDegats *= fiabilite;
        }
        totalDmg += (stratDegats * CST.POIDS_BURST);

        if (strat.poisonDegats > 0) {
            const stratPoisonDmg = strat.poisonDegats * (strat.poisonDegats + 1) / 2.0 * usagesEffectifsStrategeme(strat, survieTours);
            totalDmg += stratPoisonDmg * CST.POIDS_BURST;
        }
        if (strat.brulureDegats > 0 && strat.brulureDuree > 0) {
            const stratBrulureDmg = strat.brulureDegats * strat.brulureDuree * usagesEffectifsStrategeme(strat, survieTours);
            totalDmg += stratBrulureDmg * CST.POIDS_BURST;
        }
    }

    const scoreBrut = totalDmg + (pvTotaux * CST.POIDS_DEFENSE) + bonusPlatDivers;
    const powerLevel = scoreBrut / CST.DIVISEUR;

    return { dpaInflige: passeFinale.totalDmgOffense / Math.max(1, survieTours), survieTours, totalDmg, powerLevel, pvTotaux };
}

// Point d'entrée unique pour la page : à partir de stacks + équipement CHOISIS, renvoie tout ce
// qu'affiche le calculateur. `equipementBrut` = { arme, offhand, torso, strat } (objets BRUTS du
// catalogue, avec un champ .niveau ajouté = nombre de doublons possédés, comme partout ailleurs
// sur le site) — le nivelage (AppliquerAmelioration) est fait ICI, une seule fois, avant tout calcul.
function simulerBuild(stacks, equipementBrut) {
    const equipement = nivelerEquipement(equipementBrut);
    const s = calculerStatsEffectives(stacks, equipement);
    const critPct = CST.BASE_CRIT + CST.LUCK_CRIT_MAX * Math.tanh(s.luckLineaire / CST.K_LUCK);
    const esquivePct = CST.BASE_ESQUIVE + s.esquiveGear;
    const atkEquivalent = estimerAtkEquivalentAvecStance(s, equipement.arme);
    const resultat = calculerPowerLevelSimule(s, atkEquivalent, critPct, esquivePct, equipement.arme, equipement.offhand, equipement.torso, equipement.strat);
    return { stats: s, critPct, esquivePct, atkEquivalent, equipementNivele: equipement, ...resultat };
}

// Nivelle les 4 emplacements d'un coup (voir appliquerAmelioration). Centralisé ici pour qu'un
// seul appel niveler + un seul appel simulerBuild ne double jamais l'application du niveau.
function nivelerEquipement(equipementBrut) {
    return {
        arme: appliquerAmelioration(equipementBrut.arme, equipementBrut.arme ? (equipementBrut.arme.niveau || 0) : 0),
        offhand: appliquerAmelioration(equipementBrut.offhand, equipementBrut.offhand ? (equipementBrut.offhand.niveau || 0) : 0),
        torso: appliquerAmelioration(equipementBrut.torso, equipementBrut.torso ? (equipementBrut.torso.niveau || 0) : 0),
        strat: appliquerAmelioration(equipementBrut.strat, equipementBrut.strat ? (equipementBrut.strat.niveau || 0) : 0),
    };
}

if (typeof module !== 'undefined') module.exports = { CST, simulerBuild, calculerStatsEffectives, calculerPowerLevelSimule, estimerAtkEquivalentAvecStance, appliquerAmelioration, nivelerEquipement, mitigation };

export { CST, appliquerAmelioration, calculerStatsEffectives, calculerPowerLevelSimule, estimerAtkEquivalent, estimerAtkEquivalentAvecStance, appliquerBonusArmeStance, appliquerStatAuPersonnage, vueArmeSelonStance, valeurStat, niveauMaxPourRarete, mitigation, simulerBuild };
