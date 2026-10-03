/* Stream RPG — page Ligue : rang, énergie, liste d'adversaires proposés (du plus fort au moins fort), défense, classement.
   Le classement caché (cote) n'arrive jamais ici : le serveur ne renvoie que le rang visible et les gains possibles. */
"use strict";
(function () {
const { el, icone, fmt, ilYa } = App;

const COLS = [["arme", "Arme"], ["armure", "Armure"], ["offhand", "Main gauche"], ["strategeme", "Stratagème"]];
const pluriel = (n, mot) => fmt(n) + " " + mot + (n > 1 ? "s" : "");
const signe = (n) => (n > 0 ? "+" : n < 0 ? "−" : "") + fmt(Math.abs(n));
const lienAide = (ancre, sujet) => el("a", { class: "lien-aide", href: "aide.html#" + ancre, target: "_blank", rel: "noopener", "aria-label": "Aide : " + sujet + " (nouvel onglet)", title: "Aide : " + sujet, texte: "?" });

const embleme = App.emblemeLigue;

App.demarrer("ligue", async (main, ctx) => {
  const moi = ctx.joueur;
  let etat, joueurs = [], parId = new Map(), parLogin = new Map(), rangs = new Map(), loadouts = new Map(), defenses = new Map(), niveaux = new Map();

  const zone = el("div", {}, el("div", { class: "chargement", texte: "Chargement de la ligue…" }));
  main.append(
    el("header", { class: "entete-page" }, el("div", {},
      el("h1", { texte: "Ligue" }),
      el("p", { texte: "Choisis ton adversaire dans la liste et monte de rang. Le jeu ne te propose que des joueurs à ta portée : pas besoin de chercher une cible." }))),
    ...(App.horsClassement(moi) ? [el("p", { class: "hors-classement" }, el("span", { class: "pilule", texte: "Compte hors classement" }),
      el("span", { texte: "Tu peux jouer en ligue pour tester, mais tes combats ne changent rien pour tes adversaires et tu n'es proposé à personne." }))] : []),
    zone);

  async function charger() {
    const [e, js, rs, los, defs] = await Promise.all([App.api.ligue(), App.api.joueurs(), App.api.rangsLigue(), App.api.loadouts(), App.api.loadoutsDefense()]);
    etat = e; joueurs = js;
    parId = new Map(js.map((j) => [j.id, j])); parLogin = new Map(js.map((j) => [j.twitch_login, j]));
    rangs = new Map(rs.map((r) => [r.player_id, r]));
    loadouts = new Map(los.map((l) => [l.player_id, l])); defenses = new Map(defs.map((l) => [l.player_id, l]));
    const ids = etat.propositions.map((p) => p.login && parLogin.get(p.login)).filter(Boolean).map((j) => j.id);
    const inv = ids.length ? await App.api.inventairesDe(ids) : [];
    niveaux = new Map(inv.map((l) => [l.player_id + ":" + l.item_numero, l.niveau]));
  }
  // Build qu'un joueur aligne en défense : le sien s'il l'a réglé (avec une arme), sinon son build de combat.
  const buildDefense = (id) => { const d = defenses.get(id); return d && d.arme != null ? d : loadouts.get(id) || {}; };
  function cartesBuild(id, lo, niveauDe) {
    return el("div", { class: "lg-build" }, COLS.map(([c, lib]) => {
      const n = lo && lo[c], o = n != null ? App.objet(n) : null;
      return o ? App.carte(o, { niveau: Math.min(niveauDe(n) || 0, App.niveauMax(o.rarete)), equipe: false })
        : el("div", { class: "case-vide" }, el("span", { texte: lib }), el("small", { texte: "Vide" }));
    }));
  }

  // ------------------------------------------------------------------ Mon rang
  function blocRang() {
    const r = App.rangLigue(etat.points), joues = etat.victoires + etat.defaites;
    const pips = el("span", { class: "lg-pips", role: "img", "aria-label": `${etat.energie} énergie sur ${etat.energie_plafond}` },
      Array.from({ length: etat.energie_plafond }, (_, i) => el("i", { class: i < etat.energie ? "plein" : null })));
    return el("section", { class: "section-page lg-rang " + r.cle, "aria-labelledby": "t-rang" },
      el("div", { class: "lg-rang-tete" }, embleme(r, 84),
        el("div", { class: "lg-rang-texte" },
          el("h2", { id: "t-rang", texte: r.nom }),
          r.suivant
            ? el("p", { class: "sous" }, el("b", { class: "num", texte: fmt(r.dansDivision) + " / 100" }), " points vers ", el("b", { texte: r.suivant }), ".",
              r.protege ? " De Fer à Or, tu ne redescends jamais de division." : " À partir de Platine, une défaite peut te faire redescendre de division.", lienAide("ligue", "les rangs de la ligue"))
            : el("p", { class: "sous" }, "Tu es au sommet : ", el("b", { class: "num", texte: fmt(etat.points) + " points" }), ". Le premier des Maîtres est le Champion."),
          r.suivant ? el("div", { class: "lg-barre", role: "progressbar", "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": String(r.progression), "aria-label": "Progression dans la division" },
            el("i", { style: { width: r.progression + "%" } })) : null)),
      el("div", { class: "grille-chiffres" },
        el("div", { class: "chiffre" }, el("b", { class: "num", texte: `${fmt(etat.victoires)} – ${fmt(etat.defaites)}` }), el("span", { texte: "Victoires – défaites en attaque" }),
          el("small", { texte: joues ? fmt((100 * etat.victoires) / joues) + " % de victoires" : "Aucun combat de ligue pour l'instant" })),
        el("div", { class: "chiffre" }, el("b", { class: "num", texte: `${fmt(etat.def_victoires)} – ${fmt(etat.def_defaites)}` }), el("span", { texte: "Défenses tenues – percées" }),
          el("small", { texte: "Ta défense se bat pour toi quand on t'attaque" })),
        el("div", { class: "chiffre" }, el("b", { class: "num", texte: fmt(etat.serie) }), el("span", { texte: "Série de victoires" }),
          el("small", { texte: etat.premiere_victoire_dispo ? "Première victoire du jour : médailles en plus" : "Bonus du jour déjà pris" })),
        el("div", { class: "chiffre lg-energie" }, el("b", { class: "num" }, icone("i-eclair"), `${fmt(etat.energie)} / ${fmt(etat.energie_plafond)}`), el("span", {}, "Énergie de ligue", lienAide("energie", "l'énergie de ligue")),
          pips, etat.energie_prochaine ? el("small", { class: "lg-chrono" }, "Prochaine énergie dans ", el("b", { class: "num", role: "timer", "data-chrono": etat.energie_prochaine })) : el("small", { texte: "Réserve pleine" }))));
  }

  // ------------------------------------------------------------------ Adversaires proposés
  // Une ligne par adversaire, sans étiquette de difficulté : ce que tu gagnes et ce que tu risques suffit à juger.
  function carteAdversaire(p, i) {
    const j = p.type === "joueur" ? parLogin.get(p.login) : null;
    const sansEnergie = etat.energie < 1;
    const bouton = sansEnergie
      ? el("button", { type: "button", class: "btn-principal", "aria-disabled": "true",
        onclick: () => App.toast("Elle se recharge toute seule : " + (etat.energie_prochaine ? "prochaine dans " + App.dureeCourte(new Date(etat.energie_prochaine) - Date.now()) + "." : "reviens dans un moment."), { titre: "Plus d'énergie de ligue" }) }, icone("i-epees"), "Combattre")
      : el("a", { class: "btn-principal", href: "combat.html?mode=ligue&cible=" + i, "aria-label": `Combattre ${j ? j.display_name : "un écho"} (1 énergie de ligue)` }, icone("i-epees"), "Combattre");
    const rang = j ? App.rangLigue(p.points || 0) : null;
    return el("li", { class: "lg-adv" + (j ? "" : " echo") },
      el("div", { class: "lg-adv-ident" },
        j ? App.avatar(j, 48) : el("span", { class: "avatar lg-inconnu", style: { width: "48px", height: "48px" }, "aria-hidden": "true", texte: "?" }),
        el("div", {},
          j ? el("a", { class: "lg-adv-nom", href: "profil.html?joueur=" + encodeURIComponent(j.twitch_login), texte: j.display_name || j.twitch_login }) : el("b", { class: "lg-adv-nom", texte: "Écho mystère" }),
          el("span", { class: "mention" }, rang ? [embleme(rang, 20), " ", rang.nom, " · ", fmt(p.points || 0), " pts"] : "Un adversaire ramené à ton niveau"))),
      j ? cartesBuild(j.id, buildDefense(j.id), (n) => niveaux.get(j.id + ":" + n))
        : el("p", { class: "lg-adv-echo" }, "Le build d'un autre joueur, ramené à ton niveau au moment du combat. Personne n'y perd rien. ", el("a", { class: "lien", href: "aide.html#echo", target: "_blank", rel: "noopener", texte: "Qu'est-ce qu'un écho ?" })),
      el("ul", { class: "faits lg-enjeu" },
        el("li", { class: "gain" }, icone("i-fleche"), el("span", {}, "Victoire : ", el("b", { class: "num", texte: signe(p.gain) + " points" }))),
        el("li", { class: "perte" }, icone("i-fleche"), el("span", {}, "Défaite : ", p.perte < 0 ? el("b", { class: "num", texte: signe(p.perte) + " points" }) : el("b", { texte: "aucune perte" })))),
      bouton);
  }
  function blocAdversaires() {
    const peutChanger = etat.refresh_dispo;
    const changer = el("button", { type: "button", class: "btn-second", "aria-disabled": peutChanger ? null : "true",
      title: etat.abonne ? (peutChanger ? "Une fois par jour" : "Déjà utilisé aujourd'hui : reviens demain") : "Réservé aux abonnés de la chaîne",
      onclick: async (e) => {
        if (!etat.abonne) return App.toast("Changer d'adversaires une fois par jour est réservé aux abonnés Twitch de la chaîne.", { titre: "Réservé aux abonnés", icone: "i-cadenas" });
        if (!peutChanger) return App.toast("Tu as déjà changé d'adversaires aujourd'hui : reviens demain.", { titre: "Limite du jour atteinte" });
        const b = e.currentTarget; b.disabled = true;
        try { etat = await App.rpc("ligue_rafraichir"); await charger(); rendre(); App.toast("De nouveaux adversaires t'attendent.", { titre: "Adversaires changés" }); document.getElementById("adversaires").focus(); }
        catch (err) { App.erreur(err); b.disabled = false; }
      } }, etat.abonne ? null : icone("i-cadenas"), "Changer d'adversaires");
    return el("section", { class: "section-page", id: "adversaires", tabindex: "-1", "aria-labelledby": "t-adv" },
      el("div", { class: "lg-titre-ligne" }, el("div", {}, el("h2", { id: "t-adv", texte: "Adversaires proposés" }),
        el("p", { class: "sous" }, "Du plus fort au moins fort. Tu affrontes le build de défense de l'adversaire. Chaque combat coûte 1 énergie de ligue ; la liste change après chaque combat.")), changer),
      el("ol", { class: "lg-advs" }, etat.propositions.map(carteAdversaire)));
  }

  // ------------------------------------------------------------------ Ma défense
  function blocDefense() {
    const mienne = buildDefense(moi.id), perso = etat.defense_personnalisee;
    const journal = etat.defenses.length
      ? el("ul", { class: "lg-journal" }, etat.defenses.map((d) => {
        const a = parLogin.get(d.attaquant_login) || { display_name: d.attaquant_login, twitch_login: d.attaquant_login };
        const [cls, txt] = d.resultat === "tenue" ? ["tenue", "Défense tenue"] : d.resultat === "percee" ? ["percee", "Défense percée"] : ["egalite", "Égalité"];
        return el("li", { class: cls }, App.avatar(a, 32), el("span", {}, el("b", { texte: a.display_name || a.twitch_login }), " t'a attaqué · ", el("span", { class: "lg-res", texte: txt + (d.points ? " (" + (d.points > 0 ? "+" : "−") + fmt(Math.abs(d.points)) + " pts)" : "") })),
          el("span", { class: "mention", texte: ilYa(d.joue_le) }),
          el("a", { class: "btn-second petit", href: "combat.html?duel=" + encodeURIComponent(d.duel_id), "aria-label": "Revoir ce combat" }, "Revoir"));
      }))
      : el("p", { class: "mention", texte: "Personne ne t'a encore attaqué en ligue." });
    return el("section", { class: "section-page", "aria-labelledby": "t-def" },
      el("div", { class: "lg-titre-ligne" }, el("div", {}, el("h2", { id: "t-def", texte: "Ma défense" }),
        el("p", { class: "sous" }, "Quand un joueur t'attaque en ligue, c'est ce build qui se bat à ta place. Une défense percée te coûte des points de ligue, une défense tenue t'en rapporte, avec une médaille en prime.", lienAide("defense", "la défense de ligue"))),
        el("a", { class: "btn-second", href: "collection.html?build=defense#equipement" }, icone("i-bouclier"), "Régler ma défense")),
      el("p", { class: "mention lg-def-etat" }, perso ? "Tu as réglé une défense à part de ton build de combat." : "Ta défense est ton build de combat : règle-en une à part si tu veux piéger tes attaquants."),
      cartesBuild(moi.id, mienne, (n) => (ctx.inventaire.get(n) || {}).niveau),
      el("h3", { class: "lg-sous-titre", texte: "Dernières attaques reçues" }), journal);
  }

  // ------------------------------------------------------------------ Classement
  function blocClassement() {
    const lignes = [...rangs.values()].filter((r) => r.combats > 0 && parId.has(r.player_id) && !App.horsClassement(parId.get(r.player_id)))
      .sort((a, b) => b.points - a.points || b.victoires - a.victoires).slice(0, 20);
    return el("section", { class: "section-page", "aria-labelledby": "t-clas" },
      el("h2", { id: "t-clas", texte: "Classement de la ligue" }),
      el("p", { class: "sous", texte: "Les 20 meilleurs rangs. Seuls les joueurs qui ont déjà combattu en ligue apparaissent." }),
      lignes.length ? el("ol", { class: "lg-classement" }, lignes.map((r, i) => {
        const j = parId.get(r.player_id), rg = App.rangLigue(r.points);
        return el("li", { class: j.id === moi.id ? "moi" : null }, el("span", { class: "lg-place num", texte: String(i + 1) }), App.avatar(j, 36),
          el("a", { href: "profil.html?joueur=" + encodeURIComponent(j.twitch_login), texte: j.display_name || j.twitch_login }),
          el("span", { class: "lg-clas-rang" }, embleme(rg, 22), rg.nom), el("b", { class: "num", texte: fmt(r.points) + " pts" }),
          el("span", { class: "mention num", texte: `${fmt(r.victoires)} V – ${fmt(r.defaites)} D` }));
      })) : el("p", { class: "mention", texte: "Personne n'a encore combattu en ligue. Sois le premier." }));
  }

  function rendre() {
    zone.replaceChildren(blocRang(), blocAdversaires(), blocDefense(), blocClassement());
    App.majChronos();
  }
  await charger();
  rendre();
  // L'énergie vient de se recharger (compte à rebours échu) : on relit l'état.
  document.addEventListener("rpg:passif", async () => { try { etat = await App.api.ligue(); rendre(); } catch (e) { /* prochaine fois */ } });
});
})();
