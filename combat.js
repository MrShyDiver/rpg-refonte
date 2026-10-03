"use strict";
/* =====================================================================
   Stream RPG — combat.html : l'arène cinématique des duels.
   combat.html?duel=<id>                         rejoue un duel (live ou site)
   combat.html?adversaire=<login>&mode=classe|entrainement   écran « versus » puis combat (&echo=1 : contre son écho)
   combat.html?mode=auto                                     combat automatique : adversaire tiré au sort par le serveur
   combat.html?mode=ligue&cible=0|1|2                        combat de ligue contre l'un des trois adversaires proposés
   Le replay (format legacy duels/<id>.json, sur-ensemble côté site) pilote tout :
   aucun calcul de combat ici, seulement la mise en scène.
   ===================================================================== */
(function () {
const { el, icone, fmt } = App;
const params = new URLSearchParams(location.search);
const SEUIL_SAIGNEMENT = 20;
const ARRET = Symbol("arret");
// « 1× » = 0,7 de la vitesse d'origine : on doit pouvoir suivre chaque coup à l'œil.
const TEMPO = 0.7;
const AURAS = ["poison", "feu", "sang", "elec", "stun", "marque", "antisoin", "brise", "rage", "envol", "bouclier", "souffle"];
// Pistes de l'ancien overlay (sons/musiques/) : une au hasard par duel.
const MUSIQUES = ["dbz_battle_2.mp3", "sf2-guile-theme.mp3", "shokugeki_battle.mp3", "naturo_battle_1.mp3", "naturo_battle_2.mp3", "renoir_battle_2.mp3"];
const prefMusique = { get() { try { return localStorage.getItem("rpg-musique") !== "off"; } catch (e) { return true; } }, set(v) { try { localStorage.setItem("rpg-musique", v ? "on" : "off"); } catch (e) {} } };
const cle = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const TRANCHES = { dans_tranche: "Combat équitable", au_dessus: "Cible plus forte", en_dessous: "Cible plus faible" };
const PICTOS = {
  lecture: "M7 4.5v15l12.5-7.5z", pause: "M6.5 5H10v14H6.5zM14 5h3.5v14H14z", fin: "M15.5 5H18v14h-2.5zM5 5v14l9.5-7z",
  plein: "M4 9V4h5v2H6v3zm11-5h5v5h-2V6h-3zM4 15h2v3h3v2H4zm14 3v-3h2v5h-5v-2z", rejouer: "M12 5a7 7 0 1 1-6.6 4.7l1.9.6A5 5 0 1 0 12 7v3L7.5 6 12 2z",
  retour: "M11 5 4 12l7 7 1.4-1.4L7.8 13H20v-2H7.8l4.6-4.6z",
  musique: "M9 17.5A2.5 2.5 0 1 1 7 15.05V5.4l12-2.4v11.5a2.5 2.5 0 1 1-2-2.45V7.55l-8 1.6z",
};
function picto(nom) {
  const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  s.setAttribute("viewBox", "0 0 24 24"); s.setAttribute("aria-hidden", "true");
  const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
  p.setAttribute("d", PICTOS[nom]); p.setAttribute("fill", "currentColor"); s.append(p);
  return s;
}
// Aléatoire déterministe (tracés identiques d'un visionnage à l'autre).
function graine(txt) { let h = 2166136261; for (const c of String(txt)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
function alea(seed) { let a = seed || 1; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const hasard = (a, b) => a + Math.random() * (b - a);

// Bruitages : sfx.js est chargé à la demande (le gabarit n'a qu'un script de page).
const pSfx = new Promise((ok) => { if (window.SFX) return ok(); const s = document.createElement("script"); s.src = "sfx.js"; s.onload = s.onerror = () => ok(); document.head.append(s); });
function demarrerSon() { if (window.SFX) { SFX.actif = App.sons.actif; SFX.demarrer(); } }
function son(nom, o) { if (window.SFX && App.sons.actif) SFX.jouer(nom, o || {}); }

// ---------------------------------------------------------------------
// Visage d'un joueur (avatar Twitch ou initiales), commun au versus et à l'arène
// ---------------------------------------------------------------------
function visage(j) {
  const nom = j.display_name || j.twitch_login || "?";
  const f = el("div", { class: "visage", style: { "--teinte": String(graine(j.twitch_login || nom) % 360) } }, el("span", { class: "initiale", texte: nom.charAt(0).toUpperCase() }));
  if (j.avatar_url && /^https:\/\//.test(j.avatar_url)) {
    const im = new Image(); im.alt = ""; im.referrerPolicy = "no-referrer"; im.decoding = "async";
    im.onload = () => f.classList.add("avec-image"); im.src = j.avatar_url; f.append(im);
  }
  return f;
}
const parNom = () => new Map(App.objets.map((o) => [cle(o.nom), o]));
// Slot du replay ({numero?, nom, niveau, rarete?, image?}) -> { o, niveau effectif }
function objetDe(x, slot, index) {
  if (!x || (!x.nom && !x.numero)) return null;
  let o = x.numero ? App.objet(x.numero) : null;
  if (!o && x.nom) o = index.get(cle(x.nom));
  if (!o) o = { numero: x.numero || "?", nom: x.nom, slot, rarete: x.rarete && App.RARETES[x.rarete] ? x.rarete : "commun", set: "", data: { image: x.image || "" }, image: x.image || "" };
  return { o, niveau: Math.min(Number(x.niveau) || 0, App.niveauMax(o.rarete)) };
}
const EFFETS_COURTS = [["poison", "POISON"], ["brulure", "BRÛLURE"], ["anti_heal", "SOINS RÉDUITS"], ["brise_def", "DÉFENSE BRISÉE"], ["marque", "MARQUÉ"], ["esquive_parade_buff", "ENVOL"]];
function carteOuVide(it, libelle) {
  return it ? App.carte(it.o, { niveau: it.niveau, equipe: false }) : el("div", { class: "case-vide" }, el("span", { texte: libelle }), el("small", { texte: "Vide" }));
}

// ---------------------------------------------------------------------
// Démarrage
// ---------------------------------------------------------------------
// Un combat de ligue ou de la Tour garde sa page allumée dans le menu.
App.demarrer({ ligue: "ligue", tour: "tour", arene: "arene" }[new URLSearchParams(location.search).get("mode")] || "duels", async (main, ctx) => {
  main.classList.add("contenu-arene");
  document.title = "Combat · Stream RPG";
  const id = params.get("duel"), adv = params.get("adversaire");
  if (params.get("bac")) return ecranBac(main, ctx);
  if (id) return ecranReplay(main, ctx, id);
  if (params.get("mode") === "ligue") return ecranLigue(main, ctx, Number(params.get("cible")));
  if (params.get("mode") === "tour") return ecranTour(main, ctx);
  if (params.get("mode") === "arene") return ecranArene(main, ctx);
  if (params.get("mode") === "auto") return ecranAuto(main, ctx);
  if (adv) return ecranVersus(main, ctx, String(adv).toLowerCase(), params.get("mode") === "entrainement" ? "entrainement" : "classe", params.get("echo") === "1");
  main.append(blocVide("Aucun combat à afficher.", "Choisis un adversaire ou un combat dans l'historique."));
});

function blocVide(titre, texte) {
  return el("div", { class: "vide arene-vide" }, el("b", { texte: titre }), el("span", { texte: texte + " " }),
    el("a", { class: "btn-second", href: "duels.html", style: { marginTop: "14px" } }, picto("retour"), "Retour aux duels"));
}

async function ecranReplay(main, ctx, id) {
  main.replaceChildren(el("div", { class: "chargement", texte: "Chargement du combat…" }));
  let duel, R, joueurs;
  try {
    const [js, ds] = await Promise.all([App.api.joueurs(), App.api.duels()]);
    joueurs = js;
    duel = ds.find((d) => String(d.id) === String(id)) || { id, replay: {} };
    R = await App.api.replayDuel(duel);
  } catch (e) {
    console.warn(e);
    main.replaceChildren(blocVide("Ce combat n'a pas pu être rechargé.", (e && e.message ? e.message + ". " : "") + "Le résultat, lui, reste enregistré dans l'historique."));
    return;
  }
  if (!R || !Array.isArray(R.rounds)) { main.replaceChildren(blocVide("Ce replay est vide.", "Il ne contient aucun tour à rejouer.")); return; }
  await pSfx;
  arene(main, ctx, { R, duel, joueurs, mode: R.mode || (duel.type === "entrainement" ? "entrainement" : "classe") }).porte();
}

// Bac à sable de la recette : combat calculé sur recette.html, rien d'enregistré.
async function ecranBac(main, ctx) {
  let bac = null;
  try { bac = JSON.parse(sessionStorage.getItem("rpg-bac") || "null"); } catch (e) {}
  if (!App.estRecetteur(ctx.joueur) || !bac || !bac.R || !Array.isArray(bac.R.rounds)) {
    main.replaceChildren(blocVide("Aucun combat de test à afficher.", "Lance-en un depuis la recette."));
    return;
  }
  await pSfx;
  arene(main, ctx, { R: bac.R, duel: { id: "bac", type: "bac_a_sable" }, joueurs: bac.joueurs, mode: "bac_a_sable", bac: true }).porte();
}

// ---------------------------------------------------------------------
// Écran « versus » : les deux builds, le mode, le coût, « Lancer le duel »
// ---------------------------------------------------------------------
// Carte d'un combattant sur l'écran versus. echo : le build affiché sera ramené au niveau de l'attaquant.
function carteVersus(j, loadout, niveaux, puissance, toi, echo) {
  const it = (col) => { const n = loadout && loadout[col]; const o = n ? App.objet(n) : null; return o ? { o, niveau: Math.min(niveaux.get(n) || 0, App.niveauMax(o.rarete)) } : null; };
  return el("div", { class: "vs-joueur" + (toi ? " moi" : "") + (echo ? " echo" : "") },
    el("div", { class: "vs-portrait" }, visage(j)),
    el("div", { class: "vs-ident" }, el("b", { texte: (echo ? "Écho de " : "") + (j.display_name || j.twitch_login) }), toi ? el("span", { class: "pilule toi", texte: "Toi" }) : echo ? el("span", { class: "pilule echo", texte: "Écho" }) : null),
    el("div", { class: "vs-chiffres" },
      el("div", {}, el("b", { class: "num", texte: echo ? "Ajustée" : puissance ? fmt(puissance) : "—" }), el("span", { texte: echo ? "dans ta tranche" : "puissance" })),
      echo ? el("div", {}, el("b", { class: "num", texte: "50/50" }), el("span", { texte: "combat visé" }))
        : el("div", {}, el("b", { class: "num", texte: `${fmt(j.victoires || 0)}-${fmt(j.defaites || 0)}` }), el("span", { texte: "V-D" }))),
    el("div", { class: "vs-build" }, [["arme", "Arme"], ["armure", "Armure"], ["offhand", "Main gauche"], ["strategeme", "Stratagème"]].map(([c, lib]) => carteOuVide(it(c), lib))));
}
// Un écho n'existe pas dans la liste des joueurs : on lui prête le portrait du joueur d'origine.
const joueurEcho = (source, d) => ({ ...source, twitch_login: d.twitch_login, display_name: d.display_name });

// ---------------------------------------------------------------------
// Combat automatique : le serveur tire un adversaire dans la tranche (ou un écho)
// ---------------------------------------------------------------------
async function ecranAuto(main, ctx) {
  const moi = ctx.joueur, tickets = moi.tickets || 0;
  const pMoi = (App.puissance(moi, App.niveaux(), ctx.loadout) || {}).powerLevel || 0;
  const lancer = el("button", { type: "button", class: "btn-principal vs-lancer", disabled: tickets < 1 }, icone("i-epees"), el("span", { texte: "Lancer le combat" }));
  const mystere = el("div", { class: "vs-joueur mystere" },
    el("div", { class: "vs-portrait" }, el("span", { class: "vs-inconnu", "aria-hidden": "true", texte: "?" })),
    el("div", { class: "vs-ident" }, el("b", { texte: "Adversaire tiré au sort" })),
    el("p", { class: "vs-mystere-texte" }, "Un joueur de ta tranche de puissance (30 % en plus ou en moins). Personne de disponible ? Tu affrontes un ",
      el("a", { class: "lien", href: "aide.html#echo", texte: "écho" }), " : le build d'un autre joueur, ramené à ton niveau."));
  lancer.addEventListener("click", async () => {
    demarrerSon(); // geste utilisateur : l'audio peut démarrer
    lancer.disabled = true; lancer.classList.add("occupe"); lancer.lastChild.textContent = "Recherche d'un adversaire…";
    try {
      const rep = await App.lancerDuel({ mode: "auto" });
      if (rep.joueur) { Object.assign(ctx.joueur, rep.joueur); App.majRessources(); }
      history.replaceState(null, "", "combat.html?duel=" + encodeURIComponent(rep.duel_id));
      await pSfx; demarrerSon();
      const d = rep.defenseur || { twitch_login: rep.replay.defenseur, display_name: rep.replay.defenseur };
      arene(main, ctx, { R: rep.replay, duel: { id: rep.duel_id, type: "auto_battle", replay: { source: "site" } }, joueurs: [moi, d], mode: "auto", resultat: rep.resultat }).jouer();
      App.rafraichirJoueur().catch(() => {});
    } catch (e) {
      App.erreur(e);
      lancer.classList.remove("occupe"); lancer.lastChild.textContent = "Lancer le combat"; lancer.disabled = (ctx.joueur.tickets || 0) < 1;
    }
  });
  main.replaceChildren(el("section", { class: "versus", "aria-labelledby": "titre-versus" },
    el("header", { class: "vs-entete" }, el("span", { class: "vs-sur", texte: "Combat automatique" }), el("h1", { id: "titre-versus", texte: "Le jeu choisit ton adversaire" })),
    el("div", { class: "vs-duo" }, carteVersus(moi, ctx.loadout, App.niveaux(), pMoi, true), el("div", { class: "vs-eclair", "aria-hidden": "true" }, el("span", { texte: "VS" })), mystere),
    el("div", { class: "vs-bas" },
      el("p", { class: "vs-cout" }, icone("i-ticket"), el("span", {}, "Coûte ", el("b", { texte: "1 ticket de duel" }), ` · il t'en reste ${fmt(tickets)}.`)),
      el("p", { class: "vs-cout vs-reduit" }, icone("i-alerte"), el("span", {}, el("b", { texte: "Récompenses réduites de 50 %" }), " par rapport à un duel ciblé : 6 médailles par victoire, 3 par égalité, 1 par défaite.")),
      lancer,
      el("p", { class: "vs-raison", texte: tickets < 1 ? "Plus de ticket de duel : gagne-en en live." : "" }),
      el("p", { class: "mention vs-note", texte: "Le combat est calculé par le serveur avec vos deux builds actuels. Pour toucher les récompenses complètes, choisis toi-même ta cible dans la liste des adversaires." }),
      el("a", { class: "lien-retour", href: "duels.html" }, picto("retour"), "Retour aux duels"))));
}

// ---------------------------------------------------------------------
// Combat de ligue : l'un des trois adversaires proposés (son build de défense), ou un écho
// ---------------------------------------------------------------------
async function ecranLigue(main, ctx, cible) {
  const moi = ctx.joueur;
  const vide = (titre, texte) => el("div", { class: "vide arene-vide" }, el("b", { texte: titre }), el("span", { texte: texte + " " }),
    el("a", { class: "btn-second", href: "ligue.html", style: { marginTop: "14px" } }, picto("retour"), "Retour à la ligue"));
  main.replaceChildren(el("div", { class: "chargement", texte: "Préparation du combat de ligue…" }));
  let etat, p, adv = null, lo = null, nivAdv = new Map();
  try {
    etat = await App.api.ligue();
    p = etat.propositions[cible];
    if (p && p.type === "joueur") {
      adv = await App.api.joueur(p.login);
      if (adv) {
        const [def, combat, inv] = await Promise.all([App.api.loadoutDefense(adv.id), App.api.loadout(adv.id), App.api.inventaire(adv.id)]);
        lo = def && def.arme != null ? def : combat;   // sa défense s'il en a réglé une, sinon son build de combat
        nivAdv = new Map((inv || []).map((l) => [l.item_numero, l.niveau]));
      }
    }
  } catch (e) { App.erreur(e); main.replaceChildren(vide("Le combat de ligue n'a pas pu se charger.", "Vérifie ta connexion puis recharge la page.")); return; }
  if (!p || (p.type === "joueur" && !adv)) { main.replaceChildren(vide("Cet adversaire n'est plus proposé.", "Tes trois adversaires t'attendent sur la page de la ligue.")); return; }

  const pMoi = (App.puissance(moi, App.niveaux(), ctx.loadout) || {}).powerLevel || 0;
  const pAdv = adv ? (App.puissance(adv, nivAdv, lo) || {}).powerLevel || 0 : 0;
  const lancer = el("button", { type: "button", class: "btn-principal vs-lancer", disabled: etat.energie < 1 }, icone("i-epees"), el("span", { texte: "Lancer le combat" }));
  const droite = adv ? carteVersus(adv, lo, nivAdv, pAdv, false)
    : el("div", { class: "vs-joueur mystere" },
      el("div", { class: "vs-portrait" }, el("span", { class: "vs-inconnu", "aria-hidden": "true", texte: "?" })),
      el("div", { class: "vs-ident" }, el("b", { texte: "Écho mystère" })),
      el("p", { class: "vs-mystere-texte" }, "Il n'y a pas de joueur à cet échelon pour l'instant : tu affrontes un ",
        el("a", { class: "lien", href: "aide.html#echo", texte: "écho" }), ", le build d'un autre joueur ramené à ton niveau. Personne n'y perd rien."));
  lancer.addEventListener("click", async () => {
    demarrerSon(); // geste utilisateur : l'audio peut démarrer
    lancer.disabled = true; lancer.classList.add("occupe"); lancer.lastChild.textContent = "Combat en cours…";
    try {
      const rep = await App.lancerLigue(cible);
      if (rep.joueur) { Object.assign(ctx.joueur, rep.joueur); App.majRessources(); }
      history.replaceState(null, "", "combat.html?duel=" + encodeURIComponent(rep.duel_id));
      await pSfx; demarrerSon();
      const d = adv || rep.defenseur || { twitch_login: rep.replay.defenseur, display_name: rep.replay.defenseur };
      arene(main, ctx, { R: rep.replay, duel: { id: rep.duel_id, type: "ligue", replay: { source: "site" } }, joueurs: [moi, d], mode: "ligue", resultat: rep.resultat }).jouer();
    } catch (e) {
      App.erreur(e);
      // Adversaires changés entre-temps, ou plus d'énergie : la page de la ligue fait foi.
      if (e.statut === 409) { main.replaceChildren(vide("Tes adversaires viennent de changer.", "Retourne à la ligue pour voir les nouveaux.")); return; }
      lancer.classList.remove("occupe"); lancer.lastChild.textContent = "Lancer le combat"; lancer.disabled = false;
    }
  });
  const signe = (n) => (n > 0 ? "+" : n < 0 ? "−" : "") + fmt(Math.abs(n));
  main.replaceChildren(el("section", { class: "versus", "aria-labelledby": "titre-versus" },
    el("header", { class: "vs-entete" }, el("span", { class: "vs-sur", texte: "Combat de ligue" }),
      el("h1", { id: "titre-versus", texte: adv ? "Toi contre " + (adv.display_name || adv.twitch_login) : "Toi contre un écho" })),
    el("div", { class: "vs-duo" }, carteVersus(moi, ctx.loadout, App.niveaux(), pMoi, true), el("div", { class: "vs-eclair", "aria-hidden": "true" }, el("span", { texte: "VS" })), droite),
    el("div", { class: "vs-bas" },
      el("p", { class: "vs-cout" }, icone("i-eclair"), el("span", {}, "Coûte ", el("b", { texte: "1 énergie de ligue" }), ` · il t'en reste ${fmt(etat.energie)} sur ${fmt(etat.energie_plafond)}.`)),
      el("p", { class: "vs-cout" }, icone("i-ligue"), el("span", {}, "Victoire : ", el("b", { texte: signe(p.gain) + " points de ligue" }), " · défaite : ",
        el("b", { texte: p.perte < 0 ? signe(p.perte) + " points" : "aucune perte" }), ".")),
      lancer,
      el("p", { class: "vs-raison", texte: etat.energie < 1 ? "Plus d'énergie de ligue : elle se recharge toute seule." : "" }),
      el("p", { class: "mention vs-note", texte: adv
        ? "Tu affrontes le build de défense de " + (adv.display_name || adv.twitch_login) + ". Il n'a pas besoin d'être connecté : il verra le résultat dans ses notifications."
        : "Le combat est calculé par le serveur. Un écho gagné compte comme une victoire à ton niveau." }),
      el("a", { class: "lien-retour", href: "ligue.html" }, picto("retour"), "Retour à la ligue"))));
}

// La Tour : le gardien du prochain étage, tel que le serveur l'a préparé (écho ramené à la puissance de l'étage).
async function ecranTour(main, ctx) {
  const moi = ctx.joueur;
  const vide = (titre, texte) => el("div", { class: "vide arene-vide" }, el("b", { texte: titre }), el("span", { texte: texte + " " }),
    el("a", { class: "btn-second", href: "tour.html", style: { marginTop: "14px" } }, picto("retour"), "Retour à la Tour"));
  main.replaceChildren(el("div", { class: "chargement", texte: "Le gardien se prépare…" }));
  let etat, g, source;
  try {
    etat = await App.api.tour();
    if (etat.etage >= etat.etages) { main.replaceChildren(vide("Tu es au sommet de la Tour.", "Plus aucun gardien à affronter pour l'instant.")); return; }
    g = (await App.lancerTour(true)).gardien;
    source = (await App.api.joueur(g.login)) || { twitch_login: g.login, display_name: g.login };
  } catch (e) { App.erreur(e); main.replaceChildren(vide("La Tour n'a pas pu se charger.", "Vérifie ta connexion puis recharge la page.")); return; }
  const p = etat.paliers[etat.etage], reste = etat.tentatives_restantes;
  const garde = { ...source, ...g.stacks && Object.fromEntries(Object.entries(g.stacks).map(([k, v]) => [k + "_stacks", v])), twitch_login: "echo:" + g.login, display_name: "Gardien de l'étage " + p.etage, victoires: null, defaites: null };
  const lo = Object.fromEntries(Object.entries(g.equipement).map(([k, x]) => [k, x ? x.numero : null]));
  const niv = new Map(Object.values(g.equipement).filter(Boolean).map((x) => [x.numero, x.niveau]));
  const pMoi = (App.puissance(moi, App.niveaux(), ctx.loadout) || {}).powerLevel || 0;
  const lancer = el("button", { type: "button", class: "btn-principal vs-lancer", disabled: reste < 1 }, icone("i-epees"), el("span", { texte: "Affronter le gardien" }));
  const droite = carteVersus(garde, lo, niv, g.puissance, false);
  const vd = droite.querySelector(".vs-chiffres div:last-child");   // un gardien n'a pas de bilan : on montre l'étage
  if (vd) vd.replaceChildren(el("b", { class: "num", texte: fmt(p.etage) + " / " + fmt(etat.etages) }), el("span", { texte: "étage" }));
  lancer.addEventListener("click", async () => {
    demarrerSon(); // geste utilisateur : l'audio peut démarrer
    lancer.disabled = true; lancer.classList.add("occupe"); lancer.lastChild.textContent = "Combat en cours…";
    try {
      const rep = await App.lancerTour(false);
      if (rep.joueur) { Object.assign(ctx.joueur, rep.joueur); App.majRessources(); }
      history.replaceState(null, "", "combat.html?duel=" + encodeURIComponent(rep.duel_id));
      await pSfx; demarrerSon();
      arene(main, ctx, { R: rep.replay, duel: { id: rep.duel_id, type: "tour", replay: { source: "site" } }, joueurs: [moi, { ...source, twitch_login: rep.replay.defenseur, display_name: garde.display_name }], mode: "tour", resultat: rep.resultat }).jouer();
    } catch (e) {
      App.erreur(e);
      if (e.statut === 409) { main.replaceChildren(vide("La Tour a changé.", "Retourne à la Tour pour voir où tu en es.")); return; }
      lancer.classList.remove("occupe"); lancer.lastChild.textContent = "Affronter le gardien"; lancer.disabled = false;
    }
  });
  main.replaceChildren(el("section", { class: "versus", "aria-labelledby": "titre-versus" },
    el("header", { class: "vs-entete" }, el("span", { class: "vs-sur", texte: "La Tour" }), el("h1", { id: "titre-versus", texte: "Étage " + fmt(p.etage) + " : toi contre le gardien" })),
    el("div", { class: "vs-duo" }, carteVersus(moi, ctx.loadout, App.niveaux(), pMoi, true), el("div", { class: "vs-eclair", "aria-hidden": "true" }, el("span", { texte: "VS" })), droite),
    el("div", { class: "vs-bas" },
      el("p", { class: "vs-cout" }, icone("i-coche"), el("span", {}, el("b", { texte: "Gratuit" }), ` · une défaite coûte 1 tentative, il t'en reste ${fmt(reste)} sur ${fmt(etat.tentatives)} aujourd'hui.`)),
      el("p", { class: "vs-cout" }, icone("i-medaille"), el("span", {}, "Victoire : ", el("b", { texte: "+" + fmt(p.medailles) + " médailles" }), p.lootbox ? [" et ", el("b", { texte: "+" + fmt(p.lootbox) + " lootbox" })] : null, ", et l'étage suivant s'ouvre.")),
      lancer,
      el("p", { class: "vs-raison", texte: reste < 1 ? "Plus de tentative pour aujourd'hui : la Tour t'attend demain." : "" }),
      el("p", { class: "mention vs-note" }, "Le gardien est l'", el("a", { class: "lien", href: "aide.html#echo", texte: "écho" }), " de " + (source.display_name || g.login) + ", ramené à la puissance de l'étage. Lui ne gagne ni ne perd rien."),
      el("a", { class: "lien-retour", href: "tour.html" }, picto("retour"), "Retour à la Tour"))));
}

// L'Arène : on se bat avec le build drafté, contre le build d'un autre joueur au même nombre de victoires (ou du serveur), découvert au combat.
async function ecranArene(main, ctx) {
  const moi = ctx.joueur;
  const vide = (titre, texte) => el("div", { class: "vide arene-vide" }, el("b", { texte: titre }), el("span", { texte: texte + " " }),
    el("a", { class: "btn-second", href: "arene.html", style: { marginTop: "14px" } }, picto("retour"), "Retour à l'Arène"));
  main.replaceChildren(el("div", { class: "chargement", texte: "Préparation du combat…" }));
  let etat;
  try { etat = await App.api.arene(); } catch (e) { App.erreur(e); main.replaceChildren(vide("L'Arène n'a pas pu se charger.", "Vérifie ta connexion puis recharge la page.")); return; }
  if (etat.etat !== "en_cours" || !etat.kit) { main.replaceChildren(vide(etat.etat === "draft" ? "Termine d'abord ton draft." : etat.etat === "coffres" ? "Ton parcours est terminé : des coffres t'attendent." : "Aucun parcours en cours.", "Tout se passe sur la page de l'Arène.")); return; }
  const kit = etat.kit, lo = Object.fromEntries(Object.entries(kit.equipement).map(([k, x]) => [k, x ? x.numero : null]));
  const niv = new Map(Object.values(kit.equipement).filter(Boolean).map((x) => [x.numero, x.niveau]));
  const pk = App.puissance({ atk_stacks: kit.stacks.atk, def_stacks: kit.stacks.def, pv_stacks: kit.stacks.pv, spd_stacks: kit.stacks.spd, luck_stacks: kit.stacks.luck }, niv, lo);
  const gauche = carteVersus(moi, lo, niv, pk ? Math.round(pk.powerLevel) : 0, true);
  const vd = gauche.querySelector(".vs-chiffres div:last-child");   // dans l'Arène, le bilan affiché est celui du parcours
  if (vd) vd.replaceChildren(el("b", { class: "num", texte: `${fmt(etat.victoires)}-${fmt(etat.defaites)}` }), el("span", { texte: "parcours" }));
  const lancer = el("button", { type: "button", class: "btn-principal vs-lancer" }, icone("i-epees"), el("span", { texte: "Lancer le combat" }));
  lancer.addEventListener("click", async () => {
    demarrerSon(); // geste utilisateur : l'audio peut démarrer
    lancer.disabled = true; lancer.classList.add("occupe"); lancer.lastChild.textContent = "Combat en cours…";
    try {
      const rep = await App.lancerArene();
      if (rep.joueur) { Object.assign(ctx.joueur, rep.joueur); App.majRessources(); }
      history.replaceState(null, "", "combat.html?duel=" + encodeURIComponent(rep.duel_id));
      await pSfx; demarrerSon();
      const d = { twitch_login: rep.replay.defenseur, display_name: rep.defenseur.display_name, avatar_url: rep.defenseur.avatar_url };
      arene(main, ctx, { R: rep.replay, duel: { id: rep.duel_id, type: "arene", replay: { source: "site" } }, joueurs: [moi, d], mode: "arene", resultat: rep.resultat }).jouer();
    } catch (e) {
      App.erreur(e);
      if (e.statut === 409) { main.replaceChildren(vide("Ton parcours a changé.", "Retourne à l'Arène pour voir où tu en es.")); return; }
      lancer.classList.remove("occupe"); lancer.lastChild.textContent = "Lancer le combat"; lancer.disabled = false;
    }
  });
  main.replaceChildren(el("section", { class: "versus", "aria-labelledby": "titre-versus" },
    el("header", { class: "vs-entete" }, el("span", { class: "vs-sur", texte: "Arène" }), el("h1", { id: "titre-versus", texte: "Combat " + fmt(etat.victoires + etat.defaites + 1) + " du parcours" })),
    el("div", { class: "vs-duo" }, gauche, el("div", { class: "vs-eclair", "aria-hidden": "true" }, el("span", { texte: "VS" })),
      el("div", { class: "vs-joueur mystere" },
        el("div", { class: "vs-portrait" }, el("span", { class: "vs-inconnu", "aria-hidden": "true", texte: "?" })),
        el("div", { class: "vs-ident" }, el("b", { texte: "Adversaire mystère" })),
        el("p", { class: "vs-mystere-texte", texte: "Un build drafté comme le tien, par un joueur qui a déjà atteint ton nombre de victoires ou par le serveur. Tu le découvres au combat." }))),
    el("div", { class: "vs-bas" },
      el("p", { class: "vs-cout" }, icone("i-coche"), el("span", {}, el("b", { texte: "Gratuit" }), ` · ${fmt(etat.victoires)} victoire${etat.victoires > 1 ? "s" : ""} sur ${fmt(etat.max_victoires)}, ${fmt(etat.defaites)} défaite${etat.defaites > 1 ? "s" : ""} sur ${fmt(etat.max_defaites)}.`)),
      lancer,
      el("p", { class: "mention vs-note", texte: "Tu te bats avec ton build d'arène, pas avec ton équipement. Ce combat ne touche ni ton bilan ni ta ligue." }),
      el("a", { class: "lien-retour", href: "arene.html" }, picto("retour"), "Retour à l'Arène"))));
}

async function ecranVersus(main, ctx, login, modeInitial, echo) {
  const moi = ctx.joueur;
  if (login === moi.twitch_login) { main.replaceChildren(blocVide("Tu ne peux pas te défier toi-même.", "Choisis un autre adversaire dans la liste.")); return; }
  main.replaceChildren(el("div", { class: "chargement", texte: "Préparation du face-à-face…" }));
  let adv, lo, inv;
  try {
    adv = await App.api.joueur(login);
    if (adv) [lo, inv] = await Promise.all([App.api.loadout(adv.id), App.api.inventaire(adv.id)]);
  } catch (e) { App.erreur(e); main.replaceChildren(blocVide("Le face-à-face n'a pas pu se charger.", "Vérifie ta connexion puis recharge la page.")); return; }
  if (!adv) { main.replaceChildren(blocVide("Ce joueur est introuvable.", "Il a peut-être changé de pseudo.")); return; }
  let nivAdv = new Map((inv || []).map((l) => [l.item_numero, l.niveau]));
  if (echo) {
    // L'écho se bat avec l'équipement calibré par le serveur (améliorations réduites, pièces parfois retirées).
    try {
      const e = JSON.parse(sessionStorage.getItem("echos-valides")).echos.find((x) => x.login === login).equipement;
      lo = Object.fromEntries(Object.entries(e).map(([k, x]) => [k, x ? x.numero : null]));
      nivAdv = new Map(Object.values(e).filter(Boolean).map((x) => [x.numero, x.niveau]));
    } catch (x) { /* lien direct ou navigation privée : on montre le build d'origine */ }
  }
  const pMoi = (App.puissance(moi, App.niveaux(), ctx.loadout) || {}).powerLevel || 0;
  const pAdv = (App.puissance(adv, nivAdv, lo) || {}).powerLevel || 0;
  const abonne = App.peutEntrainer(moi);
  let mode = modeInitial === "entrainement" && abonne ? "entrainement" : "classe";

  const cout = el("p", { class: "vs-cout", "aria-live": "polite" });
  // Catégorie du duel ciblé : le serveur estime ta chance de victoire avec vos deux builds (plus de tranche de puissance).
  const categorie = el("p", { class: "vs-cout vs-categorie", "aria-live": "polite", hidden: true });
  let estime = null, revanche = false, prime = 0;
  if (!echo) {
    Promise.all([App.estimerDuel(login), App.api.rangsLigue().catch(() => [])]).then(([e, rangs]) => {
      estime = e; revanche = !!e.revanche;
      prime = e.tranche === "en_dessous" || App.horsClassement(moi) ? 0 : App.primeDe(rangs.find((r) => r.player_id === adv.id));
      choisir(mode);
    }).catch((e) => console.warn(e));
  }
  const lancer = el("button", { type: "button", class: "btn-principal vs-lancer" }, icone("i-epees"), el("span", { texte: "Lancer le duel" }));
  const raison = el("p", { class: "vs-raison" });
  const modes = el("div", { class: "onglets-b vs-modes", role: "group", "aria-label": "Type de duel" },
    el("button", { type: "button", "data-v": "classe", onclick: () => choisir("classe") }, "Duel ciblé"),
    el("button", { type: "button", "data-v": "entrainement", title: abonne ? null : "Réservé aux abonnés de la chaîne",
      onclick: () => (abonne ? choisir("entrainement") : App.toast("L'entraînement gratuit est réservé aux abonnés Twitch de la chaîne.", { titre: "Réservé aux abonnés", icone: "i-cadenas" })) },
      abonne ? null : icone("i-cadenas"), "Entraînement"));
  function choisir(m) {
    mode = m;
    modes.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === m)));
    const tickets = ctx.joueur.tickets || 0;
    history.replaceState(null, "", `combat.html?adversaire=${encodeURIComponent(login)}&mode=${m}${echo ? "&echo=1" : ""}`);
    const c = m === "classe" && estime ? App.CATEGORIES_DUEL[estime.tranche] : null;
    categorie.hidden = !c;
    if (c) categorie.replaceChildren(icone("i-medaille"), el("span", {}, el("b", { texte: c[0] }), ` : ${c[1]}. Victoire : `, el("b", { texte: `+${c[2]} médailles` }), `, défaite : +${c[3]}.`,
      prime ? el("b", { class: "vs-prime", texte: ` Prime : +${fmt(prime)} médailles si tu gagnes.` }) : null));
    if (m === "classe") {
      if (revanche) cout.replaceChildren(icone("i-coche"), el("span", {}, el("b", { texte: "Revanche gratuite" }), " : ce duel ne coûte pas de ticket. Médailles et bilan en jeu."));
      else cout.replaceChildren(icone("i-ticket"), el("span", {}, "Coûte ", el("b", { texte: "1 ticket de duel" }), ` · il t'en reste ${fmt(tickets)}. Médailles et bilan en jeu, comme en live.`));
      const bloque = tickets < 1 && !revanche;
      lancer.disabled = bloque;
      raison.textContent = bloque ? "Plus de ticket de duel : tu en regagnes 5 par jour, et le live t'en donne tout de suite." : "";
    } else {
      cout.replaceChildren(icone("i-coche"), el("span", {}, el("b", { texte: "Gratuit" }), " pour les abonnés, 3 par jour · aucune récompense, ton bilan ne bouge pas."));
      lancer.disabled = false; raison.textContent = "";
    }
  }
  lancer.addEventListener("click", async () => {
    demarrerSon(); // geste utilisateur : l'audio peut démarrer
    lancer.disabled = true; lancer.classList.add("occupe"); lancer.lastChild.textContent = "Combat en cours…";
    try {
      const rep = await App.lancerDuel({ adversaire: login, mode, echo });
      if (rep.joueur) { Object.assign(ctx.joueur, rep.joueur); App.majRessources(); }
      history.replaceState(null, "", "combat.html?duel=" + encodeURIComponent(rep.duel_id));
      await pSfx; demarrerSon();
      const joueurs = [moi, echo && rep.defenseur ? joueurEcho(adv, rep.defenseur) : adv];
      const duel = { id: rep.duel_id, type: (rep.mode || mode) === "entrainement" ? "entrainement" : "duel", replay: { source: "site" } };
      arene(main, ctx, { R: rep.replay, duel, joueurs, mode: rep.mode || mode, resultat: rep.resultat }).jouer();
      App.rafraichirJoueur().catch(() => {});
    } catch (e) {
      App.erreur(e);
      // Écho refusé par le serveur (un build a changé depuis la liste) : la liste gardée est oubliée.
      if (echo && e.statut === 409) {
        try { sessionStorage.removeItem("echos-valides"); } catch (x) { /* navigation privée */ } // liste périmée : la page Duels la redemandera
      }
      lancer.classList.remove("occupe"); lancer.lastChild.textContent = "Lancer le duel"; choisir(mode);
    }
  });

  main.replaceChildren(el("section", { class: "versus", "aria-labelledby": "titre-versus" },
    el("header", { class: "vs-entete" }, el("span", { class: "vs-sur", texte: "Face-à-face" }), el("h1", { id: "titre-versus", texte: "Toi contre " + (echo ? "l'écho de " : "") + (adv.display_name || adv.twitch_login) })),
    el("div", { class: "vs-duo" }, carteVersus(moi, ctx.loadout, App.niveaux(), pMoi, true), el("div", { class: "vs-eclair", "aria-hidden": "true" }, el("span", { texte: "VS" })), carteVersus(adv, lo, nivAdv, pAdv, false, echo)),
    el("div", { class: "vs-bas" }, modes, cout, categorie, lancer, raison,
      el("p", { class: "mention vs-note" }, echo
        ? ["Tu affrontes un ", el("a", { class: "lien", href: "aide.html#echo", texte: "écho" }), " : le build de " + (adv.display_name || login) + ", dont les stats et l'équipement sont ramenés à ton niveau par le serveur pour un combat serré. Lui ne gagne ni ne perd rien, et tu touches les récompenses d'un combat équitable."]
        : "Le combat est calculé par le serveur avec vos deux builds actuels. " + (adv.display_name || login) + " n'a pas besoin d'être connecté : il verra le résultat dans ses notifications, et pourra prendre sa revanche gratuitement s'il perd."),
      el("a", { class: "lien-retour", href: "duels.html" }, picto("retour"), "Retour aux duels"))));
  choisir(mode);
}

// =====================================================================
// L'ARÈNE
// =====================================================================
function arene(main, ctx, opts) {
  const R = opts.R, rounds = R.rounds || [], n = rounds.length;
  const moi = ctx.joueur.twitch_login;
  const parLogin = new Map((opts.joueurs || []).map((j) => [j.twitch_login, j]));
  parLogin.set(moi, ctx.joueur);
  for (const c of ["attaquant", "defenseur"]) { // replay d'un écho : portrait et nom du joueur d'origine
    const source = App.echoDe(R[c]);
    if (source && !parLogin.has(R[c])) parLogin.set(R[c], { ...(parLogin.get(source) || {}), twitch_login: R[c], display_name: R.etage ? "Gardien de l'étage " + R.etage : R.type === "arene" ? "Build de " + ((parLogin.get(source) || {}).display_name || source) : App.nomCombattant(R[c], parLogin) });
  }
  const nomDe = (l) => (parLogin.get(l) || {}).display_name || l || "?";
  const index = parNom();
  const gauche = R.defenseur === moi && R.attaquant !== moi ? "defenseur" : "attaquant";

  // -------------------------------------------------------------- Modèle
  function combattant(c) {
    const login = R[c], j = parLogin.get(login) || { twitch_login: login, display_name: login, avatar_url: R["avatar_" + c] || null };
    const b = R["build_" + c] || {};
    const it = { arme: objetDe(b.arme, "weapon", index), armure: objetDe(b.torso || b.armure, "torso", index), offhand: objetDe(b.offhand, "offhand", index), strategeme: objetDe(b.strategeme, "strategeme", index) };
    const dStrat = it.strategeme ? App.auNiveau(it.strategeme.o, it.strategeme.niveau) : {};
    const souffle = ["arme", "armure", "offhand"].some((k) => it[k] && it[k].o.data && it[k].o.data.dernierSouffleActif);
    const g = c === gauche;
    return {
      c, login, j, nom: nomDe(login), g, pan: g ? -0.55 : 0.55, it, souffle,
      pvMax0: R["pv_max_" + c] || 1, puissance: R["power_" + c] ?? (opts.duel || {})["power_" + c],
      anim: R["arme_" + c + "_anim"] || (it.arme && it.arme.o.data.anim) || "poing",
      sons: R["arme_" + c + "_sons"] || "", sonsStrat: R["strategeme_" + c + "_sons"] || "",
      profil: window.SFX ? SFX.profilArme(it.arme && it.arme.o) : "poing",
      profilStrat: window.SFX ? SFX.profilStrategeme(it.strategeme && it.strategeme.o) : "missile",
      usagesMax: R["strategeme_usages_max_" + c] || dStrat.usagesParCombat || null, cdTours: dStrat.cooldownTours || 0,
      offUsagesMax: R["offhand_usages_max_" + c] || 0, // moteur 1.1 : main gauche à charges (soin ou action)
      imageBase: it.arme ? it.arme.o.image : "", image2: it.arme ? it.arme.o.data.stance2ImageUrl || "" : "",
    };
  }
  const F = { attaquant: combattant("attaquant"), defenseur: combattant("defenseur") };
  const G = F[gauche], D = F[gauche === "attaquant" ? "defenseur" : "attaquant"];
  const autre = (X) => (X === F.attaquant ? F.defenseur : F.attaquant);
  const de = (login) => (login === R.attaquant ? F.attaquant : login === R.defenseur ? F.defenseur : null);
  function initialiser(X) {
    Object.assign(X, { pv: X.pvMax0, pvMax: X.pvMax0, pvVis: X.pvMax0, shield: R[X.c + "_shield_max"] || 0,
      usages: X.usagesMax, cd: 0, offUsages: X.offUsagesMax, offCd: 0, pending: false, reticule: null, stance2: false, etourdi: false, souffleUtilise: false, rage: 0,
      r: null, ko: false, brisBouclier: false, saignement: 0, etats: {} });
  }

  // Réducteur : applique un tour au modèle (sert à la lecture ET au saut vers la fin).
  function appliquer(r) {
    const A = r.frappeur ? de(r.frappeur) : null;
    for (const X of [F.attaquant, F.defenseur]) {
      const s = X.c, bouclierAvant = X.shield;
      X.pv = Math.max(0, r["pv_" + s + "_apres"] ?? X.pv);
      X.pvMax = r["pv_max_" + s + "_apres"] ?? X.pvMax;
      if (r["shield_" + s] !== undefined) X.shield = r["shield_" + s] || 0;
      if (bouclierAvant > 0 && X.shield === 0) X.brisBouclier = true;
      X.saignement = r["saignement_stacks_" + s] || 0;
      if (r["dernier_souffle_" + s]) X.souffleUtilise = true;
      X.r = r;
    }
    if (A) {
      const C = autre(A);
      if (A.cd > 0) A.cd--;
      if (r.etourdi) A.etourdi = false;
      if (r.rage_bonus !== undefined) A.rage = r.rage_bonus || 0;
      if (r.strategeme) {
        const impact = A.pending && !r.missile_lance;
        if (!impact) {
          A.usages = r.strategeme_usages_restants ?? (A.usages != null ? Math.max(0, A.usages - 1) : null);
          if (r.strategeme_derniere_utilisation) A.usages = 0;
          A.cd = (r.strategeme_cooldown_tours ?? A.cdTours) + 1;
        }
        A.pending = !!r.missile_lance;
      }
      if (r.arme_image_override) A.stance2 = !!A.image2 && r.arme_image_override === A.image2;
      if (r.etourdi_applique) C.etourdi = true;
      if (r.riposte_stun_frappeur) A.etourdi = true;
    }
    // Moteur 1.1 : charges, recharges et impact en vol publiés par le serveur pour les deux combattants.
    for (const X of [F.attaquant, F.defenseur]) {
      const s = X.c;
      if (r["strategeme_recharge_" + s] != null) { X.usages = r["strategeme_usages_" + s]; X.cd = r["strategeme_recharge_" + s] + 1; }
      if (r["offhand_recharge_" + s] != null) { X.offUsages = r["offhand_usages_" + s]; X.offCd = r["offhand_recharge_" + s] + 1; }
      if (r["missile_en_vol_" + s] !== undefined) X.pending = r["missile_en_vol_" + s];
    }
    for (const X of [F.attaquant, F.defenseur]) X.pvVis = X.pv;
  }

  // -------------------------------------------------------------- DOM
  const fx = el("div", { class: "fx", "aria-hidden": "true" });
  const numTour = el("b", { class: "num", texte: "—" });
  const annonceur = el("div", { class: "annonce", "aria-hidden": "true" });
  const log = el("p", { class: "arene-log", "aria-live": "polite" });
  function construire(X) {
    const plein = el("i", { class: "plein" }), fantome = el("i", { class: "fantome" }), bouclier = el("i", { class: "bouclier" }), erosion = el("i", { class: "erosion" });
    const barre = el("div", { class: "barre", role: "meter", "aria-valuemin": "0", "aria-valuemax": String(X.pvMax0) }, fantome, plein, erosion, bouclier);
    const pvTxt = el("span", { class: "pv-txt num" }), statuts = el("div", { class: "statuts" });
    const vis = visage(X.j);
    const blessures = el("div", { class: "blessures" });
    const portrait = el("div", { class: "portrait", "data-degats": "0" }, vis, blessures, el("i", { class: "teinte" }), el("i", { class: "vignette" }), el("i", { class: "eclair-blanc" }));
    const slot = (k, lib) => el("div", { class: "slot slot-" + k }, carteOuVide(X.it[k], lib));
    const sArme = slot("arme", "Mains nues"), sArmure = slot("armure", "Sans armure"), sOff = slot("offhand", "Main gauche");
    // Stratagème : la carte elle-même, face visible, à la taille de la main gauche.
    const pips = el("div", { class: "pips", role: "img" }), cd = el("span", { class: "cd num" });
    const pipsOff = el("div", { class: "pips", role: "img" }), cdOff = el("span", { class: "cd num" });
    if (X.offUsagesMax) { sOff.classList.add("pile"); sOff.append(cdOff, pipsOff); }
    const deck = el("div", { class: "slot deck pile", title: X.it.strategeme ? "Stratagème : " + X.it.strategeme.o.nom : "Pas de stratagème" },
      carteOuVide(X.it.strategeme, "Stratagème"), cd, pips);
    const socle = el("div", { class: "socle" }, portrait, auras(graine(X.login + "aura")));
    const racine = el("div", { class: "cbt " + (X.g ? "gauche" : "droite") + (X.login === moi ? " moi" : "") },
      el("div", { class: "jauge" },
        el("div", { class: "jauge-tete" }, el("b", { class: "jauge-nom", texte: X.nom }), X.login === moi ? el("span", { class: "toi", texte: "Toi" }) : null,
          X.puissance ? el("span", { class: "jauge-puissance num", texte: "Puissance " + fmt(X.puissance) }) : null),
        barre, el("div", { class: "jauge-pied" }, pvTxt, statuts)),
      el("div", { class: "corps" }, socle, el("div", { class: "main-cartes" }, sArme, sArmure, sOff, deck)));
    X.dom = { racine, barre, plein, fantome, bouclier, erosion, pvTxt, statuts, portrait, vis, blessures, socle, sArme, sArmure, sOff, deck, pips, cd, pipsOff, cdOff };
  }
  initialiser(F.attaquant); initialiser(F.defenseur);
  construire(G); construire(D);
  const scene = el("div", { class: "scene-arene" }, G.dom.racine,
    el("div", { class: "centre" }, el("div", { class: "tour" }, el("span", { texte: "Tour" }), numTour),
      el("span", { class: "vs-centre", "aria-hidden": "true", texte: "VS" })), D.dom.racine, annonceur);

  let vitesse = 1, enPause = false, jeton = 0, prochain = 0, fini = false;
  const bPause = el("button", { type: "button", class: "bouton-icone", "aria-label": "Pause", title: "Pause (espace)", onclick: () => basculerPause() }, picto("pause"));
  const vitesses = el("div", { class: "onglets-b vitesses", role: "group", "aria-label": "Vitesse" },
    [1, 2, 4].map((v) => el("button", { type: "button", "aria-pressed": String(v === 1), texte: v + "×", "aria-label": "Vitesse " + v + " fois", onclick: () => regler(v) })));
  const bPasser = el("button", { type: "button", class: "btn-second passer", onclick: () => passer() }, picto("fin"), "Passer");
  const bSon = el("button", { type: "button", class: "bouton-icone son", "aria-label": "Son", "aria-pressed": String(App.sons.actif), title: "Son",
    onclick: () => { App.sons.actif = !App.sons.actif; bSon.setAttribute("aria-pressed", String(App.sons.actif)); if (window.SFX) { SFX.actif = App.sons.actif; if (App.sons.actif) SFX.demarrer(); } } }, icone("i-son"));
  const bMusique = el("button", { type: "button", class: "bouton-icone musique", "aria-label": "Musique", "aria-pressed": String(prefMusique.get()), title: "Musique",
    onclick: () => { const v = !prefMusique.get(); prefMusique.set(v); bMusique.setAttribute("aria-pressed", String(v)); if (window.SFX) SFX.musique.coupee = !v; } }, picto("musique"));
  const bPlein = document.fullscreenEnabled ? el("button", { type: "button", class: "bouton-icone", "aria-label": "Plein écran", title: "Plein écran", onclick: () => pleinEcran() }, picto("plein")) : null;
  const retour = opts.bac ? ["recette.html", "Retour à la recette"] : opts.mode === "ligue" ? ["ligue.html", "Retour à la ligue"] : opts.mode === "tour" ? ["tour.html", "Retour à la Tour"] : opts.mode === "arene" ? ["arene.html", "Retour à l'Arène"] : ["duels.html", "Retour aux duels"];
  const commandes = el("div", { class: "commandes-arene" },
    el("div", { class: "cmd-lecture" }, bPause, vitesses, bPasser), log,
    el("div", { class: "cmd-outils" }, bSon, bMusique, bPlein, el("a", { class: "btn-second retour", href: retour[0], "aria-label": retour[1] }, picto("retour"), el("span", { texte: retour[1] }))));
  const racine = el("section", { class: "arene", "aria-label": `Combat : ${F.attaquant.nom} contre ${F.defenseur.nom}`, style: { "--vit": String(TEMPO) } }, scene, fx, commandes);
  // Fil du combat, sous l'arène : une ligne par tour, ajoutée au moment où le tour se joue.
  const feed = el("ol", { class: "feed", "aria-label": "Déroulé du combat" });
  const blocFeed = el("section", { class: "bloc-feed", hidden: true }, el("h2", { class: "feed-titre" }, el("span", { texte: "Déroulé du combat" })), feed);
  main.replaceChildren(racine, blocFeed);
  const lignes = rounds.map((r) => App.decrireTour(r, R, nomDe));
  let feedN = 0;
  function ajouterFeed(i) {
    for (; feedN <= i && feedN < n; feedN++) {
      const r = rounds[feedN], A = r.frappeur ? de(r.frappeur) : null;
      const li = el("li", { class: A ? (A.g ? "g" : "d") : "neutre" }, el("span", { class: "no-tour num", texte: "T" + (r.tour ?? r.round ?? feedN + 1) }),
        el("span", { class: "lignes-tour" }, lignes[feedN].map((x) => el("span", { class: "evt " + x.genre, texte: x.texte }))));
      feed.querySelectorAll("[aria-current]").forEach((x) => x.removeAttribute("aria-current"));
      li.setAttribute("aria-current", "step");
      feed.prepend(li); // le plus récent en haut, juste sous l'arène
    }
    blocFeed.hidden = false;
    feed.scrollTop = 0;
  }
  rendreTout(false);
  document.addEventListener("keydown", function clavier(e) {
    if (!racine.isConnected) { document.removeEventListener("keydown", clavier); return; }
    if (e.key === " " && !e.target.closest("button, a, input, select, textarea")) { e.preventDefault(); basculerPause(); }
  });

  // -------------------------------------------------------------- Rendu de l'état
  function rendreTout(anime) { rendre(F.attaquant, anime); rendre(F.defenseur, anime); }
  function rendre(X, anime) {
    const d = X.dom;
    const base = X.pvMax0;
    d.plein.style.transform = `scaleX(${Math.max(0, Math.min(1, X.pvVis / base))})`;
    d.fantome.style.transform = `scaleX(${Math.max(0, Math.min(1, X.pvVis / base))})`;
    d.erosion.style.transform = `scaleX(${Math.max(0, 1 - X.pvMax / base)})`;
    d.bouclier.style.transform = `scaleX(${Math.min(1, X.shield / base)})`;
    const ratio = X.pvVis / Math.max(1, X.pvMax);
    d.barre.dataset.niveau = ratio <= 0.25 ? "bas" : ratio <= 0.5 ? "moyen" : "haut";
    d.barre.setAttribute("aria-valuenow", String(Math.max(0, X.pvVis)));
    d.barre.setAttribute("aria-label", `${X.nom} : ${fmt(Math.max(0, X.pvVis))} PV sur ${fmt(X.pvMax)}`);
    d.pvTxt.replaceChildren(el("b", { texte: fmt(Math.max(0, X.pvVis)) }), " / " + fmt(X.pvMax), X.shield > 0 ? el("span", { class: "pv-bouclier", texte: " +" + fmt(X.shield) }) : "");
    d.statuts.replaceChildren(...statuts(X));
    // Visage qui se dégrade
    const deg = X.ko ? 5 : ratio <= 0.1 ? 4 : ratio <= 0.25 ? 3 : ratio <= 0.5 ? 2 : ratio <= 0.75 ? 1 : 0;
    d.portrait.dataset.degats = String(deg);
    const r = X.r || {}, s = X.c;
    d.portrait.dataset.dot = r["brulure_duree_" + s] > 0 ? "brulure" : r["poison_duree_" + s] > 0 ? "poison" : X.saignement > 0 ? "saignement" : r["paralysie_duree_" + s] > 0 ? "paralysie" : "";
    // Auras d'état : une animation par effet tant qu'il dure, une gerbe quand il apparaît.
    const e = X.ko ? {} : etatsDe(X);
    for (const k of AURAS) {
      d.socle.classList.toggle("a-" + k, !!e[k]);
      if (anime && e[k] && !X.etats[k]) vient(X, k);
    }
    X.etats = e;
    d.socle.style.setProperty("--sang", (Math.min(1, X.saignement / SEUIL_SAIGNEMENT)).toFixed(2));
    if (anime && X.brisBouclier) bouclierBrise(X);
    X.brisBouclier = false;
    d.sArmure.classList.toggle("protege", X.shield > 0);
    // Arme : forme 2
    d.sArme.classList.toggle("forme-2", X.stance2);
    const img = d.sArme.querySelector(".carte-art img");
    if (img && X.image2) { const voulu = App.image(X.stance2 ? X.image2 : X.imageBase); if (img.getAttribute("src") !== voulu) img.setAttribute("src", voulu); }
    // Pioche de stratagème
    rendreDeck(X);
  }
  // Une pile = une carte à charges (stratagème, ou main gauche à utilisations) : pastilles, recharge, épuisement.
  function rendrePile(pile, pips, cd, restant, max, attente) {
    pile.classList.toggle("epuise", restant <= 0);
    pips.replaceChildren(...(max ? Array.from({ length: Math.min(6, max) }, (_, i) => el("i", { class: i < restant ? "plein" : null })) : []));
    pips.setAttribute("aria-label", max ? `${restant} utilisation${restant > 1 ? "s" : ""} restante${restant > 1 ? "s" : ""} sur ${max}` : "");
    const enCd = attente > 1 && restant > 0;
    cd.textContent = enCd ? String(attente - 1) : "";
    pile.classList.toggle("recharge", enCd);
  }
  function rendreDeck(X) {
    const d = X.dom;
    if (X.it.strategeme) rendrePile(d.deck, d.pips, d.cd, X.usages == null ? 1 : X.usages, X.usagesMax, X.cd);
    if (X.offUsagesMax) rendrePile(d.sOff, d.pipsOff, d.cdOff, X.offUsages == null ? X.offUsagesMax : X.offUsages, X.offUsagesMax, X.offCd);
  }
  function etatsDe(X) {
    const r = X.r || {}, s = X.c;
    return { poison: r["poison_duree_" + s] > 0, feu: r["brulure_duree_" + s] > 0, sang: X.saignement > 0, elec: r["paralysie_duree_" + s] > 0, stun: X.etourdi,
      marque: !!r["marque_active_" + s], antisoin: !!r["anti_heal_actif_" + s], brise: !!r["brise_def_actif_" + s],
      rage: r["frenesie_bonus_" + s] > 0 || X.rage > 0, envol: r["esquive_parade_buff_" + s] > 0, bouclier: X.shield > 0, souffle: X.souffle && !X.souffleUtilise };
  }
  // Apparition d'un état : l'aura entre en scène (classe vient-*) ; poison, paralysie et étourdissement ont déjà leur gerbe dans apres().
  function vient(X, k) {
    const s = X.dom.socle, p = pos(X.dom.portrait);
    s.classList.remove("vient-" + k); void s.offsetWidth; s.classList.add("vient-" + k);
    setTimeout(() => s.classList.remove("vient-" + k), 1000);
    if (k === "feu") { particules(p.x, p.y + p.h * 0.3, 18, "braise", p.w * 0.6, 900, -90); onde(p.x, p.y, "feu", 2, 560); son("brulure", { pan: X.pan }); }
    else if (k === "antisoin") bouffee(X, "antisoin", 4);
    else if (k === "marque") onde(p.x, p.y, "marque", 1.5, 520);
    else if (k === "rage") { onde(p.x, p.y, "rage", 1.8, 520); particules(p.x, p.y, 10, "etincelle rouge", p.w * 0.7, 700, -40); }
    else if (k === "envol") particules(p.x, p.y, 10, "plume", p.w * 0.8, 900, -60);
  }
  function statuts(X) {
    const r = X.r || {}, s = X.c, l = [];
    if (X.ko) return l;
    const k = (v, t, c) => { if (v) l.push(el("span", { class: "statut " + c, texte: t })); };
    k(r["poison_duree_" + s] > 0, "Poison " + r["poison_duree_" + s], "poison");
    k(r["brulure_duree_" + s] > 0, "Brûlure " + r["brulure_duree_" + s], "brulure");
    k(X.saignement > 0, `Saignement ${X.saignement}/${SEUIL_SAIGNEMENT}`, "saignement");
    k(r["paralysie_duree_" + s] > 0, "Paralysie " + r["paralysie_duree_" + s], "paralysie");
    k(X.etourdi, "Étourdi", "etourdi");
    k(r["marque_active_" + s], "Marqué", "marque");
    k(r["anti_heal_actif_" + s], "Anti-soin", "antisoin");
    k(r["brise_def_actif_" + s], "Défense brisée", "brise");
    k(r["frenesie_bonus_" + s] > 0, "Frénésie +" + r["frenesie_bonus_" + s], "frenesie");
    k(r["esquive_parade_buff_" + s] > 0, "Envol +" + r["esquive_parade_buff_" + s] + " %", "envol");
    k(X.rage > 0, "Rage +" + X.rage + " %", "rage");
    k(X.souffle && !X.souffleUtilise && !X.ko, "Dernier souffle", "souffle");
    return l;
  }

  // -------------------------------------------------------------- Temps
  // Vitesse réelle = choix du joueur × tempo de base.
  const rythme = () => vitesse * TEMPO;
  function appliquerRythme() {
    const v = rythme();
    racine.style.setProperty("--vit", String(v));
    racine.getAnimations({ subtree: true }).forEach((a) => { if (a instanceof CSSAnimation || a instanceof CSSTransition) return; try { a.updatePlaybackRate(v); } catch (e) { a.playbackRate = v; } });
  }
  function regler(v) {
    vitesse = v;
    vitesses.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.textContent === v + "×")));
    appliquerRythme();
  }
  function basculerPause(force) {
    if (fini) return;
    enPause = force ?? !enPause;
    racine.classList.toggle("en-pause", enPause);
    if (window.SFX) SFX.suspendre(enPause);
    racine.getAnimations({ subtree: true }).forEach((a) => (enPause ? a.pause() : a.play()));
    bPause.replaceChildren(picto(enPause ? "lecture" : "pause"));
    bPause.setAttribute("aria-label", enPause ? "Reprendre" : "Pause");
  }
  function dormir(ms) {
    const j = jeton;
    return new Promise((ok, ko) => {
      let reste = ms, prec = performance.now();
      const f = (t) => {
        if (j !== jeton) return ko(ARRET);
        if (!enPause && t >= gelJusqua) reste -= (t - prec) * rythme();
        prec = t;
        if (reste <= 0) ok(); else requestAnimationFrame(f);
      };
      requestAnimationFrame(f);
    });
  }
  function anime(e, kf, d, o = {}) {
    const a = e.animate(kf, { duration: d, easing: o.ease || "cubic-bezier(.16,1,.3,1)", fill: o.fill || "forwards", delay: o.retard || 0, iterations: o.iter || 1 });
    a.playbackRate = rythme();
    if (enPause) a.pause();
    if (o.retirer) a.finished.then(() => e.remove(), () => e.remove());
    return a;
  }
  function fin(a) { const j = jeton; return a.finished.then(() => { if (j !== jeton) throw ARRET; }, () => { throw ARRET; }); }
  // Arrêt sur image (hitstop) : tout se fige un instant au moment de l'impact, comme dans un jeu de combat.
  let gelJusqua = 0;
  function geler(ms) {
    if (App.reduit || enPause) return;
    gelJusqua = performance.now() + ms;
    const figees = racine.getAnimations({ subtree: true }).filter((a) => a.playState === "running" && !(a instanceof CSSAnimation));
    figees.forEach((a) => a.pause());
    setTimeout(() => { if (!enPause) figees.forEach((a) => { try { a.play(); } catch (e) {} }); }, ms);
  }
  // Coup de zoom de caméra (propriété scale : ne gêne pas les secousses, qui animent transform).
  function zoom(force = 0.03, d = 420) { if (!App.reduit) anime(scene, [{ scale: "1" }, { scale: String(1 + force), offset: 0.22 }, { scale: "1" }], d, { fill: "none", ease: "cubic-bezier(.2,.7,.3,1)" }); }

  // -------------------------------------------------------------- Géométrie
  function pos(elem) {
    const a = racine.getBoundingClientRect(), b = elem.getBoundingClientRect();
    return { x: b.left - a.left + b.width / 2, y: b.top - a.top + b.height / 2, w: b.width, h: b.height };
  }
  const T = (x, y, extra = "") => `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%) ${extra}`;
  function point(cls, x, y, style) { const e = el("div", { class: "f " + cls, style }); e.style.transform = T(x, y); fx.append(e); return e; }
  const angle = (a, b) => (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;

  // -------------------------------------------------------------- Effets de base
  function nombre(X, texte, genre = "", k = 0, total = 1) {
    const p = pos(X.dom.portrait);
    const dx = total > 1 ? (k - (total - 1) / 2) * Math.min(34, p.w / total) : hasard(-18, 18);
    const e = point("nombre " + genre, p.x + dx, p.y - p.h * 0.12, {});
    e.textContent = texte;
    if (App.reduit) { anime(e, [{ opacity: 0 }, { opacity: 1, offset: 0.15 }, { opacity: 1, offset: 0.7 }, { opacity: 0 }], 1300, { retirer: true, ease: "linear" }); return; }
    const gros = /crit|gros/.test(genre) ? 1.35 : 1;
    const y0 = p.y - p.h * 0.12, x0 = p.x + dx;
    anime(e, [
      { transform: T(x0, y0 + 16, "scale(.4)"), opacity: 0 },
      { transform: T(x0, y0 - 8, `scale(${1.25 * gros})`), opacity: 1, offset: 0.14 },
      { transform: T(x0, y0 - 18, `scale(${gros})`), opacity: 1, offset: 0.3 },
      { transform: T(x0 + dx * 0.3, y0 - 70, `scale(${0.92 * gros})`), opacity: 0 },
    ], genre.includes("etat") ? 1400 : 1150, { retirer: true, ease: "cubic-bezier(.2,.8,.3,1)" });
  }
  function secouer(elem, force = 6, d = 320) {
    if (App.reduit) return;
    anime(elem, [0, -1, 0.8, -0.6, 0.4, 0].map((k, i) => ({ transform: `translate(${(k * force).toFixed(1)}px, ${(i % 2 ? force * 0.4 : -force * 0.3).toFixed(1)}px)` })), d, { fill: "none", ease: "linear" });
  }
  function frappe(X, fort = false) {
    const pt = X.dom.portrait;
    pt.classList.remove("touche"); void pt.offsetWidth; pt.classList.add("touche");
    secouer(pt, fort ? 9 : 5);
    if (fort) secouer(scene, 7, 380);
  }
  function blesse(X, v) { X.pvVis = Math.max(0, X.pvVis - v); rendre(X, false); }
  function soigne(X, v) { X.pvVis = Math.min(X.pvMax, X.pvVis + v); rendre(X, false); }
  function briller(X, k) {
    const s = k === "strategeme" ? X.dom.deck : X.dom["s" + { arme: "Arme", armure: "Armure", offhand: "Off" }[k]];
    if (!s) return;
    s.classList.remove("brille"); void s.offsetWidth; s.classList.add("brille");
  }
  function annonce(texte, genre = "") {
    const e = el("div", { class: "annonce-txt " + genre, texte });
    annonceur.replaceChildren(e);
    if (App.reduit) { anime(e, [{ opacity: 0 }, { opacity: 1, offset: 0.1 }, { opacity: 1, offset: 0.8 }, { opacity: 0 }], 1500, { retirer: true, ease: "linear" }); return; }
    anime(e, [{ transform: "scale(1.6)", opacity: 0 }, { transform: "scale(1)", opacity: 1, offset: 0.12 }, { transform: "scale(1)", opacity: 1, offset: 0.8 }, { transform: "scale(.96)", opacity: 0 }], 1500, { retirer: true });
  }
  function particules(x, y, nb, cls, portee = 60, d = 700, gravite = 0) {
    if (App.reduit) return;
    for (let i = 0; i < nb; i++) {
      const a = Math.random() * Math.PI * 2, r = hasard(portee * 0.4, portee);
      const e = point("particule " + cls, x, y, {});
      anime(e, [{ transform: T(x, y, "scale(1)"), opacity: 1 }, { transform: T(x + Math.cos(a) * r, y + Math.sin(a) * r + gravite, `scale(${hasard(0.2, 0.6).toFixed(2)}) rotate(${hasard(-180, 180).toFixed(0)}deg)`), opacity: 0 }],
        d * hasard(0.7, 1.2), { retirer: true, ease: "cubic-bezier(.2,.7,.3,1)" });
    }
  }
  function onde(x, y, cls = "", taille = 2.4, d = 520) {
    if (App.reduit) return;
    const e = point("onde " + cls, x, y, {});
    anime(e, [{ transform: T(x, y, "scale(.15)"), opacity: 0.95 }, { transform: T(x, y, `scale(${taille})`), opacity: 0 }], d, { retirer: true, ease: "cubic-bezier(.1,.7,.3,1)" });
  }
  function eclatBlanc(X) { const e = X.dom.portrait.querySelector(".eclair-blanc"); anime(e, [{ opacity: 0.85 }, { opacity: 0 }], 260, { fill: "none", ease: "linear" }); }
  function flashArene(cls = "", d = 380) { const e = point("flash-arene " + cls, 0, 0, {}); e.style.transform = "none"; anime(e, [{ opacity: App.reduit ? 0.25 : 0.7 }, { opacity: 0 }], d, { retirer: true, ease: "linear" }); }

  // -------------------------------------------------------------- Attaques
  const MELEE = new Set(["slash", "smash", "poing", "slash_energy"]);
  async function elan(A, C, style) {
    if (App.reduit) return;
    const a = pos(A.dom.portrait), c = pos(C.dom.portrait);
    const dx = (c.x - a.x) * (style === "smash" ? 0.42 : 0.3), dy = (c.y - a.y) * (style === "smash" ? 0.42 : 0.3);
    const kf = style === "smash"
      ? [{ transform: "none" }, { transform: `translate(${-dx * 0.18}px, ${-dy * 0.18}px) rotate(${A.g ? -4 : 4}deg)`, offset: 0.4 }, { transform: `translate(${dx}px, ${dy}px) rotate(${A.g ? 5 : -5}deg) scale(1.06)`, offset: 0.62 }, { transform: "none" }]
      : [{ transform: "none" }, { transform: `translate(${dx}px, ${dy}px) scale(1.05)`, offset: 0.45 }, { transform: "none" }];
    anime(A.dom.portrait.parentElement, kf, style === "smash" ? 620 : 460, { fill: "none", ease: "cubic-bezier(.3,.6,.3,1)" });
    await dormir(style === "smash" ? 360 : 190);
  }
  function entaille(C, crit, energie) {
    if (App.reduit) return;
    const c = pos(C.dom.portrait), rot = hasard(-40, -18) * (C.g ? -1 : 1);
    const e = point("entaille" + (crit ? " crit" : "") + (energie ? " energie" : ""), c.x, c.y, { width: c.w * 1.5 + "px", height: c.w * 0.5 + "px" });
    anime(e, [{ transform: T(c.x, c.y, `rotate(${rot}deg) scaleX(.1)`), opacity: 0 }, { transform: T(c.x, c.y, `rotate(${rot + 8}deg) scaleX(1)`), opacity: 1, offset: 0.35 }, { transform: T(c.x, c.y, `rotate(${rot + 12}deg) scaleX(1.08)`), opacity: 0 }], 420, { retirer: true });
    particules(c.x, c.y, crit ? 14 : 8, crit ? "etincelle or" : "etincelle", 70, 520);
  }
  function impactLourd(C, crit) {
    const c = pos(C.dom.portrait);
    onde(c.x, c.y + c.h * 0.3, "sol", 3, 600); onde(c.x, c.y, crit ? "or" : "", 2.2, 480);
    particules(c.x, c.y + c.h * 0.35, 12, "poussiere", 80, 800, 20);
    secouer(scene, crit ? 12 : 8, 420);
  }
  // Un projectile de A vers C ; renvoie une promesse résolue à l'arrivée.
  async function projectile(A, C, cls, d = 180, decal = 0, arc = 0) {
    const a = pos(A.dom.portrait), c = pos(C.dom.portrait);
    const x0 = a.x + (c.x - a.x) * 0.18, y0 = a.y + (c.y - a.y) * 0.18 + decal * 0.4;
    const x1 = c.x + hasard(-c.w * 0.18, c.w * 0.18), y1 = c.y + hasard(-c.h * 0.18, c.h * 0.18) + decal;
    if (App.reduit) return { x: x1, y: y1 };
    const ang = angle({ x: x0, y: y0 }, { x: x1, y: y1 });
    const e = point("projectile " + cls, x0, y0, {});
    const tourne = cls.includes("shuriken") ? 720 : 0;
    const mid = { x: (x0 + x1) / 2, y: (y0 + y1) / 2 - arc };
    const a2 = anime(e, [
      { transform: T(x0, y0, `rotate(${ang}deg) scaleX(.4)`), opacity: 0 },
      { transform: T(x0, y0, `rotate(${ang}deg) scaleX(1)`), opacity: 1, offset: 0.1 },
      { transform: T(mid.x, mid.y, `rotate(${ang + tourne / 2}deg)`), opacity: 1, offset: 0.55 },
      { transform: T(x1, y1, `rotate(${ang + tourne}deg)`), opacity: 1 },
    ], d, { retirer: true, ease: "linear" });
    await fin(a2);
    return { x: x1, y: y1 };
  }
  function eclairBouche(A, C, gros) {
    if (App.reduit) return;
    const a = pos(A.dom.portrait), c = pos(C.dom.portrait);
    const x = a.x + (c.x - a.x) * 0.2, y = a.y + (c.y - a.y) * 0.2;
    const e = point("bouche" + (gros ? " gros" : ""), x, y, {});
    anime(e, [{ transform: T(x, y, `rotate(${angle(a, c)}deg) scale(.3)`), opacity: 1 }, { transform: T(x, y, `rotate(${angle(a, c)}deg) scale(1.2)`), opacity: 0 }], 160, { retirer: true, ease: "linear" });
    anime(A.dom.portrait.parentElement, [{ transform: "none" }, { transform: `translate(${(a.x - c.x) * 0.03}px, ${(a.y - c.y) * 0.03}px)` }, { transform: "none" }], 180, { fill: "none" });
  }

  // Résolution d'un coup (arme ou stratagème). style : slash|smash|poing|tir|explosion|bombardement ; profil visuel du stratagème le cas échéant.
  async function coup(r, A, C, style, strat) {
    const balles = r.degats_par_balle && r.degats_par_balle.length ? r.degats_par_balle : [r.degats || 0];
    const crits = r.crit_par_balle && r.crit_par_balle.length ? r.crit_par_balle : [!!r.crit];
    const rate = !r.touche && !r.parade_reussie;
    const nb = balles.length;
    const profil = strat ? A.profilStrat : A.profil;
    const sonsFichiers = r.sons_override || (strat ? A.sonsStrat : A.sons);
    // Marque laissée sur le portrait : coupure, contusion, impact de balle ou brûlure selon l'arme.
    const marque = strat ? (profil === "gaz" ? null : profil === "shuriken" ? "entaille" : "brulure")
      : /slash/.test(style) ? "entaille" : style === "smash" || style === "poing" ? "contusion" : style === "tir" ? "impact" : "brulure";
    const toucher = (k, x, y, lourd) => {
      const crit = !!crits[k];
      if (rate) return;
      if (r.parade_reussie) return;
      frappe(C, crit || lourd);
      eclatBlanc(C);
      if (marque) blessure(C, marque, crit || lourd);
      nombre(C, (crit ? "−" : "−") + balles[k], crit ? "crit" : "", k, nb);
      if (crit) { son("crit", { pan: C.pan }); flashArene("or", 260); particules(x, y, 10, "etincelle or", 90, 600); geler(nb > 1 ? 45 : 95); zoom(0.04); }
      else if (lourd || Number(balles[k]) >= C.pvMax0 * 0.2) zoom(0.022);
      else if (nb > 1) son(style === "tir" && /arc/.test(profil) ? "impact_fleche" : "impact_balle", { pan: C.pan });
    };
    const esquive = () => {
      nombre(C, "ESQUIVE", "etat rate");
      son("esquive", { pan: C.pan });
      if (!App.reduit) anime(C.dom.portrait.parentElement, [{ transform: "none" }, { transform: `translate(${C.g ? -26 : 26}px, -8px) rotate(${C.g ? -6 : 6}deg)`, offset: 0.4 }, { transform: "none" }], 520, { fill: "none" });
    };

    if (strat && ["missile", "eclair", "gaz", "feu", "bombardement", "hache", "shuriken"].includes(profil)) {
      await effetStrategeme(profil, A, C, r, balles, crits, toucher);
    } else if (MELEE.has(style) && !strat) {
      son(profil, { pan: A.pan, fichiers: sonsFichiers });
      await elan(A, C, style);
      if (!rate && !r.parade_reussie) {
        if (style === "smash") impactLourd(C, crits[0]); else if (style === "poing") onde(pos(C.dom.portrait).x, pos(C.dom.portrait).y, "", 1.4, 360);
        else entaille(C, crits[0], /energie/.test(profil));
        toucher(0, pos(C.dom.portrait).x, pos(C.dom.portrait).y, style === "smash");
        son("impact", { pan: C.pan, vol: 0.7 });
      }
    } else {
      // Tir, explosion, bombardement : une salve, un projectile par balle.
      const arc = /arc/.test(profil) ? 40 : style === "bombardement" || style === "explosion" ? 70 : 0;
      const cls = /arc/.test(profil) ? "fleche" : /shuriken/.test(profil) ? "shuriken" : style === "bombardement" || style === "explosion" ? "obus" : "balle";
      const vol = /arc/.test(profil) ? 300 : cls === "obus" ? 360 : 150;
      const arrivees = [];
      for (let k = 0; k < nb; k++) {
        eclairBouche(A, C, /sniper|canon/.test(profil));
        son(profil, { pan: A.pan, fichiers: k === 0 ? sonsFichiers : "" });
        arrivees.push(projectile(A, C, cls + (crits[k] && !rate ? " crit" : ""), vol, rate ? (C.g ? -1 : 1) * 60 : 0, arc).then((p) => {
          if (cls === "obus" && !rate) { onde(p.x, p.y, "feu", 1.8, 420); particules(p.x, p.y, 8, "braise", 60, 600); son("explosion_petite", { pan: C.pan }); secouer(scene, 5, 260); }
          else if (!rate) particules(p.x, p.y, crits[k] ? 8 : 4, crits[k] ? "etincelle or" : "etincelle", 40, 360);
          toucher(k, p.x, p.y, cls === "obus");
        }));
        await dormir(nb > 3 ? 85 : 120);
      }
      await Promise.all(arrivees);
    }
    if (nb >= 3 && !rate && !r.parade_reussie) nombre(C, nb + " coups !", "etat combo");
    if (rate) esquive();
    if (r.parade_reussie) await parade(r, A, C);
    if (r.bloque && !rate) { nombre(C, "BLOQUÉ", "etat bloque"); son("bloque", { pan: C.pan }); briller(C, C.it.offhand ? "offhand" : "armure"); }
    if (!rate && !r.parade_reussie) {
      blesse(C, Number(r.degats) || balles.reduce((s, v) => s + (Number(v) || 0), 0));
      if (!nb || nb === 1) son("impact", { pan: C.pan, vol: 0.5 });
    }
  }

  async function parade(r, A, C) {
    const c = pos(C.dom.portrait);
    nombre(C, "PARADE", "etat parade");
    son("parade", { pan: C.pan, fichiers: r.sons_parade });
    briller(C, C.it.offhand ? "offhand" : "arme");
    onde(c.x, c.y, "acier", 1.6, 380); particules(c.x, c.y, 14, "etincelle", 70, 500);
    await dormir(380);
    son("riposte", { pan: C.pan, fichiers: r.sons_riposte });
    await elan(C, A, "slash");
    entaille(A, false, false);
    frappe(A);
    blessure(A, "entaille", false);
    if (r.degats_ripostee > 0) { nombre(A, "−" + r.degats_ripostee, "riposte"); blesse(A, r.degats_ripostee); }
  }

  // -------------------------------------------------------------- Stratagèmes
  // La carte quitte son emplacement face visible, s'envole au centre de l'arène et s'y illumine.
  async function tirer(X, quoi = "strategeme") {
    const pile = quoi === "offhand" ? X.dom.sOff : X.dom.deck, it = X.it[quoi];
    const src = pile.querySelector(".carte") || pile, d = pos(src);
    const w = Math.max(40, d.w), zone = pos(scene);
    const grand = Math.min(zone.w * 0.3, zone.h * 0.5 * (5 / 7), 210), echelle = grand / w;
    const cible = { x: zone.x, y: zone.y - zone.h * 0.02 };
    const carte = el("div", { class: "f carte-vol", style: { width: w + "px" } }, el("div", { class: "cv-face" }, App.carte(it.o, { niveau: it.niveau, equipe: false })));
    carte._pile = pile;
    carte.style.transform = T(d.x, d.y);
    fx.append(carte);
    pile.classList.add("en-vol");
    son("carte", { pan: X.pan });
    briller(X, quoi);
    const penche = X.g ? -10 : 10, haut = T(d.x, d.y - 30, `scale(1.15) rotate(${penche}deg)`);
    if (App.reduit) await fin(anime(carte, [{ opacity: 0, transform: T(cible.x, cible.y, `scale(${echelle})`) }, { opacity: 1, transform: T(cible.x, cible.y, `scale(${echelle})`) }], 250));
    else {
      const mi = { x: (d.x + cible.x) / 2, y: Math.min(d.y, cible.y) - zone.h * 0.14 };
      await fin(anime(carte, [{ transform: T(d.x, d.y, "scale(1)") }, { transform: haut }], 260, { ease: "cubic-bezier(.3,.7,.3,1)" }));
      son("carte", { pan: 0, vol: 0.6 });
      await fin(anime(carte, [{ transform: haut }, { transform: T(mi.x, mi.y, `scale(${(1 + echelle) / 2}) rotate(${-penche * 0.6}deg)`), offset: 0.55 },
        { transform: T(cible.x, cible.y, `scale(${echelle * 1.08})`), offset: 0.85 }, { transform: T(cible.x, cible.y, `scale(${echelle})`) }], 540, { ease: "cubic-bezier(.25,.8,.3,1)" }));
      onde(cible.x, cible.y, "or", 2.4, 560); particules(cible.x, cible.y, 16, "etincelle or", grand * 0.75, 760);
    }
    carte._t = T(cible.x, cible.y, `scale(${echelle})`);
    carte.classList.add("active");
    annonce(it.o.nom, "strat");
    await dormir(520);
    return carte;
  }
  async function ranger(X, carte, derniere) {
    if (!carte) return;
    carte.classList.remove("active");
    if (derniere) { await bruler(X, carte); return; }
    const pile = carte._pile || X.dom.deck;
    const src = pile.querySelector(".carte") || pile, d = pos(src);
    son("carte_retour", { pan: X.pan });
    if (App.reduit) await fin(anime(carte, [{ opacity: 1 }, { opacity: 0 }], 250));
    else await fin(anime(carte, [{ transform: carte._t }, { transform: T(d.x, d.y, "scale(1)"), opacity: 0.9 }], 440, { ease: "cubic-bezier(.5,0,.7,.4)" }));
    carte.remove();
    pile.classList.remove("en-vol");
  }
  async function bruler(X, carte) {
    const p = pos(carte);
    carte.classList.add("brule");
    annonce("Dernière utilisation", "brule");
    son("carte_brule", { pan: 0 });
    if (!App.reduit) {
      for (let i = 0; i < 26; i++) {
        const x = p.x + hasard(-p.w / 2, p.w / 2), y = p.y + hasard(-p.h / 2, p.h / 2);
        const e = point("braise", x, y, {});
        anime(e, [{ transform: T(x, y, "scale(1)"), opacity: 0 }, { transform: T(x + hasard(-14, 14), y - hasard(10, 30), "scale(1)"), opacity: 1, offset: 0.25 }, { transform: T(x + hasard(-40, 40), y - hasard(60, 130), "scale(.3)"), opacity: 0 }],
          hasard(800, 1400), { retirer: true, retard: hasard(0, 700), ease: "ease-out" });
      }
    }
    await fin(anime(carte, [{ transform: carte._t, opacity: 1 }, { transform: carte._t, opacity: 1, offset: 0.75 }, { transform: carte._t.replace(/scale\(([^)]*)\)/, "scale($1) translateY(-6%)"), opacity: 0 }], 1500, { ease: "linear" }));
    carte.remove();
    (carte._pile || X.dom.deck).classList.remove("en-vol");
    (carte._pile || X.dom.deck).classList.add("epuise");
  }
  function reticule(C) {
    const c = pos(C.dom.portrait);
    const e = point("reticule", c.x, c.y, { width: c.w * 1.15 + "px", height: c.w * 1.15 + "px" });
    if (!App.reduit) anime(e, [{ transform: T(c.x, c.y, "scale(1.8) rotate(-90deg)"), opacity: 0 }, { transform: T(c.x, c.y, "scale(1) rotate(0deg)"), opacity: 1 }], 520);
    return e;
  }
  async function effetStrategeme(profil, A, C, r, balles, crits, toucher) {
    const c = pos(C.dom.portrait), z = pos(scene), rate = !r.touche && !r.parade_reussie;
    if (C.reticule) { C.reticule.classList.add("verrouille"); }
    if (profil === "eclair") {
      son("eclair", { pan: C.pan, fichiers: r.sons_override });
      if (!App.reduit) {
        const e = point("foudre", c.x, c.y - z.h, { height: z.h + "px" });
        e.innerHTML = '<svg viewBox="0 0 40 200" preserveAspectRatio="none"><polyline points="' + eclairPoints() + '"/></svg>';
        anime(e, [{ opacity: 0 }, { opacity: 1, offset: 0.08 }, { opacity: 0.3, offset: 0.2 }, { opacity: 1, offset: 0.3 }, { opacity: 0 }], 520, { retirer: true, ease: "linear" });
        e.style.transform = `translate(${c.x}px, ${c.y - z.h}px) translateX(-50%)`;
      }
      flashArene("blanc", 480);
      await dormir(120);
      onde(c.x, c.y, "electrique", 2.4, 520); particules(c.x, c.y, 14, "etincelle bleu", 90, 500);
      toucher(0, c.x, c.y, true);
      await dormir(300);
    } else if (profil === "gaz") {
      son("gaz", { pan: C.pan });
      if (!App.reduit) for (let i = 0; i < 7; i++) {
        const x = c.x + hasard(-c.w * 0.5, c.w * 0.5), y = c.y + hasard(-c.h * 0.4, c.h * 0.4);
        const e = point("nuage", x, y, {});
        anime(e, [{ transform: T(x, y, "scale(.2)"), opacity: 0 }, { transform: T(x, y, "scale(1)"), opacity: 0.8, offset: 0.35 }, { transform: T(x + hasard(-30, 30), y - 30, "scale(1.5)"), opacity: 0 }], 1400, { retirer: true, retard: i * 70 });
      }
      await dormir(450);
      if (r.degats) toucher(0, c.x, c.y, false);
      await dormir(250);
    } else if (profil === "feu") {
      son("feu", { pan: C.pan });
      const a = pos(A.dom.portrait);
      if (!App.reduit) for (let i = 0; i < 14; i++) {
        const e = point("flamme", a.x, a.y, {});
        const x1 = c.x + hasard(-c.w * 0.3, c.w * 0.3), y1 = c.y + hasard(-c.h * 0.3, c.h * 0.3);
        anime(e, [{ transform: T(a.x + (c.x - a.x) * 0.15, a.y + (c.y - a.y) * 0.15, "scale(.4)"), opacity: 0.2 }, { transform: T(x1, y1, `scale(${hasard(1.2, 2).toFixed(2)})`), opacity: 1, offset: 0.7 }, { transform: T(x1, y1 - 30, "scale(2.2)"), opacity: 0 }], 620, { retirer: true, retard: i * 38, ease: "ease-out" });
      }
      await dormir(420);
      toucher(0, c.x, c.y, true);
      await dormir(250);
    } else if (profil === "bombardement") {
      son("frappe_aerienne", { pan: 0 });
      if (!App.reduit) {
        const e = point("avion", 0, z.y - z.h * 0.46, {});
        const y = z.y - z.h * 0.46, sens = A.g ? 1 : -1;
        anime(e, [{ transform: T(sens > 0 ? -80 : z.w + 80, y, `scaleX(${sens})`) }, { transform: T(sens > 0 ? z.w + 80 : -80, y, `scaleX(${sens})`) }], 900, { retirer: true, ease: "linear" });
      }
      await dormir(420);
      for (let k = 0; k < balles.length; k++) {
        const x = c.x + hasard(-c.w * 0.55, c.w * 0.55), y = c.y + hasard(-c.h * 0.45, c.h * 0.45);
        onde(x, y, "feu", 1.6, 420); particules(x, y, 6, "braise", 55, 500);
        son("explosion_petite", { pan: C.pan + hasard(-0.2, 0.2) });
        secouer(scene, 5, 220);
        toucher(k, x, y, false);
        await dormir(110);
      }
      await dormir(200);
    } else if (profil === "shuriken") {
      const vols = [];
      for (let k = 0; k < balles.length; k++) { son("tir_shuriken", { pan: A.pan }); vols.push(projectile(A, C, "shuriken" + (crits[k] ? " crit" : ""), 260, rate ? 60 : 0, 30).then((p) => toucher(k, p.x, p.y, false))); await dormir(90); }
      await Promise.all(vols);
    } else if (profil === "hache") {
      son("hache_chargee", { pan: C.pan });
      const h = point("hache-vol", c.x, c.y - z.h * 0.6, {});
      if (!App.reduit) await fin(anime(h, [{ transform: T(c.x, c.y - z.h * 0.6, "rotate(0deg) scale(.6)"), opacity: 0 }, { transform: T(c.x, c.y, "rotate(900deg) scale(1)"), opacity: 1 }], 360, { ease: "cubic-bezier(.5,0,.9,.6)" }));
      h.remove();
      impactLourd(C, crits[0]); onde(c.x, c.y, "electrique", 2, 480);
      toucher(0, c.x, c.y, true);
      await dormir(250);
    } else {
      // Missile / frappe orbitale : ombre qui grossit, sifflement, chute, souffle.
      son("sifflement", { pan: C.pan });
      const ombre = point("ombre", c.x, c.y + c.h * 0.42, {});
      if (!App.reduit) anime(ombre, [{ transform: T(c.x, c.y + c.h * 0.42, "scale(.2)"), opacity: 0 }, { transform: T(c.x, c.y + c.h * 0.42, "scale(1.3)"), opacity: 0.8 }], 520, { ease: "ease-in" });
      if (!App.reduit) {
        const m = point("missile", c.x, c.y - z.h, {});
        await fin(anime(m, [{ transform: T(c.x + 30, c.y - z.h * 0.8, "rotate(8deg)") }, { transform: T(c.x, c.y, "rotate(0deg)") }], 520, { retirer: true, ease: "cubic-bezier(.6,0,1,.6)" }));
      } else await dormir(400);
      ombre.remove();
      son("explosion", { pan: C.pan });
      flashArene("feu", 360);
      const boule = point("boule-feu", c.x, c.y, {});
      if (!App.reduit) anime(boule, [{ transform: T(c.x, c.y, "scale(.2)"), opacity: 1 }, { transform: T(c.x, c.y, "scale(1.6)"), opacity: 0.9, offset: 0.4 }, { transform: T(c.x, c.y - 20, "scale(2.2)"), opacity: 0 }], 820, { retirer: true });
      else boule.remove();
      onde(c.x, c.y, "feu", 3.2, 600); particules(c.x, c.y, 18, "debris", 130, 900, 60); particules(c.x, c.y, 12, "braise", 90, 800);
      secouer(scene, 14, 480);
      toucher(0, c.x, c.y, true);
      await dormir(420);
    }
    if (C.reticule) { C.reticule.remove(); C.reticule = null; }
  }
  function eclairPoints() { const p = []; let x = 20; for (let y = 0; y <= 200; y += 16) { p.push(x.toFixed(1) + "," + y); x = Math.max(4, Math.min(36, x + hasard(-9, 9))); } p[p.length - 1] = "20,200"; return p.join(" "); }

  // -------------------------------------------------------------- États et dégâts indirects
  function dot(X, genre) {
    const p = pos(X.dom.portrait);
    const cls = { poison: "bulle", brulure: "braise", saignement: "goutte", fatigue: "poussiere" }[genre];
    particules(p.x, p.y + p.h * 0.1, genre === "saignement" ? 10 : 8, cls, p.w * 0.5, 800, genre === "brulure" ? -50 : genre === "poison" ? -30 : 40);
    X.dom.portrait.classList.remove("pulse-poison", "pulse-brulure", "pulse-saignement", "pulse-fatigue", "soigne", "dome"); void X.dom.portrait.offsetWidth; X.dom.portrait.classList.add("pulse-" + genre);
  }
  function etoiles(X) {
    if (App.reduit) return;
    const p = pos(X.dom.portrait);
    for (let i = 0; i < 4; i++) {
      const e = point("etoile-stun", p.x, p.y - p.h * 0.5, {});
      const a0 = (i / 4) * 360;
      anime(e, [{ transform: T(p.x, p.y - p.h * 0.5, `rotate(${a0}deg) translateX(${p.w * 0.36}px) scaleY(.5)`), opacity: 0 }, { transform: T(p.x, p.y - p.h * 0.5, `rotate(${a0 + 180}deg) translateX(${p.w * 0.36}px) scaleY(.5)`), opacity: 1, offset: 0.4 }, { transform: T(p.x, p.y - p.h * 0.5, `rotate(${a0 + 400}deg) translateX(${p.w * 0.36}px) scaleY(.5)`), opacity: 0 }], 1100, { retirer: true, ease: "linear" });
    }
  }
  function arcs(X, nb = 3) {
    if (App.reduit) return;
    const p = pos(X.dom.portrait);
    for (let i = 0; i < nb; i++) {
      const e = point("arc-elec", p.x + hasard(-p.w * 0.3, p.w * 0.3), p.y + hasard(-p.h * 0.3, p.h * 0.3), {});
      e.innerHTML = '<svg viewBox="0 0 60 20"><polyline points="0,10 10,3 18,15 28,5 36,16 46,4 60,10"/></svg>';
      anime(e, [{ opacity: 0 }, { opacity: 1, offset: 0.2 }, { opacity: 0.2, offset: 0.4 }, { opacity: 1, offset: 0.6 }, { opacity: 0 }], 420, { retirer: true, ease: "linear", retard: i * 90 });
      e.style.transform += ` rotate(${hasard(0, 180).toFixed(0)}deg)`;
    }
  }
  async function dernierSouffle(X) {
    const p = pos(X.dom.portrait);
    annonce("Dernier souffle !", "souffle");
    son("dernier_souffle", { pan: X.pan, fichiers: X.r && X.r["sons_dernier_souffle_" + X.c] });
    X.dom.portrait.classList.add("renait");
    onde(p.x, p.y, "or", 2.6, 900); onde(p.x, p.y, "or", 1.8, 700);
    particules(p.x, p.y, 16, "etincelle or", p.w * 0.8, 1100, -40);
    await dormir(900);
    X.dom.portrait.classList.remove("renait");
  }
  // Les blessures s'accumulent sur le portrait pendant tout le combat (les plus anciennes s'effacent au-delà de 18).
  function blessure(X, genre, gros) {
    const b = X.dom.blessures, e = el("i", { class: "bl bl-" + genre + (gros ? " gros" : "") });
    e.style.cssText = `--x:${hasard(16, 84).toFixed(1)}%;--y:${hasard(14, 86).toFixed(1)}%;--r:${hasard(-80, 80).toFixed(0)}deg;--s:${(gros ? hasard(1.15, 1.45) : hasard(0.75, 1.05)).toFixed(2)}`;
    b.append(e);
    if (genre !== "contusion" && genre !== "brulure" || gros) {
      const t = el("i", { class: "bl bl-sang" });
      t.style.cssText = `--x:${hasard(10, 90).toFixed(1)}%;--y:${hasard(10, 90).toFixed(1)}%;--r:${hasard(0, 360).toFixed(0)}deg;--s:${hasard(0.6, gros ? 1.4 : 1).toFixed(2)}`;
      b.append(t);
    }
    while (b.childElementCount > 18) b.firstElementChild.remove();
  }
  function explosionSaignement(X, v) {
    const p = pos(X.dom.portrait);
    annonce("Le saignement explose !", "sang");
    son("saignement_explosion", { pan: X.pan, fichiers: X.r && X.r["sons_explosion_saignement_" + X.c] });
    onde(p.x, p.y, "sang", 2.8, 620); particules(p.x, p.y, 22, "goutte", p.w * 0.9, 900, 70);
    frappe(X, true);
    blessure(X, "sang", true); blessure(X, "sang", true);
    nombre(X, "−" + v, "saignement gros");
    blesse(X, v);
  }
  function bouclierBrise(X) {
    const p = pos(X.dom.portrait);
    son("bouclier_casse", { pan: X.pan });
    nombre(X, "BOUCLIER BRISÉ", "etat bouclier");
    onde(p.x, p.y, "bouclier", 2, 480);
    particules(p.x, p.y, 22, "verre", p.w * 0.75, 800, 50);
  }
  // Nuage (poison, anti-soin) : bouffées qui gonflent autour du portrait.
  function bouffee(X, genre, nb = 4) {
    if (App.reduit) return;
    const p = pos(X.dom.portrait);
    for (let i = 0; i < nb; i++) {
      const a = (i / nb) * Math.PI * 2 + hasard(-0.4, 0.4), x = p.x + Math.cos(a) * p.w * 0.32, y = p.y + Math.sin(a) * p.h * 0.32;
      const e = point("nuage " + genre, x, y, {});
      anime(e, [{ transform: T(x, y, "scale(.25)"), opacity: 0 }, { transform: T(x, y, "scale(1)"), opacity: 0.85, offset: 0.3 }, { transform: T(x + Math.cos(a) * 30, y + Math.sin(a) * 20 - 26, "scale(1.6)"), opacity: 0 }], 1300, { retirer: true, retard: i * 60, ease: "ease-out" });
    }
    particules(p.x, p.y + p.h * 0.2, 8, genre === "poison" ? "bulle" : "bulle violet", p.w * 0.5, 900, -60);
  }
  // Décharge électrique : arcs tout autour, flash jaune, portrait qui tressaute.
  function foudroie(X, fort) {
    const p = pos(X.dom.portrait);
    arcs(X, fort ? 6 : 4);
    onde(p.x, p.y, "electrique", fort ? 2.2 : 1.6, 420);
    particules(p.x, p.y, fort ? 14 : 8, "etincelle jaune", p.w * 0.7, 520);
    if (fort) flashArene("elec", 300);
    X.dom.socle.classList.remove("electrocute"); void X.dom.socle.offsetWidth; X.dom.socle.classList.add("electrocute");
  }
  // Brûlure qui reprend : les flammes s'embrasent.
  function flambee(X) {
    const p = pos(X.dom.portrait);
    X.dom.socle.classList.remove("flambe"); void X.dom.socle.offsetWidth; X.dom.socle.classList.add("flambe");
    particules(p.x, p.y + p.h * 0.25, 14, "braise", p.w * 0.6, 1000, -110);
    onde(p.x, p.y + p.h * 0.1, "feu", 1.7, 480);
  }

  // -------------------------------------------------------------- Un tour
  async function tour(r, i) {
    numTour.textContent = String(r.tour ?? r.round ?? i + 1);
    log.textContent = lignes[i].map((x) => x.texte).join(" ");
    ajouterFeed(i);
    const A = r.frappeur ? de(r.frappeur) : null, C = A ? autre(A) : null;
    // Projecteur sur celui qui agit, et un temps pour que l'œil le suive.
    for (const X of [F.attaquant, F.defenseur]) X.dom.racine.classList.toggle("actif", X === A);
    if (A) await dormir(200);
    if (R.round_debut_fatigue > 0 && r.round === R.round_debut_fatigue) {
      racine.classList.add("fatigue"); annonce("La fatigue s'installe", "etat"); son("fatigue"); await dormir(700);
    }
    let tic = false;
    if (r.poison_tick && r.degats_poison) { const X = r.poison_tick_attaquant ? F.attaquant : F.defenseur; bouffee(X, "poison", 4); dot(X, "poison"); son("poison", { pan: X.pan }); nombre(X, "−" + r.degats_poison, "poison"); blesse(X, r.degats_poison); tic = true; }
    if (r.brulure_tick && r.degats_brulure) { const X = r.brulure_tick_attaquant ? F.attaquant : F.defenseur; flambee(X); dot(X, "brulure"); son("brulure", { pan: X.pan }); nombre(X, "−" + r.degats_brulure, "brulure"); blesse(X, r.degats_brulure); tic = true; }
    if (r.fatigue_tick && r.degats_fatigue) { for (const X of [F.attaquant, F.defenseur]) { dot(X, "fatigue"); nombre(X, "−" + r.degats_fatigue, "fatigue"); blesse(X, r.degats_fatigue); } son("fatigue"); tic = true; }
    if (tic) await dormir(560);
    if (!A) { await apres(r, null, null); return; }

    if (r.etourdi) { etoiles(A); son("etourdi", { pan: A.pan }); nombre(A, "ÉTOURDI", "etat stun"); await dormir(760); return; }
    if (r.paralysie) { foudroie(A, true); son("paralysie", { pan: A.pan, fichiers: r.sons_paralysie }); nombre(A, r.message_paralysie || "PARALYSÉ", "etat paralysie"); await dormir(760); await apres(r, A, C); return; }

    // Changement de forme de l'arme
    const img = r.arme_image_override;
    if (img && A.image2 && (img === A.image2) !== A.stance2) {
      A.stance2 = img === A.image2;
      const s = A.dom.sArme;
      son("stance", { pan: A.pan });
      if (!App.reduit) await fin(anime(s, [{ transform: "none" }, { transform: "scaleX(0)" }], 150, { fill: "none", ease: "ease-in" }));
      rendre(A, false);
      annonce(A.stance2 ? "Deuxième forme" : "Première forme", "strat");
      if (!App.reduit) await fin(anime(s, [{ transform: "scaleX(0)" }, { transform: "scaleX(1.08)", offset: 0.7 }, { transform: "none" }], 260, { fill: "none" }));
      briller(A, "arme");
      await dormir(250);
    }

    // Soins de début de tour (régénération d'armure, soin étalé de la main gauche).
    if (r.regen_montant !== undefined) {
      if (r.regen_montant > 0) {
        briller(A, (r.effets || []).includes("soin_continu") ? "offhand" : "armure");
        soinFx(A, r.regen_montant, r.regen_sons || r.soin_sons);
        await dormir(600);
      }
    } else if (r.soin_applique && r.soin_montant > 0 && !r.strategeme) { // replays d'avant le moteur 1.1
      briller(A, A.it.offhand && A.it.offhand.o.data.soinDirect ? "offhand" : "armure");
      soinFx(A, r.soin_montant, r.soin_sons);
      await dormir(600);
    }

    // Main gauche à charges : la carte sort, agit et retourne à sa place, comme un stratagème.
    if (r.offhand_action && A.it.offhand) {
      const epuisee = r["offhand_usages_" + A.c] === 0;
      const carte = await tirer(A, "offhand");
      if (r.offhand_soin) soinFx(A, r.soin_montant || 0, r.soin_sons);
      else {
        const X = r.offhand_sur_soi ? A : C, p = pos(X.dom.portrait), eff = r.effets || [];
        son(eff.includes("brulure") ? "feu" : eff.includes("poison") ? "gaz" : eff.includes("esquive_parade_buff") ? "bouclier" : "impact", { pan: X.pan, fichiers: r.sons_override });
        onde(p.x, p.y, eff.includes("brulure") ? "feu" : r.offhand_sur_soi ? "bouclier" : "", 1.5, 520);
        if (eff.includes("poison")) { bouffee(C, "poison", 6); dot(C, "poison"); }
        if (eff.includes("brulure")) { flambee(C); dot(C, "brulure"); }
        const mot = EFFETS_COURTS.filter(([k]) => eff.includes(k)).map(([, t]) => t).join(" · ");
        if (mot) nombre(X, mot, "etat");
      }
      await dormir(650);
      await ranger(A, carte, epuisee);
      await apres({ ...r, poison_applique: false }, A, C);
      return;
    }

    if (r.strategeme) {
      const impactDiffere = r.impact_differe ?? (A.pending && !r.missile_lance);
      let carte = null, derniere = false;
      if (!impactDiffere && A.it.strategeme) {
        const restant = r.strategeme_usages_restants ?? (A.usages != null ? A.usages - 1 : null);
        derniere = !!r.strategeme_derniere_utilisation || restant === 0;
        carte = await tirer(A);
      }
      if (r.missile_lance) {
        son(A.profilStrat === "eclair" ? "charge" : "lancement", { pan: A.pan, fichiers: r.sons_override });
        C.reticule = reticule(C);
        nombre(C, "CIBLÉ", "etat cible");
        await dormir(620);
        await ranger(A, carte, derniere);
        return;
      }
      if (r.strategeme_bouclier) {
        son("bouclier", { pan: A.pan, fichiers: r.sons_override });
        const p = pos(A.dom.portrait); onde(p.x, p.y, "bouclier", 1.6, 700);
        A.dom.portrait.classList.remove("dome"); void A.dom.portrait.offsetWidth; A.dom.portrait.classList.add("dome");
        nombre(A, "+" + fmt(r.montant_bouclier || 0) + " bouclier", "bouclier");
        await dormir(650);
        await ranger(A, carte, derniere);
        return;
      }
      if (r.soin_applique && r.frappeur === r.cible) {
        soinFx(A, r.soin_montant, r.sons_override);
        await dormir(650);
        await ranger(A, carte, derniere);
        return;
      }
      const style = r.anim_arme || R["strategeme_" + A.c + "_anim"] || (A.it.strategeme && A.it.strategeme.o.data.anim) || "explosion";
      await coup(r, A, C, style, true);
      await ranger(A, carte, derniere);
    } else {
      briller(A, "arme");
      await coup(r, A, C, r.anim_arme || A.anim, false);
    }
    await apres(r, A, C);
  }
  function soinFx(X, v, sons) {
    const p = pos(X.dom.portrait);
    son("soin", { pan: X.pan, fichiers: sons });
    particules(p.x, p.y + p.h * 0.3, 12, "soin", p.w * 0.6, 900, -80);
    X.dom.portrait.classList.remove("soigne"); void X.dom.portrait.offsetWidth; X.dom.portrait.classList.add("soigne");
    nombre(X, "+" + v, "soin");
    soigne(X, v);
  }
  async function apres(r, A, C) {
    let attente = 0;
    if (A && r.vol_de_vie > 0) {
      const a = pos(A.dom.portrait), c = pos(C.dom.portrait);
      son("volvie", { pan: A.pan });
      if (!App.reduit) for (let i = 0; i < 6; i++) { const e = point("orbe-vie", c.x, c.y, {}); anime(e, [{ transform: T(c.x + hasard(-20, 20), c.y + hasard(-20, 20), "scale(.6)"), opacity: 0 }, { transform: T((a.x + c.x) / 2, (a.y + c.y) / 2 - 40, "scale(1)"), opacity: 1, offset: 0.5 }, { transform: T(a.x, a.y, "scale(.4)"), opacity: 0 }], 620, { retirer: true, retard: i * 50, ease: "ease-in-out" }); }
      nombre(A, "+" + r.vol_de_vie, "soin vol"); soigne(A, r.vol_de_vie); attente = 450;
    }
    if (A && r.degats_reflechis > 0) { son("renvoi", { pan: A.pan }); frappe(A); nombre(A, "−" + r.degats_reflechis, "renvoi"); blesse(A, r.degats_reflechis); attente = 450; }
    if (A && r.contrecoup > 0) { son("renvoi", { pan: A.pan, vol: 0.7 }); nombre(A, "−" + r.contrecoup, "renvoi"); blesse(A, r.contrecoup); attente = 450; }
    if (C && r.erosion_pv_max > 0) nombre(C, "−" + r.erosion_pv_max + " PV max", "etat");
    if (A && r.sacrifice_pv > 0) {
      if (attente) { await dormir(attente); attente = 0; }
      annonce("Sacrifice", "sang"); son("saignement", { pan: A.pan });
      nombre(A, "−" + r.sacrifice_pv, "saignement"); blesse(A, r.sacrifice_pv);
      if (r.recharge_strategeme) { A.usages = r["strategeme_usages_" + A.c]; briller(A, "strategeme"); }
      if (r.recharge_offhand) { A.offUsages = r["offhand_usages_" + A.c]; briller(A, "offhand"); }
      rendreDeck(A);
      nombre(A, "+1 charge", "etat", 1, 2);
      attente = 700;
    }
    if (A && r.execution_active) { annonce("Exécution +" + (r.execution_bonus || 0) + " %", "sang"); son("execution", { pan: C.pan }); }
    if (C && r.etourdi_applique) { etoiles(C); son("etourdi", { pan: C.pan }); nombre(C, "ÉTOURDI", "etat stun"); C.etourdi = true; attente = 600; }
    if (A && r.riposte_stun_frappeur) { etoiles(A); son("etourdi", { pan: A.pan }); nombre(A, "ÉTOURDI", "etat stun"); A.etourdi = true; attente = 600; }
    if (C && r.paralysie_applique) { foudroie(C, true); son("paralysie", { pan: C.pan, fichiers: r.sons_paralysie }); nombre(C, r.message_paralysie || "PARALYSÉ", "etat paralysie"); attente = 600; }
    if (C && r.poison_applique) { bouffee(C, "poison", 6); dot(C, "poison"); if (!attente) son("poison", { pan: C.pan, vol: 0.6 }); }
    if (C && (r["saignement_stacks_" + C.c] || 0) > C.saignement && !r["saignement_explosion_" + C.c]) { dot(C, "saignement"); son("saignement", { pan: C.pan, vol: 0.7 }); }
    for (const X of [F.attaquant, F.defenseur]) {
      if (r["saignement_explosion_" + X.c]) { explosionSaignement(X, r["degats_explosion_saignement_" + X.c] || 0); attente = 700; }
    }
    if (attente) await dormir(attente);
    for (const X of [F.attaquant, F.defenseur]) if (r["dernier_souffle_" + X.c]) await dernierSouffle(X);
  }

  // -------------------------------------------------------------- Intro, fin, saut
  function intro(avecPorte) {
    const cote = (X) => el("div", { class: "intro-cote " + (X.g ? "g" : "d") }, el("div", { class: "intro-visage" }, visage(X.j)), el("b", { texte: X.nom }),
      X.puissance ? el("span", { class: "num", texte: "Puissance " + fmt(X.puissance) }) : null);
    const compte = el("div", { class: "intro-compte num", "aria-live": "assertive" });
    const bouton = avecPorte ? el("button", { type: "button", class: "btn-principal intro-go" }, picto("lecture"), "Regarder le combat") : null;
    const voile = el("div", { class: "intro" + (avecPorte ? " porte" : ""), role: avecPorte ? "dialog" : null, "aria-label": "Présentation du combat" },
      el("div", { class: "intro-ligne" }, cote(G), el("div", { class: "intro-vs", texte: "VS" }), cote(D)),
      el("div", { class: "intro-infos" }, [opts.bac ? "Bac à sable" : opts.mode === "entrainement" ? "Entraînement" : { duel: "Duel ciblé", auto_battle: "Combat automatique", ligue: "Combat de ligue", tour: "La Tour", arene: "Arène" }[(opts.duel || {}).type] || "Duel", R.echo_de ? "Écho" : null, TRANCHES[R.tranche] || null].filter(Boolean).join(" · ")),
      compte, bouton);
    racine.append(voile);
    return { voile, compte, bouton };
  }
  async function decompte(v) {
    const { voile, compte } = v;
    voile.classList.remove("porte");
    if (!App.reduit) {
      anime(voile.querySelector(".intro-cote.g"), [{ transform: "translateX(-40vw)", opacity: 0 }, { transform: "none", opacity: 1 }], 520);
      anime(voile.querySelector(".intro-cote.d"), [{ transform: "translateX(40vw)", opacity: 0 }, { transform: "none", opacity: 1 }], 520);
      anime(voile.querySelector(".intro-vs"), [{ transform: "scale(3)", opacity: 0 }, { transform: "scale(1)", opacity: 1 }], 420, { retard: 280 });
    }
    son("esquive", { pan: 0 });
    if (window.SFX) { SFX.musique.coupee = !prefMusique.get(); SFX.musique.jouer(); }
    await dormir(300);
    son("explosion_petite", { vol: 0.8 }); secouer(voile.querySelector(".intro-ligne"), 10, 380);
    await dormir(420);
    for (const t of ["3", "2", "1"]) {
      compte.textContent = t; son("decompte");
      if (!App.reduit) anime(compte, [{ transform: "scale(1.8)", opacity: 0 }, { transform: "scale(1)", opacity: 1, offset: 0.3 }, { transform: "scale(.9)", opacity: 0.2 }], 520, { fill: "none" });
      await dormir(520);
    }
    compte.textContent = "Combat !"; son("go");
    if (!App.reduit) anime(compte, [{ transform: "scale(2.2)", opacity: 0 }, { transform: "scale(1)", opacity: 1 }], 380);
    await dormir(480);
    await fin(anime(voile, [{ opacity: 1 }, { opacity: 0 }], 300));
    voile.remove();
  }

  async function derouler(v) {
    try {
      await decompte(v);
      for (let i = prochain; i < n; i++) {
        await tour(rounds[i], i);
        appliquer(rounds[i]); prochain = i + 1;
        rendreTout(true);
        F.attaquant.dom.racine.classList.remove("actif"); F.defenseur.dom.racine.classList.remove("actif");
        if (i < n - 1) await dormir(rounds[i].etourdi || rounds[i].paralysie ? 380 : 650);
      }
      await finale();
    } catch (e) { if (e !== ARRET) { console.error(e); passer(); } }
  }
  function nettoyer() {
    racine.getAnimations({ subtree: true }).forEach((a) => { if (!(a instanceof CSSAnimation) && !(a instanceof CSSTransition)) a.cancel(); });
    fx.replaceChildren();
    racine.querySelectorAll(".intro, .outro").forEach((e) => e.remove());
    F.attaquant.reticule = F.defenseur.reticule = null;
  }
  function passer() {
    if (fini) return;
    jeton++; basculerPause(false); nettoyer();
    for (let i = prochain; i < n; i++) appliquer(rounds[i]);
    prochain = n;
    const r = rounds[n - 1];
    if (r) { numTour.textContent = String(r.tour ?? r.round ?? n); log.textContent = lignes[n - 1].map((x) => x.texte).join(" "); }
    ajouterFeed(n - 1);
    rendreTout(false);
    finale().catch((e) => { if (e !== ARRET) console.error(e); });
  }

  const gagnant = R.egalite ? null : (R.vainqueur || (opts.duel || {}).vainqueur_login || (opts.resultat || {}).vainqueur_login || null);
  async function finale() {
    fini = true;
    racine.classList.remove("fatigue"); racine.classList.add("terminee");
    bPause.disabled = true; bPasser.disabled = true;
    F.attaquant.dom.racine.classList.remove("actif"); F.defenseur.dom.racine.classList.remove("actif");
    const V = gagnant ? de(gagnant) : null, P = V ? autre(V) : null;
    if (window.SFX) SFX.musique.arreter(3);
    if (P) {
      P.ko = true; rendre(P, false);
      await ko(P);
      V.dom.racine.classList.add("vainqueur");
      triomphe(V);
      const perdu = P.login === moi;
      son(perdu ? "defaite" : "victoire", { fichiers: perdu ? "lose.mp3" : "win.mp3", pitch: 1 }); // un jingle reste à sa hauteur
    } else {
      F.attaquant.dom.racine.classList.add("nul"); F.defenseur.dom.racine.classList.add("nul");
      son("egalite");
    }
    const j = jeton;
    await new Promise((ok) => setTimeout(ok, App.reduit ? 200 : 1400));
    if (j !== jeton) return;
    outro(V);
  }
  // K.O. : arrêt sur image, le portrait vole en éclats, « K.O. » s'écrase au centre de l'arène.
  async function ko(X) {
    const p = pos(X.dom.portrait), z = pos(scene);
    son("ko", { pan: X.pan, fichiers: "mort_1.mp3" });
    son("explosion", { pan: X.pan, vol: 0.5 });
    if (!App.reduit) {
      geler(170);
      flashArene("blanc", 460);
      exploserVisage(X, p);
      onde(p.x, p.y, "", 3.6, 720); onde(p.x, p.y, "sang", 2.4, 620);
      particules(p.x, p.y, 26, "debris", p.w * 1.1, 1100, 90); particules(p.x, p.y, 18, "etincelle or", p.w, 800);
      secouer(scene, 16, 560); zoom(0.05, 620);
    }
    X.dom.racine.classList.add("vaincu");
    await new Promise((ok) => setTimeout(ok, App.reduit ? 100 : 480));
    const tampon = point("tampon-ko", p.x, p.y, {}); tampon.textContent = "K.O.";
    const geant = point("ko-geant", z.x, z.y - z.h * 0.04, {}); geant.textContent = "K.O.";
    son("crit", { vol: 0.8 }); son("explosion_petite", { vol: 0.9 });
    if (!App.reduit) {
      anime(tampon, [{ transform: T(p.x, p.y, "rotate(-16deg) scale(2.6)"), opacity: 0 }, { transform: T(p.x, p.y, "rotate(-13deg) scale(.88)"), opacity: 1, offset: 0.6 }, { transform: T(p.x, p.y, "rotate(-15deg) scale(1)"), opacity: 1 }], 420, { ease: "cubic-bezier(.2,.8,.3,1.3)" });
      anime(geant, [{ transform: T(z.x, z.y - z.h * 0.04, "scale(3.2)"), opacity: 0 }, { transform: T(z.x, z.y - z.h * 0.04, "scale(.92)"), opacity: 1, offset: 0.45 }, { transform: T(z.x, z.y - z.h * 0.04, "scale(1)"), opacity: 1 }], 520, { ease: "cubic-bezier(.2,.8,.3,1.2)" });
      secouer(scene, 10, 360);
    } else { tampon.style.transform = T(p.x, p.y, "rotate(-15deg)"); }
    await new Promise((ok) => setTimeout(ok, App.reduit ? 150 : 1100));
    if (!App.reduit) anime(geant, [{ opacity: 1 }, { opacity: 0 }], 500, { retirer: true, ease: "linear" }); else geant.remove();
  }
  // 6 × 6 éclats du visage : une partie s'envole, le reste retombe en place, brisé et grisé.
  function exploserVisage(X, p) {
    const n = 6, rayon = getComputedStyle(X.dom.portrait).borderRadius, pc = (v) => (v * 100 / n).toFixed(2) + "%";
    for (let li = 0; li < n; li++) for (let co = 0; co < n; co++) {
      const reste = Math.random() < 0.38;
      const e = point("eclat-visage", p.x, p.y, { width: p.w + "px", height: p.h + "px", fontSize: (p.w * 0.16).toFixed(1) + "px", borderRadius: rayon,
        clipPath: `inset(${pc(li)} ${pc(n - co - 1)} ${pc(n - li - 1)} ${pc(co)})`, transformOrigin: `${pc(co + 0.5)} ${pc(li + 0.5)}` });
      e.append(X.dom.vis.cloneNode(true), X.dom.blessures.cloneNode(true));
      const a = Math.atan2((li + 0.5) / n - 0.5, (co + 0.5) / n - 0.5) + hasard(-0.5, 0.5);
      const dist = reste ? hasard(3, 9) : hasard(p.w * 0.5, p.w * 1.3), rot = reste ? hasard(-14, 14) : hasard(-300, 300);
      anime(e, [{ transform: T(p.x, p.y), opacity: 1, filter: "brightness(2.2)" },
        { transform: T(p.x + Math.cos(a) * dist, p.y + Math.sin(a) * dist + (reste ? 2 : p.h * 0.5), `rotate(${rot.toFixed(0)}deg) scale(${reste ? 1 : 0.6})`), opacity: reste ? 0.85 : 0, filter: reste ? "grayscale(1) brightness(.6)" : "brightness(1)" }],
        reste ? 520 : hasard(900, 1400), { retirer: !reste, ease: reste ? "cubic-bezier(.2,.8,.3,1)" : "cubic-bezier(.15,.7,.35,1)" });
    }
    X.dom.portrait.classList.add("detruit");
  }
  function triomphe(V) {
    if (App.reduit) return;
    const p = pos(V.dom.portrait);
    onde(p.x, p.y, "or", 2.8, 820); onde(p.x, p.y, "or", 1.9, 640);
    particules(p.x, p.y - p.h * 0.2, 30, "etincelle or", p.w * 1.2, 1400, -90);
  }

  function outro(V) {
    const participant = !opts.bac && [R.attaquant, R.defenseur].includes(moi);
    const genre = R.egalite || !V ? "egalite" : participant ? (V.login === moi ? "victoire" : "defaite") : "neutre";
    const titre = R.egalite || !V ? "Égalité" : participant ? (V.login === moi ? "Victoire" : "Défaite") : "Victoire de " + V.nom;
    const res = opts.resultat || {};
    const estLigue = opts.mode === "ligue", estTour = opts.mode === "tour", estArene = opts.mode === "arene";
    const monCote = R.attaquant === moi ? "attaquant" : R.defenseur === moi ? "defenseur" : null;
    // categorie (enregistrer_duel) : "victoire_equitable", "defaite_valeureuse", "defense_exceptionnelle"…
    const libCat = (c) => { const [a, b] = cle(c).split("_"); const x = { victoire: "Victoire", defaite: "Défaite", egalite: "Égalité", defense: "Défense" }[a], y = { valeureuse: "valeureuse", equitable: "équitable", deshonorable: "déshonorable", exceptionnelle: "exceptionnelle" }[b]; return x && y ? x + " " + y : null; };
    const cat = monCote === "defenseur" ? libCat(res.categorie_defenseur) : libCat(res.categorie);
    const rangApres = estLigue && res.points_apres != null ? App.rangLigue(res.points_apres) : null;
    const sous = rangApres ? rangApres.nom + (rangApres.suivant ? " · " + fmt(rangApres.dansDivision) + " / 100 points" : " · " + fmt(res.points_apres) + " points")
      : estArene ? `${fmt(R.victoires_parcours || 0)} victoire${R.victoires_parcours > 1 ? "s" : ""} · ${fmt(R.defaites_parcours || 0)} défaite${R.defaites_parcours > 1 ? "s" : ""}` + (res.termine ? " · parcours terminé" : "")
      : estTour ? (R.vainqueur === R.attaquant ? "Étage " + fmt(R.etage) + " franchi" : "Le gardien de l'étage " + fmt(R.etage) + " tient bon")
      : cat || (monCote && R["statut_" + monCote]) || TRANCHES[R.tranche || res.tranche] || "";
    const recompenses = [];
    if (opts.bac) recompenses.push(el("p", { class: "mention", texte: "Bac à sable : rien n'est enregistré." }));
    else if (opts.mode === "entrainement") recompenses.push(el("p", { class: "mention", texte: "Entraînement : aucune récompense, ton bilan ne bouge pas." }));
    else {
      const med = (v, qui) => el("span", { class: "gain-medailles" + (v < 0 ? " perte" : "") }, icone("i-medaille"), el("b", { class: "num", texte: (v > 0 ? "+" : v < 0 ? "−" : "") + fmt(Math.abs(v)) }), " médaille" + (Math.abs(v) > 1 ? "s" : ""), qui ? el("small", { texte: " · " + qui }) : null);
      const solo = estTour || estArene;   // en solo, un combat sans récompense n'affiche pas « +0 médaille »
      if (res.medailles_gagnees != null) { if (res.medailles_gagnees || !solo) recompenses.push(med(res.medailles_gagnees)); if (res.medailles_perdues) recompenses.push(med(-res.medailles_perdues)); }
      else if (monCote && R["medailles_" + monCote] != null) { if (R["medailles_" + monCote] || !solo) recompenses.push(med(R["medailles_" + monCote])); }
      else if (solo) { if (R.medailles_attaquant) recompenses.push(med(R.medailles_attaquant)); }
      else for (const X of [G, D]) if (R["medailles_" + X.c] != null) recompenses.push(med(R["medailles_" + X.c], X.nom));
      if (estLigue) {
        const pts = res.points_ligue != null ? res.points_ligue : monCote === "attaquant" ? R.points_ligue : null;
        if (pts != null) recompenses.push(el("span", { class: "gain-medailles" + (pts < 0 ? " perte" : "") }, icone("i-ligue"),
          el("b", { class: "num", texte: (pts > 0 ? "+" : pts < 0 ? "−" : "") + fmt(Math.abs(pts)) }), " point" + (Math.abs(pts) > 1 ? "s" : "") + " de ligue"));
        if (res.premiere_victoire) recompenses.push(el("p", { class: "mention", texte: "Première victoire de ligue du jour : médailles en plus." }));
        if (monCote === "defenseur") recompenses.push(el("p", { class: "mention", texte: "C'est ta défense qui s'est battue : tes points de ligue ne bougent pas." }));
      }
      const lb = res.lootbox_gagnees != null ? res.lootbox_gagnees : estTour || estArene ? R.lootbox_attaquant : 0;
      if (lb) recompenses.push(el("span", { class: "gain-medailles" }, icone("i-coffre-ligne"), el("b", { class: "num", texte: "+" + fmt(lb) }), " lootbox"));
      if (estArene && !recompenses.some((x) => x.classList.contains("mention"))) recompenses.push(el("p", { class: "mention", texte: !opts.resultat ? "Combat d'arène : les récompenses sont dans les coffres de fin de parcours."
        : res.termine ? (res.coffres_a_ouvrir ? `Parcours terminé : ${fmt(res.coffres_a_ouvrir)} coffre${res.coffres_a_ouvrir > 1 ? "s" : ""} de récompense à ouvrir.` : "Parcours terminé. Les coffres commencent à 3 victoires.")
        : "Les coffres de récompense s'ouvrent à la fin du parcours : paliers à 3, 5, 7 et 10 victoires." }));
      if (estTour && opts.resultat && !res.franchi) recompenses.push(el("p", { class: "mention", texte: "Une tentative de moins pour aujourd'hui. Renforce ton build et reviens." }));
      if (res.prime) recompenses.push(el("p", { class: "mention", texte: `Dont ${fmt(res.prime)} médailles de prime : ton adversaire était en série de victoires en ligue.` }));
      if (res.revanche) recompenses.push(el("p", { class: "mention", texte: "Duel de revanche : aucun ticket dépensé." }));
      if (opts.mode === "auto" && participant) recompenses.push(el("p", { class: "mention", texte: "Combat automatique : récompenses réduites de 50 %. Choisis ta cible pour les toucher en entier." }));
    }
    const ligne = (lib, k) => el("tr", {}, el("th", { scope: "row", texte: lib }), el("td", { class: "num", texte: fmt(R[k + "_" + G.c] || 0) }), el("td", { class: "num", texte: fmt(R[k + "_" + D.c] || 0) }));
    const adverse = participant ? (R.attaquant === moi ? R.defenseur : R.attaquant) : null;
    const tickets = ctx.joueur.tickets || 0;
    const actions = [];
    // Combat automatique : on relance un tirage. Écho : revanche contre le même écho.
    const auto = opts.mode === "auto" && R.attaquant === moi;
    const suite = estLigue ? (R.attaquant === moi && opts.resultat ? ["ligue.html#adversaires", "Combat suivant"] : null)
      : estTour ? (R.attaquant === moi && opts.resultat ? ["combat.html?mode=tour", res.franchi ? "Étage suivant" : "Réessayer"] : null)
      : estArene ? (R.attaquant === moi && opts.resultat ? (res.termine ? (res.coffres_a_ouvrir ? ["arene.html", "Ouvrir mes coffres"] : null) : ["combat.html?mode=arene", "Combat suivant"]) : null)
      : auto ? ["combat.html?mode=auto", "Nouveau combat auto"]
      : adverse ? [`combat.html?adversaire=${encodeURIComponent(App.echoDe(adverse) || adverse)}&mode=classe${App.echoDe(adverse) ? "&echo=1" : ""}`, "Rejouer ce duel"] : null;
    // Battu en duel ciblé par un autre joueur, il y a moins de 24 h : la revanche est gratuite (le serveur le revérifie).
    const revancheGratuite = !estLigue && monCote === "defenseur" && (R.type === "duel" || R.mode === "classe") && !R.revanche && !R.egalite && R.vainqueur === R.attaquant
      && Date.now() - new Date(R.date).getTime() < 24 * 3600e3;
    if (revancheGratuite) suite[1] = "Revanche gratuite";
    if (suite) actions.push(estLigue || estTour || estArene || tickets > 0 || revancheGratuite
      ? el("a", { class: "btn-principal", href: suite[0] }, icone(suite[0] === "arene.html" ? "i-coffre-ligne" : "i-epees"), suite[1])
      : el("button", { type: "button", class: "btn-principal", disabled: true, title: "Plus de ticket de duel — gagne-en en live" }, icone("i-epees"), suite[1]));
    if (opts.bac) actions.push(el("a", { class: "btn-principal", href: "recette.html?relancer=1" }, icone("i-epees"), "Relancer"));
    actions.push(el("button", { type: "button", class: "btn-second", onclick: () => arene(main, ctx, opts).jouer() }, picto("rejouer"), "Revoir"));
    actions.push(opts.bac ? el("a", { class: "btn-second", href: "recette.html" }, picto("retour"), "Retour à la recette")
      : estLigue ? el("a", { class: "btn-second", href: "ligue.html" }, picto("retour"), "Retour à la ligue")
      : estTour ? el("a", { class: "btn-second", href: "tour.html" }, picto("retour"), "Retour à la Tour")
      : estArene ? el("a", { class: "btn-second", href: "arene.html" }, picto("retour"), "Retour à l'Arène")
      : el("a", { class: "btn-second", href: "duels.html" }, picto("retour"), "Retour aux duels"));
    const titreEl = el("h2", { class: "outro-titre", tabindex: "-1", texte: titre });
    const panneau = el("div", { class: "outro " + genre, role: "dialog", "aria-labelledby": "outro-titre" },
      el("div", { class: "outro-carte" },
        el("span", { class: "outro-sur", texte: opts.bac ? "Combat de test terminé" : opts.mode === "entrainement" ? "Entraînement terminé" : opts.mode === "auto" ? "Combat automatique terminé" : estLigue ? "Combat de ligue terminé" : estTour ? "La Tour" : estArene ? "Arène" : "Combat terminé" }),
        titreEl, sous ? el("p", { class: "outro-sous", texte: sous }) : null,
        recompenses.length ? el("div", { class: "outro-gains" }, recompenses) : null,
        el("table", { class: "outro-stats" }, el("thead", {}, el("tr", {}, el("td"), el("th", { scope: "col", texte: G.nom }), el("th", { scope: "col", texte: D.nom }))),
          el("tbody", {}, ligne("Dégâts infligés", "degats_infliges"), ligne("Plus gros coup", "plus_gros_coup"),
            el("tr", {}, el("th", { scope: "row", texte: "Tours" }), el("td", { class: "num", colspan: "2", texte: String(n) })))),
        adverse && tickets < 1 && !estLigue && !estTour && !estArene ? el("p", { class: "mention", texte: "Plus de ticket de duel : tu en regagnes 5 par jour, et le live t'en donne d'autres." }) : null,
        el("div", { class: "outro-actions" }, actions)));
    titreEl.id = "outro-titre";
    scene.append(panneau); // dans la scène : la barre de commandes reste dégagée
    if (!App.reduit) anime(panneau.firstChild, [{ transform: "translateY(24px) scale(.96)", opacity: 0 }, { transform: "none", opacity: 1 }], 520);
    log.textContent = titre + (sous ? " — " + sous : "") + ".";
    titreEl.focus({ preventScroll: true });
    if (participant && opts.mode !== "entrainement" && opts.resultat) App.verifierSucces();
  }

  function pleinEcran() {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else racine.requestFullscreen().catch(() => {});
  }

  // Fichiers de l'ancien site (bruitages choisis par objet, K.O., jingles) chargés avant le premier coup.
  function prechargerSons() {
    if (!window.SFX) return;
    const l = ["mort_1.mp3", "win.mp3", "lose.mp3", R.arme_attaquant_sons, R.arme_defenseur_sons, R.strategeme_attaquant_sons, R.strategeme_defenseur_sons];
    for (const r of rounds) l.push(r.sons_override, r.sons_parade, r.sons_riposte, r.sons_paralysie, r.soin_sons, r.sons_dernier_souffle_attaquant, r.sons_dernier_souffle_defenseur, r.sons_explosion_saignement_attaquant, r.sons_explosion_saignement_defenseur);
    SFX.precharger(l.filter(Boolean).join(","));
  }
  if (window.SFX) { SFX.musique.arreter(0.3); SFX.musique.preparer(MUSIQUES); }
  return {
    jouer() { demarrerSon(); prechargerSons(); derouler(intro(false)); },
    porte() {
      const v = intro(true);
      v.bouton.focus({ preventScroll: true });
      v.bouton.addEventListener("click", () => { demarrerSon(); prechargerSons(); v.bouton.remove(); derouler(v); }, { once: true });
    },
  };
}

