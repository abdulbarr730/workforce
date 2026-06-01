using System;
using System.Text;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Windows.Automation;

public class WindowTracker {
    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Auto)]
    public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

    public static void Main() {
        IntPtr hwnd = GetForegroundWindow();
        if (hwnd == IntPtr.Zero) {
            Console.WriteLine("unknown~~~~unknown~~~~");
            return;
        }

        uint pid = 0;
        GetWindowThreadProcessId(hwnd, out pid);
        string processName = "unknown";
        try {
            Process p = Process.GetProcessById((int)pid);
            processName = p.ProcessName;
        } catch {}

        StringBuilder sb = new StringBuilder(256);
        GetWindowText(hwnd, sb, 256);
        string title = sb.ToString();

        string url = "";
        
        // Try getting URL if browser
        string pLower = processName.ToLower();
        if (pLower == "chrome" || pLower == "msedge" || pLower == "brave") {
            try {
                AutomationElement root = AutomationElement.FromHandle(hwnd);
                if (root != null) {
                    Condition orCond = new OrCondition(
                        new PropertyCondition(AutomationElement.ControlTypeProperty, ControlType.Edit),
                        new PropertyCondition(AutomationElement.ControlTypeProperty, ControlType.Document)
                    );
                    AutomationElementCollection elements = root.FindAll(TreeScope.Descendants, orCond);
                    foreach (AutomationElement el in elements) {
                        object patternObj;
                        if (el.TryGetCurrentPattern(ValuePattern.Pattern, out patternObj)) {
                            ValuePattern val = patternObj as ValuePattern;
                            string v = val.Current.Value;
                            if (!string.IsNullOrEmpty(v) && (v.StartsWith("http") || v.Contains("."))) {
                                url = v;
                                break;
                            }
                        }
                    }
                }
            } catch {}
        }

        Console.WriteLine(processName + "~~~~" + title + "~~~~" + url);
    }
}
