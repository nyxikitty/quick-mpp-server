class NoteQuota {
	constructor(cb) {
		this.cb = cb;
		this.allowance = 8000;
		this.max = 24000;
		this.maxHistLen = 3;
		this.points = this.max;
		this.history = [];
		this.setParams();
		this.resetPoints();
	}

	static get PARAMS_LOBBY() {
		return { allowance: 200, max: 600 };
	}
	static get PARAMS_NORMAL() {
		return { allowance: 400, max: 1200 };
	}
	static get PARAMS_RIDICULOUS() {
		return { allowance: 600, max: 1800 };
	}
	static get PARAMS_OFFLINE() {
		return { allowance: 8000, max: 24000, maxHistLen: 3 };
	}

	getParams() {
		return {
			m: 'nq',
			allowance: this.allowance,
			max: this.max,
			maxHistLen: this.maxHistLen
		};
	}

	setParams(params = NoteQuota.PARAMS_OFFLINE) {
		const allowance = params.allowance || this.allowance || NoteQuota.PARAMS_OFFLINE.allowance;
		const max = params.max || this.max || NoteQuota.PARAMS_OFFLINE.max;
		const maxHistLen = params.maxHistLen || this.maxHistLen || NoteQuota.PARAMS_OFFLINE.maxHistLen;

		if (allowance !== this.allowance || max !== this.max || maxHistLen !== this.maxHistLen) {
			this.allowance = allowance;
			this.max = max;
			this.maxHistLen = maxHistLen;
			this.resetPoints();
			return true;
		}
		return false;
	}

	resetPoints() {
		this.points = this.max;
		this.history = [];

		for (let i = 0; i < this.maxHistLen; i++) {
			this.history.unshift(this.points);
		}

		if (this.cb) this.cb(this.points);
	}

	tick() {
		this.history.unshift(this.points);
		this.history.length = this.maxHistLen;

		if (this.points < this.max) {
			this.points += this.allowance;
			if (this.points > this.max) this.points = this.max;
			if (this.cb) this.cb(this.points);
		}
	}

	spend(needed) {
		let sum = 0;
		let numNeeded = needed;

		for (const points of this.history) {
			sum += points;
		}

		if (sum <= 0) numNeeded *= this.allowance;
		if (this.points < numNeeded) return false;

		this.points -= numNeeded;
		if (this.cb) this.cb(this.points);

		return true;
	}
}

module.exports = NoteQuota;
