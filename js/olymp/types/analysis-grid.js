/**
 * Олимпиады: тип задания analysis-grid — классификационная карта.
 * Чистые функции без зависимостей от DOM. Подключается после js/olymp/types.js
 * и js/olymp/types/nrm-rows.js (общее ядро строк).
 *
 * Ученик для каждой строки выбирает значение (квалификацию нормы по основанию,
 * решение о применимости основания, оценку довода), при необходимости уточняет
 * выбор («спорно» → между какими видами) и отмечает фрагменты нормативного текста,
 * на которых основан вывод. Проверка полностью автоматическая, с частичными баллами
 * по трём компонентам: K — квалификация, T — текстовое доказательство,
 * R — логика рассуждения.
 *
 * Данные задания:
 * {
 *   type: 'analysis-grid',
 *   legal: [{ id, act, ref, role: 'main' | 'reference', edition?, checked?, url?,
 *             verified: true | false,          // сверен ли текст с официальным источником
 *             fragments: [{ id?, text }] }],   // фрагмент без id — связка, его нельзя отметить
 *   sections: [{ id, title, hint?, rows: [{
 *     id, label, note?,
 *     options: ['…', …],
 *     key: [i, …],             // правильные значения (номера с 0); несколько — равноправные ответы
 *     partial: [i, …]?,        // допустимые, но более слабые ответы — 0,5 балла
 *     component: 'K' | 'R'?,   // компонент балла за выбор (по умолчанию K)
 *     wrong: { i: '…' | { short, full } },  // объяснение каждого варианта не из key (обязательно)
 *     explanation: '…',        // почему верен ключ (подробное объяснение)
 *     followUp?: { when: i, label, options: ['…'], key: [j, …], wrong?: { j: … } },
 *     evidence?: { key: ['fragmentId', …], max?: 3, explanation: '…', wrong?: { fragmentId: … } }
 *   }] }]
 * }
 *
 * Ответ ученика: { rowId: { c: номер варианта | null, f: [номера уточнения], e: [id фрагментов] } }.
 *
 * Баллы строки (js/olymp/types/nrm-rows.js):
 *   выбор — 1, если значение в key (при уточнении — и набор уточнения совпал;
 *           0,5 — если уточнение указано частично без лишнего; 0 — если уточнение
 *           не указано или в нём есть неверный вариант);
 *           0,5 — если значение в partial; иначе 0;
 *   доказательство — 1, если отмечен хотя бы один ключевой фрагмент
 *           и не больше одного постороннего; иначе 0.
 * Вердикт: correct — все баллы; partial — часть; incorrect — ноль.
 */
(function (root) {
  'use strict';

  var OLY = root.OLY || (root.OLY = {});
  var types = OLY.types;
  var R = OLY.nrmRows;

  function rowsOf(task) {
    return R.rowsOf(task.sections);
  }

  function fragmentIndex(task) {
    return R.fragmentIndex(task.legal);
  }

  /** Максимум баллов по компонентам: { K, T, R }. */
  function maxByComponent(task) {
    var max = { K: 0, T: 0, R: 0 };
    rowsOf(task).forEach(function (row) { R.addMax(max, R.rowMax(row)); });
    return max;
  }

  function maxPoints(task) {
    var max = maxByComponent(task);
    return max.K + max.T + max.R;
  }

  function validateTask(task) {
    var errors = R.validateLegal(task.legal, { required: true, requireMain: true });
    errors = errors.concat(R.validateSections(task.sections, fragmentIndex(task), { allowEvidence: true }));
    if (errors.length === 0) errors = errors.concat(R.validateScoringTotal(task, maxPoints(task)));
    return errors;
  }

  function emptyResponse(task) {
    var response = {};
    rowsOf(task).forEach(function (row) { response[row.id] = R.emptyRow(); });
    return response;
  }

  function isEmpty(task, response) {
    if (!response || typeof response !== 'object') return true;
    return rowsOf(task).every(function (row) { return R.rowIsEmpty(R.rowAnswer(response, row)); });
  }

  function isComplete(task, response) {
    if (!response || typeof response !== 'object') return false;
    return rowsOf(task).every(function (row) { return R.rowIsComplete(row, R.rowAnswer(response, row)); });
  }

  /** Канонический ответ: все строки, проверенные номера и фрагменты. Бросает ошибку при неверной структуре. */
  function cleanResponse(task, response) {
    if (!response || typeof response !== 'object' || Array.isArray(response)) {
      throw new Error('Ответ должен быть объектом со строками карты');
    }
    try {
      return R.cleanRows(rowsOf(task), response, fragmentIndex(task));
    } catch (e) {
      throw new Error(e.message.replace('Неизвестная строка:', 'Неизвестная строка карты:'));
    }
  }

  function check(task, response) {
    var components = R.emptyComponents(maxByComponent(task));
    var rows = {};
    rowsOf(task).forEach(function (row) {
      rows[row.id] = R.scoreRow(row, R.rowAnswer(response, row), components);
    });
    var earned = R.total(components, 'earned');
    var max = R.total(components, 'max');
    return { verdict: R.verdictOf(earned, max), details: { rows: rows, components: components, earned: earned, max: max } };
  }

  function getCorrect(task) {
    var correct = {};
    rowsOf(task).forEach(function (row) { correct[row.id] = R.correctRow(row); });
    return correct;
  }

  function formatResponse(task, response) {
    var rows = rowsOf(task);
    if (!response || typeof response !== 'object') return '—';
    var filled = rows.filter(function (row) {
      var a = R.rowAnswer(response, row);
      return a.c !== null && a.c !== undefined;
    }).length;
    return 'заполнено строк: ' + filled + ' из ' + rows.length;
  }

  types.register('analysis-grid', {
    validateTask: validateTask,
    emptyResponse: emptyResponse,
    isEmpty: isEmpty,
    isComplete: isComplete,
    cleanResponse: cleanResponse,
    check: check,
    getCorrect: getCorrect,
    formatResponse: formatResponse
  });

  /** Помощники для отрисовки и тестов. */
  OLY.analysisGrid = {
    rowsOf: rowsOf,
    fragmentIndex: fragmentIndex,
    maxByComponent: maxByComponent,
    maxPoints: maxPoints,
    scoreChoice: R.scoreChoice,
    scoreEvidence: R.scoreEvidence,
    needsFollowUp: R.needsFollowUp,
    DEFAULT_EVIDENCE_MAX: R.DEFAULT_EVIDENCE_MAX
  };
})(typeof window !== 'undefined' ? window : globalThis);
