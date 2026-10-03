import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const POWERSHELL = path.join(
  process.env.SystemRoot ?? 'C:\\Windows',
  'System32',
  'WindowsPowerShell',
  'v1.0',
  'powershell.exe',
);

export interface FocusGuardEvents {
  onBlocked: (name: string, title: string) => void;
  onError: (message: string) => void;
}

/**
 * Pilote le processus de garde (electron/focus-guard.cs) qui réduit les
 * applications non autorisées pendant la concentration.
 *
 * Pas de module natif : le C# est compilé à la volée par Windows PowerShell,
 * présent sur tout Windows 10/11. Le processus vit le temps d'une séance de
 * focus ; s'il perd son lien avec TaskHelper (fermeture, plantage), il
 * restaure les fenêtres réduites et s'arrête de lui-même.
 */
export class FocusGuard {
  private proc: ChildProcessWithoutNullStreams | null = null;
  private stderr = '';
  private active = false;

  constructor(
    private csPath: string,
    private self: { pid: number; name: string },
    private events: FocusGuardEvents,
  ) {}

  get supported() {
    return process.platform === 'win32';
  }

  private ensure(): ChildProcessWithoutNullStreams | null {
    if (!this.supported) return null;
    if (this.proc) return this.proc;
    // La source vit dans l'archive asar, illisible pour PowerShell : on la
    // recopie en clair dans le dossier temporaire, puis Add-Type la compile.
    // Un simple -Command suffit : aucune politique d'exécution n'est contournée
    // (elle ne concerne que les fichiers .ps1).
    const csFile = path.join(os.tmpdir(), 'taskhelper-focus-guard.cs');
    const quote = (s: string) => `'${s.replace(/'/g, "''")}'`;
    const script = [
      "$ErrorActionPreference = 'Stop'",
      'try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}',
      'try { [Console]::InputEncoding = [System.Text.Encoding]::UTF8 } catch {}',
      `Add-Type -Path ${quote(csFile)}`,
      `[FocusGuard]::Run(${this.self.pid}, ${quote(this.self.name)})`,
    ].join('; ');
    let proc: ChildProcessWithoutNullStreams;
    try {
      writeFileSync(csFile, readFileSync(this.csPath, 'utf8'), 'utf8');
      proc = spawn(POWERSHELL, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script], {
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch (err) {
      this.events.onError(err instanceof Error ? err.message : String(err));
      return null;
    }
    this.proc = proc;
    this.stderr = '';

    let pending = '';
    proc.stdout.setEncoding('utf8');
    proc.stdout.on('data', (chunk: string) => {
      pending += chunk;
      let nl: number;
      while ((nl = pending.indexOf('\n')) >= 0) {
        const line = pending.slice(0, nl).replace(/\r$/, '');
        pending = pending.slice(nl + 1);
        this.handleLine(line);
      }
    });
    proc.stderr.setEncoding('utf8');
    proc.stderr.on('data', (chunk: string) => {
      this.stderr += chunk;
    });
    proc.on('exit', (code) => {
      if (this.proc === proc) this.proc = null;
      if (code !== 0 && this.stderr.trim()) this.events.onError(this.stderr.trim().split(/\r?\n/)[0]!);
    });
    proc.on('error', (err) => this.events.onError(err.message));
    // Un tube cassé à la fermeture ne doit pas faire planter le processus principal.
    proc.stdin.on('error', () => {});
    return proc;
  }

  private handleLine(line: string) {
    const [kind, a = '', b = ''] = line.split('\t');
    if (kind === 'blocked') this.events.onBlocked(a, b);
  }

  private send(...lines: string[]) {
    const proc = this.ensure();
    proc?.stdin.write(lines.map((l) => `${l}\n`).join(''));
  }

  /** Active ou suspend le blocage. `selfHwnd` : fenêtre à ramener devant. */
  update(active: boolean, allowed: string[], selfHwnd: string | null) {
    if (!this.supported) return;
    this.active = active;
    if (!active && !this.proc) return;
    const cmds = [`allow ${allowed.join('|')}`];
    if (selfHwnd) cmds.unshift(`self ${selfHwnd}`);
    cmds.push(active ? 'on' : 'off');
    this.send(...cmds);
  }

  /**
   * Fin de séance : rouvre les fenêtres réduites et arrête le processus. Il est
   * détaché aussitôt, pour qu'une nouvelle séance reparte sur un processus neuf
   * sans attendre que celui-ci ait fini de restaurer.
   */
  end() {
    this.active = false;
    const proc = this.proc;
    if (!proc) return;
    this.proc = null;
    proc.stdin.end('quit\n');
  }

  dispose() {
    this.end();
  }
}
