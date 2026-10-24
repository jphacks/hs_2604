import { describe, expect, it } from "vitest";
import { parseRequestedPeriod, requestedPeriod } from "./maker";
describe("ADS-03の希望期間",()=>{
 it("日本時間の最終日を翌日0時の排他境界として往復する",()=>{
   const value=requestedPeriod("2026-10-24T00:00:00+09:00","2026-10-26T00:00:00+09:00");
   expect(value).toBe("[2026-10-23T15:00:00.000Z,2026-10-25T15:00:00.000Z)");
   expect(parseRequestedPeriod(value)).toEqual({requested_start:"2026-10-23T15:00:00.000Z",requested_end:"2026-10-25T15:00:00.000Z"});
   expect(parseRequestedPeriod('["2026-10-24 00:00:00+09","2026-10-26 00:00:00+09")')).toEqual(parseRequestedPeriod(value));
 });
 it("無限・空・閉区間・不正な日付を拒否する",()=>{
   for(const value of ["empty","(2026-01-01,2027-01-01)","[2026-01-01,2027-01-01]","[2026-01-01,infinity)","[bad,invalid)"])expect(()=>parseRequestedPeriod(value)).toThrow();
   expect(()=>requestedPeriod("bad","2026-01-01")).toThrow();
 });
});
