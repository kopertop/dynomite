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
