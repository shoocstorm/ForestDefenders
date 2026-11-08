// Firebase web app init for the "forest-defender-33820" project (Hosting + Analytics).
// These web config values are public identifiers, not secrets — access is governed
// by Firebase security rules / API key restrictions in the console.
import { initializeApp } from 'firebase/app';
import { getAnalytics, isSupported } from 'firebase/analytics';

const firebaseConfig = {
  apiKey: 'AIzaSyCw2TRCFaW3GxmKMLd0dPc5THe2wRJmyrM',
  authDomain: 'forest-defender-33820.firebaseapp.com',
  projectId: 'forest-defender-33820',
  storageBucket: 'forest-defender-33820.firebasestorage.app',
  messagingSenderId: '155929282343',
  appId: '1:155929282343:web:30faac4e934145e6468b02',
  measurementId: 'G-RF6L805RX1',
};

export const app = initializeApp(firebaseConfig);

// Analytics is best-effort: never let it block or break game boot
// (unsupported in some browsers, blocked by ad blockers, headless test runs).
export let analytics = null;
isSupported()
  .then((ok) => { if (ok) analytics = getAnalytics(app); })
  .catch(() => {});
