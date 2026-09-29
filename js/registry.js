/**
 * Реестр разделов, тем и заданий.
 *
 * Структура банка: раздел → тема → наборы заданий (тренажёры) → задания.
 * Файлы с заданиями (data/tasks/**.js) подключаются после этого файла
 * и регистрируют задания через EGE.addTaskSet(topicId, { id, title, tasks })
 * или, если у темы один набор, короче — EGE.addTasks(topicId, [...]).
 * Файл работает и в браузере, и в Node.js (для тестов).
 */
(function (root) {
  'use strict';

  var EGE = root.EGE || (root.EGE = {});

  /**
   * Разделы кодификатора ЕГЭ по обществознанию и их темы.
   *
   * id раздела и темы постоянные: они попадают в ID заданий и в сохранённые
   * попытки. Название можно менять, id — нет. Новую тему достаточно дописать
   * в массив topics нужного раздела. Темы без заданий ученику не показываются.
   */
  EGE.sections = [
    {
      id: 'OBS',
      title: 'Человек и общество',
      color: '#6366f1',
      topics: [
        { id: 'OBS-SOC', title: 'Общество' },
        { id: 'OBS-ACT', title: 'Деятельность' },
        { id: 'OBS-COG', title: 'Познание' }
      ]
    },
    {
      id: 'ECO',
      title: 'Экономика',
      color: '#0ea5e9',
      topics: [
        { id: 'ECO-GEN', title: 'Общие вопросы' }
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
        { id: 'POL-GEN', title: 'Общие вопросы' }
      ]
    },
    {
      id: 'LAW',
      title: 'Право',
      color: '#ef4444',
      topics: [
        { id: 'LAW-GEN', title: 'Общие вопросы' }
      ]
    }
  ];

  /** Формат постоянного ID задания: РАЗДЕЛ-ТЕМА-НОМЕР, например SOC-STR-001. */
  EGE.TASK_ID_PATTERN = /^[A-Z]{3}-[A-Z]{3}-\d{3,4}$/;
  /** Формат id темы: РАЗДЕЛ-ТЕМА, например SOC-STR. */
  EGE.TOPIC_ID_PATTERN = /^[A-Z]{3}-[A-Z]{3}$/;
  /** Формат id набора заданий (тренажёра): ТЕМА-T-НОМЕР, например OBS-COG-T1. */
  EGE.SET_ID_PATTERN = /^[A-Z]{3}-[A-Z]{3}-T\d+$/;

  /** Все задания в порядке регистрации. */
  EGE.tasks = [];

  var sectionsById = Object.create(null);
  var topicsById = Object.create(null);
  var tasksById = Object.create(null);
  var tasksByTopic = Object.create(null);
  var setsById = Object.create(null);

  EGE.sections.forEach(function (section) {
    sectionsById[section.id] = section;
    section.topics.forEach(function (topic) {
      if (!EGE.TOPIC_ID_PATTERN.test(topic.id) || topic.id.indexOf(section.id + '-') !== 0) {
        throw new Error('Некорректный id темы: ' + topic.id);
      }
      if (topicsById[topic.id]) throw new Error('Повторяющийся id темы: ' + topic.id);
      topic.section = section.id;
      topicsById[topic.id] = topic;
      topic.sets = [];
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

  /** Набор заданий по id (в том числе без активных заданий). */
  EGE.getSet = function (setId) {
    return setsById[setId] || null;
  };

  /** id набора по умолчанию: первый тренажёр темы, OBS-ACT → OBS-ACT-T1. */
  EGE.defaultSetId = function (topicId) {
    return topicId + '-T1';
  };

  /**
   * Регистрирует набор заданий (тренажёр) темы и его задания.
   * set: { id, title, tasks: [...] }; id — постоянный, вида ТЕМА-T1, ТЕМА-T2…
   * Повторный вызов с тем же id дописывает задания в конец набора.
   * Порядок наборов в теме — порядок их первой регистрации.
   * Задание принадлежит ровно одному набору, поэтому счётчик темы —
   * это сумма наборов без двойного подсчёта.
   * Набор, объявленный так явно, помечается explicit: тема с явными наборами
   * показывает выбор тренажёра даже при одном наборе (см. EGE.showsSetChoice).
   */
  EGE.addTaskSet = function (topicId, set) {
    return registerSet(topicId, set, true);
  };

  function registerSet(topicId, set, explicit) {
    var topic = EGE.getTopic(topicId);
    if (!topic) throw new Error('Неизвестная тема: ' + topicId);
    if (!set || !EGE.SET_ID_PATTERN.test(set.id) || set.id.indexOf(topicId + '-T') !== 0) {
      throw new Error('Некорректный id набора: ' + (set && set.id) + ' (ожидается формат ' + topicId + '-T1)');
    }
    var existing = setsById[set.id];
    if (existing && set.title && set.title !== existing.title) {
      throw new Error('Набор ' + set.id + ' уже зарегистрирован с названием «' + existing.title + '»');
    }
    if (!existing) {
      if (!set.title) throw new Error('У набора ' + set.id + ' нет названия');
      existing = { id: set.id, title: set.title, topic: topicId, section: topic.section, explicit: false, tasks: [] };
      setsById[set.id] = existing;
      topic.sets.push(existing);
    }
    if (explicit) existing.explicit = true;
    registerTasks(topic, existing, set.tasks || []);
    return existing;
  }

  /**
   * Регистрирует задания темы в её набор по умолчанию «Тренажёр 1» (ТЕМА-T1).
   * Подходит для тем с одним набором; для второго и следующих — EGE.addTaskSet.
   * Такой набор неявный: пока он у темы единственный, выбор тренажёра не показывается.
   * Каждое задание: { id, question, statements: [{ text, correct, explanation? }] },
   * explanation у суждения необязательно;
   * type — тип задания: 'multiple' (по умолчанию), 'exclude-two' или 'matching'
   * (для matching вместо statements — items и options, см. js/scoring.js и README);
   * instruction — необязательный текст после перечня;
   * choiceOf — для multiple: 'items', если выбираются термины или другие элементы,
   * а не суждения (меняет подсказку и подписи в разборе);
   * необязательные поля задания: version (номер редакции, по умолчанию 1)
   * и retired (true — задание больше не выдаётся, но его ID занят навсегда).
   */
  EGE.addTasks = function (topicId, tasks) {
    if (!EGE.getTopic(topicId)) throw new Error('Неизвестная тема: ' + topicId);
    var setId = EGE.defaultSetId(topicId);
    // Название задаётся только при создании набора: если «Тренажёр 1» уже
    // зарегистрирован через addTaskSet (возможно, под другим названием), задания дописываются в него.
    return registerSet(topicId, { id: setId, title: EGE.getSet(setId) ? undefined : 'Тренажёр 1', tasks: tasks }, false);
  };

  function registerTasks(topic, set, tasks) {
    var topicId = topic.id;
    tasks.forEach(function (task) {
      if (!task.id) throw new Error('У задания нет id (тема ' + topicId + ')');
      if (!EGE.TASK_ID_PATTERN.test(task.id)) {
        throw new Error('Некорректный id задания: ' + task.id + ' (ожидается формат SOC-STR-001)');
      }
      if (tasksById[task.id]) throw new Error('Повторяющийся id задания: ' + task.id);
      task.topic = topicId;
      task.section = topic.section;
      task.set = set.id;
      tasksById[task.id] = task;
      tasksByTopic[topicId].push(task);
      set.tasks.push(task);
      EGE.tasks.push(task);
    });
  }

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

  /** Активные задания набора. */
  EGE.getTasksBySet = function (setId) {
    var set = EGE.getSet(setId);
    return set ? set.tasks.filter(isActive) : [];
  };

  /** Наборы темы, в которых есть хотя бы одно активное задание (пустые скрыты). */
  EGE.getAvailableSets = function (topicId) {
    var topic = EGE.getTopic(topicId);
    if (!topic) return [];
    return topic.sets.filter(function (set) {
      return EGE.getTasksBySet(set.id).length > 0;
    });
  };

  /**
   * Показывать ли у темы выбор тренажёра: если среди её непустых наборов есть
   * объявленный через EGE.addTaskSet (даже единственный) или непустых наборов
   * два и больше. Тема только с неявным «Тренажёром 1» из EGE.addTasks выбора
   * не показывает; пустой объявленный набор его тоже не включает.
   */
  EGE.showsSetChoice = function (topicId) {
    var sets = EGE.getAvailableSets(topicId);
    return sets.length > 1 || sets.some(function (set) { return set.explicit; });
  };

  /**
   * Пул заданий для тренировки: один набор темы, вся тема, весь раздел или все разделы.
   * topicId = 'all' означает «весь раздел»; setId не задан или 'all' — все наборы темы.
   */
  EGE.getPool = function (sectionId, topicId, setId) {
    if (topicId && topicId !== 'all') {
      if (setId && setId !== 'all') {
        var set = EGE.getSet(setId);
        return set && set.topic === topicId ? EGE.getTasksBySet(setId) : [];
      }
      return EGE.getTasksByTopic(topicId);
    }
    return EGE.getTasksBySection(sectionId);
  };

  /** Темы раздела, в которых есть хотя бы одно активное задание. */
  EGE.getAvailableTopics = function (sectionId) {
    var section = EGE.getSection(sectionId);
    if (!section) return [];
    return section.topics.filter(function (topic) {
      return EGE.getTasksByTopic(topic.id).length > 0;
    });
  };

  /** Разделы, в которых есть хотя бы одно активное задание. */
  EGE.getAvailableSections = function () {
    return EGE.sections.filter(function (section) {
      return EGE.getTasksBySection(section.id).length > 0;
    });
  };
})(typeof window !== 'undefined' ? window : globalThis);
