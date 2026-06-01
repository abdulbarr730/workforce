
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type @"
  using System;
  using System.Runtime.InteropServices;
  public class Win32Test {
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  }
"@
$hwnd = [Win32Test]::GetForegroundWindow()
$ae = [System.Windows.Automation.AutomationElement]::FromHandle($hwnd)
Write-Output $ae.Current.Name

