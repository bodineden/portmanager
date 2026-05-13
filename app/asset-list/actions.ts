"use server";

import { revalidatePath } from "next/cache";
import { recoverAsset, removeAsset, updateAssetPrice, upsertAsset } from "@/lib/assets-db";

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

export async function saveAssetAction(formData: FormData) {
  const ticker = readText(formData, "ticker").toUpperCase();
  const fullName = readText(formData, "fullName");
  const currencyCode = readText(formData, "currencyCode").toUpperCase() || "USD";

  if (!ticker || !fullName) {
    throw new Error("Ticker and asset name are required");
  }

  await upsertAsset({
    ticker,
    fullName,
    sourceLink: readText(formData, "sourceLink"),
    currencyCode,
    currentPrice: readNumber(formData, "currentPrice"),
  });

  revalidatePath("/asset-list");
}

export async function updatePriceAction(formData: FormData) {
  await updateAssetPrice(readText(formData, "id"), readNumber(formData, "currentPrice"));
  revalidatePath("/asset-list");
}

export async function removeAssetAction(formData: FormData) {
  if (readText(formData, "confirmRemove") !== "yes") {
    return;
  }

  await removeAsset(readText(formData, "id"));
  revalidatePath("/asset-list");
  revalidatePath("/holder-list");
}

export async function recoverAssetAction(formData: FormData) {
  await recoverAsset(readText(formData, "id"));
  revalidatePath("/asset-list");
  revalidatePath("/holder-list");
}
