/**
 * Олимпиады, интерфейс: систематизация (тип systematize).
 *
 * Решение: легенда категорий вверху блока; у каждой позиции — кнопки категорий
 * (короткие обозначения, если они заданы, с полным названием для чтения с экрана)
 * и строка «Выбрано: …» с полным названием. Индикатор заполнения закреплён внизу.
 * Разбор — общие карточки строк: ответ, правильная категория, краткая причина,
 * раскрывающееся объяснение.
 */
(function (root) {
  'use strict';

  var OLY = root.OLY || (root.OLY = {});
  var ui = OLY.ui;
  var R = OLY.nrmRows;
  var Y = OLY.systematize;
  var N = ui.nrm;
  var el = N.el;

  function hasShort(task) {
    return task.categories.every(function (c) { return !!c.short; });
  }

  function legend(task) {
    var box = el('div', 'nrm-cats');
    box.appendChild(el('p', 'nrm-cats__title', task.categoriesTitle || 'Категории'));
    var list = el('ul', 'nrm-cats__list');
    task.categories.forEach(function (c) {
      var li = el('li', 'nrm-cats__item');
      if (c.short) li.appendChild(el('span', 'nrm-cats__code', c.short));
      li.appendChild(el('span', null, c.label));
      list.appendChild(li);
    });
    box.appendChild(list);
    return box;
  }

  function render(container, task, ctx) {
    var rows = Y.rowsOf(task);
    var answers = N.copyRows([{ rows: rows }], ctx.response);
    var compact = hasShort(task);
    var parts = {};

    var box = el('div', 'nrm-grid nrm-sort');
    var notice = N.demoNotice(task);
    if (notice) box.appendChild(notice);
    if (task.legal) box.appendChild(N.renderLegal(task, { refsCollapsed: true }).node);

    var block = el('section', 'nrm-block');
    var head = el('div', 'nrm-block__head');
    head.appendChild(el('h3', 'nrm-block__title', task.itemsTitle || 'Распределите позиции'));
    var count = el('span', 'nrm-block__count');
    head.appendChild(count);
    block.appendChild(head);
    block.appendChild(el('p', 'nrm-block__hint', 'Категории могут повторяться, не все обязательно нужны.'));
    block.appendChild(legend(task));
    var list = el('div', 'nrm-rows');
    rows.forEach(function (row, i) {
      var card = el('div', 'nrm-row');
      card.id = N.anchorId(task, row.id);
      var headRow = el('div', 'nrm-row__head');
      headRow.appendChild(el('span', 'nrm-row__label', (i + 1) + '. ' + row.label));
      card.appendChild(headRow);
      if (row.note) card.appendChild(el('p', 'nrm-row__note', row.note));
      var labels = task.categories.map(function (c) { return compact ? c.short : c.label; });
      var group = N.chipGroup(labels, 'Позиция ' + (i + 1), function (k) {
        var a = answers[row.id];
        a.c = a.c === k ? null : k;
        changed();
      }, false);
      if (compact) {
        group.node.classList.add('nrm-chips--codes');
        group.buttons.forEach(function (b, k) {
          b.setAttribute('aria-label', 'Позиция ' + (i + 1) + ': ' + task.categories[k].label);
          b.title = task.categories[k].label;
        });
      }
      card.appendChild(group.node);
      var chosen = el('p', 'nrm-row__chosen');
      card.appendChild(chosen);
      list.appendChild(card);
      parts[row.id] = { card: card, group: group, chosen: chosen };
    });
    block.appendChild(list);
    box.appendChild(block);

    var fill = N.fillBar(task);
    fill.node.classList.add('nrm-fillbar--sticky');
    box.appendChild(fill.node);

    function changed() {
      paint();
      ctx.onChange(JSON.parse(JSON.stringify(answers)));
    }

    function paint() {
      var filled = 0;
      var firstEmpty = null;
      rows.forEach(function (row) {
        var a = answers[row.id];
        var p = parts[row.id];
        var done = a.c !== null;
        if (done) filled++;
        else if (!firstEmpty) firstEmpty = row.id;
        p.group.paint(a.c);
        p.card.classList.toggle('is-filled', done);
        p.chosen.textContent = compact && done ? 'Выбрано: ' + row.options[a.c] : '';
        p.chosen.hidden = !(compact && done);
      });
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
        paint();
      }
    };
  }

  function renderReview(container, task, ctx) {
    var result = ctx.result && ctx.result.verdict !== 'unanswered' ? ctx.result : null;
    var rows = Y.rowsOf(task);
    var answers = result ? N.copyRows([{ rows: rows }], result.response) : null;
    var details = result && result.details ? result.details.rows : null;
    var box = el('div', 'nrm-grid nrm-sort is-review');
    var notice = N.demoNotice(task);
    if (notice) box.appendChild(notice);
    if (task.legal) box.appendChild(N.renderLegal(task, { refsCollapsed: true }).node);
    N.reviewSections(task, [{ id: 'items', title: task.itemsTitle || 'Распределите позиции', rows: rows }], answers, details)
      .forEach(function (n) { box.appendChild(n); });
    container.textContent = '';
    container.appendChild(box);
  }

  function feedbackSummary(container, task, result) {
    var d = result.details;
    var rows = Y.rowsOf(task);
    var mistakes = d ? N.rowMistakes(rows, d.rows).map(function (m) {
      var i = rows.map(function (r) { return r.id; }).indexOf(m.id);
      return { id: m.id, label: rows[i].short || 'Позиция ' + (i + 1) };
    }) : [];
    N.summary(container, task, result, mistakes);
  }

  ui.views.register('systematize', {
    hint: function () { return 'Отнесите каждую позицию к одной из категорий.'; },
    render: render,
    renderReview: renderReview,
    feedbackSummary: feedbackSummary
  });
})(typeof window !== 'undefined' ? window : globalThis);
