import fs from 'node:fs'
import type { LexicoCompilado } from './tipos.js'

let cache: LexicoCompilado | null = null

/** Carrega o pacote de dados compilado (gerado por `npm run build:lexico`). */
export function carregarLexico(): LexicoCompilado {
  if (cache) return cache
  const url = new URL('./gen/lexico.json', import.meta.url)
  if (!fs.existsSync(url)) {
    throw new Error(
      'Léxico não compilado. Rode: npm run build:lexico (gera src/gen/lexico.json a partir de data/)',
    )
  }
  cache = JSON.parse(fs.readFileSync(url, 'utf8')) as LexicoCompilado
  return cache
}
