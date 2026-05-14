'use strict';

/**
 * Serializes an object to JSON, converting functions to their string representation.
 *
 * @param {any} obj - The object to serialize.
 * @returns {string} JSON string where functions are represented as strings.
 */
function stringifyWithFunctions(obj) {
	return JSON.stringify(
		obj,
		(key, value) => {
			if (typeof value === 'function') {
				return value.toString();
			}

			if (value === undefined) {
				return null;
			}
			return value;
		},
		2,
	);
}
/*
const FUNCTION_KEYS = ['formatter', 'render', 'parser'];

function reviveFunctions(obj, key = '') {
	if (typeof obj === 'string' && FUNCTION_KEYS.includes(key)) {
		const str = obj.trim();

		try {
			return new Function(`return (${str})`)();
		} catch {
			return obj;
		}
	}

	if (typeof obj === 'object' && obj !== null) {
		for (const k in obj) {
			obj[k] = reviveFunctions(obj[k], k);
		}
	}

	return obj;
}
*/
const FUNCTION_KEYS = ['formatter', 'parser', 'render', 'labelFormatter', 'valueFormatter', 'position'];

function reviveFunctions(obj, key = '') {
	if (typeof obj === 'string' && FUNCTION_KEYS.includes(key)) {
		const str = obj.trim();

		// Arrow Function erkennen
		if (str.includes('=>')) {
			try {
				return new Function(`return (${str})`)();
			} catch {
				return obj;
			}
		}

		// klassische function() {} erkennen
		if (str.startsWith('function')) {
			try {
				return new Function(`return (${str})`)();
			} catch {
				return obj;
			}
		}
	}

	if (typeof obj === 'object' && obj !== null) {
		for (const key in obj) {
			obj[key] = reviveFunctions(obj[key], key);
		}
	}

	return obj;
}

/**
 * Deeply merges source object properties into the target object.
 *
 * @param {object} target - The target object to merge into.
 * @param {object} source - The source object whose properties are merged.
 * @returns {object} The merged target object.
 */
function deepMerge(target, source) {
	for (const key of Object.keys(source)) {
		if (
			source[key] !== null &&
			typeof source[key] === 'object' &&
			!Array.isArray(source[key]) &&
			target[key] !== null &&
			typeof target[key] === 'object' &&
			!Array.isArray(target[key])
		) {
			deepMerge(target[key], source[key]);
		} else {
			target[key] = source[key];
		}
	}
	return target;
}

/**
 * Sets a value on an object using a dot‑separated path, creating intermediate objects as needed.
 *
 * @param {object} obj - The object to modify.
 * @param {string} path - Dot‑separated path (e.g., "a.b.c").
 * @param {any} value - The value to set at the specified path.
 */
function setByPath(obj, path, value) {
	const keys = path.split('.');
	let current = obj;

	while (keys.length > 1) {
		const key = keys.shift();

		if (!(key in current)) {
			current[key] = {};
		}

		current = current[key];
	}

	current[keys[0]] = value;
}

/**
 * Applies a set of overrides to a target object based on dot‑separated paths.
 *
 * @param {object} target - The target object to which overrides are applied.
 * @param {object} overrides - An object whose keys are dot‑separated paths and values are the overrides.
 */
function applyOverrides(target, overrides) {
	for (const path in overrides) {
		setByPath(target, path, overrides[path]);
	}
}

module.exports = {
	stringifyWithFunctions,
	reviveFunctions,
	deepMerge,
	applyOverrides,
};
