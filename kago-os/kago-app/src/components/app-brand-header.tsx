import Image from "next/image";
import "./app-brand-header.css";

export function AppBrandHeader(){
 return <header className="app-brand-header"><Image src="/brand/light/logo-kago-app.png" alt="KAGO/App" width={2124} height={384} className="app-brand-logo" priority/></header>;
}
