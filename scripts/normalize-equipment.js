/**
 * Normalize exercise.type to equipment buckets + add Hammer / plate-loaded variants.
 * Run: node scripts/normalize-equipment.js
 *
 * Buckets: Свободный вес | Блочный | Хаммер | Тренажёр | Собственный вес | Кардио
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const jsonPath = path.join(root, 'data', 'exercises.json');
const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

const EQUIPMENT = [
  'Свободный вес',
  'Блочный',
  'Хаммер',
  'Тренажёр',
  'Собственный вес',
  'Кардио'
];

function textOf(ex) {
  return `${ex.name || ''} ${ex.description || ''} ${ex.category || ''}`.toLowerCase();
}

function inferType(ex) {
  const t = ex.type || '';
  const n = textOf(ex);

  if (t === 'Кардио' || ex.category === 'Кардио') return 'Кардио';

  if (
    /хаммер|hammer\s*strength|plate-loaded|plate loaded|рычажн/.test(n) ||
    t === 'Хаммер'
  ) {
    return 'Хаммер';
  }

  if (
    t === 'С весом тела' ||
    t === 'С собственным весом' ||
    t === 'Собственный вес'
  ) {
    return 'Собственный вес';
  }

  if (t === 'Со свободным весом' || t === 'Свободный вес') {
    return 'Свободный вес';
  }

  if (t === 'Тросовый' || t === 'Блочный') {
    return 'Блочный';
  }

  // Cable / pulley patterns mis-tagged as generic machine
  if (
    /кроссовер|верхн(его|ем)\s+блок|нижн(его|ем)\s+блок|на\s+блок|трос|канатн|cable/.test(n) &&
    !/смит/.test(n)
  ) {
    return 'Блочный';
  }

  // Barbell/dumbbell on Scott etc. mis-tagged as machine
  if (/со штангой|с гантел|гантел/.test(n) && !/тренаж/.test(n.split('(')[0])) {
    if (/скамье\s+скотта|scott/.test(n)) return 'Свободный вес';
  }

  if (t === 'В тренажёре' || t === 'Тренажёр') {
    return 'Тренажёр';
  }

  // Fallback by keywords
  if (/смит|пек-дек|бабочка|гакк|жим ногами|разгибани|сгибани.*ног|подъём.*носк/.test(n)) {
    return 'Тренажёр';
  }
  if (/штан|гантел|свободн/.test(n)) return 'Свободный вес';
  if (/подтягиван|отжиман|планка|вис|собств|вес тела|турник|брусь/.test(n)) {
    return 'Собственный вес';
  }

  return t && EQUIPMENT.includes(t) ? t : 'Тренажёр';
}

let remapped = 0;
for (const ex of data.exercises) {
  const next = inferType(ex);
  if (ex.type !== next) {
    ex.type = next;
    remapped++;
  }
}

// Clean overlapping chest hammer names
const byId = Object.fromEntries(data.exercises.map((e) => [e.id, e]));
if (byId.chest_15) {
  byId.chest_15.name = 'Жим сидя в хаммере (горизонтальный)';
  byId.chest_15.type = 'Хаммер';
  byId.chest_15.description =
    'Plate-loaded / рычажный жим сидя. Блины на рогах, независимые рычаги — стабильная траектория без стека.';
}
if (byId.chest_16) {
  byId.chest_16.name = 'Жим в хаммере под углом вверх';
  byId.chest_16.category = 'Грудные (верх)';
  byId.chest_16.type = 'Хаммер';
  byId.chest_16.muscle = 'Верх груди, трицепс, передняя дельта';
  byId.chest_16.description =
    'Incline plate-loaded press (Hammer Strength и аналоги). Блины, акцент на верх грудных.';
}

const existing = new Set(data.exercises.map((e) => e.id));
const existingNames = new Set(data.exercises.map((e) => e.name.toLowerCase()));

const hammerExtras = [
  [
    'chest_25',
    'Жим в хаммере под углом вниз',
    'Грудные (низ)',
    'Низ груди, трицепс',
    'Хаммер',
    'Decline plate-loaded press. Блины на рогах, акцент на нижнюю порцию грудных.'
  ],
  [
    'chest_26',
    'Жим одной рукой в хаммере',
    'Грудные',
    'Грудь, трицепс, передняя дельта',
    'Хаммер',
    'Унилатеральный plate-loaded жим — выравнивание сторон и контроль.'
  ],
  [
    'back_33',
    'Горизонтальная тяга в хаммере',
    'Спина (толщина)',
    'Широчайшие, середина спины, задние дельты',
    'Хаммер',
    'Plate-loaded seated / chest-supported row. Блины, мощная толщина спины.'
  ],
  [
    'back_34',
    'Вертикальная тяга в хаммере',
    'Спина (ширина)',
    'Широчайшие, бицепс',
    'Хаммер',
    'Plate-loaded lat pulldown / high row. Альтернатива верхнему блоку со стеком.'
  ],
  [
    'back_35',
    'Тяга одной рукой в хаммере',
    'Спина (толщина)',
    'Широчайшие, ромбовидные',
    'Хаммер',
    'Однорычажная plate-loaded тяга — большая амплитуда и баланс сторон.'
  ],
  [
    'shoulders_23',
    'Жим плеч в хаммере',
    'Плечи',
    'Передняя и средняя дельта, трицепс',
    'Хаммер',
    'Plate-loaded shoulder press. Блины, стабильная траектория над головой.'
  ],
  [
    'shoulders_24',
    'Жим плеч одной рукой в хаммере',
    'Плечи',
    'Дельты, трицепс, кор',
    'Хаммер',
    'Унилатеральный plate-loaded жим плеч.'
  ],
  [
    'legs_39',
    'Жим ногами в хаммере (plate-loaded)',
    'Ноги',
    'Квадрицепсы, ягодицы',
    'Хаммер',
    'Рычажный / plate-loaded жим ногами — блины вместо стека, другая кривая сопротивления.'
  ],
  [
    'legs_40',
    'Гакк-приседания plate-loaded',
    'Ноги (квадрицепсы)',
    'Квадрицепсы',
    'Хаммер',
    'Hack squat с блинами на рогах (не селекторный стек).'
  ],
  [
    'arms_27',
    'Сгибания на бицепс в хаммере',
    'Бицепс',
    'Бицепс',
    'Хаммер',
    'Plate-loaded preacher / machine curl с блинами.'
  ],
  [
    'arms_28',
    'Разгибания на трицепс в хаммере',
    'Трицепс',
    'Трицепс',
    'Хаммер',
    'Plate-loaded triceps extension / dip-машины с блинами.'
  ],
  [
    'chest_27',
    'Сведения в plate-loaded «бабочке»',
    'Грудные',
    'Большая грудная',
    'Хаммер',
    'Peck-deck / fly с блинами на рогах — не путать с селекторным стеком.'
  ]
];

let added = 0;
for (const row of hammerExtras) {
  const [id, name, category, muscle, type, description] = row;
  if (existing.has(id)) continue;
  if (existingNames.has(name.toLowerCase())) continue;
  data.exercises.push({ id, name, category, muscle, type, description });
  existing.add(id);
  existingNames.add(name.toLowerCase());
  added++;
}

fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2) + '\n', 'utf8');

function esc(s) {
  return String(s || '').replace(/'/g, "''");
}

const values = data.exercises
  .map(
    (ex) =>
      `  ('${esc(ex.id)}', '${esc(ex.name)}', '${esc(ex.category)}', '${esc(ex.muscle)}', '${esc(ex.type)}', '${esc(ex.description)}')`
  )
  .join(',\n');

const seed = `-- Auto-generated exercise seed (${data.exercises.length} exercises)
INSERT INTO public.exercises (id, name, category, muscle, type, description) VALUES
${values}
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  category = EXCLUDED.category,
  muscle = EXCLUDED.muscle,
  type = EXCLUDED.type,
  description = EXCLUDED.description;
`;

fs.writeFileSync(path.join(root, 'supabase', 'seed_exercises.sql'), seed, 'utf8');

const counts = {};
for (const ex of data.exercises) {
  counts[ex.type] = (counts[ex.type] || 0) + 1;
}
console.log(`Remapped types: ${remapped}. Added hammer: ${added}. Total: ${data.exercises.length}`);
console.log(counts);
