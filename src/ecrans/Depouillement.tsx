// Dépouillement d'une urne : l'urne tremble, le cadenas saute, l'assesseur
// tamponne « A VOTÉ ! », le couvercle s'ouvre et les enveloppes jaillissent ;
// chaque bulletin se déplie pour révéler l'objet, avec un éclat selon la
// rareté. Chaque citation est une vraie phrase sourcée.

import { AnimatePresence, motion } from 'framer-motion';
import { useMemo, useRef, useState } from 'react';
import { aDesPoses, PersoAnime } from '../composants/PersoAnime';
import { Portrait } from '../composants/Portrait';
import { Urne } from '../composants/Urne';
import { contenu, nomDe } from '../donnees';
import { useJeu, type Ecran as EcranT } from '../etat';
import { jouer } from '../lib/son';
import { BONUS_REF, BONUS_REF_NIVEAU } from '../moteur/constantes';
import { ajouterObjets, type ResultatAjout } from '../moteur/economie';
import { Alea, graineAleatoire } from '../moteur/rng';
import { ouvrirUrne, RARETE_DE_REF } from '../moteur/tirage-urnes';
import type { Rarete } from '../moteur/types';
import { Particules, type ApiParticules } from '../scenes/Particules';
import { partagerTirage } from '../lib/partage';

const ETOILES: Record<Rarete, number> = { commune: 1, rare: 2, epique: 3, legendaire: 5 };
const LIBELLE: Record<Rarete, string> = { commune: 'COMMUNE', rare: 'RARE', epique: 'ÉPIQUE', legendaire: 'LÉGENDAIRE' };
const EFFETS_LEGENDE: Record<string, string> = { attaque: 'GROSSE ATTAQUE', bouclier: 'BOUCLIER', soin: 'SOIN DE 20 PV', vol_combo: 'VOL DE COMBO' };
const COULEUR_ENVELOPPE: Record<Rarete, string> = { commune: '#d9c38f', rare: '#ff9a1f', epique: '#b46cff', legendaire: '#ffcc33' };

/** Enveloppe qui jaillit de l'urne vers l'emplacement de son bulletin. */
function EnveloppeVolante({ index, total, rarete }: { index: number; total: number; rarete: Rarete }) {
  const dx = (index - (total - 1) / 2) * 110;
  return (
    <motion.svg
      viewBox="0 0 70 46"
      className="urne-enveloppe-volante"
      initial={{ x: 0, y: 0, scale: 0.5, rotate: 0, opacity: 1 }}
      animate={{ x: [0, dx * 0.5, dx], y: [0, -220, -60], scale: [0.5, 1.1, 0.9], rotate: [0, index % 2 ? 200 : -200, 360], opacity: [1, 1, 0] }}
      transition={{ duration: 0.8, delay: index * 0.12, ease: 'easeOut' }}
    >
      <rect x="2" y="2" width="66" height="42" rx="3" fill={COULEUR_ENVELOPPE[rarete]} stroke="#0b1340" strokeWidth="3" />
      <path d="M2 2 L35 26 L68 2" fill="none" stroke="#0b1340" strokeWidth="3" />
    </motion.svg>
  );
}

