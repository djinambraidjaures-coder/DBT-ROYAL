// Son du jeu : un petit mixeur Web Audio à trois canaux (musique, ambiance,
// effets). Chaque son a une version synthétisée ; si un fichier
// public/sons/<nom>.mp3 existe, il est joué à la place. L'audio ne démarre
// qu'après le premier geste de l'utilisateur (politique d'autoplay).

export type Canal = 'musique' | 'ambiance' | 'effets';
export type Ambiance = 'plateau' | 'menu' | null;

const CLE_VOLUMES = 'debat-royale-volumes';
const volumesParDefaut: Record<Canal, number> = { musique: 0.5, ambiance: 0.7, effets: 0.9 };

let actif = true;
let volumes: Record<Canal, number> = { ...volumesParDefaut };
try {
  volumes = { ...volumesParDefaut, ...JSON.parse(localStorage.getItem(CLE_VOLUMES) ?? '{}') };
} catch {
  /* stockage indisponible */
}

let ctx: AudioContext | null = null;
let maitre: GainNode;
const canaux = {} as Record<Canal, GainNode>;
const sousGain = {} as Record<'musique' | 'ambiance', GainNode>; // pour le ducking
const fichiers = new Map<string, AudioBuffer | 'absent' | Promise<void>>();

function audio(): AudioContext | null {
  if (ctx) return ctx;
  try {
    ctx = new AudioContext();
  } catch {
    return null;
  }
  maitre = ctx.createGain();
  maitre.gain.value = actif ? 1 : 0;
  maitre.connect(ctx.destination);
  for (const c of ['musique', 'ambiance', 'effets'] as Canal[]) {
    canaux[c] = ctx.createGain();
    canaux[c].gain.value = volumes[c];
    canaux[c].connect(maitre);
  }
  for (const c of ['musique', 'ambiance'] as const) {
    sousGain[c] = ctx.createGain();
    sousGain[c].connect(canaux[c]);
  }
  return ctx;
}

// Déverrouillage au premier geste, pause quand l'onglet est caché.
if (typeof window !== 'undefined') {
  const debloquer = () => {
    const a = audio();
    a?.resume()
      .then(() => {
        if (ambianceVoulue && !ambianceEnCours) demarrerAmbiance(ambianceVoulue);
      })
      .catch(() => undefined);
  };
  window.addEventListener('pointerdown', debloquer);
  window.addEventListener('keydown', debloquer);
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.hidden) ctx.suspend().catch(() => undefined);
    else ctx.resume().catch(() => undefined);
  });
}

const pret = () => !!ctx && ctx.state === 'running';

// ---------------------------------------------------------------------------
// Réglages

export function activerSon(v: boolean): void {
  actif = v;
  if (ctx) maitre.gain.setTargetAtTime(v ? 1 : 0, ctx.currentTime, 0.05);
}

export const lireVolumes = () => ({ ...volumes });

export function reglerVolume(c: Canal, v: number): void {
  volumes[c] = v;
  if (ctx) canaux[c].gain.setTargetAtTime(v, ctx.currentTime, 0.05);
  try {
    localStorage.setItem(CLE_VOLUMES, JSON.stringify(volumes));
  } catch {
    /* stockage indisponible */
  }
}

/** Baisse musique et ambiance pendant une réplique ou une animation importante. */
export function duck(ms = 1500, niveau = 0.35): void {
  if (!ctx) return;
  const t = ctx.currentTime;
  for (const g of Object.values(sousGain)) {
    g.gain.cancelScheduledValues(t);
    g.gain.setTargetAtTime(niveau, t, 0.08);
    g.gain.setTargetAtTime(1, t + ms / 1000, 0.3);
  }
}

// ---------------------------------------------------------------------------
// Briques de synthèse

let bruitBlanc: AudioBuffer | null = null;
function bruit(a: AudioContext): AudioBuffer {
  if (bruitBlanc) return bruitBlanc;
  const n = a.sampleRate * 2;
  bruitBlanc = a.createBuffer(1, n, a.sampleRate);
  const d = bruitBlanc.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  return bruitBlanc;
}

