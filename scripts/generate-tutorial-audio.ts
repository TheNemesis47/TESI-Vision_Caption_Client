/* Genera le tracce della guida con la stessa voce delle descrizioni.
 *
 * I testi vengono da src/domain/tutorial.ts, che resta l'unica fonte: cambiare
 * una frase lì e rilanciare questo script tiene allineati schermo e voce.
 *
 *   set -a; . ../visionCaption-TESI/.env; set +a
 *   node scripts/generate-tutorial-audio.ts
 *
 * La chiave sta nel .env del backend e non va copiata qui dentro. Va letta
 * sourcing il file, non con grep: i valori sono fra virgolette, e passarle
 * dentro la chiave fa rispondere 401. Le tracce finiscono in public/tutorial/
 * e da lì nel dist.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spokenText, TUTORIAL_STEPS } from '../src/domain/tutorial.ts'

const apiKey = process.env.ELEVENLABS_API_KEY
const voiceId = process.env.ELEVENLABS_VOICE_ID ?? '21m00Tcm4TlvDq8ikWAM'
const modelId = process.env.ELEVENLABS_MODEL_ID ?? 'eleven_turbo_v2_5'

if (!apiKey) {
  console.error('Manca ELEVENLABS_API_KEY. Prendila dal .env del backend:')
  console.error('  set -a; . ../visionCaption-TESI/.env; set +a')
  console.error('  node scripts/generate-tutorial-audio.ts')
  process.exit(1)
}

const publicDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'public',
)

const synthesize = async (text: string): Promise<ArrayBuffer> => {
  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
    {
      method: 'POST',
      headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        model_id: modelId,
        language_code: 'it',
        apply_text_normalization: 'on',
      }),
    },
  )
  if (!response.ok) {
    throw new Error(`ElevenLabs ha risposto ${response.status}: ${await response.text()}`)
  }
  return response.arrayBuffer()
}

for (const step of TUTORIAL_STEPS) {
  const testo = spokenText(step)
  if (!testo || !step.audio) continue

  const destination = path.join(publicDir, step.audio)
  await mkdir(path.dirname(destination), { recursive: true })
  const audio = await synthesize(testo)
  await writeFile(destination, Buffer.from(audio))
  console.log(`${step.id}: ${Math.round(audio.byteLength / 1024)} kB → public${step.audio}`)
}
