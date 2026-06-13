'use strict';

/**
 * statistics.js
 *
 * Prepares statistical data from historical Huawei SUN2000 inverter states.
 * Aggregates raw values into time-based datasets (hourly, daily, monthly, yearly)
 * for analysis and visualisation via ioBroker.flexcharts.
 *
 * Consumption breakdown (splitting the total consumption into user-defined
 * sub-categories) is fully delegated to:
 *   lib/statistics/consumptionBreakdown.js  – config, validation, foreign-state refresh
 *   lib/statistics/breakdownChartHelper.js  – eCharts series / legend / placeholder helpers
 *
 * Live chart:
 *   Uses this.liveStats data
 *   Every this.adapter.settings.statistics.liveInterval the kWh delta is converted to average kW:
 *     kW = ΔkWh * (60 / this.adapter.settings.statistics.liveInterval)
 *   Data is retained for 48 h, then cleared.
 */

const stringify = require('javascript-stringify').stringify;
const { dataRefreshRate, statisticsType } = require(`${__dirname}/../types.js`);
const tools = require(`${__dirname}/../tools.js`);
const { stringifyWithFunctions, reviveFunctions } = require(`${__dirname}/../json_helper.js`);
const { ConsumptionBreakdown } = require(`${__dirname}/consumptionBreakdown.js`);
const chartHelper = require(`${__dirname}/breakdownChartHelper.js`);

// ---------------------------------------------------------------------------
// Chart types handled by this module
// ---------------------------------------------------------------------------
// [LIVE] 'live' added
const CHART_TYPES = ['live', 'hourly', 'daily', 'weekly', 'monthly', 'annual'];

const CHART_STATE_IDS = {
	// [LIVE] added
	live: 'statistics.jsonLive',
	hourly: 'statistics.jsonHourly',
	daily: 'statistics.jsonDaily',
	weekly: 'statistics.jsonWeekly',
	monthly: 'statistics.jsonMonthly',
	annual: 'statistics.jsonAnnual',
};

// ---------------------------------------------------------------------------
// [LIVE] Live chart configuration
// Interval in minutes — controls both the timer and the kW conversion factor.
// kW = ΔkWh * (60 / this.adapter.settings.statistics.liveInterval)
// ---------------------------------------------------------------------------
const LIVE_RETENTION_HOURS = 48; // entries older than this are dropped

// ---------------------------------------------------------------------------
// Class
// ---------------------------------------------------------------------------

class statistics {
	constructor(adapterInstance, stateCache) {
		this.adapter = adapterInstance;
		this.stateCache = stateCache;
		this.taskTimer = null;
		// [LIVE]
		this._liveTimer = null;
		this._path = 'statistics';
		this._initialized = false;
		this.testing = false;

		// Built-in stats processed by the calculation pipeline
		this.stats = [
			{ sourceId: 'collected.consumptionToday', targetPath: 'consumption', unit: 'kWh', type: statisticsType.deltaReset },
			{ sourceId: 'collected.dailySolarYield', targetPath: 'solarYield', unit: 'kWh', type: statisticsType.deltaReset },
			{ sourceId: 'collected.dailyInputYield', targetPath: 'inputYield', unit: 'kWh', type: statisticsType.deltaReset },
			{ sourceId: 'collected.dailyExternalYield', targetPath: 'externalYield', unit: 'kWh', type: statisticsType.deltaReset },
			{ sourceId: 'collected.dailyEnergyYield', targetPath: 'energyYield', unit: 'kWh', type: statisticsType.deltaReset },
			{ sourceId: 'collected.SOC', targetPath: 'SOC', unit: '%', type: statisticsType.level },
			{ sourceId: 'collected.currentDayChargeCapacity', targetPath: 'chargeCapacity', unit: 'kWh', type: statisticsType.deltaReset },
			{ sourceId: 'collected.currentDayDischargeCapacity', targetPath: 'dischargeCapacity', unit: 'kWh', type: statisticsType.deltaReset },
			{ sourceId: 'collected.gridExportToday', targetPath: 'gridExport', unit: 'kWh', type: statisticsType.deltaReset },
			{ sourceId: 'collected.gridImportToday', targetPath: 'gridImport', unit: 'kWh', type: statisticsType.deltaReset },
			// --- Computed ---
			{
				targetPath: 'selfSufficiency',
				unit: '%',
				type: statisticsType.computed,
				compute: entry => {
					const consumption = entry.consumption?.total ?? entry.consumption?.value ?? 0;
					const gridImport = entry.gridImport?.total ?? entry.gridImport?.value ?? 0;
					if (consumption <= 0) return 100;
					return Math.round(Math.max(0, Math.min(100, (1 - gridImport / consumption) * 100)) * 10) / 10;
				},
			},
			{
				targetPath: 'selfConsumption',
				unit: '%',
				type: statisticsType.computed,
				compute: entry => {
					let solarYield = entry.solarYield?.total ?? entry.solarYield?.value ?? 0;
					solarYield += entry.externalYield?.total ?? entry.externalYield?.value ?? 0;
					const gridExport = entry.gridExport?.total ?? entry.gridExport?.value ?? 0;
					if (solarYield <= 0) return 0;
					return Math.round(Math.max(0, Math.min(100, (1 - gridExport / solarYield) * 100)) * 10) / 10;
				},
			},
		];

		this.liveStats = [
			{ sourceId: 'collected.sumDaily.houseConsumption', targetPath: 'consumption', unit: 'kWh', type: statisticsType.deltaReset },
			{ sourceId: 'collected.dailySolarYield', targetPath: 'solarYield', unit: 'kWh', type: statisticsType.deltaReset },
			{ sourceId: 'collected.sumDaily.inputPower', targetPath: 'inputYield', unit: 'kWh', type: statisticsType.deltaReset },
			{ sourceId: 'collected.dailyExternalYield', targetPath: 'externalYield', unit: 'kWh', type: statisticsType.deltaReset },
			{ sourceId: 'collected.dailyEnergyYield', targetPath: 'energyYield', unit: 'kWh', type: statisticsType.deltaReset },
			{ sourceId: 'collected.SOC', targetPath: 'SOC', unit: '%', type: statisticsType.level },
			{ sourceId: 'collected.sumDaily.chargePower', targetPath: 'chargeCapacity', unit: 'kWh', type: statisticsType.deltaReset },
			{ sourceId: 'collected.sumDaily.dischargePower', targetPath: 'dischargeCapacity', unit: 'kWh', type: statisticsType.deltaReset },
			{ sourceId: 'collected.sumDaily.feed-outPower', targetPath: 'gridImport', unit: 'kWh', type: statisticsType.deltaReset },
			{ sourceId: 'collected.sumDaily.feed-inPower', targetPath: 'gridExport', unit: 'kWh', type: statisticsType.deltaReset },
			// --- Computed ---
			{
				targetPath: 'selfSufficiency',
				unit: '%',
				type: statisticsType.computed,
				compute: entry => {
					const consumption = entry.consumption?.total ?? entry.consumption?.value ?? 0;
					const gridImport = entry.gridImport?.total ?? entry.gridImport?.value ?? 0;
					if (consumption <= 0) return 100;
					return Math.round(Math.max(0, Math.min(100, (1 - gridImport / consumption) * 100)) * 10) / 10;
				},
			},
			{
				targetPath: 'selfConsumption',
				unit: '%',
				type: statisticsType.computed,
				compute: entry => {
					let solarYield = entry.solarYield?.total ?? entry.solarYield?.value ?? 0;
					solarYield += entry.externalYield?.total ?? entry.externalYield?.value ?? 0;
					const gridExport = entry.gridExport?.total ?? entry.gridExport?.value ?? 0;
					if (solarYield <= 0) return 0;
					return Math.round(Math.max(0, Math.min(100, (1 - gridExport / solarYield) * 100)) * 10) / 10;
				},
			},
		];

		// Instantiate the breakdown manager.
		// builtinPaths is passed so the manager can detect targetPath collisions.
		const builtinPaths = this.stats.map(s => s.targetPath);
		this._breakdown = new ConsumptionBreakdown(adapterInstance, stateCache, builtinPaths);

		// ioBroker state definitions registered via postProcessHooks
		this.postProcessHooks = [
			{
				refresh: dataRefreshRate.low,
				states: [
					// [LIVE] state definitions
					{
						id: 'statistics.jsonLive',
						name: 'Live power JSON',
						type: 'string',
						role: 'json',
						desc: `Live power (kW) chart data, ${this.adapter.settings.statistics.liveInterval}-min intervals, 48 h retention`,
						initVal: '[]',
					},
					{
						id: 'statistics.jsonHourly',
						name: 'Hourly consumption JSON',
						type: 'string',
						role: 'json',
						desc: 'Hourly consumption for last and current day per full hour',
						initVal: '[]',
					},
					{
						id: 'statistics.jsonDaily',
						name: 'Daily consumption JSON',
						type: 'string',
						role: 'json',
						desc: 'Daily consumption for current month per day',
						initVal: '[]',
					},
					{
						id: 'statistics.jsonWeekly',
						name: 'Weekly consumption JSON',
						type: 'string',
						role: 'json',
						desc: 'Weekly consumption for current year per week',
						initVal: '[]',
					},
					{
						id: 'statistics.jsonMonthly',
						name: 'Monthly consumption JSON',
						type: 'string',
						role: 'json',
						desc: 'Monthly consumption for current year per month',
						initVal: '[]',
					},
					{
						id: 'statistics.jsonAnnual',
						name: 'Annual consumption JSON',
						type: 'string',
						role: 'json',
						desc: 'Annual consumption per year',
						initVal: '[]',
					},
					{
						id: 'statistics.jsonToday',
						name: 'Today summary',
						type: 'string',
						role: 'json',
						desc: "Live summary of today's energy values",
						initVal: '{}',
					},

					// Breakdown config state — definition provided by sub-module
					this._breakdown.stateDef,

					// Chart templates (user-writable, one per chart type)
					...CHART_TYPES.map(t => ({
						id: `statistics.flexCharts.template.${t}`,
						name: `Flexcharts template ${t}`,
						type: 'string',
						role: 'json',
						desc: `Optional eCharts template for ${t} chart. Leave empty {} for built-in layout.`,
						write: true,
						initVal: '{}',
					})),

					// Chart output states (read-only, written by this module)
					...CHART_TYPES.map(t => ({
						id: `statistics.flexCharts.jsonOutput.${t}`,
						name: `Flexcharts output ${t}`,
						type: 'string',
						role: 'json',
						desc: `ECharts configuration for ${t} chart`,
						initVal: '{}',
					})),
				],
			},
		];

		this.initialize();
	}