interface Env {
  a?: number; // attaque (s)
  d: number; // durée totale (s)
  v?: number; // volume crête
}

function enveloppe(a: AudioContext, t: number, e: Env, sortie: AudioNode): GainNode {
  const g = a.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(e.v ?? 0.3, t + (e.a ?? 0.005));
  g.gain.exponentialRampToValueAtTime(0.0001, t + e.d);
  g.connect(sortie);
  return g;
}

function souffle(a: AudioContext, t: number, e: Env, filtre: { type: BiquadFilterType; f: number; q?: number; f2?: number }, sortie: AudioNode) {
  const src = a.createBufferSource();
  src.buffer = bruit(a);
  src.loop = true;
  const bq = a.createBiquadFilter();
  bq.type = filtre.type;
  bq.frequency.setValueAtTime(filtre.f, t);
  if (filtre.f2) bq.frequency.exponentialRampToValueAtTime(filtre.f2, t + e.d);
  bq.Q.value = filtre.q ?? 1;
  src.connect(bq).connect(enveloppe(a, t, e, sortie));
  src.start(t, Math.random());
  src.stop(t + e.d + 0.05);
}

function ton(a: AudioContext, t: number, e: Env, f: number, type: OscillatorType, sortie: AudioNode, f2?: number) {
  const o = a.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + e.d);
  o.connect(enveloppe(a, t, e, sortie));
  o.start(t);
  o.stop(t + e.d + 0.05);
}

/** Voix synthétique (oscillateur filtré par un formant) : huées, « ooh », rires. */
function voix(a: AudioContext, t: number, e: Env, f: number, f2: number, formant: number, sortie: AudioNode) {
  const bq = a.createBiquadFilter();
  bq.type = 'bandpass';
  bq.frequency.value = formant;
  bq.Q.value = 3;
  bq.connect(sortie);
  const o = a.createOscillator();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(f, t);
  o.frequency.linearRampToValueAtTime(f2, t + e.d);
  const vib = a.createOscillator();
  vib.frequency.value = 5 + Math.random() * 2;
  const vibG = a.createGain();
  vibG.gain.value = f * 0.02;
  vib.connect(vibG).connect(o.frequency);
  o.connect(enveloppe(a, t, e, bq));
  o.start(t);
  vib.start(t);
  o.stop(t + e.d + 0.05);
  vib.stop(t + e.d + 0.05);
}

const r = (min: number, max: number) => min + Math.random() * (max - min);

function applaudir(a: AudioContext, t: number, duree: number, densite: number, s: AudioNode) {
  const n = Math.round(duree * densite);
  for (let i = 0; i < n; i++) {
    const ti = t + (i / n) * duree + r(0, 0.03);
    souffle(a, ti, { d: r(0.02, 0.05), v: 0.25 * (0.3 + 1 - i / n) }, { type: 'bandpass', f: r(900, 2600), q: 1.5 }, s);
  }
}

type Synthe = (a: AudioContext, t: number, s: AudioNode) => void;

