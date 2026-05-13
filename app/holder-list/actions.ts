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

  upsertInvestor({
    name,
    email: readText(formData, "email"),
    capitalContributed: readNumber(formData, "capitalContributed"),
  });
  revalidatePath("/holder-list");
}

export async function removeInvestorAction(formData: FormData) {
  removeInvestor(readNumber(formData, "id"));
  revalidatePath("/holder-list");
}

export async function saveHoldingAction(formData: FormData) {
  addInvestorHolding({
    investorId: readNumber(formData, "investorId"),
    assetTicker: readText(formData, "assetTicker"),
    units: readNumber(formData, "units"),
    costBasis: readNumber(formData, "costBasis"),
  });
  revalidatePath("/holder-list");
}

export async function removeHoldingAction(formData: FormData) {
  removeInvestorHolding(readNumber(formData, "id"));
  revalidatePath("/holder-list");
}
