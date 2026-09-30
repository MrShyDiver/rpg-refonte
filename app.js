/* =====================================================================
   Stream RPG — socle commun des pages connectées (app.js)
   Chargé par chaque page après supabase-js et formule-combat.js.
   Expose window.App : démarrage, coque de navigation, accès aux données,
   composants (carte, fiche objet, tiroir, toasts), sons, succès.
   ===================================================================== */
"use strict";
(function () {
const SUPABASE_URL = "https://jpmrgxezdzkvbkctwqlh.supabase.co";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpwbXJneGV6ZHprdmJrY3R3cWxoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA1MzkwMjksImV4cCI6MjEwNjExNTAyOX0.cLxYjrtd-vJgG-IMGa22JloSanUfIvfKOHAzEGRdeJo";
const DISCORD = "https://discord.gg/8kGKvxrxJJ";
const TWITCH_CHAINE = "https://www.twitch.tv/mrshydiver";

const RARETES = {
  commun: { nom: "Commun", lettre: "C", max: 25 },
  normal: { nom: "Normal", lettre: "N", max: 20 },
  rare: { nom: "Rare", lettre: "R", max: 15 },
  epique: { nom: "Épique", lettre: "É", max: 10 },
  legendaire: { nom: "Légendaire", lettre: "L", max: 5 },
};
const ORDRE_RARETE = ["commun", "normal", "rare", "epique", "legendaire"];
// Emplacement en base (items.slot) -> colonne du loadout, libellés.
const SLOTS = {
  weapon: { col: "arme", nom: "Arme", pluriel: "Armes" },
  offhand: { col: "offhand", nom: "Main gauche", pluriel: "Mains gauches" },
  torso: { col: "armure", nom: "Armure", pluriel: "Armures" },
  strategeme: { col: "strategeme", nom: "Stratagème", pluriel: "Stratagèmes" },
};
const STATS = { atk: "Attaque", def: "Défense", pv: "PV", spd: "Vitesse", luck: "Chance", esquive: "Esquive", crit: "Critique" };
const EFFETS = [
  ["sekiro", "Set Sekiro"], ["saignement", "Saignement"], ["stun", "Stun"], ["poison", "Poison"], ["brulure", "Brûlure"],
  ["parade", "Parade & riposte"], ["soin", "Soins"], ["renvoi", "Renvoi de dégâts"], ["bouclier", "Bouclier & blocage"],
  ["souffle", "Dernier souffle"], ["antisoin", "Anti-soin"], ["differe", "Frappe différée"], ["vol", "Vol de vie"],
  ["paralysie", "Paralysie"], ["stance", "Changement de forme"],
];

const PAGES = [
  { id: "lootbox", titre: "Lootbox", href: "lootbox.html", icone: "i-coffre-ligne", mobile: true },
  { id: "collection", titre: "Collection", href: "collection.html", icone: "i-cartes", mobile: true },
  { id: "arsenal", titre: "Arsenal", href: "arsenal.html", icone: "i-livre" },
  { id: "profil", titre: "Profil", href: "profil.html", icone: "i-profil", mobile: true },
  { id: "boutique", titre: "Boutique", href: "boutique.html", icone: "i-boutique" },
  { id: "duels", titre: "Duels", href: "duels.html", icone: "i-epees", mobile: true },
  { id: "succes", titre: "Succès", href: "succes.html", icone: "i-trophee" },
  { id: "classements", titre: "Classements", href: "classements.html", icone: "i-podium" },
];

const SYMBOLES = "<symbol id=\"i-twitch\" viewBox=\"0 0 24 24\"><path fill=\"currentColor\" d=\"M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714Z\"/></symbol><symbol id=\"i-live\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><circle cx=\"12\" cy=\"12\" r=\"2.2\" fill=\"currentColor\"/><path d=\"M8.2 15.8a5.4 5.4 0 0 1 0-7.6M15.8 8.2a5.4 5.4 0 0 1 0 7.6M5.4 18.6a9.3 9.3 0 0 1 0-13.2M18.6 5.4a9.3 9.3 0 0 1 0 13.2\"/></symbol><symbol id=\"i-boite\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><rect x=\"3.5\" y=\"9\" width=\"17\" height=\"11\" rx=\"1.5\"/><path d=\"M2.5 9h19V6.5A1.5 1.5 0 0 0 20 5H4a1.5 1.5 0 0 0-1.5 1.5zM12 5v15M12 5c-1.5-2.6-5-3-5-.6 0 1.2 1.6.9 5 .6zM12 5c1.5-2.6 5-3 5-.6 0 1.2-1.6.9-5 .6z\"/></symbol><symbol id=\"i-bouclier\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M12 2.8 4.5 5.6v6.1c0 4.6 3.1 8 7.5 9.5 4.4-1.5 7.5-4.9 7.5-9.5V5.6z\"/><path d=\"M12 7v10M8.2 11.2h7.6\"/></symbol><symbol id=\"i-epees\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M14.5 17.5 3 6V3h3l11.5 11.5M13 19l6-6M16 16l4 4M19 21l2-2M9.5 6.5 13 3h3v3l-3.5 3.5M5 14l4 4M7 17l-3 3M3 19l2 2\"/></symbol><symbol id=\"i-retour\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M20 12a8 8 0 1 1-2.3-5.6M20 4v4.5h-4.5\"/></symbol><symbol id=\"i-cle\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><rect x=\"4.5\" y=\"10.5\" width=\"15\" height=\"10\" rx=\"2\"/><path d=\"M8 10.5V7.5a4 4 0 0 1 8 0v3\"/></symbol><symbol id=\"i-etoile\" viewBox=\"0 0 24 24\" fill=\"currentColor\"><path d=\"M12 2.5l2.3 6.2 6.2 2.3-6.2 2.3L12 19.5l-2.3-6.2L3.5 11l6.2-2.3z\"/></symbol><symbol id=\"i-marque\" viewBox=\"0 0 40 40\"><rect x=\"9\" y=\"4\" width=\"22\" height=\"31\" rx=\"4.5\" fill=\"#2a1d4a\" stroke=\"#b777ff\" stroke-opacity=\".6\" transform=\"rotate(-10 20 20)\"/><rect x=\"10\" y=\"5.5\" width=\"22\" height=\"31\" rx=\"4.5\" fill=\"#15121f\" stroke=\"#ffc53d\" stroke-width=\"1.5\"/><g fill=\"#ffc53d\" shape-rendering=\"crispEdges\"><rect x=\"24\" y=\"10\" width=\"3\" height=\"3\"/><rect x=\"21\" y=\"13\" width=\"3\" height=\"3\"/><rect x=\"18\" y=\"16\" width=\"3\" height=\"3\"/><rect x=\"15\" y=\"19\" width=\"3\" height=\"3\"/><rect x=\"13\" y=\"22\" width=\"3\" height=\"3\" fill=\"#b777ff\"/><rect x=\"16\" y=\"25\" width=\"3\" height=\"3\" fill=\"#b777ff\"/><rect x=\"11\" y=\"20\" width=\"3\" height=\"3\" fill=\"#b777ff\"/><rect x=\"11\" y=\"27\" width=\"3\" height=\"3\" fill=\"#f4f2ec\"/></g></symbol><symbol id=\"i-coffre\" viewBox=\"0 0 32 26\" shape-rendering=\"crispEdges\"><rect class=\"cf-o\" x=\"3\" y=\"10\" width=\"26\" height=\"15\"/><rect class=\"cf-b\" x=\"4\" y=\"11\" width=\"24\" height=\"13\"/><rect class=\"cf-bc\" x=\"4\" y=\"11\" width=\"24\" height=\"1\"/><rect class=\"cf-bs\" x=\"4\" y=\"15\" width=\"24\" height=\"1\"/><rect class=\"cf-bs\" x=\"4\" y=\"19\" width=\"24\" height=\"1\"/><rect class=\"cf-bs\" x=\"4\" y=\"23\" width=\"24\" height=\"1\"/><rect class=\"cf-m\" x=\"7\" y=\"11\" width=\"3\" height=\"13\"/><rect class=\"cf-ms\" x=\"9\" y=\"11\" width=\"1\" height=\"13\"/><rect class=\"cf-m\" x=\"22\" y=\"11\" width=\"3\" height=\"13\"/><rect class=\"cf-ms\" x=\"24\" y=\"11\" width=\"1\" height=\"13\"/><rect class=\"cf-o\" x=\"4\" y=\"2\" width=\"24\" height=\"1\"/><rect class=\"cf-o\" x=\"3\" y=\"3\" width=\"26\" height=\"8\"/><rect class=\"cf-b\" x=\"4\" y=\"3\" width=\"24\" height=\"7\"/><rect class=\"cf-bc\" x=\"4\" y=\"3\" width=\"24\" height=\"2\"/><rect class=\"cf-bs\" x=\"4\" y=\"8\" width=\"24\" height=\"1\"/><rect class=\"cf-m\" x=\"7\" y=\"3\" width=\"3\" height=\"7\"/><rect class=\"cf-ms\" x=\"9\" y=\"3\" width=\"1\" height=\"7\"/><rect class=\"cf-m\" x=\"22\" y=\"3\" width=\"3\" height=\"7\"/><rect class=\"cf-ms\" x=\"24\" y=\"3\" width=\"1\" height=\"7\"/><rect class=\"cf-ms\" x=\"3\" y=\"10\" width=\"26\" height=\"1\"/><rect class=\"cf-o\" x=\"13\" y=\"8\" width=\"6\" height=\"9\"/><rect class=\"cf-s\" x=\"14\" y=\"9\" width=\"4\" height=\"1\"/><rect class=\"cf-s\" x=\"14\" y=\"12\" width=\"4\" height=\"4\"/><rect class=\"cf-o\" x=\"15.5\" y=\"13\" width=\"1\" height=\"2\"/></symbol>";
const ICONES = `
<symbol id="i-coffre-ligne" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M3.5 10h17v9.5H3.5zM3.5 10V8a4 4 0 0 1 4-4h9a4 4 0 0 1 4 4v2"/><path d="M10 10v3.5h4V10"/></symbol>
<symbol id="i-cartes" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><rect x="7.5" y="3.5" width="12" height="16" rx="2.2"/><path d="M4.5 7.2v11.3a2 2 0 0 0 2 2h9"/></symbol>
<symbol id="i-livre" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5M9 7.5h7M9 11h5"/></symbol>
<symbol id="i-profil" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 20.5c1.4-3.6 4.4-5.5 8-5.5s6.6 1.9 8 5.5"/></symbol>
<symbol id="i-boutique" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M4 9.5 5.5 4h13L20 9.5M4 9.5h16M4 9.5v10.5h16V9.5"/><path d="M9.5 20v-5.5h5V20"/></symbol>
<symbol id="i-trophee" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 4h10v5a5 5 0 0 1-10 0zM7 6H4v1.5A3.5 3.5 0 0 0 7.5 11M17 6h3v1.5A3.5 3.5 0 0 1 16.5 11M12 14v4M8 21h8M9 18h6"/></symbol>
<symbol id="i-podium" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M9 8h6v12H9zM3 13h6v7H3zM15 11h6v9h-6z"/><path d="M12 3.2l.8 1.6 1.7.2-1.3 1.2.3 1.7-1.5-.8-1.5.8.3-1.7-1.3-1.2 1.7-.2z" fill="currentColor"/></symbol>
<symbol id="i-reglages" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></symbol>
<symbol id="i-cloche" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20.5a2 2 0 0 0 4 0"/></symbol>
<symbol id="i-sortie" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4M10 16l-4-4 4-4M6 12h10"/></symbol>
<symbol id="i-medaille" viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linejoin="round"><path d="M8 2.5h3l1 4.5-3 1.5zM16 2.5h-3l-1 4.5 3 1.5z" fill="#5b8bd9" stroke="none"/><circle cx="12" cy="14.5" r="6.5" fill="#ffc53d"/><circle cx="12" cy="14.5" r="4" fill="none" stroke="#b8841f"/></symbol>
<symbol id="i-ticket" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M3.5 8a2 2 0 0 0 0 4v4.5h17V12a2 2 0 0 1 0-4V3.5h-17z" transform="translate(0 2)"/><path d="M14 6v12" stroke-dasharray="2 2.2"/></symbol>
<symbol id="i-recherche" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/></symbol>
<symbol id="i-fermer" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></symbol>
<symbol id="i-plus" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="5.5" cy="12" r="1.3" fill="currentColor"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/><circle cx="18.5" cy="12" r="1.3" fill="currentColor"/></symbol>
<symbol id="i-alerte" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 2.5 20h19zM12 10v4.5M12 17.5v.2"/></symbol>
<symbol id="i-coche" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5"/></symbol>
<symbol id="i-discord" viewBox="0 0 24 24"><path fill="currentColor" d="M20.3 4.4A19.6 19.6 0 0 0 15.4 3l-.6 1.3a18 18 0 0 0-5.6 0L8.6 3a19.6 19.6 0 0 0-4.9 1.4C.6 9 0 13.6.3 18.1A19.7 19.7 0 0 0 6.3 21l1.3-2a12.8 12.8 0 0 1-2-1l.5-.4a14 14 0 0 0 11.8 0l.5.4-2 1 1.3 2a19.6 19.6 0 0 0 6-2.9c.5-5.2-.8-9.8-3.4-13.7ZM8.7 15.3c-1.2 0-2.1-1.1-2.1-2.4s.9-2.4 2.1-2.4 2.2 1.1 2.1 2.4c0 1.3-.9 2.4-2.1 2.4Zm6.6 0c-1.2 0-2.1-1.1-2.1-2.4s.9-2.4 2.1-2.4 2.2 1.1 2.1 2.4c0 1.3-.9 2.4-2.1 2.4Z"/></symbol>
<symbol id="i-son" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18.2 6.5a7.5 7.5 0 0 1 0 11"/></symbol>
<symbol id="i-cadenas" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/></symbol>
<symbol id="i-fleche" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></symbol>
`;

// ---------------------------------------------------------------------
// Utilitaires
// ---------------------------------------------------------------------
const $ = (s, racine = document) => racine.querySelector(s);
const $$ = (s, racine = document) => [...racine.querySelectorAll(s)];
function el(tag, attrs = {}, ...enfants) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === "class") e.className = v;
    else if (k === "html") e.innerHTML = v;
    else if (k === "texte") e.textContent = v;
    else if (k.startsWith("on") && typeof v === "function") e.addEventListener(k.slice(2), v);
    else if (k === "style" && typeof v === "object") for (const [sk, sv] of Object.entries(v)) sk.startsWith("--") ? e.style.setProperty(sk, sv) : (e.style[sk] = sv);
    else e.setAttribute(k, v === true ? "" : v);
  }
  for (const c of enfants.flat()) if (c !== null && c !== undefined && c !== false) e.append(c.nodeType ? c : String(c));
  return e;
}
const icone = (id, cls) => { const s = document.createElementNS("http://www.w3.org/2000/svg", "svg"); s.setAttribute("aria-hidden", "true"); if (cls) s.setAttribute("class", cls); const u = document.createElementNS("http://www.w3.org/2000/svg", "use"); u.setAttribute("href", "#" + id); s.append(u); return s; };
const echapper = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmt = (n, dec = 0) => Number(n || 0).toLocaleString("fr-FR", { minimumFractionDigits: dec, maximumFractionDigits: dec });
const nombre = (v) => { const r = Math.round(v * 100) / 100; return r.toLocaleString("fr-FR", { maximumFractionDigits: 2 }); };
const date = (d, avecHeure = false) => d ? new Date(d).toLocaleDateString("fr-FR", avecHeure ? { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" } : { day: "numeric", month: "long", year: "numeric" }) : "—";
function ilYa(d) {
  const s = (Date.now() - new Date(d).getTime()) / 1000;
  if (s < 60) return "à l'instant";
  if (s < 3600) return "il y a " + Math.floor(s / 60) + " min";
  if (s < 86400) return "il y a " + Math.floor(s / 3600) + " h";
  if (s < 86400 * 30) return "il y a " + Math.floor(s / 86400) + " j";
  return date(d);
}
let reduit = matchMedia("(prefers-reduced-motion: reduce)").matches;
const attendre = (ms) => new Promise((r) => setTimeout(r, App.reduit ? Math.min(ms, 60) : ms));
const rangRarete = (r) => ORDRE_RARETE.indexOf(r);
const couleur = (r) => getComputedStyle(document.documentElement).getPropertyValue("--" + r).trim();

// Images : "gear/x.png" dans le catalogue, à côté des pages. L'aperçu peut les remplacer.
const App = {};
App.IMAGES = {};
// Dépôt de test (ou futur domaine) sans dossier gear/ : les images viennent de l'ancien site /rpg/.
// ponytail: dépend de /rpg/ sur le même domaine ; copier gear/ lors de la migration Cloudflare et vider ANCIEN_SITE.
const ANCIEN_SITE = "/rpg/";
const HORS_ANCIEN_SITE = !location.pathname.startsWith(ANCIEN_SITE);
App.image = (chemin) => App.IMAGES[chemin] || (chemin && HORS_ANCIEN_SITE && /^gear\//.test(chemin) ? ANCIEN_SITE + chemin : chemin) || "";

// ---------------------------------------------------------------------
// Accès aux données (remplaçable par demo.js pour l'aperçu)
// ---------------------------------------------------------------------
const COLONNES_JOUEUR = "id,twitch_user_id,twitch_login,display_name,avatar_url,atk_stacks,def_stacks,pv_stacks,spd_stacks,luck_stacks,lootbox,lootbox_legendaire,tickets,tickets_reset,credits_reset,medailles,medailles_duel,medailles_revente,points,victoires,defaites,egalites,serie_actuelle,serie_record,degats_infliges,degats_subis,plus_gros_coup,combat_details,cree_le,premiere_connexion,lootbox_ouvertes,lootbox_leg_ouvertes,achats_boutique,abonne_jusqu_au,abonne_tier,admin";
let sb = null;
function client() {
  if (!sb && window.supabase) sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON, { auth: { flowType: "pkce" } });
  return sb;
}
async function q(promesse) {
  const { data, error } = await promesse;
  if (error) throw new Error(error.message);
  return data;
}
App.api = {
  async session() { const c = client(); if (!c) return null; const { data } = await c.auth.getSession(); return data.session; },
  async deconnexion() { await client().auth.signOut(); },
  // Ma ligne via RPC : auth_user_id et donnees_import ne sont plus lisibles publiquement.
  moi: () => q(client().rpc("moi_joueur")).then((r) => (Array.isArray(r) ? r[0] : r) || null),
  joueur: (login) => q(client().from("players").select(COLONNES_JOUEUR).eq("twitch_login", String(login).toLowerCase()).maybeSingle()),
  exporterMesDonnees: () => App.rpc("exporter_mes_donnees"),
  joueurs: () => q(client().from("players").select("id,twitch_login,display_name,avatar_url,atk_stacks,def_stacks,pv_stacks,spd_stacks,luck_stacks,victoires,defaites,egalites,serie_actuelle,serie_record,degats_infliges,degats_subis,plus_gros_coup,points,medailles,combat_details,premiere_connexion,lootbox_ouvertes,lootbox_leg_ouvertes,cree_le").limit(2000)),
  objets: () => q(client().from("items").select("numero,nom,slot,rarete,set_nom,actif,data").order("numero")),
  inventaire: (pid) => q(client().from("inventory").select("item_numero,niveau,obtenu_le").eq("player_id", pid)),
  inventaires: () => q(client().from("inventory").select("player_id,item_numero,niveau").limit(20000)),
  loadout: (pid) => q(client().from("loadouts").select("*").eq("player_id", pid).maybeSingle()),
  loadouts: () => q(client().from("loadouts").select("*").limit(5000)),
  preferences: (pid) => q(client().from("preferences").select("*").eq("player_id", pid).maybeSingle()),
  grants: (pid) => q(client().from("grants").select("id,type,stat,quantite,source,cree_le").eq("player_id", pid).order("cree_le", { ascending: false }).limit(40)),
  duels: () => q(client().from("duels").select("id,joue_le,type,attaquant_login,defenseur_login,vainqueur_login,egalite,tranche,power_attaquant,power_defenseur,nb_rounds,replay").order("joue_le", { ascending: false }).limit(1000)),
  succes: () => q(client().from("succes").select("*").order("ordre")),
  succesJoueurs: (pid) => pid ? q(client().from("succes_joueurs").select("code,debloque_le").eq("player_id", pid)) : q(client().from("succes_joueurs").select("player_id,code,debloque_le").limit(20000)),
  vitrine: (pid) => q(client().from("vitrines").select("position,item_numero").eq("player_id", pid).order("position")),
  etal: () => q(client().rpc("etal_boutique")),
  prixBoutique: () => q(client().from("boutique_prix").select("*")),
  reglagesBoutique: () => q(client().from("boutique_reglages").select("*")),
  journal: (pid) => q(client().from("journal_boutique").select("*").eq("player_id", pid).order("cree_le", { ascending: false }).limit(30)),
  lootboxRaretes: () => q(client().from("lootbox_raretes").select("*")),
  lootboxSets: () => q(client().from("lootbox_sets").select("*")),
  // Replays des duels : fichiers statiques duels/<id>.json publiés par le snapshot GitHub.
  replay: async (fichier) => {
    if (!/^duels\/[\w-]+\.json$/.test(fichier || "")) throw new Error("Replay introuvable");
    let r = await fetch(fichier);
    if (!r.ok && !location.pathname.startsWith(ANCIEN_SITE)) r = await fetch(ANCIEN_SITE + fichier); // site de test : replays restés sur /rpg/
    if (!r.ok) throw new Error("Replay indisponible (" + r.status + ")");
    return r.json();
  },
  // Replay d'un duel, quelle que soit sa source : fichier statique (live) ou table duel_replays (site).
  async replayDuel(duel) {
    const f = duel && duel.replay && duel.replay.fichier;
    if (f) return App.api.replay(f);
    const l = await q(client().from("duel_replays").select("donnees").eq("duel_id", String(duel.id)).maybeSingle());
    if (!l || !l.donnees) throw new Error("Replay introuvable");
    return l.donnees;
  },
};
App.rpc = async (nom, args) => {
  const { data, error } = await client().rpc(nom, args || {});
  if (error) throw new Error(error.message);
  return data;
};
// Duel lancé depuis le site : calculé par l'Edge Function `duel` (jamais dans le navigateur).
App.lancerDuel = async ({ adversaire, mode = "classe" }) => {
  const session = await App.api.session();
  if (!session) throw new Error("Ta session a expiré : reconnecte-toi pour lancer un duel.");
  let r;
  try {
    r = await fetch(SUPABASE_URL + "/functions/v1/duel", { method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + session.access_token, apikey: SUPABASE_ANON },
      body: JSON.stringify({ adversaire, mode }) });
  } catch (e) { throw new Error("Le serveur de duel ne répond pas. Réessaie dans un instant."); }
  const json = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(json.erreur || "Le duel n'a pas pu être lancé (erreur " + r.status + ").");
  return json;
};
App.DISCORD = DISCORD;
// Miroir de enregistrer_duel (SQL) : ces comptes ne comptent ni au bilan ni aux stats.
App.HORS_CLASSEMENT = ["mrshydiver", "mikumosana"];
App.horsClassement = (j) => !!j && App.HORS_CLASSEMENT.includes(String(j.twitch_login || "").toLowerCase());
// Joueurs importés du stream le 28/09/2026 : cree_le est la date d'import, pas leur arrivée.
App.DATE_IMPORT = "2026-09-28";
App.estImporte = (j) => !!j && String(j.cree_le || "").slice(0, 10) <= App.DATE_IMPORT;
App.peutEntrainer = (j) => !!j && (j.admin === true || (j.abonne_jusqu_au && new Date(j.abonne_jusqu_au) > new Date()));
App.TWITCH_CHAINE = TWITCH_CHAINE;

// ---------------------------------------------------------------------
// Catalogue d'objets
// ---------------------------------------------------------------------
App.objets = [];
App.parNumero = new Map();
function preparerObjets(lignes) {
  App.objets = lignes.map((l) => {
    const d = l.data || {};
    return { numero: l.numero, nom: l.nom, slot: l.slot, rarete: l.rarete, set: l.set_nom || d.set || "", actif: l.actif !== false, data: { ...d, rarete: l.rarete }, image: d.image || "", contributeur: d.contributeur || "" };
  });
  App.parNumero = new Map(App.objets.map((o) => [o.numero, o]));
}
App.objet = (n) => App.parNumero.get(Number(n));
App.niveauMax = (r) => (RARETES[r] || RARETES.commun).max;

// Effets (filtres) d'un objet, déduits de ses données.
App.effetsDe = (o) => {
  const d = o.data, e = [];
  if (o.set === "Sekiro") e.push("sekiro");
  const modes = d.modesTir || [];
  if (d.saignementDegats > 0 || modes.some((m) => m.saignementDegats > 0)) e.push("saignement");
  if (d.etourdissementChance > 0 || d.riposteEtourdissementTousLesCoups > 0 || modes.some((m) => m.etourdissementChance > 0)) e.push("stun");
  if (d.poisonDegats > 0) e.push("poison");
  if (d.brulureDegats > 0 || d.bruleeReflectionDegats > 0) e.push("brulure");
  if (d.paradeChance > 0) e.push("parade");
  if (d.soinDirect > 0 || d.regeneration > 0) e.push("soin");
  if (d.reflection > 0 || d.bruleeReflectionDegats > 0) e.push("renvoi");
  if (d.shieldMontant > 0 || d.blocage > 0 || d.reductionDegatsTir > 0) e.push("bouclier");
  if (d.dernierSouffleActif) e.push("souffle");
  if (d.antiHealPourcentage > 0) e.push("antisoin");
  if (d.delaiTours > 0) e.push("differe");
  if (d.lifesteal > 0) e.push("vol");
  if (d.paralysieChance > 0) e.push("paralysie");
  if (d.dureeStance > 0) e.push("stance");
  return e;
};
App.EFFETS = EFFETS;

// Données de l'objet au niveau donné (formule-combat.js : appliquerAmelioration).
App.auNiveau = (o, niveau) => (typeof appliquerAmelioration === "function" && niveau > 0) ? appliquerAmelioration(o.data, niveau) : o.data;

function sousTitre(o) {
  if (o.slot === "weapon") return "Arme · " + (o.data.hand === "two_handed" ? "deux mains" : "une main");
  return SLOTS[o.slot] ? SLOTS[o.slot].nom : "";
}
// Fait marquant court affiché en pied de carte.
App.faitMarquant = (o, niveau = 0) => {
  const d = App.auNiveau(o, niveau);
  const p = App.passifs(o, niveau);
  if (o.slot === "weapon" && d.baseDegatsMax > 0) {
    const extra = p.length ? " · " + p[0].court : (d.coupsParUsage > 1 ? " · ×" + d.coupsParUsage : "");
    return nombre(d.baseDegatsMin) + "–" + nombre(d.baseDegatsMax) + " dégâts" + extra;
  }
  if (p.length) return p[0].court;
  const st = App.lignesStats(o, niveau)[0];
  return st ? st.valeur + " " + st.nom : sousTitre(o);
};

// ---------------------------------------------------------------------
// Description exhaustive d'un objet
// ---------------------------------------------------------------------
const signe = (v) => (v > 0 ? "+" : v < 0 ? "−" : "") + nombre(Math.abs(v));
App.lignesStats = (o, niveau = 0) => {
  const d = App.auNiveau(o, niveau), base = o.data, l = [];
  const ajout = (stat, v, inc) => { if (!stat || !v) return; l.push({ nom: STATS[stat] || stat, valeur: signe(v) + (stat === "esquive" ? " %" : ""), negatif: v < 0, parNiveau: inc || 0 }); };
  ajout(d.stat, d.bonus, base.increment);
  ajout(d.stat2, d.bonus2, base.increment2);
  ajout(d.stat3, d.bonus3, base.increment3);
  (d.statsExtra || []).forEach((s, i) => ajout(s.nom, s.bonus, (base.statsExtra[i] || {}).increment));
  return l;
};
App.scalingsDe = (d, stance2 = false) => {
  const s = [];
  const pre = stance2 ? "stance2" : "";
  const st1 = stance2 ? d.stance2Scaling1Stat : d.scaling1Stat, le1 = stance2 ? d.stance2Scaling1Lettre : d.scaling1Lettre;
  const st2 = stance2 ? d.stance2Scaling2Stat : d.scaling2Stat, le2 = stance2 ? d.stance2Scaling2Lettre : d.scaling2Lettre;
  if (st1) s.push({ stat: st1, lettre: le1 });
  if (st2) s.push({ stat: st2, lettre: le2 });
  ((stance2 ? d.stance2ScalingExtra : d.scalingExtra) || []).forEach((x) => x.stat && s.push({ stat: x.stat, lettre: x.lettre }));
  void pre;
  return s;
};
const pct = (v) => nombre(v) + " %";
const tours = (n) => n + " tour" + (n > 1 ? "s" : "");
// Chaque règle : champ déclencheur, texte long, texte court (carte).
const REGLES_PASSIFS = [
  ["lifesteal", (d) => [`<b>Vol de vie</b> : tu récupères ${pct(d.lifesteal)} des dégâts infligés.`, "Vol de vie " + pct(d.lifesteal)]],
  ["poisonDegats", (d) => [`<b>Poison</b> : ${nombre(d.poisonDegats)} dégâts de poison sur ${tours(d.poisonDuree || 1)}, qui ignorent la défense.`, "Poison " + nombre(d.poisonDegats)]],
  ["saignementDegats", (d) => [`<b>Saignement</b> : chaque coup ajoute ${nombre(d.saignementDegats)} dégâts à la banque de saignement (+${d.saignementStacksParCoup || 1} stack). À 20 stacks, la banque explose en dégâts bruts.`, "Saignement " + nombre(d.saignementDegats)]],
  ["saignementChanceParCoup", (d) => [`<b>Lame saignante</b> : ${pct(d.saignementChanceParCoup)} de chance par coup d'infliger un saignement.`, "Saignement " + pct(d.saignementChanceParCoup)]],
  ["brulureDegats", (d) => [`<b>Brûlure</b> : ${nombre(d.brulureDegats)} dégâts par tour pendant ${tours(d.brulureDuree || 1)}, en ignorant la défense (le bouclier l'absorbe).`, "Brûlure " + nombre(d.brulureDegats) + " × " + (d.brulureDuree || 1)]],
  ["etourdissementChance", (d) => [`<b>Étourdissement</b> : ${pct(d.etourdissementChance)} de chance d'étourdir la cible${d.etourdissementDureeTours > 1 ? " pendant " + tours(d.etourdissementDureeTours) : ""}.`, "Stun " + pct(d.etourdissementChance)]],
  ["paralysieChance", (d) => [`<b>Paralysie</b> : ${pct(d.paralysieChance)} de chance de paralyser la cible ${tours(d.paralysieDuree || 1)} : elle ne peut plus attaquer à l'arme.`, "Paralysie " + pct(d.paralysieChance)]],
  ["penetration", (d) => [`<b>Pénétration</b> : ignore ${pct(d.penetration)} de la défense adverse.`, "Pénétration " + pct(d.penetration)]],
  ["precision", (d) => [`<b>Précision</b> : +${pct(d.precision)} de chances de toucher.`, "Précision " + pct(d.precision)]],
  ["critBonus", (d) => [`<b>Critique</b> : +${pct(d.critBonus)} de chances de critique.`, "Crit " + pct(d.critBonus)]],
  ["executionBonus", (d) => [`<b>Exécution</b> : +${pct(d.executionBonus)} de dégâts contre une cible sous ${pct(d.executionSeuil)} de ses PV.`, "Exécution " + pct(d.executionBonus)]],
  ["paradeChance", (d) => [`<b>Parade</b> : ${pct(d.paradeChance)} de chance d'annuler un coup reçu et de riposter aussitôt.`, "Parade " + pct(d.paradeChance)]],
  ["blocage", (d) => [`<b>Blocage</b> : ${pct(d.blocage)} de chance de bloquer, ce qui réduit le coup de ${pct(d.blocageReduction || 0)}.`, "Blocage " + pct(d.blocage)]],
  ["reductionDegatsTir", (d) => [`<b>Pare-balles</b> : −${pct(d.reductionDegatsTir)} de dégâts subis des armes de tir.`, "−" + pct(d.reductionDegatsTir) + " tir"]],
  ["reflection", (d) => [`<b>Renvoi</b> : ${pct(d.reflection)} des dégâts subis sont renvoyés à l'attaquant.`, "Renvoi " + pct(d.reflection)]],
  ["resistanceCrit", (d) => [`<b>Anti-critique</b> : −${pct(d.resistanceCrit)} de chances de subir un coup critique.`, "Anti-crit " + pct(d.resistanceCrit)]],
  ["resistancePoison", (d) => [`<b>Antidote</b> : −${pct(d.resistancePoison)} de dégâts de poison subis.`, "Anti-poison " + pct(d.resistancePoison)]],
  ["resistanceFeu", (d) => [`<b>Ignifugé</b> : −${pct(d.resistanceFeu)} de dégâts de brûlure subis.`, "−" + pct(d.resistanceFeu) + " brûlure"]],
  ["regeneration", (d) => [`<b>Régénération</b> : rend ${pct(d.regeneration)} de tes PV max à chaque tour.`, "Régén " + pct(d.regeneration)]],
  ["soinDirect", (d) => [`<b>Soin</b> : rend ${nombre(d.soinDirect)} PV${d.usagesParCombat ? " (" + d.usagesParCombat + " utilisations, recharge " + tours(d.cooldownTours || 0) + ")" : ""}. Ne se déclenche que s'il te manque des PV.`, "Soin " + nombre(d.soinDirect) + " PV"]],
  ["amplificationSoinsPourcentage", (d) => [`<b>Soins renforcés</b> : +${pct(d.amplificationSoinsPourcentage)} sur les soins que tu te donnes.`, "Soins +" + pct(d.amplificationSoinsPourcentage)]],
  ["shieldMontant", (d) => [`<b>Bouclier</b> : ${nombre(d.shieldMontant)} points de bouclier qui absorbent les dégâts avant tes PV.`, "Bouclier " + nombre(d.shieldMontant)]],
  ["antiHealPourcentage", (d) => [`<b>Anti-soin</b> : −${pct(d.antiHealPourcentage)} de soins reçus par la cible pendant ${tours(d.antiHealDuree || 1)}.`, "Anti-soin " + pct(d.antiHealPourcentage)]],
  ["marqueDegatsPourcentage", (d) => [`<b>Marque</b> : la cible subit +${pct(d.marqueDegatsPourcentage)} de dégâts de toutes sources pendant ${tours(d.marqueDuree || 1)}.`, "Marque +" + pct(d.marqueDegatsPourcentage)]],
  ["rageBonusMax", (d) => [`<b>Rage</b> : jusqu'à +${pct(d.rageBonusMax)} de dégâts à mesure que tes PV descendent (maximum sous ${pct(d.rageSeuilMin || 0)}).`, "Rage +" + pct(d.rageBonusMax)]],
  ["tenaciteChance", (d) => [`<b>Ténacité</b> : ${pct(d.tenaciteChance)} de chance de résister à un étourdissement.`, "Ténacité " + pct(d.tenaciteChance)]],
  ["dernierSouffleActif", (d) => [`<b>Dernier souffle</b> : une fois par combat, tu survis au coup fatal${d.dernierSouffleFractionPv > 0 ? " et reviens à " + pct(d.dernierSouffleFractionPv * 100) + " de tes PV" : " avec 1 PV"}.`, "Dernier souffle"]],
  ["frenesieBonusSpd", (d) => [`<b>Frénésie</b> : chaque critique donne +${nombre(d.frenesieBonusSpd)} de vitesse pendant ${tours(d.frenesieDuree || 1)}.`, "Frénésie +" + nombre(d.frenesieBonusSpd)]],
  ["rechargeTousLesCoups", (d) => [`<b>Sacrifice</b> : tous les ${d.rechargeTousLesCoups} coups, recharge un stratagème ou un soin en sacrifiant ${pct(d.rechargeSacrificePourcentage || 0)} de tes PV actuels.`, "Recharge / " + d.rechargeTousLesCoups + " coups"]],
  ["reductionPvMaxPourcentage", (d) => [`<b>Érosion</b> : chaque coup retire ${pct(d.reductionPvMaxPourcentage)} des PV max adverses, jusqu'à la fin du combat.`, "−" + pct(d.reductionPvMaxPourcentage) + " PV max"]],
  ["autoDegatsPourcentageDesDegats", (d) => [`<b>Contrecoup</b> : tu subis ${pct(d.autoDegatsPourcentageDesDegats)} des dégâts que tu infliges.`, "Contrecoup " + pct(d.autoDegatsPourcentageDesDegats)]],
  ["esquiveParadeBuffPourcentage", (d) => [`<b>Envol</b> : +${pct(d.esquiveParadeBuffPourcentage)} d'esquive ou de parade pendant ${tours(d.esquiveParadeBuffDuree || 1)}.`, "Esquive/parade +" + pct(d.esquiveParadeBuffPourcentage)]],
  ["briseDefPoints", (d) => [`<b>Brise-défense</b> : −${nombre(d.briseDefPoints)} de défense adverse ${d.briseDefDuree >= 999 ? "jusqu'à la fin du combat" : "pendant " + tours(d.briseDefDuree || 1)}.`, "−" + nombre(d.briseDefPoints) + " DEF"]],
  ["bruleeReflectionDegats", (d) => [`<b>Chair ardente</b> : qui te frappe prend feu (${nombre(d.bruleeReflectionDegats)} dégâts, ${tours(d.bruleeReflectionDuree || 1)}).`, "Riposte de feu " + nombre(d.bruleeReflectionDegats)]],
  ["amplificationDegatsFeuPourcentage", (d) => [`<b>Brasier</b> : +${pct(d.amplificationDegatsFeuPourcentage)} sur tes dégâts de brûlure.`, "Feu +" + pct(d.amplificationDegatsFeuPourcentage)]],
  ["riposteEtourdissementTousLesCoups", (d) => [`<b>Contre-choc</b> : tous les ${d.riposteEtourdissementTousLesCoups} coups reçus, l'attaquant est étourdi à son prochain tour.`, "Contre-choc / " + d.riposteEtourdissementTousLesCoups]],
];
const CHAMP_DEPUIS_PASCAL = (p) => p ? p.charAt(0).toLowerCase() + p.slice(1) : "";
App.passifs = (o, niveau = 0) => {
  const d = App.auNiveau(o, niveau), base = o.data;
  const qui = new Map();
  if (base.statPrincipale) qui.set(CHAMP_DEPUIS_PASCAL(base.statPrincipale), base.incrementPassif || 0);
  (base.passifsExtra || []).forEach((p) => qui.set(CHAMP_DEPUIS_PASCAL(p.champ), p.incrementPassif || 0));
  const res = [];
  for (const [champ, f] of REGLES_PASSIFS) {
    const v = d[champ];
    if (!v) continue;
    if (champ === "soinDirect" && o.slot === "strategeme" && false) continue;
    const [long, court] = f(d);
    res.push({ champ, long, court, parNiveau: qui.get(champ) || 0, principal: qui.has(champ) });
  }
  return res.sort((a, b) => (b.principal - a.principal));
};
// Usage des stratagèmes / objets actifs.
App.usage = (o, niveau = 0) => {
  const d = App.auNiveau(o, niveau), l = [];
  if (o.slot === "strategeme" || d.usagesParCombat > 0) {
    if (d.usagesParCombat) l.push(["Utilisations par combat", d.usagesParCombat]);
    if (d.cooldownTours) l.push(["Recharge", tours(d.cooldownTours)]);
    if (d.degatsDirects) l.push(["Dégâts par coup", nombre(d.degatsDirects) + (d.coupsParUsage > 1 ? " × " + d.coupsParUsage + " coups" : "")]);
    if (d.delaiTours) l.push(["Impact", tours(d.delaiTours) + " après le lancement"]);
  }
  return l;
};
App.anim = (d) => ({ tir: "Tir à distance", slash: "Mêlée tranchante", smash: "Mêlée contondante", explosion: "Explosion", bombardement: "Bombardement" }[d.anim] || "");

// Fiche complète (DOM) : carte, identité, stats, dégâts, scalings, passifs, usage, niveaux.
App.fiche = (o, { niveau = 0, possede = null, curseur = true } = {}) => {
  const max = App.niveauMax(o.rarete);
  const racine = el("div", { class: "fiche" });
  const zoneCarte = el("div");
  const titre = el("div", { class: "fiche-titre" },
    el("h3", { texte: o.nom }),
    el("div", { class: "pilules" },
      el("span", { class: "pilule " + o.rarete, texte: RARETES[o.rarete].nom }),
      el("span", { class: "pilule", texte: sousTitre(o) }),
      o.set ? el("span", { class: "pilule", style: { "--c": "#e2483d" }, texte: "Set " + o.set }) : null,
      el("span", { class: "pilule", texte: "N°" + o.numero })),
    el("p", {}, App.anim(o.data) ? App.anim(o.data) + ". " : "", "Niveau maximum : ", el("b", { texte: String(max) }), " (", String(max), " doublons).",
      o.contributeur ? el("span", {}, " Imaginé par ", el("b", { texte: o.contributeur }), ".") : null),
    possede !== null ? el("p", {}, possede ? el("b", { texte: "Dans ta collection · niveau " + niveau + " / " + max }) : "Pas encore dans ta collection.") : null);
  const corps = el("div", { class: "fiche-details", style: { display: "grid", gap: "22px" } });
  racine.append(el("div", { class: "fiche-haut" }, zoneCarte, titre), corps);

  let niv = Math.min(niveau, max);
  function rendre() {
    zoneCarte.replaceChildren(App.carte(o, { niveau: niv }));
    const d = App.auNiveau(o, niv);
    const blocs = [];
    if (o.slot === "weapon" && d.baseDegatsMax > 0) {
      const l = [["Dégâts de base", nombre(d.baseDegatsMin) + "–" + nombre(d.baseDegatsMax), o.data.incrementBaseDegats]];
      if (d.coupsParUsage > 1) l.push(["Coups par attaque", d.coupsParUsage]);
      blocs.push(bloc("Dégâts", lignes(l)));
      const sc = App.scalingsDe(d);
      if (sc.length) blocs.push(bloc("Scaling", el("div", { class: "scalings" }, sc.map((s) => el("span", { class: "scaling" }, el("b", { texte: s.lettre || "–" }), STATS[s.stat] || s.stat)))));
    }
    const st = App.lignesStats(o, niv);
    if (st.length) blocs.push(bloc("Statistiques", lignes(st.map((s) => [s.nom, s.valeur, s.parNiveau, s.negatif]))));
    const us = App.usage(o, niv);
    if (us.length) blocs.push(bloc("Utilisation", lignes(us)));
    const pa = App.passifs(o, niv);
    if (pa.length) blocs.push(bloc("Effets", el("div", {}, pa.map((p) => el("div", { class: "passif", html: p.long + (p.parNiveau ? `<small>Monte de ${nombre(p.parNiveau)} par niveau</small>` : (p.principal ? "<small>Valeur fixe, ne monte pas avec les niveaux</small>" : "")) })))));
    if (d.dureeStance > 0) {
      const sc2 = App.scalingsDe(d, true);
      blocs.push(bloc("Deuxième forme", el("div", { class: "passif", html:
        `<b>Change de forme tous les ${tours(d.dureeStance)}</b>. En forme 2 : ${nombre(d.stance2BaseDegatsMin)}–${nombre(d.stance2BaseDegatsMax)} dégâts`
        + (d.stance2Stat ? `, ${STATS[d.stance2Stat] || d.stance2Stat} ${signe(d.stance2Bonus)}` : "")
        + (sc2.length ? `, scaling ${sc2.map((s) => (STATS[s.stat] || s.stat) + " " + s.lettre).join(", ")}` : "") + "." })));
    }
    if ((d.modesTir || []).length) {
      blocs.push(bloc("Modes de tir (en alternance)", el("div", {}, d.modesTir.map((m, i) => el("div", { class: "passif", html:
        `<b>Tir ${i + 1}</b> : ${m.coupsParUsage > 1 ? m.coupsParUsage + " flèches" : "1 flèche"} à ${nombre((m.multiplicateurDegats || 1) * 100)} % des dégâts`
        + (m.penetration ? `, perce ${pct(m.penetration)} de l'armure` : "")
        + (m.etourdissementChance ? `, ${pct(m.etourdissementChance)} d'étourdir` : "")
        + (m.saignementDegats ? `, saignement ${nombre(m.saignementDegats)}` : "") + "." })))));
    }
    corps.replaceChildren(...blocs);
  }
  function bloc(t, contenu) { return el("section", { class: "bloc-fiche" }, el("h4", { texte: t }), contenu); }
  function lignes(l) {
    return el("div", { class: "lignes" }, l.map(([n, v, inc, neg]) => el("div", { class: "ligne" }, el("span", { texte: n }),
      el("b", { class: neg ? "negatif" : null }, String(v), inc ? el("span", { class: "gain", texte: "+" + nombre(inc) + "/niv" }) : null))));
  }
  if (curseur && max > 0) {
    const out = el("output", { texte: "Niveau " + niv });
    const range = el("input", { type: "range", min: 0, max, value: niv, "aria-label": "Voir l'objet à un autre niveau",
      oninput: (e) => { niv = Number(e.target.value); out.textContent = niv >= max ? "Niveau max" : "Niveau " + niv; rendre(); } });
    racine.append(el("section", { class: "bloc-fiche" }, el("h4", { texte: "Aperçu par niveau" }), el("div", { class: "curseur-niveau" }, range, out)));
  }
  rendre();
  return racine;
};

// ---------------------------------------------------------------------
// Carte d'objet (même composant que la page d'accueil)
// ---------------------------------------------------------------------
App.carte = (o, { niveau = null, verrouille = false, equipe = false, fait = null } = {}) => {
  const r = RARETES[o.rarete];
  const c = el("div", { class: "carte " + o.rarete + (verrouille ? " verrouillee" : "") + (niveau !== null && niveau >= r.max ? " brillante" : ""), role: "img", "aria-label": o.nom + ", " + r.nom + (niveau ? ", niveau " + niveau : "") + (verrouille ? ", pas encore obtenu" : "") });
  c.innerHTML =
    '<div class="carte-haut"><span class="pastille-rarete">' + r.lettre + '</span><span class="numero">N°' + o.numero + "</span></div>" +
    '<div class="carte-art"><img src="' + echapper(App.image(o.image)) + '" alt="" loading="lazy" decoding="async"></div>' +
    '<div class="carte-texte"><div class="carte-nom">' + echapper(o.nom) + '</div><div class="carte-sous">' + echapper(sousTitre(o)) + '</div><div class="carte-fait">' + echapper(fait ?? App.faitMarquant(o, niveau || 0)) + "</div></div>";
  if (niveau !== null && niveau > 0) c.append(el("span", { class: "niveau-tag" + (niveau >= r.max ? " max" : ""), texte: niveau >= r.max ? "MAX" : "+" + niveau }));
  if (equipe) c.append(el("span", { class: "equipe-tag", texte: "ÉQUIPÉ" }));
  return c;
};

// ---------------------------------------------------------------------
// Tiroir, toasts
// ---------------------------------------------------------------------
let tiroirOuvert = null;
App.tiroir = ({ titre, contenu, pied = null, surFermeture = null }) => {
  App.fermerTiroir();
  const voile = el("div", { class: "voile", onclick: () => App.fermerTiroir() });
  const fermer = el("button", { class: "bouton-icone", "aria-label": "Fermer", onclick: () => App.fermerTiroir() }, icone("i-fermer"));
  const t = el("aside", { class: "tiroir", role: "dialog", "aria-modal": "true", "aria-label": titre },
    el("div", { class: "tiroir-tete" }, el("h2", { texte: titre }), fermer),
    el("div", { class: "tiroir-corps" }, contenu),
    pied ? el("div", { class: "tiroir-pied" }, pied) : null);
  document.body.append(voile, t);
  requestAnimationFrame(() => { voile.classList.add("ouvert"); t.classList.add("ouvert"); fermer.focus(); });
  const echap = (e) => { if (e.key === "Escape") App.fermerTiroir(); };
  document.addEventListener("keydown", echap);
  tiroirOuvert = { voile, t, echap, surFermeture, retour: document.activeElement };
  return t;
};
App.fermerTiroir = () => {
  if (!tiroirOuvert) return;
  const { voile, t, echap, surFermeture, retour } = tiroirOuvert;
  tiroirOuvert = null;
  document.removeEventListener("keydown", echap);
  voile.classList.remove("ouvert"); t.classList.remove("ouvert");
  setTimeout(() => { voile.remove(); t.remove(); }, 380);
  if (retour && retour.focus) retour.focus();
  if (surFermeture) surFermeture();
};
let pile = null;
App.toast = (texte, { type = "info", titre = null, icone: ic = null, duree = 4200 } = {}) => {
  if (!pile) { pile = el("div", { class: "pile-toasts", "aria-live": "polite" }); document.body.append(pile); }
  const t = el("div", { class: "toast" + (type === "erreur" ? " erreur" : type === "succes" ? " succes-toast" : "") },
    icone(ic || (type === "erreur" ? "i-alerte" : type === "succes" ? "i-trophee" : "i-coche")),
    el("div", {}, titre ? el("b", { texte: titre }) : null, el("span", { texte }))) ;
  pile.append(t);
  setTimeout(() => { t.style.transition = "opacity .3s"; t.style.opacity = "0"; setTimeout(() => t.remove(), 320); }, duree);
};
App.erreur = (e) => { console.error(e); App.toast(e && e.message ? e.message : String(e), { type: "erreur", duree: 6000 }); };

// ---------------------------------------------------------------------
// Sons (mêmes motifs que la page d'accueil)
// ---------------------------------------------------------------------
// ---------- Sons (Web Audio, aucun fichier requis) ----------
const SONS_FICHIERS = { commun: "", normal: "", rare: "", epique: "", legendaire: "" }; // chemins .mp3 optionnels, sinon synthèse
let actx = null, maitre = null, sonActif = true;
function demarrerAudio() {
  if (!sonActif) return;
  if (!actx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    actx = new AC();
    maitre = actx.createGain();
    maitre.gain.value = 0.5;
    maitre.connect(actx.createDynamicsCompressor()).connect(actx.destination);
  }
  if (actx.state === "suspended") actx.resume();
}
const audible = () => sonActif && actx;
function note(f, t0, duree, type = "triangle", vol = 0.16) {
  if (!audible()) return;
  const t = actx.currentTime + t0, o = actx.createOscillator(), g = actx.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t + duree);
  o.connect(g).connect(maitre);
  o.start(t); o.stop(t + duree + 0.05);
}
function bruit(duree) {
  const b = actx.createBuffer(1, Math.floor(actx.sampleRate * duree), actx.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const s = actx.createBufferSource(); s.buffer = b; return s;
}
// Grondement du coffre qui tremble ; renvoie la fonction qui l'arrête.
function grondement() {
  if (!audible()) return () => {};
  const s = bruit(2), f = actx.createBiquadFilter(), g = actx.createGain();
  s.loop = true; f.type = "lowpass"; f.frequency.value = 150;
  g.gain.setValueAtTime(0.0001, actx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.55, actx.currentTime + 0.25);
  s.connect(f).connect(g).connect(maitre); s.start();
  return () => {
    const t = actx.currentTime;
    g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(0.4, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12); s.stop(t + 0.15);
  };
}
// Un « tic » qui monte d'un cran à chaque palier de rareté franchi pendant le suspense.
function tic(palier) { note(196 * Math.pow(1.26, palier), 0, 0.12, "square", 0.06); note(98 * Math.pow(1.26, palier), 0, 0.22, "sine", 0.22); }
function explosion() {
  if (!audible()) return;
  const t = actx.currentTime, s = bruit(0.6), f = actx.createBiquadFilter(), g = actx.createGain();
  f.type = "bandpass"; f.frequency.setValueAtTime(2400, t); f.frequency.exponentialRampToValueAtTime(300, t + 0.5);
  g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
  s.connect(f).connect(g).connect(maitre); s.start(t);
  const o = actx.createOscillator(), go = actx.createGain();
  o.type = "sine"; o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.4);
  go.gain.setValueAtTime(0.6, t); go.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
  o.connect(go).connect(maitre); o.start(t); o.stop(t + 0.5);
}
// Motif de chaque rareté : [fréquence, départ, durée, forme, volume]
const MOTIFS = [
  [[523, 0, 0.16, "square", 0.05]],
  [[659, 0, 0.18], [880, 0.09, 0.28]],
  [[784, 0, 0.16], [988, 0.08, 0.16], [1175, 0.16, 0.45], [2349, 0.16, 0.5, "sine", 0.05]],
  [[523, 0, 0.14], [659, 0.07, 0.14], [784, 0.14, 0.14], [1047, 0.21, 0.7], [1568, 0.21, 0.8, "sine", 0.08], [2093, 0.36, 0.6, "sine", 0.05]],
  [[392, 0, 0.16, "sawtooth", 0.06], [523, 0.1, 0.16, "sawtooth", 0.06], [659, 0.2, 0.16, "sawtooth", 0.06],
   [784, 0.3, 1.4], [1047, 0.3, 1.4], [1319, 0.3, 1.4], [1568, 0.3, 1.5, "sine", 0.1],
   [2637, 0.55, 0.5, "sine", 0.05], [3136, 0.75, 0.5, "sine", 0.05], [2093, 0.95, 0.7, "sine", 0.05]],
];
function sonRarete(rang) {
  if (!sonActif) return;
  const fichier = SONS_FICHIERS[ORDRE_RARETE[rang]];
  if (fichier) { const a = new Audio(fichier); a.volume = 0.8; a.play().catch(() => {}); return; }
  MOTIFS[rang].forEach(([f, t, d, type, v]) => note(f, t, d, type || "triangle", v || 0.15));
}


