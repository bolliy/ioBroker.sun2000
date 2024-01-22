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

class Sun2000 extends utils.Adapter {

	/**
	 * @param {Partial<utils.AdapterOptions>} [options={}]
	 */
	constructor(options) {
		super({
			...options,
			name: 'sun2000',
		});

		this.lastTimeUpdated = 0;
		this.lastStateUpdatedHigh = 0;
		this.lastStateUpdatedLow = 0;
		this.isConnected = false;
		this.inverters = [];
		this.settings = {
			intervall : 20000,
			address : '',
			port : 520
		};

		this.on('ready', this.onReady.bind(this));
		this.on('stateChange', this.onStateChange.bind(this));
		// this.on('objectChange', this.onObjectChange.bind(this));
		// this.on('message', this.onMessage.bind(this));
		this.on('unload', this.onUnload.bind(this));
	}

	async initPath() {
		await this.extendObjectAsync('info', {
			type: 'channel',
			common: {
				name: 'channel info',
				role: 'info'
			},
			native: {}
		});

		await this.extendObjectAsync('info.connection', {
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

		await this.extendObjectAsync('meter', {
			type: 'device',
			common: {
				name: 'device meter'
			},
			native: {}
		});
		await this.extendObjectAsync('collected', {
			type: 'channel',
			common: {
				name: 'channel collected'
			},
			native: {}
		});

		await this.extendObjectAsync('inverter', {
			type: 'device',
			common: {
				name: 'device inverter'
			},
			native: {}
		});

		//ES6 use a for (const [index, item] of array.entries()) of loop
		for (const [i, item] of this.inverters.entries()) {
			const path = 'inverter.'+String(i);
			item.path = path;
			await this.extendObjectAsync(path, {
				type: 'channel',
				common: {
					name: 'channel modbus'+i,
					role: 'indicator'
				},
				native: {}
			});

			await this.extendObjectAsync(path+'.grid', {
				type: 'channel',
				common: {
					name: 'channel grid'
				},
				native: {}
			});

			await this.extendObjectAsync(path+'.info', {
				type: 'channel',
				common: {
					name: 'channel info',
					role: 'info'
				},
				native: {}
			});

			await this.extendObjectAsync(path+'.battery', {
				type: 'channel',
				common: {
					name: 'channel battery'
				},
				native: {}
			});

			await this.extendObjectAsync(path+'.string', {
				type: 'channel',
				common: {
					name: 'channel string'
				},
				native: {}
			});

			await this.extendObjectAsync(path+'.derived', {
				type: 'channel',
				common: {
					name: 'channel derived'
				},
				native: {}
			});

			await this.extendObjectAsync(path+'.optimizer', {
				type: 'channel',
				common: {
					name: 'channel optimizer'
				},
				native: {}
			});

		}
	}

	async InitProcess() {
		try {
			await this.initPath();
			/*
			await this.checkAndPrepare();
            */
		} catch (err) {
			this.log.warn(err);
		}
		this.modbusClient = new ModbusConnect(this,this.settings.address,this.settings.port);
		this.state = new Registers(this);
		this.dataPolling();
		this.runWatchDog();
		this.atMidnight();
	}

	atMidnight() {
		const now = new Date();
		const night = new Date(
			now.getFullYear(),
			now.getMonth(),
			now.getDate() + 1, // the next day, ...
			0, 0, 0 // ...at 00:00:00 hours
		);
		const msToMidnight = night.getTime() - now.getTime();

		if (this.mitnightTimer) this.clearTimeout(this.mitnightTimer);
		this.mitnightTimer = this.setTimeout(async () => {
			await this.state.mitnightProcess();   //      the function being called at midnight.
			this.atMidnight();    	              //      reset again next midnight.
		}, msToMidnight);
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
				this.log.debug('Row '+data+'  Workingmode '+workingMode+ ' Charge from Grid '+chargeFromGrid+ ' Grid Cut Off '+gridChargeCutOff+'%');
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

	runWatchDog() {
		this.watchDogHandle && this.clearInterval(this.watchDogHandle);
		this.watchDogHandle = this.setInterval( () => {
			if (!this.lastTimeUpdated) this.lastUpdated = 0;
			if (this.lastTimeUpdated > 0) {
				const sinceLastUpdate = new Date().getTime() - this.lastTimeUpdated; //ms
				this.log.debug('Watchdog: time of last update '+sinceLastUpdate/1000+' sec');
				const lastIsConnected = this.isConnected;
				this.isConnected = this.lastStateUpdatedHigh > 0 && sinceLastUpdate < this.settings.intervall*3;
				if (this.isConnected !== lastIsConnected ) this.setState('info.connection', this.isConnected, true);
				if (!this.isConnected) {
					this.setStateAsync('info.health', {val: '{errno:1, message: "Can\'t connect to inverter"}', ack: true});
				} else {
					const ret = this.state.wasAllRead(65000);
					if (ret?.errno !== 0) this.log.warn(ret.message);
					this.setStateAsync('info.health', {val: JSON.stringify(ret), ack: true});
				}

				this.lastStateUpdatedLow = 0;
				this.lastStateUpdatedHigh = 0;

				if (sinceLastUpdate > this.settings.intervall*10) {
					this.log.warn('watchdog: restart Adapter...');
					this.restart();
				}
			}
		},60000);
	}


	/**
	 * Is called when databases are connected and adapter received configuration.
	 */
	async onReady() {

		// Initialize your adapter here
		await this.setStateAsync('info.ip', {val: this.config.address, ack: true});
		await this.setStateAsync('info.port', {val: this.config.port, ack: true});
		await this.setStateAsync('info.modbusIds', {val: this.config.modbusIds, ack: true});
		await this.setStateAsync('info.health', {val: '{}', ack: true});

		// Load user settings
		if (this.config.address !== '' || this.config.port > 0 || this.config.updateInterval > 0 ) {
			this.settings.intervall = this.config.updateInterval*1000; //ms
			this.settings.address = this.config.address;
			this.settings.port = this.config.port;
			this.settings.modbusIds = this.config.modbusIds.split(',').map((n) => {return Number(n);});

			if (this.settings.modbusIds.length > 0 && this.settings.modbusIds.length < 6) {
				if (this.settings.intervall < 5000*this.settings.modbusIds.length ) {
					this.settings.intervall = 5000*this.settings.modbusIds.length;
				}
				await this.setStateAsync('info.modbusUpdateInterval', {val: this.settings.intervall/1000, ack: true});
				for (const [i,id] of this.settings.modbusIds.entries()) {
					this.inverters.push({index: i, modbusId: id, energyLoss: 0.02, meter: (i==0)}); //own energy consumption of inverter 11 W
				}
				await this.InitProcess();
			} else {
				this.log.error('*** Adapter deactivated, can\'t parse modbusIds ! ***');
				this.setForeignState('system.' + this.namespace + '.alive', false);
			}
		} else {
			this.log.error('*** Adapter deactivated, credentials missing in Adapter Settings !  ***');
			this.setForeignState('system.' + this.namespace + '.alive', false);
		}
	}

	async dataPolling() {

		function timeLeft(target,factor =1) {
			const left = Math.round((target - new Date().getTime())*factor);
			if (left < 0) return 0;
			return left;
		}

		const start = new Date().getTime();
		this.log.debug('### DataPolling START '+ Math.round((start-this.lastTimeUpdated)/1000)+' sec ###');
		if (this.lastTimeUpdated > 0 && (start-this.lastTimeUpdated)/1000 > this.settings.intervall/1000 + 1) {
			this.log.warn('time intervall '+(start-this.lastTimeUpdated)/1000+' sec');
		}
		this.lastTimeUpdated = start;
		const nextLoop = this.settings.intervall - start % (this.settings.intervall) + start;

		//High Loop
		for (const item of this.inverters) {
			this.modbusClient.setID(item.modbusId);
			this.lastStateUpdatedHigh += await this.state.updateStates(item,this.modbusClient,dataRefreshRate.high,timeLeft(nextLoop));
		}

		if (timeLeft(nextLoop) > 500) {
			await this.state.runProcessHooks(dataRefreshRate.high);
			//Low Loop
			for (const [i,item] of this.inverters.entries()) {
				this.modbusClient.setID(item.modbusId);
				//this.log.debug('+++++ Loop: '+i+' Left Time: '+timeLeft(nextLoop,(i+1)/this.inverters.length)+' Faktor '+((i+1)/this.inverters.length));
				this.lastStateUpdatedLow += await this.state.updateStates(item,this.modbusClient,dataRefreshRate.low,timeLeft(nextLoop,(i+1)/this.inverters.length));
			}
			await this.state.runProcessHooks(dataRefreshRate.low);
		}

		if (this.pollingTimer) this.clearTimeout(this.pollingTimer);
		this.pollingTimer = this.setTimeout(() => {
			this.dataPolling(); //recursiv
		}, timeLeft(nextLoop));
		this.log.debug('### DataPolling STOP ###');
		//this.state.mitnightProcess();
	}

	/**
	 * Is called when adapter shuts down - callback has to be called under any circumstances!
	 * @param {() => void} callback
	 */
	onUnload(callback) {
		try {
			this.pollingTimer && this.clearTimeout(this.pollingTimer);
			this.mitnightTimer && this.clearTimeout(this.mitnightTimer);
			this.watchDogHandle && this.clearInterval(this.watchDogHandle);
			this.modbusClient && this.modbusClient.close();
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