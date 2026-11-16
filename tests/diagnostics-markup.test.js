'use strict';

/**
 * Диагностическая разметка темы «Типы обществ»: полнота, согласованность с ключами,
 * подписи «ответ по ключу» и согласованные содержательные решения.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { root, loadDiagnostics } = require('./helpers/ege.js');

const EGE = loadDiagnostics();
const D = EGE.diagnostics;
const S = EGE.scoring;
const PRACTICUMS = ['OBS-TYP-P01', 'OBS-TYP-P02', 'OBS-TYP-F01'];
const ALL = PRACTICUMS.flatMap((pid) => EGE.getPracticum(pid).taskIds);
const topic = D.getTopic('OBS-TYP');

/* Задания загружены в отдельном контексте vm: массивы сравниваем по содержимому. */
const same = (a, b, msg) => assert.strictEqual(JSON.stringify(a), JSON.stringify(b), msg);
const plain = (x) => JSON.parse(JSON.stringify(x));
const keyOf = (t) => plain(S.getCorrect(t));

/** Позиция по ссылке вида «П1 № 14.А» / «И № 22.2». */
function pos(ref) {
  const m = /^(П1|П2|И) № (\d+)\.(.+)$/.exec(ref);
  const pid = { П1: 'OBS-TYP-P01', П2: 'OBS-TYP-P02', И: 'OBS-TYP-F01' }[m[1]];
  const taskId = EGE.getPracticum(pid).taskIds[Number(m[2]) - 1];
  const index = /^[А-Д]$/.test(m[3]) ? 'АБВГД'.indexOf(m[3]) : Number(m[3]) - 1;
  return { taskId, index, task: EGE.getTask(taskId), p: topic.tasks[taskId].pos[index] };
}

test('размечены все задания трёх практикумов: 55 заданий, 302 позиции', () => {
  assert.strictEqual(ALL.length, 55);
  assert.ok(ALL.every((id) => D.taskMarkup(id)));
  const n = ALL.reduce((s, id) => s + D.taskMarkup(id).pos.length, 0);
  assert.strictEqual(n, 302);
});

test('разметка согласована с ключами, картой темы и семействами', () => {
  same(D.checkTopic('OBS-TYP'), []);
});

test('категории, контекстные индикаторы и семейства: итог согласования', () => {
  const nat = {};
  let ctx = 0;
  ALL.forEach((id) => D.taskMarkup(id).pos.forEach((p) => { nat[p.nature] = (nat[p.nature] || 0) + 1; if (p.ctx) ctx++; }));
  same(nat, { s: 254, t: 29, n: 19 });
  assert.strictEqual(ctx, 5);
  assert.strictEqual(Object.keys(topic.families).length, 48);
  assert.strictEqual(Object.values(topic.families).reduce((s, f) => s + f.members.length, 0), 167);
});

test('каждая возможная одиночная ошибка получает код; НЕКЛ нет', () => {
  const counts = {};
  let total = 0;
  for (const id of ALL) {
    const t = EGE.getTask(id);
    const key = keyOf(t);
    const variants = [];
    if (t.items) t.items.forEach((_, i) => t.options.forEach((__, oi) => { if (oi + 1 !== key[i]) { const s = key.slice(); s[i] = oi + 1; variants.push(s); } }));
    else t.statements.forEach((_, i) => variants.push(key.includes(i + 1) ? key.filter((x) => x !== i + 1) : key.concat([i + 1])));
    variants.forEach((sel) => D.observeTask(t, sel).filter((o) => o.outcome !== 'ok').forEach((o) => {
      total++;
      counts[o.codes.primary] = (counts[o.codes.primary] || 0) + 1;
    }));
  }
  assert.strictEqual(total, 352);
  assert.strictEqual(counts['НЕКЛ'], undefined);
  same(counts, { 'НЕУЗН': 128, 'Т/И': 76, 'И/П': 52, 'ФОРМ': 4, 'Т/П': 68, 'УНИВ': 5, 'КОНТ': 5, 'ПЕР': 2, 'ПОНЯТ': 11, 'ПРИЧ': 1 });
});

/* ---------- Подписи «ответ по ключу» ---------- */

const EXCL = ALL.filter((id) => S.getTaskType(EGE.getTask(id)) === 'exclude-two');

test('исключение двух: восемь заданий во всех трёх практикумах', () => {
  same(EXCL, ['OBS-TYP-026', 'OBS-TYP-041', 'OBS-TYP-001', 'OBS-TYP-002', 'OBS-TYP-003', 'OBS-TYP-004', 'OBS-TYP-005', 'OBS-TYP-006']);
});

test('исключение двух: «выпадает» ровно у двух позиций ключа', () => {
  for (const id of EXCL) {
    const t = EGE.getTask(id);
    const out = t.statements.map((_, j) => j + 1).filter((n) => D.keyLabel(t, n - 1) === 'выпадает из общего ряда');
    same(out, keyOf(t), id);
    assert.strictEqual(out.length, 2, id);
  }
});

test('исключение двух: выпадающие позиции не относятся к типу ряда, остальные относятся', () => {
  for (const id of EXCL) {
    const t = EGE.getTask(id);
    const mk = D.taskMarkup(id);
    t.statements.forEach((_, j) => {
      const outlier = D.keyLabel(t, j) === 'выпадает из общего ряда';
      assert.strictEqual(outlier, mk.pos[j].type !== mk.target, id + ' поз. ' + (j + 1));
    });
  }
});

