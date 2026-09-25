/**
 * Учебник, итоговые блоки: summary (что освоено, где ошибки, что повторить)
 * и practice (переход к тренажёрам). Содержание берут из прогресса и из
 * chapter.practice, поэтому в данных главы у них почти нет полей.
 */
(function (root) {
  'use strict';

  var TXT = root.TXT;
  var d = TXT.ui.dom;
  var el = d.el;
  var register = TXT.ui.blocks.register;

  var SECTION_FORMS = ['раздел', 'раздела', 'разделов'];

  function sectionLinks(ctx, ids, className) {
    var list = el('ul', 'tb-summary__list ' + (className || ''));
    ids.forEach(function (id) {
      var li = el('li');
      var a = el('a', null, ctx.sectionTitle(id));
      a.href = ctx.sectionHref(id);
      li.appendChild(a);
      list.appendChild(li);
    });
    return list;
  }

  function group(title, className) {
    var g = el('section', 'tb-summary__group ' + (className || ''));
    g.appendChild(el('h3', 'tb-summary__title', title));
    return g;
  }

  register('summary', function (b, ctx) {
    var node = el('div', 'tb-summary');
    var sum = ctx.summary();
    var rep = ctx.report();

    var stats = el('dl', 'tb-stats');
    function stat(label, value, note) {
      var item = el('div', 'tb-stat');
      item.appendChild(el('dt', null, label));
      item.appendChild(el('dd', null, value));
      if (note) item.appendChild(el('p', 'tb-stat__note', note));
      stats.appendChild(item);
    }
    stat('Основная часть', sum.done + ' из ' + sum.total, d.plural(sum.total, SECTION_FORMS) + ' изучено · ' + sum.percent + '%');
    if (sum.olympiad) {
      stat('Олимпиадный уровень', sum.olympiad.done === sum.olympiad.total ? 'пройден' : 'не пройден',
        sum.olympiad.done === sum.olympiad.total ? null : 'необязательная часть главы');
    }
    if (rep.final) {
      stat('Финальная проверка', rep.final.answered ? rep.final.correct + ' из ' + rep.final.total : '—',
        rep.final.complete ? 'верных ответов' : 'отвечено ' + rep.final.answered + ' из ' + rep.final.total);
    }
    node.appendChild(stats);

    if (rep.final && !rep.final.complete) {
      var pending = el('div', 'tb-summary__notice');
      pending.appendChild(el('p', null, rep.final.answered
        ? 'Финальная проверка пройдена не до конца. Ответьте на оставшиеся вопросы — и здесь появится полный разбор.'
        : 'Пройдите финальную проверку — по её результатам здесь появится разбор: что уже освоено и что стоит повторить.'));
      var go = el('a', 'btn btn--ghost btn--sm', 'К финальной проверке →');
      go.href = ctx.sectionHref(rep.final.sectionId);
      pending.appendChild(go);
      node.appendChild(pending);
    }

    if (rep.mastered.length) {
      var g1 = group('Что вы уже освоили', 'is-right');
      g1.appendChild(sectionLinks(ctx, rep.mastered));
      node.appendChild(g1);
    }

    if (rep.mistakes.length) {
      var g2 = group('Где были ошибки', 'is-wrong');
      var list = el('ul', 'tb-summary__list');
      rep.mistakes.forEach(function (m) {
        var li = el('li');
        li.appendChild(el('span', 'tb-summary__question', TXT.inline.plain(m.text)));
        li.appendChild(el('span', 'tb-summary__ref', 'Раздел «' + ctx.sectionTitle(m.ref) + '»'));
        list.appendChild(li);
      });
      g2.appendChild(list);
      node.appendChild(g2);

      var g3 = group('Что стоит повторить', 'is-review');
      g3.appendChild(sectionLinks(ctx, rep.review));
      node.appendChild(g3);
    } else if (rep.final && rep.final.complete) {
      var clean = group('Ошибок нет', 'is-right');
      clean.appendChild(el('p', null, 'Все вопросы финальной проверки решены верно. Самое время перейти к заданиям.'));
      node.appendChild(clean);
    }

    var unfinished = rep.unfinished.filter(function (id) { return !rep.final || id !== rep.final.sectionId; });
    if (unfinished.length) {
      var g4 = group('Ещё не изучено');
      g4.appendChild(sectionLinks(ctx, unfinished, 'is-muted'));
      node.appendChild(g4);
    }
    return node;
  });

  register('practice', function (b, ctx) {
    var node = el('div', 'tb-practice');
    if (b.text) node.appendChild(d.paras(el('div', 'tb-practice__lead'), b.text));
    ctx.chapter.practice.forEach(function (p, i) {
      var item = el('div', 'tb-practice__item' + (i === 0 ? ' is-primary' : ''));
      item.appendChild(el('p', 'tb-practice__kind', TXT.PRACTICE_KINDS[p.kind]));
      item.appendChild(el('p', 'tb-practice__title', p.title));
      if (p.text) item.appendChild(d.paras(el('div', 'tb-practice__text'), p.text));
      var a = el('a', 'btn ' + (i === 0 ? 'btn--primary btn--lg' : 'btn--ghost') + ' tb-practice__btn', p.label);
      a.href = p.href;
      item.appendChild(a);
      node.appendChild(item);
    });
    return node;
  });
})(typeof window !== 'undefined' ? window : globalThis);
