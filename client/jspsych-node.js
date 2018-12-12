var io = require('socket.io-client'); // right way to import this?

/* functions here for each kind of message */
// this is just going to be a bunch of very simple wrappers to make the
// interface standardized. could possible implement await versions of these too?

//  stores the client information
var client;
var session_id = null;

/*** messages ***/

export const connect = function(server_url){
    client = io.connect(server_url);
}

export const join = function(experiment_id, n_participants){
    client.on('join-reply', function(data){
        session_id = data.session_id;
    });
    client.emit('join', {experiment_id: experiment_id, participants: n_participants});
}


