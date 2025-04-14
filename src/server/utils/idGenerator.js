const crypto = require('crypto');

function generateClientId(ip) {
    let _id;

    if (['production', 'prod'].includes(process.env.NODE_ENV.toLowerCase())) {
        const salt1 = process.env.SALT1;
        const salt2 = process.env.SALT2;
        const saltedIp = `${salt1}${ip}${salt2}`;
        const hash = crypto.createHash('sha256').update(saltedIp).digest('hex');
        _id = hash.slice(0, 24);
    } else {
        _id = crypto.randomBytes(12).toString("hex");
    }

    return _id;
}

function generateRandomId() {
    return crypto.randomBytes(12).toString("hex");
}

module.exports = { generateClientId, generateRandomId };
