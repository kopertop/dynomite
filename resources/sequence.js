/*
 * Sequence generator, returns sequential IDs. Useful when
 * the IDs just need to be sequential, but shouldn't ever roll
 * back even if the ID isn't used.
 *
 * @author: Chris Moyer <cmoyer@newstex.com>
 */
/* global require, module */
var db = require('../db.js');

var Sequence = db.define({
	tableName: 'Sequence',
	key: 'id',
	properties: {
		id: new db.types.StringProperty({ verbose_name: 'Sequence Name' }),
		value: new db.types.NumberProperty({ verbose_name: 'Current Value' }),
	}
});

/**
 * Get the next value in this sequence
 *
 * @param callback: The callback to return with the next ID
 */
Sequence.prototype.next = function sequenceNext(callback){
	var self = this;
	self.add({ value: 1 }, function(err, val){
		if(val){
			val = parseInt(val.Attributes.value.N, 10);
		}
		callback(err, val);
	});
};

module.exports = Sequence;
