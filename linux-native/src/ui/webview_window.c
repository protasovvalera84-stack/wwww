/**
 * WebView Window — loads web UI via WebKitGTK.
 * 100% identical design to web version.
 * Falls back to native GTK4 UI if WebKit not available.
 */

#include <gtk/gtk.h>
#include <string.h>
#include <stdio.h>
#include "../data/secure_storage.h"

#ifdef HAVE_WEBKIT
#include <webkit/webkit.h>
#endif

static const char *get_server_url(SecureStorage *storage) {
    const char *url = secure_storage_get(storage, "server_url");
    return url ? url : "https://72-56-244-207.nip.io";
}

#ifdef HAVE_WEBKIT

/* ===== WebKit implementation ===== */

static void on_load_changed(WebKitWebView *web_view, WebKitLoadEvent event, gpointer user_data) {
    if (event == WEBKIT_LOAD_FINISHED) {
        /* Inject native detection */
        webkit_web_view_evaluate_javascript(
            web_view,
            "window.__NEXALINK_NATIVE=true;"
            "window.__NEXALINK_PLATFORM='linux';"
            "window.__NEXALINK_VERSION='1.0.0';"
            "var s=document.createElement('style');"
            "s.textContent='[data-pwa-banner]{display:none!important}';"
            "document.head.appendChild(s);",
            -1, NULL, NULL, NULL, NULL, NULL
        );
    }
}

static gboolean on_decide_policy(WebKitWebView *web_view, WebKitPolicyDecision *decision,
                                  WebKitPolicyDecisionType type, gpointer user_data) {
    if (type == WEBKIT_POLICY_DECISION_TYPE_NAVIGATION_ACTION) {
        WebKitNavigationAction *action = webkit_navigation_policy_decision_get_navigation_action(
            WEBKIT_NAVIGATION_POLICY_DECISION(decision));
        WebKitURIRequest *request = webkit_navigation_action_get_request(action);
        const char *uri = webkit_uri_request_get_uri(request);
        const char *server_url = (const char *)user_data;

        /* Open external links in browser */
        if (uri && !g_str_has_prefix(uri, server_url) && g_str_has_prefix(uri, "http")) {
            GError *error = NULL;
            gtk_show_uri(NULL, uri, GDK_CURRENT_TIME);
            webkit_policy_decision_ignore(decision);
            return TRUE;
        }
    }
    return FALSE;
}

static void on_permission_request(WebKitWebView *web_view, WebKitPermissionRequest *request, gpointer user_data) {
    /* Auto-grant camera/microphone for WebRTC */
    webkit_permission_request_allow(request);
}

void webview_window_show(GtkApplication *app, SecureStorage *storage) {
    GtkWidget *win = gtk_application_window_new(app);
    gtk_window_set_title(GTK_WINDOW(win), "NexaLink");
    gtk_window_set_default_size(GTK_WINDOW(win), 1200, 750);

    /* WebKit settings */
    WebKitSettings *settings = webkit_settings_new();
    webkit_settings_set_enable_javascript(settings, TRUE);
    webkit_settings_set_enable_javascript_markup(settings, TRUE);
    webkit_settings_set_javascript_can_access_clipboard(settings, TRUE);
    webkit_settings_set_enable_media_stream(settings, TRUE);  /* Camera/mic for calls */
    webkit_settings_set_enable_webrtc(settings, TRUE);
    webkit_settings_set_enable_media_capabilities(settings, TRUE);
    webkit_settings_set_media_playback_requires_user_gesture(settings, FALSE);
    webkit_settings_set_allow_file_access_from_file_urls(settings, TRUE);
    webkit_settings_set_allow_universal_access_from_file_urls(settings, TRUE);
    webkit_settings_set_enable_page_cache(settings, TRUE);
    webkit_settings_set_enable_offline_web_application_cache(settings, TRUE);
    webkit_settings_set_enable_developer_extras(settings, FALSE);

    /* Create WebView */
    WebKitWebView *web_view = WEBKIT_WEB_VIEW(webkit_web_view_new_with_settings(settings));
    g_object_unref(settings);

    /* Connect signals */
    const char *server_url = get_server_url(storage);
    g_signal_connect(web_view, "load-changed", G_CALLBACK(on_load_changed), NULL);
    g_signal_connect(web_view, "decide-policy", G_CALLBACK(on_decide_policy), (gpointer)server_url);
    g_signal_connect(web_view, "permission-request", G_CALLBACK(on_permission_request), NULL);

    gtk_window_set_child(GTK_WINDOW(win), GTK_WIDGET(web_view));

    /* Load web app */
    webkit_web_view_load_uri(web_view, server_url);
    gtk_window_present(GTK_WINDOW(win));
}

#else
/* ===== Fallback: no WebKit — show native GTK UI ===== */
void webview_window_show(GtkApplication *app, SecureStorage *storage) {
    /* WebKit not available — fall back to native UI */
    GtkWidget *win = gtk_application_window_new(app);
    gtk_window_set_title(GTK_WINDOW(win), "NexaLink");
    gtk_window_set_default_size(GTK_WINDOW(win), 400, 300);

    GtkWidget *box = gtk_box_new(GTK_ORIENTATION_VERTICAL, 12);
    gtk_widget_set_margin_start(box, 32);
    gtk_widget_set_margin_end(box, 32);
    gtk_widget_set_valign(box, GTK_ALIGN_CENTER);
    gtk_widget_set_vexpand(box, TRUE);

    GtkWidget *title = gtk_label_new("NexaLink");
    gtk_box_append(GTK_BOX(box), title);

    GtkWidget *msg = gtk_label_new("WebKitGTK not installed.\nOpen in browser:");
    gtk_label_set_justify(GTK_LABEL(msg), GTK_JUSTIFY_CENTER);
    gtk_box_append(GTK_BOX(box), msg);

    const char *server_url = get_server_url(storage);
    char *url_markup = g_strdup_printf("<a href='%s'>%s</a>", server_url, server_url);
    GtkWidget *link = gtk_label_new(NULL);
    gtk_label_set_markup(GTK_LABEL(link), url_markup);
    g_free(url_markup);
    gtk_box_append(GTK_BOX(box), link);

    GtkWidget *btn = gtk_button_new_with_label("Open in Browser");
    g_signal_connect_swapped(btn, "clicked", G_CALLBACK(gtk_show_uri), (gpointer)server_url);
    gtk_box_append(GTK_BOX(box), btn);

    gtk_window_set_child(GTK_WINDOW(win), box);
    gtk_window_present(GTK_WINDOW(win));
}
#endif
