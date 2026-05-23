// Live-layer client. Receives declarative patches from Supabase Realtime and applies them
// to the canvas via the validated applier.
//
// Subscribes (anon) to the public "tz:live" channel. Server inserts to live_patches fire a
// DB trigger that broadcasts via realtime.send(payload, "patch", "tz:live", false), so anon
// clients receive {type:"patch", seq, patch, id}. A future {type:"reset", deploy_id} message
// (M4 bake) tells the page to reload the new canonical.
import { createClient } from "@supabase/supabase-js";
import { applyPatch, resetLive } from "./patch-applier.js";

export function initLiveLayer(config = {}) {
  // Dedup by seq so the catch-up fetch and an in-flight Realtime broadcast can't apply the
  // same patch twice (add_element would otherwise duplicate). Cleared on reset/reload.
  const seen = new Set();
  function applyOnce(seq, patch) {
    if (seq != null && seen.has(seq)) return;
    if (seq != null) seen.add(seq);
    applyPatch(patch);
  }

  const api = {
    apply: (patch) => applyPatch(patch),
    reset: () => resetLive(),
    config,
  };

  // Exposed for tests + the fake-patch skeleton. Harmless: apply only does what a validated
  // declarative patch permits, and never touches the widget.
  window.__tz = Object.assign(window.__tz || {}, api);

  if (!config.supabaseUrl || !config.supabaseAnonKey) {
    // No Realtime config — manual apply hook still works (used by tests and dev).
    return api;
  }

  const supabase = createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: { persistSession: false },
    realtime: { params: { eventsPerSecond: 5 } },
  });

  const topic = config.realtimeChannel || "tz:live";
  const channel = supabase.channel(topic, {
    config: { broadcast: { self: true }, private: false },
  });

  channel
    .on("broadcast", { event: "patch" }, ({ payload }) => {
      // payload is the jsonb passed to realtime.send(): { type, seq, patch, id }
      if (payload && payload.patch) applyOnce(payload.seq, payload.patch);
    })
    .on("broadcast", { event: "reset" }, () => {
      // M4: a bake just deployed. Reload so the page picks up the new canonical and drops
      // any ephemeral patches that are now baked in.
      location.reload();
    })
    .subscribe();

  // Catch-up: replay every un-baked live patch in order. This is what makes a refresh keep
  // the live state — without it, a browser only sees patches that arrive AFTER subscribe().
  (async () => {
    try {
      const { data, error } = await supabase
        .from("live_patches")
        .select("seq, patch")
        .eq("status", "live")
        .order("seq", { ascending: true })
        .limit(200);
      if (error) return;
      for (const row of data ?? []) applyOnce(row.seq, row.patch);
    } catch {
      /* catch-up is best-effort; the page is still usable without it */
    }
  })();

  api.supabase = supabase;
  api.channel = channel;
  return api;
}
