/**
 * Учебник, блок ladder — «лестница моделей». Несколько теорий по очереди
 * смотрят на один сюжет. Над ступенями — схема «поле зрения»: вложенные
 * рамки, каждая следующая модель добавляет внешнюю рамку. Рамка с diffuse
 * рисуется пунктиром и «растворяет» центр схемы (власть без центра).
 * Следующая ступень открывается после ответа на вопрос текущей.
 */
(function (root) {
  'use strict';

  var TXT = root.TXT;
  var d = TXT.ui.dom;
  var el = d.el;

  TXT.ui.blocks.register('ladder', function (b, ctx) {
    var node = el('div', 'tb-ladder');
    var drafts = {};

    function isVisible(i) {
      return i === 0 || ctx.isOpened(b.steps[i].id);
    }

    function visibleCount() {
      var n = 0;
      while (n < b.steps.length && isVisible(n)) n += 1;
      return n;
    }

    function scope(count) {
      var fig = el('figure', 'tb-scope');
      fig.setAttribute('aria-label', 'Поле зрения моделей: ' + b.steps.slice(0, count).map(function (s) { return s.ring; }).join(' → '));
      var decentered = b.steps.slice(0, count).some(function (s) { return s.diffuse; });
      if (decentered) fig.classList.add('is-decentered');

      function ring(k) {
        var s = b.steps[k];
        var visible = k < count;
        var div = el('div', 'tb-scope__ring' + (visible ? ' is-visible' : '') +
          (k === count - 1 ? ' is-current' : '') + (s.diffuse ? ' is-diffuse' : ''));
        div.setAttribute('aria-hidden', 'true');
        div.appendChild(el('span', 'tb-scope__label', visible ? (k + 1) + ' · ' + s.ring : (k + 1) + ' · ?'));
        if (k > 0) div.appendChild(ring(k - 1));
        else div.appendChild(el('span', 'tb-scope__core', 'А → Б'));
        return div;
      }

      fig.appendChild(ring(b.steps.length - 1));
      fig.appendChild(el('figcaption', 'tb-scope__caption', decentered
        ? 'Центр растворился: власть больше не сводится к тому, что А делает с Б.'
        : 'Где модель видит власть. Каждая следующая расширяет поле зрения.'));
      return fig;
    }

    function rung(step, i) {
      var li = el('li', 'tb-rung' + (step.diffuse ? ' is-diffuse' : ''));
      li.setAttribute('data-step', step.id);
      var answer = ctx.getAnswer(step.id);

      var head = el('div', 'tb-rung__head');
      head.appendChild(el('p', 'tb-rung__num', 'Модель ' + (i + 1) + ' из ' + b.steps.length + ' · ' + step.ring));
      head.appendChild(el('h3', 'tb-rung__author', step.author));
      if (step.meta) head.appendChild(el('p', 'tb-rung__meta', step.meta));
      li.appendChild(head);

      li.appendChild(d.rich('blockquote', 'tb-rung__formula', step.formula));
      li.appendChild(d.paras(el('div', 'tb-text'), step.text));

      if (step.case) {
        var cs = el('div', 'tb-situation');
        cs.appendChild(el('p', 'tb-situation__label', 'Тот же сюжет'));
        cs.appendChild(d.rich('p', null, step.case));
        li.appendChild(cs);
      }

      var q = step.question;
      var box = el('div', 'tb-rung__question');
      box.appendChild(d.taskLabel('Проверьте модель'));
      box.appendChild(d.rich('p', 'tb-task__prompt', q.text));
      var draft = drafts[step.id];
      box.appendChild(TXT.ui.optionList({
        locked: !!answer,
        items: q.options.map(function (o, j) {
          var picked = answer ? answer.value === j : draft === j;
          if (!answer) return { text: o.text, status: picked ? 'selected' : null };
          var status = picked ? (o.correct ? 'right' : 'wrong') : (o.correct ? 'missed' : 'neutral');
          var tags = { right: 'Ваш ответ · верно', wrong: 'Ваш ответ · неверно', missed: 'Правильный ответ', neutral: null };
          return { text: o.text, status: status, chosen: picked, tag: tags[status], note: o.explanation };
        }),
        onPick: function (j) {
          drafts[step.id] = j;
          draw();
          d.focus(node.querySelector('[data-step="' + step.id + '"] .tb-option:nth-child(' + (j + 1) + ') .tb-option__btn'));
        }
      }));
      if (!answer) {
        var check = d.button('btn btn--primary tb-task__submit', 'Проверить');
        check.disabled = draft === undefined;
        check.addEventListener('click', function () {
          ctx.answer(step.id, draft, q.options[draft].correct);
          draw();
          d.focus(node.querySelector('[data-step="' + step.id + '"] .tb-option.is-right, [data-step="' + step.id + '"] .tb-option.is-wrong'));
        });
        box.appendChild(check);
      }
      li.appendChild(box);

      if (answer) {
        if (step.blindspot) {
          var blind = el('aside', 'tb-callout tb-callout--blind');
          blind.appendChild(el('p', 'tb-callout__title', 'Чего эта модель не видит'));
          blind.appendChild(d.paras(el('div', 'tb-callout__body'), step.blindspot));
          li.appendChild(blind);
        }
        var next = b.steps[i + 1];
        if (next && !isVisible(i + 1)) {
          li.appendChild(d.button('btn btn--primary tb-rung__next', 'Следующая модель: ' + next.author + ' →', function () {
            ctx.open(next.id);
            draw();
            d.focus(node.querySelector('[data-step="' + next.id + '"] .tb-rung__author'));
          }));
        }
      }
      return li;
    }

    function draw() {
      node.textContent = '';
      var count = visibleCount();
      if (b.caption) node.appendChild(d.rich('p', 'tb-ladder__caption', b.caption));
      node.appendChild(scope(count));
      var list = el('ol', 'tb-ladder__steps');
      for (var i = 0; i < count; i++) list.appendChild(rung(b.steps[i], i));
      node.appendChild(list);

      var last = b.steps[b.steps.length - 1];
      if (b.outro && count === b.steps.length && ctx.getAnswer(last.id)) {
        node.appendChild(d.paras(el('div', 'tb-ladder__outro'), b.outro));
      }
    }

    draw();
    return node;
  });
})(typeof window !== 'undefined' ? window : globalThis);
