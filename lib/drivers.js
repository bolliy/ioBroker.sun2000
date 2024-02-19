
const {deviceType,driverClasses,storeType,getDeviceStatusInfo,batteryStatus,dataRefreshRate,dataType} = require(__dirname + '/types.js');
const {RiemannSum} = require(__dirname + '/tools.js');


class DriverBase {
	constructor(stateInstance,device, options) {
		this.state = stateInstance;
		this.adapter = stateInstance.adapter;
		this.stateCache = stateInstance.stateCache;
		this.deviceInfo = device;
		//https://wiki.selfhtml.org/wiki/JavaScript/Operatoren/Nullish_Coalescing_Operator
		//https://stackoverflow.com/questions/2851404/what-does-options-options-mean-in-javascript
		if (options) {
			this._modbusId = options?.modbusId ?? device.modbusId, //nullish coalescing Operator (??)
			this._modelId = options?.modelId;
			this._driverClass = options?.driverClass,
			this._name = options?.name;
		}
		this._modbusAllowed = true; //modbus request is allowed
		this._standby = false; //device shutdown or standby
		this._holdingRegisters = {};

		this.registerFields = [];
		this.postUpdateHooks = [];
		this._now = new Date();
		//this._newNow();
	}

	get info () {
		return  {
			driverClass : this?._driverClass,
			modelId : this?._modelId,
			name : this?._name,
			modbusAllowed: this?._modbusAllowed,
			standby: this?._standby
		};
	}

	get modbusAllowed () {
		return this._modbusAllowed;
	}

	get standby () {
		return this._standby;
	}

	_newNowTime() {
		this._now = new Date();
		return this._now.getTime();
	}

	_addHoldingRegisters(startAddr,data) {
		for (let i = 0; i < data.length; i++ ) {
			this._holdingRegisters[startAddr+i] = data[i];
		}
	}

	getHoldingRegisters(startAddr, length) {
		const values = [];
		for (let i = 0; i < length; i++) {
			values[i] =this._holdingRegisters[startAddr+i];
		}
		return values;
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
		this._addHoldingRegisters(reg.address,data);

		const path = this._getStatePath(reg.type);
		//pre hook
		if (reg.preHook) reg.preHook(path,reg);
		if (reg.states) {
			for(const field of reg.states) {
				const state = field.state;
				if (field.store !== storeType.never && !reg.initState) {
					await this.state.initState(path,state);
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
							renew : field?.store === storeType.always,
							stored : field?.store === storeType.never
						});
					}
				}
			}
			reg.initState = true;
		}
		//post hook
		if (reg.postHook) reg.postHook(path);
	}


	async updateStates(modbusClient,refreshRate,duration) {
		//if the device is down or standby we cannot read or write anythink?!
		//new since 0.4.x
		if (!this.modbusAllowed) return 0;
		if (this._modbusId) modbusClient.setID(this._modbusId);

		const start = this._newNowTime();
		//The number of Registers reads
		let readRegisters = 0;
		for (const reg of this.registerFields) {
			if (duration) {
				if (new Date().getTime() - start > (duration - this.adapter.settings.modbusDelay)) {
					this.adapter.log.debug('### Duration: '+Math.round(duration/1000)+' used time: '+ (new Date().getTime() - start)/1000);
					break;
				}
			}
			if (!reg.states || reg.states.length == 0) continue;  	 //no states ?!
			if (!dataRefreshRate.compare(refreshRate,reg.refresh)) continue; //refreshrate unequal
			if (reg.type == deviceType.meter && this.deviceInfo?.meter == false) continue; //meter
			if (reg.type == deviceType.battery && this.deviceInfo?.numberBatteryUnits == 0) continue; //battery
			if (reg.type == deviceType.batteryUnit2 && this.deviceInfo?.numberBatteryUnits < 2) continue; //battery Unit2#
			//refresh rate low or empty
			const lastread = reg.lastread;
			if ( refreshRate !== dataRefreshRate.high) {
				if (lastread) {
					if (!reg.refresh) continue;
					// @ts-ignore
					if  ((start - lastread) < this.adapter.settings.lowIntervall) {
						// @ts-ignore
						this.adapter.log.debug('Last read reg for '+(start - lastread)+' ms - '+reg?.info);
						continue;
					}
				}
			}
			try {
				this.adapter.log.debug('Try to read data from id/address ' + modbusClient.id + '/' + reg.address);
				const data = await modbusClient.readHoldingRegisters(reg.address, reg.length);
				reg.lastread = this._newNowTime();
				await this._processRegister(reg,data);
				readRegisters++;
			} catch (err) {
				// Illegal data address
				if (err.modbusCode == 2 && reg.readErrorHook) {
					reg.readErrorHook(reg);
				} else {
					this.adapter.log.warn(`Error while reading from ${modbusClient.ipAddress} [Reg: ${reg.address}, Len: ${reg.length}, modbusID: ${modbusClient.id}] with: ${err.message}`);
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
				if (!hook.initState) {
					await this.state.initState(path,state);
				}
				hook.fn(path);
				hook.initState = true;
			}
		}
	}


}


