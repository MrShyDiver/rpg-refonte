"use strict";
(function () {
const { $, el, icone, fmt, ilYa, date } = App;

const TYPES = { duel: "Duel ciblé", auto_battle: "Combat automatique", entrainement: "Entraînement", ligue: "Ligue", tour: "Tour", arene: "Arène" };
const TRANCHES = { dans_tranche: "Combat équitable", au_dessus: "Cible plus forte", en_dessous: "Cible plus faible" };
// Estimation qualitative (décision projet : jamais de % exact). Le niveau vient du serveur, qui simule le duel avec les deux builds.
const NIVEAUX = { 5: "Largement favori", 4: "Favori", 3: "Serré", 2: "Outsider", 1: "Très risqué" };
const SEUIL_SAIGNEMENT = 20;
const PAR_PAGE = 20;
const MIN_TRANCHE_SANS_ECHO = 5;      // comme la fonction duel : en dessous, des échos sont proposés
const ENTRAINEMENTS_PAR_JOUR = 3, DEVOILEMENTS_PAR_JOUR = 3; // comme enregistrer_combat et devoiler_estimations
const PICTOS = {
  debut: "M6 5h2.5v14H6zM19 5v14l-9.5-7z", prec: "M17.5 5v14L8 12z", suiv: "M6.5 5v14L16 12z", fin: "M15.5 5H18v14h-2.5zM5 5v14l9.5-7z",
  lecture: "M7 4.5v15l12.5-7.5z", pause: "M6.5 5H10v14H6.5zM14 5h3.5v14H14z",
};
function picto(nom) {
  const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  s.setAttribute("viewBox", "0 0 24 24"); s.setAttribute("aria-hidden", "true");
  const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
  p.setAttribute("d", PICTOS[nom]); p.setAttribute("fill", "currentColor"); s.append(p);
  return s;
}
const sansAccent = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const bilan = (v, d, e) => `${fmt(v)} V · ${fmt(d)} D` + (e ? ` · ${fmt(e)} É` : "");
const params = new URLSearchParams(location.search);

App.demarrer("duels", async (main, ctx) => {
  const moi = ctx.joueur, login = moi.twitch_login;
  let maPuissance = 0;
  let parLogin = new Map([[login, moi]]);
  const nom = (l) => App.nomCombattant(l, parLogin);
  // Un écho (« echo:<login> ») s'affiche avec le portrait du joueur dont il reprend le build.
  const joueurDe = (l) => parLogin.get(App.echoDe(l) || l) || { display_name: nom(l) };
  let duels = [];
  const h2h = new Map(); // login adverse (ou « echo:<login> ») -> {v, d, e, n}
  let statut = { entrainements_restants: ENTRAINEMENTS_PAR_JOUR, devoilements_restants: DEVOILEMENTS_PAR_JOUR };

  // ------------------------------------------------------------------ Héros
  const joues = (moi.victoires || 0) + (moi.defaites || 0) + (moi.egalites || 0);
  const tickets = moi.tickets || 0;
  const abonne = App.peutEntrainer(moi);
  const horsClassement = App.horsClassement(moi);
  const versCombat = (l, mode, echo) => `combat.html?adversaire=${encodeURIComponent(l)}&mode=${mode}${echo ? "&echo=1" : ""}`;
  const chiffre = (valeur, libelle, detail) => el("div", { class: "chiffre" }, el("b", { class: "num", texte: valeur }), el("span", {}, libelle), detail ? el("small", { texte: detail }) : null);
  const lienAide = (ancre, sujet) => el("a", { class: "lien-aide", href: "aide.html#" + ancre, target: "_blank", rel: "noopener", "aria-label": "Aide : " + sujet + " (nouvel onglet)", title: "Aide : " + sujet, texte: "?" });
  const pluriel = (n, mot) => fmt(n) + " " + mot + (n > 1 ? "s" : "");
  // Boutons de choix (remplacent les listes déroulantes : toutes les options sont visibles).
  const groupeChoix = (libelle, options, valeur, surChoix) => {
    const g = el("div", { class: "choix", role: "group", "aria-label": libelle }, el("span", { class: "choix-lib", texte: libelle }),
      options.map(([v, t]) => el("button", { type: "button", "data-v": v, "aria-pressed": String(v === valeur), texte: t,
        onclick: () => { g.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === v))); surChoix(v); } })));
    return g;
  };
  const fait = (ic, contenu, cls) => el("li", { class: cls || null }, icone(ic), el("span", {}, contenu));
  const tuilePuissance = chiffre("…", ["Ta puissance", lienAide("puissance", "la puissance")], "Sert à trier tes adversaires");
  const ligneEntrainement = el("span");
  function majEntrainement() {
    const n = statut.entrainements_restants;
    ligneEntrainement.replaceChildren(...(abonne
      ? [el("b", { texte: "Entraînement gratuit" }), " : ", el("b", { class: "num", texte: `${n} sur ${ENTRAINEMENTS_PAR_JOUR}` }), ` restant${n > 1 ? "s" : ""} aujourd'hui` + (n < 1 ? ", retour demain." : "."), n < 1 ? null : el("span", { class: "detail-large", texte: " Lance-le depuis le bouton « Entraînement » d'un adversaire : aucune récompense, aucun risque." })]
      : [el("b", { texte: "Entraînement gratuit" }), ` (${ENTRAINEMENTS_PAR_JOUR} par jour, sans récompense ni risque) : réservé aux abonnés de la chaîne. `,
        el("a", { class: "lien", href: App.TWITCH_CHAINE, target: "_blank", rel: "noopener", texte: "S'abonner sur Twitch" })]));
  }
  majEntrainement();

  main.append(
    el("header", { class: "entete-page" }, el("div", {},
      el("h1", { texte: "Duels" }),
      el("p", { texte: "Lance un combat, choisis ta cible, et revois chaque combat tour par tour." }))),
    ...(horsClassement ? [el("p", { class: "hors-classement" }, el("span", { class: "pilule", texte: "Compte hors classement" }),
      el("span", { texte: "Le streamer et les comptes de test jouent sans bilan ni stats : tes victoires s'affichent dans l'historique mais ne comptent pas." }))] : []),
    el("div", { class: "grille-chiffres" },
      chiffre(fmt(moi.victoires || 0), "Victoires", `${pluriel(moi.defaites || 0, "défaite")} · ${pluriel(moi.egalites || 0, "égalité")}`),
      chiffre(joues ? fmt((100 * (moi.victoires || 0)) / joues) + " %" : "—", "Taux de victoire", joues ? pluriel(joues, "combat") : "Aucun combat pour l'instant"),
      chiffre(fmt(moi.serie_actuelle || 0), "Série en cours", "Record : " + fmt(moi.serie_record || 0)),
      tuilePuissance),
    el("section", { class: "section-page se-battre", "aria-labelledby": "titre-se-battre" },
      el("h2", { id: "titre-se-battre", texte: "Se battre" }),
      el("p", { class: "ligne-tickets" + (tickets < 1 ? " sans-ticket" : "") }, icone("i-ticket"),
        tickets < 1
          ? el("span", {}, el("b", { texte: "Plus de ticket de duel." }), " Tu en regagnes 5 par jour" + (moi.passif && moi.passif.ticket_prochain ? " (prochain dans " + App.dureeCourte(new Date(moi.passif.ticket_prochain) - Date.now()) + ")" : "") + ", et tes points de chaîne t'en donnent d'autres en live. ", el("a", { class: "lien", href: App.TWITCH_CHAINE, target: "_blank", rel: "noopener", texte: "Aller sur le live" }), lienAide("tickets", "les tickets de duel"))
          : el("span", {}, "Il te reste ", el("b", { class: "num", texte: pluriel(tickets, "ticket") + " de duel" }), ". Un combat automatique ou un duel ciblé en coûte un.", lienAide("tickets", "les tickets de duel"))),
      el("div", { class: "modes-combat" },
        el("article", { class: "mode-combat auto" },
          el("span", { class: "pilule", texte: "Le plus rapide" }),
          el("h3", { texte: "Combat automatique" }),
          el("p", {}, "Le jeu tire au sort un adversaire dans ta tranche de puissance. Personne de disponible ? Tu affrontes un ",
            el("a", { class: "lien", href: "aide.html#echo", target: "_blank", rel: "noopener", texte: "écho" }), " : l'équipement d'un autre joueur, ramené à ton niveau."),
          el("ul", { class: "faits" },
            fait("i-ticket", "1 ticket de duel"),
            fait("i-alerte", [el("b", { texte: "Récompenses réduites de 50 %" }), " par rapport à un duel ciblé : 6 médailles par victoire au lieu de 12."], "reduit")),
          tickets > 0
            ? el("a", { class: "btn-principal", href: "combat.html?mode=auto" }, icone("i-epees"), "Combat automatique")
            : el("button", { type: "button", class: "btn-principal", "aria-disabled": "true",
              onclick: () => App.toast("Plus de ticket de duel : tu en regagnes 5 par jour, et le live t'en donne tout de suite avec tes points de chaîne.", { titre: "Pas de ticket" }) }, icone("i-epees"), "Combat automatique")),
        el("article", { class: "mode-combat cible" },
          el("span", { class: "pilule", texte: "Récompenses complètes" }),
          el("h3", { texte: "Duel ciblé" }),
          el("p", { texte: "Tu choisis ta cible dans la liste. Moins tu as de chances de gagner, plus la victoire rapporte." }),
          el("ul", { class: "faits" },
            fait("i-ticket", "1 ticket de duel"),
            fait("i-medaille", ["Par victoire : 12 médailles en combat équitable, 20 si tu es l'outsider, 3 si tu es nettement ", el("span", { class: "insecable" }, "favori.", lienAide("duels", "les récompenses des duels"))])),
          el("a", { class: "btn-second vers-bas", href: "#adversaires" }, "Choisir un adversaire", icone("i-fleche")))),
      el("p", { class: "mention ligne-entrainement" }, ligneEntrainement, lienAide("entrainement", "l'entraînement"))));

  // ------------------------------------------------------------------ Adversaires
  const adv = { liste: [], echos: [], mode: "tranche", q: "", tri: "proche", vus: PAR_PAGE };
  const zoneAdv = el("div", {}, el("div", { class: "chargement", texte: "Chargement des joueurs…" }));
  const compteAdv = el("span", { class: "mention compte", "aria-live": "polite" });
  const ongletsAdv = el("div", { class: "onglets-b", role: "group", "aria-label": "Quels joueurs" },
    [["tranche", "Dans ta tranche"], ["tous", "Tous les joueurs"]].map(([v, t]) => el("button", { type: "button", "aria-pressed": String(v === adv.mode), "data-v": v, texte: t,
      onclick: () => { adv.mode = v; adv.vus = PAR_PAGE; majOnglets(ongletsAdv, v); rendreAdversaires(); } })));
  const zoneDevoiler = el("div", { class: "devoiler", tabindex: "-1" });
  main.append(el("section", { class: "section-page", id: "adversaires", tabindex: "-1" },
    el("h2", { texte: "Adversaires" }),
    el("p", { class: "sous" }, "Ta tranche regroupe les joueurs à 30 % de ta puissance : c'est un tri. La catégorie du duel (valeureux, équitable, déshonorable) est fixée par le serveur d'après tes chances de gagner, et s'affiche avant de lancer le combat.", lienAide("categories", "les catégories de combat")),
    el("div", { class: "barre-filtres" }, ongletsAdv,
      el("label", { class: "champ recherche" }, icone("i-recherche"), el("input", { type: "search", placeholder: "Chercher un joueur", "aria-label": "Chercher un joueur",
        oninput: (e) => { adv.q = sansAccent(e.target.value); adv.vus = PAR_PAGE; rendreAdversaires(); } })),
      compteAdv),
    el("div", { class: "barre-outils" },
      groupeChoix("Trier", [["proche", "Plus proches"], ["fort", "Plus forts"], ["victoires", "Plus de victoires"], ["nom", "Nom"]], adv.tri, (v) => { adv.tri = v; rendreAdversaires(); }),
      zoneDevoiler),
    zoneAdv));

  // Estimations : verrouillées. Un abonné en dévoile une à la fois (un adversaire), 3 par jour ;
  // celles déjà dévoilées restent visibles sur cet appareil jusqu'à la fin de la journée.
  const CLE_DEVOILE = "duels-estimations", aujourdhui = new Date().toDateString();
  const devoiles = new Map();   // login -> niveau d'estimation (1 à 5), calculé par le serveur
  try { const c = JSON.parse(localStorage.getItem(CLE_DEVOILE) || "null"); if (c && c.jour === aujourdhui && c.niveaux) Object.entries(c.niveaux).forEach(([l, n]) => devoiles.set(l, n)); } catch (e) { /* navigation privée */ }
  const blocage = () => (!abonne ? "Dévoiler une estimation est réservé aux abonnés de la chaîne."
    : statut.devoilements_restants < 1 ? "Tu as déjà dévoilé 3 estimations aujourd'hui : reviens demain." : null);
  function rendreDevoiler() {
    const reste = statut.devoilements_restants;
    zoneDevoiler.replaceChildren(icone("i-cadenas"),
      el("span", { class: "mention" }, "Estimations : ", !abonne ? "dévoilement réservé aux abonnés"
        : el("b", { class: "num", texte: reste < 1 ? "0 dévoilement restant, retour demain" : `${reste} dévoilement${reste > 1 ? "s" : ""} restant${reste > 1 ? "s" : ""} aujourd'hui` }),
        el("span", { class: "detail-large", texte: abonne && reste > 0 ? " · un adversaire à la fois" : "" }),
        lienAide("estimations", "les estimations")));
  }
  async function devoiler(login, b) {
    const bloque = blocage();
    if (bloque) { App.toast(bloque, { titre: abonne ? "Limite du jour atteinte" : "Réservé aux abonnés", icone: "i-cadenas" }); return; }
    b.disabled = true;
    try {
      const r = await App.estimerDuel(login, true);   // le serveur simule le duel et compte le dévoilement
      if (r && r.devoilements_restants != null) statut.devoilements_restants = r.devoilements_restants;
      devoiles.set(login, r.niveau);
      try { localStorage.setItem(CLE_DEVOILE, JSON.stringify({ jour: aujourdhui, niveaux: Object.fromEntries(devoiles) })); } catch (e) { /* navigation privée */ }
      rendreDevoiler(); rendreAdversaires();
      const ligne = zoneAdv.querySelector(`[data-login="${login}"] .estimation`);
      if (ligne) ligne.focus({ preventScroll: true });
    } catch (e) { App.erreur(e); b.disabled = false; }
  }
  rendreDevoiler();

  // ------------------------------------------------------------------ Historique
  const hist = { mode: "moi", type: "", q: sansAccent(params.get("contre") || ""), vus: PAR_PAGE };
  const zoneHist = el("div", {}, el("div", { class: "chargement", texte: "Chargement des combats…" }));
  const zoneH2h = el("div");
  const champHist = el("input", { type: "search", placeholder: "Adversaire", "aria-label": "Filtrer par adversaire", value: params.get("contre") || "",
    oninput: (e) => { hist.contre = null; hist.q = sansAccent(e.target.value); hist.vus = PAR_PAGE; rendreHistorique(); } });
  const ongletsHist = el("div", { class: "onglets-b", role: "group", "aria-label": "Quels combats" },
    [["moi", "Mes combats"], ["tous", "Tous les combats"]].map(([v, t]) => el("button", { type: "button", "aria-pressed": String(v === hist.mode), "data-v": v, texte: t,
      onclick: () => { hist.mode = v; hist.vus = PAR_PAGE; majOnglets(ongletsHist, v); rendreHistorique(); } })));
  const compteHist = el("span", { class: "mention compte", "aria-live": "polite" });
  main.append(el("section", { class: "section-page", id: "historique" },
    el("h2", { texte: "Historique" }),
    el("p", { class: "sous", texte: "Chaque combat, en live ou sur le site : regarde-le en cinématique ou relis-le tour par tour." }),
    el("div", { class: "barre-filtres" }, ongletsHist,
      el("label", { class: "champ recherche" }, icone("i-recherche"), champHist),
      compteHist),
    el("div", { class: "barre-outils" },
      groupeChoix("Type", [["", "Tous"], ...Object.entries(TYPES)], hist.type, (v) => { hist.type = v; hist.vus = PAR_PAGE; rendreHistorique(); })),
    zoneH2h, zoneHist));

  function majOnglets(groupe, v) { groupe.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === v))); }

  // ------------------------------------------------------------------ Données
  // Les puissances sont lues en base (players.puissance) : plus aucun build recalculé ici.
  let joueurs, rangs = new Map(), revanches = new Map();   // primes (série de ligue) et revanches gratuites
  try {
    const [js, lignes, st, rl] = await Promise.all([App.api.joueurs(), App.api.duels(), App.rpc("mon_statut_duel").catch((e) => { console.warn(e); return null; }), App.api.rangsLigue().catch(() => [])]);
    joueurs = js; duels = lignes;
    rangs = new Map(rl.map((r) => [r.player_id, r])); revanches = App.revanches(duels, login);
    if (st) { statut = { ...statut, ...st }; majEntrainement(); rendreDevoiler(); }
  } catch (e) {
    App.erreur(e);
    zoneHist.replaceChildren(erreurBloc("L'historique n'a pas pu se charger."));
    zoneAdv.replaceChildren(erreurBloc("La liste des joueurs n'a pas pu se charger."));
    return;
  }
  if (joueurs.some((j) => j.puissance_perimee)) {
    // Des builds ont changé : le serveur met leurs puissances à jour, puis on relit la liste.
    zoneAdv.replaceChildren(el("div", { class: "chargement", texte: "Mise à jour des puissances…" }));
    try { await App.rafraichirPuissances(); joueurs = await App.api.joueurs(); } catch (e) { console.warn(e); }
  }
  parLogin = new Map(joueurs.map((j) => [j.twitch_login, j]));
  const moiListe = parLogin.get(login);
  parLogin.set(login, moi);
  maPuissance = (moiListe && moiListe.puissance) || Math.round((App.puissance(moi, App.niveaux(), ctx.loadout) || {}).powerLevel || 0);
  tuilePuissance.querySelector("b").textContent = maPuissance ? fmt(maPuissance) : "—";
  adv.liste = joueurs.filter((j) => j.twitch_login !== login).map((j) => ({ j, puissance: j.puissance || 0 }));
  for (const d of duels) {
    const adverse = d.attaquant_login === login ? d.defenseur_login : d.defenseur_login === login ? d.attaquant_login : null;
    if (!adverse) continue;
    const s = h2h.get(adverse) || { v: 0, d: 0, e: 0, n: 0 };
    s.n++; if (d.egalite) s.e++; else if (d.vainqueur_login === login) s.v++; else s.d++;
    h2h.set(adverse, s);
  }
  rendreHistorique();
  rendreAdversaires();
  {
    const id = params.get("replay");
    const cible = id && duels.find((d) => String(d.id) === id);
    if (cible) ouvrirReplay(cible);
  }

  // Échos : proposés quand moins de 5 joueurs actifs sont dans la tranche. C'est le serveur qui
  // dresse la liste : seuls les builds qu'il sait ramener à ton niveau y figurent.
  const actifs = adv.liste.filter((x) => App.estClasse(x.j));
  const nbProchesActifs = actifs.filter((x) => App.dansTranche(x.puissance, maPuissance)).length;
  if (maPuissance && nbProchesActifs < MIN_TRANCHE_SANS_ECHO) {
    try {
      const valides = new Set((await App.echos(maPuissance)).map((e) => e.login));
      adv.echos = actifs.filter((x) => valides.has(x.j.twitch_login)).sort((a, b) => ecart(a) - ecart(b));
      rendreAdversaires();
    } catch (e) { console.warn(e); }
  }

  function ecart(x) { return x.puissance && maPuissance ? Math.abs(Math.log(x.puissance / maPuissance)) : 99; }
  function erreurBloc(t) {
    return el("div", { class: "vide" }, el("b", { texte: t }), "Vérifie ta connexion, puis réessaie.",
      el("button", { type: "button", class: "btn-second", style: { marginTop: "12px" }, texte: "Réessayer", onclick: () => location.reload() }));
  }

  function rendreAdversaires() {
    const tranche = adv.liste.filter((x) => App.dansTranche(x.puissance, maPuissance));
    ongletsAdv.querySelector('[data-v="tranche"]').textContent = `Dans ta tranche (${tranche.length})`;
    ongletsAdv.querySelector('[data-v="tous"]').textContent = `Tous les joueurs (${adv.liste.length})`;
    let l = adv.mode === "tranche" ? tranche : adv.liste;
    if (adv.q) l = l.filter((x) => sansAccent(x.j.display_name).includes(adv.q) || x.j.twitch_login.includes(adv.q));
    const tris = { proche: (a, b) => ecart(a) - ecart(b), fort: (a, b) => b.puissance - a.puissance, victoires: (a, b) => (b.j.victoires || 0) - (a.j.victoires || 0),
      nom: (a, b) => sansAccent(a.j.display_name).localeCompare(sansAccent(b.j.display_name)) };
    l = [...l].sort(tris[adv.tri]);
    const echos = adv.mode === "tranche" && !adv.q ? adv.echos : [];
    compteAdv.textContent = adv.q ? pluriel(l.length, "joueur") + " trouvé" + (l.length > 1 ? "s" : "") : echos.length ? "+ " + pluriel(echos.length, "écho") : "";
    const blocs = [];
    const raisons = [
      tickets < 1 ? el("span", {}, icone("i-ticket"), "Plus de ticket : « Défier » est désactivé. ", el("a", { class: "lien", href: App.TWITCH_CHAINE, target: "_blank", rel: "noopener", texte: "En gagner sur le live" })) : null,
      !abonne ? el("span", {}, icone("i-cadenas"), "« Entraînement » est réservé aux abonnés de la chaîne.")
        : statut.entrainements_restants < 1 ? el("span", {}, icone("i-cadenas"), "Tes 3 entraînements du jour sont faits : retour demain.") : null,
    ].filter(Boolean);
    if (raisons.length) blocs.push(el("p", { class: "etat-liste" }, raisons));
    const entetes = () => el("div", { class: "entetes-adv", "aria-hidden": "true" }, el("span"), el("span", { texte: "Joueur" }), el("span", { texte: "Puissance" }), el("span", { texte: "Estimation" }), el("span"));
    if (l.length) {
      blocs.push(entetes(), el("ul", { class: "liste-adversaires" }, l.slice(0, adv.vus).map((x) => ligneAdversaire(x, false))));
      if (l.length > adv.vus) blocs.push(el("button", { type: "button", class: "btn-second plus", texte: `Voir plus (${l.length - adv.vus})`, onclick: () => { adv.vus += PAR_PAGE; rendreAdversaires(); } }));
    } else {
      blocs.push(el("div", { class: "vide" }, el("b", { texte: adv.q ? "Aucun joueur ne correspond." : "Personne dans ta tranche pour l'instant." }),
        adv.q ? "Essaie un autre nom." : echos.length ? "Affronte un écho ci-dessous, ou vise un joueur hors de ta tranche." : "Vise un joueur plus fort ou plus faible : la récompense s'adapte.",
        adv.mode === "tranche" && !adv.q ? el("button", { type: "button", class: "btn-second", style: { marginTop: "12px" }, texte: "Voir tous les joueurs", onclick: () => ongletsAdv.querySelector('[data-v="tous"]').click() }) : null));
    }
    if (echos.length) {
      blocs.push(el("div", { class: "bloc-echos" },
        el("h3", {}, "Échos", lienAide("echo", "les échos")),
        el("p", { class: "sous", texte: "Moins de 5 joueurs actifs dans ta tranche : affronte l'équipement et les stats d'un autre joueur, ramenés à ton niveau. Lui ne gagne ni ne perd rien, et tu touches les récompenses d'un combat équitable." }),
        l.length ? null : entetes(),
        el("ul", { class: "liste-adversaires" }, echos.map((x) => ligneAdversaire(x, true)))));
    }
    zoneAdv.replaceChildren(...blocs);
  }

  function ligneAdversaire({ j, puissance }, echo) {
    const cle = echo ? "echo:" + j.twitch_login : j.twitch_login;
    const nomJ = j.display_name || j.twitch_login;
    const s = h2h.get(cle), n = s ? s.n : 0;
    const niv = echo ? null : devoiles.get(j.twitch_login), est = niv ? [0, niv, NIVEAUX[niv]] : null;
    const prime = echo || horsClassement ? 0 : App.primeDe(rangs.get(j.id)), revanche = !echo && revanches.has(j.twitch_login);
    const pct = !echo && puissance && maPuissance ? Math.round((puissance / maPuissance - 1) * 100) : null;
    const restants = statut.entrainements_restants;
    const lienProfil = el("a", { href: "profil.html?joueur=" + encodeURIComponent(j.twitch_login), texte: nomJ });
    return el("li", { class: "adversaire" + (echo ? " echo" : ""), "data-login": echo ? null : j.twitch_login },
      App.avatar(j, 44),
      el("div", { class: "ident" },
        echo ? el("b", {}, "Écho de ", lienProfil) : lienProfil,
        echo ? el("span", { class: "mention", texte: "Ramené à ton niveau" })
          : App.horsClassement(j) ? el("span", { class: "mention", texte: "Hors classement" }) : el("span", { class: "mention num", texte: bilan(j.victoires || 0, j.defaites || 0, j.egalites || 0) }),
        prime ? el("span", { class: "pilule prime", title: "En série de victoires en ligue : le battre en duel rapporte une prime (sauf si tu es nettement favori)" }, icone("i-medaille"), "Prime +" + fmt(prime)) : null,
        revanche ? el("span", { class: "pilule revanche", title: "Il t'a battu en duel : ta revanche est gratuite pendant 24 h", texte: "Revanche gratuite" }) : null),
      el("div", { class: "puissance" }, echo ? el("span", { class: "ajustee", title: "Sa puissance est ajustée à la tienne", texte: "Ajustée" }) : el("b", { class: "num", texte: puissance ? fmt(puissance) : "—" }),
        echo ? null : el("span", { class: "num", texte: pct == null ? "puissance" : pct === 0 ? "comme toi" : Math.abs(pct) + " % de " + (pct > 0 ? "plus" : "moins") })),
      echo ? el("div", { class: "estimation cale", title: "Pas d'estimation : l'écho est ramené à ton niveau" })
        : !devoiles.has(j.twitch_login) ? el("div", { class: "estimation verrou" },
          el("button", { type: "button", class: "btn-second petit b-devoiler", "aria-disabled": blocage() ? "true" : null, title: blocage() || "Utilise 1 de tes dévoilements du jour",
            "aria-label": "Dévoiler l'estimation contre " + nomJ, onclick: (e) => devoiler(j.twitch_login, e.currentTarget) }, icone("i-cadenas"), "Dévoiler"))
        : est ? el("div", { class: "estimation", "data-niveau": est[1], tabindex: "-1" },
          el("span", { class: "jauge-est", "aria-hidden": "true" }, [1, 2, 3, 4, 5].map((k) => el("i", { class: k <= est[1] ? "plein" : null }))),
          el("span", { texte: est[2] })) : el("div", { class: "estimation mention", texte: "Indisponible" }),
      el("div", { class: "actions" },
        n ? el("button", { type: "button", class: "btn-second petit b-nos", onclick: () => voirContre(cle) }, "Nos duels ", el("span", { class: "num", texte: "(" + n + ")" }))
          : el("button", { type: "button", class: "btn-second petit b-nos", "aria-disabled": "true", title: "Vous ne vous êtes jamais affrontés",
            onclick: () => App.toast((echo ? "Tu n'as jamais affronté cet écho." : `Tu n'as jamais affronté ${nomJ}.`), { titre: "Aucun combat entre vous" }) }, "Nos duels ", el("span", { class: "num", texte: "(0)" })),
        !abonne
          ? el("button", { type: "button", class: "btn-second petit b-entr verrouille", "aria-disabled": "true", title: "Réservé aux abonnés de la chaîne",
            onclick: () => App.toast("L'entraînement gratuit est réservé aux abonnés Twitch de la chaîne.", { titre: "Réservé aux abonnés", icone: "i-cadenas" }) }, icone("i-cadenas"), "Entraînement")
          : restants < 1
            ? el("button", { type: "button", class: "btn-second petit b-entr", "aria-disabled": "true", title: "3 entraînements par jour",
              onclick: () => App.toast("Tu as fait tes 3 entraînements du jour : reviens demain.", { titre: "Limite du jour atteinte" }) }, "Entraînement")
            : el("a", { class: "btn-second petit b-entr", href: versCombat(j.twitch_login, "entrainement", echo), title: `Gratuit, sans récompense · ${restants} sur ${ENTRAINEMENTS_PAR_JOUR} restant${restants > 1 ? "s" : ""} aujourd'hui` }, "Entraînement"),
        tickets > 0 || revanche
          ? el("a", { class: "btn-principal btn-defier", href: versCombat(j.twitch_login, "classe", echo), title: revanche ? "Revanche gratuite" : "Coûte 1 ticket de duel",
            "aria-label": "Défier " + (echo ? "l'écho de " : "") + nomJ + " en duel ciblé (" + (revanche ? "revanche gratuite" : "1 ticket") + ")" }, icone("i-epees"), revanche ? "Revanche" : "Défier")
          : el("button", { type: "button", class: "btn-principal btn-defier", "aria-disabled": "true", title: "Plus de ticket de duel : 5 par jour, et plus en live",
            onclick: () => App.toast("Plus de ticket de duel : tu en regagnes 5 par jour, et le live t'en donne tout de suite avec tes points de chaîne.", { titre: "Pas de ticket" }) }, icone("i-epees"), "Défier")));
  }

  function voirContre(l) {
    hist.mode = "moi"; hist.contre = l; hist.q = sansAccent(nom(l)); hist.vus = PAR_PAGE; champHist.value = nom(l);
    majOnglets(ongletsHist, "moi"); rendreHistorique();
    $("#historique").scrollIntoView({ behavior: App.reduit ? "auto" : "smooth", block: "start" });
  }

  // ------------------------------------------------------------------ Historique
  function rendreHistorique() {
    const mien = (d) => d.attaquant_login === login || d.defenseur_login === login;
    let l = hist.mode === "moi" ? duels.filter(mien) : duels;
    if (hist.type) l = l.filter((d) => d.type === hist.type);
    const adverses = (d) => (mien(d) && hist.mode === "moi" ? [d.attaquant_login === login ? d.defenseur_login : d.attaquant_login] : [d.attaquant_login, d.defenseur_login]);
    if (hist.contre) l = l.filter((d) => adverses(d).includes(hist.contre));
    else if (hist.q) l = l.filter((d) => adverses(d).some((a) => a.includes(hist.q) || sansAccent(nom(a)).includes(hist.q)));
    compteHist.textContent = l.length + " combat" + (l.length > 1 ? "s" : "");

    // Face-à-face : quand le filtre ne laisse qu'un seul adversaire dans mes duels.
    const uniques = new Set(l.flatMap(adverses));
    zoneH2h.replaceChildren();
    if (hist.mode === "moi" && hist.q && uniques.size === 1) {
      const a = [...uniques][0], s = { v: 0, d: 0, e: 0 };
      l.forEach((d) => { if (d.egalite) s.e++; else if (d.vainqueur_login === login) s.v++; else s.d++; });
      const j = joueurDe(a);
      zoneH2h.append(el("div", { class: "face-a-face panneau-b" },
        el("div", { class: "fa-duo" }, App.avatar(moi, 40), el("span", { class: "vs", texte: "VS" }), App.avatar(j, 40)),
        el("div", {}, el("b", { texte: "Toi contre " + nom(a) }),
          el("span", { class: "mention", texte: l.length + " combat" + (l.length > 1 ? "s" : "") + (hist.type ? " de ce type" : "") + " · dernier " + ilYa(l[0].joue_le) })),
        el("div", { class: "fa-score num" },
          el("span", { class: "v", texte: s.v + " V" }), el("span", { class: "d", texte: s.d + " D" }), el("span", { class: "e", texte: s.e + " É" }))));
    }

    if (!l.length) {
      zoneHist.replaceChildren(el("div", { class: "vide" },
        el("b", { texte: hist.mode === "moi" && !hist.q && !hist.type ? "Tu n'as pas encore combattu." : "Aucun combat ne correspond." }),
        hist.mode === "moi" && !hist.q && !hist.type
          ? el("span", {}, "Lance un combat automatique ou défie un adversaire ci-dessus. ",
            el("a", { href: "#adversaires", texte: "Choisir un adversaire" }), ".")
          : "Change de filtre ou regarde tous les duels."));
      return;
    }
    zoneHist.replaceChildren(...[el("ul", { class: "liste-duels" }, l.slice(0, hist.vus).map(ligneDuel)),
      l.length > hist.vus ? el("button", { type: "button", class: "btn-second plus", texte: `Voir plus (${l.length - hist.vus})`, onclick: () => { hist.vus += PAR_PAGE; rendreHistorique(); } }) : null].filter(Boolean));
  }

  function resultat(d) {
    if (d.attaquant_login !== login && d.defenseur_login !== login) return null;
    return d.egalite ? ["egalite", "Égalité"] : d.vainqueur_login === login ? ["victoire", "Victoire"] : ["defaite", "Défaite"];
  }

  function ligneDuel(d) {
    const res = resultat(d), fichier = d.replay && (d.replay.fichier || d.replay.source === "site");
    const jeSuisA = d.attaquant_login === login;
    let participants, puissances;
    if (res && hist.mode === "moi") {
      const a = jeSuisA ? d.defenseur_login : d.attaquant_login;
      participants = el("span", { class: "participants" }, App.avatar(joueurDe(a), 30),
        el("span", {}, el("span", { class: "mention", texte: jeSuisA ? "Tu attaques " : "Tu défends contre " }), el("b", { texte: nom(a) })));
      puissances = [jeSuisA ? d.power_attaquant : d.power_defenseur, jeSuisA ? d.power_defenseur : d.power_attaquant];
    } else {
      const g = d.egalite ? null : d.vainqueur_login, p = d.vainqueur_login === d.defenseur_login ? d.attaquant_login : d.defenseur_login;
      participants = el("span", { class: "participants" }, App.avatar(joueurDe(d.attaquant_login), 30),
        g ? el("span", {}, el("b", { texte: nom(g) }), el("span", { class: "mention", texte: " bat " }), nom(p))
          : el("span", {}, el("b", { texte: nom(d.attaquant_login) }), el("span", { class: "mention", texte: " et " }), el("b", { texte: nom(d.defenseur_login) }), el("span", { class: "mention", texte: " : égalité" })));
      puissances = [d.power_attaquant, d.power_defenseur];
    }
    const contenu = [
      el("span", { class: "resultat " + (res ? res[0] : "neutre"), texte: res ? res[1] : "" }),
      el("span", { class: "centre" }, participants,
        el("span", { class: "details" },
          el("span", { class: "type-duel", "data-type": d.type || "autre", texte: TYPES[d.type] || "Combat" }),
          d.echo_de ? el("span", { class: "type-duel", "data-type": "echo", texte: "Écho" }) : null,
          TRANCHES[d.tranche] ? el("span", { class: "mention", texte: TRANCHES[d.tranche] }) : null)),
      el("span", { class: "puissances num", title: "Puissances au moment du combat" }, el("small", { class: "mention", texte: "Puissances" }), fmt(puissances[0]), el("span", { class: "mention", texte: " vs " }), fmt(puissances[1])),
      el("span", { class: "tours num mention", texte: d.nb_rounds ? d.nb_rounds + " tours" : "" }),
      el("time", { class: "mention", datetime: d.joue_le, title: date(d.joue_le, true), texte: ilYa(d.joue_le) }),
      fichier
        ? el("span", { class: "revoir" },
          el("a", { class: "regarder", href: "combat.html?duel=" + encodeURIComponent(d.id), "aria-label": `Regarder en cinématique : ${nom(d.attaquant_login)} contre ${nom(d.defenseur_login)}, ${ilYa(d.joue_le)}` }, "Regarder", icone("i-fleche")),
          el("button", { type: "button", class: "detail", "aria-label": `Détail tour par tour : ${nom(d.attaquant_login)} contre ${nom(d.defenseur_login)}`, onclick: () => ouvrirReplay(d) }, "Détail"))
        : el("span", { class: "mention revoir", texte: "Sans replay" }),
    ];
    return el("li", {}, el("div", { class: "duel" }, contenu));
  }

  // ------------------------------------------------------------------ Replay
  async function ouvrirReplay(d) {
    const corps = el("div", { class: "replay" }, el("div", { class: "chargement", texte: "Chargement du replay…" }));
    const pied = el("div", { class: "commandes" });
    let arreter = () => {};
    const t = App.tiroir({ titre: nom(d.attaquant_login) + " contre " + nom(d.defenseur_login), contenu: corps, pied, surFermeture: () => arreter() });
    t.classList.add("tiroir-replay");
    pied.parentElement.hidden = true;
    let R;
    try { R = await App.api.replayDuel(d); }
    catch (e) {
      corps.replaceChildren(el("div", { class: "vide" }, icone("i-alerte", "ic-vide"), el("b", { texte: "Replay indisponible" }),
        "Ce combat n'a pas pu être rechargé (" + e.message + "). Le résultat, lui, est bien enregistré : ",
        el("strong", { texte: d.egalite ? "égalité" : "victoire de " + nom(d.vainqueur_login) }), d.nb_rounds ? " en " + d.nb_rounds + " tours." : "."));
      return;
    }
    if (!t.isConnected) return;
    pied.parentElement.hidden = false;
    arreter = lecteur(corps, pied, R, d, t);
  }

  const decrire = (r, R) => App.decrireTour(r, R, nom);

  function lecteur(corps, pied, R, d, tiroir) {
    const rounds = R.rounds || [], n = rounds.length;
    const lignes = rounds.map((r) => decrire(r, R));
    // États successifs : états[p] = situation après p tours joués.
    const etats = [{ a: R.pv_max_attaquant, b: R.pv_max_defenseur, ma: R.pv_max_attaquant, mb: R.pv_max_defenseur, r: null }];
    rounds.forEach((r) => {
      const p = etats[etats.length - 1];
      etats.push({ a: r.pv_attaquant_apres ?? p.a, b: r.pv_defenseur_apres ?? p.b, ma: r.pv_max_attaquant_apres ?? p.ma, mb: r.pv_max_defenseur_apres ?? p.mb, r });
    });
    const gagnant = R.egalite ? null : (R.vainqueur || d.vainqueur_login);
    let pos = 0, vitesse = 1, timer = null;

    const cote = (suffixe) => {
      const lg = R[suffixe], j = joueurDe(lg);
      const pvMax = R["pv_max_" + suffixe] || 1;
      const barre = el("i"), txt = el("span", { class: "num" }), etatsZone = el("div", { class: "statuts" }), bloc = el("div", { class: "combattant" + (lg === login ? " moi" : "") },
        el("div", { class: "fiche-combattant" }, App.avatar(j, 46), el("div", { class: "ident" }, el("b", { texte: nom(lg) }),
          el("span", { class: "mention num", texte: "Puissance " + fmt(R["power_" + suffixe] ?? d["power_" + suffixe]) }))),
        el("div", { class: "pv" }, el("div", { class: "barre-pv", role: "img" }, barre), txt), etatsZone);
      const s = suffixe === "attaquant" ? "a" : "b";
      return {
        bloc,
        maj(e, prec, anime) {
          const pv = Math.max(0, e[s]), ratio = pv / pvMax;
          barre.style.transform = "scaleX(" + Math.min(1, ratio) + ")";
          barre.className = ratio <= 0.25 ? "bas" : ratio <= 0.5 ? "moyen" : "";
          txt.textContent = fmt(pv) + " / " + fmt(e["m" + s]) + " PV";
          barre.parentElement.setAttribute("aria-label", nom(lg) + " : " + fmt(pv) + " PV sur " + fmt(e["m" + s]));
          etatsZone.replaceChildren(...statuts(e.r, suffixe));
          if (anime && prec) {
            const delta = e[s] - prec[s];
            if (delta) popper(bloc, (delta > 0 ? "+" : "−") + Math.abs(delta), delta > 0 ? "soin" : e.r && e.r.crit && e.r.cible === lg ? "crit" : "");
          }
          bloc.classList.toggle("gagnant", pos === n && gagnant === lg);
          bloc.classList.toggle("vaincu", pos === n && !!gagnant && gagnant !== lg);
        },
      };
    };
    function statuts(r, s) {
      if (!r) return [];
      const l = [];
      const k = (v, t, c) => v && l.push(el("span", { class: "statut " + c, texte: t }));
      k(r["shield_" + s] > 0, "Bouclier " + r["shield_" + s], "bouclier");
      k(r["poison_duree_" + s] > 0, "Poison " + r["poison_duree_" + s], "poison");
      k(r["brulure_duree_" + s] > 0, "Brûlure " + r["brulure_duree_" + s], "brulure");
      k(r["paralysie_duree_" + s] > 0, "Paralysie " + r["paralysie_duree_" + s], "paralysie");
      k(r["saignement_stacks_" + s] > 0, `Saignement ${r["saignement_stacks_" + s]}/${SEUIL_SAIGNEMENT}`, "saignement");
      k(r["anti_heal_actif_" + s], "Anti-soin", "antisoin");
      k(r["marque_active_" + s], "Marqué", "marque");
      k(r["brise_def_actif_" + s], "Armure brisée", "brise");
      k(r["frenesie_bonus_" + s] > 0, "Frénésie +" + r["frenesie_bonus_" + s], "frenesie");
      return l;
    }
    function popper(bloc, texte, genre) {
      if (App.reduit) return;
      const p = el("span", { class: "pop " + genre, texte, "aria-hidden": "true" });
      bloc.append(p);
      setTimeout(() => p.remove(), 1000);
      if (genre !== "soin") { bloc.classList.remove("secoue"); void bloc.offsetWidth; bloc.classList.add("secoue"); }
    }

    const A = cote("attaquant"), B = cote("defenseur");
    const direct = el("p", { class: "direct", "aria-live": "polite" });
    const bandeau = el("div", { class: "bandeau-fin", hidden: true });
    const journal = el("ol", { class: "journal", "aria-label": "Déroulé du combat" });
    const scene = el("div", { class: "scene" }, A.bloc, el("span", { class: "vs", "aria-hidden": "true", texte: "VS" }), B.bloc);

    // Builds (le replay ne donne que les noms : on retrouve la carte par le nom).
    const parNom = new Map(App.objets.map((o) => [sansAccent(o.nom), o]));
    const build = (suffixe) => {
      const b = R["build_" + suffixe] || {};
      return el("div", { class: "build" }, el("h4", { texte: nom(R[suffixe]) }),
        el("div", { class: "build-cartes" }, [["arme", "Arme"], ["offhand", "Main gauche"], ["torso", "Armure"], ["strategeme", "Stratagème"]].map(([k, lib]) => {
          const x = b[k] || {}, o = x.nom ? parNom.get(sansAccent(x.nom)) : null;
          if (o) return App.carte(o, { niveau: Math.min(x.niveau || 0, App.niveauMax(o.rarete)), equipe: false });
          return el("div", { class: "case-vide" }, el("span", { texte: x.nom || lib }), el("small", { texte: x.nom ? "Objet retiré" : "Vide" }));
        })));
    };

    // Commandes
    const bouton = (p, lib, f) => el("button", { type: "button", class: "bouton-icone", "aria-label": lib, title: lib, onclick: f }, picto(p));
    const lecture = el("button", { type: "button", class: "btn-lecture", onclick: () => (timer ? pause() : jouer()) });
    const curseur = el("input", { type: "range", min: 0, max: n, value: 0, "aria-label": "Tour du combat", oninput: (e) => { pause(); aller(Number(e.target.value)); } });
    const compteur = el("output", { class: "num" });
    const vitesses = el("div", { class: "onglets-b vitesses", role: "group", "aria-label": "Vitesse de lecture" },
      [1, 2, 4].map((v) => el("button", { type: "button", "aria-pressed": String(v === 1), texte: v + "×",
        onclick: (e) => { vitesse = v; vitesses.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b === e.currentTarget))); } })));
    pied.append(
      el("div", { class: "transport" }, bouton("debut", "Revenir au début", () => { pause(); aller(0); }), bouton("prec", "Tour précédent", () => { pause(); aller(pos - 1); }),
        lecture, bouton("suiv", "Tour suivant", () => { pause(); aller(pos + 1); }), bouton("fin", "Aller au résultat", () => { pause(); aller(n); })),
      el("div", { class: "piste" }, curseur, compteur), vitesses);

    const infos = el("p", { class: "mention infos-duel" }, date(d.joue_le, true), " · ", TYPES[d.type] || "Combat", TRANCHES[R.tranche || d.tranche] ? " · " + TRANCHES[R.tranche || d.tranche] : "");
    corps.replaceChildren(scene, bandeau, direct, journal,
      el("section", { class: "builds" }, el("h3", { texte: "Les builds" }), el("div", { class: "builds-duo" }, build("attaquant"), build("defenseur"))), infos);

    function remplirBandeau() {
      const res = resultat(d);
      const titre = R.egalite ? "Égalité" : "Victoire de " + nom(gagnant);
      const perso = res ? { victoire: "Tu as gagné ce combat.", defaite: "Tu as perdu celui-là. Prends ta revanche depuis la liste des adversaires.", egalite: "Personne ne cède." }[res[0]] : "";
      const stat = (lib, a, b) => el("div", {}, el("span", { class: "mention", texte: lib }), el("b", { class: "num", texte: fmt(a || 0) + " · " + fmt(b || 0) }));
      bandeau.className = "bandeau-fin " + (res ? res[0] : "neutre");
      bandeau.replaceChildren(el("div", {}, el("b", { class: "titre-fin", texte: titre }), perso ? el("span", { texte: perso }) : null),
        el("div", { class: "stats-fin" }, stat("Dégâts infligés", R.degats_infliges_attaquant, R.degats_infliges_defenseur), stat("Plus gros coup", R.plus_gros_coup_attaquant, R.plus_gros_coup_defenseur), el("div", {}, el("span", { class: "mention", texte: "Tours" }), el("b", { class: "num", texte: String(n) }))));
    }

    function aller(p, anime = false) {
      p = Math.max(0, Math.min(n, p));
      const prec = etats[pos];
      pos = p;
      A.maj(etats[pos], prec, anime); B.maj(etats[pos], prec, anime);
      curseur.value = pos;
      compteur.textContent = pos === 0 ? "Début" : pos >= n ? "Fin" : "Tour " + rounds[pos - 1].round + " / " + n;
      curseur.setAttribute("aria-valuetext", compteur.textContent);
      journal.replaceChildren(...rounds.slice(0, pos).map((r, i) => el("li", { "aria-current": i === pos - 1 ? "step" : null },
        el("button", { type: "button", onclick: () => { pause(); aller(i + 1); } }, el("span", { class: "no-tour num", texte: "T" + (r.tour ?? r.round) }),
          el("span", { class: "lignes-tour" }, lignes[i].map((x) => el("span", { class: "evt " + x.genre, texte: x.texte })))))));
      journal.scrollTop = journal.scrollHeight;
      journal.hidden = pos === 0;
      bandeau.hidden = pos < n;
      if (pos === n) remplirBandeau();
      direct.textContent = pos === 0 ? (n ? "Prêt. Lance la lecture ou avance tour par tour." : "Ce replay ne contient aucun tour.")
        : pos === n ? (R.egalite ? "Fin du combat : égalité." : "Fin du combat : victoire de " + nom(gagnant) + ".")
          : lignes[pos - 1].map((x) => x.texte).join(" ");
      direct.hidden = pos === n;
    }
    function majLecture() {
      lecture.replaceChildren(picto(timer ? "pause" : "lecture"));
      lecture.setAttribute("aria-label", timer ? "Pause" : pos >= n ? "Rejouer" : "Lecture");
    }
    function suivant() {
      aller(pos + 1, true);
      if (pos >= n) { timer = null; majLecture(); return; }
      const r = rounds[pos];
      timer = setTimeout(suivant, ((r && (r.etourdi || r.paralysie)) ? 700 : 1300) / vitesse);
    }
    function jouer() {
      if (pos >= n) aller(0);
      timer = setTimeout(suivant, 250);
      majLecture();
    }
    function pause() { clearTimeout(timer); timer = null; majLecture(); }
    tiroir.addEventListener("keydown", (e) => {
      if (e.target.matches("input")) return;
      if (e.key === "ArrowRight") { pause(); aller(pos + 1); e.preventDefault(); }
      if (e.key === "ArrowLeft") { pause(); aller(pos - 1); e.preventDefault(); }
    });
    aller(0);
    if (!App.reduit && n) jouer(); else majLecture();
    return pause;
  }
});
})();
