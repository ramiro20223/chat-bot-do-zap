import test from 'node:test';
import assert from 'node:assert/strict';
import { crc16, buildPixPayload, parsePix, normalizePixKey, getPixConfig } from '../lib/pix.js';
import { buildOrder, parseDiscountLimit, parseOwnerCommand, toCents, fmtCents } from '../lib/order-logic.js';
import { evaluateProof, namesOverlap, describeFindings } from '../lib/proof.js';
import { normalizeBR, samePhone, withinReplyWindow } from '../lib/guard.js';

test('crc16: vetor padrão CCITT-FALSE', () => assert.equal(crc16('123456789'), '29B1'));

test('Pix: payload válido, valor fixo, CRC correto e campos normalizados', () => {
  const p = buildPixPayload({ key: '+5511999999999', name: 'José da Açaí & Cia', city: 'São Paulo', amountCents: 1250, txid: 'ZB-12/ab' });
  const x = parsePix(p);
  assert.equal(x.crcOk, true);
  assert.equal(x.get('00'), '01');
  assert.equal(x.get('53'), '986');
  assert.equal(x.get('54'), '12.50');
  assert.equal(x.get('58'), 'BR');
  assert.equal(x.get('59'), 'JOSE DA ACAI  CIA');
  assert.equal(x.get('60'), 'SAO PAULO');
  assert.match(x.get('26'), /br\.gov\.bcb\.pix0114\+5511999999999/);
  assert.equal(parsePix(x.get('62')).get('05'), 'ZB12ab');
  assert.equal(x.fields.at(-1).id, '63');
  assert.equal(p.slice(-8, -4), '6304');
  assert.equal(parsePix(p.slice(0, -1) + (p.endsWith('0') ? '1' : '0')).crcOk, false); // adulterado
});

test('Pix: limites e erros', () => {
  const base = { key: 'a@b.com', name: 'X', city: 'Y', amountCents: 100 };
  assert.throws(() => buildPixPayload({ ...base, amountCents: 0 }));
  assert.throws(() => buildPixPayload({ ...base, amountCents: 10.5 }));
  assert.throws(() => buildPixPayload({ ...base, key: '' }));
  const long = buildPixPayload({ ...base, name: 'N'.repeat(60), city: 'C'.repeat(40), txid: 'T'.repeat(60) });
  const x = parsePix(long);
  assert.equal(x.get('59').length, 25); assert.equal(x.get('60').length, 15); assert.equal(parsePix(x.get('62')).get('05').length, 25);
  assert.equal(parsePix(buildPixPayload({ ...base })).get('62'), '0503***');
});

test('Pix: normalização das chaves', () => {
  assert.equal(normalizePixKey('CPF/CNPJ', '123.456.789-09'), '12345678909');
  assert.equal(normalizePixKey('CPF/CNPJ', '12345'), null);
  assert.equal(normalizePixKey('Celular', '(11) 99999-9999'), '+5511999999999');
  assert.equal(normalizePixKey('Celular', '+55 11 99999-9999'), '+5511999999999');
  assert.equal(normalizePixKey('Celular', '999'), null);
  assert.equal(normalizePixKey('E-mail', ' Loja@Exemplo.com '), 'loja@exemplo.com');
  assert.equal(normalizePixKey('Chave aleatória', '123e4567-e89b-12d3-a456-426614174000'), '123e4567-e89b-12d3-a456-426614174000');
  assert.equal(normalizePixKey('Chave aleatória', 'nao-e-uuid'), null);
  assert.equal(getPixConfig({ pix_key_type: 'Celular', pix_key: '11999999999', pix_name: 'Loja' }).key, '+5511999999999');
  assert.equal(getPixConfig({ pix_key_type: 'Celular', pix_key: '11999999999' }), null);
});

const cat = new Map([
  ['p1', { id: 'p1', name: 'Calha 3m', price: '45.90', in_stock: true, active: true }],
  ['p2', { id: 'p2', name: 'Cola', price: '9.99', in_stock: true, active: true }],
  ['p3', { id: 'p3', name: 'Sem estoque', price: '5', in_stock: false, active: true }],
  ['p4', { id: 'p4', name: 'Sem preço', price: null, in_stock: true, active: true }],
]);

test('buildOrder: soma em centavos e desconto limitado ao máximo do dono', () => {
  const r = buildOrder({ items: [{ produto_id: 'p1', quantidade: 2 }, { produto_id: 'p2', quantidade: 1, observacao: 'embalar' }], catalog: cat, discountPct: 50, maxDiscountPct: 10 });
  assert.equal(r.ok, true);
  assert.equal(r.order.subtotalCents, 4590 * 2 + 999);
  assert.equal(r.order.discountPct, 10);
  assert.equal(r.order.discountClamped, true);
  assert.equal(r.order.subtotalCents, 10179);
  assert.equal(r.order.discountCents, 1018);   // 10% de 101,79 = 10,179 -> arredonda para 10,18
  assert.equal(r.order.totalCents, 9161);
  assert.equal(fmtCents(r.order.totalCents).replace(/\s/g, ' '), 'R$ 91,61');
});

