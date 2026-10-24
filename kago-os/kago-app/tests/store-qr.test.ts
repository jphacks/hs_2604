import assert from "node:assert/strict";
import test from "node:test";
import { parseStoreQr } from "../src/features/shopping/store-qr.ts";
const origin = "https://kago.example";
const id = "10000000-0000-4000-8000-000000000001";
test("same-origin App QR identifies a store", () => {
  assert.equal(parseStoreQr(`${origin}/App?store=${id}`, origin), id);
});
test("rejects foreign URLs, other routes, credentials, malformed or duplicate store IDs", () => {
  for (const value of ["milk", id, `/App?store=${id}`, `https://other.example/App?store=${id}`, `${origin}/App/store?store=${id}`, `${origin}/App?store=invalid`, `${origin}/App?store=${id}&store=${id}`, `${origin}/App?store=${id}#other`, `https://user:pass@kago.example/App?store=${id}`]) {
    assert.equal(parseStoreQr(value, origin), null, value);
  }
});
