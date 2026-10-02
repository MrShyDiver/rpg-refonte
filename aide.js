"use strict";
/* Comment jouer : la boucle de jeu, ce qu'on gagne en live, les règles des duels, les taux, le lexique et la FAQ.
   Chaque terme du lexique a son ancre (aide.html#medailles…) : les « ? » des autres pages pointent ici.
   Les chiffres du live viennent des scripts Streamer.bot ; les taux et les prix sont lus en direct. */
(function () {
const { el, icone, fmt, nombre, RARETES, ORDRE_RARETE } = App;

App.demarrer("aide", async (main) => {
  const lien = (href, texte) => el("a", { href, texte });
  const code = (t) => el("code", { texte: t });
  const section = (id, titre, sous, ...contenu) => el("section", { class: "section-page aide-section", id, "aria-labelledby": "t-" + id },
    el("h2", { id: "t-" + id, texte: titre }), sous ? el("p", { class: "sous", texte: sous }) : null, ...contenu);

  // ---------- En-tête + sommaire ----------
  const SOMMAIRE = [["boucle", "La boucle"], ["live", "En live"], ["duels", "Les duels"], ["taux", "Lootbox et taux"], ["lexique", "Lexique"], ["faq", "Questions"]];
  main.append(
    el("header", { class: "entete-page" }, el("div", {},
      el("h1", { texte: "Comment jouer" }),
      el("p", { texte: "Tu gagnes des lootbox en live, tu les ouvres ici, tu t'équipes et tu défies les autres viewers. Tout ce qu'il faut savoir, en court." }))),
    el("nav", { class: "aide-sommaire", "aria-label": "Sur cette page" }, SOMMAIRE.map(([id, t]) => el("a", { href: "#" + id, texte: t }))));

  // ---------- La boucle ----------
  const ETAPES = [
    ["i-live", "En live", "Tes points de chaîne se changent en lootbox, en points de stats et en duels.", "#live", "Ce qui se gagne en live"],
    ["i-coffre-ligne", "Lootbox", "Une lootbox, un objet. Chaque doublon améliore ton objet de +1.", "lootbox.html", "Ouvrir mes lootbox"],
    ["i-bouclier", "Équipe-toi", "Une arme, une main gauche, une armure, un stratagème : c'est ton build.", "collection.html", "Mon inventaire"],
    ["i-epees", "Duels", "Défie qui tu veux, même hors ligne : ton build contre le sien.", "duels.html", "Choisir un adversaire"],
    ["i-medaille", "Médailles", "Chaque duel en rapporte, surtout si tu vises toi-même plus fort que toi.", "#medailles", "Comment en gagner"],
    ["i-boutique", "Boutique", "Achète l'objet qui te manque, revends tes doublons en trop.", "boutique.html", "Voir l'étal"],
  ];
  main.append(section("boucle", "La boucle", "Six étapes, et on recommence à chaque live.",
    el("ol", { class: "aide-boucle" }, ETAPES.map(([ic, titre, texte, href, action], i) => el("li", {},
      el("span", { class: "aide-etape-tete" }, el("span", { class: "aide-num num", texte: String(i + 1) }), icone(ic)),
      el("b", { texte: titre }), el("p", { texte: texte }), el("a", { class: "aide-lien", href }, action, icone("i-fleche")))))));

  // ---------- En live ----------
  const LIVE = [
    [el("b", { texte: "Récompense de points de chaîne du site" }), "Tu reçois des lootbox ou des points de stats (Attaque, Défense, PV, Vitesse, Chance) directement sur ton compte. Le bot te le confirme dans le chat. Pas encore connecté au site ? Rien n'est perdu : tout t'attend à ta première connexion avec Twitch."],
    [el("b", { texte: "Récompense « Duel »" }), "Lance un duel en live contre le viewer de ton choix, en points de chaîne (environ 500, le prix exact est affiché sur Twitch). Le combat passe à l'écran."],
    [[code("!ticketduel pseudo")], "Le même duel en live, payé avec un ticket de duel au lieu de tes points de chaîne."],
    [[code("!ticketboss")], "Pendant un événement boss : attaque le boss de la communauté avec un ticket. Chaque attaque rapporte 12 médailles. Quand le boss tombe, chaque participant reçoit 10 lootbox légendaires, plus 3, 2 ou 1 pour les podiums de chaque classement du boss."],
    [[code("!lootbox"), " et ", code("!lootboxleg")], "Ouvre une lootbox (ou une légendaire) en direct, avec la roue à l'écran. Tu peux aussi les ouvrir ici, sur le site."],
    [el("b", { texte: "Roue d'équipement" }), "Une récompense de points de chaîne qui fait tourner la roue à l'écran et tire un objet sur-le-champ."],
    [el("b", { texte: "Abonnement à la chaîne" }), "Un sub, un resub ou un sub offert (c'est celui qui le reçoit qui en profite) débloque l'entraînement gratuit sur le site pour toute la durée de l'abonnement."],
  ];
  main.append(section("live", "Ce qui se gagne en live", "Le site et le stream partagent le même compte : ce que tu gagnes en live arrive ici, ce que tu fais ici compte en live.",
    el("ul", { class: "aide-liste" }, LIVE.map(([quoi, texte]) => el("li", {}, el("span", { class: "aide-quoi" }, quoi), el("span", { texte })))),
    el("p", { class: "mention" }, "Les tickets de duel sont distribués avec les bits, par une âme charitable, ou lors d'événements du stream. ", lien(App.TWITCH_CHAINE, "Aller sur la chaîne"), ".")));

  // ---------- Duels ----------
  const MEDAILLES = [
    ["Valeureuse", "Ta cible a plus de 30 % de puissance en plus", "20", "2", "12"],
    ["Équitable", "Écart de puissance de 30 % au plus", "12 (10 en défense)", "2", "5"],
    ["Déshonorable", "Ta cible a plus de 30 % de puissance en moins", "3", "1", "1"],
  ];
  main.append(section("duels", "Les duels", "Ton build contre le sien, calculé par le serveur. L'adversaire n'a pas besoin d'être connecté : il voit le résultat dans sa cloche.",
    el("div", { class: "aide-grille" },
      el("div", {}, el("h3", { texte: "Duel ciblé" }),
        el("p", {}, "Tu choisis ta cible. Coûte ", el("b", { texte: "1 ticket de duel" }), ". Il compte dans ton bilan (victoires, défaites, égalités), tes séries et ta carrière, et rapporte médailles et points, comme en live. Un duel ne te fait jamais perdre d'objet ni de médaille.")),
      el("div", {}, el("h3", { texte: "Combat automatique" }),
        el("p", {}, "Le jeu tire au sort un adversaire dans ta tranche de puissance ; si personne n'est disponible, tu affrontes un ", lien("#echo", "écho"), ". Coûte aussi ", el("b", { texte: "1 ticket" }), " et compte dans ton bilan, mais les ", el("b", { texte: "récompenses sont réduites de 50 %" }), " : 6 médailles par victoire, 3 par égalité, 1 par défaite.")),
      el("div", {}, el("h3", { texte: "Entraînement" }),
        el("p", {}, "Réservé aux ", el("b", { texte: "abonnés de la chaîne" }), " : gratuit, sans ticket, sans récompense et sans effet sur ton bilan. Le replay reste visible. Limite : 3 entraînements par jour.")),
      el("div", {}, el("h3", { texte: "Protections" }),
        el("p", { texte: "Si ton adversaire a une protection active, il subit 20 % de dégâts en moins pendant tout le combat, et une charge de sa protection est consommée." }))),
    el("h3", { class: "aide-h3", texte: "Médailles gagnées par catégorie (attaquant, duel ciblé)" }),
    el("div", { class: "aide-table-zone", tabindex: "0", role: "region", "aria-label": "Médailles par catégorie de duel" },
      el("table", { class: "aide-table" },
        el("thead", {}, el("tr", {}, ["Catégorie", "Quand", "Victoire", "Défaite", "Égalité"].map((t) => el("th", { scope: "col", texte: t })))),
        el("tbody", {}, MEDAILLES.map(([cat, quand, ...m]) => el("tr", {}, el("th", { scope: "row", texte: cat }), el("td", { texte: quand }), m.map((v) => el("td", { class: "num", texte: v }))))))),
    el("p", { class: "mention", texte: "Le défenseur est aussi payé : 10 médailles s'il gagne un combat équitable, 2 s'il perd. Pris pour cible par plus fort que lui, il en touche 10 même en perdant, 15 sur une égalité et 22 s'il crée la surprise." })));

  // ---------- Taux ----------
  const zoneTaux = el("div", { class: "aide-taux" }, el("p", { class: "mention", texte: "Chargement des taux…" }));
  const zonePrix = el("p", { class: "mention" });
  main.append(section("taux", "Lootbox et taux", "Les taux affichés ici sont ceux du serveur, lus en direct.", zoneTaux, zonePrix));

  // ---------- Lexique ----------
  const plafonds = ORDRE_RARETE.map((r) => `${RARETES[r].nom} +${RARETES[r].max}`).join(" · ");
  const TERMES = [
    ["lootbox", "Lootbox", "Un coffre qui contient un objet tiré au hasard. Se gagne en live avec tes points de chaîne, ou s'achète en médailles à la boutique.", ["lootbox.html", "Ouvrir mes lootbox"]],
    ["lootbox-legendaire", "Lootbox légendaire", "Jamais de Commun, et bien plus de chances d'Épique et de Légendaire. Elles tombent quand la communauté abat le boss.", ["lootbox.html?type=legendaire", "Mes lootbox légendaires"]],
    ["medailles", "Médailles", "La monnaie de la boutique. Tu en gagnes en duel ciblé (plus en visant plus fort que toi) et, moitié moins, en combat automatique, en attaquant le boss en live, et en revendant tes doublons en trop.", ["boutique.html", "La boutique"]],
    ["tickets", "Tickets de duel", "Un ticket = un duel ciblé ou un combat automatique sur le site, ou un duel en live avec !ticketduel (ou une attaque du boss avec !ticketboss). Ils sont distribués avec les bits, par une âme charitable, ou lors d'événements.", ["duels.html", "Défier un joueur"]],
    ["points", "Points", "Des points de classement gagnés en duel, selon l'issue et la catégorie du combat (jusqu'à 2 250 pour une victoire valeureuse, moitié moins en combat automatique). Ils servent aux classements.", ["classements.html", "Les classements"]],
    ["credits-reset", "Crédits de reset", "Tes points de stats rendus par un ticket de reset, en attente d'être replacés. Place-les sur ton profil : tant qu'ils attendent, ta puissance est au plus bas.", ["profil.html#points", "Placer mes points"]],
    ["ticket-reset", "Ticket de reset", "S'achète en médailles à la boutique. Il retire tous tes points de stats (Attaque, Défense, PV, Vitesse, Chance) et te les rend en crédits, pour les répartir autrement.", ["boutique.html", "La boutique"]],
    ["puissance", "Puissance", "Une estimation de la force de ton build : tes stats, ton équipement et ses améliorations, simulés contre un mannequin standard. Elle sert à classer les joueurs et à définir les tranches des duels. C'est une tendance, pas une promesse : la chance et les effets font le reste.", ["profil.html", "Ma puissance"]],
    ["tours", "Vitesse et tours", "Le plus rapide joue en premier, puis chacun joue à son tour. Chaque point de vitesse d'avance donne 1,2 % de tour en plus : avec 10 points d'avance, un tour bonus tous les 8 tours adverses environ ; avec 25, un tous les 3. Jamais plus de 2 tours d'affilée. Un tour, c'est une seule action : attaquer, lancer son stratagème ou utiliser sa main gauche.", ["#duels", "Les règles des duels"]],
    ["doublons", "Doublons", "Tirer un objet que tu as déjà lui ajoute une amélioration (+1). Une fois l'objet au maximum (MAX), les exemplaires suivants sont « en trop » : revends-les ou troque-les.", ["collection.html", "Mon inventaire"]],
    ["niveaux", "Améliorations", `Ton premier exemplaire est l'objet de base (+0). Chaque amélioration renforce ses valeurs (dégâts, stats, effets), jusqu'à un plafond qui dépend de sa rareté : ${plafonds}.`, ["arsenal.html", "Le codex"]],
    ["tranches", "Tranches de puissance", "On compare ta puissance à celle de ta cible. À 30 % d'écart ou moins, le combat est équitable. Au-delà, ta cible est plus forte (valeureux) ou plus faible (déshonorant).", ["#duels", "Les règles des duels"]],
    ["categories", "Catégories de combat", "Valeureuse : face à plus fort. Équitable : dans ta tranche. Déshonorable : face à plus faible. Elles décident des médailles et des points, et s'affichent dans ta carrière.", ["#duels", "Le barème"]],
    ["entrainement", "Entraînement", "Un duel gratuit réservé aux abonnés de la chaîne, 3 fois par jour : aucun ticket, aucune récompense, aucun effet sur ton bilan. Idéal pour tester un build.", ["duels.html", "S'entraîner"]],
    ["set-du-jour", "Set du jour", "Les objets sont rangés en sets (Sekiro, Helldivers, Elden Ring, Originaux, Objets forgés). Chaque jour, un set est à l'honneur : dans sa rareté, chacun de ses objets a 3 fois plus de chances de tomber d'une lootbox. Les chances d'obtenir chaque rareté ne changent pas. Le planning de la semaine est tiré au hasard chaque lundi.", ["lootbox.html", "Voir le set du jour"]],
    ["echo", "Écho", "Le build d'un autre joueur (ses objets, ses améliorations, la répartition de ses stats), ramené à ton niveau par le serveur : ses stats sont augmentées ou réduites jusqu'à donner un combat serré, tout en restant dans ta tranche de puissance. S'il est bien plus fort que toi, ses améliorations d'objets sont réduites, et il peut se battre avec moins de pièces d'équipement (jamais sans son arme). Seuls les échos qui peuvent vraiment être ramenés à ton niveau te sont proposés. Le joueur d'origine ne gagne ni ne perd rien. Tu rencontres un écho en combat automatique quand personne n'est disponible dans ta tranche, et la page Duels en propose à défier quand moins de 5 joueurs actifs s'y trouvent. Un écho défié rapporte comme un combat équitable.", ["duels.html", "Voir les adversaires"]],
    ["estimations", "Estimations", "Sur la page Duels, une tendance pour chaque adversaire (Favori, Serré, Outsider…), tirée de l'écart entre ta puissance et la sienne. Elles sont verrouillées : les abonnés de la chaîne peuvent en dévoiler 3 par jour, un adversaire à la fois, avec le bouton « Dévoiler » de sa ligne. Une estimation dévoilée reste visible jusqu'à la fin de la journée. C'est une tendance, pas une promesse.", ["duels.html", "Voir les adversaires"]],
    ["troc", "Troc", "À la boutique, échange 10 doublons Communs contre un objet Normal au hasard, 10 Normaux contre un Rare, ou 10 Rares contre un Épique. La copie de base de chaque objet est toujours gardée.", ["boutique.html", "Troquer"]],
    ["vitrine", "Vitrine", "Les 8 cartes de ton choix exposées sur ton profil, pour que tout le chat les voie.", ["profil.html#vitrine", "Ma vitrine"]],
    ["succes", "Succès", "Des défis débloqués en jouant (collection, duels, boutique…), du bronze au légendaire. Certains restent cachés jusqu'à ce que tu les obtiennes.", ["succes.html", "Mes succès"]],
  ];
  main.append(section("lexique", "Lexique", "Chaque ressource et chaque mot du jeu, en une phrase.",
    el("dl", { class: "aide-lexique" }, TERMES.map(([id, terme, def, [href, action]]) => el("div", { class: "aide-terme", id },
      el("dt", { texte: terme }), el("dd", {}, def, " ", el("a", { class: "aide-lien", href }, action, icone("i-fleche"))))))));

  // ---------- FAQ ----------
  const FAQ = [
    ["Pourquoi ma victoire ne compte pas dans mon bilan ?", ["Deux cas. Un ", el("b", { texte: "entraînement" }), " ne compte jamais : c'est fait pour tester sans risque. Et les ", el("b", { texte: "comptes hors classement" }), " (le streamer et les comptes de test) jouent sans bilan ni stats : l'historique affiche le résultat, mais rien n'est compté."]],
    ["Que deviennent mes doublons une fois l'objet au MAX ?", ["L'objet reste MAX, et chaque exemplaire en plus s'affiche « +N en trop ». Revends-les contre des médailles à la boutique, ou ", lien("#troc", "troque-les"), " par 10 contre un objet de rareté supérieure."]],
    ["Est-ce que je peux perdre des objets ?", ["Pas en jouant : un duel ne te prend jamais d'objet ni de médaille, même perdu. Un objet ne quitte ton inventaire que si tu le vends ou le troques toi-même. Vendre ta dernière copie le retire aussi de ton équipement et de ta vitrine."]],
    ["Comment supprimer mon compte ?", ["Dans ", lien("parametres.html#suppression", "Paramètres, Zone dangereuse"), " : tape ton pseudo Twitch pour confirmer. C'est immédiat et définitif. Les duels déjà joués restent dans l'historique public. Tu peux d'abord ", lien("parametres.html#compte", "exporter tes données"), "."]],
    ["Je n'ai plus de lootbox, je fais comment ?", ["Passe en live : les récompenses de points de chaîne en donnent. Tu peux aussi en acheter en médailles à la ", lien("boutique.html", "boutique"), "."]],
  ];
  main.append(section("faq", "Questions fréquentes", null,
    el("div", { class: "aide-faq" }, FAQ.map(([q, r]) => el("details", {}, el("summary", { texte: q }), el("p", {}, r))))));

  // La page est rendue après coup : on rejoue l'ancre de l'URL (aide.html#medailles depuis un « ? »).
  const cible = location.hash && document.getElementById(decodeURIComponent(location.hash.slice(1)));
  if (cible) { cible.scrollIntoView({ block: "start" }); cible.classList.add("cible"); }

  // ---------- Taux et prix, lus en direct ----------
  try {
    const [raretes, reglages] = await Promise.all([App.api.lootboxRaretes(), App.api.reglagesBoutique().catch(() => [])]);
    const actifs = App.objets.filter((o) => o.actif);
    const taux = (leg) => {
      const poids = (r) => { const l = raretes.find((x) => x.rarete === r); return l && actifs.some((o) => o.rarete === r) ? Number(leg ? l.poids_legendaire : l.poids) || 0 : 0; };
      const total = ORDRE_RARETE.reduce((s, r) => s + poids(r), 0) || 1;
      return (r) => poids(r) / total * 100;
    };
    const std = taux(false), leg = taux(true);
    const pc = (v) => (v ? nombre(Math.round(v * 10) / 10) + " %" : "—");
    zoneTaux.replaceChildren(el("div", { class: "aide-table-zone", tabindex: "0", role: "region", "aria-label": "Taux de rareté des lootbox" },
      el("table", { class: "aide-table" },
        el("thead", {}, el("tr", {}, el("th", { scope: "col", texte: "Rareté" }), el("th", { scope: "col", texte: "Lootbox" }), el("th", { scope: "col", texte: "Lootbox légendaire" }), el("th", { scope: "col", texte: "Améliorations max" }))),
        el("tbody", {}, ORDRE_RARETE.map((r) => el("tr", { style: { "--c": `var(--${r})` } },
          el("th", { scope: "row" }, el("span", { class: "pilule " + r, texte: RARETES[r].nom })),
          el("td", { class: "num", texte: pc(std(r)) }), el("td", { class: "num", texte: pc(leg(r)) }), el("td", { class: "num", texte: "+" + RARETES[r].max })))))),
      el("p", { class: "mention" }, "Chaque jour, un set d'objets est à l'honneur : dans sa rareté, chacun de ses objets a 3 fois plus de chances de tomber qu'un autre. Le set du jour et le planning de la semaine sont sur la ", lien("lootbox.html", "page Lootbox"), "."));
    const val = (cle) => (reglages.find((x) => x.cle === cle) || {}).valeur;
    const morceaux = [["prix_lootbox", (v) => `une lootbox coûte ${fmt(v)} médailles à la boutique`], ["prix_ticket_reset", (v) => `un ticket de reset ${fmt(v)} médailles`], ["troc_cout", (v) => `un troc demande ${fmt(v)} doublons en trop`]]
      .filter(([k]) => val(k) != null).map(([k, f]) => f(val(k)));
    if (morceaux.length) zonePrix.textContent = "En ce moment, " + morceaux.join(", ") + ".";
  } catch (e) {
    console.warn(e);
    zoneTaux.replaceChildren(el("p", { class: "mention", texte: "Les taux n'ont pas pu être chargés. Tu les retrouves aussi sur la page Lootbox." }));
  }
}, { public: true });
})();
