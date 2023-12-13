const {registerType,batteryStatus,dataRefreshRate,dataBuffer,dataType} = require(__dirname + '/types.js');


class Registers {
    constructor(adapterInstance) {
       this.adapter = adapterInstance; 
       this.buffer = new dataBuffer(18000,3000);
       /*
          [[37760, 8], [32064, 2], [37113, 2]];
            forcesetState(SHI + id + ".Battery.ChargeAndDischargePower", getI32(Buffer[id-1], 37765) / 1, {name: "", unit: "W"});
            forcesetState(SHI + id + ".Battery.SOC", getU16(Buffer[id-1], 37760) / 10, {name: "", unit: "%"});
            forcesetState(SHM + "ActivePower",  getI32(Buffer[PowerMeterID], 37113) / 1, {name: "", unit: "W"}); 
            forcesetState(SHI + id + ".InputPower",  getI32(Buffer[id-1], 32064) / 1000, {name: "", unit: "kW"});
        */

        this.registerFields = [
            {
                address : 37765,
                length : 2,
                info : 'Battery Charge And Discharge Power',
                refresh : dataRefreshRate.high,
                type : registerType.inverter
            },
            {
                address : 32080,
                length : 2,
                info : 'Inverter Activ Power',
                refresh : dataRefreshRate.high,
                type : registerType.inverter
            },
            {
                address : 32064,
                length : 2,
                info : 'Input Power',
                refresh : dataRefreshRate.high,
                type : registerType.inverter
            },
            {
                address : 37000,
                length : 68,
                info : 'battery information',
                refresh : dataRefreshRate.low,
                type : registerType.battery
            },
            {
                address : 38200,
                length : 100,
                info : 'additional battery information',
                refresh : dataRefreshRate.low,
                type : registerType.battery
            },
            {
                address : 30000,
                length : 81,
                info : 'model info, SN, max Power (static info)',
                type : registerType.inverter
            },
            {
                address : 37800,
                length : 100,
                info : 'additional battery information',
                refresh : dataRefreshRate.low,
                type : registerType.battery
            },
            {
                address : 38300,
                length : 100,
                info : 'additional battery information',
                refresh : dataRefreshRate.low,
                type : registerType.battery
            },
            {
                address : 38400,
                length : 100,
                info : 'additional battery information',
                refresh : dataRefreshRate.low,
                type : registerType.battery
            },
            {
                address : 47081,
                length : 8,
                info : 'additional battery information',
                refresh : dataRefreshRate.low,
                type : registerType.battery
            },
            {
                address : 32000,
                length : 116,
                info : 'inverter status',
                refresh : dataRefreshRate.low,
                type : registerType.inverter
            },
            {
                address : 37100,
                length : 114,
                info : 'meter info',
                refresh : dataRefreshRate.low,
                type : registerType.meter 
            },
            {
                address : 37700,
                length : 100,
                info : 'battery information',
                refresh : dataRefreshRate.low,
                type : registerType.battery
            }
        ];           

        //Datenfelder
        this.dataFields = [
            // initial fields - no repetitive update
            {
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
                state: {id: 'info.ratedPower', name: 'Rated power', type: 'number', unit: 'kW', role: 'state'},
                register: {reg: 30073, type: dataType.int32, gain:1000}
            },
            {
                state: {id: 'info.numberMPPTrackers', name: 'Number of MPP trackers', type: 'number', unit: '', role: 'state'},
                register: {reg: 30072, type: dataType.uint16}
            },
            // inverter
            {
                state: {id: 'activePower', name: 'Active power', type: 'number', unit: 'kW', role: 'value.power', desc: 'Power currently used'},
                register: {reg: 32080, type: dataType.int32, gain:1000},
                refresh: dataRefreshRate.high
            },
            {
                state: {id: 'inputPower', name: 'Input power', type: 'number', unit: 'kW', role: 'value.power', desc: 'Power from PV'},
                register: {reg: 32064, type: dataType.int32, gain:1000},
                refresh: dataRefreshRate.high
            },
            {
                state: {id: 'peakActivePowerCurrentDay', name: 'Peak active power of current day', type: 'number', unit: 'kW', role: 'value.power.max'},
                register: {reg: 32078, type: dataType.int32, gain:1000},
                refresh: dataRefreshRate.low
            },
            {
                state: {id: 'efficiency', name: 'Efficiency', type: 'number', unit: '%', role: 'value.efficiency'},
                register: {reg: 32086, type: dataType.uint16, gain: 100},
                refresh: dataRefreshRate.low
            },
            {      
                state: {id: 'internalTemperature', name: 'Internal temperature', type: 'number', unit: '°C', role: 'value.temp'},
                register: {reg: 32087, type: dataType.int16, gain: 10},
                refresh: dataRefreshRate.low
            },
            //Battery
            {
                state: {id: 'battery.runningState', name: 'Running state', type: 'string', role: 'value'},
                register: {reg: 37762, type: dataType.uint16, length: 1},
                mapper: value => Promise.resolve(batteryStatus[value]),
                refresh: dataRefreshRate.low
            },
            {
                
                state: {id: 'battery.SOC', name: 'State of capacity', type: 'number', unit: '%', role: 'value.capacity', desc: 'SOC'},
                register: {reg: 37760, type: dataType.uint16, gain: 10},
                refresh: dataRefreshRate.low
            },
            {      
                state: {id: 'battery.maximumChargePower', name: 'maximun charge power', type: 'number', unit: 'W', role: 'value.power'},
                register: {reg: 32087, type: dataType.int16, gain: 10},
                refresh: dataRefreshRate.low
            },
            {
                state: {id: 'battery.chargeDischargePower', name: 'Charge/Discharge power', desc: '(>0 charging, <0 discharging)', type: 'number', unit: 'kW', role: 'value.power'},
                register: {reg: 37765, type: dataType.int32, gain:1000},
                refresh: dataRefreshRate.high  
            },
            {
                state: { id: 'battery.currentDayChargeCapacity', name: 'CurrentDayChargeCapacity', type: 'number', unit: 'kWh', role: 'value.power', desc: 'TBD' },
                register: { reg: 37015, type: dataType.uint32, gain: 100 },
                refresh: dataRefreshRate.low
            },
            {
                state: { id: 'battery.currentDayDischargeCapacity', name: 'CurrentDayDischargeCapacity', type: 'number', unit: 'kWh', role: 'value.power', desc: 'TBD' },
                register: { reg: 37786, type: dataType.uint32,  gain: 100 },
                refresh: dataRefreshRate.low
            },
            //meter
            {
                state: { id: 'meter.activePower', name: 'ActivePower', type: 'number', unit: 'kWh', role: 'value.power', desc: '(>0: feed-in to the power grid. <0: supply from the power grid.)' },
                register: { reg: 37113, type: dataType.int32 },
                refresh: dataRefreshRate.high
            }
        ];    

    }



