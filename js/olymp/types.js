/**
 * Олимпиады: реестр типов заданий. Чистые функции без зависимостей от DOM.
 *
 * Тип (task.type) — только способ взаимодействия ученика с заданием и проверка
 * ответа по ключу. Баллы тип не определяет: за них отвечают task.scoring
 * и правила из js/olymp/scoring-rules.js.
 *
 * Контракт типа (все функции обязательны):
 *   validateTask(task)          → массив текстов ошибок данных (пустой — всё верно);
 *   emptyResponse(task)         → пустой ответ;
 *   isEmpty(task, response)     → ученик ещё ничего не ввёл;
 *   isComplete(task, response)  → ответ заполнен полностью;
 *   cleanResponse(task, resp)   → ответ в каноническом виде, бросает ошибку при
 *                                 некорректной структуре (неполный ответ допустим);
 *   check(task, response)       → { verdict: 'correct' | 'incorrect', details };
 *   getCorrect(task)            → правильный ответ в формате ответа ученика;
 *   formatResponse(task, resp)  → ответ строкой для разбора.
 *
 * Новый тип добавляется вызовом OLY.types.register(name, definition).
 */
(function (root) {
  'use strict';

  var OLY = root.OLY || (root.OLY = {});
  var normalize = OLY.normalize;

  var REQUIRED = ['validateTask', 'emptyResponse', 'isEmpty', 'isComplete',
    'cleanResponse', 'check', 'getCorrect', 'formatResponse'];
  var LETTERS = 'АБВГДЕЖЗИКЛМНОПРСТ';

  var registry = Object.create(null);

  function register(name, definition) {
    if (!/^[a-z][a-z-]*$/.test(name)) throw new Error('Некорректное имя типа: ' + name);
    if (registry[name]) throw new Error('Тип уже зарегистрирован: ' + name);
    REQUIRED.forEach(function (fn) {
      if (typeof definition[fn] !== 'function') {
        throw new Error('Тип ' + name + ': нет функции ' + fn);
      }
    });
    registry[name] = definition;
  }

  function has(name) {
    return !!registry[name];
  }

  function get(name) {
    var type = registry[name];
    if (!type) throw new Error('Неизвестный тип задания: ' + name);
    return type;
  }

  function list() {
    return Object.keys(registry);
  }

  /* ---------- Общие проверки ---------- */

  function isText(value) {
    return typeof value === 'string' && value.trim() !== '';
  }

  function isOptionalText(value) {
    return value === undefined || typeof value === 'string';
  }

  /** Буква позиции по номеру с 1: 1 → «А». */
  function letter(n) {
    return LETTERS.charAt(n - 1) || String(n);
  }

  /** Варианты выбора: [{ text, correct, explanation? }]. */
  function validateChoiceOptions(task) {
    var errors = [];
    if (!Array.isArray(task.options) || task.options.length < 2) {
      return ['нужно не меньше двух вариантов в options'];
    }
    task.options.forEach(function (option, i) {
      var n = i + 1;
      if (!option || !isText(option.text)) errors.push('вариант ' + n + ': нет текста');
      else if (typeof option.correct !== 'boolean') errors.push('вариант ' + n + ': correct должно быть true или false');
      else if (!isOptionalText(option.explanation)) errors.push('вариант ' + n + ': explanation должно быть строкой');
    });
    return errors;
  }

  function correctNumbers(task) {
    var result = [];
    task.options.forEach(function (option, i) {
      if (option.correct) result.push(i + 1);
    });
    return result;
  }

  function checkOptionNumber(task, n) {
    if (!Number.isInteger(n) || n < 1 || n > task.options.length) {
      throw new Error('Некорректный номер варианта: ' + n);
    }
  }

  function formatNumbers(numbers) {
    return numbers && numbers.length ? numbers.join(', ') : '—';
  }

  function isBlank(value) {
    return typeof value !== 'string' || value.trim() === '';
  }

  /* ---------- single-select: выбрать один вариант ---------- */

  register('single-select', {
    validateTask: function (task) {
      var errors = validateChoiceOptions(task);
      if (errors.length === 0 && correctNumbers(task).length !== 1) {
        errors.push('должен быть ровно один верный вариант');
      }
      return errors;
    },
    emptyResponse: function () { return null; },
    isEmpty: function (task, response) { return response === null || response === undefined; },
    isComplete: function (task, response) { return response !== null && response !== undefined; },
    cleanResponse: function (task, response) {
      checkOptionNumber(task, response);
      return response;
    },
    check: function (task, response) {
      var correct = correctNumbers(task)[0];
      return { verdict: response === correct ? 'correct' : 'incorrect', details: { selected: response } };
    },
    getCorrect: function (task) { return correctNumbers(task)[0]; },
    formatResponse: function (task, response) {
      return response === null || response === undefined ? '—' : String(response);
    }
  });

  /* ---------- multiple-select: выбрать все верные варианты ---------- */

  register('multiple-select', {
    validateTask: function (task) {
      var errors = validateChoiceOptions(task);
      if (errors.length === 0 && correctNumbers(task).length === 0) {
        errors.push('нужен хотя бы один верный вариант');
      }
      return errors;
    },
    emptyResponse: function () { return []; },
    isEmpty: function (task, response) { return !Array.isArray(response) || response.length === 0; },
    isComplete: function (task, response) { return Array.isArray(response) && response.length > 0; },
    cleanResponse: function (task, response) {
      if (!Array.isArray(response)) throw new Error('Ответ должен быть списком номеров');
      response.forEach(function (n) { checkOptionNumber(task, n); });
      return Array.from(new Set(response)).sort(function (a, b) { return a - b; });
    },
    /** details.missed — пропущенные верные, details.extra — выбранные лишние. */
    check: function (task, response) {
      var correct = correctNumbers(task);
      var selected = new Set(response);
      var missed = correct.filter(function (n) { return !selected.has(n); });
      var extra = response.filter(function (n) { return correct.indexOf(n) === -1; });
      var mistakes = missed.length + extra.length;
      return {
        verdict: mistakes === 0 ? 'correct' : 'incorrect',
        details: { mistakes: mistakes, missed: missed, extra: extra }
      };
    },
    getCorrect: function (task) { return correctNumbers(task); },
    formatResponse: function (task, response) { return formatNumbers(response); }
  });

  /* ---------- short-text: краткий текстовый ответ ---------- */

  var SHORT_TEXT_NORMALIZE_KEYS = ['yo'];

  register('short-text', {
    /**
     * acceptedAnswers — все допустимые ответы, их задаёт преподаватель;
     * normalize — необязательные дополнительные настройки: { yo: true } — ё = е.
     */
    validateTask: function (task) {
      var errors = [];
      if (!Array.isArray(task.acceptedAnswers) || task.acceptedAnswers.length === 0) {
        return ['нужен непустой список acceptedAnswers'];
      }
      var seen = Object.create(null);
      task.acceptedAnswers.forEach(function (answer, i) {
        if (!isText(answer)) {
          errors.push('acceptedAnswers[' + i + ']: пустой ответ');
          return;
        }
        var key = normalize.normalizeText(answer, task.normalize);
        if (seen[key]) errors.push('acceptedAnswers: ответ «' + answer + '» после нормализации повторяет другой');
        seen[key] = true;
      });
      if (task.normalize !== undefined) {
        if (!task.normalize || typeof task.normalize !== 'object' || Array.isArray(task.normalize)) {
          errors.push('normalize должно быть объектом');
        } else {
          Object.keys(task.normalize).forEach(function (key) {
            if (SHORT_TEXT_NORMALIZE_KEYS.indexOf(key) === -1) errors.push('normalize: неизвестная настройка ' + key);
            else if (typeof task.normalize[key] !== 'boolean') errors.push('normalize.' + key + ' должно быть true или false');
          });
        }
      }
      return errors;
    },
    emptyResponse: function () { return ''; },
    isEmpty: function (task, response) { return isBlank(response); },
    isComplete: function (task, response) { return !isBlank(response); },
    cleanResponse: function (task, response) {
      if (typeof response !== 'string') throw new Error('Ответ должен быть строкой');
      return response;
    },
    /** details.matched — допустимый ответ из данных, с которым совпал ввод, или null. */
    check: function (task, response) {
      var given = normalize.normalizeText(response, task.normalize);
      var matched = null;
      task.acceptedAnswers.some(function (answer) {
        if (normalize.normalizeText(answer, task.normalize) === given) {
          matched = answer;
          return true;
        }
        return false;
      });
      return {
        verdict: matched !== null ? 'correct' : 'incorrect',
        details: { normalized: given, matched: matched }
      };
    },
    getCorrect: function (task) { return task.acceptedAnswers.slice(); },
    formatResponse: function (task, response) {
      return isBlank(response) ? '—' : response.replace(/\s+/g, ' ').trim();
    }
  });

  /* ---------- numeric: числовой ответ ---------- */

  var EPSILON = 1e-9;

  register('numeric', {
    /** answer — число; tolerance — допустимое отклонение (по умолчанию 0); unit — подпись. */
    validateTask: function (task) {
      var errors = [];
      if (typeof task.answer !== 'number' || !isFinite(task.answer)) errors.push('answer должно быть числом');
      if (task.tolerance !== undefined &&
          (typeof task.tolerance !== 'number' || !isFinite(task.tolerance) || task.tolerance < 0)) {
        errors.push('tolerance должно быть неотрицательным числом');
      }
      if (!isOptionalText(task.unit)) errors.push('unit должно быть строкой');
      return errors;
    },
    emptyResponse: function () { return ''; },
    isEmpty: function (task, response) { return isBlank(response); },
    isComplete: function (task, response) { return normalize.parseNumber(response) !== null; },
    cleanResponse: function (task, response) {
      if (typeof response !== 'string') throw new Error('Ответ должен быть строкой');
      return response;
    },
    /** Ввод, который не удалось прочитать как число, — неверный ответ (details.value = null). */
    check: function (task, response) {
      var value = normalize.parseNumber(response);
      var ok = value !== null && Math.abs(value - task.answer) <= (task.tolerance || 0) + EPSILON;
      return { verdict: ok ? 'correct' : 'incorrect', details: { value: value } };
    },
    getCorrect: function (task) { return task.answer; },
    formatResponse: function (task, response) {
      return isBlank(response) ? '—' : response.trim();
    }
  });

  /* ---------- matching: установить соответствие ---------- */

  register('matching', {
    /**
     * items — позиции А, Б, В… ({ text, match, explanation? }), match — номер
     * варианта из options (с 1); oneToOne — каждый вариант используется один раз.
     * Формат совпадает с заданиями matching тренажёра ЕГЭ.
     */
    validateTask: function (task) {
      var errors = [];
      if (!Array.isArray(task.options) || task.options.length < 2) errors.push('нужно не меньше двух вариантов в options');
      if (!Array.isArray(task.items) || task.items.length < 2) errors.push('нужно не меньше двух позиций в items');
      if (errors.length) return errors;
      task.options.forEach(function (option, i) {
        if (!isText(option)) errors.push('options[' + i + ']: нет текста');
      });
      task.items.forEach(function (item, i) {
        var name = 'позиция ' + letter(i + 1);
        if (!item || !isText(item.text)) errors.push(name + ': нет текста');
        else if (!Number.isInteger(item.match) || item.match < 1 || item.match > task.options.length) {
          errors.push(name + ': match должен быть номером варианта от 1 до ' + task.options.length);
        } else if (!isOptionalText(item.explanation)) errors.push(name + ': explanation должно быть строкой');
      });
      if (errors.length === 0 && task.oneToOne) {
        var matches = task.items.map(function (item) { return item.match; });
        if (new Set(matches).size !== matches.length) errors.push('oneToOne: номера в ключе повторяются');
      }
      return errors;
    },
    emptyResponse: function (task) {
      return task.items.map(function () { return null; });
    },
    isEmpty: function (task, response) {
      return !Array.isArray(response) || response.every(function (n) { return n === null || n === undefined; });
    },
    isComplete: function (task, response) {
      return Array.isArray(response) && response.length === task.items.length &&
        response.every(function (n) { return n !== null && n !== undefined; });
    },
    /** Незаполненные позиции (null) допустимы: при проверке они считаются ошибками. */
    cleanResponse: function (task, response) {
      if (!Array.isArray(response) || response.length !== task.items.length) {
        throw new Error('Ответ должен содержать по номеру на каждую позицию');
      }
      var cleaned = response.map(function (n) {
        if (n === null || n === undefined) return null;
        checkOptionNumber(task, n);
        return n;
      });
      if (task.oneToOne) {
        var filled = cleaned.filter(function (n) { return n !== null; });
        if (new Set(filled).size !== filled.length) throw new Error('Каждый вариант можно использовать только один раз');
      }
      return cleaned;
    },
    /** details.perItem — верна ли каждая позиция; details.mistakes — число неверных. */
    check: function (task, response) {
      var perItem = task.items.map(function (item, i) { return response[i] === item.match; });
      var mistakes = perItem.filter(function (ok) { return !ok; }).length;
      return {
        verdict: mistakes === 0 ? 'correct' : 'incorrect',
        details: { mistakes: mistakes, perItem: perItem }
      };
    },
    getCorrect: function (task) {
      return task.items.map(function (item) { return item.match; });
    },
    formatResponse: function (task, response) {
      if (!Array.isArray(response) || response.length === 0) return '—';
      return response.map(function (n, i) {
        return letter(i + 1) + ' — ' + (n === null || n === undefined ? '?' : n);
      }).join(', ');
    }
  });

  OLY.types = {
    register: register,
    has: has,
    get: get,
    list: list,
    letter: letter
  };
})(typeof window !== 'undefined' ? window : globalThis);
