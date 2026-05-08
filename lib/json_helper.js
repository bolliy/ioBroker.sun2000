'use strict';

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
function reviveFunctions(obj) {
	if (typeof obj === 'string') {
		if (obj.trim().startsWith('params') || obj.includes('=>')) {
			try {
				return new Function(`return (${obj})`)();
			} catch {
				return obj;
			}
		}
	}

	if (typeof obj === 'object' && obj !== null) {
		for (const key in obj) {
			obj[key] = reviveFunctions(obj[key]);
		}
	}

	return obj;
}


const FUNCTION_ALLOW = ['formatter'];

function reviveFunctions(obj, key = '') {
  if (typeof obj === "string" && FUNCTION_ALLOW.includes(key)) {
    try {
      return new Function(`return (${obj})`)();
    } catch {
      return obj;
    }
  }

  if (typeof obj === "object" && obj !== null) {
    for (const k in obj) {
      obj[k] = reviveFunctions(obj[k], k);
    }
  }

  return obj;
}
*/

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

module.exports = {
	stringifyWithFunctions,
	reviveFunctions,
};
