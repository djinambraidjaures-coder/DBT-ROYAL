import { Combat } from './ecrans/Combat';
import { Accueil } from './ecrans/Accueil';
import { Boutique } from './ecrans/Boutique';
import { ChoixDebat } from './ecrans/ChoixDebat';
import { Collection } from './ecrans/Collection';
import { Deck } from './ecrans/Deck';
import { Depouillement } from './ecrans/Depouillement';
import { Fin } from './ecrans/Fin';
import { Programmes } from './ecrans/Programmes';
import { Selection } from './ecrans/Selection';
import { Tutoriel } from './ecrans/Tutoriel';
import { FournisseurJeu, useJeu } from './etat';
import { useEffect } from 'react';
import { ReglagesSon } from './composants/ReglagesSon';
import { demarrerAmbiance } from './lib/son';

function Routeur() {
  const { ecran, animationsReduites } = useJeu();
  let vue: JSX.Element;
  switch (ecran.nom) {
    case 'tutoriel':
      vue = <Tutoriel />;
      break;
    case 'choixDebat':
      vue = <ChoixDebat />;
      break;
    case 'selection':
      vue = <Selection debat={ecran.debat} tutoriel={ecran.tutoriel} />;
      break;
    case 'deck':
      vue = <Deck debat={ecran.debat} perso={ecran.perso} adversaire={ecran.adversaire} />;
      break;
    case 'combat':
      vue = <Combat key={ecran.config.graine} config={ecran.config} tutoriel={ecran.tutoriel} />;
      break;
    case 'fin':
      vue = <Fin etat={ecran.etat} gains={ecran.gains} tutoriel={ecran.tutoriel} />;
      break;
    case 'programmes':
      vue = <Programmes perso={ecran.perso} onglet={ecran.onglet} />;
      break;
    case 'collection':
      vue = <Collection />;
      break;
    case 'boutique':
      vue = <Boutique />;
      break;
    case 'depouillement':
      vue = <Depouillement urnes={ecran.urnes} retour={ecran.retour} />;
      break;
    default:
      vue = <Accueil />;
  }
  // Ambiance sonore : rumeur du plateau pendant le débat, musique d'émission ailleurs.
  const ambiance = ecran.nom === 'combat' ? 'plateau' : 'menu';
  useEffect(() => demarrerAmbiance(ambiance), [ambiance]);
  return (
    <div className={`app ${animationsReduites ? 'animations-reduites' : ''}`}>
      {vue}
      <ReglagesSon />
    </div>
  );
}

export default function App() {
  return (
    <FournisseurJeu>
      <Routeur />
    </FournisseurJeu>
  );
}
