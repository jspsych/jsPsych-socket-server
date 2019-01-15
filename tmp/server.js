const net = require('net');
const os = require('os');
const struct = require("python-struct");
const app = require('express')();
const server = require('http').Server(app);
const io = require('socket.io')(server);
const hardwareSocketClient = new net.Socket();

const DEFAULT_PORT = 53352;
const DEFAULT_HARDWARE_PORT = 53353;
const DEFAULT_ADDR = '127.0.0.1';

class EgiError extends Error {
    constructor(message) {
        super(message);
        this.name = 'EgiError';
    }
}

var _TS_LAST = 0;
function msLocalTime(warn=false) {
    let modulo = 1000000000;
    let now = (new Date()).getTime();
    let ms_remainder = now % modulo;
    if (warn && ms_remainder < _TS_LAST) {
        throw new EgiError("internal 32-bit counter passed through zero, please resynchronize (call .synch() once again)");
    }
    _TS_LAST = ms_remainder;
    return ms_remainder;
}

function lstrip(s, f = ' ') {
    let i = 0;
    while (i < s.length) {
        if (s.charAt(i) !== f) break;
        i++;
    }
    return s.substring(i);
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
        return struct.sizeOf(this._get(key));
    }

    pack(key, ...args) {
        // no native
        // let fmt = '=c' + lstrip(this._get(key), '=');
        let fmt = '=c' + lstrip(this._get(key), '=');
        return struct.pack(fmt, [key, ...args]);
    }

    unpack(key, data) {
        return struct.unpack(this._get(key), data);
    }
}

function _getEndianessString() {
    let _map = {
        'LE': 'NTEL',
        'BE': 'UNIX',
    }
    return _map[os.endianness()]
}

//concatenate all the strings in a 'packed' string
function _cat(...strings) {
    let args = strings.filter(s => s).map(s => s.toString());
    let fmt = args.map(a => `${a.length}s`).join('');
    return struct.pack(fmt, args);
}

//pack 's' as a single-byte-counter Pascal string
function pstring(s) {
    if (!s) return '';
    return struct.pack(`${s.length + 1}p`, [s]);
}

function isFloat(n) {
    return n === +n && n !== (n|0);
}


function _typeof(o) {
    let raw = typeof(o);
    if (raw === 'number' && isFloat(o)) return 'float';
    return raw;
}

function checkLen(k) {
    if (k.length !== 4) {
        throw new EgiError(`${k}: EGI wants the key to be exactly four characters!`)
    }
    return true;
}

function checkType(k) {
    if (typeof(k) !== 'string') {
        throw new EgiError(`${typeof(k)}: EGI wants the key to be four _characters_ (not %s) !`)
    }
    return true;
}

function makeFit(k) {
    let d = k.length - 4;
    if (d > 0) {
        let arr = [];
        for (let i = 0; i < d; i++) arr.push(' ');
        return k + arr.join('');
    } else {
        return k.substring(0, 4);
    }
}

class _DataFormat {
    constructor() {
        this._translationTable = {};
        this._translationTable[_typeof(true)] = ['boolean', '=?'];
        this._translationTable[_typeof(1)] = ['long', '=l'];
        this._translationTable[_typeof(1.1)] = ['double', '!d'];
        this._translationTable[_typeof('')] = ['TEXT', '%ds'];
    }

    _pack_data(data) {
        let hints = this._translationTable[_typeof(data)];
        if (!hints) return this._pack_data(data.toString());
        let desctype = hints[0], length, dataStr;
        if (desctype === 'TEXT') {
            length = data.length;
            dataStr = data;
        } else {
            length = struct.sizeOf(hints[1]);
            dataStr = struct.pack(hints[1], [data]);
        }
        let lengthStr = struct.pack('=H', [length]);
        return _cat(desctype, [lengthStr, dataStr]);
    }

