/**
 * Олимпиады, интерфейс: задания на соответствие и классификацию (тип matching).
 * Разметка и стили — те же, что у заданий на соответствие тренажёра ЕГЭ
 * (.matching, .match-row, .match-choice из css/styles.css).
 *
 * Классификация — то же соответствие: позиции распределяются по нескольким
 * категориям (options), варианты повторяются (oneToOne не задан).
 */
(function (root) {
  'use strict';

  var OLY = root.OLY || (root.OLY = {});
  var ui = OLY.ui;
  var letter = function (n) { return OLY.types.letter(n); };

  function optionText(task, n) {
    return n === null || n === undefined ? '' : task.options[n - 1];
  }

  /** «3 — Публичное право» или «не выбран». */
  function optionLabel(task, n) {
    return n === null || n === undefined ? 'не выбран' : n + ' — ' + optionText(task, n);
  }

  /** Ответ как массив по позициям (null — не выбран). */
  function normalized(task, response) {
    return task.items.map(function (item, i) {
      var n = Array.isArray(response) ? response[i] : null;
      return n === undefined ? null : n;
    });
  }

  /** Новый ответ после выбора варианта n для позиции row. Повторное нажатие снимает выбор. */
  function choose(task, response, row, n) {
    var next = normalized(task, response);
    if (next[row] === n) {
      next[row] = null;
      return next;
    }
    if (task.oneToOne) {
      // Вариант используется один раз: снимаем его с другой позиции.
      next = next.map(function (value) { return value === n ? null : value; });
    }
    next[row] = n;
    return next;
  }

  function legend(task) {
    var el = ui.el;
    var columns = task.columns || [];
    var box = el('div', 'matching__legend');
    if (columns[1]) box.appendChild(el('p', 'matching__col-title', columns[1]));
    var list = el('ol', 'matching__options');
    task.options.forEach(function (text, i) {
      var li = el('li', 'matching__option');
      li.appendChild(el('span', 'matching__option-num', String(i + 1)));
      li.appendChild(el('span', 'matching__option-text', text));
      list.appendChild(li);
    });
    box.appendChild(list);
    return box;
  }

  function rowHead(item, row) {
    var el = ui.el;
    var head = el('div', 'match-row__head');
    head.appendChild(el('span', 'match-row__letter', letter(row + 1)));
    head.appendChild(el('span', 'match-row__text', item.text));
    return head;
  }

  function render(container, task, ctx) {
    var el = ui.el;
    var response = normalized(task, ctx.response);
    var box = el('div', 'matching');
    var columns = task.columns || [];
    box.appendChild(legend(task));
    if (columns[0]) box.appendChild(el('p', 'matching__col-title', columns[0]));
    var rows = el('ol', 'matching__rows');
    var parts = [];

    function paint() {
      var used = Object.create(null);
      response.forEach(function (n, row) { if (n !== null) used[n] = row; });
      parts.forEach(function (part, row) {
        var value = response[row];
        part.li.classList.toggle('is-filled', value !== null);
        part.picked.textContent = value === null ? 'Вариант не выбран' : '→ ' + optionText(task, value);
        part.buttons.forEach(function (btn, i) {
          var n = i + 1;
          var takenBy = used[n];
          var taken = task.oneToOne && value !== n && takenBy !== undefined;
          btn.classList.toggle('is-selected', value === n);
          btn.classList.toggle('is-taken', taken);
          btn.setAttribute('aria-checked', String(value === n));
          var label = n + ' — ' + task.options[i] + (taken ? ' (сейчас выбран для ' + letter(takenBy + 1) + ')' : '');
          btn.setAttribute('aria-label', label);
          btn.title = label;
        });
      });
    }

    task.items.forEach(function (item, row) {
      var li = el('li', 'match-row');
      li.appendChild(rowHead(item, row));
      var choices = el('div', 'match-row__choices');
      choices.setAttribute('role', 'radiogroup');
      choices.setAttribute('aria-label', letter(row + 1) + ') ' + item.text + ': выберите вариант');
      var buttons = task.options.map(function (text, i) {
        var n = i + 1;
        var btn = el('button', 'match-choice', String(n));
        btn.type = 'button';
        btn.setAttribute('role', 'radio');
        btn.addEventListener('click', function () {
          response = choose(task, response, row, n);
          paint();
          ctx.onChange(response.slice());
        });
        choices.appendChild(btn);
        return btn;
      });
      li.appendChild(choices);
      var picked = el('p', 'match-row__picked');
      li.appendChild(picked);
      rows.appendChild(li);
      parts.push({ li: li, buttons: buttons, picked: picked });
    });

    box.appendChild(rows);
    container.textContent = '';
    container.appendChild(box);
    paint();

    return {
      set: function (next) {
        response = normalized(task, next);
        paint();
      }
    };
  }

  function renderReview(container, task, ctx) {
    var el = ui.el;
    var solved = !!(ctx.result && ctx.result.verdict !== 'unanswered');
    var response = solved ? normalized(task, ctx.result.response) : null;
    var box = el('div', 'matching is-answered');
    var columns = task.columns || [];
    box.appendChild(legend(task));
    if (columns[0]) box.appendChild(el('p', 'matching__col-title', columns[0]));
    var rows = el('ol', 'matching__rows');

    task.items.forEach(function (item, row) {
      var li = el('li', 'match-row');
      li.appendChild(rowHead(item, row));
      var result = el('div', 'match-row__result');
      if (solved) {
        var value = response[row];
        var ok = value === item.match;
        li.classList.add(ok ? 'status-right' : 'status-wrong');
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
      } else {
        var key = el('p', 'match-row__line');
        key.appendChild(el('span', 'muted', 'Правильно: '));
        key.appendChild(el('strong', 'text-right', optionLabel(task, item.match)));
        result.appendChild(key);
      }
      if (item.explanation) result.appendChild(el('p', 'statement__explanation', item.explanation));
      li.appendChild(result);
      rows.appendChild(li);
    });

    box.appendChild(rows);
    container.textContent = '';
    container.appendChild(box);
  }

  /** Цифра с клавиатуры заполняет первую позицию без ответа. */
  function keyInput(task, response, digit) {
    if (digit < 1 || digit > task.options.length) return null;
    var current = normalized(task, response);
    var row = current.indexOf(null);
    if (row === -1) return null;
    return choose(task, current, row, digit);
  }

  ui.views.register('matching', {
    hint: function (task) {
      return task.oneToOne
        ? 'Каждой позиции подберите вариант из списка. Каждый вариант используется один раз.'
        : 'Для каждой позиции выберите вариант из списка. Варианты могут повторяться.';
    },
    render: render,
    renderReview: renderReview,
    keyInput: keyInput,
    choose: choose
  });
})(typeof window !== 'undefined' ? window : globalThis);