function infosObjet(r: ResultatAjout) {
  const c = contenu();
  const cat = c.catalogue;
  const o = r.objet;
  const statut = r.converti ? `DOUBLON → +${r.converti} PALUCHES` : r.nouveau ? 'NOUVEAU !' : r.niveau ? `FUSION → NIVEAU ${r.niveau}` : '';
  if (o.type === 'ref') {
    const ref = cat.refs.get(o.id);
    const niveau = r.niveau ?? 1;
    const bonus = ref ? Math.round((BONUS_REF[ref.rarete] + BONUS_REF_NIVEAU * (niveau - 1)) * 100) : 0;
    return {
      rarete: ref ? RARETE_DE_REF[ref.rarete] : o.rarete,
      persoId: ref?.perso ?? null,
      nom: ref ? nomDe(ref.perso) : '',
      bulle: ref?.phrase ?? '',
      icone: '⚡',
      bonus: `+${bonus} % DÉGÂTS`,
      precision: '(sur bonne réponse)',
      statut,
      source: ref?.source.libelle,
      meme: !!ref?.meme,
    };
  }
  if (o.type === 'legende') {
    const l = cat.legendes.get(o.id);
    return {
      rarete: o.rarete,
      persoId: o.id,
      nom: l?.nom ?? o.id,
      bulle: l?.entree?.replique ?? `${l?.nom ?? ''} entre en scène !`,
      icone: '👑',
      bonus: `LÉGENDE : ${EFFETS_LEGENDE[l?.effet ?? ''] ?? ''}`,
      precision: '(à invoquer en débat)',
      statut,
      source: l?.entree?.source.libelle,
    };
  }
  if (o.type === 'chaos') {
    const x = cat.chaos.get(o.id);
    return { rarete: o.rarete, persoId: null, nom: x?.nom ?? o.id, bulle: x?.description ?? '', icone: '💥', bonus: 'CARTE CHAOS', precision: '(jauge Ambiance pleine)', statut, source: undefined };
  }
  const t = c.tenues.find((x) => x.id === o.id);
  return { rarete: o.rarete, persoId: null, nom: t?.nom ?? o.id, bulle: 'Nouveau look !', icone: '👔', bonus: 'TENUE', precision: '(purement visuelle)', statut, source: undefined };
}

function CarteTirage({ r, index, reduit }: { r: ResultatAjout; index: number; reduit: boolean }) {
  const info = infosObjet(r);
  // Les bulletins se déplient après la sortie des enveloppes ; une légendaire se fait attendre (roulement de tambour).
  const delai = reduit ? 0 : 0.9 + index * 0.35 + (info.rarete === 'legendaire' ? 0.8 : 0);
  return (
    <motion.div
      className={`carte-tirage bulletin tirage-${info.rarete}`}
      initial={reduit ? { opacity: 0 } : { rotateX: -90, scaleY: 0.2, y: 60, opacity: 0 }}
      animate={{ rotateX: 0, scaleY: 1, y: 0, opacity: 1 }}
      transition={{ delay: delai, type: 'spring', stiffness: 120, damping: 13 }}
      onAnimationStart={() => {
        if (info.rarete === 'legendaire' && !reduit) setTimeout(() => jouer('tambour'), Math.max(0, delai - 0.8) * 1000);
        setTimeout(() => {
          jouer('papier');
          jouer(info.rarete === 'legendaire' ? 'legendaire' : info.rarete === 'commune' ? 'clic' : 'bonne');
        }, delai * 1000);
      }}
    >
      <div className="tirage-onglet">
        {info.rarete === 'legendaire' && <span className="couronne">👑</span>}
        {LIBELLE[info.rarete]}
        <span className="etoiles">{'★'.repeat(ETOILES[info.rarete])}</span>
      </div>
      <div className="tirage-art">
        {info.persoId && aDesPoses(info.persoId) ? (
          <PersoAnime id={info.persoId} pose={info.rarete === 'legendaire' ? 'victoire' : 'moquerie'} taille={200} reduit={reduit} className="perso-vignette" />
        ) : info.persoId ? (
          <Portrait id={info.persoId} taille={220} />
        ) : (
          <span className="tirage-icone-grande">{r.objet.type === 'chaos' ? '💥' : '👔'}</span>
        )}
        {info.bulle && (
          <div className="tirage-bulle">
            <span>« {info.bulle} »</span>
          </div>
        )}
      </div>
      <div className="tirage-nom">{info.nom.toUpperCase()}</div>
      <div className="tirage-bonus">
        <span className="tirage-bonus-icone">{info.icone}</span>
        <span>
          <strong>{info.bonus}</strong>
          <small>{info.precision}</small>
        </span>
      </div>
      {info.statut && <span className="tirage-statut">{info.statut}</span>}
      {'meme' in info && info.meme && <span className="tirage-meme">MÈME</span>}
      {info.source && <span className="tirage-source">{info.source}</span>}
    </motion.div>
  );
}

