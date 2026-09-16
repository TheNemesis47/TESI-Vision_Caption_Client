# React + TypeScript + Vite

## Avvio con Docker

L'immagine contiene la build servita da nginx, che fa anche da ponte verso il
server sul WebSocket: client e `/ws/vision` escono dalla stessa porta, come
vuole la fotocamera del browser.

```bash
docker run -p 8080:80 -e VISION_SERVER=host.docker.internal:8765 \
  thenemesis47/visioncaption-client
```

Di norma però si parte dal `compose.yaml` del backend, che alza i due servizi
insieme e imposta `VISION_SERVER` da sé.

## Connessione al backend

In produzione il client usa automaticamente lo stesso host della pagina e apre il
WebSocket su `/ws/vision`. Per esempio, una pagina pubblicata come
`https://vision.example.com` si collega a
`wss://vision.example.com/ws/vision`. Questa configurazione è adatta a un unico
origin HTTPS esposto tramite Cloudflare Tunnel.

`VITE_VISION_WS_URL` rimane disponibile come override per lo sviluppo con
frontend e backend su host diversi. Vedi `.env.example`.

## La guida della prima apertura

Chi apre l'applicazione per la prima volta trova una guida in quattro passi:
apertura, scelta della fotocamera, scelta della modalità, avvio. I passi 2 e 3
montano i controlli veri, non una loro figura, quindi chi arriva in fondo ha
già scelto fotocamera e modalità.

**Che cosa ricorda, e dove.** Una chiave in `localStorage`
(`visioncaption.tutorial`) con la versione della guida, più la preferenza sulla
voce (`visioncaption.tutorial.voice`). Niente arriva al server: un registro
lato server non saprebbe distinguere due utenti, perché dietro Cloudflare
Tunnel ogni connessione arriva da `127.0.0.1` e sul 5G migliaia di persone
escono dallo stesso indirizzo. Se `localStorage` è inaccessibile — Safari in
navigazione privata — la guida ricompare, ed è per questo che «Salta la guida»
è il primo comando che si incontra.

Cambiando i testi va alzata `TUTORIAL_VERSION` in `src/domain/tutorial.ts`: chi
l'aveva già vista la rivede una volta sola.

**La voce.** Chi usa un lettore di schermo ha già una voce, la sua: per lui la
guida è marcata come finestra modale e il fuoco si sposta sul titolo a ogni
passo. Chi non lo usa ha bisogno che sia l'applicazione a parlare, e allora
partono le tracce di `public/tutorial/`, generate con la stessa voce delle
descrizioni. Le due cose si accavallerebbero, quindi il primo pulsante della
guida spegne la voce.

Il passo d'apertura non parla di proposito: su iPhone l'audio parte solo dentro
un gesto dell'utente, e quel gesto è la pressione di «Ascolta la guida».

### Rigenerare le tracce

I testi stanno in `src/domain/tutorial.ts` e sono l'unica fonte: si cambia la
frase lì e si rilancia lo script, che rilegge da quel file.

```bash
set -a; . ../visionCaption-TESI/.env; set +a
node scripts/generate-tutorial-audio.ts
```

La chiave ElevenLabs va letta sourcing il `.env` del backend, non con `grep`:
i valori sono fra virgolette, e passarle dentro la chiave fa rispondere 401.

---

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```
