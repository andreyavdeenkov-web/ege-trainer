/**
 * Диагностика по теме: что получается, что стоит повторить, куда двигаться дальше.
 *
 * Этап 1 — только чистые функции над ответами, ключами и разметкой темы
 * (data/diagnostics/*.js). Баллы и обратная связь не меняются: их по-прежнему
 * считают js/scoring.js и js/attempt.js. Интерфейса здесь нет.
 *
 * Главные принципы (подробно — docs/diagnostics.md):
 *  - выводы делаются только из наблюдений: ответ, ключ, разметка позиции;
 *  - коды описывают, что произошло в ответе, а не предполагаемую причину;
 *  - освоение подтверждается только независимыми наблюдениями: повтор знакомого
 *    задания, верный ответ после разбора ошибки и почти тождественные формулировки
 *    (семейства) уверенность не повышают;
 *  - нормативные идеалы подтверждают знание ценностных ориентаций, а не практики;
 *  - контекстные индикаторы говорят о применении к ситуации, а не о знании типа;
 *  - пороги экспериментальные (THRESHOLDS) и должны проверяться на данных учеников.
 *
 * Файл работает и в браузере, и в Node.js (для тестов). Подключается после
 * js/registry.js и js/scoring.js, файлы разметки — после него.
 */
(function (root) {
  'use strict';

  var EGE = root.EGE || (root.EGE = {});

  /* ---------- Справочники ---------- */

  var TYPES = ['T', 'I', 'P'];
  var SPHERES = ['E', 'S', 'P', 'D', 'N'];
  var TYPE_RU = { T: 'традиционное', I: 'индустриальное', P: 'постиндустриальное' };
  var TYPE_GEN = { T: 'традиционного', I: 'индустриального', P: 'постиндустриального' };
  var SPHERE_RU = { E: 'экономика', S: 'социальная структура', P: 'политическая жизнь', D: 'духовная жизнь', N: 'отношение к природе' };
  var TYPE_OF_OPTION = { 'традиционное': 'T', 'индустриальное': 'I', 'постиндустриальное': 'P' };
  var PAIR = { IT: 'Т/И', TI: 'Т/И', IP: 'И/П', PI: 'И/П', TP: 'Т/П', PT: 'Т/П' };
  var PAIR_TYPES = { 'Т/И': 'TI', 'И/П': 'IP', 'Т/П': 'TP' };
  var NATURE_RU = { s: 'устойчивый признак', t: 'историческая тенденция', n: 'нормативный идеал', d: 'дискуссионная характеристика' };

  /** Пороги статусов — экспериментальные, для пилота. Проверяются на данных учеников. */
  var THRESHOLDS = {
    minFamilies: 3,        // «предварительно»: не меньше семейств формулировок…
    minTasks: 2,           // …в стольких разных заданиях
    oneErrorFrom: 5,       // одна ошибка допустима, если семейств не меньше этого
    stableFamilies: 4,     // «устойчиво»: семейств
    stableTasks: 4,        // «устойчиво»: заданий
    stableSessions: 2,     // «устойчиво»: работ (одна из них итоговая)
    stableOps: 2,          // «устойчиво» для клетки «тип × сфера»: видов операций
    recurringTasks: 2      // «повторяющееся затруднение»: разных заданий с ошибкой в одной работе
  };

  var STATUS = {
    'not-tested': 'не проверяется',
    insufficient: 'недостаточно данных',
    preliminary: 'получается — предварительно',
    stable: 'получается устойчиво',
    recurring: 'повторяющееся затруднение'
  };

  /**
   * Коды ошибок. text — как ошибка описывается в отчёте (наблюдаемое), без вывода о причине.
   * НЕКЛ не должен встречаться: проверка темы это гарантирует.
   */
  var CODES = {
    'НЕУЗН': { title: 'Признак не узнан', text: 'признак не выбран, исключён как лишний или не отнесён к своему типу' },
    'Т/И': { title: 'Традиционное или индустриальное', text: 'признак одного из этих типов отнесён к другому' },
    'И/П': { title: 'Индустриальное или постиндустриальное', text: 'признак одного из этих типов отнесён к другому' },
    'Т/П': { title: 'Традиционное или постиндустриальное', text: 'признак одного из этих типов отнесён к другому' },
    'ПОНЯТ': { title: 'Пара понятий', text: 'признак, связанный с одним понятием пары, отнесён так, как относят другое' },
    'УНИВ': { title: 'Признак любого общества', text: 'характеристика, присущая обществу любого типа, отнесена к признакам конкретного типа' },
    'ФОРМ': { title: 'Абсолютная формулировка', text: 'принято суждение с абсолютной формулировкой («полный отказ», «обязательно», «исключает»)' },
    'ПРИЧ': { title: 'Причинная связь', text: 'принято суждение с неверной причинной связью' },
    'ПЕР': { title: 'Направление изменения', text: 'принято неверное направление изменения при переходе между типами' },
    'СФЕРА': { title: 'Сфера', text: 'выбран признак нужного типа из сферы, не указанной в условии' },
    'КОНТ': { title: 'Применение к ситуации', text: 'элемент ситуации отнесён к искомому типу неверно; о знании типа это не говорит' },
    'НЕКЛ': { title: 'Не классифицировано', text: 'разметки недостаточно' }
  };

  /* ---------- Регистрация разметки ---------- */

  var topics = {};
  var topicByTask = {};

  var POSITION_RE = /^([TIPUX])\.([ESPDN])\.([a-z-]+)((?:[@!+][a-zA-Z=-]+)*)$/;

  /** Разбор записи позиции «ТИП.СФЕРА.понятие[модификаторы]» (порядок модификаторов любой). */
  function parsePosition(token) {
    var m = POSITION_RE.exec(token);
    if (!m) throw new Error('Диагностика: неверная запись позиции «' + token + '»');
    var r = {
      type: m[1], sphere: m[2], concept: m[3], claim: null, nature: 's',
      abs: false, cause: false, trans: false, fact: false, ctx: false, inst: false, conc: null
    };
    (m[4].match(/[@!+][^@!+]+/g) || []).forEach(function (mod) {
      var v = mod.slice(1);
      if (mod[0] === '@') {
        if (TYPES.indexOf(v) === -1) throw new Error('Диагностика: «' + token + '» — неизвестный тип ' + v);
        r.claim = v;
      } else if (mod[0] === '!') {
        if (!NATURE_RU[v]) throw new Error('Диагностика: «' + token + '» — неизвестный характер ' + v);
        r.nature = v;
      } else if (v.indexOf('conc=') === 0) {
        r.conc = v.slice(5);
      } else if (['abs', 'cause', 'trans', 'fact', 'ctx', 'inst'].indexOf(v) !== -1) {
        r[v] = true;
      } else {
        throw new Error('Диагностика: «' + token + '» — неизвестный модификатор ' + v);
      }
    });
    return r;
  }

  /**
   * Регистрирует разметку темы. spec: { topicId, practicumIds, concepts, blocks, conceptPairs, tasks, families }.
   * Позиции разбираются сразу, чтобы ошибка записи обнаруживалась при загрузке.
   */
  function registerTopic(spec) {
    var familyOf = {};
    Object.keys(spec.families || {}).forEach(function (fid) {
      spec.families[fid].members.forEach(function (key) {
        if (familyOf[key]) throw new Error('Диагностика: позиция ' + key + ' в двух семействах');
        familyOf[key] = fid;
      });
    });
    var tasks = {};
    Object.keys(spec.tasks).forEach(function (taskId) {
      var t = spec.tasks[taskId];
      tasks[taskId] = {
        op: t.op, target: t.target || null, scope: t.scope || null, trans: !!t.trans,
        pos: t.pos.map(function (token, i) {
          var p = parsePosition(token);
          p.token = token;
          p.family = familyOf[taskId + '/' + i] || (taskId + '/' + i);
          p.block = (spec.blocks && spec.blocks[p.concept]) || p.concept;
          return p;
        })
      };
      topicByTask[taskId] = spec.topicId;
    });
    topics[spec.topicId] = {
      topicId: spec.topicId, practicumIds: spec.practicumIds.slice(), concepts: spec.concepts || {},
      blocks: spec.blocks || {}, conceptPairs: spec.conceptPairs || {}, families: spec.families || {}, tasks: tasks
    };
  }

  function getTopic(topicId) { return topics[topicId] || null; }

  /** Разметка задания или null, если задание не размечено. */
  function taskMarkup(taskId) {
    var topicId = topicByTask[taskId];
    return topicId ? topics[topicId].tasks[taskId] : null;
  }

  /* ---------- Ключ и подписи ---------- */

  function scoring() { return EGE.scoring; }

  /**
   * Подпись «ответ по ключу» для позиции. В данных statement.correct — «позиция входит в ключ»;
   * в задании «исключение двух» ключ — выпадающие позиции.
   */
  function keyLabel(task, index) {
    if (task.items) return task.options[task.items[index].match - 1];
    var inKey = !!task.statements[index].correct;
    if (scoring().getTaskType(task) === 'exclude-two') return inKey ? 'выпадает из общего ряда' : 'не выпадает из общего ряда';
    return inKey ? 'в ответе' : 'не в ответе';
  }

  /** Должна ли позиция задания с выбором относиться к типу, о котором спрашивают (входить в ряд или в ответ). */
  function isMember(mk, p) {
    if (p.type === 'X' || p.claim) return false;
    if (mk.target) return p.type === mk.target;
    return p.type !== 'X';
  }

  /** Сверка разметки темы с ключами и между собой. Возвращает список расхождений (пустой — всё согласовано). */
  function checkTopic(topicId) {
    var topic = topics[topicId];
    var problems = [];
    if (!topic) return ['Нет разметки темы ' + topicId];
    topic.practicumIds.forEach(function (pid) {
      var practicum = EGE.getPracticum(pid);
      if (!practicum) { problems.push('Нет практикума ' + pid); return; }
      practicum.taskIds.forEach(function (taskId) {
        var task = EGE.getTask(taskId);
        var mk = topic.tasks[taskId];
        if (!mk) { problems.push(taskId + ': нет разметки'); return; }
        var n = (task.items || task.statements).length;
        if (mk.pos.length !== n) { problems.push(taskId + ': позиций в разметке ' + mk.pos.length + ', в задании ' + n); return; }
        if (task.items) {
          task.items.forEach(function (item, i) {
            var t = TYPE_OF_OPTION[task.options[item.match - 1]];
            if (mk.pos[i].ctx) problems.push(taskId + ' ' + scoring().letter(i + 1) + ': контекстный индикатор в соответствии');
            if (mk.pos[i].type !== t) problems.push(taskId + ' ' + scoring().letter(i + 1) + ': разметка ' + mk.pos[i].type + ', ключ ' + t);
          });
          return;
        }
        var excl = scoring().getTaskType(task) === 'exclude-two';
        if (excl && !mk.target) problems.push(taskId + ': у задания на исключение нет типа ряда');
        task.statements.forEach(function (st, i) {
          var member = isMember(mk, mk.pos[i]);
          var keyMember = excl ? !st.correct : !!st.correct;
          if (member !== keyMember) problems.push(taskId + ' поз. ' + (i + 1) + ': разметка «' + (member ? 'входит' : 'не входит') + '», ключ — наоборот');
        });
      });
    });
    Object.keys(topic.families).forEach(function (fid) {
      var members = topic.families[fid].members.map(function (key) {
        var parts = key.split('/');
        var mk = topic.tasks[parts[0]];
        var p = mk && mk.pos[Number(parts[1])];
        if (!p) problems.push('Семейство ' + fid + ': нет позиции ' + key);
        return p;
      }).filter(Boolean);
      if (members.length < 2) problems.push('Семейство ' + fid + ': меньше двух позиций');
      members.forEach(function (p) {
        if (p.concept !== topic.families[fid].concept) problems.push('Семейство ' + fid + ': понятие ' + p.concept + ' вместо ' + topic.families[fid].concept);
        if (p.type !== members[0].type || p.nature !== members[0].nature) problems.push('Семейство ' + fid + ': разные тип или категория');
      });
    });
    Object.keys(topic.tasks).forEach(function (taskId) {
      topic.tasks[taskId].pos.forEach(function (p) {
        if (!topic.concepts[p.concept]) problems.push(taskId + ': понятие ' + p.concept + ' не описано в карте темы');
        if (p.conc && !topic.conceptPairs[p.conc]) problems.push(taskId + ': пара понятий ' + p.conc + ' не описана');
      });
    });
    return problems;
  }

  /* ---------- Наблюдения по позициям ---------- */

  /** Основной и дополнительные коды ошибки, аспекты. */
  function classify(mk, p, claimType, outcome, chosenType) {
    var secondary = [];
    var primary;
    if (p.ctx) {
      primary = 'КОНТ';
    } else if (outcome === 'rejected') {
      primary = 'НЕУЗН';
    } else {
      var other = outcome === 'mismatch' ? chosenType : p.type;
      var base = outcome === 'mismatch' ? p.type : claimType;
      var pair = (base && other && base !== other && PAIR[base + other]) || null;
      if (p.type === 'U') primary = 'УНИВ';
      else if (p.conc) { primary = 'ПОНЯТ'; if (pair) secondary.push(pair); }
      else if (pair) primary = pair;
      else if (p.type === 'X') primary = p.abs ? 'ФОРМ' : p.cause ? 'ПРИЧ' : p.trans ? 'ПЕР' : 'НЕКЛ';
      else if (mk.scope && mk.scope.indexOf(p.sphere) === -1) primary = 'СФЕРА';
      else primary = 'НЕКЛ';
      if (p.abs && primary !== 'ФОРМ') secondary.push('ФОРМ');
      if (p.cause && primary !== 'ПРИЧ') secondary.push('ПРИЧ');
    }
    var facets = [];
    if (p.fact) facets.push('ФАКТ');
    if ((p.trans || mk.trans) && primary !== 'ПЕР') facets.push('ПЕР');
    if (mk.op === 'A') facets.push('СИТ');
    if (p.nature === 'd') facets.push('ДИСК');
    return { primary: primary, secondary: secondary, facets: facets };
  }

  function baseObservation(task, mk, p, i) {
    return {
      taskId: task.id, index: i, label: task.items ? scoring().letter(i + 1) : String(i + 1),
      op: mk.op, target: mk.target, scope: mk.scope, taskTrans: mk.trans,
      type: p.type, sphere: p.sphere, concept: p.concept, block: p.block, family: p.family, claim: p.claim,
      nature: p.nature, ctx: p.ctx, inst: p.inst, fact: p.fact, abs: p.abs, cause: p.cause, trans: p.trans, conc: p.conc
    };
  }

  /**
   * Наблюдения одного ответа: по одному на позицию.
   * selected — как в попытке: номера выбранных вариантов или номера по строкам А–Д (null — пусто).
   * evidence: 'recognition' — нужно узнать признак типа; 'rejection' — нужно отклонить ошибочное
   * приписывание признака (contrast — какая пара типов при этом проверялась).
   */
  function observeTask(task, selected) {
    var mk = taskMarkup(task.id);
    if (!mk) return [];
    selected = selected || [];
    if (task.items) {
      return task.items.map(function (item, i) {
        var p = mk.pos[i];
        var chosen = selected[i] == null ? null : Number(selected[i]);
        var ok = chosen === item.match;
        var chosenType = chosen == null ? null : TYPE_OF_OPTION[task.options[chosen - 1]] || null;
        var o = baseObservation(task, mk, p, i);
        o.outcome = ok ? 'ok' : chosen == null ? 'rejected' : 'mismatch';
        o.chosenType = chosenType;
        o.claimType = null;
        o.evidence = 'recognition';
        o.contrast = null;
        o.codes = ok ? null : classify(mk, p, null, o.outcome, chosenType);
        return o;
      });
    }
    var excl = scoring().getTaskType(task) === 'exclude-two';
    var chosenSet = {};
    selected.forEach(function (n) { chosenSet[Number(n)] = true; });
    return task.statements.map(function (st, i) {
      var p = mk.pos[i];
      var chosen = !!chosenSet[i + 1];
      var outcome;
      if (excl) outcome = st.correct ? (chosen ? 'ok' : 'accepted') : (chosen ? 'rejected' : 'ok');
      else outcome = st.correct ? (chosen ? 'ok' : 'rejected') : (chosen ? 'accepted' : 'ok');
      var claimType = p.claim || mk.target;
      var member = isMember(mk, p);
      var o = baseObservation(task, mk, p, i);
      o.outcome = outcome;
      o.chosenType = null;
      o.claimType = claimType;
      o.evidence = member ? 'recognition' : 'rejection';
      o.contrast = !member && claimType && TYPES.indexOf(p.type) !== -1 && p.type !== claimType ? PAIR[claimType + p.type] : null;
      o.codes = outcome === 'ok' ? null : classify(mk, p, claimType, outcome, null);
      return o;
    });
  }

  /**
   * Наблюдения нескольких работ в порядке прохождения.
   * sessions: [{ practicumId, kind?: 'training'|'final', answers: { taskId: selected } }].
   * familiar — задание уже было в одной из прошлых работ (повтор): идёт только в прогресс.
   * afterCorrection — тренировка: раньше в той же работе была ошибка по тому же блоку понятий,
   * и ученик видел её разбор; верный ответ после этого не подтверждает освоение.
   */
  function collect(sessions) {
    var seen = {};
    var all = [];
    sessions.forEach(function (s, si) {
      var practicum = EGE.getPracticum(s.practicumId);
      if (!practicum) throw new Error('Диагностика: нет практикума ' + s.practicumId);
      var kind = s.kind || practicum.kind || 'training';
      var corrected = {};
      practicum.taskIds.forEach(function (taskId) {
        var task = EGE.getTask(taskId);
        var answers = s.answers || {};
        var sel = answers[taskId] !== undefined ? answers[taskId] : (task.items ? task.items.map(function () { return null; }) : []);
        var obs = observeTask(task, sel);
        obs.forEach(function (o) {
          o.session = si;
          o.practicumId = practicum.id;
          o.kind = kind;
          o.familiar = !!seen[taskId];
          o.afterCorrection = kind === 'training' && o.outcome === 'ok' && !!corrected[o.block];
          all.push(o);
        });
        if (kind === 'training') {
          obs.forEach(function (o) { if (o.outcome !== 'ok') corrected[o.block] = true; });
        }
      });
      practicum.taskIds.forEach(function (taskId) { seen[taskId] = true; });
    });
    return all;
  }

  /* ---------- Элементы карты и покрытие ---------- */

  /**
   * Элементы, к которым относится наблюдение.
   * cell:T.E — клетка «тип × сфера» (устойчивые признаки и тенденции);
   * norm:T — ценностные ориентации и идеалы типа (наблюдения !n);
   * skill:* — умения. Контекстный индикатор не попадает в клетки.
   */
  function elementsOf(o) {
    var els = [];
    if (TYPES.indexOf(o.type) !== -1 && !o.ctx) els.push(o.nature === 'n' ? 'norm:' + o.type : 'cell:' + o.type + '.' + o.sphere);
    if (o.op === 'A') els.push('skill:СИТ');
    if (o.type === 'U') els.push('skill:УНИВ');
    if (o.abs || o.cause) els.push('skill:ФОРМ');
    if (o.trans || o.taskTrans) els.push('skill:ПЕР');
    return els;
  }

  var CELLS = [];
  SPHERES.forEach(function (s) { TYPES.forEach(function (t) { CELLS.push('cell:' + t + '.' + s); }); });
  var NORMS = TYPES.map(function (t) { return 'norm:' + t; });
  var SKILLS = ['skill:ПЕР', 'skill:УНИВ', 'skill:СИТ', 'skill:ФОРМ'];
  var ELEMENTS = CELLS.concat(NORMS, SKILLS);
  var SKILL_RU = {
    'skill:ПЕР': 'переходы между типами', 'skill:УНИВ': 'универсальный или специфический признак',
    'skill:СИТ': 'применение к ситуации', 'skill:ФОРМ': 'точность формулировок'
  };

  function elementTitle(e) {
    if (e.indexOf('cell:') === 0) {
      var ts = e.slice(5).split('.');
      return TYPE_RU[ts[0]] + ' · ' + SPHERE_RU[ts[1]];
    }
    if (e.indexOf('norm:') === 0) return 'ценностные ориентации и идеалы ' + TYPE_GEN[e.slice(5)] + ' общества';
    return SKILL_RU[e];
  }

  /** Сколько позиций темы относится к каждому элементу (по ответу, совпадающему с ключом). */
  function coverage(topicId) {
    var topic = topics[topicId];
    var cov = {};
    Object.keys(topic.tasks).forEach(function (taskId) {
      var task = EGE.getTask(taskId);
      observeTask(task, scoring().getCorrect(task)).forEach(function (o) {
        elementsOf(o).forEach(function (e) { cov[e] = (cov[e] || 0) + 1; });
      });
    });
    return cov;
  }

  /* ---------- Статусы ---------- */

  function uniq(list) {
    var seen = {};
    return list.filter(function (x) { if (seen[x]) return false; seen[x] = true; return true; });
  }
  function count(list, fn) {
    var c = {};
    list.forEach(function (x) { var k = fn(x); if (k != null) c[k] = (c[k] || 0) + 1; });
    return c;
  }

  /** Учитываемое наблюдение: не повтор знакомого задания и не дискуссионная позиция. */
  function countable(o) { return !o.familiar && o.nature !== 'd'; }

  /**
   * Статус элемента. Проверки по порядку: не проверяется → повторяющееся затруднение →
   * недостаточно данных (мало независимых наблюдений / результаты неоднородны) → устойчиво → предварительно.
   */
  function statusOf(element, obs, cov) {
    if (!cov[element]) return { element: element, status: 'not-tested' };
    var th = THRESHOLDS;
    var mine = obs.filter(function (o) { return elementsOf(o).indexOf(element) !== -1; });
    var counted = mine.filter(countable);
    var errors = counted.filter(function (o) { return o.outcome !== 'ok'; });
    var successes = counted.filter(function (o) { return o.outcome === 'ok' && !o.afterCorrection; });
    var lastSession = counted.length ? Math.max.apply(null, counted.map(function (o) { return o.session; })) : -1;

    var errTasksBySession = {};
    errors.forEach(function (o) { (errTasksBySession[o.session] = errTasksBySession[o.session] || {})[o.taskId] = true; });
    var errSessions = Object.keys(errTasksBySession).map(Number);
    var inOne = errSessions.some(function (si) { return Object.keys(errTasksBySession[si]).length >= th.recurringTasks; });
    var consecutive = errSessions.some(function (si) { return !!errTasksBySession[si + 1]; });
    if ((inOne || consecutive) && errTasksBySession[lastSession]) {
      return {
        element: element, status: 'recurring', errors: errors.length,
        tasks: uniq(errors.map(function (o) { return o.taskId; })),
        sameFamily: uniq(errors.map(function (o) { return o.family; })).length === 1
      };
    }

    var evid = successes.concat(errors);
    var families = uniq(evid.map(function (o) { return o.family; }));
    var tasks = uniq(evid.map(function (o) { return o.taskId; }));
    var ops = uniq(evid.map(function (o) { return o.op; }));
    var facts = {
      element: element, positions: evid.length, families: families.length, tasks: tasks.length, errors: errors.length,
      ops: ops.sort().join(''),
      byNature: count(evid, function (o) { return o.nature; }),
      evidence: {
        recognition: successes.filter(function (o) { return o.evidence === 'recognition'; }).length,
        rejection: successes.filter(function (o) { return o.evidence === 'rejection'; }).length,
        contrasts: count(successes, function (o) { return o.contrast; }),
        manifestations: successes.filter(function (o) { return o.inst; }).length
      },
      familiar: mine.filter(function (o) { return o.familiar; }).length,
      afterCorrection: mine.filter(function (o) { return o.afterCorrection; }).length,
      debatable: mine.filter(function (o) { return o.nature === 'd'; }).length
    };
    if (families.length < th.minFamilies || tasks.length < th.minTasks) {
      facts.status = 'insufficient'; facts.note = 'мало независимых наблюдений'; return facts;
    }
    if (errors.length > (families.length >= th.oneErrorFrom ? 1 : 0)) {
      facts.status = 'insufficient'; facts.note = 'результаты неоднородны'; return facts;
    }
    var isCell = element.indexOf('cell:') === 0;
    var sessions = uniq(evid.map(function (o) { return o.session; }));
    var hasFinal = evid.some(function (o) { return o.kind === 'final'; });
    var errorInLast = errors.some(function (o) { return o.session === lastSession; });
    var stableFamiliesS = uniq(successes.filter(function (o) { return o.nature === 's'; }).map(function (o) { return o.family; })).length;
    var stable = sessions.length >= th.stableSessions && hasFinal && !errorInLast &&
      families.length >= th.stableFamilies && tasks.length >= th.stableTasks &&
      (!isCell || (ops.length >= th.stableOps && stableFamiliesS >= 1));
    facts.status = stable ? 'stable' : 'preliminary';
    return facts;
  }

  /* ---------- Ошибки, «Что стоит повторить», маршрут ---------- */

  /** Ключ группы ошибок: код + сфера (пары типов), клетка (НЕУЗН), пара понятий (ПОНЯТ) или код. */
  function groupKey(o) {
    var c = o.codes.primary;
    if (c === 'НЕУЗН') return 'НЕУЗН:' + o.type + '.' + o.sphere;
    if (c === 'ПОНЯТ') return 'ПОНЯТ:' + o.conc;
    if (PAIR_TYPES[c]) return c + ':' + o.sphere;
    return c;
  }

  /** Все группы ошибок (для разбора): recurring — в ≥2 заданиях последней работы; observed; debatable; familiar. */
  function errorGroups(obs) {
    var groups = {};
    var order = [];
    obs.filter(function (o) { return o.outcome !== 'ok'; }).forEach(function (o) {
      var key = groupKey(o);
      if (!groups[key]) { groups[key] = []; order.push(key); }
      groups[key].push(o);
    });
    var lastSession = obs.length ? Math.max.apply(null, obs.map(function (o) { return o.session; })) : 0;
    return order.map(function (key) {
      var list = groups[key];
      var counted = list.filter(countable);
      var inLast = uniq(counted.filter(function (o) { return o.session === lastSession; }).map(function (o) { return o.taskId; }));
      var level = inLast.length >= THRESHOLDS.recurringTasks ? 'recurring'
        : counted.length ? 'observed'
          : list.some(function (o) { return o.nature === 'd'; }) ? 'debatable' : 'familiar';
      return { key: key, level: level, tasks: uniq(list.map(function (o) { return o.taskId; })), positions: list.length, list: list };
    }).sort(function (a, b) {
      return (a.level === 'recurring' ? 0 : 1) - (b.level === 'recurring' ? 0 : 1) || b.tasks.length - a.tasks.length || b.positions - a.positions;
    });
  }

  function recurringBy(errs, keyFn) {
    var m = {};
    var order = [];
    errs.forEach(function (o) {
      var k = keyFn(o);
      if (k == null) return;
      if (!m[k]) { m[k] = []; order.push(k); }
      m[k].push(o);
    });
    return order.filter(function (k) {
      var bySession = {};
      m[k].forEach(function (o) { (bySession[o.session] = bySession[o.session] || {})[o.taskId] = true; });
      return Object.keys(bySession).some(function (si) { return Object.keys(bySession[si]).length >= THRESHOLDS.recurringTasks; });
    }).map(function (k) {
      return { key: k, list: m[k], tasks: uniq(m[k].map(function (o) { return o.taskId; })) };
    });
  }

  function containsAll(list, sub) {
    return sub.every(function (o) { return list.indexOf(o) !== -1; });
  }

  /**
   * «Что стоит повторить»: группы ошибок и понятия с ошибками в ≥2 разных заданиях одной работы.
   * Понятие добавляется отдельно, только если его ошибки не вошли целиком в одну группу.
   * Контекстные индикаторы дают только группу КОНТ (применение к ситуации), без пунктов о понятиях.
   */
  function repeatItems(obs) {
    var errs = obs.filter(function (o) { return o.outcome !== 'ok' && countable(o); });
    var groups = recurringBy(errs, groupKey);
    var concepts = recurringBy(errs, function (o) { return o.ctx ? null : o.concept; });
    var items = groups.map(function (g) {
      var top = concepts.filter(function (c) { return containsAll(g.list, c.list); })
        .sort(function (a, b) { return b.tasks.length - a.tasks.length; })[0];
      return { kind: 'group', key: g.key, code: g.list[0].codes.primary, tasks: g.tasks, positions: g.list.length,
        mainConcept: top ? top.key : null, list: g.list };
    });
    concepts.forEach(function (c) {
      var covered = items.some(function (it) { return containsAll(it.list, c.list); });
      if (!covered) items.push({ kind: 'concept', key: c.key, code: null, tasks: c.tasks, positions: c.list.length, mainConcept: c.key, list: c.list });
    });
    items.forEach(function (it) {
      it.sameFamily = uniq(it.list.map(function (o) { return o.family; })).length === 1;
      if (it.key === 'КОНТ') {
        // Типы, о которых были задания-ситуации, и есть ли в этой же работе ошибки по типовым признакам этих типов.
        var targets = uniq(it.list.map(function (o) { return o.target; }).filter(Boolean));
        var sessionsOf = uniq(it.list.map(function (o) { return o.session; }));
        it.targets = targets;
        it.typeErrorsInTargets = obs.some(function (o) {
          return o.outcome !== 'ok' && !o.ctx && countable(o) && sessionsOf.indexOf(o.session) !== -1 && targets.indexOf(o.type) !== -1;
        });
      }
    });
    return items.sort(function (a, b) {
      return b.tasks.length - a.tasks.length || (a.key === 'КОНТ' ? 1 : 0) - (b.key === 'КОНТ' ? 1 : 0) || b.positions - a.positions;
    });
  }

  /** Задания для тренировки по пункту: ещё не решённые задания темы с позициями той же группы (по разметке). */
  function drillsFor(item, doneTaskIds, topicId) {
    var topic = topics[topicId];
    var done = {};
    (doneTaskIds || []).forEach(function (id) { done[id] = true; });
    var sample = item.list[0];
    var out = [];
    topic.practicumIds.forEach(function (pid) {
      var practicum = EGE.getPracticum(pid);
      practicum.taskIds.forEach(function (taskId, i) {
        if (done[taskId]) return;
        var mk = topic.tasks[taskId];
        var hit = mk.pos.some(function (p) {
          if (item.kind === 'concept') return !p.ctx && p.block === ((topic.blocks[item.key]) || item.key);
          var c = item.code;
          if (c === 'НЕУЗН') return !p.ctx && p.type === sample.type && p.sphere === sample.sphere;
          if (c === 'ПОНЯТ') return p.conc === sample.conc;
          if (PAIR_TYPES[c]) return !p.ctx && PAIR_TYPES[c].indexOf(p.type) !== -1 && p.sphere === sample.sphere && (mk.op === 'M' || PAIR_TYPES[c].indexOf(mk.target || '') !== -1);
          if (c === 'УНИВ') return p.type === 'U';
          if (c === 'КОНТ') return mk.op === 'A';
          return false;
        });
        if (hit) out.push({ practicumId: pid, number: i + 1, taskId: taskId });
      });
    });
    return out;
  }

  /* ---------- Отчёт ---------- */

  /**
   * Диагностический отчёт по работам одной темы.
   * Возвращает данные, а не текст: формулировки для ученика собирает интерфейс (этап 3).
   */
  function buildReport(sessions, options) {
    options = options || {};
    if (!sessions.length) throw new Error('Диагностика: нет работ');
    var topicId = EGE.getPracticum(sessions[0].practicumId).topic;
    var topic = topics[topicId];
    if (!topic) throw new Error('Диагностика: тема ' + topicId + ' не размечена');
    var obs = collect(sessions);
    var cov = coverage(topicId);
    var done = uniq([].concat.apply([], sessions.map(function (s) { return EGE.getPracticum(s.practicumId).taskIds; })));
    var maxDrills = options.maxDrills || 3;
    var familiar = obs.filter(function (o) { return o.familiar; });
    return {
      topicId: topicId,
      observations: obs,
      statuses: ELEMENTS.map(function (e) {
        var st = statusOf(e, obs, cov);
        st.title = elementTitle(e);
        return st;
      }),
      repeat: repeatItems(obs).map(function (it) {
        it.drills = drillsFor(it, done, topicId).slice(0, maxDrills);
        return it;
      }),
      groups: errorGroups(obs),
      familiarProgress: familiar.length ? {
        positions: familiar.length,
        errors: familiar.filter(function (o) { return o.outcome !== 'ok'; }).length
      } : null,
      afterCorrection: obs.filter(function (o) { return o.afterCorrection; }).map(function (o) { return o.taskId + '/' + o.label; })
    };
  }

  EGE.diagnostics = {
    THRESHOLDS: THRESHOLDS,
    STATUS: STATUS,
    CODES: CODES,
    NATURE: NATURE_RU,
    ELEMENTS: ELEMENTS,
    registerTopic: registerTopic,
    getTopic: getTopic,
    taskMarkup: taskMarkup,
    parsePosition: parsePosition,
    keyLabel: keyLabel,
    checkTopic: checkTopic,
    observeTask: observeTask,
    collect: collect,
    elementsOf: elementsOf,
    elementTitle: elementTitle,
    coverage: coverage,
    statusOf: statusOf,
    groupKey: groupKey,
    errorGroups: errorGroups,
    repeatItems: repeatItems,
    drillsFor: drillsFor,
    buildReport: buildReport
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
