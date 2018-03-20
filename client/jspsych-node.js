jsPsych.node = (function(){

  var module = {};

  module.connect = function(url){
    module.socket = io.connect(url);
  }

  return module;

})();
