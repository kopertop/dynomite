/*
 * DB Types, Property mappings
 *
 * @author: Chris Moyer <cmoyer@newstex.com>
 */
/* global require, exports */
var util = require('util');

/**
 * Base Property
 * @property options: A map of options, such as verbose_name, validator, etc.
 * @type options: object
 */
function Property(options){
	this.options = options;
	this.type_code = 'S';
	this.encode_for_search = true;
	if(options && options.validate){
		this.validate = options.validate;
	} else {
		this.validate = function(val){
		};
	}
}


/**
 * String Property
 */
function StringProperty(options){
	Property.call(this, options);
}
util.inherits(StringProperty, Property);

/**
 * Reference Property, a link to another object
 */
function ReferenceProperty(options){
	Property.call(this, options);

	/**
	 * Order is important with encoding, so we
	 * make sure we always do $type, then $id
	 */
	this.encode = function(val){
		if(!val){
			return val;
		}

		// Allow "Simple" reference properties
		// which only encode to the ID string
		if(this.options.simple){
			return val.$id;
		} else {
			return JSON.stringify({
				$type: val.$type,
				$id: val.$id,
			});
		}
	};

	/**
	 * Allow for decoding of both Simple and Normal
	 * Reference Properties
	 */
	this.decode = function decodeReferenceProperty(val){
		if(!val){
			return val;
		}

		// A "Simple" reference property
		// only contains the ID of the object,
		// not the full object type and ID JSON string
		if(this.options.simple){
			return { $type: this.options.$type, $id: val };
		} else {
			return JSON.parse(val);
		}
	};
}
util.inherits(ReferenceProperty, Property);

/**
 * JSON Property, Generic Property that can take anything
 * that can be passed through JSON.stringify and JSON.parse
 */
function JSONProperty(options){
	Property.call(this, options);

	this.encode = JSON.stringify;
	this.decode = JSON.parse;
}
util.inherits(JSONProperty, Property);


/**
 * Number Property
 */
function NumberProperty(options){
	if(options && !options.validate && (options.max || options.min)){
		options.validate = function(val){
			if(options.max && val > options.max){
				throw new Error('Value ' + val + ' is greater then ' + options.max);
			}
			if(options.min && val < options.min){
				throw new Error('Value ' + val + ' is less then ' + options.min);
			}
		};
	}
	Property.call(this, options);
	this.type_code = 'N';
}
util.inherits(NumberProperty, Property);

/**
 * DateTime Property
 */
function DateTimeProperty(options){
	Property.call(this, options);
	this.type_code = 'N';
	this.encode = function(val){
		if(val){
			if(typeof val == 'string'){
				val = Math.round(new Date(val).getTime()/1000);
			} else if(typeof val == 'object'){
				val = Math.round(val.getTime()/1000);
			}
		}
		return val;
	};
	this.decode = function(val){
		if(val){
			if(typeof val == 'number'){
				val = new Date(val*1000);
			} else if (typeof val == 'string'){
				val = new Date(val);
			}
		}
		return val;
	};
}
util.inherits(DateTimeProperty, Property);


/**
 * Set Property
 */
function SetProperty(options){
	Property.call(this, options);
	if(options.type == Number || options.type == Boolean){
		this.type_code = 'NS';
	} else {
		this.type_code = 'SS';
	}
}
util.inherits(SetProperty, Property);

/**
 * List (Ordered) Property
 */
var GROUP_SEPARATOR = '\x1d';
function ListProperty(options){
	Property.call(this, options);
	this.type_code = 'S';
	this.encode_for_search = false; // Do not allow encoding for search indexing

	this.encode = function encodeList(val){
		if(val !== null && typeof val == 'object' && typeof val.join == 'function'){
			val = val.join(GROUP_SEPARATOR);
		}
		if(!val || val.length === 0){
			val = null;
		}
		return val;
	};

	this.decode = function decodeList(val){
		if(typeof val == 'string'){
			val = val.split(GROUP_SEPARATOR);
		}
		return val;
	};
}
util.inherits(ListProperty, Property);


exports.Property = Property;
exports.StringProperty = StringProperty;
exports.ReferenceProperty = ReferenceProperty;
exports.JSONProperty = JSONProperty;
exports.NumberProperty = NumberProperty;
exports.DateTimeProperty = DateTimeProperty;
exports.SetProperty = SetProperty;
exports.ListProperty = ListProperty;
