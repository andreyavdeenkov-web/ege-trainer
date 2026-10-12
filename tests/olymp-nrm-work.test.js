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
/** Все задания практикума в рабочем банке: обязательная часть и блоки А–Г (темы LAW-NRA…LAW-NRD). */
const bank = (OLY) => OLY.tasks.filter((t) => /^LAW-NR[MA-D]$/.test(t.topic) && t.olympiad === 'PR');

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
  assert.deepEqual(tasks.map((t) => t.order).sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  // Порядок показа: II-1 → I-1 → II-2 → I-3 → III-2 → … → V-2; идентификаторы постоянные.
  assert.deepEqual(OLY.sortByOrder(tasks).map((t) => t.id.slice(-3)),
    ['003', '001', '004', '002', '005', '006', '007', '008', '009', '010', '011']);
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
  for (const task of bank(OLY)) {
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
  const all = bank(OLY).flatMap((t) => choiceRows(t).map((r) => ({ t, r })));
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
  const rows = bank(OLY).flatMap((t) => choiceRows(t).filter((r) => r.shuffle).map((r) => ({ t, r })));
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
  const all = bank(work());
  const texts = (t) => JSON.stringify([t.legal, t.steps, t.sections, t.parts, t.items, t.arguments]);
  for (const d of demo) {
    for (const b of all) assert.notEqual(texts(d), texts(b), d.id + ' дублирует ' + b.id);
  }
});

test('Задания на структуру нормы: трёхэлементная модель, независимая оценка элементов, без спорных границ и лишних вопросов', () => {
  const OLY = work();
  const ids = ['PR-LAW-NRM-007', 'PR-LAW-NRM-008', 'PR-LAW-NRM-009', 'PR-LAW-NRM-010', 'PR-LAW-NRC-001', 'PR-LAW-NRC-002', 'PR-LAW-NRC-003', 'PR-LAW-NRC-004'];
  const missingSeen = { H: 0, D: 0, S: 0 };
  for (const id of ids) {
    const t = OLY.getTask(id);
    assert.equal(t.type, 'text-markup', id);
    assert.deepEqual(t.palette.map((p) => p.id), ['H', 'D', 'S'], id);
    assert.equal(t.markup.scoring, 'independent', id);
    assert.ok(Object.values(t.markup.key).every((k) => typeof k === 'string'), id + ': без спорных границ');
    assert.ok((t.sections || []).length <= 1, id);
    assert.doesNotMatch(JSON.stringify(t), /лекци|Условие применения санкции|КоАП/, id);
    assert.match(t.markupHint, /только то, что прямо выражено/, id);
    const used = new Set(Object.values(t.markup.key));
    ['H', 'D', 'S'].forEach((k) => { if (!used.has(k)) missingSeen[k]++; });
    // Элемент, ошибочно размеченный другим, снимает баллы только у этих двух элементов.
    const type = OLY.types.get(t.type);
    for (const [frag, k] of Object.entries(t.markup.key)) {
      const other = ['H', 'D', 'S'].find((x) => x !== k);
      const r = type.getCorrect(t);
      r.marks[frag] = other;
      const g = type.check(t, r);
      const el = g.details.markup.elements;
      ['H', 'D', 'S'].forEach((x) => {
        const expected = (x === k || x === other) ? 0 : 1;
        assert.equal(el[x].points, expected, id + ': ' + frag + ' как ' + other + ' → ' + x);
      });
    }
  }
  // Неполные фрагменты помечены знаком […]; спорные слова оставлены вне разметки.
  for (const id of ['PR-LAW-NRM-008', 'PR-LAW-NRC-003']) {
    const frs = OLY.getTask(id).legal[0].fragments;
    assert.match(frs[frs.length - 1].text, /\[…\]$/, id);
  }
  const plain = (id) => OLY.getTask(id).legal[0].fragments.filter((f) => !f.id).map((f) => f.text).join('');
  assert.match(plain('PR-LAW-NRC-003'), /известив работодателя в письменной форме/);
  assert.match(plain('PR-LAW-NRM-009'), /могут быть применены/);
  assert.match(plain('PR-LAW-NRC-002'), /может быть наложено/);
  assert.match(plain('PR-LAW-NRC-004'), /Гражданин Российской Федерации/);
  // Санкции: денежное взыскание — мера процессуального принуждения; ст. 419 ТК — отсылочная санкция.
  assert.match(OLY.getTask('PR-LAW-NRC-002').explanation, /мера процессуального принуждения/);
  assert.match(OLY.getTask('PR-LAW-NRM-010').markup.elements.S.explanation, /отсылочной санкцией/);
  const sanctions = ids.filter((id) => Object.values(OLY.getTask(id).markup.key).includes('S'));
  assert.ok(sanctions.length >= 3, 'есть задания на распознавание санкции: ' + sanctions);
  // Учебная модель разметки названа в условии; альтернативный подход не объявлен ошибочным.
  for (const id of ids) assert.match(OLY.getTask(id).markupHint, /Это учебная модель разметки; в юридической науке существуют и другие подходы/, id);
  for (const id of ['PR-LAW-NRM-009', 'PR-LAW-NRM-010']) {
    assert.match(OLY.getTask(id).markup.elements.D.wrong.full, /нормы-запрета.*ошибочным не является/, id);
  }
  assert.match(OLY.getTask('PR-LAW-NRM-011').explanation, /учебное соглашение/);
  assert.doesNotMatch(JSON.stringify(OLY.getTask('PR-LAW-NRC-001')), /гипотезой не является/);
  // Среди заданий есть такие, где ученик должен распознать отсутствие каждого из трёх элементов.
  assert.ok(missingSeen.H >= 1 && missingSeen.D >= 1 && missingSeen.S >= 1, JSON.stringify(missingSeen));
});

