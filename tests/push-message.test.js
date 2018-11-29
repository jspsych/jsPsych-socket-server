var server = require('../server');
var io = require('socket.io-client');

const SERVER_URL = 'http://localhost:8080';

describe('push message', function(){

  beforeAll(function(){
    server.start();
  });

  afterAll(function(){
    server.stop();
  });

  test('sends data to other clients in session', function(done){

    var client1 = io.connect(SERVER_URL);
    var client2 = io.connect(SERVER_URL);

    client1.emit('join', {experiment_id: 'test', participants: 2});
    client2.emit('join', {experiment_id: 'test', participants: 2});

    const m = jest.fn();

    client1.on('push-reply', m);
    
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

    client2.on('start', function(){
      client2.emit('push', {value: 'foo'});
      setTimeout(function(){
        expect(m.mock.calls.length).toBe(1);
        client1.disconnect();
        client2.disconnect();
        done();
      }, 200);
    });

  });

  test('does not send data to clients in other sessions', function(done){

    var client1 = io.connect(SERVER_URL);
    var client2 = io.connect(SERVER_URL);
    var client3 = io.connect(SERVER_URL);

    client1.emit('join', {experiment_id: 'test', participants: 2});
    client2.emit('join', {experiment_id: 'test', participants: 2});
    client3.emit('join', {experiment_id: 'other', participants: 2});

    const m = jest.fn();

    client3.on('push-reply', m);
    
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

    client2.on('start', function(){
      client2.emit('push', {value: 'foo'});
      setTimeout(function(){
        expect(m.mock.calls.length).toBe(0);
        client1.disconnect();
        client2.disconnect();
        client3.disconnect();
        done();
      }, 200);
    });

  });

});
