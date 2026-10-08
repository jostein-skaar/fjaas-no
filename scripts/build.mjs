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
const EXPORTED_FOR = 'fjaas.no'
const SIZES = '(max-width: 700px) calc(100vw - 32px), (max-width: 1050px) calc(50vw - 30px), 380px'

const fail = (message) => {
  console.error(`Feil: ${message}`)
  process.exit(1)
}

// Eksporten er input som ikke skal redigeres for hånd: ny zip fra JEDB erstatter den gamle.
const files = await readdir(DATA).catch(() => [])
const zips = files.filter((file) => /^jedb-.*\.zip$/.test(file))
if (zips.length !== 1) fail(`forventet nøyaktig én jedb-*.zip i ${DATA}/, fant ${zips.length}`)
const zip = unzipSync(new Uint8Array(await readFile(`${DATA}/${zips[0]}`)))

const entry = (path) => zip[path] ?? fail(`${path} mangler i ${zips[0]}`)

// Ved rene tekstendringer holder det å laste ned jedb-fjaas.no.json fra JEDB og legge den i data/.
// Navnet må være nøyaktig det, så "jedb-fjaas.no (1).json" fra nettleseren stopper bygget i stedet
// for å bli oversett. Den løse filen brukes bare hvis exportedAt er nyere enn cv.json i zip-en.
const JSON_NAME = `jedb-${EXPORTED_FOR}.json`
const misnamed = files.filter((file) => /^jedb-.*\.json$/i.test(file) && file !== JSON_NAME)
if (misnamed.length) fail(`${misnamed.join(', ')} i ${DATA}/ har feil navn, filen skal hete ${JSON_NAME}`)
const jsons = files.filter((file) => file === JSON_NAME)

const parse = (text, name) => {
  try {
    return JSON.parse(text)
  } catch (error) {
    fail(`${name} er ikke gyldig JSON: ${error.message}`)
  }
}
const zipped = parse(strFromU8(entry('cv.json')), `cv.json i ${zips[0]}`)
const loose = jsons.length ? parse(await readFile(`${DATA}/${jsons[0]}`, 'utf8'), `${DATA}/${jsons[0]}`) : null
const cv = loose?.exportedAt > zipped.exportedAt ? loose : zipped
const source = cv === loose ? `${DATA}/${jsons[0]}` : zips[0]
if (cv.schemaVersion !== SCHEMA_VERSION) {
  fail(`cv.json har schemaVersion ${cv.schemaVersion}, bygget kjenner bare ${SCHEMA_VERSION}`)
}
// Begge eksportene er gyldige mot skjemaet, så uten denne sjekken ville en eksport for
// josteinskaar.no bygget feil side i stillhet.
for (const [name, data] of [[zips[0], zipped], ...(loose ? [[`${DATA}/${jsons[0]}`, loose]] : [])]) {
  if (data.exportedFor !== EXPORTED_FOR) fail(`${name} er eksportert for ${data.exportedFor}, ikke ${EXPORTED_FOR}`)
}
const validate = new Ajv2020({ strict: false }).compile(JSON.parse(strFromU8(entry('cv.schema.json'))))
if (!validate(cv)) fail(`cv.json følger ikke cv.schema.json:\n${JSON.stringify(validate.errors, null, 2)}`)

const games = cv.items.filter((item) => item.section === 'projects-fun')
if (games.length === 0) fail('ingen projects-fun i eksporten')
for (const game of games) {
  if (game.images.length === 0) fail(`${game.slug} har ingen bilder`)
  // Bildene finnes bare i zip-en. Et nytt spill eller bilde krever en ny zip-eksport.
  if (!zip[game.images[0].src]) fail(`${game.images[0].src} mangler i ${zips[0]}, eksporter en ny zip fra JEDB`)
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

console.log(`Skrev ${OUT}/index.html (${games.length} spill, ${WIDTHS.length} bildestørrelser, fra ${source})`)
