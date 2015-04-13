/**
 * Test the convertValueToDynamo function
 */
'use strict';

var should = require('should');
var _ = require('lodash');

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

	it('Should convert a complex MapProperty', function(){
		var values = {
			technical_contact: {
				name: 'Chris Moyer',
				email: 'cmoyer@aci.info',
			},
			bool_thing: true,
			number_thing: 5,
			list_thing: [ '1', 'a', 'f', 'Something'],
		};
		var result = db.convertValueToDynamo(values, 'M');
		console.log(result);
		result.should.have.property('M');
		_.forEach(values, function(v, k){
			result.M.should.have.property(k);
			var val = result.M[k];
			// Make sure every value is a structure
			if(k === 'technical_contact'){
				val.should.have.property('M');
			} else if (k === 'bool_thing'){
				val.should.have.property('B');
			} else if (k === 'number_thing'){
				val.should.have.property('N');
			} else if (k === 'list_thing'){
				val.should.have.property('L');
			}

		});
	});

});
