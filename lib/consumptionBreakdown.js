'use strict';

/**
 * consumptionBreakdown.js
 *
 * Manages the user-defined consumption breakdown configuration.
 *
 * Responsibilities:
 *  - Defining the ioBroker state schema for the breakdown config
 *  - Parsing and validating the JSON configuration array
 *  - Reading breakdown source values from *foreign* ioBroker states
 *    (outside the adapter namespace) via getForeignStateAsync and caching
 *    them into the shared stateCache under internal keys so the existing
 *    statistics calculation code can reach them transparently
 *  - Handling live updates when the user edits the breakdown state at runtime
 *
 * This module is intentionally free of any chart / eCharts logic.
 * It is used by statistics.js and consumed by breakdownChartHelper.js.
 */

const { statisticsType } = require(`${__dirname}/types.js`);

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** State ID (relative to adapter namespace) of the user-editable config */
const BREAKDOWN_STATE_ID = 'statistics.consumptionBreakdown';

/** Internal stateCache key prefix used to store fetched values */
const CACHE_KEY_PREFIX = 'statistics._breakdown.';

/** Empty array serialised as the factory-default value */
const BREAKDOWN_DEFAULT = JSON.stringify([], null, 2);

/**
 * ioBroker state definition for the breakdown configuration state.
 * Intended to be merged into the postProcessHooks states array of statistics.js.
 *
 */
const BREAKDOWN_STATE_DEF = {
	id: BREAKDOWN_STATE_ID,
	name: 'Consumption breakdown definition',
	type: 'string',
	role: 'json',
	desc:
		'JSON array defining how to split the total consumption into sub-categories ' +
		'for stacked chart display. Each entry requires at minimum: ' +
		'"sourceId" (foreign ioBroker state path), "targetPath" (internal key), "name" (legend label). ' +
		'Optional: "unit" (default "kWh"), "gain" (divisor, default 1), ' +
		'"color" (hex string), "type" ("deltaReset"|"delta"|"level").',
	write: true,
	initVal: BREAKDOWN_DEFAULT,
};

// ---------------------------------------------------------------------------
// Typedef
// ---------------------------------------------------------------------------

/**
 * sourceId   - Foreign ioBroker state ID, read via getForeignStateAsync
 * targetPath - Internal key in statistics data entries and chart series
 * name       - Human-readable chart legend label
 * unit       - Unit shown in tooltip (default: "kWh")
 * gain       - Divisor applied to the raw value before storing (default: 1)
 * color  - Optional hex colour for the eCharts series
 * type       - statisticsType value: deltaReset | delta | level
 */

// ---------------------------------------------------------------------------
// Class
// ---------------------------------------------------------------------------

class ConsumptionBreakdown {
	/**
	 * @param {object} adapterInstance  - ioBroker adapter instance (needs getForeignStateAsync, logger)
	 * @param {object} stateCache       - Shared state cache (get / set interface)
	 * @param {string[]} builtinPaths   - targetPath values already used by statistics.stats,
	 *                                   used to prevent collisions during validation
	 */
	constructor(adapterInstance, stateCache, builtinPaths) {
		this.adapter = adapterInstance;
		this.stateCache = stateCache;
		this._builtinPaths = builtinPaths || [];

		this._entries = [];
	}

	// -----------------------------------------------------------------------
	// Public API
	// -----------------------------------------------------------------------

	/**
	 * The ioBroker state definition object that must be registered by statistics.js.
	 * @returns {object}
	 */
	get stateDef() {
		return BREAKDOWN_STATE_DEF;
	}

	/**
	 * The state ID of the breakdown configuration state.
	 * @returns {string}
	 */
	get stateId() {
		return BREAKDOWN_STATE_ID;
	}

	/**
	 * The currently active (validated) breakdown entries.
	 * @returns {ConsumptionBreakdownEntry[]}
	 */
	get entries() {
		return this._entries;
	}

	/**
	 * Returns each active entry mapped to the schema expected by the statistics
	 * calculation pipeline (_calculateGeneric / _calculateAggregation):
	 *
	 *   { sourceId, targetPath, unit, type, _isBreakdown: true }
	 *
	 * The sourceId points into the stateCache (CACHE_KEY_PREFIX + targetPath)
	 * where _refreshValues() stores the fetched foreign-state value.
	 *
	 * @returns {Array}
	 */
	get statsEntries() {
		return this._entries.map(bd => ({
			sourceId: `${CACHE_KEY_PREFIX}${bd.targetPath}`,
			targetPath: bd.targetPath,
			unit: bd.unit,
			type: bd.type,
			_isBreakdown: true,
		}));
	}

	/**
	 * Loads the persisted configuration from the adapter state and parses it.
	 * Call this once during statistics.initialize().
	 *
	 * @returns {Promise<void>}
	 */
	async load() {
		const state = await this.adapter.getStateAsync(BREAKDOWN_STATE_ID);
		const raw = state?.val ?? BREAKDOWN_DEFAULT;
		this.stateCache.set(BREAKDOWN_STATE_ID, raw, { type: 'string', stored: true });
		this._entries = this._parse(raw);
		this._logLoad();
	}

