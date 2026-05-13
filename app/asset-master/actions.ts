"use server";

import { revalidatePath } from "next/cache";
import { removeAsset, updateAssetPrice, upsertAsset, type Asset } from "@/lib/assets-db";

function readText(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function readNumber(formData: FormData, key: string) {
  const raw = readText(formData, key).replace(/[$,]/g, "");
  const value = Number(raw);

  if (!Number.isFinite(value)) {
    throw new Error(`${key} must be a valid number`);
  }

  return value;
}

function readStatus(formData: FormData): Asset["status"] {
  const status = readText(formData, "status");
  return status === "Synced" || status === "Review" || status === "Manual" || status === "Stale" ? status : "Manual";
}

export async function saveAssetAction(formData: FormData) {
  const ticker = readText(formData, "ticker").toUpperCase();
  const name = readText(formData, "name");
  const type = readText(formData, "type") || "Stock";
  const currency = readText(formData, "currency").toUpperCase() || "USD";
  const priceSource = readText(formData, "priceSource") || "Manual";

  if (!ticker || !name) {
    throw new Error("Ticker and asset name are required");
  }

  upsertAsset({
    ticker,
    name,
    type,
    currency,
    latestPrice: readNumber(formData, "latestPrice"),
    priceSource,
    status: readStatus(formData),
  });

  revalidatePath("/asset-master");
}

export async function updatePriceAction(formData: FormData) {
  updateAssetPrice(readNumber(formData, "id"), readNumber(formData, "latestPrice"));
  revalidatePath("/asset-master");
}

export async function removeAssetAction(formData: FormData) {
  if (readText(formData, "confirmRemove") !== "yes") {
    return;
  }

  removeAsset(readNumber(formData, "id"));
  revalidatePath("/asset-master");
}