/** Sons synthétisés, par nom. `s` est la sortie (canal effets). */
const SYNTHES: Record<string, Synthe> = {
  clic: (a, t, s) => ton(a, t, { d: 0.05, v: 0.15 }, 900, 'square', s, 600),
  tic: (a, t, s) => souffle(a, t, { d: 0.04, v: 0.35 }, { type: 'highpass', f: 3000 }, s),
  ding: (a, t, s) => {
    ton(a, t, { d: 0.8, v: 0.25 }, 1046, 'sine', s);
    ton(a, t, { d: 0.5, v: 0.1 }, 2093, 'sine', s);
  },
  bonne: (a, t, s) => {
    ton(a, t, { d: 0.15, v: 0.2 }, 784, 'triangle', s);
    ton(a, t + 0.1, { d: 0.35, v: 0.22 }, 1175, 'triangle', s);
  },
  erreur: (a, t, s) => ton(a, t, { d: 0.5, v: 0.18 }, 110, 'square', s, 90),
  coup: (a, t, s) => {
    ton(a, t, { d: 0.25, v: 0.6 }, 140, 'sine', s, 40);
    souffle(a, t, { d: 0.08, v: 0.4 }, { type: 'lowpass', f: 2500 }, s);
  },
  critique: (a, t, s) => {
    ton(a, t, { d: 0.35, v: 0.7 }, 160, 'sine', s, 35);
    souffle(a, t, { d: 0.3, v: 0.4 }, { type: 'bandpass', f: 4000, f2: 600, q: 0.7 }, s);
    ton(a, t, { d: 0.4, v: 0.12 }, 400, 'sawtooth', s, 1600);
  },
  ko: (a, t, s) => {
    for (const [f, v] of [[110, 0.5], [173, 0.25], [262, 0.18], [347, 0.1]] as const) ton(a, t, { d: 2.4, v, a: 0.01 }, f, 'sine', s, f * 0.7);
    souffle(a, t, { d: 0.5, v: 0.5 }, { type: 'lowpass', f: 800 }, s);
  },
  cloche: (a, t, s) => {
    for (const [f, v] of [[880, 0.25], [1320, 0.12], [2240, 0.06]] as const) ton(a, t, { d: 1.6, v }, f, 'sine', s);
  },
  jingle: (a, t, s) => {
    [523, 659, 784, 1046].forEach((f, i) => ton(a, t + i * 0.11, { d: 0.35, v: 0.18 }, f, 'triangle', s));
    ton(a, t + 0.44, { d: 0.9, v: 0.12 }, 1568, 'sine', s);
  },
  legendaire: (a, t, s) => {
    [523, 659, 784, 1046, 1318, 1568].forEach((f, i) => ton(a, t + i * 0.07, { d: 1.2, v: 0.12 }, f, 'triangle', s));
    souffle(a, t, { a: 0.3, d: 1.6, v: 0.08 }, { type: 'highpass', f: 6000 }, s);
  },
  alarme: (a, t, s) => {
    for (let i = 0; i < 4; i++) ton(a, t + i * 0.25, { d: 0.22, v: 0.15 }, i % 2 ? 660 : 880, 'square', s);
  },
  alerte: (a, t, s) => {
    for (let i = 0; i < 3; i++) ton(a, t + i * 0.18, { d: 0.15, v: 0.15 }, 990, 'square', s, 740);
  },
  coupure: (a, t, s) => ton(a, t, { d: 0.8, v: 0.15 }, 1000, 'sine', s),
  'court-circuit': (a, t, s) => {
    for (let i = 0; i < 6; i++) souffle(a, t + i * r(0.04, 0.12), { d: 0.05, v: 0.4 }, { type: 'highpass', f: 2000 }, s);
    ton(a, t, { d: 0.6, v: 0.1 }, 60, 'sawtooth', s);
  },
  zapping: (a, t, s) => souffle(a, t, { d: 0.4, v: 0.3 }, { type: 'bandpass', f: 3000, f2: 500, q: 2 }, s),
  notif: (a, t, s) => {
    ton(a, t, { d: 0.12, v: 0.15 }, 1318, 'sine', s);
    ton(a, t + 0.1, { d: 0.2, v: 0.15 }, 1760, 'sine', s);
  },
  coin: (a, t, s) => {
    for (let i = 0; i < 3; i++) ton(a, t + i * 0.12, { d: 0.12, v: 0.2 }, 600 - i * 80, 'square', s, 500 - i * 80);
  },
  disco: (a, t, s) => {
    for (let i = 0; i < 8; i++) {
      ton(a, t + i * 0.25, { d: 0.15, v: 0.4 }, 120, 'sine', s, 50);
      souffle(a, t + i * 0.25 + 0.125, { d: 0.05, v: 0.15 }, { type: 'highpass', f: 7000 }, s);
    }
  },
  tracteur: (a, t, s) => {
    ton(a, t, { a: 0.2, d: 2, v: 0.2 }, 45, 'sawtooth', s, 55);
    souffle(a, t, { a: 0.2, d: 2, v: 0.08 }, { type: 'lowpass', f: 300 }, s);
  },
  casseroles: (a, t, s) => {
    for (let i = 0; i < 14; i++) ton(a, t + i * r(0.06, 0.14), { d: 0.12, v: 0.12 }, r(1800, 3200), 'square', s, r(1500, 2500));
  },
  urne: (a, t, s) => {
    for (let i = 0; i < 6; i++) souffle(a, t + i * 0.1, { d: 0.08, v: 0.3 }, { type: 'bandpass', f: r(600, 1200), q: 3 }, s);
  },
  cadenas: (a, t, s) => {
    souffle(a, t, { d: 0.03, v: 0.5 }, { type: 'highpass', f: 4000 }, s);
    ton(a, t + 0.06, { d: 0.15, v: 0.15 }, 2400, 'square', s, 1800);
  },
  tampon: (a, t, s) => {
    ton(a, t, { d: 0.15, v: 0.7 }, 120, 'sine', s, 50);
    souffle(a, t, { d: 0.1, v: 0.5 }, { type: 'lowpass', f: 1200 }, s);
  },
  papier: (a, t, s) => {
    for (let i = 0; i < 5; i++) souffle(a, t + i * 0.03, { d: 0.05, v: 0.2 }, { type: 'highpass', f: r(2500, 5000) }, s);
  },
  tambour: (a, t, s) => {
    for (let i = 0; i < 24; i++) souffle(a, t + i * 0.035, { d: 0.05, v: 0.1 + (i / 24) * 0.35 }, { type: 'bandpass', f: 220, q: 1 }, s);
    ton(a, t + 0.85, { d: 0.4, v: 0.5 }, 90, 'sine', s, 45);
  },

  // --- public ---
  applaudissements: (a, t, s) => applaudir(a, t, 1.6, 70, s),
  ovation: (a, t, s) => {
    applaudir(a, t, 2.6, 110, s);
    for (let i = 0; i < 5; i++) voix(a, t + r(0, 0.6), { a: 0.1, d: r(1, 1.8), v: 0.07 }, r(220, 340), r(260, 420), r(700, 1100), s);
    ton(a, t + 0.4, { a: 0.05, d: 0.6, v: 0.05 }, 2200, 'sine', s, 3200); // sifflet
  },
  huees: (a, t, s) => {
    for (let i = 0; i < 7; i++) voix(a, t + r(0, 0.3), { a: 0.15, d: r(1.1, 1.6), v: 0.09 }, r(110, 170), r(80, 120), r(350, 500), s);
  },
  ooh: (a, t, s) => {
    for (let i = 0; i < 7; i++) voix(a, t + r(0, 0.12), { a: 0.1, d: r(0.9, 1.3), v: 0.08 }, r(160, 260), r(260, 380), r(450, 650), s);
  },
  rires: (a, t, s) => {
    for (let p = 0; p < 4; p++) {
      const base = r(180, 320);
      const debut = t + r(0, 0.3);
      for (let i = 0; i < 6; i++) voix(a, debut + i * 0.13, { d: 0.1, v: 0.08 }, base * (1 - i * 0.03), base * 0.95, r(800, 1300), s);
    }
  },
  foule: (a, t, s) => {
    souffle(a, t, { a: 0.2, d: 1.6, v: 0.25 }, { type: 'bandpass', f: 700, q: 0.8 }, s);
    for (let i = 0; i < 5; i++) voix(a, t + r(0, 0.6), { a: 0.1, d: r(0.5, 1), v: 0.05 }, r(150, 300), r(150, 300), r(500, 1000), s);
  },
  scande: (a, t, s) => {
    for (let k = 0; k < 4; k++) {
      for (let i = 0; i < 6; i++) voix(a, t + k * 0.5 + r(0, 0.03), { d: 0.25, v: 0.06 }, r(150, 220), r(150, 220), 600, s);
      souffle(a, t + k * 0.5 + 0.25, { d: 0.05, v: 0.3 }, { type: 'bandpass', f: 1500, q: 1 }, s);
    }
  },
};
SYNTHES.impact = SYNTHES.coup;
SYNTHES['entree-praud'] = SYNTHES.jingle;
SYNTHES.brouhaha = SYNTHES.foule;
SYNTHES.manif = SYNTHES.scande;
SYNTHES.slogan = SYNTHES.scande;

