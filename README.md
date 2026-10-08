# fjaasno
www.fjaas.no

## Innhold

Spillene kommer fra JEDB. Eksporter `jedb-fjaas.no.zip` fra JEDB og legg den i `data/` (kun én `jedb-*.zip`, erstatt den gamle).
`npm run build` pakker ut zip-en, validerer `cv.json` mot `cv.schema.json`, genererer spillkortene inn i `index.html`
og lager bildene i fire størrelser. Ikke rediger innholdet her, endre det i JEDB og eksporter på nytt.
