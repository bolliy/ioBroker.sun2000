

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
	constructor(adapterInstance,ip,port) {
		super(ip,port);
		this.adapter = adapterInstance;
		this._id = 0;
		this._delay = 0;
		this._maxDelay = 2000; //2 Sec
		this._successCounter = 0;
		this._lastAccess = 0;
	}

	get id() {
		return this._id;
	}

	setID(modbusID) {
		if (this._id != 0 && this._id != modbusID) {
			this._delay = 500;
			this._successCounter = 10;
			this._lastAccess = 0;
		}
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
				//if (err) reject(err);
				resolve({});
			} );
		});
	}

	_destroy() {
		return new Promise((resolve) => {
			this.client.destroy(() => {
				//if (err) reject(err);
				resolve({});
			});
		});
	}

	async _create() {
		// @ts-ignore
		this.client = new ModbusRTU();
		await this.delay(500);
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
		this.adapter.log.debug('modbus client error: '+JSON.stringify(err));
		await this.close();
		if (err.modbusCode == null) {
			this.adapter.log.debug('modbus client destroyed');
			//https://github.com/yaacov/node-modbus-serial/issues/96
			//await this._destroy();
			await this._create();
		}
	}

	async connect(repeatCounter = 0) {
		try {
			this.adapter.log.info('Open Connection...');
			this.isOpen() && await this.close();
			await this.client.setTimeout(5000);
			await this.client.connectTcpRTUBuffered(this.ipAddress, { port: this.port} ); 
			await this.delay(1000);
			this.adapter.log.info(`Connected Modbus IP to: ${this.ipAddress} /PORT ${this.port}`);
		} catch(err) {
			this.adapter.log.warn('Couldnt connect Modbus TCP to ' + this.ipAddress + ':' + this.port+' '+err.message);
			await this._checkError(err);
			if (repeatCounter > 0) throw err;
			let delay = 2000;
			if (err.code == 'EHOSTUNREACH') delay *= 5;
			await this.delay(delay);
			await this.connect(repeatCounter+1);
		}
	}


	async readHoldingRegisters(address, length) {
		try {
			await this.open();
			await this.client.setID(this._id);
			this._waitForDelay();
			const data = await this.client.readHoldingRegisters(address, length);
			this._adjustDelay();
			return data.data;
		} catch (err) {
			//this.adapter.log.warn('Error while readHoldingregister '+err.message);
			await this._checkError(err);
			if (err.errno == 'ETIMEDOUT') this._adjustDelay(false);
			throw err;
		}
	}

	async writeRegisters(address,buffer) {
		try {
			await this.open();
			await this.client.setID(this._id);
			await this.client.writeRegisters(address,buffer);
		} catch (err) {
			await this._checkError(err);
			throw err;
		}
	}

	_adjustDelay(successful=true) {
		if (successful) {
			if (this._successCounter > 3) {
				//reduce
				if (this._delay > 0) this._delay -= Math.round(this._delay/3);
				this._successCounter = 0;
			} else {
				this._successCounter ++;
			}
		} else {
			this._successCounter = 0;
			if (this._delay < this._maxDelay) {
				//increase
				this._delay += Math.round((this._maxDelay - this._delay)/2);
			}
		}
		this._lastAccess = new Date().getTime();
		//this.adapter.log.debug('Delay value '+this._delay);
	}

	async _waitForDelay() {
		const past = new Date().getTime()-this._lastAccess;
		if (past < this._delay) {
			this.adapter.log.info('#### DELAY '+this._delay+' ms, Rest of time to delay: '+(this._delay-past)+' ms');
			this.delay(this._delay-past);
		}
	}

	delay(ms){
		return new Promise(resolve => setTimeout(resolve, ms));
	}

}

module.exports = ModbusConnect;