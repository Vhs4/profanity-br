import { describe, expect, it } from 'vitest'
import { carregarLexico } from '../src/lexico.js'
import { criarNormalizador } from '../src/normalizador.js'

const normalizar = criarNormalizador(carregarLexico().mapas)

describe('normalizador', () => {
  it('aplica NFKC, caixa e acentos', () => {
    expect(normalizar('ＭÉRDÃ').texto).toBe('merda')
  })

  it('remove zero-width', () => {
    expect(normalizar('me​rda').texto).toBe('merda')
  })

  it('mapeia homóglifos cirílicos, gregos maiúsculos e latinos estendidos', () => {
    expect(normalizar('mеrdа').texto).toBe('merda') // е, а cirílicos
    expect(normalizar('MERDΑ').texto).toBe('merda') // Α grego maiúsculo
    expect(normalizar('pørra').texto).toBe('porra')
    expect(normalizar('carałho').texto).toBe('caralho')
  })

  it('de-leet só junto a letra, com cascata pela esquerda', () => {
    expect(normalizar('m3rd4').texto).toBe('merda')
    expect(normalizar('0t4r10').texto).toBe('otario')
    expect(normalizar('curso 3').texto).toBe('curso 3')
    expect(normalizar('R$ 50').texto).toBe('rs 50')
  })

  it('"!" exige letra dos dois lados', () => {
    expect(normalizar('merda!').texto).toBe('merda')
    expect(normalizar('f!lho').texto).toBe('filho')
  })

  it('colapsa repetições só em runs de 3+ (carro ≠ caro)', () => {
    expect(normalizar('carro').texto).toBe('carro')
    expect(normalizar('meeeerda').texto).toBe('merda')
    expect(normalizar('merrrda').texto).toBe('merda')
    expect(normalizar('porrrra').texto).toBe('pora')
    expect(normalizar('cuuuu').texto).toBe('cu')
  })

  it('separadores viram espaço único', () => {
    expect(normalizar('vai,  tomar... no --- cu!!').texto).toBe('vai tomar no cu')
  })

  it('mapa de offsets aponta para o span no original', () => {
    const original = 'que M3RD@ hein'
    const n = normalizar(original)
    const ini = n.texto.indexOf('merda')
    expect(ini).toBeGreaterThanOrEqual(0)
    const spanIni = n.origInicio[ini]
    const spanFim = n.origFim[ini + 'merda'.length - 1]
    expect(original.slice(spanIni, spanFim)).toBe('M3RD@')
  })

  it('offsets cobrem o run colapsado inteiro', () => {
    const original = 'meeeerda'
    const n = normalizar(original)
    expect(n.texto).toBe('merda')
    expect(original.slice(n.origInicio[0], n.origFim[4])).toBe('meeeerda')
  })
})
