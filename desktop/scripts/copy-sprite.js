// The desktop companion uses the same sprite code as the web app.
const fs = require('fs');
const path = require('path');
fs.copyFileSync(path.join(__dirname, '..', '..', 'shared', 'fangs-sprite.js'), path.join(__dirname, '..', 'renderer', 'fangs-sprite.js'));
console.log('copied shared/fangs-sprite.js -> renderer/');
