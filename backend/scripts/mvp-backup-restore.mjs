import assert from "node:assert/strict";

/** Only an already-owned disposable browser-gate PostgreSQL instance is admitted. */
export async function verifyMvpBackupRestore({name, docker, restartWeb, probe, api}) {
  if (!/^gaza_mvp_browser_[a-f0-9]{24}$/.test(name)) throw new Error("Unowned persistence target.");
  const pg = name + "_pg", web = name + "_web";
  const psql = (label, database, sql) => docker(label, ["exec", pg, "psql", "-v", "ON_ERROR_STOP=1", "-U", "gza_admin", "-d", database, "-tA", "-c", sql]).trim();
  // Freeze this owned web process after its browser contexts close: no request can mutate the backup snapshot.
  docker("persistence-pause", ["pause", web]);
  let paused = true;
  try {
    const tables = psql("persistence-tables", "gaza_gateway_test", "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename").split(/\r?\n/);
    if (!tables.length || tables.some(table => !/^[a-z_][a-z0-9_]*$/.test(table))) throw new Error("Unexpected table inventory.");
    const sql = tables.map(table => `SELECT json_build_object('table','${table}','rows',count(*),'sha256',encode(sha256(convert_to(coalesce(string_agg(to_jsonb(t)::text,E'\\n' ORDER BY to_jsonb(t)::text),''),'UTF8')),'hex'))::text FROM public.${table} t`).join(" UNION ALL ");
    const fingerprint = value => value.split(/\r?\n/).map(line=>JSON.parse(line)).sort((a,b)=>a.table.localeCompare(b.table));
    const before = fingerprint(psql("persistence-before", "gaza_gateway_test", sql));
    docker("persistence-dump", ["exec", pg, "pg_dump", "-U", "gza_admin", "-d", "gaza_gateway_test", "-Fc", "-f", "/tmp/mvp-owned-backup.dump"]);
    docker("persistence-create-restore", ["exec", pg, "createdb", "-U", "gza_admin", "-O", "gaza_app_user", "gaza_gateway_restore"]);
    docker("persistence-restore", ["exec", pg, "pg_restore", "--exit-on-error", "-U", "gza_admin", "-d", "gaza_gateway_restore", "/tmp/mvp-owned-backup.dump"]);
    assert.deepEqual(fingerprint(psql("persistence-restored", "gaza_gateway_restore", sql)), before, "Restored row counts/digests must match every original table");
    docker("persistence-unpause", ["unpause", web]);paused = false;
    await restartWeb();
    assert.equal(await probe(api+"/health"), 200, "Restarted application liveness");
    assert.deepEqual(fingerprint(psql("persistence-after-restart", "gaza_gateway_test", sql)), before, "Application restart preserves all persisted rows");
    // Raw dump remains solely in the disposable PostgreSQL container, removed by the gate's owned cleanup.
    return {tables:tables.length, restored:true, restarted:true};
  } finally {
    if (paused) docker("persistence-unpause-finally", ["unpause", web]);
  }
}
