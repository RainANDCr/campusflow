/** 触发浏览器下载（Web / Tauri WebView 通用）。Capacitor 的文件写出在打包阶段接入 ShareAdapter。 */
export function downloadBlob(fileName: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function downloadText(fileName: string, text: string, mime: string): void {
  downloadBlob(fileName, new Blob([text], { type: `${mime};charset=utf-8` }));
}
