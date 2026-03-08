#!/usr/bin/env node
// Gate 1: Validate customer data against schema before generation
// Usage: node validate-data.js --data data/customer.json

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const dataPath = args.find((a, i) => args[i - 1] === '--data');
if (!dataPath) { console.error('Usage: node validate-data.js --data <data.json>'); process.exit(1); }

const schema = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'schema', 'ff_data_schema.json'), 'utf8'));
const data = JSON.parse(fs.readFileSync(path.resolve(dataPath), 'utf8'));

const errors = [];
const notAvailable = [];
let validCount = 0;

// Check each required field
for (const field of schema.required) {
  const value = field.includes('.') ? getNestedValue(data, field) : data[field];

  if (value === undefined || value === null) {
    errors.push('Missing required field: ' + field + ' — set a value or "not_available"');
  } else if (value === 'not_available') {
    notAvailable.push(field);
  } else {
    // Type check against schema property definition
    const propDef = schema.properties[field];
    if (propDef) {
      const typeError = checkType(value, propDef, field);
      if (typeError) errors.push(typeError);
      else validCount++;
    } else {
      validCount++;
    }
  }
}

// Helper: nested field access
function getNestedValue(obj, path) {
  return path.split('.').reduce((o, k) => o && o[k], obj);
}

// Helper: type validation — handles oneOf schemas
function checkType(value, def, field) {
  // If oneOf, check against the non-"not_available" option
  if (def.oneOf) {
    const typeDef = def.oneOf.find(o => o.type);
    if (typeDef) return checkType(value, typeDef, field);
    return null;
  }
  if (def.type === 'number' && typeof value !== 'number') return field + ': expected number, got ' + typeof value + ' (' + value + ')';
  if (def.type === 'string' && typeof value !== 'string') return field + ': expected string, got ' + typeof value;
  if (def.type === 'array' && !Array.isArray(value)) return field + ': expected array, got ' + typeof value;
  if (def.type === 'object' && (typeof value !== 'object' || Array.isArray(value))) return field + ': expected object, got ' + (Array.isArray(value) ? 'array' : typeof value);
  if (def.minimum !== undefined && value < def.minimum) return field + ': value ' + value + ' below minimum ' + def.minimum;
  if (def.maximum !== undefined && value > def.maximum) return field + ': value ' + value + ' above maximum ' + def.maximum;
  if (def.minLength !== undefined && typeof value === 'string' && value.length < def.minLength) return field + ': string too short (min ' + def.minLength + ')';
  if (typeof value === 'number' && (isNaN(value) || !isFinite(value))) return field + ': value is NaN/Infinity';
  return null;
}

// ============================================================
// SEMANTIC SANITY CHECKS — catch nonsensical data relationships
// ============================================================
const warnings = [];

function num(field) {
  const v = data[field];
  return typeof v === 'number' ? v : null;
}

// 1. User count hierarchy: licensed <= total, chat <= total
if (num('licensed_users') !== null && num('total_active_users') !== null) {
  if (data.licensed_users > data.total_active_users) {
    errors.push('licensed_users (' + data.licensed_users + ') > total_active_users (' + data.total_active_users + ') — impossible');
  }
}
if (num('chat_users') !== null && num('total_active_users') !== null) {
  if (data.chat_users > data.total_active_users) {
    errors.push('chat_users (' + data.chat_users + ') > total_active_users (' + data.total_active_users + ') — impossible');
  }
}

// 2. Enablement can't exceed 100%
if (num('m365_enablement') !== null && data.m365_enablement > 100) {
  errors.push('m365_enablement is ' + data.m365_enablement + '% — cannot exceed 100%. Check total_licensed_seats (' + data.total_licensed_seats + ')');
}

// 3. Percentages that MUST be large (>1%) — catch unconverted 0-1 decimal rates
const mustBeLargePct = [
  'm365_enablement', 'm365_adoption', 'm365_retention', 'chat_retention', 'agent_retention',
  'agent_health', 'license_coverage',
  'band_1_5_pct', 'band_6_10_pct',
  'chat_band_1_5_pct', 'chat_band_6_10_pct',
  'agent_band_1_5_pct', 'agent_band_6_10_pct'
];
for (const f of mustBeLargePct) {
  const v = num(f);
  if (v !== null && v > 0 && v < 1) {
    errors.push(f + ' = ' + v + ' — looks like a 0-1 decimal, should be 0-100 percentage');
  }
}

// 4. Floats should be rounded (no 15-digit decimals in the data file)
for (const f of schema.required) {
  const v = data[f];
  if (typeof v === 'number') {
    const str = String(v);
    if (str.includes('.') && str.split('.')[1].length > 2) {
      warnings.push(f + ' = ' + v + ' — should be rounded to 1-2 decimal places');
    }
  }
}

// 5. Band percentages should sum to ~100
if (num('band_1_5_pct') !== null && num('band_6_10_pct') !== null &&
    num('band_11_15_pct') !== null && num('band_16_plus_pct') !== null) {
  const bandSum = data.band_1_5_pct + data.band_6_10_pct + data.band_11_15_pct + data.band_16_plus_pct;
  if (bandSum < 95 || bandSum > 105) {
    warnings.push('Active day band percentages sum to ' + bandSum.toFixed(1) + '% — expected ~100%');
  }
}

// 6. License priority sanity (ratio of licensed to unlicensed prompts)
if (num('license_priority') !== null && data.license_priority > 100) {
  warnings.push('license_priority = ' + data.license_priority + ' — unusually high ratio');
}

// 7. Total licensed seats should be reasonable vs licensed users
if (num('total_licensed_seats') !== null && num('licensed_users') !== null) {
  if (data.total_licensed_seats < data.licensed_users * 0.5) {
    errors.push('total_licensed_seats (' + data.total_licensed_seats + ') < licensed_users (' + data.licensed_users + ') * 0.5 — seats should be >= active licensed');
  }
}

// Report
console.log('\n=== Data Validation: ' + path.basename(dataPath) + ' ===');
console.log(validCount + '/' + schema.required.length + ' required fields valid');
if (notAvailable.length > 0) console.log(notAvailable.length + ' fields marked "not_available": ' + notAvailable.join(', '));
if (warnings.length > 0) {
  console.log('\nWARNINGS (' + warnings.length + '):');
  warnings.forEach(w => console.log('  [WARN] ' + w));
}
if (errors.length > 0) {
  console.log('\n' + errors.length + ' ERRORS:');
  errors.forEach(e => console.log('  ' + e));
  process.exit(1);
}
console.log('\nDATA VALIDATION PASSED\n');
process.exit(0);