class InverterInfo extends DriverBase {
	constructor (stateInstance,device) {
		super(stateInstance,device,{
			name: 'Huawei DriverInfo'
		});
		this._newInstance = undefined;

		//https://github.com/ioBroker/ioBroker.docs/blob/master/docs/en/dev/stateroles.md
		const newFields = [
			{
				address : 30070,
				length : 1,
				info : 'inverter model info (indicator)',
				type : deviceType.inverter,
				states: [{
					state: {id: 'info.modelID', name: 'Model ID', type: 'number', role: 'info.hardware'},
					register: {reg: 30070, type: dataType.uint16},
					store: storeType.never
				}],
				readErrorHook: (reg) => {
					//modbus Error 2 - illegal address
					reg.lastread = this._newNowTime();
					this.adapter.log.error('No Huawei inverter could be identified for modbus ID '+this._modbusId+'!');
				},
				postHook: (path) => {
					const detectedModelId = this.stateCache.get(path+'info.modelID')?.value;
					if (detectedModelId) {
						//const model_sun2000M0 = [410,411,400,401,402,403,404,405,418,406,407,419,408,420,412,421,413,422,414,423,50,55];
						const model_sun2000M1 = [424,425,426,427,428,429,463,142];
						if (model_sun2000M1.includes(detectedModelId)) {
							this._newInstance = new InverterSun2000_M1(this.state,device, { modelId : detectedModelId });
						} else {
							this._newInstance = new InverterSun2000(this.state,device, { modelId : detectedModelId });
						}
					} else {
						this.adapter.log.error('No Huawei inverter could be identified for modbus ID '+this._modbusId+'!');
					}
				}
			}
		];

		this.registerFields.push.apply(this.registerFields,newFields);
	}

	get newInstance () {
		return this._newInstance;
	}
}

