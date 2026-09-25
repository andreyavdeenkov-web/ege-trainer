/**
 * Учебник: разметка внутри текстов глав. Чистые функции (работают и в Node.js).
 *
 * В данных главы тексты — обычные строки. Допустимы только две конструкции:
 *   **ключевые слова**          — смысловое выделение;
 *   [[термин|пояснение]]        — термин, пояснение раскрывается по нажатию.
 * HTML в текстах не используется: интерфейс строит DOM из токенов, поэтому
 * контент нельзя «сломать» разметкой, а автор главы не думает о вёрстке.
 */
(function (root) {
  'use strict';

  var TXT = root.TXT || (root.TXT = {});

  /**
   * Разбирает строку в токены:
   *   { type: 'text', text } | { type: 'strong', text } | { type: 'term', text, gloss }.
   * Ошибки разметки возвращаются списком (текст при этом всё равно разбирается).
   */
  function parse(source) {
    var s = String(source);
    var tokens = [];
    var errors = [];
    var buf = '';
    var i = 0;

    function flush() {
      if (buf) tokens.push({ type: 'text', text: buf });
      buf = '';
    }

    while (i < s.length) {
      var pair = s.substr(i, 2);
      if (pair === '**') {
        var end = s.indexOf('**', i + 2);
        if (end === -1) {
          errors.push('незакрытое выделение **');
          buf += s.slice(i);
          break;
        }
        var inner = s.slice(i + 2, end);
        if (!inner.trim()) errors.push('пустое выделение ****');
        if (inner.indexOf('[[') !== -1 || inner.indexOf(']]') !== -1) {
          errors.push('термин [[…]] внутри выделения **…**');
        }
        flush();
        tokens.push({ type: 'strong', text: inner });
        i = end + 2;
        continue;
      }
      if (pair === '[[') {
        var close = s.indexOf(']]', i + 2);
        if (close === -1) {
          errors.push('незакрытый термин [[');
          buf += s.slice(i);
          break;
        }
        var body = s.slice(i + 2, close);
        var bar = body.indexOf('|');
        var term = bar === -1 ? body.trim() : body.slice(0, bar).trim();
        var gloss = bar === -1 ? '' : body.slice(bar + 1).trim();
        if (bar === -1) errors.push('у термина «' + term + '» нет пояснения: [[термин|пояснение]]');
        else if (!term || !gloss) errors.push('пустой термин или пояснение в [[' + body + ']]');
        if (body.indexOf('**') !== -1 || body.indexOf('[[') !== -1) {
          errors.push('разметка внутри термина [[' + body + ']]');
        }
        flush();
        tokens.push({ type: 'term', text: term, gloss: gloss });
        i = close + 2;
        continue;
      }
      if (pair === ']]') errors.push('лишние ]]');
      buf += s.charAt(i);
      i += 1;
    }
    flush();
    return { tokens: tokens, errors: errors };
  }

  /** Текст без разметки — для подписей, aria-label и поиска. */
  function plain(source) {
    return parse(source).tokens.map(function (t) { return t.text; }).join('');
  }

  TXT.inline = {
    parse: parse,
    errors: function (source) { return parse(source).errors; },
    plain: plain
  };
})(typeof window !== 'undefined' ? window : globalThis);
