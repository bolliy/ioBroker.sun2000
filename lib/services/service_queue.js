'use strict';

class ServiceQueueMap  {
	constructor (adapterInstance,inverter) {
		this.adapter = adapterInstance;
		this.inverterInfo = inverter;
		this._modbusClient = undefined;
		this._map = new Map();
		this._initialized = false;

		this.serviceFields = [
			{
				state: {id: 'battery.chargeFromGridFunction', name: 'Charge from Grid', type: 'boolean', role: 'value', desc: ''},
				fn: async entry => {
					const data = [0];
					if (entry.value) data[0] = [1];
					return await this._writeRegisters(47087,data);
				}
			},
			{
			}
		];

	}

	async _init() {
		if (this.inverterInfo.instance) {
			for (const item of this.serviceFields) {
				if (item?.state) {
					this._map.set(item.state.id, { field : item , value : null, ack : false });
				}
			}
			for (const entry of this._map.values()) {
				await this._initState(this.inverterInfo.path+'.service.',entry.field.state);
				const state = await this.adapter.getStateAsync(this.inverterInfo.path+'.service.'+entry.field.state.id);
				entry.value = state?.val;
				entry.ack = state?.ack;
			}
			this.adapter.subscribeStates(this.inverterInfo.path+'.service*');
			this._initialized = true;
		}
	}

	get(id) {
		return this._map.get(id);
	}

	set(id, state) {
		const entry = this._map.get(id);
		if (entry && !isNaN(state?.val) && !state?.ack ) {
			this.adapter.log.info(`state: ${id} changed: ${state.val} ack: ${state.ack}`);
			entry.value = state?.val;
			entry.ack = state?.ack;
		}
	}

	values () {
		return this._map.values();
	}

	async process(modbusClient) {
		if (!this._initialized && this.adapter.isConnected) await this._init();

		if (this._initialized) {
			this._modbusClient = modbusClient;

			for (const entry of this._map.values()) {
				if (entry.ack) continue;

				if (entry.value !== null) {
					if (await entry.field.fn(entry)) {
						await this.adapter.setStateAsync(this.inverterInfo.path+'.service.'+entry.field.state.id, {val: entry.value , ack: true});
						entry.ack = true;
					}
				//this.adapter.log.debug('#### '+this.inverterInfo.path+'.service.'+entry.field.state.id+' : '+entry.value);
				}
			}
		}
	}

	async _writeRegisters(reg,data) {
		try {
			this.adapter.log.debug('Try to write data to id/address ' + this._modbusClient.id + '/' + reg+'/'+data);
			await this._modbusClient.writeRegisters(reg,data);
			return true;
		} catch (err) {
			this.adapter.log.warn(`Error while writing to ${this._modbusClient.ipAddress} [Reg: ${reg}, Len: ${data.length}, modbusID: ${this._modbusClient.id}] with: ${err.message}`);
		}
	}

	//state
	async _initState(path, state) {
		await this.adapter.extendObjectAsync(path+state.id, {
			type: 'state',
			common: {
				name: state.name,
				type: state.type,
				role: state.role,
				unit: state.unit,
				desc: state.desc,
				read: true,
				write: true
			},
			native: {}
		});
	}

}

module.exports = ServiceQueueMap;