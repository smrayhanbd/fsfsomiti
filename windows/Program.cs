// Somiti MS — Windows desktop shell for the Somiti MS web app.
//
// A lightweight (single-file) WinForms + WebView2 wrapper around the Next.js
// deployment, mirroring the Android app (android/MainActivity.kt):
//
//   - Boots to the compiled-in server (https://fsfsomiti.vercel.app) or an
//     address saved by "Change server".
//   - Session-aware entry: no NextAuth session cookie -> /login; session
//     present -> /portal (the web app's middleware routes admins to
//     /dashboard). Cookies persist across launches in a per-app WebView2
//     profile under %LOCALAPPDATA%\SomitiMS.
//   - Server unreachable -> built-in error page with Retry / Change server.
//   - mailto:/tel:/whatsapp: and cross-origin target=_blank links open in
//     the default system browser; same-origin popups reuse the window.
//   - File uploads (deposit slips) and downloads (receipt PDFs, ledger CSV)
//     use WebView2's native file picker + download experience.
//
// Built with the .NET Framework 4.x csc.exe that ships with Windows, in C# 5
// syntax (no string interpolation / null-conditional operators), against the
// Microsoft.Web.WebView2 NuGet assemblies — which are embedded as resources
// so the whole app ships as one SomitiMS.exe.

