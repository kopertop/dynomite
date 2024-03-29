/*
 * @author Chris Moyer <cmoyer@newstex.com>
 * Mocha tests for Dynmoite
 *
 */
/* global describe, it, beforeEach, after */
'use strict';

require('should');
const assert = require('assert');
const db = require('../db');

/**
 * Test class for use in these test cases
 */
const Test = db.define({
	tableName: 'Test',
	key: '$id',
	properties: {
		$id: new db.types.StringProperty(),
		name: new db.types.StringProperty({verbose_name: 'My Name'}),
		numeric: new db.types.NumberProperty({verbose_name: 'Some Number'}),
		num_restricted: new db.types.NumberProperty({min: 1, max:10}),
		stringSet: new db.types.SetProperty({ type: String, verbose_name: 'A list of strings'}),
		numberSet: new db.types.SetProperty({ type: Number, verbose_name: 'A list of numbers'}),
		jsonProperty: new db.types.JSONProperty(),
		valueWithDefault: new db.types.NumberProperty({ default: 0 }),
		valueWithPositiveDefault: new db.types.NumberProperty({ default: 10 }),
		valueWithNegativeDefault: new db.types.NumberProperty({ default: -10 }),
		stringWithDefault: new db.types.StringProperty({ default: 'SomeDefaultString' }),
		someList: new db.types.ListProperty(),
	}
});

