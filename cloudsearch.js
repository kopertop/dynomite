/*
 * CloudSearch Search and Document Index
 * wrappers
 *
 * @author Chris Moyer <cmoyer@newstex.com>
 */
/* global process, Buffer */
const http = require('http');
const querystring = require('querystring');

/**
 * Generic request function that handles proxies
 */
function request(options, callback, endpoint){

	// Proxy Support
	if(process.env.http_proxy){
		let proxy = process.env.http_proxy.split('/')[2].split(':');
		options.host = proxy[0];
		options.port = parseInt(proxy[1], 10);
		options.path = 'http://' + endpoint + options.path;
		if(!options.headers){
			options.headers = {};
		}
		options.headers.Host = endpoint;
	}

	return http.request(options, function(resp){
		let buffer = '';
		resp.on('data', function(chunk){
			buffer += chunk;
		});
		resp.on('end', function(){
			if(resp.statusCode < 300){
				try{
					callback(JSON.parse(buffer));
				} catch (e){
					console.error({
						module: 'cloudsearch',
						err: e
					});
					callback({msg: buffer});
				}
			} else {
				callback({error: resp.statusCode, msg: buffer});
			}
		});
	});

}

/**
 * CloudSearch SearchConnection
 * Usage:
 *
 * 	let conn = new SearchConnection({
 * 		endpoint: 'search-domain.us-east-1.cloudsearch.amazonaws.com'
 * 	})
 * 	conn.search({ 
 * 		bq: "foo:'bar'", 
 * 		rank: '-date', 
 * 		start: 0,
 * 		size: 0
 * 	}, function(data){
 * 		console.log(data);
 * 	);
 *
 * @param endoint:  String - Hostname of the search endpoint
 * @param item_class:  Class - An optional override of a class to call to return instead of
 * 		a generic object
 */
function SearchConnection(args){
	this.endpoint = args.endpoint;
	this.version = args.version || '2011-02-01';
}
SearchConnection.prototype.search = function (args, callback){
	// CloudSearch doesn't support multiple arguments in a REST style format,
	// but instead wants them joined with commas, so we simplify them.
	let simplified_args = {};
	Object.keys(args).forEach(function(key){
		let value = args[key];
		if(typeof value == 'object'){
			simplified_args[key] = value.join(',');
		} else {
			simplified_args[key] = value;
		}
	});
	let options = {
		host: this.endpoint,
		path: '/' + this.version + '/search?' + querystring.stringify(simplified_args)
	};

	request(options, callback, this.endpoint).end();
};

exports.SearchConnection = SearchConnection;

/**
 * DocumentConnection - Used to add new documents to a CloudSearch Index
 *
 * Usage:
 * 	let conn = new DocumentConnection({
 * 		endpoint: 'document-domain.us-east-1.cloudsearch.amazonaws.com'
 * 	})
 * 	conn.add({
 * 		id: 'abc_123456_7890',
 * 		version: 1,
 * 		lang: 'en',
 * 		fields: {
 * 			name: 'Foo',
 * 			text: 'Some long text to be indexed'
 * 		}
 * 	});
 * 	conn.delete({
 * 		id: 'document_to_delete',
 * 		version: 2
 * 	});
 * 	conn.commit(function(data){
* 			console.log(data);
 * 	);
 *
 * @param endoint:  String - Hostname of the search endpoint
 *
 * @param endoint:  String - Hostname of the document endpoint
 */
function DocumentConnection(args){
	this.endpoint = args.endpoint;
	this.batch = [];
	this.version = args.version || '2011-02-01';
}

/**
 * Add a document to the batch to be submitted to cloudsearch
 * Note that this does not actually submit anything, but mearly adds a document to the
 * `batch` parameter on this object
 *
 * @param args: Arguments, should contain an object with the following parameters
 * 	id: Document Identifier (string), Must consist of all lowercase alpha numeric values, or _
 * 	version: Document Version (number)
 * 	lang: Document Language ISO code (should almost always be "en"), if not specified, we default to "en"
 * 	fields: The list of metadata fields to index.
 *
 */
DocumentConnection.prototype.add = function (args){
	args.type = 'add';
	this.batch.push(args);
	return this;
};
/**
 * Remove a document from cloudsearch
 * Like `add`, this does not actually submit any changes, but adds
 * the pending change to the `batch` parameter
 *
 * @param args: Arguments, should contain an object with the following parameters
 * 	id: Document Identifier (string), Must consist of all lowercase alpha numeric values, or _
 * 	version: Document Version (number)
 */
DocumentConnection.prototype.delete = function (args){
	args.type = 'delete';
	this.batch.push(args);
	return this;
};

/**
 * Clear out the pending changes
 */
DocumentConnection.prototype.clear = function (){
	this.batch = [];
	return this;
};

/**
 * Commit the pending changes
 *
 * @param callback: A callback function to call when the operation is completed
 */
DocumentConnection.prototype.commit = function (callback){
	let self = this;

	if (this.batch && this.batch.length > 0) {
		let sdf = JSON.stringify(this.batch);

		let options = {
			host: this.endpoint,
			path: '/' + this.version + '/documents/batch',
			headers: {
				'Content-Type': 'application/json',
				'Content-Length': Buffer.byteLength(sdf)
			},
			method: 'POST'
		};
		let req = request(options, function(data){
			self.clear();
			if(callback){
				callback(data);
			}
		}, this.endpoint);
		req.write(sdf);
		req.end();
	} else if (callback) {
		callback({ msg: 'Nothing to upload' });
	}
	return self;
};


exports.DocumentConnection = DocumentConnection;
