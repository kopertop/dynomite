/**
 * Test the convertValueToDynamo function
 */
'use strict';

var should = require('should');

describe('convertValueToDynamo', function(){
	var db = require('../db');

	it('Should convert a list', function(){
		var now = new Date();
		var listValues = [1, 'A', 'foo', 'z', 0, 19, 5, 'Zoomba', 'Decimal', 12345, 8, now];
		var result = db.convertValueToDynamo(listValues);
		console.log(result);
		// Every item in the result should be in order, but contain a type code
		result.should.have.property('L');
		result.L.length.should.eql(listValues.length);

		listValues.forEach(function(v, $index){
			var type = 'S';
			if(typeof v === 'number' || typeof v === 'object'){
				type = 'N';
			}
			// The only object we have in our list is a Date
			if(typeof v === 'object'){
				v = v.getTime();
			}
			result.L[$index][type].should.be.equal(String(v));
		});
	});

	it('Should convert a StringSet', function(){
		var values = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
		var result = db.convertValueToDynamo(values, 'SS');
		console.log(result);
		result.should.have.property('SS');
		values.forEach(function(v){
			result.SS.should.containEql(v);
		});
	});
});
