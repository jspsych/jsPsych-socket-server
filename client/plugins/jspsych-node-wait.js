jsPsych.plugins["wait"] = (function() {

  var plugin = {};

  plugin.trial = function(display_element, trial) {

    // set default values for parameters
    trial.message = trial.parameter || '<p class="center-content">Waiting for all players to be ready</p>';

    // allow variables as functions
    trial = jsPsych.pluginAPI.evaluateFunctionParameters(trial);

    display_element.html(trial.message);
    var start = Date.now();

    setTimeout(function(){
      jsPsych.node.socket.emit('wait', {});
    }, 250);

    jsPsych.node.socket.once('wait-reply', function(){
      // data saving
      var trial_data = {
        wait_time: Date.now() - start
      };

      display_element.empty();

      // end trial
      jsPsych.finishTrial(trial_data);
    });

  };

  return plugin;
})();
