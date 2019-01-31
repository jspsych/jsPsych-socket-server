const io = require('socket.io-client');

const client = io('http://127.0.0.1:53352');

client.on('send_event', (data) => {
    console.log(`From server: ${data}`);
});

const sleep = (t=500) => new Promise((res, rej) => setTimeout(res, t));

client.on('connect', async () => {
    console.log('connected');

	client.emit('egi_beginSession');
	await sleep(1000);
	
	client.emit('egi_sync');
	// await sleep();
	// client.emit('sync');
	// await sleep();
	// client.emit('sync');
	// await sleep();
	// client.emit('sync');
	// await sleep();
	// client.emit('sync');
	// await sleep();
	
	
	await sleep(1000);
	client.emit('egi_startRecording');
	await sleep(1000);
	let i = 0;
	while (i++ < 10) {
		client.emit('egi_sendEvent', {
			key: `aaaa`, 
			label: `label${i}`, 
			description: `description${i}`, 
			table: {'test': i % 2 ? 'correct' : 'incorrect'}
		});
		await sleep(1000);
	}
	await sleep(1000);
	
	client.emit('egi_endRecording');
	await sleep(0);
	
	
	client.emit('egi_endSession');
	await sleep(0);
	client.destroy();
	

	/*
    client.emit('send_event', `QNTEL`);
    client.emit('send_event', 'B');
    setTimeout(() => {
        client.emit('send_event', 'D1');
    }, 500);
    setTimeout(() => {
        client.emit('send_event', 'E');
        client.destroy();
    }, 5000);
    */
    // setTimeout(()=>{
    //     setTimeout(()=>{
    //         client.emit('send_event', 'E');
    //         client.destroy();
    //     }, 1000);
    // }, 500);
    
});
