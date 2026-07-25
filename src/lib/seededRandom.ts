export function getSeededRandom(seed: number) {
  let m = 0x80000000;
  let a = 1103515245;
  let c = 12345;
  let state = seed ? seed : Math.floor(Math.random() * (m - 1));

  return function() {
    state = (a * state + c) % m;
    return state / (m - 1);
  }
}

// Converts a string to a hash number
export function hashString(str: string) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return hash;
}
