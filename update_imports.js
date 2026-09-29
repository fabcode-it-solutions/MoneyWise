import fs from 'fs';
import path from 'path';

const files = [
  'server/src/app.ts',
  'server/src/config.ts',
  'server/src/db.ts',
  'server/src/index.ts',
  'server/src/middleware/asyncHandler.ts',
  'server/src/middleware/auth.ts',
  'server/src/middleware/csrf.ts',
  'server/src/models/Expense.ts',
  'server/src/models/User.ts',
  'server/src/routes/ai.ts',
  'server/src/routes/auth.ts',
  'server/src/routes/currency.ts',
  'server/src/routes/expenses.ts',
  'server/src/routes/familyMembers.ts'
];

files.forEach(file => {
  const filePath = path.resolve(process.cwd(), file);
  if (!fs.existsSync(filePath)) {
    console.log(`File not found: ${file}`);
    return;
  }
  let content = fs.readFileSync(filePath, 'utf8');
  // Match relative imports that don't already have .js
  const newContent = content.replace(/(from\s+['"])(\.\.?\/[^'"]+?)(?<!\.js)(['"])/g, '$1$2.js$3');
  if (content !== newContent) {
    fs.writeFileSync(filePath, newContent);
    console.log(`Updated: ${file}`);
  } else {
    console.log(`No changes needed: ${file}`);
  }
});
