import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const body = await req.json();
  const { uid, name, phone, apiEvent } = body;

  const gasSaveUrl = process.env.GAS_SAVE_URL;
  const token = process.env.GAS_TOKEN || ""
  if (!gasSaveUrl) {
    return NextResponse.json({ error: "GAS_SAVE_URL not configured" }, { status: 500 });
  }

  try {
     
    const response = await fetch(gasSaveUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uid, name, phone, type: "apiEvent", apiEvent, token: token }),
    });

    if (!response.ok) {
      return NextResponse.json({ error: "Failed to save to GAS" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("GAS save proxy error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
