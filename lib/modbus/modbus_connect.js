
const ModbusRTU = require('modbus-serial');

const testMode = false;

class DeviceInterface {
	constructor (ip, port) {
		this._ip = ip;
		this._port = port;
	}

	get ipAddress() {
		return this._ip;
	}

	get port() {
		return this._port;
	}

}

class ModbusConnect extends DeviceInterface {
	constructor(adapterInstance,options) {
		super(options.address,options.port);
		this.adapter = adapterInstance;
		this._callBack = undefined;
		this._id = 0;
		//https://stackoverflow.com/questions/2851404/what-does-options-options-mean-in-javascript

		options = options || {};
		this._options = {
			timeout : options.modbusTimeout || 10000,
			delay : options.modbusDelay ?? 0,
			connectDelay : options.modbusConnectDelay || 5000,
			modbusAdjust : options.modbusAdjust ?? false,
			min : 0,
			max : 6000,
		};

		this.adapter.log.debug(JSON.stringify(this._options));
		this._stat = {
			successSumCounter : 0,
			errorSumCounter : 0
		};

		this._adjust = {
			successLevel : 0,
			successCounter : 0,
			errorCounter : 0,
			lastLength : 0,
			SuccessDelay : 0,
			ErrorDelay : 0
		};

		// ### TEST ###
		if (testMode) this._options.modbusAdjust = true;
		// ### TEST ###
		if (this._options.modbusAdjust) {
			this._options.timeout = 10000;
			this._options.connectDelay = 5000;
			this._options.delay = 0;
			this.adapter.log.info('Adjustment: It starts for the Modbus connection...');
		}

	}

	setCallback(handler) {
		this._callBack = handler;
	}

	get info() {
		return {...this._options,stat: {...this._stat}, adjust: {...this._adjust}};
	}

	get id() {
		return this._id;
	}

	setID(modbusID) {
		this._id = modbusID;
	}

	isOpen() {
		if ( this.client) {
			return (this.client.isOpen );
		} else {
			return false;
		}
	}

	close() {
		return new Promise((resolve) => {
			if (this.client) {
				this.client.close(() => {
					resolve({});
				});
			} else {
				resolve({});
			}
		});
	}

	//https://github.com/yaacov/node-modbus-serial/issues/96
	_destroy() {
		return new Promise((resolve) => {
			if (this.client) {
				this.client.destroy(() => {
					resolve({});
				});
			} else {
				resolve({});
			}
		});
	}

	async _create() {
		// @ts-ignore
		this.client = new ModbusRTU();
		this.wait(500);
	}


	async open() {
		if (!this.client) {
			await this._create();
		}
		if (!this.isOpen()) {
			await this.connect();
		}
	}

	async _checkError(err) {
		this.adapter.log.debug('Modbus error: '+JSON.stringify(err));
		await this.close();
		if (err.modbusCode === undefined) {
			this._adjustDelay(err,false);
			await this._create();
			if (err.errno === 'ECONNREFUSED' ) {
				this.adapter.log.warn('Has another device interrupted the modbus connection?');
				this.adapter.log.warn('Consider that only 1 client is allowed to connect to modbus at the same time!');
			}
		} else {
			if (err.modbusCode === 6 ) this._adjustDelay(err,false); //Slave device busy
			if (err.modbusCode === 5 ) await this._create();
		}
	}

	async connect(repeatCounter = 0) {
		try {
			this.isOpen() && await this.close();
			this.adapter.log.info('Open Connection...');
			await this.client.setTimeout(this._options.timeout);
			await this.client.connectTcpRTUBuffered(this.ipAddress, { port: this.port} );
			//await this.client.connectTCP(this.ipAddress, { port: this.port} );
			await this.wait(this._options.connectDelay);
			this.adapter.log.info(`Connected Modbus TCP to ${this.ipAddress}:${this.port}`);
			this._adjust.lastLength = 0; // Initialisieren
		} catch(err) {
			this.adapter.log.warn('Couldnt connect Modbus TCP to ' + this.ipAddress + ':' + this.port+' '+err.message);
			await this._checkError(err);
			if (repeatCounter > 0) throw err;
			let delay = 2000;
			if (err.code == 'EHOSTUNREACH') delay *= 10;
			await this.wait(delay);
			await this.connect(repeatCounter+1);
		}
	}


	async readHoldingRegisters(address, length) {
		try {
			await this.open();
			await this.client.setID(this._id);
			await this._delay();
			const data = await this.client.readHoldingRegisters(address, length);
			this._adjust.lastLength = length;
			this._adjustDelay(undefined,true);
			return data.data;
		} catch (err) {
			await this._checkError(err);
			throw err;
		}
	}

	async writeRegisters(address,buffer) {
		try {
			await this.open();
			await this.client.setID(this._id);
			await this._delay();
			await this.client.writeRegisters(address,buffer);
			this._adjust.lastLength = buffer.length;
			this._adjustDelay(undefined,true);
		} catch (err) {
			await this._checkError(err);
			throw err;
		}
	}

