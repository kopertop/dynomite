/*
 * DynamoDB base stuff
 *
 * @author Chris Moyer <cmoyer@newstex.com>
 */
/* global require, exports */
var AWS = require('aws-sdk');
AWS.config.update({region: 'us-east-1'});
var dynamodb = new AWS.DynamoDB();

/**
 * Dynamize the hashKey and rangeKey ID
 */
function dynamizeKey(model, id){
	var key = {};
	if(typeof id == 'string'){
		key[model._hashKeyName] = {};
		key[model._hashKeyName][model._hashKeyType] =  id;
	} else {
		key[model._hashKeyName] = {};
		key[model._hashKeyName][model._hashKeyType] =  id[0];
		key[model._rangeKeyName] = {};
		key[model._rangeKeyName][model._rangeKeyType] =  id[1];
		
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
	obj_values[obj.constructor._hashKeyName] = {};
	obj_values[obj.constructor._hashKeyName][obj.constructor._hashKeyType] = obj[obj.constructor._hashKeyName];
	for (var prop_name in properties){
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
		if(typeof prop_val != 'undefined' && prop_val !== null && (typeof prop_val != 'object' || !(prop_val instanceof Array) || prop_val.length > 0)){
			obj_values[prop_name] = {};
			if(prop_type.length == 2 && prop_type[1] == 'S'){
				for (var n in prop_val){
					prop_val[n] = convertValueToDynamo(prop_val[n]);
				}
			} else {
				prop_val = convertValueToDynamo(prop_val);
			}
			obj_values[prop_name][prop_type] = prop_val;
		}
	}


	var args = {
		TableName: table_name,
		Item: obj_values,
	};
	if(expected){
		args.Expected = expected;
	}

	// Save
	dynamodb.putItem(args, function(err, data){
		if(err){
			console.error(err);
		}
		if(callback){
			callback(err, data);
		}
	});
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
				callback(null, model.from_dynamo(item));
			});
			// Page
			if(data.LastEvaluatedKey && !opts.Limit && continue_function){
				opts.ExclusiveStartKey = data.LastEvaluatedKey;
				continue_function(model, opts, callback);
			}
		} else {
			callback(null, null);
		}
	}
}

/**
 * Query the table
 * @param model: The Model object to look for
 * @param opts: Additional options to send to the query function
 * @param callback: Callback to hit when the operation is completed
 * @see http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/DynamoDB_20120810.html#query-property
 */
function query(model, opts, callback){
	opts.TableName = model._table_name;
	if(opts.match){
		opts.KeyConditions = {};
		Object.keys(opts.match).forEach(function(prop_name){
			var prop = model._properties[prop_name];
			var attr_value = {};
			attr_value[prop.type_code] = opts.match[prop_name];
			opts.KeyConditions[prop_name] = {
				AttributeValueList: [attr_value],
				ComparisonOperator: 'EQ'
			};
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
 * @see http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/DynamoDB_20120810.html#scan-property
 */
function scan(model, opts, callback){
	opts.TableName = model._table_name;
	dynamodb.scan(opts, function(err, data){
		listIterator(model, callback, err, data, opts, scan);
	});
}

/**
 * Define a new Model
 * @param table_name: The name of the DynamoDB Table
 * @param key: An array of HashKeyName and RangeKeyName,
 * 	or a single string if it's only a HashKey
 * @param properties: A dictionary of property names and definitions
 */
function define(options){
	
	var Cls = function(hashKey, rangeKey){
		this[Cls._hashKeyName] = hashKey;
		if(typeof rangeKey != 'undefined'){
			this[Cls._rangeKeyName] = rangeKey;
		}
	};
	// Allows an "onSave" trigger to be called
	// when save() is called
	if(typeof options.onSave == 'function'){
		Cls.prototype.onSave = options.onSave;
	} else {
		Cls.prototype.onSave = function(){};
	}

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
	Cls.prototype.save = function(cb, expected){
		this.onSave();
		return save(this, cb, expected);
	};
	Cls.prototype.remove = function(callback){
		this.onRemove();
		return remove(this, callback);
	};
	Cls.prototype.getID = function(){
		if(Cls._rangeKeyName){
			return [this[Cls._hashKeyName], this[Cls._rangeKeyName]];
		} else {
			return this[Cls._hashKeyName];
		}
	};
	//
	// Batch Fetch,
	// takes a list of IDs
	//
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
		dynamodb.scan(opts, function(err, data){
			if(err){
				callback(err, null);
			} else {
				var batch = [];
				if(data.Count > 0){
					data.Items.forEach(function(item){
						batch.push(Cls.from_dynamo(item));
					});
				}
				callback(err, batch, data.LastEvaluatedKey);
			}
		});
	};

	/**
	 * Return this object type from a DynamoDB Item
	 */
	Cls.from_dynamo = function(item){
		var obj = new Cls();
		for (var prop_name in item){
			var prop_val = item[prop_name];
			for( var prop_type in prop_val){
				if(prop_type == 'N'){
					obj[prop_name] = parseInt(item[prop_name][prop_type], 10);
				} else {
					obj[prop_name] = item[prop_name][prop_type];
				}
			}
		}
		return obj;
	};

	return Cls;
}

exports.define = define;
exports.types = require('./db.types.js');
