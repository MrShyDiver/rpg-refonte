// Fonction `duel` — Stream RPG (v9, moteur 1.3 : combat automatique, échos validés, puissances stockées, ligue, défis, Tour, Arène).
//
// POST, Authorization: Bearer <jeton de session> :
//   { mode: "classe" | "entrainement", adversaire: "<login>" }               duel ciblé
//   { mode: "classe" | "entrainement", adversaire: "<login>", echo: true }   écho ciblé (moins de 5 joueurs dans la tranche)
//   { mode: "auto" }                                                         combat automatique
//   { action: "puissances" }                                                 recalcule les puissances périmées
//   { action: "echos" }                                                      échos que le serveur sait ramener à ton niveau
//   { action: "ligue", cible: 0 | 1 | 2 }                                    combat de ligue contre l'un des trois adversaires proposés
//   { action: "estimer", adversaire: "<login>", devoiler?: true }            catégorie du duel ciblé (et estimation fine, pour un abonné qui la dévoile)
//   { action: "tour", apercu?: true }                                        la Tour : affronter le gardien du prochain étage (ou seulement le voir)
//   { action: "arene" }                                                      l'Arène en draft : jouer le combat suivant avec le build drafté
//
// Le combat est calculé ICI, jamais dans le navigateur ; l'écriture (ticket, récompenses,
// historique, replay) est faite en une transaction par la RPC enregistrer_combat (service_role
// uniquement), qui revérifie toutes les règles sous verrou.
//
// Ce fichier contient tout le code de la fonction. Ce qui est déployé chez Supabase est l'amorce index.ts (5 lignes),
// qui importe ce fichier depuis le dépôt public, épinglé à un commit : le serveur exécute exactement le code du dépôt,
// moteur compris (moteur.ts est importé en relatif, donc au même commit).
import {
  construireCombattant, simulerDuel, type Equipement, type JoueurEntree,
} from "./moteur.ts";

// supabase-js est fourni par l'amorce (import npm), pour que ce fichier reste importable tel quel (tests hors ligne compris).
// deno-lint-ignore no-explicit-any
let createClient: any;
// deno-lint-ignore no-explicit-any
export function creerServeur(fabrique: any) { createClient = fabrique; return traiter; }

const ORIGINES = /^(https:\/\/mrshydiver\.github\.io|http:\/\/(localhost|127\.0\.0\.1)(:\d+)?)$/;
const COLONNES = "id,twitch_login,display_name,avatar_url,atk_stacks,def_stacks,pv_stacks,spd_stacks,luck_stacks," +
  "tickets,abonne_jusqu_au,admin,hors_classement,combat_details,victoires,defaites,egalites,points,medailles,serie_actuelle," +
  "lootbox_ouvertes,premiere_connexion,puissance,puissance_perimee";
const EMPLACEMENTS = ["arme", "offhand", "armure", "strategeme"] as const;
const STATS = ["atk", "def", "pv", "spd", "luck"] as const;
const DELAI_ENTRE_DUELS_MS = 8000;   // identique à enregistrer_combat
const TRANCHE = 0.30;                // identique à enregistrer_combat et au moteur
const MIN_TRANCHE_SANS_ECHO = 5;     // à partir de 5 joueurs dans la tranche, plus d'écho ciblé
const ESSAIS_ECHO_AUTO = 3;          // échos calibrés en combat automatique avant d'abandonner
const ESSAIS_ECHO_LIGUE = 6;         // en ligue, l'écho remplace un adversaire manquant : on insiste un peu plus
const SOURCES_ECHO_AUTO = 30;        // builds chargés pour y trouver ces échos (ceux sans arme sont écartés)
const ESSAIS_LISTE_ECHOS = 12;       // échos calibrés au plus pour dresser la liste de la page Duels (~75 ms pièce)
const RETRAIT_ECHO = ["strategeme", "offhand", "armure"] as const; // pièces retirées, dans l'ordre, à un écho trop fort
const COMBATS_ESSAI = 24;            // combats simulés pour estimer si un écho est un adversaire honnête
const TAUX_MIN = 0.2, TAUX_MAX = 0.8; // un écho gagné (ou perdu) d'avance est refusé
const MARGE_TRANCHE = 0.28;          // l'écho est cherché un peu à l'intérieur de la tranche (arrondis)
// Duel ciblé : la catégorie (valeureux, équitable, déshonorable) vient de la chance de victoire de l'attaquant,
// estimée sur COMBATS_CHANCE combats à graines fixes (même résultat avant et pendant le duel tant que les builds ne bougent pas).
// Mêmes seuils dans enregistrer_combat. ponytail: ~125 ms par estimation, sans cache ; à mettre en cache si la page Duels en abuse.
const COMBATS_CHANCE = 40;
const SEUIL_VALEUREUX = 0.35, SEUIL_DESHONORABLE = 0.65;
const SANS_TICKET = "Tu n'as plus de ticket de duel. Tu en regagnes 5 par jour, et tu peux t'en envoyer depuis le stream avec tes points de chaîne.";
const EXCLUS = ["mrshydiver", "mikumosana"]; // duel.cs EstCompteExclu
// SQLSTATE levés par enregistrer_combat → statut HTTP (message déjà rédigé pour le joueur).
const STATUT_PAR_CODE: Record<string, number> = { RJ400: 400, RJ402: 403, RJ403: 403, RJ404: 404, RJ409: 409, RJ429: 429 };

