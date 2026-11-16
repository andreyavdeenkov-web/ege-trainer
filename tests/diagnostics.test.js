'use strict';

/**
 * Диагностика (этап 1): наблюдения, коды, статусы, «Что стоит повторить», маршрут.
 * Наборы ответов A, B, C и граничные случаи — из согласованной спецификации;
 * все выводы считаются из ответов, ключей и разметки.
 */
const test = require('node:test');
const assert = require('node:assert');
const { loadDiagnostics } = require('./helpers/ege.js');

const EGE = loadDiagnostics();
const D = EGE.diagnostics;
const S = EGE.scoring;

const same = (a, b, msg) => assert.strictEqual(JSON.stringify(a), JSON.stringify(b), msg);
const plain = (x) => JSON.parse(JSON.stringify(x));

/** Ответы на все задания практикума по ключу, кроме перечисленных. */
function answers(practicumId, overrides) {
  const out = {};
  EGE.getPracticum(practicumId).taskIds.forEach((id) => { out[id] = plain(S.getCorrect(EGE.getTask(id))); });
  return Object.assign(out, overrides || {});
}
const session = (practicumId, overrides) => ({ practicumId, answers: answers(practicumId, overrides) });

/** Баллы по действующим правилам оценивания (js/scoring.js). */
function score(s) {
  return EGE.getPracticum(s.practicumId).taskIds.reduce((sum, id) => sum + S.scoreTask(EGE.getTask(id), s.answers[id]), 0);
}
function byStatus(report) {
  const out = {};
  report.statuses.forEach((s) => { (out[s.status] = out[s.status] || []).push(s.element); });
  Object.keys(out).forEach((k) => out[k].sort());
  return out;
}
const statusOf = (report, element) => report.statuses.find((s) => s.element === element);
const repeat = (report) => report.repeat.map((it) => [it.key, it.tasks, it.drills.map((d) => d.taskId)]);

const P1_OK = session('OBS-TYP-P01');
const A_FINAL = session('OBS-TYP-F01', {
  'OBS-TYP-006': [3, 5],          // ключ 36
  'OBS-TYP-011': [3, 1, 3, 3, 1], // ключ 31231
  'OBS-TYP-020': [1]              // ключ 14
});
const B = session('OBS-TYP-P01', {
  'OBS-TYP-026': [3, 4], 'OBS-TYP-028': [2, 3, 4, 5], 'OBS-TYP-032': [1, 2, 3, 6], 'OBS-TYP-035': [3, 4, 5, 6],
  'OBS-TYP-036': [1, 2, 3, 6], 'OBS-TYP-038': [1, 2, 3, 1, 2], 'OBS-TYP-039': [3, 2, 1, 1, 2], 'OBS-TYP-040': [1, 1, 3, 3, 3]
});
const C = session('OBS-TYP-P02', {
  'OBS-TYP-041': [3, 4], 'OBS-TYP-042': [1, 2, 3], 'OBS-TYP-043': [1, 4, 5], 'OBS-TYP-044': [1, 2, 3], 'OBS-TYP-045': [1, 3, 5],
  'OBS-TYP-046': [1, 3, 5], 'OBS-TYP-047': [1, 2, 5], 'OBS-TYP-048': [1, 2, 3, 4], 'OBS-TYP-049': [1, 3, 4], 'OBS-TYP-050': [1, 2, 3],
  'OBS-TYP-051': [1, 2, 5], 'OBS-TYP-052': [1, 2, 4], 'OBS-TYP-053': [1, 2, 3, 2, 2], 'OBS-TYP-054': [3, 2, 1, 3, 2], 'OBS-TYP-055': [1, 2, 3, 1, 2]
});

test('баллы примеров считаются по действующим правилам и не зависят от диагностики', () => {
  assert.strictEqual(score(P1_OK), 26);
  assert.strictEqual(score(A_FINAL), 32);
  assert.strictEqual(score(B), 18);
  assert.strictEqual(score(C), 9);
});

