/**
 * Интерфейс тренажёра: стартовый экран, решение заданий, итоги.
 * Зависит от js/registry.js, js/scoring.js, js/attempt.js, js/attempt-save.js,
 * js/task-view.js и файлов data/tasks/**.js.
 */
(function () {
  'use strict';

  var EGE = window.EGE;
  var scoring = EGE.scoring;
  var A = EGE.attempt;
  var view = EGE.taskView;
  var el = view.el;

  var STORAGE_KEY = 'ege-trainer:settings';

  /**
   * Режим предпросмотра: страница подключает набор заданий, который задаёт
   * EGE.preview = { id, title, taskIds } (см. data/preview/). Тот же движок,
   * но без выбора раздела и темы: в тренировку входит весь набор в заданном
   * порядке, без перемешивания. Настройки основного тренажёра не читаются
   * и не перезаписываются. На index.html EGE.preview не задан.
   */
  var preview = EGE.preview || null;

  /**
   * Сохранение незавершённой попытки (js/attempt-save.js): после старта, каждого
   * ответа, перехода между заданиями, отметки в текущем задании и при уходе со
   * страницы. Область сохранения — режим страницы, раздел и тема, поэтому
   * предпросмотр и разные темы основного тренажёра друг другу не мешают.
   */
  var saver = EGE.attemptSave;
  var SAVE_MODE = preview ? 'preview' : 'ege';
  var storage = (function () {
    try { return window.localStorage; } catch (e) { return null; }
  })();

  var HINTS = {
    'multiple': 'Отметьте все верные суждения. Можно выбрать несколько вариантов.',
    // multiple с choiceOf: 'items' — выбираются термины или другие элементы, а не суждения.
    'multiple-items': 'Выберите все подходящие варианты.',
    'exclude-two': 'Отметьте ровно две позиции, которые «выпадают» из общего ряда.',
    'matching': 'Напротив каждой позиции выберите номер из второго столбца.'
  };
  var HINT_ONE_TO_ONE = ' Каждый номер используется один раз: если выбрать занятый, он перейдёт к этой позиции.';
  var HINT_EXCLUDE_LIMIT = 'Можно отметить только две позиции — снимите одну отметку, чтобы выбрать другую.';
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
    topicEmpty: $('topic-empty'),
    startBtn: $('start-btn'),
    resumePanel: $('resume-panel'),
    resumeText: $('resume-text'),
    resumeContinue: $('resume-continue'),
    resumeRestart: $('resume-restart'),
    resumeNotice: $('resume-notice'),
    brandHome: $('brand-home'),
    siteNavLinks: Array.prototype.slice.call(document.querySelectorAll('.site-nav__link')),
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
    matching: $('matching'),
    taskInstruction: $('task-instruction'),
    taskNotes: $('task-notes'),
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
    draft: null,    // отметки в текущем, ещё не отвеченном задании (см. emptyDraft)
    matchRow: 0,    // matching: позиция, куда попадёт цифра с клавиатуры
    onExit: null,   // что сделать после подтверждения выхода (см. requestExit)
    resume: null    // проверенное сохранение для выбранных раздела и темы (см. renderResume)
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
    return EGE.getAvailableSections().some(function (s) { return s.id === id; });
  }

  function isValidTopic(sectionId, topicId) {
    return EGE.getTrainingTopics(sectionId).some(function (t) { return t.id === topicId; });
  }

  /**
   * Настройки старта: раздел и конкретная тема (null — ещё не выбраны). Тренировка
   * идёт только по одной теме: «Все разделы», «Весь раздел» и «Общие вопросы»
   * не предлагаются, такие значения из прежних версий сбрасываются. В тренировку
   * входят все задания темы во всех форматах; сохранённое ранее поле format
   * игнорируется и не ограничивает набор заданий.
   */
  function loadSettings() {
    var result = { section: null, topic: null };
    if (preview) return result;
    try {
      var saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (saved && typeof saved === 'object') {
        if (isValidSection(saved.section)) result.section = saved.section;
        if (isValidTopic(result.section, saved.topic)) result.topic = saved.topic;
      }
    } catch (e) { /* хранилище недоступно — используем значения по умолчанию */ }
    return result;
  }

  function saveSettings() {
    if (preview) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ section: settings.section, topic: settings.topic }));
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

  /** countText — подпись под названием; по умолчанию «N заданий». */
  function optionCard(name, value, title, count, color, checked, countText) {
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
    body.appendChild(el('span', 'topic-option__count', countText || count + ' ' + tasksWord(count)));

    label.appendChild(input);
    label.appendChild(body);
    return label;
  }

  function renderStart() {
    if (preview) {
      // Разделы и темы не выбираются: набор задан страницей предпросмотра.
      ui.sectionOptions.closest('fieldset').hidden = true;
      ui.topicField.hidden = true;
      updateStartButton();
      renderResume();
      return;
    }
    renderSectionOptions();
    renderTopicOptions();
    updateStartButton();
    renderResume();
  }

  /** Задания конкретных тем раздела — столько можно потренировать, выбрав тему. */
  function trainingTaskCount(sectionId) {
    return EGE.getTrainingTopics(sectionId).reduce(function (n, topic) {
      return n + EGE.getTasksByTopic(topic.id).length;
    }, 0);
  }

  /**
   * Разделы — навигационные категории: выбор раздела только открывает его темы.
   * Счётчик — задания конкретных тем. Разделы без заданий скрыты.
   */
  function renderSectionOptions() {
    ui.sectionOptions.textContent = '';
    EGE.getAvailableSections().forEach(function (section) {
      var n = trainingTaskCount(section.id);
      ui.sectionOptions.appendChild(optionCard('section', section.id, section.title,
        n, section.color, settings.section === section.id, n === 0 ? 'Темы готовятся' : null));
    });
  }

  /**
   * Конкретные темы выбранного раздела, в которых есть задания («Общие вопросы»
   * не предлагаются). Если таких тем нет — сообщение вместо пустого списка.
   */
  function renderTopicOptions() {
    ui.topicOptions.textContent = '';
    var section = EGE.getSection(settings.section);
    ui.topicField.hidden = !section;
    if (!section) return;

    var topics = EGE.getTrainingTopics(section.id);
    ui.topicOptions.hidden = topics.length === 0;
    ui.topicEmpty.hidden = topics.length > 0;
    ui.topicEmpty.textContent = topics.length > 0 ? '' : 'В разделе «' + section.title +
      '» пока нет отдельных тем для тренировки — они появятся позже. Выберите другой раздел.';
    topics.forEach(function (topic) {
      ui.topicOptions.appendChild(optionCard('topic', topic.id, topic.title,
        EGE.getTasksByTopic(topic.id).length, section.color, settings.topic === topic.id));
    });
  }

  /** Все задания выбранной темы — во всех трёх форматах. Пока тема не выбрана — пусто. */
  function currentPool() {
    if (preview) return preview.taskIds.map(EGE.getTask);
    if (!settings.topic) return [];
    return EGE.getPool(settings.section, settings.topic);
  }

  /** Кнопка старта подсказывает следующий шаг, пока тема не выбрана. */
  function updateStartButton() {
    var n = currentPool().length;
    ui.startBtn.disabled = n === 0;
    if (n > 0) {
      ui.startBtn.textContent = 'Начать: ' + n + ' ' + tasksWord(n);
    } else if (preview || settings.topic) {
      ui.startBtn.textContent = 'Здесь пока нет заданий';
    } else if (!settings.section) {
      ui.startBtn.textContent = 'Выберите раздел';
    } else if (EGE.getTrainingTopics(settings.section).length === 0) {
      ui.startBtn.textContent = 'В разделе пока нет тем';
    } else {
      ui.startBtn.textContent = 'Выберите тему';
    }
  }

  function readStartForm() {
    var data = new FormData(ui.startForm);
    var section = data.get('section') || null;
    if (section !== settings.section) {
      // При смене раздела тему нужно выбрать заново.
      settings.section = section;
      settings.topic = null;
      renderTopicOptions();
    } else {
      settings.topic = data.get('topic') || null;
    }
  }

  /* ---------- Тренировка ---------- */

  function startSession() {
    var pool = shuffle(currentPool());
    if (preview) pool = currentPool(); // предпросмотр — в заданном порядке
    if (pool.length === 0) {
      showStart();
      return;
    }
    state.attempt = A.createAttempt({
      settings: preview
        ? { section: 'preview', topic: preview.id }
        : { section: settings.section, topic: settings.topic },
      taskIds: pool.map(function (t) { return t.id; })
    });
    state.viewIndex = 0;
    state.draft = null;
    persist(true);
    showScreen('quiz');
    renderView();
  }

  /* ---------- Сохранение и продолжение попытки ---------- */

  /** Область сохранения выбранных на старте раздела и темы (или набора предпросмотра). */
  function startScope() {
    return saver.scopeId(SAVE_MODE, preview
      ? { section: 'preview', topic: preview.id }
      : { section: settings.section, topic: settings.topic });
  }

  function attemptScope(attempt) {
    return saver.scopeId(SAVE_MODE, attempt.settings);
  }

  /**
   * Сохраняет текущую незавершённую попытку. Ошибка хранилища не мешает тренировке.
   * force — после старта и продолжения; иначе запись не затирает более свежее
   * состояние, сохранённое этой же попыткой в другой вкладке, или другую попытку.
   */
  function persist(force) {
    var attempt = state.attempt;
    if (!attempt || attempt.finishedAt) return;
    saver.write(storage, saver.buildRecord({
      scope: attemptScope(attempt),
      attempt: attempt,
      viewIndex: state.viewIndex,
      draft: state.draft,
      getTask: EGE.getTask
    }), { force: force === true });
  }

  function formatSavedAt(iso) {
    var d = new Date(iso);
    var pad = function (n) { return (n < 10 ? '0' : '') + n; };
    return pad(d.getDate()) + '.' + pad(d.getMonth() + 1) + ' в ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  /**
   * Стартовый экран: предложение продолжить сохранённую попытку выбранных раздела
   * и темы. Запись, которую нельзя восстановить, удаляется, и ученик видит
   * причину — без прежних баллов.
   */
  function renderResume() {
    if (!preview && !settings.topic) {
      // Тема не выбрана: продолжать нечего (попытки прежних «Все разделы» и «Весь раздел» не предлагаются).
      state.resume = null;
      ui.resumePanel.hidden = true;
      return;
    }
    var result = saver.load(storage, startScope(), {
      getTask: EGE.getTask, attempt: A, scoring: scoring,
      // Предпросмотр: состав набора фиксирован — попытка другого состава не продолжается.
      taskIds: preview ? preview.taskIds : null
    });
    state.resume = result.status === 'ok' ? result.state : null;
    ui.resumePanel.hidden = !state.resume;
    if (result.status === 'invalid') {
      ui.resumeNotice.textContent = 'Сохранённую тренировку нельзя продолжить: ' + result.message + ' Начните её заново.';
      ui.resumeNotice.hidden = false;
    }
    if (!state.resume) return;

    var attempt = state.resume.attempt;
    var total = attempt.taskIds.length;
    var done = A.answeredCount(attempt);
    ui.resumeText.textContent = 'Выполнено ' + done + ' из ' + total + ' · баллы ' +
      A.totalScore(attempt) + ' из ' + A.answeredMaxScore(attempt) +
      ' · сохранено ' + formatSavedAt(state.resume.savedAt);
  }

  /** Продолжение: попытка, порядок заданий, ответы, баллы и позиция — из проверенного сохранения. */
  function resumeSession() {
    var saved = state.resume;
    if (!saved) return;
    state.resume = null;
    state.attempt = saved.attempt;
    state.viewIndex = saved.viewIndex;
    state.draft = saved.draft;
    state.matchRow = 0;
    ui.resumeNotice.hidden = true;
    persist(true);
    showScreen('quiz');
    renderView();
  }

  function restartSession() {
    saver.remove(storage, startScope());
    state.resume = null;
    ui.resumeNotice.hidden = true;
    startSession();
  }

  function taskAt(index) {
    return EGE.getTask(state.attempt.taskIds[index]);
  }

  function viewedAnswer() {
    return A.getAnswer(state.attempt, state.viewIndex);
  }

  function typeOf(task) {
    return scoring.getTaskType(task);
  }

  /** Пустой черновик: номера суждений или, для matching, по null на каждую позицию. */
  function emptyDraft(task) {
    return typeOf(task) === 'matching' ? task.items.map(function () { return null; }) : [];
  }

  /** Черновик текущего задания (создаётся при первом показе). */
  function currentDraft() {
    if (!state.draft) {
      var index = A.currentIndex(state.attempt);
      state.draft = index === -1 ? [] : emptyDraft(taskAt(index));
      state.matchRow = 0;
    }
    return state.draft;
  }

  /** Можно ли засчитать черновик: условие зависит от типа задания. */
  function isDraftReady(task, draft) {
    var type = typeOf(task);
    if (type === 'matching') return draft.every(function (n) { return n !== null; });
    if (type === 'exclude-two') return draft.length === scoring.EXCLUDE_COUNT;
    return draft.length > 0;
  }

  function hintFor(task) {
    var type = typeOf(task);
    var hint = HINTS[type === 'multiple' && task.choiceOf === 'items' ? 'multiple-items' : type];
    if (type === 'exclude-two') {
      // Счётчик показывает ограничение до попытки отметить третью позицию.
      return hint + ' Выбрано: ' + currentDraft().length + ' из ' + scoring.EXCLUDE_COUNT + '.';
    }
    return task.oneToOne ? hint + HINT_ONE_TO_ONE : hint;
  }

  function renderProgress() {
    var attempt = state.attempt;
    var total = attempt.taskIds.length;
    var done = A.answeredCount(attempt);
    ui.progressLabel.textContent = 'Задание ' + (state.viewIndex + 1) + ' из ' + total +
      ' · выполнено ' + done;
    ui.scorePill.textContent = 'Баллы: ' + A.totalScore(attempt) + ' из ' + A.answeredMaxScore(attempt);
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
        btn.classList.add('is-done', 'points--' + scoring.pointsLevel(answer.points, answer.maxPoints));
        label += 'выполнено, ' + scoring.formatPointsOutOf(answer.points, answer.maxPoints);
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
    var isMatching = typeOf(task) === 'matching';
    releaseFocus();

    ui.taskTopic.textContent = view.topicLabel(task);
    ui.taskTopic.style.setProperty('--topic-color', EGE.getSection(task.section).color);
    ui.taskQuestion.textContent = task.question;
    ui.taskHint.textContent = answer ? HINT_ANSWERED : hintFor(task);
    ui.taskCard.classList.toggle('is-review', !!answer);
    ui.taskInstruction.textContent = task.instruction || '';
    ui.taskInstruction.hidden = !task.instruction;
    // Общий признак ряда и источник — только после ответа, как и разбор.
    ui.taskNotes.hidden = !(answer && view.renderTaskNotes(ui.taskNotes, task));
    if (!answer) ui.taskNotes.textContent = '';

    ui.statements.hidden = isMatching;
    ui.matching.hidden = !isMatching;
    if (isMatching) {
      ui.statements.textContent = '';
      renderMatchingDraft(task, answer);
    } else {
      ui.matching.textContent = '';
      view.renderStatements(ui.statements, task, {
        answer: answer,
        selected: answer ? null : currentDraft(),
        onToggle: toggleStatement
      });
    }

    if (answer) {
      view.renderFeedback({
        points: ui.feedbackPoints,
        correct: ui.feedbackCorrect,
        user: ui.feedbackUser
      }, answer, task);
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
    ui.submitBtn.disabled = !!answer || !isDraftReady(taskAt(state.viewIndex), currentDraft());
    ui.nextBtn.hidden = !answer;
    ui.nextBtn.textContent = state.viewIndex === last ? 'Посмотреть результаты' : 'Следующее задание';
    // «К текущему» нужна, только если до текущего задания больше одного шага.
    ui.currentBtn.hidden = !answer || state.viewIndex >= reachable - 1;
    ui.currentBtn.textContent = A.isComplete(attempt) ? 'К последнему заданию' : 'К текущему заданию';
  }

  function goTo(index) {
    if (!A.canView(state.attempt, index) || index === state.viewIndex) return;
    state.viewIndex = index;
    persist();
    renderView();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function toggleStatement(number) {
    if (viewedAnswer()) return;
    var task = taskAt(state.viewIndex);
    var draft = currentDraft();
    var pos = draft.indexOf(number);
    var isExclude = typeOf(task) === 'exclude-two';
    if (pos === -1) {
      if (isExclude && draft.length >= scoring.EXCLUDE_COUNT) {
        ui.taskHint.textContent = HINT_EXCLUDE_LIMIT;
        return;
      }
      draft.push(number);
    } else {
      draft.splice(pos, 1);
    }
    if (isExclude) ui.taskHint.textContent = hintFor(task);

    view.setStatementSelected(ui.statements, number, pos === -1);
    ui.submitBtn.disabled = !isDraftReady(task, draft);
    persist();
  }

  function renderMatchingDraft(task, answer) {
    view.renderMatching(ui.matching, task, {
      answer: answer,
      selected: answer ? null : currentDraft(),
      activeRow: state.matchRow,
      onChoose: chooseMatch
    });
  }

  /**
   * matching: выбор номера для позиции. Повторное нажатие снимает выбор.
   * Во взаимно-однозначном задании занятый номер переходит к этой позиции.
   */
  function chooseMatch(row, number) {
    if (viewedAnswer()) return;
    var task = taskAt(state.viewIndex);
    var draft = currentDraft();
    if (draft[row] === number) {
      draft[row] = null;
      state.matchRow = row;
    } else {
      if (task.oneToOne) {
        var other = draft.indexOf(number);
        if (other !== -1) draft[other] = null;
      }
      draft[row] = number;
      state.matchRow = nextEmptyRow(draft, row);
    }
    renderMatchingDraft(task, null);
    ui.submitBtn.disabled = !isDraftReady(task, draft);
    persist();
  }

  /** Следующая незаполненная позиция после row (по кругу); если всё заполнено — row. */
  function nextEmptyRow(draft, row) {
    for (var k = 1; k <= draft.length; k++) {
      var i = (row + k) % draft.length;
      if (draft[i] === null) return i;
    }
    return row;
  }

  function submitAnswer() {
    var attempt = state.attempt;
    if (viewedAnswer()) return;
    if (state.viewIndex !== A.currentIndex(attempt)) return;
    var task = taskAt(state.viewIndex);
    if (!isDraftReady(task, currentDraft())) return;

    var answer = A.recordAnswer(attempt, task, state.draft);
    state.draft = null;
    persist();
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
      // Завершённая попытка больше не предлагается к продолжению.
      saver.remove(storage, attemptScope(attempt));
      notifyStore('onFinish', [A.snapshot(attempt)]);
    }

    var score = A.totalScore(attempt);
    var max = A.maxScore(attempt, EGE.getTask);
    var pct = scoring.percent(score, max);

    ui.resultPercent.textContent = pct + '%';
    ui.resultRing.style.setProperty('--pct', String(pct));
    ui.resultRing.className = 'result__ring ' + (pct >= 80 ? 'is-high' : pct >= 50 ? 'is-mid' : 'is-low');
    ui.resultScore.textContent = scoring.formatPointsOutOf(score, max);
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
      head.appendChild(el('span', 'mistake__points points--' + scoring.pointsLevel(answer.points, answer.maxPoints),
        scoring.formatPointsOutOf(answer.points, answer.maxPoints)));
      summary.appendChild(head);
      summary.appendChild(el('p', 'mistake__question', task.question));

      var answers = el('p', 'mistake__answers');
      answers.appendChild(el('span', null, 'Ваш ответ: '));
      answers.appendChild(el('strong', answer.points === answer.maxPoints ? 'text-right' : 'text-wrong',
        scoring.formatTaskAnswer(task, answer.selected)));
      answers.appendChild(el('span', null, ' · Правильный: '));
      answers.appendChild(el('strong', 'text-right', scoring.formatTaskAnswer(task, answer.correct)));
      summary.appendChild(answers);
      summary.appendChild(el('span', 'review-item__toggle', 'Показать разбор'));

      var body = el('div', 'review-item__body');
      if (typeOf(task) === 'matching') {
        var box = el('div', 'matching');
        view.renderMatching(box, task, { answer: answer });
        body.appendChild(box);
      } else {
        var list = el('ol', 'statements');
        view.renderStatements(list, task, { answer: answer });
        body.appendChild(list);
      }
      if (task.instruction) body.appendChild(el('p', 'task__instruction', task.instruction));
      var notes = view.createTaskNotes(task);
      if (notes) body.appendChild(notes);
      body.appendChild(view.createFeedback(answer, task));

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
    ui.resumeNotice.hidden = true;
    renderResume();
  });

  ui.resumeContinue.addEventListener('click', resumeSession);
  ui.resumeRestart.addEventListener('click', restartSession);
  // Закрытие вкладки, переход в другое приложение на телефоне: сохраняем последнее состояние.
  window.addEventListener('pagehide', function () { persist(); });
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') persist();
  });

  ui.startForm.addEventListener('submit', function (e) {
    e.preventDefault();
    readStartForm();
    saveSettings();
    ui.resumeNotice.hidden = true;
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
  // Общее для логотипа и ссылок «ЕГЭ | Олимпиады» в шапке: при начатой тренировке
  // (есть хотя бы один ответ) сначала спрашиваем, иначе выходим сразу.
  function isInProgress() {
    return !ui.screens.quiz.hidden && !!state.attempt && A.answeredCount(state.attempt) > 0;
  }

  function requestExit(onExit) {
    if (!isInProgress()) {
      onExit();
      return;
    }
    state.onExit = onExit;
    ui.exitBar.hidden = false;
    window.scrollTo({ top: 0, behavior: 'smooth' });
    ui.exitCancel.focus({ preventScroll: true });
  }

  ui.brandHome.addEventListener('click', function () { requestExit(showStart); });
  ui.siteNavLinks.forEach(function (link) {
    link.addEventListener('click', function (e) {
      // Ctrl/Cmd/Shift/средняя кнопка открывают новую вкладку — попытка здесь не теряется.
      if (e.defaultPrevented || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
      if (!isInProgress()) return;
      e.preventDefault();
      requestExit(function () { window.location.href = link.href; });
    });
  });
  ui.exitCancel.addEventListener('click', function () {
    state.onExit = null;
    ui.exitBar.hidden = true;
  });
  ui.exitConfirm.addEventListener('click', function () {
    var onExit = state.onExit || showStart;
    state.onExit = null;
    onExit();
  });

  document.addEventListener('keydown', function (e) {
    if (ui.screens.quiz.hidden || e.ctrlKey || e.metaKey || e.altKey) return;
    var tag = e.target && e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    var answered = !!viewedAnswer();

    if (/^[1-9]$/.test(e.key)) {
      if (answered) return;
      var n = parseInt(e.key, 10);
      var task = taskAt(state.viewIndex);
      if (typeOf(task) === 'matching') {
        // Цифра — номер варианта для выделенной позиции.
        if (n <= task.options.length) {
          e.preventDefault();
          chooseMatch(state.matchRow, n);
        }
      } else if (n <= task.statements.length) {
        e.preventDefault();
        toggleStatement(n);
      }
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      goTo(state.viewIndex + (e.key === 'ArrowLeft' ? -1 : 1));
    } else if (e.key === 'Enter') {
      // Enter на кнопке и ссылке (навигация в шапке) и так вызывает click — не дублируем действие.
      // Исключение — суждения: там Enter означает «Ответить».
      if (tag === 'A') return;
      if (tag === 'BUTTON' && !e.target.classList.contains('statement__btn') &&
          !e.target.classList.contains('match-choice')) return;
      e.preventDefault();
      if (answered) nextTask();
      else submitAnswer();
    }
  });

  showStart();
})();
