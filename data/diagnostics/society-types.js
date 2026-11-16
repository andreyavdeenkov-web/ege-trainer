/**
 * Диагностическая разметка темы «Типы обществ» (OBS-TYP): три практикума, 55 заданий, 302 позиции.
 *
 * Разметка согласована содержательно (версии 1–4 проверки) и не влияет на баллы:
 * оценивание и обратная связь остаются в js/scoring.js и js/attempt.js.
 * Модуль, который её читает, — js/diagnostics.js; формат и правила — docs/diagnostics.md.
 *
 * Задание: op — операция (R — распознавание, M — сопоставление, A — применение к ситуации);
 *   target — тип общества, о котором задание (нет у суждений о разных типах и у соответствий);
 *   scope — сферы, которыми ограничено условие; trans — задание о переходе между типами.
 * Позиция (вариант ответа или строка соответствия, по порядку): «ТИП.СФЕРА.понятие[модификаторы]».
 *   ТИП: T, I, P — тип, к которому признак относится; U — признак любого общества;
 *        X — не признак типа (ошибка формулировки, направления; у контекстного индикатора — тип не определяется).
 *   СФЕРА: E — экономика, S — социальная структура, P — политическая жизнь, D — духовная жизнь, N — отношение к природе.
 *   !t — историческая тенденция, !n — нормативный идеал, !d — дискуссионная характеристика (по умолчанию — устойчивый признак);
 *   @T/@I/@P — неверное суждение приписывает признак этому типу;
 *   +fact — фактор производства или ведущая сфера; +abs — абсолютная формулировка; +cause — ложная причинность;
 *   +trans — направление изменения; +conc=<пара> — названная пара смешиваемых понятий;
 *   +ctx — контекстно зависимый индикатор (значение задаёт условие задания);
 *   +inst — конкретное проявление тенденции, а не её общая формулировка.
 * Семейства — почти тождественные формулировки одной смысловой силы; для подтверждения освоения
 *   семейство считается одним наблюдением. Позиция вне семейства — отдельное семейство.
 */
