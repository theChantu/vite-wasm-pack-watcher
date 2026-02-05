import { ChildProcess, spawn } from "child_process";
import path from "path";
import type { PluginOption, WebSocketServer } from "vite";

let ws: WebSocketServer | null = null;

const debounce = <Args extends unknown[]>(
  fn: (...args: Args) => void,
  delay: number,
) => {
  let timer: NodeJS.Timeout | null = null;

  return (...args: Args) => {
    if (timer) {
      clearTimeout(timer);
    }

    timer = setTimeout(() => {
      fn(...args);
    }, delay);
  };
};

const builder = (cwd: string) => {
  let buildProcess: ChildProcess | null = null;

  return (buildCommand?: string) => {
    if (buildProcess) {
      buildProcess.kill();
    }

    const parts = buildCommand?.split(" ");
    const command = parts?.[0] ?? "wasm-pack";
    const args = parts?.slice(1) ?? ["build", "--dev"];

    buildProcess = spawn(command, args, { cwd });
    if (!buildProcess.stdout || !buildProcess.stderr) return;

    buildProcess.stdout.on("data", (data) => {
      console.log(data.toString());
    });
    buildProcess.stderr.on("data", (data) => {
      console.error(data.toString());
    });
    buildProcess.on("close", (code) => {
      if (code === 0 && ws) {
        ws.send({ type: "full-reload", path: "*" });
      }
    });
  };
};

export default function wasmPackWatchPlugin(options?: {
  buildCommand?: string;
  cwd?: string;
}): PluginOption {
  const cwd = path.resolve(process.cwd(), options?.cwd ?? ".");
  const buildWithWasmPack = debounce(builder(cwd), 100);

  return {
    name: "wasm-pack-watch",
    watchChange(id) {
      if (
        id.endsWith(".rs") ||
        id.endsWith("Cargo.toml") ||
        id.includes("Cargo.lock")
      ) {
        buildWithWasmPack(options?.buildCommand);
      }
    },
    configureServer(server) {
      ws = server.ws;

      server.watcher.add([
        path.join(cwd, "src/**"),
        path.join(cwd, "Cargo.toml"),
        path.join(cwd, "Cargo.lock"),
      ]);
    },
  };
}