const BLOCKS = [
  { topic: 'LAW-NRA', file: 'work/law-nrm/block-a.js', count: 5 },
  { topic: 'LAW-NRB', file: 'work/law-nrm/block-b.js', count: 5 },
  { topic: 'LAW-NRC', file: 'work/law-nrm/block-c.js', count: 7 },
  { topic: 'LAW-NRD', file: 'work/law-nrm/block-d.js', count: 3 }
];

test('Блоки А–Г: подключённые блоки полные по реестру, черновики, эталон даёт полный балл; у каждого блока своя тема', () => {
  const OLY = work();
  const scripts = pageScripts('olympiad-work.html');
  const attached = BLOCKS.filter((bl) => scripts.includes(bl.file));
  assert.ok(attached.length >= 2, 'подключены блоки А и Б');
  for (const bl of attached) {
    const tasks = OLY.tasks.filter((t) => t.topic === bl.topic);
    assert.equal(tasks.length, bl.count, bl.topic);
    assert.deepEqual(tasks.map((t) => t.order), Array.from({ length: bl.count }, (_, i) => i + 1), bl.topic);
    for (const task of tasks) {
      assert.equal(task.draft, true, task.id);
      assert.equal(task.olympiad, 'PR', task.id);
      const type = OLY.types.get(task.type);
      assert.deepEqual(type.validateTask(task), [], task.id);
      const g = OLY.grade.gradeTask(task, type.getCorrect(task));
      assert.equal(g.verdict, 'correct', task.id);
      assert.equal(g.points, task.scoring.maxPoints, task.id);
    }
    const topic = OLY.getTopic('social', bl.topic);
    assert.ok(topic && topic.discipline === 'LAW' && topic.section === 'theory', bl.topic);
  }
  // Темы блоков не видны на основной странице: там нет их заданий.
  assert.equal(loadBank().tasks.filter((t) => /^LAW-NR/.test(t.topic)).length, 0);
});

