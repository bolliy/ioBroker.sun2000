const crypto = require('node:crypto');
const tools = require(`${__dirname}/tools.js`);

class Telemetry {
	constructor(adapter) {
		this.adapter = adapter;
		this.endpoint = 'https://tkomtdhjfwwcldrtuphi.supabase.co/rest/v1/stats';
		this.apiKey = 'sb_publishable_ZGcxyz_OcDzP4gw4uRLDTQ_7QSR9wVx';
		this.enabled = adapter.config.telemetryEnabled === true;
		this.interval = 24 * 60 * 60 * 1000; // 24h
		//this.enabled = false; // Telemetrie vorerst deaktivieren
	}

	async init() {
		

		await tools.initState(this.adapter, 'telemetry.UIID', { name: 'UUID', type: 'text', role: 'text' });

		this.uuid = await this.adapter.getForeignState('system.meta.uiid').val;
		if (!this.uuid) {
			this.adapter.log.warn('Cannot get system UUID, telemetry will be disabled');
			this.enabled = false;
			return;
		}

		// UUID erzeugen falls nicht vorhanden
		if (!this.adapter.config.uuid) {
			this.adapter.config.uuid = crypto.randomUUID();
			await this.adapter.updateConfig(this.adapter.config);
		}
		if (!this.enabled) return;

		// einmal beim Start senden
		this.send();

		// dann regelmäßig
		this.timer = setInterval(() => this.send(), this.interval);
	}

	buildPayload() {
		return {
			user_id: this.adapter.config.uuid,
			inverter_count: this.adapter.config.inverters?.length || 0,
			modbus_proxy: !!this.adapter.config.modbusProxyEnabled,
			adapter_version: this.adapter.common.version,
		};
	}

	async send() {
		try {
			if (!this.enabled) return;
			const payload = this.buildPayload();

			this.lastHash = this.adapter.config.lastTelemetryHash || null;
			const hash = crypto.createHash('sha1').update(JSON.stringify(payload)).digest('hex');
			if (hash === this.lastHash) return;
			this.adapter.config.lastTelemetryHash = hash;
			//this.adapter.updateConfig(this.adapter.config);
			this.lastHash = hash;

			const controller = new AbortController();
			setTimeout(() => controller.abort(), 3000);

			await fetch(this.endpoint, {
				signal: controller.signal,
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					apikey: this.apiKey,
					Authorization: `Bearer ${this.apiKey}`,
				},
				body: JSON.stringify(payload),
			});

			this.adapter.log.debug('Telemetry sent');
		} catch (e) {
			// wichtig: niemals crashen
			this.adapter.log.debug(`Telemetry failed: ${e.message}`);
		}
	}

	stop() {
		if (this.timer) clearInterval(this.timer);
	}
}

module.exports = Telemetry;
