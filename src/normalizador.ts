import type { Mapas } from './tipos.js'

export interface TextoNormalizado {
  texto: string
  /** offset de início no original, por unidade UTF-16 de `texto` */
  origInicio: number[]
  /** offset de fim (exclusivo) no original, por unidade UTF-16 */
  origFim: number[]
  /** true quando o char veio de de-leet — não conta como letra na fronteira */
  deLeet: boolean[]
}

interface CharMapeado {
  ch: string
  ini: number
  fim: number
  leet: boolean
}

// zero-width, bidi e afins (invisíveis no editor)
const RE_INVISIVEL =
  /[­͏᠎​-‏‪-‮⁠-⁤⁦-⁩﻿]/u

const RE_LETRA = /\p{L}/u
const RE_MARCA = /\p{M}/u
const RE_ALFANUM = /[\p{L}\p{N}]/u

/**
 * Estágio 01 — Normalizador: NFKC → invisíveis → homóglifos → caixa →
 * acentos → de-leet → repetições 3+ → separadores viram espaço único.
 * Runs só colapsam com 3+ (carro ≠ caro); de-leet exige letra vizinha
 * ("curso 3" fica intacto) e "!" exige letra dos dois lados.
 */
export function criarNormalizador(mapas: Mapas) {
  return function normalizar(original: string): TextoNormalizado {
    const saida: CharMapeado[] = []
    let i = 0
    for (const cp of original) {
      const fim = i + cp.length
      for (const chNfkc of cp.normalize('NFKC')) {
        if (RE_INVISIVEL.test(chNfkc)) continue
        const mapeado = mapas.homoglifos[chNfkc] ?? chNfkc
        for (const chBaixo of mapeado.toLowerCase()) {
          const remapeado = mapas.homoglifos[chBaixo] ?? chBaixo
          for (const chFinal of remapeado) {
            for (const parte of chFinal.normalize('NFD')) {
              if (RE_MARCA.test(parte)) continue
              saida.push({ ch: parte, ini: i, fim, leet: false })
            }
          }
        }
      }
      i = fim
    }

    // de-leet: esquerda cascateia, direita usa o snapshot
    const cru = saida.map(c => c.ch)
    for (let k = 0; k < saida.length; k++) {
      const regra = mapas.leet[saida[k].ch]
      if (!regra) continue
      const esq = k > 0 && RE_LETRA.test(saida[k - 1].ch)
      const dir = k + 1 < cru.length && RE_LETRA.test(cru[k + 1])
      const ok = regra.modo === 'ambas' ? esq && dir : esq || dir
      if (ok) saida[k] = { ...saida[k], ch: regra.para, leet: true }
    }

    const colapsado: CharMapeado[] = []
    for (let k = 0; k < saida.length; ) {
      let j = k
      while (j < saida.length && saida[j].ch === saida[k].ch) j++
      const run = j - k
      const manter = run >= 3 ? 1 : run
      for (let t = 0; t < manter; t++) colapsado.push(saida[k + t])
      if (manter < run) {
        const ultimo = colapsado[colapsado.length - 1]
        colapsado[colapsado.length - 1] = { ...ultimo, fim: saida[j - 1].fim }
      }
      k = j
    }

    const final: CharMapeado[] = []
    for (const c of colapsado) {
      if (RE_ALFANUM.test(c.ch)) {
        final.push(c)
      } else {
        if (final.length === 0) continue
        if (final[final.length - 1].ch === ' ') continue
        final.push({ ch: ' ', ini: c.ini, fim: c.fim, leet: false })
      }
    }
    while (final.length > 0 && final[final.length - 1].ch === ' ') final.pop()

    const texto: string[] = []
    const origInicio: number[] = []
    const origFim: number[] = []
    const deLeet: boolean[] = []
    for (const c of final) {
      texto.push(c.ch)
      for (let u = 0; u < c.ch.length; u++) {
        origInicio.push(c.ini)
        origFim.push(c.fim)
        deLeet.push(c.leet)
      }
    }
    return { texto: texto.join(''), origInicio, origFim, deLeet }
  }
}

export type Normalizador = ReturnType<typeof criarNormalizador>
