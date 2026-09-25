/**
 * Учебник, блоки для чтения: heading, lead, text, callout, definition,
 * reveal, think, compare.
 */
(function (root) {
  'use strict';

  var TXT = root.TXT;
  var d = TXT.ui.dom;
  var el = d.el;
  var register = TXT.ui.blocks.register;

  var CALLOUT_TITLES = {
    example: 'Пример',
    trap: 'Ловушка',
    note: 'Обратите внимание',
    key: 'Главное',
    quote: 'Цитата'
  };

  register('heading', function (b) {
    return el('h2', 'tb-h2', b.text);
  });

  register('lead', function (b) {
    var node = el('div', 'tb-lead');
    if (b.kicker) node.appendChild(el('p', 'tb-lead__kicker', b.kicker));
    node.appendChild(d.rich('p', 'tb-lead__text', b.text));
    return node;
  });

  register('text', function (b) {
    return d.paras(el('div', 'tb-text'), b.text);
  });

  register('callout', function (b) {
    var node = el('aside', 'tb-callout tb-callout--' + b.variant);
    node.appendChild(el('p', 'tb-callout__title', b.title || CALLOUT_TITLES[b.variant]));
    if (b.text !== undefined) {
      var body = b.variant === 'quote' ? el('blockquote', 'tb-callout__quote') : el('div', 'tb-callout__body');
      d.paras(body, b.text);
      node.appendChild(body);
    }
    if (b.items) {
      var list = el('ul', 'tb-callout__list');
      b.items.forEach(function (item) { list.appendChild(d.rich('li', null, item)); });
      node.appendChild(list);
    }
    if (b.source) node.appendChild(el('p', 'tb-callout__source', b.source));
    return node;
  });

  register('definition', function (b) {
    var node = el('div', 'tb-definition');
    node.appendChild(el('p', 'tb-definition__label', 'Определение'));
    var p = el('p', 'tb-definition__text');
    p.appendChild(el('dfn', 'tb-definition__term', b.term));
    p.appendChild(document.createTextNode(' — '));
    d.appendRich(p, b.text);
    node.appendChild(p);
    if (b.source) node.appendChild(el('p', 'tb-definition__source', b.source));
    return node;
  });

  register('reveal', function (b) {
    var node = el('div', 'tb-reveal');
    if (b.title) node.appendChild(el('p', 'tb-reveal__title', b.title));
    b.items.forEach(function (item) {
      var det = el('details', 'tb-reveal__item');
      det.appendChild(el('summary', 'tb-reveal__summary', item.title));
      det.appendChild(d.paras(el('div', 'tb-reveal__body'), item.text));
      node.appendChild(det);
    });
    return node;
  });

  register('think', function (b, ctx) {
    var node = el('div', 'tb-think');
    node.appendChild(d.taskLabel('Подумайте'));
    node.appendChild(d.rich('p', 'tb-think__prompt', b.prompt));
    var answer = d.paras(el('div', 'tb-think__answer'), b.answer);
    answer.id = d.uid('think');
    var btn = d.button('btn btn--ghost btn--sm tb-think__btn', 'Сравнить с разбором');
    btn.setAttribute('aria-controls', answer.id);

    function show(opened) {
      answer.hidden = !opened;
      btn.hidden = opened;
    }
    btn.addEventListener('click', function () {
      ctx.open('answer');
      show(true);
      d.focus(answer);
    });
    show(ctx.isOpened('answer'));
    node.appendChild(btn);
    node.appendChild(answer);
    return node;
  });

  /** Таблица сравнения; на узком экране каждая строка — карточка (подписи из data-label). */
  register('compare', function (b) {
    var fig = el('figure', 'tb-compare');
    if (b.caption) fig.appendChild(el('figcaption', 'tb-compare__caption', b.caption));
    var table = el('table', 'tb-compare__table');
    table.style.setProperty('--cols', String(b.columns.length));
    var head = el('tr');
    head.appendChild(el('th', 'tb-compare__corner', b.corner || ''));
    b.columns.forEach(function (c) {
      var th = el('th', null, c);
      th.scope = 'col';
      head.appendChild(th);
    });
    var thead = el('thead');
    thead.appendChild(head);
    table.appendChild(thead);
    var tbody = el('tbody');
    b.rows.forEach(function (row) {
      var tr = el('tr');
      var th = el('th', 'tb-compare__label', row.label);
      th.scope = 'row';
      tr.appendChild(th);
      row.cells.forEach(function (cell, i) {
        var td = d.rich('td', null, cell);
        td.setAttribute('data-label', b.columns[i]);
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    var scroller = el('div', 'tb-compare__scroll');
    scroller.appendChild(table);
    fig.appendChild(scroller);
    return fig;
  });
})(typeof window !== 'undefined' ? window : globalThis);
