const net = require('net');
const struct = require("python-struct");
const {
    jsPack,
    jsPackCalcSize,
    msLocalTimeFromToday,
    myTypeof,
    lstrip,
    getEndianessString
} = require('./utils.js');

class EgiError extends Error {
    constructor(message) {
        super(message);
        this.name = 'EgiError';
    }
}

function _checkLen(k) {
    if (k.length !== 4) {
        throw new EgiError(`${k}: EGI wants the key to be exactly four characters!`)
    }
    return true;
}

function _checkType(k) {
    if (typeof(k) !== 'string') {
        throw new EgiError(`${typeof(k)}: EGI wants the key to be four _characters_ (not %s) !`)
    }
    return true;
}

function _makeFit(k) {
    let d = k.length - 4;
    if (d > 0) {
        let arr = [];
        for (let i = 0; i < d; i++) arr.push(' ');
        return k + arr.join('');
    } else {
        return k.substring(0, 4);
    }
}

class _Format {
    constructor() {
        this._formatStrings = {
            'Q': "=4s",
            'X': '',
            'B': '',
            'E': '',
            'A': '',
            'T': "=L",  // "=l",
            'D': '',  // null, a variable-length structure can follow, but the header is "=cHll4s"
            'I': "=B",
            'Z': '',
            'F': "=4c"  // in theory, it should be "=h" ; but for the protocol v.1, it isn't .
        }
    }

    _get(key) {
        return this._formatStrings[key];
    }

    formatLength(key) {
        return jsPackCalcSize(this._get(key));
    }

    pack(key, ...args) {
        let fmt = '=c' + lstrip(this._get(key), '=');
        return jsPack(fmt, key, ...args);
    }

    unpack(key, data) {
        return struct.unpack(this._get(key), data);
    }
}

//concatenate all the buffers in a 'packed' buffer
function _cat(...buffers) {
    return Buffer.concat(buffers);
}

//pack 's' as a single-byte-counter Pascal string
function _pbuffer(s) {
    if (!s) return Buffer.alloc(0);
    if (s.length > 255) throw new EgiError("Max Length for Pascal String is 255");
    let total = s.length + 1;
    let buffer = Buffer.alloc(total);
    buffer.writeUInt8(s.length);
    buffer.write(s, 1);
    return buffer;
}

class _DataFormat {
    _pack_data(data) {
        let _translationTable = {};
        _translationTable[myTypeof(true)] = ['bool', '=?'];
        _translationTable[myTypeof(1)] = ['long', '=l'];
        _translationTable[myTypeof(1.1)] = ['doub', '=d'];
        _translationTable[myTypeof('')] = ['TEXT', '=s'];
        let hints = _translationTable[myTypeof(data)];
        if (!hints) return this._pack_data(data.toString());
        let descType = hints[0], length;
        if (descType === 'TEXT') {
            length = data.length;
        } else {
            length = jsPackCalcSize(hints[1]);
        }
        let lengthBuffer = jsPack('=H', length), descTypeBuffer = jsPack('=s', descType), dataBuffer = jsPack(hints[1], data);

        return _cat(descTypeBuffer, lengthBuffer, dataBuffer);
    }

    _pack_dict(table, pad = false) {
        let keys = Object.keys(table), values = [];
        for (let i = 0; i < keys.length; i++) values[i] = table[keys[i]];
        if (keys.length < 1) return '';
        if (!pad) {
            keys.forEach(_checkLen);
            keys.forEach(_checkType);
        } else {
            for (let i = 0; i < keys.length; i++) {
                if (myTypeof(keys[i]) !== myTypeof('')) {
                    keys[i] = _makeFit(keys[i].toString());
                }
            }
        }

        if (keys.length > 255) {
            throw new EgiError(`too many keys to send (${keys.length} > 255)`);
        }

        let nkeysBuffer = jsPack('=B', keys.length), valuesPacked = values.map(this._pack_data);

        let itemsPacked = [nkeysBuffer];
        for (let i = 0; i < keys.length; i++) {
            itemsPacked.push(jsPack('=s', keys[i]));
            itemsPacked.push(valuesPacked[i]);
        }

        return _cat(...itemsPacked);
    }

    _makeEventHeader(sizeOfTheRest, timestamp, duration, keycode) {
        /*
        make an event message header from the given data according to the protocol
        'sizeOfTheRest' is the size of the rest part of the event message
        */

        let sizeof_int32 = 4, addendum = 3 * sizeof_int32, total_length = addendum + sizeOfTheRest;
        return jsPack("=sH2L4s", 'D', total_length, timestamp, duration, keycode);
    }

