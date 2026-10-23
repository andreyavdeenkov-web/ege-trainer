/**
 * Олимпиады: тип задания essay — мини-эссе. Автоматически не оценивается:
 * проверка возвращает вердикт 'ungraded' («не оценивалось»), а не «неверно»,
 * и баллы не начисляются (критерии scoring у эссе — null). Оценку выставляет
 * преподаватель; пока такого интерфейса нет, ученик видит критерии и образцы.
 *
 * Задание: limits?: { sentences, words } — ограничения, которые показываются ученику.
 * Ответ ученика: строка.
 */
(function (root) {
  'use strict';

  var OLY = root.OLY || (root.OLY = {});

  function blank(value) {
    return typeof value !== 'string' || value.trim() === '';
  }

  /** Число слов: последовательности букв или цифр (дефисные слова — одно слово). */
  function countWords(text) {
    if (typeof text !== 'string') return 0;
    var words = text.match(/[0-9A-Za-zА-Яа-яЁё]+(?:[-‐–'’][0-9A-Za-zА-Яа-яЁё]+)*/g);
    return words ? words.length : 0;
  }

  OLY.types.register('essay', {
    validateTask: function (task) {
      var errors = [];
      if (task.limits !== undefined) {
        var l = task.limits;
        if (!l || typeof l !== 'object') errors.push('limits должно быть объектом');
        else {
          ['sentences', 'words'].forEach(function (k) {
            if (l[k] !== undefined && !(Number.isInteger(l[k]) && l[k] > 0)) errors.push('limits.' + k + ' должно быть целым числом');
          });
        }
      }
      return errors;
    },
    emptyResponse: function () { return ''; },
    isEmpty: function (task, response) { return blank(response); },
    isComplete: function (task, response) { return !blank(response); },
    cleanResponse: function (task, response) {
      if (typeof response !== 'string') throw new Error('Ответ должен быть строкой');
      return response;
    },
    check: function (task, response) {
      return { verdict: 'ungraded', details: { words: countWords(response) } };
    },
    getCorrect: function () { return null; },
    formatResponse: function (task, response) {
      return blank(response) ? '—' : response.trim();
    }
  });

  OLY.types.countWords = countWords;
})(typeof window !== 'undefined' ? window : globalThis);