test('пример A: сильный результат — Практикум № 1, затем итоговая работа', () => {
  const r = D.buildReport([P1_OK, A_FINAL]);
  same(byStatus(r), {
    stable: ['cell:P.D', 'cell:T.D', 'cell:T.E', 'cell:T.P', 'cell:T.S', 'cell:I.S', 'skill:СИТ', 'skill:ФОРМ'].sort(),
    preliminary: ['cell:I.E', 'cell:I.N', 'cell:I.P', 'cell:P.E', 'cell:P.S', 'norm:I', 'norm:P', 'skill:УНИВ'].sort(),
    'not-tested': ['cell:P.P'],
    recurring: ['cell:I.D', 'skill:ПЕР'],
    insufficient: ['cell:P.N', 'cell:T.N', 'norm:T']
  });
  same(repeat(r), [['mass-culture', ['OBS-TYP-011', 'OBS-TYP-020'], ['OBS-TYP-050']]]);
});

test('пример B: частичные пробелы — после одной тренировки нет ни одного «устойчиво»', () => {
  const r = D.buildReport([B]);
  const st = byStatus(r);
  assert.strictEqual(st.stable, undefined);
  same(st.recurring, ['cell:I.E', 'cell:P.E', 'skill:СИТ'].sort());
  same(repeat(r), [
    ['И/П:E', ['OBS-TYP-026', 'OBS-TYP-028', 'OBS-TYP-032', 'OBS-TYP-038', 'OBS-TYP-039', 'OBS-TYP-040'], ['OBS-TYP-041', 'OBS-TYP-043', 'OBS-TYP-044']],
    ['mass-production', ['OBS-TYP-032', 'OBS-TYP-036', 'OBS-TYP-040'], ['OBS-TYP-042', 'OBS-TYP-046', 'OBS-TYP-049']]
  ]);
  assert.strictEqual(r.repeat[0].mainConcept, 'services');
});

test('пример C: существенные затруднения — пункты отсортированы по числу заданий', () => {
  const r = D.buildReport([C]);
  same(r.repeat.map((it) => [it.key, it.tasks.length]), [
    ['Т/И:S', 6], ['estates', 6], ['НЕУЗН:P.E', 4], ['НЕУЗН:T.D', 4], ['НЕУЗН:I.S', 2], ['Т/И:E', 2], ['Т/П:E', 2], ['qualification', 2]
  ]);
  // Нерешённых заданий с той же группой нет — маршрут ведёт в «Работу над ошибками» (этап 5).
  same(r.repeat[7].drills, []);
});

test('E1: повтор итоговой работы без ошибок не меняет статусы, идёт только в прогресс на знакомых заданиях', () => {
  const before = D.buildReport([P1_OK, A_FINAL]);
  const after = D.buildReport([P1_OK, A_FINAL, session('OBS-TYP-F01')]);
  same(byStatus(after), byStatus(before));
  same(after.familiarProgress, { positions: 135, errors: 0 });
  same(repeat(after), repeat(before));
});

test('E2: ошибка в дискуссионной позиции не учитывается в статусах', () => {
  const ctx = loadDiagnostics(); // отдельный экземпляр: тестовая разметка не влияет на другие тесты
  ctx.diagnostics.taskMarkup('OBS-TYP-039').pos[0].nature = 'd';
  const r = ctx.diagnostics.buildReport([{ practicumId: 'OBS-TYP-P01', answers: answers('OBS-TYP-P01', { 'OBS-TYP-039': [1, 2, 1, 1, 3] }) }]);
  assert.ok(r.statuses.every((s) => s.status !== 'recurring'));
  same(r.groups.map((g) => [g.key, g.level]), [['Т/П:E', 'debatable']]);
  same(r.groups[0].list[0].codes.facets, ['ДИСК']);
});

test('E3: верные ответы после разбора не подтверждают освоение', () => {
  const r = D.buildReport([session('OBS-TYP-P01', { 'OBS-TYP-026': [3, 4] })]);
  assert.ok(r.afterCorrection.includes('OBS-TYP-028/4'));
  assert.ok(r.afterCorrection.includes('OBS-TYP-038/Б'));
  const ie = statusOf(r, 'cell:I.E');
  same([ie.status, ie.errors], ['preliminary', 1]);
  assert.ok(ie.afterCorrection > 0);
});

