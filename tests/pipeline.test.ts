import { describe, expect, it } from 'vitest'
import { analisar, analisarComResolver } from '../src/index.js'
import type { ResolvedorDeContexto } from '../src/tipos.js'

describe('pipeline determinístico', () => {
  it('texto limpo → zero hits, eixos zerados', () => {
    const a = analisar('Bom dia, tudo bem com você?')
    expect(a.hits).toHaveLength(0)
    expect(a.vulgaridade).toBe(0)
    expect(a.alvo).toBeNull()
  })

  it('fronteira \\p{L}: substring dentro de palavra não dispara', () => {
    for (const frase of ['o curso começou', 'CUIDADO com o degrau', 'computador novo']) {
      expect(analisar(frase).hits).toHaveLength(0)
    }
  })

  it('allowlist multiword por contenção de span (pica-pau)', () => {
    expect(analisar('o pica-pau bateu na árvore').hits).toHaveLength(0)
  })

  it('longest match wins: filho da puta engole puta', () => {
    const a = analisar('seu filho da puta!')
    expect(a.hits).toHaveLength(1)
    expect(a.hits[0].id).toBe('filho-da-puta')
    expect(a.hits[0].trecho).toBe('filho da puta')
  })

  it('span aponta para o texto ORIGINAL mesmo com evasão', () => {
    const original = 'que M3RD@ foi essa'
    const a = analisar(original)
    expect(a.hits).toHaveLength(1)
    const [ini, fim] = a.hits[0].span
    expect(original.slice(ini, fim)).toBe('M3RD@')
    expect(a.hits[0].trecho).toBe('M3RD@')
  })

  it('scorer agrega por máximo, nunca soma', () => {
    const a = analisar('merda merda merda')
    expect(a.hits).toHaveLength(3)
    expect(a.vulgaridade).toBe(2)
  })

  it('eixos ortogonais: imbecil tem vulgaridade 0 e alvo', () => {
    const a = analisar('você é um imbecil')
    expect(a.vulgaridade).toBe(0)
    expect(a.alvo).toEqual({ tipo: 'insulto', severidade: 1 })
  })

  it('dois eixos ao mesmo tempo', () => {
    const a = analisar('vai tomar no cu seu cuzão')
    expect(a.hits.map(h => h.id).sort()).toEqual(['cuzao', 'vai-tomar-no-cu'])
    expect(a.vulgaridade).toBe(3)
    expect(a.alvo).toEqual({ tipo: 'insulto', severidade: 2 })
  })

  it('dígito colado no fim não quebra o match (merda1)', () => {
    const a = analisar('que merda1')
    expect(a.hits.map(h => h.id)).toEqual(['merda'])
    expect(a.vulgaridade).toBe(2)
  })

  it('fronteira funciona com letra astral (𐌰cu)', () => {
    expect(analisar('𐌰cu').hits).toHaveLength(0)
    expect(analisar('cu𐌰').hits).toHaveLength(0)
  })

  it('requer_contexto sem resolver → ambigua e fora dos eixos', () => {
    const a = analisar('vi um macaco no zoológico')
    expect(a.hits).toHaveLength(1)
    expect(a.hits[0].confianca).toBe('ambigua')
    expect(a.vulgaridade).toBe(0)
    expect(a.alvo).toBeNull()
  })

  it('locale filtra termos regionais', () => {
    expect(analisar('esperei na bicha do banco', { locale: 'pt-PT' }).hits).toHaveLength(0)
    expect(analisar('seu bicha', { locale: 'pt-BR' }).hits).toHaveLength(1)
  })

  it('limites derivam a decisão — a lib nunca decide sozinha', () => {
    const ok = analisar('que merda', { limites: { vulgaridadeMax: 2 } })
    expect(ok.excedeuLimites).toBe(false)
    const estourou = analisar('que caralho', { limites: { vulgaridadeMax: 2 } })
    expect(estourou.excedeuLimites).toBe(true)
    const alvo = analisar('seu cuzão', { limites: { alvoSeveridadeMax: 1 } })
    expect(alvo.excedeuLimites).toBe(true)
  })

  it('allowlistExtra do chamador suprime por contenção', () => {
    const a = analisar('a banda Porra Louca tocou ontem', {
      allowlistExtra: ['porra louca'],
    })
    expect(a.hits).toHaveLength(0)
  })

  it('allowlistExtra respeita fronteira — não ancora no fim de outra palavra', () => {
    const a = analisar('uma puta confusao', { allowlistExtra: ['a puta'] })
    expect(a.hits.map(h => h.id)).toEqual(['puta'])
  })
})

