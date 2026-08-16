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

  const foraDaAllowlist = candidatos.filter(
    c => !allowSpans.some(a => a.ini <= c.ini && c.fim <= a.fim),
  )

  const ordenado = [...foraDaAllowlist].sort(
    (a, b) => (b.fim - b.ini) - (a.fim - a.ini) || a.ini - b.ini,
  )
  const mantidos: MatchDeTermo[] = []
  for (const c of ordenado) {
    const identico = mantidos.some(m => m.ini === c.ini && m.fim === c.fim)
    const sobrepoe = mantidos.some(m => c.ini < m.fim && m.ini < c.fim)
    if (identico || !sobrepoe) mantidos.push(c)
  }
  return mantidos.sort((a, b) => a.ini - b.ini || b.fim - a.fim)
}
