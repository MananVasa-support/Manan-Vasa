// auth.js
// Initializes Firebase from window.AUTH_CONFIG and exposes window.Auth with
// helpers used by index.html and dashboard.html:
//   Auth.signIn(email, password, keepSignedIn) → Promise<user>
//   Auth.sendReset(email)                       → Promise<void>
//   Auth.signOut()                              → Promise<void>
//   Auth.guardPage({redirectTo})                → reveals page if signed in,
//                                                  else redirects to login URL
//   Auth.redirectIfSignedIn(target)             → on the login page,
//                                                  jumps to target if already signed in
//   Auth.friendlyError(err)                     → maps Firebase errors to UI text

(function () {
  if (!window.AUTH_CONFIG) {
    console.error("auth.js: window.AUTH_CONFIG missing. Include auth-config.js first.");
    return;
  }
  if (typeof firebase === "undefined") {
    console.error("auth.js: Firebase SDK missing. Include firebase-app-compat + firebase-auth-compat scripts first.");
    return;
  }

  firebase.initializeApp(window.AUTH_CONFIG);

  const auth = firebase.auth();

  async function signIn(email, password, keepSignedIn) {
    const persistence = keepSignedIn
      ? firebase.auth.Auth.Persistence.LOCAL
      : firebase.auth.Auth.Persistence.SESSION;
    await auth.setPersistence(persistence);
    const cred = await auth.signInWithEmailAndPassword(email, password);
    return cred.user;
  }

  async function sendReset(email) {
    await auth.sendPasswordResetEmail(email);
  }

  async function signOut() {
    await auth.signOut();
  }

  // Used on dashboard.html. Hides the page until auth resolves;
  // if signed out, redirects to the login URL.
  function guardPage(options) {
    const redirectTo = (options && options.redirectTo) || "index.html";
    auth.onAuthStateChanged(function (user) {
      if (!user) {
        window.location.replace(redirectTo);
      } else {
        document.documentElement.style.visibility = "visible";
      }
    });
  }

  // Used on index.html. If a session already exists, skip the form.
  function redirectIfSignedIn(target) {
    auth.onAuthStateChanged(function (user) {
      if (user) {
        window.location.replace(target || "dashboard.html");
      }
    });
  }

  // Normalize Firebase auth errors into friendly messages.
  function friendlyError(err) {
    const code = (err && err.code) || "";
    if (code === "auth/wrong-password" || code === "auth/user-not-found" || code === "auth/invalid-credential" || code === "auth/invalid-email") {
      return "Incorrect email or password.";
    }
    if (code === "auth/too-many-requests") {
      return "Too many attempts. Try again in a few minutes.";
    }
    if (code === "auth/network-request-failed") {
      return "Couldn't reach the server. Check your connection and try again.";
    }
    return "Something went wrong. Please try again.";
  }

  window.Auth = { signIn, sendReset, signOut, guardPage, redirectIfSignedIn, friendlyError };
})();
