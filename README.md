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

- Fetch financial data from SimpleFIN API into Google Sheets.
- Automate updates to financial data based on scheduled syncs.
- Customize the sync behavior through specific parameters.
- Manage financial data directly in Google Sheets.

## Setup

1. Open the Google Sheet where you'd like to sync the data.
2. Click on `Extensions` > `Apps Script`.
3. Create a new Google Apps Script file and copy the provided code from the repository.
4. Follow the setup instructions in the script to configure SimpleFIN API access.

## Usage

1. Once the setup is complete, navigate to the Google Sheets document.
2. Use the menu bar to access the SimpleFIN sync options.
3. Click `Refresh` to sync data from SimpleFIN API.
4. After the first sync, you can schedule regular updates using Google Apps Script triggers to automate the process.

## Limitations

- This script is specific to the SimpleFIN API and Google Sheets. It does not support other APIs or spreadsheet applications.
- The script may have performance limitations when dealing with large datasets.
- Some financial data attributes may not be supported depending on the SimpleFIN API version in use.

## Contributing

Contributions to the SimpleFIN to Google Sheets Sync project are welcome! If you have improvements, bug fixes, or new features you'd like to see added, please submit a Pull Request.

## Donations

If you find VISCAL helpful and would like to support its development, consider making a donation to the project. Every little bit helps!

<a href='https://paypal.me/latetedemelon' target='_blank'><img src="https://github.com/stefan-niedermann/paypal-donate-button/blob/master/paypal-donate-button.png" width="270" height="105" alt='Donate via Paypay' />

<a href='https://ko-fi.com/latetedemelon' target='_blank'><img height='35' style='border:0px;height:46px;' src='https://az743702.vo.msecnd.net/cdn/kofi3.png?v=0' border='0' alt='Buy Me a Coffee at ko-fi.com' />

[!["Buy Me A Coffee"](https://www.buymeacoffee.com/assets/img/custom_images/yellow_img.png)](https://www.buymeacoffee.com/latetedemelon)

## License

This project is licensed under the MIT License. See the [LICENSE](https://github.com/latetedemelon/simplefin-to-gsheets/blob/main/LICENSE) file for details.
