'use strict';

/**
 * «Типы обществ», тренировочные практикумы № 1 и № 2 (OBS-TYP-P01, OBS-TYP-P02): 30 заданий
 * документов преподавателя «Типы обществ тест 1» и «тест 2» (хранятся вне репозитория).
 * Ключи ниже переписаны из таблиц ключей документов; отпечатки — условия, варианты и
 * позиции в том виде, в каком их собрал scripts/build-society-types-training.js.
 * Менять только по решению преподавателя (и тогда пересобрать данные).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const S = require('../js/scoring.js');
const { loadBank } = require('./helpers/ege.js');

const EGE = loadBank();

/** Таблицы ключей документов: номер задания → ключ. */
const KEYS = {
  'OBS-TYP-P01': ['35', '245', '234', '124', '125', '234', '136', '124', '124', '356', '126', '123', '12313', '32113', '11323'],
  'OBS-TYP-P02': ['35', '124', '345', '234', '124', '134', '156', '125', '124', '123', '123', '234', '12312', '32131', '12313']
};
/** Позиция КИМ по формату задания документа: 1 — два лишних, 2 — суждения, 3 — соответствие, 4 — выбор из списка / по ситуации. */
const KIM = {
  'OBS-TYP-P01': [1, 2, 2, 2, 4, 2, 4, 4, 4, 4, 4, 4, 3, 3, 3],
  'OBS-TYP-P02': [1, 2, 2, 2, 4, 4, 4, 4, 4, 4, 4, 4, 3, 3, 3]
};
/** Число вариантов (у соответствия — позиций А–Д). */
const SIZES = {
  'OBS-TYP-P01': [6, 5, 5, 5, 6, 5, 6, 6, 6, 6, 6, 6, 5, 5, 5],
  'OBS-TYP-P02': [6, 5, 5, 5, 6, 6, 6, 6, 6, 6, 6, 6, 5, 5, 5]
};
/** Отпечатки содержания: условие, указание, заголовки столбцов, тексты вариантов и позиций, второй столбец.
 *  У 038–040 и 053–055 — с заголовками столбцов, исправленными по решению преподавателя от 14.11.2026. */
const CONTENT = {
  'OBS-TYP-026': '03d12abae45b729d', 'OBS-TYP-027': 'b27841df736866fe', 'OBS-TYP-028': '8894777818bf7e07',
  'OBS-TYP-029': '5f832a112bd05f88', 'OBS-TYP-030': '0ff7726f21a717f0', 'OBS-TYP-031': '4e36ef9e446be4bd',
  'OBS-TYP-032': '8205640dd3ccc876', 'OBS-TYP-033': 'e34ec61342292348', 'OBS-TYP-034': '14dda675218007a4',
  'OBS-TYP-035': 'cd06492806c21c0d', 'OBS-TYP-036': 'd53bbc5e12299907', 'OBS-TYP-037': '3f6e37ba7d306777',
  'OBS-TYP-038': '88a601c5a3ec8d0f', 'OBS-TYP-039': '18df106936fdd14c', 'OBS-TYP-040': 'e9da0baa5d6ee596',
  'OBS-TYP-041': 'bfb53cfd8bc2edfd', 'OBS-TYP-042': '3be0c773c66a6126', 'OBS-TYP-043': 'ed5d1bc0f690a4b2',
  'OBS-TYP-044': '48f7ec6a68b6d9e4', 'OBS-TYP-045': 'cdb0a87692824acb', 'OBS-TYP-046': '5ff5844a0b9cdd69',
  'OBS-TYP-047': '698abe4e96f1ff41', 'OBS-TYP-048': '8f724b4ff2be3ace', 'OBS-TYP-049': '4c58417238be81ed',
  'OBS-TYP-050': 'f62d470c5cf128b7', 'OBS-TYP-051': 'aa71a2cf5deb537d', 'OBS-TYP-052': '8097aaed7b795050',
  'OBS-TYP-053': '7168492d9e26e201', 'OBS-TYP-054': '31173d65809a6dc9', 'OBS-TYP-055': 'e5a74732a948ccb9'
};

