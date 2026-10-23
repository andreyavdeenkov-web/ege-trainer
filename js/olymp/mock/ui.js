/**
 * Олимпиады, интерфейс: пробный тур (вкладка «Пробный тур» олимпиады).
 *
 *   #/hp/mock                    список вариантов (экран олимпиады, режим «Пробный тур»)
 *   #/hp/mock/hp-diag-1          старт: параметры, инструкция, состояние попытки
 *   #/hp/mock/hp-diag-1/run      прохождение: задание, навигация по номерам, таймер
 *   #/hp/mock/hp-diag-1/result   результаты, разбор, рекомендации, мини-эссе
 *
 * Логика попытки — js/olymp/mock/engine.js (OLY.mock); этот модуль только рисует
 * экраны. Попытка сохраняется в браузере при каждом изменении ответа; таймер
 * считает до абсолютного дедлайна, поэтому после перезагрузки продолжается,
 * а по истечении времени попытка завершается с сохранёнными ответами.
 * Ключи и разборы загружаются только для завершённой попытки.
 *
 * При загрузке файл не обращается к DOM: экраны создаются вызовом
 * OLY.ui.mockApp.create(env) из js/olymp/app.js.
 */
(function (root) {
  'use strict';

  var OLY = root.OLY || (root.OLY = {});
  var ui = OLY.ui || (OLY.ui = {});
  var M = OLY.mock;

  var TYPE_TITLES = {
    'multiple-select': 'Множественный выбор',
    'short-text': 'Заполнение пропуска',
    numeric: 'Открытый ответ',
    'multi-field': 'Открытый ответ',
    matching: 'Соотнесение',
    essay: 'Мини-эссе'
  };
  var VERDICT = {
    correct: { text: 'Верно', cls: 'full' },
    incorrect: { text: 'Неверно', cls: 'none' },
    unanswered: { text: 'Нет ответа', cls: 'skip' },
    ungraded: { text: 'Не оценивалось', cls: 'pending' }
  };
  var WARN_AT = [10, 5, 1]; // минуты до конца, когда таймер предупреждает

  function create(env) {
    var el = env.el;
    var fmt = env.format;
    var store = M.createStore(env.storage);
    var screens = env.screens; // { start, run, result } — элементы <section>
    var state = { variant: null, attempt: null, index: 0, timer: null, warned: {}, confirm: false, filter: 'all', notice: null };

    /* ---------- Общие помощники ---------- */

    function points(n) {
      return n + ' ' + fmt.plural(n, 'балл', 'балла', 'баллов');
    }

    /** «Высшая проба — диагностический вариант № 1» → «Диагностический вариант № 1». */
    function shortTitle(title) {
      var t = title.replace(/^.*? — /, '');
      return t.charAt(0).toUpperCase() + t.slice(1);
    }

    function variantOf(route) {
      return M.getVariant(route.variant);
    }

    function routeFor(variant, name) {
      return { name: name, olympiad: variant.olympiad, variant: variant.id };
    }

    function disciplineTitle(variant, id) {
      var d = variant.disciplines.filter(function (x) { return x.id === id; })[0];
      return d ? d.title : 'Междисциплинарное';
    }

    function partOf(variant, number) {
      return variant.parts.filter(function (p) { return p.numbers.indexOf(number) !== -1; })[0];
    }

    function para(text, cls) {
      return el('p', cls || null, text);
    }

    function heading(level, text, cls) {
      return el('h' + level, cls || null, text);
    }

    /** Условие задания: абзацы, списки, таблицы, перечень терминов. */
    function renderQuestion(container, task) {
      var parts = Array.isArray(task.question) ? task.question : [task.question];
      parts.forEach(function (part) {
        if (typeof part === 'string') container.appendChild(para(part, 'mock-q__p'));
        else if (part.list) {
          var ul = el('ul', 'mock-q__list');
          part.list.forEach(function (x) { ul.appendChild(el('li', null, x)); });
          container.appendChild(ul);
        } else if (part.table) {
          container.appendChild(table(part.table, 'mock-table mock-table--compact'));
        } else if (part.terms) {
          var terms = el('ul', 'mock-terms');
          terms.setAttribute('aria-label', 'Термины для мини-эссе');
          part.terms.forEach(function (t) { terms.appendChild(el('li', 'mock-terms__item', t)); });
          container.appendChild(terms);
        }
      });
    }

    function table(rows, cls, caption) {
      var wrap = el('div', 'mock-table-wrap');
      var t = el('table', cls);
      if (caption) t.appendChild(el('caption', null, caption));
      var thead = el('thead');
      var tr = el('tr');
      rows[0].forEach(function (c) { var th = el('th', null, c); th.scope = 'col'; tr.appendChild(th); });
      thead.appendChild(tr);
      t.appendChild(thead);
      var tbody = el('tbody');
      rows.slice(1).forEach(function (r) {
        var row = el('tr');
        r.forEach(function (c, i) {
          var cell = el(i === 0 ? 'th' : 'td', null, c);
          if (i === 0) cell.scope = 'row';
          row.appendChild(cell);
        });
        tbody.appendChild(row);
      });
      t.appendChild(tbody);
      wrap.appendChild(t);
      return wrap;
    }

    function button(text, cls, onClick) {
      var b = el('button', 'btn ' + (cls || 'btn--ghost'), text);
      b.type = 'button';
      if (onClick) b.addEventListener('click', onClick);
      return b;
    }

    function stopTimer() {
      if (state.timer) clearInterval(state.timer);
      state.timer = null;
    }

    function save() {
      if (state.attempt) store.save(state.attempt);
    }

    /** Попытка варианта: из памяти или из браузера. Просроченная — завершается по таймеру. */
    function loadAttempt(variant) {
      if (!state.attempt || state.attempt.variantId !== variant.id) {
        state.attempt = store.load(variant);
        state.variant = variant;
        state.index = 0;
      }
      if (state.attempt && M.isExpired(state.attempt)) {
        M.finish(state.attempt, 'timeout');
        save();
        env.notifyFinish(state.attempt);
      }
      return state.attempt;
    }

    /* ---------- Список вариантов (экран олимпиады, режим «Пробный тур») ---------- */

    function renderList(container, olympiadId) {
      container.textContent = '';
      M.listVariants(olympiadId).forEach(function (variant) {
        var attempt = store.load(variant);
        var a = el('a', 'topic-option mock-card');
        a.href = env.formatRoute(routeFor(variant, 'mock-start'));
        a.setAttribute('data-route', '');
        var body = el('span', 'topic-option__body');
        body.appendChild(el('span', 'topic-option__dot'));
        body.appendChild(el('span', 'topic-option__title', shortTitle(variant.title)));
        body.appendChild(el('span', 'topic-option__count', variant.subtitle + ' · ' + variant.classes.join(', ') + ' класс'));
        body.appendChild(el('span', 'topic-option__meta',
          variant.tasks.length + ' заданий · ' + variant.durationMinutes + ' минут · ' + variant.maxPoints + ' баллов' +
          (attempt ? (attempt.finishedAt ? ' · пройден' : ' · начат') : '')));
        a.appendChild(body);
        container.appendChild(a);
      });
    }

    /* ---------- Старт ---------- */

    function renderStart(route) {
      stopTimer();
      var variant = variantOf(route);
      var attempt = loadAttempt(variant);
      var box = screens.start;
      box.textContent = '';
      env.setTitle([variant.title]);

      var hero = el('div', 'hero');
      hero.appendChild(el('p', 'eyebrow', 'Пробный тур · ' + env.olympiadTitle(variant.olympiad)));
      hero.appendChild(heading(1, variant.title));
      hero.appendChild(el('p', 'hero__lead', variant.subtitle + ' · ' + variant.classes.join(', ') + ' класс'));
      box.appendChild(hero);

      var facts = el('dl', 'mock-facts');
      [['Заданий', String(variant.tasks.length)], ['Время', variant.durationMinutes + ' минут'],
        ['Максимум', points(variant.maxPoints)], ['Типов заданий', String(variant.parts.length)]].forEach(function (f) {
        var d = el('div', 'mock-facts__item');
        d.appendChild(el('dt', null, f[0]));
        d.appendChild(el('dd', null, f[1]));
        facts.appendChild(d);
      });
      box.appendChild(facts);

      if (state.notice) {
        box.appendChild(el('p', 'mock-notice', state.notice));
        state.notice = null;
      }

      var status = el('div', 'panel mock-status');
      if (attempt && !attempt.finishedAt) {
        status.appendChild(el('p', 'mock-status__label', 'Попытка начата'));
        status.appendChild(para('Осталось ' + M.formatClock(M.remainingMs(attempt)) + ' · отвечено ' +
          M.answeredCount(attempt, variant) + ' из ' + variant.tasks.length + '. Таймер продолжает идти, даже когда страница закрыта.'));
        status.appendChild(button('Продолжить пробник', 'btn--primary btn--lg btn--block', function () { env.go(routeFor(variant, 'mock-run')); }));
      } else if (attempt) {
        status.appendChild(el('p', 'mock-status__label', 'Пробник завершён'));
        status.appendChild(para(finishLine(attempt)));
        var actions = el('div', 'mock-actions');
        actions.appendChild(button('Посмотреть результаты и разбор', 'btn--primary btn--lg', function () { env.go(routeFor(variant, 'mock-result')); }));
        actions.appendChild(button('Пройти заново', 'btn--ghost btn--lg', function () { confirmRestart(status, variant); }));
        status.appendChild(actions);
      } else {
        status.appendChild(button('Начать пробник', 'btn--primary btn--lg btn--block', function () { start(variant); }));
        status.appendChild(el('p', 'muted mock-status__hint', 'Таймер на ' + variant.durationMinutes +
          ' минут запустится сразу после нажатия и будет идти, даже если закрыть страницу. Ответы сохраняются в этом браузере.'));
      }
      box.appendChild(status);

      var ins = el('section', 'panel mock-instruction');
      ins.setAttribute('aria-labelledby', 'mock-ins-title');
      var h = heading(2, 'Инструкция для участника', 'section-title');
      h.id = 'mock-ins-title';
      ins.appendChild(h);
      ins.appendChild(para(variant.instruction.lead));
      ins.appendChild(table(variant.instruction.table, 'mock-table'));
      var ol = el('ol', 'mock-instruction__list');
      variant.instruction.items.forEach(function (t) { ol.appendChild(el('li', null, t)); });
      ins.appendChild(ol);
      ins.appendChild(el('p', 'muted', variant.disclaimer));
      box.appendChild(ins);
    }

    function finishLine(attempt) {
      var used = Date.parse(attempt.finishedAt) - Date.parse(attempt.startedAt);
      return (attempt.finishReason === 'timeout' ? 'Завершён автоматически: время вышло.' : 'Завершён досрочно.') +
        ' Затрачено: ' + M.formatClock(used) + '.';
    }

    function confirmRestart(container, variant) {
      if (container.querySelector('.exit-bar')) return;
      var bar = el('div', 'exit-bar');
      bar.setAttribute('role', 'alertdialog');
      bar.appendChild(el('p', 'exit-bar__text', 'Новая попытка заменит результаты и ответы прошлой. Начать пробник заново?'));
      var acts = el('div', 'exit-bar__actions');
      var cancel = button('Отмена', 'btn--ghost', function () { bar.remove(); });
      acts.appendChild(cancel);
      acts.appendChild(button('Начать заново', 'btn--primary', function () { store.remove(variant.id); state.attempt = null; start(variant); }));
      bar.appendChild(acts);
      container.appendChild(bar);
      cancel.focus();
    }

    function start(variant) {
      state.attempt = M.createAttempt(variant.id);
      state.variant = variant;
      state.index = 0;
      state.warned = {};
      state.filter = 'all';
      save();
      env.go(routeFor(variant, 'mock-run'));
    }

    /* ---------- Прохождение ---------- */

    function renderRun(route) {
      var variant = variantOf(route);
      var attempt = loadAttempt(variant);
      if (!attempt) return env.go(routeFor(variant, 'mock-start'), true);
      if (attempt.finishedAt) {
        if (attempt.finishReason === 'timeout') state.notice = 'Время вышло — пробник завершён автоматически. Все ответы, введённые до окончания времени, сохранены.';
        return env.go(routeFor(variant, 'mock-result'), true);
      }
      state.confirm = false;
      drawRun();
      startTimer();
    }

    function drawRun() {
      var variant = state.variant;
      var attempt = state.attempt;
      var task = variant.tasks[state.index];
      var box = screens.run;
      box.textContent = '';
      env.setTitle(['Задание ' + task.number, variant.title]);

      // Верхняя панель: таймер, счёт ответов, завершение.
      var bar = el('div', 'mock-bar');
      var timer = el('div', 'mock-timer');
      timer.setAttribute('role', 'timer');
      timer.setAttribute('aria-label', 'Оставшееся время');
      timer.appendChild(el('span', 'mock-timer__label', 'Осталось'));
      var clock = el('span', 'mock-timer__clock', M.formatClock(M.remainingMs(attempt)));
      clock.id = 'mock-clock';
      timer.appendChild(clock);
      bar.appendChild(timer);
      var answered = el('span', 'score-pill mock-answered');
      answered.id = 'mock-answered';
      bar.appendChild(answered);
      bar.appendChild(button('Завершить', 'btn--ghost btn--sm mock-finish', requestFinish));
      box.appendChild(bar);

      var live = el('p', 'visually-hidden');
      live.id = 'mock-live';
      live.setAttribute('aria-live', 'polite');
      box.appendChild(live);

      var confirmBox = el('div', 'mock-confirm');
      confirmBox.id = 'mock-confirm';
      box.appendChild(confirmBox);

      // Навигация по номерам.
      var nav = el('nav', 'task-nav mock-nav');
      nav.setAttribute('aria-label', 'Задания пробника');
      var list = el('ol', 'task-nav__list');
      list.id = 'mock-nav';
      nav.appendChild(list);
      box.appendChild(nav);

      // Задание.
      var part = partOf(variant, task.number);
      var card = el('article', 'panel task mock-task');
      var meta = el('div', 'task__meta mock-task__meta');
      meta.appendChild(el('span', 'mock-task__num', 'Задание ' + task.number + ' из ' + variant.tasks.length));
      meta.appendChild(el('span', 'chip chip--sm mock-task__type', TYPE_TITLES[task.type]));
      meta.appendChild(el('span', 'mock-task__points', points(task.points)));
      card.appendChild(meta);
      if (part && part.lead) card.appendChild(el('p', 'task__hint mock-task__lead', part.lead));
      var q = el('div', 'mock-q');
      q.id = 'mock-question';
      renderQuestion(q, task);
      card.appendChild(q);
      if (task.answerFormat) card.appendChild(el('p', 'task__hint', task.answerFormat));

      var answer = el('div', 'answer mock-answer');
      card.appendChild(answer);
      renderInput(answer, task);

      var saved = el('p', 'muted mock-saved');
      saved.id = 'mock-saved';
      saved.setAttribute('aria-live', 'polite');
      card.appendChild(saved);

      var actions = el('div', 'task__actions');
      var prev = button('← Назад', 'btn--ghost btn--lg', function () { goTo(state.index - 1); });
      prev.hidden = state.index === 0;
      actions.appendChild(prev);
      actions.appendChild(el('span', 'task__actions-spacer'));
      var last = state.index === variant.tasks.length - 1;
      actions.appendChild(button(last ? 'Завершить пробник' : 'Далее →', 'btn--primary btn--lg', function () {
        if (last) requestFinish(); else goTo(state.index + 1);
      }));
      card.appendChild(actions);
      box.appendChild(card);

      paintNav();
      paintAnswered();
    }

    function onChange(number, value) {
      if (!state.attempt || state.attempt.finishedAt) return;
      if (M.isExpired(state.attempt)) { tick(); return; }
      M.setResponse(state.attempt, state.variant, number, value);
      save();
      paintNav();
      paintAnswered();
      var saved = document.getElementById('mock-saved');
      if (saved) saved.textContent = 'Ответ сохранён';
    }

    function paintAnswered() {
      var n = M.answeredCount(state.attempt, state.variant);
      var pill = document.getElementById('mock-answered');
      if (pill) pill.textContent = 'Отвечено: ' + n + ' из ' + state.variant.tasks.length;
    }

    function paintNav() {
      var list = document.getElementById('mock-nav');
      if (!list) return;
      list.textContent = '';
      var active = null;
      state.variant.tasks.forEach(function (task, i) {
        var li = el('li');
        var done = M.isAnswered(state.attempt, state.variant, task.number);
        var btn = el('button', 'task-nav__item mock-nav__item' + (done ? ' is-answered' : ''), String(task.number));
        btn.type = 'button';
        var label = 'Задание ' + task.number + ': ' + (done ? 'есть ответ' : 'без ответа');
        btn.setAttribute('aria-label', label);
        btn.title = label;
        if (i === state.index) {
          btn.classList.add('is-viewed');
          btn.setAttribute('aria-current', 'step');
          active = btn;
        }
        btn.addEventListener('click', function () { goTo(i); });
        li.appendChild(btn);
        list.appendChild(li);
      });
      if (active && active.scrollIntoView && list.scrollWidth > list.clientWidth) {
        list.scrollLeft = active.offsetLeft - (list.clientWidth - active.offsetWidth) / 2;
      }
    }

    function goTo(i) {
      if (i < 0 || i >= state.variant.tasks.length) return;
      state.index = i;
      drawRun();
      var q = document.getElementById('mock-question');
      if (q && q.scrollIntoView) window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    /* ---------- Поля ответа ---------- */

    function renderInput(container, task) {
      var value = M.getResponse(state.attempt, state.variant, task.number);
      var change = function (v) { onChange(task.number, v); };
      if (task.type === 'multiple-select') {
        var box = el('div');
        ui.views.get('multiple-select').render(box, task, { response: value, onChange: change });
        container.appendChild(box);
      } else if (task.type === 'short-text' || task.type === 'numeric') {
        container.appendChild(textInput(task, value, change));
      } else if (task.type === 'multi-field') {
        container.appendChild(multiField(task, value, change));
      } else if (task.type === 'matching') {
        container.appendChild(matching(task, value, change));
      } else if (task.type === 'essay') {
        container.appendChild(essayInput(task, value, change));
      }
    }

    function textInput(task, value, change) {
      var wrap = el('div', 'mock-field');
      var id = 'mock-input-' + task.number;
      var label = el('label', 'mock-field__label', task.type === 'numeric' ? 'Ответ (число)' : 'Ответ');
      label.htmlFor = id;
      var input = el('input', 'mock-input');
      input.type = 'text';
      input.id = id;
      input.value = value || '';
      input.autocomplete = 'off';
      input.spellcheck = false;
      input.setAttribute('autocapitalize', 'off');
      input.setAttribute('autocorrect', 'off');
      if (task.type === 'numeric') input.inputMode = 'decimal';
      input.addEventListener('input', function () { change(input.value); });
      wrap.appendChild(label);
      wrap.appendChild(input);
      if (task.type === 'short-text') {
        wrap.appendChild(el('p', 'muted mock-field__hint', 'Впишите термин в отдельное поле; ответ с орфографической ошибкой или опечаткой не засчитывается.'));
      }
      return wrap;
    }

    function multiField(task, value, change) {
      var current = value || {};
      var wrap = el('div', 'mock-fields' + (task.fields[0].kind === 'integer' ? ' mock-fields--grid' : ''));
      task.fields.forEach(function (f) {
        if (f.kind === 'choice') {
          var fs = el('fieldset', 'mock-choice');
          fs.appendChild(el('legend', 'mock-choice__label', f.title || f.label));
          var seg = el('div', 'segmented mock-choice__options');
          f.options.forEach(function (opt) {
            var lab = el('label', 'segmented__item');
            var r = el('input');
            r.type = 'radio';
            r.name = 'mock-' + task.number + '-' + f.id;
            r.value = opt;
            r.checked = current[f.id] === opt;
            r.addEventListener('change', function () {
              current = Object.assign({}, current);
              current[f.id] = opt;
              change(current);
            });
            lab.appendChild(r);
            lab.appendChild(el('span', null, opt));
            seg.appendChild(lab);
          });
          fs.appendChild(seg);
          wrap.appendChild(fs);
        } else {
          var cell = el('div', 'mock-field mock-field--int');
          var id = 'mock-' + task.number + '-' + f.id;
          var lab2 = el('label', 'mock-field__label', f.title || f.label);
          lab2.htmlFor = id;
          var input = el('input', 'mock-input mock-input--int');
          input.type = 'text';
          input.id = id;
          input.inputMode = 'numeric';
          input.autocomplete = 'off';
          input.value = current[f.id] === null || current[f.id] === undefined ? '' : String(current[f.id]);
          input.addEventListener('input', function () {
            current = Object.assign({}, current);
            current[f.id] = input.value;
            change(current);
          });
          cell.appendChild(lab2);
          cell.appendChild(input);
          wrap.appendChild(cell);
        }
      });
      return wrap;
    }

    function matching(task, value, change) {
      var current = Array.isArray(value) ? value.slice() : task.items.map(function () { return null; });
      var wrap = el('div', 'mock-match');
      var legend = el('div', 'mock-match__legend');
      legend.appendChild(el('p', 'mock-match__title', 'Правый ряд'));
      var ol = el('ul', 'mock-match__options');
      task.options.forEach(function (o, i) {
        var li = el('li');
        li.appendChild(el('span', 'mock-letter', M.letter(i + 1)));
        li.appendChild(el('span', null, o));
        ol.appendChild(li);
      });
      legend.appendChild(ol);
      var rows = el('ol', 'mock-match__rows');
      var selects = [];

      function paint() {
        selects.forEach(function (sel, row) {
          Array.prototype.forEach.call(sel.options, function (opt) {
            if (!opt.value) return;
            var n = Number(opt.value);
            var usedBy = current.indexOf(n);
            var taken = usedBy !== -1 && usedBy !== row;
            opt.disabled = taken;
            opt.textContent = M.letter(n) + '. ' + task.options[n - 1] + (taken ? ' (выбрано для ' + (usedBy + 1) + ')' : '');
          });
          sel.value = current[row] ? String(current[row]) : '';
          sel.closest('.mock-match__row').classList.toggle('is-filled', !!current[row]);
        });
      }

      task.items.forEach(function (item, row) {
        var li = el('li', 'mock-match__row');
        var id = 'mock-' + task.number + '-row-' + (row + 1);
        var text = el('label', 'mock-match__text');
        text.htmlFor = id;
        text.appendChild(el('span', 'mock-match__num', String(row + 1)));
        text.appendChild(el('span', null, item.text));
        var sel = el('select', 'mock-select');
        sel.id = id;
        var empty = el('option', null, '— выберите букву —');
        empty.value = '';
        sel.appendChild(empty);
        task.options.forEach(function (o, i) {
          var opt = el('option');
          opt.value = String(i + 1);
          sel.appendChild(opt);
        });
        sel.addEventListener('change', function () {
          current = current.slice();
          current[row] = sel.value ? Number(sel.value) : null;
          paint();
          change(current);
        });
        li.appendChild(text);
        li.appendChild(sel);
        rows.appendChild(li);
        selects.push(sel);
      });
      wrap.appendChild(legend);
      wrap.appendChild(rows);
      paint();
      return wrap;
    }

    function essayInput(task, value, change) {
      var wrap = el('div', 'mock-essay');
      var limits = task.limits || {};
      wrap.appendChild(el('p', 'task__hint', 'Ограничения: не более ' + sentencesText(limits.sentences) + ' и не более ' +
        limits.words + ' слов. Мини-эссе не оценивается автоматически.'));
      var id = 'mock-essay-' + task.number;
      var label = el('label', 'mock-field__label', 'Текст мини-эссе');
      label.htmlFor = id;
      var area = el('textarea', 'mock-textarea');
      area.id = id;
      area.rows = 10;
      area.value = value || '';
      area.spellcheck = false;
      var counter = el('p', 'mock-counter');
      counter.setAttribute('aria-live', 'polite');
      function paint() {
        var words = OLY.types.countWords(area.value);
        counter.textContent = 'Слов: ' + words + ' из ' + limits.words;
        var over = words > limits.words;
        counter.classList.toggle('is-over', over);
        if (over) counter.textContent += ' — превышен лимит в ' + limits.words + ' слов. Ввод не блокируется, но по критериям такой текст оценивается не выше 5 баллов.';
      }
      area.addEventListener('input', function () { paint(); change(area.value); });
      wrap.appendChild(label);
      wrap.appendChild(area);
      wrap.appendChild(counter);
      paint();
      return wrap;
    }

    /** 4 → «четырёх предложений» (как в инструкции). */
    function sentencesText(n) {
      var words = { 3: 'трёх', 4: 'четырёх', 5: 'пяти' };
      return (words[n] || String(n)) + ' предложений';
    }

    /* ---------- Таймер и завершение ---------- */

    function startTimer() {
      stopTimer();
      state.timer = setInterval(tick, 1000);
      tick();
    }

    function tick() {
      if (!state.attempt || state.attempt.finishedAt) { stopTimer(); return; }
      var left = M.remainingMs(state.attempt);
      var clock = document.getElementById('mock-clock');
      if (clock) {
        clock.textContent = M.formatClock(left);
        clock.parentNode.classList.toggle('is-low', left <= 5 * 60000);
      }
      WARN_AT.forEach(function (min) {
        if (left <= min * 60000 && left > 0 && !state.warned[min]) {
          state.warned[min] = true;
          var live = document.getElementById('mock-live');
          if (live) live.textContent = 'Осталось ' + min + ' ' + fmt.plural(min, 'минута', 'минуты', 'минут') + '.';
        }
      });
      if (left === 0) {
        stopTimer();
        M.finish(state.attempt, 'timeout');
        save();
        env.notifyFinish(state.attempt);
        state.notice = 'Время вышло — пробник завершён автоматически. Все ответы, введённые до окончания времени, сохранены.';
        env.go(routeFor(state.variant, 'mock-result'));
      }
    }

    function requestFinish() {
      var box = document.getElementById('mock-confirm');
      if (!box || state.confirm) return;
      state.confirm = true;
      var unanswered = state.variant.tasks.length - M.answeredCount(state.attempt, state.variant);
      var bar = el('div', 'exit-bar');
      bar.setAttribute('role', 'alertdialog');
      bar.setAttribute('aria-labelledby', 'mock-confirm-text');
      var text = el('p', 'exit-bar__text',
        (unanswered ? 'Без ответа: ' + fmt.tasksCount(unanswered) + '. ' : 'Ответы даны на все задания. ') +
        'После завершения изменить ответы будет нельзя. Завершить пробник?');
      text.id = 'mock-confirm-text';
      bar.appendChild(text);
      var acts = el('div', 'exit-bar__actions');
      var cancel = button('Вернуться к заданиям', 'btn--ghost', hideConfirm);
      acts.appendChild(cancel);
      acts.appendChild(button('Завершить', 'btn--primary', function () { finishNow(); }));
      bar.appendChild(acts);
      box.appendChild(bar);
      bar.scrollIntoView && bar.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      cancel.focus({ preventScroll: true });
    }

    function hideConfirm() {
      state.confirm = false;
      var box = document.getElementById('mock-confirm');
      if (box) box.textContent = '';
    }

    function finishNow() {
      stopTimer();
      M.finish(state.attempt, M.isExpired(state.attempt) ? 'timeout' : 'manual');
      save();
      env.notifyFinish(state.attempt);
      env.go(routeFor(state.variant, 'mock-result'));
    }

    /* ---------- Результаты ---------- */

    function loadKey(variant) {
      if (M.hasKey(variant.id)) return Promise.resolve();
      return new Promise(function (resolve, reject) {
        var s = document.createElement('script');
        s.src = variant.keySrc;
        s.async = true;
        s.onload = function () { M.hasKey(variant.id) ? resolve() : reject(new Error('Ключ не зарегистрирован')); };
        s.onerror = function () { s.remove(); reject(new Error('Не удалось загрузить разбор')); };
        document.head.appendChild(s);
      });
    }

    function renderResult(route) {
      stopTimer();
      var variant = variantOf(route);
      var attempt = loadAttempt(variant);
      if (!attempt) return env.go(routeFor(variant, 'mock-start'), true);
      if (!attempt.finishedAt) return env.go(routeFor(variant, 'mock-run'), true);
      env.setTitle(['Результаты', variant.title]);
      var box = screens.result;
      box.textContent = '';
      var loading = el('div', 'panel', 'Загружаем проверку и разбор…');
      loading.setAttribute('role', 'status');
      box.appendChild(loading);
      loadKey(variant).then(function () {
        if (screens.result.hidden) return;
        drawResult(variant, attempt);
      }, function () {
        box.textContent = '';
        var err = el('div', 'panel');
        err.setAttribute('role', 'alert');
        err.appendChild(para('Не удалось загрузить проверку и разбор. Проверьте подключение к интернету.'));
        err.appendChild(button('Повторить', 'btn--primary', function () { renderResult(route); }));
        box.appendChild(err);
      });
    }

    function drawResult(variant, attempt) {
      var results = M.gradeAttempt(variant, attempt);
      var s = M.summarize(variant, attempt, results);
      var box = screens.result;
      box.textContent = '';

      var head = el('section', 'panel result mock-result');
      head.appendChild(el('p', 'eyebrow', 'Пробный тур · ' + env.olympiadTitle(variant.olympiad)));
      head.appendChild(heading(1, variant.title, 'result__title'));
      if (state.notice) { head.appendChild(el('p', 'mock-notice', state.notice)); state.notice = null; }
      head.appendChild(el('p', 'result__scope', finishLine(attempt)));

      var score = el('div', 'mock-score');
      var main = el('p', 'mock-score__main');
      main.appendChild(document.createTextNode('Результат автоматической проверки: '));
      main.appendChild(el('strong', null, s.points + ' из ' + s.maxPoints));
      main.appendChild(document.createTextNode('.'));
      score.appendChild(main);
      score.appendChild(para('Мини-эссе не оценивалось. Максимальный балл полного варианта — ' + variant.maxPoints + '.', 'mock-score__note'));
      head.appendChild(score);

      var stats = el('dl', 'stats');
      stats.appendChild(stat('stat--right', 'Полностью верно', s.correct + ' из ' + s.total));
      stats.appendChild(stat('stat--wrong', 'С ошибками', String(s.incorrect)));
      stats.appendChild(stat('stat--skip', 'Без ответа', String(s.unanswered)));
      var essay = s.essays[0];
      stats.appendChild(stat('stat--pending', 'Мини-эссе', essay && essay.status === 'written' ? 'не оценивалось' : 'не написано'));
      head.appendChild(stats);

      head.appendChild(el('p', 'muted mock-score__scheme', variant.scoring.schemes[variant.scoring.main].note));
      var alt = el('details', 'mock-alt');
      var altSum = el('summary');
      altSum.appendChild(document.createTextNode(variant.scoring.schemes[variant.scoring.alternative].title + ': '));
      altSum.appendChild(el('strong', null, s.altPoints + ' из ' + s.maxPoints));
      alt.appendChild(altSum);
      alt.appendChild(para(variant.scoring.schemes[variant.scoring.alternative].note));
      alt.appendChild(para('Большой разрыв между строгим и диагностическим результатом означает «знаю почти, но неточно»: такие ошибки исправляются тренировкой формата и внимательным чтением вариантов.'));
      head.appendChild(alt);

      var acts = el('div', 'result__actions');
      acts.appendChild(button('Пройти заново', 'btn--ghost btn--lg', function () { confirmRestart(acts, variant); }));
      acts.appendChild(button('К олимпиаде', 'btn--ghost btn--lg', function () { env.go({ name: 'mock', olympiad: variant.olympiad }); }));
      head.appendChild(acts);
      box.appendChild(head);

      box.appendChild(disciplinesPanel(variant, s));
      box.appendChild(recommendationsPanel(variant, s));
      box.appendChild(reviewPanel(variant, results));
      results.filter(function (r) { return r.task.type === 'essay'; }).forEach(function (r) {
        box.appendChild(essayPanel(variant, r));
      });
    }

    function stat(cls, label, value) {
      var d = el('div', 'stat ' + cls);
      d.appendChild(el('dt', null, label));
      d.appendChild(el('dd', null, value));
      return d;
    }

    function disciplinesPanel(variant, s) {
      var p = el('section', 'panel mock-disc');
      p.appendChild(heading(2, 'Результаты по дисциплинам', 'section-title'));
      var list = el('ul', 'mock-disc__list');
      s.disciplines.forEach(function (d) {
        var li = el('li', 'mock-disc__row');
        var color = env.disciplineColor(d.id);
        if (color) li.style.setProperty('--topic-color', color);
        li.appendChild(el('span', 'mock-disc__title', d.title));
        var bar = el('span', 'mock-disc__bar');
        bar.setAttribute('aria-hidden', 'true');
        var fill = el('span', 'mock-disc__fill');
        fill.style.width = (d.maxPoints ? d.points / d.maxPoints * 100 : 0) + '%';
        bar.appendChild(fill);
        li.appendChild(bar);
        li.appendChild(el('span', 'mock-disc__value', d.points + ' из ' + d.maxPoints));
        li.appendChild(el('span', 'mock-disc__tasks muted', 'задания ' + d.tasks.join(', ') +
          (d.altPoints !== d.points ? ' · диагностическая схема: ' + d.altPoints + ' из ' + d.maxPoints : '')));
        list.appendChild(li);
      });
      p.appendChild(list);
      p.appendChild(el('p', 'muted', 'Мини-эссе (междисциплинарное задание, 10 баллов) учитывается отдельно и в баллы дисциплин не входит.'));
      return p;
    }

    function recommendationsPanel(variant, s) {
      var p = el('section', 'panel mock-recs');
      p.appendChild(heading(2, 'Что повторить', 'section-title'));
      if (!s.recommendations.length) {
        p.appendChild(para('В заданиях 1–20 ошибок нет.'));
        return p;
      }
      p.appendChild(el('p', 'muted', 'По заданиям с ошибками и без ответа — темы для самостоятельного повторения.'));
      variant.disciplines.forEach(function (d) {
        var recs = s.recommendations.filter(function (r) { return r.discipline === d.id; });
        if (!recs.length) return;
        p.appendChild(heading(3, d.title, 'mock-recs__disc'));
        var ul = el('ul', 'mock-recs__list');
        recs.forEach(function (r) {
          var li = el('li');
          li.appendChild(document.createTextNode(r.text + ' '));
          var a = el('a', 'mock-recs__link', '(задание ' + r.number + (r.verdict === 'unanswered' ? ', без ответа' : '') + ')');
          a.href = '#mock-review-' + r.number;
          a.addEventListener('click', function (e) {
            e.preventDefault();
            var item = document.getElementById('mock-review-' + r.number);
            if (!item) { state.filter = 'all'; return; }
            var det = item.querySelector('details');
            if (det) det.open = true;
            item.scrollIntoView({ behavior: 'smooth', block: 'start' });
          });
          li.appendChild(a);
          ul.appendChild(li);
        });
        p.appendChild(ul);
      });
      return p;
    }

    /* ---------- Разбор ---------- */

    function reviewPanel(variant, results) {
      var p = el('section', 'panel mock-review');
      var head = el('div', 'review__head');
      head.appendChild(heading(2, 'Разбор заданий', 'section-title'));
      var expand = button('Развернуть все', 'btn--ghost btn--sm', null);
      head.appendChild(expand);
      p.appendChild(head);

      var auto = results.filter(function (r) { return r.scored; });
      var counts = {
        all: auto.length,
        mistakes: auto.filter(function (r) { return r.verdict === 'incorrect'; }).length,
        unanswered: auto.filter(function (r) { return r.verdict === 'unanswered'; }).length
      };
      var seg = el('div', 'segmented review__filter');
      seg.setAttribute('role', 'radiogroup');
      seg.setAttribute('aria-label', 'Какие задания показать');
      [['all', 'Все (' + counts.all + ')'], ['mistakes', 'С ошибками (' + counts.mistakes + ')'], ['unanswered', 'Без ответа (' + counts.unanswered + ')']].forEach(function (f) {
        var lab = el('label', 'segmented__item');
        var r = el('input');
        r.type = 'radio';
        r.name = 'mock-review-filter';
        r.value = f[0];
        r.checked = state.filter === f[0];
        r.addEventListener('change', function () { state.filter = f[0]; paint(); });
        lab.appendChild(r);
        lab.appendChild(el('span', null, f[1]));
        seg.appendChild(lab);
      });
      p.appendChild(seg);
      var list = el('ul', 'review-list');
      p.appendChild(list);

      function paint() {
        list.textContent = '';
        var shown = auto.filter(function (r) {
          return state.filter === 'all' || (state.filter === 'mistakes' ? r.verdict === 'incorrect' : r.verdict === 'unanswered');
        });
        if (!shown.length) list.appendChild(el('li', 'review-list__empty', state.filter === 'mistakes' ? 'Ошибок нет.' : 'Заданий без ответа нет.'));
        shown.forEach(function (r) { list.appendChild(reviewItem(variant, r)); });
        syncExpand();
      }
      function details() { return Array.prototype.slice.call(list.querySelectorAll('details.review-item__details')); }
      function syncExpand() {
        var all = details();
        expand.hidden = !all.length;
        expand.textContent = all.length && all.every(function (d) { return d.open; }) ? 'Свернуть все' : 'Развернуть все';
      }
      expand.addEventListener('click', function () {
        var all = details();
        var open = !all.every(function (d) { return d.open; });
        all.forEach(function (d) { d.open = open; });
        syncExpand();
      });
      list.addEventListener('toggle', syncExpand, true);
      paint();
      return p;
    }

    function verdictMark(r) {
      var v = VERDICT[r.verdict] || VERDICT.incorrect;
      var text = v.text + (r.scored ? ' · ' + r.points + ' из ' + r.maxPoints : '');
      return el('span', 'mistake__points mock-verdict mock-verdict--' + v.cls, text);
    }

    function reviewItem(variant, r) {
      var task = r.task;
      var li = el('li', 'review-item');
      li.id = 'mock-review-' + r.number;
      var det = el('details', 'review-item__details');
      var sum = el('summary', 'review-item__summary');
      var head = el('div', 'mistake__head');
      head.appendChild(el('span', 'mistake__num', 'Задание ' + r.number));
      var chip = el('span', 'chip chip--sm', disciplineTitle(variant, task.discipline) + ' · ' + TYPE_TITLES[task.type]);
      var color = env.disciplineColor(task.discipline);
      if (color) chip.style.setProperty('--topic-color', color);
      head.appendChild(chip);
      head.appendChild(verdictMark(r));
      sum.appendChild(head);
      var lead = Array.isArray(task.question) ? task.question.filter(function (x) { return typeof x === 'string'; })[0] : task.question;
      sum.appendChild(el('p', 'mistake__question', lead));
      sum.appendChild(el('span', 'review-item__toggle', 'Показать разбор'));
      det.appendChild(sum);

      var body = el('div', 'review-item__body mock-fb');
      // Условие из одного абзаца уже показано в заголовке разбора; полностью — только составное.
      if (Array.isArray(task.question) && task.question.length > 1) {
        var q = el('div', 'mock-q mock-q--review');
        renderQuestion(q, task);
        body.appendChild(q);
      }
      body.appendChild(answersBlock(task, r));
      if (r.scored && r.altPoints !== r.points) {
        body.appendChild(el('p', 'muted', 'По диагностической (альтернативной) схеме: ' + r.altPoints + ' из ' + r.maxPoints + '.'));
      }
      var fb = task.key.feedback;
      body.appendChild(section('Почему это правильно', fb.why));
      if (task.type === 'multiple-select') body.appendChild(optionsReview(task, r));
      if (task.type === 'matching') body.appendChild(pairsReview(task, r));
      if (task.type === 'multi-field' && task.fields[0].kind === 'choice') body.appendChild(fieldsReview(task, r));
      if (fb.table) body.appendChild(table(fb.table.rows, 'mock-table', fb.table.caption));
      if (fb.steps) {
        var steps = el('div', 'mock-fb__section');
        steps.appendChild(heading(4, 'Решение по шагам', 'mock-fb__title'));
        var ol = el('ol', 'mock-fb__steps');
        fb.steps.forEach(function (s) { ol.appendChild(el('li', null, s)); });
        steps.appendChild(ol);
        body.appendChild(steps);
      }
      var mistakes = el('div', 'mock-fb__section mock-fb__section--mistakes');
      mistakes.appendChild(heading(4, r.verdict === 'correct' ? 'Типичные ошибки в этом задании' : 'В чём могла заключаться ошибка', 'mock-fb__title'));
      var ul = el('ul');
      fb.mistakes.forEach(function (m) { ul.appendChild(el('li', null, m)); });
      mistakes.appendChild(ul);
      body.appendChild(mistakes);
      var remember = el('div', 'explanation mock-fb__remember');
      remember.appendChild(heading(4, 'Что нужно запомнить', 'explanation__title'));
      remember.appendChild(para(fb.remember));
      body.appendChild(remember);
      var review = el('p', 'mock-fb__review');
      review.appendChild(el('strong', null, 'Что повторить: '));
      review.appendChild(document.createTextNode(fb.review));
      body.appendChild(review);
      det.appendChild(body);
      li.appendChild(det);
      return li;
    }

    function section(title, paragraphs) {
      var s = el('div', 'mock-fb__section');
      s.appendChild(heading(4, title, 'mock-fb__title'));
      paragraphs.forEach(function (t) { s.appendChild(para(t)); });
      return s;
    }

    /** «Твой ответ» и «Правильный ответ» — отдельно от условия, без подстановки в пропуск. */
    function answersBlock(task, r) {
      var type = OLY.types.get(task.type);
      var box = el('div', 'mock-answers');
      var mine = el('div', 'mock-answers__row');
      mine.appendChild(el('span', 'mock-answers__label', 'Твой ответ'));
      var mineText = r.verdict === 'unanswered' ? 'нет ответа' : type.formatResponse(task, r.response);
      if (task.type === 'matching' && r.verdict !== 'unanswered') mineText = matchingLine(task, r.response);
      mine.appendChild(el('span', 'mock-answers__value ' + (r.verdict === 'correct' ? 'text-right' : 'text-wrong'), mineText));
      box.appendChild(mine);
      var right = el('div', 'mock-answers__row');
      right.appendChild(el('span', 'mock-answers__label', 'Правильный ответ'));
      var key = task.key.keyDisplay || type.formatResponse(task, r.correct);
      right.appendChild(el('span', 'mock-answers__value text-right', key));
      box.appendChild(right);
      if (task.type === 'short-text') {
        var all = el('details', 'mock-answers__forms');
        all.appendChild(el('summary', null, 'Все засчитываемые формы ответа (' + task.acceptedAnswers.length + ')'));
        all.appendChild(para(task.acceptedAnswers.join(' · ')));
        all.appendChild(el('p', 'muted', 'Регистр, буквы ё/е, лишние пробелы, кавычки и знаки препинания в начале и конце ответа не учитываются. Ответ с опечаткой не засчитывается.'));
        box.appendChild(all);
      }
      if (task.type === 'numeric') {
        box.appendChild(el('p', 'muted', 'Засчитывается число ' + task.answer + ' (в том числе «1 800», «1800 млрд»).'));
      }
      return box;
    }

    function matchingLine(task, response) {
      return response.map(function (n, i) { return (i + 1) + ' — ' + (n ? M.letter(n) : '?'); }).join(', ');
    }

    function optionsReview(task, r) {
      var chosen = r.verdict === 'unanswered' ? [] : r.response;
      var s = el('div', 'mock-fb__section');
      s.appendChild(heading(4, 'Разбор каждого варианта', 'mock-fb__title'));
      if (r.details && (r.details.missed.length || r.details.extra.length)) {
        var parts = [];
        if (r.details.missed.length) parts.push('пропущены верные варианты: ' + r.details.missed.join(', '));
        if (r.details.extra.length) parts.push('выбраны неверные варианты: ' + r.details.extra.join(', '));
        var line = parts.join('; ');
        s.appendChild(el('p', 'mock-fb__summary', line.charAt(0).toUpperCase() + line.slice(1) + '.'));
      } else if (r.verdict === 'unanswered') {
        s.appendChild(el('p', 'mock-fb__summary', 'Ответа нет. Верные варианты: ' + r.correct.join(', ') + '.'));
      }
      var list = el('ol', 'statements is-answered');
      task.options.forEach(function (o, i) {
        var n = i + 1;
        var picked = chosen.indexOf(n) !== -1;
        var status = o.correct ? (picked ? 'hit' : 'missed') : (picked ? 'wrong' : 'skip');
        var tag = { hit: 'Верный — выбран', missed: 'Верный — пропущен', wrong: 'Неверный — выбран', skip: 'Неверный — не выбран' }[status];
        var li = el('li', 'statement status-' + status);
        var b = el('div', 'statement__btn');
        b.appendChild(el('span', 'statement__num', String(n)));
        b.appendChild(el('span', 'statement__text', o.text));
        li.appendChild(b);
        var d = el('div', 'statement__details');
        d.appendChild(el('span', 'statement__tag', tag));
        d.appendChild(el('p', 'statement__explanation', o.explanation));
        li.appendChild(d);
        list.appendChild(li);
      });
      s.appendChild(list);
      return s;
    }

    function pairsReview(task, r) {
      var given = r.verdict === 'unanswered' ? task.items.map(function () { return null; }) : r.response;
      var s = el('div', 'mock-fb__section');
      s.appendChild(heading(4, 'Разбор каждой пары', 'mock-fb__title'));
      var ol = el('ol', 'mock-pairs');
      task.items.forEach(function (item, i) {
        var ok = given[i] === item.match;
        var li = el('li', 'mock-pair ' + (ok ? 'is-right' : 'is-wrong'));
        li.appendChild(el('p', 'mock-pair__text', (i + 1) + '. ' + item.text));
        var lines = el('p', 'mock-pair__answer');
        lines.appendChild(el('span', null, 'Твой выбор: '));
        lines.appendChild(el('strong', ok ? 'text-right' : 'text-wrong',
          given[i] ? M.letter(given[i]) + '. ' + task.options[given[i] - 1] : 'не выбран'));
        if (!ok) {
          lines.appendChild(el('span', null, ' · Правильно: '));
          lines.appendChild(el('strong', 'text-right', M.letter(item.match) + '. ' + task.options[item.match - 1]));
        }
        li.appendChild(lines);
        li.appendChild(para(item.explanation, 'mock-pair__expl'));
        ol.appendChild(li);
      });
      s.appendChild(ol);
      var extra = task.key.extraExplanations || {};
      var keys = Object.keys(extra);
      if (keys.length) {
        s.appendChild(heading(4, 'Лишние элементы правого ряда', 'mock-fb__title'));
        var ul = el('ul', 'mock-extras');
        keys.forEach(function (l) {
          var n = 'АБВГДЕЖЗИК'.indexOf(l) + 1;
          var li = el('li');
          li.appendChild(el('strong', null, l + '. ' + task.options[n - 1] + '. '));
          li.appendChild(document.createTextNode(extra[l]));
          ul.appendChild(li);
        });
        s.appendChild(ul);
      }
      return s;
    }

    function fieldsReview(task, r) {
      var s = el('div', 'mock-fb__section');
      s.appendChild(heading(4, 'Ответ по каждому жителю', 'mock-fb__title'));
      var ul = el('ul', 'mock-fields-review');
      task.fields.forEach(function (f) {
        var v = r.verdict === 'unanswered' ? null : r.response[f.id];
        var ok = r.details ? r.details.perField[f.id] : false;
        var li = el('li', ok ? 'text-right' : 'text-wrong', (f.title || f.label) + ': ' + (v || 'не выбрано') + (ok ? ' — верно' : ' — правильно: ' + f.answer));
        ul.appendChild(li);
      });
      s.appendChild(ul);
      return s;
    }

    /* ---------- Мини-эссе ---------- */

    function essayPanel(variant, r) {
      var task = r.task;
      var fb = task.key.feedback;
      var p = el('section', 'panel mock-essay-result');
      p.id = 'mock-review-' + r.number;
      var head = el('div', 'mistake__head');
      head.appendChild(heading(2, 'Задание ' + r.number + '. Мини-эссе', 'section-title'));
      head.appendChild(el('span', 'mock-verdict mock-verdict--pending', 'Не оценивалось'));
      p.appendChild(head);
      p.appendChild(para('Мини-эссе не оценивается автоматически, и баллы за него не выставлены. Сравните свой текст с критериями и образцами ниже. Максимум за задание — ' + points(r.maxPoints) + '.', 'muted'));
      var q = el('div', 'mock-q mock-q--review');
      renderQuestion(q, task);
      p.appendChild(q);

      p.appendChild(heading(3, 'Твой текст', 'mock-fb__title'));
      if (r.verdict === 'unanswered') p.appendChild(para('Текст не написан.', 'mock-essay-text is-empty'));
      else {
        p.appendChild(el('div', 'mock-essay-text', r.response));
        var words = OLY.types.countWords(r.response);
        var info = el('p', 'mock-counter' + (words > task.limits.words ? ' is-over' : ''),
          'Слов: ' + words + ' из ' + task.limits.words + (words > task.limits.words ? ' — превышен лимит.' : '.') +
          ' Количество предложений проверьте сами: не более ' + sentencesText(task.limits.sentences) + '.');
        p.appendChild(info);
      }

      var self = el('div', 'mock-fb__section');
      self.appendChild(heading(3, 'Вопросы для самопроверки', 'mock-fb__title'));
      var sl = el('ul');
      fb.selfCheck.forEach(function (x) { sl.appendChild(el('li', null, x)); });
      self.appendChild(sl);
      p.appendChild(self);

      p.appendChild(section('Проблема, которую отражает набор терминов', [fb.problem]));
      var crit = el('div', 'mock-fb__section');
      crit.appendChild(heading(3, 'Критерии оценивания', 'mock-fb__title'));
      crit.appendChild(para(fb.rubricNote, 'muted'));
      crit.appendChild(table([['Критерий', 'Баллы', 'Что даёт максимум']].concat(fb.rubric.map(function (c) {
        return [c.id + '. ' + c.title, '0–' + c.max, c.top];
      })), 'mock-table'));
      crit.appendChild(para(fb.formalNote, 'muted'));
      p.appendChild(crit);

      var samples = el('div', 'mock-fb__section');
      samples.appendChild(heading(3, 'Образцы ответов', 'mock-fb__title'));
      samples.appendChild(el('p', 'mock-notice', fb.samplesNote));
      fb.samples.forEach(function (sm) {
        var d = el('details', 'mock-sample');
        d.appendChild(el('summary', null, sm.title));
        d.appendChild(el('blockquote', 'mock-sample__text', sm.text));
        d.appendChild(para(sm.comment, 'muted'));
        samples.appendChild(d);
      });
      samples.appendChild(para(fb.difference));
      p.appendChild(samples);
      var review = el('p', 'mock-fb__review');
      review.appendChild(el('strong', null, 'Что повторить: '));
      review.appendChild(document.createTextNode(fb.review));
      p.appendChild(review);
      return p;
    }

    return {
      renderList: renderList,
      renderStart: renderStart,
      renderRun: renderRun,
      renderResult: renderResult,
      /** Вызывается при каждом переходе: таймер работает только на экране прохождения. */
      leave: function (route) { if (!route || route.name !== 'mock-run') { stopTimer(); hideConfirm(); } },
      hasVariants: function (olympiadId) { return M.listVariants(olympiadId).length > 0; },
      variantExists: function (id) { return !!M.getVariant(id); },
      variantTitle: function (id) { var v = M.getVariant(id); return v ? shortTitle(v.title) : id; },
      /** Есть ли у варианта завершённая попытка (для перехода к результатам). */
      store: store
    };
  }

  ui.mockApp = { create: create };
})(typeof window !== 'undefined' ? window : globalThis);
