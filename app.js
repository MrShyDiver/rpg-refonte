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
  { id: "profil", titre: "Profil", href: "profil.html", icone: "i-profil", mobile: true },
  { id: "lootbox", titre: "Lootbox", href: "lootbox.html", icone: "i-coffre-ligne", mobile: true },
  // Les fichiers gardent leur nom d'origine (collection.html, arsenal.html) : seuls les intitulés ont changé.
  { id: "collection", titre: "Inventaire", href: "collection.html", icone: "i-cartes", mobile: true },
  { id: "arsenal", titre: "Codex", href: "arsenal.html", icone: "i-livre" },
  { id: "boutique", titre: "Boutique", href: "boutique.html", icone: "i-boutique" },
  { id: "ligue", titre: "Ligue", href: "ligue.html", icone: "i-ligue", mobile: true },
  { id: "duels", titre: "Duels", href: "duels.html", icone: "i-epees" },
  { id: "tour", titre: "Tour", href: "tour.html", icone: "i-tour" },
  { id: "arene", titre: "Arène", href: "arene.html", icone: "i-arene" },
  { id: "quetes", titre: "Quêtes", href: "quetes.html", icone: "i-cible" },
  { id: "succes", titre: "Succès", href: "succes.html", icone: "i-trophee" },
  { id: "classements", titre: "Classements", href: "classements.html", icone: "i-podium" },
  { id: "patchnotes", titre: "Patchnotes", href: "patchnotes.html", icone: "i-journal" },
];

