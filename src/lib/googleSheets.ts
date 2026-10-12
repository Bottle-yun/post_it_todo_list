// Google Apps Script API 클라이언트 유틸리티

export interface SheetNote {
  timestamp?: string | number;
  id?: string;
  content: string;
  category: "할 일" | "아이디어" | "기타";
  color: "yellow" | "pink" | "green" | "blue";
  datetime: string;
  state?: string;
  order?: number;
}

/**
 * 환경 변수 접근 유틸리티
 * - URL을 코드에 하드코딩하지 않음
 * - process.env.NEXT_PUBLIC_GOOGLE_SCRIPT_URL 단일 키 값 사용
 */
export function getGoogleScriptUrl(): string {
  const GOOGLE_SCRIPT_URL = process.env.NEXT_PUBLIC_GOOGLE_SCRIPT_URL;
  return GOOGLE_SCRIPT_URL ? GOOGLE_SCRIPT_URL.trim() : "";
}

/**
 * 구글 시트에서 전체 메모 목록 가져오기 (Read - GET)
 */
export async function fetchNotesFromSheet(): Promise<{
  success: boolean;
  data: SheetNote[];
  error?: string;
}> {
  const scriptUrl = getGoogleScriptUrl();
  if (!scriptUrl) {
    return {
      success: false,
      data: [],
      error: "NEXT_PUBLIC_GOOGLE_SCRIPT_URL 환경 변수가 설정되지 않았습니다.",
    };
  }

  try {
    const res = await fetch(scriptUrl, {
      method: "GET",
      cache: "no-store",
    });

    if (!res.ok) {
      throw new Error(`HTTP 요청 오류 (상태 코드: ${res.status})`);
    }

    const result = await res.json();
    if (result.success && Array.isArray(result.data)) {
      return { success: true, data: result.data };
    }
    return {
      success: false,
      data: [],
      error: result.error || "메모 목록을 가져오지 못했습니다.",
    };
  } catch (err: unknown) {
    const errorMessage =
      err instanceof Error ? err.message : "알 수 없는 네트워크 오류가 발생했습니다.";
    console.error("구글 시트 데이터 조회 실패:", errorMessage);
    return { success: false, data: [], error: errorMessage };
  }
}

/**
 * 구글 시트에 새 메모 추가 (Create - POST)
 */
export async function createNoteInSheet(
  note: SheetNote
): Promise<{ success: boolean; error?: string }> {
  const scriptUrl = getGoogleScriptUrl();
  if (!scriptUrl) {
    return {
      success: false,
      error: "NEXT_PUBLIC_GOOGLE_SCRIPT_URL 환경 변수가 설정되지 않았습니다.",
    };
  }

  try {
    // Apps Script의 CORS 리다이렉트 대응을 위해 text/plain 전송
    await fetch(scriptUrl, {
      method: "POST",
      mode: "no-cors",
      headers: {
        "Content-Type": "text/plain;charset=utf-8",
      },
      body: JSON.stringify({
        action: "create",
        note,
      }),
    });
    return { success: true };
  } catch (err: unknown) {
    const errorMessage =
      err instanceof Error ? err.message : "알 수 없는 네트워크 오류가 발생했습니다.";
    console.error("구글 시트 메모 생성 실패:", errorMessage);
    return { success: false, error: errorMessage };
  }
}

/**
 * 구글 시트 메모 내용 및 상태 수정 (Update - POST)
 */
export async function updateNoteInSheet(
  id: string,
  updatedData: Partial<SheetNote>
): Promise<{ success: boolean; error?: string }> {
  const scriptUrl = getGoogleScriptUrl();
  if (!scriptUrl) {
    return {
      success: false,
      error: "NEXT_PUBLIC_GOOGLE_SCRIPT_URL 환경 변수가 설정되지 않았습니다.",
    };
  }

  try {
    await fetch(scriptUrl, {
      method: "POST",
      mode: "no-cors",
      headers: {
        "Content-Type": "text/plain;charset=utf-8",
      },
      body: JSON.stringify({
        action: "update",
        id,
        note: updatedData,
      }),
    });
    return { success: true };
  } catch (err: unknown) {
    const errorMessage =
      err instanceof Error ? err.message : "알 수 없는 네트워크 오류가 발생했습니다.";
    console.error("구글 시트 메모 수정 실패:", errorMessage);
    return { success: false, error: errorMessage };
  }
}

/**
 * 구글 시트 메모 삭제 (Delete - POST)
 */
export async function deleteNoteFromSheet(
  id: string
): Promise<{ success: boolean; error?: string }> {
  const scriptUrl = getGoogleScriptUrl();
  if (!scriptUrl) {
    return {
      success: false,
      error: "NEXT_PUBLIC_GOOGLE_SCRIPT_URL 환경 변수가 설정되지 않았습니다.",
    };
  }

  try {
    await fetch(scriptUrl, {
      method: "POST",
      mode: "no-cors",
      headers: {
        "Content-Type": "text/plain;charset=utf-8",
      },
      body: JSON.stringify({
        action: "delete",
        id,
      }),
    });
    return { success: true };
  } catch (err: unknown) {
    const errorMessage =
      err instanceof Error ? err.message : "알 수 없는 네트워크 오류가 발생했습니다.";
    console.error("구글 시트 메모 삭제 실패:", errorMessage);
    return { success: false, error: errorMessage };
  }
}

/**
 * 드래그 앤 드롭 순서 변경 일괄 반영 (Reorder - POST)
 */
export async function reorderNotesInSheet(
  orders: { id: string; order: number }[]
): Promise<{ success: boolean; error?: string }> {
  const scriptUrl = getGoogleScriptUrl();
  if (!scriptUrl) {
    return {
      success: false,
      error: "NEXT_PUBLIC_GOOGLE_SCRIPT_URL 환경 변수가 설정되지 않았습니다.",
    };
  }

  try {
    await fetch(scriptUrl, {
      method: "POST",
      mode: "no-cors",
      headers: {
        "Content-Type": "text/plain;charset=utf-8",
      },
      body: JSON.stringify({
        action: "reorder",
        orders,
      }),
    });
    return { success: true };
  } catch (err: unknown) {
    const errorMessage =
      err instanceof Error ? err.message : "알 수 없는 네트워크 오류가 발생했습니다.";
    console.error("구글 시트 순서 변경 실패:", errorMessage);
    return { success: false, error: errorMessage };
  }
}