test('Образец задания на структуру (IV-1): классическая трёхэлементная модель, без четвёртого элемента; санкции в тексте нет — её не размечают', () => {
  const OLY = work();
  const t = OLY.getTask('PR-LAW-NRM-007');
  assert.deepEqual(t.palette.map((p) => p.id), ['H', 'D', 'S']);
  assert.ok(!Object.values(t.markup.key).flat().includes('S'), 'санкции нет в тексте');
  assert.ok(Object.values(t.markup.key).every((k) => !Array.isArray(k)), 'без спорных границ');
  assert.doesNotMatch(JSON.stringify(t), /лекци|Условие применения санкции/);
  // Элементы оцениваются независимо: диспозиция, размеченная как санкция, — 0 за Д и 0 за С, 1 за Г.
  assert.equal(t.markup.scoring, 'independent');
  const r = OLY.types.get(t.type).getCorrect(t);
  r.marks.f1 = 'S';
  let g = OLY.grade.gradeTask(t, r);
  assert.equal(g.details.markup.elements.H.points, 1);
  assert.equal(g.details.markup.elements.D.points, 0);
  assert.equal(g.details.markup.elements.S.points, 0);
  assert.equal(g.details.components.T.earned, 1);
  assert.equal(g.points, t.scoring.maxPoints - 2);
  // Одно ошибочное действие не штрафует других элементов: пропуск диспозиции — только 0 за Д.
  const r2 = OLY.types.get(t.type).getCorrect(t);
  r2.marks.f1 = null;
  g = OLY.grade.gradeTask(t, r2);
  assert.deepEqual(['H', 'D', 'S'].map((k) => g.details.markup.elements[k].points), [1, 0, 1]);
  // Перепутаны гипотеза и диспозиция — по 0 за каждую, санкция засчитана.
  const r3 = OLY.types.get(t.type).getCorrect(t);
  r3.marks.f1 = 'H'; r3.marks.f2 = 'D';
  g = OLY.grade.gradeTask(t, r3);
  assert.deepEqual(['H', 'D', 'S'].map((k) => g.details.markup.elements[k].points), [0, 0, 1]);
  // Вопроса о мере ответственности по другим актам в задании нет.
  assert.doesNotMatch(JSON.stringify(t), /КоАП/);
});

test('Задания на классификацию: одно предписание, простые вопросы без доказательств, отрасль — из общего набора 11 отраслей', () => {
  const OLY = work();
  const ids = ['PR-LAW-NRM-005', 'PR-LAW-NRM-006', 'PR-LAW-NRB-001', 'PR-LAW-NRB-002', 'PR-LAW-NRB-003', 'PR-LAW-NRB-004', 'PR-LAW-NRB-005'];
  const branches = OLY.nrmClassify.BRANCHES.map((b) => b.name);
  assert.equal(branches.length, 11);
  for (const id of ids) {
    const t = OLY.getTask(id);
    assert.equal(t.type, 'analysis-grid', id);
    assert.equal(t.sections.length, 1, id);
    assert.equal(t.legal.length, 1, id + ': одно предписание');
    const rows = t.sections[0].rows;
    assert.ok(rows.length >= 4 && rows.length <= 6, id);
    assert.ok(rows.every((r) => !r.evidence && !r.followUp && !r.context), id + ': без доказательств и дополнительных частей');
    assert.deepEqual(rows[0].options, branches, id + ': отрасль — из общего набора');
    assert.doesNotMatch(JSON.stringify(t), /лекци/i, id);
  }
  // Второе предложение п. 1 ст. 80 СК не используется как пример диспозитивной нормы.
  const sk = OLY.getTask('PR-LAW-NRB-001');
  assert.doesNotMatch(sk.legal[0].fragments.map((f) => f.text).join(''), /самостоятельно/);
});

test('Тема классификации социальных норм исключена из обязательной части', () => {
  const OLY = work();
  const re = /морал|корпоратив|этикет|религиоз|обыча|традици/i;
  for (const task of bank(OLY)) assert.doesNotMatch(JSON.stringify(task), re, task.id);
  const social = fs.readFileSync(path.join(root, 'data/olympiads/subjects/social.js'), 'utf8');
  assert.match(social, /title: 'Норма права: понятие, признаки, классификация и структура'/);
  assert.doesNotMatch(social, /id: 'regulators'/);
});

