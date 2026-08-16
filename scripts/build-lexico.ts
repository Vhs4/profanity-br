/**
 * Build do pacote de dados: data/*.yaml → src/gen/lexico.json. As formas
 * são normalizadas aqui com o MESMO normalizador do runtime, então o
 * autômato casa exatamente o que o estágio 01 produz. O léxico tem semver
 * próprio (data/VERSAO) — gíria nova não exige release do core.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import yaml from 'js-yaml'
import { criarNormalizador } from '../src/normalizador.js'
import type { Alvo, LexicoCompilado, Locale, Mapas, TermoCompilado } from '../src/tipos.js'

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dataDir = path.join(raiz, 'data')

interface TermoCru {
  id: string
  formas: string[]
  vulgaridade: number
  alvo?: { tipo: string; severidade: number }
  requer_contexto?: boolean
  regiao?: string[]
}

const TIPOS_ALVO = new Set(['insulto', 'genero', 'orientacao', 'raca', 'capacitismo'])
const LOCALES = new Set(['pt-BR', 'pt-PT'])

/** Aborta o build com mensagem de erro — dado inválido nunca vira léxico. */
function falhar(msg: string): never {
  console.error(`✖ build do léxico: ${msg}`)
  process.exit(1)
}

const mapasCrus = yaml.load(fs.readFileSync(path.join(dataDir, 'homoglifos.yaml'), 'utf8')) as {
  homoglifos: Record<string, string>
  leet: Record<string, { para: string; modo: string }>
}
if (!mapasCrus?.homoglifos || !mapasCrus?.leet) falhar('homoglifos.yaml sem chaves homoglifos/leet')
for (const [ch, regra] of Object.entries(mapasCrus.leet)) {
  if (!['uma', 'ambas'].includes(regra.modo)) falhar(`leet "${ch}": modo inválido "${regra.modo}"`)
}
const mapas = mapasCrus as Mapas
const normalizar = criarNormalizador(mapas)

/**
 * Gera as variantes de casamento de uma forma normalizada: colapso de letra
 * dobrada (o texto "porrrra" colapsa para "pora", então "porra" ganha a
 * variante "pora"), concatenação de multiword ("vaitomarnocu") e l→i para
 * leet de "1" ("cara1ho" vira "caraiho" no texto — só formas com 5+ chars
 * e até 3 "l"s).
 */
function gerarVariantesDeForma(base: string, comLparaI: boolean): string[] {
  const variantes = new Set([base])
  const add = (s: string) => {
    if (s.length > 1) variantes.add(s)
  }
  for (const v of [...variantes]) add(v.replace(/(\p{L})\1+/gu, '$1'))
  for (const v of [...variantes]) if (v.includes(' ')) add(v.replace(/ /g, ''))
  if (comLparaI) {
    for (const v of [...variantes]) {
      if (v.length < 5) continue
      const posicoes = [...v].flatMap((c, k) => (c === 'l' ? [k] : []))
      if (posicoes.length === 0 || posicoes.length > 3) continue
      for (let mask = 1; mask < 1 << posicoes.length; mask++) {
        const chars = [...v]
        posicoes.forEach((p, b) => {
          if (mask & (1 << b)) chars[p] = 'i'
        })
        add(chars.join(''))
      }
    }
  }
  return [...variantes]
}

const termosDir = path.join(dataDir, 'termos')
const termos: TermoCompilado[] = []
const idsVistos = new Set<string>()
for (const arquivo of fs.readdirSync(termosDir).filter(f => f.endsWith('.yaml')).sort()) {
  const crus = yaml.load(fs.readFileSync(path.join(termosDir, arquivo), 'utf8')) as TermoCru[]
  for (const cru of crus) {
    const onde = `${arquivo} → ${cru.id ?? '(sem id)'}`
    if (!cru.id) falhar(`${onde}: id ausente`)
    if (idsVistos.has(cru.id)) falhar(`${onde}: id duplicado`)
    idsVistos.add(cru.id)
    if (!Array.isArray(cru.formas) || cru.formas.length === 0) falhar(`${onde}: formas vazias`)
    if (![0, 1, 2, 3].includes(cru.vulgaridade)) falhar(`${onde}: vulgaridade fora de 0–3`)
    if (cru.alvo) {
      if (!TIPOS_ALVO.has(cru.alvo.tipo)) falhar(`${onde}: tipo de alvo "${cru.alvo.tipo}"`)
      if (![1, 2, 3].includes(cru.alvo.severidade)) falhar(`${onde}: severidade fora de 1–3`)
    }
    if (cru.regiao) {
      for (const r of cru.regiao) if (!LOCALES.has(r)) falhar(`${onde}: regiao "${r}"`)
    }

    const normalizadas = cru.formas.map(f => normalizar(f).texto)
    if (normalizadas.some(f => f.length === 0)) falhar(`${onde}: forma normaliza para vazio`)
    const formas = [...new Set(normalizadas.flatMap(f => gerarVariantesDeForma(f, true)))]
    termos.push({
      id: cru.id,
      vulgaridade: cru.vulgaridade as TermoCompilado['vulgaridade'],
      alvo: (cru.alvo as Alvo | undefined) ?? null,
      requerContexto: cru.requer_contexto ?? false,
      regiao: (cru.regiao as Locale[] | undefined) ?? null,
      formas,
    })
  }
}

const allowCrua = yaml.load(fs.readFileSync(path.join(dataDir, 'allowlist.yaml'), 'utf8')) as string[]
const allowlist = [
  ...new Set(
    allowCrua
      .map(e => normalizar(e).texto)
      .filter(e => e.length > 0)
      .flatMap(e => gerarVariantesDeForma(e, false)),
  ),
]

const todasFormas = new Map<string, string>()
for (const t of termos) for (const f of t.formas) todasFormas.set(f, t.id)
for (const a of allowlist) {
  if (todasFormas.has(a)) {
    falhar(`allowlist "${a}" é idêntica a uma forma do termo "${todasFormas.get(a)}" — use requer_contexto no termo`)
  }
}

const maxTermLen = Math.max(...termos.flatMap(t => t.formas.map(f => f.length)))
const versao = fs.readFileSync(path.join(dataDir, 'VERSAO'), 'utf8').trim()

const lexico: LexicoCompilado = { versao, mapas, termos, allowlist, maxTermLen }
const destino = path.join(raiz, 'src', 'gen')
fs.mkdirSync(destino, { recursive: true })
fs.writeFileSync(path.join(destino, 'lexico.json'), JSON.stringify(lexico, null, 2))

const totalFormas = termos.reduce((s, t) => s + t.formas.length, 0)
console.log(
  `✓ léxico ${versao}: ${termos.length} termos, ${totalFormas} formas, ${allowlist.length} allowlist, maxTermLen=${maxTermLen}`,
)