const SYMBOLES = "<symbol id=\"i-twitch\" viewBox=\"0 0 24 24\"><path fill=\"currentColor\" d=\"M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714Z\"/></symbol><symbol id=\"i-live\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><circle cx=\"12\" cy=\"12\" r=\"2.2\" fill=\"currentColor\"/><path d=\"M8.2 15.8a5.4 5.4 0 0 1 0-7.6M15.8 8.2a5.4 5.4 0 0 1 0 7.6M5.4 18.6a9.3 9.3 0 0 1 0-13.2M18.6 5.4a9.3 9.3 0 0 1 0 13.2\"/></symbol><symbol id=\"i-boite\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><rect x=\"3.5\" y=\"9\" width=\"17\" height=\"11\" rx=\"1.5\"/><path d=\"M2.5 9h19V6.5A1.5 1.5 0 0 0 20 5H4a1.5 1.5 0 0 0-1.5 1.5zM12 5v15M12 5c-1.5-2.6-5-3-5-.6 0 1.2 1.6.9 5 .6zM12 5c1.5-2.6 5-3 5-.6 0 1.2-1.6.9-5 .6z\"/></symbol><symbol id=\"i-bouclier\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M12 2.8 4.5 5.6v6.1c0 4.6 3.1 8 7.5 9.5 4.4-1.5 7.5-4.9 7.5-9.5V5.6z\"/><path d=\"M12 7v10M8.2 11.2h7.6\"/></symbol><symbol id=\"i-epees\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M14.5 17.5 3 6V3h3l11.5 11.5M13 19l6-6M16 16l4 4M19 21l2-2M9.5 6.5 13 3h3v3l-3.5 3.5M5 14l4 4M7 17l-3 3M3 19l2 2\"/></symbol><symbol id=\"i-retour\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M20 12a8 8 0 1 1-2.3-5.6M20 4v4.5h-4.5\"/></symbol><symbol id=\"i-cle\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><rect x=\"4.5\" y=\"10.5\" width=\"15\" height=\"10\" rx=\"2\"/><path d=\"M8 10.5V7.5a4 4 0 0 1 8 0v3\"/></symbol><symbol id=\"i-etoile\" viewBox=\"0 0 24 24\" fill=\"currentColor\"><path d=\"M12 2.5l2.3 6.2 6.2 2.3-6.2 2.3L12 19.5l-2.3-6.2L3.5 11l6.2-2.3z\"/></symbol><symbol id=\"i-marque\" viewBox=\"0 0 40 40\"><rect x=\"9\" y=\"4\" width=\"22\" height=\"31\" rx=\"4.5\" fill=\"#2a1d4a\" stroke=\"#b777ff\" stroke-opacity=\".6\" transform=\"rotate(-10 20 20)\"/><rect x=\"10\" y=\"5.5\" width=\"22\" height=\"31\" rx=\"4.5\" fill=\"#15121f\" stroke=\"#ffc53d\" stroke-width=\"1.5\"/><g fill=\"#ffc53d\" shape-rendering=\"crispEdges\"><rect x=\"24\" y=\"10\" width=\"3\" height=\"3\"/><rect x=\"21\" y=\"13\" width=\"3\" height=\"3\"/><rect x=\"18\" y=\"16\" width=\"3\" height=\"3\"/><rect x=\"15\" y=\"19\" width=\"3\" height=\"3\"/><rect x=\"13\" y=\"22\" width=\"3\" height=\"3\" fill=\"#b777ff\"/><rect x=\"16\" y=\"25\" width=\"3\" height=\"3\" fill=\"#b777ff\"/><rect x=\"11\" y=\"20\" width=\"3\" height=\"3\" fill=\"#b777ff\"/><rect x=\"11\" y=\"27\" width=\"3\" height=\"3\" fill=\"#f4f2ec\"/></g></symbol><symbol id=\"i-coffre\" viewBox=\"0 0 32 26\" shape-rendering=\"crispEdges\"><rect class=\"cf-o\" x=\"3\" y=\"10\" width=\"26\" height=\"15\"/><rect class=\"cf-b\" x=\"4\" y=\"11\" width=\"24\" height=\"13\"/><rect class=\"cf-bc\" x=\"4\" y=\"11\" width=\"24\" height=\"1\"/><rect class=\"cf-bs\" x=\"4\" y=\"15\" width=\"24\" height=\"1\"/><rect class=\"cf-bs\" x=\"4\" y=\"19\" width=\"24\" height=\"1\"/><rect class=\"cf-bs\" x=\"4\" y=\"23\" width=\"24\" height=\"1\"/><rect class=\"cf-m\" x=\"7\" y=\"11\" width=\"3\" height=\"13\"/><rect class=\"cf-ms\" x=\"9\" y=\"11\" width=\"1\" height=\"13\"/><rect class=\"cf-m\" x=\"22\" y=\"11\" width=\"3\" height=\"13\"/><rect class=\"cf-ms\" x=\"24\" y=\"11\" width=\"1\" height=\"13\"/><rect class=\"cf-o\" x=\"4\" y=\"2\" width=\"24\" height=\"1\"/><rect class=\"cf-o\" x=\"3\" y=\"3\" width=\"26\" height=\"8\"/><rect class=\"cf-b\" x=\"4\" y=\"3\" width=\"24\" height=\"7\"/><rect class=\"cf-bc\" x=\"4\" y=\"3\" width=\"24\" height=\"2\"/><rect class=\"cf-bs\" x=\"4\" y=\"8\" width=\"24\" height=\"1\"/><rect class=\"cf-m\" x=\"7\" y=\"3\" width=\"3\" height=\"7\"/><rect class=\"cf-ms\" x=\"9\" y=\"3\" width=\"1\" height=\"7\"/><rect class=\"cf-m\" x=\"22\" y=\"3\" width=\"3\" height=\"7\"/><rect class=\"cf-ms\" x=\"24\" y=\"3\" width=\"1\" height=\"7\"/><rect class=\"cf-ms\" x=\"3\" y=\"10\" width=\"26\" height=\"1\"/><rect class=\"cf-o\" x=\"13\" y=\"8\" width=\"6\" height=\"9\"/><rect class=\"cf-s\" x=\"14\" y=\"9\" width=\"4\" height=\"1\"/><rect class=\"cf-s\" x=\"14\" y=\"12\" width=\"4\" height=\"4\"/><rect class=\"cf-o\" x=\"15.5\" y=\"13\" width=\"1\" height=\"2\"/></symbol>";
const ICONES = `
<symbol id="i-ligue" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 4.5 6v5.5c0 4.4 3 7.9 7.5 9.5 4.5-1.6 7.5-5.1 7.5-9.5V6z"/><path d="m8.5 12.5 3.5-3 3.5 3M8.5 16l3.5-3 3.5 3"/></symbol>
<symbol id="i-eclair" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M13 2.5 5 13.5h6l-1 8 8-11h-6z"/></symbol>
<symbol id="i-bouclier" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M12 3 4.5 6v5.5c0 4.4 3 7.9 7.5 9.5 4.5-1.6 7.5-5.1 7.5-9.5V6z"/></symbol>
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
<symbol id="i-arene" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v16M5 7h14M5 7l-2.5 6a3 3 0 0 0 5 0zM19 7l-2.5 6a3 3 0 0 0 5 0zM8 20h8"/></symbol>
<symbol id="i-tour" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7.5 20.5V10L6 8.5V4h2.5v2h2V4h3v2h2V4H18v4.5L16.5 10v10.5zM5 20.5h14M10.5 20.5v-3.5a1.5 1.5 0 0 1 3 0v3.5"/></symbol>
<symbol id="i-cible" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r=".9" fill="currentColor"/></symbol>
<symbol id="i-journal" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3.5h8.5L18 7v13.5H6zM14.5 3.5V7H18M9 11.5h6M9 15h6"/></symbol>
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
const COLONNES_JOUEUR = "id,twitch_user_id,twitch_login,display_name,avatar_url,atk_stacks,def_stacks,pv_stacks,spd_stacks,luck_stacks,lootbox,lootbox_legendaire,tickets,tickets_reset,credits_reset,medailles,medailles_duel,medailles_revente,points,victoires,defaites,egalites,serie_actuelle,serie_record,degats_infliges,degats_subis,plus_gros_coup,combat_details,cree_le,premiere_connexion,lootbox_ouvertes,lootbox_leg_ouvertes,achats_boutique,admin,hors_classement";
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
  joueurs: () => q(client().from("players").select("id,twitch_login,display_name,avatar_url,atk_stacks,def_stacks,pv_stacks,spd_stacks,luck_stacks,victoires,defaites,egalites,serie_actuelle,serie_record,degats_infliges,degats_subis,plus_gros_coup,points,medailles,combat_details,premiere_connexion,lootbox_ouvertes,lootbox_leg_ouvertes,cree_le,hors_classement,puissance,puissance_perimee").limit(2000)),
  objets: () => q(client().from("items").select("numero,nom,slot,rarete,set_nom,actif,data").order("numero")),
  inventaire: (pid) => q(client().from("inventory").select("item_numero,niveau,obtenu_le").eq("player_id", pid)),
  inventaires: () => q(client().from("inventory").select("player_id,item_numero,niveau").limit(20000)),
  inventairesDe: (ids) => q(client().from("inventory").select("player_id,item_numero,niveau").in("player_id", ids).limit(5000)),
  loadout: (pid) => q(client().from("loadouts").select("*").eq("player_id", pid).maybeSingle()),
  loadouts: () => q(client().from("loadouts").select("*").limit(5000)),
  // Build de défense (ligue) : sans ligne, ou sans arme, c'est le build de combat qui défend.
  loadoutDefense: (pid) => q(client().from("loadouts_defense").select("*").eq("player_id", pid).maybeSingle()),
  loadoutsDefense: () => q(client().from("loadouts_defense").select("*").limit(5000)),
  // Ligue : mon état complet (énergie, trois adversaires proposés, défenses reçues) et les rangs publics de tous.
  ligue: () => App.rpc("ma_ligue"),
  // Profil : record d'arène, combats en solo et quêtes terminées d'un joueur (ce que les tables publiques ne montrent pas).
  profilModes: (pid) => App.rpc("profil_modes", { p_id: pid }),
  // Arène (mode solo, draft) : mon parcours (cartes proposées, build drafté, score, coffres).
  arene: () => App.rpc("mon_arene"),
  areneHistorique: (pid) => App.rpc("arene_historique", { p_id: pid }),
  // Tour (mode solo) : mon étage, mes tentatives et la liste des étages ; étages atteints par tous (classement).
  tour: () => App.rpc("ma_tour"),
  tours: () => q(client().from("tour").select("player_id,etage,franchi_le").limit(5000)),
  // Quêtes du jour et de la semaine, avec ma progression et le nombre de récompenses à prendre.
  quetes: () => App.rpc("mes_quetes"),
  rangsLigue: () => q(client().from("ligue").select("player_id,points,combats,victoires,defaites,def_victoires,def_defaites,serie,prime_le").limit(5000)),
  preferences: (pid) => q(client().from("preferences").select("*").eq("player_id", pid).maybeSingle()),
  grants: (pid) => q(client().from("grants").select("id,type,stat,quantite,source,cree_le").eq("player_id", pid).order("cree_le", { ascending: false }).limit(40)),
  duels: () => q(client().from("duels").select("id,joue_le,type,attaquant_login,defenseur_login,vainqueur_login,egalite,tranche,power_attaquant,power_defenseur,nb_rounds,replay,echo_de").order("joue_le", { ascending: false }).limit(1000)),
  succes: () => q(client().from("succes").select("*").order("ordre")),
  succesJoueurs: (pid) => pid ? q(client().from("succes_joueurs").select("code,debloque_le").eq("player_id", pid)) : q(client().from("succes_joueurs").select("player_id,code,debloque_le").limit(20000)),
  vitrine: (pid) => q(client().from("vitrines").select("position,item_numero").eq("player_id", pid).order("position")),
  etal: () => q(client().rpc("etal_boutique")),
  prixBoutique: () => q(client().from("boutique_prix").select("*")),
  reglagesBoutique: () => q(client().from("boutique_reglages").select("*")),
  journal: (pid) => q(client().from("journal_boutique").select("*").eq("player_id", pid).order("cree_le", { ascending: false }).limit(30)),
  lootboxRaretes: () => q(client().from("lootbox_raretes").select("*")),
  // Set du jour : { aujourdhui: "2026-10-02", semaine: [{ jour, set, multiplicateur } × 7] }, tirée chaque lundi par le serveur.
  rotationLootbox: () => App.rpc("rotation_lootbox"),
  trocsRecents: () => App.rpc("trocs_recents"),
  // Patchnotes publiés (lecture publique). La version courte sert à la cloche des notifications.
  patchnotes: () => q(client().from("patchnotes").select("id,version,titre,texte,objets,publie_le,corrige_le").order("publie_le", { ascending: false }).limit(50)),
  patchnotesRecents: () => q(client().from("patchnotes").select("id,version,titre,publie_le").order("publie_le", { ascending: false }).limit(5)),
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
// mode : "classe", "entrainement" ou "auto" (adversaire tiré au sort par le serveur). echo : affronter l'écho du joueur.
async function fonctionDuel(corps) {
  const session = await App.api.session();
  if (!session) throw new Error("Ta session a expiré : reconnecte-toi pour lancer un duel.");
  let r;
  try {
    r = await fetch(SUPABASE_URL + "/functions/v1/duel", { method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + session.access_token, apikey: SUPABASE_ANON },
      body: JSON.stringify(corps) });
  } catch (e) { throw new Error("Le serveur de duel ne répond pas. Réessaie dans un instant."); }
  const json = await r.json().catch(() => ({}));
  if (!r.ok) { const err = new Error(json.erreur || "Le duel n'a pas pu être lancé (erreur " + r.status + ")."); err.statut = r.status; throw err; }
  return json;
}
App.lancerDuel = ({ adversaire, mode = "classe", echo = false }) => fonctionDuel(mode === "auto" ? { mode } : { adversaire, mode, echo: !!echo });
// Combat de ligue contre l'un des trois adversaires proposés (0, 1 ou 2).
App.lancerLigue = (cible) => fonctionDuel({ action: "ligue", cible });
// Arène : jouer le combat suivant avec le build drafté (le draft lui-même passe par arene_commencer et arene_drafter).
App.lancerArene = () => fonctionDuel({ action: "arene" });
// Tour : affronter le gardien du prochain étage, ou seulement le voir (apercu) : { etage, gardien: { login, puissance, equipement } }.
App.lancerTour = (apercu) => fonctionDuel({ action: "tour", apercu: !!apercu });
// Duel ciblé : catégorie décidée par le serveur (chance de victoire estimée) et revanche gratuite éventuelle.
// Avec devoiler, un abonné dépense un dévoilement et reçoit aussi l'estimation en 5 niveaux.
App.estimerDuel = (adversaire, devoiler) => fonctionDuel({ action: "estimer", adversaire, devoiler: !!devoiler });
// Récompenses de l'attaquant selon la catégorie (miroir de enregistrer_combat) : [titre, explication, victoire, défaite].
App.CATEGORIES_DUEL = {
  au_dessus: ["Combat valeureux", "ton adversaire est favori", 20, 2],
  dans_tranche: ["Combat équitable", "le combat est ouvert", 12, 2],
  en_dessous: ["Combat déshonorable", "tu es nettement favori", 3, 1],
};
// Prime portée par un joueur en série de victoires de ligue (miroir de enregistrer_combat : 3 victoires, 2 médailles par victoire, 20 au plus).
// Une seule prime par cible et par jour (heure de Paris).
App.primeDe = (rang) => {
  if (!rang || (rang.serie || 0) < 3) return 0;
  const jour = new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris" }).format(new Date());
  return rang.prime_le === jour ? 0 : Math.min(20, 2 * rang.serie);
};
// Revanches gratuites : battu en duel ciblé depuis moins de 24 h, sans avoir encore répliqué. login adverse -> fin (ms).
App.revanches = (duels, moi) => {
  const m = new Map(), limite = Date.now() - 24 * 3600e3;
  for (const d of duels) {
    if (d.type !== "duel" || d.defenseur_login !== moi || d.egalite || d.vainqueur_login !== d.attaquant_login || (d.replay && d.replay.revanche)) continue;
    const t = new Date(d.joue_le).getTime();
    if (t < limite || m.has(d.attaquant_login)) continue;
    if (!duels.some((r) => r.type === "duel" && r.attaquant_login === moi && r.defenseur_login === d.attaquant_login && new Date(r.joue_le).getTime() > t)) m.set(d.attaquant_login, t + 24 * 3600e3);
  }
  return m;
};
// Rang de ligue : 6 paliers de 3 divisions (100 points chacune), puis Maître à 1 800 points.
const PALIERS_LIGUE = [["fer", "Fer"], ["bronze", "Bronze"], ["argent", "Argent"], ["or", "Or"], ["platine", "Platine"], ["diamant", "Diamant"]], DIVISIONS_LIGUE = ["III", "II", "I"];
App.rangLigue = (points) => {
  const p = Math.max(0, Math.floor(Number(points) || 0));
  if (p >= 1800) return { cle: "maitre", palier: "Maître", division: "", nom: "Maître", dansDivision: p - 1800, progression: 100, suivant: null, protege: false };
  const d = Math.floor(p / 100), nomDe = (x) => PALIERS_LIGUE[Math.floor(x / 3)][1] + " " + DIVISIONS_LIGUE[x % 3];
  return { cle: PALIERS_LIGUE[Math.floor(d / 3)][0], palier: PALIERS_LIGUE[Math.floor(d / 3)][1], division: DIVISIONS_LIGUE[d % 3], nom: nomDe(d),
    dansDivision: p % 100, progression: p % 100, suivant: d === 17 ? "Maître" : nomDe(d + 1), protege: p < 1200 };
};
// Durée courte et lisible : « 2 h 10 », « 12 min », « moins d'une minute ».
App.dureeCourte = (ms) => { const m = Math.ceil(ms / 60000); return m < 1 ? "moins d'une minute" : m < 60 ? m + " min" : Math.floor(m / 60) + " h" + (m % 60 ? " " + String(m % 60).padStart(2, "0") : ""); };
// Les puissances sont stockées en base ; le serveur recalcule celles dont le build a changé.
App.rafraichirPuissances = () => fonctionDuel({ action: "puissances" });
// Échos que le serveur sait ramener à ton niveau : [{ login, equipement: { arme: { numero, niveau } | null, … } }].
// Le calcul coûte ~1 s au serveur : la liste est gardée pour la session tant que ta puissance ne bouge pas.
App.echos = async (maPuissance) => {
  const cle = "echos-valides";
  try { const c = JSON.parse(sessionStorage.getItem(cle) || "null"); if (c && c.p === maPuissance) return c.echos; } catch (e) { /* navigation privée */ }
  const { echos } = await fonctionDuel({ action: "echos" });
  try { sessionStorage.setItem(cle, JSON.stringify({ p: maPuissance, echos })); } catch (e) { /* navigation privée */ }
  return echos;
};
// Tranche de puissance : ±30 %, comme le serveur (enregistrer_combat).
App.dansTranche = (puissance, moi) => puissance > 0 && moi > 0 && Math.abs(puissance - moi) / Math.max(1, moi) <= 0.30;
// Écho : build d'un autre joueur ramené à ton niveau. En base, son login est « echo:<login du joueur> ».
App.echoDe = (login) => (String(login || "").startsWith("echo:") ? String(login).slice(5) : null);
App.nomCombattant = (login, parLogin) => {
  if (login === "arene") return "Adversaire de l'Arène";   // build drafté par le serveur
  const source = App.echoDe(login), j = parLogin && parLogin.get(source || login);
  const nom = (j && j.display_name) || source || login || "?";
  return source ? "Écho de " + nom : nom;
};
App.DISCORD = DISCORD;
// Miroir de enregistrer_duel (SQL) : ces comptes ne comptent ni au bilan ni aux stats.
App.HORS_CLASSEMENT = ["mrshydiver", "mikumosana"];
App.horsClassement = (j) => !!j && (j.hors_classement === true || App.HORS_CLASSEMENT.includes(String(j.twitch_login || "").toLowerCase()));
// Classé = ni hors classement, ni compte qui n'a jamais joué (au moins un duel, une lootbox ou une connexion au site).
App.estClasse = (j) => !App.horsClassement(j) &&
  ((j.victoires || 0) + (j.defaites || 0) + (j.egalites || 0) + (j.lootbox_ouvertes || 0) > 0 || !!j.premiere_connexion);
App.deuxMains = (numero) => { const o = numero ? App.objet(numero) : null; return !!o && o.data && o.data.hand === "two_handed"; };
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
// Sets d'objets : une couleur chacun (hors des couleurs de rareté, sauf le doré des objets imaginés par la communauté).
const COULEURS_SETS = { "Sekiro": "#e2483d", "Helldivers": "#ff8a3d", "Elden Ring": "#7fd1b9", "Originaux": "#ff7eb6", "Objets forgés": "#ffc53d" };
App.couleurSet = (nom) => COULEURS_SETS[nom] || "#c9cbd6";
// Le set du jour dans une rotation (null si le planning n'a pas pu être lu).
App.setDuJour = (rotation) => (rotation && (rotation.semaine || []).find((j) => j.jour === rotation.aujourdhui)) || null;

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
  ["saignementDegats", (d) => [`<b>Saignement</b> : chaque coup ajoute ${nombre(d.saignementDegats)} dégâts à la banque de saignement (+${d.saignementStacksParCoup || 1} stack). À 5 stacks, la banque explose en dégâts bruts (ils ignorent défense et bouclier).`, "Saignement " + nombre(d.saignementDegats)]],
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
  ["soinDirect", (d) => [`<b>Soin</b> : rend ${nombre(d.soinDirect)} PV${d.soinDureeTours > 1 ? " en " + tours(d.soinDureeTours) + " (" + nombre(d.soinDirect / d.soinDureeTours) + " par tour)" : ""}${d.usagesParCombat ? " (" + d.usagesParCombat + " utilisations, recharge " + tours(d.cooldownTours || 0) + ")" : ""}. Prend ton tour. Se déclenche quand il te manque au moins ce montant, ou sous la moitié de tes PV.`, "Soin " + nombre(d.soinDirect) + " PV"]],
  ["amplificationSoinsPourcentage", (d) => [`<b>Soins renforcés</b> : +${pct(d.amplificationSoinsPourcentage)} sur tous les soins que tu reçois (soin actif, régénération, vol de vie).`, "Soins +" + pct(d.amplificationSoinsPourcentage)]],
  ["shieldMontant", (d) => [`<b>Bouclier</b> : ${nombre(d.shieldMontant)} points de bouclier qui absorbent les dégâts avant tes PV.`, "Bouclier " + nombre(d.shieldMontant)]],
  ["antiHealPourcentage", (d) => [`<b>Anti-soin</b> : −${pct(d.antiHealPourcentage)} de soins reçus par la cible pendant ${tours(d.antiHealDuree || 1)}.`, "Anti-soin " + pct(d.antiHealPourcentage)]],
  ["marqueDegatsPourcentage", (d) => [`<b>Marque</b> : la cible subit +${pct(d.marqueDegatsPourcentage)} de dégâts de toutes sources pendant ${tours(d.marqueDuree || 1)}.`, "Marque +" + pct(d.marqueDegatsPourcentage)]],
  ["rageBonusMax", (d) => [`<b>Rage</b> : jusqu'à +${pct(d.rageBonusMax)} de dégâts à mesure que tes PV descendent (maximum sous ${pct(d.rageSeuilMin || 0)}).`, "Rage +" + pct(d.rageBonusMax)]],
  ["tenaciteChance", (d) => [`<b>Ténacité</b> : ${pct(d.tenaciteChance)} de chance de résister à un étourdissement.`, "Ténacité " + pct(d.tenaciteChance)]],
  ["dernierSouffleActif", (d) => [`<b>Dernier souffle</b> : une fois par combat, tu survis au coup fatal${d.dernierSouffleFractionPv > 0 ? " et reviens à " + pct(d.dernierSouffleFractionPv * 100) + " de tes PV" : " avec 1 PV"}.`, "Dernier souffle"]],
  ["frenesieBonusSpd", (d) => [`<b>Frénésie</b> : chaque critique donne +${nombre(d.frenesieBonusSpd)} de vitesse pendant ${tours(d.frenesieDuree || 1)}.`, "Frénésie +" + nombre(d.frenesieBonusSpd)]],
  ["rechargeTousLesCoups", (d) => [`<b>Sacrifice</b> : tous les ${d.rechargeTousLesCoups} coups portés, sacrifie ${pct(d.rechargeSacrificePourcentage || 0)} de tes PV actuels pour rendre 1 charge à ton stratagème et à ta main gauche. Rien à recharger : pas de sacrifice.`, "Recharge / " + d.rechargeTousLesCoups + " coups"]],
  ["reductionPvMaxPourcentage", (d) => [`<b>Érosion</b> : chaque coup retire ${pct(d.reductionPvMaxPourcentage)} des PV max adverses, jusqu'à la fin du combat.`, "−" + pct(d.reductionPvMaxPourcentage) + " PV max"]],
  ["autoDegatsPourcentageDesDegats", (d) => [`<b>Contrecoup</b> : chaque coup porté te coûte ${pct(d.autoDegatsPourcentageDesDegats)} de tes PV actuels.`, "Contrecoup " + pct(d.autoDegatsPourcentageDesDegats)]],
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
      o.set ? el("span", { class: "pilule", style: { "--c": App.couleurSet(o.set) }, texte: "Set " + o.set }) : null,
      o.contributeur ? el("span", { class: "pilule auteur" }, "Imaginé par ", el("b", { texte: o.contributeur })) : null),
    el("p", {}, App.anim(o.data) ? App.anim(o.data) + ". " : "", "Améliorations max : ", el("b", { texte: "+" + max }), " (", String(max), " doublons).",
      o.contributeur ? el("span", { class: "fiche-auteur" }, " Un objet imaginé par ", el("b", { texte: o.contributeur }), ", membre de la communauté.") : null),
    possede !== null ? el("p", {}, possede ? el("b", { texte: "Dans ton inventaire · " + (niveau >= max ? "amélioration MAX" : "+" + niveau + " / +" + max) }) : "Pas encore dans ton inventaire.") : null);
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
    if (pa.length) blocs.push(bloc("Effets", el("div", {}, pa.map((p) => el("div", { class: "passif", html: p.long + (p.parNiveau ? `<small>Monte de ${nombre(p.parNiveau)} par amélioration</small>` : (p.principal ? "<small>Valeur fixe, ne monte pas avec les améliorations</small>" : "")) })))));
    if (d.dureeStance > 0) {
      const sc2 = App.scalingsDe(d, true);
      blocs.push(bloc("Deuxième forme", el("div", { class: "passif", html:
        `<b>Change de forme tous les ${tours(d.dureeStance)}</b>. En forme 2 : ${nombre(d.stance2BaseDegatsMin)}–${nombre(d.stance2BaseDegatsMax)} dégâts`
        + (d.stance2Stat ? `, ${STATS[d.stance2Stat] || d.stance2Stat} ${signe(d.stance2Bonus)}` : "")
        + (sc2.length ? `, scaling ${sc2.map((s) => (STATS[s.stat] || s.stat) + " " + s.lettre).join(", ")}` : "") + "."
        + "<br><b>Purge</b> : à chaque retour en première forme, le poison et la brûlure que tu subis sont effacés." })));
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
      el("b", { class: neg ? "negatif" : null }, String(v), inc ? el("span", { class: "gain", texte: "+" + nombre(inc) + " par amélioration" }) : null))));
  }
  if (curseur && max > 0) {
    const out = el("output", { texte: niv >= max ? "MAX" : "+" + niv });
    const range = el("input", { type: "range", min: 0, max, value: niv, "aria-label": "Voir l'objet avec plus ou moins d'améliorations",
      oninput: (e) => { niv = Number(e.target.value); out.textContent = niv >= max ? "MAX" : "+" + niv; rendre(); } });
    racine.append(el("section", { class: "bloc-fiche" }, el("h4", { texte: "Aperçu par amélioration" }), el("div", { class: "curseur-niveau" }, range, out)));
  }
  rendre();
  return racine;
};

