#ifndef WEBVIEW_WINDOW_H
#define WEBVIEW_WINDOW_H
#include <gtk/gtk.h>
#include "../data/secure_storage.h"
void webview_window_show(GtkApplication *app, SecureStorage *storage);
#endif