test('E4: две ошибки в одном задании — наблюдаемые, не повторяющиеся', () => {
  const r = D.buildReport([session('OBS-TYP-P02', { 'OBS-TYP-048': [1, 2, 3, 4] })]);
  same(r.repeat, []);
  assert.strictEqual(r.groups.find((g) => g.key === 'УНИВ').level, 'observed');
  same([statusOf(r, 'skill:УНИВ').status, statusOf(r, 'skill:УНИВ').note], ['insufficient', 'мало независимых наблюдений']);
});

test('E6: ценностные ориентации подтверждаются отдельно от практики', () => {
  const r = D.buildReport([P1_OK, session('OBS-TYP-F01')]);
  assert.strictEqual(statusOf(r, 'norm:P').status, 'preliminary');
  assert.strictEqual(statusOf(r, 'cell:P.N').status, 'insufficient');
  same(statusOf(r, 'norm:P').byNature, { n: 11 });
});

test('E7: ошибки на контекстных индикаторах — затруднение применения к ситуации, а не незнание типа', () => {
  const r = D.buildReport([session('OBS-TYP-P01', { 'OBS-TYP-035': [5, 6], 'OBS-TYP-033': [1, 2, 3, 4] })]);
  same(repeat(r), [['КОНТ', ['OBS-TYP-033', 'OBS-TYP-035'], ['OBS-TYP-047', 'OBS-TYP-048', 'OBS-TYP-050']]]);
  same(r.repeat[0].targets, ['T', 'P']);
  assert.strictEqual(r.repeat[0].typeErrorsInTargets, false);
  assert.strictEqual(statusOf(r, 'skill:СИТ').status, 'recurring');
  assert.strictEqual(statusOf(r, 'cell:I.E').status, 'preliminary');
  assert.strictEqual(statusOf(r, 'cell:P.E').status, 'preliminary');
});

test('E8: Практикум № 2 и итоговая без ошибок — устойчивые признаки дают «устойчиво»', () => {
  const r = D.buildReport([session('OBS-TYP-P02'), session('OBS-TYP-F01')]);
  assert.strictEqual(statusOf(r, 'cell:P.S').status, 'stable');
  assert.strictEqual(statusOf(r, 'cell:I.P').status, 'insufficient');
});

test('при равном числе заданий пункт КОНТ идёт после пунктов о признаках типов', () => {
  const r = D.buildReport([session('OBS-TYP-P01', {
    'OBS-TYP-033': [1, 2, 3, 4], 'OBS-TYP-035': [5, 6], // контекстные индикаторы: 2 задания
    'OBS-TYP-026': [3, 4], 'OBS-TYP-028': [2, 3]         // «машинный труд» не узнан: 2 задания
  })]);
  same(r.repeat.map((it) => [it.key, it.tasks.length]), [['НЕУЗН:I.E', 2], ['КОНТ', 2]]);
  assert.strictEqual(r.repeat[1].typeErrorsInTargets, true, 'в этой работе есть ошибки по признакам искомого типа');
});

/* ---------- Пороги: семейства и категории (синтетические наблюдения) ---------- */

function fakeObs(list) {
  return list.map(([taskId, family, session, kind, op, nature]) => ({
    taskId, family, session, kind, op, nature: nature || 's', type: 'I', sphere: 'E', concept: 'capital', block: 'capital',
    outcome: 'ok', familiar: false, afterCorrection: false, ctx: false, inst: false, evidence: 'recognition', contrast: null, codes: null
  }));
}
const COV = { 'cell:I.E': 1 };

