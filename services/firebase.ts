import { initializeApp } from 'firebase/app';
import { getAnalytics, logEvent } from 'firebase/analytics';

const firebaseConfig = {
  apiKey: 'AIzaSyCsg7rA0tkNqq7UtMjGKDThlTytfma58ig',
  authDomain: 'chegoja-pro-b0f2a.firebaseapp.com',
  projectId: 'chegoja-pro-b0f2a',
  storageBucket: 'chegoja-pro-b0f2a.firebasestorage.app',
  messagingSenderId: '514748537390',
  appId: '1:514748537390:web:05882c6426bd78c8e5ddbf',
  measurementId: 'G-4RWQKCG3VX'
};

const app = initializeApp(firebaseConfig);
const analytics = typeof window !== 'undefined' ? getAnalytics(app) : null;

export const logFirebaseEvent = (name: string, params?: Record<string, any>) => {
  if (analytics) {
    logEvent(analytics, name, params);
  }
};

export { app, analytics };
