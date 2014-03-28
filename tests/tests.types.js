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

	// Ordered List Property
	describe('List Property', function(){
		var prop = new types.ListProperty({ verbose_name: 'Some List Property'});

		it('Should properly encode a ListProperty and return it in the same order', function(){
			var testList = ['A', 1, 5, 'C', 'A', 0, 19, 'Z'];
			var output = prop.encode(testList);
			assert.equal(typeof output, 'string');
			assert.deepEqual(prop.decode(output), testList);
		});

		it('Should handle a null value', function(){
			var output = prop.encode(null);
			assert.equal(output, null);
		});

		it('Should return an empty list being a null value', function(){
			var output = prop.encode([]);
			assert.equal(output, null);
		});

	});

	// DateTime Property
	describe('DateTime Property', function(){
		var prop = new types.DateTimeProperty({ verbose_name: 'Some DateTime Property'});

		it('Should decode a string-based date-time property to a real Date object', function(){
			var testString = '2014-03-27T21:02:09.894Z';
			var output = prop.decode(testString);
			assert.equal(typeof output, 'object');
			assert.equal(prop.encode(output), 1395954130);
		});

		it('Should decode a numeric value back to a date value', function(){
			var output = prop.decode(1395954130);
			assert.deepEqual(output, new Date(1395954130000));
		});
	});

});

