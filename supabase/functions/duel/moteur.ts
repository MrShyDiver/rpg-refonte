// =========================================================================================
// MOTEUR DE DUEL — port TypeScript de moteur-combat.cs (ResoudreCombatInterne + helpers).
// Le site est désormais LE moteur de référence (voir CONTRAT-DUELS.md §1).
//
// - Module ES pur : aucune dépendance hors import relatif (formule-combat.gen.ts, généré par
//   build.mjs à partir de ../formule-combat.js — la formule de PowerLevel reste UNE seule source).
// - Tourne sous Deno (Edge Function), Node (moteur.js) et navigateur (moteur.iife.js).
// - RNG seedée (sfc32 + splitmix32) : même seed + mêmes entrées = même combat, au bit près.
// - Les noms de fonctions reprennent ceux du C# pour comparer ligne à ligne.
// - Chaque écart volontaire au C# est tagué `CORRECTIF Fx` et documenté dans CORRECTIFS.md.
//   `opts.compat_cs = true` désactive TOUS les correctifs de gameplay (+ Ronde 11) : sert aux
//   tests de parité / avant-après, jamais en production.
// =========================================================================================
import {
  CST, appliquerAmelioration, calculerStatsEffectives, calculerPowerLevelSimule,
  estimerAtkEquivalentAvecStance, appliquerBonusArmeStance, vueArmeSelonStance, valeurStat, niveauMaxPourRarete,
} from "./formule-combat.gen.ts";

export const VERSION_MOTEUR = "site-1.1.1";

// ---------------------------------------------------------------- contrat
export interface Equipement { data: Record<string, any>; niveau: number; numero?: number }
export interface JoueurEntree {
  login: string; display_name: string; avatar_url: string | null;
  stacks: { atk: number; def: number; pv: number; spd: number; luck: number };
  equipement: { arme?: Equipement | null; offhand?: Equipement | null; armure?: Equipement | null; strategeme?: Equipement | null };
  infos?: Record<string, any>;
}
export interface ResultatDuel {
  vainqueur: "attaquant" | "defenseur" | null;
  replay: Record<string, any>;
  stats: {
    rounds: number; degats_attaquant: number; degats_defenseur: number;
    plus_gros_coup_attaquant: number; plus_gros_coup_defenseur: number; power_attaquant: number; power_defenseur: number;
  };
}
export interface OptionsDuel {
  seed: number; mode?: "classe" | "entrainement";
  compat_cs?: boolean;          // true = comportement C# d'origine (tests de parité uniquement)
  protection_active?: boolean;  // -20 % de dégâts d'arme subis par le défenseur (duel.cs) — défaut false
  id?: string | null; date?: string | null;
  _correctifs?: Record<string, boolean>; // tests d'impact uniquement : surcharge fine des drapeaux F*
}

// ---------------------------------------------------------------- constantes (moteur-combat.cs)
const AP_THRESHOLD = 100.0;
// v1.1 — alternance + tour bonus : le plus rapide joue plus souvent, mais jamais plus de 2 tours d'affilée.
const MAX_TOURS_DAFFILEE = 2;
// v1.1 — un soin actif ne part que s'il manque au moins son montant, ou sous ce seuil de PV.
const SEUIL_SOIN_URGENCE = 0.5;
const MAX_ACTIONS = 45, ROPE_START_ACTION = 20, ROPE_CADENCE = 2;
const FATIGUE_BASE = 10, FATIGUE_CROISSANCE = 1.30;
const PROTECTION_REDUCTION = 0.20;
const SAIGNEMENT_SEUIL_EXPLOSION = 5; // décision du 02/10 (20 auparavant : l'explosion n'arrivait presque jamais)
const TRANCHE_LARGEUR_RELATIF = 0.30; // duel.cs
const { BASE_ESQUIVE, BASE_CRIT, LUCK_CRIT_MAX, K_LUCK, DEF_MITIGATION_MAX, K_DEF_MITIGATION, COEF_ATK_BASE, PENALITE_HORS_ATK } = CST;
const COEF_LETTRE_SCALING: Record<string, number> = CST.COEF_LETTRE_SCALING;

// Drapeaux de correctifs (voir CORRECTIFS.md). Tous vrais en production.
interface Correctifs {
  ronde11: boolean;              // F12 économie de tours Ronde 11 (capacité = action à part entière)
  reviveUniverselle: boolean;    // F2 dernier souffle vérifié après TOUTE source de dégâts
  stratBriseDefMarque: boolean;  // F3 stratagème : DEF réduite par brise-def + marque appliquée
  antiHealVolDeVie: boolean;     // F4 anti-soin réduit aussi le vol de vie
  dureesParPorteur: boolean;     // F5 durées (marque, anti-soin, brise-def, frénésie, buff) comptées en tours de l'affecté
  clampPvMaxErosion: boolean;    // F6 PV ramenés sous le PV max érodé
  tenaciteStrategeme: boolean;   // F7 ténacité résiste aussi aux étourdissements de stratagème
  ampFeuStrategeme: boolean;     // F8 amplification feu du torse s'applique à la brûlure de stratagème
  plancherMainsNues: boolean;    // F10 une arme ne frappe jamais moins fort que les mains nues
  arrondiSansBiais: boolean;     // F11 arrondi cumulatif des dégâts par balle (au lieu de la troncature)
}
const CORRIGE: Correctifs = {
  ronde11: true, reviveUniverselle: true, stratBriseDefMarque: true, antiHealVolDeVie: true, dureesParPorteur: true,
  clampPvMaxErosion: true, tenaciteStrategeme: true, ampFeuStrategeme: true, plancherMainsNues: true, arrondiSansBiais: true,
};
const COMPAT_CS: Correctifs = Object.fromEntries(Object.keys(CORRIGE).map(k => [k, false])) as unknown as Correctifs;

// ---------------------------------------------------------------- RNG seedée (F1)
// sfc32 initialisé par splitmix32 : période ~2^128, aucun aléa non seedé.
export function creerRng(seed: number): () => number {
  let s = seed >>> 0;
  const sm = () => { s = (s + 0x9e3779b9) >>> 0; let z = s; z = Math.imul(z ^ (z >>> 16), 0x85ebca6b); z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35); return (z ^ (z >>> 16)) >>> 0; };
  let a = sm(), b = sm(), c = sm(), d = sm();
  const next = () => {
    const t = (((a + b) >>> 0) + d) >>> 0; d = (d + 1) >>> 0;
    a = b ^ (b >>> 9); b = (c + (c << 3)) >>> 0; c = ((c << 21) | (c >>> 11)); c = (c + t) >>> 0;
    return t / 4294967296;
  };
  for (let i = 0; i < 12; i++) next();
  return next;
}

// ---------------------------------------------------------------- objets
// items.data est « creux » (clés à 0 absentes) : on remet chaque champ numérique à 0 pour que ni
// le moteur ni formule-combat.js ne calculent jamais avec undefined (NaN).
const CHAMPS_NUMERIQUES = ("bonus increment bonus2 increment2 bonus3 increment3 baseDegatsMin baseDegatsMax incrementBaseDegats dureeStance " +
  "stance2Bonus stance2IncrementBonus stance2Bonus2 stance2IncrementBonus2 stance2Bonus3 stance2IncrementBonus3 stance2BaseDegatsMin stance2BaseDegatsMax " +
  "stance2IncrementBaseDegats incrementPassif lifesteal poisonDegats poisonDuree precision critBonus etourdissementChance executionSeuil executionBonus " +
  "blocage blocageReduction reflection reductionDegatsTir resistancePoison resistanceFeu regeneration resistanceCrit usagesParCombat coupsParUsage " +
  "cooldownTours degatsDirects incrementDegatsDirects penetration delaiTours soinDirect saignementDegats saignementStacksParCoup antiHealPourcentage " +
  "antiHealDuree brulureDegats brulureDuree shieldMontant rageBonusMax rageSeuilMin marqueDegatsPourcentage marqueDuree paradeChance tenaciteChance " +
  "frenesieBonusSpd frenesieDuree rechargeTousLesCoups rechargeSacrificePourcentage reductionPvMaxPourcentage autoDegatsPourcentageDesDegats " +
  "amplificationSoinsPourcentage esquiveParadeBuffPourcentage esquiveParadeBuffDuree briseDefPoints briseDefDuree dernierSouffleFractionPv " +
  "bruleeReflectionDegats bruleeReflectionDuree amplificationDegatsFeuPourcentage saignementChanceParCoup etourdissementDureeTours paralysieChance " +
  "paralysieDuree riposteEtourdissementTousLesCoups soinDureeTours").split(" ");
const CHAMPS_LISTES = ["statsExtra", "passifsExtra", "scalingExtra", "stance2ScalingExtra", "modesTir"];

