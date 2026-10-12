"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Sun,
  Moon,
  Plus,
  Trash2,
  Edit3,
  Check,
  X,
  Pin,
  Filter,
  Calendar,
  Loader2,
  CheckCircle2,
  Circle,
  AlertCircle,
  Palette,
} from "lucide-react";
import {
  fetchNotesFromSheet,
  createNoteInSheet,
  updateNoteInSheet,
  deleteNoteFromSheet,
  reorderNotesInSheet,
  SheetNote,
} from "@/lib/googleSheets";

type Category = "할 일" | "아이디어" | "기타";
type FilterCategory = "전체" | Category;
type NoteColor = "yellow" | "pink" | "green" | "blue";

interface Note {
  id: string;
  content: string;
  category: Category;
  color: NoteColor;
  createdAt: string;
  state: "active" | "completed";
  order: number;
  x: number; // 캔버스 내 상대 x 좌표 (px)
  y: number; // 캔버스 내 상대 y 좌표 (px)
  isNew?: boolean;
}

const COLOR_CLASSES: Record<
  NoteColor,
  {
    bg: string;
    border: string;
    badge: string;
    tape: string;
  }
> = {
  yellow: {
    bg: "bg-[#fff9a6] dark:bg-[#4d4810] text-zinc-900 dark:text-yellow-50",
    border: "border-yellow-300 dark:border-yellow-700/60",
    badge: "bg-yellow-200/80 dark:bg-yellow-900/60 text-yellow-800 dark:text-yellow-200",
    tape: "bg-amber-100/70 border-amber-300/40",
  },
  pink: {
    bg: "bg-[#ffd1dc] dark:bg-[#4d162a] text-zinc-900 dark:text-pink-50",
    border: "border-pink-300 dark:border-pink-700/60",
    badge: "bg-pink-200/80 dark:bg-pink-900/60 text-pink-800 dark:text-pink-200",
    tape: "bg-rose-100/70 border-rose-300/40",
  },
  green: {
    bg: "bg-[#c8f7c5] dark:bg-[#164023] text-zinc-900 dark:text-emerald-50",
    border: "border-emerald-300 dark:border-emerald-700/60",
    badge: "bg-emerald-200/80 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-200",
    tape: "bg-emerald-100/70 border-emerald-300/40",
  },
  blue: {
    bg: "bg-[#d0ebff] dark:bg-[#15344f] text-zinc-900 dark:text-blue-50",
    border: "border-blue-300 dark:border-blue-700/60",
    badge: "bg-blue-200/80 dark:bg-blue-900/60 text-blue-800 dark:text-blue-200",
    tape: "bg-sky-100/70 border-sky-300/40",
  },
};

const CATEGORIES: Category[] = ["할 일", "아이디어", "기타"];
const FILTER_CATEGORIES: FilterCategory[] = ["전체", "할 일", "아이디어", "기타"];
const COLORS: NoteColor[] = ["yellow", "pink", "green", "blue"];

// 보드(캔버스) 내에서 가장자리를 제외한 무작위 위치 생성
function getRandomPosition(boardEl?: HTMLDivElement | null) {
  const isClient = typeof window !== "undefined";
  const clientWidth = isClient ? window.innerWidth : 1200;
  const isMobile = clientWidth < 640;

  const cardWidth = isMobile ? 240 : 280;
  const cardHeight = isMobile ? 190 : 230;

  const boardWidth = boardEl ? boardEl.clientWidth : (isClient ? Math.min(clientWidth - 32, 1200) : 1000);
  const boardHeight = boardEl ? Math.max(boardEl.clientHeight, 550) : 600;

  // 가장자리를 제외하기 위한 여백 설정 (안쪽 안전 영역)
  const edgeMarginX = isMobile ? 30 : 60;
  const edgeMarginY = isMobile ? 30 : 60;

  const minX = edgeMarginX;
  const maxX = Math.max(minX, boardWidth - cardWidth - edgeMarginX);

  const minY = edgeMarginY;
  const maxY = Math.max(minY, boardHeight - cardHeight - edgeMarginY);

  const randomX = Math.round(minX + Math.random() * (maxX - minX));
  const randomY = Math.round(minY + Math.random() * (maxY - minY));

  return { x: randomX, y: randomY };
}


