"use strict";
// Lootbox : la page d'arrivée. L'ouverture est une invocation :
//   1. le joueur maintient le coffre pour le charger (un simple clic le charge tout seul) ;
//   2. le couvercle saute, un faisceau part et « monte en grade » de rareté en rareté, en hésitant
//      à chaque palier, jusqu'à la meilleure rareté du tirage ;
//   3. les cartes s'abattent une à une, de la moins rare à la plus rare ; la meilleure (Épique ou
//      Légendaire) arrive en dernier, en grand, au ralenti ;
//   4. bilan et bouton « Encore ».
// Le tirage est fait par ouvrir_lootbox au lancement : l'animation ne fait que révéler le résultat.
(function () {
const { $, $$, el, icone, fmt, nombre, RARETES, ORDRE_RARETE, SLOTS, rangRarete, couleur } = App;

const DUREE_CHARGE = 1100;  // maintien nécessaire pour charger le coffre (ms)
const CLIC_MS = 250;        // relâché avant : c'était un simple clic, la charge continue seule
const TENUE_MAX = 2500;     // coffre chargé à bloc : il part tout seul après ce délai
const CHARGE = [0, 0, 260, 520, 800];     // une carte posée se charge de sa couleur avant de se retourner (ms, par rareté)
const ECART = [90, 130, 320, 520, 800];   // pause avant la carte suivante : les communes tombent en rafale
const BLANC = "#f4f2ec";
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
  let enCours = false, pret = false, choix = 1, charge = null, passer = false, reveils = [], tLance = 0, dernier = null, taux = null;
  const tactile = matchMedia("(hover: none)").matches;
  let histo = lireHisto();

  // ---------- Construction ----------
  const entete = el("header", { class: "entete-page lb-entete" },
    el("div", {}, el("h1", { texte: "Lootbox" }),
      el("p", { texte: "Une lootbox, un objet. Charge le coffre, lâche tout : plus le faisceau monte en couleur, plus ce qui tombe est rare." })));

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
  const voile = el("span", { class: "lb-voile", "aria-hidden": "true" });
  const colonne = el("span", { class: "lb-colonne", "aria-hidden": "true" }, el("i"));
  const toile = el("canvas", { class: "lb-particules", "aria-hidden": "true" });
  const echelle = el("div", { class: "echelle", hidden: true, "aria-hidden": "true" });
  // Le coffre se maintient (ou se clique) : bouton rond posé dessus, avec la jauge de charge.
  const btnCoffre = el("button", { type: "button", class: "lb-ouvrir-coffre" }, el("span", { class: "lb-jauge", "aria-hidden": "true" }));
  const consigne = el("p", { class: "lb-consigne", "aria-live": "polite" });
  const btnPasser = el("button", { type: "button", class: "btn-passer", hidden: true, texte: "Passer", onclick: (e) => { e.stopPropagation(); toutPasser(); } });
  const btnEncore = el("button", { type: "button", class: "btn-ouvrir lb-btn-encore", onclick: () => { preparer(choix); debutCharge(true); } });
  const resteEncore = el("span", { class: "mention num" });
  const encore = el("div", { class: "lb-encore", hidden: true }, btnEncore, resteEncore);
  table.append(voile, colonne, echelle, btnCoffre, toile, consigne, btnPasser, encore);
  table.addEventListener("click", (e) => { if (!e.target.closest(".dcarte, button")) toutPasser(); });
  btnCoffre.addEventListener("pointerdown", (e) => { if (e.button) return; try { btnCoffre.setPointerCapture(e.pointerId); } catch (x) { /* pointeur déjà relâché */ } debutCharge(false); });
  btnCoffre.addEventListener("pointerup", () => finCharge());
  btnCoffre.addEventListener("pointercancel", () => annulerCharge());
  btnCoffre.addEventListener("keydown", (e) => { if ((e.key === "Enter" || e.key === " ") && !e.repeat) { e.preventDefault(); debutCharge(false); } });
  btnCoffre.addEventListener("keyup", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); finCharge(); } });
  btnCoffre.addEventListener("blur", () => { if (charge && !charge.auto) annulerCharge(); });
  btnCoffre.addEventListener("click", (e) => { if (e.detail === 0 && !charge) debutCharge(true); }); // activation par un lecteur d'écran
  btnCoffre.addEventListener("contextmenu", (e) => e.preventDefault());

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
    btnCoffre.setAttribute("aria-label", "Invoquer " + pluriel(choix, nom, nom === "lootbox" ? "lootbox" : "lootbox légendaires") + " (maintenir, ou activer une fois)");
    if (pret && !charge) consigne.textContent = n < 1 ? "" : (tactile ? "Maintiens le coffre" : "Maintiens le clic sur le coffre") + " pour invoquer " + pluriel(choix, "lootbox", "lootbox");
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
    if (enCours || charge) return;
    choix = n;
    remettreCoffre();
    bilan.replaceChildren();
    suite.hidden = true;
    majBoutons();
    if (!btnCoffre.hidden) btnCoffre.focus({ preventScroll: true });
  }
  function choisirType(t) {
    if (enCours || charge || t === type) return;
    type = t;
    try { history.replaceState(null, "", t === "legendaire" ? "?type=legendaire" : location.pathname); } catch (e) { /* ignore */ }
    remettreCoffre();
    bilan.replaceChildren();
    suite.hidden = true;
    majTout();
  }

  // ---------- Mécanique ----------
  // Pause que « Passer » peut écourter.
  function pause(ms) {
    return new Promise((fin) => {
      if (passer) return fin();
      const t = setTimeout(fin, App.reduit ? Math.min(ms, 60) : ms);
      reveils.push(() => { clearTimeout(t); fin(); });
    });
  }
  function toutPasser() {
    if (!enCours || passer || performance.now() - tLance < 400) return;
    passer = true;
    reveils.splice(0).forEach((f) => f());
  }

  // Particules : petits carrés (comme les pixels du coffre) dessinés sur une toile au-dessus de la table.
  const P = [], ctx2 = toile.getContext("2d");
  let rafP = 0, tP = 0, flux = 0;
  function braise(x, y, vx, vy, g, vie, c, taille) {
    if (App.reduit || P.length > 700) return;
    P.push({ x, y, vx, vy, g, vie, age: 0, c, t: taille });
    if (!rafP) { tP = performance.now(); rafP = requestAnimationFrame(dessiner); }
  }
  function dessiner(t) {
    const dt = Math.min(0.05, (t - tP) / 1000), dpr = Math.min(2, devicePixelRatio || 1);
    tP = t;
    const w = Math.round(table.clientWidth * dpr), h = Math.round(table.clientHeight * dpr);
    if (toile.width !== w || toile.height !== h) { toile.width = w; toile.height = h; }
    ctx2.clearRect(0, 0, w, h);
    ctx2.globalCompositeOperation = "lighter";
    for (let i = P.length - 1; i >= 0; i--) {
      const p = P[i];
      p.age += dt;
      if (p.age >= p.vie) { P.splice(i, 1); continue; }
      p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt;
      const k = 1 - p.age / p.vie, c = p.t * dpr * (0.45 + k * 0.55);
      ctx2.globalAlpha = Math.min(1, k * 1.6);
      ctx2.fillStyle = p.c;
      ctx2.fillRect(p.x * dpr - c / 2, p.y * dpr - c / 2, c, c);
    }
    rafP = P.length ? requestAnimationFrame(dessiner) : 0;
    if (!rafP) ctx2.clearRect(0, 0, w, h);
  }
  // Gerbe : n particules qui partent de (x, y) dans un cône autour de « dir » (vers le haut par défaut).
  function gerbe(x, y, c, n, { v = 240, cone = Math.PI * 1.3, dir = -Math.PI / 2, g = 520, vie = 0.9, taille = 4 } = {}) {
    for (let i = 0; i < n; i++) {
      const a = dir + (Math.random() - 0.5) * cone, s = v * (0.35 + Math.random() * 0.9);
      braise(x, y, Math.cos(a) * s, Math.sin(a) * s, g, vie * (0.6 + Math.random() * 0.8), Math.random() < 0.28 ? "#fff" : c, taille * (0.6 + Math.random() * 0.9));
    }
  }
  // Braises qui montent dans le faisceau tant qu'il est allumé.
  function demarrerFlux() {
    arreterFlux();
    if (App.reduit) return;
    flux = setInterval(() => {
      const o = centreCoffre(), rang = Number(table.style.getPropertyValue("--rang")) || 0, c = table.style.getPropertyValue("--lueur") || BLANC;
      for (let k = 0; k < 2 + rang; k++) braise(o.x + (Math.random() - 0.5) * (22 + rang * 16), o.y, (Math.random() - 0.5) * 30, -(260 + Math.random() * 380), -160, 0.5 + Math.random() * 0.5, Math.random() < 0.3 ? "#fff" : c, 3 + Math.random() * 3);
    }, 45);
  }
  function arreterFlux() { clearInterval(flux); flux = 0; }
  function centreCoffre() {
    const t = table.getBoundingClientRect(), r = coffre.getBoundingClientRect();
    return { x: r.left - t.left + r.width / 2, y: r.top - t.top + r.height * 0.36 };
  }
  // La couleur de la scène (faisceau, halo, voile) et son intensité (rang 0 à 4).
  function lueur(c, rang) {
    table.style.setProperty("--lueur", c);
    coffre.style.setProperty("--lueur", c);
    if (rang !== undefined) table.style.setProperty("--rang", String(rang));
  }
  function onde(x, y, c) {
    if (App.reduit) return;
    const e = el("span", { class: "onde-choc", style: { "--x": x + "px", "--y": y + "px", "--c": c } });
    table.append(e);
    setTimeout(() => e.remove(), 700);
  }

  // ---------- La charge : maintenir le coffre ----------
  function debutCharge(auto) {
    if (enCours || !pret || charge || stock(type) < choix) return;
    App.sons.demarrer();
    if (App.reduit) { ouvrir(choix); return; }
    // Sur un petit écran, la table vient au centre : toute la scène doit se voir.
    const cadre = table.getBoundingClientRect();
    if (cadre.top < 60 || cadre.bottom > innerHeight - 60) table.scrollIntoView({ block: "center", behavior: "smooth" });
    charge = { t0: performance.now(), auto: !!auto, pleine: false, raf: 0, minuterie: 0, o: centreCoffre(), couper: App.sons.tension(DUREE_CHARGE / 1000) };
    coffre.classList.add("tremble");
    table.classList.add("en-charge");
    consigne.textContent = auto ? "" : "Maintiens…";
    majBoutons();
    const tour = (t) => {
      if (!charge) return;
      const p = Math.min(1, (t - charge.t0) / DUREE_CHARGE), o = charge.o;
      table.style.setProperty("--charge", p.toFixed(3));
      coffre.style.setProperty("--force", (1 + p * 3.4).toFixed(2));
      // La lumière est aspirée par le coffre.
      if (Math.random() < 0.3 + p * 0.7) {
        const a = Math.random() * Math.PI * 2, d = 130 + Math.random() * 80;
        braise(o.x + Math.cos(a) * d, o.y + Math.sin(a) * d, -Math.cos(a) * d / 0.42, -Math.sin(a) * d / 0.42, 0, 0.42, Math.random() < 0.3 ? "#fff" : couleur("legendaire"), 3 + Math.random() * 3);
      }
      if (p >= 1 && !charge.pleine) {
        charge.pleine = true;
        if (charge.auto) { lancer(); return; }
        table.classList.add("charge-pleine");
        consigne.textContent = "Relâche !";
        App.sons.tic(4);
        if (navigator.vibrate) navigator.vibrate(30);
        charge.minuterie = setTimeout(lancer, TENUE_MAX);
      }
      charge.raf = requestAnimationFrame(tour);
    };
    charge.raf = requestAnimationFrame(tour);
  }
  function finCharge() {
    if (!charge || charge.auto) return;
    if (charge.pleine) { lancer(); return; }
    // Relâché tout de suite : c'était un simple clic, le coffre finit de se charger tout seul.
    if (performance.now() - charge.t0 < CLIC_MS) { charge.auto = true; consigne.textContent = ""; return; }
    annulerCharge("Maintiens jusqu'au bout, ou clique une seule fois");
  }
  function arreterCharge() {
    const c = charge;
    charge = null;
    cancelAnimationFrame(c.raf);
    clearTimeout(c.minuterie);
    c.couper();
    table.classList.remove("en-charge", "charge-pleine");
    table.style.setProperty("--charge", "0");
  }
  function annulerCharge(message) {
    if (!charge) return;
    arreterCharge();
    coffre.classList.remove("tremble");
    coffre.style.setProperty("--force", "1");
    App.sons.relache();
    majBoutons();
    if (message) consigne.textContent = message;
  }
  function lancer() {
    if (!charge) return;
    arreterCharge();
    ouvrir(choix);
  }

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
    return { dw, hauteur: hauteur + 44, positions }; // 44 px en bas pour « Passer » puis « Encore »
  }
  const placer = (d, p, rot, echelle = 1) => { d.style.transform = "translate(" + p.x + "px," + p.y + "px) rotate(" + rot + "deg) scale(" + echelle + ")"; };
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
  // Compatibilité avec les anciens appels : une gerbe vers le haut, plus fournie quand c'est rare.
  function etincelles(rang, c, x, y) { gerbe(x, y, c, 10 + rang * 14, { v: 170 + rang * 55 }); }
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
  // Échelle des raretés : elle s'allume palier par palier, jusqu'à la vraie rareté du tirage.
  function preparerEchelle() {
    echelle.replaceChildren(...ORDRE_RARETE.map((r) => el("span", { class: poids(r) ? null : "exclu", style: { "--c": "var(--" + r + ")" }, texte: RARETES[r].nom })));
    echelle.hidden = false;
  }
  function monterEchelle(rang) {
    [...echelle.children].forEach((s, i) => {
      s.classList.toggle("atteint", i <= rang && !s.classList.contains("exclu"));
      s.classList.toggle("actuel", i === rang);
    });
  }
  // Le faisceau force vers le grade suivant : montera, montera pas ?
  async function hesiter(r, suivant) {
    if (passer) return;
    table.style.setProperty("--suivante", couleur(ORDRE_RARETE[suivant]));
    table.classList.add("hesite");
    coffre.style.setProperty("--force", String(2 + r));
    const duree = 330 + r * 110;
    for (let k = 0; k < 3 && !passer; k++) {
      App.sons.tic(r + k * 0.6);
      if (r >= 2 && k === 1) App.sons.battement();
      await pause(duree / 3);
    }
    table.classList.remove("hesite");
  }
  // Il monte : flash, onde, gerbe et motif sonore de la nouvelle rareté, chaque fois plus fort.
  async function monter(r) {
    const c = couleur(ORDRE_RARETE[r]);
    if (r >= 3 && !passer) {
      // Faux calme avant un Épique ou un Légendaire : le faisceau se resserre, un battement, puis ça part.
      table.classList.add("calme");
      App.sons.battement();
      await pause(480);
      table.classList.remove("calme");
    }
    lueur(c, r);
    monterEchelle(r);
    if (passer) return;
    const o = centreCoffre();
    eclair(c, 0.45 + r * 0.12);
    secouer(0.22 + r * 0.1);
    onde(o.x, o.y, c);
    gerbe(o.x, o.y, c, 26 + r * 22, { v: 220 + r * 70 });
    App.sons.explosion(r);
    App.sons.rarete(r);
    vibrer(r);
    if (r >= 2) coffre.classList.add("rayonne");
    if (r >= 4) { table.classList.remove("flash-leg"); void table.offsetWidth; table.classList.add("flash-leg"); pluieDePieces(); }
    await pause(300 + r * 80);
  }

  // Crée la carte à sa place sur la table, face cachée.
  function poser(etat, i) {
    const d = creerCarteTable(etat.tirages[i]), p = etat.disp.positions[i];
    etat.cartes[i] = d;
    d.style.transition = "none";
    placer(d, p, p.r);
    d.addEventListener("click", (e) => { e.stopPropagation(); if (d.classList.contains("retournee")) ficheObjet(d._numero); });
    d.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); d.click(); } });
    table.append(d);
    return d;
  }
  function retourner(etat, i, muet) {
    const d = etat.cartes[i], t = etat.tirages[i], rang = rangRarete(t.rarete);
    d.classList.remove("charge");
    d.style.setProperty("--pop", String(1.06 + rang * 0.05));
    d.classList.add("retournee", "pop");
    if (rang >= 2 || t.nouveau) d.classList.add("eclate");
    if (rang >= 3) d.classList.add("haute");
    d.setAttribute("role", "button");
    d.tabIndex = 0;
    d.setAttribute("aria-label", d._etiquette + ". Voir la fiche");
    if (muet) return;
    const c = couleur(t.rarete), r = d.getBoundingClientRect(), tb = table.getBoundingClientRect();
    App.sons.retournement();
    App.sons.combo(etat.combo++);
    if (rang >= 2) App.sons.rarete(rang);
    etincelles(rang, c, r.left - tb.left + r.width / 2, r.top - tb.top + r.height / 2);
    vibrer(rang);
    if (rang >= 3) { secouer(rang >= 4 ? 0.6 : 0.35); eclair(c, 0.6); tampon(t.rarete); }
    if (rang >= 4) pluieDePieces();
    // Le son du badge (nouveau, amélioration, max) suit l'apparition du badge sous la carte.
    const cls = d._resultat;
    setTimeout(() => {
      if (cls === "nouveau") App.sons.scintille();
      else if (cls === "max") App.sons.accordMax();
      else if (cls === "monte") App.sons.cloche(t.niveau);
    }, 360);
  }
  // Une carte s'abat à sa place : chute, impact, charge de sa couleur si elle est rare, retournement.
  async function abattre(etat, i) {
    const d = poser(etat, i), t = etat.tirages[i], rang = rangRarete(t.rarete), p = etat.disp.positions[i], dw = etat.disp.dw, c = couleur(t.rarete);
    if (passer) { retourner(etat, i, true); return; }
    const chute = d.animate([
      { transform: `translate(${p.x}px,${p.y - 440}px) rotate(${p.r + (i % 2 ? 10 : -10)}deg) scale(1.5)`, opacity: 0 },
      { opacity: 1, offset: 0.3 },
      { transform: d.style.transform, opacity: 1 }], { duration: App.reduit ? 1 : 290, easing: "cubic-bezier(.6, 0, .9, .45)" });
    App.sons.envol();
    await pause(290);
    chute.finish();
    if (!passer) {
      d.classList.add("impact");
      App.sons.impact(rang);
      onde(p.x + dw / 2, p.y + dw * 0.7, c);
      gerbe(p.x + dw / 2, p.y + dw * 1.36, c, 6 + rang * 7, { v: 150 + rang * 30, cone: Math.PI * 1.7, vie: 0.5, taille: 3 });
      if (rang >= 2) secouer(0.14 + rang * 0.05);
      if (CHARGE[rang]) {
        d.style.setProperty("--vib", CHARGE[rang] + "ms");
        d.classList.add("charge");
        if (rang >= 3) App.sons.battement();
        await pause(CHARGE[rang]);
      } else await pause(70);
    }
    retourner(etat, i, passer);
    await pause(ECART[rang]);
  }
  // La meilleure carte (Épique ou Légendaire) arrive en dernier, en grand, au ralenti.
  async function vedette(etat, i) {
    const d = poser(etat, i), t = etat.tirages[i], rang = rangRarete(t.rarete), p = etat.disp.positions[i], dw = etat.disp.dw, n = etat.tirages.length;
    const k = n === 1 ? 1.12 : Math.min(2.1, Math.min(table.clientWidth * 0.5, 250) / dw);
    const centre = { x: table.clientWidth / 2 - dw / 2, y: (etat.disp.hauteur - 44) / 2 - dw * 0.7 };
    table.classList.add("focus", "final");
    d.classList.add("vedette");
    lueur(couleur(t.rarete), rang);
    d.style.opacity = "0";
    placer(d, { x: centre.x, y: centre.y - 140 }, 0, k * 0.8);
    void d.offsetWidth;
    App.sons.battement();
    await pause(350);
    // Elle descend lentement, face cachée, en vibrant de sa couleur.
    d.style.transition = "transform 1s cubic-bezier(.16, 1, .3, 1), opacity .5s";
    d.style.opacity = "1";
    placer(d, centre, 0, k);
    d.classList.add("charge");
    const couper = App.sons.tension(1.1);
    await pause(560);
    App.sons.battement();
    await pause(560);
    couper();
    d.classList.add("lente");
    retourner(etat, i, passer);
    await pause(800 + rang * 200);
    d.classList.remove("lente");
    d.style.transition = "";
    placer(d, p, p.r); // elle rejoint sa place
    table.classList.remove("focus", "final");
    d.classList.remove("vedette");
    await pause(n > 1 ? 520 : 200);
  }

  function commandes(actives) {
    typesBtns.forEach((b) => (b.disabled = !actives));
    btnPasser.hidden = actives;
    table.classList.toggle("passable", !actives);
    majBoutons();
  }
  function remettreCoffre() {
    $$(".dcarte, .eclair, .tampon, .piece, .onde-choc", table).forEach((e) => e.remove());
    table.classList.remove("flash-leg", "focus", "final", "secoue", "invocation", "cartes", "hesite", "calme", "en-charge", "charge-pleine");
    coffre.classList.remove("tremble", "ouvert", "rayonne", "recule", "inspire");
    arreterFlux();
    echelle.hidden = true;
    encore.hidden = true;
    coffre.classList.toggle("version-legendaire", type === "legendaire");
    lueur(BLANC, 0);
    coffre.style.setProperty("--force", "1");
    table.style.setProperty("--charge", "0");
    table.style.setProperty("--h-table", (table.clientWidth < 560 ? 340 : 420) + "px");
    dernier = null;
    pret = true;
  }

  // ---------- L'ouverture ----------
  async function ouvrir(n) {
    if (enCours || !pret || n < 1 || stock(type) < n) return;
    enCours = true; pret = false; passer = false; reveils = []; tLance = performance.now();
    const leg = type === "legendaire";
    App.sons.demarrer();
    bilan.replaceChildren();
    suite.hidden = true;
    consigne.textContent = "";
    commandes(false);

    // 1. Le couvercle saute et le faisceau part, blanc tant que le serveur n'a pas tiré les objets.
    const possibles = ORDRE_RARETE.map((r, k) => (poids(r) > 0 ? k : -1)).filter((k) => k >= 0);
    preparerEchelle();
    lueur(BLANC, 0);
    coffre.classList.remove("tremble");
    coffre.classList.add("ouvert");
    table.classList.add("invocation");
    const o = centreCoffre();
    eclair(BLANC, 0.45);
    secouer(0.3);
    onde(o.x, o.y, BLANC);
    gerbe(o.x, o.y, BLANC, 44, { v: 340 });
    App.sons.explosion(1);
    App.sons.faisceau();
    vibrer(2);
    demarrerFlux();
    let res;
    try {
      [res] = await Promise.all([App.rpc("ouvrir_lootbox", { p_nombre: n, p_legendaire: leg }), pause(700)]);
      if (!res || !Array.isArray(res.tirages) || !res.tirages.length) throw new Error("L'ouverture n'a rien renvoyé. Recharge la page.");
    } catch (e) {
      App.erreur(e);
      enCours = false;
      remettreCoffre();
      commandes(true);
      return;
    }
    const tirages = res.tirages;
    if (leg) ctx.joueur.lootbox_legendaire = res.lootbox_restantes; else ctx.joueur.lootbox = res.lootbox_restantes;
    const rafraichi = Promise.all([App.rafraichirJoueur(), App.rafraichirCollection()]).catch((e) => console.warn(e));
    // Les objets sont déjà acquis : l'historique de session est enregistré tout de suite (affiché à la fin).
    histo = [...tirages.map((t) => ({ numero: t.numero, niveau: t.niveau, nouveau: !!t.nouveau })).reverse(), ...histo].slice(0, 40);
    ecrireHisto(histo);
    // Les cartes tombent de la moins rare à la plus rare : le meilleur arrive en dernier.
    const ordre = tirages.slice().sort((x, y) => rangRarete(x.rarete) - rangRarete(y.rarete));
    const rangMax = rangRarete(ordre[ordre.length - 1].rarete);
    const cMax = couleur(ORDRE_RARETE[rangMax]);

    // 2. Montée en grade : le faisceau prend la couleur de chaque rareté possible, jusqu'à la meilleure du tirage.
    const paliers = possibles.filter((k) => k <= rangMax);
    if (!paliers.includes(rangMax)) paliers.push(rangMax);
    lueur(couleur(ORDRE_RARETE[paliers[0]]), paliers[0]);
    monterEchelle(paliers[0]);
    if (!passer) App.sons.tic(0);
    await pause(420);
    for (let k = 1; k < paliers.length; k++) {
      await hesiter(paliers[k - 1], paliers[k]);
      await monter(paliers[k]);
    }
    // Dernière hésitation : il force vers le grade du dessus… et retombe. C'est son verdict.
    const auDessus = possibles.find((k) => k > rangMax);
    if (auDessus !== undefined) {
      await hesiter(rangMax, auDessus);
      if (!passer) App.sons.relache();
    }
    if (!passer) {
      tampon(ORDRE_RARETE[rangMax]);
      if (paliers.length === 1) App.sons.rarete(rangMax);
      await pause(420 + rangMax * 100);
    }

    // 3. Les cartes s'abattent une à une.
    arreterFlux();
    echelle.hidden = true;
    const disp = disposition(ordre.length);
    table.style.setProperty("--dw", disp.dw + "px");
    table.style.setProperty("--h-table", disp.hauteur + "px");
    table.classList.toggle("etroite", disp.dw < 110);
    coffre.classList.add("recule");
    table.classList.add("cartes");
    await pause(380);
    const etat = { tirages: ordre, cartes: [], disp, combo: 0 };
    dernier = { n: ordre.length, cartes: etat.cartes };
    for (let i = 0; i < ordre.length; i++) {
      if (i === ordre.length - 1 && rangRarete(ordre[i].rarete) >= 3 && !passer) await vedette(etat, i);
      else await abattre(etat, i);
    }
    if (passer) {
      App.sons.rarete(rangMax);
      if (ordre.some((t) => t.nouveau)) App.sons.scintille();
      if (rangMax >= 3) tampon(ORDRE_RARETE[rangMax]);
    }
    table.classList.remove("invocation", "focus", "final");
    lueur(cMax, rangMax);

    // 4. Bilan, compteurs, historique, succès, et de quoi recommencer tout de suite.
    await rafraichi;
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
    const reste = stock(type);
    if (reste > 0) {
      btnEncore.replaceChildren(icone("i-coffre-ligne"), "Encore ×" + choix);
      resteEncore.textContent = "il t'en reste " + fmt(reste);
      encore.hidden = false;
      btnEncore.focus({ preventScroll: true });
      // Amène le bouton à l'écran en faisant défiler la PAGE (scrollIntoView ferait défiler la table elle-même).
      const bas = btnEncore.getBoundingClientRect().bottom, marge = innerWidth < 720 ? 190 : 24;
      if (bas > innerHeight - marge) scrollBy({ top: bas - innerHeight + marge, behavior: App.reduit ? "auto" : "smooth" });
    }
  }

  // Repositionne les cartes posées quand la largeur change.
  let minuterie;
  addEventListener("resize", () => {
    clearTimeout(minuterie);
    minuterie = setTimeout(() => {
      if (!dernier || enCours) { if (dernier) return; table.style.setProperty("--h-table", (table.clientWidth < 560 ? 340 : 420) + "px"); return; }
      const disp = disposition(dernier.n);
      table.style.setProperty("--dw", disp.dw + "px");
      table.style.setProperty("--h-table", disp.hauteur + "px");
      table.classList.toggle("etroite", disp.dw < 110);
      dernier.cartes.forEach((d, i) => { if (!d) return; d.style.transition = "none"; placer(d, disp.positions[i], disp.positions[i].r); });
    }, 120);
  });

  remettreCoffre();
  majSon();
  majTout();
  App.api.lootboxRaretes().then((l) => { taux = l || []; rendreTaux(); }).catch((e) => { console.warn(e); taux = false; rendreTaux(); });
});
})();
