/* =====================================================================
   Stream RPG — moteur de bruitages des combats (Web Audio, sans fichier)
   window.SFX : synthèse en couches (bruits filtrés, balayages, saturation,
   réverbe générée), panoramique gauche/droite par combattant.
   Fichiers : les noms de sons du replay (ex. "sword_slash_1.mp3", choisis par
   objet dans le catalogue) sont joués depuis le dossier sons/ du site ;
   un fichier absent retombe sur la synthèse.
   Événements : sons/combat/<nom>.mp3, s'il est listé dans sons/combat/liste.json,
   remplace la synthèse de cet événement (crit, ko, esquive…).
   Musique : SFX.musique enchaîne les pistes de sons/musiques/ en fondu.
   ===================================================================== */
"use strict";
(function () {
let ctx = null, maitre = null, reverb = null, bruitBuf = null, actif = true, volume = 0.8;
const courbes = new Map();
const fichiers = new Map(); // nom -> AudioBuffer | Promise
const BASE = "sons/"; // dossier sons/ du site (les pages sont toutes à la racine)

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const al = (a, b) => a + Math.random() * (b - a);

function demarrer() {
  if (!actif) return false;
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    maitre = ctx.createGain(); maitre.gain.value = volume;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 10; comp.ratio.value = 5; comp.attack.value = 0.003; comp.release.value = 0.22;
    maitre.connect(comp).connect(ctx.destination);
    reverb = ctx.createConvolver(); reverb.buffer = impulsion(2.4, 2.8);
    const retour = ctx.createGain(); retour.gain.value = 0.3;
    reverb.connect(retour).connect(maitre);
    chargerRemplacements();
  }
  if (ctx.state === "suspended") ctx.resume();
  return true;
}
// Réponse impulsionnelle d'une salle : bruit stéréo à décroissance exponentielle.
function impulsion(duree, decroissance) {
  const n = Math.floor(ctx.sampleRate * duree), b = ctx.createBuffer(2, n, ctx.sampleRate);
  for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decroissance); }
  return b;
}
function tamponBruit() {
  if (!bruitBuf) {
    const n = ctx.sampleRate * 2; bruitBuf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = bruitBuf.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  }
  return bruitBuf;
}
function courbe(k) {
  if (!courbes.has(k)) { const n = 1024, c = new Float32Array(n); for (let i = 0; i < n; i++) { const x = (i * 2) / n - 1; c[i] = ((1 + k) * x) / (1 + k * Math.abs(x)); } courbes.set(k, c); }
  return courbes.get(k);
}
// Sortie d'une voix : gain -> panoramique -> maître (+ envoi réverbe). pan2 = balayage.
function sortie(pan = 0, envoi = 0.25, pan2 = null, dureePan = 0.3) {
  const g = ctx.createGain(), p = ctx.createStereoPanner();
  p.pan.value = clamp(pan, -1, 1);
  if (pan2 !== null) p.pan.linearRampToValueAtTime(clamp(pan2, -1, 1), ctx.currentTime + dureePan);
  g.connect(p); p.connect(maitre);
  if (envoi > 0) { const s = ctx.createGain(); s.gain.value = envoi; p.connect(s); s.connect(reverb); }
  return g;
}
function env(g, t, a, pic, d) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(pic, 0.0002), t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
}
// Bruit filtré. o = { type, f, f2, q, vol, a, d }
function bruit(dest, t, o) {
  const s = ctx.createBufferSource(); s.buffer = tamponBruit(); s.loop = true;
  const fi = ctx.createBiquadFilter(); fi.type = o.type || "bandpass"; fi.Q.value = o.q ?? 1;
  fi.frequency.setValueAtTime(o.f || 1000, t);
  if (o.f2) fi.frequency.exponentialRampToValueAtTime(o.f2, t + (o.a || 0.005) + (o.d || 0.2));
  const g = ctx.createGain(); env(g, t, o.a || 0.005, o.vol ?? 0.4, o.d || 0.2);
  s.connect(fi).connect(g).connect(dest);
  s.start(t, Math.random() * 1.5); s.stop(t + (o.a || 0.005) + (o.d || 0.2) + 0.05);
}
// Oscillateur. o = { type, f, f2, vol, a, d, dist, detune, fm: [freq, ampleur] }
function osc(dest, t, o) {
  const a = o.a || 0.005, d = o.d || 0.2;
  const v = ctx.createOscillator(); v.type = o.type || "sine"; v.detune.value = o.detune || 0;
  v.frequency.setValueAtTime(o.f, t);
  if (o.f2) v.frequency.exponentialRampToValueAtTime(o.f2, t + a + d);
  if (o.fm) { const m = ctx.createOscillator(), mg = ctx.createGain(); m.type = o.fmType || "square"; m.frequency.value = o.fm[0]; mg.gain.value = o.fm[1]; m.connect(mg).connect(v.frequency); m.start(t); m.stop(t + a + d + 0.05); }
  const g = ctx.createGain(); env(g, t, a, o.vol ?? 0.3, d);
  let n = v;
  if (o.dist) { const w = ctx.createWaveShaper(); w.curve = courbe(o.dist); v.connect(w); n = w; }
  if (o.lp) { const f = ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.setValueAtTime(o.lp, t); if (o.lp2) f.frequency.exponentialRampToValueAtTime(o.lp2, t + a + d); n.connect(f); n = f; }
  n.connect(g).connect(dest);
  v.start(t); v.stop(t + a + d + 0.05);
}
// Partiels inharmoniques : métal, cloche, verre.
function metal(dest, t, f0, rapports, d, vol) {
  rapports.forEach((r, i) => osc(dest, t, { f: f0 * r, vol: vol / (1 + i * 0.6), a: 0.002, d: d / (1 + i * 0.35), type: "sine" }));
}

