'use strict';

/*
 * Created with @iobroker/create-adapter v2.5.0
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require('@iobroker/adapter-core');

const Registers = require(__dirname + '/lib/register.js');
const ModbusConnect = require(__dirname + '/lib/modbus_connect.js');
const {dataRefreshRate} = require(__dirname + '/lib/types.js');


// Load your modules here, e.g.:
// const fs = require("fs");

class Sun2000 extends utils.Adapter {

	/**
	 * @param {Partial<utils.AdapterOptions>} [options={}]
	 */
	constructor(options) {
		super({
			...options,
			name: 'sun2000',
		});

		this.lastUpdated = 0;

		//this.semaphore = false;
		this.on('ready', this.onReady.bind(this));
		this.on('stateChange', this.onStateChange.bind(this));
		// this.on('objectChange', this.onObjectChange.bind(this));
		// this.on('message', this.onMessage.bind(this));
		this.on('unload', this.onUnload.bind(this));

	}

	async initPath() {
		await this.setObjectNotExistsAsync('info', {
			type: 'channel',
			common: {
				name: 'info',
				role: 'info'
			},
			native: {}
		});

		await this.setObjectNotExistsAsync('grid', {
			type: 'channel',
			common: {
				name: 'grid',
				role: 'info'
			},
			native: {}
		});

		await this.setObjectNotExistsAsync('meter', {
			type: 'channel',
			common: {
				name: 'meter',
				role: 'info'
			},
			native: {}
		});

		await this.setObjectNotExistsAsync('battery', {
			type: 'channel',
			common: {
				name: 'battery',
				role: 'info'
			},
			native: {}
		});

		await this.setObjectNotExistsAsync('info.connection', {
			type: 'state',
			common: {
				name: 'Inverter connected',
				type: 'boolean',
				role: 'indicator.connected',
				read: true,
				write: false,
				desc: 'Is the inverter connected?'
			},
			native: {},
		});

	}

	async InitProcess() {
		try {
			await this.initPath();
			await this.checkAndPrepare();
			await this.state.initStates();
			//await this.state.updateStates(this.modbusClient);
			/*
            await processBatterie();
             */
		} catch (err) {
			console.warn(err);
		}
		await this.dataPolling();
	}

	async checkAndPrepare() {
		// Time of Using charging and discharging periodes (siehe Table 5-6)
		// tCDP[3]= 127
		const tCDP = [1,0,1440,383,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]; //nicht aus dem Netz laden
		const data = await this.modbusClient.readHoldingRegisters(this.config.modbusInverterId,47086,4); //
		/*
         127 - Working mode settings
          2 : Maximise self consumptions (default)
          5 : Time Of Use(Luna) - hilfreich bei dynamischem Stromtarif (z.B Tibber)
        */
		const workingMode = data[0];         // Working mode settings  2:Maximise self consumptio5=)
		const chargeFromGrid = data[1];      // Voraussetzung für Netzbezug in den Speicher (Luna)
		const gridChargeCutOff = data[2]/10; // Ab welcher Schwelle wird der Netzbezug beendet (default 50 %)
		const storageModel = data[3];        // Modell/Herrsteller des Speichers, 2 : HUAWEI-LUNA2000

		if (storageModel == 2) { //wurde nur mit Luna getestet!
			if (workingMode != 5 || chargeFromGrid != 1 ) {
				console.debug('Row '+data+'  Workingmode '+workingMode+ ' Charge from Grid '+chargeFromGrid+ ' Grid Cut Off '+gridChargeCutOff+'%');
				await this.modbusClient.writeRegisters(this.config.modbusInverterId,47086,[5,1,500]);
				//await writeRegistersAsync(1,47086,[5,1,500]); //[TOU,chargeFromGrid,50%]
				await this.modbusClient.writeRegisters(this.config.modbusInverterId,47255,tCDP);
				//await writeRegistersAsync(1,47255,tCDP);      //Plan:1,StartZeit:00:00,EndZeit: 24:00,Endladen/täglich
				/* ggf. sinnvoll
               await writeRegistersAsync(1,47075,[0,5000]); //max. charging power
               await writeRegistersAsync(1,47077,[0,5000]); //max. discharging power
               */
			}
		}
	}

	async ReadInderval() {

		if (this.semaphore) return;
		this.log.info('Start to Interval...');
		this.semaphore = true;

		/*
			await readRegisters(RegToReadFirstly);
			for (let id = 1; id <= ModBusIDs.length; id++) {
				forcesetState(SHI + id + ".Battery.ChargeAndDischargePower", getI32(Buffer[id-1], 37765) / 1, {name: "", unit: "W"});
				forcesetState(SHI + id + ".Battery.SOC", getU16(Buffer[id-1], 37760) / 10, {name: "", unit: "%"});
				forcesetState(SHM + "ActivePower",  getI32(Buffer[PowerMeterID], 37113) / 1, {name: "", unit: "W"});
				forcesetState(SHI + id + ".InputPower",  getI32(Buffer[id-1], 32064) / 1000, {name: "", unit: "kW"});
			}
			await readRegisters(RegToRead);
			ProcessData();
			await processBatterie();
			*/

		await this.state.updateStates(this.modbusClient,dataRefreshRate.normal);
		await this.state.updateStates(this.modbusClient,dataRefreshRate.fast);

		this.semaphore = false;
		this.log.info('Stop to Interval');
	}

	async runWatchDog() {
		this.watchDogHandle && this.clearInterval(this.watchDogHandle);
		this.log.info('Start watchdog...');
		this.watchDogHandle = this.setInterval( async () => {
			if (!this.lastUpdated) this.lastUpdated = 0;
			const sinceLastUpdate = (new Date().getTime() - this.lastUpdated);
			this.log.debug('Watchdog: time to last update '+sinceLastUpdate/1000+' sec');
			if (sinceLastUpdate > 3 * 30000) {
				this.log.warn('watchdog: restart interval ...');
				if (this.intervalId) this.clearInterval(this.intervalId);
				try {
					this.modbusClient.close();
				} catch {
					this.log.info('modbusClient already cloded!');
				}
				this.modbusClient = new ModbusConnect(this,this.config.address,this.config.port);
				this.intervalId = this.setInterval(this.ReadInderval.bind(this),30000);
				this.lastUpdated = new Date().getTime();
				this.semaphore = false;
			}
		},10000);
	}

	/**
	 * Is called when databases are connected and adapter received configuration.
	 */
	async onReady() {
		// Initialize your adapter here

		await this.setStateAsync('info.ip', {val: this.config.address, ack: true});
		await this.setStateAsync('info.port', {val: this.config.port, ack: true});
		await this.setStateAsync('info.inverterID', {val: this.config.modbusInverterId, ack: true});
		//await this.setStateAsync('info.meterID', {val: this.config.modbusMeterId, ack: true});
		await this.setStateAsync('info.modbusUpdateInterval', {val: this.config.updateInterval, ack: true});

		// The adapters config (in the instance object everything under the attribute "native") is accessible via
		// this.config:
		this.log.info('config address: ' + this.config.address);
		this.log.info('config Port: ' + this.config.port);
		this.log.info('config inverter id: ' + this.config.modbusInverterId);

		this.state = new Registers(this);
		this.modbusClient = new ModbusConnect(this,this.config.address,this.config.port);

		await this.InitProcess();
		//await this.runWatchDog();
	}

	async dataPolling(refreshRate) {
		if (!this.firstUpdate) this.firstUpdate = new Date().getTime();

		const start = new Date().getTime();
		if (!this.lastUpdated) this.lastUpdated = new Date().getTime();

		if (refreshRate !== dataRefreshRate.high) {
			this.log.debug('Start "LOW"');
			if (await this.state.readRegisters(this.modbusClient,refreshRate,refreshRate==undefined)) {
				this.lastUpdated = new Date().getTime();
				this.log.debug('OK!!');
			}
			this.state.updateStates(this.modbusClient,refreshRate);
		} else {
			this.log.debug('Start "HIGH"');
		}
		let nextTick = 0;
		if (await this.state.readRegisters(this.modbusClient,dataRefreshRate.high,false)) {
			nextTick = this.config.updateInterval - new Date().getTime()/1000 % this.config.updateInterval;
		}

		this.state.updateStates(this.modbusClient,dataRefreshRate.high);
		const now = new Date().getTime();

		//const nextTick = this.config.updateInterval - (now-this.firstUpdate)/1000 % this.config.updateInterval;
		let nextRefresh = dataRefreshRate.high;
		if (now + nextTick - this.lastUpdated > 5*60000) nextRefresh = dataRefreshRate.low;
		this.log.debug('Next Tick in '+nextTick);
		this.log.debug('Start before '+(now-start)/1000);
		if (this.timer) this.clearTimeout(this.timer);
		this.timer = this.setTimeout(() => {
			this.dataPolling(nextRefresh); //rerursiv
		}, nextTick*1000);
	}

	/**
	 * Is called when adapter shuts down - callback has to be called under any circumstances!
	 * @param {() => void} callback
	 */
	onUnload(callback) {
		try {
			if (this.intervalId) this.clearInterval(this.intervalId);

			this.modbusClient.close();

			callback();
		} catch (e) {
			callback();
		}
	}

	// If you need to react to object changes, uncomment the following block and the corresponding line in the constructor.
	// You also need to subscribe to the objects with `this.subscribeObjects`, similar to `this.subscribeStates`.
	// /**
	//  * Is called if a subscribed object changes
	//  * @param {string} id
	//  * @param {ioBroker.Object | null | undefined} obj
	//  */
	// onObjectChange(id, obj) {
	// 	if (obj) {
	// 		// The object was changed
	// 		this.log.info(`object ${id} changed: ${JSON.stringify(obj)}`);
	// 	} else {
	// 		// The object was deleted
	// 		this.log.info(`object ${id} deleted`);
	// 	}
	// }

	/**
	 * Is called if a subscribed state changes
	 * @param {string} id
	 * @param {ioBroker.State | null | undefined} state
	 */
	onStateChange(id, state) {
		if (state) {
			// The state was changed
			this.log.info(`state ${id} changed: ${state.val} (ack = ${state.ack})`);
		} else {
			// The state was deleted
			this.log.info(`state ${id} deleted`);
		}
	}

	// If you need to accept messages in your adapter, uncomment the following block and the corresponding line in the constructor.
	// /**
	//  * Some message was sent to this instance over message box. Used by email, pushover, text2speech, ...
	//  * Using this method requires "common.messagebox" property to be set to true in io-package.json
	//  * @param {ioBroker.Message} obj
	//  */
	// onMessage(obj) {
	// 	if (typeof obj === 'object' && obj.message) {
	// 		if (obj.command === 'send') {
	// 			// e.g. send email or pushover or whatever
	// 			this.log.info('send command');

	// 			// Send response in callback if required
	// 			if (obj.callback) this.sendTo(obj.from, obj.command, 'Message received', obj.callback);
	// 		}
	// 	}
	// }

}

if (require.main !== module) {
	// Export the constructor in compact mode
	/**
	 * @param {Partial<utils.AdapterOptions>} [options={}]
	 */
	module.exports = (options) => new Sun2000(options);
} else {
	// otherwise start the instance directly
	new Sun2000();
}