/*
 * Universal Identifiers. This allows us to produce IDs
 * for anything, including things requiring sequential IDs
 * such as newstex IDs, as well as just anything that 
 * requires a unique identifier, like a Story ID
 *
 * @author: Chris Moyer <cmoyer@newstex.com>
 */
/* global require, exports */
var db = require('../db.js');

var UID = db.define({
	tableName: 'UID',
	key: ['__type__', '__id__'],
	properties: {
		__type__: new db.types.StringProperty(),
		__id__: new db.types.NumberProperty(),
		name: new db.types.StringProperty({verbose_name: 'Object Name'}),
		created_at: new db.types.DateTimeProperty({verbose_name: 'Created At', auto_now_add: true})
	}
});

/**
 * Get the next value in this Sequence.
 * This is a locking operation which will keep this ID
 * and save it for ourselves
 *
 * You must specify at least a type:
 *
 * 	UID.next('Content', callback, properties)
 *
 * 
 * Properties will be saved to the object in the UID table.
 *
 * The callback will be called with the UID object created
 *
 * @param type: The type hash-key to get a new UID for
 * @param callback: The callback to return
 * @param properties: The list of properties to save to the UID object
 */
var BACKOFF = 500;
UID.next = function(type, callback, properties){
	// Make sure we have a type and callback
	if(!type || !callback){
		throw 'Type and callback must be defined';
	}

	// Get the latest UID in the series
	UID.query({
			ConsistentRead: true,
			Limit: 1,
			ScanIndexForward: false,
			KeyConditions: {
				__type__: {
					ComparisonOperator: 'EQ',
					AttributeValueList: [ {S:type} ]
				}
			}
		}, function(err, last_obj){
			if(err){
				// If there is an error, try again after a short
				// delay
				setTimeout(function(){
					UID.next(type, callback, properties);
				}, BACKOFF);
				BACKOFF += 500;
				console.log('ERROR ', err, 'BACKING OFF', BACKOFF);
			} else {
				// Handle first UID
				if(!last_obj){
					last_obj = new UID(type, 0);
				}
				// Increment by one, and try a conditional save
				var next_id = last_obj.__id__ + 1;
				var obj = new UID(type, next_id);
				// Add all the properties
				for (var prop_name in properties){
					obj[prop_name] = properties[prop_name];
				}
				obj.save(function(err, data){
					if(err){
						// If there is an error, try again
						setTimeout(function(){
							UID.next(type, callback, properties);
						}, BACKOFF);
						console.log('ERROR ', err, 'BACKING OFF', BACKOFF);
						BACKOFF += 500;
					} else {
						callback(obj);
					}
				},{
					__id__: { Exists: false }
				});
			}
	});
};

exports.UID = UID;
