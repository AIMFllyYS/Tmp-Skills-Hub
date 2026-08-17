import { spawn } from "node:child_process";

/**
 * 用 argv 拉起独立进程。Windows 上 detached 子进程自带新控制台
 * (Node child_process 文档: options.detached)。不拼 shell 字符串。
 * Unix 上同一选项只脱离会话,不另开终端窗口——那是 Node 文档行为,不是猜测。
 */
export function openConsole(argv: string[]): void {
  if (argv.length === 0) return;
  const child = spawn(argv[0]!, argv.slice(1), {
    detached: true,
    stdio: "ignore",
    windowsHide: false,
  });
  child.unref();
}

/** 打开默认浏览器。Windows 用 cmd start;macOS open;其它 xdg-open。失败静默。 */
export function openBrowser(url: string): void {
  try {
    const child =
      process.platform === "win32"
        ? spawn("cmd", ["/c", "start", "", url], { stdio: "ignore", detached: true })
        : process.platform === "darwin"
          ? spawn("open", [url], { stdio: "ignore", detached: true })
          : spawn("xdg-open", [url], { stdio: "ignore", detached: true });
    child.on("error", () => undefined);
    child.unref();
  } catch {
    // 打不开浏览器不影响命令本身
  }
}
