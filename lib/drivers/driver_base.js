'use strict';

const {deviceType,storeType,dataRefreshRate,dataType} = require(__dirname + '/../types.js');
const {Logging,RegisterMap} = require(__dirname + '/../tools.js');

class DriverBase {
	constructor(stateInstance,device, options) {
		this.state = stateInstance;
		this.adapter = stateInstance.adapter;
		this.stateCache = stateInstance.stateCache;
		this.deviceInfo = device;
		//https://wiki.selfhtml.org/wiki/JavaScript/Operatoren/Nullish_Coalescing_Operator
		//https://stackoverflow.com/questions/2851404/what-does-options-options-mean-in-javascript
		options = options || {};
		this._modbusId = options.modbusId ?? device.modbusId, //nullish coalescing Operator (??)
		this._modelId = options?.modelId;
		this._driverClass = options?.driverClass,
		this._name = options?.name;

		this._modbusAllowed = true; //modbus request is allowed
		this._deviceStatus = -1; //device shutdown or standby
		this._regMap = new RegisterMap();

		//v0.6.x
		this.control = undefined; //Battery Charge control
		this.log = new Logging(this.adapter); //my own Logger

		this.registerFields = [];
		this.postUpdateHooks = [];
		this._now = new Date();
		//this._newNow();
	}

	get modbusId (){
		return this._modbusId;
	}

	get info () {
		return  {
			driverClass : this._driverClass,
			modelId : this._modelId,
			name : this._name,
			modbusAllowed: this._modbusAllowed,
			deviceStatus: this._deviceStatus
		};
	}

	get modbusAllowed () {
		//v0.6.0
		// if (!this._modbusAllowed) this._modbusAllowed = isSunshine(this.adapter);
		return this._modbusAllowed;
	}

	get deviceStatus () {
		return this._deviceStatus;
	}

	_newNowTime() {
		this._now = new Date();
		return this._now.getTime();
	}

	addHoldingRegisters(startAddr,data) {
		this._regMap.set(startAddr,data);
	}

	getHoldingRegisters(startAddr, length) {
		return this._regMap.get(startAddr,length, this.adapter.isConnected);
	}

	_fromArray(data,address,field) {
		//nullish coalescing Operator (??)
		const len = field.register.length ?? dataType.size(field.register.type);
		const pos = field.register.reg - address;
		return dataType.convert(data.slice(pos,pos+len),field.register.type);
	}

	_getStatePath(type) {
		let path = '';
		if (type !== deviceType.meter) path = this.deviceInfo.path;
		if (path !== '') path += '.';
		return path;
	}

	async _processRegister(reg,data) {
		//0.4.x
		this.addHoldingRegisters(reg.address,data);

		const path = this._getStatePath(reg.type);
		//pre hook
		if (reg.preHook) reg.preHook(path,reg);
		if (reg.states) {
			for(const field of reg.states) {
				const state = field.state;
				//v0.4.0
				//if (field.store !== storeType.never && !reg.initState) {
				if (field.store !== storeType.never && !state.initState) {
					await this.state.initState(path,state);
					state.initState = true;
				}
				if (field.register) {
					let value = this._fromArray(data,reg.address,field);
					if (value !== null) {
						if (field.register.gain) {
							value /= field.register.gain;
						}
						if (field.mapper) {
							value = await field.mapper(value);
						}
						this.stateCache.set(path+state.id, value, {
							storeType : field.store ? field.store : storeType.ifChanged
						}
						/*
						this.stateCache.set(path+state.id, value, {
							renew : field?.store === storeType.always,
							stored : field?.store === storeType.never
						}
						*/
						);
					}
				}
			}
			//reg.initState = true;
		}
		//post hook
		if (reg.postHook) reg.postHook(path);
	}


	async updateStates(modbusClient,refreshRate,duration) {
		//if the device is down or standby we cannot read or write anythink?!
		//new since 0.4.x
		//if (!this.modbusAllowed) return 0;
		if (this._modbusId >= 0) modbusClient.setID(this._modbusId);

		const start = this._newNowTime();

		//v0.6.x
		if (this.control && refreshRate !== dataRefreshRate.high) {
			await this.control.process(modbusClient);
		}
		//The number of Registers reads
		let readRegisters = 0;
		for (const reg of this.registerFields) {
			if (duration) {
				if (this._newNowTime() - start > (duration - this.adapter.settings.modbusDelay)) {
					this.log.debug('### Duration: '+Math.round(duration/1000)+' used time: '+ (this._now.getTime() - start)/1000);
					break;
				}
			}
			//v0.4.x
			//it is ok, because needs data for new modbus server!
			//if (!reg.states || reg.states.length == 0) continue;  	 //no states ?!

			if (!dataRefreshRate.compare(refreshRate,reg.refresh)) continue; //refreshrate unequal
			if (reg.type == deviceType.meter && this.deviceInfo?.meter == false) continue; //meter
			if (reg.type == deviceType.battery && this.deviceInfo?.numberBatteryUnits == 0) continue; //battery
			if (reg.type == deviceType.batteryUnit2 && this.deviceInfo?.numberBatteryUnits < 2) continue; //battery Unit2#
			if (reg.standby !== true && !this.modbusAllowed) continue; //standby
			//refresh rate low or empty
			const lastread = reg.lastread;
			if ( refreshRate !== dataRefreshRate.high) {
				if (lastread) {
					if (!reg.refresh) continue;
					//v0.4.0
					let interval = this.adapter.settings.lowInterval;
					if ( reg.refresh === dataRefreshRate.medium) interval = this.adapter.settings.mediumInterval;
					if  ((start - lastread) < interval) {
						this.log.debug('Last read reg for '+(start - lastread)+' ms - '+reg?.info);
						continue;
					}
				}
			}
			try {
				this.log.debug('Try to read data from id/address ' + modbusClient.id + '/' + reg.address+'/'+reg.refresh+'/'+reg.info);
				const data = await modbusClient.readHoldingRegisters(reg.address, reg.length, this.log); //my Logger
				reg.lastread = this._newNowTime();
				await this._processRegister(reg,data);
				readRegisters++;
			} catch (err) {
				if (!reg.readErrorHook || !reg.readErrorHook(err,reg)) {
					this.log.warn(`Error while reading from ${modbusClient.ipAddress} [Reg: ${reg.address}, Len: ${reg.length}, modbusID: ${modbusClient.id}] with: ${err.message}`);
					if (err.code == 'EHOSTUNREACH' || err.modbusCode == 6) break; // modbus is busy : 6
				}
			}
		}
		//Einschubfunktionen
		await this._runPostUpdateHooks(refreshRate);
		this.state.storeStates(); //fire and forget

		return readRegisters;
	}

	//inverter
	async _runPostUpdateHooks(refreshRate) {
		const path = this._getStatePath(deviceType.inverter);
		for (const hook of this.postUpdateHooks) {
			if (dataRefreshRate.compare(refreshRate,hook.refresh)) {
				const state = hook.state;
				if (state && !hook.initState) {
					await this.state.initState(path,state);
					hook.initState = true;
				}
				hook.fn(path);
			}
		}
	}


}module.exports = DriverBase;