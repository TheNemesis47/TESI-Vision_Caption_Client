import type { CapacitorConfig } from '@capacitor/cli'

/**
 * Il guscio nativo di VisionCaption.
 *
 * Non serve ad avere un'icona: serve perché dentro un'app vera la fotocamera
 * si comanda davvero. Lo zoom per vincolo e la messa a fuoco su un punto, che
 * su Safari non si muovono, in AVFoundation sono due righe - ed è per quello
 * che questa cartella esiste.
 *
 * Due configurazioni, scelte da una variabile d'ambiente al momento della
 * sincronizzazione:
 *
 * - con VISION_REMOTE_URL l'app apre il sito pubblicato. È il modo per vedere
 *   sul telefono, oggi, quello che c'è online, e per correggere senza
 *   ricompilare. Non è il modo per andare su App Store: una app che mostra un
 *   sito e basta viene respinta (linea guida 4.2), e senza rete non parte.
 *
 * - senza, l'app porta dentro di sé la build del client e parla al server solo
 *   per il WebSocket e per le modalità. Serve VITE_VISION_WS_URL e
 *   VITE_VISION_API_BASE al momento della build, perché qui la pagina non sta
 *   più su un indirizzo da cui dedurli.
 */

const remoteUrl = process.env.VISION_REMOTE_URL?.trim()

const config: CapacitorConfig = {
  appId: 'app.visioncaption',
  appName: 'VisionCaption',
  webDir: 'dist',
  ios: {
    // La didascalia e i comandi stanno in fondo allo schermo: senza questo
    // finiscono sotto la barra di casa dell'iPhone.
    contentInset: 'always',
    // La pagina non si trascina: tirare in basso durante una descrizione
    // sposterebbe l'anteprima invece di non fare niente.
    scrollEnabled: false,
    backgroundColor: '#06080b',
  },
  server: remoteUrl
    ? {
        url: remoteUrl,
        cleartext: false,
      }
    : undefined,
}

export default config
