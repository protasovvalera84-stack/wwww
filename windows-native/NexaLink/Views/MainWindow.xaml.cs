using System;
using System.Windows;
using Microsoft.Web.WebView2.Core;

namespace NexaLink.Views
{
    /// <summary>
    /// Windows native shell — loads web UI via WebView2 (Edge Chromium).
    /// 100% identical to web version.
    /// Handles: file downloads, notifications, native bridge.
    /// </summary>
    public partial class MainWindow : Window
    {
        private readonly string _serverUrl;

        public MainWindow()
        {
            InitializeComponent();
            _serverUrl = App.SecureStorage.GetValue("server_url") ?? "https://72-56-244-207.nip.io";
            Loaded += async (_, _) => await InitWebView();
        }

        private async System.Threading.Tasks.Task InitWebView()
        {
            try
            {
                // Initialize WebView2 with user data folder
                var userDataDir = System.IO.Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                    "NexaLink", "WebView2");
                var env = await CoreWebView2Environment.CreateAsync(userDataFolder: userDataDir);
                await webView.EnsureCoreWebView2Async(env);

                // Configure WebView2
                var settings = webView.CoreWebView2.Settings;
                settings.IsScriptEnabled = true;
                settings.AreDefaultScriptDialogsEnabled = true;
                settings.IsWebMessageEnabled = true;
                settings.IsStatusBarEnabled = false;
                settings.AreDevToolsEnabled = false;
                settings.IsPasswordAutosaveEnabled = true;
                settings.IsGeneralAutofillEnabled = true;

                // Handle navigation — keep internal links inside WebView
                webView.CoreWebView2.NavigationStarting += (s, e) =>
                {
                    if (!e.Uri.StartsWith(_serverUrl) && !e.Uri.StartsWith("https://72"))
                    {
                        // Open external links in browser
                        System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo
                        {
                            FileName = e.Uri,
                            UseShellExecute = true
                        });
                        e.Cancel = true;
                    }
                };

                // Handle file downloads
                webView.CoreWebView2.DownloadStarting += (s, e) =>
                {
                    var downloadDir = System.IO.Path.Combine(
                        Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
                        "Downloads");
                    var fileName = System.IO.Path.GetFileName(e.DownloadOperation.ResultFilePath);
                    e.ResultFilePath = System.IO.Path.Combine(downloadDir, fileName);
                    e.Handled = false; // Allow download
                };

                // Native bridge: web JS → Windows native
                webView.CoreWebView2.WebMessageReceived += HandleWebMessage;

                // Inject native detection
                webView.CoreWebView2.NavigationCompleted += async (s, e) =>
                {
                    loadingPanel.Visibility = Visibility.Collapsed;
                    await webView.CoreWebView2.ExecuteScriptAsync(@"
                        window.__NEXALINK_NATIVE = true;
                        window.__NEXALINK_PLATFORM = 'windows';
                        window.__NEXALINK_VERSION = '1.0.0';
                        // Remove PWA install banner
                        var style = document.createElement('style');
                        style.textContent = '[data-pwa-banner]{display:none!important}';
                        document.head.appendChild(style);
                    ");
                };

                // Load app
                webView.CoreWebView2.Navigate(_serverUrl);
            }
            catch (Exception ex)
            {
                // WebView2 not installed — show error with download link
                loadingPanel.Visibility = Visibility.Visible;
                MessageBox.Show(
                    $"WebView2 Runtime not found.\n\nPlease install from:\nhttps://go.microsoft.com/fwlink/p/?LinkId=2124703\n\nError: {ex.Message}",
                    "NexaLink — Missing Component",
                    MessageBoxButton.OK,
                    MessageBoxImage.Warning);
                // Try opening in browser
                System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo
                {
                    FileName = _serverUrl,
                    UseShellExecute = true
                });
            }
        }

        private void HandleWebMessage(object? sender, CoreWebView2WebMessageReceivedEventArgs e)
        {
            var msg = e.TryGetWebMessageAsString();
            if (string.IsNullOrEmpty(msg)) return;

            try
            {
                var json = Newtonsoft.Json.Linq.JObject.Parse(msg);
                var action = json["action"]?.ToString();
                switch (action)
                {
                    case "notification":
                        ShowNotification(json["title"]?.ToString(), json["body"]?.ToString());
                        break;
                    case "copyClipboard":
                        Clipboard.SetText(json["text"]?.ToString() ?? "");
                        break;
                    case "openExternal":
                        var url = json["url"]?.ToString();
                        if (!string.IsNullOrEmpty(url))
                            System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo
                            {
                                FileName = url, UseShellExecute = true
                            });
                        break;
                    case "setTitle":
                        Title = json["title"]?.ToString() ?? "NexaLink";
                        break;
                }
            }
            catch { /* ignore bad messages */ }
        }

        private void ShowNotification(string? title, string? body)
        {
            // Flash taskbar when not focused
            if (!IsActive)
            {
                Title = $"({title}) NexaLink";
                Dispatcher.BeginInvoke(() =>
                {
                    System.Threading.Thread.Sleep(3000);
                    Title = "NexaLink";
                });
            }
        }
    }
}
