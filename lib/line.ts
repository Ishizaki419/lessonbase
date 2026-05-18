/**
 * LINE Messaging API ヘルパー（サーバーサイド専用）
 * 必要な環境変数:
 *   LINE_CHANNEL_ACCESS_TOKEN  — チャネルアクセストークン（長期）
 *   LINE_CHANNEL_SECRET        — チャネルシークレット（Webhook署名検証用）
 */

const LINE_API_BASE = "https://api.line.me/v2/bot";

// ────────────────────────────────────────────────────────────────────────────
// 型定義
// ────────────────────────────────────────────────────────────────────────────

export type LineTextMessage = {
  type: "text";
  text: string;
};

export type LineFlexMessage = {
  type: "flex";
  altText: string;
  contents: Record<string, unknown>;
};

export type LineMessage = LineTextMessage | LineFlexMessage;

// ────────────────────────────────────────────────────────────────────────────
// プッシュ通知
// ────────────────────────────────────────────────────────────────────────────

/**
 * LINE ユーザーへプッシュメッセージを送信する。
 * LINE_CHANNEL_ACCESS_TOKEN が未設定の場合は何もしない（ログのみ）。
 */
export async function sendLinePush(
  lineUserId: string,
  messages: LineMessage[]
): Promise<{ ok: boolean; error?: string }> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN?.trim();
  if (!token) {
    console.warn("[line] LINE_CHANNEL_ACCESS_TOKEN is not set — skipping push");
    return { ok: false, error: "LINE_CHANNEL_ACCESS_TOKEN not set" };
  }
  if (!lineUserId) {
    return { ok: false, error: "lineUserId is empty" };
  }

  const res = await fetch(`${LINE_API_BASE}/message/push`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ to: lineUserId, messages })
  });

  if (!res.ok) {
    const body = await res.text();
    console.error("[line] push failed", res.status, body, { lineUserId });
    return { ok: false, error: `LINE API ${res.status}: ${body}` };
  }

  return { ok: true };
}

/**
 * 複数ユーザーへ同じメッセージをマルチキャスト送信する（最大500人）。
 */
export async function sendLineMulticast(
  lineUserIds: string[],
  messages: LineMessage[]
): Promise<{ ok: boolean; error?: string }> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN?.trim();
  if (!token) {
    console.warn("[line] LINE_CHANNEL_ACCESS_TOKEN is not set — skipping multicast");
    return { ok: false, error: "LINE_CHANNEL_ACCESS_TOKEN not set" };
  }
  if (lineUserIds.length === 0) {
    return { ok: true };
  }

  const res = await fetch(`${LINE_API_BASE}/message/multicast`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ to: lineUserIds, messages })
  });

  if (!res.ok) {
    const body = await res.text();
    console.error("[line] multicast failed", res.status, body);
    return { ok: false, error: `LINE API ${res.status}: ${body}` };
  }

  return { ok: true };
}

// ────────────────────────────────────────────────────────────────────────────
// LIFF IDトークン検証
// ────────────────────────────────────────────────────────────────────────────

type LineTokenVerifyResponse = {
  scope: string;
  client_id: string;
  expires_in: number;
  sub?: string; // LINE user ID
};

/**
 * LIFF IDトークンを LINE サーバーで検証し、LINE ユーザーIDを返す。
 */
export async function verifyLiffIdToken(
  idToken: string,
  liffId: string
): Promise<{ ok: true; lineUserId: string } | { ok: false; error: string }> {
  const res = await fetch("https://api.line.me/oauth2/v2.1/verify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      id_token: idToken,
      client_id: liffId.split("-")[0] // LIFF IDの前半がチャネルID
    }).toString()
  });

  if (!res.ok) {
    const body = await res.text();
    return { ok: false, error: `Verify failed: ${res.status} ${body}` };
  }

  const data = (await res.json()) as LineTokenVerifyResponse;
  if (!data.sub) {
    return { ok: false, error: "sub (lineUserId) missing in token" };
  }

  return { ok: true, lineUserId: data.sub };
}

// ────────────────────────────────────────────────────────────────────────────
// メッセージビルダー
// ────────────────────────────────────────────────────────────────────────────

function formatYen(amount: number) {
  return `¥${amount.toLocaleString("ja-JP")}`;
}

