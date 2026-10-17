const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'catalog.json'), 'utf8'));
fs.writeFileSync(path.join(root, 'dist/catalog.js'), 'const CATALOG=' + JSON.stringify(catalog) + ';\n');
console.log(`Catalog synchronized: ${catalog.categories.length} categories, ${catalog.products.length} models.`);
