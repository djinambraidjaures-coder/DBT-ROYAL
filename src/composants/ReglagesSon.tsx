import { useState } from 'react';
import { useJeu } from '../etat';
import { lireVolumes, reglerVolume, type Canal } from '../lib/son';

const LIBELLES: Record<Canal, string> = { musique: 'Musique', ambiance: 'Public', effets: 'Effets' };

/** Bouton flottant : son coupé (sauvegardé dans le profil) et volume de chaque canal. */
export function ReglagesSon() {
  const { profil, majProfil } = useJeu();
  const [ouvert, setOuvert] = useState(false);
  const [vol, setVol] = useState(lireVolumes);
  const actif = profil.reglages.son;
  return (
    <div className="reglages-son">
      {ouvert && (
        <div className="reglages-son-panneau">
          <label htmlFor="son-actif">Son</label>
          <input id="son-actif" type="checkbox" checked={actif} onChange={(e) => majProfil((p) => ({ ...p, reglages: { ...p.reglages, son: e.target.checked } }))} />
          {(Object.keys(LIBELLES) as Canal[]).map((c) => (
            <span key={c} style={{ display: 'contents' }}>
              <label htmlFor={`vol-${c}`}>{LIBELLES[c]}</label>
              <input
                id={`vol-${c}`}
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={vol[c]}
                disabled={!actif}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  reglerVolume(c, v);
                  setVol((x) => ({ ...x, [c]: v }));
                }}
              />
            </span>
          ))}
        </div>
      )}
      <button type="button" onClick={() => setOuvert(!ouvert)} title="Réglages du son" aria-label="Réglages du son">
        {actif ? '🔊' : '🔇'}
      </button>
    </div>
  );
}
