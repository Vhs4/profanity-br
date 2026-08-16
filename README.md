# profanity-br

Detector de profanidade **PT-BR** com núcleo **determinístico** — zero dependências de
runtime, zero IA obrigatória, zero token. O resolver de contexto (LLM/local/regra) é uma
**interface opcional**: sem ele, hits ambíguos saem com `confianca: 'ambigua'` e não pontuam.

**Princípio estrutural:** palavrão e ofensa são eixos ortogonais.
`vulgaridade` (0–3, registro linguístico) e `alvo` (`null | { tipo, severidade }`) nunca
colapsam num score único — a decisão é derivada dos limites de quem chama.

## Instalação (como consumidor)

```bash
npm install profanity-br
```

```ts
import { analisar } from 'profanity-br'

const a = analisar('que m3rd@', { limites: { vulgaridadeMax: 1 } })
// a.excedeuLimites → true; a.hits, a.vulgaridade, a.alvo
```

Pacote ESM, zero dependências, Node ≥ 18 (`require()` CommonJS funciona no Node ≥ 22).
O resolver de referência vem num subpath: `import { ResolvedorPorRegra } from 'profanity-br/resolvers/regra'`.

## Os dois eixos e a régua do app (`limites`)

A lib **mede** cada texto em dois eixos independentes; o seu app **decide** com a régua.

**Eixo 1 — `vulgaridade` (0–3):** quão pesada é a linguagem, sem importar se ataca alguém.

| Nível | Significa | Exemplos |
|---|---|---|
| 0 | limpo | até "idiota" — ofende, mas não é palavrão |
| 1 | leve | babaca, otário |
| 2 | moderado | merda, bosta, piru |
| 3 | forte | porra, caralho, buceta |

**Eixo 2 — `alvo` (`null` ou severidade 1–3):** o texto agride alguém, e quão grave?

| Severidade | Significa | Exemplos |
|---|---|---|
| null | ninguém é atacado | "que merda de trânsito" |
| 1 | xingamento leve | idiota, babaca, otário |
| 2 | insulto pesado | arrombado, fdp, vagabunda |
| 3 | slur / ódio | viado, traveco, "macaco" dirigido a pessoa |

Por que dois eixos? **"que porra de trânsito"** = vulgaridade 3, alvo null (palavrão sem vítima).
**"seu imbecil"** = vulgaridade 0, alvo insulto/1 (ataque sem palavrão). Um score único não
distingue os dois — e cada app precisa tratá-los diferente.

**`limites` é a régua:** `vulgaridadeMax` e `alvoSeveridadeMax` são os tetos (inclusive) que o
seu app tolera em cada eixo. Passou de qualquer um → `excedeuLimites: true`.

```ts
// perfis prontos de copiar
const APP_INFANTIL  = { vulgaridadeMax: 0, alvoSeveridadeMax: 0 } // nada passa
const REDE_SOCIAL   = { vulgaridadeMax: 2, alvoSeveridadeMax: 1 } // "que merda" ok; "que porra" e "seu arrombado" não
const JOGO_ADULTO   = { vulgaridadeMax: 3, alvoSeveridadeMax: 1 } // palavrão livre; assédio bloqueado

analisar('que porra de trânsito', { limites: JOGO_ADULTO })  // excedeuLimites: false
analisar('que porra de trânsito', { limites: REDE_SOCIAL })  // excedeuLimites: true  (vulgaridade 3 > 2)
analisar('seu imbecil',           { limites: APP_INFANTIL }) // excedeuLimites: true  (alvo 1 > 0)
analisar('seu imbecil',           { limites: JOGO_ADULTO })  // excedeuLimites: false (xingamento leve tolerado)
```

Sem `limites`, a lib só devolve as medições e o seu código decide o que fazer com elas.
No REPL, use `:limites 2 1` para ativar uma régua e ver `EXCEDEU`/`ok` com o motivo em cada frase.

## Comandos (desenvolvimento da lib)

