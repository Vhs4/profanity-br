/**
 * Corpus — roda em CI, compartilhado entre runtimes.
 * Assimetria deliberada: falso positivo quebra o build (gate zero);
 * falso negativo é threshold — evasão é infinita, confiança não se recupera.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import yaml from 'js-yaml'
import { describe, expect, it } from 'vitest'
import { analisar } from '../src/index.js'
import type { Locale } from '../src/tipos.js'

const corpusDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'corpus')
const ler = <T>(nome: string): T =>
  yaml.load(fs.readFileSync(path.join(corpusDir, nome), 'utf8')) as T

describe('corpus: falsos-positivos (gate rígido — zero)', () => {
  const frases = ler<string[]>('falsos-positivos.yaml')

  it('nenhuma frase produz hit confirmado', () => {
    const violacoes: string[] = []
    for (const frase of frases) {
      const confirmados = analisar(frase).hits.filter(h => h.confianca === 'alta')
      if (confirmados.length > 0) {
        violacoes.push(`"${frase}" → ${confirmados.map(h => `${h.id}("${h.trecho}")`).join(', ')}`)
      }
    }
    expect(violacoes, `falsos positivos:\n${violacoes.join('\n')}`).toHaveLength(0)
  })
})

describe('corpus: evasões (gate por threshold)', () => {
  const { threshold, casos } = ler<{
    threshold: number
    casos: Array<{ texto: string; termo: string }>
  }>('evasoes.yaml')

  it(`taxa de detecção ≥ ${threshold}`, () => {
    const erros: string[] = []
    let acertos = 0
    for (const caso of casos) {
      const hits = analisar(caso.texto).hits
      if (hits.some(h => h.id === caso.termo)) acertos++
      else erros.push(`"${caso.texto}" não detectou ${caso.termo} (hits: ${hits.map(h => h.id).join(', ') || 'nenhum'})`)
    }
    const taxa = acertos / casos.length
    expect(taxa, `taxa ${taxa.toFixed(3)} abaixo do threshold.\nmisses:\n${erros.join('\n')}`)
      .toBeGreaterThanOrEqual(threshold)
  })
})

describe('corpus: regionais (pt-BR vs pt-PT)', () => {
  const casos = ler<
    Array<{ texto: string; locale: Locale; confirmados: string[]; ambiguos: string[] }>
  >('regionais.yaml')

  for (const caso of casos) {
    it(`[${caso.locale}] "${caso.texto}"`, () => {
      const analise = analisar(caso.texto, { locale: caso.locale })
      const confirmados = analise.hits.filter(h => h.confianca === 'alta').map(h => h.id).sort()
      const ambiguos = analise.hits.filter(h => h.confianca === 'ambigua').map(h => h.id).sort()
      expect(confirmados).toEqual([...(caso.confirmados ?? [])].sort())
      expect(ambiguos).toEqual([...(caso.ambiguos ?? [])].sort())
    })
  }
})
