import { NextResponse } from "next/server";
import { getRepositories } from "#server/dashboard-repositories.js";

export async function GET() {
  try {
    const { positionRepository } = await getRepositories();
    const positions = await positionRepository.findAll();
    return NextResponse.json({ positions });
  } catch (error) {
    console.error("failed to fetch positions", error);
    return NextResponse.json({ error: "internal server error" }, { status: 500 });
  }
}
