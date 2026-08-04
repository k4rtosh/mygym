/**
 * Normalize exercise categories to ~10 roots, fix copy, drop near-dups.
 * Run: node scripts/normalize-exercise-catalog.js
 * Regenerates data/exercises.json + supabase/seed_exercises.sql
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const jsonPath = path.join(root, 'data', 'exercises.json');
const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

/** Drop near-duplicates — keep older/canonical ids. */
const DROP_IDS = new Set([
  'arms_20', // ≡ arms_7 Французский жим лёжа
  'core_14', // ≡ core_9 Мёртвый жук / Dead bug
  'back_32' // ≡ back_10 тяга за голову (осторожно) — note folded into back_10
]);

function rootCategory(raw) {
  const c = String(raw || '').trim();
  if (!c) return 'Прочее';
  const primary = c.split('/')[0].trim();
  const lower = primary.toLowerCase();

  if (lower.startsWith('груд')) return 'Грудные';
  if (lower.startsWith('спин')) return 'Спина';
  if (lower.startsWith('ног') || lower.includes('ягодиц') || lower.includes('квадр') || lower.includes('икр')) {
    return 'Ноги';
  }
  if (lower.startsWith('плеч') || lower.includes('дельт')) return 'Плечи';
  if (lower.startsWith('бицеп')) return 'Бицепс';
  if (lower.startsWith('трицеп')) return 'Трицепс';
  if (lower.startsWith('трапец')) return 'Трапеции';
  if (lower.startsWith('предплеч')) return 'Предплечья';
  if (lower.startsWith('кор') || lower.startsWith('пресс')) return 'Кор';
  if (lower.startsWith('кардио')) return 'Кардио';
  return primary.split('(')[0].trim() || primary;
}

function accentHint(raw) {
  const m = String(raw || '').match(/\(([^)]+)\)/);
  return m ? m[1].trim() : '';
}

function enrichMuscle(muscle, accent) {
  const m = String(muscle || '').trim();
  if (!accent) return m;
  if (!m) return accent;
  if (m.toLowerCase().includes(accent.toLowerCase())) return m;
  // Don't duplicate noise like "изоляция"
  if (/изоляц|глубокие/i.test(accent) && m.length > 3) return m;
  return `${m}, ${accent}`;
}

const before = data.exercises.length;
data.exercises = data.exercises.filter((ex) => !DROP_IDS.has(ex.id));

let catChanged = 0;
for (const ex of data.exercises) {
  const prev = ex.category;
  const accent = accentHint(prev);
  const next = rootCategory(prev);
  if (next !== prev) {
    ex.category = next;
    ex.muscle = enrichMuscle(ex.muscle, accent);
    catChanged++;
  }

  if (ex.id === 'chest_22' && /Униilateral/i.test(ex.description || '')) {
    ex.description = String(ex.description).replace(/Униilateral/gi, 'Односторонний');
  }
  if (ex.id === 'back_10') {
    ex.description =
      'Вариант тяги верхнего блока за голову. Делай осторожно: комфортная амплитуда, без рывков в плечевом поясе.';
  }
  if (ex.id === 'core_9') {
    ex.name = 'Мёртвый жук (dead bug)';
  }
  if (ex.id === 'cardio_11' && ex.type === 'Кардио') {
    // Farmer walk is loaded carry — keep category Кардио only if it was; prefer free weight type
    ex.type = 'Свободный вес';
    if (!/фарм/i.test(ex.category)) {
      /* category stays Кардио or move? keep Кардио as movement class via... actually category Кардио is fine for picker */
    }
  }
}

// Sort stably by id family then number
data.exercises.sort((a, b) => {
  const pa = String(a.id).split('_');
  const pb = String(b.id).split('_');
  if (pa[0] !== pb[0]) return pa[0] < pb[0] ? -1 : 1;
  return (Number(pa[1]) || 0) - (Number(pb[1]) || 0);
});

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

const cats = {};
for (const ex of data.exercises) cats[ex.category] = (cats[ex.category] || 0) + 1;
console.log(`Removed ${before - data.exercises.length} dups. Categories remapped: ${catChanged}. Total: ${data.exercises.length}`);
console.log('Categories:', Object.keys(cats).sort().join(', '));
console.log(cats);
