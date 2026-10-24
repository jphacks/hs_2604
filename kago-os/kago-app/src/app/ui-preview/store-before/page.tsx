import { notFound } from "next/navigation";
import OriginalStorePage from "./original";
import { StoreProvider } from "@/features/store/store-provider";
import "@/app/globals.css";
export default function Page(){
 if(process.env.NODE_ENV!=="development")notFound();
 return <StoreProvider><OriginalStorePage/></StoreProvider>;
}
