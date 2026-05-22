using System.Windows;

namespace NexaLink
{
    /// <summary>
    /// NexaLink Desktop — Windows native WPF application.
    /// Entry point. Shows MainWindow with WebView2 loading the web app.
    /// The web app handles login/register itself.
    /// </summary>
    public partial class App : Application
    {
        public static Services.SecureStorage SecureStorage { get; set; } = null!;
        public static Services.LocalDatabase Database { get; set; } = null!;
        public static Services.MediaCache MediaCache { get; set; } = null!;
        public static Services.MatrixClient MatrixClient { get; set; } = null!;
        public static Services.SyncService SyncService { get; set; } = null!;
        public static Services.NotificationService NotificationService { get; set; } = null!;

        protected override void OnStartup(StartupEventArgs e)
        {
            base.OnStartup(e);

            // Initialize services (background sync + notifications)
            SecureStorage = new Services.SecureStorage();
            Database = new Services.LocalDatabase();
            MediaCache = new Services.MediaCache();
            NotificationService = new Services.NotificationService();

            var serverUrl = SecureStorage.GetValue("server_url") ?? "https://72-56-244-207.nip.io";
            MatrixClient = new Services.MatrixClient(serverUrl);

            // Always show MainWindow — web handles login
            var mainWindow = new Views.MainWindow();
            mainWindow.Show();
        }
    }
}