type Etape = 'attente' | 'secoue' | 'tampon' | 'ouverte';

export function Depouillement({ urnes, retour }: { urnes: string[]; retour: EcranT }) {
  const { profil, majProfil, aller, animationsReduites } = useJeu();
  const c = contenu();
  const [file] = useState(() => [...urnes]);
  const [index, setIndex] = useState(0);
  const [resultats, setResultats] = useState<ResultatAjout[] | null>(null);
  const [etape, setEtape] = useState<Etape>('attente');
  const [message, setMessage] = useState<string | null>(null);
  const particules = useRef<ApiParticules>(null);
  const profilRef = useRef(profil);
  profilRef.current = profil;
  const urne = useMemo(() => c.urnes.find((u) => u.id === file[index]), [c, file, index]);
  const restantes = file.length - index;

  const ouvrir = () => {
    if (!urne || resultats || etape !== 'attente') return;
    const r = animationsReduites;
    setEtape('secoue');
    jouer('urne');
    setTimeout(() => {
      jouer('cadenas');
      jouer('tampon');
      setEtape('tampon');
    }, r ? 50 : 700);
    setTimeout(
      () => {
        const objets = ouvrirUrne(urne, c.contenuUrnes, new Alea(graineAleatoire()));
        const p = profilRef.current;
        const i = p.urnes.indexOf(urne.id);
        const sans = i >= 0 ? { ...p, urnes: [...p.urnes.slice(0, i), ...p.urnes.slice(i + 1)] } : p;
        const res = ajouterObjets(sans, objets);
        majProfil(() => res.profil);
        setResultats(res.resultats);
        setEtape('ouverte');
        jouer('applaudissements');
        particules.current?.emettre('confettis', { duree: 1.6, nombre: 5 });
        if (res.resultats.some((x) => x.objet.rarete === 'legendaire')) setTimeout(() => particules.current?.emettre('etincelles', { x: 0.5, y: 0.45, nombre: 90 }), 2200);
      },
      r ? 100 : 1500,
    );
  };

  const continuer = () => {
    jouer('clic');
    setResultats(null);
    setMessage(null);
    setEtape('attente');
    setIndex(index + 1);
  };

  if (!urne || restantes <= 0) {
    return (
      <main className="ecran-pack fin-pack">
        <Particules ref={particules} reduit={animationsReduites} />
        <div className="titre-pinceau grand">
          <h1>DÉPOUILLEMENT TERMINÉ !</h1>
          <p>Équipe tes nouvelles refs dans ton deck avant le prochain débat.</p>
        </div>
        <div className="fin-pack-boutons">
          <button type="button" className="bouton-cest-parti" onClick={() => aller(retour)}>
            CONTINUER
          </button>
          <button type="button" className="bouton-retour-maquette" onClick={() => aller({ nom: 'collection' })}>
            MA COLLECTION
          </button>
        </div>
      </main>
    );
  }

  const nbRefs = resultats?.filter((r) => r.objet.type === 'ref').length ?? 0;
  const aLegendaire = !!resultats?.some((r) => r.objet.rarete === 'legendaire');
  const raretes = resultats?.map((r) => infosObjet(r).rarete);

  return (
    <main className="ecran-pack">
      <Particules ref={particules} reduit={animationsReduites} />

      <div className="pack-coin">
        <Urne couleur={urne.couleur} enveloppes={Math.max(0, restantes - 1)} taille={130} id="coin" cadenas />
      </div>

      <header className="pack-entete">
        <div className="titre-pinceau grand">
          <h1>DÉPOUILLEMENT !</h1>
          <p>
            {resultats
              ? nbRefs === resultats.length
                ? `${nbRefs} RÉFÉRENCE${nbRefs > 1 ? 'S' : ''} OBTENUE${nbRefs > 1 ? 'S' : ''} !`
                : `${resultats.length} BULLETINS, DONT ${nbRefs} RÉFÉRENCE${nbRefs > 1 ? 'S' : ''} !`
              : `${urne.nom.toUpperCase()} · ${urne.objets} BULLETINS À DÉPOUILLER`}
          </p>
        </div>
        {aLegendaire && (
          <div className="annotation annotation-legende">
            Et si c’était
            <br />
            le moment de
            <br />
            la légende ? ↘
          </div>
        )}
      </header>

      {!resultats ? (
        <div className="pack-centre">
          <motion.button
            type="button"
            className="pack-a-ouvrir"
            onClick={ouvrir}
            animate={
              etape === 'attente'
                ? { y: [0, -10, 0], rotate: [-2, 2, -2] }
                : { rotate: [0, -8, 8, -10, 10, -6, 6, 0], scale: [1, 1.05, 1.1, 1.15] }
            }
            transition={etape === 'attente' ? { duration: 2, repeat: Infinity } : { duration: 0.9 }}
          >
            <Urne couleur={urne.couleur} enveloppes={urne.objets} taille={260} id="centre" cadenas={etape === 'attente' || etape === 'secoue'} />
          </motion.button>
          <AnimatePresence>
            {etape === 'tampon' && (
              <motion.div
                className="tampon-a-vote"
                initial={{ scale: 3, opacity: 0, rotate: -25, x: '-50%', y: '-50%' }}
                animate={{ scale: 1, opacity: 1, rotate: -12, x: '-50%', y: '-50%' }}
                exit={{ opacity: 0 }}
                transition={{ type: 'spring', stiffness: 500, damping: 18 }}
              >
                A VOTÉ !
              </motion.div>
            )}
          </AnimatePresence>
          <span className="pack-compte">
            Urne {index + 1}/{file.length}
          </span>
        </div>
      ) : (
        <>
          {!animationsReduites && (
            <div className="pack-centre urne-ouverte" aria-hidden>
              <Urne couleur={urne.couleur} enveloppes={0} taille={160} id="ouverte" ouverte cadenas={false} />
              {raretes?.map((rar, i) => <EnveloppeVolante key={i} index={i} total={raretes.length} rarete={rar} />)}
            </div>
          )}
          <section className={`rangee-tirage ${resultats.length > 5 ? 'nombreux' : ''}`}>
            {resultats.map((r, i) => (
              <CarteTirage key={i} r={r} index={i} reduit={animationsReduites} />
            ))}
          </section>
        </>
      )}

      <footer className="pack-pied">
        <div className="annotation annotation-bas">
          <span className="couronne-dessin">♛</span>
          Des citations,
          <br />
          des punchlines,
          <br />
          des légendes !
        </div>
        <button type="button" className="bouton-toucher" onClick={resultats ? continuer : ouvrir}>
          {resultats ? (restantes > 1 ? 'TOUCHE POUR L’URNE SUIVANTE' : 'TOUCHE POUR TERMINER') : 'TOUCHE POUR DÉPOUILLER'}
        </button>
        <button
          type="button"
          className="bulle-partage"
          disabled={!resultats}
          onClick={async () => {
            if (!resultats) return;
            const r = await partagerTirage(
              resultats.map((x) => {
                const i = infosObjet(x);
                return { rarete: LIBELLE[i.rarete], nom: i.nom, texte: i.bulle };
              }),
            );
            setMessage(r === 'echec' ? 'Partage impossible sur cet appareil.' : r === 'telecharge' ? 'Image du dépouillement téléchargée !' : 'Dépouillement partagé !');
          }}
        >
          <span className="partage-texte">
            📱 ➜ PARTAGE TON DÉPOUILLEMENT
            <br />
            SUR LES RÉSEAUX !
          </span>
          <span className="partage-icones" aria-hidden>
            <i className="ico ico-tiktok">♪</i>
            <i className="ico ico-insta">◎</i>
            <i className="ico ico-x">𝕏</i>
          </span>
        </button>
      </footer>
      {message && <div className="toast">{message}</div>}
    </main>
  );
}
