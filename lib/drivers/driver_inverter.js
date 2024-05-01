'use strict';

const {deviceType,driverClasses,storeType,getDeviceStatusInfo,batteryStatus,dataRefreshRate,dataType} = require(__dirname + '/../types.js');
const {RiemannSum,isSunshine} = require(__dirname + '/../tools.js');
const DriverBase = require(__dirname + '/driver_base.js');
const ServiceQueueMap = require(__dirname + '/../controls/service_queue.js');


class InverterInfo extends DriverBase {
	constructor (stateInstance,device) {
		super(stateInstance,device,{
			name: 'Huawei DriverInfo'
		});
		this._newInstance = null;

		//https://github.com/ioBroker/ioBroker.docs/blob/master/docs/en/dev/stateroles.md
		const newFields = [
			{
				address : 30000,
				length : 71,
				info : 'inverter model info (indicator)',
				type : deviceType.inverter,
				states: [{
					state: {id: 'info.model', name: 'Model', type: 'string', role: 'info.name', desc: 'reg:30000, len:15'},
					register: {reg: 30000, type: dataType.string, length: 8}
				},
				{
					state: {id: 'info.serialNumber', name: 'Serial number', type: 'string', role: 'info.serial', desc: 'reg:30015, len:10'},
					register: {reg: 30015, type: dataType.string, length: 6}
				},
				{
					state: {id: 'info.modelID', name: 'Model ID', type: 'number', role: 'info.hardware', desc: 'reg:30070, len:1' },
					register: {reg: 30070, type: dataType.uint16}
				}],
				readErrorHook: () => { //err,reg
					this.log.error('Can not connect to Huawei inverter for modbus ID '+this._modbusId+'!');
					//reg.lastread = this._newNowTime(); //try it once
					//return true;
				},
				postHook: (path) => {
					const detectedModelId = this.stateCache.get(path+'info.modelID')?.value;
					if (detectedModelId) {
						const model = this.stateCache.get(path+'info.model')?.value;
						this.log.info('Identified a Huawei '+model+' model '+detectedModelId+' for modbus ID '+this._modbusId);
						const model_sun2000M1 = [424,425,426,427,428,429,463,142];
						if(model_sun2000M1.includes(detectedModelId) || detectedModelId >= 430) {
							this._newInstance = new InverterSun2000_M1(this.state,device, { modelId : detectedModelId });
						} else {
							this._newInstance = new InverterSun2000(this.state,device, { modelId : detectedModelId });
						}
					} else {
						this.log.error('Huawei inverter could not be identified for modbus ID '+this._modbusId+'!');
					}
				}
			}
		];

		this.registerFields.push.apply(this.registerFields,newFields);
	}

	get newInstance () {
		return this._newInstance;
	}

