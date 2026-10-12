/**
 * Олимпиады, интерфейс: задания по тексту нормы права.
 *   criteria       — классификация нормы по нескольким основаниям;
 *   norm-structure — разметка гипотезы, диспозиции и санкции в тексте нормы.
 *
 * Над полем ответа — карточка нормы: текст и ссылка на акт. Если текст ещё не
 * сверен с официальной публикацией (norm.verified: false), карточка помечается.
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

  /** Карточка нормы. body — содержимое цитаты (текст или фрагменты разметки). */
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

  function criterionHead(c, row) {
    var el = ui.el;
    var head = el('div', 'match-row__head');
    head.appendChild(el('span', 'match-row__letter', String(row + 1)));
    head.appendChild(el('span', 'match-row__text', c.title));
    return head;
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
      li.appendChild(criterionHead(c, row));
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
    var rows = el('ol', 'matching__rows');

    task.criteria.forEach(function (c, row) {
      var li = el('li', 'match-row');
      li.appendChild(criterionHead(c, row));
      var result = el('div', 'match-row__result');
      var right = c.options[c.match - 1];
      if (solved) {
        var value = response[row];
        var ok = value === c.match;
        li.classList.add(ok ? 'status-right' : 'status-wrong');
        var mine = el('p', 'match-row__line');
        mine.appendChild(el('span', 'muted', 'Ваш ответ: '));
        mine.appendChild(el('strong', ok ? 'text-right' : 'text-wrong', value === null ? 'не выбран' : c.options[value - 1]));
        result.appendChild(mine);
        if (!ok) {
          var key = el('p', 'match-row__line');
          key.appendChild(el('span', 'muted', 'Правильно: '));
          key.appendChild(el('strong', 'text-right', right));
          result.appendChild(key);
        }
        result.appendChild(el('span', 'statement__tag', ok ? 'Верно' : 'Ошибка'));
      } else {
        var line = el('p', 'match-row__line');
        line.appendChild(el('span', 'muted', 'Правильно: '));
        line.appendChild(el('strong', 'text-right', right));
        result.appendChild(line);
      }
      if (c.explanation) result.appendChild(el('p', 'statement__explanation', c.explanation));
      li.appendChild(result);
      rows.appendChild(li);
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
    choose: chooseCriterion
  });

  /* ---------- norm-structure ---------- */

  function normalizedMarks(task, response) {
    return task.segments.map(function (s, i) {
      var r = Array.isArray(response) ? response[i] : null;
      return r === undefined || r === 'none' ? null : r;
    });
  }

  /** Отметка фрагмента «маркером» role; тот же маркер на отмеченном фрагменте снимает отметку. */
  function mark(task, response, index, role) {
    var next = normalizedMarks(task, response);
    next[index] = role === null || next[index] === role ? null : role;
    return next;
  }

  function segmentNode(segment, role) {
    var el = ui.el;
    var node = el('span', 'seg' + (role ? ' seg--' + role : ''));
    node.appendChild(el('span', 'seg__text', segment.text));
    if (role) node.appendChild(el('sup', 'seg__label', ROLE_SHORT[role]));
    return node;
  }

  /** Сводка «Гипотеза: «…» / не выражена». */
  function summaryList(task, marks, className) {
    var el = ui.el;
    var elements = structureType().structureElements(task, marks);
    var list = el('dl', 'structure-summary' + (className ? ' ' + className : ''));
    structureType().roles.forEach(function (role) {
      var row = el('div', 'structure-summary__row structure-summary__row--' + role);
      row.appendChild(el('dt', null, ROLE_TITLE[role]));
      row.appendChild(el('dd', elements[role] ? null : 'muted', elements[role] ? '«' + elements[role] + '»' : 'не выражена'));
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
      var label = role === 'erase' ? 'Снять отметку' : ROLE_TITLE[role];
      var btn = el('button', 'structure__tool structure__tool--' + role);
      btn.type = 'button';
      btn.setAttribute('role', 'radio');
      if (role !== 'erase') btn.appendChild(el('span', 'structure__tool-mark', ROLE_SHORT[role]));
      btn.appendChild(el('span', null, label));
      btn.addEventListener('click', function () {
        tool = role;
        paint();
      });
      toolbar.appendChild(btn);
      return { role: role, btn: btn };
    });
    box.appendChild(toolbar);

    var text = el('span', 'structure__text');
    var buttons = task.segments.map(function (segment, i) {
      // Строчный элемент, а не <button>: фрагменты должны переноситься как обычный текст.
      var btn = el('span', 'seg');
      btn.setAttribute('role', 'button');
      btn.tabIndex = 0;
      function apply() {
        marks = mark(task, marks, i, tool === 'erase' ? null : tool);
        paint();
        ctx.onChange(marks.slice());
      }
      btn.addEventListener('click', apply);
      btn.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        e.stopPropagation();
        apply();
      });
      text.appendChild(btn);
      if (i < task.segments.length - 1) text.appendChild(document.createTextNode(' '));
      return btn;
    });
    box.appendChild(normCard(task, text));

    var summaryBox = el('div', 'structure__summary');
    box.appendChild(summaryBox);
    box.appendChild(el('p', 'structure__note muted',
      'Неотмеченный элемент считается невыраженным в этом тексте.'));

    function paint() {
      tools.forEach(function (t) {
        t.btn.classList.toggle('is-selected', t.role === tool);
        t.btn.setAttribute('aria-checked', String(t.role === tool));
      });
      buttons.forEach(function (btn, i) {
        var role = marks[i];
        var fresh = segmentNode(task.segments[i], role);
        btn.className = fresh.className + ' seg--active';
        btn.textContent = '';
        while (fresh.firstChild) btn.appendChild(fresh.firstChild);
        btn.setAttribute('aria-label', task.segments[i].text + ' — ' + (role ? ROLE_TITLE[role] : 'не отмечен'));
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

  function roleName(role) {
    return role ? ROLE_TITLE[role].toLowerCase() : 'без отметки';
  }

  function renderStructureReview(container, task, ctx) {
    var el = ui.el;
    var type = structureType();
    var solved = !!(ctx.result && ctx.result.verdict !== 'unanswered');
    var marks = solved ? normalizedMarks(task, ctx.result.response) : null;
    var key = normalizedMarks(task, type.getCorrect(task));
    var box = el('div', 'structure is-answered');

    function markup(roles, withStatus) {
      var text = el('span', 'structure__text');
      task.segments.forEach(function (segment, i) {
        var node = segmentNode(segment, roles[i]);
        if (withStatus) {
          var ok = type.acceptedRoles(segment).indexOf(roles[i] || 'none') !== -1;
          node.classList.add(ok ? 'seg--right' : 'seg--wrong');
        }
        text.appendChild(node);
        if (i < task.segments.length - 1) text.appendChild(document.createTextNode(' '));
      });
      return text;
    }

    if (solved) {
      box.appendChild(el('h4', 'structure__caption', 'Ваша разметка'));
      box.appendChild(normCard(task, markup(marks, true)));
    }
    box.appendChild(el('h4', 'structure__caption', 'Правильная разметка'));
    box.appendChild(normCard(task, markup(key, false)));

    var elements = el('ul', 'structure__elements');
    type.roles.forEach(function (role) {
      var li = el('li', 'structure__element structure__element--' + role);
      var expressed = task.segments.some(function (s) { return s.role === role; });
      var head = el('p', 'structure__element-head');
      head.appendChild(el('strong', null, ROLE_TITLE[role] + ': '));
      head.appendChild(el('span', null, expressed ? 'выражена в тексте' : 'в тексте не выражена'));
      li.appendChild(head);
      li.appendChild(el('p', 'statement__explanation', task.elements[role]));
      elements.appendChild(li);
    });
    box.appendChild(elements);

    var notes = el('ol', 'structure__fragments');
    task.segments.forEach(function (segment, i) {
      var ok = solved ? type.acceptedRoles(segment).indexOf(marks[i] || 'none') !== -1 : true;
      if (ok && !segment.explanation) return;
      var li = el('li', 'structure__fragment ' + (ok ? 'status-right' : 'status-wrong'));
      li.appendChild(el('p', 'structure__fragment-text', '«' + segment.text + '»'));
      if (!ok) {
        var line = el('p', 'match-row__line');
        line.appendChild(el('span', 'muted', 'Ваша отметка: '));
        line.appendChild(el('strong', 'text-wrong', roleName(marks[i])));
        line.appendChild(el('span', 'muted', ' · правильно: '));
        line.appendChild(el('strong', 'text-right', type.acceptedRoles(segment).map(function (r) {
          return r === 'none' ? 'без отметки' : roleName(r);
        }).join(' или ')));
        li.appendChild(line);
      }
      if (segment.explanation) li.appendChild(el('p', 'statement__explanation', segment.explanation));
      notes.appendChild(li);
    });
    if (notes.childNodes.length) box.appendChild(notes);

    container.textContent = '';
    container.appendChild(box);
  }

  ui.views.register('norm-structure', {
    hint: function () {
      return 'Выберите маркер и отметьте фрагменты текста. Элемент, которого нет в тексте, не отмечайте.';
    },
    render: renderStructure,
    renderReview: renderStructureReview,
    mark: mark
  });
})(typeof window !== 'undefined' ? window : globalThis);
