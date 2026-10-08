// Bygger siden fra JEDB-eksporten i data/: pakker ut zip-en, validerer cv.json,
// genererer spillkortene inn i index.html og lager nedskalerte WebP-kopier av bildene.
import { copyFile, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import Ajv2020 from 'ajv/dist/2020.js'
import { unzipSync, strFromU8 } from 'fflate'
import sharp from 'sharp'

const DATA = 'data'
const OUT = 'dist'
const WIDTHS = [400, 800, 1200, 1600]
const FILES = ['favicon.svg']
const SCHEMA_VERSION = 1
const SIZES = '(max-width: 700px) calc(100vw - 32px), (max-width: 1050px) calc(50vw - 30px), 380px'

const fail = (message) => {
  console.error(`Feil: ${message}`)
  process.exit(1)
}

// Eksporten er input som ikke skal redigeres for hånd: ny zip fra JEDB erstatter den gamle.
const zips = (await readdir(DATA).catch(() => [])).filter((file) => /^jedb-.*\.zip$/.test(file))
if (zips.length !== 1) fail(`forventet nøyaktig én jedb-*.zip i ${DATA}/, fant ${zips.length}`)
const zip = unzipSync(new Uint8Array(await readFile(`${DATA}/${zips[0]}`)))

const entry = (path) => zip[path] ?? fail(`${path} mangler i ${zips[0]}`)
const cv = JSON.parse(strFromU8(entry('cv.json')))
if (cv.schemaVersion !== SCHEMA_VERSION) {
  fail(`cv.json har schemaVersion ${cv.schemaVersion}, bygget kjenner bare ${SCHEMA_VERSION}`)
}
const validate = new Ajv2020({ strict: false }).compile(JSON.parse(strFromU8(entry('cv.schema.json'))))
if (!validate(cv)) fail(`cv.json følger ikke cv.schema.json:\n${JSON.stringify(validate.errors, null, 2)}`)

const games = cv.items.filter((item) => item.section === 'projects-fun')
if (games.length === 0) fail('ingen projects-fun i eksporten')
for (const game of games) {
  if (game.images.length === 0) fail(`${game.slug} har ingen bilder`)
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

await rm(OUT, { recursive: true, force: true })
await mkdir(OUT, { recursive: true })
await Promise.all(FILES.map((file) => copyFile(file, `${OUT}/${file}`)))

const template = await readFile('index.html', 'utf8')
if (!template.includes('<!-- GAMES -->')) fail('index.html mangler <!-- GAMES -->')
await writeFile(`${OUT}/index.html`, template.replace('<!-- GAMES -->', () => games.map(card).join('\n').trimStart()))

// Bare hovedbildet (det første) brukes. Bildene blir aldri forstørret: er originalen
// smalere enn bredden, beholdes originalbredden.
await Promise.all(
  WIDTHS.map(async (width) => {
    const dir = `${OUT}/static/${width}`
    await mkdir(dir, { recursive: true })
    await Promise.all(
      games.map((game) =>
        sharp(entry(game.images[0].src))
          .resize({ width, withoutEnlargement: true })
          .webp({ quality: 75 })
          .toFile(`${dir}/${game.slug}.webp`),
      ),
    )
  }),
)

console.log(`Skrev ${OUT}/index.html (${games.length} spill, ${WIDTHS.length} bildestørrelser, fra ${zips[0]})`)
