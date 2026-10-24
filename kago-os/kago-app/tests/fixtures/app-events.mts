import type { createCartDatabase } from "./cart-database.mts";
import { id } from "./cart-database.mts";
import { PRODUCT } from "./offers.mts";

export async function seedEventSuggestions({ db }: Pick<Awaited<ReturnType<typeof createCartDatabase>>, "db">) {
  await db.exec(`insert into store_members(store_id,user_id) values ('${id(1)}','${id(5)}');
    insert into makers(id,slug,display_name) values ('${id(800)}','event-maker','検証食品');
    insert into creatives(id,maker_id,product_id) values ('${id(801)}','${id(800)}','${PRODUCT.sauce}');
    insert into creative_versions(id,creative_id,version,image_path,headline) values ('${id(802)}','${id(801)}',1,'test/sauce.png','パスタと一緒に');
    insert into ad_calls(id,store_id,title,categories,channels,starts_at,ends_at,status)
      values ('${id(803)}','${id(1)}','検証広告','{加工食品}','{app}',now()-interval '1 day',now()+interval '1 day','open');
    insert into ad_applications(id,ad_call_id,store_id,maker_id,creative_id,creative_version_id,channels,requested_period)
      values ('${id(804)}','${id(803)}','${id(1)}','${id(800)}','${id(801)}','${id(802)}','{app}',tstzrange(now()-interval '1 hour',now()+interval '1 hour','[)'));
    update ad_applications set status='approved',reviewed_by='${id(5)}' where id='${id(804)}';
    insert into ad_placements(id,application_id,revision,store_id,creative_version_id,channels,starts_at,ends_at,approved_by)
      select '${id(805)}',id,revision,store_id,creative_version_id,channels,lower(requested_period),upper(requested_period),reviewed_by from ad_applications where id='${id(804)}';
    insert into store_promotions(id,store_id,product_id) values ('${id(806)}','${id(1)}','${id(21)}');
    insert into promotion_versions(id,promotion_id,version,channels,time_windows,priority,reason_text,starts_at,ends_at)
      values ('${id(807)}','${id(806)}',1,'{app}','[]',9,'旬のりんごです',now()-interval '1 day',now()+interval '1 day');
    insert into customer_settings(user_id,use_current_cart) values ('${id(3)}',true);`);
}
