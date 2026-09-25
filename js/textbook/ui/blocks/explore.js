/**
 * Учебник, блоки для исследования: flow (интерактивная схема-цепочка) и
 * cards (карточки понятий, раскрываются по шагам). Не оцениваются: раскрытые
 * элементы запоминаются в прогрессе, чтобы ученик видел, что уже изучено.
 */
(function (root) {
  'use strict';

  var TXT = root.TXT;
  var d = TXT.ui.dom;
  var el = d.el;
  var register = TXT.ui.blocks.register;

  var STEP_FORMS = ['элемент', 'элемента', 'элементов'];

  /**
   * Схема: узлы в ряд (на узком экране — столбиком), под выбранным узлом —
   * объяснение и пример. На узком экране панель встаёт сразу после узла
   * (CSS order), на широком — под всей цепочкой.
   */
  register('flow', function (b, ctx) {
    var node = el('figure', 'tb-flow');
    var selected = null;

    function draw() {
      node.textContent = '';
      if (b.caption) node.appendChild(d.rich('figcaption', 'tb-flow__caption', b.caption));

      var chain = el('div', 'tb-flow__chain');
      b.nodes.forEach(function (n, i) {
        var btn = d.button('tb-flow__node');
        btn.style.order = String(i * 2);
        btn.setAttribute('aria-expanded', String(selected === i));
        btn.setAttribute('aria-controls', detailId);
        if (selected === i) btn.classList.add('is-selected');
        if (ctx.isOpened(n.id)) btn.classList.add('is-seen');
        btn.appendChild(el('span', 'tb-flow__step', String(i + 1)));
        btn.appendChild(el('span', 'tb-flow__label', n.label));
        if (n.hint) btn.appendChild(el('span', 'tb-flow__hint', n.hint));
        btn.addEventListener('click', function () {
          selected = selected === i ? null : i;
          if (selected !== null) ctx.open(n.id);
          draw();
          var again = node.querySelectorAll('.tb-flow__node')[i];
          if (again) again.focus();
        });
        chain.appendChild(btn);
      });

      var detail = el('div', 'tb-flow__detail');
      detail.id = detailId;
      detail.setAttribute('aria-live', 'polite');
      detail.style.setProperty('--order', String(selected === null ? 999 : selected * 2 + 1));
      if (selected === null) {
        detail.classList.add('is-empty');
        detail.appendChild(el('p', 'tb-flow__placeholder', 'Нажмите на элемент схемы, чтобы увидеть объяснение и пример.'));
      } else {
        var n = b.nodes[selected];
        detail.appendChild(el('p', 'tb-flow__detail-title', (selected + 1) + '. ' + n.label));
        d.paras(detail, n.text);
        if (n.example) {
          var ex = el('div', 'tb-flow__example');
          ex.appendChild(el('span', 'tb-flow__example-label', 'Пример'));
          d.paras(ex, n.example);
          detail.appendChild(ex);
        }
      }
      chain.appendChild(detail);
      node.appendChild(chain);

      var seen = ctx.openedCount();
      node.appendChild(el('p', 'tb-progress-note' + (seen === b.nodes.length ? ' is-complete' : ''),
        seen === b.nodes.length
          ? 'Все элементы схемы изучены'
          : 'Изучено ' + seen + ' из ' + b.nodes.length + ' ' + d.plural(b.nodes.length, STEP_FORMS)));
    }

    var detailId = d.uid('flow');
    draw();
    return node;
  });

  /** Карточки: заголовок раскрывает первый шаг, «Дальше» — следующий. */
  register('cards', function (b, ctx) {
    var node = el('div', 'tb-cards');
    var revealed = {};   // id карточки → сколько шагов открыто (0 — карточка свёрнута)

    function draw(focusId) {
      node.textContent = '';
      if (b.caption) node.appendChild(d.rich('p', 'tb-cards__caption', b.caption));
      var grid = el('div', 'tb-cards__grid');

      b.items.forEach(function (item) {
        var shown = revealed[item.id] || 0;
        var open = shown > 0;
        var studied = ctx.isOpened(item.id);
        var card = el('article', 'tb-card' + (open ? ' is-open' : '') + (studied ? ' is-studied' : ''));
        card.setAttribute('data-card', item.id);

        var bodyId = d.uid('card');
        var head = d.button('tb-card__head');
        head.setAttribute('aria-expanded', String(open));
        head.setAttribute('aria-controls', bodyId);
        var titles = el('span', 'tb-card__titles');
        titles.appendChild(el('span', 'tb-card__title', item.title));
        if (item.summary) titles.appendChild(el('span', 'tb-card__summary', item.summary));
        head.appendChild(titles);
        head.appendChild(el('span', 'tb-card__state', studied ? 'изучено' : ''));
        head.addEventListener('click', function () {
          // Изученную карточку открываем целиком, новую — с первого шага.
          revealed[item.id] = open ? 0 : (ctx.isOpened(item.id) ? item.steps.length : 1);
          if (!open && item.steps.length === 1) ctx.open(item.id);
          draw(item.id);
        });
        card.appendChild(head);

        var body = el('div', 'tb-card__body');
        body.id = bodyId;
        body.hidden = !open;
        if (open) {
          var steps = el('ol', 'tb-card__steps');
          item.steps.slice(0, shown).forEach(function (step) {
            var li = el('li', 'tb-step tb-step--' + (step.kind || 'text'));
            li.appendChild(el('p', 'tb-step__label', step.label));
            d.paras(li, step.text);
            steps.appendChild(li);
          });
          body.appendChild(steps);
          if (shown < item.steps.length) {
            body.appendChild(d.button('btn btn--ghost btn--sm tb-card__more',
              'Дальше: ' + item.steps[shown].label.toLowerCase() + ' →', function () {
                revealed[item.id] = shown + 1;
                if (shown + 1 === item.steps.length) ctx.open(item.id);
                draw();
                var last = node.querySelector('[data-card="' + item.id + '"] .tb-step:last-child');
                d.focus(last);
              }));
          }
        }
        card.appendChild(body);
        grid.appendChild(card);
      });
      node.appendChild(grid);

      var seen = ctx.openedCount();
      node.appendChild(el('p', 'tb-progress-note' + (seen === b.items.length ? ' is-complete' : ''),
        seen === b.items.length ? 'Все карточки изучены' : 'Изучено карточек: ' + seen + ' из ' + b.items.length));

      if (focusId) {
        var h = node.querySelector('[data-card="' + focusId + '"] .tb-card__head');
        if (h) h.focus();
      }
    }

    draw();
    return node;
  });
})(typeof window !== 'undefined' ? window : globalThis);