const fingerprint = (t) => crypto.createHash('sha256').update(JSON.stringify([t.question, t.instruction || null,
  t.columns ? Array.from(t.columns) : null, Array.from(t.statements || t.items, (s) => s.text),
  t.options ? Array.from(t.options) : null])).digest('hex').slice(0, 16);

const practicum = (id) => EGE.getPracticum(id);
const tasksOf = (id) => EGE.getPracticumTasks(practicum(id));

test('импортированы все 30 заданий: по 15 в Практикумах № 1 и № 2, ID OBS-TYP-026…055, kind training', () => {
  for (const [pid, first] of [['OBS-TYP-P01', 26], ['OBS-TYP-P02', 41]]) {
    const p = practicum(pid);
    assert.equal(p.kind, 'training', pid);
    assert.ok(!p.shuffle, `${pid}: порядок документа`);
    assert.deepEqual(Array.from(p.taskIds), Array.from({ length: 15 }, (_, i) => 'OBS-TYP-' + String(first + i).padStart(3, '0')));
    tasksOf(pid).forEach((t, i) => assert.equal(t.source.ref, `Типы обществ, тест ${pid.endsWith('1') ? 1 : 2}, задание ${i + 1}`, t.id));
  }
});

test('ключи совпадают с таблицами ключей документов; формат и число вариантов', () => {
  for (const pid of Object.keys(KEYS)) {
    tasksOf(pid).forEach((t, i) => {
      const where = `${pid}, задание ${i + 1}`;
      assert.equal(S.getCorrect(t).join(''), KEYS[pid][i], `${where}: ключ`);
      assert.equal(t.kimTask, KIM[pid][i], `${where}: позиция КИМ`);
      assert.equal((t.statements || t.items).length, SIZES[pid][i], `${where}: варианты`);
      const type = { 1: 'exclude-two', 2: 'multiple', 3: 'matching', 4: 'multiple' }[t.kimTask];
      assert.equal(S.getTaskType(t), type, where);
      assert.equal(t.choiceOf, t.kimTask === 4 ? 'items' : undefined, where);
    });
  }
});

test('формулировки перенесены без изменений (отпечатки) и без бланковых указаний', () => {
  for (const pid of Object.keys(KEYS)) {
    for (const t of tasksOf(pid)) {
      assert.equal(fingerprint(t), CONTENT[t.id], `${t.id}: условие или варианты изменились`);
      assert.doesNotMatch(t.question + ' ' + (t.instruction || ''), /запишите|Запишите|Ответ:/, t.id);
    }
  }
  // Выборочно — полный текст из документов.
  const t1 = EGE.getTask('OBS-TYP-026');
  assert.equal(t1.question, 'Ниже приведён перечень характеристик. Все они, за исключением двух, относятся к индустриальному обществу.');
  assert.equal(t1.instruction, 'Найдите две характеристики, «выпадающие» из общего ряда.');
  assert.deepEqual(Array.from(t1.statements, (s) => s.text), ['преобладание промышленного производства',
    'рост доли городского населения', 'господство натурального хозяйства', 'широкое использование машинного труда',
    'преобладание сферы услуг в структуре экономики', 'формирование многочисленного класса наёмных рабочих']);
  assert.equal(EGE.getTask('OBS-TYP-033').question, 'В современной Японии высокий уровень развития промышленности и информационных технологий сочетается с сохранением некоторых исторически сложившихся традиций. Найдите в приведённом списке примеры сохранения элементов традиционного общества в современной Японии.');
  const m = EGE.getTask('OBS-TYP-040');
  assert.deepEqual(Array.from(m.items, (i) => i.text)[2], 'значительная часть экономически активного населения занята разработкой программного обеспечения и оказанием информационных услуг');
  assert.deepEqual(Array.from(m.options), ['традиционное', 'индустриальное', 'постиндустриальное']);
  assert.equal(EGE.getTask('OBS-TYP-041').question, 'Ниже приведён перечень характеристик. Все они, за исключением двух, относятся к постиндустриальному обществу.');
});

