# fjaasno
www.fjaas.no

## Innhold

Spillene kommer fra JEDB. `data/jedb-fjaas.no.json` er eksporten, og bildene ligger som egne filer i
`data/images/<slug>/<fil>` (stien er `src` i JSON-en). `npm run build` leser JSON-en, sjekker `schemaVersion`
og `exportedFor`, genererer spillkortene inn i `index.html` og lager bildene i fire størrelser. Bygget feiler med
en melding hvis et bilde mangler. Ikke rediger innholdet her, endre det i JEDB og eksporter på nytt.

## Rutine etter en eksport

Last ned `jedb-fjaas.no.json` fra JEDB og legg den i `data/` med nøyaktig dette navnet, slik at den erstatter den
gamle eksporten. Kjør så:

```
npm run update
```

Kommandoen henter bilder fra eksporten og bygger siden. Bildefilene må hentes innen lenkene utløper, vanligvis innen
en time. Eksporten fra JEDB må fortsatt lastes ned manuelt; `update` henter ikke selve innholdsdataene. Hvis
nedlasting feiler, beholdes lenkene i JSON-en slik at du kan prøve igjen før de utløper. Etter en vellykket kjøring
fjernes de midlertidige lenkene fra JSON-en.
