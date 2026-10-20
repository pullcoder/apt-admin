/*
 * ─────────────────────────────────────────────
 * PDF → 페이지 이미지 변환 (브라우저 전용)
 * ─────────────────────────────────────────────
 * 모바일·카카오톡 인앱 브라우저는 PDF를 제대로 못 보여주는 경우가 많아서,
 * 업로드할 때 페이지마다 JPG로 그려 두고 공개 페이지에서는 이미지로 보여준다.
 *
 * 실행 순서:
 *   ① pdf.js 를 필요할 때만 불러옴 (용량이 커서 첫 화면 로딩에 포함하지 않음)
 *   ② PDF 열기
 *   ③ 페이지마다 가로 PAGE_WIDTH px 캔버스에 그림 → JPG Blob 으로 변환
 */

const PAGE_WIDTH = 1600; // 변환 이미지 가로 크기 (휴대폰 확대해도 글자가 읽히는 정도)
const JPEG_QUALITY = 0.85;

export async function pdfToImages(
  file: File,
  onProgress?: (done: number, total: number) => void,
): Promise<Blob[]> {
  // ①
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();

  // ②
  const task = pdfjs.getDocument({ data: await file.arrayBuffer() });
  const doc = await task.promise;
  const pages: Blob[] = [];

  try {
    // ③ 한 장씩 (동시에 그리면 큰 PDF에서 메모리가 부족해짐)
    for (let i = 1; i <= doc.numPages; i++) {
      onProgress?.(i, doc.numPages);
      const page = await doc.getPage(i);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: PAGE_WIDTH / base.width });

      const canvas = document.createElement("canvas");
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#fff"; // 투명 배경이 JPG에서 검게 나오지 않도록
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      await page.render({ canvas, canvasContext: ctx, viewport }).promise;
      pages.push(
        await new Promise<Blob>((resolve, reject) =>
          canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("이미지 변환 실패"))), "image/jpeg", JPEG_QUALITY),
        ),
      );
      page.cleanup();
    }
  } finally {
    await task.destroy(); // 워커·메모리 정리
  }

  return pages;
}
