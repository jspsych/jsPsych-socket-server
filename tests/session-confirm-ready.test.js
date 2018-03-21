var server = require('../server');
var io = require('socket.io-client');

const SERVER_URL = 'http://localhost:8080';

//jest.useFakeTimers();

beforeAll(function(){
  server.start();
});

afterAll(function(){
  server.stop();
});

describe('joining a room', function(){

  test('confirmation process works when everyone behaves', function(done){

    jest.useRealTimers();

    var client1 = io.connect(SERVER_URL);
    var client2 = io.connect(SERVER_URL);

    client1.on('ready-check', function(data){
      console.log('client 1 ready check');
      setTimeout(function(){
        client1.emit('ready-reply', {which: 1});
      }, 100);
    })

    client2.on('ready-check', function(data){
      console.log('client 2 ready check');
      setTimeout(function(){
        client2.emit('ready-reply', {which: 2});
      }, 200);
    })

    client1.on('start', function(data){
      client1.disconnect();
      client2.disconnect();
      done();
    });

    client1.emit('join', {experiment_id: 'test', participants: 2});
    client2.emit('join', {experiment_id: 'test', participants: 2});

  }, 2000);

  test('abort when one client fails to ready-reply', function(done){

    jest.useFakeTimers();

    var client1 = io.connect(SERVER_URL);
    var client2 = io.connect(SERVER_URL);

    client1.on('ready-check', function(data){
      client1.emit('ready-reply');
    })

    client2.on('ready-check', function(data){
      //client2.emit('ready-reply');
      jest.advanceTimersByTime(8000);
    })

    client1.on('ready-abort', function(data){
      client1.disconnect();
      client2.disconnect();
      done();
    });

    client1.emit('join', {experiment_id: 'test', participants: 2});
    client2.emit('join', {experiment_id: 'test', participants: 2});


  },1000);

});

// TODO: add test to confirm that room state is correct after aborting.
