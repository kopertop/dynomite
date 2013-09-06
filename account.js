/**
 * NewsCore "Account" - Essentially a "grouping" for Contracts
 *
 * @author Chris Moyer <cmoyer@newstex.com>
 */
var util = require('util')

/**
 * Account base object
 */
function Account(){ }
util.inherits(Account, Model)

// Set our table name
Account.table_name = 'Accounts'


exports.Account = Account
