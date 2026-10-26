import {test} from "node:test";
import assert from "node:assert/strict";
import {canonicalAdsPath} from "../../shared/routes/ads-entry.ts";
test("Adsだけの大文字小文字を正規化し、二度目に転送を起こさない",()=>{
 for(const prefix of ["Ads","ADS","AdS","aDS","ads"]){
  for(const tail of ["","/","/portal","/maker/creative?unused=path"]){
   const result=canonicalAdsPath("/"+prefix+tail);
   assert.equal(result,"/ads"+tail);assert.equal(canonicalAdsPath(result),result);
  }
 }
});
test("媒体や商品ID、ほかのサービスのパスを変えない",()=>{
 for(const value of ["/","/App","/insight","/ads-static/_next/x.js","/ad-assets/x.png","/adsx","/Ads-extra","/signage"])assert.equal(canonicalAdsPath(value),value);
 assert.equal(canonicalAdsPath("/ADS/maker/ABC-123"),"/ads/maker/ABC-123");
});
