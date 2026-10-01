"use strict";
(function () {
  const { $, el, icone, fmt } = App;

  const duels = (p) => (p.victoires || 0) + (p.defaites || 0) + (p.egalites || 0);
  const pluriel = (n, mot) => fmt(n) + " " + mot + (n > 1 ? "s" : "");
  const MIN_DUELS = 10;
  const ONGLETS = [
    { id: "puissance", titre: "Puissance", note: "Puissance du build équipé, même calcul que le calculateur.", valeur: (p) => p._puissance, sec: (p) => fmt(p.victoires) + " V · " + fmt(p.defaites) + " D" },
    { id: "victoires", titre: "Victoires", note: "Duels gagnés, toutes saisons confondues.", valeur: (p) => p.victoires, sec: (p) => pluriel(duels(p), "duel") },
    { id: "winrate", titre: "Winrate", note: `Part de duels gagnés. Il faut au moins ${MIN_DUELS} duels pour apparaître ici.`, valeur: (p) => (duels(p) >= MIN_DUELS ? (p.victoires / duels(p)) * 100 : null),
      format: (v) => fmt(v, 1) + " %", departage: duels, sec: (p) => fmt(p.victoires) + " V · " + fmt(p.defaites) + " D" + (p.egalites ? " · " + fmt(p.egalites) + " N" : "") },
    { id: "serie", titre: "Série record", note: "La plus longue série de victoires d'affilée.", valeur: (p) => p.serie_record, sec: (p) => (p.serie_actuelle > 0 ? "En cours : " + fmt(p.serie_actuelle) : "") },
    { id: "coup", titre: "Plus gros coup", note: "Les dégâts du coup le plus violent jamais porté en duel.", valeur: (p) => p.plus_gros_coup, sec: (p) => fmt(p.degats_infliges) + " dégâts au total" },
    { id: "degats", titre: "Dégâts infligés", note: "Le total des dégâts infligés en duel.", valeur: (p) => p.degats_infliges, sec: (p) => fmt(p.degats_subis) + " subis" },
    { id: "collection", titre: "Collection", note: "Objets différents possédés. À égalité, les niveaux cumulés départagent.", valeur: (p) => p._distincts, departage: (p) => p._niveaux, sec: (p) => "Niveaux cumulés : " + fmt(p._niveaux) },
    { id: "lootbox", titre: "Lootbox ouvertes", note: "Lootbox ouvertes sur le site, légendaires comprises.", valeur: (p) => (p.lootbox_ouvertes || 0) + (p.lootbox_leg_ouvertes || 0), sec: (p) => (p.lootbox_leg_ouvertes ? "dont " + pluriel(p.lootbox_leg_ouvertes, "légendaire") : "") },
    { id: "medailles", titre: "Médailles", note: "Les médailles en poche en ce moment.", valeur: (p) => p.medailles, sec: () => "" },
    { id: "succes", titre: "Succès", note: "Nombre de succès débloqués.", valeur: (p) => p._succes, sec: (p) => p._paliers },
  ];
  const ordinal = (n) => (n === 1 ? "1er" : fmt(n) + "e");
  const normaliser = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const CLE_CACHE = "sr-classements-puissance";
  const DUREE_CACHE = 10 * 60 * 1000;

  App.demarrer("classements", async (main, ctx) => {
    const moiId = ctx.joueur.id;
    let courant = ONGLETS.find((o) => "#" + o.id === location.hash) || ONGLETS[0];
    let joueurs = null, puissancePrete = false, progression = [0, 0], recherche = "";

    const onglets = ONGLETS.map((o) => el("button", { type: "button", role: "tab", id: "onglet-" + o.id, "aria-controls": "panneau-classement",
      "aria-selected": String(o === courant), tabindex: o === courant ? "0" : "-1", onclick: () => choisir(o, true) }, o.titre));
    const liste = el("div", { class: "onglets-b onglets-defil", role: "tablist", "aria-label": "Classements" }, onglets);
    liste.addEventListener("keydown", (e) => {
      const i = ONGLETS.indexOf(courant), d = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
      if (!d) return;
      e.preventDefault();
      const o = ONGLETS[(i + d + ONGLETS.length) % ONGLETS.length];
      choisir(o, true); onglets[ONGLETS.indexOf(o)].focus();
    });
    const saisie = el("input", { type: "search", placeholder: "Chercher un joueur", "aria-label": "Chercher un joueur", autocomplete: "off", spellcheck: "false",
      oninput: (e) => { recherche = normaliser(e.target.value.trim()); rendre(); } });
    const note = el("p", { class: "mention", "aria-live": "polite" });
    const panneau = el("div", { id: "panneau-classement", role: "tabpanel", "aria-labelledby": "onglet-" + courant.id });
    main.append(
      el("header", { class: "entete-page" }, el("div", {}, el("h1", { texte: "Classements" }),
        el("p", { texte: "Qui domine l'arène ? Choisis un classement, trouve ta place et clique un joueur pour voir son profil." }))),
      liste,
      el("div", { class: "barre-classement" }, el("label", { class: "champ" }, icone("i-recherche"), saisie), note),
      panneau);

    function choisir(o, versHistorique) {
      courant = o;
      onglets.forEach((b, i) => { const oui = ONGLETS[i] === o; b.setAttribute("aria-selected", String(oui)); b.tabIndex = oui ? 0 : -1; });
      panneau.setAttribute("aria-labelledby", "onglet-" + o.id);
      if (versHistorique && location.hash !== "#" + o.id) history.replaceState(null, "", "#" + o.id);
      onglets[ONGLETS.indexOf(o)].scrollIntoView({ block: "nearest", inline: "nearest" });
      rendre();
    }
    addEventListener("hashchange", () => { const o = ONGLETS.find((x) => "#" + x.id === location.hash); if (o && o !== courant) choisir(o, false); });

    const squelettes = (n) => el("div", { class: "pile-squelettes" }, Array.from({ length: n }, () => el("div", { class: "squelette" })));

    function classer(o) {
      const l = [];
      for (const p of joueurs) {
        const v = o.valeur(p);
        if (v != null && v > 0) l.push({ p, v, d: o.departage ? o.departage(p) : 0 });
      }
      l.sort((a, b) => b.v - a.v || b.d - a.d || String(a.p.display_name).localeCompare(String(b.p.display_name), "fr"));
      l.forEach((x, i) => { const prec = l[i - 1]; x.rang = prec && prec.v === x.v && prec.d === x.d ? prec.rang : i + 1; });
      return l;
    }
    const lienProfil = (p) => "profil.html?joueur=" + encodeURIComponent(p.twitch_login);
    const valeurTexte = (o, v) => (o.format ? o.format(v) : fmt(v));

    function marche(x, i) {
      const moi = x.p.id === moiId;
      return el("a", { class: "marche p" + (i + 1) + (moi ? " moi" : ""), href: lienProfil(x.p), id: moi ? "ma-ligne" : null,
        "aria-label": ordinal(x.rang) + " : " + x.p.display_name + ", " + valeurTexte(courant, x.v) },
        el("div", { class: "porte-avatar" }, App.avatar(x.p, i === 0 ? 72 : 58), el("span", { class: "rang-badge num", texte: x.rang })),
        el("div", { class: "nom", texte: x.p.display_name }),
        el("div", { class: "val num", texte: valeurTexte(courant, x.v) }),
        el("div", { class: "sec", texte: courant.sec(x.p) || " " }));
    }
    function ligne(x) {
      const moi = x.p.id === moiId;
      return el("li", { class: "rang-ligne" + (x.rang <= 3 ? " p" + x.rang : "") + (moi ? " moi" : ""), id: moi ? "ma-ligne" : null },
        el("a", { href: lienProfil(x.p) },
          el("span", { class: "rang num", texte: x.rang }),
          App.avatar(x.p, 36),
          el("span", { class: "qui" }, el("b", { texte: x.p.display_name }), el("span", { texte: "@" + x.p.twitch_login })),
          el("span", { class: "val" }, el("b", { class: "num", texte: valeurTexte(courant, x.v) }), courant.sec(x.p) ? el("span", { class: "num", texte: courant.sec(x.p) }) : null)));
    }

    function allerAMaLigne() {
      if (recherche) { saisie.value = ""; recherche = ""; rendre(); }
      const n = $("#ma-ligne");
      if (!n) return;
      n.scrollIntoView({ behavior: App.reduit ? "auto" : "smooth", block: "center" });
      n.classList.remove("eclaire"); void n.offsetWidth; n.classList.add("eclaire");
      (n.matches("a") ? n : n.querySelector("a")).focus({ preventScroll: true });
    }

    function barrePosition(l) {
      const moi = l.find((x) => x.p.id === moiId);
      if (moi) return el("div", { class: "ma-position", role: "status" },
        el("span", {}, "Ta position : ", el("b", { class: "num", texte: ordinal(moi.rang) }), " / " + fmt(l.length)),
        el("button", { class: "btn-second", type: "button", onclick: allerAMaLigne }, "Voir ma ligne", icone("i-fleche")));
      const j = ctx.joueur;
      if (App.horsClassement(j)) return el("div", { class: "ma-position", role: "status" },
        el("span", { texte: "Ton compte est hors classement : le streamer et les comptes de test n'apparaissent pas ici." }));
      const pourquoi = courant.id === "winrate" && duels(j) < MIN_DUELS
        ? ` Il te faut ${MIN_DUELS} duels (tu en as ${fmt(duels(j))}).`
        : courant.id === "collection" ? " Ouvre une lootbox pour lancer ta collection." : "";
      return el("div", { class: "ma-position", role: "status" }, el("span", { texte: "Tu n'es pas encore classé en " + courant.titre.toLowerCase() + "." + pourquoi }),
        /^(winrate|victoires|serie|coup|degats)$/.test(courant.id) ? el("a", { class: "btn-second", href: "duels.html", texte: "Lancer un duel" })
          : el("a", { class: "btn-second", href: "lootbox.html", texte: "Ouvrir une lootbox" }));
    }

    function rendre() {
      if (!joueurs) return;
      if (courant.id === "puissance" && !puissancePrete) {
        note.textContent = courant.note;
        panneau.replaceChildren(el("div", { class: "calcul" },
          el("p", { class: "mention" }, el("span", { texte: "Calcul de la puissance de chaque build…" }), el("span", { class: "num", texte: fmt(progression[0]) + " / " + fmt(progression[1]) })),
          el("div", { class: "jauge-niv", role: "progressbar", "aria-label": "Calcul des puissances", "aria-valuemin": 0, "aria-valuemax": progression[1] || 1, "aria-valuenow": progression[0] },
            el("i", { style: { width: (progression[1] ? (100 * progression[0]) / progression[1] : 0) + "%", "--c": "var(--legendaire)" } })),
          el("div", { class: "podium", "aria-hidden": "true" }, [1, 0, 2].map((i) => el("div", { class: "squelette", style: { height: i === 0 ? "200px" : "170px" } }))),
          squelettes(6)));
        return;
      }
      const l = classer(courant);
      note.textContent = courant.note + " " + pluriel(l.length, "joueur") + " classé" + (l.length > 1 ? "s" : "") + ".";
      if (!l.length) {
        panneau.replaceChildren(el("div", { class: "vide" }, el("b", { texte: "Personne n'est encore classé ici." }), "Sois le premier : les résultats arrivent dès les prochains duels."), barrePosition(l));
        return;
      }
      if (recherche) {
        const trouves = l.filter((x) => normaliser(x.p.display_name).includes(recherche) || x.p.twitch_login.includes(recherche));
        panneau.replaceChildren(trouves.length
          ? el("ol", { class: "rang-liste", "aria-label": "Résultats de la recherche" }, trouves.map(ligne))
          : el("div", { class: "vide" }, el("b", { texte: "Aucun joueur classé ne correspond." }), "Vérifie l'orthographe, ou le joueur n'a pas encore de score dans ce classement. ",
            el("div", { style: { marginTop: "14px" } }, el("button", { class: "btn-second", type: "button", onclick: () => { saisie.value = ""; recherche = ""; rendre(); saisie.focus(); }, texte: "Effacer la recherche" }))),
        barrePosition(l));
        return;
      }
      panneau.replaceChildren(
        el("div", { class: "podium", "aria-label": "Podium" }, l.slice(0, 3).map(marche)),
        l.length > 3 ? el("ol", { class: "rang-liste", start: 4, "aria-label": "Suite du classement" }, l.slice(3).map(ligne)) : null,
        barrePosition(l));
    }

    // Puissance : ~200 simulations, par paquets pour ne pas figer la page, mises en cache pour la session.
    function lireCache() {
      try { const c = JSON.parse(sessionStorage.getItem(CLE_CACHE)); return c && Date.now() - c.t < DUREE_CACHE ? c.v : null; } catch { return null; }
    }
    async function calculerPuissances(niveauxPar, loadoutPar) {
      const cache = lireCache();
      if (cache && joueurs.every((p) => p.id in cache)) { joueurs.forEach((p) => { p._puissance = cache[p.id]; }); }
      else {
        progression = [0, joueurs.length];
        for (let i = 0; i < joueurs.length; i += 20) {
          for (const p of joueurs.slice(i, i + 20)) {
            const r = App.puissance(p, niveauxPar.get(p.id) || new Map(), loadoutPar.get(p.id));
            p._puissance = r && r.powerLevel ? Math.round(r.powerLevel) : null;
          }
          progression = [Math.min(i + 20, joueurs.length), joueurs.length];
          if (courant.id === "puissance") rendre();
          await new Promise((r) => setTimeout(r, 0));
        }
        try { sessionStorage.setItem(CLE_CACHE, JSON.stringify({ t: Date.now(), v: Object.fromEntries(joueurs.map((p) => [p.id, p._puissance])) })); } catch { /* stockage indisponible */ }
      }
      puissancePrete = true;
      if (courant.id === "puissance") rendre();
    }

    async function charger() {
      note.textContent = "";
      panneau.replaceChildren(squelettes(8));
      try {
        const [liste, inventaires, loadouts, succesJ, catalogue] = await Promise.all([
          App.api.joueurs(), App.api.inventaires(), App.api.loadouts(), App.api.succesJoueurs(), App.api.succes()]);
        const niveauxPar = new Map();
        for (const l of inventaires) {
          if (!niveauxPar.has(l.player_id)) niveauxPar.set(l.player_id, new Map());
          niveauxPar.get(l.player_id).set(l.item_numero, l.niveau);
        }
        const loadoutPar = new Map(loadouts.map((l) => [l.player_id, l]));
        const palierDe = new Map(catalogue.map((s) => [s.code, s.palier]));
        const succesPar = new Map();
        for (const s of succesJ) { if (!succesPar.has(s.player_id)) succesPar.set(s.player_id, []); succesPar.get(s.player_id).push(palierDe.get(s.code)); }
        joueurs = liste.filter(App.estClasse).map((p) => {
          const niv = niveauxPar.get(p.id) || new Map();
          let distincts = 0, niveaux = 0;
          for (const [n, v] of niv) { const o = App.objet(n); if (!o) continue; distincts++; niveaux += Math.min(v, App.niveauMax(o.rarete)); }
          const ps = succesPar.get(p.id) || [];
          const compte = (x) => ps.filter((y) => y === x).length;
          const paliers = [["legendaire", "légendaire"], ["or", "or"], ["argent", "argent"]].map(([k, nom]) => (compte(k) ? compte(k) + " " + nom + (k === "legendaire" && compte(k) > 1 ? "s" : "") : null)).filter(Boolean).join(" · ");
          return { ...p, _distincts: distincts, _niveaux: niveaux, _succes: ps.length, _paliers: paliers, _puissance: null };
        });
        rendre();
        calculerPuissances(niveauxPar, loadoutPar).catch(App.erreur);
      } catch (e) {
        App.erreur(e);
        panneau.replaceChildren(el("div", { class: "vide" }, el("b", { texte: "Les classements n'ont pas pu se charger." }), "Vérifie ta connexion puis réessaie.",
          el("div", { style: { marginTop: "14px" } }, el("button", { class: "btn-second", type: "button", onclick: charger, texte: "Réessayer" }))));
      }
    }
    await charger();
  });
})();
