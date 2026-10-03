"use strict";
/* =====================================================================
   Stream RPG — recette.html : outils de test de MrShyDiver.
   - Compte : tout débloquer, créditer lootbox / tickets, restaurer (RPC recette_*,
     réservées côté serveur à private.recetteurs).
   - Bac à sable : deux builds libres, combat calculé dans le navigateur avec le
     moteur du serveur (moteur-bac.js), rien n'est enregistré.
   ===================================================================== */
(function () {
const { el, icone, fmt } = App;
const CLE = "rpg-bac";
const COLS = ["arme", "offhand", "armure", "strategeme"];
const SLOT_DE = { arme: "weapon", offhand: "offhand", armure: "torso", strategeme: "strategeme" };
const STACKS = [["atk", "ATK"], ["def", "DEF"], ["pv", "PV"], ["spd", "VIT"], ["luck", "Chance"]];
const lire = () => { try { return JSON.parse(sessionStorage.getItem(CLE) || "null"); } catch (e) { return null; } };
const ecrire = (v) => { try { sessionStorage.setItem(CLE, JSON.stringify(v)); return true; } catch (e) { return false; } };

App.demarrer("recette", async (main, ctx) => {
  document.title = "Recette · Stream RPG";
  // Le serveur refuse tout autre compte ; ici on n'affiche même rien.
  const refus = () => main.replaceChildren(el("div", { class: "vide" }, el("b", { texte: "Page introuvable." }), el("a", { class: "btn-second", href: "lootbox.html", texte: "Retour au jeu" })));
  if (!App.estRecetteur(ctx.joueur)) return refus();
  let etat;
  try { etat = await App.rpc("recette_etat"); } catch (e) { return refus(); }

  const [joueurs, loadouts, inventaires] = await Promise.all([App.api.joueurs(), App.api.loadouts(), App.api.inventaires()]);
  const parLogin = new Map(joueurs.map((j) => [j.twitch_login, j]));
  const loadoutDe = new Map(loadouts.map((l) => [l.player_id, l]));
  const nivDe = new Map(inventaires.map((l) => [l.player_id + ":" + l.item_numero, l.niveau]));

  // ------------------------------------------------------------------ Compte de test
  const chiffres = el("div", { class: "rc-chiffres" });
  const bRestaurer = el("button", { type: "button", class: "btn-second" }, "Restaurer mon compte");
  function majEtat(e) {
    etat = e;
    const c = (v, lib) => el("div", { class: "chiffre" }, el("b", { class: "num", texte: v }), el("span", { texte: lib }));
    chiffres.replaceChildren(c(`${fmt(e.objets)} / ${fmt(e.objets_total)}`, "objets possédés"), c(fmt(e.lootbox), "lootbox"),
      c(fmt(e.lootbox_legendaire), "lootbox légendaires"), c(fmt(e.tickets), "tickets de duel"),
      c(e.sauvegarde ? "Oui" : "Non", "sauvegarde de ton vrai compte"));
    bRestaurer.disabled = !e.sauvegarde;
  }
  async function action(bouton, f, message) {
    bouton.disabled = true;
    try { await f(); majEtat(await App.rpc("recette_etat")); await App.rafraichirJoueur().catch(() => {}); App.toast(message, { type: "succes" }); }
    catch (e) { App.erreur(e); }
    finally { bouton.disabled = false; bRestaurer.disabled = !etat.sauvegarde; }
  }
  const mode = el("select", { "aria-label": "Niveau des objets débloqués" },
    el("option", { value: "max", texte: "au MAX" }), el("option", { value: "base", texte: "à +0" }), el("option", { value: "melange", texte: "au hasard" }));
  const bTout = el("button", { type: "button", class: "btn-principal" }, icone("i-cartes"), "Tout débloquer");
  bTout.onclick = () => action(bTout, () => App.rpc("recette_tout_debloquer", { p_mode: mode.value }), "Les 50 objets sont dans ta collection.");
  const credit = (lib, args, msg) => { const b = el("button", { type: "button", class: "btn-second", texte: lib }); b.onclick = () => action(b, () => App.rpc("recette_crediter", args), msg); return b; };
  // Arène : rejouer un parcours tout de suite (ticket), ou revoir l'écran des coffres sans rejouer (fin de parcours simulée).
  const arene = (lib, args, msg, aller) => {
    const b = el("button", { type: "button", class: "btn-second", texte: lib });
    b.onclick = () => action(b, () => App.rpc("recette_arene", args).then(() => { if (aller) location.href = "arene.html"; }), msg);
    return b;
  };
  let armeRestaurer = false;
  bRestaurer.onclick = () => {
    if (!armeRestaurer) { armeRestaurer = true; bRestaurer.textContent = "Confirmer la restauration"; setTimeout(() => { armeRestaurer = false; bRestaurer.textContent = "Restaurer mon compte"; }, 4000); return; }
    armeRestaurer = false; bRestaurer.textContent = "Restaurer mon compte";
    action(bRestaurer, () => App.rpc("recette_restaurer"), "Ton compte est revenu comme avant les tests.");
  };
  majEtat(etat);

  // ------------------------------------------------------------------ Bac à sable
  const objetsDe = (col) => App.objets.filter((o) => o.actif && o.slot === SLOT_DE[col]).sort((a, b) => App.rangRarete(a.rarete) - App.rangRarete(b.rarete) || a.nom.localeCompare(b.nom));
  const deuxMains = (n) => { const o = n && App.objet(n); return !!o && o.data.hand === "two_handed"; };
  const liste = el("datalist", { id: "rc-joueurs" }, joueurs.filter((j) => j.twitch_login).map((j) => el("option", { value: j.twitch_login })));

  function cote(cle, titre, initial) {
    const s = Object.assign({ source: "moi", login: "", perso: { equip: {}, stacks: { atk: 0, def: 0, pv: 0, spd: 0, luck: 0 } } }, initial || {});
    const corps = el("div", { class: "rc-corps" });
    const onglets = el("div", { class: "onglets-b", role: "group", "aria-label": "Build " + titre },
      [["moi", "Mon build"], ["joueur", "Un joueur"], ["perso", "Sur mesure"]].map(([v, lib]) => el("button", { type: "button", "data-v": v, onclick: () => { s.source = v; rendre(); } }, lib)));
    function rendre() {
      onglets.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === s.source)));
      if (s.source === "moi") corps.replaceChildren(apercu(entree(s, cle)));
      else if (s.source === "joueur") {
        const champ = el("input", { type: "text", list: "rc-joueurs", value: s.login, placeholder: "pseudo Twitch", "aria-label": "Joueur", autocomplete: "off" });
        const zone = el("div");
        const maj = () => { s.login = champ.value.trim().toLowerCase(); zone.replaceChildren(parLogin.has(s.login) ? apercu(entree(s, cle)) : el("p", { class: "mention", texte: "Choisis un joueur dans la liste." })); };
        champ.addEventListener("input", maj); maj();
        corps.replaceChildren(champ, zone);
      } else corps.replaceChildren(editeur(s, cle, () => rendre()));
    }
    rendre();
    return { s, el: el("section", { class: "panneau-b rc-cote" }, el("h3", { texte: titre }), onglets, corps) };
  }
  function editeur(s, cle, rerendre) {
    const p = s.perso;
    const lignes = COLS.map((col) => {
      const x = p.equip[col] || {};
      const bloque = col === "offhand" && deuxMains(p.equip.arme && p.equip.arme.n);
      const sel = el("select", { "aria-label": App.SLOTS[SLOT_DE[col]].nom, disabled: bloque },
        el("option", { value: "", texte: bloque ? "Occupée par l'arme à deux mains" : "— Aucun —" }),
        objetsDe(col).map((o) => el("option", { value: String(o.numero), selected: x.n === o.numero, texte: `${o.nom} (${App.RARETES[o.rarete].nom})` })));
      const o = x.n && App.objet(x.n), max = o ? App.niveauMax(o.rarete) : 0;
      const niv = el("select", { "aria-label": "Amélioration", disabled: !o || bloque },
        Array.from({ length: max + 1 }, (_, i) => el("option", { value: String(i), selected: (x.niv || 0) === i, texte: i >= max && max ? "MAX" : "+" + i })));
      sel.onchange = () => { p.equip[col] = sel.value ? { n: Number(sel.value), niv: 0 } : null; if (col === "arme" && deuxMains(Number(sel.value))) p.equip.offhand = null; rerendre(); };
      niv.onchange = () => { if (p.equip[col]) p.equip[col].niv = Number(niv.value); rerendre(); };
      return el("label", { class: "rc-ligne" }, el("span", { texte: App.SLOTS[SLOT_DE[col]].nom }), sel, niv);
    });
    const stacks = el("div", { class: "rc-stacks" }, STACKS.map(([k, lib]) => {
      const i = el("input", { type: "number", min: "0", max: "500", step: "1", value: String(p.stacks[k] || 0), inputmode: "numeric" });
      i.onchange = () => { p.stacks[k] = Math.max(0, Math.min(500, Math.round(Number(i.value) || 0))); i.value = String(p.stacks[k]); rerendre(); };
      return el("label", {}, el("span", { texte: lib }), i);
    }));
    return el("div", { class: "rc-editeur" }, lignes, el("p", { class: "mention", texte: "Points de stats investis :" }), stacks, apercu(entree(s, cle)));
  }
  // Même forme que l'Edge Function duel (fonction entree de index.ts).
  function entree(s, cle) {
    const eq = (n, niveau) => { const o = n != null && App.objet(n); return o ? { data: o.data, niveau: niveau || 0, numero: o.numero } : null; };
    if (s.source === "perso") {
      const equipement = {};
      for (const c of COLS) { const x = s.perso.equip[c]; equipement[c] = x ? eq(x.n, x.niv) : null; }
      if (deuxMains(s.perso.equip.arme && s.perso.equip.arme.n)) equipement.offhand = null;
      const nom = cle === "g" ? "Build A" : "Build B";
      return { login: "build-" + cle, display_name: nom, avatar_url: null, stacks: { ...s.perso.stacks }, equipement, infos: {} };
    }
    const j = s.source === "moi" ? ctx.joueur : parLogin.get(s.login);
    if (!j) return null;
    const lo = s.source === "moi" ? ctx.loadout : loadoutDe.get(j.id) || {};
    const niv = (n) => (s.source === "moi" ? (ctx.inventaire.get(n) || {}).niveau : nivDe.get(j.id + ":" + n));
    const equipement = {};
    for (const c of COLS) { const n = lo && lo[c]; equipement[c] = n != null && niv(n) != null ? eq(n, niv(n)) : null; }
    return { login: j.twitch_login, display_name: j.display_name || j.twitch_login, avatar_url: j.avatar_url || null,
      stacks: { atk: j.atk_stacks || 0, def: j.def_stacks || 0, pv: j.pv_stacks || 0, spd: j.spd_stacks || 0, luck: j.luck_stacks || 0 }, equipement, infos: {} };
  }
  function apercu(x) {
    if (!x) return el("p", { class: "mention", texte: "Build introuvable." });
    const cartes = COLS.map((c) => { const e = x.equipement[c]; const o = e && App.objet(e.numero);
      return o ? App.carte(o, { niveau: e.niveau, equipe: false }) : el("div", { class: "case-vide" }, el("span", { texte: App.SLOTS[SLOT_DE[c]].nom }), el("small", { texte: "Vide" })); });
    const st = STACKS.map(([k, lib]) => lib + " " + (x.stacks[k] || 0)).join(" · ");
    return el("div", { class: "rc-apercu" }, el("div", { class: "rc-cartes" }, cartes), el("p", { class: "mention", texte: x.display_name + " — " + st }));
  }

  const memo = lire();
  const G = cote("g", "Combattant de gauche", memo && memo.config && memo.config.g);
  const D = cote("d", "Combattant de droite", (memo && memo.config && memo.config.d) || { source: "joueur" });
  const resultat = el("div", { class: "rc-resultat", "aria-live": "polite" });

  function preparer() {
    const a = entree(G.s, "g"), b = entree(D.s, "d");
    if (!a || !b) { App.toast("Choisis deux builds valides.", { type: "erreur" }); return null; }
    if (a.login === b.login) { b.login += "-2"; b.display_name += " (2)"; }
    return [a, b];
  }
  const graine = () => (crypto.getRandomValues(new Uint32Array(1))[0] || 1);
  function lancer() {
    const p = preparer(); if (!p) return;
    const r = MoteurDuel.simulerDuel(p[0], p[1], { seed: graine(), mode: "entrainement" });
    const ok = ecrire({ R: r.replay, joueurs: p.map((x) => ({ twitch_login: x.login, display_name: x.display_name, avatar_url: x.avatar_url })), config: { g: G.s, d: D.s } });
    if (!ok) { App.toast("Le navigateur bloque le stockage de session : impossible d'ouvrir l'arène.", { type: "erreur" }); return; }
    location.href = "combat.html?bac=1";
  }
  function serie(nb) {
    const p = preparer(); if (!p) return;
    let g = 0, d = 0, nul = 0, tours = 0;
    for (let i = 0; i < nb; i++) {
      const r = MoteurDuel.simulerDuel(p[0], p[1], { seed: graine(), mode: "entrainement" });
      if (r.vainqueur === "attaquant") g++; else if (r.vainqueur === "defenseur") d++; else nul++;
      tours += r.stats.rounds;
    }
    const pc = (v) => Math.round((v / nb) * 1000) / 10 + " %";
    resultat.replaceChildren(el("div", { class: "rc-chiffres" },
      el("div", { class: "chiffre" }, el("b", { class: "num", texte: pc(g) }), el("span", { texte: p[0].display_name })),
      el("div", { class: "chiffre" }, el("b", { class: "num", texte: pc(d) }), el("span", { texte: p[1].display_name })),
      el("div", { class: "chiffre" }, el("b", { class: "num", texte: pc(nul) }), el("span", { texte: "égalités" })),
      el("div", { class: "chiffre" }, el("b", { class: "num", texte: (tours / nb).toFixed(1).replace(".", ",") }), el("span", { texte: "tours en moyenne" }))),
      el("p", { class: "mention", texte: `${fmt(nb)} combats simulés avec le moteur ${MoteurDuel.VERSION_MOTEUR}. ${p[0].display_name} attaque en premier, comme l'attaquant d'un duel.` }));
  }
  const bLancer = el("button", { type: "button", class: "btn-principal rc-lancer", onclick: lancer }, icone("i-epees"), "Combattre");
  const bSerie = el("button", { type: "button", class: "btn-second", onclick: () => serie(200) }, "Simuler 200 combats");

  main.replaceChildren(liste,
    el("header", { class: "entete-page" }, el("div", {}, el("h1", { texte: "Recette" }),
      el("p", { texte: "Tes outils de test. Page visible de toi seul ; chaque action est vérifiée par le serveur." }))),
    el("section", { class: "section-page" }, el("h2", { texte: "Mon compte de test" }),
      el("p", { class: "sous", texte: "Avant la première action, ton vrai compte est sauvegardé (objets, équipement, vitrine, lootbox, tickets). « Restaurer » le remet exactement comme avant et retire les succès gagnés pendant les tests." }),
      chiffres,
      el("div", { class: "rc-actions" }, el("div", { class: "rc-groupe" }, bTout, mode),
        credit("+100 lootbox", { p_lootbox: 100, p_lootbox_legendaire: 0, p_tickets: 0 }, "+100 lootbox."),
        credit("+100 légendaires", { p_lootbox: 0, p_lootbox_legendaire: 100, p_tickets: 0 }, "+100 lootbox légendaires."),
        credit("+20 tickets", { p_lootbox: 0, p_lootbox_legendaire: 0, p_tickets: 20 }, "+20 tickets de duel."),
        bRestaurer),
      el("p", { class: "mention", texte: "Pour tes tests de combat, préfère le bac à sable ou l'entraînement : un duel classé contre un vrai joueur compte pour lui." })),
    el("section", { class: "section-page" }, el("h2", { texte: "Arène" }),
      el("p", { class: "sous", texte: "Un ticket d'arène relance un draft complet sans attendre demain. « Coffres » te met directement en fin de parcours, coffres à ouvrir : pratique pour revoir l'animation et les sons. Ça remplace ton parcours en cours, sans toucher à ton record." }),
      el("div", { class: "rc-actions" },
        arene("+1 ticket d'arène", { p_action: "ticket", p_valeur: 1 }, "+1 ticket d'arène : tu peux relancer un draft."),
        [3, 5, 7, 10].map((v) => arene(`Coffres à ${v} victoires`, { p_action: "coffres", p_valeur: v }, `Fin de parcours à ${v} victoires : coffres prêts.`, true)),
        el("a", { class: "btn-second", href: "arene.html" }, icone("i-arene"), "Aller à l'Arène")),
      el("p", { class: "mention", texte: "Ce sont de vrais coffres : les lootbox gagnées s'annulent avec « Restaurer mon compte », les médailles restent." })),
    el("section", { class: "section-page" }, el("h2", { texte: "Bac à sable de combat" }),
      el("p", { class: "sous", texte: "Deux builds au choix, calculés avec le moteur du serveur, regardés dans l'arène. Rien n'est enregistré : pas de ticket, pas de médailles, pas de délai, personne n'est prévenu." }),
      el("div", { class: "rc-duo" }, G.el, D.el),
      el("div", { class: "rc-actions" }, bLancer, bSerie), resultat));

  if (new URLSearchParams(location.search).get("relancer") && memo) { history.replaceState(null, "", "recette.html"); lancer(); }
});
})();
