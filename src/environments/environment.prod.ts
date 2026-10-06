/** Production settings. OAuth client ID should be configured for the deployment. */
export const environment = {
  production: true,
  showLocalComments: false,
  appName: 'Sheetit',
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
