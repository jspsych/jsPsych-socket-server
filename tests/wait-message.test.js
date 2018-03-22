var server = require('../server');
var io = require('socket.io-client');

const SERVER_URL = 'http://localhost:8080';

describe('wait message', function(){

  beforeAll(function(){
    server.start();
  });

  afterAll(function(){
    server.stop();
  });

  test('behaves as expected', function(done){

    var client1 = io.connect(SERVER_URL);
    var client2 = io.connect(SERVER_URL);

    client1.emit('join', {experiment_id: 'test', participants: 2});
    client2.emit('join', {experiment_id: 'test', participants: 2});

    const mock1 = jest.fn();

    client1.on('wait-reply', mock1);
    client2.on('wait-reply', function(){
      client1.disconnect();
      client2.disconnect();
      done();
    });

    client1.on('ready-check', function(data){
      setTimeout(function(){
        client1.emit('ready-reply');
      }, 100);
    })

    client2.on('ready-check', function(data){
      setTimeout(function(){
        client2.emit('ready-reply');
      }, 200);
    })

    client1.on('start', function(){
        client1.emit('wait');
        setTimeout(function(){
          expect(mock1.mock.calls.length).toBe(0);
          client2.emit('wait');
        }, 200);
    });

  });

  test('extra wait messages from a single client are ignored', function(done){

    var client1 = io.connect(SERVER_URL);
    var client2 = io.connect(SERVER_URL);

    client1.emit('join', {experiment_id: 'test', participants: 2});
    client2.emit('join', {experiment_id: 'test', participants: 2});

    const mock1 = jest.fn();

    client1.on('wait-reply', mock1);
    client2.on('wait-reply', function(){
      client1.disconnect();
      client2.disconnect();
      done();
    });

    client1.on('ready-check', function(data){
      setTimeout(function(){
        client1.emit('ready-reply');
      }, 100);
    })

    client2.on('ready-check', function(data){
      setTimeout(function(){
        client2.emit('ready-reply');
      }, 200);
    })

    client1.on('start', function(){
        client1.emit('wait');
        client1.emit('wait');
        client1.emit('wait');
        setTimeout(function(){
          expect(mock1.mock.calls.length).toBe(0);
          client2.emit('wait');
        }, 200);
    });

  });

});
