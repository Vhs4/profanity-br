import type { Locale, TermoCompilado } from './tipos.js'
import type { Ocorrencia, Padrao } from './matcher.js'
import type { TextoNormalizado } from './normalizador.js'

const RE_LETRA = /\p{L}/u

export interface MatchDeTermo {
  termo: TermoCompilado
  forma: string
  /** span no texto NORMALIZADO */
  ini: number
  fim: number
}

export interface Span {
  ini: number
  fim: number
}

/**
 * Diz se o vizinho na posição idx é letra de verdade. Lê o code point
 * completo (letra astral ocupa duas unidades UTF-16) e ignora letras que
 * vieram de conversão de-leet — "merda1" vira "merda[i]" e o [i] não pode
 * suprimir o match.
 */
export function ehLetraNaFronteira(norm: TextoNormalizado, idx: number): boolean {
  if (idx < 0 || idx >= norm.texto.length) return false
  let base = idx
  const code = norm.texto.charCodeAt(idx)
  if (code >= 0xdc00 && code <= 0xdfff && idx > 0) base = idx - 1
  const cp = norm.texto.codePointAt(base)!
  if (!RE_LETRA.test(String.fromCodePoint(cp))) return false
  return !norm.deLeet[base]
}

/**
 * Estágio 03 — Supressor. Elimina ocorrência que não é hit de verdade, em
 * quatro filtros: fronteira \p{L} (nunca \b ASCII — "curso" não dispara
 * "cu"), filtro de região por locale, allowlist por contenção de span
 * (igualdade conta, allowlist vence) e longest match wins entre
 * sobrepostos ("filho da puta" engole "puta").
 */
export function suprimirMatchesInvalidos(
  ocorrencias: Ocorrencia[],
  padroes: Padrao[],
  norm: TextoNormalizado,
  termosPorId: Map<string, TermoCompilado>,
  locale: Locale,
  allowlistExtraSpans: Span[] = [],
): MatchDeTermo[] {
  const comFronteira = ocorrencias.filter(
    o => !ehLetraNaFronteira(norm, o.ini - 1) && !ehLetraNaFronteira(norm, o.fim),
  )

  const allowSpans: Span[] = [...allowlistExtraSpans]
  const candidatos: MatchDeTermo[] = []
  for (const o of comFronteira) {
    const padrao = padroes[o.padrao]
    if (padrao.ehAllowlist) {
      allowSpans.push({ ini: o.ini, fim: o.fim })
      continue
    }
    for (const id of padrao.termoIds) {
      const termo = termosPorId.get(id)
      if (!termo) continue
      if (termo.regiao && !termo.regiao.includes(locale)) continue
      candidatos.push({ termo, forma: padrao.forma, ini: o.ini, fim: o.fim })
    }
  }

  let foraDaAllowlist = candidatos
  if (allowSpans.length > 0) {
    const indice = indexarSpansPorInicio(allowSpans)
    foraDaAllowlist = candidatos.filter(c => !contidoEmAlgumSpan(c, indice))
  }

  const ordenado = [...foraDaAllowlist].sort(
    (a, b) => (b.fim - b.ini) - (a.fim - a.ini) || a.ini - b.ini,
  )
  const ocupado = new Uint8Array(norm.texto.length)
  const spansMantidos = new Set<string>()
  const mantidos: MatchDeTermo[] = []
  for (const c of ordenado) {
    const chave = `${c.ini}:${c.fim}`
    if (spansMantidos.has(chave)) {
      mantidos.push(c)
      continue
    }
    let livre = true
    for (let p = c.ini; p < c.fim; p++) {
      if (ocupado[p]) {
        livre = false
        break
      }
    }
    if (!livre) continue
    ocupado.fill(1, c.ini, c.fim)
    spansMantidos.add(chave)
    mantidos.push(c)
  }
  return mantidos.sort((a, b) => a.ini - b.ini || b.fim - a.fim)
}

interface IndiceDeSpans {
  inicios: number[]
  maxFimAte: number[]
}

/** Ordena os spans por início e acumula o máximo de fim visto até cada um. */
function indexarSpansPorInicio(spans: Span[]): IndiceDeSpans {
  const ordenados = [...spans].sort((a, b) => a.ini - b.ini)
  const inicios: number[] = []
  const maxFimAte: number[] = []
  let max = -1
  for (const s of ordenados) {
    if (s.fim > max) max = s.fim
    inicios.push(s.ini)
    maxFimAte.push(max)
  }
  return { inicios, maxFimAte }
}

/**
 * Testa contenção em O(log n): existe contêiner sse o maior fim entre os
 * spans que começam até o início do candidato alcança o fim dele. A busca
 * linear original era alvo de DoS com milhares de hits numa mensagem só.
 */
function contidoEmAlgumSpan(c: Span, indice: IndiceDeSpans): boolean {
  let lo = 0
  let hi = indice.inicios.length - 1
  let idx = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (indice.inicios[mid] <= c.ini) {
      idx = mid
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  return idx >= 0 && indice.maxFimAte[idx] >= c.fim
}