// ---------------------------------------------------------------------
// Carte d'objet : rareté en toutes lettres (haut gauche), améliorations +N / MAX (haut droite,
// dès le premier doublon), image centrée, nom puis emplacement centrés, « Équipé » en bas à gauche.
// Sans niveau ni equipe fournis, ce sont ceux du joueur connecté ; les pages qui montrent les
// objets d'un autre joueur (profil, duel, combat) les passent explicitement.
// ---------------------------------------------------------------------
const EMPLACEMENTS_LOADOUT = ["arme", "offhand", "armure", "strategeme"];
App.carte = (o, { niveau = null, verrouille = false, equipe } = {}) => {
  const r = RARETES[o.rarete], ctx = App.ctx || {};
  const ligne = ctx.inventaire && ctx.inventaire.get(o.numero);
  const niv = verrouille ? 0 : Math.min(niveau !== null && niveau !== undefined ? niveau : ligne ? ligne.niveau || 0 : 0, r.max);
  const eq = !verrouille && (equipe !== undefined ? !!equipe : !!(ctx.loadout && EMPLACEMENTS_LOADOUT.some((k) => ctx.loadout[k] === o.numero)));
  const tag = niv >= r.max ? "MAX" : niv > 0 ? "+" + niv : "";
  const c = el("div", { class: "carte " + o.rarete + (verrouille ? " verrouillee" : "") + (niv >= r.max ? " brillante" : ""), role: "img",
    "aria-label": o.nom + ", " + r.nom + ", " + sousTitre(o) + (o.contributeur ? ", imaginé par " + o.contributeur : "") + (tag ? ", amélioration " + tag : "") + (eq ? ", équipé" : "") + (verrouille ? ", pas encore obtenu" : "") });
  c.innerHTML =
    '<div class="carte-haut"><span class="pastille-rarete">' + echapper(r.nom) + "</span>" + (tag ? '<span class="niveau-tag' + (niv >= r.max ? " max" : "") + '">' + tag + "</span>" : "") + "</div>" +
    '<div class="carte-art"><img src="' + echapper(App.image(o.image)) + '" alt="" loading="lazy" decoding="async"></div>' +
    '<div class="carte-texte"><div class="carte-nom">' + echapper(o.nom) + '</div><div class="carte-sous">' + echapper(sousTitre(o)) + "</div></div>" +
    // Objet imaginé par un membre de la communauté : son pseudo en doré, en pied de carte.
    (o.contributeur ? '<div class="carte-auteur">Imaginé par <b>' + echapper(o.contributeur) + "</b></div>" : "");
  if (o.contributeur) c.classList.add("forgee");
  if (eq) c.append(el("span", { class: "equipe-tag", texte: "Équipé" }));
  return c;
};