// ---------------------------------------------------------------------
// Dessins procéduraux (SVG)
// ---------------------------------------------------------------------
const NS = "http://www.w3.org/2000/svg";
function svgEl(tag, attrs) { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); return e; }
// Calques d'aura des états : le CSS les anime ; seule l'électricité a besoin d'un tracé.
function auras(seed) {
  const rnd = alea(seed), d = document.createElement("div");
  d.className = "auras"; d.setAttribute("aria-hidden", "true");
  const n = (k, tag = "i") => Array.from({ length: k }, (_, i) => `<${tag} style="--k:${i}"></${tag}>`).join("");
  d.innerHTML = `<div class="au au-poison">${n(2)}${n(3, "b")}</div><div class="au au-antisoin">${n(2)}${n(3, "b")}</div>` +
    `<div class="au au-feu">${n(2)}${n(4, "b")}</div><div class="au au-sang">${n(7)}</div>` +
    `<div class="au au-stun">${[0, 1, 2].map((i) => `<i style="--k:${i}"><b></b></i>`).join("")}</div>` +
    `<div class="au au-bouclier"></div><div class="au au-marque"><i></i></div><div class="au au-brise"></div>` +
    `<div class="au au-rage"></div><div class="au au-envol">${n(3)}</div><div class="au au-souffle"></div>`;
  // Arcs électriques le long du bord du portrait (qui occupe 13 à 87 % du calque).
  const svg = svgEl("svg", { class: "au au-elec", viewBox: "0 0 100 100", preserveAspectRatio: "none" });
  for (let i = 0; i < 6; i++) {
    const a0 = rnd() * Math.PI * 2, span = 0.7 + rnd() * 0.8, pts = [];
    for (let k = 0; k <= 9; k++) { const a = a0 + (span * k) / 9, r = 37 + rnd() * 11; pts.push((50 + Math.cos(a) * r).toFixed(1) + "," + (50 + Math.sin(a) * r).toFixed(1)); }
    svg.append(svgEl("polyline", { points: pts.join(" "), style: `--k:${i}` }));
  }
  d.append(svg);
  return d;
}

})();
