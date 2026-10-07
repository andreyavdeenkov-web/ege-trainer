/**
 * Олимпиады: интерфейс тематической тренировки.
 *
 * Путь: Олимпиады → олимпиада или олимпиадный практикум (дисциплины) →
 * дисциплина (темы, сгруппированные по разделам) → настройка (фильтры) →
 * тренировка → итоги. Класс, этап, тур — только фильтры и подписи.
 * Предмет берётся из олимпиады и в интерфейсе не выбирается.
 *
 * Практикум (kind: 'practicum') — тематическая подготовка без привязки
 * к олимпиаде: все дисциплины видны (пустые — «скоро»), фильтр — сложность,
 * задания идут в учебной последовательности из данных, а не вразброс.
 *
 * Повторное прохождение регулирует attemptPolicy трека (OLY.ui.progress):
 * у олимпиад попытка живёт в памяти страницы и тему можно пройти снова;
 * у практикума попытка по теме сохраняется в браузере, восстанавливается после
 * перезагрузки, а завершённая тема открывается только для просмотра.
 *
 * Зависит от ядра js/olymp/*.js, данных data/olympiads/**.js и js/olymp/ui/*.js.
 */
(function () {
  'use strict';

  /* ---------- Защита от пустого экрана ---------- */

  var RELOAD_FLAG = 'olymp-trainer:reloaded-for-update';

  function sessionFlag(action) {
    try {
      if (action === 'get') return window.sessionStorage.getItem(RELOAD_FLAG) === '1';
      if (action === 'set') window.sessionStorage.setItem(RELOAD_FLAG, '1');
      else window.sessionStorage.removeItem(RELOAD_FLAG);
    } catch (e) { /* sessionStorage недоступен */ }
    return false;
  }

  /**
   * Сообщение вместо пустой основной области. Создаётся без зависимостей
   * от остального интерфейса — работает и при несовпадении версий файлов.
   */
  function showFatal(text) {
    var main = document.getElementById('app') || document.body;
    var old = document.getElementById('app-fatal');
    if (old) old.remove();
    Array.prototype.forEach.call(main.querySelectorAll('.screen'), function (screen) { screen.hidden = true; });
    var box = document.createElement('div');
    box.className = 'panel';
    box.id = 'app-fatal';
    box.setAttribute('role', 'alert');
    var p = document.createElement('p');
    p.textContent = text;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn--primary btn--lg';
    btn.style.marginTop = '16px';
    btn.textContent = 'Обновить страницу';
    btn.addEventListener('click', function () { window.location.reload(); });
    box.appendChild(p);
    box.appendChild(btn);
    main.appendChild(box);
  }

  /**
   * Сразу после обновления сайта браузер может взять из кэша старый
   * olympiad.html и новые скрипты (или наоборот). Тогда части интерфейса нет —
   * перезагружаем страницу один раз; если не помогло, показываем сообщение.
   */
  function missingParts() {
    var O = window.OLY;
    var u = O && O.ui;
    var checks = {
      'OLY.ui.progress': u && u.progress,
      'OLY.getAttemptPolicy': O && O.getAttemptPolicy,
      'OLY.ui.filters.hasUserFilters': u && u.filters && u.filters.hasUserFilters,
      'OLY.ui.format.practicumScopeLabel': u && u.format && u.format.practicumScopeLabel,
      '#setup-status': document.getElementById('setup-status'),
      '#setup-warning': document.getElementById('setup-warning'),
      '#result-note': document.getElementById('result-note')
    };
    return Object.keys(checks).filter(function (name) { return !checks[name]; });
  }

  var missing = missingParts();
  if (missing.length) {
    if (window.console) console.error('Олимпиады: файлы страницы разных версий, нет: ' + missing.join(', '));
    if (!sessionFlag('get')) {
      sessionFlag('set');
      window.location.reload();
    } else {
      showFatal('Не удалось загрузить страницу целиком: браузер взял часть файлов из кэша после обновления сайта. ' +
        'Обновите страницу без кэша (Ctrl+Shift+R, на Mac — ⌘+Shift+R).');
    }
    return;
  }
  sessionFlag('clear');

  var OLY = window.OLY;
  var ui = OLY.ui;
  var A = OLY.attempt;
  var fmt = ui.format;
  var F = ui.filters;
  var S = ui.session;
  var router = ui.router;
  var P = ui.progress;
  var store = P.createStore(ui.storage);
  var views = ui.views;
  var el = ui.el;

  var STORAGE_KEY = 'olymp-trainer:settings';
  var COUNT_OPTIONS = [
    { value: '10', label: '10' },
    { value: '20', label: '20' },
    { value: 'all', label: 'Все' }
  ];
  var SCREENS = ['home', 'olympiad', 'discipline', 'setup', 'train', 'result'];

  var $ = function (id) { return document.getElementById(id); };

  var dom = {
    crumbs: $('crumbs'),
    crumbsList: $('crumbs-list'),
    olympiadList: $('olympiad-list'),
    practicumBlock: $('practicum-block'),
    practicumList: $('practicum-list'),
    olympiadEyebrow: $('olympiad-eyebrow'),
    olympiadTitle: $('olympiad-title'),
    olympiadLead: $('olympiad-lead'),
    modeSwitch: $('mode-switch'),
    disciplineList: $('discipline-list'),
    disciplineEyebrow: $('discipline-eyebrow'),
    disciplineTitle: $('discipline-title'),
    disciplineLead: $('discipline-lead'),
    topicList: $('topic-list'),
    setupEyebrow: $('setup-eyebrow'),
    setupStatus: $('setup-status'),
    setupStatusLabel: $('setup-status-label'),
    setupStatusText: $('setup-status-text'),
    setupStatusBtn: $('setup-status-btn'),
    setupTitle: $('setup-title'),
    setupNote: $('setup-note'),
    setupWarning: $('setup-warning'),
    setupForm: $('setup-form'),
    filters: $('filters'),
    poolInfo: $('pool-info'),
    resetFilters: $('reset-filters'),
    countField: $('count-field'),
    countOptions: $('count-options'),
    startBtn: $('start-btn'),
    confirmBar: $('confirm-bar'),
    confirmText: $('confirm-text'),
    confirmCancel: $('confirm-cancel'),
    confirmOk: $('confirm-ok'),
    progressLabel: $('progress-label'),
    checkedPill: $('checked-pill'),
    finishBtn: $('finish-btn'),
    progressBar: $('progress-bar'),
    progressFill: $('progress-fill'),
    taskNav: $('task-nav'),
    taskCard: $('task-card'),
    taskTopic: $('task-topic'),
    taskLevel: $('task-level'),
    taskBlock: $('task-block'),
    taskSources: $('task-sources'),
    taskQuestion: $('task-question'),
    taskHint: $('task-hint'),
    answer: $('answer'),
    feedback: $('feedback'),
    verdict: $('verdict'),
    feedbackCorrect: $('feedback-correct'),
    feedbackUser: $('feedback-user'),
    feedbackPointsRow: $('feedback-points-row'),
    feedbackPoints: $('feedback-points'),
    typicalMistake: $('typical-mistake'),
    typicalMistakeText: $('typical-mistake-text'),
    explanation: $('explanation'),
    explanationText: $('explanation-text'),
    prevBtn: $('prev-btn'),
    skipBtn: $('skip-btn'),
    checkBtn: $('check-btn'),
    nextBtn: $('next-btn'),
    resultScope: $('result-scope'),
    resultStats: $('result-stats'),
    resultPoints: $('result-points'),
    resultNote: $('result-note'),
    againBtn: $('again-btn'),
    skippedBtn: $('skipped-btn'),
    mistakesBtn: $('mistakes-btn'),
    topicsBtn: $('topics-btn'),
    reviewFilter: $('review-filter'),
    reviewAllLabel: $('review-all-label'),
    reviewMistakesLabel: $('review-mistakes-label'),
    reviewSkippedLabel: $('review-skipped-label'),
    reviewList: $('review-list'),
    expandAllBtn: $('expand-all-btn'),
    screens: {}
  };
  SCREENS.forEach(function (name) { dom.screens[name] = $('screen-' + name); });

  var saved = ui.storage.read(STORAGE_KEY) || {};
  var settings = {
    filters: saved.filters && typeof saved.filters === 'object' ? saved.filters : {},
    count: COUNT_OPTIONS.some(function (o) { return o.value === saved.count; }) ? saved.count : 'all'
  };

  var state = {
    route: null,        // показанный экран
    attempt: null,      // текущая тренировка
    attemptRoute: null, // маршрут настройки, с которого она начата
    viewIndex: 0,
    controller: null,   // поле ответа текущего задания
    confirm: null,      // { kind: 'exit' | 'finish', route? }
    reviewFilter: 'all'
  };

  function saveSettings() {
    ui.storage.write(STORAGE_KEY, settings);
  }

  function notifyStore(method, args) {
    var store = OLY.attemptStore;
    if (!store || typeof store[method] !== 'function') return;
    try {
      store[method].apply(store, args);
    } catch (e) {
      if (window.console) console.error('OLY.attemptStore.' + method + ':', e);
    }
  }

  /* ---------- Маршруты ---------- */

  function subjectOf(olympiad) {
    // Платформа посвящена обществознанию: у олимпиады один предмет.
    return olympiad.subjects[0];
  }

  function scopeOf(route) {
    var olympiad = OLY.getOlympiad(route.olympiad);
    return {
      olympiad: route.olympiad,
      subject: subjectOf(olympiad),
      discipline: route.discipline,
      topic: route.topic
    };
  }

  function sameSetup(a, b) {
    return !!a && !!b && a.olympiad === b.olympiad && a.discipline === b.discipline && a.topic === b.topic;
  }

  /* ---------- Сохранение попыток и правила повторного прохождения ---------- */

  function policyOf(route) {
    return OLY.getAttemptPolicy(route.olympiad);
  }

  /** Попытка этой области, известная странице: в памяти или сохранённая в браузере. */
  function attemptFor(route) {
    if (state.attempt && sameSetup(route, state.attemptRoute)) return state.attempt;
    return policyOf(route).persistAttempts ? store.load(scopeOf(route)) : null;
  }

  /** Сохраняет текущую попытку, если трек сохраняет попытки. */
  function persistAttempt() {
    if (!state.attempt || !state.attemptRoute || !policyOf(state.attemptRoute).persistAttempts) return;
    store.save(scopeOf(state.attemptRoute), state.attempt);
  }

  /**
   * Делает сохранённую попытку области текущей (после перезагрузки или при
   * возвращении к теме). Тренировка открывается на первом непроверенном задании.
   */
  function adoptStoredAttempt(route) {
    if (!policyOf(route).persistAttempts || sameSetup(route, state.attemptRoute)) return;
    var stored = store.load(scopeOf(route));
    if (!stored) return;
    state.attempt = stored;
    state.attemptRoute = router.withName(route, 'setup');
    var next = S.nextUnchecked(stored, stored.taskIds.length - 1);
    state.viewIndex = next === -1 ? 0 : next;
    state.reviewFilter = 'all';
  }

  /** «Пройдено: 18 из 24 верно» / «Проверено: 5 из 24». */
  function attemptStatusLine(attempt) {
    if (attempt.finishedAt) {
      var o = S.outcome(attempt);
      return 'Пройдено: ' + o.correct + ' из ' + o.total + ' верно';
    }
    return 'Проверено: ' + S.checkedCount(attempt) + ' из ' + attempt.taskIds.length;
  }

  /** Меняет адрес без повторной отрисовки (в песочнице без history — просто ничего). */
  function setHash(route, replace) {
    var hash = router.format(route);
    if (location.hash === hash) return;
    try {
      if (replace) history.replaceState(null, '', hash);
      else history.pushState(null, '', hash);
    } catch (e) { /* адрес не обновится, экран всё равно покажется */ }
  }

  function go(route, replace) {
    if (guardLeave(route)) return;
    showRoute(route);
    setHash(state.route, replace);
  }

  /**
   * Незавершённую тренировку с ответами нельзя покинуть без подтверждения —
   * если только попытка не сохраняется: тогда к ней можно вернуться.
   */
  function guardLeave(route) {
    if (!state.route || state.route.name !== 'train') return false;
    if (state.attemptRoute && P.leavesFreely(policyOf(state.attemptRoute))) return false;
    if (route.name === 'train' && sameSetup(route, state.attemptRoute)) return false;
    if (route.name === 'result' && state.attempt && state.attempt.finishedAt) return false;
    if (!S.hasProgress(state.attempt)) return false;
    showConfirm({ kind: 'exit', route: route });
    return true;
  }

  function onHashChange() {
    var hash = location.hash || '#/';
    if (state.route && router.format(state.route) === hash) return;
    var route = router.parse(hash);
    if (guardLeave(route)) {
      setHash(state.route, false);   // вернуть адрес тренировки
      return;
    }
    showRoute(route);
    if (router.format(state.route) !== hash) setHash(state.route, true);
  }

  /**
   * Показывает экран. Любая ошибка отрисовки (например, из-за несовместимых
   * сохранённых данных) не оставляет пустую страницу: выводится сообщение.
   */
  function showRoute(route) {
    try {
      var old = document.getElementById('app-fatal');
      if (old) old.remove();
      showRouteUnsafe(route);
    } catch (e) {
      if (window.console) console.error('Олимпиады: ошибка отрисовки экрана', e);
      showFatal('Не удалось показать этот экран. Попробуйте обновить страницу; если ошибка повторяется, вернитесь к списку олимпиад.');
    }
  }

  /** Проверяет маршрут, при необходимости поднимается на уровень выше и показывает экран. */
  function showRouteUnsafe(route) {
    var olympiad = route.olympiad ? OLY.getOlympiad(route.olympiad) : null;
    if (route.name === 'unknown' || (route.name !== 'home' && !olympiad)) return showRouteUnsafe({ name: 'home' });

    var up = null;
    if (route.name === 'discipline' || route.name === 'setup' || route.name === 'train' || route.name === 'result') {
      var discipline = OLY.getDiscipline(subjectOf(olympiad), route.discipline);
      if (!discipline || F.buildPool(scopeOf({ olympiad: route.olympiad, discipline: route.discipline }), {}).length === 0) {
        up = { name: 'olympiad', olympiad: route.olympiad };
      } else if (route.name !== 'discipline' && route.topic === 'all' && P.wholeTopicOnly(policyOf(route))) {
        // Одна попытка на тему: тренировка «по всем темам» обошла бы это правило.
        up = { name: 'discipline', olympiad: route.olympiad, discipline: route.discipline };
      } else if (route.name !== 'discipline' && route.topic !== 'all') {
        var topic = OLY.getTopic(subjectOf(olympiad), route.topic);
        if (!topic || topic.discipline !== route.discipline) {
          up = { name: 'discipline', olympiad: route.olympiad, discipline: route.discipline };
        }
      }
    }
    if (!up && (route.name === 'setup' || route.name === 'train' || route.name === 'result')) {
      adoptStoredAttempt(route);
    }
    if (!up && route.name === 'train' && !(state.attempt && !state.attempt.finishedAt && sameSetup(route, state.attemptRoute))) {
      up = state.attempt && state.attempt.finishedAt && sameSetup(route, state.attemptRoute)
        ? router.withName(route, 'result') : router.withName(route, 'setup');
    }
    if (!up && route.name === 'result' && !(state.attempt && state.attempt.finishedAt && sameSetup(route, state.attemptRoute))) {
      up = router.withName(route, 'setup');
    }
    if (up) return showRouteUnsafe(up);

    var changedScreen = !state.route || state.route.name !== route.name;
    state.route = route;
    if (route.name !== 'train') hideConfirm();

    SCREENS.forEach(function (name) { dom.screens[name].hidden = name !== route.name; });
    renderCrumbs(route);

    if (route.name === 'home') renderHome();
    else if (route.name === 'olympiad') renderOlympiad(route);
    else if (route.name === 'discipline') renderDiscipline(route);
    else if (route.name === 'setup') renderSetup(route);
    else if (route.name === 'train') renderTrain();
    else if (route.name === 'result') renderResult();

    if (changedScreen) {
      releaseFocus();
      window.scrollTo(0, 0);
    }
  }

  function releaseFocus() {
    var active = document.activeElement;
    if (active && active !== document.body && typeof active.blur === 'function') active.blur();
  }

  /* ---------- Общие элементы ---------- */

  function routeLink(route, className, text) {
    var a = el('a', className, text);
    a.href = router.format(route);
    a.setAttribute('data-route', '');
    return a;
  }

  function renderCrumbs(route) {
    dom.crumbsList.textContent = '';
    var show = route.name !== 'home' && route.name !== 'train';
    dom.crumbs.hidden = !show;
    if (!show) return;

    var olympiad = OLY.getOlympiad(route.olympiad);
    var items = [{ route: { name: 'home' }, text: 'Олимпиады' }];
    items.push({ route: { name: 'olympiad', olympiad: route.olympiad }, text: olympiad.title });
    if (route.discipline) {
      var discipline = OLY.getDiscipline(subjectOf(olympiad), route.discipline);
      items.push({ route: { name: 'discipline', olympiad: route.olympiad, discipline: route.discipline }, text: discipline.title });
    }
    if (route.topic) {
      items.push({ route: router.withName(route, 'setup'), text: topicTitle(route) });
    }
    if (route.name === 'result') items.push({ route: route, text: 'Итоги' });

    items.forEach(function (item, i) {
      var li = el('li');
      if (i === items.length - 1) {
        var current = el('span', null, item.text);
        current.setAttribute('aria-current', 'page');
        li.appendChild(current);
      } else {
        li.appendChild(routeLink(item.route, null, item.text));
      }
      dom.crumbsList.appendChild(li);
    });
  }

  function topicTitle(route) {
    if (route.topic === 'all') return 'Все темы';
    var topic = OLY.getTopic(subjectOf(OLY.getOlympiad(route.olympiad)), route.topic);
    return topic ? topic.title : route.topic;
  }

  /** Карточка-ссылка в стиле карточек тем тренажёра ЕГЭ. */
  function card(route, title, count, meta, color, extraClass) {
    var a = routeLink(route, 'topic-option' + (extraClass ? ' ' + extraClass : ''));
    if (color) a.style.setProperty('--topic-color', color);
    var body = el('span', 'topic-option__body');
    body.appendChild(el('span', 'topic-option__dot'));
    body.appendChild(el('span', 'topic-option__title', title));
    body.appendChild(el('span', 'topic-option__count', count));
    if (meta) body.appendChild(el('span', 'topic-option__meta', meta));
    a.appendChild(body);
    return a;
  }

  /** Карточка раздела, где заданий ещё нет: не ссылка, с пометкой «скоро». */
  function soonCard(title, color) {
    var div = el('div', 'topic-option is-soon');
    div.setAttribute('aria-disabled', 'true');
    if (color) div.style.setProperty('--topic-color', color);
    var body = el('span', 'topic-option__body');
    body.appendChild(el('span', 'topic-option__dot'));
    body.appendChild(el('span', 'topic-option__title', title));
    var count = el('span', 'topic-option__count', 'Задания готовятся ');
    count.appendChild(el('small', 'soon-badge', 'скоро'));
    body.appendChild(count);
    div.appendChild(body);
    return div;
  }

  function isPracticum(route) {
    return OLY.isPracticum(route.olympiad);
  }

  function setTitle(parts) {
    document.title = parts.concat('Олимпиады по обществознанию').join(' — ');
  }

  /* ---------- Олимпиады ---------- */

  var OLYMPIAD_CARD_META = 'Задания и тренировочные туры этой олимпиады';

  /**
   * Главная: два блока. Практикум — тематическая подготовка без привязки
   * к олимпиаде (показывается, даже пока заданий нет: дисциплины — «скоро»);
   * олимпиады — задания конкретных олимпиад (только с заданиями).
   */
  function renderHome() {
    setTitle([]);
    dom.olympiadList.textContent = '';
    dom.practicumList.textContent = '';
    OLY.olympiads.forEach(function (olympiad) {
      var n = F.buildPool({ olympiad: olympiad.id, subject: subjectOf(olympiad) }, {}).length;
      var route = { name: 'olympiad', olympiad: olympiad.id };
      if (OLY.isPracticum(olympiad)) {
        dom.practicumList.appendChild(card(route, olympiad.title,
          n ? fmt.tasksCount(n) : 'Задания готовятся', olympiad.description || null, 'var(--primary)', 'topic-option--practicum'));
        return;
      }
      if (n === 0) return;
      dom.olympiadList.appendChild(card(route, olympiad.title, fmt.tasksCount(n), OLYMPIAD_CARD_META, 'var(--primary)'));
    });
    dom.practicumBlock.hidden = dom.practicumList.children.length === 0;
    if (!dom.olympiadList.children.length) {
      dom.olympiadList.appendChild(el('p', 'empty-note', 'Заданий пока нет.'));
    }
  }

  /* ---------- Олимпиада: дисциплины ---------- */

  function renderOlympiad(route) {
    var olympiad = OLY.getOlympiad(route.olympiad);
    var subject = OLY.getSubject(subjectOf(olympiad));
    var practicum = OLY.isPracticum(olympiad);
    setTitle([olympiad.title]);
    dom.olympiadEyebrow.textContent = practicum ? 'Тематическая подготовка · обществознание' : 'Олимпиада · обществознание';
    dom.olympiadTitle.textContent = olympiad.title;
    dom.olympiadLead.textContent = practicum
      ? (olympiad.description || '') + '. Выберите дисциплину и тему: задания идут от базового понимания к олимпиадному уровню.'
      : '';
    dom.olympiadLead.hidden = !practicum;
    dom.modeSwitch.hidden = practicum;
    dom.disciplineList.textContent = '';
    subject.disciplines.forEach(function (discipline) {
      var scope = { olympiad: olympiad.id, subject: subject.id, discipline: discipline.id };
      var pool = F.buildPool(scope, {});
      if (pool.length === 0) {
        if (practicum) dom.disciplineList.appendChild(soonCard(discipline.title, discipline.color));
        return;
      }
      var topics = discipline.topics.filter(function (t) {
        return pool.some(function (task) { return task.topic === t.id; });
      }).length;
      dom.disciplineList.appendChild(card(
        { name: 'discipline', olympiad: olympiad.id, discipline: discipline.id },
        discipline.title, fmt.topicsCount(topics) + ' · ' + fmt.tasksCount(pool.length), null, discipline.color));
    });
  }

  /* ---------- Дисциплина: темы ---------- */

  function classesOf(tasks) {
    var classes = [];
    tasks.forEach(function (task) {
      OLY.getTaskFacets(task.id).classes.forEach(function (c) {
        if (classes.indexOf(c) === -1) classes.push(c);
      });
    });
    return classes;
  }

  function renderDiscipline(route) {
    var olympiad = OLY.getOlympiad(route.olympiad);
    var discipline = OLY.getDiscipline(subjectOf(olympiad), route.discipline);
    var scope = scopeOf(route);
    var pool = F.buildPool(scope, {});
    setTitle([discipline.title, olympiad.title]);
    dom.disciplineEyebrow.textContent = olympiad.title;
    dom.disciplineTitle.textContent = discipline.title;
    dom.topicList.textContent = '';

    var base = { name: 'setup', olympiad: route.olympiad, discipline: route.discipline };
    var practicum = isPracticum(route);
    var topics = discipline.topics.filter(function (topic) {
      return pool.some(function (task) { return task.topic === topic.id; });
    });
    // В практикуме карточка «Все темы» нужна, только когда тем больше одной,
    // и не показывается, если тему можно пройти лишь один раз.
    var withAll = (!practicum || topics.length > 1) && !P.wholeTopicOnly(policyOf(route));
    dom.disciplineLead.textContent = withAll ? 'Выберите тему или тренируйтесь сразу по всей дисциплине.' : 'Выберите тему.';
    if (withAll) {
      dom.topicList.appendChild(card(Object.assign({ topic: 'all' }, base),
        'Все темы дисциплины', fmt.tasksCount(pool.length), cardMeta(route, pool),
        discipline.color, 'topic-option--all'));
    }

    // Темы группируются по разделам дисциплины; темы без раздела — в начале, без заголовка.
    var groups = [{ section: null, topics: [] }];
    (discipline.sections || []).forEach(function (section) { groups.push({ section: section, topics: [] }); });
    topics.forEach(function (topic) {
      var group = groups.filter(function (g) { return g.section && g.section.id === topic.section; })[0] || groups[0];
      group.topics.push(topic);
    });
    groups.forEach(function (group) {
      if (group.topics.length === 0) return;
      if (group.section) dom.topicList.appendChild(el('h2', 'field__label list-title topic-section-title', group.section.title));
      group.topics.forEach(function (topic) {
        var tasks = pool.filter(function (task) { return task.topic === topic.id; });
        dom.topicList.appendChild(card(Object.assign({ topic: topic.id }, base),
          topic.title, fmt.tasksCount(tasks.length), cardMeta(Object.assign({ topic: topic.id }, base), tasks),
          discipline.color));
      });
    });
  }

  /**
   * Подпись карточки темы: классы у олимпиады, уровни сложности у практикума;
   * если по теме есть сохранённая попытка — её статус.
   */
  function cardMeta(route, tasks) {
    var saved = route.topic && route.topic !== 'all' && policyOf(route).persistAttempts ? store.load(scopeOf(route)) : null;
    if (saved) return attemptStatusLine(saved);
    if (isPracticum(route)) return fmt.levelsLabel(tasks.map(function (t) { return t.level; })) || null;
    return fmt.classesLabel(classesOf(tasks));
  }

  /* ---------- Настройка тренировки ---------- */

  var SETUP_NOTES = {
    topic: 'Задания разных классов по теме решаются вместе. Класс, этап и тур — фильтры: по умолчанию выбраны все задания.',
    all: 'Задания разных классов и тем дисциплины могут решаться вместе. Класс, этап и тур можно выбрать с помощью фильтров.',
    singleAttempt: 'Задания идут в учебной последовательности: блок за блоком, внутри блока — от простого к сложному. Тему можно пройти один раз: ответы сохраняются в этом браузере, после завершения откроются результаты и разбор.',
    practicumStart: 'Задания идут в учебной последовательности: от основных понятий к применению и олимпиадным кейсам.',
    practicumSingleAttempt: 'Практикум сохраняет ваш прогресс. После завершения пройти его заново нельзя, но вы сможете вернуться к своим ответам и разобрать их.',
    inProgress: 'Ответы сохраняются в этом браузере. Можно продолжить с того места, где вы остановились; после завершения тему можно будет только просматривать.',
    completed: 'Повторное прохождение темы пока недоступно. В результатах можно просмотреть все задания, свои ответы, правильные ответы и разбор.'
  };

  /** Выбранные фильтры; если тренировка охватывает всю тему (практикум) — без фильтров. */
  function currentSelection(scope) {
    if (!F.hasUserFilters(scope) || P.wholeTopicOnly(OLY.getAttemptPolicy(scope.olympiad))) return {};
    return F.normalize(scope, settings.filters);
  }

  function renderSetup(route) {
    var olympiad = OLY.getOlympiad(route.olympiad);
    var discipline = OLY.getDiscipline(subjectOf(olympiad), route.discipline);
    var topic = route.topic === 'all' ? null : OLY.getTopic(subjectOf(olympiad), route.topic);
    var section = topic && topic.section ? OLY.getSection(subjectOf(olympiad), discipline.id, topic.section) : null;
    dom.setupEyebrow.textContent = route.topic === 'all' ? 'Все темы дисциплины'
      : discipline.title + (section ? ' · ' + section.title : '');
    dom.setupTitle.textContent = route.topic === 'all' ? discipline.title : topicTitle(route);
    var policy = policyOf(route);
    dom.setupNote.textContent = isPracticum(route) ? SETUP_NOTES.practicumStart
      : P.wholeTopicOnly(policy) ? SETUP_NOTES.singleAttempt
      : route.topic === 'all' ? SETUP_NOTES.all : SETUP_NOTES.topic;
    setTitle([dom.setupTitle.textContent, olympiad.title]);
    // Предупреждение об одной попытке — на старте темы практикума, если повторы запрещены.
    var warn = isPracticum(route) && !policy.allowRetake;
    dom.setupWarning.hidden = !warn;
    dom.setupWarning.textContent = warn ? SETUP_NOTES.practicumSingleAttempt : '';

    // Новую попытку начать нельзя — вместо настройки статус и одна основная кнопка.
    var attempt = attemptFor(route);
    var locked = !P.canStartNew(policy, attempt);
    dom.setupStatus.hidden = !locked;
    dom.setupForm.hidden = locked;
    if (locked) {
      var completed = P.topicState(attempt) === 'completed';
      dom.setupStatusLabel.textContent = completed ? 'Тема пройдена' : 'Тренировка начата';
      dom.setupStatusText.textContent = attemptStatusLine(attempt);
      dom.setupStatusBtn.textContent = completed ? 'Посмотреть результаты' : 'Продолжить тренировку';
      dom.setupNote.textContent = completed ? SETUP_NOTES.completed : SETUP_NOTES.inProgress;
      dom.setupWarning.hidden = true;
      return;
    }
    renderFilters(route);
  }

  function renderFilters(route) {
    var scope = scopeOf(route);
    var selection = currentSelection(scope);
    // Практикум и «одна попытка на тему»: тренировка всегда по всей теме, фильтров нет.
    var practicum = isPracticum(route);
    var whole = practicum || P.wholeTopicOnly(policyOf(route));
    var groups = whole ? [] : F.describe(scope, selection);
    var pool = F.buildPool(scope, selection);

    dom.filters.textContent = '';
    groups.forEach(function (group) {
      var fieldset = el('fieldset', 'field filters-group');
      fieldset.appendChild(el('legend', 'field__label', group.label));
      var seg = el('div', 'segmented');
      seg.setAttribute('role', 'radiogroup');
      group.options.forEach(function (option, i) {
        var label = el('label', 'segmented__item');
        var input = el('input');
        input.type = 'radio';
        input.name = 'filter-' + group.key;
        input.id = 'filter-' + group.key + '-' + i;
        input.value = String(i);
        input.checked = option.checked;
        input.disabled = option.disabled;
        input.addEventListener('change', function () {
          settings.filters[group.key] = option.value;
          saveSettings();
          renderFilters(route);
        });
        var span = el('span', null, option.label);
        span.appendChild(el('small', 'seg-count', String(option.count)));
        label.title = option.label + ': ' + fmt.tasksCount(option.count);
        label.appendChild(input);
        label.appendChild(span);
        seg.appendChild(label);
      });
      fieldset.appendChild(seg);
      dom.filters.appendChild(fieldset);
    });

    var empty = pool.length === 0;
    dom.poolInfo.textContent = empty ? 'По выбранным фильтрам заданий нет.'
      : practicum ? fmt.practicumScopeLabel(pool)
      : (whole ? 'В теме: ' : 'Найдено: ') + fmt.tasksCount(pool.length);
    dom.poolInfo.parentNode.classList.toggle('is-empty', empty);
    dom.resetFilters.hidden = F.isDefault(selection);

    var counts = COUNT_OPTIONS.filter(function (o) { return o.value === 'all' || Number(o.value) < pool.length; });
    // В практикуме набор — учебная последовательность, его не урезают по количеству.
    dom.countField.hidden = pool.length <= 10 || isPracticum(route) || whole;
    dom.countOptions.textContent = '';
    if (!counts.some(function (o) { return o.value === settings.count; })) settings.count = 'all';
    counts.forEach(function (o) {
      var label = el('label', 'segmented__item');
      var input = el('input');
      input.type = 'radio';
      input.name = 'count';
      input.id = 'count-' + o.value;
      input.value = o.value;
      input.checked = settings.count === o.value;
      input.addEventListener('change', function () {
        settings.count = o.value;
        saveSettings();
      });
      label.appendChild(input);
      label.appendChild(el('span', null, o.label));
      dom.countOptions.appendChild(label);
    });

    dom.startBtn.textContent = practicum ? 'Начать практикум' : 'Начать тренировку';
    dom.startBtn.disabled = empty;
  }

  /**
   * Задания новой тренировки: выборка по фильтрам; в олимпиаде — перемешанная
   * и ограниченная по количеству, в практикуме — целиком в учебном порядке.
   */
  function plannedPool(route, filters) {
    var whole = isPracticum(route) || P.wholeTopicOnly(policyOf(route));
    var pool = S.arrange(route.olympiad, F.buildPool(scopeOf(route), whole ? {} : filters));
    var count = pool.length > 10 && !isPracticum(route) && !whole ? settings.count : 'all';
    return count === 'all' ? pool : pool.slice(0, Number(count));
  }

  function startAttempt(route, taskIds) {
    if (!taskIds.length) return;
    // Правило трека: при запрете повторов уже начатую или завершённую тему не начать заново.
    var existing = attemptFor(route);
    if (!P.canStartNew(policyOf(route), existing)) {
      adoptStoredAttempt(route);
      go(router.withName(route, existing.finishedAt ? 'result' : 'train'));
      return;
    }
    var scope = scopeOf(route);
    state.attempt = A.createAttempt({
      mode: 'practice',
      olympiad: scope.olympiad,
      subject: scope.subject,
      settings: { discipline: scope.discipline, topic: scope.topic, filters: currentSelection(scope) },
      taskIds: taskIds
    });
    state.attemptRoute = router.withName(route, 'setup');
    state.viewIndex = 0;
    state.reviewFilter = 'all';
    persistAttempt();
    hideConfirm();
    showRoute(router.withName(route, 'train'));
    setHash(state.route, false);
  }

  /* ---------- Тренировка ---------- */

  function currentTask() {
    return OLY.getTask(state.attempt.taskIds[state.viewIndex]);
  }

  function renderSources(container, taskId) {
    container.textContent = '';
    var lines = OLY.getAppearances(taskId).map(fmt.sourceLine).filter(Boolean);
    lines.forEach(function (line, i) {
      var p = el('p', 'sources__line', line);
      if (i > 0) p.hidden = true;
      container.appendChild(p);
    });
    if (lines.length > 1) {
      var more = el('button', 'sources__more', 'Ещё ' + (lines.length - 1) + ' ' +
        fmt.plural(lines.length - 1, 'источник', 'источника', 'источников'));
      more.type = 'button';
      more.addEventListener('click', function () {
        container.querySelectorAll('.sources__line').forEach(function (p) { p.hidden = false; });
        more.remove();
      });
      container.appendChild(more);
    }
    container.hidden = lines.length === 0;
  }

  function topicChip(chip, task) {
    chip.textContent = fmt.taskTopicLabel(task);
    var color = fmt.disciplineColor(task.subject, task.discipline);
    if (color) chip.style.setProperty('--topic-color', color);
    else chip.style.removeProperty('--topic-color');
  }

  function renderTrain() {
    var attempt = state.attempt;
    var task = currentTask();
    var view = views.get(task.type);
    var result = A.getResult(attempt, task.id);

    setTitle(['Задание ' + (state.viewIndex + 1), topicTitle(state.attemptRoute)]);
    topicChip(dom.taskTopic, task);
    dom.taskLevel.hidden = task.level === undefined;
    dom.taskLevel.textContent = task.level === undefined ? '' : fmt.levelLabel(task.level);
    if (task.level !== undefined) dom.taskLevel.dataset.level = String(task.level);
    var block = task.block ? OLY.getBlock(task.subject, task.topic, task.block) : null;
    dom.taskBlock.hidden = !block;
    dom.taskBlock.textContent = block ? block.title : '';
    renderSources(dom.taskSources, task.id);
    dom.taskQuestion.textContent = task.question;
    dom.taskHint.textContent = result ? 'Ответ проверен — изменить его нельзя.' : view.hint(task);
    dom.taskCard.classList.toggle('is-review', !!result);

    if (result) {
      state.controller = null;
      view.renderReview(dom.answer, task, { result: result });
      renderFeedback(task, result);
    } else {
      state.controller = view.render(dom.answer, task, {
        response: A.getResponse(attempt, task.id),
        onChange: onResponse
      });
    }
    dom.feedback.hidden = !result;
    // Типичная ошибка — только после неверного ответа.
    var showMistake = !!(result && result.verdict === 'incorrect' && task.typicalMistake);
    dom.typicalMistake.hidden = !showMistake;
    dom.typicalMistakeText.textContent = showMistake ? task.typicalMistake : '';
    dom.explanation.hidden = !(result && task.explanation);
    dom.explanationText.textContent = result && task.explanation ? task.explanation : '';

    renderActions();
    renderProgress();
    renderNav();
  }

  function onResponse(response) {
    var task = currentTask();
    A.setResponse(state.attempt, task.id, response);
    persistAttempt();
    renderActions();
    renderProgress();
    renderNav();
  }

  function renderFeedback(task, result) {
    var type = OLY.types.get(task.type);
    var correct = result.verdict === 'correct';
    dom.verdict.textContent = '';
    dom.verdict.className = 'points points--' + (correct ? 'full' : 'none');
    dom.verdict.appendChild(el('span', 'points__value', correct ? 'Верно' : 'Неверно'));
    var caption = '';
    if (!correct && result.details && Array.isArray(result.details.missed)) {
      var parts = [];
      if (result.details.missed.length) parts.push('пропущено верных: ' + result.details.missed.length);
      if (result.details.extra.length) parts.push('лишних: ' + result.details.extra.length);
      caption = parts.join(' · ');
      caption = caption.charAt(0).toUpperCase() + caption.slice(1);
    } else if (!correct && result.details && Array.isArray(result.details.perItem)) {
      caption = 'Ошибок в позициях: ' + result.details.mistakes + ' из ' + result.details.perItem.length;
    }
    if (caption) dom.verdict.appendChild(el('span', 'points__caption', caption));
    dom.feedbackCorrect.textContent = type.formatResponse(task, result.correct);
    dom.feedbackUser.textContent = type.formatResponse(task, result.response);
    dom.feedbackPointsRow.hidden = !result.scored;
    dom.feedbackPoints.textContent = result.scored ? result.points + ' из ' + result.maxPoints : '';
  }

  function renderActions() {
    var attempt = state.attempt;
    var task = currentTask();
    var checked = A.isChecked(attempt, task.id);
    var target = S.nextUnchecked(attempt, state.viewIndex);
    var otherTarget = target !== -1 && target !== state.viewIndex;

    dom.prevBtn.hidden = state.viewIndex === 0;
    dom.skipBtn.hidden = checked || !otherTarget;
    dom.checkBtn.hidden = checked;
    dom.checkBtn.disabled = checked || OLY.types.get(task.type).isEmpty(task, A.getResponse(attempt, task.id));
    dom.nextBtn.hidden = !checked;
    dom.nextBtn.textContent = otherTarget ? 'Следующее задание' : 'Посмотреть итоги';
  }

  function renderProgress() {
    var attempt = state.attempt;
    var total = attempt.taskIds.length;
    var checked = S.checkedCount(attempt);
    dom.progressLabel.textContent = 'Задание ' + (state.viewIndex + 1) + ' из ' + total;
    dom.checkedPill.textContent = 'Проверено: ' + checked + ' из ' + total;
    dom.progressFill.style.width = (checked / total) * 100 + '%';
    dom.progressBar.setAttribute('aria-valuemax', String(total));
    dom.progressBar.setAttribute('aria-valuenow', String(checked));
  }

  var NAV_LABELS = {
    correct: 'проверено, верно',
    incorrect: 'проверено, неверно',
    draft: 'ответ не проверен',
    empty: 'без ответа'
  };

  function renderNav() {
    var active = null;
    dom.taskNav.textContent = '';
    S.navItems(state.attempt).forEach(function (item) {
      var li = el('li');
      var btn = el('button', 'task-nav__item', String(item.index + 1));
      btn.type = 'button';
      if (item.state === 'correct') btn.classList.add('is-done', 'points--full');
      else if (item.state === 'incorrect') btn.classList.add('is-done', 'points--none');
      else if (item.state === 'draft') btn.classList.add('is-draft');
      if (item.index === state.viewIndex) {
        btn.classList.add('is-viewed');
        if (item.state === 'empty' || item.state === 'draft') btn.classList.add('is-current');
        btn.setAttribute('aria-current', 'step');
        active = btn;
      }
      var label = 'Задание ' + (item.index + 1) + ': ' + NAV_LABELS[item.state];
      btn.setAttribute('aria-label', label);
      btn.title = label;
      btn.addEventListener('click', function () { goTo(item.index); });
      li.appendChild(btn);
      dom.taskNav.appendChild(li);
    });
    if (active) {
      var list = dom.taskNav;
      var left = active.offsetLeft;
      var right = left + active.offsetWidth;
      if (left < list.scrollLeft || right > list.scrollLeft + list.clientWidth) {
        list.scrollLeft = left - (list.clientWidth - active.offsetWidth) / 2;
      }
    }
  }

  function goTo(index) {
    var n = state.attempt.taskIds.length;
    if (index < 0 || index >= n || index === state.viewIndex) return;
    state.viewIndex = index;
    renderTrain();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function checkAnswer() {
    var attempt = state.attempt;
    var task = currentTask();
    if (A.isChecked(attempt, task.id)) return;
    if (OLY.types.get(task.type).isEmpty(task, A.getResponse(attempt, task.id))) return;
    var result = A.check(attempt, task.id);
    persistAttempt();
    notifyStore('onCheck', [A.snapshot(result), A.snapshot(attempt)]);
    renderTrain();
    dom.nextBtn.focus({ preventScroll: true });
    dom.feedback.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function nextAfterCheck() {
    var target = S.nextUnchecked(state.attempt, state.viewIndex);
    if (target === -1 || target === state.viewIndex) finishAttempt();
    else goTo(target);
  }

  function skipTask() {
    var target = S.nextUnchecked(state.attempt, state.viewIndex);
    if (target !== -1) goTo(target);
  }

  function requestFinish() {
    var unchecked = S.uncheckedCount(state.attempt);
    if (unchecked > 0) showConfirm({ kind: 'finish', unchecked: unchecked });
    else finishAttempt();
  }

  function finishAttempt() {
    hideConfirm();
    A.finish(state.attempt);
    persistAttempt();
    notifyStore('onFinish', [A.snapshot(state.attempt)]);
    state.reviewFilter = 'all';
    showRoute(router.withName(state.attemptRoute, 'result'));
    setHash(state.route, false);
  }

  function showConfirm(confirm) {
    state.confirm = confirm;
    if (confirm.kind === 'finish') {
      var n = confirm.unchecked;
      dom.confirmText.textContent = 'Не ' + fmt.plural(n, 'проверено', 'проверены', 'проверено') + ' ' +
        fmt.tasksCount(n) + ' — ' + fmt.plural(n, 'оно будет засчитано как пропущенное',
        'они будут засчитаны как пропущенные', 'они будут засчитаны как пропущенные') + '.' +
        (policyOf(state.attemptRoute).allowRetake ? '' : ' Пройти тему заново будет нельзя — останется просмотр результатов.') +
        ' Завершить тренировку?';
      dom.confirmOk.textContent = 'Завершить';
    } else {
      dom.confirmText.textContent = 'Прервать тренировку? Ответы не сохранятся.';
      dom.confirmOk.textContent = 'Выйти';
    }
    dom.confirmBar.hidden = false;
    dom.confirmBar.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    dom.confirmCancel.focus({ preventScroll: true });
  }

  function hideConfirm() {
    state.confirm = null;
    dom.confirmBar.hidden = true;
  }

  function confirmOk() {
    var confirm = state.confirm;
    if (!confirm) return;
    if (confirm.kind === 'finish') {
      finishAttempt();
      return;
    }
    hideConfirm();
    state.attempt = null;
    state.attemptRoute = null;
    showRoute(confirm.route);
    setHash(state.route, false);
  }

  /* ---------- Итоги ---------- */

  function stat(className, label, value) {
    var div = el('div', 'stat ' + className);
    div.appendChild(el('dt', null, label));
    div.appendChild(el('dd', null, value));
    return div;
  }

  function scopeDescription(route, filters) {
    var olympiad = OLY.getOlympiad(route.olympiad);
    var discipline = OLY.getDiscipline(subjectOf(olympiad), route.discipline);
    var parts = [olympiad.title, discipline.title];
    parts.push(route.topic === 'all' ? 'все темы' : topicTitle(route));
    var groups = F.describe(scopeOf(route), filters || {});
    groups.forEach(function (group) {
      group.options.forEach(function (o) {
        if (o.checked && o.value !== F.ALL) {
          parts.push(group.key === 'class' ? o.label + ' класс' : o.label);
        }
      });
    });
    return parts.join(' · ');
  }

  function renderResult() {
    var attempt = state.attempt;
    var route = state.attemptRoute;
    var o = S.outcome(attempt);
    setTitle(['Итоги', topicTitle(route)]);

    dom.resultScope.textContent = scopeDescription(route, attempt.settings.filters);
    dom.resultStats.textContent = '';
    dom.resultStats.appendChild(stat('stat--right', 'Верно', o.correct + ' из ' + o.total));
    dom.resultStats.appendChild(stat('stat--wrong', 'Неверно', String(o.incorrect)));
    dom.resultStats.appendChild(stat('stat--skip', 'Пропущено', String(o.skipped)));

    // Баллы — только по заданиям с официальными критериями, отдельно от счёта заданий.
    dom.resultPoints.textContent = '';
    dom.resultPoints.hidden = !o.showPoints;
    if (o.showPoints) {
      var line = el('p');
      line.appendChild(document.createTextNode('Баллы по критериям оценивания: '));
      line.appendChild(el('strong', null, o.points + ' из ' + o.maxPoints));
      dom.resultPoints.appendChild(line);
      dom.resultPoints.appendChild(el('p', null, 'Учтены задания с критериями: ' + o.scoredCount + ' из ' + o.total + '.'));
    }

    // Кнопки новых попыток — только если правила трека их разрешают.
    var policy = policyOf(route);
    dom.againBtn.hidden = !policy.allowRetake;
    dom.againBtn.textContent = route.topic === 'all' ? 'Ещё раз по дисциплине' : 'Ещё раз по теме';
    dom.skippedBtn.hidden = o.skipped === 0 || !P.canRetry(policy, 'skipped');
    dom.skippedBtn.textContent = 'Решить пропущенные (' + o.skipped + ')';
    dom.mistakesBtn.hidden = o.incorrect === 0 || !P.canRetry(policy, 'mistakes');
    dom.mistakesBtn.textContent = 'Повторить ошибки (' + o.incorrect + ')';
    dom.topicsBtn.classList.toggle('btn--primary', !policy.allowRetake);
    dom.topicsBtn.classList.toggle('btn--ghost', policy.allowRetake);
    dom.resultNote.hidden = policy.allowRetake;
    dom.resultNote.textContent = policy.allowRetake ? ''
      : 'Повторное прохождение темы пока недоступно. Ниже — все задания с вашими ответами, правильными ответами и разбором.';

    dom.reviewAllLabel.textContent = 'Все (' + o.total + ')';
    dom.reviewMistakesLabel.textContent = 'С ошибками (' + o.incorrect + ')';
    dom.reviewSkippedLabel.textContent = 'Пропущенные (' + o.skipped + ')';
    dom.reviewFilter.querySelectorAll('input').forEach(function (input) {
      input.checked = input.value === state.reviewFilter;
    });
    renderReview();
  }

  var VERDICT_TEXT = { correct: 'Верно', incorrect: 'Неверно' };

  function renderReview() {
    var attempt = state.attempt;
    var filter = state.reviewFilter;
    var ids = filter === 'all' ? attempt.taskIds : S.subsetIds(attempt, filter);
    dom.reviewList.textContent = '';

    if (ids.length === 0) {
      dom.reviewList.appendChild(el('li', 'review-list__empty',
        filter === 'mistakes' ? 'Ошибок нет.' : 'Пропущенных заданий нет.'));
    }

    ids.forEach(function (id) {
      var index = attempt.taskIds.indexOf(id);
      var task = OLY.getTask(id);
      var type = OLY.types.get(task.type);
      var result = A.getResult(attempt, id);
      var taskState = S.taskState(attempt, id);
      var solved = taskState === 'correct' || taskState === 'incorrect';

      var li = el('li', 'review-item');
      var details = el('details', 'review-item__details');
      var summary = el('summary', 'review-item__summary');
      var head = el('div', 'mistake__head');
      head.appendChild(el('span', 'mistake__num', 'Задание ' + (index + 1)));
      var chip = el('span', 'chip chip--sm');
      topicChip(chip, task);
      head.appendChild(chip);
      if (task.level !== undefined) {
        var level = el('span', 'level-badge level-badge--sm', fmt.levelLabel(task.level));
        level.dataset.level = String(task.level);
        head.appendChild(level);
      }
      var mark = solved
        ? el('span', 'mistake__points points--' + (taskState === 'correct' ? 'full' : 'none'), VERDICT_TEXT[taskState])
        : el('span', 'mistake__points is-skipped', 'Не решено');
      if (solved && result.scored) mark.textContent += ' · ' + result.points + ' из ' + result.maxPoints;
      head.appendChild(mark);
      summary.appendChild(head);
      summary.appendChild(el('p', 'mistake__question', task.question));

      var answers = el('p', 'mistake__answers');
      if (solved) {
        answers.appendChild(el('span', null, 'Ваш ответ: '));
        answers.appendChild(el('strong', taskState === 'correct' ? 'text-right' : 'text-wrong',
          type.formatResponse(task, result.response)));
        answers.appendChild(el('span', null, ' · Правильный: '));
      } else {
        answers.appendChild(el('span', null, 'Правильный ответ: '));
      }
      answers.appendChild(el('strong', 'text-right', type.formatResponse(task, type.getCorrect(task))));
      summary.appendChild(answers);
      summary.appendChild(el('span', 'review-item__toggle', 'Показать разбор'));

      var body = el('div', 'review-item__body');
      var sources = el('div', 'sources');
      renderSources(sources, id);
      body.appendChild(sources);
      var box = el('div', 'answer');
      views.get(task.type).renderReview(box, task, { result: solved ? result : null });
      body.appendChild(box);
      if (task.typicalMistake && taskState !== 'correct') {
        var mistake = el('div', 'explanation explanation--mistake');
        mistake.appendChild(el('h4', 'explanation__title', 'Типичная ошибка'));
        mistake.appendChild(el('p', null, task.typicalMistake));
        body.appendChild(mistake);
      }
      if (task.explanation) {
        var expl = el('div', 'explanation');
        expl.appendChild(el('h4', 'explanation__title', 'Разбор'));
        expl.appendChild(el('p', null, task.explanation));
        body.appendChild(expl);
      }

      details.appendChild(summary);
      details.appendChild(body);
      details.addEventListener('toggle', updateExpandAllButton);
      li.appendChild(details);
      dom.reviewList.appendChild(li);
    });
    updateExpandAllButton();
  }

  function reviewDetails() {
    return Array.prototype.slice.call(dom.reviewList.querySelectorAll('details'));
  }

  function updateExpandAllButton() {
    var all = reviewDetails();
    dom.expandAllBtn.hidden = all.length === 0;
    var open = all.length > 0 && all.every(function (d) { return d.open; });
    dom.expandAllBtn.textContent = open ? 'Свернуть все' : 'Развернуть все';
  }

  /* ---------- События ---------- */

  // Все внутренние ссылки обрабатываются здесь: так навигация работает и там,
  // где адрес страницы изменить нельзя.
  document.addEventListener('click', function (e) {
    var link = e.target.closest && e.target.closest('a[data-route]');
    if (!link || e.defaultPrevented || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    go(router.parse(link.getAttribute('href')));
  });
  window.addEventListener('hashchange', onHashChange);

  dom.setupForm.addEventListener('submit', function (e) {
    e.preventDefault();
    if (!state.route || state.route.name !== 'setup') return;
    var route = state.route;
    startAttempt(route, plannedPool(route, currentSelection(scopeOf(route))).map(function (t) { return t.id; }));
  });
  dom.setupStatusBtn.addEventListener('click', function () {
    var route = state.route;
    if (!route || route.name !== 'setup') return;
    var attempt = attemptFor(route);
    if (attempt) go(router.withName(route, attempt.finishedAt ? 'result' : 'train'));
  });
  dom.resetFilters.addEventListener('click', function () {
    settings.filters = {};
    saveSettings();
    renderFilters(state.route);
  });

  dom.prevBtn.addEventListener('click', function () { goTo(state.viewIndex - 1); });
  dom.skipBtn.addEventListener('click', skipTask);
  dom.checkBtn.addEventListener('click', checkAnswer);
  dom.nextBtn.addEventListener('click', nextAfterCheck);
  dom.finishBtn.addEventListener('click', requestFinish);
  dom.confirmCancel.addEventListener('click', hideConfirm);
  dom.confirmOk.addEventListener('click', confirmOk);

  dom.againBtn.addEventListener('click', function () {
    var route = state.attemptRoute;
    if (!policyOf(route).allowRetake) return;
    startAttempt(route, plannedPool(route, attemptFilters()).map(function (t) { return t.id; }));
  });
  dom.skippedBtn.addEventListener('click', function () {
    if (!P.canRetry(policyOf(state.attemptRoute), 'skipped')) return;
    startAttempt(state.attemptRoute, S.arrangeIds(state.attemptRoute.olympiad, S.subsetIds(state.attempt, 'skipped')));
  });
  dom.mistakesBtn.addEventListener('click', function () {
    if (!P.canRetry(policyOf(state.attemptRoute), 'mistakes')) return;
    startAttempt(state.attemptRoute, S.arrangeIds(state.attemptRoute.olympiad, S.subsetIds(state.attempt, 'mistakes')));
  });
  dom.topicsBtn.addEventListener('click', function () {
    var route = state.attemptRoute;
    go({ name: 'discipline', olympiad: route.olympiad, discipline: route.discipline });
  });

  function attemptFilters() {
    return (state.attempt && state.attempt.settings.filters) || {};
  }

  dom.reviewFilter.addEventListener('change', function (e) {
    if (e.target.name !== 'review-filter') return;
    state.reviewFilter = e.target.value;
    renderReview();
  });
  dom.expandAllBtn.addEventListener('click', function () {
    var all = reviewDetails();
    var open = !all.every(function (d) { return d.open; });
    all.forEach(function (d) { d.open = open; });
    updateExpandAllButton();
  });

  document.addEventListener('keydown', function (e) {
    if (!state.route || state.route.name !== 'train' || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'Escape' && state.confirm) {
      hideConfirm();
      return;
    }
    var tag = e.target && e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    var task = currentTask();
    var checked = A.isChecked(state.attempt, task.id);

    if (/^[1-9]$/.test(e.key)) {
      var view = views.get(task.type);
      if (checked || !view.keyInput || !state.controller) return;
      var next = view.keyInput(task, A.getResponse(state.attempt, task.id), parseInt(e.key, 10));
      if (next === null) return;
      e.preventDefault();
      state.controller.set(next);
      onResponse(next);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      goTo(state.viewIndex + (e.key === 'ArrowLeft' ? -1 : 1));
    } else if (e.key === 'Enter') {
      // Enter на обычной кнопке и так нажимает её; на вариантах ответа — «Проверить».
      if (tag === 'BUTTON' && !e.target.classList.contains('statement__btn')) return;
      if (tag === 'A') return;
      e.preventDefault();
      if (checked) nextAfterCheck();
      else if (!dom.checkBtn.disabled) checkAnswer();
    }
  });

  onHashChange();
})();