test('buildOrder: sem desconto permitido nunca desconta; erros de item', () => {
  assert.equal(buildOrder({ items: [{ produto_id: 'p2', quantidade: 1 }], catalog: cat, discountPct: 99, maxDiscountPct: 0 }).order.totalCents, 999);
  for (const [item, re] of [[{ produto_id: 'zzz' }, /não encontrado/], [{ produto_id: 'p3' }, /sem estoque/], [{ produto_id: 'p4' }, /sem preço|preço/], [{ produto_id: 'p1', quantidade: 0 }, /Quantidade/], [{ produto_id: 'p1', quantidade: 1.5 }, /Quantidade/], [{ produto_id: 'p1', quantidade: 100 }, /Quantidade/]]) {
    const r = buildOrder({ items: [item], catalog: cat }); assert.equal(r.ok, false); assert.match(r.errors[0], re);
  }
  assert.equal(buildOrder({ items: [], catalog: cat }).ok, false);
});

test('buildOrder: sem erro de ponto flutuante (0,1 + 0,2)', () => {
  const c = new Map([['a', { id: 'a', name: 'A', price: '0.10', in_stock: true, active: true }], ['b', { id: 'b', name: 'B', price: '0.20', in_stock: true, active: true }]]);
  assert.equal(buildOrder({ items: [{ produto_id: 'a' }, { produto_id: 'b' }], catalog: c }).order.totalCents, 30);
  assert.equal(toCents('19.99'), 1999);
});

test('parseDiscountLimit', () => {
  assert.equal(parseDiscountLimit('10%'), 10); assert.equal(parseDiscountLimit('7,5'), 7.5);
  assert.equal(parseDiscountLimit(''), 0); assert.equal(parseDiscountLimit('abc'), 0); assert.equal(parseDiscountLimit('500'), 100);
});

test('parseOwnerCommand', () => {
  assert.deepEqual(parseOwnerCommand('ok 12'), { cmd: 'confirmar', num: 12 });
  assert.deepEqual(parseOwnerCommand('OK #12'), { cmd: 'confirmar', num: 12 });
  assert.deepEqual(parseOwnerCommand('  Confirmar 7 '), { cmd: 'confirmar', num: 7 });
  assert.deepEqual(parseOwnerCommand('recusar 12 valor errado, falta R$ 5'), { cmd: 'recusar', num: 12, reason: 'valor errado, falta R$ 5' });
  assert.deepEqual(parseOwnerCommand('recusar 3'), { cmd: 'recusar', num: 3, reason: null });
  assert.deepEqual(parseOwnerCommand('cancelar 4'), { cmd: 'cancelar', num: 4 });
  assert.deepEqual(parseOwnerCommand('Pedidos'), { cmd: 'pedidos' });
  assert.deepEqual(parseOwnerCommand('ajuda'), { cmd: 'ajuda' });
  assert.equal(parseOwnerCommand('bom dia'), null);
  assert.equal(parseOwnerCommand('ok'), null);
});

const order = { total_cents: 9160, created_at: '2026-11-02T12:00:00Z' };
const biz = { answers: { pix_name: 'Loja do João Silva' } };
const good = { is_receipt: true, amount: 91.6, date: '2026-11-02 09:30', recipient_name: 'JOAO SILVA', status: 'efetivado', looks_edited: false };

test('proof: comprovante consistente', () => {
  const r = evaluateProof({ extracted: good, order, business: biz });
  assert.equal(r.verdict, 'ok'); assert.deepEqual(r.problems, []); assert.deepEqual(r.warnings, []);
});

test('proof: valor diferente, duplicado, agendado, ilegível, não é comprovante', () => {
  assert.deepEqual(evaluateProof({ extracted: { ...good, amount: 91.5 }, order, business: biz }).problems, ['valor_diferente']);
  assert.deepEqual(evaluateProof({ extracted: good, order, business: biz, duplicate: true }).problems, ['duplicado']);
  assert.deepEqual(evaluateProof({ extracted: { ...good, status: 'agendado' }, order, business: biz }).problems, ['nao_efetivado']);
  assert.equal(evaluateProof({ extracted: { ...good, amount: null }, order, business: biz }).verdict, 'ilegivel');
  assert.equal(evaluateProof({ extracted: { is_receipt: false }, order, business: biz }).verdict, 'nao_comprovante');
  assert.equal(evaluateProof({ extracted: null, order, business: biz }).verdict, 'nao_comprovante');
});

test('proof: avisos (favorecido, edição, data antiga) não reprovam, mas aparecem', () => {
  const r = evaluateProof({ extracted: { ...good, recipient_name: 'MARIA OLIVEIRA', looks_edited: true, date: '2026-10-20 10:00' }, order, business: biz });
  assert.equal(r.verdict, 'ok');
  assert.deepEqual(r.warnings.sort(), ['data_anterior_ao_pedido', 'favorecido_diferente', 'possivel_edicao']);
  assert.match(describeFindings(r, order), /editada/);
  assert.equal(namesOverlap('Loja do João Silva', 'JOAO SILVA'), true);
  assert.equal(namesOverlap('Loja do João Silva', 'MARIA'), false);
});

test('guard: telefones BR em formatos diferentes e janela de 24h', () => {
  assert.equal(normalizeBR('+55 (11) 99999-9999'), '1199999999');
  assert.equal(samePhone('11999999999', '5511999999999'), true);
  assert.equal(samePhone('11999999999', '551199999999'), true);   // sem o 9º dígito
  assert.equal(samePhone('11999999999', '5521999999999'), false); // outro DDD
  assert.equal(samePhone('', '5511999999999'), false);
  assert.equal(samePhone('123', '123'), false);                   // número curto demais: nunca é dono
  const now = new Date('2026-11-02T12:00:00Z');
  assert.equal(withinReplyWindow('2026-11-02T00:00:00Z', now), true);
  assert.equal(withinReplyWindow('2026-11-01T11:00:00Z', now), false);
  assert.equal(withinReplyWindow(null, now), false);
});
