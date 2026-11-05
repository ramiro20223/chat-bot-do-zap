import test from 'node:test';
import assert from 'node:assert/strict';
import { isOpenNow, describeHours, DEFAULT_HOURS } from '../lib/hours.js';
import { tokenize, buildSearchText, toChatMessages, brl } from '../lib/text.js';
import { BUSINESS_TYPES, questionsFor, missingRequired, labelsFor } from '../lib/templates.js';
import { buildSystemPrompt } from '../lib/prompt.js';

// 2026-10-28 é uma quarta-feira. 15:00Z = 12:00 em São Paulo (UTC-3).
const wed = (h, m = 0) => new Date(Date.UTC(2026, 9, 28, h + 3, m));

test('isOpenNow: dentro e fora do horário', () => {
  const hours = { ...DEFAULT_HOURS, wed: { closed: false, open: '09:00', close: '18:00' } };
  assert.equal(isOpenNow(hours, wed(12)), true);
  assert.equal(isOpenNow(hours, wed(8, 59)), false);
  assert.equal(isOpenNow(hours, wed(18, 0)), false);
});

test('isOpenNow: dia fechado e sem horários', () => {
  const hours = { ...DEFAULT_HOURS, wed: { closed: true } };
  assert.equal(isOpenNow(hours, wed(12)), false);
  assert.equal(isOpenNow(null, wed(12)), null);
});

test('isOpenNow: vira a madrugada (18:00–02:00)', () => {
  const hours = { ...DEFAULT_HOURS, tue: { closed: false, open: '18:00', close: '02:00' }, wed: { closed: true } };
  assert.equal(isOpenNow(hours, wed(1)), true);   // quarta 01:00, ainda vale o turno de terça
  assert.equal(isOpenNow(hours, wed(3)), false);
});

test('describeHours', () => {
  const t = describeHours({ ...DEFAULT_HOURS });
  assert.match(t, /Segunda: 09:00 às 18:00/);
  assert.match(t, /Domingo: Fechado/);
});

test('tokenize remove acentos e palavras vazias', () => {
  assert.deepEqual(tokenize('Preciso de um remédio para dor de cabeça'), ['remedio', 'medicamento', 'dor', 'cabeca']);
  assert.deepEqual(tokenize('dor dor DOR'), ['dor']);
});

test('buildSearchText junta campos sem acento', () => {
  const s = buildSearchText({ name: 'Dipirona 500mg', indications: 'Dor de cabeça e febre' });
  assert.match(s, /dipirona 500mg dor de cabeca e febre/);
});

test('toChatMessages alterna papéis e começa em user', () => {
  const msgs = toChatMessages([
    { direction: 'out', body: 'Olá!' }, { direction: 'in', body: 'oi' }, { direction: 'in', body: 'tem dipirona?' },
    { direction: 'out', body: 'Tem sim' },
  ], 'quanto custa?');
  assert.deepEqual(msgs.map((m) => m.role), ['user', 'assistant', 'user']);
  assert.equal(msgs[0].content, 'oi\ntem dipirona?');
  assert.equal(msgs.at(-1).content, 'quanto custa?');
});

test('brl formata e trata vazio', () => {
  assert.equal(brl(null), null);
  assert.match(brl(12.9), /R\$\s?12,90/);
});

test('templates: chaves únicas e ao menos uma obrigatória por tipo', () => {
  for (const t of BUSINESS_TYPES) {
    const qs = questionsFor(t.key);
    const keys = qs.map((q) => q.key);
    assert.equal(new Set(keys).size, keys.length, `chaves duplicadas em ${t.key}`);
    assert.ok(qs.some((q) => q.required), t.key);
    assert.ok(qs.some((q) => q.type === 'hours'), t.key);
    assert.ok(labelsFor(t.key).name, t.key);
    for (const q of qs) if (q.type === 'select' || q.type === 'multi') assert.ok(q.options?.length, `${t.key}.${q.key}`);
  }
  assert.ok(missingRequired('farmacia', {}).includes('prescription'));
  assert.deepEqual(missingRequired('farmacia', { about: 'x' }).includes('about'), false);
});