// ---------------------------------------------------------------------
// Briques
// ---------------------------------------------------------------------
const souffle = (s, t, f1 = 500, f2 = 2800, d = 0.2, vol = 0.35) => bruit(s, t, { type: "bandpass", f: f1, f2, q: 1.1, vol, a: d * 0.55, d: d * 0.45 });
const choc = (s, t, f = 140, vol = 0.55) => { osc(s, t, { f, f2: f * 0.42, vol, d: 0.14, dist: 3 }); bruit(s, t, { type: "lowpass", f: 1400, vol: vol * 0.8, d: 0.07 }); };
const debris = (s, t, n = 8, etale = 0.6, vol = 0.18) => { for (let i = 0; i < n; i++) bruit(s, t + al(0.03, etale), { type: "bandpass", f: al(1800, 6000), q: 4, vol: al(vol * 0.4, vol), d: al(0.01, 0.035), a: 0.001 }); };
const crepite = (s, t, duree = 0.7, n = 18, vol = 0.3) => { for (let i = 0; i < n; i++) bruit(s, t + al(0, duree), { type: "bandpass", f: al(1500, 5200), q: 2, vol: al(vol * 0.3, vol), d: al(0.008, 0.03), a: 0.001 }); };
function boum(s, t, force = 1) {
  bruit(s, t, { type: "lowpass", f: 3200, f2: 110, vol: 0.75 * force, a: 0.002, d: 0.9 * force });
  osc(s, t, { f: 95, f2: 30, vol: 0.85 * force, a: 0.004, d: 0.7 * force, dist: 6 });
  debris(s, t + 0.08, Math.round(8 * force), 0.8, 0.16);
}
function verre(s, t, vol = 0.05, n = 14) {
  for (let i = 0; i < n; i++) osc(s, t + al(0, 0.25), { f: al(2200, 7200), vol, a: 0.001, d: al(0.12, 0.5) });
  bruit(s, t, { type: "highpass", f: 4800, vol: 0.22, d: 0.35 });
}

