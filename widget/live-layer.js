// Live-layer client. Receives declarative patches and applies them to the canvas.
//
// M2 (now): exposes a manual apply/reset hook used by tests and the "fake patch" skeleton.
// M3: if a Supabase config is present, subscribe to the public Realtime channel "tz:live"
//     and apply each broadcast patch; on a {type:'reset'} message, reload the canonical page.
import { applyPatch, resetLive } from "./patch-applier.js";

export function initLiveLayer(config = {}) {
  const api = {
    apply: (patch) => applyPatch(patch),
    reset: () => resetLive(),
    config,
  };

  // Exposed for tests and fake-patch driving. Harmless: apply only does what a validated,
  // declarative patch permits, and never touches the widget.
  window.__tz = Object.assign(window.__tz || {}, api);

  // M3 hook (inert until wired):
  // if (config.supabaseUrl && config.supabaseAnonKey) subscribeRealtime(config, api);

  return api;
}
