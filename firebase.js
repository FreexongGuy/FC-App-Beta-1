// firebase.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import {
  getDatabase,
  ref,
  set,
  update,
  get,
  push,
  remove,
  onChildAdded,
  onChildRemoved,
  onChildChanged,
  query,
  limitToLast,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-database.js";
import {
  getStorage,
  ref as storageRef,
  uploadBytes,
  uploadBytesResumable,
  getDownloadURL,
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-storage.js";

// Your Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyAFavtwLPceJb6xTDT2UExnjXbPdlw8ltc",
  authDomain: "fc-app-beta1.firebaseapp.com",
  databaseURL: "https://fc-app-beta1-default-rtdb.firebaseio.com",
  projectId: "fc-app-beta1",
  storageBucket: "fc-app-beta1.firebasestorage.app",
  messagingSenderId: "758174374819",
  appId: "1:758174374819:web:3092e22e951616dc47d816",
  measurementId: "G-Q3X5CJ9QJG"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const database = getDatabase(app);
const storage = getStorage(app);

export {
  database,
  storage,
  ref,
  storageRef,
  set,
  update,
  get,
  push,
  remove,
  onChildAdded,
  onChildRemoved,
  onChildChanged,
  query,
  limitToLast,
  serverTimestamp,
  uploadBytes,
  uploadBytesResumable,
  getDownloadURL,
};
