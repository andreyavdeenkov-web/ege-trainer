/**
 * Интерфейс тренажёра: стартовый экран, решение заданий, итоги.
 * Зависит от js/registry.js, js/scoring.js, js/attempt.js, js/task-view.js
 * и файлов data/tasks/**.js.
 */
(function () {
  'use strict';

  var EGE = window.EGE;
  var scoring = EGE.scoring;
  var A = EGE.attempt;
  var view = EGE.taskView;
  var el = view.el;

  var COUNT_OPTIONS = [
    { value: '5', label: '5' },
    { value: '10', label: '10' },
    { value: 'all', label: 'Все' }
  ];
  var STORAGE_KEY = 'ege-trainer:settings';

  var HINT_SELECT = 'Отметьте все верные суждения. Можно выбрать несколько вариантов.';
  var HINT_ANSWERED = 'Ответ засчитан — изменить его нельзя.';

  var $ = function (id) { return document.getElementById(id); };

  var ui = {
    screens: {
      start: $('screen-start'),
      quiz: $('screen-quiz'),
      result: $('screen-result')
    },
    startForm: $('start-form'),
    sectionOptions: $('section-options'),
    topicField: $('topic-field'),
    topicOptions: $('topic-options'),
    countOptions: $('count-options'),
    startBtn: $('start-btn'),
    brandHome: $('brand-home'),
    exitBar: $('exit-bar'),
    exitCancel: $('exit-cancel'),
    exitConfirm: $('exit-confirm'),

    progressLabel: $('progress-label'),
    progressBar: $('progress-bar'),
    progressFill: $('progress-fill'),
    scorePill: $('score-pill'),
    taskNav: $('task-nav'),
    taskCard: $('task-card'),
    taskTopic: $('task-topic'),
    taskQuestion: $('task-question'),
    taskHint: $('task-hint'),
    statements: $('statements'),
    feedback: $('feedback'),
    feedbackPoints: $('feedback-points'),
    feedbackCorrect: $('feedback-correct'),
    feedbackUser: $('feedback-user'),
    prevBtn: $('prev-btn'),
    currentBtn: $('current-btn'),
    submitBtn: $('submit-btn'),
    nextBtn: $('next-btn'),

    resultRing: $('result-ring'),
    resultPercent: $('result-percent'),
    resultScore: $('result-score'),
    resultMessage: $('result-message'),
    reviewTitle: $('review-title'),
    reviewFilter: $('review-filter'),
    filterAllLabel: $('filter-all-label'),
    filterMistakesLabel: $('filter-mistakes-label'),
    reviewList: $('review-list'),
    expandAllBtn: $('expand-all-btn'),
    restartBtn: $('restart-btn'),
    homeBtn: $('home-btn')
  };

  var settings = loadSettings();

  var state = {
    attempt: null,  // текущая попытка (см. js/attempt.js)
    viewIndex: 0,   // задание, которое показано на экране (с 0)
    draft: []       // отметки в текущем, ещё не отвеченном задании
  };

  /* ---------- Утилиты ---------- */

  function shuffle(list) {
    var arr = list.slice();
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
    return arr;
  }

  function tasksWord(n) {
    var mod10 = n % 10;
    var mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return 'задание';
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'задания';
    return 'заданий';
  }

  function isValidSection(id) {
    return id === 'all' || EGE.getAvailableSections().some(function (s) { return s.id === id; });
  }

  function isValidTopic(sectionId, topicId) {
    if (topicId === 'all') return true;
    if (sectionId === 'all') return false;
    return EGE.getAvailableTopics(sectionId).some(function (t) { return t.id === topicId; });
  }

  function loadSettings() {
    var result = { section: 'all', topic: 'all', count: '5' };
    try {
      var saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (saved && typeof saved === 'object') {
        if (isValidSection(saved.section)) result.section = saved.section;
        if (isValidTopic(result.section, saved.topic)) result.topic = saved.topic;
        if (COUNT_OPTIONS.some(function (o) { return o.value === saved.count; })) result.count = saved.count;
      }
    } catch (e) { /* хранилище недоступно — используем значения по умолчанию */ }
    return result;
  }

  function saveSettings() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch (e) { /* не критично */ }
  }

  /** Вызов точки расширения (будущая отправка в БД). Ошибка в ней не ломает тренировку. */
  function notifyStore(method, args) {
    var store = EGE.attemptStore;
    if (!store || typeof store[method] !== 'function') return;
    try {
      store[method].apply(store, args);
    } catch (e) {
      if (window.console) console.error('EGE.attemptStore.' + method + ':', e);
    }
  }

  /** Снимает фокус с кнопки, которая сейчас будет скрыта. */
  function releaseFocus() {
    var active = document.activeElement;
    if (active && active !== document.body && typeof active.blur === 'function') active.blur();
  }

  function showScreen(name) {
    releaseFocus();
    ui.exitBar.hidden = true;
    Object.keys(ui.screens).forEach(function (key) {
      ui.screens[key].hidden = key !== name;
    });
    window.scrollTo(0, 0);
  }

  /* ---------- Стартовый экран ---------- */

  function optionCard(name, value, title, count, color, checked) {
    var label = el('label', 'topic-option');
    if (color) label.style.setProperty('--topic-color', color);

    var input = el('input');
    input.type = 'radio';
    input.name = name;
    input.value = value;
    input.checked = checked;

    var body = el('span', 'topic-option__body');
    body.appendChild(el('span', 'topic-option__dot'));
    body.appendChild(el('span', 'topic-option__title', title));
    body.appendChild(el('span', 'topic-option__count', count + ' ' + tasksWord(count)));

    label.appendChild(input);
    label.appendChild(body);
    return label;
  }

  function renderStart() {
    ui.sectionOptions.textContent = '';
    ui.sectionOptions.appendChild(optionCard('section', 'all', 'Все разделы',
      EGE.getTasksBySection('all').length, null, settings.section === 'all'));
    EGE.getAvailableSections().forEach(function (section) {
      ui.sectionOptions.appendChild(optionCard('section', section.id, section.title,
        EGE.getTasksBySection(section.id).length, section.color, settings.section === section.id));
    });

    renderTopicOptions();

    ui.countOptions.textContent = '';
    COUNT_OPTIONS.forEach(function (opt) {
      var label = el('label', 'segmented__item');
      var input = el('input');
      input.type = 'radio';
      input.name = 'count';
      input.value = opt.value;
      input.checked = settings.count === opt.value;
      label.appendChild(input);
      label.appendChild(el('span', null, opt.label));
      ui.countOptions.appendChild(label);
    });

    updateStartButton();
  }

  /** Темы выбранного раздела. Темы без заданий не показываются. */
  function renderTopicOptions() {
    ui.topicOptions.textContent = '';
    var section = EGE.getSection(settings.section);
    ui.topicField.hidden = !section;
    if (!section) return;

    ui.topicOptions.appendChild(optionCard('topic', 'all', 'Весь раздел',
      EGE.getTasksBySection(section.id).length, section.color, settings.topic === 'all'));
    EGE.getAvailableTopics(section.id).forEach(function (topic) {
      ui.topicOptions.appendChild(optionCard('topic', topic.id, topic.title,
        EGE.getTasksByTopic(topic.id).length, section.color, settings.topic === topic.id));
    });
  }

  function currentPool() {
    return EGE.getPool(settings.section, settings.topic);
  }

  function plannedCount() {
    var available = currentPool().length;
    if (settings.count === 'all') return available;
    return Math.min(available, parseInt(settings.count, 10));
  }

  function updateStartButton() {
    var n = plannedCount();
    ui.startBtn.disabled = n === 0;
    ui.startBtn.textContent = n === 0
      ? 'Здесь пока нет заданий'
      : 'Начать: ' + n + ' ' + tasksWord(n);
  }

  function readStartForm() {
    var data = new FormData(ui.startForm);
    var section = data.get('section') || 'all';
    if (section !== settings.section) {
      // При смене раздела выбор темы сбрасывается на «Весь раздел».
      settings.section = section;
      settings.topic = 'all';
      renderTopicOptions();
    } else {
      settings.topic = data.get('topic') || 'all';
    }
    settings.count = data.get('count') || '5';
  }

  /* ---------- Тренировка ---------- */

  function startSession() {
    var pool = shuffle(currentPool()).slice(0, plannedCount());
    if (pool.length === 0) {
      showStart();
      return;
    }
    state.attempt = A.createAttempt({
      settings: { section: settings.section, topic: settings.topic, count: settings.count },
      taskIds: pool.map(function (t) { return t.id; })
    });
    state.viewIndex = 0;
    state.draft = [];
    showScreen('quiz');
    renderView();
  }

  function taskAt(index) {
    return EGE.getTask(state.attempt.taskIds[index]);
  }

  function viewedAnswer() {
    return A.getAnswer(state.attempt, state.viewIndex);
  }

  function renderProgress() {
    var attempt = state.attempt;
    var total = attempt.taskIds.length;
    var done = A.answeredCount(attempt);
    ui.progressLabel.textContent = 'Задание ' + (state.viewIndex + 1) + ' из ' + total +
      ' · выполнено ' + done;
    ui.scorePill.textContent = 'Баллы: ' + A.totalScore(attempt);
    ui.progressFill.style.width = (done / total) * 100 + '%';
    ui.progressBar.setAttribute('aria-valuemax', String(total));
    ui.progressBar.setAttribute('aria-valuenow', String(done));
  }

  /** Полоса номеров: выполненные (по баллам), текущее, ещё не выполненные. */
  function renderNav() {
    var attempt = state.attempt;
    var current = A.currentIndex(attempt);
    var activeBtn = null;
    ui.taskNav.textContent = '';

    attempt.taskIds.forEach(function (id, i) {
      var answer = A.getAnswer(attempt, i);
      var li = el('li');
      var btn = el('button', 'task-nav__item', String(i + 1));
      btn.type = 'button';
      var label = 'Задание ' + (i + 1) + ': ';

      if (answer) {
        btn.classList.add('is-done', 'points--' + answer.points);
        label += 'выполнено, ' + answer.points + ' ' + scoring.pluralPoints(answer.points);
      } else if (i === current) {
        btn.classList.add('is-current');
        label += 'текущее';
      } else {
        btn.classList.add('is-locked');
        btn.disabled = true;
        label += 'ещё не выполнено';
      }
      if (i === state.viewIndex) {
        btn.classList.add('is-viewed');
        btn.setAttribute('aria-current', 'step');
        activeBtn = btn;
      }
      btn.setAttribute('aria-label', label);
      btn.title = label;
      if (!btn.disabled) {
        btn.addEventListener('click', function () { goTo(i); });
      }
      li.appendChild(btn);
      ui.taskNav.appendChild(li);
    });

    // Держим показанное задание в поле видимости горизонтальной полосы.
    if (activeBtn) {
      var list = ui.taskNav;
      var left = activeBtn.offsetLeft; // список — offsetParent (position: relative)
      var right = left + activeBtn.offsetWidth;
      if (left < list.scrollLeft || right > list.scrollLeft + list.clientWidth) {
        list.scrollLeft = left - (list.clientWidth - activeBtn.offsetWidth) / 2;
      }
    }
  }

  /** Показывает задание state.viewIndex: для выбора ответа или с разбором. */
  function renderView() {
    var attempt = state.attempt;
    var task = taskAt(state.viewIndex);
    var answer = viewedAnswer();
    releaseFocus();

    ui.taskTopic.textContent = view.topicLabel(task);
    ui.taskTopic.style.setProperty('--topic-color', EGE.getSection(task.section).color);
    ui.taskQuestion.textContent = task.question;
    ui.taskHint.textContent = answer ? HINT_ANSWERED : HINT_SELECT;
    ui.taskCard.classList.toggle('is-review', !!answer);

    view.renderStatements(ui.statements, task, {
      answer: answer,
      selected: state.draft,
      onToggle: toggleStatement
    });

    if (answer) {
      view.renderFeedback({
        points: ui.feedbackPoints,
        correct: ui.feedbackCorrect,
        user: ui.feedbackUser
      }, answer);
    }
    ui.feedback.hidden = !answer;

    renderActions();
    renderProgress();
    renderNav();
  }

  function renderActions() {
    var attempt = state.attempt;
    var answer = viewedAnswer();
    var last = attempt.taskIds.length - 1;
    var reachable = A.lastReachableIndex(attempt);

    ui.prevBtn.hidden = state.viewIndex === 0;
    ui.submitBtn.hidden = !!answer;
    ui.submitBtn.disabled = state.draft.length === 0;
    ui.nextBtn.hidden = !answer;
    ui.nextBtn.textContent = state.viewIndex === last ? 'Посмотреть результаты' : 'Следующее задание';
    // «К текущему» нужна, только если до текущего задания больше одного шага.
    ui.currentBtn.hidden = !answer || state.viewIndex >= reachable - 1;
    ui.currentBtn.textContent = A.isComplete(attempt) ? 'К последнему заданию' : 'К текущему заданию';
  }

  function goTo(index) {
    if (!A.canView(state.attempt, index) || index === state.viewIndex) return;
    state.viewIndex = index;
    renderView();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function toggleStatement(number) {
    if (viewedAnswer()) return;
    var pos = state.draft.indexOf(number);
    if (pos === -1) state.draft.push(number);
    else state.draft.splice(pos, 1);

    view.setStatementSelected(ui.statements, number, pos === -1);
    ui.submitBtn.disabled = state.draft.length === 0;
  }

  function submitAnswer() {
    var attempt = state.attempt;
    if (viewedAnswer() || state.draft.length === 0) return;
    if (state.viewIndex !== A.currentIndex(attempt)) return;

    var answer = A.recordAnswer(attempt, taskAt(state.viewIndex), state.draft);
    state.draft = [];
    notifyStore('onAnswer', [A.snapshot(answer), A.snapshot(attempt)]);

    renderView();
    ui.nextBtn.focus({ preventScroll: true });
    ui.feedback.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function nextTask() {
    if (!viewedAnswer()) return;
    if (state.viewIndex < state.attempt.taskIds.length - 1) {
      goTo(state.viewIndex + 1);
    } else if (A.isComplete(state.attempt)) {
      showResults();
    }
  }

  /* ---------- Итоги ---------- */

  function showResults() {
    var attempt = state.attempt;
    if (!attempt.finishedAt) {
      A.finishAttempt(attempt);
      notifyStore('onFinish', [A.snapshot(attempt)]);
    }

    var score = A.totalScore(attempt);
    var max = A.maxScore(attempt);
    var pct = scoring.percent(score, max);

    ui.resultPercent.textContent = pct + '%';
    ui.resultRing.style.setProperty('--pct', String(pct));
    ui.resultRing.className = 'result__ring ' + (pct >= 80 ? 'is-high' : pct >= 50 ? 'is-mid' : 'is-low');
    ui.resultScore.textContent = score + ' из ' + max + ' ' + scoring.pluralPoints(max);
    ui.resultMessage.textContent = resultMessage(pct);

    var mistakes = A.mistakeIndexes(attempt).length;
    ui.filterAllLabel.textContent = 'Все задания (' + attempt.taskIds.length + ')';
    ui.filterMistakesLabel.textContent = 'Только с ошибками (' + mistakes + ')';
    setReviewFilter(mistakes > 0 ? 'mistakes' : 'all');

    showScreen('result');
  }

  function setReviewFilter(value) {
    ui.reviewFilter.querySelectorAll('input').forEach(function (input) {
      input.checked = input.value === value;
    });
    renderReview(value);
  }

  /** Список заданий попытки; каждое раскрывается в полный разбор. */
  function renderReview(filter) {
    var attempt = state.attempt;
    ui.reviewList.textContent = '';

    var indexes = filter === 'mistakes'
      ? A.mistakeIndexes(attempt)
      : attempt.taskIds.map(function (id, i) { return i; });

    if (indexes.length === 0) {
      ui.reviewList.appendChild(el('li', 'review-list__empty',
        'Ошибок нет — все задания выполнены верно. Отличная работа!'));
    }

    indexes.forEach(function (i) {
      var task = taskAt(i);
      var answer = A.getAnswer(attempt, i);
      var li = el('li', 'review-item');
      var details = el('details', 'review-item__details');
      var summary = el('summary', 'review-item__summary');

      var head = el('div', 'mistake__head');
      head.appendChild(el('span', 'mistake__num', 'Задание ' + (i + 1)));
      head.appendChild(view.topicChip(task, true));
      head.appendChild(el('span', 'mistake__points points--' + answer.points,
        answer.points + ' ' + scoring.pluralPoints(answer.points)));
      summary.appendChild(head);
      summary.appendChild(el('p', 'mistake__question', task.question));

      var answers = el('p', 'mistake__answers');
      answers.appendChild(el('span', null, 'Ваш ответ: '));
      answers.appendChild(el('strong', answer.points === scoring.MAX_SCORE ? 'text-right' : 'text-wrong',
        scoring.formatAnswer(answer.selected)));
      answers.appendChild(el('span', null, ' · Правильный: '));
      answers.appendChild(el('strong', 'text-right', scoring.formatAnswer(answer.correct)));
      summary.appendChild(answers);
      summary.appendChild(el('span', 'review-item__toggle', 'Показать разбор'));

      var body = el('div', 'review-item__body');
      var list = el('ol', 'statements');
      view.renderStatements(list, task, { answer: answer });
      body.appendChild(list);
      body.appendChild(view.createFeedback(answer));

      details.appendChild(summary);
      details.appendChild(body);
      details.addEventListener('toggle', updateExpandAllButton);
      li.appendChild(details);
      ui.reviewList.appendChild(li);
    });

    updateExpandAllButton();
  }

  function reviewDetails() {
    return Array.prototype.slice.call(ui.reviewList.querySelectorAll('details'));
  }

  function updateExpandAllButton() {
    var all = reviewDetails();
    ui.expandAllBtn.hidden = all.length === 0;
    var allOpen = all.length > 0 && all.every(function (d) { return d.open; });
    ui.expandAllBtn.textContent = allOpen ? 'Свернуть все' : 'Развернуть все';
  }

  function resultMessage(pct) {
    if (pct === 100) return 'Идеально! Все ответы верные.';
    if (pct >= 80) return 'Отличный результат! Осталось разобрать несколько неточностей.';
    if (pct >= 50) return 'Неплохо, но есть над чем поработать. Перечитайте объяснения к ошибкам.';
    return 'Стоит повторить теорию по этой теме и попробовать ещё раз.';
  }

  function showStart() {
    renderStart();
    showScreen('start');
  }

  /* ---------- События ---------- */

  ui.startForm.addEventListener('change', function () {
    readStartForm();
    saveSettings();
    updateStartButton();
  });

  ui.startForm.addEventListener('submit', function (e) {
    e.preventDefault();
    readStartForm();
    saveSettings();
    startSession();
  });

  ui.prevBtn.addEventListener('click', function () { goTo(state.viewIndex - 1); });
  ui.currentBtn.addEventListener('click', function () { goTo(A.lastReachableIndex(state.attempt)); });
  ui.submitBtn.addEventListener('click', submitAnswer);
  ui.nextBtn.addEventListener('click', nextTask);
  ui.restartBtn.addEventListener('click', startSession);
  ui.homeBtn.addEventListener('click', showStart);

  ui.reviewFilter.addEventListener('change', function (e) {
    renderReview(e.target.value);
  });
  ui.expandAllBtn.addEventListener('click', function () {
    var all = reviewDetails();
    var open = !all.every(function (d) { return d.open; });
    all.forEach(function (d) { d.open = open; });
    updateExpandAllButton();
  });

  // Подтверждение выхода — в самой странице: window.confirm() блокируется
  // во встроенных просмотрщиках (iframe с sandbox).
  ui.brandHome.addEventListener('click', function () {
    var inProgress = !ui.screens.quiz.hidden && state.attempt && A.answeredCount(state.attempt) > 0;
    if (!inProgress) {
      showStart();
      return;
    }
    ui.exitBar.hidden = false;
    window.scrollTo({ top: 0, behavior: 'smooth' });
    ui.exitCancel.focus({ preventScroll: true });
  });
  ui.exitCancel.addEventListener('click', function () { ui.exitBar.hidden = true; });
  ui.exitConfirm.addEventListener('click', showStart);

  document.addEventListener('keydown', function (e) {
    if (ui.screens.quiz.hidden || e.ctrlKey || e.metaKey || e.altKey) return;
    var tag = e.target && e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    var answered = !!viewedAnswer();

    if (/^[1-9]$/.test(e.key)) {
      if (answered) return;
      var n = parseInt(e.key, 10);
      if (n <= taskAt(state.viewIndex).statements.length) {
        e.preventDefault();
        toggleStatement(n);
      }
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      goTo(state.viewIndex + (e.key === 'ArrowLeft' ? -1 : 1));
    } else if (e.key === 'Enter') {
      // Enter на кнопке и так вызывает click — не дублируем действие.
      // Исключение — суждения: там Enter означает «Ответить».
      if (tag === 'BUTTON' && !e.target.classList.contains('statement__btn')) return;
      e.preventDefault();
      if (answered) nextTask();
      else submitAnswer();
    }
  });

  showStart();
})();
