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
	this.encode = JSON.stringify;
	this.decode = JSON.parse;
}
util.inherits(ReferenceProperty, Property);


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
		if(val && typeof val == 'object'){
			val = val.getTime()/1000;
		}
		return val;
	};
	this.decode = function(val){
		if(val && typeof val == 'number'){
			val = new Date(val*1000);
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

exports.Property = Property;
exports.StringProperty = StringProperty;
exports.ReferenceProperty = ReferenceProperty;
exports.NumberProperty = NumberProperty;
exports.DateTimeProperty = DateTimeProperty;
exports.SetProperty = SetProperty;
