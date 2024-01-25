

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
		this._to = {
			delay : 100,
			min : 20,
			max : 2000,
			lastAccessTime : 0,
			successCounter : 0,
			minErrorCounter : 9,
			modbusIdChangedDelay : 200,
			modbusIDchanged : false
		};
	}

	get id() {
		return this._id;
	}

	setID(modbusID) {
		this._to.modbusIDchanged = (this.id != 0 && this.id != modbusID);
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
		//await this.delay(500);
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
			this.adapter.log.info('Open Connection...');
			//this.isOpen() && await this.close();
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
			await this._waitForDelay();
			const data = await this.client.readHoldingRegisters(address, length);
			this._adjustDelay();
			return data.data;
		} catch (err) {
			//this.adapter.log.warn('Error while readHoldingregister '+err.message);
			await this._checkError(err);
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
			this._to.successCounter ++;
			if (this._to.successCounter > 1) {
				//reduce
				if (this._to.delay > 0) this._to.delay -= Math.round(this._to.delay/2);
				if (this._to.delay+6 < this._to.min ) this._to.delay = this._to.min;
				this._to.successCounter = 0;
			}
		} else {
			this._to.successCounter = 0;
			if (this._to.delay == this._to.min) {
				this._to.minErrorCounter ++;
				if (this._to.minErrorCounter > 50 && this._to.min < 200 ) {
					this._to.min += this._to.min;
					this._to.minErrorCounter = 0;
				}
			} else {
				this._to.minErrorCounter = 0;
			}

			if (this._to.delay < this._to.max) {
				//increase
				this._to.delay += Math.round((this._to.max - this._to.delay)/2);
			}
		}
		this._to.lastAccessTime = new Date().getTime();
		this._to.modbusIDchanged = false;
		//this.adapter.log.debug('Delay value '+this._delay);
	}

	async _waitForDelay() {
		const past = new Date().getTime()-this._to.lastAccessTime;
		let delay = this._to.delay;

		if (this._to?.modbusIDchanged && delay < this._to?.modbusIdChangedDelay) {
			delay = this._to?.modbusIdChangedDelay;
		}

		if (past < delay) {
			//this.adapter.log.debug('#### DELAY '+delay+' ms, Rest of time to delay: '+(delay-past)+' ms ###');
			this.adapter.log.debug('### delay: '+(delay-past)+' ms\n'+JSON.stringify(this._to)+' ###');
			await this.delay(delay-past);
		}
	}

	delay(ms){
		return new Promise(resolve => setTimeout(resolve, ms));
	}

}

module.exports = ModbusConnect;