class InverterSun2000 extends DriverBase{
	constructor(stateInstance,inverter,options) {
		super(stateInstance,inverter,
			{
				name: 'sun2000',
				driverClass : driverClasses.inverter,
				...options,
			});

		this.solarSum = new RiemannSum();
		//https://github.com/ioBroker/ioBroker.docs/blob/master/docs/en/dev/stateroles.md
		const newFields = [
			{
				address : 30000,
				length : 75,
				info : 'inverter model info',
				type : deviceType.inverter,
				states: [{
					state: {id: 'info.model', name: 'Model', type: 'string', role: 'info.name'},
					register: {reg: 30000, type: dataType.string, length: 15}
				},
				{
					state: {id: 'info.modelID', name: 'Model ID', type: 'number', role: 'info.hardware'},
					register: {reg: 30070, type: dataType.uint16}
				},
				{
					state: {id: 'info.serialNumber', name: 'Serial number', type: 'string', role: 'info.serial'},
					register: {reg: 30015, type: dataType.string, length: 10}
				},
				{
					state: {id: 'info.numberPVStrings', name: 'Number of PV Strings', type: 'number', unit: '', role: 'value'},
					register: {reg: 30071, type: dataType.uint16}
				},
				{
					state: {id: 'info.numberMPPTrackers', name: 'Number of MPP trackers', type: 'number', unit: '', role: 'value'},
					register: {reg: 30072, type: dataType.uint16}
				},
				{
					state: {id: 'info.ratedPower', name: 'Rated power', type: 'number', unit: 'kW', role: 'value.power'},
					register: {reg: 30073, type: dataType.int32, gain:1000}
				}],
			},
			{
				address : 37765,
				length : 2,
				info : 'Battery Charge And Discharge Power',
				refresh : dataRefreshRate.high,
				type : deviceType.battery,
				states : [{
					state: {id: 'battery.chargeDischargePower', name: 'Charge/Discharge power', desc: '(>0 charging, <0 discharging)', type: 'number', unit: 'kW', role: 'value.power'},
					register: {reg: 37765, type: dataType.int32, gain:1000}
					//store : storeType.always
				}]
			},
			{
				address : 32080,
				length : 2,
				info : 'Inverter Activ Power',
				refresh : dataRefreshRate.high,
				type : deviceType.inverter,
				states : [{
					state: {id: 'activePower', name: 'Active power', type: 'number', unit: 'kW', role: 'value.power.active', desc: 'Power currently used'},
					register: {reg: 32080, type: dataType.int32, gain:1000},
					store : storeType.always
				}]
			},
			{
				address : 32064,
				length : 2,
				info : 'Input Power',
				refresh : dataRefreshRate.high,
				type : deviceType.inverter,
				states : [{
					state: {id: 'inputPower', name: 'Input power' , type: 'number', unit: 'kW', role: 'value.power.produced', desc: 'Power from solar'},
					register: {reg: 32064, type: dataType.int32, gain:1000},
					store : storeType.always
				},
				{
					state: {id: 'derived.inputPowerWithEfficiencyLoss', name: 'input power with efficiency loss', type: 'number', unit: 'kW', role: 'value.power', desc: 'Power from solar with efficiency loss'}
				}
				],
				postHook: (path) => {
					//https://community.home-assistant.io/t/integration-solar-inverter-huawei-2000l/132350/1483?u=wlcrs
					const inPower = this.stateCache.get(path+'inputPower')?.value;
					//https://wiki.selfhtml.org/wiki/JavaScript/Operatoren/Optional_Chaining_Operator
					//const ratedPower = state ? state.val : undefined;
					const ratedPower = this.stateCache.get(path+'info.ratedPower')?.value;
					let inPowerEff = inPower;
					if (inPower < ratedPower*0.2) {
						if (inPower < ratedPower*0.1) {
							inPowerEff *= 0.9;
						} else {
							inPowerEff *= 0.95;
						}
					} else {
						inPowerEff *= 0.98;
					}
					this.stateCache.set(path+'derived.inputPowerWithEfficiencyLoss', inPowerEff,  {type: 'number'});
					this.solarSum.add(inPowerEff); //riemann Sum
				}
			},
			{
				address : 37052,
				length : 10,
				info : 'battery unit1 indicator',
				states: [
					{
						state: { id: 'battery.unit.1.SN', name: 'serial number', type: 'string', unit: '', role: 'value', desc: '' },
						register: { reg: 37052, type: dataType.string, length: 10},
						store: storeType.never
					},
				],
				readErrorHook: (reg) => {
					//modbus Error 2 - illegal address
					reg.lastread = new Date().getTime();
					this.stateCache.set(this._getStatePath(reg.type)+'battery.unit.1.SN', '', { stored : true });
				}
			},
			{
				address : 37000,
				length : 50,
				info : 'battery information',
				refresh : dataRefreshRate.low,
				type : deviceType.battery,
				states: [
					{
						state: {id: 'battery.unit.1.runningStatus', name: 'running status', type: 'string', unit: '', role: 'value'},
						register: {reg: 37000, type: dataType.uint16},
						mapper: value => Promise.resolve(batteryStatus[value])
					},
					{
						state: {id: 'battery.unit.1.batterySOC', name: 'battery SOC', type: 'number', unit: '%', role: 'value.battery'},
						register: {reg: 37004, type: dataType.uint16, gain:10}
					},
					{
						state: {id: 'battery.unit.1.batteryTemperature', name: 'battery temperature', type: 'number', unit: '°C', role: 'value.temperature'},
						register: {reg: 37022, type: dataType.uint16, gain:10},
						mapper: value => Promise.resolve(this._checkValidNumber(value,-100,100))
					},
					{
						state: { id: 'battery.maximumChargePower', name: 'MaximumChargePower', type: 'number', unit: 'W', role: 'value.power', desc: '' },
						register: { reg: 37046, type: dataType.uint32 }
					},
					{
						state: { id: 'battery.maximumDischargePower', name: 'MaximumDischargePower', type: 'number', unit: 'W', role: 'value.power', desc: '' },
						register: { reg: 37048, type: dataType.uint32}
					}
				]
			},
			{
				address : 47081,
				length : 18,
				info : 'additional battery information',
				refresh : dataRefreshRate.low,
				type : deviceType.battery,
				states: [
					{
						state: {id: 'battery.chargingCutoffCapacity', name: 'Charging Cutoff Capacity', type: 'number', unit: '%', role: 'value'},
						register: {reg: 47081, type: dataType.uint16, gain: 10}
					},
					{
						state: {id: 'battery.dischargeCutoffCapacity', name: 'Discharge Cutoff Capacity', type: 'number', unit: '%', role: 'value'},
						register: {reg: 47082, type: dataType.uint16, gain: 10}
					},
					{
						state: {id: 'battery.forcedChargeDischargePeriod', name: 'Forced Charge Discharge Period', type: 'number', unit: 'mins', role: 'value'},
						register: {reg: 47083, type: dataType.uint16}
					},
					{
						state: {id: 'battery.workingModeSettings', name: 'Working Mode Settings', type: 'number', unit: '', role: 'value'},
						register: {reg: 47086, type: dataType.uint16}
					},
					{
						state: {id: 'battery.chargeFromGridFunction', name: 'Charge From Grid Function', type: 'number', unit: '', role: 'value'},
						register: {reg: 47087, type: dataType.uint16}
					},
					{
						state: {id: 'battery.gridChargeCutoffSOC', name: 'Grid Charge Cutoff SOC', type: 'number', unit: '%', role: 'value'},
						register: {reg: 47088, type: dataType.uint16, gain: 10}
					}]
			},
			{
				address : 32000,
				length : 116,
				info : 'inverter status',
				refresh : dataRefreshRate.low,
				type : deviceType.inverter,
				states: [
					{
						state: {id: 'state1', name: 'State 1', type: 'number', unit: '', role: 'value'},
						register: {reg: 32000, type: dataType.uint16}
					},
					{
						state: {id: 'state2', name: 'State 2', type: 'number', unit: '', role: 'value'},
						register: {reg: 32001, type: dataType.uint16}
					},
					{
						state: {id: 'state3', name: 'State 3', type: 'number', unit: '', role: 'value'},
						register: {reg: 32002, type: dataType.uint16}
					},
					{
						state: {id: 'alarm1', name: 'Alarm 1', type: 'number', unit: '', role: 'value'},
						register: {reg: 32008, type: dataType.uint16}
					},
					{
						state: {id: 'alarm2', name: 'Alarm 2', type: 'number', unit: '', role: 'value'},
						register: {reg: 32009, type: dataType.uint16}
					},
					{
						state: {id: 'alarm3', name: 'Alarm 3', type: 'number', unit: '', role: 'value'},
						register: {reg: 32010, type: dataType.uint16}
					},
					{
						state: {id: 'grid.voltageL1-L2', name: 'Voltage L1-L2', type: 'number', unit: 'V', role: 'value.voltage'},
						register: {reg: 32066, type: dataType.uint16, gain: 10}
					},
					{
						state: {id: 'grid.voltageL2-L3', name: 'Voltage L2-L3', type: 'number', unit: 'V', role: 'value.voltage'},
						register: {reg: 32067, type: dataType.uint16, gain: 10}
					},
					{
						state: {id: 'grid.voltageL3-L1', name: 'Voltage L3-L1', type: 'number', unit: 'V', role: 'value.voltage'},
						register: {reg: 32068, type: dataType.uint16, gain: 10}
					},
					{
						state: {id: 'grid.voltageL1', name: 'Voltage L1', type: 'number', unit: 'V', role: 'value.voltage'},
						register: {reg: 32069, type: dataType.uint16, gain: 10}
					},
					{
						state: {id: 'grid.voltageL2', name: 'Voltage L2', type: 'number', unit: 'V', role: 'value.voltage'},
						register: {reg: 32070, type: dataType.uint16, gain: 10}
					},
					{
						state: {id: 'grid.voltageL3', name: 'Voltage L3', type: 'number', unit: 'V', role: 'value.voltage'},
						register: {reg: 32071, type: dataType.uint16, gain: 10}
					},
					{
						state: {id: 'grid.currentL1', name: 'Current L1', type: 'number', unit: 'A', role: 'value.current'},
						register: {reg: 32072, type: dataType.int32, gain: 1000}
					},
					{
						state: {id: 'grid.currentL2', name: 'Current L2', type: 'number', unit: 'A', role: 'value.current'},
						register: {reg: 32074, type: dataType.int32, gain: 1000}
					},
					{
						state: {id: 'grid.currentL3', name: 'Current L3', type: 'number', unit: 'A', role: 'value.current'},
						register: {reg: 32076, type: dataType.int32, gain: 1000}
					},
					{
						state: {id: 'peakActivePowerCurrentDay', name: 'Peak active power of current day', type: 'number', unit: 'kW', role: 'value.power.max'},
						register: {reg: 32078, type: dataType.int32, gain: 1000}
					},
					{
						state: {id: 'reactivePower', name: 'Reactive Power', type: 'number', unit: 'kVar', role: 'value.power.reactive'},
						register: {reg: 32082, type: dataType.int32, gain: 1000}
					},
					{
						state: {id: 'powerFactor', name: 'Power Factor', type: 'number', unit: '', role: 'value'},
						register: {reg: 32084, type: dataType.int16, gain: 1000}
					},
					{
						state: {id: 'grid.frequency', name: 'Grid Frequency', type: 'number', unit: 'Hz', role: 'value.frequency'},
						register: {reg: 32085, type: dataType.uint16, gain: 100},
						mapper: value => Promise.resolve(this._checkValidNumber(value,0,100))
					},
					{
						state: {id: 'efficiency', name: 'Efficiency', type: 'number', unit: '%', role: 'value'},
						register: {reg: 32086, type: dataType.uint16, gain: 100}
					},
					{
						state: {id: 'internalTemperature', name: 'Internal temperature', type: 'number', unit: '°C', role: 'value.temperature'},
						register: {reg: 32087, type: dataType.int16, gain: 10},
						mapper: value => Promise.resolve(this._checkValidNumber(value,-100,100))
					},
					{
						state: {id: 'isulationResistance', name: 'Isulation Resistance', type: 'number', unit: 'MOhm', role: 'value'},
						register: {reg: 32088, type: dataType.uint16, gain: 1000}
					},
					{
						state: {id: 'deviceStatus', name: 'Device Status', type: 'number', unit: '', role: 'value'},
						register: {reg: 32089, type: dataType.uint16}
					},
					{
						state: {id: 'derived.deviceStatus', name: 'Device Status Information', type: 'string', unit: '', role: 'value'}
					},
					{
						state: {id: 'faultCode', name: 'Fault Code', type: 'number', unit: '', role: 'value'},
						register: {reg: 32090, type: dataType.uint16}
					},
					{
						state: {id: 'startupTime', name: 'Startup Time', type: 'number', unit: '', role: 'value.time'},
						register: {reg: 32091, type: dataType.uint32}
					},
					{
						state: {id: 'shutdownTime', name: 'Shutdown Time', type: 'number', unit: '', role: 'value.time'},
						register: {reg: 32093, type: dataType.uint32}
					},
					{
						state: {id: 'accumulatedEnergyYield', name: 'Accumulated Energy Yield', type: 'number', unit: 'kWh', role: 'value.power.produced'},
						register: {reg: 32106, type: dataType.uint32, gain: 100}
					},
					{
						state: {id: 'dailyEnergyYield', name: 'Daily Energy Yield', type: 'number', unit: 'kWh', role: 'value.power.produced'},
						register: {reg: 32114, type: dataType.uint32, gain: 100}
					}

				],
				//Before 32000 read
				preHook: (path,reg) => {
					//create states for strings
					const noPVString = this.stateCache.get(path+'info.numberPVStrings')?.value;
					if (noPVString > 0) {
						if (!stringFieldsTemplate.generated) stringFieldsTemplate.generated = 0;
						if (stringFieldsTemplate.generated < noPVString) {
							for (let i = stringFieldsTemplate.generated; i < noPVString; i++) {
								//clonen
								//const statePV = Object.assign({},stringFieldsTemplate.states[0]);
								const statePV = JSON.parse(JSON.stringify(stringFieldsTemplate.states[0]));
								const stateCu = JSON.parse(JSON.stringify(stringFieldsTemplate.states[1]));
								const statePo = JSON.parse(JSON.stringify(stringFieldsTemplate.states[2]));
								statePV.state.id = 'string.PV'+(i+1)+'Voltage';
								statePV.register.reg = (stringFieldsTemplate.states[0].register?.reg ?? 0)+ (i*2);
								statePV.register.type = stringFieldsTemplate.states[0].register?.type; //types are not copied?!
								stateCu.state.id = 'string.PV'+(i+1)+'Current';
								stateCu.register.reg = (stringFieldsTemplate.states[1].register?.reg ?? 0)+ (i*2);
								stateCu.register.type = stringFieldsTemplate.states[1].register?.type;
								statePo.state.id = 'string.PV'+(i+1)+'Power';
								reg.states.push(statePV);
								reg.states.push(stateCu);
								reg.states.push(statePo);
							}
						}
						stringFieldsTemplate.generated = noPVString;
					}
				},
				//After 32000 read
				postHook: (path) => {
					//set strings
					const noPVString = this.stateCache.get(path+'info.numberPVStrings')?.value;
					if (noPVString > 0) {
						for (let i = 1; i <= noPVString; i++) {
							const voltage = this.stateCache.get(path+'string.PV'+i+'Voltage')?.value;
							const current = this.stateCache.get(path+'string.PV'+i+'Current')?.value;
							this.stateCache.set(path+'string.PV'+i+'Power',Math.round(voltage*current),{type: 'number'});
						}
					}
					//DeviceStatus
					const deviceStatus = this.stateCache.get(path+'deviceStatus')?.value;
					this.deviceInfo.deviceStatus = deviceStatus;
					this.stateCache.set(path+'derived.deviceStatus',getDeviceStatusInfo(deviceStatus));
				}
			},
			{
				address : 37100,
				length : 38,
				info : 'meter info',
				refresh : dataRefreshRate.high,
				type : deviceType.meter,
				states: [{
					state: {id: 'meter.status', name: 'Meter Status', type: 'number', unit: '', role: 'value',desc: '(0: offline 1: normal)'},
					register: {reg: 37100, type: dataType.uint16}
				},
				{
					state: {id: 'meter.voltageL1', name: 'Phase 1 voltage', type: 'number', unit: 'V', role: 'value.voltage'},
					register: {reg: 37101, type: dataType.int32, gain: 10}
				},
				{
					state: {id: 'meter.voltageL2', name: 'Phase 2 voltage', type: 'number', unit: 'V', role: 'value.voltage'},
					register: {reg: 37103, type: dataType.int32, gain:10}
				},
				{
					state: {id: 'meter.voltageL3', name: 'Phase 3 voltage', type: 'number', unit: 'V', role: 'value.voltage'},
					register: {reg: 37105, type: dataType.int32, gain:10}
				},
				{
					state: {id: 'meter.currentL1', name: 'Phase 1 Current', type: 'number', unit: 'A', role: 'value.current'},
					register: {reg: 37107, type: dataType.int32, gain:100}
				},
				{
					state: {id: 'meter.currentL2', name: 'Phase 2 Current', type: 'number', unit: 'A', role: 'value.current'},
					register: {reg: 37109, type: dataType.int32, gain:100}
				},
				{
					state: {id: 'meter.currentL3', name: 'Phase 3 Current', type: 'number', unit: 'A', role: 'value.current'},
					register: {reg: 37111, type: dataType.int32, gain:100}
				},
				{
					state: {id: 'meter.activePower', name: 'ActivePower', type: 'number', unit: 'kW', role: 'value.power.active', desc: '(>0: feed-in to grid. <0: supply from grid.)' },
					register: { reg: 37113, type: dataType.int32, gain:1000 }
				},
				{
					state: {id: 'meter.reactivePower', name: 'Reactive Power', type: 'number', unit: 'VAr', role: 'value.power.reactive'},
					register: {reg: 37115, type: dataType.int32}
				},
				{
					state: {id: 'meter.powerFactor', name: 'Power Factor', type: 'number', unit: '', role: 'value'},
					register: {reg: 37117, type: dataType.int16, gain: 1000}
				},
				{
					state: {id: 'meter.gridFrequency', name: 'Grid Frequency', type: 'number', unit: 'Hz', role: 'value.frequency'},
					register: {reg: 37118, type: dataType.int16, gain: 100}
				},
				{
					state: {id: 'meter.positiveActiveEnergy', name: 'Positive Active Energy', type: 'number', unit: 'kWh', role: 'value.power.consumption'},
					register: {reg: 37119, type: dataType.int32, gain: 100}
				},
				{
					state: {id: 'meter.reverseActiveEnergy', name: 'Reverse Active Energy', type: 'number', unit: 'kWh', role: 'value.power.consumption'},
					register: {reg: 37121, type: dataType.int32, gain: 100}
				},
				{
					state: {id: 'meter.accumulatedReactivePower', name: 'Accumulated Reactive Power', type: 'number', unit: 'kVarh', role: 'value.power.reactive.consumption'},
					register: {reg: 37123, type: dataType.int32, gain: 100}
				},
				{
					state: {id: 'meter.voltageL1-L2', name: 'Voltage L1-L2', type: 'number', unit: 'V', role: 'value.voltage'},
					register: {reg: 37126, type: dataType.int32, gain: 10}
				},
				{
					state: {id: 'meter.voltageL2-L3', name: 'Voltage L2-L3', type: 'number', unit: 'V', role: 'value.voltage'},
					register: {reg: 37128, type: dataType.int32, gain: 10}
				},
				{
					state: {id: 'meter.voltageL3-L1', name: 'Voltage L3-L1', type: 'number', unit: 'V', role: 'value.voltage'},
					register: {reg: 37130, type: dataType.int32, gain: 10}
				},
				{
					state: {id: 'meter.activePowerL1', name: 'Active Power L1', type: 'number', unit: 'A', role: 'value.current'},
					register: {reg: 37132, type: dataType.int32,}
				},
				{
					state: {id: 'meter.activePowerL2', name: 'Active Power L2', type: 'number', unit: 'A', role: 'value.current'},
					register: {reg: 37134, type: dataType.int32}
				},
				{
					state: {id: 'meter.activePowerL3', name: 'Active Power L3', type: 'number', unit: 'A', role: 'value.current'},
					register: {reg: 37136, type: dataType.int32}
				}
				]
			},
			{
				address : 37758,
				length : 30,
				info : 'battery information',
				refresh : dataRefreshRate.high,
				type : deviceType.battery,
				states: [
					{
						state: {id: 'battery.ratedCapacity', name: 'Rated Capacity', type: 'number', unit: 'Wh', role: 'value.capacity'},
						register: {reg: 37758, type: dataType.uint32}
					},
					{
						state: {id: 'battery.SOC', name: 'State of capacity', type: 'number', unit: '%', role: 'value.battery', desc: 'SOC'},
						register: {reg: 37760, type: dataType.uint16, gain: 10}
					},
					{
						state: {id: 'battery.runningStatus', name: 'Running status', type: 'string', role: 'value'},
						register: {reg: 37762, type: dataType.uint16, length: 1},
						mapper: value => Promise.resolve(batteryStatus[value])
					},
					{
						state: {id: 'battery.busVoltage', name: 'Bus Voltage', type: 'number', unit: 'V', role: 'value.voltage'},
						register: {reg: 37763, type: dataType.uint16, gain: 10}
					},
					{
						state: {id: 'battery.busCurrent', name: 'Bus Current', type: 'number', unit: 'A', role: 'value.current'},
						register: {reg: 37764, type: dataType.uint16, gain: 10}
					},
					{
						state: {id: 'battery.totalCharge', name: 'Total Charge', type: 'number', unit: 'kWh', role: 'value.power.consumption'},
						register: {reg: 37780, type: dataType.uint32, gain: 100}
					},
					{
						state: {id: 'battery.totalDischarge', name: 'Total Discharge', type: 'number', unit: 'kWh', role: 'value.power.consumption'},
						register: {reg: 37782, type: dataType.uint32, gain: 100}
					},
					{
						state: {id: 'battery.currentDayChargeCapacity', name: 'Current Day Charge Capacity', type: 'number', unit: 'kWh', role: 'value.power.consumption' },
						register: { reg: 37784, type: dataType.uint32,  gain: 100 }
					},
					{
						state: {id: 'battery.currentDayDischargeCapacity', name: 'Current Day Discharge Capacity', type: 'number', unit: 'kWh', role: 'value.power.consumption', desc: '' },
						register: { reg: 37786, type: dataType.uint32,  gain: 100 }
					}
				]
			}
		];
		this.registerFields.push.apply(this.registerFields,newFields);

		//Template for StringsRegister
		const stringFieldsTemplate = {
			states : [
				{
					state: {id: 'string.PV1Voltage', name: 'string voltage', type: 'number', unit: 'V', role: 'value.voltage'},
					register: {reg: 32016, type: dataType.int16, length: 1, gain: 10}
				},
				{
					state: {id: 'string.PV1Current', name: 'string current', type: 'number', unit: 'A', role: 'value.current'},
					register: {reg: 32017, type: dataType.int16, length: 1, gain: 100}
				},
				{
					state: {id: 'string.PV1Power', name: 'string power', type: 'number', unit: 'W', role: 'value.power'}
				}
			]
		};

		const newHooks = [
			{
				refresh : dataRefreshRate.low,
				state: {id: 'derived.dailyInputYield', name: 'Portal Yield Today', type: 'number', unit: 'kWh', role: 'value.power.consumption', desc: 'Try to recreate the yield from the portal'},
				fn : (path) => {
					const disCharge = this.stateCache.get(path+'battery.currentDayDischargeCapacity')?.value;
					const charge = this.stateCache.get(path+'battery.currentDayChargeCapacity')?.value;
					let inputYield = this.stateCache.get(path+'dailyEnergyYield')?.value + charge*0.975 - disCharge;

					if (inputYield < 0 || isNaN(inputYield)) inputYield = 0;
					this.stateCache.set(path+'derived.dailyInputYield', inputYield, {type: 'number'});

					//Battery Indicator
					let state = this.stateCache.get(path+'battery.unit.1.SN');
					if (state && state?.value !== '') this.deviceInfo.numberBatteryUnits = 1;
					state = this.stateCache.get(path+'battery.unit.2.SN');
					if (state && state?.value !== '') this.deviceInfo.numberBatteryUnits += 1;
				}
			},
			{
				refresh : dataRefreshRate.low,
				state: {id: 'derived.dailySolarYield', name: 'Solar Yield Today', type: 'number', unit: 'kWh', role: 'value.power.consumption', desc: 'Riemann sum of input power with efficiency loss'},
				fn : (path) => {
					this.stateCache.set(path+'derived.dailySolarYield', this.solarSum.sum, {type: 'number'});
				}
			}
		];
		this.postUpdateHooks.push.apply(this.postUpdateHooks,newHooks);
	}


