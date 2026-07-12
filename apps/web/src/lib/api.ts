// Shared API-route helpers. The Auth.js middleware already guards /api/*
// (everything except /api/auth), but handlers double-check the session so a
// misconfigured matcher can never leak data.

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getAgency } from "./data/agency";

export async function requireAgency() {
  const session = await auth();
  if (!session?.user) return null;
  return getAgency();
}

export const unauthorized = () => NextResponse.json({ error: "Unauthorized" }, { status: 401 });

export const badRequest = (message: string) => NextResponse.json({ error: message }, { status: 400 });