function formatCurrentDateTime(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const date = String(now.getDate()).padStart(2, "0");
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");

  const dayNames = ["일", "월", "화", "수", "목", "금", "토"];
  const dayName = dayNames[now.getDay()];

  return `${year}.${month}.${date} ${hours}:${minutes} (${dayName})`;
}

export default function Home() {
  const [mounted, setMounted] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [notes, setNotes] = useState<Note[]>([]);
  const [inputText, setInputText] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<Category>("할 일");
  const [filterCategory, setFilterCategory] = useState<FilterCategory>("전체");

  // 시트 연동 및 상태
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSheetConnected, setIsSheetConnected] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // 편집 모드 상태
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [editCategory, setEditCategory] = useState<Category>("할 일");

  // 캔버스 드래그 관리
  const boardRef = useRef<HTMLDivElement>(null);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const dragOffsetRef = useRef<{ offsetX: number; offsetY: number }>({ offsetX: 0, offsetY: 0 });
  const [topZId, setTopZId] = useState<string | null>(null);

  const showError = (msg: string) => {
    setErrorMessage(msg);
    setTimeout(() => {
      setErrorMessage(null);
    }, 4000);
  };

  const loadData = async () => {
    setIsSyncing(true);
    const hasScriptUrl = Boolean(process.env.NEXT_PUBLIC_GOOGLE_SCRIPT_URL);
    setIsSheetConnected(hasScriptUrl);

    if (hasScriptUrl) {
      const response = await fetchNotesFromSheet();
      if (response.success) {
        // 기존 저장된 위치 좌표 복원
        const localPositions: Record<string, { x: number; y: number }> = {};
        const savedNotesStr = localStorage.getItem("postit_notes");
        if (savedNotesStr) {
          try {
            const parsed: Note[] = JSON.parse(savedNotesStr);
            parsed.forEach((n) => {
              localPositions[n.id] = { x: n.x, y: n.y };
            });
          } catch {}
        }

        const formattedNotes: Note[] = response.data.map((item, index) => {
          // 구글 시트 필드 위치 분석:
          // 1) item.content 또는 item.datetime 중 색상 이름('yellow','pink','green','blue')이 아닌 실제 텍스트를 content로 채택
          // 2) 날짜 문자열(숫자, '.', ':', '(' 포함)을 createdAt으로 채택
          // 3) 색상 문자열('yellow'|'pink'|'green'|'blue')을 color로 채택
          const candidates = [item.datetime, item.content, item.color].filter(Boolean) as string[];

          // 색상 탐색
          const detectedColor = candidates.find((c) => COLORS.includes(c as NoteColor)) as NoteColor | undefined;
          const finalColor: NoteColor = detectedColor || COLORS[index % COLORS.length];

          // 날짜 탐색 (예: 2026.10.12 14:45 (월))
          const detectedDate = candidates.find((c) => /\d{4}[.-]\d{2}[.-]\d{2}|\d{2}:\d{2}/.test(c));
          const finalDate = detectedDate || formatCurrentDateTime();

          // 실제 내용 탐색 (색상이 아니고, 날짜도 아닌 텍스트)
          const detectedContent = candidates.find(
            (c) => c !== detectedColor && c !== detectedDate
          );
          // 만약 따로 분리되지 않는 경우 fallback
          const finalContent = detectedContent || item.datetime || item.content || "";

          const category = (CATEGORIES.includes(item.category as Category)
            ? item.category
            : "할 일") as Category;

          const state = item.state === "completed" ? "completed" : "active";
          const id = String(item.timestamp || item.id || `note-${index}`);
          const randomPos = getRandomPosition(boardRef.current);

          return {
            id,
            content: String(finalContent),
            category,
            color: finalColor,
            createdAt: String(finalDate),
            state,
            order: Number(item.order !== undefined ? item.order : index + 1),
            x: localPositions[id]?.x ?? randomPos.x,
            y: localPositions[id]?.y ?? randomPos.y,
          };
        });

        formattedNotes.sort((a, b) => a.order - b.order);
        setNotes(formattedNotes);
        localStorage.setItem("postit_notes", JSON.stringify(formattedNotes));
        setIsSyncing(false);
        return;
      }
    }

    const savedNotes = localStorage.getItem("postit_notes");
    if (savedNotes) {
      try {
        setNotes(JSON.parse(savedNotes));
      } catch {}
    } else {
      const initialNotes: Note[] = [
        {
          id: "note-1",
          content: "오늘의 주요 일정 정리하고 시원한 커피 한 잔 마시기 ☕",
          category: "할 일",
          color: "yellow",
          createdAt: formatCurrentDateTime(),
          state: "active",
          order: 1,
          ...getRandomPosition(boardRef.current),
        },
        {
          id: "note-2",
          content: "주말에 읽을 책 리스트 정리 & 가벼운 산책 코스 찾아보기 🌿",
          category: "아이디어",
          color: "pink",
          createdAt: formatCurrentDateTime(),
          state: "active",
          order: 2,
          ...getRandomPosition(boardRef.current),
        },
        {
          id: "note-3",
          content: "포스트잇을 드래그해서 어디든지 자유롭게 겹쳐 배치해 보세요! ✨",
          category: "기타",
          color: "green",
          createdAt: formatCurrentDateTime(),
          state: "active",
          order: 3,
          ...getRandomPosition(boardRef.current),
        },
      ];
      setNotes(initialNotes);
    }
    setIsSyncing(false);
  };

  useEffect(() => {
    setMounted(true);
    const savedTheme = localStorage.getItem("postit_theme");
    if (savedTheme === "dark") {
      setIsDarkMode(true);
      document.documentElement.classList.add("dark");
    } else {
      setIsDarkMode(false);
      document.documentElement.classList.remove("dark");
    }

    loadData();

    // 화면 비율/크기 변경 시 모든 메모가 경계선 안쪽으로 자연스럽게 밀려 머물도록 자동 보정
    const handleResize = () => {
      if (!boardRef.current) return;
      const boardWidth = boardRef.current.clientWidth;
      const boardHeight = boardRef.current.clientHeight;
      const isMobile = window.innerWidth < 640;
      const cardWidth = isMobile ? 240 : 280;
      const cardHeight = isMobile ? 190 : 230;

      const minX = 12;
      const minY = 16;
      const maxX = Math.max(minX, boardWidth - cardWidth - 14);
      const maxY = Math.max(minY, boardHeight - cardHeight - 16);

      setNotes((prev) =>
        prev.map((n) => ({
          ...n,
          x: Math.max(minX, Math.min(n.x, maxX)),
          y: Math.max(minY, Math.min(n.y, maxY)),
        }))
      );
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (mounted) {
      localStorage.setItem("postit_notes", JSON.stringify(notes));
    }
  }, [notes, mounted]);

  const toggleDarkMode = () => {
    if (isDarkMode) {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("postit_theme", "light");
      setIsDarkMode(false);
    } else {
      document.documentElement.classList.add("dark");
      localStorage.setItem("postit_theme", "dark");
      setIsDarkMode(true);
    }
  };

  // 새 메모 추가
  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;

    const randomColor = COLORS[Math.floor(Math.random() * COLORS.length)];
    const nowFormatted = formatCurrentDateTime();
    const newId = "note_" + Date.now();

    // 메모 목록 내 범위 중 가장자리를 제외한 무작위 위치 계산
    const pos = getRandomPosition(boardRef.current);

    const newNote: Note = {
      id: newId,
      content: inputText.trim(),
      category: selectedCategory,
      color: randomColor,
      createdAt: nowFormatted,
      state: "active",
      order: 1,
      x: pos.x,
      y: pos.y,
      isNew: true,
    };

    const updatedList = [
      newNote,
      ...notes.map((item, idx) => ({ ...item, order: idx + 2 })),
    ];

    setNotes(updatedList);
    setInputText("");
    setTopZId(newId);

    if (isSheetConnected) {
      setIsSyncing(true);
      const sheetPayload: SheetNote = {
        timestamp: newId,
        id: newId,
        content: newNote.content,
        category: newNote.category,
        color: newNote.color,
        datetime: newNote.createdAt,
        state: "active",
        order: newNote.order,
      };
      const res = await createNoteInSheet(sheetPayload);
      if (!res.success) {
        showError("구글 시트에 메모를 저장하지 못했습니다.");
      }
      setIsSyncing(false);
    }
  };

  // 색상 순환 변경
  const handleCycleColor = async (note: Note) => {
    const currentIndex = COLORS.indexOf(note.color);
    const nextColor = COLORS[(currentIndex + 1) % COLORS.length];

    setNotes((prev) =>
      prev.map((n) => (n.id === note.id ? { ...n, color: nextColor } : n))
    );

    if (isSheetConnected) {
      setIsSyncing(true);
      const res = await updateNoteInSheet(note.id, { color: nextColor });
      if (!res.success) {
        showError("색상 변경을 구글 시트에 동기화하지 못했습니다.");
      }
      setIsSyncing(false);
    }
  };

  // 완료 상태 토글
  const handleToggleState = async (note: Note) => {
    const newState = note.state === "completed" ? "active" : "completed";
    setNotes((prev) =>
      prev.map((n) => (n.id === note.id ? { ...n, state: newState } : n))
    );

    if (isSheetConnected) {
      setIsSyncing(true);
      const res = await updateNoteInSheet(note.id, { state: newState });
      if (!res.success) {
        showError("완료 상태를 시트에 동기화하지 못했습니다.");
      }
      setIsSyncing(false);
    }
  };

  // 메모 삭제
  const handleDeleteNote = async (id: string) => {
    const filtered = notes.filter((note) => note.id !== id);
    const reordered = filtered.map((n, idx) => ({ ...n, order: idx + 1 }));
    setNotes(reordered);

    if (editingId === id) setEditingId(null);

    if (isSheetConnected) {
      setIsSyncing(true);
      const res = await deleteNoteFromSheet(id);
      if (!res.success) {
        showError("구글 시트에서 메모를 삭제하지 못했습니다.");
      }
      setIsSyncing(false);
    }
  };

  // 편집 시작 & 저장
  const handleStartEdit = (note: Note) => {
    setEditingId(note.id);
    setEditText(note.content);
    setEditCategory(note.category);
    setTopZId(note.id);
  };

  const handleSaveEdit = async (id: string) => {
    if (!editText.trim()) return;

    setNotes((prev) =>
      prev.map((note) =>
        note.id === id
          ? { ...note, content: editText.trim(), category: editCategory }
          : note
      )
    );
    setEditingId(null);

    if (isSheetConnected) {
      setIsSyncing(true);
      const res = await updateNoteInSheet(id, {
        content: editText.trim(),
        category: editCategory,
      });
      if (!res.success) {
        showError("수정된 메모를 시트에 반영하지 못했습니다.");
      }
      setIsSyncing(false);
    }
  };

  const handleCancelEdit = () => {
    setEditingId(null);
  };

  // ---------------- 드래그 앤 드롭 (화면 밖 이탈 방지 & 자유 배치) ----------------
  const draggingStateRef = useRef<{
    id: string;
    cardWidth: number;
    cardHeight: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);

  const handlePointerDown = (id: string, e: React.PointerEvent<HTMLDivElement>) => {
    if (editingId === id || !boardRef.current) return;
    const target = e.target as HTMLElement;
    if (target.closest("button") || target.closest("textarea") || target.closest("input")) return;

    const board = boardRef.current;
    const boardRect = board.getBoundingClientRect();
    const cardRect = e.currentTarget.getBoundingClientRect();

    draggingStateRef.current = {
      id,
      cardWidth: cardRect.width,
      cardHeight: cardRect.height,
      offsetX: e.clientX - cardRect.left,
      offsetY: e.clientY - cardRect.top,
    };

    setActiveDragId(id);
    setTopZId(id);

    const onPointerMove = (moveEvent: PointerEvent) => {
      const state = draggingStateRef.current;
      if (!state || !boardRef.current) return;

      const currentBoard = boardRef.current;
      const bRect = currentBoard.getBoundingClientRect();

      let newX = moveEvent.clientX - bRect.left - state.offsetX;
      let newY = moveEvent.clientY - bRect.top - state.offsetY;

      const minX = 12;
      const minY = 16;
      const maxX = Math.max(minX, currentBoard.clientWidth - state.cardWidth - 14);
      const maxY = Math.max(minY, currentBoard.clientHeight - state.cardHeight - 16);

      newX = Math.max(minX, Math.min(newX, maxX));
      newY = Math.max(minY, Math.min(newY, maxY));

      setNotes((prev) =>
        prev.map((n) => (n.id === state.id ? { ...n, x: newX, y: newY, isNew: false } : n))
      );
    };

    const onPointerUp = async () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);

      draggingStateRef.current = null;
      setActiveDragId(null);

      if (isSheetConnected) {
        const orderPayload = notes.map((n, idx) => ({ id: n.id, order: idx + 1 }));
        await reorderNotesInSheet(orderPayload);
      }
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
  };


  const displayedNotes =
    filterCategory === "전체"
      ? notes
      : notes.filter((note) => note.category === filterCategory);

  // 캔버스 최소 높이 계산 (메모들이 충분히 배치되도록 자동 확장)
  const maxCardY = Math.max(
    550,
    ...displayedNotes.map((n) => (n.y || 0) + 260)
  );

  if (!mounted) {
    return (
      <div className="min-h-screen bg-[#faf8f5] dark:bg-zinc-950 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#fcf9f2] dark:bg-zinc-950 text-zinc-800 dark:text-zinc-100 transition-colors duration-300 flex flex-col overflow-x-hidden">
      {/* 알림 토스트 메시지 */}
      {errorMessage && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2.5 bg-red-500 text-white text-xs font-semibold rounded-xl shadow-lg animate-bounce">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* 헤더 & 상단 바 */}
      <header className="sticky top-0 z-40 bg-[#fcf9f2]/90 dark:bg-zinc-950/90 backdrop-blur-md border-b border-amber-200/50 dark:border-zinc-800 px-4 sm:px-8 py-3.5 flex items-center justify-between shadow-xs">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-amber-200 dark:bg-amber-900/50 text-amber-900 dark:text-amber-200 rounded-xl shadow-xs">
            <Pin className="w-5 h-5 -rotate-45" />
          </div>
          <h1 className="text-xl sm:text-2xl font-black tracking-tight text-amber-900 dark:text-amber-100 flex items-center gap-2">
            Post-it Todo List
          </h1>
        </div>

        <div className="flex items-center gap-2.5">
          {isSyncing && (
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border border-amber-200/60 dark:border-zinc-800 bg-white/70 dark:bg-zinc-900/70 text-amber-600 dark:text-amber-400">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span className="hidden sm:inline">동기화 중...</span>
            </div>
          )}

          <button
            onClick={toggleDarkMode}
            className="flex items-center gap-2 px-3.5 py-1.5 text-sm font-medium rounded-full border border-amber-200 dark:border-zinc-700 bg-white/80 dark:bg-zinc-900/80 shadow-xs hover:bg-amber-50 dark:hover:bg-zinc-800 transition-all cursor-pointer"
            title={isDarkMode ? "라이트 모드로 전환" : "다크 모드로 전환"}
          >
            {isDarkMode ? (
              <>
                <Sun className="w-4 h-4 text-amber-400" />
                <span className="hidden sm:inline text-xs">라이트 모드</span>
              </>
            ) : (
              <>
                <Moon className="w-4 h-4 text-zinc-600" />
                <span className="hidden sm:inline text-xs">다크 모드</span>
              </>
            )}
          </button>
        </div>
      </header>

      {/* 중앙 메인 컨텐츠 영역 */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 flex flex-col gap-6">
        {/* 가운데 메모 입력 섹션 */}
        <section className="flex flex-col items-center justify-center">
          <form
            onSubmit={handleAddNote}
            className="w-full max-w-xl bg-white dark:bg-zinc-900 rounded-2xl shadow-md border border-amber-200/60 dark:border-zinc-800 p-4 sm:p-5 flex flex-col gap-3 transition-shadow hover:shadow-lg relative overflow-hidden"
          >
            <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-yellow-300 via-pink-300 to-emerald-300" />

            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="note-input"
                className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5"
              >
                <Pin className="w-3.5 h-3.5 text-amber-500" /> 새로운 포스트잇 작성
              </label>
              <textarea
                id="note-input"
                rows={3}
                placeholder="오늘 할 일이나 떠오른 아이디어를 기록해 보세요... (Ctrl+Enter 로 즉시 등록)"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                className="w-full resize-none rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50/50 dark:bg-zinc-800/50 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 dark:focus:ring-amber-500 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    handleAddNote(e);
                  }
                }}
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <div className="inline-flex rounded-lg bg-zinc-100 dark:bg-zinc-800 p-1 text-xs">
                {CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-3.5 py-1.5 rounded-md font-medium transition-all cursor-pointer ${
                      selectedCategory === cat
                        ? "bg-amber-500 text-white shadow-xs"
                        : "text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white"
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              <button
                type="submit"
                disabled={!inputText.trim()}
                className="flex items-center gap-1.5 px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-xs sm:text-sm rounded-xl transition-all shadow-xs active:scale-95 cursor-pointer ml-auto"
              >
                <Plus className="w-4 h-4" />
                <span>붙이기</span>
              </button>
            </div>
          </form>
        </section>

        {/* 필터링 드롭다운 & 헤더 라인 */}
        <div className="flex items-center justify-between gap-3 border-b border-amber-200/40 dark:border-zinc-800 pb-3">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full bg-amber-100 dark:bg-zinc-800 text-amber-800 dark:text-amber-300 text-xs font-bold shadow-2xs">
              {displayedNotes.length}개
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-zinc-400" />
            <select
              id="filter-dropdown"
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value as FilterCategory)}
              className="px-3 py-1.5 text-xs font-semibold rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 shadow-xs focus:outline-none focus:ring-2 focus:ring-amber-400 cursor-pointer"
            >
              {FILTER_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat === "전체" ? "전체 보기" : cat}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* 메모가 없을 때 안내 */}
        {displayedNotes.length === 0 && (
          <div className="py-20 text-center flex flex-col items-center justify-center gap-3 text-zinc-400 dark:text-zinc-600">
            <Pin className="w-12 h-12 stroke-[1.5] text-zinc-300 dark:text-zinc-700 animate-bounce" />
            <p className="text-base font-medium">
              {filterCategory === "전체"
                ? "등록된 포스트잇이 없습니다. 상단에서 첫 메모를 붙여보세요!"
                : `'${filterCategory}' 범주에 등록된 포스트잇이 없습니다.`}
            </p>
          </div>
        )}

        {/* 📌 자유 드래그 앤 드롭 캔버스 보드 영역 (어디든지 배치 & 겹침 가능 & 화면 밖 이탈 방지) */}
        <div
          ref={boardRef}
          style={{ minHeight: `${maxCardY}px` }}
          className="relative w-full rounded-3xl border-2 border-dashed border-amber-200/60 dark:border-zinc-800 bg-white/40 dark:bg-zinc-900/30 p-2 sm:p-4 overflow-hidden transition-all duration-300"
        >
          {displayedNotes.map((note) => {
            const colorScheme = COLOR_CLASSES[note.color];
            const isEditing = editingId === note.id;
            const isCompleted = note.state === "completed";
            const isDragging = activeDragId === note.id;
            const isTopZ = topZId === note.id || isDragging;

            return (
              <div
                key={note.id}
                onPointerDown={(e) => handlePointerDown(note.id, e)}
                style={{
                  transform: `translate3d(${note.x}px, ${note.y}px, 0)`,
                  zIndex: isDragging ? 50 : isTopZ ? 40 : 10,
                }}
                className={`absolute top-0 left-0 rounded-2xl border flex flex-col justify-between post-it-shadow select-none touch-none transition-shadow ${
                  /* 모바일 환경에서만 메모 크기를 적절히 축소 (모바일: w-[240px] min-h-[190px] p-3.5, PC: w-[280px] min-h-[230px] p-5) */
                  "w-[240px] sm:w-[280px] min-h-[190px] sm:min-h-[230px] p-3.5 sm:p-5"
                } ${
                  !isEditing ? "cursor-grab active:cursor-grabbing" : ""
                } ${colorScheme.bg} ${colorScheme.border} ${
                  note.isNew ? "animate-post-it" : ""
                } ${
                  isDragging
                    ? "shadow-2xl ring-2 ring-amber-400 scale-[1.03] opacity-95"
                    : "hover:shadow-lg"
                } ${isCompleted ? "opacity-75" : "opacity-100"}`}
              >
                {/* 상단 테이프 효과 */}
                <div
                  className={`absolute -top-2.5 left-1/2 -translate-x-1/2 w-14 sm:w-16 h-4 sm:h-5 rounded-sm backdrop-blur-xs border shadow-2xs opacity-80 pointer-events-none ${colorScheme.tape}`}
                />

                {/* 카드 상단: 범주 뱃지, 제어 버튼들 */}
                <div className="flex items-center justify-between pb-2 sm:pb-3 border-b mb-2 sm:mb-3 border-black/10 dark:border-white/10">
                  <span
                    className={`text-[10px] sm:text-[11px] font-bold px-2 sm:px-2.5 py-0.5 rounded-full pointer-events-none ${colorScheme.badge}`}
                  >
                    {note.category}
                  </span>

                  {/* 제어 버튼 그룹 */}
                  <div
                    className="flex items-center gap-0.5 sm:gap-1 relative z-20 pointer-events-auto"
                    onPointerDown={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      onClick={() => handleToggleState(note)}
                      className={`p-1 sm:p-1.5 rounded-md transition-colors cursor-pointer ${
                        isCompleted
                          ? "text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/20"
                          : "text-zinc-500 dark:text-zinc-400 hover:bg-black/10 dark:hover:bg-white/10"
                      }`}
                      title={isCompleted ? "미완료 상태로 전환" : "완료 상태로 전환"}
                    >
                      {isCompleted ? (
                        <CheckCircle2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-600 dark:text-emerald-400" />
                      ) : (
                        <Circle className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      )}
                    </button>

                    {!isEditing ? (
                      <>
                        <button
                          type="button"
                          onClick={() => handleCycleColor(note)}
                          className="p-1 sm:p-1.5 rounded-md hover:bg-black/10 dark:hover:bg-white/10 text-zinc-700 dark:text-zinc-200 transition-colors cursor-pointer"
                          title="포스트잇 색상 변경"
                        >
                          <Palette className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleStartEdit(note)}
                          className="p-1 sm:p-1.5 rounded-md hover:bg-black/10 dark:hover:bg-white/10 text-zinc-700 dark:text-zinc-200 transition-colors cursor-pointer"
                          title="메모 편집"
                        >
                          <Edit3 className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteNote(note.id)}
                          className="p-1 sm:p-1.5 rounded-md hover:bg-red-500/20 text-red-600 dark:text-red-400 transition-colors cursor-pointer"
                          title="메모 즉시 삭제"
                        >
                          <Trash2 className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => handleSaveEdit(note.id)}
                          className="p-1 sm:p-1.5 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white transition-colors cursor-pointer"
                          title="저장"
                        >
                          <Check className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={handleCancelEdit}
                          className="p-1 sm:p-1.5 rounded-md hover:bg-black/10 dark:hover:bg-white/10 text-zinc-600 dark:text-zinc-300 transition-colors cursor-pointer"
                          title="취소"
                        >
                          <X className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* 카드 본문: 일반 보기 vs 편집 모드 */}
                <div className="flex-1 flex flex-col">
                  {isEditing ? (
                    <div
                      className="flex flex-col gap-2 flex-1"
                      onPointerDown={(e) => e.stopPropagation()}
                    >
                      <textarea
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        rows={3}
                        className="w-full text-xs sm:text-sm rounded-lg p-2 bg-white/70 dark:bg-black/30 border border-black/20 dark:border-white/20 focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none text-zinc-900 dark:text-zinc-100"
                        autoFocus
                      />
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-medium opacity-70">
                          범주:
                        </span>
                        <div className="inline-flex gap-1">
                          {CATEGORIES.map((c) => (
                            <button
                              key={c}
                              type="button"
                              onClick={() => setEditCategory(c)}
                              className={`text-[9px] sm:text-[10px] px-1.5 sm:px-2 py-0.5 rounded font-semibold transition-all cursor-pointer ${
                                editCategory === c
                                  ? "bg-amber-600 text-white"
                                  : "bg-black/10 dark:bg-white/10 hover:bg-black/20"
                              }`}
                            >
                              {c}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <p
                      className={`text-xs sm:text-sm font-medium whitespace-pre-wrap leading-relaxed break-words flex-1 pointer-events-none select-none ${
                        isCompleted
                          ? "line-through opacity-60 text-zinc-600 dark:text-zinc-400"
                          : ""
                      }`}
                    >
                      {note.content}
                    </p>
                  )}
                </div>

                {/* 카드 하단: 작성 일시 */}
                <div className="pt-2 sm:pt-4 mt-1 sm:mt-2 flex items-center justify-start border-t border-black/5 dark:border-white/5 pointer-events-none select-none">
                  <span className="text-[10px] sm:text-[11px] font-normal tracking-tight opacity-45">
                    {note.createdAt}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </main>

      {/* 푸터 */}
      <footer className="mt-auto py-6 border-t border-amber-200/30 dark:border-zinc-800/80 text-center text-xs text-zinc-500 dark:text-zinc-500 font-medium tracking-wide">
        Copyright INU Post-it Todo List by 윤병윤
      </footer>
    </div>
  );
}
