/**
 * Олимпиады: тип задания formula-builder — конструктор юридической формулировки (Ф8).
 * Подключается после js/olymp/types/nrm-choice.js.
 *
 * Ученик заполняет пропуски в утверждении: в каждом слоте 3–5 вариантов.
 *
 * Данные задания:
 * {
 *   type: 'formula-builder',
 *   context?: { title: '…', paragraphs: ['…'] },   // исходный материал (рассуждение, ситуация)
 *   legal?: [...],                                  // нормативный текст для чтения
 *   template: 'Общеобязательность означает, что норма обязательна для {s1} …',
 *   slots: [{ id: 's1', label: '[1] Кому адресована', options: [...], key: [0],
 *             partial?, wrong: {…}, explanation: '…', component?: 'R' | 'K' }]
 * }
 *
 * Баллы: по 1 за слот (½ — допустимый более слабый вариант); компонент слота
 * по умолчанию R — логика рассуждения.
 *
 * Проверка данных против перекрёстных подсказок (спецификация § 3.5): текст правильного
 * варианта слота не должен встречаться ни в постоянном тексте утверждения, ни в вариантах
 * других слотов.
 */
(function (root) {
  'use strict';

  var OLY = root.OLY || (root.OLY = {});
  var R = OLY.nrmRows;
  var norm = OLY.nrmChoice.norm;

  var PLACEHOLDER = /\{([A-Za-z0-9_-]+)\}/g;

  function rowsOf(task) {
    return (task.slots || []).map(function (slot) {
      return slot && slot.component === undefined ? Object.assign({ component: 'R' }, slot) : slot;
    });
  }

  /** Разбивает шаблон на части: { text } и { slot }. */
  function parts(task) {
    var list = [];
    var last = 0;
    var m;
    PLACEHOLDER.lastIndex = 0;
    while ((m = PLACEHOLDER.exec(task.template)) !== null) {
      if (m.index > last) list.push({ text: task.template.slice(last, m.index) });
      list.push({ slot: m[1] });
      last = m.index + m[0].length;
    }
    if (last < task.template.length) list.push({ text: task.template.slice(last) });
    return list;
  }

  function validate(task) {
    var errors = [];
    if (!R.isText(task.template)) return ['нет template'];
    if (!Array.isArray(task.slots) || task.slots.length === 0) return ['нет slots'];
    if (task.context !== undefined) {
      var c = task.context;
      if (!c || !R.isText(c.title) || !Array.isArray(c.paragraphs) || !c.paragraphs.length || !c.paragraphs.every(R.isText)) {
        errors.push('context — { title, paragraphs: [текст] }');
      }
    }
    var used = {};
    parts(task).forEach(function (p) {
      if (!p.slot) return;
      if (used[p.slot]) errors.push('слот {' + p.slot + '} встречается в шаблоне дважды');
      used[p.slot] = true;
    });
    var ids = {};
    task.slots.forEach(function (slot) {
      if (!slot || !R.isText(slot.id)) return;
      ids[slot.id] = true;
      if (!used[slot.id]) errors.push('слот ' + slot.id + ' не встречается в шаблоне');
      if (Array.isArray(slot.options) && (slot.options.length < 3 || slot.options.length > 5)) {
        errors.push('слот ' + slot.id + ': от 3 до 5 вариантов');
      }
    });
    Object.keys(used).forEach(function (id) {
      if (!ids[id]) errors.push('в шаблоне слот {' + id + '}, которого нет в slots');
    });
    if (errors.length) return errors;

    // Перекрёстные подсказки: правильный вариант не должен «торчать» в тексте или в других слотах.
    var fixed = norm(parts(task).filter(function (p) { return p.text; }).map(function (p) { return p.text; }).join(' '));
    task.slots.forEach(function (slot) {
      if (!Array.isArray(slot.key) || !Array.isArray(slot.options)) return;
      slot.key.forEach(function (k) {
        var answer = norm(slot.options[k]);
        if (answer.length < 4) return;
        if (fixed.indexOf(answer) !== -1) errors.push('слот ' + slot.id + ': правильный вариант «' + slot.options[k] + '» есть в тексте утверждения — перекрёстная подсказка');
        task.slots.forEach(function (other) {
          if (other === slot || !Array.isArray(other.options)) return;
          other.options.forEach(function (o) {
            if (norm(o).indexOf(answer) !== -1) errors.push('слот ' + slot.id + ': правильный вариант «' + slot.options[k] + '» повторяется в вариантах слота ' + other.id + ' — перекрёстная подсказка');
          });
        });
      });
    });
    return errors;
  }

  var api = OLY.nrmChoice.register('formula-builder', { rowsOf: rowsOf, validate: validate });

  OLY.formulaBuilder = {
    rowsOf: rowsOf,
    parts: parts,
    maxByComponent: api.maxByComponent,
    maxPoints: api.maxPoints
  };
})(typeof window !== 'undefined' ? window : globalThis);
