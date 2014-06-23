/*
 * DynamoDB base stuff
 *
 * @author Chris Moyer <cmoyer@newstex.com>
 */
/* global require, exports, module */
var AWS = require('aws-sdk');
AWS.config.update({region: 'us-east-1'});
var dynamodb = new AWS.DynamoDB();
var EventEmitter = require('events').EventEmitter;
var util = require('util');

/**
 * Delayed function call
 */
function delayFunction(fnc, callback, opts){
	return function next(newCallback, newOpts){
		if(!newCallback){
			newCallback = callback;
		}
		if(!newOpts){
			newOpts = opts;
		}
		// Exclusive Start Key is always used from the original
		newOpts.ExclusiveStartKey = opts.ExclusiveStartKey;
		return fnc(newCallback, newOpts);
	};
}


/**
 * Dynamize the hashKey and rangeKey ID
 */
function dynamizeKey(model, id){
	var key = {};
	if(typeof id == 'string'){
		key[model._hashKeyName] = {};
		key[model._hashKeyName][model._hashKeyType] =  id;
	} else {
		[model._hashKeyName, model._rangeKeyName].forEach(function(key_name, $index){
			// Allow encoding each property
			if(model._properties[key_name].encode){
				id[$index] = model._properties[key_name].encode(id[$index]);
			}
		});
		key[model._hashKeyName] = {};
		key[model._hashKeyName][model._hashKeyType] =  String(id[0]);
		key[model._rangeKeyName] = {};
		key[model._rangeKeyName][model._rangeKeyType] =  String(id[1]);
		
	}
	return key;
}

/**
 * Lookup a given model by id, which may be a string, or a list
 * @param model: The Model object to look for
 * @param id: The ID (string or array) to look up
 * @param callback: A callback function to call when the operation is completed
 * @param opts: Optional options to pass through to DynamoDB.getItem
 */
function lookup(model, id, callback, opts){
	var args = {
		TableName: model._table_name,
		Key: dynamizeKey(model, id)
	};
	if(opts){
		for(var x in opts){
			args[x] = opts[x];
		}
	}
	dynamodb.getItem(args, function(err, data){
		if(err){
			console.error(err);
			callback(null, err);
		} else {
			if(data.Item){
				callback(model.from_dynamo(data.Item));
			} else {
				callback(null);
			}
		}
	});
}

/**
 * Lookup a list of IDs, each which may be a string, or a list
 * @param model: The Model object to look for
 * @param ids: The list of IDs
 * @param callback: A callback function to call when the operation is completed
 * @param opts: Optional options to pass through to DynamoDB.batchGetItem
 */
function batchLookup(model, ids, callback, opts){
	var keys = [];
	for(var x in ids){
		var id = ids[x];
		keys.push(dynamizeKey(model, id));
	}
	var args = { RequestItems: { } };
	args.RequestItems[model._table_name] = { Keys: keys };

	dynamodb.batchGetItem(args, function(err, data){
		if(err){
			console.error(err);
			callback(null, err);
		} else {
			var items = [];
			for(var x in data.Responses[model._table_name]){
				var item = data.Responses[model._table_name][x];
				items.push(model.from_dynamo(item));
			}
			callback(items);
		}
	});
}


/**
 * Generic function to convert a value to the dynamo form
 */
function convertValueToDynamo(val){
	if(typeof val == 'number'){
		val = String(val);
	} else if (typeof val == 'object'){
		if(val instanceof Date){
			val = String(val.getTime());
			// Prevent invalid dates
			if(val == 'NaN'){
				val = '0';
			}
		}
	}
	return val;
}

/**
 * Save a given object
 * @param obj: The object to save
 * @param callback: An optional callback to call after the save is completed
 * @param expected: An optional map of attribute/condition pairs.
 * 	This is the conditional block for the PutItem operation.
 * 	All the conditions must be met for the operation to succeed
 */