// ---------------------------------------------------------------------------
// Lecture

const synthe = (a: AudioContext, nom: string) => (SYNTHES[nom] ?? SYNTHES.clic)(a, a.currentTime, canaux.effets);

export function jouer(nom: string): void {
  if (!actif || !nom) return;
  const a = audio();
  if (!a || !pret()) return;
  const deja = fichiers.get(nom);
  if (deja instanceof AudioBuffer) {
    const src = a.createBufferSource();
    src.buffer = deja;
    src.connect(canaux.effets);
    src.start();
    return;
  }
  if (deja === 'absent') return synthe(a, nom);
  if (deja) return; // fichier en cours de chargement
  // Premier appel : synthèse tout de suite, et on regarde si un fichier existe pour les fois suivantes.
  synthe(a, nom);
  fichiers.set(
    nom,
    fetch(`/sons/${nom}.mp3`)
      .then((rep) => (rep.ok && (rep.headers.get('content-type') ?? '').includes('audio') ? rep.arrayBuffer() : Promise.reject()))
      .then((buf) => a.decodeAudioData(buf))
      .then((b) => void fichiers.set(nom, b))
      .catch(() => void fichiers.set(nom, 'absent')),
  );
}

/** Son du public correspondant à une réaction de la foule. */
const SON_REACTION: Record<string, string> = {
  applaudit: 'applaudissements',
  hue: 'huees',
  rit: 'rires',
  debout: 'ovation',
  scande: 'scande',
  panique: 'brouhaha',
};
export function reactionPublic(reaction: string): void {
  const nom = SON_REACTION[reaction];
  if (nom) jouer(nom);
}

