// Kopierer siden til dist/ og lager nedskalerte WebP-kopier av spillbildene.
import { copyFile, mkdir, readdir, rm } from 'node:fs/promises'
import sharp from 'sharp'

// Originalene ligger i static/1600. Hver bredde havner i dist/static/<bredde>/.
const SRC = 'static/1600'
const OUT = 'dist'
const WIDTHS = [400, 800, 1200, 1600]
const FILES = ['index.html', 'favicon.svg']

await rm(OUT, { recursive: true, force: true })
await mkdir(OUT, { recursive: true })
await Promise.all(FILES.map((file) => copyFile(file, `${OUT}/${file}`)))

const images = (await readdir(SRC)).filter((file) => /\.(jpe?g|png|webp)$/i.test(file))

// Bildene blir aldri forstørret: er originalen smalere enn bredden, beholdes originalbredden.
await Promise.all(
  WIDTHS.map(async (width) => {
    const dir = `${OUT}/static/${width}`
    await mkdir(dir, { recursive: true })
    await Promise.all(
      images.map((image) =>
        sharp(`${SRC}/${image}`)
          .resize({ width, withoutEnlargement: true })
          .webp({ quality: 75 })
          .toFile(`${dir}/${image.replace(/\.[^.]+$/, '')}.webp`),
      ),
    )
  }),
)

console.log(`Skrev ${OUT}/index.html (${images.length} bilder i ${WIDTHS.length} størrelser)`)