// ---------------------------------------------------------------------
// Bibliothèque : nom -> (s = sortie, t = début, o = options)
// ---------------------------------------------------------------------
const SONS = {
  // --- Armes de mêlée
  slash_katana(s, t) { souffle(s, t, 700, 3600, 0.17, 0.3); metal(s, t + 0.1, 2650, [1, 1.52, 2.31, 3.07, 4.2], 0.7, 0.07); bruit(s, t + 0.1, { type: "highpass", f: 6000, vol: 0.25, d: 0.04 }); },
  slash_energie(s, t) { souffle(s, t, 600, 3200, 0.2, 0.28); osc(s, t + 0.04, { type: "sawtooth", f: 380, f2: 2600, vol: 0.09, d: 0.22, lp: 5000 }); metal(s, t + 0.12, 1900, [1, 1.5, 2.7], 0.8, 0.06); },
  slash_lame(s, t) { souffle(s, t, 600, 3000, 0.18, 0.32); metal(s, t + 0.1, 1850, [1, 1.41, 2.2], 0.35, 0.05); bruit(s, t + 0.11, { type: "lowpass", f: 1200, vol: 0.35, d: 0.06 }); },
  slash_dague(s, t) { souffle(s, t, 1200, 4800, 0.1, 0.26); metal(s, t + 0.06, 3300, [1, 1.6], 0.22, 0.04); bruit(s, t + 0.07, { type: "bandpass", f: 900, q: 2, vol: 0.3, d: 0.05 }); },
  slash_lance(s, t) { souffle(s, t, 350, 1600, 0.24, 0.32); choc(s, t + 0.2, 120, 0.4); metal(s, t + 0.2, 1400, [1, 1.8], 0.3, 0.04); },
  smash_marteau(s, t) {
    souffle(s, t, 250, 900, 0.26, 0.3);
    osc(s, t + 0.16, { f: 110, f2: 36, vol: 0.8, a: 0.003, d: 0.42, dist: 9 });
    bruit(s, t + 0.16, { type: "lowpass", f: 900, vol: 0.55, a: 0.002, d: 0.16 });
    metal(s, t + 0.16, 480, [1, 2.3, 3.9], 0.3, 0.06); debris(s, t + 0.2, 7, 0.5);
  },
  smash_hache(s, t) { souffle(s, t, 400, 1800, 0.2, 0.3); bruit(s, t + 0.15, { type: "bandpass", f: 1300, q: 3, vol: 0.5, a: 0.001, d: 0.08 }); osc(s, t + 0.15, { f: 95, f2: 45, vol: 0.6, d: 0.25, dist: 5 }); },
  smash_baton(s, t) { souffle(s, t, 300, 1200, 0.18, 0.26); osc(s, t + 0.13, { type: "triangle", f: 190, f2: 85, vol: 0.55, d: 0.13 }); bruit(s, t + 0.13, { type: "bandpass", f: 820, q: 4, vol: 0.45, d: 0.06 }); },
  poing(s, t) { souffle(s, t, 500, 1500, 0.1, 0.2); choc(s, t + 0.08, 120, 0.6); },
  // --- Armes de tir (un appel par balle)
  tir_pistolet(s, t) { bruit(s, t, { type: "highpass", f: 1400, vol: 0.55, a: 0.001, d: 0.05 }); osc(s, t, { type: "square", f: 900, f2: 110, vol: 0.12, d: 0.07 }); bruit(s, t, { type: "lowpass", f: 500, vol: 0.4, a: 0.002, d: 0.2 }); },
  tir_fusil(s, t) { bruit(s, t, { type: "highpass", f: 1800, vol: 0.4, a: 0.001, d: 0.04 }); bruit(s, t, { type: "lowpass", f: 700, vol: 0.3, a: 0.002, d: 0.12 }); },
  tir_sniper(s, t) { bruit(s, t, { type: "highpass", f: 900, vol: 0.7, a: 0.001, d: 0.09 }); osc(s, t, { f: 160, f2: 40, vol: 0.7, d: 0.35, dist: 6 }); bruit(s, t + 0.45, { type: "bandpass", f: 3000, q: 6, vol: 0.2, d: 0.03 }); bruit(s, t + 0.55, { type: "bandpass", f: 2400, q: 6, vol: 0.2, d: 0.03 }); },
  tir_arc(s, t) { osc(s, t, { type: "triangle", f: 230, f2: 170, vol: 0.35, a: 0.002, d: 0.28 }); osc(s, t, { f: 460, f2: 380, vol: 0.08, d: 0.2 }); souffle(s, t + 0.03, 1800, 5200, 0.16, 0.2); },
  tir_arbalete(s, t) { osc(s, t, { type: "triangle", f: 160, f2: 110, vol: 0.4, d: 0.18 }); bruit(s, t, { type: "bandpass", f: 2600, q: 5, vol: 0.3, d: 0.03 }); souffle(s, t + 0.02, 1400, 4000, 0.14, 0.2); },
  tir_shuriken(s, t) { bruit(s, t, { type: "bandpass", f: 3200, f2: 5200, q: 9, vol: 0.28, a: 0.03, d: 0.14 }); metal(s, t + 0.17, 4200, [1, 1.33], 0.2, 0.04); },
  tir_canon(s, t) { boum(s, t, 0.55); bruit(s, t, { type: "highpass", f: 1200, vol: 0.4, d: 0.05 }); },
  impact_balle(s, t) { bruit(s, t, { type: "bandpass", f: 2200, q: 1.5, vol: 0.28, a: 0.001, d: 0.04 }); osc(s, t, { f: 180, f2: 70, vol: 0.3, d: 0.07 }); },
  impact_fleche(s, t) { bruit(s, t, { type: "lowpass", f: 900, vol: 0.4, a: 0.001, d: 0.06 }); osc(s, t, { type: "triangle", f: 260, f2: 120, vol: 0.2, d: 0.1 }); },
  impact(s, t) { choc(s, t, 140, 0.5); },
  // --- Stratagèmes
  lancement(s, t) { bruit(s, t, { type: "bandpass", f: 900, f2: 260, q: 0.8, vol: 0.45, a: 0.04, d: 0.9 }); osc(s, t, { type: "sawtooth", f: 70, f2: 45, vol: 0.12, d: 0.9, lp: 300 }); },
  charge(s, t) { osc(s, t, { f: 180, f2: 1500, vol: 0.14, a: 0.3, d: 0.5, fm: [18, 60], fmType: "sine" }); bruit(s, t, { type: "highpass", f: 5000, vol: 0.06, a: 0.4, d: 0.3 }); },
  sifflement(s, t) { osc(s, t, { f: 2300, f2: 650, vol: 0.13, a: 0.05, d: 0.6, fm: [9, 40], fmType: "sine" }); },
  explosion(s, t) { boum(s, t, 1); },
  explosion_petite(s, t) { boum(s, t, 0.45); },
  frappe_aerienne(s, t) { bruit(sortie(-0.9, 0.3, 0.9, 1.1), t, { type: "bandpass", f: 1400, f2: 380, q: 0.7, vol: 0.4, a: 0.45, d: 0.7 }); osc(s, t, { type: "sawtooth", f: 90, f2: 60, vol: 0.06, a: 0.4, d: 0.7, lp: 400 }); },
  eclair(s, t) {
    osc(s, t, { type: "sawtooth", f: 160, vol: 0.2, a: 0.002, d: 0.35, fm: [55, 900] });
    bruit(s, t + 0.05, { type: "highpass", f: 1100, vol: 0.8, a: 0.001, d: 0.08 });
    bruit(s, t + 0.08, { type: "lowpass", f: 260, f2: 60, vol: 0.6, a: 0.01, d: 1.5 }); crepite(s, t, 0.4, 10, 0.3);
  },
  gaz(s, t) { bruit(s, t, { type: "bandpass", f: 2400, q: 6, vol: 0.3, a: 0.002, d: 0.05 }); bruit(s, t + 0.05, { type: "highpass", f: 3400, vol: 0.28, a: 0.25, d: 1.1 }); bruit(s, t + 0.05, { type: "bandpass", f: 700, q: 0.8, vol: 0.12, a: 0.35, d: 1 }); },
  feu(s, t) { bruit(s, t, { type: "lowpass", f: 200, f2: 1600, vol: 0.55, a: 0.15, d: 1 }); crepite(s, t + 0.1, 1, 24, 0.3); },
  bouclier(s, t) { osc(s, t, { f: 300, f2: 1200, vol: 0.12, a: 0.25, d: 0.45 }); [880, 1320, 1760].forEach((f, i) => osc(s, t + 0.15 + i * 0.05, { f, vol: 0.06, a: 0.08, d: 0.7 })); osc(s, t, { type: "sawtooth", f: 110, vol: 0.05, a: 0.2, d: 0.6, lp: 500 }); },
  hache_chargee(s, t) { osc(s, t, { type: "sawtooth", f: 120, f2: 900, vol: 0.12, a: 0.3, d: 0.2, fm: [40, 200] }); SONS.smash_marteau(s, t + 0.3); crepite(s, t + 0.45, 0.4, 10, 0.25); },
  // --- Défense
  crit(s, t) { osc(s, t, { type: "square", f: 2400, f2: 1100, vol: 0.1, d: 0.08 }); metal(s, t, 3600, [1, 1.27, 1.9], 0.5, 0.06); osc(s, t, { f: 70, f2: 38, vol: 0.7, d: 0.28, dist: 4 }); bruit(s, t, { type: "highpass", f: 3000, f2: 9000, vol: 0.2, d: 0.1 }); },
  esquive(s, t, o) { bruit(sortie((o.pan || 0) - 0.4, 0.15, (o.pan || 0) + 0.4, 0.2), t, { type: "bandpass", f: 900, f2: 3800, q: 1.3, vol: 0.32, a: 0.08, d: 0.1 }); },
  parade(s, t) { bruit(s, t, { type: "bandpass", f: 3200, q: 1, vol: 0.5, a: 0.001, d: 0.03 }); metal(s, t, 820, [1, 1.47, 2.09, 2.72, 3.4], 1, 0.13); crepite(s, t + 0.01, 0.12, 6, 0.2); },
  riposte(s, t) { souffle(s, t, 800, 3600, 0.12, 0.3); choc(s, t + 0.1, 150, 0.5); },
  bloque(s, t) { osc(s, t, { f: 160, f2: 85, vol: 0.6, d: 0.16 }); bruit(s, t, { type: "lowpass", f: 600, vol: 0.45, d: 0.08 }); metal(s, t, 420, [1, 2.4], 0.18, 0.05); },
  bouclier_casse(s, t) { verre(s, t, 0.05, 16); osc(s, t, { f: 130, f2: 60, vol: 0.4, d: 0.2 }); },
  // --- États
  poison(s, t) { for (let i = 0; i < 8; i++) { const f = al(280, 720); osc(s, t + al(0, 0.55), { f, f2: f * 1.9, vol: 0.1, a: 0.004, d: 0.06 }); } bruit(s, t, { type: "lowpass", f: 480, vol: 0.1, a: 0.1, d: 0.5 }); },
  brulure(s, t) { crepite(s, t, 0.7, 18, 0.32); bruit(s, t, { type: "lowpass", f: 300, f2: 650, vol: 0.2, a: 0.1, d: 0.6 }); },
  saignement(s, t) { bruit(s, t, { type: "bandpass", f: 520, f2: 180, q: 1.4, vol: 0.5, a: 0.004, d: 0.18 }); osc(s, t, { f: 210, f2: 70, vol: 0.28, d: 0.1 }); for (let i = 0; i < 4; i++) { const f = al(700, 1100); osc(s, t + 0.08 + i * al(0.04, 0.09), { f, f2: f * 0.45, vol: 0.06, d: 0.03 }); } },
  saignement_explosion(s, t) { boum(s, t, 0.6); SONS.saignement(s, t + 0.02); SONS.saignement(s, t + 0.12); osc(s, t, { f: 55, vol: 0.5, a: 0.01, d: 0.5, dist: 3 }); },
  paralysie(s, t) { osc(s, t, { type: "sawtooth", f: 180, vol: 0.18, a: 0.004, d: 0.42, fm: [57, 800], lp: 2600 }); crepite(s, t, 0.4, 12, 0.22); },
  etourdi(s, t) { metal(s, t, 660, [1, 2.76, 5.4, 8.93], 1.6, 0.1); metal(s, t + 0.18, 705, [1, 2.76, 5.4], 1.2, 0.06); },
  soin(s, t) { [784, 988, 1175, 1568].forEach((f, i) => osc(s, t + i * 0.07, { f, vol: 0.09, a: 0.01, d: 0.7 })); bruit(s, t, { type: "highpass", f: 6500, vol: 0.05, a: 0.2, d: 0.5 }); },
  volvie(s, t) { osc(s, t, { type: "sawtooth", f: 110, f2: 240, vol: 0.14, a: 0.38, d: 0.05, lp: 400, lp2: 2400 }); bruit(s, t, { type: "bandpass", f: 900, f2: 4200, q: 1, vol: 0.2, a: 0.38, d: 0.05 }); },
  renvoi(s, t) { metal(s, t, 1500, [1, 1.6], 0.2, 0.05); choc(s, t + 0.05, 180, 0.35); },
  dernier_souffle(s, t) {
    osc(s, t, { f: 70, f2: 44, vol: 0.85, a: 0.004, d: 0.13, dist: 2 }); osc(s, t + 0.24, { f: 64, f2: 42, vol: 0.7, a: 0.004, d: 0.15, dist: 2 });
    [220, 277.2, 329.6, 440].forEach((f) => [-9, 9].forEach((dt) => {
      const g = ctx.createGain(), bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 900; bp.Q.value = 1.6; g.connect(bp).connect(s);
      osc(g, t + 0.4, { type: "sawtooth", f, detune: dt, vol: 0.05, a: 0.45, d: 1.5 });
    }));
  },
  stance(s, t) { bruit(s, t, { type: "highpass", f: 3000, vol: 0.4, d: 0.015, a: 0.001 }); bruit(s, t + 0.09, { type: "highpass", f: 2600, vol: 0.4, d: 0.015, a: 0.001 }); osc(s, t + 0.1, { type: "sawtooth", f: 200, f2: 820, vol: 0.09, d: 0.35, lp: 2200 }); metal(s, t + 0.45, 1250, [1, 1.5, 2.2], 0.4, 0.05); },
  execution(s, t) { osc(s, t, { f: 55, vol: 0.5, a: 0.01, d: 0.35, dist: 4 }); metal(s, t, 1100, [1, 1.19], 0.4, 0.05); },
  fatigue(s, t) { osc(s, t, { type: "square", f: 900, vol: 0.05, d: 0.02 }); osc(s, t + 0.25, { type: "square", f: 620, vol: 0.05, d: 0.02 }); osc(s, t, { f: 55, vol: 0.3, a: 0.05, d: 0.4 }); },
  // --- Cartes
  carte(s, t) { bruit(s, t, { type: "highpass", f: 2600, vol: 0.32, a: 0.001, d: 0.035 }); bruit(s, t + 0.04, { type: "bandpass", f: 5200, f2: 1900, q: 1, vol: 0.18, a: 0.01, d: 0.07 }); },
  carte_retour(s, t) { bruit(s, t, { type: "bandpass", f: 3000, f2: 1500, q: 1, vol: 0.14, a: 0.01, d: 0.08 }); },
  carte_brule(s, t) { bruit(s, t, { type: "bandpass", f: 380, f2: 2600, q: 0.8, vol: 0.38, a: 0.3, d: 0.9 }); crepite(s, t + 0.1, 1.1, 26, 0.28); bruit(s, t, { type: "lowpass", f: 180, vol: 0.2, a: 0.2, d: 1 }); },
  ko(s, t) { osc(s, t, { f: 56, f2: 26, vol: 0.95, a: 0.004, d: 1.3, dist: 3 }); bruit(s, t, { type: "lowpass", f: 320, f2: 60, vol: 0.5, a: 0.004, d: 1.3 }); verre(s, t + 0.05, 0.03, 8); },
  // --- Interface
  tic(s, t) { osc(s, t, { type: "square", f: 1250, vol: 0.04, d: 0.03, a: 0.001 }); },
  decompte(s, t) { osc(s, t, { type: "square", f: 660, vol: 0.07, d: 0.12, lp: 2400 }); osc(s, t, { f: 330, vol: 0.2, d: 0.2 }); },
  go(s, t) { [220, 330, 440, 554].forEach((f) => osc(s, t, { type: "sawtooth", f, vol: 0.07, a: 0.01, d: 0.9, lp: 2600, lp2: 600 })); boum(s, t, 0.35); },
  victoire(s, t) { [523, 659, 784].forEach((f, i) => osc(s, t + i * 0.12, { type: "sawtooth", f, vol: 0.07, a: 0.01, d: 0.25, lp: 2400 })); [523, 659, 784, 1047].forEach((f) => osc(s, t + 0.38, { type: "sawtooth", f, vol: 0.06, a: 0.02, d: 1.5, lp: 3000, lp2: 900 })); osc(s, t + 0.38, { f: 65, vol: 0.5, d: 0.5, dist: 2 }); },
  defaite(s, t) { [392, 311, 262, 196].forEach((f, i) => osc(s, t + i * 0.22, { type: "triangle", f, vol: 0.14, a: 0.02, d: i === 3 ? 1.4 : 0.35 })); },
  egalite(s, t) { osc(s, t, { type: "triangle", f: 440, vol: 0.12, d: 0.4 }); osc(s, t + 0.3, { type: "triangle", f: 440, vol: 0.12, d: 0.9 }); },
};

