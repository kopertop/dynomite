/*
 * DB Types, Property mappings
 *
 * @author: Chris Moyer <cmoyer@newstex.com>
 */
'use strict';

var util = require('util');
var moment = require('moment');
var AWS = require('aws-sdk');

/**
 * Base Property
 * @property options: A map of options, such as verbose_name, validator, etc.
 * @type options: object
 */
function Property(options){
	this.options = options || {};
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
 * Boolean Property
 */
function BooleanProperty(options){
	Property.call(this, options);
	this.type_code = 'N';

	this.encode = function encodeBoolean(val){
		if(val){
			return 1;
		} else if (val !== undefined) {
			return 0;
		} else {
			return undefined;
		}
	};

	this.decode = function decodeBoolean(val){
		if(val === 1){
			return true;
		} else if (val === 0) {
			return false;
		} else {
			return undefined;
		}
	};
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
			if(typeof val === 'string'){
				val = Math.round(new Date(val).getTime()/1000);
			} else if(typeof val === 'object'){
				val = Math.round(val.getTime()/1000);
			}
		}
		return val;
	};
	this.decode = function(val){
		if(val){
			if(typeof val === 'number'){
				val = new Date(val*1000);
			} else if (typeof val === 'string'){
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
	if(options.type === Number || options.type === Boolean){
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
		if(val !== null && typeof val === 'object' && typeof val.join === 'function'){
			val = val.join(GROUP_SEPARATOR);
		}
		if(!val || val.length === 0){
			val = null;
		}
		return val;
	};

	this.decode = function decodeList(val){
		if(typeof val === 'string'){
			val = val.split(GROUP_SEPARATOR);
		}
		return val;
	};
}
util.inherits(ListProperty, Property);

/**
 * File property, Stored in S3
 * The actual data stored here is just a JSON blob of metadata.
 * do NOT set the contents of the file as the property here. Use something like
 * https://github.com/danialfarid/angular-file-upload
 *
 * @param bucket: Name of the bucket to store to
 * @param prefix: Optional string to prefix every file with
 */
function FileProperty(options){
	JSONProperty.call(this, options);

	/**
	 * Gets the Metadata for uploading a new version
	 * @param obj: The object this metadata upload is for
	 * @param callback: The callback to fire with the response metadata
	 */
	this.getUploadMetadata = function getUploadMetadata(obj, callback){
		var self = this;

		// Allow parameterizing the Prefix, with things like ${ts}
		// for version handling, and ${id} for identifying what object
		// this belongs to
		var prefix = this.options.prefix || '${id}/${ts}/';
		var now = new Date();
		prefix = prefix.replace('${ts}', now.getTime());
		prefix = prefix.replace('${id}', obj.$id);

		var policy_document = {
			expiration: moment.utc().add('1', 'hour').format('YYYY-MM-DDTHH:mm:ss') + 'Z',
			conditions: [
				{ bucket: self.options.bucket },
				{ acl: self.options.acl || 'private' },
				[ 'starts-with', '$key', prefix ],
				[ 'starts-with', '$Content-Type', self.options.content_type || '' ],
				[ 'starts-with', '$filename', self.options.filename_prefix || '' ],
			],
		};
		console.log(policy_document.expiration);
		var policy_string = AWS.util.base64.encode(JSON.stringify(policy_document));
		AWS.config.getCredentials(function(err, credentials){
			var signature = AWS.util.crypto.hmac(credentials.secretAccessKey, policy_string, 'base64', 'sha1');
			var metadata = {
				prefix: prefix + (self.options.filename_prefix || ''),
				AWSAccessKeyId: credentials.accessKeyId,
				acl: self.options.acl || 'private',
				policy: policy_string,
				signature: signature,
				url: 'https://' + self.options.bucket + '.s3.amazonaws.com/',
				'Content-Type': self.options.content_type || '',
			};
			// Adds support for IAM Roles
			if(credentials.sessionToken){
				metadata['x-amz-security-token'] = credentials.sessionToken;
			}
			callback(metadata);
		});
	};
}
util.inherits(FileProperty, JSONProperty);



exports.Property = Property;
exports.StringProperty = StringProperty;
exports.ReferenceProperty = ReferenceProperty;
exports.JSONProperty = JSONProperty;
exports.NumberProperty = NumberProperty;
exports.BooleanProperty = BooleanProperty;
exports.DateTimeProperty = DateTimeProperty;
exports.SetProperty = SetProperty;
exports.ListProperty = ListProperty;
exports.FileProperty = FileProperty;
