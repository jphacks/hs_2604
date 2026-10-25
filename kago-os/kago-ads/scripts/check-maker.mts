import {createHeadlessBackend,readBackendConfig,signInBackend,signOutBackend,toBackendError} from "@kago/backend";
import {createSupabaseMakerRepository} from "../src/lib/backend/maker.ts";
import {requireMaker} from "../src/lib/backend/portal.ts";
let client:ReturnType<typeof createHeadlessBackend>|undefined;
try {
 if(!process.env.KAGO_ADS_CHECK_EMAIL || !process.env.KAGO_ADS_CHECK_PASSWORD)throw new Error("検証用メーカーのKAGO_ADS_CHECK_EMAILとKAGO_ADS_CHECK_PASSWORDを非公開の環境ファイルに設定してください。");
 client=createHeadlessBackend(readBackendConfig({url:process.env.NEXT_PUBLIC_SUPABASE_URL,publishableKey:process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY}));
 await signInBackend(client,process.env.KAGO_ADS_CHECK_EMAIL,process.env.KAGO_ADS_CHECK_PASSWORD,"maker_staff");
 const identity=await requireMaker(client),session={role:"maker_staff" as const,makerId:identity.makerIds[0]};
 const repo=createSupabaseMakerRepository(client);
 const [creatives,applications]=await Promise.all([repo.listMyCreatives(session),repo.listMyApplications(session)]);
 const placements=await Promise.all(applications.map(a=>repo.listPlacements(session,a.id)));
 console.log("メーカー本人の素材・版・申請履歴・配信状態の読取に成功しました。");
 console.log("素材: "+creatives.length+"、申請: "+applications.length+"、配信対象: "+placements.flat().length);
 const unreadable=creatives.flatMap(c=>c.versions).filter(v=>!!v.image_error).length;
 if(unreadable)console.log("画像を取得できない版: "+unreadable+"。画像保存先・権限・画像の有無を確認してください。");
 const ready=await client.rpc("kago_ad_image_path_valid",{p_path:"00000000-0000-4000-8000-000000000011/00000000-0000-4000-8000-000000000051/00000000-0000-4000-8000-000000000053.png"});
 if(ready.error || ready.data!==true)throw new Error("広告画像のDB設定を確認できません。COM-03のmigration適用・APIへの反映・接続状態を確認してください。");
 console.log("画像保存用の前提関数を呼び出せました。画像登録・審査の書込みはこのコマンドでは実行しません。");
 await signOutBackend(client);
 let denied=false;try{await repo.listMyApplications(session);}catch{denied=true;}
 if(!denied)throw new Error("ログアウト後の読取拒否を確認できませんでした。");
 console.log("ログアウト後に申請の読取が拒否されることを確認しました。");
}catch(error){
 const safe=error instanceof Error && /^(検証用メーカー|広告画像のDB設定|ログアウト後)/.test(error.message)?error.message:toBackendError(error).message;
 console.error(safe);process.exitCode=1;
}finally{if(client)await signOutBackend(client).catch(()=>undefined);}
