/*
 * @author Chris Moyer <cmoyer@newstex.com>
 * Mocha tests for Tower
 *
 */
/* global require, beforeEach, describe, it */
var assert = require('assert');
var db = require('../db.js');

/**
 * Test class for use in these test cases
 */
var Test = db.define({
	tableName: 'Test',
	key: '__id__',
	properties: {
		__id__: new db.types.StringProperty(),
		name: new db.types.StringProperty({verbose_name: 'My Name'}),
		numeric: new db.types.NumberProperty({verbose_name: 'Some Number'}),
		num_restricted: new db.types.NumberProperty({min: 0, max:10}),
		stringSet: new db.types.SetProperty({ type: String, verbose_name: 'A list of strings'}),
		numberSet: new db.types.SetProperty({ type: Number, verbose_name: 'A list of numbers'})
	}
});
var fake = db.define({
	tableName: 'fake_table',
	key: 'foo',
	properties: {
		foo: new db.types.StringProperty()
	}
});

/**
 * DB Tests
 */
beforeEach(function(){
	console.log('\n======================================================================');
});

describe('[DB]', function(){

	it('Should create a new Test object in our "Tests" DynamoDB table', function(done){
		var obj = new Test('foo');
		obj.name = '123456789345987345';
		obj.stringSet = ['a', 'b', 'c', 'd'];
		obj.save(function (err, data){
			assert(!err);
			console.log('Save Completed');
			Test.lookup('foo', function(new_obj){
				assert.equal(new_obj.name, obj.name);
				assert.deepEqual(new_obj.stringSet.sort(), obj.stringSet.sort());
				done();
			});
		});
	});

	it('Should return a number, and number sets', function(done){
		var obj = new Test('foo');
		obj.numeric = 123;
		obj.numberSet = [123, 456, 789, 154, -10];
		obj.save(function(err, data){
			assert(!err);
			Test.lookup('foo', function(new_obj){
				assert.equal(new_obj.numeric, obj.numeric);
				assert.deepEqual(new_obj.numberSet.sort(), obj.numberSet.sort());
				done();
			});
		});

	});

	it('Should remove the "foo" object', function(done){
		Test.lookup('foo', function(obj){
			obj.remove(function(){
				Test.lookup('foo', function(o){
					console.log('GOT');
					console.log(o);
					assert(!o);
					done();
				}, { ConsistentRead: true });
			});
		});
	});

	it('Should not allow numbers outside of the range to be set', function(){
		assert.throws( function(){
			var obj = new Test('foo');
			obj.numeric_restricted = 11;
		}, Error);
		assert.throws( function(){
			var obj = new Test('foo');
			obj.numeric_restricted = 0;
		}, Error);
		assert.throws( function(){
			var obj = new Test('foo');
			obj.numeric_restricted = 20;
		}, Error);
	});

	it('Should call our special setter function', function(done){
		function specialFnc(val){
			console.log('specialFnc called: ' + val);
			assert.equal(val, 5);
			done();
		}
		var Special = db.define({
			tableName: 'Test',
			properties: {
				special: new db.types.StringProperty({validate: specialFnc})
			}
		});
		var obj = new Special('foo');
		obj.special = 5;
		
	});

	it('Should return multiple items from batchLookup', function(done){
		// This test can take longer since it
		// has to save 3 items, and then do a batch lookup
		// in consistent mode
		this.timeout(15000);
		var obj1 = new Test('TestItem1');
		obj1.name = 'Some Name';
		obj1.save(function(err, data){
			assert(!err);
			var obj2 = new Test('TestItem2');
			obj2.name = 'Some other name';
			obj2.save(function(err, data){
				assert(!err);
				var obj3 = new Test('TestItem3');
				obj3.name = 'Some third name';
				obj3.stringSet = [
					'one',
					'two',
					'third'
				];
				obj3.save(function(err, data){
					assert(!err);
					// Batch Get
					Test.batchLookup([ 'TestItem1', 'TestItem2', 'TestItem3' ], function(data){
						// Make sure each item is in the batch result
						var has = {
							TestItem1: false,
							TestItem2: false,
							TestItem3: false
						};
						for(var x in data){
							var item = data[x];
							has[item.__id__] = true;
						}
						assert(has.TestItem1);
						assert(has.TestItem2);
						assert(has.TestItem3);
						console.log(data.indexOf(obj1));
						console.log('done');
						done();
					}, { ConsistentRead: true });
				});
			});
		});
	});
});
