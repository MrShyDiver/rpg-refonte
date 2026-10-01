"use strict";
/* =====================================================================
   Stream RPG — combat.html : l'arène cinématique des duels.
   combat.html?duel=<id>                         rejoue un duel (live ou site)
   combat.html?adversaire=<login>&mode=classe|entrainement   écran « versus » puis combat
   Le replay (format legacy duels/<id>.json, sur-ensemble côté site) pilote tout :
   aucun calcul de combat ici, seulement la mise en scène.
   ===================================================================== */
(function () {
const { el, icone, fmt } = App;
const params = new URLSearchParams(location.search);
const SEUIL_SAIGNEMENT = 20;
const ARRET = Symbol("arret");
const cle = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const TRANCHES = { dans_tranche: "Combat équitable", au_dessus: "Cible plus forte", en_dessous: "Cible plus faible" };
const PICTOS = {
  lecture: "M7 4.5v15l12.5-7.5z", pause: "M6.5 5H10v14H6.5zM14 5h3.5v14H14z", fin: "M15.5 5H18v14h-2.5zM5 5v14l9.5-7z",
  plein: "M4 9V4h5v2H6v3zm11-5h5v5h-2V6h-3zM4 15h2v3h3v2H4zm14 3v-3h2v5h-5v-2z", rejouer: "M12 5a7 7 0 1 1-6.6 4.7l1.9.6A5 5 0 1 0 12 7v3L7.5 6 12 2z",
  retour: "M11 5 4 12l7 7 1.4-1.4L7.8 13H20v-2H7.8l4.6-4.6z",
};
function picto(nom) {
  const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  s.setAttribute("viewBox", "0 0 24 24"); s.setAttribute("aria-hidden", "true");
  const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
  p.setAttribute("d", PICTOS[nom]); p.setAttribute("fill", "currentColor"); s.append(p);
  return s;
}
// Aléatoire déterministe (fissures identiques d'un visionnage à l'autre).
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
function carteOuVide(it, libelle) {
  return it ? App.carte(it.o, { niveau: it.niveau, exemplaires: 0, equipe: false }) : el("div", { class: "case-vide" }, el("span", { texte: libelle }), el("small", { texte: "Vide" }));
}

// ---------------------------------------------------------------------
// Démarrage
// ---------------------------------------------------------------------
App.demarrer("duels", async (main, ctx) => {
  main.classList.add("contenu-arene");
  document.title = "Combat · Stream RPG";
  const id = params.get("duel"), adv = params.get("adversaire");
  if (id) return ecranReplay(main, ctx, id);
  if (adv) return ecranVersus(main, ctx, String(adv).toLowerCase(), params.get("mode") === "entrainement" ? "entrainement" : "classe");
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

// ---------------------------------------------------------------------
// Écran « versus » : les deux builds, le mode, le coût, « Lancer le duel »
// ---------------------------------------------------------------------
async function ecranVersus(main, ctx, login, modeInitial) {
  const moi = ctx.joueur;
  if (login === moi.twitch_login) { main.replaceChildren(blocVide("Tu ne peux pas te défier toi-même.", "Choisis un autre adversaire dans la liste.")); return; }
  main.replaceChildren(el("div", { class: "chargement", texte: "Préparation du face-à-face…" }));
  let adv, lo, inv;
  try {
    adv = await App.api.joueur(login);
    if (adv) [lo, inv] = await Promise.all([App.api.loadout(adv.id), App.api.inventaire(adv.id)]);
  } catch (e) { App.erreur(e); main.replaceChildren(blocVide("Le face-à-face n'a pas pu se charger.", "Vérifie ta connexion puis recharge la page.")); return; }
  if (!adv) { main.replaceChildren(blocVide("Ce joueur est introuvable.", "Il a peut-être changé de pseudo.")); return; }
  const nivAdv = new Map((inv || []).map((l) => [l.item_numero, l.niveau]));
  const pMoi = (App.puissance(moi, App.niveaux(), ctx.loadout) || {}).powerLevel || 0;
  const pAdv = (App.puissance(adv, nivAdv, lo) || {}).powerLevel || 0;
  const abonne = App.peutEntrainer(moi);
  let mode = modeInitial === "entrainement" && abonne ? "entrainement" : "classe";

  const carteJoueur = (j, loadout, niveaux, puissance, toi) => {
    const it = (col, slot) => { const n = loadout && loadout[col]; const o = n ? App.objet(n) : null; return o ? { o, niveau: Math.min(niveaux.get(n) || 0, App.niveauMax(o.rarete)) } : null; void slot; };
    return el("div", { class: "vs-joueur" + (toi ? " moi" : "") },
      el("div", { class: "vs-portrait" }, visage(j)),
      el("div", { class: "vs-ident" }, el("b", { texte: j.display_name || j.twitch_login }), toi ? el("span", { class: "pilule toi", texte: "Toi" }) : null),
      el("div", { class: "vs-chiffres" },
        el("div", {}, el("b", { class: "num", texte: puissance ? fmt(puissance) : "—" }), el("span", { texte: "puissance" })),
        el("div", {}, el("b", { class: "num", texte: `${fmt(j.victoires || 0)}-${fmt(j.defaites || 0)}` }), el("span", { texte: "V-D" }))),
      el("div", { class: "vs-build" }, [["arme", "Arme"], ["armure", "Armure"], ["offhand", "Main gauche"], ["strategeme", "Stratagème"]].map(([c, lib]) => carteOuVide(it(c), lib))));
  };

  const cout = el("p", { class: "vs-cout", "aria-live": "polite" });
  const lancer = el("button", { type: "button", class: "btn-principal vs-lancer" }, icone("i-epees"), el("span", { texte: "Lancer le duel" }));
  const raison = el("p", { class: "vs-raison" });
  const modes = el("div", { class: "onglets-b vs-modes", role: "group", "aria-label": "Type de duel" },
    el("button", { type: "button", "data-v": "classe", onclick: () => choisir("classe") }, "Duel classé"),
    el("button", { type: "button", "data-v": "entrainement", title: abonne ? null : "Réservé aux abonnés de la chaîne",
      onclick: () => (abonne ? choisir("entrainement") : App.toast("L'entraînement gratuit est réservé aux abonnés Twitch de la chaîne.", { titre: "Réservé aux abonnés", icone: "i-cadenas" })) },
      abonne ? null : icone("i-cadenas"), "Entraînement"));
  function choisir(m) {
    mode = m;
    modes.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === m)));
    const tickets = ctx.joueur.tickets || 0;
    history.replaceState(null, "", `combat.html?adversaire=${encodeURIComponent(login)}&mode=${m}`);
    if (m === "classe") {
      cout.replaceChildren(icone("i-ticket"), el("span", {}, "Coûte ", el("b", { texte: "1 ticket de duel" }), ` · il t'en reste ${fmt(tickets)}. Médailles et bilan en jeu, comme en live.`));
      const bloque = tickets < 1;
      lancer.disabled = bloque;
      raison.textContent = bloque ? "Plus de ticket de duel — gagne-en en live." : "";
    } else {
      cout.replaceChildren(icone("i-coche"), el("span", {}, el("b", { texte: "Gratuit" }), " pour les abonnés · aucune récompense, ton bilan ne bouge pas."));
      lancer.disabled = false; raison.textContent = "";
    }
  }
  lancer.addEventListener("click", async () => {
    demarrerSon(); // geste utilisateur : l'audio peut démarrer
    lancer.disabled = true; lancer.classList.add("occupe"); lancer.lastChild.textContent = "Combat en cours…";
    try {
      const rep = await App.lancerDuel({ adversaire: login, mode });
      if (rep.joueur) { Object.assign(ctx.joueur, rep.joueur); App.majRessources(); }
      history.replaceState(null, "", "combat.html?duel=" + encodeURIComponent(rep.duel_id));
      await pSfx; demarrerSon();
      const joueurs = [moi, adv];
      const duel = { id: rep.duel_id, type: (rep.mode || mode) === "entrainement" ? "entrainement" : "duel", replay: { source: "site" } };
      arene(main, ctx, { R: rep.replay, duel, joueurs, mode: rep.mode || mode, resultat: rep.resultat }).jouer();
      App.rafraichirJoueur().catch(() => {});
    } catch (e) {
      App.erreur(e);
      lancer.classList.remove("occupe"); lancer.lastChild.textContent = "Lancer le duel"; choisir(mode);
    }
  });

  main.replaceChildren(el("section", { class: "versus", "aria-labelledby": "titre-versus" },
    el("header", { class: "vs-entete" }, el("span", { class: "vs-sur", texte: "Face-à-face" }), el("h1", { id: "titre-versus", texte: "Toi contre " + (adv.display_name || adv.twitch_login) })),
    el("div", { class: "vs-duo" }, carteJoueur(moi, ctx.loadout, App.niveaux(), pMoi, true), el("div", { class: "vs-eclair", "aria-hidden": "true" }, el("span", { texte: "VS" })), carteJoueur(adv, lo, nivAdv, pAdv, false)),
    el("div", { class: "vs-bas" }, modes, cout, lancer, raison,
      el("p", { class: "mention vs-note", texte: "Le combat est calculé par le serveur avec vos deux builds actuels. " + (adv.display_name || login) + " n'a pas besoin d'être connecté : il verra le résultat dans ses notifications." }),
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
      imageBase: it.arme ? it.arme.o.image : "", image2: it.arme ? it.arme.o.data.stance2ImageUrl || "" : "",
    };
  }
  const F = { attaquant: combattant("attaquant"), defenseur: combattant("defenseur") };
  const G = F[gauche], D = F[gauche === "attaquant" ? "defenseur" : "attaquant"];
  const autre = (X) => (X === F.attaquant ? F.defenseur : F.attaquant);
  const de = (login) => (login === R.attaquant ? F.attaquant : login === R.defenseur ? F.defenseur : null);
  function initialiser(X) {
    Object.assign(X, { pv: X.pvMax0, pvMax: X.pvMax0, pvVis: X.pvMax0, shield: R[X.c + "_shield_max"] || 0, usure: 0, etape: 0, etapeVue: 0,
      usages: X.usagesMax, cd: 0, pending: false, reticule: null, stance2: false, etourdi: false, souffleUtilise: false, rage: 0,
      r: null, ko: false, brisBouclier: false, saignement: 0 });
  }

  // Réducteur : applique un tour au modèle (sert à la lecture ET au saut vers la fin).
  function appliquer(r) {
    const A = r.frappeur ? de(r.frappeur) : null;
    for (const X of [F.attaquant, F.defenseur]) {
      const s = X.c, avant = X.pv, bouclierAvant = X.shield;
      X.pv = Math.max(0, r["pv_" + s + "_apres"] ?? X.pv);
      X.pvMax = r["pv_max_" + s + "_apres"] ?? X.pvMax;
      if (r["shield_" + s] !== undefined) X.shield = r["shield_" + s] || 0;
      if (bouclierAvant > 0 && X.shield === 0) { X.brisBouclier = true; X.usure += 0.1; }
      X.usure += Math.max(0, avant - X.pv) / X.pvMax0;
      if (r.cible === X.login && r.crit && r.touche) X.usure += 0.06;
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
    for (const X of [F.attaquant, F.defenseur]) {
      X.pvVis = X.pv;
      const seuils = [0.15, 0.35, 0.55, 0.75];
      X.etape = Math.max(X.etape, seuils.filter((s) => X.usure >= s).length);
    }
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
    const portrait = el("div", { class: "portrait", "data-degats": "0" }, vis, fissuresPortrait(graine(X.login)), el("i", { class: "teinte" }), el("i", { class: "vignette" }), el("i", { class: "eclair-blanc" }));
    const slot = (k, lib) => el("div", { class: "slot slot-" + k }, carteOuVide(X.it[k], lib));
    const sArme = slot("arme", "Mains nues"), sArmure = slot("armure", "Sans armure"), sOff = slot("offhand", "Main gauche");
    sArmure.append(fissuresArmure(graine(X.login + "armure")));
    const pile = el("div", { class: "pile" }), pips = el("div", { class: "pips", role: "img" }), cd = el("span", { class: "cd num" });
    const deck = el("div", { class: "slot deck" + (X.it.strategeme ? "" : " sans"), title: X.it.strategeme ? "Stratagème : " + X.it.strategeme.o.nom : "Pas de stratagème" },
      pile, cd, pips, X.it.strategeme ? null : el("small", { texte: "Aucun stratagème" }));
    const racine = el("div", { class: "cbt " + (X.g ? "gauche" : "droite") + (X.login === moi ? " moi" : "") },
      el("div", { class: "jauge" },
        el("div", { class: "jauge-tete" }, el("b", { class: "jauge-nom", texte: X.nom }), X.login === moi ? el("span", { class: "toi", texte: "Toi" }) : null,
          X.puissance ? el("span", { class: "jauge-puissance num", texte: "Puissance " + fmt(X.puissance) }) : null),
        barre, el("div", { class: "jauge-pied" }, pvTxt, statuts)),
      el("div", { class: "corps" }, el("div", { class: "socle" }, portrait), el("div", { class: "main-cartes" }, sArme, sArmure, sOff, deck)));
    X.dom = { racine, barre, plein, fantome, bouclier, erosion, pvTxt, statuts, portrait, vis, sArme, sArmure, sOff, deck, pile, pips, cd };
  }
  initialiser(F.attaquant); initialiser(F.defenseur);
  construire(G); construire(D);
  const scene = el("div", { class: "scene-arene" }, G.dom.racine,
    el("div", { class: "centre" }, el("div", { class: "tour" }, el("span", { texte: "Tour" }), numTour, el("small", { class: "num", texte: "/ " + n })),
      el("span", { class: "vs-centre", "aria-hidden": "true", texte: "VS" })), D.dom.racine, annonceur);

  let vitesse = 1, enPause = false, jeton = 0, prochain = 0, fini = false;
  const bPause = el("button", { type: "button", class: "bouton-icone", "aria-label": "Pause", title: "Pause (espace)", onclick: () => basculerPause() }, picto("pause"));
  const vitesses = el("div", { class: "onglets-b vitesses", role: "group", "aria-label": "Vitesse" },
    [1, 2, 4].map((v) => el("button", { type: "button", "aria-pressed": String(v === 1), texte: v + "×", "aria-label": "Vitesse " + v + " fois", onclick: () => regler(v) })));
  const bPasser = el("button", { type: "button", class: "btn-second passer", onclick: () => passer() }, picto("fin"), "Passer");
  const bSon = el("button", { type: "button", class: "bouton-icone son", "aria-label": "Son", "aria-pressed": String(App.sons.actif), title: "Son",
    onclick: () => { App.sons.actif = !App.sons.actif; bSon.setAttribute("aria-pressed", String(App.sons.actif)); if (window.SFX) { SFX.actif = App.sons.actif; if (App.sons.actif) SFX.demarrer(); } } }, icone("i-son"));
  const bPlein = document.fullscreenEnabled ? el("button", { type: "button", class: "bouton-icone", "aria-label": "Plein écran", title: "Plein écran", onclick: () => pleinEcran() }, picto("plein")) : null;
  const commandes = el("div", { class: "commandes-arene" },
    el("div", { class: "cmd-lecture" }, bPause, vitesses, bPasser), log,
    el("div", { class: "cmd-outils" }, bSon, bPlein, el("a", { class: "btn-second retour", href: "duels.html", "aria-label": "Retour aux duels" }, picto("retour"), el("span", { texte: "Retour aux duels" }))));
  const racine = el("section", { class: "arene", "aria-label": `Combat : ${F.attaquant.nom} contre ${F.defenseur.nom}`, style: { "--vit": "1" } }, scene, fx, commandes);
  main.replaceChildren(racine);
  const lignes = rounds.map((r) => decrire(r, R, nomDe));
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
    // Armure qui se fissure
    d.sArmure.dataset.etape = String(X.ko ? 5 : X.etape);
    if (anime && X.etape > X.etapeVue && !X.ko) eclatsArmure(X, X.etape);
    X.etapeVue = X.etape;
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
  function rendreDeck(X) {
    const d = X.dom;
    if (!X.it.strategeme) return;
    const restant = X.usages == null ? 1 : X.usages;
    d.pile.replaceChildren(...Array.from({ length: Math.min(3, restant) }, (_, i) => el("div", { class: "dos", style: { "--i": String(i) } }, symboleDos())));
    d.deck.classList.toggle("epuise", restant <= 0);
    d.pips.replaceChildren(...(X.usagesMax ? Array.from({ length: Math.min(6, X.usagesMax) }, (_, i) => el("i", { class: i < restant ? "plein" : null })) : []));
    d.pips.setAttribute("aria-label", X.usagesMax ? `${restant} utilisation${restant > 1 ? "s" : ""} restante${restant > 1 ? "s" : ""} sur ${X.usagesMax}` : "");
    const enCd = X.cd > 1 && restant > 0;
    d.cd.textContent = enCd ? String(X.cd - 1) : "";
    d.deck.classList.toggle("recharge", enCd);
  }
  function statuts(X) {
    const r = X.r || {}, s = X.c, l = [];
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
  function regler(v) {
    vitesse = v;
    racine.style.setProperty("--vit", String(v));
    vitesses.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.textContent === v + "×")));
    racine.getAnimations({ subtree: true }).forEach((a) => { try { a.updatePlaybackRate(v); } catch (e) { a.playbackRate = v; } });
  }
  function basculerPause(force) {
    if (fini) return;
    enPause = force ?? !enPause;
    racine.classList.toggle("en-pause", enPause);
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
        if (!enPause) reste -= (t - prec) * vitesse;
        prec = t;
        if (reste <= 0) ok(); else requestAnimationFrame(f);
      };
      requestAnimationFrame(f);
    });
  }
  function anime(e, kf, d, o = {}) {
    const a = e.animate(kf, { duration: d, easing: o.ease || "cubic-bezier(.16,1,.3,1)", fill: o.fill || "forwards", delay: o.retard || 0, iterations: o.iter || 1 });
    a.playbackRate = vitesse;
    if (enPause) a.pause();
    if (o.retirer) a.finished.then(() => e.remove(), () => e.remove());
    return a;
  }
  function fin(a) { const j = jeton; return a.finished.then(() => { if (j !== jeton) throw ARRET; }, () => { throw ARRET; }); }

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
    const toucher = (k, x, y, lourd) => {
      const crit = !!crits[k];
      if (rate) return;
      if (r.parade_reussie) return;
      frappe(C, crit || lourd);
      eclatBlanc(C);
      nombre(C, (crit ? "−" : "−") + balles[k], crit ? "crit" : "", k, nb);
      if (crit) { son("crit", { pan: C.pan }); flashArene("or", 260); particules(x, y, 10, "etincelle or", 90, 600); }
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
    if (r.degats_ripostee > 0) { nombre(A, "−" + r.degats_ripostee, "riposte"); blesse(A, r.degats_ripostee); }
  }

  // -------------------------------------------------------------- Stratagèmes
  function symboleDos() {
    const s = document.createElementNS("http://www.w3.org/2000/svg", "svg"); s.setAttribute("viewBox", "0 0 40 40"); s.setAttribute("aria-hidden", "true");
    const u = document.createElementNS("http://www.w3.org/2000/svg", "use"); u.setAttribute("href", "#i-marque"); s.append(u); return s;
  }
  async function tirer(X) {
    const pile = X.dom.pile, d = pos(X.dom.deck);
    const top = pile.lastElementChild; if (top) top.style.visibility = "hidden";
    const w = Math.max(40, X.dom.deck.offsetWidth * 0.86);
    const zone = pos(scene);
    const grand = Math.min(zone.w * 0.32, zone.h * 0.42 * (5 / 7), 190);
    const echelle = grand / w;
    const cible = { x: zone.x, y: zone.y - zone.h * 0.04 };
    const carte = el("div", { class: "f carte-vol", style: { width: w + "px" } },
      el("div", { class: "dos" }, symboleDos()), el("div", { class: "cv-face" }, App.carte(X.it.strategeme.o, { niveau: X.it.strategeme.niveau, exemplaires: 0, equipe: false })));
    carte.style.transform = T(d.x, d.y);
    fx.append(carte);
    son("carte", { pan: X.pan });
    briller(X, "strategeme");
    if (App.reduit) {
      carte.classList.add("face");
      carte.style.transform = T(cible.x, cible.y, `scale(${echelle})`);
      await fin(anime(carte, [{ opacity: 0 }, { opacity: 1 }], 250));
    } else {
      const mi = { x: (d.x + cible.x) / 2, y: Math.min(d.y, cible.y) - zone.h * 0.12 };
      await fin(anime(carte, [
        { transform: T(d.x, d.y, "scale(1)") },
        { transform: T(d.x, d.y - 26, `scale(1.12) rotate(${X.g ? -8 : 8}deg)`), offset: 0.35 },
        { transform: T(mi.x, mi.y, `scale(${(1 + echelle) / 2}, ${(1 + echelle) / 2}) rotate(${X.g ? 4 : -4}deg)`) },
      ], 380, { ease: "cubic-bezier(.3,.7,.3,1)" }));
      await fin(anime(carte, [{ transform: T(mi.x, mi.y, `scale(${(1 + echelle) / 2}) rotate(${X.g ? 4 : -4}deg)`) }, { transform: T(mi.x, mi.y, `scale(0, ${(1 + echelle) / 2})`) }], 130, { ease: "ease-in" }));
      carte.classList.add("face");
      son("carte", { pan: 0, vol: 0.6 });
      await fin(anime(carte, [{ transform: T(mi.x, mi.y, `scale(0, ${(1 + echelle) / 2})`) }, { transform: T(cible.x, cible.y, `scale(${echelle})`) }], 340));
    }
    carte._t = T(cible.x, cible.y, `scale(${echelle})`);
    carte.classList.add("active");
    annonce(X.it.strategeme.o.nom, "strat");
    await dormir(420);
    return carte;
  }
  async function ranger(X, carte, derniere) {
    if (!carte) return;
    carte.classList.remove("active");
    if (derniere) { await bruler(X, carte); return; }
    const d = pos(X.dom.deck);
    son("carte_retour", { pan: X.pan });
    if (App.reduit) { await fin(anime(carte, [{ opacity: 1 }, { opacity: 0 }], 250)); carte.remove(); return; }
    await fin(anime(carte, [{ transform: carte._t }, { transform: T(d.x, d.y, "scale(.9)"), opacity: 0.4 }], 420, { ease: "cubic-bezier(.5,0,.7,.4)" }));
    carte.remove();
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
    X.dom.deck.classList.add("epuise");
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
  function arcs(X) {
    if (App.reduit) return;
    const p = pos(X.dom.portrait);
    for (let i = 0; i < 3; i++) {
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
  function explosionSaignement(X, v) {
    const p = pos(X.dom.portrait);
    annonce("Le saignement explose !", "sang");
    son("saignement_explosion", { pan: X.pan, fichiers: X.r && X.r["sons_explosion_saignement_" + X.c] });
    onde(p.x, p.y, "sang", 2.8, 620); particules(p.x, p.y, 22, "goutte", p.w * 0.9, 900, 70);
    frappe(X, true);
    nombre(X, "−" + v, "saignement gros");
    blesse(X, v);
  }
  function eclatsArmure(X, etape) {
    const s = X.dom.sArmure, p = pos(s);
    son("armure", { pan: X.pan, etape, retard: 0.05 });
    s.classList.remove("craque"); void s.offsetWidth; s.classList.add("craque");
    if (App.reduit) return;
    for (let i = 0; i < 3 + etape; i++) {
      const x = p.x + hasard(-p.w * 0.4, p.w * 0.4), y = p.y + hasard(-p.h * 0.2, p.h * 0.35);
      const e = point("eclat-armure " + (X.it.armure ? X.it.armure.o.rarete : "commun"), x, y, { "--forme": String(Math.floor(hasard(0, 3))) });
      anime(e, [{ transform: T(x, y, "rotate(0deg)"), opacity: 1 }, { transform: T(x + hasard(-30, 30), y + hasard(80, 150), `rotate(${hasard(-260, 260).toFixed(0)}deg)`), opacity: 0 }], hasard(700, 1100), { retirer: true, ease: "cubic-bezier(.4,0,.9,.6)" });
    }
  }
  function bouclierBrise(X) {
    const p = pos(X.dom.barre);
    son("bouclier_casse", { pan: X.pan });
    nombre(X, "BOUCLIER BRISÉ", "etat bouclier");
    particules(p.x, p.y, 16, "verre", 70, 700, 40);
  }

  // -------------------------------------------------------------- Un tour
  async function tour(r, i) {
    numTour.textContent = String(r.round ?? i + 1);
    log.textContent = lignes[i].map((x) => x.texte).join(" ");
    const A = r.frappeur ? de(r.frappeur) : null, C = A ? autre(A) : null;
    if (R.round_debut_fatigue > 0 && r.round === R.round_debut_fatigue) {
      racine.classList.add("fatigue"); annonce("La fatigue s'installe", "etat"); son("fatigue"); await dormir(700);
    }
    let tic = false;
    if (r.poison_tick && r.degats_poison) { const X = r.poison_tick_attaquant ? F.attaquant : F.defenseur; dot(X, "poison"); son("poison", { pan: X.pan }); nombre(X, "−" + r.degats_poison, "poison"); blesse(X, r.degats_poison); tic = true; }
    if (r.brulure_tick && r.degats_brulure) { const X = r.brulure_tick_attaquant ? F.attaquant : F.defenseur; dot(X, "brulure"); son("brulure", { pan: X.pan }); nombre(X, "−" + r.degats_brulure, "brulure"); blesse(X, r.degats_brulure); tic = true; }
    if (r.fatigue_tick && r.degats_fatigue) { for (const X of [F.attaquant, F.defenseur]) { dot(X, "fatigue"); nombre(X, "−" + r.degats_fatigue, "fatigue"); blesse(X, r.degats_fatigue); } son("fatigue"); tic = true; }
    if (tic) await dormir(560);
    if (!A) { await apres(r, null, null); return; }

    if (r.etourdi) { etoiles(A); son("etourdi", { pan: A.pan }); nombre(A, "ÉTOURDI", "etat stun"); await dormir(760); return; }
    if (r.paralysie) { arcs(A); son("paralysie", { pan: A.pan, fichiers: r.sons_paralysie }); nombre(A, r.message_paralysie || "PARALYSÉ", "etat paralysie"); await dormir(760); await apres(r, A, C); return; }

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

    // Soin actif (off-hand, armure) sur soi
    if (r.soin_applique && r.soin_montant > 0 && !r.strategeme) {
      briller(A, A.it.offhand && A.it.offhand.o.data.soinDirect ? "offhand" : "armure");
      soinFx(A, r.soin_montant, r.soin_sons);
      await dormir(600);
    }

    if (r.strategeme) {
      const impactDiffere = A.pending && !r.missile_lance;
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
    if (A && r.execution_active) { annonce("Exécution +" + (r.execution_bonus || 0) + " %", "sang"); son("execution", { pan: C.pan }); }
    if (C && r.etourdi_applique) { etoiles(C); son("etourdi", { pan: C.pan }); nombre(C, "ÉTOURDI", "etat stun"); C.etourdi = true; attente = 600; }
    if (A && r.riposte_stun_frappeur) { etoiles(A); son("etourdi", { pan: A.pan }); nombre(A, "ÉTOURDI", "etat stun"); A.etourdi = true; attente = 600; }
    if (C && r.paralysie_applique) { arcs(C); son("paralysie", { pan: C.pan, fichiers: r.sons_paralysie }); nombre(C, r.message_paralysie || "PARALYSÉ", "etat paralysie"); attente = 600; }
    if (C && r.poison_applique) { dot(C, "poison"); if (!attente) son("poison", { pan: C.pan, vol: 0.6 }); }
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
      el("div", { class: "intro-infos" }, [opts.mode === "entrainement" ? "Entraînement" : { duel: "Duel classé", auto_battle: "Combat auto" }[(opts.duel || {}).type] || "Duel", TRANCHES[R.tranche] || null, n + " tours"].filter(Boolean).join(" · ")),
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
    await dormir(700);
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
        await dormir(rounds[i].etourdi || rounds[i].paralysie ? 260 : 420);
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
    if (r) { numTour.textContent = String(r.round ?? n); log.textContent = lignes[n - 1].map((x) => x.texte).join(" "); }
    rendreTout(false);
    finale().catch((e) => { if (e !== ARRET) console.error(e); });
  }

  const gagnant = R.egalite ? null : (R.vainqueur || (opts.duel || {}).vainqueur_login || (opts.resultat || {}).vainqueur_login || null);
  async function finale() {
    fini = true;
    racine.classList.remove("fatigue"); racine.classList.add("terminee");
    bPause.disabled = true; bPasser.disabled = true;
    const V = gagnant ? de(gagnant) : null, P = V ? autre(V) : null;
    if (P) {
      P.ko = true; rendre(P, false);
      await ko(P);
      V.dom.racine.classList.add("vainqueur");
      son(V.login === moi || P.login !== moi ? "victoire" : "defaite");
    } else {
      F.attaquant.dom.racine.classList.add("nul"); F.defenseur.dom.racine.classList.add("nul");
      son("egalite");
    }
    const j = jeton;
    await new Promise((ok) => setTimeout(ok, App.reduit ? 200 : 900));
    if (j !== jeton) return;
    outro(V);
  }
  async function ko(X) {
    const p = pos(X.dom.portrait);
    son("ko", { pan: X.pan });
    if (!App.reduit) {
      flashArene("blanc", 300);
      eclatsVisage(X, p);
      // L'armure cède
      const s = X.dom.sArmure, carte = s.querySelector(".carte, .case-vide");
      if (carte) {
        son("armure_brisee", { pan: X.pan, retard: 0.25 });
        const q = pos(carte);
        for (const moitie of ["g", "d"]) {
          const c = carte.cloneNode(true); c.classList.add("moitie", moitie);
          const e = point("moitie-armure", q.x, q.y, { width: q.w + "px" }); e.append(c);
          anime(e, [{ transform: T(q.x, q.y), opacity: 1 }, { transform: T(q.x + (moitie === "g" ? -18 : 18), q.y + 40, `rotate(${moitie === "g" ? -14 : 12}deg)`), opacity: 0.9, offset: 0.5 }, { transform: T(q.x + (moitie === "g" ? -30 : 30), q.y + 90, `rotate(${moitie === "g" ? -24 : 22}deg)`), opacity: 0 }], 1300, { retirer: true, retard: 250, ease: "cubic-bezier(.4,0,.8,.6)" });
        }
      }
    }
    X.dom.sArmure.dataset.etape = "5";
    X.dom.racine.classList.add("vaincu");
    X.dom.portrait.append(el("span", { class: "tampon-ko", texte: "K.O." }));
    await new Promise((ok) => setTimeout(ok, App.reduit ? 150 : 1100));
  }
  function eclatsVisage(X, p) {
    const n0 = 12, cx = 50 + hasard(-12, 12), cy = 45 + hasard(-12, 12);
    const bord = (a) => { const x = 50 + Math.cos(a) * 80, y = 50 + Math.sin(a) * 80; return [Math.max(0, Math.min(100, x)), Math.max(0, Math.min(100, y))]; };
    for (let i = 0; i < n0; i++) {
      const a1 = (i / n0) * Math.PI * 2 + hasard(-0.1, 0.1), a2 = ((i + 1) / n0) * Math.PI * 2;
      const [x1, y1] = bord(a1), [x2, y2] = bord(a2);
      const e = point("eclat-visage", p.x, p.y, { width: p.w + "px", height: p.h + "px", fontSize: (p.w * 0.16).toFixed(1) + "px", clipPath: `polygon(${cx}% ${cy}%, ${x1}% ${y1}%, ${x2}% ${y2}%)` });
      e.append(X.dom.vis.cloneNode(true));
      const am = (a1 + a2) / 2, dist = hasard(40, 120);
      anime(e, [{ transform: T(p.x, p.y), opacity: 1 }, { transform: T(p.x + Math.cos(am) * dist, p.y + Math.sin(am) * dist + 60, `rotate(${hasard(-70, 70).toFixed(0)}deg) scale(.9)`), opacity: 0 }], hasard(800, 1200), { retirer: true, ease: "cubic-bezier(.3,.6,.6,1)" });
    }
  }

  function outro(V) {
    const participant = [R.attaquant, R.defenseur].includes(moi);
    const genre = R.egalite || !V ? "egalite" : participant ? (V.login === moi ? "victoire" : "defaite") : "neutre";
    const titre = R.egalite || !V ? "Égalité" : participant ? (V.login === moi ? "Victoire" : "Défaite") : "Victoire de " + V.nom;
    const res = opts.resultat || {};
    const monCote = R.attaquant === moi ? "attaquant" : R.defenseur === moi ? "defenseur" : null;
    // categorie (enregistrer_duel) : "victoire_equitable", "defaite_valeureuse", "defense_exceptionnelle"…
    const libCat = (c) => { const [a, b] = cle(c).split("_"); const x = { victoire: "Victoire", defaite: "Défaite", egalite: "Égalité", defense: "Défense" }[a], y = { valeureuse: "valeureuse", equitable: "équitable", deshonorable: "déshonorable", exceptionnelle: "exceptionnelle" }[b]; return x && y ? x + " " + y : null; };
    const cat = monCote === "defenseur" ? libCat(res.categorie_defenseur) : libCat(res.categorie);
    const sous = cat || (monCote && R["statut_" + monCote]) || TRANCHES[R.tranche || res.tranche] || "";
    const recompenses = [];
    if (opts.mode === "entrainement") recompenses.push(el("p", { class: "mention", texte: "Entraînement : aucune récompense, ton bilan ne bouge pas." }));
    else {
      const med = (v, qui) => el("span", { class: "gain-medailles" + (v < 0 ? " perte" : "") }, icone("i-medaille"), el("b", { class: "num", texte: (v > 0 ? "+" : v < 0 ? "−" : "") + fmt(Math.abs(v)) }), " médaille" + (Math.abs(v) > 1 ? "s" : ""), qui ? el("small", { texte: " · " + qui }) : null);
      if (res.medailles_gagnees != null) { recompenses.push(med(res.medailles_gagnees)); if (res.medailles_perdues) recompenses.push(med(-res.medailles_perdues)); }
      else if (monCote && R["medailles_" + monCote] != null) recompenses.push(med(R["medailles_" + monCote]));
      else for (const X of [G, D]) if (R["medailles_" + X.c] != null) recompenses.push(med(R["medailles_" + X.c], X.nom));
    }
    const ligne = (lib, k) => el("tr", {}, el("th", { scope: "row", texte: lib }), el("td", { class: "num", texte: fmt(R[k + "_" + G.c] || 0) }), el("td", { class: "num", texte: fmt(R[k + "_" + D.c] || 0) }));
    const adverse = participant ? (R.attaquant === moi ? R.defenseur : R.attaquant) : null;
    const tickets = ctx.joueur.tickets || 0;
    const actions = [];
    if (adverse) actions.push(tickets > 0
      ? el("a", { class: "btn-principal", href: `combat.html?adversaire=${encodeURIComponent(adverse)}&mode=classe` }, icone("i-epees"), "Revanche")
      : el("button", { type: "button", class: "btn-principal", disabled: true, title: "Plus de ticket de duel — gagne-en en live" }, icone("i-epees"), "Revanche"));
    actions.push(el("button", { type: "button", class: "btn-second", onclick: () => arene(main, ctx, opts).jouer() }, picto("rejouer"), "Revoir"));
    actions.push(el("a", { class: "btn-second", href: "duels.html" }, picto("retour"), "Retour aux duels"));
    const titreEl = el("h2", { class: "outro-titre", tabindex: "-1", texte: titre });
    const panneau = el("div", { class: "outro " + genre, role: "dialog", "aria-labelledby": "outro-titre" },
      el("div", { class: "outro-carte" },
        el("span", { class: "outro-sur", texte: opts.mode === "entrainement" ? "Entraînement terminé" : "Combat terminé" }),
        titreEl, sous ? el("p", { class: "outro-sous", texte: sous }) : null,
        recompenses.length ? el("div", { class: "outro-gains" }, recompenses) : null,
        el("table", { class: "outro-stats" }, el("thead", {}, el("tr", {}, el("td"), el("th", { scope: "col", texte: G.nom }), el("th", { scope: "col", texte: D.nom }))),
          el("tbody", {}, ligne("Dégâts infligés", "degats_infliges"), ligne("Plus gros coup", "plus_gros_coup"),
            el("tr", {}, el("th", { scope: "row", texte: "Tours" }), el("td", { class: "num", colspan: "2", texte: String(n) })))),
        adverse && tickets < 1 ? el("p", { class: "mention", texte: "Plus de ticket de duel — gagne-en en live." }) : null,
        el("div", { class: "outro-actions" }, actions)));
    titreEl.id = "outro-titre";
    racine.append(panneau);
    if (!App.reduit) anime(panneau.firstChild, [{ transform: "translateY(24px) scale(.96)", opacity: 0 }, { transform: "none", opacity: 1 }], 520);
    log.textContent = titre + (sous ? " — " + sous : "") + ".";
    titreEl.focus({ preventScroll: true });
    if (participant && opts.mode !== "entrainement" && opts.resultat) App.verifierSucces();
  }

  function pleinEcran() {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else racine.requestFullscreen().catch(() => {});
  }

  return {
    jouer() { demarrerSon(); derouler(intro(false)); },
    porte() {
      const v = intro(true);
      v.bouton.focus({ preventScroll: true });
      v.bouton.addEventListener("click", () => { demarrerSon(); v.bouton.remove(); derouler(v); }, { once: true });
    },
  };
}

// ---------------------------------------------------------------------
// Dessins procéduraux (SVG) : fissures du portrait et de l'armure
// ---------------------------------------------------------------------
const NS = "http://www.w3.org/2000/svg";
function svgEl(tag, attrs) { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); return e; }
function trait(g, pts, epais = 1) {
  const d = "M" + pts.map((p) => p[0].toFixed(1) + " " + p[1].toFixed(1)).join("L");
  g.append(svgEl("path", { d, class: "ombre", "stroke-width": String(epais * 1.7) }), svgEl("path", { d, class: "lumiere", "stroke-width": String(epais * 0.7) }));
}
function fissure(rnd, x, y, ang, long, seg) {
  const pts = [[x, y]];
  for (let i = 0; i < seg; i++) { ang += (rnd() - 0.5) * 0.9; x += Math.cos(ang) * (long / seg); y += Math.sin(ang) * (long / seg); pts.push([x, y]); }
  return pts;
}
function fissuresPortrait(seed) {
  const rnd = alea(seed), svg = svgEl("svg", { class: "fissures", viewBox: "0 0 100 100", preserveAspectRatio: "none", "aria-hidden": "true" });
  const g = [1, 2, 3, 4].map((e) => { const x = svgEl("g", { "data-e": String(e) }); svg.append(x); return x; });
  // 1 : griffures
  const gx = 25 + rnd() * 40, gy = 20 + rnd() * 30;
  for (let i = 0; i < 3; i++) trait(g[0], [[gx + i * 6, gy + i * 2], [gx + 14 + i * 6, gy + 22 + i * 2]], 0.7);
  // 2 : fissures depuis les bords
  for (let i = 0; i < 2; i++) { const a = rnd() * Math.PI * 2; trait(g[1], fissure(rnd, 50 + Math.cos(a) * 55, 50 + Math.sin(a) * 55, a + Math.PI, 38, 6), 0.9); }
  // 3 : étoile d'impact + sang
  const ix = 38 + rnd() * 24, iy = 34 + rnd() * 24;
  for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2 + rnd() * 0.4; trait(g[2], fissure(rnd, ix, iy, a, 20 + rnd() * 26, 4), 0.8); }
  for (let i = 0; i < 6; i++) g[2].append(svgEl("circle", { cx: (ix + (rnd() - 0.5) * 40).toFixed(1), cy: (iy + (rnd() - 0.2) * 40).toFixed(1), r: (0.8 + rnd() * 2.4).toFixed(1), class: "sang" }));
  // 4 : éclatement
  for (let i = 0; i < 5; i++) { const a = rnd() * Math.PI * 2; trait(g[3], fissure(rnd, ix, iy, a, 45 + rnd() * 20, 7), 1.1); }
  for (let i = 0; i < 5; i++) g[3].append(svgEl("ellipse", { cx: (15 + rnd() * 70).toFixed(1), cy: (40 + rnd() * 55).toFixed(1), rx: (2 + rnd() * 5).toFixed(1), ry: (1.5 + rnd() * 3).toFixed(1), class: "sang" }));
  return svg;
}
function fissuresArmure(seed) {
  const rnd = alea(seed), svg = svgEl("svg", { class: "fissures-armure", viewBox: "0 0 50 70", preserveAspectRatio: "none", "aria-hidden": "true" });
  const ix = 18 + rnd() * 14, iy = 26 + rnd() * 16;
  [1, 2, 3, 4].forEach((e) => {
    const g = svgEl("g", { "data-e": String(e) }); svg.append(g);
    for (let i = 0; i < 2 + e; i++) { const a = rnd() * Math.PI * 2; trait(g, fissure(rnd, ix, iy, a, 10 + e * 6 + rnd() * 10, 3 + e), 0.5 + e * 0.12); }
  });
  return svg;
}

// ---------------------------------------------------------------------
// Récit d'un tour (mêmes phrases que le lecteur de duels.html)
// ---------------------------------------------------------------------
function decrire(r, R, nom) {
  const L = [], add = (texte, genre = "") => L.push({ texte, genre });
  const F = r.frappeur ? nom(r.frappeur) : null, C = r.cible ? nom(r.cible) : null;
  const cote = (estA) => nom(estA ? R.attaquant : R.defenseur);
  const cibleEstA = r.cible === R.attaquant;
  if (R.round_debut_fatigue > 0 && r.round === R.round_debut_fatigue) add("La fatigue s'installe : chaque tour coûte maintenant des PV aux deux combattants.", "etat");
  if (F && r.etourdi) add(`${F} est étourdi et passe son tour.`, "etat");
  else if (F && r.paralysie) add(`${F} est paralysé : son arme ne répond plus.`, "etat");
  else if (F) {
    if (r.missile_lance) add(`${F} lance son stratagème : l'impact arrive dans quelques tours.`, "strat");
    if (r.strategeme_bouclier) add(`${F} déploie un bouclier${r.montant_bouclier ? " de " + r.montant_bouclier + " points" : ""}.`, "soin");
    if (r.soin_applique && r.soin_montant > 0) add(`${F} se soigne : +${r.soin_montant} PV.`, "soin");
    const surSoi = r.missile_lance || r.strategeme_bouclier || (r.soin_applique && r.frappeur === r.cible);
    if (!surSoi) {
      if (r.parade_reussie) add(`${C} pare le coup de ${F} et riposte : ${r.degats_ripostee || 0} dégâts !`, "parade");
      else if (r.touche) {
        const balles = r.degats_par_balle || [], crits = (r.crit_par_balle || []).filter(Boolean).length;
        let t = r.strategeme ? `Le stratagème de ${F} frappe ${C} : ${r.degats} dégâts` : `${F} frappe ${C} : ${r.degats} dégâts`;
        if (balles.length > 1) t += ` en ${balles.length} coups (${balles.join(" + ")})` + (crits ? `, dont ${crits} critique${crits > 1 ? "s" : ""}` : "");
        else if (r.crit) t += " (critique !)";
        if (r.bloque) t += ", en partie bloqués";
        add(t + ".", r.crit || crits ? "crit" : "coup");
      } else add(`${F} attaque, mais ${C} esquive.`, "rate");
    }
  }
  if (r.vol_de_vie > 0) add(`${F} récupère ${r.vol_de_vie} PV en vol de vie.`, "soin");
  if (r.degats_reflechis > 0) add(`${C} renvoie ${r.degats_reflechis} dégâts à ${F}.`, "coup");
  if (r.execution_active) add(`Exécution : +${r.execution_bonus} % de dégâts sur une cible affaiblie.`, "crit");
  if (r.etourdi_applique) add(`${C} est étourdi !`, "etat");
  if (r.riposte_stun_frappeur) add(`${F} est étourdi en retour par l'armure de ${C}.`, "etat");
  if (r.paralysie_applique) {
    const k = cibleEstA ? r.paralysie_duree_attaquant : r.paralysie_duree_defenseur;
    add(`${C} est paralysé${k ? " pour " + k + " tours" : ""} : plus d'attaque à l'arme.`, "etat");
  }
  if (r.poison_applique && C) add(`Le poison s'accumule sur ${C}.`, "poison");
  if (r.saignement_explosion_attaquant) add(`Le saignement de ${cote(true)} explose : −${r.degats_explosion_saignement_attaquant} PV bruts !`, "saignement");
  if (r.saignement_explosion_defenseur) add(`Le saignement de ${cote(false)} explose : −${r.degats_explosion_saignement_defenseur} PV bruts !`, "saignement");
  if (r.poison_tick && r.degats_poison) add(`Le poison ronge ${cote(r.poison_tick_attaquant)} : −${r.degats_poison} PV.`, "poison");
  if (r.brulure_tick && r.degats_brulure) add(`${cote(r.brulure_tick_attaquant)} brûle : −${r.degats_brulure} PV.`, "brulure");
  if (r.fatigue_tick && r.degats_fatigue) add(`La fatigue frappe les deux combattants : −${r.degats_fatigue} PV chacun.`, "etat");
  if (r.dernier_souffle_attaquant) add(`${cote(true)} refuse de tomber : dernier souffle !`, "parade");
  if (r.dernier_souffle_defenseur) add(`${cote(false)} refuse de tomber : dernier souffle !`, "parade");
  if (!L.length) add("Rien ne se passe ce tour-ci.", "etat");
  return L;
}
})();
