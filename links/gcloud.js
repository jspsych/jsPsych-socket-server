var fs = require('fs');
var config = JSON.parse(fs.readFileSync('config.json'));
var gcloud = require('gcloud')({
  projectId: config.database.config.projectId
});

var datastore = gcloud.datastore();

module.exports = {

  // the write_msg has two properties
  // collection: the collection/table where the data should be saved
  // data: the data to save
  write: function(write_msg){
    var key = datastore.key(write_msg.collection);
    var data = write_msg.data;
    if(!Array.isArray(data)){
      data = [data];
    }
    datastore.save(data, function(err){
      console.log('Error writing data in gcloud link. Key: '+key);
    });
  }

}