// ---------------------------------------------------------------------------
// Ambiances continues

let ambianceVoulue: Ambiance = null;
let ambianceEnCours: { nom: Ambiance; arreter: () => void } | null = null;
let intensite = 0.5;
let gainRumeur: GainNode | null = null;
let gainTension: GainNode | null = null;

/** Rumeur du plateau : foule qui murmure, toux, chaises, chuchotements. */
function ambiancePlateau(a: AudioContext, sortie: AudioNode): () => void {
  const src = a.createBufferSource();
  src.buffer = bruit(a);
  src.loop = true;
  const bp = a.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 450;
  bp.Q.value = 0.6;
  const lp = a.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 1400;
  const rumeur = a.createGain();
  rumeur.gain.value = 0.05 + intensite * 0.12;
  gainRumeur = rumeur;
  const lfo = a.createOscillator();
  lfo.frequency.value = 0.23;
  const lfoG = a.createGain();
  lfoG.gain.value = 0.025;
  lfo.connect(lfoG).connect(rumeur.gain);
  src.connect(bp).connect(lp).connect(rumeur).connect(sortie);
  src.start();
  lfo.start();

  // Tension : nappe grave, quand un camp est en danger.
  const gt = a.createGain();
  gt.gain.value = 0;
  gt.connect(sortie);
  gainTension = gt;
  const nappe = [55, 82.4, 110.5].map((f) => {
    const o = a.createOscillator();
    o.type = 'triangle';
    o.frequency.value = f;
    o.connect(gt);
    o.start();
    return o;
  });

  const minuteur = setInterval(() => {
    if (!pret()) return;
    const t = a.currentTime;
    const x = Math.random();
    if (x < 0.35) souffle(a, t, { d: 0.18, v: 0.1 }, { type: 'bandpass', f: r(700, 1200), q: 2 }, sortie); // toux
    else if (x < 0.55) souffle(a, t, { a: 0.05, d: 0.4, v: 0.05 }, { type: 'bandpass', f: 250, f2: 400, q: 4 }, sortie); // chaise
    else if (x < 0.75) voix(a, t, { a: 0.1, d: 0.6, v: 0.025 }, r(150, 260), r(150, 260), r(500, 900), sortie); // chuchotement
  }, 1400);

  return () => {
    clearInterval(minuteur);
    for (const n of [src, lfo, ...nappe]) {
      try {
        n.stop();
      } catch {
        /* déjà arrêté */
      }
    }
    if (gainRumeur === rumeur) gainRumeur = null;
    if (gainTension === gt) gainTension = null;
  };
}

