'use strict';

/**
 * Разбор позиции в тренировочных практикумах (js/task-view.js), решение преподавателя
 * от 15.11.2026: правильность самого варианта — нейтральная метка по формату задания;
 * оценка действия ученика — цвет и значок; стандартный вердикт в начале объяснения
 * при показе не повторяется, а в соответствиях не повторяется уже показанный правильный
 * вариант. Тексты объяснений в данных не меняются. Проверяется на всём банке ЕГЭ.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { root, scripts } = require('./helpers/ege.js');

function load() {
  const context = vm.createContext({});
  context.globalThis = context;
  context.window = context;
  const list = ['js/registry.js', 'js/scoring.js', 'js/attempt.js',
    ...scripts.filter((s) => s.startsWith('data/tasks/')), 'data/practicums.js', 'js/task-view.js'];
  for (const src of list) vm.runInContext(fs.readFileSync(path.join(root, src), 'utf8'), context, { filename: src });
  return context.EGE;
}

const EGE = load();
const V = EGE.taskView;
const S = EGE.scoring;
const VERDICT = /^(Верно[.:]|Неверно[.:]|Выпадает( из общего ряда)?\.|Не выпадает( из общего ряда)?\.|Подходит\.|Не подходит\.)\s/;

test('метка правильности варианта — по формату задания', () => {
  const statement = EGE.getTask('OBS-TYP-027'); // суждения
  const items = EGE.getTask('OBS-TYP-030'); // выбор из списка
  const excl = EGE.getTask('OBS-TYP-026'); // исключение
  assert.equal(V.truthLabel(statement, { correct: true }), 'Верное суждение');
  assert.equal(V.truthLabel(statement, { correct: false }), 'Неверное суждение');
  assert.equal(V.truthLabel(items, { correct: true }), 'Подходит');
  assert.equal(V.truthLabel(items, { correct: false }), 'Не подходит');
  assert.equal(V.truthLabel(excl, { correct: true }), 'Выпадает из общего ряда');
  assert.equal(V.truthLabel(excl, { correct: false }), 'Не выпадает из общего ряда');
});

test('метка действия ученика: выбрано верно / ошибочно, пропущен верный вариант, верно не выбрано', () => {
  assert.equal(V.actionLabel('hit'), 'Выбрано верно');
  assert.equal(V.actionLabel('wrong'), 'Выбрано ошибочно');
  assert.equal(V.actionLabel('missed'), 'Пропущен верный вариант');
  assert.equal(V.actionLabel('skip'), 'Верно не выбрано');
});

test('стандартный вердикт не повторяется в показанном объяснении — во всех заданиях с выбором банка ЕГЭ', () => {
  let stripped = 0;
  let kept = 0;
  for (const task of EGE.tasks.filter((t) => t.statements)) {
    task.statements.forEach((s, i) => {
      if (!s.explanation) return;
      const shown = V.displayExplanation(s);
      const where = `${task.id}, позиция ${i + 1}`;
      assert.ok(shown.trim().length > 0, `${where}: пустое объяснение`);
      if (shown !== s.explanation) {
        stripped++;
        assert.doesNotMatch(shown, VERDICT, `${where}: вердикт остался`);
        assert.equal(shown.charAt(0), shown.charAt(0).toUpperCase(), `${where}: с прописной буквы`);
        // Скрыто только вводное слово: остальной текст объяснения не меняется.
        assert.ok(s.explanation.toLowerCase().endsWith(shown.slice(1).toLowerCase()), `${where}: текст изменился`);
      } else {
        kept++;
      }
    });
  }
  assert.ok(stripped > 900, `скрыто вердиктов: ${stripped}`);
  // Нестандартное начало показывается полностью (например, «Неверно по двум причинам»).
  assert.equal(V.displayExplanation({ correct: false, explanation: 'Неверно по двум причинам.\n— А.' }), 'Неверно по двум причинам.\n— А.');
  // Вердикт, не совпадающий с правильностью варианта, не скрывается — расхождение остаётся видно.
  assert.equal(V.displayExplanation({ correct: true, explanation: 'Неверно. Текст.' }), 'Неверно. Текст.');
  assert.ok(kept >= 0);
});

test('примеры: суждение, выбор из списка, исключение', () => {
  assert.equal(V.displayExplanation(EGE.getTask('OBS-TYP-027').statements[0]),
    'Основной фактор производства в традиционном обществе — земля, так как богатство создаётся земледелием; капитал становится главным в индустриальном обществе.');
  assert.equal(V.displayExplanation(EGE.getTask('OBS-TYP-033').statements[0]).slice(0, 40), 'Почитание императора как символа преемст');
  assert.equal(V.displayExplanation(EGE.getTask('OBS-TYP-026').statements[3]), 'Замена ручного труда машинным — суть промышленного переворота.');
  assert.equal(V.displayExplanation(EGE.getTask('OBS-TYP-019').statements[0]),
    'Чрезмерное обобщение. Промышленность сохраняется, но перестаёт быть ведущей сферой.');
});

test('соответствие: правильный вариант, уже показанный отдельно, не повторяется в объяснении', () => {
  const t = EGE.getTask('OBS-TYP-038');
  assert.equal(t.items[0].explanation, '1 — традиционное. Большинство населения занято земледелием, а земля — основной фактор производства.');
  assert.equal(V.displayMatchExplanation(t, t.items[0]), 'Большинство населения занято земледелием, а земля — основной фактор производства.');
  let changed = 0;
  for (const task of EGE.tasks.filter((x) => x.items)) {
    task.items.forEach((item) => {
      if (!item.explanation) return;
      const shown = V.displayMatchExplanation(task, item);
      assert.ok(shown.length > 0, task.id);
      if (shown !== item.explanation) {
        changed++;
        assert.doesNotMatch(shown, /^\d — /, task.id);
      }
    });
  }
  assert.equal(changed, 30, 'только соответствия Практикумов № 1 и № 2 «Типов обществ» начинаются с правильного варианта');
  // Объяснения других тем, которые начинаются с понятия, не трогаются.
  const other = EGE.tasks.find((x) => x.items && x.topic !== 'OBS-TYP');
  other.items.forEach((item) => assert.equal(V.displayMatchExplanation(other, item), item.explanation, other.id));
});
