import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// Firebase web config is safe to keep in the client bundle — access to
// Firestore/Auth is enforced by Firestore security rules, not by hiding
// this object.
const firebaseConfig = {
  apiKey: 'AIzaSyA2HMaUc-AzBHZ54KHQ9_3KWfUcpjYtKzo',
  authDomain: 'xiangshun-project-4cd28.firebaseapp.com',
  projectId: 'xiangshun-project-4cd28',
  storageBucket: 'xiangshun-project-4cd28.firebasestorage.app',
  messagingSenderId: '348566278610',
  appId: '1:348566278610:web:5c9c13944783d7870cf80b',
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
