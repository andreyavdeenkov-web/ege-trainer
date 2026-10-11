/**
 * Олимпиады: тип задания short-answer — краткий самостоятельный ответ (Ф3).
 * Чистые функции без DOM. Подключается после js/olymp/types/nrm-rows.js.
 *
 * Ученик вводит в пустое поле номер статьи, число или термин. Ответ сравнивается
 * с ключом после нормализации (спецификация § 3.3); свободные формулировки не вводятся.
 *
 * Данные задания:
 * {
 *   type: 'short-answer',
 *   legal?: [...],
 *   items: [
 *     { id, label, kind: 'article', key: { code: 'UK', article: '20', part?: '1', point?: '2' },
 *       wrong?: { 'UK 105': '…', '105': '…' }, partWrong?: '…', explanation },
 *     { id, label, kind: 'number', key: 16, wrong?: { '14': '…' }, explanation },
 *     { id, label, kind: 'term', key: ['формальная определенность', …], wrong?: { 'общеобязательность': '…' }, explanation }
 *   ]
 * }
 *
 * Нормализация:
 *   • статья — номер (в том числе «12.6») + необязательные часть и пункт + кодекс по списку
 *     синонимов: «ст. 20 ч. 1 УК», «20 УК РФ», «часть 1 статьи 20 Уголовного кодекса» равнозначны;
 *     кодекс можно не указывать; неверный кодекс — ошибка; указанная неверная часть или пункт — ½;
 *   • число — цифрами или словами («шестнадцать», «16», «16 лет»);
 *   • термин — закрытый список форм; без учёта регистра, ё и знаков препинания.
 *
 * Баллы: по 1 за ответ (½ — верная статья с неверной частью или пунктом); компонент K.
 * Ответ: { itemId: 'строка' }.
 */
