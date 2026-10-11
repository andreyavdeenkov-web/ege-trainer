/**
 * Олимпиадный практикум «Норма права»: общие элементы интерфейса новых типов
 * заданий (классификационная карта, разметка нормы, поиск ошибок).
 *
 * Единые правила представления разбора для всех форматов:
 *   1) сначала — компактный результат: статус, общий балл, три компонента
 *      и указатель на ошибочные элементы (feedbackSummary);
 *   2) затем — подробный разбор. У ошибочного элемента сразу видны ответ ученика,
 *      правильный ответ и краткая причина ошибки; развёрнутое юридическое
 *      объяснение раскрывается отдельно. Содержание объяснений не сокращается.
 *
 * Интерактивные фрагменты текста — строчные элементы с ролью кнопки:
 * фокус с клавиатуры, Enter / Пробел, состояние aria-pressed.
 */
(function (root) {
  'use strict';

  var OLY = root.OLY || (root.OLY = {});
  var ui = OLY.ui;
  var R = OLY.nrmRows;

  var COMPONENT_TITLES = { K: 'Квалификация', T: 'Работа с текстом нормы', R: 'Логика рассуждения' };
  var VERDICT = {
    correct: { text: 'Верно', cls: 'ok' },
    partial: { text: 'Частично', cls: 'half' },
    incorrect: { text: 'Неверно', cls: 'bad' }
  };
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

  function quote(text) {
    var t = String(text).trim().replace(/[\s,.;:]+$/, '');
    return '«' + (t.length > 60 ? t.slice(0, 57) + '…' : t) + '»';
  }

  /** Короткая метка строки для указателя ошибок: «4б» из «4б. По способу…». */
  function shortLabel(row) {
    if (row.short) return row.short;
    var m = /^\s*([0-9]+[а-яa-z]?|[А-ЯA-Z][0-9]+)[.)]\s/.exec(row.label || '');
    return m ? m[1] : (row.label || '').slice(0, 18);
  }

  function anchorId(task, id) {
    return 'nrm-' + task.id + '-' + id;
  }

  function demoNotice(task) {
    var box;
    if (task.demo) {
      box = el('p', 'nrm-demo-note');
      box.appendChild(el('strong', null, 'Демонстрационное задание. '));
      box.appendChild(document.createTextNode('Тексты норм приведены по вторичным источникам и не сверены с официальной публикацией.'));
      return box;
    }
    var v = task.verification;
    if (v && v.status === 'unconfirmed') {
      box = el('p', 'nrm-demo-note');
      box.appendChild(el('strong', null, 'Неподтверждённое задание. '));
      box.appendChild(document.createTextNode('Нормативные тексты не сверены с официальной публикацией (попытка сверки ' + String(v.checked).split('-').reverse().join('.') + '); задание не входит в публикуемый банк.'));
      return box;
    }
    if (task.draft) {
      box = el('p', 'nrm-demo-note');
      box.appendChild(el('strong', null, 'Черновик. '));
      box.appendChild(document.createTextNode('Задание на методической проверке.'));
      return box;
    }
    return null;
  }

  function more(title, paragraphs, open) {
    var list = paragraphs.filter(function (p) { return R.isText(p); });
    if (!list.length) return null;
    var d = el('details', 'nrm-more');
    if (open) d.open = true;
    d.appendChild(el('summary', null, title));
    list.forEach(function (p) { d.appendChild(el('p', 'nrm-more__text', p)); });
    return d;
  }

  /** Все блоки нормативного текста задания (у составного — и тексты частей). */
  function taskLegal(task) {
    var list = (task.legal || []).slice();
    (task.parts || []).forEach(function (p) { (p.legal || []).forEach(function (b) { list.push(b); }); });
    return list;
  }

  /** Эпизод строки: печатается в карточке над вопросом, чтобы ситуация была рядом с ответом. */
  function rowContext(row) {
    if (!row.context) return null;
    var box = el('div', 'nrm-row__context');
    (Array.isArray(row.context) ? row.context : [row.context]).forEach(function (p) { box.appendChild(el('p', null, p)); });
    return box;
  }

  /** Определения, заданные в условии (раскрыты по умолчанию). */
  function definitionsBlock(task) {
    if (!task.definitions || !task.definitions.length) return null;
    var d = el('details', 'nrm-defs');
    d.open = true;
    d.appendChild(el('summary', null, task.definitionsTitle || 'Определения для этого задания'));
    var dl = el('dl', 'nrm-defs__list');
    task.definitions.forEach(function (x) {
      dl.appendChild(el('dt', null, x.term));
      dl.appendChild(el('dd', null, x.text));
    });
    d.appendChild(dl);
    return d;
  }

  /** Блок «Ситуация» (список абзацев) или null. */
  function situationBlock(paragraphs) {
    if (!paragraphs || !paragraphs.length) return null;
    var s = el('section', 'nrm-block nrm-context');
    s.appendChild(el('h3', 'nrm-block__title', 'Ситуация'));
    paragraphs.forEach(function (p) { s.appendChild(el('p', 'nrm-context__p', p)); });
    return s;
  }

  /**
   * Раскладка задания. task.layout === 'split' задаётся только там, где общая ситуация и тексты
   * норм нужны при ответе на многие вопросы. На широком экране они закреплены в левой колонке
   * (со своей прокруткой), вопросы — справа. На узком экране всё идёт по порядку, а кнопка
   * «Ситуация и нормы» в нижней панели открывает ту же колонку в диалоге поверх вопросов.
   * Без layout — обычный порядок сверху вниз. Возвращает { aside, main, split }.
   */
  function layout(task, box) {
    if (task.layout !== 'split') return { aside: box, main: box, split: false };
    box.classList.add('nrm-split');
    var aside = el('div', 'nrm-split__aside');
    // Колонка прокручивается отдельно — с клавиатуры до неё тоже можно добраться.
    aside.tabIndex = 0;
    aside.setAttribute('role', 'region');
    aside.setAttribute('aria-label', 'Ситуация и тексты норм');
    var main = el('div', 'nrm-split__main');
    box.appendChild(aside);
    box.appendChild(main);
    return { aside: aside, main: main, split: true };
  }

  /** Кнопка «Ситуация и нормы»: диалог с копией левой колонки (для узкого экрана). */
  function contextButton(aside) {
    var btn = el('button', 'btn btn--ghost btn--sm nrm-ctxbtn', 'Ситуация и нормы');
    btn.type = 'button';
    btn.setAttribute('aria-haspopup', 'dialog');
    btn.addEventListener('click', function () {
      var dlg = el('dialog', 'nrm-ctxdlg');
      dlg.setAttribute('aria-label', 'Ситуация и нормы');
      var bar = el('div', 'nrm-ctxdlg__bar');
      bar.appendChild(el('strong', null, 'Ситуация и нормы'));
      var close = el('button', 'btn btn--ghost btn--sm', 'Закрыть');
      close.type = 'button';
      close.addEventListener('click', function () { dlg.close(); });
      bar.appendChild(close);
      dlg.appendChild(bar);
      var body = el('div', 'nrm-ctxdlg__body');
      var copy = aside.cloneNode(true);
      copy.className = 'nrm-ctxdlg__content';
      copy.removeAttribute('tabindex');
      copy.removeAttribute('role');
      copy.removeAttribute('aria-label');
      copy.querySelectorAll('[id]').forEach(function (n) { n.removeAttribute('id'); });
      copy.querySelectorAll('[tabindex]').forEach(function (n) { n.removeAttribute('tabindex'); });
      copy.querySelectorAll('[role="button"]').forEach(function (n) { n.removeAttribute('role'); n.removeAttribute('aria-pressed'); });
      body.appendChild(copy);
      dlg.appendChild(body);
      dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); });
      dlg.addEventListener('close', function () {
        dlg.remove();
        btn.focus({ preventScroll: true });
      });
      document.body.appendChild(dlg);
      if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
      close.focus({ preventScroll: true });
    });
    return btn;
  }

  function statusBadge(status) {
    var s = STATUS[status] || STATUS.empty;
    return el('span', 'nrm-st nrm-st--' + s.cls, s.text);
  }

  function answerLine(label, value, cls, status) {
    var p = el('p', 'nrm-rv__line');
    p.appendChild(el('span', 'nrm-rv__k', label));
    p.appendChild(el('strong', cls || null, value));
    if (status) p.appendChild(statusBadge(status));
    return p;
  }

  /* ---------- Нормативный текст ---------- */

  /**
   * Блоки нормативного текста.
   * opts.onFragment(id) — нажатие на фрагмент (нет — только чтение);
   * opts.blocks — какие блоки показать (по умолчанию все);
   * opts.refsCollapsed — справочные нормы в свёрнутом блоке.
   * Возвращает { node, fragments: { id: элемент } }.
   */
  function renderLegal(task, opts) {
    var options = opts || {};
    var wrap = el('div', 'nrm-legal-wrap');
    var parts = {};
    var blocks = options.blocks || task.legal || [];
    var mains = blocks.filter(function (b) { return b.role === 'main'; });
    var refs = blocks.filter(function (b) { return b.role === 'reference'; });

    function block(b) {
      var box = el('div', 'nrm-legal' + (b.role === 'reference' ? ' nrm-legal--ref' : ''));
      var head = el('div', 'nrm-legal__ref');
      head.appendChild(el('span', null, b.act + ', ' + b.ref));
      if (b.fictional) head.appendChild(el('span', 'nrm-legal__edition', 'учебный документ из условия задачи'));
      else head.appendChild(el('span', 'nrm-legal__edition' + (b.verified ? '' : ' is-unverified'),
        b.verified ? (b.edition + ' · проверено ' + b.checked) : 'текст не сверен с официальным источником'));
      box.appendChild(head);
      var text = el('p', 'nrm-legal__text');
      b.fragments.forEach(function (f) {
        if (!f.id) { text.appendChild(document.createTextNode(f.text)); return; }
        var node = el('span', 'nrm-frag', f.text);
        if (options.onFragment) {
          node.classList.add('is-button');
          node.setAttribute('role', 'button');
          node.setAttribute('aria-pressed', 'false');
          node.tabIndex = 0;
          node.addEventListener('click', function () { options.onFragment(f.id); });
          node.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); options.onFragment(f.id); }
          });
        }
        node.dataset.fragment = f.id;
        parts[f.id] = node;
        text.appendChild(node);
      });
      box.appendChild(text);
      return box;
    }

    mains.forEach(function (b) { wrap.appendChild(block(b)); });
    if (refs.length) {
      if (options.refsCollapsed) {
        var details = el('details', 'nrm-refs');
        details.appendChild(el('summary', null, 'Справочные нормы (' + refs.length + ')'));
        refs.forEach(function (b) { details.appendChild(block(b)); });
        wrap.appendChild(details);
      } else {
        refs.forEach(function (b) { wrap.appendChild(block(b)); });
      }
    }
    return { node: wrap, fragments: parts };
  }

  function fragmentText(task, id) {
    var item = R.fragmentIndex(taskLegal(task))[id];
    return item ? item.fragment.text : id;
  }

  /* ---------- Выбор вариантов ---------- */

  /**
   * Группа кнопок-вариантов. multi — несколько значений (aria-pressed у каждой).
   * Возвращает { node, paint(selected) } (selected — номер или список номеров).
   */
  /**
   * Стабильный «перемешанный» порядок показа вариантов строки (row.shuffle: true):
   * снимает подсказку позицией (правильный вариант не всегда первый), но одинаков
   * при каждой отрисовке и после перезагрузки. Номера вариантов в ответе не меняются.
   */
  function displayOrder(task, row) {
    var order = row.options.map(function (o, i) { return i; });
    if (!row.shuffle) return order;
    var seed = 0;
    var key = String(task && task.id) + '/' + row.id;
    for (var k = 0; k < key.length; k++) seed = (seed * 31 + key.charCodeAt(k)) >>> 0;
    for (var i = order.length - 1; i > 0; i--) {
      seed = (seed * 1103515245 + 12345) >>> 0;
      var j = seed % (i + 1);
      var t = order[i]; order[i] = order[j]; order[j] = t;
    }
    // Порядок, совпадающий с исходным, сдвигается: иначе правильный вариант мог бы остаться на месте автора.
    if (order.every(function (v, idx) { return v === idx; })) order.push(order.shift());
    return order;
  }

  function chipGroup(options, label, onToggle, multi, order) {
    var group = el('div', 'nrm-chips');
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', label);
    var buttons = options.map(function (text, i) {
      var b = el('button', 'nrm-chip' + (multi ? ' nrm-chip--multi' : ''), text);
      b.type = 'button';
      b.setAttribute('aria-pressed', 'false');
      b.addEventListener('click', function () { onToggle(i); });
      return b;
    });
    (order || options.map(function (o, i) { return i; })).forEach(function (i) { group.appendChild(buttons[i]); });
    return {
      node: group,
      buttons: buttons,
      paint: function (selected) {
        var list = Array.isArray(selected) ? selected : (selected === null || selected === undefined ? [] : [selected]);
        buttons.forEach(function (b, i) {
          var on = list.indexOf(i) !== -1;
          b.classList.toggle('is-on', on);
          b.setAttribute('aria-pressed', String(on));
        });
      }
    };
  }

  /* ---------- Разбор строки выбора ---------- */

  function keyText(row) {
    if (row.multi) {
      var base = row.key.map(function (i) { return row.options[i]; }).join(' / ');
      return base + (row.multi.max > 1 ? ' (засчитывается любой из них или два вместе)' : '');
    }
    return row.key.map(function (i) {
      if (row.followUp && i === row.followUp.when) {
        return row.options[i] + ': ' + row.followUp.key.map(function (j) { return row.followUp.options[j]; }).join(' / ');
      }
      return row.options[i];
    }).join(' / ');
  }

  function chosenText(row, answer) {
    if (row.multi) return answer.m && answer.m.length ? answer.m.map(function (i) { return row.options[i]; }).join(', ') : '—';
    if (answer.c === null || answer.c === undefined) return '—';
    var text = row.options[answer.c];
    if (R.needsFollowUp(row, answer)) {
      text += ': ' + (answer.f.length ? answer.f.map(function (j) { return row.followUp.options[j]; }).join(' / ') : 'спорящие виды не указаны');
    }
    return text;
  }

  /** Краткая причина и подробное объяснение ошибки выбора: { short, full }. */
  function choiceReason(row, answer, detail) {
    if (row.multi) {
      if (detail.choice === 'ok' || !answer.m || !answer.m.length) return null;
      var contra = row.multi.contra || [];
      var wrongPicked = answer.m.filter(function (i) { return contra.indexOf(i) !== -1; });
      var shown = (wrongPicked.length ? wrongPicked : answer.m.filter(function (i) { return row.key.indexOf(i) === -1; }))
        .map(function (i) { return R.explanation(row.wrong && row.wrong[i]); }).filter(Boolean);
      var lead = wrongPicked.length ? 'Выбран признак, который противоречит этому случаю.' : 'Выбран признак, который здесь не решающий.';
      return { short: lead + (shown.length ? ' ' + shown.map(function (r) { return r.short; }).join(' ') : ''), full: shown.map(function (r) { return r.full; }).filter(Boolean).join(' ') || null };
    }
    if (detail.choice === 'ok' || answer.c === null || answer.c === undefined) return null;
    if (row.followUp && answer.c === row.followUp.when) {
      if (detail.follow === 'partial') return { short: 'Спор признан верно, но указаны не все спорящие виды.', full: null };
      var bad = (answer.f || []).filter(function (j) { return row.followUp.key.indexOf(j) === -1; });
      var specific = bad.length && row.followUp.wrong ? R.explanation(row.followUp.wrong[bad[0]]) : null;
      return {
        short: 'Спор признан верно, но спорящие виды указаны неверно или не указаны.' + (specific ? ' ' + specific.short : ''),
        full: specific ? specific.full : null
      };
    }
    return R.explanation(row.wrong && row.wrong[answer.c]);
  }

  /**
   * Карточка разбора строки выбора (классификационная карта, карта элементов,
   * характеристика элементов, слот конструктора, оценка довода).
   * answer / detail — ответ ученика и результат проверки строки (null — задание не решено).
   */
  function rowReview(task, row, answer, detail) {
    var card = el('div', 'nrm-row nrm-rv');
    card.id = anchorId(task, row.id);
    var ctxNode = rowContext(row);
    if (ctxNode) card.appendChild(ctxNode);
    var head = el('div', 'nrm-row__head');
    head.appendChild(el('span', 'nrm-row__label', row.label));
    var max = 1 + (row.evidence ? 1 : 0);
    if (detail) head.appendChild(el('span', 'nrm-rv__pts', fmt(detail.choicePoints + (detail.evidencePoints || 0)) + ' из ' + max));
    card.appendChild(head);
    if (row.note) card.appendChild(el('p', 'nrm-row__note', row.note));

    var fullyRight = !!detail && detail.choice === 'ok' && (!row.evidence || detail.evidence === 'ok');
    var reason = detail ? choiceReason(row, answer, detail) : null;

    if (detail) {
      var cls = detail.choice === 'ok' ? 'text-right' : (detail.choice === 'partial' ? 'text-warn' : 'text-wrong');
      card.appendChild(answerLine('Ваш ответ: ', chosenText(row, answer), cls, detail.choice));
      if (detail.choice !== 'ok') card.appendChild(answerLine('Правильно: ', keyText(row), 'text-right'));
      if (reason) card.appendChild(el('p', 'nrm-rv__mistake', reason.short));
    } else {
      card.appendChild(answerLine('Правильно: ', keyText(row), 'text-right'));
    }

    var fullTexts = [];
    if (reason && reason.full) fullTexts.push(reason.full);
    fullTexts.push(row.explanation);

    if (row.evidence) {
      var ev = el('div', 'nrm-rv__ev');
      if (detail) {
        ev.appendChild(answerLine('Доказательство: ',
          answer.e.length ? answer.e.map(function (id) { return quote(fragmentText(task, id)); }).join(', ') : 'не отмечено',
          null, detail.evidence));
      }
      if (!detail || detail.evidence !== 'ok') {
        ev.appendChild(answerLine('Эталон: ', row.evidence.key.map(function (id) { return quote(fragmentText(task, id)); }).join(' или '), 'text-right'));
      }
      if (detail && detail.evidence === 'wrong') {
        var reasons = (detail.evidenceExtra || []).map(function (id) {
          return R.explanation(row.evidence.wrong && row.evidence.wrong[id]);
        }).filter(Boolean);
        var shortText = reasons.length ? reasons.map(function (r) { return r.short; }).join(' ')
          : (detail.evidenceHits && detail.evidenceHits.length
            ? 'Ключевой фрагмент отмечен, но вместе с ним — больше одного постороннего.'
            : 'Отмеченные фрагменты не подтверждают вывод в этой строке.');
        ev.appendChild(el('p', 'nrm-rv__mistake', shortText));
        reasons.forEach(function (r) { if (r.full) fullTexts.push(r.full); });
      }
      fullTexts.push(row.evidence.explanation);
      card.appendChild(ev);
    }

    var box = more(fullyRight || !detail ? 'Пояснение' : 'Подробное объяснение', fullTexts, false);
    if (box) card.appendChild(box);

    if (detail) {
      var worst = fullyRight ? 'ok' : (detail.choicePoints + (detail.evidencePoints || 0) > 0 ? 'partial' : 'wrong');
      card.classList.add('nrm-rv--' + worst);
    }
    return card;
  }

  /* ---------- Компактный результат ---------- */

  /**
   * Компактный результат задания: статус, общий балл, компоненты и указатель
   * на ошибочные элементы. mistakes — [{ id, label }] (якоря — anchorId).
   */
  function summary(container, task, result, mistakes) {
    var d = result.details;
    if (!d || !d.components) return;
    var v = VERDICT[result.verdict] || VERDICT.incorrect;
    var head = el('div', 'nrm-sum__head');
    head.appendChild(el('span', 'nrm-st nrm-st--' + v.cls + ' nrm-sum__status', v.text));
    head.appendChild(el('span', 'nrm-sum__total', fmt(d.earned) + ' из ' + fmt(d.max) + ' баллов'));
    container.appendChild(head);
    var tiles = el('div', 'nrm-sum');
    ['K', 'T', 'R'].forEach(function (key) {
      var c = d.components[key];
      if (!c || c.max === 0) return;
      var tile = el('div', 'nrm-sum__tile' + (c.earned >= c.max ? ' is-full' : ''));
      tile.appendChild(el('span', 'nrm-sum__label', COMPONENT_TITLES[key]));
      tile.appendChild(el('span', 'nrm-sum__val', fmt(c.earned) + ' / ' + fmt(c.max)));
      tiles.appendChild(tile);
    });
    container.appendChild(tiles);
    if (mistakes && mistakes.length) {
      var nav = el('nav', 'nrm-sum__mistakes');
      nav.setAttribute('aria-label', 'Элементы с ошибками');
      nav.appendChild(el('span', 'nrm-sum__mistakes-label', 'Ошибки:'));
      mistakes.forEach(function (m) {
        var a = el('a', 'nrm-sum__jump', m.label);
        a.href = '#' + anchorId(task, m.id);
        a.addEventListener('click', function (e) {
          e.preventDefault();
          var target = document.getElementById(anchorId(task, m.id));
          if (!target) return;
          target.scrollIntoView({ behavior: 'smooth', block: 'start' });
          target.classList.add('is-flash');
          setTimeout(function () { target.classList.remove('is-flash'); }, 1200);
        });
        nav.appendChild(a);
      });
      container.appendChild(nav);
    }
  }

  /** Строки с ошибками (не полный балл) для указателя. */
  function rowMistakes(rows, details) {
    if (!details) return [];
    return rows.filter(function (row) {
      var d = details[row.id];
      if (!d) return false;
      return d.choice !== 'ok' || (row.evidence && d.evidence !== 'ok');
    }).map(function (row) { return { id: row.id, label: shortLabel(row) }; });
  }

  /**
   * Индикатор заполнения с переходом к первому незаполненному элементу.
   * Возвращает { node, update(filled, total, firstEmptyId) }.
   */
  function fillBar(task, opts) {
    var bar = el('div', 'nrm-fillbar');
    var text = el('span', 'nrm-fillbar__text');
    text.setAttribute('aria-live', 'polite');
    var jump = el('button', 'btn btn--ghost btn--sm', 'К незаполненному');
    jump.type = 'button';
    var target = null;
    jump.addEventListener('click', function () {
      if (!target) return;
      var node = document.getElementById(anchorId(task, target));
      if (!node) return;
      node.scrollIntoView({ behavior: 'smooth', block: 'center' });
      node.classList.add('is-flash');
      setTimeout(function () { node.classList.remove('is-flash'); }, 1200);
      var focusable = node.querySelector('button, [tabindex="0"]');
      if (focusable) focusable.focus({ preventScroll: true });
    });
    bar.appendChild(text);
    if (opts && opts.aside) bar.appendChild(contextButton(opts.aside));
    bar.appendChild(jump);
    return {
      node: bar,
      update: function (filled, total, firstEmptyId) {
        target = firstEmptyId;
        text.textContent = 'Заполнено: ' + filled + ' из ' + total;
        jump.hidden = !firstEmptyId;
        bar.classList.toggle('is-done', !firstEmptyId);
      }
    };
  }

  /**
   * Редактор строки выбора (карта элементов, характеристика, систематизация, утверждения,
   * слоты конструктора, части составного задания). answers — общий изменяемый объект ответов
   * строк; onChanged() — после любого изменения.
   * Доказательство (row.evidence) — если переданы opts.legal (блоки, из которых выбираются
   * фрагменты): кнопка «Отметить в тексте» раскрывает под строкой текст норм. opts.group —
   * общий объект редакторов одной части, чтобы панель доказательства была открыта только одна.
   * Возвращает { card, paint() }.
   */
  function rowEditor(task, row, answers, onChanged, opts) {
    var options = opts || {};
    var card = el('div', 'nrm-row');
    card.id = anchorId(task, row.id);
    var ctxNode = rowContext(row);
    if (ctxNode) card.appendChild(ctxNode);
    var head = el('div', 'nrm-row__head');
    head.appendChild(el('span', 'nrm-row__label', row.label));
    if (row.evidence) {
      var badge = el('span', 'nrm-row__badge', '¶');
      badge.title = 'Нужно доказательство из текста';
      badge.setAttribute('aria-label', 'Нужно доказательство из текста');
      head.appendChild(badge);
    }
    card.appendChild(head);
    if (row.note) card.appendChild(el('p', 'nrm-row__note', row.note));
    var limit = null;
    var choice = chipGroup(row.options, row.label, function (i) {
      var a = answers[row.id];
      if (row.multi) {
        var m = a.m || [];
        if (m.indexOf(i) !== -1) a.m = m.filter(function (x) { return x !== i; });
        else if (m.length < row.multi.max) a.m = m.concat(i).sort(function (x, y) { return x - y; });
        else { limit.textContent = 'Можно выбрать не больше ' + row.multi.max + '. Снимите лишний.'; return; }
        limit.textContent = '';
        onChanged();
        return;
      }
      a.c = a.c === i ? null : i;
      if (!R.needsFollowUp(row, a)) a.f = [];
      onChanged();
    }, !!row.multi, displayOrder(task, row));
    card.appendChild(choice.node);
    if (row.multi) {
      card.insertBefore(el('p', 'nrm-row__note', 'Выберите от 1 до ' + row.multi.max + ' решающих признаков. Засчитывается, если все выбранные — решающие.'), choice.node);
      limit = el('p', 'nrm-ev__status');
      limit.setAttribute('aria-live', 'polite');
      card.appendChild(limit);
    }
    var follow = null;
    if (row.followUp) {
      follow = { wrap: el('div', 'nrm-follow') };
      follow.wrap.appendChild(el('p', 'nrm-follow__label', row.followUp.label));
      follow.group = chipGroup(row.followUp.options, row.followUp.label, function (j) {
        var a = answers[row.id];
        a.f = a.f.indexOf(j) === -1 ? a.f.concat(j).sort(function (x, y) { return x - y; }) : a.f.filter(function (x) { return x !== j; });
        onChanged();
      }, true);
      follow.wrap.appendChild(follow.group.node);
      card.appendChild(follow.wrap);
    }

    var group = options.group || { open: null };
    var blocks = options.legal || [];
    var ev = null;
    var api = { card: card };
    if (row.evidence && blocks.length) {
      ev = { wrap: el('div', 'nrm-ev'), btn: el('button', 'btn btn--ghost btn--sm nrm-ev__btn'), list: el('div', 'nrm-ev__list'), panel: null };
      ev.btn.type = 'button';
      ev.btn.setAttribute('aria-expanded', 'false');
      ev.btn.addEventListener('click', toggleEvidence);
      ev.wrap.appendChild(ev.btn);
      ev.wrap.appendChild(ev.list);
      card.appendChild(ev.wrap);
    }
    var evMax = row.evidence ? (row.evidence.max || R.DEFAULT_EVIDENCE_MAX) : 0;

    function toggleEvidence() {
      var wasOpen = group.open === api;
      if (group.open) group.open.closeEvidence();
      if (wasOpen) return;
      var panel = el('div', 'nrm-ev__panel');
      panel.appendChild(el('p', 'nrm-ev__hint', 'Нажмите фрагменты, на которых основан вывод (не больше ' + evMax + '). Повторное нажатие снимает отметку.'));
      var legal = renderLegal({ id: task.id, legal: blocks }, { blocks: blocks, onFragment: toggleFragment });
      panel.appendChild(legal.node);
      var status = el('p', 'nrm-ev__status');
      status.setAttribute('aria-live', 'polite');
      panel.appendChild(status);
      var done = el('button', 'btn btn--primary btn--sm', 'Готово');
      done.type = 'button';
      done.addEventListener('click', function () {
        api.closeEvidence();
        ev.btn.focus({ preventScroll: true });
      });
      panel.appendChild(done);
      ev.wrap.appendChild(panel);
      ev.panel = { node: panel, fragments: legal.fragments, status: status };
      group.open = api;
      api.paint();
    }

    function toggleFragment(id) {
      var a = answers[row.id];
      if (a.e.indexOf(id) !== -1) a.e = a.e.filter(function (x) { return x !== id; });
      else if (a.e.length < evMax) a.e = a.e.concat(id);
      else {
        if (ev.panel) ev.panel.status.textContent = 'Можно отметить не больше ' + evMax + ' фрагментов. Снимите лишний.';
        return;
      }
      onChanged();
    }

    api.closeEvidence = function () {
      if (ev && ev.panel) ev.panel.node.remove();
      if (ev) ev.panel = null;
      if (group.open === api) group.open = null;
      api.paint();
    };

    api.paint = function () {
      var a = answers[row.id];
      card.classList.toggle('is-filled', R.rowIsComplete(row, a));
      choice.paint(row.multi ? (a.m || []) : a.c);
      if (follow) {
        follow.wrap.hidden = !R.needsFollowUp(row, a);
        follow.group.paint(a.f);
      }
      if (ev) {
        var open = group.open === api;
        card.classList.toggle('is-active', open);
        ev.btn.textContent = open ? 'Свернуть текст' : (a.e.length ? 'Изменить доказательство (' + a.e.length + ' из ' + evMax + ')' : 'Отметить в тексте');
        ev.btn.setAttribute('aria-expanded', String(open));
        ev.list.textContent = '';
        a.e.forEach(function (id) { ev.list.appendChild(el('span', 'nrm-ev__tag', quote(fragmentText(task, id)))); });
        if (ev.panel) {
          Object.keys(ev.panel.fragments).forEach(function (id) {
            var on = a.e.indexOf(id) !== -1;
            ev.panel.fragments[id].classList.toggle('is-ev', on);
            ev.panel.fragments[id].setAttribute('aria-pressed', String(on));
          });
          ev.panel.status.textContent = 'Отмечено: ' + a.e.length + ' из ' + evMax + '.';
        }
      }
    };
    return api;
  }

  /**
   * Разделы строк: смысловые блоки со счётчиком заполнения.
   * Возвращает { nodes: [section…], paint() }.
   */
  function rowSections(task, sections, answers, onChanged) {
    var editors = {};
    var blocks = sections.map(function (section) {
      var block = el('section', 'nrm-block');
      var head = el('div', 'nrm-block__head');
      head.appendChild(el('h3', 'nrm-block__title', section.title));
      var count = el('span', 'nrm-block__count');
      head.appendChild(count);
      block.appendChild(head);
      if (section.hint) block.appendChild(el('p', 'nrm-block__hint', section.hint));
      var list = el('div', 'nrm-rows');
      section.rows.forEach(function (row) {
        editors[row.id] = rowEditor(task, row, answers, onChanged);
        list.appendChild(editors[row.id].card);
      });
      block.appendChild(list);
      return { node: block, section: section, count: count };
    });
    return {
      nodes: blocks.map(function (b) { return b.node; }),
      paint: function () {
        blocks.forEach(function (b) {
          var done = 0;
          b.section.rows.forEach(function (row) {
            editors[row.id].paint();
            if (R.rowIsComplete(row, answers[row.id])) done++;
          });
          b.count.textContent = done + ' из ' + b.section.rows.length;
          b.count.classList.toggle('is-done', done === b.section.rows.length);
        });
      }
    };
  }

  /** Разделы строк в разборе: блоки с баллами и карточками строк. */
  function reviewSections(task, sections, answers, details) {
    return sections.map(function (section) {
      var block = el('section', 'nrm-block');
      var head = el('div', 'nrm-block__head');
      head.appendChild(el('h3', 'nrm-block__title', section.title));
      if (details) {
        var earned = 0;
        var max = 0;
        section.rows.forEach(function (row) {
          var d = details[row.id];
          earned += d.choicePoints + (d.evidencePoints || 0);
          max += 1 + (row.evidence ? 1 : 0);
        });
        head.appendChild(el('span', 'nrm-block__count' + (earned >= max ? ' is-done' : ''), fmt(earned) + ' из ' + max));
      }
      block.appendChild(head);
      var list = el('div', 'nrm-rows');
      section.rows.forEach(function (row) {
        list.appendChild(rowReview(task, row, answers && answers[row.id], details && details[row.id]));
      });
      block.appendChild(list);
      return block;
    });
  }

  /** Копия ответов строк с пустыми значениями для отсутствующих. */
  function copyRows(sections, answers) {
    var base = {};
    R.rowsOf(sections).forEach(function (row) {
      var a = answers && answers[row.id];
      base[row.id] = a ? { c: a.c === undefined ? null : a.c, f: (a.f || []).slice(), e: (a.e || []).slice() } : R.emptyRow();
      if (row.multi) base[row.id].m = a && a.m ? a.m.slice() : [];
    });
    return base;
  }

  ui.nrm = {
    COMPONENT_TITLES: COMPONENT_TITLES,
    el: el,
    fmt: fmt,
    quote: quote,
    shortLabel: shortLabel,
    anchorId: anchorId,
    demoNotice: demoNotice,
    more: more,
    statusBadge: statusBadge,
    answerLine: answerLine,
    renderLegal: renderLegal,
    fragmentText: fragmentText,
    taskLegal: taskLegal,
    rowContext: rowContext,
    definitionsBlock: definitionsBlock,
    situationBlock: situationBlock,
    layout: layout,
    contextButton: contextButton,
    chipGroup: chipGroup,
    displayOrder: displayOrder,
    keyText: keyText,
    chosenText: chosenText,
    choiceReason: choiceReason,
    rowReview: rowReview,
    summary: summary,
    rowMistakes: rowMistakes,
    fillBar: fillBar,
    rowEditor: rowEditor,
    rowSections: rowSections,
    reviewSections: reviewSections,
    copyRows: copyRows
  };
})(typeof window !== 'undefined' ? window : globalThis);
