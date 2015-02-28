let names = ["years", "months", "days", "hours", "minutes", "seconds"],
    thresholds = [false, 12, false, 24, 60, 60];

function invert(duration) {
    let obj = {};
    if("weeks" in duration) {
        obj.weeks = -duration.weeks;
    } else {
        for(let name of names) {
            obj[name] = -duration[name];
        }
    }
    return obj;
}

function normalizeValue(obj, i) {
    const name = names[i],
        threshold = thresholds[i],
        thresholdNext = thresholds[i + 1];

    let val = obj[name];

    if(thresholdNext) {
        const valInt = parseInt(val, 10);

        if(valInt !== val) {
            obj[names[i + 1]] += (val - valInt) * thresholdNext;
            val = valInt;
        }
    }
    if(threshold) {
        if(val >= threshold) {
            obj[names[i - 1]] += Math.floor(val / threshold);
            val %= threshold;
        }
    }

    return val;
}

class Iso8601Duration {
    constructor(init) {
        let weeks = "weeks" in init;

        for(let name of names) {
            if(name in init) {
                if(weeks) {
                    throw new Error(`Iso8601Duration: object cannot contain '${name}' and 'weeks'`);
                } else {
                    this[name] = Number(init[name]);
                    if(Number.isNaN(this[name])) {
                        throw new TypeError(`Iso8601Duration: '${name}' in object is not a number: '${this[name]}'`);
                    }
                }
            } else if(!weeks) {
                this[name] = 0;
            }
        }

        if(weeks) {
            this.weeks = Number(init.weeks);
        }
    }

    toString() {
        if("weeks" in this) {
            return `P${this.weeks}W`;
        }
        let ret = "P";
        for(let name of names) {
            if(name === "hours") {
                ret += "T";
            }
            if(this[name]) {
                ret += this[name] + name.charAt(0).toUpperCase();
            }
        }

        if(ret === "PT") {
            return "PT0S";
        }
        return ret;
    }

    valueOf() {
        if("weeks" in this) {
            return this.weeks * 7 * 24 * 60 * 60;
        }
        if(this.years || this.months) {
            throw new Error("Iso8601Duration: can only cast durations of less than P1M to number");
        }
        return ((this.days * 24 + this.hours) * 60 + this.minutes) * 60 + this.seconds;
    }

    clone() {
        return new this.constructor(this);
    }

    normalize() {
        if("weeks" in this) {
            return;
        }
        let changed = false;
        for(let [i, name] of names.entries()) {
            const val = normalizeValue(this, i);

            if(val !== this[name]) {
                changed = true;
                this[name] = val;
            }
        }

        if(changed) {
            this.normalize();
        }
    }

    add(b) {
        if(typeof(b) !== "object") {
            throw new TypeError("Iso8601Duration.prototype.add: expects object");
        }
        let clone = this.clone();
        if("weeks" in clone) {
            if("weeks" in b) {
                clone.weeks += b.weeks;
                return clone;
            }
            if(names.some((name) => name in clone)) {
                throw new Error("Iso8601Duration.prototype.add: incompatible objects");
            }
            return clone;
        }

        for(let name of names) {
            if(name in b) {
                clone[name] += b[name];
            }
        }
        return clone;
    }

    sub() {
        return this.add.apply(invert(this), arguments);
    }

    reducePrecision(to) {
        if(names.indexOf(to) === -1) {
            throw new Error(`Unknown component: ${to}`);
        }
        if("weeks" in this) {
            if(to === "year" || to === "month") {
                return new this.constructor({});
            }
            return new this.constructor({
                "weeks": this.weeks
            });
        }
        let init = {};
        for(let name of names) {
            init[name] = this[name];
            if(name === to) {
                break;
            }
        }
        return new this.constructor(init);
    }

    addToDate(date) {
        date = new Date(date);
        if("weeks" in this) {
            throw new Error("Not implemented");
        }
        for(let name of names) {
            let val = this[name];
            if(val) {
                let methodName;
                switch(name) {
                    case "days":
                        methodName = "Date";
                        break;
                    case "years":
                        methodName = "FullYear";
                        break;
                    case "seconds":
                        methodName = "Milliseconds";
                        val = Math.round(val * 1000);
                        break;
                }
                if(!methodName) {
                    methodName = name.charAt(0).toUpperCase() + name.slice(1);
                }
                date["setUTC" + methodName](date["getUTC" + methodName]() + val);
            }
        }
        return date;
    }

    subFromDate() {
        this.addToDate.apply(invert(this));
    }

    [Symbol.toStringTag]() {
        return `Iso8601Duration(${this.toString()})`;
    }
}

Iso8601Duration.parse = function(str) {
    str = String(str).replace(/,/g, ".");

    let matches = str.match(/^P(\d+(?:\.\d+)?)W$/);
    if(matches) {
        return new this({
            "weeks": Number(matches[1])
        });
    }
    let parts = names.map((name) => `(?:(\\d+(?:\\.\\d+)?)${name.charAt(0).toUpperCase()})?`);
    matches = str.match(new RegExp(`^P${parts.slice(0, 3).join("")}(?:T${parts.slice(3).join("")})?\$`));
    if(!matches) {
        throw new Error(`Iso8601Duration.parse: '${str}' is not a valid ISO 8601 duration`);
    }
    matches = matches.slice(1).map(Number);
    let init = {};
    for(let [i, name] of names.entries()) {
        let match = matches[i];

        if(!Number.isNaN(match)) {
            init[name] = match;
        }
    }
    return new this(init);
};

Iso8601Duration.fromNumber = function(number, unit = "seconds") {
    number = Number(number);
    if(Number.isNaN(number)) {
        throw new TypeError("Iso8601Duration.fromNumber: not a number");
    }
    if(names.indexOf(unit) === -1 && unit !== "weeks") {
        throw new Error(`Iso8601Duration.fromNumber: unknown unit: ${unit}`);
    }
    const init = {};
    init[unit] = number;
    return new Iso8601Duration(init);
};

export default Iso8601Duration;
