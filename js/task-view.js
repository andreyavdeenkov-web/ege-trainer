/**
 * Отрисовка задания: суждения (для выбора или с разбором) и блок с баллами.
 * Используется и на экране задания, и на экране итогов.
 */
(function () {
  'use strict';

  var EGE = window.EGE;
  var scoring = EGE.scoring;

  var STATUS_LABELS = {
    hit: 'Верное — вы выбрали',
    missed: 'Верное — вы пропустили',
    wrong: 'Неверное — выбрано лишнее',
    skip: 'Неверное — вы не выбрали'
  };

  // exclude-two: «верная» позиция — та, что выпадает из ряда.
  var EXCLUDE_STATUS_LABELS = {
    hit: 'Выпадает — вы выбрали',
    missed: 'Выпадает — вы не выбрали',
    wrong: 'Относится к ряду — выбрано ошибочно',
    skip: 'Относится к ряду'
  };

  // multiple с choiceOf: 'items' — выбираются термины или другие элементы, а не суждения.
  var ITEM_STATUS_LABELS = {
    hit: 'Подходит — вы выбрали',
    missed: 'Подходит — вы пропустили',
    wrong: 'Не подходит — выбрано лишнее',
    skip: 'Не подходит'
  };

  function statusLabels(task) {
    if (scoring.getTaskType(task) === 'exclude-two') return EXCLUDE_STATUS_LABELS;
    return task.choiceOf === 'items' ? ITEM_STATUS_LABELS : STATUS_LABELS;
  }

  // Подписи к баллам по индексу-баллу; у заданий на 1 балл ошибка сразу даёт 0.
  var POINTS_CAPTIONS = {
    2: ['Две ошибки и больше', 'Одна ошибка', 'Ответ полностью верный'],
    1: ['Ответ неверный', 'Ответ полностью верный']
  };

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  /** Подпись темы задания: «Раздел · Тема». */
  function topicLabel(task) {
    var section = EGE.getSection(task.section);
    var topic = EGE.getTopic(task.topic);
    return section.title + ' · ' + topic.title;
  }

  /** Цветной ярлык темы задания. */
  function topicChip(task, small) {
    var chip = el('span', small ? 'chip chip--sm' : 'chip', topicLabel(task));
    chip.style.setProperty('--topic-color', EGE.getSection(task.section).color);
    return chip;
  }

  function statusOf(statement, isChosen) {
    if (statement.correct) return isChosen ? 'hit' : 'missed';
    return isChosen ? 'wrong' : 'skip';
  }

  /**
   * Заполняет список суждений.
   * options.answer — засчитанный ответ: суждения показываются с разбором, выбор недоступен.
   * Иначе суждения — кнопки-флажки: options.selected — отмеченные номера,
   * options.onToggle(number) — обработчик нажатия.
   */
  function renderStatements(list, task, options) {
    var answer = options.answer || null;
    var chosen = new Set(answer ? answer.selected : options.selected || []);
    var labels = statusLabels(task);

    list.textContent = '';
    list.classList.toggle('is-answered', !!answer);

    task.statements.forEach(function (statement, i) {
      var number = i + 1;
      var isChosen = chosen.has(number);
      var li = el('li', 'statement');
      li.dataset.number = String(number);

      var btn = el('button', 'statement__btn');
      btn.type = 'button';
      btn.appendChild(el('span', 'statement__num', String(number)));
      btn.appendChild(el('span', 'statement__text', statement.text));
      btn.appendChild(el('span', 'statement__check'));
      li.appendChild(btn);

      if (answer) {
        var status = statusOf(statement, isChosen);
        btn.disabled = true;
        btn.setAttribute('aria-label', number + '. ' + statement.text + ' — ' + labels[status]);
        li.classList.add('status-' + status);

        var details = el('div', 'statement__details');
        details.appendChild(el('span', 'statement__tag', labels[status]));
        // Объяснение необязательно: если его нет, показывается только статус суждения.
        if (statement.explanation) {
          details.appendChild(el('p', 'statement__explanation', statement.explanation));
        }
        li.appendChild(details);
      } else {
        btn.setAttribute('role', 'checkbox');
        btn.setAttribute('aria-checked', String(isChosen));
        li.classList.toggle('is-selected', isChosen);
        if (options.onToggle) {
          btn.addEventListener('click', function () { options.onToggle(number); });
        }
      }

      list.appendChild(li);
    });
  }

  /** Отмечает или снимает отметку с суждения в режиме выбора. */
  function setStatementSelected(list, number, isOn) {
    var li = list.querySelector('[data-number="' + number + '"]');
    if (!li) return;
    li.classList.toggle('is-selected', isOn);
    li.querySelector('.statement__btn').setAttribute('aria-checked', String(isOn));
  }

  /* ---------- Соответствие (matching) ---------- */

  /** Текст варианта второго столбца по номеру с 1. */
  function optionText(task, n) {
    return n == null ? '' : task.options[n - 1];
  }

  /** «3 — Игровая» */
  function optionLabel(task, n) {
    return n == null ? 'не выбран' : n + ' — ' + optionText(task, n);
  }

  /**
   * Заполняет задание на соответствие.
   * options.answer — засчитанный ответ: у каждой позиции — свой и правильный вариант
   * и объяснение. Иначе — выбор: options.selected — номера по позициям (null — не выбран),
   * options.activeRow — позиция, куда попадёт цифра с клавиатуры,
   * options.onChoose(row, number) — обработчик нажатия.
   */
  function renderMatching(box, task, options) {
    var answer = options.answer || null;
    var selected = answer ? answer.selected : options.selected || [];
    var columns = task.columns || [];
    var used = Object.create(null);
    selected.forEach(function (n, row) { if (n != null) used[n] = row; });

    var focused = document.activeElement && box.contains(document.activeElement)
      ? document.activeElement.dataset : null;

    box.textContent = '';
    box.classList.add('matching');
    box.classList.toggle('is-answered', !!answer);

    var legend = el('div', 'matching__legend');
    if (columns[1]) legend.appendChild(el('p', 'matching__col-title', columns[1]));
    var legendList = el('ol', 'matching__options');
    task.options.forEach(function (text, i) {
      var li = el('li', 'matching__option');
      li.appendChild(el('span', 'matching__option-num', String(i + 1)));
      li.appendChild(el('span', 'matching__option-text', text));
      legendList.appendChild(li);
    });
    legend.appendChild(legendList);
    box.appendChild(legend);

    if (columns[0]) box.appendChild(el('p', 'matching__col-title', columns[0]));
    var rows = el('ol', 'matching__rows');

    task.items.forEach(function (item, row) {
      var letter = scoring.letter(row + 1);
      var value = selected[row] == null ? null : selected[row];
      var li = el('li', 'match-row');
      li.dataset.row = String(row);

      var head = el('div', 'match-row__head');
      head.appendChild(el('span', 'match-row__letter', letter));
      head.appendChild(el('span', 'match-row__text', item.text));
      li.appendChild(head);

      if (answer) {
        var ok = value === item.match;
        li.classList.add(ok ? 'status-right' : 'status-wrong');
        var result = el('div', 'match-row__result');
        var mine = el('p', 'match-row__line');
        mine.appendChild(el('span', 'muted', 'Ваш ответ: '));
        mine.appendChild(el('strong', ok ? 'text-right' : 'text-wrong', optionLabel(task, value)));
        result.appendChild(mine);
        if (!ok) {
          var right = el('p', 'match-row__line');
          right.appendChild(el('span', 'muted', 'Правильно: '));
          right.appendChild(el('strong', 'text-right', optionLabel(task, item.match)));
          result.appendChild(right);
        }
        result.appendChild(el('span', 'statement__tag', ok ? 'Соответствие верное' : 'Ошибка'));
        if (item.explanation) result.appendChild(el('p', 'statement__explanation', item.explanation));
        li.appendChild(result);
      } else {
        li.classList.toggle('is-filled', value !== null);
        li.classList.toggle('is-active', row === options.activeRow);
        var choices = el('div', 'match-row__choices');
        choices.setAttribute('role', 'radiogroup');
        choices.setAttribute('aria-label', letter + ') ' + item.text + ': выберите вариант');
        task.options.forEach(function (text, i) {
          var n = i + 1;
          var btn = el('button', 'match-choice', String(n));
          btn.type = 'button';
          btn.dataset.row = String(row);
          btn.dataset.n = String(n);
          btn.setAttribute('role', 'radio');
          btn.setAttribute('aria-checked', String(value === n));
          var takenBy = used[n];
          var label = n + ' — ' + text;
          if (value === n) {
            btn.classList.add('is-selected');
          } else if (task.oneToOne && takenBy !== undefined) {
            btn.classList.add('is-taken');
            label += ' (сейчас выбран для ' + scoring.letter(takenBy + 1) + ')';
          }
          btn.setAttribute('aria-label', label);
          btn.title = label;
          if (options.onChoose) {
            btn.addEventListener('click', function () { options.onChoose(row, n); });
          }
          choices.appendChild(btn);
        });
        li.appendChild(choices);
        li.appendChild(el('p', 'match-row__picked', value === null ? 'Вариант не выбран' : '→ ' + optionText(task, value)));
      }
      rows.appendChild(li);
    });
    box.appendChild(rows);

    if (answer) {
      var key = el('p', 'matching__key');
      key.appendChild(el('span', 'muted', 'Правильное соответствие: '));
      key.appendChild(el('strong', null, scoring.formatTaskAnswer(task, answer.correct)));
      box.appendChild(key);
    }

    // Перерисовка не должна сбивать фокус клавиатуры.
    if (focused && focused.row !== undefined && focused.n !== undefined) {
      var again = box.querySelector('.match-choice[data-row="' + focused.row + '"][data-n="' + focused.n + '"]');
      if (again) again.focus({ preventScroll: true });
    }
  }

  /** Заполняет блок «баллы + правильный ответ + ответ ученика». */
  function renderFeedback(parts, answer, task) {
    parts.points.textContent = '';
    parts.points.className = 'points points--' + scoring.pointsLevel(answer.points, answer.maxPoints);
    parts.points.appendChild(el('span', 'points__value',
      answer.points + ' из ' + answer.maxPoints + ' ' + scoring.pluralPoints(answer.maxPoints)));
    var captions = POINTS_CAPTIONS[answer.maxPoints] || POINTS_CAPTIONS[2];
    parts.points.appendChild(el('span', 'points__caption', captions[answer.points]));
    parts.correct.textContent = task ? scoring.formatTaskAnswer(task, answer.correct) : scoring.formatAnswer(answer.correct);
    parts.user.textContent = task ? scoring.formatTaskAnswer(task, answer.selected) : scoring.formatAnswer(answer.selected);
  }

  /** Создаёт новый блок с баллами (для экрана итогов). */
  function createFeedback(answer, task) {
    var box = el('div', 'feedback feedback--static');
    var head = el('div', 'feedback__head');
    var points = el('div', 'points');
    var answers = el('div', 'feedback__answers');

    var rowCorrect = el('div');
    rowCorrect.appendChild(el('span', 'muted', 'Правильный ответ: '));
    var correct = el('strong');
    rowCorrect.appendChild(correct);

    var rowUser = el('div');
    rowUser.appendChild(el('span', 'muted', 'Ваш ответ: '));
    var user = el('strong');
    rowUser.appendChild(user);

    answers.appendChild(rowCorrect);
    answers.appendChild(rowUser);
    head.appendChild(points);
    head.appendChild(answers);
    box.appendChild(head);

    renderFeedback({ points: points, correct: correct, user: user }, answer, task);
    return box;
  }

  EGE.taskView = {
    el: el,
    topicLabel: topicLabel,
    topicChip: topicChip,
    renderStatements: renderStatements,
    setStatementSelected: setStatementSelected,
    renderMatching: renderMatching,
    renderFeedback: renderFeedback,
    createFeedback: createFeedback
  };
})();