/** 引き落とし完了通知（生徒向け） */
export function buildChargeCompleteMessage(
  studentName: string,
  totalAmount: number,
  items: { description: string; amount: number }[],
  schoolName: string
): LineFlexMessage {
  const rows = items.map((item) => ({
    type: "box",
    layout: "horizontal",
    contents: [
      { type: "text", text: item.description || "月謝", size: "sm", color: "#555555", flex: 3 },
      {
        type: "text",
        text: formatYen(item.amount),
        size: "sm",
        color: "#111111",
        align: "end",
        flex: 2
      }
    ]
  }));

  return {
    type: "flex",
    altText: `【${schoolName}】${formatYen(totalAmount)}の引き落としが完了しました`,
    contents: {
      type: "bubble",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#1E3A5F",
        contents: [
          {
            type: "text",
            text: "引き落とし完了のお知らせ",
            color: "#FFFFFF",
            size: "md",
            weight: "bold"
          }
        ]
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "md",
        contents: [
          { type: "text", text: `${studentName} 様`, size: "sm", color: "#333333" },
          { type: "separator" },
          {
            type: "box",
            layout: "vertical",
            spacing: "sm",
            contents: rows
          },
          { type: "separator" },
          {
            type: "box",
            layout: "horizontal",
            contents: [
              { type: "text", text: "合計", size: "sm", weight: "bold", flex: 3 },
              {
                type: "text",
                text: formatYen(totalAmount),
                size: "sm",
                weight: "bold",
                color: "#1E3A5F",
                align: "end",
                flex: 2
              }
            ]
          }
        ]
      },
      footer: {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "text",
            text: schoolName,
            size: "xs",
            color: "#aaaaaa",
            align: "center"
          }
        ]
      }
    }
  };
}

/** 引き落とし結果サマリー（先生向け） */
export function buildChargeSummaryMessage(
  schoolName: string,
  year: number,
  month: number,
  chargedStudents: number,
  failedStudents: number,
  totalAmount: number
): LineTextMessage {
  const lines = [
    `【${schoolName}】${year}年${month}月 引き落とし完了`,
    `━━━━━━━━━━━━━━━`,
    `✅ 成功: ${chargedStudents}名`,
    failedStudents > 0 ? `❌ 失敗: ${failedStudents}名` : null,
    `💰 合計: ${formatYen(totalAmount)}`,
    `━━━━━━━━━━━━━━━`,
    failedStudents > 0 ? "⚠️ 失敗分は管理画面でご確認ください。" : "全員の引き落としが正常に完了しました。"
  ]
    .filter(Boolean)
    .join("\n");

  return { type: "text", text: lines };
}

/** 予約確定通知（生徒向け） */
export function buildBookingConfirmMessage(
  studentName: string,
  bookingDate: string,
  startTime: string,
  endTime: string,
  schoolName: string
): LineFlexMessage {
  return {
    type: "flex",
    altText: `【${schoolName}】予約が確定しました`,
    contents: {
      type: "bubble",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#1E3A5F",
        contents: [
          {
            type: "text",
            text: "予約確定のお知らせ",
            color: "#FFFFFF",
            size: "md",
            weight: "bold"
          }
        ]
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "md",
        contents: [
          { type: "text", text: `${studentName} 様`, size: "sm", color: "#333333" },
          { type: "separator" },
          {
            type: "box",
            layout: "horizontal",
            contents: [
              { type: "text", text: "日付", size: "sm", color: "#888888", flex: 2 },
              { type: "text", text: bookingDate, size: "sm", color: "#111111", flex: 3 }
            ]
          },
          {
            type: "box",
            layout: "horizontal",
            contents: [
              { type: "text", text: "時間", size: "sm", color: "#888888", flex: 2 },
              {
                type: "text",
                text: `${startTime} 〜 ${endTime}`,
                size: "sm",
                color: "#111111",
                flex: 3
              }
            ]
          }
        ]
      },
      footer: {
        type: "box",
        layout: "vertical",
        contents: [
          { type: "text", text: schoolName, size: "xs", color: "#aaaaaa", align: "center" }
        ]
      }
    }
  };
}

// ────────────────────────────────────────────────────────────────────────────
// リッチメニュー
// ────────────────────────────────────────────────────────────────────────────

/**
 * リッチメニューJSON定義（2分割 レッスン確認 / 月謝確認）
 * 画像は別途 uploadRichMenuImage() でアップロードすること。
 */
export function buildRichMenuBody(liffBaseUrl: string) {
  return {
    size: { width: 2500, height: 843 },
    selected: true,
    name: "LessonBase メニュー",
    chatBarText: "メニュー",
    areas: [
      {
        bounds: { x: 0, y: 0, width: 1250, height: 843 },
        action: {
          type: "uri",
          label: "レッスン確認",
          uri: `${liffBaseUrl}/bookings`
        }
      },
      {
        bounds: { x: 1250, y: 0, width: 1250, height: 843 },
        action: {
          type: "uri",
          label: "月謝確認",
          uri: `${liffBaseUrl}/payments`
        }
      }
    ]
  };
}

/** リッチメニューを作成して ID を返す */
export async function createRichMenu(
  menuBody: ReturnType<typeof buildRichMenuBody>
): Promise<{ ok: true; richMenuId: string } | { ok: false; error: string }> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN?.trim();
  if (!token) return { ok: false, error: "LINE_CHANNEL_ACCESS_TOKEN not set" };

  const res = await fetch(`${LINE_API_BASE}/richmenu`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(menuBody)
  });

  if (!res.ok) {
    const body = await res.text();
    return { ok: false, error: `LINE API ${res.status}: ${body}` };
  }

  const data = (await res.json()) as { richMenuId: string };
  return { ok: true, richMenuId: data.richMenuId };
}

