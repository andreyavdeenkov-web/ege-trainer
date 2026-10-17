/**
 * Реестр разделов, тем, заданий и практикумов.
 *
 * Хранение заданий: раздел → тема → задания. Файлы с заданиями (data/tasks/**.js)
 * подключаются после этого файла и регистрируют задания через EGE.addTasks(topicId, [...]).
 * Навигация ученика: раздел → тема → практикум. Практикум — фиксированный набор
 * заданий одной темы («Практикум № 1», «Практикум № 2»…); реестр практикумов —
 * data/practicums.js (EGE.addPracticums), подключается после заданий.
 * Файл работает и в браузере, и в Node.js (для тестов).
 */
(function (root) {
  'use strict';

  var EGE = root.EGE || (root.EGE = {});

  /**
   * Разделы кодификатора ЕГЭ по обществознанию и их темы.
   *
   * id раздела и темы постоянные: они попадают в ID заданий, практикумов и в
   * сохранённые попытки. Название можно менять, id — нет. Новую тему достаточно
   * дописать в массив topics нужного раздела. Ученик видит только темы, в которых
   * есть хотя бы один опубликованный практикум (см. EGE.getAvailableTopics).
   *
   * general: true — сводная тема «Общие вопросы» (*-GEN). Она не показывается ученику:
   * практикумов в ней быть не может (EGE.addPracticums их отклоняет). Тема остаётся
   * в реестре, потому что её задания хранятся под ней (ID заданий не меняются).
   */
  EGE.sections = [
    {
      id: 'OBS',
      title: 'Человек и общество',
      color: '#6366f1',
      // Темы по пунктам кодификатора ЕГЭ (1.4 и 1.5 объединены в «Познание»;
      // отдельной темы «Истина» нет — эти задания относятся к «Познанию»).
      topics: [
        { id: 'OBS-PER', title: 'Человек и личность' },
        { id: 'OBS-WVW', title: 'Мировоззрение и сознание' },
        { id: 'OBS-ACT', title: 'Деятельность' },
        { id: 'OBS-COG', title: 'Познание' },
        { id: 'OBS-SYS', title: 'Общество как система' },
        { id: 'OBS-INS', title: 'Социальные институты' },
        { id: 'OBS-TYP', title: 'Типы обществ' },
        { id: 'OBS-DEV', title: 'Общественное развитие и глобализация' },
        { id: 'OBS-CUL', title: 'Культура' },
        { id: 'OBS-MOR', title: 'Мораль' },
        { id: 'OBS-SCI', title: 'Наука и научное познание' },
        { id: 'OBS-EDU', title: 'Образование' },
        { id: 'OBS-REL', title: 'Религия' },
        { id: 'OBS-ART', title: 'Искусство' },
        { id: 'OBS-GEN', title: 'Общие вопросы', general: true }
      ]
    },
    {
      id: 'ECO',
      title: 'Экономика',
      color: '#0ea5e9',
      topics: [
        { id: 'ECO-GEN', title: 'Общие вопросы', general: true }
      ]
    },
    {
      id: 'SOC',
      title: 'Социальные отношения',
      color: '#10b981',
      topics: [
        { id: 'SOC-STR', title: 'Социальная стратификация' },
        { id: 'SOC-MOB', title: 'Социальная мобильность' },
        { id: 'SOC-GRP', title: 'Социальные группы' },
        { id: 'SOC-YTH', title: 'Молодёжь как социальная группа' },
        { id: 'SOC-ETH', title: 'Этнические общности' },
        { id: 'SOC-CNF', title: 'Социальный конфликт' },
        { id: 'SOC-CTL', title: 'Социальный контроль' },
        { id: 'SOC-FAM', title: 'Семья и брак' }
      ]
    },
    {
      id: 'POL',
      title: 'Политика',
      color: '#f59e0b',
      topics: [
        { id: 'POL-GEN', title: 'Общие вопросы', general: true }
      ]
    },
    {
      id: 'LAW',
      title: 'Право',
      color: '#ef4444',
      topics: [
        { id: 'LAW-GEN', title: 'Общие вопросы', general: true }
      ]
    }
  ];

  /**
   * Версия схемы банка заданий. 2 — добавлены необязательные поля source,
   * difficulty, commonFeature и mistake (см. README). Задания схемы 1
   * (без этих полей) остаются корректными.
   */
  EGE.BANK_SCHEMA_VERSION = 2;

  /**
   * Форматы для фильтра на стартовом экране. id совпадает с task.type
   * (js/scoring.js); 'all' — все форматы. Все три формата экзаменационные.
   */
  EGE.FORMATS = [
    { id: 'all', title: 'Все форматы заданий' },
    { id: 'multiple', title: 'Выбор нескольких ответов' },
    { id: 'exclude-two', title: 'Два лишних термина' },
    { id: 'matching', title: 'Установление соответствия' }
  ];

  /** Уровни сложности (поле difficulty): только для внутренней классификации, ученику не показываются. */
  EGE.DIFFICULTY_LEVELS = [1, 2, 3];

  /** Виды источника задания (поле source.kind). */
  EGE.SOURCE_KINDS = ['original', 'author'];

  /** Формат постоянного ID задания: РАЗДЕЛ-ТЕМА-НОМЕР, например SOC-STR-001. */
  EGE.TASK_ID_PATTERN = /^[A-Z]{3}-[A-Z]{3}-\d{3,4}$/;
  /** Формат id темы: РАЗДЕЛ-ТЕМА, например SOC-STR. */
  EGE.TOPIC_ID_PATTERN = /^[A-Z]{3}-[A-Z]{3}$/;

  /** Все задания в порядке регистрации. */
  EGE.tasks = [];

  var sectionsById = Object.create(null);
  var topicsById = Object.create(null);
  var tasksById = Object.create(null);
  var tasksByTopic = Object.create(null);

  EGE.sections.forEach(function (section) {
    sectionsById[section.id] = section;
    section.topics.forEach(function (topic) {
      if (!EGE.TOPIC_ID_PATTERN.test(topic.id) || topic.id.indexOf(section.id + '-') !== 0) {
        throw new Error('Некорректный id темы: ' + topic.id);
      }
      if (topicsById[topic.id]) throw new Error('Повторяющийся id темы: ' + topic.id);
      topic.section = section.id;
      topicsById[topic.id] = topic;
      tasksByTopic[topic.id] = [];
    });
  });

  EGE.getSection = function (sectionId) {
    return sectionsById[sectionId] || null;
  };

  EGE.getTopic = function (topicId) {
    return topicsById[topicId] || null;
  };

  /** Задание по постоянному ID (в том числе снятое с выдачи). */
  EGE.getTask = function (taskId) {
    return tasksById[taskId] || null;
  };

  /**
   * Регистрирует задания темы.
   * Каждое задание: { id, question, statements: [{ text, correct, explanation? }] },
   * explanation у суждения необязательно;
   * type — тип задания: 'multiple' (по умолчанию), 'exclude-two' или 'matching'
   * (для matching вместо statements — items и options, см. js/scoring.js и README);
   * instruction — необязательный текст после перечня;
   * choiceOf — для multiple: 'items', если выбираются термины или другие элементы,
   * а не суждения (меняет подсказку и подписи в разборе);
   * необязательные поля задания: version (номер редакции, по умолчанию 1)
   * и retired (true — задание больше не выдаётся, но его ID занят навсегда).
   * Схема 2 (тоже необязательные поля):
   *   source — { kind: 'original' | 'author', title, authors?, year?, ref?, adapted? }:
   *     original — задание из опубликованного пособия (title обязателен),
   *     author — авторское; adapted: true — формулировка изменена под интерфейс.
   *     Поле указывается, только если источник достоверно установлен;
   *   difficulty — 1, 2 или 3 (внутренняя классификация, ученику не показывается);
   *   commonFeature — exclude-two: что объединяет позиции, оставшиеся в ряду;
   *   mistake — у суждения или позиции matching: типичная ошибка.
   */
  EGE.addTasks = function (topicId, tasks) {
    var topic = EGE.getTopic(topicId);
    if (!topic) throw new Error('Неизвестная тема: ' + topicId);

    tasks.forEach(function (task) {
      if (!task.id) throw new Error('У задания нет id (тема ' + topicId + ')');
      if (!EGE.TASK_ID_PATTERN.test(task.id)) {
        throw new Error('Некорректный id задания: ' + task.id + ' (ожидается формат SOC-STR-001)');
      }
      if (tasksById[task.id]) throw new Error('Повторяющийся id задания: ' + task.id);
      task.topic = topicId;
      task.section = topic.section;
      tasksById[task.id] = task;
      tasksByTopic[topicId].push(task);
      EGE.tasks.push(task);
    });
  };

  function isActive(task) {
    return !task.retired;
  }

  /** Активные задания темы. */
  EGE.getTasksByTopic = function (topicId) {
    return (tasksByTopic[topicId] || []).filter(isActive);
  };

  /** Активные задания раздела ('all' или пусто — все разделы). */
  EGE.getTasksBySection = function (sectionId) {
    if (!sectionId || sectionId === 'all') return EGE.tasks.filter(isActive);
    var section = EGE.getSection(sectionId);
    if (!section) return [];
    return section.topics.reduce(function (acc, topic) {
      return acc.concat(EGE.getTasksByTopic(topic.id));
    }, []);
  };

  /** Формат задания: task.type или 'multiple' по умолчанию (как в js/scoring.js). */
  function taskFormat(task) {
    return task.type || 'multiple';
  }

  EGE.getFormat = function (formatId) {
    for (var i = 0; i < EGE.FORMATS.length; i++) {
      if (EGE.FORMATS[i].id === formatId) return EGE.FORMATS[i];
    }
    return null;
  };

  /** Оставляет задания нужного формата ('all' или пусто — все форматы). */
  EGE.filterByFormat = function (tasks, formatId) {
    if (!formatId || formatId === 'all') return tasks;
    return tasks.filter(function (task) { return taskFormat(task) === formatId; });
  };

  /**
   * Все активные задания темы, раздела или всего банка — для тестов и проверок банка.
   * Ученику задания выдаются только практикумами (см. ниже).
   * topicId = 'all' означает «весь раздел».
   * formatId — необязательный фильтр по формату ('all' или пусто — все форматы).
   */
  EGE.getPool = function (sectionId, topicId, formatId) {
    var pool = topicId && topicId !== 'all'
      ? EGE.getTasksByTopic(topicId)
      : EGE.getTasksBySection(sectionId);
    return EGE.filterByFormat(pool, formatId);
  };

  /* ---------- Практикумы ---------- */

  /**
   * Статусы практикума: published — готов и виден ученику; draft — состав
   * готовится, ученик его не видит; retired — прежний набор, заменённый
   * другими практикумами: новую попытку начать нельзя, ученик видит его, только
   * чтобы продолжить уже начатую (и сохранённую) попытку.
   */
  EGE.PRACTICUM_STATUSES = ['published', 'draft', 'retired'];

  /**
   * Формат постоянного ID: ТЕМА-PНОМЕР для практикума (OBS-COG-P01),
   * ТЕМА-RНОМЕР для прежнего набора со статусом retired (SOC-FAM-R01).
   */
  EGE.PRACTICUM_ID_PATTERN = /^[A-Z]{3}-[A-Z]{3}-[PR]\d{2}$/;

  /** Все практикумы в порядке регистрации. */
  EGE.practicums = [];

  var practicumsById = Object.create(null);

  function pad2(n) {
    return (n < 10 ? '0' : '') + n;
  }

  /**
   * Регистрирует практикумы. Подключается после файлов с заданиями: каждое задание
   * практикума должно быть уже зарегистрировано. Практикум:
   *   id       — постоянный уникальный ID: id темы + '-P' + номер из двух цифр
   *              (у прежнего набора со статусом retired — '-R' + номер);
   *   topic    — id темы; все задания практикума — из этой темы;
   *   number   — порядковый номер в теме (1 → «Практикум № 1»), совпадает с номером в id;
   *              у прежних наборов (R) своя нумерация;
   *   status   — 'published', 'draft' или 'retired' (см. EGE.PRACTICUM_STATUSES);
   *   title    — только у retired и обязательно: название для ученика,
   *              например «Прежний набор (31 задание)»;
   *   taskIds  — ID заданий: состав задаётся явно и не меняется от попытки к попытке;
   *   shuffle  — необязательно: true — задания показываются в случайном порядке,
   *              иначе — в порядке taskIds;
   *   legacyTopicAttempts — необязательно: true — незавершённая попытка, сохранённая
   *              до появления практикумов для темы целиком, продолжается в этом практикуме
   *              (если её задания совпадают с его составом). Не больше одного на тему.
   *
   * Задание может входить в прежний набор (retired) и в один из действующих практикумов;
   * между действующими практикумами задания не повторяются (проверяет тест).
   */
  EGE.addPracticums = function (list) {
    list.forEach(function (p) {
      var where = 'практикум ' + p.id;
      if (!EGE.PRACTICUM_ID_PATTERN.test(p.id || '')) throw new Error('Некорректный id практикума: ' + p.id);
      if (practicumsById[p.id]) throw new Error('Повторяющийся id практикума: ' + p.id);
      var topic = EGE.getTopic(p.topic);
      if (!topic) throw new Error('Неизвестная тема: ' + p.topic + ' (' + where + ')');
      if (topic.general) throw new Error('В «Общих вопросах» практикумов не бывает: ' + where);
      if (EGE.PRACTICUM_STATUSES.indexOf(p.status) === -1) throw new Error('Неизвестный статус: ' + where);
      var kind = p.status === 'retired' ? 'R' : 'P';
      if (!Number.isInteger(p.number) || p.number < 1 || p.id !== p.topic + '-' + kind + pad2(p.number)) {
        throw new Error('Номер практикума не совпадает с id: ' + where);
      }
      if (kind === 'R' && !(typeof p.title === 'string' && p.title)) throw new Error('У прежнего набора нет названия: ' + where);
      if (kind === 'P' && p.title !== undefined) throw new Error('Название практикума — только «Практикум № N»: ' + where);
      if (!Array.isArray(p.taskIds) || p.taskIds.length === 0) throw new Error('В практикуме нет заданий: ' + where);
      if (new Set(p.taskIds).size !== p.taskIds.length) throw new Error('Задания повторяются: ' + where);
      p.taskIds.forEach(function (id) {
        var task = EGE.getTask(id);
        if (!task) throw new Error('Неизвестное задание ' + id + ' (' + where + ')');
        if (task.topic !== p.topic) throw new Error('Задание ' + id + ' не из темы ' + p.topic + ' (' + where + ')');
      });
      EGE.practicums.forEach(function (other) {
        if (other.topic !== p.topic) return;
        if (other.number === p.number && (other.status === 'retired') === (kind === 'R')) throw new Error('Повторяющийся номер практикума: ' + where);
        if (other.legacyTopicAttempts && p.legacyTopicAttempts) {
          throw new Error('legacyTopicAttempts — только у одного практикума темы: ' + where);
        }
      });
      p.section = topic.section;
      practicumsById[p.id] = p;
      EGE.practicums.push(p);
    });
  };

  EGE.getPracticum = function (practicumId) {
    return practicumsById[practicumId] || null;
  };

  /** Задания практикума в порядке taskIds. */
  EGE.getPracticumTasks = function (practicum) {
    return practicum.taskIds.map(EGE.getTask);
  };

  /**
   * Готов ли практикум для ученика: опубликован, и все его задания на месте
   * и выдаются (снятое с выдачи задание делает практикум недоступным, а не
   * молча меняет его состав).
   */
  function hasActiveTasks(practicum) {
    return practicum.taskIds.every(function (id) {
      var task = EGE.getTask(id);
      return !!task && isActive(task);
    });
  }

  EGE.isPracticumReady = function (practicum) {
    return practicum.status === 'published' && hasActiveTasks(practicum);
  };

  /**
   * Можно ли продолжить сохранённую попытку: опубликованный практикум или прежний
   * набор (retired), задания которого на месте. Начать прежний набор заново нельзя.
   */
  EGE.isPracticumContinuable = function (practicum) {
    return (practicum.status === 'published' || practicum.status === 'retired') && hasActiveTasks(practicum);
  };

  /** Все практикумы темы (в том числе черновики и прежние наборы) по порядковому номеру. */
  EGE.getPracticumsByTopic = function (topicId) {
    return EGE.practicums
      .filter(function (p) { return p.topic === topicId; })
      .sort(function (a, b) { return a.number - b.number; });
  };

  /** Прежние наборы темы, попытки которых ещё можно продолжить (показываются только при сохранении). */
  EGE.getRetiredPracticums = function (topicId) {
    return EGE.getPracticumsByTopic(topicId).filter(function (p) {
      return p.status === 'retired' && EGE.isPracticumContinuable(p);
    });
  };

  /** Практикумы темы, которые видит ученик. */
  EGE.getPublishedPracticums = function (topicId) {
    return EGE.getPracticumsByTopic(topicId).filter(EGE.isPracticumReady);
  };

  /** Максимальный балл за практикум по системе оценивания (js/scoring.js). */
  EGE.getPracticumMaxScore = function (practicum) {
    return EGE.getPracticumTasks(practicum).reduce(function (sum, task) {
      return sum + EGE.scoring.getMaxPoints(task);
    }, 0);
  };

  /** Название для ученика: «Практикум № 1»; у прежнего набора — его title. */
  EGE.practicumTitle = function (practicum) {
    return practicum.status === 'retired' ? practicum.title : 'Практикум № ' + practicum.number;
  };

  /** Темы раздела, в которых есть хотя бы один опубликованный практикум. */
  EGE.getAvailableTopics = function (sectionId) {
    var section = EGE.getSection(sectionId);
    if (!section) return [];
    return section.topics.filter(function (topic) {
      return EGE.getPublishedPracticums(topic.id).length > 0;
    });
  };

  /** Разделы, в которых есть хотя бы одна тема с опубликованным практикумом. */
  EGE.getAvailableSections = function () {
    return EGE.sections.filter(function (section) {
      return EGE.getAvailableTopics(section.id).length > 0;
    });
  };
})(typeof window !== 'undefined' ? window : globalThis);
