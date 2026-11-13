/**
 * Интерфейс режимов практикума «Обучение» и «Экзамен» (практикумы с полем modes).
 * Логика, оценивание, аналитика и сохранение — js/mode-session.js; отрисовка заданий
 * и разбора — общая js/task-view.js; карточка практикума, экраны и шапка — js/app.js,
 * который вызывает EGE.practicumModes.init(env) и fillCard(...).
 *
 * До завершения экзамена (и до проверки задания в обучении) в разметке нет ни ключей,
 * ни статусов «верно/неверно», ни объяснений: варианты рисуются только для выбора.
 */
(function () {
  'use strict';

  var EGE = window.EGE;
  var scoring = EGE.scoring;
  var M = EGE.modeSession;
  var save = EGE.attemptSave;
  var view = EGE.taskView;
  var el = view.el;

  var HINTS = {
    'multiple': 'Отметьте все верные суждения. Можно выбрать несколько вариантов.',
    'multiple-items': 'Выберите все подходящие варианты.',
    'exclude-two': 'Отметьте ровно две позиции, которые «выпадают» из общего ряда.',
    'matching': 'Напротив каждой позиции выберите номер из второго столбца.'
  };
  var MODE_DESCRIPTIONS = {
    learn: 'Задания по порядку. После проверки — баллы, правильный ответ и разбор каждой позиции; задание можно повторить.',
    exam: 'Все задания без подсказок: можно переходить между ними, менять ответы и пропускать. Ответы и разбор — после завершения.'
  };
  var MODE_BANNERS = {
    learn: 'Обучение: проверка и разбор после каждого задания. В итог идут баллы первой проверки.',
    exam: 'Экзамен: правильные ответы и разбор появятся после завершения. Ответы можно менять до конца работы.'
  };
  var START_LABELS = { learn: 'Начать обучение', exam: 'Начать экзамен' };
  var FORMAT_TITLES = {};
  M.FORMATS.forEach(function (f) { FORMAT_TITLES[f.id] = f.title; });

  var env = null;
  var screens = {};
  var state = {
    practicum: null,
    session: null,
    matchRow: 0,
    confirmFinish: false,
    result: null      // { session, rows, analytics, changed, note }
  };

  function storage() { return env.storage; }

  function scopeOf(practicum) {
    return save.scopeId('ege', { section: practicum.section, topic: practicum.topic, practicum: practicum.id });
  }

  function deps(practicum, mode, finished) {
    return {
      getTask: EGE.getTask,
      fingerprint: save.taskFingerprint,
      taskIds: practicum.taskIds,
      mode: mode,
      scope: scopeOf(practicum),
      finished: !!finished
    };
  }

  function hasModes(practicum) {
    return Array.isArray(practicum.modes) && practicum.modes.length > 0;
  }

  /** Есть ли незавершённая сессия любого режима (без проверки — её делает карточка). */
  function hasProgress(practicum) {
    if (!hasModes(practicum) || !storage()) return false;
    return practicum.modes.some(function (mode) {
      try { return storage().getItem(M.sessionKey(mode, scopeOf(practicum))) !== null; } catch (e) { return false; }
    });
  }

  function isStorageKey(key) {
    return typeof key === 'string' && (key.indexOf(M.KEY_PREFIX) === 0 || key.indexOf(M.RESULT_PREFIX) === 0 ||
      key.indexOf(M.HISTORY_PREFIX) === 0);
  }

  function button(className, text, onClick) {
    var btn = el('button', 'btn ' + className, text);
    btn.type = 'button';
    btn.addEventListener('click', onClick);
    return btn;
  }

  function plural(n, one, few, many) {
    var mod10 = n % 10;
    var mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return one;
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
    return many;
  }

  function practicumLabel(practicum, mode) {
    return EGE.getTopic(practicum.topic).title + ' · ' + EGE.practicumTitle(practicum) + ' · ' + M.MODE_TITLES[mode];
  }

  function typeOf(task) { return scoring.getTaskType(task); }

  /* ---------- Карточка практикума ---------- */

  /** Блок режима в карточке: описание, состояние и кнопки. */
  function modeBlock(practicum, mode) {
    var box = el('section', 'mode-option');
    box.setAttribute('data-mode', mode);
    var titleId = 'mode-' + practicum.id + '-' + mode;
    var title = el('h4', 'mode-option__title', M.MODE_TITLES[mode]);
    title.id = titleId;
    box.setAttribute('aria-labelledby', titleId);
    box.appendChild(title);
    box.appendChild(el('p', 'mode-option__desc', MODE_DESCRIPTIONS[mode]));

    var d = deps(practicum, mode);
    var loaded = M.load(storage(), d);
    var history = M.loadHistory(storage(), mode, d.scope);
    var last = M.loadResult(storage(), deps(practicum, mode, true));
    var actions = el('div', 'mode-option__actions');

    if (loaded.status === 'invalid') {
      var notice = el('p', 'practicum-card__notice', 'Сохранённую попытку нельзя продолжить: ' + loaded.message + ' Начните заново.');
      notice.setAttribute('role', 'status');
      box.appendChild(notice);
    }
    if (history.length) {
      var h = history[0];
      var line = 'Последний результат: ' + scoring.formatPointsOutOf(h.score, h.max) + ' (' +
        scoring.percent(h.score, h.max) + '%) · ' + env.formatDate(h.finishedAt);
      box.appendChild(el('p', 'practicum-card__result', line));
      if (history.length > 1) {
        var best = history.reduce(function (b, x) { return x.score > b.score ? x : b; }, h);
        box.appendChild(el('p', 'practicum-card__progress', 'Завершённых попыток: ' + history.length +
          ' · лучший результат: ' + scoring.formatPointsOutOf(best.score, best.max)));
      }
    }

    if (loaded.status === 'ok') {
      var s = loaded.session;
      var n = M.progressCount(s, EGE.getTask);
      box.appendChild(el('p', 'practicum-card__progress',
        'Не завершено: ' + (mode === 'exam' ? 'отвечено ' : 'проверено ') + n + ' из ' + s.taskIds.length +
        ' · сохранено ' + env.formatDate(s.updatedAt)));
      actions.appendChild(button('btn--primary mode-option__continue', 'Продолжить', function () {
        openRun(practicum, s);
      }));
      restartControl(actions, practicum, mode);
    } else {
      actions.appendChild(button('btn--primary mode-option__start', START_LABELS[mode], function () {
        startMode(practicum, mode);
      }));
    }
    if (last.status === 'ok') {
      actions.appendChild(button('btn--ghost mode-option__results', 'Посмотреть результаты', function () {
        openResult(practicum, last.session, last.changed, null);
      }));
    }
    actions.querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-describedby', titleId); });
    box.appendChild(actions);
    return box;
  }

  /** «Начать заново» с подтверждением: незавершённая попытка удаляется (итоги прежних попыток остаются). */
  function restartControl(actions, practicum, mode) {
    var start = button('btn--ghost mode-option__restart', 'Начать заново', function () {
      start.hidden = true;
      confirm.hidden = false;
      confirm.querySelector('.mode-option__confirm-yes').focus();
    });
    var confirm = el('div', 'practicum-card__confirm');
    confirm.hidden = true;
    confirm.setAttribute('role', 'group');
    var text = el('p', 'practicum-card__confirm-text', 'Незавершённая попытка будет удалена, результаты завершённых попыток сохранятся. Начать заново?');
    text.id = 'mode-' + practicum.id + '-' + mode + '-confirm';
    confirm.setAttribute('aria-labelledby', text.id);
    confirm.appendChild(text);
    var row = el('div', 'practicum-card__confirm-actions');
    row.appendChild(button('btn--primary mode-option__confirm-yes', 'Начать заново', function () {
      M.discard(storage(), mode, scopeOf(practicum));
      startMode(practicum, mode);
    }));
    row.appendChild(button('btn--ghost mode-option__confirm-no', 'Отмена', function () {
      confirm.hidden = true;
      start.hidden = false;
      start.focus();
    }));
    confirm.appendChild(row);
    actions.appendChild(start);
    actions.appendChild(confirm);
  }

  /** Заполняет карточку практикума (каркас — js/app.js): по блоку на режим. */
  function fillCard(frame) {
    var practicum = EGE.getPracticum(frame.card.getAttribute('data-practicum'));
    frame.card.classList.add('practicum-card--modes');
    frame.card.appendChild(el('p', 'practicum-card__note',
      'Два режима: обучение с разбором после каждого задания и экзамен с разбором после завершения. Попытки и результаты режимов хранятся отдельно.'));
    var list = el('div', 'mode-options');
    practicum.modes.forEach(function (mode) { list.appendChild(modeBlock(practicum, mode)); });
    frame.card.appendChild(list);
    frame.actions.hidden = true;
  }

  /* ---------- Прохождение ---------- */

  function startMode(practicum, mode) {
    if (!EGE.isPracticumReady(practicum)) { env.showStart(); return; }
    var session = M.create({
      mode: mode, practicum: practicum.id, scope: scopeOf(practicum),
      taskIds: practicum.taskIds, getTask: EGE.getTask, fingerprint: save.taskFingerprint
    });
    M.save(storage(), session, { force: true });
    openRun(practicum, session);
  }

  function openRun(practicum, session) {
    state.practicum = practicum;
    state.session = session;
    state.matchRow = 0;
    state.confirmFinish = false;
    state.result = null;
    M.save(storage(), session, { force: true });
    buildRun();
    env.showScreen('mode');
    renderRun();
  }

  function persist() {
    if (state.session && !state.session.finishedAt) M.save(storage(), state.session);
  }

  var run = {};

  function buildRun() {
    var root = screens.mode;
    root.textContent = '';

    var top = el('div', 'mode-top');
    run.title = el('p', 'quiz-title mode-top__title');
    run.title.id = 'mode-run-title';
    top.appendChild(run.title);
    top.appendChild(button('btn--ghost btn--sm mode-top__exit', 'К выбору практикума', function () { env.showStart(); }));
    root.appendChild(top);
    run.banner = el('p', 'mode-banner');
    root.appendChild(run.banner);

    var progress = el('div', 'progress');
    var row = el('div', 'progress__row');
    run.label = el('span', 'progress__label');
    run.label.id = 'mode-progress-label';
    run.pill = el('span', 'score-pill');
    run.pill.id = 'mode-pill';
    row.appendChild(run.label);
    row.appendChild(run.pill);
    progress.appendChild(row);
    run.track = el('div', 'progress__track');
    run.track.setAttribute('role', 'progressbar');
    run.track.setAttribute('aria-valuemin', '0');
    run.track.setAttribute('aria-label', 'Прогресс');
    run.fill = el('div', 'progress__fill');
    run.track.appendChild(run.fill);
    progress.appendChild(run.track);
    var nav = el('nav', 'task-nav');
    nav.setAttribute('aria-label', 'Задания практикума');
    run.nav = el('ol', 'task-nav__list');
    run.nav.id = 'mode-nav';
    nav.appendChild(run.nav);
    progress.appendChild(nav);
    root.appendChild(progress);

    var card = el('article', 'panel task');
    card.id = 'mode-task';
    run.card = card;
    var meta = el('div', 'task__meta');
    run.chip = el('span', 'chip');
    run.format = el('span', 'chip chip--format');
    meta.appendChild(run.chip);
    meta.appendChild(run.format);
    card.appendChild(meta);
    run.question = el('h2', 'task__question');
    run.question.id = 'mode-question';
    card.appendChild(run.question);
    run.hint = el('p', 'task__hint');
    run.hint.id = 'mode-hint';
    run.hint.setAttribute('aria-live', 'polite');
    card.appendChild(run.hint);
    run.statements = el('ol', 'statements');
    run.statements.id = 'mode-statements';
    card.appendChild(run.statements);
    run.matching = el('div', 'matching');
    run.matching.id = 'mode-matching';
    card.appendChild(run.matching);
    run.instruction = el('p', 'task__instruction');
    card.appendChild(run.instruction);
    run.check = el('div', 'mode-check');
    run.check.id = 'mode-check';
    card.appendChild(run.check);

    var actions = el('div', 'task__actions');
    run.prev = button('btn--ghost btn--lg', '← Назад', function () { go(state.session.viewIndex - 1); });
    run.prev.id = 'mode-prev';
    run.clear = button('btn--ghost btn--lg', 'Очистить ответ', clearResponse);
    run.clear.id = 'mode-clear';
    run.retry = button('btn--ghost btn--lg', 'Повторить задание', retryTask);
    run.retry.id = 'mode-retry';
    run.cancelRetry = button('btn--ghost btn--lg', 'Отменить повтор', cancelRetry);
    run.cancelRetry.id = 'mode-cancel-retry';
    run.primary = button('btn--primary btn--lg', '', primaryAction);
    run.primary.id = 'mode-primary';
    actions.appendChild(run.prev);
    actions.appendChild(run.clear);
    actions.appendChild(el('span', 'task__actions-spacer'));
    actions.appendChild(run.cancelRetry);
    actions.appendChild(run.retry);
    actions.appendChild(run.primary);
    card.appendChild(actions);
    var kbd = el('p', 'kbd-hint');
    kbd.setAttribute('aria-hidden', 'true');
    kbd.innerHTML = 'Клавиши <kbd>1</kbd>–<kbd>9</kbd> отмечают позиции (в соответствии — номер для выделенной позиции), ' +
      '<kbd>Enter</kbd> — ' + (state.session.mode === 'learn' ? 'проверить / дальше' : 'следующее задание') +
      ', <kbd>←</kbd> <kbd>→</kbd> — переход между заданиями';
    card.appendChild(kbd);
    root.appendChild(card);

    // Экзамен: завершение — отдельная панель с подтверждением; обучение — после всех проверок.
    run.finish = el('div', 'panel mode-finish');
    run.finish.id = 'mode-finish';
    root.appendChild(run.finish);
  }

  function currentTask() {
    return EGE.getTask(state.session.taskIds[state.session.viewIndex]);
  }

  function hintFor(task, selected) {
    var type = typeOf(task);
    var hint = HINTS[type === 'multiple' && task.choiceOf === 'items' ? 'multiple-items' : type];
    if (type === 'exclude-two') hint += ' Выбрано: ' + selected.length + ' из ' + scoring.EXCLUDE_COUNT + '.';
    return hint;
  }

  function renderRun() {
    var s = state.session;
    var task = currentTask();
    var learn = s.mode === 'learn';
    var checked = M.isChecked(s, task.id);
    var selected = M.getResponse(s, task);
    var isMatching = typeOf(task) === 'matching';

    run.title.textContent = practicumLabel(state.practicum, s.mode);
    run.banner.textContent = MODE_BANNERS[s.mode];
    run.banner.className = 'mode-banner mode-banner--' + s.mode;
    run.chip.textContent = view.topicLabel(task);
    run.chip.style.setProperty('--topic-color', EGE.getSection(task.section).color);
    run.format.textContent = FORMAT_TITLES[task.bankFormat] || '';
    run.format.hidden = !task.bankFormat;
    run.question.textContent = task.question;
    run.instruction.textContent = task.instruction || '';
    run.instruction.hidden = !task.instruction;
    run.card.classList.toggle('is-review', checked);

    var lastTry = null;
    if (checked) {
      var tries = M.triesOf(s, task.id);
      lastTry = M.grade(task, tries[tries.length - 1].selected);
    }
    run.hint.textContent = checked ? 'Ответ проверен. Можно повторить задание или перейти к следующему.' : hintFor(task, selected);

    run.statements.hidden = isMatching;
    run.matching.hidden = !isMatching;
    var answer = checked ? lastTry : null;
    if (isMatching) {
      run.statements.textContent = '';
      renderMatchingBox(task, answer, selected);
    } else {
      run.matching.textContent = '';
      view.renderStatements(run.statements, task, {
        answer: answer,
        selected: answer ? null : selected,
        onToggle: toggle
      });
    }

    run.check.textContent = '';
    run.check.hidden = !checked;
    if (checked) renderCheck(task, lastTry);

    renderActions(task, selected, checked);
    renderProgress();
    renderNav();
    renderFinish();
  }

  function renderMatchingBox(task, answer, selected) {
    view.renderMatching(run.matching, task, {
      answer: answer,
      selected: answer ? null : selected,
      activeRow: state.matchRow,
      onChoose: choose
    });
  }

  /** Обучение: баллы, правильный и свой ответ, разбор ошибки, пояснения к заданию. */
  function renderCheck(task, g) {
    var s = state.session;
    var tries = M.triesOf(s, task.id);
    var fb = view.createFeedback(g, task);
    fb.id = 'mode-feedback';
    run.check.appendChild(fb);
    if (tries.length > 1) {
      run.check.appendChild(el('p', 'mode-check__tries',
        'Попытка ' + tries.length + '. В итог идёт первая проверка: ' +
        scoring.formatPointsOutOf(tries[0].points, tries[0].maxPoints) + '.'));
    }
    run.check.appendChild(mistakeBlock(task, g));
    var notes = view.createTaskNotes(task);
    if (notes) run.check.appendChild(notes);
  }

  function optionName(task, n) {
    return n == null ? 'не выбрано' : n + ' (' + task.options[n - 1] + ')';
  }

  /** «Разбор вашего ответа»: что именно не так в каждой ошибочной позиции. */
  function mistakeBlock(task, g) {
    var box = el('div', 'mode-mistakes');
    box.appendChild(el('h3', 'mode-mistakes__title', 'Разбор вашего ответа'));
    if (g.skipped) {
      box.appendChild(el('p', 'mode-mistakes__ok mode-mistakes__ok--none', 'Ответ не дан — 0 баллов. Ниже — правильный ответ и объяснение каждой позиции.'));
      return box;
    }
    var details = M.mistakeDetails(task, g.selected);
    if (details.length === 0) {
      box.appendChild(el('p', 'mode-mistakes__ok', 'Ошибок нет: ответ полностью совпадает с правильным.'));
      return box;
    }
    var type = typeOf(task);
    var list = el('ul', 'mode-mistakes__list');
    details.forEach(function (d) {
      var li = el('li', 'mode-mistakes__item');
      var text;
      if (type === 'matching') {
        text = d.letter + ') «' + d.item.text + '»: ' + (d.chosen == null ? 'номер не выбран' : 'выбрано ' + optionName(task, d.chosen)) +
          ', правильно — ' + optionName(task, d.expected) + '.';
      } else {
        var noun = type === 'exclude-two' ? 'Позиция' : task.choiceOf === 'items' ? 'Признак' : 'Суждение';
        var q = ' ' + d.number + ' «' + d.statement.text + '» — ';
        if (type === 'exclude-two') {
          text = noun + q + (d.kind === 'wrong' ? 'относится к ряду, исключать её не нужно.' : 'выпадает из ряда, но не отмечена.');
        } else if (task.choiceOf === 'items') {
          text = noun + q + (d.kind === 'wrong' ? 'не подходит, а вы его выбрали.' : 'подходит, но не выбран.');
        } else {
          text = noun + q + (d.kind === 'wrong' ? 'неверное, а вы его выбрали.' : 'верное, но не выбрано.');
        }
      }
      li.appendChild(el('p', null, text));
      var trap = d.statement ? view.trapText(d.statement.trap) : null;
      if (trap) li.appendChild(el('p', 'statement__trap', 'Ловушка: ' + trap));
      list.appendChild(li);
    });
    box.appendChild(list);
    box.appendChild(el('p', 'mode-mistakes__rule', scoring.getMaxPoints(task) === 1
      ? 'Задание оценивается в 1 балл только за полностью верный ответ.'
      : 'Одна ошибка — 1 балл, две и более — 0 баллов.'));
    return box;
  }

  function renderActions(task, selected, checked) {
    var s = state.session;
    var last = s.taskIds.length - 1;
    var learn = s.mode === 'learn';
    var tries = M.triesOf(s, task.id);
    run.prev.hidden = s.viewIndex === 0;
    run.clear.hidden = learn || !M.isFilled(task, selected);
    run.retry.hidden = !(learn && checked);
    run.cancelRetry.hidden = !(learn && !checked && tries.length > 0);
    run.primary.disabled = false;
    if (learn) {
      if (!checked) {
        run.primary.textContent = 'Проверить';
        run.primary.disabled = !M.isComplete(task, selected);
      } else if (s.viewIndex < last) {
        run.primary.textContent = 'Следующее задание';
      } else {
        run.primary.textContent = 'Посмотреть результаты';
        run.primary.disabled = !M.canFinish(s);
      }
    } else {
      run.primary.textContent = s.viewIndex < last ? 'Следующее задание' : 'К завершению';
    }
  }

  function renderProgress() {
    var s = state.session;
    var total = s.taskIds.length;
    var done = M.progressCount(s, EGE.getTask);
    run.label.textContent = 'Задание ' + (s.viewIndex + 1) + ' из ' + total + ' · ' +
      (s.mode === 'learn' ? 'проверено ' : 'отвечено ') + done;
    if (s.mode === 'learn') {
      var pts = 0;
      var max = 0;
      s.taskIds.forEach(function (id) {
        var t = M.triesOf(s, id)[0];
        if (t) { pts += t.points; max += t.maxPoints; }
      });
      run.pill.textContent = 'Баллы: ' + pts + ' из ' + max;
      run.pill.title = 'По первой проверке каждого задания';
    } else {
      run.pill.textContent = 'Без ответа: ' + (total - done);
      run.pill.title = '';
    }
    run.fill.style.width = (done / total) * 100 + '%';
    run.track.setAttribute('aria-valuemax', String(total));
    run.track.setAttribute('aria-valuenow', String(done));
  }

  function renderNav() {
    var s = state.session;
    var active = null;
    var first = M.firstUnchecked(s);
    run.nav.textContent = '';
    s.taskIds.forEach(function (id, i) {
      var task = EGE.getTask(id);
      var li = el('li');
      var btn = el('button', 'task-nav__item', String(i + 1));
      btn.type = 'button';
      var label = 'Задание ' + (i + 1) + ': ';
      if (s.mode === 'exam') {
        if (M.isFilled(task, s.responses[id])) {
          btn.classList.add('is-answered');
          label += 'есть ответ';
        } else {
          label += 'без ответа';
        }
      } else {
        var tries = M.triesOf(s, id);
        if (tries.length) {
          var lt = tries[tries.length - 1];
          btn.classList.add('is-done', 'points--' + scoring.pointsLevel(lt.points, lt.maxPoints));
          label += 'проверено, ' + scoring.formatPointsOutOf(lt.points, lt.maxPoints);
        } else if (i === first) {
          btn.classList.add('is-current');
          label += 'текущее';
        } else {
          btn.classList.add('is-locked');
          btn.disabled = true;
          label += 'ещё не выполнено';
        }
      }
      if (i === s.viewIndex) {
        btn.classList.add('is-viewed');
        btn.setAttribute('aria-current', 'step');
        active = btn;
      }
      btn.setAttribute('aria-label', label);
      btn.title = label;
      if (!btn.disabled) btn.addEventListener('click', function () { go(i); });
      li.appendChild(btn);
      run.nav.appendChild(li);
    });
    if (active) {
      var list = run.nav;
      var left = active.offsetLeft;
      if (left < list.scrollLeft || left + active.offsetWidth > list.scrollLeft + list.clientWidth) {
        list.scrollLeft = left - (list.clientWidth - active.offsetWidth) / 2;
      }
    }
  }

  function unansweredNumbers() {
    var s = state.session;
    return s.taskIds.map(function (id, i) { return M.isFilled(EGE.getTask(id), s.responses[id]) ? null : i + 1; })
      .filter(function (n) { return n !== null; });
  }

  function renderFinish() {
    var s = state.session;
    var box = run.finish;
    box.textContent = '';
    if (s.mode === 'learn') {
      box.hidden = !M.canFinish(s);
      if (box.hidden) return;
      box.appendChild(el('p', 'mode-finish__text', 'Все задания проверены. Можно повторить любое задание или посмотреть итоги.'));
      box.appendChild(button('btn--primary mode-finish__go', 'Посмотреть результаты', finishSession));
      return;
    }
    box.hidden = false;
    var missing = unansweredNumbers();
    if (!state.confirmFinish) {
      box.appendChild(el('p', 'mode-finish__text', missing.length
        ? 'Без ответа: ' + missing.length + ' ' + plural(missing.length, 'задание', 'задания', 'заданий') + '. Завершить экзамен можно в любой момент.'
        : 'Ответы даны на все задания. Проверьте их и завершите экзамен.'));
      box.appendChild(button('btn--ghost mode-finish__open', 'Завершить экзамен', function () {
        state.confirmFinish = true;
        renderFinish();
        box.querySelector('.mode-finish__confirm').focus();
      }));
      return;
    }
    box.setAttribute('role', 'group');
    var text = el('p', 'mode-finish__text mode-finish__warn', missing.length
      ? 'Без ответа останутся задания: ' + missing.join(', ') + ' — за них 0 баллов. После завершения ответы изменить нельзя. Завершить экзамен?'
      : 'После завершения ответы изменить нельзя. Завершить экзамен?');
    text.id = 'mode-finish-text';
    box.setAttribute('aria-labelledby', text.id);
    box.appendChild(text);
    var row = el('div', 'practicum-card__confirm-actions');
    row.appendChild(button('btn--primary mode-finish__confirm', 'Завершить и посмотреть результаты', finishSession));
    row.appendChild(button('btn--ghost mode-finish__cancel', 'Вернуться к заданиям', function () {
      state.confirmFinish = false;
      renderFinish();
      box.querySelector('.mode-finish__open').focus();
    }));
    box.appendChild(row);
  }

  function go(index) {
    var s = state.session;
    if (index === s.viewIndex || !M.setView(s, index)) return;
    state.matchRow = 0;
    persist();
    renderRun();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function toggle(number) {
    var s = state.session;
    var task = currentTask();
    if (M.isChecked(s, task.id)) return;
    var selected = M.getResponse(s, task);
    var pos = selected.indexOf(number);
    if (pos === -1) {
      if (typeOf(task) === 'exclude-two' && selected.length >= scoring.EXCLUDE_COUNT) {
        run.hint.textContent = 'Можно отметить только две позиции — снимите одну отметку, чтобы выбрать другую.';
        return;
      }
      selected.push(number);
    } else {
      selected.splice(pos, 1);
    }
    selected = M.setResponse(s, task, selected);
    view.setStatementSelected(run.statements, number, pos === -1);
    run.hint.textContent = hintFor(task, selected);
    persist();
    renderActions(task, selected, false);
    renderProgress();
    if (s.mode === 'exam') { renderNav(); renderFinish(); }
  }

  function choose(row, number) {
    var s = state.session;
    var task = currentTask();
    if (M.isChecked(s, task.id)) return;
    var selected = M.getResponse(s, task);
    if (selected[row] === number) {
      selected[row] = null;
      state.matchRow = row;
    } else {
      if (task.oneToOne) {
        var other = selected.indexOf(number);
        if (other !== -1) selected[other] = null;
      }
      selected[row] = number;
      state.matchRow = nextEmptyRow(selected, row);
    }
    selected = M.setResponse(s, task, selected);
    renderMatchingBox(task, null, selected);
    persist();
    renderActions(task, selected, false);
    renderProgress();
    if (s.mode === 'exam') { renderNav(); renderFinish(); }
  }

  function nextEmptyRow(selected, row) {
    for (var k = 1; k <= selected.length; k++) {
      var i = (row + k) % selected.length;
      if (selected[i] === null) return i;
    }
    return row;
  }

  function clearResponse() {
    var task = currentTask();
    M.setResponse(state.session, task, M.emptyResponse(task));
    state.matchRow = 0;
    persist();
    renderRun();
  }

  function retryTask() {
    M.retry(state.session, currentTask().id);
    state.matchRow = 0;
    persist();
    renderRun();
    var firstChoice = run.card.querySelector('.statement__btn, .match-choice');
    if (firstChoice) firstChoice.focus({ preventScroll: true });
  }

  function cancelRetry() {
    delete state.session.reopened[currentTask().id];
    delete state.session.responses[currentTask().id];
    persist();
    renderRun();
  }

  function primaryAction() {
    var s = state.session;
    var task = currentTask();
    if (s.mode === 'learn') {
      if (!M.isChecked(s, task.id)) {
        if (!M.isComplete(task, M.getResponse(s, task))) return;
        M.check(s, task);
        persist();
        renderRun();
        run.primary.focus({ preventScroll: true });
        var fb = document.getElementById('mode-feedback');
        if (fb && fb.scrollIntoView) fb.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        return;
      }
      if (s.viewIndex < s.taskIds.length - 1) go(s.viewIndex + 1);
      else if (M.canFinish(s)) finishSession();
      return;
    }
    if (s.viewIndex < s.taskIds.length - 1) {
      go(s.viewIndex + 1);
    } else {
      state.confirmFinish = true;
      renderFinish();
      var c = run.finish.querySelector('.mode-finish__confirm');
      if (c) { c.focus({ preventScroll: true }); run.finish.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
    }
  }

  function finishSession() {
    var s = state.session;
    if (!M.canFinish(s)) return;
    M.finish(s, new Date(), EGE.getTask);
    var rows = M.results(s, EGE.getTask);
    var a = M.analytics(rows, state.practicum.criteria);
    var status = M.complete(storage(), s, M.summary(s, a));
    notify(s);
    openResult(state.practicum, s, [], status === 'failed'
      ? 'Результат не удалось сохранить в этом браузере (хранилище недоступно или переполнено): он доступен, пока открыта эта страница.'
      : null);
  }

  function notify(session) {
    var store = EGE.attemptStore;
    if (!store || typeof store.onFinish !== 'function') return;
    try { store.onFinish(JSON.parse(JSON.stringify(session))); } catch (e) {
      if (window.console) console.error('EGE.attemptStore.onFinish:', e);
    }
  }

  /* ---------- Итоги ---------- */

  function resultMessage(pct) {
    if (pct === 100) return 'Идеально! Все ответы верные.';
    if (pct >= 80) return 'Отличный результат! Осталось разобрать несколько неточностей.';
    if (pct >= 50) return 'Неплохо, но есть над чем поработать. Перечитайте объяснения к ошибкам.';
    return 'Стоит повторить сравнительную таблицу типов обществ и разобрать ошибки.';
  }

  function openResult(practicum, session, changed, note) {
    state.practicum = practicum;
    state.session = null;
    var rows = M.results(session, EGE.getTask, changed);
    state.result = {
      session: session, rows: rows, changed: changed || [], note: note,
      analytics: M.analytics(rows, practicum.criteria)
    };
    renderResult();
    env.showScreen('modeResult');
  }

  function statTile(value, label, cls) {
    var li = el('li', 'mode-stat ' + (cls || ''));
    li.appendChild(el('span', 'mode-stat__value', String(value)));
    li.appendChild(el('span', 'mode-stat__label', label));
    return li;
  }

  function renderResult() {
    var r = state.result;
    var s = r.session;
    var total = r.analytics.total;
    var root = screens.modeResult;
    root.textContent = '';

    var panel = el('div', 'panel result');
    var ring = el('div', 'result__ring ' + (total.percent >= 80 ? 'is-high' : total.percent >= 50 ? 'is-mid' : 'is-low'));
    ring.setAttribute('aria-hidden', 'true');
    ring.style.setProperty('--pct', String(total.percent));
    ring.appendChild(el('span', null, total.percent + '%'));
    panel.appendChild(ring);
    var title = el('h2', 'result__title', s.mode === 'exam' ? 'Экзамен завершён' : 'Обучение завершено');
    title.id = 'mode-result-title';
    panel.appendChild(title);
    panel.appendChild(el('p', 'result__context', practicumLabel(state.practicum, s.mode)));
    var score = el('p', 'result__score', scoring.formatPointsOutOf(total.points, total.max));
    score.id = 'mode-result-score';
    panel.appendChild(score);
    panel.appendChild(el('p', 'result__message', resultMessage(total.percent)));

    var stats = el('ul', 'mode-stats');
    stats.id = 'mode-stats';
    stats.appendChild(statTile(total.full, 'полностью верно', 'mode-stat--full'));
    stats.appendChild(statTile(total.partial, 'частично верно', 'mode-stat--partial'));
    stats.appendChild(statTile(total.zero, '0 баллов' + (total.skipped ? ', из них без ответа: ' + total.skipped : ''), 'mode-stat--none'));
    panel.appendChild(stats);

    if (s.mode === 'learn' && r.analytics.finalScore !== undefined) {
      panel.appendChild(el('p', 'result__fixed', 'Баллы — по первой проверке каждого задания. После повторов: ' +
        scoring.formatPointsOutOf(r.analytics.finalScore, total.max) +
        (r.analytics.retried ? ' (повторено заданий: ' + r.analytics.retried + ')' : '') + '.'));
    }
    panel.appendChild(el('p', 'result__fixed', 'Завершено ' + env.formatDate(s.finishedAt)));
    if (r.changed.length) {
      var ch = el('p', 'result__note', 'Некоторые задания с тех пор обновились: их баллы показаны такими, какими были при завершении, а разбор недоступен.');
      ch.setAttribute('role', 'status');
      panel.appendChild(ch);
    }
    if (r.note) {
      var note = el('p', 'result__note', r.note);
      note.setAttribute('role', 'status');
      panel.appendChild(note);
    }
    var actions = el('div', 'result__actions');
    actions.appendChild(button('btn--primary btn--lg mode-result__again', s.mode === 'exam' ? 'Пройти экзамен ещё раз' : 'Пройти обучение ещё раз', function () {
      var practicum = state.practicum;
      var saved = M.load(storage(), deps(practicum, s.mode));
      if (saved.status === 'ok') openRun(practicum, saved.session);
      else startMode(practicum, s.mode);
    }));
    actions.appendChild(button('btn--ghost btn--lg mode-result__home', 'К выбору практикума', function () { env.showStart(); }));
    panel.appendChild(actions);
    root.appendChild(panel);

    root.appendChild(analyticsPanel(r.analytics));
    root.appendChild(reviewPanel());
  }

  function meterGroup(title, groups, id) {
    var box = el('section', 'mode-analytics__group');
    box.id = id;
    var h = el('h4', 'mode-analytics__title', title);
    h.id = id + '-title';
    box.setAttribute('aria-labelledby', h.id);
    box.appendChild(h);
    var list = el('ul', 'meter-list');
    groups.forEach(function (g) {
      var li = el('li', 'meter');
      li.setAttribute('data-group', String(g.id));
      var head = el('div', 'meter__head');
      head.appendChild(el('span', 'meter__title', g.title));
      head.appendChild(el('span', 'meter__value', scoring.formatPointsOutOf(g.points, g.max) + ' · ' + g.percent + '%'));
      li.appendChild(head);
      var track = el('div', 'meter__track');
      track.setAttribute('role', 'img');
      track.setAttribute('aria-label', g.title + ': ' + g.percent + '% баллов');
      var fill = el('div', 'meter__fill');
      fill.style.width = g.percent + '%';
      track.appendChild(fill);
      li.appendChild(track);
      li.appendChild(el('p', 'meter__sub', 'Заданий: ' + g.tasks + ' · полностью верно: ' + g.full +
        ' · частично: ' + g.partial + ' · 0 баллов: ' + g.zero + (g.skipped ? ' (без ответа: ' + g.skipped + ')' : '')));
      list.appendChild(li);
    });
    box.appendChild(list);
    return box;
  }

  function analyticsPanel(a) {
    var panel = el('section', 'panel mode-analytics');
    panel.id = 'mode-analytics';
    var h = el('h3', 'section-title', 'Учебная аналитика');
    h.id = 'mode-analytics-title';
    panel.setAttribute('aria-labelledby', h.id);
    panel.appendChild(h);
    panel.appendChild(el('p', 'mode-analytics__disclaimer',
      'Это учебная аналитика по ' + a.total.tasks + ' ' + plural(a.total.tasks, 'заданию', 'заданиям', 'заданиям') +
      ' одного практикума, а не диагностика: задания не проходили статистическую апробацию. ' +
      'Задание, которое проверяет несколько критериев или действий, учитывается в каждом из них, ' +
      'поэтому суммы по группам больше общего балла; общий балл считается один раз.'));
    panel.appendChild(meterGroup('Форматы заданий', a.byFormat, 'mode-an-format'));
    panel.appendChild(meterGroup('Критерии сравнения обществ', a.byCriterion, 'mode-an-criteria'));
    panel.appendChild(meterGroup('Уровни сложности', a.byLevel, 'mode-an-level'));
    panel.appendChild(meterGroup('Познавательные действия', a.byAction, 'mode-an-action'));
    return panel;
  }

  function reviewPanel() {
    var r = state.result;
    var panel = el('section', 'panel');
    panel.id = 'mode-review';
    var head = el('div', 'review__head');
    var h = el('h3', 'section-title', 'Разбор заданий');
    h.id = 'mode-review-title';
    panel.setAttribute('aria-labelledby', h.id);
    head.appendChild(h);
    var expand = button('btn--ghost btn--sm', 'Развернуть все', function () {
      var all = Array.prototype.slice.call(list.querySelectorAll('details'));
      var open = !all.every(function (d) { return d.open; });
      all.forEach(function (d) { d.open = open; });
      updateExpand();
    });
    head.appendChild(expand);
    panel.appendChild(head);

    var mistakes = r.rows.filter(function (row) { return row.points < row.maxPoints; });
    var skipped = r.rows.filter(function (row) { return row.level === 'skipped'; });
    var filters = [['all', 'Все задания (' + r.rows.length + ')'], ['mistakes', 'С ошибками (' + mistakes.length + ')']];
    if (r.session.mode === 'exam') filters.push(['skipped', 'Без ответа (' + skipped.length + ')']);
    var seg = el('div', 'segmented review__filter');
    seg.setAttribute('role', 'radiogroup');
    seg.setAttribute('aria-label', 'Какие задания показать');
    filters.forEach(function (f) {
      var label = el('label', 'segmented__item');
      var input = el('input');
      input.type = 'radio';
      input.name = 'mode-review-filter';
      input.value = f[0];
      label.appendChild(input);
      label.appendChild(el('span', null, f[1]));
      seg.appendChild(label);
    });
    panel.appendChild(seg);
    var list = el('ul', 'review-list');
    list.id = 'mode-review-list';
    panel.appendChild(list);

    function updateExpand() {
      var all = Array.prototype.slice.call(list.querySelectorAll('details'));
      expand.hidden = all.length === 0;
      expand.textContent = all.length && all.every(function (d) { return d.open; }) ? 'Свернуть все' : 'Развернуть все';
    }

    function render(filter) {
      seg.querySelectorAll('input').forEach(function (i) { i.checked = i.value === filter; });
      list.textContent = '';
      var rows = filter === 'mistakes' ? mistakes : filter === 'skipped' ? skipped : r.rows;
      if (!rows.length) {
        list.appendChild(el('li', 'review-list__empty', filter === 'skipped'
          ? 'Пропущенных заданий нет.' : 'Ошибок нет — все задания выполнены верно. Отличная работа!'));
      }
      rows.forEach(function (row) {
        var details = reviewItem(row);
        details.addEventListener('toggle', updateExpand);
        var li = el('li', 'review-item');
        li.appendChild(details);
        list.appendChild(li);
      });
      updateExpand();
    }
    seg.addEventListener('change', function (e) { render(e.target.value); });
    render(mistakes.length ? 'mistakes' : 'all');
    return panel;
  }

  function reviewItem(row) {
    var task = row.task;
    var details = el('details', 'review-item__details');
    details.setAttribute('data-task', row.taskId);
    var summary = el('summary', 'review-item__summary');
    var head = el('div', 'mistake__head');
    head.appendChild(el('span', 'mistake__num', 'Задание ' + (row.index + 1)));
    if (task && task.bankFormat) head.appendChild(el('span', 'chip chip--sm chip--format', FORMAT_TITLES[task.bankFormat]));
    var lvl = row.level === 'skipped' ? 'none' : row.level;
    head.appendChild(el('span', 'mistake__points points--' + lvl,
      row.level === 'skipped' ? 'Без ответа · 0 из ' + row.maxPoints : scoring.formatPointsOutOf(row.points, row.maxPoints)));
    summary.appendChild(head);
    if (task) summary.appendChild(el('p', 'mistake__question', task.question));
    if (!row.changed) {
      var answers = el('p', 'mistake__answers');
      answers.appendChild(el('span', null, 'Ваш ответ: '));
      answers.appendChild(el('strong', row.points === row.maxPoints ? 'text-right' : 'text-wrong',
        row.level === 'skipped' ? 'нет ответа' : scoring.formatTaskAnswer(task, row.selected)));
      answers.appendChild(el('span', null, ' · Правильный: '));
      answers.appendChild(el('strong', 'text-right', scoring.formatTaskAnswer(task, row.correct)));
      summary.appendChild(answers);
    }
    summary.appendChild(el('span', 'review-item__toggle', 'Показать разбор'));
    details.appendChild(summary);

    var body = el('div', 'review-item__body');
    if (row.changed) {
      body.appendChild(el('p', 'result__note', 'Задание с тех пор обновлено — разбор этой попытки недоступен.'));
      details.appendChild(body);
      return details;
    }
    var g = M.grade(task, row.selected);
    if (typeOf(task) === 'matching') {
      var box = el('div', 'matching');
      view.renderMatching(box, task, { answer: g });
      body.appendChild(box);
    } else {
      var list = el('ol', 'statements');
      view.renderStatements(list, task, { answer: g });
      body.appendChild(list);
    }
    if (task.instruction) body.appendChild(el('p', 'task__instruction', task.instruction));
    var fb = view.createFeedback(g, task);
    if (g.skipped) {
      var cap = fb.querySelector('.points__caption');
      if (cap) cap.textContent = 'Ответ не дан';
    }
    body.appendChild(fb);
    if (row.tries > 1) {
      body.appendChild(el('p', 'mode-check__tries', 'Попыток: ' + row.tries + '. В итог вошла первая; последняя — ' +
        scoring.formatPointsOutOf(row.finalPoints, row.maxPoints) + '.'));
    }
    body.appendChild(mistakeBlock(task, g));
    var notes = view.createTaskNotes(task);
    if (notes) body.appendChild(notes);
    details.appendChild(body);
    return details;
  }

  /* ---------- Клавиатура ---------- */

  document.addEventListener('keydown', function (e) {
    if (!screens.mode || screens.mode.hidden || !state.session || e.ctrlKey || e.metaKey || e.altKey) return;
    var tag = e.target && e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    var s = state.session;
    var task = currentTask();
    if (e.key === 'Escape' && state.confirmFinish) {
      state.confirmFinish = false;
      renderFinish();
      return;
    }
    if (/^[1-9]$/.test(e.key)) {
      if (M.isChecked(s, task.id)) return;
      var n = parseInt(e.key, 10);
      if (typeOf(task) === 'matching') {
        if (n <= task.options.length) { e.preventDefault(); choose(state.matchRow, n); }
      } else if (n <= task.statements.length) {
        e.preventDefault();
        toggle(n);
      }
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      go(s.viewIndex + (e.key === 'ArrowLeft' ? -1 : 1));
    } else if (e.key === 'Enter') {
      if (tag === 'A') return;
      if (tag === 'BUTTON' && !e.target.classList.contains('statement__btn') && !e.target.classList.contains('match-choice')) return;
      e.preventDefault();
      if (!run.primary.disabled) primaryAction();
    }
  });

  /** Последнее состояние при закрытии вкладки. */
  window.addEventListener('pagehide', persist);

  /**
   * env: { storage, showScreen(name), showStart(), formatDate(iso), screens: { mode, modeResult } }.
   */
  function init(options) {
    env = options;
    screens = options.screens;
  }

  EGE.practicumModes = {
    init: init,
    hasModes: hasModes,
    hasProgress: hasProgress,
    isStorageKey: isStorageKey,
    fillCard: fillCard
  };
})();
