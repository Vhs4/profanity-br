import type { Analysis, Hit, Limites } from '../src/tipos.js'

const R = '\x1b[0m'
const NEG = '\x1b[1m'
const DIM = '\x1b[2m'
const VERM = '\x1b[31m'
const AMAR = '\x1b[33m'
const VERD = '\x1b[32m'
const FUNDO_VERM = '\x1b[41m\x1b[97m'
const FUNDO_AMAR = '\x1b[43m\x1b[30m'

const ROTULOS_VULG = ['limpo', 'leve', 'moderado', 'forte']

/**
 * Reimprime o texto original com cada hit pintado: fundo vermelho para
 * confiança alta, amarelo para ambíguo.
 */
function destacarHitsNoTexto(texto: string, hits: Hit[]): string {
  if (hits.length === 0) return texto
  const ordenados = [...hits].sort((a, b) => a.span[0] - b.span[0])
  let saida = ''
  let pos = 0
  for (const h of ordenados) {
    const [ini, fim] = h.span
    if (ini < pos) continue
    saida += texto.slice(pos, ini)
    const cor = h.confianca === 'alta' ? FUNDO_VERM : FUNDO_AMAR
    saida += `${cor}${texto.slice(ini, fim)}${R}`
    pos = fim
  }
  return saida + texto.slice(pos)
}

/**
 * Formata a linha de veredicto da régua: "ok" quando dentro dos limites,
 * "EXCEDEU" com o motivo (qual eixo estourou e por quanto) quando não.
 */
function linhaDeLimites(analise: Analysis, limites?: Limites): string {
  if (!analise.excedeuLimites) {
    return `  ${NEG}limites${R}      ${VERD}ok — dentro da régua do app${R}`
  }
  const motivos: string[] = []
  if (
    limites?.vulgaridadeMax !== undefined &&
    analise.vulgaridade > limites.vulgaridadeMax
  ) {
    motivos.push(`vulgaridade ${analise.vulgaridade} > máx ${limites.vulgaridadeMax}`)
  }
  if (
    limites?.alvoSeveridadeMax !== undefined &&
    analise.alvo &&
    analise.alvo.severidade > limites.alvoSeveridadeMax
  ) {
    motivos.push(`alvo severidade ${analise.alvo.severidade} > máx ${limites.alvoSeveridadeMax}`)
  }
  const motivo = motivos.length > 0 ? ` ${DIM}(${motivos.join(' · ')})${R}` : ''
  return `  ${NEG}limites${R}      ${VERM}EXCEDEU${R}${motivo}`
}

/**
 * Monta a saída completa de uma análise para o terminal: texto destacado,
 * os dois eixos, o veredicto da régua (se houver) e a lista de hits.
 */
export function renderizarAnalise(texto: string, analise: Analysis, limites?: Limites): string {
  const linhas: string[] = []
  linhas.push(`  ${destacarHitsNoTexto(texto, analise.hits)}`)
  linhas.push('')

  if (analise.hits.length === 0) {
    linhas.push(`  ${VERD}✓ limpo${R} — nenhum hit`)
    if (analise.excedeuLimites !== undefined) linhas.push(linhaDeLimites(analise, limites))
    return linhas.join('\n')
  }

  const barra = '█'.repeat(analise.vulgaridade) + DIM + '░'.repeat(3 - analise.vulgaridade) + R
  linhas.push(
    `  ${NEG}vulgaridade${R}  ${barra} ${analise.vulgaridade}/3 ${DIM}(${ROTULOS_VULG[analise.vulgaridade]})${R}`,
  )
  linhas.push(
    analise.alvo
      ? `  ${NEG}alvo${R}         ${VERM}${analise.alvo.tipo}${R} · severidade ${analise.alvo.severidade}/3`
      : `  ${NEG}alvo${R}         ${DIM}—${R}`,
  )
  if (analise.excedeuLimites !== undefined) linhas.push(linhaDeLimites(analise, limites))
  linhas.push('')

  for (const h of analise.hits) {
    const marca = h.confianca === 'alta' ? `${VERM}✖${R}` : `${AMAR}?${R}`
    const alvo = h.alvo ? ` alvo:${h.alvo.tipo}/${h.alvo.severidade}` : ''
    const nota =
      h.confianca === 'ambigua' ? ` ${DIM}(ambíguo — precisa de resolver de contexto)${R}` : ''
    linhas.push(
      `  ${marca} ${NEG}${h.id}${R} "${h.trecho}" [${h.span[0]},${h.span[1]}) vulg:${h.vulgaridade}${alvo}${nota}`,
    )
  }
  return linhas.join('\n')
}
