import { z } from 'zod';
import type { OtpSender } from '../../domain/contracts';
import { IntegrationError, requestJson, type Fetcher } from './http';

export interface MetaConfig { version: string; phoneNumberId: string; accessToken: string; template: string; language: string }
export class MetaOtpSender implements OtpSender {
  constructor(private config: MetaConfig, private fetcher: Fetcher = fetch) {
    if (!/^v\d+\.\d+$/.test(config.version) || !/^\d+$/.test(config.phoneNumberId) || !config.accessToken || !/^[a-z0-9_]+$/.test(config.template) || !/^[a-z]{2}(?:_[A-Z]{2})?$/.test(config.language)) throw new IntegrationError('configuration');
  }
  async send(to: string, code: string): Promise<{ messageId: string }> {
    if (!/^\+[1-9]\d{7,14}$/.test(to) || !/^\d{6}$/.test(code)) throw new IntegrationError('configuration');
    const result = await requestJson(this.fetcher, `https://graph.facebook.com/${this.config.version}/${this.config.phoneNumberId}/messages`, {
      method: 'POST', headers: { Authorization: `Bearer ${this.config.accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to: to.slice(1), type: 'template', template: {
        name: this.config.template, language: { code: this.config.language }, components: [
          { type: 'body', parameters: [{ type: 'text', text: code }] },
          { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: code }] },
        ],
      } }),
    });
    // Acceptance is not delivery; a future signed webhook must record delivery separately.
    if (result.status !== 200) throw new IntegrationError('unavailable');
    const parsed=z.object({ messages: z.array(z.object({ id: z.string().min(1).max(512) })).length(1) }).safeParse(result.body);
    if (!parsed.success) throw new IntegrationError('invalid_response');
    return {messageId:parsed.data.messages[0].id};
  }
}