```bash
npm install        # uma vez
npm test           # unitários + corpus (FP = gate zero, evasões = threshold, regionais)
npm run repl       # REPL interativo: digite frases e veja a análise
npm run analisar -- "sua frase aqui"            # one-shot
npm run analisar -- "sua frase" --json          # saída JSON
npm run analisar -- "sua frase" --locale=pt-PT  # muda o locale
npm run build:lexico  # recompila data/*.yaml → src/gen/lexico.json
npm run build         # compila dist/ (inclui o léxico) para publicação
npm publish           # roda testes + build antes (prepublishOnly) e publica
```

## Pipeline (por estágio)

1. **Normalizador** — NFKC → zero-width → homóglifos → caixa → acentos → de-leet →
   repetições 3+ (carro ≠ caro). Emite mapa de offsets norm→orig: todo span reportado
   aponta para o texto **original**.
2. **Matcher** — Aho-Corasick, uma passada, O(n); multiword no mesmo autômato.
3. **Supressor** — fronteira `\p{L}` (nunca `\b` ASCII), allowlist por contenção de span,
   longest match wins, filtro regional por locale.
4. **Resolver de contexto** *(opcional)* — só hits com `requer_contexto: true`;
   default `null` → `confianca: 'ambigua'`.
5. **Scorer** — agrega por **máximo**, nunca soma; dois eixos independentes.

## Uso como lib

```ts
import { analisar, analisarComResolver, AnalisadorStream } from 'profanity-br'

const a = analisar('que m3rd@', { limites: { vulgaridadeMax: 1 } })
// a.hits[0] → { id: 'merda', trecho: 'm3rd@', span: [4, 9], confianca: 'alta', ... }
// a.vulgaridade → 2 · a.alvo → null · a.excedeuLimites → true

// streaming (ex.: saída de LLM token a token)
const stream = new AnalisadorStream()
stream.escrever('vai tomar')
stream.escrever(' no cu')
const final = stream.flush() // trade-off: a cauda só é processada no flush
```

## Plugando a SUA IA (resolver de contexto)

O núcleo nunca chama IA. Quando um termo ambíguo aparece (`pinto`, `rola`, `macaco`...),
a lib entrega para o **seu** resolver um `PedidoDeContexto` — um por hit ambíguo:

```jsonc
{
  "id": "pinto",           // termo do léxico
  "forma": "pinto",        // forma normalizada que casou
  "trecho": "pinto",       // texto original coberto pelo span
  "span": [10, 15],        // posição no texto original
  "texto": "chupa meu pinto" // frase completa, para a IA ver o entorno
}
```

Sua IA devolve **um de três veredictos**: `'ofensivo'` (promove para confiança alta e
pontua), `'inofensivo'` (descarta o hit) ou `'incerto'` (fica ambíguo — o default
determinístico prevalece). Implementação: qualquer objeto com
`resolver(pedido) => Promise<veredicto>`:

```ts
import { analisarComResolver, type ResolvedorDeContexto } from 'profanity-br'

const minhaIA: ResolvedorDeContexto = {
  async resolver(pedido) {
    // chame Claude, um modelo local, ou o que quiser — veja exemplos/resolver-llm.ts
    return 'incerto'
  },
}
const analise = await analisarComResolver(texto, { resolver: minhaIA })
```

Pontos do design que protegem o usuário: a IA **só é consultada para hits ambíguos**
(palavrão inequívoco nunca gasta token); se o resolver lançar erro, o hit degrada para
`'ambigua'` e o pipeline nunca quebra. Exemplo completo com a API da Claude (saída
estruturada, tratamento de refusal e de erro): [exemplos/resolver-llm.ts](exemplos/resolver-llm.ts).

## Léxico e corpus

- `data/` tem semver próprio (`data/VERSAO`) — gíria nova atualiza sem release do core.
- `corpus/falsos-positivos.yaml` → **gate rígido: zero** (falso positivo quebra o build).
- `corpus/evasoes.yaml` → gate por **threshold** (evasão é infinita).
- `corpus/regionais.yaml` → pt-BR vs pt-PT.

Assimetria deliberada: falso positivo quebra o build; falso negativo é threshold —
evasão é infinita, confiança não se recupera.
