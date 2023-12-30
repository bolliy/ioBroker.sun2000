
const {deviceType,batteryStatus,dataRefreshRate,dataType} = require(__dirname + '/types.js');

class StateBuffer  {
	constructor () {
		this.stateMap = new Map();
	}

	get(id) {
		return this.stateMap.get(id);
	}

	set(id, obj, renew = false) {
		const e = this.get(id);
		if (renew || this.get(id)?.value !== obj.value) {
			this.stateMap.set(id, obj);
			console.log('New Value: '+ obj.value +' <> '+e?.value);
		}
	}

	stored(obj) {
		obj.stored = true;
	}

	isAlreadyStored(obj) {
		return obj?.stored == true;
	}

	values () {
		return this.stateMap.values();
	}

}


class Registers {
	constructor(adapterInstance) {
		this.adapter = adapterInstance;

		this.stateMap = new StateBuffer();

		//this.stateMap = new Map();
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
					register: {reg: 32080, type: dataType.int32, gain:1000}
				}]
			},
			{
				address : 32064,
				length : 2,
				info : 'Input Power',
				refresh : dataRefreshRate.high,
				type : deviceType.inverter,
				states : [{
					state: {id: 'inputPower', name: 'Input power' , type: 'number', unit: 'kW', role: 'value.power', desc: 'Power from PV'},
					register: {reg: 32064, type: dataType.int32, gain:1000},
					storeAlways: true
				},
				{
					state: {id: 'derived.inputPowerEffective', name: 'effective solar power input', type: 'number', unit: 'kW', role: 'value.power', desc: 'Power from PV'}
				}
				],
				postHook: async (stateMap,path) => {
					//https://community.home-assistant.io/t/integration-solar-inverter-huawei-2000l/132350/1483?u=wlcrs
					const inPower = stateMap.get(path+'inputPower')?.value;
					//https://wiki.selfhtml.org/wiki/JavaScript/Operatoren/Optional_Chaining_Operator
					//const ratedPower = state ? state.val : undefined;
					const ratedPower = stateMap.get(path+'info.ratedPower')?.value;
					//this.adapter.log.debug('##### ratedPower '+inPower+' '+ratedPower);
					let inPowerEff = inPower;
					if (inPower < ratedPower*0.2) {  //20%
						if (inPower < ratedPower*0.1) {
							inPowerEff *= 0.9;
						} else {
							inPowerEff *= 0.95;
						}
					} else {
						inPowerEff *= 0.98;
					}
					stateMap.set(path+'derived.inputPowerEffective', {id: path+'derived.inputPowerEffective', value: inPowerEff});
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
						state: {id: 'peakActivePowerCurrentDay', name: 'Peak active power of current day', type: 'number', unit: 'kW', role: 'value.power.max'},
						register: {reg: 32078, type: dataType.int32, gain:1000}
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
						state: {id: 'accumulatedEnergyYield', name: 'Accumulated Energy Yield', type: 'number', unit: 'kWh', role: 'value.power.consumption'},
						register: {reg: 32106, type: dataType.uint32, gain: 100}
					},
					{
						state: {id: 'dailyEnergyYield', name: 'Daily Energy Yield', type: 'number', unit: 'kWh', role: 'value.power.consumption'},
						register: {reg: 32114, type: dataType.uint32, gain: 100}
					}]

				/*
				forcesetState(SHI + id + ".State1",                 getU16(Buffer[id-1], 32000), {name: "", unit: ""});
    forcesetState(SHI + id + ".State2",                 getU16(Buffer[id-1], 32001), {name: "", unit: ""});
    forcesetState(SHI + id + ".State3",                 getU16(Buffer[id-1], 32002), {name: "", unit: ""});
    forcesetState(SHI + id + ".Alarm1",                 getU16(Buffer[id-1], 32008), {name: "", unit: ""});
    forcesetState(SHI + id + ".Alarm2",                 getU16(Buffer[id-1], 32009), {name: "", unit: ""});
    forcesetState(SHI + id + ".Alarm3",                 getU16(Buffer[id-1], 32010), {name: "", unit: ""});
    forcesetState(SHI + id + ".String.1_Voltage",       getI16(Buffer[id-1], 32016) / 10  , {name: "", unit: "V"});
    forcesetState(SHI + id + ".String.1_Current",       getI16(Buffer[id-1], 32017) / 100 , {name: "", unit: "A"});
    //forcesetState(SHI + id + ".String.2_Voltage",     getI16(Buffer[id-1], 32018) / 10  , {name: "", unit: "V"});
    //forcesetState(SHI + id + ".String.2_Current",     getI16(Buffer[id-1], 32019) / 100 , {name: "", unit: "A"});
    forcesetState(SHI + id + ".InputPower",             getI32(Buffer[id-1], 32064) / 1000, {name: "", unit: "kW"});
    forcesetState(SHI + id + ".Grid.L1-L2_Voltage",     getU16(Buffer[id-1], 32066) / 10  , {name: "", unit: "V"});
    forcesetState(SHI + id + ".Grid.L2-L3_Voltage",     getU16(Buffer[id-1], 32067) / 10  , {name: "", unit: "V"});
    forcesetState(SHI + id + ".Grid.L3-L1_Voltage",     getU16(Buffer[id-1], 32068) / 10  , {name: "", unit: "V"});
    forcesetState(SHI + id + ".Grid.L1_Voltage",        getU16(Buffer[id-1], 32069) / 10  , {name: "", unit: "V"});
    forcesetState(SHI + id + ".Grid.L2_Voltage",        getU16(Buffer[id-1], 32070) / 10  , {name: "", unit: "V"});
    forcesetState(SHI + id + ".Grid.L3_Voltage",        getU16(Buffer[id-1], 32071) / 10  , {name: "", unit: "V"});
    forcesetState(SHI + id + ".Grid.L1_Current",        getI32(Buffer[id-1], 32072) / 1000, {name: "", unit: "A"});
    forcesetState(SHI + id + ".Grid.L2_Current",        getI32(Buffer[id-1], 32074) / 1000, {name: "", unit: "A"});
    forcesetState(SHI + id + ".Grid.L3_Current",        getI32(Buffer[id-1], 32076) / 1000, {name: "", unit: "A"});
    forcesetState(SHI + id + ".PeakActivePowerDay",     getI32(Buffer[id-1], 32078) / 1000, {name: "", unit: "kW"});
    forcesetState(SHI + id + ".ActivePower",            getI32(Buffer[id-1], 32080) / 1000, {name: "", unit: "kW"});
    forcesetState(SHI + id + ".ReactivePower",          getI32(Buffer[id-1], 32082) / 1000, {name: "", unit: "kVar"});
    forcesetState(SHI + id + ".PowerFactor",            getI16(Buffer[id-1], 32084) / 1000, {name: "", unit: ""});
    forcesetState(SHI + id + ".GridFrequency",          getU16(Buffer[id-1], 32085) / 100 , {name: "", unit: "Hz"});
    forcesetState(SHI + id + ".Efficiency",             getU16(Buffer[id-1], 32086) / 100 , {name: "", unit: "%"});
    forcesetState(SHI + id + ".InternalTemperature",    getI16(Buffer[id-1], 32087) / 10  , {name: "", unit: "°C"});
    forcesetState(SHI + id + ".InsulationResistance",   getU16(Buffer[id-1], 32088) / 1000, {name: "", unit: "MOhm"});
    forcesetState(SHI + id + ".DeviceStatus",           getU16(Buffer[id-1], 32089), {name: "", unit: ""});
    forcesetState(SHI + id + ".FaultCode",              getU16(Buffer[id-1], 32090), {name: "", unit: ""});
    forcesetState(SHI + id + ".StartupTime",            getU32(Buffer[id-1], 32091), {name: "", unit: ""});
    forcesetState(SHI + id + ".ShutdownTime",           getU32(Buffer[id-1], 32093), {name: "", unit: ""});
    forcesetState(SHI + id + ".AccumulatedEnergyYield", getU32(Buffer[id-1], 32106) / 100, {name: "", unit: "kWh"});
    forcesetState(SHI + id + ".DailyEnergyYield",       getU32(Buffer[id-1], 32114) / 100, {name: "", unit: "kWh"});
	*/
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

				/*
				forcesetState(SHM + "Status",                   getU16(Buffer[PowerMeterID], 37100), {name: "", unit: ""});
				forcesetState(SHM + "VoltageL1",                getI32(Buffer[PowerMeterID], 37101)  / 10, {name: "", unit: "V"});
				forcesetState(SHM + "VoltageL2",                getI32(Buffer[PowerMeterID], 37103)  / 10, {name: "", unit: "V"});
				forcesetState(SHM + "VoltageL3",                getI32(Buffer[PowerMeterID], 37105)  / 10, {name: "", unit: "V"});
				forcesetState(SHM + "CurrentL1",                getI32(Buffer[PowerMeterID], 37107)  / 100, {name: "", unit: "A"});
				forcesetState(SHM + "CurrentL2",                getI32(Buffer[PowerMeterID], 37109)  / 100, {name: "", unit: "A"});
				forcesetState(SHM + "CurrentL3",                getI32(Buffer[PowerMeterID], 37111) / 100, {name: "", unit: "A"});
				forcesetState(SHM + "ActivePower",              getI32(Buffer[PowerMeterID], 37113) / 1, {name: "", unit: "W"});
				forcesetState(SHM + "ReactivePower",            getI32(Buffer[PowerMeterID], 37115) / 1, {name: "", unit: "Var"});
				forcesetState(SHM + "PowerFactor",              getI16(Buffer[PowerMeterID], 37117) / 1000, {name: "", unit: ""});
				forcesetState(SHM + "GridFrequency",            getI16(Buffer[PowerMeterID], 37118) / 100, {name: "", unit: "Hz"});
				forcesetState(SHM + "PositiveActiveEnergy",     getI32(Buffer[PowerMeterID], 37119) / 100, {name: "", unit: "kWh"});
				forcesetState(SHM + "ReverseActiveEnergy",      getI32(Buffer[PowerMeterID], 37121) / 100, {name: "", unit: "kWh"});
				forcesetState(SHM + "AccumulatedReactivePower", getI32(Buffer[PowerMeterID], 37123) / 100, {name: "", unit: "kVarh"});
				//forcesetState(SHM + "MeterType",                getU16(Buffer[PowerMeterID], 37125), {name: "", unit: ""});
				forcesetState(SHM + "VoltageL1-L2",             getI32(Buffer[PowerMeterID], 37126) / 10, {name: "", unit: "V"});
				forcesetState(SHM + "VoltageL2-L3",             getI32(Buffer[PowerMeterID], 37128) / 10, {name: "", unit: "V"});
				forcesetState(SHM + "VoltageL3-L1",             getI32(Buffer[PowerMeterID], 37130) / 10, {name: "", unit: "V"});
				forcesetState(SHM + "ActivePowerL1",            getI32(Buffer[PowerMeterID], 37132) / 1, {name: "", unit: "W"});
				forcesetState(SHM + "ActivePowerL2",            getI32(Buffer[PowerMeterID], 37134) / 1, {name: "", unit: "W"});
				forcesetState(SHM + "ActivePowerL3",            getI32(Buffer[PowerMeterID], 37136) / 1, {name: "", unit: "W"});
				//forcesetState(SHM + "MeterModel",               getU16(Buffer[PowerMeterID], 37138), {name: "", unit: ""});	*/
			},
			{
				address : 37700,
				length : 100,
				info : 'battery information',
				refresh : dataRefreshRate.low,
				type : deviceType.battery,
				/*
				forcesetState(SHI + id + ".Battery.RatedCapacity",                          getU32(Buffer[id-1], 37758) / 1,   {name: "", unit: "Wh"});
				forcesetState(SHI + id + ".Battery.RunningStatus",                          getU16(Buffer[id-1], 37762) / 1,   {name: "", unit: ""});
				forcesetState(SHI + id + ".Battery.BusVoltage",                             getU16(Buffer[id-1], 37763) / 10,  {name: "", unit: "V"});
				forcesetState(SHI + id + ".Battery.SOC",                                    getU16(Buffer[id-1], 37760) / 10,  {name: "", unit: "%"});
				forcesetState(SHI + id + ".Battery.BusCurrent",                             getI16(Buffer[id-1], 37764) / 10,  {name: "", unit: "A"});
				forcesetState(SHI + id + ".Battery.ChargeAndDischargePower",                getI32(Buffer[id-1], 37765) / 1,   {name: "", unit: "W"});
				forcesetState(SHI + id + ".Battery.TotalCharge",                            getU32(Buffer[id-1], 37780) / 100, {name: "", unit: "kWh"});
				forcesetState(SHI + id + ".Battery.TotalDischarge",                         getU32(Buffer[id-1], 37782) / 100, {name: "", unit: "kWh"});
				forcesetState(SHI + id + ".Battery.CurrentDayChargeCapacity",               getU32(Buffer[id-1], 37784) / 100, {name: "", unit: "kWh"});
				forcesetState(SHI + id + ".Battery.CurrentDayDischargeCapacity",            getU32(Buffer[id-1], 37786) / 100, {name: "Current DayDiscarge ", unit: "kWh"});
				*/
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
				/*
				postHook: async (stateMap,path) => {
					stateMap.set(path+'battery.test', {id: path+'battery.test', value: 'test'});
				}
				*/
			}
		];
		this.postUpdateHooks = [
			{
				refresh : dataRefreshRate.low,
				state: {id: 'derived.inputYieldDaily', name: 'Input Yield', type: 'number', unit: 'kWh', role: 'value.power.consumption', desc: 'Power from PV'},
				fn : async (stateMap, path) => {
					const disCharge = stateMap.get(path+'battery.currentDayDischargeCapacity')?.value;
					const charge = stateMap.get(path+'battery.currentDayChargeCapacity')?.value;
					const inputYield = Math.round((stateMap.get(path+'dailyEnergyYield')?.value + charge - disCharge)*100)/100;
					stateMap.set(path+'derived.inputYieldDaily', {id: path+'derived.inputYieldDaily', value: inputYield});
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

	async storeStates(stateMap) {
		for (const stateEntry of stateMap.values()) {
			if (stateEntry.value !== null && !stateEntry.stored ) {
			//if (stateEntry.value !== null && !stateMap.isAlreadyStored(stateEntry.id) ) {
				await this.adapter.setStateAsync(stateEntry.id, {val: stateEntry.value , ack: true});
				this.stateMap.stored(stateEntry);
				//stateEntry.stored = true;
				this.adapter.log.debug(`Fetched ${stateEntry.id}, val=${stateEntry.value}`);
			}
		}

	}
	getStatePath(type) {
		let path = '';
		if (type !== deviceType.meter) path = this.inverterInfo.path+'.';
		return path;
	}

	async processRegister(reg,data,stateMap) {
		//const stateMap = new Map();
		const path = this.getStatePath(reg.type);

		//this.adapter.log.debug('[register.storeStates] '+JSON.stringify(reg));
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
						stateMap.set(path+state.id, {id: path+state.id, value: value}, field?.storeAlways);
					}
				}
			}
		}
		//Einschubfunktion
		if (reg.postHook) await reg.postHook(stateMap,path);
	}

	async updateStates(modbusClient,refreshRate,duration) {
		//const stateMap = new Map();
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
				//this.adapter.log.debug("Data " + reg.info+':'+data);
				this.processRegister(reg,data,this.stateMap); //fire and forget
				readRegisters++;
				reg.lastread = new Date().getTime();
			} catch (err) {
				this.adapter.log.warn(`Error while reading from ${modbusClient.ipAddress}: [${reg.address}|${reg.length}] '' with : ${err.message}`);
				//this.adapter.log.warn('err.code '+err.modbusCode?);
				if (err.code == 'EHOSTUNREACH' || err.modbusCode == 6) break; //modbus is busy
			}
		}
		//Einschubfunktionen
		await this.runPostUpdateHooks(refreshRate,this.stateMap);
		await this.storeStates(this.stateMap);
		return readRegisters;
	}

	async runPostUpdateHooks(refreshRate,stateMap) {
		const path = this.getStatePath(deviceType.inverter);
		for (const hook of this.postUpdateHooks) {
			if (dataRefreshRate.compare(refreshRate,hook.refresh)) {
				this.adapter.log.debug('Refresh '+refreshRate+' hook.refresh '+hook.refresh);
				const state = hook.state;
				if (!state.initState) {
					await this._initState(path,state);
					state.initState = true;
				}
				await hook.fn(stateMap,path);
			}
		}
	}

}

module.exports = Registers;

