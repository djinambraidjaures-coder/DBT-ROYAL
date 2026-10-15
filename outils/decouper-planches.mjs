// Découpe les planches de poses (fond vert) en images transparentes.
//
//   node outils/decouper-planches.mjs apercu   → outils/planches/apercu-*.png (toutes les cases, pour vérifier)
//   node outils/decouper-planches.mjs          → public/persos/<id>/<pose>.webp + src/data/poses.json
//
// Seules les cases listées dans outils/planches/selection.json sont exportées :
// une case qui montre le visage d'un autre personnage n'y figure pas.

import sharp from 'sharp';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const POSES = ['neutre', 'argumente', 'attaque', 'colere', 'gene', 'moquerie', 'ko', 'victoire'];
const COTE = 512;

// Grille : 4 personnages par bande, 4 cases de 96 px par personnage.
// Pour chaque bande : [haut rangée 1, bas rangée 1, haut rangée 2, bas rangée 2].
const PLANCHES = {
  p1: {
    fichier: 'outils/planches/planche-1.jpg',
    bandes: [
      [36, 125, 125, 215],
      [251, 341, 341, 439],
      [471, 569, 569, 667],
      [695, 787, 787, 879],
      [907, 1010, null, null], // dernière bande coupée : poses 1 à 4 seulement
    ],
    persos: [
      ['macron', 'le-pen', 'melenchon', 'philippe'],
      ['attal', 'dati', 'bertrand', 'bayrou'],
      ['hidalgo', 'bardella', 'zemmour', 'pecresse'],
      ['poutou', 'dupont-aignan', 'asselineau', 'loiseau'],
      ['lavrilleux', 'roussel', 'royal', 'wauquiez'],
    ],
  },
  p2: {
    fichier: 'outils/planches/planche-2.jpg',
    bandes: [
      [48, 151, 151, 251],
      [302, 415, 415, 515],
      [564, 677, 677, 777],
      [824, 923, 923, 1023],
    ],
    persos: [
      ['macron', 'le-pen', 'melenchon', 'philippe'],
      ['attal', 'dati', 'bertrand', 'bayrou'],
      ['hidalgo', 'bardella', 'zemmour', 'pecresse'],
      ['poutou', 'dupont-aignan', 'asselineau', 'loiseau'],
    ],
  },
};

/** Rectangle d'une case : planche, id du perso, numéro de pose (0 à 7). */
function caseDe(cle, id, n) {
  const p = PLANCHES[cle];
  for (let b = 0; b < p.persos.length; b++) {
    const c = p.persos[b].indexOf(id);
    if (c < 0) continue;
    const [h1, b1, h2, b2] = p.bandes[b];
    const rangee = n < 4 ? 0 : 1;
    const haut = rangee ? h2 : h1;
    const bas = rangee ? b2 : b1;
    if (haut == null) return null;
    return { left: c * 384 + (n % 4) * 96, top: haut, width: 96, height: bas - haut };
  }
  return null;
}

/** Fond vert → transparent, avec bords adoucis et liseré vert neutralisé. */
async function detourer(fichier, r) {
  const { data, info } = await sharp(fichier).extract(r).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += 4) {
    const [R, G, B] = [data[i], data[i + 1], data[i + 2]];
    const ecart = G - Math.max(R, B);
    if (ecart > 70 && G > 120) data[i + 3] = 0;
    else if (ecart > 30) {
      data[i + 3] = Math.round(255 * (1 - (ecart - 30) / 40));
      data[i + 1] = Math.max(R, B); // retire la teinte verte du bord
    }
  }
  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
}

/** Centre la case sur une toile carrée, calée en bas (ligne d'épaules commune). */
async function poser(png) {
  const meta = await sharp(png).metadata();
  const echelle = Math.min(COTE / meta.width, COTE / meta.height);
  const w = Math.round(meta.width * echelle);
  const h = Math.round(meta.height * echelle);
  const img = await sharp(png).resize(w, h, { kernel: 'lanczos3' }).toBuffer();
  return sharp({ create: { width: COTE, height: COTE, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: img, left: Math.round((COTE - w) / 2), top: COTE - h }])
    .webp({ quality: 88, alphaQuality: 100 });
}

async function apercu() {
  for (const [cle, p] of Object.entries(PLANCHES)) {
    const ids = p.persos.flat();
    const morceaux = [];
    const L = 8 * 130 + 140;
    for (let k = 0; k < ids.length; k++) {
      morceaux.push({
        input: Buffer.from(`<svg width="140" height="130"><text x="4" y="70" font-size="18" font-family="Arial" font-weight="bold">${ids[k]}</text></svg>`),
        left: 0,
        top: k * 130,
      });
      for (let n = 0; n < 8; n++) {
        const r = caseDe(cle, ids[k], n);
        if (!r) continue;
        const img = await sharp(p.fichier).extract(r).resize({ height: 120 }).toBuffer();
        morceaux.push({ input: img, left: 140 + n * 130, top: k * 130 + 5 });
      }
    }
    await sharp({ create: { width: L, height: ids.length * 130, channels: 3, background: '#ffffff' } })
      .composite(morceaux)
      .png()
      .toFile(`outils/planches/apercu-${cle}.png`);
  }
}

async function exporter() {
  const selection = JSON.parse(await readFile('outils/planches/selection.json', 'utf8'));
  const poses = {};
  for (const [id, choix] of Object.entries(selection)) {
    if (id.startsWith('_')) continue;
    await mkdir(`public/persos/${id}`, { recursive: true });
    poses[id] = [];
    for (const pose of POSES) {
      const cle = choix[pose];
      if (!cle) continue;
      const r = caseDe(cle, id, POSES.indexOf(pose));
      if (!r) continue;
      const png = await detourer(PLANCHES[cle].fichier, r);
      await (await poser(png)).toFile(`public/persos/${id}/${pose}.webp`);
      poses[id].push(pose);
    }
  }
  await writeFile('src/data/poses.json', JSON.stringify(poses, null, 2) + '\n');
  console.log(Object.entries(poses).map(([id, p]) => `${id}: ${p.join(', ')}`).join('\n'));
}

if (process.argv[2] === 'apercu') await apercu();
else await exporter();
