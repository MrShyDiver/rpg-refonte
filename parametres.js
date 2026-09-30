"use strict";
(function () {
  const { $, el, icone, fmt, date } = App;
  const CLES = ["sons", "notif_lootbox", "notif_succes", "notif_duels", "notif_annonces"];

  App.demarrer("parametres", async (main, ctx) => {
    const j = ctx.joueur, user = ctx.session.user || {};
    const prefs = Object.fromEntries(CLES.map((k) => [k, ctx.prefs[k] !== false]));

    // ---------- Interrupteurs (enregistrés à chaque bascule) ----------
    function bloc(id, titre, sous, ...contenu) {
      const etat = el("span", { class: "etat-sauve", role: "status" });
      const b = el("section", { class: "panneau-b bloc-reglages", id, "aria-labelledby": "t-" + id },
        el("header", {}, el("div", {}, el("h2", { id: "t-" + id, texte: titre }), sous ? el("p", { class: "sous", texte: sous }) : null), etat),
        ...contenu);
      b.etat = etat;
      return b;
    }
    let minuterie = null;
    function montrerSauve(section) {
      section.etat.replaceChildren(icone("i-coche"), "Enregistré");
      section.etat.classList.add("visible");
      clearTimeout(minuterie);
      minuterie = setTimeout(() => section.etat.classList.remove("visible"), 2200);
    }
    function interrupteur(cle, titre, detail, surChangement) {
      const id = "pref-" + cle;
      const b = el("button", { class: "interrupteur", type: "button", role: "switch", id, "aria-checked": String(prefs[cle]), "aria-describedby": id + "-d" });
      b.addEventListener("click", async () => {
        const avant = prefs[cle];
        prefs[cle] = !avant;
        b.setAttribute("aria-checked", String(prefs[cle]));
        if (surChangement) surChangement(prefs[cle]);
        b.disabled = true;
        try {
          const res = await App.rpc("enregistrer_preferences", { p: { ...prefs } });
          App.ctx.prefs = { ...App.ctx.prefs, ...(res || prefs) };
          montrerSauve(b.closest(".bloc-reglages"));
        } catch (e) {
          prefs[cle] = avant;
          b.setAttribute("aria-checked", String(avant));
          if (surChangement) surChangement(avant);
          App.erreur(e);
        } finally { b.disabled = false; }
      });
      return el("div", { class: "reglage" },
        el("label", { for: id }, el("b", { texte: titre }), el("span", { id: id + "-d", texte: detail })), b);
    }

    // ---------- Sons ----------
    const boutonsTest = App.ORDRE_RARETE.map((r, i) => el("button", { class: "btn-test " + r, type: "button", disabled: !prefs.sons,
      "aria-label": "Tester le son " + App.RARETES[r].nom, onclick: () => { App.sons.demarrer(); App.sons.rarete(i); } }, icone("i-son"), App.RARETES[r].nom));
    const aideTest = el("p", { texte: prefs.sons ? "Écoute le son de chaque rareté, tel qu'il sonne à l'ouverture d'une lootbox." : "Active les sons pour pouvoir les tester." });
    const sons = bloc("sons", "Sons", "Les effets sonores des lootbox, des duels et des succès. Tout est généré dans ton navigateur.",
      interrupteur("sons", "Effets sonores", "Coffre qui tremble, cartes qui se retournent, fanfare des succès.", (v) => {
        App.sons.actif = v;
        boutonsTest.forEach((b) => { b.disabled = !v; });
        aideTest.textContent = v ? "Écoute le son de chaque rareté, tel qu'il sonne à l'ouverture d'une lootbox." : "Active les sons pour pouvoir les tester.";
      }),
      el("div", { class: "tests-sons" }, aideTest, boutonsTest));

    // ---------- Notifications ----------
    const btnLu = el("button", { class: "btn-second", type: "button" }, icone("i-coche"), "Tout marquer comme lu");
    btnLu.addEventListener("click", async () => {
      btnLu.disabled = true;
      try {
        const quand = await App.rpc("marquer_notifications_lues");
        App.ctx.prefs = { ...App.ctx.prefs, notifications_lues_le: quand || new Date().toISOString() };
        document.querySelectorAll(".barre-haute .bouton-icone .point").forEach((p) => p.remove());
        App.toast("Toutes tes notifications sont marquées comme lues.");
      } catch (e) { App.erreur(e); } finally { btnLu.disabled = false; }
    });
    const notifications = bloc("notifications", "Notifications", "Choisis ce qui apparaît dans la cloche en haut de l'écran et dans les petites bulles (toasts) en bas.",
      interrupteur("notif_lootbox", "Lootbox et stats gagnées en live", "Quand le stream t'envoie des lootbox ou des points de stats."),
      interrupteur("notif_succes", "Succès", "Quand tu débloques une médaille, avec sa fanfare."),
      interrupteur("notif_duels", "Duels", "Les défis et les résultats de tes duels."),
      interrupteur("notif_annonces", "Annonces", "Les nouveautés du jeu : patch notes, saisons, événements du stream. Arrive avec les annonces sur le site."),
      el("div", { class: "actions-bloc" }, btnLu, el("span", { class: "mention", texte: "Retire la pastille rouge de la cloche sans rien supprimer." })));

    // ---------- Compte Twitch ----------
    const meta = user.user_metadata || {};
    const identite = (user.identities || []).find((i) => i.provider === "twitch") || (user.identities || [])[0] || {};
    const twitchId = meta.provider_id || meta.sub || identite.id || "—";
    const info = (nom, valeur, aide) => el("div", { class: "ligne" }, el("span", { texte: nom }), el("b", { class: "num" }, valeur, aide ? el("small", { texte: aide }) : null));
    const compte = bloc("compte", "Compte Twitch", "Ton compte est relié à Twitch : c'est la seule façon de te connecter.",
      el("div", { class: "compte-tete" }, App.avatar(j, 64),
        el("div", {}, el("h3", { texte: j.display_name }),
          el("a", { href: "https://www.twitch.tv/" + encodeURIComponent(j.twitch_login), target: "_blank", rel: "noopener noreferrer", texte: "@" + j.twitch_login }))),
      el("div", { class: "lignes" },
        info("Identifiant Twitch", String(twitchId)),
        info("Compte lié le", date(identite.created_at || user.created_at)),
        info("Première connexion au site", date(j.premiere_connexion)),
        info("Dernière connexion", date(user.last_sign_in_at, true)),
        info("Joueur depuis", date(j.cree_le), "Sur le stream, avant l'ouverture du site")),
      el("a", { class: "btn-twitch-lien", href: App.TWITCH_CHAINE, target: "_blank", rel: "noopener noreferrer" }, icone("i-twitch"), "Retrouver le live sur Twitch"));

    // ---------- Discord ----------
    const discord = el("section", { class: "panneau-b bloc-reglages carte-discord", id: "discord", "aria-labelledby": "t-discord" },
      el("span", { class: "logo-discord", "aria-hidden": "true" }, icone("i-discord")),
      el("div", {}, el("h2", { id: "t-discord", texte: "Rejoins la communauté" }),
        el("p", { texte: "Sur le Discord : les annonces des lives, les patch notes avant tout le monde, et de l'entraide pour monter tes builds." })),
      el("a", { class: "btn-discord", href: App.DISCORD, target: "_blank", rel: "noopener noreferrer" }, "Rejoindre le Discord", icone("i-fleche")));

    // ---------- Session ----------
    const session = bloc("session", "Session", "Tu te déconnectes seulement de ce navigateur. Ta progression reste enregistrée.",
      el("div", { class: "actions-bloc" }, el("button", { class: "btn-second", type: "button", onclick: () => App.seDeconnecter() }, icone("i-sortie"), "Se déconnecter")));

    // ---------- Zone dangereuse ----------
    const danger = el("section", { class: "panneau-b bloc-reglages zone-danger", id: "suppression", "aria-labelledby": "t-suppression" },
      el("h2", { id: "t-suppression" }, icone("i-alerte"), "Zone dangereuse"),
      el("p", { class: "sous", texte: "Supprimer ton compte efface toute ta progression sur Stream RPG. C'est immédiat et définitif." }),
      el("button", { class: "btn-danger", type: "button", onclick: ouvrirSuppression }, "Supprimer mon compte"));

    function ouvrirSuppression() {
      const nbObjets = ctx.inventaire.size;
      const efface = [
        ["Ta collection", nbObjets ? fmt(nbObjets) + " objet" + (nbObjets > 1 ? "s" : "") + " et tous leurs niveaux" : "tous tes objets et leurs niveaux"],
        ["Ton équipement", "arme, main gauche, armure et stratagème"],
        ["Ta vitrine", "les cartes exposées sur ton profil"],
        ["Tes succès", "toutes tes médailles et leurs dates"],
        ["Ta progression", "stats, médailles, lootbox et tickets pas encore utilisés, dons reçus du live"],
        ["Tes préférences", "sons et notifications"],
        ["Ton historique de boutique", "achats, ventes et trocs"],
        ["Le lien avec Twitch", "ton compte de connexion au site"],
      ];
      const garde = [
        ["Les duels déjà joués", "ils restent dans l'historique public sous ton pseudo, mais ne sont plus reliés à aucun compte"],
        ["Ton compte Twitch", "il n'est pas touché, seul le lien avec Stream RPG disparaît"],
      ];
      const item = (ic, [t, d]) => el("li", {}, icone(ic), el("span", {}, el("b", { texte: t }), " : " + d + "."));
      const saisie = el("input", { type: "text", id: "confirmer-login", autocomplete: "off", autocapitalize: "none", spellcheck: "false", "aria-describedby": "aide-confirmation" });
      const champ = el("div", { class: "champ" }, saisie);
      const valider = el("button", { class: "btn-danger", type: "button", disabled: true }, "Supprimer définitivement");
      const correspond = () => saisie.value.trim().toLowerCase() === j.twitch_login;
      saisie.addEventListener("input", () => { const ok = correspond(); valider.disabled = !ok; champ.classList.toggle("ok", ok); });
      saisie.addEventListener("keydown", (e) => { if (e.key === "Enter" && correspond()) valider.click(); });
      valider.addEventListener("click", async () => {
        if (!correspond()) return;
        valider.disabled = true; saisie.disabled = true; valider.textContent = "Suppression…";
        try {
          await App.rpc("supprimer_mon_compte", { p_confirmation: saisie.value.trim() });
          try { await App.api.deconnexion(); } catch (e) { console.warn(e); }
          location.replace("jeu.html");
        } catch (e) {
          App.erreur(e);
          saisie.disabled = false; valider.disabled = !correspond(); valider.textContent = "Supprimer définitivement";
        }
      });
      App.tiroir({
        titre: "Supprimer mon compte",
        contenu: el("div", { style: { display: "grid", gap: "22px" } },
          el("p", { class: "suppr-intro" }, el("b", { texte: "C'est irréversible." }), " Personne ne pourra restaurer ton compte, même pas MrShyDiver. Si tu reviens un jour, tu repartiras de zéro."),
          el("div", { class: "bloc-suppr" }, el("h3", { texte: "Ce qui sera effacé" }), el("ul", { class: "liste-suppr efface" }, efface.map((x) => item("i-fermer", x)))),
          el("div", { class: "bloc-suppr" }, el("h3", { texte: "Ce qui reste" }), el("ul", { class: "liste-suppr garde" }, garde.map((x) => item("i-coche", x)))),
          el("div", { class: "confirmation" },
            el("label", { for: "confirmer-login" }, "Pour confirmer, tape ton pseudo Twitch : ", el("b", { texte: j.twitch_login })),
            champ,
            el("p", { class: "mention", id: "aide-confirmation", style: { marginTop: "8px" }, texte: "Le bouton se débloque quand le pseudo correspond exactement." }))),
        pied: [valider, el("button", { class: "btn-second", type: "button", onclick: () => App.fermerTiroir(), texte: "Annuler" })],
      });
      setTimeout(() => saisie.focus(), 60);
    }

    // ---------- Mise en page ----------
    const SOMMAIRE = [["sons", "Sons"], ["notifications", "Notifications"], ["compte", "Compte Twitch"], ["discord", "Discord"], ["session", "Session"], ["suppression", "Zone dangereuse"]];
    main.append(
      el("header", { class: "entete-page" }, el("div", {}, el("h1", { texte: "Paramètres" }),
        el("p", { texte: "Tes sons, tes notifications et ton compte. Tout s'enregistre dès que tu bascules un réglage." }))),
      el("div", { class: "parametres-grille" },
        el("nav", { class: "sommaire", "aria-label": "Sections des paramètres" },
          SOMMAIRE.map(([id, t]) => el("a", { href: "#" + id, class: id === "suppression" ? "danger" : null, texte: t }))),
        el("div", { class: "blocs-reglages" }, sons, notifications, compte, discord, session, danger)));

    // La page est rendue après coup : on rejoue l'ancre de l'URL (ex. parametres.html#notifications depuis la cloche).
    if (location.hash) { const cible = $(location.hash.replace(/[^#\w-]/g, "")); if (cible) cible.scrollIntoView(); }
  });
})();
