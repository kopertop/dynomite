/*
 * DynamoDB base stuff
 *
 * @author Chris Moyer <cmoyer@newstex.com>
 */
'use strict';

const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB({
	maxRetries: 3,
});
const EventEmitter = require('events').EventEmitter;
const util = require('util');
const _ = require('lodash');

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
	const key = {};
	if(typeof id === 'string'){
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
	const args = {
		TableName: model._table_name,
		Key: dynamizeKey(model, id)
	};
	if(opts){
		for(let x in opts){
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
	const keys = [];
	for(let x in ids){
		const id = ids[x];
		keys.push(dynamizeKey(model, id));
	}
	const args = { RequestItems: { } };
	args.RequestItems[model._table_name] = { Keys: keys };

	dynamodb.batchGetItem(args, function(err, data){
		if(err){
			console.error(err);
			callback(null, err);
		} else {
			const items = [];
			for(let x in data.Responses[model._table_name]){
				const item = data.Responses[model._table_name][x];
				items.push(model.from_dynamo(item));
			}
			callback(items);
		}
	});
}


/**
 * Generic function to convert a value to the dynamo form
 */
function convertValueToDynamo(val, type_code){
	if(typeof val === 'number'){
		if(type_code === undefined){
			type_code = 'N';
		}
		val = String(val);
	} else if (util.isArray(val)){
		if(type_code === undefined){
			type_code = 'L';
		}
		// Convert each item in the list to the type of value it is
		const vals = [];
		val.forEach(function(v, $index){
			// Lists could be either the 'L' type, or a Set type
			if(type_code && type_code.length === 2 && type_code[1] === 'S'){
				// If we're a Set, don't encode
				// the type-code with every sub-value
				vals.push(convertValueToDynamo(v, null));
			} else {
				// Otherwise we just want to infer what type
				// we are from the type of value passed in
				vals.push(convertValueToDynamo(v));
			}
		});
		val = vals;
	} else if (typeof val === 'object'){
		if(val instanceof Date){
			if(type_code === undefined){
				type_code = 'N';
			}
			val = String(val.getTime());
			// Prevent invalid dates
			if(val === 'NaN'){
				val = '0';
			}
		} else {
			type_code = 'M';
		}
	}
	// For Map Properties, we need to also convert every sub element
	if(type_code === 'M' && typeof val === 'object'){
		_.forEach(val, function(v, k){
			val[k] = convertValueToDynamo(v);
		});
	}

	if(type_code === undefined){
		if(typeof val === 'boolean'){
			type_code = 'BOOL';
		} else {
			// The default type code is String
			type_code = 'S';
		}
	}
	// This allows us to pass "null", (different from undefined) to explicitly
	// exclude returning the format { type_code: val }
	if(type_code !== null){
		return { [type_code]: val };
	} else {
		return val;
	}
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
	const table_name = obj.constructor._table_name;
	const properties = obj.constructor._properties;
	
	// Create the Object Value mapping
	const obj_values = { };
	//obj_values[obj.constructor._hashKeyName] = {};
	//obj_values[obj.constructor._hashKeyName][obj.constructor._hashKeyType] = obj[obj.constructor._hashKeyName];
	const ignored_props = [
		obj.constructor._hashKeyName,
	];
	if(obj.constructor._rangeKeyName){
		ignored_props.push(obj.constructor._rangeKeyName);
	}
	for (let prop_name in properties){
		if(ignored_props.indexOf(prop_name) < 0){
			const prop_type = properties[prop_name].type_code;
			let prop_val = obj[prop_name];

			// Validate
			properties[prop_name].validate(prop_val);

			// Check for custom property options
			if(properties[prop_name].options){
				// Auto now and Auto now add should automatically get set
				if((properties[prop_name].options.auto_now_add && !prop_val) || properties[prop_name].options.auto_now){
					prop_val = new Date();
					// Also set the value on the object so it is returned properly
					obj[prop_name] = prop_val;
				}
				// Default values should be set on save
				if(properties[prop_name].options.default !== undefined && prop_val === undefined ){
					prop_val = properties[prop_name].options.default;
					obj[prop_name] = prop_val;
				}
			}

			// Encode if we have an encoder
			if(properties[prop_name].encode){
				prop_val = properties[prop_name].encode(prop_val);
			}


			// Make sure this is a non-null, non-empty value
			if(typeof prop_val !== 'undefined' && prop_val !== null && (typeof prop_val !== 'object' || !(prop_val instanceof Array) || prop_val.length > 0)){
				obj_values[prop_name] = {};
				prop_val = convertValueToDynamo(prop_val, prop_type);
				obj_values[prop_name] = { Action: 'PUT', Value: prop_val };
			} else {
				obj_values[prop_name] = { Action: 'DELETE' };
			}
		}
	}


	const args = {
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
			console.log('ERROR WITH', JSON.stringify(args));
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
	const args = {
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
	const params = {
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
			} else if(data.LastEvaluatedKey) {
				callback(null, null, data.LastEvaluatedKey, function(){
					opts.ExclusiveStartKey = data.LastEvaluatedKey;
					continue_function(model, opts, callback);
				});
			} else {
				callback(null, null);
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
			const prop = model._properties[prop_name];
			const val = opts.match[prop_name];
			if(typeof val === 'object'){
				const attr_vals = [];
				val.forEach(function(v){
					const attr_val = {};
					attr_val[prop.type_code] = v;
					attr_vals.push(attr_val);
				});
				opts.KeyConditions[prop_name] = {
					AttributeValueList: attr_vals,
					ComparisonOperator: 'IN'
				};
			} else {
				const attr_value = {};
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
	const scanOpts = JSON.parse(JSON.stringify(opts));
	if(opts.PageLimit){
		scanOpts.Limit = opts.PageLimit;
		delete scanOpts.PageLimit;
	}
	dynamodb.scan(scanOpts, function(err, data){
		listIterator(model, callback, err, data, opts, scan);
	});
}


/**
 * Decode a dynamo Property
 */
function decodeDynamoProperty(prop_val, prop_name, Cls){
	let ret_value = null;
	_.forOwn(prop_val, function(val, prop_type){
		// Check what we expected
		let expected_prop = Cls._properties[prop_name];
		let expected_type = null;
		if(expected_prop){
			expected_type = expected_prop.type_code;
		}
		// Decode into the Base Type
		if(prop_type === 'N'){
			val = parseInt(val, 10);
		} else if (prop_type === 'M'){
			// MAP type
			_.forOwn(val, function(v, k){
				val[k] = decodeDynamoProperty(v, k, Cls);
			});
		} else if (expected_type === 'SS' && prop_type === 'S'){
			val = [val];
		} else if (prop_type === 'L'){
			const listValue = [];
			val.forEach(function(v){
				// We intentionally do NOT want to send the prop_name here, because
				// we don't want the decode function to be called on every sub-value
				listValue.push(decodeDynamoProperty(v, null, Cls));
			});
			val = listValue;
		} else {
		}
		// Decode into the JS type
		if(expected_prop && expected_prop.decode !== undefined){
			try {
				val = expected_prop.decode(val);
			} catch (e) {
				console.error('Could not decode property', prop_name, val, e, prop_val);
				val = null;
			}
		}
		if(ret_value === null){
			ret_value = val;
		} else {
			ret_value.push(val);
		}
	});
	return ret_value;
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
	const History = require('./resources/history').History;
	
	const Cls = function(hashKey, rangeKey){
		this[Cls._hashKeyName] = hashKey;
		if(typeof rangeKey !== 'undefined'){
			this[Cls._rangeKeyName] = rangeKey;
		}
	};
	// Make this an EventEmitter subclass
	util.inherits(Cls, EventEmitter);

	// on(Save|Update) and after(Save|Update) Are events,
	// and do not block
	['onSave', 'afterSave', 'onUpdate', 'afterUpdate'].forEach(function(fname){
		if(typeof options[fname] === 'function'){
			Cls.prototype.on(fname, options[fname]);
		}
	});

	// beforeSave and beforeUpdate are regular functions that can block
	['beforeSave', 'beforeUpdate'].forEach(function(fname){
		if(typeof options[fname] === 'function'){
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
	if(typeof options.onRemove === 'function'){
		Cls.prototype.onRemove = options.onRemove;
	} else {
		Cls.prototype.onRemove = function(){};
	}

	if(typeof options.key === 'string'){
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
	 * @param skip_history: Optional, boolean, if set to true, ignore history tracking for this save
	 */
	Cls.prototype.save = function(callback, expected, log, skip_history){
		const self = this;

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
				if( Cls.$options.track_history && !skip_history ){
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
					const hist = self.$hist;
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
				self.emit('afterSave', err, data, log);

				if(callback){
					callback(err, data);
				}
			}, expected);
		}


		// Allow before Save triggers, which
		// allows us to intercept, block, and run
		// asychronously
		if(typeof self.beforeSave === 'function'){
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
		const self = this;
		const AttributeUpdates = {};
		Object.keys(props).forEach(function(prop_name){
			if(Cls._properties[prop_name]){
				const val = props[prop_name];
				AttributeUpdates[prop_name] = {
					Action: 'ADD',
					Value: convertValueToDynamo(val, Cls._properties[prop_name].type_code),
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
	 * @param skip_history: Optional, boolean value, if true, skip history tracking for this operation
	 */
	Cls.prototype.set = function objAdd(props, callback, log, skip_history){
		const self = this;
		const AttributeUpdates = {};

		function doUpdateOperation(){
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
				const prop = Cls._properties[prop_name];
				// Automatic properties should still be updated
				if(prop.options && prop.options.auto_now){
					let val = new Date();

					// Update the original object so the history gets updated properly
					self[prop_name] = val;
					val = prop.encode(val);
					// Convert
					AttributeUpdates[prop_name] = {
						Action: 'PUT',
						Value: convertValueToDynamo(val, Cls._properties[prop_name].type_code),
					};

				}
			});


			Object.keys(props).forEach(function(prop_name){
				const prop = Cls._properties[prop_name];
				if(prop){
					let val = props[prop_name];
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
						AttributeUpdates[prop_name] = {
							Action: 'PUT',
							Value: convertValueToDynamo(val, Cls._properties[prop_name].type_code),
						};
					}
				} else {
					console.error('Property not found', prop_name);
					throw new Error('Property not found ' + prop_name);
				}
			});

			// Allow History Tracking
			if( Cls.$options.track_history && !skip_history ){

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
				const hist = self.$hist;
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
				self.emit('afterUpdate', err, data, log);
			});

		}

		// Allow before Update triggers, which
		// allows us to intercept, block, and run
		// asychronously
		if(typeof self.beforeUpdate === 'function'){
			self.beforeUpdate(doUpdateOperation, props);
		} else {
			doUpdateOperation();
		}
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
		const self = this;
		const ret = {};
		Object.keys(Cls._properties).forEach(function(prop_name){
			const prop = Cls._properties[prop_name];
			// Ignore any hidden properties
			if (!(prop && prop.options && prop.options.hidden === true)){
				let val = self[prop_name];
				// Make sure the value is not empty, but allow 0
				if(val !== undefined && val !== null && val !== ''){
					// Allow the custom encode function to be fired here
					if(prop.encode_for_search && prop.encode){
						val = prop.encode(val);
					}
					// If the property name starts with a $, remove it
					ret[prop_name.replace('$', '')] = val;
				}
			}
		});
		return ret;
	};

	/**
	 * Lookup the History for this object
	 */
	Cls.prototype.getHistory = function getHistory(callback, opts){
		const id_string = JSON.stringify({ $type: this.$type, $id: this.$id, });
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
		const self = this;
		// Initialize the parameter history log
		const params = {};
		Object.keys(Cls._properties).forEach(function(prop_name){
			// Ignore any hidden properties
			if(prop_name[0] !== '_'){
				params[prop_name] = null;
			}
		});

		// Look through the history to find when the first time was that each
		// property was set
		self.getHistory(function(err, history){
			if(history !== null){
				// Loop over every parameter we're looking for
				Object.keys(params).forEach(function(param_name){
					// Only look if this history record isn't already found
					if(params[param_name] === null){
						if(!history.old_obj || (JSON.stringify(history.old_obj[param_name]) !== JSON.stringify(history.new_obj[param_name])) ){
							params[param_name] = {
								user: history.user,
								ts: history.ts,
								transaction_id: history.transaction_id,
								comment: history.comment,
							};
							// Only add the "last_value" if there was an old object
							if(history.old_obj){
								params[param_name].last_value =  history.old_obj[param_name];
							}
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
		if(typeof opts.ExclusiveStartKey === 'function'){
			opts.ExclusiveStartKey(callback, opts);
		} else {
			dynamodb.scan(opts, function(err, data){
				if(err){
					// If the error is re-tryable, send along a 
					// 'next function', which lets the user re-try this action
					if(err && err.code && err.code === 'ProvisionedThroughputExceededException'){
						callback(err, data, delayFunction(Cls.scan, callback, opts));
					} else {
						callback(err, null);
					}
				} else {
					const batch = [];
					if(data.Count > 0){
						data.Items.forEach(function(item){
							batch.push(Cls.from_dynamo(item));
						});
					}
					let next = null;
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
		const obj = new Cls();
		if(Cls.$type){
			obj.$type = Cls.$type;
		}

		for (let prop_name in item){
			const prop_val = item[prop_name];
			// Converts the Dynamo Types into simple JSON types
			obj[prop_name] = decodeDynamoProperty(prop_val, prop_name, Cls);
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

// Exported just for tests
exports.convertValueToDynamo = convertValueToDynamo;
