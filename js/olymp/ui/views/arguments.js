/**
 * Олимпиады, интерфейс: оценка доводов (тип argument-check).
 *
 * Решение: вверху — ситуация, юридический вопрос и оцениваемый вывод; у каждого довода
 * два ряда кнопок: «Правильность» и «Связь с выводом (если довод верен)». Памятка
 * «Как оценивать довод» объясняет три свойства и начисление баллов.
 * Разбор: по каждому доводу — ответ, эталон, краткая причина ошибки, границы
 * допустимых интерпретаций (если есть) и раскрывающееся подробное объяснение.
 *
 * Карточки доводов используются и в составных заданиях (ui.nrmArgs).
 */
(function (root) {
  'use strict';

  var OLY = root.OLY || (root.OLY = {});
  var ui = OLY.ui;
  var R = OLY.nrmRows;
  var A = OLY.argumentCheck;
  var N = ui.nrm;
  var el = N.el;

  var STATUS_CLASS = { ok: 'text-right', partial: 'text-warn', wrong: 'text-wrong', empty: 'text-wrong' };

  function help() {
    var d = el('details', 'nrm-more nrm-types-help');
    d.appendChild(el('summary', null, 'Как оценивать довод'));
    [
      'Правильность: соответствует ли довод фактам ситуации и праву (тексту нормы, теории). Если неверен — укажите, что именно он нарушает.',
      'Связь с выводом оценивается так, как если бы довод был верен. «Обосновывает» — из довода следует вывод. «Относится, но сам вывод не обосновывает» — довод касается вопроса, но его недостаточно или он не решает вопрос. «Опровергает» — из довода следует противоположное. «Не относится» — от довода ответ на вопрос не зависит.',
      'Баллы: по 1 за правильность и за связь с выводом у каждого довода. Решения независимы: ошибка в одном не снимает балл за другое. Если довод верно признан неверным, но указано не то основание (факты вместо права или наоборот), — ½.'
    ].forEach(function (t) { d.appendChild(el('p', 'nrm-more__text', t)); });
    return d;
  }

  function header(container, opts) {
    if (opts.situation && opts.situation.length) {
      var s = el('section', 'nrm-block nrm-context');
      s.appendChild(el('h3', 'nrm-block__title', 'Ситуация'));
      opts.situation.forEach(function (p) { s.appendChild(el('p', 'nrm-context__p', p)); });
      container.appendChild(s);
    }
  }

  function issueBox(issue, conclusion) {
    var box = el('div', 'nrm-issue');
    var q = el('p', 'nrm-issue__q');
    q.appendChild(el('strong', null, 'Вопрос: '));
    q.appendChild(document.createTextNode(issue));
    box.appendChild(q);
    var c = el('p', 'nrm-issue__c');
    c.appendChild(el('strong', null, 'Вывод: '));
    c.appendChild(document.createTextNode(conclusion));
    box.appendChild(c);
    return box;
  }

  /** Редактор одного довода. answers — общий объект ответов; onChanged — после изменения. */
  function editor(task, arg, index, answers, onChanged) {
    var card = el('div', 'nrm-row nrm-arg');
    card.id = N.anchorId(task, arg.id);
    var head = el('div', 'nrm-step__head');
    head.appendChild(el('span', 'nrm-step__num', String(index + 1)));
    head.appendChild(el('p', 'nrm-step__text', arg.text));
    card.appendChild(head);
    var body = el('div', 'nrm-arg__body');
    body.appendChild(el('p', 'nrm-follow__label', 'Правильность'));
    var truth = N.chipGroup(A.TRUTH.map(function (t) { return t.short; }), 'Довод ' + (index + 1) + ': правильность', function (i) {
      var a = answers[arg.id];
      a.t = a.t === i ? null : i;
      onChanged();
    }, false);
    truth.buttons.forEach(function (b, i) { b.setAttribute('aria-label', 'Довод ' + (index + 1) + ': ' + A.TRUTH[i].label); b.title = A.TRUTH[i].label; });
    truth.node.classList.add('nrm-chips--grid3');
    body.appendChild(truth.node);
    body.appendChild(el('p', 'nrm-follow__label', 'Связь с выводом (если довод верен)'));
    var link = N.chipGroup(A.LINK.map(function (l) { return l.short; }), 'Довод ' + (index + 1) + ': связь с выводом', function (i) {
      var a = answers[arg.id];
      a.l = a.l === i ? null : i;
      onChanged();
    }, false);
    link.buttons.forEach(function (b, i) { b.setAttribute('aria-label', 'Довод ' + (index + 1) + ': ' + A.LINK[i].label); b.title = A.LINK[i].label; });
    link.node.classList.add('nrm-chips--grid2');
    body.appendChild(link.node);
    card.appendChild(body);
    return {
      card: card,
      paint: function () {
        var a = answers[arg.id];
        truth.paint(a.t);
        link.paint(a.l);
        card.classList.toggle('is-filled', A.argIsComplete(a));
      }
    };
  }

  function reason(map, i) {
    return R.explanation(map && map[i]);
  }

  /** Разбор одного довода. */
  function review(task, arg, index, a, d) {
    var card = el('div', 'nrm-row nrm-rv nrm-arg');
    card.id = N.anchorId(task, arg.id);
    var head = el('div', 'nrm-step__head');
    head.appendChild(el('span', 'nrm-step__num', String(index + 1)));
    head.appendChild(el('p', 'nrm-step__text', arg.text));
    if (d) head.appendChild(el('span', 'nrm-rv__pts', N.fmt(d.points) + ' из 2'));
    card.appendChild(head);
    var shorts = [];
    var fulls = [];
    function add(r) { if (r) { shorts.push(r.short); if (r.full) fulls.push(r.full); } }
    var keyLink = [arg.key.link].concat(arg.linkAlt || []).map(function (i) { return A.LINK[i].label; }).join(' или ');
    if (d) {
      card.appendChild(N.answerLine('Правильность: ', a.t === null ? 'нет ответа' : A.TRUTH[a.t].label, STATUS_CLASS[d.truth], d.truth));
      if (d.truth !== 'ok') {
        card.appendChild(N.answerLine('Эталон: ', A.TRUTH[arg.key.truth].label, 'text-right'));
        if (a.t !== null) add(reason(arg.wrong && arg.wrong.truth, a.t));
      }
      card.appendChild(N.answerLine('Связь с выводом: ', a.l === null ? 'нет ответа' : A.LINK[a.l].label, STATUS_CLASS[d.link], d.link));
      if (d.link !== 'ok') {
        card.appendChild(N.answerLine('Эталон: ', keyLink, 'text-right'));
        if (a.l !== null) add(reason(arg.wrong && arg.wrong.link, a.l));
      }
      if (shorts.length) card.appendChild(el('p', 'nrm-rv__mistake', shorts.join(' ')));
      card.classList.add('nrm-rv--' + (d.points >= 2 ? 'ok' : (d.points > 0 ? 'partial' : 'wrong')));
    } else {
      card.appendChild(N.answerLine('Правильность: ', A.TRUTH[arg.key.truth].label, 'text-right'));
      card.appendChild(N.answerLine('Связь с выводом: ', keyLink, 'text-right'));
    }
    if (arg.interpretations) {
      var note = el('p', 'nrm-rv__note');
      note.appendChild(el('strong', null, 'Границы интерпретации. '));
      note.appendChild(document.createTextNode(arg.interpretations));
      card.appendChild(note);
    }
    var box = N.more(d && d.points < 2 ? 'Подробное объяснение' : 'Пояснение', fulls.concat(arg.explanation), false);
    if (box) card.appendChild(box);
    return card;
  }

  function copy(list, response) {
    var r = {};
    list.forEach(function (arg) { r[arg.id] = A.answerOf(response, arg); });
    return r;
  }

  /* ---------- Решение ---------- */

  function render(container, task, ctx) {
    var answers = copy(task.arguments, ctx.response);
    var box = el('div', 'nrm-grid nrm-args');
    var notice = N.demoNotice(task);
    if (notice) box.appendChild(notice);
    header(box, { situation: task.situation });
    if (task.legal) box.appendChild(N.renderLegal(task, { refsCollapsed: true }).node);
    var block = el('section', 'nrm-block');
    var head = el('div', 'nrm-block__head');
    head.appendChild(el('h3', 'nrm-block__title', 'Оцените доводы'));
    var count = el('span', 'nrm-block__count');
    head.appendChild(count);
    block.appendChild(head);
    block.appendChild(issueBox(task.issue, task.conclusion));
    block.appendChild(help());
    var list = el('div', 'nrm-rows');
    var editors = task.arguments.map(function (arg, i) {
      var e = editor(task, arg, i, answers, changed);
      list.appendChild(e.card);
      return e;
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
      task.arguments.forEach(function (arg, i) {
        editors[i].paint();
        if (A.argIsComplete(answers[arg.id])) filled++;
        else if (!firstEmpty) firstEmpty = arg.id;
      });
      count.textContent = filled + ' из ' + task.arguments.length;
      count.classList.toggle('is-done', filled === task.arguments.length);
      fill.update(filled, task.arguments.length, firstEmpty);
    }

    container.textContent = '';
    container.appendChild(box);
    paint();
    return {
      set: function (next) {
        var fresh = copy(task.arguments, next);
        Object.keys(fresh).forEach(function (id) { answers[id] = fresh[id]; });
        paint();
      }
    };
  }

  /* ---------- Разбор ---------- */

  function renderReview(container, task, ctx) {
    var result = ctx.result && ctx.result.verdict !== 'unanswered' ? ctx.result : null;
    var answers = result ? copy(task.arguments, result.response) : null;
    var details = result && result.details ? result.details.arguments : null;
    var box = el('div', 'nrm-grid nrm-args is-review');
    var notice = N.demoNotice(task);
    if (notice) box.appendChild(notice);
    header(box, { situation: task.situation });
    if (task.legal) box.appendChild(N.renderLegal(task, { refsCollapsed: true }).node);
    var block = el('section', 'nrm-block');
    var head = el('div', 'nrm-block__head');
    head.appendChild(el('h3', 'nrm-block__title', 'Оцените доводы'));
    if (result && result.details) {
      var c = result.details.components.R;
      head.appendChild(el('span', 'nrm-block__count' + (c.earned >= c.max ? ' is-done' : ''), N.fmt(c.earned) + ' из ' + c.max));
    }
    block.appendChild(head);
    block.appendChild(issueBox(task.issue, task.conclusion));
    var list = el('div', 'nrm-rows');
    task.arguments.forEach(function (arg, i) {
      list.appendChild(review(task, arg, i, answers && answers[arg.id], details && details[arg.id]));
    });
    block.appendChild(list);
    block.appendChild(help());
    box.appendChild(block);
    container.textContent = '';
    container.appendChild(box);
  }

  function mistakes(list, details) {
    if (!details) return [];
    return list.map(function (arg, i) { return { arg: arg, i: i }; })
      .filter(function (x) { return details[x.arg.id].points < 2; })
      .map(function (x) { return { id: x.arg.id, label: 'Довод ' + (x.i + 1) }; });
  }

  function feedbackSummary(container, task, result) {
    var d = result.details;
    N.summary(container, task, result, d ? mistakes(task.arguments, d.arguments) : []);
  }

  ui.views.register('argument-check', {
    hint: function () { return 'Оцените каждый довод: верен ли он и как связан с выводом.'; },
    render: render,
    renderReview: renderReview,
    feedbackSummary: feedbackSummary
  });

  ui.nrmArgs = { help: help, issueBox: issueBox, editor: editor, review: review, copy: copy, mistakes: mistakes };
})(typeof window !== 'undefined' ? window : globalThis);
