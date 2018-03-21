var server = require('../server');

test('_sessions is available', function(){
  expect(server._sessions).not.toBeUndefined();
});
