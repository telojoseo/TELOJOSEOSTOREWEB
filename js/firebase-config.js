// ============================================================
// firebase-config.js — Inicialización de Firebase (App, Auth, Firestore, Messaging)
// IMPORTANTE: Las claves de Firebase se cargan desde localStorage (setup.html)
// ============================================================
        import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
        import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut, updateProfile, updatePassword, sendEmailVerification, GoogleAuthProvider, signInWithPopup } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
        import { getFirestore, collection, addDoc, getDocs, getDocsFromServer, doc, deleteDoc, setDoc, getDoc, updateDoc, onSnapshot, query, where, runTransaction, increment, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
        import { getMessaging, getToken, onMessage } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-messaging.js";

        // Leer configuración de Firebase desde localStorage (guardada en setup.html)
        let firebaseConfig = null;
        try {
            const stored = localStorage.getItem('FIREBASE_CONFIG');
            if (stored) {
                firebaseConfig = JSON.parse(stored);
            }
        } catch(e) {
            console.error("Error leyendo configuración de Firebase", e);
        }

        // Si no hay configuración guardada, redirigir a setup.html
        if (!firebaseConfig || !firebaseConfig.projectId) {
            if (typeof window !== 'undefined' && window.location) {
                window.location.href = 'setup.html';
            }
            throw new Error("Configuración de Firebase no encontrada. Abre setup.html para configurar.");
        }

        export const app = initializeApp(firebaseConfig);
        export const auth = getAuth(app);
        export const db = getFirestore(app);
        export const messaging = getMessaging(app);
        export const appId = firebaseConfig.projectId;

        // Re-exportamos las funciones del SDK de Firebase para que los demás
        // módulos las importen todas desde este único archivo central.
        export {
            createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged,
            signOut, updateProfile, updatePassword, sendEmailVerification, GoogleAuthProvider, signInWithPopup
        };
        export {
            collection, addDoc, getDocs, getDocsFromServer, doc, deleteDoc, setDoc,
            getDoc, updateDoc, onSnapshot, query, where, runTransaction, increment, serverTimestamp
        };
        export { getToken, onMessage };
