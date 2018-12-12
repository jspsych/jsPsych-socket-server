var server = require('../../server');
var io = require('socket.io-client');

const SERVER_URL = 'http://localhost:8080';

beforeAll(function(){
  server.start();
});

afterAll(function(){
  server.stop();
});


describe('session updates', function(){

  test('session-update message received when new member joins', function(done){

    var client1 = io.connect(SERVER_URL);
    var client2 = io.connect(SERVER_URL);

    client1.on('join-reply', function(data){
      client2.emit('join', {experiment_id: 'test', participants: 4});
    });

    var first_msg = true;
    client1.on('session-update', function(data){
      if(first_msg){
        expect(data.participants).toBe(1);
        first_msg = false;
      } else {
        expect(data.participants).toBe(2);
        client1.disconnect();
        client2.disconnect();
        done();
      }
    });

    client1.emit('join', {experiment_id: 'test', participants: 4});

  });

  test('session-update message received when member leaves', function(done){

    var client1 = io.connect(SERVER_URL);
    var client2 = io.connect(SERVER_URL);

    client1.on('join-reply', function(data){
      client2.emit('join', {experiment_id: 'test', participants: 4});
    });

    var msg = 1;
    client1.on('session-update', function(data){
      if(msg == 1){
        msg++;
      } else if(msg == 2) {
        msg++;
        client2.disconnect();
      } else {
        expect(data.participants).toBe(1);
        client1.disconnect();
        done();
      }
    });

    client1.emit('join', {experiment_id: 'test', participants: 4});
  });

});
