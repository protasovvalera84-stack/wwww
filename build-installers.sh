#!/bin/bash
# Build NexaLink installers
# Run on server after git pull: ./build-installers.sh

set -e

echo "Building NexaLink web app..."
npm run build

echo "Building Linux AppImage..."
npx electron-builder --linux AppImage --x64

echo "Copying AppImage to public folder..."
cp release/NexaLink-*.AppImage public/installers/NexaLink.AppImage

echo "Rebuilding with installer included..."
npm run build

echo ""
echo "Done! Installers available at:"
echo "  /installers/NexaLink.AppImage (Linux)"
echo "  /installers/NexaLink-Install.bat (Windows)"
echo "  /installers/NexaLink-Android.html (Android)"
echo "  /installers/NexaLink-iOS.html (iOS)"
