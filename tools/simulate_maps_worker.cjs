// Worker thread for the simulation pool; runs the same executeTask as the main process.
const { parentPort, workerData } = require('node:worker_threads');
const { installSnapshot, executeTask } = require('./simulate_maps.cjs');

installSnapshot(workerData.config, workerData.maps);

parentPort.on('message', ({ key, task }) => {
  try {
    parentPort.postMessage({ key, payload: executeTask(task) });
  } catch (error) {
    parentPort.postMessage({ key, error: error.message });
  }
});