App.sons = {
  demarrer: demarrerAudio, rarete: sonRarete, grondement, tic, explosion,
  get actif() { return sonActif; },
  set actif(v) { sonActif = !!v; },
};

// ---------------------------------------------------------------------
// Puissance (formule-combat.js, identique au calculateur)
// ---------------------------------------------------------------------
App.puissance = (joueur, niveaux, loadout) => {
  if (typeof simulerBuild !== "function") return 0;
  const brut = (n) => { const o = n ? App.objet(n) : null; return o ? { ...o.data, niveau: niveaux.get(n) || 0 } : null; };
  const stacks = { atk: joueur.atk_stacks || 0, def: joueur.def_stacks || 0, pv: joueur.pv_stacks || 0, spd: joueur.spd_stacks || 0, luck: joueur.luck_stacks || 0 };
  const lo = loadout || {};
  try { return simulerBuild(stacks, { arme: brut(lo.arme), offhand: brut(lo.offhand), torso: brut(lo.armure), strat: brut(lo.strategeme) }); }
  catch (e) { console.warn(e); return null; }
};

// ---------------------------------------------------------------------
// Succès : vérification après une action, annonce des nouveautés
// ---------------------------------------------------------------------
App.verifierSucces = async () => {
  try {
    const nouveaux = await App.rpc("verifier_succes");
    if (nouveaux && nouveaux.length && (!App.ctx.prefs || App.ctx.prefs.notif_succes !== false)) {
      nouveaux.forEach((s) => App.toast(s.titre, { type: "succes", titre: "Succès débloqué", duree: 6000 }));
      if (App.ctx.prefs && App.ctx.prefs.sons !== false) { App.sons.demarrer(); App.sons.rarete(s_palier(nouveaux)); }
    }
    return nouveaux || [];
  } catch (e) { console.warn(e); return []; }
};
const s_palier = (l) => Math.max(...l.map((s) => ({ bronze: 1, argent: 2, or: 3, legendaire: 4 }[s.palier] || 1)));