function save(obj, callback, expected){
	var table_name = obj.constructor._table_name;
	var properties = obj.constructor._properties;
	
	// Create the Object Value mapping
	var obj_values = { };
	//obj_values[obj.constructor._hashKeyName] = {};
	//obj_values[obj.constructor._hashKeyName][obj.constructor._hashKeyType] = obj[obj.constructor._hashKeyName];
	var ignored_props = [
		obj.constructor._hashKeyName,
	];
	if(obj.constructor._rangeKeyName){
		ignored_props.push(obj.constructor._rangeKeyName);
	}
	for (var prop_name in properties){
		if(ignored_props.indexOf(prop_name) < 0){
			var prop_type = properties[prop_name].type_code;
			var prop_val = obj[prop_name];

			// Validate
			properties[prop_name].validate(prop_val);

			// Check for custom property options
			if(properties[prop_name].options){
				// Auto now and Auto now add should automatically get set
				if( (properties[prop_name].options.auto_now_add && !prop_val) || properties[prop_name].options.auto_now){
					prop_val = new Date();
					// Also set the value on the object so it is returned properly
					obj[prop_name] = prop_val;
				}
			}

			// Encode if we have an encoder
			if(properties[prop_name].encode){
				prop_val = properties[prop_name].encode(prop_val);
			}


			if(typeof prop_val != 'undefined' && prop_val !== null && (typeof prop_val != 'object' || !(prop_val instanceof Array) || prop_val.length > 0)){
				obj_values[prop_name] = {};
				if(prop_type.length == 2 && prop_type[1] == 'S'){
					for (var n in prop_val){
						prop_val[n] = convertValueToDynamo(prop_val[n]);
					}
				} else {
					prop_val = convertValueToDynamo(prop_val);
				}
				var Value = {};
				Value[prop_type] = prop_val;
				obj_values[prop_name] = { Action: 'PUT', Value: Value };
			} else {
				obj_values[prop_name] = { Action: 'DELETE' };
			}
		}
	}


	var args = {
		Key: dynamizeKey(obj.constructor, obj.getID()),
		TableName: table_name,
		AttributeUpdates: obj_values,
	};
	if(expected){
		args.Expected = expected;
	}

	// Save using updateItem, this prevents us from clobbering properties
	// we don't know about
	dynamodb.updateItem(args, function(err, data){
		if(err){
			console.error(err, data);
			console.log('ERROR WITH', args);
		}
		if(callback){
			callback(err, data);
		}
	});
}

/**
 * Calls the UpdateItem API:
 * http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/DynamoDB.html#updateItem-property
 *
 * @param obj: The object to update
 * @param updates: The "AttributeUpdates" to send
 * @param callback: The callback to fire with the results of this update operation
 * @param expected: Optional "Expected" to send
 */
function updateItem(obj, updates, callback, expected){
	var args = {
		TableName: obj.constructor._table_name,
		Key: dynamizeKey(obj.constructor, obj.getID()),
		AttributeUpdates: updates,
		ReturnValues: 'ALL_NEW',
	};
	if(expected){
		args.Expected = expected;
	}
	dynamodb.updateItem(args, callback);
}


/**
 * Delete an item from DynamoDB
 * @param obj: The object to remove
 * @param callback: An optional callback to call when the operation succeeds, or fails
 */
function remove(obj, callback){
	var params = {
		TableName: obj.constructor._table_name,
		Key: dynamizeKey(obj.constructor, obj.getID())
	};
	dynamodb.deleteItem(params, function(err, data){
		if (err){
			console.error(err);
		}
		if(callback){
			callback(err, data);
		}
	});
}

/**
 * Generic parser for a list of objects
 * Called by both Query and Scan
 */
function listIterator(model, callback, err, data, opts, continue_function){
	if(err){
		console.error(err);
		callback(err);
	} else {
		if(data.Count > 0){
			data.Items.forEach(function(item){
				callback(null, model.from_dynamo(item), data.LastEvaluatedKey);
			});
			// Page
			if(data.LastEvaluatedKey && !opts.Limit && continue_function){
				opts.ExclusiveStartKey = data.LastEvaluatedKey;
				setTimeout(function(){
					continue_function(model, opts, callback);
				}, 1000);
			} else {
				callback(null, null, data.LastEvaluatedKey);
			}
		} else {
			callback(null, null, data.LastEvaluatedKey);
		}
	}
}