	_adjustDelay(err,successful=true) {

		function getGradient(info) {
			if (info.adjust.SuccessDelay > info.adjust.ErrorDelay) {
				const step = Math.round((info.adjust.SuccessDelay - info.adjust.ErrorDelay)*0.75);
				if (step == 0) return 1;
				return step;
			}
			return 0.10*info.max; //10% of max
		}

		function loopEnd(info) {
			if (info.adjust.successLevel >= 10) {
				return ((info.adjust.SuccessDelay - info.adjust.ErrorDelay) < 100);
			}
			return false;
		}
		//### Test ###
		if (testMode) {
			if (this._options.delay  < 5000 && successful) successful = false;
		}
		//### Test ###
		if (successful) {
			if (this._adjust.successCounter >= 5) {
				this._adjust.successCounter = 0; //alle 5 wieder auf 0
				if (this._options.modbusAdjust) {
					this._adjust.SuccessDelay = this._options.delay;
					this._adjust.successLevel ++;
					if (this._adjust.successLevel >= 100 || loopEnd(this.info) ) {
						this._options.modbusAdjust = false; //finished !
						if (this._adjust.successLevel >= 100) {
							this.adapter.log.warn('Adjustment: It failed!');
						} else {
							this._options.modbusAdjust = false; //finished !
							this._options.delay = Math.round(this._adjust.SuccessDelay);
							this.adapter.log.info('Adjustment: It was completed successfully with delay value '+this._options.delay+' ms');
							if (this._callBack) this._callBack(this.info); //fire and forget
						}
					} else {
						this.adapter.log.info('Adjustment: It has reached the step '
										+this._adjust.successLevel+' with delay value '+this._options.delay+' ms');

						//reduce
						if (this._adjust.ErrorDelay > this._options.min && this._adjust.ErrorDelay >= this._adjust.SuccessDelay) {
							this._adjust.successLevel = 0;
							this._adjust.ErrorDelay = this._options.min;
						}
						this._options.delay -= getGradient(this.info);

						//Bleibende Regelabweichnung beseitigen
						if (this._options.delay-50 < this._options.min ) this._options.delay = this._options.min;

						if (this._options.delay*5 < this._options.timeout ) {
							this._options.timeout = this._options.delay*5;
							if (this._options.timeout < 10000) this._options.timeout = 10000;
						}

						if (this._options.Delay*1.5 < this._options.connectDelay) {
							this._options.connectDelay = this._options.Delay*1.5;
							if (this._options.connectDelay < 2000) this._options.connectDelay = 2000;
						}
					}
				}
			}
			this._adjust.errorCounter = 0;
			this._adjust.successCounter ++;
			if (this._stat.successSumCounter < Number.MAX_SAFE_INTEGER) this._stat.successSumCounter ++;

		} else {
			if (this._adjust.errorCounter >= 5 ) {
				this._adjust.errorCounter = 0;
				if (this._options.modbusAdjust) {
					this.adapter.log.warn('Adjustment: It has difficulty calibrating. The current step is '+this._adjust.successLevel);
				}
			}
			if (this._options.modbusAdjust) {
				this._adjust.ErrorDelay = this._options.delay; //letzten Fehler merken

				if (this._options.delay < this._options.max) {
					//increase
					this._options.delay += getGradient(this.info);
				}
				if (this._options.delay*5 > this._options.timeout) {
					this._options.timeout = this._options.delay*5;
				}
				if (this._options.delay*1.5 > this._options.connectDelay) {
					this._options.connectDelay = this._options.delay*1.5;
				}
				if (this._adjust.ErrorDelay < this._options.max && this._adjust.ErrorDelay >= this._adjust.SuccessDelay) {
					this._adjust.successLevel = 0;
					this._adjust.SuccessDelay = this._options.max;
				}
			}
			this._adjust.successCounter = 0;
			this._adjust.errorCounter ++;
			if (this._stat.errorSumCounter < Number.MAX_SAFE_INTEGER) this._stat.errorSumCounter ++;
			if (err) {
				if (err.errno) this._stat[err.errno] ? this._stat[err.errno] ++ : this._stat[err.errno] = 1;
				if (err.modbusCode) this._stat['modbuscode_'+err.modbusCode] ?
					this._stat['modbuscode_'+err.modbusCode] ++ : this._stat['modbuscode_'+err.modbusCode] = 1;
			}
		}
		if (this._options.modbusAdjust) {
			this.adapter.log.debug('### Adjustment: Try to read with the delay value: '+this._options.delay+' ###');
			this.adapter.log.debug('Adjust: '+JSON.stringify(this._adjust));
			//console.log(JSON.stringify(this._options));
		}
	}

	async _delay() {
		if (this._options.delay > 0) {
			//mind 25% werden immer gewartet, der Rest gewichtet
			const dtime = Math.round(this._options.delay*(0.40 + 0.60 * this._adjust.lastLength/50));

			if (dtime > 0) {
				this.adapter.log.debug('Wait... '+dtime+' ms; Read/write bytes before: '+this._adjust.lastLength);
				await this.wait(dtime);
			}
			if (this._options.delay < this._options.min) this._options.delay = this._options.min;
		}
	}

	wait(ms){
		return new Promise(resolve => setTimeout(resolve, ms));
	}

}

module.exports = ModbusConnect;