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

  var room = {};

  room.id = id;
  room.experiment_id = experiment_id;
  room.total_participants = total_participants;
  room.started = false;

  room.messages = {
    turn: [],
    wait: 0,
    sync: {},
    ready: []
  }

  // returns the number of people in the room
  room.participants = function(){
    try {
      return Object.keys(io.nsps['/'].adapter.rooms[this.id].sockets).length;
    } catch (e) {
      //console.log(e);
      return 0;
    } finally {

    }
  };

  // adds client to this room
  room.join =  function(client) {
    client.join(this.id);
    client.room_id = this.id;
    this.update_all();
    console.log(this.participants() + ' of ' + this.total_participants + ' ready in room '+this.id);
    if(this.participants() == this.total_participants){
      console.log('Confirming room '+this.id);
      this.confirm_ready();
    }
  };

  // called if someone disconnects
  room.leave = function() {
    this.update_all();
  }

  room.update_all = function(){
    var n_participants = this.participants();
    io.to(this.id).emit('room-update', {
      participants: n_participants
    });
  }

  room.confirm_ready = function() {
    this.messages.ready = []; // clear the ready message holder
    var clients = io.nsps['/'].adapter.rooms[this.id].sockets;
    var idx;

    // TODO: set a timeout here...

    for(var c in clients){
      io.sockets.connected[c].ready_id = idx;
      idx++;
      io.sockets.connected[c].once('ready-reply', function(message){
        this.messages.ready.push(message.id);
        if(this.messages.ready.length == this.total_participants){
          // TODO: end timeout here
          this.start();
        }
      });
      io.sockets.connected[c].emit('ready', {id: io.sockets.connected[c].ready_id});
    }
  };

  room.start = function(){
    this.started = true;
    var clients = io.nsps['/'].adapter.rooms[this.id].sockets;
    var idx = 0;
    for(var c in clients){
      io.sockets.connected[c].player_id = idx;
      idx++;
      io.sockets.connected[c].emit('start', {player_id: io.sockets.connected[c].player_id});
    }
  }

  return room;
}

function join_room(socket, room_to_join) {
  rooms[room_to_join].join(socket);
}

function destroy_room(id) {
  console.log('Removing room '+id);
  delete rooms[id];
  console.log('Removed a room. Current rooms: '+JSON.stringify(Object.keys(rooms)));
}
