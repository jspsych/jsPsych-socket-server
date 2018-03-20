var server = require('../server');
var io = require('socket.io-client');

const SERVER_URL = 'http://localhost:8080';

jest.useFakeTimers();

beforeAll(function(){
  server.start();
});

afterAll(function(){
  server.stop();
});

describe('joining a room', function(){

  test.only('confirmation process works when everyone behaves', function(done){
    var client1 = io.connect(SERVER_URL);
    var client2 = io.connect(SERVER_URL);

    client1.on('join-reply', function(data){
      client2.emit('join', {experiment_id: 'test', participants: 2});
    });

    client1.on('ready-check', function(data){
      console.log('client 1 ready check')
      client1.emit('ready-reply');
    })

    client2.on('ready-check', function(data){
      console.log('client 2 ready check')
      client2.emit('ready-reply');
    })

    client1.on('start', function(data){
      client1.disconnect();
      client2.disconnect();
      done();
    });

    client1.emit('join', {experiment_id: 'test', participants: 2});

  }, 1000);

  test('abort when one client fails to ready-reply', function(done){
    var client1 = io.connect(SERVER_URL);
    var client2 = io.connect(SERVER_URL);

    client1.on('join-reply', function(data){
      client2.emit('join', {experiment_id: 'test', participants: 2});
    });

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
  },1000);

});
