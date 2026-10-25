import type {SVGProps} from "react";
type Name="cart"|"camera"|"search"|"home"|"history"|"user"|"arrow"|"trash"|"coupon"|"store"|"heart";
const paths:Record<Name,React.ReactNode>={
 store:<><path d="M3 9l2-6h14l2 6M3 9h18v3a3 3 0 0 1-6 0 3 3 0 0 1-6 0 3 3 0 0 1-6 0zM5 15v7h14v-7M10 22v-6h4v6"/></>,
 heart:<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8z"/>,
 cart:<><path d="M2 3h3l3 12h11l3-9H6"/><path d="M9 9h10M10 6v9m5-9v9"/><circle cx="9" cy="20" r="1"/><circle cx="19" cy="20" r="1"/></>,
 camera:<><path d="M3 7h4l2-3h6l2 3h4v14H3z"/><circle cx="12" cy="13" r="4"/></>,
 search:<><circle cx="10.5" cy="10.5" r="7.5"/><path d="m16 16 6 6"/></>,
 home:<><path d="m2 11 10-9 10 9"/><path d="M5 9v13h5v-7h4v7h5V9"/></>,
 history:<><circle cx="12" cy="12" r="10"/><path d="M12 5v7h5"/></>,
 user:<><circle cx="12" cy="7" r="4"/><path d="M3 22v-3a9 9 0 0 1 18 0v3Z"/></>,
 trash:<><path d="M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7"/></>,
 coupon:<><path d="M4 4h16v5a3 3 0 0 0 0 6v5H4v-5a3 3 0 0 0 0-6z"/><path d="M9 8v8m6-8v8"/></>,
 arrow:<path d="m9 4 8 8-8 8"/>,
};
export function ShoppingIcon({name,...props}:SVGProps<SVGSVGElement>&{name:Name}){
 return <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{paths[name]}</svg>;
}
