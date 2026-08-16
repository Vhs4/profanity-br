import type {
  PedidoDeContexto,
  ResolvedorDeContexto,
  VeredictoDeContexto,
} from '../tipos.js'

/**
 * Resolver de contexto por REGRA — determinístico, sem IA. Implementação de
 * referência da interface ResolvedorDeContexto; nenhum resolver é
 * dependência do core.
 */
const POSSESSIVO_ANTES = ['seu', 'sua', 'seus', 'suas', 'baita', 'grande']

const POSSESSIVO_PROPRIO = ['meu', 'minha', 'meus', 'minhas', 'teu', 'tua']

const VERBO_SEXUAL_ANTES = ['chupa', 'chupar', 'chupe', 'mama', 'mamar', 'lambe', 'lamber']

/** "seu X de Y" não é insulto dirigido */
const COMPLEMENTO_DEPOIS = ['de', 'da', 'do', 'das', 'dos', 'que']

const OFENSIVO_ANTES_POR_TERMO: Record<string, string[]> = {
  cu: ['no', 'do', 'meu', 'pro', 'toma', 'tomar'],
}

const INOFENSIVO_ANTES: Record<string, string[]> = {
  rola: ['video', 'vídeo', 'papo', 'assunto', 'conversa', 'jogo', 'som', 'musica', 'música'],
  macaco: ['um', 'uns', 'o', 'os', 'aquele'],
  veado: ['um', 'uns', 'o', 'os'],
  piranha: ['uma', 'a', 'as'],
  pinto: ['o', 'um', 'uns', 'os'],
  arrombado: ['porta', 'cofre', 'fechadura', 'janela', 'loja', 'casa', 'foi', 'estava', 'ficou'],
}

const INOFENSIVO_DEPOIS: Record<string, string[]> = {
  droga: ['foi', 'e', 'é', 'era', 'apreendida', 'vendida', 'sintetica', 'sintética'],
}

/** Reduz um token à palavra em minúsculas, sem pontuação nas bordas. */
function palavraLimpa(token: string | undefined): string {
  return (token ?? '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
}

const RE_CAPITALIZADO = /^\p{Lu}[\p{Ll}\p{M}]+$/u

/**
 * Capitalizado no meio da frase com vizinho capitalizado = nome próprio
 * ("Pedro Pinto"). Início de frase não informa; caixa alta não conta.
 */
function ehNomeProprio(pedido: PedidoDeContexto): boolean {
  if (!RE_CAPITALIZADO.test(pedido.trecho)) return false
  const antes = pedido.texto.slice(0, pedido.span[0]).trim()
  if (antes === '' || /[.!?…]$/.test(antes)) return false
  const tokensAntes = antes.split(/\s+/)
  const anterior = (tokensAntes[tokensAntes.length - 1] ?? '').replace(/[^\p{L}\p{M}]/gu, '')
  const seguinte = (pedido.texto.slice(pedido.span[1]).trim().split(/\s+/)[0] ?? '').replace(
    /[^\p{L}\p{M}]/gu,
    '',
  )
  return RE_CAPITALIZADO.test(anterior) || RE_CAPITALIZADO.test(seguinte)
}

export class ResolvedorPorRegra implements ResolvedorDeContexto {
  /**
   * Julga um hit ambíguo olhando os vizinhos imediatos do span: nome
   * próprio e listas de uso literal descartam; possessivo ou verbo sexual
   * antes do termo (sem complemento nominal depois) promove a ofensivo.
   * Tudo que não casar fica 'incerto' — na dúvida, o default determinístico
   * prevalece.
   */
  async resolver(pedido: PedidoDeContexto): Promise<VeredictoDeContexto> {
    if (ehNomeProprio(pedido)) return 'inofensivo'

    const antesTokens = pedido.texto.slice(0, pedido.span[0]).trim().split(/\s+/)
    const depoisTokens = pedido.texto.slice(pedido.span[1]).trim().split(/\s+/)
    const anterior = palavraLimpa(antesTokens[antesTokens.length - 1])
    const penultimo = palavraLimpa(antesTokens[antesTokens.length - 2])
    const seguinte = palavraLimpa(depoisTokens[0])

    const inofensivosAntes = INOFENSIVO_ANTES[pedido.id]
    if (inofensivosAntes && inofensivosAntes.includes(anterior)) return 'inofensivo'
    const inofensivosDepois = INOFENSIVO_DEPOIS[pedido.id]
    if (inofensivosDepois && inofensivosDepois.includes(seguinte)) return 'inofensivo'

    const dirigido =
      POSSESSIVO_ANTES.includes(anterior) ||
      VERBO_SEXUAL_ANTES.includes(anterior) ||
      (OFENSIVO_ANTES_POR_TERMO[pedido.id] ?? []).includes(anterior) ||
      (POSSESSIVO_PROPRIO.includes(anterior) && VERBO_SEXUAL_ANTES.includes(penultimo))
    if (dirigido && !COMPLEMENTO_DEPOIS.includes(seguinte)) return 'ofensivo'

    return 'incerto'
  }
}