    pack(key, timestamp = null, label = null, description = null, table = null, pad = false) {
        /*
         pack the arguments according to the Netstation Event structure ;
            if the 'pad' argument is 'False' -- an exception is raised in the case
            if either the main key or one from the table keys is not a (unique)
            four-character string ; otherwise, if the 'pad' value is True,
            the routine tries to convert truncate or pad the key to form a 4-byte string .
            nb. if the 'timestamp' argument is None -- the according field is set
                by a local routine at the moment of the call .
        */

        let duration = 1;
        if (!timestamp) {
            timestamp = msLocalTimeFromToday();
        }

        label = label || '';
        description = description || '';
        let labelBuffer = _pbuffer(label), descriptionBuffer = _pbuffer(description), tableBuffer;
        if (!table || Object.keys(table).length < 1) {
            tableBuffer = jsPack('B', 0);
        } else {
            tableBuffer = this._pack_dict(table, pad);
        }

        let size = labelBuffer.length + descriptionBuffer.length + tableBuffer.length;
        let headerBuffer = this._makeEventHeader(size, timestamp, duration, key);

        return _cat(headerBuffer, labelBuffer, descriptionBuffer, tableBuffer);
    }


}

class NetStation {
    constructor({addr=DEFAULT_ADDR, port=DEFAULT_HARDWARE_PORT}={}) {
        this._socket = new net.Socket();
        this.addr = addr;
        this.port = port;
        this._fmt = new _Format();
        this._dataFmt = new _DataFormat();
        this._systemSpec = getEndianessString();
        this._buffer = Buffer.alloc(0);

        this._socket.on('close', () => {
            console.log("Connection to Hardware closed");
        });
        this._socket.on('ready', () => {
            console.log('Hardware Connected');
        })
        this._socket.on('data', (data) => {
            this._buffer = Buffer.concat([this._buffer, data]);
        });
    }

    connect() {
        return new Promise((res, rej) => {
            this._socket.connect(this.port, this.addr, () => {
                res(true);
            });
        })
    }

    disconnect() {
        this._socket.destroy();
    }

    _read(num=null) {
        let res;
        if (num == null) {
            res = this._buffer;
            this._buffer = Buffer.alloc(0);
        } else {
            res = this._buffer.slice(0, num);
            this._buffer = this._buffer.slice(num);
        }
        return res.toString('utf8');
    }

    subscribe(callback) {
        this._socket.on('end', () => {
            callback(this._getServerResponse());
        });
    }

    _getServerResponse() {
        let code = this._read(1);
        switch(code) {
            case 'Z':
                return true;
            case 'F':
                let errorInfoLength = this._fmt.formatLength(code);
                let errorInfo = this._read(errorInfoLength);
                return false;
            case 'I':
                let versionLength = this._fmt.formatLength(code);
                let versionInfo = this._read(versionLength);
                let version = this._fmt.unpack(code, versionInfo);
                return version[0];
            default:
                return false;
        }
    }

    unsubscribe() {
        this._socket.on('end', () => {});
    }

    write(data) {
        return new Promise((res, rej) => {
            this._socket.write(data, () => {
                res(true);
            });
        });
    }

    async beginSession() {
        let message = this._fmt.pack('Q', this._systemSpec);
        if (await this.write(message)) {
            return this._getServerResponse();
        }
    }

    async endSession() {
        let message = this._fmt.pack('X');
        if (await this.write(message)) {
            return this._getServerResponse();
        }
    }

    async startRecording() {
        let message = this._fmt.pack('B');
        if (await this.write(message)) {
            return this._getServerResponse();
        }
    }

    async endRecording() {
        let message = this._fmt.pack('E');
        if (await this.write(message)) {
            return this._getServerResponse();
        }
    }

    async sendAttensionCommand() {
        let message = this._fmt.pack('A');
        if (await this.write(message)) {
            return this._getServerResponse();
        }
    }

    async sendLocalTime(msTime=null) {
        if (!msTime) msTime = msLocalTimeFromToday();
        let message = this._fmt.pack('T', msTime);
        if (await this.write(message)) {
            return this._getServerResponse();
        }
    }

    async sync(timestamp=null) {
        let ack = [0, 0];
        ack[0] = await this.sendAttensionCommand();
        ack[1] = await this.sendLocalTime();
        if (ack[0] && ack[1]) return true;
        throw new EgiError("sync command failed!")
    }

    async sendEvent({key, timestamp = null, label = 'N/A', description = 'N/A', table = null, pad = false}={}) {
        let message = this._dataFmt.pack(key, timestamp, label, description, table, pad);
        if (await this.write(message)) {
            return this._getServerResponse();
        }
    }

    async sendSimpleEvent(markerCode, timestamp=null) {
        let currentTime = timestamp || (((new Date()).getTime()) % (1000 * 60 * 60 * 24));
        let default_duration = 1; // also in milliseconds
        let sizeof_int32 = 4;
        let event_min_size = 3 * sizeof_int32;
        let evtSizeStr = jsPack('h', event_min_size),
            ctStr = jsPack('l', currentTime),
            defaultDurationStr = jsPack('l', default_duration),
            markerCodeStr = jsPack('4s', markerCode);
        let message = `D${evtSizeStr}${ctStr}${defaultDurationStr}${markerCodeStr}`;
        if (await this.write(message)) {
            return this._getServerResponse();
        }
    }
}

module.exports = {
    NetStation,
    EgiError,
}
