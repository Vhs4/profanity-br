# profanity-br

[![CI](https://github.com/Vhs4/profanity-br/actions/workflows/ci.yml/badge.svg)](https://github.com/Vhs4/profanity-br/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/profanity-br)](https://www.npmjs.com/package/profanity-br)
[![licença](https://img.shields.io/badge/licen%C3%A7a-MIT-green)](LICENSE)

Detector de profanidade **feito para o português do Brasil**. Núcleo 100% determinístico —
zero dependências de runtime, zero IA obrigatória, zero chamadas de rede. IA entra só se
você quiser, como plugin opcional para resolver ambiguidade.

**O princípio que guia tudo:** palavrão e ofensa são eixos ortogonais.
*"que porra de trânsito"* é vulgar mas não ataca ninguém; *"seu imbecil"* ataca alguém
sem um palavrão sequer. Libs que colapsam os dois num "score de toxicidade" único não
conseguem expressar nenhuma política de moderação real — esta lib mede os dois eixos
separados e **quem decide é você**.

## Índice

- [Instalação](#instalação)
- [Começando em 30 segundos](#começando-em-30-segundos)
- [O que a análise devolve](#o-que-a-análise-devolve)
- [Os dois eixos e a régua do app](#os-dois-eixos-e-a-régua-do-app-limites)
- [Palavras de duplo sentido e o resolver](#palavras-de-duplo-sentido-e-o-resolver)
- [Plugando a SUA IA](#plugando-a-sua-ia)
- [Streaming](#streaming)
- [Todas as opções](#todas-as-opções)
- [Como funciona por dentro](#como-funciona-por-dentro)
- [Desenvolvimento e contribuição](#desenvolvimento-e-contribuição)

## Instalação

```bash
npm install profanity-br
```

Pacote ESM, Node ≥ 18 (`require()` CommonJS funciona no Node ≥ 22). TypeScript incluso.

## Começando em 30 segundos

```ts
import { analisar } from 'profanity-br'

const a = analisar('que m3rd@, seu cuzão', {
  limites: { vulgaridadeMax: 2, alvoSeveridadeMax: 1 },
})

a.excedeuLimites // true  → seu app decide o que fazer (rejeitar, censurar, revisar)
a.vulgaridade    // 3     → eixo 1: linguagem pesada (0–3)
a.alvo           // { tipo: 'insulto', severidade: 2 } → eixo 2: ataque a alguém
a.hits           // onde e o que foi detectado (spans no texto ORIGINAL)
```

A evasão já vem tratada: leet (`m3rd@`, `0t4r10`), homóglifos cirílicos/gregos (`mеrdа`,
`MERDΑ`), caracteres invisíveis, repetição (`porrrra`), concatenação (`vaitomarnocu`),
fullwidth (`ｃａｒａｌｈｏ`) e variações com `1`→`l` (`cara1ho`).

E o que **não** deve disparar, não dispara: `curso`, `deputado`, `computador`, `pica-pau`,
`análise FODA`, o símbolo químico `Cu`, siglas como `CRL`/`TNC`, nomes próprios — tudo
coberto por um corpus de CI com **tolerância zero a falso positivo**.

## O que a análise devolve

```ts
interface Analysis {
  hits: Hit[]              // cada detecção individual
  vulgaridade: 0 | 1 | 2 | 3   // eixo 1 — máximo entre hits confirmados, nunca soma
  alvo: Alvo | null            // eixo 2 — ataque de maior severidade, ou null
  excedeuLimites?: boolean     // presente só quando você passa `limites`
}

interface Hit {
  id: string               // termo do léxico ("merda", "vai-tomar-no-cu"...)
  forma: string            // forma normalizada que casou
  span: [number, number]   // posição no texto ORIGINAL (mesmo com evasão)
  trecho: string           // o texto original coberto ("M3RD@")
  confianca: 'alta' | 'ambigua'  // ambígua = duplo sentido sem resolver
  vulgaridade: 0 | 1 | 2 | 3
  alvo: Alvo | null        // { tipo, severidade } quando o termo ataca alguém
}
```

Regra de ouro: **hits `ambigua` não pontuam nos eixos**. Na dúvida, a lib não acusa —
ela marca a dúvida e deixa você decidir (ignorar, revisar, ou resolver com IA).

## Os dois eixos e a régua do app (`limites`)

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

**`limites` é a régua do SEU app** — o teto tolerado em cada eixo (inclusive). Passou de
qualquer um, `excedeuLimites: true`:

```ts
const APP_INFANTIL = { vulgaridadeMax: 0, alvoSeveridadeMax: 0 } // nada passa
const REDE_SOCIAL  = { vulgaridadeMax: 2, alvoSeveridadeMax: 1 } // "que merda" ok; "que porra" e "seu arrombado" não
const JOGO_ADULTO  = { vulgaridadeMax: 3, alvoSeveridadeMax: 1 } // palavrão livre; assédio bloqueado

analisar('que porra de trânsito', { limites: JOGO_ADULTO })  // excedeuLimites: false
analisar('que porra de trânsito', { limites: REDE_SOCIAL })  // excedeuLimites: true  (vulgaridade 3 > 2)
analisar('seu imbecil',           { limites: APP_INFANTIL }) // excedeuLimites: true  (alvo 1 > 0)
analisar('seu imbecil',           { limites: JOGO_ADULTO })  // excedeuLimites: false
```

Sem `limites`, a lib só devolve as medições e seu código decide como quiser.

## Palavras de duplo sentido e o resolver

`pinto` é filhote de galinha e sobrenome. `rola` é verbo. `Cu` é cobre. `macaco` é animal.
Esses termos têm `requer_contexto: true` no léxico: **sem resolver, saem `ambigua` e não
pontuam** — "O pinto amarelo fugiu" e "Pedro Pinto assinou o contrato" nunca são
bloqueados por engano.

Para resolver a ambiguidade de verdade, plugue um resolver. A lib traz um **por regra**
(determinístico, sem IA) pronto:

```ts
import { analisarComResolver } from 'profanity-br'
import { ResolvedorPorRegra } from 'profanity-br/resolvers/regra'

const config = { resolver: new ResolvedorPorRegra() }

await analisarComResolver('a porta foi arrombada', config)      // ✓ limpo (uso literal)
await analisarComResolver('Pedro Pinto assinou', config)        // ✓ limpo (nome próprio)
await analisarComResolver('o vídeo rola bem', config)           // ✓ limpo (verbo)
await analisarComResolver('seu arrombado', config)              // ✖ confirmado, insulto 2/3
await analisarComResolver('seu macaco', config)                 // ✖ confirmado, raça 3/3
```

## Plugando a SUA IA

Para os casos que regra nenhuma alcança (ironia, insulto indireto), implemente a
interface com o modelo que quiser. A lib entrega para o seu resolver **um pedido por hit
ambíguo**:

```jsonc
{
  "id": "pinto",              // termo do léxico
  "forma": "pinto",           // forma normalizada que casou
  "trecho": "pinto",          // texto original coberto pelo span
  "span": [10, 15],           // posição no texto original
  "texto": "chupa meu pinto"  // frase completa, para a IA ver o entorno
}
```

Sua IA devolve `'ofensivo'` (promove e pontua), `'inofensivo'` (descarta) ou
`'incerto'` (continua ambíguo):

```ts
import { analisarComResolver, type ResolvedorDeContexto } from 'profanity-br'

const minhaIA: ResolvedorDeContexto = {
  async resolver(pedido) {
    // chame o modelo que quiser — exemplo completo com Claude em exemplos/resolver-llm.ts
    return 'incerto'
  },
}
const analise = await analisarComResolver(texto, { resolver: minhaIA })
```

Custo e resiliência por construção: a IA **só é consultada para hits ambíguos** (palavrão
inequívoco nunca gasta token), e se o resolver lançar erro o hit degrada para `ambigua` —
a moderação continua funcionando no modo determinístico. Exemplo completo com a API da
Claude (saída estruturada, refusal, erro de rede): [exemplos/resolver-llm.ts](exemplos/resolver-llm.ts).

## Streaming

Para moderar texto que chega em pedaços (saída de LLM token a token, chat em tempo real):

```ts
import { AnalisadorStream } from 'profanity-br'

const stream = new AnalisadorStream({ limites: { vulgaridadeMax: 2 } })
stream.escrever('vai tomar')   // devolve hits finalizados até aqui
stream.escrever(' no cu')
const final = stream.flush()   // análise agregada do stream inteiro
final.hits[0].id               // 'vai-tomar-no-cu' — detectado mesmo cortado entre chunks
```

O buffer segura uma cauda de `maxTermLen × 3` chars antes de emitir (um termo pode estar
cortado entre chunks); `flush()` processa o resto. O corte nunca acontece no meio de uma
palavra — cortar ali fabricaria fronteira falsa e um falso positivo.

## Todas as opções

```ts
analisar(texto, {
  locale: 'pt-BR',            // ou 'pt-PT' — "bicha" é fila em Portugal, "puto" é garoto
  limites: { ... },           // a régua do app (seção acima)
  allowlistExtra: ['porra louca'],  // supressões do chamador (banda, nome de produto, usuários)
})

analisarComResolver(texto, {
  ...tudoAcima,
  resolver: minhaIA,          // só esta função consulta o resolver
})
```

## Como funciona por dentro

```
texto → 01 Normalizador → 02 Matcher → 03 Supressor → 04 Resolver (opcional) → 05 Scorer
```

1. **Normalizador** — NFKC → invisíveis → homóglifos → caixa → acentos → de-leet →
   repetições 3+ → separadores. Emite um mapa de offsets: todo span reportado aponta para
   o texto **original**, não o normalizado. Armadilhas PT-BR tratadas: runs só colapsam
   com 3+ (`carro` ≠ `caro`), de-leet exige letra vizinha (`curso 3` fica intacto).
2. **Matcher** — Aho-Corasick: todas as formas num único autômato, uma passada, O(n).
3. **Supressor** — fronteira `\p{L}` (nunca `\b` ASCII — `curso` não dispara `cu`),
   filtro regional por locale, allowlist por contenção de span (`pica-pau` salva `pica`),
   longest match wins (`filho da puta` engole `puta`).
4. **Resolver** — interface opcional; só vê hits com `requer_contexto`. Default null →
   `confianca: 'ambigua'`.
5. **Scorer** — agrega por **máximo**, nunca soma; dois eixos independentes.

**Léxico como dado, não código:** os termos vivem em [data/](data) (YAML) com semver
próprio — gíria nova entra sem release do core. O build (`npm run build:lexico`) valida,
normaliza e gera variantes de evasão automaticamente.

**Corpus com assimetria deliberada** (roda no CI):

| Arquivo | Gate |
|---|---|
| [corpus/falsos-positivos.yaml](corpus/falsos-positivos.yaml) | **zero** — falso positivo quebra o build |
| [corpus/evasoes.yaml](corpus/evasoes.yaml) | threshold 0.9 — evasão é infinita, perfeição não |
| [corpus/regionais.yaml](corpus/regionais.yaml) | pt-BR vs pt-PT |

Falso positivo quebra o build porque confiança não se recupera; falso negativo é
threshold porque evasão é um jogo sem fim.

## Desenvolvimento e contribuição

```bash
git clone https://github.com/Vhs4/profanity-br && cd profanity-br
npm install
npm test           # 54 testes: unitários + corpus
npm run repl       # REPL interativo: digite frases, teste :limites 2 1, :resolver on
npm run analisar -- "sua frase" --json --limites=2,1
```

**Faltou uma palavra?** O caminho é curto:

1. Adicione o termo em [data/termos/](data/termos) — com `requer_contexto: true` se a
   palavra tiver uso inocente comum (animal, sigla, nome, anatomia);
2. Se houver uso legítimo, proteja-o com uma frase em
   [corpus/falsos-positivos.yaml](corpus/falsos-positivos.yaml);
3. `npm test` — o corpus garante que você não quebrou nada;
4. Abra o PR. O CI roda os mesmos gates.

## Licença

[MIT](LICENSE) © Victor Hugo Campos

[LinkedIn](https://linkedin.com/in/vhs4)
