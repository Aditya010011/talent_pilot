// Polyfill File for environments where it is not defined at build-time (e.g. Node < 20)
if (typeof globalThis.File === "undefined") {
  (globalThis as any).File = class File {};
}
