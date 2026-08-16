import type { Alvo, Hit, Limites, Vulgaridade } from './tipos.js'

/**
 * Estágio 05 — Scorer. Agrega por MÁXIMO, nunca soma, em dois eixos
 * independentes. Hits com confianca 'ambigua' NÃO pontuam — quem chama decide
 * o que fazer com eles (estão em hits[] com o campo confianca).
 */
export function pontuarEixos(hits: Hit[]): { vulgaridade: Vulgaridade; alvo: Alvo | null } {
  let vulgaridade: Vulgaridade = 0
  let alvo: Alvo | null = null
  for (const h of hits) {
    if (h.confianca !== 'alta') continue
    if (h.vulgaridade > vulgaridade) vulgaridade = h.vulgaridade
    if (h.alvo && (!alvo || h.alvo.severidade > alvo.severidade)) alvo = h.alvo
  }
  return { vulgaridade, alvo }
}

/**
 * Compara os eixos medidos com a régua de quem chama. A decisão é derivada
 * dos limites do chamador — a lib nunca decide sozinha. Campo omitido em
 * Limites significa eixo sem teto.
 */
export function excedeLimites(
  eixos: { vulgaridade: Vulgaridade; alvo: Alvo | null },
  limites: Limites,
): boolean {
  if (limites.vulgaridadeMax !== undefined && eixos.vulgaridade > limites.vulgaridadeMax) {
    return true
  }
  if (limites.alvoSeveridadeMax !== undefined && eixos.alvo) {
    if (eixos.alvo.severidade > limites.alvoSeveridadeMax) return true
  }
  return false
}
