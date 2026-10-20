/*
 * ─────────────────────────────────────────────
 * 로그인 폼 (클라이언트 컴포넌트)
 * ─────────────────────────────────────────────
 * 실행 순서:
 *   ① 사용자가 이메일·비밀번호 입력 후 제출
 *   ② useActionState 가 서버 액션 login() 호출, 그동안 pending = true
 *   ③ 실패 → state.error 로 메시지 표시 / 성공 → 서버에서 /admin 으로 redirect
 */
"use client";

import { useActionState } from "react";
import { login, type LoginState } from "../../actions";

export default function LoginForm() {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(login, {}); // ②

  return (
    <form
      action={formAction} // ①
      className="space-y-4 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm"
    >
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium">이메일</span>
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          className="input"
          placeholder="admin@example.com"
        />
      </label>

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium">비밀번호</span>
        <input
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className="input"
        />
      </label>

      {/* ③ 에러 메시지 */}
      {state.error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>
      )}

      <button type="submit" disabled={pending} className="btn-primary w-full">
        {pending ? "로그인 중…" : "로그인"}
      </button>
    </form>
  );
}
