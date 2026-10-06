/** Set the Google OAuth client ID for your own deployment. Spreadsheet selection is automatic. */
export const environment = {
  production: false,
  showLocalComments: true,
  googleClientId: 'YOUR_GOOGLE_OAUTH_CLIENT_ID.apps.googleusercontent.com',
  spreadsheetNamingPattern: '[sheetit]-{name}-{version}',
  defaultSpreadsheetName: 'Personal Finance',
  scopes: [
    'openid',
    'email',
    'profile',
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/drive.metadata.readonly',
  ] as const,
};
