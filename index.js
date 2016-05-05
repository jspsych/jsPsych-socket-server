var uuid = require('node-uuid');
var express = require('express');
var app = express();
var server = require('http').Server(app);
var io = require('socket.io')(server);
//var database = require('./database');

server.listen(3000);

// serve the www directory as a website
app.use(express.static('www'));

// rooms (simultaneous game instances)
var rooms = {};

io.on('connection', function (socket) {

  console.log('Client connected!');

  socket.on('join', function(data){
    var room = find_room(data);
    console.log('Client joined room '+room);
    join_room(socket, room);
    socket.emit('join-reply', {
      session_id: room
    });
  });

  socket.on('disconnect', function () {
    console.log('Client disconnected.');
    io.to(socket.room_id).emit('end', {});
    if(typeof socket.room_id !== 'undefined' && rooms[socket.room_id].participants() == 0){
      destroy_room(socket.room_id);
    }
  });

  socket.on('turn', function(data){
    rooms[socket.room_id].messages.turn.push(data);
    if(rooms[socket.room_id].messages.turn.length == rooms[socket.room_id].participants()){
      var td = rooms[socket.room_id].messages.turn;
      rooms[socket.room_id].messages.turn = [];
      io.emit('turn-reply', {data: td});
    }
  });

  socket.on('wait', function(){
    rooms[socket.room_id].messages.wait++;
    if(rooms[socket.room_id].messages.wait == rooms[socket.room_id].participants()){
      rooms[socket.room_id].messages.wait = 0;
      io.emit('wait-reply', {});
    }
  });

  socket.on('sync', function(data){
    var id = data.id;
    if(typeof rooms[socket.room_id].messages.sync[id] == 'undefined'){
      rooms[socket.room_id].messages.sync[id] = {};
      rooms[socket.room_id].messages.sync[id].content = data.content;
      rooms[socket.room_id].messages.sync[id].count = 0;
    }
    rooms[socket.room_id].messages.sync[id].count++;
    if(rooms[socket.room_id].messages.sync[id].count == rooms[socket.room_id].participants()){
      io.emit('sync-reply', {id: id, content: rooms[socket.room_id].messages.sync[id].content});
    }
  });

  socket.on('write-data', function(data){
    console.log('data to write '+JSON.stringify(data));
    //database.write(data);
  });

});

function find_room(data){

  var room_to_join;
  var room_keys = Object.keys(rooms);

  if(room_keys.length == 0){
    var new_room_id = uuid();
    rooms[new_room_id] = create_room(new_room_id, data.experiment, data.participants);
    room_to_join = new_room_id;
  } else {
    // first join rooms that are waiting for players
    for(var i=0; i<room_keys.length; i++){
      if(
        rooms[room_keys[i]].started == false &&
        rooms[room_keys[i]].participants() > 0 &&
        rooms[room_keys[i]].experiment_id == data.experiment &&
        rooms[room_keys[i]].total_participants == data.participants
      ){
        room_to_join = rooms[room_keys[i]].id;
        break;
      }
    }
    // then make new empty room
    if(typeof room_to_join == 'undefined'){
      var new_room_id = uuid();
      rooms[new_room_id] = create_room(new_room_id, data.experiment, data.participants);
      room_to_join = new_room_id;
    }
  }

  return room_to_join;
}

function create_room(id, experiment_id, total_participants){
  return {
    id: id,
    experiment_id: experiment_id,
    total_participants: total_participants,
    started: false,
    participants: function() {
      try {
        return Object.keys(io.nsps['/'].adapter.rooms[this.id].sockets).length;
      } catch (e) {
        //console.log(e);
        return 0;
      } finally {

      }
    },
    messages: {
      turn: [],
      wait: 0,
      sync: {}
    },
    join: function(socket) {
      socket.join(this.id);
      socket.room_id = this.id;
      console.log(this.participants() + ' of ' + total_participants + ' ready in room '+this.id);
      if(this.participants() == total_participants){
        console.log('Starting room '+this.id);
        this.start();
      }
    },
    start: function(){
      this.started = true;
      var clients = io.nsps['/'].adapter.rooms[this.id].sockets;
      var idx = 0;
      for(var c in clients){
        io.sockets.connected[c].player_id = idx;
        idx++;
        io.sockets.connected[c].emit('start', {player_id: io.sockets.connected[c].player_id});
      }
    }
  };
}

function join_room(socket, room_to_join) {
  rooms[room_to_join].join(socket);
}

function destroy_room(id) {
  console.log('Removing room '+id);
  delete rooms[id];
  console.log('Removed a room. Current rooms: '+JSON.stringify(Object.keys(rooms)));
}
