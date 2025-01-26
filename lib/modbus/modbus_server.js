const ModbusRTU = require('modbus-serial');
const tcpPortUsed = require('tcp-port-used');

//https://github.com/yaacov/node-modbus-serial/blob/master/examples/server.js
class ModbusServer {
	constructor(adapterInstance, ip, port) {
		this._ip = ip;
		this._port = port;
		this.adapter = adapterInstance;
		this.log = this.adapter.logger;
		this._isConnected = false;
		this._stat = {};

		//https://github.com/yaacov/node-modbus-serial/blob/master/ServerTCP.d.ts
		this.vector = {
			getInputRegister: async (addr, unitId, callback) => {
				await this._handleGetReg('getInputRegister', addr, 1, unitId, callback);
			},
			getHoldingRegister: async (addr, unitId, callback) => {
				await this._handleGetReg('getHoldingRegister', addr, 1, unitId, callback);
			},
			getMultipleInputRegisters: async (startAddr, length, unitId, callback) => {
				await this._handleGetReg('getMultipleInputRegisters', startAddr, length, unitId, callback);
			},
			getMultipleHoldingRegisters: async (startAddr, length, unitId, callback) => {
				await this._handleGetReg('getMultipleHoldingRegisters', startAddr, length, unitId, callback);
			},
			getCoil: (addr, unitId, callback) => {
				this._addInfoStat('#getCoil', addr, 1, unitId);
				callback({ modbusErrorCode: 0x01, msg: 'Illegal function (device does not support this read/write function)' });
			},
			//https://github.com/yaacov/node-modbus-serial/blob/cbd4379bed9672c13ec3a8517d622b728a737a5e/servers/servertcp_handler.js#L925C16-L925C32
			setRegisterArray: async (addr, values, unitId, callback) => {
				await this._handleSetReg('setRegisterArray', addr, values, unitId, callback);
			},
			setRegister: async (addr, value, unitId, callback) => {
				await this._handleSetReg('setRegister', addr, value, unitId, callback);
			},
			setCoil: (addr, value, unitId, callback) => {
				this._addInfoStat('#setCoil', addr, value, unitId);
				callback({ modbusErrorCode: 0x01, msg: 'Illegal function (device does not support this read/write function)' });
			},
			readDeviceIdentification: () => {
				//function(addr)
				this._addInfoStat('readDeviceIdentification');
				return {
					0x00: 'ioBroker',
					0x01: 'adapter.sun2000',
					0x02: this.adapter.version,
					0x05: 'modbus-proxy',
					0x97: '',
					0xab: '',
				};
			},
		};
	}

	_addInfoStat(call, addr = 0, value = [], unitId = 0) {
		const point = `${call}-address_${addr}-value_${value}-unidId_${unitId}`;
		this._stat[point] ? this._stat[point]++ : (this._stat[point] = 1);
	}

	_waitForInitialized() {
		return new Promise(resolve => {
			if (this.serverTCP) {
				this.serverTCP.on('initialized', () => {
					this.log.info('Modbus-proxy initialized');
					this._isConnected = true;
					resolve({});
				});
			} else {
				resolve({});
			}
		});
	}

	get info() {
		return { stat: { ...this._stat } };
	}

	get isConnected() {
		return this._isConnected;
	}

	async connect() {
		try {
			//Exception cannot be caught at the moment!
			//https://github.com/yaacov/node-modbus-serial/issues/536
			const inUse = await tcpPortUsed.check(this._port, this._ip);
			if (inUse) {
				this.log.error(`Modbus-proxy TCP Port ${this._port} is now in use!`);
			} else {
				this.log.info(`Modbus-proxy listening on modbus://${this._ip}:${this._port}`);
				await this.close();
				this.serverTCP = new ModbusRTU.ServerTCP(this.vector, { host: this._ip, port: this._port, debug: false });
				await this._waitForInitialized();
				//Solution not yet released
				//https://github.com/yaacov/node-modbus-serial/pull/537
				//https://github.com/yaacov/node-modbus-serial/issues/536
				this.serverTCP.on('serverError', async err => {
					this.log.error(`Modbus-proxy (serverError) ${err}`);
					this.serverTCP && (await this.close());
				});
				this.serverTCP.on('socketError', async err => {
					this.log.warn(`Modbus-proxy (socketError) ${err}`);
					//Network error
					if (err == 'ECONNRESET') {
						this.serverTCP && (await this.close());
					}
				});
			}
		} catch (err) {
			this.log.error(`Modbus-proxy couldnt listen ${err?.message}`);
		}
	}

	/**
	 * Close the Modbus-proxy server.
	 *
	 * @returns promise
	 */
	close() {
		return new Promise(resolve => {
			this._isConnected = false;
			if (this.serverTCP) {
				this.serverTCP.close(() => {
					this.log.info('Modbus-proxy closed');
					resolve({});
				});
			} else {
				resolve({});
			}
		});
	}