// ---------------------------------------------------------------------
// Profils : quel son pour quelle arme / quel stratagème (données de l'objet)
// ---------------------------------------------------------------------
const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
function profilArme(o) {
  if (!o) return "poing";
  const d = o.data || {}, n = norm(o.nom), anim = d.anim || "";
  if (anim === "tir") {
    if (/\barc\b/.test(n)) return "tir_arc";
    if ((d.coupsParUsage || 1) >= 3 || /gallant|fusil|mitrail/.test(n)) return "tir_fusil";
    if (/deadeye|sniper|precision/.test(n)) return "tir_sniper";
    return "tir_pistolet";
  }
  if (anim === "bombardement" || anim === "explosion") return /arbalete/.test(n) ? "tir_arbalete" : "tir_canon";
  if (anim === "smash") return /hache/.test(n) ? "smash_hache" : /baton/.test(n) ? "smash_baton" : "smash_marteau";
  if (anim === "slash") {
    if (/dague|tanto|croc/.test(n)) return "slash_dague";
    if (/lance/.test(n)) return "slash_lance";
    if (o.set === "Sekiro" || /katana|odachi|kusabimaru/.test(n)) return (o.rarete === "legendaire" || /mort/.test(n)) ? "slash_energie" : "slash_katana";
    if (/volto|vampir/.test(n)) return "slash_energie";
    return "slash_lame";
  }
  return "poing";
}
// Profil visuel + sonore d'un stratagème.
function profilStrategeme(o) {
  if (!o) return "explosion";
  const d = o.data || {}, n = norm(o.nom);
  if (/eclair|tomoe|foudre/.test(n)) return "eclair";
  if (/gas|gaz/.test(n) || (d.poisonDegats > 0 && !d.degatsDirects)) return "gaz";
  if (/souffle|dragon|feu|flamm/.test(n) || d.brulureDegats > 0) return "feu";
  if (d.shieldMontant > 0 || /bouclier/.test(n)) return "bouclier";
  if (d.soinDirect > 0) return "soin";
  if (d.anim === "bombardement" || /aerien/.test(n)) return "bombardement";
  if (/shuriken/.test(n)) return "shuriken";
  if (d.anim === "smash" || /hache/.test(n)) return "hache";
  return "missile";
}

