/**
 * Олимпиады, интерфейс: конструктор формулировки (тип formula-builder).
 *
 * Решение: утверждение с пропусками-кнопками прямо в тексте. Нажатие на пропуск
 * раскрывает под утверждением список вариантов; после выбора автоматически
 * открывается следующий незаполненный пропуск — меньше нажатий на смартфоне.
 * Разбор: «ваше утверждение» и «верное утверждение», затем карточки слотов
 * с краткой причиной ошибки и раскрывающимся объяснением.
 */
(function (root) {
  'use strict';

  var OLY = root.OLY || (root.OLY = {});
  var ui = OLY.ui;
  var R = OLY.nrmRows;
  var F = OLY.formulaBuilder;
  var N = ui.nrm;
  var el = N.el;

  function slotIndex(task, id) {
    for (var i = 0; i < task.slots.length; i++) if (task.slots[i].id === id) return i;
    return -1;
  }

  function slotNo(task, id) {
    return '[' + (slotIndex(task, id) + 1) + ']';
  }

  function contextBlock(task) {
    if (!task.context) return null;
    var block = el('section', 'nrm-block nrm-context');
    block.appendChild(el('h3', 'nrm-block__title', task.context.title));
    task.context.paragraphs.forEach(function (p) { block.appendChild(el('p', 'nrm-context__p', p)); });
    return block;
  }

  /** Утверждение для разбора: выбранные (или эталонные) варианты вместо пропусков. */
  function sentence(task, rows, answers, details, useKey) {
    var p = el('p', 'nrm-formula');
    F.parts(task).forEach(function (part) {
      if (part.text) { p.appendChild(document.createTextNode(part.text)); return; }
      var row = rows.filter(function (r) { return r.id === part.slot; })[0];
      var a = answers && answers[row.id];
      var chosen = useKey ? row.key[0] : (a ? a.c : null);
      var span = el('span', 'nrm-slot-val', chosen === null || chosen === undefined ? slotNo(task, row.id) + ' —' : row.options[chosen]);
      if (!useKey && details && details[row.id]) span.classList.add('is-' + details[row.id].choice);
      if (useKey) span.classList.add('is-key');
      p.appendChild(span);
    });
    return p;
  }

  /* ---------- Решение ---------- */

  function render(container, task, ctx) {
    var rows = F.rowsOf(task);
    var answers = N.copyRows([{ rows: rows }], ctx.response);
    var open = null;
    var buttons = {};

    var box = el('div', 'nrm-grid nrm-formula-task');
    var notice = N.demoNotice(task);
    if (notice) box.appendChild(notice);
    if (task.legal) box.appendChild(N.renderLegal(task, { refsCollapsed: true }).node);
    var context = contextBlock(task);
    if (context) box.appendChild(context);

    var block = el('section', 'nrm-block');
    var head = el('div', 'nrm-block__head');
    head.appendChild(el('h3', 'nrm-block__title', task.formulaTitle || 'Соберите утверждение'));
    var count = el('span', 'nrm-block__count');
    head.appendChild(count);
    block.appendChild(head);
    block.appendChild(el('p', 'nrm-block__hint', 'Нажмите на пропуск и выберите вариант. Каждый пропуск оценивается отдельно.'));

    var p = el('p', 'nrm-formula');
    F.parts(task).forEach(function (part) {
      if (part.text) { p.appendChild(document.createTextNode(part.text)); return; }
      var row = rows.filter(function (r) { return r.id === part.slot; })[0];
      var wrap = el('span', 'nrm-slot-wrap');
      wrap.id = N.anchorId(task, row.id);
      var b = el('button', 'nrm-slot');
      b.type = 'button';
      b.setAttribute('aria-expanded', 'false');
      b.addEventListener('click', function () { toggle(row.id); });
      wrap.appendChild(b);
      p.appendChild(wrap);
      buttons[row.id] = b;
    });
    block.appendChild(p);

    var panel = el('div', 'nrm-slot-panel');
    panel.id = N.anchorId(task, 'panel');
    panel.hidden = true;
    var panelTitle = el('p', 'nrm-slot-panel__title');
    panel.appendChild(panelTitle);
    var panelBody = el('div', 'nrm-slot-panel__body');
    panel.appendChild(panelBody);
    block.appendChild(panel);
    box.appendChild(block);

    var fill = N.fillBar(task);
    fill.node.classList.add('nrm-fillbar--sticky');
    box.appendChild(fill.node);

    var group = null;

    function toggle(id) {
      open = open === id ? null : id;
      buildPanel();
      paint();
      if (open && group) group.buttons[0].focus({ preventScroll: true });
    }

    function buildPanel() {
      panelBody.textContent = '';
      group = null;
      if (!open) { panel.hidden = true; return; }
      var row = rows.filter(function (r) { return r.id === open; })[0];
      panel.hidden = false;
      panelTitle.textContent = slotNo(task, row.id) + ' ' + row.label.replace(/^\[\d+\]\s*/, '');
      group = N.chipGroup(row.options, 'Пропуск ' + slotNo(task, row.id), function (i) {
        var a = answers[row.id];
        a.c = a.c === i ? null : i;
        var justChose = a.c !== null;
        var next = justChose ? nextEmpty(row.id) : row.id;
        open = next;
        buildPanel();
        changed();
        if (open && group) group.buttons[0].focus({ preventScroll: true });
        else buttons[row.id].focus({ preventScroll: true });
      }, false);
      group.node.classList.add('nrm-chips--column');
      panelBody.appendChild(group.node);
      panel.setAttribute('aria-label', 'Варианты для пропуска ' + slotNo(task, row.id));
    }

    function nextEmpty(afterId) {
      var start = slotIndex(task, afterId);
      for (var k = 1; k <= rows.length; k++) {
        var row = rows[(start + k) % rows.length];
        if (answers[row.id].c === null) return row.id;
      }
      return null;
    }

    function changed() {
      paint();
      ctx.onChange(JSON.parse(JSON.stringify(answers)));
    }

    function paint() {
      var filled = 0;
      var firstEmpty = null;
      rows.forEach(function (row) {
        var a = answers[row.id];
        var b = buttons[row.id];
        var chosen = a.c !== null;
        if (chosen) filled++;
        else if (!firstEmpty) firstEmpty = row.id;
        b.textContent = chosen ? row.options[a.c] : slotNo(task, row.id) + ' выбрать';
        b.classList.toggle('is-filled', chosen);
        b.classList.toggle('is-open', open === row.id);
        b.setAttribute('aria-expanded', String(open === row.id));
        b.setAttribute('aria-label', 'Пропуск ' + slotNo(task, row.id) + (chosen ? ': ' + row.options[a.c] : ': не выбран') + '. Изменить');
      });
      if (group && open) group.paint(answers[open].c);
      count.textContent = filled + ' из ' + rows.length;
      count.classList.toggle('is-done', filled === rows.length);
      fill.update(filled, rows.length, firstEmpty);
    }

    container.textContent = '';
    container.appendChild(box);
    paint();
    return {
      set: function (next) {
        var fresh = N.copyRows([{ rows: rows }], next);
        Object.keys(fresh).forEach(function (id) { answers[id] = fresh[id]; });
        buildPanel();
        paint();
      }
    };
  }

  /* ---------- Разбор ---------- */

  function renderReview(container, task, ctx) {
    var result = ctx.result && ctx.result.verdict !== 'unanswered' ? ctx.result : null;
    var rows = F.rowsOf(task);
    var answers = result ? N.copyRows([{ rows: rows }], result.response) : null;
    var details = result && result.details ? result.details.rows : null;

    var box = el('div', 'nrm-grid nrm-formula-task is-review');
    var notice = N.demoNotice(task);
    if (notice) box.appendChild(notice);
    if (task.legal) box.appendChild(N.renderLegal(task, { refsCollapsed: true }).node);
    var context = contextBlock(task);
    if (context) box.appendChild(context);

    var block = el('section', 'nrm-block');
    var head = el('div', 'nrm-block__head');
    head.appendChild(el('h3', 'nrm-block__title', task.formulaTitle || 'Соберите утверждение'));
    if (details) {
      var earned = 0;
      rows.forEach(function (row) { earned += details[row.id].choicePoints; });
      head.appendChild(el('span', 'nrm-block__count' + (earned >= rows.length ? ' is-done' : ''), N.fmt(earned) + ' из ' + rows.length));
    }
    block.appendChild(head);
    if (answers) {
      block.appendChild(el('p', 'nrm-rv__k', 'Ваше утверждение:'));
      block.appendChild(sentence(task, rows, answers, details, false));
    }
    block.appendChild(el('p', 'nrm-rv__k', 'Верное утверждение:'));
    block.appendChild(sentence(task, rows, answers, details, true));
    var list = el('div', 'nrm-rows');
    rows.forEach(function (row) { list.appendChild(N.rowReview(task, row, answers && answers[row.id], details && details[row.id])); });
    block.appendChild(list);
    box.appendChild(block);

    container.textContent = '';
    container.appendChild(box);
  }

  function feedbackSummary(container, task, result) {
    var d = result.details;
    N.summary(container, task, result, d ? N.rowMistakes(F.rowsOf(task), d.rows) : []);
  }

  ui.views.register('formula-builder', {
    hint: function () { return 'Заполните пропуски в утверждении: нажмите на пропуск и выберите вариант.'; },
    render: render,
    renderReview: renderReview,
    feedbackSummary: feedbackSummary
  });
})(typeof window !== 'undefined' ? window : globalThis);