test('семейства: шесть заданий почти в одной формулировке не дают «устойчиво»', () => {
  const one = D.statusOf('cell:I.E', fakeObs([
    ['a', 'F', 0, 'training', 'R'], ['b', 'F', 0, 'training', 'M'], ['c', 'F', 0, 'training', 'A'],
    ['d', 'F', 1, 'final', 'R'], ['e', 'F', 1, 'final', 'M'], ['f', 'x', 1, 'final', 'R']
  ]), COV);
  same([one.status, one.note, one.positions, one.families], ['insufficient', 'мало независимых наблюдений', 6, 2]);
  const many = D.statusOf('cell:I.E', fakeObs([
    ['a', 'F', 0, 'training', 'R'], ['b', 'x2', 0, 'training', 'M'], ['c', 'x3', 0, 'training', 'A'],
    ['d', 'F', 1, 'final', 'R'], ['e', 'x4', 1, 'final', 'M'], ['f', 'x1', 1, 'final', 'R']
  ]), COV);
  assert.strictEqual(many.status, 'stable');
});

test('клетка не становится «устойчивой» только на тенденциях', () => {
  const st = D.statusOf('cell:I.E', fakeObs([
    ['a', 't1', 0, 'training', 'R', 't'], ['b', 't2', 0, 'training', 'M', 't'],
    ['c', 't3', 1, 'final', 'A', 't'], ['d', 't4', 1, 'final', 'R', 't']
  ]), COV);
  assert.strictEqual(st.status, 'preliminary');
});

test('«устойчиво» требует итоговой работы и двух работ', () => {
  const st = D.statusOf('cell:I.E', fakeObs([
    ['a', 'f1', 0, 'training', 'R'], ['b', 'f2', 0, 'training', 'M'], ['c', 'f3', 0, 'training', 'A'], ['d', 'f4', 0, 'training', 'R']
  ]), COV);
  assert.strictEqual(st.status, 'preliminary');
});

test('элемент без позиций в банке — «не проверяется»', () => {
  const r = D.buildReport([P1_OK]);
  assert.strictEqual(statusOf(r, 'cell:P.P').status, 'not-tested');
});

/* ---------- Наблюдения ---------- */

test('исключение двух: исключённый член ряда — НЕУЗН, оставленная чужая позиция — ложное отнесение с парой типов', () => {
  const t = EGE.getTask('OBS-TYP-026'); // ключ 35, ряд — индустриальное
  const obs = D.observeTask(t, [3, 4]);
  same([obs[3].outcome, obs[3].codes.primary], ['rejected', 'НЕУЗН']);
  same([obs[4].outcome, obs[4].codes.primary, obs[4].contrast], ['accepted', 'И/П', 'И/П']);
});

test('вид подтверждения: узнавание признака и отклонение ошибочного приписывания различаются', () => {
  const t = EGE.getTask('OBS-TYP-027'); // суждения о традиционном обществе
  const obs = D.observeTask(t, plain(S.getCorrect(t)));
  same(obs.map((o) => [o.evidence, o.contrast]), [
    ['rejection', 'Т/И'], ['recognition', null], ['rejection', 'Т/И'], ['recognition', null], ['recognition', null]
  ]);
  const r = D.buildReport([P1_OK, session('OBS-TYP-F01')]);
  const ie = statusOf(r, 'cell:I.E');
  assert.ok(ie.evidence.recognition > 0 && ie.evidence.rejection > 0);
  assert.ok(ie.evidence.contrasts['Т/И'] > 0);
});

test('коды описывают наблюдаемое: у каждого кода есть описание без вывода о причине', () => {
  Object.keys(D.CODES).forEach((c) => {
    assert.ok(D.CODES[c].text.length > 10, c);
    assert.doesNotMatch(D.CODES[c].text, /не знает|не понимает|путает/, c);
  });
});

test('задание без разметки не даёт наблюдений', () => {
  const other = EGE.practicums.find((p) => p.topic !== 'OBS-TYP');
  const t = EGE.getTask(other.taskIds[0]);
  same(D.observeTask(t, []), []);
});

test('ошибка записи позиции обнаруживается при разборе', () => {
  assert.throws(() => D.parsePosition('Q.E.capital'));
  assert.throws(() => D.parsePosition('I.E.capital+unknown'));
  same(plain(D.parsePosition('P.N.harmony@I!n+cause')), plain({
    type: 'P', sphere: 'N', concept: 'harmony', claim: 'I', nature: 'n', abs: false, cause: true, trans: false, fact: false, ctx: false, inst: false, conc: null
  }));
});
