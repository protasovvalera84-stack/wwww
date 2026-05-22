project('nexalink', 'c',
  version: '1.0.0',
  default_options: ['c_std=c17', 'warning_level=1']
)

gtk_dep = dependency('gtk4', version: '>= 4.0')
webkit_dep = dependency('webkitgtk-6.0', required: false)
# Fallback to webkit2gtk-4.1
if not webkit_dep.found()
  webkit_dep = dependency('webkit2gtk-4.1', required: false)
endif
# Fallback to webkit2gtk-4.0
if not webkit_dep.found()
  webkit_dep = dependency('webkit2gtk-4.0', required: false)
endif
soup_dep = dependency('libsoup-3.0')
json_dep = dependency('json-glib-1.0')
sqlite_dep = dependency('sqlite3')
secret_dep = dependency('libsecret-1')
ssl_dep = dependency('openssl')

src = files(
  'src/main.c',
  'src/network/matrix_client.c',
  'src/network/sync_service.c',
  'src/network/media_cache.c',
  'src/network/e2ee.c',
  'src/network/offline_queue.c',
  'src/network/room_operations.c',
  'src/data/database.c',
  'src/data/secure_storage.c',
  'src/ui/webview_window.c',
  'src/ui/login_window.c',
  'src/ui/main_window.c',
  'src/ui/chat_view.c',
  'src/ui/profile_window.c',
  'src/ui/settings_window.c',
  'src/ui/contacts_window.c',
  'src/ui/create_chat_window.c',
  'src/ui/content_window.c',
  'src/ui/group_settings_window.c',
  'src/ui/search_window.c',
  'src/util/helpers.c',
  'src/util/system.c',
)

all_deps = [gtk_dep, soup_dep, json_dep, sqlite_dep, secret_dep, ssl_dep]
if webkit_dep.found()
  all_deps += webkit_dep
  add_project_arguments('-DHAVE_WEBKIT=1', language: 'c')
endif

executable('nexalink', src,
  dependencies: all_deps,
  install: true
)
