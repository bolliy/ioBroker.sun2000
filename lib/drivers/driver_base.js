'use strict';

const { deviceType, storeType, dataRefreshRate, dataType } = require(`${__dirname}/../types.js`);
const { Logging, RegisterMap } = require(`${__dirname}/../tools.js`);

class DriverBase {
	constructor(stateInstance, device, options) {
		this.state = stateInstance;
		this.adapter = stateInstance.adapter;
		this.stateCache = stateInstance.stateCache;
		this.deviceInfo = device;
		this._modbusClient = null; //NEW!!
		//https://wiki.selfhtml.org/wiki/JavaScript/Operatoren/Nullish_Coalescing_Operator
		//https://stackoverflow.com/questions/2851404/what-does-options-options-mean-in-javascript
		options = options || {};
		((this._modbusId = options.modbusId ?? device.modbusId), (this._modelId = options?.modelId));
		((this._driverClass = options?.driverClass), (this._name = options?.name));

		this._errorCount = 0;
		this._modbusAllowed = true; //modbus request is allowed
		this._deviceStatus = -1; //device shutdown or standby
		this._regMap = new RegisterMap();

		this.control = null; //Sdongle Service Queue, Emma Service Queue
		this.log = new Logging(this.adapter); //my own Logger

		this.registerFields = [];
		this.postUpdateHooks = [];
		this._now = new Date();
		//this._newNow();
	}

	/**
	 * Modbus ID of the device
	 */
	get modbusId() {
		return this._modbusId;
	}

	get info() {
		return {
			driverClass: this._driverClass,
			modelId: this._modelId,
			name: this._name,
			modbusAllowed: this._modbusAllowed,
			deviceStatus: this._deviceStatus,
		};
	}

	get modbusAllowed() {
		return this._modbusAllowed;
	}

	get deviceStatus() {
		return this._deviceStatus;
	}

	_newNowTime() {
		this._now = new Date();
		return this._now.getTime();
	}

	addHoldingRegisters(startAddr, data) {
		this._regMap.set(startAddr, data);
	}

	getHoldingRegisters(startAddr, length) {
		return this._regMap.get(startAddr, length, this.adapter.isReady);
	}

	_fromArray(data, address, field) {
		//nullish coalescing Operator (??)
		const len = field.register.length ?? dataType.size(field.register.type);
		const pos = field.register.reg - address;
		return dataType.convert(data.slice(pos, pos + len), field.register.type);
	}

	_getStatePath(type) {
		let path = '';
		if (type !== deviceType.meter) {
			path = this.deviceInfo.path;
		}
		if (path !== '') {
			path += '.';
		}
		return path;
	}

	//v0.8.x
	_checkValidValueRange(value, register) {
		if (typeof value === 'number') {
			if (value === 0) {
				return value;
			} //always correct

			let smallest = 0;
			let biggest = 0;
			switch (register.type) {
				case dataType.int16: //–32.768 bis 32.767
					biggest = 32767;
					smallest = -biggest - 1;
					break;
				case dataType.uint16: //0 bis 65.535
					biggest = 65535;
					break;
				case dataType.int32: //-2,147,483,648 bis 2,147,483,647
					biggest = 2147483647;
					smallest = -biggest - 1;
					break;
				case dataType.uint32: //
					biggest = 4294967295;
					break;
				default:
					biggest = Number.MAX_SAFE_INTEGER;
					smallest = -biggest;
					break;
			}

			if (value > smallest && value < biggest) {
				return value;
			}
			this.log.debug(`_checkValidValueRange ${value} smallest: ${smallest} biggest: ${biggest} register: ${register.reg}`);
			return 0;
		}
		return value;
	}

