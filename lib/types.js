const modbusErrorMessages =
[   'Unknown error',
	'Illegal function (device does not support this read/write function)',
	'Illegal data address (register not supported by device)',
	'Illegal data value (value cannot be written to this register)',
	'Slave device failure (device reports internal error)',
	'Acknowledge (requested data will be available later)',
	'Slave device busy (retry request again later)'
];

const batteryStatus = [
	'OFFLINE',
	'STANDBY',
	'RUNNING',
	'FAULT',
	'SLEEP_MODE'
];

const dataRefreshRate = {
	low : Symbol('low'),
	high  : Symbol('high'),
	compare (refresh,fieldRefresh) {
		/*
		if (refresh == undefined) {
			return (fieldRefresh !== this.high);
		} else {
			return (fieldRefresh == refresh );
		}*/
		if (!fieldRefresh && refresh !== this.high ) return true;
		return (fieldRefresh === refresh );
	}
};

const registerType = {
	inverter : Symbol('inverter'),
	meter    : Symbol('meter'),
	battery  : Symbol('battery')
};

//export enum ModbusDatatype {
const dataType = {
	//enums using Sympls
	int16: Symbol('int16'),
	int32: Symbol('int32'),
	string: Symbol('string'),
	uint16: Symbol('uint16'),
	uint32: Symbol('uint32'),

	size(type) {
		switch (type) {
			case this.int16:
				return 1;
			case this.int32:
				return 2;
			case this.uint16:
				return 1;
			case this.uint32:
				return 2;
			case this.string:
				return undefined;
		}
	},

	convert(array,type) {
		switch (type) {
			case this.int16:
				return this.readSignedInt16(array);
			case this.int32:
				return this.readSignedInt32(array);
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
		else                value = array[0];
		return value;
	},

	readSignedInt32(array)
	{   let value = 0;
		for (let i = 0; i < 2; i++) { value = (value << 16) | array[i]; }
		return value;
	},
	readStr(array, length) {
		const bytearray = [];
		console.log(array);
		for(let i = 0; i < length; i++)
		{
			if (array[i] > 0 ) {
				bytearray.push(array[i] >> 8); //right shift
				bytearray.push(array[i] & 0xff);
			}
		}
		//const value =  String.fromCharCode.apply(null, bytearray);
		const value =  String.fromCharCode(...bytearray);
		return new String(value).trim();
	}
};

/*
class dataBuffer {
	constructor(length,offset) {
		this._length = length;
		this._offset = offset;
		this._buffer = new Array(this._length);
	}
	set (address,array) {
		array.forEach((item, i) => {
			this._buffer[address - this._offset + i] = item;
		});
	}
	get (address,len) {
		const pos = address - this._offset;
		return this._buffer.slice(pos,pos+len);
	}
}
*/

module.exports = {
	modbusErrorMessages,
	batteryStatus,
	dataRefreshRate,
	registerType,
	dataType
};