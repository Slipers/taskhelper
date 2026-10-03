// Garde du mode concentration : tant qu'il est actif, toute fenêtre d'une
// application non autorisée est réduite dès qu'elle passe au premier plan
// (ou qu'elle est visible à l'écran), et TaskHelper revient devant.
//
// Compilé à la volée par PowerShell (Add-Type), donc en C# 5 : pas
// d'interpolation de chaînes ni de `out var`.
//
// Protocole — une commande par ligne sur stdin :
//   self <hwnd>      fenêtre de TaskHelper, à ramener devant après un blocage
//   allow a|b|c      noms de processus autorisés (sans .exe)
//   on / off         active / suspend le blocage
//   scan             liste ce qui serait bloqué, sans rien toucher
//   restore          rouvre les fenêtres réduites par la garde
//   quit             restaure puis quitte
// Et sur stdout : ready, blocked<TAB>nom<TAB>titre, candidate<TAB>…, scan-end, restored<TAB>n.
// Fin de stdin (TaskHelper fermé ou planté) : on restaure et on quitte.

using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

public static class FocusGuard
{
    delegate bool EnumProc(IntPtr hWnd, IntPtr lParam);

    [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
    [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr hWnd, int cmd);
    [DllImport("user32.dll")] static extern bool IsWindow(IntPtr hWnd);
    [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr hWnd);
    [DllImport("user32.dll")] static extern bool IsIconic(IntPtr hWnd);
    [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc cb, IntPtr lParam);
    [DllImport("user32.dll")] static extern bool EnumChildWindows(IntPtr parent, EnumProc cb, IntPtr lParam);
    [DllImport("user32.dll")] static extern IntPtr GetWindow(IntPtr hWnd, uint cmd);
    [DllImport("user32.dll")] static extern IntPtr GetAncestor(IntPtr hWnd, uint flags);
    [DllImport("user32.dll")] static extern int GetWindowLong(IntPtr hWnd, int index);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr hWnd, StringBuilder sb, int max);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr hWnd, StringBuilder sb, int max);
    [DllImport("user32.dll")] static extern int GetWindowTextLength(IntPtr hWnd);
    [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] static extern bool BringWindowToTop(IntPtr hWnd);
    [DllImport("user32.dll")] static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool attach);
    [DllImport("kernel32.dll")] static extern uint GetCurrentThreadId();
    [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr hWnd, int attr, out int value, int size);

    const int SW_MINIMIZE = 6;
    const int SW_RESTORE = 9;
    const uint GW_OWNER = 4;
    const uint GA_ROOTOWNER = 3;
    const int GWL_EXSTYLE = -20;
    const int WS_EX_TOOLWINDOW = 0x80;
    const int DWMWA_CLOAKED = 14;

    static readonly object Gate = new object();
    static readonly HashSet<string> Allowed = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

    // Interface de Windows elle-même : jamais bloquée, sous peine de rendre le PC inutilisable.
    static readonly HashSet<string> SystemProcesses = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
    {
        "ShellExperienceHost", "StartMenuExperienceHost", "SearchHost", "SearchApp", "SearchUI",
        "LockApp", "LogonUI", "consent", "TextInputHost", "ctfmon", "dwm", "csrss", "winlogon",
        "Taskmgr", "SecurityHealthSystray", "SecHealthUI", "ShellHost", "Widgets", "smartscreen",
        "CredentialUIBroker", "PickerHost", "SystemSettingsBroker", "rundll32", "UserOOBEBroker"
    };

    // Seules les fenêtres de l'Explorateur de fichiers sont des « applications » ;
    // la barre des tâches, le bureau et Alt+Tab appartiennent aussi à explorer.exe.
    static readonly HashSet<string> ExplorerAppClasses = new HashSet<string>(StringComparer.Ordinal)
    {
        "CabinetWClass", "ExploreWClass"
    };

    static readonly Dictionary<uint, string> Names = new Dictionary<uint, string>();
    static readonly List<IntPtr> Minimized = new List<IntPtr>();
    static uint selfPid;
    static string selfName = "";
    static IntPtr selfHwnd = IntPtr.Zero;
    static bool active;

    static void Emit(string kind, string a, string b)
    {
        string line = kind;
        if (a != null) line += "\t" + Clean(a);
        if (b != null) line += "\t" + Clean(b);
        Console.Out.WriteLine(line);
        Console.Out.Flush();
    }

    static string Clean(string s)
    {
        return s.Replace('\t', ' ').Replace('\r', ' ').Replace('\n', ' ');
    }

    static string NameOf(uint pid)
    {
        string name;
        if (Names.TryGetValue(pid, out name)) return name;
        try
        {
            using (Process p = Process.GetProcessById((int)pid)) name = p.ProcessName;
        }
        catch
        {
            name = "";
        }
        Names[pid] = name;
        return name;
    }

    static string ClassOf(IntPtr hWnd)
    {
        StringBuilder sb = new StringBuilder(256);
        GetClassName(hWnd, sb, sb.Capacity);
        return sb.ToString();
    }

    static string TitleOf(IntPtr hWnd)
    {
        int len = GetWindowTextLength(hWnd);
        if (len <= 0) return "";
        StringBuilder sb = new StringBuilder(len + 1);
        GetWindowText(hWnd, sb, sb.Capacity);
        return sb.ToString();
    }

    /// Les applications du Store vivent dans une fenêtre d'ApplicationFrameHost :
    /// le vrai processus est celui d'une fenêtre enfant.
    static uint RealPid(IntPtr hWnd, uint pid)
    {
        if (!string.Equals(NameOf(pid), "ApplicationFrameHost", StringComparison.OrdinalIgnoreCase)) return pid;
        uint found = pid;
        EnumChildWindows(hWnd, (child, l) =>
        {
            uint cp;
            GetWindowThreadProcessId(child, out cp);
            if (cp != 0 && cp != pid) { found = cp; return false; }
            return true;
        }, IntPtr.Zero);
        return found;
    }

    static bool ShouldBlock(IntPtr hWnd, out string name, out string title)
    {
        name = "";
        title = "";
        if (hWnd == IntPtr.Zero || hWnd == selfHwnd || !IsWindow(hWnd)) return false;
        uint pid;
        GetWindowThreadProcessId(hWnd, out pid);
        if (pid == 0 || pid == selfPid) return false;
        pid = RealPid(hWnd, pid);
        name = NameOf(pid);
        if (name.Length == 0) return false;
        if (string.Equals(name, selfName, StringComparison.OrdinalIgnoreCase)) return false;
        if (SystemProcesses.Contains(name) || Allowed.Contains(name)) return false;
        if (string.Equals(name, "explorer", StringComparison.OrdinalIgnoreCase) && !ExplorerAppClasses.Contains(ClassOf(hWnd))) return false;
        title = TitleOf(hWnd);
        return true;
    }

    /// Fenêtre principale visible à l'écran : ni outil, ni masquée par DWM, ni réduite, ni sans titre.
    static bool IsOnScreen(IntPtr hWnd)
    {
        if (!IsWindowVisible(hWnd) || IsIconic(hWnd)) return false;
        if (GetWindow(hWnd, GW_OWNER) != IntPtr.Zero) return false;
        if ((GetWindowLong(hWnd, GWL_EXSTYLE) & WS_EX_TOOLWINDOW) != 0) return false;
        int cloaked;
        if (DwmGetWindowAttribute(hWnd, DWMWA_CLOAKED, out cloaked, 4) == 0 && cloaked != 0) return false;
        return GetWindowTextLength(hWnd) > 0;
    }

    static void Block(IntPtr hWnd)
    {
        ShowWindow(hWnd, SW_MINIMIZE);
        if (!Minimized.Contains(hWnd)) Minimized.Add(hWnd);
    }

    /// Ramène TaskHelper devant. Windows refuse le premier plan à un processus
    /// en arrière-plan : on s'attache d'abord à la file d'entrée de la fenêtre active.
    static void FocusSelf()
    {
        if (selfHwnd == IntPtr.Zero || !IsWindow(selfHwnd)) return;
        if (IsIconic(selfHwnd)) ShowWindow(selfHwnd, SW_RESTORE);
        uint ignored;
        uint fgThread = GetWindowThreadProcessId(GetForegroundWindow(), out ignored);
        uint me = GetCurrentThreadId();
        bool attached = fgThread != 0 && fgThread != me && AttachThreadInput(me, fgThread, true);
        BringWindowToTop(selfHwnd);
        SetForegroundWindow(selfHwnd);
        if (attached) AttachThreadInput(me, fgThread, false);
    }

    static List<IntPtr> VisibleBlocked(List<string> names, List<string> titles)
    {
        List<IntPtr> found = new List<IntPtr>();
        EnumWindows((hWnd, l) =>
        {
            string name, title;
            if (IsOnScreen(hWnd) && ShouldBlock(hWnd, out name, out title))
            {
                found.Add(hWnd);
                if (names != null) { names.Add(name); titles.Add(title); }
            }
            return true;
        }, IntPtr.Zero);
        return found;
    }

    static void Sweep()
    {
        foreach (IntPtr hWnd in VisibleBlocked(null, null)) Block(hWnd);
    }

    static int Restore()
    {
        int count = 0;
        // Ordre inverse : la première fenêtre réduite se retrouve au-dessus, comme avant.
        for (int i = Minimized.Count - 1; i >= 0; i--)
        {
            IntPtr hWnd = Minimized[i];
            if (IsWindow(hWnd) && IsIconic(hWnd))
            {
                ShowWindow(hWnd, SW_RESTORE);
                count++;
            }
        }
        Minimized.Clear();
        FocusSelf();
        return count;
    }

    static void Handle(string line)
    {
        int space = line.IndexOf(' ');
        string cmd = space < 0 ? line : line.Substring(0, space);
        string arg = space < 0 ? "" : line.Substring(space + 1);
        lock (Gate)
        {
            switch (cmd)
            {
                case "self":
                    long h;
                    if (long.TryParse(arg, out h)) selfHwnd = new IntPtr(h);
                    break;
                case "allow":
                    Allowed.Clear();
                    foreach (string n in arg.Split('|'))
                    {
                        string t = n.Trim();
                        if (t.EndsWith(".exe", StringComparison.OrdinalIgnoreCase)) t = t.Substring(0, t.Length - 4);
                        if (t.Length > 0) Allowed.Add(t);
                    }
                    break;
                case "on":
                    active = true;
                    Sweep();
                    FocusSelf();
                    break;
                case "off":
                    active = false;
                    break;
                case "scan":
                    List<string> names = new List<string>();
                    List<string> titles = new List<string>();
                    VisibleBlocked(names, titles);
                    for (int i = 0; i < names.Count; i++) Emit("candidate", names[i], titles[i]);
                    Emit("scan-end", null, null);
                    break;
                case "restore":
                    active = false;
                    Emit("restored", Restore().ToString(), null);
                    break;
                case "quit":
                    active = false;
                    Restore();
                    Environment.Exit(0);
                    break;
            }
        }
    }

    static void ReadCommands()
    {
        while (true)
        {
            string line = Console.In.ReadLine();
            if (line == null)
            {
                Handle("quit");
                return;
            }
            line = line.Trim();
            if (line.Length > 0) Handle(line);
        }
    }

    public static void Run(uint pid, string name)
    {
        selfPid = pid;
        selfName = name ?? "";
        Thread reader = new Thread(ReadCommands);
        reader.IsBackground = true;
        reader.Start();
        Emit("ready", null, null);

        long tick = 0;
        while (true)
        {
            Thread.Sleep(150);
            tick++;
            lock (Gate)
            {
                // Les identifiants de processus sont recyclés : le cache ne doit pas vieillir.
                if (tick % 60 == 0) Names.Clear();
                if (!active) continue;
                IntPtr fg = GetAncestor(GetForegroundWindow(), GA_ROOTOWNER);
                string blockedName, blockedTitle;
                if (ShouldBlock(fg, out blockedName, out blockedTitle))
                {
                    Block(fg);
                    FocusSelf();
                    Emit("blocked", blockedName, blockedTitle);
                }
                // Balayage régulier : une fenêtre peut s'afficher sans prendre le premier plan.
                if (tick % 6 == 0) Sweep();
            }
        }
    }
}
