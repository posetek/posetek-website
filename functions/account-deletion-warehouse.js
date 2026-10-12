"use strict";

// Only operator-reviewed destinations, never a client-supplied table/query.
// DML parameters prevent an account identifier becoming SQL. A streaming-buffer
// or job-completion failure keeps the main deletion job retryable.
function createWarehouseEraser({ accessToken, fetchImpl = fetch }) {
  return async (playerIds, tables) => {
    if (!Array.isArray(tables) || tables.some(table => typeof table !== "string"
      || !/^[a-z][a-z0-9-]{4,62}\.[A-Za-z_][A-Za-z0-9_]*\.[A-Za-z_][A-Za-z0-9_]*$/.test(table))) {
      throw new Error("Warehouse erasure destinations need review");
    }
    if (!playerIds.length || !tables.length) return;
    const token = await accessToken();
    for (const table of tables) {
      const project = table.split(".")[0];
      const response = await fetchImpl(`https://bigquery.googleapis.com/bigquery/v2/projects/${project}/queries`, {
        method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        signal: AbortSignal.timeout(30000),
        body: JSON.stringify({ useLegacySql: false, timeoutMs: 20000, parameterMode: "NAMED",
          query: `DELETE FROM \`${table}\` WHERE player_id IN UNNEST(@players)`,
          queryParameters: [{ name: "players", parameterType: { type: "ARRAY", arrayType: { type: "STRING" } },
            parameterValue: { arrayValues: playerIds.map(value => ({ value })) } }],
        }),
      });
      const result = await response.json();
      if (!response.ok || result.errors?.length || result.jobComplete !== true) throw new Error("Warehouse erasure needs retry");
    }
  };
}
module.exports = { createWarehouseEraser };