	async _processRegister(reg, data) {
		//0.4.x
		this.addHoldingRegisters(reg.address, data);

		const path = this._getStatePath(reg.type);
		//pre hook
		if (reg.preHook) {
			reg.preHook(path, reg);
		}
		if (reg.states) {
			for (const field of reg.states) {
				const state = field.state;
				if (field.store !== storeType.never && !state.initState) {
					await this.state.initState(path, state);
					state.initState = true;
				}
				if (field.register) {
					let value = this._fromArray(data, reg.address, field);
					if (value !== null) {
						//v0.8.x
						if (field.register.type) {
							value = this._checkValidValueRange(value, field.register);
						}

						if (field.register.gain) {
							value /= field.register.gain;
						}
						if (field.mapper) {
							value = await field.mapper(value);
						}
						this.stateCache.set(path + state.id, value, {
							renew: field?.store === storeType.always,
							stored: field?.store === storeType.never,
						});
					}
				}
			}
		}
		//post hook
		if (reg.postHook) {
			reg.postHook(path);
		}
	}

	/**
	 * Read the device list for a given modbusId.
	 * @param {ModbusClient} modbusClient - The modbus client to use.
	 * @param {number} [modbusId] - The modbus ID to query.
	 * @returns {Promise<[number, { [key: string]: string }]>}
	 * The first element of the array is the number of devices,
	 * the second element is an object with the device information.
	 */
	async readDeviceList(modbusClient, modbusId = 0) {
		this.log.debug('Read Device List (OID=0x87)…');
		const allInfo = {};
		let objectId = 0x87;
		try {
			const resp = await modbusClient.readDeviceIdentification(modbusId, 3, objectId, this.log);
			this.log.debug(`Device List: ${JSON.stringify(resp)}`);
			Object.assign(allInfo, resp);
		} catch (e) {
			throw new Error(`readDeviceList: No answer for OID=0x${objectId.toString(16).toUpperCase()}: ${e.message}`);
		}
		const numDevices = parseInt(JSON.stringify(allInfo['135'] || '').replace(/[^0-9]/g, ''));
		return [numDevices, allInfo];
	}

	_parseDeviceDescription(descBytes) {
		const descStr = descBytes.toString('ascii', 0, descBytes.length).replace(/\0/g, '');
		const attrs = {};
		descStr.split(';').forEach(pair => {
			if (!pair.includes('=')) return;
			const [k, v] = pair.split('=', 2);
			try {
				attrs[parseInt(k)] = v;
			} catch {
				this.log.debug(`Unbekannter Schlüssel ${k} in Beschreibung: ${v}`);
			}
		});
		return attrs;
	}

	/**
	 * Identifies subdevices connected to a Modbus network by name and returns detailed information.
	 *
	 * This function queries the Modbus network for devices, parses their descriptions, and returns
	 * a list of subdevices matching the specified device name. Each identified subdevice includes
	 * its object ID, attributes, and slave ID.
	 *
	 * Many thanks for the implementation in python by WookyDO/huawei_emma_charger
	 *
	 * @param {string} deviceName - The name of the device to search for.
	 * @param {number} [modbusId] - The Modbus ID to query. Defaults to 0.
	 * @returns {Promise<Array<object>>} A promise that resolves to an array of objects, where each
	 *   object contains the following properties:
	 *   - {string} obj_id: The object ID of the subdevice.
	 *   - {Object} attrs: The attributes of the subdevice.
	 *   - {number} slave_id: The slave ID of the subdevice.
	 */
	async identifySubdevices(deviceName, modbusId = 0) {
		const [count, info] = await this.readDeviceList(this._modbusClient, modbusId);
		this.log.debug(`Total devices found: ${count}`);
		deviceName = deviceName.toUpperCase();

		const chargers = [];
		for (const [oid, raw] of Object.entries(info)) {
			const numOid = parseInt(oid);
			if (numOid == 0x87) continue;
			const attrs = this._parseDeviceDescription(raw);
			//this.log.debug(`attrs: ${JSON.stringify(attrs)}`);

			let compareValue = (attrs[8] || '').toUpperCase();
			if (deviceName === 'SUN2000') {
				compareValue = (attrs[1] || '').toUpperCase().slice(0, 7);
			}

			if (compareValue === deviceName.toUpperCase()) {
				const sidVal = attrs[5];
				let sid;
				try {
					sid = parseInt(sidVal);
				} catch {
					this.log.warn(`identifySubdevices: Invalid Slave-ID at OID=0x${numOid.toString(16).toUpperCase()}: ${sidVal}`);
					continue;
				}
				chargers.push({ obj_id: oid, attrs: attrs, slave_id: sid });
				this.log.debug(`identifySubdevices: ${deviceName} found: OID=0x${numOid.toString(16).toUpperCase()}, Slave ID=${sid}`);
			}
		}
		return chargers;
	}

