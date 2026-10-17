// Child process used by test-faults.mjs: performs N deposits against LOCAL_DATA_FILE.
import { localTestModule } from "./local-test-module.mjs";

const [count, label, pause] = process.argv.slice(2);
const store = localTestModule("@/lib/local-store.server");
let ok = 0;
let busy = 0;
for (let i = 0; i < Number(count); i++) {
  try {
    store.localDataQuery({
      rpc: "fund_wallet",
      values: { p_amount: 1, p_intent_id: `fault-${label}-${i}-xxxxxxxx` },
    });
    ok++;
  } catch (error) {
    if (error instanceof Error && error.message === "LOCAL_STORE_BUSY") busy++;
    else throw error;
  }
  if (pause) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, Number(pause));
}
process.stdout.write(JSON.stringify({ ok, busy }));
