import {createHeadlessBackend,readBackendConfig,signInBackend,signOutBackend,toBackendError} from "@kago/backend";
import {requireMaker} from "../src/lib/backend/portal.ts";
import {createSupabaseResultsRepository} from "../src/lib/backend/results.ts";
import {addDays,dayEnd,dayStart,today} from "../src/lib/domain/rules.ts";
let client:ReturnType<typeof createHeadlessBackend>|undefined;
try{
 if(!process.env.KAGO_ADS_CHECK_EMAIL||!process.env.KAGO_ADS_CHECK_PASSWORD)throw new Error("検証用メーカーのログイン情報を非公開の環境ファイルへ設定してください。");
 client=createHeadlessBackend(readBackendConfig({url:process.env.NEXT_PUBLIC_SUPABASE_URL,publishableKey:process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY}));
 await signInBackend(client,process.env.KAGO_ADS_CHECK_EMAIL,process.env.KAGO_ADS_CHECK_PASSWORD,"maker_staff");
 const who=await requireMaker(client),session={role:"maker_staff" as const,makerId:who.makerIds[0]};
 const query={start:dayStart(addDays(today(),-30)),end:dayEnd(today())};
 const repo=createSupabaseResultsRepository(client),data=await repo.listMakerResults(session,query);
 for(const name of ["kago_app_metrics","kago_signage_metrics"]){
  const value=await client.rpc(name,{p_start:query.start,p_end:query.end,p_store_id:null});
  if(value.error)throw value.error;
 }
 console.log("メーカー本人の成果読取と、DB-09のApp・Signage集計関数の呼出しに成功しました。");
 console.log("自社の配信対象: "+data.placements.length+"、App集計: "+data.app.length+"、Signage集計: "+data.signage.length);
 if(!data.placements.length)console.log("このメーカーには承認済みの配信対象がないため、成果は空です。");
 await signOutBackend(client);
 let denied=false;try{await repo.listMakerResults(session,query);}catch{denied=true;}
 if(!denied)throw new Error("ログアウト後の成果読取拒否を確認できませんでした。");
 console.log("ログアウト後の成果読取が拒否されることを確認しました。共有データは変更していません。");
}catch(error){
 console.error(error instanceof Error && /^(検証用メーカー|ログアウト後)/.test(error.message)?error.message:toBackendError(error).message);process.exitCode=1;
}finally{if(client)await signOutBackend(client).catch(()=>undefined);}
