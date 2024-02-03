
const ModbusRTU = require('modbus-serial');

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
		this._id = 0;
		if (options.modbusDelay === undefined) options.modbusDelay = 50; //ms
		//nullish coalescing Operator (??)
		this._to = {
			timeout : options?.modbusTimeout ?? 5000,
			delay : 0,
			connectDelay : options?.modbusConnectDelay ?? 2000,
			min : options.modbusDelay,
			max : options.modbusDelay+1000,
			lastAccessTime : 0,
			successCounter : 0,
			errorCounter : 0
		};
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
			this.client.close(() => {
				resolve({});
			} );
		});
	}

	//https://github.com/yaacov/node-modbus-serial/issues/96
	_destroy() {
		return new Promise((resolve) => {
			this.client.destroy(() => {
				resolve({});
			});
		});
	}

	async _create() {
		// @ts-ignore
		this.client = new ModbusRTU();
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
		//if (err.code == 'EHOSTUNREACH') delay *= 10;

		if (err.modbusCode === undefined) {
			if (err.errno == 'ETIMEDOUT' ) {
				let msg = 'Has another device interrupted the connection?';
				this._adjustDelay(false); //increase delay
				if (this._to.delay < 5000) {
					msg += (' If it doesn\'t apply, increase the delay value.');
				}
				this.adapter.log.warn(msg);
			}
			await this.close();
			await this._create();
		} else {
			if (err.modbusCode == 6) this._adjustDelay(false); //busy
		}

	}

	async connect(repeatCounter = 0) {
		try {
			this.isOpen() && await this.close();
			this.adapter.log.info('Open Connection...');
			await this.client.setTimeout(this._to.timeout);
			await this.client.connectTcpRTUBuffered(this.ipAddress, { port: this.port} );
			//await this.client.connectTCP(this.ipAddress, { port: this.port} );
			await this.wait(this._to.connectDelay);
			this._to.delay = 0;
			this.adapter.log.info(`Connected Modbus TCP to ${this.ipAddress}:${this.port}`);
		} catch(err) {
			if (this.adapter.settings.preventWarnings){
				this.adapter.log.info('Couldnt connect Modbus TCP to ' + this.ipAddress + ':' + this.port+' '+err.message);
			} else {
				this.adapter.log.warn('Couldnt connect Modbus TCP to ' + this.ipAddress + ':' + this.port+' '+err.message);
			}
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
			this._adjustDelay();
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
			this._adjustDelay();
		} catch (err) {
			await this._checkError(err);
			throw err;
		}
	}

	_adjustDelay(successful=true) {
		if (successful) {
			//reduce
			if (this._to.delay > this._to.min ) {
				this._to.delay -= Math.round(this._to.delay/2);
			}
			//Bleibende Regelabweichnung beseitigen
			if (this._to.delay+5 < this._to.min ) this._to.delay = this._to.min;

			this._to.successCounter ++;
			this._to.errorCounter = 0;

		} else {
			if (this._to.delay < this._to.max) {
				//increase
				this._to.delay += Math.round((this._to.max - this._to.delay)/2);
			}
			this._to.errorCounter ++;
			this._to.successCounter = 0;
			this.adapter.log.debug(JSON.stringify(this._to));
		}
		//this._to.lastAccessTime = new Date().getTime();
	}

	async _delay() {
		if (this._to.delay > 0 ) {
			await this.wait(this._to.delay);
		} else {
			this._to.delay = this._to.min;
		}
	}

	wait(ms){
		return new Promise(resolve => setTimeout(resolve, ms));
	}

}

module.exports = ModbusConnect;