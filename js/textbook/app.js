/**
 * Учебник: экраны и события. Единственный файл, который работает с DOM при
 * загрузке. О конкретных главах ничего не знает: всё берёт из TXT (данные)
 * и TXT.ui.blocks (отрисовка блоков).
 */
(function () {
  'use strict';

  var TXT = window.TXT;
  var P = TXT.progress;
  var d = TXT.ui.dom;
  var el = d.el;
  var router = TXT.router;

  var SECTION_FORMS = ['раздел', 'раздела', 'разделов'];
  var TASK_FORMS = ['задание', 'задания', 'заданий'];
  var STATUS_LABELS = { done: 'изучен', started: 'начат', 'new': 'не начат' };

  var $ = function (id) { return document.getElementById(id); };

  var ui = {
    screens: { home: $('screen-home'), chapter: $('screen-chapter'), section: $('screen-section') },
    catalog: $('catalog'),
    chapterbar: $('chapterbar'),
    chapterEyebrow: $('chapter-eyebrow'),
    chapterTitle: $('chapter-title'),
    chapterDescription: $('chapter-description'),
    chapterOverview: $('chapter-overview'),
    barTitle: $('chapterbar-title'),
    barProgress: $('chapterbar-progress'),
    barFill: $('chapterbar-fill'),
    tocOpen: $('toc-open'),
    tocAside: $('toc-aside'),
    tocDialog: $('toc-dialog'),
    tocDialogBody: $('toc-dialog-body'),
    tocClose: $('toc-close'),
    sectionHead: $('section-head'),
    sectionEyebrow: $('section-eyebrow'),
    sectionTitle: $('section-title'),
    sectionSubtitle: $('section-subtitle'),
    sectionBlocks: $('section-blocks'),
    sectionFoot: $('section-foot')
  };

  var progress = TXT.progressStorage.load();
  var current = { route: null, chapter: null, section: null };

  /* ---------- Прогресс ---------- */

  function persist(chapterId) {
    TXT.progressStorage.save(progress);
    var store = TXT.progressStore;
    if (store && typeof store.onChange === 'function') {
      try {
        store.onChange(JSON.parse(JSON.stringify(progress)), chapterId);
      } catch (e) {
        if (window.console) console.error('TXT.progressStore.onChange:', e);
      }
    }
  }

  function progressText(sum) {
    return 'Изучено ' + sum.done + ' из ' + sum.total + ' ' + d.plural(sum.total, SECTION_FORMS);
  }

  /* ---------- Навигация ---------- */

  function href(chapterId, sectionId) {
    return router.format(sectionId
      ? { name: 'section', chapter: chapterId, section: sectionId }
      : { name: 'chapter', chapter: chapterId });
  }

  function navigate(hash) {
    if (location.hash === hash) render();
    else location.hash = hash;
  }

  function showScreen(name) {
    Object.keys(ui.screens).forEach(function (key) {
      ui.screens[key].hidden = key !== name;
    });
    document.body.classList.toggle('tb-reading', name === 'section');
    ui.chapterbar.hidden = name !== 'section';
  }

  function render() {
    var route = router.parse(location.hash);
    var chapter = route.chapter ? TXT.getChapter(route.chapter) : null;
    if (route.name === 'unknown' || (route.name !== 'home' && !chapter)) {
      history.replaceState(null, '', '#/');
      route = { name: 'home' };
    }
    if (route.name === 'section' && !TXT.getSection(chapter, route.section)) {
      history.replaceState(null, '', href(chapter.id));
      route = { name: 'chapter', chapter: chapter.id };
    }
    if (ui.tocDialog.open) ui.tocDialog.close();
    current.route = route;
    current.chapter = chapter;
    current.section = route.name === 'section' ? TXT.getSection(chapter, route.section) : null;

    if (route.name === 'home') renderHome();
    else if (route.name === 'chapter') renderChapter(chapter);
    else renderSection(chapter, current.section);
    window.scrollTo(0, 0);
  }

  /* ---------- Каталог ---------- */

  function renderHome() {
    document.title = 'Интерактивный учебник — обществознание';
    ui.catalog.textContent = '';

    // Готовые главы — крупно и первыми; ниже — карта всего курса.
    var featured = el('div', 'tb-featured');
    TXT.getCatalog().forEach(function (area) {
      area.chapters.forEach(function (entry) {
        var chapter = TXT.getChapter(entry.id);
        if (!chapter) return;
        var sum = P.chapterSummary(progress, chapter);
        var card = el('a', 'tb-feature');
        card.href = href(chapter.id);
        card.appendChild(el('span', 'tb-feature__area', area.title + ' · глава'));
        card.appendChild(el('span', 'tb-feature__title', chapter.title));
        card.appendChild(d.rich('span', 'tb-feature__text', chapter.description));
        var foot = el('span', 'tb-feature__foot');
        var track = el('span', 'tb-meter');
        var fill = el('span', 'tb-meter__fill');
        fill.style.width = sum.percent + '%';
        track.appendChild(fill);
        foot.appendChild(track);
        foot.appendChild(el('span', 'tb-feature__meta', sum.started ? progressText(sum) : chapter.sections.length + ' ' + d.plural(chapter.sections.length, SECTION_FORMS)));
        foot.appendChild(el('span', 'tb-feature__cta', sum.started ? 'Продолжить →' : 'Начать →'));
        card.appendChild(foot);
        featured.appendChild(card);
      });
    });
    ui.catalog.appendChild(featured);
    ui.catalog.appendChild(el('h2', 'tb-h2 tb-map-title', 'Карта курса'));

    TXT.getCatalog().forEach(function (area) {
      var box = el('section', 'tb-area');
      if (area.color) box.style.setProperty('--area-color', area.color);
      box.appendChild(el('h2', 'tb-area__title', area.title));
      var list = el('ul', 'tb-chapters');
      area.chapters.forEach(function (entry) {
        var chapter = TXT.getChapter(entry.id);
        var li = el('li');
        if (!chapter) {
          var soon = el('div', 'tb-chapter-link is-soon');
          soon.appendChild(el('span', 'tb-chapter-link__title', entry.title));
          soon.appendChild(el('span', 'tb-chapter-link__meta', 'скоро'));
          li.appendChild(soon);
        } else {
          var sum = P.chapterSummary(progress, chapter);
          var a = el('a', 'tb-chapter-link is-ready');
          a.href = href(chapter.id);
          a.appendChild(el('span', 'tb-chapter-link__title', chapter.title));
          a.appendChild(el('span', 'tb-chapter-link__meta', sum.started ? progressText(sum) : 'Глава готова · ' + chapter.sections.length + ' ' + d.plural(chapter.sections.length, SECTION_FORMS)));
          var track = el('span', 'tb-meter');
          var fill = el('span', 'tb-meter__fill');
          fill.style.width = sum.percent + '%';
          track.appendChild(fill);
          a.appendChild(track);
          li.appendChild(a);
        }
        list.appendChild(li);
      });
      box.appendChild(list);
      ui.catalog.appendChild(box);
    });
    showScreen('home');
  }

  /* ---------- Обзор главы ---------- */

  function tocList(chapter, activeId) {
    var list = el('ol', 'tb-toc');
    chapter.sections.forEach(function (s, i) {
      var status = s.progress === false ? null : P.sectionStatus(progress, chapter, s);
      var li = el('li', 'tb-toc__item' + (status ? ' is-' + status : '') + (s.level === 'olympiad' ? ' is-olympiad' : '') +
        (s.id === activeId ? ' is-active' : ''));
      var a = el('a', 'tb-toc__link');
      a.href = href(chapter.id, s.id);
      if (s.id === activeId) a.setAttribute('aria-current', 'page');
      a.appendChild(el('span', 'tb-toc__mark', status === 'done' ? '✓' : String(i + 1)));
      var text = el('span', 'tb-toc__text');
      text.appendChild(el('span', 'tb-toc__title', s.title));
      if (s.level === 'olympiad') text.appendChild(el('span', 'tb-toc__badge', 'олимпиадный уровень'));
      a.appendChild(text);
      if (status) a.appendChild(el('span', 'visually-hidden', ', ' + STATUS_LABELS[status]));
      li.appendChild(a);
      list.appendChild(li);
    });
    return list;
  }

  function meter(percent) {
    var track = el('div', 'tb-meter tb-meter--lg');
    track.setAttribute('role', 'progressbar');
    track.setAttribute('aria-valuemin', '0');
    track.setAttribute('aria-valuemax', '100');
    track.setAttribute('aria-valuenow', String(percent));
    track.setAttribute('aria-label', 'Прогресс главы');
    var fill = el('span', 'tb-meter__fill');
    fill.style.width = percent + '%';
    track.appendChild(fill);
    return track;
  }

  function renderChapter(chapter) {
    var area = TXT.getArea(chapter.id);
    var sum = P.chapterSummary(progress, chapter);
    document.title = chapter.title + ' — интерактивный учебник';
    ui.chapterEyebrow.textContent = (area ? area.title + ' · ' : '') + 'глава';
    ui.chapterTitle.textContent = chapter.title;
    ui.chapterDescription.textContent = '';
    d.appendRich(ui.chapterDescription, chapter.description);

    var box = ui.chapterOverview;
    box.textContent = '';

    var prog = el('div', 'tb-overview__progress panel');
    var row = el('div', 'tb-overview__row');
    row.appendChild(el('p', 'tb-overview__percent', sum.percent + '%'));
    var texts = el('div');
    texts.appendChild(el('p', 'tb-overview__label', progressText(sum)));
    if (sum.olympiad) {
      texts.appendChild(el('p', 'tb-overview__sub', 'Олимпиадный уровень: ' +
        (sum.olympiad.done === sum.olympiad.total ? 'пройден' : 'не пройден') + ' · в процент не входит'));
    }
    row.appendChild(texts);
    prog.appendChild(row);
    prog.appendChild(meter(sum.percent));
    var next = TXT.getSection(chapter, sum.next);
    var start = el('a', 'btn btn--primary btn--lg btn--block tb-overview__start',
      sum.started ? 'Продолжить: ' + next.title : 'Начать главу');
    start.href = href(chapter.id, sum.started ? next.id : chapter.sections[0].id);
    prog.appendChild(start);
    box.appendChild(prog);

    if (chapter.goals) {
      var goals = el('section', 'tb-overview__goals');
      goals.appendChild(el('h2', 'tb-h2', 'После главы вы сможете'));
      var ul = el('ul', 'tb-goals');
      chapter.goals.forEach(function (g) { ul.appendChild(d.rich('li', null, g)); });
      goals.appendChild(ul);
      box.appendChild(goals);
    }

    var toc = el('section', 'tb-overview__toc');
    toc.appendChild(el('h2', 'tb-h2', 'Разделы'));
    toc.appendChild(tocList(chapter, null));
    box.appendChild(toc);

    if (sum.started) box.appendChild(resetControl(chapter));
    showScreen('chapter');
  }

  /** Сброс прогресса — с подтверждением внутри страницы. */
  function resetControl(chapter) {
    var wrap = el('div', 'tb-reset');
    var ask = d.button('btn btn--ghost btn--sm', 'Сбросить прогресс главы');
    var confirmBox = el('div', 'tb-reset__confirm');
    confirmBox.hidden = true;
    confirmBox.setAttribute('role', 'alertdialog');
    confirmBox.appendChild(el('p', null, 'Удалить все ответы и отметки по главе «' + chapter.title + '»? Это нельзя отменить.'));
    var actions = el('div', 'tb-reset__actions');
    actions.appendChild(d.button('btn btn--ghost btn--sm', 'Отмена', function () {
      confirmBox.hidden = true;
      ask.hidden = false;
      ask.focus();
    }));
    actions.appendChild(d.button('btn btn--primary btn--sm', 'Сбросить', function () {
      P.reset(progress, chapter.id);
      persist(chapter.id);
      renderChapter(chapter);
    }));
    confirmBox.appendChild(actions);
    ask.addEventListener('click', function () {
      ask.hidden = true;
      confirmBox.hidden = false;
      d.focus(confirmBox);
    });
    wrap.appendChild(ask);
    wrap.appendChild(confirmBox);
    return wrap;
  }

  /* ---------- Раздел ---------- */

  function blockContext(chapter, section, block) {
    var blockKey = TXT.key(section.id, block.id);
    function key(itemId) { return TXT.key(section.id, block.id, itemId); }
    return {
      chapter: chapter,
      section: section,
      block: block,
      getAnswer: function (itemId) { return P.getAnswer(progress, chapter.id, key(itemId)); },
      answer: function (itemId, value, correct) {
        var ok = P.setAnswer(progress, chapter.id, key(itemId), value, correct);
        if (ok) { persist(chapter.id); refreshChrome(); }
        return ok;
      },
      clear: function (itemIds) {
        P.clearAnswers(progress, chapter.id, itemIds.map(key));
        persist(chapter.id);
        refreshChrome();
      },
      isOpened: function (itemId) { return P.isOpened(progress, chapter.id, blockKey, itemId); },
      open: function (itemId) {
        if (P.open(progress, chapter.id, blockKey, itemId)) persist(chapter.id);
      },
      openedCount: function () { return P.openedCount(progress, chapter.id, blockKey); },
      summary: function () { return P.chapterSummary(progress, chapter); },
      report: function () { return P.report(progress, chapter); },
      sectionTitle: function (id) { var s = TXT.getSection(chapter, id); return s ? s.title : id; },
      sectionHref: function (id) { return href(chapter.id, id); },
      sectionStatus: function (id) { return P.sectionStatus(progress, chapter, TXT.getSection(chapter, id)); }
    };
  }

  function renderSection(chapter, section) {
    var index = TXT.sectionIndex(chapter, section.id);
    P.visit(progress, chapter.id, section.id);
    persist(chapter.id);

    document.title = section.title + ' — ' + chapter.title + ' — учебник';
    ui.barTitle.textContent = chapter.title;
    ui.barTitle.href = href(chapter.id);

    var olympiad = section.level === 'olympiad';
    ui.sectionHead.classList.toggle('is-olympiad', olympiad);
    ui.sectionEyebrow.textContent = olympiad
      ? 'Глубже · олимпиадный уровень'
      : 'Раздел ' + (index + 1) + ' из ' + chapter.sections.length;
    ui.sectionTitle.textContent = section.title;
    ui.sectionSubtitle.hidden = !section.subtitle;
    ui.sectionSubtitle.textContent = '';
    if (section.subtitle) d.appendRich(ui.sectionSubtitle, section.subtitle);

    var article = ui.sectionBlocks.parentNode;
    article.classList.toggle('is-olympiad', olympiad);
    ui.sectionBlocks.textContent = '';
    section.blocks.forEach(function (block) {
      ui.sectionBlocks.appendChild(TXT.ui.blocks.render(block, blockContext(chapter, section, block)));
    });

    refreshChrome();
    showScreen('section');
    d.focus(ui.sectionTitle);
  }

  /** Прогресс в шапке главы, оглавление и низ раздела — после каждого ответа. */
  function refreshChrome() {
    var chapter = current.chapter;
    var section = current.section;
    if (!chapter || !section) return;
    var sum = P.chapterSummary(progress, chapter);
    ui.barProgress.textContent = sum.done + ' / ' + sum.total;
    ui.barProgress.setAttribute('aria-label', progressText(sum));
    ui.barFill.style.width = sum.percent + '%';

    ui.tocAside.textContent = '';
    ui.tocAside.appendChild(el('p', 'tb-aside__title', chapter.title));
    ui.tocAside.appendChild(el('p', 'tb-aside__progress', progressText(sum) + ' · ' + sum.percent + '%'));
    ui.tocAside.appendChild(tocList(chapter, section.id));
    ui.tocDialogBody.textContent = '';
    ui.tocDialogBody.appendChild(el('p', 'tb-aside__progress', progressText(sum) + ' · ' + sum.percent + '%'));
    ui.tocDialogBody.appendChild(tocList(chapter, section.id));

    renderFoot(chapter, section);
  }

  function renderFoot(chapter, section) {
    var foot = ui.sectionFoot;
    foot.textContent = '';
    var index = TXT.sectionIndex(chapter, section.id);
    var prev = chapter.sections[index - 1];
    var next = chapter.sections[index + 1];

    if (section.progress !== false) {
      var pending = P.pendingCount(progress, chapter, section);
      var status = P.sectionStatus(progress, chapter, section);
      var note = el('p', 'tb-section-foot__note' + (status === 'done' ? ' is-done' : ''));
      note.setAttribute('aria-live', 'polite');
      if (status === 'done') note.textContent = 'Раздел изучен.';
      else if (pending > 0) {
        note.textContent = 'Без ответа: ' + pending + ' ' + d.plural(pending, TASK_FORMS) +
          '. Раздел засчитается, когда вы ответите на все.';
      } else note.textContent = 'Раздел засчитается, когда вы перейдёте дальше.';
      foot.appendChild(note);
    }

    var nav = el('div', 'tb-section-foot__nav');
    if (prev) {
      var back = el('a', 'btn btn--ghost tb-section-foot__prev', '← Назад');
      back.href = href(chapter.id, prev.id);
      back.setAttribute('aria-label', 'Назад: ' + prev.title);
      nav.appendChild(back);
    }
    if (next) {
      var fwd = d.button('btn btn--primary btn--lg tb-section-foot__next', '', function () {
        P.finish(progress, chapter.id, section.id);
        persist(chapter.id);
        navigate(href(chapter.id, next.id));
      });
      fwd.appendChild(el('span', 'tb-section-foot__next-label', 'Дальше'));
      fwd.appendChild(el('span', 'tb-section-foot__next-title', next.title + ' →'));
      nav.appendChild(fwd);
    } else {
      var toc = el('a', 'btn btn--ghost btn--lg', 'К оглавлению главы');
      toc.href = href(chapter.id);
      nav.appendChild(toc);
    }
    foot.appendChild(nav);
  }

  /* ---------- События ---------- */

  ui.tocOpen.addEventListener('click', function () {
    if (typeof ui.tocDialog.showModal === 'function') ui.tocDialog.showModal();
    else ui.tocDialog.setAttribute('open', '');
    var active = ui.tocDialogBody.querySelector('[aria-current="page"]');
    if (active) active.focus();
  });
  ui.tocClose.addEventListener('click', function () { ui.tocDialog.close(); });
  ui.tocDialog.addEventListener('click', function (e) {
    // Щелчок по затемнению или по ссылке (в том числе на текущий раздел) закрывает панель.
    if (e.target === ui.tocDialog || (e.target.closest && e.target.closest('a'))) ui.tocDialog.close();
  });

  window.addEventListener('hashchange', render);
  render();
})();
