// @ts-nocheck

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
		this.lastErrno = 0;
		//this.runWatchDog();
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
		this.id = modbusID;
	}

	async create() {
		this.client = new ModbusRTU();
		await this.delay(1000);
	}

	async open() {
		if (!this.client) {
			await this.create();
		}
		if (!this.isOpen()) {
			await this.connect();
		}
	}

	async destroy() {
		this.adapter.log.warn('Destroy modbus client!');
		if (this.client) await this.close();
	}

	async connectTCP() {
		this.lastUpdated = new Date().getTime();
		try {
			await this.close();
			//await this.client.setID(this.clientID);
			await this.client.setTimeout(5000);
			await this.client.connectTcpRTUBuffered(this.ipAddress, { port: this.port} );
			this.lastUpdated = 0;
			await this.delay(1000);
		} catch (err) {
			this.lastUpdated = 0;
			throw err;
		}
	}

	async connect() {
		try {
			this.adapter.log.info('Open Connection...');
			await this.connectTCP();
			this.adapter.log.info(`Connected Modbus IP to: ${this.ipAddress} /PORT ${this.port}`);
		} catch(err) {
			this.adapter.log.warn('Couldnt connect Modbus TCP to ' + this.ipAddress + ':' + this.port+' '+err.message);
			let delay = 10000;
			if (err.code == 'EHOSTUNREACH') delay *= 2;
			await this.delay(delay);
			if (err.modbusCode == null) await this.destroy();
			await this.connect();
		}
	}


	async readHoldingRegisters(address, length) {
		try {
			await this.open();
			await this.client.setID(this.id);
			const data = await this.client.readHoldingRegisters(address, length);
			return data.data;
		} catch (err) {
			//this.adapter.log.warn(err.errno);
			if (err.modbusCode == null) {
				this.lostConnection = true;
				await this.destroy();
				this.adapter.log.warn('Lost connection to modbus client! ');
			}  else {
				this.adapter.log.warn('Error while readHoldingregister '+JSON.stringify(err));
			}
			throw err;
		}
	}

	async writeRegisters(address,buffer) {
		await this.open();
		await this.client.setID(this.id);
		await this.client.writeRegisters(address,buffer);
	}

	runWatchDog() {
		this.watchDogHandle && this.adapter.clearInterval(this.watchDogHandle);
		this.adapter.log.info('Start watchdog...');
		this.watchDogHandle = this.adapter.setInterval( () => {
			if (!this.lastUpdated) this.lastUpdated = 0;
			if (this.lastUpdated > 0) {
				const sinceLastUpdate = (new Date().getTime() - this.lastUpdated);
				//this.adapter.log.debug('Watchdog: time to last update '+sinceLastUpdate/1000+' sec');
				if (sinceLastUpdate > 10000) {
					this.adapter.log.warn('watchdog: restart modbus Client ...');
					try {
						if (this.client)  {
							this.client.close();
							this.client = new ModbusRTU();
							this.lastUpdated = new Date().getTime();
						}
					} catch {
						this.adapter.log.info('modbusClient already closed!');
					}
				}
			}
		},10000);
	}


	delay(ms){
		return new Promise(resolve => setTimeout(resolve, ms));
	}

}

module.exports = ModbusConnect;