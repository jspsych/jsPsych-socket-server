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

const _FORMAT_BYTE_SIZE_MAP = {
    // [size, isUnsigned]
    'L': [4, true],
    'l': [4, false],
    'H': [2, true],
    'h': [2, false],
    'B': [1, true],
    '?': [1, false],
    's': [1, false],
    'c': [1, false],
    'd': [8, true],
}

function _writeToBuffer(fmt, data, isLE = _isSysLE()) {
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
            [size, isUnsigned] = _FORMAT_BYTE_SIZE_MAP[fmt];
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

function jsPackCalcSize(fmt) {
    let res = 0, i = 0;
    while (i < fmt.length) {
        let j = i, n = 0;
        while (j < fmt.length) {
            let c = fmt.charAt(j);
            if (!_isDigit(c)) break;
            n = n * 10 + parseInt(c);
            j++;
        }
        if (j >= fmt.length) throw new EgiError('format not correct');
        if (!n) n = 1;
        res += n * ((_FORMAT_BYTE_SIZE_MAP[fmt.charAt(j)] && _FORMAT_BYTE_SIZE_MAP[fmt.charAt(j)][0]) || 0);

        i = j + 1;
    }
    return res;
}

function jsPack(key, ...args) {
    let isLE = undefined, i = 0, buffer = Buffer.alloc(0);
    if (key && i < key.length) {
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
    }

    if (isLE == undefined) {
        // do not skip first
        isLE = _isSysLE();
    } else {
        // first character is not format
        i++;
    }

    let di = 0;
    while (i < key.length) {
        let j = i, n = 0;
        while (j < key.length) {
            let c = key.charAt(j);
            if (!_isDigit(c)) break;
            n = n * 10 + parseInt(c);
            j++;
        }
        if (j >= key.length) throw new EgiError('format not correct');
        let fmt = key.charAt(j);
        if (!n) n = 1;
        if (fmt === 's') {
            let data = args[di++], next = Buffer.alloc(data.length);
            next.write(data);
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

function getEndianessString() {
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
    jsPackCalcSize,
    msLocalTimeFromToday,
    myTypeof,
    lstrip,
	getEndianessString,
};