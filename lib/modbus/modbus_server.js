const ModbusRTU = require('modbus-serial');
const tcpPortUsed = require('tcp-port-used');

// https://github.com/yaacov/node-modbus-serial/blob/master/examples/server.js
class ModbusServer {
	constructor (adapterInstance,ip, port) {
		this._ip = ip;
		this._port = port;
		this.adapter = adapterInstance;

		this._isConnected = false;
		this._stat = {};

		this.vector = {
			getInputRegister: (addr, unitId, callback) => {
				this._addInfoStat('#getInputRegister',addr, 1 , unitId);
				callback({ modbusErrorCode: 0x01, msg: 'Illegal function (device does not support this read/write function)' });
			},
			getHoldingRegister: (addr, unitId, callback) => {
				this._handleGetReg(addr, 1, unitId, callback);
			},
			getMultipleInputRegisters: (startAddr, length,unitId, callback ) => {
				this._addInfoStat('#getMultipleInputRegisters',startAddr, length, unitId);
				callback({ modbusErrorCode: 0x01, msg: 'Illegal function (device does not support this read/write function)' });
			},
			getMultipleHoldingRegisters: (startAddr, length, unitId, callback) => {
				this._handleGetReg(startAddr, length, unitId, callback);
			},
			getCoil: (addr,unitId, callback) => {
				this._addInfoStat('#getCoil',addr, 1 , unitId);
				callback({ modbusErrorCode: 0x01, msg: 'Illegal function (device does not support this read/write function)' });
			},
			setRegister: (addr, value,unitId, callback) => {
				this._addInfoStat('#readDeviceIdentification',addr, value, unitId);
				callback({ modbusErrorCode: 0x01, msg: 'Illegal function (device does not support this read/write function)' });
			},
			setCoil: (addr, value, unitId, callback) => {
				this._addInfoStat('#setCoil',addr, value, unitId);
				callback({ modbusErrorCode: 0x01, msg: 'Illegal function (device does not support this read/write function)' });
			},
			readDeviceIdentification: () => { //function(addr)
				this._addInfoStat('readDeviceIdentification');
				console.log('DeviceIntification');
				return {
					0x00: 'MyVendorName',
					0x01: 'MyProductCode',
					0x02: 'MyMajorMinorRevision',
					0x05: 'MyModelName',
					0x97: 'MyExtendedObject1',
					0xAB: 'MyExtendedObject2'
				};
			}
		};
	}

	_addInfoStat (call, addr=0, value=[], unitId=0) {
		const point = call+'-address_'+addr+'-value_'+value+'-unidId_'+unitId;
		this._stat[point] ? this._stat[point] ++ : this._stat[point] = 1;
	}

	_waitForInitialized() {
		return new Promise((resolve) => {
			if (this.serverTCP) {
				this.serverTCP.on('initialized', () => {
					this.adapter.log.info('ModbusTCP server initialized');
					this._isConnected = true;
					resolve({});
				});
			} else {
				resolve({});
			}
		});
	}

	get info() {
		return {stat: {...this._stat}};
	}

	get isConnected () {
		return this._isConnected;
	}

	async connect() {
		try {
			//Exception cannot be caught at the moment!
			//https://github.com/yaacov/node-modbus-serial/issues/536
			const inUse = await tcpPortUsed.check(this._port, this._ip);
			if (inUse) {
				this.adapter.log.error('TCP Port '+this._port+' is now in use!');
			} else {
				this.adapter.log.info('ModbusTCP listening on modbus://'+this._ip+':'+this._port);
				await this.close();
				this.serverTCP = new ModbusRTU.ServerTCP(this.vector, { host: this._ip, port: this._port, debug: false});
				await this._waitForInitialized();
				//Solution not yet released
				//https://github.com/yaacov/node-modbus-serial/pull/537
				// @ts-ignore
				this.serverTCP.on('serverError',async (err) => {
					this.adapter.log.error('ModbusTCP server (serverError) '+err);
					if (err !== 'ECONNRESET' ) this.serverTCP && await this.close();
				});
				this.serverTCP.on('socketError', async (err) => {
					this.adapter.log.error('ModbusTCP server (socketError) '+err);
					//Network error
					if (err !== 'ECONNRESET' ) this.serverTCP && await this.close();
				});
			}
		} catch (err){
			this.adapter.log.error('ModbusTCP server couldnt listen '+err?.message);
		}
	}


	close() {
		return new Promise((resolve) => {
			this._isConnected = false;
			if (this.serverTCP) {
				this.serverTCP.close(() => {
					this.adapter.log.info('ModbusTCP server closed');
					resolve({});
				});
			} else {
				resolve({});
			}
		});
	}

	getDeviceInstance(unitId) {
		for (const device of this.adapter.devices) {
			if (device.instance) {
				if (device.instance?.modbusId === unitId) return device.instance;
			}
		}

	}

	async _handleGetReg (startAddr, length, unitId, callback) {
		//this.adapter.log.debug('getMultipleHolgingRegisters '+unitId+' '+startAddr+' len '+length+' '+this._isConnected);
		try {
			const device = this.getDeviceInstance(unitId);
			if (device) {
				//this.adapter.log.debug('Device Info '+JSON.stringify(device?.info));
				const values = device.getHoldingRegisters(startAddr,length);
				//if (values[0] == null) {
				if (!this.adapter.isReady) {
					this._addInfoStat('#WaitForConnected',startAddr, length, unitId);
					await this.wait(500);
					callback({ modbusErrorCode: 0x05, msg: 'Acknowledge (requested data will be available later)' });
				} else {
					if (values[0] == null) this._addInfoStat('#getMultipleHoldingRegisters',startAddr, length, unitId);
					else this._addInfoStat('getMultipleHoldingRegisters',startAddr, length, unitId);
					await this.wait(50);
					callback(undefined,values);
				}
			} else {
				this._addInfoStat('#getMultipleHoldingRegisters',startAddr, length, unitId);
				await this.wait(500);
				callback({ modbusErrorCode: 0x01, msg: 'Device ID '+unitId+' not supported by device' });
			}
		} catch (err) {
			this._addInfoStat('#getMultipleHoldingRegisters',startAddr, length, unitId);
			await this.wait(500);
			callback({ modbusErrorCode: 0x04, msg: 'Slave device failure (device reports internal error)' });
		}
	}

	wait(ms){
		return new Promise(resolve => setTimeout(resolve, ms));
	}
}

module.exports = ModbusServer;