	async updateStates(modbusClient, refreshRate, duration) {
		this._modbusClient = modbusClient;

		if (this._modbusId >= 0) {
			modbusClient.setID(this._modbusId);
		}
		const start = this._newNowTime();
		//battery control and active power control
		if (this.control && refreshRate !== dataRefreshRate.high) {
			await this.control.process(modbusClient);
		}
		//The number of Registers reads
		let readRegisters = 0;
		for (const reg of this.registerFields) {
			if (duration) {
				if (this._newNowTime() - start > duration - this.adapter.settings.modbusDelay) {
					this.log.debug(`### Duration: ${Math.round(duration / 1000)} used time: ${(this._now.getTime() - start) / 1000}`);
					break;
				}
			}
			//if the device is down or standby we cannot read or write anythink?!
			if (!this.modbusAllowed && reg.standby !== true) {
				continue;
			} //standby - v0.6.2
			if (!dataRefreshRate.compare(refreshRate, reg.refresh)) {
				continue;
			} //refreshrate unequal
			if (reg.type == deviceType.meter && !this.deviceInfo?.meter) {
				continue;
			} //meter
			if (reg.type == deviceType.gridPowerControl && !this.deviceInfo?.meter) {
				continue;
			} //Grid Power Control - v0.8.x

			if (reg.checkIfActive && !reg.checkIfActive()) {
				continue;
			} //NEW, PATH

			//refresh rate low or empty
			const lastread = reg.lastread;
			if (refreshRate !== dataRefreshRate.high) {
				if (lastread) {
					if (!reg.refresh) {
						continue;
					}
					let interval = this.adapter.settings.lowInterval;
					if (reg.refresh === dataRefreshRate.medium) {
						interval = this.adapter.settings.mediumInterval;
					}
					if (start - lastread < interval) {
						this.log.debug(`Last read reg for ${start - lastread} ms - ${reg?.info}`);
						continue;
					}
				}
			}
			try {
				this.log.debug(`Try to read data from id/address ${modbusClient.id}/${reg.address}/${reg.refresh}/${reg.info}`);
				const data = await modbusClient.readHoldingRegisters(reg.address, reg.length, this.log); //my Logger
				reg.lastread = this._newNowTime();
				await this._processRegister(reg, data);
				readRegisters++;
				this._errorCount = 0;
			} catch (err) {
				//Only increase if modbus is not connected ??
				if (err.modbusCode === undefined) {
					this._errorCount++;
				}
				if (!reg.readErrorHook || !reg.readErrorHook(err, reg)) {
					this.log.warn(
						`Error while reading from ${modbusClient.ipAddress} [Reg: ${reg.address}, Len: ${reg.length}, modbusID: ${modbusClient.id}] with: ${err.message}`,
					);
					if (err.code == 'EHOSTUNREACH' || err.modbusCode === 5 || err.modbusCode === 6) {
						this.log.debug('Update loop stopped');
						break;
					}
				}
			}
		}
		//Einschubfunktionen
		await this._runPostUpdateHooks(refreshRate);
		this.state.storeStates(); //fire and forget

		return readRegisters;
	}

	numberBatteryUnits() {
		return 0;
	}

	//inverter
	async _runPostUpdateHooks(refreshRate) {
		const path = this._getStatePath(deviceType.inverter);
		for (const hook of this.postUpdateHooks) {
			if (dataRefreshRate.compare(refreshRate, hook.refresh)) {
				const state = hook.state;
				if (state && !hook.initState) {
					await this.state.initState(path, state);
					hook.initState = true;
				}
				hook.fn(path);
			}
		}
	}
}
module.exports = DriverBase;