/**
 * Query the table
 * @param model: The Model object to look for
 * @param opts: Additional options to send to the query function
 * @param callback: Callback to hit when the operation is completed
 * @see http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/DynamoDB.html#query-property
 */
function query(model, opts, callback){
	opts.TableName = model._table_name;
	if(opts.match){
		opts.KeyConditions = {};
		Object.keys(opts.match).forEach(function(prop_name){
			var prop = model._properties[prop_name];
			var val = opts.match[prop_name];
			if(typeof val == 'object'){
				var attr_vals = [];
				val.forEach(function(v){
					var attr_val = {};
					attr_val[prop.type_code] = v;
					attr_vals.push(attr_val);
				});
				opts.KeyConditions[prop_name] = {
					AttributeValueList: attr_vals,
					ComparisonOperator: 'IN'
				};
			} else {
				var attr_value = {};
				attr_value[prop.type_code] = val;
				opts.KeyConditions[prop_name] = {
					AttributeValueList: [attr_value],
					ComparisonOperator: 'EQ'
				};
			}
		});
		delete opts.match;
	}
	dynamodb.query(opts, function(err, data){
		listIterator(model, callback, err, data, opts, query);
	});
}
/**
 * Scan through all objects in a given model
 * @param model: The model object to iterate over
 * @param opts: Additional options to send to the Scan function
 * @param callback: The callback function to be called with the results
 * @see http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/DynamoDB.html#scan-property
 */
function scan(model, opts, callback){
	opts.TableName = model._table_name;
	// Cheap way to make a copy
	var scanOpts = JSON.parse(JSON.stringify(opts));
	if(opts.PageLimit){
		scanOpts.Limit = opts.PageLimit;
		delete scanOpts.PageLimit;
	}
	dynamodb.scan(scanOpts, function(err, data){
		listIterator(model, callback, err, data, opts, scan);
	});
}

/**
 * Define a new Model
 * @param $type: An optional $type for this object, if specified, all
 * 			Objects returned will have this property
 * @param mapping: An optional list of property mappings, { source: 'SourceParamName', dest: 'DestinationParamName' }
 * @param table_name: The name of the DynamoDB Table
 * @param key: An array of HashKeyName and RangeKeyName,
 * 	or a single string if it's only a HashKey
 * @param properties: A dictionary of property names and definitions
 */