// ---------------------------------------------------------------------
// Coque : barre latérale, barre haute, barre d'onglets mobile, notifications
// ---------------------------------------------------------------------
function avatar(j, taille = 40) {
  const a = el("span", { class: "avatar", style: { width: taille + "px", height: taille + "px" } }, (j.display_name || "?").charAt(0).toUpperCase());
  if (j.avatar_url && /^https:\/\//.test(j.avatar_url)) {
    const im = new Image(); im.alt = ""; im.referrerPolicy = "no-referrer";
    im.onload = () => { a.textContent = ""; a.append(im); };
    im.src = j.avatar_url;
  }
  return a;
}
App.avatar = avatar;

function ressources(j) {
  const r = (href, ic, val, lib, aFaire) => el("a", { class: "ressource" + (aFaire ? " a-faire" : ""), href, title: lib, "aria-label": fmt(val) + " " + lib }, icone(ic), el("div", { "aria-hidden": "true" }, el("b", { texte: fmt(val) }), el("span", { texte: lib })));
  return [
    r("lootbox.html", "i-coffre-ligne", j.lootbox, "Lootbox", j.lootbox > 0),
    r("lootbox.html?type=legendaire", "i-etoile", j.lootbox_legendaire || 0, "Légendaires", (j.lootbox_legendaire || 0) > 0),
    r("boutique.html", "i-medaille", j.medailles, "Médailles"),
    r("duels.html", "i-ticket", j.tickets, "Tickets de duel"),
  ];
}
App.majRessources = () => {
  const j = App.ctx.joueur;
  $$("[data-ressources]").forEach((z) => z.replaceChildren(...ressources(j)));
  const b = $("[data-pastille-lootbox]");
  if (b) { const n = (j.lootbox || 0) + (j.lootbox_legendaire || 0); b.textContent = n; b.hidden = n === 0; }
};
App.rafraichirJoueur = async () => {
  const j = await App.api.moi();
  if (j) { App.ctx.joueur = j; App.majRessources(); }
  return App.ctx.joueur;
};
App.rafraichirCollection = async () => {
  const inv = await App.api.inventaire(App.ctx.joueur.id);
  App.ctx.inventaire = new Map(inv.map((l) => [l.item_numero, l]));
  App.ctx.loadout = (await App.api.loadout(App.ctx.joueur.id)) || {};
  return App.ctx.inventaire;
};
App.niveaux = () => new Map([...App.ctx.inventaire].map(([n, l]) => [n, l.niveau]));

