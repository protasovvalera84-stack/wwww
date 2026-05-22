/**
 * NexaLink Linux — GTK4 native desktop application.
 * Entry point. Uses WebKitGTK to load web UI (identical to browser version).
 * Falls back to native GTK UI if WebKit not available.
 */

#include <gtk/gtk.h>
#include "network/matrix_client.h"
#include "data/database.h"
#include "data/secure_storage.h"
#include "ui/webview_window.h"

typedef struct {
    GtkApplication *app;
    MatrixClient *client;
    NexaLinkDB *db;
    SecureStorage *storage;
} NexaLinkApp;

static NexaLinkApp *global_app = NULL;

NexaLinkApp *nexalink_app_get(void) { return global_app; }

static void on_activate(GtkApplication *app, gpointer user_data) {
    NexaLinkApp *mapp = (NexaLinkApp *)user_data;

    /* Initialize services */
    mapp->storage = secure_storage_new();
    mapp->db = nexalink_db_new();

    const char *server_url = secure_storage_get(mapp->storage, "server_url");
    if (!server_url) server_url = "https://72-56-244-207.nip.io";
    mapp->client = matrix_client_new(server_url);

    /* Show WebView window — loads web UI */
    webview_window_show(app, mapp->storage);
}

int main(int argc, char *argv[]) {
    NexaLinkApp *mapp = g_new0(NexaLinkApp, 1);
    global_app = mapp;

    mapp->app = gtk_application_new("io.nexalink.app", G_APPLICATION_DEFAULT_FLAGS);
    g_signal_connect(mapp->app, "activate", G_CALLBACK(on_activate), mapp);

    int status = g_application_run(G_APPLICATION(mapp->app), argc, argv);

    if (mapp->client) matrix_client_free(mapp->client);
    if (mapp->db) nexalink_db_free(mapp->db);
    if (mapp->storage) secure_storage_free(mapp->storage);
    g_object_unref(mapp->app);
    g_free(mapp);

    return status;
}
