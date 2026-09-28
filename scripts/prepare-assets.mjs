// One-off asset pipeline: turns the heavy original brand files from
// legacy-live-snapshot/ into web-sized versions. Run: node scripts/prepare-assets.mjs
import sharp from 'sharp';
import { copyFile, writeFile } from 'node:fs/promises';

const SRC = 'legacy-live-snapshot';
const NAVY = '#0B1F41';
const logo = `${SRC}/logo.png`; // 2845x2845, gold on transparent

// Emblem only (figure inside the circle), cropped from the full logo.
const k = 2845 / 400;
const emblem = await sharp(logo)
  .extract({ left: Math.round(52 * k), top: Math.round(8 * k), width: Math.round(312 * k), height: Math.round(284 * k) })
  .png()
  .toBuffer();

await sharp(emblem).resize({ height: 160 }).webp({ quality: 88 }).toFile('public/brand/emblem.webp');
await sharp(emblem).resize({ height: 160 }).png({ compressionLevel: 9 }).toFile('public/brand/emblem.png');
await sharp(logo).resize(640).webp({ quality: 88 }).toFile('public/brand/logo.webp');
await sharp(logo).resize(512).png({ compressionLevel: 9 }).toFile('public/brand/logo-512.png');

// Favicons / app icons: emblem on navy.
async function icon(size, file, pad = 0.14) {
  const inner = Math.round(size * (1 - pad * 2));
  const e = await sharp(emblem).resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background: NAVY } })
    .composite([{ input: e, gravity: 'center' }])
    .png({ compressionLevel: 9 })
    .toFile(file);
}
await icon(32, 'public/favicon-32.png', 0.06);
await icon(180, 'public/apple-touch-icon.png');
await icon(192, 'public/icon-192.png');
await icon(512, 'public/icon-512.png');

// Open Graph: keep the existing Arabic card, build an English one.
await sharp(`${SRC}/opengraph.jpg`).jpeg({ quality: 82, mozjpeg: true }).toFile('public/og-ar.jpg');
const ogLogo = await sharp(logo).resize(420).toBuffer();
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0B1F41"/><stop offset="1" stop-color="#132F5E"/></linearGradient></defs>
  <rect width="1200" height="630" fill="url(#g)"/>
  <rect x="540" y="0" width="4" height="630" fill="#D1AD45" opacity=".35"/>
  <text x="590" y="245" font-family="DejaVu Sans, Arial, sans-serif" font-size="72" font-weight="700" fill="#FFFFFF">Clean you</text>
  <text x="590" y="325" font-family="DejaVu Sans, Arial, sans-serif" font-size="72" font-weight="700" fill="#EAD57D">can feel.</text>
  <text x="600" y="395" font-family="DejaVu Sans, Arial, sans-serif" font-size="27" fill="#C9D2E3">Homes · Villas · Buildings · Compounds</text>
  <text x="600" y="445" font-family="DejaVu Sans, Arial, sans-serif" font-size="27" fill="#C9D2E3">Khobar · Dammam · Jubail</text>
  <text x="600" y="545" font-family="DejaVu Sans, Arial, sans-serif" font-size="26" font-weight="700" fill="#D1AD45">CLEANSENSE.CO</text>
</svg>`;
await sharp(Buffer.from(svg))
  .composite([{ input: ogLogo, left: 60, top: 105 }])
  .jpeg({ quality: 82, mozjpeg: true })
  .toFile('public/og-en.jpg');

// Service photos (the live "carpet" and "post-construction" files were the same image).
for (const n of ['deep', 'villa', 'kitchen', 'carpet']) {
  await copyFile(`${SRC}/images/service-${n}.jpg`, `src/assets/images/${n}.jpg`);
}

await writeFile('public/site.webmanifest', JSON.stringify({
  name: 'Clean Sense | كلين سنس',
  short_name: 'Clean Sense',
  icons: [
    { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
    { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
  ],
  theme_color: NAVY,
  background_color: NAVY,
  display: 'standalone',
  start_url: '/',
}, null, 2));
console.log('assets ready');
