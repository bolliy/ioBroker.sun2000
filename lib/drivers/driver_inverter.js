'use strict';

const { deviceType, driverClasses, storeType, getDeviceStatusInfo, batteryStatus, dataRefreshRate, dataType } = require(`${__dirname}/../types.js`);
const { RiemannSum, isSunshine } = require(`${__dirname}/../tools.js`);
const DriverBase = require(`${__dirname}/driver_base.js`);
const ServiceQueueMap = require(`${__dirname}/../controls/inverter_service_queue.js`);

class InverterInfo extends DriverBase {
	constructor(stateInstance, device) {
		super(stateInstance, device, {
			name: 'Huawei DriverInfo',
		});
		this._newInstance = null;

		//https://github.com/ioBroker/ioBroker.docs/blob/master/docs/en/dev/stateroles.md
		const newFields = [
			{
				address: 30000,
				length: 71,
				info: 'inverter model info (indicator)',
				type: deviceType.inverter,
				states: [
					{
						state: { id: 'info.model', name: 'model', type: 'string', role: 'info.name', desc: 'reg:30000, len:15' },
						register: { reg: 30000, type: dataType.string, length: 8 },
					},
					{
						state: { id: 'info.serialNumber', name: 'serial number', type: 'string', role: 'info.serial', desc: 'reg:30015, len:10' },
						register: { reg: 30015, type: dataType.string, length: 6 },
					},
					{
						state: { id: 'info.modelID', name: 'Model ID', type: 'number', role: 'info.hardware', desc: 'reg:30070, len:1' },
						register: { reg: 30070, type: dataType.uint16 },
					},
				],
				readErrorHook: () => {
					//err,reg
					this.log.error(`Can not connect to Huawei inverter for modbus ID ${this._modbusId}!`);
					//reg.lastread = this._newNowTime(); //try it once
					//return true;
				},
				postHook: path => {
					const detectedModelId = this.stateCache.get(`${path}info.modelID`)?.value;
					if (detectedModelId) {
						const model = this.stateCache.get(`${path}info.model`)?.value;
						this.log.info(`Identified a Huawei ${model} model ${detectedModelId} for modbus ID ${this._modbusId}`);
						const model_sun2000M1 = [424, 425, 426, 427, 428, 429, 463, 142];
						if (model_sun2000M1.includes(detectedModelId) || detectedModelId >= 430) {
							this._newInstance = new InverterSun2000_M1(this.state, device, { modelId: detectedModelId });
						} else {
							this._newInstance = new InverterSun2000(this.state, device, { modelId: detectedModelId });
						}
					} else {
						this.log.error(`Huawei inverter could not be identified for modbus ID ${this._modbusId}!`);
					}
				},
			},
		];

		this.registerFields.push.apply(this.registerFields, newFields);
	}

	get newInstance() {
		return this._newInstance;
	}

	//overload
	get modbusAllowed() {
		if (isSunshine(this.adapter)) {
			if (!this._modbusAllowed) {
				this._modbusAllowed = true;
				this._errorCount = 0;
			}
		} else {
			if (this._errorCount > 3 && this._modbusAllowed) {
				this.log.warn(`It will try again when the sun rises for modbus id ${this._modbusId} :-)`);
				this._modbusAllowed = false;
			}
		}
		return this._modbusAllowed;
	}
}

