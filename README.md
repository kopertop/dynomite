Dynomite DynamoDB ORM
=====================

This package contains a basic ORM for using DynamoDB with CloudSearch.

It does not contain an application server. It is designed to be used in conjunction with your systems.

Installation:
-------------

	 npm install dynomite


Usage
-----

Defining your own objects is simple:

	var Test = db.define({
		tableName: 'Test',
		key: '__id__',
		properties: {
			__id__: new db.types.StringProperty(),
			name: new db.types.StringProperty({verbose_name: 'My Name'}),
			numeric: new db.types.NumberProperty({verbose_name: 'Some Number'}),
			num_restricted: new db.types.NumberProperty({min: 1, max:10}),
			stringSet: new db.types.SetProperty({ type: String, verbose_name: 'A list of strings'}),
			numberSet: new db.types.SetProperty({ type: Number, verbose_name: 'A list of numbers'})
		}
	});

Once you have an object, you can create new instances of it, and save it:

	var obj = new Test('foo');
	obj.name = 'My Object Name';
	obj.numeric = 10;
	obj.stringSet = ['foo', 'bar', 'biz'];
	obj.save(function(err, data){
		console.log('Object was saved!');
	});



Test
----

Run the test case with:

	 npm test

History
-------

As of version 0.2.0, Dynomite Supports Transactional History tracking.

This lets you track History for any given object and create a new History
object anytime that object is changed.  Anytime the save() function is called,
it automatically creates the History object. This contains the "new" object
in a simplified JSON form. If you use a lookup, batchLookup, scan, or query
function, this object will also contain the "original" object.

Additional parameters may be passed along with a save operation,
Typically this will include things like the User that made the change,
as well as a Comment. You can also include a "transaction_id", which,
when combined with a GSI, can be used to determine all changes that
happened in a given "transaction".

To enable this functionality, you must first create a DynamoDB table
with HashKey of "obj" (S) and RangeKey of "ts" (N). You should also add
a GSI of "transaction_id" if you wish to use that feature.

Then you can enable History tracking on each individual object you wish
to have tracked, by simply adding "track_history: true" to the
definitions:

	db.create({
		track_history: true

Each object will also need a $type and $id so you can properly reference
the object that was changed.

Some Special parameters may also be sent along with the save() function.
By default $user, $comment, and $transaction_id are all supported in the standard
arguments of an object, but you can also pass along any arguments you want to
the "log" property of the save function:

	obj.$comment = 'This is why I made this change';
	obj.$user = { $type: 'User', $id: 'my-user-id' };
	obj.save(cb, expected, { 'url': 'http://some_url', 'method', 'POST' })