	//overload
	get modbusAllowed () {
		if (isSunshine(this.adapter)) {
			if (!this._modbusAllowed) {
				this._modbusAllowed = true;
				this._errorCount = 0;
			}
		} else {
			if (this._errorCount > 3 && this._modbusAllowed) {
				this.log.warn('It will try again when the sun rises for modbus id '+this._modbusId+' :-)');
				this._modbusAllowed = false;
			}
		}
		return this._modbusAllowed;
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
		//TestMode
		this._testMode = this.adapter.settings.address === '192.168.2.54';
		this.log.debug('### TestMode (#60) '+this._testMode+ '  '+this.adapter.settings.address);
		this._testMode = false;

		this.solarSum = new RiemannSum();
		this.adapter.getState(this.deviceInfo.path+'.derived.dailySolarYield',(err, state) => {
			if (!err && state) this.solarSum.setStart(state.val,state.ts);
		});

		this.control = new ServiceQueueMap(this.adapter,this.deviceInfo);

		//https://github.com/ioBroker/ioBroker.docs/blob/master/docs/en/dev/stateroles.md
		const newFields = [
			{
				address : 30000,
				length : 83, //NRGKick und enpal-box
				info : 'inverter model info',
				type : deviceType.inverter,
				states: [{
					state: {id: 'info.model', name: 'Model', type: 'string', role: 'info.name'},
					register: {reg: 30000, type: dataType.string, length: 8},
					store: storeType.never
				},
				{
					state: {id: 'info.modelID', name: 'Model ID', type: 'number', role: 'info.hardware'},
					register: {reg: 30070, type: dataType.uint16},
					store: storeType.never
				},
				{
					state: {id: 'info.serialNumber', name: 'Serial number', type: 'string', role: 'info.serial'},
					register: {reg: 30015, type: dataType.string, length: 6},
					store: storeType.never
				},
				{
					state: {id: 'info.numberPVStrings', name: 'Number of PV Strings', type: 'number', unit: '', role: 'value', desc: 'reg:30071, len:1'},
					register: {reg: 30071, type: dataType.uint16}
				},
				{
					state: {id: 'info.numberMPPTrackers', name: 'Number of MPP trackers', type: 'number', unit: '', role: 'value', desc: 'reg:30072, len:1'},
					register: {reg: 30072, type: dataType.uint16}
				},
				{
					state: {id: 'info.ratedPower', name: 'Rated power', type: 'number', unit: 'kW', role: 'value.power', desc: 'reg:30073, len:2'},
					register: {reg: 30073, type: dataType.int32, gain:1000}
				}],
			},
			{
				address : 32080,
				length : 2,
				info : 'Inverter Activ Power',
				refresh : dataRefreshRate.high,
				type : deviceType.inverter,
				states : [{
					state: {id: 'activePower', name: 'Active power', type: 'number', unit: 'kW', role: 'value.power.active', desc: 'reg:32080, len:2, Power currently used',},
					register: {reg: 32080, type: dataType.int32, gain:1000},
					store : storeType.always
				}]
			},
			{
				address : 37765,
				length : 2,
				info : 'Battery Charge And Discharge Power',
				refresh : dataRefreshRate.high,
				type : deviceType.battery,
				states : [{
					state: {id: 'battery.chargeDischargePower', name: 'Charge/Discharge power', desc: 'reg:37765, len:2 (>0 charging, <0 discharging)', type: 'number', unit: 'kW', role: 'value.power'},
					register: {reg: 37765, type: dataType.int32, gain:1000}
				}]
			},
			{
				address : 32064,
				length : 2,
				info : 'Input Power',
				refresh : dataRefreshRate.high,
				type : deviceType.inverter,
				states : [{
					state: {id: 'inputPower', name: 'Input power' , type: 'number', unit: 'kW', role: 'value.power.produced', desc: 'reg:32064, len:2, Power from solar'},
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
				address : 37113,
				length : 2,
				info : 'meter activePower',
				refresh : dataRefreshRate.high,
				type : deviceType.meter,
				//standby : true,
				states: [{
					state: {id: 'meter.activePower', name: 'ActivePower', type: 'number', unit: 'kW', role: 'value.power.active', desc: 'reg:37113, len:2 (>0: feed-in to grid. <0: supply from grid.)' },
					register: { reg: 37113, type: dataType.int32, gain:1000 }
				}]
			},
			{
				address : 37052,
				length : 10,
				info : 'battery unit1 indicator',
				states: [
					{
						state: { id: 'battery.unit.1.SN', name: 'serial number', type: 'string', unit: '', role: 'value'},
						register: { reg: 37052, type: dataType.string, length: 6},
						store: storeType.never
					},
				],
				readErrorHook: (err,reg) => {
					//modbus Error 2 - illegal address
					if(err.modbusCode === 2) {
						reg.lastread = this._newNowTime(); //try it once
						this.stateCache.set(this._getStatePath(reg.type)+'battery.unit.1.SN', '', { stored : true });
						return true; //self handle
					}
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
						state: {id: 'battery.unit.1.runningStatus', name: 'running status', type: 'string', unit: '', role: 'value', desc: 'reg:37000, len:1'},
						register: {reg: 37000, type: dataType.uint16},
						mapper: value => Promise.resolve(batteryStatus[value])
					},
					{
						state: {id: 'battery.unit.1.batterySOC', name: 'battery SOC', type: 'number', unit: '%', role: 'value.battery', desc: 'reg:37004, len:1'},
						register: {reg: 37004, type: dataType.uint16, gain:10}
					},
					{
						state: {id: 'battery.unit.1.batteryTemperature', name: 'battery temperature', type: 'number', unit: '°C', role: 'value.temperature', desc: 'reg:37022, len:1'},
						register: {reg: 37022, type: dataType.uint16, gain:10},
						mapper: value => Promise.resolve(this._checkValidNumber(value,-100,100))
					},
					{
						state: { id: 'battery.maximumChargePower', name: 'MaximumChargePower', type: 'number', unit: 'W', role: 'value.power', desc: 'reg:37046, len:2' },
						register: { reg: 37046, type: dataType.uint32 }
					},
					{
						state: { id: 'battery.maximumDischargePower', name: 'MaximumDischargePower', type: 'number', unit: 'W', role: 'value.power', desc: 'reg:37048, len:2'},
						register: { reg: 37048, type: dataType.uint32}
					}
				]
			},
			{   //for NRGKick
				address : 47000,
				length : 1,
				info : 'battery unit1 (static)',
				type : deviceType.battery,
				states: [
					{
						state: { id: 'battery.unit.1.productMode', name: 'Product Mode', type: 'number', unit: '', role: 'value', desc: 'reg:47000, len:1'},
						register: { reg: 47000, type: dataType.uint16}
					},
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
						state: {id: 'battery.chargingCutoffCapacity', name: 'Charging Cutoff Capacity', type: 'number', unit: '%', role: 'value', desc: 'reg:47081, len:1'},
						register: {reg: 47081, type: dataType.uint16, gain: 10}
					},
					{
						state: {id: 'battery.dischargeCutoffCapacity', name: 'Discharge Cutoff Capacity', type: 'number', unit: '%', role: 'value', desc: 'reg:47082, len:1'},
						register: {reg: 47082, type: dataType.uint16, gain: 10}
					},
					{
						state: {id: 'battery.forcedChargeDischargePeriod', name: 'Forced Charge Discharge Period', type: 'number', unit: 'mins', role: 'value', desc: 'reg:47083, len:1'},
						register: {reg: 47083, type: dataType.uint16}
					},
					{
						state: {id: 'battery.workingModeSettings', name: 'Working Mode Settings', type: 'number', unit: '', role: 'value', desc: 'reg:47086, len:1'},
						register: {reg: 47086, type: dataType.uint16}
					},
					{
						state: {id: 'battery.chargeFromGridFunction', name: 'Charge From Grid Function', type: 'number', unit: '', role: 'value', desc: 'reg:47087, len:1'},
						register: {reg: 47087, type: dataType.uint16}
					},
					{
						state: {id: 'battery.gridChargeCutoffSOC', name: 'Grid Charge Cutoff SOC', type: 'number', unit: '%', role: 'value', desc: 'reg:47088, len:1'},
						register: {reg: 47088, type: dataType.uint16, gain: 10}
					}]
			},
			{
				address : 32000,
				length : 11,
				info : 'inverter status',
				refresh : dataRefreshRate.low,
				type : deviceType.inverter,
				states: [
					{
						state: {id: 'state1', name: 'State 1', type: 'number', unit: '', role: 'value', desc: 'reg:32000, len:1'},
						register: {reg: 32000, type: dataType.uint16}
					},
					{
						state: {id: 'state2', name: 'State 2', type: 'number', unit: '', role: 'value', desc: 'reg:32001, len:1'},
						register: {reg: 32001, type: dataType.uint16}
					},
					{
						state: {id: 'state3', name: 'State 3', type: 'number', unit: '', role: 'value', desc: 'reg:32002, len:1'},
						register: {reg: 32002, type: dataType.uint16}
					},
					{
						state: {id: 'alarm1', name: 'Alarm 1', type: 'number', unit: '', role: 'value', desc: 'reg:32008, len:1'},
						register: {reg: 32008, type: dataType.uint16}
					},
					{
						state: {id: 'alarm2', name: 'Alarm 2', type: 'number', unit: '', role: 'value', desc: 'reg:32009, len:1'},
						register: {reg: 32009, type: dataType.uint16}
					},
					{
						state: {id: 'alarm3', name: 'Alarm 3', type: 'number', unit: '', role: 'value', desc: 'reg:32010, len:1'},
						register: {reg: 32010, type: dataType.uint16}
					}
				]
			},
			{
				address : 32016,
				length : 48,
				info : 'inverter PV strings',
				refresh : dataRefreshRate.medium,
				type : deviceType.inverter,
				states : [],
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
								//this.adapter.log.debug('### PUSH STRINGS');
								reg.states.push(statePV);
								reg.states.push(stateCu);
								reg.states.push(statePo);
							}
							reg.length = noPVString * 2;
						}
						stringFieldsTemplate.generated = noPVString;
						//this.adapter.log.debug(JSON.stringify(reg));
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
				}
			},
			{
				//read also in standby mode
				address : 32089,
				length : 1,
				info : 'inverter deviceStatus',
				refresh : dataRefreshRate.low,
				standby : true,
				type : deviceType.inverter,
				states: [{
					state: {id: 'deviceStatus', name: 'Device Status', type: 'number', unit: '', role: 'value', desc: 'reg:32089, len:1'},
					register: {reg: 32089, type: dataType.uint16},
					mapper: async value => {
						if (this._testMode) {
							this.log.info('testMode: Die Sonne scheint? '+isSunshine(this.adapter));
							if (!isSunshine(this.adapter)) return 2;
							//return 2;
						}
						return value;
					},
				},
				{
					state: {id: 'derived.deviceStatus', name: 'Device Status Information', type: 'string', unit: '', role: 'value'}
				}
				],
				readErrorHook: (err,reg) => { //(err,reg)
					if (err.modbusCode === undefined) {
						reg.lastread = this._newNowTime();
						//return true; //Error has been self handled
					}
				},
				postHook: (path) => {
					//DeviceStatus
					const deviceStatus = this.stateCache.get(path+'deviceStatus')?.value;
					this.stateCache.set(path+'derived.deviceStatus',getDeviceStatusInfo(deviceStatus));
				}
			},
			{
				address : 32066,
				length : 50,
				info : 'inverter status',
				refresh : dataRefreshRate.low,
				type : deviceType.inverter,
				states: [
					{
						state: {id: 'grid.voltageL1-L2', name: 'Voltage L1-L2', type: 'number', unit: 'V', role: 'value.voltage', desc: 'reg:32066, len:1'},
						register: {reg: 32066, type: dataType.uint16, gain: 10}

					},
					{
						state: {id: 'grid.voltageL2-L3', name: 'Voltage L2-L3', type: 'number', unit: 'V', role: 'value.voltage', desc: 'reg:32067, len:1'},
						register: {reg: 32067, type: dataType.uint16, gain: 10}

					},
					{
						state: {id: 'grid.voltageL3-L1', name: 'Voltage L3-L1', type: 'number', unit: 'V', role: 'value.voltage', desc: 'reg:32068, len:1'},
						register: {reg: 32068, type: dataType.uint16, gain: 10}

					},
					{
						state: {id: 'grid.voltageL1', name: 'Voltage L1', type: 'number', unit: 'V', role: 'value.voltage', desc: 'reg:32068, len:1'},
						register: {reg: 32069, type: dataType.uint16, gain: 10}
					},
					{
						state: {id: 'grid.voltageL2', name: 'Voltage L2', type: 'number', unit: 'V', role: 'value.voltage', desc: 'reg:32070, len:1'},
						register: {reg: 32070, type: dataType.uint16, gain: 10}
					},
					{
						state: {id: 'grid.voltageL3', name: 'Voltage L3', type: 'number', unit: 'V', role: 'value.voltage', desc: 'reg:32071, len:1'},
						register: {reg: 32071, type: dataType.uint16, gain: 10}
					},
					{
						state: {id: 'grid.currentL1', name: 'Current L1', type: 'number', unit: 'A', role: 'value.current', desc: 'reg:32072, len:2'},
						register: {reg: 32072, type: dataType.int32, gain: 1000}
					},
					{
						state: {id: 'grid.currentL2', name: 'Current L2', type: 'number', unit: 'A', role: 'value.current', desc: 'reg:32074, len:2'},
						register: {reg: 32074, type: dataType.int32, gain: 1000}
					},
					{
						state: {id: 'grid.currentL3', name: 'Current L3', type: 'number', unit: 'A', role: 'value.current', desc: 'reg:32076, len:2'},
						register: {reg: 32076, type: dataType.int32, gain: 1000}
					},
					{
						state: {id: 'peakActivePowerCurrentDay', name: 'Peak active power of current day', type: 'number', unit: 'kW', role: 'value.power.max', desc: 'reg:32078, len:2'},
						register: {reg: 32078, type: dataType.int32, gain: 1000}
					},
					{
						state: {id: 'reactivePower', name: 'Reactive Power', type: 'number', unit: 'kVar', role: 'value.power.reactive', desc: 'reg:32082, len:2'},
						register: {reg: 32082, type: dataType.int32, gain: 1000},
					},
					{
						state: {id: 'powerFactor', name: 'Power Factor', type: 'number', unit: '', role: 'value', desc: 'reg:32084, len:1'},
						register: {reg: 32084, type: dataType.int16, gain: 1000}
					},
					{
						state: {id: 'grid.frequency', name: 'Grid Frequency', type: 'number', unit: 'Hz', role: 'value.frequency', desc: 'reg:32085, len:1'},
						register: {reg: 32085, type: dataType.uint16, gain: 100},
						mapper: value => Promise.resolve(this._checkValidNumber(value,0,100))
					},
					{
						state: {id: 'efficiency', name: 'Efficiency', type: 'number', unit: '%', role: 'value', desc: 'reg:32086, len:1'},
						register: {reg: 32086, type: dataType.uint16, gain: 100},
						mapper: value => Promise.resolve(this._checkValidNumber(value,0,100)),
					},
					{
						state: {id: 'internalTemperature', name: 'Internal temperature', type: 'number', unit: '°C', role: 'value.temperature', desc: 'reg:32087, len:1'},
						register: {reg: 32087, type: dataType.int16, gain: 10},
						mapper: value => Promise.resolve(this._checkValidNumber(value,-100,100))
					},
					{
						state: {id: 'isulationResistance', name: 'Isulation Resistance', type: 'number', unit: 'MOhm', role: 'value', desc: 'reg:32088, len:1'},
						register: {reg: 32088, type: dataType.uint16, gain: 1000}
					},
					{
						state: {id: 'faultCode', name: 'Fault Code', type: 'number', unit: '', role: 'value', desc: 'reg:32090, len:1'},
						register: {reg: 32090, type: dataType.uint16}
					},
					{
						state: {id: 'startupTime', name: 'Startup Time', type: 'number', unit: '', role: 'value.time', desc: 'reg:32091, len:2'},
						register: {reg: 32091, type: dataType.uint32}
					},
					{
						state: {id: 'shutdownTime', name: 'Shutdown Time', type: 'number', unit: '', role: 'value.time', desc: 'reg:32093, len:2'},
						register: {reg: 32093, type: dataType.uint32}
					},
					{
						state: {id: 'accumulatedEnergyYield', name: 'Accumulated Energy Yield', type: 'number', unit: 'kWh', role: 'value.power.produced', desc: 'reg:32106, len:2'},
						register: {reg: 32106, type: dataType.uint32, gain: 100}
					},
					{
						state: {id: 'dailyEnergyYield', name: 'Daily Energy Yield', type: 'number', unit: 'kWh', role: 'value.power.produced', desc: 'reg:32114, len:2'},
						register: {reg: 32114, type: dataType.uint32, gain: 100}
					}
				]
			},
			{
				address : 37100,
				length : 38,
				info : 'meter info',
				refresh : dataRefreshRate.medium,
				type : deviceType.meter,
				states: [{
					state: {id: 'meter.status', name: 'Meter Status', type: 'number', unit: '', role: 'value', desc: 'reg:37100, len:2 (0: offline 1: normal)'},
					register: {reg: 37100, type: dataType.uint16}
				},
				{
					state: {id: 'meter.voltageL1', name: 'Phase 1 voltage', type: 'number', unit: 'V', role: 'value.voltage', desc: 'reg:37101, len:2'},
					register: {reg: 37101, type: dataType.int32, gain: 10}

				},
				{
					state: {id: 'meter.voltageL2', name: 'Phase 2 voltage', type: 'number', unit: 'V', role: 'value.voltage', desc: 'reg:37103, len:2'},
					register: {reg: 37103, type: dataType.int32, gain:10}
				},
				{
					state: {id: 'meter.voltageL3', name: 'Phase 3 voltage', type: 'number', unit: 'V', role: 'value.voltage', desc: 'reg:37105, len:2'},
					register: {reg: 37105, type: dataType.int32, gain:10}
				},
				{
					state: {id: 'meter.currentL1', name: 'Phase 1 Current', type: 'number', unit: 'A', role: 'value.current', desc: 'reg:37107, len:2'},
					register: {reg: 37107, type: dataType.int32, gain:100}
				},
				{
					state: {id: 'meter.currentL2', name: 'Phase 2 Current', type: 'number', unit: 'A', role: 'value.current', desc: 'reg:37109, len:2'},
					register: {reg: 37109, type: dataType.int32, gain:100}
				},
				{
					state: {id: 'meter.currentL3', name: 'Phase 3 Current', type: 'number', unit: 'A', role: 'value.current', desc: 'reg:37111, len:2'},
					register: {reg: 37111, type: dataType.int32, gain:100}
				},
				{
					state: {id: 'meter.reactivePower', name: 'Reactive Power', type: 'number', unit: 'VAr', role: 'value.power.reactive', desc: 'reg:37115, len:2'},
					register: {reg: 37115, type: dataType.int32}
				},
				{
					state: {id: 'meter.powerFactor', name: 'Power Factor', type: 'number', unit: '', role: 'value', desc: 'reg:37117, len:1'},
					register: {reg: 37117, type: dataType.int16, gain: 1000}
				},
				{
					state: {id: 'meter.gridFrequency', name: 'Grid Frequency', type: 'number', unit: 'Hz', role: 'value.frequency', desc: 'reg:37118, len:1'},
					register: {reg: 37118, type: dataType.int16, gain: 100},
					mapper: value => Promise.resolve(this._checkValidNumber(value,0,100))
				},
				{
					state: {id: 'meter.positiveActiveEnergy', name: 'Positive Active Energy', type: 'number', unit: 'kWh', role: 'value.power.consumption', desc: 'reg:37119, len:2'},
					register: {reg: 37119, type: dataType.int32, gain: 100}
				},
				{
					state: {id: 'meter.reverseActiveEnergy', name: 'Reverse Active Energy', type: 'number', unit: 'kWh', role: 'value.power.consumption', desc: 'reg:37121, len:2'},
					register: {reg: 37121, type: dataType.int32, gain: 100}
				},
				{
					state: {id: 'meter.accumulatedReactivePower', name: 'Accumulated Reactive Power', type: 'number', unit: 'kVarh', role: 'value.power.reactive.consumption', desc: 'reg:37123, len:2'},
					register: {reg: 37123, type: dataType.int32, gain: 100}
				},
				{
					state: {id: 'meter.voltageL1-L2', name: 'Voltage L1-L2', type: 'number', unit: 'V', role: 'value.voltage', desc: 'reg:37126, len:2'},
					register: {reg: 37126, type: dataType.int32, gain: 10}
				},
				{
					state: {id: 'meter.voltageL2-L3', name: 'Voltage L2-L3', type: 'number', unit: 'V', role: 'value.voltage', desc: 'reg:37128, len:2'},
					register: {reg: 37128, type: dataType.int32, gain: 10}
				},
				{
					state: {id: 'meter.voltageL3-L1', name: 'Voltage L3-L1', type: 'number', unit: 'V', role: 'value.voltage', desc: 'reg:37130, len:2'},
					register: {reg: 37130, type: dataType.int32, gain: 10}
				},
				{
					state: {id: 'meter.activePowerL1', name: 'Active Power L1', type: 'number', unit: 'W', role: 'value.current', desc: 'reg:37132, len:2'},
					register: {reg: 37132, type: dataType.int32}
				},
				{
					state: {id: 'meter.activePowerL2', name: 'Active Power L2', type: 'number', unit: 'W', role: 'value.current', desc: 'reg:37134, len:2'},
					register: {reg: 37134, type: dataType.int32}
				},
				{
					state: {id: 'meter.activePowerL3', name: 'Active Power L3', type: 'number', unit: 'W', role: 'value.current', desc: 'reg:37136, len:2'},
					register: {reg: 37136, type: dataType.int32}
				}
				]
			},
			{
				address : 37758,
				length : 30,
				info : 'battery information',
				refresh : dataRefreshRate.low,
				type : deviceType.battery,
				states: [
					{
						state: {id: 'battery.ratedCapacity', name: 'Rated Capacity', type: 'number', unit: 'Wh', role: 'value.capacity', desc: 'reg:37758, len:2'},
						register: {reg: 37758, type: dataType.uint32}
					},
					{
						state: {id: 'battery.SOC', name: 'State of capacity', type: 'number', unit: '%', role: 'value.battery', desc: 'reg:37760, len:1'},
						register: {reg: 37760, type: dataType.uint16, gain: 10}
					},
					{
						state: {id: 'battery.runningStatus', name: 'Running status', type: 'string', role: 'value', desc: 'reg:37762, len:1'},
						register: {reg: 37762, type: dataType.uint16, length: 1},
						mapper: value => Promise.resolve(batteryStatus[value])
					},
					{
						state: {id: 'battery.busVoltage', name: 'Bus Voltage', type: 'number', unit: 'V', role: 'value.voltage', desc: 'reg:37763, len:1'},
						register: {reg: 37763, type: dataType.uint16, gain: 10},
					},
					{
						state: {id: 'battery.busCurrent', name: 'Bus Current', type: 'number', unit: 'A', role: 'value.current', desc: 'reg:37764, len:1'},
						register: {reg: 37764, type: dataType.int16, gain: 10},
					},
					{
						state: {id: 'battery.totalCharge', name: 'Total Charge', type: 'number', unit: 'kWh', role: 'value.power.consumption', desc: 'reg:37780, len:2'},
						register: {reg: 37780, type: dataType.uint32, gain: 100}
					},
					{
						state: {id: 'battery.totalDischarge', name: 'Total Discharge', type: 'number', unit: 'kWh', role: 'value.power.consumption', desc: 'reg:37782, len:2'},
						register: {reg: 37782, type: dataType.uint32, gain: 100}
					},
					{
						state: {id: 'battery.currentDayChargeCapacity', name: 'Current Day Charge Capacity', type: 'number', unit: 'kWh', role: 'value.power.consumption', desc: 'reg:37784, len:2' },
						register: { reg: 37784, type: dataType.uint32,  gain: 100 }
					},
					{
						state: {id: 'battery.currentDayDischargeCapacity', name: 'Current Day Discharge Capacity', type: 'number', unit: 'kWh', role: 'value.power.consumption',  desc: 'reg:37786, len:2' },
						register: { reg: 37786, type: dataType.uint32,  gain: 100 }
					}
				]
			},
			{
				//https://photomate.zendesk.com/hc/en-gb/articles/5701625507485-Export-limitation-for-SUN2000-inverters-via-FusionSolar-App
				address : 47415,
				length : 4,
				info : 'grid feed export',
				refresh : dataRefreshRate.low,
				type : deviceType.gridPowerControl,
				states: [{
					state: {id: 'grid.activePowerControlMode', name: 'Active Power Control Mode', type: 'number', unit: '', role: 'value', desc: 'reg:47415, len:1'},
					register: {reg: 47415, type: dataType.uint16}
				},
				{
					state: { id: 'grid.maximumFeedGridPower', name: 'Maximum Feed Grid Power', type: 'number', unit: 'kW', role: 'value.power', desc: 'reg: 47416, len: 2'},
					register: {reg: 47416, type: dataType.uint32, gain: 1000}
				},
				{
					state: { id: 'grid.maximumFeedGridPower_percent', name: 'Maximum Feed Grid Power %', type: 'number', unit: '%', role: 'value', desc: 'reg: 47418, len: 1'},
					register: {reg: 47418, type: dataType.int16, gain: 10}
				}
				]
			}

		];
		this.registerFields.push.apply(this.registerFields,newFields);

		//Template for StringsRegister
		const stringFieldsTemplate = {
			states : [
				{
					state: {id: 'string.PV1Voltage', name: 'string voltage', type: 'number', unit: 'V', role: 'value.voltage', desc: 'reg:32016+2(n-1), len:1'},
					register: {reg: 32016, type: dataType.int16, length: 1, gain: 10}
				},
				{
					state: {id: 'string.PV1Current', name: 'string current', type: 'number', unit: 'A', role: 'value.current', desc: 'reg:32017+2(n-1), len:1'},
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
					let inputYield = this.stateCache.get(path+'dailyEnergyYield')?.value *0.97 + charge - disCharge;

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
			this.log.warn('_checkValidNumber '+value+' from: '+from+' until: '+until);
			return substWith;
		}
		return value;
	}

	//overload
	get modbusAllowed () {
		//if the modbus-device offline we cannot read or write anythink!
		let modbusAllowed = true;
		if (this.deviceInfo.index > 0) { //I am a slave inverter
			if (this.adapter.devices[0].driverClass === driverClasses.inverter && this.adapter.devices[0].instance) {
				modbusAllowed = this.adapter.devices[0].instance.modbusAllowed; //first ask the master
			}
		}
		if (modbusAllowed) {
			//430 = SUN2000-8KTL-M2
			if (this._modelId < 430) modbusAllowed = this.deviceStatus !== 0x0002;
			if (this._errorCount > 3) modbusAllowed = false;
		}

		if (!modbusAllowed && !this.log.quiet) {
			this.log.info(`The inverter with modbus ID ${this._modbusId} is no longer accessible. That is why the logs are minimized.`);
			this.log.beQuiet(true);
		}
		if (modbusAllowed && this.log.quiet) {
			this.log.beQuiet(false);
			this.log.info(`The inverter with modbus ID ${this._modbusId} is accessible again.`);
			this._errorCount = 0;
		}
		this._modbusAllowed = modbusAllowed;
		return this._modbusAllowed;
	}

	//overload
	get deviceStatus() {
		const status = this.stateCache.get(this._getStatePath()+'deviceStatus')?.value;
		if (status) {
			if (status !== this._deviceStatus && this._deviceStatus >= 0) {
				this.log.info(`The Inverter with modbus ID ${this._modbusId} switches to ${this.stateCache.get(this.deviceInfo.path+'.derived.deviceStatus')?.value} mode.`);
			}
			this._deviceStatus = status;
		}
		return this._deviceStatus;
	}

	async mitnightProcess() {
		this.solarSum.reset();
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
					state: {id: 'optimizer.optimizerTotalNumber', name: 'Optimizer Total Number', type: 'number', unit: '', role: 'value', desc: 'reg:37200, len:1'},
					register: {reg: 37200, type: dataType.int16}
				},
				{
					state: {id: 'optimizer.optimizerOnlineNumber', name: 'Optimizer Online Number', type: 'number', unit: '', role: 'value', desc: 'reg:37201, len:1'},
					register: {reg: 37201, type: dataType.int16}
				},
				{
					state: {id: 'optimizer.optimizerFeatureData', name: 'Optimizer Feature Data', type: 'number', unit: '', role: 'value', desc: 'reg:37202, len:1'},
					register: {reg: 37202, type: dataType.int16}
				}]
			},
			{

				address : 37700,
				length : 10,
				info : 'battery unit2 indicator',
				states: [
					{
						state: { id: 'battery.unit.2.SN', name: 'serial number', type: 'string', unit: '', role: 'value', desc: 'reg:37700, len:10'},
						register: { reg: 37700, type: dataType.string, length: 10},
						store: storeType.never
					}
				],
				readErrorHook: (err,reg) => {
					//modbus Error 2 - illegal address
					if(err.modbusCode === 2) {
						reg.lastread = this._newNowTime(); //try it once
						this.stateCache.set(this._getStatePath(reg.type)+'battery.unit.2.SN', '', { stored : true });
						return true; //self handle
					}
				}
			},
			{
				address : 37738,
				length : 15,
				info : 'battery unit2 information',
				refresh : dataRefreshRate.low,
				type : deviceType.batteryUnit2,
				states: [
					{
						state: {id: 'battery.unit.2.batterySOC', name: 'battery SOC', type: 'number', unit: '%', role: 'value.battery', desc: 'reg:37738, len:1'},
						register: {reg: 37738, type: dataType.uint16, gain:10}
					},
					{
						state: {id: 'battery.unit.2.runningStatus', name: 'running status', type: 'string', unit: '', role: 'value', desc: 'reg:37741, len:1'},
						register: {reg: 37741, type: dataType.uint16},
						mapper: value => Promise.resolve(batteryStatus[value])
					},
					{
						state: {id: 'battery.unit.2.batteryTemperature', name: 'battery temperature', type: 'number', unit: '°C', role: 'value.temperature', desc: 'reg:37752, len:1'},
						register: {reg: 37752, type: dataType.uint16, gain:10},
						mapper: value => Promise.resolve(this._checkValidNumber(value,-100,100))
					}
				]
			},
			{   //for NRGKick
				address : 47089,
				length : 1,
				info : 'battery unit2 (static)',
				type : deviceType.batteryUnit2,
				states: [
					{
						state: { id: 'battery.unit.2.productMode', name: 'Product Mode', type: 'number', unit: '', role: 'value', desc: 'reg:37089, len:1'},
						register: { reg: 47089, type: dataType.uint16}
					},
				]
			}
		];
		this.registerFields.push.apply(this.registerFields,newFields);
	}
}


module.exports = {
	InverterInfo,
	InverterSun2000,
	InverterSun2000_M1
};

