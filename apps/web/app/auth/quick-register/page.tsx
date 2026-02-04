"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useState, Suspense } from "react";

function QuickRegisterContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const uid = searchParams?.get("uid") ?? "";
  const returnTo = searchParams?.get("returnTo") ?? "";

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // 台灣手機格式範例: 0912345678
    const phoneRegex = /^09\d{8}$/;
    if (!phoneRegex.test(phone)) {
      alert("請輸入正確的台灣手機格式 (例如: 0912345678)");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch("/api/gas-save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid: uid, name: name, phone: phone, apiEvent: "addMember" }),
      });

      if (response.ok) {
        if (returnTo) {
          window.location.href = decodeURIComponent(returnTo);
        } else {
          router.push("/");
        }
      } else {
        alert("存檔失敗，請稍後再試。");
      }
    } catch (error) {
      console.error("Save failed:", error);
      alert("發生錯誤。");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-8 shadow-2xl">
        <h1 className="mb-6 text-2xl font-bold text-gray-900 text-center">使用者註冊</h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700">
              姓名
            </label>
            <input
              type="text"
              id="name"
              required
              value={name}
              placeholder="請輸入您的真實姓名"
              onChange={(e) => setName(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-black focus:outline-none focus:ring-1 focus:ring-black"
            />
            <p className="mt-1 text-xs text-gray-500">預約時將顯示此姓名</p>
          </div>
          <div>
            <label htmlFor="phone" className="block text-sm font-medium text-gray-700">
              電話
            </label>
            <input
              type="tel"
              id="phone"
              required
              value={phone}
              placeholder="ex: 0912345678"
              onChange={(e) => setPhone(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-black focus:outline-none focus:ring-1 focus:ring-black"
            />
            <p className="mt-1 text-xs text-gray-500">僅支援台灣手機格式 (10 位數字)</p>
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-black hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-black disabled:opacity-50 transition-all duration-200"
          >
            {loading ? "處理中..." : "確定註冊"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function QuickRegisterPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center">載入中...</div>}>
      <QuickRegisterContent />
    </Suspense>
  );
}