    _pack_dict(table, pad = false) {
        let keys = Object.keys(table), values = [];
        for (let i = 0; i < keys.length; i++) values[i] = table[keys[i]];
        if (keys.length < 1) return struct.pack('0s', ['']);
        if (!pad) {
            keys.forEach(checkLen);
            keys.forEach(checkType);
        } else {
            for (let i = 0; i < keys.length; i++) {
                if (_typeof(keys[i]) !== _typeof('')) {
                    keys[i] = makeFit(keys[i].toString());
                }
            }
        }

        if (keys.length > 255) {
            throw new EgiError(`too many keys to send (${keys.length} > 255)`);
        }

        let nkeysStr = struct.pack('=B', [keys.length]);
        let valuePacked = values.map(this._pack_data);

        let itemsPacked = [];
        for (let i = 0; i < (2 * keys.length + 1); i++) {
            itemsPacked.push(nkeysStr);
        } 
        let j = 0, k = 0;
        for (let i = 1; i < itemsPacked.length; i++) {
            if (i % 2 == 1) {
                itemsPacked[i] = keys[j++];
            } else {
                itemsPacked[i] = valuePacked[k++];
            }
        }

        return _cat(...itemsPacked);
    }

    _makeEventHeader(sizeOfTheRest, timestamp, duration, keycode) {
        /*
        make an event message header from the given data according to the protocol
        'sizeOfTheRest' is the size of the rest part of the event message
        */

        let sizeof_int32 = 4, addendum = 3 * sizeof_int32, total_length = addendum + sizeOfTheRest;
        return struct.pack("=sH2L4s", ['D', total_length, timestamp, duration, keycode]);
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
            timestamp = msLocalTime();
        }

        label = label || '';
        description = description || '';
        let labelStr = pstring(label), descriptionStr = pstring(description), tableStr;
        if (!table || Object.keys(table).length < 1) {
            tableStr = struct.pack('B', [0]);
        } else {
            tableStr = this._pack_dict(table, pad);
        }

        let size = labelStr.length + descriptionStr.length + tableStr.length;
        let headerStr = this._makeEventHeader(size, timestamp, duration, key);
        return _cat(headerStr, labelStr, descriptionStr, tableStr);
    }


}

class NetStation {
    constructor({addr=DEFAULT_ADDR, port=DEFAULT_HARDWARE_PORT}={}) {
        this._socket = new net.Socket();
        this.addr = addr;
        this.port = port;
        this._fmt = new _Format();
        this._dataFmt = new _DataFormat();
        this._systemSpec = _getEndianessString();
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
            // callback(data.toString('utf8'));
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

    async sendAttenionCommand() {
        let message = this._fmt.pack('A');
        if (await this.write(message)) {
            return this._getServerResponse();
        }
    }

    async sendLocalTime(msTime=null) {
        if (!msTime) msTime = msLocalTime();
        let message = this._fmt.pack('T', msTime);
        if (await this.write(message)) {
            return this._getServerResponse();
        }
    }

    async sync(timestamp=null) {
        if (await sendAttenionCommand() && await sendLocalTime(timestamp)) {
            return true;
        }
        throw new EgiError("sync command failed!")
    }

    async sendEvent(key, timestamp = null, label = null, description = null, table = null, pad = false) {
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
        let evtSizeStr = struct.pack('h', [event_min_size]),
            ctStr = struct.pack('l', [current_time]),
            defaultDurationStr = struct.pack('l', [default_duration]),
            markerCodeStr = struct.pack('4s', [markerCode]);
        let message = `D${evtSizeStr}${ctStr}${defaultDurationStr}${markerCodeStr}`;
        if (await this.write(message)) {
            return this._getServerResponse();
        }
    }
}

function start({port=DEFAULT_PORT, hardwareAddr=DEFAULT_ADDR, hardwarePort=DEFAULT_HARDWARE_PORT}={}) {
    const station = new NetStation(hardwareAddr, hardwarePort);
    station.connect().then(() => {
        server.listen(port, () => {
            console.log(`Start listening at port ${port}\r\n`);
        });

        const getServerResponse = (data) => {
            io.emit('send_event', data);
        };

        station.subscribe(getServerResponse);

        io.on('connect', (client) => {
            console.log('Connected by a client.');

            client.on('send_event', (data) => {
                station.beginSession();
            });

            client.on('error', (error) => {
                console.log(error);
            });
        });

        io.on('disconnect', () => {
            console.log('Disconnected by a client.');
        });

        io.on('error', (error) => {
            console.log(error);
        });
    });
}

start()