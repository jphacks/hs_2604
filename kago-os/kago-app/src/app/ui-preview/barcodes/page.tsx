import { notFound } from "next/navigation";
import DemoBarcodesPage from "@/app/App/demo-barcodes/page";
import "@/app/globals.css";
export default function Page(){
 if(process.env.NODE_ENV!=="development")notFound();
 return <DemoBarcodesPage/>;
}
