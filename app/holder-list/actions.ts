"use server";

import { revalidatePath } from "next/cache";
import { addInvestorHolding, removeInvestor, removeInvestorHolding, upsertInvestor } from "@/lib/assets-db";

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

export async function saveInvestorAction(formData: FormData) {
  const name = readText(formData, "name");

  if (!name) {
    throw new Error("Investor name is required");
  }

  await upsertInvestor({
    name,
  });
  revalidatePath("/holder-list");
}

export async function removeInvestorAction(formData: FormData) {
  await removeInvestor(readText(formData, "id"));
  revalidatePath("/holder-list");
}

export async function saveHoldingAction(formData: FormData) {
  await addInvestorHolding({
    investorId: readText(formData, "investorId"),
    assetId: readText(formData, "assetId"),
    shares: readNumber(formData, "shares"),
    acquiredCost: readNumber(formData, "acquiredCost"),
    acquiredAt: readText(formData, "acquiredAt"),
  });
  revalidatePath("/holder-list");
}

export async function removeHoldingAction(formData: FormData) {
  await removeInvestorHolding(readText(formData, "id"));
  revalidatePath("/holder-list");
}
