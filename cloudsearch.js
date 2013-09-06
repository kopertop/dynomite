/*
 * CloudSearch Search and Document Index
 * wrappers
 *
 * @author Chris Moyer <cmoyer@newstex.com>
 */
/* global require, exports, process */
var http = require('http');
var querystring = require('querystring');

/**
 * CloudSearch SearchConnection
 * Usage:
 *
 * 	var conn = new SearchConnection({
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
 * Arguments:
 * 	endoint - String - Hostname of the search endpoint
 * 	item_class - Class - An optional override of a class to call to return instead of
 * 		a generic object
 */
function SearchConnection(args){
	this.endpoint = args.endpoint;
}
SearchConnection.prototype.search = function (args, callback){
	// CloudSearch doesn't support multiple arguments in a REST style format,
	// but instead wants them joined with commas, so we simplify them.
	var simplified_args = {};
	Object.keys(args).forEach(function(key){
		var value = args[key];
		if(typeof value == 'object'){
			simplified_args[key] = value.join(',');
		} else {
			simplified_args[key] = value;
		}
	});
	var options = {
		host: this.endpoint,
		path: '/2011-02-01/search?' + querystring.stringify(simplified_args)
	};

	// Proxy Support
	if(process.env.http_proxy){
		var proxy = process.env.http_proxy.split('/')[2].split(':');
		options.host = proxy[0];
		options.port = parseInt(proxy[1], 10);
		options.path = 'http://' + this.endpoint + options.path;
		options.headers = {
			Host: this.endpoint
		};
	}

	http.request(options, function(resp){
		var buffer = '';
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
				}
			} else {
				callback({error: resp.statusCode, msg: buffer});
			}
		});
	}).end();
};

exports.SearchConnection = SearchConnection;
