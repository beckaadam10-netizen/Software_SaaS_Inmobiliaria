import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { current } from '../common/current.js';
import { LimitsService } from '../common/limits.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

export interface Completion {
  text: string;
  inputTokens: number;
  outputTokens: number;
}

/**
 * Puerta única hacia la inteligencia artificial. El resto del sistema no sabe qué proveedor hay detrás:
 * para cambiarlo basta con agregar otro caso en `complete`. Sin clave configurada devuelve null
 * y cada función usa su respaldo propio (plantillas o reglas).
 */
@Injectable()
export class AiService {
  private readonly logger = new Logger('AI');
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly limits: LimitsService,
  ) {}

  get provider(): string | null {
    const name = this.config.get<string>('AI_PROVIDER', 'anthropic');
    if (name === 'anthropic' && this.config.get<string>('ANTHROPIC_API_KEY')) return 'anthropic';
    return null;
  }

  /** Estado para la pantalla: qué incluye el plan y cuánto se usó este mes. */
  async status() {
    const { plan, ai } = await this.limits.usage();
    const advanced = plan.features.includes('ai_advanced');
    return { content: advanced || plan.features.includes('ai_basic'), assistant: advanced, provider: this.provider, used: ai.used, limit: ai.limit, plan: plan.name };
  }

  /** 403 si el plan no incluye la función o si ya se consumió el cupo del mes. */
  async assertAllowed(feature: 'content' | 'assistant') {
    const st = await this.status();
    if (!st[feature]) {
      throw new ForbiddenException(`${feature === 'content' ? 'El generador de contenido' : 'El asistente'} no está incluido en tu plan ${st.plan}. Actualiza tu plan para usarlo.`);
    }
    if (st.limit != null && st.used >= st.limit) {
      throw new ForbiddenException(`Tu empresa ya usó las ${st.limit} solicitudes de IA de este mes. El cupo se renueva el día 1.`);
    }
  }

  async record(feature: string, provider: string, usage?: { inputTokens: number; outputTokens: number }) {
    const me = current();
    await this.prisma.db.aiUsage.create({
      data: { tenantId: me.tenantId, userId: me.userId, feature, provider, inputTokens: usage?.inputTokens ?? 0, outputTokens: usage?.outputTokens ?? 0 },
    });
  }

  /** Pide un texto al proveedor. Devuelve null si no hay proveedor o si falla: quien llama usa su respaldo. */
  async complete(system: string, prompt: string, maxTokens = 600): Promise<Completion | null> {
    if (this.provider !== 'anthropic') return null;
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': this.config.get<string>('ANTHROPIC_API_KEY')!, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: this.config.get<string>('AI_MODEL', 'claude-haiku-4-5-20251001'), max_tokens: maxTokens, system, messages: [{ role: 'user', content: prompt }] }),
        signal: AbortSignal.timeout(20000),
      });
      if (!res.ok) {
        this.logger.warn(`El proveedor de IA respondió ${res.status}`);
        return null;
      }
      const data = (await res.json()) as { content?: Array<{ type: string; text?: string }>; usage?: { input_tokens?: number; output_tokens?: number } };
      const text = (data.content ?? []).filter((c) => c.type === 'text').map((c) => c.text ?? '').join('').trim();
      if (!text) return null;
      return { text, inputTokens: data.usage?.input_tokens ?? 0, outputTokens: data.usage?.output_tokens ?? 0 };
    } catch (e) {
      this.logger.warn(`No se pudo consultar al proveedor de IA: ${e}`);
      return null;
    }
  }
}
