'use strict';

/**
 * Рабочий банк практикума «Норма права» (work/law-nrm/*.js, страница olympiad-work.html):
 * данные заданий корректны, эталон даёт полный балл, неподтверждённые задания не попадают
 * в публикуемый банк, форма вариантов не подсказывает ответ, демо-задания не дублируются.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadBank, pageScripts } = require('./helpers/olymp.js');
const { build } = require('../scripts/build-demo-page.js');

const root = path.join(__dirname, '..');
const work = () => loadBank('olympiad-work.html');
const nrm = (OLY) => OLY.tasks.filter((t) => t.topic === 'LAW-NRM' && t.olympiad === 'PR');

/** Строки выбора задания любого типа (для проверки формы вариантов). */
function choiceRows(task) {
  const rows = [];
  (task.sections || []).forEach((s) => s.rows.forEach((r) => rows.push(r)));
  (task.parts || []).forEach((p) => (p.rows || []).forEach((r) => rows.push(r)));
  return rows;
}

test('olympiad-work.html совпадает с результатом scripts/build-demo-page.js', () => {
  const html = fs.readFileSync(path.join(root, 'olympiad-work.html'), 'utf8');
  assert.equal(html, build('work'), 'Запустите node scripts/build-demo-page.js');
});

test('Рабочий банк не подключён к основной странице и демо-странице', () => {
  assert.ok(!pageScripts().some((s) => s.startsWith('work/')));
  assert.ok(!pageScripts('olympiad-demo.html').some((s) => s.startsWith('work/')));
  const main = loadBank();
  assert.equal(main.tasks.filter((t) => t.topic === 'LAW-NRM').length, 0);
});

