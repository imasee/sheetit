# Tracksee

Tracksee is a standalone Angular 21 personal ledger. The browser talks directly to Google Drive and Sheets API v4; there is no Tracksee server or proprietary database. CAD, INR, and USD balances are reconciled independently and are never converted or added together.

## Start the app

1. Install Node.js 20.19 or newer and npm.
2. Run `npm install` and `npm start`.
3. Open the local development URL shown by Angular CLI.

## Google Cloud setup

1. Select or create a Google Cloud project and enable both **Google Sheets API** and **Google Drive API**.
2. Configure the OAuth consent screen and create an OAuth **Web application** client ID. Add each development and production origin to its authorized JavaScript origins.
3. Set `googleClientId` in `src/environments/environment.ts`. Tracksee is a public browser client; do not add a client secret.
4. Open Tracksee and choose **Connect Google**. Google asks for spreadsheet access and Drive metadata search. Tracksee then looks for spreadsheet names matching the configured pattern.

The default pattern is `[tracksee]-{name}-{version}`. The default name is `Personal Finance`; its first sheet is titled `[tracksee]-Personal Finance-1`. Creating another ledger with the same name increments the version (`-2`, `-3`, and so on). The app stores the selected spreadsheet for later visits. No spreadsheet ID is entered in environment configuration.

If no matching spreadsheet exists, Tracksee asks before creating one. **Not now** leaves the dashboard blank. The **New** action in the sidebar opens the same naming dialog at any time. A new file is created with `People` and `Transactions` tabs; first sync fills the header rows.

## Spreadsheet schema

- `People!A:E`: `EntityId`, `Name`, `Phone`, `Email`, `Notes`
- `Transactions!A:J`: `TxId`, `Date`, `EntityId`, `Type`, `Amount`, `Currency`, `Category`, `Notes`, `Status`, `CreatedAt`

Add people beneath the `People` header using unique entity IDs. Transactions refer to those IDs. Tracksee searches Drive by the static prefix before `{name}` and then validates each result against the entire pattern.

## Ledger rules

- A positive peer balance means the person owes you; a negative balance means you owe them.
- `Lent_To_Them` and `Repayment_Sent` increase a peer balance. `Borrowed_From_Them` and `Repayment_Received` decrease it.
- Expenses appear in activity history but do not affect peer positions.
- Only `Cleared` rows are included in balances. Pending and void entries are excluded.
- CAD, INR, and USD remain separate in peer and global summaries.

## Authentication persistence

The Google access token and its expiry are saved in the current browser tab’s `sessionStorage`, so a page reload in that tab can reuse a still-valid token. The token is short lived and is cleared on sign-out or tab-session end; Google must issue a new token after it expires. Tracksee does not request or store a refresh token. The selected spreadsheet reference and theme preference are saved in local storage.

Access tokens remain readable by scripts running on this origin, so keep the app’s dependencies and deployment origin secure. All Drive and Sheets requests go directly from the browser to Google; Tracksee has no server-side copy of the ledger. This build does not include an offline write queue or conflict resolution for simultaneous edits from multiple clients.