// ---------------------------------------------------------------------
// Arène : les derniers parcours d'un joueur (page Arène et profils). Une ligne par parcours :
// le score, le build drafté (un clic ouvre la fiche de l'objet) et les points de stats.
// ---------------------------------------------------------------------
App.ARENE_COLS = [["arme", "Arme"], ["armure", "Armure"], ["offhand", "Main gauche"], ["strategeme", "Stratagème"]];
// [clé, abrégé, nom, valeur de base, valeur d'un point]
App.ARENE_STATS = [["atk", "Atq", "Attaque", 10, 1], ["def", "Déf", "Défense", 10, 1], ["pv", "PV", "PV", 100, 10], ["spd", "Vit", "Vitesse", 10, 1], ["luck", "Chc", "Chance", 0, 1]];
App.vueParcoursArene = (liste, maxVictoires = 10) => el("ol", { class: "ap-liste" }, liste.map((p) => {
  const eq = (p.kit || {}).equipement || {}, st = (p.kit || {}).stacks || {};
  return el("li", { class: "ap-ligne" + (p.victoires >= maxVictoires ? " parfait" : "") },
    el("div", { class: "ap-score" },
      el("b", { class: "num", "aria-hidden": "true" }, el("span", { class: "v", texte: fmt(p.victoires) }), " – ", el("span", { class: "d", texte: fmt(p.defaites) })),
      el("small", { "aria-hidden": "true", texte: "victoires – défaites" }),
      el("span", { class: "sr", texte: `${p.victoires} victoire${p.victoires > 1 ? "s" : ""}, ${p.defaites} défaite${p.defaites > 1 ? "s" : ""}` }),
      p.termine ? el("time", { datetime: p.le, title: date(p.le, true), texte: ilYa(p.le) }) : el("span", { class: "pilule normal", texte: "En cours" })),
    el("div", { class: "ap-build" }, App.ARENE_COLS.map(([c, lib]) => {
      const x = eq[c], o = x ? App.objet(x.numero) : null, niveau = o ? Math.min(x.niveau, App.niveauMax(o.rarete)) : 0;
      return o ? el("button", { type: "button", class: "ap-objet", title: o.nom, "aria-label": `${lib} : ${o.nom}. Voir la fiche`,
          onclick: () => App.tiroir({ titre: o.nom, contenu: App.fiche(o, { niveau, possede: null }) }) }, App.carte(o, { niveau, equipe: false }))
        : el("div", { class: "ap-vide" }, el("span", { texte: lib }), el("small", { texte: c === "offhand" && App.deuxMains((eq.arme || {}).numero) ? "Deux mains" : "Vide" }));
    })),
    el("ul", { class: "ap-stats", "aria-label": "Points de stats du build" }, App.ARENE_STATS.map(([k, lib, nom, , pas]) =>
      el("li", { title: nom }, el("b", { class: "num", texte: "+" + fmt((st[k] || 0) * pas) }), el("span", { texte: lib })))));
}));

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
// Sons de la lootbox, des succès et de la boutique (mêmes motifs que la page d'accueil).
// Chaque son est généré, sauf si un fichier le remplace : sons/lootbox/<nom>.mp3, à condition
// que <nom> figure dans sons/lootbox/liste.json (ex. ["explosion", "rarete-legendaire"]).
// Noms : tension (boucle pendant que le coffre tremble), tic, battement, explosion, explosion-<rareté>,
// rarete-<rareté>, envol, retournement, combo, nouveau, amelioration, max, piece.
// Rareté : commun, normal, rare, epique, legendaire. tic, combo et amelioration montent d'un cran
// à chaque appel (vitesse de lecture) : un seul fichier suffit.
// ---------------------------------------------------------------------
let actx = null, maitre = null, echo = null, sonActif = true, remplacementsLb = null;
const tamponsLb = new Map(); // nom -> AudioBuffer | null (absent ou illisible)
function demarrerAudio() {
  if (!sonActif) return;
  if (!actx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    actx = new AC();
    const comp = actx.createDynamicsCompressor();
    comp.connect(actx.destination);
    maitre = actx.createGain();
    maitre.gain.value = 0.5;
    maitre.connect(comp);
    // Réverbération générée (bruit qui s'éteint) : donne de l'ampleur aux grosses révélations.
    const rev = actx.createConvolver(), n = Math.floor(actx.sampleRate * 1.8), ir = actx.createBuffer(2, n, actx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3); }
    rev.buffer = ir;
    echo = actx.createGain();
    echo.gain.value = 0.3;
    echo.connect(rev).connect(comp);
    chargerSonsLootbox();
  }
  if (actx.state === "suspended") actx.resume();
}
function chargerSonsLootbox() {
  if (remplacementsLb || App.DEMO) return;
  remplacementsLb = new Set();
  // Deux dossiers, même principe : sons/lootbox/ (clé = nom) et sons/arene/ (clé = « arene/nom »).
  for (const [dossier, prefixe] of [["lootbox", ""], ["arene", "arene/"]]) {
    fetch("sons/" + dossier + "/liste.json").then((r) => (r.ok ? r.json() : [])).then((l) => {
      (Array.isArray(l) ? l : []).map(String).filter((n) => /^[\w-]+$/.test(n)).forEach((n) => {
        remplacementsLb.add(prefixe + n);
        fetch("sons/" + dossier + "/" + n + ".mp3").then((r) => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
          .then((o) => actx.decodeAudioData(o)).then((b) => tamponsLb.set(prefixe + n, b)).catch(() => tamponsLb.set(prefixe + n, null));
      });
    }).catch(() => {});
  }
}
// Joue le fichier qui remplace <nom> s'il est prêt ; renvoie la fonction d'arrêt, ou null (synthèse).
function fichierLb(noms, { vitesse = 1, vol = 1, boucle = false, t0 = 0 } = {}) {
  if (!audible()) return null;
  const nom = noms.find((n) => tamponsLb.get(n));
  if (!nom) return null;
  const t = actx.currentTime + t0, s = actx.createBufferSource(), g = actx.createGain();
  s.buffer = tamponsLb.get(nom); s.loop = boucle; s.playbackRate.value = vitesse;
  g.gain.value = vol;
  s.connect(g).connect(maitre); s.start(t);
  return () => { const t2 = actx.currentTime; g.gain.setValueAtTime(g.gain.value, t2); g.gain.linearRampToValueAtTime(0, t2 + 0.12); s.stop(t2 + 0.15); };
}
const audible = () => sonActif && actx;
function note(f, t0, duree, type = "triangle", vol = 0.16, reverb = 0) {
  if (!audible()) return;
  const t = actx.currentTime + t0, o = actx.createOscillator(), g = actx.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t + duree);
  o.connect(g).connect(maitre);
  if (reverb) { const s = actx.createGain(); s.gain.value = reverb; g.connect(s).connect(echo); }
  o.start(t); o.stop(t + duree + 0.05);
}
function bruit(duree) {
  const b = actx.createBuffer(1, Math.floor(actx.sampleRate * duree), actx.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const s = actx.createBufferSource(); s.buffer = b; return s;
}
// Bruit filtré qui balaie une bande : souffle d'explosion, envol des cartes, claquement.
function souffle(de, a, duree, vol, type = "bandpass", t0 = 0) {
  if (!audible()) return;
  const t = actx.currentTime + t0, s = bruit(duree), f = actx.createBiquadFilter(), g = actx.createGain();
  f.type = type; f.Q.value = 1.2;
  f.frequency.setValueAtTime(de, t); f.frequency.exponentialRampToValueAtTime(a, t + duree);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + duree * 0.3);
  g.gain.exponentialRampToValueAtTime(0.0001, t + duree);
  s.connect(f).connect(g).connect(maitre); s.start(t); s.stop(t + duree + 0.05);
}
// Sinus qui chute : battement de cœur, basse de l'explosion.
function coup(f0, f1, t0, duree, vol) {
  if (!audible()) return;
  const t = actx.currentTime + t0, o = actx.createOscillator(), g = actx.createGain();
  o.type = "sine"; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + duree);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + duree);
  o.connect(g).connect(maitre); o.start(t); o.stop(t + duree + 0.05);
}
// Grondement + montée pendant que le coffre tremble ; renvoie la fonction qui coupe tout.
function tension(duree = 2) {
  if (!audible()) return () => {};
  const f = fichierLb(["tension"], { boucle: true });
  if (f) return f;
  const t = actx.currentTime, s = bruit(2), fl = actx.createBiquadFilter(), g = actx.createGain();
  s.loop = true; fl.type = "lowpass"; fl.frequency.value = 150;
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.5, t + 0.25);
  s.connect(fl).connect(g).connect(maitre); s.start(t);
  const o = actx.createOscillator(), fo = actx.createBiquadFilter(), go = actx.createGain();
  o.type = "sawtooth"; o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(380, t + duree);
  fo.type = "lowpass"; fo.frequency.setValueAtTime(300, t); fo.frequency.exponentialRampToValueAtTime(3400, t + duree);
  go.gain.setValueAtTime(0.0001, t); go.gain.exponentialRampToValueAtTime(0.08, t + duree);
  o.connect(fo).connect(go).connect(maitre); o.start(t);
  return () => {
    const t2 = actx.currentTime;
    [g, go].forEach((x) => { x.gain.cancelScheduledValues(t2); x.gain.setValueAtTime(Math.max(x.gain.value, 0.0001), t2); x.gain.exponentialRampToValueAtTime(0.0001, t2 + 0.08); });
    s.stop(t2 + 0.1); o.stop(t2 + 0.1);
  };
}
// Un « tic » qui monte d'un cran à chaque palier de rareté franchi pendant le suspense.
function tic(palier) {
  if (fichierLb(["tic"], { vitesse: Math.pow(1.12, palier) })) return;
  note(196 * Math.pow(1.26, palier), 0, 0.12, "square", 0.06); note(98 * Math.pow(1.26, palier), 0, 0.22, "sine", 0.22);
}
function battement() { if (fichierLb(["battement"])) return; coup(75, 38, 0, 0.18, 0.7); coup(70, 36, 0.2, 0.18, 0.5); }
function explosion(rang = 0) {
  if (fichierLb(["explosion-" + ORDRE_RARETE[rang], "explosion"])) return;
  souffle(2600, 260, 0.5 + rang * 0.12, 0.5);
  coup(130, 38, 0, 0.45 + rang * 0.1, 0.6);
  if (rang >= 3) coup(55, 26, 0.02, 1.2, 0.55);
}
function envol(t0 = 0) { if (fichierLb(["envol"], { t0, vol: 0.6 })) return; souffle(700, 3200, 0.2, 0.1, "bandpass", t0); }
function retournement() { if (fichierLb(["retournement"])) return; souffle(5000, 2500, 0.05, 0.22, "highpass"); }
// Chaque carte retournée sonne un cran plus haut que la précédente (gamme pentatonique).
const PENTA = [0, 2, 4, 7, 9];
function combo(i) {
  const demi = PENTA[i % 5] + 12 * Math.floor(i / 5);
  if (fichierLb(["combo"], { vitesse: Math.pow(2, Math.min(demi, 24) / 12) })) return;
  note(523.25 * Math.pow(2, demi / 12), 0, 0.24, "triangle", 0.08, 0.2);
}
// Invocation : le coffre qu'on relâche trop tôt, le faisceau qui part, une carte qui s'abat.
function relache() { if (fichierLb(["relache"])) return; souffle(1800, 200, 0.28, 0.22, "lowpass"); coup(180, 60, 0, 0.25, 0.3); }
function faisceau() { if (fichierLb(["faisceau"])) return; souffle(300, 5200, 0.55, 0.4); note(110, 0, 1.1, "sawtooth", 0.05, 0.4); }
function impact(rang = 0) {
  if (fichierLb(["impact-" + ORDRE_RARETE[rang], "impact"], { vitesse: 1 - rang * 0.06 })) return;
  coup(170 - rang * 18, 42, 0, 0.14 + rang * 0.05, 0.55); souffle(1400, 300, 0.09, 0.18, "lowpass");
}
// Musique de l'ouverture : un extrait par palier de rareté, puis une conclusion, puis plus rien (les cartes
// n'ont que leurs bruitages).
//   - « musique-<rareté> » : l'extrait du palier (environ 3 s, joué une fois ; le palier dure le temps de l'extrait) ;
//   - « conclusion-<rareté> » : la fin, jouée pour la meilleure rareté du tirage.
// Sans fichier, la musique est générée : une boucle qui gagne une couche à chaque palier (basse, arpège,
// contretemps et charleston, grosse caisse et mélodie, puis accords un ton plus haut) et accélère ;
// la conclusion générée est le motif de la rareté suivi d'un accord posé.
const ACCORDS = [[0, 4, 7], [7, 11, 14], [9, 12, 16], [5, 9, 12]]; // Do, Sol, La mineur, Fa (demi-tons depuis Do)
function musique() {
  let rang = 0, pas = 0, minuterie = 0, fichier = null, fini = false;
  const hz = (demi, octave) => 261.63 * Math.pow(2, demi / 12 + octave);
  const jouer = () => {
    if (fini) return;
    const acc = ACCORDS[Math.floor(pas / 8) % 4], k = pas % 8, ton = rang >= 4 ? 2 : 0;
    const n = (i, o) => hz(acc[((i % 3) + 3) % 3] + ton, o + Math.floor(i / 3));
    if (!fichier && audible()) {
      if (k % 4 === 0) note(n(0, -2), 0, 0.34, "triangle", 0.17);
      if (rang >= 1 && k % 2 === 0) note(n(k / 2, 0), 0, 0.2, "triangle", 0.07, 0.15);
      if (rang >= 2) { if (k % 2) note(n((k + 1) / 2 + 1, 0), 0, 0.14, "triangle", 0.05, 0.15); souffle(9000, 7000, 0.035, k % 2 ? 0.05 : 0.025, "highpass"); }
      if (rang >= 3) { if (k % 4 === 0) coup(120, 45, 0, 0.16, 0.5); if (k % 2 === 0) note(n(k / 2 + 1, 1), 0, 0.22, "square", 0.035, 0.35); }
      if (rang >= 4) {
        if (k === 0) acc.forEach((d) => note(hz(d + ton, 0), 0, 0.5, "sawtooth", 0.035, 0.4));
        if (k === 2 || k === 6) souffle(2600, 900, 0.11, 0.2);
        note(n(k, 1), 0, 0.12, "square", 0.03, 0.4);
      }
    }
    pas++;
    minuterie = setTimeout(jouer, 60000 / (116 + rang * 12) / 2);
  };
  jouer();
  const couper = () => { if (fichier) { fichier(); fichier = null; } };
  const duree = (nom) => { const b = tamponsLb.get(nom); return b ? b.duration * 1000 : 0; };
  return {
    // Renvoie la durée de l'extrait en ms (0 : pas de fichier, musique générée).
    palier(r) {
      rang = r;
      couper();
      const nom = "musique-" + ORDRE_RARETE[r];
      fichier = fichierLb([nom], { vol: 0.9 });
      return fichier ? duree(nom) : 0;
    },
    // Fin de la musique sur la conclusion de la rareté obtenue. Renvoie sa durée en ms (0 : générée).
    conclure(r) {
      if (fini) return 0;
      fini = true;
      clearTimeout(minuterie);
      couper();
      const nom = "conclusion-" + ORDRE_RARETE[r];
      if (fichierLb([nom], { vol: 0.9 })) return duree(nom);
      sonRarete(r);
      if (audible()) [0, 4, 7, 12].forEach((d, i) => note(hz(d + (r >= 4 ? 2 : 0), 0), 0.35 + i * 0.03, 0.9, "triangle", 0.06, 0.4));
      return 0;
    },
    // Coupe net, sans conclusion (Passer, erreur).
    arreter() {
      if (fini) return;
      fini = true;
      clearTimeout(minuterie);
      couper();
    },
  };
}
// Bruitage d'une carte qui se retourne, par rareté : « carte-<rareté> ». Renvoie false s'il n'y a pas de fichier.
function carte(rang) { return !!fichierLb(["carte-" + ORDRE_RARETE[rang]]); }
function scintille() { if (fichierLb(["nouveau"])) return; [1568, 1976, 2349, 2637, 3136].forEach((f, i) => note(f, i * 0.045, 0.32, "sine", 0.06, 0.5)); }
function cloche(niveau) {
  if (fichierLb(["amelioration"], { vitesse: Math.pow(2, Math.min(niveau, 24) / 24) })) return;
  const f = 660 * Math.pow(2, Math.min(niveau, 24) / 24); note(f, 0, 0.7, "sine", 0.11, 0.3); note(f * 2.76, 0, 0.25, "sine", 0.03, 0.3);
}
function accordMax() { if (fichierLb(["max"])) return; [784, 988, 1175, 1568].forEach((f, i) => note(f, i * 0.035, 1, "triangle", 0.07, 0.45)); }
function tinte() { if (fichierLb(["piece"], { vitesse: 0.9 + Math.random() * 0.3, vol: 0.5 })) return; note(2200 + Math.random() * 1400, 0, 0.12, "triangle", 0.035, 0.25); }
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
const REVERB = [0, 0.1, 0.3, 0.45, 0.6];
function sonRarete(rang) {
  if (!sonActif) return;
  if (fichierLb(["rarete-" + ORDRE_RARETE[rang]])) return;
  MOTIFS[rang].forEach(([f, t, d, type, v]) => note(f, t, d, type || "triangle", v || 0.15, REVERB[rang]));
}

