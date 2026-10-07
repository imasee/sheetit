import { readFile, writeFile } from 'node:fs/promises';

const file = new URL('../src/environments/environment.prod.ts', import.meta.url);
const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
const placeholder = 'YOUR_GOOGLE_OAUTH_CLIENT_ID.apps.googleusercontent.com';
const appName = process.env.APP_NAME?.trim() || 'SheetFi';
const namingPattern = process.env.SPREADSHEET_NAMING_PATTERN?.trim() || '[sheetit]-{name}-{version}';
const defaultSpreadsheetName = process.env.DEFAULT_SPREADSHEET_NAME?.trim() || 'Personal Finance';

if (!clientId || !/^[\w.-]+\.apps\.googleusercontent\.com$/.test(clientId)) {
  throw new Error('Set the GitHub Actions secret GOOGLE_CLIENT_ID to a Google OAuth web client ID.');
}
if (!appName || appName.length > 40) throw new Error('APP_NAME must be 1–40 characters.');
if (!namingPattern || namingPattern.length > 120 || (namingPattern.match(/\{name\}/g) ?? []).length !== 1 || (namingPattern.match(/\{version\}/g) ?? []).length !== 1) {
  throw new Error('SPREADSHEET_NAMING_PATTERN must be at most 120 characters and contain {name} and {version} exactly once.');
}
if (!defaultSpreadsheetName || defaultSpreadsheetName.length > 60) throw new Error('DEFAULT_SPREADSHEET_NAME must be 1–60 characters.');

const source = await readFile(file, 'utf8');
if (!source.includes(placeholder)) {
  throw new Error('The production environment is missing the expected OAuth client ID placeholder.');
}
const updated = source
  .replace(placeholder, clientId)
  .replace(/(appName:\s*)'[^']*'/, `$1${JSON.stringify(appName)}`)
  .replace(/(spreadsheetNamingPattern:\s*)'[^']*'/, `$1${JSON.stringify(namingPattern)}`)
  .replace(/(defaultSpreadsheetName:\s*)'[^']*'/, `$1${JSON.stringify(defaultSpreadsheetName)}`);
await writeFile(file, updated);

const indexFile = new URL('../src/index.html', import.meta.url);
const index = await readFile(indexFile, 'utf8');
const safeTitle = appName.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
await writeFile(indexFile, index.replace(/<title>.*?<\/title>/, `<title>${safeTitle} — Personal Ledger</title>`));
