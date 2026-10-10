import 'server-only';
import { z } from 'zod';
import { IntegrationError, requestJson, type Fetcher } from './http';
import type { MetaConfig } from './meta';

export class MetaBoletoSender {
  constructor(private config: MetaConfig, private fetcher: Fetcher = fetch) {
    if (!/^v\d+\.\d+$/.test(config.version) || !/^\d+$/.test(config.phoneNumberId) || !config.accessToken || !/^[a-z0-9_]+$/.test(config.template) || !/^[a-z]{2}(?:_[A-Z]{2})?$/.test(config.language)) throw new IntegrationError('configuration');
  }
  async send(to: string, pdf: Buffer, input: { name: string; amount: number; dueDate: string }) {
    if (!/^\+[1-9]\d{7,14}$/.test(to) || !input.name.trim() || input.name.length > 250 || !Number.isFinite(input.amount) || input.amount <= 0 || !/^\d{4}-\d{2}-\d{2}/.test(input.dueDate) || pdf.length > 512 * 1024 || pdf.subarray(0, 5).toString() !== '%PDF-') throw new IntegrationError('configuration');
    const base = `https://graph.facebook.com/${this.config.version}/${this.config.phoneNumberId}`;
    const form = new FormData(); form.set('messaging_product', 'whatsapp'); form.set('type', 'application/pdf'); form.set('file', new Blob([new Uint8Array(pdf)], { type: 'application/pdf' }), 'boleto-leal.pdf');
    const uploaded = await requestJson(this.fetcher, `${base}/media`, { method: 'POST', headers: { Authorization: `Bearer ${this.config.accessToken}` }, body: form });
    const media = z.object({ id: z.string().regex(/^\d+$/) }).safeParse(uploaded.body);
    if (uploaded.status !== 200 || !media.success) throw new IntegrationError('unavailable');
    const result = await requestJson(this.fetcher, `${base}/messages`, { method: 'POST', headers: { Authorization: `Bearer ${this.config.accessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ messaging_product: 'whatsapp', to: to.slice(1), type: 'template', template: {
      name: this.config.template, language: { code: this.config.language }, components: [
        { type: 'header', parameters: [{ type: 'document', document: { id: media.data.id, filename: 'boleto-leal.pdf' } }] },
        { type: 'body', parameters: [input.name.trim(), input.amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }), input.dueDate.slice(0, 10).split('-').reverse().join('/')].map(text => ({ type: 'text', text })) },
      ],
    } }) });
    const parsed = z.object({ messages: z.array(z.object({ id: z.string().min(1).max(512) })).length(1) }).safeParse(result.body);
    if (result.status !== 200 || !parsed.success) throw new IntegrationError('unavailable');
    return { messageId: parsed.data.messages[0].id };
  }
}
