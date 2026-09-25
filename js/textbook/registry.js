/**
 * Учебник: каталог и главы. Чистые функции (работают и в Node.js).
 *
 * Каталог (data/textbook/catalog.js) перечисляет разделы курса и главы в них —
 * в том числе ещё не написанные: они показываются как «скоро». Глава
 * (data/textbook/<раздел>/<глава>.js) — это данные: разделы и блоки. Интерфейс
 * о конкретных главах ничего не знает.
 *
 *   TXT.defineCatalog({ areas: [{ id: 'POL', title: 'Политика', color, chapters: [{ id, title }] }] });
 *   TXT.defineChapter({
 *     id: 'power', area: 'POL', title: 'Власть', description: '…', goals: ['…'],
 *     practice: [{ kind: 'olympiad', title, text?, label, href }],
 *     sections: [{ id, title, subtitle?, level?: 'olympiad', progress?: false, blocks: [...] }]
 *   });
 *
 * Ответы ученика хранятся по ключу «раздел/блок» или «раздел/блок/элемент»
 * (см. TXT.key) — поэтому id разделов, блоков и элементов после публикации
 * лучше не менять: сохранённый прогресс на них ссылается.
 */
(function (root) {
  'use strict';

  var TXT = root.TXT || (root.TXT = {});
  var schema = TXT.schema;

  /** Виды практики. Порядок — порядок кнопок на экране итогов, если в главе не задано иное. */
  TXT.PRACTICE_KINDS = {
    ege: 'Практика ЕГЭ',
    olympiad: 'Олимпиадная практика'
  };

  var catalog = null;
  var chaptersById = Object.create(null);
  var entriesById = Object.create(null);

  function isObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function key(sectionId, blockId, itemId) {
    return sectionId + '/' + blockId + (itemId ? '/' + itemId : '');
  }

  TXT.key = key;

  TXT.defineCatalog = function (data) {
    if (catalog) throw new Error('Каталог учебника уже определён');
    if (!isObject(data) || !Array.isArray(data.areas)) throw new Error('Каталог: ожидается { areas: [...] }');
    var areaIds = Object.create(null);
    data.areas.forEach(function (area) {
      if (!/^[A-Z]{3}$/.test(area.id)) throw new Error('Каталог: некорректный id раздела ' + area.id);
      if (areaIds[area.id]) throw new Error('Каталог: повторяющийся раздел ' + area.id);
      areaIds[area.id] = true;
      if (!area.title) throw new Error('Каталог: у раздела ' + area.id + ' нет названия');
      (area.chapters || []).forEach(function (entry) {
        if (!schema.ID_PATTERN.test(entry.id)) throw new Error('Каталог: некорректный id главы ' + entry.id);
        if (entriesById[entry.id]) throw new Error('Каталог: повторяющаяся глава ' + entry.id);
        if (!entry.title) throw new Error('Каталог: у главы ' + entry.id + ' нет названия');
        entriesById[entry.id] = { area: area, entry: entry };
      });
    });
    catalog = data;
  };

  /**
   * Проверяет главу целиком; возвращает список ошибок (пустой — всё в порядке).
   * Кроме полей блоков проверяет уникальность id и ссылки на разделы.
   */
  TXT.validateChapter = function (chapter) {
    var errors = [];
    var v = schema.makeChecker(errors, 'chapter');
    if (!v.fields(chapter, ['id', 'area', 'title', 'description', 'goals', 'practice', 'sections'])) return errors;
    v.id(chapter, 'id');
    v.label(chapter, 'title');
    v.text(chapter, 'description');
    v.strings(chapter, 'goals', 1, { optional: true });

    var found = entriesById[chapter.id];
    if (!catalog) v.error(null, 'сначала нужно подключить каталог (data/textbook/catalog.js)');
    else if (!found) v.error('id', 'главы ' + chapter.id + ' нет в каталоге');
    else if (found.area.id !== chapter.area) v.error('area', 'в каталоге глава относится к разделу ' + found.area.id);

    v.list(chapter, 'practice', 1).forEach(function (p, i) {
      var pv = v.at('practice').at(i);
      if (!pv.fields(p, ['kind', 'title', 'text', 'label', 'href'])) return;
      pv.oneOf(p, 'kind', Object.keys(TXT.PRACTICE_KINDS));
      pv.label(p, 'title');
      pv.text(p, 'text', { optional: true });
      pv.label(p, 'label');
      // Только относительные ссылки на страницы платформы.
      if (typeof p.href !== 'string' || !/^[a-z0-9-]+\.html(#\/[^\s]*)?$/.test(p.href)) {
        pv.error('href', 'ожидается ссылка на страницу платформы, например olympiad.html#/hp/POL/POL-POW');
      }
    });

    var sections = v.list(chapter, 'sections', 1);
    var sectionIds = Object.create(null);
    var refs = [];
    var hasFinal = false;
    var needsFinal = [];

    sections.forEach(function (section, i) {
      var sv = v.at('sections').at(i);
      if (!sv.fields(section, ['id', 'title', 'subtitle', 'level', 'progress', 'blocks'])) return;
      sv.id(section, 'id');
      if (sectionIds[section.id]) sv.error('id', 'повторяющийся id раздела ' + section.id);
      sectionIds[section.id] = true;
      sv.label(section, 'title');
      sv.text(section, 'subtitle', { optional: true });
      sv.oneOf(section, 'level', ['olympiad'], { optional: true });
      sv.bool(section, 'progress');

      var blockIds = Object.create(null);
      sv.list(section, 'blocks', 1).forEach(function (block, j) {
        var prefix = 'chapter.sections[' + i + '].blocks[' + j + ']';
        schema.validateBlock(block, prefix).forEach(function (e) { errors.push(e); });
        if (!isObject(block)) return;
        if (typeof block.id === 'string') {
          if (blockIds[block.id]) errors.push(prefix + '.id: повторяющийся id блока ' + block.id + ' в разделе');
          blockIds[block.id] = true;
        }
        var def = schema.get(block.type);
        if (!def) return;
        def.refs(block).forEach(function (ref) { refs.push({ ref: ref, where: prefix }); });
        if (block.type === 'quiz' && block.mode === 'final') {
          if (hasFinal) errors.push(prefix + ': в главе может быть только одна финальная проверка');
          hasFinal = true;
        }
        if (block.type === 'summary') needsFinal.push(prefix);
      });
    });

    refs.forEach(function (r) {
      if (!sectionIds[r.ref]) errors.push(r.where + ': ссылка на несуществующий раздел ' + r.ref);
    });
    needsFinal.forEach(function (where) {
      if (!hasFinal) errors.push(where + ': блоку summary нужна финальная проверка (quiz с mode: "final")');
    });
    if (sections.length && !sections.some(function (s) { return s && s.progress !== false && s.level !== 'olympiad'; })) {
      v.error('sections', 'нет ни одного раздела, который учитывается в прогрессе');
    }
    return errors;
  };

  TXT.defineChapter = function (chapter) {
    var errors = TXT.validateChapter(chapter);
    if (errors.length) {
      throw new Error('Глава ' + (chapter && chapter.id) + ' содержит ошибки:\n  ' + errors.join('\n  '));
    }
    if (chaptersById[chapter.id]) throw new Error('Глава уже определена: ' + chapter.id);
    chaptersById[chapter.id] = chapter;
  };

  TXT.getCatalog = function () {
    return catalog ? catalog.areas : [];
  };

  TXT.getChapter = function (id) {
    return chaptersById[id] || null;
  };

  /** Раздел каталога, к которому относится глава. */
  TXT.getArea = function (chapterId) {
    var found = entriesById[chapterId];
    return found ? found.area : null;
  };

  TXT.getSection = function (chapter, sectionId) {
    for (var i = 0; i < chapter.sections.length; i++) {
      if (chapter.sections[i].id === sectionId) return chapter.sections[i];
    }
    return null;
  };

  TXT.sectionIndex = function (chapter, sectionId) {
    for (var i = 0; i < chapter.sections.length; i++) {
      if (chapter.sections[i].id === sectionId) return i;
    }
    return -1;
  };

  /** Раздел учитывается в основном прогрессе: не олимпиадный и не служебный (итоги). */
  TXT.isCoreSection = function (section) {
    return section.progress !== false && section.level !== 'olympiad';
  };

  /**
   * Элементы раздела, требующие ответа: [{ key, graded, block, itemId }].
   * Раздел засчитывается, когда на все они есть ответ (см. js/textbook/progress.js).
   */
  TXT.sectionKeys = function (section) {
    var result = [];
    section.blocks.forEach(function (block) {
      var def = schema.get(block.type);
      def.keys(block).forEach(function (itemId) {
        result.push({ key: key(section.id, block.id, itemId), graded: def.graded, block: block, itemId: itemId });
      });
    });
    return result;
  };

  /** Финальная проверка главы: { section, block } или null. */
  TXT.findFinalQuiz = function (chapter) {
    for (var i = 0; i < chapter.sections.length; i++) {
      var blocks = chapter.sections[i].blocks;
      for (var j = 0; j < blocks.length; j++) {
        if (blocks[j].type === 'quiz' && blocks[j].mode === 'final') {
          return { section: chapter.sections[i], block: blocks[j] };
        }
      }
    }
    return null;
  };
})(typeof window !== 'undefined' ? window : globalThis);