// Pied de page commun (pages connectées et pages publiques comme l'aide).
function piedApp() {
  return el("footer", { class: "pied-app" },
    el("nav", { "aria-label": "Informations" },
      el("a", { href: "aide.html", texte: "Comment jouer" }), el("a", { href: "reglement.html", texte: "Règlement" }),
      el("a", { href: "confidentialite.html", texte: "Confidentialité" }), el("a", { href: "mentions-legales.html", texte: "Mentions légales" }),
      el("a", { href: DISCORD, rel: "noopener", texte: "Discord" })),
    el("p", { texte: "Stream RPG, projet de fan de la chaîne de MrShyDiver. Non affilié à Twitch, FromSoftware, Activision ni Arrowhead." }));
}
// Coque minimale pour un visiteur non connecté (page marquée publique, ex. l'aide).
function coquePublique() {
  document.body.replaceChildren();
  document.body.append(el("div", { html: `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>${SYMBOLES}${ICONES}</defs></svg>` }).firstChild);
  const main = el("main", { class: "contenu", id: "contenu", tabindex: "-1" });
  document.body.append(el("a", { class: "lien-evitement", href: "#contenu", texte: "Aller au contenu" }),
    el("header", { class: "barre-haute barre-publique" },
      el("a", { class: "marque", href: "jeu.html" }, icone("i-marque"), el("b", { texte: "Stream RPG" })),
      el("a", { class: "btn-principal", href: "jeu.html", texte: "Se connecter avec Twitch" })),
    main, piedApp());
  return main;
}

