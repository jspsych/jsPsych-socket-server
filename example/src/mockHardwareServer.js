const net = require("net");

const DEFAULT_PORT = 53353;
const DEFAULT_ADDR = '127.0.0.1';

const server = net.createServer(function(socket) {
    socket.on('data', function(data) {
        console.log('Received from client: ' + data);
        socket.write(`<<HARDWARE-MOCK-RESPONSE: ${data}>>`);
    });

    socket.on("error", function(err) {
        console.log(err);
    });
});

server.listen(DEFAULT_PORT, DEFAULT_ADDR, () => {
    console.log(`Start listening at http://${DEFAULT_ADDR}:${DEFAULT_PORT}\r\n`);
});