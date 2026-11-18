/* Audio téléphone : G.711 μ-law 8 kHz (format natif Twilio Media Streams ET xAI « audio/pcmu »).
   Aucun transcodage pour la conversation ; on décode seulement pour fabriquer l'enregistrement WAV. */

const BIAS = 0x84

export function ulawToPcm(u: number) {
  u = ~u & 0xff
  const sign = u & 0x80, exp = (u >> 4) & 0x07, man = u & 0x0f
  let s = (((man << 3) + BIAS) << exp) - BIAS
  return sign ? -s : s
}

export function pcmToUlaw(s: number) {
  const sign = s < 0 ? 0x80 : 0
  if (s < 0) s = -s
  s = Math.min(s, 32635) + BIAS
  let exp = 7
  for (let mask = 0x4000; (s & mask) === 0 && exp > 0; mask >>= 1) exp--
  const man = (s >> (exp + 3)) & 0x0f
  return ~(sign | (exp << 4) | man) & 0xff
}

/** Enregistreur 2 pistes alignées dans le temps : appelant (temps réel) + IA (lue par Twilio à la suite). */
export class CallRecorder {
  private inb: number[] = []
  private out = new Map<number, number>()
  private outPos = 0
  private readonly max: number
  constructor(maxSeconds = 20 * 60) { this.max = maxSeconds * 8000 }

  /** Audio de l'appelant : Twilio envoie 20 ms toutes les 20 ms, silence compris. */
  addInbound(b64: string) {
    const buf = Buffer.from(b64, "base64")
    for (const u of buf) if (this.inb.length < this.max) this.inb.push(ulawToPcm(u))
  }

  /** Audio de l'IA : arrive plus vite que le temps réel, Twilio le joue à la suite. */
  addOutbound(b64: string) {
    const buf = Buffer.from(b64, "base64")
    if (this.outPos < this.inb.length) this.outPos = this.inb.length
    for (const u of buf) { if (this.outPos >= this.max) break; this.out.set(this.outPos++, ulawToPcm(u)) }
  }

  /** Coupure (l'appelant parle) : ce qui n'a pas encore été joué est effacé. */
  clearOutbound() {
    for (let i = this.inb.length; i < this.outPos; i++) this.out.delete(i)
    this.outPos = this.inb.length
  }

  get seconds() { return this.inb.length / 8000 }

  /** WAV PCM 16 bits mono 8 kHz (mix des deux pistes). */
  toWav(): Buffer {
    const n = Math.max(this.inb.length, Math.min(this.outPos, this.max))
    const data = Buffer.alloc(n * 2)
    for (let i = 0; i < n; i++) {
      const v = (this.inb[i] || 0) + (this.out.get(i) || 0)
      data.writeInt16LE(Math.max(-32768, Math.min(32767, v)), i * 2)
    }
    const h = Buffer.alloc(44)
    h.write("RIFF", 0); h.writeUInt32LE(36 + data.length, 4); h.write("WAVE", 8)
    h.write("fmt ", 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22)
    h.writeUInt32LE(8000, 24); h.writeUInt32LE(16000, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34)
    h.write("data", 36); h.writeUInt32LE(data.length, 40)
    return Buffer.concat([h, data])
  }
}
