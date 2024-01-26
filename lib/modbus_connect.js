

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
		if (!options.modbusDelay === undefined) options.modbusDelay = 50; //ms
		if (!options.modbusTimeout === undefined) options.modbusTimeout = 5000; //ms
		this._to = {
			timeout : options.modbusTimeout,
			delay : options.modbusDelay,
			min : options.modbusDelay,
			max : 2000,
			lastAccessTime : 0,
			successCounter : 0,
			errorCounter : 0,
			modbusIdChangedDelay : options.modbusDelay*3,
		};
	}

	get id() {
		return this._id;
	}

	setID(modbusID) {
		if (this.id != 0 && this.id != modbusID) {
			this._to.delay = this._to.modbusIdChangedDelay;
		}
		//this._to.delay = this._to.modbusIdChangedDelay;
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
		// timeout || modbus is busy
		if (err.errno == 'ETIMEDOUT' || err.modbusCode == 6) {
			this._adjustDelay(false);
		}
		if (err.modbusCode == null) {
			await this.close();
			this.adapter.log.debug('modbus client destroyed');
			//https://github.com/yaacov/node-modbus-serial/issues/96
			//await this._destroy();
			await this._create();
		}
	}

	async connect(repeatCounter = 0) {
		try {
			this.isOpen() && await this.close();
			this.adapter.log.info('Open Connection...');
			await this.client.setTimeout(this._to.timeout);
			//await this.client.connectTcpRTUBuffered(this.ipAddress, { port: this.port} );
			await this.client.connectTCP(this.ipAddress, { port: this.port} );
			await this.delay(2000);
			this.adapter.log.info(`Connected Modbus TCP to ${this.ipAddress}:${this.port}`);
		} catch(err) {
			this.adapter.log.warn('Couldnt connect Modbus TCP to ' + this.ipAddress + ':' + this.port+' '+err.message);
			await this._checkError(err);
			if (repeatCounter > 0) throw err;
			let delay = 2000;
			if (err.code == 'EHOSTUNREACH') delay *= 10;
			await this.delay(delay);
			await this.connect(repeatCounter+1);
		}
	}


	async readHoldingRegisters(address, length) {
		try {
			await this.open();
			await this.client.setID(this._id);
			await this._waitForDelay();
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
			await this._waitForDelay();
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
		}
		this._to.lastAccessTime = new Date().getTime();
		this._to.modbusIDchanged = false;
	}

	async _waitForDelay() {
		const past = new Date().getTime()-this._to.lastAccessTime;
		if (past < this._to.delay) {
			this.adapter.log.debug(JSON.stringify(this._to));
			await this.delay(this._to.delay-past);
		}
	}

	delay(ms){
		return new Promise(resolve => setTimeout(resolve, ms));
	}

}

module.exports = ModbusConnect;