/**
 * Интерфейс тренажёра: стартовый экран, решение заданий, итоги.
 * Зависит от js/registry.js, js/scoring.js, js/attempt.js, js/attempt-save.js,
 * js/task-view.js, файлов data/tasks/**.js и data/practicums.js.
 *
 * Главная страница: раздел → тема → практикум. Ученик видит только темы
 * с опубликованными практикумами; у каждого практикума своя незавершённая попытка.
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
   * страницы. Область сохранения — режим страницы, раздел, тема и практикум, поэтому
   * предпросмотр и разные практикумы основного тренажёра друг другу не мешают.
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
    sectionEmpty: $('section-empty'),
    topicField: $('topic-field'),
    topicOptions: $('topic-options'),
    practicumField: $('practicum-field'),
    practicumTitle: $('practicum-title'),
    practicumOptions: $('practicum-options'),
    // Кнопка «Начать» и панель продолжения — только на страницах предпросмотра;
    // на главной они у каждого практикума свои (см. practicumCard).
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

    quizTitle: $('quiz-title'),
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
    resultContext: $('result-context'),
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
    practicum: null, // практикум текущей попытки (на страницах предпросмотра — null)
    viewIndex: 0,   // задание, которое показано на экране (с 0)
    draft: null,    // отметки в текущем, ещё не отвеченном задании (см. emptyDraft)
    matchRow: 0,    // matching: позиция, куда попадёт цифра с клавиатуры
    onExit: null,   // что сделать после подтверждения выхода (см. requestExit)
    resume: null,   // предпросмотр: проверенное сохранение набора (см. renderResume)
    resumes: {}     // главная: проверенные сохранения практикумов выбранной темы по id
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

  function plural(n, one, few, many) {
    var mod10 = n % 10;
    var mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return one;
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
    return many;
  }

  function isValidSection(id) {
    return !!id && EGE.getSection(id) !== null;
  }

  /** Тему можно выбрать, только если в ней есть опубликованный практикум. */
  function isValidTopic(sectionId, topicId) {
    return !!topicId && EGE.getAvailableTopics(sectionId).some(function (t) { return t.id === topicId; });
  }

  /**
   * Настройки старта: выбранные раздел и тема (null — ещё не выбраны).
   * Значения из прежних версий ('all' — прежние пункты «все разделы» и «весь раздел», тема без
   * практикумов, поле format) не подходят и просто не восстанавливаются.
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

  function optionCard(name, value, title, note, color, checked, badge) {
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
    var count = el('span', 'topic-option__count', note);
    if (badge) count.appendChild(el('span', 'topic-option__badge', badge));
    body.appendChild(count);

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
    renderPracticums();
  }

  /** Карточки разделов. У раздела без готовых практикумов — пометка «Практикумы готовятся». */
  function renderSectionOptions() {
    ui.sectionOptions.textContent = '';
    EGE.sections.forEach(function (section) {
      var n = EGE.getAvailableTopics(section.id).length;
      var note = n > 0 ? n + ' ' + plural(n, 'тема', 'темы', 'тем') : 'Практикумы готовятся';
      ui.sectionOptions.appendChild(optionCard('section', section.id, section.title, note,
        section.color, settings.section === section.id));
    });
  }

  /** Есть ли у практикума незавершённая попытка в хранилище (без проверки — её делает карточка). */
  function hasSavedAttempt(practicum) {
    if (!storage) return false;
    try {
      return storage.getItem(saver.storageKey(practicumScope(practicum))) !== null;
    } catch (e) {
      return false;
    }
  }

  /** Темы выбранного раздела: только темы с опубликованными практикумами. */
  function renderTopicOptions() {
    ui.topicOptions.textContent = '';
    var section = EGE.getSection(settings.section);
    var topics = section ? EGE.getAvailableTopics(section.id) : [];
    ui.topicField.hidden = topics.length === 0;
    ui.sectionEmpty.hidden = !section || topics.length > 0;
    if (section && topics.length === 0) {
      ui.sectionEmpty.textContent = 'Практикумы по разделу «' + section.title +
        '» готовятся. Когда они будут готовы, они появятся здесь.';
    }
    topics.forEach(function (topic) {
      var practicums = EGE.getPublishedPracticums(topic.id);
      var n = practicums.length;
      var unfinished = practicums.concat(EGE.getRetiredPracticums(topic.id)).some(hasSavedAttempt);
      // subtitle — необязательный подзаголовок темы (например, пункты кодификатора).
      var note = n + ' ' + plural(n, 'практикум', 'практикума', 'практикумов');
      if (topic.subtitle) note = topic.subtitle + ' · ' + note;
      ui.topicOptions.appendChild(optionCard('topic', topic.id, topic.title,
        note,
        section.color, settings.topic === topic.id, unfinished ? 'есть незавершённый' : null));
    });
  }

  /** Практикумы выбранной темы: карточка на каждый опубликованный практикум. */
  function renderPracticums() {
    ui.practicumOptions.textContent = '';
    state.resumes = {};
    var topic = isValidTopic(settings.section, settings.topic) ? EGE.getTopic(settings.topic) : null;
    ui.practicumField.hidden = !topic;
    if (!topic) return;
    ui.practicumTitle.textContent = 'Практикумы по теме «' + topic.title + '»' +
      (topic.subtitle ? ' · ' + topic.subtitle : '');
    var section = EGE.getSection(topic.section);
    // Прежние наборы — первыми и только при сохранённой попытке (иначе карточки нет).
    EGE.getRetiredPracticums(topic.id).forEach(function (practicum) {
      var card = retiredCard(practicum, section);
      if (card) ui.practicumOptions.appendChild(card);
    });
    EGE.getPublishedPracticums(topic.id).forEach(function (practicum) {
      ui.practicumOptions.appendChild(practicumCard(practicum, section));
    });
  }

  /** Тексты причин, по которым сохранённый практикум нельзя продолжить. */
  var PRACTICUM_REASONS = {
    corrupt: 'запись повреждена.',
    format: 'она записана в старом формате.',
    expired: 'она старше 30 дней.',
    tasks: 'задания этого практикума с тех пор обновились.',
    scoring: 'правила оценивания или ключи заданий с тех пор изменились.',
    composition: 'состав заданий этого практикума с тех пор изменился.'
  };

  function button(className, text, onClick) {
    var btn = el('button', 'btn ' + className, text);
    btn.type = 'button';
    btn.addEventListener('click', onClick);
    return btn;
  }

  /**
   * Карточка практикума: название, число заданий, максимум баллов и кнопка
   * «Начать практикум» — или, если есть незавершённая попытка, её прогресс
   * и кнопки «Продолжить» / «Начать заново». Сохранение проверяется при показе:
   * запись, которую нельзя продолжить, удаляется, а ученик видит причину.
   */
  /** Каркас карточки: название, число заданий и максимум баллов. */
  function cardFrame(practicum, section) {
    var tasks = practicum.taskIds.length;
    var max = EGE.getPracticumMaxScore(practicum);
    var titleId = 'practicum-' + practicum.id + '-title';

    var card = el('article', 'practicum-card');
    card.setAttribute('data-practicum', practicum.id);
    card.setAttribute('aria-labelledby', titleId);
    card.style.setProperty('--topic-color', section.color);

    var head = el('div', 'practicum-card__head');
    var title = el('h3', 'practicum-card__title', EGE.practicumTitle(practicum));
    title.id = titleId;
    head.appendChild(title);
    card.appendChild(head);
    card.appendChild(el('p', 'practicum-card__meta',
      tasks + ' ' + tasksWord(tasks) + ' · максимум ' + max + ' ' + scoring.pluralPoints(max)));
    return { card: card, head: head, titleId: titleId, actions: el('div', 'practicum-card__actions') };
  }

  /** Метка «Не завершён» и прогресс сохранённой попытки. */
  function showProgress(frame, saved) {
    frame.head.appendChild(el('span', 'practicum-card__status', 'Не завершён'));
    var attempt = saved.attempt;
    frame.card.appendChild(el('p', 'practicum-card__progress',
      'Выполнено ' + A.answeredCount(attempt) + ' из ' + attempt.taskIds.length +
      ' · баллы ' + A.totalScore(attempt) + ' из ' + A.answeredMaxScore(attempt) +
      ' · сохранено ' + formatSavedAt(saved.savedAt)));
  }

  function finishCard(frame) {
    frame.actions.querySelectorAll('button').forEach(function (btn) {
      btn.setAttribute('aria-describedby', frame.titleId);
    });
    frame.card.appendChild(frame.actions);
    return frame.card;
  }

  /**
   * Карточка прежнего набора (status: 'retired'): только если у ученика есть
   * сохранённая попытка. Её можно лишь продолжить — начать набор заново нельзя.
   * Если запись нельзя продолжить (правила js/attempt-save.js), ученик видит
   * причину; иначе — карточки нет (null).
   */
  function retiredCard(practicum, section) {
    var result = saver.load(storage, practicumScope(practicum), practicumDeps(practicum));
    if (result.status === 'none') return null;
    var frame = cardFrame(practicum, section);
    frame.card.classList.add('practicum-card--retired');
    if (result.status === 'ok') {
      state.resumes[practicum.id] = result.state;
      showProgress(frame, result.state);
      frame.card.appendChild(el('p', 'practicum-card__note',
        'Набор, по которому вы начали заниматься до разделения темы на практикумы. Его можно завершить; новые попытки — в практикумах ниже.'));
      frame.actions.appendChild(button('btn--primary practicum-card__continue', 'Продолжить', function () {
        resumePracticum(practicum);
      }));
    } else {
      var notice = el('p', 'practicum-card__notice', 'Сохранённую попытку прежнего набора нельзя продолжить: ' +
        PRACTICUM_REASONS[result.reason] + ' Выберите один из практикумов ниже.');
      notice.setAttribute('role', 'status');
      frame.card.appendChild(notice);
    }
    return finishCard(frame);
  }

  function practicumCard(practicum, section) {
    var frame = cardFrame(practicum, section);
    var card = frame.card;
    var actions = frame.actions;

    var result = saver.load(storage, practicumScope(practicum), practicumDeps(practicum));
    var saved = result.status === 'ok' ? result.state : null;

    if (saved) {
      state.resumes[practicum.id] = saved;
      showProgress(frame, saved);
      actions.appendChild(button('btn--primary practicum-card__continue', 'Продолжить', function () {
        resumePracticum(practicum);
      }));
      actions.appendChild(button('btn--ghost practicum-card__restart', 'Начать заново', function () {
        saver.remove(storage, practicumScope(practicum));
        startPracticum(practicum);
      }));
    } else {
      if (result.status === 'invalid') {
        var notice = el('p', 'practicum-card__notice', 'Сохранённый практикум нельзя продолжить: ' +
          PRACTICUM_REASONS[result.reason] + ' Начните его заново.');
        notice.setAttribute('role', 'status');
        card.appendChild(notice);
      }
      actions.appendChild(button('btn--primary practicum-card__start', 'Начать практикум', function () {
        startPracticum(practicum);
      }));
    }
    return finishCard(frame);
  }

  /** Предпросмотр: все задания набора. */
  function currentPool() {
    return preview.taskIds.map(EGE.getTask);
  }

  function updateStartButton() {
    var n = currentPool().length;
    ui.startBtn.disabled = n === 0;
    ui.startBtn.textContent = n === 0
      ? 'Здесь пока нет заданий'
      : 'Начать: ' + n + ' ' + tasksWord(n);
  }

  /** Выбор раздела или темы. Смена раздела сбрасывает тему. */
  function readStartForm() {
    var data = new FormData(ui.startForm);
    var section = data.get('section');
    if (section !== settings.section) {
      settings.section = section;
      settings.topic = null;
    } else {
      settings.topic = data.get('topic');
    }
  }

  /* ---------- Практикум ---------- */

  /** Попытка с заданным порядком заданий: начало практикума или набора предпросмотра. */
  function beginAttempt(attemptSettings, taskIds) {
    state.attempt = A.createAttempt({ settings: attemptSettings, taskIds: taskIds });
    state.viewIndex = 0;
    state.draft = null;
    state.matchRow = 0;
    persist(true);
    showScreen('quiz');
    renderView();
  }

  /** Новая попытка практикума: состав фиксирован, порядок — по practicum.shuffle. */
  function startPracticum(practicum) {
    if (!EGE.isPracticumReady(practicum)) {
      showStart();
      return;
    }
    ui.resumeNotice.hidden = true;
    state.practicum = practicum;
    beginAttempt(practicumSettings(practicum),
      practicum.shuffle ? shuffle(practicum.taskIds) : practicum.taskIds.slice());
  }

  /** Повторное прохождение: тот же практикум или набор предпросмотра заново. */
  function startSession() {
    if (!preview) {
      if (state.practicum) startPracticum(state.practicum);
      else showStart();
      return;
    }
    var pool = currentPool(); // предпросмотр — в заданном порядке
    if (pool.length === 0) {
      showStart();
      return;
    }
    beginAttempt({ section: 'preview', topic: preview.id }, pool.map(function (t) { return t.id; }));
  }

  /* ---------- Сохранение и продолжение попытки ---------- */

  /** Предпросмотр: область сохранения набора. */
  function startScope() {
    return saver.scopeId(SAVE_MODE, { section: 'preview', topic: preview.id });
  }

  /** Настройки попытки практикума: раздел, тема и id практикума. */
  function practicumSettings(practicum) {
    return { section: practicum.section, topic: practicum.topic, practicum: practicum.id };
  }

  /** Область сохранения практикума: у каждого практикума своя запись. */
  function practicumScope(practicum) {
    return saver.scopeId(SAVE_MODE, practicumSettings(practicum));
  }

  /** Проверка сохранения практикума: состав фиксирован, порядок важен, если задания не перемешиваются. */
  function practicumDeps(practicum) {
    return {
      getTask: EGE.getTask, attempt: A, scoring: scoring,
      taskIds: practicum.taskIds,
      anyOrder: !!practicum.shuffle
    };
  }

  /**
   * Попытки, сохранённые до появления практикумов для темы целиком (ege/OBS/OBS-ACT),
   * переносятся в практикум с legacyTopicAttempts, если их задания совпадают с его
   * составом. Остальные старые записи не трогаются (см. saver.migrate).
   */
  function migrateLegacyAttempts() {
    EGE.practicums.forEach(function (practicum) {
      if (!practicum.legacyTopicAttempts || !EGE.isPracticumContinuable(practicum)) return;
      saver.migrate(storage, {
        from: saver.scopeId(SAVE_MODE, { section: practicum.section, topic: practicum.topic }),
        to: practicumScope(practicum),
        settings: { practicum: practicum.id },
        deps: practicumDeps(practicum)
      });
    });
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
   * Предпросмотр: предложение продолжить сохранённую попытку набора. Запись,
   * которую нельзя восстановить, удаляется, и ученик видит причину — без прежних баллов.
   */
  function renderResume() {
    var result = saver.load(storage, startScope(), {
      getTask: EGE.getTask, attempt: A, scoring: scoring,
      // Состав набора фиксирован — попытка другого состава не продолжается.
      taskIds: preview.taskIds
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
    continueAttempt(saved);
  }

  /** Главная: продолжение практикума из сохранения, проверенного при показе карточки. */
  function resumePracticum(practicum) {
    var saved = state.resumes[practicum.id];
    if (!saved) return;
    state.resumes = {};
    state.practicum = practicum;
    continueAttempt(saved);
  }

  function continueAttempt(saved) {
    state.attempt = saved.attempt;
    state.viewIndex = saved.viewIndex;
    state.draft = saved.draft;
    state.matchRow = 0;
    ui.resumeNotice.hidden = true;
    persist(true);
    showScreen('quiz');
    renderView();
  }

  /** Предпросмотр: «Начать заново». */
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
  /** «Познание · Практикум № 1» — над прогрессом и в итогах. */
  function practicumLabel(practicum) {
    return EGE.getTopic(practicum.topic).title + ' · ' + EGE.practicumTitle(practicum);
  }

  function renderView() {
    var attempt = state.attempt;
    var task = taskAt(state.viewIndex);
    var answer = viewedAnswer();
    var isMatching = typeOf(task) === 'matching';
    releaseFocus();

    ui.quizTitle.hidden = !state.practicum;
    ui.quizTitle.textContent = state.practicum ? practicumLabel(state.practicum) : '';

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
    // Прежний набор заново не проходится: после завершения — только к выбору практикума.
    ui.restartBtn.hidden = !!state.practicum && state.practicum.status === 'retired';
    if (ui.resultContext) {
      ui.resultContext.hidden = !state.practicum;
      ui.resultContext.textContent = state.practicum ? practicumLabel(state.practicum) : '';
    }

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

  ui.startForm.addEventListener('change', function (e) {
    if (preview) return;
    var sectionChanged = e.target.name === 'section';
    readStartForm();
    saveSettings();
    ui.resumeNotice.hidden = true;
    if (sectionChanged) renderTopicOptions();
    renderPracticums();
    // После выбора темы на телефоне список практикумов может оказаться ниже экрана.
    if (!sectionChanged && !ui.practicumField.hidden && typeof ui.practicumField.scrollIntoView === 'function') {
      ui.practicumField.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  });

  if (preview) {
    ui.resumeContinue.addEventListener('click', resumeSession);
    ui.resumeRestart.addEventListener('click', restartSession);
  }
  // Закрытие вкладки, переход в другое приложение на телефоне: сохраняем последнее состояние.
  window.addEventListener('pagehide', function () { persist(); });
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') persist();
  });

  ui.startForm.addEventListener('submit', function (e) {
    e.preventDefault();
    if (!preview) return; // на главной практикум начинается кнопкой в его карточке
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

  if (!preview) migrateLegacyAttempts();
  showStart();
})();
