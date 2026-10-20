/** First-party bridge to the independent package. No renderer, scene, save or global clock crosses it. */
export {
  canPayCast, payCast, castDuration, advanceCastProgress, advanceCooldown,
  replaceStrongerDot, advanceDotFrame, HOLLOW_WAKE_ADAPTER_VERSION,
} from '@hollow-wake/engine/hollow-wake';
