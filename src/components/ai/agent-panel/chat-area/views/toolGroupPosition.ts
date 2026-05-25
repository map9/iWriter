export function toolGroupPosition(
  prevIsTool: boolean,
  nextIsTool: boolean,
): 'single' | 'start' | 'middle' | 'end' {
  if (prevIsTool && nextIsTool) return 'middle'
  if (prevIsTool) return 'end'
  if (nextIsTool) return 'start'
  return 'single'
}
