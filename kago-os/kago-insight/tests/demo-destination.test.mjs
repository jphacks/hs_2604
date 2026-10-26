import assert from "node:assert/strict";
import test from "node:test";
import { registerHooks } from "node:module";

// Only remove the Next.js server-only marker; import the actual production helper.
registerHooks({resolve(specifier,context,nextResolve){
 if(specifier==="server-only")return {url:"data:text/javascript,export {}",shortCircuit:true};
 return nextResolve(specifier,context);
}});
const {safeNextPath}=await import("../src/lib/demo.ts");

test("demo login returns to signage decisions",()=>{
 assert.equal(safeNextPath("/signage-decisions"),"/signage-decisions");
});
test("demo login preserves base path normalization and query",()=>{
 assert.equal(safeNextPath("/insight/signage-decisions?from=2026-10-26#latest"),"/signage-decisions?from=2026-10-26#latest");
});
test("demo login keeps existing screens",()=>{
 for(const screen of ["/review","/promotions","/metrics","/coupons"])assert.equal(safeNextPath(screen),screen);
});
test("demo login rejects external, authentication and API targets",()=>{
 for(const input of ["https://evil.invalid","//evil.invalid/review","/api/demo-signin","/login","/insight/login","/review\\evil","/review\r\nLocation:evil",undefined,null])assert.equal(safeNextPath(input),"/promotions");
});
