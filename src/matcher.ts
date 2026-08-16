/**
 * Estágio 02 — Matcher. Aho-Corasick clássico: todas as formas (termos e
 * allowlist, multiword incluso) vivem num único autômato e o texto é
 * percorrido UMA vez, O(n) no tamanho da entrada.
 */
export interface Padrao {
  forma: string
  termoIds: string[]
  ehAllowlist: boolean
}

export interface Ocorrencia {
  padrao: number
  /** [ini, fim) em offsets do texto normalizado */
  ini: number
  fim: number
}

export class AutomatoAhoCorasick {
  private proximo: Array<Map<string, number>> = [new Map()]
  private falha: number[] = [0]
  private saida: number[][] = [[]]
  private compilado = false
  readonly padroes: Padrao[] = []

  /**
   * Insere uma forma no trie. Só é permitido antes de compilar() — depois
   * disso o autômato é imutável.
   */
  adicionarPadrao(padrao: Padrao): void {
    if (this.compilado) throw new Error('Autômato já compilado')
    const idx = this.padroes.length
    this.padroes.push(padrao)
    let no = 0
    for (const ch of padrao.forma) {
      let prox = this.proximo[no].get(ch)
      if (prox === undefined) {
        prox = this.proximo.length
        this.proximo.push(new Map())
        this.falha.push(0)
        this.saida.push([])
        this.proximo[no].set(ch, prox)
      }
      no = prox
    }
    this.saida[no].push(idx)
  }

  /**
   * Constrói as ligações de falha por BFS e propaga as saídas — é o que
   * permite achar padrões que são sufixo de outros na mesma passada.
   */
  compilar(): void {
    if (this.compilado) return
    const fila: number[] = []
    for (const filho of this.proximo[0].values()) {
      this.falha[filho] = 0
      fila.push(filho)
    }
    while (fila.length > 0) {
      const no = fila.shift()!
      for (const [ch, filho] of this.proximo[no]) {
        fila.push(filho)
        let f = this.falha[no]
        while (f !== 0 && !this.proximo[f].has(ch)) f = this.falha[f]
        const destino = this.proximo[f].get(ch)
        this.falha[filho] = destino !== undefined && destino !== filho ? destino : 0
        this.saida[filho].push(...this.saida[this.falha[filho]])
      }
    }
    this.compilado = true
  }

  /**
   * Percorre o texto normalizado uma única vez e devolve TODA ocorrência de
   * qualquer padrão, com span [ini, fim). Quem decide o que vale é o
   * supressor — aqui não há filtro nenhum.
   */
  buscarOcorrencias(texto: string): Ocorrencia[] {
    if (!this.compilado) this.compilar()
    const resultado: Ocorrencia[] = []
    let no = 0
    for (let pos = 0; pos < texto.length; pos++) {
      const ch = texto[pos]
      while (no !== 0 && !this.proximo[no].has(ch)) no = this.falha[no]
      no = this.proximo[no].get(ch) ?? 0
      for (const idx of this.saida[no]) {
        const len = this.padroes[idx].forma.length
        resultado.push({ padrao: idx, ini: pos - len + 1, fim: pos + 1 })
      }
    }
    return resultado
  }
}
