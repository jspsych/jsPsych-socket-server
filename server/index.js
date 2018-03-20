var uuid = require('uuid');
var express = require('express');
var app = express();
var server = require('http').createServer(app);
var io = require('socket.io')(server);

//var database = require('./database');
//var config = JSON.parse(fs.readFileSync('config.json'));
// TODO: error handling / no database handling here...
//var database = require('./'+config.database.link);

// defaults
const DEFAULT_PORT = 8080;

// database
var database;

// rooms (simultaneous game instances)
var rooms = [];

function start_webserver(data){
  var port = data.port || DEFAULT_PORT; // use default value if none specified
  server.listen(port);
  if(typeof data.directory !== 'undefined'){
    // serve the www directory as a website
    app.use(express.static(data.directory));
  }
}

function stop_webserver(){
  server.close();
}

function start_socket(){

  io.on('connection', function (socket) {

    socket.on('join', function(data){
      var room = find_room(data.experiment_id, data.participants, socket);
      socket.emit('join-reply', {
        session_id: room.id
      });
    });

    socket.on('disconnect', function () {
      if(typeof socket.room !== 'undefined'){
        socket.room.leave()
      }
      //io.to(socket.room_id).emit('end', {});
      /*if(typeof socket.room_id !== 'undefined' && rooms[socket.room_id].participants() == 0){
        destroy_room(socket.room_id);
      }*/
    });

/*
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
      if(typeof database !== 'undefined'){
        database.write(data);
      } else {
        console.log('Warning: no database connected');
      }
    });

    socket.emit('connection-reply', {});
*/
  });
}

function init_database(link_object, opts){
  database = link_object;
  database.connect(opts);
}

function find_room(experiment_id, participants, client){

  var room;

  // first join rooms that are waiting for players
  for(var i=0; i<rooms.length; i++){
    if(rooms[i].join(experiment_id, participants, client)){
      room = rooms[i];
      break;
    }
  }
  // otherwise, create a new room and join it.
  if(typeof room == 'undefined'){
    var room = create_room(experiment_id, participants);
    rooms.push(room);
    room.join(experiment_id, participants, client);
  }

  return room;
}

function create_room(experiment_id, total_participants){

  var room = {};

  room.id = uuid();
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

  // adds client to this room if space is available and experiment_id matches
  room.join =  function(experiment_id, total_participants, client) {
    // check if experiment has already started or if room is full
    if(this.experiment_id !== experiment_id || total_participants !== this.total_participants || this.started || this.participants() >= this.total_participants) {
      return false;
    }
    client.join(this.id);
    client.room = this;

    this.update();

    // when room is full, get confirmation from everyone that session can start
    if(this.participants() == this.total_participants){
      this.confirm_ready();
    }
    return true;
  };

  // called if someone disconnects
  room.leave = function(client) {
    // leaving the room is automatic when client disconnects,
    // this method just handles any residual consequences of
    // leaving.
    this.update();
  }

  // updates each client with the number of currently connected participants
  room.update = function(){
    var n_participants = this.participants();
    io.to(this.id).emit('room-update', {
      participants: n_participants
    });
  }

  room.confirm_ready = function() {
    var ready_count = 0;
    var clients = io.in(this.id).connected;
    /*var abort_timeout = setTimeout(()=>{
      this.abort_start();
    }, 5000);*/
    for(var id in clients){

      clients[id].confirmed_ready = false;
      console.log(id);
      clients[id].once('ready-reply', () => {
        ready_count++;
        clients[id].confirmed_ready = true;
        console.log('ready-reply' + id);
        if(ready_count == this.total_participants){
          clearTimeout(abort_timeout);
          this.start();
        }
      });
    }
    io.to(this.id).emit('ready-check', {});
  };

  room.start = function(){
    this.started = true;
    var clients = io.in(this.id).connected;
    var idx = 0;
    for(var id in clients){
      clients[id].player_id = idx;
      idx++;
      io.to(id).emit('start', {player_id: clients[id].player_id});
    }
  }

  room.abort_start = function(){
    console.log('aborting start');
    io.to(this.id).emit('ready-abort');
    var clients = io.in(this.id).connected;
    for(var id in clients){
      if(!clients[id].confirmed_ready){
        clients[id].leave(this.id);
        room.leave();
      }
    }
  }

  return room;
}

function destroy_room(id) {
  delete rooms[id];
}

module.exports = {

  start: function(opts){
    opts = opts || {};
    start_webserver(opts);

    start_socket();

    if(typeof opts.database !== 'undefined'){
      if(typeof opts.database.connect === 'function' && typeof opts.database.write === 'function'){
        init_database(opts.database, opts.database_config);
      }
    }

  },

  stop: function(){
    stop_webserver();
  }

}
