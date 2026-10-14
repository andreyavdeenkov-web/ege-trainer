/**
 * Олимпиады, интерфейс: задания по тексту нормы права.
 *   criteria       — классификация нормы по нескольким основаниям;
 *   norm-structure — гипотеза, диспозиция и санкция в тексте нормы.
 *
 * Над полем ответа — карточка нормы: текст и ссылка на акт. Если текст ещё не
 * сверен с официальной публикацией (norm.verified: false), карточка помечается.
 *
 * Разбор компактный: результат по каждому основанию (элементу) прямо в задании,
 * объяснение — только у ошибок; общий разбор показывает экран задания.
 * Поэтому answerInline: экраны не повторяют ответ отдельной строкой.
 */
(function (root) {
  'use strict';

  var OLY = root.OLY || (root.OLY = {});
  var ui = OLY.ui;

  var ROLE_SHORT = { hypothesis: 'Г', disposition: 'Д', sanction: 'С' };
  var ROLE_TITLE = { hypothesis: 'Гипотеза', disposition: 'Диспозиция', sanction: 'Санкция' };

  function structureType() {
    return OLY.types.get('norm-structure');
  }

  /** «Верно: 5 из 6 оснований». */
  function scoreLine(result, many) {
    var perItem = (result.details && result.details.perItem) || [];
    var right = perItem.filter(Boolean).length;
    return 'Верно: ' + right + ' из ' + perItem.length + ' ' + many;
  }

  /** Карточка нормы. body — содержимое цитаты (текст или размеченные фрагменты). */
  function normCard(task, body) {
    var el = ui.el;
    var card = el('figure', 'norm-card');
    var quote = el('blockquote', 'norm-card__text');
    if (typeof body === 'string') quote.textContent = body;
    else quote.appendChild(body);
    card.appendChild(quote);
    var cite = el('figcaption', 'norm-card__source', task.norm.act + ', ' + task.norm.ref);
    if (!task.norm.verified) {
      cite.appendChild(el('span', 'norm-card__draft', 'текст требует сверки с официальной публикацией'));
    }
    card.appendChild(cite);
    return card;
  }

  /** Строка «Ваш ответ: … · Правильно: …» для ошибки. */
  function mistakeLine(mine, right) {
    var el = ui.el;
    var line = el('p', 'result-row__line');
    line.appendChild(el('span', 'muted', 'Ваш ответ: '));
    line.appendChild(el('strong', 'text-wrong', mine));
    line.appendChild(el('span', 'muted', ' · правильно: '));
    line.appendChild(el('strong', 'text-right', right));
    return line;
  }

  /** Строка результата: заголовок, значение, статус; при ошибке — пояснение. */
  function resultRow(className, title, status, value, extra) {
    var el = ui.el;
    var li = el('li', 'result-row ' + className + (status ? ' status-' + status : ''));
    var head = el('p', 'result-row__head');
    head.appendChild(el('span', 'result-row__title', title));
    if (value) head.appendChild(el('span', 'result-row__value', value));
    if (status) head.appendChild(el('span', 'result-row__mark', status === 'right' ? 'верно' : 'ошибка'));
    li.appendChild(head);
    (extra || []).forEach(function (node) { li.appendChild(node); });
    return li;
  }

  /* ---------- criteria ---------- */

  function normalizedCriteria(task, response) {
    return task.criteria.map(function (c, i) {
      var n = Array.isArray(response) ? response[i] : null;
      return n === undefined ? null : n;
    });
  }

  /** Повторное нажатие на выбранный вариант снимает выбор. */
  function chooseCriterion(task, response, row, n) {
    var next = normalizedCriteria(task, response);
    next[row] = next[row] === n ? null : n;
    return next;
  }

  function renderCriteria(container, task, ctx) {
    var el = ui.el;
    var response = normalizedCriteria(task, ctx.response);
    var box = el('div', 'criteria');
    box.appendChild(normCard(task, task.norm.text));
    var rows = el('ol', 'matching__rows');
    var parts = [];

    function paint() {
      parts.forEach(function (part, row) {
        part.li.classList.toggle('is-filled', response[row] !== null);
        part.buttons.forEach(function (btn, i) {
          var on = response[row] === i + 1;
          btn.classList.toggle('is-selected', on);
          btn.setAttribute('aria-checked', String(on));
        });
      });
    }

    task.criteria.forEach(function (c, row) {
      var li = el('li', 'match-row');
      var head = el('div', 'match-row__head');
      head.appendChild(el('span', 'match-row__letter', String(row + 1)));
      head.appendChild(el('span', 'match-row__text', c.title));
      li.appendChild(head);
      var choices = el('div', 'criteria__choices');
      choices.setAttribute('role', 'radiogroup');
      choices.setAttribute('aria-label', c.title);
      var buttons = c.options.map(function (text, i) {
        var btn = el('button', 'criteria__choice', text);
        btn.type = 'button';
        btn.setAttribute('role', 'radio');
        btn.addEventListener('click', function () {
          response = chooseCriterion(task, response, row, i + 1);
          paint();
          ctx.onChange(response.slice());
        });
        choices.appendChild(btn);
        return btn;
      });
      li.appendChild(choices);
      rows.appendChild(li);
      parts.push({ li: li, buttons: buttons });
    });

    box.appendChild(rows);
    container.textContent = '';
    container.appendChild(box);
    paint();

    return {
      set: function (next) {
        response = normalizedCriteria(task, next);
        paint();
      }
    };
  }

  function renderCriteriaReview(container, task, ctx) {
    var el = ui.el;
    var solved = !!(ctx.result && ctx.result.verdict !== 'unanswered');
    var response = solved ? normalizedCriteria(task, ctx.result.response) : null;
    var box = el('div', 'criteria is-answered');
    box.appendChild(normCard(task, task.norm.text));
    var rows = el('ol', 'result-rows');

    task.criteria.forEach(function (c, row) {
      var right = c.options[c.match - 1];
      if (!solved) {
        rows.appendChild(resultRow('', c.title, null, right));
        return;
      }
      var value = response[row];
      if (value === c.match) {
        rows.appendChild(resultRow('', c.title, 'right', right));
        return;
      }
      var extra = [mistakeLine(value === null ? 'не выбран' : c.options[value - 1], right)];
      if (c.explanation) extra.push(el('p', 'result-row__why', c.explanation));
      rows.appendChild(resultRow('', c.title, 'wrong', null, extra));
    });

    box.appendChild(rows);
    container.textContent = '';
    container.appendChild(box);
  }

  /** Цифра с клавиатуры заполняет первое основание без ответа. */
  function criteriaKeyInput(task, response, digit) {
    var current = normalizedCriteria(task, response);
    var row = current.indexOf(null);
    if (row === -1 || digit < 1 || digit > task.criteria[row].options.length) return null;
    return chooseCriterion(task, current, row, digit);
  }

  ui.views.register('criteria', {
    hint: function () {
      return 'По каждому основанию выберите один вариант.';
    },
    render: renderCriteria,
    renderReview: renderCriteriaReview,
    keyInput: criteriaKeyInput,
    choose: chooseCriterion,
    answerInline: true,
    resultLine: function (task, result) { return scoreLine(result, 'оснований'); }
  });

  /* ---------- norm-structure ---------- */

  function normalizedMarks(task, response) {
    return task.segments.map(function (s, i) {
      var r = Array.isArray(response) ? response[i] : null;
      return r === undefined || s.role === 'context' ? null : r;
    });
  }

  /** Отметка фрагмента «маркером» role; тот же маркер на отмеченном фрагменте снимает отметку. */
  function mark(task, response, index, role) {
    var next = normalizedMarks(task, response);
    if (task.segments[index].role === 'context') return next;
    next[index] = role === null || next[index] === role ? null : role;
    return next;
  }

  /** Содержимое фрагмента: текст и метка Г / Д / С. */
  function fillSegment(node, segment, role) {
    var el = ui.el;
    node.textContent = '';
    node.appendChild(el('span', 'seg__text', segment.text));
    if (role) node.appendChild(el('sup', 'seg__label', ROLE_SHORT[role]));
  }

  function segmentClass(segment, role) {
    if (segment.role === 'context') return 'seg seg--context';
    return 'seg' + (role ? ' seg--' + role : '');
  }

  /** Текст нормы из фрагментов (для разбора — без интерактивности). */
  function staticText(task, marks, statusOf) {
    var el = ui.el;
    var text = el('span', 'structure__text');
    task.segments.forEach(function (segment, i) {
      var node = el('span', segmentClass(segment, marks[i]));
      if (statusOf && segment.role !== 'context') node.classList.add(statusOf(i) ? 'seg--right' : 'seg--wrong');
      fillSegment(node, segment, marks[i]);
      text.appendChild(node);
      if (i < task.segments.length - 1) text.appendChild(document.createTextNode(' '));
    });
    return text;
  }

  /** «Гипотеза — «…» / не выражена». */
  function summaryList(task, marks) {
    var el = ui.el;
    var elements = structureType().structureElements(task, marks);
    var list = el('dl', 'structure-summary');
    structureType().roles.forEach(function (role) {
      var row = el('div', 'structure-summary__row structure-summary__row--' + role);
      row.appendChild(el('dt', null, ROLE_TITLE[role]));
      row.appendChild(el('dd', elements[role] ? null : 'muted', elements[role] ? '«' + elements[role] + '»' : 'не отмечена'));
      list.appendChild(row);
    });
    return list;
  }

  function renderStructure(container, task, ctx) {
    var el = ui.el;
    var marks = normalizedMarks(task, ctx.response);
    var tool = 'hypothesis';
    var box = el('div', 'structure');

    var toolbar = el('div', 'structure__tools');
    toolbar.setAttribute('role', 'radiogroup');
    toolbar.setAttribute('aria-label', 'Маркер');
    var tools = structureType().roles.concat('erase').map(function (role) {
      var btn = el('button', 'structure__tool structure__tool--' + role);
      btn.type = 'button';
      btn.setAttribute('role', 'radio');
      if (role !== 'erase') btn.appendChild(el('span', 'structure__tool-mark', ROLE_SHORT[role]));
      btn.appendChild(el('span', null, role === 'erase' ? 'Снять отметку' : ROLE_TITLE[role]));
      btn.addEventListener('click', function () {
        tool = role;
        paint();
      });
      toolbar.appendChild(btn);
      return { role: role, btn: btn };
    });
    box.appendChild(toolbar);

    var text = el('span', 'structure__text');
    var nodes = task.segments.map(function (segment, i) {
      var node = el('span');
      if (segment.role !== 'context') {
        // Строчный элемент, а не <button>: фрагменты переносятся как обычный текст.
        node.setAttribute('role', 'button');
        node.tabIndex = 0;
        var apply = function () {
          marks = mark(task, marks, i, tool === 'erase' ? null : tool);
          paint();
          ctx.onChange(marks.slice());
        };
        node.addEventListener('click', apply);
        node.addEventListener('keydown', function (e) {
          if (e.key !== 'Enter' && e.key !== ' ') return;
          e.preventDefault();
          e.stopPropagation();
          apply();
        });
      }
      text.appendChild(node);
      if (i < task.segments.length - 1) text.appendChild(document.createTextNode(' '));
      return node;
    });
    box.appendChild(normCard(task, text));

    var summaryBox = el('div', 'structure__summary');
    box.appendChild(summaryBox);
    box.appendChild(el('p', 'structure__note muted',
      'Отмечать нужно только элементы структуры. Элемент, которого нет в тексте, оставьте неотмеченным.'));

    function paint() {
      tools.forEach(function (t) {
        t.btn.classList.toggle('is-selected', t.role === tool);
        t.btn.setAttribute('aria-checked', String(t.role === tool));
      });
      nodes.forEach(function (node, i) {
        var segment = task.segments[i];
        var role = marks[i];
        node.className = segmentClass(segment, role) + (segment.role === 'context' ? '' : ' seg--active');
        fillSegment(node, segment, role);
        if (segment.role !== 'context') {
          node.setAttribute('aria-label', segment.text + ' — ' + (role ? ROLE_TITLE[role] : 'не отмечен'));
        }
      });
      summaryBox.textContent = '';
      summaryBox.appendChild(summaryList(task, marks));
    }

    container.textContent = '';
    container.appendChild(box);
    paint();

    return {
      set: function (next) {
        marks = normalizedMarks(task, next);
        paint();
      }
    };
  }

  function elementText(text) {
    return text ? '«' + text + '»' : 'в тексте не выражена';
  }

  function renderStructureReview(container, task, ctx) {
    var el = ui.el;
    var type = structureType();
    var solved = !!(ctx.result && ctx.result.verdict !== 'unanswered');
    var key = type.getCorrect(task);
    var marks = solved ? normalizedMarks(task, ctx.result.response) : key;
    var box = el('div', 'structure is-answered');

    box.appendChild(normCard(task, staticText(task, marks, solved ? function (i) { return marks[i] === key[i]; } : null)));

    var keyElements = type.structureElements(task, key);
    var myElements = type.structureElements(task, marks);
    var perElement = solved ? type.check(task, marks).details.perElement : null;
    var rows = el('ol', 'result-rows');
    type.roles.forEach(function (role) {
      var cls = 'result-row--' + role;
      if (!solved) {
        rows.appendChild(resultRow(cls, ROLE_TITLE[role], null, elementText(keyElements[role])));
      } else if (perElement[role].ok) {
        rows.appendChild(resultRow(cls, ROLE_TITLE[role], 'right', elementText(keyElements[role])));
      } else {
        rows.appendChild(resultRow(cls, ROLE_TITLE[role], 'wrong', null, [
          mistakeLine(myElements[role] ? '«' + myElements[role] + '»' : 'не отмечена', elementText(keyElements[role])),
          el('p', 'result-row__why', task.elements[role])
        ]));
      }
    });
    box.appendChild(rows);

    container.textContent = '';
    container.appendChild(box);
  }

  ui.views.register('norm-structure', {
    hint: function () {
      return 'Выберите маркер и отметьте в тексте гипотезу, диспозицию и санкцию — те, что в нём выражены.';
    },
    render: renderStructure,
    renderReview: renderStructureReview,
    mark: mark,
    answerInline: true,
    resultLine: function (task, result) { return scoreLine(result, 'элементов'); }
  });
})(typeof window !== 'undefined' ? window : globalThis);
