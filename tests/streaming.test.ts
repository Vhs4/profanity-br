import { describe, expect, it } from 'vitest'
import { AnalisadorStream } from '../src/streaming.js'

describe('camada de streaming', () => {
  it('detecta termo multiword cortado entre chunks', () => {
    const stream = new AnalisadorStream()
    stream.escrever('cara, vai tomar')
    stream.escrever(' no cu, falou?')
    const final = stream.flush()
    expect(final.hits.map(h => h.id)).toContain('vai-tomar-no-cu')
    expect(final.vulgaridade).toBe(3)
  })

  it('spans são globais no stream original', () => {
    const stream = new AnalisadorStream()
    const a = 'texto inicial limpo aqui. '
    stream.escrever(a)
    stream.escrever('que merda')
    const final = stream.flush()
    expect(final.hits).toHaveLength(1)
    const [ini, fim] = final.hits[0].span
    expect((a + 'que merda').slice(ini, fim)).toBe('merda')
  })

  it('não duplica hits entre escrever() e flush()', () => {
    const stream = new AnalisadorStream()
    const emitidos = []
    for (let i = 0; i < 30; i++) {
      emitidos.push(...stream.escrever('bla bla merda bla. '))
    }
    const final = stream.flush()
    expect(final.hits.length).toBe(30)
    const chaves = final.hits.map(h => `${h.span[0]}:${h.span[1]}`)
    expect(new Set(chaves).size).toBe(30)
  })

  it('stream limpo termina limpo', () => {
    const stream = new AnalisadorStream()
    stream.escrever('um texto perfeitamente normal ')
    stream.escrever('sem nada de errado nele')
    const final = stream.flush()
    expect(final.hits).toHaveLength(0)
    expect(final.vulgaridade).toBe(0)
  })

  it('corte do buffer não fabrica fronteira dentro de palavra (qmerda)', () => {
    const texto = 'a'.repeat(16) + ' qmerda ' + 'b'.repeat(160)
    const stream = new AnalisadorStream()
    for (const c of texto) stream.escrever(c)
    expect(stream.flush().hits).toHaveLength(0)
  })

  it('alongamento extremo sem espaços ainda é detectado', () => {
    const stream = new AnalisadorStream()
    for (const c of 'po' + 'r'.repeat(200) + 'a') stream.escrever(c)
    const final = stream.flush()
    expect(final.hits.map(h => h.id)).toEqual(['porra'])
    expect(final.vulgaridade).toBe(3)
  })

  it('sufixo de multiword re-casado após o corte é descartado', () => {
    const texto =
      'x'.repeat(40) + ' merda ' + 'y'.repeat(120) + ' vai toma no cu ' + 'z'.repeat(120)
    const stream = new AnalisadorStream()
    for (let i = 0; i < texto.length; i += 64) stream.escrever(texto.slice(i, i + 64))
    const final = stream.flush()
    const ids = final.hits.map(h => h.id).sort()
    expect(ids).toEqual(['merda', 'vai-tomar-no-cu'])
  })
})
