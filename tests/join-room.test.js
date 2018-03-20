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

  test('a new room is created when no rooms exist', function(done){

    var client1 = io.connect(SERVER_URL);

    client1.on('join-reply', function(data){
      expect(data.session_id).not.toBeUndefined();
      client1.disconnect();
      done();
    });

    client1.emit('join', {experiment_id: 'test', participants: 4});

  });

  test('existing room is joined when parameters match', function(done){

    var client1 = io.connect(SERVER_URL);
    var client2 = io.connect(SERVER_URL);

    client1.on('join-reply', function(data){
      var client1room = data.session_id;
      client2.on('join-reply', function(data){
        expect(data.session_id).toBe(client1room);
        client1.disconnect();
        client2.disconnect();
        done();
      });
      client2.emit('join', {experiment_id: 'test', participants: 4});
    });

    client1.emit('join', {experiment_id: 'test', participants: 4});

  });

  test('different room is joined when experiment_id does not match', function(done){

    var client1 = io.connect(SERVER_URL);
    var client2 = io.connect(SERVER_URL);

    client1.on('join-reply', function(data){
      var client1room = data.session_id;
      client2.on('join-reply', function(data){
        expect(data.session_id).not.toBe(client1room);
        client1.disconnect();
        client2.disconnect();
        done();
      });
      client2.emit('join', {experiment_id: 'test1', participants: 4});
    });

    client1.emit('join', {experiment_id: 'test2', participants: 4});

  });

  test('different room is joined when number of participants does not match', function(done){

    var client1 = io.connect(SERVER_URL);
    var client2 = io.connect(SERVER_URL);

    client1.on('join-reply', function(data){
      var client1room = data.session_id;
      client2.on('join-reply', function(data){
        expect(data.session_id).not.toBe(client1room);
        client1.disconnect();
        client2.disconnect();
        done();
      });
      client2.emit('join', {experiment_id: 'test', participants: 2});
    });

    client1.emit('join', {experiment_id: 'test', participants: 3});

  });

  test('different room is joined when room is full', function(done){

    var client1 = io.connect(SERVER_URL);
    var client2 = io.connect(SERVER_URL);
    var client3 = io.connect(SERVER_URL);

    client1.on('join-reply', function(data){
      var client1room = data.session_id;
      client2.on('join-reply', function(data){
        var client2room = data.session_id;
        client3.on('join-reply', function(data){
          var client3room = data.session_id;
          expect(client1room).toBe(client2room);
          expect(client3room).not.toBe(client1room);
          client1.disconnect();
          client2.disconnect();
          client3.disconnect();
          done();
        });
        client3.emit('join', {experiment_id: 'test', participants: 2});
      });
      client2.emit('join', {experiment_id: 'test', participants: 2});
    });
    client1.emit('join', {experiment_id: 'test', participants: 2});
  });



});
