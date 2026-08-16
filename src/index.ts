import { carregarLexico } from './lexico.js'
import {
  criarNormalizador,
  type Normalizador,
  type TextoNormalizado,
} from './normalizador.js'
import { AutomatoAhoCorasick, type Padrao } from './matcher.js'
import { ehLetraNaFronteira, suprimirMatchesInvalidos, type Span } from './supressor.js'
import { pontuarEixos, excedeLimites } from './scorer.js'
import type {
  Analysis,
  Config,
  Hit,
  Locale,
  TermoCompilado,
  VeredictoDeContexto,
} from './tipos.js'

export * from './tipos.js'
export { excedeLimites } from './scorer.js'
export { AnalisadorStream } from './streaming.js'
export { criarNormalizador } from './normalizador.js'

interface Motor {
  normalizar: Normalizador
  automato: AutomatoAhoCorasick
  termosPorId: Map<string, TermoCompilado>
  maxTermLen: number
}

let motor: Motor | null = null

/**
 * Monta (uma única vez, lazy) o motor de análise: carrega o léxico
 * compilado, cria o normalizador com os mapas dele e constrói o autômato
 * com todas as formas de termos e entradas de allowlist juntas.
 */
function obterMotorDeAnalise(): Motor {
  if (motor) return motor
  const lexico = carregarLexico()
  const normalizar = criarNormalizador(lexico.mapas)
  const automato = new AutomatoAhoCorasick()

  const porForma = new Map<string, Padrao>()
  for (const termo of lexico.termos) {
    for (const forma of termo.formas) {
      const existente = porForma.get(forma)
      if (existente) existente.termoIds.push(termo.id)
      else porForma.set(forma, { forma, termoIds: [termo.id], ehAllowlist: false })
    }
  }
  for (const entrada of lexico.allowlist) {
    if (!porForma.has(entrada)) {
      porForma.set(entrada, { forma: entrada, termoIds: [], ehAllowlist: true })
    }
  }
  for (const padrao of porForma.values()) automato.adicionarPadrao(padrao)
  automato.compilar()

  motor = {
    normalizar,
    automato,
    termosPorId: new Map(lexico.termos.map(t => [t.id, t])),
    maxTermLen: lexico.maxTermLen,
  }
  return motor
}

/**
 * Tamanho (em chars normalizados) da maior forma do léxico. A camada de
 * streaming dimensiona o buffer a partir daqui.
 */
export function tamanhoMaximoDeTermo(): number {
  return obterMotorDeAnalise().maxTermLen
}

/**
 * Localiza no texto normalizado as entradas extras de allowlist passadas
 * pelo chamador, aplicando a mesma fronteira \p{L} da allowlist embutida.
 */
function encontrarSpansDaAllowlistExtra(
  norm: TextoNormalizado,
  normalizar: Normalizador,
  extra: string[] | undefined,
): Span[] {
  if (!extra || extra.length === 0) return []
  const spans: Span[] = []
  for (const cru of extra) {
    const forma = normalizar(cru).texto
    if (forma.length === 0) continue
    let pos = norm.texto.indexOf(forma)
    while (pos !== -1) {
      const fim = pos + forma.length
      if (!ehLetraNaFronteira(norm, pos - 1) && !ehLetraNaFronteira(norm, fim)) {
        spans.push({ ini: pos, fim })
      }
      pos = norm.texto.indexOf(forma, pos + 1)
    }
  }
  return spans
}

/**
 * Núcleo determinístico: analisa o texto sem IA e sem rede, numa passada.
 * Hits com requer_contexto saem com confianca 'ambigua' e NÃO pontuam nos
 * eixos; todo span reportado aponta para o texto ORIGINAL.
 */
export function analisar(texto: string, config: Config = {}): Analysis {
  const { normalizar, automato, termosPorId } = obterMotorDeAnalise()
  const locale: Locale = config.locale ?? 'pt-BR'

  const norm = normalizar(texto)
  const ocorrencias = automato.buscarOcorrencias(norm.texto)
  const extras = encontrarSpansDaAllowlistExtra(norm, normalizar, config.allowlistExtra)
  const matches = suprimirMatchesInvalidos(
    ocorrencias,
    automato.padroes as Padrao[],
    norm,
    termosPorId,
    locale,
    extras,
  )

  const hits: Hit[] = matches.map(m => {
    const ini = norm.origInicio[m.ini]
    const fim = norm.origFim[m.fim - 1]
    return {
      id: m.termo.id,
      forma: m.forma,
      span: [ini, fim],
      trecho: texto.slice(ini, fim),
      confianca: m.termo.requerContexto ? 'ambigua' : 'alta',
      vulgaridade: m.termo.vulgaridade,
      alvo: m.termo.alvo,
    }
  })

  return montarAnalise(hits, config)
}

/**
 * Estágio 04 — Resolver de contexto (opcional, assíncrono). Consulta o
 * resolver do chamador SOMENTE para hits ambíguos: 'ofensivo' promove para
 * confianca 'alta', 'inofensivo' descarta o hit, 'incerto' mantém
 * 'ambigua'. Resolver que lança erro degrada para 'incerto'.
 */
export async function analisarComResolver(
  texto: string,
  config: Config = {},
): Promise<Analysis> {
  const parcial = analisar(texto, config)
  if (!config.resolver) return parcial

  const finais: Hit[] = []
  for (const hit of parcial.hits) {
    if (hit.confianca !== 'ambigua') {
      finais.push(hit)
      continue
    }
    let veredicto: VeredictoDeContexto
    try {
      veredicto = await config.resolver.resolver({
        id: hit.id,
        forma: hit.forma,
        trecho: hit.trecho,
        span: hit.span,
        texto,
      })
    } catch {
      veredicto = 'incerto'
    }
    if (veredicto === 'ofensivo') finais.push({ ...hit, confianca: 'alta' })
    else if (veredicto === 'incerto') finais.push(hit)
  }

  return montarAnalise(finais, config)
}

/**
 * Fecha a análise: pontua os dois eixos a partir dos hits e, se o chamador
 * passou limites, deriva excedeuLimites.
 */
function montarAnalise(hits: Hit[], config: Config): Analysis {
  const eixos = pontuarEixos(hits)
  const analise: Analysis = { hits, ...eixos }
  if (config.limites) analise.excedeuLimites = excedeLimites(eixos, config.limites)
  return analise
}
