/** Wait only before an order; never discard a sample or alter running work. */
export async function quietStart({limit, attempts = 1, retryDelayMs = 0, sample, record, wait}) {
  if (limit !== undefined && (!Number.isFinite(limit) || limit < 0 || limit > 1)) throw new RangeError('Invalid CPU limit');
  if (!Number.isSafeInteger(attempts) || attempts < 1 || attempts > 3) throw new RangeError('Invalid attempt bound');
  if (!Number.isSafeInteger(retryDelayMs) || retryDelayMs < 0 || retryDelayMs > 15000) throw new RangeError('Invalid wait bound');
  for (let attempt = 0; attempt < attempts; attempt++) {
    const observation = await sample();
    await record(observation, attempt);
    if (observation.samples.length !== 3 || observation.samples.some(value =>
      !Number.isFinite(value.meanBusyFraction) || value.meanBusyFraction < 0 || value.meanBusyFraction > 1))
      throw new Error('Invalid CPU observation');
    if (limit === undefined || observation.samples.every(value => value.meanBusyFraction <= limit)) return;
    if (attempt + 1 < attempts) await wait(retryDelayMs);
  }
  throw Object.assign(new Error('Ambient CPU exceeded the predeclared limit; this order was not started'), {code: 'ENVIRONMENT_BUSY'});
}
