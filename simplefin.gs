// Replace with your SimpleFin token
const SIMPLEFIN_TOKEN = 'REPLACE_ME_WITH_A_NEW_TOKEN';

const ACCOUNTS_SHEET_NAME = 'Accounts';
const TRANSACTIONS_SHEET_NAME = 'Transactions';
const BALANCES_SHEET_NAME = 'Balances';
const START_DATE = '2023-01-01';  // Set your date range
const END_DATE = '2023-12-31';

function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('SimpleFin')
    .addItem('Initialize Sheets', 'initializeSheets')
    .addItem('Update Accounts and Transactions', 'updateAccountsAndTransactions')
    .addItem('Update Balances', 'updateBalances')
    .addItem('Compare','compareAndRecordTransactions')
    .addToUi();
}

function initializeSheets() {
  createSheet(ACCOUNTS_SHEET_NAME);
  createSheet(TRANSACTIONS_SHEET_NAME);
  createSheet(BALANCES_SHEET_NAME);
  
  storeAccessCodeUrl(SIMPLEFIN_TOKEN);
}

function createSheet(sheetName) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss.getSheetByName(sheetName)) {
    ss.insertSheet(sheetName);
  }
}

function storeAccessCodeUrl(token) {
  const decodedToken = Utilities.base64Decode(token);
  const claimUrl = Utilities.newBlob(decodedToken).getDataAsString();
  
  const accessCodeUrl = getAccessCodeUrl(claimUrl);
  
  const scriptProperties = PropertiesService.getScriptProperties();
  scriptProperties.setProperty('accessCodeUrl', accessCodeUrl);
}

function getAccessCodeUrl(claimUrl) {
  const options = {
    method: 'POST'
  };
  const response = UrlFetchApp.fetch(claimUrl, options);
  const accessCodeUrl = response.getContentText();

  return accessCodeUrl;
}

function getAccountsAndTransactions(accessCodeUrl, startDate, endDate) {
  const [baseUrl, credentials] = splitUrlAndCredentials(accessCodeUrl);
  
  const url = `${baseUrl}/accounts?start-date=${startDate}&end-date=${endDate}`;
  const options = {
    method: 'GET',
    headers: {
      Authorization: `Basic ${Utilities.base64Encode(credentials)}`
    }
  };
  const response = UrlFetchApp.fetch(url, options);
  const data = JSON.parse(response.getContentText());
  return data;
}

function getAccountsAndTransactionsNoDate(accessCodeUrl) {
  const [baseUrl, credentials] = splitUrlAndCredentials(accessCodeUrl);
  
  const url = `${baseUrl}/accounts`;
  const options = {
    method: 'GET',
    headers: {
      Authorization: `Basic ${Utilities.base64Encode(credentials)}`
    }
  };
  const response = UrlFetchApp.fetch(url, options);
  const data = JSON.parse(response.getContentText());
  return data;
}

function splitUrlAndCredentials(accessCodeUrl) {
  const schemaRest= accessCodeUrl.split('//', 2);
  const fullRest = schemaRest[1].split('@', 2);
  const auth = fullRest[0];
  const schema = schemaRest[0];
  const rest = fullRest[1];
  const baseUrl = `${schema}//${rest}`;

  return [baseUrl, auth];
}

function updateAccountsAndTransactions() {
  const scriptProperties = PropertiesService.getScriptProperties();
  const accessCodeUrl = scriptProperties.getProperty('accessCodeUrl');
  Logger.log('Access Code URL from properties: ' + accessCodeUrl);

  const currentDate = new Date();
  const otherDate = new Date();
  otherDate.setDate(currentDate.getDate()-14);
  const startDate = Math.floor(otherDate / 1000); // today
  const endDate = Math.floor(currentDate / 1000); // today

  const responseData = getAccountsAndTransactions(accessCodeUrl, startDate, endDate);
  //const responseData = getAccountsAndTransactionsNoDate
  if (responseData && Array.isArray(responseData.accounts)) {
    updateAccountsSheet(responseData.accounts);
    updateTransactionsSheet(responseData.accounts);
    updateBalancesSheet(responseData.accounts);
  } else {
    Logger.log('Error: responseData.accounts is not an array');
  }
}

function updateAccountsSheet(accounts) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Accounts');
  sheet.clearContents();
  sheet.appendRow([
    'Domain', 'Org Name', 'SFIN URL', 'Account ID', 'Account Name', 'Currency',
    'Balance', 'Available Balance', 'Balance Date', 'Account Open Date'
  ]);

  accounts.forEach((account) => {
    const org = account.org;
    sheet.appendRow([
      org.domain, org.name, org['sfin-url'],
      account.id, account.name, account.currency,
      account.balance, account['available-balance'], new Date(account['balance-date'] * 1000)
    ]);
  });
}

function updateTransactionsSheet(accounts) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Transactions');
  
  // Check if the header row exists, and if not, add it.
  if (sheet.getLastRow() === 0) {
    sheet.appendRow([
      'Account ID', 'Account Name', 'Transaction ID', 'Posted',
      'Amount', 'Description', 'Pending', 'Extra'
    ]);
  }
  
  // Get the range of transaction IDs in the sheet.
  const transactionIdRange = sheet.getRange(2, 3, sheet.getLastRow() - 1, 1);
  const existingTransactionIds = transactionIdRange.getValues().flat();

  accounts.forEach((account) => {
    account.transactions.forEach((transaction) => {
      // Check if the transaction ID already exists in the sheet.
      if (!existingTransactionIds.includes(transaction.id)) {
        sheet.appendRow([
          account.id, account.name, transaction.id, new Date(transaction.posted * 1000),
          transaction.amount, transaction.description, transaction.pending,
          JSON.stringify(transaction.extra)
        ]);
      }
    });
  });
}

function updateBalancesSheet(accountsData) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(BALANCES_SHEET_NAME);
  
  const today = new Date();
  const formattedToday = today.toLocaleDateString();
  
  // Find row with today's date in the first column
  let rowIndex = -1;
  for (let i = 1; i <= sheet.getLastRow(); i++) {
    const rowDate = sheet.getRange(i, 1).getValue();
    if (rowDate instanceof Date && rowDate.toLocaleDateString() === formattedToday) {
      rowIndex = i;
      break;
    }
  }
  
  // If today's date not found, create a new row
  if (rowIndex === -1) {
    rowIndex = sheet.getLastRow() + 1;
    sheet.getRange(rowIndex, 1).setValue(formattedToday);
  }

  // Update account balances
  accountsData.forEach((account, index) => {
    const colIndex = index + 2;

    // Add account ID to header row if not already present
    if (sheet.getLastRow() === 0 || sheet.getRange(1, colIndex).getValue() !== account.id) {
      sheet.getRange(1, colIndex).setValue(account.id);
    }

    sheet.getRange(rowIndex, colIndex).setValue(account.balance);
  });
}

