/*
 * @author Chris Moyer <cmoyer@newstex.com>
 * Mocha tests for the UID Unique Identifier system
 *
 */
/* global require, beforeEach, it, describe */
var assert = require('assert');
var UID = require('../resources/uid.js');

beforeEach(function(){
	console.log('\n======================================================================');
});

describe('[UID]', function(){

	it('Should create a new UID object', function(done){
		UID.next('Test', function(obj){
			console.log('Object Created', obj);
			// Makes sure the object is returned
			assert(obj);
			// And has an ID
			assert(obj.$id);
			// And the created_at was automatically set
			assert(obj.created_at);
			// And lastly, that our custom property was set
			assert.equal(obj.name, 'My Object Name');

			done();
		}, {name: 'My Object Name'});
	});
});
