'use strict';

/**
 * Правила схемы 2 банка ЕГЭ. Каждая функция возвращает список ошибок
 * (пустой — задание корректно), чтобы правила можно было проверить
 * и на банке, и на специально испорченных примерах.
 */

const SOURCE_FIELDS = ['kind', 'title', 'authors', 'year', 'ref', 'adapted'];
/** Объяснение для новых заданий: не короче этого числа символов после «Верно.»/«Неверно.» и т. п. */
const MIN_EXPLANATION = 25;

const isText = (v) => typeof v === 'string' && v.trim().length > 0;

/** Необязательные поля схемы 2 — для любого задания, старого или нового. */
function metadataErrors(EGE, task) {
  const errors = [];
  const type = EGE.scoring.getTaskType(task);

  if (task.source !== undefined) {
    const src = task.source;
    if (!src || typeof src !== 'object' || Array.isArray(src)) {
      errors.push('source — объект');
    } else {
      Object.keys(src).forEach((k) => {
        if (!SOURCE_FIELDS.includes(k)) errors.push(`source: неизвестное поле ${k}`);
      });
      if (!EGE.SOURCE_KINDS.includes(src.kind)) errors.push(`source.kind — одно из: ${EGE.SOURCE_KINDS.join(', ')}`);
      if (src.kind === 'original' && !isText(src.title)) errors.push('source.title обязателен для задания из пособия');
      ['title', 'authors', 'ref'].forEach((k) => {
        if (src[k] !== undefined && !isText(src[k])) errors.push(`source.${k} — непустая строка`);
      });
      if (src.year !== undefined && !(Number.isInteger(src.year) && src.year >= 1990 && src.year <= 2100)) {
        errors.push('source.year — год числом');
      }
      if (src.adapted !== undefined && typeof src.adapted !== 'boolean') errors.push('source.adapted — true/false');
    }
  }

  if (task.difficulty !== undefined && !EGE.DIFFICULTY_LEVELS.includes(task.difficulty)) {
    errors.push(`difficulty — одно из: ${EGE.DIFFICULTY_LEVELS.join(', ')}`);
  }

  if (task.commonFeature !== undefined) {
    if (type !== 'exclude-two') errors.push('commonFeature бывает только у exclude-two');
    else if (!isText(task.commonFeature)) errors.push('commonFeature — непустая строка');
  }

  const parts = type === 'matching' ? task.items || [] : task.statements || [];
  parts.forEach((p, i) => {
    if (p.mistake !== undefined && !isText(p.mistake)) errors.push(`позиция ${i + 1}: mistake — непустая строка`);
  });
  return errors;
}

/**
 * Строгие правила для новых заданий (не из снимка tests/fixtures/legacy-tasks.json):
 * формат ЕГЭ и содержательные объяснения всех вариантов.
 */
function newTaskErrors(EGE, task) {
  const errors = [];
  const type = EGE.scoring.getTaskType(task);
  if (!task.source) errors.push('у нового задания нужен source (пособие или авторское)');

  const explained = (text, prefix) => {
    if (!isText(text)) return false;
    const body = prefix && text.startsWith(prefix) ? text.slice(prefix.length) : text;
    return body.trim().length >= MIN_EXPLANATION;
  };

  if (type === 'matching') {
    if (task.items.length < 2) errors.push('не меньше двух позиций');
    task.items.forEach((item, i) => {
      if (!explained(item.explanation)) errors.push(`позиция ${i + 1}: нужно содержательное объяснение`);
    });
    return errors;
  }

  const prefixes = type === 'exclude-two' ? ['Выпадает.', 'Не выпадает.'] : ['Верно.', 'Неверно.'];
  task.statements.forEach((s, i) => {
    const prefix = s.correct ? prefixes[0] : prefixes[1];
    if (!explained(s.explanation, prefix)) errors.push(`суждение ${i + 1}: нужно содержательное объяснение`);
  });

  const correct = EGE.scoring.getCorrectNumbers(task).length;
  if (type === 'multiple') {
    if (task.statements.length < 5 || task.statements.length > 6) errors.push('multiple: 5 или 6 вариантов');
    if (correct < 2 || correct > 4) errors.push('multiple: верных вариантов 2, 3 или 4');
  } else if (type === 'exclude-two') {
    if (task.statements.length !== 6) errors.push('exclude-two: ровно 6 позиций');
    if (!isText(task.commonFeature)) errors.push('exclude-two: нужен commonFeature — общий признак ряда');
  }
  return errors;
}

module.exports = { metadataErrors, newTaskErrors, MIN_EXPLANATION };
