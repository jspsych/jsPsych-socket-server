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

// sessions (simultaneous game instances)
var sessions = [];

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

function start_socketserver(){

  io.on('connection', function (socket) {

    socket.on('join', function(data){
      var session = find_session(data.experiment_id, data.participants, socket);
      socket.emit('join-reply', {
        session_id: session.id
      });
    });

    socket.on('disconnect', function () {
      if(typeof socket.session !== 'undefined'){
        socket.session.leave()
      }
    });

    socket.on('ready-reply', function (data) {
      console.log('ready-reply');
      console.log(data.which);
      if(typeof socket.session !== 'undefined'){
        socket.session.client_ready(socket);
      }
    });

/*
    socket.on('turn', function(data){
      sessions[socket.session_id].messages.turn.push(data);
      if(sessions[socket.session_id].messages.turn.length == sessions[socket.session_id].participants()){
        var td = sessions[socket.session_id].messages.turn;
        sessions[socket.session_id].messages.turn = [];
        io.emit('turn-reply', {data: td});
      }
    });

    socket.on('wait', function(){
      sessions[socket.session_id].messages.wait++;
      if(sessions[socket.session_id].messages.wait == sessions[socket.session_id].participants()){
        sessions[socket.session_id].messages.wait = 0;
        io.emit('wait-reply', {});
      }
    });

    socket.on('sync', function(data){
      var id = data.id;
      if(typeof sessions[socket.session_id].messages.sync[id] == 'undefined'){
        sessions[socket.session_id].messages.sync[id] = {};
        sessions[socket.session_id].messages.sync[id].content = data.content;
        sessions[socket.session_id].messages.sync[id].count = 0;
      }
      sessions[socket.session_id].messages.sync[id].count++;
      if(sessions[socket.session_id].messages.sync[id].count == sessions[socket.session_id].participants()){
        io.emit('sync-reply', {id: id, content: sessions[socket.session_id].messages.sync[id].content});
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

function find_session(experiment_id, participants, client){

  var session;

  // first join sessions that are waiting for players
  for(var i=0; i<sessions.length; i++){
    if(sessions[i].join(experiment_id, participants, client)){
      session = sessions[i];
      break;
    }
  }
  // otherwise, create a new session and join it.
  if(typeof session == 'undefined'){
    var session = create_session(experiment_id, participants);
    sessions.push(session);
    session.join(experiment_id, participants, client);
  }

  return session;
}

function create_session(experiment_id, total_participants){

  var session = {};

  session.id = uuid();
  session.experiment_id = experiment_id;
  session.total_participants = total_participants;
  session.started = false;

  session.messages = {
    turn: [],
    wait: 0,
    sync: {},
    ready: 0
  }

  // returns the number of people in the session
  session.participants = function(){
    if(typeof io.sockets.adapter.rooms[this.id] == 'undefined'){
      return 0;
    } else {
      return io.sockets.adapter.rooms[this.id].length;
    }
  };

  // adds client to this session if space is available and experiment_id matches
  session.join =  function(experiment_id, total_participants, client) {
    // check if experiment has already started or if session is full
    debugger;
    if(this.experiment_id !== experiment_id || total_participants !== this.total_participants || this.started || this.participants() >= this.total_participants) {
      return false;
    }
    client.join(this.id);
    client.session = this;

    this.update();

    // when session is full, get confirmation from everyone that session can start
    if(this.participants() == this.total_participants){
      this.confirm_ready();
    }
    return true;
  };

  // called if someone disconnects
  session.leave = function(client) {
    // leaving the session is automatic when client disconnects,
    // this method just handles any residual consequences of
    // leaving.
    this.update();
  }

  // updates each client with the number of currently connected participants
  session.update = function(){
    var n_participants = this.participants();
    io.to(this.id).emit('session-update', {
      participants: n_participants
    });
  }

  session.confirm_ready = function() {
    // reset ready counter
    this.messages.ready = 0;
    // send ready-check messages to all clients
    io.to(this.id).emit('ready-check', {});
    // set timeout to abort ready process after Xms
    setTimeout(()=>{
      this.abort_start();
    },5000);
  };

  session.client_ready = function(client) {
    console.log('client ready.');
    if(!client.confirmed_ready){
      this.messages.ready++;
      client.confirmed_ready = true;
      if(this.messages.ready == this.total_participants){
        this.start();
      }
    }
  }

  session.start = function(){
    this.started = true;
    var clients = io.in(this.id).connected;
    var idx = 0;
    for(var id in clients){
      clients[id].player_id = idx;
      idx++;
      io.to(id).emit('start', {player_id: clients[id].player_id});
    }
  }

  session.abort_start = function(){
    if(this.started){ return; }
    console.log('aborting start');
    io.to(this.id).emit('ready-abort');
    var clients = io.in(this.id).connected;
    for(var id in clients){
      if(!clients[id].confirmed_ready){
        clients[id].leave(this.id);
        session.leave();
      }
    }
  }

  return session;
}

function destroy_session(id) {
  delete sessions[id];
}

module.exports = {

  start: function(opts){
    opts = opts || {};
    start_webserver(opts);

    start_socketserver();

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
