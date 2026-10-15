// Urne électorale française transparente (plexiglas), dans la matière de
// l'urne : bois, argent, or, violet royal. On voit les enveloppes à l'intérieur.

import { motion } from 'framer-motion';
import type { Rarete } from '../moteur/types';

const COULEUR_RARETE: Record<Rarete, string> = {
  commune: '#c8b98a',
  rare: '#ff9a1f',
  epique: '#b46cff',
  legendaire: '#ffcc33',
};

interface Props {
  couleur: string;
  taille?: number;
  /** nombre d'enveloppes visibles dans l'urne */
  enveloppes?: number;
  /** rareté de chaque enveloppe une fois tirée (sinon kraft) */
  raretes?: Rarete[];
  ouverte?: boolean;
  cadenas?: boolean;
  id?: string;
}

/** Positions fixes des enveloppes en tas au fond de l'urne. */
const TAS = [
  { x: 40, y: 150, r: -12 },
  { x: 92, y: 154, r: 8 },
  { x: 140, y: 148, r: -4 },
  { x: 62, y: 128, r: 16 },
  { x: 116, y: 126, r: -14 },
  { x: 88, y: 104, r: 4 },
  { x: 48, y: 104, r: -20 },
  { x: 132, y: 100, r: 18 },
];

export function Urne({ couleur, taille = 200, enveloppes = 3, raretes, ouverte, cadenas = true, id = 'u' }: Props) {
  const gid = `urne-${id}`;
  return (
    <svg viewBox="0 0 220 240" width={taille} height={taille * (240 / 220)} className="urne-svg" aria-label="Urne">
      <defs>
        <linearGradient id={`${gid}-matiere`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.45" />
          <stop offset="0.45" stopColor={couleur} stopOpacity="1" />
          <stop offset="1" stopColor="#000" stopOpacity="0.35" />
        </linearGradient>
        <linearGradient id={`${gid}-verre`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#e9f6ff" stopOpacity="0.55" />
          <stop offset="0.5" stopColor="#bfe3ff" stopOpacity="0.18" />
          <stop offset="1" stopColor="#e9f6ff" stopOpacity="0.4" />
        </linearGradient>
      </defs>

      {/* ombre au sol */}
      <ellipse cx="110" cy="230" rx="96" ry="8" fill="#000" opacity="0.3" />

      {/* paroi arrière */}
      <rect x="22" y="58" width="176" height="150" fill="#0b1340" opacity="0.25" />

      {/* enveloppes à l'intérieur */}
      {TAS.slice(0, Math.min(enveloppes, TAS.length)).map((p, i) => (
        <g key={i} transform={`translate(${p.x} ${p.y}) rotate(${p.r})`}>
          <rect x="0" y="0" width="46" height="30" rx="2" fill={raretes?.[i] ? COULEUR_RARETE[raretes[i]] : '#d9c38f'} stroke="#0b1340" strokeWidth="2.5" />
          <path d="M0 0 L23 17 L46 0" fill="none" stroke="#0b1340" strokeWidth="2" />
        </g>
      ))}

      {/* parois en plexiglas */}
      <rect x="22" y="58" width="176" height="150" fill={`url(#${gid}-verre)`} stroke="#0b1340" strokeWidth="5" />
      <path d="M40 70 L58 70 L36 196 L28 196 Z" fill="#fff" opacity="0.35" />
      <path d="M170 70 L176 70 L168 150 L164 150 Z" fill="#fff" opacity="0.25" />

      {/* montants et socle dans la matière de l'urne */}
      <rect x="14" y="200" width="192" height="20" rx="4" fill={`url(#${gid}-matiere)`} stroke="#0b1340" strokeWidth="5" />
      <rect x="16" y="56" width="12" height="148" fill={`url(#${gid}-matiere)`} stroke="#0b1340" strokeWidth="4" />
      <rect x="192" y="56" width="12" height="148" fill={`url(#${gid}-matiere)`} stroke="#0b1340" strokeWidth="4" />

      {/* couvercle avec fente */}
      <motion.g
        initial={false}
        animate={ouverte ? { rotate: -38, x: -30, y: -40 } : { rotate: 0, x: 0, y: 0 }}
        transition={{ type: 'spring', stiffness: 160, damping: 12 }}
        style={{ originX: '12px', originY: '50px' }}
      >
        <rect x="8" y="38" width="204" height="24" rx="5" fill={`url(#${gid}-matiere)`} stroke="#0b1340" strokeWidth="5" />
        <rect x="76" y="45" width="68" height="9" rx="3" fill="#0b1340" />
        <text x="110" y="34" textAnchor="middle" fontFamily="'Luckiest Guy', system-ui" fontSize="16" fill="#fff" stroke="#0b1340" strokeWidth="4" paintOrder="stroke">
          RÉPUBLIQUE FRANÇAISE
        </text>
      </motion.g>

      {/* cadenas */}
      {cadenas && (
        <g transform="translate(100 64)">
          <path d="M4 10 V4 a6 6 0 0 1 12 0 V10" fill="none" stroke="#0b1340" strokeWidth="4" />
          <rect x="0" y="9" width="20" height="16" rx="3" fill="#ffcc33" stroke="#0b1340" strokeWidth="3" />
          <circle cx="10" cy="17" r="2.5" fill="#0b1340" />
        </g>
      )}

      {/* compteur d'enveloppes */}
      <g transform="translate(150 166)">
        <rect x="0" y="0" width="40" height="24" rx="4" fill="#0b1340" />
        <text x="20" y="18" textAnchor="middle" fontFamily="'Barlow Condensed', system-ui" fontWeight="800" fontSize="17" fill="#7CFFB2">
          {String(enveloppes).padStart(3, '0')}
        </text>
      </g>
    </svg>
  );
}
