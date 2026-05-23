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
      if (payload && payload.patch) applyPatch(payload.patch);
    })
    .on("broadcast", { event: "reset" }, () => {
      // M4 will fire this after a successful bake deploy so browsers reload the new canonical
      // and drop their now-baked ephemeral patches.
      location.reload();
    })
    .subscribe();

  api.supabase = supabase;
  api.channel = channel;
  return api;
}