	//Incorrect values come back in standby mode of any states
	_checkValidNumber( value, from = 0, until = 100, substWith = 0) {
		if (typeof value == 'number') {
			if (value >= from && value <= until) {
				return value;
			}
		}
		return substWith;
	}

	//overload
	get modbusAllowed () {
		//if the modbus-device offline we cannot read or write anythink!
		if (this.standby) {
			if (this.adapter.settings.sunrise) {
				const timeAfterSunrise = this._newNowTime() - this.adapter.settings.sunrise?.getTime();
				this._modbusAllowed= timeAfterSunrise > 0 && timeAfterSunrise < 60*60*1000; //60 Minutes after sunrise
			} else {
				//im Zweifel immer erstmal aufwachen
				this._modbusAllowed = true;
			}
		} else {
			this._modbusAllowed = true;
		}
		return this._modbusAllowed;
	}

	//overload
	get standby() {
		//Test 0xA000
		const offlineStates = [0x0000,0x0001,0x0002,0x0003,0x0100,0x0300,0x0301,0x0302,0x0303,0x0304,0x0305,0x0306,0x0307,0x0308];
		const state = this.stateCache.get(this.deviceInfo.path+'.deviceStatus');
		const newStandby = state ? offlineStates.includes(state?.value) : false;
		this.adapter.log.debug('### Standby '+newStandby);
		if (newStandby != this._standby) {
			if (newStandby) {
				this.adapter.log.info(`The Inverter ${this.deviceInfo.index} switches to standby mode.`);
			} else {
				this.adapter.log.info(`The Inverter ${this.deviceInfo.index} switches from standby to normal mode.`);
			}
		}
		this._standby = newStandby;
		return this._standby;
	}

}

