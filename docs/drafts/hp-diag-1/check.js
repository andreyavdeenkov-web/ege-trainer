/*
 * ЧЕРНОВИК: проверка ответов диагностического варианта № 1 (для тестов и
 * согласования). При интеграции логика переносится в типы заданий js/olymp/.
 *
 * Без нечёткого сопоставления: ответ засчитывается, только если после
 * нормализации совпадает с одной из утверждённых форм.
 */

/** Только технические различия: регистр, ё/е, пробелы, кавычки, знаки по краям. */
function normalizeText(value) {
  if (typeof value !== 'string') return '';
  return value
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[«»"“”„‘’']/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[\s.,;:!?…]+|[\s.,;:!?…]+$/g, '')
    .trim();
}

/** Утверждённые формы: всё, кроме basis: 'proposed' (если не передан список одобренных). */
function acceptedTexts(task, approvedProposals) {
  var approved = approvedProposals || [];
  return (task.accepted || []).filter(function (a) {
    return a.basis !== 'proposed' || approved.indexOf(a.text) !== -1;
  }).map(function (a) { return a.text; });
}

function checkShortText(task, response, approvedProposals) {
  var given = normalizeText(response);
  if (!given) return false;
  return acceptedTexts(task, approvedProposals).some(function (t) { return normalizeText(t) === given; });
}

/** Число: пробелы между разрядами, запятая или точка; знак препинания в конце и приписка «млрд» / «млрд ден. ед.» допускаются. */
function parseNumeric(response) {
  if (typeof response !== 'string') return null;
  var text = response.toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim()
    .replace(/[\s.,;]+$/, '')
    .replace(/\s*млрд(\s*ден\.?\s*ед\.?)?$/, '')
    .replace(/−/g, '-')
    .replace(/(\d)\s+(?=\d{3}\b)/g, '$1');
  if (!/^[+-]?\d+([.,]\d+)?$/.test(text)) return null;
  return Number(text.replace(',', '.'));
}

var LETTERS = 'АБВГДЕЖ';

/**
 * Оценка задания. response:
 *   multiple-select — массив номеров вариантов [1, 3, 5];
 *   short-text / numeric — строка;
 *   multi-field — объект { A: 'рыцарь', … } или { A: 3, … };
 *   matching — массив букв по позициям ['Е', 'Г', …] (null — не выбрано);
 *   essay — строка (не оценивается).
 * Возвращает { status, strict, diagnostic, max }:
 *   status — 'correct' | 'incorrect' | 'unanswered' | 'pending' (эссе);
 *   strict / diagnostic — баллы по схемам (null у эссе).
 */
function grade(task, response, approvedProposals) {
  var max = task.points;
  if (task.type === 'essay') {
    return { status: 'pending', strict: null, diagnostic: null, max: max };
  }
  if (isEmpty(task, response)) return { status: 'unanswered', strict: 0, diagnostic: 0, max: max };

  if (task.type === 'multiple-select') {
    var correct = [];
    task.options.forEach(function (o, i) { if (o.correct) correct.push(i + 1); });
    var chosen = Array.from(new Set(response));
    var missed = correct.filter(function (n) { return chosen.indexOf(n) === -1; }).length;
    var extra = chosen.filter(function (n) { return correct.indexOf(n) === -1; }).length;
    var mistakes = missed + extra;
    return { status: mistakes === 0 ? 'correct' : 'incorrect', strict: mistakes === 0 ? max : 0,
      diagnostic: mistakes === 0 ? max : (mistakes === 1 ? 2 : 0), max: max, missed: missed, extra: extra };
  }
  if (task.type === 'matching') {
    var right = task.items.filter(function (item, i) { return response[i] === item.match; }).length;
    var full = right === task.items.length;
    return { status: full ? 'correct' : 'incorrect', strict: full ? max : 0, diagnostic: right, max: max, rightPairs: right };
  }
  var ok;
  if (task.type === 'short-text') ok = checkShortText(task, response, approvedProposals);
  else if (task.type === 'numeric') ok = parseNumeric(response) === task.answer;
  else if (task.type === 'multi-field') {
    ok = task.fields.every(function (f) {
      var v = response[f.id];
      if (f.kind === 'integer') return typeof v === 'number' ? v === f.answer : parseNumeric(String(v)) === f.answer;
      return v === f.answer;
    });
  } else throw new Error('Неизвестный тип: ' + task.type);
  return { status: ok ? 'correct' : 'incorrect', strict: ok ? max : 0, diagnostic: ok ? max : 0, max: max };
}

function isEmpty(task, response) {
  if (response === null || response === undefined) return true;
  if (task.type === 'multiple-select') return !Array.isArray(response) || response.length === 0;
  if (task.type === 'matching') return !Array.isArray(response) || response.every(function (v) { return v === null || v === undefined; });
  if (task.type === 'multi-field') {
    return task.fields.every(function (f) { var v = response[f.id]; return v === null || v === undefined || String(v).trim() === ''; });
  }
  return typeof response !== 'string' || response.trim() === '';
}

/** Итоги по схеме: авто-баллы (из 90), баллы по дисциплинам; эссе отдельно и без баллов. */
function summarize(variant, responses, scheme) {
  var key = scheme || variant.scoring.main;
  var s = { points: 0, maxPoints: 0, correct: 0, incorrect: 0, unanswered: 0, essay: 'pending', byDiscipline: {} };
  variant.disciplines.forEach(function (d) { s.byDiscipline[d.id] = { points: 0, maxPoints: 0 }; });
  variant.tasks.forEach(function (task) {
    var g = grade(task, responses[task.number]);
    if (g.status === 'pending') return;
    s.points += g[key];
    s.maxPoints += g.max;
    s[g.status]++;
    var d = s.byDiscipline[task.discipline];
    d.points += g[key];
    d.maxPoints += g.max;
  });
  return s;
}

module.exports = { normalizeText: normalizeText, acceptedTexts: acceptedTexts, parseNumeric: parseNumeric,
  grade: grade, isEmpty: isEmpty, summarize: summarize, LETTERS: LETTERS };
