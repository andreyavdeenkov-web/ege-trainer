/**
 * Учебник, интерфейс: помощники DOM. Функции вызываются только при отрисовке,
 * поэтому файл можно загрузить и в Node.js (для тестов реестра блоков).
 */
(function (root) {
  'use strict';

  var TXT = root.TXT || (root.TXT = {});
  var ui = TXT.ui || (TXT.ui = {});

  var counter = 0;

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function uid(prefix) {
    counter += 1;
    return (prefix || 'tb') + '-' + counter;
  }

  function button(className, text, onClick) {
    var b = el('button', className, text);
    b.type = 'button';
    if (onClick) b.addEventListener('click', onClick);
    return b;
  }

  /** Термин: слово-кнопка, пояснение раскрывается рядом, в строке. */
  function term(token) {
    var wrap = el('span', 'tb-term-wrap');
    var id = uid('gloss');
    var btn = button('tb-term', token.text);
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-controls', id);
    var gloss = el('span', 'tb-gloss', token.gloss);
    gloss.id = id;
    gloss.hidden = true;
    btn.addEventListener('click', function () {
      var open = gloss.hidden;
      gloss.hidden = !open;
      btn.setAttribute('aria-expanded', String(open));
    });
    wrap.appendChild(btn);
    wrap.appendChild(gloss);
    return wrap;
  }

  /** Добавляет в node текст с разметкой (**выделение**, [[термин|пояснение]]). */
  function appendRich(node, source) {
    TXT.inline.parse(source).tokens.forEach(function (t) {
      if (t.type === 'strong') node.appendChild(el('strong', 'tb-key', t.text));
      else if (t.type === 'term') node.appendChild(term(t));
      else node.appendChild(document.createTextNode(t.text));
    });
    return node;
  }

  function rich(tag, className, source) {
    return appendRich(el(tag, className), source);
  }

  /** Абзацы: строка или массив строк. */
  function paras(container, source, className) {
    (Array.isArray(source) ? source : [source]).forEach(function (p) {
      container.appendChild(rich('p', className || null, p));
    });
    return container;
  }

  /** Подпись над интерактивным заданием («Ваша версия», «Проверьте себя»…). */
  function taskLabel(text) {
    return el('p', 'tb-task__label', text);
  }

  /** Число с существительным: plural(3, ['раздел', 'раздела', 'разделов']). */
  function plural(n, forms) {
    var mod10 = n % 10;
    var mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return forms[0];
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms[1];
    return forms[2];
  }

  /** Переводит фокус на элемент без прокрутки рывком (для экранных дикторов и клавиатуры). */
  function focus(node) {
    if (!node) return;
    if (!node.hasAttribute('tabindex')) node.setAttribute('tabindex', '-1');
    try { node.focus({ preventScroll: true }); } catch (e) { node.focus(); }
  }

  ui.dom = {
    el: el,
    uid: uid,
    button: button,
    rich: rich,
    appendRich: appendRich,
    paras: paras,
    taskLabel: taskLabel,
    plural: plural,
    focus: focus
  };
})(typeof window !== 'undefined' ? window : globalThis);
