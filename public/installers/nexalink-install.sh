#!/bin/bash
# NexaLink Installer for Linux
# chmod +x nexalink-install.sh && ./nexalink-install.sh

SERVER_URL="http://72.56.244.207"

echo ""
echo "========================================"
echo "   NexaLink - Decentralized Messenger"
echo "========================================"
echo ""
echo "Installing..."

mkdir -p "$HOME/NexaLink"

cat > "$HOME/NexaLink/nexalink" << LAUNCHER
#!/bin/bash
xdg-open "$SERVER_URL" 2>/dev/null || sensible-browser "$SERVER_URL" 2>/dev/null || firefox "$SERVER_URL" 2>/dev/null || google-chrome "$SERVER_URL" 2>/dev/null
LAUNCHER
chmod +x "$HOME/NexaLink/nexalink"

mkdir -p "$HOME/.local/share/applications"
cat > "$HOME/.local/share/applications/nexalink.desktop" << DESKTOP
[Desktop Entry]
Version=1.0
Name=NexaLink
Comment=Decentralized Encrypted Messenger
Exec=xdg-open $SERVER_URL
Icon=internet-chat
Terminal=false
Type=Application
Categories=Network;InstantMessaging;Chat;
DESKTOP

DESKTOP_DIR=$(xdg-user-dir DESKTOP 2>/dev/null || echo "$HOME/Desktop")
if [ -d "$DESKTOP_DIR" ]; then
    cp "$HOME/.local/share/applications/nexalink.desktop" "$DESKTOP_DIR/"
    chmod +x "$DESKTOP_DIR/nexalink.desktop" 2>/dev/null
    gio set "$DESKTOP_DIR/nexalink.desktop" metadata::trusted true 2>/dev/null
fi

update-desktop-database "$HOME/.local/share/applications" 2>/dev/null

echo ""
echo "Done! Shortcut created on Desktop."
echo "Opening NexaLink now..."
echo ""

xdg-open "$SERVER_URL" 2>/dev/null || sensible-browser "$SERVER_URL" 2>/dev/null || echo "Open $SERVER_URL in your browser"
