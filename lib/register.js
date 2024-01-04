
const {deviceType,batteryStatus,dataRefreshRate,dataType} = require(__dirname + '/types.js');

class StateMap  {
	constructor () {
		this.stateMap = new Map();
	}

	get(id) {
		return this.stateMap.get(id);
	}

	set(id, value, options) {
		if (options?.type == 'number' && isNaN(value)) return;
		if (value !== null) {
			if (options?.renew || this.get(id)?.value !== value) {
				if (options?.stored ) {
					this.stateMap.set(id, {id: id, value: value, stored: options.stored});
				} else {
					this.stateMap.set(id, {id: id, value: value});
				}
			}
		}
	}

	values () {
		return this.stateMap.values();
	}

}


class Registers {
	constructor(adapterInstance) {
		this.adapter = adapterInstance;
		this.stateCache = new StateMap();

		this._loadStates();

		//https://www.iobroker.net/#de/documentation/basics/roles.md
		this.registerFields = [
			{
				address : 37765,
				length : 2,
				info : 'Battery Charge And Discharge Power',
				refresh : dataRefreshRate.high,
				type : deviceType.battery,
				states : [{
					state: {id: 'battery.chargeDischargePower', name: 'Charge/Discharge power', desc: '(>0 charging, <0 discharging)', type: 'number', unit: 'kW', role: 'value.power'},
					register: {reg: 37765, type: dataType.int32, gain:1000}
				}]
			},
			{
				address : 32080,
				length : 2,
				info : 'Inverter Activ Power',
				refresh : dataRefreshRate.high,
				type : deviceType.inverter,
				states : [{
					state: {id: 'activePower', name: 'Active power', type: 'number', unit: 'kW', role: 'value.power', desc: 'Power currently used'},
					register: {reg: 32080, type: dataType.int32, gain:1000},
					storeAlways: false
				}]
			},
			{
				address : 32064,
				length : 2,
				info : 'Input Power',
				refresh : dataRefreshRate.high,
				type : deviceType.inverter,
				states : [{
					state: {id: 'inputPower', name: 'Input power' , type: 'number', unit: 'kW', role: 'value.power', desc: 'Power from solar'},
					register: {reg: 32064, type: dataType.int32, gain:1000},
					storeAlways: false
				},
				{
					state: {id: 'derived.inputPowerWithEfficiencyLoss', name: 'input power with efficiency loss', type: 'number', unit: 'kW', role: 'value.power', desc: ''}
				}
				],
				postHook: (path) => {
					//https://community.home-assistant.io/t/integration-solar-inverter-huawei-2000l/132350/1483?u=wlcrs
					const inPower = this.stateCache.get(path+'inputPower')?.value;
					//https://wiki.selfhtml.org/wiki/JavaScript/Operatoren/Optional_Chaining_Operator
					//const ratedPower = state ? state.val : undefined;
					const ratedPower = this.stateCache.get(path+'info.ratedPower')?.value;
					//this.adapter.log.debug('##### ratedPower '+inPower+' '+ratedPower);
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
					//inputPower_with_efficiency_loss
					this.stateCache.set(path+'derived.inputPowerWithEfficiencyLoss', inPowerEff,  {type: 'number'});
				}
			},
			{
				address : 37113,
				length : 2,
				info : 'meter active power',
				refresh : dataRefreshRate.high,
				type : deviceType.meter,
				states : [{
					state: { id: 'meter.activePower', name: 'ActivePower', type: 'number', unit: 'kW', role: 'value.power', desc: '(>0: feed-in to the power grid. <0: supply from the power grid.)' },
					register: { reg: 37113, type: dataType.int32, gain:1000 }
				}]
			},
			{
				address : 37000,
				length : 68,
				info : 'battery information',
				refresh : dataRefreshRate.low,
				type : deviceType.battery,
				states: [
					{
						state: { id: 'battery.maximumChargePower', name: 'MaximumChargePower', type: 'number', unit: 'W', role: 'value.power', desc: '' },
						register: { reg: 37046, type: dataType.uint32 }
					},
					{	state: { id: 'battery.maximumDischargePower', name: 'MaximumDischargePower', type: 'number', unit: 'W', role: 'value.power', desc: '' },
						register: { reg: 37048, type: dataType.uint32}
					}]
			},
			{
				address : 38200,
				length : 100,
				info : 'additional battery information',
				refresh : dataRefreshRate.low,
				type : deviceType.battery
			},
			{
				address : 30000,
				length : 81,
				info : 'model info, SN, max Power (static info)',
				type : deviceType.inverter,
				states: [{
					state: {id: 'info.model', name: 'Model', type: 'string', role: 'state'},
					register: {reg: 30000, type: dataType.string, length: 15}
				},
				{
					state: {id: 'info.modelID', name: 'Model ID', type: 'number', role: 'state'},
					register: {reg: 30070, type: dataType.uint16}
				},
				{
					state: {id: 'info.serialNumber', name: 'Serial number', type: 'string', role: 'state'},
					register: {reg: 30015, type: dataType.string, length: 10}
				},
				{
					state: {id: 'info.ratedPower', name: 'Rated power', type: 'number', unit: 'kW', role: 'value.power'},
					register: {reg: 30073, type: dataType.int32, gain:1000}
				},
				{
					state: {id: 'info.numberMPPTrackers', name: 'Number of MPP trackers', type: 'number', unit: '', role: 'state'},
					register: {reg: 30072, type: dataType.uint16}
				}]
			},
			{
				address : 37800,
				length : 100,
				info : 'additional battery information',
				refresh : dataRefreshRate.low,
				type : deviceType.battery
			},
			{
				address : 38300,
				length : 100,
				info : 'additional battery information',
				refresh : dataRefreshRate.low,
				type : deviceType.battery
			},
			{
				address : 38400,
				length : 100,
				info : 'additional battery information',
				refresh : dataRefreshRate.low,
				type : deviceType.battery
			},
			{
				address : 47081,
				length : 8,
				info : 'additional battery information',
				refresh : dataRefreshRate.low,
				type : deviceType.battery,
				states: [{
					state: {id: 'battery.chargingCutoffCapacity', name: 'Charging Cutoff Capacity', type: 'number', unit: '%', role: 'value.capacity'},
					register: {reg: 47081, type: dataType.uint16, gain: 10}
				},
				{
					state: {id: 'battery.dischargeCutoffCapacity', name: 'Discharge Cutoff Capacity', type: 'number', unit: '%', role: 'value.capacity'},
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
						state: {id: 'grid.frequency', name: 'Grid Frequency', type: 'number', unit: 'Hz', role: 'value'},
						register: {reg: 32085, type: dataType.uint16, gain: 100}
					},
					{
						state: {id: 'efficiency', name: 'Efficiency', type: 'number', unit: '%', role: 'value.efficiency'},
						register: {reg: 32086, type: dataType.uint16, gain: 100}
					},
					{
						state: {id: 'internalTemperature', name: 'Internal temperature', type: 'number', unit: '°C', role: 'value.temp'},
						register: {reg: 32087, type: dataType.int16, gain: 10}
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
						state: {id: 'accumulatedEnergyYield', name: 'Accumulated Energy Yield', type: 'number', unit: 'kWh', role: 'value.power.consumption'},
						register: {reg: 32106, type: dataType.uint32, gain: 100}
					},
					{
						state: {id: 'dailyEnergyYield', name: 'Daily Energy Yield', type: 'number', unit: 'kWh', role: 'value.power.consumption'},
						register: {reg: 32114, type: dataType.uint32, gain: 100}
					}]
			},
			{
				address : 37100,
				length : 114,
				info : 'meter info',
				refresh : dataRefreshRate.low,
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
					state: {id: 'meter.reactivePower', name: 'Reactive Power', type: 'number', unit: 'VAr', role: 'value.power.reactive'},
					register: {reg: 37115, type: dataType.int32}
				},
				{
					state: {id: 'meter.powerFactor', name: 'Power Factor', type: 'number', unit: '', role: 'value'},
					register: {reg: 37117, type: dataType.int16, gain: 1000}
				},
				{
					state: {id: 'meter.gridFrequency', name: 'Grid Frequency', type: 'number', unit: 'Hz', role: 'value'},
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
				}]
			},
			{
				address : 37700,
				length : 100,
				info : 'battery information',
				refresh : dataRefreshRate.low,
				type : deviceType.battery,
				states: [{
					state: {id: 'battery.ratedCapacity', name: 'Rated Capacity', type: 'number', unit: 'Wh', role: 'value.capacity'},
					register: {reg: 37758, type: dataType.uint32}
				},
				{
					state: {id: 'battery.SOC', name: 'State of capacity', type: 'number', unit: '%', role: 'value.battery', desc: 'SOC'},
					register: {reg: 37760, type: dataType.uint16, gain: 10}
				},
				{
					state: {id: 'battery.runningState', name: 'Running state', type: 'string', role: 'value'},
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
					state: { id: 'battery.currentDayChargeCapacity', name: 'Current Day Charge Capacity', type: 'number', unit: 'kWh', role: 'value.power.consumption' },
					register: { reg: 37784, type: dataType.uint32,  gain: 100 }
				},
				{
					state: { id: 'battery.currentDayDischargeCapacity', name: 'Current Day Discharge Capacity', type: 'number', unit: 'kWh', role: 'value.power.consumption', desc: 'TBD' },
					register: { reg: 37786, type: dataType.uint32,  gain: 100 }
				}
				]
			}
		];
		this.postUpdateHooks = [
			{
				refresh : dataRefreshRate.low,
				state: {id: 'derived.dailyInputYield', name: 'Input Yield Today', type: 'number', unit: 'kWh', role: 'value.power.consumption', desc: 'daily yield displayed on the portal'},
				fn : (path) => {
					const disCharge = this.stateCache.get(path+'battery.currentDayDischargeCapacity')?.value;
					const charge = this.stateCache.get(path+'battery.currentDayChargeCapacity')?.value;
					const inputYield = Math.round((this.stateCache.get(path+'dailyEnergyYield')?.value + charge - disCharge)*100)/100;
					this.stateCache.set(path+'derived.dailyInputYield', inputYield, {type: 'number'});
				}
			}
		];
		this.processHooks = [
			{
				refresh : dataRefreshRate.high,
				states : [
					{id: 'collected.houseConsumption', name: 'House Consumption', type: 'number', unit: 'kW', role: 'value.power', desc: ''},
					{id: 'collected.activePower', name: 'Active power', type: 'number', unit: 'kW', role: 'value.power', desc: 'Power currently used'},
					{id: 'collected.inputPower', name: 'Input power' , type: 'number', unit: 'kW', role: 'value.power', desc: 'Power from solar'},
					{id: 'collected.inputPowerWithEfficiencyLoss', name: 'input power with efficiency loss' , type: 'number', unit: 'kW', role: 'value.power', desc: ''},
				],
				fn : (inverters) => {
					let sum = 0;
					let inPower = 0;
					let inPowerEff = 0;
					for (const inverter of inverters) {
						sum  += this.stateCache.get(inverter.path+'.activePower')?.value;
						inPower += this.stateCache.get(inverter.path+'.inputPower')?.value;
						inPowerEff += this.stateCache.get(inverter.path+'.derived.inputPowerWithEfficiencyLoss')?.value;
					}
					this.stateCache.set('collected.inputPower',inPower,{type: 'number', renew : true});
					this.stateCache.set('collected.inputPowerWithEfficiencyLoss',inPowerEff,{type: 'number', renew : true});
					this.stateCache.set('collected.activePower',sum,{type: 'number', renew : true});
					sum -= this.stateCache.get('meter.activePower')?.value;
					this.stateCache.set('collected.houseConsumption',sum,{type: 'number', renew : true});
				}

			},
			{
				refresh : dataRefreshRate.low,
				states : [
					{id: 'collected.dailyEnergyYield', name: 'Daily Energy Yield', type: 'number', unit: 'kWh', role: 'value.power.consumption', desc: 'daily output yield of the inverters'},
					{id: 'collected.dailyInputYield', name: 'Input Yield Today', type: 'number', unit: 'kWh', role: 'value.power.consumption', desc: 'daily yield displayed on the portal'},
					{id: 'collected.accumulatedEnergyYield', name: 'Accumulated Energy Yield', type: 'number', unit: 'kWh', role: 'value.power.consumption'},
					{id: 'collected.consumptionSum', name: 'Consumption Sum', type: 'number', unit: 'kWh', role: 'value.power.consumption'},
					{id: 'collected.gridExportSum', name: 'Grid Export Sum', type: 'number', unit: 'kWh', role: 'value.power.consumption'},
					{id: 'collected.gridImportSum', name: 'Grid Export Sum', type: 'number', unit: 'kWh', role: 'value.power.consumption'},
					{id: 'collected.consumptionStart', name: 'Consumption Start', type: 'number', unit: 'kWh', role: 'value.power.consumption'},
					{id: 'collected.gridExportToday', name: 'Grid Export Today', type: 'number', unit: 'kWh', role: 'value.power.consumption'},
					{id: 'collected.gridImportToday', name: 'Grid Import  Today', type: 'number', unit: 'kWh', role: 'value.power.consumption'},
					{id: 'collected.consumptionToday', name: 'Consumption Today', type: 'number', unit: 'kWh', role: 'value.power.consumption'},
					{id: 'collected.totalCharge', name: 'Total Charge of Battery', type: 'number', unit: 'kWh', role: 'value.power.consumption'},
					{id: 'collected.totalDischarge', name: 'Total Discharge of Battery', type: 'number', unit: 'kWh', role: 'value.power.consumption'},
					{id: 'collected.currentDayChargeCapacity', name: 'Current Day Charge Capacity of Battery', type: 'number', unit: 'kWh', role: 'value.power.consumption' },
					{id: 'collected.currentDayDischargeCapacity', name: 'Current Day Discharge Capacity of Battery', type: 'number', unit: 'kWh', role: 'value.power.consumption', desc: 'TBD' },
					{id: 'collected.SOC', name: 'State of battery capacity', type: 'number', unit: '%', role: 'value.battery', desc: 'SOC'},
					{id: 'collected.ratedCapacity', name: 'Rated of battery Capacity', type: 'number', unit: 'Wh', role: 'value.capacity'}
				],
				fn : (inverters) => {
					let inYield = 0;
					let outYield = 0;
					let enYield = 0;
					let charge = 0;
					let disCharge = 0;
					let totalDisCharge = 0;
					let totalCharge = 0;
					let ratedCap = 0;
					let load = 0;
					for (const inverter of inverters) {
						outYield += this.stateCache.get(inverter.path+'.dailyEnergyYield')?.value;
						inYield += this.stateCache.get(inverter.path+'.derived.dailyInputYield')?.value;
						enYield += this.stateCache.get(inverter.path+'.accumulatedEnergyYield')?.value;
						charge += this.stateCache.get(inverter.path+'.battery.currentDayChargeCapacity')?.value;
						disCharge += this.stateCache.get(inverter.path+'.battery.currentDayDischargeCapacity')?.value;
						totalCharge += this.stateCache.get(inverter.path+'.battery.totalCharge')?.value;
						totalDisCharge += this.stateCache.get(inverter.path+'.battery.totalDischarge')?.value;
						if (this.stateCache.get(inverter.path+'.battery.ratedCapacity')?.value > 0) {
							load += this.stateCache.get(inverter.path+'.battery.ratedCapacity')?.value * this.stateCache.get(inverter.path+'.battery.SOC')?.value;
							ratedCap += this.stateCache.get(inverter.path+'.battery.ratedCapacity')?.value;
						}
					}
					this.stateCache.set('collected.dailyEnergyYield',outYield, {type: 'number'});
					this.stateCache.set('collected.dailyInputYield',inYield, {type: 'number'});
					this.stateCache.set('collected.accumulatedEnergyYield',enYield,  {type: 'number'});
					const conSum = enYield + this.stateCache.get('meter.reverseActiveEnergy')?.value - this.stateCache.get('meter.positiveActiveEnergy')?.value;
					this.stateCache.set('collected.consumptionSum',conSum,  {type: 'number'});
					// compute export and import today
					this.stateCache.set('collected.gridExportToday',this.stateCache.get('meter.positiveActiveEnergy')?.value -
										this.stateCache.get('collected.gridExportSum')?.value,  {type: 'number'});
					this.stateCache.set('collected.gridImportToday',this.stateCache.get('meter.reverseActiveEnergy')?.value -
										this.stateCache.get('collected.gridImportSum')?.value,  {type: 'number'});
					// compute consumption today
					this.stateCache.set('collected.consumptionSum',this.stateCache.get('collected.accumulatedEnergyYield')?.value +
										this.stateCache.get('meter.reverseActiveEnergy')?.value -
										this.stateCache.get('meter.positiveActiveEnergy')?.value,  {type: 'number'});
					this.stateCache.set('collected.consumptionToday', this.stateCache.get('collected.consumptionSum')?.value -
										this.stateCache.get('collected.consumptionStart')?.value,  {type: 'number'});
					//compute battery
					this.stateCache.set('collected.totalCharge',totalCharge, {type: 'number'});
					this.stateCache.set('collected.totalDischarge',totalDisCharge, {type: 'number'});
					this.stateCache.set('collected.currentDayChargeCapacity',charge, {type: 'number'});
					this.stateCache.set('collected.currentDayDischargeCapacity',disCharge, {type: 'number'});
					this.stateCache.set('collected.ratedCapacity',ratedCap, {type: 'number'});
					this.stateCache.set('collected.SOC',Math.round(load/ratedCap), {type: 'number'});
				}


			}
		];
	}


	async _initState(path, state) {
		await this.adapter.setObjectAsync(path+state.id, {
			type: 'state',
			common: {
				name: state.name,
				type: state.type,
				role: state.role,
				unit: state.unit,
				desc: state.desc,
				read: true,
				write: false
			},
			native: {}
		});
	}


	_fromArray(data,address,field) {
		//nullish coalescing Operator (??)
		const len = field.register.length ?? dataType.size(field.register.type);
		const pos = field.register.reg - address;
		return dataType.convert(data.slice(pos,pos+len),field.register.type);
	}

	async storeStates() {
		for (const stateEntry of this.stateCache.values()) {
			if (stateEntry.stored) continue;
			if (stateEntry.value !== null) {
				stateEntry.stored = true;
				await this.adapter.setStateAsync(stateEntry.id, {val: stateEntry.value , ack: true});
				this.adapter.log.debug(`Fetched ${stateEntry.id}, val=${stateEntry.value}`);
			}
		}

	}
	getStatePath(type) {
		let path = '';
		if (type !== deviceType.meter) path = this.inverterInfo.path+'.';
		return path;
	}

	async processRegister(reg,data) {
		const path = this.getStatePath(reg.type);

		if (reg.states) {
			for(const field of reg.states) {
				const state = field.state;

				if (!state.initState) {
					await this._initState(path,state);
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
						this.stateCache.set(path+state.id, value, { stored : field?.storeAlways} );
					}
				}
			}
		}
		//Einschubfunktion
		if (reg.postHook) reg.postHook(path);
	}

	async updateStates(modbusClient,refreshRate,duration) {
		const start = new Date().getTime();
		this.inverterInfo = this.adapter.getInverterInfo(modbusClient.id);
		//The number of Registers reads
		let readRegisters = 0;
		for (const reg of this.registerFields) {
			if (duration) {
				if (new Date().getTime() - start > (duration - 2000)) {
					this.adapter.log.debug('Duration: '+Math.round(duration/1000)+' used time: '+ (new Date().getTime() - start)/1000);
					break;
				}
			}
			if (!reg.states || reg.states.length == 0) continue;  	 //no states ?!
			if (!dataRefreshRate.compare(refreshRate,reg.refresh)) continue; //refreshrate unequal
			if (reg.type == deviceType.meter && this.inverterInfo.meter == false) continue; //meter
			//refresh rate low or empty
			if ( refreshRate !== dataRefreshRate.high) {
				if (reg.lastread) {
					if (!reg.refresh) continue;
					if  ((start - reg.lastread) < 60000) {
						this.adapter.log.debug('Last Update :'+(start - reg.lastread));
						continue;
					}
				}
			}
			//this.adapter.log.debug(JSON.stringify(reg));
			try {
				this.adapter.log.debug('Try to read data from id/address ' + modbusClient.id + '/' + reg.address);
				const data = await modbusClient.readHoldingRegisters(reg.address, reg.length);
				reg.lastread = new Date().getTime();
				//this.adapter.log.debug("Data " + reg.info+':'+data);
				await this.processRegister(reg,data);
				readRegisters++;
			} catch (err) {
				this.adapter.log.warn(`Error while reading from ${modbusClient.ipAddress}: [${reg.address}|${reg.length}] '' with : ${err.message}`);
				//this.adapter.log.warn('err.code '+err.modbusCode?);
				if (err.code == 'EHOSTUNREACH' || err.modbusCode == 6) break; // modbus is busy : 6
			}
		}
		//Einschubfunktionen
		await this.runPostUpdateHooks(refreshRate);
		this.storeStates(); //fire and forget
		return readRegisters;
	}


	async runPostUpdateHooks(refreshRate) {
		const path = this.getStatePath(deviceType.inverter);
		for (const hook of this.postUpdateHooks) {
			if (dataRefreshRate.compare(refreshRate,hook.refresh)) {
				const state = hook.state;
				if (!state.initState) {
					await this._initState(path,state);
					state.initState = true;
				}
				hook.fn(path);
			}
		}
	}


	async runProcessHooks(refreshRate) {
		for (const hook of this.processHooks) {
			if (dataRefreshRate.compare(refreshRate,hook.refresh)) {
				for (const state of hook.states) {
					if (!state.initState) {
						await this._initState('',state);
						state.initState = true;
					}
					hook.fn(this.adapter.inverters);
				}
			}
		}
		this.storeStates(); //fire and forget
	}

	async _loadStates() {
		let value = await this.adapter.getStateAsync('collected.gridExportSum');
		this.stateCache.set('collected.gridExportSum',value?.val, {type : 'number', stored : true });
		value = await this.adapter.getStateAsync('collected.gridImportSum');
		this.stateCache.set('collected.gridImportSum',value?.val, {type : 'number', stored : true });
		value = await this.adapter.getStateAsync('collected.consumptionStart');
		this.stateCache.set('collected.consumptionStart',value?.val, {type : 'number', stored : true });
	}

	// one minute before midnight - perform housekeeping actions
	async mitnightProcess () {
		// copy current export/import kWh - used to compute daily import/export in kWh
		this.stateCache.set('collected.gridExportSum',this.stateCache.get('meter.positiveActiveEnergy')?.value, {type : 'number'});
		this.stateCache.set('collected.gridImportSum',this.stateCache.get('meter.reverseActiveEnergy')?.value, {type : 'number'});
		// copy consumption Sum to Start for the next day
		this.stateCache.set('collected.consumptionStart',this.stateCache.get('collected.consumptionSum')?.value, {type : 'number'});
		this.storeStates(); //fire and forget
	}

}

module.exports = Registers;

