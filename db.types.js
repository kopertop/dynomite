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
}


/**
 * String Property
 */
function StringProperty(options){
	Property.call(this, options);
}
util.inherits(StringProperty, Property);


/**
 * Number Property
 */
function NumberProperty(options){
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
exports.NumberProperty = NumberProperty;
exports.DateTimeProperty = DateTimeProperty;
exports.SetProperty = SetProperty;