	// eslint-disable-next-line jsdoc/require-returns-check
	/**
	 * Returns the device instance for the given unitId.
	 * @param {number} unitId The Modbus unitId (slaveId) of the device.
	 * @returns {object} The device instance or null if not found.
	 * Special case: unitId 250 is mapped to the device with modbusId 0.
	 */
	getDeviceInstance(unitId) {
		for (const device of this.adapter.devices) {
			if (device.instance) {
				if (unitId === 250 && device.instance?.modbusId === 0) {
					return device.instance;
				}
				if (device.instance?.modbusId === unitId) {
					return device.instance;
				}
			}
		}
	}

	/**
	 * Handle a get register request.
	 * @param {string} fnName The name of the called function (for logging).
	 * @param {number} startAddr The start address of the register.
	 * @param {number} length The length of the register.
	 * @param {number} unitId The modbus unitId.
	 * @param {Function} callback The callback function.
	 * @returns {Promise<void>}
	 */

	async _handleGetReg(fnName, startAddr, length, unitId, callback) {
		//this.adapter.log.debug('getMultipleHolgingRegisters '+unitId+' '+startAddr+' len '+length+' '+this._isConnected);
		try {
			const device = this.getDeviceInstance(unitId);
			if (device) {
				//this.adapter.log.debug('Device Info '+JSON.stringify(device?.info));
				const values = device.getHoldingRegisters(startAddr, length);
				if (this.adapter.settings.ms.log) {
					this.log.info(`Modbus-proxy: read data from id/address/data ${unitId}/${startAddr}/${values}`);
				}

				if (!this.adapter.isConnected) {
					//this._addInfoStat('#WaitForConnected',startAddr, length, unitId);
					await this.wait(500);
					callback({ modbusErrorCode: 0x05, msg: 'Acknowledge (requested data will be available later)' });
				} else {
					if (values[0] == null) {
						this._addInfoStat(`#${fnName}`, startAddr, length, unitId);
						await this.wait(200);
					} else {
						this._addInfoStat(fnName, startAddr, length, unitId);
						await this.wait(50);
					}
					callback(undefined, values);
				}
			} else {
				this._addInfoStat(`#${fnName}`, startAddr, length, unitId);
				await this.wait(500);
				callback({ modbusErrorCode: 0x01, msg: 'Illegal function (device does not support this read/write function)' });
			}
		} catch {
			this._addInfoStat(`#${fnName}`, startAddr, length, unitId);
			await this.wait(500);
			callback({ modbusErrorCode: 0x04, msg: 'Slave device failure (device reports internal error)' });
		}
	}

	async _handleSetReg(fnName, address, data, unitId, callback) {
		if (this.adapter.settings.ms.log) {
			this.log.info(`Modbus-proxy: Try to write data to id/address ${unitId}/${address}/${data}`);
		} else {
			this.log.debug(`Modbus-proxy: Try to write data to id/address ${unitId}/${address}/${data}`);
		}
		try {
			const device = this.getDeviceInstance(unitId);
			if (!device) {
				await this.wait(500);
				callback({ modbusErrorCode: 0x01, msg: `Device ID ${unitId} not supported by device` });
				return;
			}
			if (!this.adapter.isConnected) {
				this.log.info('Modbus-proxy: please wait until connected.');
				callback({ modbusErrorCode: 0x05, msg: 'Acknowledge (requested data will be available later)' });
				return;
			}
			if (!this.adapter.modbusClient) {
				this.log.error('Modbus-proxy: no modbus-client is registered!');
				callback({ modbusErrorCode: 0x04, msg: 'Slave device failure (device reports internal error)' });
				return;
			}
			this.adapter.modbusClient.setID(unitId);
			if (Array.isArray(data)) {
				await this.adapter.modbusClient.writeRegisters(address, data);
				//write also to the read cache
				device.addHoldingRegisters(address, data);
				this._addInfoStat(fnName, address, data.length, unitId);
			} else {
				await this.adapter.modbusClient.writeRegister(address, data);
				device.addHoldingRegisters(address, [data]);
				this._addInfoStat(fnName, address, 1, unitId);
			}
			callback();
		} catch (err) {
			this.log.warn(`Modbus-proxy: can not write data to id/address ${unitId}/${address}/${data}`);
			this.log.warn(`Modbus-proxy: ${err?.message}`);
			if (Array.isArray(data)) {
				this._addInfoStat(`#${fnName}`, address, data.length, unitId);
			} else {
				this._addInfoStat(`#${fnName}`, address, 1, unitId);
			}
			await this.wait(500);
			callback({ modbusErrorCode: err?.modbusCode, msg: err?.message });
		}
	}

	wait(ms) {
		return new Promise(resolve => setTimeout(resolve, ms));
	}
}

module.exports = ModbusServer;
