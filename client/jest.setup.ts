// Test fixture only; production client never imports the seed catalog.
require('./src/game/domain').installContent(require('../content/game-content.json'));
