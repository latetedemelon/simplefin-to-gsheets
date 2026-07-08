[![Donate](https://img.shields.io/badge/Donate-PayPal-green.svg)](https://paypal.me/latetedemelon) [![Donate](https://img.shields.io/badge/Donate-Buy%20Me%20a%20Coffee-yellow)](https://buymeacoffee.com/latetedemelon) [![Donate](https://img.shields.io/badge/Donate-Ko--Fi-ff69b4)](https://ko-fi.com/latetedemelon)

# SimpleFIN to Google Sheets Sync

This project allows users to sync financial data from SimpleFIN API into Google Sheets for easy management, analysis, and tracking. It enables automated updates and manipulation of SimpleFIN data within a Google Sheets document.

## Table of Contents

- [Features](#features)
- [Setup](#setup)
- [Usage](#usage)
- [Limitations](#limitations)
- [Contributing](#contributing)
- [Donations](#donations)

## Features

- Fetch financial data from the SimpleFIN API (**Protocol v2**) into Google Sheets.
- Captures all data the API returns, across five sheets:
  - **Accounts** — organization/connection details (name, org ID, org URL, SFIN URL, connection ID/name), balance, available balance, balance date, account open date, and the raw `extra` payload.
  - **Transactions** — account, transaction ID, posted date, transacted-at date, amount, description, pending flag, **payee**, **memo**, **MCC** (merchant category code), and the raw `extra` payload. De-duplicated by account + transaction ID (SimpleFIN IDs are only unique within an account). Updated incrementally: new transactions are appended and existing rows are updated in place when they change (e.g. a pending transaction that later posts), while the rest of the history is left untouched.
  - **Balances** — a dated time series of each account's balance.
  - **Holdings** — investment/brokerage positions: symbol, shares, cost basis, market value, purchase price, currency, and description.
  - **Errors** — any errors the API reports (e.g. an account that failed to sync), so partial failures are visible instead of silent.
- Pulls all available transaction history by paging backward in 90-day windows — the SimpleFIN bridge caps a single request to ~90 days — and includes pending transactions (`pending=1`). Tunable via `LOOKBACK_DAYS` / `MAX_HISTORY_DAYS`.
- Automate updates to financial data based on scheduled syncs.
- Manage financial data directly in Google Sheets.

## Setup

1. Open the Google Sheet where you'd like to sync the data.
2. Click on `Extensions` > `Apps Script`.
3. Create a new Google Apps Script file and copy the provided code from the repository.
4. Follow the setup instructions in the script to configure SimpleFIN API access.

## Usage

1. Once the setup is complete, navigate to the Google Sheets document and use the **SimpleFin** menu:
   - **Set SimpleFin Token** — store your SimpleFIN setup token.
   - **Initialize Sheets** — create the Accounts, Transactions, Balances, Holdings, and Errors sheets and claim an access URL. (Existing users upgrading from an earlier version should run this once to create the new **Holdings** and **Errors** tabs.)
   - **Update Accounts and Transactions** — full sync of every sheet.
   - **Update Balances** / **Update Holdings** — refresh just those sheets.
   - **Debug: List Returned Accounts** — writes a summary of every account SimpleFIN returned (plus any errors and messages) to a "Debug" sheet, and logs the full raw response. Use this if an account (e.g. a mortgage) is missing — if it isn't listed here, SimpleFIN didn't return it, and the Errors sheet explains why.
2. After the first sync, you can schedule regular updates using Google Apps Script triggers to automate the process. (UI alerts are suppressed under time-based triggers, so scheduled runs won't fail.)

## Limitations

- This script is specific to the SimpleFIN API and Google Sheets. It does not support other APIs or spreadsheet applications.
- The script may have performance limitations when dealing with large datasets. Pulling full history on the first sync can be slow for accounts with a long transaction history; set `LOOKBACK_DAYS` to a positive number for a rolling window instead.
- The tool requests API v2 but falls back gracefully if a server still returns the v1 format. Fields such as `Holdings` only appear for institutions/accounts that provide them. To force v1, set `SIMPLEFIN_API_VERSION = 1` (or `null`).
- If an account is missing (e.g. a mortgage), the connection almost certainly needs re-authorization at the SimpleFIN Bridge — look for a `con.auth` entry in the **Errors** / **Debug** sheet, then re-link that connection at bridge.simplefin.org. This is a bank-link state and is not affected by the API version.

## Contributing

Contributions to the SimpleFIN to Google Sheets Sync project are welcome! If you have improvements, bug fixes, or new features you'd like to see added, please submit a Pull Request.

## Donations

If you find SimpleFIN to Google Sheets Sync helpful and would like to support its development, consider making a donation to the project. Every little bit helps!

<a href='https://paypal.me/latetedemelon' target='_blank'><img src="https://github.com/stefan-niedermann/paypal-donate-button/blob/master/paypal-donate-button.png" width="270" height="105" alt='Donate via Paypay' />

<a href='https://ko-fi.com/latetedemelon' target='_blank'><img height='35' style='border:0px;height:46px;' src='https://az743702.vo.msecnd.net/cdn/kofi3.png?v=0' border='0' alt='Buy Me a Coffee at ko-fi.com' />

[!["Buy Me A Coffee"](https://www.buymeacoffee.com/assets/img/custom_images/yellow_img.png)](https://www.buymeacoffee.com/latetedemelon)

## License

This project is licensed under the MIT License. See the [LICENSE](https://github.com/latetedemelon/simplefin-to-gsheets/blob/main/LICENSE) file for details.
