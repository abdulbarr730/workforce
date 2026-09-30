import { execFile } from "child_process";

export type DeviceLocation = {
  latitude: number | null;
  longitude: number | null;
  accuracyMeters: number | null;
  wifiName: string | null;
  error?: string;
};

const run = (file: string, args: string[], timeoutMs: number) =>
  new Promise<string>((resolve) => {
    execFile(
      file,
      args,
      { timeout: timeoutMs, windowsHide: true, maxBuffer: 256 * 1024 },
      (_error, stdout) => resolve(String(stdout || "")),
    );
  });

/** Connected Wi-Fi name (SSID), or null. */
async function readWifiName(): Promise<string | null> {
  if (process.platform === "win32") {
    const out = await run("netsh", ["wlan", "show", "interfaces"], 8_000);
    const line = out
      .split(/\r?\n/)
      .find((l) => /^\s*SSID\s*:/.test(l) && !/BSSID/.test(l));
    const ssid = line ? line.split(":").slice(1).join(":").trim() : "";
    return ssid || null;
  }
  if (process.platform === "darwin") {
    for (const device of ["en0", "en1"]) {
      const out = await run("networksetup", ["-getairportnetwork", device], 6_000);
      const match = out.match(/Current Wi-Fi Network:\s*(.+)/);
      if (match && match[1].trim()) return match[1].trim();
    }
    // Newer macOS: ipconfig reports the SSID (may be hidden without permission).
    const summary = await run("ipconfig", ["getsummary", "en0"], 6_000);
    const ssid = summary.match(/\bSSID\s*:\s*(.+)/)?.[1]?.trim();
    return ssid && !/redacted/i.test(ssid) ? ssid : null;
  }
  return null;
}

/**
 * Windows location service (Wi-Fi positioning / GPS). Needs Location turned
 * on in Windows settings for desktop apps; returns nulls otherwise.
 */
async function readWindowsCoordinates() {
  const script = [
    "Add-Type -AssemblyName System.Device;",
    "$w = New-Object System.Device.Location.GeoCoordinateWatcher('High');",
    "$w.Start();",
    "$t = 0;",
    "while (($w.Status -ne 'Ready') -and ($w.Permission -ne 'Denied') -and ($t -lt 120)) { Start-Sleep -Milliseconds 100; $t++ };",
    "$c = $w.Position.Location;",
    "if ($w.Permission -eq 'Denied') { 'DENIED' }",
    "elseif ($c.IsUnknown) { 'UNKNOWN' }",
    "else { '{0},{1},{2}' -f $c.Latitude, $c.Longitude, $c.HorizontalAccuracy };",
    "$w.Stop();",
  ].join(" ");
  const out = (
    await run(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script],
      20_000,
    )
  ).trim();
  if (out === "DENIED") return { error: "Location is turned off for apps in Windows settings." };
  const parts = out.split(",").map((v) => Number(v.trim()));
  if (parts.length >= 2 && parts.every((v) => Number.isFinite(v)) && !(parts[0] === 0 && parts[1] === 0)) {
    return {
      latitude: parts[0],
      longitude: parts[1],
      accuracyMeters: Number.isFinite(parts[2]) ? Math.round(parts[2]) : null,
    };
  }
  return { error: "Windows could not find this laptop's location." };
}

/** Everything the agent can tell about where the laptop is. */
export async function readDeviceLocation(): Promise<DeviceLocation> {
  const [wifiName, coords] = await Promise.all([
    readWifiName().catch(() => null),
    process.platform === "win32"
      ? readWindowsCoordinates().catch(() => ({ error: "Location unavailable." }))
      : Promise.resolve({ error: undefined as string | undefined }),
  ]);
  const c: any = coords || {};
  return {
    latitude: typeof c.latitude === "number" ? c.latitude : null,
    longitude: typeof c.longitude === "number" ? c.longitude : null,
    accuracyMeters: typeof c.accuracyMeters === "number" ? c.accuracyMeters : null,
    wifiName,
    error: c.error,
  };
}
