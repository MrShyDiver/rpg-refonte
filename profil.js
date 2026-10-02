"use strict";
/* Profil : le sien (modifiable) ou celui d'un autre joueur (?joueur=<login>, lecture seule). */
(function () {
  const { $, el, icone, fmt, nombre, date, RARETES, ORDRE_RARETE, SLOTS, STATS, rangRarete } = App;

  const STATS_POINTS = ["atk", "def", "pv", "spd", "luck"];
  const CLE_CACHE = "profil-puissances-v1";
  const CACHE_MS = 5 * 60e3;
  const ISSUES = [["victoire", "Victoires"], ["defense", "Défenses"], ["egalite", "Égalités"], ["defaite", "Défaites"]];
  const RE_CAT = /^(victoire|defense|egalite|defaite)(Valeureuse|Exceptionnelle|Equitable|Deshonorable)$/;
  const COL_CAT = { Valeureuse: 0, Exceptionnelle: 0, Equitable: 1, Deshonorable: 2 };
  const CONNUS = new Set(["attaquesAuDessus", "attaquesDansTranche", "attaquesEnDessous", "protectionsActives", "categories", "equipementPrefere"]);

  const humaniser = (k) => { const t = String(k).replace(/_/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase(); return t.charAt(0).toUpperCase() + t.slice(1); };
  const signe = (v) => (v > 0 ? "+" : v < 0 ? "−" : "±") + fmt(Math.abs(v));
  const pluriel = (n, mot) => fmt(n) + " " + mot + (Math.abs(n) > 1 ? "s" : "");

  App.demarrer("profil", async (main, ctx) => {
    const login = (new URLSearchParams(location.search).get("joueur") || "").trim().toLowerCase();
    const proprio = !login || login === ctx.joueur.twitch_login;
    main.append(el("div", { class: "chargement", texte: "Chargement du profil…" }));

    // --- État de la page ---
    const s = { joueur: null, niv: new Map(), loadout: {}, vitrine: [], res: null, puissances: null, enAttente: {} };
    const pl = () => (s.res ? s.res.powerLevel : 0);

    function depuisCtx() {
      s.joueur = App.ctx.joueur;
      s.niv = App.niveaux();
      s.loadout = App.ctx.loadout || {};
    }
    const calculer = (joueur = s.joueur, loadout = s.loadout) => App.puissance(joueur, s.niv, loadout) || null;

    try {
      if (proprio) {
        depuisCtx();
        s.vitrine = (await App.api.vitrine(s.joueur.id)).map((v) => v.item_numero);
      } else {
        const j = await App.api.joueur(login);
        if (!j) { main.replaceChildren(introuvable(login)); return; }
        const [inv, lo, vit] = await Promise.all([App.api.inventaire(j.id), App.api.loadout(j.id), App.api.vitrine(j.id)]);
        s.joueur = j;
        s.niv = new Map(inv.map((l) => [l.item_numero, l.niveau]));
        s.loadout = lo || {};
        s.vitrine = vit.map((v) => v.item_numero);
        document.title = j.display_name + " · Profil · Stream RPG";
      }
    } catch (e) {
      App.erreur(e);
      main.replaceChildren(el("div", { class: "vide" }, el("b", { texte: "Le profil n'a pas pu se charger." }), "Vérifie ta connexion puis recharge la page."));
      return;
    }
    s.vitrine = s.vitrine.filter((n) => App.objet(n) && s.niv.has(n));
    s.res = calculer();

    rendre();
    chargerClassement();

    // =================================================================
    // Rendu
    // =================================================================
    function rendre() {
      const focus = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.f : null;
      main.replaceChildren(
        hero(),
        sectionVitrine(),
        sectionEquipement(),
        sectionPoints(),
        sectionStats(),
        sectionCarriere(),
        el("p", { class: "sr", "aria-live": "polite", "data-annonce": "" }));
      if (focus) { const c = main.querySelector(`[data-f="${focus}"]`); if (c) c.focus(); }
    }
    function remplacer(id, fabrique) {
      const ancien = main.querySelector("#" + id);
      if (!ancien) return;
      const focus = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.f : null;
      const neuf = fabrique();
      ancien.replaceWith(neuf);
      if (focus) { const c = neuf.querySelector(`[data-f="${focus}"]`); if (c) c.focus(); }
    }
    function annoncer(t) { const a = main.querySelector("[data-annonce]"); if (a) a.textContent = t; }

    // ---------- Hero ----------
    function hero() {
      const j = s.joueur;
      const v = j.victoires || 0, d = j.defaites || 0, e = j.egalites || 0, tot = v + d + e;
      const credits = proprio ? (j.credits_reset || 0) : 0;
      const stat = (lib, val, cls) => el("div", { class: "pf-mini" + (cls ? " " + cls : "") }, el("b", { class: "num", texte: val }), el("span", { texte: lib }));
      return el("section", { class: "pf-hero", "aria-labelledby": "pf-nom" },
        el("div", { class: "pf-id" },
          el("div", { class: "pf-avatar" }, App.avatar(j, 96)),
          el("div", { class: "pf-id-texte" },
            el("h1", { id: "pf-nom", texte: j.display_name }),
            el("p", { class: "pf-login" }, el("span", { texte: "@" + j.twitch_login }), el("span", { "aria-hidden": "true", texte: " · " }), App.estImporte(j) ? "Sur le stream avant l'ouverture du site" : ["Joueur depuis le ", el("time", { datetime: j.cree_le || "", texte: date(j.cree_le) })]),
            el("div", { class: "pf-liens" },
              proprio ? el("a", { class: "btn-second", href: "collection.html" }, icone("i-cartes"), "Voir tous mes objets") : el("a", { class: "btn-second", href: "profil.html" }, icone("i-profil"), "Mon profil"),
              el("a", { class: "btn-second", href: "classements.html" }, icone("i-podium"), "Classements")),
            credits > 0 ? el("a", { class: "pf-alerte", href: "#points" }, icone("i-etoile"), pluriel(credits, "point") + " à placer") : null)),
        el("div", { class: "pf-puissance", "data-puissance": "" },
          el("span", { class: "pf-etiq" }, "Puissance", el("a", { class: "lien-aide", href: "aide.html#puissance", "aria-label": "Aide : la puissance", title: "Aide : la puissance", texte: "?" })),
          el("b", { class: "num pf-pl", "data-pl": "", texte: fmt(pl()) }),
          el("span", { class: "pf-rang", "data-rang": "" }, texteRang())),
        App.horsClassement(j) ? el("div", { class: "pf-record pf-hors" }, horsClassement()) : el("div", { class: "pf-record" },
          stat("Victoires", fmt(v), "v"), stat("Défaites", fmt(d), "d"), stat("Égalités", fmt(e)),
          stat("Winrate", tot ? nombre(Math.round((v / tot) * 1000) / 10) + " %" : "—"),
          stat("Série en cours", fmt(j.serie_actuelle || 0), (j.serie_actuelle || 0) >= 5 ? "chaud" : "")));
    }
    function horsClassement() {
      return el("p", { class: "hors-classement" }, el("span", { class: "pilule", texte: "Compte hors classement" }),
        el("span", { texte: "Le streamer et les comptes de test jouent sans bilan ni stats : leurs victoires ne comptent pas." }));
    }
    function texteRang() {
      if (App.horsClassement(s.joueur)) return el("span", { texte: "Hors classement" });
      if (!s.puissances) return el("span", { class: "pf-attente", texte: "Classement en cours de calcul…" });
      const { rang, total } = classer();
      return [el("b", { class: "num", texte: "#" + fmt(rang) }), " sur " + fmt(total) + " joueurs"];
    }
    function classer() {
      const id = s.joueur.id, moi = pl();
      let rang = 1, total = 1;
      for (const [k, v] of s.puissances) { if (k === id) continue; total++; if (v > moi) rang++; }
      return { rang, total };
    }
    async function chargerClassement() {
      try {
        s.puissances = await puissancesDeTous();
        const r = main.querySelector("[data-rang]");
        if (r) r.replaceChildren(...[].concat(texteRang()));
      } catch (e) {
        console.warn(e);
        const r = main.querySelector("[data-rang]");
        if (r) r.textContent = "Classement indisponible";
      }
    }

    // ---------- Vitrine ----------
    function sectionVitrine() {
      const j = s.joueur;
      const sec = el("section", { class: "section-page", id: "vitrine", "aria-labelledby": "t-vitrine" });
      const entete = el("div", { class: "pf-entete" },
        el("div", {}, el("h2", { id: "t-vitrine", texte: "Vitrine" }),
          el("p", { class: "sous", texte: proprio ? "Tes plus belles pièces, exposées à tous ceux qui passent sur ton profil. Jusqu'à 8 cartes." : "Les pièces que " + j.display_name + " a choisi d'exposer." })),
        proprio ? el("button", { class: "btn-second", type: "button", "data-f": "vitrine-modifier", onclick: tiroirVitrine }, icone("i-cartes"), "Modifier la vitrine") : null);
      sec.append(entete);
      if (!proprio && !s.vitrine.length) {
        sec.append(el("p", { class: "pf-ligne-vide", texte: j.display_name + " n'a encore rien exposé dans sa vitrine." }));
        return sec;
      }
      const cases = [];
      s.vitrine.forEach((n, i) => {
        const o = App.objet(n), niv = niveauEffectif(n);
        cases.push(el("li", { class: "pf-vcase", style: { "--c": `var(--${o.rarete})`, "--i": i } },
          el("button", { class: "zone", type: "button", "data-f": "v" + n, "aria-label": "Voir la fiche : " + o.nom, onclick: () => ficheObjet(o) }, App.carte(o, { niveau: niv, ...autrui(o) })),
          el("div", { class: "pf-socle" }, el("span", { class: "pf-plaque" }, el("span", { class: "pf-pt", texte: RARETES[o.rarete].nom }), el("span", { class: "num", texte: libNiveau(o, niv) })))));
      });
      if (proprio) for (let i = s.vitrine.length; i < 8; i++) {
        cases.push(el("li", { class: "pf-vcase" },
          el("button", { class: "pf-vide-case", type: "button", "data-f": "vv" + i, "aria-label": "Emplacement libre : ajouter une carte", onclick: tiroirVitrine }, el("span", { class: "pf-plus", "aria-hidden": "true", texte: "+" }), el("span", { texte: "Emplacement libre" })),
          el("div", { class: "pf-socle" })));
      }
      sec.append(el("div", { class: "pf-vitrine" }, el("ol", { class: "pf-etagere" }, cases)));
      return sec;
    }

    function tiroirVitrine() {
      let sel = [...s.vitrine];
      const filtres = { rarete: null, slot: "", q: "" };
      const possedes = [...s.niv.keys()].map(App.objet).filter(Boolean)
        .sort((a, b) => rangRarete(b.rarete) - rangRarete(a.rarete) || niveauEffectif(b.numero) - niveauEffectif(a.numero) || a.numero - b.numero);

      const compteur = el("span", { class: "num" });
      const zoneSel = el("ol", { class: "pf-sel" });
      const grille = el("div", { class: "pf-choix-grille" });
      const pastilles = el("div", { class: "onglets-b pf-filtre-rarete", role: "group", "aria-label": "Filtrer par rareté" },
        [["", "Toutes"], ...ORDRE_RARETE.map((r) => [r, RARETES[r].nom])].map(([r, nom]) =>
          el("button", { type: "button", "aria-pressed": String(!r), "data-r": r, onclick: (e) => { filtres.rarete = r || null; pastilles.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b === e.currentTarget))); dessinerGrille(); } }, nom)));
      const selectSlot = el("select", { "aria-label": "Filtrer par emplacement", onchange: (e) => { filtres.slot = e.target.value; dessinerGrille(); } },
        el("option", { value: "", texte: "Tous les emplacements" }), Object.entries(SLOTS).map(([k, v]) => el("option", { value: k, texte: v.pluriel })));
      const recherche = el("input", { type: "search", placeholder: "Chercher un objet", "aria-label": "Chercher un objet", oninput: (e) => { filtres.q = e.target.value.trim().toLowerCase(); dessinerGrille(); } });

      function bouger(i, d) { const j = i + d; if (j < 0 || j >= sel.length) return; [sel[i], sel[j]] = [sel[j], sel[i]]; dessinerSel(`${d < 0 ? "h" : "b"}${sel[j]}`); }
      function retirer(n) { sel = sel.filter((x) => x !== n); dessinerSel(); dessinerGrille(); }
      function basculer(n) {
        if (sel.includes(n)) sel = sel.filter((x) => x !== n);
        else if (sel.length >= 8) { App.toast("La vitrine contient 8 cartes au maximum : retire une carte d'abord.", { type: "erreur" }); return; }
        else sel.push(n);
        dessinerSel(); dessinerGrille("g" + n);
      }
      function dessinerSel(focus) {
        compteur.textContent = sel.length + " / 8";
        zoneSel.replaceChildren(...(sel.length ? sel.map((n, i) => {
          const o = App.objet(n);
          return el("li", { class: "pf-sel-ligne", style: { "--c": `var(--${o.rarete})` } },
            el("span", { class: "pf-sel-rang num", texte: String(i + 1) }),
            el("div", { class: "pf-sel-carte" }, App.carte(o, { niveau: niveauEffectif(n) })),
            el("div", { class: "pf-sel-nom" }, el("b", { texte: o.nom }), el("span", { class: "pilule " + o.rarete, texte: RARETES[o.rarete].nom })),
            el("div", { class: "pf-sel-actions" },
              el("button", { class: "bouton-icone", type: "button", "data-t": "h" + n, "aria-label": "Monter " + o.nom, disabled: i === 0, onclick: () => bouger(i, -1) }, el("span", { "aria-hidden": "true", texte: "↑" })),
              el("button", { class: "bouton-icone", type: "button", "data-t": "b" + n, "aria-label": "Descendre " + o.nom, disabled: i === sel.length - 1, onclick: () => bouger(i, 1) }, el("span", { "aria-hidden": "true", texte: "↓" })),
              el("button", { class: "bouton-icone", type: "button", "aria-label": "Retirer " + o.nom + " de la vitrine", onclick: () => retirer(n) }, icone("i-fermer"))));
        }) : [el("li", { class: "pf-sel-vide", texte: "Aucune carte choisie : touche les cartes ci-dessous pour les exposer, dans l'ordre." })]));
        if (focus) { const b = zoneSel.querySelector(`[data-t="${focus}"]`); if (b && !b.disabled) b.focus(); }
      }
      function dessinerGrille(focus) {
        const liste = possedes.filter((o) => (!filtres.rarete || o.rarete === filtres.rarete) && (!filtres.slot || o.slot === filtres.slot) && (!filtres.q || o.nom.toLowerCase().includes(filtres.q)));
        grille.replaceChildren(...(liste.length ? liste.map((o) => {
          const pos = sel.indexOf(o.numero);
          return el("button", { class: "pf-choix-carte", type: "button", "data-t": "g" + o.numero, "aria-pressed": String(pos >= 0), "aria-label": o.nom + (pos >= 0 ? ", en vitrine position " + (pos + 1) : ""), onclick: () => basculer(o.numero) },
            App.carte(o, { niveau: niveauEffectif(o.numero) }),
            pos >= 0 ? el("span", { class: "pf-ordre num", "aria-hidden": "true", texte: String(pos + 1) }) : null);
        }) : [el("div", { class: "vide", texte: "Aucun objet ne correspond à ces filtres." })]));
        if (focus) { const b = grille.querySelector(`[data-t="${focus}"]`); if (b) b.focus(); }
      }
      dessinerSel(); dessinerGrille();

      const enregistrer = el("button", { class: "btn-principal", type: "button", onclick: async () => {
        enregistrer.disabled = true;
        try {
          await App.rpc("definir_vitrine", { p_numeros: sel });
          s.vitrine = [...sel];
          App.fermerTiroir();
          remplacer("vitrine", sectionVitrine);
          App.toast(sel.length ? "Ta vitrine affiche " + pluriel(sel.length, "carte") + "." : "Ta vitrine est vide.", { titre: "Vitrine enregistrée" });
          await App.verifierSucces();
        } catch (e) { App.erreur(e); enregistrer.disabled = false; }
      } }, "Enregistrer la vitrine");

      App.tiroir({
        titre: "Modifier la vitrine",
        contenu: el("div", { class: "pf-tiroir" },
          possedes.length ? null : el("div", { class: "vide" }, el("b", { texte: "Ton inventaire est vide." }), "Ouvre une lootbox pour obtenir tes premières cartes. ", el("a", { href: "lootbox.html", texte: "Aller aux lootbox" })),
          el("section", {}, el("h3", { class: "pf-h3" }, "Ta sélection ", compteur), zoneSel),
          possedes.length ? el("section", {},
            el("h3", { class: "pf-h3", texte: "Ton inventaire" }),
            el("div", { class: "pf-filtres" }, pastilles, el("div", { class: "pf-filtres-ligne" }, el("label", { class: "champ" }, icone("i-recherche"), recherche), el("label", { class: "champ" }, selectSlot))),
            grille) : null),
        pied: [enregistrer, el("button", { class: "btn-second", type: "button", onclick: () => App.fermerTiroir() }, "Annuler")],
      });
    }

    // ---------- Équipement ----------
    function sectionEquipement() {
      const sec = el("section", { class: "section-page", id: "equipement", "aria-labelledby": "t-equipement" },
        el("div", { class: "pf-entete" }, el("div", {}, el("h2", { id: "t-equipement", texte: "Équipement" }),
          el("p", { class: "sous", texte: proprio ? "Le loadout avec lequel tu te bats en ce moment. Il se change depuis ton inventaire." : "Le loadout avec lequel " + s.joueur.display_name + " se bat en ce moment." })),
          proprio ? el("a", { class: "btn-second", href: "collection.html#equipement" }, icone("i-cartes"), "Changer mon équipement") : null));
      const grille = el("div", { class: "pf-slots" });
      for (const [slot, def] of Object.entries(SLOTS)) {
        const n = s.loadout[def.col], o = n ? App.objet(n) : null;
        if (def.col === "offhand" && !o && App.deuxMains(s.loadout.arme)) {
          grille.append(el("div", { class: "pf-slot" }, el("h3", { class: "pf-slot-nom", texte: def.nom }),
            el("div", { class: "zone" }, el("div", { class: "pf-slot-vide" }, el("span", { class: "pf-plus", "aria-hidden": "true", texte: "—" }),
              el("span", { texte: "Occupée par l'arme à deux mains" })))));
          continue;
        }
        const contenu = o ? App.carte(o, { niveau: niveauEffectif(n), ...autrui(o) })
          : el("div", { class: "pf-slot-vide" }, el("span", { class: "pf-plus", "aria-hidden": "true", texte: proprio ? "+" : "—" }), el("span", { texte: proprio ? "Choisir" : "Rien d'équipé" }));
        const zone = o ? el("button", { class: "zone", type: "button", "aria-label": "Voir la fiche : " + o.nom, onclick: () => ficheObjet(o) }, contenu)
          : proprio ? el("a", { class: "zone", href: "collection.html#equipement", "aria-label": def.nom + " : vide, choisir un objet dans l'inventaire" }, contenu)
          : el("div", { class: "zone" }, contenu);
        grille.append(el("div", { class: "pf-slot", style: o ? { "--c": `var(--${o.rarete})` } : null },
          el("h3", { class: "pf-slot-nom", texte: def.nom }), zone,
          o ? el("p", { class: "pf-slot-niv num", texte: libNiveau(o, niveauEffectif(n)) + surplus(o, n) }) : null));
      }
      sec.append(grille);
      return sec;
    }

    // ---------- Points investis ----------
    function sectionPoints() {
      const j = s.joueur, credits = proprio ? (j.credits_reset || 0) : 0, tickets = proprio ? (j.tickets_reset || 0) : 0;
      const attente = STATS_POINTS.reduce((t, k) => t + (s.enAttente[k] || 0), 0);
      const reste = credits - attente;
      const valeurs = STATS_POINTS.map((k) => (j[k + "_stacks"] || 0) + (s.enAttente[k] || 0));
      const max = Math.max(10, ...valeurs);
      const total = STATS_POINTS.reduce((t, k) => t + (j[k + "_stacks"] || 0), 0);
      const effet = { atk: "+1 attaque par point", def: "+1 défense par point", pv: "+10 PV par point", spd: "+1 vitesse par point", luck: "+1 chance par point (critiques)" };

      const lignes = STATS_POINTS.map((k) => {
        const pts = j[k + "_stacks"] || 0, plus = s.enAttente[k] || 0;
        return el("li", { class: "pf-barre-ligne" + (credits > 0 ? " edition" : "") },
          el("div", { class: "pf-barre-lib" }, el("b", { texte: STATS[k] }), el("span", { texte: effet[k] })),
          el("div", { class: "pf-barre", role: "img", "aria-label": STATS[k] + " : " + pts + " points" + (plus ? ", " + plus + " en attente" : "") },
            el("i", { style: { width: (pts / max) * 100 + "%" } }),
            plus ? el("i", { class: "attente", style: { width: (plus / max) * 100 + "%" } }) : null),
          el("span", { class: "pf-barre-val num" }, fmt(pts), plus ? el("em", { texte: " +" + plus }) : null),
          credits > 0 ? el("div", { class: "pf-pas" },
            el("button", { class: "bouton-icone", type: "button", "data-f": "moins-" + k, "aria-label": "Retirer un point en " + STATS[k], disabled: !plus, onclick: () => { s.enAttente[k] = plus - 1; remplacer("points", sectionPoints); } }, el("span", { "aria-hidden": "true", texte: "−" })),
            el("button", { class: "bouton-icone", type: "button", "data-f": "plus-" + k, "aria-label": "Ajouter un point en " + STATS[k], disabled: reste <= 0, onclick: () => { s.enAttente[k] = plus + 1; remplacer("points", sectionPoints); } }, el("span", { "aria-hidden": "true", texte: "+" }))) : null);
      });

      let panneauCredits = null;
      if (credits > 0) {
        const apres = attente ? App.puissance({ ...j, ...Object.fromEntries(STATS_POINTS.map((k) => [k + "_stacks", (j[k + "_stacks"] || 0) + (s.enAttente[k] || 0)])) }, s.niv, s.loadout) : null;
        panneauCredits = el("div", { class: "pf-credits" },
          el("div", {}, el("b", { class: "num", texte: fmt(reste) }), el("span", { texte: reste > 1 ? " points à placer" : " point à placer" }),
            apres ? el("p", { class: "mention" }, "Puissance après validation : ", el("b", { class: "num", texte: fmt(apres.powerLevel) }), " (", signe(Math.round(apres.powerLevel - pl())), ")") : el("p", { class: "mention", texte: "Utilise + et − pour répartir tes points, puis valide." })),
          el("div", { class: "pf-credits-actions" },
            el("button", { class: "btn-second", type: "button", "data-f": "annuler-points", disabled: !attente, onclick: () => { s.enAttente = {}; remplacer("points", sectionPoints); } }, "Annuler"),
            el("button", { class: "btn-principal", type: "button", "data-f": "valider-points", disabled: !attente, onclick: validerPoints }, "Valider")));
      }

      return el("section", { class: "section-page", id: "points", "aria-labelledby": "t-points" },
        el("div", { class: "pf-entete" },
          el("div", {}, el("h2", { id: "t-points", texte: "Points investis" }),
            el("p", { class: "sous" }, "Gagnés en live avec les points de chaîne : ", el("b", { class: "num", texte: fmt(total) }), " au total.")),
          tickets > 0 ? el("button", { class: "btn-second", type: "button", "data-f": "ticket", onclick: tiroirReset }, icone("i-ticket"), "Utiliser un ticket de reset (" + fmt(tickets) + ")") : null),
        el("div", { class: "panneau-b pf-points" }, panneauCredits, el("ul", { class: "pf-barres" }, lignes)));
    }

    async function validerPoints() {
      const avant = pl();
      const aPlacer = STATS_POINTS.filter((k) => s.enAttente[k] > 0);
      try {
        for (const k of aPlacer) { await App.rpc("placer_points", { p_stat: k, p_quantite: s.enAttente[k] }); s.enAttente[k] = 0; }
      } catch (e) { App.erreur(e); }
      s.enAttente = {};
      await App.rafraichirJoueur();
      depuisCtx();
      s.res = calculer();
      rendre();
      animerPuissance(avant, pl());
      const b = main.querySelector("#t-points"); if (b) b.scrollIntoView({ block: "start", behavior: App.reduit ? "auto" : "smooth" });
      App.toast("Tes points sont en place.", { titre: "Puissance " + fmt(pl()) + " (" + signe(Math.round(pl() - avant)) + ")" });
      await App.verifierSucces();
    }

    function tiroirReset() {
      const j = s.joueur, total = STATS_POINTS.reduce((t, k) => t + (j[k + "_stacks"] || 0), 0);
      const confirmer = el("button", { class: "btn-principal", type: "button", onclick: async () => {
        confirmer.disabled = true;
        try {
          const r = await App.rpc("utiliser_ticket_reset");
          App.fermerTiroir();
          s.enAttente = {};
          const avant = pl();
          await App.rafraichirJoueur();
          depuisCtx();
          s.res = calculer();
          rendre();
          animerPuissance(avant, pl());
          const p = main.querySelector("#points"); if (p) p.scrollIntoView({ block: "start", behavior: App.reduit ? "auto" : "smooth" });
          App.toast("Répartis-les comme tu veux, puis valide.", { titre: pluriel(r.points_a_placer, "point") + " à placer" });
          await App.verifierSucces();
        } catch (e) { App.erreur(e); confirmer.disabled = false; }
      } }, "Utiliser le ticket");
      App.tiroir({
        titre: "Ticket de reset",
        contenu: el("div", { class: "pf-tiroir" },
          el("p", {}, "Le ticket te rend ", el("b", { class: "num", texte: pluriel(total, "point") }), " investi" + (total > 1 ? "s" : "") + " dans tes stats. Toutes tes stats repartent de leur base, et tu replaces ces points librement ici même, juste après."),
          el("ul", { class: "lignes" }, STATS_POINTS.map((k) => el("li", { class: "ligne" }, el("span", { texte: STATS[k] }), el("b", { class: "num" }, fmt(j[k + "_stacks"] || 0), " → 0")))),
          el("p", { class: "mention", texte: "Le ticket est consommé. Tes objets, ta vitrine et ton historique ne bougent pas. Tant que tes points ne sont pas replacés, ta puissance est au plus bas : pense à les placer avant ton prochain duel." })),
        pied: [confirmer, el("button", { class: "btn-second", type: "button", onclick: () => App.fermerTiroir() }, "Garder mes stats")],
      });
    }

    // ---------- Statistiques de combat ----------
    function sectionStats() {
      const sec = el("section", { class: "section-page", id: "stats", "aria-labelledby": "t-stats" },
        el("h2", { id: "t-stats", texte: "Statistiques de combat" }),
        el("p", { class: "sous", texte: "Base du personnage, points investis et bonus des objets équipés. Mêmes calculs que le calculateur." }));
      const r = s.res;
      if (!r || !r.stats) { sec.append(el("div", { class: "vide", texte: "Les statistiques ne sont pas disponibles pour le moment." })); return sec; }
      const st = r.stats, j = s.joueur, stk = (k) => j[k + "_stacks"] || 0;
      const spdGear = st.spd - (10 + stk("spd")); // vitesse linéaire depuis le moteur 1.1
      const tuiles = [
        { k: "atk", nom: STATS.atk, base: 10, pts: stk("atk"), gear: st.atk - 10 - stk("atk"), sous: null },
        { k: "def", nom: STATS.def, base: 10, pts: stk("def"), gear: st.def - 10 - stk("def"), sous: typeof mitigation === "function" ? nombre(mitigation(st.def) * 100) + " % des dégâts absorbés" : null },
        { k: "pv", nom: STATS.pv, base: 100, pts: stk("pv") * 10, ptsLib: stk("pv") + " × 10", gear: st.pv - 100 - stk("pv") * 10, sous: fmt(r.pvTotaux) + " PV effectifs avec boucliers et soins" },
        // Vitesse : on montre les points BRUTS investis (jamais la valeur réduite par le rendement dégressif),
        // et le total = base + points + objets pour que le chiffre et sa décomposition concordent.
        { k: "spd", nom: STATS.spd, base: 10, pts: stk("spd"), gear: spdGear, sous: null },
        { k: "luck", nom: STATS.luck, base: 0, pts: stk("luck"), gear: st.luckLineaire - stk("luck"), sous: nombre(r.critPct) + " % de coups critiques" },
        { k: "esquive", nom: STATS.esquive, base: 15, pts: 0, gear: st.esquiveGear || 0, suffixe: " %", sous: "Chance d'éviter un coup" },
      ];
      sec.append(el("div", { class: "pf-tuiles" }, tuiles.map(tuile)),
        el("div", { class: "pf-legende", "aria-hidden": "true" }, el("span", { class: "b", texte: "Base" }), el("span", { class: "p", texte: "Points investis" }), el("span", { class: "o", texte: "Objets équipés" })),
        el("div", { class: "pf-estim" },
          el("h3", { class: "pf-h3", texte: "Estimations de la simulation" }),
          el("div", { class: "grille-chiffres" },
            chiffre(nombre(r.critPct) + " %", "Critique"),
            chiffre(nombre(r.esquivePct) + " %", "Esquive"),
            chiffre(fmt(r.dpaInflige), "Dégâts par action"),
            chiffre(nombre(Math.round(r.survieTours * 10) / 10), "Tours de survie estimés"),
            chiffre(fmt(r.pvTotaux), "PV effectifs")),
          el("p", { class: "mention", texte: "Combat simulé contre un mannequin qui se renforce à chaque tour : utile pour comparer des builds, pas une prédiction de duel." })));
      return sec;
    }
    function tuile(t) {
      const gear = Math.round(t.gear), pts = Math.round(t.pts), base = t.base;
      const total = base + pts + gear, suf = t.suffixe || "";
      const pos = Math.max(1, base + pts + Math.max(0, gear));
      return el("div", { class: "pf-tuile", "data-stat": t.k },
        el("span", { class: "pf-tuile-nom", texte: t.nom }),
        el("b", { class: "num pf-tuile-val", texte: fmt(total) + suf }),
        el("div", { class: "pf-decomp", role: "img", "aria-label": `${base} de base, ${pts} de points investis, ${gear} des objets` },
          el("i", { class: "b", style: { width: (base / pos) * 100 + "%" } }),
          pts ? el("i", { class: "p", style: { width: (pts / pos) * 100 + "%" } }) : null,
          gear > 0 ? el("i", { class: "o", style: { width: (gear / pos) * 100 + "%" } }) : null),
        el("p", { class: "pf-detail num" },
          el("span", { class: "b", texte: fmt(base) }),
          t.k !== "esquive" ? [" + ", el("span", { class: "p", texte: t.ptsLib || fmt(pts) })] : null,
          " ", el("span", { class: gear < 0 ? "n" : "o", texte: (gear < 0 ? "− " : "+ ") + fmt(Math.abs(gear)) })),
        t.sous ? el("p", { class: "pf-tuile-sous", texte: t.sous }) : null);
    }
    function chiffre(val, lib, petit) { return el("div", { class: "chiffre" }, el("b", { class: "num", texte: val }), el("span", { texte: lib }), petit ? el("small", { texte: petit }) : null); }

    // ---------- Carrière ----------
    function sectionCarriere() {
      const j = s.joueur, cd = j.combat_details || {}, cat = cd.categories || {};
      const v = j.victoires || 0, d = j.defaites || 0, e = j.egalites || 0, tot = v + d + e;
      const ratio = j.degats_subis > 0 ? nombre(Math.round((j.degats_infliges / j.degats_subis) * 100) / 100) : (j.degats_infliges > 0 ? "∞" : "—");
      const med = [];
      if (j.medailles_duel) med.push(fmt(j.medailles_duel) + " gagnées en duel");
      if (j.medailles_revente) med.push(fmt(j.medailles_revente) + " en revente");
      const sec = el("section", { class: "section-page", id: "carriere", "aria-labelledby": "t-carriere" },
        el("h2", { id: "t-carriere", texte: "Carrière" }),
        App.horsClassement(j) ? horsClassement() : el("p", { class: "sous", texte: tot ? pluriel(tot, "duel") + " disputé" + (tot > 1 ? "s" : "") + " depuis l'arrivée sur Stream RPG." : "Aucun duel pour l'instant : la carrière commence au premier combat." }),
        el("div", { class: "grille-chiffres" },
          chiffre(fmt(v), "Victoires", tot ? nombre(Math.round((v / tot) * 1000) / 10) + " % de winrate" : null),
          chiffre(fmt(d), "Défaites"),
          chiffre(fmt(e), "Égalités"),
          chiffre(fmt(j.serie_actuelle || 0), "Série en cours", "Record : " + fmt(j.serie_record || 0)),
          chiffre(fmt(j.degats_infliges || 0), "Dégâts infligés", "Ratio " + ratio),
          chiffre(fmt(j.degats_subis || 0), "Dégâts subis"),
          chiffre(fmt(j.plus_gros_coup || 0), "Plus gros coup"),
          chiffre(fmt(j.points || 0), "Points"),
          chiffre(fmt(j.medailles || 0), "Médailles", med.join(" · ") || null),
          chiffre(fmt((j.lootbox_ouvertes || 0) + (j.lootbox_leg_ouvertes || 0)), "Lootbox ouvertes", j.lootbox_leg_ouvertes ? "dont " + fmt(j.lootbox_leg_ouvertes) + " légendaire" + (j.lootbox_leg_ouvertes > 1 ? "s" : "") : null),
          cd.protectionsActives ? chiffre(fmt(cd.protectionsActives), "Protections actives", "−20 % de dégâts pour un combat") : null));

      // Tableau victoires / défenses / égalités / défaites × valeureuse / équitable / déshonorable
      const grille = ISSUES.map(() => [0, 0, 0]), autres = [];
      let aDesCat = false;
      for (const [k, val] of Object.entries(cat)) {
        const m = RE_CAT.exec(k);
        if (m) { grille[ISSUES.findIndex(([i]) => i === m[1])][COL_CAT[m[2]]] += Number(val) || 0; aDesCat = true; }
        else if (typeof val === "number") autres.push([k, val]);
      }
      for (const [k, val] of Object.entries(cd)) if (!CONNUS.has(k) && typeof val === "number") autres.push([k, val]);

      const type = typeCombattant(cd);
      const blocDetail = el("div", { class: "pf-carriere-bas" });
      if (aDesCat) {
        blocDetail.append(el("div", { class: "panneau-b pf-matrice" },
          el("h3", { class: "pf-h3", texte: "Détail des combats" }),
          el("div", { class: "pf-table-zone" }, el("table", { class: "pf-table" },
            el("caption", { class: "sr", texte: "Répartition des combats par issue et par écart de puissance" }),
            el("thead", {}, el("tr", {}, el("th", { scope: "col" }, el("span", { class: "sr", texte: "Issue" })),
              el("th", { scope: "col", texte: "Valeureuse" }), el("th", { scope: "col", texte: "Équitable" }), el("th", { scope: "col", texte: "Déshonorable" }))),
            el("tbody", {}, ISSUES.map(([cle, nom], i) => el("tr", { class: cle },
              el("th", { scope: "row", texte: nom }),
              grille[i].map((n, c) => el("td", { class: "num" + (n ? "" : " zero") }, fmt(n), cle === "defense" && c === 0 ? el("small", { texte: "exceptionnelle" }) : null))))))),
          el("p", { class: "mention", texte: "Valeureuse : face à plus fort · Équitable : dans ta tranche de puissance · Déshonorable : face à plus faible." })));
      }
      const cote = el("div", { class: "pf-carriere-cote" });
      if (type) cote.append(el("div", { class: "panneau-b pf-type " + type.cls },
        el("h3", { class: "pf-h3", texte: "Style de combattant" }), el("b", { class: "pf-type-nom", texte: type.nom }), el("p", { texte: type.texte }),
        el("p", { class: "mention num", texte: `Cibles choisies : ${fmt(cd.attaquesAuDessus || 0)} plus fortes · ${fmt(cd.attaquesDansTranche || 0)} à sa taille · ${fmt(cd.attaquesEnDessous || 0)} plus faibles` })));
      const fetiches = Object.entries(SLOTS).map(([, def]) => [def, App.objet((cd.equipementPrefere || {})[def.col])]).filter(([, o]) => o);
      if (fetiches.length) cote.append(el("div", { class: "panneau-b pf-fetiches" },
        el("h3", { class: "pf-h3", texte: "Objets fétiches" }),
        el("div", { class: "pf-fetiches-grille" }, fetiches.map(([def, o]) => el("button", { class: "zone", type: "button", "aria-label": def.nom + " préférée : " + o.nom, onclick: () => ficheObjet(o) }, App.carte(o, { niveau: s.niv.has(o.numero) ? niveauEffectif(o.numero) : null, verrouille: !s.niv.has(o.numero), ...autrui(o) })))),
        el("p", { class: "mention", texte: "Les objets les plus utilisés en duel, par emplacement." })));
      if (autres.length) cote.append(el("div", { class: "panneau-b" }, el("h3", { class: "pf-h3", texte: "Autres compteurs" }),
        el("div", { class: "lignes" }, autres.map(([k, val]) => el("div", { class: "ligne" }, el("span", { texte: humaniser(k) }), el("b", { class: "num", texte: fmt(val) }))))));
      if (cote.childNodes.length) blocDetail.append(cote);
      if (blocDetail.childNodes.length) sec.append(blocDetail);
      return sec;
    }
    function typeCombattant(cd) {
      const h = cd.attaquesAuDessus || 0, t = cd.attaquesDansTranche || 0, b = cd.attaquesEnDessous || 0;
      if (h + t + b < 3) return h + t + b ? { nom: "À confirmer", cls: "neutre", texte: "Pas encore assez de duels ciblés pour se faire une réputation." } : null;
      if (b > t && b > h) return { nom: "Bully", cls: "bully", texte: "Attaque surtout des joueurs plus faibles." };
      if (h > t && h > b) return { nom: "Valeureux", cls: "valeureux", texte: "Défie surtout des joueurs plus forts." };
      return { nom: "Fair-play", cls: "fairplay", texte: "Choisit surtout des adversaires à sa taille." };
    }

    // ---------- Outils ----------
    function autrui(o) { return proprio ? {} : { equipe: ["arme", "offhand", "armure", "strategeme"].some((k) => s.loadout && s.loadout[k] === o.numero) }; }
    function niveauEffectif(n) { const o = App.objet(n); return o ? Math.min(s.niv.get(n) || 0, App.niveauMax(o.rarete)) : 0; }
    function libNiveau(o, niv) { const max = App.niveauMax(o.rarete); return niv >= max ? "MAX" : "+" + niv + " / +" + max; }
    function surplus(o, n) { const trop = (s.niv.get(n) || 0) - App.niveauMax(o.rarete); return proprio && trop > 0 ? " · +" + trop + " en trop" : ""; }
    function ficheObjet(o) {
      const possede = s.niv.has(o.numero);
      App.tiroir({ titre: o.nom, contenu: App.fiche(o, { niveau: possede ? niveauEffectif(o.numero) : 0, possede: proprio ? possede : null }) });
    }
    function animerPuissance(de, a) {
      const nb = main.querySelector("[data-pl]"), zone = main.querySelector("[data-puissance]");
      if (!nb) return;
      const diff = Math.round(a) - Math.round(de);
      annoncer("Puissance : " + fmt(a) + (diff ? " (" + signe(diff) + ")" : ""));
      if (!diff) return;
      zone.append(el("span", { class: "pf-delta " + (diff > 0 ? "plus" : "moins"), "aria-hidden": "true", texte: signe(diff) }));
      zone.classList.add(diff > 0 ? "monte" : "baisse");
      if (App.reduit) { nb.textContent = fmt(a); return; }
      const t0 = performance.now(), duree = 900;
      nb.textContent = fmt(de);
      const pas = (t) => { const k = Math.min(1, (t - t0) / duree), e = 1 - Math.pow(1 - k, 4); nb.textContent = fmt(de + (a - de) * e); if (k < 1) requestAnimationFrame(pas); };
      requestAnimationFrame(pas);
    }
  });

  // Puissance de tous les joueurs (rang au classement), gardée 5 min dans la session.
  async function puissancesDeTous() {
    try {
      const c = JSON.parse(sessionStorage.getItem(CLE_CACHE) || "null");
      if (c && Date.now() - c.t < CACHE_MS) return new Map(Object.entries(c.p));
    } catch (e) { /* stockage indisponible : on recalcule */ }
    const [joueurs, invs, los] = await Promise.all([App.api.joueurs(), App.api.inventaires(), App.api.loadouts()]);
    const niv = new Map();
    for (const l of invs) { if (!niv.has(l.player_id)) niv.set(l.player_id, new Map()); niv.get(l.player_id).set(l.item_numero, l.niveau); }
    const lo = new Map(los.map((l) => [l.player_id, l]));
    const p = {};
    for (const j of joueurs.filter(App.estClasse)) { const r = App.puissance(j, niv.get(j.id) || new Map(), lo.get(j.id)); if (r) p[j.id] = r.powerLevel; }
    try { sessionStorage.setItem(CLE_CACHE, JSON.stringify({ t: Date.now(), p })); } catch (e) { /* ignoré */ }
    return new Map(Object.entries(p));
  }

  function introuvable(login) {
    const { el, icone } = App;
    return el("div", { class: "vide pf-introuvable" },
      el("b", { texte: "Aucun joueur « " + login + " » sur Stream RPG." }),
      "Vérifie l'orthographe du pseudo Twitch, ou retrouve-le dans les classements.",
      el("div", { class: "pf-liens" }, el("a", { class: "btn-second", href: "classements.html" }, icone("i-podium"), "Classements"), el("a", { class: "btn-second", href: "profil.html" }, icone("i-profil"), "Mon profil")));
  }
})();