export function normaliserObjet(data: Record<string, any> | null | undefined): Record<string, any> | null {
  if (!data) return null;
  const g: Record<string, any> = JSON.parse(JSON.stringify(data)); // copie profonde : le catalogue n'est jamais muté
  for (const k of CHAMPS_NUMERIQUES) { const v = Number(g[k]); g[k] = Number.isFinite(v) ? v : 0; }
  for (const k of CHAMPS_LISTES) if (!Array.isArray(g[k])) g[k] = [];
  for (const m of g.modesTir) for (const k of ["coupsParUsage", "penetration", "etourdissementChance", "saignementDegats", "saignementStacksParCoup", "multiplicateurDegats"]) m[k] = Number(m[k]) || 0;
  for (const p of g.passifsExtra) p.incrementPassif = Number(p.incrementPassif) || 0;
  g.dernierSouffleActif = !!g.dernierSouffleActif;
  return g;
}

// Plafond NIVEAU_MAX_PAR_RARETE : appliqué par appliquerAmelioration (formule-combat.js). Le niveau
// reçu est inventory.niveau (= nombre d'exemplaires - 1), jamais « -1 » à nouveau ici.
const niveauEffectif = (g: any, niveau: number) => Math.max(0, Math.min(Math.trunc(niveau || 0), niveauMaxPourRarete(g?.rarete)));

const SLOTS = ["arme", "offhand", "armure", "strategeme"] as const;

// Construit un combattant : objets nivelés, stats effectives (GetEffectiveStats), PowerLevel.
export function construireCombattant(j: JoueurEntree) {
  const brut: Record<string, any> = {}, nivele: Record<string, any> = {}, niveaux: Record<string, number> = {};
  for (const slot of SLOTS) {
    const e = j.equipement?.[slot];
    const g = e ? normaliserObjet(e.data) : null;
    brut[slot] = g;
    niveaux[slot] = g ? niveauEffectif(g, e!.niveau) : 0;
    nivele[slot] = g ? appliquerAmelioration(g, niveaux[slot]) : null;
  }
  const st = j.stacks || ({} as any);
  const stacks = { atk: +st.atk || 0, def: +st.def || 0, pv: +st.pv || 0, spd: +st.spd || 0, luck: +st.luck || 0 };
  // GetEffectiveStats (C#) applique les stats des 4 emplacements ; formule-combat.js n'en lit que 3
  // (arme/offhand/torse). Aucun stratagème du catalogue n'a de stat : on s'aligne sur la formule.
  const stats = calculerStatsEffectives(stacks, { arme: nivele.arme, offhand: nivele.offhand, torso: nivele.armure });
  const critPct = BASE_CRIT + LUCK_CRIT_MAX * Math.tanh(stats.luckLineaire / K_LUCK);
  const esquive = BASE_ESQUIVE + stats.esquiveGear;
  const power = calculerPowerLevelSimule(stats, estimerAtkEquivalentAvecStance(stats, nivele.arme), critPct, esquive,
    nivele.arme, nivele.offhand, nivele.armure, nivele.strategeme).powerLevel;
  return { joueur: j, stacks, brut, nivele, niveaux, stats, critPct, esquive, powerBrut: power, power: Math.round(power * 10) / 10 };
}
type Combattant = ReturnType<typeof construireCombattant>;

// ---------------------------------------------------------------- état de combat
interface BrulureLayer { Degats: number; Duree: number }
const BrulureLayer = (Degats: number, Duree: number): BrulureLayer => ({ Degats, Duree });

function creerEtat(cb: Combattant, cote: "attaquant" | "defenseur") {
  const { arme, offhand, armure: torso, strategeme } = cb.nivele;
  const stats = { ...cb.stats }; // copie mutable (bascules de stance)
  return {
    cote, nom: cb.joueur.login, cb, stats, arme, offhand, torso, strategeme,
    esquive: cb.esquive, luck: stats.luckLineaire,
    pv: stats.pv, pvMax: stats.pv, ap: 0, actionsPropres: 0,
    usagesRestants: strategeme?.usagesParCombat ?? 0, prochainUsageAction: 0,
    missileTourCible: -1, missileEnVol: null as any, // v1.1 : impact compté en tours du combat, pas en tours du porteur
    tourOuvert: false, soinContinuRestant: 0, soinContinuMontant: 0, soinContinuObjet: null as any,
    usagesSoinRestants: (offhand?.soinDirect ?? 0) > 0 ? offhand.usagesParCombat : 0, prochainSoinAction: 0,
    usagesOffhandActifRestants: 0, usagesOffhandActifMax: 0, prochainOffhandActifAction: 0,
    poisonStack: 0,
    shield: (arme?.shieldMontant ?? 0) + (offhand?.shieldMontant ?? 0) + (torso?.shieldMontant ?? 0),
    saignementStacks: 0, saignementBanque: 0, saignementSonsSource: null as string | null,
    antiHealPourcentage: 0, antiHealDuree: 0,
    bruleeLayers: [] as BrulureLayer[], bruleeDegats: 0, bruleeDuree: 0,
    stanceActuelle: 0, tourDansStance: 0, derniereStanceEnvoyee: -1,
    marqueDegats: 0, marqueDuree: 0,
    dernierSouffleDispo: !!(arme?.dernierSouffleActif || offhand?.dernierSouffleActif || torso?.dernierSouffleActif),
    dernierSouffleDeclenche: false,
    dernierSouffleFraction: Math.max(arme?.dernierSouffleFractionPv ?? 0, offhand?.dernierSouffleFractionPv ?? 0, torso?.dernierSouffleFractionPv ?? 0),
    frenesieBonusSpd: 0, frenesieDuree: 0,
    etourdiDuree: 0, paralysieDuree: 0, coupsPortesCompteur: 0, coupsRecusCompteur: 0, modeTirIndex: 0,
    esquiveBuff: 0, paradeBuff: 0, buffDefDuree: 0, briseDefPoints: 0, briseDefDuree: 0,
    ampSoins: (offhand?.amplificationSoinsPourcentage ?? 0) + (torso?.amplificationSoinsPourcentage ?? 0),
    degatsInfliges: 0, plusGrosCoup: 0,
  };
}
type Etat = ReturnType<typeof creerEtat>;

// RONDE 11 : objet offhand à usages limités qui n'est PAS un soin (Pétards, Sabimaru, Plumes, Canon).
const EstActionOffhand = (g: any) => !!g && g.usagesParCombat > 0 && g.soinDirect <= 0;
const mitigationDe = (def: number) => (DEF_MITIGATION_MAX * Math.tanh(def / K_DEF_MITIGATION)) / 100.0;
const i = Math.trunc; // (int) C# : troncature vers zéro
const pvAffiche = (pv: number) => (pv > 0 ? Math.max(1, i(pv)) : 0);

// Arrondi cumulatif (F11) : chaque balle reçoit round(cumul) - round(cumul précédent) — sans biais,
// et la somme des balles vaut toujours round(total).
function arrondirBalles(vals: number[], sansBiais: boolean): number[] {
  if (!sansBiais) return vals.map(i);
  let cumul = 0, prec = 0;
  return vals.map(v => { cumul += v; const r = Math.round(cumul); const d = r - prec; prec = r; return d; });
}

