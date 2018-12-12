var server = require('../../server');
var io = require('socket.io-client');

const SERVER_URL = 'http://localhost:8080';

describe('turn message', function(){

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

    const mock1 = jest.fn();

    client1.on('turn-reply', mock1);
    client2.on('turn-reply', function(msg){
      expect(msg.data[client1_id].player_id).toBe(client1_id);
      expect(msg.data[client2_id].player_id).toBe(client2_id);
      expect(msg.data[client1_id].turn_data.message).toBe('foo');
      expect(msg.data[client2_id].turn_data.message).toBe('bar');
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

    client2.on('start', function(data){
      client2_id = data.player_id;
    })

    client1.on('start', function(data){
      client1_id = data.player_id;
        client1.emit('turn', {message: 'foo'});
        setTimeout(function(){
          expect(mock1.mock.calls.length).toBe(0);
          client2.emit('turn', {message: 'bar'});
        }, 200);
    });

  });

  test('cannot be overwritten', function(done){

    var client1 = io.connect(SERVER_URL);
    var client2 = io.connect(SERVER_URL);

    var client1_id, client2_id;

    client1.emit('join', {experiment_id: 'test', participants: 2});
    client2.emit('join', {experiment_id: 'test', participants: 2});

    const mock1 = jest.fn();

    client1.on('turn-reply', mock1);
    client2.on('turn-reply', function(msg){
      expect(msg.data[client1_id].player_id).toBe(client1_id);
      expect(msg.data[client2_id].player_id).toBe(client2_id);
      expect(msg.data[client1_id].turn_data.message).toBe('foo');
      expect(msg.data[client2_id].turn_data.message).toBe('bar');
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

    client2.on('start', function(data){
      client2_id = data.player_id;
    })

    client1.on('start', function(data){
      client1_id = data.player_id;
        client1.emit('turn', {message: 'foo'});
        client1.emit('turn', {message: 'zzz'});
        setTimeout(function(){
          expect(mock1.mock.calls.length).toBe(0);
          client2.emit('turn', {message: 'bar'});
        }, 200);
    });

  });

});
