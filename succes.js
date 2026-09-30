"use strict";
(function () {
  const { el, icone, fmt, date } = App;

  const PALIERS = { bronze: "Bronze", argent: "Argent", or: "Or", legendaire: "Légendaire" };
  const CATEGORIES = [
    ["collection", "Collection", "Les objets que tu possèdes et jusqu'où tu les as montés."],
    ["lootbox", "Lootbox", "Les coffres ouverts sur le site (ceux gagnés en live comptent dès que tu les ouvres ici)."],
    ["duels", "Duels", "Victoires, séries, gros coups : tout ce qui se passe dans l'arène."],
    ["profil", "Profil", "Ton équipement, ta vitrine, la boutique et tes stats."],
  ];
  const EMBLEMES = { collection: "i-cartes", lootbox: "i-coffre-ligne", duels: "i-epees", profil: "i-profil" };
  const RAYONS = Array.from({ length: 24 }, (_, i) => {
    const a = (i * Math.PI) / 12 - Math.PI / 2, r = i % 2 ? 19.5 : 25;
    return (28 + r * Math.cos(a)).toFixed(1) + "," + (44 + r * Math.sin(a)).toFixed(1);
  }).join(" ");

  // Médaille de palier (SVG statique, aucune donnée joueur dedans).
  function medaille(palier, categorie, obtenu) {
    const m = el("span", { class: "medaille " + palier + (obtenu ? "" : " verrou"), "aria-hidden": "true" });
    m.innerHTML = '<svg viewBox="0 0 56 70">'
      + '<path class="ruban-a" d="M12 0h12l7 27-9 5z"/><path class="ruban-b" d="M44 0H32l-7 27 9 5z"/>'
      + (palier === "legendaire" ? '<polygon class="rayons-m" points="' + RAYONS + '"/>' : "")
      + '<circle class="bord" cx="28" cy="44" r="20"/><circle class="disque" cx="28" cy="44" r="17.5"/>'
      + '<circle class="anneau" cx="28" cy="44" r="13.5"/><path class="reflet" d="M16 37.5a13 13 0 0 1 8.5-7.5"/>'
      + '<use class="embleme" href="#' + (EMBLEMES[categorie] || "i-trophee") + '" x="19" y="35" width="18" height="18"/></svg>';
    if (!obtenu) m.append(icone("i-cadenas", "cadenas-m"));
    return m;
  }

  // Même calcul que public.verifier_succes() : [valeur, cible, détail].
  function progressions(ctx, nbVitrine) {
    const j = ctx.joueur;
    const inv = [...ctx.inventaire.values()].map((l) => ({ l, o: App.objet(l.item_numero) })).filter((x) => x.o);
    const actifs = App.objets.filter((o) => o.actif);
    const sekiroTotal = actifs.filter((o) => o.set === "Sekiro").length;
    const sekiro = inv.filter((x) => x.o.set === "Sekiro" && x.o.actif).length;
    const ouvertes = (j.lootbox_ouvertes || 0) + (j.lootbox_leg_ouvertes || 0);
    const lo = ctx.loadout || {};
    const equipes = ["arme", "offhand", "armure", "strategeme"].filter((k) => lo[k] != null).length;
    const stats = ["atk", "def", "pv", "spd", "luck"].reduce((s, k) => s + (j[k + "_stacks"] || 0), 0) + (j.credits_reset || 0);
    const valeureuses = ((j.combat_details || {}).categories || {}).victoireValeureuse || 0;
    // Objet le plus proche de son niveau maximum.
    let meilleur = null;
    for (const x of inv) {
      const max = App.niveauMax(x.o.rarete), niv = Math.min(x.l.niveau, max);
      if (!meilleur || niv / max > meilleur.niv / meilleur.max) meilleur = { niv, max, nom: x.o.nom };
    }
    const a = (cond) => [cond ? 1 : 0, 1];
    return {
      premier_butin: [inv.length, 1],
      collection_10: [inv.length, 10],
      collection_25: [inv.length, 25],
      premiere_epique: a(inv.some((x) => x.o.rarete === "epique")),
      premier_legendaire: a(inv.some((x) => x.o.rarete === "legendaire")),
      niveau_max: meilleur ? [meilleur.niv, meilleur.max, "Le plus avancé : " + meilleur.nom] : [0, 1],
      panoplie_sekiro: [sekiro, sekiroTotal || 1, "Pièces du set Sekiro"],
      arsenal_complet: [inv.length, actifs.length || 1, "Objets du catalogue"],
      lootbox_1: [ouvertes, 1],
      lootbox_50: [ouvertes, 50],
      lootbox_200: [ouvertes, 200],
      lootbox_leg_1: [j.lootbox_leg_ouvertes || 0, 1],
      victoire_1: [j.victoires || 0, 1],
      victoire_25: [j.victoires || 0, 25],
      victoire_100: [j.victoires || 0, 100],
      serie_5: [j.serie_record || 0, 5, "Ton record"],
      serie_10: [j.serie_record || 0, 10, "Ton record"],
      victoire_valeureuse: [valeureuses, 1],
      gros_coup_150: [j.plus_gros_coup || 0, 150, "Ton plus gros coup"],
      degats_10000: [j.degats_infliges || 0, 10000, "Dégâts infligés"],
      loadout_complet: [equipes, 4, "Emplacements équipés"],
      vitrine_pleine: [nbVitrine, 8, "Cartes en vitrine"],
      premier_achat: [j.achats_boutique || 0, 1],
      stats_50: [stats, 50, "Points investis"],
      medailles_1000: [j.medailles || 0, 1000, "Médailles en poche"],
    };
  }

  const pourcent = (n, total) => {
    if (!total) return null;
    const p = (n / total) * 100;
    return p > 0 && p < 1 ? "< 1 %" : fmt(Math.round(p)) + " %";
  };

  function jauge(v, cible, libelle) {
    const r = Math.max(0, Math.min(1, v / cible));
    return el("div", { class: "jauge-niv", role: "progressbar", "aria-label": libelle, "aria-valuemin": 0, "aria-valuemax": cible, "aria-valuenow": Math.min(v, cible) },
      el("i", { style: { width: (r * 100).toFixed(1) + "%" } }));
  }

  App.demarrer("succes", async (main, ctx) => {
    let filtre = "tous";
    const zone = el("div", { "aria-live": "polite", "aria-busy": "true" });
    const boutonsFiltre = [["tous", "Tous"], ["obtenus", "Débloqués"], ["restants", "À débloquer"]].map(([id, t]) =>
      el("button", { type: "button", "aria-pressed": String(id === filtre), onclick: () => { filtre = id; boutonsFiltre.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.f === filtre))); appliquerFiltre(); }, "data-f": id }, t));
    main.append(
      el("header", { class: "entete-page" },
        el("div", {}, el("h1", { texte: "Succès" }),
          el("p", { texte: "Des médailles pour chaque étape de ton aventure : collection, coffres, duels et profil. Elles se débloquent toutes seules quand tu joues." }))),
      zone);

    let etat = null;
    function appliquerFiltre() {
      if (!etat) return;
      let visibles = 0;
      for (const sec of etat.sections) {
        let n = 0;
        for (const t of sec.tuiles) {
          const ok = filtre === "tous" || (filtre === "obtenus") === t.obtenu;
          t.noeud.hidden = !ok; if (ok) n++;
        }
        sec.noeud.hidden = n === 0; visibles += n;
      }
      etat.vide.hidden = visibles > 0;
      etat.vide.replaceChildren(el("b", { texte: filtre === "obtenus" ? "Aucun succès débloqué pour l'instant." : "Tu as tout débloqué. Respect." }),
        filtre === "obtenus" ? el("span", {}, "Ouvre une lootbox ou lance un duel pour décrocher ta première médaille. ", el("a", { href: "lootbox.html", texte: "Aller aux lootbox" })) : "Garde tes médailles bien au chaud : de nouveaux succès arriveront avec les prochaines saisons.");
    }

    async function charger() {
      zone.setAttribute("aria-busy", "true");
      zone.replaceChildren(el("div", { class: "pile-squelettes" }, el("div", { class: "squelette", style: { height: "120px" } }),
        ...Array.from({ length: 6 }, () => el("div", { class: "squelette", style: { height: "96px" } }))));
      try {
        const nouveaux = await App.verifierSucces();
        const [catalogue, miens, tous, vitrine] = await Promise.all([
          App.api.succes(), App.api.succesJoueurs(ctx.joueur.id), App.api.succesJoueurs(), App.api.vitrine(ctx.joueur.id).catch(() => [])]);
        rendre(catalogue, miens, tous, vitrine.length, new Set(nouveaux.map((s) => s.code)));
      } catch (e) {
        App.erreur(e);
        zone.replaceChildren(el("div", { class: "vide" }, el("b", { texte: "Impossible de charger tes succès." }), "Vérifie ta connexion puis réessaie. ",
          el("div", { style: { marginTop: "14px" } }, el("button", { class: "btn-second", type: "button", onclick: charger, texte: "Réessayer" }))));
      } finally { zone.setAttribute("aria-busy", "false"); }
    }

    function rendre(catalogue, miens, tous, nbVitrine, nouveaux) {
      const obtenus = new Map(miens.map((s) => [s.code, s.debloque_le]));
      // Rareté : part des joueurs du site qui ont au moins un succès (seuls ceux-là passent par verifier_succes).
      const joueursActifs = new Set(tous.map((s) => s.player_id)).size;
      const parCode = new Map();
      tous.forEach((s) => parCode.set(s.code, (parCode.get(s.code) || 0) + 1));
      const prog = progressions(ctx, nbVitrine);

      if (!catalogue.length) {
        zone.replaceChildren(el("div", { class: "vide" }, el("b", { texte: "Aucun succès pour l'instant." }), "Ils arrivent bientôt : reviens après le prochain live."));
        return;
      }

      // --- Résumé ---
      const nOk = catalogue.filter((s) => obtenus.has(s.code)).length;
      const parPalier = Object.keys(PALIERS).map((p) => ({ p, total: catalogue.filter((s) => s.palier === p).length, ok: catalogue.filter((s) => s.palier === p && obtenus.has(s.code)).length })).filter((x) => x.total);
      const plusRare = catalogue.filter((s) => obtenus.has(s.code)).sort((a, b) => (parCode.get(a.code) || 0) - (parCode.get(b.code) || 0))[0];
      const proche = catalogue.filter((s) => !obtenus.has(s.code) && !s.cache && prog[s.code] && prog[s.code][1] > 1)
        .map((s) => ({ s, r: prog[s.code][0] / prog[s.code][1] })).filter((x) => x.r < 1).sort((a, b) => b.r - a.r)[0];

      const resume = el("div", { class: "resume-succes" },
        el("div", { class: "chiffre" }, el("span", { texte: "Ta progression" }),
          el("div", { class: "grand num" }, fmt(nOk), el("small", { texte: " / " + fmt(catalogue.length) })),
          jauge(nOk, catalogue.length, "Succès débloqués"),
          el("small", { texte: nOk === catalogue.length ? "Tout est débloqué !" : "succès débloqués" })),
        el("div", { class: "chiffre" }, el("span", { texte: "Par palier" }),
          el("div", { class: "paliers-resume" }, parPalier.map((x) => el("div", {}, medaille(x.p, "", x.ok > 0),
            el("b", { class: "num", texte: x.ok + "/" + x.total }), PALIERS[x.p])))),
        el("div", { class: "chiffre" }, el("span", { texte: "Ton succès le plus rare" }),
          plusRare ? el("div", { class: "mini" }, medaille(plusRare.palier, plusRare.categorie, true),
            el("div", {}, el("div", { class: "titre-mis", texte: plusRare.titre }),
              el("small", { class: "num", texte: joueursActifs ? "Seulement " + pourcent(parCode.get(plusRare.code) || 1, joueursActifs) + " des joueurs l'ont" : "" })))
            : el("small", { texte: "Débloque ton premier succès pour le voir ici." })),
        el("div", { class: "chiffre" }, el("span", { texte: "Le plus proche" }),
          proche ? [el("div", { class: "titre-mis", texte: proche.s.titre }),
            jauge(prog[proche.s.code][0], prog[proche.s.code][1], "Progression vers " + proche.s.titre),
            el("small", { class: "num", texte: fmt(Math.min(prog[proche.s.code][0], prog[proche.s.code][1])) + " / " + fmt(prog[proche.s.code][1]) + " · " + proche.s.description })]
            : el("small", { texte: nOk === catalogue.length ? "Il ne reste rien à débloquer." : "Continue à jouer : les prochains succès se débloquent d'un coup." })));

      const filtres = el("div", { class: "barre-filtres filtres-succes" },
        el("div", { class: "onglets-b", role: "group", "aria-label": "Filtrer les succès" }, boutonsFiltre),
        joueursActifs ? el("span", { class: "mention", texte: "Rareté calculée sur les " + fmt(joueursActifs) + " joueurs du site qui ont au moins un succès." }) : null);

      // --- Catégories ---
      const sections = [];
      const blocs = CATEGORIES.map(([cat, nom, sous]) => {
        const liste = catalogue.filter((s) => s.categorie === cat);
        if (!liste.length) return null;
        const tuiles = liste.map((s) => {
          const quand = obtenus.get(s.code), ok = !!quand, secret = s.cache && !ok;
          const p = prog[s.code], nb = parCode.get(s.code) || 0;
          const rarete = joueursActifs ? el("span", { class: "num", title: fmt(nb) + " joueur" + (nb > 1 ? "s" : "") }, (pourcent(nb, joueursActifs) || "0 %") + " des joueurs") : null;
          let pied;
          if (ok) pied = el("div", { class: "succes-pied" }, el("span", { class: "obtenu-le" }, icone("i-coche"), "Débloqué le ", el("time", { datetime: quand, texte: date(quand) })), rarete);
          else if (!secret && p && p[1] > 1) {
            const v = Math.min(p[0], p[1]);
            pied = el("div", {},
              el("div", { class: "progression" }, jauge(v, p[1], "Progression : " + s.titre),
                el("div", { class: "ligne-prog" }, el("span", { texte: p[2] || "Progression" }), el("span", { class: "num" }, el("b", { texte: fmt(v) }), " / " + fmt(p[1])))),
              el("div", { class: "succes-pied" }, el("span", { texte: "" }), rarete));
          } else pied = el("div", { class: "succes-pied" }, el("span", { texte: secret ? "Encore caché" : "Pas encore débloqué" }), rarete);
          const noeud = el("article", { class: "succes-tuile " + s.palier + (ok ? " obtenu" : "") + (secret ? " secret" : "") + (nouveaux.has(s.code) ? " nouveau" : "") },
            medaille(s.palier, s.categorie, ok),
            el("div", { class: "succes-corps" },
              el("div", { class: "succes-titre" }, el("h3", { texte: secret ? "Succès secret" : s.titre }),
                el("span", { class: "pilule", texte: PALIERS[s.palier] || s.palier }),
                nouveaux.has(s.code) ? el("span", { class: "pilule", style: { "--c": "var(--normal)" }, texte: "Nouveau" }) : null),
              el("p", { texte: secret ? "Continue à jouer pour le révéler." : s.description }),
              pied));
          return { noeud, obtenu: ok };
        });
        const n = tuiles.filter((t) => t.obtenu).length;
        const noeud = el("section", { class: "section-page categorie-succes", "aria-labelledby": "cat-" + cat },
          el("h2", { id: "cat-" + cat }, nom, el("span", { class: "compte num", texte: n + " / " + liste.length })),
          el("p", { class: "sous", texte: sous }),
          el("div", { class: "grille-succes" }, tuiles.map((t) => t.noeud)));
        sections.push({ noeud, tuiles });
        return noeud;
      });
      const vide = el("div", { class: "vide", hidden: true, style: { marginTop: "28px" } });
      zone.replaceChildren(resume, filtres, ...blocs.filter(Boolean), vide);
      etat = { sections, vide };
      appliquerFiltre();
    }

    await charger();
  });
})();
