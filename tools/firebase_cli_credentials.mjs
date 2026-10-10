import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(root, 'server/package.json'));

function cliPackageRoot() {
  const executable = (process.env.PATH ?? '').split(path.delimiter)
    .map(directory => path.join(directory, process.platform === 'win32' ? 'firebase.cmd' : 'firebase'))
    .find(filename => fs.existsSync(filename));
  if (!executable) throw new Error('Firebase CLI is required for --firebase-cli.');
  let directory = path.dirname(fs.realpathSync(executable));
  while (true) {
    const manifest = path.join(directory, 'package.json');
    if (fs.existsSync(manifest) && JSON.parse(fs.readFileSync(manifest, 'utf8')).name === 'firebase-tools') return directory;
    const parent = path.dirname(directory);
    if (parent === directory) throw new Error('Cannot locate the installed firebase-tools package.');
    directory = parent;
  }
}

// Reuse the CLI login without writing a service-account key or exporting tokens.
export async function firebaseCliServices(projectId) {
  if (!projectId) throw new Error('An explicit project ID is required.');
  if (process.env.FIRESTORE_EMULATOR_HOST) throw new Error('--firebase-cli is for live Firebase projects, not emulators.');
  const cliRequire = createRequire(path.join(cliPackageRoot(), 'package.json'));
  const auth = cliRequire('./lib/auth.js');
  const account = auth.getProjectDefaultAccount(root);
  if (!account?.tokens?.refresh_token) throw new Error('Run firebase login before using --firebase-cli.');
  const token = async () => {
    const value = await auth.getAccessToken(account.tokens.refresh_token, ['https://www.googleapis.com/auth/cloud-platform']);
    if (!value.access_token || !value.expires_at) throw new Error('Firebase CLI did not return a usable access token.');
    return { access_token: value.access_token, expiry_date: value.expires_at };
  };
  const { OAuth2Client } = require('google-auth-library');
  const client = new OAuth2Client();
  client.refreshHandler = token;
  client.setCredentials(await token());
  const { Firestore } = require('@google-cloud/firestore');
  return {
    db: new Firestore({ projectId, authClient: client }),
    request: options => client.request(options),
    credential: {
      getAccessToken: async () => {
        const value = await token();
        return { access_token: value.access_token, expires_in: Math.max(1, Math.floor((value.expiry_date - Date.now()) / 1000)) };
      }
    }
  };
}