class InverterSun2000_M1 extends InverterSun2000{
	constructor(stateInstance,inverter,options) {
		super(stateInstance,inverter,{
			name: 'sun2000 Serie M1',
			...options
		});

		//https://github.com/ioBroker/ioBroker.docs/blob/master/docs/en/dev/stateroles.md
		const newFields = [
			{
				address : 37200,
				length : 3,
				info : 'optimizer info (static info)',
				type : deviceType.inverter,
				states: [{
					state: {id: 'optimizer.optimizerTotalNumber', name: 'Optimizer Total Number', type: 'number', unit: '', role: 'value'},
					register: {reg: 37200, type: dataType.int16}
				},
				{
					state: {id: 'optimizer.optimizerOnlineNumber', name: 'Optimizer Online Number', type: 'number', unit: '', role: 'value'},
					register: {reg: 37201, type: dataType.int16}
				},
				{
					state: {id: 'optimizer.optimizerFeatureData', name: 'Optimizer Feature Data', type: 'number', unit: '', role: 'value'},
					register: {reg: 37202, type: dataType.int16}
				}]
			},
			{

				address : 37700,
				length : 10,
				info : 'battery unit2 indicator',
				states: [
					{
						state: { id: 'battery.unit.2.SN', name: 'serial number', type: 'string', unit: '', role: 'value', desc: '' },
						register: { reg: 37700, type: dataType.string, length: 10},
						store: storeType.never
					}
				],
				readErrorHook: (reg) => {
					//modbus Error 2 - illegal address
					//reg couldnt read
					reg.lastread = new Date().getTime();
					this.stateCache.set(this._getStatePath(reg.type)+'battery.unit.2.SN', '', { stored : true });
				}
			},
			{
				address : 37741,
				length : 12,
				info : 'battery unit2 information',
				refresh : dataRefreshRate.low,
				type : deviceType.batteryUnit2,
				states: [
					{
						state: {id: 'battery.unit.2.runningStatus', name: 'running status', type: 'string', unit: '', role: 'value'},
						register: {reg: 37741, type: dataType.uint16},
						mapper: value => Promise.resolve(batteryStatus[value])
					},
					{
						state: {id: 'battery.unit.2.batterySOC', name: 'battery SOC', type: 'number', unit: '%', role: 'value.battery'},
						register: {reg: 37738, type: dataType.uint16, gain:10}
					},
					{
						state: {id: 'battery.unit.2.batteryTemperature', name: 'battery temperature', type: 'number', unit: '°C', role: 'value.temperature'},
						register: {reg: 37752, type: dataType.uint16, gain:10},
						mapper: value => Promise.resolve(this._checkValidNumber(value,-100,100))
					}
				]
			},
		];
		this.registerFields.push.apply(this.registerFields,newFields);
	}
}

