/*
 * 사이트 첫 화면 — 공개 페이지는 아직 없으므로 관리자 페이지로 보낸다.
 * (나중에 공개 현장 목록 페이지를 여기에 만들면 됨)
 */
import { redirect } from "next/navigation";

export default function Home() {
  redirect("/admin");
}
