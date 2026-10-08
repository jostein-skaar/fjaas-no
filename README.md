# fjaasno
www.fjaas.no

## Innhold

Spillene kommer fra JEDB. `data/jedb-fjaas.no.json` er eksporten, og bildene ligger som egne filer i
`data/images/<slug>/<fil>` (stien er `src` i JSON-en). `npm run build` leser JSON-en, sjekker `schemaVersion`
og `exportedFor`, genererer spillkortene inn i `index.html` og lager bildene i fire størrelser. Bygget feiler med
en melding hvis et bilde mangler. Ikke rediger innholdet her, endre det i JEDB og eksporter på nytt.

## Rutine etter en eksport

- **Rene tekstendringer:** last ned `jedb-fjaas.no.json` fra JEDB og legg den i `data/` (navnet må være nøyaktig
  det, erstatt den gamle).
- **Nye eller endrede bilder:** samme, men bildene må hentes innen en time etter eksporten (lenkene i JSON-en
  utløper). Kjør lokalt:

  ```
  node scripts/fetch-images.mjs data/jedb-fjaas.no.json data
  ```

  Scriptet laster ned bilder som mangler, hopper over de som allerede finnes, og fjerner de midlertidige lenkene
  fra JSON-en. Commit så JSON-en og de nye bildene. Hvis noe feiler, står JSON-en urørt og scriptet kan kjøres på nytt
  innen timen.
