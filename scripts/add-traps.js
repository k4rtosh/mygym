/**
 * Append trapezius exercises only (does not remap existing).
 * Run: node scripts/add-traps.js
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const jsonPath = path.join(root, 'data', 'exercises.json');
const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
const existing = new Set(data.exercises.map((e) => e.id));
const existingNames = new Set(data.exercises.map((e) => e.name.toLowerCase()));

const extras = [
  [
    'back_36',
    'Шраги в хаммере',
    'Трапеции',
    'Верх трапеций, леваторы лопатки',
    'Хаммер',
    'Plate-loaded shrug: блины на рогах, стабильная траектория подъёма плеч.'
  ],
  [
    'back_37',
    'Шраги одной рукой в хаммере',
    'Трапеции',
    'Верх трапеций',
    'Хаммер',
    'Унилатеральные plate-loaded шраги — выравнивание сторон.'
  ],
  [
    'back_38',
    'Шраги на нижнем блоке',
    'Трапеции',
    'Верх трапеций',
    'Блочный',
    'Рукоять/гриф на нижнем блоке, подъём плеч. Постоянное натяжение троса.'
  ],
  [
    'back_39',
    'Шраги за спиной со штангой',
    'Трапеции',
    'Верх трапеций',
    'Свободный вес',
    'Штанга за спиной — другой угол нагрузки на верх трапеций.'
  ],
  [
    'back_40',
    'Шраги в тренажёре (стек)',
    'Трапеции',
    'Верх трапеций',
    'Тренажёр',
    'Селекторный shrug machine — удобно для progressive overload.'
  ],
  [
    'back_41',
    'Лопаточные подтягивания (scapular pull-ups)',
    'Трапеции',
    'Низ/середина трапеций, широчайшие',
    'Собственный вес',
    'В висе поднимать тело только сведением лопаток, без сгибания локтей.'
  ],
  [
    'back_42',
    'Шраги с гантелями сидя',
    'Трапеции',
    'Верх трапеций',
    'Свободный вес',
    'Сидя меньше читинга ногами — чистая изоляция трапеций.'
  ],
  [
    'back_43',
    'Тяга к подбородку на блоке',
    'Плечи / Трапеции',
    'Средняя дельта, трапеции',
    'Блочный',
    'Протяжка на нижнем/среднем блоке — контроль и постоянное натяжение.'
  ],
  [
    'back_44',
    'Тяга к лицу с акцентом на трапеции',
    'Трапеции',
    'Середина/верх трапеций, задняя дельта',
    'Блочный',
    'Face pull с внешним вращением — осанка и верх спины / трапеции.'
  ],
  [
    'back_45',
    'Y-подъёмы лёжа (нижние трапеции)',
    'Трапеции',
    'Нижние трапеции',
    'Свободный вес',
    'Лёжа на наклонной, руки в Y — акцент на нижнюю порцию трапеций.'
  ]
];

let added = 0;
for (const row of extras) {
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
console.log(`Added ${added}. Total: ${data.exercises.length}`);