/** Musique d'émission légère : basse, accords, charleston ; boucle de 4 mesures. */
function ambianceMenu(a: AudioContext, sortie: AudioNode): () => void {
  const accords = [
    [261.6, 329.6, 392],
    [220, 261.6, 329.6],
    [174.6, 220, 261.6],
    [196, 246.9, 293.7],
  ];
  const noire = 0.5;
  let pas = 0;
  let prochain = a.currentTime + 0.1;
  const planifier = () => {
    while (prochain < a.currentTime + 0.3) {
      const ch = accords[Math.floor(pas / 4) % 4];
      ton(a, prochain, { d: noire * 0.9, v: 0.14 }, ch[0] / 2, 'triangle', sortie);
      if (pas % 2 === 1) ch.forEach((f) => ton(a, prochain, { d: noire * 0.6, v: 0.035 }, f, 'square', sortie));
      if (pas % 4 === 0) souffle(a, prochain, { d: 0.12, v: 0.12 }, { type: 'lowpass', f: 180 }, sortie);
      souffle(a, prochain + noire / 2, { d: 0.03, v: 0.04 }, { type: 'highpass', f: 8000 }, sortie);
      pas++;
      prochain += noire;
    }
  };
  const minuteur = setInterval(planifier, 100);
  return () => clearInterval(minuteur);
}

/** Change d'ambiance avec un fondu enchaîné (attend le premier geste si besoin). */
export function demarrerAmbiance(nom: Ambiance): void {
  ambianceVoulue = nom;
  if (ambianceEnCours?.nom === nom) return;
  ambianceEnCours?.arreter();
  ambianceEnCours = null;
  const a = audio();
  if (!nom || !a || !pret()) return;
  const canal = nom === 'menu' ? 'musique' : 'ambiance';
  const fondu = a.createGain();
  fondu.gain.setValueAtTime(0.0001, a.currentTime);
  fondu.gain.exponentialRampToValueAtTime(1, a.currentTime + 1);
  fondu.connect(sousGain[canal]);
  const stop = nom === 'menu' ? ambianceMenu(a, fondu) : ambiancePlateau(a, fondu);
  if (nom === 'plateau') jouer('jingle');
  ambianceEnCours = {
    nom,
    arreter: () => {
      const t = a.currentTime;
      fondu.gain.cancelScheduledValues(t);
      fondu.gain.setValueAtTime(Math.max(0.0001, fondu.gain.value), t);
      fondu.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
      setTimeout(() => {
        stop();
        fondu.disconnect();
      }, 800);
    },
  };
}

/** Intensité de la rumeur du plateau (0 à 1), suit la jauge Ambiance. */
export function intensiteAmbiance(v: number): void {
  intensite = Math.max(0, Math.min(1, v));
  if (ctx && gainRumeur) gainRumeur.gain.setTargetAtTime(0.05 + intensite * 0.12, ctx.currentTime, 0.5);
}

/** Nappe de tension (un camp sous 25 PV). */
export function tension(on: boolean): void {
  if (ctx && gainTension) gainTension.gain.setTargetAtTime(on ? 0.05 : 0, ctx.currentTime, 0.6);
}

/** Silence brutal du public (K.O.). */
export function silence(ms = 700): void {
  duck(ms, 0.02);
}
