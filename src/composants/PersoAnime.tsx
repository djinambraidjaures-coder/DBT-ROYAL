// Personnage animé à partir de ses poses découpées dans les planches
// (public/persos/<id>/<pose>.webp, liste dans src/data/poses.json).
// Une pose absente est remplacée par une pose voisine du même personnage,
// jamais par l'image de quelqu'un d'autre. Sans aucune pose : Portrait classique.

import { useEffect, useState } from 'react';
import posesDispo from '../data/poses.json';
import { Portrait } from './Portrait';

export type Pose = 'neutre' | 'argumente' | 'attaque' | 'colere' | 'gene' | 'moquerie' | 'ko' | 'victoire';

const DISPO = posesDispo as Record<string, Pose[]>;

/** Ordre de repli de chaque pose (toujours sur le même personnage). */
const REPLIS: Record<Pose, Pose[]> = {
  neutre: [],
  argumente: ['neutre'],
  attaque: ['argumente', 'colere', 'neutre'],
  colere: ['gene', 'attaque', 'neutre'],
  gene: ['colere', 'neutre'],
  moquerie: ['victoire', 'argumente', 'neutre'],
  ko: ['gene', 'colere', 'neutre'],
  victoire: ['moquerie', 'attaque', 'argumente', 'neutre'],
};

export const aDesPoses = (id: string) => (DISPO[id]?.length ?? 0) > 0;

export const sourcesPoses = (id: string) => (DISPO[id] ?? []).map((p) => `/persos/${id}/${p}.webp`);

/** Image réellement affichée pour une pose demandée. */
export function poseAffichee(id: string, pose: Pose): Pose | null {
  const l = DISPO[id];
  if (!l?.length) return null;
  for (const p of [pose, ...REPLIS[pose]]) if (l.includes(p)) return p;
  return l[0];
}

interface Props {
  id: string;
  pose?: Pose;
  miroir?: boolean;
  /** Recoloration (même personnage des deux côtés). */
  teinte?: number;
  taille?: number;
  tenue?: string;
  reduit?: boolean;
  className?: string;
}

export function PersoAnime({ id, pose = 'neutre', miroir, teinte, taille = 260, tenue, reduit, className = '' }: Props) {
  const affichee = poseAffichee(id, pose);
  // Décalage aléatoire de la respiration pour que les deux combattants ne bougent pas en même temps.
  const [decalage] = useState(() => -Math.random() * 3);
  const [vue, setVue] = useState(0);
  useEffect(() => setVue((v) => v + 1), [pose]);

  if (!affichee) return <Portrait id={id} variante="pied" taille={taille} tenue={tenue} miroir={miroir} className={className} />;

  // Pose remplacée par un repli : on garde l'effet visuel de la pose demandée.
  const filtres = [pose === 'ko' && affichee !== 'ko' ? 'grayscale(0.7)' : '', teinte ? `hue-rotate(${teinte}deg) saturate(1.2)` : ''].filter(Boolean).join(' ');
  return (
    <div
      className={`perso-anime ${reduit ? '' : 'idle'} ${className}`}
      style={{ width: taille, height: taille, ['--decalage' as string]: `${decalage}s` }}
      title={id}
    >
      <div className={`perso-miroir ${miroir ? 'miroir' : ''}`}>
        <div key={vue} className={`perso-pose ${reduit ? 'pose-fondu' : `pose-${pose}`}`}>
          <img src={`/persos/${id}/${affichee}.webp`} alt="" draggable={false} style={{ filter: filtres || undefined }} />
          {pose === 'ko' && !reduit && (
            <span className="perso-etoiles" aria-hidden>
              <i>★</i>
              <i>★</i>
              <i>★</i>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
