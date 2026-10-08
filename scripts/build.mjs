// Bygger siden fra JEDB-eksporten i data/: leser jedb-fjaas.no.json og bildene ved siden av,
// genererer spillkortene inn i index.html og lager nedskalerte WebP-kopier av bildene.
import { existsSync } from 'node:fs'
import { copyFile, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import sharp from 'sharp'

const DATA = 'data'
const OUT = 'dist'
const WIDTHS = [400, 800, 1200, 1600]
const FILES = ['favicon.svg']
const SCHEMA_VERSION = 1
const EXPORTED_FOR = 'fjaas.no'
const SIZES = '(max-width: 700px) calc(100vw - 32px), (max-width: 1050px) calc(50vw - 30px), 380px'

const fail = (message) => {
  console.error(`Feil: ${message}`)
  process.exit(1)
}

// Eksporten er input som ikke skal redigeres for hånd: ny jedb-fjaas.no.json fra JEDB erstatter den gamle.
// Navnet må være nøyaktig det, så "jedb-fjaas.no (1).json" fra nettleseren stopper bygget i stedet
// for å bli oversett.
const JSON_NAME = `jedb-${EXPORTED_FOR}.json`
const files = await readdir(DATA).catch(() => [])
const misnamed = files.filter((file) => /^jedb-.*\.json$/i.test(file) && file !== JSON_NAME)
if (misnamed.length) fail(`${misnamed.join(', ')} i ${DATA}/ har feil navn, filen skal hete ${JSON_NAME}`)
if (!files.includes(JSON_NAME)) fail(`${DATA}/${JSON_NAME} finnes ikke, last ned eksporten fra JEDB og legg den i ${DATA}/`)

const source = `${DATA}/${JSON_NAME}`
let cv
try {
  cv = JSON.parse(await readFile(source, 'utf8'))
} catch (error) {
  fail(`${source} er ikke gyldig JSON: ${error.message}`)
}
if (cv.schemaVersion !== SCHEMA_VERSION) {
  fail(`${source} har schemaVersion ${cv.schemaVersion}, bygget kjenner bare ${SCHEMA_VERSION}`)
}
// Uten denne sjekken ville en eksport for josteinskaar.no bygget feil side i stillhet.
if (cv.exportedFor !== EXPORTED_FOR) fail(`${source} er eksportert for ${cv.exportedFor}, ikke ${EXPORTED_FOR}`)

const games = cv.items.filter((item) => item.section === 'projects-fun')
if (games.length === 0) fail('ingen projects-fun i eksporten')
const imagePath = (game) => `${DATA}/${game.images[0].src}`
for (const game of games) {
  if (game.images.length === 0) fail(`${game.slug} har ingen bilder`)
  // Bildene ligger som filer i data/<src>. Et nytt spill eller bilde krever at fetch-images.mjs er kjørt.
  if (!existsSync(imagePath(game))) {
    fail(`bildet (${game.slug}) ${game.images[0].src} mangler i ${DATA}/, kjør scripts/fetch-images.mjs (node scripts/fetch-images.mjs ${source} ${DATA})`)
  }
}

const escapeHtml = (text) => text.replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char])

// "2024-09" -> "Høsten 2024". Julen er desember, resten følger årstidene.
const period = (from) => {
  const [year, month] = from.split('-')
  if (!month) return year
  const m = Number(month)
  const season = m === 12 ? 'Julen' : m <= 2 ? 'Vinteren' : m <= 5 ? 'Våren' : m <= 8 ? 'Sommeren' : 'Høsten'
  return `${season} ${year}`
}

const card = (game) => {
  const title = escapeHtml(game.title)
  const src = (width) => `static/${width}/${game.slug}.webp`
  const links = [
    game.url && `<a href="${escapeHtml(game.url)}" class="button">Spill</a>`,
    game.github && `<a href="${escapeHtml(game.github)}" class="button button-secondary">GitHub</a>`,
  ].filter(Boolean)
  return `      <article class="game">
        <a href="${escapeHtml(game.url ?? '#')}" class="game-image">
          <img
            src="${src(WIDTHS[0])}"
            srcset="${WIDTHS.map((width) => `${src(width)} ${width}w`).join(', ')}"
            sizes="${SIZES}"
            alt="${escapeHtml(game.images[0].alt || `Skjermbilde fra ${game.title}`)}"
            loading="lazy"
          />
        </a>
        <div class="game-content">
          <h2>${title}</h2>
          ${game.from ? `<p class="game-date">${period(game.from)}</p>` : ''}
          <p>${escapeHtml(game.description)}</p>
          <div class="game-links">
            ${links.join('\n            ')}
          </div>
        </div>
      </article>`
}

// "8. oktober 2026 17:38", i norsk tid uansett hvor bygget kjører.
const exportedAt = new Date(cv.exportedAt)
if (Number.isNaN(exportedAt.getTime())) fail(`${source} mangler gyldig exportedAt`)
const oslo = (options) => exportedAt.toLocaleString('nb-NO', { timeZone: 'Europe/Oslo', ...options })
const updated = `Sist oppdatert: ${oslo({ day: 'numeric', month: 'long', year: 'numeric' })} ${oslo({ hour: '2-digit', minute: '2-digit', hour12: false })}`

await rm(OUT, { recursive: true, force: true })
await mkdir(OUT, { recursive: true })
await Promise.all(FILES.map((file) => copyFile(file, `${OUT}/${file}`)))

const template = await readFile('index.html', 'utf8')
if (!template.includes('<!-- GAMES -->')) fail('index.html mangler <!-- GAMES -->')
await writeFile(
  `${OUT}/index.html`,
  template
    .replace('<!-- GAMES -->', () => games.map(card).join('\n').trimStart())
    .replace('<!-- UPDATED -->', updated),
)

// Bare hovedbildet (det første) brukes. Bildene blir aldri forstørret: er originalen
// smalere enn bredden, beholdes originalbredden.
await Promise.all(
  WIDTHS.map(async (width) => {
    const dir = `${OUT}/static/${width}`
    await mkdir(dir, { recursive: true })
    await Promise.all(
      games.map((game) =>
        sharp(imagePath(game))
          .resize({ width, withoutEnlargement: true })
          .webp({ quality: 75 })
          .toFile(`${dir}/${game.slug}.webp`),
      ),
    )
  }),
)

console.log(`Skrev ${OUT}/index.html (${games.length} spill, ${WIDTHS.length} bildestørrelser, fra ${source})`)
