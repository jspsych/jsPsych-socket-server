const os = require('os');

const _ONE_DAY_MS = 1000 * 60 * 60 * 24;
function msLocalTimeFromToday() {
    return Date.now() % _ONE_DAY_MS;
}

function lstrip(s, f = ' ') {
    let i = 0;
    while (i < s.length) {
        if (s.charAt(i) !== f) break;
        i++;
    }
    return s.substring(i);
}

function _isSysLE() {
    return os.endianness() === 'LE';
}

function _toBytes(num, size = undefined, isLE = true) {
    let buffer = [];
    let i = 0;
    while (num !== 0) {
        if (size != undefined && i++ >= size) break;
        buffer.push(num & 0xff);
        num >>= 8;
    }
    while (size != undefined && i++ < size) buffer.push(0);
    if (!isLE) buffer.reverse();
    return buffer;
}

function _writeToBuffer(fmt, data, isLE = _isSysLE()) {
    let _map = {
        'L': [4, true],
        'l': [4, false],
        'H': [2, true],
        'h': [2, false],
        'B': [1, true],
        '?': [1, false],
    }
    let buffer, size, isUnsigned;
    switch(fmt) {
        case 's':
        case 'c':
            size = data.length;
            buffer = Buffer.alloc(size);
            buffer.write(data);
            break;
        case 'd':
            buffer = Buffer.alloc(8);
            if (isLE) buffer.writeDoubleLE(data, 0);
            else buffer.writeDoubleBE(data, 0);
            break;
        case 'L':
        case 'l':
        case 'H':
        case 'h':
        case 'B':
        case '?':
            [size, isUnsigned] = _map[fmt];
            buffer = Buffer.alloc(size);
            let bytes = _toBytes(data, size, isLE);
            for (let i = 0; i < size; i++) {
                buffer.writeUInt8(bytes[i], i);
            }
            break;
        default:
            buffer = Buffer.alloc(0);
    }
    return buffer;
}

function _isDigit(c) {
    return !isNaN(parseInt(c));
}

function jsPack(key, ...args) {
    if (!key) return '';
    let isLE = undefined;
    let i = 0;
    let buffer = Buffer.alloc(0);
    switch(key.charAt(i)) {
        case '@':
        case '=':
            isLE = _isSysLE();
            break;
        case '<':
            isLE = true;
            break;
        case '!':
        case '>':
            isLE = false;
            break;
        default:
            break;
    }

    if (isLE == undefined) isLE = _isSysLE();
    else i++;

    let di = 0;
    while (i < key.length) {
        let j = i, n = 0;
        while (j < key.length) {
            if (!_isDigit(key.charAt(j))) break;
            n = n * 10 + parseInt((key.charAt(j)));
            j++;
        }
        if (j >= key.length) throw new EgiError('format not correct');
        let fmt = key.charAt(j);
        if (!n) n = 1;
        if (fmt === 's') {
            let next = Buffer.alloc(n);
            next.write(args[di++]);
            buffer = Buffer.concat([buffer, next]);
        } else {
            while (n-- > 0) {
                if (di === args.length) throw new EgiError('not enough args');
                buffer = Buffer.concat([buffer, _writeToBuffer(fmt, args[di++], isLE)]);
            }
        }
        
        i = j + 1;
    }

    return buffer;
}

function _getEndianessString() {
    let _map = {
        'LE': 'NTEL',
        'BE': 'UNIX',
    }
    return _map[os.endianness()]
}


function _isFloat(n) {
    return n === +n && n !== (n|0);
}


function myTypeof(o) {
    let raw = typeof(o);
    if (raw === 'number' && _isFloat(o)) return 'float';
    return raw;
}

module.exports = {
    jsPack,
    msLocalTimeFromToday,
    myTypeof,
    lstrip
};