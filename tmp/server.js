const {
    NetStation,
} = require('./netstation');
const app = require('express')();
const server = require('http').Server(app);
const io = require('socket.io')(server);

const DEFAULT_PORT = 53352;
const DEFAULT_HARDWARE_PORT = 53353;
const DEFAULT_ADDR = '127.0.0.1';


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