// ---------------------------------------------------------------- simulerDuel
export function simulerDuel(attaquantEntree: JoueurEntree, defenseurEntree: JoueurEntree, opts: OptionsDuel): ResultatDuel {
  const seed = (Number(opts?.seed) >>> 0);
  const F: Correctifs = { ...(opts?.compat_cs ? COMPAT_CS : CORRIGE), ...(opts?._correctifs || {}) };
  const rnd = creerRng(seed);
  const cbA = construireCombattant(attaquantEntree), cbD = construireCombattant(defenseurEntree);
  const A = creerEtat(cbA, "attaquant"), B = creerEtat(cbD, "defenseur");
  if (F.ronde11) for (const e of [A, B]) e.usagesOffhandActifRestants = e.usagesOffhandActifMax = EstActionOffhand(e.offhand) ? e.offhand.usagesParCombat : 0;
  const protectionActive = !!opts?.protection_active;
  const autre = (e: Etat) => (e === A ? B : A);
  const rounds: any[] = [];
  let numeroRound = 0, totalActions = 0, premierRoundFatigue = -1, nDeclenchementsFatigue = 0;
  let tourCourant = 1, dernierJoueur: Etat | null = null, serie = 0;

  // Accumulateur du round en cours : effets + explosions de saignement, vidé à chaque round émis.
  let acc = { effets: new Set<string>(), expl: { attaquant: null as any, defenseur: null as any } };
  const resetAcc = () => { acc = { effets: new Set<string>(), expl: { attaquant: null, defenseur: null } }; };

  function RecalcBrulee(e: Etat) {
    let total = 0, maxDuree = 0;
    for (const l of e.bruleeLayers) { total += l.Degats; if (l.Duree > maxDuree) maxDuree = l.Duree; }
    e.bruleeDegats = total; e.bruleeDuree = maxDuree;
  }
  function MontantRevive(e: Etat) { return e.dernierSouffleFraction > 0 ? Math.max(1, e.pvMax * e.dernierSouffleFraction) : 1; }
  function verifierDernierSouffle(e: Etat) {
    if (e.pv <= 0 && e.dernierSouffleDispo) { e.pv = MontantRevive(e); e.dernierSouffleDispo = false; e.dernierSouffleDeclenche = true; acc.effets.add("dernier_souffle"); }
  }
  const verifierLesDeux = () => { verifierDernierSouffle(A); verifierDernierSouffle(B); };
  function crediter(source: Etat | null, montant: number) { if (source && montant > 0) source.degatsInfliges += montant; }
  function AppliquerDegatsAvecShield(cible: Etat, degats: number, source: Etat | null) {
    const absorbe = Math.min(cible.shield, degats); cible.shield -= absorbe; cible.pv -= (degats - absorbe);
    crediter(source, degats);
    if (F.reviveUniverselle) verifierDernierSouffle(cible);
  }
  function DegatsBruts(cible: Etat, degats: number, source: Etat | null) { // ignore le bouclier (poison, saignement, sacrifice…)
    cible.pv -= degats; crediter(source, degats);
    if (F.reviveUniverselle) verifierDernierSouffle(cible);
  }
  function SonDernierSouffle(e: Etat) {
    for (const g of [e.torso, e.offhand, e.arme]) if (g?.dernierSouffleActif && g.sonsDernierSouffle) return g.sonsDernierSouffle;
    return "";
  }
  function AppliquerEtourdissement(cible: Etat, duree: number, avecTenacite: boolean): boolean {
    if (avecTenacite) {
      const tenacite = (cible.torso?.tenaciteChance ?? 0) + (cible.offhand?.tenaciteChance ?? 0);
      if (tenacite > 0 && rnd() * 100.0 < tenacite) { acc.effets.add("tenacite"); return false; }
    }
    cible.etourdiDuree = Math.max(cible.etourdiDuree, duree);
    acc.effets.add("etourdi_applique");
    return true;
  }

  // --- état commun à tous les rounds (clés legacy + ajouts du contrat) ---
  function etat(f: Etat | null) {
    const x = (e: Etat, k: string) => (e === A ? `${k}_attaquant` : `${k}_defenseur`);
    const o: Record<string, any> = {
      // C# : Math.Max(0,(int)pv) affichait 0 pour un combattant vivant à 0 < PV < 1 (F15).
      pv_attaquant_apres: pvAffiche(A.pv), pv_defenseur_apres: pvAffiche(B.pv),
      pv_max_attaquant_apres: i(A.pvMax), pv_max_defenseur_apres: i(B.pvMax),
    };
    for (const e of [A, B]) {
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
    // v1.1 : charges et recharges des deux combattants (stratagème et main gauche), pour que l'écran
    // n'ait rien à déduire. « recharge » = tours du porteur à attendre encore après ce round.
    for (const e of [A, B]) {
      const fait = e.actionsPropres + (e.tourOuvert ? 1 : 0);
      const attente = (prochain: number) => Math.max(0, prochain - fait);
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
  const base = (frappeur: string, cible: string) => ({
    round: numeroRound, frappeur, cible, touche: false, crit: false, bloque: false, degats: 0,
    etourdi: false, vol_de_vie: 0, poison_applique: false, degats_reflechis: 0,
    poison_tick: false, degats_poison: 0, fatigue_tick: false, degats_fatigue: 0,
    soin_applique: false, soin_montant: 0, soin_sons: "", soin_image: "", strategeme: false,
  });
  function ajouterRound(f: Etat | null, cible: string, champs: Record<string, any>, evenement: string, anim: string, derniereUtilisation = false) {
    numeroRound++;
    const r: Record<string, any> = { ...base(f ? f.nom : "", cible), ...champs, ...etat(f) };
    r.round = numeroRound; r.tour = tourCourant; // tour = numéro du tour de jeu (un impact différé partage celui du tour où il tombe)
    r.evenement = evenement; r.anim_arme = anim;
    r.strategeme_derniere_utilisation = derniereUtilisation;
    r.effets = [...acc.effets];
    rounds.push(r); resetAcc();
    if (f && (r.frappeur === f.nom) && r.degats > f.plusGrosCoup && r.cible !== f.nom) f.plusGrosCoup = r.degats;
    return r;
  }

  // Tout soin reçu : réduit par l'anti-soin, renforcé par les « soins renforcés » du porteur (Gourde).
  const FacteurSoin = (e: Etat) => (1.0 - Math.min(1.0, e.antiHealPourcentage / 100.0)) * (1.0 + e.ampSoins / 100.0);
  function DeclencherSoinActifLocal(p: Etat, objet: any) {
    // v1.1 : soinDureeTours > 1 = soin étalé. La 1re part tombe à l'utilisation, les suivantes au début
    // des tours suivants du porteur (sans lui coûter d'action).
    const duree = Math.max(1, i(objet.soinDureeTours));
    const part = objet.soinDirect / duree;
    const pvAvant = p.pv;
    p.pv = Math.min(p.pvMax, p.pv + part * FacteurSoin(p));
    const montant = i(p.pv - pvAvant);
    if (duree > 1) { p.soinContinuRestant = duree - 1; p.soinContinuMontant = part; p.soinContinuObjet = objet; }
    acc.effets.add("soin");
    ajouterRound(p, p.nom, {
      soin_applique: montant > 0, soin_montant: montant, soin_sons: objet.sons ?? "",
      soin_image: objet.image ?? "", // C# moteur-combat.cs envoyait "" (duel.cs local : ImageUrl)
      offhand_action: true, offhand_soin: true, offhand_image: objet.image ?? "", soin_tours: duree,
      offhand_cooldown_tours: objet.cooldownTours,
    }, "soin", "soin");
  }

  // REDESIGN SAIGNEMENT : point d'entrée unique (arme, ModeTir, Stratagème).
  function AppliquerSaignement(cible: Etat, magnitude: number, stacksParCoup: number, sonsExplosion: string | null, source: Etat) {
    if (magnitude <= 0) return;
    cible.saignementStacks += Math.max(1, stacksParCoup);
    cible.saignementBanque += magnitude;
    if (sonsExplosion) cible.saignementSonsSource = sonsExplosion;
    acc.effets.add("saignement");
    if (cible.saignementStacks >= SAIGNEMENT_SEUIL_EXPLOSION) {
      const degatsExplosion = i(cible.saignementBanque);
      const banque = cible.saignementBanque, sons = cible.saignementSonsSource;
      cible.saignementStacks = 0; cible.saignementBanque = 0;
      acc.expl[cible.cote] = { degats: degatsExplosion, sons };
      acc.effets.add("saignement_explosion");
      DegatsBruts(cible, banque, source); // dégâts bruts : ignore DEF ET bouclier
    }
  }

  function DeclencherUsageStrategemeLocal(p: Etat, strategeme: any, sonsOverride: string | null, derniereUtilisation: boolean) {
    const c = autre(p);
    if (strategeme.shieldMontant > 0) {
      p.shield += strategeme.shieldMontant;
      acc.effets.add("bouclier");
      ajouterRound(p, p.nom, {
        strategeme: true, strategeme_bouclier: true, montant_bouclier: i(strategeme.shieldMontant),
        strategeme_cooldown_tours: strategeme.cooldownTours, sons_override: sonsOverride,
      }, "bouclier", "bouclier", derniereUtilisation);
      return;
    }
    const defCible = F.stratBriseDefMarque ? Math.max(0, c.stats.def - c.briseDefPoints) : c.stats.def;
    const mitigation = mitigationDe(defCible * (1.0 - Math.min(1.0, strategeme.penetration / 100.0)));
    const marque = F.stratBriseDefMarque && c.marqueDegats > 0 ? 1.0 + c.marqueDegats / 100.0 : 1.0;
    const coupsParUsage = Math.max(1, strategeme.coupsParUsage);
    const bruts: number[] = [];
    for (let coup = 0; coup < coupsParUsage; coup++) {
      let d = 0;
      if (strategeme.degatsDirects > 0) {
        const variance = 0.9 + rnd() * 0.20;
        d = Math.max(0.1, strategeme.degatsDirects * (1.0 - mitigation)) * variance * marque;
      }
      bruts.push(d);
      if (strategeme.saignementChanceParCoup > 0 && strategeme.saignementDegats > 0 && rnd() * 100.0 < strategeme.saignementChanceParCoup)
        AppliquerSaignement(c, strategeme.saignementDegats, strategeme.saignementStacksParCoup, strategeme.sonsExplosionSaignement ?? null, p);
      if (strategeme.etourdissementChance > 0 && rnd() * 100.0 < strategeme.etourdissementChance)
        AppliquerEtourdissement(c, Math.max(1, strategeme.etourdissementDureeTours), F.tenaciteStrategeme);
    }
    const degatsParBalle = arrondirBalles(bruts, F.arrondiSansBiais && strategeme.degatsDirects > 0);
    const degatsTotal = degatsParBalle.reduce((s, x) => s + x, 0);
    AppliquerDegatsAvecShield(c, degatsTotal, p);

    let poisonApplique = false;
    if (strategeme.poisonDegats > 0) { poisonApplique = true; c.poisonStack += strategeme.poisonDegats; acc.effets.add("poison"); }
    if (strategeme.brulureDegats > 0 && strategeme.brulureDuree > 0) {
      const amp = F.ampFeuStrategeme ? 1.0 + (p.torso?.amplificationDegatsFeuPourcentage ?? 0) / 100.0 : 1.0;
      c.bruleeLayers.push(BrulureLayer(strategeme.brulureDegats * amp, strategeme.brulureDuree)); RecalcBrulee(c);
      acc.effets.add("brulure");
    }
    let paralysieAppliquee = false;
    if (strategeme.paralysieChance > 0 && rnd() * 100.0 < strategeme.paralysieChance) {
      paralysieAppliquee = true;
      c.paralysieDuree = Math.max(c.paralysieDuree, Math.max(1, strategeme.paralysieDuree));
      acc.effets.add("paralysie");
    }
    if (strategeme.briseDefPoints > 0) { c.briseDefPoints = strategeme.briseDefPoints; c.briseDefDuree = i(strategeme.briseDefDuree); acc.effets.add("brise_def"); }
    if (degatsTotal > 0 && marque > 1) acc.effets.add("marque");
    ajouterRound(p, c.nom, {
      touche: true, degats: degatsTotal, degats_par_balle: degatsParBalle, crit_par_balle: degatsParBalle.map(() => false),
      poison_applique: poisonApplique, strategeme: true, strategeme_cooldown_tours: strategeme.cooldownTours, sons_override: sonsOverride,
      etourdi_applique: acc.effets.has("etourdi_applique"),
      paralysie_applique: paralysieAppliquee,
      sons_paralysie: paralysieAppliquee ? strategeme.sonsParalysie ?? "" : null,
      message_paralysie: paralysieAppliquee ? strategeme.messageParalysie ?? "" : null,
    }, "strategeme", strategeme.anim || "explosion", derniereUtilisation);
  }

  // RONDE 11 : l'offhand « action à part entière » (miroir de DeclencherActionOffhandSimule).
  function DeclencherActionOffhandLocal(p: Etat, objet: any) {
    const c = autre(p);
    let cibleNom = c.nom;
    if (objet.poisonDegats > 0) { c.poisonStack += objet.poisonDegats; acc.effets.add("poison"); }
    if (objet.brulureDegats > 0 && objet.brulureDuree > 0) {
      const ampFeu = 1.0 + (p.torso?.amplificationDegatsFeuPourcentage ?? 0) / 100.0;
      c.bruleeLayers.push(BrulureLayer(objet.brulureDegats * ampFeu, objet.brulureDuree)); RecalcBrulee(c); acc.effets.add("brulure");
    }
    if (objet.antiHealPourcentage > 0 && objet.antiHealDuree > 0) { c.antiHealPourcentage = objet.antiHealPourcentage; c.antiHealDuree = objet.antiHealDuree; acc.effets.add("anti_heal"); }
    if (objet.briseDefPoints > 0) { c.briseDefPoints = objet.briseDefPoints; c.briseDefDuree = i(objet.briseDefDuree); acc.effets.add("brise_def"); }
    if (objet.marqueDegatsPourcentage > 0 && objet.marqueDuree > 0) { c.marqueDegats = objet.marqueDegatsPourcentage; c.marqueDuree = objet.marqueDuree; acc.effets.add("marque"); }
    if (objet.esquiveParadeBuffPourcentage > 0) {
      const paradeActuelle = (p.torso?.paradeChance ?? 0) + (p.offhand?.paradeChance ?? 0) + (vueArmeSelonStance(p.arme, p.stanceActuelle)?.paradeChance ?? 0);
      const dureeBuff = Math.max(1, objet.esquiveParadeBuffDuree);
      if (p.esquive >= paradeActuelle) p.esquiveBuff = objet.esquiveParadeBuffPourcentage; else p.paradeBuff = objet.esquiveParadeBuffPourcentage;
      p.buffDefDuree = dureeBuff; acc.effets.add("esquive_parade_buff");
      if (!(objet.poisonDegats > 0 || objet.brulureDegats > 0 || objet.antiHealPourcentage > 0 || objet.briseDefPoints > 0 || objet.marqueDegatsPourcentage > 0)) cibleNom = p.nom;
    }
    ajouterRound(p, cibleNom, {
      offhand_action: true, poison_applique: objet.poisonDegats > 0, sons_override: objet.sons ?? null,
      offhand_image: objet.image ?? "", offhand_cooldown_tours: objet.cooldownTours, offhand_sur_soi: cibleNom === p.nom,
    }, "offhand", "offhand");
  }

  // --- helpers durées (F5) ---
  function decrementerDurees(e: Etat) {
    if (e.antiHealDuree > 0) { e.antiHealDuree--; if (e.antiHealDuree <= 0) e.antiHealPourcentage = 0; }
    if (e.marqueDuree > 0) { e.marqueDuree--; if (e.marqueDuree <= 0) e.marqueDegats = 0; }
    if (e.frenesieDuree > 0) { e.frenesieDuree--; if (e.frenesieDuree <= 0) e.frenesieBonusSpd = 0; }
    if (e.buffDefDuree > 0) { e.buffDefDuree--; if (e.buffDefDuree <= 0) { e.esquiveBuff = 0; e.paradeBuff = 0; } }
    if (e.briseDefDuree > 0 && e.briseDefDuree < 999) { e.briseDefDuree--; if (e.briseDefDuree <= 0) e.briseDefPoints = 0; }
  }

  // ======================================================= boucle principale (ResoudreCombatInterne)
  while (A.pv > 0 && B.pv > 0 && totalActions < MAX_ACTIONS) {
    // Plancher de 1 AP/tick : garantit la terminaison même avec une vitesse ≤ 0 (F13).
    A.ap = Math.min(2 * AP_THRESHOLD, A.ap + Math.max(1, A.stats.spd + A.frenesieBonusSpd));
    B.ap = Math.min(2 * AP_THRESHOLD, B.ap + Math.max(1, B.stats.spd + B.frenesieBonusSpd));

    while ((A.ap >= AP_THRESHOLD || B.ap >= AP_THRESHOLD) && A.pv > 0 && B.pv > 0 && totalActions < MAX_ACTIONS) {
      // Les deux jauges pleines : la plus remplie d'abord, puis le plus rapide, puis l'attaquant.
      let aJoue = A.ap >= AP_THRESHOLD && (B.ap < AP_THRESHOLD || A.ap > B.ap || (A.ap === B.ap && A.stats.spd >= B.stats.spd));
      // v1.1 : après 2 tours d'affilée, la main passe d'office à l'autre (même s'il n'a pas rempli sa jauge).
      if (dernierJoueur === (aJoue ? A : B) && serie >= MAX_TOURS_DAFFILEE) aJoue = !aJoue;
      const f = aJoue ? A : B, c = aJoue ? B : A;
      serie = dernierJoueur === f ? serie + 1 : 1; dernierJoueur = f;
      tourCourant = totalActions + 1; f.tourOuvert = true; c.tourOuvert = false;
      const finTour = () => { f.ap = Math.max(0, f.ap - AP_THRESHOLD); f.actionsPropres++; totalActions++; f.tourOuvert = false; };
      A.dernierSouffleDeclenche = false; B.dernierSouffleDeclenche = false;
      resetAcc();
      const stunActif = f.etourdiDuree > 0;
      let actionConsommeeParAbilite = false;

      // Régénération (torse + offhand) en début de tour — bloquée par l'étourdissement.
      let soinApplique = false, soinMontant = 0, soinSons = "", soinImage = "";
      if (!stunActif) {
        const regen = (f.torso?.regeneration ?? 0) + (f.offhand?.regeneration ?? 0);
        if (regen > 0) {
          const pvAvant = f.pv;
          const montantBrut = f.pvMax * regen / 100.0 * FacteurSoin(f);
          f.pv = Math.min(f.pvMax, f.pv + montantBrut);
          soinMontant = i(f.pv - pvAvant); soinApplique = soinMontant > 0;
          const viaTorse = (f.torso?.regeneration ?? 0) > 0;
          soinSons = (viaTorse ? f.torso.sons : f.offhand?.sons) ?? "";
          soinImage = (viaTorse ? f.torso.image : f.offhand?.image) ?? "";
          if (soinApplique) acc.effets.add("regeneration");
        }
      }
      // Soin étalé (Gourde) : la part du tour tombe ici, étourdi ou non, sans coûter l'action.
      if (f.soinContinuRestant > 0) {
        const pvAvant = f.pv;
        f.pv = Math.min(f.pvMax, f.pv + f.soinContinuMontant * FacteurSoin(f));
        f.soinContinuRestant--;
        const gagne = i(f.pv - pvAvant);
        if (gagne > 0) { soinMontant += gagne; soinApplique = true; soinSons = soinSons || (f.soinContinuObjet?.sons ?? ""); soinImage = soinImage || (f.soinContinuObjet?.image ?? ""); acc.effets.add("soin_continu"); }
      }
      const effetsDebutTour = new Set(acc.effets); resetAcc();

      // Impact différé (Solo Silo, Éclair de Tomoe) : il tombe au début du Ne tour du COMBAT après le
      // lancement, quel que soit celui qui joue, et ne prend le tour de personne.
      for (const e of [f, c]) {
        if (e.missileEnVol && totalActions >= e.missileTourCible) {
          const m = e.missileEnVol; e.missileTourCible = -1; e.missileEnVol = null;
          DeclencherUsageStrategemeLocal(e, m, m?.sonsImpact ?? null, false);
          rounds[rounds.length - 1].impact_differe = true;
        }
      }
      if (A.pv <= 0 || B.pv <= 0) { totalActions++; f.tourOuvert = false; continue; }

      // Stratagème.
      if (!stunActif && f.strategeme && f.usagesRestants > 0 && f.actionsPropres >= f.prochainUsageAction) {
        if (F.ronde11) actionConsommeeParAbilite = true;
        const s = f.strategeme;
        f.usagesRestants--;
        const derniere = f.usagesRestants === 0;
        if (s.delaiTours > 0) {
          acc.effets.add("missile_lance");
          ajouterRound(f, c.nom, { strategeme: true, missile_lance: true, missile_delai: s.delaiTours, strategeme_cooldown_tours: s.cooldownTours, sons_override: s.sons ?? null }, "strategeme", s.anim || "explosion", derniere);
          f.missileTourCible = totalActions + s.delaiTours; f.missileEnVol = s;
        } else DeclencherUsageStrategemeLocal(f, s, null, derniere);
        f.prochainUsageAction = f.actionsPropres + 1 + s.cooldownTours;
      }

      // Soin actif (Stimulant, Gourde) puis action offhand (Ronde 11).
      if (!(F.ronde11 && actionConsommeeParAbilite) && !stunActif && f.offhand && f.offhand.soinDirect > 0 && f.usagesSoinRestants > 0
          && f.actionsPropres >= f.prochainSoinAction && f.soinContinuRestant <= 0
          && (f.pvMax - f.pv >= f.offhand.soinDirect * FacteurSoin(f) || f.pv <= f.pvMax * SEUIL_SOIN_URGENCE)) {
        DeclencherSoinActifLocal(f, f.offhand);
        f.usagesSoinRestants--; f.prochainSoinAction = f.actionsPropres + 1 + f.offhand.cooldownTours;
        if (F.ronde11) actionConsommeeParAbilite = true;
      } else if (F.ronde11 && !actionConsommeeParAbilite && !stunActif && EstActionOffhand(f.offhand) && f.usagesOffhandActifRestants > 0
          && f.actionsPropres >= f.prochainOffhandActifAction) {
        DeclencherActionOffhandLocal(f, f.offhand);
        f.usagesOffhandActifRestants--; f.prochainOffhandActifAction = f.actionsPropres + 1 + f.offhand.cooldownTours;
        actionConsommeeParAbilite = true;
      }

      if (A.pv <= 0 || B.pv <= 0) { finTour(); continue; }
      for (const e of effetsDebutTour) acc.effets.add(e);

      // Poison (dégressif, ignore le bouclier) — tique au tour du porteur.
      let poisonTick = false, degatsPoisonAppliques = 0;
      if (f.poisonStack > 0) {
        const resistance = (f.torso?.resistancePoison ?? 0) + (f.offhand?.resistancePoison ?? 0);
        const dp = f.poisonStack * (1.0 - Math.min(1.0, resistance / 100.0));
        degatsPoisonAppliques = i(dp); poisonTick = true; acc.effets.add("poison_tick");
        f.poisonStack = Math.max(0, f.poisonStack - 1);
        DegatsBruts(f, dp, c);
      }
      // Brûlure : couches cumulables, absorbée par le bouclier.
      let brulureTick = false, degatsBrulureAppliques = 0;
      if (f.bruleeLayers.length > 0) {
        const resistanceFeu = (f.torso?.resistanceFeu ?? 0) + (f.offhand?.resistanceFeu ?? 0);
        const total = f.bruleeLayers.reduce((s, l) => s + l.Degats, 0);
        const db = total * (1.0 - Math.min(1.0, resistanceFeu / 100.0));
        degatsBrulureAppliques = i(db); brulureTick = true; acc.effets.add("brulure_tick");
        for (const l of f.bruleeLayers) l.Duree--;
        f.bruleeLayers = f.bruleeLayers.filter(l => l.Duree > 0); RecalcBrulee(f);
        AppliquerDegatsAvecShield(f, db, c);
      }

      if (F.dureesParPorteur) decrementerDurees(f); else { decrementerDurees(A); decrementerDurees(B); }

      // Bascule de stance (arme à DureeStance).
      if (f.arme && f.arme.dureeStance > 0) {
        f.tourDansStance++;
        if (f.tourDansStance >= f.arme.dureeStance) {
          f.tourDansStance = 0;
          appliquerBonusArmeStance(f.stats, f.arme, f.stanceActuelle, -1.0);
          f.stanceActuelle = 1 - f.stanceActuelle;
          appliquerBonusArmeStance(f.stats, f.arme, f.stanceActuelle, 1.0);
          // Passif voulu de la Volto-Hache (confirmé le 02/10) : le retour en première forme purge poison et brûlure.
          if (f.stanceActuelle === 0) { if (f.poisonStack > 0 || f.bruleeLayers.length) acc.effets.add("purge"); f.poisonStack = 0; f.bruleeLayers = []; RecalcBrulee(f); }
        }
      }

      // Corde / fatigue : frappe les deux, non mitigée.
      let fatigueTick = false, degatsFatigueAppliques = 0;
      if (totalActions >= ROPE_START_ACTION && (totalActions - ROPE_START_ACTION) % ROPE_CADENCE === 0) {
        if (premierRoundFatigue === -1) premierRoundFatigue = F.ronde11 && actionConsommeeParAbilite ? numeroRound : numeroRound + 1; // rattachée au round de la capacité
        nDeclenchementsFatigue++;
        degatsFatigueAppliques = i(FATIGUE_BASE * Math.pow(FATIGUE_CROISSANCE, nDeclenchementsFatigue - 1));
        fatigueTick = true; acc.effets.add("fatigue");
        A.pv -= degatsFatigueAppliques; B.pv -= degatsFatigueAppliques;
      }
      verifierLesDeux();

      // v1.1 : un tour = un round. Quand une capacité a pris le tour, ses effets de début de tour
      // (poison, brûlure, fatigue, régénération) sont rattachés au round de la capacité.
      const rattacher = () => {
        const rr = rounds[rounds.length - 1];
        const garde: Record<string, any> = {};
        for (const k of Object.keys(rr)) if (/^(saignement_explosion|degats_explosion_saignement|sons_explosion_saignement|dernier_souffle|sons_dernier_souffle)_/.test(k) && rr[k]) garde[k] = rr[k];
        const { soin_applique: _s, soin_montant: _m, soin_sons: _so, soin_image: _i, ...autres } = ticks;
        Object.assign(rr, autres, etat(f), garde, { regen_montant: soinMontant, regen_sons: soinSons, regen_image: soinImage });
        rr.effets = [...new Set([...rr.effets, ...acc.effets])]; resetAcc();
      };
      const ticks = {
        regen_montant: soinMontant,
        poison_tick: poisonTick, degats_poison: degatsPoisonAppliques, poison_tick_attaquant: aJoue,
        fatigue_tick: fatigueTick, degats_fatigue: degatsFatigueAppliques,
        soin_applique: soinApplique, soin_montant: soinMontant, soin_sons: soinSons, soin_image: soinImage,
        brulure_tick: brulureTick, degats_brulure: degatsBrulureAppliques, brulure_tick_attaquant: aJoue,
      };
      const evenementTick = fatigueTick ? "fatigue" : poisonTick ? "poison" : brulureTick ? "brulure" : "soin";

      if (A.pv <= 0 || B.pv <= 0) {
        if (F.ronde11 && actionConsommeeParAbilite) rattacher();
        else ajouterRound(null, "", { ...ticks, strategeme: false, tour_de: f.nom }, evenementTick, "");
        finTour();
        continue;
      }

      // Étourdissement / paralysie : durée consommée ici, une seule fois par tour.
      if (stunActif) f.etourdiDuree--;
      const paralysieActif = f.paralysieDuree > 0;
      if (paralysieActif) f.paralysieDuree--;

      // RONDE 11 : la capacité a remplacé l'attaque. Les ticks de ce tour sont publiés dans un round
      // « environnemental » (sinon l'overlay ne les verrait jamais).
      if (F.ronde11 && actionConsommeeParAbilite) {
        finTour();
        rattacher();
        continue;
      }

      if (stunActif || paralysieActif) {
        const src = c.strategeme;
        ajouterRound(f, c.nom, {
          ...ticks, etourdi: stunActif, paralysie: paralysieActif,
          sons_paralysie: paralysieActif ? src?.sonsParalysie ?? "" : null,
          message_paralysie: paralysieActif ? src?.messageParalysie ?? "" : null,
        }, stunActif ? "etourdi" : "paralysie", "");
        finTour();
        continue;
      }

      // ----------------------------------------------------------- attaque à l'arme
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
      let degatsParBalle: number[] = [], critParBalle: boolean[] = [];
      let riposteStunSurFrappeur = false, paradeReussie = false, degatsRipostee = 0;
      let sacrificePv = 0, rechargeStrat = false, rechargeOffhand = false, contrecoup = 0, erosionPvMax = 0;
      let sonsParadeDeclenchee = "", sonsRiposteImpact = "";
      let modeActif: any = null;

      if (touche) {
        const paradeTorse = torsoCible?.paradeChance ?? 0, paradeOffhand = offhandCible?.paradeChance ?? 0, paradeArme = armeCible?.paradeChance ?? 0;
        const paradeCible = paradeTorse + paradeOffhand + paradeArme + c.paradeBuff;
        if (paradeCible > 0 && rnd() * 100.0 < paradeCible) {
          paradeReussie = true; touche = false; acc.effets.add("parade"); acc.effets.add("riposte");
          const resp = paradeTorse > 0 ? torsoCible : (paradeArme > 0 ? armeCible : offhandCible);
          sonsParadeDeclenchee = resp?.sonsParade ?? ""; sonsRiposteImpact = resp?.sonsRiposte ?? "";
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
        executionActive = !!armeFrappeur && armeFrappeur.executionSeuil > 0 && (pvCibleActuel / pvMaxCible * 100.0) <= armeFrappeur.executionSeuil;
        const cibleEstDefenseurProtege = !aJoue && protectionActive;

        if (armeFrappeur && armeFrappeur.modesTir.length > 0) { // Arc de Genichiro
          const idx = f.modeTirIndex % armeFrappeur.modesTir.length;
          modeActif = armeFrappeur.modesTir[idx];
          nbCoupsArme = Math.max(1, modeActif.coupsParUsage);
          mitigation = mitigationDe(defCible2 * (1.0 - Math.min(1.0, modeActif.penetration / 100.0)));
          f.modeTirIndex = (f.modeTirIndex + 1) % armeFrappeur.modesTir.length;
          acc.effets.add("mode_tir_" + idx);
        }

        const bruts: number[] = [];
        for (let coupN = 0; coupN < nbCoupsArme; coupN++) {
          const critCoup = rnd() * 100.0 < Math.min(100, critChance);
          if (critCoup) crit = true;
          const varianceCoup = 0.85 + rnd() * 0.30;
          const { valeur: degatsBaseParBalle, nouveauSysteme } = CalculerDegatsBaseArme(armeFrappeur, statsFrappeur, nbCoupsArme);
          let degatsBrutsCoup = nouveauSysteme
            ? Math.max(0.1, degatsBaseParBalle * (1.0 - mitigation)) * (critCoup ? 2.0 : 1.0)
            : Math.max(0.1, degatsBaseParBalle * (1.0 - mitigation)) * varianceCoup * (critCoup ? 2.0 : 1.0);
          if (critCoup && armeFrappeur && armeFrappeur.frenesieBonusSpd > 0 && armeFrappeur.frenesieDuree > 0) {
            f.frenesieBonusSpd = armeFrappeur.frenesieBonusSpd; f.frenesieDuree = armeFrappeur.frenesieDuree; acc.effets.add("frenesie");
          }
          if (armeFrappeur && armeFrappeur.rageBonusMax > 0 && armeFrappeur.rageSeuilMin < 100) {
            const pvManquant = 100.0 - (f.pv / f.pvMax) * 100.0;
            rageBonus = Math.min(armeFrappeur.rageBonusMax, Math.max(0, (pvManquant / (100.0 - armeFrappeur.rageSeuilMin)) * armeFrappeur.rageBonusMax));
            degatsBrutsCoup *= (1.0 + rageBonus / 100.0);
            if (rageBonus > 0) acc.effets.add("rage");
          }
          if (c.marqueDegats > 0) { degatsBrutsCoup *= (1.0 + c.marqueDegats / 100.0); acc.effets.add("marque"); }
          if (executionActive) { degatsBrutsCoup *= (1.0 + armeFrappeur.executionBonus / 100.0); acc.effets.add("execution"); }
          if (cibleEstDefenseurProtege) degatsBrutsCoup *= (1.0 - PROTECTION_REDUCTION);
          if (offhandCible && offhandCible.reductionDegatsTir > 0 && armeFrappeur && armeFrappeur.anim === "tir")
            degatsBrutsCoup *= (1.0 - Math.min(1.0, offhandCible.reductionDegatsTir / 100.0));
          if (offhandCible && offhandCible.blocage > 0 && rnd() * 100.0 < offhandCible.blocage) {
            bloque = true; acc.effets.add("bloque");
            degatsBrutsCoup *= (1.0 - Math.min(1.0, offhandCible.blocageReduction / 100.0));
          }
          if (modeActif) degatsBrutsCoup *= modeActif.multiplicateurDegats;
          bruts.push(degatsBrutsCoup); critParBalle.push(critCoup);
        }
        degatsParBalle = arrondirBalles(bruts, F.arrondiSansBiais);
        degats = degatsParBalle.reduce((s, x) => s + x, 0);
        if (crit) acc.effets.add("crit");
        AppliquerDegatsAvecShield(c, degats, f);
        verifierLesDeux();

        if (armeFrappeur && armeFrappeur.lifesteal > 0 && degats > 0) {
          const antiHeal = F.antiHealVolDeVie ? (1.0 - Math.min(1.0, f.antiHealPourcentage / 100.0)) : 1.0;
          volDeVie = i(degats * armeFrappeur.lifesteal / 100.0 * antiHeal * (1.0 + f.ampSoins / 100.0)); // v1.1 : soins renforcés (Gourde)
          f.pv = Math.min(f.pvMax, f.pv + volDeVie);
          if (volDeVie > 0) acc.effets.add("vol_de_vie");
        }
        if (degats > 0) {
          const reflectionTorse = torsoCible?.reflection ?? 0, reflectionOffhand = offhandCible?.reflection ?? 0;
          if (reflectionTorse + reflectionOffhand > 0) {
            degatsReflechis = i(degats * (reflectionTorse + reflectionOffhand) / 100.0);
            AppliquerDegatsAvecShield(f, degatsReflechis, c);
            imageReflection = reflectionTorse > 0 ? (torsoCible?.image ?? "") : (offhandCible?.image ?? "");
            if (degatsReflechis > 0) acc.effets.add("renvoi");
          }
        }
        if (armeFrappeur && armeFrappeur.poisonDegats > 0) { poisonApplique2 = true; c.poisonStack += armeFrappeur.poisonDegats; acc.effets.add("poison"); }
        if (armeFrappeur && armeFrappeur.saignementDegats > 0)
          AppliquerSaignement(c, armeFrappeur.saignementDegats, armeFrappeur.saignementStacksParCoup, armeFrappeur.sonsExplosionSaignement ?? null, f);
        if (armeFrappeur && armeFrappeur.antiHealPourcentage > 0 && armeFrappeur.antiHealDuree > 0) {
          c.antiHealPourcentage = armeFrappeur.antiHealPourcentage; c.antiHealDuree = armeFrappeur.antiHealDuree; acc.effets.add("anti_heal");
        }
        if (armeFrappeur && armeFrappeur.marqueDegatsPourcentage > 0 && armeFrappeur.marqueDuree > 0) {
          c.marqueDegats = armeFrappeur.marqueDegatsPourcentage; c.marqueDuree = armeFrappeur.marqueDuree; acc.effets.add("marque");
        }
        if (armeFrappeur && armeFrappeur.etourdissementChance > 0 && rnd() * 100.0 < armeFrappeur.etourdissementChance)
          AppliquerEtourdissement(c, Math.max(1, armeFrappeur.etourdissementDureeTours), true);

        // --- PANOPLIE SEKIRO : effets sur coup porté ---
        if (degats > 0 && armeFrappeur && armeFrappeur.rechargeTousLesCoups > 0) { // Tantô de Cérémonie
          f.coupsPortesCompteur++;
          if (f.coupsPortesCompteur >= armeFrappeur.rechargeTousLesCoups) {
            f.coupsPortesCompteur = 0;
            // v1.1 : le sacrifice rend 1 charge à CHAQUE objet à charges entamé (stratagème et main gauche,
            // soin ou action). Rien à recharger : pas de sacrifice.
            const rStrat = !!f.strategeme && f.usagesRestants < f.strategeme.usagesParCombat;
            const rSoin = !!f.offhand && f.offhand.soinDirect > 0 && f.usagesSoinRestants < f.offhand.usagesParCombat;
            const rActif = f.usagesOffhandActifRestants < f.usagesOffhandActifMax;
            if (rStrat || rSoin || rActif) {
              sacrificePv = i(f.pv * (armeFrappeur.rechargeSacrificePourcentage / 100.0));
              DegatsBruts(f, f.pv * (armeFrappeur.rechargeSacrificePourcentage / 100.0), null);
              if (rStrat) f.usagesRestants++;
              if (rSoin) f.usagesSoinRestants++;
              if (rActif) f.usagesOffhandActifRestants++;
              rechargeStrat = rStrat; rechargeOffhand = rSoin || rActif;
              acc.effets.add("recharge");
            }
            verifierLesDeux();
          }
        }
        if (degats > 0 && armeFrappeur && armeFrappeur.reductionPvMaxPourcentage > 0) { // Lame de la mort
          const pvMaxAvant = c.pvMax;
          c.pvMax *= (1.0 - Math.min(0.9, armeFrappeur.reductionPvMaxPourcentage / 100.0));
          if (F.clampPvMaxErosion) c.pv = Math.min(c.pv, c.pvMax);
          erosionPvMax = i(pvMaxAvant) - i(c.pvMax);
          acc.effets.add("erosion_pv_max");
          if (armeFrappeur.autoDegatsPourcentageDesDegats > 0) {
            // v1.1 (décision du 02/10) : le contrecoup coûte X % des PV ACTUELS du porteur à chaque coup porté
            // (il ne peut donc pas le tuer), et non plus X % des dégâts infligés.
            const perte = f.pv * (armeFrappeur.autoDegatsPourcentageDesDegats / 100.0);
            contrecoup = Math.max(1, i(perte));
            DegatsBruts(f, Math.min(perte, Math.max(0, f.pv - 1)), null);
            acc.effets.add("auto_degats");
            verifierLesDeux();
          }
        }
        const offhandAuContact = offhandFrappeur && !(F.ronde11 && EstActionOffhand(offhandFrappeur));
        if (degats > 0 && offhandAuContact && offhandFrappeur.poisonDegats > 0) { poisonApplique2 = true; c.poisonStack += offhandFrappeur.poisonDegats; acc.effets.add("poison"); }
        if (degats > 0 && offhandAuContact && offhandFrappeur.brulureDegats > 0 && offhandFrappeur.brulureDuree > 0) {
          const ampFeu = 1.0 + (f.torso?.amplificationDegatsFeuPourcentage ?? 0) / 100.0;
          c.bruleeLayers.push(BrulureLayer(offhandFrappeur.brulureDegats * ampFeu, offhandFrappeur.brulureDuree)); RecalcBrulee(c); acc.effets.add("brulure");
        }
        if (degats > 0 && offhandAuContact && offhandFrappeur.antiHealPourcentage > 0 && offhandFrappeur.antiHealDuree > 0) {
          c.antiHealPourcentage = offhandFrappeur.antiHealPourcentage; c.antiHealDuree = offhandFrappeur.antiHealDuree; acc.effets.add("anti_heal");
        }
        if (degats > 0 && offhandAuContact && offhandFrappeur.briseDefPoints > 0) {
          c.briseDefPoints = offhandFrappeur.briseDefPoints; c.briseDefDuree = i(offhandFrappeur.briseDefDuree); acc.effets.add("brise_def");
        }
        if (degats > 0 && offhandAuContact && offhandFrappeur.marqueDegatsPourcentage > 0 && offhandFrappeur.marqueDuree > 0) {
          c.marqueDegats = offhandFrappeur.marqueDegatsPourcentage; c.marqueDuree = offhandFrappeur.marqueDuree; acc.effets.add("marque");
        }
        if (modeActif && modeActif.saignementDegats > 0 && degats > 0)
          AppliquerSaignement(c, modeActif.saignementDegats, modeActif.saignementStacksParCoup, armeFrappeur?.sonsExplosionSaignement ?? null, f);
        if (modeActif && modeActif.etourdissementChance > 0 && rnd() * 100.0 < modeActif.etourdissementChance)
          AppliquerEtourdissement(c, 1, true);
        if (degats > 0 && torsoCible && torsoCible.riposteEtourdissementTousLesCoups > 0) { // Armure de Robert
          c.coupsRecusCompteur++;
          if (c.coupsRecusCompteur >= torsoCible.riposteEtourdissementTousLesCoups) {
            c.coupsRecusCompteur = 0; f.etourdiDuree = Math.max(f.etourdiDuree, 1);
            riposteStunSurFrappeur = true; acc.effets.add("riposte_stun");
          }
        }
        if (degats > 0 && torsoCible && torsoCible.bruleeReflectionDegats > 0) { // Restes du démon de la haine
          const ampFeuReflect = 1.0 + torsoCible.amplificationDegatsFeuPourcentage / 100.0;
          f.bruleeLayers.push(BrulureLayer(torsoCible.bruleeReflectionDegats * ampFeuReflect, torsoCible.bruleeReflectionDuree)); RecalcBrulee(f);
          acc.effets.add("chair_ardente");
        }
        if (degats > 0 && offhandCible && offhandCible.esquiveParadeBuffPourcentage > 0 && !(F.ronde11 && EstActionOffhand(offhandCible))) {
          const paradeActuelleCible = (torsoCible?.paradeChance ?? 0) + (offhandCible.paradeChance ?? 0) + (armeCible?.paradeChance ?? 0);
          const dureeBuff = Math.max(1, offhandCible.esquiveParadeBuffDuree);
          if (c.esquive >= paradeActuelleCible) c.esquiveBuff = offhandCible.esquiveParadeBuffPourcentage; else c.paradeBuff = offhandCible.esquiveParadeBuffPourcentage;
          c.buffDefDuree = dureeBuff; acc.effets.add("esquive_parade_buff");
        }
      }

      finTour();
      const stanceVientDeChanger = f.derniereStanceEnvoyee !== f.stanceActuelle;
      f.derniereStanceEnvoyee = f.stanceActuelle;
      if (stanceVientDeChanger && f.arme?.dureeStance > 0 && f.actionsPropres > 1) acc.effets.add("stance");
      const sonsOverrideCoup = modeActif && modeActif.sons ? modeActif.sons : (armeFrappeur && stanceVientDeChanger ? armeFrappeur.sons ?? null : null);

      ajouterRound(f, c.nom, {
        ...ticks, touche, crit, bloque, degats, degats_par_balle: degatsParBalle, crit_par_balle: critParBalle,
        sons_override: sonsOverrideCoup,
        arme_image_override: armeFrappeur && stanceVientDeChanger ? armeFrappeur.image ?? null : null,
        etourdi: false, etourdi_applique: acc.effets.has("etourdi_applique"), riposte_stun_frappeur: riposteStunSurFrappeur,
        vol_de_vie: volDeVie, poison_applique: poisonApplique2, degats_reflechis: degatsReflechis, reflection_image: imageReflection,
        execution_active: executionActive, execution_bonus: armeFrappeur ? armeFrappeur.executionBonus : 0,
        rage_bonus: i(rageBonus), parade_reussie: paradeReussie, degats_ripostee: degatsRipostee,
        sons_parade: sonsParadeDeclenchee, sons_riposte: sonsRiposteImpact,
        sacrifice_pv: sacrificePv, recharge_strategeme: rechargeStrat, recharge_offhand: rechargeOffhand,
        contrecoup, erosion_pv_max: erosionPvMax,
      }, "attaque", armeFrappeur?.anim || "smash");
    }
  }

  // Vue d'arme selon la stance : copie COMPLÈTE de l'arme + champs stance 2 (F9 : image/sons de stance 2).
  function vueArme(e: Etat) {
    const v = vueArmeSelonStance(e.arme, e.stanceActuelle);
    if (v && v !== e.arme) { v.image = e.arme.stance2ImageUrl || e.arme.image; v.sons = e.arme.stance2Sons || e.arme.sons; }
    return v;
  }

  // CalculerDegatsBaseArme (C#), + plancher mains nues (F10).
  function CalculerDegatsBaseArme(arme: any, s: any, diviseurCoups: number) {
    if (!arme || !arme.scaling1Stat) return { valeur: s.atk / diviseurCoups, nouveauSysteme: false };
    const tirage = arme.baseDegatsMin / diviseurCoups + rnd() * ((arme.baseDegatsMax - arme.baseDegatsMin) / diviseurCoups);
    let scaling = 0, atkDejaCompte = false;
    const appliquer = (nomStat: string, lettre: string) => {
      if (!nomStat) return;
      const coef = COEF_LETTRE_SCALING[lettre] ?? 0;
      const valeur = valeurStat(s, nomStat);
      if (nomStat === "atk") { scaling += valeur * coef; atkDejaCompte = true; } else scaling += valeur * coef * PENALITE_HORS_ATK;
    };
    appliquer(arme.scaling1Stat, arme.scaling1Lettre);
    appliquer(arme.scaling2Stat, arme.scaling2Lettre);
    for (const sl of arme.scalingExtra || []) appliquer(sl.stat, sl.lettre);
    if (!atkDejaCompte) scaling += s.atk * COEF_ATK_BASE;
    let total = tirage + scaling / diviseurCoups;
    if (F.plancherMainsNues) {
      const moyenne = (arme.baseDegatsMin + arme.baseDegatsMax) / 2.0 + scaling;
      if (moyenne < s.atk) total += (s.atk - moyenne) / diviseurCoups;
    }
    return { valeur: total, nouveauSysteme: true };
  }

  // ------------------------------------------------------------- issue (règle d'égalité C#)
  const estEgalite = A.pv <= 0 && B.pv <= 0;
  let vainqueur: "attaquant" | "defenseur" | null;
  if (estEgalite) vainqueur = null;
  else if (A.pv <= 0) vainqueur = "defenseur";
  else if (B.pv <= 0) vainqueur = "attaquant";
  else vainqueur = (A.pv / A.pvMax) >= (B.pv / B.pvMax) ? "attaquant" : "defenseur";

  const replay = construireReplay(cbA, cbD, A, B, rounds, vainqueur, premierRoundFatigue, seed, opts, protectionActive);
  return {
    vainqueur, replay,
    stats: {
      rounds: numeroRound,
      degats_attaquant: i(A.degatsInfliges), degats_defenseur: i(B.degatsInfliges),
      plus_gros_coup_attaquant: A.plusGrosCoup, plus_gros_coup_defenseur: B.plusGrosCoup,
      power_attaquant: cbA.power, power_defenseur: cbD.power,
    },
  };
}

// ---------------------------------------------------------------- replay (format legacy duel.cs + ajouts)
function construireReplay(cbA: Combattant, cbD: Combattant, A: Etat, B: Etat, rounds: any[], vainqueur: string | null,
  premierRoundFatigue: number, seed: number, opts: OptionsDuel, protectionActive: boolean) {
  const ecartRelatif = (cbD.powerBrut - cbA.powerBrut) / Math.max(1.0, cbA.powerBrut);
  const tranche = ecartRelatif > TRANCHE_LARGEUR_RELATIF ? "au_dessus" : (ecartRelatif < -TRANCHE_LARGEUR_RELATIF ? "en_dessous" : "dans_tranche");
  const statuts: Record<string, [string, string]> = { dans_tranche: ["Combat équitable", "Combat équitable"], au_dessus: ["Outsider", "Favori"], en_dessous: ["Favori", "Outsider"] };
  const ia = cbA.joueur.infos || {}, id = cbD.joueur.infos || {};
  const r: Record<string, any> = {
    attaquant: cbA.joueur.login, defenseur: cbD.joueur.login,
    avatar_attaquant: cbA.joueur.avatar_url ?? null, avatar_defenseur: cbD.joueur.avatar_url ?? null,
    pv_max_attaquant: Math.trunc(cbA.stats.pv), pv_max_defenseur: Math.trunc(cbD.stats.pv),
    rounds,
    vainqueur: vainqueur === "attaquant" ? cbA.joueur.login : vainqueur === "defenseur" ? cbD.joueur.login : "",
    egalite: vainqueur === null, tranche, protection_active: protectionActive, round_debut_fatigue: premierRoundFatigue,
    statut_attaquant: statuts[tranche][0], statut_defenseur: statuts[tranche][1],
    victoires_attaquant: ia.victoires ?? 0, defaites_attaquant: ia.defaites ?? 0, egalites_attaquant: ia.egalites ?? 0,
    victoires_defenseur: id.victoires ?? 0, defaites_defenseur: id.defaites ?? 0, egalites_defenseur: id.egalites ?? 0,
    // Récompenses : décidées par le backend (RPC), jamais par le moteur.
    points_attaquant: 0, lootbox_attaquant: 0, points_defenseur: 0, lootbox_defenseur: 0, medailles_attaquant: 0, medailles_defenseur: 0,
  };
  for (const [cote, e] of [["attaquant", A], ["defenseur", B]] as const) {
    r[`${cote}_precision`] = e.arme?.precision ?? 0;
    r[`${cote}_reflection`] = (e.offhand?.reflection ?? 0) + (e.torso?.reflection ?? 0);
    r[`${cote}_resistance_crit`] = e.torso?.resistanceCrit ?? 0;
    r[`${cote}_regeneration`] = (e.torso?.regeneration ?? 0) + (e.offhand?.regeneration ?? 0);
    r[`${cote}_tenacite`] = (e.torso?.tenaciteChance ?? 0) + (e.offhand?.tenaciteChance ?? 0);
    r[`${cote}_shield_max`] = Math.trunc((e.arme?.shieldMontant ?? 0) + (e.offhand?.shieldMontant ?? 0) + (e.torso?.shieldMontant ?? 0));
  }
  for (const [cote, cb] of [["attaquant", cbA], ["defenseur", cbD]] as const) {
    const { arme, offhand, armure, strategeme } = cb.brut, niv = cb.nivele;
    r[`arme_${cote}_icon`] = arme?.icone ?? ""; r[`arme_${cote}_anim`] = arme?.anim ?? ""; r[`arme_${cote}_image`] = arme?.image ?? "";
    r[`arme_${cote}_sons`] = arme?.sons ?? ""; r[`arme_${cote}_deuxmains`] = arme?.hand === "two_handed";
    r[`arme_${cote}_coups`] = niv.arme?.coupsParUsage > 0 ? niv.arme.coupsParUsage : 1;
    r[`offhand_${cote}_icon`] = offhand?.icone ?? ""; r[`offhand_${cote}_image`] = offhand?.image ?? "";
    r[`torso_${cote}_icon`] = armure?.icone ?? ""; r[`torso_${cote}_couleur`] = armure?.borderColor ?? ""; r[`torso_${cote}_image`] = armure?.image ?? "";
    r[`strategeme_${cote}_icon`] = strategeme?.icone ?? ""; r[`strategeme_${cote}_image`] = strategeme?.image ?? "";
    r[`strategeme_${cote}_anim`] = strategeme?.anim ?? null; r[`strategeme_${cote}_sons`] = strategeme?.sons ?? "";
    r[`strategeme_${cote}_coups`] = niv.strategeme?.coupsParUsage > 0 ? niv.strategeme.coupsParUsage : 1;
  }
  r.id = opts?.id ?? null; r.date = opts?.date ?? null;
  r.type = opts?.mode === "entrainement" ? "entrainement" : "duel";
  r.power_attaquant = cbA.power; r.power_defenseur = cbD.power;
  r.degats_infliges_attaquant = Math.trunc(A.degatsInfliges); r.degats_infliges_defenseur = Math.trunc(B.degatsInfliges);
  r.plus_gros_coup_attaquant = A.plusGrosCoup; r.plus_gros_coup_defenseur = B.plusGrosCoup;
  const build = (cb: Combattant) => {
    const o: Record<string, any> = {};
    for (const [cle, slot] of [["arme", "arme"], ["offhand", "offhand"], ["torso", "armure"], ["strategeme", "strategeme"]] as const) {
      const g = cb.brut[slot], e = cb.joueur.equipement?.[slot];
      o[cle] = { nom: g?.nom ?? "", niveau: cb.niveaux[slot], niveau_possede: e?.niveau ?? 0, numero: g ? (e?.numero ?? g.numero ?? null) : null, rarete: g?.rarete ?? null, image: g?.image ?? null };
    }
    return o;
  };
  r.build_attaquant = build(cbA); r.build_defenseur = build(cbD);
  // --- ajouts du contrat ---
  r.version_moteur = VERSION_MOTEUR; r.seed = seed; r.mode = opts?.mode ?? "classe";
  r.compat_cs = !!opts?.compat_cs;
  r.strategeme_usages_max_attaquant = cbA.nivele.strategeme?.usagesParCombat ?? 0;
  r.strategeme_usages_max_defenseur = cbD.nivele.strategeme?.usagesParCombat ?? 0;
  r.offhand_usages_max_attaquant = cbA.nivele.offhand?.usagesParCombat ?? 0;
  r.offhand_usages_max_defenseur = cbD.nivele.offhand?.usagesParCombat ?? 0;
  r.armure_pv_max_attaquant = Math.trunc(cbA.stats.pv); r.armure_pv_max_defenseur = Math.trunc(cbD.stats.pv);
  return r;
}
