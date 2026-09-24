/**
 * Олимпиады: каталог, банк заданий и источники.
 *
 * Структура банка: олимпиада → предмет → дисциплина → тема → задания.
 * Задание описывает только содержание и тематическую принадлежность:
 * класс, тур и год в нём не хранятся. Где задание встречалось (демоверсия,
 * вариант прошлых лет, авторский сборник — номер, класс, этап, тур, год), описывает
 * источник (OLY.addSource). Из источников реестр строит производный индекс
 * появлений, по которому работают фильтры класса, этапа, тура и года.
 *
 * Порядок подключения данных: предметы (defineSubject) → олимпиады
 * (defineOlympiad) → задания (addTasks) → источники (addSource).
 * Файл работает и в браузере, и в Node.js (для тестов).
 * Зависит от js/olymp/types.js и js/olymp/scoring-rules.js.
 */
(function (root) {
  'use strict';

  var OLY = root.OLY || (root.OLY = {});
  var types = OLY.types;
  var scoringRules = OLY.scoringRules;

  /** Постоянный ID задания: ОЛИМПИАДА-ДИСЦИПЛИНА-ТЕМА-НОМЕР, например HP-SOC-MOB-001. */
  OLY.TASK_ID_PATTERN = /^[A-Z]{2,4}-[A-Z]{3}-[A-Z]{3}-\d{3,4}$/;
  /** id темы: ДИСЦИПЛИНА-ТЕМА, например SOC-MOB. */
  OLY.TOPIC_ID_PATTERN = /^[A-Z]{3}-[A-Z]{3}$/;
  OLY.DISCIPLINE_ID_PATTERN = /^[A-Z]{3}$/;
  OLY.OLYMPIAD_ID_PATTERN = /^[A-Z]{2,4}$/;
  OLY.SUBJECT_ID_PATTERN = /^[a-z][a-z-]*$/;
  /** id источника начинается с кода олимпиады: HP-2026-27-DEMO-9-1. */
  OLY.SOURCE_ID_PATTERN = /^[A-Z]{2,4}(-[A-Z0-9]+)+$/;
  OLY.YEAR_PATTERN = /^\d{4}\/\d{2}$/;
  /** Код этапа олимпиады: qualifying, final. */
  OLY.STAGE_ID_PATTERN = /^[a-z][a-z-]*$/;

  /** Виды источников: демоверсия, вариант прошлых лет, авторский сборник. */
  OLY.SOURCE_KINDS = ['demo', 'past', 'author-set'];
  /** Откуда ключи источника: официальный документ или автор-преподаватель. */
  OLY.ANSWERS_BASES = ['official', 'author'];

  /**
   * Поля, которых не должно быть в задании: класс, тур, год и происхождение
   * относятся к источнику, а не к содержанию задания.
   */
  var FORBIDDEN_TASK_FIELDS = ['class', 'classes', 'round', 'year', 'source', 'sourceType'];

  var subjectsById = Object.create(null);
  var olympiadsById = Object.create(null);
  var tasksById = Object.create(null);
  var sourcesById = Object.create(null);
  var appearancesByTask = Object.create(null);

  /** Все олимпиады, задания и источники в порядке регистрации. */
  OLY.olympiads = [];
  OLY.tasks = [];
  OLY.sources = [];

  function isText(value) {
    return typeof value === 'string' && value.trim() !== '';
  }

  function fail(what, errors) {
    throw new Error(what + ': ' + errors.join('; '));
  }

  /* ---------- Предметы: дисциплины и темы ---------- */

  /**
   * Регистрирует предмет с дисциплинами и темами. Каталог общий для всех олимпиад
   * по предмету; темы добавляются по мере появления заданий.
   * { id: 'social', title, disciplines: [{ id: 'SOC', title, topics: [{ id: 'SOC-MOB', title }] }] }
   */
  OLY.defineSubject = function (subject) {
    var errors = [];
    if (!subject || !OLY.SUBJECT_ID_PATTERN.test(subject.id)) fail('Предмет', ['некорректный id']);
    if (subjectsById[subject.id]) fail('Предмет ' + subject.id, ['уже зарегистрирован']);
    if (!isText(subject.title)) errors.push('нет названия');
    if (!Array.isArray(subject.disciplines) || subject.disciplines.length === 0) errors.push('нет дисциплин');
    if (errors.length) fail('Предмет ' + subject.id, errors);

    var disciplinesById = Object.create(null);
    var topicsById = Object.create(null);
    subject.disciplines.forEach(function (discipline) {
      if (!OLY.DISCIPLINE_ID_PATTERN.test(discipline.id)) errors.push('некорректный id дисциплины ' + discipline.id);
      else if (disciplinesById[discipline.id]) errors.push('повторяющаяся дисциплина ' + discipline.id);
      if (!isText(discipline.title)) errors.push('дисциплина ' + discipline.id + ': нет названия');
      disciplinesById[discipline.id] = discipline;
      (discipline.topics || []).forEach(function (topic) {
        if (!OLY.TOPIC_ID_PATTERN.test(topic.id) || topic.id.indexOf(discipline.id + '-') !== 0) {
          errors.push('тема ' + topic.id + ' не относится к дисциплине ' + discipline.id);
        } else if (topicsById[topic.id]) errors.push('повторяющаяся тема ' + topic.id);
        if (!isText(topic.title)) errors.push('тема ' + topic.id + ': нет названия');
        topicsById[topic.id] = topic;
      });
    });
    if (errors.length) fail('Предмет ' + subject.id, errors);

    subject.disciplines.forEach(function (discipline) {
      discipline.topics = discipline.topics || [];
      discipline.topics.forEach(function (topic) { topic.discipline = discipline.id; });
    });
    subjectsById[subject.id] = {
      subject: subject,
      disciplines: disciplinesById,
      topics: topicsById
    };
    return subject;
  };

  OLY.getSubject = function (subjectId) {
    var entry = subjectsById[subjectId];
    return entry ? entry.subject : null;
  };

  OLY.getDiscipline = function (subjectId, disciplineId) {
    var entry = subjectsById[subjectId];
    return (entry && entry.disciplines[disciplineId]) || null;
  };

  OLY.getTopic = function (subjectId, topicId) {
    var entry = subjectsById[subjectId];
    return (entry && entry.topics[topicId]) || null;
  };

  /* ---------- Олимпиады ---------- */

  /**
   * { id: 'HP', title: 'Высшая проба', subjects: ['social'], classes: [9, 10, 11], rounds: [1, 2],
   *   stages: ['qualifying', 'final'] }
   * stages — необязательный список кодов этапов (латиницей); если его нет, у источников
   * олимпиады этап не указывается. Необязательные подписи для интерфейса:
   * titleGenitive — название в родительном падеже («Высшей пробы»),
   * stageTitles — названия этапов: { qualifying: 'Отборочный этап', … }.
   */
  OLY.defineOlympiad = function (olympiad) {
    var errors = [];
    if (!olympiad || !OLY.OLYMPIAD_ID_PATTERN.test(olympiad.id)) fail('Олимпиада', ['некорректный id']);
    if (olympiadsById[olympiad.id]) fail('Олимпиада ' + olympiad.id, ['уже зарегистрирована']);
    if (!isText(olympiad.title)) errors.push('нет названия');
    if (!Array.isArray(olympiad.subjects) || olympiad.subjects.length === 0) errors.push('нет предметов');
    else {
      olympiad.subjects.forEach(function (id) {
        if (!subjectsById[id]) errors.push('неизвестный предмет ' + id);
      });
    }
    ['classes', 'rounds'].forEach(function (key) {
      var values = olympiad[key];
      if (!Array.isArray(values) || values.length === 0 ||
          !values.every(function (v) { return Number.isInteger(v) && v > 0; })) {
        errors.push(key + ' должно быть непустым списком целых чисел');
      }
    });
    if (olympiad.stages !== undefined) {
      if (!Array.isArray(olympiad.stages) || olympiad.stages.length === 0 ||
          !olympiad.stages.every(function (s) { return OLY.STAGE_ID_PATTERN.test(s); })) {
        errors.push('stages должно быть непустым списком кодов этапов');
      } else if (new Set(olympiad.stages).size !== olympiad.stages.length) {
        errors.push('stages: этапы повторяются');
      }
    }
    if (olympiad.titleGenitive !== undefined && !isText(olympiad.titleGenitive)) {
      errors.push('titleGenitive должно быть непустой строкой');
    }
    if (olympiad.stageTitles !== undefined) {
      if (!olympiad.stageTitles || typeof olympiad.stageTitles !== 'object' || !Array.isArray(olympiad.stages)) {
        errors.push('stageTitles задаётся объектом и только вместе со stages');
      } else {
        Object.keys(olympiad.stageTitles).forEach(function (key) {
          if (olympiad.stages.indexOf(key) === -1) errors.push('stageTitles: неизвестный этап ' + key);
          else if (!isText(olympiad.stageTitles[key])) errors.push('stageTitles.' + key + ': нет названия');
        });
      }
    }
    if (errors.length) fail('Олимпиада ' + olympiad.id, errors);
    olympiadsById[olympiad.id] = olympiad;
    OLY.olympiads.push(olympiad);
    return olympiad;
  };

  OLY.getOlympiad = function (olympiadId) {
    return olympiadsById[olympiadId] || null;
  };

  /* ---------- Задания ---------- */

  /** Все ошибки данных задания (пустой массив — задание корректно). */
  function validateTask(task) {
    var errors = [];
    FORBIDDEN_TASK_FIELDS.forEach(function (key) {
      if (Object.prototype.hasOwnProperty.call(task, key)) {
        errors.push('поле ' + key + ' не хранится в задании: класс, тур, год и происхождение описывает источник (OLY.addSource)');
      }
    });
    var olympiad = olympiadsById[task.olympiad];
    if (!olympiad) errors.push('неизвестная олимпиада ' + task.olympiad);
    else if (olympiad.subjects.indexOf(task.subject) === -1) {
      errors.push('предмет ' + task.subject + ' не относится к олимпиаде ' + task.olympiad);
    }
    var discipline = OLY.getDiscipline(task.subject, task.discipline);
    var topic = OLY.getTopic(task.subject, task.topic);
    if (!discipline) errors.push('неизвестная дисциплина ' + task.discipline);
    if (!topic) errors.push('неизвестная тема ' + task.topic);
    else if (topic.discipline !== task.discipline) {
      errors.push('тема ' + task.topic + ' не относится к дисциплине ' + task.discipline);
    }
    if (task.id.indexOf(task.olympiad + '-' + task.topic + '-') !== 0) {
      errors.push('id должен начинаться с ' + task.olympiad + '-' + task.topic + '-');
    }
    if (!isText(task.question)) errors.push('нет вопроса');
    if (task.explanation !== undefined && typeof task.explanation !== 'string') {
      errors.push('explanation должно быть строкой');
    }
    if (task.version !== undefined && !(Number.isInteger(task.version) && task.version >= 1)) {
      errors.push('version должно быть целым числом от 1');
    }
    if (task.retired !== undefined && typeof task.retired !== 'boolean') {
      errors.push('retired должно быть true или false');
    }
    if (!Object.prototype.hasOwnProperty.call(task, 'scoring')) {
      errors.push('нет поля scoring (null, если критерии оценивания неизвестны)');
    }
    if (!types.has(task.type)) {
      errors.push('неизвестный тип ' + task.type);
      return errors;
    }
    errors = errors.concat(types.get(task.type).validateTask(task));
    if (Object.prototype.hasOwnProperty.call(task, 'scoring')) {
      errors = errors.concat(scoringRules.validateScoring(task.scoring, task.type));
    }
    return errors;
  }

  /**
   * Регистрирует задания. Каждое задание:
   * { id, olympiad, subject, discipline, topic, type, question, …поля типа,
   *   explanation?, scoring: null | {…}, version?, retired? }
   * ID постоянный: не меняется и не используется повторно. Вместо удаления —
   * retired: true.
   */
  OLY.addTasks = function (tasks) {
    if (!Array.isArray(tasks)) throw new Error('OLY.addTasks ожидает массив заданий');
    tasks.forEach(function (task) {
      if (!task || !OLY.TASK_ID_PATTERN.test(task.id)) {
        throw new Error('Некорректный id задания: ' + (task && task.id) + ' (ожидается формат HP-SOC-MOB-001)');
      }
      if (tasksById[task.id]) throw new Error('Повторяющийся id задания: ' + task.id);
      var errors = validateTask(task);
      if (errors.length) fail('Задание ' + task.id, errors);
      tasksById[task.id] = task;
      appearancesByTask[task.id] = [];
      OLY.tasks.push(task);
    });
  };

  /** Задание по постоянному ID (в том числе снятое с выдачи). */
  OLY.getTask = function (taskId) {
    return tasksById[taskId] || null;
  };

  function isActive(task) {
    return !task.retired;
  }

  /* ---------- Источники ---------- */

  function hasKey(object, key) {
    return Object.prototype.hasOwnProperty.call(object, key);
  }

  /**
   * Регистрирует источник — место, где встречаются задания:
   * {
   *   id: 'HP-2026-27-DEMO-9-1', olympiad: 'HP', subject: 'social',
   *   kind: 'demo' | 'past' | 'author-set',
   *   year: '2026/27', classes: [9], round: 1,   // обязательны для demo и past
   *   stage: 'qualifying',                       // обязателен для demo и past, если у олимпиады есть этапы
   *   title, answersBasis: 'official' | 'author',
   *   playable: true,                            // можно пройти как пробный тур
   *   items: [{ number: 1, taskId: 'HP-…-001', scoring? }]
   * }
   * scoring у позиции — критерии этого варианта; если поле есть (в том числе null),
   * оно заменяет task.scoring при прохождении источника.
   */
  OLY.addSource = function (source) {
    if (!source || !OLY.SOURCE_ID_PATTERN.test(source.id)) {
      throw new Error('Некорректный id источника: ' + (source && source.id));
    }
    if (sourcesById[source.id]) throw new Error('Повторяющийся id источника: ' + source.id);
    var errors = [];
    var olympiad = olympiadsById[source.olympiad];
    if (!olympiad) errors.push('неизвестная олимпиада ' + source.olympiad);
    else {
      if (source.id.indexOf(source.olympiad + '-') !== 0) errors.push('id должен начинаться с ' + source.olympiad + '-');
      if (olympiad.subjects.indexOf(source.subject) === -1) {
        errors.push('предмет ' + source.subject + ' не относится к олимпиаде ' + source.olympiad);
      }
    }
    if (OLY.SOURCE_KINDS.indexOf(source.kind) === -1) errors.push('kind должно быть одним из: ' + OLY.SOURCE_KINDS.join(', '));
    if (!isText(source.title)) errors.push('нет названия');
    if (OLY.ANSWERS_BASES.indexOf(source.answersBasis) === -1) {
      errors.push('answersBasis должно быть одним из: ' + OLY.ANSWERS_BASES.join(', '));
    }
    if (source.playable !== undefined && typeof source.playable !== 'boolean') errors.push('playable должно быть true или false');

    var strict = source.kind === 'demo' || source.kind === 'past';
    if (source.year !== undefined || strict) {
      if (typeof source.year !== 'string' || !OLY.YEAR_PATTERN.test(source.year)) errors.push('year должен иметь вид 2026/27');
    }
    if (source.classes !== undefined || strict) {
      if (!Array.isArray(source.classes) || source.classes.length === 0) errors.push('classes должно быть непустым списком');
      else if (olympiad) {
        source.classes.forEach(function (c) {
          if (olympiad.classes.indexOf(c) === -1) errors.push('класс ' + c + ' не предусмотрен олимпиадой');
        });
      }
    }
    if (source.round !== undefined || strict) {
      if (!olympiad || olympiad.rounds.indexOf(source.round) === -1) errors.push('тур ' + source.round + ' не предусмотрен олимпиадой');
    }
    if (olympiad && (source.stage !== undefined || (strict && olympiad.stages))) {
      if (!olympiad.stages) errors.push('у олимпиады нет этапов, stage не указывается');
      else if (olympiad.stages.indexOf(source.stage) === -1) errors.push('этап ' + source.stage + ' не предусмотрен олимпиадой');
    }

    if (!Array.isArray(source.items) || source.items.length === 0) errors.push('нет позиций items');
    else {
      var seenTasks = Object.create(null);
      source.items.forEach(function (item, i) {
        var name = 'позиция ' + (i + 1);
        if (!item || item.number !== i + 1) errors.push(name + ': number должен быть ' + (i + 1) + ' (номера по порядку с 1)');
        var task = item && tasksById[item.taskId];
        if (!task) {
          errors.push(name + ': неизвестное задание ' + (item && item.taskId));
          return;
        }
        if (seenTasks[task.id]) errors.push(name + ': задание ' + task.id + ' уже есть в источнике');
        seenTasks[task.id] = true;
        if (task.olympiad !== source.olympiad || task.subject !== source.subject) {
          errors.push(name + ': задание ' + task.id + ' относится к другой олимпиаде или предмету');
        }
        if (source.playable && task.retired) errors.push(name + ': задание ' + task.id + ' снято с выдачи');
        if (hasKey(item, 'scoring')) {
          scoringRules.validateScoring(item.scoring, task.type).forEach(function (e) {
            errors.push(name + ': ' + e);
          });
        }
      });
    }
    if (errors.length) fail('Источник ' + source.id, errors);

    sourcesById[source.id] = source;
    OLY.sources.push(source);
    source.items.forEach(function (item) {
      appearancesByTask[item.taskId].push({
        sourceId: source.id,
        number: item.number,
        kind: source.kind,
        year: source.year === undefined ? null : source.year,
        classes: source.classes === undefined ? [] : source.classes.slice(),
        stage: source.stage === undefined ? null : source.stage,
        round: source.round === undefined ? null : source.round
      });
    });
    return source;
  };

  OLY.getSource = function (sourceId) {
    return sourcesById[sourceId] || null;
  };

  /** Позиция источника с данным заданием или null. */
  OLY.getSourceItem = function (sourceId, taskId) {
    var source = sourcesById[sourceId];
    if (!source) return null;
    for (var i = 0; i < source.items.length; i++) {
      if (source.items[i].taskId === taskId) return source.items[i];
    }
    return null;
  };

  /** ID заданий источника в порядке номеров. */
  OLY.getSourceTaskIds = function (sourceId) {
    var source = sourcesById[sourceId];
    return source ? source.items.map(function (item) { return item.taskId; }) : [];
  };

  /** Где встречалось задание: копии записей индекса появлений. */
  OLY.getAppearances = function (taskId) {
    return (appearancesByTask[taskId] || []).map(function (a) {
      return {
        sourceId: a.sourceId, number: a.number, kind: a.kind,
        year: a.year, classes: a.classes.slice(), stage: a.stage, round: a.round
      };
    });
  };

  function uniqueSorted(values) {
    return Array.from(new Set(values)).sort(function (a, b) {
      return a < b ? -1 : a > b ? 1 : 0;
    });
  }

  /** Производные классы, этапы, туры, годы и виды источников задания (по всем его источникам). */
  OLY.getTaskFacets = function (taskId) {
    var appearances = appearancesByTask[taskId] || [];
    var sourceKinds = [];
    var classes = [];
    var stages = [];
    var rounds = [];
    var years = [];
    appearances.forEach(function (a) {
      classes = classes.concat(a.classes);
      if (a.stage !== null) stages.push(a.stage);
      if (a.round !== null) rounds.push(a.round);
      if (a.year !== null) years.push(a.year);
      sourceKinds.push(a.kind);
    });
    return {
      classes: uniqueSorted(classes), stages: uniqueSorted(stages),
      rounds: uniqueSorted(rounds), years: uniqueSorted(years),
      sourceKinds: OLY.SOURCE_KINDS.filter(function (k) { return sourceKinds.indexOf(k) !== -1; })
    };
  };

  /* ---------- Запросы ---------- */

  function isSet(value) {
    return value !== undefined && value !== null && value !== 'all';
  }

  /** Есть ли у задания одно появление, подходящее сразу под класс, этап, тур, год и вид источника. */
  function matchesAppearance(taskId, filters) {
    return (appearancesByTask[taskId] || []).some(function (a) {
      if (isSet(filters.sourceKind) && a.kind !== filters.sourceKind) return false;
      if (isSet(filters.class) && a.classes.indexOf(filters.class) === -1) return false;
      if (isSet(filters.stage) && a.stage !== filters.stage) return false;
      if (isSet(filters.round) && a.round !== filters.round) return false;
      if (isSet(filters.year) && a.year !== filters.year) return false;
      return true;
    });
  }

  /**
   * Активные задания по фильтрам (порядок регистрации):
   * { olympiad, subject, discipline?, topic?, class?, stage?, round?, year?, sourceKind?, type? }.
   * Значение 'all', null или отсутствие поля — без фильтра.
   * sourceKind — вид источника: 'demo' | 'past' | 'author-set'.
   * Класс, этап, тур, год и вид источника проверяются по одному появлению: «9 класс, II тур» —
   * задание встречалось во II туре 9 класса, а не в разных источниках по отдельности.
   * Задание без источников находится только без этих фильтров.
   */
  OLY.query = function (filters) {
    var f = filters || {};
    var byAppearance = isSet(f.class) || isSet(f.stage) || isSet(f.round) || isSet(f.year) || isSet(f.sourceKind);
    return OLY.tasks.filter(function (task) {
      if (!isActive(task)) return false;
      if (isSet(f.olympiad) && task.olympiad !== f.olympiad) return false;
      if (isSet(f.subject) && task.subject !== f.subject) return false;
      if (isSet(f.discipline) && task.discipline !== f.discipline) return false;
      if (isSet(f.topic) && task.topic !== f.topic) return false;
      if (isSet(f.type) && task.type !== f.type) return false;
      if (byAppearance && !matchesAppearance(task.id, f)) return false;
      return true;
    });
  };

  /** Дисциплины предмета, в которых по фильтрам есть хотя бы одно задание. */
  OLY.getAvailableDisciplines = function (filters) {
    var subject = OLY.getSubject(filters && filters.subject);
    if (!subject) return [];
    var tasks = OLY.query(filters);
    return subject.disciplines.filter(function (discipline) {
      return tasks.some(function (task) { return task.discipline === discipline.id; });
    });
  };

  /** Темы дисциплины, в которых по фильтрам есть хотя бы одно задание. */
  OLY.getAvailableTopics = function (filters) {
    var discipline = OLY.getDiscipline(filters && filters.subject, filters && filters.discipline);
    if (!discipline) return [];
    var tasks = OLY.query(filters);
    return discipline.topics.filter(function (topic) {
      return tasks.some(function (task) { return task.topic === topic.id; });
    });
  };

  /**
   * Источники, которые можно пройти как пробный тур:
   * { olympiad, subject?, class?, stage?, round?, sourceKind? }.
   */
  OLY.getPlayableSources = function (filters) {
    var f = filters || {};
    return OLY.sources.filter(function (source) {
      if (!source.playable) return false;
      if (isSet(f.olympiad) && source.olympiad !== f.olympiad) return false;
      if (isSet(f.subject) && source.subject !== f.subject) return false;
      if (isSet(f.class) && (source.classes || []).indexOf(f.class) === -1) return false;
      if (isSet(f.stage) && source.stage !== f.stage) return false;
      if (isSet(f.sourceKind) && source.kind !== f.sourceKind) return false;
      if (isSet(f.round) && source.round !== f.round) return false;
      return true;
    });
  };
})(typeof window !== 'undefined' ? window : globalThis);
