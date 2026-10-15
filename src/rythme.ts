// Tous les délais d'interface du débat (en millisecondes), au même endroit.
// « Vitesse ×2 » divise tout par deux ; le choix est gardé dans le navigateur.

export const RYTHME = {
  entree: 1100, // réplique d'entrée d'un candidat
  annonce: 1100, // annonce du sujet par le modérateur
  ultimeAnnonce: 400,
  avantDegat: 200, // entre l'élan et l'impact
  apresCoup: 900,
  erreur: 900,
  bouclier: 700,
  legendeEntree: 1200,
  legendeEffet: 700,
  apresChaos: 400,
  brulure: 700,
  tourPerdu: 900,
  soin: 400,
  changeSujet: 1000,
  ko: 2000,
  reflexionIA: 650, // l'adversaire « prépare sa réponse »
  suiteIA: 250, // après l'animation du coup adverse
  suiteBonne: 1200, // résultat d'une bonne réponse avant d'enchaîner seul
  commencerManche: 250,
  retourPose: 1100, // retour à la pose neutre
};

const CLE = 'debat-royale-vitesse';
let facteur = 1;
try {
  facteur = localStorage.getItem(CLE) === '2' ? 2 : 1;
} catch {
  /* stockage indisponible */
}

export const vitesseRapide = () => facteur === 2;

export function changerVitesse(rapide: boolean): void {
  facteur = rapide ? 2 : 1;
  try {
    localStorage.setItem(CLE, rapide ? '2' : '1');
  } catch {
    /* stockage indisponible */
  }
}

/** Délai d'une étape ; `reduit` (animations réduites) accélère encore. */
export const duree = (cle: keyof typeof RYTHME, reduit = false) => (RYTHME[cle] / facteur) * (reduit ? 0.5 : 1);
