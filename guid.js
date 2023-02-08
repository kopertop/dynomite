/**
 * @author: Chris Moyer <cmoyer@newstex.com>
 * Generates a GUID, similar to Twitter Snowflake.
 * Incredibly fast, and not network dependent.
 * This uses a combination of the last two parts of your IP address,
 * and the process ID. We also use the full timestamp, and make sure we don't
 * ever generate an ID that's older then the previous generated ID.
 * You should use NTP or something similar to keep your
 * system clock in sync.
 *
 * IDs returned are roughly sortable by date, and hex
 */
/* global process */
const crypto = require('crypto');

// Get the local machine ID, for which we just use 
// the IP address, containing the last two octets
let machine_id = null;
let ifaces = null;

// Convert a string integer into a hex value, padded
// to two characters
function toHex(val){
	val = parseInt(val, 10).toString(16);
	return String('0' + val).slice(-2);
}
function checkForPrimaryInterface(details){
	if(!machine_id){
		if (details.family === 'IPv4' && details.address !== '127.0.0.1') {
			machine_id = details.address.split('.');
			machine_id = toHex(machine_id[2]) + toHex(machine_id[3]);
		}
	}
}
function getRandom(){
	return crypto.randomBytes(1).toString('hex');
}

// On lambda, you can't access the OS
try {
	const os = require('os');
	ifaces = os.networkInterfaces();
	for (let ifaceName in ifaces){
		ifaces[ifaceName].forEach(checkForPrimaryInterface);
		if(machine_id){
			break;
		}
	}
	if(machine_id === null){
		machine_id = getRandom();
	}
} catch (e) {
	machine_id = getRandom();
}

// The Sequence ID is just the process ID (PID)
// We allow 4 octets for storage here as well
let sequence_id = toHex(process.pid/256) + toHex(process.pid%256);
// Initialize the "last_id" to the value it would be right now
let last_id = (new Date()).getTime().toString(16) + sequence_id + machine_id;

/**
 * Return the next ID in a sequence
 * Note that this is a blocking method, but you can also provide
 * a callback
 */
exports.next = function next(cb){
	let next_id = 0;
	while(parseInt(last_id, 16) >= next_id){
		let now = new Date();
		next_id = now.getTime().toString(16) + sequence_id + machine_id;
	}
	if(cb){
		cb(next_id);
	}
	return next_id;
};
exports.machine_id = machine_id;
exports.sequence_id = sequence_id;
exports.getRandom = getRandom;