test('I-3: природа ЛНА, теоретический компонент, пределы действия; без ч. 4 ст. 8 ТК (она — в VI-1)', () => {
  const OLY = work();
  const t = OLY.getTask('PR-LAW-NRM-002');
  assert.deepEqual(t.sections.map((s) => s.id), ['nature', 'limits']);
  assert.ok(!t.legal.some((b) => /ст\. 8, ч\. 4/.test(b.ref)));
  assert.doesNotMatch(JSON.stringify(t), /ч\. 4 ст\. 8|ст\. 8 ч\. 4/);
  const row = (id) => OLY.nrmRows.rowsOf(t.sections).find((r) => r.id === id);
  // Каждый эпизод — в карточке своей строки.
  ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'].forEach((id) => assert.ok(row(id).context, id));
  assert.match(JSON.stringify(row('p5').context), /Гипотетическое условие/);
  assert.match(JSON.stringify(row('p3').context), /трудовую функцию/);
  assert.match(JSON.stringify(row('p6').context), /другое время перерыва не установлено/);
  // П3 и П4 доказываются одним предложением ст. 12 ч. 4 — в разные стороны.
  assert.deepEqual(row('p3').evidence.key, ['e9']);
  assert.deepEqual(row('p4').evidence.key, ['e9']);
  // Ключевой фрагмент — сама норма о правах и обязанностях, а не вводная часть предложения.
  const frag = (id) => t.legal.flatMap((b) => b.fragments).find((f) => f.id === id).text;
  assert.match(frag('e9'), /применяется к правам и обязанностям, возникшим после введения его в действие/);
  assert.doesNotMatch(frag('e9a'), /правам и обязанностям/);
  {
    const ev = (e) => { const x = OLY.types.get(t.type).getCorrect(t); x.p4.e = e; return OLY.grade.gradeTask(t, x).details.rows.p4.evidence; };
    assert.equal(ev(['e9a']), 'wrong', 'одна вводная часть не доказывает');
    assert.equal(ev(['e9a', 'e9']), 'ok', 'вводная часть вместе с нормой — допустимо');
  }
  const type = OLY.types.get(t.type);
  const r = type.getCorrect(t);
  r.p4 = { c: 0, f: [], e: ['e8'], m: undefined };
  delete r.p4.m;
  const g = OLY.grade.gradeTask(t, r);
  assert.equal(g.details.rows.p4.choice, 'wrong');
  assert.equal(g.details.rows.p4.evidence, 'wrong');
  assert.equal(g.points, t.scoring.maxPoints - 2);
  assert.equal(t.layout, 'split');
});

test('I-1: составное задание; доказательство — только из текстов, открытых к этой части', () => {
  const OLY = work();
  const t = OLY.getTask('PR-LAW-NRM-001');
  const type = OLY.types.get('compound');
  assert.deepEqual(type.validateTask(t), []);
  // Конституция появляется только в части Б — в части А на неё ссылаться нельзя.
  const bad = JSON.parse(JSON.stringify(t));
  bad.parts[0].rows[0].evidence.key = ['c2'];
  assert.ok(type.validateTask(bad).some((e) => /неизвестный фрагмент c2/.test(e)));
  // Учебный указ условия — не нормативный текст для сверки.
  assert.equal(t.legal.find((b) => b.id === 'ukaz-3').fictional, true);
  // Б2: правило о законах (первые предложения ч. 3 ст. 15) не доказывает вывод об указе.
  const r = type.getCorrect(t);
  r.parts.B.b2.e = ['c1'];
  const g = OLY.grade.gradeTask(t, r);
  assert.equal(g.details.parts.B.rows.b2.evidence, 'wrong');
  assert.equal(g.points, t.scoring.maxPoints - 1);
  // Части Б не видно, пока часть А не зафиксирована.
  assert.deepEqual(OLY.compound.visibleLegal(t, 0).map((b) => b.id), ['ukaz-3', 'fz68-11', 'koap-20-6-1']);
  assert.match(JSON.stringify(t.parts[1].rows.find((x) => x.id === 'b4').context), /Гипотетическое условие/);
  // Б1 — поимённые адресаты и единичный случай; Б3 — только о значении самой подачи иска.
  const b1 = t.parts[1].rows.find((x) => x.id === 'b1');
  assert.match(b1.context, /Петрову Ивану Ивановичу и Сидоровой Ольге Андреевне/);
  assert.doesNotMatch(JSON.stringify(b1), /рейс/);
  const b3 = t.parts[1].rows.find((x) => x.id === 'b3');
  assert.match(b3.label, /сама подача иска/);
  assert.match(b3.options[b3.key[0]], /сама подача иска не приостанавливает/);
});

