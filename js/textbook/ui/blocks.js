/**
 * Учебник, интерфейс: реестр отрисовки блоков.
 *
 * Данные блока проверяет js/textbook/schema.js, здесь — только вид.
 *   TXT.ui.blocks.register(type, function render(block, ctx) { return node; });
 *
 * ctx — всё, что блоку нужно знать о главе и прогрессе:
 *   chapter, section, block
 *   getAnswer(itemId)             → { value, correct } | null  (itemId '' — ответ на весь блок)
 *   answer(itemId, value, correct) → true, если ответ засчитан впервые
 *   clear(itemIds)                → сбросить ответы (пройти заново)
 *   isOpened(itemId), open(itemId), openedCount() — раскрытые элементы схем и карточек
 *   summary(), report()           → прогресс и итоги главы (js/textbook/progress.js)
 *   sectionTitle(id), sectionHref(id), sectionStatus(id)
 * Блок сам перерисовывает себя; после ответа интерфейс главы обновляет
 * прогресс и оглавление.
 */
(function (root) {
  'use strict';

  var TXT = root.TXT || (root.TXT = {});
  var ui = TXT.ui || (TXT.ui = {});
  var registry = Object.create(null);

  ui.blocks = {
    register: function (type, render) {
      if (registry[type]) throw new Error('Отрисовка блока уже зарегистрирована: ' + type);
      if (typeof render !== 'function') throw new Error('Отрисовка блока ' + type + ': ожидается функция');
      registry[type] = render;
    },
    has: function (type) { return !!registry[type]; },
    render: function (block, ctx) {
      var render = registry[block.type];
      if (!render) throw new Error('Нет отрисовки для блока ' + block.type);
      var node = render(block, ctx);
      node.classList.add('tb-block', 'tb-block--' + block.type);
      return node;
    },
    list: function () { return Object.keys(registry); }
  };
})(typeof window !== 'undefined' ? window : globalThis);
