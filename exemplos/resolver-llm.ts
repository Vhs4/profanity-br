/**
 * EXEMPLO de resolver de contexto com IA (Claude) — o que o usuário final da
 * lib implementa no projeto dele. NÃO é dependência do core: a lib só define a
 * interface ResolvedorDeContexto; este arquivo mostra como preenchê-la.
 *
 * O que a lib entrega para a IA (PedidoDeContexto), UM por hit ambíguo:
 *   {
 *     "id":     "pinto",              // termo do léxico que casou
 *     "forma":  "pinto",              // forma normalizada que casou
 *     "trecho": "pinto",              // texto original coberto pelo span
 *     "span":   [10, 15],             // posição no texto original
 *     "texto":  "chupa meu pinto"     // frase completa, para a IA ver o entorno
 *   }
 *
 * O que a IA devolve: 'ofensivo' | 'inofensivo' | 'incerto'.
 *   ofensivo   → hit promovido para confianca 'alta' e passa a pontuar
 *   inofensivo → hit descartado
 *   incerto    → hit continua 'ambigua' (o default determinístico prevalece)
 *
 * Uso:
 *   export ANTHROPIC_API_KEY=...   # ou `ant auth login`
 *   const analise = await analisarComResolver(texto, { resolver: new ResolvedorLLM() })
 */
import Anthropic from '@anthropic-ai/sdk'
import type {
  PedidoDeContexto,
  ResolvedorDeContexto,
  VeredictoDeContexto,
} from '../src/tipos.js' // no projeto do usuário: from 'profanity-br'

const INSTRUCAO = `Você é um classificador de contexto para moderação de texto em português.
Você recebe um JSON com um termo potencialmente ofensivo ("trecho"), sua posição ("span") e a frase completa ("texto").
O termo tem duplo sentido: pode ser ofensa/vulgaridade dirigida OU uso legítimo (animal, anatomia, sigla, verbo, objeto).
Classifique APENAS o uso desta ocorrência na frase dada:
- "ofensivo": usado como xingamento, conotação sexual dirigida ou ataque a pessoa
- "inofensivo": uso claramente legítimo (ex.: "o pinto fugiu do galinheiro", "a porta foi arrombada")
- "incerto": não dá para afirmar com segurança`

const FORMATO = {
  type: 'json_schema' as const,
  schema: {
    type: 'object',
    properties: {
      veredicto: { type: 'string', enum: ['ofensivo', 'inofensivo', 'incerto'] },
      justificativa: { type: 'string' },
    },
    required: ['veredicto', 'justificativa'],
    additionalProperties: false,
  },
}

export class ResolvedorLLM implements ResolvedorDeContexto {
  private client = new Anthropic()

  async resolver(pedido: PedidoDeContexto): Promise<VeredictoDeContexto> {
    try {
      const resposta = await this.client.messages.create({
        model: 'claude-opus-5',
        max_tokens: 2048,
        output_config: { effort: 'low', format: FORMATO },
        system: INSTRUCAO,
        messages: [{ role: 'user', content: JSON.stringify(pedido) }],
      })
      if (resposta.stop_reason === 'refusal') return 'incerto'
      const texto = resposta.content.find(b => b.type === 'text')?.text ?? ''
      const { veredicto } = JSON.parse(texto) as { veredicto: VeredictoDeContexto }
      return veredicto
    } catch {
      return 'incerto' // sem rede/token/erro → o núcleo determinístico prevalece
    }
  }
}
