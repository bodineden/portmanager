"use server";

import { revalidatePath } from "next/cache";
import { upsertExchangeRate } from "@/lib/assets-db";

function readText(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function readNumber(formData: FormData, key: string) {
  const value = Number(readText(formData, key).replace(/[$,]/g, ""));

  if (!Number.isFinite(value)) {
    throw new Error(`${key} must be a valid number`);
  }

  return value;
}

export async function saveExchangeRateAction(formData: FormData) {
  await upsertExchangeRate({
    fromCurrency: readText(formData, "fromCurrency").toUpperCase(),
    toCurrency: readText(formData, "toCurrency").toUpperCase() || "THB",
    rate: readNumber(formData, "rate"),
  });

  revalidatePath("/exchange-rate");
  revalidatePath("/holder-list");
}