test('Обязательная часть: 11 заданий по реестру, все черновики, эталон даёт полный балл', () => {
  const OLY = work();
  const tasks = nrm(OLY);
  assert.equal(tasks.length, 11);
  assert.deepEqual(tasks.map((t) => t.order), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  for (const task of tasks) {
    assert.equal(task.draft, true, task.id);
    const type = OLY.types.get(task.type);
    const correct = type.getCorrect(task);
    type.cleanResponse(task, correct);
    const g = OLY.grade.gradeTask(task, correct);
    assert.equal(g.verdict, 'correct', task.id);
    assert.equal(g.points, task.scoring.maxPoints, task.id);
    assert.ok(OLY.ui.views.has(task.type) && OLY.ui.views.get(task.type).feedbackSummary, task.id);
  }
});

test('Неподтверждённые нормативные тексты помечены и не могут попасть в публикуемый банк', () => {
  const OLY = work();
  for (const task of nrm(OLY)) {
    const legal = task.type === 'compound' ? OLY.compound.allLegal(task) : (task.legal || []);
    const v = task.verification;
    assert.ok(v && ['unconfirmed', 'no-legal-text', 'confirmed'].includes(v.status), task.id + ': нет статуса сверки');
    if (legal.length) {
      // Сверка не проведена — ни одного verified: true, статус «не подтверждено».
      assert.ok(legal.every((b) => b.verified === false), task.id);
      assert.equal(v.status, 'unconfirmed', task.id);
      assert.ok(v.note && v.checked, task.id + ': нужны причина и дата попытки сверки');
    } else {
      assert.equal(v.status, 'no-legal-text', task.id);
    }
  }
  // Публикуемый банк не содержит черновиков и несверенных текстов (общий тест — в olymp-nrm-grid.test.js).
  for (const task of loadBank().tasks) assert.notEqual(task.draft, true, task.id);
});

test('Форма вариантов не подсказывает ответ: длина и позиция правильного варианта', () => {
  const OLY = work();
  const all = nrm(OLY).flatMap((t) => choiceRows(t).map((r) => ({ t, r })));
  const listCount = {};
  all.forEach(({ r }) => { const k = r.options.join('|'); listCount[k] = (listCount[k] || 0) + 1; });
  // Авторские перечни (встречаются один раз) — не канонические наборы вроде «запрещающая / обязывающая / управомочивающая».
  const authored = all.filter(({ r }) => r.options.length >= 3 && listCount[r.options.join('|')] === 1);
  assert.ok(authored.length >= 10);
  for (const { t, r } of authored) {
    const lens = r.options.map((o) => o.length);
    const others = lens.filter((_, i) => !r.key.includes(i));
    assert.ok(Math.max(...r.key.map((k) => lens[k])) <= Math.max(...others) * 1.2,
      t.id + ' / ' + r.id + ': правильный вариант заметно длиннее остальных');
  }
  const fixedOrder = authored.filter(({ r }) => !r.shuffle);
  const keyFirst = fixedOrder.filter(({ r }) => r.key[0] === 0).length;
  assert.ok(keyFirst <= Math.ceil(fixedOrder.length / 2), 'в авторских строках без перемешивания правильный вариант слишком часто первый: ' + keyFirst + ' из ' + fixedOrder.length);
});

test('Перемешанный порядок показа: стабилен, это перестановка, правильный вариант не всегда первый', () => {
  const OLY = work();
  const rows = nrm(OLY).flatMap((t) => choiceRows(t).filter((r) => r.shuffle).map((r) => ({ t, r })));
  assert.ok(rows.length >= 8);
  let keyFirst = 0;
  for (const { t, r } of rows) {
    const order = OLY.ui.nrm.displayOrder(t, r);
    assert.deepEqual(order.slice().sort(), r.options.map((_, i) => i), t.id + ' / ' + r.id);
    assert.deepEqual(OLY.ui.nrm.displayOrder(t, r), order, 'порядок должен быть стабильным');
    if (order[0] === r.key[0]) keyFirst++;
  }
  assert.ok(keyFirst < rows.length / 2, 'правильный вариант первым в ' + keyFirst + ' из ' + rows.length);
});

test('Демо-задания не дублируются в рабочем банке', () => {
  const demo = loadBank('olympiad-demo.html').tasks.filter((t) => t.olympiad === 'DEMO');
  const bank = nrm(work());
  const texts = (t) => JSON.stringify([t.legal, t.steps, t.sections, t.parts, t.items, t.arguments]);
  for (const d of demo) {
    for (const b of bank) assert.notEqual(texts(d), texts(b), d.id + ' дублирует ' + b.id);
  }
});

test('IV-1 и IV-2: размечаются только выраженные фрагменты, реконструкция — отдельными вопросами', () => {
  const OLY = work();
  for (const id of ['PR-LAW-NRM-007', 'PR-LAW-NRM-008']) {
    const task = OLY.getTask(id);
    assert.equal(task.type, 'text-markup');
    assert.match(task.markupHint, /только то, что прямо/);
    assert.ok(task.sections.some((s) => /Реконструкция/.test(s.title)), id);
  }
  // В IV-2 санкции в тексте нет: её «дописывание» снимает балл санкции.
  const t = OLY.getTask('PR-LAW-NRM-008');
  const r = OLY.types.get(t.type).getCorrect(t);
  r.marks.a4 = 'S';
  const g = OLY.grade.gradeTask(t, r);
  assert.equal(g.details.markup.elements.S.status, 'wrong');
  assert.equal(g.details.components.T.earned, 4);
});

test('I-3: системный анализ ст. 8 и ст. 189 ТК; I-1: решающие признаки — множественный выбор', () => {
  const OLY = work();
  const i3 = OLY.getTask('PR-LAW-NRM-002');
  assert.ok(i3.sections.some((s) => s.id === 'system'));
  const i1 = OLY.getTask('PR-LAW-NRM-001');
  const r = OLY.types.get('compound').getCorrect(i1);
  r.parts.A.f3 = { c: null, f: [], e: [], m: [0, 1] };   // противоречащий признак «кем установлена» для обычая
  r.parts.A.f1 = { c: null, f: [], e: [], m: [2] };       // один решающий признак — засчитывается
  const g = OLY.grade.gradeTask(i1, r);
  assert.equal(g.details.parts.A.rows.f3.choice, 'wrong');
  assert.equal(g.details.parts.A.rows.f1.choice, 'ok');
  assert.equal(g.points, 14);
});
