

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
	}

	isOpen() {
		if ( this.client) {
			return (this.client.isOpen );
		} else {
			return false;
		}
	}

	close() {
		return new Promise((resolve,reject) => {
			if (this.isOpen()) {
				this.client.close((err,data) => {
					if (err) reject(err);
					resolve(data);
				} );
			} else {
				resolve({});
			}
		});
	}

	setID(modbusID) {
		this._id = modbusID;
	}

	get id() {
		return this._id;
	}

	async _create() {
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


	async _destroy() {
		return new Promise((resolve,reject) => {
			this.client.destroy((err,data) => {
				if (err) reject(err);
				resolve(data);
			});
		});
	}

	async _checkError(err) {
		this.adapter.log.debug(JSON.stringify(err));
		//|| err.errno == 'ECONNREFUSED'
		if (err.modbusCode == null ) {
			this.adapter.log.debug('modbus client destroyed');
			await this.close();
			//https://github.com/yaacov/node-modbus-serial/issues/96
			//await this._destroy();
			//this.adapter.log.debug('Client destroy!');
			await this._create();
		}
	}


	async connect(repeatCounter = 0) {
		try {
			this.adapter.log.info('Open Connection...');
			await this.close();
			await this.client.setTimeout(5000);
			await this.client.connectTcpRTUBuffered(this.ipAddress, { port: this.port} ); //hang
			await this.delay(1000);
			this.adapter.log.info(`Connected Modbus IP to: ${this.ipAddress} /PORT ${this.port}`);
		} catch(err) {
			this.adapter.log.warn('Couldnt connect Modbus TCP to ' + this.ipAddress + ':' + this.port+' '+err.message);
			await this._checkError(err);
			if (repeatCounter > 0) throw err;
			let delay = 5000;
			if (err.code == 'EHOSTUNREACH') delay *= 4;
			await this.delay(delay);
			await this.connect(repeatCounter+1);
		}
	}


	async readHoldingRegisters(address, length) {
		try {
			await this.open();
			//this.adapter.log.debug('client.setID: '+this._id);
			await this.client.setID(this._id);
			const data = await this.client.readHoldingRegisters(address, length);
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


	delay(ms){
		return new Promise(resolve => setTimeout(resolve, ms));
	}

}

module.exports = ModbusConnect;