/** 欠席連絡通知（先生向け） */
export function buildAbsenceNotifyMessage(
  studentName: string,
  absenceDate: string,
  reason: string,
  absenceId: string,
  schoolName: string,
  schoolId?: string
): LineFlexMessage {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const liffId = process.env.NEXT_PUBLIC_LIFF_ID ?? "";
  const query = schoolId ? `?schoolId=${schoolId}` : "";
  const makeupUrl = liffId
    ? `https://liff.line.me/${liffId}/makeup/${absenceId}${query}`
    : `${appUrl}/makeup/${absenceId}${query}`;

  return {
    type: "flex",
    altText: `【${schoolName}】${studentName}さんが欠席連絡をしました`,
    contents: {
      type: "bubble",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#E8A000",
        contents: [
          { type: "text", text: "欠席連絡", color: "#FFFFFF", size: "md", weight: "bold" }
        ]
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "md",
        contents: [
          {
            type: "box", layout: "horizontal",
            contents: [
              { type: "text", text: "生徒", size: "sm", color: "#888888", flex: 2 },
              { type: "text", text: studentName, size: "sm", color: "#111111", flex: 3 }
            ]
          },
          {
            type: "box", layout: "horizontal",
            contents: [
              { type: "text", text: "欠席日", size: "sm", color: "#888888", flex: 2 },
              { type: "text", text: absenceDate, size: "sm", color: "#111111", flex: 3 }
            ]
          },
          ...(reason ? [{
            type: "box" as const, layout: "horizontal" as const,
            contents: [
              { type: "text" as const, text: "理由", size: "sm" as const, color: "#888888", flex: 2 },
              { type: "text" as const, text: reason, size: "sm" as const, color: "#111111", flex: 3, wrap: true }
            ]
          }] : [])
        ]
      },
      footer: {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "button",
            style: "primary",
            color: "#1E3A5F",
            action: {
              type: "uri",
              label: "振替日を送る",
              uri: makeupUrl
            }
          }
        ]
      }
    }
  };
}

/** 振替確定通知（生徒・先生共通） */
export function buildMakeupConfirmedMessage(
  studentName: string,
  bookingDate: string,
  startTime: string,
  endTime: string,
  schoolName: string
): LineFlexMessage {
  return {
    type: "flex",
    altText: `【${schoolName}】振替レッスンが確定しました`,
    contents: {
      type: "bubble",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#1E3A5F",
        contents: [
          { type: "text", text: "振替レッスン確定", color: "#FFFFFF", size: "md", weight: "bold" }
        ]
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "md",
        contents: [
          { type: "text", text: `${studentName} 様`, size: "sm", color: "#333333" },
          { type: "separator" },
          {
            type: "box", layout: "horizontal",
            contents: [
              { type: "text", text: "日付", size: "sm", color: "#888888", flex: 2 },
              { type: "text", text: bookingDate, size: "sm", color: "#111111", flex: 3 }
            ]
          },
          {
            type: "box", layout: "horizontal",
            contents: [
              { type: "text", text: "時間", size: "sm", color: "#888888", flex: 2 },
              { type: "text", text: `${startTime} 〜 ${endTime}`, size: "sm", color: "#111111", flex: 3 }
            ]
          }
        ]
      },
      footer: {
        type: "box", layout: "vertical",
        contents: [
          { type: "text", text: schoolName, size: "xs", color: "#aaaaaa", align: "center" }
        ]
      }
    }
  };
}

/** リッチメニューに画像をアップロード（PNG/JPEG, Base64文字列） */
export async function uploadRichMenuImage(
  richMenuId: string,
  imageBase64: string,
  contentType: "image/png" | "image/jpeg"
): Promise<{ ok: boolean; error?: string }> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN?.trim();
  if (!token) return { ok: false, error: "LINE_CHANNEL_ACCESS_TOKEN not set" };

  const buffer = Buffer.from(imageBase64, "base64");
  const res = await fetch(`https://api-data.line.me/v2/bot/richmenu/${richMenuId}/content`, {
    method: "POST",
    headers: {
      "Content-Type": contentType,
      Authorization: `Bearer ${token}`
    },
    body: buffer
  });

  if (!res.ok) {
    const body = await res.text();
    return { ok: false, error: `LINE API ${res.status}: ${body}` };
  }

  return { ok: true };
}

/** リッチメニューをデフォルト（全ユーザー）に設定 */
export async function setDefaultRichMenu(
  richMenuId: string
): Promise<{ ok: boolean; error?: string }> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN?.trim();
  if (!token) return { ok: false, error: "LINE_CHANNEL_ACCESS_TOKEN not set" };

  const res = await fetch(`${LINE_API_BASE}/user/all/richmenu/${richMenuId}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!res.ok) {
    const body = await res.text();
    return { ok: false, error: `LINE API ${res.status}: ${body}` };
  }

  return { ok: true };
}