test('пояснения: у каждого варианта и каждой позиции, вердикт согласован с ключом', () => {
  for (const pid of Object.keys(KEYS)) {
    for (const t of tasksOf(pid)) {
      if (t.items) {
        t.items.forEach((item, i) => {
          assert.ok(item.explanation, `${t.id} ${S.letter(i + 1)}`);
          assert.match(item.explanation, new RegExp('^(Тип )?' + item.match + '[ .]'), `${t.id} ${S.letter(i + 1)}: пояснение и ключ`);
        });
        continue;
      }
      t.statements.forEach((s, i) => {
        const re = S.getTaskType(t) === 'exclude-two'
          ? (s.correct ? /^Выпадает из общего ряда\. / : /^Не выпадает из общего ряда\. /)
          : (s.correct ? /^Верно[.:] / : /^Неверно[.:] /);
        assert.match(s.explanation, re, `${t.id}, вариант ${i + 1}`);
      });
    }
  }
  assert.equal(EGE.getTask('OBS-TYP-027').statements[0].explanation, 'Неверно: ведущий фактор традиционной экономики — земля, не капитал.');
  assert.equal(EGE.getTask('OBS-TYP-042').statements[0].explanation, 'Верно. Натуральное хозяйство — характерный признак.');
  assert.equal(EGE.getTask('OBS-TYP-026').statements[2].explanation, 'Выпадает из общего ряда. Натуральное хозяйство (традиционное).');
  assert.equal(EGE.getTask('OBS-TYP-041').statements[0].explanation, 'Не выпадает из общего ряда. Знания — ведущий ресурс постиндустриальной экономики.');
});

test('утверждённые правки 14.11.2026: общий признак ряда и заголовки столбцов соответствия', () => {
  assert.equal(EGE.getTask('OBS-TYP-026').commonFeature,
    'Преобладание промышленного производства, рост доли городского населения, широкое использование машинного труда и формирование класса наёмных рабочих — признаки индустриального общества.');
  assert.equal(EGE.getTask('OBS-TYP-041').commonFeature,
    'Возрастание роли знаний и информации, наукоёмкие технологии, преобладание сферы услуг в занятости и непрерывное образование — признаки постиндустриального общества.');
  const heads = ['038', '039', '040', '053', '054', '055'].map((n) => EGE.getTask('OBS-TYP-' + n).columns[0]);
  assert.deepEqual(heads, ['Характеристики', 'Признаки', 'Примеры', 'Признаки', 'Явления', 'Характеристики']);
  // Заголовок соответствует слову из условия задания.
  const word = { 'Характеристики': 'характеристиками', 'Признаки': 'признаками', 'Примеры': 'примерами', 'Явления': 'явлениями' };
  for (const n of ['038', '039', '040', '053', '054', '055']) {
    const t = EGE.getTask('OBS-TYP-' + n);
    assert.ok(t.question.includes('между ' + word[t.columns[0]] + ' и типами обществ'), t.id);
    assert.equal(t.columns[1], 'Типы обществ', t.id);
  }
});

test('оценивание — существующее: по 26 баллов за практикум, модели ФИПИ по позиции КИМ', () => {
  for (const pid of Object.keys(KEYS)) {
    assert.equal(EGE.getPracticumMaxScore(practicum(pid)), 26, pid);
    for (const t of tasksOf(pid)) {
      assert.equal(S.getMaxPoints(t), { 1: 1, 2: 2, 3: 1, 4: 2 }[t.kimTask], t.id);
    }
  }
  const t = EGE.getTask('OBS-TYP-027'); // ключ 2 4 5
  assert.equal(S.scoreTask(t, [2, 4, 5]), 2);
  assert.equal(S.scoreTask(t, [2, 4]), 1);
  assert.equal(S.scoreTask(t, [1, 2, 4, 5]), 1);
  assert.equal(S.scoreTask(t, [1, 2, 3, 4, 5]), 0);
  assert.equal(S.scoreTask(EGE.getTask('OBS-TYP-038'), [1, 2, 3, 1, 3]), 1);
  assert.equal(S.scoreTask(EGE.getTask('OBS-TYP-038'), [1, 2, 3, 1, 1]), 0);
  assert.equal(S.scoreTask(EGE.getTask('OBS-TYP-026'), [3, 5]), 1);
  assert.equal(S.scoreTask(EGE.getTask('OBS-TYP-026'), [3, 4]), 0);
});
