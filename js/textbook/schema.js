/**
 * Учебник: типы блоков и проверка их данных. Чистые функции (работают и в Node.js).
 *
 * Глава состоит из разделов, раздел — из блоков: { type: 'text', text: '…' }.
 * Здесь для каждого типа описано, какие поля он принимает и какие из его
 * элементов требуют ответа ученика. Как блок выглядит — отдельно, в
 * js/textbook/ui/blocks/*.js (реестр TXT.ui.blocks). Новый тип:
 *
 *   TXT.schema.register('type', {
 *     fields: ['id', 'prompt', …],        // допустимые поля (кроме type)
 *     validate: function (block, v) {},   // v — помощник проверки, см. makeChecker
 *     keys: function (block) { return ['item-id']; },  // элементы, требующие ответа
 *     graded: true,                       // ответы бывают верными и неверными
 *     refs: function (block) { return ['section-id']; } // ссылки на разделы главы
 *   });
 *
 * keys: '' — один ответ на весь блок. Блок, у которого есть keys, обязан иметь id.
 */
(function (root) {
  'use strict';

  var TXT = root.TXT || (root.TXT = {});

  var ID_PATTERN = /^[a-z][a-z0-9-]*$/;
  var types = Object.create(null);

  function isObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  /** Помощник проверки: собирает ошибки с путём к полю («blocks[2].items[0].text»). */
  function makeChecker(errors, prefix) {
    function where(field) {
      return prefix + (field === undefined || field === null ? '' : (typeof field === 'number' ? '[' + field + ']' : '.' + field));
    }
    function error(field, message) {
      errors.push(where(field) + ': ' + message);
    }
    function inlineErrors(field, value) {
      TXT.inline.errors(value).forEach(function (e) { error(field, e); });
    }

    var v = {
      error: error,
      /** Дочерний помощник для вложенного объекта. */
      at: function (field) { return makeChecker(errors, where(field)); },
      /** Лишние поля — почти всегда опечатка автора. */
      fields: function (obj, allowed) {
        if (!isObject(obj)) { error(null, 'ожидается объект'); return false; }
        Object.keys(obj).forEach(function (key) {
          if (allowed.indexOf(key) === -1) error(key, 'неизвестное поле');
        });
        return true;
      },
      /** Текст с разметкой (**…**, [[…|…]]); multi — можно массив абзацев. */
      text: function (obj, field, opts) {
        opts = opts || {};
        var value = obj[field];
        if (value === undefined && opts.optional) return;
        if (opts.multi && Array.isArray(value)) {
          if (value.length === 0) error(field, 'пустой список абзацев');
          value.forEach(function (p, i) {
            if (typeof p !== 'string' || !p.trim()) error(field + '[' + i + ']', 'ожидается непустая строка');
            else inlineErrors(field + '[' + i + ']', p);
          });
          return;
        }
        if (typeof value !== 'string' || !value.trim()) {
          error(field, opts.multi ? 'ожидается строка или массив строк' : 'ожидается непустая строка');
          return;
        }
        inlineErrors(field, value);
      },
      /** Короткая подпись без разметки. */
      label: function (obj, field, opts) {
        var value = obj[field];
        if (value === undefined && opts && opts.optional) return;
        if (typeof value !== 'string' || !value.trim()) { error(field, 'ожидается непустая строка'); return; }
        if (/\*\*|\[\[/.test(value)) error(field, 'разметка в подписи не допускается');
      },
      id: function (obj, field, opts) {
        var value = obj[field];
        if (value === undefined && opts && opts.optional) return;
        if (typeof value !== 'string' || !ID_PATTERN.test(value)) {
          error(field, 'ожидается id из латинских строчных букв, цифр и дефисов');
        }
      },
      bool: function (obj, field) {
        if (obj[field] !== undefined && typeof obj[field] !== 'boolean') error(field, 'ожидается true или false');
      },
      oneOf: function (obj, field, values, opts) {
        var value = obj[field];
        if (value === undefined && opts && opts.optional) return;
        if (values.indexOf(value) === -1) error(field, 'ожидается одно из: ' + values.join(', '));
      },
      int: function (obj, field, min, max) {
        var value = obj[field];
        if (typeof value !== 'number' || value % 1 !== 0 || value < min || value > max) {
          error(field, 'ожидается целое число от ' + min + ' до ' + max);
        }
      },
      /** Массив не короче min; возвращает его (или [] при ошибке). */
      list: function (obj, field, min, opts) {
        var value = obj[field];
        if (value === undefined && opts && opts.optional) return [];
        if (!Array.isArray(value) || value.length < min) {
          error(field, 'ожидается массив не короче ' + min);
          return [];
        }
        return value;
      },
      /** Список текстов с разметкой (или подписей при opts.label); возвращает его. */
      strings: function (obj, field, min, opts) {
        opts = opts || {};
        var value = obj[field];
        if (value === undefined && opts.optional) return [];
        if (!Array.isArray(value) || value.length < min) {
          error(field, 'ожидается массив строк не короче ' + min);
          return [];
        }
        value.forEach(function (item, i) {
          var name = field + '[' + i + ']';
          if (typeof item !== 'string' || !item.trim()) { error(name, 'ожидается непустая строка'); return; }
          if (opts.label) {
            if (/\*\*|\[\[/.test(item)) error(name, 'разметка в подписи не допускается');
          } else {
            inlineErrors(name, item);
          }
        });
        return value;
      },
      /** id элементов списка уникальны. */
      uniqueIds: function (items, field) {
        var seen = Object.create(null);
        items.forEach(function (item, i) {
          if (!isObject(item) || typeof item.id !== 'string') return;
          if (seen[item.id]) error(field + '[' + i + ']', 'повторяющийся id ' + item.id);
          seen[item.id] = true;
        });
      }
    };
    return v;
  }

  function register(name, def) {
    if (types[name]) throw new Error('Тип блока уже зарегистрирован: ' + name);
    if (!Array.isArray(def.fields) || typeof def.validate !== 'function') {
      throw new Error('Тип блока ' + name + ': нужны fields и validate');
    }
    types[name] = {
      fields: ['type'].concat(def.fields),
      validate: def.validate,
      keys: def.keys || function () { return []; },
      graded: !!def.graded,
      refs: def.refs || function () { return []; }
    };
  }

  /** Проверяет блок; возвращает список ошибок. */
  function validateBlock(block, prefix) {
    var errors = [];
    var v = makeChecker(errors, prefix || 'block');
    if (!isObject(block)) { v.error(null, 'ожидается объект'); return errors; }
    var def = types[block.type];
    if (!def) { v.error('type', 'неизвестный тип блока «' + block.type + '»'); return errors; }
    v.fields(block, def.fields);
    if (def.keys(block).length > 0 || def.fields.indexOf('id') !== -1) v.id(block, 'id');
    def.validate(block, v);
    return errors;
  }

  /* ---------- Общие части ---------- */

  /** Варианты ответа: { text, correct, explanation? }. */
  function checkOptions(v, obj, field, kind, needExplanation) {
    var options = v.list(obj, field, 2);
    var correct = 0;
    options.forEach(function (o, i) {
      var ov = v.at(field).at(i);
      if (!ov.fields(o, ['text', 'correct', 'explanation'])) return;
      ov.text(o, 'text');
      if (typeof o.correct !== 'boolean') ov.error('correct', 'ожидается true или false');
      ov.text(o, 'explanation', { optional: !needExplanation });
      if (o.correct === true) correct += 1;
    });
    if (options.length === 0) return;
    if (kind === 'single' && correct !== 1) v.error(field, 'в вопросе с одним ответом должен быть ровно один верный вариант');
    if (kind === 'multiple' && (correct === 0 || correct === options.length)) {
      v.error(field, 'нужен хотя бы один верный и хотя бы один неверный вариант');
    }
  }

  function ids(list) {
    return (Array.isArray(list) ? list : []).map(function (item) { return item && item.id; });
  }

  /* ---------- Текст ---------- */

  register('heading', {
    fields: ['text'],
    validate: function (b, v) { v.label(b, 'text'); }
  });

  /** Крупная фраза-проблема в начале раздела. */
  register('lead', {
    fields: ['kicker', 'text'],
    validate: function (b, v) {
      v.label(b, 'kicker', { optional: true });
      v.text(b, 'text');
    }
  });

  register('text', {
    fields: ['text'],
    validate: function (b, v) { v.text(b, 'text', { multi: true }); }
  });

  /** Врезка: пример, ловушка, заметка, главное, цитата. */
  register('callout', {
    fields: ['variant', 'title', 'text', 'items', 'source'],
    validate: function (b, v) {
      v.oneOf(b, 'variant', ['example', 'trap', 'note', 'key', 'quote']);
      v.label(b, 'title', { optional: true });
      v.text(b, 'text', { optional: true, multi: true });
      v.strings(b, 'items', 1, { optional: true });
      v.label(b, 'source', { optional: true });
      if (b.text === undefined && b.items === undefined) v.error(null, 'нужен text или items');
    }
  });

  register('definition', {
    fields: ['term', 'text', 'source'],
    validate: function (b, v) {
      v.label(b, 'term');
      v.text(b, 'text');
      v.label(b, 'source', { optional: true });
    }
  });

  /** Раскрывающиеся пояснения (аккордеон). */
  register('reveal', {
    fields: ['title', 'items'],
    validate: function (b, v) {
      v.label(b, 'title', { optional: true });
      v.list(b, 'items', 1).forEach(function (item, i) {
        var iv = v.at('items').at(i);
        if (!iv.fields(item, ['title', 'text'])) return;
        iv.label(item, 'title');
        iv.text(item, 'text', { multi: true });
      });
    }
  });

  /** «Подумайте»: вопрос, ответ открывается по нажатию. Не оценивается. */
  register('think', {
    fields: ['id', 'prompt', 'answer'],
    validate: function (b, v) {
      v.text(b, 'prompt');
      v.text(b, 'answer', { multi: true });
    }
  });

  /** Сравнение понятий: строки — критерии, столбцы — понятия. */
  register('compare', {
    fields: ['caption', 'corner', 'columns', 'rows'],
    validate: function (b, v) {
      v.label(b, 'caption', { optional: true });
      v.label(b, 'corner', { optional: true });
      var columns = v.strings(b, 'columns', 2, { label: true });
      v.list(b, 'rows', 1).forEach(function (row, i) {
        var rv = v.at('rows').at(i);
        if (!rv.fields(row, ['label', 'cells'])) return;
        rv.label(row, 'label');
        var cells = rv.strings(row, 'cells', 1);
        if (cells.length && cells.length !== columns.length) rv.error('cells', 'ячеек должно быть столько же, сколько столбцов');
      });
    }
  });

  /* ---------- Интерактив ---------- */

  /** Предположение: верных ответов нет, после выбора — отклик на каждый вариант и вывод. */
  register('predict', {
    fields: ['id', 'prompt', 'options', 'after'],
    validate: function (b, v) {
      v.text(b, 'prompt');
      v.list(b, 'options', 2).forEach(function (o, i) {
        var ov = v.at('options').at(i);
        if (!ov.fields(o, ['text', 'response'])) return;
        ov.text(o, 'text');
        ov.text(o, 'response');
      });
      v.text(b, 'after', { optional: true, multi: true });
    },
    keys: function () { return ['']; }
  });

  /** Сборка определения: отметить фрагменты, которые в него входят. */
  register('assemble', {
    fields: ['id', 'prompt', 'fragments', 'result'],
    validate: function (b, v) {
      v.text(b, 'prompt');
      var fragments = v.list(b, 'fragments', 3);
      var yes = 0;
      fragments.forEach(function (f, i) {
        var fv = v.at('fragments').at(i);
        if (!fv.fields(f, ['text', 'belongs', 'explanation'])) return;
        fv.text(f, 'text');
        if (typeof f.belongs !== 'boolean') fv.error('belongs', 'ожидается true или false');
        fv.text(f, 'explanation');
        if (f.belongs === true) yes += 1;
      });
      if (fragments.length && (yes === 0 || yes === fragments.length)) {
        v.error('fragments', 'нужны и входящие в определение фрагменты, и лишние');
      }
      var rv = v.at('result');
      if (rv.fields(b.result, ['term', 'text'])) {
        rv.label(b.result, 'term');
        rv.text(b.result, 'text');
      }
    },
    keys: function () { return ['']; },
    graded: true
  });

  /** Классификация ситуаций по одной, с объяснением сразу после выбора. */
  register('classify', {
    fields: ['id', 'prompt', 'options', 'items'],
    validate: function (b, v) {
      v.text(b, 'prompt');
      var options = v.strings(b, 'options', 2, { label: true });
      var items = v.list(b, 'items', 2);
      items.forEach(function (item, i) {
        var iv = v.at('items').at(i);
        if (!iv.fields(item, ['id', 'text', 'answer', 'explanation'])) return;
        iv.id(item, 'id');
        iv.text(item, 'text');
        iv.int(item, 'answer', 0, Math.max(0, options.length - 1));
        iv.text(item, 'explanation');
      });
      v.uniqueIds(items, 'items');
    },
    keys: function (b) { return ids(b.items); },
    graded: true
  });

  /** Соответствие: каждой позиции — вариант из общего списка. */
  register('match', {
    fields: ['id', 'prompt', 'situation', 'options', 'items'],
    validate: function (b, v) {
      v.text(b, 'prompt');
      v.text(b, 'situation', { optional: true, multi: true });
      var options = v.strings(b, 'options', 2, { label: true });
      v.list(b, 'items', 2).forEach(function (item, i) {
        var iv = v.at('items').at(i);
        if (!iv.fields(item, ['text', 'match', 'explanation'])) return;
        iv.text(item, 'text');
        iv.int(item, 'match', 0, Math.max(0, options.length - 1));
        iv.text(item, 'explanation');
      });
    },
    keys: function () { return ['']; },
    graded: true
  });

  /** Вопросы с выбором ответа: мини-проверка или финальная проверка главы. */
  register('quiz', {
    fields: ['id', 'mode', 'title', 'questions'],
    validate: function (b, v) {
      v.oneOf(b, 'mode', ['mini', 'final']);
      v.label(b, 'title', { optional: true });
      var questions = v.list(b, 'questions', 1);
      questions.forEach(function (q, i) {
        var qv = v.at('questions').at(i);
        if (!qv.fields(q, ['id', 'type', 'text', 'options', 'explanation', 'ref'])) return;
        qv.id(q, 'id');
        qv.oneOf(q, 'type', ['single', 'multiple']);
        qv.text(q, 'text');
        checkOptions(qv, q, 'options', q.type, false);
        qv.text(q, 'explanation', { multi: true });
        if (b.mode === 'final' || q.ref !== undefined) qv.id(q, 'ref');
      });
      v.uniqueIds(questions, 'questions');
    },
    keys: function (b) { return ids(b.questions); },
    graded: true,
    refs: function (b) {
      return (b.questions || []).map(function (q) { return q && q.ref; }).filter(Boolean);
    }
  });

  /** Интерактивная схема-цепочка: нажатие на элемент раскрывает объяснение и пример. */
  register('flow', {
    fields: ['id', 'caption', 'nodes'],
    validate: function (b, v) {
      v.text(b, 'caption', { optional: true });
      var nodes = v.list(b, 'nodes', 2);
      nodes.forEach(function (n, i) {
        var nv = v.at('nodes').at(i);
        if (!nv.fields(n, ['id', 'label', 'hint', 'text', 'example'])) return;
        nv.id(n, 'id');
        nv.label(n, 'label');
        nv.label(n, 'hint', { optional: true });
        nv.text(n, 'text');
        nv.text(n, 'example', { optional: true });
      });
      v.uniqueIds(nodes, 'nodes');
    }
  });

  /** Карточки понятий: раскрываются по шагам (определение → пример → ловушка). */
  register('cards', {
    fields: ['id', 'caption', 'items'],
    validate: function (b, v) {
      v.text(b, 'caption', { optional: true });
      var items = v.list(b, 'items', 1);
      items.forEach(function (item, i) {
        var iv = v.at('items').at(i);
        if (!iv.fields(item, ['id', 'title', 'summary', 'steps'])) return;
        iv.id(item, 'id');
        iv.label(item, 'title');
        iv.label(item, 'summary', { optional: true });
        iv.list(item, 'steps', 1).forEach(function (step, j) {
          var sv = iv.at('steps').at(j);
          if (!sv.fields(step, ['label', 'text', 'kind'])) return;
          sv.label(step, 'label');
          sv.text(step, 'text');
          sv.oneOf(step, 'kind', ['text', 'example', 'sign', 'trap'], { optional: true });
        });
      });
      v.uniqueIds(items, 'items');
    }
  });

  /**
   * «Лестница моделей»: теории по очереди смотрят на один сюжет. Следующая
   * ступень открывается после ответа на вопрос предыдущей; поле зрения
   * (кольца схемы) расширяется с каждой ступенью.
   */
  register('ladder', {
    fields: ['id', 'caption', 'steps', 'outro'],
    validate: function (b, v) {
      v.text(b, 'caption', { optional: true });
      var steps = v.list(b, 'steps', 2);
      steps.forEach(function (s, i) {
        var sv = v.at('steps').at(i);
        if (!sv.fields(s, ['id', 'author', 'meta', 'ring', 'diffuse', 'formula', 'text', 'case', 'question', 'blindspot'])) return;
        sv.id(s, 'id');
        sv.label(s, 'author');
        sv.label(s, 'meta', { optional: true });
        sv.label(s, 'ring');
        sv.bool(s, 'diffuse');
        sv.text(s, 'formula');
        sv.text(s, 'text', { multi: true });
        sv.text(s, 'case', { optional: true });
        var qv = sv.at('question');
        if (qv.fields(s.question, ['text', 'options'])) {
          qv.text(s.question, 'text');
          checkOptions(qv, s.question, 'options', 'single', true);
        }
        sv.text(s, 'blindspot', { optional: true });
      });
      v.uniqueIds(steps, 'steps');
      v.text(b, 'outro', { optional: true, multi: true });
    },
    keys: function (b) { return ids(b.steps); },
    graded: true
  });

  /* ---------- Итоги ---------- */

  /** Итоги главы: освоено, ошибки, что повторить (по финальной проверке). */
  register('summary', {
    fields: [],
    validate: function () {}
  });

  /** Переход к практике: ссылки из chapter.practice. */
  register('practice', {
    fields: ['text'],
    validate: function (b, v) { v.text(b, 'text', { optional: true }); }
  });

  TXT.schema = {
    ID_PATTERN: ID_PATTERN,
    register: register,
    has: function (name) { return !!types[name]; },
    get: function (name) { return types[name] || null; },
    list: function () { return Object.keys(types); },
    validateBlock: validateBlock,
    makeChecker: makeChecker
  };
})(typeof window !== 'undefined' ? window : globalThis);