    async readRegisters(modbusClient,refreshRate,stopOnError = true) {
        var readError = 0;
        for (const field of this.registerFields) {

            if (! dataRefreshRate.compare(refreshRate,field.refresh)) continue;
            this.adapter.log.debug(JSON.stringify(field));
            try {
                this.adapter.log.debug("Try to read data from id/address " + this.adapter.config.modbusInverterId + "/" + field.address);
                const data = await modbusClient.readHoldingRegisters(this.adapter.config.modbusInverterId,field.address, field.length);
                this.adapter.log.debug("Data: " + data);   
                this.buffer.set(field.address,data);     
            } catch (err) {
                readError
                this.adapter.log.warn(`Error while reading from ${modbusClient.ipAddress}: [${field.address}|${field.length}] '' with : ${err.message}`);
                readError += 1;
                if (stopOnError) break;
            }         
        }
        return readError == 0;
    }    

    async initStates() {
        for (const field of this.dataFields) {
            const state = field.state;
            await this.adapter.setObjectAsync(state.id, {
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
    }

    fromBuffer(field) {
        //nullish coalescing Operator (??)
        const len = field.register.length ?? dataType.size(field.register.type);
        return dataType.convert(this.buffer.get(field.register.reg,len),field.register.type);
    }

    async updateStates(modbusClient,refreshRate) {
        
        //await this.readRegisters(modbusClient,refreshRate);

        for(const field  of this.dataFields) {
            if (! dataRefreshRate.compare(refreshRate,field.refresh)) continue;
            const state = field.state;
            var value = this.fromBuffer(field);
            if (value !== null) {
                if (field.register.gain) {
                    value /= field.register.gain;
                }
                if (field.mapper) {
                    value = await field.mapper(value);
                }
                /*
                if (updateEntry.postUpdateHook) {
                    await updateEntry.postUpdateHook(adapter, updateEntry.value);
                }
               
                
                */
                await this.adapter.setStateAsync(state.id, {val: value , ack: true});
                this.adapter.log.info(`Fetched value ${state.id}, val=[${value}]`);
            }
        }
        //return Promise.resolve(toUpdate.size);
    }
}

module.exports = Registers;