	get processHooks() {
		return this.postProcessHooks;
	}

	// -------------------------------------------------------------------------
	// Effective stats: built-in + breakdown entries (unified pipeline interface)
	// -------------------------------------------------------------------------

	/**
	 * Merges this.stats with the breakdown's stats-shaped entries so all
	 * calculation code iterates a single array transparently.
	 *
	 * @returns {Array}
	 */
	_effectiveStats() {
		return [...this.stats, ...this._breakdown.statsEntries];
	}

	_effectiveLiveStats() {
		return [...this.liveStats, ...this._breakdown.statsEntries];
	}

	// -------------------------------------------------------------------------
	// Date helpers
	// -------------------------------------------------------------------------

	_localIsoWithOffset(d) {
		const pad = n => String(n).padStart(2, '0');
		const tzOffset = -d.getTimezoneOffset();
		const sign = tzOffset >= 0 ? '+' : '-';
		const absMin = Math.abs(tzOffset);
		return (
			`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
			`T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.000` +
			`${sign}${pad(Math.floor(absMin / 60))}:${pad(absMin % 60)}`
		);
	}

	// -------------------------------------------------------------------------
	// Core calculation helpers
	// -------------------------------------------------------------------------

	/**
	 * Appends a new data-point (periodStart → periodEnde) to the JSON array
	 * stored in stateId. Breakdown entries are included because _effectiveStats()
	 * returns them alongside the built-in stats.
	 *
	 * @param {string} stateId
	 * @param {Date}   periodStart
	 * @param {Date}   periodEnde
	 * @param {Array}  effectiveStats
	 * @returns {boolean} true if an entry was appended
	 */
	_calculateGeneric(stateId, periodStart, periodEnde, effectiveStats = this._effectiveStats()) {
		const toStr = this._localIsoWithOffset(periodEnde);

		let arr = [];
		try {
			arr = JSON.parse(this.stateCache.get(stateId)?.value ?? '[]');
			if (!Array.isArray(arr)) arr = [];
		} catch {
			arr = [];
		}

		let fromDate = periodStart;
		let last = {};
		if (arr.length > 0) {
			last = arr[arr.length - 1];
			if (last.to === toStr) return false;
			const lastToDate = new Date(last.to);
			const toDate = new Date(toStr);
			if (lastToDate >= periodStart || toDate <= periodStart) fromDate = lastToDate;
		}

		const entry = { from: this._localIsoWithOffset(fromDate), to: toStr };

		// Pass 1: delta / level stats (built-in + breakdown)
		for (const stat of effectiveStats) {
			if (stat.type === statisticsType.computed) continue;

			const source = Math.round((Number(this.stateCache.get(stat.sourceId)?.value ?? 0) + Number.EPSILON) * 1000) / 1000;
			if (source === null || source === undefined) {
				if (!stat._isBreakdown) this.adapter.logger.debug(`Source state ${stat.sourceId} not found statistic hook`);
				continue;
			}
			let value = source;
			if (stat.type === statisticsType.delta || stat.type === statisticsType.deltaReset) {
				if (last[stat.targetPath]?.total === undefined) {
					this.adapter.logger.debug(`No total value for ${stat.targetPath} in last entry, delta set to 0`);
					value = 0;
				} else {
					const lastTotal = Number(last[stat.targetPath]?.total ?? 0);
					if (stat.type === statisticsType.deltaReset) {
						// Handle resets: If the new value is significantly lower than the last total value, a reset has likely occurred. Otherwise, the difference relative to the last total value is treated as consumption.
						if (value > lastTotal * 0.8) {
							value -= lastTotal;
						}
					} else {
						value -= lastTotal;
					}
				}
				/*	
				if (stat.type === statisticsType.deltaReset) {
					if (fromDate.getTime() !== periodStart.getTime()) value -= lastTotal;
				} else {
					if (last[stat.targetPath]?.total === undefined) {
						this.adapter.logger.debug(`No total value for ${stat.targetPath} in last entry, delta set to 0`);
						value = 0;
					} else {
						value -= lastTotal;
					}
				}
				*/
			}
			//value = Math.round((Number(value) + Number.EPSILON) * 1000) / 1000;
			entry[stat.targetPath] = { value: Number(value.toFixed(3)) };
			if (stat.type === statisticsType.delta || stat.type === statisticsType.deltaReset) {
				entry[stat.targetPath].total = Number(source.toFixed(3));
			}
			entry[stat.targetPath].unit = stat.unit || 'kWh';
		}

		// Pass 2: computed stats
		for (const stat of effectiveStats) {
			if (stat.type !== statisticsType.computed) continue;
			try {
				const value = stat.compute(entry);
				entry[stat.targetPath] = { value: Number(Number(value).toFixed(3)), unit: stat.unit || '%' };
			} catch (e) {
				this.adapter.logger.warn(`statistics: error computing ${stat.targetPath}: ${e.message}`);
				entry[stat.targetPath] = { value: 0, unit: stat.unit || '%' };
			}
		}

		// Pass 3: subtract breakdown values from consumption
		if (entry.consumption !== undefined) {
			let breakdownSum = 0;
			for (const stat of this._breakdown.statsEntries) {
				if (!stat._isBreakdown) continue;
				if ((stat.unit || 'kWh') !== 'kWh') continue; //??
				breakdownSum += Number(entry[stat.targetPath]?.value ?? 0);
			}
			if (breakdownSum > 0) {
				const remainder = Math.max(0, Math.round((Number(entry.consumption.value) - breakdownSum + Number.EPSILON) * 1000) / 1000);
				entry.consumption = { ...entry.consumption, value: Number(remainder.toFixed(3)) };
				this.adapter.logger.debug(`_calculateGeneric: consumption reduced by breakdown sum ${breakdownSum} → remainder ${remainder}`);
			}
		}

		arr.push(entry);
		arr.sort((a, b) => Date.parse(a.to) - Date.parse(b.to));
		this.stateCache.set(stateId, JSON.stringify(arr), { type: 'string' });
		this.adapter.logger.debug(`Appended ${stateId} statistic ${toStr}`);
		return true;
	}

	/**
	 * Removes entries older than periodStart from the JSON array in stateId.
	 *
	 * @param {string} stateId
	 * @param {Date}   periodStart
	 */
	_clearGeneric(stateId, periodStart) {
		let arr = [];
		try {
			arr = JSON.parse(this.stateCache.get(stateId)?.value ?? '[]');
			if (!Array.isArray(arr)) arr = [];
		} catch {
			arr = [];
		}
		arr = arr.filter(item => {
			const ts = Date.parse(item.from);
			return !Number.isNaN(ts) && ts >= periodStart.getTime();
		});
		this.stateCache.set(stateId, JSON.stringify(arr), { type: 'string' });
	}

	/**
	 * Aggregates source entries within a time window into a single target entry.
	 *
	 * @param {string}   sourceStateId
	 * @param {string}   targetStateId
	 * @param {(now: Date) => { from: Date, to: Date }} getWindow      (now: Date) => { from: Date, to: Date }
	 * @param {string}   periodType     label for log messages
	 * @param {Array}    effectiveStats
	 * @returns {boolean}
	 */

	_calculateAggregation(sourceStateId, targetStateId, getWindow, periodType) {
		const effectiveStats = this._effectiveStats();
		try {
			const now = new Date();
			const { from: fromDate, to: toDate } = getWindow(now);

			const isRunning = now < toDate;
			const effectiveTo = isRunning ? now : toDate;
			const toStr = this._localIsoWithOffset(effectiveTo);
			const fromStr = this._localIsoWithOffset(fromDate);

			let targetArray = [];
			try {
				targetArray = JSON.parse(this.stateCache.get(targetStateId)?.value ?? '[]');
				if (!Array.isArray(targetArray)) targetArray = [];
			} catch {
				targetArray = [];
			}

			const existingIdx = targetArray.findLastIndex(e => (isRunning ? e._live === true : e.from === fromStr));
			if (!isRunning && existingIdx >= 0 && targetArray[existingIdx] === this._localIsoWithOffset(toDate)) {
				this.adapter.logger.debug(`statistics.js: ${periodType} entry already finalized, skipping`);
				return false;
			}

			let sourceEntries = [];
			try {
				sourceEntries = JSON.parse(this.stateCache.get(sourceStateId)?.value ?? '[]');
				if (!Array.isArray(sourceEntries)) sourceEntries = [];
			} catch {
				sourceEntries = [];
			}
			sourceEntries = sourceEntries.filter(item => {
				const ts = Date.parse(item.from);
				return !Number.isNaN(ts) && ts >= fromDate.getTime() && ts < toDate.getTime();
			});

			if (sourceEntries.length === 0) {
				this.adapter.logger.debug(
					`statistics.js: No source entries for ${periodType} between ${fromDate.toISOString()} and ${toDate.toISOString()}, skipping`,
				);
				return false;
			}
			this.adapter.logger.debug(`statistics.js: ${sourceEntries.length} entries for ${periodType} (running=${isRunning})`);

			const target = { from: fromStr, to: toStr };
			if (isRunning) target._live = true;

			// Pass 1: sum delta / deltaReset stats (built-in + breakdown)
			for (const stat of effectiveStats) {
				if (stat.type === statisticsType.level || stat.type === statisticsType.computed) continue;
				let sum = 0;
				try {
					sourceEntries.forEach(e => {
						sum += Number(e[stat.targetPath]?.value ?? 0);
					});
				} catch (e) {
					this.adapter.logger.warn(`statistics.js: aggregation error ${periodType}: ${e.message}`);
				}
				sum = Math.round((Number(sum) + Number.EPSILON) * 1000) / 1000;
				target[stat.targetPath] = { value: Number(sum.toFixed(3)), unit: stat.unit || 'kWh' };
			}

			// Pass 2: computed stats
			for (const stat of effectiveStats) {
				if (stat.type !== statisticsType.computed) continue;
				try {
					const value = stat.compute(target);
					target[stat.targetPath] = { value: Number(Number(value).toFixed(3)), unit: stat.unit || '%' };
				} catch (e) {
					this.adapter.logger.warn(`statistics: error computing ${stat.targetPath}: ${e.message}`);
					target[stat.targetPath] = { value: 0, unit: stat.unit || '%' };
				}
			}

			if (existingIdx >= 0) {
				targetArray[existingIdx] = target;
			} else {
				targetArray.push(target);
			}
			targetArray.sort((a, b) => Date.parse(a.to) - Date.parse(b.to));
			this.stateCache.set(targetStateId, JSON.stringify(targetArray), { type: 'string' });
			return true;
		} catch (err) {
			this.adapter.logger.warn(`Error during ${periodType} aggregation: ${err.message}`);
		}
	}

	// -------------------------------------------------------------------------
	// Today live summary state
	// -------------------------------------------------------------------------

	updateJsonToday() {
		if (!this._initialized) {
			this.adapter.logger.debug('statistics: updateJsonToday called before initialization');
			return;
		}
		try {
			const now = new Date();
			const today = {};
			const effectiveStats = this._effectiveStats();

			for (const stat of effectiveStats) {
				if (stat.type === statisticsType.computed) continue;
				const val = this.stateCache.get(stat.sourceId)?.value;
				today[stat.targetPath] = { value: val != null ? Number(Number(val).toFixed(3)) : null, unit: stat.unit };
			}
			for (const stat of effectiveStats) {
				if (stat.type !== statisticsType.computed) continue;
				try {
					const value = stat.compute(today);
					today[stat.targetPath] = { value: Number(Number(value).toFixed(3)), unit: stat.unit };
				} catch (e) {
					this.adapter.logger.warn(`statistics: error computing today.${stat.targetPath}: ${e.message}`);
					today[stat.targetPath] = { value: 0, unit: stat.unit };
				}
			}
			today.updatedAt = this._localIsoWithOffset(now);
			this.stateCache.set('statistics.jsonToday', JSON.stringify(today), { type: 'string' });
			this.adapter.logger.debug('statistics: jsonToday updated');
		} catch (err) {
			this.adapter.logger.warn(`statistics: error updating today state: ${err.message}`);
		}
	}

	// -------------------------------------------------------------------------
	// Periodic calculations
	// -------------------------------------------------------------------------

	// [LIVE] New method — same pattern as _calculateHourly
	/**
	 * Appends one entry to statistics.jsonLive every LIVE_INTERVAL_MINUTES.
	 *
	 * Uses _calculateGeneric with the current minute boundary as periodEnde and
	 * the previous interval boundary as periodStart (= start of current day for
	 * the deltaReset baseline).
	 *
	 * After _calculateGeneric writes the kWh delta, the last entry is converted
	 * in-place to average kW:
	 *   kW = ΔkWh × (60 / LIVE_INTERVAL_MINUTES)
	 *
	 * 'SOC' and computed stats keep their original unit (%, no conversion).
	 * Entries older than LIVE_RETENTION_HOURS are pruned.
	 */
	_calculateLive() {
		const now = new Date();
		// Round down to the current interval boundary
		const intervalMs = (this.adapter.settings.statistics.liveInterval || 5) * 60 * 1000;
		const boundary = new Date(Math.floor(now.getTime() / intervalMs) * intervalMs);
		const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
		//const convFactor = 60 / LIVE_INTERVAL_MINUTES;

		this.adapter.log.debug(`### Live execution triggered, boundary: ${boundary.toLocaleTimeString()} ###`);

		const appended = this._calculateGeneric(CHART_STATE_IDS.live, startOfDay, boundary, this._effectiveLiveStats());
		if (!appended) return;

		// Convert the freshly appended entry from kWh delta → average kW
		let arr = [];
		try {
			arr = JSON.parse(this.stateCache.get(CHART_STATE_IDS.live)?.value ?? '[]');
			if (!Array.isArray(arr)) arr = [];
		} catch {
			return;
		}

		if (arr.length === 0) return;
		const last = arr[arr.length - 1];
		const fromDate = new Date(last.from);
		const toDate = new Date(last.to);
		const convFactor = toDate.getTime() - fromDate.getTime() > 0 ? (60 * 60 * 1000) / (toDate.getTime() - fromDate.getTime()) : 0;

		for (const stat of this._effectiveLiveStats()) {
			// Only convert energy (kWh) deltas — leave SOC (%) and computed (%) as-is
			if (stat.type !== statisticsType.deltaReset && stat.type !== statisticsType.delta) continue;
			if (last[stat.targetPath] === undefined) continue;

			const kw = Math.round(last[stat.targetPath].value * convFactor * 1000) / 1000;
			if (stat.targetPath === 'solarYield') {
				this.adapter.log.debug(
					`### Live stat solarYield from ${last.from} to ${last.to} - ${stat.targetPath}, total: ${last[stat.targetPath]?.total} ${last[stat.targetPath].value} kWh → ${kw} kW (convFactor ${convFactor.toFixed(2)})`,
				);
			}
			last[stat.targetPath] = { ...last[stat.targetPath], value: kw, unit: 'kW' };
		}

		// Prune entries older than LIVE_RETENTION_HOURS
		const cutoff = now.getTime() - LIVE_RETENTION_HOURS * 3600 * 1000;
		const pruned = arr.filter(e => {
			const t = Date.parse(e.from);
			return !Number.isNaN(t) && t >= cutoff;
		});

		this.stateCache.set(CHART_STATE_IDS.live, JSON.stringify(pruned), { type: 'string' });
		this._buildFlexchart('live');
	}

	_calculateHourly() {
		const now = new Date();
		if (this.testing) {
			const state = this.adapter.getState('statistics.jsonHourly');
			this.stateCache.set('statistics.jsonHourly', state?.val ?? '[]', { type: 'string', stored: true });
			now.setDate(now.getDate() + 1);
			now.setHours(1, 0, 0, 1);
		}
		const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
		const lastHour = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), 0, 0, 0);
		this.adapter.log.debug(`### Hourly execution triggered with lastHour: ${lastHour.toLocaleTimeString()} ###`);
		if (this._calculateGeneric('statistics.jsonHourly', startOfDay, lastHour)) {
			this._buildFlexchart('hourly');
		}
	}

	_calculateDaily() {
		this.adapter.log.debug('### Daily execution triggered ###');
		this._calculateAggregation(
			'statistics.jsonHourly',
			'statistics.jsonDaily',
			now => {
				const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
				const yesterday = new Date(today);
				yesterday.setDate(today.getDate() - 1);
				return { from: yesterday, to: today };
			},
			'daily',
		);
		this._calculateAggregation(
			'statistics.jsonHourly',
			'statistics.jsonDaily',
			now => {
				const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
				const tomorrow = new Date(today);
				tomorrow.setDate(today.getDate() + 1);
				return { from: today, to: tomorrow };
			},
			'daily-live',
		);
		this._buildFlexchart('daily');
	}

	_calculateWeekly() {
		this.adapter.log.debug('### Weekly execution triggered ###');
		this._calculateAggregation(
			'statistics.jsonDaily',
			'statistics.jsonWeekly',
			now => {
				const mon = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
				mon.setDate(now.getDate() - (now.getDay() || 7) + 1);
				const prev = new Date(mon);
				prev.setDate(mon.getDate() - 7);
				return { from: prev, to: mon };
			},
			'weekly',
		);
		this._calculateAggregation(
			'statistics.jsonDaily',
			'statistics.jsonWeekly',
			now => {
				const mon = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
				mon.setDate(now.getDate() - (now.getDay() || 7) + 1);
				const next = new Date(mon);
				next.setDate(mon.getDate() + 7);
				return { from: mon, to: next };
			},
			'weekly-live',
		);
		this._buildFlexchart('weekly');
	}

	_calculateMonthly() {
		this.adapter.log.debug('### Monthly execution triggered ###');
		this._calculateAggregation(
			'statistics.jsonDaily',
			'statistics.jsonMonthly',
			now => ({ from: new Date(now.getFullYear(), now.getMonth() - 1, 1), to: new Date(now.getFullYear(), now.getMonth(), 1) }),
			'monthly',
		);
		this._calculateAggregation(
			'statistics.jsonDaily',
			'statistics.jsonMonthly',
			now => ({ from: new Date(now.getFullYear(), now.getMonth(), 1), to: new Date(now.getFullYear(), now.getMonth() + 1, 1) }),
			'monthly-live',
		);
		this._buildFlexchart('monthly');
	}

	_calculateAnnual() {
		this.adapter.log.debug('### Annual execution triggered ###');
		this._calculateAggregation(
			'statistics.jsonDaily',
			'statistics.jsonAnnual',
			now => ({ from: new Date(now.getFullYear() - 1, 0, 1), to: new Date(now.getFullYear(), 0, 1) }),
			'annual',
		);
		this._calculateAggregation(
			'statistics.jsonDaily',
			'statistics.jsonAnnual',
			now => ({ from: new Date(now.getFullYear(), 0, 1), to: new Date(now.getFullYear() + 1, 0, 1) }),
			'annual-live',
		);
		this._buildFlexchart('annual');
	}

	// [LIVE] Minute-aligned timer, fires every LIVE_INTERVAL_MINUTES
	async _initializeLiveTimer() {
		const scheduleNext = () => {
			const now = new Date();
			const intervalMs = this.adapter.settings.statistics.liveInterval * 60 * 1000;
			// Next boundary strictly in the future
			const nextBoundary = new Date(Math.floor(now.getTime() / intervalMs) * intervalMs + intervalMs + 50);
			const ms = nextBoundary.getTime() - now.getTime();

			if (this._liveTimer) this.adapter.clearTimeout(this._liveTimer);
			this._liveTimer = this.adapter.setTimeout(async () => {
				await this._breakdown.refreshValues();
				this._calculateLive();
				scheduleNext();
			}, ms);

			this.adapter.logger.debug(
				`statistics: live timer set, interval=${this.adapter.settings.statistics.liveInterval} min, next run in ${Math.round(ms / 1000)} s`,
			);
		};
		//TEST ??
		/*
		await this._breakdown.refreshValues();
		this._calculateLive();
		*/
		scheduleNext();
	}

	// -------------------------------------------------------------------------
	// Scheduler
	// -------------------------------------------------------------------------
	_initializeTask() {
		const scheduleNextRun = () => {
			const now = new Date();
			const next = new Date(now);
			if (this.testing) {
				next.setMinutes(now.getMinutes() + 1, 0, 0);
			} else {
				next.setHours(next.getHours() + 1, 0, 0, 100);
			}
			if (next.getHours() === 0 && next.getMinutes() === 0) next.setHours(1, 0, 0, 0);

			const ms = next.getTime() - now.getTime();
			this.adapter.logger.debug(`### Statistics - Scheduler start ${now.toLocaleTimeString()} next ${next.toLocaleTimeString()}`);
			if (this.taskTimer) this.adapter.clearTimeout(this.taskTimer);

			this.taskTimer = this.adapter.setTimeout(async () => {
				await this._executeScheduledTasks();
				scheduleNextRun();
			}, ms);
		};
		scheduleNextRun();
	}

	/**
	 * Refreshes breakdown foreign-state values, then runs all calculations.
	 */
	async _executeScheduledTasks() {
		await this._breakdown.refreshValues();
		this._calculateHourly();
		this._calculateDaily();
		this._calculateWeekly();
		this._calculateMonthly();
		this._calculateAnnual();
	}

	async mitNightProcess() {
		const now = new Date();
		await this._executeScheduledTasks();
		const startOfYear = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
		this._clearGeneric('statistics.jsonDaily', startOfYear);
		this._clearGeneric('statistics.jsonWeekly', startOfYear);
		this._clearGeneric('statistics.jsonMonthly', startOfYear);
		this._clearGeneric('statistics.jsonHourly', new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 0, 0, 0, 0));
		// [LIVE] prune to last 48 h (timer also prunes, but be explicit at midnight)
		this._clearGeneric('statistics.jsonLive', new Date(now.getTime() - LIVE_RETENTION_HOURS * 3600 * 1000));
	}

	// -------------------------------------------------------------------------
	// Initialization
	// -------------------------------------------------------------------------

	async initialize() {
		// Restore persisted JSON states into the cache
		for (const [stateId, defaultVal] of [
			// [LIVE] added
			['statistics.jsonLive', '[]'],
			['statistics.jsonHourly', '[]'],
			['statistics.jsonDaily', '[]'],
			['statistics.jsonWeekly', '[]'],
			['statistics.jsonMonthly', '[]'],
			['statistics.jsonAnnual', '[]'],
			['statistics.jsonToday', '{}'],
		]) {
			const state = await this.adapter.getStateAsync(stateId);
			this.stateCache.set(stateId, state?.val ?? defaultVal, { type: 'string', stored: true });
		}

		// Load & validate breakdown config, then fetch current foreign-state values
		await this._breakdown.initialize();
		//await this._breakdown.refreshValues();

		// Wait until a key collected state is available before starting calculations
		try {
			await tools.waitForValue(() => this.stateCache.get('collected.accumulatedEnergyYield')?.value, 5 * 60000);
		} catch {
			this.adapter.logger.warn(
				"statistics: waited 5 min for 'collected.accumulatedEnergyYield' – computed statistics may be incomplete until that state is present.",
			);
		}

		// Restore chart templates (CHART_TYPES now includes 'live')
		for (const chartType of CHART_TYPES) {
			const templateStateId = `statistics.flexCharts.template.${chartType}`;
			const state = await this.adapter.getState(templateStateId);
			this.stateCache.set(templateStateId, state?.val ?? '{}', { type: 'string', stored: true });
			if (state?.ack === false) {
				await this.adapter.setState(templateStateId, { val: state.val, ack: true });
				//this._buildFlexchart(chartType);
			}
			this._buildFlexchart(chartType);
		}

		await this.mitNightProcess();

		// [LIVE] start the minute-aligned live timer
		await this._initializeLiveTimer();
		this._initializeTask();

		this.adapter.subscribeStates(`${this._path}.*`);
		this._initialized = true;
	}

	// -------------------------------------------------------------------------
	// Chart building
	// -------------------------------------------------------------------------

	/**
	 * Builds and writes the eCharts configuration for the given chart type.
	 *
	 * Breakdown series are built by breakdownChartHelper.buildBreakdownSeries()
	 * and injected into the lower consumption grid (xAxisIndex 1 / yAxisIndex 2).
	 * Legend and placeholder replacement are also delegated to breakdownChartHelper.
	 *
	 * @param {string}  myChart     - 'hourly' | 'daily' | 'weekly' | 'monthly' | 'annual'
	 * @param {string}  [chartStyle] - 'line' | 'bar'  (default: 'line' for hourly, 'bar' for others)
	 * @returns {string} Stringified chart configuration
	 */
	_buildFlexchart(myChart, chartStyle) {
		chartStyle = chartStyle || (myChart === 'hourly' || myChart === 'live' ? 'line' : 'bar');

		const id = CHART_STATE_IDS[myChart] ?? CHART_STATE_IDS.hourly;
		let data = [];
		try {
			data = JSON.parse(this.stateCache.get(id)?.value ?? '[]');
		} catch {
			data = [];
		}

		// --- X-Axis labels ---
		const xAxisData = data.map(entry => {
			const from = new Date(entry.from);
			const to = new Date(entry.to);
			if (myChart === 'live') {
				return `${to.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })} ${to.toLocaleTimeString('de-DE', { hour12: false, hour: '2-digit', minute: '2-digit' })}`;
			}
			if (myChart === 'hourly') {
				return `${to.toLocaleDateString('de-DE', { year: 'numeric', month: '2-digit', day: '2-digit' })} ${to.toLocaleTimeString('de-DE', { hour12: false, hour: '2-digit', minute: '2-digit' })}`;
			}
			if (myChart === 'weekly') {
				const toDay = new Date(to);
				if (toDay.getHours() === 0 && toDay.getMinutes() === 0) toDay.setDate(toDay.getDate() - 1);
				return `${from.toLocaleDateString('de-DE', { month: '2-digit', day: '2-digit' })}-${toDay.toLocaleDateString('de-DE', { month: '2-digit', day: '2-digit' })}`;
			}
			if (myChart === 'monthly') return from.toLocaleDateString('de-DE', { year: 'numeric', month: '2-digit' });
			if (myChart === 'annual') return from.toLocaleDateString('de-DE', { year: 'numeric' });
			return from.toLocaleDateString('de-DE', { year: 'numeric', month: '2-digit', day: '2-digit' });
		});

		const xAxisDataShort =
			myChart === 'hourly' || myChart === 'live'
				? xAxisData.map(l => {
						return l.split(' ')[1];
					})
				: xAxisData;

		// --- Day shading areas (hourly only) ---
		const dayAreas = [];
		if ((myChart === 'hourly' || myChart === 'live') && xAxisData.length > 0) {
			const bounds = [0];
			xAxisData.forEach((lbl, i) => {
				if (i > 0 && lbl.split(' ')[0] !== xAxisData[i - 1].split(' ')[0]) bounds.push(i);
			});
			bounds.push(xAxisData.length);
			bounds.forEach((startIdx, d) => {
				if (d >= bounds.length - 1) return;
				const endIdx = bounds[d + 1];
				const date = xAxisData[startIdx].split(' ')[0];
				dayAreas.push([
					{
						xAxis: startIdx - 0.5,
						label: {
							show: true,
							position: 'insideTop',
							formatter: date,
							color: '#555',
							fontSize: 11,
							fontWeight: 'bold',
							backgroundColor: 'rgba(255,255,255,0.7)',
							padding: [2, 4],
							borderRadius: 3,
						},
					},
					{
						xAxis: endIdx - 0.5,
						itemStyle:
							d % 2 === 1
								? { color: 'rgba(180,180,180,0.15)', borderColor: 'rgba(120,120,120,0.3)', borderWidth: 1, borderType: 'dashed' }
								: { color: 'rgba(255,255,255,0)' },
					},
				]);
			});
		}

		// --- Series data ---
		const extract = key => data.map(e => Number(Number(e[key]?.value ?? 0).toFixed(3)));
		const negate = arr => arr.map(v => Number((-v).toFixed(3)));
		const seriesData = {};
		for (const stat of this.stats) {
			seriesData[stat.targetPath] = extract(stat.targetPath);
			seriesData[`${stat.targetPath}Neg`] = negate(seriesData[stat.targetPath]);
		}
		// Populate breakdown keys so chart helper and placeholder replacement can find them
		for (const bd of this._breakdown.entries) {
			seriesData[bd.targetPath] = extract(bd.targetPath);
		}

		// --- Tooltip / axis formatters (serialised as functions via stringify) ---
		const xAxisFormatter =
			myChart === 'live'
				? (() => {
						// IIFE executes once on initialization
						const hourLabels = new Set();
						const closestPerHour = new Map();
						xAxisDataShort.forEach((label, i) => {
							const to = new Date(data[i].to);
							const fullHour = new Date(to.getFullYear(), to.getMonth(), to.getDate(), to.getHours(), 0, 0, 0);
							const hourKey = fullHour.getTime();
							const diffMs = Math.abs(to.getTime() - fullHour.getTime());
							const current = closestPerHour.get(hourKey);
							if (!current || diffMs < current.diffMs) {
								closestPerHour.set(hourKey, { label, diffMs });
							}
						});
						closestPerHour.forEach(({ label }) => hourLabels.add(label));
						// Embed the set content directly into the function string
						const hourLabelsArray = JSON.stringify([...hourLabels]);
						return new Function(`return value => (new Set(${hourLabelsArray}).has(value) ? value : '')`)();
					})()
				: value => (value.includes('|') ? value : (value.split(' ')[1] ?? value));

		// --- Tooltip formatter ---
		const tooltipFormatter = params => {
			if (!Array.isArray(params)) params = [params];
			return params
				.filter(p => p.seriesName !== 'DayBreak')
				.map(p => {
					const negatedSeries = ['Grid Export', 'Charge'];
					const val = negatedSeries.includes(p.seriesName) ? Math.abs(p.value) : p.value;
					const unit = ['SOC', 'Self-sufficiency', 'Self-consumption'].includes(p.seriesName) ? ' %' : ' kWh';
					const seriesName =
						myChart === 'hourly' && ['Self-sufficiency', 'Self-consumption'].includes(p.seriesName) ? `${p.seriesName} today` : p.seriesName;
					return `${p.marker}${seriesName}: <b>${val}${unit}</b>`;
				})
				.join('<br/>');
		};

		// --- Load / parse chart template ---
		const templateStateId = `statistics.flexCharts.template.${myChart}`;
		const outputStateId = `statistics.flexCharts.jsonOutput.${myChart}`;
		const templateStr = this.stateCache.get(templateStateId)?.value ?? '{}';
		let template = {};
		let command = '';
		try {
			const parsed = JSON.parse(templateStr);
			command = parsed.command || '';
			if (Object.keys(parsed).length === 0 || command === 'createTemplateFromBuiltin') {
				template = this._buildDefaultTemplate(myChart, chartStyle);
			} else {
				template = parsed;
				delete template._meta;
			}
		} catch (e) {
			this.adapter.logger.warn(`statistics: invalid template for ${myChart}: ${e.message}`);
			template = this._buildDefaultTemplate(myChart, chartStyle);
		}

		// No-data hint — chart-type specific
		const noDataHints = {
			live: 'No data yet — first entry available after the next interval boundary.',
			hourly: 'No data yet — first entry available after the next full hour.',
			daily: 'No data yet — first entry available tomorrow after midnight.',
			weekly: 'No data yet — first entry available after the current week ends.',
			monthly: 'No data yet — first entry available after the current month ends.',
			annual: 'No data yet — first entry available after the current year ends.',
		};

		// --- Assemble final chart object ---
		const chart = {
			...template,
			/* now breakdown series are injected via chartHelper.buildBreakdownSeries() into the template's series array, so we don't need to merge them here
			series: [
				...(template.series ?? []),
				// Hourly day-shading areas
				...(dayAreas.length > 0
					? [
							{
								name: 'DayBreak',
								type: 'bar',
								barWidth: 0,
								data: [],
								legendHoverLink: false,
								silent: true,
								markArea: { silent: true, data: dayAreas },
							},
						]
					: []),
			],
			*/
			graphic:
				xAxisData.length === 0
					? [
							{
								type: 'text',
								left: 'center',
								top: 'middle',
								style: { text: noDataHints[myChart] || 'No data available yet.', fontSize: 14, fill: '#999' },
							},
						]
					: [],
		};

		// Apply slider start/end defaults when the template has no explicit values
		const sliderDefaults = {
			live: Math.max(0, Math.round((1 - (25 * 12) / Math.max(xAxisData.length, 1)) * 100)),
			hourly: Math.max(0, Math.round((1 - 25 / Math.max(xAxisData.length, 1)) * 100)),
			daily: Math.max(0, Math.round((1 - 7 / Math.max(xAxisData.length, 1)) * 100)),
			weekly: Math.max(0, Math.round((1 - 8 / Math.max(xAxisData.length, 1)) * 100)),
			monthly: Math.max(0, Math.round((1 - 13 / Math.max(xAxisData.length, 1)) * 100)),
			annual: 0,
		};
		if (chart?.dataZoom?.[0] && !chart.dataZoom[0].start && !chart.dataZoom[0].end) {
			chart.dataZoom[0].start = sliderDefaults[myChart] ?? 0;
			chart.dataZoom[0].end = 100;
		}

		// --- Serialise and replace placeholders ---
		let chartStr = stringify(reviveFunctions(chart));

		// Built-in placeholders
		chartStr = chartStr
			.replace("'%%xAxisData%%'", JSON.stringify(xAxisData))
			.replace("'%%xAxisDataShort%%'", JSON.stringify(xAxisDataShort))
			.replaceAll("'%%xAxisMax%%'", String(xAxisData.length - 1))
			.replace("'%%chartTitle%%'", JSON.stringify(`PV Statistics — ${myChart}`))
			.replace("'%%dayAreas%%'", JSON.stringify(dayAreas))
			.replace("'%%xAxisFormatter%%'", stringify(xAxisFormatter))
			.replace("'%%tooltipFormatter%%'", stringify(tooltipFormatter));

		for (const stat of this.stats) {
			const key = stat.targetPath;
			chartStr = chartStr.replace(`'%%${key}%%'`, JSON.stringify(seriesData[key])).replace(`'%%${key}Neg%%'`, JSON.stringify(seriesData[`${key}Neg`]));
		}

		// Breakdown placeholders — delegated to chart helper
		chartStr = chartHelper.replacePlaceholders(chartStr, this._breakdown.entries, seriesData);

		this.stateCache.set(outputStateId, chartStr, { type: 'string', renew: command === 'createTemplateFromBuiltin' ? true : false });
		this.adapter.logger.debug(`statistics: flexCharts built for ${myChart}/${chartStyle}`);

		if (command === 'createTemplateFromBuiltin') {
			template = { _meta: { generatedFrom: 'builtin', generatedAt: new Date().toISOString() }, ...template };
			this.stateCache.set(templateStateId, stringifyWithFunctions(template), { type: 'string' });
			this.adapter.logger.debug(`statistics: new template created for ${myChart}`);
		}

		return chartStr;
	}

	/**
	 * Builds the default built-in eCharts template.
	 * Breakdown series are NOT listed here — they are injected dynamically
	 * in _buildFlexchart() via chartHelper.buildBreakdownSeries().
	 * The legend does include breakdown names (via chartHelper.mergeBreakdownLegend).
	 *
	 * @param {string} myChart
	 * @param {string} chartStyle
	 * @returns {object}
	 */
	_buildDefaultTemplate(myChart, chartStyle) {
		const seriesType = chartStyle === 'line' ? 'line' : 'bar';
		const lineOptions =
			chartStyle === 'line' ? { smooth: false, symbol: 'none', symbolSize: 4, lineStyle: { width: 2 }, areaStyle: { opacity: 0.15 } } : {};
		if (myChart === 'hourly' && chartStyle === 'line') {
			lineOptions.smooth = true;
			lineOptions.lineStyle.smooth = 0.3;
			lineOptions.symbol = 'circle';
		}
		const showBat = this._batteryExists();
		const showSOC = showBat && (myChart === 'hourly' || myChart === 'live');
		const unit = myChart === 'live' ? 'kW' : 'kWh';

		const baseLegend = [
			'Solar Yield',
			'Grid Export',
			'Grid Import',
			...(showBat ? ['Charge', 'Discharge'] : []),
			...(showSOC ? ['SOC'] : []),
			'Self-sufficiency',
			'Self-consumption',
			'Consumption',
		];
		const legendData = chartHelper.mergeBreakdownLegend(baseLegend, this._breakdown.entries);

		const formatTooltipValue = (unit, negative = false, decimals = 2) => {
			//valueFormatter: `value => \`\${value} ${unit}\``,
			return negative ? `value => \`\${(-value).toFixed(${decimals})} ${unit}\`` : `value => \`\${value.toFixed(${decimals})} ${unit}\``;
		};

		return {
			backgroundColor: '#fff',
			animation: false,
			title: { left: 'center', text: '%%chartTitle%%' },
			legend: { top: 35, left: 'center', data: legendData },

			tooltip: {
				trigger: 'axis',
				axisPointer: { type: 'cross' },
				backgroundColor: 'rgba(245,245,245,0.95)',
				borderWidth: 1,
				borderColor: '#ccc',
				padding: 10,
				textStyle: { color: '#000' },
				//formatter: '%%tooltipFormatter%%',
				position: (pos, params, el, elRect, size) => {
					const obj = { top: 10 };
					obj[pos[0] < size.viewSize[0] / 2 ? 'left' : 'right'] = 30;
					return obj;
				},
			},

			axisPointer: { link: [{ xAxisIndex: 'all' }], label: { backgroundColor: '#777' } },
			toolbox: {
				feature: {
					dataZoom: { yAxisIndex: false },
					dataView: { show: true, readOnly: false },
					restore: { show: true },
					saveAsImage: { show: true },
				},
			},
			grid: [
				{ left: '8%', right: showSOC ? '8%' : '4%', top: 80, height: '45%' },
				{ left: '8%', right: showSOC ? '8%' : '4%', top: '72%', height: '15%' },
			],
			xAxis: [
				{
					type: 'category',
					data: '%%xAxisDataShort%%',
					scale: true,
					boundaryGap: chartStyle !== 'line',
					axisLine: { onZero: false },
					...(myChart === 'live'
						? {
								axisTick: {
									interval: (index, value) => value.endsWith(':00'),
								},
							}
						: {}),

					splitLine: { show: false },
					axisPointer: { z: 100 },
					axisLabel: {
						interval: 0,
						lineHeight: 16,
						fontSize: 11,
						formatter: '%%xAxisFormatter%%',
					},
					min: 0,
					max: '%%xAxisMax%%',
				},
				{
					type: 'category',
					gridIndex: 1,
					data: '%%xAxisData%%',
					scale: true,
					boundaryGap: chartStyle !== 'line',
					axisLine: { onZero: false },
					axisTick: { show: false },
					splitLine: { show: false },
					axisLabel: { show: false },
					min: 0,
					max: '%%xAxisMax%%',
				},
			],
			yAxis: [
				{
					scale: false,
					splitArea: { show: true },
					name: `Energy (${unit})`,
					nameLocation: 'middle',
					nameGap: 50,
					axisLabel: { formatter: `{value} ${unit}` },
					splitLine: { show: true },
					axisLine: { show: true },
				},
				{
					type: 'value',
					min: 0,
					max: 100,
					name: showSOC ? 'SOC / Ratio (%)' : 'Ratio (%)',
					nameLocation: 'middle',
					nameGap: 50,
					axisLabel: { formatter: '{value} %' },
					splitLine: { show: false },
					axisLine: { show: true },
				},
				{
					scale: true,
					gridIndex: 1,
					splitNumber: 3,
					axisLine: { show: false },
					axisTick: { show: false },
					splitLine: { show: false },
					name: `Consumption\n(${unit})`,
					nameLocation: 'middle',
					nameGap: 50,
					axisLabel: { formatter: `{value} ${unit}` },
				},
			],
			dataZoom: [
				{ type: 'inside', xAxisIndex: [0, 1] },
				{ show: true, xAxisIndex: [0, 1], type: 'slider', bottom: 5 },
			],
			series: [
				{
					name: 'Solar Yield',
					type: seriesType,
					unit: unit,
					invertSign: false,
					data: '%%solarYield%%',
					itemStyle: { color: '#f6c94e' },
					emphasis: { focus: 'series' },
					tooltip: {
						valueFormatter: formatTooltipValue(unit),
					},
					...lineOptions,
				},
				{
					name: 'Grid Export',
					type: seriesType,
					data: '%%gridExportNeg%%',
					itemStyle: { color: '#5cb85c' },
					emphasis: { focus: 'series' },
					tooltip: { valueFormatter: formatTooltipValue(unit, true) },
					...lineOptions,
				},
				{
					name: 'Grid Import',
					type: seriesType,
					data: '%%gridImport%%',
					itemStyle: { color: '#ec0000' },
					emphasis: { focus: 'series' },
					tooltip: { valueFormatter: formatTooltipValue(unit) },
					...lineOptions,
				},
				...(showBat
					? [
							{
								name: 'Charge',
								type: seriesType,
								data: '%%chargeCapacityNeg%%',
								itemStyle: { color: '#5bc0de' },
								emphasis: { focus: 'series' },
								tooltip: { valueFormatter: formatTooltipValue(unit, true) },
								...lineOptions,
							},
							{
								name: 'Discharge',
								type: seriesType,
								data: '%%dischargeCapacity%%',
								itemStyle: { color: '#ed50e0' },
								emphasis: { focus: 'series' },
								tooltip: { valueFormatter: formatTooltipValue(unit) },
								...lineOptions,
							},
						]
					: []),
				...(showSOC
					? [
							{
								name: 'SOC',
								type: 'line',
								yAxisIndex: 1,
								data: '%%SOC%%',
								itemStyle: { color: '#985e24' },
								lineStyle: { width: 2, type: 'dashed' },
								symbol: 'none',
								smooth: true,
								tooltip: { valueFormatter: formatTooltipValue('%', false, 0) },
							},
						]
					: []),
				{
					name: 'Self-sufficiency',
					type: 'line',
					yAxisIndex: 1,
					data: '%%selfSufficiency%%',
					itemStyle: { color: '#9c27b0' },
					lineStyle: { width: 2, type: 'dashed' },
					symbol: 'none', //'circle'
					symbolSize: 4,
					smooth: true,
					tooltip: { valueFormatter: formatTooltipValue('%', false, 0) },
				},
				{
					name: 'Self-consumption',
					type: 'line',
					yAxisIndex: 1,
					data: '%%selfConsumption%%',
					itemStyle: { color: '#ff9800' },
					lineStyle: { width: 2, type: 'dashed' },
					symbol: 'none', //'circle'
					symbolSize: 4,
					smooth: true,
					tooltip: { valueFormatter: formatTooltipValue('%', false, 0) },
				},
				...chartHelper.buildBreakdownSeries(this._breakdown.entries, seriesType, lineOptions, formatTooltipValue(unit)),

				{
					name: 'Consumption',
					type: seriesType,
					stack: 'consumptionBreakdown',
					xAxisIndex: 1,
					yAxisIndex: 2,
					data: '%%consumption%%',
					itemStyle: { color: '#337ab7' },
					tooltip: { valueFormatter: formatTooltipValue(unit) },
					...lineOptions,
				},
				...(myChart === 'hourly' || myChart === 'live'
					? [
							{
								name: 'DayBreak',
								type: 'bar',
								barWidth: 0,
								data: [],
								legendHoverLink: false,
								silent: true,
								markArea: { silent: true, data: '%%dayAreas%%' },
							},
						]
					: []),
			],
		};
	}

	_batteryExists() {
		return this.stateCache.get(`collected.ratedCapacity`)?.value > 0;
	}

	// -------------------------------------------------------------------------
	// External event handlers (called from adapter onStateChange)
	// -------------------------------------------------------------------------

	/**
	 * Handles a user edit of a chart template state.
	 *
	 * @param {string} chartType
	 * @param {object} state
	 */
	async handleTemplateChange(chartType, state) {
		const templateStateId = `statistics.flexCharts.template.${chartType}`;
		if (this.stateCache.get(templateStateId) === undefined) {
			this.adapter.logger.warn(`Template state ${templateStateId} not found for handleTemplateChange`);
			return;
		}
		if (state?.val != null) {
			this.adapter.logger.debug(`statistics: template state ${chartType} changed (ack: ${state.ack})`);
			this.stateCache.set(templateStateId, state.val, { type: 'string', stored: true });
			this._buildFlexchart(chartType);
			await this.adapter.setState(templateStateId, { val: this.stateCache.get(templateStateId)?.value, ack: true });
		}
	}

	/**
	 * Handles a user edit of the consumptionBreakdown config state.
	 * Delegates all validation and foreign-state refresh to ConsumptionBreakdown,
	 * then rebuilds all charts.
	 *
	 * Wire up in adapter onStateChange:
	 *
	 *   if (idArray[2] == 'statistics' && idArray[3] == 'consumptionBreakdown') {
	 *			if (this.state.statistics && typeof this.state.statistics.handleBreakdownChange === 'function') {
	 *				this.state.statistics.handleBreakdownChange(state);
	 *			}
	 *		}
	 *	}
	 *
	 * @param {object} state - ioBroker state object (val = new JSON string)
	 * @returns {Promise<void>}
	 */
	async handleBreakdownChange(state) {
		const changed = await this._breakdown.handleStateChange(state);
		if (!changed) return;
		for (const chartType of CHART_TYPES) {
			this._buildFlexchart(chartType);
		}
	}

	/**
	 * Handles flexcharts rebuild messages from VIS widgets or adapter messages.
	 *
	 * @param {{ chart?: string, style?: string }} message
	 * @param {callback} callback
	 */
	handleFlexMessage(message, callback) {
		const result = this._buildFlexchart(message?.chart || 'hourly', message?.style);
		if (typeof callback === 'function') callback(result);
	}

	destroy() {
		if (this.taskTimer) this.adapter.clearTimeout(this.taskTimer);
		if (this._liveTimer) this.adapter.clearTimeout(this._liveTimer);
	}
}

module.exports = statistics;
