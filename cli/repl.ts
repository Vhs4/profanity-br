/**
 * REPL interativo: npm run repl
 * Digite uma frase e veja a análise na hora. Sem IA, sem token, sem rede.
 */
import readline from 'node:readline'
import { analisar, analisarComResolver } from '../src/index.js'
import { carregarLexico } from '../src/lexico.js'
import { ResolvedorPorRegra } from '../src/resolvers/regra.js'
import type { Config, Limites, Locale } from '../src/tipos.js'
import { renderizarAnalise } from './render.js'

const R = '\x1b[0m'
const DIM = '\x1b[2m'
const NEG = '\x1b[1m'

const lexico = carregarLexico()
let locale: Locale = 'pt-BR'
let usarResolver = false
let modoJson = false
let limites: Limites | undefined

console.log()
console.log(`${NEG}profanity-br${R} · REPL de teste ${DIM}(léxico ${lexico.versao}, ${lexico.termos.length} termos)${R}`)
console.log(`${DIM}Digite uma frase e Enter. Comandos:${R}`)
console.log(`${DIM}  :locale pt-BR|pt-PT   troca o locale (atual: pt-BR)${R}`)
console.log(`${DIM}  :resolver on|off      liga o resolver de contexto por regra (off = ambíguo fica ambíguo)${R}`)
console.log(`${DIM}  :limites V A          régua do app: V = vulgaridade máx (0-3), A = alvo severidade máx (0-3)${R}`)
console.log(`${DIM}                        ex.: ":limites 2 1" = rede social · ":limites 0 0" = app infantil · ":limites off" desliga${R}`)
console.log(`${DIM}  :json on|off          alterna saída JSON${R}`)
console.log(`${DIM}  :sair                 encerra${R}`)
console.log()

const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
const atualizarPrompt = () => {
  const lim = limites ? `·lim ${limites.vulgaridadeMax}/${limites.alvoSeveridadeMax}` : ''
  rl.setPrompt(`${DIM}[${locale}${usarResolver ? '+regra' : ''}${lim}]${R} › `)
}
atualizarPrompt()
rl.prompt()

async function tratarLinha(linha: string): Promise<void> {
  const entrada = linha.trim()
  if (entrada === '') return rl.prompt()

  if (entrada.startsWith(':')) {
    const [cmd, arg, arg2] = entrada.slice(1).split(/\s+/)
    if (cmd === 'sair' || cmd === 'q') return rl.close()
    else if (cmd === 'locale' && (arg === 'pt-BR' || arg === 'pt-PT')) locale = arg
    else if (cmd === 'resolver') usarResolver = arg !== 'off'
    else if (cmd === 'json') modoJson = arg !== 'off'
    else if (cmd === 'limites') {
      if (arg === 'off' || arg === undefined) {
        limites = undefined
        console.log(`${DIM}limites desligados — a análise volta a só medir${R}`)
      } else {
        const v = Number(arg)
        const a = Number(arg2 ?? arg)
        if ([0, 1, 2, 3].includes(v) && [0, 1, 2, 3].includes(a)) {
          limites = {
            vulgaridadeMax: v as Limites['vulgaridadeMax'],
            alvoSeveridadeMax: a as Limites['alvoSeveridadeMax'],
          }
          console.log(
            `${DIM}régua ativa: vulgaridade até ${v}/3, alvo até severidade ${a}/3 — acima disso, EXCEDEU${R}`,
          )
        } else {
          console.log(`${DIM}uso: :limites V A (cada um de 0 a 3), ex.: :limites 2 1${R}`)
        }
      }
    } else console.log(`${DIM}comando desconhecido: ${entrada}${R}`)
    atualizarPrompt()
    return rl.prompt()
  }

  const config: Config = { locale, limites }
  if (usarResolver) config.resolver = new ResolvedorPorRegra()
  const analise = usarResolver
    ? await analisarComResolver(entrada, config)
    : analisar(entrada, config)

  console.log()
  if (modoJson) console.log(JSON.stringify({ texto: entrada, ...analise }, null, 2))
  else console.log(renderizarAnalise(entrada, analise, limites))
  console.log()
  rl.prompt()
}

// com stdin piped, 'close' chega antes dos handlers async — drena a fila antes de sair
let fila: Promise<void> = Promise.resolve()
rl.on('line', linha => {
  fila = fila.then(() => tratarLinha(linha))
})

rl.on('close', () => {
  void fila.then(() => {
    console.log(`\n${DIM}até mais 👋${R}`)
    process.exit(0)
  })
})
