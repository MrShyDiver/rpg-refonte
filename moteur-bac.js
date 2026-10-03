// Généré par outils/moteur-navigateur.mjs depuis supabase/functions/duel/ : ne pas modifier à la main.
(function () {
"use strict";
const CST = {
    BASE_ATK: 10.0,
    BONUS_ATK_PAR_STACK: 1.0,
    BASE_DEF: 10.0,
    BONUS_DEF_PAR_STACK: 1.0,
    BASE_LUCK_MANNEQUIN: 10.0,
    BASE_PV: 100.0,
    BONUS_PV_PAR_STACK: 10.0,
    BASE_SPD: 10.0,
    SPD_MAX_BONUS: 40.0,
    K_SPD: 40.0,
    SPD_REFERENCE: 20.0,
    TOUR_BONUS_PAR_POINT: 1.2,
    BASE_ESQUIVE: 15.0,
    BASE_CRIT: 15.0,
    LUCK_CRIT_MAX: 55.0,
    K_LUCK: 55.0,
    DEF_MITIGATION_MAX: 60.0,
    K_DEF_MITIGATION: 58.27,
    COEF_ATK_BASE: 0.3,
    PENALITE_HORS_ATK: 0.6,
    COEF_LETTRE_SCALING: {
        S: 1.3,
        A: 1.0,
        B: 0.75,
        C: 0.5,
        D: 0.25,
        E: 0.1
    },
    POIDS_SCALING_STAT: {
        atk: 1.0,
        def: 1.0,
        pv: 0.1,
        spd: 1.0,
        crit: 1.0
    },
    MAX_ACTIONS: 45,
    ROPE_START_ACTION: 20,
    ROPE_CADENCE: 2,
    FATIGUE_CROISSANCE: 1.30,
    POIDS_BURST: 2.5,
    POIDS_DEFENSE: 8.0,
    DIVISEUR: 5.0,
    PROPORTION_ARMES_TIR: 0.30
};
function mitigation(def) {
    return CST.DEF_MITIGATION_MAX * Math.tanh(def / CST.K_DEF_MITIGATION) / 100.0;
}
const CHAMP_STAT_PRINCIPALE = {
    Lifesteal: 'lifesteal',
    PoisonDegats: 'poisonDegats',
    Precision: 'precision',
    CritBonus: 'critBonus',
    Penetration: 'penetration',
    EtourdissementChance: 'etourdissementChance',
    ExecutionBonus: 'executionBonus',
    Blocage: 'blocage',
    BlocageReduction: 'blocageReduction',
    Reflection: 'reflection',
    ResistancePoison: 'resistancePoison',
    Regeneration: 'regeneration',
    ResistanceCrit: 'resistanceCrit',
    ResistanceFeu: 'resistanceFeu',
    DegatsDirects: 'degatsDirects',
    SoinDirect: 'soinDirect',
    SaignementDegats: 'saignementDegats',
    BrulureDegats: 'brulureDegats',
    AntiHealPourcentage: 'antiHealPourcentage',
    ShieldMontant: 'shieldMontant',
    RageBonusMax: 'rageBonusMax',
    MarqueDegatsPourcentage: 'marqueDegatsPourcentage',
    ParadeChance: 'paradeChance',
    TenaciteChance: 'tenaciteChance',
    FrenesieBonusSpd: 'frenesieBonusSpd',
    RechargeSacrificePourcentage: 'rechargeSacrificePourcentage',
    ReductionPvMaxPourcentage: 'reductionPvMaxPourcentage',
    AutoDegatsPourcentageDesDegats: 'autoDegatsPourcentageDesDegats',
    AmplificationSoinsPourcentage: 'amplificationSoinsPourcentage',
    EsquiveParadeBuffPourcentage: 'esquiveParadeBuffPourcentage',
    BriseDefPoints: 'briseDefPoints',
    DernierSouffleFractionPv: 'dernierSouffleFractionPv',
    BruleeReflectionDegats: 'bruleeReflectionDegats',
    AmplificationDegatsFeuPourcentage: 'amplificationDegatsFeuPourcentage',
    SaignementChanceParCoup: 'saignementChanceParCoup',
    ParalysieChance: 'paralysieChance',
    RiposteEtourdissementTousLesCoups: 'riposteEtourdissementTousLesCoups'
};
const NIVEAU_MAX_PAR_RARETE = {
    commun: 25,
    normal: 20,
    rare: 15,
    epique: 10,
    legendaire: 5
};
function niveauMaxPourRarete(rarete) {
    return NIVEAU_MAX_PAR_RARETE[rarete] !== undefined ? NIVEAU_MAX_PAR_RARETE[rarete] : NIVEAU_MAX_PAR_RARETE.commun;
}
function appliquerAmelioration(original, niveau) {
    if (!original || !niveau || niveau <= 0) return original;
    niveau = Math.min(niveau, niveauMaxPourRarete(original.rarete));
    const c = {
        ...original
    };
    if (original.statsExtra) c.statsExtra = original.statsExtra.map((sl)=>({
            ...sl
        }));
    if (original.passifsExtra) c.passifsExtra = original.passifsExtra.map((p)=>({
            ...p
        }));
    if (original.scalingExtra) c.scalingExtra = original.scalingExtra.map((sl)=>({
            ...sl
        }));
    if (original.stance2ScalingExtra) c.stance2ScalingExtra = original.stance2ScalingExtra.map((sl)=>({
            ...sl
        }));
    if (original.modesTir) c.modesTir = original.modesTir.map((m)=>({
            ...m
        }));
    if (c.stat) c.bonus = (c.bonus || 0) + niveau * (c.increment || 0);
    if (c.stat2) c.bonus2 = (c.bonus2 || 0) + niveau * (c.increment2 || 0);
    if (c.stat3) c.bonus3 = (c.bonus3 || 0) + niveau * (c.increment3 || 0);
    if (c.statsExtra) c.statsExtra.forEach((slot)=>{
        slot.bonus = (slot.bonus || 0) + niveau * (slot.increment || 0);
    });
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
    if (c.statPrincipale) {
        const champ = CHAMP_STAT_PRINCIPALE[c.statPrincipale];
        if (champ) c[champ] = (c[champ] || 0) + niveau * (c.incrementPassif || 0);
    }
    if (c.passifsExtra) {
        c.passifsExtra.forEach((passif)=>{
            const champ = CHAMP_STAT_PRINCIPALE[passif.champ];
            if (champ) c[champ] = (c[champ] || 0) + niveau * (passif.incrementPassif || 0);
        });
    }
    return c;
}
function calculerStatsEffectives(stacks, equipement) {
    const s = {
        atk: CST.BASE_ATK + CST.BONUS_ATK_PAR_STACK * stacks.atk,
        def: CST.BASE_DEF + CST.BONUS_DEF_PAR_STACK * stacks.def,
        pv: CST.BASE_PV + CST.BONUS_PV_PAR_STACK * stacks.pv,
        spd: CST.BASE_SPD + stacks.spd,
        spdLineaire: stacks.spd,
        luckLineaire: Math.max(0, stacks.luck),
        esquiveGear: 0
    };
    [
        equipement.arme,
        equipement.offhand,
        equipement.torso
    ].forEach((g)=>{
        if (!g) return;
        appliquerStatAuPersonnage(s, g.stat, g.bonus || 0);
        appliquerStatAuPersonnage(s, g.stat2, g.bonus2 || 0);
        appliquerStatAuPersonnage(s, g.stat3, g.bonus3 || 0);
        if (g.statsExtra) g.statsExtra.forEach((slot)=>appliquerStatAuPersonnage(s, slot.nom, slot.bonus || 0));
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
    else if (stat === 'luck') s.luckLineaire += bonus;
}
function valeurStat(s, nomStat) {
    let brute;
    switch(nomStat){
        case 'atk':
            brute = s.atk;
            break;
        case 'def':
            brute = s.def;
            break;
        case 'pv':
            brute = s.pv;
            break;
        case 'spd':
            brute = s.spdLineaire;
            break;
        case 'crit':
            brute = s.luckLineaire;
            break;
        default:
            return 0;
    }
    const poids = CST.POIDS_SCALING_STAT[nomStat] ?? 1.0;
    return brute * poids;
}
function vueArmeSelonStance(arme, stance) {
    if (!arme || !arme.dureeStance || stance === 0) return arme;
    return {
        ...arme,
        baseDegatsMin: arme.stance2BaseDegatsMin,
        baseDegatsMax: arme.stance2BaseDegatsMax,
        scaling1Stat: arme.stance2Scaling1Stat,
        scaling1Lettre: arme.stance2Scaling1Lettre,
        scaling2Stat: arme.stance2Scaling2Stat,
        scaling2Lettre: arme.stance2Scaling2Lettre,
        scalingExtra: arme.stance2ScalingExtra
    };
}
function appliquerBonusArmeStance(s, arme, stance, signe) {
    if (!arme) return;
    if (stance === 0) {
        appliquerStatAuPersonnage(s, arme.stat, signe * (arme.bonus || 0));
        appliquerStatAuPersonnage(s, arme.stat2, signe * (arme.bonus2 || 0));
        appliquerStatAuPersonnage(s, arme.stat3, signe * (arme.bonus3 || 0));
        if (arme.statsExtra) arme.statsExtra.forEach((slot)=>appliquerStatAuPersonnage(s, slot.nom, signe * (slot.bonus || 0)));
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
        if (nomStat === 'atk') {
            total += valeur * coef;
            atkDejaCompte = true;
        } else total += valeur * coef * CST.PENALITE_HORS_ATK;
    }
    appliquer(arme.scaling1Stat, arme.scaling1Lettre);
    appliquer(arme.scaling2Stat, arme.scaling2Lettre);
    if (arme.scalingExtra) arme.scalingExtra.forEach((sl)=>appliquer(sl.stat, sl.lettre));
    if (!atkDejaCompte) total += stats.atk * CST.COEF_ATK_BASE;
    return Math.max(total, stats.atk);
}
function estimerAtkEquivalentAvecStance(s, arme) {
    const stance0 = estimerAtkEquivalent(s, arme);
    if (!arme || !arme.dureeStance) return stance0;
    const sStance2 = {
        ...s
    };
    appliquerBonusArmeStance(sStance2, arme, 0, -1.0);
    appliquerBonusArmeStance(sStance2, arme, 1, 1.0);
    const stance2 = estimerAtkEquivalent(sStance2, vueArmeSelonStance(arme, 1));
    return (stance0 + stance2) / 2.0;
}
const HORIZON_INITIAL_TOURS = 10.0;
function usagesEffectifsStrategeme(s, horizonTours) {
    const usages = Math.max(1, s.usagesParCombat || 1);
    let total = 0;
    for(let k = 1; k <= usages; k++){
        const coolDownEcoule = (k - 1) * (s.cooldownTours || 0);
        total += Math.max(0, 1.0 - coolDownEcoule / Math.max(0.01, horizonTours));
    }
    return total;
}
function simulerSurvieEtOffense(pvTotaux, hitChance, atkEquivalent, critMulti, arme, penetrationTotal, enemyHitChance, mitigationSelf, blocageMitig, etourdissementTotal, reductionTirTotal, regen, lifesteal, tourDebutCroissance, toursParTickCroissance) {
    let survieTours = CST.MAX_ACTIONS, cumulDegatsSubis = 0.0, totalDmgOffense = 0.0, paliers = 0;
    for(let tour = 1; tour <= CST.MAX_ACTIONS; tour++){
        if (tour >= tourDebutCroissance) paliers = Math.floor((tour - tourDebutCroissance) / toursParTickCroissance) + 1;
        const facteur = Math.pow(CST.FATIGUE_CROISSANCE, paliers);
        const mannequinAtk = CST.BASE_ATK * facteur, mannequinDef = CST.BASE_DEF * facteur;
        const mannequinLuck = CST.BASE_LUCK_MANNEQUIN * facteur, mannequinSpd = CST.BASE_SPD * facteur;
        const defCibleEff = mannequinDef * (1.0 - Math.min(1.0, penetrationTotal / 100.0));
        const mitigationRef = mitigation(defCibleEff);
        let dpaInfligeCeTour = hitChance * (atkEquivalent * (1.0 - mitigationRef)) * critMulti;
        if (arme && arme.executionBonus > 0 && arme.executionSeuil > 0) {
            dpaInfligeCeTour *= 1.0 + Math.min(1.0, arme.executionSeuil / 100.0) * (arme.executionBonus / 100.0);
        }
        totalDmgOffense += dpaInfligeCeTour;
        const mannequinCritPct = CST.BASE_CRIT + CST.LUCK_CRIT_MAX * Math.tanh(mannequinLuck / CST.K_LUCK);
        let dpaSubiCeTour = enemyHitChance * (mannequinAtk * (1.0 - mitigationSelf)) * (1.0 + mannequinCritPct / 100.0);
        dpaSubiCeTour *= 1.0 - blocageMitig;
        if (etourdissementTotal > 0) dpaSubiCeTour *= 1.0 - Math.min(0.5, hitChance * (etourdissementTotal / 100.0) * 0.7);
        if (reductionTirTotal > 0) dpaSubiCeTour *= 1.0 - Math.min(1.0, reductionTirTotal / 100.0) * CST.PROPORTION_ARMES_TIR;
        dpaSubiCeTour *= mannequinSpd / CST.BASE_SPD;
        const soinCeTour = regen + dpaInfligeCeTour * (lifesteal / 100.0);
        const degatsDeCeTour = dpaSubiCeTour - Math.min(soinCeTour, dpaSubiCeTour * 0.60);
        const cumulAvantCeTour = cumulDegatsSubis;
        cumulDegatsSubis += degatsDeCeTour;
        if (cumulDegatsSubis >= pvTotaux) {
            const restant = pvTotaux - cumulAvantCeTour;
            return {
                survieTours: Math.max(1.0, tour - 1 + Math.min(1.0, restant / Math.max(0.01, degatsDeCeTour))),
                totalDmgOffense
            };
        }
    }
    return {
        survieTours: Math.max(1.0, survieTours),
        totalDmgOffense
    };
}
function calculerPowerLevelSimule(s, atkEquivalent, critPct, esquivePct, arme, offhand, torso, strat) {
    let lifesteal = 0, regen = 0, parade = 0, blocage = 0, blocageReduc = 0, shield = 0;
    let poisonDmg = 0, saignementDmg = 0, bonusPlatDivers = 0;
    let critBonusTotal = 0, precisionTotal = 0, penetrationTotal = 0;
    let etourdissementTotal = 0, reductionTirTotal = 0;
    let brulureDmgGear = 0;
    const gearAvecSoin = [];
    [
        arme,
        offhand,
        torso
    ].forEach((g)=>{
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
            const amp = 1.0 + (torso && torso.amplificationDegatsFeuPourcentage || 0) / 100.0;
            brulureDmgGear += (g.brulureDegats || 0) * (g.brulureDuree || 0) * amp;
        }
        bonusPlatDivers += (g.rechargeSacrificePourcentage || 0) > 0 && (g.rechargeTousLesCoups || 0) > 0 ? 30.0 / g.rechargeTousLesCoups : 0;
        bonusPlatDivers += (g.reductionPvMaxPourcentage || 0) * 4.0;
        bonusPlatDivers += (g.amplificationSoinsPourcentage || 0) * 0.5;
        bonusPlatDivers += (g.esquiveParadeBuffPourcentage || 0) * (g.esquiveParadeBuffDuree || 0) * 0.4;
        bonusPlatDivers += (g.briseDefPoints || 0) * Math.min(g.briseDefDuree || 0, 6) * 0.6;
        bonusPlatDivers += (g.dernierSouffleFractionPv || 0) * 100.0;
        bonusPlatDivers += (g.bruleeReflectionDegats || 0) * (g.bruleeReflectionDuree || 0) * 0.5;
        bonusPlatDivers += (g.saignementChanceParCoup || 0) * 0.3;
        bonusPlatDivers += (g.paralysieChance || 0) * Math.max(1, g.paralysieDuree || 0) * 0.5;
        bonusPlatDivers += (g.riposteEtourdissementTousLesCoups || 0) > 0 ? 40.0 / g.riposteEtourdissementTousLesCoups : 0;
        if (g.modesTir && g.modesTir.length > 0) {
            let moyMulti = 0;
            g.modesTir.forEach((m)=>{
                moyMulti += m.multiplicateurDegats || 0;
            });
            moyMulti /= g.modesTir.length;
            bonusPlatDivers += (moyMulti - 1.0) * 30.0;
        }
    });
    const hitChance = (100.0 - Math.max(0, CST.BASE_ESQUIVE - precisionTotal)) / 100.0;
    const critMulti = 1.0 + (critPct + critBonusTotal) / 100.0;
    let enemyHitChance = (100.0 - esquivePct) / 100.0;
    enemyHitChance *= (100.0 - parade) / 100.0;
    const mitigationSelf = mitigation(s.def);
    const blocageMitig = blocage / 100.0 * (blocageReduc / 100.0);
    const rythme = (v)=>Math.min(2.0, Math.max(0.5, (100.0 + CST.TOUR_BONUS_PAR_POINT * Math.max(0, v - CST.SPD_REFERENCE)) / (100.0 + CST.TOUR_BONUS_PAR_POINT * Math.max(0, CST.SPD_REFERENCE - v))));
    const facteurVitesse = rythme(s.spd) / rythme(CST.BASE_SPD);
    const fractionActionsPropres = facteurVitesse / (facteurVitesse + 1.0);
    const tourDebutCroissance = CST.ROPE_START_ACTION * fractionActionsPropres;
    const toursParTickCroissance = Math.max(0.01, CST.ROPE_CADENCE * fractionActionsPropres);
    const calculerPvTotaux = (horizon)=>{
        let soinDirectH = 0, shieldStratH = 0;
        gearAvecSoin.forEach((g)=>{
            soinDirectH += (g.soinDirect || 0) * usagesEffectifsStrategeme(g, horizon);
        });
        if (strat && strat.shieldMontant > 0) shieldStratH = strat.shieldMontant * usagesEffectifsStrategeme(strat, horizon);
        return s.pv + shield + shieldStratH + soinDirectH;
    };
    const passeInitiale = simulerSurvieEtOffense(calculerPvTotaux(HORIZON_INITIAL_TOURS), hitChance, atkEquivalent, critMulti, arme, penetrationTotal, enemyHitChance, mitigationSelf, blocageMitig, etourdissementTotal, reductionTirTotal, regen, lifesteal, tourDebutCroissance, toursParTickCroissance);
    const pvTotaux = calculerPvTotaux(passeInitiale.survieTours);
    const passeFinale = simulerSurvieEtOffense(pvTotaux, hitChance, atkEquivalent, critMulti, arme, penetrationTotal, enemyHitChance, mitigationSelf, blocageMitig, etourdissementTotal, reductionTirTotal, regen, lifesteal, tourDebutCroissance, toursParTickCroissance);
    let survieTours = passeFinale.survieTours;
    let totalDmg = passeFinale.totalDmgOffense * facteurVitesse;
    const coupsQuiTouchent = hitChance * survieTours;
    const facteurPoisonSoutenu = Math.min(80.0, 1.0 + coupsQuiTouchent * coupsQuiTouchent * 0.03);
    totalDmg += poisonDmg * facteurPoisonSoutenu;
    totalDmg += saignementDmg * 3.0 * Math.min(3.0, survieTours / 3.0);
    totalDmg += brulureDmgGear;
    if (strat) {
        let stratDegats = (strat.degatsDirects || 0) * usagesEffectifsStrategeme(strat, survieTours) * Math.max(1, strat.coupsParUsage || 1);
        stratDegats *= 1.0 + Math.max(0, critPct || 0) / 100.0;
        if (strat.delaiTours > 0) {
            const fiabilite = Math.min(1.0, survieTours / (strat.delaiTours + 1.0));
            stratDegats *= fiabilite;
        }
        totalDmg += stratDegats * CST.POIDS_BURST;
        if (strat.poisonDegats > 0) {
            const stratPoisonDmg = strat.poisonDegats * (strat.poisonDegats + 1) / 2.0 * usagesEffectifsStrategeme(strat, survieTours);
            totalDmg += stratPoisonDmg * CST.POIDS_BURST;
        }
        if (strat.brulureDegats > 0 && strat.brulureDuree > 0) {
            const stratBrulureDmg = strat.brulureDegats * strat.brulureDuree * usagesEffectifsStrategeme(strat, survieTours);
            totalDmg += stratBrulureDmg * CST.POIDS_BURST;
        }
    }
    const scoreBrut = totalDmg + pvTotaux * CST.POIDS_DEFENSE + bonusPlatDivers;
    const powerLevel = scoreBrut / CST.DIVISEUR;
    return {
        dpaInflige: passeFinale.totalDmgOffense / Math.max(1, survieTours),
        survieTours,
        totalDmg,
        powerLevel,
        pvTotaux
    };
}
function simulerBuild(stacks, equipementBrut) {
    const equipement = nivelerEquipement(equipementBrut);
    const s = calculerStatsEffectives(stacks, equipement);
    const critPct = CST.BASE_CRIT + CST.LUCK_CRIT_MAX * Math.tanh(s.luckLineaire / CST.K_LUCK);
    const esquivePct = CST.BASE_ESQUIVE + s.esquiveGear;
    const atkEquivalent = estimerAtkEquivalentAvecStance(s, equipement.arme);
    const resultat = calculerPowerLevelSimule(s, atkEquivalent, critPct, esquivePct, equipement.arme, equipement.offhand, equipement.torso, equipement.strat);
    return {
        stats: s,
        critPct,
        esquivePct,
        atkEquivalent,
        equipementNivele: equipement,
        ...resultat
    };
}
function nivelerEquipement(equipementBrut) {
    return {
        arme: appliquerAmelioration(equipementBrut.arme, equipementBrut.arme ? equipementBrut.arme.niveau || 0 : 0),
        offhand: appliquerAmelioration(equipementBrut.offhand, equipementBrut.offhand ? equipementBrut.offhand.niveau || 0 : 0),
        torso: appliquerAmelioration(equipementBrut.torso, equipementBrut.torso ? equipementBrut.torso.niveau || 0 : 0),
        strat: appliquerAmelioration(equipementBrut.strat, equipementBrut.strat ? equipementBrut.strat.niveau || 0 : 0)
    };
}
const REGLES_ESSAI = {
    BASE_PV: 200.0
};
const BUDGET = {
    BASE: 200,
    POINT: 10,
    POINT_PV: 15,
    DEUX_MAINS: 2,
    RARETE: {
        commun: [
            150,
            600
        ],
        normal: [
            200,
            700
        ],
        rare: [
            280,
            800
        ],
        epique: [
            380,
            900
        ],
        legendaire: [
            500,
            1000
        ]
    }
};
function budgetObjet(data, niveau) {
    if (!data) return 0;
    const g = BUDGET.RARETE[data.rarete] || BUDGET.RARETE.commun, max = niveauMaxPourRarete(data.rarete);
    const n = Math.max(0, Math.min(max, niveau || 0));
    return (g[0] + (g[1] - g[0]) * n / max) * (data.hand === "two_handed" ? BUDGET.DEUX_MAINS : 1);
}
function puissanceBudget(stacks, pieces) {
    const st = stacks || {};
    const points = (st.atk || 0) + (st.def || 0) + (st.spd || 0) + (st.luck || 0);
    return BUDGET.BASE + BUDGET.POINT * points + BUDGET.POINT_PV * (st.pv || 0) + (pieces || []).reduce((t, x)=>t + (x && x.data ? budgetObjet(x.data, x.niveau) : 0), 0);
}
if (typeof module !== 'undefined') module.exports = {
    CST,
    simulerBuild,
    calculerStatsEffectives,
    calculerPowerLevelSimule,
    estimerAtkEquivalentAvecStance,
    appliquerAmelioration,
    nivelerEquipement,
    mitigation
};


const VERSION_MOTEUR = "site-1.3.0";
const AP_THRESHOLD = 100.0;
const MAX_TOURS_DAFFILEE = 2;
const TOUR_BONUS_PAR_POINT = CST.TOUR_BONUS_PAR_POINT;
const SEUIL_SOIN_URGENCE = 0.5;
const MAX_ACTIONS = 45, ROPE_START_ACTION = 20, ROPE_CADENCE = 2;
const FATIGUE_BASE = 10, FATIGUE_CROISSANCE = 1.30;
const PROTECTION_REDUCTION = 0.20;
const SAIGNEMENT_SEUIL_EXPLOSION = 5;
const TRANCHE_LARGEUR_RELATIF = 0.30;
const { BASE_ESQUIVE, BASE_CRIT, LUCK_CRIT_MAX, K_LUCK, DEF_MITIGATION_MAX, K_DEF_MITIGATION, COEF_ATK_BASE, PENALITE_HORS_ATK } = CST;
const COEF_LETTRE_SCALING = CST.COEF_LETTRE_SCALING;
const CORRIGE = {
    ronde11: true,
    reviveUniverselle: true,
    stratBriseDefMarque: true,
    antiHealVolDeVie: true,
    dureesParPorteur: true,
    clampPvMaxErosion: true,
    tenaciteStrategeme: true,
    ampFeuStrategeme: true,
    plancherMainsNues: true,
    arrondiSansBiais: true,
    critStrategeme: true
};
const COMPAT_CS = Object.fromEntries(Object.keys(CORRIGE).map((k)=>[
        k,
        false
    ]));
function creerRng(seed) {
    let s = seed >>> 0;
    const sm = ()=>{
        s = s + 0x9e3779b9 >>> 0;
        let z = s;
        z = Math.imul(z ^ z >>> 16, 0x85ebca6b);
        z = Math.imul(z ^ z >>> 13, 0xc2b2ae35);
        return (z ^ z >>> 16) >>> 0;
    };
    let a = sm(), b = sm(), c = sm(), d = sm();
    const next = ()=>{
        const t = (a + b >>> 0) + d >>> 0;
        d = d + 1 >>> 0;
        a = b ^ b >>> 9;
        b = c + (c << 3) >>> 0;
        c = c << 21 | c >>> 11;
        c = c + t >>> 0;
        return t / 4294967296;
    };
    for(let i = 0; i < 12; i++)next();
    return next;
}
const CHAMPS_NUMERIQUES = ("bonus increment bonus2 increment2 bonus3 increment3 baseDegatsMin baseDegatsMax incrementBaseDegats dureeStance " + "stance2Bonus stance2IncrementBonus stance2Bonus2 stance2IncrementBonus2 stance2Bonus3 stance2IncrementBonus3 stance2BaseDegatsMin stance2BaseDegatsMax " + "stance2IncrementBaseDegats incrementPassif lifesteal poisonDegats poisonDuree precision critBonus etourdissementChance executionSeuil executionBonus " + "blocage blocageReduction reflection reductionDegatsTir resistancePoison resistanceFeu regeneration resistanceCrit usagesParCombat coupsParUsage " + "cooldownTours degatsDirects incrementDegatsDirects penetration delaiTours soinDirect saignementDegats saignementStacksParCoup antiHealPourcentage " + "antiHealDuree brulureDegats brulureDuree shieldMontant rageBonusMax rageSeuilMin marqueDegatsPourcentage marqueDuree paradeChance tenaciteChance " + "frenesieBonusSpd frenesieDuree rechargeTousLesCoups rechargeSacrificePourcentage reductionPvMaxPourcentage autoDegatsPourcentageDesDegats " + "amplificationSoinsPourcentage esquiveParadeBuffPourcentage esquiveParadeBuffDuree briseDefPoints briseDefDuree dernierSouffleFractionPv " + "bruleeReflectionDegats bruleeReflectionDuree amplificationDegatsFeuPourcentage saignementChanceParCoup etourdissementDureeTours paralysieChance " + "paralysieDuree riposteEtourdissementTousLesCoups soinDureeTours").split(" ");
const CHAMPS_LISTES = [
    "statsExtra",
    "passifsExtra",
    "scalingExtra",
    "stance2ScalingExtra",
    "modesTir"
];
function normaliserObjet(data) {
    if (!data) return null;
    const g = JSON.parse(JSON.stringify(data));
    for (const k of CHAMPS_NUMERIQUES){
        const v = Number(g[k]);
        g[k] = Number.isFinite(v) ? v : 0;
    }
    for (const k of CHAMPS_LISTES)if (!Array.isArray(g[k])) g[k] = [];
    for (const m of g.modesTir)for (const k of [
        "coupsParUsage",
        "penetration",
        "etourdissementChance",
        "saignementDegats",
        "saignementStacksParCoup",
        "multiplicateurDegats"
    ])m[k] = Number(m[k]) || 0;
    for (const p of g.passifsExtra)p.incrementPassif = Number(p.incrementPassif) || 0;
    g.dernierSouffleActif = !!g.dernierSouffleActif;
    return g;
}
const niveauEffectif = (g, niveau)=>Math.max(0, Math.min(Math.trunc(niveau || 0), niveauMaxPourRarete(g?.rarete)));
const SLOTS = [
    "arme",
    "offhand",
    "armure",
    "strategeme"
];
function construireCombattant(j) {
    const brut = {}, nivele = {}, niveaux = {};
    for (const slot of SLOTS){
        const e = j.equipement?.[slot];
        const g = e ? normaliserObjet(e.data) : null;
        brut[slot] = g;
        niveaux[slot] = g ? niveauEffectif(g, e.niveau) : 0;
        nivele[slot] = g ? appliquerAmelioration(g, niveaux[slot]) : null;
    }
    const st = j.stacks || {};
    const stacks = {
        atk: +st.atk || 0,
        def: +st.def || 0,
        pv: +st.pv || 0,
        spd: +st.spd || 0,
        luck: +st.luck || 0
    };
    const stats = calculerStatsEffectives(stacks, {
        arme: nivele.arme,
        offhand: nivele.offhand,
        torso: nivele.armure
    });
    const critPct = BASE_CRIT + LUCK_CRIT_MAX * Math.tanh(stats.luckLineaire / K_LUCK);
    const esquive = BASE_ESQUIVE + stats.esquiveGear;
    const power = calculerPowerLevelSimule(stats, estimerAtkEquivalentAvecStance(stats, nivele.arme), critPct, esquive, nivele.arme, nivele.offhand, nivele.armure, nivele.strategeme).powerLevel;
    return {
        joueur: j,
        stacks,
        brut,
        nivele,
        niveaux,
        stats,
        critPct,
        esquive,
        powerBrut: power,
        power: Math.round(power * 10) / 10
    };
}
const BrulureLayer = (Degats, Duree)=>({
        Degats,
        Duree
    });
function creerEtat(cb, cote) {
    const { arme, offhand, armure: torso, strategeme } = cb.nivele;
    const stats = {
        ...cb.stats
    };
    return {
        cote,
        nom: cb.joueur.login,
        cb,
        stats,
        arme,
        offhand,
        torso,
        strategeme,
        esquive: cb.esquive,
        luck: stats.luckLineaire,
        pv: stats.pv,
        pvMax: stats.pv,
        ap: 0,
        actionsPropres: 0,
        usagesRestants: strategeme?.usagesParCombat ?? 0,
        prochainUsageAction: 0,
        missileTourCible: -1,
        missileEnVol: null,
        tourOuvert: false,
        soinContinuRestant: 0,
        soinContinuMontant: 0,
        soinContinuObjet: null,
        usagesSoinRestants: (offhand?.soinDirect ?? 0) > 0 ? offhand.usagesParCombat : 0,
        prochainSoinAction: 0,
        usagesOffhandActifRestants: 0,
        usagesOffhandActifMax: 0,
        prochainOffhandActifAction: 0,
        poisonStack: 0,
        shield: (arme?.shieldMontant ?? 0) + (offhand?.shieldMontant ?? 0) + (torso?.shieldMontant ?? 0),
        saignementStacks: 0,
        saignementBanque: 0,
        saignementSonsSource: null,
        antiHealPourcentage: 0,
        antiHealDuree: 0,
        bruleeLayers: [],
        bruleeDegats: 0,
        bruleeDuree: 0,
        stanceActuelle: 0,
        tourDansStance: 0,
        derniereStanceEnvoyee: -1,
        marqueDegats: 0,
        marqueDuree: 0,
        dernierSouffleDispo: !!(arme?.dernierSouffleActif || offhand?.dernierSouffleActif || torso?.dernierSouffleActif),
        dernierSouffleDeclenche: false,
        dernierSouffleFraction: Math.max(arme?.dernierSouffleFractionPv ?? 0, offhand?.dernierSouffleFractionPv ?? 0, torso?.dernierSouffleFractionPv ?? 0),
        frenesieBonusSpd: 0,
        frenesieDuree: 0,
        etourdiDuree: 0,
        paralysieDuree: 0,
        coupsPortesCompteur: 0,
        coupsRecusCompteur: 0,
        modeTirIndex: 0,
        esquiveBuff: 0,
        paradeBuff: 0,
        buffDefDuree: 0,
        briseDefPoints: 0,
        briseDefDuree: 0,
        ampSoins: (offhand?.amplificationSoinsPourcentage ?? 0) + (torso?.amplificationSoinsPourcentage ?? 0),
        degatsInfliges: 0,
        plusGrosCoup: 0
    };
}
const EstActionOffhand = (g)=>!!g && g.usagesParCombat > 0 && g.soinDirect <= 0;
const mitigationDe = (def)=>DEF_MITIGATION_MAX * Math.tanh(def / K_DEF_MITIGATION) / 100.0;
const i = Math.trunc;
const pvAffiche = (pv)=>pv > 0 ? Math.max(1, i(pv)) : 0;
function arrondirBalles(vals, sansBiais) {
    if (!sansBiais) return vals.map(i);
    let cumul = 0, prec = 0;
    return vals.map((v)=>{
        cumul += v;
        const r = Math.round(cumul);
        const d = r - prec;
        prec = r;
        return d;
    });
}
function simulerDuel(attaquantEntree, defenseurEntree, opts) {
    const seed = Number(opts?.seed) >>> 0;
    const F = {
        ...opts?.compat_cs ? COMPAT_CS : CORRIGE,
        ...opts?._correctifs || {}
    };
    const rnd = creerRng(seed);
    const cbA = construireCombattant(attaquantEntree), cbD = construireCombattant(defenseurEntree);
    const A = creerEtat(cbA, "attaquant"), B = creerEtat(cbD, "defenseur");
    if (F.ronde11) for (const e of [
        A,
        B
    ])e.usagesOffhandActifRestants = e.usagesOffhandActifMax = EstActionOffhand(e.offhand) ? e.offhand.usagesParCombat : 0;
    const protectionActive = !!opts?.protection_active;
    const autre = (e)=>e === A ? B : A;
    const rounds = [];
    let numeroRound = 0, totalActions = 0, premierRoundFatigue = -1, nDeclenchementsFatigue = 0;
    let tourCourant = 1, dernierJoueur = null, serie = 0;
    let acc = {
        effets: new Set(),
        expl: {
            attaquant: null,
            defenseur: null
        }
    };
    const resetAcc = ()=>{
        acc = {
            effets: new Set(),
            expl: {
                attaquant: null,
                defenseur: null
            }
        };
    };
    function RecalcBrulee(e) {
        let total = 0, maxDuree = 0;
        for (const l of e.bruleeLayers){
            total += l.Degats;
            if (l.Duree > maxDuree) maxDuree = l.Duree;
        }
        e.bruleeDegats = total;
        e.bruleeDuree = maxDuree;
    }
    function MontantRevive(e) {
        return e.dernierSouffleFraction > 0 ? Math.max(1, e.pvMax * e.dernierSouffleFraction) : 1;
    }
    function verifierDernierSouffle(e) {
        if (e.pv <= 0 && e.dernierSouffleDispo) {
            e.pv = MontantRevive(e);
            e.dernierSouffleDispo = false;
            e.dernierSouffleDeclenche = true;
            acc.effets.add("dernier_souffle");
        }
    }
    const verifierLesDeux = ()=>{
        verifierDernierSouffle(A);
        verifierDernierSouffle(B);
    };
    function crediter(source, montant) {
        if (source && montant > 0) source.degatsInfliges += montant;
    }
    function AppliquerDegatsAvecShield(cible, degats, source) {
        const absorbe = Math.min(cible.shield, degats);
        cible.shield -= absorbe;
        cible.pv -= degats - absorbe;
        crediter(source, degats);
        if (F.reviveUniverselle) verifierDernierSouffle(cible);
    }
    function DegatsBruts(cible, degats, source) {
        cible.pv -= degats;
        crediter(source, degats);
        if (F.reviveUniverselle) verifierDernierSouffle(cible);
    }
    function SonDernierSouffle(e) {
        for (const g of [
            e.torso,
            e.offhand,
            e.arme
        ])if (g?.dernierSouffleActif && g.sonsDernierSouffle) return g.sonsDernierSouffle;
        return "";
    }
    function AppliquerEtourdissement(cible, duree, avecTenacite) {
        if (avecTenacite) {
            const tenacite = (cible.torso?.tenaciteChance ?? 0) + (cible.offhand?.tenaciteChance ?? 0);
            if (tenacite > 0 && rnd() * 100.0 < tenacite) {
                acc.effets.add("tenacite");
                return false;
            }
        }
        cible.etourdiDuree = Math.max(cible.etourdiDuree, duree);
        acc.effets.add("etourdi_applique");
        return true;
    }
    function etat(f) {
        const x = (e, k)=>e === A ? `${k}_attaquant` : `${k}_defenseur`;
        const o = {
            pv_attaquant_apres: pvAffiche(A.pv),
            pv_defenseur_apres: pvAffiche(B.pv),
            pv_max_attaquant_apres: i(A.pvMax),
            pv_max_defenseur_apres: i(B.pvMax)
        };
        for (const e of [
            A,
            B
        ]){
            o[x(e, "poison_duree")] = i(e.poisonStack);
            o[x(e, "paralysie_duree")] = e.paralysieDuree;
            o[x(e, "shield")] = i(e.shield);
            o[x(e, "saignement_stacks")] = e.saignementStacks;
            o[x(e, "saignement_banque")] = i(e.saignementBanque);
            const ex = acc.expl[e.cote];
            o[x(e, "saignement_explosion")] = !!ex;
            o[`degats_explosion_saignement_${e.cote}`] = ex ? ex.degats : 0;
            o[`sons_explosion_saignement_${e.cote}`] = ex ? ex.sons : null;
            o[x(e, "brulure_duree")] = e.bruleeDuree;
            o[x(e, "anti_heal_actif")] = e.antiHealPourcentage > 0;
            o[x(e, "marque_active")] = e.marqueDegats > 0;
            o[x(e, "brise_def_actif")] = e.briseDefPoints > 0;
            o[x(e, "frenesie_bonus")] = i(e.frenesieBonusSpd);
            o[x(e, "esquive_parade_buff")] = i(e.esquiveBuff + e.paradeBuff);
            o[x(e, "dernier_souffle")] = e.dernierSouffleDeclenche;
            o[x(e, "sons_dernier_souffle")] = e.dernierSouffleDeclenche ? SonDernierSouffle(e) : null;
        }
        for (const e of [
            A,
            B
        ]){
            const fait = e.actionsPropres + (e.tourOuvert ? 1 : 0);
            const attente = (prochain)=>Math.max(0, prochain - fait);
            o[`strategeme_usages_${e.cote}`] = e.strategeme ? e.usagesRestants : null;
            o[`strategeme_recharge_${e.cote}`] = e.strategeme ? attente(e.prochainUsageAction) : null;
            const soin = (e.offhand?.soinDirect ?? 0) > 0, actif = e.usagesOffhandActifMax > 0;
            o[`offhand_usages_${e.cote}`] = soin ? e.usagesSoinRestants : actif ? e.usagesOffhandActifRestants : null;
            o[`offhand_recharge_${e.cote}`] = soin ? attente(e.prochainSoinAction) : actif ? attente(e.prochainOffhandActifAction) : null;
            o[`missile_en_vol_${e.cote}`] = !!e.missileEnVol;
        }
        const porteur = f ?? null;
        o.strategeme_usages_restants = porteur ? porteur.usagesRestants : null;
        return o;
    }
    const base = (frappeur, cible)=>({
            round: numeroRound,
            frappeur,
            cible,
            touche: false,
            crit: false,
            bloque: false,
            degats: 0,
            etourdi: false,
            vol_de_vie: 0,
            poison_applique: false,
            degats_reflechis: 0,
            poison_tick: false,
            degats_poison: 0,
            fatigue_tick: false,
            degats_fatigue: 0,
            soin_applique: false,
            soin_montant: 0,
            soin_sons: "",
            soin_image: "",
            strategeme: false
        });
    function ajouterRound(f, cible, champs, evenement, anim, derniereUtilisation = false) {
        numeroRound++;
        const r = {
            ...base(f ? f.nom : "", cible),
            ...champs,
            ...etat(f)
        };
        r.round = numeroRound;
        r.tour = tourCourant;
        r.evenement = evenement;
        r.anim_arme = anim;
        r.strategeme_derniere_utilisation = derniereUtilisation;
        r.effets = [
            ...acc.effets
        ];
        rounds.push(r);
        resetAcc();
        if (f && r.frappeur === f.nom && r.degats > f.plusGrosCoup && r.cible !== f.nom) f.plusGrosCoup = r.degats;
        return r;
    }
    const FacteurSoin = (e)=>(1.0 - Math.min(1.0, e.antiHealPourcentage / 100.0)) * (1.0 + e.ampSoins / 100.0);
    function DeclencherSoinActifLocal(p, objet) {
        const duree = Math.max(1, i(objet.soinDureeTours));
        const part = objet.soinDirect / duree;
        const pvAvant = p.pv;
        p.pv = Math.min(p.pvMax, p.pv + part * FacteurSoin(p));
        const montant = i(p.pv - pvAvant);
        if (duree > 1) {
            p.soinContinuRestant = duree - 1;
            p.soinContinuMontant = part;
            p.soinContinuObjet = objet;
        }
        acc.effets.add("soin");
        ajouterRound(p, p.nom, {
            soin_applique: montant > 0,
            soin_montant: montant,
            soin_sons: objet.sons ?? "",
            soin_image: objet.image ?? "",
            offhand_action: true,
            offhand_soin: true,
            offhand_image: objet.image ?? "",
            soin_tours: duree,
            offhand_cooldown_tours: objet.cooldownTours
        }, "soin", "soin");
    }
    function AppliquerSaignement(cible, magnitude, stacksParCoup, sonsExplosion, source) {
        if (magnitude <= 0) return;
        cible.saignementStacks += Math.max(1, stacksParCoup);
        cible.saignementBanque += magnitude;
        if (sonsExplosion) cible.saignementSonsSource = sonsExplosion;
        acc.effets.add("saignement");
        if (cible.saignementStacks >= SAIGNEMENT_SEUIL_EXPLOSION) {
            const degatsExplosion = i(cible.saignementBanque);
            const banque = cible.saignementBanque, sons = cible.saignementSonsSource;
            cible.saignementStacks = 0;
            cible.saignementBanque = 0;
            acc.expl[cible.cote] = {
                degats: degatsExplosion,
                sons
            };
            acc.effets.add("saignement_explosion");
            DegatsBruts(cible, banque, source);
        }
    }
    function DeclencherUsageStrategemeLocal(p, strategeme, sonsOverride, derniereUtilisation) {
        const c = autre(p);
        if (strategeme.shieldMontant > 0) {
            p.shield += strategeme.shieldMontant;
            acc.effets.add("bouclier");
            ajouterRound(p, p.nom, {
                strategeme: true,
                strategeme_bouclier: true,
                montant_bouclier: i(strategeme.shieldMontant),
                strategeme_cooldown_tours: strategeme.cooldownTours,
                sons_override: sonsOverride
            }, "bouclier", "bouclier", derniereUtilisation);
            return;
        }
        const defCible = F.stratBriseDefMarque ? Math.max(0, c.stats.def - c.briseDefPoints) : c.stats.def;
        const mitigation = mitigationDe(defCible * (1.0 - Math.min(1.0, strategeme.penetration / 100.0)));
        const marque = F.stratBriseDefMarque && c.marqueDegats > 0 ? 1.0 + c.marqueDegats / 100.0 : 1.0;
        const coupsParUsage = Math.max(1, strategeme.coupsParUsage);
        const critChance = F.critStrategeme ? Math.max(0, BASE_CRIT + LUCK_CRIT_MAX * Math.tanh(p.luck / K_LUCK) - (c.torso?.resistanceCrit ?? 0)) : 0;
        const bruts = [], critParBalle = [];
        for(let coup = 0; coup < coupsParUsage; coup++){
            let d = 0, critCoup = false;
            if (strategeme.degatsDirects > 0) {
                const variance = 0.9 + rnd() * 0.20;
                critCoup = critChance > 0 && rnd() * 100.0 < Math.min(100, critChance);
                d = Math.max(0.1, strategeme.degatsDirects * (1.0 - mitigation)) * variance * marque * (critCoup ? 2.0 : 1.0);
            }
            bruts.push(d);
            critParBalle.push(critCoup);
            if (strategeme.saignementChanceParCoup > 0 && strategeme.saignementDegats > 0 && rnd() * 100.0 < strategeme.saignementChanceParCoup) AppliquerSaignement(c, strategeme.saignementDegats, strategeme.saignementStacksParCoup, strategeme.sonsExplosionSaignement ?? null, p);
            if (strategeme.etourdissementChance > 0 && rnd() * 100.0 < strategeme.etourdissementChance) AppliquerEtourdissement(c, Math.max(1, strategeme.etourdissementDureeTours), F.tenaciteStrategeme);
        }
        const degatsParBalle = arrondirBalles(bruts, F.arrondiSansBiais && strategeme.degatsDirects > 0);
        const degatsTotal = degatsParBalle.reduce((s, x)=>s + x, 0);
        AppliquerDegatsAvecShield(c, degatsTotal, p);
        let poisonApplique = false;
        if (strategeme.poisonDegats > 0) {
            poisonApplique = true;
            c.poisonStack += strategeme.poisonDegats;
            acc.effets.add("poison");
        }
        if (strategeme.brulureDegats > 0 && strategeme.brulureDuree > 0) {
            const amp = F.ampFeuStrategeme ? 1.0 + (p.torso?.amplificationDegatsFeuPourcentage ?? 0) / 100.0 : 1.0;
            c.bruleeLayers.push(BrulureLayer(strategeme.brulureDegats * amp, strategeme.brulureDuree));
            RecalcBrulee(c);
            acc.effets.add("brulure");
        }
        let paralysieAppliquee = false;
        if (strategeme.paralysieChance > 0 && rnd() * 100.0 < strategeme.paralysieChance) {
            paralysieAppliquee = true;
            c.paralysieDuree = Math.max(c.paralysieDuree, Math.max(1, strategeme.paralysieDuree));
            acc.effets.add("paralysie");
        }
        if (strategeme.briseDefPoints > 0) {
            c.briseDefPoints = strategeme.briseDefPoints;
            c.briseDefDuree = i(strategeme.briseDefDuree);
            acc.effets.add("brise_def");
        }
        if (degatsTotal > 0 && marque > 1) acc.effets.add("marque");
        const crit = critParBalle.some(Boolean);
        if (crit) acc.effets.add("crit");
        ajouterRound(p, c.nom, {
            touche: true,
            crit,
            degats: degatsTotal,
            degats_par_balle: degatsParBalle,
            crit_par_balle: critParBalle,
            poison_applique: poisonApplique,
            strategeme: true,
            strategeme_cooldown_tours: strategeme.cooldownTours,
            sons_override: sonsOverride,
            etourdi_applique: acc.effets.has("etourdi_applique"),
            paralysie_applique: paralysieAppliquee,
            sons_paralysie: paralysieAppliquee ? strategeme.sonsParalysie ?? "" : null,
            message_paralysie: paralysieAppliquee ? strategeme.messageParalysie ?? "" : null
        }, "strategeme", strategeme.anim || "explosion", derniereUtilisation);
    }
    function DeclencherActionOffhandLocal(p, objet) {
        const c = autre(p);
        let cibleNom = c.nom;
        if (objet.poisonDegats > 0) {
            c.poisonStack += objet.poisonDegats;
            acc.effets.add("poison");
        }
        if (objet.brulureDegats > 0 && objet.brulureDuree > 0) {
            const ampFeu = 1.0 + (p.torso?.amplificationDegatsFeuPourcentage ?? 0) / 100.0;
            c.bruleeLayers.push(BrulureLayer(objet.brulureDegats * ampFeu, objet.brulureDuree));
            RecalcBrulee(c);
            acc.effets.add("brulure");
        }
        if (objet.antiHealPourcentage > 0 && objet.antiHealDuree > 0) {
            c.antiHealPourcentage = objet.antiHealPourcentage;
            c.antiHealDuree = objet.antiHealDuree;
            acc.effets.add("anti_heal");
        }
        if (objet.briseDefPoints > 0) {
            c.briseDefPoints = objet.briseDefPoints;
            c.briseDefDuree = i(objet.briseDefDuree);
            acc.effets.add("brise_def");
        }
        if (objet.marqueDegatsPourcentage > 0 && objet.marqueDuree > 0) {
            c.marqueDegats = objet.marqueDegatsPourcentage;
            c.marqueDuree = objet.marqueDuree;
            acc.effets.add("marque");
        }
        if (objet.esquiveParadeBuffPourcentage > 0) {
            const paradeActuelle = (p.torso?.paradeChance ?? 0) + (p.offhand?.paradeChance ?? 0) + (vueArmeSelonStance(p.arme, p.stanceActuelle)?.paradeChance ?? 0);
            const dureeBuff = Math.max(1, objet.esquiveParadeBuffDuree);
            if (p.esquive >= paradeActuelle) p.esquiveBuff = objet.esquiveParadeBuffPourcentage;
            else p.paradeBuff = objet.esquiveParadeBuffPourcentage;
            p.buffDefDuree = dureeBuff;
            acc.effets.add("esquive_parade_buff");
            if (!(objet.poisonDegats > 0 || objet.brulureDegats > 0 || objet.antiHealPourcentage > 0 || objet.briseDefPoints > 0 || objet.marqueDegatsPourcentage > 0)) cibleNom = p.nom;
        }
        ajouterRound(p, cibleNom, {
            offhand_action: true,
            poison_applique: objet.poisonDegats > 0,
            sons_override: objet.sons ?? null,
            offhand_image: objet.image ?? "",
            offhand_cooldown_tours: objet.cooldownTours,
            offhand_sur_soi: cibleNom === p.nom
        }, "offhand", "offhand");
    }
    function decrementerDurees(e) {
        if (e.antiHealDuree > 0) {
            e.antiHealDuree--;
            if (e.antiHealDuree <= 0) e.antiHealPourcentage = 0;
        }
        if (e.marqueDuree > 0) {
            e.marqueDuree--;
            if (e.marqueDuree <= 0) e.marqueDegats = 0;
        }
        if (e.frenesieDuree > 0) {
            e.frenesieDuree--;
            if (e.frenesieDuree <= 0) e.frenesieBonusSpd = 0;
        }
        if (e.buffDefDuree > 0) {
            e.buffDefDuree--;
            if (e.buffDefDuree <= 0) {
                e.esquiveBuff = 0;
                e.paradeBuff = 0;
            }
        }
        if (e.briseDefDuree > 0 && e.briseDefDuree < 999) {
            e.briseDefDuree--;
            if (e.briseDefDuree <= 0) e.briseDefPoints = 0;
        }
    }
    while(A.pv > 0 && B.pv > 0 && totalActions < MAX_ACTIONS){
        const vA = A.stats.spd + A.frenesieBonusSpd, vB = B.stats.spd + B.frenesieBonusSpd;
        A.ap = Math.min(2 * AP_THRESHOLD, A.ap + AP_THRESHOLD + TOUR_BONUS_PAR_POINT * Math.max(0, vA - vB));
        B.ap = Math.min(2 * AP_THRESHOLD, B.ap + AP_THRESHOLD + TOUR_BONUS_PAR_POINT * Math.max(0, vB - vA));
        while((A.ap >= AP_THRESHOLD || B.ap >= AP_THRESHOLD) && A.pv > 0 && B.pv > 0 && totalActions < MAX_ACTIONS){
            let aJoue = A.ap >= AP_THRESHOLD && (B.ap < AP_THRESHOLD || A.ap > B.ap || A.ap === B.ap && A.stats.spd >= B.stats.spd);
            if (dernierJoueur === (aJoue ? A : B) && serie >= MAX_TOURS_DAFFILEE) aJoue = !aJoue;
            const f = aJoue ? A : B, c = aJoue ? B : A;
            serie = dernierJoueur === f ? serie + 1 : 1;
            dernierJoueur = f;
            tourCourant = totalActions + 1;
            f.tourOuvert = true;
            c.tourOuvert = false;
            const finTour = ()=>{
                f.ap = Math.max(0, f.ap - AP_THRESHOLD);
                f.actionsPropres++;
                totalActions++;
                f.tourOuvert = false;
            };
            A.dernierSouffleDeclenche = false;
            B.dernierSouffleDeclenche = false;
            resetAcc();
            const stunActif = f.etourdiDuree > 0;
            let actionConsommeeParAbilite = false;
            let soinApplique = false, soinMontant = 0, soinSons = "", soinImage = "";
            if (!stunActif) {
                const regen = (f.torso?.regeneration ?? 0) + (f.offhand?.regeneration ?? 0);
                if (regen > 0) {
                    const pvAvant = f.pv;
                    const montantBrut = f.pvMax * regen / 100.0 * FacteurSoin(f);
                    f.pv = Math.min(f.pvMax, f.pv + montantBrut);
                    soinMontant = i(f.pv - pvAvant);
                    soinApplique = soinMontant > 0;
                    const viaTorse = (f.torso?.regeneration ?? 0) > 0;
                    soinSons = (viaTorse ? f.torso.sons : f.offhand?.sons) ?? "";
                    soinImage = (viaTorse ? f.torso.image : f.offhand?.image) ?? "";
                    if (soinApplique) acc.effets.add("regeneration");
                }
            }
            if (f.soinContinuRestant > 0) {
                const pvAvant = f.pv;
                f.pv = Math.min(f.pvMax, f.pv + f.soinContinuMontant * FacteurSoin(f));
                f.soinContinuRestant--;
                const gagne = i(f.pv - pvAvant);
                if (gagne > 0) {
                    soinMontant += gagne;
                    soinApplique = true;
                    soinSons = soinSons || (f.soinContinuObjet?.sons ?? "");
                    soinImage = soinImage || (f.soinContinuObjet?.image ?? "");
                    acc.effets.add("soin_continu");
                }
            }
            const effetsDebutTour = new Set(acc.effets);
            resetAcc();
            for (const e of [
                f,
                c
            ]){
                if (e.missileEnVol && totalActions >= e.missileTourCible) {
                    const m = e.missileEnVol;
                    e.missileTourCible = -1;
                    e.missileEnVol = null;
                    DeclencherUsageStrategemeLocal(e, m, m?.sonsImpact ?? null, false);
                    rounds[rounds.length - 1].impact_differe = true;
                }
            }
            if (A.pv <= 0 || B.pv <= 0) {
                totalActions++;
                f.tourOuvert = false;
                continue;
            }
            if (!stunActif && f.strategeme && f.usagesRestants > 0 && f.actionsPropres >= f.prochainUsageAction) {
                if (F.ronde11) actionConsommeeParAbilite = true;
                const s = f.strategeme;
                f.usagesRestants--;
                const derniere = f.usagesRestants === 0;
                if (s.delaiTours > 0) {
                    acc.effets.add("missile_lance");
                    ajouterRound(f, c.nom, {
                        strategeme: true,
                        missile_lance: true,
                        missile_delai: s.delaiTours,
                        strategeme_cooldown_tours: s.cooldownTours,
                        sons_override: s.sons ?? null
                    }, "strategeme", s.anim || "explosion", derniere);
                    f.missileTourCible = totalActions + s.delaiTours;
                    f.missileEnVol = s;
                } else DeclencherUsageStrategemeLocal(f, s, null, derniere);
                f.prochainUsageAction = f.actionsPropres + 1 + s.cooldownTours;
            }
            if (!(F.ronde11 && actionConsommeeParAbilite) && !stunActif && f.offhand && f.offhand.soinDirect > 0 && f.usagesSoinRestants > 0 && f.actionsPropres >= f.prochainSoinAction && f.soinContinuRestant <= 0 && (f.pvMax - f.pv >= f.offhand.soinDirect * FacteurSoin(f) || f.pv <= f.pvMax * SEUIL_SOIN_URGENCE)) {
                DeclencherSoinActifLocal(f, f.offhand);
                f.usagesSoinRestants--;
                f.prochainSoinAction = f.actionsPropres + 1 + f.offhand.cooldownTours;
                if (F.ronde11) actionConsommeeParAbilite = true;
            } else if (F.ronde11 && !actionConsommeeParAbilite && !stunActif && EstActionOffhand(f.offhand) && f.usagesOffhandActifRestants > 0 && f.actionsPropres >= f.prochainOffhandActifAction) {
                DeclencherActionOffhandLocal(f, f.offhand);
                f.usagesOffhandActifRestants--;
                f.prochainOffhandActifAction = f.actionsPropres + 1 + f.offhand.cooldownTours;
                actionConsommeeParAbilite = true;
            }
            if (A.pv <= 0 || B.pv <= 0) {
                finTour();
                continue;
            }
            for (const e of effetsDebutTour)acc.effets.add(e);
            let poisonTick = false, degatsPoisonAppliques = 0;
            if (f.poisonStack > 0) {
                const resistance = (f.torso?.resistancePoison ?? 0) + (f.offhand?.resistancePoison ?? 0);
                const dp = f.poisonStack * (1.0 - Math.min(1.0, resistance / 100.0));
                degatsPoisonAppliques = i(dp);
                poisonTick = true;
                acc.effets.add("poison_tick");
                f.poisonStack = Math.max(0, f.poisonStack - 1);
                DegatsBruts(f, dp, c);
            }
            let brulureTick = false, degatsBrulureAppliques = 0;
            if (f.bruleeLayers.length > 0) {
                const resistanceFeu = (f.torso?.resistanceFeu ?? 0) + (f.offhand?.resistanceFeu ?? 0);
                const total = f.bruleeLayers.reduce((s, l)=>s + l.Degats, 0);
                const db = total * (1.0 - Math.min(1.0, resistanceFeu / 100.0));
                degatsBrulureAppliques = i(db);
                brulureTick = true;
                acc.effets.add("brulure_tick");
                for (const l of f.bruleeLayers)l.Duree--;
                f.bruleeLayers = f.bruleeLayers.filter((l)=>l.Duree > 0);
                RecalcBrulee(f);
                AppliquerDegatsAvecShield(f, db, c);
            }
            if (F.dureesParPorteur) decrementerDurees(f);
            else {
                decrementerDurees(A);
                decrementerDurees(B);
            }
            if (f.arme && f.arme.dureeStance > 0) {
                f.tourDansStance++;
                if (f.tourDansStance >= f.arme.dureeStance) {
                    f.tourDansStance = 0;
                    appliquerBonusArmeStance(f.stats, f.arme, f.stanceActuelle, -1.0);
                    f.stanceActuelle = 1 - f.stanceActuelle;
                    appliquerBonusArmeStance(f.stats, f.arme, f.stanceActuelle, 1.0);
                    if (f.stanceActuelle === 0) {
                        if (f.poisonStack > 0 || f.bruleeLayers.length) acc.effets.add("purge");
                        f.poisonStack = 0;
                        f.bruleeLayers = [];
                        RecalcBrulee(f);
                    }
                }
            }
            let fatigueTick = false, degatsFatigueAppliques = 0;
            if (totalActions >= ROPE_START_ACTION && (totalActions - ROPE_START_ACTION) % ROPE_CADENCE === 0) {
                if (premierRoundFatigue === -1) premierRoundFatigue = F.ronde11 && actionConsommeeParAbilite ? numeroRound : numeroRound + 1;
                nDeclenchementsFatigue++;
                degatsFatigueAppliques = i(FATIGUE_BASE * Math.pow(FATIGUE_CROISSANCE, nDeclenchementsFatigue - 1));
                fatigueTick = true;
                acc.effets.add("fatigue");
                A.pv -= degatsFatigueAppliques;
                B.pv -= degatsFatigueAppliques;
            }
            verifierLesDeux();
            const rattacher = ()=>{
                const rr = rounds[rounds.length - 1];
                const garde = {};
                for (const k of Object.keys(rr))if (/^(saignement_explosion|degats_explosion_saignement|sons_explosion_saignement|dernier_souffle|sons_dernier_souffle)_/.test(k) && rr[k]) garde[k] = rr[k];
                const { soin_applique: _s, soin_montant: _m, soin_sons: _so, soin_image: _i, ...autres } = ticks;
                Object.assign(rr, autres, etat(f), garde, {
                    regen_montant: soinMontant,
                    regen_sons: soinSons,
                    regen_image: soinImage
                });
                rr.effets = [
                    ...new Set([
                        ...rr.effets,
                        ...acc.effets
                    ])
                ];
                resetAcc();
            };
            const ticks = {
                regen_montant: soinMontant,
                poison_tick: poisonTick,
                degats_poison: degatsPoisonAppliques,
                poison_tick_attaquant: aJoue,
                fatigue_tick: fatigueTick,
                degats_fatigue: degatsFatigueAppliques,
                soin_applique: soinApplique,
                soin_montant: soinMontant,
                soin_sons: soinSons,
                soin_image: soinImage,
                brulure_tick: brulureTick,
                degats_brulure: degatsBrulureAppliques,
                brulure_tick_attaquant: aJoue
            };
            const evenementTick = fatigueTick ? "fatigue" : poisonTick ? "poison" : brulureTick ? "brulure" : "soin";
            if (A.pv <= 0 || B.pv <= 0) {
                if (F.ronde11 && actionConsommeeParAbilite) rattacher();
                else ajouterRound(null, "", {
                    ...ticks,
                    strategeme: false,
                    tour_de: f.nom
                }, evenementTick, "");
                finTour();
                continue;
            }
            if (stunActif) f.etourdiDuree--;
            const paralysieActif = f.paralysieDuree > 0;
            if (paralysieActif) f.paralysieDuree--;
            if (F.ronde11 && actionConsommeeParAbilite) {
                finTour();
                rattacher();
                continue;
            }
            if (stunActif || paralysieActif) {
                const src = c.strategeme;
                ajouterRound(f, c.nom, {
                    ...ticks,
                    etourdi: stunActif,
                    paralysie: paralysieActif,
                    sons_paralysie: paralysieActif ? src?.sonsParalysie ?? "" : null,
                    message_paralysie: paralysieActif ? src?.messageParalysie ?? "" : null
                }, stunActif ? "etourdi" : "paralysie", "");
                finTour();
                continue;
            }
            const statsFrappeur = f.stats;
            const defCible2 = Math.max(0, c.stats.def - c.briseDefPoints);
            let esquiveCible = c.esquive + c.esquiveBuff;
            const armeFrappeur = vueArme(f);
            const armeCible = vueArme(c);
            const offhandFrappeur = f.offhand, offhandCible = c.offhand, torsoCible = c.torso;
            const pvCibleActuel = c.pv, pvMaxCible = c.pvMax;
            if (armeFrappeur && armeFrappeur.precision > 0) esquiveCible = Math.max(0, esquiveCible - armeFrappeur.precision);
            const hitChance = Math.max(0, Math.min(100, 100 - esquiveCible));
            let touche = rnd() * 100.0 < hitChance;
            if (!touche) acc.effets.add("esquive");
            let crit = false, bloque = false, poisonApplique2 = false, executionActive = false, rageBonus = 0;
            let degats = 0, volDeVie = 0, degatsReflechis = 0, imageReflection = "";
            let degatsParBalle = [], critParBalle = [];
            let riposteStunSurFrappeur = false, paradeReussie = false, degatsRipostee = 0;
            let sacrificePv = 0, rechargeStrat = false, rechargeOffhand = false, contrecoup = 0, erosionPvMax = 0;
            let sonsParadeDeclenchee = "", sonsRiposteImpact = "";
            let modeActif = null;
            if (touche) {
                const paradeTorse = torsoCible?.paradeChance ?? 0, paradeOffhand = offhandCible?.paradeChance ?? 0, paradeArme = armeCible?.paradeChance ?? 0;
                const paradeCible = paradeTorse + paradeOffhand + paradeArme + c.paradeBuff;
                if (paradeCible > 0 && rnd() * 100.0 < paradeCible) {
                    paradeReussie = true;
                    touche = false;
                    acc.effets.add("parade");
                    acc.effets.add("riposte");
                    const resp = paradeTorse > 0 ? torsoCible : paradeArme > 0 ? armeCible : offhandCible;
                    sonsParadeDeclenchee = resp?.sonsParade ?? "";
                    sonsRiposteImpact = resp?.sonsRiposte ?? "";
                    const defRiposte = Math.max(0, f.stats.def - f.briseDefPoints);
                    const degatsRiposteBruts = Math.max(0.1, c.stats.atk * (1.0 - mitigationDe(defRiposte))) * (0.9 + rnd() * 0.2);
                    degatsRipostee = i(degatsRiposteBruts);
                    AppliquerDegatsAvecShield(f, degatsRipostee, c);
                    verifierLesDeux();
                }
            }
            if (touche) {
                let nbCoupsArme = armeFrappeur ? Math.max(1, armeFrappeur.coupsParUsage) : 1;
                const penetration = armeFrappeur ? armeFrappeur.penetration : 0;
                let mitigation = mitigationDe(defCible2 * (1.0 - Math.min(1.0, penetration / 100.0)));
                const resistanceCrit = torsoCible?.resistanceCrit ?? 0;
                const critChance = Math.max(0, BASE_CRIT + LUCK_CRIT_MAX * Math.tanh(f.luck / K_LUCK) + (armeFrappeur?.critBonus ?? 0) - resistanceCrit);
                executionActive = !!armeFrappeur && armeFrappeur.executionSeuil > 0 && pvCibleActuel / pvMaxCible * 100.0 <= armeFrappeur.executionSeuil;
                const cibleEstDefenseurProtege = !aJoue && protectionActive;
                if (armeFrappeur && armeFrappeur.modesTir.length > 0) {
                    const idx = f.modeTirIndex % armeFrappeur.modesTir.length;
                    modeActif = armeFrappeur.modesTir[idx];
                    nbCoupsArme = Math.max(1, modeActif.coupsParUsage);
                    mitigation = mitigationDe(defCible2 * (1.0 - Math.min(1.0, modeActif.penetration / 100.0)));
                    f.modeTirIndex = (f.modeTirIndex + 1) % armeFrappeur.modesTir.length;
                    acc.effets.add("mode_tir_" + idx);
                }
                const bruts = [];
                for(let coupN = 0; coupN < nbCoupsArme; coupN++){
                    const critCoup = rnd() * 100.0 < Math.min(100, critChance);
                    if (critCoup) crit = true;
                    const varianceCoup = 0.85 + rnd() * 0.30;
                    const { valeur: degatsBaseParBalle, nouveauSysteme } = CalculerDegatsBaseArme(armeFrappeur, statsFrappeur, nbCoupsArme);
                    let degatsBrutsCoup = nouveauSysteme ? Math.max(0.1, degatsBaseParBalle * (1.0 - mitigation)) * (critCoup ? 2.0 : 1.0) : Math.max(0.1, degatsBaseParBalle * (1.0 - mitigation)) * varianceCoup * (critCoup ? 2.0 : 1.0);
                    if (critCoup && armeFrappeur && armeFrappeur.frenesieBonusSpd > 0 && armeFrappeur.frenesieDuree > 0) {
                        f.frenesieBonusSpd = armeFrappeur.frenesieBonusSpd;
                        f.frenesieDuree = armeFrappeur.frenesieDuree;
                        acc.effets.add("frenesie");
                    }
                    if (armeFrappeur && armeFrappeur.rageBonusMax > 0 && armeFrappeur.rageSeuilMin < 100) {
                        const pvManquant = 100.0 - f.pv / f.pvMax * 100.0;
                        rageBonus = Math.min(armeFrappeur.rageBonusMax, Math.max(0, pvManquant / (100.0 - armeFrappeur.rageSeuilMin) * armeFrappeur.rageBonusMax));
                        degatsBrutsCoup *= 1.0 + rageBonus / 100.0;
                        if (rageBonus > 0) acc.effets.add("rage");
                    }
                    if (c.marqueDegats > 0) {
                        degatsBrutsCoup *= 1.0 + c.marqueDegats / 100.0;
                        acc.effets.add("marque");
                    }
                    if (executionActive) {
                        degatsBrutsCoup *= 1.0 + armeFrappeur.executionBonus / 100.0;
                        acc.effets.add("execution");
                    }
                    if (cibleEstDefenseurProtege) degatsBrutsCoup *= 1.0 - PROTECTION_REDUCTION;
                    if (offhandCible && offhandCible.reductionDegatsTir > 0 && armeFrappeur && armeFrappeur.anim === "tir") degatsBrutsCoup *= 1.0 - Math.min(1.0, offhandCible.reductionDegatsTir / 100.0);
                    if (offhandCible && offhandCible.blocage > 0 && rnd() * 100.0 < offhandCible.blocage) {
                        bloque = true;
                        acc.effets.add("bloque");
                        degatsBrutsCoup *= 1.0 - Math.min(1.0, offhandCible.blocageReduction / 100.0);
                    }
                    if (modeActif) degatsBrutsCoup *= modeActif.multiplicateurDegats;
                    bruts.push(degatsBrutsCoup);
                    critParBalle.push(critCoup);
                }
                degatsParBalle = arrondirBalles(bruts, F.arrondiSansBiais);
                degats = degatsParBalle.reduce((s, x)=>s + x, 0);
                if (crit) acc.effets.add("crit");
                AppliquerDegatsAvecShield(c, degats, f);
                verifierLesDeux();
                if (armeFrappeur && armeFrappeur.lifesteal > 0 && degats > 0) {
                    const antiHeal = F.antiHealVolDeVie ? 1.0 - Math.min(1.0, f.antiHealPourcentage / 100.0) : 1.0;
                    volDeVie = i(degats * armeFrappeur.lifesteal / 100.0 * antiHeal * (1.0 + f.ampSoins / 100.0));
                    f.pv = Math.min(f.pvMax, f.pv + volDeVie);
                    if (volDeVie > 0) acc.effets.add("vol_de_vie");
                }
                if (degats > 0) {
                    const reflectionTorse = torsoCible?.reflection ?? 0, reflectionOffhand = offhandCible?.reflection ?? 0;
                    if (reflectionTorse + reflectionOffhand > 0) {
                        degatsReflechis = i(degats * (reflectionTorse + reflectionOffhand) / 100.0);
                        AppliquerDegatsAvecShield(f, degatsReflechis, c);
                        imageReflection = reflectionTorse > 0 ? torsoCible?.image ?? "" : offhandCible?.image ?? "";
                        if (degatsReflechis > 0) acc.effets.add("renvoi");
                    }
                }
                if (armeFrappeur && armeFrappeur.poisonDegats > 0) {
                    poisonApplique2 = true;
                    c.poisonStack += armeFrappeur.poisonDegats;
                    acc.effets.add("poison");
                }
                if (armeFrappeur && armeFrappeur.saignementDegats > 0) AppliquerSaignement(c, armeFrappeur.saignementDegats, armeFrappeur.saignementStacksParCoup, armeFrappeur.sonsExplosionSaignement ?? null, f);
                if (armeFrappeur && armeFrappeur.antiHealPourcentage > 0 && armeFrappeur.antiHealDuree > 0) {
                    c.antiHealPourcentage = armeFrappeur.antiHealPourcentage;
                    c.antiHealDuree = armeFrappeur.antiHealDuree;
                    acc.effets.add("anti_heal");
                }
                if (armeFrappeur && armeFrappeur.marqueDegatsPourcentage > 0 && armeFrappeur.marqueDuree > 0) {
                    c.marqueDegats = armeFrappeur.marqueDegatsPourcentage;
                    c.marqueDuree = armeFrappeur.marqueDuree;
                    acc.effets.add("marque");
                }
                if (armeFrappeur && armeFrappeur.etourdissementChance > 0 && rnd() * 100.0 < armeFrappeur.etourdissementChance) AppliquerEtourdissement(c, Math.max(1, armeFrappeur.etourdissementDureeTours), true);
                if (degats > 0 && armeFrappeur && armeFrappeur.rechargeTousLesCoups > 0) {
                    f.coupsPortesCompteur++;
                    if (f.coupsPortesCompteur >= armeFrappeur.rechargeTousLesCoups) {
                        f.coupsPortesCompteur = 0;
                        const rStrat = !!f.strategeme && f.usagesRestants < f.strategeme.usagesParCombat;
                        const rSoin = !!f.offhand && f.offhand.soinDirect > 0 && f.usagesSoinRestants < f.offhand.usagesParCombat;
                        const rActif = f.usagesOffhandActifRestants < f.usagesOffhandActifMax;
                        if (rStrat || rSoin || rActif) {
                            sacrificePv = i(f.pv * (armeFrappeur.rechargeSacrificePourcentage / 100.0));
                            DegatsBruts(f, f.pv * (armeFrappeur.rechargeSacrificePourcentage / 100.0), null);
                            if (rStrat) f.usagesRestants++;
                            if (rSoin) f.usagesSoinRestants++;
                            if (rActif) f.usagesOffhandActifRestants++;
                            rechargeStrat = rStrat;
                            rechargeOffhand = rSoin || rActif;
                            acc.effets.add("recharge");
                        }
                        verifierLesDeux();
                    }
                }
                if (degats > 0 && armeFrappeur && armeFrappeur.reductionPvMaxPourcentage > 0) {
                    const pvMaxAvant = c.pvMax;
                    c.pvMax *= 1.0 - Math.min(0.9, armeFrappeur.reductionPvMaxPourcentage / 100.0);
                    if (F.clampPvMaxErosion) c.pv = Math.min(c.pv, c.pvMax);
                    erosionPvMax = i(pvMaxAvant) - i(c.pvMax);
                    acc.effets.add("erosion_pv_max");
                    if (armeFrappeur.autoDegatsPourcentageDesDegats > 0) {
                        const perte = f.pv * (armeFrappeur.autoDegatsPourcentageDesDegats / 100.0);
                        contrecoup = Math.max(1, i(perte));
                        DegatsBruts(f, Math.min(perte, Math.max(0, f.pv - 1)), null);
                        acc.effets.add("auto_degats");
                        verifierLesDeux();
                    }
                }
                const offhandAuContact = offhandFrappeur && !(F.ronde11 && EstActionOffhand(offhandFrappeur));
                if (degats > 0 && offhandAuContact && offhandFrappeur.poisonDegats > 0) {
                    poisonApplique2 = true;
                    c.poisonStack += offhandFrappeur.poisonDegats;
                    acc.effets.add("poison");
                }
                if (degats > 0 && offhandAuContact && offhandFrappeur.brulureDegats > 0 && offhandFrappeur.brulureDuree > 0) {
                    const ampFeu = 1.0 + (f.torso?.amplificationDegatsFeuPourcentage ?? 0) / 100.0;
                    c.bruleeLayers.push(BrulureLayer(offhandFrappeur.brulureDegats * ampFeu, offhandFrappeur.brulureDuree));
                    RecalcBrulee(c);
                    acc.effets.add("brulure");
                }
                if (degats > 0 && offhandAuContact && offhandFrappeur.antiHealPourcentage > 0 && offhandFrappeur.antiHealDuree > 0) {
                    c.antiHealPourcentage = offhandFrappeur.antiHealPourcentage;
                    c.antiHealDuree = offhandFrappeur.antiHealDuree;
                    acc.effets.add("anti_heal");
                }
                if (degats > 0 && offhandAuContact && offhandFrappeur.briseDefPoints > 0) {
                    c.briseDefPoints = offhandFrappeur.briseDefPoints;
                    c.briseDefDuree = i(offhandFrappeur.briseDefDuree);
                    acc.effets.add("brise_def");
                }
                if (degats > 0 && offhandAuContact && offhandFrappeur.marqueDegatsPourcentage > 0 && offhandFrappeur.marqueDuree > 0) {
                    c.marqueDegats = offhandFrappeur.marqueDegatsPourcentage;
                    c.marqueDuree = offhandFrappeur.marqueDuree;
                    acc.effets.add("marque");
                }
                if (modeActif && modeActif.saignementDegats > 0 && degats > 0) AppliquerSaignement(c, modeActif.saignementDegats, modeActif.saignementStacksParCoup, armeFrappeur?.sonsExplosionSaignement ?? null, f);
                if (modeActif && modeActif.etourdissementChance > 0 && rnd() * 100.0 < modeActif.etourdissementChance) AppliquerEtourdissement(c, 1, true);
                if (degats > 0 && torsoCible && torsoCible.riposteEtourdissementTousLesCoups > 0) {
                    c.coupsRecusCompteur++;
                    if (c.coupsRecusCompteur >= torsoCible.riposteEtourdissementTousLesCoups) {
                        c.coupsRecusCompteur = 0;
                        f.etourdiDuree = Math.max(f.etourdiDuree, 1);
                        riposteStunSurFrappeur = true;
                        acc.effets.add("riposte_stun");
                    }
                }
                if (degats > 0 && torsoCible && torsoCible.bruleeReflectionDegats > 0) {
                    const ampFeuReflect = 1.0 + torsoCible.amplificationDegatsFeuPourcentage / 100.0;
                    f.bruleeLayers.push(BrulureLayer(torsoCible.bruleeReflectionDegats * ampFeuReflect, torsoCible.bruleeReflectionDuree));
                    RecalcBrulee(f);
                    acc.effets.add("chair_ardente");
                }
                if (degats > 0 && offhandCible && offhandCible.esquiveParadeBuffPourcentage > 0 && !(F.ronde11 && EstActionOffhand(offhandCible))) {
                    const paradeActuelleCible = (torsoCible?.paradeChance ?? 0) + (offhandCible.paradeChance ?? 0) + (armeCible?.paradeChance ?? 0);
                    const dureeBuff = Math.max(1, offhandCible.esquiveParadeBuffDuree);
                    if (c.esquive >= paradeActuelleCible) c.esquiveBuff = offhandCible.esquiveParadeBuffPourcentage;
                    else c.paradeBuff = offhandCible.esquiveParadeBuffPourcentage;
                    c.buffDefDuree = dureeBuff;
                    acc.effets.add("esquive_parade_buff");
                }
            }
            finTour();
            const stanceVientDeChanger = f.derniereStanceEnvoyee !== f.stanceActuelle;
            f.derniereStanceEnvoyee = f.stanceActuelle;
            if (stanceVientDeChanger && f.arme?.dureeStance > 0 && f.actionsPropres > 1) acc.effets.add("stance");
            const sonsOverrideCoup = modeActif && modeActif.sons ? modeActif.sons : armeFrappeur && stanceVientDeChanger ? armeFrappeur.sons ?? null : null;
            ajouterRound(f, c.nom, {
                ...ticks,
                touche,
                crit,
                bloque,
                degats,
                degats_par_balle: degatsParBalle,
                crit_par_balle: critParBalle,
                sons_override: sonsOverrideCoup,
                arme_image_override: armeFrappeur && stanceVientDeChanger ? armeFrappeur.image ?? null : null,
                etourdi: false,
                etourdi_applique: acc.effets.has("etourdi_applique"),
                riposte_stun_frappeur: riposteStunSurFrappeur,
                vol_de_vie: volDeVie,
                poison_applique: poisonApplique2,
                degats_reflechis: degatsReflechis,
                reflection_image: imageReflection,
                execution_active: executionActive,
                execution_bonus: armeFrappeur ? armeFrappeur.executionBonus : 0,
                rage_bonus: i(rageBonus),
                parade_reussie: paradeReussie,
                degats_ripostee: degatsRipostee,
                sons_parade: sonsParadeDeclenchee,
                sons_riposte: sonsRiposteImpact,
                sacrifice_pv: sacrificePv,
                recharge_strategeme: rechargeStrat,
                recharge_offhand: rechargeOffhand,
                contrecoup,
                erosion_pv_max: erosionPvMax
            }, "attaque", armeFrappeur?.anim || "smash");
        }
    }
    function vueArme(e) {
        const v = vueArmeSelonStance(e.arme, e.stanceActuelle);
        if (v && v !== e.arme) {
            v.image = e.arme.stance2ImageUrl || e.arme.image;
            v.sons = e.arme.stance2Sons || e.arme.sons;
        }
        return v;
    }
    function CalculerDegatsBaseArme(arme, s, diviseurCoups) {
        if (!arme || !arme.scaling1Stat) return {
            valeur: s.atk / diviseurCoups,
            nouveauSysteme: false
        };
        const tirage = arme.baseDegatsMin / diviseurCoups + rnd() * ((arme.baseDegatsMax - arme.baseDegatsMin) / diviseurCoups);
        let scaling = 0, atkDejaCompte = false;
        const appliquer = (nomStat, lettre)=>{
            if (!nomStat) return;
            const coef = COEF_LETTRE_SCALING[lettre] ?? 0;
            const valeur = valeurStat(s, nomStat);
            if (nomStat === "atk") {
                scaling += valeur * coef;
                atkDejaCompte = true;
            } else scaling += valeur * coef * PENALITE_HORS_ATK;
        };
        appliquer(arme.scaling1Stat, arme.scaling1Lettre);
        appliquer(arme.scaling2Stat, arme.scaling2Lettre);
        for (const sl of arme.scalingExtra || [])appliquer(sl.stat, sl.lettre);
        if (!atkDejaCompte) scaling += s.atk * COEF_ATK_BASE;
        let total = tirage + scaling / diviseurCoups;
        if (F.plancherMainsNues) {
            const moyenne = (arme.baseDegatsMin + arme.baseDegatsMax) / 2.0 + scaling;
            if (moyenne < s.atk) total += (s.atk - moyenne) / diviseurCoups;
        }
        return {
            valeur: total,
            nouveauSysteme: true
        };
    }
    const estEgalite = A.pv <= 0 && B.pv <= 0;
    let vainqueur;
    if (estEgalite) vainqueur = null;
    else if (A.pv <= 0) vainqueur = "defenseur";
    else if (B.pv <= 0) vainqueur = "attaquant";
    else vainqueur = A.pv / A.pvMax >= B.pv / B.pvMax ? "attaquant" : "defenseur";
    const replay = construireReplay(cbA, cbD, A, B, rounds, vainqueur, premierRoundFatigue, seed, opts, protectionActive);
    return {
        vainqueur,
        replay,
        stats: {
            rounds: numeroRound,
            degats_attaquant: i(A.degatsInfliges),
            degats_defenseur: i(B.degatsInfliges),
            plus_gros_coup_attaquant: A.plusGrosCoup,
            plus_gros_coup_defenseur: B.plusGrosCoup,
            power_attaquant: cbA.power,
            power_defenseur: cbD.power
        }
    };
}
function construireReplay(cbA, cbD, A, B, rounds, vainqueur, premierRoundFatigue, seed, opts, protectionActive) {
    const ecartRelatif = (cbD.powerBrut - cbA.powerBrut) / Math.max(1.0, cbA.powerBrut);
    const tranche = ecartRelatif > TRANCHE_LARGEUR_RELATIF ? "au_dessus" : ecartRelatif < -TRANCHE_LARGEUR_RELATIF ? "en_dessous" : "dans_tranche";
    const statuts = {
        dans_tranche: [
            "Combat équitable",
            "Combat équitable"
        ],
        au_dessus: [
            "Outsider",
            "Favori"
        ],
        en_dessous: [
            "Favori",
            "Outsider"
        ]
    };
    const ia = cbA.joueur.infos || {}, id = cbD.joueur.infos || {};
    const r = {
        attaquant: cbA.joueur.login,
        defenseur: cbD.joueur.login,
        avatar_attaquant: cbA.joueur.avatar_url ?? null,
        avatar_defenseur: cbD.joueur.avatar_url ?? null,
        pv_max_attaquant: Math.trunc(cbA.stats.pv),
        pv_max_defenseur: Math.trunc(cbD.stats.pv),
        rounds,
        vainqueur: vainqueur === "attaquant" ? cbA.joueur.login : vainqueur === "defenseur" ? cbD.joueur.login : "",
        egalite: vainqueur === null,
        tranche,
        protection_active: protectionActive,
        round_debut_fatigue: premierRoundFatigue,
        statut_attaquant: statuts[tranche][0],
        statut_defenseur: statuts[tranche][1],
        victoires_attaquant: ia.victoires ?? 0,
        defaites_attaquant: ia.defaites ?? 0,
        egalites_attaquant: ia.egalites ?? 0,
        victoires_defenseur: id.victoires ?? 0,
        defaites_defenseur: id.defaites ?? 0,
        egalites_defenseur: id.egalites ?? 0,
        points_attaquant: 0,
        lootbox_attaquant: 0,
        points_defenseur: 0,
        lootbox_defenseur: 0,
        medailles_attaquant: 0,
        medailles_defenseur: 0
    };
    for (const [cote, e] of [
        [
            "attaquant",
            A
        ],
        [
            "defenseur",
            B
        ]
    ]){
        r[`${cote}_precision`] = e.arme?.precision ?? 0;
        r[`${cote}_reflection`] = (e.offhand?.reflection ?? 0) + (e.torso?.reflection ?? 0);
        r[`${cote}_resistance_crit`] = e.torso?.resistanceCrit ?? 0;
        r[`${cote}_regeneration`] = (e.torso?.regeneration ?? 0) + (e.offhand?.regeneration ?? 0);
        r[`${cote}_tenacite`] = (e.torso?.tenaciteChance ?? 0) + (e.offhand?.tenaciteChance ?? 0);
        r[`${cote}_shield_max`] = Math.trunc((e.arme?.shieldMontant ?? 0) + (e.offhand?.shieldMontant ?? 0) + (e.torso?.shieldMontant ?? 0));
    }
    for (const [cote, cb] of [
        [
            "attaquant",
            cbA
        ],
        [
            "defenseur",
            cbD
        ]
    ]){
        const { arme, offhand, armure, strategeme } = cb.brut, niv = cb.nivele;
        r[`arme_${cote}_icon`] = arme?.icone ?? "";
        r[`arme_${cote}_anim`] = arme?.anim ?? "";
        r[`arme_${cote}_image`] = arme?.image ?? "";
        r[`arme_${cote}_sons`] = arme?.sons ?? "";
        r[`arme_${cote}_deuxmains`] = arme?.hand === "two_handed";
        r[`arme_${cote}_coups`] = niv.arme?.coupsParUsage > 0 ? niv.arme.coupsParUsage : 1;
        r[`offhand_${cote}_icon`] = offhand?.icone ?? "";
        r[`offhand_${cote}_image`] = offhand?.image ?? "";
        r[`torso_${cote}_icon`] = armure?.icone ?? "";
        r[`torso_${cote}_couleur`] = armure?.borderColor ?? "";
        r[`torso_${cote}_image`] = armure?.image ?? "";
        r[`strategeme_${cote}_icon`] = strategeme?.icone ?? "";
        r[`strategeme_${cote}_image`] = strategeme?.image ?? "";
        r[`strategeme_${cote}_anim`] = strategeme?.anim ?? null;
        r[`strategeme_${cote}_sons`] = strategeme?.sons ?? "";
        r[`strategeme_${cote}_coups`] = niv.strategeme?.coupsParUsage > 0 ? niv.strategeme.coupsParUsage : 1;
    }
    r.id = opts?.id ?? null;
    r.date = opts?.date ?? null;
    r.type = opts?.mode === "entrainement" ? "entrainement" : "duel";
    r.power_attaquant = cbA.power;
    r.power_defenseur = cbD.power;
    r.degats_infliges_attaquant = Math.trunc(A.degatsInfliges);
    r.degats_infliges_defenseur = Math.trunc(B.degatsInfliges);
    r.plus_gros_coup_attaquant = A.plusGrosCoup;
    r.plus_gros_coup_defenseur = B.plusGrosCoup;
    const build = (cb)=>{
        const o = {};
        for (const [cle, slot] of [
            [
                "arme",
                "arme"
            ],
            [
                "offhand",
                "offhand"
            ],
            [
                "torso",
                "armure"
            ],
            [
                "strategeme",
                "strategeme"
            ]
        ]){
            const g = cb.brut[slot], e = cb.joueur.equipement?.[slot];
            o[cle] = {
                nom: g?.nom ?? "",
                niveau: cb.niveaux[slot],
                niveau_possede: e?.niveau ?? 0,
                numero: g ? e?.numero ?? g.numero ?? null : null,
                rarete: g?.rarete ?? null,
                image: g?.image ?? null
            };
        }
        return o;
    };
    r.build_attaquant = build(cbA);
    r.build_defenseur = build(cbD);
    r.version_moteur = VERSION_MOTEUR;
    r.seed = seed;
    r.mode = opts?.mode ?? "classe";
    r.compat_cs = !!opts?.compat_cs;
    r.strategeme_usages_max_attaquant = cbA.nivele.strategeme?.usagesParCombat ?? 0;
    r.strategeme_usages_max_defenseur = cbD.nivele.strategeme?.usagesParCombat ?? 0;
    r.offhand_usages_max_attaquant = cbA.nivele.offhand?.usagesParCombat ?? 0;
    r.offhand_usages_max_defenseur = cbD.nivele.offhand?.usagesParCombat ?? 0;
    r.armure_pv_max_attaquant = Math.trunc(cbA.stats.pv);
    r.armure_pv_max_defenseur = Math.trunc(cbD.stats.pv);
    return r;
}

window.MoteurDuel = { simulerDuel, construireCombattant, VERSION_MOTEUR, CST }; // CST : le Simulateur y applique les règles à l'essai, le temps d'une simulation
})();
