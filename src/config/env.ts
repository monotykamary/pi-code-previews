export function parsePositiveInteger(value: string | undefined): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : undefined;
}

export function positiveEnvInteger(name: string, fallback: number): number {
  return parsePositiveInteger(process.env[name]) ?? fallback;
}

export function parseBoolean(value: string | undefined): boolean | undefined {
  switch (value?.trim().toLowerCase()) {
    case "1":
    case "true":
    case "on":
    case "yes":
      return true;
    case "0":
    case "false":
    case "off":
    case "no":
      return false;
    default:
      return undefined;
  }
}

export function booleanEnv(name: string, fallback: boolean): boolean {
  return parseBoolean(process.env[name]) ?? fallback;
}
