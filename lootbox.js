"use strict";
// Lootbox : la page d'arrivée. Le joueur choisit combien de lootbox ouvrir, clique sur le coffre,
// puis retourne lui-même chaque carte : au survol, une aura et un son discret laissent deviner la
// rareté. « Tout révéler » les retourne une par une, dans un ordre aléatoire.
// Le tirage est fait par ouvrir_lootbox au clic sur le coffre : l'animation ne fait que le révéler.
(function () {
const { $, $$, el, icone, fmt, nombre, RARETES, ORDRE_RARETE, SLOTS, rangRarete, couleur } = App;

const INDICE_MS = 420; // l'aura se montre ce temps-là avant un retournement sans survol (toucher, clavier, Tout révéler)
const ECART = [260, 300, 480, 700, 950]; // « Tout révéler » : pause après chaque carte, par rareté (ms)
const VIBRATIONS = [null, null, [25], [40, 40, 90], [70, 50, 70, 50, 260]]; // mobile, par rareté (ms)
const MAX_PAR_OUVERTURE = 10; // limite de ouvrir_lootbox
const CLE_HISTO = "lootbox-session";
const CLE_PREMIERS_PAS = "premiers-pas-masques";

const COFFRE = `<div class="coffre" aria-hidden="true">
  <span class="rayons"></span><span class="halo"></span><span class="faisceau"></span><span class="onde"></span>
  <svg viewBox="0 0 32 26" shape-rendering="crispEdges">
    <g>
      <rect class="cf-o" x="3" y="10" width="26" height="15"/><rect class="cf-b" x="4" y="11" width="24" height="13"/>
      <rect class="cf-bc" x="4" y="11" width="24" height="1"/><rect class="cf-bs" x="4" y="15" width="24" height="1"/>
      <rect class="cf-bs" x="4" y="19" width="24" height="1"/><rect class="cf-bs" x="4" y="23" width="24" height="1"/>
      <rect class="cf-m" x="7" y="11" width="3" height="13"/><rect class="cf-ms" x="9" y="11" width="1" height="13"/>
      <rect class="cf-m" x="22" y="11" width="3" height="13"/><rect class="cf-ms" x="24" y="11" width="1" height="13"/>
      <rect class="cf-o" x="13" y="11" width="6" height="6"/><rect class="cf-s" x="14" y="12" width="4" height="4"/>
      <rect class="cf-o" x="15.5" y="13" width="1" height="2"/>
    </g>
    <rect class="interieur" x="4" y="9" width="24" height="2.5"/>
    <g class="couvercle">
      <rect class="cf-o" x="4" y="2" width="24" height="1"/><rect class="cf-o" x="3" y="3" width="26" height="8"/>
      <rect class="cf-b" x="4" y="3" width="24" height="7"/><rect class="cf-bc" x="4" y="3" width="24" height="2"/>
      <rect class="cf-bs" x="4" y="8" width="24" height="1"/><rect class="cf-m" x="7" y="3" width="3" height="7"/>
      <rect class="cf-ms" x="9" y="3" width="1" height="7"/><rect class="cf-m" x="22" y="3" width="3" height="7"/>
      <rect class="cf-ms" x="24" y="3" width="1" height="7"/><rect class="cf-ms" x="3" y="10" width="26" height="1"/>
      <rect class="cf-o" x="13" y="8" width="6" height="3"/><rect class="cf-s" x="14" y="9" width="4" height="1"/>
    </g>
    <rect class="fente" x="3.5" y="10.6" width="25" height=".8"/>
  </svg>
</div>`;
const SVG_SON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path class="onde-son" d="M15.5 9a4 4 0 0 1 0 6M18.2 6.5a7.5 7.5 0 0 1 0 11"/></svg>';

const pluriel = (n, mot, motP) => fmt(n) + " " + (n > 1 ? (motP || mot + "s") : mot);
function lireHisto() { try { return JSON.parse(sessionStorage.getItem(CLE_HISTO)) || []; } catch (e) { return []; } }
function premiersPasMasques() { try { return localStorage.getItem(CLE_PREMIERS_PAS) === "1"; } catch (e) { return false; } }
function masquerPremiersPas() { try { localStorage.setItem(CLE_PREMIERS_PAS, "1"); } catch (e) { /* navigation privée */ } }
const lienAide = (ancre, sujet) => el("a", { class: "lien-aide", href: "aide.html#" + ancre, "aria-label": "Aide : " + sujet, title: "Aide : " + sujet, texte: "?" });
function ecrireHisto(h) { try { sessionStorage.setItem(CLE_HISTO, JSON.stringify(h)); } catch (e) { /* navigation privée */ } }

App.demarrer("lootbox", async (main, ctx) => {
  const stock = (t) => Number((t === "legendaire" ? ctx.joueur.lootbox_legendaire : ctx.joueur.lootbox) || 0);
  const demande = new URLSearchParams(location.search).get("type");
  let type = demande === "legendaire" || (demande !== "standard" && stock("standard") === 0 && stock("legendaire") > 0) ? "legendaire" : "standard";
  let enCours = false, pret = false, choix = 1, etatCourant = null, dernier = null, taux = null;
  const tactile = matchMedia("(hover: none)").matches;
  let histo = lireHisto();

  // ---------- Construction ----------
  const entete = el("header", { class: "entete-page lb-entete" },
    el("div", {}, el("h1", { texte: "Lootbox" }),
      el("p", { texte: "Une lootbox, un objet. Choisis combien en ouvrir, clique sur le coffre, puis retourne tes cartes : leur aura trahit leur rareté." })));

  const typesBtns = ["standard", "legendaire"].map((t) => {
    const b = el("button", { type: "button", class: "type-lootbox" + (t === "legendaire" ? " version-legendaire" : ""), "data-type": t, onclick: () => choisirType(t) });
    b.innerHTML = '<svg viewBox="0 0 32 26" aria-hidden="true"><use href="#i-coffre"/></svg>';
    b.append(
      el("span", { class: "lb-type-texte" },
        el("span", { class: "titre-type", texte: t === "legendaire" ? "Lootbox légendaire" : "Lootbox" }),
        el("span", { class: "texte-type", texte: t === "legendaire" ? "Jamais de Commun. Gagnée contre le boss de la communauté." : "Gagnée en live avec tes points de chaîne." })),
      el("span", { class: "lb-compte" }, el("b", { class: "num" }), el("small", { texte: "à ouvrir" })));
    return b;
  });
  const types = el("div", { class: "types-lootbox lb-types", role: "group", "aria-label": "Choisis ta lootbox" }, typesBtns);

  const table = el("div", { class: "table-jeu lb-table" });
  table.innerHTML = COFFRE;
  const coffre = $(".coffre", table);
  // Le coffre se clique : le bouton couvre la table tant qu'aucune carte n'y est posée.
  const btnCoffre = el("button", { type: "button", class: "lb-ouvrir-coffre", onclick: () => ouvrir(choix) });
  const consigne = el("p", { class: "lb-consigne", "aria-live": "polite" });
  const btnPasser = el("button", { type: "button", class: "btn-passer", hidden: true, texte: "Tout révéler", onclick: toutReveler });
  table.append(btnCoffre, consigne, btnPasser);

  // Choix du nombre : les boutons préparent l'ouverture, c'est le clic sur le coffre qui la lance.
  const boutons = [1, 5, 10].map((n) => el("button", { type: "button", class: "btn-ouvrir", "aria-describedby": "lb-aide", onclick: () => preparer(n) }, "×" + n));
  const compteTout = el("span", { class: "num" });
  const btnTout = el("button", { type: "button", class: "btn-ouvrir lb-tout", "aria-describedby": "lb-aide", onclick: () => preparer(Math.min(stock(type), MAX_PAR_OUVERTURE)) },
    "Tout (", compteTout, ")");
  const aide = el("p", { class: "lb-aide", id: "lb-aide" });
  const btnSon = el("button", { type: "button", class: "btn-son", onclick: basculerSon });
  btnSon.innerHTML = SVG_SON;
  const libSon = el("span", { class: "lb-son-libelle" });
  btnSon.append(libSon);
  const actions = el("div", { class: "lb-actions" },
    el("div", { class: "boutons-ouvrir", role: "group", "aria-label": "Nombre de lootbox à ouvrir" }, el("span", { class: "lb-combien", texte: "À ouvrir" }), boutons, btnTout),
    el("div", { class: "lb-sous-actions" }, aide, btnSon));

  const scene = el("div", { class: "lb-scene" }, types, table, actions);
  const bilan = el("p", { class: "lb-bilan", "aria-live": "polite" });
  const suite = el("div", { class: "lb-suite", hidden: true });
  const premiersPas = el("section", { class: "panneau-b lb-premiers-pas", "aria-labelledby": "t-premiers-pas", hidden: true });
  let aDejaCombattu = null; // null = pas encore vérifié dans l'historique des duels

  const vide = el("div", { class: "vide lb-vide", hidden: true },
    el("b", { texte: "Plus aucune lootbox à ouvrir" }),
    el("p", { texte: "Les lootbox se gagnent en live sur la chaîne de MrShyDiver, avec tes points de chaîne. Tu peux aussi en acheter en Médailles à la boutique, et les lootbox légendaires tombent quand la communauté abat le boss." }),
    el("div", { class: "lb-vide-actions" },
      el("a", { class: "btn-twitch", href: App.TWITCH_CHAINE, target: "_blank", rel: "noopener" }, icone("i-twitch"), "Aller sur le live"),
      el("a", { class: "btn-second", href: "boutique.html" }, icone("i-boutique"), "Boutique")));

  const rangHisto = el("div", { class: "lb-histo-rang" });
  const sectionHisto = el("section", { class: "section-page lb-histo", hidden: true },
    el("h2", { texte: "Cette session" }), el("p", { class: "sous", texte: "Tes derniers tirages, du plus récent au plus ancien. Touche une carte pour voir sa fiche." }), rangHisto);

  const zoneTaux = el("div", {}, el("p", { class: "mention", texte: "Chargement des taux…" }));
  const titreTaux = el("h2");
  const blocTaux = el("section", { class: "panneau-b lb-bloc" }, titreTaux, zoneTaux);
  const zoneChiffres = el("div", { class: "lb-chiffres" });
  const zoneCollection = el("div", {});
  const blocCollection = el("section", { class: "panneau-b lb-bloc" },
    el("div", { class: "lb-bloc-tete" }, el("h2", { texte: "Ta collection" }), el("a", { href: "collection.html", class: "lb-lien" }, "Tout voir", icone("i-fleche"))), zoneCollection);
  const cote = el("aside", { class: "lb-cote", "aria-label": "Taux et progression" }, blocTaux, zoneChiffres, blocCollection);

  main.append(entete, el("div", { class: "lb-grille" }, el("div", { class: "lb-principal" }, premiersPas, vide, scene, bilan, suite, sectionHisto), cote));

  // ---------- États ----------
  function majTypes() {
    typesBtns.forEach((b) => {
      const t = b.dataset.type, n = stock(t);
      b.setAttribute("aria-pressed", String(t === type));
      $(".lb-compte b", b).textContent = fmt(n);
      b.toggleAttribute("data-vide", n === 0);
    });
    table.classList.toggle("leg", type === "legendaire");
    coffre.classList.toggle("version-legendaire", type === "legendaire");
  }
  function majBoutons() {
    const n = stock(type), autre = stock(type === "legendaire" ? "standard" : "legendaire");
    const nom = type === "legendaire" ? "lootbox légendaire" : "lootbox";
    choix = Math.max(1, Math.min(choix, n, MAX_PAR_OUVERTURE));
    const choisir = (b, oui) => { b.setAttribute("aria-pressed", String(oui)); b.classList.toggle("second", !oui); };
    boutons.forEach((b, i) => {
      const k = [1, 5, 10][i], manque = n < k;
      b.disabled = enCours || manque;
      b.toggleAttribute("data-manque", manque);
      b.title = manque ? "Il te faut au moins " + pluriel(k, nom, nom === "lootbox" ? "lootbox" : "lootbox légendaires") : "";
      b.setAttribute("aria-label", pluriel(k, "lootbox", "lootbox") + " à ouvrir");
      choisir(b, k === choix && !manque);
    });
    const tout = n >= 2 && n <= MAX_PAR_OUVERTURE && n !== 5 && n !== 10;
    btnTout.hidden = !tout;
    btnTout.disabled = enCours;
    btnTout.setAttribute("aria-label", "Tes " + n + " " + nom + (n > 1 && type === "legendaire" ? "s" : "") + " à ouvrir");
    choisir(btnTout, tout && choix === n);
    compteTout.textContent = fmt(n);
    btnCoffre.hidden = !pret || n < 1;
    btnCoffre.setAttribute("aria-label", "Ouvrir " + pluriel(choix, nom, nom === "lootbox" ? "lootbox" : "lootbox légendaires"));
    if (pret) consigne.textContent = n < 1 ? "" : (tactile ? "Touche" : "Clique sur") + " le coffre pour ouvrir " + pluriel(choix, "lootbox", "lootbox");
    let texte;
    if (n === 0 && autre === 0) texte = "Tu n'as plus de lootbox : gagne-les en live.";
    else if (n === 0) texte = type === "legendaire" ? `Aucune lootbox légendaire, mais ${pluriel(autre, "lootbox standard", "lootbox standard")} t'attend${autre > 1 ? "ent" : ""}.` : `Aucune lootbox standard, mais ${pluriel(autre, "lootbox légendaire", "lootbox légendaires")} t'attend${autre > 1 ? "ent" : ""}.`;
    else if (n > MAX_PAR_OUVERTURE) texte = `Il t'en reste ${fmt(n)} · 10 au maximum par ouverture.`;
    else if (n < 5) texte = `Il t'en reste ${fmt(n)}.`;
    else texte = `Il t'en reste ${fmt(n)}.`;
    aide.replaceChildren(texte);
    if (n === 0 && autre > 0) aide.append(" ", el("button", { type: "button", class: "lb-lien", texte: type === "legendaire" ? "Passer aux standard" : "Passer aux légendaires", onclick: () => choisirType(type === "legendaire" ? "standard" : "legendaire") }));
    const rien = stock("standard") + stock("legendaire") === 0;
    vide.hidden = !rien;
    actions.classList.toggle("inactif", rien);
  }
  function majSon() {
    btnSon.setAttribute("aria-pressed", String(App.sons.actif));
    libSon.textContent = App.sons.actif ? "Son activé" : "Son coupé";
  }
  async function basculerSon() {
    const v = !App.sons.actif;
    App.sons.actif = v;
    majSon();
    if (v) App.sons.demarrer();
    try { const p = await App.rpc("enregistrer_preferences", { p: { sons: v } }); if (p) ctx.prefs = p; } catch (e) { App.erreur(e); }
  }

  // Poids d'une rareté dans la lootbox choisie (0 si aucun objet actif de cette rareté).
  function poids(r) {
    if (!taux) return type === "legendaire" && r === "commun" ? 0 : 1;
    const l = taux.find((x) => x.rarete === r), p = l ? Number(type === "legendaire" ? l.poids_legendaire : l.poids) || 0 : 0;
    return App.objets.some((o) => o.actif && o.rarete === r) ? p : 0;
  }
  function rendreTaux() {
    titreTaux.textContent = type === "legendaire" ? "Taux · lootbox légendaire" : "Taux · lootbox";
    if (!taux) { zoneTaux.replaceChildren(el("p", { class: "mention", texte: taux === false ? "Les taux n'ont pas pu être chargés." : "Chargement des taux…" })); return; }
    const actifs = App.objets.filter((o) => o.actif);
    const total = ORDRE_RARETE.reduce((s, r) => s + poids(r), 0) || 1;
    const pc = (r) => poids(r) / total * 100;
    const barre = el("div", { class: "lb-barre", role: "img", "aria-label": ORDRE_RARETE.filter((r) => poids(r)).map((r) => RARETES[r].nom + " " + nombre(Math.round(pc(r) * 10) / 10) + " %").join(", ") },
      ORDRE_RARETE.filter((r) => poids(r)).map((r) => el("i", { style: { width: pc(r) + "%", "--c": "var(--" + r + ")" } })));
    const liste = el("ul", { class: "lb-taux" }, ORDRE_RARETE.map((r) => {
      const n = actifs.filter((o) => o.rarete === r).length, p = poids(r);
      return el("li", { class: p ? null : "absent", style: { "--c": "var(--" + r + ")" } },
        el("span", { class: "lb-carre" }),
        el("span", {}, RARETES[r].nom, el("small", { texte: pluriel(n, "objet") })),
        el("b", { class: "num", texte: p ? nombre(Math.round(pc(r) * 10) / 10) + " %" : "—" }));
    }));
    const notes = el("ul", { class: "lb-notes" },
      !poids("commun") ? el("li", { texte: "Jamais de Commun dans cette lootbox." }) : null,
      !poids("legendaire") ? el("li", { texte: "Pas de Légendaire dans cette lootbox : ça, c'est le boss." }) : null,
      actifs.some((o) => o.set === "Sekiro") ? el("li", { texte: "Set Sekiro : chances triplées dans sa rareté." }) : null,
      el("li", { texte: "Un doublon ajoute une amélioration (+1) à l'objet, jusqu'à son plafond." }));
    zoneTaux.replaceChildren(barre, liste, notes);
  }

  function rendreProgression() {
    const j = ctx.joueur;
    let enTrop = 0;
    ctx.inventaire.forEach((l, n) => { const o = App.objet(n); if (o) enTrop += Math.max(0, l.niveau - App.niveauMax(o.rarete)); });
    const chiffre = (val, lib, extra) => el("div", { class: "chiffre" }, el("b", { class: "num", texte: fmt(val) }), el("span", {}, lib), extra || null);
    zoneChiffres.replaceChildren(
      chiffre(j.lootbox_ouvertes || 0, "Lootbox ouvertes"),
      chiffre(j.lootbox_leg_ouvertes || 0, "Légendaires ouvertes"),
      chiffre(enTrop, [enTrop > 1 ? "Doublons en trop" : "Doublon en trop", lienAide("doublons", "les doublons en trop")], enTrop ? el("small", {}, el("a", { href: "boutique.html", texte: "À revendre à la boutique" })) : el("small", { texte: "Rien à revendre" })));

    const actifs = App.objets.filter((o) => o.actif);
    const a = actifs.filter((o) => ctx.inventaire.has(o.numero)).length;
    const lignes = ORDRE_RARETE.map((r) => {
      const tous = actifs.filter((o) => o.rarete === r);
      if (!tous.length) return null;
      const p = tous.filter((o) => ctx.inventaire.has(o.numero)).length;
      return el("li", { style: { "--c": "var(--" + r + ")" } }, el("span", { texte: RARETES[r].nom }),
        el("span", { class: "jauge-niv" }, el("i", { style: { width: (p / tous.length * 100) + "%" } })),
        el("b", { class: "num", texte: p + " / " + tous.length }));
    });
    zoneCollection.replaceChildren(
      el("p", { class: "lb-total" }, el("b", { class: "num", texte: fmt(a) }), el("span", { texte: " / " + fmt(actifs.length) + " objets découverts" })),
      el("ul", { class: "lb-raretes" }, lignes));
  }

  function rendreHisto() {
    sectionHisto.hidden = !histo.length;
    rangHisto.replaceChildren(...histo.map((t) => {
      const o = App.objet(t.numero);
      if (!o) return null;
      const max = App.niveauMax(o.rarete);
      return el("button", { type: "button", class: "zone", "aria-label": o.nom + ", " + RARETES[o.rarete].nom + (t.nouveau ? ", nouveau" : ""), onclick: () => ficheObjet(t.numero) },
        App.carte(o, { niveau: Math.min(t.niveau, max) }), t.nouveau ? el("span", { class: "lb-mini-nouveau", texte: "Nouveau" }) : null);
    }).filter(Boolean));
  }

  function majTout() { majTypes(); majBoutons(); rendreTaux(); rendreProgression(); rendreHisto(); rendrePremiersPas(); }

  // ---------- Premiers pas : 3 étapes tirées des vraies données, masquables ----------
  function rendrePremiersPas() {
    const j = ctx.joueur;
    const joues = (j.victoires || 0) + (j.defaites || 0) + (j.egalites || 0) > 0 || aDejaCombattu === true;
    const etapes = [
      { fait: (j.lootbox_ouvertes || 0) + (j.lootbox_leg_ouvertes || 0) > 0, titre: "Ouvre une lootbox", texte: "Chaque lootbox te donne un objet.",
        action: stock("standard") + stock("legendaire") > 0
          ? el("button", { type: "button", class: "btn-second", onclick: () => { if (!btnCoffre.hidden) { table.scrollIntoView({ block: "center", behavior: App.reduit ? "auto" : "smooth" }); btnCoffre.focus({ preventScroll: true }); } } }, "Ouvrir")
          : el("a", { class: "btn-second", href: "aide.html#live" }, "En gagner") },
      { fait: ctx.loadout.arme != null, titre: "Équipe une arme", texte: "Sans arme, tu te bats à mains nues.",
        action: el("a", { class: "btn-second", href: "collection.html?slot=weapon" }, "Choisir") },
      { fait: joues, titre: "Joue un duel", texte: "Défie un joueur, même hors ligne.",
        action: el("a", { class: "btn-second", href: "duels.html" }, "Défier") },
    ];
    const reste = etapes.filter((e) => !e.fait).length;
    premiersPas.hidden = !reste || premiersPasMasques();
    if (premiersPas.hidden) return;
    premiersPas.replaceChildren(
      el("div", { class: "lb-pp-tete" },
        el("h2", { id: "t-premiers-pas", texte: "Tes premiers pas" }),
        el("span", { class: "mention num", texte: `${3 - reste} / 3` }),
        el("button", { type: "button", class: "bouton-icone", "aria-label": "Masquer tes premiers pas", onclick: () => { masquerPremiersPas(); premiersPas.hidden = true; } }, icone("i-fermer"))),
      el("ol", { class: "lb-pp-etapes" }, etapes.map((e, i) => el("li", { class: e.fait ? "fait" : null },
        el("span", { class: "lb-pp-puce", "aria-hidden": "true" }, e.fait ? icone("i-coche") : String(i + 1)),
        el("span", { class: "lb-pp-texte" }, el("b", { texte: e.titre }), el("span", { class: "sr", texte: e.fait ? " (fait)" : " (à faire)" }), el("small", { texte: e.fait ? "C'est fait." : e.texte })),
        e.fait ? null : e.action))),
      el("a", { class: "lb-lien", href: "aide.html" }, "Comment jouer", icone("i-fleche")));
    if (!joues && aDejaCombattu === null && !premiersPasMasques()) {
      aDejaCombattu = false;
      App.api.duels().then((l) => {
        const moi = j.twitch_login;
        if (l.some((d) => d.attaquant_login === moi || d.defenseur_login === moi)) { aDejaCombattu = true; rendrePremiersPas(); }
      }).catch((e) => console.warn(e));
    }
  }

  // Après une ouverture : l'étape suivante la plus utile.
  function rendreSuite(tirages) {
    const o = tirages.map((t) => App.objet(t.numero)).find((x) => x && (x.slot === "weapon" || x.slot === "torso") && ctx.loadout[SLOTS[x.slot].col] == null);
    suite.replaceChildren(...[el("span", { class: "lb-suite-lib", texte: "Prochaine étape" }),
      o ? el("a", { class: "btn-principal", href: "collection.html?objet=" + o.numero }, icone("i-bouclier"), "Équipe ton nouvel objet")
        : el("a", { class: "btn-principal", href: "duels.html" }, icone("i-epees"), "Défie un joueur"),
      o ? el("span", { class: "mention", texte: o.nom + " : ton emplacement " + SLOTS[o.slot].nom.toLowerCase() + " est vide." }) : null].filter(Boolean));
    suite.hidden = false;
  }

  function ficheObjet(numero) {
    const o = App.objet(numero);
    if (!o) return;
    const l = ctx.inventaire.get(o.numero), max = App.niveauMax(o.rarete);
    const niv = l ? l.niveau : 0, trop = Math.max(0, niv - max);
    App.tiroir({ titre: o.nom, contenu: App.fiche(o, { niveau: Math.min(niv, max), possede: !!l }),
      pied: [trop ? el("a", { class: "btn-principal", href: "boutique.html", texte: "Revendre " + pluriel(trop, "doublon") + " en trop" }) : null,
        el("a", { class: "btn-second", href: "collection.html", texte: "Voir ma collection" })] });
  }

  function preparer(n) {
    if (enCours) return;
    choix = n;
    remettreCoffre();
    bilan.replaceChildren();
    suite.hidden = true;
    majBoutons();
    if (!btnCoffre.hidden) btnCoffre.focus({ preventScroll: true });
  }
  function choisirType(t) {
    if (enCours || t === type) return;
    type = t;
    try { history.replaceState(null, "", t === "legendaire" ? "?type=legendaire" : location.pathname); } catch (e) { /* ignore */ }
    remettreCoffre();
    bilan.replaceChildren();
    suite.hidden = true;
    majTout();
  }

  // ---------- Mécanique du coffre ----------
  const pause = (ms) => new Promise((fin) => setTimeout(fin, App.reduit ? Math.min(ms, 60) : ms));
  const melanger = (l) => l.map((x) => [Math.random(), x]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
  function disposition(n) {
    const w = table.clientWidth, etroit = w < 560;
    const cols = n === 1 ? 1 : etroit ? (n <= 3 ? n : n <= 6 ? 3 : 4) : Math.min(n, 5);
    const rangs = Math.ceil(n / cols);
    const dw = n === 1 ? Math.min(190, w * 0.46) : etroit ? Math.min(104, (w - 24 - (cols - 1) * 10) / cols) : Math.min(148, (w - 90) / 5);
    const dh = dw * 1.4, gx = etroit ? 10 : Math.min(20, (w - dw * cols) / (cols + 1)), gy = etroit ? 64 : 70;
    const hauteur = Math.max(etroit ? 340 : 420, Math.round(rangs * (dh + gy) + 40));
    const positions = [];
    for (let i = 0; i < n; i++) {
      const rg = Math.floor(i / cols), dansRang = Math.min(cols, n - rg * cols), k = i - rg * cols - (dansRang - 1) / 2;
      const eventail = rangs === 1 && n > 1;
      positions.push({ x: w / 2 - dw / 2 + k * (dw + gx), y: 24 + rg * (dh + gy) + (eventail ? Math.abs(k) * 8 : 0), r: eventail ? k * 3 : 0 });
    }
    // Centre verticalement le bloc de cartes (badges compris).
    const decalage = Math.max(0, (hauteur - 48 - (rangs * (dh + gy) - gy + 40)) / 2);
    positions.forEach((p) => (p.y += decalage));
    return { dw, hauteur: hauteur + 44, positions }; // 44 px en bas pour la consigne et « Tout révéler »
  }
  const placer = (d, p, rot, echelle = 1) => { d.style.transform = "translate(" + p.x + "px," + p.y + "px) rotate(" + rot + "deg) scale(" + echelle + ")"; };
  function boucheCoffre(dw) {
    const t = table.getBoundingClientRect(), s = coffre.querySelector("svg").getBoundingClientRect();
    return { x: s.left - t.left + s.width / 2 - dw / 2, y: s.top - t.top + s.height * 0.3 - dw * 0.7 };
  }
  function resultat(t, max) {
    if (t.nouveau) return { cls: "nouveau", titre: "Nouveau !", texte: "nouveau dans ta collection" };
    if (t.niveau < max) return { cls: "monte", titre: "+" + (t.niveau - 1) + " → +" + t.niveau, texte: "amélioration +" + (t.niveau - 1) + " vers +" + t.niveau + " sur +" + max, jauge: t.niveau / max };
    if (t.niveau === max) return { cls: "max", titre: "MAX !", texte: "améliorations au maximum", jauge: 1 };
    return { cls: "trop", titre: "Doublon en trop", sous: "MAX · à revendre", texte: "déjà amélioré au maximum, doublon en trop à revendre" };
  }
  function creerCarteTable(t) {
    const o = App.objet(t.numero) || { numero: t.numero, nom: t.nom, rarete: t.rarete, slot: "", set: "", actif: true, data: { rarete: t.rarete }, image: t.image || "", contributeur: "" };
    const max = t.niveau_max || App.niveauMax(o.rarete), r = resultat(t, max);
    const d = el("div", { class: "dcarte", style: { "--c": "var(--" + o.rarete + ")" } });
    d.innerHTML = '<span class="eclat"></span><div class="dcarte-in"><div class="dos"><svg viewBox="0 0 40 40" aria-hidden="true"><use href="#i-marque"/></svg></div></div>';
    const face = App.carte(o, { niveau: Math.min(t.niveau, max) });
    face.classList.add("face");
    face.removeAttribute("role");
    $(".dcarte-in", d).append(face);
    d.append(el("span", { class: "lb-badge " + r.cls }, el("b", {}, r.titre.split("→").flatMap((m, i) => (i ? [el("span", { class: "lb-fleche", texte: "→" }), m] : [m]))),
      r.jauge !== undefined ? el("span", { class: "jauge-niv" }, el("i", { style: { width: r.jauge * 100 + "%" } })) : null,
      r.sous ? el("small", { texte: r.sous }) : null));
    d._etiquette = o.nom + ", " + RARETES[o.rarete].nom + ", " + r.texte;
    d._resultat = r.cls;
    d._numero = o.numero;
    return d;
  }
  function rendreCliquable(d) {
    d.setAttribute("aria-label", d._etiquette + ". Voir la fiche");
  }
  function etincelles(rang, c, x0, y0) {
    if (App.reduit) return;
    if (x0 === undefined) {
      const t = table.getBoundingClientRect(), s = coffre.querySelector("svg").getBoundingClientRect();
      x0 = s.left - t.left + s.width / 2; y0 = s.top - t.top + s.height * 0.35;
    }
    for (let i = 0; i < 8 + rang * 10; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.3, v = 60 + Math.random() * (90 + rang * 50);
      const e = el("span", { class: "etincelle", style: { "--x": x0 + "px", "--y": y0 + "px", "--dx": (Math.cos(a) * v).toFixed(1) + "px", "--dy": (Math.sin(a) * v).toFixed(1) + "px", "--d": (0.7 + Math.random() * 0.6).toFixed(2) + "s", "--c": Math.random() < 0.3 ? "#fff" : c } });
      table.append(e);
      setTimeout(() => e.remove(), 1500);
    }
  }
  const vibrer = (rang) => { if (!App.reduit && VIBRATIONS[rang] && navigator.vibrate) navigator.vibrate(VIBRATIONS[rang]); };
  function eclair(c, duree) {
    const e = el("span", { class: "eclair", style: { "--flash": c, "--df": duree + "s" } });
    table.append(e);
    setTimeout(() => e.remove(), duree * 1000 + 60);
  }
  function secouer(duree) {
    if (App.reduit) return;
    table.style.setProperty("--secousse", duree + "s");
    table.classList.remove("secoue"); void table.offsetWidth; table.classList.add("secoue");
  }
  function tampon(rarete) {
    $$(".tampon", table).forEach((e) => e.remove());
    const t = el("span", { class: "tampon", style: { "--c": "var(--" + rarete + ")" }, texte: RARETES[rarete].nom + " !" });
    table.append(t);
    setTimeout(() => t.remove(), 1600);
  }
  function pluieDePieces() {
    if (App.reduit) return;
    const h = table.clientHeight + 30;
    for (let i = 0; i < 34; i++) {
      const p = el("span", { class: "piece", style: { "--x": (Math.random() * 100).toFixed(1) + "%", "--d": (0.9 + Math.random() * 0.9).toFixed(2) + "s", "--r": (Math.random() * 0.7).toFixed(2) + "s", "--h": h + "px" } });
      table.append(p);
      setTimeout(() => p.remove(), 2600);
    }
    for (let i = 0; i < 9; i++) setTimeout(App.sons.tinte, 200 + i * 110);
  }
  // Aura + son discret : l'indice de rareté d'une carte face cachée.
  function indice(d, rang) {
    if (d.classList.contains("retournee") || d.classList.contains("aura")) return;
    d.classList.add("aura");
    App.sons.indice(rang);
  }
  // Retourne une carte. Sans survol préalable (toucher, clavier, Tout révéler), l'aura se montre d'abord un instant.
  async function reveler(etat, i) {
    const d = etat.cartes[i], rang = rangRarete(etat.tirages[i].rarete);
    if (d.classList.contains("retournee") || d._enCours) return;
    d._enCours = true;
    if (!d.classList.contains("aura")) { indice(d, rang); await pause(INDICE_MS); }
    retourner(etat, i);
  }
  function retourner(etat, i) {
    const d = etat.cartes[i], t = etat.tirages[i], rang = rangRarete(t.rarete);
    if (d.classList.contains("retournee")) return;
    d.classList.remove("aura");
    d.style.setProperty("--pop", String(1.06 + rang * 0.05));
    d.classList.add("retournee", "pop");
    if (rang >= 2 || t.nouveau) d.classList.add("eclate");
    if (rang >= 3) d.classList.add("haute");
    rendreCliquable(d);
    const p = etat.disp.positions[i], c = couleur(t.rarete);
    App.sons.retournement();
    App.sons.combo(etat.combo++);
    if (rang >= 2) App.sons.rarete(rang);
    etincelles(Math.max(0, rang - 1), c, p.x + etat.disp.dw / 2, p.y + etat.disp.dw * 0.7);
    vibrer(rang);
    if (rang >= 3) {
      secouer(rang >= 4 ? 0.6 : 0.35); eclair(c, 0.6); tampon(t.rarete);
      // Épique et Légendaire : le reste de la table plonge un instant dans l'ombre.
      if (etat.cartes.length > 1) { table.classList.add("focus"); d.classList.add("vedette"); setTimeout(() => { table.classList.remove("focus"); d.classList.remove("vedette"); }, 900); }
    }
    if (rang >= 4) pluieDePieces();
    // Le son du badge (nouveau, amélioration, max) suit l'apparition du badge sous la carte.
    const cls = d._resultat;
    setTimeout(() => {
      if (cls === "nouveau") App.sons.scintille();
      else if (cls === "max") App.sons.accordMax();
      else if (cls === "monte") App.sons.cloche(t.niveau);
    }, 360);
    if (--etat.reste === 0) etat.fin();
  }
  // « Tout révéler » : les cartes restantes, une par une, dans un ordre aléatoire.
  async function toutReveler() {
    const etat = etatCourant;
    if (!etat || btnPasser.disabled) return;
    btnPasser.disabled = true;
    for (const i of melanger(etat.cartes.map((_, k) => k))) {
      if (etat !== etatCourant) return;
      if (etat.cartes[i].classList.contains("retournee")) continue;
      await reveler(etat, i);
      await pause(ECART[rangRarete(etat.tirages[i].rarete)]);
    }
  }

  function commandes(actives) {
    typesBtns.forEach((b) => (b.disabled = !actives));
    majBoutons();
  }
  function remettreCoffre() {
    $$(".dcarte, .etincelle, .eclair, .tampon, .piece", table).forEach((e) => e.remove());
    table.classList.remove("flash-leg", "focus", "secoue", "a-reveler");
    coffre.classList.remove("tremble", "ouvert", "rayonne", "recule", "inspire");
    btnPasser.hidden = true;
    etatCourant = null;
    pret = true;
    coffre.classList.toggle("version-legendaire", type === "legendaire");
    coffre.style.setProperty("--lueur", "#f4f2ec");
    coffre.style.setProperty("--force", "1");
    table.style.setProperty("--h-table", (table.clientWidth < 560 ? 340 : 420) + "px");
    dernier = null;
  }

  // ---------- L'ouverture ----------
  async function ouvrir(n) {
    if (enCours || !pret || n < 1 || stock(type) < n) return;
    enCours = true; pret = false;
    const leg = type === "legendaire";
    App.sons.demarrer();
    bilan.replaceChildren();
    suite.hidden = true;
    consigne.textContent = "";
    commandes(false);

    // 1. Le coffre tremble pendant que le serveur tire les objets. Rien ne trahit encore les raretés.
    coffre.classList.add("tremble");
    const couper = App.sons.tension(1.2);
    let res;
    try {
      [res] = await Promise.all([App.rpc("ouvrir_lootbox", { p_nombre: n, p_legendaire: leg }), pause(900)]);
      if (!res || !Array.isArray(res.tirages) || !res.tirages.length) throw new Error("L'ouverture n'a rien renvoyé. Recharge la page.");
    } catch (e) {
      couper();
      App.erreur(e);
      enCours = false;
      remettreCoffre();
      commandes(true);
      return;
    }
    const tirages = res.tirages;
    if (leg) ctx.joueur.lootbox_legendaire = res.lootbox_restantes; else ctx.joueur.lootbox = res.lootbox_restantes;
    const rafraichi = Promise.all([App.rafraichirJoueur(), App.rafraichirCollection()]).catch((e) => console.warn(e));
    // Les objets sont déjà acquis : l'historique de session est enregistré tout de suite (affiché après la révélation).
    histo = [...tirages.map((t) => ({ numero: t.numero, niveau: t.niveau, nouveau: !!t.nouveau })).reverse(), ...histo].slice(0, 40);
    ecrireHisto(histo);
    // Ordre mélangé : la place d'une carte ne dit rien de sa rareté.
    const ordre = melanger(tirages);
    const rangMax = Math.max(...ordre.map((t) => rangRarete(t.rarete)));

    // 2. Le couvercle saute, sans couleur de rareté.
    couper();
    coffre.classList.remove("tremble");
    coffre.classList.add("ouvert");
    eclair("#f4f2ec", 0.5);
    App.sons.explosion(1);
    etincelles(1, "#f4f2ec");
    await pause(560);

    // 3. Les cartes jaillissent du coffre, face cachée.
    const disp = disposition(ordre.length);
    table.style.setProperty("--dw", disp.dw + "px");
    table.style.setProperty("--h-table", disp.hauteur + "px");
    table.classList.toggle("etroite", disp.dw < 110);
    const bouche = boucheCoffre(disp.dw);
    coffre.classList.add("recule");
    const cartes = ordre.map((t) => {
      const d = creerCarteTable(t);
      d.style.transition = "none";
      d.style.opacity = "0";
      placer(d, bouche, 0, 0.25);
      table.append(d);
      return d;
    });
    void table.offsetWidth;
    cartes.forEach((d, i) => {
      d.style.transition = "";
      d.style.transitionDelay = i * 70 + "ms";
      d.style.opacity = "1";
      placer(d, disp.positions[i], disp.positions[i].r);
      App.sons.envol(i * 0.07);
    });
    dernier = { n: ordre.length, cartes };
    await pause(760 + ordre.length * 70);
    cartes.forEach((d) => (d.style.transitionDelay = "0ms"));

    // 4. Au joueur de retourner ses cartes : survol = aura et son de la rareté, clic = retournement.
    const etat = { tirages: ordre, cartes, disp, combo: 0, reste: cartes.length, fin: null };
    const fini = new Promise((f) => (etat.fin = f));
    etatCourant = etat;
    cartes.forEach((d, i) => {
      const rang = rangRarete(ordre[i].rarete);
      d.style.setProperty("--rang", String(rang));
      d.toggleAttribute("data-haut", rang >= 3);
      d.setAttribute("role", "button");
      d.tabIndex = 0;
      d.setAttribute("aria-label", `Carte ${i + 1} sur ${cartes.length}, face cachée. La retourner`);
      d.addEventListener("pointerenter", (e) => { if (e.pointerType === "mouse") indice(d, rang); });
      d.addEventListener("pointerleave", () => { if (!d._enCours) d.classList.remove("aura"); });
      d.addEventListener("focus", () => { if (d.matches(":focus-visible")) indice(d, rang); });
      d.addEventListener("blur", () => { if (!d._enCours) d.classList.remove("aura"); });
      d.addEventListener("click", () => { if (d.classList.contains("retournee")) ficheObjet(d._numero); else reveler(etat, i); });
      d.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); d.click(); } });
    });
    table.classList.add("a-reveler");
    btnPasser.disabled = false;
    btnPasser.hidden = cartes.length < 2;
    consigne.textContent = tactile ? "Touche une carte pour la retourner" : "Survole une carte pour deviner sa rareté, clique pour la retourner";
    await fini;
    if (etat !== etatCourant) return;
    table.classList.remove("a-reveler");
    btnPasser.hidden = true;
    consigne.textContent = "";

    // 5. Bilan, compteurs, historique, succès.
    await rafraichi;
    const cMax = couleur(ORDRE_RARETE[rangMax]);
    const nouveaux = tirages.filter((t) => t.nouveau).length;
    const montees = tirages.filter((t) => !t.nouveau && t.niveau <= (t.niveau_max || App.niveauMax(t.rarete))).length;
    const trop = tirages.length - nouveaux - montees;
    bilan.replaceChildren(...[
      el("b", { texte: pluriel(tirages.length, "objet") }),
      nouveaux ? el("span", { class: "lb-bilan-nouveau", texte: pluriel(nouveaux, "nouveau", "nouveaux") }) : null,
      montees ? el("span", { texte: pluriel(montees, "amélioration", "améliorations") }) : null,
      trop ? el("span", { texte: pluriel(trop, "doublon") + " en trop" }) : null,
      el("span", {}, "meilleur : ", el("b", { style: { color: cMax }, texte: RARETES[ORDRE_RARETE[rangMax]].nom }))].filter(Boolean));
    enCours = false;
    commandes(true);
    majTout();
    rendreSuite(tirages);
    App.verifierSucces();
  }

  // Repositionne les cartes posées quand la largeur change.
  let minuterie;
  addEventListener("resize", () => {
    clearTimeout(minuterie);
    minuterie = setTimeout(() => {
      if (!dernier) { table.style.setProperty("--h-table", (table.clientWidth < 560 ? 340 : 420) + "px"); return; }
      const disp = disposition(dernier.n);
      table.style.setProperty("--dw", disp.dw + "px");
      table.style.setProperty("--h-table", disp.hauteur + "px");
      table.classList.toggle("etroite", disp.dw < 110);
      dernier.cartes.forEach((d, i) => { d.style.transition = "none"; placer(d, disp.positions[i], disp.positions[i].r); });
    }, 120);
  });

  remettreCoffre();
  majSon();
  majTout();
  App.api.lootboxRaretes().then((l) => { taux = l || []; rendreTaux(); }).catch((e) => { console.warn(e); taux = false; rendreTaux(); });
});
})();