(function (root) {
  'use strict';
  var EGE = root.EGE || (root.EGE = {});
  if (!EGE.diagnostics) throw new Error('data/diagnostics/society-types.js подключается после js/diagnostics.js');

  EGE.diagnostics.registerTopic({
    topicId: 'OBS-TYP',
    practicumIds: ['OBS-TYP-P01', 'OBS-TYP-P02', 'OBS-TYP-F01'],

    /** Понятия карты темы. */
    concepts: {
      agrarian: 'аграрная экономика',
      barter: 'натуральный обмен',
      capital: 'капитал как фактор',
      community: 'общинные связи',
      'consumption-standards': 'стандарты потребления',
      customs: 'обычаи и традиции',
      democratization: 'демократизация',
      dependence: 'зависимость от природы',
      despotism: 'деспотия',
      digital: 'цифровые технологии',
      'equal-opportunity': 'равные возможности',
      estates: 'сословия, статус по рождению',
      extensive: 'преобладание экстенсивного хозяйства',
      family: 'тип семьи',
      harmony: 'гармония с природой',
      'hereditary-power': 'наследственная власть',
      individualization: 'индивидуализация',
      industry: 'промышленность',
      infrastructure: 'инфраструктура',
      ip: 'интеллектуальная собственность',
      knowledge: 'знания как фактор',
      'labour-division': 'разделение труда',
      land: 'земля как фактор',
      law: 'правовое регулирование',
      legitimacy: 'традиционная легитимность',
      lifelong: 'непрерывное образование',
      literacy: 'грамотность',
      machine: 'машинный труд',
      manual: 'ручной труд',
      market: 'рыночное производство',
      'mass-culture': 'массовая культура',
      'mass-production': 'массовое производство',
      'middle-class': 'средний класс',
      'mixed-types': 'сочетание типов',
      mobility: 'социальная мобильность',
      'national-traditions': 'национальные традиции',
      natural: 'натуральное хозяйство',
      nature: 'природные факторы',
      qualification: 'образование и квалификация',
      religion: 'религия',
      'religious-authority': 'религиозные авторитеты',
      renewal: 'обновление знаний',
      'rule-of-law': 'правовое государство',
      science: 'наукоёмкое производство',
      'science-force': 'наука как непосредственная производительная сила',
      secularization: 'секуляризация',
      services: 'сфера услуг',
      'subject-culture': 'подданническая культура',
      subjugation: 'подчинение природы',
      tradition: 'преемственность традиций',
      unions: 'профсоюзы',
      urbanization: 'урбанизация',
      values: 'ценности',
      'virtual-culture': 'виртуальная культура',
      'working-class': 'рабочий класс'
    },

    /** Блоки понятий: связь для подбора тренировочных заданий и правила «успех после разбора». */
    blocks: { 'science-force': 'science', ip: 'science' },

    /** Названные пары смешиваемых понятий (код ПОНЯТ). */
    conceptPairs: {
      'mass-virtual': 'массовая и виртуальная культура',
      'standard-individual': 'стандартизация и индивидуализация производства',
      'lifelong-tradition': 'непрерывное образование и передача опыта через традиции',
      nature: 'подчинение природы и гармония с природой',
      legitimacy: 'традиционная и демократическая легитимность власти'
    },

    tasks: {
      // ---------- Практикум № 1 ----------
      // № 1
      'OBS-TYP-026': { op: 'R', target: 'I', pos: ['I.E.industry+fact', 'I.S.urbanization!t', 'T.E.natural', 'I.E.machine', 'P.E.services+fact', 'I.S.working-class'] },
      // № 2
      'OBS-TYP-027': { op: 'R', target: 'T', pos: ['I.E.capital+fact', 'T.D.customs', 'I.E.industry+fact', 'T.S.mobility', 'T.E.agrarian'] },
      // № 3
      'OBS-TYP-028': { op: 'R', target: 'I', pos: ['T.D.customs', 'I.S.urbanization!t', 'I.E.mass-production', 'I.E.machine', 'P.E.services+fact+abs'] },
      // № 4
      'OBS-TYP-029': { op: 'R', target: 'P', pos: ['P.E.services+fact', 'P.E.knowledge+fact', 'X.E.industry+abs+trans', 'P.E.science', 'T.S.estates'] },
      // № 5
      'OBS-TYP-030': { op: 'R', target: 'T', scope: 'P', pos: ['T.P.hereditary-power', 'T.P.subject-culture', 'I.P.democratization!t', 'I.P.democratization!t', 'T.P.religious-authority', 'I.P.rule-of-law!t'] },
      // № 6
      'OBS-TYP-031': { op: 'R', target: 'P', scope: 'D', pos: ['X.D.digital+abs', 'P.D.digital', 'P.D.digital', 'P.D.renewal!t', 'X.D.national-traditions+abs'] },
      // № 7
      'OBS-TYP-032': { op: 'A', target: 'P', pos: ['P.E.services+fact', 'I.E.mass-production', 'P.E.science', 'U.P.law', 'X.E.infrastructure+ctx', 'P.E.knowledge+fact'] },
      // № 8
      'OBS-TYP-033': { op: 'A', target: 'T', scope: 'D', pos: ['T.D.tradition', 'T.D.religion', 'X.E.machine+ctx', 'T.D.customs', 'X.E.infrastructure+ctx', 'P.E.science'] },
      // № 9
      'OBS-TYP-034': { op: 'R', target: 'P', pos: ['P.E.knowledge+fact', 'P.E.science', 'T.E.manual', 'P.E.services+fact', 'T.S.estates', 'T.E.natural'] },
      // № 10
      'OBS-TYP-035': { op: 'A', target: 'P', pos: ['U.P.law', 'X.E.extensive+ctx', 'P.E.digital!t+ctx', 'U.P.law', 'P.E.knowledge+fact', 'P.E.science'] },
      // № 11
      'OBS-TYP-036': { op: 'A', target: 'T', pos: ['T.D.customs', 'T.S.estates', 'I.E.mass-production', 'P.E.knowledge+fact', 'I.S.mobility', 'T.E.natural'] },
      // № 12
      'OBS-TYP-037': { op: 'A', target: 'I', trans: true, pos: ['I.E.industry', 'I.S.urbanization!t', 'I.S.working-class', 'T.E.natural', 'T.S.estates', 'X.E.labour-division+trans'] },
      // № 13
      'OBS-TYP-038': { op: 'M', pos: ['T.E.agrarian', 'I.E.machine', 'P.E.knowledge+fact', 'T.S.mobility', 'P.E.services+fact'] },
      // № 14
      'OBS-TYP-039': { op: 'M', pos: ['P.E.science-force!t', 'I.E.mass-production', 'T.D.customs', 'T.E.manual', 'P.E.services+fact'] },
      // № 15
      'OBS-TYP-040': { op: 'A', pos: ['T.E.agrarian', 'T.S.estates', 'P.E.knowledge', 'I.E.mass-production', 'P.E.science'] },

      // ---------- Практикум № 2 ----------
      // № 1
      'OBS-TYP-041': { op: 'R', target: 'P', pos: ['P.E.knowledge+fact', 'P.E.science', 'T.E.natural', 'P.E.services+fact', 'T.S.estates', 'P.S.lifelong!t'] },
      // № 2
      'OBS-TYP-042': { op: 'R', target: 'T', pos: ['T.E.natural', 'T.D.religion', 'I.E.mass-production', 'T.D.customs', 'P.E.services+fact'] },
      // № 3
      'OBS-TYP-043': { op: 'R', target: 'I', pos: ['T.S.estates', 'T.E.natural', 'I.S.urbanization!t', 'I.S.working-class', 'I.E.machine'] },
      // № 4
      'OBS-TYP-044': { op: 'R', target: 'P', pos: ['T.E.agrarian', 'P.D.digital', 'P.S.lifelong!t', 'P.E.science', 'T.S.estates'] },
      // № 5
      'OBS-TYP-045': { op: 'R', target: 'I', scope: 'S', pos: ['I.S.working-class', 'I.S.unions', 'T.S.estates', 'I.S.qualification', 'T.S.community', 'P.E.services+fact'] },
      // № 6
      'OBS-TYP-046': { op: 'R', target: 'P', scope: 'E', pos: ['P.E.science', 'T.E.barter', 'P.E.ip', 'P.E.science', 'T.E.manual', 'I.E.mass-production'] },
      // № 7
      'OBS-TYP-047': { op: 'A', target: 'T', pos: ['T.S.estates', 'I.S.mobility', 'P.E.services+fact', 'P.D.digital', 'T.S.estates', 'T.D.religion'] },
      // № 8
      'OBS-TYP-048': { op: 'A', target: 'P', pos: ['P.E.science', 'P.E.services+fact', 'U.N.nature', 'U.P.law', 'P.E.science', 'T.E.extensive'] },
      // № 9
      'OBS-TYP-049': { op: 'R', target: 'T', pos: ['T.E.manual', 'T.D.customs', 'I.E.mass-production', 'T.S.mobility', 'P.E.digital', 'P.E.services+fact'] },
      // № 10
      'OBS-TYP-050': { op: 'A', target: 'I', scope: 'PD', trans: true, pos: ['I.D.mass-culture', 'T.P.estates', 'I.P.democratization!t', 'T.P.legitimacy', 'I.D.secularization!t', 'T.D.customs'] },
      // № 11
      'OBS-TYP-051': { op: 'A', target: 'P', trans: true, pos: ['P.S.qualification!t', 'P.S.qualification!t', 'P.S.lifelong!t', 'T.E.natural', 'X.S.qualification+trans', 'T.S.estates'] },
      // № 12
      'OBS-TYP-052': { op: 'A', target: 'T', pos: ['I.S.mobility', 'T.S.estates', 'T.D.religion', 'T.S.mobility', 'I.E.machine', 'P.E.knowledge+fact'] },
      // № 13
      'OBS-TYP-053': { op: 'M', pos: ['T.E.natural', 'I.E.mass-production', 'P.E.knowledge+fact', 'T.S.estates', 'I.S.working-class'] },
      // № 14
      'OBS-TYP-054': { op: 'M', pos: ['P.E.services+fact', 'I.S.unions', 'T.D.religion', 'P.E.science', 'T.S.estates'] },
      // № 15
      'OBS-TYP-055': { op: 'M', pos: ['T.D.values!n', 'I.E.machine', 'P.E.science', 'T.D.customs', 'P.E.knowledge+fact'] },

      // ---------- Итоговый практикум ----------
      // № 1
      'OBS-TYP-001': { op: 'R', target: 'T', pos: ['T.E.manual', 'I.S.middle-class', 'T.S.estates', 'I.P.democratization!n', 'T.D.religion', 'T.E.natural'] },
      // № 2
      'OBS-TYP-002': { op: 'R', target: 'P', pos: ['P.D.values!n', 'P.E.science', 'P.D.virtual-culture', 'T.P.subject-culture', 'P.N.harmony!n', 'T.D.religion'] },
      // № 3
      'OBS-TYP-003': { op: 'R', target: 'I', pos: ['I.S.middle-class', 'T.S.mobility', 'I.D.values!n', 'I.D.mass-culture', 'I.S.family!t', 'P.D.virtual-culture+conc=mass-virtual'] },
      // № 4
      'OBS-TYP-004': { op: 'R', target: 'T', scope: 'S', pos: ['T.S.estates', 'I.S.middle-class', 'T.S.mobility', 'T.S.family', 'I.S.family!t', 'T.S.community'] },
      // № 5
      'OBS-TYP-005': { op: 'R', target: 'P', pos: ['T.E.natural', 'P.E.knowledge+fact', 'P.S.lifelong', 'P.S.equal-opportunity!n', 'I.E.industry+fact', 'P.D.digital'] },
      // № 6
      'OBS-TYP-006': { op: 'R', target: 'I', pos: ['I.E.capital+fact', 'I.N.subjugation', 'P.E.services+fact', 'I.E.mass-production', 'I.E.machine+trans', 'P.E.individualization!t+conc=standard-individual'] },
      // № 7
      'OBS-TYP-007': { op: 'M', pos: ['T.E.natural', 'I.E.capital+fact', 'T.S.estates', 'I.D.mass-culture', 'I.D.values!n'] },
      // № 8
      'OBS-TYP-008': { op: 'M', pos: ['P.E.science', 'T.P.legitimacy', 'P.S.lifelong', 'T.D.literacy', 'T.E.land+fact'] },
      // № 9
      'OBS-TYP-009': { op: 'M', pos: ['P.E.services+fact', 'P.E.knowledge+fact', 'I.E.mass-production', 'P.E.individualization!t+conc=standard-individual', 'I.E.consumption-standards'] },
      // № 10
      'OBS-TYP-010': { op: 'M', pos: ['P.N.harmony!n', 'I.N.subjugation', 'T.N.dependence', 'I.E.capital+fact', 'P.E.knowledge+fact'] },
      // № 11
      'OBS-TYP-011': { op: 'M', pos: ['P.D.virtual-culture', 'T.D.values!n', 'I.D.mass-culture+trans+conc=mass-virtual', 'P.D.values!n', 'T.D.religion'] },
      // № 12
      'OBS-TYP-012': { op: 'M', pos: ['I.P.democratization!t', 'T.P.subject-culture', 'I.P.rule-of-law!n', 'T.P.despotism', 'I.P.democratization!n'] },
      // № 13
      'OBS-TYP-013': { op: 'M', pos: ['T.S.estates', 'P.S.equal-opportunity!n', 'I.S.mobility!t+trans', 'T.S.family', 'I.S.family!t'] },
      // № 14
      'OBS-TYP-014': { op: 'M', pos: ['I.E.mass-production', 'P.S.lifelong', 'P.D.virtual-culture', 'I.N.subjugation', 'P.N.harmony!t'] },
      // № 15
      'OBS-TYP-015': { op: 'R', pos: ['T.E.land+fact', 'T.E.natural@I', 'P.E.services+fact', 'I.S.mobility@T', 'I.D.mass-culture'] },
      // № 16
      'OBS-TYP-016': { op: 'R', pos: ['T.P.subject-culture', 'T.D.customs@P+conc=lifelong-tradition', 'P.D.values!n', 'I.P.democratization!t', 'T.P.legitimacy'] },
      // № 17
      'OBS-TYP-017': { op: 'R', pos: ['X.S.estates+cause', 'T.S.community', 'I.S.middle-class', 'T.S.family@I', 'P.S.equal-opportunity!n'] },
      // № 18
      'OBS-TYP-018': { op: 'R', pos: ['I.N.subjugation', 'T.E.extensive', 'I.E.capital+fact@P', 'I.E.market', 'I.E.machine'] },
      // № 19
      'OBS-TYP-019': { op: 'R', pos: ['X.E.industry+abs+trans', 'P.E.individualization!t', 'P.N.harmony@I!n+cause', 'P.E.knowledge+fact', 'I.E.consumption-standards'] },
      // № 20
      'OBS-TYP-020': { op: 'R', pos: ['U.S.mixed-types+trans', 'X.P.legitimacy+conc=legitimacy', 'P.E.knowledge+fact@I', 'I.D.mass-culture+trans', 'T.N.dependence@P+conc=nature'] },
      // № 21
      'OBS-TYP-021': { op: 'A', target: 'T', pos: ['T.S.estates', 'T.E.manual', 'I.S.middle-class', 'T.D.religion', 'I.D.mass-culture', 'I.P.democratization!n'] },
      // № 22
      'OBS-TYP-022': { op: 'A', target: 'I', pos: ['I.E.mass-production', 'P.E.individualization!t+conc=standard-individual+inst', 'I.E.capital+fact', 'P.E.services+fact', 'I.S.mobility!t', 'I.D.mass-culture'] },
      // № 23
      'OBS-TYP-023': { op: 'A', target: 'P', pos: ['P.E.science', 'I.E.mass-production', 'P.S.lifelong', 'T.E.extensive', 'I.N.subjugation+conc=nature', 'P.N.harmony!n'] },
      // № 24
      'OBS-TYP-024': { op: 'A', target: 'P', pos: ['I.E.industry+fact', 'P.E.knowledge+fact', 'T.E.manual', 'I.N.subjugation+conc=nature', 'P.D.values!n', 'T.E.land+fact'] },
      // № 25
      'OBS-TYP-025': { op: 'M', pos: ['T.E.natural', 'I.E.industry+fact', 'P.E.services+fact', 'I.D.mass-culture', 'T.E.manual'] }
    },

    families: {
      'С01': { concept: 'agrarian', members: ['OBS-TYP-027/4', 'OBS-TYP-038/0', 'OBS-TYP-044/0'] },
      'С02': { concept: 'capital', members: ['OBS-TYP-027/0', 'OBS-TYP-006/0', 'OBS-TYP-007/1', 'OBS-TYP-010/3', 'OBS-TYP-018/2', 'OBS-TYP-022/2'] },
      'С03': { concept: 'consumption-standards', members: ['OBS-TYP-009/4', 'OBS-TYP-019/4'] },
      'С04': { concept: 'customs', members: ['OBS-TYP-027/1', 'OBS-TYP-036/0'] },
      'С05': { concept: 'customs', members: ['OBS-TYP-028/0', 'OBS-TYP-039/2', 'OBS-TYP-042/3', 'OBS-TYP-055/3'] },
      'С06': { concept: 'democratization', members: ['OBS-TYP-012/0', 'OBS-TYP-016/3'] },
      'С07': { concept: 'democratization', members: ['OBS-TYP-001/3', 'OBS-TYP-012/4', 'OBS-TYP-021/5'] },
      'С08': { concept: 'equal-opportunity', members: ['OBS-TYP-005/3', 'OBS-TYP-013/1', 'OBS-TYP-017/4'] },
      'С09': { concept: 'estates', strength: 'во многом', members: ['OBS-TYP-036/1', 'OBS-TYP-040/1', 'OBS-TYP-047/4'] },
      'С10': { concept: 'estates', members: ['OBS-TYP-029/4', 'OBS-TYP-044/4', 'OBS-TYP-052/1'] },
      'С11': { concept: 'estates', members: ['OBS-TYP-041/4', 'OBS-TYP-054/4'] },
      'С12': { concept: 'estates', members: ['OBS-TYP-043/0', 'OBS-TYP-047/0', 'OBS-TYP-053/3', 'OBS-TYP-001/2', 'OBS-TYP-007/2', 'OBS-TYP-013/0'] },
      'С13': { concept: 'family', members: ['OBS-TYP-003/4', 'OBS-TYP-013/4'] },
      'С14': { concept: 'family', members: ['OBS-TYP-004/3', 'OBS-TYP-013/3', 'OBS-TYP-017/3'] },
      'С15': { concept: 'harmony', members: ['OBS-TYP-002/4', 'OBS-TYP-010/0'] },
      'С16': { concept: 'individualization', members: ['OBS-TYP-006/5', 'OBS-TYP-009/3', 'OBS-TYP-019/1', 'OBS-TYP-022/1'] },
      'С17': { concept: 'industry', members: ['OBS-TYP-026/0', 'OBS-TYP-027/2'] },
      'С18': { concept: 'knowledge', strength: 'рост роли', members: ['OBS-TYP-029/1', 'OBS-TYP-032/5', 'OBS-TYP-034/0', 'OBS-TYP-035/4', 'OBS-TYP-038/2', 'OBS-TYP-041/0'] },
      'С19': { concept: 'knowledge', members: ['OBS-TYP-052/5', 'OBS-TYP-053/2', 'OBS-TYP-005/1', 'OBS-TYP-009/1', 'OBS-TYP-010/4', 'OBS-TYP-019/3', 'OBS-TYP-020/2', 'OBS-TYP-024/1'] },
      'С20': { concept: 'land', members: ['OBS-TYP-008/4', 'OBS-TYP-015/0'] },
      'С21': { concept: 'lifelong', strength: 'рост значения', members: ['OBS-TYP-041/5', 'OBS-TYP-044/2'] },
      'С22': { concept: 'lifelong', members: ['OBS-TYP-005/2', 'OBS-TYP-008/2'] },
      'С23': { concept: 'machine', members: ['OBS-TYP-038/1', 'OBS-TYP-055/1'] },
      'С24': { concept: 'machine', members: ['OBS-TYP-006/4', 'OBS-TYP-018/4'] },
      'С25': { concept: 'manual', members: ['OBS-TYP-034/2', 'OBS-TYP-039/3', 'OBS-TYP-049/0', 'OBS-TYP-001/0', 'OBS-TYP-021/1', 'OBS-TYP-024/2'] },
      'С26': { concept: 'mass-culture', members: ['OBS-TYP-003/3', 'OBS-TYP-007/3', 'OBS-TYP-011/2', 'OBS-TYP-015/4', 'OBS-TYP-021/4', 'OBS-TYP-022/5'] },
      'С27': { concept: 'mass-production', members: ['OBS-TYP-042/2', 'OBS-TYP-049/2', 'OBS-TYP-053/1', 'OBS-TYP-006/3', 'OBS-TYP-009/2'] },
      'С28': { concept: 'mass-production', members: ['OBS-TYP-014/0', 'OBS-TYP-022/0'] },
      'С29': { concept: 'middle-class', members: ['OBS-TYP-001/1', 'OBS-TYP-003/0', 'OBS-TYP-004/1', 'OBS-TYP-021/2'] },
      'С30': { concept: 'mobility', members: ['OBS-TYP-027/3', 'OBS-TYP-049/3', 'OBS-TYP-052/3'] },
      'С31': { concept: 'mobility', members: ['OBS-TYP-003/1', 'OBS-TYP-004/2'] },
      'С32': { concept: 'mobility', members: ['OBS-TYP-036/4', 'OBS-TYP-047/1', 'OBS-TYP-015/3'] },
      'С33': { concept: 'mobility', members: ['OBS-TYP-013/2', 'OBS-TYP-022/4'] },
      'С34': { concept: 'natural', members: ['OBS-TYP-026/2', 'OBS-TYP-034/5', 'OBS-TYP-041/2', 'OBS-TYP-053/0', 'OBS-TYP-001/5', 'OBS-TYP-005/0', 'OBS-TYP-007/0', 'OBS-TYP-015/1'] },
      'С35': { concept: 'natural', members: ['OBS-TYP-043/1', 'OBS-TYP-025/0'] },
      'С36': { concept: 'religion', members: ['OBS-TYP-042/1', 'OBS-TYP-052/2'] },
      'С37': { concept: 'religion', members: ['OBS-TYP-001/4', 'OBS-TYP-002/5', 'OBS-TYP-011/4', 'OBS-TYP-021/3'] },
      'С38': { concept: 'science', strength: 'преобладание', members: ['OBS-TYP-040/4', 'OBS-TYP-055/2'] },
      'С39': { concept: 'science', members: ['OBS-TYP-029/3', 'OBS-TYP-035/5', 'OBS-TYP-041/1', 'OBS-TYP-048/0', 'OBS-TYP-002/1', 'OBS-TYP-008/0'] },
      'С40': { concept: 'science', members: ['OBS-TYP-034/1', 'OBS-TYP-023/0'] },
      'С41': { concept: 'services', members: ['OBS-TYP-042/4', 'OBS-TYP-045/5', 'OBS-TYP-054/0'] },
      'С42': { concept: 'services', members: ['OBS-TYP-006/2', 'OBS-TYP-009/0', 'OBS-TYP-015/2', 'OBS-TYP-022/3'] },
      'С43': { concept: 'services', members: ['OBS-TYP-026/4', 'OBS-TYP-038/4', 'OBS-TYP-039/4', 'OBS-TYP-041/3', 'OBS-TYP-048/1', 'OBS-TYP-049/5', 'OBS-TYP-025/2'] },
      'С44': { concept: 'subject-culture', members: ['OBS-TYP-002/3', 'OBS-TYP-012/1', 'OBS-TYP-016/0'] },
      'С45': { concept: 'subjugation', members: ['OBS-TYP-006/1', 'OBS-TYP-010/1', 'OBS-TYP-018/0', 'OBS-TYP-023/4'] },
      'С46': { concept: 'values', members: ['OBS-TYP-002/0', 'OBS-TYP-011/3', 'OBS-TYP-016/2', 'OBS-TYP-024/4'] },
      'С47': { concept: 'virtual-culture', members: ['OBS-TYP-002/2', 'OBS-TYP-003/5', 'OBS-TYP-011/0'] },
      'С48': { concept: 'working-class', members: ['OBS-TYP-026/5', 'OBS-TYP-037/2', 'OBS-TYP-043/3', 'OBS-TYP-053/4'] }
    }
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
