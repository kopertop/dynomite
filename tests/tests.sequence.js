/*
 * @author Chris Moyer <cmoyer@newstex.com>
 * Test the Sequence Generator
 *
 */
'use strict';

var assert = require('assert');
var Sequence = require('../resources/sequence.js');

describe('Sequence', function(){

	it('Should get the next item in this sequence', function(done){
		Sequence.lookup('Test', function(sequence){
			if(!sequence){
				sequence = new Sequence('Test');
				sequence.value = 0;
				sequence.save();
			}
			var old_sequence = sequence.value;
			sequence.next(function(err, id){
				console.log({err: err, id: id, old_sequence: sequence.value});
				assert(!err);
				assert(id > old_sequence);
				done();
			});
		});
	});
});