class ErreurJoueur extends Error {
  statut: number;
  constructor(statut: number, message: string) { super(message); this.statut = statut; }
}
type Joueur = Record<string, any>;
type Mode = "classe" | "entrainement" | "auto";
// deno-lint-ignore no-explicit-any
type Client = any;

function entetesCors(req: Request): Record<string, string> {
  const origine = req.headers.get("origin");
  return {
    "Access-Control-Allow-Origin": origine && ORIGINES.test(origine) ? origine : "https://mrshydiver.github.io",
    // supabase-js ajoute parfois des en-têtes (x-region…) : on accepte ceux annoncés au preflight (l'auth reste le JWT).
    "Access-Control-Allow-Headers": req.headers.get("access-control-request-headers") ?? "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function lireCorps(corps: unknown): { action: "duel" | "puissances" | "echos" | "ligue" | "estimer" | "tour" | "arene"; mode: Mode; adversaire: string; echo: boolean; cible: number; devoiler: boolean } {
  const c = (corps ?? {}) as Record<string, unknown>;
  // Tour : « devoiler » porte l'option « aperçu » (voir le gardien sans combattre).
  if (c.action === "tour") return { action: "tour", mode: "classe", adversaire: "", echo: false, cible: -1, devoiler: c.apercu === true };
  if (c.action === "arene") return { action: "arene", mode: "classe", adversaire: "", echo: false, cible: -1, devoiler: false };
  if (c.action === "puissances" || c.action === "echos") return { action: c.action, mode: "classe", adversaire: "", echo: false, cible: -1, devoiler: false };
  if (c.action === "ligue") {
    if (c.cible !== 0 && c.cible !== 1 && c.cible !== 2) throw new ErreurJoueur(400, "Choisis l'un des trois adversaires proposés");
    return { action: "ligue", mode: "classe", adversaire: "", echo: false, cible: c.cible, devoiler: false };
  }
  const estimer = c.action === "estimer";
  if (!estimer && c.mode !== "classe" && c.mode !== "entrainement" && c.mode !== "auto") {
    throw new ErreurJoueur(400, "Choisis un mode : classé, entraînement ou combat automatique");
  }
  const adversaire = typeof c.adversaire === "string" ? c.adversaire.trim().replace(/^@/, "").toLowerCase() : "";
  if (c.mode !== "auto" && !/^[a-z0-9_]{1,25}$/.test(adversaire)) throw new ErreurJoueur(400, "Indique le pseudo Twitch de ton adversaire");
  if (estimer) return { action: "estimer", mode: "classe", adversaire, echo: false, cible: -1, devoiler: c.devoiler === true };
  return { action: "duel", mode: c.mode as Mode, adversaire, echo: c.mode !== "auto" && c.echo === true, cible: -1, devoiler: false };
}

function verifier<T>({ data, error }: { data: T; error: unknown }): T {
  if (error) throw error;
  return data;
}
const hasard = (n: number) => crypto.getRandomValues(new Uint32Array(1))[0] % n;
const abonne = (j: Joueur) => j.admin === true || (!!j.abonne_jusqu_au && new Date(j.abonne_jusqu_au) > new Date());
// Miroir de App.estClasse : ni hors classement, ni compte importé qui n'a jamais joué.
const estClasse = (j: Joueur) => !j.hors_classement && !EXCLUS.includes(j.twitch_login) &&
  ((j.victoires || 0) + (j.defaites || 0) + (j.egalites || 0) + (j.lootbox_ouvertes || 0) > 0 || !!j.premiere_connexion);
const dansTranche = (p: number, moi: number) => Math.abs(p - moi) / Math.max(1, moi) <= TRANCHE;

// ---------------------------------------------------------------- builds
interface Builds { loadoutDe: (id: string) => Joueur | undefined; items: Map<number, any>; niveaux: Map<string, number> }

// Loadouts, niveaux et fiches d'objets de quelques joueurs.
// ponytail: paquets de 15 joueurs pour rester sous la limite de 1 000 lignes par requête
// (15 joueurs × 50 objets au pire). À revoir si le catalogue dépasse 60 objets.
// defenseDe : pour ce joueur, on prend son build de défense s'il en a réglé un (avec une arme).
async function chargerBuilds(admin: Client, ids: string[], defenseDe?: string): Promise<Builds> {
  const loadouts: Joueur[] = [], inventaire: Joueur[] = [];
  const paquets: string[][] = [];
  for (let i = 0; i < ids.length; i += 15) paquets.push(ids.slice(i, i + 15));
  for (const p of paquets) {
    loadouts.push(...verifier(await admin.from("loadouts").select("player_id,arme,offhand,armure,strategeme").in("player_id", p)) as Joueur[]);
  }
  if (defenseDe) {
    const d = verifier(await admin.from("loadouts_defense").select("player_id,arme,offhand,armure,strategeme").eq("player_id", defenseDe).maybeSingle()) as Joueur | null;
    if (d && d.arme != null) { const i = loadouts.findIndex((l) => l.player_id === defenseDe); if (i >= 0) loadouts[i] = d; else loadouts.push(d); }
  }
  const numeros = [...new Set(loadouts.flatMap((l) => EMPLACEMENTS.map((e) => l[e]).filter((n) => n != null)))] as number[];
  let items: Joueur[] = [];
  if (numeros.length) {
    items = verifier(await admin.from("items").select("numero,data").in("numero", numeros)) as Joueur[];
    for (const p of paquets) {
      inventaire.push(...verifier(await admin.from("inventory").select("player_id,item_numero,niveau").in("player_id", p).in("item_numero", numeros)) as Joueur[]);
    }
  }
  const parJoueur = new Map(loadouts.map((l) => [l.player_id, l]));
  return {
    loadoutDe: (id) => parJoueur.get(id),
    items: new Map(items.map((i) => [i.numero, i.data])),
    niveaux: new Map(inventaire.map((i) => [i.player_id + ":" + i.item_numero, i.niveau as number])),
  };
}

// Construit l'entrée moteur d'un joueur à partir de la base uniquement (jamais du client).
function entree(j: Joueur, b: Builds, protection = false): JoueurEntree {
  const loadout = b.loadoutDe(j.id);
  const equipement: JoueurEntree["equipement"] = {};
  for (const e of EMPLACEMENTS) {
    const n = loadout?.[e];
    const niveau = b.niveaux.get(j.id + ":" + n);
    equipement[e] = n != null && b.items.has(n) && niveau != null ? { data: b.items.get(n), niveau, numero: n } as Equipement : null;
  }
  return {
    login: j.twitch_login, display_name: j.display_name, avatar_url: j.avatar_url ?? null,
    stacks: { atk: j.atk_stacks, def: j.def_stacks, pv: j.pv_stacks, spd: j.spd_stacks, luck: j.luck_stacks },
    equipement,
    infos: { victoires: j.victoires, defaites: j.defaites, egalites: j.egalites, points: j.points,
             medailles: j.medailles, serie_actuelle: j.serie_actuelle, protection_active: protection },
  };
}
const puissanceDe = (e: JoueurEntree) => construireCombattant(e).powerBrut as number;

// Recalcule les puissances marquées périmées (build changé depuis le dernier calcul).
async function rafraichirPuissances(admin: Client): Promise<number> {
  const perimes = verifier(await admin.from("players").select(COLONNES).eq("puissance_perimee", true).limit(400)) as Joueur[];
  if (!perimes.length) return 0;
  const b = await chargerBuilds(admin, perimes.map((j) => j.id));
  const maj = perimes.map((j) => ({ id: j.id, p: puissanceDe(entree(j, b)) }));
  verifier(await admin.rpc("enregistrer_puissances", { p: maj }));
  return maj.length;
}

// ---------------------------------------------------------------- écho
// Écho : le build d'un autre joueur, ramené à la puissance visée.
//  - plus faible : ses stats sont multipliées, réparties comme les siennes (+1 partout : un joueur qui
//    n'a monté qu'une stat ne donnerait pas un adversaire crédible une fois gonflé) ;
//  - plus fort : ses stats sont réduites ; si son équipement seul dépasse encore la cible, ce sont
//    les améliorations de ses objets qui sont réduites ; et si, même sans amélioration, il dépasse
//    encore (cas d'un attaquant débutant), l'écho se bat avec moins de pièces — l'arme reste toujours.
// La recherche est une dichotomie sur un seul facteur : déterministe, une trentaine d'évaluations.
export function calibrerEcho(source: JoueurEntree, cible: number): { entree: JoueurEntree; puissance: number; ecart: number } {
  const profil = Object.fromEntries(STATS.map((k) => [k, (source.stacks[k] || 0) + 1])) as JoueurEntree["stacks"];
  let pieces = source.equipement;
  const avec = (m: number, g = 1): JoueurEntree => ({
    ...source,
    stacks: Object.fromEntries(STATS.map((k) => [k, Math.round(profil[k] * m)])) as JoueurEntree["stacks"],
    equipement: g === 1 ? pieces : Object.fromEntries(EMPLACEMENTS.map((e) => {
      const x = pieces[e];
      return [e, x ? { ...x, niveau: Math.floor(x.niveau * g) } : null];
    })),
  });
  for (const e of RETRAIT_ECHO) {
    if (puissanceDe(avec(0, 0)) <= cible) break;
    pieces = { ...pieces, [e]: null };
  }
  const chercher = (f: (x: number) => JoueurEntree, haut: number): JoueurEntree => {
    let bas = 0;
    for (let i = 0; i < 30; i++) {
      const milieu = (bas + haut) / 2;
      if (puissanceDe(f(milieu)) <= cible) bas = milieu; else haut = milieu;
    }
    const a = f(bas), b = f(haut); // arrondis : on garde le plus proche des deux bornes
    return Math.abs(puissanceDe(a) - cible) <= Math.abs(puissanceDe(b) - cible) ? a : b;
  };
  let e: JoueurEntree;
  if (puissanceDe(avec(0)) > cible) e = chercher((g) => avec(0, g), 1);
  else {
    let haut = 1;
    while (puissanceDe(avec(haut)) < cible && haut < 4096) haut *= 2;
    e = chercher((m) => avec(m), haut);
  }
  const puissance = puissanceDe(e);
  return {
    entree: { ...e, login: "echo:" + source.login, display_name: "Écho de " + source.display_name, infos: { ...source.infos, protection_active: false } },
    puissance, ecart: (puissance - cible) / Math.max(1, cible),
  };
}

// À puissance égale, un combat n'est pas toujours équilibré (la puissance résume mal certains builds).
// On cherche donc, À L'INTÉRIEUR de la tranche de l'attaquant, la puissance d'écho qui donne le combat
// le plus proche de 50/50, sur COMBATS_ESSAI combats simulés à graines fixes (résultat déterministe).
// Coût mesuré : ~75 ms par écho.
function tauxVictoire(moi: JoueurEntree, adversaire: JoueurEntree, n = COMBATS_ESSAI, protection = false): number {
  let v = 0;
  for (let k = 0; k < n; k++) {
    const r = simulerDuel(moi, adversaire, { seed: 7000 + k, mode: "classe", protection_active: protection }).vainqueur;
    v += r === "attaquant" ? 1 : r === null ? 0.5 : 0;
  }
  return v / n;
}
const trancheDe = (chance: number) => chance < SEUIL_VALEUREUX ? "au_dessus" : chance > SEUIL_DESHONORABLE ? "en_dessous" : "dans_tranche";
// Estimation en 5 niveaux (jamais de pourcentage exact), alignée sur les catégories : 3 = combat équitable.
const niveauDe = (chance: number) => chance >= 0.85 ? 5 : chance > SEUIL_DESHONORABLE ? 4 : chance >= SEUIL_VALEUREUX ? 3 : chance >= 0.15 ? 2 : 1;
const erreurRpc = (error: { code?: string; message: string }) => {
  const statut = STATUT_PAR_CODE[error.code ?? ""];
  return statut ? new ErreurJoueur(statut, error.message) : error;
};
export function echoEquitable(source: JoueurEntree, moi: JoueurEntree): { entree: JoueurEntree; ecart: number; taux: number; valable: boolean } {
  const p = puissanceDe(moi);
  let bas = (1 - MARGE_TRANCHE) * p, haut = (1 + MARGE_TRANCHE) * p, visee = p;
  let meilleur: { entree: JoueurEntree; ecart: number; taux: number } | null = null;
  for (let i = 0; i < 5; i++) {
    const c = calibrerEcho(source, visee), taux = tauxVictoire(moi, c.entree);
    const ecart = (c.puissance - p) / Math.max(1, p);
    if (!meilleur || Math.abs(taux - 0.5) <= Math.abs(meilleur.taux - 0.5)) meilleur = { entree: c.entree, ecart, taux };
    if (Math.abs(taux - 0.5) <= 0.08) break;
    if (taux > 0.5) bas = visee; else haut = visee; // l'attaquant gagne trop : écho plus fort
    visee = (bas + haut) / 2;
  }
  const m = meilleur!;
  return { ...m, valable: Math.abs(m.ecart) <= TRANCHE && m.taux >= TAUX_MIN && m.taux <= TAUX_MAX };
}

// Joueurs classés autour de l'attaquant : tous les candidats, et ceux de sa tranche.
async function voisinage(admin: Client, moi: Joueur): Promise<{ candidats: Joueur[]; proches: Joueur[]; maPuissance: number }> {
  await rafraichirPuissances(admin); // tranches exactes
  const tous = verifier(await admin.from("players").select(COLONNES).limit(2000)) as Joueur[];
  const maPuissance = puissanceDe(entree(moi, await chargerBuilds(admin, [moi.id])));
  const candidats = tous.filter((j) => j.id !== moi.id && estClasse(j));
  return { candidats, maPuissance, proches: candidats.filter((j) => j.puissance != null && dansTranche(j.puissance, maPuissance)) };
}

// Échos proposés sur la page Duels : uniquement ceux que le serveur sait ramener au niveau de
// l'attaquant (même calcul que le combat, donc aucun refus au moment de défier).
async function listerEchos(admin: Client, moi: Joueur) {
  const { candidats, proches, maPuissance } = await voisinage(admin, moi);
  const voulus = MIN_TRANCHE_SANS_ECHO - proches.length;
  if (voulus <= 0) return [];
  const loin = (j: Joueur) => Math.abs(Math.log(Math.max(1, j.puissance ?? 1) / Math.max(1, maPuissance)));
  const sources = candidats.filter((j) => !proches.includes(j)).sort((a, b) => loin(a) - loin(b)).slice(0, SOURCES_ECHO_AUTO);
  const builds = await chargerBuilds(admin, [moi.id, ...sources.map((j) => j.id)]);
  const moiEntree = entree(moi, builds);
  const echos: unknown[] = [];
  let essais = 0;
  for (const j of sources) {
    const e = entree(j, builds);
    if (!e.equipement.arme) continue;
    if (++essais > ESSAIS_LISTE_ECHOS || echos.length >= voulus) break;
    const c = echoEquitable(e, moiEntree);
    if (c.valable) {
      echos.push({ login: j.twitch_login, equipement: Object.fromEntries(EMPLACEMENTS.map((k) => {
        const x = c.entree.equipement[k];
        return [k, x ? { numero: x.numero, niveau: x.niveau } : null];
      })) });
    }
  }
  return echos;
}

// ---------------------------------------------------------------- ligue
// Combat de ligue : l'adversaire est l'une des trois propositions gardées en base (jamais un choix libre).
// Joueur réel : on affronte son build de DÉFENSE, et son classement bouge (cote cachée et points de ligue). Écho : personne n'est touché.
async function combatLigue(admin: Client, moi: Joueur, cible: number): Promise<unknown> {
  const prep = verifier(await admin.rpc("ligue_preparer", { p_id: moi.id })) as { energie: number; propositions: Joueur[] };
  const prop = prep?.propositions?.[cible];
  if (!prop) throw new ErreurJoueur(409, "Cet adversaire n'est plus proposé : recharge la page de la ligue");
  if (prep.energie < 1) throw new ErreurJoueur(403, "Plus d'énergie de ligue : elle se recharge toute seule, reviens dans un moment");

  let moiEntree: JoueurEntree, defEntree: JoueurEntree, defenseur: Joueur | null = null, echoDe: Joueur | null = null;
  if (prop.type === "joueur") {
    defenseur = verifier(await admin.from("players").select(COLONNES).eq("id", prop.id).maybeSingle()) as Joueur | null;
    if (!defenseur) throw new ErreurJoueur(409, "Cet adversaire n'est plus disponible : recharge la page de la ligue");
    const builds = await chargerBuilds(admin, [moi.id, defenseur.id], defenseur.id);
    moiEntree = entree(moi, builds);
    defEntree = entree(defenseur, builds);
    if (!defEntree.equipement.arme) throw new ErreurJoueur(409, "Cet adversaire n'a plus d'arme : recharge la page de la ligue");
  } else {
    const { candidats } = await voisinage(admin, moi);
    const sources = candidats.map((j) => ({ j, r: hasard(1 << 30) })).sort((a, b) => a.r - b.r).map((x) => x.j).slice(0, SOURCES_ECHO_AUTO);
    const builds = await chargerBuilds(admin, [moi.id, ...sources.map((j) => j.id)]);
    moiEntree = entree(moi, builds);
    let trouve: { j: Joueur; entree: JoueurEntree } | null = null, essais = 0;
    for (const j of sources) {
      const e = entree(j, builds);
      if (!e.equipement.arme) continue;
      if (++essais > ESSAIS_ECHO_LIGUE) break;
      const c = echoEquitable(e, moiEntree);
      if (c.valable) { trouve = { j, entree: c.entree }; break; }
    }
    if (!trouve) throw new ErreurJoueur(409, "Aucun écho à ta mesure pour l'instant : choisis un autre adversaire.");
    echoDe = trouve.j;
    defEntree = trouve.entree;
  }

  const seed = crypto.getRandomValues(new Uint32Array(1))[0];
  const resultat = simulerDuel(moiEntree, defEntree, { seed, mode: "classe" });
  const { data, error } = await admin.rpc("enregistrer_ligue", {
    p_attaquant: moi.id, p_cible: cible, p_defenseur: defenseur ? defenseur.id : null, p_vainqueur: resultat.vainqueur,
    p_stats: resultat.stats, p_replay: resultat.replay, p_seed: seed, p_echo_de: echoDe ? echoDe.id : null,
  });
  if (error) throw erreurRpc(error);
  return data;
}

// ---------------------------------------------------------------- Tour
// Le gardien d'un étage est l'écho d'un joueur, ramené à la puissance de l'étage (fixée par la base : tour_preparer).
// Source : parmi les 3 joueurs armés les plus proches de cette puissance, celui dont l'écho est de force MÉDIANE
// (mini-tournoi à graines fixes entre les 3 échos) : à puissance égale certains builds sont bien plus durs que d'autres,
// et un étage ne doit pas être un mur parce qu'il est tombé sur le plus coriace. Choix stable d'un essai à l'autre.
// ponytail: ~36 combats simulés par appel (~110 ms) ; à mettre en cache par étage si la Tour devient très jouée.
const SOURCES_TOUR = 12, COMBATS_TOURNOI_TOUR = 12;
async function combatTour(admin: Client, moi: Joueur, apercu: boolean): Promise<unknown> {
  const prep = verifier(await admin.rpc("tour_preparer", { p_id: moi.id })) as { etage: number; etages: number; tentatives_restantes: number; cible: number };
  if (prep.etage >= prep.etages) throw new ErreurJoueur(409, "Tu es au sommet de la Tour : plus aucun gardien à affronter pour l'instant.");
  const etage = prep.etage + 1;
  const { candidats } = await voisinage(admin, moi);
  const loin = (j: Joueur) => Math.abs(Math.log(Math.max(1, j.puissance ?? 1) / Math.max(1, prep.cible)));
  const proches = candidats.sort((a, b) => loin(a) - loin(b) || (a.id < b.id ? -1 : 1)).slice(0, SOURCES_TOUR);
  const builds = await chargerBuilds(admin, [moi.id, ...proches.map((j) => j.id)]);
  const armes = proches.filter((j) => entree(j, builds).equipement.arme).slice(0, 3);
  if (!armes.length) throw new ErreurJoueur(409, "Aucun gardien disponible pour l'instant : reviens un peu plus tard.");
  const echos = armes.map((j) => ({ j, e: calibrerEcho(entree(j, builds), prep.cible), score: 0 }));
  for (let a = 0; a < echos.length; a++) {
    for (let b = a + 1; b < echos.length; b++) {
      const t = tauxVictoire(echos[a].e.entree, echos[b].e.entree, COMBATS_TOURNOI_TOUR);
      echos[a].score += t; echos[b].score += 1 - t;
    }
  }
  echos.sort((x, y) => x.score - y.score || (x.j.id < y.j.id ? -1 : 1));
  const { j: source, e: garde } = echos[Math.floor((echos.length - 1) / 2)];
  if (apercu) {
    return { etage, gardien: { login: source.twitch_login, puissance: Math.round(garde.puissance), stacks: garde.entree.stacks,
      equipement: Object.fromEntries(EMPLACEMENTS.map((k) => { const x = garde.entree.equipement[k]; return [k, x ? { numero: x.numero, niveau: x.niveau } : null]; })) } };
  }
  if (prep.tentatives_restantes < 1) throw new ErreurJoueur(403, "Plus de tentative pour aujourd'hui : la Tour t'attend demain.");
  const seed = crypto.getRandomValues(new Uint32Array(1))[0];
  const resultat = simulerDuel(entree(moi, builds), garde.entree, { seed, mode: "classe" });
  const { data, error } = await admin.rpc("enregistrer_tour", {
    p_attaquant: moi.id, p_etage: etage, p_vainqueur: resultat.vainqueur, p_stats: resultat.stats, p_replay: resultat.replay, p_seed: seed, p_echo_de: source.id,
  });
  if (error) throw erreurRpc(error);
  return data;
}

// ---------------------------------------------------------------- Arène en draft
// Chacun drafte son build côté base (arene_commencer, arene_drafter) : objets et stats du joueur ne comptent pas.
// Ici, le combat : l'adversaire est le build drafté par un autre joueur qui a atteint au moins le même nombre de victoires
// (choisi par arene_preparer), sinon le meilleur d'un lot de builds draftés par le serveur.
type Kit = { stacks: JoueurEntree["stacks"]; equipement: Record<string, { numero: number; niveau: number } | null> };
const INFOS_KIT = { victoires: 0, defaites: 0, egalites: 0, points: 0, medailles: 0, serie_actuelle: 0, protection_active: false };
function entreeKit(login: string, nom: string, avatar: string | null, kit: Kit, fiches: Map<number, any>): JoueurEntree {
  return { login, display_name: nom, avatar_url: avatar, stacks: kit.stacks, infos: INFOS_KIT,
    equipement: Object.fromEntries(EMPLACEMENTS.map((e) => {
      const x = kit.equipement?.[e];
      return [e, x && fiches.has(x.numero) ? { data: fiches.get(x.numero), niveau: x.niveau, numero: x.numero } as Equipement : null];
    })) };
}
// Le meilleur d'un lot de builds : tournoi toutes rondes, 2 combats par paire (12 builds au plus : 132 combats).
export function meilleurBuild(lot: JoueurEntree[]): JoueurEntree | undefined {
  if (lot.length < 2) return lot[0];
  const score = lot.map(() => 0);
  for (let i = 0; i < lot.length; i++) for (let j = i + 1; j < lot.length; j++) for (let k = 0; k < 2; k++) {
    const r = simulerDuel(k ? lot[j] : lot[i], k ? lot[i] : lot[j], { seed: 9000 + i * 31 + j * 7 + k, mode: "classe" }).vainqueur;
    if (r) score[(r === "attaquant") !== (k === 1) ? i : j]++;
  }
  return lot[score.indexOf(Math.max(...score))];
}
async function combatArene(admin: Client, moi: Joueur): Promise<unknown> {
  const prep = verifier(await admin.rpc("arene_preparer", { p_id: moi.id })) as { etat: string; kit: Kit | null; fantome: Joueur | null; bots: Kit[] | null };
  if (prep.etat !== "en_cours" || !prep.kit) {
    throw new ErreurJoueur(409, prep.etat === "draft" ? "Termine d'abord ton draft dans l'Arène."
      : prep.etat === "coffres" ? "Ton parcours est terminé : ouvre tes coffres dans l'Arène." : "Aucun parcours en cours : retourne à l'Arène.");
  }
  const items = verifier(await admin.from("items").select("numero,data").limit(1000)) as Joueur[];
  const fiches = new Map(items.map((i) => [i.numero, i.data]));
  const fantome = prep.fantome;
  const adverse = fantome ? entreeKit("echo:" + fantome.login, "Build de " + fantome.nom, fantome.avatar_url ?? null, fantome.kit, fiches)
    : meilleurBuild((prep.bots ?? []).map((k) => entreeKit("arene", "Adversaire de l'Arène", null, k, fiches)).filter((b) => b.equipement.arme));
  if (!adverse || !adverse.equipement.arme) throw new ErreurJoueur(409, "L'adversaire n'a pas pu être préparé : relance le combat.");
  const seed = crypto.getRandomValues(new Uint32Array(1))[0];
  const resultat = simulerDuel(entreeKit(moi.twitch_login, moi.display_name, moi.avatar_url ?? null, prep.kit, fiches), adverse, { seed, mode: "classe" });
  const { data, error } = await admin.rpc("enregistrer_arene", {
    p_attaquant: moi.id, p_vainqueur: resultat.vainqueur, p_stats: resultat.stats, p_replay: resultat.replay, p_seed: seed, p_fantome: fantome ? fantome.id : null,
  });
  if (error) throw erreurRpc(error);
  return data;
}

// ---------------------------------------------------------------- requête
export async function traiter(req: Request): Promise<Response> {
  const cors = entetesCors(req);
  const repondre = (statut: number, corps: unknown) =>
    new Response(JSON.stringify(corps), { status: statut, headers: { ...cors, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return repondre(405, { erreur: "Méthode non autorisée" });

  try {
    const { action, mode, adversaire, echo, cible: cibleLigue, devoiler } = lireCorps(await req.json().catch(() => null));

    const url = Deno.env.get("SUPABASE_URL")!;
    const jeton = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const session = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: `Bearer ${jeton}` } }, auth: { persistSession: false },
    });
    const { data: auth } = await session.auth.getUser(jeton);
    if (!auth?.user) throw new ErreurJoueur(401, "Connecte-toi avec Twitch pour jouer");

    const admin: Client = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
    let moi = verifier(await admin.from("players").select(COLONNES).eq("auth_user_id", auth.user.id).maybeSingle()) as Joueur | null;
    if (!moi) throw new ErreurJoueur(403, "Connecte-toi avec Twitch pour jouer");

    if (action === "puissances") return repondre(200, { mises_a_jour: await rafraichirPuissances(admin) });
    if (action === "echos") return repondre(200, { echos: await listerEchos(admin, moi) });
    if (action === "tour" && devoiler) return repondre(200, await combatTour(admin, moi, true));
    if (action === "estimer") {
      // Catégorie d'un duel ciblé avant de le lancer (pour tous) ; estimation fine pour un abonné qui dépense un dévoilement.
      if (adversaire === moi.twitch_login) throw new ErreurJoueur(400, "Tu ne peux pas te défier toi-même !");
      const lui = verifier(await admin.from("players").select(COLONNES).eq("twitch_login", adversaire).maybeSingle()) as Joueur | null;
      if (!lui) throw new ErreurJoueur(404, `Personne ne s'appelle « ${adversaire} » dans l'arène`);
      const b = await chargerBuilds(admin, [moi.id, lui.id]);
      const prot = Number(lui.combat_details?.protectionsActives ?? 0) > 0;
      const chance = tauxVictoire(entree(moi, b), entree(lui, b, prot), COMBATS_CHANCE, prot);
      const rep: Record<string, unknown> = {
        tranche: trancheDe(chance),
        revanche: verifier(await admin.rpc("revanche_due", { p_moi: moi.id, p_cible: lui.id })) === true,
      };
      if (devoiler) {
        const { data, error } = await admin.rpc("devoiler_estimation_de", { p_id: moi.id });
        if (error) throw erreurRpc(error);
        rep.niveau = niveauDe(chance);
        rep.devoilements_restants = data?.devoilements_restants;
      }
      return repondre(200, rep);
    }

    // Anti-spam commun aux duels et à la ligue (revérifié sous verrou par les RPC).
    const dernier = verifier(await admin.from("duels").select("joue_le").eq("attaquant_id", moi.id)
      .order("joue_le", { ascending: false }).limit(1)) as { joue_le: string }[];
    if (dernier[0] && Date.now() - new Date(dernier[0].joue_le).getTime() < DELAI_ENTRE_DUELS_MS) {
      throw new ErreurJoueur(429, "Doucement ! Attends quelques secondes avant de relancer un combat");
    }
    if (action === "ligue") return repondre(200, await combatLigue(admin, moi, cibleLigue));
    if (action === "tour") return repondre(200, await combatTour(admin, moi, false));
    if (action === "arene") return repondre(200, await combatArene(admin, moi));

    // Tickets de duel : les gains passifs sont crédités avant de compter.
    verifier(await admin.rpc("crediter_passif_de", { p_id: moi.id }));
    moi = verifier(await admin.from("players").select(COLONNES).eq("id", moi.id).maybeSingle()) as Joueur;

    // Contrôles rapides (messages clairs) ; enregistrer_combat refait tout sous verrou.
    // Sans ticket, seul un duel de revanche reste possible (vérifié plus bas, une fois la cible connue).
    const sansTicket = mode !== "entrainement" && moi.tickets <= 0;
    if (sansTicket && (mode === "auto" || echo)) throw new ErreurJoueur(403, SANS_TICKET);
    if (mode === "entrainement" && !abonne(moi)) {
      throw new ErreurJoueur(403, "L'entraînement gratuit est réservé aux abonnés de la chaîne Twitch");
    }
    if (adversaire && adversaire === moi.twitch_login) throw new ErreurJoueur(400, "Tu ne peux pas te défier toi-même !");
    // Qui affronte-t-on ? Un joueur réel (cible), ou l'écho d'un joueur (sources à calibrer).
    let cible: Joueur | null = null;
    let sources: Joueur[] = [];
    if (mode === "auto" || echo) {
      const { candidats, proches } = await voisinage(admin, moi);
      if (mode === "auto") {
        if (proches.length) cible = proches[hasard(proches.length)];
        else {
          const melange = candidats.map((j) => ({ j, r: hasard(1 << 30) })).sort((a, b) => a.r - b.r).map((x) => x.j);
          sources = melange.slice(0, SOURCES_ECHO_AUTO);
        }
      } else {
        const source = candidats.find((j) => j.twitch_login === adversaire);
        if (!source) throw new ErreurJoueur(404, `« ${adversaire} » ne peut pas servir d'écho`);
        if (proches.length >= MIN_TRANCHE_SANS_ECHO) {
          throw new ErreurJoueur(400, "Tu as déjà 5 adversaires ou plus dans ta tranche : les échos ne sont pas disponibles");
        }
        if (proches.includes(source)) throw new ErreurJoueur(400, `${source.display_name} est dans ta tranche : défie-le directement`);
        sources = [source];
      }
      if (!cible && !sources.length) throw new ErreurJoueur(409, "Aucun adversaire disponible pour l'instant. Choisis ta cible dans la liste.");
    } else {
      cible = verifier(await admin.from("players").select(COLONNES).eq("twitch_login", adversaire).maybeSingle()) as Joueur | null;
      if (!cible) throw new ErreurJoueur(404, `Personne ne s'appelle « ${adversaire} » dans l'arène`);
      if (sansTicket && verifier(await admin.rpc("revanche_due", { p_moi: moi.id, p_cible: cible.id })) !== true) throw new ErreurJoueur(403, SANS_TICKET);
    }

    // Builds actuels des joueurs concernés, puis entrées du moteur.
    const builds = await chargerBuilds(admin, [moi.id, ...(cible ? [cible.id] : sources.map((j) => j.id))]);
    const moiEntree = entree(moi, builds);
    let defEntree: JoueurEntree, echoDe: Joueur | null = null, protection = false;
    if (cible) {
      // Protection du défenseur (duel.cs : helldivers_protection) : -20 % de dégâts subis par le défenseur.
      protection = Number(cible.combat_details?.protectionsActives ?? 0) > 0;
      defEntree = entree(cible, builds, protection);
    } else {
      // Un écho doit avoir un vrai build (au moins une arme) et donner un combat ouvert.
      let trouve: { j: Joueur; entree: JoueurEntree } | null = null;
      let essais = 0;
      for (const j of sources) {
        const e = entree(j, builds);
        if (!e.equipement.arme) continue;
        if (++essais > ESSAIS_ECHO_AUTO) break;
        const c = echoEquitable(e, moiEntree);
        if (c.valable) { trouve = { j, entree: c.entree }; break; }
      }
      if (!trouve) {
        throw new ErreurJoueur(409, mode === "auto"
          ? "Aucun écho à ta mesure pour l'instant. Choisis ta cible dans la liste."
          : "Cet écho ne peut pas être ramené à ton niveau : choisis-en un autre.");
      }
      echoDe = trouve.j;
      defEntree = trouve.entree;
    }

    // Duel ciblé contre un joueur : la catégorie (et donc les récompenses) vient de la chance estimée, plus de l'écart de puissance.
    const chance = cible && mode === "classe" ? tauxVictoire(moiEntree, defEntree, COMBATS_CHANCE, protection) : null;
    const seed = crypto.getRandomValues(new Uint32Array(1))[0];
    const resultat = simulerDuel(moiEntree, defEntree,
      { seed, mode: mode === "entrainement" ? "entrainement" : "classe", protection_active: mode !== "entrainement" && protection });

    const { data, error } = await admin.rpc("enregistrer_combat", {
      p_attaquant: moi.id, p_defenseur: cible ? cible.id : null, p_mode: mode, p_vainqueur: resultat.vainqueur,
      p_stats: chance === null ? resultat.stats : { ...resultat.stats, chance_attaquant: chance },
      p_replay: resultat.replay, p_seed: seed, p_protection: protection,
      p_echo_de: echoDe ? echoDe.id : null,
    });
    if (error) throw erreurRpc(error);
    return repondre(200, data);
  } catch (e) {
    if (e instanceof ErreurJoueur) return repondre(e.statut, { erreur: e.message });
    console.error("[duel] erreur inattendue", e);
    return repondre(500, { erreur: "Le duel n'a pas pu se jouer. Réessaie dans un instant." });
  }
}

