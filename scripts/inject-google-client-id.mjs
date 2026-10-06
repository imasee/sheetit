import { readFile, writeFile } from 'node:fs/promises';

const file = new URL('../src/environments/environment.prod.ts', import.meta.url);
const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
const placeholder = 'YOUR_GOOGLE_OAUTH_CLIENT_ID.apps.googleusercontent.com';

if (!clientId || !/^[\w.-]+\.apps\.googleusercontent\.com$/.test(clientId)) {
  throw new Error('Set the GitHub Actions secret GOOGLE_CLIENT_ID to a Google OAuth web client ID.');
}

const source = await readFile(file, 'utf8');
if (!source.includes(placeholder)) {
  throw new Error('The production environment is missing the expected OAuth client ID placeholder.');
}
await writeFile(file, source.replace(placeholder, clientId));
