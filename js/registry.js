/**
 * Реестр тем и заданий.
 *
 * Файлы с заданиями (data/tasks/*.js) подключаются после этого файла
 * и регистрируют задания через EGE.addTasks(topicId, [...]).
 * Файл работает и в браузере, и в Node.js (для тестов).
 */
(function (root) {
  'use strict';

  var EGE = root.EGE || (root.EGE = {});

  /** Разделы кодификатора ЕГЭ по обществознанию. */
  EGE.topics = [
    { id: 'society', title: 'Человек и общество', color: '#6366f1' },
    { id: 'economy', title: 'Экономика', color: '#0ea5e9' },
    { id: 'social', title: 'Социальные отношения', color: '#10b981' },
    { id: 'politics', title: 'Политика', color: '#f59e0b' },
    { id: 'law', title: 'Право', color: '#ef4444' }
  ];

  EGE.tasks = [];

  var ids = Object.create(null);

  EGE.getTopic = function (topicId) {
    for (var i = 0; i < EGE.topics.length; i++) {
      if (EGE.topics[i].id === topicId) return EGE.topics[i];
    }
    return null;
  };

  /**
   * Регистрирует задания темы.
   * Каждое задание: { id, question, statements: [{ text, correct, explanation }] }.
   */
  EGE.addTasks = function (topicId, tasks) {
    if (!EGE.getTopic(topicId)) {
      throw new Error('Неизвестная тема: ' + topicId);
    }
    tasks.forEach(function (task) {
      if (!task.id) throw new Error('У задания нет id (тема ' + topicId + ')');
      if (ids[task.id]) throw new Error('Повторяющийся id задания: ' + task.id);
      ids[task.id] = true;
      task.topic = topicId;
      EGE.tasks.push(task);
    });
  };

  EGE.getTasksByTopic = function (topicId) {
    if (!topicId || topicId === 'all') return EGE.tasks.slice();
    return EGE.tasks.filter(function (t) { return t.topic === topicId; });
  };
})(typeof window !== 'undefined' ? window : globalThis);
