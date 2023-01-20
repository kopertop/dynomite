/*
 * @author Chris Moyer <cmoyer@newstex.com>
 * Test the Sequence Generator
 *
 */
'use strict';

const assert = require('assert');
const Sequence = require('../resources/sequence.js');

describe('Sequence', function(){

	it('Should get the next item in this sequence', function(done){
		Sequence.lookup('Test', function(sequence){
			if(!sequence){
				sequence = new Sequence('Test');
				sequence.value = 0;
				sequence.save();
			}
			let old_sequence = sequence.value;
			sequence.next(function(err, id){
				console.log({err: err, id: id, old_sequence: sequence.value});
				assert(!err);
				assert(id > old_sequence);
				done();
			});
		});
	});
});
