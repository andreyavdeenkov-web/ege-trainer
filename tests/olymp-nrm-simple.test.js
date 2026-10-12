'use strict';

/**
 * Упрощённый тренажёр «Классификация правовых норм» (тема LAW-NKL, страница olympiad-nrm-simple.html):
 * страница собрана генератором, серия 1 — пять норм с согласованными ключами, 36 вопросов и 36 баллов,
 * один вопрос — один балл, у каждого варианта есть объяснение, тренажёр не попадает в публикуемый банк
 * и в рабочий банк углублённого практикума LAW-NRM.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadBank, pageScripts } = require('./helpers/olymp.js');
const { build } = require('../scripts/build-demo-page.js');

const root = path.join(__dirname, '..');
const PAGE = 'olympiad-nrm-simple.html';
const simple = () => loadBank(PAGE);
const series = (OLY) => OLY.sortByOrder(OLY.tasks.filter((t) => t.topic === 'LAW-NKL' && t.olympiad === 'PR'));

/** Согласованные ключи: id строки → правильный вариант. */
const KEYS = {
  'PR-LAW-NKL-001': { branch: 'Конституционное право', nature: 'Материальная', method: 'Императивная', means: 'Обязывающая', function: 'Регулятивная', time: 'Постоянная', persons: 'Общая', sphere: 'Федеральная' },
  'PR-LAW-NKL-002': { branch: 'Гражданское право', nature: 'Материальная', method: 'Диспозитивная', means: 'Обязывающая', function: 'Регулятивная', time: 'Постоянная', sphere: 'Федеральная' },
  'PR-LAW-NKL-003': { branch: 'Семейное право', nature: 'Материальная', method: 'Императивная', means: 'Обязывающая', function: 'Регулятивная', time: 'Постоянная', persons: 'Специальная', sphere: 'Федеральная' },
  'PR-LAW-NKL-004': { branch: 'Трудовое право', nature: 'Материальная', method: 'Императивная', means: 'Запрещающая', function: 'Регулятивная', time: 'Постоянная', sphere: 'Федеральная' },
  'PR-LAW-NKL-005': { branch: 'Гражданское процессуальное право', nature: 'Процессуальная', means: 'Управомочивающая', function: 'Регулятивная', time: 'Постоянная', sphere: 'Федеральная' }
};

const TEXTS = {
  'PR-LAW-NKL-001': 'Каждый обязан платить законно установленные налоги и сборы.',
  'PR-LAW-NKL-002': 'Собственник несет бремя содержания принадлежащего ему имущества, если иное не предусмотрено законом или договором.',
  'PR-LAW-NKL-003': 'Родители обязаны содержать своих несовершеннолетних детей.',
  'PR-LAW-NKL-004': 'Запрещается требовать от работника выполнения работы, не обусловленной трудовым договором, за исключением случаев, предусмотренных настоящим Кодексом и иными федеральными законами.',
  'PR-LAW-NKL-005': 'Истец вправе изменить основание или предмет иска'
};

const rowsOf = (task) => task.sections.flatMap((s) => s.rows);

test('olympiad-nrm-simple.html совпадает с результатом scripts/build-demo-page.js', () => {
  const html = fs.readFileSync(path.join(root, PAGE), 'utf8');
  assert.equal(html, build('simple'), 'Запустите node scripts/build-demo-page.js');
});

test('Тренажёр не подключён к основной, демо- и рабочей страницам', () => {
  for (const page of ['olympiad.html', 'olympiad-demo.html', 'olympiad-work.html']) {
    assert.ok(!pageScripts(page).some((s) => s.startsWith('work/law-nrm-simple/')), page);
  }
  assert.equal(loadBank().tasks.filter((t) => t.topic === 'LAW-NKL').length, 0);
  // На странице тренажёра нет заданий углублённого практикума.
  assert.equal(simple().tasks.filter((t) => /^LAW-NR[MA-D]$/.test(t.topic)).length, 0);
});

test('Серия 1: пять норм по порядку, согласованные ключи, 36 вопросов — 36 баллов', () => {
  const OLY = simple();
  const tasks = series(OLY);
  assert.deepEqual(tasks.map((t) => t.id), Object.keys(KEYS));
  assert.deepEqual(tasks.map((t) => t.order), [1, 2, 3, 4, 5]);
  let total = 0;
  for (const task of tasks) {
    assert.equal(task.type, 'analysis-grid', task.id);
    assert.equal(task.draft, true, task.id);
    assert.equal(task.verification.status, 'unconfirmed', task.id);
    assert.equal(task.legal[0].fragments[0].text, TEXTS[task.id], task.id);
    const rows = rowsOf(task);
    const keys = Object.fromEntries(rows.map((r) => [r.id, r.options[r.key[0]]]));
    assert.deepEqual(keys, KEYS[task.id], task.id);
    rows.forEach((r, i) => {
      assert.equal(r.key.length, 1, task.id + '/' + r.id);
      assert.ok(!r.evidence && !r.followUp && !r.partial && !r.multi, task.id + '/' + r.id + ': только простой выбор');
      assert.ok(r.label.startsWith(i + 1 + '. По '), task.id + '/' + r.id + ': нумерация оснований');
    });
    assert.equal(task.scoring.maxPoints, rows.length, task.id);
    total += task.scoring.maxPoints;
  }
  assert.equal(total, 36);
});

test('Проверка: эталон — полный балл, каждая ошибка стоит ровно один балл', () => {
  const OLY = simple();
  for (const task of series(OLY)) {
    const type = OLY.types.get(task.type);
    const correct = type.getCorrect(task);
    const full = OLY.grade.gradeTask(task, type.cleanResponse(task, correct));
    assert.equal(full.verdict, 'correct', task.id);
    assert.equal(full.points, task.scoring.maxPoints, task.id);
    for (const r of rowsOf(task)) {
      const wrong = structuredClone(correct);
      wrong[r.id].c = r.key[0] === 0 ? 1 : 0;
      const g = OLY.grade.gradeTask(task, type.cleanResponse(task, wrong));
      assert.equal(g.points, task.scoring.maxPoints - 1, task.id + '/' + r.id);
      assert.equal(g.verdict, 'partial', task.id + '/' + r.id);
    }
  }
});

test('Объяснения: у правильного ответа и у каждого неверного варианта', () => {
  const OLY = simple();
  for (const task of series(OLY)) {
    assert.ok(task.explanation.length > 100 && task.typicalMistake, task.id);
    for (const r of rowsOf(task)) {
      assert.ok(r.explanation.length >= 200, task.id + '/' + r.id + ': объяснение слишком короткое');
      r.options.forEach((option, i) => {
        if (r.key.includes(i)) return;
        assert.ok(OLY.nrmRows.explanation(r.wrong[i]), task.id + '/' + r.id + ': нет объяснения для «' + option + '»');
      });
    }
  }
});