test('Множественный выбор строки: засчитывается только выбор из решающих вариантов', () => {
  const OLY = work();
  const R = OLY.nrmRows;
  const row = { id: 'm', label: 'Признак', options: ['а', 'б', 'в', 'г', 'д'], key: [0, 2], multi: { max: 2, contra: [1] }, explanation: 'x',
    wrong: { 1: 'x', 3: 'x', 4: 'x' } };
  assert.deepEqual(R.validateRow(row, {}, {}), []);
  const st = (m) => R.scoreChoice(row, { c: null, f: [], e: [], m }).status;
  assert.equal(st([0]), 'ok');
  assert.equal(st([0, 2]), 'ok');
  assert.equal(st([0, 4]), 'wrong');
  assert.equal(st([0, 1]), 'wrong');
});

test('Журнал сверки: есть запись по каждому положению; verified: true — только при подтверждённой записи и совпадении текста', () => {
  const { collect, keyOf, textOf, JOURNAL } = require('../scripts/legal-checklist.js');
  const journal = JSON.parse(fs.readFileSync(JOURNAL, 'utf8'));
  const items = collect();
  for (const k of items.keys()) {
    assert.ok(journal.entries[k], 'нет записи журнала: ' + k + ' (node scripts/legal-checklist.js)');
    assert.ok(['pending', 'confirmed', 'differs'].includes(journal.entries[k].status), k);
  }
  const OLY = work();
  for (const task of bank(OLY)) {
    const blocks = task.type === 'compound' ? OLY.compound.allLegal(task) : (task.legal || []);
    for (const b of blocks) {
      if (b.fictional) { assert.equal(b.verified, false, b.id); continue; }
      const e = journal.entries[keyOf(b)];
      if (e.status === 'confirmed') {
        assert.ok(e.edition && e.source && e.checked && e.officialText, keyOf(b) + ': подтверждённая запись без редакции, источника, даты или текста');
      }
      if (b.verified === true) {
        assert.equal(e.status, 'confirmed', keyOf(b) + ': verified без подтверждённой сверки');
        assert.ok(e.officialText.replace(/\s+/g, ' ').includes(textOf(b).replace(/\s*\[…\]\s*/g, ' ').trim().split(' ').slice(0, 6).join(' ')), keyOf(b) + ': текст задания не совпадает с официальным');
      }
    }
    if (task.verification.status === 'confirmed') {
      assert.ok(blocks.every((b) => b.verified === true), task.id + ': статус «подтверждено», но не все положения сверены');
    }
  }
});

test('LAW-NRM — единый последовательный список: название блока не показывается, блоки заданий сохранены; другие темы без изменений', () => {
  const OLY = work();
  const topics = OLY.getDiscipline('social', 'LAW').topics;
  assert.deepEqual(topics.filter((t) => t.sequential).map((t) => t.id), ['LAW-NRM']);
  for (const task of nrm(OLY)) assert.ok(OLY.getBlock(task.subject, task.topic, task.block), task.id + ': блок в данных');
  assert.throws(() => OLY.defineSubject({ id: 'zz', title: 'Тест', disciplines: [{ id: 'ZZZ', title: 'Тест',
    topics: [{ id: 'ZZZ-AAA', title: 'Тема', sequential: 'да' }] }] }), /sequential должно быть true или false/);
});