describe('resolver de contexto (estágio 04, opcional)', () => {
  const resolvedor = (veredicto: 'ofensivo' | 'inofensivo' | 'incerto'): ResolvedorDeContexto => ({
    resolver: async () => veredicto,
  })

  it('ofensivo promove para alta e pontua', async () => {
    const a = await analisarComResolver('seu macaco', { resolver: resolvedor('ofensivo') })
    expect(a.hits[0].confianca).toBe('alta')
    expect(a.alvo).toEqual({ tipo: 'raca', severidade: 3 })
  })

  it('inofensivo descarta o hit', async () => {
    const a = await analisarComResolver('vi um macaco', { resolver: resolvedor('inofensivo') })
    expect(a.hits).toHaveLength(0)
  })

  it('incerto mantém ambigua', async () => {
    const a = await analisarComResolver('olha o macaco', { resolver: resolvedor('incerto') })
    expect(a.hits[0].confianca).toBe('ambigua')
    expect(a.alvo).toBeNull()
  })

  it('resolver que lança degrada para incerto', async () => {
    const quebrado: ResolvedorDeContexto = {
      resolver: async () => {
        throw new Error('llm fora do ar')
      },
    }
    const a = await analisarComResolver('olha o macaco', { resolver: quebrado })
    expect(a.hits[0].confianca).toBe('ambigua')
  })
})

describe('resolver por regra (referência)', async () => {
  const { ResolvedorPorRegra } = await import('../src/resolvers/regra.js')
  const config = { resolver: new ResolvedorPorRegra() }

  it('possessivo promove insulto dirigido', async () => {
    const a = await analisarComResolver('seu arrombado', config)
    expect(a.hits[0].confianca).toBe('alta')
  })

  it('complemento nominal desfaz a leitura de insulto (seu pau de selfie)', async () => {
    const a = await analisarComResolver('Seu pau de selfie quebrou na viagem', config)
    expect(a.hits.every(h => h.confianca === 'ambigua')).toBe(true)
    expect(a.vulgaridade).toBe(0)
  })

  it('uso literal descarta (porta arrombada)', async () => {
    const a = await analisarComResolver('a porta foi arrombada de madrugada', config)
    expect(a.hits).toHaveLength(0)
  })

  it('verbo sexual + possessivo próprio promove (chupa meu pinto)', async () => {
    const a = await analisarComResolver('chupa meu pinto', config)
    expect(a.hits[0].confianca).toBe('alta')
    expect(a.vulgaridade).toBe(2)
  })

  it('possessivo próprio sozinho não promove (meu pinto fugiu)', async () => {
    const a = await analisarComResolver('meu pinto fugiu do galinheiro', config)
    expect(a.hits[0].confianca).toBe('ambigua')
    expect(a.vulgaridade).toBe(0)
  })

  it('artigo antes descarta (o pinto)', async () => {
    const a = await analisarComResolver('o pinto amarelo cresceu rápido', config)
    expect(a.hits).toHaveLength(0)
  })

  it('nome próprio capitalizado descarta (Pedro Pinto)', async () => {
    const a = await analisarComResolver('Pedro Pinto assinou o contrato', config)
    expect(a.hits).toHaveLength(0)
    const b = await analisarComResolver('a reunião com Fernanda Pinto foi ótima', config)
    expect(b.hits).toHaveLength(0)
  })

  it('capitalização no início de frase não vira nome', async () => {
    const a = await analisarComResolver('Pinto pequeno demais', config)
    expect(a.hits[0]?.confianca).toBe('ambigua')
  })

  it('caixa alta gritada não passa como nome (SEU PINTO)', async () => {
    const a = await analisarComResolver('SEU PINTO', config)
    expect(a.hits[0].confianca).toBe('alta')
  })
})
