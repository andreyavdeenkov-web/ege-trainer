/**
 * Олимпиады, интерфейс: подписи и мелкие помощники.
 * Чистые функции (кроме el), работают и в Node.js (для тестов).
 */
(function (root) {
  'use strict';

  var OLY = root.OLY || (root.OLY = {});
  var ui = OLY.ui || (OLY.ui = {});

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  /** Форма слова после числа: plural(3, 'задание', 'задания', 'заданий'). */
  function plural(n, one, few, many) {
    var mod10 = n % 10;
    var mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return one;
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
    return many;
  }

  function tasksCount(n) {
    return n + ' ' + plural(n, 'задание', 'задания', 'заданий');
  }

  function topicsCount(n) {
    return n + ' ' + plural(n, 'тема', 'темы', 'тем');
  }

  var ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

  function roman(n) {
    return ROMAN[n] || String(n);
  }

  function roundLabel(round) {
    return roman(round) + ' тур';
  }

  /** [9] → «9 класс», [10, 11] → «10–11 классы», [9, 11] → «9, 11 классы». */
  function classesLabel(classes) {
    if (!classes || classes.length === 0) return '';
    var list = classes.slice().sort(function (a, b) { return a - b; });
    if (list.length === 1) return list[0] + ' класс';
    var consecutive = list.every(function (c, i) { return i === 0 || c === list[i - 1] + 1; });
    return (consecutive ? list[0] + '–' + list[list.length - 1] : list.join(', ')) + ' классы';
  }

  function lowerFirst(text) {
    return text ? text.charAt(0).toLowerCase() + text.slice(1) : text;
  }

  function stageTitle(olympiad, stage) {
    return (olympiad && olympiad.stageTitles && olympiad.stageTitles[stage]) || stage;
  }

  /** Названия видов источников для фильтра. */
  var SOURCE_KIND_TITLES = {
    demo: 'Официальные демоверсии',
    past: 'Задания прошлых лет',
    'author-set': 'Авторские задания'
  };

  function sourceKindTitle(kind) {
    return SOURCE_KIND_TITLES[kind] || kind;
  }

  var TYPE_TITLES = {
    'single-select': 'Один вариант ответа',
    'multiple-select': 'Несколько вариантов ответа',
    'short-text': 'Краткий ответ',
    numeric: 'Числовой ответ',
    matching: 'Соответствие'
  };

  function typeTitle(type) {
    return TYPE_TITLES[type] || type;
  }

  /** Начало строки источника: «Официальная демоверсия „Высшей пробы“, 2026/27». */
  function sourceHead(source, olympiad) {
    var name = olympiad ? olympiad.title : source.olympiad;
    var genitive = (olympiad && olympiad.titleGenitive) || name;
    var head;
    if (source.kind === 'demo') head = 'Официальная демоверсия «' + genitive + '»';
    else if (source.kind === 'past') head = 'Олимпиада «' + name + '»';
    else head = source.title;
    return source.year ? head + ', ' + source.year : head;
  }

  /**
   * Строка источника для ученика:
   * «Официальная демоверсия „Высшей пробы“, 2026/27 · 9 класс · отборочный этап · I тур · № 2».
   */
  function sourceLine(appearance) {
    var source = OLY.getSource(appearance.sourceId);
    if (!source) return '';
    var olympiad = OLY.getOlympiad(source.olympiad);
    var parts = [sourceHead(source, olympiad)];
    if (appearance.classes.length) parts.push(classesLabel(appearance.classes));
    if (appearance.stage) parts.push(lowerFirst(stageTitle(olympiad, appearance.stage)));
    if (appearance.round) parts.push(roundLabel(appearance.round));
    parts.push('№ ' + appearance.number);
    return parts.join(' · ');
  }

  /** «Социология · Образование и профессиональная деятельность». */
  function taskTopicLabel(task) {
    var discipline = OLY.getDiscipline(task.subject, task.discipline);
    var topic = OLY.getTopic(task.subject, task.topic);
    return (discipline ? discipline.title : task.discipline) + ' · ' + (topic ? topic.title : task.topic);
  }

  function disciplineColor(subjectId, disciplineId) {
    var discipline = OLY.getDiscipline(subjectId, disciplineId);
    return (discipline && discipline.color) || null;
  }

  /** localStorage может быть недоступен (приватный режим, запрет сайта) — не падаем. */
  var storage = {
    read: function (key) {
      try {
        var raw = root.localStorage && root.localStorage.getItem(key);
        return raw ? JSON.parse(raw) : null;
      } catch (e) {
        return null;
      }
    },
    write: function (key, value) {
      try {
        if (root.localStorage) root.localStorage.setItem(key, JSON.stringify(value));
      } catch (e) { /* настройки просто не запомнятся */ }
    }
  };

  ui.el = el;
  ui.format = {
    plural: plural,
    tasksCount: tasksCount,
    topicsCount: topicsCount,
    roman: roman,
    roundLabel: roundLabel,
    classesLabel: classesLabel,
    lowerFirst: lowerFirst,
    stageTitle: stageTitle,
    sourceKindTitle: sourceKindTitle,
    typeTitle: typeTitle,
    sourceHead: sourceHead,
    sourceLine: sourceLine,
    taskTopicLabel: taskTopicLabel,
    disciplineColor: disciplineColor
  };
  ui.storage = storage;
})(typeof window !== 'undefined' ? window : globalThis);
