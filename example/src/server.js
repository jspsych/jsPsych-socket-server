const express = require('express');
const { NetStation } = require('../../lib/netstation');
const app = express();
app.use(express.static('.'));
const server = require('http').Server(app);
const io = require('socket.io').listen(server);

// io.set('origins', '*:*');
/*
const io = require('socket.io')(server, {
	origins: "*:*" // "http://localhost:* http://127.0.0.1:*"
});
*/

const DEFAULT_PORT = 53352;
const DEFAULT_HARDWARE_PORT = 53353;
const DEFAULT_ADDR = '127.0.0.1';

function start({port=DEFAULT_PORT, hardwareAddr=DEFAULT_ADDR, hardwarePort=DEFAULT_HARDWARE_PORT}={}) {
    const station = new NetStation({addr: hardwareAddr, port: hardwarePort});
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

            client.on('error', (error) => {
                console.log(error);
            });
			
			client.on('egi_beginSession', () => {
				station.beginSession()
			});
			
			client.on('egi_startRecording', () => {
				station.startRecording();
			});
			
			client.on('egi_endRecording', () => {
				station.endRecording();
			});
			
			client.on('egi_endSession', () => {
				station.endSession();
			});
			
			client.on('egi_sync', () => {
				station.sync();
			});
			
			client.on('egi_sendEvent', (args={}) => {
				station.sendEvent(args);
			})
			
			client.on('egi_sendAttentionCommand', () => {
				station.sendAttensionCommand();
			})
			
			client.on('egi_sendLocalTime', (timestamp=null) => {
				station.sendLocalTime(timestamp);
			})
        });

        io.on('disconnect', () => {
            console.log('Disconnected by a client.');
        });

        io.on('error', (error) => {
            console.log(error);
        });
    });
}

start({hardwareAddr: '10.10.10.42', hardwarePort: 55513});