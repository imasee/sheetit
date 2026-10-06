# Sheetit

Sheetit is a standalone Angular 21 personal ledger. The browser talks directly to Google Drive and Sheets API v4; there is no Sheetit server or proprietary database. CAD, INR, and USD balances are reconciled independently and are never converted or added together.

## Start the app

1. Install Node.js 20.19 or newer and npm.
2. Run `npm install` and `npm start`.
3. Open the local development URL shown by Angular CLI.

## Google Cloud setup

1. Select or create a Google Cloud project and enable both **Google Sheets API** and **Google Drive API**.
2. Configure the OAuth consent screen and create an OAuth **Web application** client ID. Add each development and production origin to its authorized JavaScript origins.
3. Set `googleClientId` in `src/environments/environment.ts` and `src/environments/environment.prod.ts`. Sheetit is a public browser client; do not add a client secret.
4. Open Sheetit and sign in with Google. The login screen is the only entry to the protected app. Google asks for basic profile identity, spreadsheet access, and Drive metadata search. Sheetit validates the returned access token against Google's UserInfo endpoint, then looks for spreadsheet names matching the configured pattern.

The default pattern is `[sheetit]-{name}-{version}`. The default name is `Personal Finance`; its first sheet is titled `[sheetit]-Personal Finance-1`. Creating another ledger with the same name increments the version (`-2`, `-3`, and so on). Existing `[tracksee]-...` spreadsheets remain discoverable. The app stores the selected spreadsheet for later visits. No spreadsheet ID is entered in environment configuration.

If no matching spreadsheet exists, Sheetit asks before creating one. **Not now** leaves the dashboard blank. The **New** action in the sidebar opens the same naming dialog at any time. A new file is created with `People`, `Transactions`, and `Payments` tabs; first sync fills the header rows.

## Spreadsheet schema

- `People!A:E`: `EntityId`, `Name`, `Phone`, `Email`, `Notes`
- `Transactions!A:J`: `TxId`, `Date`, `EntityId`, `Type`, `Amount`, `Currency`, `Category`, `Notes`, `Status`, `CreatedAt`
- `Payments!A:I`: `PaymentId`, `TxId`, `Date`, `Direction`, `Amount`, `Currency`, `Notes`, `Status`, `CreatedAt`

Add people beneath the `People` header using unique entity IDs. Transactions refer to those IDs. Sheetit searches Drive by its current and legacy static prefixes before `{name}` and validates each result against the matching full pattern.

Payments are separate, append-only rows linked to a transaction by `TxId`. Voided transactions remain in the sheet for audit history, and neither they nor their linked payments affect balances.

Notes/comments can be entered and viewed in development mode. Production builds hide these values in the app interface; the existing `Notes` columns remain intact in the Sheets schema.

## Ledger rules

- A positive peer balance means the person owes you; a negative balance means you owe them.
- `Lent_To_Them` and `Repayment_Sent` increase a peer balance. `Borrowed_From_Them` and `Repayment_Received` decrease it.
- Expenses appear in activity history but do not affect peer positions.
- Only `Cleared` rows are included in balances. Pending and void entries are excluded.
- CAD, INR, and USD remain separate in peer and global summaries.

## Authentication persistence

The Google access token and its expiry are saved in the current browser tab’s `sessionStorage`, so a page reload in that tab can reuse a still-valid token. Protected routes validate the token with Google's UserInfo endpoint. An expired/invalid token or a Google API `401` clears the session and returns the user to login; the app also provides a sign-out action in the sidebar and Settings. The token is short lived and is cleared on sign-out or tab-session end; Google must issue a new token after it expires. Sheetit does not request or store a refresh token. The selected spreadsheet reference and theme preference are saved in local storage.

Access tokens remain readable by scripts running on this origin, so keep the app’s dependencies and deployment origin secure. All Drive and Sheets requests go directly from the browser to Google; Sheetit has no server-side copy of the ledger. This build does not include an offline write queue or conflict resolution for simultaneous edits from multiple clients.

## GitHub Pages deployment

The `main` branch is the production branch; `develop` is for ongoing work. Pull requests into `main` run a production build check. Merging a pull request into `main` runs `.github/workflows/deploy-pages.yml` on GitHub Actions and publishes the Angular app at `https://imasee.github.io/sheetit/`. The deployment build and publishing happen on GitHub; no local deployment command is needed. Enable **Settings → Pages → Build and deployment → GitHub Actions** in the repository once. Add the Google OAuth web client ID as the Actions repository secret `GOOGLE_CLIENT_ID`. This client ID is embedded in the browser bundle at build time and is a public OAuth identifier, not a client secret. In Google Cloud, authorize `https://imasee.github.io` as a JavaScript origin and `https://imasee.github.io/sheetit/` as the app URL. Never put a Google OAuth client secret or service-account key in this browser app or its Actions secrets.


Configure public deployment settings under **Settings → Secrets and variables → Actions → Variables**: `APP_NAME` (default `Sheetit`), `SPREADSHEET_NAMING_PATTERN` (default `[sheetit]-{name}-{version}`; must contain `{name}` and `{version}` once each), and `DEFAULT_SPREADSHEET_NAME` (default `Personal Finance`). The workflow applies these values during the build, so these branding and spreadsheet naming defaults can be changed without editing application source.
