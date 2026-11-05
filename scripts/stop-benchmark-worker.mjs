/** Close an owned IPC worker, then enforce termination if its disconnect
 * handler cannot finish. Benchmark output uses file descriptors. Completion follows process exit. */
export function stopBenchmarkWorker(child, graceMs = 2000) {
  if (!Number.isFinite(graceMs) || graceMs < 1) throw new Error('Invalid worker shutdown grace period');
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve({forced: false});
  }
  return new Promise(resolve => {
    let forced = false;
    const timer = setTimeout(() => {
      forced = true;
      child.kill('SIGKILL');
    }, graceMs);
    child.once('exit', () => {
      clearTimeout(timer);
      resolve({forced});
    });
    if (child.connected) child.disconnect();
  });
}