function coque(page) {
  const j = App.ctx.joueur;
  const lien = (p) => el("a", { href: p.href, "aria-current": p.id === page ? "page" : null }, icone(p.icone), p.titre,
    p.id === "lootbox" ? el("span", { class: "pastille", "data-pastille-lootbox": "" }) : null);
  const lateral = el("nav", { class: "lateral", "aria-label": "Navigation du jeu" },
    el("a", { class: "marque", href: "lootbox.html" }, icone("i-marque"), el("b", { texte: "Stream RPG" })),
    el("a", { class: "joueur-puce", href: "profil.html" }, avatar(j), el("div", { style: { minWidth: 0 } }, el("b", { texte: j.display_name }), el("span", { texte: "Voir mon profil" }))),
    el("div", { class: "ressources", "data-ressources": "" }),
    el("div", { class: "nav-principale" }, PAGES.map(lien)),
    el("div", { class: "nav-bas" },
      el("a", { href: "aide.html", "aria-current": page === "aide" ? "page" : null }, icone("i-livre"), "Comment jouer"),
      el("a", { href: "parametres.html", "aria-current": page === "parametres" ? "page" : null }, icone("i-reglages"), "Paramètres"),
      el("button", { type: "button", onclick: App.seDeconnecter }, icone("i-sortie"), "Se déconnecter")));

  const titrePage = (PAGES.find((p) => p.id === page) || { titre: page === "aide" ? "Comment jouer" : "Paramètres" }).titre;
  const cloche = el("button", { class: "bouton-icone", type: "button", "aria-label": "Notifications", "aria-expanded": "false", onclick: () => basculerNotifs(cloche) }, icone("i-cloche"));
  const haute = el("header", { class: "barre-haute" },
    el("a", { class: "marque marque-mobile", href: "lootbox.html", "aria-label": "Stream RPG" }, icone("i-marque"), el("b", { texte: "Stream RPG" })),
    el("div", { class: "fil" }, "Stream RPG / ", el("b", { texte: titrePage })),
    el("div", { class: "ressources-mobile", "data-ressources": "" }),
    el("div", { class: "outils" }, cloche));

  const main = el("main", { class: "contenu", id: "contenu", tabindex: "-1" }, el("div", { class: "chargement", texte: "Chargement…" }));
  const plus = el("div", { class: "feuille-plus", id: "feuille-plus" },
    PAGES.filter((p) => !p.mobile).map((p) => el("a", { href: p.href, "aria-current": p.id === page ? "page" : null }, icone(p.icone), p.titre)),
    el("a", { href: "aide.html", "aria-current": page === "aide" ? "page" : null }, icone("i-livre"), "Comment jouer"),
    el("a", { href: "parametres.html", "aria-current": page === "parametres" ? "page" : null }, icone("i-reglages"), "Paramètres"),
    el("div", { class: "legende-ressources" }, el("b", { texte: "Tes ressources" }), el("div", { "data-ressources": "" }),
      el("a", { href: "aide.html#lexique", texte: "À quoi servent-elles ?" })));
  const onglets = el("nav", { class: "barre-onglets", "aria-label": "Navigation principale" },
    PAGES.filter((p) => p.mobile).map((p) => el("a", { href: p.href, "aria-current": p.id === page ? "page" : null }, icone(p.icone), p.titre)),
    el("button", { type: "button", "aria-expanded": "false", onclick: (e) => { const o = plus.classList.toggle("ouverte"); e.currentTarget.setAttribute("aria-expanded", String(o)); } }, icone("i-plus"), "Plus"));

  const bandeau = App.DEMO ? el("div", { class: "bandeau-demo", texte: "Aperçu avec des données réelles figées : les actions sont simulées et rien n'est enregistré." }) : null;
  document.body.replaceChildren();
  document.body.append(el("div", { html: `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>${SYMBOLES}${ICONES}</defs></svg>` }).firstChild);
  if (bandeau) document.body.append(bandeau);
  const pied = piedApp();
  document.body.append(el("a", { class: "lien-evitement", href: "#contenu", texte: "Aller au contenu" }));
  document.body.append(el("div", { class: "coque" }, lateral, el("div", { class: "principal" }, haute, main, pied)), plus, onglets);
  App.majRessources();
  chargerNotifs(cloche);
  return main;
}