class Sdongle extends DriverBase{
	constructor(stateInstance,charger,options) {
		super(stateInstance,charger,
			{
				name: 'smart dongle',
				driverClass : driverClasses.sdongle,
				...options,
			});
		const newFields = [
			{
				address : 30015,
				length : 56,
				info : 'SDongle info 1',
				states : [{
					state: {id: 'sdongle.sn', name: 'Serial Number', desc: '', type: 'string', unit: '', role: 'value.'},
					register: {reg: 30015, type: dataType.string, length: 10}
				},
				{
					state: {id: 'sdongle.OSVersion', name: 'OS Version', desc: '', type: 'string', unit: '', role: 'value'},
					register: {reg: 30050, type: dataType.string, length: 15}
				},
				{
					state: {id: 'sdongle.protokolVersion', name: 'Protokol Version', desc: '', type: 'number', unit: '', role: 'value'},
					register: {reg: 30068, type: dataType.uint32}
				}]
			},
			{
				address : 37410,
				length : 1,
				info : 'SDongle info 2',
				states : [{
					state: {id: 'sdongle.type', name: 'Type', desc: '', type: 'number', unit: '', role: 'value'},
					register: {reg: 37410, type: dataType.uint16}
				}]
			},
			{
				address : 37498,
				length : 20,
				info : 'Power data',
				refresh : dataRefreshRate.low,
				states : [{
					state: {id: 'sdongle.totalInputPower', name: 'Total Input Power', desc: '', type: 'number', unit: 'kW', role: 'value.power'},
					register: {reg: 37498, type: dataType.uint32, gain: 1000}
				},
				{
					state: {id: 'sdongle.loadPower', name: 'Load Power', desc: '', type: 'number', unit: 'kW', role: 'value.power'},
					register: {reg: 37500, type: dataType.uint32, gain: 1000}
				},
				{
					state: {id: 'sdongle.gridPower', name: 'Grid  Power', desc: '', type: 'number', unit: 'kW', role: 'value.power'},
					register: {reg: 37502, type: dataType.int32, gain: 1000}
				},
				{
					state: {id: 'sdongle.totalBatteryPower', name: 'Total Battery Power', desc: '', type: 'number', unit: 'kW', role: 'value.power'},
					register: {reg: 37504, type: dataType.int32, gain: 1000}
				},
				{
					state: {id: 'sdongle.totalActivePower', name: 'Total Active Power', desc: '', type: 'number', unit: 'kW', role: 'value.power'},
					register: {reg: 37516, type: dataType.int32, gain: 1000}
				}]
			},

		];

		this.registerFields.push.apply(this.registerFields,newFields);
	}
}