// ---------------------------------------------------------------------
// Fichiers de l'ancien site (sons/) : chargés à la demande, synthèse en attendant
// ---------------------------------------------------------------------
const nomsFichiers = (csv) => String(csv || "").split(",").map((s) => s.trim()).filter((s) => /^[\w.-]+\.mp3$/.test(s));
function fichierDisponible(csv) {
  if (window.App && App.DEMO) return null; // l'aperçu n'embarque aucun son
  const l = nomsFichiers(csv).filter((s) => fichiers.get(s) !== null); // null = absent du dossier
  return l.length ? l[Math.floor(Math.random() * l.length)] : null;
}
function tampon(nom) {
  if (!fichiers.has(nom)) fichiers.set(nom, fetch(BASE + nom).then((r) => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
    .then((b) => ctx.decodeAudioData(b)).then((buf) => { fichiers.set(nom, buf); return buf; }).catch(() => { fichiers.set(nom, null); return null; }));
  return fichiers.get(nom);
}

// ---------------------------------------------------------------------
// Musique de combat : une piste tirée au hasard ; quand elle se termine, une
// autre (jamais la même) prend le relais en fondu enchaîné.
// ---------------------------------------------------------------------
const musique = (() => {
  const VOL = 0.3, FONDU = 1.6;
  let liste = [], derniere = null, premiere = null, bus = null, voix = [], veille = null, coupee = false, enCours = false;
  const octets = new Map(), decodes = new Map();
  const choisir = () => { const l = liste.filter((x) => x !== derniere); return l.length ? l[Math.floor(Math.random() * l.length)] : null; };
  const telecharger = (nom) => { if (!octets.has(nom)) octets.set(nom, fetch(BASE + "musiques/" + nom).then((r) => (r.ok ? r.arrayBuffer() : null)).catch(() => null)); return octets.get(nom); };
  const decoder = (nom) => {
    if (!decodes.has(nom)) decodes.set(nom, telecharger(nom).then((b) => (b ? ctx.decodeAudioData(b.slice(0)) : null)).catch(() => null));
    return decodes.get(nom);
  };
  async function lancer(nom) {
    const buf = await decoder(nom);
    if (!enCours || !buf) return;
    if (!bus) { bus = ctx.createGain(); bus.connect(maitre); }
    bus.gain.value = coupee ? 0 : VOL;
    const src = ctx.createBufferSource(), g = ctx.createGain(), t = ctx.currentTime;
    src.buffer = buf; src.connect(g).connect(bus);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(1, t + FONDU);
    src.start(t);
    const v = { src, g, fin: t + buf.duration };
    voix.push(v); src.onended = () => { voix = voix.filter((x) => x !== v); };
    derniere = nom;
    const suivante = choisir(); if (suivante) decoder(suivante);
    // L'horloge audio s'arrête quand le combat est en pause : le relais suit le morceau, pas la montre.
    clearInterval(veille);
    veille = setInterval(() => {
      if (!enCours || ctx.currentTime < v.fin - FONDU) return;
      clearInterval(veille);
      v.g.gain.setValueAtTime(v.g.gain.value, ctx.currentTime); v.g.gain.linearRampToValueAtTime(0.0001, v.fin);
      if (suivante) lancer(suivante);
    }, 250);
  }
  return {
    // Avant le geste : choisit la piste et commence le téléchargement.
    preparer(l) { liste = l.slice(); if (!premiere) premiere = choisir(); if (premiere) telecharger(premiere); },
    jouer() { if (enCours || !ctx || !premiere || (window.App && App.DEMO)) return; enCours = true; lancer(premiere); },
    // Fondu de sortie sur le bus entier (un bus neuf servira au prochain morceau).
    arreter(fondu = 1.2) {
      enCours = false; clearInterval(veille); premiere = null;
      if (!ctx || !bus) return;
      const t = ctx.currentTime, b = bus, vs = voix;
      bus = null; voix = [];
      b.gain.cancelScheduledValues(t); b.gain.setValueAtTime(b.gain.value, t); b.gain.linearRampToValueAtTime(0, t + fondu);
      vs.forEach((v) => { try { v.src.stop(t + fondu + 0.1); } catch (e) {} });
      setTimeout(() => b.disconnect(), (fondu + 0.5) * 1000);
    },
    get coupee() { return coupee; },
    set coupee(c) { coupee = !!c; if (bus && ctx) bus.gain.setTargetAtTime(coupee ? 0 : VOL, ctx.currentTime, 0.15); },
  };
})();

// ---------------------------------------------------------------------
// Bruitages de remplacement : sons/combat/liste.json donne les noms d'événements
// (ex. ["crit", "ko"]) qui ont un fichier sons/combat/<nom>.mp3 ; il remplace la synthèse.
// ---------------------------------------------------------------------
let remplacements = new Set();
function chargerRemplacements() {
  if (window.App && App.DEMO) return;
  fetch(BASE + "combat/liste.json").then((r) => (r.ok ? r.json() : [])).then((l) => {
    remplacements = new Set((Array.isArray(l) ? l : []).map(String).filter((n) => /^[\w-]+$/.test(n)));
    remplacements.forEach((n) => tampon("combat/" + n + ".mp3"));
  }).catch(() => {});
}

const VARIATION_PITCH = 1.5; // demi-tons, en plus ou en moins, sur les bruitages joués depuis un fichier
// jouer("slash_katana", { pan, retard (s), fichiers: "a.mp3,b.mp3", vol, envoi, pitch })
// Priorité : fichier de l'objet (catalogue) > fichier d'événement (sons/combat/) > synthèse.
function jouer(nom, o = {}) {
  if (!actif || !ctx || ctx.state === "closed") return;
  const f = fichierDisponible(o.fichiers) || (remplacements.has(nom) && fichiers.get("combat/" + nom + ".mp3") !== null ? "combat/" + nom + ".mp3" : null);
  const t = ctx.currentTime + Math.max(0, o.retard || 0);
  if (f) {
    const b = fichiers.get(f);
    if (b && !(b instanceof Promise)) {
      const src = ctx.createBufferSource(), g = ctx.createGain(); src.buffer = b; g.gain.value = o.vol ?? 0.9;
      // Le même fichier ne sonne jamais deux fois pareil : hauteur tirée au hasard à chaque coup (o.pitch pour l'imposer).
      src.playbackRate.value = o.pitch ?? Math.pow(2, (Math.random() * 2 - 1) * VARIATION_PITCH / 12);
      src.connect(g).connect(sortie(o.pan || 0, 0.12)); src.start(t); return;
    }
    tampon(f); // chargé pour la prochaine fois ; synthèse en attendant
  }
  const recette = SONS[nom];
  if (!recette) return;
  const s = sortie(o.pan || 0, o.envoi ?? 0.22);
  if (o.vol != null) s.gain.value = o.vol;
  try { recette(s, t, o); } catch (e) { console.warn(e); }
}

window.SFX = {
  demarrer, jouer, profilArme, profilStrategeme,
  precharger(csv) { if (!ctx || (window.App && App.DEMO)) return; nomsFichiers(csv).forEach(tampon); },
  musique,
  // Pause du combat : coupe toute l'horloge audio (bruitages et musique).
  suspendre(oui) { if (ctx && actif) (oui ? ctx.suspend() : ctx.resume()).catch(() => {}); },
  get actif() { return actif; },
  set actif(v) { actif = !!v; if (ctx) (actif ? ctx.resume() : ctx.suspend()).catch(() => {}); },
  get volume() { return volume; },
  set volume(v) { volume = clamp(Number(v) || 0, 0, 1); if (maitre) maitre.gain.value = volume; },
  noms: Object.keys(SONS),
};
})();