function define(options){
	var History = require('./resources/history').History;
	
	var Cls = function(hashKey, rangeKey){
		this[Cls._hashKeyName] = hashKey;
		if(typeof rangeKey != 'undefined'){
			this[Cls._rangeKeyName] = rangeKey;
		}
	};
	// Make this an EventEmitter subclass
	util.inherits(Cls, EventEmitter);

	// on(Save|Update) and after(Save|Update) Are events,
	// and do not block
	['onSave', 'afterSave', 'onUpdate', 'afterUpdate'].forEach(function(fname){
		if(typeof options[fname] == 'function'){
			Cls.prototype.on(fname, options[fname]);
		}
	});

	// beforeSave and beforeUpdate are regular functions that can block
	['beforeSave', 'beforeUpdate'].forEach(function(fname){
		if(typeof options[fname] == 'function'){
			Cls.prototype[fname] = options[fname];
		}
	});

	if(options.$type){
		Cls.$type = options.$type;
		Cls.prototype.$type = Cls.$type;
	}
	// Allow mappings
	Cls.$paramMapping = options.mapping;

	// Save all options
	Cls.$options = options;

	// Allows an "onRemove" trigger to be called
	// when remove() is called
	if(typeof options.onRemove == 'function'){
		Cls.prototype.onRemove = options.onRemove;
	} else {
		Cls.prototype.onRemove = function(){};
	}

	if(typeof options.key == 'string'){
		Cls._hashKeyName = options.key;
		Cls._hashKeyType = options.properties[options.key].type_code;
	} else {
		Cls._hashKeyName = options.key[0];
		Cls._hashKeyType = options.properties[options.key[0]].type_code;
		Cls._rangeKeyName = options.key[1];
		Cls._rangeKeyType = options.properties[options.key[1]].type_code;
	}
	Cls._table_name = options.tableName;
	Cls._properties = options.properties;

	Cls.lookup = function(id, callback, opts){
		return lookup(Cls, id, callback, opts);
	};
	/**
	 * @param callback: Callback to fire when the save is completed
	 * @param expected: An optional condition of the save
	 * @param log: Optional values to send to the History log:
	 *		method
	 *		url
	 *		user
	 *		comment
	 *		transaction_id
	 */
	Cls.prototype.save = function(callback, expected, log){
		var self = this;

		if(!log){
			log = {};
		}

		// Allow $comment, $user, and $transaction_id
		// to be passed in as regular arguments.
		['$comment', '$user', '$transaction_id'].forEach(function(prop_name){
			if(self[prop_name]){
				log[prop_name.substring(1)] = self[prop_name];
				delete self[prop_name];
			}
		});

		function doSaveOperation(){
			// Triggers any "onSave" events
			self.emit('onSave');
			return save(self, function(err, data){
				// Allow History Tracking
				if( Cls.$options.track_history ){
					// This parameter Mapping is REQUIRED to make history tracking work
					if(Cls.$type){
						self.$type = Cls.$type;
					}
					// Allow dynamic mapping of parametrs
					if(Cls.$paramMapping){
						Cls.$paramMapping.forEach(function(map){
							self[map.dest] = self[map.source];
						});
					}

					// New objects wouldn't yet have a $hist object
					var hist = self.$hist;
					if(!hist){
						hist = new History();
					}
					hist.obj = { $type: self.$type, $id: self.$id };
					hist.new_obj = self.getSimplified();
					// Allow adding in special options
					if(log){
						Object.keys(log).forEach(function(key){
							hist[key] = log[key];
						});
					}

					// Set the current date as the timestamp
					hist.ts = new Date();
					hist.save();
				}
				// Trigger any "afterSave" events
				self.emit('afterSave');

				if(callback){
					callback(err, data);
				}
			}, expected);
		}


		// Allow before Save triggers, which
		// allows us to intercept, block, and run
		// asychronously
		if(typeof self.beforeSave == 'function'){
			self.beforeSave(doSaveOperation);
		} else {
			doSaveOperation();
		}
	};
	Cls.prototype.remove = function(callback){
		this.onRemove();
		return remove(this, callback);
	};

	/**
	 * Allows incrementing a value
	 * @param props: An object mapping of property_name: value to add
	 * @param callback: An optional function to call back with the results
	 */
	Cls.prototype.add = function objAdd(props, callback){
		var self = this;
		var AttributeUpdates = {};
		Object.keys(props).forEach(function(prop_name){
			if(Cls._properties[prop_name]){
				var val = props[prop_name];
				val = convertValueToDynamo(val);
				var DynamoValue = {};
				DynamoValue[Cls._properties[prop_name].type_code] = val;
				AttributeUpdates[prop_name] = {
					Action: 'ADD',
					Value: DynamoValue,
				};
				updateItem(self, AttributeUpdates, callback);
			} else {
				throw new Error('Property not found', prop_name);
			}
		});
	};

	/**
	 * Allows setting specific properties
	 * @param props: An object mapping of property_name: value to set, or "null" to remove
	 * @param callback: An optional function to call back with the results
	 * @param log: An optional set of log parameters to send
	 */
	Cls.prototype.set = function objAdd(props, callback, log){
		var self = this;
		var AttributeUpdates = {};

		self.emit('onUpdate', props);

		if(!log){
			log = {};
		}

		// Allow $comment, $user, and $transaction_id
		// to be passed in as regular arguments.
		['$comment', '$user', '$transaction_id'].forEach(function(prop_name){
			if(props[prop_name]){
				log[prop_name.substring(1)] = props[prop_name];
				delete props[prop_name];
			}
		});

		// Handle any Auto-Properties
		Object.keys(Cls._properties).forEach(function(prop_name){
			var prop = Cls._properties[prop_name];
			// Automatic properties should still be updated
			if(prop.options && prop.options.auto_now){
				var val = new Date();

				// Update the original object so the history gets updated properly
				self[prop_name] = val;
				val = prop.encode(val);
				// Convert
				val = convertValueToDynamo(val);

				var DynamoValue = {};
				DynamoValue[Cls._properties[prop_name].type_code] = val;
				AttributeUpdates[prop_name] = {
					Action: 'PUT',
					Value: DynamoValue,
				};

			}
		});


		Object.keys(props).forEach(function(prop_name){
			var prop = Cls._properties[prop_name];
			if(prop){
				var val = props[prop_name];
				self[prop_name] = val;

				if(val === null){
					AttributeUpdates[prop_name] = {
						Action: 'DELETE',
					};
				} else {

					// Encode
					if(prop.encode){
						val = prop.encode(val);
					}

					// Validate
					prop.validate(val);

					// Convert
					val = convertValueToDynamo(val);

					var DynamoValue = {};
					DynamoValue[Cls._properties[prop_name].type_code] = val;
					AttributeUpdates[prop_name] = {
						Action: 'PUT',
						Value: DynamoValue,
					};
				}
			} else {
				console.error('Property not found', prop_name);
				throw new Error('Property not found ' + prop_name);
			}
		});

		// Allow History Tracking
		if( Cls.$options.track_history ){

			// This parameter Mapping is REQUIRED to make history tracking work
			if(Cls.$type){
				self.$type = Cls.$type;
			}
			// Allow dynamic mapping of parametrs
			if(Cls.$paramMapping){
				Cls.$paramMapping.forEach(function(map){
					self[map.dest] = self[map.source];
				});
			}

			// New objects wouldn't yet have a $hist object
			var hist = self.$hist;
			if(!hist){
				hist = new History();
			}
			hist.obj = { $type: self.$type, $id: self.$id };
			hist.new_obj = self.getSimplified();
			// Allow adding in special options
			if(log){
				Object.keys(log).forEach(function(key){
					hist[key] = log[key];
				});
			}

			// Set the current date as the timestamp
			hist.ts = new Date();
			hist.save();
		}

		updateItem(self, AttributeUpdates, function(err, data){
			if(callback){
				callback(err, data);
			}
			self.emit('afterUpdate', err, data);
		});

	};



	Cls.prototype.getID = function(){
		if(Cls._rangeKeyName){
			return [this[Cls._hashKeyName], this[Cls._rangeKeyName]];
		} else {
			return this[Cls._hashKeyName];
		}
	};

	/**
	 * Get a simplified version, for saving to CloudSearch
	 */
	Cls.prototype.getSimplified = function getSimplified(){
		var self = this;
		var ret = {};
		Object.keys(Cls._properties).forEach(function(prop_name){
			var prop = Cls._properties[prop_name];
			var val = self[prop_name];
			// Make sure the value is not empty, but allow 0
			if(val !== undefined && val !== null && val !== ''){
				// Allow the custom encode function to be fired here
				if(prop.encode_for_search && prop.encode){
					val = prop.encode(val);
				}
				// If the property name starts with a $, remove it
				ret[prop_name.replace('$', '')] = val;
			}
		});
		return ret;
	};

	/**
	 * Lookup the History for this object
	 */
	Cls.prototype.getHistory = function getHistory(callback, opts){
		var id_string = JSON.stringify({ $type: this.$type, $id: this.$id, });
		if(opts === undefined || opts === null){
			opts = {};
		}
		opts.match = { obj: id_string };
		opts.ScanIndexForward = false;
		History.query(opts, callback);
	};

	/**
	 * Blame - Similar to the "git blame" command,
	 * allows us to determine who is responsible for a given
	 * field being the current value.
	 *
	 * @param callback: The function to call with the "Blame" object
	 */
	Cls.prototype.blame = function blame(callback){
		var self = this;
		var id_string = JSON.stringify({ $type: self.$type, $id: self.$id, });
		// Initialize the parameter history log
		var params = {};
		Object.keys(Cls._properties).forEach(function(prop_name){
			params[prop_name] = null;
		});

		// Look through the history to find when the first time was that each
		// property was set
		self.getHistory(function(err, history){
			if(history !== null){
				// Loop over every parameter we're looking for
				Object.keys(params).forEach(function(param_name){
					// Only look if this history record isn't already found
					if(params[param_name] === null){
						if(!history.old_obj || JSON.stringify(history.old_obj[param_name]) != JSON.stringify(history.new_obj[param_name])){
							params[param_name] = {
								user: history.user,
								ts: history.ts,
								transaction_id: history.transaction_id,
								comment: history.comment,
								last_value: history.old_obj[param_name],
							};
						}
					}
				});
			} else {
				// Done, return the History Summary
				callback(params);
			}
		});
	};

	/**
	 * Batch Fetch,
	 * takes a list of IDs
	 */
	Cls.batchLookup = function(ids, callback, opts){
		return batchLookup(Cls, ids, callback, opts);
	};

	/**
	 * Query function
	 */
	Cls.query = function(opts, callback){
		return query(Cls, opts, callback);
	};
	/**
	 * Iterate over all values
	 */
	Cls.forEach = function(callback, opts){
		return scan(Cls, opts || {}, function(err, data){
			callback(data);
		});
	};

	/**
	 * Scan, returns objects in batches
	 */
	Cls.scan = function(callback, opts){
		opts = opts || {};
		opts.TableName = Cls._table_name;
		// Handle the next_fnc being bassed in as an ExclusiveStartKey
		if(typeof opts.ExclusiveStartKey == 'function'){
			opts.ExclusiveStartKey(callback, opts);
		} else {
			dynamodb.scan(opts, function(err, data){
				if(err){
					// If the error is re-tryable, send along a 
					// 'next function', which lets the user re-try this action
					if(err && err.code && err.code == 'ProvisionedThroughputExceededException'){
						callback(err, data, delayFunction(Cls.scan, callback, opts));
					} else {
						callback(err, null);
					}
				} else {
					var batch = [];
					if(data.Count > 0){
						data.Items.forEach(function(item){
							batch.push(Cls.from_dynamo(item));
						});
					}
					var next = null;
					if(data.LastEvaluatedKey){
						opts.ExclusiveStartKey = data.LastEvaluatedKey;
						next = delayFunction(Cls.scan, callback, opts);
					}
					callback(err, batch, next);
				}
			});
		}
	};

	/**
	 * Return this object type from a DynamoDB Item
	 */
	Cls.from_dynamo = function(item){
		var obj = new Cls();
		if(Cls.$type){
			obj.$type = Cls.$type;
		}

		for (var prop_name in item){
			var prop_val = item[prop_name];
			// Converts the Dynamo Types into simple JSON types
			for( var prop_type in prop_val){
				var val = item[prop_name][prop_type];
				// Check what we expected
				var expected_prop = Cls._properties[prop_name];
				var expected_type = null;
				if(expected_prop){
					expected_type = expected_prop.type_code;
				}
				// Decode into the Base Type
				if(prop_type == 'N'){
					val = parseInt(val, 10);
				} else if (expected_type == 'SS' && prop_type == 'S'){
					val = [val];
				}
				// Decode into the JS type
				if(expected_prop && expected_prop.decode !== undefined){
					try {
						val = expected_prop.decode(val);
					} catch (e) {
						console.error('Could not decode property', prop_name, val, e);
					}
				}

				obj[prop_name] = val;
			}
		}

		// Allow dynamic mapping of parametrs
		if(Cls.$paramMapping){
			Cls.$paramMapping.forEach(function(map){
				obj[map.dest] = obj[map.source];
			});
		}

		// Store the Original object for History tracking
		if(Cls.$options.track_history){
			obj.$hist = new History();
			obj.$hist.old_obj = obj.getSimplified();
		}


		return obj;
	};

	/**
	 * Returns the statistics from DynamoDB, including approximate size and item count
	 * @see: http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/DynamoDB.html#describeTable-property
	 */
	Cls.describe = function(callback){
		dynamodb.describeTable({ TableName: Cls._table_name }, callback);
	};


	return Cls;
}

exports.define = define;
exports.types = require('./db.types.js');