// Notifications : dons reçus depuis le live et succès débloqués.
let notifs = [];
async function chargerNotifs(cloche) {
  try {
    const p = App.ctx.prefs || {};
    const lues = new Date(p.notifications_lues_le || 0).getTime();
    const [dons, succes, catalogue, duels] = await Promise.all([App.api.grants(App.ctx.joueur.id), App.api.succesJoueurs(App.ctx.joueur.id), App.api.succes(), p.notif_duels !== false ? App.api.duels().catch(() => []) : []]);
    const titres = new Map(catalogue.map((s) => [s.code, s]));
    notifs = [];
    if (p.notif_lootbox !== false) dons.forEach((d) => notifs.push({ quand: d.cree_le, icone: d.type === "stat" ? "i-profil" : d.type === "lootbox_legendaire" ? "i-etoile" : "i-coffre-ligne",
      texte: d.type === "stat" ? `+${d.quantite} en ${STATS[d.stat] || d.stat}, gagné en live` : `${d.quantite} lootbox${d.type === "lootbox_legendaire" ? " légendaire" : ""}${d.quantite > 1 ? "s" : ""} reçue${d.quantite > 1 ? "s" : ""} depuis le live`, lien: d.type === "stat" ? "profil.html" : "lootbox.html" + (d.type === "lootbox_legendaire" ? "?type=legendaire" : "") }));
    if (p.notif_succes !== false) succes.forEach((s) => { const t = titres.get(s.code); if (t) notifs.push({ quand: s.debloque_le, icone: "i-trophee", texte: "Succès débloqué : " + t.titre, lien: "succes.html" }); });
    const moi = App.ctx.joueur.twitch_login;
    duels.filter((d) => d.attaquant_login === moi || d.defenseur_login === moi).slice(0, 10).forEach((d) => {
      const autre = d.attaquant_login === moi ? d.defenseur_login : d.attaquant_login;
      const res = d.egalite ? "Égalité" : d.vainqueur_login === moi ? "Victoire" : "Défaite";
      notifs.push({ quand: d.joue_le, icone: "i-epees", texte: `${res} en duel contre ${autre}`, lien: "combat.html?duel=" + encodeURIComponent(d.id) });
    });
    notifs.sort((a, b) => new Date(b.quand) - new Date(a.quand));
    notifs = notifs.slice(0, 25).map((n) => ({ ...n, nouvelle: new Date(n.quand).getTime() > lues }));
    if (notifs.some((n) => n.nouvelle)) cloche.append(el("span", { class: "point" }));
  } catch (e) { console.warn(e); }
}
function basculerNotifs(cloche) {
  const existant = $(".panneau-notifs");
  if (existant) { existant.remove(); cloche.setAttribute("aria-expanded", "false"); return; }
  const panneau = el("div", { class: "panneau-notifs", role: "dialog", "aria-label": "Notifications" },
    el("header", {}, "Notifications", el("a", { href: "parametres.html#notifications", texte: "Réglages" })),
    notifs.length ? notifs.map((n) => el("a", { class: "notif" + (n.nouvelle ? " nouvelle" : ""), href: n.lien, style: { textDecoration: "none" } }, icone(n.icone), el("div", {}, n.texte, el("time", { datetime: n.quand, texte: ilYa(n.quand) }))))
      : el("div", { class: "notif" }, "Rien de neuf pour l'instant. Les lootbox gagnées en live et tes succès apparaîtront ici."));
  cloche.parentElement.append(panneau);
  cloche.setAttribute("aria-expanded", "true");
  const point = cloche.querySelector(".point");
  if (point) { point.remove(); App.rpc("marquer_notifications_lues").catch(() => {}); }
  setTimeout(() => document.addEventListener("click", function f(e) { if (!panneau.contains(e.target) && e.target !== cloche) { panneau.remove(); cloche.setAttribute("aria-expanded", "false"); document.removeEventListener("click", f); } }), 0);
}

