'use strict';

/*
 * Created with @iobroker/create-adapter v2.5.0
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require('@iobroker/adapter-core');

// Load your modules here, e.g.:
const Registers = require(__dirname + '/lib/register.js');
const ModbusConnect = require(__dirname + '/lib/modbus/modbus_connect.js');
const ModbusServer = require(__dirname + '/lib/modbus/modbus_server.js');
const {driverClasses,dataRefreshRate} = require(__dirname + '/lib/types.js');
const {Logging,getAstroDate,isSunshine} = require(__dirname + '/lib/tools.js');

class Sun2000 extends utils.Adapter {

	/**
	 * @param {Partial<utils.AdapterOptions>} [options={}]
	 */
	constructor(options) {
		super({
			...options,
			name: 'sun2000',
			useFormatDate: true
		});

		this.lastTimeUpdated = new Date().getTime();
		this.lastStateUpdatedHigh = 0;
		this.lastStateUpdatedLow = 0;
		this.isConnected = false;
		this.isReady = false; //v0.8.x

		this.devices = [];
		this.settings = {
			highInterval : 20000,
			lowInterval : 60000,
			mediumInterval : 30000,
			address : '',
			port : 520,
			modbusTimeout : 10000,
			modbusConnectDelay : 5000,
			modbusDelay : 0,
			modbusAdjust : false,
			ms : {
				address : '0.0.0.0',
				port : 520,
				active : false
			},
			sl: {
				meterId: 11
			},
			sd: {
				active : false,
				sDongleId : 100
			},
			cb: {
				tou : false
			},
			ds: {
				batteryUnits : true,
				batterPacks : false
			}
		};

		//v0.6.
		this.logger = new Logging(this); //only for adapter

		this.on('ready', this.onReady.bind(this));
		this.on('stateChange', this.onStateChange.bind(this));
		// this.on('objectChange', this.onObjectChange.bind(this));
		// this.on('message', this.onMessage.bind(this));
		this.on('unload', this.onUnload.bind(this));
	}

	async initPath() {
		//inverter
		await this.extendObject('meter', {
			type: 'device',
			common: {
				name: 'device meter'
			},
			native: {}
		});
		await this.extendObject('collected', {
			type: 'channel',
			common: {
				name: 'channel collected'
			},
			native: {}
		});

		await this.extendObject('inverter', {
			type: 'device',
			common: {
				name: 'device inverter'
			},
			native: {}
		});

		for (const item of this.devices) {
			if (item.driverClass == driverClasses.inverter) {
				const path = 'inverter.'+item.index.toString();
				item.path = path;
				await this.extendObject(path, {
					type: 'channel',
					common: {
						name: 'channel inverter '+item.index.toString(),
						role: 'indicator'
					},
					native: {}
				});

				await this.extendObject(path+'.grid', {
					type: 'channel',
					common: {
						name: 'channel grid'
					},
					native: {}
				});

				await this.extendObject(path+'.info', {
					type: 'channel',
					common: {
						name: 'channel info',
						role: 'info'
					},
					native: {}
				});
				/*
				await this.extendObject(path+'.battery', {
					type: 'channel',
					common: {
						name: 'channel battery'
					},
					native: {}
				});
				*/
				await this.extendObject(path+'.string', {
					type: 'channel',
					common: {
						name: 'channel string'
					},
					native: {}
				});

				await this.extendObject(path+'.derived', {
					type: 'channel',
					common: {
						name: 'channel derived'
					},
					native: {}
				});
			}

			if (item.driverClass == driverClasses.sdongle) {
				item.path = '';
				await this.extendObject(item.path+'sdongle', {
					type: 'device',
					common: {
						name: 'device SDongle'
					},
					native: {}
				});
			}

			if (item.driverClass == driverClasses.logger) {
				item.path = '';
				await this.extendObject(item.path+'slogger', {
					type: 'device',
					common: {
						name: 'device SmartLogger'
					},
					native: {}
				});
			}
			if (item.driverClass == driverClasses.loggerMeter) {
				item.path = '';
			}

			if (item.driverClass == driverClasses.emma) {
				item.path = '';
				await this.extendObject(item.path+'emma', {
					type: 'device',
					common: {
						name: 'device Emma'
					},
					native: {}
				});
			}

		}
	}

	async StartProcess() {
		await this.initPath();
		this.state = new Registers(this);
		await this.atMidnight();
		if (this.settings.modbusAdjust) {
			this.settings.modbusAdjust = isSunshine(this);
			//this.logger.debug('Sunshine: '+this.settings.modbusAdjust);
		}
		this.modbusClient = new ModbusConnect(this,this.settings);
		this.modbusClient.setCallback(this.endOfmodbusAdjust.bind(this));
		this.dataPolling();
		this.runWatchDog();

		if (this.settings.ms?.active) {
			this.modbusServer = new ModbusServer(this,this.settings.ms.address,this.settings.ms.port);
			this.modbusServer.connect();
		}
	}

	async atMidnight() {
		this.settings.sunrise = getAstroDate(this,'sunrise');
		this.settings.sunset = getAstroDate(this,'sunset');

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

	/*
	sendToSentry (msg)  {
		if (this.supportsFeature && this.supportsFeature('PLUGINS')) {
			const sentryInstance = this.getPluginInstance('sentry');
			if (sentryInstance) {
				const Sentry = sentryInstance.getSentryObject();
				if (Sentry) this.logger.info('send to Sentry value: '+msg);
				Sentry && Sentry.withScope(scope => {
					scope.setLevel('info');
					scope.setExtra('key', 'value');
					Sentry.captureMessage(msg, 'info'); // Level "info"
				});
			}
		}
	}
	*/

	async endOfmodbusAdjust (info) {
		if (!info.modbusAdjust) {
			this.settings.modbusAdjust = info.modbusAdjust;
			this.settings.modbusDelay = Math.round(info.delay);
			//siehe jsonConfig.json
			if (this.settings.modbusDelay > 6000) this.settings.modbusDelay = 6000;
			this.settings.modbusTimeout = Math.round(info.timeout);
			if (this.settings.modbusTimeout > 30000) this.settings.modbusTimeout = 30000;
			if (this.settings.modbusTimeout < 5000) this.settings.modbusTimeout = 5000;
			this.settings.modbusConnectDelay = Math.round(info.connectDelay);
			if (this.settings.modbusConnectDelay > 10000) this.settings.modbusConnectDelay = 10000;
			if (this.settings.modbusConnectDelay < 2000) this.settings.modbusConnectDelay = 2000;
			//orignal Interval
			this.settings.highInterval = this.config.updateInterval*1000;
			this.config.autoAdjust = this.settings.modbusAdjust;
			this.config.connectDelay = this.settings.modbusConnectDelay;
			this.config.delay = this.settings.modbusDelay;
			this.config.timeout = this.settings.modbusTimeout;
			this.updateConfig(this.config); //-> restart
			this.logger.info('New modbus settings are stored.');
			//this.sendToSentry(JSON.stringify(info));
		}
	}

	async adjustInverval () {
		if (this.settings.modbusAdjust) {
			this.settings.highInterval = 10000*this.settings.modbusIds.length;
		} else {
			let minInterval = this.settings.modbusIds.length*this.settings.modbusDelay*2.5; //len*5*delay/2
			if (this.settings.integration > 0) { //SmartLogger
				minInterval += 5000;
			} else {
				for (const device of this.devices) {
					if (device.duration) minInterval += device.duration;
				}
			}
			if (minInterval> this.settings.highInterval) {
				this.settings.highInterval = Math.round(minInterval);
			}
		}
		this.settings.lowInterval = 60000;
		if (this.settings.highInterval > this.settings.lowInterval) {
			this.settings.lowInterval = this.settings.highInterval;
		}
		this.settings.mediumInterval = Math.round(this.settings.lowInterval/2);
		const newHighInterval = Math.round(this.settings.highInterval/1000);
		if (!this.settings.modbusAdjust) {
			if (this.config.updateInterval < newHighInterval) {
				this.logger.warn('The interval is too small. The value has been changed on '+newHighInterval+' sec.');
				this.logger.warn('Please check your configuration!');
			}
		}
		await this.setState('info.modbusUpdateInterval', {val: newHighInterval, ack: true});
	}

	/**
	 * Is called when databases are connected and adapter received configuration.
	 */
	async onReady() {
		// Initialize your adapter here
		// tiemout is now in ms
		if (this.config.timeout <= 10) {
			this.config.timeout = this.config.timeout*1000;
			this.updateConfig(this.config);
		}
		if (this.config.sl_active) { //old Smartlogger
			this.config.sl_active = false;
			this.config.integration = 1;
			this.updateConfig(this.config);
		}
		if (this.config.sd_active) { //SDongle
			this.config.sd_active = false;
			this.updateConfig(this.config);
		}

		await this.setState('info.ip', {val: this.config.address, ack: true});
		await this.setState('info.port', {val: this.config.port, ack: true});
		await this.setState('info.modbusIds', {val: this.config.modbusIds, ack: true});
		await this.setState('info.modbusTimeout', {val: this.config.timeout, ack: true});
		await this.setState('info.modbusConnectDelay', {val: this.config.connectDelay, ack: true});
		await this.setState('info.modbusDelay', {val: this.config.delay, ack: true});
		await this.setState('info.modbusTcpServer', {val: this.config.ms_active, ack: true});
		// Load user settings
		if (this.config.address != '' && this.config.port > 0 && this.config.modbusIds != '' && this.config.updateInterval > 0 ) {
			this.settings.address = this.config.address;
			this.settings.port = this.config.port;
			this.settings.modbusTimeout = this.config.timeout; //ms
			this.settings.modbusDelay = this.config.delay; //ms
			this.settings.modbusConnectDelay = this.config.connectDelay; //ms
			this.settings.modbusAdjust = this.config.autoAdjust;
			this.settings.modbusIds = this.config.modbusIds.split(',').map((n) => {return Number(n);});
			//SmartDongle
			this.settings.sd.active = this.config.sd_active;
			this.settings.sd.sDongleId = Number(this.config.sDongleId) ?? 0;
			if (this.settings.sd.sDongleId < 0 || this.settings.sd.sDongleId >= 255) this.settings.sd.active = false;
			this.settings.highInterval = this.config.updateInterval*1000; //ms
			//Modbus-Proxy
			this.settings.ms.address = this.config.ms_address;
			this.settings.ms.port = this.config.ms_port;
			this.settings.ms.active = this.config.ms_active;
			this.settings.ms.log = this.config.ms_log;
			//SmartLogger
			//this.settings.sl.active = this.config.sl_active;
			this.settings.integration = this.config.integration;
			this.settings.sl.meterId = this.config.sl_meterId;
			//battery charge control
			this.settings.cb.tou = this.config.cb_tou;
			//further battery register
			this.settings.ds.batteryUnits = this.config.ds_bu;
			this.settings.ds.batteryPacks = this.config.ds_bp;


			if (this.settings.modbusAdjust) {
				await this.setState('info.JSONhealth', {val: '{message: "Adjust modbus settings"}', ack: true});
			} else {
				await this.setState('info.JSONhealth', {val: '{message : "Information is collected"}', ack: true});
			}

			if (this.settings.modbusIds.length > 0 && this.settings.modbusIds.length < 6) {
				//ES6 use a for (const [index, item] of array.entries()) of loop
				for (const [i,id] of this.settings.modbusIds.entries()) {
					this.devices.push({
						index: i,
						duration: 5000,
						modbusId: id,
						driverClass: driverClasses.inverter,
						meter: (i==0 && this.settings.integration === 0)
					});
				}
				//SmartLogger
				if (this.settings.integration === 1) {
					this.devices.push({
						index: 0,
						duration: 0,
						modbusId: 0,
						driverClass: driverClasses.logger
					});
					if (this.settings.sl.meterId > 0) {
						this.devices.push({
							index: 0,
							duration: 0,
							meter : true,
							modbusId: this.settings.sl.meterId,
							driverClass: driverClasses.loggerMeter
						});
					}
				}

				//Emma
				if (this.settings.integration === 2) {
					this.devices.push({
						index: 0,
						duration: 0,
						//modbusId: 1,
						modbusId: 0,
						meter : true,
						driverClass: driverClasses.emma
					});
				}

				//SDongle
				if (this.settings.sd.active) {
					this.devices.push({
						index: 0,
						duration: 0,
						modbusId: this.settings.sd.sDongleId,
						driverClass: driverClasses.sdongle
					});
				}

				await this.adjustInverval();
				await this.StartProcess();
			} else {
				this.adapterDisable('*** Adapter deactivated, can\'t parse modbusIds! ***');
			}
		} else {
			this.adapterDisable('*** Adapter deactivated, Adapter Settings incomplete! ***');
		}
	}

	async dataPolling() {
		function timeLeft(target,factor =1) {
			const left = Math.round((target - new Date().getTime())*factor);
			if (left < 0) return 0;
			return left;
		}

		const start = new Date().getTime();
		this.logger.debug('### DataPolling START '+ Math.round((start-this.lastTimeUpdated)/1000)+' sec ###');
		if (this.lastTimeUpdated > 0 && (start-this.lastTimeUpdated)/1000 > this.settings.highInterval/1000 + 1) {
			this.logger.debug('Interval '+(start-this.lastTimeUpdated)/1000+' sec');
		}
		this.lastTimeUpdated = start;
		const nextLoop = this.settings.highInterval - start % (this.settings.highInterval) + start;

		//High Loop
		for (const item of this.devices) {
			this.lastStateUpdatedHigh += await this.state.updateStates(item,this.modbusClient,dataRefreshRate.high,timeLeft(nextLoop));
		}
		await this.state.runPostProcessHooks(dataRefreshRate.high);

		if (timeLeft(nextLoop) > 0) {
			//Low Loop
			for (const [i,item] of this.devices.entries()) {
				//this.log.debug('+++++ Loop: '+i+' Left Time: '+timeLeft(nextLoop,(i+1)/this.devices.length)+' Faktor '+((i+1)/this.devices.length));
				this.lastStateUpdatedLow += await this.state.updateStates(item,this.modbusClient,dataRefreshRate.low,timeLeft(nextLoop,(i+1)/this.devices.length));
			}
		}
		await this.state.runPostProcessHooks(dataRefreshRate.low);

		if (this.pollingTimer) this.clearTimeout(this.pollingTimer);
		this.pollingTimer = this.setTimeout(() => {
			this.dataPolling(); //recursiv
		}, timeLeft(nextLoop));
		this.logger.debug('### DataPolling STOP ###');
	}

	runWatchDog() {
		this.watchDogHandle && this.clearInterval(this.watchDogHandle);
		this.watchDogHandle = this.setInterval( () => {
			const sinceLastUpdate = new Date().getTime() - this.lastTimeUpdated; //ms
			this.logger.debug('### Watchdog: time since last update '+sinceLastUpdate/1000+' sec');
			const lastIsConnected = this.isConnected;
			this.isConnected = this.lastStateUpdatedHigh > 0 && sinceLastUpdate < this.settings.highInterval*3;
			if (this.isConnected !== lastIsConnected ) this.setState('info.connection', this.isConnected, true);
			if (!this.settings.modbusAdjust) {
				if (!this.isConnected) {
					this.setState('info.JSONhealth', {val: '{errno:1, message: "Can\'t connect to inverter"}', ack: true});
				}
				const ret = this.state.CheckReadError(this.settings.lowInterval*2);
				const obj = {...ret,modbus: {...this.modbusClient.info}};
				this.logger.debug(JSON.stringify(this.modbusClient.info));
				//v0.8.x
				if (!this.isReady) this.isReady = this.isConnected && !ret.errno;
				// after 2 Minutes
				if (this.alreadyRunWatchDog) {
					if (ret.errno) this.logger.warn(ret.message);
					this.setState('info.JSONhealth', {val: JSON.stringify(obj), ack: true});
					if (this.modbusServer) {
						!this.modbusServer.isConnected && this.modbusServer.connect();
						if (this.settings.ms.log) {
							//const stat = this.modbusServer.info?.stat;
							//object is not empty
							//if (Object.keys(stat).length > 0) this.log.info('Modbus tcp server: '+JSON.stringify(this.modbusServer.info));
							this.logger.info('Modbus tcp server: '+JSON.stringify(this.modbusServer.info));
						}
					}
				}
			}

			if (!this.alreadyRunWatchDog) this.alreadyRunWatchDog = true;
			this.lastStateUpdatedLow = 0;
			this.lastStateUpdatedHigh = 0;

			if (sinceLastUpdate > this.settings.highInterval*10) {
				this.setState('info.JSONhealth', {val: '{errno:2, message: "Internal loop error"}', ack: true});
				this.logger.warn('watchdog: restart Adapter...');
				this.restart();
			}

		},this.settings.lowInterval);
	}

	adapterDisable(errMsg) {
		this.logger.error(errMsg);
		this.setForeignState('system.adapter.' + this.namespace + '.alive', false);
	}

	/**
	 * Is called when adapter shuts down - callback has to be called under any circumstances!
	 * @param {() => void} callback
	 */
	onUnload(callback) {
		try {
			this.logger.info('cleaned everything up...');
			this.modbusServer && this.modbusServer.close();
			this.pollingTimer && this.clearTimeout(this.pollingTimer);
			this.mitnightTimer && this.clearTimeout(this.mitnightTimer);
			this.watchDogHandle && this.clearInterval(this.watchDogHandle);
			this.modbusClient && this.modbusClient.close();
			this.setState('info.connection', false, true);
			callback();
		} catch (e) {
			callback();
		}
	}

	/**
	 * Is called if a subscribed state changes
	 * @param {string} id
	 * @param {ioBroker.State | null | undefined} state
	 **/

	onStateChange(id, state) {
		if (state) {
			// The state was changed
			// sun2000.0.inverter.0.control
			const idArray = id.split('.');
			if ( idArray[2] == 'inverter' ) {
				const control = this.devices[Number(idArray[3])].instance.control;
				if (control) {
					let serviceId = idArray[5];
					for (let i=6 ; i < idArray.length; i++ ) serviceId += '.'+idArray[i];
					control.set(serviceId,state);
				}
				//this.log.info(`### state ${id} changed: ${state.val} (ack = ${state.ack})`);
			}
		} else {
			// The state was deleted
			this.logger.info(`state ${id} deleted`);
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