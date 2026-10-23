/**
 * Олимпиады: тип задания multi-field — краткий ответ из нескольких полей.
 * Например: «A — рыцарь, B — лжец, C — лжец» (поля выбора) или распределение
 * мандатов 3–2–1–0 (целые числа). Ответ засчитывается, только если верны все поля.
 *
 * Задание: fields: [{ id, label, kind: 'choice' | 'integer', options? (для choice), answer }].
 * Ответ ученика: { A: 'рыцарь', B: null, … } или { A: '3', … } (ввод числа — строкой).
 *
 * Подключается после js/olymp/types.js и js/olymp/normalize.js.
 */
(function (root) {
  'use strict';

  var OLY = root.OLY || (root.OLY = {});
  var KINDS = ['choice', 'integer'];

  function isText(value) {
    return typeof value === 'string' && value.trim() !== '';
  }

  function blank(value) {
    return value === null || value === undefined || (typeof value === 'string' && value.trim() === '');
  }

  function integerOf(value) {
    var n = OLY.normalize.parseNumber(typeof value === 'number' ? value : String(value));
    return n !== null && Number.isInteger(n) ? n : null;
  }

  function fieldCorrect(field, value) {
    if (blank(value)) return false;
    return field.kind === 'integer' ? integerOf(value) === field.answer : value === field.answer;
  }

  OLY.types.register('multi-field', {
    validateTask: function (task) {
      var errors = [];
      if (!Array.isArray(task.fields) || task.fields.length === 0) return ['нужен непустой список fields'];
      var seen = Object.create(null);
      task.fields.forEach(function (f, i) {
        var name = 'fields[' + i + ']';
        if (!f || !isText(f.id)) { errors.push(name + ': нет id'); return; }
        if (seen[f.id]) errors.push(name + ': id ' + f.id + ' повторяется');
        seen[f.id] = true;
        if (!isText(f.label)) errors.push(name + ': нет label');
        if (KINDS.indexOf(f.kind) === -1) errors.push(name + ': kind должно быть одним из: ' + KINDS.join(', '));
        if (f.kind === 'choice') {
          if (!Array.isArray(f.options) || f.options.length < 2 || !f.options.every(isText)) errors.push(name + ': нужны варианты options');
          else if (f.options.indexOf(f.answer) === -1) errors.push(name + ': answer должен быть одним из вариантов');
        }
        if (f.kind === 'integer' && !Number.isInteger(f.answer)) errors.push(name + ': answer должен быть целым числом');
      });
      return errors;
    },
    emptyResponse: function (task) {
      var r = {};
      task.fields.forEach(function (f) { r[f.id] = null; });
      return r;
    },
    isEmpty: function (task, response) {
      if (!response || typeof response !== 'object') return true;
      return task.fields.every(function (f) { return blank(response[f.id]); });
    },
    isComplete: function (task, response) {
      if (!response || typeof response !== 'object') return false;
      return task.fields.every(function (f) { return !blank(response[f.id]); });
    },
    /** Только поля задания; пустое поле — null; выбор — из вариантов, число — строкой ввода. */
    cleanResponse: function (task, response) {
      if (!response || typeof response !== 'object' || Array.isArray(response)) throw new Error('Ответ должен быть объектом полей');
      var r = {};
      task.fields.forEach(function (f) {
        var v = response[f.id];
        if (blank(v)) { r[f.id] = null; return; }
        if (f.kind === 'choice') {
          if (f.options.indexOf(v) === -1) throw new Error('Недопустимое значение поля ' + f.id);
          r[f.id] = v;
        } else {
          if (typeof v !== 'string' && typeof v !== 'number') throw new Error('Поле ' + f.id + ': ожидается число');
          r[f.id] = String(v).trim();
        }
      });
      return r;
    },
    /** details.perField — верно ли каждое поле; details.mistakes — число неверных (в том числе пустых). */
    check: function (task, response) {
      var perField = {};
      var mistakes = 0;
      task.fields.forEach(function (f) {
        perField[f.id] = fieldCorrect(f, response[f.id]);
        if (!perField[f.id]) mistakes++;
      });
      return { verdict: mistakes === 0 ? 'correct' : 'incorrect', details: { perField: perField, mistakes: mistakes } };
    },
    getCorrect: function (task) {
      var r = {};
      task.fields.forEach(function (f) { r[f.id] = f.kind === 'integer' ? String(f.answer) : f.answer; });
      return r;
    },
    formatResponse: function (task, response) {
      if (!response || typeof response !== 'object') return '—';
      return task.fields.map(function (f) {
        return f.label + ' — ' + (blank(response[f.id]) ? '?' : String(response[f.id]));
      }).join(', ');
    }
  });
})(typeof window !== 'undefined' ? window : globalThis);