class InverterSun2000 extends DriverBase {
	constructor(stateInstance, inverter, options) {
		super(stateInstance, inverter, {
			name: 'sun2000',
			driverClass: driverClasses.inverter,
			...options,
		});
		//TestMode
		//this._testMode = this.adapter.settings.address === '192.168.2.54';
		this._testMode = false;
		this.log.debug(`### TestMode (#60) ${this._testMode}  ${this.adapter.settings.address}`);

		this.solarSum = new RiemannSum();
		this.adapter.getState(`${this.deviceInfo.path}.derived.dailySolarYield`, (err, state) => {
			if (!err && state) {
				this.solarSum.setStart(state.val, state.ts);
			}
		});

		this.control = new ServiceQueueMap(this.adapter, this.deviceInfo);

		//https://github.com/ioBroker/ioBroker.docs/blob/master/docs/en/dev/stateroles.md
		const newFields = [
			{
				address: 30000,
				length: 83, //NRGKick und enpal-box
				info: 'inverter model info',
				type: deviceType.inverter,
				states: [
					{
						state: { id: 'info.model', name: 'Model', type: 'string', role: 'info.name' },
						register: { reg: 30000, type: dataType.string, length: 8 },
						store: storeType.never,
					},
					{
						state: { id: 'info.modelID', name: 'Model ID', type: 'number', role: 'info.hardware' },
						register: { reg: 30070, type: dataType.uint16 },
						store: storeType.never,
					},
					{
						state: { id: 'info.serialNumber', name: 'Serial number', type: 'string', role: 'info.serial' },
						register: { reg: 30015, type: dataType.string, length: 6 },
						store: storeType.never,
					},
					{
						state: { id: 'info.numberPVStrings', name: 'Number of PV strings', type: 'number', unit: '', role: 'value', desc: 'reg:30071, len:1' },
						register: { reg: 30071, type: dataType.uint16 },
					},
					{
						state: {
							id: 'info.numberMPPTrackers',
							name: 'Number of MPP trackers',
							type: 'number',
							unit: '',
							role: 'value',
							desc: 'reg:30072, len:1',
						},
						register: { reg: 30072, type: dataType.uint16 },
					},
					{
						state: { id: 'info.ratedPower', name: 'Rated power', type: 'number', unit: 'kW', role: 'value.power', desc: 'reg:30073, len:2' },
						register: { reg: 30073, type: dataType.int32, gain: 1000 },
					},
				],

				postHook: () => {
					if (!this._testMode) return;

					this.log.debug('### PostHook for InverterSun2000');
					this.identifySubdevices('sun2000', this.modbusId)
						.then(ret => {
							this.log.debug(`### PostHook for InverterSun2000 - ret: ${JSON.stringify(ret)}`);
							for (const [i, inverter] of ret.entries()) {
								this.log.info(`${this._name} identifies an inverter sun2000: OID=${inverter.obj_id}, modbus id: ${inverter.slave_id}`);
								const device = {
									index: i,
									duration: 0,
									modbusId: inverter.slave_id,
									driverClass: driverClasses.emmaCharger,
								};
								this.adapter.devices.push(device);
								this.adapter.initDevicePath(device);
							}
						})
						.catch(err => {
							this.log.warn(`### PostHook for InverterSun2000 - err: ${err}`);
						});
				},
			},
			{
				address: 32080,
				length: 2,
				info: 'Inverter Activ Power',
				refresh: dataRefreshRate.high,
				type: deviceType.inverter,
				states: [
					{
						state: {
							id: 'activePower',
							name: 'Active power',
							type: 'number',
							unit: 'kW',
							role: 'value.power.active',
							desc: 'reg:32080, len:2, Power currently used',
						},
						register: { reg: 32080, type: dataType.int32, gain: 1000 },
						store: storeType.always,
					},
				],
			},
			{
				address: 37765,
				length: 2,
				info: 'Battery Charge And Discharge Power',
				refresh: dataRefreshRate.high,
				type: deviceType.battery,
				states: [
					{
						state: {
							id: 'battery.chargeDischargePower',
							name: 'Charge/Discharge power',
							desc: 'reg:37765, len:2 (>0 charging, <0 discharging)',
							type: 'number',
							unit: 'kW',
							role: 'value.power',
						},
						register: { reg: 37765, type: dataType.int32, gain: 1000 },
					},
				],
				//Check if the address field is active
				checkIfActive: () => this._batteryExists(),
			},
			{
				address: 32064,
				length: 2,
				info: 'Input Power',
				refresh: dataRefreshRate.high,
				type: deviceType.inverter,
				states: [
					{
						state: {
							id: 'inputPower',
							name: 'Input power',
							type: 'number',
							unit: 'kW',
							role: 'value.power.produced',
							desc: 'reg:32064, len:2, Power from solar',
						},
						register: { reg: 32064, type: dataType.int32, gain: 1000 },
						store: storeType.always,
					},
					{
						state: {
							id: 'derived.inputPowerWithEfficiencyLoss',
							name: 'Input power with efficiency loss',
							type: 'number',
							unit: 'kW',
							role: 'value.power',
							desc: 'Power from solar with efficiency loss',
						},
					},
				],
				postHook: path => {
					//https://community.home-assistant.io/t/integration-solar-inverter-huawei-2000l/132350/1483?u=wlcrs
					const inPower = this.stateCache.get(`${path}inputPower`)?.value;
					//https://wiki.selfhtml.org/wiki/JavaScript/Operatoren/Optional_Chaining_Operator
					//const ratedPower = state ? state.val : undefined;
					const ratedPower = this.stateCache.get(`${path}info.ratedPower`)?.value;
					let inPowerEff = inPower;
					if (inPower < ratedPower * 0.2) {
						if (inPower < ratedPower * 0.1) {
							inPowerEff *= 0.9;
						} else {
							inPowerEff *= 0.95;
						}
					} else {
						inPowerEff *= 0.98;
					}
					this.stateCache.set(`${path}derived.inputPowerWithEfficiencyLoss`, inPowerEff, { type: 'number' });
					this.solarSum.add(inPowerEff); //riemann Sum
				},
			},
			{
				address: 37052,
				length: 10,
				info: 'battery unit1 (indicator)',
				states: [
					{
						state: { id: 'battery.unit.1.SN', name: 'Serial number', type: 'string', unit: '', role: 'value' },
						register: { reg: 37052, type: dataType.string, length: 6 },
						store: storeType.never,
					},
				],
				readErrorHook: (err, reg) => {
					//modbus Error 2 - illegal address
					if (err.modbusCode === 2) {
						reg.lastread = this._newNowTime(); //try it once
						this.stateCache.set(`${this._getStatePath(reg.type)}battery.unit.1.SN`, '', { stored: true });
						return true; //error self handle
					}
				},
			},
			//--
			{
				address: 38200,
				length: 10,
				info: 'battery unit1 Pack1 (indicator)',
				states: [
					{
						state: { id: 'battery.unit.1.batteryPack.1.SN', name: 'Serial number', type: 'string', unit: '', role: 'value' },
						register: { reg: 38200, type: dataType.string, length: 6 },
						store: storeType.never,
					},
				],
				readErrorHook: (err, reg) => {
					//modbus Error 2 - illegal address
					if (err.modbusCode === 2) {
						reg.lastread = this._newNowTime(); //try it only once
						this.stateCache.set(`${this._getStatePath(reg.type)}battery.unit.1.batteryPack.1.SN`, '', { stored: true });
						return true; //error self handle
					}
				},
			},
			{
				address: 38242,
				length: 10,
				info: 'battery unit1 Pack2 (indicator)',
				states: [
					{
						state: { id: 'battery.unit.1.batteryPack.2.SN', name: 'Serial number', type: 'string', unit: '', role: 'value' },
						register: { reg: 38242, type: dataType.string, length: 6 },
						store: storeType.never,
					},
				],
				readErrorHook: (err, reg) => {
					//modbus Error 2 - illegal address
					if (err.modbusCode === 2) {
						reg.lastread = this._newNowTime(); //try it only once
						this.stateCache.set(`${this._getStatePath(reg.type)}battery.unit.1.batteryPack.2.SN`, '', { stored: true });
						return true; //error self handle
					}
				},
			},
			{
				address: 38284,
				length: 10,
				info: 'battery unit1 Pack3 (indicator)',
				states: [
					{
						state: { id: 'battery.unit.1.batteryPack.3.SN', name: 'Serial number', type: 'string', unit: '', role: 'value' },
						register: { reg: 38284, type: dataType.string, length: 6 },
						store: storeType.never,
					},
				],
				readErrorHook: (err, reg) => {
					//modbus Error 2 - illegal address
					if (err.modbusCode === 2) {
						reg.lastread = this._newNowTime(); //try it only once
						this.stateCache.set(`${this._getStatePath(reg.type)}battery.unit.1.batteryPack.3.SN`, '', { stored: true });
						return true; //error self handle
					}
				},
			},
			{
				address: 38229,
				length: 13,
				info: 'battery Pack1 information',
				refresh: dataRefreshRate.low,
				type: deviceType.battery,
				states: [
					{
						state: {
							id: 'battery.unit.1.batteryPack.1.SOC',
							name: 'State of capacity',
							type: 'number',
							unit: '%',
							role: 'value.battery',
							desc: 'reg:38229 len:1',
						},
						register: { reg: 38229, type: dataType.uint16, gain: 10 },
					},
					{
						state: {
							id: 'battery.unit.1.batteryPack.1.totalCharge',
							name: 'Total charge',
							type: 'number',
							unit: 'kWh',
							role: 'value.power.consumption',
							desc: 'reg:38238, len:2',
						},
						register: { reg: 38238, type: dataType.uint32, gain: 100 },
					},
					{
						state: {
							id: 'battery.unit.1.batteryPack.1.totalDischarge',
							name: 'Total discharge',
							type: 'number',
							unit: 'kWh',
							role: 'value.power.consumption',
							desc: 'reg:38240, len:2',
						},
						register: { reg: 38240, type: dataType.uint32, gain: 100 },
					},
				],
				checkIfActive: () => this._batteryExists(1, 1),
			},
			{
				address: 38271,
				length: 13,
				info: 'battery Pack2 information',
				refresh: dataRefreshRate.low,
				type: deviceType.battery,
				states: [
					{
						state: {
							id: 'battery.unit.1.batteryPack.2.SOC',
							name: 'State of capacity',
							type: 'number',
							unit: '%',
							role: 'value.battery',
							desc: 'reg:38271, len:1',
						},
						register: { reg: 38271, type: dataType.uint16, gain: 10 },
					},
					{
						state: {
							id: 'battery.unit.1.batteryPack.2.totalCharge',
							name: 'Total charge',
							type: 'number',
							unit: 'kWh',
							role: 'value.power.consumption',
							desc: 'reg:38280, len:2',
						},
						register: { reg: 38280, type: dataType.uint32, gain: 100 },
					},
					{
						state: {
							id: 'battery.unit.1.batteryPack.2.totalDischarge',
							name: 'Total discharge',
							type: 'number',
							unit: 'kWh',
							role: 'value.power.consumption',
							desc: 'reg:38282, len:2',
						},
						register: { reg: 38282, type: dataType.uint32, gain: 100 },
					},
				],
				checkIfActive: () => this._batteryExists(1, 2),
			},
			{
				address: 38313,
				length: 13,
				info: 'battery Pack3 information',
				refresh: dataRefreshRate.low,
				type: deviceType.battery,
				states: [
					{
						state: {
							id: 'battery.unit.1.batteryPack.3.SOC',
							name: 'State of capacity',
							type: 'number',
							unit: '%',
							role: 'value.battery',
							desc: 'reg:38313, len:1',
						},
						register: { reg: 38313, type: dataType.uint16, gain: 10 },
					},
					{
						state: {
							id: 'battery.unit.1.batteryPack.3.totalCharge',
							name: 'Total charge',
							type: 'number',
							unit: 'kWh',
							role: 'value.power.consumption',
							desc: 'reg:38322, len:2',
						},
						register: { reg: 38322, type: dataType.uint32, gain: 100 },
					},
					{
						state: {
							id: 'battery.unit.1.batteryPack.3.totalDischarge',
							name: 'Total discharge',
							type: 'number',
							unit: 'kWh',
							role: 'value.power.consumption',
							desc: 'reg:38324, len:2',
						},
						register: { reg: 38324, type: dataType.uint32, gain: 100 },
					},
				],
				checkIfActive: () => this._batteryExists(1, 3),
			},
			{
				address: 38233,
				length: 3,
				info: 'Battery Pack1 Charge And Discharge Power',
				refresh: dataRefreshRate.high,
				type: deviceType.battery,
				states: [
					{
						state: {
							id: 'battery.unit.1.batteryPack.1.chargeDischargePower',
							name: 'Charge/Discharge power',
							desc: 'reg:38233, len:2 (>0 charging, <0 discharging)',
							type: 'number',
							unit: 'kW',
							role: 'value.power',
						},
						register: { reg: 38233, type: dataType.int32, gain: 1000 },
					},
					{
						state: {
							id: 'battery.unit.1.batteryPack.1.voltage',
							name: 'Voltage',
							type: 'number',
							unit: 'V',
							role: 'value.voltage',
							desc: 'reg:38235, len:1',
						},
						register: { reg: 38235, type: dataType.uint16, gain: 10 },
					},
				],
				checkIfActive: () => this._batteryExists(1, 1),
			},
			{
				address: 38275,
				length: 3,
				info: 'Battery Pack2 Charge And Discharge Power',
				refresh: dataRefreshRate.high,
				type: deviceType.battery,
				states: [
					{
						state: {
							id: 'battery.unit.1.batteryPack.2.chargeDischargePower',
							name: 'Charge/Discharge power',
							desc: 'reg:38275, len:2 (>0 charging, <0 discharging)',
							type: 'number',
							unit: 'kW',
							role: 'value.power',
						},
						register: { reg: 38275, type: dataType.int32, gain: 1000 },
					},
					{
						state: {
							id: 'battery.unit.1.batteryPack.2.voltage',
							name: 'Voltage',
							type: 'number',
							unit: 'V',
							role: 'value.voltage',
							desc: 'reg:38277, len:1',
						},
						register: { reg: 38277, type: dataType.uint16, gain: 10 },
					},
				],
				checkIfActive: () => this._batteryExists(1, 2),
			},
			{
				address: 38317,
				length: 3,
				info: 'Battery Pack3 Charge And Discharge Power',
				refresh: dataRefreshRate.high,
				type: deviceType.battery,
				states: [
					{
						state: {
							id: 'battery.unit.1.batteryPack.3.chargeDischargePower',
							name: 'Charge/Discharge power',
							desc: 'reg:38317, len:2 (>0 charging, <0 discharging)',
							type: 'number',
							unit: 'kW',
							role: 'value.power',
						},
						register: { reg: 38317, type: dataType.int32, gain: 1000 },
					},
					{
						state: {
							id: 'battery.unit.1.batteryPack.3.voltage',
							name: 'Voltage',
							type: 'number',
							unit: 'V',
							role: 'value.voltage',
							desc: 'reg:38319, len:1',
						},
						register: { reg: 38319, type: dataType.uint16, gain: 10 },
					},
				],
				checkIfActive: () => this._batteryExists(1, 3),
			},
			//++
			{
				address: 37000,
				length: 23,
				info: 'battery Unit1 information',
				refresh: dataRefreshRate.low,
				type: deviceType.battery,
				states: [
					{
						state: {
							id: 'battery.unit.1.runningStatus',
							name: 'Running status',
							type: 'number',
							unit: '',
							role: 'value',
							desc: 'reg:37000, len:1',
						},
						register: { reg: 37000, type: dataType.uint16 },
						//mapper: value => Promise.resolve(batteryStatus[value]),
					},
					{
						state: {
							id: 'battery.unit.1.batterySOC',
							name: 'Battery SOC',
							type: 'number',
							unit: '%',
							role: 'value.battery',
							desc: 'reg:37004, len:1',
						},
						register: { reg: 37004, type: dataType.uint16, gain: 10 },
					},
					{
						state: {
							id: 'battery.unit.1.RatedChargePower',
							name: 'Rated charge power',
							type: 'number',
							unit: 'W',
							role: 'value.power',
							desc: 'reg:37007, len:2',
						},
						register: { reg: 37007, type: dataType.uint32 },
					},
					{
						state: {
							id: 'battery.unit.1.RatedDischargePower',
							name: 'Rated discharge power',
							type: 'number',
							unit: 'W',
							role: 'value.power',
							desc: 'reg:37009, len:2',
						},
						register: { reg: 37009, type: dataType.uint32 },
					},
					{
						state: {
							id: 'battery.unit.1.batteryTemperature',
							name: 'Battery temperature',
							type: 'number',
							unit: '°C',
							role: 'value.temperature',
							desc: 'reg:37022, len:1',
						},
						register: { reg: 37022, type: dataType.uint16, gain: 10 },
						mapper: value => Promise.resolve(this._checkValidNumber(value, -100, 100)),
					},
				],
				checkIfActive: () => this._batteryExists(1),
			},
			{
				address: 37046,
				length: 4,
				info: 'battery information',
				refresh: dataRefreshRate.low,
				type: deviceType.battery,
				states: [
					{
						state: {
							id: 'battery.maximumChargePower',
							name: 'Maximum charge power',
							type: 'number',
							unit: 'W',
							role: 'value.power',
							desc: 'reg:37046, len:2',
						},
						register: { reg: 37046, type: dataType.uint32 },
					},
					{
						state: {
							id: 'battery.maximumDischargePower',
							name: 'Maximum discharge power',
							type: 'number',
							unit: 'W',
							role: 'value.power',
							desc: 'reg:37048, len:2',
						},
						register: { reg: 37048, type: dataType.uint32 },
					},
				],
				checkIfActive: () => this._batteryExists(),
			},
			{
				address: 37758,
				length: 30,
				info: 'battery information',
				refresh: dataRefreshRate.low,
				type: deviceType.battery,
				states: [
					{
						state: {
							id: 'battery.ratedCapacity',
							name: 'Rated capacity',
							type: 'number',
							unit: 'Wh',
							role: 'value.capacity',
							desc: 'reg:37758, len:2',
						},
						register: { reg: 37758, type: dataType.uint32 },
					},
					{
						state: { id: 'battery.SOC', name: 'State of capacity', type: 'number', unit: '%', role: 'value.battery', desc: 'reg:37760, len:1' },
						register: { reg: 37760, type: dataType.uint16, gain: 10 },
					},
					{
						state: { id: 'battery.runningStatus', name: 'Running status', type: 'number', role: 'value', desc: 'reg:37762, len:1' },
						register: { reg: 37762, type: dataType.uint16, length: 1 },
						//mapper: value => Promise.resolve(batteryStatus[value]),
					},
					{
						state: { id: 'battery.derived.runningStatus', name: 'Running status', type: 'string', unit: '', role: 'value' },
					},
					{
						state: { id: 'battery.busVoltage', name: 'Bus voltage', type: 'number', unit: 'V', role: 'value.voltage', desc: 'reg:37763, len:1' },
						register: { reg: 37763, type: dataType.uint16, gain: 10 },
					},
					{
						state: { id: 'battery.busCurrent', name: 'Bus current', type: 'number', unit: 'A', role: 'value.current', desc: 'reg:37764, len:1' },
						register: { reg: 37764, type: dataType.int16, gain: 10 },
					},
					{
						state: {
							id: 'battery.totalCharge',
							name: 'Total charge',
							type: 'number',
							unit: 'kWh',
							role: 'value.power.consumption',
							desc: 'reg:37780, len:2',
						},
						register: { reg: 37780, type: dataType.uint32, gain: 100 },
					},
					{
						state: {
							id: 'battery.totalDischarge',
							name: 'Total discharge',
							type: 'number',
							unit: 'kWh',
							role: 'value.power.consumption',
							desc: 'reg:37782, len:2',
						},
						register: { reg: 37782, type: dataType.uint32, gain: 100 },
					},
					{
						state: {
							id: 'battery.currentDayChargeCapacity',
							name: 'Current day charge capacity',
							type: 'number',
							unit: 'kWh',
							role: 'value.power.consumption',
							desc: 'reg:37784, len:2',
						},
						register: { reg: 37784, type: dataType.uint32, gain: 100 },
					},
					{
						state: {
							id: 'battery.currentDayDischargeCapacity',
							name: 'Current day discharge capacity',
							type: 'number',
							unit: 'kWh',
							role: 'value.power.consumption',
							desc: 'reg:37786, len:2',
						},
						register: { reg: 37786, type: dataType.uint32, gain: 100 },
					},
				],
				checkIfActive: () => this._batteryExists(),
				postHook: path => {
					const runningStatus = this.stateCache.get(`${path}battery.runningStatus`)?.value;
					this.stateCache.set(`${path}battery.derived.runningStatus`, batteryStatus[runningStatus]);
				},
			},
			{
				//for NRGKick
				address: 47000,
				length: 1,
				info: 'battery unit1 (static)',
				type: deviceType.battery,
				states: [
					{
						state: { id: 'battery.unit.1.productMode', name: 'Product mode', type: 'number', unit: '', role: 'value', desc: 'reg:47000, len:1' },
						register: { reg: 47000, type: dataType.uint16 },
					},
				],
				checkIfActive: () => this._batteryExists(1),
			},
			{
				address: 47075,
				length: 14,
				info: 'additional battery information',
				refresh: dataRefreshRate.low,
				type: deviceType.battery,
				states: [
					{
						state: {
							id: 'battery.maximumChargingPower',
							name: 'Maximum charging power',
							type: 'number',
							unit: 'W',
							role: 'value.power',
							desc: 'reg:47075, len:2',
						},
						register: { reg: 47075, type: dataType.uint32 },
					},
					{
						state: {
							id: 'battery.maximumDischargingPower',
							name: 'Maximum discharging power',
							type: 'number',
							unit: 'W',
							role: 'value.power',
							desc: 'reg:47077, len:2',
						},
						register: { reg: 47077, type: dataType.uint32 },
					},
					{
						state: {
							id: 'battery.chargingCutoffCapacity',
							name: 'Charging cutoff capacity',
							type: 'number',
							unit: '%',
							role: 'value',
							desc: 'reg:47081, len:1',
						},
						register: { reg: 47081, type: dataType.uint16, gain: 10 },
					},
					{
						state: {
							id: 'battery.dischargeCutoffCapacity',
							name: 'Discharge cutoff capacity',
							type: 'number',
							unit: '%',
							role: 'value',
							desc: 'reg:47082, len:1',
						},
						register: { reg: 47082, type: dataType.uint16, gain: 10 },
					},
					{
						state: {
							id: 'battery.forcedChargeDischargePeriod',
							name: 'Forced charge discharge period',
							type: 'number',
							unit: 'mins',
							role: 'value',
							desc: 'reg:47083, len:1',
						},
						register: { reg: 47083, type: dataType.uint16 },
					},
					{
						state: {
							id: 'battery.workingModeSettings',
							name: 'Working mode settings',
							type: 'number',
							unit: '',
							role: 'value',
							desc: 'reg:47086, len:1',
						},
						register: { reg: 47086, type: dataType.uint16 },
					},
					{
						state: {
							id: 'battery.chargeFromGridFunction',
							name: 'Charge from grid function',
							type: 'number',
							unit: '',
							role: 'value',
							desc: 'reg:47087, len:1',
						},
						register: { reg: 47087, type: dataType.uint16 },
					},
					{
						state: {
							id: 'battery.gridChargeCutoffSOC',
							name: 'Grid charge cutoff SOC',
							type: 'number',
							unit: '%',
							role: 'value',
							desc: 'reg:47088, len:1',
						},
						register: { reg: 47088, type: dataType.uint16, gain: 10 },
					},
				],
				checkIfActive: () => this._batteryExists(),
			},
			{
				address: 47101,
				length: 6,
				info: 'additional battery information',
				type: deviceType.battery,
				states: [
					{
						state: { id: 'battery.targetSOC', name: 'Target SOC', type: 'number', unit: '%', role: 'value', desc: 'reg: 47101 , len: 1' },
						register: { reg: 47101, type: dataType.uint16, gain: 10 },
					},
					{
						state: { id: 'battery.backupPowerSOC', name: 'Backup power SOC', type: 'number', unit: '%', role: 'value', desc: 'reg: 47102, len: 1' },
						register: { reg: 47102, type: dataType.uint16, gain: 10 },
					},
					{
						state: { id: 'battery.productModel', name: 'Product model', type: 'number', unit: '', role: 'value', desc: 'reg: 47106 , len: 1' },
						register: { reg: 47106, type: dataType.uint16 },
					},
				],
				checkIfActive: () => this._batteryExists(),
			},
			{
				address: 32000,
				length: 11,
				info: 'inverter status',
				refresh: dataRefreshRate.low,
				type: deviceType.inverter,
				states: [
					{
						state: { id: 'state1', name: 'State 1', type: 'number', unit: '', role: 'value', desc: 'reg:32000, len:1' },
						register: { reg: 32000, type: dataType.uint16 },
					},
					{
						state: { id: 'state2', name: 'State 2', type: 'number', unit: '', role: 'value', desc: 'reg:32001, len:1' },
						register: { reg: 32001, type: dataType.uint16 },
					},
					{
						state: { id: 'state3', name: 'State 3', type: 'number', unit: '', role: 'value', desc: 'reg:32002, len:1' },
						register: { reg: 32002, type: dataType.uint16 },
					},
					{
						state: { id: 'alarm1', name: 'Alarm 1', type: 'number', unit: '', role: 'value', desc: 'reg:32008, len:1' },
						register: { reg: 32008, type: dataType.uint16 },
					},
					{
						state: { id: 'alarm2', name: 'Alarm 2', type: 'number', unit: '', role: 'value', desc: 'reg:32009, len:1' },
						register: { reg: 32009, type: dataType.uint16 },
					},
					{
						state: { id: 'alarm3', name: 'Alarm 3', type: 'number', unit: '', role: 'value', desc: 'reg:32010, len:1' },
						register: { reg: 32010, type: dataType.uint16 },
					},
				],
			},
			{
				address: 32016,
				length: 48,
				info: 'inverter PV strings',
				refresh: dataRefreshRate.medium,
				type: deviceType.inverter,
				states: [],
				//Before 32000 read
				preHook: (path, reg) => {
					//create states for strings
					const noPVString = this.stateCache.get(`${path}info.numberPVStrings`)?.value;
					if (noPVString > 0) {
						if (!stringFieldsTemplate.generated) {
							stringFieldsTemplate.generated = 0;
						}
						if (stringFieldsTemplate.generated < noPVString) {
							for (let i = stringFieldsTemplate.generated; i < noPVString; i++) {
								//clonen
								//const statePV = Object.assign({},stringFieldsTemplate.states[0]);
								const statePV = JSON.parse(JSON.stringify(stringFieldsTemplate.states[0]));
								const stateCu = JSON.parse(JSON.stringify(stringFieldsTemplate.states[1]));
								const statePo = JSON.parse(JSON.stringify(stringFieldsTemplate.states[2]));
								statePV.state.id = `string.PV${i + 1}Voltage`;
								statePV.register.reg = (stringFieldsTemplate.states[0].register?.reg ?? 0) + i * 2;
								statePV.register.type = stringFieldsTemplate.states[0].register?.type; //types are not copied?!
								stateCu.state.id = `string.PV${i + 1}Current`;
								stateCu.register.reg = (stringFieldsTemplate.states[1].register?.reg ?? 0) + i * 2;
								stateCu.register.type = stringFieldsTemplate.states[1].register?.type;
								statePo.state.id = `string.PV${i + 1}Power`;
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
				postHook: path => {
					//set strings
					const noPVString = this.stateCache.get(`${path}info.numberPVStrings`)?.value;
					if (noPVString > 0) {
						for (let i = 1; i <= noPVString; i++) {
							const voltage = this.stateCache.get(`${path}string.PV${i}Voltage`)?.value;
							const current = this.stateCache.get(`${path}string.PV${i}Current`)?.value;
							this.stateCache.set(`${path}string.PV${i}Power`, Math.round(voltage * current), { type: 'number' });
						}
					}
				},
			},
			{
				//read also in standby mode
				address: 32089,
				length: 1,
				info: 'inverter deviceStatus',
				refresh: dataRefreshRate.low,
				standby: true,
				type: deviceType.inverter,
				states: [
					{
						state: { id: 'deviceStatus', name: 'Device status', type: 'number', unit: '', role: 'value', desc: 'reg:32089, len:1' },
						register: { reg: 32089, type: dataType.uint16 },
						/*
						mapper: async value => {
							if (this._testMode) {
								this.log.info(`testMode: Die Sonne scheint? ${isSunshine(this.adapter)}`);
								if (!isSunshine(this.adapter)) {
									return 2;
								}
								//return 2;
							}
							return value;
						},
						*/
					},
					{
						state: { id: 'derived.deviceStatus', name: 'Device status information', type: 'string', unit: '', role: 'value' },
					},
				],
				readErrorHook: (err, reg) => {
					//(err,reg)
					if (err.modbusCode === undefined) {
						reg.lastread = this._newNowTime();
						//return true; //Error has been self handled
					}
				},
				postHook: path => {
					//DeviceStatus
					const deviceStatus = this.stateCache.get(`${path}deviceStatus`)?.value;
					this.stateCache.set(`${path}derived.deviceStatus`, getDeviceStatusInfo(deviceStatus));
				},
			},
			{
				address: 32066,
				length: 50,
				info: 'inverter status',
				refresh: dataRefreshRate.low,
				type: deviceType.inverter,
				states: [
					{
						state: { id: 'grid.voltageL1-L2', name: 'Voltage L1-L2', type: 'number', unit: 'V', role: 'value.voltage', desc: 'reg:32066, len:1' },
						register: { reg: 32066, type: dataType.uint16, gain: 10 },
					},
					{
						state: { id: 'grid.voltageL2-L3', name: 'Voltage L2-L3', type: 'number', unit: 'V', role: 'value.voltage', desc: 'reg:32067, len:1' },
						register: { reg: 32067, type: dataType.uint16, gain: 10 },
					},
					{
						state: { id: 'grid.voltageL3-L1', name: 'Voltage L3-L1', type: 'number', unit: 'V', role: 'value.voltage', desc: 'reg:32068, len:1' },
						register: { reg: 32068, type: dataType.uint16, gain: 10 },
					},
					{
						state: { id: 'grid.voltageL1', name: 'Voltage L1', type: 'number', unit: 'V', role: 'value.voltage', desc: 'reg:32068, len:1' },
						register: { reg: 32069, type: dataType.uint16, gain: 10 },
					},
					{
						state: { id: 'grid.voltageL2', name: 'Voltage L2', type: 'number', unit: 'V', role: 'value.voltage', desc: 'reg:32070, len:1' },
						register: { reg: 32070, type: dataType.uint16, gain: 10 },
					},
					{
						state: { id: 'grid.voltageL3', name: 'Voltage L3', type: 'number', unit: 'V', role: 'value.voltage', desc: 'reg:32071, len:1' },
						register: { reg: 32071, type: dataType.uint16, gain: 10 },
					},
					{
						state: { id: 'grid.currentL1', name: 'Current L1', type: 'number', unit: 'A', role: 'value.current', desc: 'reg:32072, len:2' },
						register: { reg: 32072, type: dataType.int32, gain: 1000 },
					},
					{
						state: { id: 'grid.currentL2', name: 'Current L2', type: 'number', unit: 'A', role: 'value.current', desc: 'reg:32074, len:2' },
						register: { reg: 32074, type: dataType.int32, gain: 1000 },
					},
					{
						state: { id: 'grid.currentL3', name: 'Current L3', type: 'number', unit: 'A', role: 'value.current', desc: 'reg:32076, len:2' },
						register: { reg: 32076, type: dataType.int32, gain: 1000 },
					},
					{
						state: {
							id: 'peakActivePowerCurrentDay',
							name: 'Peak active power of current day',
							type: 'number',
							unit: 'kW',
							role: 'value.power.max',
							desc: 'reg:32078, len:2',
						},
						register: { reg: 32078, type: dataType.int32, gain: 1000 },
					},
					{
						state: {
							id: 'reactivePower',
							name: 'Reactive power',
							type: 'number',
							unit: 'kVar',
							role: 'value.power.reactive',
							desc: 'reg:32082, len:2',
						},
						register: { reg: 32082, type: dataType.int32, gain: 1000 },
					},
					{
						state: { id: 'powerFactor', name: 'Power factor', type: 'number', unit: '', role: 'value', desc: 'reg:32084, len:1' },
						register: { reg: 32084, type: dataType.int16, gain: 1000 },
					},
					{
						state: { id: 'grid.frequency', name: 'Grid frequency', type: 'number', unit: 'Hz', role: 'value.frequency', desc: 'reg:32085, len:1' },
						register: { reg: 32085, type: dataType.uint16, gain: 100 },
						mapper: value => Promise.resolve(this._checkValidNumber(value, 0, 100)),
					},
					{
						state: { id: 'efficiency', name: 'Efficiency', type: 'number', unit: '%', role: 'value', desc: 'reg:32086, len:1' },
						register: { reg: 32086, type: dataType.uint16, gain: 100 },
						mapper: value => Promise.resolve(this._checkValidNumber(value, 0, 100)),
					},
					{
						state: {
							id: 'internalTemperature',
							name: 'Internal temperature',
							type: 'number',
							unit: '°C',
							role: 'value.temperature',
							desc: 'reg:32087, len:1',
						},
						register: { reg: 32087, type: dataType.int16, gain: 10 },
						mapper: value => Promise.resolve(this._checkValidNumber(value, -100, 100)),
					},
					{
						state: {
							id: 'isulationResistance',
							name: 'Isulation resistance',
							type: 'number',
							unit: 'MOhm',
							role: 'value',
							desc: 'reg:32088, len:1',
						},
						register: { reg: 32088, type: dataType.uint16, gain: 1000 },
					},
					{
						state: { id: 'faultCode', name: 'Fault code', type: 'number', unit: '', role: 'value', desc: 'reg:32090, len:1' },
						register: { reg: 32090, type: dataType.uint16 },
					},
					{
						state: { id: 'startupTime', name: 'Startup time', type: 'number', unit: '', role: 'value', desc: 'reg:32091, len:2' },
						register: { reg: 32091, type: dataType.uint32 },
					},
					{
						state: { id: 'shutdownTime', name: 'Shutdown time', type: 'number', unit: '', role: 'value', desc: 'reg:32093, len:2' },
						register: { reg: 32093, type: dataType.uint32 },
					},
					{
						state: {
							id: 'accumulatedEnergyYield',
							name: 'Accumulated energy yield',
							type: 'number',
							unit: 'kWh',
							role: 'value.power.produced',
							desc: 'reg:32106, len:2',
						},
						register: { reg: 32106, type: dataType.uint32, gain: 100 },
					},
					{
						state: {
							id: 'dailyEnergyYield',
							name: 'Daily energy yield',
							type: 'number',
							unit: 'kWh',
							role: 'value.power.produced',
							desc: 'reg:32114, len:2',
						},
						register: { reg: 32114, type: dataType.uint32, gain: 100 },
					},
					{
						state: { id: 'derived.shutdownTime', name: 'shutdown time', type: 'number', unit: '', role: 'value.time', desc: 'fixed time' },
					},
					{
						state: { id: 'derived.startupTime', name: 'startup time', type: 'number', unit: '', role: 'value.time', desc: 'fixed time' },
					},
				],
				postHook: path => {
					/**
					 * Adjusts a given time value by converting it from seconds to milliseconds
					 * and applying the local timezone offset.
					 *
					 * @param {number} value - The time value in seconds to be adjusted. If the
					 *   value is greater than zero, it is converted to milliseconds and adjusted
					 *   for the local timezone.
					 * @returns {number} - The adjusted time value in milliseconds.
					 */
					function fixTime(value) {
						if (value > 0) {
							value = value * 1000;
							const offset = new Date(value).getTimezoneOffset();
							value += offset * 60000;
						}
						return value;
					}
					const shutdown = this.stateCache.get(`${path}shutdownTime`)?.value;
					this.stateCache.set(`${path}derived.shutdownTime`, fixTime(shutdown), { type: 'number' });
					const startup = this.stateCache.get(`${path}startupTime`)?.value;
					this.stateCache.set(`${path}derived.startupTime`, fixTime(startup), { type: 'number' });
				},
			},
			{
				address: 40125,
				length: 3,
				info: 'grid power scheduling',
				refresh: dataRefreshRate.low,
				type: deviceType.inverter,
				states: [
					{
						state: {
							id: 'grid.scheduling.activePowerPercentageDerating',
							name: '[power grid scheduling] Fixed active power derated',
							type: 'number',
							unit: '%',
							role: 'value',
							desc: 'reg:40125, len:1',
						},
						register: { reg: 40125, type: dataType.uint16, gain: 10 },
					},
					{
						state: {
							id: 'grid.scheduling.FixedActivePowerDerated',
							name: '[power grid scheduling] Fixed active power derated',
							type: 'number',
							unit: 'W',
							role: 'value.power',
							desc: 'reg:40126, len:2',
						},
						register: { reg: 40126, type: dataType.uint32 },
					},
				],
			},
			{
				address: 37100,
				length: 38,
				info: 'meter info',
				refresh: dataRefreshRate.high,
				type: deviceType.meter,
				states: [
					{
						state: {
							id: 'meter.status',
							name: 'Meter status',
							type: 'number',
							unit: '',
							role: 'value',
							desc: 'reg:37100, len:2 (0: offline 1: normal)',
						},
						register: { reg: 37100, type: dataType.uint16 },
					},
					{
						state: { id: 'meter.voltageL1', name: 'Phase 1 voltage', type: 'number', unit: 'V', role: 'value.voltage', desc: 'reg:37101, len:2' },
						register: { reg: 37101, type: dataType.int32, gain: 10 },
					},
					{
						state: { id: 'meter.voltageL2', name: 'Phase 2 voltage', type: 'number', unit: 'V', role: 'value.voltage', desc: 'reg:37103, len:2' },
						register: { reg: 37103, type: dataType.int32, gain: 10 },
					},
					{
						state: { id: 'meter.voltageL3', name: 'Phase 3 voltage', type: 'number', unit: 'V', role: 'value.voltage', desc: 'reg:37105, len:2' },
						register: { reg: 37105, type: dataType.int32, gain: 10 },
					},
					{
						state: { id: 'meter.currentL1', name: 'Phase 1 current', type: 'number', unit: 'A', role: 'value.current', desc: 'reg:37107, len:2' },
						register: { reg: 37107, type: dataType.int32, gain: 100 },
					},
					{
						state: { id: 'meter.currentL2', name: 'Phase 2 current', type: 'number', unit: 'A', role: 'value.current', desc: 'reg:37109, len:2' },
						register: { reg: 37109, type: dataType.int32, gain: 100 },
					},
					{
						state: { id: 'meter.currentL3', name: 'Phase 3 current', type: 'number', unit: 'A', role: 'value.current', desc: 'reg:37111, len:2' },
						register: { reg: 37111, type: dataType.int32, gain: 100 },
					},
					{
						state: {
							id: 'meter.activePower',
							name: 'Active power',
							type: 'number',
							unit: 'kW',
							role: 'value.power.active',
							desc: 'reg:37113, len:2 (>0: feed-in to grid. <0: supply from grid.)',
						},
						register: { reg: 37113, type: dataType.int32, gain: 1000 },
					},
					{
						state: {
							id: 'meter.derived.signConventionForPowerFeed-in',
							name: 'Sign convention for power feed-in',
							type: 'number',
							unit: '',
							role: 'value',
							desc: '1 : positive value indicates that energy is being supplied to the grid, -1 : positive value indicates that energy is being consumed from the grid',
						},
					},
					{
						state: {
							id: 'meter.derived.feed-inPower',
							name: 'feed-in power',
							type: 'number',
							unit: 'kW',
							role: 'value.power.active',
							desc: 'Power to grid',
						},
					},
					{
						state: {
							id: 'meter.reactivePower',
							name: 'Reactive power',
							type: 'number',
							unit: 'VAr',
							role: 'value.power.reactive',
							desc: 'reg:37115, len:2',
						},
						register: { reg: 37115, type: dataType.int32 },
					},
					{
						state: { id: 'meter.powerFactor', name: 'Power factor', type: 'number', unit: '', role: 'value', desc: 'reg:37117, len:1' },
						register: { reg: 37117, type: dataType.int16, gain: 1000 },
					},
					{
						state: {
							id: 'meter.gridFrequency',
							name: 'Grid frequency',
							type: 'number',
							unit: 'Hz',
							role: 'value.frequency',
							desc: 'reg:37118, len:1',
						},
						register: { reg: 37118, type: dataType.int16, gain: 100 },
						mapper: value => Promise.resolve(this._checkValidNumber(value, 0, 100)),
					},
					{
						state: {
							id: 'meter.positiveActiveEnergy',
							name: 'Positive active energy',
							type: 'number',
							unit: 'kWh',
							role: 'value.power.consumption',
							desc: 'reg:37119, len:2',
						},
						register: { reg: 37119, type: dataType.int32, gain: 100 },
					},
					{
						state: {
							id: 'meter.reverseActiveEnergy',
							name: 'Reverse active energy',
							type: 'number',
							unit: 'kWh',
							role: 'value.power.consumption',
							desc: 'reg:37121, len:2',
						},
						register: { reg: 37121, type: dataType.int32, gain: 100 },
					},
					{
						state: {
							id: 'meter.accumulatedReactivePower',
							name: 'Accumulated reactive power',
							type: 'number',
							unit: 'kVarh',
							role: 'value.power.reactive.consumption',
							desc: 'reg:37123, len:2',
						},
						register: { reg: 37123, type: dataType.int32, gain: 100 },
					},
					{
						state: { id: 'meter.voltageL1-L2', name: 'Voltage L1-L2', type: 'number', unit: 'V', role: 'value.voltage', desc: 'reg:37126, len:2' },
						register: { reg: 37126, type: dataType.int32, gain: 10 },
					},
					{
						state: { id: 'meter.voltageL2-L3', name: 'Voltage L2-L3', type: 'number', unit: 'V', role: 'value.voltage', desc: 'reg:37128, len:2' },
						register: { reg: 37128, type: dataType.int32, gain: 10 },
					},
					{
						state: { id: 'meter.voltageL3-L1', name: 'Voltage L3-L1', type: 'number', unit: 'V', role: 'value.voltage', desc: 'reg:37130, len:2' },
						register: { reg: 37130, type: dataType.int32, gain: 10 },
					},
					{
						state: {
							id: 'meter.activePowerL1',
							name: 'Active power L1',
							type: 'number',
							unit: 'W',
							role: 'value.current',
							desc: 'reg:37132, len:2',
						},
						register: { reg: 37132, type: dataType.int32 },
					},
					{
						state: {
							id: 'meter.activePowerL2',
							name: 'Active power L2',
							type: 'number',
							unit: 'W',
							role: 'value.current',
							desc: 'reg:37134, len:2',
						},
						register: { reg: 37134, type: dataType.int32 },
					},
					{
						state: {
							id: 'meter.activePowerL3',
							name: 'Active power L3',
							type: 'number',
							unit: 'W',
							role: 'value.current',
							desc: 'reg:37136, len:2',
						},
						register: { reg: 37136, type: dataType.int32 },
					},
				],
				postHook: () => {
					this.stateCache.set(`meter.derived.signConventionForPowerFeed-in`, 1, { type: 'number' });
					const activePower = this.stateCache.get('meter.activePower')?.value ?? 0;
					this.stateCache.set('meter.derived.feed-inPower', activePower, { type: 'number' });
				},
			},
			{
				//https://photomate.zendesk.com/hc/en-gb/articles/5701625507485-Export-limitation-for-SUN2000-inverters-via-FusionSolar-App
				address: 47415,
				length: 4,
				info: 'grid feed export',
				refresh: dataRefreshRate.low,
				type: deviceType.gridPowerControl,
				states: [
					{
						state: {
							id: 'grid.activePowerControlMode',
							name: 'Active power control mode',
							type: 'number',
							unit: '',
							role: 'value',
							desc: 'reg:47415, len:1',
						},
						register: { reg: 47415, type: dataType.uint16 },
					},
					{
						state: {
							id: 'grid.maximumFeedGridPower',
							name: 'Maximum feed grid power',
							type: 'number',
							unit: 'kW',
							role: 'value.power',
							desc: 'reg: 47416, len: 2',
						},
						register: { reg: 47416, type: dataType.uint32, gain: 1000 },
					},
					{
						state: {
							id: 'grid.maximumFeedGridPower_percent',
							name: 'Maximum feed grid power %',
							type: 'number',
							unit: '%',
							role: 'value',
							desc: 'reg: 47418, len: 1',
						},
						register: { reg: 47418, type: dataType.int16, gain: 10 },
					},
				],
			},
		];
		this.registerFields.push.apply(this.registerFields, newFields);

		//Template for StringsRegister
		const stringFieldsTemplate = {
			states: [
				{
					state: {
						id: 'string.PV1Voltage',
						name: 'String voltage',
						type: 'number',
						unit: 'V',
						role: 'value.voltage',
						desc: 'reg:32016+2(n-1), len:1',
					},
					register: { reg: 32016, type: dataType.int16, length: 1, gain: 10 },
				},
				{
					state: {
						id: 'string.PV1Current',
						name: 'String current',
						type: 'number',
						unit: 'A',
						role: 'value.current',
						desc: 'reg:32017+2(n-1), len:1',
					},
					register: { reg: 32017, type: dataType.int16, length: 1, gain: 100 },
				},
				{
					state: { id: 'string.PV1Power', name: 'String power', type: 'number', unit: 'W', role: 'value.power' },
				},
			],
		};

		const newHooks = [
			{
				//activePower adjust
				refresh: dataRefreshRate.high,
				fn: path => {
					const chargePower = this.stateCache.get(`${path}battery.chargeDischargePower`)?.value ?? 0;
					const inputPower = this.stateCache.get(`${path}inputPower`)?.value ?? 0;
					const activePower = this.stateCache.get(`${path}activePower`)?.value ?? 0;
					if (Math.abs(activePower - inputPower + chargePower) > 0) {
						this.log.debug(`activePower ${activePower} !== inputPower ${inputPower}-chargePower ${chargePower}`);
						this.stateCache.set(`${path}activePower`, inputPower - chargePower, { type: 'number' });
						/*
						if (chargePower === 0) {
							this.stateCache.set(`${path}activePower`, inputPower - chargePower, { type: 'number' });
						} else {
							this.stateCache.set(`${path}battery.chargeDischargePower`, inputPower - activePower, { type: 'number' });
						}
						*/
					}
				},
			},
			{
				refresh: dataRefreshRate.low,
				state: {
					id: 'derived.dailyInputYield',
					name: 'Portal yield today',
					type: 'number',
					unit: 'kWh',
					role: 'value.power.consumption',
					desc: 'Try to recreate the yield from the portal',
				},
				fn: path => {
					const disCharge = this.stateCache.get(`${path}battery.currentDayDischargeCapacity`)?.value;
					const charge = this.stateCache.get(`${path}battery.currentDayChargeCapacity`)?.value;
					let inputYield = this.stateCache.get(`${path}dailyEnergyYield`)?.value * 0.97 + charge - disCharge;

					if (inputYield < 0 || isNaN(inputYield)) {
						inputYield = 0;
					}
					this.stateCache.set(`${path}derived.dailyInputYield`, inputYield, { type: 'number' });
				},
			},
			{
				refresh: dataRefreshRate.low,
				state: {
					id: 'derived.dailySolarYield',
					name: 'Solar yield today',
					type: 'number',
					unit: 'kWh',
					role: 'value.power.consumption',
					desc: 'Riemann sum of input power with efficiency loss',
				},
				fn: path => {
					this.stateCache.set(`${path}derived.dailySolarYield`, this.solarSum.sum, { type: 'number' });
				},
			},
		];
		this.postUpdateHooks.push.apply(this.postUpdateHooks, newHooks);
	}

	//Incorrect values come back in standby mode of any states
	_checkValidNumber(value, from = 0, until = 100, substWith = 0) {
		if (typeof value == 'number') {
			if (value >= from && value <= until) {
				return value;
			}
			this.log.debug(`_checkValidNumber ${value} from: ${from} until: ${until}`);
			return substWith;
		}
		value = 0; //Test
		return value;
	}

	//V0.12
	_batteryExists(unit = 0, pack = 0) {
		if (unit === 0) {
			return this.numberBatteryUnits() > 0;
		}
		if (pack === 0) {
			const state = this.stateCache.get(`${this.deviceInfo.path}.battery.unit.${unit}.SN`);
			return this.adapter.settings.ds.batteryUnits && state && state.value;
			//return (state && 'test');
		}
		const state = this.stateCache.get(`${this.deviceInfo.path}.battery.unit.${unit}.batteryPack.${pack}.SN`);
		return this.adapter.settings.ds.batteryPacks && state && state.value;
	}

	/**
	 * #overload#
	 * Get the number of battery units.
	 *
	 * @returns The number of battery units
	 */
	numberBatteryUnits() {
		let units = 0;
		//Check if the first battery unit exists
		const state1 = this.stateCache.get(`${this.deviceInfo.path}.battery.unit.1.SN`);
		if (state1 && state1.value) {
			units = 1;
		}
		const state2 = this.stateCache.get(`${this.deviceInfo.path}.battery.unit.2.SN`);
		if (state2 && state2.value) {
			units += 1;
		}
		return units;
	}

	//overload
	get modbusAllowed() {
		//if the modbus-device offline we cannot read or write anythink!
		let modbusAllowed = true;
		if (this.deviceInfo.index > 0) {
			//I am a slave inverter
			if (this.adapter.devices[0].driverClass === driverClasses.inverter && this.adapter.devices[0].instance) {
				modbusAllowed = this.adapter.devices[0].instance.modbusAllowed; //first ask the master
			}
		}
		if (modbusAllowed) {
			//430 = SUN2000-8KTL-M2
			if (this.deviceStatus === 0x0002) {
				if (this.deviceInfo.index > 0 && this._modelId < 430) modbusAllowed = false;
			} //standby
			if (this.deviceStatus >= 0x0300 && this.deviceStatus <= 0x0307) {
				modbusAllowed = false;
			} //shutdown
			if (this._errorCount > 3) {
				modbusAllowed = false;
			}
		}

		if (!modbusAllowed && !this.log.quiet) {
			this.log.info(`The inverter with modbus ID ${this._modbusId} is no longer accessible. That is why the logs are minimized.`);
			this.log.beQuiet(true);
		}
		if (modbusAllowed && this.log.quiet) {
			this.log.beQuiet(false);
			this.log.info(`The inverter with modbus ID ${this._modbusId} is accessible again.`);
			//this._errorCount = 0;
		}
		this._modbusAllowed = modbusAllowed;
		return this._modbusAllowed;
	}

	//overload
	get deviceStatus() {
		const status = this.stateCache.get(`${this._getStatePath()}deviceStatus`)?.value;
		if (status) {
			if (status !== this._deviceStatus && this._deviceStatus >= 0) {
				this.log.info(
					`The Inverter with modbus ID ${this._modbusId} switches to ${this.stateCache.get(`${this.deviceInfo.path}.derived.deviceStatus`)?.value} mode.`,
				);
			}
			this._deviceStatus = status;
		}
		return this._deviceStatus;
	}

	async mitnightProcess() {
		this.solarSum.reset();
	}
}

class InverterSun2000_M1 extends InverterSun2000 {
	constructor(stateInstance, inverter, options) {
		super(stateInstance, inverter, {
			name: 'sun2000 Serie M1',
			...options,
		});

		//https://github.com/ioBroker/ioBroker.docs/blob/master/docs/en/dev/stateroles.md
		const newFields = [
			{
				address: 37200,
				length: 3,
				info: 'optimizer info (static info)',
				type: deviceType.inverter,
				states: [
					{
						state: {
							id: 'optimizer.optimizerTotalNumber',
							name: 'Optimizer total number',
							type: 'number',
							unit: '',
							role: 'value',
							desc: 'reg:37200, len:1',
						},
						register: { reg: 37200, type: dataType.int16 },
					},
					{
						state: {
							id: 'optimizer.optimizerOnlineNumber',
							name: 'Optimizer online number',
							type: 'number',
							unit: '',
							role: 'value',
							desc: 'reg:37201, len:1',
						},
						register: { reg: 37201, type: dataType.int16 },
					},
					{
						state: {
							id: 'optimizer.optimizerFeatureData',
							name: 'Optimizer feature data',
							type: 'number',
							unit: '',
							role: 'value',
							desc: 'reg:37202, len:1',
						},
						register: { reg: 37202, type: dataType.int16 },
					},
				],
			},
			{
				address: 37700,
				length: 10,
				info: 'battery unit2 (indicator)',
				states: [
					{
						state: { id: 'battery.unit.2.SN', name: 'Serial number', type: 'string', unit: '', role: 'value', desc: 'reg:37700, len:10' },
						register: { reg: 37700, type: dataType.string, length: 10 },
						store: storeType.never,
					},
				],
				readErrorHook: (err, reg) => {
					//modbus Error 2 - illegal address
					if (err.modbusCode === 2) {
						reg.lastread = this._newNowTime(); //try it once
						this.stateCache.set(`${this._getStatePath(reg.type)}battery.unit.2.SN`, '', { stored: true });
						return true; //self handle
					}
				},
			},
			{
				address: 38326,
				length: 10,
				info: 'battery unit2 Pack1 (indicator)',
				states: [
					{
						state: { id: 'battery.unit.2.batteryPack.1.SN', name: 'Serial number', type: 'string', unit: '', role: 'value' },
						register: { reg: 38326, type: dataType.string, length: 6 },
						store: storeType.never,
					},
				],
				readErrorHook: (err, reg) => {
					//modbus Error 2 - illegal address
					if (err.modbusCode === 2) {
						reg.lastread = this._newNowTime(); //try it once
						this.stateCache.set(`${this._getStatePath(reg.type)}battery.unit.2.batteryPack.1.SN`, '', { stored: true });
						return true; //error self handle
					}
				},
			},
			{
				address: 38368,
				length: 10,
				info: 'battery unit2 Pack2 (indicator)',
				states: [
					{
						state: { id: 'battery.unit.2.batteryPack.2.SN', name: 'Serial number', type: 'string', unit: '', role: 'value' },
						register: { reg: 38368, type: dataType.string, length: 6 },
						store: storeType.never,
					},
				],
				readErrorHook: (err, reg) => {
					//modbus Error 2 - illegal address
					if (err.modbusCode === 2) {
						reg.lastread = this._newNowTime(); //try it once
						this.stateCache.set(`${this._getStatePath(reg.type)}battery.unit.2.batteryPack.2.SN`, '', { stored: true });
						return true; //error self handle
					}
				},
			},
			{
				address: 38410,
				length: 10,
				info: 'battery unit2 Pack3 (indicator)',
				states: [
					{
						state: { id: 'battery.unit.2.batteryPack.3.SN', name: 'Serial number', type: 'string', unit: '', role: 'value' },
						register: { reg: 38410, type: dataType.string, length: 6 },
						store: storeType.never,
					},
				],
				readErrorHook: (err, reg) => {
					//modbus Error 2 - illegal address
					if (err.modbusCode === 2) {
						reg.lastread = this._newNowTime(); //try it once
						this.stateCache.set(`${this._getStatePath(reg.type)}battery.unit.2.batteryPack.3.SN`, '', { stored: true });
						return true; //error self handle
					}
				},
			},
			{
				address: 37738,
				length: 15,
				info: 'battery unit2 information',
				refresh: dataRefreshRate.low,
				type: deviceType.battery,
				states: [
					{
						state: {
							id: 'battery.unit.2.batterySOC',
							name: 'Battery SOC',
							type: 'number',
							unit: '%',
							role: 'value.battery',
							desc: 'reg:37738, len:1',
						},
						register: { reg: 37738, type: dataType.uint16, gain: 10 },
					},
					{
						state: {
							id: 'battery.unit.2.runningStatus',
							name: 'Running status',
							type: 'number',
							unit: '',
							role: 'value',
							desc: 'reg:37741, len:1',
						},
						register: { reg: 37741, type: dataType.uint16 },
						//mapper: value => Promise.resolve(batteryStatus[value]),
					},
					{
						state: {
							id: 'battery.unit.2.batteryTemperature',
							name: 'Battery temperature',
							type: 'number',
							unit: '°C',
							role: 'value.temperature',
							desc: 'reg:37752, len:1',
						},
						register: { reg: 37752, type: dataType.uint16, gain: 10 },
						mapper: value => Promise.resolve(this._checkValidNumber(value, -100, 100)),
					},
				],
				checkIfActive: () => this._batteryExists(2),
			},
			{
				//for NRGKick
				address: 47089,
				length: 1,
				info: 'battery unit2 (static)',
				type: deviceType.battery,
				states: [
					{
						state: { id: 'battery.unit.2.productMode', name: 'Product mode', type: 'number', unit: '', role: 'value', desc: 'reg:37089, len:1' },
						register: { reg: 47089, type: dataType.uint16 },
					},
				],
				checkIfActive: () => this._batteryExists(2),
			},
			//--V0.12
			{
				address: 38355,
				length: 13,
				info: 'battery Pack1 information',
				refresh: dataRefreshRate.low,
				type: deviceType.battery,
				states: [
					{
						state: {
							id: 'battery.unit.2.batteryPack.1.SOC',
							name: 'State of capacity',
							type: 'number',
							unit: '%',
							role: 'value.battery',
							desc: 'reg:38355, len:1',
						},
						register: { reg: 38355, type: dataType.uint16, gain: 10 },
					},
					{
						state: {
							id: 'battery.unit.2.batteryPack.1.totalCharge',
							name: 'Total charge',
							type: 'number',
							unit: 'kWh',
							role: 'value.power.consumption',
							desc: 'reg:38364, len:2',
						},
						register: { reg: 38364, type: dataType.uint32, gain: 100 },
					},
					{
						state: {
							id: 'battery.unit.2.batteryPack.1.totalDischarge',
							name: 'Total discharge',
							type: 'number',
							unit: 'kWh',
							role: 'value.power.consumption',
							desc: 'reg:38366, len:2',
						},
						register: { reg: 38366, type: dataType.uint32, gain: 100 },
					},
				],
				checkIfActive: () => this._batteryExists(2, 1),
			},
			{
				address: 38397,
				length: 13,
				info: 'battery Pack2 information',
				refresh: dataRefreshRate.low,
				type: deviceType.battery,
				states: [
					{
						state: {
							id: 'battery.unit.2.batteryPack.2.SOC',
							name: 'State of capacity',
							type: 'number',
							unit: '%',
							role: 'value.battery',
							desc: 'reg:38397, len:1',
						},
						register: { reg: 38397, type: dataType.uint16, gain: 10 },
					},
					{
						state: {
							id: 'battery.unit.2.batteryPack.2.totalCharge',
							name: 'Total charge',
							type: 'number',
							unit: 'kWh',
							role: 'value.power.consumption',
							desc: 'reg:38406, len:2',
						},
						register: { reg: 38406, type: dataType.uint32, gain: 100 },
					},
					{
						state: {
							id: 'battery.unit.2.batteryPack.2.totalDischarge',
							name: 'Total discharge',
							type: 'number',
							unit: 'kWh',
							role: 'value.power.consumption',
							desc: 'reg:38408, len:2',
						},
						register: { reg: 38408, type: dataType.uint32, gain: 100 },
					},
				],
				checkIfActive: () => this._batteryExists(2, 2),
			},
			{
				address: 38439,
				length: 13,
				info: 'battery Pack3 information',
				refresh: dataRefreshRate.low,
				type: deviceType.battery,
				states: [
					{
						state: {
							id: 'battery.unit.2.batteryPack.3.SOC',
							name: 'State of capacity',
							type: 'number',
							unit: '%',
							role: 'value.battery',
							desc: 'reg:38439, len:1',
						},
						register: { reg: 38439, type: dataType.uint16, gain: 10 },
					},
					{
						state: {
							id: 'battery.unit.2.batteryPack.3.totalCharge',
							name: 'Total charge',
							type: 'number',
							unit: 'kWh',
							role: 'value.power.consumption',
							desc: 'reg:38448, len:2',
						},
						register: { reg: 38448, type: dataType.uint32, gain: 100 },
					},
					{
						state: {
							id: 'battery.unit.2.batteryPack.3.totalDischarge',
							name: 'Total discharge',
							type: 'number',
							unit: 'kWh',
							role: 'value.power.consumption',
							desc: 'reg:38450, len:2',
						},
						register: { reg: 38450, type: dataType.uint32, gain: 100 },
					},
				],
				checkIfActive: () => this._batteryExists(2, 3),
			},
			{
				address: 38359,
				length: 3,
				info: 'Battery Pack1 Charge And Discharge Power',
				refresh: dataRefreshRate.high,
				type: deviceType.battery,
				states: [
					{
						state: {
							id: 'battery.unit.2.batteryPack.1.chargeDischargePower',
							name: 'Charge/discharge power',
							desc: 'reg:38359, len:2 (>0 charging, <0 discharging)',
							type: 'number',
							unit: 'kW',
							role: 'value.power',
						},
						register: { reg: 38359, type: dataType.int32, gain: 1000 },
					},
					{
						state: {
							id: 'battery.unit.2.batteryPack.1.voltage',
							name: 'Voltage',
							type: 'number',
							unit: 'V',
							role: 'value.voltage',
							desc: 'reg:38361, len:1',
						},
						register: { reg: 38361, type: dataType.uint16, gain: 10 },
					},
				],
				checkIfActive: () => this._batteryExists(2, 1),
			},
			{
				address: 38401,
				length: 3,
				info: 'Battery Pack2 Charge And Discharge Power',
				refresh: dataRefreshRate.high,
				type: deviceType.battery,
				states: [
					{
						state: {
							id: 'battery.unit.2.batteryPack.2.chargeDischargePower',
							name: 'Charge/discharge power',
							desc: 'reg:38401, len:2 (>0 charging, <0 discharging)',
							type: 'number',
							unit: 'kW',
							role: 'value.power',
						},
						register: { reg: 38401, type: dataType.int32, gain: 1000 },
					},
					{
						state: {
							id: 'battery.unit.2.batteryPack.2.voltage',
							name: 'Voltage',
							type: 'number',
							unit: 'V',
							role: 'value.voltage',
							desc: 'reg:38403, len:1',
						},
						register: { reg: 38403, type: dataType.uint16, gain: 10 },
					},
				],
				checkIfActive: () => this._batteryExists(2, 2),
			},
			{
				address: 38443,
				length: 3,
				info: 'Battery Pack3 Charge And Discharge Power',
				refresh: dataRefreshRate.high,
				type: deviceType.battery,
				states: [
					{
						state: {
							id: 'battery.unit.2.batteryPack.3.chargeDischargePower',
							name: 'Charge/discharge power',
							desc: 'reg:38443, len:2 (>0 charging, <0 discharging)',
							type: 'number',
							unit: 'kW',
							role: 'value.power',
						},
						register: { reg: 38443, type: dataType.int32, gain: 1000 },
					},
					{
						state: {
							id: 'battery.unit.2.batteryPack.3.voltage',
							name: 'Voltage',
							type: 'number',
							unit: 'V',
							role: 'value.voltage',
							desc: 'reg:38445, len:1',
						},
						register: { reg: 38445, type: dataType.uint16, gain: 10 },
					},
				],
				checkIfActive: () => this._batteryExists(2, 3),
			},
			//++
		];
		this.registerFields.push.apply(this.registerFields, newFields);
	}
}

module.exports = {
	InverterInfo,
	InverterSun2000,
	InverterSun2000_M1,
};
