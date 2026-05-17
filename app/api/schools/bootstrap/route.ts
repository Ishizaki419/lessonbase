import { NextResponse } from "next/server";

import {
  createSupabaseAdminClient,
  supabaseAdminEnvErrorPayload
} from "@/lib/supabaseAdmin";

export async function POST(req: Request) {
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { client: admin, env: supabaseEnv } = createSupabaseAdminClient();
  if (!admin) {
    return NextResponse.json(supabaseAdminEnvErrorPayload(supabaseEnv, "schools/bootstrap"), {
      status: 500
    });
  }

  let body: { schoolName?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const schoolName = body.schoolName?.trim();
  if (!schoolName) {
    return NextResponse.json({ error: "schoolName is required" }, { status: 400 });
  }

  const {
    data: { user },
    error: userError
  } = await admin.auth.getUser(token);

  if (userError || !user) {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  const { data: existing } = await admin
    .from("school_members")
    .select("id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ error: "already_has_school" }, { status: 400 });
  }

  const { data: school, error: schoolError } = await admin
    .from("schools")
    .insert({ name: schoolName, owner_id: user.id })
    .select("id")
    .single();

  if (schoolError || !school) {
    return NextResponse.json({ error: schoolError?.message ?? "insert failed" }, { status: 500 });
  }

  const { error: memberError } = await admin.from("school_members").insert({
    school_id: school.id,
    user_id: user.id,
    role: "owner"
  });

  if (memberError) {
    return NextResponse.json({ error: memberError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, schoolId: school.id });
}
