# jsPsych-socket-server

A socket.io based server for multi-subject experiments with jsPsych.

The primary function of this server is to allow for message passing between
the different clients connected to the server. The server defines a vocabulary
of message types, and the client-side code is responsible for implementing
logic to utilize these messages.

The message types implemented by the server:

* **join** is used to connect a client to an experiment instance.
* **leave** is used when a client leaves an instance.
* **wait** allows clients to progress through the experiment at the same pace.
After a wait message is sent, the server will wait for all connected clients to
send a wait message, and then it will send a **wait-reply** to each client.
* **turn** is sent when a client needs to pass data to other clients. The server
waits for all connected clients to send the turn message and then sends a
**turn-reply** to all clients containing all of the data.
* **push** immediately sends data from a client directly to other clients who
are subscribed to receive **push-reply** messages.
* **sync** is like turn, except that the server will randomly choose one of the
messages and pass along only that message in the **sync-reply**. This can be used
to enable synchronized randomization in the experiment.
* **write-data** stores an accompanying array of data into a database. The
database communication is abstracted so that different backend databases can
be used.
