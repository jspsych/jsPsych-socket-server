var uuid = require('uuid');
var clone = require('clone');
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
const READY_TIMEOUT = (typeof __TEST__ !== 'undefined' && __TEST__) ? 500 : 10000;

// database interface
var database;

// sessions (simultaneous experiment instances)
var sessions = [];

function start_webserver(data){
  var port = data.port || DEFAULT_PORT; // use default value if none specified
  server.listen(port);
  // serve the given directory as a static website
  if(typeof data.directory !== 'undefined'){
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
      if(typeof socket.session !== 'undefined'){
        socket.session.client_ready(socket);
      }
    });

    socket.on('wait', function(){
      if(typeof socket.session == 'undefined'){
        return;
      }
      var wait = socket.session.messages.wait;
      if(!wait.includes(socket.id)){
        wait.push(socket.id);
        if(wait.length == socket.session.participants()){
          wait = [];
          io.to(socket.session.id).emit('wait-reply', {});
        }
      }
    });


    socket.on('turn', function(data){
      if(typeof socket.session == 'undefined'){
        return;
      }
      var turn = socket.session.messages.turn;
      if(typeof turn[socket.player_id] == 'undefined'){
        turn[socket.player_id] = {player_id: socket.player_id, turn_data: data}
      }
      var done = true;
      for(var i=0; i<socket.session.participants(); i++){
        if(typeof turn[i] == 'undefined') { done = false; break; }
      }
      if(done){
        var td = clone(turn);
        turn = [];
        io.to(socket.session.id).emit('turn-reply', {data: td});
      }
    });

    socket.on('sync', function(data){
      if(typeof socket.session == 'undefined'){
        return;
      }
      var sync = socket.session.messages.sync;
      if(typeof sync[socket.player_id] == 'undefined'){
        sync[socket.player_id] = {player_id: socket.player_id, sync_data: data}
      }
      var done = true;
      for(var i=0; i<socket.session.participants(); i++){
        if(typeof sync[i] == 'undefined') { done = false; break; }
      }
      if(done){
        var random_index = Math.floor(Math.random()*socket.session.participants());
        var sync_message = clone(sync[random_index]);
        sync = [];
        io.to(socket.session.id).emit('sync-reply', sync_message);
      }
    });

    socket.on('push', function(data){
      if(typeof socket.session == 'undefined'){
        return;
      }
      io.to(socket.session.id).emit('push-reply', data);
    });
/*
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
    wait: [],
    sync: [],
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

  // returns client ids in this session
  session.client_ids = function(){
    if(typeof io.sockets.adapter.rooms[this.id] == 'undefined'){
      return [];
    } else {
      return Object.keys(io.sockets.adapter.rooms[this.id].sockets);
    }
  }

  // adds client to this session if space is available and experiment_id matches
  session.join =  function(experiment_id, total_participants, client) {
    // check if experiment has already started or if session is full
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
    // reset status of all clients
    var clients = io.in(this.id).connected;
    for(var id in clients){
      clients[id].confirmed_ready = false;
    }
    // send ready-check messages to all clients
    io.to(this.id).emit('ready-check', {});
    // set timeout to abort ready process after Xms
    setTimeout(()=>{
      this.abort_start();
    }, READY_TIMEOUT);
  };

  session.client_ready = function(client) {
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
      clients[id].emit('start', {player_id: clients[id].player_id});
    }
  }

  session.abort_start = function(){
    // if session has started, there's no need for this abort.
    if(this.started){ return; }
    // ready-abort message alerts subjects that startup failed.
    io.to(this.id).emit('ready-abort');
    // check which clients failed to submit ready-reply
    // remove them from room so new clients can join
    var clients = io.in(this.id).connected;
    for(var id in clients){
      if(!clients[id].confirmed_ready){
        // send client a message that it was kicked out
        io.to(id).emit('kicked', {reason: 'ready-reply-fail'});
        // this removes the client from this room <socket.io>
        clients[id].leave(this.id);
        // this removes the client from this session
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

// expose sessions in module if we are in test environment
if(typeof __TEST__ !== 'undefined' && __TEST__){
  module.exports._sessions = sessions;
}