(function (root) {
  'use strict';

  var OLY = root.OLY || (root.OLY = {});
  var R = OLY.nrmRows;

  var KINDS = ['article', 'number', 'term'];
  var MAX_LENGTH = 120;

  /** Кодексы: краткое имя, синонимы-сокращения и основы полных наименований (порядок важен). */
  var CODES = [
    { id: 'KONST', title: 'Конституция РФ', abbr: [], stems: ['конституц'] },
    { id: 'GPK', title: 'ГПК РФ', abbr: ['гпк'], stems: ['гражданск процессуальн', 'гражданско процессуальн'] },
    { id: 'UPK', title: 'УПК РФ', abbr: ['упк'], stems: ['уголовн процессуальн', 'уголовно процессуальн'] },
    { id: 'KOAP', title: 'КоАП РФ', abbr: ['коап'], stems: ['административных правонарушени'] },
    { id: 'GK', title: 'ГК РФ', abbr: ['гк'], stems: ['гражданск'] },
    { id: 'UK', title: 'УК РФ', abbr: ['ук'], stems: ['уголовн'] },
    { id: 'SK', title: 'СК РФ', abbr: ['ск'], stems: ['семейн'] },
    { id: 'TK', title: 'ТК РФ', abbr: ['тк'], stems: ['трудов'] }
  ];
  var CODE_IDS = CODES.map(function (c) { return c.id; });

  var NUMBER_WORDS = {
    'ноль': 0, 'один': 1, 'одна': 1, 'одно': 1, 'два': 2, 'две': 2, 'три': 3, 'четыре': 4, 'пять': 5,
    'шесть': 6, 'семь': 7, 'восемь': 8, 'девять': 9, 'десять': 10, 'одиннадцать': 11, 'двенадцать': 12,
    'тринадцать': 13, 'четырнадцать': 14, 'пятнадцать': 15, 'шестнадцать': 16, 'семнадцать': 17,
    'восемнадцать': 18, 'девятнадцать': 19, 'двадцать': 20, 'тридцать': 30, 'сорок': 40, 'пятьдесят': 50
  };

  function base(text) {
    return String(text || '').toLowerCase().replace(/ё/g, 'е');
  }

  /** Термин: регистр, ё, знаки препинания и лишние пробелы не учитываются. */
  function normTerm(text) {
    return base(text).replace(/[^a-zа-я0-9\s-]/g, ' ').replace(/-/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function parseNumber(text) {
    // Единица измерения после числа не мешает: «16 лет», «два года», «3 условия».
    var t = normTerm(text).replace(/\s+(лет|год|года|годов|раз|раза|условие|условия|условий|части|частей|часть)$/, '');
    if (/^\d+$/.test(t)) return parseInt(t, 10);
    var words = t.split(' ');
    if (!words.length || words.some(function (w) { return !Object.prototype.hasOwnProperty.call(NUMBER_WORDS, w); })) return null;
    // «двадцать один», «тридцать пять»: десятки + единицы.
    if (words.length === 1) return NUMBER_WORDS[words[0]];
    if (words.length === 2 && NUMBER_WORDS[words[0]] >= 20 && NUMBER_WORDS[words[0]] % 10 === 0 && NUMBER_WORDS[words[1]] < 10) {
      return NUMBER_WORDS[words[0]] + NUMBER_WORDS[words[1]];
    }
    return null;
  }

  function findCode(text) {
    var t = ' ' + base(text).replace(/[^a-zа-я0-9.]/g, ' ').replace(/\s+/g, ' ') + ' ';
    var plain = t.replace(/\./g, ' ').replace(/-/g, ' ');
    for (var i = 0; i < CODES.length; i++) {
      var c = CODES[i];
      if (c.abbr.some(function (a) { return new RegExp('(^|\\s)' + a + '(\\s|$)').test(plain); })) return c.id;
    }
    for (var j = 0; j < CODES.length; j++) {
      var d = CODES[j];
      if (d.stems.some(function (stem) {
        // Основа из нескольких слов: каждое слово — начало очередного слова текста.
        var re = new RegExp(stem.split(' ').map(function (w) { return w + '[а-я]*'; }).join('\\s+'));
        return re.test(plain);
      })) return d.id;
    }
    return null;
  }

  /** Разбор ссылки на статью. Возвращает { article, part, point, code } или null. */
  function parseArticle(text) {
    var t = base(text).replace(/,/g, ' ').replace(/\s+/g, ' ');
    var part = null;
    var point = null;
    var rest = t.replace(/(?:^|\s)(?:ч\.?|часть|части|частью)\s*(\d+)/, function (m, n) { part = n; return ' '; });
    rest = rest.replace(/(?:^|\s)(?:п\.?|пп\.?|пункт|пункта|пунктом)\s*(\d+)/, function (m, n) { point = n; return ' '; });
    var article = null;
    var m = /(?:ст\.?|статья|статьи|статье|статью|статьей)\s*(\d+(?:\.\d+)?)/.exec(rest);
    if (m) article = m[1];
    else {
      var any = /(\d+(?:\.\d+)?)/.exec(rest);
      if (any) article = any[1];
    }
    if (!article) return null;
    return { article: article, part: part, point: point, code: findCode(rest) };
  }

  function articleText(a) {
    if (!a) return '';
    var code = a.code ? CODES.filter(function (c) { return c.id === a.code; })[0].title : null;
    return (a.point ? 'п. ' + a.point + ' ' : '') + (a.part ? 'ч. ' + a.part + ' ' : '') + 'ст. ' + a.article + (code ? ' ' + code : '');
  }

  function keyText(item) {
    if (item.kind === 'article') return articleText(item.key);
    if (item.kind === 'number') return String(item.key);
    return item.key[0];
  }

  /* ---------- Данные ---------- */

  function validateTask(task) {
    var errors = task.legal === undefined ? [] : R.validateLegal(task.legal, { required: false, requireMain: false });
    if (!Array.isArray(task.items) || task.items.length === 0) return errors.concat('нет items');
    var ids = {};
    task.items.forEach(function (item, i) {
      var name = 'items[' + i + ']';
      if (!item || !R.isText(item.id)) { errors.push(name + ': нет id'); return; }
      name = 'ответ ' + item.id;
      if (ids[item.id]) errors.push('повторяющийся id ' + item.id);
      ids[item.id] = true;
      if (!R.isText(item.label)) errors.push(name + ': нет label');
      if (!R.isText(item.explanation)) errors.push(name + ': нет explanation');
      if (KINDS.indexOf(item.kind) === -1) { errors.push(name + ': kind — article, number или term'); return; }
      if (item.component !== undefined && item.component !== 'K' && item.component !== 'R') errors.push(name + ': component — K или R');
      if (item.kind === 'article') {
        var k = item.key;
        if (!k || CODE_IDS.indexOf(k.code) === -1) errors.push(name + ': key.code — один из ' + CODE_IDS.join(', '));
        if (!k || !/^\d+(\.\d+)?$/.test(k.article || '')) errors.push(name + ': key.article — номер статьи строкой');
        if (k && k.part !== undefined && !/^\d+$/.test(k.part)) errors.push(name + ': key.part — номер части строкой');
        if (k && k.point !== undefined && !/^\d+$/.test(k.point)) errors.push(name + ': key.point — номер пункта строкой');
        if ((k && (k.part !== undefined || k.point !== undefined)) && !R.isExplanation(item.partWrong)) {
          errors.push(name + ': нужно объяснение partWrong — для верной статьи с неверной частью или пунктом');
        }
      } else if (item.kind === 'number') {
        if (!Number.isInteger(item.key) || item.key < 0) errors.push(name + ': key — целое неотрицательное число');
      } else {
        if (!Array.isArray(item.key) || !item.key.length || !item.key.every(R.isText)) errors.push(name + ': key — непустой список допустимых форм');
        else if (item.wrong) {
          var accepted = item.key.map(normTerm);
          Object.keys(item.wrong).forEach(function (w) {
            if (accepted.indexOf(normTerm(w)) !== -1) errors.push(name + ': форма «' + w + '» одновременно в key и wrong');
          });
        }
      }
      if (item.wrong !== undefined) {
        if (!item.wrong || typeof item.wrong !== 'object') errors.push(name + ': wrong — объект');
        else Object.keys(item.wrong).forEach(function (w) {
          if (!R.isExplanation(item.wrong[w])) errors.push(name + ': объяснение для «' + w + '» — строка или { short, full }');
        });
      }
    });
    if (errors.length === 0) errors = errors.concat(R.validateScoringTotal(task, maxPoints(task)));
    return errors;
  }

  function componentOf(item) { return item.component || 'K'; }

  function maxByComponent(task) {
    var max = { K: 0, T: 0, R: 0 };
    task.items.forEach(function (item) { max[componentOf(item)] += 1; });
    return max;
  }

  function maxPoints(task) {
    var m = maxByComponent(task);
    return m.K + m.T + m.R;
  }

  /* ---------- Ответ ---------- */

  function emptyResponse(task) {
    var r = {};
    task.items.forEach(function (item) { r[item.id] = ''; });
    return r;
  }

  function answerOf(response, item) {
    var v = response && response[item.id];
    return typeof v === 'string' ? v : '';
  }

  function isEmpty(task, response) {
    return task.items.every(function (item) { return answerOf(response, item).trim() === ''; });
  }

  function isComplete(task, response) {
    return task.items.every(function (item) { return answerOf(response, item).trim() !== ''; });
  }

  function cleanResponse(task, response) {
    if (!response || typeof response !== 'object' || Array.isArray(response)) throw new Error('Ответ должен быть объектом');
    var ids = task.items.map(function (item) { return item.id; });
    Object.keys(response).forEach(function (k) {
      if (ids.indexOf(k) === -1) throw new Error('Неизвестное поле ответа: ' + k);
      if (typeof response[k] !== 'string') throw new Error('Ответ ' + k + ' должен быть строкой');
      if (response[k].length > MAX_LENGTH) throw new Error('Ответ ' + k + ' длиннее ' + MAX_LENGTH + ' символов');
    });
    var clean = {};
    task.items.forEach(function (item) { clean[item.id] = answerOf(response, item).trim(); });
    return clean;
  }

  /* ---------- Проверка ---------- */

  function lookupWrong(item, keys) {
    if (!item.wrong) return null;
    for (var i = 0; i < keys.length; i++) {
      if (keys[i] !== null && Object.prototype.hasOwnProperty.call(item.wrong, keys[i])) return { key: keys[i], explanation: item.wrong[keys[i]] };
    }
    return null;
  }

  /**
   * Оценка одного ответа: { status: ok | partial | wrong | empty, points, parsed, reason }.
   * reason — код причины для разбора: unparsed, code, article, part, number, term.
   */
  function scoreItem(item, text) {
    var raw = String(text || '').trim();
    if (!raw) return { status: 'empty', points: 0, parsed: null, reason: null };
    if (item.kind === 'number') {
      var n = parseNumber(raw);
      if (n === null) return { status: 'wrong', points: 0, parsed: null, reason: 'unparsed' };
      if (n === item.key) return { status: 'ok', points: 1, parsed: n, reason: null };
      return { status: 'wrong', points: 0, parsed: n, reason: 'number', wrong: lookupWrong(item, [String(n)]) };
    }
    if (item.kind === 'term') {
      var t = normTerm(raw);
      if (item.key.map(normTerm).indexOf(t) !== -1) return { status: 'ok', points: 1, parsed: t, reason: null };
      var w = null;
      if (item.wrong) {
        Object.keys(item.wrong).forEach(function (form) { if (!w && normTerm(form) === t) w = { key: form, explanation: item.wrong[form] }; });
      }
      return { status: 'wrong', points: 0, parsed: t, reason: 'term', wrong: w };
    }
    var a = parseArticle(raw);
    if (!a) return { status: 'wrong', points: 0, parsed: null, reason: 'unparsed' };
    var key = item.key;
    if (a.code && a.code !== key.code) {
      return { status: 'wrong', points: 0, parsed: a, reason: 'code', wrong: lookupWrong(item, [a.code + ' ' + a.article, a.code]) };
    }
    if (a.article !== key.article) {
      return { status: 'wrong', points: 0, parsed: a, reason: 'article', wrong: lookupWrong(item, [(a.code || key.code) + ' ' + a.article, a.article]) };
    }
    var partBad = a.part !== null && key.part !== undefined && a.part !== key.part;
    var pointBad = a.point !== null && key.point !== undefined && a.point !== key.point;
    if (partBad || pointBad) return { status: 'partial', points: 0.5, parsed: a, reason: 'part' };
    return { status: 'ok', points: 1, parsed: a, reason: null };
  }

  function check(task, response) {
    var components = R.emptyComponents(maxByComponent(task));
    var items = {};
    task.items.forEach(function (item) {
      var d = scoreItem(item, answerOf(response, item));
      components[componentOf(item)].earned += d.points;
      items[item.id] = d;
    });
    var earned = R.total(components, 'earned');
    var max = R.total(components, 'max');
    return { verdict: R.verdictOf(earned, max), details: { items: items, components: components, earned: earned, max: max } };
  }

  function getCorrect(task) {
    var r = {};
    task.items.forEach(function (item) { r[item.id] = keyText(item); });
    return r;
  }

  function formatResponse(task, response) {
    return task.items.map(function (item) { return answerOf(response, item) || '—'; }).join('; ');
  }

  OLY.types.register('short-answer', {
    validateTask: validateTask,
    emptyResponse: emptyResponse,
    isEmpty: isEmpty,
    isComplete: isComplete,
    cleanResponse: cleanResponse,
    check: check,
    getCorrect: getCorrect,
    formatResponse: formatResponse
  });

  OLY.shortAnswer = {
    CODES: CODES,
    parseArticle: parseArticle,
    parseNumber: parseNumber,
    normTerm: normTerm,
    articleText: articleText,
    keyText: keyText,
    scoreItem: scoreItem,
    maxByComponent: maxByComponent,
    maxPoints: maxPoints
  };
})(typeof window !== 'undefined' ? window : globalThis);
