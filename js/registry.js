/**
 * Реестр разделов, тем и заданий.
 *
 * Структура банка: раздел → тема → задания.
 * Файлы с заданиями (data/tasks/**.js) подключаются после этого файла
 * и регистрируют задания через EGE.addTasks(topicId, [...]).
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
        { id: 'OBS-GEN', title: 'Общие вопросы' }
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
   * необязательные поля задания: version (номер редакции, по умолчанию 1)
   * и retired (true — задание больше не выдаётся, но его ID занят навсегда).
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

  /**
   * Пул заданий для тренировки: одна тема, весь раздел или все разделы.
   * topicId = 'all' означает «весь раздел».
   */
  EGE.getPool = function (sectionId, topicId) {
    if (topicId && topicId !== 'all') return EGE.getTasksByTopic(topicId);
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
