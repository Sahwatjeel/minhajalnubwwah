// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyB12IHBDzJ0V-eNC0bUeibTkMQcj9FAGoM",
  authDomain: "minhajalnubwwa.firebaseapp.com",
  projectId: "minhajalnubwwa",
  storageBucket: "minhajalnubwwa.firebasestorage.app",
  messagingSenderId: "566117460117",
  appId: "1:566117460117:web:e18ef69b8637c6f01f139c",
  measurementId: "G-WBJGPXNC6Y"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
