importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyCsg7rA0tkNqq7UtMjGKDThlTytfma58ig',
  authDomain: 'chegoja-pro-b0f2a.firebaseapp.com',
  projectId: 'chegoja-pro-b0f2a',
  storageBucket: 'chegoja-pro-b0f2a.firebasestorage.app',
  messagingSenderId: '514748537390',
  appId: '1:514748537390:web:05882c6426bd78c8e5ddbf',
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const { title, body } = payload.notification || {};
  if (title) {
    self.registration.showNotification(title, {
      body: body || '',
      icon: '/icon.png',
      badge: '/badge.png',
      vibrate: [200, 100, 200],
      data: payload.data,
    });
  }
});
