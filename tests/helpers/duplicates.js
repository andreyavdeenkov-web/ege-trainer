'use strict';

/**
 * Поиск дублей в банке ЕГЭ.
 * Точный дубль — задание того же типа с тем же набором суждений
 * (или позиций и вариантов соответствия) после нормализации текста;
 * порядок суждений не важен. Повтор источника — два задания из пособия
 * с одинаковыми названием и местом (source.title + source.ref).
 * Повторяющиеся суждения в разных заданиях — только предупреждение:
 * в пособиях суждения переходят из задания в задание, это допустимо.
 */

/** Нижний регистр, ё → е, без пунктуации и лишних пробелов. */
function normalize(text) {
  return String(text)
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function taskType(task) {
  return task.type || 'multiple';
}

/** Тексты задания, по которым сравниваются дубли. */
function texts(task) {
  if (taskType(task) === 'matching') {
    return (task.items || []).map((i) => 'item:' + normalize(i.text))
      .concat((task.options || []).map((o) => 'option:' + normalize(o)));
  }
  return (task.statements || []).map((s) => normalize(s.text));
}

function fingerprint(task) {
  return taskType(task) + '|' + texts(task).slice().sort().join('|');
}

/** Пары точных дублей: [[id1, id2], ...]. */
function exactDuplicates(tasks) {
  const seen = new Map();
  const pairs = [];
  for (const task of tasks) {
    const fp = fingerprint(task);
    if (seen.has(fp)) pairs.push([seen.get(fp), task.id]);
    else seen.set(fp, task.id);
  }
  return pairs;
}

/** Пары заданий с одинаковым источником (название + место в пособии). */
function repeatedSources(tasks) {
  const seen = new Map();
  const pairs = [];
  for (const task of tasks) {
    const src = task.source;
    if (!src || src.kind !== 'original' || !src.ref) continue;
    const key = normalize(src.title) + '|' + normalize(src.ref);
    if (seen.has(key)) pairs.push([seen.get(key), task.id]);
    else seen.set(key, task.id);
  }
  return pairs;
}

/** Суждения (multiple, exclude-two), которые встречаются в нескольких заданиях: [{ text, ids }]. */
function repeatedStatements(tasks) {
  const byText = new Map();
  for (const task of tasks) {
    if (taskType(task) === 'matching') continue;
    for (const s of task.statements || []) {
      const key = normalize(s.text);
      if (!key) continue;
      const ids = byText.get(key) || [];
      if (!ids.includes(task.id)) ids.push(task.id);
      byText.set(key, ids);
    }
  }
  return [...byText].filter(([, ids]) => ids.length > 1).map(([text, ids]) => ({ text, ids }));
}

module.exports = { normalize, fingerprint, exactDuplicates, repeatedSources, repeatedStatements };
