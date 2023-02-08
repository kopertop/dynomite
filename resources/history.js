/*
 * History/Log of a Change to a specific object
 *
 * This can be included on any single Save operation, if you enable
 * history tracking.
 *
 * History must be explicitly enabled on the individual Class level:
 *		db.create({
 *			track_history: true,
 *			...
 *		});
 *
 * To enable History tracking, you MUST have a table called "History",
 * with a Hash key of "obj" (S) and Range key of "ts" (N). It should also
 * contain a global secondary index (GSI) of "transaction_id"
 *
 * @author: Chris Moyer <cmoyer@newstex.com>
 */
const db = require('../db.js');

const History = db.define({
	tableName: 'History',
	$type: 'History',
	key: ['obj', 'ts'],
	track_history: false,
	properties: {
		obj: new db.types.ReferenceProperty({ verbose_name: 'Object Reference' }),
		ts: new db.types.DateTimeProperty({ verbose_name: 'Change Created At', auto_now_add: true }),
		method: new db.types.StringProperty({ verbose_name: 'Method' }),
		url: new db.types.StringProperty({ verbose_name: 'url' }),
		user: new db.types.ReferenceProperty({ verbose_name: 'User' }),
		old_obj: new db.types.JSONProperty({ verbose_name: 'Old Object' }),
		new_obj: new db.types.JSONProperty({ verbose_name: 'New Object' }),
		changes: new db.types.JSONProperty({ verbose_name: 'Updated Properties' }),
		resp: new db.types.JSONProperty({ verbose_name: 'DB Response' }),
		api_version: new db.types.StringProperty({ verbose_name: 'API Version' }),
		client_version: new db.types.StringProperty({ verbose_name: 'Client Version' }),
		comment: new db.types.StringProperty({ verbose_name: 'Change Comment' }),
		transaction_id: new db.types.StringProperty({ verbose_name: 'Transaction ID' }),
	},
});

exports.History = History;
