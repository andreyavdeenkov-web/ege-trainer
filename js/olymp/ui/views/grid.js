/**
 * Олимпиады, интерфейс: классификационная карта (тип analysis-grid).
 *
 * Решение: нормативный текст разбит на фрагменты; ученик выбирает значение
 * в каждой строке карты, при «спорно» указывает спорящие виды, а для строк
 * с доказательством включает режим отметки и нажимает фрагменты текста
 * (основной нормы или справочных норм).
 *
 * Разбор: по каждой строке — ответ ученика, статус, правильный ответ,
 * объяснение именно его ошибки и общее объяснение; по доказательству —
 * отмеченные и эталонные фрагменты. Сводка баллов по компонентам
 * (квалификация, доказательство, логика рассуждения) — feedbackSummary.
 */
(function (root) {
  'use strict';

  var OLY = root.OLY || (root.OLY = {});
  var ui = OLY.ui;
  var G = OLY.analysisGrid;

  var COMPONENT_TITLES = { K: 'Квалификация', T: 'Доказательство', R: 'Логика рассуждения' };
  var STATUS = {
    ok: { text: '✓ верно', cls: 'ok' },
    partial: { text: '½ частично', cls: 'half' },
    wrong: { text: '✗ неверно', cls: 'bad' },
    empty: { text: '— нет ответа', cls: 'none' }
  };

  function el(tag, cls, text) { return ui.el(tag, cls, text); }

  function fmt(n) {
    return String(Math.round(n * 10) / 10).replace('.', ',');
  }

  function copyResponse(task, response) {
    var base = OLY.types.get('analysis-grid').emptyResponse(task);
    if (!response) return base;
    Object.keys(base).forEach(function (id) {
      var a = response[id];
      if (a) base[id] = { c: a.c === undefined ? null : a.c, f: (a.f || []).slice(), e: (a.e || []).slice() };
    });
    return base;
  }

  function demoNotice(task) {
    if (!task.demo) return null;
    var box = el('p', 'nrm-demo-note');
    box.appendChild(el('strong', null, 'Демонстрационное задание. '));
    box.appendChild(document.createTextNode('Тексты норм приведены по вторичным источникам и не сверены с официальной публикацией.'));
    return box;
  }

  function fragmentText(task, id) {
    var item = G.fragmentIndex(task)[id];
    return item ? item.fragment.text.trim() : id;
  }

  function quote(text) {
    var t = text.replace(/[\s,.;:]+$/, '');
    return '«' + (t.length > 60 ? t.slice(0, 57) + '…' : t) + '»';
  }

  /** Блоки нормативного текста. onFragment(id) — нажатие на фрагмент (или null — только чтение). */
  function renderLegal(task, opts) {
    var wrap = el('div', 'nrm-legal-wrap');
    var parts = {};
    var mains = task.legal.filter(function (b) { return b.role === 'main'; });
    var refs = task.legal.filter(function (b) { return b.role === 'reference'; });

    function block(b) {
      var box = el('div', 'nrm-legal' + (b.role === 'reference' ? ' nrm-legal--ref' : ''));
      var head = el('div', 'nrm-legal__ref');
      head.appendChild(el('span', null, b.act + ', ' + b.ref));
      head.appendChild(el('span', 'nrm-legal__edition' + (b.verified ? '' : ' is-unverified'),
        b.verified ? (b.edition + ' · проверено ' + b.checked) : 'текст не сверен с официальным источником'));
      box.appendChild(head);
      var text = el('p', 'nrm-legal__text');
      b.fragments.forEach(function (f) {
        if (!f.id) { text.appendChild(document.createTextNode(f.text)); return; }
        var node;
        if (opts.onFragment) {
          // Строчный элемент с ролью кнопки: фрагмент остаётся частью текста,
          // не превращаясь в прямоугольный блок при переносе строк.
          node = el('span', 'nrm-frag is-button', f.text);
          node.setAttribute('role', 'button');
          node.tabIndex = 0;
          node.addEventListener('click', function () { opts.onFragment(f.id); });
          node.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); opts.onFragment(f.id); }
          });
        } else {
          node = el('span', 'nrm-frag', f.text);
        }
        node.dataset.fragment = f.id;
        parts[f.id] = node;
        text.appendChild(node);
      });
      box.appendChild(text);
      return box;
    }

    mains.forEach(function (b) { wrap.appendChild(block(b)); });
    var details = null;
    if (refs.length) {
      details = el('details', 'nrm-refs');
      if (opts.openRefs) details.open = true;
      details.appendChild(el('summary', null, 'Справочные нормы (' + refs.length + ')'));
      refs.forEach(function (b) { details.appendChild(block(b)); });
      wrap.appendChild(details);
    }
    return { node: wrap, fragments: parts, details: details };
  }

  /* ---------- Решение ---------- */

  function render(container, task, ctx) {
    var response = copyResponse(task, ctx.response);
    var rows = G.rowsOf(task);
    var activeRow = null;
    var rowParts = {};

    var box = el('div', 'nrm-grid');
    var notice = demoNotice(task);
    if (notice) box.appendChild(notice);

    var legal = renderLegal(task, { onFragment: toggleFragment });
    box.appendChild(legal.node);

    var progress = el('p', 'nrm-progress');
    box.appendChild(progress);

    task.sections.forEach(function (section) {
      box.appendChild(el('h3', 'nrm-section__title', section.title));
      if (section.hint) box.appendChild(el('p', 'nrm-section__hint', section.hint));
      var list = el('div', 'nrm-rows');
      section.rows.forEach(function (row) { list.appendChild(renderRow(row)); });
      box.appendChild(list);
    });

    var bar = el('div', 'nrm-evbar');
    bar.hidden = true;
    var barText = el('span', 'nrm-evbar__text');
    var barDone = el('button', 'btn btn--primary btn--sm', 'Готово');
    barDone.type = 'button';
    barDone.addEventListener('click', function () {
      var row = activeRow;
      setActive(null);
      if (row && rowParts[row.id]) rowParts[row.id].card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    bar.appendChild(barText);
    bar.appendChild(barDone);
    box.appendChild(bar);

    function renderRow(row) {
      var card = el('div', 'nrm-row');
      var head = el('div', 'nrm-row__head');
      head.appendChild(el('span', 'nrm-row__label', row.label));
      if (row.evidence) head.appendChild(el('span', 'nrm-row__badge', '¶'));
      card.appendChild(head);
      if (row.note) card.appendChild(el('p', 'nrm-row__note', row.note));

      var group = el('div', 'nrm-chips');
      group.setAttribute('role', 'radiogroup');
      group.setAttribute('aria-label', row.label);
      var buttons = row.options.map(function (text, i) {
        var b = el('button', 'nrm-chip', text);
        b.type = 'button';
        b.setAttribute('role', 'radio');
        b.addEventListener('click', function () {
          var a = response[row.id];
          a.c = a.c === i ? null : i;
          if (!G.needsFollowUp(row, a)) a.f = [];
          changed();
        });
        group.appendChild(b);
        return b;
      });
      card.appendChild(group);

      var follow = null;
      var followButtons = [];
      if (row.followUp) {
        follow = el('div', 'nrm-follow');
        follow.appendChild(el('p', 'nrm-follow__label', row.followUp.label));
        var fg = el('div', 'nrm-chips');
        fg.setAttribute('role', 'group');
        fg.setAttribute('aria-label', row.followUp.label);
        followButtons = row.followUp.options.map(function (text, j) {
          var b = el('button', 'nrm-chip nrm-chip--multi', text);
          b.type = 'button';
          b.setAttribute('role', 'checkbox');
          b.addEventListener('click', function () {
            var a = response[row.id];
            a.f = a.f.indexOf(j) === -1 ? a.f.concat(j).sort() : a.f.filter(function (x) { return x !== j; });
            changed();
          });
          fg.appendChild(b);
          return b;
        });
        follow.appendChild(fg);
        card.appendChild(follow);
      }

      var ev = null;
      if (row.evidence) {
        ev = { wrap: el('div', 'nrm-ev'), btn: el('button', 'btn btn--ghost btn--sm nrm-ev__btn'), list: el('div', 'nrm-ev__list') };
        ev.btn.type = 'button';
        ev.btn.addEventListener('click', function () {
          if (activeRow === row) { setActive(null); return; }
          setActive(row);
          var target = legal.fragments[row.evidence.key[0]] || legal.node;
          if (legal.details && target.closest('details')) legal.details.open = true;
          legal.node.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
        ev.wrap.appendChild(ev.btn);
        ev.wrap.appendChild(ev.list);
        card.appendChild(ev.wrap);
      }
      rowParts[row.id] = { card: card, buttons: buttons, follow: follow, followButtons: followButtons, ev: ev };
      return card;
    }

    function setActive(row) {
      activeRow = row;
      if (row && legal.details && row.evidence.key.some(function (id) {
        return legal.fragments[id] && legal.fragments[id].closest('details');
      })) legal.details.open = true;
      paint();
    }

    function toggleFragment(id) {
      if (!activeRow) {
        bar.hidden = false;
        barText.textContent = 'Сначала нажмите «Отметить в тексте» в строке со значком ¶.';
        barDone.hidden = true;
        clearTimeout(toggleFragment.timer);
        toggleFragment.timer = setTimeout(function () { if (!activeRow) bar.hidden = true; barDone.hidden = false; }, 2500);
        return;
      }
      var a = response[activeRow.id];
      var max = activeRow.evidence.max || G.DEFAULT_EVIDENCE_MAX;
      if (a.e.indexOf(id) !== -1) a.e = a.e.filter(function (x) { return x !== id; });
      else if (a.e.length < max) a.e = a.e.concat(id);
      else { barText.textContent = 'Можно отметить не больше ' + max + ' фрагментов. Снимите лишний.'; return; }
      changed();
    }

    function changed() {
      paint();
      ctx.onChange(JSON.parse(JSON.stringify(response)));
    }

    function paint() {
      var filled = 0;
      rows.forEach(function (row) {
        var a = response[row.id];
        var p = rowParts[row.id];
        if (a.c !== null) filled++;
        p.card.classList.toggle('is-filled', a.c !== null);
        p.card.classList.toggle('is-active', activeRow === row);
        p.buttons.forEach(function (b, i) {
          b.classList.toggle('is-on', a.c === i);
          b.setAttribute('aria-checked', String(a.c === i));
        });
        if (p.follow) {
          p.follow.hidden = !G.needsFollowUp(row, a);
          p.followButtons.forEach(function (b, j) {
            var on = a.f.indexOf(j) !== -1;
            b.classList.toggle('is-on', on);
            b.setAttribute('aria-checked', String(on));
          });
        }
        if (p.ev) {
          var max = row.evidence.max || G.DEFAULT_EVIDENCE_MAX;
          p.ev.btn.textContent = activeRow === row
            ? 'Закончить отметку'
            : (a.e.length ? 'Изменить доказательство (' + a.e.length + ' из ' + max + ')' : 'Отметить в тексте');
          p.ev.list.textContent = '';
          a.e.forEach(function (id) { p.ev.list.appendChild(el('span', 'nrm-ev__tag', quote(fragmentText(task, id)))); });
        }
      });
      Object.keys(legal.fragments).forEach(function (id) {
        var on = !!activeRow && response[activeRow.id].e.indexOf(id) !== -1;
        legal.fragments[id].classList.toggle('is-ev', on);
        legal.fragments[id].classList.toggle('is-pickable', !!activeRow);
        legal.fragments[id].setAttribute('aria-pressed', String(on));
      });
      box.classList.toggle('is-picking', !!activeRow);
      if (activeRow) {
        var a = response[activeRow.id];
        bar.hidden = false;
        barDone.hidden = false;
        barText.textContent = 'Доказательство: «' + activeRow.label + '» — отмечено ' + a.e.length + ' из ' +
          (activeRow.evidence.max || G.DEFAULT_EVIDENCE_MAX) + '. Нажимайте фрагменты текста.';
      } else {
        bar.hidden = true;
      }
      progress.textContent = 'Заполнено строк: ' + filled + ' из ' + rows.length;
    }

    container.textContent = '';
    container.appendChild(box);
    paint();

    return {
      set: function (next) {
        response = copyResponse(task, next);
        paint();
      }
    };
  }

  /* ---------- Разбор ---------- */

  function statusBadge(status) {
    var s = STATUS[status] || STATUS.empty;
    return el('span', 'nrm-st nrm-st--' + s.cls, s.text);
  }

  function line(label, value, cls) {
    var p = el('p', 'nrm-rv__line');
    p.appendChild(el('span', 'muted', label));
    p.appendChild(el('strong', cls || null, value));
    return p;
  }

  function renderReview(container, task, ctx) {
    var result = ctx.result && ctx.result.verdict !== 'unanswered' ? ctx.result : null;
    var response = result ? copyResponse(task, result.response) : null;
    var details = result && result.details ? result.details.rows : null;

    var box = el('div', 'nrm-grid is-review');
    var notice = demoNotice(task);
    if (notice) box.appendChild(notice);

    var legal = renderLegal(task, { onFragment: null, openRefs: true });
    // Эталонные фрагменты доказательств подчёркнуты в тексте.
    G.rowsOf(task).forEach(function (row) {
      if (!row.evidence) return;
      row.evidence.key.forEach(function (id) {
        if (legal.fragments[id]) legal.fragments[id].classList.add('is-key');
      });
    });
    box.appendChild(legal.node);
    box.appendChild(el('p', 'nrm-legend', 'Подчёркнуты фрагменты, которые служат доказательством в эталоне.'));

    task.sections.forEach(function (section) {
      box.appendChild(el('h3', 'nrm-section__title', section.title));
      var list = el('div', 'nrm-rows');
      section.rows.forEach(function (row) {
        list.appendChild(reviewRow(task, row, response && response[row.id], details && details[row.id]));
      });
      box.appendChild(list);
    });

    container.textContent = '';
    container.appendChild(box);
  }

  function reviewRow(task, row, answer, detail) {
    var card = el('div', 'nrm-row nrm-rv');
    var head = el('div', 'nrm-row__head');
    head.appendChild(el('span', 'nrm-row__label', row.label));
    if (detail) {
      var pts = detail.choicePoints + (row.evidence ? detail.evidencePoints : 0);
      var max = 1 + (row.evidence ? 1 : 0);
      head.appendChild(el('span', 'nrm-rv__pts', fmt(pts) + ' из ' + max));
    }
    card.appendChild(head);
    if (row.note) card.appendChild(el('p', 'nrm-row__note', row.note));

    var keyText = row.key.map(function (i) { return row.options[i]; }).join(' / ');
    if (row.followUp && row.key.indexOf(row.followUp.when) !== -1) {
      keyText = row.key.map(function (i) {
        return i === row.followUp.when
          ? row.options[i] + ': ' + row.followUp.key.map(function (j) { return row.followUp.options[j]; }).join(' / ')
          : row.options[i];
      }).join(' / ');
    }

    if (detail) {
      var chosen = answer.c === null ? '—' : row.options[answer.c];
      if (answer.c !== null && G.needsFollowUp(row, answer)) {
        chosen += ': ' + (answer.f.length ? answer.f.map(function (j) { return row.followUp.options[j]; }).join(' / ') : 'спорящие виды не указаны');
      }
      var mine = line('Ваш ответ: ', chosen, detail.choice === 'ok' ? 'text-right' : (detail.choice === 'partial' ? 'text-warn' : 'text-wrong'));
      mine.appendChild(statusBadge(detail.choice));
      card.appendChild(mine);
      if (detail.choice !== 'ok') card.appendChild(line('Правильно: ', keyText, 'text-right'));
      var specific = answer.c !== null && row.wrong && row.wrong[answer.c];
      if (detail.choice === 'partial' && row.followUp && detail.follow) {
        specific = detail.follow === 'partial' ? 'Спор признан верно, но указан не весь круг спорящих видов.' : specific;
      }
      if (detail.choice === 'wrong' && row.followUp && answer.c === row.followUp.when) {
        specific = 'Спор признан верно, но спорящие виды указаны неверно или не указаны.';
        var fw = row.followUp.wrong;
        var bad = answer.f.filter(function (j) { return row.followUp.key.indexOf(j) === -1; });
        if (fw && bad.length && fw[bad[0]]) specific += ' ' + fw[bad[0]];
      }
      if (specific) card.appendChild(el('p', 'nrm-rv__mistake', specific));
    } else {
      card.appendChild(line('Правильно: ', keyText, 'text-right'));
    }
    // У верно решённой строки пояснение свёрнуто, чтобы разбор начинался с ошибок.
    var fullyRight = !!detail && detail.choice === 'ok' && (!row.evidence || detail.evidence === 'ok');
    var why = el('p', 'nrm-rv__why', row.explanation);
    var more = null;
    if (fullyRight) {
      more = el('details', 'nrm-rv__more');
      more.appendChild(el('summary', null, 'Пояснение'));
      more.appendChild(why);
      card.appendChild(more);
    } else {
      card.appendChild(why);
    }

    if (row.evidence) {
      var ev = el('div', 'nrm-rv__ev');
      var title = el('p', 'nrm-rv__line');
      title.appendChild(el('span', 'muted', 'Доказательство: '));
      if (detail) {
        title.appendChild(el('strong', null, answer.e.length ? answer.e.map(function (id) { return quote(fragmentText(task, id)); }).join(', ') : 'не отмечено'));
        title.appendChild(statusBadge(detail.evidence));
      }
      ev.appendChild(title);
      if (!detail || detail.evidence !== 'ok') {
        ev.appendChild(line('Эталон: ', row.evidence.key.map(function (id) { return quote(fragmentText(task, id)); }).join(' или '), 'text-right'));
      }
      if (detail && detail.evidence === 'wrong') {
        var reasons = (detail.evidenceExtra || []).map(function (id) { return row.evidence.wrong && row.evidence.wrong[id]; }).filter(Boolean);
        var msg = reasons.length ? reasons.join(' ')
          : (detail.evidenceHits && detail.evidenceHits.length
            ? 'Ключевой фрагмент отмечен, но вместе с ним — больше одного постороннего.'
            : 'Отмеченные фрагменты не подтверждают вывод в этой строке.');
        ev.appendChild(el('p', 'nrm-rv__mistake', msg));
      }
      var evWhy = el('p', 'nrm-rv__why', row.evidence.explanation);
      if (more) more.appendChild(evWhy); else ev.appendChild(evWhy);
      card.appendChild(ev);
    }
    if (detail) {
      var worst = detail.choice === 'ok' && (!row.evidence || detail.evidence === 'ok') ? 'ok'
        : (detail.choicePoints + detail.evidencePoints > 0 ? 'partial' : 'wrong');
      card.classList.add('nrm-rv--' + worst);
    }
    return card;
  }

  /** Сводка баллов по компонентам под вердиктом. */
  function feedbackSummary(container, task, result) {
    var d = result.details;
    if (!d || !d.components) return;
    container.appendChild(el('p', 'nrm-sum__total', fmt(d.earned) + ' из ' + fmt(d.max) + ' баллов'));
    var tiles = el('div', 'nrm-sum');
    ['K', 'T', 'R'].forEach(function (key) {
      var c = d.components[key];
      if (!c || c.max === 0) return;
      var tile = el('div', 'nrm-sum__tile');
      tile.appendChild(el('span', 'nrm-sum__label', COMPONENT_TITLES[key]));
      tile.appendChild(el('span', 'nrm-sum__val', fmt(c.earned) + ' / ' + fmt(c.max)));
      tiles.appendChild(tile);
    });
    container.appendChild(tiles);
  }

  ui.views.register('analysis-grid', {
    hint: function () {
      return 'Выберите значение в каждой строке. Для строк со значком ¶ нажмите «Отметить в тексте» и выберите фрагменты нормы.';
    },
    render: render,
    renderReview: renderReview,
    feedbackSummary: feedbackSummary
  });
})(typeof window !== 'undefined' ? window : globalThis);