// Redefine the Test object to track history
const HistoryTest = db.define({
	$type: 'HistoryTest',
	tableName: 'Test',
	key: '$id',
	track_history: true,
	properties: {
		$id: new db.types.StringProperty(),
		name: new db.types.StringProperty({verbose_name: 'My Name'}),
		numeric: new db.types.NumberProperty({verbose_name: 'Some Number'}),
		num_restricted: new db.types.NumberProperty({min: 1, max:10}),
		stringSet: new db.types.SetProperty({ type: String, verbose_name: 'A list of strings'}),
		numberSet: new db.types.SetProperty({ type: Number, verbose_name: 'A list of numbers'})
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
		let obj = new Test('foo');
		obj.name = '123456789345987345';
		obj.stringSet = ['a', 'b', 'c', 'd'];
		obj.save(function (err) {
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
		let obj = new Test('foo');
		obj.numeric = 123;
		obj.numberSet = [123, 456, 789, 154, -10];
		obj.save(function(err) {
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
			let obj = new Test('foo');
			obj.num_restricted = 11;
			obj.save(function() {
				console.log('Saved Object with num restricted 11');
			});
		}, Error);
		assert.throws( function(){
			let obj = new Test('foo');
			obj.num_restricted = 0;
			obj.save(function() {
				console.log('Saved Object with num restricted 0');
			});
		}, Error);
		assert.throws( function(){
			let obj = new Test('foo');
			obj.num_restricted = 20;
			obj.save(function() {
				console.log('Saved Object with num restricted 20');
			});
		}, Error);

		// Try saving a valid number
		let obj = new Test('foo');
		obj.num_restricted = 5;
		obj.save(function(){});
		// Try numbers at the very edge cases
		obj.num_restricted = 1;
		obj.save(function(){});
		obj.num_restricted = 10;
		obj.save(function(){});
	});

	it('Should call our special validate function', function(done){
		function specialFnc(val){
			console.log('specialFnc called: ' + val);
			assert.equal(val, 5);
			done();
		}
		let Special = db.define({
			tableName: 'Test',
			key: '$id',
			properties: {
				$id: new db.types.StringProperty(),
				special: new db.types.StringProperty({validate: specialFnc})
			}
		});
		let obj = new Special('foo');
		obj.special = 5;
		obj.save(function() {
			console.log('Save Completed');
		});
		
	});

	it('Should return multiple items from batchLookup', function(done){
		// This test can take longer since it
		// has to save 3 items, and then do a batch lookup
		// in consistent mode
		this.timeout(15000);
		let obj1 = new Test('TestItem1');
		obj1.name = 'Some Name';
		obj1.save(function(err){
			assert(!err);
			let obj2 = new Test('TestItem2');
			obj2.name = 'Some other name';
			obj2.save(function(err){
				assert(!err);
				let obj3 = new Test('TestItem3');
				obj3.name = 'Some third name';
				obj3.stringSet = [
					'one',
					'two',
					'third'
				];
				obj3.save(function(err){
					assert(!err);
					// Batch Get
					Test.batchLookup([ 'TestItem1', 'TestItem2', 'TestItem3' ], function(data){
						// Make sure each item is in the batch result
						let has = {
							TestItem1: false,
							TestItem2: false,
							TestItem3: false
						};
						for(let x in data){
							let item = data[x];
							has[item.$id] = true;
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

	/**
	 * Tests out the JSON Property
	 */
	it('Should encode and decode our complex JSON object', function(done){
		this.timeout(15000);
		let obj = new Test('TestJSONObject');
		obj.name = 'Test JSON Object';
		obj.jsonProperty = [ [ 'Some Item', 'With Stuff', 0], [123, 'Some Other Item', 'With Things'], 'Some Basic Item', { some: 'Object', other: ['Complex Things', 123] }, 19, 0, 45];
		obj.save(function(err) {
			assert(!err);
			// Lookup the item and make sure the JSON property is the same
			Test.lookup(obj.$id, function(refObj){
				console.log('Got Object', refObj);
				assert(refObj);
				assert(refObj.jsonProperty);
				assert(refObj.jsonProperty[0][0] === 'Some Item');
				assert(refObj.jsonProperty[0][1] === 'With Stuff');
				assert(refObj.jsonProperty[0][2] === 0);
				assert(refObj.jsonProperty[2] === 'Some Basic Item');
				assert(refObj.jsonProperty[3].some ===  'Object');
				assert(refObj.jsonProperty[3].other[0] ===  'Complex Things');
				assert(refObj.jsonProperty[3].other[1] ===  123);
				assert(refObj.jsonProperty[4] === 19);
				assert(refObj.jsonProperty[5] === 0);
				assert(refObj.jsonProperty[6] === 45);
				done();
			});
		});
	});



	/**
	 * Check the history tracking
	 */
	describe('History', function(){
		this.timeout(5000);
		it('Should record a History record for a change', function(done){
			let obj = new HistoryTest();
			obj.$id = 'TestObject';
			obj.name = 'First Name';
			obj.stringSet = [ 'One', 'Two' ];
			// Saves without a Comment
			obj.save(function(){
				// Lookup the History for this object
				setTimeout(function(){
					let logsFound = 0;
					obj.getHistory(function(err, log){
						if(log){
							logsFound += 1;
							assert(log.obj.$type === 'HistoryTest');
							assert(log.obj.$id === 'TestObject');
						} else {
							console.log('Found', logsFound, 'logs');
							assert(logsFound > 0);
							done();
						}
					});
				}, 500);
			});
		});

		// Try updating an object
		it('Should record an updated History event with the original object', function(done){
			HistoryTest.lookup('TestObject', function(obj){
				assert(obj);
				obj.name = 'Second name';
				obj.stringSet.push('three');
				obj.save(function(){
					// Check for the latest history object to include both 
					setTimeout(function(){
						let foundOurLog = false;
						obj.getHistory(function(err, log){
							if(!foundOurLog && log){
								console.log('Got Log', log);
								if(log.old_obj){
									foundOurLog = true;
									done();
								}
							}
						});
					}, 500);
				});
			});
		});

		// Clean up our test object and history
		after(function(done){
			HistoryTest.lookup('TestObject', function(obj){
				if(obj){
					// Remove the base object
					obj.remove();

					// Remove all history
					obj.getHistory(function(err, log){
						console.log('History', log);
						if(log){
							log.remove(function(){
								console.log('Removed history log', log);
							});
						} else {
							setTimeout(function(){
								done();
							}, 500);
						}
					});
				}
			});
		});

	});

	// Test the "on(Save|Update)", "after(Save|Update)", "before(Save|Update)" events
	describe('Hooks', function(){
		it('Should fire our "onSave" event in the scope of this object', function(done){
			let hookObj = null;
			let HookTest = db.define({
				tableName: 'Test',
				key: '$id',
				properties: {
					$id: new db.types.StringProperty(),
					name: new db.types.StringProperty({verbose_name: 'My Name'}),
				},
				onSave: function(){
					assert(this === hookObj);
					assert(this.$id === 'MY-TEST-HOOK-ON-SAVE');
					done();
				},
			});

			hookObj = new HookTest('MY-TEST-HOOK-ON-SAVE');
			hookObj.save();
		});

		it('Should fire our "afterSave" event in the scope of this object', function(done){
			let hookObj = null;
			let HookTest = db.define({
				tableName: 'Test',
				key: '$id',
				properties: {
					$id: new db.types.StringProperty(),
					name: new db.types.StringProperty({verbose_name: 'My Name'}),
				},
				afterSave: function(){
					console.log(this);
					assert(this === hookObj);
					assert(this.$id === 'MY-TEST-HOOK-AFTER-SAVE');
					done();
				},
			});

			hookObj = new HookTest('MY-TEST-HOOK-AFTER-SAVE');
			hookObj.save();
		});

		it('Should fire our "afterUpdate" event in the scope of this object', function(done){
			let hookObj = null;
			let HookTest = db.define({
				tableName: 'Test',
				key: '$id',
				properties: {
					$id: new db.types.StringProperty(),
					name: new db.types.StringProperty({verbose_name: 'My Name'}),
				},
				afterUpdate: function(){
					console.log(this);
					assert(this === hookObj);
					assert(this.$id === 'MY-TEST-HOOK-AFTER-UPDATE');
					assert(this.name === 'Test Name');
					done();
				},
			});

			hookObj = new HookTest('MY-TEST-HOOK-AFTER-UPDATE');
			hookObj.name = 'My Name';
			hookObj.set({ name: 'Test Name' });
		});


		it('Should fire our "onUpdate" event in the scope of this object', function(done){
			let hookObj = null;
			let HookTest = db.define({
				tableName: 'Test',
				key: '$id',
				properties: {
					$id: new db.types.StringProperty(),
					name: new db.types.StringProperty({verbose_name: 'My Name'}),
				},
				onUpdate: function(props){
					console.log(this);
					assert(this === hookObj);
					assert(this.$id === 'MY-TEST-HOOK-ON-UPDATE');
					assert(this.name === 'My Name');
					assert(props.name === 'Test Name');
					done();
				},
			});

			hookObj = new HookTest('MY-TEST-HOOK-ON-UPDATE');
			hookObj.name = 'My Name';
			hookObj.set({ name: 'Test Name' });
		});

	});

	// Check Defaults
	describe('Defaults', function(){
		it('Should automatically set the defaults', function(done){
			let obj = new Test('TEST-OBJ');
			obj.save(function(){
				assert(obj.valueWithDefault === 0);
				assert(obj.valueWithPositiveDefault === 10);
				assert(obj.valueWithNegativeDefault === -10);
				obj.remove(function(){
					done();
				});
			});
		});

		it('Should not override a value with a default', function(done){
			let obj = new Test('TEST-OBJ');
			obj.valueWithDefault = 15;
			obj.valueWithPositiveDefault = -25;
			obj.valueWithNegativeDefault = 0;
			obj.save(function(){
				assert(obj.valueWithDefault === 15);
				assert(obj.valueWithPositiveDefault === -25);
				assert(obj.valueWithNegativeDefault === 0);
				obj.remove(function(){
					done();
				});
			});
		});
	});

	// Check the List property
	it('Should return a list in the same order we created it', function(done){
		this.timeout(8000);
		let obj = new Test('TEST-OBJ-LIST');
		let listValues = [1, 'A', 'foo', 'z', 0, 19, 5, 'Zoomba', 'Decimal', 12345, 8];
		obj.someList = listValues;
		obj.save(function(){
			setTimeout(function(){
				Test.lookup('TEST-OBJ-LIST', function(obj){
					obj.someList.should.be.instanceof(Array).and.have.lengthOf(listValues.length);
					obj.someList.forEach(function(value, x){
						value.should.be.equal(listValues[x]);
					});
					obj.remove(function(){
						done();
					});
				});
			}, 500);
		});
	});

	// Make sure the old-style List object will be properly decoded as well
	it('Should be backwards compatible with old-style List values', function(){
		let listValues = ['Z', 'A', 'B', 'G', '0'];
		let obj = Test.from_dynamo({
			someList: { S: listValues.join('\x1d') },
		});
		obj.someList.should.be.instanceof(Array).and.have.lengthOf(listValues.length);
		obj.someList.forEach(function(value, x){
			value.should.be.equal(listValues[x]);
		});

	});

});
