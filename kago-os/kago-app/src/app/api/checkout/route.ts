import { NextRequest, NextResponse } from "next/server";
import { createServerBackendClient } from "@/lib/backend/server";
import { CheckoutError, checkoutError, confirmCheckout, loadCheckout } from "@/features/checkout/service";

export const dynamic = "force-dynamic";
const headers = {"Cache-Control":"private, no-store",Vary:"Cookie"};
const failure = (error:unknown) => { const safe=checkoutError(error); return NextResponse.json({code:safe.code,message:safe.message},{status:safe.status,headers}); };
export async function GET(request:NextRequest) {
  try {
    const client=await createServerBackendClient({writableCookies:true});
    return NextResponse.json(await loadCheckout(client,request.nextUrl.searchParams.get("visitId")??request.cookies.get("kago-app-visit")?.value),{headers});
  } catch(error) {return failure(error);}
}
export async function POST(request:NextRequest) {
  try {
    const origin=`${request.nextUrl.protocol}//${request.headers.get("host")}`;
    if(request.headers.get("origin")!==origin || !request.headers.get("content-type")?.startsWith("application/json")) throw new CheckoutError("forbidden",403);
    let input;
    try { input=await request.json(); } catch {throw new CheckoutError("invalid_request");}
    const client=await createServerBackendClient({writableCookies:true});
    return NextResponse.json(await confirmCheckout(client,input),{headers});
  } catch(error) {return failure(error);}
}
