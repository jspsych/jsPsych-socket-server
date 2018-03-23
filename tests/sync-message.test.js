var server = require('../server');
var io = require('socket.io-client');

const SERVER_URL = 'http://localhost:8080';

describe('sync message', function(){

  beforeAll(function(){
    server.start();
  });

  afterAll(function(){
    server.stop();
  });

  test('behaves as expected', function(done){

    var client1 = io.connect(SERVER_URL);
    var client2 = io.connect(SERVER_URL);

    var client1_id, client2_id;

    client1.emit('join', {experiment_id: 'test', participants: 2});
    client2.emit('join', {experiment_id: 'test', participants: 2});

    var c1msg = null;
    var c2msg = null;
    client1.on('sync-reply', function(msg){
      c1msg = msg;
      if(c2msg !== null){
        finish();
      }
    });
    client2.on('sync-reply', function(msg){
      c2msg = msg;
      if(c1msg !== null){
        finish();
      }
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

    client2.on('start', function(data){
      client2_id = data.player_id;
    })

    client1.on('start', function(data){
      client1_id = data.player_id;
        client1.emit('sync', {message: 'foo'});
        setTimeout(function(){
          client2.emit('sync', {message: 'bar'});
        }, 200);
    });

    function finish(){
      expect(c1msg).toEqual(c2msg);
      client1.disconnect();
      client2.disconnect();
      done();
    }

  });

});
