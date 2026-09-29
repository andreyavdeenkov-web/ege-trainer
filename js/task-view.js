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
  /** «Раздел · Тема»; если у темы есть выбор тренажёра — ещё и «· Тренажёр N». */
  function topicLabel(task) {
    var section = EGE.getSection(task.section);
    var topic = EGE.getTopic(task.topic);
    var label = section.title + ' · ' + topic.title;
    var set = task.set && EGE.getSet(task.set);
    if (set && EGE.showsSetChoice(task.topic)) label += ' · ' + set.title;
    return label;
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
   * Заполняет задание на соответствие — в формате, близком к бланку ЕГЭ:
   * сверху два столбца рядом (позиции А, Б, В… и варианты 1, 2, 3…),
   * под ними компактный блок «Ваш ответ»: у каждой буквы — ряд кнопок с номерами
   * по числу вариантов второго столбца.
   * options.answer — засчитанный ответ: кнопки показывают свой и правильный вариант,
   * ниже — краткий разбор каждой позиции с объяснением. Иначе — выбор:
   * options.selected — номера по позициям (null — не выбран),
   * options.activeRow — позиция, куда попадёт цифра с клавиатуры,
   * options.onChoose(row, number) — обработчик нажатия.
   */
  function renderMatching(box, task, options) {
    var answer = options.answer || null;
    var selected = answer ? answer.selected : options.selected || [];
    var columns = task.columns || [];
    // Номера, занятые другими позициями (только при oneToOne).
    var used = EGE.attempt.takenMatches(task, selected);

    var focused = document.activeElement && box.contains(document.activeElement)
      ? document.activeElement.dataset : null;

    box.textContent = '';
    box.classList.add('matching');
    box.classList.toggle('is-answered', !!answer);

    // Два столбца задания рядом (на узком экране — друг под другом).
    var cols = el('div', 'matching__columns');

    var left = el('div', 'matching__col');
    if (columns[0]) left.appendChild(el('p', 'matching__col-title', columns[0]));
    var itemList = el('ol', 'matching__list');
    task.items.forEach(function (item, row) {
      var li = el('li', 'matching__entry');
      li.appendChild(el('span', 'matching__mark', scoring.letter(row + 1) + ')'));
      li.appendChild(el('span', 'matching__entry-text', item.text));
      itemList.appendChild(li);
    });
    left.appendChild(itemList);

    var right = el('div', 'matching__col');
    if (columns[1]) right.appendChild(el('p', 'matching__col-title', columns[1]));
    var optionList = el('ol', 'matching__list');
    task.options.forEach(function (text, i) {
      var li = el('li', 'matching__entry');
      li.appendChild(el('span', 'matching__mark', (i + 1) + '.'));
      li.appendChild(el('span', 'matching__entry-text', text));
      optionList.appendChild(li);
    });
    right.appendChild(optionList);

    cols.appendChild(left);
    cols.appendChild(right);
    box.appendChild(cols);

    // Блок ответа: буква и кнопки с номерами вариантов.
    var sheet = el('div', 'matching__answer');
    sheet.appendChild(el('p', 'matching__answer-title', 'Ваш ответ'));
    var cells = el('ol', 'matching__cells');

    task.items.forEach(function (item, row) {
      var letter = scoring.letter(row + 1);
      var value = selected[row] == null ? null : selected[row];
      var cell = el('li', 'match-cell');
      cell.dataset.row = String(row);
      cell.appendChild(el('span', 'match-cell__letter', letter));

      var choices = el('div', 'match-cell__choices');
      choices.setAttribute('role', 'radiogroup');
      choices.setAttribute('aria-label', letter + ') ' + item.text + ': выберите вариант');

      if (answer) {
        cell.classList.add(value === item.match ? 'status-right' : 'status-wrong');
      } else {
        cell.classList.toggle('is-filled', value !== null);
        cell.classList.toggle('is-active', row === options.activeRow);
      }

      task.options.forEach(function (text, i) {
        var n = i + 1;
        var btn = el('button', 'match-choice', String(n));
        btn.type = 'button';
        btn.dataset.row = String(row);
        btn.dataset.n = String(n);
        btn.setAttribute('role', 'radio');
        btn.setAttribute('aria-checked', String(value === n));
        var label = letter + ' — ' + n + ': ' + text;

        if (answer) {
          btn.disabled = true;
          if (value === n) {
            btn.classList.add(n === item.match ? 'is-right' : 'is-wrong');
            label += n === item.match ? ' (ваш ответ, верно)' : ' (ваш ответ, ошибка)';
          } else if (n === item.match) {
            btn.classList.add('is-key');
            label += ' (правильный ответ)';
          }
        } else if (value === n) {
          btn.classList.add('is-selected');
        } else if (used[n] !== undefined) {
          btn.classList.add('is-taken');
          label += ' (сейчас выбран для ' + scoring.letter(used[n] + 1) + ')';
        }
        btn.setAttribute('aria-label', label);
        btn.title = label;
        if (!answer && options.onChoose) {
          btn.addEventListener('click', function () { options.onChoose(row, n); });
        }
        choices.appendChild(btn);
      });
      cell.appendChild(choices);
      cells.appendChild(cell);
    });
    sheet.appendChild(cells);
    box.appendChild(sheet);

    if (answer) {
      // Краткий разбор: по строке на позицию, при ошибке — и правильный вариант.
      var review = el('ol', 'matching__review');
      task.items.forEach(function (item, row) {
        var value = selected[row] == null ? null : selected[row];
        var ok = value === item.match;
        var li = el('li', 'match-review ' + (ok ? 'status-right' : 'status-wrong'));
        li.appendChild(el('span', 'match-review__letter', scoring.letter(row + 1)));
        var body = el('div', 'match-review__body');
        var head = el('p', 'match-review__head');
        head.appendChild(el('strong', null, item.text));
        head.appendChild(document.createTextNode(' → '));
        if (ok) {
          head.appendChild(el('strong', 'text-right', optionLabel(task, item.match)));
        } else {
          head.appendChild(el('span', 'muted', 'ваш ответ: '));
          head.appendChild(el('strong', 'text-wrong', optionLabel(task, value)));
          head.appendChild(el('span', 'muted', '; правильно: '));
          head.appendChild(el('strong', 'text-right', optionLabel(task, item.match)));
        }
        head.appendChild(el('span', 'statement__tag', ok ? 'Верно' : 'Ошибка'));
        body.appendChild(head);
        if (item.explanation) body.appendChild(el('p', 'statement__explanation', item.explanation));
        li.appendChild(body);
        review.appendChild(li);
      });
      box.appendChild(review);
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
      scoring.formatPointsOutOf(answer.points, answer.maxPoints)));
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
