/**
 * Интерфейс тренажёра: стартовый экран, решение заданий, итоги.
 * Зависит от js/registry.js, js/scoring.js и файлов data/tasks/*.js.
 */
(function () {
  'use strict';

  var EGE = window.EGE;
  var scoring = EGE.scoring;

  var COUNT_OPTIONS = [
    { value: '5', label: '5' },
    { value: '10', label: '10' },
    { value: 'all', label: 'Все' }
  ];
  var STORAGE_KEY = 'ege-trainer:settings';

  var STATUS_LABELS = {
    hit: 'Верное — вы выбрали',
    missed: 'Верное — вы пропустили',
    wrong: 'Неверное — выбрано лишнее',
    skip: 'Неверное — вы не выбрали'
  };

  var POINTS_CAPTIONS = [
    'Две ошибки и больше',
    'Одна ошибка',
    'Ответ полностью верный'
  ];

  var $ = function (id) { return document.getElementById(id); };

  var ui = {
    screens: {
      start: $('screen-start'),
      quiz: $('screen-quiz'),
      result: $('screen-result')
    },
    startForm: $('start-form'),
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
    taskTopic: $('task-topic'),
    taskQuestion: $('task-question'),
    taskHint: $('task-hint'),
    statements: $('statements'),
    feedback: $('feedback'),
    feedbackPoints: $('feedback-points'),
    feedbackCorrect: $('feedback-correct'),
    feedbackUser: $('feedback-user'),
    submitBtn: $('submit-btn'),
    nextBtn: $('next-btn'),

    resultRing: $('result-ring'),
    resultPercent: $('result-percent'),
    resultScore: $('result-score'),
    resultMessage: $('result-message'),
    mistakesTitle: $('mistakes-title'),
    mistakesList: $('mistakes-list'),
    restartBtn: $('restart-btn'),
    homeBtn: $('home-btn')
  };

  var settings = loadSettings();

  var state = {
    tasks: [],      // задания текущей тренировки
    index: 0,       // номер текущего задания (с 0)
    score: 0,       // сумма баллов
    results: [],    // { task, selected, correct, points }
    selected: [],   // выбранные номера в текущем задании
    answered: false
  };

  /* ---------- Утилиты ---------- */

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

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

  function loadSettings() {
    var defaults = { topic: 'all', count: '5' };
    try {
      var saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (saved && typeof saved === 'object') {
        if (saved.topic === 'all' || EGE.getTopic(saved.topic)) defaults.topic = saved.topic;
        if (COUNT_OPTIONS.some(function (o) { return o.value === saved.count; })) defaults.count = saved.count;
      }
    } catch (e) { /* хранилище недоступно — используем значения по умолчанию */ }
    return defaults;
  }

  function saveSettings() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch (e) { /* не критично */ }
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

  function renderStart() {
    ui.topicOptions.textContent = '';
    var topics = [{ id: 'all', title: 'Все темы', color: null }].concat(EGE.topics);

    topics.forEach(function (topic) {
      var count = EGE.getTasksByTopic(topic.id).length;
      var label = el('label', 'topic-option');
      if (topic.color) label.style.setProperty('--topic-color', topic.color);

      var input = el('input');
      input.type = 'radio';
      input.name = 'topic';
      input.value = topic.id;
      input.checked = settings.topic === topic.id;
      input.disabled = count === 0;

      var body = el('span', 'topic-option__body');
      body.appendChild(el('span', 'topic-option__dot'));
      body.appendChild(el('span', 'topic-option__title', topic.title));
      body.appendChild(el('span', 'topic-option__count', count + ' ' + tasksWord(count)));

      label.appendChild(input);
      label.appendChild(body);
      ui.topicOptions.appendChild(label);
    });

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

  function plannedCount() {
    var available = EGE.getTasksByTopic(settings.topic).length;
    if (settings.count === 'all') return available;
    return Math.min(available, parseInt(settings.count, 10));
  }

  function updateStartButton() {
    var n = plannedCount();
    ui.startBtn.disabled = n === 0;
    ui.startBtn.textContent = n === 0
      ? 'В этой теме пока нет заданий'
      : 'Начать: ' + n + ' ' + tasksWord(n);
  }

  function readStartForm() {
    var data = new FormData(ui.startForm);
    settings.topic = data.get('topic') || 'all';
    settings.count = data.get('count') || '5';
  }

  /* ---------- Тренировка ---------- */

  function startSession() {
    var pool = shuffle(EGE.getTasksByTopic(settings.topic));
    state.tasks = pool.slice(0, plannedCount());
    state.index = 0;
    state.score = 0;
    state.results = [];
    if (state.tasks.length === 0) {
      showStart();
      return;
    }
    showScreen('quiz');
    renderTask();
  }

  function currentTask() {
    return state.tasks[state.index];
  }

  function renderProgress() {
    var total = state.tasks.length;
    var done = state.index + (state.answered ? 1 : 0);
    ui.progressLabel.textContent = 'Задание ' + (state.index + 1) + ' из ' + total;
    ui.scorePill.textContent = 'Баллы: ' + state.score;
    ui.progressFill.style.width = (done / total) * 100 + '%';
    ui.progressBar.setAttribute('aria-valuemax', String(total));
    ui.progressBar.setAttribute('aria-valuenow', String(done));
  }

  function renderTask() {
    var task = currentTask();
    var topic = EGE.getTopic(task.topic);

    state.selected = [];
    state.answered = false;
    releaseFocus();

    ui.taskTopic.textContent = topic.title;
    ui.taskTopic.style.setProperty('--topic-color', topic.color);
    ui.taskQuestion.textContent = task.question;
    ui.taskHint.hidden = false;

    ui.statements.textContent = '';
    task.statements.forEach(function (statement, i) {
      var number = i + 1;
      var li = el('li', 'statement');
      li.dataset.number = String(number);

      var btn = el('button', 'statement__btn');
      btn.type = 'button';
      btn.setAttribute('role', 'checkbox');
      btn.setAttribute('aria-checked', 'false');
      btn.addEventListener('click', function () { toggleStatement(number); });

      btn.appendChild(el('span', 'statement__num', String(number)));
      btn.appendChild(el('span', 'statement__text', statement.text));
      btn.appendChild(el('span', 'statement__check'));

      li.appendChild(btn);
      ui.statements.appendChild(li);
    });

    ui.feedback.hidden = true;
    ui.submitBtn.hidden = false;
    ui.submitBtn.disabled = true;
    ui.nextBtn.hidden = true;

    renderProgress();
  }

  function toggleStatement(number) {
    if (state.answered) return;
    var pos = state.selected.indexOf(number);
    if (pos === -1) state.selected.push(number);
    else state.selected.splice(pos, 1);

    var li = ui.statements.querySelector('[data-number="' + number + '"]');
    var isOn = pos === -1;
    li.classList.toggle('is-selected', isOn);
    li.querySelector('.statement__btn').setAttribute('aria-checked', String(isOn));

    ui.submitBtn.disabled = state.selected.length === 0;
  }

  function submitAnswer() {
    if (state.answered || state.selected.length === 0) return;

    var task = currentTask();
    var correct = scoring.getCorrectNumbers(task);
    var selected = state.selected.slice().sort(function (a, b) { return a - b; });
    var points = scoring.scoreAnswer(selected, correct);

    state.answered = true;
    state.score += points;
    state.results.push({ task: task, selected: selected, correct: correct, points: points });

    revealStatements(task, selected);

    ui.feedbackPoints.textContent = '';
    ui.feedbackPoints.className = 'points points--' + points;
    ui.feedbackPoints.appendChild(el('span', 'points__value', points + ' ' + scoring.pluralPoints(points)));
    ui.feedbackPoints.appendChild(el('span', 'points__caption', POINTS_CAPTIONS[points]));
    ui.feedbackCorrect.textContent = scoring.formatAnswer(correct);
    ui.feedbackUser.textContent = scoring.formatAnswer(selected);
    ui.feedback.hidden = false;
    ui.taskHint.hidden = true;

    var isLast = state.index === state.tasks.length - 1;
    ui.submitBtn.hidden = true;
    ui.nextBtn.hidden = false;
    ui.nextBtn.textContent = isLast ? 'Посмотреть результаты' : 'Следующее задание';
    ui.nextBtn.focus({ preventScroll: true });

    renderProgress();
    ui.feedback.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function revealStatements(task, selected) {
    var chosen = new Set(selected);
    ui.statements.classList.add('is-answered');

    task.statements.forEach(function (statement, i) {
      var number = i + 1;
      var li = ui.statements.querySelector('[data-number="' + number + '"]');
      var btn = li.querySelector('.statement__btn');
      var isChosen = chosen.has(number);
      var status = statement.correct
        ? (isChosen ? 'hit' : 'missed')
        : (isChosen ? 'wrong' : 'skip');

      btn.disabled = true;
      li.classList.remove('is-selected');
      li.classList.add('status-' + status);

      var details = el('div', 'statement__details');
      details.appendChild(el('span', 'statement__tag', STATUS_LABELS[status]));
      details.appendChild(el('p', 'statement__explanation', statement.explanation));
      li.appendChild(details);
    });
  }

  function nextTask() {
    if (!state.answered) return;
    if (state.index < state.tasks.length - 1) {
      state.index++;
      renderTask();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      showResults();
    }
  }

  /* ---------- Итоги ---------- */

  function showResults() {
    var max = state.tasks.length * scoring.MAX_SCORE;
    var pct = scoring.percent(state.score, max);

    ui.resultPercent.textContent = pct + '%';
    ui.resultRing.style.setProperty('--pct', String(pct));
    ui.resultRing.className = 'result__ring ' + (pct >= 80 ? 'is-high' : pct >= 50 ? 'is-mid' : 'is-low');
    ui.resultScore.textContent = state.score + ' из ' + max + ' ' + scoring.pluralPoints(max);
    ui.resultMessage.textContent = resultMessage(pct);

    var mistakes = state.results
      .map(function (r, i) { return { result: r, number: i + 1 }; })
      .filter(function (item) { return item.result.points < scoring.MAX_SCORE; });

    ui.mistakesList.textContent = '';
    if (mistakes.length === 0) {
      ui.mistakesTitle.textContent = 'Ошибок нет';
      ui.mistakesList.appendChild(el('li', 'mistakes__empty', 'Все задания выполнены без единой ошибки. Отличная работа!'));
    } else {
      ui.mistakesTitle.textContent = 'Задания с ошибками (' + mistakes.length + ')';
      mistakes.forEach(function (item) {
        var r = item.result;
        var topic = EGE.getTopic(r.task.topic);
        var li = el('li', 'mistake');

        var head = el('div', 'mistake__head');
        head.appendChild(el('span', 'mistake__num', 'Задание ' + item.number));
        var chip = el('span', 'chip chip--sm', topic.title);
        chip.style.setProperty('--topic-color', topic.color);
        head.appendChild(chip);
        head.appendChild(el('span', 'mistake__points points--' + r.points, r.points + ' ' + scoring.pluralPoints(r.points)));

        li.appendChild(head);
        li.appendChild(el('p', 'mistake__question', r.task.question));

        var answers = el('p', 'mistake__answers');
        answers.appendChild(el('span', null, 'Ваш ответ: '));
        answers.appendChild(el('strong', 'text-wrong', scoring.formatAnswer(r.selected)));
        answers.appendChild(el('span', null, ' · Правильный: '));
        answers.appendChild(el('strong', 'text-right', scoring.formatAnswer(r.correct)));
        li.appendChild(answers);

        ui.mistakesList.appendChild(li);
      });
    }

    showScreen('result');
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

  ui.submitBtn.addEventListener('click', submitAnswer);
  ui.nextBtn.addEventListener('click', nextTask);
  ui.restartBtn.addEventListener('click', startSession);
  ui.homeBtn.addEventListener('click', showStart);
  // Подтверждение выхода — в самой странице: window.confirm() блокируется
  // во встроенных просмотрщиках (iframe с sandbox).
  ui.brandHome.addEventListener('click', function () {
    var inProgress = !ui.screens.quiz.hidden && state.results.length > 0;
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

    if (/^[1-9]$/.test(e.key)) {
      var n = parseInt(e.key, 10);
      if (n <= currentTask().statements.length) {
        e.preventDefault();
        toggleStatement(n);
      }
    } else if (e.key === 'Enter') {
      // Enter на кнопке и так вызывает click — не дублируем действие.
      // Исключение — суждения: там Enter означает «Ответить».
      if (tag === 'BUTTON' && !e.target.classList.contains('statement__btn')) return;
      e.preventDefault();
      if (state.answered) nextTask();
      else submitAnswer();
    }
  });

  showStart();
})();
