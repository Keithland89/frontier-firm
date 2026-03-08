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

// Report
console.log('\n=== Data Validation: ' + path.basename(dataPath) + ' ===');
console.log(validCount + '/' + schema.required.length + ' required fields valid');
if (notAvailable.length > 0) console.log(notAvailable.length + ' fields marked "not_available": ' + notAvailable.join(', '));
if (errors.length > 0) {
  console.log('\n' + errors.length + ' ERRORS:');
  errors.forEach(e => console.log('  ' + e));
  process.exit(1);
}
console.log('\nDATA VALIDATION PASSED\n');
process.exit(0);
