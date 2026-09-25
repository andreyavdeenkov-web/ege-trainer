/**
 * Учебник, блок match: соотнести каждую позицию с вариантом из общего списка
 * (элементы схемы, ресурсы, типы господства…). Проверяется целиком.
 */
(function (root) {
  'use strict';

  var TXT = root.TXT;
  var d = TXT.ui.dom;
  var el = d.el;

  TXT.ui.blocks.register('match', function (b, ctx) {
    var node = el('div', 'tb-task tb-match');
    var draft = b.items.map(function () { return null; });

    function draw(focus) {
      node.textContent = '';
      var answer = ctx.getAnswer('');
      var chosen = answer ? answer.value : draft;
      node.appendChild(d.taskLabel('Соотнесите'));
      node.appendChild(d.rich('p', 'tb-task__prompt', b.prompt));
      if (b.situation) node.appendChild(d.paras(el('div', 'tb-situation'), b.situation));

      var rows = el('ol', 'tb-match__rows');
      var right = 0;
      b.items.forEach(function (item, i) {
        var ok = answer && chosen[i] === item.match;
        if (ok) right += 1;
        var li = el('li', 'tb-match__row' + (answer ? (ok ? ' is-right' : ' is-wrong') : ''));
        li.appendChild(d.rich('p', 'tb-match__text', item.text));
        var group = el('div', 'tb-match__choices');
        group.setAttribute('role', 'group');
        group.setAttribute('aria-label', 'Вариант для позиции ' + (i + 1));
        b.options.forEach(function (label, j) {
          var btn = d.button('tb-chip', label);
          var isChosen = chosen[i] === j;
          btn.setAttribute('aria-pressed', String(isChosen));
          if (isChosen) btn.classList.add('is-chosen');
          if (answer) {
            btn.disabled = true;
            if (j === item.match) btn.classList.add('is-key');
          } else {
            btn.addEventListener('click', function () {
              draft[i] = draft[i] === j ? null : j;
              draw({ row: i, option: j });
            });
          }
          group.appendChild(btn);
        });
        li.appendChild(group);
        if (answer) {
          var fb = el('div', 'tb-match__feedback');
          fb.appendChild(el('strong', null, ok ? 'Верно. ' : 'Неверно: правильный ответ — «' + b.options[item.match] + '». '));
          d.appendRich(fb, item.explanation);
          li.appendChild(fb);
        }
        rows.appendChild(li);
      });
      node.appendChild(rows);

      if (!answer) {
        var left = draft.filter(function (x) { return x === null; }).length;
        var check = d.button('btn btn--primary tb-task__submit', left ? 'Осталось выбрать: ' + left : 'Проверить');
        check.disabled = left > 0;
        check.addEventListener('click', function () {
          var correct = b.items.every(function (item, i) { return draft[i] === item.match; });
          ctx.answer('', draft.slice(), correct);
          draw();
          d.focus(node.querySelector('.tb-score'));
        });
        node.appendChild(check);
      } else {
        var score = el('p', 'tb-score', 'Верно: ' + right + ' из ' + b.items.length);
        score.setAttribute('role', 'status');
        node.appendChild(score);
      }

      if (focus) {
        var target = node.querySelectorAll('.tb-match__row')[focus.row];
        if (target) target.querySelectorAll('.tb-chip')[focus.option].focus();
      }
    }

    draw();
    return node;
  });
})(typeof window !== 'undefined' ? window : globalThis);
