
const modbusErrorMessages =
[
	'Unknown error',
	'Illegal function (device does not support this read/write function)',
	'Illegal data address (register not supported by device)',
	'Illegal data value (value cannot be written to this register)',
	'Slave device failure (device reports internal error)',
	'Acknowledge (requested data will be available later)',
	'Slave device busy (retry request again later)'
];

function getDeviceStatusInfo(value){
	switch (value) {
		case 0x0000: return 'Standby: initializing';
		case 0x0001: return 'Standby: detecting insulation resistance';
		case 0x0002: return 'Standby: detecting irradiation';
		case 0x0003: return 'Standby: drid detecting';
		case 0x0100: return 'Starting';
		case 0x0200: return 'On-grid';
		case 0x0201: return 'Grid connection: power limited';
		case 0x0202: return 'Grid connection: selfderating';
		case 0x0203: return 'Off-grid Running';
		case 0x0300: return 'Shutdown: fault';
		case 0x0301: return 'Shutdown: command';
		case 0x0302: return 'Shutdown: OVGR';
		case 0x0303: return 'Shutdown: communication disconnected';
		case 0x0304: return 'Shutdown: power limited';
		case 0x0305: return 'Shutdown: manual startup required';
		case 0x0306: return 'Shutdown: DC switches disconnected';
		case 0x0307: return 'Shutdown: rapid cutoff';
		case 0x0308: return 'Shutdown: input underpower';
		case 0x0401: return 'Grid scheduling: cosPhi-P curve';
		case 0x0402: return 'Grid scheduling: Q-U curve';
		case 0x0403: return 'Grid scheduling: PF-U curve';
		case 0x0404: return 'Grid scheduling: dry contact';
		case 0x0405: return 'Grid scheduling: Q-P curve';
		case 0x0500: return 'Spotcheck ready';
		case 0x0501: return 'Spotchecking';
		case 0x0600: return 'Inspecting';
		case 0x0700: return 'AFCI self check';
		case 0x0800: return 'I-V scanning';
		case 0x0900: return 'DC input detection';
		case 0x0A00: return 'Running: off-grid charging';
		case 0xA000: return 'Standby: no irradiation';
		default:     return 'undefined';
	}
}

const batteryStatus = [
	'OFFLINE',
	'STANDBY',
	'RUNNING',
	'FAULT',
	'SLEEP_MODE'
];


const dataRefreshRate = {
	low : 'low',
	medium: 'medium',
	high  : 'high',
	compare (refresh,fieldRefresh) {
		if (refresh === this.high) return (fieldRefresh === this.high);
		else return (fieldRefresh !== this.high);
	}
};

const deviceType = {
	inverter : 'inverter', //default
	meter    : 'meter',
	battery  : 'battery',
	gridPowerControl : 'gridPowerControl' //v8.0.x
};

const driverClasses = {
	inverter : 'inverter',
	sdongle  : 'sdongle',
	charger : 'charger',
	logger : 'logger',
	loggerMeter : 'loggerMeter',
	emma : 'emma',
	emmaMeter : 'emmaMeter'
};

const storeType = {
	ifChanged : Symbol('ifChanged'), //default
	always    : Symbol('always'),
	never  	  : Symbol('never')
};

//export enum ModbusDatatype {
const dataType = {
	//enums using Sympls
	int16: Symbol('int16'),
	int32: Symbol('int32'),
	int64: Symbol('int64'),
	string: Symbol('string'),
	uint16: Symbol('uint16'),
	uint32: Symbol('uint32'),
	uint64: Symbol('uint64'),

	size(type) {
		switch (type) {
			case this.int16:
				return 1;
			case this.int32:
				return 2;
			case this.uint64:
				return 4;
			case this.int64:
				return 4;
			case this.uint16:
				return 1;
			case this.uint32:
				return 2;
			case this.string:
				return undefined;
		}
	},
	numToArray(num,type) {
		switch(this.size(type)) {
			case 1: {
				const int16Array = new Uint16Array([num & 0xFFFF]);
				return int16Array;
			}
			case 2: {
				const int16Array = new Uint16Array([(num & 0xFFFF0000) >> 16, (num & 0xFFFF)]);
				return int16Array;
			}
		}
		throw false;
	},
	convert(array,type) {
		switch (type) {
			case this.int16:
				return this.readSignedInt16(array);
			case this.int32:
				return this.readSignedInt32(array);
			case this.uint64:
				return this.readUnsignedInt64(array);
			case this.int64:
				return this.readSignedInt64(array);
			case this.uint16:
				return this.readUnsignedInt16(array);
			case this.uint32:
				return this.readUnsignedInt32(array);
			case this.string:
				return this.readStr(array,array.length);
		}
	},
	// some helper functions
	readUnsignedInt16(array)
	{
		return array[0];
	},

	readUnsignedInt32(array)
	{
		return array[0] * 256 * 256 + array[1];
	},

	readSignedInt16(array)
	{
		let value = 0;
		if (array[0] > 32767)   value = array[0] - 65535;
		else value = array[0];
		return value;
	},

	readSignedInt32(array)
	{
		let value = 0;
		for (let i = 0; i < 2; i++) { value = (value << 16) | array[i]; }
		return value;
	},

	readUnsignedInt64(array)
	{
		let ret = 0;
		array.forEach((val, i) => { ret += val * (256*256) ** (array.length-1-i); });
		return ret;
	},

	//https://www.codeproject.com/Questions/1249185/Decode-a-byte-array-to-a-signed-integer-up-to-bit
	readSignedInt64(array)
	{
		let ret = 0;
		if (array[0] > 32767) { // 128*256 negative number
			array.forEach((val, i) => { ret += (256*256 - val) * (256*256) ** (array.length-1-i); });
			ret = ret * -1 - 1;
		}
		else array.forEach((val, i) => { ret += val * (256*256) ** (array.length-1-i); });
		return ret;
	},

	readStr(array, length) {
		const bytearray = [];
		for(let i = 0; i < length; i++)
		{
			bytearray.push(array[i] >> 8); //right shift
			bytearray.push(array[i] & 0xff);

		}
		//const value =  String.fromCharCode.apply(null, bytearray);
		const value =  String.fromCharCode(...bytearray);
		return new String(value).replace(/\0/g,'');
	}
};



module.exports = {
	modbusErrorMessages,
	getDeviceStatusInfo,
	batteryStatus,
	dataRefreshRate,
	deviceType,
	driverClasses,
	storeType,
	dataType
};