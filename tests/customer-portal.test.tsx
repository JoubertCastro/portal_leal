import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PortfolioContent, type Portfolio } from '../src/components/customer-portal';
const data: Portfolio = { debts: [{ id: '1', creditor: 'Banco teste', product: 'Cartão', contractEnding: '1234', sourceStatus: 'PARALISADO', dueDate: '2025-01-01', balanceCents: 0 }], agreements: [{ id: '1:2', creditor: 'Credor teste', product: 'Produto', contractEnding: '4567', agreedAt: '2026-01-01', totalInstallments: 3, installments: [{ number: 1, dueDate: '2026-01-10', amountCents: 10000, paidAt: '2026-01-09' }, { number: 2, dueDate: '2026-02-10', amountCents: 15000, paidAt: null }] }] };
test('overview uses earliest unpaid returned installment and excludes paid amounts', () => { const html = renderToStaticMarkup(createElement(PortfolioContent, { data, tab: 'inicio' })); assert.match(html, /10\/02\/2026/); assert.doesNotMatch(html, /10\/01\/2026/); assert.match(html, /1 parcelas sem pagamento informado/); });
test('agreements preserve payment dates and explicitly disclose incomplete schedules', () => { const html = renderToStaticMarkup(createElement(PortfolioContent, { data, tab: 'acordos' })); assert.match(html, /Pago em 09\/01\/2026/); assert.match(html, /retornou 2 de 3 parcelas/); assert.match(html, /Sem pagamento informado/); });
test('zero balance does not claim settlement; empty portfolio has no fabricated next payment', () => { assert.match(renderToStaticMarkup(createElement(PortfolioContent, { data, tab: 'pendencias' })), /não confirma a quitação/); const html = renderToStaticMarkup(createElement(PortfolioContent, { data: { debts: [], agreements: [] }, tab: 'inicio' })); assert.match(html, /Nenhuma parcela/); assert.doesNotMatch(html, /payment-value/); });

import {creditorLogo} from '../src/components/creditor-identity';
test('creditor branding recognizes supported names and leaves unrelated creditors unbranded',()=>{
 for(const [name,file] of [['BANCO PAN','banco-pan'],['BANCO BTG PACTUAL','btg-pactual'],['CARREFOUR','carrefour'],['TW.CAPITAL','tw-capital'],['SERASA','serasa']])assert.equal(creditorLogo(name),`/assets/${file}.png`);
 assert.equal(creditorLogo('Outra empresa'),undefined);
});