test('регресс: П1 № 1 и П2 № 1 (ключ 35) — выпадают позиции 3 и 5', () => {
  for (const id of ['OBS-TYP-026', 'OBS-TYP-041']) {
    const t = EGE.getTask(id);
    same(t.statements.map((_, j) => D.keyLabel(t, j)), [
      'не выпадает из общего ряда', 'не выпадает из общего ряда', 'выпадает из общего ряда',
      'не выпадает из общего ряда', 'выпадает из общего ряда', 'не выпадает из общего ряда'
    ], id);
  }
});

test('выбор верных: «в ответе» — ровно позиции ключа; соответствие: подпись — тип по ключу', () => {
  for (const id of ALL) {
    const t = EGE.getTask(id);
    if (t.items) t.items.forEach((it, j) => assert.strictEqual(D.keyLabel(t, j), t.options[it.match - 1], id));
    else if (!EXCL.includes(id)) same(t.statements.map((_, j) => j + 1).filter((n) => D.keyLabel(t, n - 1) === 'в ответе'), keyOf(t), id);
  }
});

test('подписи совпадают с подписями на сайте (js/task-view.js)', () => {
  const src = fs.readFileSync(path.join(root, 'js', 'task-view.js'), 'utf8');
  assert.match(src, /'exclude-two': \['Выпадает из общего ряда', 'Не выпадает из общего ряда'\]/);
});

/* ---------- Согласованные содержательные решения ---------- */

test('наука как непосредственная производительная сила — отдельное понятие в блоке «наукоёмкое производство», учитывается', () => {
  const { p } = pos('П1 № 14.А');
  assert.strictEqual(p.concept, 'science-force');
  assert.strictEqual(p.block, 'science');
  assert.strictEqual(p.nature, 't');
  assert.strictEqual(p.type, 'P');
});

test('контекстные индикаторы: удалённая работа — тенденция в экономике; у неверных вариантов тип не определяется', () => {
  const remote = pos('П1 № 10.3').p;
  same([remote.type, remote.sphere, remote.concept, remote.nature, remote.ctx], ['P', 'E', 'digital', 't', true]);
  for (const ref of ['П1 № 8.3', 'П1 № 8.5', 'П1 № 7.5', 'П1 № 10.2']) {
    const { p } = pos(ref);
    assert.ok(p.ctx, ref);
    assert.strictEqual(p.type, 'X', ref);
  }
});

test('экстенсивные методы: П2 № 8.6 — традиционное общество (преобладание экстенсивного хозяйства)', () => {
  const { p } = pos('П2 № 8.6');
  same([p.type, p.concept, p.ctx], ['T', 'extensive', false]);
});

test('категория соответствует тому, что подтверждает ответ: точечные правки проверки 4', () => {
  // Принцип стратификации индустриального общества — устойчивый признак (как П2 № 12.1).
  assert.strictEqual(pos('П2 № 5.4').p.nature, 's');
  assert.strictEqual(pos('П2 № 12.1').p.nature, 's');
  // Непрерывное образование как модель передачи знаний — устойчивый признак; рост его значения — тенденция.
  for (const ref of ['И № 5.3', 'И № 8.В', 'И № 14.Б', 'И № 23.3']) assert.strictEqual(pos(ref).p.nature, 's', ref);
  for (const ref of ['П2 № 1.6', 'П2 № 4.3', 'П2 № 11.3']) assert.strictEqual(pos(ref).p.nature, 't', ref);
  // Формулировки с «возрастает», «увеличение», «развитие» о ведущем факторе, ведущей сфере, способе производства — устойчивые признаки.
  for (const ref of ['П1 № 4.2', 'П1 № 9.4', 'П1 № 3.3']) assert.strictEqual(pos(ref).p.nature, 's', ref);
});

test('индивидуализация: общая тенденция и её проявление различаются в разметке, семейство общее', () => {
  const general = pos('И № 6.6').p;
  const instance = pos('И № 22.2').p;
  assert.strictEqual(general.nature, 't');
  assert.strictEqual(instance.nature, 't');
  assert.strictEqual(general.inst, false);
  assert.strictEqual(instance.inst, true);
  assert.strictEqual(general.family, instance.family);
});

test('семейства разделены по смысловой силе: «возрастает роль знаний» ≠ «знания — основной фактор»', () => {
  const growth = pos('П1 № 4.2').p.family;
  const main = pos('И № 5.2').p.family;
  assert.notStrictEqual(growth, main);
  assert.strictEqual(pos('П2 № 1.1').p.family, growth);
  assert.strictEqual(pos('П2 № 12.6').p.family, main);
  assert.strictEqual(pos('П2 № 13.В').p.family, main);
  assert.notStrictEqual(pos('П1 № 11.2').p.family, pos('П2 № 4.5').p.family, '«во многом» и «прежде всего по рождению»');
  assert.strictEqual(pos('П2 № 4.5').p.family, pos('П1 № 4.5').p.family);
});

test('неверное суждение и прямая формулировка — одно семейство, но разные виды подтверждения', () => {
  const claim = pos('П1 № 2.1');   // «В традиционном обществе основным фактором производства является капитал»
  const direct = pos('И № 6.1');   // «капитал как основной фактор производства» (ряд индустриального общества)
  assert.strictEqual(claim.p.family, direct.p.family);
  const oc = D.observeTask(claim.task, keyOf(claim.task))[claim.index];
  const od = D.observeTask(direct.task, keyOf(direct.task))[direct.index];
  same([oc.evidence, oc.contrast], ['rejection', 'Т/И']);
  same([od.evidence, od.contrast], ['recognition', null]);
});

test('разметка в данных не меняет задания: файл диагностики не подключён к страницам', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.ok(!html.includes('js/diagnostics.js'));
  assert.ok(!html.includes('data/diagnostics/'));
});
