import { analisar, tamanhoMaximoDeTermo } from './index.js'
import { pontuarEixos, excedeLimites } from './scorer.js'
import type { Analysis, Config, Hit } from './tipos.js'

/**
 * Camada de streaming — wrapper do pipeline, não um pipeline novo. Mantém
 * uma cauda de maxTermLen×3 chars sem emitir (um termo pode estar cortado
 * entre chunks); flush() processa a cauda. A latência da cauda é o
 * trade-off documentado na arquitetura.
 */
export class AnalisadorStream {
  private buffer = ''
  private base = 0
  private emitidos: Hit[] = []
  private vistos = new Set<string>()
  private readonly reserva: number

  constructor(private config: Config = {}) {
    this.reserva = tamanhoMaximoDeTermo() * 3
  }

  /**
   * Alimenta um chunk e devolve os hits FINALIZADOS por esta escrita. O
   * corte do buffer só acontece em whitespace e nunca dentro de hit
   * pendente — cortar no meio de uma palavra fabricaria uma fronteira
   * falsa ("qmerda" cortado viraria "merda").
   */
  escrever(chunk: string): Hit[] {
    this.buffer += chunk
    if (this.buffer.length <= this.reserva * 2) return []

    const local = analisar(this.buffer, { ...this.config, limites: undefined })
    const seguro = this.buffer.length - this.reserva
    const novos = this.emitirHitsNovos(local.hits, h => h.span[1] <= seguro)

    let corte = Math.max(0, seguro - this.reserva)
    for (const h of local.hits) {
      if (h.span[1] > seguro) corte = Math.min(corte, h.span[0])
    }
    while (corte > 0 && !/\s/.test(this.buffer[corte - 1])) corte--
    if (corte === 0 && this.buffer.length > this.reserva * 20) corte = seguro

    if (corte > 0) {
      this.base += corte
      this.buffer = this.buffer.slice(corte)
    }
    return novos
  }

  /**
   * Processa a cauda pendente e devolve a análise agregada do stream
   * inteiro, com os eixos pontuados sobre todos os hits emitidos.
   */
  flush(): Analysis {
    const local = analisar(this.buffer, { ...this.config, limites: undefined })
    this.emitirHitsNovos(local.hits, () => true)
    const eixos = pontuarEixos(this.emitidos)
    const analise: Analysis = { hits: [...this.emitidos], ...eixos }
    if (this.config.limites) {
      analise.excedeuLimites = excedeLimites(eixos, this.config.limites)
    }
    return analise
  }

  /**
   * Converte hits locais do buffer para offsets globais do stream e emite
   * só os inéditos: dedupe por span exato e descarte de hit contido num já
   * emitido (sufixo de multiword re-casado após o corte).
   */
  private emitirHitsNovos(locais: Hit[], aceitar: (h: Hit) => boolean): Hit[] {
    const novos: Hit[] = []
    for (const h of locais) {
      if (!aceitar(h)) continue
      const global: Hit = {
        ...h,
        span: [h.span[0] + this.base, h.span[1] + this.base],
      }
      const chave = `${global.id}:${global.span[0]}:${global.span[1]}`
      if (this.vistos.has(chave)) continue
      const contido = this.emitidos.some(
        e =>
          e.span[0] <= global.span[0] &&
          global.span[1] <= e.span[1] &&
          !(e.span[0] === global.span[0] && e.span[1] === global.span[1]),
      )
      if (contido) continue
      this.vistos.add(chave)
      this.emitidos.push(global)
      novos.push(global)
    }
    return novos
  }
}
