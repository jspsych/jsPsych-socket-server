const io = require('socket.io-client');

const client = io('http://127.0.0.1:53352');

client.on('send_event', (data) => {
    console.log(data);
});

client.on('connect', () => {
    console.log('connected')
    let i = 0;
    setInterval(() => {
        client.emit('send_event', `i = ${i++}`);
    }, 500);
});
