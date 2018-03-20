var server = require('../server');
var io = require('socket.io-client');

const SERVER_URL = 'http://localhost:8080';

describe('joining a room', function(){

  beforeAll(function(){
    server.start();
  });

  afterAll(function(){
    server.stop();
  });

  test('confirmation process works when everyone behaves', function(done){
    var client1 = io.connect(SERVER_URL);
    var client2 = io.connect(SERVER_URL);

    client1.on('join-reply', function(data){
      client2.emit('join', {experiment_id: 'test', participants: 2});
    });

    client1.on('ready-check', function(data){
      client1.emit('ready-reply');
    })

    client2.on('ready-check', function(data){
      client2.emit('ready-reply');
    })

    client1.on('start', function(data){
      done();
    });

    client1.emit('join', {experiment_id: 'test', participants: 2});

  })

});
