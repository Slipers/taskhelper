let ctx: AudioContext | null = null;

/**
 * Sons synthétisés à la volée (aucun fichier audio à embarquer) : un « pop »
 * discret quand on coche, un carillon à la fin d'une session de focus.
 */
export function playSound(kind: 'done' | 'chime') {
  try {
    ctx ??= new AudioContext();
    const now = ctx.currentTime;
    const notes =
      kind === 'done'
        ? [
            [880, 0],
            [1320, 0.07],
          ]
        : [
            [660, 0],
            [880, 0.18],
            [1100, 0.36],
          ];
    for (const [freq, at] of notes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq!;
      const start = now + at!;
      const length = kind === 'done' ? 0.16 : 0.7;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(kind === 'done' ? 0.07 : 0.12, start + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + length + 0.05);
    }
  } catch {
    /* pas de sortie audio : tant pis */
  }
}
