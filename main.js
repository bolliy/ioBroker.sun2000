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
		this.inverters = [];
		this.settings = {
			intervall : 30000,
			address : '',
			port : 520,
		};

		this.on('ready', this.onReady.bind(this));
		this.on('stateChange', this.onStateChange.bind(this));
		// this.on('objectChange', this.onObjectChange.bind(this));
		// this.on('message', this.onMessage.bind(this));
		this.on('unload', this.onUnload.bind(this));

	}

	getInverterInfo(id) {
		const inverter = this.inverters.find((item) => item.modbusId == id);
		return inverter;
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
		await this.setObjectNotExistsAsync('meter', {
			type: 'channel',
			common: {
				name: 'meter',
				role: 'info'
			},
			native: {}
		});

		await this.setObjectNotExistsAsync('inverter', {
			type: 'device',
			common: {
				name: 'meter',
				role: 'info'
			},
			native: {}
		});

		//ES6 use a for (const [index, item] of array.entries())  of loop
		//for (const [i, item] of this.conf.entries()) {
		for (const [i, item] of this.inverters.entries()) {
			const path = 'inverter.'+String(i);
			item.path = path;
			await this.setObjectNotExistsAsync(path, {
				type: 'channel',
				common: {
					name: 'modbus'+i,
					role: 'indicator'
				},
				native: {}
			});

			await this.setObjectNotExistsAsync(path+'.grid', {
				type: 'channel',
				common: {
					name: 'grid',
					role: 'info'
				},
				native: {}
			});

			await this.setObjectNotExistsAsync(path+'.battery', {
				type: 'channel',
				common: {
					name: 'battery',
					role: 'info'
				},
				native: {}
			});
		}

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
			/*
            await processBatterie();
             */
		} catch (err) {
			console.warn(err);
		}
		//this.state.updateStates2(this.modbusClient);
		this.dataPolling();
	}

	async checkAndPrepare() {
		// Time of Using charging and discharging periodes (siehe Table 5-6)
		// tCDP[3]= 127
		const tCDP = [1,0,1440,383,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]; //nicht aus dem Netz laden
		this.modbusClient.setID(this.inverters[0].modbusId);  //Master Inverter
		const data = await this.modbusClient.readHoldingRegisters(47086,4); //
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
				await this.modbusClient.writeRegisters(47086,[5,1,500]);
				//await writeRegistersAsync(1,47086,[5,1,500]); //[TOU,chargeFromGrid,50%]
				await this.modbusClient.writeRegisters(47255,tCDP);
				//await writeRegistersAsync(1,47255,tCDP);      //Plan:1,StartZeit:00:00,EndZeit: 24:00,Endladen/täglich
				/* ggf. sinnvoll
               await writeRegistersAsync(1,47075,[0,5000]); //max. charging power
               await writeRegistersAsync(1,47077,[0,5000]); //max. discharging power
               */
			}
		}
	}


	/**
	 * Is called when databases are connected and adapter received configuration.
	 */
	async onReady() {
		// Initialize your adapter here
		await this.setStateAsync('info.ip', {val: this.config.address, ack: true});
		await this.setStateAsync('info.port', {val: this.config.port, ack: true});
		await this.setStateAsync('info.modbusId', {val: this.config.modbusId, ack: true});
		await this.setStateAsync('info.modbusId2', {val: this.config.modbusId2, ack: true});
		await this.setStateAsync('info.modbusUpdateInterval', {val: this.config.updateInterval, ack: true});

		// Load user settings
		if (this.config.address !== '' || this.config.port > 0 || this.config.updateInterval > 0 ) {
			this.settings.intervall = this.config.updateInterval*1000;
			this.settings.address = this.config.address;
			this.settings.port = this.config.port;

			if (this.settings.intervall < 10000 ) this.config.updateInterval = 30000;
			this.inverters.push({modbusId: this.config.modbusId,meter: false});
			if (this.config.modbusId2 > 0 && this.config.modbusId2 !== this.config.modbusId) {
				this.inverters.push({modbusId: this.config.modbusId2,meter: false});
			}
			//Reference on Object
			//this.conf.push({modbusId: 16, meter: false});

			this.state = new Registers(this);
			this.modbusClient = new ModbusConnect(this,this.config.address,this.config.port);
			this.InitProcess();
		} else {
			this.log.error('*** Adapter deactivated, credentials missing in Adapter Settings !  ***');
			this.setForeignState('system.' + this.namespace + '.alive', false);
		}
	}

	async dataPolling() {
		this.log.debug('### DataPolling start ###');
		const start = new Date().getTime();
		let nextTick = this.config.updateInterval*1000 - start % (this.config.updateInterval*1000);

		//High Loop
		for (const item of this.inverters) {
			this.modbusClient.setID(item.modbusId);
			const timeLeft = start+nextTick - new Date().getTime();
			//this.log.info('### Left Time '+timeLeft/1000);
			await this.state.updateStates(this.modbusClient,dataRefreshRate.high,timeLeft);
		}
		//Low Loop
		for (const item of this.inverters) {
			this.modbusClient.setID(item.modbusId);
			const timeLeft = start+nextTick - new Date().getTime();
			//this.log.info('### Left Time '+timeLeft/1000);
			await this.state.updateStates(this.modbusClient,dataRefreshRate.low,timeLeft);
		}

		const now = new Date().getTime();
		nextTick = this.config.updateInterval*1000 - now % (this.config.updateInterval*1000);
		/*
		this.log.debug('### Next Tick in '+nextTick/1000);
		this.log.debug('###Start before '+(now-start)/1000);
		*/
		if (this.timer) this.clearTimeout(this.timer);
		this.timer = this.setTimeout(() => {
			this.dataPolling(); //recursiv
		}, nextTick);
	}

	/**
	 * Is called when adapter shuts down - callback has to be called under any circumstances!
	 * @param {() => void} callback
	 */
	onUnload(callback) {
		try {
			if (this.modbusClient) this.modbusClient.close();
			this.setState('info.connection', false, true);
			this.log.info('cleaned everything up...');
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