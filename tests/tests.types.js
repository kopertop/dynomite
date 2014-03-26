/**
 * Tests the db.types module
 */

/* global require, before, after, beforeEach, describe, it */
var assert = require('assert');
var types = require('../db.types');

describe('db.types', function(){

	// Reference property
	describe('Reference Property', function(){
		var RefObj = { $id: 'SOME-ID', $type: 'SOME-TYPE', name: 'My Name', foo: [1,2,3] };
		it('Should properly encode a RefObj to a JSON string with just $id and $type', function(){
			var prop = new types.ReferenceProperty({ verbose_name: 'Some Reference Property' });
			var output = prop.decode(prop.encode(RefObj));
			assert.deepEqual(output, { $type: RefObj.$type, $id: RefObj.$id });
		});

		it('Should produce and accept a simple string ID, but decode to a full object', function(){
			var prop = new types.ReferenceProperty({ verbose_name: 'Some Reference Property', simple: true, $type: 'SOME-TYPE' });
			var output = prop.encode(RefObj);
			assert.equal(output, RefObj.$id);
			output = prop.decode(output);
			assert.deepEqual(output, { $type: RefObj.$type, $id: RefObj.$id });
		});

	});

});

