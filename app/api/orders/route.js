import { NextResponse } from "next/server";
import { getRepositories } from "#server/dashboard-repositories.js";

export async function GET() {
  try {
    const { orderRepository } = await getRepositories();
    const orders = await orderRepository.findAllOpen();
    return NextResponse.json({ orders });
  } catch (error) {
    console.error("failed to fetch orders", error);
    return NextResponse.json({ error: "internal server error" }, { status: 500 });
  }
}