test('prompt: inclui dados, status aberto e regras de farmácia', () => {
  const b = { name: 'Farmácia Boa Saúde', type: 'farmacia', answers: { about: 'Farmácia de bairro', hours: { ...DEFAULT_HOURS }, rules: 'Nunca dê desconto' } };
  const p = buildSystemPrompt(b, wed(12), 'America/Sao_Paulo');
  assert.match(p, /Farmácia Boa Saúde/);
  assert.match(p, /ABERTO agora/);
  assert.match(p, /REGRAS DE FARMÁCIA/);
  assert.match(p, /Nunca dê desconto/);
  assert.match(p, /buscar_produtos/);
  const closed = buildSystemPrompt(b, wed(22), 'America/Sao_Paulo');
  assert.match(closed, /FECHADO agora/);
  const loja = buildSystemPrompt({ ...b, type: 'loja' }, wed(12));
  assert.doesNotMatch(loja, /REGRAS DE FARMÁCIA/);
});

import { parsePrice, cleanProduct, parseBulk } from '../lib/product.js';

test('parsePrice: formatos brasileiros', () => {
  assert.equal(parsePrice('12,90'), 12.9);
  assert.equal(parsePrice('1.299,90'), 1299.9);
  assert.equal(parsePrice('R$ 8,5'), 8.5);
  assert.equal(parsePrice('12.90'), 12.9);
  assert.equal(parsePrice(''), null);
  assert.ok(Number.isNaN(parsePrice('abc')));
});

test('cleanProduct valida nome e preço e gera search_text', () => {
  assert.match(cleanProduct({ name: ' ' }).error, /nome/);
  assert.match(cleanProduct({ name: 'X', price: 'abc' }).error, /Preço/);
  assert.match(cleanProduct({ name: 'X', price: '-1' }).error, /Preço/);
  const r = cleanProduct({ name: 'Dipirona', indications: 'Dor de cabeça', price: '8,90', in_stock: false });
  assert.equal(r.value.price, 8.9);
  assert.equal(r.value.in_stock, false);
  assert.match(r.value.search_text, /dor de cabeca/);
});

test('parseBulk importa linhas e relata erros', () => {
  const { items, errors } = parseBulk('nome;categoria;preço\nDipirona;Analgésicos;8,90;;Dor de cabeça;\n;sem nome;1\nVitamina C;;19,9');
  assert.equal(items.length, 2);
  assert.equal(items[0].category, 'Analgésicos');
  assert.equal(errors.length, 1);
  assert.match(errors[0], /Linha 3/);
});

import { stem, editDistance, fuzzyScore } from '../lib/text.js';

test('stem: plurais comuns', () => {
  for (const [a, b] of [['calhas', 'calha'], ['dores', 'dor'], ['paes', 'pao'], ['limoes', 'limao'], ['animais', 'animal'],
    ['papeis', 'papel'], ['remedios', 'remedio'], ['gas', 'gas'], ['pizza', 'pizza'], ['classe', 'classe']]) assert.equal(stem(a), b, a);
});

test('tokenize: plural vira singular e sinônimos entram', () => {
  assert.deepEqual(tokenize('vocês limpam calhas?'), ['limpam', 'calha']);
  assert.ok(tokenize('quero consertar celular').includes('reparo'));
  assert.ok(tokenize('tenho enxaqueca').includes('cabeca'));
  assert.ok(tokenize('troca de display').includes('tela'));
});

test('editDistance e fuzzyScore: tolera erros de digitação', () => {
  assert.equal(editDistance('dipirona', 'dipirna', 2), 1);
  assert.equal(editDistance('abc', 'xyz', 1), 2);
  assert.ok(fuzzyScore(['dipirna'], 'dipirona 500mg analgesicos dor de cabeca') >= 1);
  assert.ok(fuzzyScore(['calhs'], 'limpeza de calhas residencial') >= 1);
  assert.equal(fuzzyScore(['xyzabc'], 'dipirona 500mg'), 0);
  assert.equal(fuzzyScore(['dor'], 'dar'), 0); // termos curtos não entram no fuzzy
});
