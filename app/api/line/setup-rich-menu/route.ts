/**
 * POST /api/line/setup-rich-menu
 * リッチメニューを作成・画像アップロード・デフォルト設定する。
 * リクエストボディ:
 *   { liffBaseUrl: string, imageBase64: string, contentType?: "image/png" | "image/jpeg" }
 * または imageBase64 を省略するとメニュー構造だけ作成して richMenuId を返す。
 */
import { NextResponse } from "next/server";
import { buildRichMenuBody, createRichMenu, uploadRichMenuImage, setDefaultRichMenu } from "@/lib/line";

export async function GET() {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN?.trim();
  return NextResponse.json({
    ok: !!token,
    message: token
      ? "POST でリッチメニューをセットアップできます。"
      : "LINE_CHANNEL_ACCESS_TOKEN が未設定です。",
    usage: {
      method: "POST",
      body: {
        liffBaseUrl: "https://your-app.vercel.app（LIFFページのベースURL）",
        imageBase64: "（省略可）PNG/JPEG画像のBase64文字列",
        contentType: "image/png または image/jpeg（省略時 image/png）"
      }
    }
  });
}

export async function POST(req: Request) {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN?.trim();
  if (!token) {
    return NextResponse.json(
      { error: "LINE_CHANNEL_ACCESS_TOKEN is not set", stage: "env" },
      { status: 500 }
    );
  }

  let body: {
    liffBaseUrl?: string;
    imageBase64?: string;
    contentType?: "image/png" | "image/jpeg";
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const liffBaseUrl = body.liffBaseUrl?.trim() ?? process.env.NEXT_PUBLIC_APP_URL ?? "";
  if (!liffBaseUrl) {
    return NextResponse.json(
      { error: "liffBaseUrl が必要です（またはNEXT_PUBLIC_APP_URLを設定してください）" },
      { status: 400 }
    );
  }

  // 1. リッチメニュー構造を作成
  const menuBody = buildRichMenuBody(liffBaseUrl);
  const created = await createRichMenu(menuBody);
  if (!created.ok) {
    return NextResponse.json({ error: created.error, stage: "create_menu" }, { status: 500 });
  }

  const richMenuId = created.richMenuId;

  // 2. 画像が渡された場合はアップロード
  if (body.imageBase64) {
    const contentType = body.contentType ?? "image/png";
    const uploaded = await uploadRichMenuImage(richMenuId, body.imageBase64, contentType);
    if (!uploaded.ok) {
      return NextResponse.json(
        { error: uploaded.error, stage: "upload_image", richMenuId },
        { status: 500 }
      );
    }
  }

  // 3. デフォルトメニューに設定
  const defaulted = await setDefaultRichMenu(richMenuId);
  if (!defaulted.ok) {
    return NextResponse.json(
      { error: defaulted.error, stage: "set_default", richMenuId },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    richMenuId,
    imageUploaded: !!body.imageBase64,
    message: body.imageBase64
      ? "リッチメニューの作成・画像アップロード・デフォルト設定が完了しました。"
      : "リッチメニューの構造を作成しデフォルト設定しました。画像は LINE Developers Console からアップロードしてください。",
    liffBaseUrl,
    lineConsole: `https://developers.line.biz/console/ → Messaging API → リッチメニュー → ${richMenuId}`
  });
}
