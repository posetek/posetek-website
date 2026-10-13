"use strict";

function createCoachEnrollmentEntrypoints(functions, admin, requireCaller) {
  const db = admin.firestore(), FieldValue = admin.firestore.FieldValue, HttpsError = functions.https.HttpsError;
  const clubs = require("./clubs").createClubs({ db, FieldValue, HttpsError });
  const enrollment = require("./coach-enrollment").createCoachEnrollment({ db, clubs, FieldValue, HttpsError, authDirectory: admin.auth() });
  const definitions = {
    createCoachEnrollmentLink: ["create", "issue"], inspectCoachEnrollmentLink: ["inspect", "inspect"],
    claimCoachEnrollmentLink: ["claim", "claim"], listCoachEnrollmentLinks: ["list", "manage"], revokeCoachEnrollmentLink: ["revoke", "manage"],
  };
  return Object.fromEntries(Object.entries(definitions).map(([name, [method, kind]]) => [name,
    functions.runWith({ timeoutSeconds: method === "inspect" ? 30 : 60, maxInstances: 5, memory: "256MB" }).https.onCall(async (data, context) => {
      const auth = method === "inspect" ? null : requireCaller(context);
      await enrollment.rate(context.rawRequest, auth, kind);
      return enrollment[method](data || {}, auth);
    }),
  ]));
}
module.exports = { createCoachEnrollmentEntrypoints };
