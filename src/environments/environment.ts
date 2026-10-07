/** Set the Google OAuth client ID for your own deployment. Spreadsheet selection is automatic. */
export const environment = {
  production: false,
  showLocalComments: true,
  appName: 'SheetFi',
  googleClientId: '575189646854-uosl4m60bvlv6r2pouos79lrg5obtr9h.apps.googleusercontent.com',
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
