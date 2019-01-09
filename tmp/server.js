const net = require('net');
const app = require('express')();
const server = require('http').Server(app);
const io = require('socket.io')(server);
const hardwareSocketClient = new net.Socket();

const DEFAULT_PORT = 53352;
const DEFAULT_HARDWARE_PORT = 53353;
const DEFAULT_ADDR = '127.0.0.1';

class NetStation {
    constructor({addr=DEFAULT_ADDR, port=DEFAULT_HARDWARE_PORT}={}) {
        this._socket = new net.Socket();
        this.addr = addr;
        this.port = port;
        this._socket.on('close', () => {
            console.log("Connection to Hardware closed");
        });
    }

    connect() {
        return new Promise((res, rej) => {
            this._socket.connect(this.port, this.addr, () => {
                console.log('Hardware Connected');
                res(true);
            });
        })
        
    }

    disconnect() {
        this._socket.destroy();
    }

    subscribe(callback) {
        this._socket.on('data', (data) => {
            // callback(this._interpretServerResponse(data.toString('utf8')));
            callback(data.toString('utf8'));
        });
    }

    _interpretServerResponse(code) {
        switch(code) {
            case 'Z':
                return true;
            case 'F':
            default:
                return false;
        }
    }

    unsubscribe() {
        this._socket.on('data', null);
    }

    write(data) {
        return new Promise((res, rej) => {
            this._socket.write(data, () => {
                res(true);
            });
        });
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
                station.write(data);
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