App.seDeconnecter = async () => {
  try { await App.api.deconnexion(); } catch (e) { console.warn(e); }
  location.replace("jeu.html");
};

// ---------------------------------------------------------------------
// Démarrage d'une page : App.demarrer("collection", async (main, ctx) => { ... })
// ---------------------------------------------------------------------
App.ctx = {};
App.demarrer = async (page, rendu, options = {}) => {
  // Anti-clickjacking : GitHub Pages ne permet pas l'en-tête frame-ancestors.
  if (window.top !== window.self) { document.body.textContent = "Stream RPG ne s'affiche pas dans une autre page. Ouvre-le directement dans ton navigateur."; return; }
  try {
    const session = await App.api.session();
    if (!session) {
      if (!options.public) { location.replace("jeu.html"); return; }
      preparerObjets(await App.api.objets());
      App.ctx = { session: null, joueur: null, inventaire: new Map(), loadout: {}, prefs: {} };
      await rendu(coquePublique(), App.ctx);
      return;
    }
    const [joueur, objets] = await Promise.all([App.api.moi(), App.api.objets()]);
    if (!joueur) {
      document.body.innerHTML = '<div class="vide" style="margin:40px auto;max-width:520px"><b>Ton compte Twitch n\'est pas encore rattaché.</b>Déconnecte-toi puis reconnecte-toi. Si le problème persiste, préviens MrShyDiver sur Discord.</div>';
      return;
    }
    preparerObjets(objets);
    const [inv, loadout, prefs] = await Promise.all([App.api.inventaire(joueur.id), App.api.loadout(joueur.id), App.api.preferences(joueur.id)]);
    App.ctx = { session, joueur, inventaire: new Map(inv.map((l) => [l.item_numero, l])), loadout: loadout || {}, prefs: prefs || { sons: true, notif_lootbox: true, notif_succes: true, notif_duels: true, notif_annonces: true } };
    App.sons.actif = App.ctx.prefs.sons !== false;
    if (App.ctx.prefs.effets_reduits) { reduit = true; App.reduit = true; }
    document.documentElement.classList.toggle("effets-reduits", reduit);
    const main = coque(page);
    main.replaceChildren();
    await rendu(main, App.ctx);
  } catch (e) {
    App.erreur(e);
    const m = $("#contenu");
    if (m) m.replaceChildren(el("div", { class: "vide" }, el("b", { texte: "La page n'a pas pu se charger." }), "Vérifie ta connexion puis recharge la page."));
  }
};

Object.assign(App, { $, $$, el, icone, echapper, fmt, nombre, date, ilYa, attendre, reduit, RARETES, ORDRE_RARETE, SLOTS, STATS, PAGES, rangRarete, couleur, sousTitre, client });
window.App = App;
})();
