/**
 * Validates icon-mapping.json against the actual Hugeicons Duotone files.
 * Run: node validate-icon-mapping.cjs
 */
const fs = require('fs');
const path = require('path');

const mapping = JSON.parse(fs.readFileSync(path.join(__dirname, 'icon-mapping.json'), 'utf8'));
// Path from apps/frontend/scripts to ../../.refs (relative to worktree root)
// scripts -> frontend -> apps -> worktree root -> .. -> .. -> .refs
const iconsPath = path.join(__dirname, '..', '..', '..', '..', '..', '.refs', 'icons', 'hugeicons', 'Duotone');

let valid = 0;
let invalid = 0;
const issues = [];

for (const [iconName, config] of Object.entries(mapping.icons)) {
  const iconPath = path.join(iconsPath, config.category, config.hugeicon_file);
  if (fs.existsSync(iconPath)) {
    valid++;
  } else {
    invalid++;
    issues.push({ icon: iconName, expected: config.hugeicon_file, category: config.category });
  }
}

console.log('=== Icon Mapping Validation ===');
console.log('Total icons:', Object.keys(mapping.icons).length);
console.log('Valid mappings:', valid);
console.log('Invalid mappings:', invalid);

if (issues.length > 0) {
  console.log('\nIssues found:');
  issues.forEach(i => console.log('  -', i.icon, ':', i.category + '/' + i.expected));
  process.exit(1);
} else {
  console.log('\nAll icon mappings are valid!');
}
