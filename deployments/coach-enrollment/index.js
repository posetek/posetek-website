"use strict";
// Deploy only the five coach-enrollment callables in this package.
const sdk = require("firebase-functions"), admin = require("firebase-admin");
admin.initializeApp();
const functions = require("./account-deletion-barrier").withAccountDeletionBarrier(sdk, admin.firestore());
function caller(context) {
  if (!context.auth?.uid || context.auth.token?.firebase?.sign_in_provider === "anonymous") throw new functions.https.HttpsError("unauthenticated", "Sign in with your account to continue.");
  const token = context.auth.token;
  return { uid: context.auth.uid, email: token?.email || null, emailVerified: token?.email_verified === true,
    authTime: token?.auth_time, signInProvider: token?.firebase?.sign_in_provider || null, isAnonymous: false };
}
Object.assign(exports, require("./coach-enrollment-entrypoints").createCoachEnrollmentEntrypoints(functions, admin, caller));