using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace SomitiMS
{
    internal static class Program
    {
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        private static extern IntPtr LoadLibrary(string fileName);

        [DllImport("kernel32.dll", CharSet = CharSet.Unicode)]
        private static extern IntPtr GetModuleHandle(string moduleName);

        /// <summary>
        /// The WebView2 SDK P/Invokes the NATIVE WebView2Loader.dll by name,
        /// which cannot be satisfied from an embedded managed resource. This
        /// single-file build therefore embeds the x64 loader as a resource,
        /// writes it to %LOCALAPPDATA%\SomitiMS\loader-x64 on first run, and
        /// LoadLibrary()s it by full path — once a module with that name is
        /// in the process, the by-name DllImport resolves to it.
        /// </summary>
        private static void EnsureNativeLoader()
        {
            try
            {
                if (GetModuleHandle("WebView2Loader.dll") != IntPtr.Zero) return;

                byte[] bytes;
                using (Stream s = Assembly.GetExecutingAssembly().GetManifestResourceStream("WebView2Loader.dll"))
                {
                    if (s == null)
                    {
                        Config.Log("native loader resource missing");
                        return;
                    }
                    bytes = new byte[s.Length];
                    int read = 0;
                    while (read < bytes.Length)
                    {
                        int n = s.Read(bytes, read, bytes.Length - read);
                        if (n <= 0) break;
                        read += n;
                    }
                }

                string dir = Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                    "SomitiMS", "loader-x64");
                if (!Directory.Exists(dir)) Directory.CreateDirectory(dir);
                string path = Path.Combine(dir, "WebView2Loader.dll");

                try
                {
                    if (!File.Exists(path) || new FileInfo(path).Length != bytes.Length)
                    {
                        File.WriteAllBytes(path, bytes);
                    }
                }
                catch (IOException)
                {
                    // Locked by a running instance of the same version — the
                    // existing file is byte-identical, just use it.
                }

                if (LoadLibrary(path) == IntPtr.Zero)
                {
                    Config.Log("LoadLibrary(WebView2Loader) failed: " + Marshal.GetLastWin32Error());
                }
                else
                {
                    Config.Log("native loader ready");
                }
            }
            catch (Exception ex)
            {
                Config.Log("EnsureNativeLoader failed: " + ex.Message);
            }
        }

        /// <summary>Single-file build: the two WebView2 managed assemblies
        /// are embedded as "Name.dll" manifest resources and loaded on
        /// demand, so the app is one self-contained .exe.</summary>
        private static Assembly LoadEmbeddedAssembly(object sender, ResolveEventArgs args)
        {
            string name = new AssemblyName(args.Name).Name;
            try
            {
                using (Stream s = Assembly.GetExecutingAssembly().GetManifestResourceStream(name + ".dll"))
                {
                    if (s == null) return null;
                    byte[] bytes = new byte[s.Length];
                    int read = 0;
                    while (read < bytes.Length)
                    {
                        int n = s.Read(bytes, read, bytes.Length - read);
                        if (n <= 0) break;
                        read += n;
                    }
                    return Assembly.Load(bytes);
                }
            }
            catch
            {
                return null;
            }
        }

        [STAThread]
        private static void Main()
        {
            AppDomain.CurrentDomain.AssemblyResolve += LoadEmbeddedAssembly;
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            EnsureNativeLoader();
            Application.Run(new MainForm());
        }
    }

    /// <summary>
    /// Server-URL persistence + a tiny append-only log. The config lives
    /// next to the exe when writable (portable usage) and falls back to
    /// %LOCALAPPDATA%\SomitiMS when it isn't (e.g. under Program Files).
    /// </summary>
    internal static class Config
    {
        internal const string DefaultServerUrl = "https://fsfsomiti.vercel.app";
        internal const string AppVersion = "1.0.0";

        private static string ExeConfigPath
        {
            get { return Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "FSFSomiti.config.json"); }
        }

        private static string LocalConfigPath
        {
            get
            {
                return Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                    "SomitiMS", "FSFSomiti.config.json");
            }
        }

        private static string LogPath
        {
            get
            {
                return Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                    "SomitiMS", "shell.log");
            }
        }

        /// <summary>Saved server URL, or null when the user has never picked
        /// one (the compiled-in default is used in that case).</summary>
        internal static string LoadServerUrl()
        {
            foreach (string path in new string[] { ExeConfigPath, LocalConfigPath })
            {
                try
                {
                    if (!File.Exists(path)) continue;
                    Match m = Regex.Match(File.ReadAllText(path),
                        "\"serverUrl\"\\s*:\\s*\"([^\"]+)\"");
                    if (m.Success)
                    {
                        string url = m.Groups[1].Value.Trim();
                        if (url.Length > 0) return url;
                    }
                }
                catch { }
            }
            return null;
        }

        internal static void SaveServerUrl(string url)
        {
            string json = "{\"serverUrl\": \"" + (url ?? "").Replace("\"", "") + "\"}";
            try
            {
                File.WriteAllText(ExeConfigPath, json);
                return;
            }
            catch { }
            try
            {
                string dir = Path.GetDirectoryName(LocalConfigPath);
                if (!Directory.Exists(dir)) Directory.CreateDirectory(dir);
                File.WriteAllText(LocalConfigPath, json);
            }
            catch { }
        }

        /// <summary>Resolve the server the app should talk to: a saved
        /// choice wins, else the compiled-in deployment.</summary>
        internal static string EffectiveServerUrl()
        {
            string saved = LoadServerUrl();
            if (saved != null) return saved;
            return DefaultServerUrl;
        }

        internal static void Log(string message)
        {
            try
            {
                string dir = Path.GetDirectoryName(LogPath);
                if (!Directory.Exists(dir)) Directory.CreateDirectory(dir);
                if (File.Exists(LogPath))
                {
                    // Keep the log from growing without bound across years of use.
                    FileInfo fi = new FileInfo(LogPath);
                    if (fi.Length > 256 * 1024) fi.Delete();
                }
                File.AppendAllText(LogPath,
                    DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss") + "  " + message + Environment.NewLine);
            }
            catch { }
        }
    }

    /// <summary>
    /// "Server address" dialog — shown from the error page's Change-server
    /// button. Lets members point the shell at a different deployment (e.g.
    /// a LAN dev server) without editing the config file by hand.
    /// </summary>
    internal class SetupForm : Form
    {
        private readonly TextBox _urlBox;
        private bool _accepted;

        internal string ServerUrl { get; private set; }

        internal SetupForm(string current)
        {
            Text = "Somiti MS — Server Address";
            FormBorderStyle = FormBorderStyle.FixedDialog;
            MaximizeBox = false;
            MinimizeBox = false;
            StartPosition = FormStartPosition.CenterParent;
            ClientSize = new Size(460, 150);
            Font = new Font("Segoe UI", 9F);

            Label label = new Label();
            label.Text = "Server address of your Somiti MS deployment:";
            label.Location = new Point(12, 14);
            label.AutoSize = true;
            Controls.Add(label);

            _urlBox = new TextBox();
            _urlBox.Text = current;
            _urlBox.Location = new Point(12, 38);
            _urlBox.Width = 436;
            Controls.Add(_urlBox);

            Label hint = new Label();
            hint.Text = "Examples:  https://fsfsomiti.vercel.app   or   http://192.168.0.100:3000";
            hint.Location = new Point(12, 66);
            hint.AutoSize = true;
            hint.ForeColor = SystemColors.GrayText;
            Controls.Add(hint);

            Button ok = new Button();
            ok.Text = "Connect";
            ok.DialogResult = DialogResult.OK;
            ok.Location = new Point(288, 104);
            ok.Width = 80;
            Controls.Add(ok);

            Button cancel = new Button();
            cancel.Text = "Cancel";
            cancel.DialogResult = DialogResult.Cancel;
            cancel.Location = new Point(372, 104);
            cancel.Width = 76;
            Controls.Add(cancel);

            AcceptButton = ok;
            CancelButton = cancel;

            ok.Click += delegate(object s, EventArgs e)
            {
                string url = _urlBox.Text.Trim().TrimEnd('/');
                if (url.Length == 0)
                {
                    MessageBox.Show(this, "Please enter a server address.", "Somiti MS",
                        MessageBoxButtons.OK, MessageBoxIcon.Information);
                    return;
                }
                if (!url.StartsWith("http://", StringComparison.OrdinalIgnoreCase) &&
                    !url.StartsWith("https://", StringComparison.OrdinalIgnoreCase))
                {
                    url = "https://" + url;
                }
                ServerUrl = url;
                _accepted = true;
                DialogResult = DialogResult.OK;
            };
        }

        protected override void OnFormClosing(FormClosingEventArgs e)
        {
            // Dismissing with the X / Esc means "keep whatever I had".
            if (DialogResult != DialogResult.OK || !_accepted)
            {
                ServerUrl = null;
            }
            base.OnFormClosing(e);
        }
    }

    /// <summary>
    /// The shell window: a borderless host around a WebView2 control that
    /// shows the web app, with the wiring described in the file header.
    /// </summary>
    internal class MainForm : Form
    {
        private readonly WebView2 _webView;
        private string _serverUrl;
        private string _entryUrl;
        private bool _showingErrorPage;

        public MainForm()
        {
            Text = "Somiti MS";
            // Icon is compiled in via /win32icon (the site's favicon).
            Size = new Size(1280, 800);
            MinimumSize = new Size(1000, 640);
            StartPosition = FormStartPosition.CenterScreen;

            _webView = new WebView2();
            _webView.Dock = DockStyle.Fill;
            Controls.Add(_webView);

            Load += async delegate(object s, EventArgs e) { await StartAsync(); };
            FormClosing += delegate(object s, FormClosingEventArgs e) { Config.Log("exit"); };
        }

        private async Task StartAsync()
        {
            _serverUrl = Config.EffectiveServerUrl();
            Config.Log("starting, server=" + _serverUrl + " v" + Config.AppVersion);

            string dataFolder = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "SomitiMS", "WebView2");
            Directory.CreateDirectory(dataFolder);

            try
            {
                CoreWebView2Environment env = await CoreWebView2Environment.CreateAsync(null, dataFolder, null);
                await _webView.EnsureCoreWebView2Async(env);
            }
            catch (Exception ex)
            {
                // Almost always "WebView2 Runtime not installed". Windows 10/11
                // ships it (via Edge), but stripped-down LTSC/Server images may not.
                Config.Log("init failed: " + ex.Message);
                DialogResult dr = MessageBox.Show(this,
                    "The Microsoft WebView2 Runtime is required to run Somiti MS and could not be started.\n\n" +
                    "Would you like to open the Microsoft download page?",
                    "Somiti MS", MessageBoxButtons.YesNo, MessageBoxIcon.Error);
                if (dr == DialogResult.Yes)
                {
                    OpenExternal("https://developer.microsoft.com/microsoft-edge/webview2/");
                }
                Close();
                return;
            }

            WireCoreEvents();
            Config.Log("webview2 ready");
            await NavigateToEntryAsync();
        }

        /// <summary>Fire-and-forget entry navigation used by the retry /
        /// change-server buttons: faults are logged instead of crashing.</summary>
        private void NavigateToEntry()
        {
            Task t = NavigateToEntryAsync();
            t.ContinueWith(delegate(Task done)
            {
                if (done.Exception != null)
                {
                    Config.Log("entry navigation faulted: " + done.Exception.GetBaseException().Message);
                }
            }, TaskContinuationOptions.OnlyOnFaulted);
        }

        private async Task NavigateToEntryAsync()
        {
            string baseUrl = _serverUrl.TrimEnd('/');
            bool hasSession = false;
            try
            {
                IList<CoreWebView2Cookie> cookies = await _webView.CoreWebView2.CookieManager.GetCookiesAsync(baseUrl);
                if (cookies != null)
                {
                    // Matches both next-auth.session-token and the __Secure- variant.
                    hasSession = cookies.Any(c =>
                        c.Name != null && c.Name.Contains("next-auth.session-token"));
                }
            }
            catch (Exception ex)
            {
                Config.Log("cookie check failed: " + ex.Message);
            }

            _entryUrl = hasSession ? baseUrl + "/portal" : baseUrl + "/login";
            Config.Log("entry -> " + _entryUrl + (hasSession ? " (session)" : " (login)"));
            _showingErrorPage = false;
            _webView.CoreWebView2.Navigate(_entryUrl);
        }

        private void WireCoreEvents()
        {
            CoreWebView2 core = _webView.CoreWebView2;
            core.NavigationStarting += OnNavigationStarting;
            // NavigationCompleted fires for top-level document navigations only
            // (iframes report through FrameNavigationCompleted), so a failure
            // here means the page itself didn't load.
            core.NavigationCompleted += OnNavigationCompleted;
            core.NewWindowRequested += OnNewWindowRequested;
            core.WebMessageReceived += OnWebMessageReceived;
        }

        private void OnNavigationStarting(object sender, CoreWebView2NavigationStartingEventArgs e)
        {
            Uri u;
            try { u = new Uri(e.Uri); }
            catch
            {
                e.Cancel = true;
                return;
            }

            if (u.Scheme == Uri.UriSchemeHttp || u.Scheme == Uri.UriSchemeHttps) return;

            // mailto:, tel:, whatsapp:, intent: ... — hand to the OS.
            e.Cancel = true;
            OpenExternal(e.Uri);
        }

        private void OnNavigationCompleted(object sender, CoreWebView2NavigationCompletedEventArgs e)
        {
            if (e.IsSuccess || _showingErrorPage) return;
            Config.Log("navigation failed: " + _entryUrl);
            ShowErrorPage();
        }

        private void OnNewWindowRequested(object sender, CoreWebView2NewWindowRequestedEventArgs e)
        {
            // No popup windows in the shell: same-origin opens reuse this
            // window (e.g. print receipts), anything else goes to the browser.
            e.Handled = true;
            try
            {
                Uri target = new Uri(e.Uri);
                Uri server = new Uri(_serverUrl);
                if (target.Host == server.Host)
                {
                    _showingErrorPage = false;
                    _webView.CoreWebView2.Navigate(e.Uri);
                }
                else
                {
                    OpenExternal(e.Uri);
                }
            }
            catch (Exception ex)
            {
                Config.Log("new-window failed: " + ex.Message);
            }
        }

        private void OnWebMessageReceived(object sender, CoreWebView2WebMessageReceivedEventArgs e)
        {
            string message;
            try { message = e.TryGetWebMessageAsString(); }
            catch { return; }

            if (message == "retry")
            {
                Config.Log("retry");
                NavigateToEntry();
            }
            else if (message == "change")
            {
                Config.Log("change server");
                ChangeServer();
            }
        }

        private void ChangeServer()
        {
            using (SetupForm form = new SetupForm(Config.EffectiveServerUrl()))
            {
                DialogResult dr = form.ShowDialog(this);
                if (dr != DialogResult.OK || form.ServerUrl == null) return;
                _serverUrl = form.ServerUrl;
                Config.SaveServerUrl(_serverUrl);
                Config.Log("server changed -> " + _serverUrl);
            }
            NavigateToEntry();
        }

        /// <summary>Standalone error page (dark, on-brand) shown when the
        /// server can't be reached. Buttons post back over the WebView2
        /// message bridge — no external assets needed.</summary>
        private void ShowErrorPage()
        {
            _showingErrorPage = true;
            string html =
@"<!doctype html>
<html><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'>
<style>
  body{margin:0;font-family:'Segoe UI',system-ui,sans-serif;background:#0f172a;color:#e2e8f0;
       display:flex;align-items:center;justify-content:center;height:100vh}
  .card{max-width:460px;text-align:center;padding:40px}
  h1{font-size:22px;margin:0 0 10px}
  p{color:#94a3b8;line-height:1.6;margin:0 0 28px;font-size:14px;word-break:break-all}
  button{font:inherit;font-weight:600;border:0;border-radius:10px;padding:12px 22px;margin:0 6px;cursor:pointer}
  .retry{background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff}
  .change{background:transparent;color:#a5b4fc;border:1px solid #475569 !important}
  .ver{position:fixed;bottom:14px;left:0;right:0;text-align:center;color:#475569;font-size:12px}
</style></head>
<body><div class='card'>
  <svg width='56' height='56' viewBox='0 0 24 24' fill='none' stroke='#818cf8' stroke-width='1.5'
       style='margin-bottom:18px'><path d='M12 8v4m0 4h.01M10.3 3.3 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.3a2 2 0 0 0-3.4 0Z'/></svg>
  <h1>Can't reach the server</h1>
  <p>" + _entryUrl + @"<br/>Check your internet connection, or the server may be down for maintenance.</p>
  <button class='retry' onclick=""window.chrome.webview.postMessage('retry')"">Retry</button>
  <button class='change' onclick=""window.chrome.webview.postMessage('change')"">Change Server</button>
</div><div class='ver'>Somiti MS for Windows &middot; v" + Config.AppVersion + @"</div>
</body></html>";
            _webView.CoreWebView2.NavigateToString(html);
        }

        private static void OpenExternal(string url)
        {
            try
            {
                Process.Start(new ProcessStartInfo(url) { UseShellExecute = true });
            }
            catch (Exception ex)
            {
                Config.Log("open-external failed: " + ex.Message);
            }
        }
    }
}
