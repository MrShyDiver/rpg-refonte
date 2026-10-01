"use strict";
(function () {
const { $, el, icone, fmt, ilYa, date } = App;

const TYPES = { duel: "Duel", auto_battle: "Combat auto", entrainement: "Entraînement" };
const TRANCHES = { dans_tranche: "Combat équitable", au_dessus: "Cible plus forte", en_dessous: "Cible plus faible" };
// Estimation qualitative (décision projet : jamais de % exact). Seuils sur le ratio ma puissance / la sienne.
const ESTIMATIONS = [[1.5, 5, "Largement favori"], [1.15, 4, "Favori"], [0.87, 3, "Serré"], [0.67, 2, "Outsider"], [0, 1, "Très risqué"]];
const SEUIL_SAIGNEMENT = 20;
const PAR_PAGE = 20;
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
const estimation = (moi, lui) => (moi > 0 && lui > 0 ? ESTIMATIONS.find(([s]) => moi / lui >= s) : null);
const bilan = (v, d, e) => `${fmt(v)} V · ${fmt(d)} D · ${fmt(e)} É`;
const params = new URLSearchParams(location.search);

App.demarrer("duels", async (main, ctx) => {
  const moi = ctx.joueur, login = moi.twitch_login;
  const maPuissance = (App.puissance(moi, App.niveaux(), ctx.loadout) || {}).powerLevel || 0;
  let parLogin = new Map([[login, moi]]);
  const nom = (l) => (parLogin.get(l) || {}).display_name || l || "?";
  let duels = [];
  const h2h = new Map(); // login adverse -> {v, d, e, n}

  // ------------------------------------------------------------------ Héros
  const joues = (moi.victoires || 0) + (moi.defaites || 0) + (moi.egalites || 0);
  const tickets = moi.tickets || 0;
  const abonne = App.peutEntrainer(moi);
  const horsClassement = App.horsClassement(moi);
  const versCombat = (l, mode) => `combat.html?adversaire=${encodeURIComponent(l)}&mode=${mode}`;
  const chiffre = (valeur, libelle, detail) => el("div", { class: "chiffre" }, el("b", { class: "num", texte: valeur }), el("span", {}, libelle), detail ? el("small", { texte: detail }) : null);
  const lienAide = (ancre, sujet) => el("a", { class: "lien-aide", href: "aide.html#" + ancre, "aria-label": "Aide : " + sujet, title: "Aide : " + sujet, texte: "?" });
  main.append(
    el("header", { class: "entete-page" }, el("div", {},
      el("h1", { texte: "Duels" }),
      el("p", { texte: "Ton bilan, les adversaires à ta mesure et tous les combats du stream, rejouables tour par tour." }))),
    ...(horsClassement ? [el("p", { class: "hors-classement" }, el("span", { class: "pilule", texte: "Compte hors classement" }),
      el("span", { texte: "Le streamer et les comptes de test jouent sans bilan ni stats : tes victoires s'affichent dans l'historique mais ne comptent pas." }))] : []),
    el("div", { class: "grille-chiffres" },
      chiffre(fmt(moi.victoires || 0), "Victoires", `${fmt(moi.defaites || 0)} défaite${moi.defaites > 1 ? "s" : ""} · ${fmt(moi.egalites || 0)} égalité${moi.egalites > 1 ? "s" : ""}`),
      chiffre(joues ? fmt((100 * (moi.victoires || 0)) / joues) + " %" : "—", "Taux de victoire", joues ? fmt(joues) + " combats" : "Aucun combat pour l'instant"),
      chiffre(fmt(moi.serie_actuelle || 0), "Série en cours", "Record : " + fmt(moi.serie_record || 0)),
      chiffre(maPuissance ? fmt(maPuissance) : "—", "Ta puissance", "Calculée sur ton équipement"),
      chiffre(fmt(moi.tickets || 0), ["Tickets de duel", lienAide("tickets", "les tickets de duel")], "1 ticket par duel classé")),
    el("section", { class: "annonce-defi panneau-b", "aria-labelledby": "titre-defi" },
      el("div", {},
        el("span", { class: "pilule nouveau", texte: "Nouveau" }),
        el("h2", { id: "titre-defi", texte: "Défie qui tu veux, ici et maintenant" }),
        el("p", {}, "Choisis un adversaire ci-dessous : ton build contre le sien, combat immédiat, même s'il n'est pas connecté. Un ",
          el("b", { texte: "duel classé" }), " coûte 1 ticket et rapporte médailles et bilan, comme en live. ",
          abonne ? el("span", {}, "L'", el("b", { texte: "entraînement" }), " est gratuit pour toi : aucune récompense, aucun risque.")
            : el("span", {}, "L'", el("b", { texte: "entraînement" }), " gratuit est réservé aux abonnés de la chaîne.")),
        tickets < 1 ? el("p", { class: "manque-ticket" }, icone("i-ticket"), "Plus de ticket de duel — gagne-en en live avec tes points de chaîne.") : null),
      el("a", { class: "btn-second lien-live", href: App.TWITCH_CHAINE, target: "_blank", rel: "noopener" }, icone("i-twitch"), "Aller sur le live")));

  // ------------------------------------------------------------------ Adversaires
  const adv = { liste: [], mode: "proches", q: "", tri: "proche", vus: PAR_PAGE };
  const zoneAdv = el("div", {}, el("div", { class: "chargement", texte: "Calcul des puissances…" }));
  const compteAdv = el("span", { class: "mention", "aria-live": "polite" });
  const ongletsAdv = el("div", { class: "onglets-b", role: "group", "aria-label": "Quels joueurs" },
    [["proches", "Proches de toi"], ["tous", "Tous"]].map(([v, t]) => el("button", { type: "button", "aria-pressed": String(v === adv.mode), "data-v": v, texte: t,
      onclick: () => { adv.mode = v; adv.vus = PAR_PAGE; majOnglets(ongletsAdv, v); rendreAdversaires(); } })));
  main.append(el("section", { class: "section-page", id: "adversaires" },
    el("h2", { texte: "Adversaires" }),
    el("p", { class: "sous", texte: "L'estimation compare ta puissance à la leur : une tendance, pas une promesse. Le build et la chance font le reste." }),
    el("div", { class: "barre-filtres" }, ongletsAdv,
      el("label", { class: "champ recherche" }, icone("i-recherche"), el("input", { type: "search", placeholder: "Chercher un joueur", "aria-label": "Chercher un joueur",
        oninput: (e) => { adv.q = sansAccent(e.target.value); adv.vus = PAR_PAGE; rendreAdversaires(); } })),
      el("label", { class: "champ" }, el("select", { "aria-label": "Trier les adversaires", onchange: (e) => { adv.tri = e.target.value; rendreAdversaires(); } },
        [["proche", "Puissance la plus proche"], ["fort", "Plus puissants d'abord"], ["victoires", "Plus de victoires"], ["nom", "Nom"]].map(([v, t]) => el("option", { value: v, texte: t })))),
      compteAdv),
    zoneAdv));

  // ------------------------------------------------------------------ Historique
  const hist = { mode: "moi", type: "", q: sansAccent(params.get("contre") || ""), vus: PAR_PAGE };
  const zoneHist = el("div", {}, el("div", { class: "chargement", texte: "Chargement des combats…" }));
  const zoneH2h = el("div");
  const champHist = el("input", { type: "search", placeholder: "Adversaire", "aria-label": "Filtrer par adversaire", value: params.get("contre") || "",
    oninput: (e) => { hist.q = sansAccent(e.target.value); hist.vus = PAR_PAGE; rendreHistorique(); } });
  const ongletsHist = el("div", { class: "onglets-b", role: "group", "aria-label": "Quels duels" },
    [["moi", "Mes duels"], ["tous", "Tous les duels"]].map(([v, t]) => el("button", { type: "button", "aria-pressed": String(v === hist.mode), "data-v": v, texte: t,
      onclick: () => { hist.mode = v; hist.vus = PAR_PAGE; majOnglets(ongletsHist, v); rendreHistorique(); } })));
  const compteHist = el("span", { class: "mention", "aria-live": "polite" });
  main.append(el("section", { class: "section-page", id: "historique" },
    el("h2", { texte: "Historique" }),
    el("p", { class: "sous", texte: "Chaque combat, en live ou sur le site : regarde-le en cinématique ou relis-le tour par tour." }),
    el("div", { class: "barre-filtres" }, ongletsHist,
      el("label", { class: "champ" }, el("select", { "aria-label": "Type de combat", onchange: (e) => { hist.type = e.target.value; hist.vus = PAR_PAGE; rendreHistorique(); } },
        el("option", { value: "", texte: "Tous les types" }), Object.entries(TYPES).map(([v, t]) => el("option", { value: v, texte: t })), el("option", { value: "autre", texte: "Autres" }))),
      el("label", { class: "champ recherche" }, icone("i-recherche"), champHist),
      compteHist),
    zoneH2h, zoneHist));

  function majOnglets(groupe, v) { groupe.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === v))); }

  // ------------------------------------------------------------------ Données
  const pInv = Promise.all([App.api.inventaires(), App.api.loadouts()]);
  pInv.catch(() => {});
  try {
    const [joueurs, lignes] = await Promise.all([App.api.joueurs(), App.api.duels()]);
    parLogin = new Map(joueurs.map((j) => [j.twitch_login, j]));
    parLogin.set(login, moi);
    duels = lignes;
    for (const d of duels) {
      const adverse = d.attaquant_login === login ? d.defenseur_login : d.defenseur_login === login ? d.attaquant_login : null;
      if (!adverse) continue;
      const s = h2h.get(adverse) || { v: 0, d: 0, e: 0, n: 0 };
      s.n++; if (d.egalite) s.e++; else if (d.vainqueur_login === login) s.v++; else s.d++;
      h2h.set(adverse, s);
    }
    rendreHistorique();
    const id = params.get("replay");
    const cible = id && duels.find((d) => String(d.id) === id);
    if (cible) ouvrirReplay(cible);
  } catch (e) {
    App.erreur(e);
    zoneHist.replaceChildren(erreurBloc("L'historique n'a pas pu se charger."));
    zoneAdv.replaceChildren(erreurBloc("La liste des joueurs n'a pas pu se charger."));
    return;
  }
  try {
    const [inventaires, loadouts] = await pInv;
    const niveaux = new Map(), lo = new Map(loadouts.map((l) => [l.player_id, l]));
    for (const l of inventaires) { if (!niveaux.has(l.player_id)) niveaux.set(l.player_id, new Map()); niveaux.get(l.player_id).set(l.item_numero, l.niveau); }
    const autres = [...parLogin.values()].filter((j) => j.twitch_login !== login);
    // Découpé par paquets pour garder la page réactive quand il y a beaucoup de joueurs.
    for (let i = 0; i < autres.length; i += 60) {
      for (const j of autres.slice(i, i + 60)) {
        const p = App.puissance(j, niveaux.get(j.id) || new Map(), lo.get(j.id));
        adv.liste.push({ j, puissance: (p && p.powerLevel) || 0 });
      }
      await new Promise((r) => setTimeout(r, 0));
    }
    rendreAdversaires();
  } catch (e) {
    App.erreur(e);
    zoneAdv.replaceChildren(erreurBloc("Les puissances n'ont pas pu être calculées."));
  }

  function erreurBloc(t) {
    return el("div", { class: "vide" }, el("b", { texte: t }), "Vérifie ta connexion puis ",
      el("button", { type: "button", class: "lien", texte: "recharge la page", onclick: () => location.reload() }), ".");
  }

  function rendreAdversaires() {
    let l = adv.liste;
    if (adv.mode === "proches" && maPuissance) l = l.filter((x) => x.puissance && x.puissance / maPuissance >= 0.75 && x.puissance / maPuissance <= 1.33);
    if (adv.q) l = l.filter((x) => sansAccent(x.j.display_name).includes(adv.q) || x.j.twitch_login.includes(adv.q));
    const ecart = (x) => (x.puissance && maPuissance ? Math.abs(Math.log(x.puissance / maPuissance)) : 99);
    const tris = { proche: (a, b) => ecart(a) - ecart(b), fort: (a, b) => b.puissance - a.puissance, victoires: (a, b) => (b.j.victoires || 0) - (a.j.victoires || 0),
      nom: (a, b) => sansAccent(a.j.display_name).localeCompare(sansAccent(b.j.display_name)) };
    l = [...l].sort(tris[adv.tri]);
    compteAdv.textContent = l.length + " joueur" + (l.length > 1 ? "s" : "");
    if (!l.length) {
      zoneAdv.replaceChildren(el("div", { class: "vide" }, el("b", { texte: adv.q ? "Aucun joueur ne correspond." : "Personne à ta mesure pour l'instant." }),
        adv.mode === "proches" ? el("button", { type: "button", class: "btn-second", style: { marginTop: "12px" }, texte: "Voir tous les joueurs", onclick: () => ongletsAdv.querySelector('[data-v="tous"]').click() }) : "Essaie un autre nom."));
      return;
    }
    const liste = el("ul", { class: "liste-adversaires" }, l.slice(0, adv.vus).map(ligneAdversaire));
    zoneAdv.replaceChildren(...[liste, l.length > adv.vus ? el("button", { type: "button", class: "btn-second plus", texte: `Voir plus (${l.length - adv.vus})`, onclick: () => { adv.vus += PAR_PAGE; rendreAdversaires(); } }) : null].filter(Boolean));
  }

  function ligneAdversaire({ j, puissance }) {
    const est = estimation(maPuissance, puissance);
    const s = h2h.get(j.twitch_login);
    return el("li", { class: "adversaire" },
      App.avatar(j, 44),
      el("div", { class: "ident" },
        el("a", { href: "profil.html?joueur=" + encodeURIComponent(j.twitch_login), texte: j.display_name || j.twitch_login }),
        App.horsClassement(j) ? el("span", { class: "mention", texte: "Hors classement" }) : el("span", { class: "mention num", texte: bilan(j.victoires || 0, j.defaites || 0, j.egalites || 0) })),
      el("div", { class: "puissance" }, el("b", { class: "num", texte: puissance ? fmt(puissance) : "—" }), el("span", { texte: "puissance" })),
      est ? el("div", { class: "estimation", "data-niveau": est[1] },
        el("span", { class: "jauge-est", "aria-hidden": "true" }, [1, 2, 3, 4, 5].map((k) => el("i", { class: k <= est[1] ? "plein" : null }))),
        el("span", { texte: est[2] })) : el("div", { class: "estimation mention", texte: "Estimation indisponible" }),
      el("div", { class: "actions" },
        s ? el("button", { type: "button", class: "btn-second petit", onclick: () => voirContre(j.twitch_login) }, "Nos duels ", el("span", { class: "num", texte: "(" + s.n + ")" })) : null,
        abonne
          ? el("a", { class: "btn-second petit", href: versCombat(j.twitch_login, "entrainement"), title: "Entraînement gratuit : aucune récompense, aucun impact sur ton bilan" }, "Entraînement")
          : el("button", { type: "button", class: "btn-second petit verrouille", "aria-disabled": "true", title: "Réservé aux abonnés de la chaîne",
            onclick: () => App.toast("L'entraînement gratuit est réservé aux abonnés Twitch de la chaîne.", { titre: "Réservé aux abonnés", icone: "i-cadenas" }) }, icone("i-cadenas"), "Entraînement"),
        tickets > 0
          ? el("a", { class: "btn-principal btn-defier", href: versCombat(j.twitch_login, "classe"), "aria-label": "Défier " + (j.display_name || j.twitch_login) + " en duel classé (1 ticket)" }, icone("i-epees"), "Défier")
          : el("button", { type: "button", class: "btn-principal btn-defier", "aria-disabled": "true", title: "Plus de ticket de duel — gagne-en en live",
            onclick: () => App.toast("Plus de ticket de duel — gagne-en en live avec tes points de chaîne.", { titre: "Pas de ticket" }) }, icone("i-epees"), "Défier")));
  }

  function voirContre(l) {
    hist.mode = "moi"; hist.q = sansAccent(nom(l)); hist.vus = PAR_PAGE; champHist.value = nom(l);
    majOnglets(ongletsHist, "moi"); rendreHistorique();
    $("#historique").scrollIntoView({ behavior: App.reduit ? "auto" : "smooth", block: "start" });
  }

  // ------------------------------------------------------------------ Historique
  function rendreHistorique() {
    const mien = (d) => d.attaquant_login === login || d.defenseur_login === login;
    let l = hist.mode === "moi" ? duels.filter(mien) : duels;
    if (hist.type) l = l.filter((d) => (hist.type === "autre" ? !TYPES[d.type] : d.type === hist.type));
    const adverses = (d) => (mien(d) && hist.mode === "moi" ? [d.attaquant_login === login ? d.defenseur_login : d.attaquant_login] : [d.attaquant_login, d.defenseur_login]);
    if (hist.q) l = l.filter((d) => adverses(d).some((a) => a.includes(hist.q) || sansAccent(nom(a)).includes(hist.q)));
    compteHist.textContent = l.length + " combat" + (l.length > 1 ? "s" : "");

    // Face-à-face : quand le filtre ne laisse qu'un seul adversaire dans mes duels.
    const uniques = new Set(l.flatMap(adverses));
    zoneH2h.replaceChildren();
    if (hist.mode === "moi" && hist.q && uniques.size === 1) {
      const a = [...uniques][0], s = { v: 0, d: 0, e: 0 };
      l.forEach((d) => { if (d.egalite) s.e++; else if (d.vainqueur_login === login) s.v++; else s.d++; });
      const j = parLogin.get(a) || { display_name: a };
      zoneH2h.append(el("div", { class: "face-a-face panneau-b" },
        el("div", { class: "fa-duo" }, App.avatar(moi, 40), el("span", { class: "vs", texte: "VS" }), App.avatar(j, 40)),
        el("div", {}, el("b", { texte: "Toi contre " + (j.display_name || a) }),
          el("span", { class: "mention", texte: l.length + " combat" + (l.length > 1 ? "s" : "") + (hist.type ? " de ce type" : "") + " · dernier " + ilYa(l[0].joue_le) })),
        el("div", { class: "fa-score num" },
          el("span", { class: "v", texte: s.v + " V" }), el("span", { class: "d", texte: s.d + " D" }), el("span", { class: "e", texte: s.e + " É" }))));
    }

    if (!l.length) {
      zoneHist.replaceChildren(el("div", { class: "vide" },
        el("b", { texte: hist.mode === "moi" && !hist.q && !hist.type ? "Tu n'as pas encore combattu." : "Aucun combat ne correspond." }),
        hist.mode === "moi" && !hist.q && !hist.type
          ? el("span", {}, "Défie un adversaire ci-dessus, ou lance un duel en live avec ", el("code", { texte: "!duel" }), ". ",
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
      participants = el("span", { class: "participants" }, App.avatar(parLogin.get(a) || { display_name: a }, 30),
        el("span", {}, el("span", { class: "mention", texte: jeSuisA ? "Tu attaques " : "Tu défends contre " }), el("b", { texte: nom(a) })));
      puissances = [jeSuisA ? d.power_attaquant : d.power_defenseur, jeSuisA ? d.power_defenseur : d.power_attaquant];
    } else {
      const g = d.egalite ? null : d.vainqueur_login, p = d.vainqueur_login === d.defenseur_login ? d.attaquant_login : d.defenseur_login;
      participants = el("span", { class: "participants" }, App.avatar(parLogin.get(d.attaquant_login) || { display_name: d.attaquant_login }, 30),
        g ? el("span", {}, el("b", { texte: nom(g) }), el("span", { class: "mention", texte: " bat " }), nom(p))
          : el("span", {}, el("b", { texte: nom(d.attaquant_login) }), el("span", { class: "mention", texte: " et " }), el("b", { texte: nom(d.defenseur_login) }), el("span", { class: "mention", texte: " : égalité" })));
      puissances = [d.power_attaquant, d.power_defenseur];
    }
    const contenu = [
      el("span", { class: "resultat " + (res ? res[0] : "neutre"), texte: res ? res[1] : "" }),
      el("span", { class: "centre" }, participants,
        el("span", { class: "details" },
          el("span", { class: "type-duel", "data-type": d.type || "autre", texte: TYPES[d.type] || "Combat" }),
          TRANCHES[d.tranche] ? el("span", { class: "mention", texte: TRANCHES[d.tranche] }) : null)),
      el("span", { class: "puissances num", title: "Puissances au moment du combat" }, fmt(puissances[0]), el("span", { class: "mention", texte: " vs " }), fmt(puissances[1])),
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

  function decrire(r, R) {
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
      const n = cibleEstA ? r.paralysie_duree_attaquant : r.paralysie_duree_defenseur;
      add(`${C} est paralysé${n ? " pour " + n + " tours" : ""} : plus d'attaque à l'arme.`, "etat");
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
      const lg = R[suffixe], j = parLogin.get(lg) || { display_name: lg };
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
          if (o) return App.carte(o, { niveau: Math.min(x.niveau || 0, App.niveauMax(o.rarete)), exemplaires: 0, equipe: false });
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
        el("button", { type: "button", onclick: () => { pause(); aller(i + 1); } }, el("span", { class: "no-tour num", texte: "T" + r.round }),
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
