import couponProducts from "@/data/demo/coupon-barcodes.json";
import { DEMO_PRODUCT_LIST, type Product } from "./products";

// Printed reference assets only; checkout always uses the selected store's DB products/prices.
export const DEMO_BARCODE_LIST: Product[] = [...DEMO_PRODUCT_LIST, ...couponProducts];
