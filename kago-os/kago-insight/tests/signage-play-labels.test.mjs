import assert from "node:assert/strict";
import test from "node:test";
import {playReasonLabel,playEndLabel,playOriginLabel} from "../src/lib/signage-play-labels.ts";
test("通常広告と店舗のおすすめの理由を区別する",()=>{assert.match(playReasonLabel("approved_order"),/承認/);assert.match(playReasonLabel("store_pick"),/店舗/);});
test("期限切れと素材欠落の案内を区別する",()=>{assert.match(playReasonLabel("cache_expired"),/期限切れ/);assert.match(playReasonLabel("media_unavailable"),/素材/);});
test("集計の少人数・期限切れも固定の説明を使う",()=>{assert.match(playReasonLabel("crowd_small"),/少人数/);assert.match(playReasonLabel("crowd_expired"),/期限切れ/);});
test("停止・更新・終了を別の終了理由として表示する",()=>{assert.equal(playEndLabel("suspended"),"配信停止");assert.equal(playEndLabel("updated"),"内容更新");assert.equal(playEndLabel("closed"),"画面を閉じた");});
test("通常操作と投入・合成データを混同しない",()=>{assert.equal(playOriginLabel("operated"),"通常操作");assert.equal(playOriginLabel("seeded"),"投入データ");assert.equal(playOriginLabel("synthetic"),"合成データ");});
test("未知のコードやObjectのプロパティ名を説明として扱わない",()=>{for(const code of ["unknown","constructor","__proto__"])assert.equal(playReasonLabel(code),"未分類の選定理由");assert.equal(playEndLabel("unknown"),"未分類の終了理由");});
