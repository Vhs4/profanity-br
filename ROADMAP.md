# Roadmap — Composabilidade

O plano para tornar a profanity-br plugável e componível sem abrir mão das
garantias que a definem. Toda extensão passa pelo mesmo filtro:

> **Regra de ouro:** nenhum ponto de extensão pode quebrar as quatro garantias
> do core — matching O(n) numa passada, spans apontando para o texto original,
> determinismo (mesma entrada, mesmo resultado) e o gate zero de falso
> positivo no corpus. Extensão que exigiria abrir mão de uma delas não entra.

## Princípio de design

A obscenity é um toolkit de primitivas; a profanity-br é um pipeline opinado.
O plano NÃO é virar toolkit — é abrir **seis pontos de extensão cirúrgicos**
nas bordas do pipeline, mantendo os estágios internos (supressor, scorer)
fechados, porque é neles que as garantias moram.

```
                    ┌ 3. transformadores ┐        ┌ 5. resolvers ┐
texto → Normalizador ────────────────────→ Matcher → Supressor → Resolver → Scorer → Analysis
         ▲ 1. instâncias com léxico próprio + 2. termos extras            ▼
         └ 4. padrões com opcionais (expandidos no build)          6. censura (pós-pipeline)
```

## Fase 1 — Fundação de instâncias (v0.2.0)

### 1.1 `criarAnalisador()` — o motor vira instância

Hoje o motor é um singleton do módulo. A fundação de toda composabilidade é
poder construir instâncias com configurações diferentes (multi-tenant, testes,
léxicos por comunidade):

```ts
import { criarAnalisador } from 'profanity-br'

const analisador = criarAnalisador({
  termosExtras: [
    { id: 'giria-do-meu-jogo', formas: ['exemplo'], vulgaridade: 2 },
  ],
  allowlistExtra: ['nome do meu produto'],
})

analisador.analisar(texto, config?)
analisador.analisarComResolver(texto, config?)
analisador.criarStream(config?)
```

- As funções de módulo (`analisar`, etc.) continuam existindo como a instância
  default — **zero breaking change**.
- `termosExtras` passa pela MESMA validação e geração de variantes do build
  (a função `gerarVariantesDeForma` vira código compartilhado).
- Autômato é imutável pós-construção: "mudar o léxico" = criar outra instância
  (barato: ~1,5 ms). Sem mutação em runtime, sem race conditions.

### 1.2 Censura componível (módulo novo, pós-pipeline)

Hoje a lib reporta spans e o chamador censura. Formalizar isso como módulo com
estratégias plugáveis — função pura sobre os hits, zero acoplamento com o core:

```ts
import { censurar, estrategias } from 'profanity-br'

censurar(texto, analise.hits, estrategias.asteriscos())        // "que ***** é essa"
censurar(texto, analise.hits, estrategias.grawlix())           // "que @#$%! é essa"
censurar(texto, analise.hits, estrategias.manterPontas())      // "que m***a é essa"
censurar(texto, analise.hits, estrategias.substituir('[removido]'))
censurar(texto, analise.hits, hit => '?'.repeat(hit.trecho.length)) // custom
```

- Censura só hits `confianca: 'alta'` por padrão; `{ incluirAmbiguos: true }`
  opta pelo resto.
- Usa os spans do original — funciona com evasão ("M3RD@" vira "*****").

### 1.3 Metadata por termo

```yaml
- id: exemplo
  formas: [exemplo]
  vulgaridade: 2
  metadata: { origem: comunidade, referencia: 'issue #12' }
```

Passa intacto do YAML até `hit.metadata`. É o equivalente do metadata genérico
da obscenity, sem custo no pipeline.

## Fase 2 — Extensão do matching (v0.3.0)

### 2.1 Transformadores plugáveis no normalizador

O usuário pluga transformação de caractere no pipeline de normalização, no
modelo da obscenity (por code point), mas com a restrição que preserva nossa
garantia de proveniência:

```ts
interface TransformadorDeChar {
  /** 1 code point entra → 1 sai (ou null para descartar). NUNCA expande —
   *  é o que mantém o mapa de offsets e o span no original corretos. */
  transformar(cp: number): number | null
  reiniciar?(): void // estado entre chars (ex.: contexto do anterior)
}

criarAnalisador({
  transformadores: [meuMapaDeGiriaRegional],  // roda após homóglifos, antes do de-leet
})
```

- Contrato testável: o fuzz de invariantes (spans válidos, trecho === slice)
  roda sobre qualquer instância com transformadores — se o plugin quebra a
  proveniência, o teste de contrato acusa.

### 2.2 Padrões com opcionais no léxico (expansão no build)

Expressividade da DSL da obscenity, custo zero no runtime — opcionais expandem
para variantes ANTES do autômato existir:

```yaml
- id: exemplo
  formas: ["ex[e]mplo"]   # vira "exemplo" + "exmplo" no build
```

- Cap de 64 variantes por forma; passar disso é erro de build, não lentidão
  silenciosa em produção.
- Wildcards NÃO entram: wildcard genérico não é expressável em Aho-Corasick
  sem custo, e é a porta de entrada dos falsos positivos da obscenity
  (`dick*` casando "dickens"). Regra de ouro aplicada.

### 2.3 Combinadores de resolver

O resolver já é a interface de plugin do estágio 04. Faltam os combinadores
que tornam composição trivial:

```ts
import { emCascata, comCache, comLimiteDeTempo } from 'profanity-br/resolvers'

const resolver = emCascata(               // tenta na ordem; primeiro não-incerto vence
  new ResolvedorPorRegra(),               // grátis, resolve a maioria
  comCache(                               // LRU por (id, trecho)
    comLimiteDeTempo(new ResolvedorLLM(), 800),  // timeout → 'incerto'
  ),
)
```

Cada combinador é ~15 linhas, testável isolado, e codifica o padrão de uso
real: regra primeiro, IA só no que sobrar, com custo e latência limitados.

## Fase 3 — Ecossistema de léxicos (v0.4.0)

- **Léxicos como pacotes independentes**: `criarAnalisador({ lexico })` aceita
  um léxico compilado completo, permitindo `profanity-br-lexico-gamer`,
  `profanity-br-lexico-pt-pt` etc. mantidos pela comunidade, com o core
  intocado.
- **`compilarLexico()` exportado**: o build YAML→JSON vira API pública para
  esses pacotes usarem, com as mesmas validações e geração de variantes.
- **Guia de publicação** de léxico comunitário no repositório, incluindo o
  requisito de corpus de falsos positivos próprio (o gate viaja junto).

## O que fica deliberadamente FECHADO

| Não vai ter | Porquê |
|---|---|
| Hooks dentro do supressor/scorer | É onde as garantias de FP e dos eixos moram |
| Mutação do autômato em runtime | Determinismo e thread-safety; instância nova é barata |
| Wildcards genéricos em formas | Incompatível com O(n) e é fábrica de FP |
| Transformador que expande chars | Quebraria o mapa de offsets (span no original) |

## Sequência e critérios de aceite

| Versão | Entrega | Aceite |
|---|---|---|
| v0.2.0 | instâncias, termosExtras, censura, metadata | corpus 100%, bench ±10% do atual, docs no README |
| v0.3.0 | transformadores, opcionais no build, combinadores | fuzz de contrato para plugins, corpus 100% |
| v0.4.0 | léxicos independentes, compilarLexico público | 1 pacote de exemplo publicado, guia no repo |

Cada fase é aditiva (semver minor) — nenhum código existente de usuário quebra.
