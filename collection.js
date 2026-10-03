"use strict";
/* Inventaire (collection.html) : équipement, tout ce que le joueur possède, progression. */
(function () {
const { el, icone, fmt, date, RARETES, ORDRE_RARETE, SLOTS, EFFETS, rangRarete } = App;
const COLS = ["arme", "offhand", "armure", "strategeme"];
const TRIS = [["rarete", "Rareté"], ["niveau", "Amélioration"], ["numero", "Numéro"], ["recent", "Récemment obtenu"]];
const norm = (s) => String(s || "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
const basculer = (set, v) => (set.has(v) ? set.delete(v) : set.add(v));
const lienAide = (ancre, sujet) => el("a", { class: "lien-aide", href: "aide.html#" + ancre, "aria-label": "Aide : " + sujet, title: "Aide : " + sujet, texte: "?" });

App.demarrer("collection", async (main, ctx) => {
  const p = new URLSearchParams(location.search);
  const liste = (k, ok) => new Set((p.get(k) || "").split(",").filter(ok));
  const f = {
    slot: SLOTS[p.get("slot")] ? p.get("slot") : "tout",
    raretes: liste("rarete", (r) => RARETES[r]),
    effets: liste("effet", (e) => EFFETS.some(([id]) => id === e)),
    q: p.get("q") || "",
    tri: TRIS.some(([t]) => t === p.get("tri")) ? p.get("tri") : "rarete",
    manquants: p.get("manquants") === "1",
  };
  let objetOuvert = null;

  const actifs = App.objets.filter((o) => o.actif);
  const effetsDe = new Map(App.objets.map((o) => [o.numero, App.effetsDe(o)]));
  const ligne = (o) => ctx.inventaire.get(o.numero);
  const max = (o) => App.niveauMax(o.rarete);
  const eff = (o) => Math.min(ligne(o).niveau, max(o));
  const enTrop = (o) => Math.max(0, ligne(o).niveau - max(o));
  const equipes = () => new Set(COLS.map((c) => ctx.loadout[c]).filter((n) => n != null));
  const puissance = (lo) => { const r = App.puissance(ctx.joueur, App.niveaux(), lo); return r ? Math.round(r.powerLevel) : null; };


  // ---------- Équipement : les quatre emplacements, changés d'un clic ----------
  const signe = (n) => (n > 0 ? "+" : n < 0 ? "−" : "±") + fmt(Math.abs(n));
  const brute = (lo) => { const r = App.puissance(ctx.joueur, App.niveaux(), lo); return r ? r.powerLevel : 0; };
  const libNiveau = (o) => (eff(o) >= max(o) ? "MAX" : `+${eff(o)} / +${max(o)}`);
  const zoneEquip = el("section", { class: "section-page inv-equip", id: "equipement", "aria-labelledby": "t-equipement" });
  // Deux builds : celui de combat (duels, attaques de ligue) et celui de défense (ce que les autres affrontent en ligue).
  // Sans défense réglée, c'est le build de combat qui défend.
  let modeEquip = p.get("build") === "defense" ? "defense" : "combat";
  let defense = await App.api.loadoutDefense(ctx.joueur.id).catch(() => null);
  const build = () => (modeEquip === "defense" ? defense || ctx.loadout : ctx.loadout);
  const choisirBuild = (m) => { modeEquip = m; rendreEquipement(); const b = zoneEquip.querySelector(`[data-build="${m}"]`); if (b) b.focus(); };

  function rendreEquipement() {
    const lo = build(), enDefense = modeEquip === "defense";
    const pl = puissance(lo);
    zoneEquip.replaceChildren(
      el("div", { class: "pf-entete" },
        el("div", {}, el("h2", { id: "t-equipement", texte: "Équipement" }),
          el("div", { class: "onglets-b inv-builds", role: "group", "aria-label": "Quel build régler" },
            [["combat", "Build de combat"], ["defense", "Défense de ligue"]].map(([m, t]) => el("button", { type: "button", "data-build": m, "aria-pressed": String(m === modeEquip), texte: t, onclick: () => choisirBuild(m) }))),
          el("p", { class: "sous", texte: enDefense
            ? "C'est ce build qui se bat à ta place quand un joueur t'attaque en ligue. " + (!defense ? "Pour l'instant, c'est ton build de combat : change un emplacement pour régler une défense à part."
              : defense.arme == null ? "Attention : sans arme, c'est ton build de combat qui défend." : "Tu as réglé une défense à part de ton build de combat.")
            : "Touche un emplacement pour changer d'objet : l'effet sur ta puissance s'affiche avant de valider." }),
          enDefense && defense ? el("button", { type: "button", class: "btn-second petit", onclick: reprendreCombat }, "Reprendre mon build de combat") : null),
        pl !== null ? el("p", { class: "inv-puissance" }, enDefense ? "Puissance en défense " : "Puissance ", el("b", { class: "num", texte: fmt(pl) })) : null),
      el("div", { class: "pf-slots" }, Object.entries(SLOTS).map(([slot, def]) => {
        const o = lo[def.col] != null ? App.objet(lo[def.col]) : null;
        const prise = def.col === "offhand" && !o && App.deuxMains(lo.arme);
        const contenu = o && ligne(o) ? App.carte(o, { niveau: eff(o), equipe: false })
          : el("div", { class: "pf-slot-vide" }, el("span", { class: "pf-plus", "aria-hidden": "true", texte: prise ? "—" : "+" }), el("span", { texte: prise ? "Occupée par l'arme à deux mains" : "Choisir" }));
        return el("div", { class: "pf-slot", style: o ? { "--c": `var(--${o.rarete})` } : null },
          el("h3", { class: "pf-slot-nom", texte: def.nom }),
          prise ? el("div", { class: "zone" }, contenu)
            : el("button", { class: "zone", type: "button", "data-f": "slot-" + def.col, "aria-label": def.nom + " : " + (o ? o.nom + ", changer" : "vide, choisir un objet"), onclick: () => tiroirEquiper(slot) }, contenu),
          o && ligne(o) ? el("p", { class: "pf-slot-niv num", texte: libNiveau(o) }) : null);
      })));
  }

  function tiroirEquiper(slot) {
    const lo = build();
    const def = SLOTS[slot], col = def.col, actuel = lo[col] || null;
    const base = brute(lo);
    const delta = (n) => Math.round(brute({ ...lo, [col]: n }) - base);
    const candidats = App.objets.filter((o) => o.slot === slot && ligne(o))
      .map((o) => ({ o, d: o.numero === actuel ? 0 : delta(o.numero) }))
      .sort((a, b) => (b.o.numero === actuel) - (a.o.numero === actuel) || b.d - a.d || rangRarete(b.o.rarete) - rangRarete(a.o.rarete));
    const liste = candidats.length
      ? el("ul", { class: "pf-choix-liste" }, candidats.map(({ o, d }) => {
        const equipe = o.numero === actuel;
        return el("li", {}, el("button", { class: "pf-choix", type: "button", "aria-pressed": String(equipe), style: { "--c": `var(--${o.rarete})` },
          "aria-label": o.nom + (equipe ? ", équipé" : ", puissance " + signe(d)), onclick: () => (equipe ? App.fermerTiroir() : equiper(col, o.numero, o.nom)) },
          el("div", { class: "pf-choix-carte-mini" }, App.carte(o, { niveau: eff(o) })),
          el("div", { class: "pf-choix-info" }, el("b", { texte: o.nom }),
            el("span", { class: "pf-choix-meta" }, el("span", { class: "pilule " + o.rarete, texte: RARETES[o.rarete].nom }), el("span", { class: "num", texte: libNiveau(o) })),
            el("span", { class: "pf-choix-fait", texte: App.faitMarquant(o, eff(o)) })),
          equipe ? el("span", { class: "pf-equipe", texte: "Équipé" })
            : el("span", { class: "pf-delta-choix num " + (d > 0 ? "plus" : d < 0 ? "moins" : "egal"), texte: signe(d) })));
      }))
      : el("div", { class: "vide" }, el("b", { texte: "Aucun objet de ce type dans ton inventaire." }), "Les lootbox en regorgent. ", el("a", { href: "lootbox.html", texte: "Ouvrir une lootbox" }));
    App.tiroir({
      titre: def.nom,
      contenu: el("div", { class: "pf-tiroir" },
        el("p", { class: "mention", texte: "Les chiffres indiquent l'effet sur ta puissance " + (modeEquip === "defense" ? "en défense " : "") + "(" + fmt(base) + ") si tu équipes l'objet." }), liste),
      pied: actuel ? [el("button", { class: "btn-danger", type: "button", onclick: () => equiper(col, null, null) }, "Retirer l'objet (", signe(delta(null)), ")")] : null,
    });
  }

  async function equiper(col, numero, nom) {
    const enDefense = modeEquip === "defense";
    const avant = brute(build());
    try {
      await App.rpc(enDefense ? "equiper_defense" : "equiper", { p_emplacement: col, p_numero: numero });
      if (enDefense) defense = await App.api.loadoutDefense(ctx.joueur.id);
      await Promise.all([App.rafraichirCollection(), App.rafraichirJoueur()]);
      App.fermerTiroir();
      rendreEquipement(); rendre();
      const b = zoneEquip.querySelector(`[data-f="slot-${col}"]`); if (b) b.focus();
      const apres = brute(build());
      App.toast(numero ? nom + (enDefense ? " placé en défense." : " équipé.") : "Emplacement vidé.", { titre: (enDefense ? "Puissance en défense " : "Puissance ") + fmt(apres) + " (" + signe(Math.round(apres - avant)) + ")" });
      App.verifierSucces();
    } catch (e) { App.erreur(e); }
  }

  async function reprendreCombat() {
    try {
      await App.rpc("defense_comme_attaque");
      defense = null;
      rendreEquipement();
      App.toast("Ta défense est de nouveau ton build de combat.", { titre: "Défense remise à zéro" });
    } catch (e) { App.erreur(e); }
  }

  // ---------- En-tête : progression ----------
  const possedes = App.objets.filter((o) => ctx.inventaire.has(o.numero));
  const nbActifs = actifs.filter((o) => ctx.inventaire.has(o.numero)).length;
  const auMax = possedes.filter((o) => ligne(o).niveau >= max(o)).length;
  const copies = possedes.reduce((s, o) => s + ligne(o).niveau + 1, 0);
  const trop = possedes.reduce((s, o) => s + enTrop(o), 0);
  const pct = actifs.length ? Math.round((nbActifs / actifs.length) * 100) : 0;

  // Mobile : une ligne de résumé qui déplie les chiffres (objets.css).
  const stats = el("div", { class: "stats-objets", id: "stats-objets" });
  const resume = el("button", { type: "button", class: "resume-objets", "aria-expanded": "false", "aria-controls": "stats-objets",
    onclick: () => resume.setAttribute("aria-expanded", String(stats.classList.toggle("ouvert"))) },
    el("span", {}, el("b", { class: "num", texte: `${nbActifs} / ${actifs.length}` }), " objets · ", el("b", { class: "num", texte: fmt(auMax) }), " au max",
      trop ? [" · ", el("b", { class: "num", texte: fmt(trop) }), " en trop"] : null), icone("i-fleche"));
  main.append(
    el("header", { class: "entete-page entete-objets" },
      el("div", {},
        el("h1", { texte: "Inventaire" }),
        el("p", {}, `${nbActifs} objets différents sur ${actifs.length}. Chaque doublon ajoute une amélioration (+1) à un objet, jusqu'à son plafond.`, lienAide("doublons", "doublons et améliorations"))),
      el("div", { class: "actions" }, el("a", { class: "btn-second", href: "arsenal.html" }, icone("i-livre"), "Codex"))),
    zoneEquip, resume, stats);
  stats.append(
    el("div", { class: "grille-chiffres" },
      el("div", { class: "chiffre" }, el("b", { class: "num", texte: `${nbActifs} / ${actifs.length}` }), el("span", { texte: "Objets différents" }), el("small", { texte: `${pct} % du jeu` })),
      el("div", { class: "chiffre" }, el("b", { class: "num", texte: fmt(auMax) }), el("span", { texte: "Améliorés au max" })),
      el("div", { class: "chiffre" }, el("b", { class: "num", texte: fmt(copies) }), el("span", { texte: "Exemplaires en tout" })),
      el("a", { class: "chiffre chiffre-lien", href: "boutique.html#vendre" }, el("b", { class: "num", texte: fmt(trop) }), el("span", { texte: "Doublons à revendre" }),
        el("small", { texte: trop ? "Vendre ou troquer" : "Rien en trop pour l'instant" }))),
    el("div", { class: "panneau-b progression", "aria-label": "Progression par rareté" },
      ORDRE_RARETE.map((r) => {
        const tot = actifs.filter((o) => o.rarete === r).length;
        if (!tot) return null;
        const n = actifs.filter((o) => o.rarete === r && ctx.inventaire.has(o.numero)).length;
        return el("div", { class: "prog-rarete", style: { "--c": `var(--${r})` } },
          el("div", { class: "tete" }, el("b", { texte: RARETES[r].nom }), el("span", { class: "num", texte: `${n} / ${tot}` })),
          el("div", { class: "jauge-niv", role: "progressbar", "aria-label": RARETES[r].nom, "aria-valuemin": 0, "aria-valuemax": tot, "aria-valuenow": n },
            el("i", { style: { width: (n / tot) * 100 + "%" } })));
      })));

  // ---------- Barre d'outils ----------
  const TABS = [["tout", "Tout"], ...Object.entries(SLOTS).map(([k, s]) => [k, s.pluriel])];
  const btnSlots = TABS.map(([k, nom]) => el("button", { type: "button", "data-v": k, onclick: () => { f.slot = k; rendre(); } }, nom, el("span", { class: "n num" })));
  const btnRar = ORDRE_RARETE.map((r) => el("button", { type: "button", class: "etiquette", "data-v": r, style: { "--c": `var(--${r})` }, onclick: () => { basculer(f.raretes, r); rendre(); } },
    RARETES[r].nom, el("span", { class: "n" })));
  const btnEff = EFFETS.filter(([id]) => actifs.some((o) => effetsDe.get(o.numero).includes(id)))
    .map(([id, nom]) => el("button", { type: "button", class: "etiquette " + id, "data-v": id, onclick: () => { basculer(f.effets, id); rendre(); } }, nom, el("span", { class: "n" })));
  const recherche = el("input", { type: "search", placeholder: "Chercher un objet", value: f.q, "aria-label": "Chercher un objet par son nom", oninput: (e) => { f.q = e.target.value; rendre(); } });
  const tri = el("select", { "aria-label": "Trier", onchange: (e) => { f.tri = e.target.value; rendre(); } }, TRIS.map(([v, n]) => el("option", { value: v, texte: n, selected: v === f.tri })));
  const inter = el("button", { type: "button", class: "interrupteur", role: "switch", id: "voir-manquants", onclick: () => { f.manquants = !f.manquants; rendre(); } });
  const compte = el("p", { class: "compte-resultats", "aria-live": "polite" });
  const grille = el("div", { class: "grille-cartes" });
  const nEffets = el("span", { class: "n-filtres num" });
  const plusFiltres = el("details", { class: "plus-filtres repliable", open: f.effets.size > 0 },
    el("summary", {}, icone("i-fleche"), "Voir plus de filtres", nEffets),
    el("div", { class: "puces", role: "group", "aria-label": "Effets et set" }, btnEff));
  const nFiltres = el("span", { class: "n-filtres num" });
  const outils = el("div", { class: "outils-objets", id: "outils-collection" });
  const btnFiltres = el("button", { type: "button", class: "btn-second btn-filtres", "aria-expanded": "false", "aria-controls": "outils-collection",
    onclick: () => btnFiltres.setAttribute("aria-expanded", String(outils.classList.toggle("filtres-ouverts"))) }, "Filtres", nFiltres);
  outils.append(
      el("div", { class: "rangee entre repliable" },
        el("div", { class: "onglets-b defile", role: "group", "aria-label": "Emplacement" }, btnSlots),
        el("div", { class: "bascule" }, inter, el("label", { for: "voir-manquants", texte: "Afficher ce qui me manque" }))),
      el("div", { class: "puces repliable", role: "group", "aria-label": "Rareté" }, btnRar),
      plusFiltres,
      el("div", { class: "rangee rangee-recherche" },
        el("label", { class: "champ recherche" }, icone("i-recherche"), recherche),
        btnFiltres,
        el("label", { class: "champ tri" }, el("span", { texte: "Trier par" }), tri),
        compte));
  main.append(el("section", { class: "section-page section-objets" }, outils, grille));

  // ---------- Filtres, tri, rendu ----------
  const base = () => App.objets.filter((o) => ctx.inventaire.has(o.numero) || (f.manquants && o.actif));
  const passe = (o, sauf) =>
    (sauf === "slot" || f.slot === "tout" || o.slot === f.slot)
    && (sauf === "rarete" || !f.raretes.size || f.raretes.has(o.rarete))
    && [...f.effets].every((e) => effetsDe.get(o.numero).includes(e))
    && (!f.q || norm(o.nom).includes(norm(f.q)));
  const cle = {
    rarete: (a, b) => rangRarete(b.rarete) - rangRarete(a.rarete) || niv(b) - niv(a) || a.numero - b.numero,
    niveau: (a, b) => niv(b) - niv(a) || rangRarete(b.rarete) - rangRarete(a.rarete) || a.numero - b.numero,
    numero: (a, b) => a.numero - b.numero,
    recent: (a, b) => String((ligne(b) || {}).obtenu_le || "").localeCompare(String((ligne(a) || {}).obtenu_le || "")) || a.numero - b.numero,
  };
  const niv = (o) => (ligne(o) ? eff(o) : -1);

  function majUrl() {
    const q = new URLSearchParams();
    if (f.slot !== "tout") q.set("slot", f.slot);
    if (f.raretes.size) q.set("rarete", [...f.raretes].join(","));
    if (f.effets.size) q.set("effet", [...f.effets].join(","));
    if (f.q) q.set("q", f.q);
    if (f.tri !== "rarete") q.set("tri", f.tri);
    if (f.manquants) q.set("manquants", "1");
    if (objetOuvert) q.set("objet", objetOuvert);
    const s = q.toString();
    history.replaceState(null, "", location.pathname + (s ? "?" + s : "") + location.hash);
  }

  function reinitialiser() {
    Object.assign(f, { slot: "tout", q: "" });
    f.raretes.clear(); f.effets.clear();
    recherche.value = "";
    rendre();
  }

  function rendre() {
    const b = base();
    // Chaque option affiche ce qu'elle donnerait avec les autres filtres en place ; à 0, elle est masquée (sauf si elle est cochée).
    const option = (x, actif, n) => { x.setAttribute("aria-pressed", String(actif)); x.lastChild.textContent = n; x.hidden = !n && !actif && x.dataset.v !== "tout"; };
    btnSlots.forEach((x) => { const k = x.dataset.v; option(x, f.slot === k, b.filter((o) => (k === "tout" || o.slot === k) && passe(o, "slot")).length); });
    btnRar.forEach((x) => option(x, f.raretes.has(x.dataset.v), b.filter((o) => o.rarete === x.dataset.v && passe(o, "rarete")).length));
    btnEff.forEach((x) => option(x, f.effets.has(x.dataset.v), b.filter((o) => effetsDe.get(o.numero).includes(x.dataset.v) && passe(o)).length));
    plusFiltres.hidden = btnEff.every((x) => x.hidden);
    nEffets.textContent = f.effets.size || "";
    inter.setAttribute("aria-checked", String(f.manquants));
    const nf = (f.slot !== "tout") + f.raretes.size + f.effets.size + f.manquants;
    nFiltres.textContent = nf || "";
    btnFiltres.setAttribute("aria-label", nf ? `Filtres, ${nf} actif${nf > 1 ? "s" : ""}` : "Filtres");
    majUrl();

    const vis = b.filter((o) => passe(o)).sort(cle[f.tri]);
    compte.textContent = vis.length + (vis.length > 1 ? " objets" : " objet");
    if (!ctx.inventaire.size && !f.manquants) {
      grille.replaceChildren(el("div", { class: "vide vide-large" },
        icone("i-coffre", "coffre-vide"),
        el("b", { texte: "Ton inventaire est vide" }),
        "Ouvre ta première lootbox : chaque objet tiré atterrit ici, et chacun de ses doublons l'améliore de +1.",
        el("div", { class: "actions" },
          el("a", { class: "btn-principal", href: "lootbox.html" }, icone("i-coffre-ligne"), "Ouvrir une lootbox"),
          el("button", { type: "button", class: "btn-second", onclick: () => { f.manquants = true; rendre(); } }, "Voir tout ce qui existe"))));
      return;
    }
    if (!vis.length) {
      grille.replaceChildren(el("div", { class: "vide vide-large" }, el("b", { texte: "Aucun objet ne correspond" }), "Essaie une autre rareté, un autre effet ou un autre nom.",
        el("div", { class: "actions" }, el("button", { type: "button", class: "btn-second", onclick: reinitialiser }, "Réinitialiser les filtres"))));
      return;
    }
    const eq = equipes();
    grille.replaceChildren(...vis.map((o) => caseCarte(o, eq)));
  }

  function caseCarte(o, eq) {
    const zone = (carte) => el("button", { type: "button", class: "zone", onclick: () => ouvrir(o) }, carte);
    if (!ligne(o)) return el("div", { class: "case-carte manquant" }, zone(App.carte(o, { verrouille: true })), el("div", { class: "meta-carte" }, el("span", { texte: "Pas encore obtenu" })));
    const n = eff(o), m = max(o), t = enTrop(o);
    return el("div", { class: "case-carte", style: { "--c": `var(--${o.rarete})` } },
      zone(App.carte(o, { niveau: n, equipe: eq.has(o.numero) })),
      el("div", { class: "jauge-niv", "aria-hidden": "true" }, el("i", { style: { width: (n / m) * 100 + "%" } })),
      el("div", { class: "meta-carte" },
        el("span", { class: "num" + (n >= m ? " est-max" : ""), texte: n >= m ? "MAX" : `+${n} / +${m}` }),
        t ? el("span", { class: "trop num", texte: `+${t} en trop` }) : null));
  }

  // ---------- Tiroir : fiche + équiper ----------
  function ouvrir(o) {
    const l = ligne(o);
    objetOuvert = o.numero;
    majUrl();
    const contenu = [App.fiche(o, { niveau: l ? eff(o) : 0, possede: !!l })];
    let pied;
    if (l) {
      const t = enTrop(o);
      contenu.push(el("section", { class: "bloc-fiche" }, el("h4", { texte: "Tes exemplaires" }),
        el("div", { class: "lignes" },
          lig("Exemplaires possédés", fmt(l.niveau + 1)),
          lig("Amélioration", eff(o) >= max(o) ? `MAX (+${max(o)})` : `+${eff(o)} / +${max(o)}`),
          t ? lig("En trop, à revendre", "+" + fmt(t)) : null,
          l.obtenu_le ? lig("Obtenu le", date(l.obtenu_le)) : null)));
      pied = piedEquiper(o);
    } else {
      pied = [
        el("a", { class: "btn-principal", href: "lootbox.html" }, icone("i-coffre-ligne"), "Ouvrir une lootbox"),
        el("a", { class: "btn-second", href: "arsenal.html?objet=" + o.numero }, "Où l'obtenir"),
      ];
    }
    App.tiroir({ titre: o.nom, contenu, pied, surFermeture: () => { objetOuvert = null; majUrl(); } });
  }
  const lig = (n, v) => el("div", { class: "ligne" }, el("span", { texte: n }), el("b", { class: "num", texte: v }));

  function piedEquiper(o) {
    const col = SLOTS[o.slot].col;
    const estEquipe = ctx.loadout[col] === o.numero;
    const ancien = !estEquipe && ctx.loadout[col] != null ? App.objet(ctx.loadout[col]) : null;
    const avant = puissance(ctx.loadout), apres = puissance({ ...ctx.loadout, [col]: estEquipe ? null : o.numero });
    let apercu = null;
    if (avant !== null && apres !== null) {
      const d = apres - avant;
      apercu = el("p", { class: "apercu-puissance" },
        "Puissance ", el("b", { class: "num", texte: fmt(avant) }), " → ", el("b", { class: "num", texte: fmt(apres) }),
        el("span", { class: "num " + (d > 0 ? "hausse" : d < 0 ? "baisse" : ""), texte: ` (${d > 0 ? "+" : d < 0 ? "−" : "±"}${fmt(Math.abs(d))})` }),
        el("small", { texte: estEquipe ? `Libère l'emplacement ${SLOTS[o.slot].nom.toLowerCase()}.` : ancien ? `Remplace ${ancien.nom}.` : `Emplacement ${SLOTS[o.slot].nom.toLowerCase()} vide pour l'instant.` }));
    }
    const btn = el("button", { type: "button", class: estEquipe ? "btn-second" : "btn-principal", onclick: async () => {
      btn.disabled = true;
      try {
        await App.rpc("equiper", { p_emplacement: col, p_numero: estEquipe ? null : o.numero });
        await Promise.all([App.rafraichirCollection(), App.rafraichirJoueur()]);
        App.fermerTiroir();
        App.toast(apres !== null ? `Puissance : ${fmt(apres)}` : o.nom, { titre: estEquipe ? `${o.nom} retiré` : `${o.nom} équipé` });
        rendreEquipement(); rendre();
        App.verifierSucces();
      } catch (e) { App.erreur(e); btn.disabled = false; }
    } }, estEquipe ? "Retirer" : "Équiper");
    return [apercu, btn,
      el("a", { class: "btn-second", href: "profil.html#vitrine" }, "Mettre en vitrine"),
      el("a", { class: "btn-second", href: "boutique.html#vendre" }, "Vendre")];
  }

  rendreEquipement(); rendre();
  const demande = App.objet(p.get("objet"));
  if (demande) ouvrir(demande);
});
})();