// Sons de l'Arène (draft, coffres de récompense). Le fichier sons/arene/<nom>.mp3 est joué s'il figure dans
// sons/arene/liste.json ; sinon, un son généré le remplace. Noms et consignes : sons/arene/LISEZMOI.md.
const SONS_ARENE = {
  "coffre-pose": () => { coup(140, 50, 0, 0.16, 0.45); souffle(900, 200, 0.12, 0.12, "lowpass"); },
  "coffre-secousse": () => { for (let i = 0; i < 6; i++) souffle(2600, 1300, 0.05, 0.16, "bandpass", i * 0.06); },
  "coffre-ouverture": () => { relache(); souffle(400, 6000, 0.45, 0.3); },
  "recompense-medailles": () => { for (let i = 0; i < 7; i++) setTimeout(tinte, i * 70); },
  "recompense-lootbox": () => sonRarete(2),
  "recompense-legendaire": () => sonRarete(4),
  "recompense-ticket": () => scintille(),
  "bilan": () => accordMax(),
  "draft-fini": () => sonRarete(3),
};
// Carte choisie pendant le draft, un son par rareté (« carte-commun » … « carte-legendaire ») : le bruit de la carte, puis le motif de sa rareté.
ORDRE_RARETE.forEach((r, i) => { SONS_ARENE["carte-" + r] = () => { retournement(); if (i) sonRarete(i); }; });
function sonArene(nom, options) {
  if (!audible() || fichierLb(["arene/" + nom], options)) return;
  const genere = SONS_ARENE[nom]; if (genere) genere();
}

