/**
 * Tests the db.types module
 */
'use strict';

var assert = require('assert');
var should = require('should');
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

	// DateTime Property
	describe('DateTime Property', function(){
		var prop = new types.DateTimeProperty({ verbose_name: 'Some DateTime Property'});
		var testString = '2014-03-27T21:02:09.894Z';

		it('Should decode a string-based date-time property to a real Date object', function(){
			var output = prop.decode(testString);
			assert.equal(typeof output, 'object');
			assert.equal(prop.encode(output), 1395954130);
		});

		it('Should decode a numeric value back to a date value', function(){
			var output = prop.decode(1395954130);
			assert.deepEqual(output, new Date(1395954130000));
		});

		it('Should encode a string value into a numeric value', function(){
			assert.equal(prop.encode(testString), 1395954130);
		});

	});

	// Boolean Property
	describe('Boolean Property', function(){
		var prop = new types.BooleanProperty({ verbose_name: 'Boolean Property Test' });

		it('Should encode/decode a true value property', function(){
			var output = prop.encode(true);
			assert.equal(output, true);
			assert.equal(prop.encode(1), true);
		});

		it('Should encode/decode a false value property', function(){
			var output = prop.encode(false);
			assert.equal(output, false);
			assert.equal(prop.encode(0), false);
		});

		it('Should handle undefined values', function(){
			assert.equal(prop.encode(), undefined);
			assert.equal(prop.decode(), undefined);
		});
		

	});

	// Set property
	describe('Set Property', function(){
		var RefObj = { $id: 'SOME-ID', $type: 'SOME-TYPE', name: 'My Name', foo: [1,2,3] };

		it('Should not touch SetProperty with no $type or simple:true flag set', function(){
			var prop = new types.SetProperty({ verbose_name: 'Regular Set Property' });
			prop.should.not.have.property('encode');
		});

		it('Should not touch SetProperty WITH a $type but NOT simple:true flag set', function(){
			var prop = new types.SetProperty({ verbose_name: 'Regular Set Property with Type', $type: RefObj.$type });
			var output = prop.encode([RefObj]);
			output[0].should.eql(JSON.stringify({ $type: RefObj.$type, $id: RefObj.$id }));
		});

		it('Should convert a SetProperty with $type and simple:true into a string, then decode it back into an object', function(){
			var prop = new types.SetProperty({ verbose_name: 'SIMPLE Set Property with Type', $type: RefObj.$type, simple: true });
			var output = prop.encode([RefObj]);
			output[0].should.equal(RefObj.$id);
			output = prop.decode(output);
			output[0].should.eql({ $type: RefObj.$type, $id: RefObj.$id });
		});

	});


});

