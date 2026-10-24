// データの読み書きの窓口。今は仮データ（mock-repository）、Supabase ができたら同じ形で差し替える
// 権限の確認（DB-06 の内容）も、ここを通すことで画面側に散らばらないようにする
import type {
  AdApplication,
  AdCall,
  AdCallStatus,
  AdPlacement,
  Channel,
  Creative,
  CreativeVersion,
  Maker,
  MediaAsset,
  Product,
  Session,
  PromotionStatus,
  SignageDevice,
  SignagePlay,
  Store,
  StorePromotion,
  StoreProduct,
  Timestamp,
  TimeWindow,
} from "../domain/types";
import type { SignageFeed } from "../signage/feed";

export type AdCallInput = Pick<AdCall, "title" | "categories" | "channels" | "starts_at" | "ends_at" | "description" | "disclosure_scope">;

export type CreativeVersionInput = { headline: string; assets: Partial<Record<Channel, MediaAsset>>; note: string };
export type CreativeInput = CreativeVersionInput & { product_id: string };
export type CreativeWithVersions = { creative: Creative; versions: CreativeVersion[] };

export type ApplicationInput = {
  creative_version_id: string;
  channels: Channel[];
  requested_start: Timestamp;
  requested_end: Timestamp;
  message: string;
};

export type ApprovalInput = { channels: Channel[]; starts_at: Timestamp; ends_at: Timestamp };

export type PromotionInput = {
  product_id: string;
  channels: Channel[];
  time_windows: TimeWindow[];
  priority: number;
  reason_text: string;
  starts_at: Timestamp;
  ends_at: Timestamp;
};

export interface AdsRepository {
  listStores(): Promise<Store[]>;
  listSignageDevices(storeId: string): Promise<SignageDevice[]>;
  listMakers(): Promise<Maker[]>;
  listProducts(): Promise<Product[]>;
  listStoreProducts(storeId: string): Promise<StoreProduct[]>;
  listCategories(): Promise<string[]>;

  /** 公開済みの募集（下書きは含まない）。ADS-01 */
  listPublicAdCalls(): Promise<AdCall[]>;
  /** 下書きは自店の担当者にだけ返す */
  getAdCall(session: Session, id: string): Promise<AdCall | undefined>;
  /** 自店の募集。ADS-02 */
  listMyAdCalls(session: Session): Promise<AdCall[]>;
  saveAdCall(session: Session, input: AdCallInput, id?: string): Promise<AdCall>;
  setAdCallStatus(session: Session, id: string, status: AdCallStatus): Promise<AdCall>;

  /** 自社の広告素材と版。ADS-03 */
  listMyCreatives(session: Session): Promise<CreativeWithVersions[]>;
  createCreative(session: Session, input: CreativeInput): Promise<CreativeWithVersions>;
  addCreativeVersion(session: Session, creativeId: string, input: CreativeVersionInput): Promise<CreativeVersion>;

  /** 自社の申請。ADS-03 */
  listMyApplications(session: Session): Promise<AdApplication[]>;
  getApplication(session: Session, id: string): Promise<AdApplication | undefined>;
  /** 申請の配信対象（承認の結果）。メーカーは自社の申請、店舗は自店の申請のものだけ */
  listPlacements(session: Session, applicationId: string): Promise<AdPlacement[]>;
  submitApplication(session: Session, adCallId: string, input: ApplicationInput): Promise<AdApplication>;
  resubmitApplication(session: Session, applicationId: string, input: ApplicationInput): Promise<AdApplication>;

  /** INS-01・DB-08 ができるまでの確認用。店舗の担当者として承認・却下・停止する */
  devListStoreApplications(session: Session): Promise<AdApplication[]>;
  devApprove(session: Session, applicationId: string, input: ApprovalInput): Promise<AdPlacement>;
  devReject(session: Session, applicationId: string, comment: string): Promise<AdApplication>;
  devSuspend(session: Session, placementId: string, reason: string): Promise<AdPlacement>;

  /**
   * Signage 端末としてログインする（SIG-01）。仮データ版は端末 ID だけで入れる。
   * 共通の認証では端末用のアカウント（signage 役割、app_metadata.kago に device_id・store_id）でログインする
   */
  signInDevice(deviceId: string): Promise<Session>;
  /** 端末の店舗の配信内容（SIG-01）。端末は利用者・来店・かご・注文を読めない */
  getSignageFeed(session: Session, now?: Date): Promise<SignageFeed>;
  /** 再生記録を保存する（SIG-02）。同じ id は1件にまとめる（再送しても増えない） */
  recordPlays(session: Session, plays: SignagePlay[]): Promise<{ saved: number }>;

  /** INS-02・INS-03 ができるまでの確認用。店舗の担当者として販促・再生記録・デモ用の時刻を扱う */
  devListStorePlacements(session: Session): Promise<AdPlacement[]>;
  devListPromotions(session: Session): Promise<StorePromotion[]>;
  devCreatePromotion(session: Session, input: PromotionInput): Promise<StorePromotion>;
  devSetPromotionStatus(session: Session, promotionId: string, status: PromotionStatus): Promise<StorePromotion>;
  devListPlays(session: Session): Promise<SignagePlay[]>;
  /** デモ用の時刻（店舗の時刻 − 実時刻、ミリ秒）。未設定なら 0 */
  devGetClockOffset(session: Session): Promise<number>;
  /** デモ用の時刻を設定する。null で実時刻に戻す */
  devSetDemoTime(session: Session, demoTime: Timestamp | null): Promise<void>;

  /** 仮データを初期状態に戻す */
  reset(): Promise<void>;
}

/** 権限がない操作（DB-06 で拒否されるものに相当） */
export class PermissionError extends Error {}
/** 入力が仕様に合わない */
export class ValidationError extends Error {
  constructor(public readonly messages: string[]) {
    super(messages.join("\n"));
  }
}