App.sons = {
  arene: sonArene,
  demarrer: demarrerAudio, rarete: sonRarete, grondement: () => tension(2), tension, tic, battement, explosion,
  envol, relache, faisceau, impact, musique, carte, retournement, combo, scintille, cloche, accordMax, tinte,
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

// Heure du prochain gain passif (« lootbox » ou « tickets »), ou null si la réserve est pleine.
// Réserve entamée depuis la dernière lecture (lootbox ouverte, ticket dépensé) : le compte à rebours repart d'ici, comme sur le serveur.
App.prochainPassif = (j, quoi) => {
  const pas = j.passif, c = quoi === "lootbox" ? "lootbox_prochaine" : "ticket_prochain";
  if (!pas || !pas.plafond) return null;
  if ((j[quoi] || 0) >= pas.plafond) return null;
  if (!pas[c]) pas[c] = new Date(Date.now() + pas.intervalle_s * 1000).toISOString();
  return pas[c];
};
function ressources(j) {
  // Réserves qui se rechargent (quoi = « lootbox » ou « tickets ») : « 3/10 » et le chrono du prochain +1.
  // Au-delà du plafond, la réserve ne se recharge plus : le nombre seul. Le nom n'est affiché que dans la légende du menu « Plus ».
  const r = (href, ic, val, lib, aFaire, quoi) => {
    const plafond = quoi && j.passif ? j.passif.plafond : 0, surPlafond = plafond && (val || 0) <= plafond, prochain = quoi ? App.prochainPassif(j, quoi) : null;
    return el("a", { class: "ressource" + (aFaire ? " a-faire" : ""), href, title: lib + (surPlafond ? ` : ${fmt(val)} sur ${fmt(plafond)}` : ""), "aria-label": fmt(val) + " " + lib + (surPlafond ? " sur " + fmt(plafond) : "") }, icone(ic),
      el("div", { "aria-hidden": "true" }, el("b", { texte: fmt(val) + (surPlafond ? "/" + fmt(plafond) : "") }), el("span", { texte: lib }),
        prochain ? el("small", { class: "prochain", "data-chrono": prochain, texte: App.chrono(new Date(prochain) - Date.now()) }) : null));
  };
  return [
    r("lootbox.html", "i-coffre-ligne", j.lootbox, "Lootbox", j.lootbox > 0, "lootbox"),
    r("lootbox.html?type=legendaire", "i-etoile", j.lootbox_legendaire || 0, "Lootbox légendaires", (j.lootbox_legendaire || 0) > 0),
    r("boutique.html", "i-medaille", j.medailles, "Médailles"),
    r("duels.html", "i-ticket", j.tickets, "Tickets de duel", false, "tickets"),
  ];
}
// À l'échéance d'un chrono de recharge, on recharge le joueur (le serveur crédite à la lecture) puis la page est prévenue.
let rechargePassif = 0;
function relevePassif() {
  if (Date.now() - rechargePassif < 20000 || !App.ctx || !App.ctx.joueur || App.DEMO) return;
  rechargePassif = Date.now();
  App.rafraichirJoueur().then(() => document.dispatchEvent(new CustomEvent("rpg:passif"))).catch(() => {});
}
// Chrono qui défile, à la seconde : tout élément [data-chrono] porte l'heure visée et affiche « 4:12:33 » (ou « 12:33 » sous une heure).
App.chrono = (ms) => {
  const s = Math.max(0, Math.ceil(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), p = (n) => String(n).padStart(2, "0");
  return (h ? h + ":" + p(m) : m) + ":" + p(s % 60);
};
App.majChronos = () => {
  let echu = false;
  $$("[data-chrono]").forEach((z) => {
    const reste = new Date(z.dataset.chrono).getTime() - Date.now();
    if (!(reste > 0)) echu = true;
    z.textContent = App.chrono(reste);
  });
  if (echu) relevePassif();
};
setInterval(() => App.majChronos(), 1000);
App.majRessources = () => {
  const j = App.ctx.joueur;
  $$("[data-ressources]").forEach((z) => z.replaceChildren(...ressources(j)));
  const b = $("[data-pastille-lootbox]");
  if (b) { const n = (j.lootbox || 0) + (j.lootbox_legendaire || 0); b.textContent = n; b.hidden = n === 0; }
  $$("[data-reserve]").forEach(remplirReserve);
  App.majChronos();
};
// Encart « réserve » des pages Lootbox et Duels : ce qu'il reste, et le chrono du prochain gain passif.
const RESERVES = { lootbox: ["i-coffre-ligne", "lootbox à ouvrir", "lootbox à ouvrir", "Prochaine lootbox dans"], tickets: ["i-ticket", "ticket de duel", "tickets de duel", "Prochain ticket dans"] };
function remplirReserve(z) {
  const quoi = z.dataset.reserve, j = App.ctx.joueur, [ic, un, plusieurs, lib] = RESERVES[quoi], n = j[quoi] || 0, pas = j.passif || {};
  const prochain = App.prochainPassif(j, quoi), parJour = pas.intervalle_s ? Math.round(86400 / pas.intervalle_s) : 5, plafond = pas.plafond || 10;
  z.classList.toggle("vide", n < 1);
  z.replaceChildren(
    el("div", { class: "er-compte" }, icone(ic), el("b", { class: "num", texte: fmt(n) }), el("span", { texte: n > 1 ? plusieurs : un })),
    el("div", { class: "er-chrono" }, prochain
      ? [el("span", { texte: lib }), el("b", { class: "num", role: "timer", "data-chrono": prochain, texte: App.chrono(new Date(prochain) - Date.now()) })]
      : [el("span", { texte: "Réserve pleine" }), el("b", { texte: "Chrono à l'arrêt" })]),
    el("p", { class: "er-note" }, prochain ? `${parJour} par jour sans rien faire, jusqu'à ${plafond} en réserve. ` : `À ${plafond} ou plus, la réserve ne se remplit plus toute seule : dépense-en pour relancer le chrono. `,
      el("a", { class: "lien", href: App.TWITCH_CHAINE, target: "_blank", rel: "noopener", texte: "Le live en donne d'autres" }), "."));
}
App.encartReserve = (quoi) => { const z = el("div", { class: "encart-reserve", "data-reserve": quoi }); remplirReserve(z); return z; };
// Emblème de rang de ligue : même forme pour tous, la couleur dit le palier.
App.emblemeLigue = (rang, taille = 56) => el("span", { class: "lg-embleme " + rang.cle, style: { width: taille + "px", height: taille + "px" }, title: rang.nom, "aria-hidden": "true" }, icone("i-ligue"));
// Récompenses de quête à prendre : pastille du menu.
App.majPastilleQuetes = (n) => { const b = $("[data-pastille-quetes]"); if (b) { b.textContent = n || ""; b.hidden = !n; } };
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

// Recette : réservée à MrShyDiver. Le lien n'apparaît que pour lui ; le vrai verrou est côté serveur (private.recetteurs).
App.estRecetteur = (j) => !!j && j.admin === true && j.twitch_login === "mrshydiver";

function coque(page) {
  const j = App.ctx.joueur;
  const lienRecette = App.estRecetteur(j) ? el("a", { href: "recette.html", "aria-current": page === "recette" ? "page" : null }, icone("i-cle"), "Recette") : null;
  const lienSimulateur = App.estRecetteur(j) ? el("a", { href: "simulateur.html", "aria-current": page === "simulateur" ? "page" : null }, icone("i-podium"), "Simulateur") : null;
  const lienAtelier = App.estRecetteur(j) ? el("a", { href: "atelier.html", "aria-current": page === "atelier" ? "page" : null }, icone("i-journal"), "Atelier patchnote") : null;
  const lien = (p) => el("a", { href: p.href, "aria-current": p.id === page ? "page" : null }, icone(p.icone), p.titre,
    p.id === "lootbox" ? el("span", { class: "pastille", "data-pastille-lootbox": "" })
      : p.id === "quetes" ? el("span", { class: "pastille", "data-pastille-quetes": "", hidden: true }) : null);
  const lateral = el("nav", { class: "lateral", "aria-label": "Navigation du jeu" },
    el("a", { class: "marque", href: "lootbox.html" }, icone("i-marque"), el("b", { texte: "Stream RPG" })),
    el("a", { class: "joueur-puce", href: "profil.html" }, avatar(j), el("div", { style: { minWidth: 0 } }, el("b", { texte: j.display_name }), el("span", { texte: "Voir mon profil" }))),
    el("div", { class: "ressources", "data-ressources": "" }),
    el("div", { class: "nav-principale" }, PAGES.map(lien)),
    el("div", { class: "nav-bas" },
      el("a", { href: "aide.html", "aria-current": page === "aide" ? "page" : null }, icone("i-livre"), "Comment jouer"),
      el("a", { href: "parametres.html", "aria-current": page === "parametres" ? "page" : null }, icone("i-reglages"), "Paramètres"),
      lienRecette, lienSimulateur, lienAtelier,
      el("button", { type: "button", onclick: App.seDeconnecter }, icone("i-sortie"), "Se déconnecter")));

  const titrePage = (PAGES.find((p) => p.id === page) || { titre: { aide: "Comment jouer", recette: "Recette", simulateur: "Simulateur", atelier: "Atelier patchnote" }[page] || "Paramètres" }).titre;
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
    lienRecette && lienRecette.cloneNode(true), lienSimulateur && lienSimulateur.cloneNode(true), lienAtelier && lienAtelier.cloneNode(true),
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

// Notifications : dons reçus depuis le live, succès débloqués, duels et patchnotes publiés.
let notifs = [];
async function chargerNotifs(cloche) {
  try {
    const p = App.ctx.prefs || {};
    const lues = new Date(p.notifications_lues_le || 0).getTime();
    const [dons, succes, catalogue, duels, patchs, quetes] = await Promise.all([App.api.grants(App.ctx.joueur.id), App.api.succesJoueurs(App.ctx.joueur.id), App.api.succes(), p.notif_duels !== false ? App.api.duels().catch(() => []) : [],
      p.notif_annonces !== false && App.api.patchnotesRecents ? App.api.patchnotesRecents().catch(() => []) : [],
      App.api.quetes().catch(() => null)]);
    const titres = new Map(catalogue.map((s) => [s.code, s]));
    notifs = [];
    if (p.notif_lootbox !== false) dons.forEach((d) => {
      const n = d.quantite, pl = n > 1 ? "s" : "";
      if (d.type === "stat") notifs.push({ quand: d.cree_le, icone: "i-profil", texte: `+${n} en ${STATS[d.stat] || d.stat}, gagné en live`, lien: "profil.html" });
      else if (d.type === "ticket") notifs.push({ quand: d.cree_le, icone: "i-ticket", texte: `${n} ticket${pl} de duel reçu${pl} depuis le live`, lien: "duels.html" });
      else notifs.push({ quand: d.cree_le, icone: d.type === "lootbox_legendaire" ? "i-etoile" : "i-coffre-ligne",
        texte: `${n} lootbox${d.type === "lootbox_legendaire" ? " légendaire" : ""}${pl} reçue${pl} depuis le live`, lien: "lootbox.html" + (d.type === "lootbox_legendaire" ? "?type=legendaire" : "") });
    });
    if (p.notif_succes !== false) succes.forEach((s) => { const t = titres.get(s.code); if (t) notifs.push({ quand: s.debloque_le, icone: "i-trophee", texte: "Succès débloqué : " + t.titre, lien: "succes.html" }); });
    const moi = App.ctx.joueur.twitch_login;
    App.revanches(duels, moi).forEach((fin, l) => notifs.push({ quand: new Date(fin - 24 * 3600e3 + 1000).toISOString(), icone: "i-epees", lien: "combat.html?adversaire=" + encodeURIComponent(l) + "&mode=classe",
      texte: `Revanche gratuite contre ${App.nomCombattant(l)} : encore ${App.dureeCourte(fin - Date.now())}` }));
    duels.filter((d) => d.attaquant_login === moi || d.defenseur_login === moi).slice(0, 10).forEach((d) => {
      const autre = App.nomCombattant(d.attaquant_login === moi ? d.defenseur_login : d.attaquant_login);
      const res = d.egalite ? "Égalité" : d.vainqueur_login === moi ? "Victoire" : "Défaite";
      const ligue = d.type === "ligue";
      if (d.type === "arene") return;   // les combats d'arène ne passent pas par la cloche
      if (d.type === "tour") { notifs.push({ quand: d.joue_le, icone: "i-tour", lien: "combat.html?duel=" + encodeURIComponent(d.id), texte: `${res} à l'étage ${(d.replay && d.replay.etage) || "?"} de la Tour` }); return; }
      notifs.push({ quand: d.joue_le, icone: ligue ? "i-ligue" : "i-epees", lien: "combat.html?duel=" + encodeURIComponent(d.id),
        texte: ligue ? (d.attaquant_login === moi ? `${res} en ligue contre ${autre}` : d.egalite ? `Égalité en défense contre ${autre}` : d.vainqueur_login === moi ? `Ta défense a tenu face à ${autre}` : `${autre} a percé ta défense`)
          : `${res} en duel contre ${autre}` });
    });
    patchs.forEach((x) => notifs.push({ quand: x.publie_le, icone: "i-journal", texte: `Patchnote ${x.version} : ${x.titre}`, lien: "patchnotes.html#patch-" + x.id }));
    // Récompense de quête à prendre : rappel en tête de liste, tant qu'elle n'est pas prise.
    const aPrendre = (quetes && quetes.a_reclamer) || 0;
    App.majPastilleQuetes(aPrendre);
    if (aPrendre) notifs.push({ quand: new Date().toISOString(), icone: "i-cible", lien: "quetes.html", texte: aPrendre > 1 ? aPrendre + " récompenses de quête à prendre" : "1 récompense de quête à prendre" });
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

// ---------------------------------------------------------------------
// Patchnotes : comparaison de deux versions d'un objet (avant / après), verdict et rendu.
// Sert à la page publique, à l'atelier réservé et à l'éditeur du Simulateur.
// ---------------------------------------------------------------------
// [libellé, sens] — sens : +1 = plus c'est haut, mieux c'est ; -1 = plus c'est bas, mieux c'est ; 0 = neutre.
const CHAMPS_PATCH = {
  baseDegatsMin: ["Dégâts de base (minimum)", 1], baseDegatsMax: ["Dégâts de base (maximum)", 1],
  stance2BaseDegatsMin: ["Dégâts de base, 2e forme (minimum)", 1], stance2BaseDegatsMax: ["Dégâts de base, 2e forme (maximum)", 1],
  incrementBaseDegats: ["Dégâts de base, par amélioration", 1], coupsParUsage: ["Coups par utilisation", 1],
  degatsDirects: ["Dégâts par coup", 1], incrementDegatsDirects: ["Dégâts par coup, par amélioration", 1],
  usagesParCombat: ["Utilisations par combat", 1], cooldownTours: ["Recharge (tours)", -1], delaiTours: ["Délai avant l'impact (tours)", -1],
  soinDirect: ["Soin", 1], soinDureeTours: ["Durée du soin (tours)", 0], shieldMontant: ["Bouclier", 1],
  poisonDegats: ["Poison", 1], poisonDuree: ["Durée du poison (tours)", 1], brulureDegats: ["Brûlure par tour", 1], brulureDuree: ["Durée de la brûlure (tours)", 1],
  saignementDegats: ["Saignement par coup", 1], saignementStacksParCoup: ["Stacks de saignement par coup", 1], saignementChanceParCoup: ["Chance de saignement (%)", 1],
  lifesteal: ["Vol de vie (%)", 1], penetration: ["Pénétration (%)", 1], paradeChance: ["Parade (%)", 1], blocage: ["Blocage (%)", 1], blocageReduction: ["Dégâts bloqués (%)", 1],
  reflection: ["Renvoi de dégâts (%)", 1], reductionDegatsTir: ["Réduction des tirs (%)", 1], resistanceCrit: ["Anti-critique (%)", 1], resistanceFeu: ["Résistance au feu (%)", 1], resistancePoison: ["Résistance au poison (%)", 1],
  regeneration: ["Régénération par tour", 1], etourdissementChance: ["Chance d'étourdir (%)", 1], etourdissementDureeTours: ["Durée de l'étourdissement (tours)", 1],
  paralysieChance: ["Chance de paralysie (%)", 1], paralysieDuree: ["Durée de la paralysie (tours)", 1], briseDefPoints: ["Défense brisée (points)", 1], briseDefDuree: ["Durée de la défense brisée (tours)", 1],
  marqueDegatsPourcentage: ["Marque : dégâts subis en plus (%)", 1], marqueDuree: ["Durée de la marque (tours)", 1], antiHealPourcentage: ["Anti-soin (%)", 1], antiHealDuree: ["Durée de l'anti-soin (tours)", 1],
  amplificationSoinsPourcentage: ["Soins renforcés (%)", 1], amplificationDegatsFeuPourcentage: ["Dégâts de feu en plus (%)", 1], frenesieBonusSpd: ["Frénésie : vitesse gagnée", 1], frenesieDuree: ["Durée de la frénésie (tours)", 1],
  tenaciteChance: ["Ténacité (%)", 1], dernierSouffleFractionPv: ["Dernier souffle : part des PV rendus", 1], esquiveParadeBuffPourcentage: ["Esquive ou parade renforcée (%)", 1], esquiveParadeBuffDuree: ["Durée du renfort (tours)", 1],
  critBonus: ["Critique (%)", 1], precision: ["Précision", 1], executionSeuil: ["Exécution : seuil de PV (%)", 1], executionBonus: ["Exécution : dégâts en plus (%)", 1], rageBonusMax: ["Rage : bonus max (%)", 1], rageSeuilMin: ["Rage : seuil de PV (%)", 0],
  bruleeReflectionDegats: ["Brûlure infligée à l'attaquant", 1], bruleeReflectionDuree: ["Durée de cette brûlure (tours)", 1],
  rechargeTousLesCoups: ["Recharge tous les N coups", -1], rechargeSacrificePourcentage: ["PV sacrifiés à la recharge (%)", -1], reductionPvMaxPourcentage: ["PV max retirés à la cible (%)", 1],
  autoDegatsPourcentageDesDegats: ["Contrecoup subi (%)", -1], riposteEtourdissementTousLesCoups: ["Riposte étourdissante tous les N coups", -1], dureeStance: ["Durée d'une forme (tours)", 0],
  stance2IncrementBaseDegats: ["Dégâts de la 2e forme, par amélioration", 1],
  multiplicateurDegats: ["Multiplicateur de dégâts", 1],
};
const RANG_LETTRE = { S: 6, A: 5, B: 4, C: 3, D: 2, E: 1 };
const champDe = (nom) => (nom ? nom.charAt(0).toLowerCase() + nom.slice(1) : "");
// Feuilles d'un objet de données, à plat : "passifsExtra.0.incrementPassif" → valeur.
function aplatir(o, prefixe = "", m = new Map()) {
  for (const [k, v] of Object.entries(o || {})) {
    const c = prefixe ? prefixe + "." + k : k;
    if (v && typeof v === "object") aplatir(v, c, m); else m.set(c, v);
  }
  return m;
}
// Libellé lisible et sens d'un champ (chemin à plat), d'après les données de l'objet.
function libelleChamp(chemin, d) {
  const stat = (cle) => { const st = d[cle]; return st ? (STATS[st] || st) + (st === "esquive" ? " (%)" : "") : null; };
  let m;
  if ((m = /^bonus(\d?)$/.exec(chemin)) && stat("stat" + m[1])) return [stat("stat" + m[1]), 1];
  if ((m = /^increment(\d?)$/.exec(chemin)) && stat("stat" + m[1])) return [stat("stat" + m[1]) + ", par amélioration", 1];
  if ((m = /^stance2Bonus(\d?)$/.exec(chemin)) && stat("stance2Stat" + m[1])) return [stat("stance2Stat" + m[1]) + " (2e forme)", 1];
  if ((m = /^stance2IncrementBonus(\d?)$/.exec(chemin)) && stat("stance2Stat" + m[1])) return [stat("stance2Stat" + m[1]) + " (2e forme), par amélioration", 1];
  if (chemin === "incrementPassif") { const b = CHAMPS_PATCH[champDe(d.statPrincipale)]; return b ? [b[0] + ", par amélioration", b[1]] : ["Passif, par amélioration", 1]; }
  if ((m = /^passifsExtra\.(\d+)\.incrementPassif$/.exec(chemin))) { const b = CHAMPS_PATCH[champDe(((d.passifsExtra || [])[m[1]] || {}).champ)]; return b ? [b[0] + ", par amélioration", b[1]] : ["Passif secondaire, par amélioration", 1]; }
  if ((m = /^statsExtra\.(\d+)\.(bonus|increment)$/.exec(chemin))) { const st = ((d.statsExtra || [])[m[1]] || {}).nom; return [(STATS[st] || st || "Stat") + (m[2] === "increment" ? ", par amélioration" : ""), 1]; }
  if ((m = /^modesTir\.(\d+)\.(\w+)$/.exec(chemin))) { const b = CHAMPS_PATCH[m[2]]; return ["Mode de tir " + (Number(m[1]) + 1) + " : " + (b ? b[0].charAt(0).toLowerCase() + b[0].slice(1) : m[2]), b ? b[1] : 1]; }
  if ((m = /^(stance2)?[sS]caling(\d)Lettre$/.exec(chemin))) { const st = d[(m[1] ? "stance2Scaling" : "scaling") + m[2] + "Stat"]; return ["Scaling " + (STATS[st] || st || m[2]) + (m[1] ? " (2e forme)" : ""), 1]; }
  return CHAMPS_PATCH[chemin] || [chemin, 1];
}
// Compare deux versions des données d'un objet : lignes lisibles + verdict (buff, nerf, équilibrage).
function diffObjet(avant, apres) {
  const A = aplatir(avant), B = aplatir(apres), lignes = [], vus = new Set();
  const change = (k) => A.get(k) !== B.get(k) && !(Number(A.get(k) || 0) === Number(B.get(k) || 0) && typeof (A.get(k) ?? 0) !== "string" && typeof (B.get(k) ?? 0) !== "string");
  const cles = [...new Set([...A.keys(), ...B.keys()])].filter(change);
  const plage = (kMin, kMax, libelle) => {
    if (!cles.includes(kMin) && !cles.includes(kMax)) return;
    vus.add(kMin); vus.add(kMax);
    const a = [Number(A.get(kMin) || 0), Number(A.get(kMax) || 0)], b = [Number(B.get(kMin) || 0), Number(B.get(kMax) || 0)];
    lignes.push({ libelle, avant: nombre(a[0]) + "–" + nombre(a[1]), apres: nombre(b[0]) + "–" + nombre(b[1]), sens: Math.sign(b[0] + b[1] - a[0] - a[1]) });
  };
  plage("baseDegatsMin", "baseDegatsMax", "Dégâts de base");
  plage("stance2BaseDegatsMin", "stance2BaseDegatsMax", "Dégâts de base (2e forme)");
  for (const k of cles) {
    if (vus.has(k)) continue;
    const a = A.get(k), b = B.get(k), [libelle, bon] = libelleChamp(k, apres || avant || {});
    if (/[sS]caling\d?Lettre$/.test(k)) lignes.push({ libelle, avant: a || "–", apres: b || "–", sens: Math.sign((RANG_LETTRE[b] || 0) - (RANG_LETTRE[a] || 0)) });
    else if (typeof a === "string" || typeof b === "string" || typeof a === "boolean" || typeof b === "boolean") lignes.push({ libelle, avant: String(a ?? "–"), apres: String(b ?? "–"), sens: 0 });
    else lignes.push({ libelle, avant: nombre(Number(a || 0)), apres: nombre(Number(b || 0)), sens: Math.sign(Number(b || 0) - Number(a || 0)) * bon });
  }
  const mieux = lignes.filter((l) => l.sens > 0).length, pire = lignes.filter((l) => l.sens < 0).length;
  return { lignes, verdict: mieux && !pire ? "buff" : pire && !mieux ? "nerf" : "equilibrage" };
}
const VERDICTS = { buff: ["Buff", "Buffs"], nerf: ["Nerf", "Nerfs"], equilibrage: ["Équilibrage", "Équilibrages"] };
// Texte libre d'un patchnote → paragraphes, « ## Sous-titre », listes « - point ». Jamais de HTML interprété.
function textePatch(texte) {
  const racine = el("div", { class: "patch-texte" });
  let liste = null, para = [];
  const vider = () => { if (para.length) { racine.append(el("p", { texte: para.join(" ") })); para = []; } };
  for (const brut of String(texte || "").split(/\r?\n/)) {
    const l = brut.trim();
    if (!l) { vider(); liste = null; }
    else if (/^##\s+/.test(l)) { vider(); liste = null; racine.append(el("h3", { texte: l.replace(/^##\s+/, "") })); }
    else if (/^[-•]\s+/.test(l)) { vider(); if (!liste) { liste = el("ul"); racine.append(liste); } liste.append(el("li", { texte: l.replace(/^[-•]\s+/, "") })); }
    else { liste = null; para.push(l); }
  }
  vider();
  return racine;
}
// Objets modifiés, regroupés par verdict. objets : [{ numero, nom, slot, rarete, avant, apres }].
// action(objet) (facultatif) renvoie un bouton à afficher sur la ligne de l'objet (atelier).
function objetsPatch(objets, action = null) {
  const calcules = (objets || []).map((o) => ({ ...o, ...diffObjet(o.avant, o.apres) })).filter((o) => o.lignes.length);
  const racine = el("div", { class: "patch-objets" });
  if (!calcules.length) return racine;
  const compte = (v) => calcules.filter((o) => o.verdict === v).length;
  racine.append(el("p", { class: "patch-resume" }, el("b", { texte: calcules.length + (calcules.length > 1 ? " objets retouchés" : " objet retouché") }), " : ",
    ["buff", "nerf", "equilibrage"].filter(compte).map((v) => compte(v) + " " + VERDICTS[v][compte(v) > 1 ? 1 : 0].toLowerCase()).join(", "), "."));
  const ordreSlots = Object.keys(SLOTS);
  const ligne = (l) => el("li", {}, el("span", { texte: l.libelle }), el("span", { class: "num avant", texte: l.avant }),
    el("span", { class: "fleche", "aria-hidden": "true", texte: "→" }),
    el("b", { class: "num " + (l.sens > 0 ? "hausse" : l.sens < 0 ? "baisse" : ""), texte: l.apres + (l.sens > 0 ? " ▲" : l.sens < 0 ? " ▼" : "") }));
  const carteObjet = (o) => el("article", { class: "patch-objet", style: { "--c": `var(--${o.rarete})` } },
    el("header", {}, el("b", { class: "nom-objet", texte: o.nom }), el("span", { class: "pilule " + o.rarete, texte: RARETES[o.rarete].nom }),
      el("span", { class: "mention", texte: SLOTS[o.slot] ? SLOTS[o.slot].nom : o.slot }), action ? action(o) : null),
    el("ul", { class: "patch-lignes" }, o.lignes.map(ligne)));
  for (const v of ["buff", "nerf", "equilibrage"]) {
    const groupe = calcules.filter((o) => o.verdict === v).sort((a, b) => ordreSlots.indexOf(a.slot) - ordreSlots.indexOf(b.slot) || rangRarete(b.rarete) - rangRarete(a.rarete) || a.nom.localeCompare(b.nom, "fr"));
    if (!groupe.length) continue;
    racine.append(el("details", { class: "patch-groupe " + v, open: "" },
      el("summary", {}, el("span", { class: "patch-verdict " + v, texte: VERDICTS[v][1] }), el("span", { class: "mention num", texte: String(groupe.length) })),
      el("div", { class: "patch-liste" }, groupe.map(carteObjet))));
  }
  return racine;
}
// Un patchnote complet : version, titre, date, texte, objets.
function articlePatch(p, action = null) {
  return el("article", { class: "patchnote panneau-b", id: p.id ? "patch-" + p.id : null },
    el("header", { class: "patch-entete" }, el("span", { class: "pilule", texte: "Version " + p.version }),
      el("h2", { texte: p.titre || "Sans titre" }),
      el("time", { class: "mention", datetime: p.publie_le || "", texte: p.publie_le ? "Publié le " + date(p.publie_le) : "Aperçu : pas encore publié" })),
    textePatch(p.texte), objetsPatch(p.objets, action));
}
App.patch = { diff: diffObjet, libelle: libelleChamp, aplatir, texte: textePatch, objets: objetsPatch, article: articlePatch };

// ---------------------------------------------------------------------
// Récit d'un tour de duel : mêmes phrases sur l'écran de combat et dans le lecteur de la page Duels.
// Lit les replays du moteur 1.1 (regen_montant, offhand_action, contrecoup…) comme les anciens.
// ---------------------------------------------------------------------
const EFFETS_MAIN_GAUCHE = { poison: "poison", brulure: "brûlure", anti_heal: "soins réduits", brise_def: "défense brisée", marque: "marque (dégâts subis augmentés)", esquive_parade_buff: "esquive ou parade renforcée" };
App.decrireTour = (r, R, nom) => {
  const L = [], add = (texte, genre = "") => L.push({ texte, genre });
  const F = r.frappeur ? nom(r.frappeur) : null, C = r.cible ? nom(r.cible) : null;
  const cote = (estA) => nom(estA ? R.attaquant : R.defenseur);
  const cibleEstA = r.cible === R.attaquant;
  const build = R[r.frappeur === R.attaquant ? "build_attaquant" : "build_defenseur"] || {};
  const nomStrat = (build.strategeme && build.strategeme.nom) || "son stratagème", nomOff = (build.offhand && build.offhand.nom) || "sa main gauche";
  const moteur11 = r.regen_montant !== undefined;
  if (R.round_debut_fatigue > 0 && r.round === R.round_debut_fatigue) add("La fatigue s'installe : chaque tour coûte maintenant des PV aux deux combattants.", "etat");
  if (F && r.regen_montant > 0) add(`${F} récupère ${r.regen_montant} PV.`, "soin");
  if (F && r.etourdi) add(`${F} est étourdi et passe son tour.`, "etat");
  else if (F && r.paralysie) add(`${F} est paralysé : son arme ne répond plus.`, "etat");
  else if (F && r.offhand_action) {
    if (r.offhand_soin) add(`${F} utilise ${nomOff} : +${r.soin_montant || 0} PV${r.soin_tours > 1 ? `, puis autant au début de ses ${r.soin_tours - 1} prochains tours` : ""}.`, "soin");
    else {
      const effets = (r.effets || []).map((e) => EFFETS_MAIN_GAUCHE[e]).filter(Boolean);
      add(`${F} utilise ${nomOff}${r.offhand_sur_soi || !C ? "" : " sur " + C}${effets.length ? " : " + effets.join(", ") : ""}.`, "strat");
    }
  } else if (F) {
    if (r.missile_lance) add(`${F} lance ${nomStrat} : l'impact ${r.missile_delai ? "tombe dans " + r.missile_delai + (r.missile_delai > 1 ? " tours" : " tour") : "arrive dans quelques tours"}.`, "strat");
    if (r.strategeme_bouclier) add(`${F} déploie un bouclier${r.montant_bouclier ? " de " + r.montant_bouclier + " points" : ""}.`, "soin");
    const soinAncien = !moteur11 && r.soin_applique && r.soin_montant > 0;
    if (soinAncien) add(`${F} se soigne : +${r.soin_montant} PV.`, "soin");
    const surSoi = r.missile_lance || r.strategeme_bouclier || r.evenement === "soin" || (soinAncien && r.frappeur === r.cible);
    if (!surSoi) {
      if (r.parade_reussie) add(`${C} pare le coup de ${F} et riposte : ${r.degats_ripostee || 0} dégâts !`, "parade");
      else if (r.touche) {
        const balles = r.degats_par_balle || [], crits = (r.crit_par_balle || []).filter(Boolean).length;
        let t = r.impact_differe ? `${nomStrat} de ${F} s'abat sur ${C} : ${r.degats} dégâts` : r.strategeme ? `Le stratagème de ${F} frappe ${C} : ${r.degats} dégâts` : `${F} frappe ${C} : ${r.degats} dégâts`;
        if (balles.length > 1) t += ` en ${balles.length} coups (${balles.join(" + ")})` + (crits ? `, dont ${crits} critique${crits > 1 ? "s" : ""}` : "");
        else if (r.crit) t += " (critique !)";
        if (r.bloque) t += ", en partie bloqués";
        add(t + ".", r.crit || crits ? "crit" : "coup");
      } else add(`${F} attaque, mais ${C} esquive.`, "rate");
    }
  } else if (!moteur11 && r.soin_applique && r.soin_montant > 0) add(`Régénération : +${r.soin_montant} PV.`, "soin");
  if (r.vol_de_vie > 0) add(`${F} récupère ${r.vol_de_vie} PV en vol de vie.`, "soin");
  if (r.degats_reflechis > 0) add(`${C} renvoie ${r.degats_reflechis} dégâts à ${F}.`, "coup");
  if (r.erosion_pv_max > 0) add(`Érosion : ${C} perd ${r.erosion_pv_max} PV max.`, "etat");
  if (r.contrecoup > 0) add(`Contrecoup : ${F} perd ${r.contrecoup} PV.`, "coup");
  if (r.sacrifice_pv > 0) add(`Sacrifice : ${F} perd ${r.sacrifice_pv} PV et récupère une charge${r.recharge_strategeme && r.recharge_offhand ? " sur son stratagème et sa main gauche" : r.recharge_offhand ? " sur sa main gauche" : " sur son stratagème"}.`, "strat");
  if ((r.effets || []).includes("purge")) add(`${F} revient en première forme : son poison et sa brûlure sont purgés.`, "soin");
  if (r.execution_active) add(`Exécution : +${r.execution_bonus} % de dégâts sur une cible affaiblie.`, "crit");
  if (r.etourdi_applique) add(`${C} est étourdi !`, "etat");
  if (r.riposte_stun_frappeur) add(`${F} est étourdi en retour par l'armure de ${C}.`, "etat");
  if (r.paralysie_applique) {
    const k = cibleEstA ? r.paralysie_duree_attaquant : r.paralysie_duree_defenseur;
    add(`${C} est paralysé${k ? " pour " + k + " tours" : ""} : plus d'attaque à l'arme.`, "etat");
  }
  if (r.poison_applique && C && !r.offhand_action) add(`Le poison s'accumule sur ${C}.`, "poison");
  if (r.saignement_explosion_attaquant) add(`Le saignement de ${cote(true)} explose : −${r.degats_explosion_saignement_attaquant} PV bruts !`, "saignement");
  if (r.saignement_explosion_defenseur) add(`Le saignement de ${cote(false)} explose : −${r.degats_explosion_saignement_defenseur} PV bruts !`, "saignement");
  if (r.poison_tick && r.degats_poison) add(`Le poison ronge ${cote(r.poison_tick_attaquant)} : −${r.degats_poison} PV.`, "poison");
  if (r.brulure_tick && r.degats_brulure) add(`${cote(r.brulure_tick_attaquant)} brûle : −${r.degats_brulure} PV.`, "brulure");
  if (r.fatigue_tick && r.degats_fatigue) add(`La fatigue frappe les deux combattants : −${r.degats_fatigue} PV chacun.`, "etat");
  if (r.dernier_souffle_attaquant) add(`${cote(true)} refuse de tomber : dernier souffle !`, "parade");
  if (r.dernier_souffle_defenseur) add(`${cote(false)} refuse de tomber : dernier souffle !`, "parade");
  if (!L.length) add("Rien ne se passe ce tour-ci.", "etat");
  return L;
};

Object.assign(App, { $, $$, el, icone, echapper, fmt, nombre, date, ilYa, attendre, reduit, RARETES, ORDRE_RARETE, SLOTS, STATS, PAGES, rangRarete, couleur, sousTitre, client });
window.App = App;
})();
