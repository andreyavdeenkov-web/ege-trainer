/**
 * Олимпиады, интерфейс: задания с выбором — single-select и multiple-select.
 * Разметка и стили — те же, что у суждений тренажёра ЕГЭ (.statements, .statement).
 * Номера вариантов — исходные, порядок вариантов не меняется.
 */
(function (root) {
  'use strict';

  var OLY = root.OLY || (root.OLY = {});
  var ui = OLY.ui;

  var LABELS = {
    'multiple-select': {
      hit: 'Верный — вы выбрали',
      missed: 'Верный — вы не выбрали',
      wrong: 'Неверный — выбран лишний',
      skip: 'Неверный вариант',
      missedUnsolved: 'Верный вариант'
    },
    'single-select': {
      hit: 'Верный ответ — вы выбрали',
      missed: 'Верный ответ',
      wrong: 'Неверно — ваш выбор',
      skip: null,
      missedUnsolved: 'Верный ответ'
    }
  };

  function isMultiple(task) {
    return task.type === 'multiple-select';
  }

  /** Выбранные номера как массив (у single-select ответ — одно число или null). */
  function chosenList(task, response) {
    if (isMultiple(task)) return Array.isArray(response) ? response : [];
    return response === null || response === undefined ? [] : [response];
  }

  /** Новый ответ после нажатия на вариант n. */
  function toggle(task, response, n) {
    if (!isMultiple(task)) return n;
    var list = chosenList(task, response);
    var next = list.indexOf(n) === -1 ? list.concat(n) : list.filter(function (x) { return x !== n; });
    return next.sort(function (a, b) { return a - b; });
  }

  function statementButton(option, number, task) {
    var el = ui.el;
    var btn = el('button', 'statement__btn');
    btn.type = 'button';
    btn.appendChild(el('span', 'statement__num', String(number)));
    btn.appendChild(el('span', 'statement__text', option.text));
    btn.appendChild(el('span', 'statement__check' + (isMultiple(task) ? '' : ' statement__check--radio')));
    return btn;
  }

  function render(container, task, ctx) {
    var el = ui.el;
    var response = ctx.response;
    var list = el('ol', 'statements');
    list.setAttribute('role', isMultiple(task) ? 'group' : 'radiogroup');
    list.setAttribute('aria-label', 'Варианты ответа');
    var items = [];

    function paint() {
      var chosen = chosenList(task, response);
      items.forEach(function (item, i) {
        var on = chosen.indexOf(i + 1) !== -1;
        item.li.classList.toggle('is-selected', on);
        item.btn.setAttribute('aria-checked', String(on));
      });
    }

    task.options.forEach(function (option, i) {
      var number = i + 1;
      var li = el('li', 'statement');
      li.dataset.number = String(number);
      var btn = statementButton(option, number, task);
      btn.setAttribute('role', isMultiple(task) ? 'checkbox' : 'radio');
      btn.addEventListener('click', function () {
        response = toggle(task, response, number);
        paint();
        ctx.onChange(response);
      });
      li.appendChild(btn);
      list.appendChild(li);
      items.push({ li: li, btn: btn });
    });

    container.textContent = '';
    container.appendChild(list);
    paint();

    return {
      set: function (next) {
        response = next;
        paint();
      }
    };
  }

  function renderReview(container, task, ctx) {
    var el = ui.el;
    var labels = LABELS[task.type];
    var solved = !!(ctx.result && ctx.result.verdict !== 'unanswered');
    var chosen = solved ? chosenList(task, ctx.result.response) : [];
    var list = el('ol', 'statements is-answered');

    task.options.forEach(function (option, i) {
      var number = i + 1;
      var isChosen = chosen.indexOf(number) !== -1;
      var status = option.correct ? (isChosen ? 'hit' : 'missed') : (isChosen ? 'wrong' : 'skip');
      var label = status === 'missed' && !solved ? labels.missedUnsolved : labels[status];

      var li = el('li', 'statement status-' + status);
      var btn = statementButton(option, number, task);
      btn.disabled = true;
      btn.setAttribute('aria-label', number + '. ' + option.text + (label ? ' — ' + label : ''));
      li.appendChild(btn);

      if (label || option.explanation) {
        var details = el('div', 'statement__details');
        if (label) details.appendChild(el('span', 'statement__tag', label));
        if (option.explanation) details.appendChild(el('p', 'statement__explanation', option.explanation));
        li.appendChild(details);
      }
      list.appendChild(li);
    });

    container.textContent = '';
    container.appendChild(list);
  }

  function keyInput(task, response, digit) {
    if (digit < 1 || digit > task.options.length) return null;
    return toggle(task, response, digit);
  }

  ui.views.register('single-select', {
    hint: function () { return 'Выберите один вариант ответа.'; },
    render: render,
    renderReview: renderReview,
    keyInput: keyInput
  });

  ui.views.register('multiple-select', {
    hint: function () { return 'Выберите все верные варианты. Их может быть несколько.'; },
    render: render,
    renderReview: renderReview,
    keyInput: keyInput
  });
})(typeof window !== 'undefined' ? window : globalThis);
