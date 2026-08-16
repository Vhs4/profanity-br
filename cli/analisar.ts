/**
 * One-shot: npm run analisar -- "sua frase aqui"
 * Flags: --json (saída máquina), --locale=pt-PT, --resolver=regra,
 *        --limites=V,A (régua do app: vulgaridade máx, alvo severidade máx)
 */
import { analisar, analisarComResolver } from '../src/index.js'
import { ResolvedorPorRegra } from '../src/resolvers/regra.js'
import type { Config, Limites, Locale } from '../src/tipos.js'
import { renderizarAnalise } from './render.js'

const args = process.argv.slice(2)
const flags = args.filter(a => a.startsWith('--'))
const texto = args.filter(a => !a.startsWith('--')).join(' ')

if (!texto) {
  console.error(
    'uso: npm run analisar -- "sua frase aqui" [--json] [--locale=pt-PT] [--resolver=regra] [--limites=2,1]',
  )
  process.exit(2)
}

const config: Config = {}
for (const flag of flags) {
  if (flag.startsWith('--locale=')) config.locale = flag.slice('--locale='.length) as Locale
  if (flag === '--resolver=regra') config.resolver = new ResolvedorPorRegra()
  if (flag.startsWith('--limites=')) {
    const [v, a] = flag.slice('--limites='.length).split(',').map(Number)
    if ([0, 1, 2, 3].includes(v) && [0, 1, 2, 3].includes(a)) {
      config.limites = {
        vulgaridadeMax: v as Limites['vulgaridadeMax'],
        alvoSeveridadeMax: a as Limites['alvoSeveridadeMax'],
      }
    } else {
      console.error('--limites=V,A com V e A de 0 a 3, ex.: --limites=2,1')
      process.exit(2)
    }
  }
}

const analise = config.resolver
  ? await analisarComResolver(texto, config)
  : analisar(texto, config)

if (flags.includes('--json')) {
  console.log(JSON.stringify({ texto, ...analise }, null, 2))
} else {
  console.log()
  console.log(renderizarAnalise(texto, analise, config.limites))
  console.log()
}
