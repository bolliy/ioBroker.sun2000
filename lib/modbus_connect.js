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

	async open() {
		if (!this.client) this.client = new ModbusRTU();
		if (!this.isOpen()) {
			await this.reConnect();
		}
	}

	async connect() {
		this.lastUpdated = new Date().getTime();
		try {
			await this.close(); //close Port: important in order not to create multiple connections!
			//await this.client.setID(1);
			await this.client.connectTcpRTUBuffered(this.ipAddress, { port: this.port} );
			await this.client.setTimeout(10000);
			this.lastUpdated = 0;
			await this.delay(5000);
			/*
           if (this.isOpen()) {
              this.lostConnection = false;;
           } else {
              this.client = new ModbusRTU();
              throw new Error('Port not open!?');
           }
           */
		} catch (err) {
			this.lastUpdated = 0;
			throw err;
		}
	}

	async reConnect() {
		try {
			this.adapter.log.info('Open Connection...');
			await this.connect();
			this.adapter.log.info(`Connected Modbus IP to: ${this.ipAddress} /PORT ${this.port}`);
		} catch(err) {
			this.adapter.log.warn('Couldnt connect Modbus TCP to ' + this.ipAddress + ':' + this.port+' '+err.message);
			let delay = 10000;
			if (err.code == 'EHOSTUNREACH') delay *= 2;
			await this.delay(delay);
			await this.reConnect();
		}
	}


	async readHoldingRegisters(id,address, length) {
		try {
			await this.open();
			await this.client.setID(id);
			const data = await this.client.readHoldingRegisters(address, length);
			return data.data;
		} catch (err) {
			if (err.modbusCode == null) {
				//this.lostConnection = true;
				this.adapter.log.warn('Lost connection to modbus client!');
			}  else {
				this.adapter.log.warn('Error while readHoldingregister '+JSON.stringify(err));
			}
			throw err;
		}
	}

	async writeRegisters(id,address,buffer) {
		await this.open();
		await this.client.setID(id);
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