/**
 * Олимпиады, интерфейс: карта связей между положениями (тип link-map).
 *
 * Решение:
 *   • положения — пронумерованные карточки для чтения (А, Б, В…);
 *   • виды связи с определениями — в условии (раскрывающийся блок, открыт по умолчанию);
 *   • у каждой пары — обозначения положений, кнопка «Тексты пары» (раскрывает оба
 *     текста прямо в карточке, без прокрутки вверх) и выбор вида связи;
 *   • дополнительные строки (утверждения) и закреплённый индикатор заполнения.
 */
(function (root) {
  'use strict';

  var OLY = root.OLY || (root.OLY = {});
  var ui = OLY.ui;
  var R = OLY.nrmRows;
  var L = OLY.linkMap;
  var N = ui.nrm;
  var el = N.el;

  var LETTERS = 'АБВГДЕЖЗИК';

  function letter(task, id) {
    for (var i = 0; i < task.legal.length; i++) if (task.legal[i].id === id) return LETTERS[i] || String(i + 1);
    return '?';
  }

  function blockText(block) {
    return block.fragments.map(function (f) { return f.text; }).join('');
  }

  /** Положения: на широком экране список раскрыт, на смартфоне свёрнут — тексты пары есть в каждой карточке. */
  function provisions(task) {
    var block = el('section', 'nrm-block');
    var d = el('details', 'nrm-more nrm-provs-wrap');
    var wide = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(min-width: 700px)').matches : true;
    d.open = wide;
    d.appendChild(el('summary', null, 'Положения ' + letter(task, task.legal[0].id) + '–' + letter(task, task.legal[task.legal.length - 1].id) + ' (' + task.legal.length + ')'));
    if (task.legal.some(function (b) { return b.verified !== true; })) {
      d.appendChild(el('p', 'nrm-block__hint', 'Тексты не сверены с официальным источником.'));
    }
    var list = el('ol', 'nrm-provs');
    task.legal.forEach(function (b) {
      var li = el('li', 'nrm-prov');
      li.appendChild(el('span', 'nrm-prov__code', letter(task, b.id)));
      var body = el('div', 'nrm-prov__body');
      body.appendChild(el('p', 'nrm-prov__ref', L.blockName(b)));
      body.appendChild(el('p', 'nrm-prov__text', blockText(b)));
      li.appendChild(body);
      list.appendChild(li);
    });
    d.appendChild(list);
    block.appendChild(d);
    return block;
  }

  function relationsHelp(task) {
    var d = el('details', 'nrm-more nrm-rel-help');
    d.open = true;
    d.appendChild(el('summary', null, 'Виды связи (определения для этого задания)'));
    var dl = el('dl', 'nrm-rel-list');
    task.relations.forEach(function (r) {
      dl.appendChild(el('dt', null, r.label));
      dl.appendChild(el('dd', null, r.definition));
    });
    d.appendChild(dl);
    return d;
  }

  function pairTexts(task, pair) {
    var d = el('details', 'nrm-more nrm-pair-texts');
    d.appendChild(el('summary', null, 'Тексты пары'));
    [pair.a, pair.b].forEach(function (id) {
      var b = L.blockOf(task, id);
      var p = el('p', 'nrm-more__text');
      p.appendChild(el('strong', null, letter(task, id) + '. ' + L.blockName(b) + ': '));
      p.appendChild(document.createTextNode(blockText(b)));
      d.appendChild(p);
    });
    return d;
  }

  function pairLabel(task, pair) {
    return letter(task, pair.a) + ' ↔ ' + letter(task, pair.b) + ': ' + L.blockName(L.blockOf(task, pair.a)) + ' — ' + L.blockName(L.blockOf(task, pair.b));
  }

  /* ---------- Решение ---------- */

  function render(container, task, ctx) {
    var pairRows = L.pairRows(task);
    var allRows = L.rowsOf(task);
    var answers = N.copyRows([{ rows: allRows }], ctx.response);
    var parts = {};

    var box = el('div', 'nrm-grid nrm-links');
    var notice = N.demoNotice(task);
    if (notice) box.appendChild(notice);
    box.appendChild(provisions(task));

    var block = el('section', 'nrm-block');
    block.id = N.anchorId(task, 'pairs');
    var head = el('div', 'nrm-block__head');
    head.appendChild(el('h3', 'nrm-block__title', 'Виды связи между положениями'));
    var count = el('span', 'nrm-block__count');
    head.appendChild(count);
    block.appendChild(head);
    block.appendChild(relationsHelp(task));
    var list = el('div', 'nrm-rows');
    task.pairs.forEach(function (pair, i) {
      var row = pairRows[i];
      var card = el('div', 'nrm-row');
      card.id = N.anchorId(task, row.id);
      var headRow = el('div', 'nrm-row__head');
      headRow.appendChild(el('span', 'nrm-row__label', pairLabel(task, pair)));
      card.appendChild(headRow);
      card.appendChild(pairTexts(task, pair));
      var group = N.chipGroup(row.options, 'Вид связи: ' + row.label, function (k) {
        var a = answers[row.id];
        a.c = a.c === k ? null : k;
        changed();
      }, false);
      group.node.classList.add('nrm-chips--grid2');
      card.appendChild(group.node);
      list.appendChild(card);
      parts[row.id] = { card: card, group: group };
    });
    block.appendChild(list);
    box.appendChild(block);

    var sections = N.rowSections(task, task.sections || [], answers, changed);
    sections.nodes.forEach(function (n) { box.appendChild(n); });

    var fill = N.fillBar(task);
    fill.node.classList.add('nrm-fillbar--sticky');
    box.appendChild(fill.node);

    function changed() {
      paint();
      ctx.onChange(JSON.parse(JSON.stringify(answers)));
    }

    function paint() {
      var done = 0;
      pairRows.forEach(function (row) {
        var a = answers[row.id];
        parts[row.id].group.paint(a.c);
        parts[row.id].card.classList.toggle('is-filled', a.c !== null);
        if (a.c !== null) done++;
      });
      count.textContent = done + ' из ' + pairRows.length;
      count.classList.toggle('is-done', done === pairRows.length);
      sections.paint();
      var filled = 0;
      var firstEmpty = null;
      allRows.forEach(function (row) {
        if (R.rowIsComplete(row, answers[row.id])) filled++;
        else if (!firstEmpty) firstEmpty = row.id;
      });
      fill.update(filled, allRows.length, firstEmpty);
    }

    container.textContent = '';
    container.appendChild(box);
    paint();
    return {
      set: function (next) {
        var fresh = N.copyRows([{ rows: allRows }], next);
        Object.keys(fresh).forEach(function (id) { answers[id] = fresh[id]; });
        paint();
      }
    };
  }

  /* ---------- Разбор ---------- */

  function renderReview(container, task, ctx) {
    var result = ctx.result && ctx.result.verdict !== 'unanswered' ? ctx.result : null;
    var allRows = L.rowsOf(task);
    var answers = result ? N.copyRows([{ rows: allRows }], result.response) : null;
    var details = result && result.details ? result.details.rows : null;
    var box = el('div', 'nrm-grid nrm-links is-review');
    var notice = N.demoNotice(task);
    if (notice) box.appendChild(notice);
    box.appendChild(provisions(task));
    var pairRows = L.pairRows(task).map(function (row, i) {
      return Object.assign({}, row, { label: pairLabel(task, task.pairs[i]) });
    });
    var nodes = N.reviewSections(task, [{ id: 'pairs', title: 'Виды связи между положениями', rows: pairRows }], answers, details);
    var help = relationsHelp(task);
    help.open = false;
    nodes[0].insertBefore(help, nodes[0].children[1] || null);
    nodes.concat(N.reviewSections(task, task.sections || [], answers, details)).forEach(function (n) { box.appendChild(n); });
    container.textContent = '';
    container.appendChild(box);
  }

  function feedbackSummary(container, task, result) {
    var d = result.details;
    var mistakes = [];
    if (d) {
      L.pairRows(task).forEach(function (row, i) {
        if (d.rows[row.id].choice !== 'ok') mistakes.push({ id: row.id, label: letter(task, task.pairs[i].a) + '↔' + letter(task, task.pairs[i].b) });
      });
      mistakes = mistakes.concat(N.rowMistakes(R.rowsOf(task.sections || []), d.rows));
    }
    N.summary(container, task, result, mistakes);
  }

  ui.views.register('link-map', {
    hint: function () { return 'Определите вид связи для каждой пары положений, затем ответьте на вопросы ниже.'; },
    render: render,
    renderReview: renderReview,
    feedbackSummary: feedbackSummary
  });
})(typeof window !== 'undefined' ? window : globalThis);
