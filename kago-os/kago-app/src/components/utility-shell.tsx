import type { ReactNode } from "react";
import { AppBrandHeader } from "./app-brand-header";
import "./utility-shell.css";

export function UtilityShell({children,kind}:{children:ReactNode;kind:"store"|"barcodes"}){
 return <div className={"utility-page utility-"+kind}>{kind==="store"?<header className="app-brand-header utility-store-brand"><span>KAGO/Store</span></header>:<AppBrandHeader/>}<div className="utility-scroll">{children}</div></div>;
}
