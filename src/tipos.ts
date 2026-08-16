export type Locale = 'pt-BR' | 'pt-PT'

export type Confianca = 'alta' | 'ambigua'

export type TipoAlvo = 'insulto' | 'genero' | 'orientacao' | 'raca' | 'capacitismo'

/**
 * Eixo 2 — ALVO: o texto agride alguém? (independente de ter palavrão)
 *
 * severidade:
 *  - 1 = xingamento leve      ("idiota", "babaca", "otário")
 *  - 2 = insulto pesado       ("arrombado", "fdp", "vagabunda")
 *  - 3 = slur / ódio          ("viado", "traveco", "macaco" dirigido a pessoa)
 *
 * "seu imbecil" tem vulgaridade 0 e alvo { insulto, 1 } — ofende sem palavrão.
 */
export interface Alvo {
  tipo: TipoAlvo
  severidade: 1 | 2 | 3
}

/**
 * Eixo 1 — VULGARIDADE: quão pesada é a linguagem? (independente de atacar alguém)
 *
 *  - 0 = limpo                (até "idiota" — ofende, mas não é palavrão)
 *  - 1 = leve                 ("babaca", "otário")
 *  - 2 = moderado             ("merda", "bosta", "piru")
 *  - 3 = forte                ("porra", "caralho", "buceta")
 *
 * "que porra de trânsito" tem vulgaridade 3 e alvo null — palavrão sem vítima.
 */
export type Vulgaridade = 0 | 1 | 2 | 3

export interface TermoCompilado {
  id: string
  vulgaridade: Vulgaridade
  alvo: Alvo | null
  requerContexto: boolean
  regiao: Locale[] | null
  formas: string[]
}

export interface LexicoCompilado {
  versao: string
  mapas: Mapas
  termos: TermoCompilado[]
  allowlist: string[]
  maxTermLen: number
}

export interface Mapas {
  homoglifos: Record<string, string>
  leet: Record<string, { para: string; modo: 'uma' | 'ambas' }>
}

export interface Hit {
  id: string
  forma: string
  /** span em offsets do texto ORIGINAL: [inicio, fim) */
  span: [number, number]
  /** trecho do texto original coberto pelo span */
  trecho: string
  confianca: Confianca
  vulgaridade: Vulgaridade
  alvo: Alvo | null
}

export interface Analysis {
  hits: Hit[]
  /** eixo 1 — máximo entre hits confirmados, nunca soma */
  vulgaridade: Vulgaridade
  /** eixo 2 — alvo de maior severidade entre hits confirmados, ou null */
  alvo: Alvo | null
  /** presente apenas quando config.limites foi passado */
  excedeuLimites?: boolean
}

/**
 * A régua do SEU app — a lib mede os dois eixos, você diz o quanto tolera.
 * Se qualquer eixo passar do teto, `analysis.excedeuLimites` vem true.
 *
 * Perfis de exemplo:
 *  - app infantil:        { vulgaridadeMax: 0, alvoSeveridadeMax: 0 }  nada passa
 *  - rede social:         { vulgaridadeMax: 2, alvoSeveridadeMax: 1 }  "que merda" passa, "que porra" e "seu arrombado" bloqueiam
 *  - chat de jogo adulto: { vulgaridadeMax: 3, alvoSeveridadeMax: 1 }  palavrão livre, assédio bloqueado
 *
 * Campo omitido = eixo sem teto (não é verificado).
 */
export interface Limites {
  /** teto do eixo 1 (inclusive): 2 = aceita até "merda", bloqueia "porra" */
  vulgaridadeMax?: Vulgaridade
  /** teto do eixo 2 (inclusive): 0 = nenhum insulto dirigido; 1 = tolera "idiota", bloqueia "arrombado" e slurs */
  alvoSeveridadeMax?: 0 | 1 | 2 | 3
}

export interface PedidoDeContexto {
  id: string
  forma: string
  trecho: string
  span: [number, number]
  /** texto original completo, para o resolver enxergar o entorno */
  texto: string
}

export type VeredictoDeContexto = 'ofensivo' | 'inofensivo' | 'incerto'

/** Interface, não implementação — resolver-llm/local/regra são pacotes separados. */
export interface ResolvedorDeContexto {
  resolver(pedido: PedidoDeContexto): Promise<VeredictoDeContexto>
}

export interface Config {
  locale?: Locale
  limites?: Limites
  /** usado apenas por analisarComResolver; analisar() sincrono ignora */
  resolver?: ResolvedorDeContexto
  /** entradas extras de allowlist do chamador (texto cru, normalizado internamente) */
  allowlistExtra?: string[]
}