	/**
	 * Fetches fresh values from all configured foreign states and writes them
	 * into the stateCache so that the statistics calculation code can access them.
	 *
	 * Must be called:
	 *  - once after load() during initialisation, before the first calculation run
	 *  - at the start of every scheduled hourly task (_executeScheduledTasks)
	 *
	 * @returns {Promise<void>}
	 */
	async refreshValues() {
		for (const bd of this._entries) {
			const cacheKey = `${CACHE_KEY_PREFIX}${bd.targetPath}`;
			try {
				const state = await this.adapter.getForeignStateAsync(bd.sourceId);
				if (state != null && state.val !== null && state.val !== undefined) {
					const raw = Number(state.val);
					if (!isNaN(raw)) {
						this.stateCache.set(cacheKey, raw / bd.gain || 1, { type: 'number', stored: true });
					} else {
						this.adapter.logger.debug(`consumptionBreakdown: '${bd.targetPath}' value is not a number: ${state.val}`);
					}
				} else {
					this.adapter.logger.debug(`consumptionBreakdown: '${bd.targetPath}' state '${bd.sourceId}' not available.`);
				}
			} catch (err) {
				this.adapter.logger.warn(`consumptionBreakdown: '${bd.targetPath}' – error reading '${bd.sourceId}': ${err.message}`);
			}
		}
	}

	/**
	 * Handles a live change of the breakdown configuration state (ack: false).
	 * Validates the new JSON, updates the internal entry list and cache,
	 * acknowledges the state, then triggers a value refresh.
	 *
	 * The caller (statistics.js) is responsible for rebuilding the charts afterwards.
	 *
	 * @param {object} state - ioBroker state object with the new val
	 * @returns {Promise<boolean>} true if the config was updated, false on no-op
	 */
	async handleStateChange(state) {
		if (state?.val == null) return false;

		this.adapter.logger.info('consumptionBreakdown: configuration changed – reloading.');

		const newEntries = this._parse(state.val);
		this._entries = newEntries;
		this.stateCache.set(BREAKDOWN_STATE_ID, state.val, { type: 'string', stored: true });

		await this.adapter.setStateAsync(BREAKDOWN_STATE_ID, { val: state.val, ack: true });
		await this.refreshValues();

		this._logLoad();
		return true;
	}

	// -----------------------------------------------------------------------
	// Private helpers
	// -----------------------------------------------------------------------

	/**
	 * Parses, validates and normalises a raw JSON string into an entry array.
	 * Invalid entries are skipped with a warning; the rest are returned.
	 *
	 * @param {string} rawJson
	 * @returns {ConsumptionBreakdownEntry[]}
	 */
	_parse(rawJson) {
		let arr = [];
		try {
			arr = JSON.parse(rawJson);
		} catch (e) {
			this.adapter.logger.warn(`consumptionBreakdown: JSON parse error: ${e.message}`);
			return [];
		}

		if (!Array.isArray(arr)) {
			this.adapter.logger.warn('consumptionBreakdown: root value must be a JSON array – ignoring.');
			return [];
		}

		const valid = [];
		for (const raw of arr) {
			// --- Required fields ---
			if (typeof raw.sourceId !== 'string' || !raw.sourceId.trim()) {
				this.adapter.logger.warn(`consumptionBreakdown: entry missing 'sourceId' – skipping: ${JSON.stringify(raw)}`);
				continue;
			}
			if (typeof raw.targetPath !== 'string' || !raw.targetPath.trim()) {
				this.adapter.logger.warn(`consumptionBreakdown: entry missing 'targetPath' – skipping: ${JSON.stringify(raw)}`);
				continue;
			}
			if (typeof raw.name !== 'string' || !raw.name.trim()) {
				this.adapter.logger.warn(`consumptionBreakdown: entry missing 'name' – skipping: ${JSON.stringify(raw)}`);
				continue;
			}

			// --- Collision check ---
			if (this._builtinPaths.includes(raw.targetPath)) {
				this.adapter.logger.warn(`consumptionBreakdown: targetPath '${raw.targetPath}' collides with a built-in stat – skipping.`);
				continue;
			}

			// --- Duplicate targetPath within the breakdown list ---
			if (valid.some(e => e.targetPath === raw.targetPath)) {
				this.adapter.logger.warn(`consumptionBreakdown: duplicate targetPath '${raw.targetPath}' – skipping second occurrence.`);
				continue;
			}

			// --- Normalise optional fields ---
			const allowedTypes = [statisticsType.deltaReset, statisticsType.delta, statisticsType.level];
			const entry = {
				sourceId: raw.sourceId.trim(),
				targetPath: raw.targetPath.trim(),
				name: raw.name.trim(),
				unit: typeof raw.unit === 'string' && raw.unit ? raw.unit : 'kWh',
				gain: typeof raw.gain === 'number' && raw.gain !== 0 ? raw.gain : 1,
				color: typeof raw.color === 'string' && raw.color ? raw.color : null,
				type: allowedTypes.includes(raw.type) ? raw.type : statisticsType.deltaReset,
			};
			valid.push(entry);
		}

		return valid;
	}

	/** Logs a summary of the currently loaded entries at info level. */
	_logLoad() {
		const n = this._entries.length;
		const noun = n === 1 ? 'entry' : 'entries';
		this.adapter.logger.info(`consumptionBreakdown: loaded ${n} ${noun}.`);
		if (n > 0) {
			this.adapter.logger.debug(`consumptionBreakdown entries: ${this._entries.map(e => `${e.name} (${e.sourceId} → ${e.targetPath})`).join(', ')}`);
		}
	}
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
	ConsumptionBreakdown,
	BREAKDOWN_STATE_ID,
	BREAKDOWN_DEFAULT,
};