class Charger extends DriverBase{
	constructor(stateInstance,charger,options) {
		super(stateInstance,charger,
			{
				name: 'smart charger',
				driverClass : driverClasses.charger,
				...options,
			});
		//https://github.com/ioBroker/ioBroker.docs/blob/master/docs/en/dev/stateroles.md
		const newFields = [
			{
				address : 4096,
				length : 14,
				info : 'Collected Signal',
				refresh : dataRefreshRate.high,
				type : deviceType.inverter,
				states : [{
					state: {id: 'voltageL1', name: 'voltage L1', desc: '', type: 'number', unit: 'V', role: 'value.voltage'},
					register: {reg: 4096, type: dataType.uint32, gain: 10}
				},
				{
					state: {id: 'voltageL2', name: 'voltage L2', desc: '', type: 'number', unit: 'V', role: 'value.voltage'},
					register: {reg: 4098, type: dataType.uint32, gain: 10}
				},
				{
					state: {id: 'voltageL3', name: 'voltage L3', desc: '', type: 'number', unit: 'V', role: 'value.voltage'},
					register: {reg: 4100, type: dataType.uint32, gain: 10}
				},
				{
					state: {id: 'currentL1', name: 'current L1', desc: '', type: 'number', unit: 'W', role: 'value.current'},
					register: {reg: 4102, type: dataType.uint32, gain: 10}
				},
				{
					state: {id: 'currentL2', name: 'current L2', desc: '', type: 'number', unit: 'W', role: 'value.current'},
					register: {reg: 4104, type: dataType.uint32, gain: 10}
				},
				{
					state: {id: 'currentL3', name: 'current L3', desc: '', type: 'number', unit: 'W', role: 'value.current'},
					register: {reg: 4106, type: dataType.uint32, gain: 10}
				},
				{
					state: {id: 'totalOutputPower', name: 'total output Power ', desc: '', type: 'number', unit: 'kW', role: 'value.power'},
					register: {reg: 4108, type: dataType.uint32, gain: 10},
					store : storeType.always
				}]
			}
		];

		this.registerFields.push.apply(this.registerFields,newFields);
	}
}

function getDriverHandler(driverClass) {
	if (driverClass == driverClasses.inverter) return InverterInfo;
	if (driverClass == driverClasses.charger) return Charger;
	if (driverClass == driverClasses.sdongle) return Sdongle;
}

module.exports = getDriverHandler;

