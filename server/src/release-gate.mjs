export function publicReleaseAllowed(env = process.env) {
  return env.VERCEL_ENV !== 'production' || env.TARO_V5_PUBLIC_RELEASE_CONFIRMED === 'true';
}
